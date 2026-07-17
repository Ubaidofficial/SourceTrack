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
//   (2) the gate's breaker set is the SAFETY property (see below), reframed by D0b.
//
// D0b extends this file: D0 left a SECOND fake — a FILTERED (or non-UTC multi-touch) request that
// resolves to the Supabase pre-agg returned UNFILTERED numbers LABELED as filtered (§6 wrong-scope),
// because the pre-agg readers can't honor content filters (and the multi-touch readers honor neither
// filters nor tz). D0b gates those on the ROUTE, and adds `channel` as a gate-only breaker (no
// conversion-metric backend can filter by it). Anti-drift #2 is reframed from D0's incidental 1:1 to
// the real property so `channel` is a declared exception, not a drift failure.
//
// SCOPE: this file asserts the ROUTE gate, NOT engine dispatch. The engine-direct parity/dispatch
// tests (flexible-report-*-parity, route-args-matrix) are D1's and stay untouched. Teaching the
// pre-agg to actually HONOR filters (the feature restore) is D0b-honor, a separate later PR.

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

// The gate as the ROUTE (attribution.js) invokes it: viaRoutePreAgg=true — the only path that reaches
// the Supabase pre-agg short-circuit. Returns the error_code, or 'SERVED'.
function gateRoute ({ model, groupBy, metric, groupBy2 = null, window = null, tz = 'UTC', filtersPresent = false, attributeBy = 'conversion_date' }) {
  const r = g.gatedReportReason({
    group_by: groupBy, group_by2: groupBy2, metric, model,
    preAggConversionMetric: PREAGG_CONV.has(metric), preAggMultiTouchMetric: PREAGG_MT.has(metric),
    viaRoutePreAgg: true, hasAttributionWindow: !!(window && window !== 'ltv' && Number(window) > 0),
    tz, filtersPresent, attributeBy
  })
  return r ? r.error_code : 'SERVED'
}

// ── 2. Gate ONLY what the serving reader genuinely can't answer. D0b tightens D0's blanket
//       "never gate pre-agg" into a per-reader-capability gate. ──
test('D0b: first/last-touch pre-agg on the ROUTE — tz honored (served), a content filter now GATES', () => {
  // first_touch × source × revenue routes to supabase_preagg (getPreAggregatedAttribution). It buckets
  // by LOCAL date (tz honored) and honors customer_type -> those stay served. It DROPS every content
  // filterClause axis -> a filtered request would return UNFILTERED numbers labeled as filtered (§6),
  // so D0b gates it. attributeBy is out of D0b-gate scope (pre-agg ignores it — a separate residual).
  assert.equal(gateRoute({ model: 'first_touch', groupBy: 'source', metric: 'revenue' }), 'SERVED', 'unfiltered UTC = fast path')
  assert.equal(gateRoute({ model: 'first_touch', groupBy: 'source', metric: 'revenue', tz: 'America/New_York' }), 'SERVED', 'non-UTC pre-agg still served (buckets by local date)')
  assert.equal(gateRoute({ model: 'last_touch', groupBy: 'campaign', metric: 'revenue', attributeBy: 'first_seen_date' }), 'SERVED', 'attributeBy not a D0b-gate axis for pre-agg')
  assert.equal(gateRoute({ model: 'first_touch', groupBy: 'source', metric: 'revenue', filtersPresent: true }), 'gated_dead_store', 'filtered pre-agg now GATES (D0b)')
  assert.equal(gateRoute({ model: 'last_touch', groupBy: 'country', metric: 'conversions', filtersPresent: true }), 'gated_dead_store', 'filtered pre-agg now GATES (D0b)')
})

test('D0b: multi-touch pre-agg on the ROUTE gates on filter OR non-UTC (reader honors NEITHER)', () => {
  // linear/u_shaped/… × a PREAGG_DIM × revenue|conversions routes to the Supabase multi-touch reader
  // (getUShaped/getTimeDecay/…). Those take no filters AND no timezone -> a filtered OR non-UTC
  // request is wrong-scope. Unfiltered UTC stays served (byte-identical fast path).
  for (const model of ['linear', 'u_shaped', 'time_decay', 'w_shaped']) {
    assert.equal(gateRoute({ model, groupBy: 'source', metric: 'revenue' }), 'SERVED', `${model} unfiltered UTC served`)
    assert.equal(gateRoute({ model, groupBy: 'source', metric: 'revenue', filtersPresent: true }), 'gated_dead_store', `${model} filtered gates`)
    assert.equal(gateRoute({ model, groupBy: 'source', metric: 'revenue', tz: 'Asia/Tokyo' }), 'gated_dead_store', `${model} non-UTC gates (reader ignores tz)`)
  }
})

test('D0b: the multi-touch LIVE path (direct callers / non-preagg dims) still honors filters — NOT gated', () => {
  // export/campaigns call getFlexibleReport DIRECTLY (viaRoutePreAgg=false) -> getMultiTouchAttribution-
  // Live, which DOES honor source/medium/campaign/country/device_type/conversion_type. So a filtered
  // multi-touch on the DIRECT path stays served — only the ROUTE pre-agg short-circuit is wrong-scope.
  for (const extra of [{ tz: 'America/New_York' }, { filtersPresent: true }]) {
    assert.equal(gateDirect({ model: 'linear', groupBy: 'source', metric: 'revenue', ...extra }), 'SERVED', `direct linear×source (${JSON.stringify(extra)})`)
    assert.equal(gateDirect({ model: 'ai_platforms', groupBy: 'ai_source', metric: 'revenue', ...extra }), 'SERVED', `ai_platforms×ai_source (${JSON.stringify(extra)})`)
  }
})

