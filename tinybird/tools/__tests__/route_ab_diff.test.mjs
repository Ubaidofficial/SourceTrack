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
  assert.deepStrictEqual(names.sort(), ['ai-platform', 'alerts', 'events-health', 'explain', 'first-touch', 'first-touch-non-direct', 'flexible-report', 'last-touch', 'last-touch-non-direct', 'multitouch', 'session-report', 'sessions'], 'expected exactly these twelve targets')
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

// ── touch-model function targets (4 already-wired attribution reads) ─────────
// Drive the REAL targets through the callFn path with STUB deps (named pipe rows on
// the ON leg, positional HogQL rows on the OFF leg — the fn itself maps both to the
// same { source, medium, campaign, conversions, revenue } shape). Proves the composite
// (source,medium,campaign) rowKeyFn + every guard threads through, no creds.
test('touch-model targets: GREEN / RED-dominates / INCONCLUSIVE / hit-guard via callFn + composite key', async () => {
  const NAMES = ['first-touch', 'last-touch', 'first-touch-non-direct', 'last-touch-non-direct']
  // fn maps named pipe rows AND positional HogQL rows [source,medium,campaign,conversions,revenue].
  const tbRow = (rev, conv, src = 'google', med = 'cpc', camp = 'c1') => ({ source: src, medium: med, campaign: camp, conversions: conv, revenue: rev })
  const hogRow = (rev, conv, src = 'google', med = 'cpc', camp = 'c1') => [src, med, camp, conv, rev]

  for (const name of NAMES) {
    const t = await TARGETS[name]()
    assert.strictEqual(typeof t.callFn, 'function', `${name}: function target`)
    assert.strictEqual(typeof t.cfg.rowKeyFn, 'function', `${name}: composite rowKeyFn`)
    const base = {
      setDeps: t.setDeps, resetDeps: t.resetDeps, callFn: t.callFn, cfg: t.cfg, meaningful: t.meaningful,
      siteId: 's', params: { date_from: '2026-07-08', date_to: '2026-07-10' }
    }

    // GREEN: pipe (ON) and HogQL (OFF) map to identical rows, conversions>0
    const green = await runParity({ ...base, label: `${name}-green`, offLeg: { queryHog: async () => [hogRow(100, 5)] }, onLeg: { queryTinybird: async () => [tbRow(100, 5)] } })
    assert.strictEqual(green.state, 'GREEN', `${name}: matching legs -> GREEN`)
    assert.ok(green.guard.tbCalls >= 1 && green.guard.hogCalls.length === 0, `${name}: ON dispatched pipe, no HogQL`)

    // RED: same (source,medium,campaign) key, divergent revenue -> cent fail dominates
    const red = await runParity({ ...base, label: `${name}-red`, offLeg: { queryHog: async () => [hogRow(100, 5)] }, onLeg: { queryTinybird: async () => [tbRow(200, 5)] } })
    assert.strictEqual(red.state, 'RED', `${name}: divergent revenue -> RED`)
    assert.ok(red.summary.fails.some((f) => f.path.includes('revenue')), `${name}: revenue flagged`)

    // INCONCLUSIVE: both legs empty -> no conversions exercised
    const empty = await runParity({ ...base, label: `${name}-empty`, offLeg: { queryHog: async () => [] }, onLeg: { queryTinybird: async () => [] } })
    assert.strictEqual(empty.state, 'INCONCLUSIVE', `${name}: empty window -> INCONCLUSIVE`)

    // hit-guard: ON pipe null -> fn falls back to HogQL on the ON leg -> INVALID
    const invalid = await runParity({ ...base, label: `${name}-hitguard`, offLeg: { queryHog: async () => [hogRow(100, 5)] }, onLeg: { queryTinybird: async () => null } })
    assert.strictEqual(invalid.state, 'RED', `${name}: pipe null -> RED`)
    assert.strictEqual(invalid.guard.valid, false, `${name}: ON fell back to HogQL -> INVALID`)
  }
})

