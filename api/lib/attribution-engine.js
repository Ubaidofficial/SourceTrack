import NodeCache from 'node-cache'
import { queryHogQL } from './posthog.js'
import { deriveSessions, annotateSessions } from './sessionization.js'

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

// Direct classification helper — used by non-direct attribution models.
// A touchpoint is direct when UTM source (trimmed+lowercased per ingestion normalization)
// is empty, null, or equal to 'direct'.
// This is intentionally conservative; only non-empty non-'direct' UTM sources qualify.
function isDirectCondition(tableAlias = 'events') {
  return `(${tableAlias}.properties.utm_source IS NULL OR ${tableAlias}.properties.utm_source = '' OR ${tableAlias}.properties.utm_source = 'direct')`
}

async function firstTouchNonDirectAttribution(siteKey, dateFrom, dateTo) {
  const fromDate = toHogDate(dateFrom)
  const toDate = toHogDate(dateTo)

  const sql = `
    SELECT
      COALESCE(NULLIF(ft.utm_source, ''), 'direct') AS source,
      COALESCE(NULLIF(ft.utm_medium, ''), 'none') AS medium,
      ft.utm_campaign AS campaign,
      COUNT(*) AS conversions,
      SUM(toFloat64OrZero(toString(e.properties.conversion_value))) AS revenue
    FROM events e
    LEFT JOIN (
      SELECT distinct_id,
        argMin(properties.utm_source, timestamp) AS utm_source,
        argMin(properties.utm_medium, timestamp) AS utm_medium,
        argMin(properties.utm_campaign, timestamp) AS utm_campaign
      FROM events
      WHERE properties.site_id = '${esc(siteKey)}'
        AND event = '$pageview'
        AND properties.utm_source IS NOT NULL
        AND properties.utm_source != ''
        AND properties.utm_source != 'direct'
        AND timestamp >= toDateTime('${fromDate}')
        AND timestamp <= toDateTime('${toDate}')
      GROUP BY distinct_id
    ) ft ON e.distinct_id = ft.distinct_id
    WHERE e.properties.site_id = '${esc(siteKey)}'
      AND e.event = '$conversion'
      AND e.timestamp >= toDateTime('${fromDate}')
      AND e.timestamp <= toDateTime('${toDate}')
    GROUP BY source, medium, campaign
    ORDER BY revenue DESC
    LIMIT 50000
  `

  const rows = await queryHogQL(sql, 'first_touch_non_direct_attribution')
  return rows.map(([source, medium, campaign, conversions, revenue]) => ({
    source,
    medium,
    campaign: campaign || null,
    conversions: Number(conversions) || 0,
    revenue: Number(revenue) || 0
  }))
}

async function lastTouchNonDirectAttribution(siteKey, dateFrom, dateTo) {
  const fromDate = toHogDate(dateFrom)
  const toDate = toHogDate(dateTo)

  const sql = `
    SELECT
      COALESCE(NULLIF(lt.utm_source, ''), 'direct') AS source,
      COALESCE(NULLIF(lt.utm_medium, ''), 'none') AS medium,
      lt.utm_campaign AS campaign,
      COUNT(*) AS conversions,
      SUM(toFloat64OrZero(toString(e.properties.conversion_value))) AS revenue
    FROM events e
    LEFT JOIN (
      SELECT distinct_id,
        argMax(properties.utm_source, timestamp) AS utm_source,
        argMax(properties.utm_medium, timestamp) AS utm_medium,
        argMax(properties.utm_campaign, timestamp) AS utm_campaign
      FROM events
      WHERE properties.site_id = '${esc(siteKey)}'
        AND event = '$pageview'
        AND properties.utm_source IS NOT NULL
        AND properties.utm_source != ''
        AND properties.utm_source != 'direct'
        AND timestamp >= toDateTime('${fromDate}')
        AND timestamp <= toDateTime('${toDate}')
      GROUP BY distinct_id
    ) lt ON e.distinct_id = lt.distinct_id
    WHERE e.properties.site_id = '${esc(siteKey)}'
      AND e.event = '$conversion'
      AND e.timestamp >= toDateTime('${fromDate}')
      AND e.timestamp <= toDateTime('${toDate}')
    GROUP BY source, medium, campaign
    ORDER BY revenue DESC
    LIMIT 50000
  `

  const rows = await queryHogQL(sql, 'last_touch_non_direct_attribution')
  return rows.map(([source, medium, campaign, conversions, revenue]) => ({
    source,
    medium,
    campaign: campaign || null,
    conversions: Number(conversions) || 0,
    revenue: Number(revenue) || 0
  }))
}

