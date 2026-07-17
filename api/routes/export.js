import { Router } from 'express'
import { getFlexibleReport, PREAGG_CONVERSION_METRICS, PREAGG_MULTITOUCH_METRICS } from '../lib/attribution-engine.js'
import { requireFeature } from '../lib/plan-features.js'
import { getSupabase as getSupabaseAdmin } from '../lib/supabase.js'
import { ALLOWED_MODELS, ALLOWED_GROUPS, ALLOWED_METRICS, gatedReportReason, flexFiltersPresent } from '../lib/report-config-validation.js'
import { serializeHogQLDateRange } from '../lib/hogql-date.js'

const router = Router()

function escapeCsv(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

router.get('/report', async (req, res) => {
  try {
    const block = requireFeature(req.site?.plan, 'csv_export', 'CSV export')
    if (block) return res.status(402).json(block)

    let reportConfig = {}
    if (req.query.report_id) {
      const supabase = getSupabaseAdmin()
      const { data: report, error } = await supabase
        .from('saved_reports')
        .select('*')
        .eq('id', req.query.report_id)
        .eq('site_id', req.site.id)
        .maybeSingle()

      if (error || !report) {
        return res.status(404).json({ success: false, data: null, error: 'Saved report not found or access denied' })
      }
      reportConfig = report.config || {}
    }

    const model = req.query.model || reportConfig.model
    const date_from = req.query.date_from || reportConfig.date_from
    const date_to = req.query.date_to || reportConfig.date_to
    const group_by = req.query.group_by || reportConfig.group_by
    const metric = req.query.metric || reportConfig.metric

    if (!model || !date_from || !date_to || !group_by || !metric) {
      return res.status(400).json({ success: false, data: null, error: 'model, date_from, date_to, group_by, metric are required' })
    }

    try {
      serializeHogQLDateRange(date_from, date_to)
    } catch (err) {
      return res.status(400).json({ success: false, data: null, error: err.message })
    }

    // Validate parameters
    if (!ALLOWED_MODELS.has(model)) {
      return res.status(400).json({ success: false, data: null, error: `Invalid model: ${model}` })
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

    if (!ALLOWED_GROUPS.has(group_by) && !isCustomParam(group_by)) {
      return res.status(400).json({ success: false, data: null, error: `Invalid group_by: ${group_by}` })
    }
    if (!ALLOWED_METRICS.has(metric)) {
      return res.status(400).json({ success: false, data: null, error: `Invalid metric: ${metric}` })
    }

    const posthogSiteId = String(req.site.id)

    // Filters + tz built ONCE and reused for the gate + the getFlexibleReport call (hoisted above
    // the gate so the gate can see them — no duplication).
    const filters = {}
    const getFilterVal = (key) => req.query[`filter_${key}`] !== undefined ? req.query[`filter_${key}`] : reportConfig[`filter_${key}`]

    const fSource = getFilterVal('source')
    const fMedium = getFilterVal('medium')
    const fCampaign = getFilterVal('campaign')
    const fAiSource = getFilterVal('ai_source')
    const fCountry = getFilterVal('country')
    const fDeviceType = getFilterVal('device_type')
    const fIsConversion = getFilterVal('is_conversion')
    const fHasAiSource = getFilterVal('has_ai_source')
    const fMinConversions = getFilterVal('min_conversions')

    if (fSource) filters.source = fSource
    if (fMedium) filters.medium = fMedium
    if (fCampaign) filters.campaign = fCampaign
    if (fAiSource) filters.ai_source = fAiSource
    if (fCountry) filters.country = fCountry
    if (fDeviceType) filters.device_type = fDeviceType
    if (fIsConversion) filters.is_conversion = fIsConversion
    if (fHasAiSource) filters.has_ai_source = fHasAiSource
    if (fMinConversions) filters.min_conversions = fMinConversions

    const tz = req.site?.timezone || 'UTC'
    filters.timezone = tz

    // ── DEAD-STORE GATE (Wave-4 + D0 tz/filter) ─────────────────────────────────────
    // Export calls getFlexibleReport DIRECTLY — it never reaches attribution.js's pre-agg
    // short-circuit — so a gated shape here would hit the engine's `pipe=NONE` branch and
    // silently export a CSV of zeros from a dead store. Deny instead. Export passes no
    // attribution_window (the engine defaults to no-window), so the window axis is not
    // applicable: preAggWindowMatches is left at its default (true).
    // model + the metric flags were previously OMITTED here, so every model-aware gate (#256-#261)
    // and the SERVED allowlist were inert for export — it could still CSV a dead-store shape.
    // viaRoutePreAgg:false — export calls getFlexibleReport directly, so the Supabase pre-agg
    // short-circuit is NOT available to it; only engine-dispatched pipes are.
    // hasAttributionWindow:false — export passes no attribution_window (see above).
    // D0: tz/filtersPresent passed — a non-UTC or filtered flex-pipe shape can't dispatch a pipe and
    // would CSV dead-store zeros; deny it. attributeBy is conversion_date (export sets none).
    const gateReason = gatedReportReason({
      group_by, group_by2: req.query.group_by2 || null, metric, model,
      preAggConversionMetric: PREAGG_CONVERSION_METRICS.has(metric),
      preAggMultiTouchMetric: PREAGG_MULTITOUCH_METRICS.has(metric),
      viaRoutePreAgg: false,
      hasAttributionWindow: false,
      tz,
      filtersPresent: flexFiltersPresent(filters)
    })
    if (gateReason) {
      return res.status(422).json({ success: false, data: null, error: gateReason.message, error_code: gateReason.error_code, gated: true })
    }

    const results = await getFlexibleReport(posthogSiteId, model, date_from, date_to, group_by, metric, filters)

    if (!results || results.length === 0) {
      return res.status(200)
        .set('Content-Type', 'text/csv')
        .set('Content-Disposition', 'attachment; filename="report.csv"')
        .send('No data\n')
    }

    // Strip sensitive internal fields case-insensitively while preserving campaigns/ad/order ids
    const forbiddenKeys = new Set(['id', 'site_id', 'site_key', 'user_id', 'company_id', 'distinct_id', 'person_id'])
    const keys = Object.keys(results[0]).filter(k => !forbiddenKeys.has(k.toLowerCase()))

    const header = keys.join(',')
    const rows = results.map(r => keys.map(k => escapeCsv(r[k])).join(','))
    const csv = [header, ...rows].join('\n') + '\n'

    res.status(200)
      .set('Content-Type', 'text/csv')
      .set('Content-Disposition', `attachment; filename="attribution_report_${date_from}_to_${date_to}.csv"`)
      .send(csv)
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Export failed' })
  }
})

export { router as exportRouter }
