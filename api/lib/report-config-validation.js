// SINGLE SOURCE OF TRUTH for report-shape validation. api/routes/attribution.js and
// api/routes/export.js both import these — they previously kept byte-identical DUPLICATE
// copies, so trimming one and not the other silently leaked the gated shape through.
//
// ── THE GATE (why these lists are narrower than the engine can express) ───────────────
// PostHog is a DEAD store: reads that reach `queryHogQL` return zeros in prod. A report
// shape is SERVABLE only if it resolves to one of two live backends:
//   1. Supabase pre-agg  — attribution.js's short-circuit: model ∈ {first_touch,last_touch}
//      (+ the 4 multi-touch readers) AND the requested window MATCHES the site's
//      materialized attribution_window_days AND metric ∈ PREAGG_CONVERSION_METRICS
//      ({revenue, conversions, leads, customers, avg_conversion_value}) AND the dim is not
//      one the nightly doesn't materialize.
//   2. Tinybird pipe     — the Class-A conversion-property dims below.
// Anything else falls to the engine's `pipe=NONE` branch, which calls queryHogQL DIRECTLY
// (outside the TINYBIRD_FORCE_READ seam) and silently returns zeros. Those shapes are
// DENIED here, at the edge, instead of querying a dead store.
//
// ── WHERE THE GATED_* SETS LIVE (and why not here) ───────────────────────────────────
// The 4 canonical Sets below are imported from dashboard/src/lib/gate-constants.js and
// RE-EXPORTED unchanged, so this module's public surface is identical for its consumers
// (attribution.js, export.js, attribution-engine.js). They live under dashboard/ because
// Railway builds the Dashboard service with rootDirectory=/dashboard — /api is not in that
// build context, so a dashboard->api import passes CI (repo-root build) and then fails the
// real Railway build. The API builds from the repo root, so this direction resolves in both;
// same direction as api/lib/source-normalizer.js. Keep gate-constants.js PURE.
import {
  GATED_GROUPS,
  GATED_METRICS,
  SESSION_REPORT_DIMS,
  SESSION_PIPE_METRICS
} from '../../dashboard/src/lib/gate-constants.js'

const ALLOWED_MODELS = new Set(['first_touch', 'last_touch', 'first_touch_non_direct', 'last_touch_non_direct', 'ai_platforms', 'linear', 'u_shaped', 'time_decay', 'w_shaped'])

// ALLOWED_* = the KNOWN param vocabulary (unknown -> 400 "Invalid ..."). Deliberately
// UNCHANGED: a gated dim is not an *invalid* dim, and answering "Invalid group_by:
// keyword" would read as a client bug. Servability is a separate axis — see GATED_* below.
const ALLOWED_GROUPS = new Set(['channel', 'source', 'medium', 'campaign', 'keyword', 'referrer_domain', 'ai_source', 'landing_page', 'country', 'device', 'browser', 'conversion_type', 'date', 'provider', 'attribution_status', 'stitching_method'])

const ALLOWED_METRICS = new Set([
  'revenue', 'conversions', 'sessions', 'leads', 'customers', 'conversion_rate',
  'avg_conversion_value', 'ai_conversions', 'ai_revenue', 'ai_conversion_share',
  'ai_revenue_share', 'ltv_revenue',
  'session_count', 'avg_session_duration', 'pages_per_session', 'conversion_sessions',
  'days_to_convert', 'touchpoints_per_conversion'
])

// Class-A dims = conversion-property dims whose Tinybird pipe is model-independent AND
// WINDOW-TOLERANT (flexible_report_{provider,attribution_status,stitching_method,
// conversion_type}_by_site dispatch for any touch model and any attribution window). They
// are the ONLY dims that stay servable when the requested window != the site's
// materialized window — every other dim depends on the pre-agg, which only holds the one
// materialized window. This is why the window gate below is dim-aware: a blanket
// "non-default window is gated" would deny these four, which work today.
const CLASS_A_DIMS = new Set(['provider', 'attribution_status', 'stitching_method', 'conversion_type'])

