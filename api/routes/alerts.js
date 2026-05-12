import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { queryHogQL } from '../lib/posthog.js'

const router = Router()

function esc(str) {
  return str.replace(/'/g, "''")
}

router.get('/', validateSiteKey, async (req, res) => {
  try {
    const siteId = esc(req.site.id)
    const alerts = []

    // 1. Traffic drop week-over-week
    const trafficSql = `
      SELECT
        SUM(CASE WHEN timestamp >= now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS this_week,
        SUM(CASE WHEN timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS last_week
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND event = '$pageview'
        AND timestamp >= now() - INTERVAL 14 DAY
    `
    const trafficRows = await queryHogQL(trafficSql, 'alert_traffic')
    const thisWeek = Number(trafficRows?.[0]?.[0]) || 0
    const lastWeek = Number(trafficRows?.[0]?.[1]) || 0
    if (lastWeek > 0 && thisWeek < lastWeek * 0.5) {
      alerts.push({
        id: 'traffic_drop',
        severity: 'high',
        metric: 'Traffic',
        message: `Traffic dropped ${Math.round((1 - thisWeek / lastWeek) * 100)}% this week vs last`,
        comparison: `${thisWeek} vs ${lastWeek} pageviews`,
        suggested_action: 'Check Install page and Event Debugger for tracker issues.'
      })
    }

    // 2. Conversion drop day-over-day
    const convSql = `
      SELECT
        SUM(CASE WHEN timestamp >= now() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS today,
        SUM(CASE WHEN timestamp >= now() - INTERVAL 2 DAY AND timestamp < now() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS yesterday
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND event = '$conversion'
        AND timestamp >= now() - INTERVAL 2 DAY
    `
    const convRows = await queryHogQL(convSql, 'alert_conversions')
    const today = Number(convRows?.[0]?.[0]) || 0
    const yesterday = Number(convRows?.[0]?.[1]) || 0
    if (yesterday > 0 && today < yesterday * 0.3) {
      alerts.push({
        id: 'conversion_drop',
        severity: 'high',
        metric: 'Conversions',
        message: `Conversions dropped ${Math.round((1 - today / yesterday) * 100)}% today vs yesterday`,
        comparison: `${today} vs ${yesterday} conversions`,
        suggested_action: 'Verify conversion tracking in Event Debugger and check funnel pages.'
      })
    }

    // 3. AI source traffic below threshold
    const aiSql = `
      SELECT properties.ai_source, count() AS cnt
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND event = '$pageview'
        AND properties.ai_source IS NOT NULL
        AND properties.ai_source != ''
        AND timestamp >= now() - INTERVAL 7 DAY
      GROUP BY properties.ai_source
      ORDER BY cnt DESC
      LIMIT 10
    `
    const aiRows = await queryHogQL(aiSql, 'alert_ai')
    const aiTotal = aiRows.reduce((s, [, c]) => s + Number(c), 0)
    const threshold = 5
    if (aiTotal > threshold && aiTotal < threshold * 2) {
      alerts.push({
        id: 'ai_traffic_low',
        severity: 'medium',
        metric: 'AI Traffic',
        message: `AI source traffic at ${aiTotal} events this week (below healthy threshold)`,
        comparison: `Threshold: ${threshold * 2} events/week`,
        suggested_action: 'Check if AI platform referrers changed or content was updated.'
      })
    }

    // 4. Install silent / no recent events
    const recentSql = `
      SELECT count() AS cnt, MAX(timestamp) AS last_ts
      FROM events
      WHERE properties.site_id = '${siteId}'
        AND timestamp >= now() - INTERVAL 24 HOUR
    `
    const recentRows = await queryHogQL(recentSql, 'alert_recent')
    const recentCount = Number(recentRows?.[0]?.[0]) || 0
    if (recentCount === 0) {
      alerts.push({
        id: 'install_silent',
        severity: 'medium',
        metric: 'Install Health',
        message: 'No events received in the last 24 hours',
        comparison: '0 events in 24h',
        suggested_action: 'Verify the tracking snippet is still on your live site and the domain matches.'
      })
    }

    return res.status(200).json({
      success: true,
      data: { alerts, count: alerts.length },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Alert check failed' })
  }
})

export { router as alertsRouter }
