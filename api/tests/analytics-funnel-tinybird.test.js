// GET /analytics/funnel — repointed from Supabase `pageviews` to the Tinybird summary pipe.
//
// The old handler ran ILIKE-style substring queries against `pageviews.session_id`, but
// `pageviews` is EMPTY BY DESIGN (CLAUDE.md §5 — analytics reads come from Tinybird), so
// every step returned 0 for every site. Verified live: `select count(*) from pageviews` on
// prod (zxjjjsipafojhzkkumvh) is 0 rows.
//
// These tests pin the two things the repoint must not change — the step-to-step
// visitor/drop-off math and the response shape — and the one thing it deliberately does
// change: the identity a "funnel completion" is scoped to is now a session DERIVED by
// deriveSessions() from Tinybird events, not a Supabase session_id column.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/analytics.js')
const { __setAnalyticsReadDeps, __resetAnalyticsReadDeps } = mod
const { FEATURE_MATRIX } = await import('../lib/plan-features.js')

const funnelHandler = (() => {
  const layer = mod.default.stack.find(l => l.route?.path === '/funnel' && l.route?.methods?.get)
  assert.ok(layer, 'GET /funnel must be registered')
  return layer.route.stack[layer.route.stack.length - 1].handle
})()

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

// KEPT after the gate opened, on purpose. funnels_cohorts is now true on every paid tier, so
// runFunnel's `plan: 'growth'` would pass the gate unaided — but lifting it anyway keeps the
// MATH tests independent of the entitlement matrix, so a future packaging change cannot turn
// them red for a reason that has nothing to do with funnel arithmetic. Gate behaviour itself
// is asserted separately, against the real matrix, in the gate test above.
function liftGate () {
  const prev = { ...FEATURE_MATRIX.funnels_cohorts }
  Object.keys(FEATURE_MATRIX.funnels_cohorts).forEach(k => { FEATURE_MATRIX.funnels_cohorts[k] = true })
  return () => Object.assign(FEATURE_MATRIX.funnels_cohorts, prev)
}

// A summary-pipe row. Column names are the pipe's aliases: page_url -> url,
// distinct_id -> anonymous_id (tinybird/pipes/summary.pipe:76-87).
const ROW = (anonymous_id, url, timestamp, over = {}) => ({
  url, referrer: null, utm_source: null, utm_medium: null, utm_campaign: null,
  country: null, device: 'desktop', browser: 'Chrome', os: 'Windows', ai_source: null,
  anonymous_id, timestamp, ...over
})

// Every math test drives the handler with the gate lifted — see liftGate() above for why.
async function runFunnel (rows, steps) {
  __setAnalyticsReadDeps({ queryTinybird: async () => rows })
  const restore = liftGate()
  try {
    const res = mockRes()
    await funnelHandler({ site: { id: 'site-1', plan: 'growth' }, query: { steps, days: '30' } }, res)
    return res
  } finally {
    restore()
    __resetAnalyticsReadDeps()
  }
}

const T = (min) => new Date(Date.UTC(2026, 6, 10, 10, min, 0)).toISOString()

// ── the gate, stated as a fact rather than assumed ───────────────────────────

// The gate is now OPEN on paid tiers and still shut on free. It was false everywhere while
// the endpoint was dead twice over (empty `pageviews` read + no UI caller); the repoint fixed
// the first and the Analytics Funnels section fixed the second, so the entitlement opened.
test('funnels_cohorts gate: every PAID tier passes, free still 402s before any read', async () => {
  // free is blocked before any read — no stub needed, it never gets that far.
  const freeRes = mockRes()
  await funnelHandler({ site: { id: 'site-1', plan: 'free' }, query: { steps: '/a,/b' } }, freeRes)
  assert.strictEqual(freeRes.statusCode, 402, 'free must stay gated out — a funnel run is a 50k-row read')
  assert.strictEqual(freeRes.body.upgrade.required_feature, 'funnels_cohorts')

  // Paid tiers reach the handler. Served-empty (not null) so the read succeeds and the
  // assertion is about the GATE, not about what the pipe returned.
  __setAnalyticsReadDeps({ queryTinybird: async () => [] })
  try {
    for (const plan of ['trial', 'starter', 'growth', 'scale']) {
      const res = mockRes()
      await funnelHandler({ site: { id: 'site-1', plan }, query: { steps: '/a,/b' } }, res)
      assert.notStrictEqual(res.statusCode, 402, `${plan}: funnels must not be gated out`)
      assert.strictEqual(res.statusCode, 200, `${plan}: handler should serve once past the gate`)
    }
  } finally {
    __resetAnalyticsReadDeps()
  }
})

