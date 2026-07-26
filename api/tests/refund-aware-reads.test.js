// PR2a — refund-aware Supabase read paths. Drives the REAL dashboard/overview,
// analytics/summary and leads handlers with injected Tinybird reads + a mocked
// Supabase returning webhook-shaped refund fixtures. Asserts (A) refunds never add
// to a COUNT, revenue still nets, the original purchase stays counted, (B) an
// unresolved refund lands in a separate "Unattributed refunds" line not 'direct',
// and CVR denominators/numerators are unaffected.
//
// Fixtures are in-process and webhook-shaped: the RESOLVED refund shares the
// purchase's distinct_id + real source (nightly-derived); the UNRESOLVED refund is a
// phantom REFUND (an orphan Stripe event with no resolvable original) marked via
// custom_properties.refund_attribution='unresolved' + NULL first_touch — the REAL
// marker nightly-attribution.js writes (nightly-attribution.js:1025-1041), on the
// REAL custom_properties jsonb column (baseline_schema.sql:443). This is not to be
// confused with `attribution_status`, a phantom COLUMN that does not exist on
// attributed_conversions at all (see dashboard-overview-conversion-truth.test.js and
// unresolved-refund-not-direct.test.js) — a prior version of this file's fixture used
// that non-existent column name, which a mock happily echoes back regardless of
// whether Postgres could ever produce it. We do NOT use the 12,202 generate_events.js
// seeded refunds.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const dash = await import('../routes/dashboard.js')
const analyticsMod = await import('../routes/analytics.js')
const leadsMod = await import('../routes/leads-server.js')
const { getSupabase } = await import('../lib/supabase.js')

const handlerFor = (router, path, method = 'get') => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.[method])
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const overviewHandler = handlerFor(dash.dashboardRouter, '/overview')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

const NOW = new Date()
const iso = NOW.toISOString()
const day = iso.slice(0, 10)
// Prior period for a 30-day range is [60d, 30d] ago — put prior fixtures ~45d back.
const PRIOR = new Date(NOW.getTime() - 45 * 86400000)
const priorIso = PRIOR.toISOString()
const priorDay = priorIso.slice(0, 10)

// purchase +100 on tiktok; RESOLVED refund -40 (same visitor v1, real source tiktok);
// UNRESOLVED refund -30 (phantom refund, NULL first_touch, custom_properties.refund_attribution='unresolved').
const CURRENT_ROWS = [
  { distinct_id: 'v1', anonymous_id: 'v1', conversion_type: 'purchase', conversion_value: 100,
    first_touch_source: 'tiktok', first_touch_channel: 'Paid Social', last_touch_channel: 'Paid Social', first_touch_campaign: 'q3', status: null, conversion_date: day, conversion_timestamp: iso },
  { distinct_id: 'v1', anonymous_id: 'v1', conversion_type: 'refund', conversion_value: -40,
    first_touch_source: 'tiktok', first_touch_channel: 'Paid Social', last_touch_channel: 'Paid Social', first_touch_campaign: 'q3', status: null, conversion_date: day, conversion_timestamp: iso },
  { distinct_id: 'stripe_refund:pi_x', anonymous_id: null, conversion_type: 'refund', conversion_value: -30,
    custom_properties: { refund_attribution: 'unresolved' },
    first_touch_source: null, first_touch_channel: null, last_touch_channel: null, first_touch_campaign: null, status: null, conversion_date: day, conversion_timestamp: iso }
]

// PRIOR period: a purchase + a refund, both ~45d back. prevConversions must be 1.
const PRIOR_ROWS = [
  { distinct_id: 'v2', anonymous_id: 'v2', conversion_type: 'purchase', conversion_value: 50,
    first_touch_source: 'google', first_touch_channel: 'Paid Search', last_touch_channel: 'Paid Search', first_touch_campaign: null, status: null, conversion_date: priorDay, conversion_timestamp: priorIso },
  { distinct_id: 'v2', anonymous_id: 'v2', conversion_type: 'refund', conversion_value: -20,
    first_touch_source: 'google', first_touch_channel: 'Paid Search', last_touch_channel: 'Paid Search', first_touch_campaign: null, status: null, conversion_date: priorDay, conversion_timestamp: priorIso }
]

