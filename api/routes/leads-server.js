import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { queryHogQL } from '../lib/posthog.js'

const router = Router()

function esc(str) {
  return str.replace(/'/g, "''")
}

function toHogDate(iso) {
  return iso.replace('T', ' ').replace(/\.\d+Z?$/, '').replace('Z', '')
}

router.get('/', validateSiteKey, async (req, res) => {
  try {
    const siteKey = req.query.site_key || req.body?.site_key
    const siteId = String(req.site.id)
    const search = (req.query.search || '').toLowerCase()
    const filterAI = req.query.ai || 'all'
    const dateFrom = req.query.date_from
    const dateTo = req.query.date_to
    const limit = Math.min(parseInt(req.query.limit) || 50, 200)

    let dateFilter = ''
    if (dateFrom && dateTo) {
      dateFilter = `AND timestamp >= toDateTime('${toHogDate(dateFrom)}') AND timestamp <= toDateTime('${toHogDate(dateTo)}')`
    }

    const sql = `
      SELECT
        distinct_id,
        MIN(timestamp) AS first_seen,
        MAX(timestamp) AS last_seen,
        countIf(event = '$pageview') AS pageviews,
        countIf(event = '$conversion') AS conversions,
        SUM(CASE WHEN event = '$conversion' THEN toFloatOrZero(toString(properties.conversion_value)) ELSE 0 END) AS total_revenue,
        argMin(COALESCE(NULLIF(properties.utm_source, ''), NULLIF(properties.first_touch_source, ''), 'direct'), timestamp) AS source,
        argMin(COALESCE(NULLIF(properties.utm_medium, ''), NULLIF(properties.first_touch_medium, ''), 'none'), timestamp) AS medium,
        argMin(properties.first_touch_campaign, timestamp) AS campaign,
        argMin(COALESCE(NULLIF(properties.ai_source, ''), ''), timestamp) AS ai_source,
        argMin(properties.country, timestamp) AS country,
        argMin(properties.page_url, timestamp) AS first_page_url
      FROM events
      WHERE properties.site_id = '${esc(siteId)}'
        ${dateFilter}
      GROUP BY distinct_id
      HAVING conversions > 0 OR pageviews > 0
      ORDER BY last_seen DESC
      LIMIT ${limit}
    `

    const rows = await queryHogQL(sql, 'leads_list')

    let leads = rows.map(([
      distinctId, firstSeen, lastSeen, pageviews, conversions, totalRevenue,
      source, medium, campaign, aiSource, country, firstPageUrl
    ]) => ({
      id: distinctId,
      first_seen: firstSeen,
      last_seen: lastSeen,
      pageviews: Number(pageviews) || 0,
      conversions: Number(conversions) || 0,
      revenue: Number(totalRevenue) || 0,
      source: source || 'direct',
      medium: medium || 'none',
      campaign: campaign || null,
      ai_source: aiSource || null,
      country: country || null,
      first_page_url: firstPageUrl || null
    }))

    if (search) {
      leads = leads.filter(l =>
        (l.id && l.id.toLowerCase().includes(search)) ||
        (l.source && l.source.toLowerCase().includes(search)) ||
        (l.campaign && l.campaign.toLowerCase().includes(search))
      )
    }

    if (filterAI === 'ai') {
      leads = leads.filter(l => l.ai_source)
    } else if (filterAI === 'non-ai') {
      leads = leads.filter(l => !l.ai_source)
    }

    const totalRevenue = leads.reduce((s, l) => s + l.revenue, 0)
    const totalConversions = leads.reduce((s, l) => s + l.conversions, 0)

    return res.status(200).json({
      success: true,
      data: {
        leads,
        total: leads.length,
        total_revenue: totalRevenue,
        total_conversions: totalConversions
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Leads query failed' })
  }
})

router.get('/:leadId', validateSiteKey, async (req, res) => {
  try {
    const { leadId } = req.params
    const siteKey = req.query.site_key || req.body?.site_key

    if (!leadId) {
      return res.status(400).json({ success: false, data: null, error: 'leadId is required' })
    }

    const sql = `
      SELECT
        MIN(timestamp) AS first_seen,
        MAX(timestamp) AS last_seen,
        countIf(event = '$pageview') AS pageviews,
        countIf(event = '$conversion') AS conversions,
        SUM(CASE WHEN event = '$conversion' THEN toFloatOrZero(toString(properties.conversion_value)) ELSE 0 END) AS total_revenue,
        argMin(COALESCE(NULLIF(properties.utm_source, ''), NULLIF(properties.first_touch_source, ''), 'direct'), timestamp) AS source,
        argMin(COALESCE(NULLIF(properties.utm_medium, ''), NULLIF(properties.first_touch_medium, ''), 'none'), timestamp) AS medium,
        argMin(COALESCE(NULLIF(properties.ai_source, ''), ''), timestamp) AS ai_source,
        argMin(properties.country, timestamp) AS country,
        argMin(properties.page_url, timestamp) AS first_page_url,
        argMin(properties.first_touch_campaign, timestamp) AS campaign,
        argMin(properties.first_touch_source, timestamp) AS first_touch_source,
        argMin(properties.first_touch_medium, timestamp) AS first_touch_medium,
        COUNT(DISTINCT date(timestamp)) AS active_days
      FROM events
      WHERE properties.site_id = '${esc(req.site.id)}'
        AND distinct_id = '${esc(leadId)}'
      GROUP BY distinct_id
      LIMIT 1
    `

    const rows = await queryHogQL(sql, 'lead_detail')

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, data: null, error: 'Lead not found' })
    }

    const [firstSeen, lastSeen, pageviews, conversions, totalRevenue, source, medium, aiSource, country, firstPageUrl, campaign, firstTouchSource, firstTouchMedium, activeDays] = rows[0]

    return res.status(200).json({
      success: true,
      data: {
        id: leadId,
        first_seen: firstSeen,
        last_seen: lastSeen,
        pageviews: Number(pageviews) || 0,
        conversions: Number(conversions) || 0,
        revenue: Number(totalRevenue) || 0,
        source: source || 'direct',
        medium: medium || 'none',
        campaign: campaign || null,
        ai_source: aiSource || null,
        country: country || null,
        first_page_url: firstPageUrl || null,
        first_touch_source: firstTouchSource || null,
        first_touch_medium: firstTouchMedium || null,
        active_days: Number(activeDays) || 0
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Lead detail failed' })
  }
})

export { router as leadsRouter }
