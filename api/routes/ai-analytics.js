import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { getFlexibleReport } from '../lib/attribution-engine.js'

const router = Router()

router.get('/overview', validateSiteKey, async (req, res) => {
  try {
    const posthogSiteId = String(req.site.id)
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 90)
    const dateTo = new Date().toISOString().slice(0, 10)
    const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

    const [
      aiPlatformRevenue,
      aiPlatformConversions,
      aiTrend,
      nonAIRevenue,
      nonAIConversions,
      aiSessions,
      nonAISessions
    ] = await Promise.all([
      getFlexibleReport(posthogSiteId, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'ai_conversions', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'ai_platforms', dateFrom, dateTo, 'date', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'source', 'revenue', { has_ai_source: 'false' }),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'source', 'conversions', { has_ai_source: 'false' }),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'source', 'sessions', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'source', 'sessions', { has_ai_source: 'false' })
    ])

    const aiConvByDim = {}
    for (const r of aiPlatformConversions) {
      aiConvByDim[r.dim_value] = r.ai_conversions
    }
    const platforms = aiPlatformRevenue.map(r => ({
      platform: r.dim_value || 'unknown',
      revenue: r.ai_revenue || 0,
      conversions: aiConvByDim[r.dim_value] || 0
    }))

    const totalAIRevenue = platforms.reduce((s, p) => s + p.revenue, 0)
    const totalAIConversions = platforms.reduce((s, p) => s + p.conversions, 0)
    const totalNonAIRevenue = nonAIRevenue.reduce((s, r) => s + (r.revenue || 0), 0)
    const totalNonAIConversions = nonAIConversions.reduce((s, r) => s + (r.conversions || 0), 0)
    const totalAISessions = aiSessions.reduce((s, r) => s + (r.sessions || 0), 0)
    const totalNonAISessions = nonAISessions.reduce((s, r) => s + (r.sessions || 0), 0)

    const totalRevenue = totalAIRevenue + totalNonAIRevenue
    const aiRevenueShare = totalRevenue > 0 ? (totalAIRevenue / totalRevenue) * 100 : 0
    const aiConversionRate = totalAISessions > 0 ? (totalAIConversions / totalAISessions) * 100 : 0
    const nonAIConversionRate = totalNonAISessions > 0 ? (totalNonAIConversions / totalNonAISessions) * 100 : 0
    const aiAOV = totalAIConversions > 0 ? totalAIRevenue / totalAIConversions : 0
    const nonAIAOV = totalNonAIConversions > 0 ? totalNonAIRevenue / totalNonAIConversions : 0

    return res.status(200).json({
      success: true,
      data: {
        date_from: dateFrom,
        date_to: dateTo,
        kpis: {
          ai_revenue: totalAIRevenue,
          ai_conversions: totalAIConversions,
          ai_sessions: totalAISessions,
          ai_revenue_share: aiRevenueShare,
          ai_conversion_rate: aiConversionRate,
          ai_aov: aiAOV,
          non_ai_revenue: totalNonAIRevenue,
          non_ai_conversions: totalNonAIConversions,
          non_ai_sessions: totalNonAISessions,
          non_ai_conversion_rate: nonAIConversionRate,
          non_ai_aov: nonAIAOV
        },
        platforms: platforms.slice(0, 10),
        trend: aiTrend
      },
      error: null
    })
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'AI analytics failed' })
  }
})


router.get('/forecast', validateSiteKey, async (req, res) => {
  try {
    const posthogSiteId = String(req.site.id)
    const dateTo   = new Date().toISOString().slice(0, 10)
    const dateFrom = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)

    const [revTrend, leadsTrend] = await Promise.all([
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'date', 'revenue', {}),
      getFlexibleReport(posthogSiteId, 'first_touch', dateFrom, dateTo, 'date', 'leads', {})
    ])

    if (revTrend.length < 14) {
      return res.json({
        success: true,
        data: { forecast: null, reason: 'insufficient_data', min_days_needed: 14, days_available: revTrend.length }
      })
    }

    const leadsMap = {}
    for (const r of leadsTrend) { leadsMap[r.dim_value] = r.leads || 0 }

    const series = revTrend.slice(-30).map(r => ({
      date: r.dim_value,
      revenue: Number((r.revenue || 0).toFixed(2)),
      leads: leadsMap[r.dim_value] || 0
    }))

    const systemPrompt = `You are a marketing analytics forecasting assistant.
Given daily revenue and leads data, produce a 7-day forecast.
Respond ONLY with valid JSON — no markdown, no explanation, no preamble.
The JSON must have exactly this shape:
{
  "forecast": [
    { "date": "YYYY-MM-DD", "revenue": number, "leads": number, "confidence": "high"|"medium"|"low" }
  ],
  "summary": "One sentence describing the trend and forecast",
  "confidence_overall": "high"|"medium"|"low",
  "trend": "up"|"flat"|"down"
}`

    const userMessage = `Historical data (last 30 days):
${JSON.stringify(series, null, 2)}

Forecast the next 7 days starting from ${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}.
Base your forecast on the trend, weekly patterns, and momentum visible in the data.
Return only the JSON object.`

    const { callAI } = await import('../lib/ai-client.js')
    const raw = await callAI(systemPrompt, userMessage)

    let parsed
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch (_e) {
      return res.status(502).json({ success: false, error: 'AI returned invalid JSON', raw: raw.slice(0, 200) })
    }

    if (!Array.isArray(parsed?.forecast) || parsed.forecast.length === 0) {
      return res.status(502).json({ success: false, error: 'AI forecast missing or empty' })
    }

    return res.json({
      success: true,
      data: {
        historical: series,
        forecast: parsed.forecast,
        summary: parsed.summary || '',
        confidence_overall: parsed.confidence_overall || 'medium',
        trend: parsed.trend || 'flat',
        generated_at: new Date().toISOString()
      }
    })
  } catch (err) {
    console.error('[ai-analytics/forecast]', err.message)
    return res.status(500).json({ success: false, error: 'Forecast failed' })
  }
})


