import { Router } from 'express'
import { getFlexibleReport } from '../lib/attribution-engine.js'
import { requireFeature } from '../lib/plan-features.js'
import { getSupabase as getSupabaseAdmin } from '../lib/supabase.js'

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

    const posthogSiteId = String(req.site.id)

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

    const results = await getFlexibleReport(posthogSiteId, model, date_from, date_to, group_by, metric, filters)

    if (!results || results.length === 0) {
      return res.status(200)
        .set('Content-Type', 'text/csv')
        .set('Content-Disposition', 'attachment; filename="report.csv"')
        .send('No data\n')
    }

    const keys = Object.keys(results[0])
    const header = keys.join(',')
    const rows = results.map(r => keys.map(k => escapeCsv(r[k])).join(','))
    const csv = [header, ...rows].join('\n') + '\n'

    res.status(200)
      .set('Content-Type', 'text/csv')
      .set('Content-Disposition', `attachment; filename="trackiq_report_${date_from}_to_${date_to}.csv"`)
      .send(csv)
  } catch (_err) {
    console.error(_err)
    return res.status(500).json({ success: false, data: null, error: 'Export failed' })
  }
})

export { router as exportRouter }
