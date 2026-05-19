import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { queryHogQL } from '../lib/posthog.js'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

function getSupabaseAdmin() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { global: { fetch }, realtime: { transport: WebSocket } })
}

const router = Router()

function esc(str) {
  return str.replace(/'/g, "''")
}

const AI_SOURCE_PATTERNS = ['chatgpt', 'claude', 'perplexity', 'gemini', 'grok', 'copilot', 'deepseek', 'meta ai', 'you.com', 'bing ai', 'bard', 'mistral']
function isAISource(source) {
  if (!source) return false
  const s = source.toLowerCase()
  return AI_SOURCE_PATTERNS.some(p => s.includes(p))
}

router.get('/overview', validateSiteKey, async (req, res) => {
  try {
    const posthogSiteId = String(req.site.id)
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90)
    const dateTo = new Date().toISOString().slice(0, 10)
    const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    const prevDateFrom = new Date(Date.now() - days * 2 * 86400000).toISOString().slice(0, 10)
    const prevDateTo = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

    const supabase = getSupabaseAdmin()

    // 2 Supabase + 3 PostHog in parallel; bounce_rate runs after (separate await)
    const [
      { data: acRows },
      { data: acRowsPrior },
      installRows,
      alertRows,
      stageRows
    ] = await Promise.all([
      supabase
        .from('attributed_conversions')
        .select('first_touch_source, first_touch_channel, last_touch_channel, first_touch_campaign, conversion_value, conversion_type, conversion_date, status, touchpoint_count')
        .eq('site_id', req.site.id)
        .gte('conversion_date', dateFrom)
        .lte('conversion_date', dateTo),
      supabase
        .from('attributed_conversions')
        .select('first_touch_source, first_touch_channel, last_touch_channel, conversion_value, conversion_type, status')
        .eq('site_id', req.site.id)
        .gte('conversion_date', prevDateFrom)
        .lte('conversion_date', prevDateTo),
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

    const rows = acRows || []
    const priorRows = acRowsPrior || []

    // ── Aggregate current period from Supabase rows ────────────────────────
    const sourceMap = {}
    const campaignMap = {}
    const revTrendMap = {}
    const channelTrendMap = {}
    const aiSourceMap = {}
    const aiTrendMap = {}
    const convTypeMap = {}

    let totalRevenue = 0
    let totalConversions = 0
    let totalAIRevenue = 0
    let sqlCount = 0
    let ftNonDirectRevenue = 0
    let ltNonDirectRevenue = 0

    for (const r of rows) {
      const val = Number(r.conversion_value) || 0
      const date = r.conversion_date?.slice(0, 10) || ''
      const source = r.first_touch_source || 'Direct'
      const campaign = r.first_touch_campaign || null
      const ftChannel = r.first_touch_channel || 'Direct'
      const ltChannel = r.last_touch_channel || 'Direct'
      const ai = isAISource(r.first_touch_source)

      totalRevenue += val
      totalConversions++
      if (r.status === 'sql') sqlCount++
      if (ftChannel !== 'Direct') ftNonDirectRevenue += val
      if (ltChannel !== 'Direct') ltNonDirectRevenue += val

      // source breakdown
      if (!sourceMap[source]) sourceMap[source] = { dim_value: source, revenue: 0, conversions: 0, sessions: 0, rpv: 0 }
      sourceMap[source].revenue += val
      sourceMap[source].conversions++

      // campaign breakdown
      if (campaign) {
        if (!campaignMap[campaign]) campaignMap[campaign] = { dim_value: campaign, revenue: 0, conversions: 0 }
        campaignMap[campaign].revenue += val
        campaignMap[campaign].conversions++
      }

      // revenue trend by date
      if (date) {
        if (!revTrendMap[date]) revTrendMap[date] = { dim_value: date, revenue: 0 }
        revTrendMap[date].revenue += val
      }

      // channel/leads trend by date
      if (date) {
        if (!channelTrendMap[date]) channelTrendMap[date] = { dim_value: date, leads: 0 }
        channelTrendMap[date].leads++
      }

      // AI source breakdown
      if (ai) {
        totalAIRevenue += val
        const aiSrc = r.first_touch_source
        if (!aiSourceMap[aiSrc]) aiSourceMap[aiSrc] = { dim_value: aiSrc, ai_revenue: 0, ai_conversions: 0, ai_leads: 0 }
        aiSourceMap[aiSrc].ai_revenue += val
        aiSourceMap[aiSrc].ai_conversions++
        aiSourceMap[aiSrc].ai_leads++
        if (date) {
          if (!aiTrendMap[date]) aiTrendMap[date] = { dim_value: date, ai_revenue: 0 }
          aiTrendMap[date].ai_revenue += val
        }
      }

      // conversion types
      const ct = r.conversion_type || 'untyped'
      if (!convTypeMap[ct]) convTypeMap[ct] = { count: 0, revenue: 0 }
      convTypeMap[ct].count++
      convTypeMap[ct].revenue += val
    }

    // ── Attribution model totals ────────────────────────────────────────────
    // Total revenue is the same across first/last touch — models differ in distribution
    // Non-direct models exclude conversions whose touch was Direct or null
    const modelRevenues = {
      first_touch: totalRevenue,
      last_touch: totalRevenue,
      first_touch_non_direct: ftNonDirectRevenue,
      last_touch_non_direct: ltNonDirectRevenue,
      ai_platforms: totalAIRevenue
    }

    // ── Build sorted result arrays ──────────────────────────────────────────
    const sources = Object.values(sourceMap)
      .map(s => ({ ...s, rpv: s.conversions > 0 ? parseFloat((s.revenue / s.conversions).toFixed(2)) : 0 }))
      .sort((a, b) => b.revenue - a.revenue)

    const campaigns = Object.values(campaignMap).sort((a, b) => b.revenue - a.revenue)
    const revenueTrend = Object.values(revTrendMap).sort((a, b) => a.dim_value.localeCompare(b.dim_value))
    const channelTrend = Object.values(channelTrendMap).sort((a, b) => a.dim_value.localeCompare(b.dim_value))
    const aiSources = Object.values(aiSourceMap).sort((a, b) => b.ai_revenue - a.ai_revenue)
    const aiTrend = Object.values(aiTrendMap).sort((a, b) => a.dim_value.localeCompare(b.dim_value))

    // ── Aggregate prior period ──────────────────────────────────────────────
    let prevRevenue = 0, prevLeads = 0, prevConversions = 0, prevAIRevenue = 0
    for (const r of priorRows) {
      const val = Number(r.conversion_value) || 0
      prevRevenue += val
      prevConversions++
      prevLeads++
      if (isAISource(r.first_touch_source)) prevAIRevenue += val
    }

    // ── KPIs ────────────────────────────────────────────────────────────────
    const totalLeads = totalConversions
    const sqlPercent = totalConversions > 0 ? parseFloat((sqlCount / totalConversions * 100).toFixed(1)) : 0
    const avgValue = totalConversions > 0 ? parseFloat((totalRevenue / totalConversions).toFixed(2)) : 0
    const aiShareTotal = totalRevenue > 0 ? parseFloat(((totalAIRevenue / totalRevenue) * 100).toFixed(2)) : 0
    const bestRPV = sources.length > 0
      ? sources.reduce((best, r) => (r.rpv || 0) > (best.rpv || 0) ? r : best, { rpv: 0, dim_value: '—' })
      : { rpv: 0, dim_value: '—' }

    // ── Bounce rate (PostHog — single call after parallel block) ───────────
    const bounceRateSql = `SELECT countIf(pv_count = 1) * 100.0 / count() FROM (SELECT distinct_id, count() AS pv_count FROM events WHERE event = '$pageview' AND properties.site_id = '${posthogSiteId}' AND timestamp >= toDateTime('${dateFrom}') AND timestamp <= toDateTime('${dateTo} 23:59:59') GROUP BY distinct_id)`
    let bounceRate = null
    try { const br = await queryHogQL(bounceRateSql, 'bounce_rate'); bounceRate = br?.[0]?.[0] ? parseFloat(Number(br[0][0]).toFixed(1)) : null } catch (_e) {}

    // ── Install status ──────────────────────────────────────────────────────
    let installData = null
    if (installRows?.length > 0) {
      const [event, timestamp, pageUrl] = installRows[0]
      let domain = null
      try { if (pageUrl) domain = new URL(pageUrl).hostname } catch { /* */ }
      installData = { status: 'verified', last_event: timestamp, last_event_type: event, domain }
    } else {
      installData = { status: 'not_installed', last_event: null, domain: null }
    }

    // ── Tracker health ──────────────────────────────────────────────────────
    let healthStatus = 'never_seen'
    let countDay = 0, countHour = 0
    if (alertRows?.length > 0) {
      const [_thisWeek, _lastWeek, cd, ch, lastEvt] = alertRows[0]
      countDay = Number(cd) || 0
      countHour = Number(ch) || 0
      if (cd > 0) healthStatus = 'healthy'
      else if (lastEvt) healthStatus = 'silent_24h'
    }

    const alerts = []
    if (healthStatus === 'silent_24h') {
      alerts.push({ id: 'silent', metric: 'Tracking', message: 'No events in the last 24 hours', severity: 'high', suggested_action: 'Check your snippet is still live on your site.' })
    }

    // ── Pipeline stages (offline CRM — from PostHog) ────────────────────────
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
          sessions: 0,
          bounce_rate: bounceRate,
          leads: totalLeads,
          sql_percent: sqlPercent,
          leads_prev: prevLeads,
          ai_revenue: totalAIRevenue,
          ai_revenue_prev: prevAIRevenue,
          ai_revenue_share: aiShareTotal,
          conversion_rate: 0,
          avg_value: avgValue,
          best_rpv_channel: bestRPV.dim_value,
          best_rpv: bestRPV.rpv
        },
        models: modelRevenues,
        ai_sources: aiSources.slice(0, 5),
        ai_trend: aiTrend,
        sources: sources.slice(0, 10),
        landing_pages: [],
        campaigns: campaigns.slice(0, 5),
        channel_trend: channelTrend,
        revenue_trend: revenueTrend,
        install: installData,
        health: { status: healthStatus, count_day: countDay, count_hour: countHour },
        alerts,
        conversion_types: convTypeMap,
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