// NEGATIVE case: a refund carrying ONLY the phantom `attribution_status` field (no
// custom_properties at all). PostgREST can never produce this shape in prod — the
// column doesn't exist on attributed_conversions — but a mock that echoes fixtures
// verbatim would happily "resolve" it if dashboard.js ever regressed back to reading
// attribution_status. Proves the fix reads the REAL marker, not the phantom one.
const PHANTOM_MARKER_ROWS = [
  { distinct_id: 'v3', anonymous_id: 'v3', conversion_type: 'purchase', conversion_value: 100,
    first_touch_source: 'tiktok', first_touch_channel: 'Paid Social', last_touch_channel: 'Paid Social', first_touch_campaign: 'q3', status: null, conversion_date: day, conversion_timestamp: iso },
  { distinct_id: 'stripe_refund:pi_y', anonymous_id: null, conversion_type: 'refund', conversion_value: -15,
    attribution_status: 'refund_unresolved',
    first_touch_source: null, first_touch_channel: null, last_touch_channel: null, first_touch_campaign: null, status: null, conversion_date: day, conversion_timestamp: iso }
]

// Chainable Supabase stub. The overview handler queries attributed_conversions 3x
// (acRows current, acRowsPrior, convData); return the fixtures for the FIRST call
// (current window) and [] for the rest. campaign_costs → []. sites → a row.
const client = getSupabase()
const realFrom = client.from
function installSupabase (currentRows, priorRows = []) {
  let acCalls = 0
  const thenable = (data) => {
    const b = { select: () => b, eq: () => b, gte: () => b, lte: () => b, order: () => b, limit: () => b,
      maybeSingle: async () => ({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }),
      single: async () => ({ data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }),
      then: (res) => res({ data, error: null }) }
    return b
  }
  client.from = (table) => {
    // /overview Promise.all order: call 1 = acRows (current), call 2 = acRowsPrior.
    if (table === 'attributed_conversions') { acCalls++; return thenable(acCalls === 1 ? currentRows : acCalls === 2 ? priorRows : []) }
    if (table === 'sites') return thenable([{ id: 'site-00', site_key: 'sk', timezone: 'UTC' }])
    return thenable([])
  }
  return () => { client.from = realFrom }
}

const req = (over = {}) => ({ site: { id: 'site-00', business_type: 'saas', timezone: 'UTC' }, query: { days: 30 }, user: { id: 'u1' }, ...over })

// Tinybird deps: bounce_rate → 10 sessions (a fixed CVR denominator); every other pipe → [].
function installTb () {
  dash.__setDashboardReadDeps({
    queryTinybird: async (pipe) => (pipe === 'dashboard_bounce_rate' ? [{ bounce_rate_pct: 20, total_sessions: 10 }] : []),
    queryHog: async () => { throw new Error('HogQL must not be called') }
  })
  return () => dash.__resetDashboardReadDeps()
}

