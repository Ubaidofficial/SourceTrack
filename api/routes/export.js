import { Router } from 'express'
import { validateSiteKey } from '../middleware/auth.js'
import { getFlexibleReport } from '../lib/attribution-engine.js'

const router = Router()

function escapeCsv(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

router.get('/report', validateSiteKey, async (req, res) => {
  try {
    const { model, date_from, date_to, group_by, metric } = req.query
    const siteKey = req.query.site_key || req.body?.site_key

    if (!model || !date_from || !date_to || !group_by || !metric) {
      return res.status(400).json({ success: false, data: null, error: 'model, date_from, date_to, group_by, metric are required' })
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

    const results = await getFlexibleReport(siteKey, model, date_from, date_to, group_by, metric, filters)

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
