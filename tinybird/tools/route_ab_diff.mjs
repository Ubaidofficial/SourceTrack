#!/usr/bin/env node
// tinybird/tools/route_ab_diff.mjs
//
// Reusable ROUTE-HANDLER A/B parity harness — a TOOL, not prod code.
//
// Gates the W1 read cutover: for a wired handler it runs the SAME request twice
// through the handler's __set<X>ReadDeps seam — an OFF leg (HogQL serves the wired
// reads) and an ON leg (Tinybird pipe serves them) — then diffs the two JSON
// responses at CENT precision with a ZERO-FALLBACK hit-guard. This generalizes
// api/tests/sessions-read-cutover.test.js from STUBBED shape-parity to REAL-DATA
// parity against live staging backends.
//
// Two modes:
//   node route_ab_diff.mjs --stub-selftest
//     Deterministic, NO live creds (CI runs this via the node --test companion).
//     Proves the diff/tolerance/hit-guard logic on known matching/divergent stubs.
//   node route_ab_diff.mjs --live <site_id> [<date_from> <date_to>] [--target sessions|alerts|events-health]
//     Reads REAL staging (ST_Staging pipe vs PostHog 469905 HogQL) for one seeded
//     site (+ window for sessions) and emits a structured parity report. READ-ONLY.
//     No prod, no writes. --target selects the route handler (default sessions).
//
// Tolerance rules (single source of truth, unit-tested below):
//   - integer counts/ids -> EXACT match
//   - money / non-integer floats -> CENT precision (round to integer cents)
//   - row collections -> INTERSECTION on distinct_id/id: a key in BOTH that
//     disagrees = FAIL; a key in only one = ingestion-lag (reported, not a fail)
//   - timestamps -> compare the INTERVAL (min..max, second precision), never absolutes
//   - hit-guard: ON leg calling HogQL = INVALID run; pipe returning null = FAIL
//     (never silently "pass by fallback")

