// KI-51 — pure unit test of getDateFilterExpr (attribution-engine.js:53), the authoritative
// definition of what a report's date window MEANS. No DB, no credentials, no network, no data.
//
// This is the specification half of KI-51. It retires the "what SHOULD the boundary be" risk
// entirely and locks the exact character-level operators. It does NOT prove any pipe implements
// this (that is flex-pipe-boundary-parity.test.js), and it does NOT prove ClickHouse executes
// it as intended (that needs `tb --cloud deploy --check` + a seeded non-UTC fixture, neither of
// which exists yet). The KI-51 tz breaker stays closed regardless of this file being green.
//
// Every expected string below was captured from the live function and cross-checked against
// ClickHouse for the Europe/Paris case:
//   toDateTime('2026-07-20 00:00:00','Europe/Paris') = 2026-07-19 22:00:00 UTC
//   toDateTime('2026-07-22 00:00:00','Europe/Paris') = 2026-07-21 22:00:00 UTC
// i.e. the local window is [2026-07-19T22:00Z, 2026-07-21T22:00Z) — NOT the UTC
// [2026-07-20T00:00Z, 2026-07-22T00:00Z). That divergence is the whole point.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const { getDateFilterExpr } = await import('../lib/attribution-engine.js')

const FROM = '2026-07-20'
const TO = '2026-07-21'

// ── UTC branch — exact string lock ───────────────────────────────────────────
test('UTC: exact expression, half-open, +1-day exclusive end', () => {
  assert.equal(
    getDateFilterExpr('timestamp', 'UTC', FROM, TO),
    "timestamp >= toDateTime('2026-07-20T00:00:00.000Z') AND timestamp < toDateTime('2026-07-22T00:00:00.000Z')"
  )
})

test('UTC: never emits `<=` and never emits toTimeZone', () => {
  const expr = getDateFilterExpr('timestamp', 'UTC', FROM, TO)
  assert.ok(!expr.includes('<='), 'UTC upper bound must be exclusive `<`')
  assert.ok(!expr.includes('toTimeZone'), 'the UTC branch must not do timezone conversion')
})

test('UTC: falsy tz values all take the UTC branch', () => {
  const utc = getDateFilterExpr('timestamp', 'UTC', FROM, TO)
  for (const tz of [undefined, null, '', 0, false]) {
    assert.equal(getDateFilterExpr('timestamp', tz, FROM, TO), utc, `tz=${JSON.stringify(tz)} must behave as UTC`)
  }
})

test('the timestamp column name is substituted, not hardcoded', () => {
  const expr = getDateFilterExpr('e.created_at', 'UTC', FROM, TO)
  assert.ok(expr.startsWith('e.created_at >='))
  assert.ok(!expr.includes('timestamp'))
})

// ── non-UTC branch — exact string lock ───────────────────────────────────────
test('non-UTC: exact expression — padded UTC scan AND half-open local intersect', () => {
  assert.equal(
    getDateFilterExpr('timestamp', 'Europe/Paris', FROM, TO),
    "timestamp >= toDateTime('2026-07-19T00:00:00.000Z') AND timestamp < toDateTime('2026-07-23T00:00:00.000Z')" +
    " AND toTimeZone(timestamp, 'Europe/Paris') >= toDateTime('2026-07-20 00:00:00', 'Europe/Paris')" +
    " AND toTimeZone(timestamp, 'Europe/Paris') < toDateTime('2026-07-22 00:00:00', 'Europe/Paris')"
  )
})

test('🔴 non-UTC: local UPPER bound is `<`, NEVER `<=` — the one-day off-by-one guard', () => {
  const expr = getDateFilterExpr('timestamp', 'Europe/Paris', FROM, TO)
  // Character-level, not "contains a timezone clause".
  assert.ok(
    expr.includes("toTimeZone(timestamp, 'Europe/Paris') < toDateTime('2026-07-22 00:00:00', 'Europe/Paris')"),
    'local upper bound must be `<` against next-day midnight'
  )
  assert.ok(
    !/toTimeZone\([^)]*\)\s*<=/.test(expr),
    "`<=` on a local bound over-counts by one day. dash_stages.pipe uses `<=` because its caller " +
    'supplies an inclusive bound — that convention must NOT be copied here.'
  )
})

test('non-UTC: local LOWER bound is inclusive `>=` at local midnight', () => {
  const expr = getDateFilterExpr('timestamp', 'Europe/Paris', FROM, TO)
  assert.ok(expr.includes("toTimeZone(timestamp, 'Europe/Paris') >= toDateTime('2026-07-20 00:00:00', 'Europe/Paris')"))
})

test('non-UTC: pad is start−1d / end+2d, and is a SUPERSET of the local window', () => {
  const expr = getDateFilterExpr('timestamp', 'Europe/Paris', FROM, TO)
  assert.ok(expr.includes("timestamp >= toDateTime('2026-07-19T00:00:00.000Z')"), 'lower pad = start − 1 day')
  assert.ok(expr.includes("timestamp < toDateTime('2026-07-23T00:00:00.000Z')"), 'upper pad = end + 2 days')
  // The pad exists only to prune partitions; it must never be narrower than the local window
  // (local lower = 2026-07-19T22:00Z, local upper = 2026-07-21T22:00Z — both strictly inside).
})

