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
  TARGETS, runParity, __makeCacheTrapHarness, STUB_HARNESS, __makeFnTargetHarness
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

test('hit-guard expectNoPipe: gate targets INVERT the tbCalls check (0 = PASS, >0 = FAIL)', () => {
  // A gate target (e.g. filtered session-report) MUST divert away from the pipe.
  const held = hitGuardResult({ hogCalls: [], tbCalls: 0, expectNoPipe: true })
  assert.ok(held.valid && !held.fail, 'gate held: pipe never called -> PASS (this was a false RED before)')
  const leaked = hitGuardResult({ hogCalls: [], tbCalls: 1, expectNoPipe: true })
  assert.strictEqual(leaked.fail, true, 'gate leaked: pipe called for a must-not-dispatch request -> FAIL')
  // regression: WITHOUT the flag, tbCalls===0 is still a FAIL (normal targets must dispatch).
  assert.strictEqual(hitGuardResult({ hogCalls: [], tbCalls: 0 }).fail, true, 'normal target: no dispatch = FAIL')
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
test('every --live target loader resolves to a drivable shape (handlerFn OR callFn) + seams', async () => {
  const names = Object.keys(TARGETS)
  assert.deepStrictEqual(names.sort(), ['ai-platform', 'alerts', 'events-health', 'explain', 'first-touch', 'first-touch-non-direct', 'flexible-report', 'flexible-report-attribution-status', 'flexible-report-conversion-type', 'flexible-report-provider', 'flexible-report-stitching-method', 'last-touch', 'last-touch-non-direct', 'multitouch', 'session-report', 'session-report-filtered', 'sessions'], 'expected exactly these seventeen targets')
  for (const name of names) {
    const t = await TARGETS[name]()
    // a target is EITHER a route handler (handlerFn) OR a lib function (callFn)
    const drivable = typeof t.handlerFn === 'function' || typeof t.callFn === 'function'
    assert.ok(drivable, `${name}: resolves handlerFn or callFn (route layer / lib fn + seam names correct)`)
    assert.strictEqual(typeof t.setDeps, 'function', `${name}: setDeps seam exists`)
    assert.strictEqual(typeof t.resetDeps, 'function', `${name}: resetDeps seam exists`)
    assert.strictEqual(typeof t.realTb, 'function', `${name}: realTb (queryTinybirdPipe) resolved`)
    assert.strictEqual(typeof t.realHog, 'function', `${name}: realHog (queryHogQL) resolved`)
  }
  // ai-platform is the function target; sessions/alerts/events-health are route handlers.
  assert.strictEqual(typeof (await TARGETS['ai-platform']()).callFn, 'function', 'ai-platform is a function target (callFn)')
  assert.strictEqual((await TARGETS['ai-platform']()).handlerFn, undefined, 'ai-platform has no route handler')
  assert.strictEqual(typeof (await TARGETS.sessions()).handlerFn, 'function', 'sessions is a route-handler target')
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

// ── empty-window (all-zero meaningful field) guard: three-state verdict ───────
test('empty window: parity holds but meaningful field 0/0 -> INCONCLUSIVE (verdict NOT green)', async () => {
  const meaningful = (A, B) => (Number(A?.data?.count) || 0) > 0 || (Number(B?.data?.count) || 0) > 0
  const base = {
    setDeps: STUB_HARNESS.setDeps, resetDeps: STUB_HARNESS.resetDeps,
    handlerFn: STUB_HARNESS.handlerFn, mockReq: STUB_HARNESS.mockReq,
    siteId: 'mn-site', params: {}, meaningful
  }
  const R = { distinct_id: 'a', timestamp: '2026-07-01T10:00:00Z', conversion_value: 5 }

  // both legs return NO rows -> count 0/0 -> 0==0 parity, but nothing exercised
  const empty = await runParity({ ...base, label: 'empty', offLeg: { queryHog: async () => [] }, onLeg: { queryTinybird: async () => [] } })
  assert.strictEqual(empty.summary.pass, true, 'the trivial 0==0 diff "passes"')
  assert.strictEqual(empty.state, 'INCONCLUSIVE', 'but no data exercised -> INCONCLUSIVE, not GREEN')
  assert.strictEqual(empty.verdict, false, 'verdict boolean is NOT true for an empty window')

  // non-zero + matching -> real GREEN
  const green = await runParity({
    ...base, label: 'green',
    offLeg: { queryHog: async () => [[R.distinct_id, R.timestamp, R.conversion_value]] },
    onLeg: { queryTinybird: async () => [{ distinct_id: R.distinct_id, timestamp: R.timestamp, conversion_value: R.conversion_value }] }
  })
  assert.strictEqual(green.state, 'GREEN')
  assert.strictEqual(green.verdict, true)

  // non-zero + divergent -> RED (RED dominates; meaningfulness never rescues a divergence)
  const red = await runParity({
    ...base, label: 'red',
    offLeg: { queryHog: async () => [[R.distinct_id, R.timestamp, 5]] },
    onLeg: { queryTinybird: async () => [{ distinct_id: R.distinct_id, timestamp: R.timestamp, conversion_value: 6 }] }
  })
  assert.strictEqual(red.state, 'RED')
})

test('per-target meaningful checks: events-health treats last_event-present as meaningful even at count 0/0', async () => {
  const eh = (await TARGETS['events-health']()).meaningful
  assert.strictEqual(typeof eh, 'function')
  assert.strictEqual(eh({ data: { last_event: '2026-07-01T00:00:00Z', count_hour: 0, count_day: 0 } }, { data: { last_event: '2026-07-01T00:00:00Z', count_hour: 0, count_day: 0 } }), true, 'last_event present -> meaningful despite 0/0 hour/day (stale-fixture case)')
  assert.strictEqual(eh({ data: { last_event: null, count_hour: 0, count_day: 0 } }, { data: { last_event: null, count_hour: 0, count_day: 0 } }), false, 'no last_event + 0/0 -> empty window')

  const s = (await TARGETS.sessions()).meaningful
  assert.strictEqual(s({ data: { total_sessions: 0 } }, { data: { total_sessions: 0 } }), false)
  assert.strictEqual(s({ data: { total_sessions: 72 } }, { data: { total_sessions: 72 } }), true)

  const a = (await TARGETS.alerts()).meaningful
  assert.strictEqual(a({ data: { count: 0 } }, { data: { count: 0 } }), false)
  assert.strictEqual(a({ data: { count: 3 } }, { data: { count: 3 } }), true)

  // ai-platform meaningful = total AI-source conversions > 0 (array response)
  const aip = (await TARGETS['ai-platform']()).meaningful
  assert.strictEqual(aip([], []), false, 'no AI-source rows -> empty window')
  assert.strictEqual(aip([{ dim_value: 'ChatGPT', revenue: 100, conversions: 0 }], []), false, '0 conversions -> not meaningful')
  assert.strictEqual(aip([{ dim_value: 'ChatGPT', revenue: 100, conversions: 5 }], []), true, 'conversions>0 -> meaningful')
})

// ── FUNCTION-target mode (breaker #2, ai-platform is a lib fn not a route handler) ──
// The callFn path returns the result object directly; prove every guard threads through it.
test('function target: GREEN / RED-dominates / INCONCLUSIVE + hit-guard through callFn', async () => {
  const h = __makeFnTargetHarness()
  const base = {
    setDeps: h.setDeps, resetDeps: h.resetDeps, callFn: h.callFn, cfg: h.cfg, meaningful: h.meaningful,
    siteId: 'aip-site', params: { date_from: '2026-07-01', date_to: '2026-07-06' }
  }
  const ROW = (rev, conv) => ({ dim_value: 'ChatGPT', revenue: rev, conversions: conv })

  // GREEN: ON pipe rows match OFF HogQL rows, non-zero conversions -> data exercised
  const green = await runParity({
    ...base, label: 'aip-green',
    offLeg: { queryHog: async () => [ROW(100, 5)] },
    onLeg: { queryTinybird: async () => [ROW(100, 5)] }
  })
  assert.strictEqual(green.state, 'GREEN')
  assert.strictEqual(green.guard.hogCalls.length, 0, 'ON leg served by the pipe — HogQL not called')
  assert.ok(green.guard.tbCalls >= 1, 'ON leg dispatched the pipe via callFn')

  // RED: matched dim_value 'ChatGPT' with divergent revenue -> cent fail dominates
  const red = await runParity({
    ...base, label: 'aip-red',
    offLeg: { queryHog: async () => [ROW(100, 5)] },
    onLeg: { queryTinybird: async () => [ROW(200, 5)] }
  })
  assert.strictEqual(red.state, 'RED')
  assert.ok(red.summary.fails.some((f) => f.path.includes('revenue')), 'the divergent AI-source revenue is flagged')

  // INCONCLUSIVE: both legs empty (no AI-source conversions in the window) -> not a hollow green
  const inconclusive = await runParity({
    ...base, label: 'aip-empty',
    offLeg: { queryHog: async () => [] },
    onLeg: { queryTinybird: async () => [] }
  })
  assert.strictEqual(inconclusive.state, 'INCONCLUSIVE')
  assert.strictEqual(inconclusive.verdict, false)

  // hit-guard: ON pipe returns null -> callFn falls back to HogQL -> INVALID -> RED
  const invalid = await runParity({
    ...base, label: 'aip-hitguard',
    offLeg: { queryHog: async () => [ROW(100, 5)] },
    onLeg: { queryTinybird: async () => null }
  })
  assert.strictEqual(invalid.state, 'RED')
  assert.strictEqual(invalid.guard.valid, false, 'ON leg touched HogQL via fallback -> INVALID')
})

// ── engine-leg A/B targets RETIRED (D1c-1) ──────────────────────────────────
// The real-target A/B self-tests that drove the touch-model, multitouch, session-report,
// and explain engine legs through the OFF (HogQL) leg have been removed: D1c-1 flipped those
// legs to Tinybird-SOLE (a null pipe throws the tinybird-force-read invariant — no HogQL
// fallback), so there is no longer an OFF/HogQL leg to compare against. Their pipe-vs-HogQL
// parity was already certified before the flip (the §5 prod-serving gate: all 13 pipes
// confirmed serving), and their fail-closed behavior is now covered by the dedicated
// *-read-cutover / *-parity suites (attribution-{touch,engine}-read-cutover, multitouch-,
// session-report-, explain-, aiplatform-read-cutover, flexible-report-depth-parity).
// The route_ab_diff TOOL + its TARGET registry stay intact (still exercised by the stub-driven
// LOGIC tests above); the tool is coupled to posthog.js and is retired wholesale in D3.