// ── PRE-AGG DIM CONTRACT (BOTH reader families) ──────────────────────────────────────
// The dims a Supabase pre-agg report can bucket HONESTLY. Both families independently converged
// on the same 8, and both used to silently substitute the SOURCE for anything else — returning
// e.g. "google" under a `country` or `date` label, 200 OK. A confident wrong bucket on the money
// rail; §6 rates that worse than a zero. Both are now DENIED here instead.
//   1. the 4 MULTI-TOUCH readers bucket by touch[groupBy] over the stored *_attribution JSONB,
//      built by ONE constructor — `tpBase` (nightly-attribution.js:1088-1098).   [fixed #256/#257]
//   2. getPreAggregatedAttribution (first_touch/last_touch) maps groupBy to a real COLUMN, and its
//      `else` fell back to sourceField (engine:3197-3199) for the 3 dims it does not map.
//   ANTI-DRIFT: api/tests/multitouch-preagg-dims.test.js binds this Set to BOTH sources — the real
//   calculateAttribution()'s emitted touch keys, AND getPreAggregatedAttribution's mapped columns.
//   Add a dim to either and it un-gates itself; drift fails CI rather than resurfacing the lie.
const PREAGG_DIMS = new Set(['source', 'medium', 'campaign', 'channel', 'country', 'device', 'browser', 'landing_page'])

// The models whose reports resolve through the multi-touch readers (attribution-engine's MULTI_TOUCH).
const MULTI_TOUCH_MODELS = new Set(['linear', 'u_shaped', 'time_decay', 'w_shaped'])

// The models whose reports resolve through getPreAggregatedAttribution (attribution.js:174).
// The two non-direct variants are NOT here: the route has no pre-agg short-circuit for them.
const PREAGG_TOUCH_MODELS = new Set(['first_touch', 'last_touch'])

// attribution-engine's `isTouchModel` — the models for which a Class-A dim dispatches its
// flexible_report_<dim>_by_site pipe (engine:_flexConversionTypeCase etc. require isTouchModel).
const ISTOUCH_MODELS = new Set(['first_touch', 'last_touch', 'first_touch_non_direct', 'last_touch_non_direct'])

// Metrics the Class-A conversion-property pipes emit (engine:_flexPipeCommon = revenue|conversions).
const CLASS_A_PIPE_METRICS = new Set(['revenue', 'conversions'])

// Dims the route's pre-agg short-circuits explicitly SKIP (attribution.js:179 for first/last-touch,
// :200/216/232/248 for multi-touch) — they fall through to getFlexibleReport, which serves them via
// a live pipe: the 4 Class-A conversion-property dims dispatch flexible_report_<dim>_by_site (touch
// models) or bucket honestly inside getMultiTouchAttributionLive (multi-touch, engine:1942-1960).
// So they must NOT be gated by the pre-agg-dim rule. Kept in lockstep with the route by the same
// test. (keyword/referrer_domain are here for the same skip reason but are denied earlier by
// GATED_GROUPS — they have no pipe at all.)
const PREAGG_EXCLUDED_DIMS = new Set(['keyword', 'referrer_domain', 'provider', 'attribution_status', 'stitching_method', 'conversion_type'])

// A custom_param:* dim has no pre-agg and no pipe -> always dead PostHog. Gated.
const isGatedCustomParamDim = (dim) => typeof dim === 'string' && dim.startsWith('custom_param:')


// ── THE SERVED ALLOWLIST (the PR#4 unblocker) ────────────────────────────────────────
// The gate above is a DENYLIST: it names shapes that are broken. A denylist can only deny what
// someone remembered, which is why four fabrication families reached prod (#256/#257/#258/#259).
// Before PR#4 deletes the bare queryHogQL sites, we need the INVERSE: a positive statement of the
// (model × dim × metric) shapes an actual live backend serves. Anything not on it is DENIED, so
// nothing can silently fall through to a read we are about to delete.
//
// ⚠️ PROD-PIPE-DEPENDENT. Every pipe-backed entry below assumes the pipe is DEPLOYED IN PROD.
// Ground truth = the founder's prod pipe-diff (staging is missing 4 and must NOT be used to verify).
// HARD REQUIREMENT: re-verify this set against PROD — not staging, not a remembered table — before
// PR#4 deletes anything. A wrong entry here is exactly what the deletion makes fatal.
const PROD_DEPLOYED_PIPES = new Set([
  'multitouch_conversions_by_site', 'multitouch_pageviews_live', 'aiplatform_conversions_by_site',
  'flexible_report_main_by_site', 'flexible_report_provider_by_site',
  'flexible_report_attribution_status_by_site', 'flexible_report_stitching_method_by_site',
  'flexible_report_conversion_type_by_site', 'flexible_report_campaign_by_site',
  'flexible_report_campaign_leads_by_site', 'flexible_report_campaign_sessions_by_site'
])

