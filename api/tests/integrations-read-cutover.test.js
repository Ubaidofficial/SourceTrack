// Integrations read-cutover — integrations.js dispatch/fallback tests (D1b-2). Eleven reads route
// through readTb: ten integ_* pipes in the /overview Promise.all, plus google_ads_checklist in
// /google-ads/checklist. D1b-1 left this reader UNTESTED; this file proves it serves from its pipes
// before D1b-2 removes the HogQL fallback.
//
// ERROR-SURFACE (D1b-2 finding): every integrations read is in a main-try Promise.all -> a single
// null pipe rejects the all and surfaces as a LOUD 500 (no inner catch swallows it). So this reader
// closes the fake zero cleanly once the fallback is removed.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/integrations.js')
const router = mod.integrationsRouter
const { __setIntegrationsReadDeps, __resetIntegrationsReadDeps } = mod
const { getSupabase } = await import('../lib/supabase.js')

// checklist runs a Supabase ad_platform_connections lookup alongside the pipe (Promise.all). Stub it
// so the test never dials the mock URL.
const _client = getSupabase()
const _realFrom = _client.from
function installSupabase () {
  const chain = () => {
    const b = { select: () => b, eq: () => b, maybeSingle: () => Promise.resolve({ data: null, error: null }), then: (r) => Promise.resolve({ data: [], error: null }).then(r) }
    return b
  }
  _client.from = () => chain()
}
function restoreSupabase () { _client.from = _realFrom }

const handlerFor = (path) => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.get)
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const overviewHandler = handlerFor('/overview')
const checklistHandler = handlerFor('/google-ads/checklist')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const req = (over = {}) => ({ site: { id: 'site-00', site_key: 'sk_test' }, query: {}, ...over })
const reset = () => { __resetIntegrationsReadDeps(); restoreSupabase(); delete process.env.TINYBIRD_FORCE_READ }

const OVERVIEW_PIPES = [
  'integ_install', 'integ_missing_source', 'integ_campaigns', 'integ_referrers', 'integ_missing_conv',
  'integ_low_activity', 'integ_traffic', 'integ_conversions', 'integ_ai', 'integ_recent',
]

// ── /overview (10 integ_* pipes via Promise.all) ─────────────────────────────
test('(overview-a) DISPATCH: all 10 integ pipes served, tenant-scoped, HogQL NOT called', async (t) => {
  t.after(reset)
  const tbCalls = []
  __setIntegrationsReadDeps({
    queryTinybird: async (pipe, params) => { tbCalls.push({ pipe, params }); return [] }, // all served (empty)
    queryHog: async () => { throw new Error('HogQL called — an integ pipe was not served (zero-fallback violated)') },
  })
  const res = mockRes()
  await overviewHandler(req(), res)
  assert.strictEqual(res.statusCode, 200)
  const pipes = tbCalls.map(c => c.pipe)
  for (const p of OVERVIEW_PIPES) assert.ok(pipes.includes(p), `${p} dispatched`)
  for (const c of tbCalls) assert.strictEqual(c.params.site_id, 'site-00', `${c.pipe} tenant-scoped`)
})

test('(overview-loud-500) D1b-2: one pipe null -> 500 (Promise.all rejects, loud), HogQL fallback DELETED', async (t) => {
  t.after(reset)
  const hog = []
  __setIntegrationsReadDeps({
    queryTinybird: async (pipe) => (pipe === 'integ_install' ? null : []),
    queryHog: async (_s, n) => { hog.push(n); return [] },
  })
  const res = mockRes()
  await overviewHandler(req(), res)
  assert.strictEqual(res.statusCode, 500, 'a null pipe in the Promise.all 500s loud instead of serving HogQL dead-store rows')
  assert.strictEqual(hog.length, 0, 'HogQL was NOT called — the fallback is deleted')
})

// ── /google-ads/checklist (google_ads_checklist pipe + Supabase connection) ──
test('(checklist-a) DISPATCH: google_ads_checklist served, tenant-scoped, HogQL NOT called', async (t) => {
  t.after(reset)
  installSupabase()
  const tbCalls = []
  __setIntegrationsReadDeps({
    queryTinybird: async (pipe, params) => { tbCalls.push({ pipe, params }); return pipe === 'google_ads_checklist' ? [] : null },
    queryHog: async () => { throw new Error('HogQL called — google_ads_checklist pipe was not served') },
  })
  const res = mockRes()
  await checklistHandler(req(), res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(tbCalls[0].pipe, 'google_ads_checklist')
  assert.strictEqual(tbCalls[0].params.site_id, 'site-00', 'tenant-scoped site_id')
})

test('(checklist-loud-500) D1b-2: google_ads_checklist null -> 500 (loud), HogQL fallback DELETED', async (t) => {
  t.after(reset)
  installSupabase()
  const hog = []
  __setIntegrationsReadDeps({
    queryTinybird: async () => null,
    queryHog: async (_s, n) => { hog.push(n); return [] },
  })
  const res = mockRes()
  await checklistHandler(req(), res)
  assert.strictEqual(res.statusCode, 500, 'a null checklist pipe 500s loud')
  assert.strictEqual(hog.length, 0, 'HogQL was NOT called — the fallback is deleted')
})
