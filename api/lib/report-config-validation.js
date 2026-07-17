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
function gatedReportReason ({ group_by, group_by2 = null, metric, preAggWindowMatches = true, model = null, preAggMultiTouchMetric = false, preAggConversionMetric = false }) {
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

  // conversion_type is a Class-A dim: on a TOUCH model it routes to flexible_report_conversion_type_
  // by_site, which — like every Class-A pipe — serves revenue and conversions ONLY. Any other
  // conversion metric (leads / customers / avg_conversion_value) has no conversion_type backend on
  // these models, so it would fall to a bare queryHogQL and render a FAKE ZERO (§6). Deny it honestly.
  // Multi-touch / ai_platforms route conversion_type through getMultiTouchAttributionLive instead,
  // which serves leads too — so they are deliberately NOT gated here.
  // (NOTE: provider/attribution_status/stitching_method × leads have the SAME dead-store gap today
  // and are NOT gated — a pre-existing §6 hole, left unchanged per this change's scope; see the PR.)
  if (model && ISTOUCH_MODELS.has(model) && preAggConversionMetric && !CLASS_A_PIPE_METRICS.has(metric)) {
    for (const dim of [group_by, group_by2]) {
      if (dim === 'conversion_type') {
        return {
          error_code: 'gated_dead_store',
          message: `A conversion type breakdown supports revenue and conversions; the "${metric}" metric ${UNAVAILABLE_SUFFIX}`
        }
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
  PREAGG_EXCLUDED_DIMS,
  GATED_GROUPS,
  GATED_METRICS,
  SESSION_REPORT_DIMS,
  SESSION_PIPE_METRICS,
  gatedReportReason
}