// The filter keys the SERVING backends cannot correctly honor on a conversion-metric shape, so a
// request carrying one must GATE (honest 422) rather than dead-read or return wrong-scope numbers.
// The route callers compute `filtersPresent` against THIS set.
//   - The first nine build a non-empty `filterClauses` in getFlexibleReport
//     (attribution-engine.js:2663-2700) -> break _flexBaseCommon -> a flex pipe can't serve them.
//     Anti-drift test #2 binds these nine to the engine's actual filterClauses builder.
//   - `channel` (D0b) is a GATE-ONLY breaker: it is a breaker BECAUSE no conversion-metric backend
//     can filter by it — getFlexibleReport builds NO channel clause (only getSessionReport does, on
//     the session rail), and the Supabase pre-agg ignores it — so a channel-filtered conversion
//     report would return channel-UNFILTERED data. It is deliberately NOT in the flex filterClauses
//     builder (there is no channel pipe), so anti-drift #2 treats it as a declared exception, not a
//     drift. (Adding a channel-aware pipe + honoring it is D0b-honor, a later PR.)
// `customer_type` and `min_conversions` are deliberately EXCLUDED: customer_type IS honored (by the
// Supabase pre-agg), and min_conversions is a post-aggregation display cut — neither forces a wrong
// per-bucket number on the pre-agg fast path. (min_conversions is a KNOWN pre-agg over-inclusion
// residual — the pre-agg ignores the HAVING cut — tracked for D0b-honor, not gated here.)
// `timezone` is the separate `tz` axis, not a filterClause.
const FLEX_BREAKING_FILTER_KEYS = new Set([
  'source', 'medium', 'campaign', 'ai_source', 'country', 'device_type',
  'is_conversion', 'conversion_type', 'has_ai_source',
  'channel'
])

// True when any filter that would build a filterClause is set. Mirrors the engine's truthiness:
// is_conversion / has_ai_source only count as the string 'true'/'false' (engine:2685/2691/2694).
function flexFiltersPresent (filters = {}) {
  if (!filters || typeof filters !== 'object') return false
  for (const key of FLEX_BREAKING_FILTER_KEYS) {
    const v = filters[key]
    if (v === undefined || v === null || v === '') continue
    if (key === 'is_conversion') { if (v === 'true') return true; continue }
    if (key === 'has_ai_source') { if (v === 'true' || v === 'false') return true; continue }
    return true
  }
  return false
}

// The dims getMultiTouchAttributionLive buckets CORRECTLY (i.e. the bucket varies with the input).
// Two ways a dim fails to qualify, both proven by the dim-variance sweep, both FABRICATIONS (§6):
//   1. NO BRANCH in the chain (engine:1942-1969) -> dimVal keeps its `let dimVal = 'direct'` default
//      (engine:1941) -> every row collapses into one bucket labelled with the requested dim.
//      -> ai_source, browser.
//   2. A BRANCH THAT READS A KEY THE SHARE DOES NOT HAVE -> the same collapse. landing_page was
//      exactly this: engine:1953 read `share.page_url` while tpBase emits `landing_page`, so 100% of
//      revenue landed in one "/" bucket. FIXED: the live pvObj now carries
//      landing_page (parsePathname, the same normalizer the nightly uses) and the reader reads that
//      key -> landing_page is SERVED again, proven by the dim-variance sweep (/a vs /b).
// Bound to the engine chain by the anti-drift test: every chain dim must be either IN this set or in
// MULTITOUCH_BROKEN_BRANCH_DIMS, so a new dim cannot be silently assumed served.
const MULTITOUCH_LIVE_DIMS = new Set(['source', 'medium', 'campaign', 'keyword', 'referrer_domain', 'channel', 'landing_page', 'country', 'device', 'conversion_type', 'provider', 'attribution_status', 'stitching_method', 'date'])

// Chain dims whose branch exists but is non-functional. EMPTY: landing_page — the only member — was
// fixed. Kept (not deleted) as the documented home for this failure class: a branch that exists but
// reads a key the share lacks. The anti-drift test still requires every chain dim to be in exactly
// one of these two sets, so a future broken branch must be declared, never silently assumed served.
const MULTITOUCH_BROKEN_BRANCH_DIMS = new Set([])

// Same for getAiPlatformAttributionLive (engine:776-790), whose default is 'unknown'. medium/campaign/
// landing_page have no branch -> single fabricated bucket -> not served.
const AIPLATFORM_LIVE_DIMS = new Set(['source', 'ai_source', 'channel', 'conversion_type', 'country', 'device', 'browser', 'provider', 'attribution_status', 'stitching_method', 'date'])

/**
 * Which LIVE backend serves this shape? Returns the backing id, or null when nothing does.
 * Mirrors the real dispatch ORDER: route pre-agg short-circuit (attribution.js) -> engine
 * getFlexibleReport (MULTI_TOUCH early return -> ai_platforms -> session metrics -> flex pipes).
 * The anti-drift test binds this to the engine's ACTUAL dispatch cell-by-cell via the read seam.
 */
