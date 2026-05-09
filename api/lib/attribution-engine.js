import NodeCache from 'node-cache'
import { queryHogQL } from './posthog.js'

const cache = new NodeCache({ stdTTL: 60, checkperiod: 30 })

function toHogDate(iso) {
  return iso.replace('T', ' ').replace(/\.\d+Z?$/, '').replace('Z', '')
}

function cacheKey(model, siteKey, dateFrom, dateTo) {
  return `${model}:${siteKey}:${dateFrom}:${dateTo}`
}

function esc(str) {
  return str.replace(/'/g, "''")
}

async function firstTouchAttribution(siteKey, dateFrom, dateTo) {
  const fromDate = toHogDate(dateFrom)
  const toDate = toHogDate(dateTo)

  const sql = `
    SELECT
      COALESCE(NULLIF(properties.first_touch_source, ''), 'direct') AS source,
      COALESCE(NULLIF(properties.first_touch_medium, ''), 'none') AS medium,
      properties.first_touch_campaign AS campaign,
      COUNT(*) AS conversions,
      SUM(toFloat64OrZero(toString(properties.conversion_value))) AS revenue
    FROM events
    WHERE properties.site_id = '${esc(siteKey)}'
      AND event = '$conversion'
      AND timestamp >= toDateTime('${fromDate}')
      AND timestamp <= toDateTime('${toDate}')
    GROUP BY source, medium, campaign
    ORDER BY revenue DESC
    LIMIT 50000
  `

  const rows = await queryHogQL(sql, 'first_touch_attribution')
  return rows.map(([source, medium, campaign, conversions, revenue]) => ({
    source,
    medium,
    campaign: campaign || null,
    conversions: Number(conversions) || 0,
    revenue: Number(revenue) || 0
  }))
}

async function lastTouchAttribution(siteKey, dateFrom, dateTo) {
  const fromDate = toHogDate(dateFrom)
  const toDate = toHogDate(dateTo)

  const sql = `
    SELECT
      COALESCE(NULLIF(properties.utm_source, ''), 'direct') AS source,
      COALESCE(NULLIF(properties.utm_medium, ''), 'none') AS medium,
      properties.utm_campaign AS campaign,
      COUNT(*) AS conversions,
      SUM(toFloat64OrZero(toString(properties.conversion_value))) AS revenue
    FROM events
    WHERE properties.site_id = '${esc(siteKey)}'
      AND event = '$conversion'
      AND timestamp >= toDateTime('${fromDate}')
      AND timestamp <= toDateTime('${toDate}')
    GROUP BY source, medium, campaign
    ORDER BY revenue DESC
    LIMIT 50000
  `

  const rows = await queryHogQL(sql, 'last_touch_attribution')
  return rows.map(([source, medium, campaign, conversions, revenue]) => ({
    source,
    medium,
    campaign: campaign || null,
    conversions: Number(conversions) || 0,
    revenue: Number(revenue) || 0
  }))
}

async function linearAttribution(siteKey, dateFrom, dateTo) {
  const fromDate = toHogDate(dateFrom)
  const toDate = toHogDate(dateTo)

  const sql = `
    SELECT
      COALESCE(NULLIF(t.source, ''), 'direct') AS source,
      COALESCE(NULLIF(t.medium, ''), 'none') AS medium,
      t.campaign,
      COUNT(DISTINCT t.distinct_id) AS converting_users,
      SUM(t.share) AS revenue
    FROM (
      SELECT
        e.distinct_id,
        e.properties.utm_source AS source,
        e.properties.utm_medium AS medium,
        e.properties.utm_campaign AS campaign,
        toFloat64OrZero(toString(cv.conversion_value)) / cv.tp_count AS share
      FROM events e
      INNER JOIN (
        SELECT
          ce.distinct_id,
          FIRST_VALUE(ce.properties.conversion_value) AS conversion_value,
          (
            SELECT COUNT(*)
            FROM events pe
            WHERE pe.properties.site_id = '${esc(siteKey)}'
              AND pe.event = '$pageview'
              AND pe.distinct_id = ce.distinct_id
          ) AS tp_count
        FROM events ce
        WHERE ce.properties.site_id = '${esc(siteKey)}'
          AND ce.event = '$conversion'
          AND ce.timestamp >= toDateTime('${fromDate}')
          AND ce.timestamp <= toDateTime('${toDate}')
        GROUP BY ce.distinct_id
      ) cv ON e.distinct_id = cv.distinct_id
      WHERE e.properties.site_id = '${esc(siteKey)}'
        AND e.event = '$pageview'
        AND e.properties.utm_source IS NOT NULL
        AND e.properties.utm_source != ''
        AND cv.tp_count > 0
    ) t
    GROUP BY t.source, t.medium, t.campaign
    ORDER BY revenue DESC
    LIMIT 50000
  `

  const rows = await queryHogQL(sql, 'linear_attribution')
  return rows.map(([source, medium, campaign, convertingUsers, revenue]) => ({
    source,
    medium,
    campaign: campaign || null,
    converting_users: Number(convertingUsers) || 0,
    revenue: Number(revenue) || 0
  }))
}

async function aiPlatformAttribution(siteKey, dateFrom, dateTo) {
  const fromDate = toHogDate(dateFrom)
  const toDate = toHogDate(dateTo)

  const sql = `
    SELECT
      properties.ai_source AS source,
      COUNT(*) AS conversions,
      SUM(toFloat64OrZero(toString(properties.conversion_value))) AS revenue
    FROM events
    WHERE properties.site_id = '${esc(siteKey)}'
      AND event = '$conversion'
      AND properties.ai_source IS NOT NULL
      AND properties.ai_source != ''
      AND timestamp >= toDateTime('${fromDate}')
      AND timestamp <= toDateTime('${toDate}')
    GROUP BY source
    ORDER BY revenue DESC
    LIMIT 50000
  `

  const rows = await queryHogQL(sql, 'ai_platform_attribution')
  return rows.map(([source, conversions, revenue]) => ({
    source,
    conversions: Number(conversions) || 0,
    revenue: Number(revenue) || 0
  }))
}

export async function getAttribution(siteKey, model, dateFrom, dateTo) {
  const key = cacheKey(model, siteKey, dateFrom, dateTo)
  const cached = cache.get(key)
  if (cached) return cached

  let results
  switch (model) {
    case 'first_touch':
      results = await firstTouchAttribution(siteKey, dateFrom, dateTo)
      break
    case 'last_touch':
      results = await lastTouchAttribution(siteKey, dateFrom, dateTo)
      break
    case 'linear':
      results = await linearAttribution(siteKey, dateFrom, dateTo)
      break
    case 'ai_platforms':
      results = await aiPlatformAttribution(siteKey, dateFrom, dateTo)
      break
    default:
      throw new Error(`Unknown attribution model: ${model}`)
  }

  cache.set(key, results)
  return results
}

const GROUP_COLUMNS = {
  source: {
    first_touch: "COALESCE(NULLIF(properties.first_touch_source, ''), 'direct')",
    last_touch: "COALESCE(NULLIF(properties.utm_source, ''), 'direct')",
    linear: "COALESCE(NULLIF(properties.utm_source, ''), 'direct')",
    ai_platforms: 'properties.ai_source'
  },
  medium: {
    first_touch: "COALESCE(NULLIF(properties.first_touch_medium, ''), 'none')",
    last_touch: "COALESCE(NULLIF(properties.utm_medium, ''), 'none')",
    linear: "COALESCE(NULLIF(properties.utm_medium, ''), 'none')",
    ai_platforms: "'—'"
  },
  campaign: {
    first_touch: 'properties.first_touch_campaign',
    last_touch: 'properties.utm_campaign',
    linear: 'properties.utm_campaign',
    ai_platforms: "'—'"
  },
  ai_source: {
    first_touch: "COALESCE(NULLIF(properties.ai_source, ''), 'none')",
    last_touch: "COALESCE(NULLIF(properties.ai_source, ''), 'none')",
    linear: "COALESCE(NULLIF(properties.ai_source, ''), 'none')",
    ai_platforms: 'properties.ai_source'
  },
  landing_page: {
    first_touch: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    last_touch: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    linear: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    ai_platforms: "COALESCE(NULLIF(properties.page_url, ''), '/')"
  },
  country: {
    first_touch: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    last_touch: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    linear: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    ai_platforms: "COALESCE(NULLIF(properties.country, ''), 'unknown')"
  },
  device: {
    first_touch: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    last_touch: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    linear: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    ai_platforms: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')"
  },
  date: {
    first_touch: "formatDateTime(timestamp, '%Y-%m-%d')",
    last_touch: "formatDateTime(timestamp, '%Y-%m-%d')",
    linear: "formatDateTime(timestamp, '%Y-%m-%d')",
    ai_platforms: "formatDateTime(timestamp, '%Y-%m-%d')"
  }
}

const GRANULARITY_MAP = {
  day: "'%Y-%m-%d'",
  week: "'%Y-W%V'",
  month: "'%Y-%m'",
  quarter: "'%Y-Q'",
  year: "'%Y'"
}

export async function getFlexibleReport(siteKey, model, dateFrom, dateTo, groupBy, metric, filters = {}, groupBy2 = null, granularity = 'day', attributionWindow = null, attributeBy = 'conversion_date') {
  const filterKey = JSON.stringify(filters) + groupBy2 + granularity + attributionWindow
  const key = cacheKey(`${model}:${groupBy}:${metric}:${filterKey}`, siteKey, dateFrom, dateTo)
  const cached = cache.get(key)
  if (cached) return cached

  const fromDate = toHogDate(dateFrom)
  const toDate = toHogDate(dateTo)
  const safeSite = esc(siteKey)

  const dimExpr = groupBy === 'date' && granularity !== 'day'
    ? `formatDateTime(timestamp, ${GRANULARITY_MAP[granularity] || GRANULARITY_MAP.day})`
    : GROUP_COLUMNS[groupBy]?.[model]

  if (!dimExpr) {
    throw new Error(`Unsupported group_by: ${groupBy} for model: ${model}`)
  }

  let dim2Expr = null
  if (groupBy2) {
    dim2Expr = groupBy2 === 'date'
      ? `formatDateTime(timestamp, ${GRANULARITY_MAP[granularity] || GRANULARITY_MAP.day})`
      : GROUP_COLUMNS[groupBy2]?.[model]
    if (!dim2Expr) {
      throw new Error(`Unsupported group_by2: ${groupBy2} for model: ${model}`)
    }
  }

  let metricCol, metricLabel, eventFilter, extraSelect

  switch (metric) {
    case 'revenue':
      metricCol = `SUM(toFloat64OrZero(toString(properties.conversion_value)))`
      metricLabel = 'revenue'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    case 'conversions':
      metricCol = 'COUNT(*)'
      metricLabel = 'conversions'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    case 'sessions':
      metricCol = 'COUNT(DISTINCT distinct_id)'
      metricLabel = 'sessions'
      eventFilter = "AND event = '$pageview'"
      extraSelect = ''
      break
    case 'leads':
      // TODO: confirm what defines a lead event
      metricCol = 'COUNT(*)'
      metricLabel = 'leads'
      eventFilter = "AND event = '$identify'"
      extraSelect = ''
      break
    case 'conversion_rate':
      metricCol = 'COUNT(*)'
      metricLabel = 'conversion_rate'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    case 'avg_conversion_value':
      metricCol = `AVG(toFloat64OrZero(toString(properties.conversion_value)))`
      metricLabel = 'avg_conversion_value'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    case 'ai_conversions':
      metricCol = 'COUNT(*)'
      metricLabel = 'ai_conversions'
      eventFilter = "AND event = '$conversion' AND properties.ai_source IS NOT NULL AND properties.ai_source != ''"
      extraSelect = ''
      break
    case 'ai_revenue':
      metricCol = `SUM(toFloat64OrZero(toString(properties.conversion_value)))`
      metricLabel = 'ai_revenue'
      eventFilter = "AND event = '$conversion' AND properties.ai_source IS NOT NULL AND properties.ai_source != ''"
      extraSelect = ''
      break
    case 'ai_conversion_share':
      metricCol = 'COUNT(*)'
      metricLabel = 'ai_conversion_share'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    case 'ai_revenue_share':
      metricCol = `SUM(toFloat64OrZero(toString(properties.conversion_value)))`
      metricLabel = 'ai_revenue_share'
      eventFilter = "AND event = '$conversion'"
      extraSelect = ''
      break
    default:
      throw new Error(`Unknown metric: ${metric}`)
  }

  // Attribution window: filter touch events within N days of conversion
  let windowClause = ''
  if (attributionWindow && attributionWindow !== 'ltv' && Number(attributionWindow) > 0) {
    windowClause = `\n    AND timestamp >= toDateTime('${fromDate}') - INTERVAL ${Number(attributionWindow)} DAY`
  }

  const orderClause = groupBy === 'date' ? 'ORDER BY dim_value ASC' : 'ORDER BY metric_value DESC'

  let havingClause = ''
  if (filters.min_conversions) {
    havingClause = `\n    HAVING metric_value >= ${Number(filters.min_conversions)}`
  }

  let filterClauses = ''
  if (filters.source) {
    filterClauses += `\n    AND properties.utm_source = '${esc(filters.source)}'`
  }
  if (filters.medium) {
    filterClauses += `\n    AND properties.utm_medium = '${esc(filters.medium)}'`
  }
  if (filters.campaign) {
    filterClauses += `\n    AND properties.utm_campaign = '${esc(filters.campaign)}'`
  }
  if (filters.ai_source) {
    filterClauses += `\n    AND properties.ai_source = '${esc(filters.ai_source)}'`
  }
  if (filters.country) {
    filterClauses += `\n    AND properties.country = '${esc(filters.country)}'`
  }
  if (filters.device_type) {
    filterClauses += `\n    AND properties.device_type = '${esc(filters.device_type)}'`
  }
  if (filters.is_conversion === 'true') {
    filterClauses += `\n    AND properties.is_conversion = true`
  }
  if (filters.has_ai_source === 'true') {
    filterClauses += `\n    AND properties.ai_source IS NOT NULL AND properties.ai_source != ''`
  }
  if (filters.has_ai_source === 'false') {
    filterClauses += `\n    AND (properties.ai_source IS NULL OR properties.ai_source = '')`
  }

  const sql = `
    SELECT
      ${dimExpr} AS dim_value${dim2Expr ? `,\n      ${dim2Expr} AS dim_value2` : ''},
      ${metricCol} AS metric_value
      ${extraSelect}
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND timestamp >= toDateTime('${fromDate}')${windowClause}
      AND timestamp <= toDateTime('${toDate}')
      ${eventFilter}${filterClauses}
    GROUP BY dim_value${dim2Expr ? ', dim_value2' : ''}
    ${havingClause}
    ${orderClause}
    LIMIT 50000
  `

  const rows = await queryHogQL(sql, 'flexible_report')
  const results = rows.map(([dimValue, dimValue2, metricValue, ...extra]) => {
    const item = {
      dim_value: dimValue || 'unknown',
      ...(dim2Expr ? { dim_value2: dimValue2 || 'unknown' } : {}),
      [metricLabel]: Number(metricValue) || 0
    }
    if (extraSelect.includes('sessions') && extra[0] != null) {
      item.sessions = Number(extra[0]) || 0
    }
    return item
  })

  if (metric === 'conversion_rate' && results.length > 0) {
    const sessKey = cacheKey(`sessions:${groupBy}${groupBy2 || ''}`, siteKey, dateFrom, dateTo)
    let sessionsByDim = cache.get(sessKey)
    if (!sessionsByDim) {
      const sessSql = `
        SELECT
          ${dimExpr} AS dim_value${dim2Expr ? `,\n          ${dim2Expr} AS dim_value2` : ''},
          COUNT(DISTINCT distinct_id) AS sessions
        FROM events
        WHERE properties.site_id = '${safeSite}'
          AND event = '$pageview'
          AND timestamp >= toDateTime('${fromDate}')
          AND timestamp <= toDateTime('${toDate}')${filterClauses}
        GROUP BY dim_value${dim2Expr ? ', dim_value2' : ''}
        LIMIT 50000
      `
      const sessRows = await queryHogQL(sessSql, 'flexible_sessions')
      sessionsByDim = {}
      for (const [d, s] of sessRows) {
        sessionsByDim[d || 'unknown'] = Number(s) || 1
      }
      cache.set(sessKey, sessionsByDim, 60)
    }
    for (const item of results) {
      const sess = sessionsByDim[item.dim_value] || 1
      item.conversion_rate = sess > 0 ? ((item.conversion_rate / sess) * 100) : 0
    }
  }

  if ((metric === 'ai_conversion_share' || metric === 'ai_revenue_share') && results.length > 0) {
    const shareSql = `
      SELECT
        ${dimExpr} AS dim_value${dim2Expr ? `,\n        ${dim2Expr} AS dim_value2` : ''},
        ${metric === 'ai_conversion_share' ? 'COUNT(*)' : `SUM(toFloat64OrZero(toString(properties.conversion_value)))`} AS ai_value
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$conversion'
        AND properties.ai_source IS NOT NULL
        AND properties.ai_source != ''
        AND timestamp >= toDateTime('${fromDate}')
        AND timestamp <= toDateTime('${toDate}')${filterClauses}
      GROUP BY dim_value${dim2Expr ? ', dim_value2' : ''}
      LIMIT 50000
    `
    const shareRows = await queryHogQL(shareSql, 'flexible_ai_share')
    const aiByDim = {}
    for (const [d, v] of shareRows) {
      aiByDim[d || 'unknown'] = Number(v) || 0
    }
    const shareLabel = metric === 'ai_conversion_share' ? 'ai_conversion_share' : 'ai_revenue_share'
    for (const item of results) {
      const total = item[metric === 'ai_conversion_share' ? 'ai_conversion_share' : 'ai_revenue_share'] || 0
      const aiTotal = aiByDim[item.dim_value] || 0
      item[shareLabel] = total > 0 ? ((aiTotal / total) * 100) : 0
    }
  }

  cache.set(key, results)
  return results
}