// NOT CURRENTLY WIRED: linear model is removed from ALLOWED_MODELS in api/routes/attribution.js.
// This implementation uses FIRST_VALUE(conversion_value) per user — not true multi-touch linear
// as defined by ATTRIBUTION.md Part 2 ("equal credit distributed across all touchpoints").
// Kept for reference; re‑enable only after implementing per-touchpoint credit distribution.
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
    case 'first_touch_non_direct':
      results = await firstTouchNonDirectAttribution(siteKey, dateFrom, dateTo)
      break
    case 'last_touch_non_direct':
      results = await lastTouchNonDirectAttribution(siteKey, dateFrom, dateTo)
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

/**
 * Session report — derives sessions from pageview events on read.
 * NOT materialized: sessions are computed at query time using the 30-minute inactivity rule.
 * Limited to 50,000 pageview events per query for performance.
 * Sessions are attributed by entry source (UTM source of the first pageview in the session).
 */
export async function getSessionReport(siteKey, dateFrom, dateTo, groupBy, metric, filters = {}, groupBy2 = null) {
  const key = cacheKey(`session:${groupBy}:${metric}:${JSON.stringify(filters)}:${groupBy2 || ''}`, siteKey, dateFrom, dateTo)
  const cached = cache.get(key)
  if (cached) return cached

  const fromDate = toHogDate(dateFrom)
  const toDate = toHogDate(dateTo)
  const safeSite = esc(siteKey)

  // Build filter clauses (same pattern as getFlexibleReport)
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
  if (filters.country) {
    filterClauses += `\n    AND properties.country = '${esc(filters.country)}'`
  }
  if (filters.device_type) {
    filterClauses += `\n    AND properties.device_type = '${esc(filters.device_type)}'`
  }

  // Query pageviews for session derivation
  const sql = `
    SELECT
      distinct_id,
      timestamp,
      properties.page_url,
      properties.utm_source,
      properties.utm_medium,
      properties.utm_campaign,
      properties.country,
      properties.device_type
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND event = '$pageview'
      AND timestamp >= toDateTime('${fromDate}')
      AND timestamp <= toDateTime('${toDate}')${filterClauses}
    ORDER BY distinct_id ASC, timestamp ASC
    LIMIT 50000
  `

  const rows = await queryHogQL(sql, 'session_report_pageviews')

  // Also query conversions for conversion_sessions metric
  const convSql = `
    SELECT
      distinct_id,
      timestamp
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND event = '$conversion'
      AND timestamp >= toDateTime('${fromDate}')
      AND timestamp <= toDateTime('${toDate}')${filterClauses}
    ORDER BY distinct_id ASC, timestamp ASC
    LIMIT 50000
  `

  const convRows = await queryHogQL(convSql, 'session_report_conversions')

  // Build events array per visitor
  const eventsByVisitor = new Map()

  for (const row of rows) {
    const [distinctId, timestamp, pageUrl, utmSource, utmMedium, utmCampaign, country, deviceType] = row
    if (!eventsByVisitor.has(distinctId)) eventsByVisitor.set(distinctId, [])
    eventsByVisitor.get(distinctId).push({
      event: '$pageview',
      timestamp,
      page_url: pageUrl || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      country: country || null,
      device_type: deviceType || null,
      conversion_value: null
    })
  }

  for (const row of convRows) {
    const [distinctId, timestamp] = row
    if (!eventsByVisitor.has(distinctId)) eventsByVisitor.set(distinctId, [])
    eventsByVisitor.get(distinctId).push({
      event: '$conversion',
      timestamp,
      page_url: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      country: null,
      device_type: null,
      conversion_value: null
    })
  }

  // Derive sessions per visitor
  let allSessions = []
  for (const [, events] of eventsByVisitor) {
    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    const sessions = deriveSessions(events)
    allSessions = allSessions.concat(sessions)
  }

  // Group sessions by dimension
  const dimKey = (sess) => {
    switch (groupBy) {
      case 'source': return sess.entry_source || 'direct'
      case 'medium': return sess.entry_medium || 'none'
      case 'campaign': return sess.entry_campaign || 'unknown'
      case 'landing_page': return sess.entry_page || '/'
      case 'country': return sess.country || 'unknown'
      case 'device': return sess.device_type || 'unknown'
      case 'date': return sess.started_at.split('T')[0]
      default: return 'unknown'
    }
  }

  const dim2Key = groupBy2 ? (sess) => {
    switch (groupBy2) {
      case 'source': return sess.entry_source || 'direct'
      case 'medium': return sess.entry_medium || 'none'
      case 'campaign': return sess.entry_campaign || 'unknown'
      case 'landing_page': return sess.entry_page || '/'
      case 'country': return sess.country || 'unknown'
      case 'device': return sess.device_type || 'unknown'
      case 'date': return sess.started_at.split('T')[0]
      default: return 'unknown'
    }
  } : null

  const groups = new Map()

  for (const sess of allSessions) {
    const d1 = dimKey(sess)
    const d2 = dim2Key ? dim2Key(sess) : null
    const key = d2 ? `${d1}||${d2}` : d1

    if (!groups.has(key)) {
      groups.set(key, { dim_value: d1, dim_value2: d2, sessions: [], total_duration: 0, total_pageviews: 0, conversion_sessions: 0 })
    }
    const g = groups.get(key)
    g.sessions.push(sess)
    g.total_duration += sess.duration_seconds || 0
    g.total_pageviews += sess.pageview_count || 0
    if (sess.contains_conversion) g.conversion_sessions += 1
  }

  let results = []
  for (const g of groups.values()) {
    const count = g.sessions.length
    const avgDuration = count > 0 ? g.total_duration / count : 0
    const avgPages = count > 0 ? g.total_pageviews / count : 0

    let metricValue
    switch (metric) {
      case 'session_count': metricValue = count; break
      case 'avg_session_duration': metricValue = Math.round(avgDuration); break
      case 'pages_per_session': metricValue = Math.round(avgPages * 10) / 10; break
      case 'conversion_sessions': metricValue = g.conversion_sessions; break
      default: metricValue = 0
    }

    const item = {
      dim_value: g.dim_value,
      ...(dim2Key ? { dim_value2: g.dim_value2 } : {}),
      [metric]: metricValue
    }
    results.push(item)
  }

  results.sort((a, b) => (b[metric] || 0) - (a[metric] || 0))

  cache.set(key, results)
  return results
}