function servedReportShape ({
  model, group_by, group_by2 = null, metric,
  preAggWindowMatches = true, hasAttributionWindow = true,
  // passed in, same convention as gatedReportReason: attribution-engine imports THIS module, so
  // importing PREAGG_CONVERSION_METRICS / PREAGG_MULTITOUCH_METRICS back would be a cycle.
  preAggConversionMetric = false, preAggMultiTouchMetric = false,
  // Only attribution.js reaches the Supabase pre-agg — it owns the short-circuit. export.js and
  // campaigns.js call getFlexibleReport DIRECTLY, so for them ONLY engine-dispatched pipes exist.
  viaRoutePreAgg = true,
  // D0 flex-pipe breakers. Every flexible_report_* pipe dispatches ONLY under the engine's
  // _flexBaseCommon (attribution-engine.js:2897) — tz===UTC && no filterClauses && conversion_date.
  // A request that trips any of these skips the pipe and reaches the pipe=NONE dead-store read
  // (a §6 fake zero today). These default INERT so every existing caller is byte-identical.
  // NOTE: only the FLEX PIPES (rules 6/7/8) are tz/filter/attributeBy sensitive. The Supabase
  // pre-agg (honors tz + refilters), the multi-touch/ai_platforms live readers, and the session
  // pipes are NOT gated by these — they resolve above/independently.
  tz = 'UTC', filtersPresent = false, attributeBy = 'conversion_date'
}) {
  const dims = [group_by, group_by2].filter(Boolean)
  if (!model || !metric || dims.length === 0) return null
  if (dims.some(d => isGatedCustomParamDim(d))) return null          // no pre-agg, no pipe, ever
  const every = (set) => dims.every(d => set.has(d))
  // A flex pipe cannot serve these shapes (engine _flexBaseCommon) -> they would dead-read.
  const flexBreaker = tz !== 'UTC' || filtersPresent || attributeBy !== 'conversion_date'

  // 1. session_* metrics -> getSessionReport (engine:2486-2492)
  if (SESSION_PIPE_METRICS.has(metric)) {
    return every(SESSION_REPORT_DIMS) ? 'session_report_pipes' : null
  }
  // 2/3. route pre-agg short-circuit — Supabase, not a pipe (attribution.js:179 / :200-248)
  const preAggDims = every(PREAGG_DIMS) && !dims.some(d => PREAGG_EXCLUDED_DIMS.has(d))
  if (viaRoutePreAgg && preAggWindowMatches && preAggDims) {
    // D0b-GATE (honest gate only — teaching the pre-agg to actually honor filters is D0b-honor's job).
    // The Supabase pre-agg readers can't honor content filters: first/last-touch (getPreAggregated-
    // Attribution) honors tz + customer_type but drops every filterClause axis INCLUDING channel; the
    // multi-touch readers (getUShaped/getTimeDecay/getWShaped/getLinear) take NEITHER filters NOR tz.
    // When the route's pre-agg short-circuit OWNS this shape, a request it can't correctly answer would
    // return UNFILTERED numbers labeled as filtered (§6 wrong-scope, worse than a zero). Return null so
    // it gates -> honest 422, and RETURN HERE rather than falling through to rule 4's live pipe: the
    // route pre-agg short-circuit fires regardless of filters, so the live pipe is NOT the backend the
    // route would actually reach for a pre-agg dim. `filtersPresent` counts channel now (it is in
    // FLEX_BREAKING_FILTER_KEYS). customer_type/min_conversions stay OUT of filtersPresent by design —
    // pre-agg honors customer_type, so those shapes keep the fast path byte-identical.
    if (PREAGG_TOUCH_MODELS.has(model) && preAggConversionMetric) {
      return filtersPresent ? null : 'supabase_preagg'
    }
    if (MULTI_TOUCH_MODELS.has(model) && preAggMultiTouchMetric) {
      return (filtersPresent || tz !== 'UTC') ? null : 'supabase_preagg'
    }
  }
  // 4. MULTI_TOUCH models fall to getMultiTouchAttributionLive (engine:2036) for everything else
  if (MULTI_TOUCH_MODELS.has(model)) {
    return every(MULTITOUCH_LIVE_DIMS) ? 'multitouch_conversions_by_site' : null
  }
  // 5. ai_platforms -> getAiPlatformAttributionLive (engine:2060)
  if (model === 'ai_platforms') {
    return every(AIPLATFORM_LIVE_DIMS) ? 'aiplatform_conversions_by_site' : null
  }
  // 6. Class-A conversion-property pipes (engine _flex*Case: _flexPipeCommon && isTouchModel).
  // flexBreaker: a non-UTC / filtered / non-conversion_date request skips the pipe -> dead read.
  if (!flexBreaker && ISTOUCH_MODELS.has(model) && !group_by2 && every(CLASS_A_DIMS) && CLASS_A_PIPE_METRICS.has(metric)) {
    return `flexible_report_${group_by}_by_site`
  }
  // 7/8. window-SENSITIVE flex pipes — only dispatch when NO attribution window is active
  if (!flexBreaker && !hasAttributionWindow && !group_by2 && PREAGG_TOUCH_MODELS.has(model)) {
    if (group_by === 'campaign') {
      if (CLASS_A_PIPE_METRICS.has(metric)) return 'flexible_report_campaign_by_site'
      if (metric === 'sessions') return 'flexible_report_campaign_sessions_by_site'
      if (metric === 'leads') return 'flexible_report_campaign_leads_by_site'
    }
    if (group_by === 'source' && model === 'first_touch' && CLASS_A_PIPE_METRICS.has(metric)) {
      return 'flexible_report_main_by_site'
    }
  }
  return null   // nothing live serves this shape -> the caller must gate it
}

