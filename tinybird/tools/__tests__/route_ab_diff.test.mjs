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

// Mock env so the --live TARGET loaders can dynamically import the real route
// modules (posthog.js constructs a client from POSTHOG_API_KEY at import). No creds,
// no network — the loader test only resolves the seam shape, never calls the deps.
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

import {
  deepDiff, summarize, hitGuardResult, classifyKey, toCents, intervalOf,
  runStubScenario, SELFTEST_SCENARIOS,
  TARGETS, runParity, __makeCacheTrapHarness
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

// ── target registry (catches a seam-name typo in CI, not at --live) ──────────
test('every --live target loader resolves to { handlerFn, setDeps, resetDeps } without throwing', async () => {
  const names = Object.keys(TARGETS)
  assert.deepStrictEqual(names.sort(), ['alerts', 'events-health', 'sessions'], 'expected exactly these three targets')
  for (const name of names) {
    const t = await TARGETS[name]()
    assert.strictEqual(typeof t.handlerFn, 'function', `${name}: handlerFn resolved (route layer + seam names correct)`)
    assert.strictEqual(typeof t.setDeps, 'function', `${name}: setDeps seam exists`)
    assert.strictEqual(typeof t.resetDeps, 'function', `${name}: resetDeps seam exists`)
    assert.strictEqual(typeof t.realTb, 'function', `${name}: realTb (queryTinybirdPipe) resolved`)
    assert.strictEqual(typeof t.realHog, 'function', `${name}: realHog (queryHogQL) resolved`)
  }
  // events-health MUST supply the cache-eviction hook; sessions/alerts must not need one.
  assert.strictEqual(typeof (await TARGETS['events-health']()).beforeLeg, 'function', 'events-health provides the NodeCache eviction beforeLeg')
  assert.strictEqual((await TARGETS.sessions()).beforeLeg, undefined, 'sessions needs no beforeLeg')
})

// ── events-health cache trap: eviction is load-bearing ───────────────────────
// A handler that caches by siteId (like events '/health') would let the ON leg read
// the OFF leg's cached result. Prove the harness catches a stale cache and that the
// beforeLeg eviction is what lets the ON leg actually dispatch and surface divergence.
test('cache trap: without beforeLeg the ON leg cannot dispatch (hit-guard fails); with it, real divergence surfaces', async () => {
  const h = __makeCacheTrapHarness()
  const common = {
    setDeps: h.setDeps, resetDeps: h.resetDeps, handlerFn: h.handlerFn, mockReq: h.mockReq,
    siteId: 'cache-site', params: {},
    offLeg: { queryHog: async () => [[100]] },                      // OFF revenue = 100
    onLeg: { queryTinybird: async () => [{ conversion_value: 200 }] } // ON revenue = 200 (divergent!)
  }

  // (a) NO eviction: OFF warms the cache; the ON leg cache-HITs, never calling the pipe
  // -> tbCalls===0 -> hit-guard FAILS. The harness refuses to green a cache-masked run
  // (NOT a false green), but the real 100-vs-200 divergence stays hidden (B is the cached 100).
  const noEvict = await runParity({ ...common, label: 'no-evict' })
  assert.strictEqual(noEvict.verdict, false, 'stale cache -> not green')
  assert.strictEqual(noEvict.guard.tbCalls, 0, 'ON leg never dispatched (cache hit)')
  assert.strictEqual(noEvict.guard.fail, true, 'hit-guard fails on tbCalls===0 (dispatch not exercised)')
  assert.ok(!noEvict.summary.fails.some((f) => f.path.includes('revenue')), 'the real divergence is MASKED without eviction')

  // (b) WITH eviction: the ON leg cache-misses, dispatches the pipe (200), and the
  // real divergence is caught -> RED for the RIGHT reason.
  const withEvict = await runParity({ ...common, label: 'evict', beforeLeg: (siteId) => h.evict(siteId) })
  assert.strictEqual(withEvict.verdict, false, 'divergent pipe value -> RED')
  assert.strictEqual(withEvict.guard.tbCalls, 1, 'ON leg dispatched the pipe exactly once')
  assert.ok(withEvict.guard.valid && !withEvict.guard.fail, 'hit-guard clean: pipe served, no HogQL fallback')
  assert.ok(withEvict.summary.fails.some((f) => f.path.includes('revenue')), 'the real 100-vs-200 divergence is SURFACED with eviction')
})
