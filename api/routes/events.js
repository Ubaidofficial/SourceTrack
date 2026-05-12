import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { queryHogQL } from '../lib/posthog.js'

const router = Router()

function esc(value = '') {
  return String(value).replace(/'/g, "''")
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))
}

function clampLimit(value) {
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n)) return 100
  return Math.max(1, Math.min(n, 500))
}

router.get('/latest', validateSiteKey, async (req, res) => {
  try {
    const siteId = esc(req.site.id)
    const {
      event_type,
      source,
      date_from,
      date_to,
      search,
      limit
    } = req.query

    const where = [`properties.site_id = '${siteId}'`]

    if (event_type && event_type !== 'all') {
      where.push(`event = '${esc(event_type)}'`)
    }

    if (source) {
      const safeSource = esc(String(source).trim().toLowerCase())
      where.push(`(
        lower(COALESCE(toString(properties.utm_source), '')) = '${safeSource}'
        OR lower(COALESCE(toString(properties.first_touch_source), '')) = '${safeSource}'
        OR lower(COALESCE(toString(properties.ai_source), '')) = '${safeSource}'
      )`)
    }

    if (isValidDate(date_from)) {
      where.push(`timestamp >= toDateTime('${esc(date_from)} 00:00:00')`)
    }

    if (isValidDate(date_to)) {
      where.push(`timestamp <= toDateTime('${esc(date_to)} 23:59:59')`)
    }

    if (search) {
      const safeSearch = esc(String(search).trim().toLowerCase())
      where.push(`(
        lower(toString(event)) LIKE '%${safeSearch}%'
        OR lower(toString(distinct_id)) LIKE '%${safeSearch}%'
        OR lower(COALESCE(toString(properties.page_url), '')) LIKE '%${safeSearch}%'
        OR lower(COALESCE(toString(properties.referrer), '')) LIKE '%${safeSearch}%'
        OR lower(COALESCE(toString(properties.utm_source), '')) LIKE '%${safeSearch}%'
        OR lower(COALESCE(toString(properties.utm_medium), '')) LIKE '%${safeSearch}%'
        OR lower(COALESCE(toString(properties.utm_campaign), '')) LIKE '%${safeSearch}%'
        OR lower(COALESCE(toString(properties.ai_source), '')) LIKE '%${safeSearch}%'
        OR lower(COALESCE(toString(properties.conversion_type), '')) LIKE '%${safeSearch}%'
        OR lower(COALESCE(toString(properties.ingestion_method), '')) LIKE '%${safeSearch}%'
      )`)
    }

    const sql = `
      SELECT
        event,
        timestamp,
        distinct_id,
        properties.page_url AS page_url,
        properties.referrer AS referrer,
        properties.ai_source AS ai_source,
        properties.is_conversion AS is_conversion,
        properties.device_type AS device_type,
        properties.country AS country,
        properties.utm_source AS utm_source,
        properties.utm_medium AS utm_medium,
        properties.utm_campaign AS utm_campaign,
        properties.first_touch_source AS first_touch_source,
        properties.first_touch_medium AS first_touch_medium,
        properties.first_touch_campaign AS first_touch_campaign,
        properties.conversion_type AS conversion_type,
        properties.conversion_value AS conversion_value,
        properties.ingestion_method AS ingestion_method,
        properties AS raw_properties
      FROM events
      WHERE ${where.join('\n        AND ')}
      ORDER BY timestamp DESC
      LIMIT ${clampLimit(limit)}
    `

    const rows = await queryHogQL(sql, 'events_latest')

    const events = rows.map(([
      event, timestamp, distinctId, pageUrl, referrer,
      aiSource, isConversion, deviceType, country,
      utmSource, utmMedium, utmCampaign,
      firstTouchSource, firstTouchMedium, firstTouchCampaign,
      conversionType, conversionValue, ingestionMethod, rawProperties
    ]) => ({
      event,
      timestamp,
      distinct_id: distinctId || null,
      page_url: pageUrl || null,
      referrer: referrer || null,
      ai_source: aiSource || null,
      is_conversion: event === '$conversion' || isConversion === true || isConversion === 'true' || isConversion === 1,
      device_type: deviceType || null,
      country: country || null,
      source: utmSource || firstTouchSource || null,
      medium: utmMedium || firstTouchMedium || null,
      campaign: utmCampaign || firstTouchCampaign || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      first_touch_source: firstTouchSource || null,
      first_touch_medium: firstTouchMedium || null,
      first_touch_campaign: firstTouchCampaign || null,
      conversion_type: conversionType || null,
      conversion_value: conversionValue ? Number(conversionValue) || 0 : null,
      ingestion_method: ingestionMethod || null,
      properties: rawProperties || {}
    }))

    return res.status(200).json({
      success: true,
      data: { events, count: events.length },
      error: null
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, data: null, error: 'Failed to fetch events' })
  }
})

