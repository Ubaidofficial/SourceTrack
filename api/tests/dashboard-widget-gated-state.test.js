// Dashboard pinned-report cards (DashboardWidgetCard) must render the HONEST gated state.
// TOKEN-FREE, NO network. No React runner exists in this repo, so this locks the two things
// that actually carry the rule:
//   1. the DESCRIPTOR the card renders (describeQueryError — the #250 single source), and
//   2. the STRUCTURE of Dashboard.jsx (it must route through that source, and must NOT
//      hand-list any gated dim/metric).
//
// WHY THIS MATTERS: the card previously rendered a raw "⚠️ Query failed" + error.message on
// the HOME screen for a shape the server DELIBERATELY denied (422). A gate is not a failure —
// an alarm + raw server text is a §5.1 violation on the most-seen surface in the product.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DASHBOARD = readFileSync(join(__dirname, '../../dashboard/src/pages/Dashboard.jsx'), 'utf8')
const BUILDER = readFileSync(join(__dirname, '../../dashboard/src/pages/ReportBuilder.jsx'), 'utf8')

const { describeQueryError } = await import('../../dashboard/src/lib/queryError.js')
const gate = await import('../lib/report-config-validation.js')
const picker = await import('../../dashboard/src/lib/reportGating.js')

// ── 1. the descriptor the card renders for a gated 422 ───────────────────────────────
// fetchApi (lib/api.js) throws with err.error_code = data.error_code on non-2xx, so this is
// exactly the error object the card's useQuery surfaces.
const gated422 = (code = 'gated_dead_store') => {
  const e = new Error('The "keyword" breakdown is temporarily unavailable while reporting moves to the new analytics store.')
  e.status = 422
  e.error_code = code
  return e
}

for (const code of ['gated_dead_store', 'unsupported_session_dim']) {
  test(`🔴 gated 422 (${code}) -> calm "Temporarily unavailable", NOT "Query failed"`, () => {
    const d = describeQueryError(gated422(code))
    assert.equal(d.isGated, true, 'card renders the calm branch (Lock, no alarm)')
    assert.match(d.title, /Temporarily unavailable/i)
    assert.doesNotMatch(d.title, /Query failed/i, 'the old raw alarm copy must be gone')
    assert.doesNotMatch(d.message, /try again|retry|narrower/i, 'a deny is not retryable')
    assert.ok(d.message, 'never an empty/"No data" state — an error is not a zero')
  })
}

test('a REAL fetch error still gets honest copy (not the raw server message)', () => {
  const e = new Error('ECONNRESET at internal.host:5432')
  e.status = 500
  const d = describeQueryError(e)
  assert.equal(d.isGated, false, 'real failure keeps the alarm branch')
  assert.match(d.title, /Couldn't load this data/i)
  assert.doesNotMatch(d.title, /Query failed/i)
  // the descriptor's message is the honest generic copy, NOT the raw internal error text
  assert.doesNotMatch(d.message, /ECONNRESET|5432/, 'raw server/internal text must not reach the card')
})

test('every error input yields a real descriptor -> the card can never fall through to "No data"', () => {
  for (const e of [null, undefined, {}, new Error('x'), gated422(), { error_code: 'query_timeout' }]) {
    const d = describeQueryError(e)
    assert.ok(d && d.title && d.message)
  }
})

// ── 2. Dashboard.jsx structure: routes through the source, and does NOT fork the gate ──
test('Dashboard.jsx routes the widget error through describeQueryError', () => {
  assert.match(DASHBOARD, /import \{ describeQueryError \} from '\.\.\/lib\/queryError'/, 'imports the single source')
  assert.match(DASHBOARD, /describeQueryError\(error\)/, 'the isError branch uses it')
})

test('🔴 the raw "Query failed" alarm + raw error.message render is GONE from Dashboard.jsx', () => {
  assert.doesNotMatch(DASHBOARD, /Query failed/, 'no raw alarm copy')
  assert.doesNotMatch(DASHBOARD, /\{error\?\.message \|\| 'Configuration error'\}/, 'no raw server message render')
})

test('🔴 ANTI-DRIFT: Dashboard.jsx hand-lists NO gated dim/metric (the 422 code is the source)', () => {
  // Enumerating the gated set here would fork it from api/lib/report-config-validation.js —
  // the exact duplicate-allowlist bug #248 killed. The card learns "gated" ONLY from the
  // server's error_code, via describeQueryError.
  for (const dim of gate.GATED_GROUPS) {
    assert.ok(!DASHBOARD.includes(`'${dim}'`), `Dashboard.jsx must not hand-list gated dim "${dim}"`)
  }
  for (const m of gate.GATED_METRICS) {
    assert.ok(!DASHBOARD.includes(`'${m}'`), `Dashboard.jsx must not hand-list gated metric "${m}"`)
  }
  // and it must not import the gating helpers at all — the error_code alone drives the state
  assert.doesNotMatch(DASHBOARD, /reportGating/, 'no gate-derivation in Dashboard.jsx')
  assert.doesNotMatch(DASHBOARD, /report-config-validation/, 'no direct gate import in Dashboard.jsx')
})

// ── 3. saved-reports drawer badges a gated saved config (DERIVED, same source as the pickers) ──
test('the saved-reports drawer derives its gated badge from reportGating, not a hand list', () => {
  assert.match(BUILDER, /gateReason: metricGateReason\(cfg\.metric\) \|\| dimensionGateReason\(cfg\.groupBy, cfg\.metric\)/)
  assert.match(BUILDER, /meta\.gateReason && \(/, 'the badge renders off the derived reason')
})

test('the gated badge fires for a gated saved config and stays silent for a servable one', () => {
  // mirrors getSavedReportMeta's derivation exactly (see the assert above)
  const reason = (cfg) => picker.metricGateReason(cfg.metric) || picker.dimensionGateReason(cfg.groupBy, cfg.metric)
  assert.equal(reason({ metric: 'revenue', groupBy: 'keyword' }), picker.GATED_TOOLTIP, 'gated dim -> badged')
  assert.equal(reason({ metric: 'ltv_revenue', groupBy: 'source' }), picker.GATED_TOOLTIP, 'gated metric -> badged')
  assert.equal(reason({ metric: 'revenue', groupBy: 'source' }), null, 'a servable saved report is NOT badged')
  assert.equal(reason({}), null, 'a config missing fields must not be falsely badged')
})
