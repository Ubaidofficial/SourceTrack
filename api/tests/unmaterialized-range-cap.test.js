// PR-B: the genuinely un-materialized report dims — keyword, referrer_domain, custom_param:* — have
// no pre-agg column and no Tinybird pipe, so they always run the live HogQL windowJoin, which 504s at
// volume over long ranges. Instead of always erroring on a 90d keyword report (#180 makes that honest
// but the customer gets NO data), the route CAPS the lookback so the query completes and returns data,
// labeling the served range truthfully. #180's timeout stays as the backstop if even the cap is heavy.
//
// Two layers: (1) BEHAVIOURAL — the pure dim-classifier + range-capper; (2) ROUTE — an un-materialized
// dim over a long range comes back capped + labeled (keyword bypasses the pre-agg and uses the
// injectable HogQL read seam, so this one IS drivable end-to-end through the handler).

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const {
  isUnmaterializedReportDim,
  capUnmaterializedRange,
  UNMATERIALIZED_DIM_MAX_DAYS,
  __setAttributionReadDeps,
  __resetAttributionReadDeps
} = await import('../lib/attribution-engine.js')
const { attribution } = await import('../routes/attribution.js')

const spanDays = (from, to) => Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000)

// ── Layer 1: behavioural ────────────────────────────────────────────────────
test('isUnmaterializedReportDim flags only keyword / referrer_domain / custom_param:*', () => {
  for (const d of ['keyword', 'referrer_domain', 'custom_param:plan', 'custom_param:anything']) {
    assert.strictEqual(isUnmaterializedReportDim(d), true, `${d} is un-materialized`)
  }
  for (const d of ['source', 'medium', 'campaign', 'channel', 'country', 'device', null, undefined]) {
    assert.strictEqual(isUnmaterializedReportDim(d), false, `${d} is materialized/served elsewhere`)
  }
})

test('capUnmaterializedRange trims ONLY un-materialized dims that exceed the cap', () => {
  // keyword over 90d → capped to exactly the cap window
  const long = capUnmaterializedRange({ groupBy: 'keyword', groupBy2: null, dateFrom: '2026-04-02', dateTo: '2026-07-01' })
  assert.strictEqual(long.capped, true, '90d keyword is capped')
  assert.strictEqual(spanDays(long.dateFrom, '2026-07-01'), UNMATERIALIZED_DIM_MAX_DAYS, 'served span == cap')

  // keyword within the cap → untouched
  const short = capUnmaterializedRange({ groupBy: 'keyword', groupBy2: null, dateFrom: '2026-06-11', dateTo: '2026-07-01' })
  assert.strictEqual(short.capped, false, '20d keyword is not capped')
  assert.strictEqual(short.dateFrom, '2026-06-11', 'dateFrom unchanged when within cap')

  // exactly at the cap → not capped (boundary)
  const exact = capUnmaterializedRange({ groupBy: 'keyword', groupBy2: null, dateFrom: '2026-05-31', dateTo: '2026-07-01' })
  assert.strictEqual(spanDays('2026-05-31', '2026-07-01'), 31, 'fixture span is exactly 31')
  assert.strictEqual(exact.capped, false, 'span == cap is allowed (not capped)')

  // cross-tab: an un-materialized SECOND dim also triggers the cap
  const crossTab = capUnmaterializedRange({ groupBy: 'source', groupBy2: 'keyword', dateFrom: '2026-04-02', dateTo: '2026-07-01' })
  assert.strictEqual(crossTab.capped, true, 'source×keyword cross-tab caps on the keyword dim2')

  // custom_param dim over a long range → capped
  const custom = capUnmaterializedRange({ groupBy: 'custom_param:plan', groupBy2: null, dateFrom: '2026-04-02', dateTo: '2026-07-01' })
  assert.strictEqual(custom.capped, true, 'custom_param:* is capped like the others')

  // a MATERIALIZED dim over 90d is never capped (it's served by the pre-agg/pipe, not live HogQL)
  const materialized = capUnmaterializedRange({ groupBy: 'source', groupBy2: null, dateFrom: '2026-04-02', dateTo: '2026-07-01' })
  assert.strictEqual(materialized.capped, false, 'source is materialized → not capped')
  assert.strictEqual(materialized.dateFrom, '2026-04-02', 'materialized dim range untouched')

  // malformed dates degrade gracefully (no throw, no cap)
  const bad = capUnmaterializedRange({ groupBy: 'keyword', groupBy2: null, dateFrom: 'not-a-date', dateTo: '2026-07-01' })
  assert.strictEqual(bad.capped, false, 'invalid date → returned unchanged')
})

// ── Layer 2: route — un-materialized dim over a long range is capped + labeled ──
function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const keywordReq = (dateFrom, dateTo) => ({
  site: { id: 'site-cap-1', plan: 'business', timezone: 'UTC', attribution_window_days: 30 },
  query: { model: 'first_touch', date_from: dateFrom, date_to: dateTo, group_by: 'keyword', metric: 'conversions' }
})
function stubDeps () {
  __setAttributionReadDeps({
    queryTinybird: async () => null,        // force the HogQL leg
    queryHog: async () => []                // keyword → live HogQL; content irrelevant to the cap
  })
}

test('route: 90d keyword report is capped to the cap window and labeled honestly', async () => {
  stubDeps()
  const res = mockRes()
  try { await attribution(keywordReq('2026-04-02', '2026-07-01'), res) } finally { __resetAttributionReadDeps() }

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.success, true)
  assert.strictEqual(res.body.data.range_capped, true, 'long keyword range is flagged capped')
  assert.strictEqual(spanDays(res.body.data.date_from, '2026-07-01'), UNMATERIALIZED_DIM_MAX_DAYS,
    'echoed date_from is the SERVED (capped) range, not the requested one')
  assert.match(res.body.data.range_cap_notice, /last 31 days/, 'notice states the served window truthfully')
})

test('route: a keyword report within the cap is NOT capped or relabeled', async () => {
  stubDeps()
  const res = mockRes()
  try { await attribution(keywordReq('2026-06-11', '2026-07-01'), res) } finally { __resetAttributionReadDeps() }

  assert.strictEqual(res.body.success, true)
  assert.ok(!res.body.data.range_capped, 'within-cap range is not flagged')
  assert.strictEqual(res.body.data.date_from, '2026-06-11', 'requested range is served unchanged')
})
