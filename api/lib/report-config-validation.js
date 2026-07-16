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
 */
function gatedReportReason ({ group_by, group_by2 = null, metric, preAggWindowMatches = true }) {
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
  GATED_GROUPS,
  GATED_METRICS,
  SESSION_REPORT_DIMS,
  SESSION_PIPE_METRICS,
  gatedReportReason
}
