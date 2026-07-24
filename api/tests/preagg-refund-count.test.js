// PR2d — extend #382's rule (A) to the FIVE engine readers of attributed_conversions that #382
// missed: getPreAggregatedAttribution + the four multi-touch pre-agg readers (linear / u_shaped /
// time_decay / w_shaped). A refund row (conversion_type='refund') must NOT ADD to any conversion
// count; SUM(conversion_value) is left alone so signed sums net (gross − refund). A refunded order
// is still a conversion that happened, so counts also must not DECREMENT.
//
// For the fraction-based multi-touch readers, "do not count" means the refund's fractional credit
// is NOT ADDED (the row is skipped) — not merely added-as-zero. These tests assert that specific
// behaviour: a refund whose w_shaped/linear/… touches carry fraction=1 adds 0 to the count.
//
// Staging has ZERO refund rows in attributed_conversions, so nothing there exercises this — the
// fixtures below are built in-test and injected through the supabase seam.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { __setSupabaseClient, __resetSupabaseClient } = await import('../lib/supabase.js')
const {
  getPreAggregatedAttribution,
  getLinearAttribution, getUShapedAttribution, getTimeDecayAttribution, getWShapedAttribution
} = await import('../lib/attribution-engine.js')

// A chainable, thenable stub: every query method returns the builder; awaiting it yields {data,error}.
function injectRows (rows) {
  const b = {}
  for (const m of ['select', 'eq', 'gte', 'lte', 'lt', 'not', 'order', 'in', 'is']) b[m] = () => b
  b.then = (resolve) => resolve({ data: rows, error: null })
  __setSupabaseClient({ from: () => b })
}

// One acquiring touch on 'google', full credit. purchase = +100, refund = −100 (inherits the same
// distinct_id → same touchpoints → same 'google' bucket, so revenue nets in-place).
const touch = (attributed_value) => [{ source: 'google', fraction: 1, attributed_value }]
const baseRow = (value, type) => ({
  last_touch_source: 'google', first_touch_source: 'google',
  conversion_value: value, conversion_type: type,
  conversion_date: '2026-06-15', conversion_timestamp: '2026-06-15T12:00:00Z',
  distinct_id: 'visitor-1',
  linear_attribution: touch(value), u_shaped_attribution: touch(value),
  w_shaped_attribution: touch(value), time_decay_attribution: touch(value)
})
const PURCHASE = baseRow(100, 'purchase')
const REFUND = baseRow(-100, 'refund')

const RANGE = { siteId: 'site-x', dateFrom: '2026-06-01', dateTo: '2026-06-30' }
const preagg = (rows, metric) => { injectRows(rows); return getPreAggregatedAttribution({ ...RANGE, model: 'last_touch', groupBy: 'source', metric, timezone: 'UTC' }) }
const MULTI = {
  linear: getLinearAttribution, u_shaped: getUShapedAttribution,
  time_decay: getTimeDecayAttribution, w_shaped: getWShapedAttribution
}
const multi = (fn, rows, metric) => { injectRows(rows); return fn({ ...RANGE, groupBy: 'source', metric }) }
const google = (results) => results.find(r => r.dim_value === 'google')

test.afterEach(() => __resetSupabaseClient())

// ── getPreAggregatedAttribution (per-row +1 count) ────────────────────────────────────────
test('getPreAggregatedAttribution: refund does not add to the conversion count; revenue nets', async () => {
  const g = google(await preagg([PURCHASE, REFUND], 'conversions'))
  assert.equal(g.conversions, 1, 'purchase counts, refund does NOT add')
  assert.equal(g.revenue, 0, 'signed SUM nets 100 + (−100) = 0')
})

test('getPreAggregatedAttribution: purchase-only baseline is unchanged (1 conv, 100 revenue)', async () => {
  const g = google(await preagg([PURCHASE], 'conversions'))
  assert.equal(g.conversions, 1)
  assert.equal(g.revenue, 100)
})

test('getPreAggregatedAttribution: a refund-ONLY bucket is 0 conversions with its negative revenue (never −1)', async () => {
  const g = google(await preagg([REFUND], 'conversions'))
  assert.equal(g.conversions, 0, 'a refund must not add — and must not decrement below the real count')
  assert.equal(g.revenue, -100, 'the negative value still nets the SUM')
})

// ── the four fraction-based multi-touch readers ───────────────────────────────────────────
for (const [name, fn] of Object.entries(MULTI)) {
  test(`${name}: refund's fractional credit is NOT ADDED to the count; revenue nets`, async () => {
    const g = google(await multi(fn, [PURCHASE, REFUND], 'conversions'))
    assert.equal(g.conversions, 1, `${name}: purchase fraction (1) counts; refund fraction (1) is skipped, not added-as-zero`)
    assert.equal(g.revenue, 0, `${name}: signed SUM nets`)
  })

  test(`${name}: purchase-only baseline unchanged (1 conv, 100 revenue)`, async () => {
    const g = google(await multi(fn, [PURCHASE], 'conversions'))
    assert.equal(g.conversions, 1)
    assert.equal(g.revenue, 100)
  })
}
