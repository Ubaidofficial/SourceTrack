import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { getFlexibleReport, getAttribution } from '../lib/attribution-engine.js'
import { queryHogQL } from '../lib/posthog.js'

const router = Router()

function esc(str) {
  return str.replace(/'/g, "''")
}

router.get('/overview', validateSiteKey, async (req, res) => {
  try {
    const siteKey = req.query.site_key || req.body?.site_key
    const siteId = String(req.site.id)
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90)
    const dateTo = new Date().toISOString().slice(0, 10)
    const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const prevDateFrom = new Date(Date.now() - days * 2 * 86400000).toISOString().slice(0, 10)
    const prevDateTo = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

    const [
      revenueResults,
      sourceConvResults,
      sessionsResults,
      leadsResults,
      prevRevenueResults,
      prevLeadsResults,
      aiRevResults,
      aiConvResults,
      aiShareResults,
      aiTrendResults,
      landingResults,
      campaignResults,
      timeResults,
      modelFirstTouch,
      modelLastTouch,
      modelLinear,
      modelAI,
      installRows,
      alertRows
    ] = await Promise.all([
      getFlexibleReport(siteKey, 'first_touch', dateFrom, dateTo, 'source', 'revenue', {}),
      // Option 1: query conversions separately alongside revenue so frontend tables show real counts
      getFlexibleReport(siteKey, 'first_touch', dateFrom, dateTo, 'source', 'conversions', {}),
      getFlexibleReport(siteKey, 'first_touch', dateFrom, dateTo, 'source', 'sessions', {}),
      getFlexibleReport(siteKey, 'first_touch', dateFrom, dateTo, 'source', 'leads', {}),
      getFlexibleReport(siteKey, 'first_touch', prevDateFrom, prevDateTo, 'source', 'revenue', {}),
      getFlexibleReport(siteKey, 'first_touch', prevDateFrom, prevDateTo, 'source', 'leads', {}),
      getFlexibleReport(siteKey, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(siteKey, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'ai_conversions', { has_ai_source: 'true' }),
      getFlexibleReport(siteKey, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'ai_revenue_share', { has_ai_source: 'true' }),
      getFlexibleReport(siteKey, 'ai_platforms', dateFrom, dateTo, 'date', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(siteKey, 'first_touch', dateFrom, dateTo, 'landing_page', 'revenue', {}),
      getFlexibleReport(siteKey, 'last_touch', dateFrom, dateTo, 'campaign', 'revenue', {}),
      getFlexibleReport(siteKey, 'first_touch', dateFrom, dateTo, 'date', 'revenue', {}),
      getAttribution(siteKey, 'first_touch', dateFrom, dateTo),
      getAttribution(siteKey, 'last_touch', dateFrom, dateTo),
      getAttribution(siteKey, 'linear', dateFrom, dateTo),
      getAttribution(siteKey, 'ai_platforms', dateFrom, dateTo),
      queryHogQL(`
        SELECT event, timestamp, properties.page_url AS page_url
        FROM events
        WHERE properties.site_id = '${esc(siteId)}'
        ORDER BY timestamp DESC
        LIMIT 1
      `, 'dash_install'),
      queryHogQL(`
        SELECT
          SUM(CASE WHEN timestamp >= now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS this_week,
          SUM(CASE WHEN timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS last_week,
          COUNT(CASE WHEN timestamp >= now() - INTERVAL 1 DAY THEN 1 END) AS count_day,
          COUNT(CASE WHEN timestamp >= now() - INTERVAL 1 HOUR THEN 1 END) AS count_hour,
          MAX(timestamp) AS last_event
        FROM events
        WHERE properties.site_id = '${esc(siteId)}'
          AND event = '$pageview'
      `, 'dash_alerts')
    ])

    // Merge conversion counts into revenue rows so frontend tables show real values.
    // Option 1: query conversions separately and join by dim_value.
    const convByDim = {}
    for (const r of sourceConvResults) {
      convByDim[r.dim_value] = r.conversions
    }
    for (const r of revenueResults) {
      r.conversions = convByDim[r.dim_value] || 0
    }
    const aiConvByDim = {}
    for (const r of aiConvResults) {
      aiConvByDim[r.dim_value] = r.ai_conversions
    }
    for (const r of aiRevResults) {
      r.ai_conversions = aiConvByDim[r.dim_value] || 0
    }

    const totalRevenue = revenueResults.reduce((sum, r) => sum + (r.revenue || 0), 0)
    const totalConversions = revenueResults.reduce((sum, r) => sum + (r.conversions || 0), 0)
    const totalSessions = sessionsResults.reduce((sum, r) => sum + (r.sessions || 0), 0)
    const totalLeads = leadsResults.reduce((sum, r) => sum + (r.leads || 0), 0)
    const convRate = totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0
    const avgValue = totalConversions > 0 ? totalRevenue / totalConversions : 0

    const prevRevenue = prevRevenueResults.reduce((sum, r) => sum + (r.revenue || 0), 0)
    const prevLeads = prevLeadsResults.reduce((sum, r) => sum + (r.leads || 0), 0)

    const totalAIRevenue = aiRevResults.reduce((sum, r) => sum + (r.ai_revenue || 0), 0)
    const aiShareTotal = aiShareResults.reduce((sum, r) => sum + (r.ai_revenue_share || 0), 0)

    const modelRevenues = {
      first_touch: modelFirstTouch.reduce((s, r) => s + (r.revenue || 0), 0),
      last_touch: modelLastTouch.reduce((s, r) => s + (r.revenue || 0), 0),
      linear: modelLinear.reduce((s, r) => s + (r.revenue || 0), 0),
      ai_platforms: modelAI.reduce((s, r) => s + (r.revenue || 0), 0)
    }

    let installData = null
    if (installRows?.length > 0) {
      const [event, timestamp, pageUrl] = installRows[0]
      let domain = null
      try { if (pageUrl) domain = new URL(pageUrl).hostname } catch { /* */ }
      installData = { status: 'verified', last_event: timestamp, last_event_type: event, domain }
    } else {
      installData = { status: 'not_installed', last_event: null, domain: null }
    }

    let healthStatus = 'never_seen'
    let countDay = 0, countHour = 0
    if (alertRows?.length > 0) {
      const [thisWeek, lastWeek, cd, ch, lastEvt] = alertRows[0]
      countDay = Number(cd) || 0
      countHour = Number(ch) || 0
      if (cd > 0) healthStatus = 'healthy'
      else if (lastEvt) healthStatus = 'silent_24h'
    }

    const alerts = []
    if (healthStatus === 'silent_24h') {
      alerts.push({ id: 'silent', metric: 'Tracking', message: 'No events in the last 24 hours', severity: 'high', suggested_action: 'Check your snippet is still live on your site.' })
    }

    return res.status(200).json({
      success: true,
      data: {
        date_from: dateFrom,
        date_to: dateTo,
        kpis: {
          revenue: totalRevenue,
          revenue_prev: prevRevenue,
          conversions: totalConversions,
          sessions: totalSessions,
          leads: totalLeads,
          leads_prev: prevLeads,
          ai_revenue: totalAIRevenue,
          ai_revenue_share: aiShareTotal,
          conversion_rate: convRate,
          avg_value: avgValue
        },
        models: modelRevenues,
        ai_sources: aiRevResults.slice(0, 5),
        ai_trend: aiTrendResults,
        sources: revenueResults.slice(0, 10),
        landing_pages: landingResults.slice(0, 5),
        campaigns: campaignResults.slice(0, 5),
        revenue_trend: timeResults,
        install: installData,
        health: { status: healthStatus, count_day: countDay, count_hour: countHour },
        alerts
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Dashboard overview failed' })
  }
})

export { router as dashboardRouter }