/** Is the shape served by a backend that is actually DEPLOYED in prod? */
function servedByDeployedBackend (shape) {
  const backing = servedReportShape(shape)
  if (!backing) return null
  if (backing === 'supabase_preagg' || backing === 'session_report_pipes') return backing
  return PROD_DEPLOYED_PIPES.has(backing) ? backing : null
}

const UNAVAILABLE_SUFFIX = 'is temporarily unavailable while reporting moves to the new analytics store.'

/**
 * Is this report shape one that would reach a dead PostHog read, or fabricate a bucket?
 * Returns { error_code, message } to deny with, or null when the shape is servable.
 *
 * error_code is what the frontend branches on (fetchApi propagates it; precedent:
 * 'query_timeout'). Both codes render the calm "temporarily unavailable" state with NO retry
 * — retrying a deny cannot help.
 *
 * `preAggWindowMatches` is passed in (not computed) so this module stays dependency-free:
 * the caller already computes it via preAggregatedWindowMatches(resolvedWindow, siteDays).
 *
 * `model` + `preAggMultiTouchMetric` + `preAggConversionMetric` follow that SAME convention
 * (attribution-engine imports this module, so importing the PREAGG_* metric sets back would be a
 * cycle): the caller passes `PREAGG_MULTITOUCH_METRICS.has(metric)` /
 * `PREAGG_CONVERSION_METRICS.has(metric)`. All default to inert values, so every existing caller
 * that omits them (e.g. export.js) behaves byte-identically.
 */
