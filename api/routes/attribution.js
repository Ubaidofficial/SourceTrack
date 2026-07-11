import { getAttribution, getFlexibleReport, getAttributionExplanation, getPreAggregatedAttribution, getLinearAttribution, getUShapedAttribution, getTimeDecayAttribution, getWShapedAttribution, preAggregatedWindowMatches } from '../lib/attribution-engine.js'
import { requireFeature } from '../lib/plan-features.js'
import { serializeHogQLDateRange } from '../lib/hogql-date.js'
import { isValidTimezone } from '../lib/utils.js'

const ALLOWED_MODELS = new Set(['first_touch', 'last_touch', 'first_touch_non_direct', 'last_touch_non_direct', 'ai_platforms', 'linear', 'u_shaped', 'time_decay', 'w_shaped'])
const ALLOWED_GROUPS = new Set(['channel', 'source', 'medium', 'campaign', 'keyword', 'referrer_domain', 'ai_source', 'landing_page', 'country', 'device', 'browser', 'conversion_type', 'date', 'provider', 'attribution_status', 'stitching_method'])
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

    if (['linear', 'u_shaped', 'time_decay', 'w_shaped'].includes(model)) {
      const block = requireFeature(req.site?.plan, 'multi_touch_attribution', 'Multi-touch attribution')
      if (block) return res.status(402).json(block)
    }

    if (!date_from || !date_to) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'date_from and date_to are required'
      })
    }

    try {
      serializeHogQLDateRange(date_from, date_to)
    } catch (err) {
      return res.status(400).json({
        success: false,
        data: null,
        error: err.message
      })
    }

    const isCustomParam = (dim) => {
      if (typeof dim !== 'string' || !/^custom_param:[a-z0-9_-]{1,40}$/.test(dim)) {
        return false
      }
      const key = dim.split(':')[1]
      const blockedSubstrings = ['email', 'phone', 'name', 'address', 'token', 'secret', 'password', 'session', 'auth', 'cookie', 'card', 'ssn']
      for (const sub of blockedSubstrings) {
        if (key.includes(sub)) return false
      }
      return Array.isArray(req.site?.custom_url_params) && req.site.custom_url_params.includes(key)
    }

    if (group_by && metric) {
      if (!ALLOWED_GROUPS.has(group_by) && !isCustomParam(group_by)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid group_by. Must be one of: ${[...ALLOWED_GROUPS].join(', ')} or an allowlisted custom_param:<key>`
        })
      }
      if (!ALLOWED_METRICS.has(metric)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid metric. Must be one of: ${[...ALLOWED_METRICS].join(', ')}`
        })
      }
      if (req.query.group_by2 && !ALLOWED_GROUPS.has(req.query.group_by2) && !isCustomParam(req.query.group_by2)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid group_by2. Must be one of: ${[...ALLOWED_GROUPS].join(', ')} or an allowlisted custom_param:<key>`
        })
      }
      if (req.query.time_granularity && !ALLOWED_GRANULARITY.has(req.query.time_granularity)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid time_granularity. Must be one of: ${[...ALLOWED_GRANULARITY].join(', ')}`
        })
      }
      // Resolve attribution window: explicit param > site default > hardcoded default (30)
      const siteWindowDays = req.site?.attribution_window_days
      const siteWindowStr = siteWindowDays ? String(siteWindowDays) : '30'
      const resolvedWindow = req.query.attribution_window || (ALLOWED_WINDOWS.has(siteWindowStr) ? siteWindowStr : '30')

      if (resolvedWindow && !ALLOWED_WINDOWS.has(resolvedWindow)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid attribution_window. Must be one of: ${[...ALLOWED_WINDOWS].join(', ')}`
        })
      }
      // Inject resolved window back so downstream engine functions can use req.query.attribution_window
      req.query.attribution_window = resolvedWindow

      // The pre-aggregated readers below (getPreAggregatedAttribution + the multi-touch readers) serve
      // the SINGLE window the nightly job materialized (the site's attribution_window_days) and cannot
      // re-window. Short-circuit to them ONLY when the window we're serving equals that materialized
      // window; otherwise a non-default lookback would be answered with site-window numbers labeled as
      // the requested window — a fake-window lie on the money rail (§6). On mismatch we fall through to
      // the live re-attributing flexible path (correct numbers; #180 honest-timeout is the backstop).
      // Default views/presets resolve to the site window, so the common fast path is unaffected.
      const preAggWindowMatches = preAggregatedWindowMatches(resolvedWindow, req.site?.attribution_window_days)

      if (req.query.attribute_by && !ALLOWED_ATTRIBUTE_BY.has(req.query.attribute_by)) {
        return res.status(400).json({
          success: false,
          data: null,
          error: `Invalid attribute_by. Must be one of: ${[...ALLOWED_ATTRIBUTE_BY].join(', ')}`
        })
      }

      const filters = {}
      // Site timezone drives the flexible path's local-date bucketing (filters.timezone ->
      // getSessionReport/getFlexibleReport -> getDateFilterExpr). Same convention as
      // campaigns/dashboard/analytics. Was referenced un-defined at the getFlexibleReport
      // call below (`filters.timezone = tz`), throwing `tz is not defined` on every
      // non-pre-aggregated model and getting swallowed into analytics_unavailable:true.
      const tz = isValidTimezone(req.site?.timezone) ? req.site.timezone : 'UTC'
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
      if (req.query.filter_conversion_type) filters.conversion_type = req.query.filter_conversion_type
      if (req.query.filter_customer_type && ['new', 'returning'].includes(req.query.filter_customer_type)) {
        filters.customer_type = req.query.filter_customer_type
      }

      // Use pre-aggregated data for first_touch, last_touch, and linear
      if ((model === "first_touch" || model === "last_touch") && preAggWindowMatches && group_by !== "keyword" && req.query.group_by2 !== "keyword" && group_by !== "referrer_domain" && req.query.group_by2 !== "referrer_domain" && group_by !== "provider" && req.query.group_by2 !== "provider" && group_by !== "attribution_status" && req.query.group_by2 !== "attribution_status" && group_by !== "stitching_method" && req.query.group_by2 !== "stitching_method" && !group_by.startsWith('custom_param:') && !(req.query.group_by2 && req.query.group_by2.startsWith('custom_param:'))) {
        try {
          const results = await getPreAggregatedAttribution({
            siteId: req.site.id,
            model,
            dateFrom: date_from,
            dateTo: date_to,
            groupBy: group_by,
            metric,
            filters,
            timezone: req.site?.timezone
          })
          return res.json({ success: true, data: { model, date_from, date_to, group_by, metric, results } })
        } catch (error) {
          console.error("Pre-aggregated attribution failed:", error)
        }
      }
      // Helper: wrap nightly-dependent models so empty results show a clear notice
      // instead of silently rendering a blank chart.
      const NIGHTLY_NOTICE = 'This model is calculated by the nightly attribution job (runs ~2 AM UTC). Results will appear after the first run. If you have recent conversions and still see no data, the job may not be configured — contact support.'

      if (model === "linear" && preAggWindowMatches && group_by !== "keyword" && req.query.group_by2 !== "keyword" && group_by !== "referrer_domain" && req.query.group_by2 !== "referrer_domain" && group_by !== "provider" && req.query.group_by2 !== "provider" && group_by !== "attribution_status" && req.query.group_by2 !== "attribution_status" && group_by !== "stitching_method" && req.query.group_by2 !== "stitching_method" && !group_by.startsWith('custom_param:') && !(req.query.group_by2 && req.query.group_by2.startsWith('custom_param:'))) {
        try {
          const results = await getLinearAttribution({
            siteId: req.site.id,
            dateFrom: date_from,
            dateTo: date_to,
            groupBy: group_by,
            metric
          })
          const notice = (!results || results.length === 0) ? NIGHTLY_NOTICE : undefined
          return res.json({ success: true, data: { model, date_from, date_to, group_by, metric, results: results || [], ...(notice ? { _notice: notice } : {}) } })
        } catch (error) {
          console.error('[attribution] linear failed:', error?.message)
          return res.json({ success: true, data: { model, date_from, date_to, group_by, metric, results: [], _notice: NIGHTLY_NOTICE } })
        }
      }
      if (model === "u_shaped" && preAggWindowMatches && group_by !== "keyword" && req.query.group_by2 !== "keyword" && group_by !== "referrer_domain" && req.query.group_by2 !== "referrer_domain" && group_by !== "provider" && req.query.group_by2 !== "provider" && group_by !== "attribution_status" && req.query.group_by2 !== "attribution_status" && group_by !== "stitching_method" && req.query.group_by2 !== "stitching_method" && !group_by.startsWith('custom_param:') && !(req.query.group_by2 && req.query.group_by2.startsWith('custom_param:'))) {
        try {
          const results = await getUShapedAttribution({
            siteId: req.site.id,
            dateFrom: date_from,
            dateTo: date_to,
            groupBy: group_by,
            metric
          })
          const notice = (!results || results.length === 0) ? NIGHTLY_NOTICE : undefined
          return res.json({ success: true, data: { model, date_from, date_to, group_by, metric, results: results || [], ...(notice ? { _notice: notice } : {}) } })
        } catch (error) {
          console.error('[attribution] u_shaped failed:', error?.message)
          return res.json({ success: true, data: { model, date_from, date_to, group_by, metric, results: [], _notice: NIGHTLY_NOTICE } })
        }
      }
      if (model === "time_decay" && preAggWindowMatches && group_by !== "keyword" && req.query.group_by2 !== "keyword" && group_by !== "referrer_domain" && req.query.group_by2 !== "referrer_domain" && group_by !== "provider" && req.query.group_by2 !== "provider" && group_by !== "attribution_status" && req.query.group_by2 !== "attribution_status" && group_by !== "stitching_method" && req.query.group_by2 !== "stitching_method" && !group_by.startsWith('custom_param:') && !(req.query.group_by2 && req.query.group_by2.startsWith('custom_param:'))) {
        try {
          const results = await getTimeDecayAttribution({
            siteId: req.site.id,
            dateFrom: date_from,
            dateTo: date_to,
            groupBy: group_by,
            metric
          })
          const notice = (!results || results.length === 0) ? NIGHTLY_NOTICE : undefined
          return res.json({ success: true, data: { model, date_from, date_to, group_by, metric, results: results || [], ...(notice ? { _notice: notice } : {}) } })
        } catch (error) {
          console.error('[attribution] time_decay failed:', error?.message)
          return res.json({ success: true, data: { model, date_from, date_to, group_by, metric, results: [], _notice: NIGHTLY_NOTICE } })
        }
      }
      if (model === "w_shaped" && preAggWindowMatches && group_by !== "keyword" && req.query.group_by2 !== "keyword" && group_by !== "referrer_domain" && req.query.group_by2 !== "referrer_domain" && group_by !== "provider" && req.query.group_by2 !== "provider" && group_by !== "attribution_status" && req.query.group_by2 !== "attribution_status" && group_by !== "stitching_method" && req.query.group_by2 !== "stitching_method" && !group_by.startsWith('custom_param:') && !(req.query.group_by2 && req.query.group_by2.startsWith('custom_param:'))) {
        try {
          const results = await getWShapedAttribution({
            siteId: req.site.id,
            dateFrom: date_from,
            dateTo: date_to,
            groupBy: group_by,
            metric
          })
          const notice = (!results || results.length === 0) ? NIGHTLY_NOTICE : undefined
          return res.json({ success: true, data: { model, date_from, date_to, group_by, metric, results: results || [], ...(notice ? { _notice: notice } : {}) } })
        } catch (error) {
          console.error('[attribution] w_shaped failed:', error?.message)
          return res.json({ success: true, data: { model, date_from, date_to, group_by, metric, results: [], _notice: NIGHTLY_NOTICE } })
        }
      }
      filters.timezone = tz
      const reportResult = await getFlexibleReport(posthogSiteId, model, date_from, date_to, group_by, metric, filters,
        req.query.group_by2 || null,
        req.query.time_granularity || 'day',
        req.query.attribution_window || null,
        req.query.attribute_by || 'conversion_date'
      )

      const rawResults = reportResult?.results ?? reportResult
      const results = Array.isArray(rawResults)
        ? rawResults.map(r => ({
            ...r,
            rpv: (r.sessions || r.conversions) > 0
              ? parseFloat(((r.revenue || 0) / (r.sessions || r.conversions || 1)).toFixed(2))
              : 0
          }))
        : rawResults
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
    // A THROWN error here is UNEXPECTED (a real failure — e.g. a Tinybird read-wiring bug,
    // or the tz ReferenceError this replaced), NOT the honest "query succeeded, zero rows"
    // case — that returns via the normal success path above with results:[]. Previously
    // this masked every throw as { success:true, analytics_unavailable:true } HTTP 200,
    // conflating a 500 with legit-empty and hiding real failures mid-migration. Surface it
    // as a real 500: the dashboard's fetchApi throws on !res.ok, so React Query treats it as
    // an error (data undefined -> empty render, no crash) instead of silent empty success.
    const msg = err?.message || String(err)
    // ClickHouse max-execution-time on the expensive live HogQL flexible_report query (Class-B shapes
    // with no pipe: source/medium/campaign windowed, keyword, referrer_domain, filtered, cross-tabs).
    // Surface a STRUCTURED code so the dashboard shows an honest "narrow the range" message instead of
    // rendering the failure as an empty "no data" state (a silent lie about the customer's business).
    // NEVER leak the raw ClickHouse message to the client.
    const isTimeout = /max execution time|timed out|timeout|\b504\b|TIMEOUT_EXCEEDED/i.test(msg)
    console.error('[attribution] query failed:', msg)
    res.status(500).json({
      success: false,
      data: null,
      error_code: isTimeout ? 'query_timeout' : 'query_failed',
      error: isTimeout
        ? 'This query timed out for the selected range. Try a narrower date range or a different dimension.'
        : 'Attribution query failed'
    })
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

    if (['linear', 'u_shaped', 'time_decay', 'w_shaped'].includes(model)) {
      const block = requireFeature(req.site?.plan, 'multi_touch_attribution', 'Multi-touch attribution')
      if (block) return res.status(402).json(block)
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
    console.error('[attribution/explain] query failed:', err?.message || err)
    res.status(200).json({ success: true, data: null, error: null })
  }
}

// ─── T5.2: Scale/Pause/Kill Verdicts ─────────────────────────────────────────
export async function attributionVerdicts(req, res) {
  try {
    const { date_from, date_to } = req.query
    const posthogSiteId = String(req.site.id)

    const block = requireFeature(req.site?.plan, 'ai_analytics', 'AI Analytics')
    if (block) return res.status(402).json(block)

    if (!date_from || !date_to) {
      return res.status(400).json({ success: false, data: null, error: 'date_from and date_to required' })
    }

    const campaigns = await getPreAggregatedAttribution({
      siteId: posthogSiteId,
      model: 'first_touch',
      dateFrom: date_from,
      dateTo: date_to,
      groupBy: 'campaign',
      metric: 'all',
      timezone: req.site?.timezone
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
    console.error('[attribution/verdicts] query failed:', err?.message || err)
    res.status(200).json({ success: true, data: [], error: null })
  }
}
// ─────────────────────────────────────────────────────────────────────────────
