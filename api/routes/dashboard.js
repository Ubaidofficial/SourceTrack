import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { getFlexibleReport, getAttribution } from '../lib/attribution-engine.js'
import { queryHogQL } from '../lib/posthog.js'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
function getSupabaseAdmin() { return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { global: { fetch }, realtime: { transport: WebSocket } }) }

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
      prevConvResults,
      prevAIRevResults,
      aiRevResults,
      aiConvResults,
      aiLeadsResults,
      aiTrendResults,
      landingResults,
      campaignResults,
      timeResults,
      channelTrendResults,
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
      getFlexibleReport(posthogSiteId, 'first_touch', prevDateFrom, prevDateTo, 'source', 'conversions', {}),
      getFlexibleReport(posthogSiteId, 'ai_platforms', prevDateFrom, prevDateTo, 'ai_source', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'ai_conversions', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'leads', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'ai_platforms', dateFrom, dateTo, 'date', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'landing_page', 'revenue', {}),
      getFlexibleReport(posthogSiteId, 'last_touch', dateFrom, dateTo, 'campaign', 'revenue', {}),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'date', 'revenue', {}),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'date', 'leads', {}),
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
    // Merge session counts for RPV calculation
    const sessByDim = {}
    for (const r of sessionsResults) {
      sessByDim[r.dim_value] = r.sessions
    }
    for (const r of revenueResults) {
      const sessions = sessByDim[r.dim_value] || 0
      r.sessions = sessions
      r.rpv = sessions > 0 ? parseFloat((r.revenue / sessions).toFixed(2)) : 0
    }
    const aiConvByDim = {}
    for (const r of aiConvResults) {
      aiConvByDim[r.dim_value] = r.ai_conversions
    }
    for (const r of aiRevResults) {
      r.ai_conversions = aiConvByDim[r.dim_value] || 0
    }
    // Merge AI leads per platform
    const aiLeadsByDim = {}
    for (const r of aiLeadsResults) {
      aiLeadsByDim[r.dim_value] = r.leads
    }
    for (const r of aiRevResults) {
      r.ai_leads = aiLeadsByDim[r.dim_value] || 0
    }

    const totalRevenue = revenueResults.reduce((sum, r) => sum + (r.revenue || 0), 0)
    const totalConversions = revenueResults.reduce((sum, r) => sum + (r.conversions || 0), 0)
    const totalSessions = sessionsResults.reduce((sum, r) => sum + (r.sessions || 0), 0)
    const bounceRateSql = `SELECT countIf(pv_count = 1) * 100.0 / count() FROM (SELECT distinct_id, count() AS pv_count FROM events WHERE event = '$pageview' AND properties.site_id = '${posthogSiteId}' AND timestamp >= toDateTime('${dateFrom}') AND timestamp <= toDateTime('${dateTo} 23:59:59') GROUP BY distinct_id)`
    let bounceRate = null
    try { const br = await queryHogQL(bounceRateSql, 'bounce_rate'); bounceRate = br?.[0]?.[0] ? parseFloat(Number(br[0][0]).toFixed(1)) : null } catch(_e) {}
    const totalLeads = leadsResults.reduce((sum, r) => sum + (r.leads || 0), 0)
    // SQL% — qualified leads / total leads from attributed_conversions
    const { count: sqlCount } = await getSupabaseAdmin().from('attributed_conversions').select('*', { count: 'exact', head: true }).eq('site_id', req.site.id).eq('status', 'sql').gte('conversion_date', dateFrom).lte('conversion_date', dateTo)
    const { count: totalLeadCount } = await getSupabaseAdmin().from('attributed_conversions').select('*', { count: 'exact', head: true }).eq('site_id', req.site.id).gte('conversion_date', dateFrom).lte('conversion_date', dateTo)
    const sqlPercent = totalLeadCount > 0 ? parseFloat(((sqlCount || 0) / totalLeadCount * 100).toFixed(1)) : 0
    const convRate = totalSessions > 0 ? (totalConversions / totalSessions) * 100 : 0
    const avgValue = totalConversions > 0 ? totalRevenue / totalConversions : 0
    const bestRPV = revenueResults.length > 0
      ? revenueResults.reduce((best, r) => (r.rpv || 0) > (best.rpv || 0) ? r : best, { rpv: 0, dim_value: '—' })
      : { rpv: 0, dim_value: '—' }

    const prevRevenue      = prevRevenueResults.reduce((sum, r) => sum + (r.revenue || 0), 0)
    const prevLeads        = prevLeadsResults.reduce((sum, r) => sum + (r.leads || 0), 0)
    const prevConversions  = prevConvResults.reduce((sum, r) => sum + (r.conversions || 0), 0)
    const prevAIRevenue    = prevAIRevResults.reduce((sum, r) => sum + (r.ai_revenue || 0), 0)

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
          conversions_prev: prevConversions,
          sessions: totalSessions,
          bounce_rate: bounceRate,
          leads: totalLeads,
          sql_percent: sqlPercent,
          leads_prev: prevLeads,
          ai_revenue: totalAIRevenue,
          ai_revenue_prev: prevAIRevenue,
          ai_revenue_share: aiShareTotal,
          conversion_rate: convRate,
          avg_value: avgValue,
          best_rpv_channel: bestRPV.dim_value,
          best_rpv: bestRPV.rpv
        },
        models: modelRevenues,
        ai_sources: aiRevResults.slice(0, 5),
        ai_trend: aiTrendResults,
        sources: revenueResults.slice(0, 10),
        landing_pages: landingResults.slice(0, 5),
        campaigns: campaignResults.slice(0, 5),
        channel_trend: channelTrendResults,
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