test('non-UTC: the local window genuinely differs from the UTC window (else the fix is pointless)', () => {
  const utc = getDateFilterExpr('timestamp', 'UTC', FROM, TO)
  const paris = getDateFilterExpr('timestamp', 'Europe/Paris', FROM, TO)
  assert.notEqual(utc, paris)
  assert.ok(paris.includes('toTimeZone'), 'non-UTC must add a local intersect')
  assert.ok(!utc.includes('toTimeZone'))
})

// ── date arithmetic — rollovers ──────────────────────────────────────────────
test('end shift rolls over month, year, and leap day', () => {
  const cases = [
    ['2026-07-31', "toDateTime('2026-08-01T00:00:00.000Z')", 'month end'],
    ['2026-12-31', "toDateTime('2027-01-01T00:00:00.000Z')", 'year end'],
    ['2028-02-28', "toDateTime('2028-02-29T00:00:00.000Z')", 'leap year'],
    ['2027-02-28', "toDateTime('2027-03-01T00:00:00.000Z')", 'non-leap year']
  ]
  for (const [dateTo, expectedUpper, label] of cases) {
    const expr = getDateFilterExpr('timestamp', 'UTC', '2026-01-01', dateTo)
    assert.ok(expr.includes(`< ${expectedUpper}`), `${label}: dateTo=${dateTo} must roll to ${expectedUpper}`)
  }
})

test('start pad rolls backwards across a month boundary', () => {
  const expr = getDateFilterExpr('timestamp', 'Europe/Paris', '2026-08-01', '2026-08-02')
  assert.ok(expr.includes("timestamp >= toDateTime('2026-07-31T00:00:00.000Z')"), 'lower pad crosses into July')
})

// ── input normalization ──────────────────────────────────────────────────────
test('Date objects and YYYY-MM-DD strings produce identical output', () => {
  const fromStr = getDateFilterExpr('timestamp', 'Europe/Paris', FROM, TO)
  const fromDate = getDateFilterExpr('timestamp', 'Europe/Paris', new Date('2026-07-20T00:00:00Z'), new Date('2026-07-21T00:00:00Z'))
  assert.equal(fromDate, fromStr)
})

test('surrounding whitespace in date strings is trimmed', () => {
  assert.equal(
    getDateFilterExpr('timestamp', 'UTC', '  2026-07-20  ', '  2026-07-21  '),
    getDateFilterExpr('timestamp', 'UTC', FROM, TO)
  )
})

// ── tz is escaped ────────────────────────────────────────────────────────────
test('tz is escaped — a quote in the tz cannot break out of the string literal', () => {
  const expr = getDateFilterExpr('timestamp', "Europe/Paris' OR '1'='1", FROM, TO)
  // The raw injection payload must not appear as a closed-then-reopened literal.
  assert.ok(!expr.includes("'Europe/Paris' OR '1'='1'"), 'tz must not be interpolated raw')
  assert.ok(expr.includes('toTimeZone('), 'still emits the local intersect')
})

// ── determinism ──────────────────────────────────────────────────────────────
test('pure: identical inputs yield identical output, and no argument is mutated', () => {
  const from = new Date('2026-07-20T00:00:00Z')
  const to = new Date('2026-07-21T00:00:00Z')
  const fromCopy = new Date(from.getTime())
  const toCopy = new Date(to.getTime())
  const first = getDateFilterExpr('timestamp', 'Europe/Paris', from, to)
  for (let i = 0; i < 20; i++) {
    assert.equal(getDateFilterExpr('timestamp', 'Europe/Paris', from, to), first)
  }
  assert.equal(from.getTime(), fromCopy.getTime(), 'dateFrom must not be mutated')
  assert.equal(to.getTime(), toCopy.getTime(), 'dateTo must not be mutated')
})

// ── what this file deliberately does NOT cover ───────────────────────────────
test('SCOPE MARKER: DST is NOT covered here — it is resolved by ClickHouse, not by this function', () => {
  // On a DST-transition day the emitted STRING is unremarkable; the ambiguity is resolved when
  // ClickHouse evaluates toDateTime('… 00:00:00', tz). This assertion documents that boundary of
  // coverage rather than pretending to test it. A DST fixture is separate, harder work.
  const expr = getDateFilterExpr('timestamp', 'Europe/Paris', '2026-10-24', '2026-10-25') // clocks go back 2026-10-25
  assert.ok(expr.includes("toDateTime('2026-10-24 00:00:00', 'Europe/Paris')"))
  assert.ok(expr.includes("toDateTime('2026-10-26 00:00:00', 'Europe/Paris')"))
  // NOTE: this asserts the STRING only. Whether ClickHouse resolves those local times correctly
  // across the transition is UNVERIFIED and needs real execution.
})