// ─────────────────────────────────────────────────────────────────────────────
// Tolerance + diff engine (pure — exercised by the node --test self-test)
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_CFG = {
  // lowercase; classifyKey lowercases the incoming key before matching
  idKeys: ['distinct_id', 'id', 'visitor_id', 'session_id', 'event_id', 'conversion_event_id', 'order_id'],
  tsKeys: ['timestamp', 'server_timestamp', 'ts', 'first_seen', 'last_seen', 'earliest', 'latest', 'occurred_at'],
  moneyKeys: ['conversion_value', 'revenue', 'value', 'amount', 'mrr', 'total_revenue', 'conversion_value_sum', 'spend', 'net_profit', 'cac', 'cpl']
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE-ARGS CONVENTION — the single source of truth for the args the ROUTE injects.
//
// Three prod false-GREENs came from `callFn` targets hand-supplying args the route actually
// varies: (1) the console.debug log channel, (2) the ALWAYS-injected attribution_window (→ the
// live 504), (3) session-report ignoring filter_* (→ wrong numbers). Root cause: targets tested
// ONE point of the route's arg space. attribution.js (:96-231) injects these on EVERY flexible
// request. Targets and the route-args MATRIX test build args THIS way so a target cannot silently
// omit a dimension. Pair with api/tests/route-args-matrix.test.js (the enforced CI gate).
export const ROUTE_ARG_DEFAULTS = { granularity: 'day', attributionWindow: '30', attributeBy: 'conversion_date', timezone: 'UTC' }

// Build the getFlexibleReport/getSessionReport arg tail exactly as the route does. Overrides:
//   { filters, groupBy2, granularity, attributionWindow (pass null to force no-window), attributeBy, timezone }.
// filters.timezone is ALWAYS present (the route injects it at attribution.js:227) — targets that
// omitted it never exercised the tz gate.
export function buildRouteArgs (over = {}) {
  const timezone = over.timezone ?? ROUTE_ARG_DEFAULTS.timezone
  return {
    filters: { timezone, ...(over.filters || {}) },
    groupBy2: over.groupBy2 ?? null,
    granularity: over.granularity ?? ROUTE_ARG_DEFAULTS.granularity,
    attributionWindow: ('attributionWindow' in over) ? over.attributionWindow : ROUTE_ARG_DEFAULTS.attributionWindow,
    attributeBy: over.attributeBy ?? ROUTE_ARG_DEFAULTS.attributeBy
  }
}

export const toCents = (n) => Math.round(Number(n) * 100)   // integer cents; NaN-safe compare below
export const round2 = (n) => Math.round(Number(n) * 100) / 100

export function classifyKey (key, cfg = DEFAULT_CFG) {
  const k = String(key || '').toLowerCase()
  if (cfg.idKeys.includes(k)) return 'id'
  if (cfg.tsKeys.includes(k)) return 'timestamp'
  if (cfg.moneyKeys.includes(k)) return 'money'
  return 'other'
}

export function tsToMs (v) {
  if (v == null) return null
  if (typeof v === 'number') return v > 1e12 ? v : v * 1000 // epoch-ms vs epoch-s heuristic
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

export function rowKey (o, cfg = DEFAULT_CFG) {
  if (!o || typeof o !== 'object') return null
  // cfg.rowKeyFn: composite key for rows with no single id column — e.g. the touch
  // models key on the (source, medium, campaign) tuple, not one dimension field.
  if (typeof cfg.rowKeyFn === 'function') return cfg.rowKeyFn(o)
  for (const k of cfg.idKeys) if (k in o && o[k] != null) return o[k]
  return null
}

// Interval envelope (min/max ms, second precision compared) over a row collection.
export function intervalOf (rows, cfg = DEFAULT_CFG) {
  const ms = []
  for (const r of rows || []) {
    if (!r || typeof r !== 'object') continue
    for (const k of cfg.tsKeys) {
      if (k in r && r[k] != null) { const t = tsToMs(r[k]); if (t != null) { ms.push(t); break } }
    }
  }
  if (!ms.length) return null
  return { min: Math.min(...ms), max: Math.max(...ms), count: ms.length }
}

function scalarCmp (key, a, b, cfg) {
  const cls = classifyKey(key, cfg)
  if (cls === 'money') return { kind: 'money', pass: toCents(a) === toCents(b), a, b }
  if (cls === 'id') return { kind: 'id', pass: String(a) === String(b), a, b }
  if (typeof a === 'number' && typeof b === 'number') {
    if (Number.isInteger(a) && Number.isInteger(b)) return { kind: 'int', pass: a === b, a, b }
    return { kind: 'float', pass: toCents(a) === toCents(b), a, b } // cent precision for floats
  }
  return { kind: 'scalar', pass: a === b, a, b }
}

function intervalCmp (aRows, bRows, cfg) {
  const ia = intervalOf(aRows, cfg); const ib = intervalOf(bRows, cfg)
  if (!ia || !ib) return null
  const sec = (x, y) => Math.floor(x / 1000) === Math.floor(y / 1000)
  const iso = (iv) => `[${new Date(iv.min).toISOString()}..${new Date(iv.max).toISOString()} n=${iv.count}]`
  return { kind: 'interval', pass: sec(ia.min, ib.min) && sec(ia.max, ib.max), a: iso(ia), b: iso(ib), note: 'timestamp interval (min..max, second precision)' }
}

function diffRows (a, b, cfg, path, out) {
  const mapA = new Map(); const mapB = new Map()
  for (const r of a) { const k = rowKey(r, cfg); if (k != null) mapA.set(String(k), r) }
  for (const r of b) { const k = rowKey(r, cfg); if (k != null) mapB.set(String(k), r) }

  // No id key on either side -> positional fallback (best effort, order-sensitive).
  if (mapA.size === 0 && mapB.size === 0) {
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i++) diffNode(a[i], b[i], cfg, `${path}[${i}]`, out)
    return
  }
  const both = [...mapA.keys()].filter((k) => mapB.has(k))
  const onlyA = [...mapA.keys()].filter((k) => !mapB.has(k))
  const onlyB = [...mapB.keys()].filter((k) => !mapA.has(k))

  for (const k of both) diffNode(mapA.get(k), mapB.get(k), cfg, `${path}[${k}]`, out) // matched: field diff (ts auto-passes)
  for (const k of onlyA) out.push({ path: `${path}[${k}]`, kind: 'row', pass: true, lag: true, a: 'present', b: 'absent', note: 'ingestion-lag: key only in OFF/HogQL' })
  for (const k of onlyB) out.push({ path: `${path}[${k}]`, kind: 'row', pass: true, lag: true, a: 'absent', b: 'present', note: 'ingestion-lag: key only in ON/Tinybird' })

  const iv = intervalCmp(both.map((k) => mapA.get(k)), both.map((k) => mapB.get(k)), cfg) // interval over MATCHED rows
  if (iv) out.push({ path: `${path}::interval`, ...iv })
}

function diffNode (a, b, cfg, path, out) {
  if (a == null && b == null) { out.push({ path, kind: 'nullish', pass: true, a, b }); return }
  if (a == null || b == null) { out.push({ path, kind: 'nullish', pass: false, a, b, note: 'one side null/undefined' }); return }
  const ta = Array.isArray(a) ? 'array' : typeof a
  const tb = Array.isArray(b) ? 'array' : typeof b
  if (ta !== tb) { out.push({ path, kind: 'type', pass: false, a, b, note: `type ${ta} vs ${tb}` }); return }

  if (ta === 'array') {
    const rowsA = a.length && a[0] && typeof a[0] === 'object' && !Array.isArray(a[0])
    const rowsB = b.length && b[0] && typeof b[0] === 'object' && !Array.isArray(b[0])
    if (rowsA || rowsB) { diffRows(a, b, cfg, path, out); return }
    const sa = [...a].map(String).sort(); const sb = [...b].map(String).sort()
    out.push({ path, kind: 'scalar-array', pass: sa.length === sb.length && sa.every((v, i) => v === sb[i]), a: `[len ${a.length}]`, b: `[len ${b.length}]` })
    return
  }
  if (ta === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffNode(a[k], b[k], cfg, path ? `${path}.${k}` : k, out)
    return
  }
  // scalar leaf
  const key = path.split('.').pop().split('[')[0]
  if (classifyKey(key, cfg) === 'timestamp') { out.push({ path, kind: 'timestamp', pass: true, a, b, note: 'absolute ignored (interval compared at collection level)' }); return }
  out.push({ path, ...scalarCmp(key, a, b, cfg) })
}

export function deepDiff (a, b, cfg = DEFAULT_CFG, path = '') {
  const out = []
  diffNode(a, b, cfg, path, out)
  return out
}

export function summarize (findings) {
  const fails = findings.filter((f) => f.pass === false)
  const lags = findings.filter((f) => f.lag === true)
  return { pass: fails.length === 0, fails, lags, total: findings.length }
}

// Zero-fallback hit-guard. ON leg touching HogQL = INVALID; pipe null / never called = FAIL.
export function hitGuardResult ({ hogCalls = [], tbNull = false, tbCalls = 0, expectNoPipe = false } = {}) {
  const hogHit = hogCalls.length > 0
  return {
    valid: !hogHit,
    // Normal targets: the pipe MUST serve (tbCalls>0, non-null) — tbCalls===0 = dispatch not exercised.
    // expectNoPipe targets (a GATE that must divert to HogQL, e.g. a filtered session-report): the pipe
    // must NOT be called — tbCalls>0 means the gate LEAKED (the pipe served a request it should have
    // refused). allowedHogReads still governs the (expected) HogQL calls on the ON leg.
    fail: expectNoPipe ? (tbCalls > 0) : (tbNull || tbCalls === 0),
    hogCalls: [...hogCalls],
    tbNull,
    tbCalls,
    expectNoPipe,
    reason: hogHit
      ? `INVALID: ON leg called HogQL for [${hogCalls.join(',')}] — zero-fallback violated`
      : expectNoPipe
        ? (tbCalls > 0
            ? `FAIL: gate leaked — pipe called ${tbCalls}x for a request that must NOT dispatch`
            : 'OK: gate held — pipe never called (both legs on HogQL, as expected)')
        : tbNull
          ? 'FAIL: Tinybird pipe returned null (would fall back — never pass by fallback)'
          : tbCalls === 0
            ? 'FAIL: Tinybird pipe never called (dispatch not exercised)'
            : 'OK: pipe served non-null and HogQL was not called'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner — drives a handler through its seam twice (OFF=HogQL, ON=Tinybird)
// ─────────────────────────────────────────────────────────────────────────────

function mkRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

export async function runParity ({ label = 'parity', setDeps, resetDeps, handlerFn, mockReq, callFn, siteId, params, offLeg, onLeg, cfg = DEFAULT_CFG, beforeLeg, meaningful, allowedHogReads = [], expectNoPipe = false }) {
  // allowedHogReads: HogQL query NAMES that are EXPECTED on the ON leg because the target
  // reads them from an un-wired leg (e.g. multitouch's 'multitouch_pageviews_live' — only
  // the conversions read has a pipe). These are served identically to the OFF leg and do
  // NOT count as a hit-guard violation; ONLY an unexpected HogQL call (the WIRED read
  // falling back) trips the guard. Keep this narrow — it's per-target, not a blanket bypass.
  const allowedHog = new Set(allowedHogReads)
  // A target is EITHER a route handler ({ handlerFn, mockReq } — drive req/res, capture
  // res.body) OR a function ({ callFn } — a lib fn like getAiPlatformAttributionLive that
  // returns the result object directly; callFn sets the injected deps on its module and
  // returns the value). Both go through the SAME wrapped deps, so every guard (cent
  // precision, intersection, hit-guard, #157 meaningful/empty-window) is identical.
  const invoke = async (wrapped) => {
    if (typeof callFn === 'function') return await callFn(wrapped, { siteId, params })
    setDeps(wrapped)
    const res = mkRes()
    await handlerFn(mockReq(siteId, params), res)
    return res.body
  }
  // beforeLeg (optional): run before EACH leg to reset per-request state a target caches
  // by siteId — e.g. events-health's 120s NodeCache (see the cache-trap self-test).

  // OFF leg (baseline): the wired reads fall through to HogQL (queryTinybird -> null).
  if (beforeLeg) await beforeLeg(siteId, 'OFF', params)
  const hogOff = []
  let bodyA
  try { bodyA = await invoke({ queryTinybird: async () => null, queryHog: async (sql, name) => { hogOff.push(name); return offLeg.queryHog(sql, name) } }) } finally { resetDeps() }

  // ON leg: the wired reads are served by Tinybird; HogQL is a hit-guard spy (must be 0).
  if (beforeLeg) await beforeLeg(siteId, 'ON', params)
  const hogOn = []; let tbNull = false; let tbCalls = 0
  let bodyB
  try {
    bodyB = await invoke({
      queryTinybird: async (pipe, p) => { tbCalls++; const r = await onLeg.queryTinybird(pipe, p); if (r === null) tbNull = true; return r },
      queryHog: async (sql, name) => {
        if (allowedHog.has(name)) return offLeg.queryHog(sql, name) // expected un-wired read — serve like OFF, not a violation
        hogOn.push(name); return [] // unexpected: the wired read fell back to HogQL = INVALID
      }
    })
  } finally { resetDeps() }

  const guard = hitGuardResult({ hogCalls: hogOn, tbNull, tbCalls, expectNoPipe })
  const findings = deepDiff(bodyA, bodyB, cfg)
  const summary = summarize(findings)
  // Three-state verdict. RED is strictly dominant (any divergence / hit-guard failure).
  // Only when parity ALREADY holds do we ask whether the window exercised real data:
  // meaningful(A,B) false on both legs = empty window -> INCONCLUSIVE (a hollow 0==0
  // green that proves nothing about the pipe↔HogQL translation). meaningful is optional;
  // without it a clean parity is GREEN as before.
  let state
  if (!guard.valid || guard.fail || !summary.pass) state = 'RED'
  else if (typeof meaningful === 'function' && !meaningful(bodyA, bodyB)) state = 'INCONCLUSIVE'
  else state = 'GREEN'
  const verdict = state === 'GREEN' // back-compat boolean: true ONLY on a real green
  return { label, guard, findings, summary, state, verdict, A: bodyA, B: bodyB }
}

export function formatReport (r) {
  const lines = []
  lines.push(`── PARITY REPORT · ${r.label}`)
  lines.push(`hit-guard: ${r.guard.reason}`)
  lines.push(`  tbCalls=${r.guard.tbCalls} tbNull=${r.guard.tbNull} hogCallsON=[${r.guard.hogCalls.join(',')}]`)
  lines.push(`fields: ${r.summary.total}  fails: ${r.summary.fails.length}  lags: ${r.summary.lags.length}`)
  for (const f of r.findings) {
    const tag = f.pass === false ? 'FAIL' : (f.lag ? 'LAG ' : 'PASS')
    lines.push(`  [${tag}] ${f.path} (${f.kind})  A=${JSON.stringify(f.a)}  B=${JSON.stringify(f.b)}${f.note ? '  — ' + f.note : ''}`)
  }
  const verdictLine = r.state === 'GREEN'
    ? 'GREEN (parity, data exercised)'
    : r.state === 'INCONCLUSIVE'
      ? 'INCONCLUSIVE — empty window, no data exercised; seed recent data and re-run'
      : 'RED (divergence/invalid)'
  lines.push(`VERDICT: ${verdictLine}`)
  return lines.join('\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// Self-test fixture — a fake wired handler that mirrors the sessions readTb
// dispatch (Tinybird-first, HogQL fallback; named pipe rows remapped to the
// HogQL positional shape). Shared by --stub-selftest and the node --test file.
// ─────────────────────────────────────────────────────────────────────────────

let _stTb = async () => null
let _stHog = async () => []
export function __setStubDeps ({ queryTinybird, queryHog } = {}) { if (queryTinybird) _stTb = queryTinybird; if (queryHog) _stHog = queryHog }
export function __resetStubDeps () { _stTb = async () => null; _stHog = async () => [] }

export async function stubConversionsHandler (req, res) {
  const siteId = String(req.site.id)
  const tb = await _stTb('demo_conversions', { site_id: siteId })
  const rows = tb !== null
    ? tb.map((r) => [r.distinct_id, r.timestamp, r.conversion_value]) // named -> positional (mirrors sessions.js)
    : await _stHog('SELECT distinct_id, timestamp, conversion_value ...', 'demo_conversions')
  const conversions = rows.map((r) => ({ distinct_id: r[0], timestamp: r[1], conversion_value: Number(r[2]) || 0 }))
  const revenue = round2(conversions.reduce((s, c) => s + c.conversion_value, 0))
  res.json({ success: true, data: { count: conversions.length, revenue, conversions } })
}

export const STUB_HARNESS = {
  setDeps: __setStubDeps,
  resetDeps: __resetStubDeps,
  handlerFn: stubConversionsHandler,
  mockReq: (siteId) => ({ site: { id: siteId }, query: {} })
}

// Deterministic scenarios (also asserted by the node --test companion).
const POS = (r) => [r.distinct_id, r.timestamp, r.conversion_value]      // HogQL positional
const NAMED = (r) => ({ distinct_id: r.distinct_id, timestamp: r.timestamp, conversion_value: r.conversion_value })
const A_ROW = { distinct_id: 'a', timestamp: '2026-07-01T10:00:00Z', conversion_value: 42.5 }
const B_ROW = { distinct_id: 'b', timestamp: '2026-07-01T12:30:00Z', conversion_value: 10 }

export const SELFTEST_SCENARIOS = {
  // ON == OFF (with a sub-cent float wobble that rounds to the same cents) -> GREEN
  match: {
    expectVerdict: true,
    offLeg: { queryHog: async () => [POS(A_ROW), POS(B_ROW)] },
    onLeg: { queryTinybird: async () => [NAMED({ ...A_ROW, conversion_value: 42.504 }), NAMED(B_ROW)] }
  },
  // whole-cent money divergence on a matched key -> RED
  moneyDiverge: {
    expectVerdict: false,
    offLeg: { queryHog: async () => [POS(A_ROW), POS(B_ROW)] },
    onLeg: { queryTinybird: async () => [NAMED({ ...A_ROW, conversion_value: 42.51 }), NAMED(B_ROW)] }
  },
  // pipe returns null on the ON leg -> handler falls back to HogQL -> INVALID + FAIL -> RED
  hitGuard: {
    expectVerdict: false,
    offLeg: { queryHog: async () => [POS(A_ROW), POS(B_ROW)] },
    onLeg: { queryTinybird: async () => null }
  }
}

export async function runStubScenario (name) {
  const s = SELFTEST_SCENARIOS[name]
  const r = await runParity({
    label: `stub:${name}`,
    setDeps: STUB_HARNESS.setDeps,
    resetDeps: STUB_HARNESS.resetDeps,
    handlerFn: STUB_HARNESS.handlerFn,
    mockReq: STUB_HARNESS.mockReq,
    siteId: 'stub-site',
    params: {},
    offLeg: s.offLeg,
    onLeg: s.onLeg
  })
  return { name, report: r, expectVerdict: s.expectVerdict, ok: r.verdict === s.expectVerdict }
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const LIVE_ENV = {
  tinybird: ['TINYBIRD_READ_ENABLED', 'TINYBIRD_HOST', 'TINYBIRD_READ_TOKEN'],
  posthog: ['POSTHOG_HOST', 'POSTHOG_PROJECT_ID', 'POSTHOG_PERSONAL_API_KEY']
}

const _num = (x) => Number(x) || 0
const _sumConv = (rows) => Array.isArray(rows) ? rows.reduce((s, r) => s + (Number(r?.conversions) || 0), 0) : 0

// Function-target factory for the 4 touch-model attribution reads (already dual-wired &
// flipped in prod, but never validated by this harness). Each is a lib fn returning an
// array of { source, medium, campaign, conversions, revenue } keyed by the (source,
// medium, campaign) tuple — so cfg.rowKeyFn intersects on that composite (not one field).
const _touchModelTarget = (fnName) => async () => {
  const mod = await import('../../api/lib/attribution-engine.js')
  const tb = await import('../../api/lib/tinybird-read.js')
  const ph = await import('../../api/lib/posthog.js')
  return {
    setDeps: mod.__setAttributionReadDeps,
    resetDeps: mod.__resetAttributionReadDeps,
    callFn: (deps, { siteId, params }) => {
      mod.__setAttributionReadDeps(deps)
      return mod[fnName](siteId, params.date_from, params.date_to)
    },
    cfg: { ...DEFAULT_CFG, rowKeyFn: (r) => `${r?.source}|${r?.medium}|${r?.campaign}` },
    // empty window (no conversions across sources) -> INCONCLUSIVE, not a hollow green.
    meaningful: (A, B) => _sumConv(A) > 0 || _sumConv(B) > 0,
    realTb: tb.queryTinybirdPipe,
    realHog: ph.queryHogQL
  }
}

// --live TARGET registry. Each loader dynamically imports the route module (so
// --stub-selftest stays creds/import-free) and returns a uniform shape:
// { handlerFn, setDeps, resetDeps, mockReq, realTb, realHog, beforeLeg?, meaningful? }.
// Handler-reach + mockReq mirror the corresponding read-cutover test EXACTLY.
// meaningful(A,B): true when the trailing window actually exercised data (a non-zero
// field on either leg). false on BOTH legs -> INCONCLUSIVE (empty-window hollow green).
export const TARGETS = {
  // sessions_pageviews + sessions_conversions via sessionsOverview.
  sessions: async () => {
    const mod = await import('../../api/routes/sessions.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    return {
      handlerFn: mod.sessionsOverview,
      setDeps: mod.__setSessionsReadDeps,
      resetDeps: mod.__resetSessionsReadDeps,
      mockReq: (siteId, params) => ({ site: { id: siteId }, query: { date_from: params.date_from, date_to: params.date_to } }),
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL,
      meaningful: (A, B) => _num(A?.data?.total_sessions) > 0 || _num(B?.data?.total_sessions) > 0
    }
  },
  // alert_traffic + alert_conversions + alert_recent via the alerts '/' handler
  // (the handler reads all three, so they flip together).
  alerts: async () => {
    const mod = await import('../../api/routes/alerts.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    const layer = mod.alertsRouter.stack.find((l) => l.route && l.route.path === '/')
    const handlerFn = layer.route.stack[layer.route.stack.length - 1].handle
    return {
      handlerFn,
      setDeps: mod.__setAlertsReadDeps,
      resetDeps: mod.__resetAlertsReadDeps,
      // TRAP: the handler calls requireFeature(req.site?.plan, 'alerts', ...) and 403s
      // early on a plan without Alerts. Plan 'business' HAS it (mirrors the read-cutover
      // reqSite) — otherwise we'd "prove" parity on two error pages. No date params (the
      // pipes window on now() - INTERVAL server-side).
      mockReq: (siteId) => ({ site: { id: siteId, plan: 'business' }, query: {} }),
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL,
      // count = number of alerts fired; 0 on both legs = trailing window had no data.
      meaningful: (A, B) => _num(A?.data?.count) > 0 || _num(B?.data?.count) > 0
    }
  },
  // events_health_last + _hour + _day via the events '/health' handler.
  'events-health': async () => {
    const mod = await import('../../api/routes/events.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    const layer = mod.eventsRouter.stack.find((l) => l.route && l.route.path === '/health')
    const handlerFn = layer.route.stack[layer.route.stack.length - 1].handle
    return {
      handlerFn,
      setDeps: mod.__setEventsReadDeps,
      resetDeps: mod.__resetEventsReadDeps,
      mockReq: (siteId) => ({ site: { id: siteId }, query: {} }),
      // CRITICAL: /health caches [last,hour,day] under health:<siteId> for 120s. Evict
      // before each leg so the ON leg actually dispatches instead of returning the OFF
      // leg's cached result. Without this the run is a hit-guard failure, not real parity.
      beforeLeg: (siteId) => mod.__evictHealthCache(siteId),
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL,
      // last_event PRESENT (most-recent-event ts) is the meaningfulness signal — it
      // exercises the timestamp normalize even on stale fixtures. count_hour/count_day
      // may legitimately be 0 on a stale window, so they are NOT required.
      meaningful: (A, B) => A?.data?.last_event != null || B?.data?.last_event != null
    }
  },
  // FUNCTION target (breaker #2): getAiPlatformAttributionLive is a LIB fn (returns a
  // value), not a route handler — driven via callFn, not handlerFn/mockReq. Format-fixed
  // by #155 but never parity-proven. Seam (__setAttributionReadDeps) already exists.
  'ai-platform': async () => {
    const mod = await import('../../api/lib/attribution-engine.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    return {
      setDeps: mod.__setAttributionReadDeps,
      resetDeps: mod.__resetAttributionReadDeps,
      // callFn sets the injected (wrapped) deps on the module then returns the result
      // array directly. Takes a date window like sessions. The ON leg's pipe calls flow
      // through the wrapped queryTinybird (tbCalls counted); any HogQL touch is recorded
      // by the wrapped queryHog -> hit-guard INVALID, exactly as for route targets.
      callFn: (deps, { siteId, params }) => {
        mod.__setAttributionReadDeps(deps)
        return mod.getAiPlatformAttributionLive({ siteId, dateFrom: params.date_from, dateTo: params.date_to })
      },
      // Rows are grouped by dim_value (the AI source), not distinct_id — intersect on it.
      cfg: { ...DEFAULT_CFG, idKeys: [...DEFAULT_CFG.idKeys, 'dim_value', 'dim_value2'] },
      // No AI-source conversions in the window -> empty rows -> INCONCLUSIVE, not a hollow
      // green. (The seeded window may lack AI-source data — expect INCONCLUSIVE until seeded.)
      meaningful: (A, B) => _sumConv(A) > 0 || _sumConv(B) > 0,
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL
    }
  },
  // Multi-touch (W1-bb): the biggest money-rail read, NOW FULLY WIRED. FUNCTION target. BOTH the
  // conversions read (multitouch_conversions_by_site) AND the pageviews read
  // (multitouch_pageviews_live) have pipes — so NO allowedHogReads. Once the pageviews leg is
  // wired, a HogQL read there is a REAL fallback, not an expected un-wired read; the hit-guard
  // must flag it (either leg falling back to HogQL on the ON leg -> INVALID). The stale
  // allowedHogReads:['multitouch_pageviews_live'] exemption that excused the old gap is removed.
  multitouch: async () => {
    const mod = await import('../../api/lib/attribution-engine.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    return {
      setDeps: mod.__setAttributionReadDeps,
      resetDeps: mod.__resetAttributionReadDeps,
      callFn: (deps, { siteId, params }) => {
        mod.__setAttributionReadDeps(deps)
        return mod.getMultiTouchAttributionLive({ siteId, model: 'linear', groupBy: 'source', dateFrom: params.date_from, dateTo: params.date_to })
      },
      // result is grouped by dim_value (the source) — intersect on it, like ai-platform.
      cfg: { ...DEFAULT_CFG, idKeys: [...DEFAULT_CFG.idKeys, 'dim_value', 'dim_value2'] },
      allowedHogReads: [], // fully wired — no expected HogQL reads; any fallback trips the guard
      meaningful: (A, B) => _sumConv(A) > 0 || _sumConv(B) > 0,
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL
    }
  },
  // Session report (W1-bc1): revenue/metric-by-dimension. FUNCTION target. BOTH reads
  // (session_report_pageviews + session_report_conversions) have pipes -> no allowedHogReads.
  // TRAP: getSessionReport caches on its full key and returns cached -> the ON leg would read
  // the OFF result. beforeLeg evicts that key before EACH leg (mirrors events-health).
  'session-report': async () => {
    const mod = await import('../../api/lib/attribution-engine.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    // Fixed report shape for the proof; callFn AND beforeLeg must use the SAME params so the
    // evicted cache key matches the one getSessionReport writes.
    const R = { groupBy: 'source', metric: 'session_count', filters: {}, groupBy2: null }
    return {
      setDeps: mod.__setAttributionReadDeps,
      resetDeps: mod.__resetAttributionReadDeps,
      callFn: (deps, { siteId, params }) => {
        mod.__setAttributionReadDeps(deps)
        return mod.getSessionReport(siteId, params.date_from, params.date_to, R.groupBy, R.metric, R.filters, R.groupBy2)
      },
      beforeLeg: (siteId, _leg, params) => mod.__evictSessionReportCache(siteId, params.date_from, params.date_to, R.groupBy, R.metric, R.filters, R.groupBy2),
      // grouped by dim_value (the source dimension) — intersect on it.
      cfg: { ...DEFAULT_CFG, idKeys: [...DEFAULT_CFG.idKeys, 'dim_value', 'dim_value2'] },
      // metric rows non-empty on either leg = the window exercised sessions.
      meaningful: (A, B) => (Array.isArray(A) && A.length > 0) || (Array.isArray(B) && B.length > 0),
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL
    }
  },
  // Session report with a CONTENT FILTER — proves the filter gate. getSessionReport calls the pipes
  // WITHOUT filter_* params, so a filtered request must fall back to HogQL (which applies the filter);
  // otherwise the pipe returns UNFILTERED rows and over-counts. WITHOUT the gate: ON-leg pipe
  // (unfiltered) vs OFF-leg HogQL (filtered) -> RED. WITH the gate: the pipe is never called for a
  // filtered request, so BOTH legs use HogQL (allowedHogReads) -> identical. The filter value must
  // match rows in the --live fixture for meaningful() to hold.
  'session-report-filtered': async () => {
    const mod = await import('../../api/lib/attribution-engine.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    const R = { groupBy: 'source', metric: 'session_count', filters: { source: 'google' }, groupBy2: null }
    return {
      setDeps: mod.__setAttributionReadDeps,
      resetDeps: mod.__resetAttributionReadDeps,
      callFn: (deps, { siteId, params }) => {
        mod.__setAttributionReadDeps(deps)
        return mod.getSessionReport(siteId, params.date_from, params.date_to, R.groupBy, R.metric, R.filters, R.groupBy2)
      },
      beforeLeg: (siteId, _leg, params) => mod.__evictSessionReportCache(siteId, params.date_from, params.date_to, R.groupBy, R.metric, R.filters, R.groupBy2),
      // ⚠️ THIS TARGET IS NOT A PARITY PROOF. Its ONLY job is to prove the FILTER GATE (#174) diverts a
      // filtered request AWAY from the pipe. With the gate, BOTH legs run HogQL, so identical values are
      // trivially true (HogQL==HogQL) and prove NOTHING about the pipe — do NOT read its GREEN as
      // pipe-parity. The real signal is expectNoPipe: the guard REQUIRES tbCalls===0 (gate held) and
      // FAILS if the pipe is called (gate leaked -> a filtered request would over-count). allowedHogReads
      // makes the expected both-legs-HogQL legal.
      expectNoPipe: true,
      allowedHogReads: ['session_report_pageviews', 'session_report_conversions'],
      cfg: { ...DEFAULT_CFG, idKeys: [...DEFAULT_CFG.idKeys, 'dim_value', 'dim_value2'] },
      meaningful: (A, B) => (Array.isArray(A) && A.length > 0) || (Array.isArray(B) && B.length > 0),
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL
    }
  },
  // Attribution explanation (W1-bc2): single-conversion "why". FUNCTION target, and unlike
  // every other target it is NON-WINDOWED (keyed by --distinct-id) and returns a SINGLE
  // OBJECT (or null). deepDiff compares object-vs-object directly (no rowKey/intersection);
  // null on both legs -> INCONCLUSIVE. Only the CONVERSION read has a pipe; the journey read
  // stays HogQL on both legs (allowedHogReads).
  explain: async () => {
    const mod = await import('../../api/lib/attribution-engine.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    return {
      setDeps: mod.__setAttributionReadDeps,
      resetDeps: mod.__resetAttributionReadDeps,
      callFn: (deps, { siteId, params }) => {
        mod.__setAttributionReadDeps(deps)
        return mod.getAttributionExplanation(siteId, 'last_touch', params.distinct_id)
      },
      allowedHogReads: ['attribution_explain_journey'],
      // a conversion exists for this visitor -> meaningful; null (no conversion) -> INCONCLUSIVE.
      meaningful: (A, B) => A != null || B != null,
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL
    }
  },
  // flexible_report BASE CASE (parity proof, INERT): source × first_touch × conversions, wired
  // pipe-first to flexible_report_main_by_site. The ON leg reads ONLY the pipe for the base case
  // (no pageviews/HogQL leg) -> NO allowedHogReads; any HogQL 'flexible_report' on the ON leg
  // trips the hit-guard (correct — the base case must not fall back). getFlexibleReport caches by
  // full key, so beforeLeg evicts it before EACH leg (mirrors session-report). NOTE: the live sql
  // applies an external_event_id conversion-dedup the pipe omits — this target is exactly what
  // proves whether that (or anything) diverges before Class-A pipes scale the pattern.
  'flexible-report': async () => {
    const mod = await import('../../api/lib/attribution-engine.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    // Base case (source×first_touch) can ONLY serve when NO window is active — the window re-attributes
    // source. The route ALWAYS injects a window, so this path is rarely hit in prod (#168). Route-faithful
    // args via buildRouteArgs, with attributionWindow=null (the only window value the base pipe serves)
    // and filters.timezone included.
    const A = buildRouteArgs({ attributionWindow: null })
    const R = { model: 'first_touch', groupBy: 'source', metric: 'conversions' }
    return {
      setDeps: mod.__setAttributionReadDeps,
      resetDeps: mod.__resetAttributionReadDeps,
      callFn: (deps, { siteId, params }) => {
        mod.__setAttributionReadDeps(deps)
        return mod.getFlexibleReport(siteId, R.model, params.date_from, params.date_to, R.groupBy, R.metric, A.filters, A.groupBy2, A.granularity, A.attributionWindow, A.attributeBy)
      },
      beforeLeg: (siteId, _leg, params) => mod.__evictFlexibleReportCache(siteId, R.model, params.date_from, params.date_to, R.groupBy, R.metric, A.filters, A.groupBy2, A.granularity, A.attributionWindow, A.attributeBy),
      // rows are { dim_value, conversions } — intersect on dim_value; DEFAULT_CFG cent-precision on values.
      cfg: { ...DEFAULT_CFG, rowKeyFn: (r) => String(r?.dim_value) },
      meaningful: (A, B) => (Array.isArray(A) && A.length > 0) || (Array.isArray(B) && B.length > 0),
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL
    }
  },
  // flexible_report PROVIDER (Class-A dim-swap, INERT): group_by=provider on last_touch_non_direct —
  // the LIVE PROD 504 this pipe fixes. provider is a conversion-property dim (model-independent, no
  // _nd), so the pipe omits the dead _nd join the HogQL leg adds; this target proves that omission is
  // value-identical. ON leg reads ONLY flexible_report_provider_by_site -> NO allowedHogReads (any
  // HogQL 'flexible_report' on the ON leg trips the hit-guard). Cache-evict beforeLeg like the base case.
  'flexible-report-provider': async () => {
    const mod = await import('../../api/lib/attribution-engine.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    // Route-faithful args via buildRouteArgs: attributionWindow='30' (the route's injected default —
    // the prior target passed null and never exercised the windowed path, the reason the 504 wasn't
    // caught) and filters.timezone. This run compares the pipe against the WINDOWED HogQL, proving the
    // window is a no-op for a conversion-property dim.
    const A = buildRouteArgs({})
    const R = { model: 'last_touch_non_direct', groupBy: 'provider', metric: 'conversions' }
    return {
      setDeps: mod.__setAttributionReadDeps,
      resetDeps: mod.__resetAttributionReadDeps,
      callFn: (deps, { siteId, params }) => {
        mod.__setAttributionReadDeps(deps)
        return mod.getFlexibleReport(siteId, R.model, params.date_from, params.date_to, R.groupBy, R.metric, A.filters, A.groupBy2, A.granularity, A.attributionWindow, A.attributeBy)
      },
      beforeLeg: (siteId, _leg, params) => mod.__evictFlexibleReportCache(siteId, R.model, params.date_from, params.date_to, R.groupBy, R.metric, A.filters, A.groupBy2, A.granularity, A.attributionWindow, A.attributeBy),
      cfg: { ...DEFAULT_CFG, rowKeyFn: (r) => String(r?.dim_value) },
      meaningful: (A, B) => (Array.isArray(A) && A.length > 0) || (Array.isArray(B) && B.length > 0),
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL
    }
  },
  // flexible_report ATTRIBUTION_STATUS (Class-A sibling #2, INERT): another conversion-property dim
  // (ATTRIBUTION_STATUS_SQL, model-independent, no _nd) — same window-tolerant treatment as provider.
  // Route-faithful args (windowed + filters.timezone) via buildRouteArgs; ON leg reads ONLY the pipe
  // -> NO allowedHogReads (any HogQL 'flexible_report' on the ON leg trips the hit-guard).
  'flexible-report-attribution-status': async () => {
    const mod = await import('../../api/lib/attribution-engine.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    const A = buildRouteArgs({})
    const R = { model: 'last_touch_non_direct', groupBy: 'attribution_status', metric: 'conversions' }
    return {
      setDeps: mod.__setAttributionReadDeps,
      resetDeps: mod.__resetAttributionReadDeps,
      callFn: (deps, { siteId, params }) => {
        mod.__setAttributionReadDeps(deps)
        return mod.getFlexibleReport(siteId, R.model, params.date_from, params.date_to, R.groupBy, R.metric, A.filters, A.groupBy2, A.granularity, A.attributionWindow, A.attributeBy)
      },
      beforeLeg: (siteId, _leg, params) => mod.__evictFlexibleReportCache(siteId, R.model, params.date_from, params.date_to, R.groupBy, R.metric, A.filters, A.groupBy2, A.granularity, A.attributionWindow, A.attributeBy),
      cfg: { ...DEFAULT_CFG, rowKeyFn: (r) => String(r?.dim_value) },
      meaningful: (A, B) => (Array.isArray(A) && A.length > 0) || (Array.isArray(B) && B.length > 0),
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL
    }
  },
  // flexible_report STITCHING_METHOD (Class-A sibling #3, INERT): independent conversion-property dim
  // (STITCHING_METHOD_SQL, own fallback, model-independent, no _nd) — same window-tolerant treatment.
  // Route-faithful args (windowed + filters.timezone) via buildRouteArgs; ON leg reads ONLY the pipe
  // -> NO allowedHogReads.
  'flexible-report-stitching-method': async () => {
    const mod = await import('../../api/lib/attribution-engine.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    const A = buildRouteArgs({})
    const R = { model: 'last_touch_non_direct', groupBy: 'stitching_method', metric: 'conversions' }
    return {
      setDeps: mod.__setAttributionReadDeps,
      resetDeps: mod.__resetAttributionReadDeps,
      callFn: (deps, { siteId, params }) => {
        mod.__setAttributionReadDeps(deps)
        return mod.getFlexibleReport(siteId, R.model, params.date_from, params.date_to, R.groupBy, R.metric, A.filters, A.groupBy2, A.granularity, A.attributionWindow, A.attributeBy)
      },
      beforeLeg: (siteId, _leg, params) => mod.__evictFlexibleReportCache(siteId, R.model, params.date_from, params.date_to, R.groupBy, R.metric, A.filters, A.groupBy2, A.granularity, A.attributionWindow, A.attributeBy),
      cfg: { ...DEFAULT_CFG, rowKeyFn: (r) => String(r?.dim_value) },
      meaningful: (A, B) => (Array.isArray(A) && A.length > 0) || (Array.isArray(B) && B.length > 0),
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL
    }
  },
  // flexible_report CONVERSION_TYPE (Class-A sibling #4, FINAL, INERT): conversion-property dim (plain
  // COALESCE(...,'untyped'), model-independent, no _nd) — same window-tolerant treatment. Route-faithful
  // args (windowed + filters.timezone) via buildRouteArgs; ON leg reads ONLY the pipe -> NO allowedHogReads.
  'flexible-report-conversion-type': async () => {
    const mod = await import('../../api/lib/attribution-engine.js')
    const tb = await import('../../api/lib/tinybird-read.js')
    const ph = await import('../../api/lib/posthog.js')
    const A = buildRouteArgs({})
    const R = { model: 'last_touch_non_direct', groupBy: 'conversion_type', metric: 'conversions' }
    return {
      setDeps: mod.__setAttributionReadDeps,
      resetDeps: mod.__resetAttributionReadDeps,
      callFn: (deps, { siteId, params }) => {
        mod.__setAttributionReadDeps(deps)
        return mod.getFlexibleReport(siteId, R.model, params.date_from, params.date_to, R.groupBy, R.metric, A.filters, A.groupBy2, A.granularity, A.attributionWindow, A.attributeBy)
      },
      beforeLeg: (siteId, _leg, params) => mod.__evictFlexibleReportCache(siteId, R.model, params.date_from, params.date_to, R.groupBy, R.metric, A.filters, A.groupBy2, A.granularity, A.attributionWindow, A.attributeBy),
      cfg: { ...DEFAULT_CFG, rowKeyFn: (r) => String(r?.dim_value) },
      meaningful: (A, B) => (Array.isArray(A) && A.length > 0) || (Array.isArray(B) && B.length > 0),
      realTb: tb.queryTinybirdPipe,
      realHog: ph.queryHogQL
    }
  },
  // The 4 touch-model reads — already wired/flipped in prod (pipes in the 6-pipe
  // allowlist), but never validated by this harness's cent/intersection/hit-guard/
  // empty-window guards. Tool-only: proof, no wiring change.
  'first-touch': _touchModelTarget('firstTouchAttribution'),
  'last-touch': _touchModelTarget('lastTouchAttribution'),
  'first-touch-non-direct': _touchModelTarget('firstTouchNonDirectAttribution'),
  'last-touch-non-direct': _touchModelTarget('lastTouchNonDirectAttribution')
}

// Tool-internal fixture for the cache-trap self-test: a handler that caches its
// result by siteId exactly like events '/health', so the test can prove eviction is
// load-bearing WITHOUT importing the real route (deterministic, no creds).
export function __makeCacheTrapHarness () {
  const cache = new Map()
  let _tb = async () => null
  let _hog = async () => []
  return {
    setDeps: ({ queryTinybird, queryHog } = {}) => { if (queryTinybird) _tb = queryTinybird; if (queryHog) _hog = queryHog },
    resetDeps: () => { _tb = async () => null; _hog = async () => [] },
    evict: (siteId) => cache.delete(siteId),
    mockReq: (siteId) => ({ site: { id: siteId }, query: {} }),
    handlerFn: async (req, res) => {
      const k = req.site.id
      if (cache.has(k)) { res.json(cache.get(k)); return } // cache HIT: no dep call (mirrors /health)
      const tb = await _tb('cache_demo', { site_id: k })
      const revenue = tb !== null ? Number(tb[0].conversion_value) : Number((await _hog('', 'cache_demo'))[0][0])
      const body = { success: true, data: { revenue } }
      cache.set(k, body)
      res.json(body)
    }
  }
}

// Tool-internal fixture for the FUNCTION-target self-test: a callFn that mirrors the
// getAiPlatformAttributionLive dispatch (read a pipe via the injected deps, fall back to
// HogQL, return an array of { dim_value, revenue, conversions }) WITHOUT importing the
// real lib. Proves the callFn path threads every guard. cfg intersects on dim_value.
export function __makeFnTargetHarness () {
  return {
    setDeps: () => {}, // deps arrive per-call via callFn(deps); no module state to set
    resetDeps: () => {},
    cfg: { ...DEFAULT_CFG, idKeys: [...DEFAULT_CFG.idKeys, 'dim_value'] },
    meaningful: (A, B) => _sumConv(A) > 0 || _sumConv(B) > 0,
    callFn: async (deps) => {
      const tb = await deps.queryTinybird('aiplatform_conversions_by_site', {})
      return tb !== null ? tb : await deps.queryHog('', 'aiplatform_conversions_live') // null pipe -> HogQL (INVALID on ON leg)
    }
  }
}

async function runStubSelfTest () {
  let allOk = true
  for (const name of Object.keys(SELFTEST_SCENARIOS)) {
    const { report, expectVerdict, ok } = await runStubScenario(name)
    console.log(formatReport(report))
    console.log(`  expectVerdict=${expectVerdict} got=${report.verdict} -> ${ok ? 'OK' : 'SELF-TEST FAILURE'}\n`)
    allOk = allOk && ok
  }
  console.log(allOk ? 'STUB SELF-TEST: PASS' : 'STUB SELF-TEST: FAIL')
  process.exit(allOk ? 0 : 1)
}

// Targets that require an explicit <date_from> <date_to> window (the rest window on now()).
const WINDOWED_TARGETS = new Set(['sessions', 'ai-platform', 'multitouch', 'session-report', 'first-touch', 'last-touch', 'first-touch-non-direct', 'last-touch-non-direct'])
const USAGE = 'usage: node route_ab_diff.mjs [--stub-selftest | --live <site_id> [<date_from> <date_to>] [--target sessions|alerts|events-health|ai-platform|multitouch|session-report|explain|first-touch|last-touch|first-touch-non-direct|last-touch-non-direct] [--distinct-id <id> (explain only)]]'

// Flags that take a value; their value token must be dropped from the positionals.
const VALUE_FLAGS = new Set(['--target', '--distinct-id'])

async function runLive (args) {
  const tIdx = args.indexOf('--target')
  const target = tIdx >= 0 ? args[tIdx + 1] : 'sessions'
  if (!TARGETS[target]) {
    console.error(`unknown --target '${target}'. Known: ${Object.keys(TARGETS).join(', ')}`)
    process.exit(2)
  }
  const dIdx = args.indexOf('--distinct-id')
  const distinctId = dIdx >= 0 ? args[dIdx + 1] : null
  const liveIdx = args.indexOf('--live')
  const positionals = args.slice(liveIdx + 1).filter((a, idx, arr) => !VALUE_FLAGS.has(a) && !VALUE_FLAGS.has(arr[idx - 1]) && !a.startsWith('--'))
  const [siteId, dateFrom, dateTo] = positionals
  if (!siteId) { console.error(USAGE); process.exit(2) }
  if (WINDOWED_TARGETS.has(target) && (!dateFrom || !dateTo)) {
    console.error(`target '${target}' requires <date_from> <date_to> (alerts/events-health window on now() server-side)`)
    process.exit(2)
  }
  // explain is non-windowed and keyed by a single visitor.
  if (target === 'explain' && !distinctId) {
    console.error("target 'explain' requires --distinct-id <id> (a visitor that HAS a conversion in the fixture)")
    process.exit(2)
  }
  // Preflight: names only — NEVER print token values. Missing -> STOP (founder provides).
  const missing = [...LIVE_ENV.tinybird, ...LIVE_ENV.posthog].filter((k) => !process.env[k])
  if (missing.length) {
    console.error('BLOCKED — missing staging read creds/env (names only): ' + missing.join(', '))
    console.error('STOP: the founder must provide these (staging Tinybird read token+host, staging PostHog 469905 key). Never paste token values to chat.')
    process.exit(3)
  }
  if (String(process.env.POSTHOG_PROJECT_ID) !== '469905') {
    console.error(`REFUSING: POSTHOG_PROJECT_ID=${process.env.POSTHOG_PROJECT_ID} is not the staging project (469905). Won't verify against the wrong environment.`)
    process.exit(3)
  }
  const t = await TARGETS[target]()
  const report = await runParity({
    label: `${target} @ site=${siteId}${distinctId ? ` visitor=${distinctId}` : ''}${dateFrom ? ` [${dateFrom}..${dateTo}]` : ''} (ST_Staging vs PostHog 469905)`,
    setDeps: t.setDeps,
    resetDeps: t.resetDeps,
    handlerFn: t.handlerFn,
    mockReq: t.mockReq,
    callFn: t.callFn,
    cfg: t.cfg || DEFAULT_CFG,
    siteId,
    params: { date_from: dateFrom, date_to: dateTo, distinct_id: distinctId },
    offLeg: { queryHog: t.realHog },
    onLeg: { queryTinybird: t.realTb },
    beforeLeg: t.beforeLeg,
    meaningful: t.meaningful,
    allowedHogReads: t.allowedHogReads,
    expectNoPipe: t.expectNoPipe
  })
  console.log(formatReport(report))
  // Exit codes: GREEN=0, RED=1, INCONCLUSIVE=4 (empty window — NOT a success; must not
  // be read as a pass by a caller that only checks exit 0).
  process.exit(report.state === 'GREEN' ? 0 : report.state === 'INCONCLUSIVE' ? 4 : 1)
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (invokedDirectly) {
  const args = process.argv.slice(2)
  if (args.includes('--stub-selftest')) await runStubSelfTest()
  else if (args.includes('--live')) await runLive(args)
  else { console.error(USAGE); process.exit(2) }
}