router.get('/health', validateSiteKey, async (req, res) => {
  try {
    const siteId = esc(req.site.id)

    const lastEventSql = `
      SELECT timestamp
      FROM events
      WHERE properties.site_id = '${siteId}'
      ORDER BY timestamp DESC
      LIMIT 1
    `

    const countHourSql = `
      SELECT count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND timestamp >= now() - INTERVAL 1 HOUR
    `

    const countDaySql = `
      SELECT count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND timestamp >= now() - INTERVAL 24 HOUR
    `

    const lastRows = await queryHogQL(lastEventSql, 'events_health_last')
    const hourRows = await queryHogQL(countHourSql, 'events_health_hour')
    const dayRows = await queryHogQL(countDaySql, 'events_health_day')

    const lastEvent = lastRows?.[0]?.[0] || null
    const countHour = Number(hourRows?.[0]?.[0]) || 0
    const countDay = Number(dayRows?.[0]?.[0]) || 0

    let isActive = false
    if (lastEvent) {
      const lastTime = new Date(lastEvent).getTime()
      const hourAgo = Date.now() - 60 * 60 * 1000
      isActive = lastTime > hourAgo && countHour > 0
    }

    let status = 'never_seen'
    if (lastEvent) {
      const lastTime = new Date(lastEvent).getTime()
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000
      status = lastTime > dayAgo ? (isActive ? 'healthy' : 'silent_24h') : 'silent_24h'
    }

    return res.status(200).json({
      success: true,
      data: {
        status,
        is_active: isActive,
        last_event: lastEvent,
        count_hour: countHour,
        count_day: countDay
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, data: null, error: 'Health check failed' })
  }
})

router.get('/edge-cases', validateSiteKey, async (req, res) => {
  try {
    const siteId = esc(req.site.id)

    const multiDomainSql = `
      SELECT properties.page_url AS page_url, count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND properties.page_url IS NOT NULL
        AND properties.page_url != ''
      GROUP BY page_url
      HAVING cnt > 0
      LIMIT 100
    `

    const aiNoUtmSql = `
      SELECT count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND properties.ai_source IS NOT NULL
        AND properties.ai_source != ''
        AND (properties.utm_source IS NULL OR properties.utm_source = '')
      LIMIT 1
    `

    const utmNoAiSql = `
      SELECT count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND properties.utm_source IS NOT NULL
        AND properties.utm_source != ''
        AND (properties.ai_source IS NULL OR properties.ai_source = '')
      LIMIT 1
    `

    const domainRows = await queryHogQL(multiDomainSql, 'edge_domains')
    const aiNoUtmRows = await queryHogQL(aiNoUtmSql, 'edge_ai_no_utm')
    const utmNoAiRows = await queryHogQL(utmNoAiSql, 'edge_utm_no_ai')

    const domains = new Set()
    for (const row of domainRows) {
      try {
        const u = new URL(row[0])
        domains.add(u.hostname)
      } catch (_e) {
        /* ignore bad urls */
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        domain_count: domains.size,
        domains: [...domains].slice(0, 20),
        multiple_domains: domains.size > 1,
        ai_without_utm: Number(aiNoUtmRows?.[0]?.[0]) || 0,
        utm_without_ai: Number(utmNoAiRows?.[0]?.[0]) || 0
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ success: false, data: null, error: 'Edge case check failed' })
  }
})

export { router as eventsRouter }
