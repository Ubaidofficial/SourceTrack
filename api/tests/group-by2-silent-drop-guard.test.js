// GROUP_BY2 SILENT-DROP GUARD (PR-A)
//
// The bug: servedReportShape claimed a two-dim (group_by2) conversion/multitouch/ai shape was
// SERVED, but every backend it routes to takes groupBy ONLY and silently DROPS the 2nd dimension
// (getPreAggregatedAttribution has no groupBy2 param; the 4 multi-touch pre-agg readers take
// groupBy only; getMultiTouchAttributionLive / getAiPlatformAttributionLive accept groupBy2 but
// never read it). So attribution.js's pre-agg short-circuit returned campaign-ONLY data for a
// campaign×source request — a §6 wrong-scope answer that BYPASSED the honest-422 gate.
//
// The invariant this file pins: a two-dim request is NEVER answered with single-dim data. Either a
// backend genuinely honors both dims (ONLY the session-report path, getSessionReport) → served, or
// the request is DENIED with gated_dead_store → the route returns 422 and no reader runs. There is
// no third outcome. gatedReportReason returning a reason == the route returns 422 (attribution.js
// :175-185 / export.js :130-132), so a denied shape can never reach a single-dim reader.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'

const g = await import('../lib/report-config-validation.js')

// Route-shaped args (matches attribution.js's gate call). preAgg* flags are what the routes pass
// as PREAGG_*_METRICS.has(metric); set them to match each metric below.
const base = { preAggWindowMatches: true, hasAttributionWindow: false, viaRoutePreAgg: true, tz: 'UTC', filtersPresent: false, attributeBy: 'conversion_date' }
const gate = (o) => g.gatedReportReason({ ...base, ...o })
const shape = (o) => g.servedByDeployedBackend({ ...base, ...o })

// ── The cited defect: two-dim conversion via the pre-agg short-circuit ────────────────────
test('two-dim conversion (campaign×source, last_touch, revenue) is DENIED, not silently single-dim', () => {
  const args = { model: 'last_touch', group_by: 'campaign', group_by2: 'source', metric: 'revenue', preAggConversionMetric: true }
  const reason = gate(args)
  assert.ok(reason, 'must return a gate reason (→ route 422), never fall through to a single-dim reader')
  assert.equal(reason.error_code, 'gated_dead_store')
  assert.equal(shape(args), null, 'servedByDeployedBackend must not claim a backend serves this two-dim shape')
})

test('two-dim multi-touch (campaign×source, linear, conversions) is DENIED', () => {
  const args = { model: 'linear', group_by: 'campaign', group_by2: 'source', metric: 'conversions', preAggMultiTouchMetric: true }
  assert.equal(gate(args)?.error_code, 'gated_dead_store')
  assert.equal(shape(args), null)
})

test('two-dim ai_platforms (source×medium, ai_conversions) is DENIED', () => {
  const args = { model: 'ai_platforms', group_by: 'source', group_by2: 'medium', metric: 'ai_conversions' }
  assert.equal(gate(args)?.error_code, 'gated_dead_store')
  assert.equal(shape(args), null)
})

// ── The genuinely-served two-dim path must be PRESERVED (not over-gated) ───────────────────
test('two-dim SESSION (source×medium, session_count) is STILL served — getSessionReport honors groupBy2', () => {
  const args = { model: 'last_touch', group_by: 'source', group_by2: 'medium', metric: 'session_count' }
  assert.equal(gate(args), null, 'a supported session two-dim must pass the gate')
  assert.equal(shape(args), 'session_report_pipes')
})

// ── No regression: the single-dim equivalents stay served ─────────────────────────────────
test('single-dim shapes are unchanged (campaign revenue last_touch; source revenue first_touch)', () => {
  assert.equal(gate({ model: 'last_touch', group_by: 'campaign', group_by2: null, metric: 'revenue', preAggConversionMetric: true }), null)
  assert.equal(shape({ model: 'last_touch', group_by: 'campaign', group_by2: null, metric: 'revenue', preAggConversionMetric: true }), 'supabase_preagg')
  assert.equal(shape({ model: 'first_touch', group_by: 'source', group_by2: null, metric: 'revenue', preAggConversionMetric: true, viaRoutePreAgg: false }), 'flexible_report_main_by_site')
})

// ── Invariant sweep: NO non-session metric is ever served two-dim ─────────────────────────
test('no conversion/multi-touch/ai two-dim shape is ever served (only session is)', () => {
  const NON_SESSION = [
    { metric: 'revenue', preAggConversionMetric: true },
    { metric: 'conversions', preAggConversionMetric: true },
    { metric: 'leads', preAggConversionMetric: true },
    { metric: 'conversions', preAggMultiTouchMetric: true }
  ]
  for (const model of [...g.ALLOWED_MODELS]) {
    for (const m of NON_SESSION) {
      const args = { model, group_by: 'campaign', group_by2: 'source', ...m }
      assert.equal(shape(args), null, `${model} + ${m.metric} two-dim must NOT be served (would drop the 2nd dim)`)
    }
  }
})
