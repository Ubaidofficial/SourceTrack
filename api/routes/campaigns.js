import express from 'express'
import { getFlexibleReport } from '../lib/attribution-engine.js'
import { getSupabase } from '../lib/supabase.js'
import { summarizeCurrencyStatus } from '../lib/ad-cost-imports.js'
import { isValidTimezone, getLocalDateString } from '../lib/utils.js'

const ALLOWED_DIMS = new Set(['source', 'medium', 'campaign', 'ai_source'])
const MAX_DAYS = 365

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

  const dimension = req.query.dimension || 'campaign'
  if (!ALLOWED_DIMS.has(dimension)) {
    throw new Error(`Invalid dimension. Must be one of: ${[...ALLOWED_DIMS].join(', ')}`)
  }

  const model = req.query.model || 'last_touch'
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), MAX_DAYS)
  const search = (req.query.search || '').trim().toLowerCase()
  const statusFilter = req.query.status || 'all'

  const tz = isValidTimezone(req.site?.timezone) ? req.site.timezone : 'UTC'
  const dateTo = getLocalDateString(new Date(), tz)
  const dateFrom = getLocalDateString(new Date(Date.now() - days * 86400000), tz)
  const prevDateTo = getLocalDateString(new Date(Date.now() - 86400000), tz)
  const prevDateFrom = getLocalDateString(new Date(Date.now() - (days + 1) * 86400000), tz)

  const supabase = getSupabase()

  // 1. Detect site's tracked revenue currency from recent ingestion success events
  const { data: revEvents } = await supabase
    .from('revenue_ingestion_events')
    .select('currency')
    .eq('site_key', req.site.site_key)
    .eq('status', 'success')
    .limit(100)

  const revCurrencies = [...new Set(revEvents?.map(e => e.currency?.toUpperCase()).filter(Boolean) || [])]
  const trackedCurrency = revCurrencies.length === 1 ? revCurrencies[0] : (revCurrencies.length > 1 ? 'MIXED' : 'USD')

  // 2. Fetch PostHog analytics (isolated per-query) and Supabase cost data in parallel
  //    Each HogQL call is wrapped so a single 502 doesn't kill the whole response.
  const safeHogQL = async (fn) => {
    try { return await fn() } catch (err) {
      console.warn('[campaigns] HogQL query failed (graceful):', err.message?.slice(0, 200))
      return null // null = failed
    }
  }

  const [
    revenueResult, conversionsResult, visitsResult, leadsResult, prevRevenueResult, spendData
  ] = await Promise.all([
    safeHogQL(() => getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'revenue', {})),
    safeHogQL(() => getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'conversions', {})),
    safeHogQL(() => getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'sessions', {})),
    safeHogQL(() => getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'leads', {})),
    getFlexibleRev(posthogSiteId, model, prevDateFrom, prevDateTo, dimension),
    supabase
      .from('campaign_costs')
      .select('campaign_name, spend, clicks, impressions, currency, platform, campaign_id')
      .eq('site_id', req.site.id)
      .gte('period_start', dateFrom)
      .lte('period_end', dateTo)
  ])

  const currentRevenue = revenueResult || []
  const currentConversions = conversionsResult || []
  const currentVisits = visitsResult || []
  const currentLeads = leadsResult || []
  const prevRevenue = prevRevenueResult || []
  const analyticsAvailable = revenueResult !== null && conversionsResult !== null && visitsResult !== null && leadsResult !== null

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
        spend: 0,
        clicks: 0,
        impressions: 0
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

  // Map spend data to calculate aggregates
  const spendByCampaignName = {}
  for (const row of spendData?.data || []) {
    const name = (row.campaign_name || 'unknown').trim().toLowerCase()
    if (!spendByCampaignName[name]) {
      spendByCampaignName[name] = []
    }
    spendByCampaignName[name].push(row)

    const item = getOrInit(row.campaign_name)
    item.spend += parseFloat(row.spend) || 0
    item.clicks += parseInt(row.clicks, 10) || 0
    item.impressions += parseInt(row.impressions, 10) || 0
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
    const clicks = item.clicks
    const impressions = item.impressions

    const avgValue = conversions > 0 ? revenue / conversions : 0
    const lower = name.toLowerCase()
    const prevRev = prevRevenueMap[lower] || 0
    const trend = prevRev > 0 ? ((revenue - prevRev) / prevRev) * 100 : null

    // Determine currency status for this campaign's spend rows
    const campaignSpends = spendByCampaignName[lower] || []
    const currencySummary = summarizeCurrencyStatus(campaignSpends, trackedCurrency)

    let roas = null
    let cpl = null
    let cpc = null
    let ctr = null

    if (currencySummary.status === 'ok') {
      roas = spend > 0 ? parseFloat((revenue / spend).toFixed(2)) : null
      cpl = spend > 0 && conversions > 0 ? parseFloat((spend / conversions).toFixed(2)) : null
    }

    cpc = spend > 0 && clicks > 0 ? parseFloat((spend / clicks).toFixed(2)) : null
    ctr = impressions > 0 ? parseFloat(((clicks / impressions) * 100).toFixed(2)) : null

    let status = 'none'
    if (conversions >= 10 || visits >= 100) {
      status = 'active'
    } else if (conversions >= 1 || visits >= 5) {
      status = 'low'
    }

    return {
      name,
      visits,
      leads,
      conversions,
      revenue,
      avg_value: avgValue,
      trend,
      status,
      spend,
      clicks,
      impressions,
      roas,
      cpl,
      cpc,
      ctr,
      spend_currency: currencySummary.spendCurrency,
      tracked_currency: trackedCurrency,
      currency_status: currencySummary.status,
      platforms: [...new Set(campaignSpends.map(s => s.platform).filter(Boolean))]
    }
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

  // Overall Currency logic
  const overallCurrencySummary = summarizeCurrencyStatus(spendData?.data || [], trackedCurrency)

  return {
    dimension,
    dateFrom,
    dateTo,
    days,
    analytics_available: analyticsAvailable,
    ...(analyticsAvailable ? {} : {
      warning: {
        type: 'analytics_unavailable',
        message: 'Campaign analytics are temporarily unavailable.'
      }
    }),
    kpis: {
      total_revenue: totalRevenue,
      total_conversions: totalConversions,
      total_leads: totalLeads,
      total_visits: totalVisits,
      active_channels: activeChannels,
      avg_value: avgValue,
      total_spend: totalSpend,
      avg_roas: (() => {
        if (overallCurrencySummary.status !== 'ok') return null
        const withRoas = rows.filter(r => r.roas !== null)
        return withRoas.length ? parseFloat((withRoas.reduce((s, r) => s + r.roas, 0) / withRoas.length).toFixed(2)) : null
      })(),
      spend_currency: overallCurrencySummary.spendCurrency,
      tracked_currency: trackedCurrency,
      currency_status: overallCurrencySummary.status
    },
    rows
  }
}

