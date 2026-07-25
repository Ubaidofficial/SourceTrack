// admin.js Tinybird error surface (KNOWN_ISSUES.md #14) — §6 "no fake zeros".
//
// admin.js has exactly SIX readTb call sites, each wrapped in its own inner try/catch.
// Verified by inventory, not assumed from the KI text (the count is right):
//
//   line  route                      pipe                     catch leaves behind        verdict
//   ----  -------------------------  -----------------------  ------------------------  --------
//   248   POST /preview              admin_preview_install    install {status:'error'}   HONEST
//   268   POST /preview              events_health_day        recentEventCount = 0       FAKE
//   347   GET  /preview/:keyOrId     admin_preview_kpis       kpis all-zero              FAKE
//   371   GET  /preview/:keyOrId     admin_preview_sources    sources = []               FAKE
//   394   GET  /preview/:keyOrId     admin_preview_overview   install {status:'error'}   HONEST
//   489   GET  /site-detail          admin_site_detail        installStatus {…'error'}   HONEST
//
// The three HONEST ones carry an explicit error state in the payload and are deliberately
// left alone — they are not lying. The three FAKE ones had no error channel at all: a dead
// pipe rendered as real-looking data ($0 revenue, 0 recent events, "no sources").
//
// WHY PROPAGATE RATHER THAN NULL THE FIELD: the support-preview UI consumes this payload
// through the same hook as the normal dashboard, and useDashboardData.js:150-152 does
//   const kpis = overview?.kpis || {}; const totalRevenue = kpis.revenue || 0
// so a null/absent kpis object still renders 0. Only a failed request removes the fake
// zero from the screen. readTb already throws on a null pipe; these catches swallowed it.
// Each route's OUTER catch already 500s correctly, so the fix is to stop swallowing.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/admin.js')
const router = mod.adminRouter
const { __setAdminReadDeps, __resetAdminReadDeps } = mod
const { getSupabase } = await import('../lib/supabase.js')

const SITE = {
  id: '11111111-2222-3333-4444-555555555555',
  site_key: 'sk_test_admin',
  name: 'Test Site',
  domain: 'example.com',
  plan: 'growth',
  created_at: '2026-01-01T00:00:00Z',
  onboarding_completed: true,
  onboarding_state: {},
  company_id: null,
  owner_id: '99999999-8888-7777-6666-555555555555',
  companies: null,
}

// Stub Supabase so the site lookup resolves and the audit-log insert is a no-op.
const _client = getSupabase()
const _realFrom = _client.from
const _realAuth = _client.auth
function installSupabase () {
  const chain = () => {
    const b = {
      select: () => b, eq: () => b, in: () => b, insert: () => Promise.resolve({ error: null }),
      maybeSingle: () => Promise.resolve({ data: SITE, error: null }),
      single: () => Promise.resolve({ data: SITE, error: null }),
      then: (r) => Promise.resolve({ data: [SITE], error: null, count: 0 }).then(r),
    }
    return b
  }
  _client.from = () => chain()
  _client.auth = { admin: { getUserById: () => Promise.resolve({ data: { user: { email: 'x@y.z' } } }) } }
}
function restoreSupabase () { _client.from = _realFrom; _client.auth = _realAuth }

// Final handler in the route stack — skips the router-level requireRole('super_admin').
const handlerFor = (path, method = 'get') => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.[method])
  assert.ok(layer, `route ${method.toUpperCase()} ${path} must exist`)
  return layer.route.stack[layer.route.stack.length - 1].handle
}

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

const ADMIN_USER = { id: 'admin-1', role: 'super_admin' }
const reset = () => { __resetAdminReadDeps(); restoreSupabase() }

// A dead Tinybird read: queryTinybirdPipe returns null on retry exhaustion (it never throws),
// which makes readTb throw. This is the real production failure mode.
const deadPipe = () => { __setAdminReadDeps({ queryTinybird: async () => null }) }

// Only the named pipe is dead; every other pipe serves an empty (but successful) result.
const deadPipeOnly = (names) => {
  const dead = new Set([].concat(names))
  __setAdminReadDeps({ queryTinybird: async (pipe) => (dead.has(pipe) ? null : []) })
}

// ── GET /preview/:siteKeyOrId — the confirmed instance ────────────────────────

