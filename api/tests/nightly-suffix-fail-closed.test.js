// B0 (D2) — the de400000 `_mv` suffix path is CRON-AUTOMATIC (set by an `else if (site.site_key ===
// 'de400000…')`, no flag) and bypasses the Tinybird pipe (`usePipe` excludes any suffixFilterClause),
// so its conversion read resolves to the HogQL fallback = the dead PostHog store post-D3. This proves
// processSite FAILS CLOSED — throws BEFORE the dead-store read and BEFORE any attributed_conversions
// write — rather than upserting the money rail off an untrusted read. TOKEN-FREE, no network.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-key'

const { processSite, __setNightlyReadDeps, __resetNightlyReadDeps } = await import('../jobs/nightly-attribution.js')
const { getSupabase } = await import('../lib/supabase.js')

const SUFFIX_SITE = { id: 'de400000', site_key: 'de400000-babe-41d4-a716-446655440000', attribution_window_days: 30 }

test('suffix/_mv read that is NOT pipe-served → processSite throws FAIL-CLOSED, no DB write, no dead-store read', async (t) => {
  t.after(__resetNightlyReadDeps)
  // usePipe is false for a suffix site, so the conversions pipe is never attempted → served stays false.
  // A queryPipe tripwire proves the pipe is not (yet — B2) queried on this path.
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async () => { throw new Error('conversions pipe must not be queried on the suffix path pre-B2') }
  })
  // The guard must fire BEFORE any Supabase interaction — make .from() a tripwire.
  const client = getSupabase()
  const origFrom = client.from
  client.from = () => { throw new Error('DB WRITE ATTEMPTED — the fail-closed guard did not fire') }
  t.after(() => { client.from = origFrom })

  await assert.rejects(
    processSite(SUFFIX_SITE),
    /FAIL-CLOSED:.*suffix-filter.*NON-pipe-served/s,
    'a non-pipe-served suffix read must abort loudly before writing the money rail'
  )
})