function gatedReportReason ({ group_by, group_by2 = null, metric, preAggWindowMatches = true, model = null, preAggMultiTouchMetric = false, preAggConversionMetric = false, hasAttributionWindow = true, viaRoutePreAgg = true, tz = 'UTC', filtersPresent = false, attributeBy = 'conversion_date' }) {
  // Session metrics resolve through getSessionReport, which can only bucket by dims derivable
  // from its pageview SELECT. An unsupported dim there used to FABRICATE a single 'unknown'
  // bucket. Checked BEFORE the generic dim gate so the reason names the real constraint.
  if (metric && SESSION_PIPE_METRICS.has(metric)) {
    for (const [dim, label] of [[group_by, 'group_by'], [group_by2, 'group_by2']]) {
      if (dim && !SESSION_REPORT_DIMS.has(dim)) {
        return {
          error_code: 'unsupported_session_dim',
          message: `Session metrics can't be broken down by "${dim}" (${label}). Supported breakdowns: ${[...SESSION_REPORT_DIMS].join(', ')}.`
        }
      }
    }
    return null // a session metric on a supported dim -> routes to the session pipes
  }

  for (const dim of [group_by, group_by2]) {
    if (!dim) continue
    if (isGatedCustomParamDim(dim)) {
      return { error_code: 'gated_dead_store', message: `Custom-parameter breakdowns are ${UNAVAILABLE_SUFFIX}` }
    }
    if (GATED_GROUPS.has(dim)) {
      return { error_code: 'gated_dead_store', message: `The "${dim}" breakdown ${UNAVAILABLE_SUFFIX}` }
    }
  }
  if (metric && GATED_METRICS.has(metric)) {
    return { error_code: 'gated_dead_store', message: `The "${metric}" metric ${UNAVAILABLE_SUFFIX}` }
  }

  // Pre-agg dim contract, BOTH reader families. Mirrors the route's pre-agg ENTRY condition
  // (attribution.js:179 for first/last-touch, :200/216/232/248 for multi-touch): the model's family,
  // a metric that family's reader can emit, a matching window, and a dim the short-circuit does not
  // skip — so it denies ONLY the shapes that actually reach the readers. Shapes served elsewhere are
  // untouched: any other metric (e.g. leads on a multi-touch model) or a PREAGG_EXCLUDED_DIMS dim
  // falls through to getFlexibleReport, which buckets by groupBy honestly (via a pipe).
  const takesMultiTouchPreAgg = model && MULTI_TOUCH_MODELS.has(model) && preAggMultiTouchMetric
  const takesConversionPreAgg = model && PREAGG_TOUCH_MODELS.has(model) && preAggConversionMetric
  if ((takesMultiTouchPreAgg || takesConversionPreAgg) && preAggWindowMatches) {
    for (const dim of [group_by, group_by2]) {
      if (!dim) continue
      if (PREAGG_EXCLUDED_DIMS.has(dim) || isGatedCustomParamDim(dim)) continue
      if (!PREAGG_DIMS.has(dim)) {
        return {
          error_code: 'gated_dead_store',
          message: `The "${dim}" breakdown isn't available for the "${model}" attribution model. That report can be broken down by: ${[...PREAGG_DIMS].join(', ')}.`
        }
      }
    }
  }

  // Class-A conversion-property dims (provider / attribution_status / stitching_method /
  // conversion_type) route on a TOUCH model to flexible_report_<dim>_by_site, which — like every
  // Class-A pipe (_flexPipeCommon) — serves revenue and conversions ONLY. Any other conversion metric
  // (leads / customers / avg_conversion_value) has no Class-A backend on these models, so it would
  // fall to a bare queryHogQL and render a FAKE ZERO (§6). Deny all four uniformly and honestly.
  // Multi-touch / ai_platforms route these dims through getMultiTouchAttributionLive instead, which
  // serves leads too — so they are deliberately NOT gated here (ISTOUCH_MODELS only).
  if (model && ISTOUCH_MODELS.has(model) && preAggConversionMetric && !CLASS_A_PIPE_METRICS.has(metric)) {
    for (const dim of [group_by, group_by2]) {
      if (dim && CLASS_A_DIMS.has(dim)) {
        return {
          error_code: 'gated_dead_store',
          message: `A "${dim}" breakdown supports revenue and conversions; the "${metric}" metric ${UNAVAILABLE_SUFFIX}`
        }
      }
    }
  }
  // ── THE ALLOWLIST CATCH-ALL ───────────────────────────────────────────────────────
  // The specific rules above stay: they fire first and give a precise reason. This is the
  // backstop that makes PR#4 safe — if NO live backend serves the shape, deny it, so nothing can
  // reach a bare queryHogQL we are about to delete. `model` is required to evaluate it, so callers
  // that don't pass one (legacy) are unaffected and behave exactly as before.
  if (model) {
    const backing = servedByDeployedBackend({
      model, group_by, group_by2, metric, preAggWindowMatches, hasAttributionWindow,
      preAggConversionMetric, preAggMultiTouchMetric, viaRoutePreAgg,
      tz, filtersPresent, attributeBy
    })
    if (!backing) {
      return {
        error_code: 'gated_dead_store',
        message: `The "${group_by}" breakdown of "${metric}" ${UNAVAILABLE_SUFFIX}`
      }
    }
  }

  // Dim-aware window gate: only Class-A dims survive a non-materialized window.
  if (!preAggWindowMatches && !CLASS_A_DIMS.has(group_by) && !CLASS_A_DIMS.has(group_by2)) {
    return {
      error_code: 'gated_dead_store',
      message: `A custom attribution window is only available for provider, attribution status, stitching method, and conversion type breakdowns. Other breakdowns use your site's configured attribution window.`
    }
  }
  return null
}
const ALLOWED_GRANULARITY = new Set(['day', 'week', 'month', 'quarter', 'year'])
const ALLOWED_WINDOWS = new Set(['ltv', '1', '7', '14', '30', '60', '90'])
const ALLOWED_ATTRIBUTE_BY = new Set(['conversion_date', 'first_seen_date', 'original_source_date'])
const ALLOWED_CHART_TYPES = new Set(['bar', 'line', 'area', 'pie', 'kpi', 'table'])

const ALLOWED_FILTER_KEYS = new Set([
  'channel', 'source', 'medium', 'campaign', 'ai_source', 'country', 'device_type',
  'is_conversion', 'has_ai_source', 'min_conversions', 'customer_type', 'conversion_type'
])

