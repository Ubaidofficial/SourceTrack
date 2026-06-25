import test from 'node:test'
import assert from 'node:assert'
import { countDistinctConverters, cappedRate } from '../lib/utils.js'

// Reproduces the techrupt.pk shape confirmed via PostHog:
// 17 distinct visitors, 27 conversion rows spread across those same 17 identities
// (some convert multiple times). in_set=17, out_of_set=0 — same identity space.
// The bug: numerator counted rows (27), denominator counted distinct visitors (17)
// → 27/17 = 158.82%. Fix: numerator = DISTINCT converters; rate capped ≤ 100%.

const VISITORS = 17
const ids = Array.from({ length: 17 }, (_, i) => `v${String(i + 1).padStart(2, '0')}`)
const CONV_ROWS = [
  ...ids.map(id => ({ distinct_id: id, anonymous_id: id })),        // 17 rows, one per visitor
  ...ids.slice(0, 10).map(id => ({ distinct_id: id, anonymous_id: id })) // 10 repeat conversions
] // → 27 rows, 17 distinct converters

test('fixture matches the confirmed shape: 27 rows, 17 distinct converters', () => {
  assert.strictEqual(CONV_ROWS.length, 27)
  assert.strictEqual(countDistinctConverters(CONV_ROWS), 17)
})

test('regression witness: the OLD row-based formula exceeds 100%', () => {
  const oldRate = (CONV_ROWS.length / VISITORS) * 100
  assert.ok(oldRate > 100, `expected the buggy formula to exceed 100%, got ${oldRate}`)
  assert.strictEqual(Number(oldRate.toFixed(2)), 158.82)
})

test('fixed: distinct-converter numerator yields a rate ≤ 100%', () => {
  const rate = cappedRate(countDistinctConverters(CONV_ROWS), VISITORS)
  assert.ok(rate <= 100)
  assert.strictEqual(rate, 100) // 17 distinct converters / 17 visitors
})

// Discriminating case: distinct converters (12) < visitors (17), so the correct
// rate is 70.59% — a value the cap can NEVER produce. This proves the DISTINCT
// logic independently of the 100% cap. A row-counting regression would compute
// 27/17 = 158.82% (capped to 100%), which is != 70.59 → the test would fail.
const ROWS_12 = [
  ...ids.slice(0, 12).map(id => ({ distinct_id: id, anonymous_id: id })),       // 12 distinct
  ...ids.slice(0, 12).map(id => ({ distinct_id: id, anonymous_id: id })),       // +12 repeats = 24
  ...ids.slice(0, 3).map(id => ({ distinct_id: id, anonymous_id: id }))         // +3 repeats = 27 rows
]

test('EXACT rate from distinct converters (12/17 = 70.59%), unreachable by the cap', () => {
  assert.strictEqual(ROWS_12.length, 27)                       // same 27 rows
  assert.strictEqual(countDistinctConverters(ROWS_12), 12)     // but only 12 distinct converters
  const distinctRate = cappedRate(countDistinctConverters(ROWS_12), VISITORS)
  assert.strictEqual(Number(distinctRate.toFixed(2)), 70.59)   // distinct logic → exact 70.59%
  assert.ok(distinctRate < 100)                                // not the cap
  // A row-counting regression would yield the capped 100% — provably different:
  assert.strictEqual(cappedRate(ROWS_12.length, VISITORS), 100)
  assert.notStrictEqual(Number(distinctRate.toFixed(2)), 100)
})

test('cap catches numerator/denominator drift (belt-and-suspenders)', () => {
  // Even if a row-inflated numerator slips through, the cap holds the rate ≤ 100.
  assert.strictEqual(cappedRate(27, 17), 100)
})

test('normal case is unaffected and uncapped', () => {
  const rate = cappedRate(8, 17)
  assert.ok(rate <= 100)
  assert.strictEqual(Number(rate.toFixed(2)), 47.06)
})

test('zero / empty denominator is guarded to 0 (no divide-by-zero)', () => {
  assert.strictEqual(cappedRate(5, 0), 0)
  assert.strictEqual(cappedRate(5, null), 0)
  assert.strictEqual(cappedRate(0, 0), 0)
})

test('converter identity falls back anonymous_id and skips identity-less rows', () => {
  const rows = [
    { distinct_id: 'a' },
    { anonymous_id: 'a' },          // same person via fallback → deduped
    { anonymous_id: 'b' },
    { distinct_id: null, anonymous_id: null }, // skipped
    {}                              // skipped
  ]
  assert.strictEqual(countDistinctConverters(rows), 2)
})