test('GET /preview/:keyOrId — a dead KPI pipe must NOT return 200 with $0 revenue', async (t) => {
  t.after(reset)
  installSupabase()
  deadPipeOnly('admin_preview_kpis')

  const res = mockRes()
  await handlerFor('/preview/:siteKeyOrId')(
    { params: { siteKeyOrId: SITE.site_key }, user: ADMIN_USER, query: {} }, res
  )

  assert.notStrictEqual(res.statusCode, 200,
    'a dead admin_preview_kpis pipe must not be reported as success — that renders as real $0 revenue (§6)')
  assert.strictEqual(res.statusCode, 500)
  assert.strictEqual(res.body.success, false)
  assert.strictEqual(res.body.data, null, 'no fabricated payload may accompany the error')
})

test('GET /preview/:keyOrId — a dead sources pipe must NOT return 200 with an empty source list', async (t) => {
  t.after(reset)
  installSupabase()
  deadPipeOnly('admin_preview_sources')

  const res = mockRes()
  await handlerFor('/preview/:siteKeyOrId')(
    { params: { siteKeyOrId: SITE.site_key }, user: ADMIN_USER, query: {} }, res
  )

  assert.strictEqual(res.statusCode, 500,
    'an empty sources array is indistinguishable from "this site has no revenue sources"')
  assert.strictEqual(res.body.success, false)
})

test('GET /preview/:keyOrId — install keeps its HONEST error state (must stay a 200)', async (t) => {
  t.after(reset)
  installSupabase()
  deadPipeOnly('admin_preview_overview')

  const res = mockRes()
  await handlerFor('/preview/:siteKeyOrId')(
    { params: { siteKeyOrId: SITE.site_key }, user: ADMIN_USER, query: {} }, res
  )

  // This catch is NOT a fake success — it reports status:'error' explicitly. Left alone
  // deliberately; this test pins that so a later sweep does not "fix" it into a 500.
  assert.strictEqual(res.statusCode, 200, 'an explicit error state is honest — do not escalate it')
  assert.strictEqual(res.body.data.install.status, 'error')
})

// ── POST /preview ─────────────────────────────────────────────────────────────

test('POST /preview — a dead recent-events pipe must NOT return 200 with recent_event_count: 0', async (t) => {
  t.after(reset)
  installSupabase()
  deadPipeOnly('events_health_day')

  const res = mockRes()
  await handlerFor('/preview', 'post')({ body: { site_id: SITE.id }, user: ADMIN_USER }, res)

  assert.strictEqual(res.statusCode, 500,
    '0 recent events is a real, actionable number — a dead pipe must not mint it')
  assert.strictEqual(res.body.success, false)
})

test('POST /preview — install keeps its HONEST error state (must stay a 200)', async (t) => {
  t.after(reset)
  installSupabase()
  deadPipeOnly('admin_preview_install')

  const res = mockRes()
  await handlerFor('/preview', 'post')({ body: { site_id: SITE.id }, user: ADMIN_USER }, res)

  assert.strictEqual(res.statusCode, 200, 'an explicit error state is honest — do not escalate it')
  assert.strictEqual(res.body.data.install.status, 'error')
})

// ── GET /site-detail ──────────────────────────────────────────────────────────

test('GET /site-detail — installStatus keeps its HONEST error state (must stay a 200)', async (t) => {
  t.after(reset)
  installSupabase()
  deadPipe()

  const res = mockRes()
  await handlerFor('/site-detail')({ query: { site_key: SITE.site_key }, user: ADMIN_USER }, res)

  // The only Tinybird read in this route already surfaces status:'error' and the derived
  // setup_status_plain stays consistent with it. Nothing to fix here.
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.data.install.status, 'error')
})

// ── Guard: the fixed catches must not be silently reintroduced ────────────────

test('no readTb call site swallows its throw into a fake success value', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const url = await import('node:url')
  const rootDir = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..')
  const src = fs.readFileSync(path.join(rootDir, 'api/routes/admin.js'), 'utf8')

  // The three swallow-comments that marked the fake-success catches. Any of them returning
  // means a dead pipe is being rendered as data again.
  assert.ok(!src.includes('KPI query failed, keep zeroes'),
    'the KPI catch must not swallow a dead pipe back into all-zero kpis')

  // Every remaining `catch { ... }` that touches a Tinybird read must assign an explicit
  // error status, never leave a zero/empty value standing.
  const honest = src.match(/catch \{ *install(?:Info|Status)? = \{ status: 'error'/g) || []
  assert.strictEqual(honest.length, 3,
    'the 3 honest install-status catches must remain exactly as they are (found ' + honest.length + ')')
})
