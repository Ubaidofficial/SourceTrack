import express from 'express'
import { getFlexibleReport } from '../lib/attribution-engine.js'
import { getSupabase } from '../lib/supabase.js'

const ALLOWED_DIMS = new Set(['source', 'medium', 'campaign', 'ai_source'])
const MAX_DAYS = 365

function fmtDate(date) {
  return date.toISOString().slice(0, 10)
}

function escapeCsv(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

async function getCampaignsData(req) {
  const posthogSiteId = String(req.site.id)

  const dimension = req.query.dimension || 'source'
  if (!ALLOWED_DIMS.has(dimension)) {
    throw new Error(`Invalid dimension. Must be one of: ${[...ALLOWED_DIMS].join(', ')}`)
  }

  const model = req.query.model || 'last_touch'
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), MAX_DAYS)
  const search = (req.query.search || '').trim().toLowerCase()
  const statusFilter = req.query.status || 'all'

  const today = new Date()
  const dateTo = fmtDate(today)
  const dateFrom = fmtDate(new Date(today - days * 86400000))
  const prevDateTo = fmtDate(new Date(today - 86400000))
  const prevDateFrom = fmtDate(new Date(today - (days + 1) * 86400000))

  const [currentRevenue, currentConversions, currentVisits, currentLeads, prevRevenue, spendData] = await Promise.all([
    getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'revenue', {}),
    getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'conversions', {}),
    getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'sessions', {}),
    getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'leads', {}),
    getFlexibleReport(posthogSiteId, model, prevDateFrom, prevDateTo, dimension, 'revenue', {}),
    getSupabase().from('campaign_costs').select('campaign_name, spend').eq('site_id', req.site.id).gte('period_start', dateFrom).lte('period_end', dateTo)
  ])

  const combined = {}

  const getOrInit = (name) => {
    const key = (name || 'unknown').trim()
    const lower = key.toLowerCase()
    if (!combined[lower]) {
      combined[lower] = {
        name: key, // preserve original casing first seen
        visits: 0,
        leads: 0,
        conversions: 0,
        revenue: 0,
        spend: 0
      }
    }
    return combined[lower]
  }

  ;(currentVisits || []).forEach(r => {
    const name = r.dim_value || 'unknown'
    getOrInit(name).visits += Number(r.sessions) || 0
  })

  ;(currentLeads || []).forEach(r => {
    const name = r.dim_value || 'unknown'
    getOrInit(name).leads += Number(r.leads) || 0
  })

  ;(currentConversions || []).forEach(r => {
    const name = r.dim_value || 'unknown'
    getOrInit(name).conversions += Number(r.conversions) || 0
  })

  ;(currentRevenue || []).forEach(r => {
    const name = r.dim_value || 'unknown'
    getOrInit(name).revenue += Number(r.revenue) || 0
  })

  for (const row of spendData?.data || []) {
    const name = row.campaign_name || 'unknown'
    getOrInit(name).spend += parseFloat(row.spend) || 0
  }

  const prevRevenueMap = {}
  for (const row of prevRevenue || []) {
    const key = (row.dim_value || 'unknown').trim().toLowerCase()
    prevRevenueMap[key] = (prevRevenueMap[key] || 0) + (Number(row.revenue) || 0)
  }

  let rows = Object.values(combined).map(item => {
    const name = item.name
    const visits = item.visits
    const leads = item.leads
    const conversions = item.conversions
    const revenue = item.revenue
    const spend = item.spend

    const avgValue = conversions > 0 ? revenue / conversions : 0
    const lower = name.toLowerCase()
    const prevRev = prevRevenueMap[lower] || 0
    const trend = prevRev > 0 ? ((revenue - prevRev) / prevRev) * 100 : null

    const roas = spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : null
    const cpl = spend > 0 && conversions > 0 ? parseFloat((spend / conversions).toFixed(2)) : null

    let status = 'none'
    if (conversions >= 10 || visits >= 100) {
      status = 'active'
    } else if (conversions >= 1 || visits >= 5) {
      status = 'low'
    }

    return { name, visits, leads, conversions, revenue, avg_value: avgValue, trend, status, spend, roas, cpl }
  })

  // Filtering
  if (search) {
    rows = rows.filter(r => r.name.toLowerCase().includes(search))
  }
  if (statusFilter === 'active') {
    rows = rows.filter(r => r.status === 'active')
  } else if (statusFilter === 'low') {
    rows = rows.filter(r => r.status === 'low')
  } else if (statusFilter === 'none') {
    rows = rows.filter(r => r.status === 'none')
  }

  // Sorting
  rows.sort((a, b) => b.revenue - a.revenue || b.conversions - a.conversions || b.visits - a.visits)

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalConversions = rows.reduce((s, r) => s + r.conversions, 0)
  const totalLeads = rows.reduce((s, r) => s + r.leads, 0)
  const totalVisits = rows.reduce((s, r) => s + r.visits, 0)
  const activeChannels = rows.filter(r => r.status === 'active').length
  const avgValue = totalConversions > 0 ? totalRevenue / totalConversions : 0
  const totalSpend = rows.reduce((s, r) => s + (r.spend || 0), 0)

  return {
    dimension,
    dateFrom,
    dateTo,
    days,
    kpis: {
      total_revenue: totalRevenue,
      total_conversions: totalConversions,
      total_leads: totalLeads,
      total_visits: totalVisits,
      active_channels: activeChannels,
      avg_value: avgValue,
      total_spend: totalSpend,
      avg_roas: (() => { const withRoas = rows.filter(r => r.roas !== null); return withRoas.length ? parseFloat((withRoas.reduce((s, r) => s + r.roas, 0) / withRoas.length).toFixed(2)) : null })()
    },
    rows
  }
}

async function overview(req, res) {
  try {
    const data = await getCampaignsData(req)
    res.status(200).json({
      success: true,
      data,
      error: null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, data: null, error: err.message || 'Campaign overview query failed' })
  }
}

async function exportCsv(req, res) {
  try {
    const { rows, dateFrom, dateTo } = await getCampaignsData(req)

    if (!rows || rows.length === 0) {
      res.status(200)
        .set('Content-Type', 'text/csv')
        .set('Content-Disposition', `attachment; filename="campaigns_report_${dateFrom}_to_${dateTo}.csv"`)
        .send('No data\n')
      return
    }

    const headers = ['Name', 'Status', 'Visits', 'Leads', 'Conversions', 'Revenue', 'Avg Value', 'Spend', 'CPL', 'Manual ROAS', 'Trend (%)']
    const csvRows = rows.map(r => [
      escapeCsv(r.name),
      escapeCsv(r.status),
      r.visits,
      r.leads,
      r.conversions,
      r.revenue.toFixed(2),
      r.avg_value.toFixed(2),
      r.spend.toFixed(2),
      r.cpl ? r.cpl.toFixed(2) : '—',
      r.roas ? r.roas.toFixed(2) : '—',
      r.trend !== null ? r.trend.toFixed(1) : '—'
    ].join(','))

    const csvContent = [headers.join(','), ...csvRows].join('\n') + '\n'

    res.status(200)
      .set('Content-Type', 'text/csv')
      .set('Content-Disposition', `attachment; filename="campaigns_report_${dateFrom}_to_${dateTo}.csv"`)
      .send(csvContent)
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, error: err.message || 'Campaigns export failed' })
  }
}

export const campaignsRouter = express.Router()
campaignsRouter.get('/overview', overview)
campaignsRouter.get('/export', exportCsv)