test('dashboard/overview: (A) refunds not counted, revenue nets; (B) unresolved → separate line, not direct; CVR denom intact', async (t) => {
  const restoreDb = installSupabase(CURRENT_ROWS, PRIOR_ROWS)
  const restoreTb = installTb()
  t.after(() => { restoreDb(); restoreTb() })

  const res = mockRes()
  await overviewHandler(req(), res)
  assert.equal(res.statusCode, 200, `body: ${JSON.stringify(res.body).slice(0, 300)}`)
  const { kpis, sources } = res.body.data

  // (A) COUNT: only the purchase counts — both refunds excluded.
  assert.equal(kpis.conversions, 1, 'a refund is NOT an additional conversion; the original purchase remains counted')
  // (A) PRIOR period count also excludes refunds → the delta is not skewed.
  assert.equal(kpis.conversions_prev, 1, 'prevConversions excludes the prior-period refund (1 purchase, refund not counted)')
  // revenue NETS: 100 − 40 − 30 = 30.
  assert.equal(kpis.revenue, 30, 'revenue nets down by both refunds (SUM keeps them)')

  // (B) the unresolved refund is a dedicated line, never 'direct'.
  const unattr = sources.find(s => s.dim_value === 'Unattributed refunds')
  assert.ok(unattr, 'an "Unattributed refunds" line exists')
  assert.equal(unattr.revenue, -30, 'the unresolved refund sits here')
  assert.equal(unattr.conversions, 0, 'and never as a conversion count')
  const direct = sources.find(s => /^direct$/i.test(s.dim_value))
  assert.ok(!direct || direct.revenue >= 0, 'direct is NOT debited the unresolved refund')

  // RESOLVED refund nets its REAL source (tiktok): 100 − 40 = 60, still 1 conversion.
  const acquiring = sources.find(s => s.dim_value !== 'Unattributed refunds' && s.revenue !== 0)
  assert.equal(acquiring.revenue, 60, 'the resolved refund nets against its acquiring source, not stripe/direct')
  assert.equal(acquiring.conversions, 1, 'the source keeps ONE conversion (the purchase), not two')

  // source revenues reconcile to the net total (no money invented or lost).
  assert.equal(sources.reduce((s, x) => s + x.revenue, 0), 30)

  // (CVR) denominator + numerator unaffected: converters = {v1} only (1), sessions = 10.
  // If the phantom refund had leaked into converters, size would be 2 and the rate would differ.
  assert.equal(kpis.conversion_rate, 10, 'converters excludes refunds (1 converter / 10 sessions = 10%)')
})

// 🔴 NEGATIVE CASE — the important one. A refund carrying ONLY the phantom
// `attribution_status` field (no custom_properties) must NOT be treated as unresolved.
// This file's stated purpose (line 4-6 above) has been green through the entire outage:
// its old fixture set `attribution_status: 'refund_unresolved'`, which a mock echoes back
// regardless of whether Postgres could ever produce it — so this suite proved nothing
// about the real bug even across #424, a PR specifically about phantom columns. If
// dashboard.js ever regresses to reading attribution_status again, this is what catches it.
test('dashboard/overview: a refund with ONLY the phantom attribution_status field (no custom_properties) is NOT treated as unresolved', async (t) => {
  const restoreDb = installSupabase(PHANTOM_MARKER_ROWS)
  const restoreTb = installTb()
  t.after(() => { restoreDb(); restoreTb() })

  const res = mockRes()
  await overviewHandler(req(), res)
  assert.equal(res.statusCode, 200, `body: ${JSON.stringify(res.body).slice(0, 300)}`)
  const { sources } = res.body.data

  const unattr = sources.find(s => s.dim_value === 'Unattributed refunds')
  assert.equal(unattr, undefined, 'attribution_status is not a real column and must never route a refund to "Unattributed refunds"')
})

test('leads/: (A) totals exclude refunds from count + distinct converters; revenue still nets', async (t) => {
  const restoreDb = installSupabase(CURRENT_ROWS)
  leadsMod.__setLeadsReadDeps({ queryTinybird: async () => [] })   // leads_list page rows → []; authoritative totals come from Supabase
  t.after(() => { restoreDb(); leadsMod.__resetLeadsReadDeps() })

  const listHandler = handlerFor(leadsMod.leadsRouter, '/')
  const res = mockRes()
  await listHandler({ site: { id: 'site-00', timezone: 'UTC' }, query: {} }, res)
  assert.equal(res.statusCode, 200, `body: ${JSON.stringify(res.body).slice(0, 200)}`)
  const { total, total_conversions, total_revenue } = res.body.data
  assert.equal(total_conversions, 1, 'both refunds excluded from the conversion count; the purchase remains')
  assert.equal(total, 1, 'distinct converters excludes the phantom refund id (v1 counted once)')
  assert.equal(total_revenue, 30, 'revenue nets: 100 − 40 − 30')
})