router.get('/cac', validateSiteKey, async (req, res) => {
  try {
    const { date_from, date_to } = req.query
    const siteId = req.site.id
    const dateFrom = date_from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const dateTo = date_to || new Date().toISOString().slice(0, 10)

    const supabase = getSupabaseAdmin()

    const [{ data: spendData, error: spendErr }, { data: convData, error: convErr }] = await Promise.all([
      supabase
        .from('campaign_costs')
        .select('campaign_name, spend')
        .eq('site_id', siteId)
        .gte('period_start', dateFrom)
        .lte('period_end', dateTo),
      supabase
        .from('attributed_conversions')
        .select('first_touch_channel, conversion_value')
        .eq('site_id', siteId)
        .gte('conversion_date', dateFrom)
        .lte('conversion_date', dateTo)
    ])

    if (spendErr) throw spendErr
    if (convErr) throw convErr

    // Aggregate spend by campaign_name (treated as channel)
    const spendByChannel = {}
    for (const row of (spendData || [])) {
      const ch = (row.campaign_name || '').trim().toLowerCase()
      if (!ch) continue
      spendByChannel[ch] = (spendByChannel[ch] || 0) + parseFloat(row.spend || 0)
    }

    // Aggregate conversions by first_touch_channel
    const convByChannel = {}
    for (const row of (convData || [])) {
      const ch = (row.first_touch_channel || '').trim().toLowerCase()
      if (!ch) continue
      if (!convByChannel[ch]) convByChannel[ch] = { conversions: 0, totalValue: 0 }
      convByChannel[ch].conversions++
      convByChannel[ch].totalValue += parseFloat(row.conversion_value || 0)
    }

    // Join and calculate CAC / payback
    const results = []
    const allChannels = new Set([...Object.keys(spendByChannel), ...Object.keys(convByChannel)])

    for (const ch of allChannels) {
      const totalSpend = spendByChannel[ch] || null
      const conv = convByChannel[ch] || { conversions: 0, totalValue: 0 }
      const conversions = conv.conversions
      const avgValue = conversions > 0 ? conv.totalValue / conversions : 0

      const cac = (totalSpend != null && conversions > 0) ? totalSpend / conversions : null
      const paybackMonths = (cac != null && avgValue > 0) ? cac / avgValue : null

      results.push({
        channel: ch,
        total_spend: totalSpend != null ? parseFloat(totalSpend.toFixed(2)) : null,
        conversions,
        avg_value: parseFloat(avgValue.toFixed(2)),
        cac: cac != null ? parseFloat(cac.toFixed(2)) : null,
        payback_months: paybackMonths != null ? parseFloat(paybackMonths.toFixed(1)) : null
      })
    }

    results.sort((a, b) => {
      if (a.cac == null && b.cac == null) return 0
      if (a.cac == null) return 1
      if (b.cac == null) return -1
      return a.cac - b.cac
    })

    return res.status(200).json({ success: true, data: results, error: null })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'CAC calculation failed' })
  }
})

router.get('/live', validateSiteKey, async (req, res) => {
  try {
    const posthogSiteId = String(req.site.id)
    const sql = `SELECT count(DISTINCT distinct_id) FROM events WHERE event = '$pageview' AND properties.site_id = '${posthogSiteId}' AND timestamp >= now() - INTERVAL 5 MINUTE`
    const rows = await queryHogQL(sql, 'live_visitors')
    const count = Number(rows?.[0]?.[0]) || 0
    res.json({ success: true, data: { live_visitors: count } })
  } catch (err) {
    res.json({ success: true, data: { live_visitors: 0 } })
  }
})
export { router as dashboardRouter }