const ALLOWED_CONFIG_KEYS = new Set([
  'model', 'groupBy', 'groupBy2', 'metric', 'selectedMetrics', 'chartType',
  'datePreset', 'dateFrom', 'dateTo', 'granularity', 'attributionWindow', 'attributeBy',
  'filters', 'isRolling', 'rollingDays'
])

const OVERRIDE_KEYS = new Set(['site_key', 'site_id', 'user_id', 'company_id'])

const SQL_KEYWORD_REGEX = /\b(select|union|insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i
const SQL_CHARS_REGEX = /(--|\/\*|\*\/|;)/

function isInjection(val) {
  if (typeof val !== 'string') return false
  return SQL_KEYWORD_REGEX.test(val) || SQL_CHARS_REGEX.test(val)
}

function isValidDate(dateStr) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(dateStr)) return false
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return false
  return date.toISOString().slice(0, 10) === dateStr
}

export function validateReportConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, error: 'Report config must be a non-null object' }
  }

  // Reject override keys first
  for (const key of OVERRIDE_KEYS) {
    if (key in config) {
      return { valid: false, error: `Unauthorized override key: ${key}` }
    }
  }

  // Check for unexpected configuration keys
  for (const key of Object.keys(config)) {
    if (!ALLOWED_CONFIG_KEYS.has(key)) {
      return { valid: false, error: `Invalid report config key: ${key}` }
    }
  }

  // Validate model
  if (config.model !== undefined && config.model !== null) {
    if (!ALLOWED_MODELS.has(config.model)) {
      return { valid: false, error: `Invalid attribution model: ${config.model}` }
    }
  }

  const isCustomParam = (dim) => {
    if (typeof dim !== 'string' || !/^custom_param:[a-z0-9_-]{1,40}$/.test(dim)) {
      return false
    }
    const key = dim.split(':')[1]
    const blockedSubstrings = ['email', 'phone', 'name', 'address', 'token', 'secret', 'password', 'session', 'auth', 'cookie', 'card', 'ssn']
    for (const sub of blockedSubstrings) {
      if (key.includes(sub)) return false
    }
    return true
  }

  // Validate dimensions
  if (config.groupBy !== undefined && config.groupBy !== null) {
    if (!ALLOWED_GROUPS.has(config.groupBy) && !isCustomParam(config.groupBy)) {
      return { valid: false, error: `Invalid groupBy dimension: ${config.groupBy}` }
    }
  }
  if (config.groupBy2 !== undefined && config.groupBy2 !== null) {
    if (!ALLOWED_GROUPS.has(config.groupBy2) && !isCustomParam(config.groupBy2)) {
      return { valid: false, error: `Invalid groupBy2 dimension: ${config.groupBy2}` }
    }
  }


  // Validate metrics
  if (config.metric !== undefined && config.metric !== null) {
    if (!ALLOWED_METRICS.has(config.metric)) {
      return { valid: false, error: `Invalid metric: ${config.metric}` }
    }
  }
  if (config.selectedMetrics !== undefined && config.selectedMetrics !== null) {
    if (!Array.isArray(config.selectedMetrics)) {
      return { valid: false, error: 'selectedMetrics must be an array of metrics' }
    }
    if (config.selectedMetrics.length === 0) {
      return { valid: false, error: 'selectedMetrics must not be empty' }
    }
    for (const m of config.selectedMetrics) {
      if (!ALLOWED_METRICS.has(m)) {
        return { valid: false, error: `Invalid metric in selectedMetrics: ${m}` }
      }
    }
  }

  // Validate chart type
  if (config.chartType !== undefined && config.chartType !== null) {
    if (!ALLOWED_CHART_TYPES.has(config.chartType)) {
      return { valid: false, error: `Invalid chartType: ${config.chartType}` }
    }
  }

  // Validate granularity
  if (config.granularity !== undefined && config.granularity !== null) {
    if (!ALLOWED_GRANULARITY.has(config.granularity)) {
      return { valid: false, error: `Invalid granularity: ${config.granularity}` }
    }
  }

  // Validate lookback window and attribute anchors
  if (config.attributionWindow !== undefined && config.attributionWindow !== null) {
    if (!ALLOWED_WINDOWS.has(String(config.attributionWindow))) {
      return { valid: false, error: `Invalid attributionWindow: ${config.attributionWindow}` }
    }
  }
  if (config.attributeBy !== undefined && config.attributeBy !== null) {
    if (!ALLOWED_ATTRIBUTE_BY.has(config.attributeBy)) {
      return { valid: false, error: `Invalid attributeBy: ${config.attributeBy}` }
    }
  }

  // Validate rolling window parameters
  if (config.isRolling !== undefined && config.isRolling !== null) {
    if (typeof config.isRolling !== 'boolean') {
      return { valid: false, error: 'isRolling must be a boolean' }
    }
  }
  if (config.rollingDays !== undefined && config.rollingDays !== null) {
    const days = Number(config.rollingDays)
    if (!Number.isInteger(days) || days <= 0) {
      return { valid: false, error: 'rollingDays must be a positive integer' }
    }
  }

  // Validate date range format (real Date validation)
  if (config.dateFrom !== undefined && config.dateFrom !== null && config.dateFrom !== '') {
    if (!isValidDate(config.dateFrom)) {
      return { valid: false, error: `Invalid dateFrom format/value: ${config.dateFrom}` }
    }
  }
  if (config.dateTo !== undefined && config.dateTo !== null && config.dateTo !== '') {
    if (!isValidDate(config.dateTo)) {
      return { valid: false, error: `Invalid dateTo format/value: ${config.dateTo}` }
    }
  }

  // Validate filters
  if (config.filters !== undefined && config.filters !== null) {
    const filters = config.filters
    if (typeof filters !== 'object' || Array.isArray(filters)) {
      return { valid: false, error: 'filters must be a flat object' }
    }

    for (const [key, val] of Object.entries(filters)) {
      if (!ALLOWED_FILTER_KEYS.has(key)) {
        return { valid: false, error: `Invalid filter key: ${key}` }
      }

      if (val === null || val === undefined) continue

      // Enforce flat objects only (no arrays or nested objects)
      if (typeof val === 'object') {
        return { valid: false, error: `Nested objects or arrays are not allowed in filter value for key: ${key}` }
      }

      // Check for SQL/HogQL override keys inside filters object
      if (OVERRIDE_KEYS.has(key)) {
        return { valid: false, error: `Unauthorized override key in filters: ${key}` }
      }

      // Specific filter validations
      if (key === 'customer_type') {
        if (val !== 'new' && val !== 'returning' && val !== '') {
          return { valid: false, error: 'customer_type filter must be new, returning, or empty' }
        }
      } else if (key === 'min_conversions') {
        const minVal = Number(val)
        if (isNaN(minVal) || minVal < 0) {
          return { valid: false, error: 'min_conversions filter must be a non-negative number' }
        }
      } else if (key === 'is_conversion' || key === 'has_ai_source') {
        const strVal = String(val)
        if (typeof val !== 'boolean' && strVal !== 'true' && strVal !== 'false' && strVal !== '') {
          return { valid: false, error: `${key} filter must be a boolean or true/false` }
        }
      }

      // Check string filters for length and SQL/HogQL injection signatures
      if (typeof val === 'string') {
        if (val.length > 100) {
          return { valid: false, error: `Filter value for key ${key} exceeds maximum length of 100 characters` }
        }
        if (isInjection(val)) {
          return { valid: false, error: `SQL/HogQL injection signature detected in filter value: ${val}` }
        }
      }
    }
  }

  return { valid: true, error: null }
}

