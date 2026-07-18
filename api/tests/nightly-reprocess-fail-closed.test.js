// B0 (D2) — reprocess (--reprocess-all / --reprocess-site=) is the UNRECOVERABLE data-loss path: it
// DELETEs every attributed_conversions row for a site, then re-INSERTs. It bypasses the Tinybird pipe
// (`usePipe` excludes isReprocess), so its read resolves to the HogQL fallback = the dead PostHog store
// post-D3. Deleting off a dead read would silently wipe the money rail. This proves processSite FAILS
// CLOSED — throws BEFORE the DELETE and BEFORE any Supabase call — on a non-pipe-served reprocess read.
//
// isReprocess is read from process.argv at module load, so argv is set BEFORE the import. node's test
// runner isolates each file in its own process, so this does not leak to other suites. TOKEN-FREE.

import test from 'node:test'
import assert from 'node:assert/strict'

// isReprocess=true at load. The module-load reprocess allowlist requires the staging DB ref +
// --confirm-destructive + --reprocess-site=<de500000> (else it process.exit(1)s at import). The DB
// is never actually touched: the guard throws before any query and the .from tripwire below would
// catch it — SUPABASE_SERVICE_KEY is a mock, so no real staging access is possible either way.
process.argv.push('--reprocess-site=de500000-babe-41d4-a716-446655440000', '--confirm-destructive')

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://nrsvpwzekfrdrzkoecfk.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-key'

const { processSite, __setNightlyReadDeps, __resetNightlyReadDeps } = await import('../jobs/nightly-attribution.js')
const { getSupabase } = await import('../lib/supabase.js')

// A normal (non-suffix) site — in reprocess mode the guard must STILL fire, because reprocess itself
// forces the HogQL/dead-store read. de500000 is the only reprocess-allowed staging site.
const SITE = { id: 'de500000', site_key: 'de500000-babe-41d4-a716-446655440000', attribution_window_days: 30 }

test('reprocess read that is NOT pipe-served → processSite throws FAIL-CLOSED before the DELETE-all, no DB write', async (t) => {
  t.after(__resetNightlyReadDeps)
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async () => { throw new Error('conversions pipe must not be queried in reprocess pre-B2 (usePipe excludes it)') }
  })
  const client = getSupabase()
  const origFrom = client.from
  client.from = () => { throw new Error('DB DELETE/WRITE ATTEMPTED — the fail-closed guard did not fire before the destructive reprocess') }
  t.after(() => { client.from = origFrom })

  await assert.rejects(
    processSite(SITE),
    /FAIL-CLOSED:.*reprocess.*NON-pipe-served/s,
    'a non-pipe-served reprocess read must abort loudly before the DELETE-all'
  )
})