// ── multitouch function target (partially-wired: conversions=pipe, pageviews=HogQL) ──
// Exercises allowedHogReads: the ON leg's expected pageviews HogQL read must NOT trip the
// hit-guard, while the wired conversions read falling back to HogQL still does.
test('multitouch target: allowedHogReads passes the un-wired pageviews leg; GREEN / RED / INCONCLUSIVE / hit-guard', async () => {
  const t = await TARGETS.multitouch()
  const CONV_KEYS = ['uuid', 'distinct_id', 'timestamp', 'conversion_type', 'conversion_value', 'utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'ai_source', 'country', 'device_type', 'utm_term', 'provider', 'attribution_status', 'stitching_method', 'ingestion_method', 'stripe_subscription_id', 'stripe_event_type']
  const conv = (val) => ({ uuid: 'c1', distinct_id: 'v1', timestamp: '2026-07-01T10:00:00Z', conversion_type: 'purchase', conversion_value: val, utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand', referrer: null, ai_source: null, country: 'US', device_type: 'desktop', utm_term: null, provider: 'browser', attribution_status: 'attributed', stitching_method: 'browser', ingestion_method: 'server_routed', stripe_subscription_id: null, stripe_event_type: null })
  const toPos = (o) => CONV_KEYS.map((k) => o[k])
  const pvRow = (() => { const r = new Array(23).fill(null); r[0] = 'v1'; r[1] = '2026-07-01T09:00:00Z'; r[2] = 'google'; r[3] = 'cpc'; r[4] = 'brand'; return r })()
  const base = { setDeps: t.setDeps, resetDeps: t.resetDeps, callFn: t.callFn, cfg: t.cfg, meaningful: t.meaningful, allowedHogReads: t.allowedHogReads, siteId: 's', params: { date_from: '2026-07-01', date_to: '2026-07-06' } }
  const offHog = (val) => async (_sql, name) => name === 'multitouch_conversions_live' ? [toPos(conv(val))] : name === 'multitouch_pageviews_live' ? [pvRow] : []

  const green = await runParity({ ...base, offLeg: { queryHog: offHog(49) }, onLeg: { queryTinybird: async (p) => p === 'multitouch_conversions_by_site' ? [conv(49)] : null } })
  assert.strictEqual(green.state, 'GREEN', 'matching legs -> GREEN')
  assert.strictEqual(green.guard.hogCalls.length, 0, 'pageviews (allowed) not a violation; conversions from pipe -> zero-fallback clean')
  assert.ok(green.guard.tbCalls >= 1, 'ON leg dispatched the conversions pipe')

  const red = await runParity({ ...base, offLeg: { queryHog: offHog(49) }, onLeg: { queryTinybird: async (p) => p === 'multitouch_conversions_by_site' ? [conv(200)] : null } })
  assert.strictEqual(red.state, 'RED', 'divergent attributed revenue -> RED')

  const empty = await runParity({ ...base, offLeg: { queryHog: async (_s, name) => name === 'multitouch_pageviews_live' ? [pvRow] : [] }, onLeg: { queryTinybird: async (p) => p === 'multitouch_conversions_by_site' ? [] : null } })
  assert.strictEqual(empty.state, 'INCONCLUSIVE', 'no conversions -> empty window')

  // pipe null -> the WIRED conversions read falls back to HogQL('multitouch_conversions_live')
  // which is NOT allowlisted -> hit-guard INVALID (proves allowedHogReads is narrow).
  const invalid = await runParity({ ...base, offLeg: { queryHog: offHog(49) }, onLeg: { queryTinybird: async () => null } })
  assert.strictEqual(invalid.state, 'RED')
  assert.strictEqual(invalid.guard.valid, false, 'conversions fallback trips the guard')
  assert.ok(invalid.guard.hogCalls.includes('multitouch_conversions_live'), 'the wired read is the one flagged, not pageviews')
})

// ── session-report function target (both reads wired; NodeCache trap) ─────────
// Drives the REAL target through callFn with stub deps. Proves GREEN / RED / INCONCLUSIVE
// / hit-guard, then that the beforeLeg cache eviction is load-bearing (masked vs surfaced).
test('session-report target: GREEN / RED / INCONCLUSIVE / hit-guard via callFn', async () => {
  const t = await TARGETS['session-report']()
  const pvNamed = (src, did) => ({ distinct_id: did, timestamp: '2026-07-01T10:00:00Z', page_url: '/a', utm_source: src, utm_medium: 'cpc', utm_campaign: 'brand', country: 'US', device_type: 'desktop' })
  const PV_KEYS = ['distinct_id', 'timestamp', 'page_url', 'utm_source', 'utm_medium', 'utm_campaign', 'country', 'device_type']
  const pvPos = (o) => PV_KEYS.map((k) => o[k])
  const base = {
    setDeps: t.setDeps, resetDeps: t.resetDeps, callFn: t.callFn, cfg: t.cfg, meaningful: t.meaningful, beforeLeg: t.beforeLeg,
    siteId: 'sr1', params: { date_from: '2026-07-01', date_to: '2026-07-06' }
  }
  // GREEN: same one google session on both legs
  const green = await runParity({
    ...base, label: 'sr-green',
    offLeg: { queryHog: async (_s, name) => name === 'session_report_pageviews' ? [pvPos(pvNamed('google', 'v1'))] : name === 'session_report_conversions' ? [] : [] },
    onLeg: { queryTinybird: async (p) => p === 'session_report_pageviews' ? [pvNamed('google', 'v1')] : p === 'session_report_conversions' ? [] : null }
  })
  assert.strictEqual(green.state, 'GREEN')
  assert.strictEqual(green.guard.hogCalls.length, 0, 'both reads from the pipe — zero HogQL fallback')
  assert.ok(green.guard.tbCalls >= 1)

  // RED: matched dim 'google' but ON has 2 sessions vs OFF 1 -> session_count divergence
  const red = await runParity({
    ...base, siteId: 'sr2', label: 'sr-red',
    offLeg: { queryHog: async (_s, name) => name === 'session_report_pageviews' ? [pvPos(pvNamed('google', 'v1'))] : [] },
    onLeg: { queryTinybird: async (p) => p === 'session_report_pageviews' ? [pvNamed('google', 'v1'), pvNamed('google', 'v2')] : p === 'session_report_conversions' ? [] : null }
  })
  assert.strictEqual(red.state, 'RED')
  assert.ok(red.summary.fails.some((f) => f.path.includes('session_count')), 'divergent session_count flagged')

  // INCONCLUSIVE: both legs empty -> no sessions
  const empty = await runParity({
    ...base, siteId: 'sr3', label: 'sr-empty',
    offLeg: { queryHog: async () => [] },
    onLeg: { queryTinybird: async (p) => (p === 'session_report_pageviews' || p === 'session_report_conversions') ? [] : null }
  })
  assert.strictEqual(empty.state, 'INCONCLUSIVE')

  // hit-guard: ON pipe null -> the WIRED pageviews read falls back to HogQL -> INVALID
  const invalid = await runParity({
    ...base, siteId: 'sr4', label: 'sr-hitguard',
    offLeg: { queryHog: async (_s, name) => name === 'session_report_pageviews' ? [pvPos(pvNamed('google', 'v1'))] : [] },
    onLeg: { queryTinybird: async () => null }
  })
  assert.strictEqual(invalid.state, 'RED')
  assert.strictEqual(invalid.guard.valid, false, 'wired read fell back to HogQL -> INVALID')
})

test('session-report cache trap: beforeLeg eviction is load-bearing (masked without it, surfaced with it)', async () => {
  const t = await TARGETS['session-report']()
  const pvNamed = (did) => ({ distinct_id: did, timestamp: '2026-07-01T10:00:00Z', page_url: '/a', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand', country: 'US', device_type: 'desktop' })
  const PV_KEYS = ['distinct_id', 'timestamp', 'page_url', 'utm_source', 'utm_medium', 'utm_campaign', 'country', 'device_type']
  const pvPos = (o) => PV_KEYS.map((k) => o[k])
  // OFF: 1 google session; ON pipe (if dispatched): 2 google sessions -> would diverge.
  const common = {
    setDeps: t.setDeps, resetDeps: t.resetDeps, callFn: t.callFn, cfg: t.cfg, meaningful: t.meaningful,
    siteId: 'sr-cache', params: { date_from: '2026-07-01', date_to: '2026-07-06' },
    offLeg: { queryHog: async (_s, name) => name === 'session_report_pageviews' ? [pvPos(pvNamed('v1'))] : [] },
    onLeg: { queryTinybird: async (p) => p === 'session_report_pageviews' ? [pvNamed('v1'), pvNamed('v2')] : p === 'session_report_conversions' ? [] : null }
  }
  // clear any residue so the OFF leg actually computes + caches
  t.beforeLeg('sr-cache', 'x', common.params)

  // (a) NO beforeLeg -> ON cache-hits the OFF result -> pipe never dispatched, divergence masked
  const masked = await runParity({ ...common, label: 'masked' })
  assert.strictEqual(masked.guard.tbCalls, 0, 'ON leg cache-hit -> pipe not dispatched')
  assert.strictEqual(masked.guard.fail, true, 'hit-guard fails (dispatch not exercised)')
  assert.ok(!masked.summary.fails.some((f) => f.path.includes('session_count')), 'the divergence is MASKED by the cache')

  // (b) WITH beforeLeg evicting -> ON dispatches the pipe -> real divergence surfaces
  const surfaced = await runParity({ ...common, label: 'surfaced', beforeLeg: t.beforeLeg })
  assert.ok(surfaced.guard.tbCalls >= 1, 'ON leg dispatched the pipe')
  assert.strictEqual(surfaced.state, 'RED')
  assert.ok(surfaced.summary.fails.some((f) => f.path.includes('session_count')), 'the divergence is SURFACED with eviction')
})

// ── explain function target (single-object, non-windowed, partially-wired) ────
// Object-vs-object compare (deepDiff handles it directly). Conversion read is wired;
// the journey read stays HogQL (allowedHogReads). null (no conversion) -> INCONCLUSIVE.
test('explain target: object-compare GREEN / RED / INCONCLUSIVE(null) / hit-guard flags the WIRED read', async () => {
  const t = await TARGETS.explain()
  const CONV_KEYS = ['timestamp', 'conversion_value', 'utm_source', 'utm_medium', 'utm_campaign', 'first_touch_source', 'first_touch_medium', 'first_touch_campaign', 'ai_source', 'page_url', 'user_id', 'anonymous_id', 'ingestion_method']
  const conv = (val) => ({ timestamp: '2026-07-01T11:00:00Z', conversion_value: val, utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand', first_touch_source: 'google', first_touch_medium: 'cpc', first_touch_campaign: 'brand', ai_source: null, page_url: '/checkout', user_id: null, anonymous_id: 'v1', ingestion_method: 'server_routed' })
  const toPos = (o) => CONV_KEYS.map((k) => o[k])
  const JOURNEY = [['$pageview', '2026-07-01T10:00:00Z', '/a', 'google', 'cpc', 'brand', null, null], ['$conversion', '2026-07-01T11:00:00Z', '/checkout', 'google', 'cpc', 'brand', null, 49]]
  const base = { setDeps: t.setDeps, resetDeps: t.resetDeps, callFn: t.callFn, meaningful: t.meaningful, allowedHogReads: t.allowedHogReads, siteId: 's', params: { distinct_id: 'v1' } }
  const offHog = (val) => async (_sql, name) => name === 'attribution_explain_conversion' ? [toPos(conv(val))] : name === 'attribution_explain_journey' ? JOURNEY : []

  // GREEN: pipe conversion == HogQL conversion; journey (allowed) served on both legs
  const green = await runParity({ ...base, offLeg: { queryHog: offHog(49) }, onLeg: { queryTinybird: async (p) => p === 'attribution_explain_conversion' ? [conv(49)] : null } })
  assert.strictEqual(green.state, 'GREEN', 'matching object -> GREEN')
  assert.strictEqual(green.guard.hogCalls.length, 0, 'journey (allowed) not a violation; conversion from pipe -> zero fallback')
  assert.ok(green.guard.tbCalls >= 1, 'ON leg dispatched the conversion pipe')

  // RED: divergent conversion value -> conversion.value cent fail
  const red = await runParity({ ...base, offLeg: { queryHog: offHog(49) }, onLeg: { queryTinybird: async (p) => p === 'attribution_explain_conversion' ? [conv(200)] : null } })
  assert.strictEqual(red.state, 'RED', 'divergent conversion value -> RED')
  assert.ok(red.summary.fails.some((f) => f.path.includes('value')), 'the conversion value divergence is flagged')

  // INCONCLUSIVE: no conversion for the visitor on either leg -> null both -> not a pass
  const empty = await runParity({ ...base, offLeg: { queryHog: async () => [] }, onLeg: { queryTinybird: async (p) => p === 'attribution_explain_conversion' ? [] : null } })
  assert.strictEqual(empty.state, 'INCONCLUSIVE', 'null (no conversion) -> INCONCLUSIVE')

  // hit-guard: pipe null -> the WIRED conversion read falls back to HogQL -> INVALID; the
  // flagged read is the conversion one, NOT the allowlisted journey (which is never reached
  // because a null conversion short-circuits before the journey read).
  const invalid = await runParity({ ...base, offLeg: { queryHog: offHog(49) }, onLeg: { queryTinybird: async () => null } })
  assert.strictEqual(invalid.state, 'RED')
  assert.strictEqual(invalid.guard.valid, false, 'conversion fallback trips the guard')
  assert.ok(invalid.guard.hogCalls.includes('attribution_explain_conversion'), 'the WIRED conversion read is flagged')
  assert.ok(!invalid.guard.hogCalls.includes('attribution_explain_journey'), 'the allowlisted journey read is NOT flagged')
})
