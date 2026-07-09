// Self-test for the route-handler A/B parity harness (tinybird/tools/route_ab_diff.mjs).
// Deterministic, NO live creds — CI-safe. Proves the diff/tolerance/hit-guard LOGIC:
//   - integer counts/ids exact; money/floats at cent precision
//   - row collections by INTERSECTION (both-disagree = FAIL; only-one = ingestion-lag)
//   - timestamps compared as INTERVALS not absolutes
//   - zero-fallback hit-guard: ON leg touching HogQL = INVALID; pipe null = FAIL
// It drives the reusable runner through a fake wired handler (known matching/divergent
// stub pairs) AND unit-tests the pure engine directly.

import test from 'node:test'
import assert from 'node:assert'
import {
  deepDiff, summarize, hitGuardResult, classifyKey, toCents, intervalOf,
  runStubScenario, SELFTEST_SCENARIOS
} from '../route_ab_diff.mjs'

// ── pure engine ──────────────────────────────────────────────────────────────
test('classifyKey: money / id / timestamp / other', () => {
  assert.strictEqual(classifyKey('conversion_value'), 'money')
  assert.strictEqual(classifyKey('Distinct_Id'), 'id')
  assert.strictEqual(classifyKey('timestamp'), 'timestamp')
  assert.strictEqual(classifyKey('page_url'), 'other')
})

test('scalars: integers EXACT; money/floats at CENT precision', () => {
  assert.ok(summarize(deepDiff({ count: 3 }, { count: 3 })).pass, 'equal ints pass')
  assert.ok(!summarize(deepDiff({ count: 3 }, { count: 4 })).pass, 'unequal ints fail')
  // money: sub-cent wobble rounds to the same cents -> pass
  assert.ok(summarize(deepDiff({ revenue: 42.504 }, { revenue: 42.5 })).pass, '42.504 ≈ 42.50 within a cent')
  // money: whole-cent difference -> fail
  assert.ok(!summarize(deepDiff({ revenue: 42.51 }, { revenue: 42.5 })).pass, '42.51 ≠ 42.50 at cent precision')
  assert.strictEqual(toCents(42.504), 4250)
})

test('rows: INTERSECTION — matched-disagree FAILs; key-in-one is ingestion-lag (no fail)', () => {
  const A = { rows: [{ distinct_id: 'a', conversion_value: 10 }, { distinct_id: 'b', conversion_value: 20 }] }
  // 'a' agrees; 'b' MISSING in B; 'c' EXTRA in B -> both are lag, NOT fails
  const B = { rows: [{ distinct_id: 'a', conversion_value: 10 }, { distinct_id: 'c', conversion_value: 99 }] }
  const s = summarize(deepDiff(A, B))
  assert.ok(s.pass, 'lag-only divergence does not fail the row diff')
  assert.strictEqual(s.lags.length, 2, "'b' (only OFF) and 'c' (only ON) reported as lag")

  // a key in BOTH that disagrees on money -> FAIL/STOP
  const B2 = { rows: [{ distinct_id: 'a', conversion_value: 11 }, { distinct_id: 'b', conversion_value: 20 }] }
  assert.ok(!summarize(deepDiff(A, B2)).pass, 'matched key disagreement fails')
})

test('timestamps: absolutes ignored, INTERVAL (min..max, second precision) compared', () => {
  const A = { rows: [{ id: '1', timestamp: '2026-07-01T10:00:00Z' }, { id: '2', timestamp: '2026-07-01T12:00:00Z' }] }
  // same interval, sub-second wobble on the absolutes -> PASS
  const B = { rows: [{ id: '1', timestamp: '2026-07-01T10:00:00.400Z' }, { id: '2', timestamp: '2026-07-01T12:00:00.900Z' }] }
  assert.ok(summarize(deepDiff(A, B)).pass, 'per-row absolute ts wobble does not fail; interval matches')
  // widen the interval past the second boundary -> the interval check FAILs
  const C = { rows: [{ id: '1', timestamp: '2026-07-01T10:00:00Z' }, { id: '2', timestamp: '2026-07-01T13:30:00Z' }] }
  const findings = deepDiff(A, C)
  const iv = findings.find((f) => f.kind === 'interval')
  assert.ok(iv && iv.pass === false, 'divergent interval max fails')
  assert.strictEqual(intervalOf(A.rows).count, 2)
})

test('hit-guard: ON→HogQL = INVALID; pipe null / never-called = FAIL; clean = OK', () => {
  assert.strictEqual(hitGuardResult({ hogCalls: ['sessions_conversions'], tbCalls: 1 }).valid, false)
  assert.strictEqual(hitGuardResult({ hogCalls: [], tbNull: true, tbCalls: 1 }).fail, true)
  assert.strictEqual(hitGuardResult({ hogCalls: [], tbCalls: 0 }).fail, true)
  const ok = hitGuardResult({ hogCalls: [], tbNull: false, tbCalls: 1 })
  assert.ok(ok.valid && !ok.fail, 'pipe served, HogQL untouched -> OK')
})

// ── runner through the fake wired handler (known stub pairs) ──────────────────
test('runParity: MATCHING stub pair -> GREEN, hit-guard clean', async () => {
  const { report, ok } = await runStubScenario('match')
  assert.ok(ok && report.verdict === true, 'matching legs -> parity')
  assert.ok(report.guard.valid && !report.guard.fail, 'ON leg served by Tinybird, no HogQL fallback')
  assert.strictEqual(report.guard.hogCalls.length, 0, 'zero-fallback: HogQL not called on the ON leg')
})

test('runParity: DIVERGENT (whole-cent money) stub pair -> RED', async () => {
  const { report, ok } = await runStubScenario('moneyDiverge')
  assert.ok(ok && report.verdict === false, 'cent-level money divergence -> RED')
  assert.ok(report.summary.fails.some((f) => f.kind === 'money' || f.kind === 'float'), 'a money/float field failed')
})

test('runParity: pipe null on ON leg -> zero-fallback hit-guard fires -> RED', async () => {
  const { report, ok } = await runStubScenario('hitGuard')
  assert.ok(ok && report.verdict === false, 'null pipe must FAIL, never pass by fallback')
  assert.strictEqual(report.guard.valid, false, 'ON leg fell back to HogQL -> INVALID')
  assert.strictEqual(report.guard.fail, true, 'pipe null -> FAIL')
})

test('every declared self-test scenario meets its expected verdict', async () => {
  for (const name of Object.keys(SELFTEST_SCENARIOS)) {
    const { ok, report, expectVerdict } = await runStubScenario(name)
    assert.ok(ok, `scenario ${name}: expected verdict ${expectVerdict}, got ${report.verdict}`)
  }
})