router.get('/anomalies', validateSiteKey, async (req, res) => {
  try {
    const posthogSiteId = String(req.site.id)
    const now       = new Date()
    const thisWeekTo   = now.toISOString().slice(0, 10)
    const thisWeekFrom = new Date(now - 7  * 86400000).toISOString().slice(0, 10)
    const lastWeekTo   = new Date(now - 7  * 86400000).toISOString().slice(0, 10)
    const lastWeekFrom = new Date(now - 14 * 86400000).toISOString().slice(0, 10)

    // Fetch this week + last week per channel for revenue + leads
    const [thisRevenue, lastRevenue, thisLeads, lastLeads, thisAI, lastAI] = await Promise.all([
      getFlexibleReport(posthogSiteId, 'first_touch', thisWeekFrom, thisWeekTo, 'source', 'revenue', {}),
      getFlexibleReport(posthogSiteId, 'first_touch', lastWeekFrom, lastWeekTo, 'source', 'revenue', {}),
      getFlexibleReport(posthogSiteId, 'first_touch', thisWeekFrom, thisWeekTo, 'source', 'leads',   {}),
      getFlexibleReport(posthogSiteId, 'first_touch', lastWeekFrom, lastWeekTo, 'source', 'leads',   {}),
      getFlexibleReport(posthogSiteId, 'ai_platforms', thisWeekFrom, thisWeekTo, 'ai_source', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(posthogSiteId, 'ai_platforms', lastWeekFrom, lastWeekTo, 'ai_source', 'ai_revenue', { has_ai_source: 'true' })
    ])

    // Build lookup maps
    const toMap = (rows, key) => Object.fromEntries(rows.map(r => [r.dim_value, r[key] || 0]))
    const thisRevMap  = toMap(thisRevenue,  'revenue')
    const lastRevMap  = toMap(lastRevenue,  'revenue')
    const thisLeadMap = toMap(thisLeads,    'leads')
    const lastLeadMap = toMap(lastLeads,    'leads')
    const thisAIMap   = toMap(thisAI,       'ai_revenue')
    const lastAIMap   = toMap(lastAI,       'ai_revenue')

    // Get all channel names across both weeks
    const channels = [...new Set([
      ...Object.keys(thisRevMap),
      ...Object.keys(lastRevMap)
    ])].filter(Boolean)

    const channelData = channels.map(ch => {
      const thisRev  = thisRevMap[ch]  || 0
      const lastRev  = lastRevMap[ch]  || 0
      const thisLead = thisLeadMap[ch] || 0
      const lastLead = lastLeadMap[ch] || 0
      const revDelta  = lastRev  > 0 ? ((thisRev  - lastRev)  / lastRev)  * 100 : null
      const leadDelta = lastLead > 0 ? ((thisLead - lastLead) / lastLead) * 100 : null
      return { channel: ch, this_week_revenue: thisRev, last_week_revenue: lastRev, rev_delta_pct: revDelta, this_week_leads: thisLead, last_week_leads: lastLead, lead_delta_pct: leadDelta }
    }).filter(d => d.this_week_revenue > 0 || d.last_week_revenue > 0)

    // AI totals week-over-week
    const thisAITotal = Object.values(thisAIMap).reduce((s, v) => s + v, 0)
    const lastAITotal = Object.values(lastAIMap).reduce((s, v) => s + v, 0)
    const aiDelta     = lastAITotal > 0 ? ((thisAITotal - lastAITotal) / lastAITotal) * 100 : null

    // Only call AI if we have enough data (at least 2 channels with both weeks)
    const hasEnoughData = channelData.filter(d => d.rev_delta_pct !== null).length >= 2
    let aiExplanation = null

    if (hasEnoughData) {
      try {
        const { callAI } = await import('../lib/ai-client.js')
        const systemPrompt = `You are a marketing analytics assistant detecting performance anomalies.
Given week-over-week channel data, identify the most significant changes and explain them briefly.
Respond ONLY with valid JSON — no markdown, no preamble.
Schema: { "anomalies": [{ "channel": string, "type": "spike"|"drop"|"new"|"lost", "metric": "revenue"|"leads", "delta_pct": number, "explanation": "max 15 words" }], "summary": "1 sentence overall summary" }
Only include channels with >20% change. Max 5 anomalies.`

        const userMessage = JSON.stringify({ channels: channelData, ai_total_delta_pct: aiDelta })
        const raw   = await callAI(systemPrompt, userMessage)
        const clean = raw.replace(/\`\`\`json|\`\`\`/g, '').trim()
        aiExplanation = JSON.parse(clean)
      } catch (_e) {
        aiExplanation = null
      }
    }

    return res.json({
      success: true,
      data: {
        channels: channelData,
        ai_total: { this_week: thisAITotal, last_week: lastAITotal, delta_pct: aiDelta },
        anomalies: aiExplanation?.anomalies || [],
        summary:   aiExplanation?.summary   || null,
        period: { this_week: { from: thisWeekFrom, to: thisWeekTo }, last_week: { from: lastWeekFrom, to: lastWeekTo } },
        has_enough_data: hasEnoughData,
        generated_at: new Date().toISOString()
      }
    })
  } catch (err) {
    console.error('[ai-analytics/anomalies]', err.message)
    return res.status(500).json({ success: false, error: 'Anomaly detection failed' })
  }
})

export { router as aiAnalyticsRouter }