// Resilient wrapper for prior period revenue check
async function getFlexibleRev(posthogSiteId, model, dateFrom, dateTo, dimension) {
  try {
    return await getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'revenue', {})
  } catch (err) {
    console.warn('[campaigns] prior period revenue fetch failed:', err.message)
    return []
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
    // Log concise error server-side only, never leak raw provider text to frontend
    const safeLog = (err.message || '').slice(0, 300)
    console.error('[campaigns] overview failed:', safeLog)
    res.status(500).json({
      success: false,
      data: null,
      error: 'Campaign data is temporarily unavailable. Please try again.'
    })
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

    const headers = ['Name', 'Status', 'Visits', 'Leads', 'Conversions', 'Revenue', 'Avg Value', 'Spend', 'Clicks', 'Impressions', 'CTR (%)', 'CPC', 'CPL', 'ROAS', 'Currency']
    const csvRows = rows.map(r => [
      escapeCsv(r.name),
      escapeCsv(r.status),
      r.visits,
      r.leads,
      r.conversions,
      r.revenue.toFixed(2),
      r.avg_value.toFixed(2),
      r.spend.toFixed(2),
      r.clicks,
      r.impressions,
      r.ctr !== null ? r.ctr.toFixed(2) : '—',
      r.cpc !== null ? r.cpc.toFixed(2) : '—',
      r.cpl !== null ? r.cpl.toFixed(2) : '—',
      r.roas !== null ? r.roas.toFixed(2) : '—',
      escapeCsv(r.spend_currency)
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
