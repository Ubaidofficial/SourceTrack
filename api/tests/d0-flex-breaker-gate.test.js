// D0 — the flex-pipe dead-store gate for the tz / filters / attributeBy axes.
//
// Every flexible_report_* pipe dispatches ONLY under the engine's _flexBaseCommon
// (attribution-engine.js): tz === 'UTC' && no filterClauses && attributeBy === 'conversion_date'.
// A request that trips any of those skips the pipe and reaches the pipe=NONE HogQL read — a dead
// store since PostHog was retired — silently returning ZEROS (a §6 fake zero). Before D0 the gate
// modelled none of these axes, so it called those shapes SERVED. D0 teaches the gate the three
// breakers so it denies them with a truthful 422 gated_dead_store instead.
//
// Two anti-drift tests bind the gate to the engine BY EXECUTION so the rule can't rot:
//   (1) gate verdict ⟺ engine dead-read set (drives the real getFlexibleReport via the read seam);
//   (2) the gate's FLEX_BREAKING_FILTER_KEYS ⟺ the engine's filterClauses builder keys.
//
// SCOPE: this file is D0's. It asserts the ROUTE gate, NOT engine dispatch. The engine-direct
// parity/dispatch tests (flexible-report-*-parity, route-args-matrix) are D1's and stay untouched.

import test from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const g = await import('../lib/report-config-validation.js')
const {
  getFlexibleReport, __setAttributionReadDeps, __resetAttributionReadDeps, __evictFlexibleReportCache
} = await import('../lib/attribution-engine.js')

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENGINE_SRC = readFileSync(join(__dirname, '../lib/attribution-engine.js'), 'utf8')

const PREAGG_CONV = new Set(['revenue', 'conversions', 'leads', 'customers', 'avg_conversion_value'])
const PREAGG_MT = new Set(['revenue', 'conversions'])

// The gate as the DIRECT callers (export / campaigns) invoke it: viaRoutePreAgg=false.
function gateDirect ({ model, groupBy, metric, groupBy2 = null, window = null, tz = 'UTC', filtersPresent = false, attributeBy = 'conversion_date' }) {
  const r = g.gatedReportReason({
    group_by: groupBy, group_by2: groupBy2, metric, model,
    preAggConversionMetric: PREAGG_CONV.has(metric), preAggMultiTouchMetric: PREAGG_MT.has(metric),
    viaRoutePreAgg: false, hasAttributionWindow: !!(window && window !== 'ltv' && Number(window) > 0),
    tz, filtersPresent, attributeBy
  })
  return r ? r.error_code : 'SERVED'
}

// ── 1. The three breakers deny a base flex-pipe shape that is served when UTC/no-filter/conv_date ──
test('D0: a flex-pipe shape is SERVED under UTC / no-filter / conversion_date', () => {
  for (const [model, dim] of [['first_touch', 'source'], ['first_touch', 'provider'], ['last_touch', 'attribution_status'], ['first_touch', 'campaign']]) {
    assert.equal(gateDirect({ model, groupBy: dim, metric: 'revenue' }), 'SERVED', `${model}×${dim} baseline`)
  }
})

test('D0: tz !== UTC denies every flex-pipe shape with 422 gated_dead_store', () => {
  for (const [model, dim] of [['first_touch', 'source'], ['first_touch', 'provider'], ['last_touch', 'attribution_status'], ['first_touch_non_direct', 'stitching_method'], ['last_touch', 'conversion_type'], ['first_touch', 'campaign']]) {
    assert.equal(gateDirect({ model, groupBy: dim, metric: 'revenue', tz: 'America/New_York' }), 'gated_dead_store', `${model}×${dim} non-UTC`)
  }
})

test('D0: a present filter denies every flex-pipe shape with 422 gated_dead_store', () => {
  for (const [model, dim] of [['first_touch', 'source'], ['first_touch', 'provider'], ['last_touch', 'stitching_method'], ['first_touch', 'campaign']]) {
    assert.equal(gateDirect({ model, groupBy: dim, metric: 'revenue', filtersPresent: true }), 'gated_dead_store', `${model}×${dim} filtered`)
  }
})

test('D0: attributeBy !== conversion_date denies every flex-pipe shape (the third axis)', () => {
  for (const ab of ['first_seen_date', 'original_source_date']) {
    assert.equal(gateDirect({ model: 'first_touch', groupBy: 'provider', metric: 'revenue', attributeBy: ab }), 'gated_dead_store', `attributeBy=${ab}`)
  }
})

