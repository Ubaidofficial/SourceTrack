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
//   node route_ab_diff.mjs --live <site_id> <date_from> <date_to>
//     Reads REAL staging (ST_Staging pipe vs PostHog 469905 HogQL) for one seeded
//     site+window and emits a structured parity report. READ-ONLY. No prod, no writes.
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
export function hitGuardResult ({ hogCalls = [], tbNull = false, tbCalls = 0 } = {}) {
  const hogHit = hogCalls.length > 0
  return {
    valid: !hogHit,
    fail: tbNull || tbCalls === 0,
    hogCalls: [...hogCalls],
    tbNull,
    tbCalls,
    reason: hogHit
      ? `INVALID: ON leg called HogQL for [${hogCalls.join(',')}] — zero-fallback violated`
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

export async function runParity ({ label = 'parity', setDeps, resetDeps, handlerFn, mockReq, siteId, params, offLeg, onLeg, cfg = DEFAULT_CFG }) {
  // OFF leg (baseline): the wired reads fall through to HogQL (queryTinybird -> null).
  const hogOff = []
  setDeps({ queryTinybird: async () => null, queryHog: async (sql, name) => { hogOff.push(name); return offLeg.queryHog(sql, name) } })
  const resA = mkRes()
  try { await handlerFn(mockReq(siteId, params), resA) } finally { resetDeps() }

  // ON leg: the wired reads are served by Tinybird; HogQL is a hit-guard spy (must be 0).
  const hogOn = []; let tbNull = false; let tbCalls = 0
  setDeps({
    queryTinybird: async (pipe, p) => { tbCalls++; const r = await onLeg.queryTinybird(pipe, p); if (r === null) tbNull = true; return r },
    queryHog: async (_sql, name) => { hogOn.push(name); return [] } // any call here = fallback = INVALID
  })
  const resB = mkRes()
  try { await handlerFn(mockReq(siteId, params), resB) } finally { resetDeps() }

  const guard = hitGuardResult({ hogCalls: hogOn, tbNull, tbCalls })
  const findings = deepDiff(resA.body, resB.body, cfg)
  const summary = summarize(findings)
  const verdict = guard.valid && !guard.fail && summary.pass
  return { label, guard, findings, summary, verdict, A: resA.body, B: resB.body }
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
  lines.push(`VERDICT: ${r.verdict ? 'GREEN (parity)' : 'RED (divergence/invalid)'}`)
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

async function loadSessionsTarget () {
  const mod = await import('../../api/routes/sessions.js')
  const tb = await import('../../api/lib/tinybird-read.js')
  const ph = await import('../../api/lib/posthog.js')
  return {
    handlerFn: mod.sessionsOverview,
    setDeps: mod.__setSessionsReadDeps,
    resetDeps: mod.__resetSessionsReadDeps,
    mockReq: (siteId, params) => ({ site: { id: siteId }, query: { date_from: params.date_from, date_to: params.date_to } }),
    realTb: tb.queryTinybirdPipe,
    realHog: ph.queryHogQL
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

async function runLive (args) {
  const i = args.indexOf('--live')
  const [siteId, dateFrom, dateTo] = args.slice(i + 1)
  if (!siteId || !dateFrom || !dateTo) {
    console.error('usage: node route_ab_diff.mjs --live <site_id> <date_from> <date_to>')
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
  const t = await loadSessionsTarget()
  const report = await runParity({
    label: `sessions_conversions @ site=${siteId} [${dateFrom}..${dateTo}] (ST_Staging vs PostHog 469905)`,
    setDeps: t.setDeps,
    resetDeps: t.resetDeps,
    handlerFn: t.handlerFn,
    mockReq: t.mockReq,
    siteId,
    params: { date_from: dateFrom, date_to: dateTo },
    offLeg: { queryHog: t.realHog },
    onLeg: { queryTinybird: t.realTb }
  })
  console.log(formatReport(report))
  process.exit(report.verdict ? 0 : 1)
}

const invokedDirectly = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (invokedDirectly) {
  const args = process.argv.slice(2)
  if (args.includes('--stub-selftest')) await runStubSelfTest()
  else if (args.includes('--live')) await runLive(args)
  else { console.error('usage: node route_ab_diff.mjs [--stub-selftest | --live <site_id> <date_from> <date_to>]'); process.exit(2) }
}
