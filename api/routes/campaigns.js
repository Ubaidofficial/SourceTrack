import express from 'express'
import { getFlexibleReport } from '../lib/attribution-engine.js'

const ALLOWED_DIMS = new Set(['source', 'medium', 'campaign', 'ai_source'])
const MAX_DAYS = 365

function fmtDate(date) {
  return date.toISOString().slice(0, 10)
}

function statusFor(conversions) {
  if (conversions >= 10) return 'active'
  if (conversions >= 1) return 'low'
  return 'none'
}

async function overview(req, res) {
  try {
    const posthogSiteId = String(req.site.id)

    const dimension = req.query.dimension || 'source'
    if (!ALLOWED_DIMS.has(dimension)) {
      return res.status(400).json({ success: false, data: null, error: `Invalid dimension. Must be one of: ${[...ALLOWED_DIMS].join(', ')}` })
    }

    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), MAX_DAYS)
    const search = (req.query.search || '').trim().toLowerCase()
    const statusFilter = req.query.status || 'all'

    const today = new Date()
    const dateTo = fmtDate(today)
    const dateFrom = fmtDate(new Date(today - days * 86400000))
    const prevDateTo = fmtDate(new Date(today - 86400000))
    const prevDateFrom = fmtDate(new Date(today - (days + 1) * 86400000))

    const [currentRevenue, currentConversions, prevRevenue] = await Promise.all([
      getFlexibleReport(posthogSiteId, 'last_touch', dateFrom, dateTo, dimension, 'revenue', {}),
      getFlexibleReport(posthogSiteId, 'last_touch', dateFrom, dateTo, dimension, 'conversions', {}),
      getFlexibleReport(posthogSiteId, 'last_touch', prevDateFrom, prevDateTo, dimension, 'revenue', {})
    ])

    const conversionsMap = {}
    for (const row of currentConversions) {
      const key = row.dim_value || 'unknown'
      conversionsMap[key] = Number(row.conversions) || 0
    }

    const prevRevenueMap = {}
    for (const row of prevRevenue) {
      const key = row.dim_value || 'unknown'
      prevRevenueMap[key] = Number(row.revenue) || 0
    }

    let rows = currentRevenue.map(row => {
      const name = row.dim_value || 'unknown'
      const revenue = Number(row.revenue) || 0
      const conversions = conversionsMap[name] || 0
      const avgValue = conversions > 0 ? revenue / conversions : 0
      const prevRev = prevRevenueMap[name] || 0
      const trend = prevRev > 0 ? ((revenue - prevRev) / prevRev) * 100 : null

      return { name, revenue, conversions, avg_value: avgValue, trend, status: statusFor(conversions) }
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

    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
    const totalConversions = rows.reduce((s, r) => s + r.conversions, 0)
    const activeChannels = rows.filter(r => r.status === 'active').length
    const avgValue = totalConversions > 0 ? totalRevenue / totalConversions : 0

    res.status(200).json({
      success: true,
      data: {
        dimension,
        date_from: dateFrom,
        date_to: dateTo,
        days,
        kpis: {
          total_revenue: totalRevenue,
          total_conversions: totalConversions,
          active_channels: activeChannels,
          avg_value: avgValue
        },
        rows
      },
      error: null
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, data: null, error: 'Campaign overview query failed' })
  }
}

export const campaignsRouter = express.Router()
campaignsRouter.get('/overview', overview)
