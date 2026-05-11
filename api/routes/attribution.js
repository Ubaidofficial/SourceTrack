import { getAttribution, getFlexibleReport, getAttributionExplanation } from '../lib/attribution-engine.js'

const ALLOWED_MODELS = new Set(['first_touch', 'last_touch', 'first_touch_non_direct', 'last_touch_non_direct', 'ai_platforms'])
const ALLOWED_GROUPS = new Set(['source', 'medium', 'campaign', 'ai_source', 'landing_page', 'country', 'device', 'date'])
const ALLOWED_METRICS = new Set([
  'revenue', 'conversions', 'sessions', 'leads', 'conversion_rate',
  'avg_conversion_value', 'ai_conversions', 'ai_revenue', 'ai_conversion_share',
  'ai_revenue_share', 'ltv_revenue',
  'session_count', 'avg_session_duration', 'pages_per_session', 'conversion_sessions'
])
const ALLOWED_GRANULARITY = new Set(['day', 'week', 'month', 'quarter', 'year'])
const ALLOWED_WINDOWS = new Set(['ltv', '1', '7', '14', '30', '60', '90'])
const ALLOWED_ATTRIBUTE_BY = new Set(['conversion_date', 'first_seen_date', 'original_source_date'])

export async function attribution(req, res) {
  try {
    const { model, date_from, date_to, group_by, metric } = req.query
    const siteKey = req.query.site_key || req.body?.site_key

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
      if (req.query.filter_source) filters.source = req.query.filter_source
      if (req.query.filter_medium) filters.medium = req.query.filter_medium
      if (req.query.filter_campaign) filters.campaign = req.query.filter_campaign
      if (req.query.filter_ai_source) filters.ai_source = req.query.filter_ai_source
      if (req.query.filter_country) filters.country = req.query.filter_country
      if (req.query.filter_device_type) filters.device_type = req.query.filter_device_type
      if (req.query.filter_is_conversion) filters.is_conversion = req.query.filter_is_conversion
      if (req.query.filter_has_ai_source) filters.has_ai_source = req.query.filter_has_ai_source
      if (req.query.filter_min_conversions) filters.min_conversions = req.query.filter_min_conversions

      const results = await getFlexibleReport(siteKey, model, date_from, date_to, group_by, metric, filters,
        req.query.group_by2 || null,
        req.query.time_granularity || 'day',
        req.query.attribution_window || null,
        req.query.attribute_by || 'conversion_date'
      )

      return res.status(200).json({
        success: true,
        data: {
          model,
          date_from,
          date_to,
          group_by,
          metric,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
          results
        },
        error: null
      })
    }

    const results = await getAttribution(siteKey, model, date_from, date_to)

    res.status(200).json({
      success: true,
      data: {
        model,
        date_from,
        date_to,
        results
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

    const explanation = await getAttributionExplanation(site_key, model, distinct_id)

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
