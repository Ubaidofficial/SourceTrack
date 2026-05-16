import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { getFlexibleReport, getAttribution } from '../lib/attribution-engine.js'
import { queryHogQL } from '../lib/posthog.js'
import { createClient } from '@supabase/supabase-js'
const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

const router = Router()

function esc(str) {
  return str.replace(/'/g, "''")
}

router.get('/overview', validateSiteKey, async (req, res) => {
  try {
    const posthogSiteId = String(req.site.id)
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
      aiTrendResults,
      landingResults,
      campaignResults,
      timeResults,
      modelFirstTouch,
      modelLastTouch,
      modelFTND,
      modelLTND,
      modelAI,
      installRows,
      alertRows,
      convTypeRows,
      stageRows
    ] = await Promise.all([
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'source', 'revenue', {}),
      // Option 1: query conversions separately alongside revenue so frontend tables show real counts
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'source', 'conversions', {}),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'source', 'sessions', {}),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'source', 'leads', {}),
      getFlexibleReport(posthogSiteId, 'first_touch', prevDateFrom, prevDateTo, 'source', 'revenue', {}),
      getFlexibleReport(posthogSiteId, 'first_touch', prevDateFrom, prevDateTo, 'source', 'leads', {}),
      getFlexibleReport(posthogSiteId, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'ai_conversions', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'ai_platforms', dateFrom, dateTo, 'date', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'landing_page', 'revenue', {}),
      getFlexibleReport(posthogSiteId, 'last_touch', dateFrom, dateTo, 'campaign', 'revenue', {}),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'date', 'revenue', {}),
      getAttribution(posthogSiteId, 'first_touch', dateFrom, dateTo),
      getAttribution(posthogSiteId, 'last_touch', dateFrom, dateTo),
      getAttribution(posthogSiteId, 'first_touch_non_direct', dateFrom, dateTo),
      getAttribution(posthogSiteId, 'last_touch_non_direct', dateFrom, dateTo),
      getAttribution(posthogSiteId, 'ai_platforms', dateFrom, dateTo),
      queryHogQL(`
        SELECT event, timestamp, properties.page_url AS page_url
        FROM events
        WHERE properties.site_id = '${esc(posthogSiteId)}'
        ORDER BY timestamp DESC
        LIMIT 1
      `, 'dash_install'),
      queryHogQL(`
        SELECT
          SUM(CASE WHEN timestamp >= now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS this_week,
          SUM(CASE WHEN timestamp >= now() - INTERVAL 14 DAY AND timestamp < now() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS last_week,
          countIf(timestamp >= now() - INTERVAL 1 DAY) AS count_day,
          countIf(timestamp >= now() - INTERVAL 1 HOUR) AS count_hour,
          MAX(timestamp) AS last_event
        FROM events
        WHERE properties.site_id = '${esc(posthogSiteId)}'
          AND event = '$pageview'
      `, 'dash_alerts'),
      queryHogQL(`
        SELECT
          COALESCE(properties.conversion_type, 'untyped') AS conv_type,
          count() AS count,
          SUM(toFloatOrZero(toString(properties.conversion_value))) AS revenue
        FROM events
        WHERE properties.site_id = '${esc(posthogSiteId)}'
          AND event = '$conversion'
          AND timestamp >= toDateTime('${dateFrom} 00:00:00')
          AND timestamp <= toDateTime('${dateTo} 23:59:59')
        GROUP BY conv_type
        ORDER BY count DESC
      `, 'dash_conv_types'),
      queryHogQL(`
        SELECT
          properties.conversion_type AS stage,
          count() AS count,
          SUM(toFloatOrZero(toString(properties.conversion_value))) AS revenue
        FROM events
        WHERE properties.site_id = '${esc(posthogSiteId)}'
          AND event = '$conversion'
          AND properties.ingestion_method = 'offline'
          AND properties.conversion_type IN ('lead_created', 'qualified', 'opportunity', 'closed_won')
          AND timestamp >= toDateTime('${dateFrom} 00:00:00')
          AND timestamp <= toDateTime('${dateTo} 23:59:59')
        GROUP BY stage
        ORDER BY count DESC
      `, 'dash_stages')
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
    const bounceRateSql = `SELECT countIf(pv_count = 1) * 100.0 / count() FROM (SELECT distinct_id, count() AS pv_count FROM events WHERE event = '$pageview' AND properties.site_id = '${posthogSiteId}' AND timestamp >= toDateTime('${dateFrom}') AND timestamp <= toDateTime('${dateTo} 23:59:59') GROUP BY distinct_id)`
    let bounceRate = null
    try { const br = await queryHogQL(bounceRateSql, 'bounce_rate'); bounceRate = br?.[0]?.[0] ? parseFloat(Number(br[0][0]).toFixed(1)) : null } catch(_e) {}
    const totalLeads = leadsResults.reduce((sum, r) => sum + (r.leads || 0), 0)
    // SQL% — qualified leads / total leads from attributed_conversions
    const { count: sqlCount } = await supabaseAdmin.from('attributed_conversions').select('*', { count: 'exact', head: true }).eq('site_id', req.site.id).eq('status', 'sql').gte('conversion_date', dateFrom).lte('conversion_date', dateTo)
    const { count: totalLeadCount } = await supabaseAdmin.from('attributed_conversions').select('*', { count: 'exact', head: true }).eq('site_id', req.site.id).gte('conversion_date', dateFrom).lte('conversion_date', dateTo)
    const sqlPercent = totalLeadCount > 0 ? parseFloat(((sqlCount || 0) / totalLeadCount * 100).toFixed(1)) : 0
    const convRate = totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0
    const avgValue = totalConversions > 0 ? totalRevenue / totalConversions : 0

    const prevRevenue = prevRevenueResults.reduce((sum, r) => sum + (r.revenue || 0), 0)
    const prevLeads = prevLeadsResults.reduce((sum, r) => sum + (r.leads || 0), 0)

    const totalAIRevenue = aiRevResults.reduce((sum, r) => sum + (r.ai_revenue || 0), 0)
    const aiShareTotal = totalRevenue > 0 ? (totalAIRevenue / totalRevenue) * 100 : 0

    const modelRevenues = {
      first_touch: modelFirstTouch.reduce((s, r) => s + (r.revenue || 0), 0),
      last_touch: modelLastTouch.reduce((s, r) => s + (r.revenue || 0), 0),
      first_touch_non_direct: modelFTND.reduce((s, r) => s + (r.revenue || 0), 0),
      last_touch_non_direct: modelLTND.reduce((s, r) => s + (r.revenue || 0), 0),
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

    const conversionTypes = {}
    for (const [convType, count, revenue] of (convTypeRows || [])) {
      conversionTypes[convType] = { count: Number(count) || 0, revenue: Number(revenue) || 0 }
    }

    const pipelineStages = {}
    for (const [stage, count, revenue] of (stageRows || [])) {
      pipelineStages[stage] = { count: Number(count) || 0, revenue: Number(revenue) || 0 }
    }

    return res.status(200).json({
      success: true,
      data: {
        date_from: dateFrom,
        date_to: dateTo,
        business_type: req.site.business_type || 'saas',
        kpis: {
          revenue: totalRevenue,
          revenue_prev: prevRevenue,
          conversions: totalConversions,
          sessions: totalSessions,
          bounce_rate: bounceRate,
          leads: totalLeads,
          sql_percent: sqlPercent,
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
        alerts,
        conversion_types: conversionTypes,
        pipeline_stages: pipelineStages
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Dashboard overview failed' })
  }
})

export { router as dashboardRouter }