test('D0: campaign sessions + leads (own-metric flex pipes) are also tz-gated', () => {
  // campaigns.js gates via servedByDeployedBackend (NOT gatedReportReason): `sessions` is in
  // GATED_METRICS (denied wholesale for the Report Builder) yet the campaign_sessions pipe serves
  // it, so the campaigns page asks the allowlist directly. Mirror that path here.
  const served = (metric, extra = {}) => g.servedByDeployedBackend({
    model: 'first_touch', group_by: 'campaign', group_by2: null, metric,
    preAggConversionMetric: PREAGG_CONV.has(metric), preAggMultiTouchMetric: PREAGG_MT.has(metric),
    viaRoutePreAgg: false, hasAttributionWindow: false, ...extra
  })
  for (const metric of ['sessions', 'leads']) {
    assert.ok(served(metric, { tz: 'UTC' }), `campaign×${metric} served at UTC baseline`)
    assert.equal(served(metric, { tz: 'Asia/Tokyo' }), null, `campaign×${metric} non-UTC denied (flex breaker)`)
    assert.equal(served(metric, { filtersPresent: true }), null, `campaign×${metric} filtered denied`)
  }
})

// ── 2. The breakers must NOT touch pre-agg / multi-touch / ai_platforms (they honor tz / refilter) ──
test('D0: Supabase pre-agg (viaRoutePreAgg=true) is NOT denied by tz/filter — pre-agg honors tz', () => {
  // first_touch × source × revenue routes to supabase_preagg for attribution.js; non-UTC + filtered
  // must STILL be served (pre-agg buckets by local date; the D0 breakers are flex-PIPE only).
  for (const extra of [{ tz: 'America/New_York' }, { filtersPresent: true }, { attributeBy: 'first_seen_date' }]) {
    const r = g.gatedReportReason({
      group_by: 'source', metric: 'revenue', model: 'first_touch',
      preAggConversionMetric: true, preAggMultiTouchMetric: true,
      viaRoutePreAgg: true, hasAttributionWindow: false, ...extra
    })
    assert.equal(r, null, `pre-agg source×first_touch must stay served (${JSON.stringify(extra)})`)
  }
})

test('D0: multi-touch + ai_platforms live readers are NOT denied by the flex breakers', () => {
  // linear × source and ai_platforms × ai_source resolve to live readers, not flex pipes.
  for (const extra of [{ tz: 'America/New_York' }, { filtersPresent: true }]) {
    assert.equal(gateDirect({ model: 'linear', groupBy: 'source', metric: 'revenue', ...extra }), 'SERVED', `linear×source (${JSON.stringify(extra)})`)
    assert.equal(gateDirect({ model: 'ai_platforms', groupBy: 'ai_source', metric: 'revenue', ...extra }), 'SERVED', `ai_platforms×ai_source (${JSON.stringify(extra)})`)
  }
})

// ── 3. ANTI-DRIFT #1: gate verdict ⟺ engine dead-read set (executed against the real engine) ──
test('🔴 ANTI-DRIFT: for the direct-caller path, gate-422 ⟺ engine reaches the pipe=NONE dead read', async () => {
  const SITE = 'd0-antidrift', FROM = '2026-07-01', TO = '2026-07-06'
  // Pipe SERVES rows via the seam; a HogQL call is the dead-store stand-in (throws). So a throw ==
  // the shape reached a pipe=NONE / non-dispatch read — exactly what D0 must gate.
  async function engineDead ({ model, groupBy, metric, tz, filtersPresent, attributeBy }) {
    const filters = {}
    if (tz !== 'UTC') filters.timezone = tz
    if (filtersPresent) filters.source = 'google'
    __evictFlexibleReportCache(SITE, model, FROM, TO, groupBy, metric, filters, null)
    __setAttributionReadDeps({
      queryTinybird: async () => [{ dim_value: 'x', metric_value: 1, days_to_convert: 1, touchpoints_per_conversion: 1, conversions: 1, sessions: 1 }],
      queryHog: async () => { throw new Error('DEADREAD') }
    })
    try { await getFlexibleReport(SITE, model, FROM, TO, groupBy, metric, filters, null, 'day', null, attributeBy); return false }
    catch (e) { if (e.message === 'DEADREAD') return true; throw e }
    finally { __resetAttributionReadDeps() }
  }

  const MODELS = ['first_touch', 'last_touch', 'first_touch_non_direct', 'last_touch_non_direct', 'linear', 'ai_platforms']
  const DIMS = ['source', 'provider', 'attribution_status', 'stitching_method', 'conversion_type', 'campaign', 'medium', 'country', 'landing_page']
  const METRICS = ['revenue', 'conversions', 'leads']
  const CONDS = [
    { label: 'UTC', tz: 'UTC', filtersPresent: false, attributeBy: 'conversion_date' },
    { label: 'NONUTC', tz: 'America/New_York', filtersPresent: false, attributeBy: 'conversion_date' },
    { label: 'FILTERED', tz: 'UTC', filtersPresent: true, attributeBy: 'conversion_date' },
    { label: 'ATTRBY', tz: 'UTC', filtersPresent: false, attributeBy: 'first_seen_date' }
  ]
  let checked = 0, gated = 0
  for (const c of CONDS) for (const model of MODELS) for (const groupBy of DIMS) for (const metric of METRICS) {
    const shape = { model, groupBy, metric, tz: c.tz, filtersPresent: c.filtersPresent, attributeBy: c.attributeBy }
    const dead = await engineDead(shape)
    const verdict = gateDirect(shape)
    checked++
    if (verdict !== 'SERVED') gated++
    // The invariant: the gate must deny EXACTLY the shapes that would dead-read. No fake zero escapes,
    // and no working shape is wrongly denied.
    if (dead) assert.notEqual(verdict, 'SERVED', `UNCOVERED dead read: ${c.label} ${model}×${groupBy}×${metric} (gate says SERVED)`)
    if (verdict === 'SERVED') assert.equal(dead, false, `gate SERVED but engine dead-reads: ${c.label} ${model}×${groupBy}×${metric}`)
  }
  assert.ok(checked === 648, `exercised ${checked} shapes`)
  assert.ok(gated > 100, `gate denied ${gated} shapes across the breaker conditions`)
})

