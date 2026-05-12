import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { queryHogQL } from '../lib/posthog.js'

const router = Router()

function esc(str) {
  return str.replace(/'/g, "''")
}

router.get('/latest', validateSiteKey, async (req, res) => {
  try {
    const sql = `
      SELECT
        event,
        timestamp,
        properties.page_url AS page_url,
        properties.referrer AS referrer,
        properties.ai_source AS ai_source,
        properties.is_conversion AS is_conversion,
        properties.device_type AS device_type,
        properties.country AS country,
        properties.utm_source AS utm_source,
        properties.utm_medium AS utm_medium,
        properties.utm_campaign AS utm_campaign,
        properties.conversion_value AS conversion_value
      FROM events
      WHERE properties.site_id = '${esc(req.site.id)}'
      ORDER BY timestamp DESC
      LIMIT 50
    `

    const rows = await queryHogQL(sql, 'events_latest')

    const events = rows.map(([
      event, timestamp, pageUrl, referrer,
      aiSource, isConversion, deviceType, country,
      utmSource, utmMedium, utmCampaign, conversionValue
    ]) => ({
      event,
      timestamp,
      page_url: pageUrl || null,
      referrer: referrer || null,
      ai_source: aiSource || null,
      is_conversion: isConversion === true || isConversion === 'true' || isConversion === 1,
      device_type: deviceType || null,
      country: country || null,
      utm_source: utmSource || null,
      utm_medium: utmMedium || null,
      utm_campaign: utmCampaign || null,
      conversion_value: conversionValue ? Number(conversionValue) || 0 : null
    }))

    return res.status(200).json({
      success: true,
      data: { events, count: events.length },
      error: null
    })
  } catch (_err) {
    console.error(_err)
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
      if (lastTime > dayAgo) {
        status = isActive ? 'healthy' : 'silent_24h'
      } else {
        status = 'silent_24h'
      }
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
  } catch (_err) {
    console.error(_err)
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
      } catch (_e) { /* ignore */ }
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
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Edge case check failed' })
  }
})

export { router as eventsRouter }