// ── shape + math ─────────────────────────────────────────────────────────────

test('per-step shape is unchanged: { step, visitors, dropoff_rate } under data.steps', async () => {
  const res = await runFunnel([
    ROW('v1', 'https://x/pricing', T(0)),
    ROW('v1', 'https://x/checkout', T(5))
  ], '/pricing,/checkout')

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.success, true)
  assert.deepStrictEqual(res.body.data.steps, [
    { step: '/pricing', visitors: 1, dropoff_rate: 0 },
    { step: '/checkout', visitors: 1, dropoff_rate: 0 }
  ])
  assert.deepStrictEqual(Object.keys(res.body.data.steps[0]), ['step', 'visitors', 'dropoff_rate'],
    'no key may be added or renamed — the shape is the contract')
})

test('drop-off math matches the Supabase version exactly: 4 -> 1 is 75.0', async () => {
  const rows = []
  for (const v of ['v1', 'v2', 'v3', 'v4']) rows.push(ROW(v, 'https://x/pricing', T(0)))
  rows.push(ROW('v1', 'https://x/checkout', T(5)))

  const res = await runFunnel(rows, '/pricing,/checkout')
  assert.deepStrictEqual(res.body.data.steps, [
    { step: '/pricing', visitors: 4, dropoff_rate: 0 },
    { step: '/checkout', visitors: 1, dropoff_rate: 75 }
  ])
})

test('step order does not matter WITHIN a session — same as the old .in(session_id) query', async () => {
  // The Supabase version never enforced chronology between steps: it asked "does this
  // session also contain a match". Reaching /checkout before /pricing still counted, and
  // that behaviour is preserved deliberately.
  const res = await runFunnel([
    ROW('v1', 'https://x/checkout', T(0)),
    ROW('v1', 'https://x/pricing', T(5))
  ], '/pricing,/checkout')
  assert.deepStrictEqual(res.body.data.steps, [
    { step: '/pricing', visitors: 1, dropoff_rate: 0 },
    { step: '/checkout', visitors: 1, dropoff_rate: 0 }
  ])
})

// ── the derived session is the identity ──────────────────────────────────────

test('a >30min gap splits the visitor into 2 sessions, so the funnel does NOT complete', async () => {
  // THE behavioural difference vs a naive per-visitor grouping. deriveSessions' 30-minute
  // inactivity rule (sessionization.js) puts these two pageviews in different sessions, so
  // no single session contains both steps.
  const res = await runFunnel([
    ROW('v1', 'https://x/pricing', T(0)),
    ROW('v1', 'https://x/checkout', T(45))
  ], '/pricing,/checkout')
  assert.deepStrictEqual(res.body.data.steps, [
    { step: '/pricing', visitors: 1, dropoff_rate: 0 },
    { step: '/checkout', visitors: 0, dropoff_rate: 100 }
  ])
})

test('a <30min gap keeps one session, so the same two pageviews DO complete', async () => {
  const res = await runFunnel([
    ROW('v1', 'https://x/pricing', T(0)),
    ROW('v1', 'https://x/checkout', T(29))
  ], '/pricing,/checkout')
  assert.strictEqual(res.body.data.steps[1].visitors, 1)
  assert.strictEqual(res.body.data.steps[1].dropoff_rate, 0)
})