// Attribution explanation: for a given distinct_id, site, and model, return WHY
// credit was assigned — the specific touchpoint, journey timeline, and model logic.
export async function getAttributionExplanation(siteKey, model, distinctId) {
  const safeSite = esc(siteKey)
  const safeId = esc(distinctId)

  // 1. Fetch the conversion event for this visitor
  const convSql = `
    SELECT
      timestamp,
      toFloat64OrZero(toString(properties.conversion_value)) AS conversion_value,
      properties.utm_source,
      properties.utm_medium,
      properties.utm_campaign,
      properties.first_touch_source,
      properties.first_touch_medium,
      properties.first_touch_campaign,
      properties.ai_source,
      properties.page_url,
      properties.user_id,
      properties.anonymous_id,
      properties.ingestion_method
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND event = '$conversion'
      AND distinct_id = '${safeId}'
    ORDER BY timestamp DESC
    LIMIT 1
  `
  const convRows = await queryHogQL(convSql, 'attribution_explain_conversion')
  if (!convRows || convRows.length === 0) {
    return null
  }

  const [convTs, convValue, utmSrc, utmMed, utmCamp, ftSrc, ftMed, ftCamp, aiSrc, pageUrl, userId, anonId, ingestion] = convRows[0]

  const conversion = {
    timestamp: convTs,
    value: Number(convValue) || 0,
    page_url: pageUrl || null,
    user_id: userId || null,
    anonymous_id: anonId || null,
    ingestion_method: ingestion || 'server_routed'
  }

  // 2. Fetch all events (journey) for this visitor
  const journeySql = `
    SELECT
      event,
      timestamp,
      properties.page_url,
      properties.utm_source,
      properties.utm_medium,
      properties.utm_campaign,
      properties.ai_source,
      properties.conversion_value
    FROM events
    WHERE properties.site_id = '${safeSite}'
      AND distinct_id = '${safeId}'
    ORDER BY timestamp ASC
    LIMIT 500
  `
  const journeyRows = await queryHogQL(journeySql, 'attribution_explain_journey')
  const journey = (journeyRows || []).map(([evt, ts, url, src, med, camp, ais, cv]) => ({
    event: evt,
    timestamp: ts,
    page_url: url || null,
    utm_source: src || null,
    utm_medium: med || null,
    utm_campaign: camp || null,
    ai_source: ais || null,
    conversion_value: cv ? Number(cv) : null
  }))

  const touchpoints = journey.filter(j => j.event === '$pageview')
  const directTouches = touchpoints.filter(t => !t.utm_source || t.utm_source === '' || t.utm_source === 'direct')
  const nonDirectTouches = touchpoints.filter(t => t.utm_source && t.utm_source !== '' && t.utm_source !== 'direct')

  // 3. Derive sessions from journey events (computed on read, not materialized)
  const sessions = deriveSessions(journey)
  const annotated = annotateSessions(sessions)

  // 4. Build explanation based on model
  let explanation = {
    model,
    distinct_id: distinctId,
    conversion,
    journey_summary: {
      total_events: journey.length,
      touchpoint_count: touchpoints.length,
      direct_touches: directTouches.length,
      non_direct_touches: nonDirectTouches.length,
      journey_duration_days: touchpoints.length >= 2
        ? Math.max(0, Math.round((new Date(touchpoints[touchpoints.length - 1].timestamp) - new Date(touchpoints[0].timestamp)) / (1000 * 60 * 60 * 24)))
        : 0,
      session_count: sessions.length,
      first_session_at: sessions.length > 0 ? sessions[0].started_at : null,
      last_session_at: sessions.length > 0 ? sessions[sessions.length - 1].ended_at : null,
      converting_session_index: annotated.converting_session_index
    },
    sessions: annotated.sessions,
    attributed_to: null,
    reason: '',
    fallback: false,
    skipped_touches: [],
    all_touches: touchpoints.map(t => ({
      timestamp: t.timestamp,
      page_url: t.page_url,
      source: t.utm_source || 'direct',
      medium: t.utm_medium || 'none',
      campaign: t.utm_campaign || null,
      type: (!t.utm_source || t.utm_source === '' || t.utm_source === 'direct') ? 'direct' : 'non_direct',
      ai_source: t.ai_source || null
    }))
  }

  switch (model) {
    case 'first_touch': {
      const ft = ftSrc || 'direct'
      explanation.attributed_to = { source: ft, medium: ftMed || 'none', campaign: ftCamp || null }
      explanation.reason = ft === 'direct'
        ? 'First touch was direct (no UTM on first visit)'
        : 'First touch source stored in browser cookie at initial visit'
      explanation.fallback = false
      break
    }
    case 'last_touch': {
      const lt = utmSrc || 'direct'
      explanation.attributed_to = { source: lt, medium: utmMed || 'none', campaign: utmCamp || null }
      explanation.reason = lt === 'direct'
        ? 'Last touch was direct (no UTM on conversion page)'
        : 'UTM parameters present on the page at time of conversion'
      explanation.fallback = false
      break
    }
    case 'first_touch_non_direct': {
      if (nonDirectTouches.length > 0) {
        const firstNd = nonDirectTouches[0]
        explanation.attributed_to = {
          source: firstNd.utm_source,
          medium: firstNd.utm_medium || 'none',
          campaign: firstNd.utm_campaign || null
        }
        explanation.reason = 'Earliest non-direct pageview for this visitor'
        explanation.fallback = false
        explanation.skipped_touches = directTouches
          .filter(t => new Date(t.timestamp) < new Date(firstNd.timestamp))
          .map(t => ({
            timestamp: t.timestamp,
            source: t.utm_source || 'direct',
            reason: 'Skipped: direct touch before first non-direct'
          }))
      } else {
        explanation.attributed_to = { source: ftSrc || 'direct', medium: ftMed || 'none', campaign: ftCamp || null }
        explanation.reason = 'No non-direct touchpoints found — fell back to first_touch cookie value'
        explanation.fallback = true
      }
      break
    }
    case 'last_touch_non_direct': {
      if (nonDirectTouches.length > 0) {
        const lastNd = nonDirectTouches[nonDirectTouches.length - 1]
        explanation.attributed_to = {
          source: lastNd.utm_source,
          medium: lastNd.utm_medium || 'none',
          campaign: lastNd.utm_campaign || null
        }
        explanation.reason = 'Latest non-direct pageview for this visitor'
        explanation.fallback = false
        explanation.skipped_touches = directTouches
          .filter(t => new Date(t.timestamp) > new Date(lastNd.timestamp))
          .map(t => ({
            timestamp: t.timestamp,
            source: t.utm_source || 'direct',
            reason: 'Skipped: direct touch after last non-direct'
          }))
      } else {
        explanation.attributed_to = { source: utmSrc || 'direct', medium: utmMed || 'none', campaign: utmCamp || null }
        explanation.reason = 'No non-direct touchpoints found — fell back to conversion page UTM (or direct)'
        explanation.fallback = true
      }
      break
    }
    case 'ai_platforms': {
      explanation.attributed_to = { source: aiSrc || 'unknown', medium: '—', campaign: null }
      explanation.reason = aiSrc
        ? 'AI platform detected from referrer at conversion time'
        : 'No AI source detected — attribution may be incomplete'
      explanation.fallback = !aiSrc
      break
    }
    default:
      explanation.reason = `Unknown model: ${model}`
  }

  return explanation
}

