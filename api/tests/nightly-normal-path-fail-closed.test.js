// B3 step 2 — the nightly normal path (reads ENABLED) now FAILS CLOSED per-site on a null
// pipe read. Post-#308 a null means the read failed after 3 retries, not a blip. Before this,
// a null fell through to queryPostHog → the dead PostHog store returns [] with no throw →
// { failed:0, queryFailed:false } → the site was absorbed as an empty day, and the run reported
// SUCCESS if any other site served. That silent-under-write on the money rail is the defect here.
//
// Isolation matters: a failed read must NOT throw (that would be caught but the intent is to
// mark the site queryFailed and keep processing the OTHER sites). TOKEN-FREE, NO network.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-personal-key'

const { processSite, computeTerminalStatus, __setNightlyReadDeps, __resetNightlyReadDeps } =
  await import('../jobs/nightly-attribution.js')
const { getSupabase } = await import('../lib/supabase.js')

// A global.fetch spy: queryPostHog is the ONLY thing that reaches global fetch inside processSite
// on these paths (the pipe is injected via __setNightlyReadDeps, and 0 conversions ⇒ no touchpoint
// reads / no writes). So fetchCalls === 0 proves queryPostHog was never invoked.
const realFetch = global.fetch
function spyFetch () {
  let calls = 0
  global.fetch = async () => { calls++; return { ok: false, status: 500, text: async () => '', json: async () => ({ results: [] }) } }
  return () => calls
}
function restoreFetch () { global.fetch = realFetch }

test('a site whose conversions pipe returns null FAILS CLOSED (queryFailed=true) and NEVER calls queryPostHog', async (t) => {
  t.after(__resetNightlyReadDeps)
  t.after(restoreFetch)
  const fetchCalls = spyFetch()
  __setNightlyReadDeps({ tbReadEnabled: () => true, queryPipe: async () => null })

  // Fail-closed must happen BEFORE any DB touch — .from is a tripwire.
  const client = getSupabase()
  const origFrom = client.from
  client.from = () => { throw new Error('DB touched — the fail-closed guard did not return first') }
  t.after(() => { client.from = origFrom })

  const r = await processSite({ id: 's1', site_key: 'sk_a' })
  assert.equal(r.queryFailed, true, 'a failed read is a hard failure')
  assert.equal(r.failed, 0, 'no conversion was attempted, so failed is 0 (queryFailed carries it)')
  assert.equal(r.served, false)
  assert.equal(r.fellBack, true)
  assert.equal(r.processed, 0)
  assert.equal(r.fetched, 0)
  assert.equal(fetchCalls(), 0, 'queryPostHog (the dead-store fallback) MUST NOT be called on a null pipe')
})

test('🔴 a pipe returning [] (served-empty) stays a SUCCESSFUL empty day, NOT a failure (step 2 must not collapse this)', async (t) => {
  t.after(__resetNightlyReadDeps)
  t.after(restoreFetch)
  const fetchCalls = spyFetch()
  __setNightlyReadDeps({ tbReadEnabled: () => true, queryPipe: async () => [] })

  const r = await processSite({ id: 's1', site_key: 'sk_a' })
  assert.equal(r.served, true, '[] is a POSITIVE served signal')
  assert.equal(r.queryFailed, false, 'served-empty is not a failure')
  assert.equal(r.failed, 0)
  assert.equal(r.processed, 0)
  assert.equal(r.fellBack, false)
  assert.equal(fetchCalls(), 0, 'a served-empty result never falls to queryPostHog')
})

test('one site failing its read does NOT abort the loop: the second site is still processed', async (t) => {
  t.after(__resetNightlyReadDeps)
  t.after(restoreFetch)
  spyFetch()
  const readSites = []
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (_pipe, params) => { readSites.push(params.site_id); return params.site_id === 's1' ? null : [] }
  })

  // Mirror main()'s worker: sequential over sites, aggregating per-site results (no abort on failure).
  const sites = [{ id: 's1', site_key: 'a' }, { id: 's2', site_key: 'b' }]
  for (const site of sites) await processSite(site)

  assert.ok(readSites.includes('s1'), 'first site was read')
  assert.ok(readSites.includes('s2'), 'SECOND site was still read — the first site failing did not abort the loop')
})

test('🔴 SILENT-UNDER-WRITE REGRESSION: site1 read fails while site2 serves → the run is FAILED, not success', async (t) => {
  t.after(__resetNightlyReadDeps)
  t.after(restoreFetch)
  spyFetch()
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (_pipe, params) => (params.site_id === 's1' ? null : []) // s1 fails, s2 serves-empty
  })

  const sites = [{ id: 's1', site_key: 'a' }, { id: 's2', site_key: 'b' }]
  let totalProcessed = 0, totalFetched = 0, totalHardFailures = 0
  for (const site of sites) {
    const r = await processSite(site)
    totalProcessed += r.processed
    totalFetched += r.fetched || 0
    if (r.queryFailed) totalHardFailures++
  }

  assert.equal(totalHardFailures, 1, 'site1 read failure is a hard failure (was silently absorbed before B3 step 2)')
  const status = computeTerminalStatus({ processed: totalProcessed, fetched: totalFetched, hardFailures: totalHardFailures })
  assert.equal(status, 'failed', 'ONE failed read must fail the whole run — even though site2 served cleanly')

  // And the pure-function proof that a WRITING site cannot rescue a run with a failed read:
  // processed>0 + hardFailures>0 is still FAILED (hardFailures wins), so the failure is never
  // masked by a genuinely-busy site.
  assert.equal(computeTerminalStatus({ processed: 9, fetched: 9, hardFailures: 1 }), 'failed',
    'a real writing success (processed>0) still reports FAILED when another site read failed')
})