// ── 4. ANTI-DRIFT #2: gate filter-key set ⟺ engine filterClauses builder keys ──
test('🔴 ANTI-DRIFT: FLEX_BREAKING_FILTER_KEYS == the engine filterClauses builder keys', () => {
  // Extract the keys the FLEX-PIPE filterClauses block reads. There are two filterClauses blocks
  // in the engine; the flex-pipe one lives inside getFlexibleReport (the other is getSessionReport,
  // a separate rail). Anchor inside getFlexibleReport, then bound to the `// LTV v1` comment that
  // immediately follows the flex block.
  const fnStart = ENGINE_SRC.indexOf('export async function getFlexibleReport')
  assert.ok(fnStart > 0, 'getFlexibleReport not found — engine drifted')
  const start = ENGINE_SRC.indexOf("let filterClauses = ''", fnStart)
  assert.ok(start > 0, 'flex filterClauses block not found — engine drifted')
  const end = ENGINE_SRC.indexOf('// LTV v1', start)
  assert.ok(end > start, 'filterClauses block end marker (// LTV v1) not found — engine drifted')
  const block = ENGINE_SRC.slice(start, end)
  const engineKeys = new Set()
  for (const m of block.matchAll(/filters\.([a-z_]+)/g)) engineKeys.add(m[1])
  const gateKeys = new Set(g.FLEX_BREAKING_FILTER_KEYS)
  assert.deepEqual([...engineKeys].sort(), [...gateKeys].sort(),
    'the gate filter-key set drifted from the engine filterClauses builder — a filter would silently un-gate')
})

test('🔴 flexFiltersPresent mirrors engine truthiness (customer_type/min_conversions/timezone excluded)', () => {
  assert.equal(g.flexFiltersPresent({}), false)
  assert.equal(g.flexFiltersPresent({ source: 'google' }), true)
  assert.equal(g.flexFiltersPresent({ conversion_type: 'purchase' }), true)
  // is_conversion / has_ai_source only count for the engine's exact string values
  assert.equal(g.flexFiltersPresent({ is_conversion: 'true' }), true)
  assert.equal(g.flexFiltersPresent({ is_conversion: 'false' }), false, 'is_conversion only builds a clause for "true"')
  assert.equal(g.flexFiltersPresent({ has_ai_source: 'false' }), true, 'has_ai_source=false DOES build a clause')
  // NOT filterClause keys -> must not force a dead-store gate (they are pre-agg/post-agg or the tz axis)
  assert.equal(g.flexFiltersPresent({ customer_type: 'new' }), false)
  assert.equal(g.flexFiltersPresent({ min_conversions: '5' }), false)
  assert.equal(g.flexFiltersPresent({ timezone: 'America/New_York' }), false, 'timezone is the tz axis, not a filter')
  assert.equal(g.flexFiltersPresent({ channel: 'organic' }), false, 'channel builds no engine clause (D0b, not a dead read)')
})
