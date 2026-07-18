// Admin read-cutover — admin.js dispatch/fallback tests (D1b-2). Six reads route through readTb:
//   admin_preview_install + events_health_day (POST /preview),
//   admin_preview_kpis + admin_preview_sources + admin_preview_overview (GET /preview/:id),
//   admin_site_detail (GET /site-detail).
// D1b-1 left this reader UNTESTED; this file proves it serves from its pipes before D1b-2 removes
// the HogQL fallback.
//
// 🔴 ERROR-SURFACE (D1b-2 finding — admin is a DEGRADER): EVERY admin read sits inside its own
// inner try/catch (admin.js :253/:273/:352/:376/:399/:494) that swallows the read error and keeps
// the endpoint at 200 with degraded data (install status 'error', kpis/sources zeroed). That inner
// catch swallows the throw EVEN under FORCE_READ — so flipping readTb to an unconditional throw does
// NOT turn admin loud, and does NOT close its fake zero at the endpoint. Closing it needs the inner
// catches removed (out of D1b-2 scope). These tests PIN that degrade so it's a documented fact, not
// an assumption; the prod TINYBIRD_FORCE_READ=true fake-zero closer does not reach admin.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/admin.js')
const router = mod.adminRouter
const { __setAdminReadDeps, __resetAdminReadDeps } = mod
const { getSupabase } = await import('../lib/supabase.js')

// A site the sites lookup returns (all fields the three handlers select, incl. the companies join).
const SITE = {
  id: 'site-00', site_key: 'sk_testkey_123', name: 'Test Site', domain: 'test.example',
  plan: 'business', created_at: '2026-01-01T00:00:00Z', company_id: 'co-1', owner_id: 'owner-1',
  onboarding_completed: true, onboarding_state: null, companies: { name: 'Test Co' },
}
// Stub Supabase: sites -> the SITE (via .single()); saved_reports -> count 0; audit_log insert ok;
// auth.admin.getUserById -> no user. Keeps the handlers off the network entirely.
const _client = getSupabase()
const _realFrom = _client.from
const _realAuth = _client.auth
function installSupabase () {
  const chain = () => {
    const b = {
      select: () => b, eq: () => b, order: () => b, limit: () => b, insert: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: SITE, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (r) => Promise.resolve({ data: [], error: null, count: 0 }).then(r),
    }
    return b
  }
  _client.from = () => chain()
  _client.auth = { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } }
}
function restoreSupabase () { _client.from = _realFrom; _client.auth = _realAuth }

const handlerFor = (path, method = 'get') => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.[method])
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const previewHandler = handlerFor('/preview', 'post')          // admin_preview_install, events_health_day
const overviewHandler = handlerFor('/preview/:siteKeyOrId')    // admin_preview_kpis, _sources, _overview
const detailHandler = handlerFor('/site-detail')               // admin_site_detail

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const reset = () => { __resetAdminReadDeps(); restoreSupabase(); delete process.env.TINYBIRD_FORCE_READ }

// ── POST /preview (admin_preview_install + events_health_day) ─────────────────
test('(preview-a) DISPATCH: admin_preview_install + events_health_day served, tenant-scoped, HogQL NOT called', async (t) => {
  t.after(reset)
  installSupabase()
  const tbCalls = []
  __setAdminReadDeps({
    queryTinybird: async (pipe, params) => {
      tbCalls.push({ pipe, params })
      if (pipe === 'admin_preview_install') return [{ event_type: '$pageview', timestamp: '2026-07-10T10:00:00Z' }]
      if (pipe === 'events_health_day') return [{ cnt: 3 }]
      return null
    },
    queryHog: async () => { throw new Error('HogQL called — an admin pipe was not served (zero-fallback violated)') },
  })
  const res = mockRes()
  await previewHandler({ body: { site_id: 'site-00' } }, res)
  assert.strictEqual(res.statusCode, 200)
  const pipes = tbCalls.map(c => c.pipe)
  assert.ok(pipes.includes('admin_preview_install'), 'admin_preview_install dispatched')
  assert.ok(pipes.includes('events_health_day'), 'events_health_day dispatched')
  for (const c of tbCalls) assert.strictEqual(c.params.site_id, 'site-00', `${c.pipe} tenant-scoped`)
  assert.strictEqual(res.body.data.install.status, 'verified', 'served install pipe row -> verified')
})

test('(preview-DEGRADE) admin_preview_install null -> 200 with install.status="error" (inner catch swallows; HogQL DELETED)', async (t) => {
  t.after(reset)
  installSupabase()
  const hog = []
  __setAdminReadDeps({
    queryTinybird: async (pipe) => (pipe === 'admin_preview_install' ? null : [{ cnt: 0 }]),
    queryHog: async (_s, n) => { hog.push(n); return [] },
  })
  const res = mockRes()
  await previewHandler({ body: { site_id: 'site-00' } }, res)
  // FINDING: admin's inner try/catch (admin.js:253) swallows the readTb throw. The endpoint stays
  // 200 and renders install.status='error' — NOT a loud 500. The flip removes the dead HogQL read
  // (asserted below) but does NOT close the degrade at the endpoint; removing the inner catch would
  // (out of D1b-2 scope). Even prod TINYBIRD_FORCE_READ=true cannot reach admin — the catch is inside.
  assert.strictEqual(res.statusCode, 200, 'admin degrades (inner catch swallows the throw), never 500')
  assert.strictEqual(res.body.data.install.status, 'error', 'install degrades to status="error", not a dead-store zero')
  assert.strictEqual(hog.length, 0, 'HogQL was NOT called — the fallback is deleted')
})

