// Phase 9 — offline unit coverage for the models 7/8/9 aggregate-parity logic
// (first_touch / first_touch_non_direct / last_touch_non_direct). Pure funcs,
// no credentials/network. Mirrors the pipe SQL semantics + spec §3 journeys.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
if (!process.env.POSTHOG_API_KEY) process.env.POSTHOG_API_KEY = 'mock-unused-by-agg-models-test'

const {
  creditFirstTouch, creditFirstTouchNonDirect, creditLastTouchNonDirect,
  aggregateModelCredits, compareAggregateBuckets
} = await import('../../tinybird/tools/phase4_touchpoint_diff.js')

const pv = (distinct_id, timestamp, utm_source, utm_medium = null, utm_campaign = null) =>
  ({ distinct_id, timestamp, utm_source, utm_medium, utm_campaign })

test('creditFirstTouch — from the conversion first_touch_* columns, with pipe COALESCE', () => {
  assert.deepStrictEqual(
    creditFirstTouch({ first_touch_source: 'tiktok', first_touch_medium: 'paid_social', first_touch_campaign: null }),
    { source: 'tiktok', medium: 'paid_social', campaign: '' }) // campaign null -> ''
  assert.deepStrictEqual(
    creditFirstTouch({ first_touch_source: '', first_touch_medium: null, first_touch_campaign: 'q3' }),
    { source: 'direct', medium: 'none', campaign: 'q3' }) // NULLIF('') -> direct/none
})

test('creditFirstTouchNonDirect — EARLIEST non-direct pageview (spec §3 #2: [direct, reddit] -> reddit)', () => {
  const conv = { distinct_id: 'v', timestamp: '2026-06-10T00:10:00Z', first_touch_source: 'facebook' }
  const pvs = [
    pv('v', '2026-06-10T00:00:00Z', null),          // direct — ignored
    pv('v', '2026-06-10T00:05:00Z', 'reddit', 'social', 'launch'),
    pv('v', '2026-06-10T00:08:00Z', 'google', 'cpc')
  ]
  // first_touch (plain column) = facebook, but first_touch_non_direct = reddit (earliest non-direct)
  assert.strictEqual(creditFirstTouch(conv).source, 'facebook')
  assert.deepStrictEqual(creditFirstTouchNonDirect(conv, pvs), { source: 'reddit', medium: 'social', campaign: 'launch' })
  // no non-direct touch at all -> direct/none/null
  assert.deepStrictEqual(creditFirstTouchNonDirect(conv, [pv('v', '2026-06-10T00:00:00Z', 'direct')]),
    { source: 'direct', medium: 'none', campaign: null })
})

test('creditLastTouchNonDirect — per-field LATEST non-direct (spec §3 #3: [bing,reddit,direct,direct] -> reddit)', () => {
  const conv = { distinct_id: 'v', timestamp: '2026-06-10T01:00:00Z' }
  const pvs = [
    pv('v', '2026-06-10T00:10:00Z', 'bing', 'organic', 'c1'),
    pv('v', '2026-06-10T00:20:00Z', 'reddit', 'social', 'c2'),
    pv('v', '2026-06-10T00:30:00Z', 'direct'),   // trailing direct — skipped
    pv('v', '2026-06-10T00:40:00Z', 'direct')
  ]
  assert.deepStrictEqual(creditLastTouchNonDirect(conv, pvs), { source: 'reddit', medium: 'social', campaign: 'c2' })
  // per-field independence: latest non-direct with a medium may differ from latest with a campaign
  const pvs2 = [
    pv('v', '2026-06-10T00:20:00Z', 'reddit', 'social', 'c2'),
    pv('v', '2026-06-10T00:50:00Z', 'twitter', null, null) // latest source, but no medium/campaign
  ]
  assert.deepStrictEqual(creditLastTouchNonDirect(conv, pvs2), { source: 'twitter', medium: 'social', campaign: 'c2' })
})

test('aggregateModelCredits — groups by (source,medium,campaign), sums revenue', () => {
  const conversions = [
    { distinct_id: 'a', timestamp: '2026-06-10T00:10:00Z', first_touch_source: 'tiktok', first_touch_medium: 'paid', first_touch_campaign: null, conversion_value: 384.16 },
    { distinct_id: 'b', timestamp: '2026-06-11T00:10:00Z', first_touch_source: 'tiktok', first_touch_medium: 'paid', first_touch_campaign: null, conversion_value: 100 }
  ]
  const agg = aggregateModelCredits(conversions, [], creditFirstTouch)
  assert.strictEqual(agg.length, 1)
  assert.deepStrictEqual(agg[0], { source: 'tiktok', medium: 'paid', campaign: '', conversions: 2, revenue: 484.16 })
})

test('compareAggregateBuckets — parity, plus only-side + value mismatch reporting', () => {
  const base = [{ source: 'reddit', medium: 'social', campaign: null, conversions: 3, revenue: 429.43 }]
  // identical -> pass
  const eq = compareAggregateBuckets(base, [{ ...base[0] }])
  assert.strictEqual(eq.pass, true)
  assert.strictEqual(eq.totalConversions, 3)
  // revenue within tolerance -> still pass
  assert.strictEqual(compareAggregateBuckets(base, [{ ...base[0], revenue: 429.435 }]).pass, true)
  // conversions differ -> valueMismatch
  const vm = compareAggregateBuckets(base, [{ ...base[0], conversions: 2 }])
  assert.strictEqual(vm.pass, false)
  assert.strictEqual(vm.valueMismatches.length, 1)
  // bucket only on one side
  const only = compareAggregateBuckets(base, [{ source: 'google', medium: 'cpc', campaign: null, conversions: 1, revenue: 5 }])
  assert.strictEqual(only.pass, false)
  assert.strictEqual(only.bucketsHogqlOnly.length, 1)
  assert.strictEqual(only.bucketsTinybirdOnly.length, 1)
})