const GROUP_COLUMNS = {
  source: {
    first_touch: "COALESCE(NULLIF(properties.first_touch_source, ''), 'direct')",
    last_touch: "COALESCE(NULLIF(properties.utm_source, ''), 'direct')",
    linear: "COALESCE(NULLIF(properties.utm_source, ''), 'direct')",
    ai_platforms: 'properties.ai_source',
    first_touch_non_direct: "COALESCE(NULLIF(_nd.nd_source, ''), COALESCE(NULLIF(properties.first_touch_source, ''), 'direct'))",
    last_touch_non_direct: "COALESCE(NULLIF(_nd.nd_source, ''), COALESCE(NULLIF(properties.utm_source, ''), 'direct'))"
  },
  medium: {
    first_touch: "COALESCE(NULLIF(properties.first_touch_medium, ''), 'none')",
    last_touch: "COALESCE(NULLIF(properties.utm_medium, ''), 'none')",
    linear: "COALESCE(NULLIF(properties.utm_medium, ''), 'none')",
    ai_platforms: "'—'",
    first_touch_non_direct: "COALESCE(NULLIF(_nd.nd_medium, ''), COALESCE(NULLIF(properties.first_touch_medium, ''), 'none'))",
    last_touch_non_direct: "COALESCE(NULLIF(_nd.nd_medium, ''), COALESCE(NULLIF(properties.utm_medium, ''), 'none'))"
  },
  campaign: {
    first_touch: 'properties.first_touch_campaign',
    last_touch: 'properties.utm_campaign',
    linear: 'properties.utm_campaign',
    ai_platforms: "'—'",
    first_touch_non_direct: 'COALESCE(_nd.nd_campaign, properties.first_touch_campaign)',
    last_touch_non_direct: 'COALESCE(_nd.nd_campaign, properties.utm_campaign)'
  },
  ai_source: {
    first_touch: "COALESCE(NULLIF(properties.ai_source, ''), 'none')",
    last_touch: "COALESCE(NULLIF(properties.ai_source, ''), 'none')",
    linear: "COALESCE(NULLIF(properties.ai_source, ''), 'none')",
    ai_platforms: 'properties.ai_source',
    first_touch_non_direct: "COALESCE(NULLIF(properties.ai_source, ''), 'none')",
    last_touch_non_direct: "COALESCE(NULLIF(properties.ai_source, ''), 'none')"
  },
  landing_page: {
    first_touch: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    last_touch: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    linear: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    ai_platforms: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    first_touch_non_direct: "COALESCE(NULLIF(properties.page_url, ''), '/')",
    last_touch_non_direct: "COALESCE(NULLIF(properties.page_url, ''), '/')"
  },
  country: {
    first_touch: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    last_touch: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    linear: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    ai_platforms: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    first_touch_non_direct: "COALESCE(NULLIF(properties.country, ''), 'unknown')",
    last_touch_non_direct: "COALESCE(NULLIF(properties.country, ''), 'unknown')"
  },
  device: {
    first_touch: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    last_touch: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    linear: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    ai_platforms: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    first_touch_non_direct: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')",
    last_touch_non_direct: "COALESCE(NULLIF(properties.device_type, ''), 'unknown')"
  },
  date: {
    // These entries are dead code — date dimExpr is now always generated
    // via formatDateTime(refTs, ...) to support attributeBy.
    // Kept for documentation of the expected format per model.
    first_touch: null,
    last_touch: null,
    linear: null,
    ai_platforms: null,
    first_touch_non_direct: null,
    last_touch_non_direct: null
  }
}

