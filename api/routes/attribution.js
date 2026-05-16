import { getAttribution, getFlexibleReport, getAttributionExplanation, getPreAggregatedAttribution, getLinearAttribution } from '../lib/attribution-engine.js'

const ALLOWED_MODELS = new Set(['first_touch', 'last_touch', 'first_touch_non_direct', 'last_touch_non_direct', 'ai_platforms', 'linear'])
const ALLOWED_GROUPS = new Set(['channel', 'source', 'medium', 'campaign', 'ai_source', 'landing_page', 'country', 'device', 'conversion_type', 'date'])
const ALLOWED_METRICS = new Set([
  'revenue', 'conversions', 'sessions', 'leads', 'conversion_rate',
  'avg_conversion_value', 'ai_conversions', 'ai_revenue', 'ai_conversion_share',
  'ai_revenue_share', 'ltv_revenue',
  'session_count', 'avg_session_duration', 'pages_per_session', 'conversion_sessions',
  'days_to_convert', 'touchpoints_per_conversion'
])
const ALLOWED_GRANULARITY = new Set(['day', 'week', 'month', 'quarter', 'year'])
const ALLOWED_WINDOWS = new Set(['ltv', '1', '7', '14', '30', '60', '90'])
const ALLOWED_ATTRIBUTE_BY = new Set(['conversion_date', 'first_seen_date', 'original_source_date'])

export async function attribution(req, res) {
  try {
    const { model, date_from, date_to, group_by, metric } = req.query
    const posthogSiteId = String(req.site.id)

    if (!model || !ALLOWED_MODELS.has(model)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `Invalid model. Must be one of: ${[...ALLOWED_MODELS].join(', ')}`
      })
    }

    if (!date_from || !date_to) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'date_from and date_to are required'
      })
    }

    const fromDate = new Date(date_from)
    const toDate = new Date(date_to)

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'Invalid date format. Use ISO 8601.'
      })
    }

    if (fromDate > toDate) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'date_from must be before date_to'
      })
    }

    if (group_by && metric) {
      if (!ALLOWED_GROUPS.has(group_by)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid group_by. Must be one of: ${[...ALLOWED_GROUPS].join(', ')}`
        })
      }
      if (!ALLOWED_METRICS.has(metric)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid metric. Must be one of: ${[...ALLOWED_METRICS].join(', ')}`
        })
      }
      if (req.query.group_by2 && !ALLOWED_GROUPS.has(req.query.group_by2)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid group_by2. Must be one of: ${[...ALLOWED_GROUPS].join(', ')}`
        })
      }
      if (req.query.time_granularity && !ALLOWED_GRANULARITY.has(req.query.time_granularity)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid time_granularity. Must be one of: ${[...ALLOWED_GRANULARITY].join(', ')}`
        })
      }
      if (req.query.attribution_window && !ALLOWED_WINDOWS.has(req.query.attribution_window)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid attribution_window. Must be one of: ${[...ALLOWED_WINDOWS].join(', ')}`
        })
      }
      if (req.query.attribute_by && !ALLOWED_ATTRIBUTE_BY.has(req.query.attribute_by)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid attribute_by. Must be one of: ${[...ALLOWED_ATTRIBUTE_BY].join(', ')}`
        })
      }

      const filters = {}
      if (req.query.filter_channel) filters.channel = req.query.filter_channel
      if (req.query.filter_source) filters.source = req.query.filter_source
      if (req.query.filter_medium) filters.medium = req.query.filter_medium
      if (req.query.filter_campaign) filters.campaign = req.query.filter_campaign
      if (req.query.filter_ai_source) filters.ai_source = req.query.filter_ai_source
      if (req.query.filter_country) filters.country = req.query.filter_country
      if (req.query.filter_device_type) filters.device_type = req.query.filter_device_type
      if (req.query.filter_is_conversion) filters.is_conversion = req.query.filter_is_conversion
      if (req.query.filter_has_ai_source) filters.has_ai_source = req.query.filter_has_ai_source
      if (req.query.filter_min_conversions) filters.min_conversions = req.query.filter_min_conversions

      // Use pre-aggregated data for first_touch, last_touch, and linear
      if (model === "first_touch" || model === "last_touch") {
        try {
          const results = await getPreAggregatedAttribution({
            siteId: req.site.id,
            model,
            dateFrom: date_from,
            dateTo: date_to,
            groupBy: group_by,
            metric
          })
          return res.json({ success: true, data: { model, date_from, date_to, group_by, metric, results } })
        } catch (error) {
          console.error("Pre-aggregated attribution failed:", error)
        }
      }
      if (model === "linear") {
        try {
          const results = await getLinearAttribution({
            siteId: req.site.id,
            dateFrom: date_from,
            dateTo: date_to,
            groupBy: group_by,
            metric
          })
          return res.json({ success: true, data: { model, date_from, date_to, group_by, metric, results } })
        } catch (error) {
          console.error("Linear attribution failed:", error)
        }
      }

      const reportResult = await getFlexibleReport(posthogSiteId, model, date_from, date_to, group_by, metric, filters,
        req.query.group_by2 || null,
        req.query.time_granularity || 'day',
        req.query.attribution_window || null,
        req.query.attribute_by || 'conversion_date'
      )

      const results = reportResult?.results ?? reportResult
      const truncated = reportResult?.truncated ?? false

      return res.status(200).json({
        success: true,
        data: {
          model,
          date_from,
          date_to,
          group_by,
          metric,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
          results,
          ...(truncated ? { truncated, truncation_warning: 'Results are limited to 50,000 events. Use a shorter date range for complete data.' } : {})
        },
        error: null
      })
    }

    const attrResult = await getAttribution(posthogSiteId, model, date_from, date_to)

    const results = attrResult?.results ?? attrResult
    const truncated = attrResult?.truncated ?? false

    res.status(200).json({
      success: true,
      data: {
        model,
        date_from,
        date_to,
        results,
        ...(truncated ? { truncated, truncation_warning: 'Results are limited to 50,000 events. Use a shorter date range for complete data.' } : {})
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, data: null, error: 'Attribution query failed' })
  }
}