test('differing UTMs inside 30 minutes DO NOT split funnel sessions (Option B 30-min inactivity rule)', async () => {
  // deriveFunnelSessions ignores acquisition-context changes, so a visitor clicking a different UTM
  // mid-visit within 30 minutes remains in a single continuous browsing session and completes the funnel.
  const res = await runFunnel([
    ROW('v1', 'https://x/pricing', T(0), { utm_source: 'google', utm_medium: 'cpc' }),
    ROW('v1', 'https://x/checkout', T(10), { utm_source: 'facebook', utm_medium: 'cpc' })
  ], '/pricing,/checkout')
  assert.deepStrictEqual(res.body.data.steps, [
    { step: '/pricing', visitors: 1, dropoff_rate: 0 },
    { step: '/checkout', visitors: 1, dropoff_rate: 0 }
  ])
})

test('differing click IDs or missing click-ID properties inside 30 minutes DO NOT split funnel sessions', async () => {
  // Confirms the parameter gap (click IDs missing in summary pipe vs deriveSessions) is moot:
  // deriveFunnelSessions sessionizes on 30-min inactivity gap only.
  const res = await runFunnel([
    ROW('v1', 'https://x/pricing', T(0), { gclid: 'click_abc123' }),
    ROW('v1', 'https://x/checkout', T(15), { fbclid: 'click_xyz789' })
  ], '/pricing,/checkout')
  assert.deepStrictEqual(res.body.data.steps, [
    { step: '/pricing', visitors: 1, dropoff_rate: 0 },
    { step: '/checkout', visitors: 1, dropoff_rate: 0 }
  ])
})

test('two visitors are never merged, and one session each counts once', async () => {
  const res = await runFunnel([
    ROW('v1', 'https://x/pricing', T(0)), ROW('v1', 'https://x/pricing', T(1)),
    ROW('v1', 'https://x/checkout', T(2)),
    ROW('v2', 'https://x/pricing', T(0))
  ], '/pricing,/checkout')
  assert.deepStrictEqual(res.body.data.steps, [
    { step: '/pricing', visitors: 2, dropoff_rate: 0 },
    { step: '/checkout', visitors: 1, dropoff_rate: 50 }
  ])
})

// ── preserved edge cases ─────────────────────────────────────────────────────

test('matching is case-SENSITIVE — .like() was used, not .ilike()', async () => {
  const res = await runFunnel([
    ROW('v1', 'https://x/Pricing', T(0)),
    ROW('v1', 'https://x/checkout', T(5))
  ], 'pricing,checkout')
  assert.strictEqual(res.body.data.steps[0].visitors, 0, '/Pricing must not match step "pricing"')
  assert.strictEqual(res.body.data.steps[1].visitors, 0)
  assert.strictEqual(res.body.data.steps[1].dropoff_rate, 100)
})

test('an empty first step short-circuits every later step to 0 / 100', async () => {
  const res = await runFunnel([ROW('v1', 'https://x/home', T(0))], '/nope,/checkout,/thanks')
  assert.deepStrictEqual(res.body.data.steps, [
    { step: '/nope', visitors: 0, dropoff_rate: 0 },
    { step: '/checkout', visitors: 0, dropoff_rate: 100 },
    { step: '/thanks', visitors: 0, dropoff_rate: 100 }
  ])
})

test('fewer than 2 steps is still a 400', async () => {
  const res = mockRes()
  const restore = liftGate()
  try {
    await funnelHandler({ site: { id: 'site-1', plan: 'growth' }, query: { steps: '/only' } }, res)
  } finally { restore() }
  assert.strictEqual(res.statusCode, 400)
})

test('rows with no visitor id or no timestamp are skipped, never bucketed as one visitor', async () => {
  const res = await runFunnel([
    ROW(null, 'https://x/pricing', T(0)),
    ROW('v1', 'https://x/pricing', null),
    ROW('v2', 'https://x/pricing', T(0))
  ], '/pricing,/checkout')
  assert.strictEqual(res.body.data.steps[0].visitors, 1, 'only the one complete row counts')
})

// ── dead store must stay loud ────────────────────────────────────────────────

