const ALLOWED_MODELS = new Set(['first_touch', 'last_touch', 'first_touch_non_direct', 'last_touch_non_direct', 'ai_platforms', 'linear', 'u_shaped', 'time_decay', 'w_shaped'])
const ALLOWED_GROUPS = new Set(['channel', 'source', 'medium', 'campaign', 'keyword', 'referrer_domain', 'ai_source', 'landing_page', 'country', 'device', 'conversion_type', 'date', 'provider', 'attribution_status', 'stitching_method'])
const ALLOWED_METRICS = new Set([
  'revenue', 'conversions', 'sessions', 'leads', 'conversion_rate',
  'avg_conversion_value', 'ai_conversions', 'ai_revenue', 'ai_conversion_share',
  'ai_revenue_share', 'ltv_revenue',
  'session_count', 'avg_session_duration', 'pages_per_session', 'conversion_sessions',
  'days_to_convert', 'touchpoints_per_conversion'
])
const ALLOWED_GRANULARITY = new Set(['day', 'week', 'month', 'quarter', 'year'])
const ALLOWED_WINDOWS = new Set(['ltv', '1', '7', '14', '30', '60', '90'])
const ALLOWED_ATTRIBUTE_BY = new Set(['conversion_date', 'first_seen_date', 'original_source_date'])
const ALLOWED_CHART_TYPES = new Set(['bar', 'line', 'area', 'pie', 'kpi', 'table'])

const ALLOWED_FILTER_KEYS = new Set([
  'channel', 'source', 'medium', 'campaign', 'ai_source', 'country', 'device_type',
  'is_conversion', 'has_ai_source', 'min_conversions', 'customer_type'
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
  ALLOWED_CHART_TYPES
}
