import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { getFlexibleReport } from '../lib/attribution-engine.js'

const router = Router()

router.get('/overview', validateSiteKey, async (req, res) => {
  try {
    const siteKey = req.query.site_key || req.body?.site_key
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
      getFlexibleReport(siteKey, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(siteKey, 'ai_platforms', dateFrom, dateTo, 'ai_source', 'ai_conversions', { has_ai_source: 'true' }),
      getFlexibleReport(siteKey, 'ai_platforms', dateFrom, dateTo, 'date', 'ai_revenue', { has_ai_source: 'true' }),
      getFlexibleReport(siteKey, 'first_touch', dateFrom, dateTo, 'source', 'revenue', { has_ai_source: 'false' }),
      getFlexibleReport(siteKey, 'first_touch', dateFrom, dateTo, 'source', 'conversions', { has_ai_source: 'false' }),
      getFlexibleReport(siteKey, 'first_touch', dateFrom, dateTo, 'source', 'sessions', { has_ai_source: 'true' }),
      getFlexibleReport(siteKey, 'first_touch', dateFrom, dateTo, 'source', 'sessions', { has_ai_source: 'false' })
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

export { router as aiAnalyticsRouter }