// ── GET /preview/:siteKeyOrId (admin_preview_kpis + _sources + _overview) ─────
test('(overview-a) DISPATCH: kpis + sources + overview pipes served, tenant-scoped, HogQL NOT called', async (t) => {
  t.after(reset)
  installSupabase()
  const tbCalls = []
  __setAdminReadDeps({
    queryTinybird: async (pipe, params) => {
      tbCalls.push({ pipe, params })
      if (pipe === 'admin_preview_kpis') return [{ revenue: 100, conversions: 4, sessions: 40, leads: 10 }]
      if (pipe === 'admin_preview_sources') return [{ source: 'google', revenue: 100, conversions: 4 }]
      if (pipe === 'admin_preview_overview') return [{ event_type: '$pageview', timestamp: '2026-07-10T10:00:00Z' }]
      return null
    },
    queryHog: async () => { throw new Error('HogQL called — an admin preview pipe was not served') },
  })
  const res = mockRes()
  await overviewHandler({ params: { siteKeyOrId: 'site-00' } }, res)
  assert.strictEqual(res.statusCode, 200)
  const pipes = tbCalls.map(c => c.pipe)
  for (const p of ['admin_preview_kpis', 'admin_preview_sources', 'admin_preview_overview']) assert.ok(pipes.includes(p), `${p} dispatched`)
  for (const c of tbCalls) assert.strictEqual(c.params.site_id, 'site-00', `${c.pipe} tenant-scoped`)
  assert.strictEqual(res.body.data.kpis.revenue, 100, 'kpis served from the pipe')
})

test('(overview-DEGRADE) admin_preview_kpis null -> 200 with kpis zeroed (inner catch swallows; HogQL DELETED)', async (t) => {
  t.after(reset)
  installSupabase()
  const hog = []
  __setAdminReadDeps({
    queryTinybird: async (pipe) => (pipe === 'admin_preview_kpis' ? null : []),
    queryHog: async (_s, n) => { hog.push(n); return [] },
  })
  const res = mockRes()
  await overviewHandler({ params: { siteKeyOrId: 'site-00' } }, res)
  // FINDING: admin.js:352 ('keep zeroes') swallows the throw -> kpis stay 0 at 200. Fake zero NOT
  // closed by the flip; the inner catch must be removed to make it honest.
  assert.strictEqual(res.statusCode, 200, 'admin degrades (inner catch), never 500')
  assert.strictEqual(res.body.data.kpis.revenue, 0, 'kpis degrade to 0 (flagged fake zero survivor)')
  assert.strictEqual(hog.length, 0, 'HogQL was NOT called — the fallback is deleted')
})

// ── GET /site-detail (admin_site_detail) ─────────────────────────────────────
test('(detail-a) DISPATCH: admin_site_detail served, tenant-scoped, HogQL NOT called', async (t) => {
  t.after(reset)
  installSupabase()
  const tbCalls = []
  __setAdminReadDeps({
    queryTinybird: async (pipe, params) => { tbCalls.push({ pipe, params }); return pipe === 'admin_site_detail' ? [{ event_type: '$pageview', timestamp: '2026-07-10T10:00:00Z', page_url: 'https://test.example/p' }] : null },
    queryHog: async () => { throw new Error('HogQL called — admin_site_detail pipe was not served') },
  })
  const res = mockRes()
  await detailHandler({ query: { site_key: 'sk_testkey_123' } }, res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(tbCalls[0].pipe, 'admin_site_detail')
  assert.strictEqual(tbCalls[0].params.site_id, 'site-00', 'tenant-scoped site_id')
  assert.strictEqual(res.body.data.install.status, 'verified', 'served detail pipe row -> verified')
})

test('(detail-DEGRADE) admin_site_detail null -> 200 with install.status="error" (inner catch swallows; HogQL DELETED)', async (t) => {
  t.after(reset)
  installSupabase()
  const hog = []
  __setAdminReadDeps({
    queryTinybird: async () => null,
    queryHog: async (_s, n) => { hog.push(n); return [] },
  })
  const res = mockRes()
  await detailHandler({ query: { site_key: 'sk_testkey_123' } }, res)
  // FINDING: admin.js:494 swallows the throw -> installStatus='error' at 200, not a loud 500.
  assert.strictEqual(res.statusCode, 200, 'admin degrades (inner catch), never 500')
  assert.strictEqual(res.body.data.install.status, 'error', 'install degrades to status="error"')
  assert.strictEqual(hog.length, 0, 'HogQL was NOT called — the fallback is deleted')
})