test('a dead pipe read is a 500, never a fabricated empty funnel', async () => {
  __setAnalyticsReadDeps({ queryTinybird: async () => null })
  const restore = liftGate()
  try {
    const res = mockRes()
    await funnelHandler({ site: { id: 'site-1', plan: 'growth' }, query: { steps: '/a,/b' } }, res)
    assert.strictEqual(res.statusCode, 500, 'null = pipe not serving; §6 forbids answering with zeros')
    assert.strictEqual(res.body.success, false)
  } finally {
    restore()
    __resetAnalyticsReadDeps()
  }
})

// ── Truncation honesty (fix/funnel-pageview-truncation) ──────────────────────
// The read is capped at FUNNEL_ROW_CAP rows. Before this change the handler
// reported on whatever slice came back with no signal that anything was missing,
// so a high-traffic site got a confident, wrong conversion rate. These tests pin
// the DETECTION, not the cap value — the cap stays where it is on purpose.

const { FUNNEL_ROW_CAP } = mod

// Build n rows for one visitor that complete a 2-step funnel, so the math is
// incidental and the assertions are purely about the truncation flag.
function nRows (n) {
  const out = []
  for (let i = 0; i < n; i++) {
    out.push(ROW(`v${i}`, i % 2 === 0 ? 'https://x/pricing' : 'https://x/checkout', T(i % 60)))
  }
  return out
}

test('the cap is a real exported constant, not a literal duplicated in the test', () => {
  assert.strictEqual(typeof FUNNEL_ROW_CAP, 'number')
  assert.ok(FUNNEL_ROW_CAP > 0)
})

test('a read UNDER the cap reports truncated:false and the true row count', async () => {
  const res = await runFunnel(nRows(10), '/pricing,/checkout')
  assert.strictEqual(res.body.data.truncated, false)
  assert.strictEqual(res.body.data.sample_size, 10)
  assert.strictEqual(res.body.data.row_cap, FUNNEL_ROW_CAP)
})

test('a read that fills the cap EXACTLY reports truncated:true — ON the cap is indistinguishable from clipped', async () => {
  const res = await runFunnel(nRows(FUNNEL_ROW_CAP), '/pricing,/checkout')
  assert.strictEqual(res.body.data.truncated, true,
    'exactly-at-cap must be reported as possibly-incomplete, never as complete')
  assert.strictEqual(res.body.data.sample_size, FUNNEL_ROW_CAP)
})

test('one row below the cap is still reported as complete — the boundary is not off by one', async () => {
  const res = await runFunnel(nRows(FUNNEL_ROW_CAP - 1), '/pricing,/checkout')
  assert.strictEqual(res.body.data.truncated, false)
})

test('an empty read is complete, not truncated — 0 rows is a real answer', async () => {
  const res = await runFunnel([], '/pricing,/checkout')
  assert.strictEqual(res.body.data.truncated, false)
  assert.strictEqual(res.body.data.sample_size, 0)
})

test('the truncation flag travels INSIDE data, where fetchApi can reach it', async () => {
  // fetchApi() returns `data.data` and discards siblings, so a top-level flag next to
  // `data` would be silently dropped on the way to the UI. This pins that it is not.
  const res = await runFunnel(nRows(FUNNEL_ROW_CAP), '/pricing,/checkout')
  assert.deepStrictEqual(
    Object.keys(res.body.data).sort(),
    ['row_cap', 'sample_size', 'steps', 'truncated']
  )
  assert.strictEqual(res.body.truncated, undefined, 'must NOT be a sibling of data — fetchApi would drop it')
})

test('the funnel still returns real step math when truncated — a caveat, not an error', async () => {
  const res = await runFunnel(nRows(FUNNEL_ROW_CAP), '/pricing,/checkout')
  assert.strictEqual(res.statusCode, 200, 'truncation is not a failure')
  assert.ok(res.body.data.steps.length === 2)
  assert.ok(res.body.data.steps[0].visitors > 0, 'the numbers are real, just a floor')
})