// GET /api/attribution/explain — explain WHY credit was assigned for a specific visitor
// Query params: site_key, model, distinct_id
export async function attributionExplain(req, res) {
  try {
    const { site_key, model, distinct_id } = req.query
    const posthogSiteId = String(req.site.id)

    if (!site_key || !model || !distinct_id) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'site_key, model, and distinct_id are required'
      })
    }

    if (!ALLOWED_MODELS.has(model)) {
      return res.status(400).json({
        success: false,
        data: null,
        error: `Invalid model. Must be one of: ${[...ALLOWED_MODELS].join(', ')}`
      })
    }

    const explanation = await getAttributionExplanation(posthogSiteId, model, distinct_id)

    if (!explanation) {
      return res.status(404).json({
        success: false,
        data: null,
        error: 'No conversion found for this visitor'
      })
    }

    return res.status(200).json({
      success: true,
      data: explanation,
      error: null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, data: null, error: 'Attribution explanation failed' })
  }
}

// ─── T5.2: Scale/Pause/Kill Verdicts ─────────────────────────────────────────
export async function attributionVerdicts(req, res) {
  try {
    const { date_from, date_to } = req.query
    const posthogSiteId = String(req.site.id)

    if (!date_from || !date_to) {
      return res.status(400).json({ success: false, data: null, error: 'date_from and date_to required' })
    }

    const campaigns = await getPreAggregatedAttribution({
      siteId: posthogSiteId,
      model: 'first_touch',
      dateFrom: date_from,
      dateTo: date_to,
      groupBy: 'campaign',
      metric: 'all'
    })

    if (!campaigns?.length) return res.json({ success: true, data: [], error: null })

    const { callAI } = await import('../lib/ai-client.js')

    const systemPrompt = `You are a marketing attribution analyst. Given campaign performance data, return a verdict for each campaign.
Return ONLY a valid JSON array. No markdown, no backticks, no preamble.
Schema: [{"campaign":"name","verdict":"SCALE"|"PAUSE"|"KILL","reason":"max 10 words","signal":"Scale Now"|"Monitor"|"Pause"|"Invest"}]
Rules:
- SCALE: high revenue, positive trend, good conversion rate
- PAUSE: low revenue but some conversions, needs review
- KILL: zero or near-zero revenue, no conversions`

    const userMessage = JSON.stringify(
      campaigns.slice(0, 20).map(c => ({
        campaign: c.dim_value || 'unknown',
        revenue: c.revenue || 0,
        conversions: c.conversions || 0,
        sessions: c.sessions || 0
      }))
    )

    let verdicts = []
    try {
      const aiText = await callAI(systemPrompt, userMessage)
      const clean = aiText.replace(/```json|```/g, '').trim()
      verdicts = JSON.parse(clean)
      if (!Array.isArray(verdicts)) verdicts = []
    } catch (aiErr) {
      console.error('[verdicts] AI parse error:', aiErr.message)
      verdicts = []
    }

    return res.json({ success: true, data: verdicts, error: null })
  } catch (err) {
    console.error('[verdicts]', err)
    res.status(500).json({ success: false, data: null, error: 'Verdicts failed' })
  }
}
// ─────────────────────────────────────────────────────────────────────────────