export {
  ALLOWED_MODELS,
  ALLOWED_GROUPS,
  ALLOWED_METRICS,
  ALLOWED_GRANULARITY,
  ALLOWED_WINDOWS,
  ALLOWED_ATTRIBUTE_BY,
  ALLOWED_CHART_TYPES,
  CLASS_A_DIMS,
  PREAGG_DIMS,
  MULTI_TOUCH_MODELS,
  PREAGG_TOUCH_MODELS,
  ISTOUCH_MODELS,
  CLASS_A_PIPE_METRICS,
  MULTITOUCH_LIVE_DIMS,
  MULTITOUCH_BROKEN_BRANCH_DIMS,
  AIPLATFORM_LIVE_DIMS,
  PROD_DEPLOYED_PIPES,
  servedReportShape,
  servedByDeployedBackend,
  PREAGG_EXCLUDED_DIMS,
  GATED_GROUPS,
  GATED_METRICS,
  SESSION_REPORT_DIMS,
  SESSION_PIPE_METRICS,
  gatedReportReason,
  // Exported so a ROUTE that builds its own gate message shares this exact sentence instead of
  // hand-inlining it. api/routes/campaigns.js did inline it while already importing from this
  // module — a silent fork in what two pages tell a user about the same gate (KI-57).
  UNAVAILABLE_SUFFIX,
  FLEX_BREAKING_FILTER_KEYS,
  flexFiltersPresent
}
