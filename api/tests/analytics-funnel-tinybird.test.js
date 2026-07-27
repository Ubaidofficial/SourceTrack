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

test('response shape is unchanged: steps[] of { step, visitors, dropoff_rate }', async () => {
  const res = await runFunnel([
    ROW('v1', 'https://x/pricing', T(0)),
    ROW('v1', 'https://x/checkout', T(5))
  ], '/pricing,/checkout')

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.success, true)
  assert.deepStrictEqual(res.body.data, [
    { step: '/pricing', visitors: 1, dropoff_rate: 0 },
    { step: '/checkout', visitors: 1, dropoff_rate: 0 }
  ])
  assert.deepStrictEqual(Object.keys(res.body.data[0]), ['step', 'visitors', 'dropoff_rate'],
    'no key may be added or renamed — the shape is the contract')
})

test('drop-off math matches the Supabase version exactly: 4 -> 1 is 75.0', async () => {
  const rows = []
  for (const v of ['v1', 'v2', 'v3', 'v4']) rows.push(ROW(v, 'https://x/pricing', T(0)))
  rows.push(ROW('v1', 'https://x/checkout', T(5)))

  const res = await runFunnel(rows, '/pricing,/checkout')
  assert.deepStrictEqual(res.body.data, [
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
  assert.deepStrictEqual(res.body.data, [
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
  assert.deepStrictEqual(res.body.data, [
    { step: '/pricing', visitors: 1, dropoff_rate: 0 },
    { step: '/checkout', visitors: 0, dropoff_rate: 100 }
  ])
})

test('a <30min gap keeps one session, so the same two pageviews DO complete', async () => {
  const res = await runFunnel([
    ROW('v1', 'https://x/pricing', T(0)),
    ROW('v1', 'https://x/checkout', T(29))
  ], '/pricing,/checkout')
  assert.strictEqual(res.body.data[1].visitors, 1)
  assert.strictEqual(res.body.data[1].dropoff_rate, 0)
})

test('an acquisition-context change splits the session even inside 30 minutes', async () => {
  // deriveSessions also splits on a new utm_source/medium/campaign. Session 1 has /pricing,
  // session 2 has /checkout, so neither contains both.
  const res = await runFunnel([
    ROW('v1', 'https://x/pricing', T(0), { utm_source: 'google', utm_medium: 'cpc' }),
    ROW('v1', 'https://x/checkout', T(10), { utm_source: 'facebook', utm_medium: 'cpc' })
  ], '/pricing,/checkout')
  assert.deepStrictEqual(res.body.data, [
    { step: '/pricing', visitors: 1, dropoff_rate: 0 },
    { step: '/checkout', visitors: 0, dropoff_rate: 100 }
  ])
})

test('two visitors are never merged, and one session each counts once', async () => {
  const res = await runFunnel([
    ROW('v1', 'https://x/pricing', T(0)), ROW('v1', 'https://x/pricing', T(1)),
    ROW('v1', 'https://x/checkout', T(2)),
    ROW('v2', 'https://x/pricing', T(0))
  ], '/pricing,/checkout')
  assert.deepStrictEqual(res.body.data, [
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
  assert.strictEqual(res.body.data[0].visitors, 0, '/Pricing must not match step "pricing"')
  assert.strictEqual(res.body.data[1].visitors, 0)
  assert.strictEqual(res.body.data[1].dropoff_rate, 100)
})

test('an empty first step short-circuits every later step to 0 / 100', async () => {
  const res = await runFunnel([ROW('v1', 'https://x/home', T(0))], '/nope,/checkout,/thanks')
  assert.deepStrictEqual(res.body.data, [
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
  assert.strictEqual(res.body.data[0].visitors, 1, 'only the one complete row counts')
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