// ── 3. ANTI-DRIFT #1: gate verdict ⟺ engine dead-read set (executed against the real engine) ──
test('🔴 ANTI-DRIFT: for the direct-caller path, gate-422 ⟺ engine reaches the pipe=NONE dead read', async () => {
  const SITE = 'd0-antidrift', FROM = '2026-07-01', TO = '2026-07-06'
  // Pipe SERVES rows via the seam. D1: a pipe=NONE / non-dispatch shape no longer reads HogQL — it
  // THROWS the [pr4/D1] pipe-only invariant. So a [pr4/D1] throw == the shape reached the dead-store
  // (dead=true) — exactly what the gate must deny. (The queryHog DEADREAD guard is a belt-and-braces
  // net; post-D1 the flexible_report HogQL leg is deleted, so it should never be reached.)
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
    catch (e) { if (e.message === 'DEADREAD' || /\[pr4\/D1\]/.test(e.message)) return true; throw e }
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

// ── 4. ANTI-DRIFT #2 (reframed by D0b): the breaker set is the SAFETY property, not an incidental 1:1
// D0 asserted FLEX_BREAKING_FILTER_KEYS == the engine flex filterClauses keys EXACTLY. D0b breaks that
// 1:1 on purpose: `channel` MUST gate (no conversion-metric backend can filter by it — getFlexible-
// Report builds no channel clause, and the Supabase pre-agg ignores it), yet it is deliberately NOT a
// flex filterClause key (there is no channel pipe). The real invariant is the safety property:
//   (a) every engine flex filterClauses key IS a breaker  -> no clause-builder can silently un-gate;
//   (b) every EXTRA breaker is a DECLARED gate-only key    -> it gates because NO serving backend can
//       honor it, not because it builds a clause. Today that declared set is exactly {channel}.
const DECLARED_GATE_ONLY_BREAKERS = new Set(['channel'])
test('🔴 ANTI-DRIFT: breaker set ⊇ engine flex filterClauses keys; every extra is a declared gate-only breaker', () => {
  // Extract the keys the FLEX-PIPE filterClauses block reads. There are two filterClauses blocks in
  // the engine; the flex-pipe one lives inside getFlexibleReport (the other is getSessionReport, a
  // separate rail that DOES filter by channel). Anchor inside getFlexibleReport, bound to `// LTV v1`.
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
  // (a) every engine flex clause key must be a breaker — else a filtered flex shape silently un-gates.
  for (const k of engineKeys) {
    assert.ok(gateKeys.has(k), `engine flex filterClauses key "${k}" is NOT a breaker — it would silently un-gate`)
  }
  // (b) every breaker NOT backed by a flex clause must be a declared gate-only key with a known reason.
  for (const k of gateKeys) {
    if (engineKeys.has(k)) continue
    assert.ok(DECLARED_GATE_ONLY_BREAKERS.has(k),
      `breaker "${k}" builds no engine flex clause and is not declared gate-only — declare WHY no backend honors it, or remove it`)
  }
  // channel specifically: MUST gate, and MUST remain absent from the flex builder. If a channel clause
  // is ever added to getFlexibleReport, channel stops being gate-only — revisit D0b-honor.
  assert.ok(gateKeys.has('channel'), 'channel must be a breaker (no conversion-metric backend filters by it)')
  assert.ok(!engineKeys.has('channel'), 'channel gained a flex filterClause — no longer gate-only; move it out of DECLARED_GATE_ONLY_BREAKERS')
})

test('🔴 flexFiltersPresent: content filters + channel break; customer_type/min_conversions/timezone excluded', () => {
  assert.equal(g.flexFiltersPresent({}), false)
  assert.equal(g.flexFiltersPresent({ source: 'google' }), true)
  assert.equal(g.flexFiltersPresent({ conversion_type: 'purchase' }), true)
  // is_conversion / has_ai_source only count for the engine's exact string values
  assert.equal(g.flexFiltersPresent({ is_conversion: 'true' }), true)
  assert.equal(g.flexFiltersPresent({ is_conversion: 'false' }), false, 'is_conversion only builds a clause for "true"')
  assert.equal(g.flexFiltersPresent({ has_ai_source: 'false' }), true, 'has_ai_source=false DOES build a clause')
  // channel is a D0b gate-only breaker: no conversion-metric backend can filter by it -> it must gate.
  assert.equal(g.flexFiltersPresent({ channel: 'organic' }), true, 'channel gates (D0b gate-only breaker)')
  // NOT breakers -> must not force a gate. customer_type IS honored (pre-agg); min_conversions is a
  // post-agg display cut (a known pre-agg over-inclusion residual, tracked for D0b-honor); timezone
  // is the separate tz axis.
  assert.equal(g.flexFiltersPresent({ customer_type: 'new' }), false)
  assert.equal(g.flexFiltersPresent({ min_conversions: '5' }), false)
  assert.equal(g.flexFiltersPresent({ timezone: 'America/New_York' }), false, 'timezone is the tz axis, not a filter')
})