// Confirmed with PostHog/ClickHouse formatDateTime:
// day (%Y-%m-%d) ✓, week (%Y-W%V) ✓, month (%Y-%m) ✓, year (%Y) ✓
// quarter uses concat(toYear,toQuarter) since %Q is not a valid ClickHouse specifier.
// The quarter entry below is dead code kept for documentation — the actual quarter path
// uses the concat() expression in dimExpr/dim2Expr directly.
const GRANULARITY_MAP = {
  day: "'%Y-%m-%d'",
  week: "'%Y-W%V'",
  month: "'%Y-%m'",
  quarter: "'%Y-Q'",
  year: "'%Y'"
}

// attributeBy: determines which timestamp is used for date-based grouping.
// - 'conversion_date': uses the conversion event's own timestamp (default, current behavior)
// - 'first_seen_date': uses the visitor's first event timestamp (MIN(timestamp) per distinct_id)
// - 'original_source_date': uses the first event timestamp where UTM source was present
// Non-date dimensions (source, campaign, etc.) are unaffected by attributeBy.
export async function getFlexibleReport(siteKey, model, dateFrom, dateTo, groupBy, metric, filters = {}, groupBy2 = null, granularity = 'day', attributionWindow = null, attributeBy = 'conversion_date') {
  const filterKey = JSON.stringify(filters) + groupBy2 + granularity + attributionWindow + attributeBy
  const key = cacheKey(`${model}:${groupBy}:${metric}:${filterKey}`, siteKey, dateFrom, dateTo)
  const cached = cache.get(key)
  if (cached) return cached

  const fromDate = toHogDate(dateFrom)
  const toDate = toHogDate(dateTo)
  const safeSite = esc(siteKey)

  // Determine reference timestamp and optional JOIN for non-conversion_date attribution
  let refTs = 'timestamp'
  let refJoin = ''
  const needsAltDate = (groupBy === 'date' || groupBy2 === 'date') &&
    (attributeBy === 'first_seen_date' || attributeBy === 'original_source_date')

  if (needsAltDate) {
    if (attributeBy === 'first_seen_date') {
      refJoin = `
    INNER JOIN (
      SELECT distinct_id, MIN(timestamp) AS ref_ts
      FROM events
      WHERE properties.site_id = '${safeSite}'
      GROUP BY distinct_id
    ) _ref ON events.distinct_id = _ref.distinct_id`
      refTs = '_ref.ref_ts'
    } else if (attributeBy === 'original_source_date') {
      // Original source date: first timestamp where UTM source was present.
      // Visitors with no UTM source in any event are excluded from results
      // (truthful exclusion — cannot attribute to an original source that doesn't exist).
      refJoin = `
    INNER JOIN (
      SELECT distinct_id, MIN(timestamp) AS ref_ts
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND properties.utm_source IS NOT NULL
        AND properties.utm_source != ''
      GROUP BY distinct_id
    ) _ref ON events.distinct_id = _ref.distinct_id`
      refTs = '_ref.ref_ts'
    }
  }

  // Non-direct attribution models: LEFT JOIN that finds the first/last qualifying non-direct
  // pageview for each distinct_id. When no qualifying touchpoint exists, _nd.* columns are
  // NULL and the COALESCE in GROUP_COLUMNS falls back to the conversion event's own
  // first_touch/last_touch properties. This preserves model-parity totals.
  let qualifyingJoin = ''
  if (model === 'first_touch_non_direct' || model === 'last_touch_non_direct') {
    const ndAggFn = model === 'first_touch_non_direct' ? 'argMin' : 'argMax'
    qualifyingJoin = `
    LEFT JOIN (
      SELECT distinct_id,
        ${ndAggFn}(properties.utm_source, timestamp) AS nd_source,
        ${ndAggFn}(properties.utm_medium, timestamp) AS nd_medium,
        ${ndAggFn}(properties.utm_campaign, timestamp) AS nd_campaign
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$pageview'
        AND properties.utm_source IS NOT NULL
        AND properties.utm_source != ''
        AND properties.utm_source != 'direct'
      GROUP BY distinct_id
    ) _nd ON events.distinct_id = _nd.distinct_id`
  }

  const dimExpr = groupBy === 'date'
    ? granularity === 'quarter'
      ? `concat(toString(toYear(${refTs})), '-Q', toString(toQuarter(${refTs})))`
      : `formatDateTime(${refTs}, ${GRANULARITY_MAP[granularity] || GRANULARITY_MAP.day})`
    : GROUP_COLUMNS[groupBy]?.[model]

  if (!dimExpr) {
    throw new Error(`Unsupported group_by: ${groupBy} for model: ${model}`)
  }

  let dim2Expr = null
  if (groupBy2) {
    dim2Expr = groupBy2 === 'date'
      ? granularity === 'quarter'
        ? `concat(toString(toYear(${refTs})), '-Q', toString(toQuarter(${refTs})))`
        : `formatDateTime(${refTs}, ${GRANULARITY_MAP[granularity] || GRANULARITY_MAP.day})`
      : GROUP_COLUMNS[groupBy2]?.[model]
    if (!dim2Expr) {
      throw new Error(`Unsupported group_by2: ${groupBy2} for model: ${model}`)
    }
  }

  let metricCol, metricLabel, eventFilter, extraSelect, isLTVRevenue = false

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
    case 'ltv_revenue':
      isLTVRevenue = true
      metricLabel = 'ltv_revenue'
      break
    case 'session_count':
    case 'avg_session_duration':
    case 'pages_per_session':
    case 'conversion_sessions':
      // Session metrics are derived on read from pageview events.
      // They bypass the standard attribution SQL path and use getSessionReport.
      return getSessionReport(siteKey, dateFrom, dateTo, groupBy, metric, filters, groupBy2)
    default:
      throw new Error(`Unknown metric: ${metric}`)
  }

  // Attribution window: expands the lower date bound backward by N days.
  // For fixed windows (1/7/14/30/60/90), this includes conversions from (date_from - N days).
  // 'ltv' is currently a no-op for non-LTV metrics; LTV computes per-user aggregation independently.
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

  // LTV v1: per-distinct_id revenue aggregation with single-touch attribution.
  // Supports all single-touch models: first_touch, last_touch, first_touch_non_direct,
  // last_touch_non_direct. Non-direct models LEFT JOIN qualifying pageviews to find
  // the attributed source per distinct_id, then sum all conversions for that customer.
  // UUID exclusion: anonymous-only visitors whose distinct_id matches the UUIDv4 format
  // (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) are excluded. These visitors never completed
  // identification via $identify / ph.alias() and cannot be reliably stitched across
  // sessions or devices. This is the same heuristic used in LeadDetail.jsx.
  if (isLTVRevenue) {
    const isNonDirect = model === 'first_touch_non_direct' || model === 'last_touch_non_direct'
    const ndAggFn = model === 'first_touch_non_direct' ? 'argMin' : 'argMax'

    function ltvPersonDimExpr(gb, md) {
      if (gb === 'date') {
        return granularity === 'quarter'
          ? `concat(toString(toYear(MAX(timestamp))), '-Q', toString(toQuarter(MAX(timestamp))))`
          : `formatDateTime(MAX(timestamp), ${GRANULARITY_MAP[granularity] || GRANULARITY_MAP.day})`
      }

      if (md === 'first_touch') {
        switch (gb) {
          case 'source': return "any(COALESCE(NULLIF(properties.first_touch_source, ''), 'direct'))"
          case 'medium': return "any(COALESCE(NULLIF(properties.first_touch_medium, ''), 'none'))"
          case 'campaign': return 'any(properties.first_touch_campaign)'
          case 'ai_source': return "any(COALESCE(NULLIF(properties.ai_source, ''), 'none'))"
          case 'landing_page': return "argMin(COALESCE(NULLIF(properties.page_url, ''), '/'), timestamp)"
          case 'country': return "any(COALESCE(NULLIF(properties.country, ''), 'unknown'))"
          case 'device': return "any(COALESCE(NULLIF(properties.device_type, ''), 'unknown'))"
          default: throw new Error(`Unsupported group_by for LTV first_touch: ${gb}`)
        }
      }

      if (md === 'first_touch_non_direct') {
        switch (gb) {
          case 'source': return "COALESCE(NULLIF(_nd.nd_source, ''), COALESCE(NULLIF(any(properties.first_touch_source), ''), 'direct'))"
          case 'medium': return "COALESCE(NULLIF(_nd.nd_medium, ''), COALESCE(NULLIF(any(properties.first_touch_medium), ''), 'none'))"
          case 'campaign': return "COALESCE(NULLIF(_nd.nd_campaign, ''), any(properties.first_touch_campaign))"
          case 'ai_source': return "any(COALESCE(NULLIF(properties.ai_source, ''), 'none'))"
          case 'landing_page': return "argMin(COALESCE(NULLIF(properties.page_url, ''), '/'), timestamp)"
          case 'country': return "any(COALESCE(NULLIF(properties.country, ''), 'unknown'))"
          case 'device': return "any(COALESCE(NULLIF(properties.device_type, ''), 'unknown'))"
          default: throw new Error(`Unsupported group_by for LTV first_touch_non_direct: ${gb}`)
        }
      }

      if (md === 'last_touch_non_direct') {
        switch (gb) {
          case 'source': return "COALESCE(NULLIF(_nd.nd_source, ''), COALESCE(NULLIF(argMax(properties.utm_source, timestamp), ''), 'direct'))"
          case 'medium': return "COALESCE(NULLIF(_nd.nd_medium, ''), COALESCE(NULLIF(argMax(properties.utm_medium, timestamp), ''), 'none'))"
          case 'campaign': return "COALESCE(NULLIF(_nd.nd_campaign, ''), argMax(properties.utm_campaign, timestamp))"
          case 'ai_source': return "argMax(COALESCE(NULLIF(properties.ai_source, ''), 'none'), timestamp)"
          case 'landing_page': return "argMax(COALESCE(NULLIF(properties.page_url, ''), '/'), timestamp)"
          case 'country': return "argMax(COALESCE(NULLIF(properties.country, ''), 'unknown'), timestamp)"
          case 'device': return "argMax(COALESCE(NULLIF(properties.device_type, ''), 'unknown'), timestamp)"
          default: throw new Error(`Unsupported group_by for LTV last_touch_non_direct: ${gb}`)
        }
      }

      // last_touch — inner subquery only scans conversion events, so argMax(timestamp)
      // correctly returns the most recent conversion's property value.
      switch (gb) {
        case 'source': return "argMax(COALESCE(NULLIF(properties.utm_source, ''), 'direct'), timestamp)"
        case 'medium': return "argMax(COALESCE(NULLIF(properties.utm_medium, ''), 'none'), timestamp)"
        case 'campaign': return 'argMax(properties.utm_campaign, timestamp)'
        case 'ai_source': return "argMax(COALESCE(NULLIF(properties.ai_source, ''), 'none'), timestamp)"
        case 'landing_page': return "argMax(COALESCE(NULLIF(properties.page_url, ''), '/'), timestamp)"
        case 'country': return "argMax(COALESCE(NULLIF(properties.country, ''), 'unknown'), timestamp)"
        case 'device': return "argMax(COALESCE(NULLIF(properties.device_type, ''), 'unknown'), timestamp)"
        default: throw new Error(`Unsupported group_by for LTV last_touch: ${gb}`)
      }
    }

    const ltvDimExpr = ltvPersonDimExpr(groupBy, model)
    const ltvDim2Expr = groupBy2 ? ltvPersonDimExpr(groupBy2, model) : null

    // UUID exclusion rule: distinct_ids that match the UUIDv4 pattern
    // (8-4-4-4-12 hex chars) are anonymous-only visitors who never completed
    // identification via $identify. They are excluded from LTV because they
    // cannot be reliably stitched across sessions or devices.
    const uuidExclusion = "AND NOT match(distinct_id, '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')"

    // Non-direct LTV: LEFT JOIN qualifying pageviews to attribute each distinct_id.
    // The main table remains unaliased so properties./timestamp. resolve correctly
    // and existing filterClauses work without modification.
    let ltvJoin = ''
    if (isNonDirect) {
      ltvJoin = `
    LEFT JOIN (
      SELECT distinct_id,
        ${ndAggFn}(properties.utm_source, timestamp) AS nd_source,
        ${ndAggFn}(properties.utm_medium, timestamp) AS nd_medium,
        ${ndAggFn}(properties.utm_campaign, timestamp) AS nd_campaign
      FROM events
      WHERE properties.site_id = '${safeSite}'
        AND event = '$pageview'
        AND properties.utm_source IS NOT NULL
        AND properties.utm_source != ''
        AND properties.utm_source != 'direct'
      GROUP BY distinct_id
    ) _nd ON events.distinct_id = _nd.distinct_id`
    }

    const ltvSql = `
    SELECT
      ltv_dim AS dim_value${ltvDim2Expr ? `,\n      ltv_dim2 AS dim_value2` : ''},
      SUM(total_revenue) AS metric_value
    FROM (
      SELECT
        events.distinct_id,
        ${ltvDimExpr} AS ltv_dim${ltvDim2Expr ? `,\n        ${ltvDim2Expr} AS ltv_dim2` : ''},
        SUM(toFloat64OrZero(toString(properties.conversion_value))) AS total_revenue
      FROM events${ltvJoin}
      WHERE properties.site_id = '${safeSite}'
        AND event = '$conversion'
        AND timestamp >= toDateTime('${fromDate}')${windowClause}
        AND timestamp <= toDateTime('${toDate}')
        ${uuidExclusion}${filterClauses}
      GROUP BY events.distinct_id
      HAVING total_revenue > 0
    )
    GROUP BY ltv_dim${ltvDim2Expr ? ', ltv_dim2' : ''}
    ${havingClause}
    ORDER BY metric_value DESC
    LIMIT 50000
  `

    const ltvRows = await queryHogQL(ltvSql, 'flexible_report_ltv')
    const ltvResults = ltvRows.map(([dimValue, dimValue2, metricValue]) => ({
      dim_value: dimValue || 'unknown',
      ...(ltvDim2Expr ? { dim_value2: dimValue2 || 'unknown' } : {}),
      ltv_revenue: Number(metricValue) || 0
    }))

    cache.set(key, ltvResults)
    return ltvResults
  }

  const sql = `
    SELECT
      ${dimExpr} AS dim_value${dim2Expr ? `,\n      ${dim2Expr} AS dim_value2` : ''},
      ${metricCol} AS metric_value
      ${extraSelect}
    FROM events${refJoin}${qualifyingJoin}
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
        FROM events${refJoin}
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
      FROM events${refJoin}
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
