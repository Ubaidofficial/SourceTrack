import express from 'express'
import { getFlexibleReport, PREAGG_CONVERSION_METRICS, PREAGG_MULTITOUCH_METRICS } from '../lib/attribution-engine.js'
import { getSupabase } from '../lib/supabase.js'
import { ALLOWED_MODELS, servedByDeployedBackend, UNAVAILABLE_SUFFIX } from '../lib/report-config-validation.js'
import { summarizeCurrencyStatus } from '../lib/ad-cost-imports.js'
import { isValidTimezone, getLocalDateString, getNow } from '../lib/utils.js'

const ALLOWED_DIMS = new Set(['source', 'medium', 'campaign', 'ai_source'])
const MAX_DAYS = 365

// ROUTE-SCOPED model allowlist — deliberately NARROWER than ALLOWED_MODELS (all 9).
//
// WHY THIS ROUTE AND NOT THE SHARED SET: this route asks servedByDeployedBackend() per metric, which
// answers "does a live backend serve this shape?" — and for metric='sessions' on the 5 non-touch
// models it answers YES while the VALUE is fabricated. The multi-touch and ai_platforms LIVE readers
// (attribution-engine.js — `if (metric !== 'revenue' && metric !== 'conversions') item[metric] = …
// conversions`) emit the CONVERSION count, or a fractional sum of it, under the `sessions` key. So the
// Visitors column would render conversions as visitors: a §6 confident-wrong number on the money-
// adjacent rail, and one the allowlist cannot catch because a real allowlisted pipe does back the shape.
//
// ALLOWED_MODELS stays untouched — it is correct for the Report Builder, where gatedReportReason()
// (not servedByDeployedBackend) denies these shapes via GATED_METRICS. The gap is specific to the ONE
// route that both bypasses that denylist and accepts a caller-supplied model.
//
// Not currently reachable from the UI (Campaigns.jsx hardcodes model=last_touch and
// campaignDimensions.js narrows the tab bar to `campaign`), so this is a hardening fix, not a live-bug
// fix — but the API accepts ?model= from any direct caller, and API-key auth would make that a real
// surface. Fail closed at the edge instead of relying on the frontend to keep sending the safe value.
//
// To widen this: teach the live readers to count DISTINCT VISITORS for `sessions` first. Adding a model
// here without that reintroduces the fabrication.
const ROUTE_ALLOWED_MODELS = new Set(['first_touch', 'last_touch'])

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
  // `model` was FREE-FORM from the query and never validated — it reached getFlexibleReport raw.
  // Checked FIRST so an unknown model still answers "Invalid model" (a client bug), and only a
  // KNOWN-but-unsupported-here model falls to the route-scoped reason below.
  if (!ALLOWED_MODELS.has(model)) {
    const err = new Error(`Invalid model. Must be one of: ${[...ALLOWED_MODELS].join(', ')}`)
    err.statusCode = 400
    throw err
  }
  // See ROUTE_ALLOWED_MODELS above. This rejects the other SEVEN, for two different reasons:
  //   - 5 FABRICATE this route's Visitors column (sessions = a conversion count): the 4 multi-touch
  //     models reached 200 at dimension campaign/source/medium, ai_platforms at source/ai_source.
  //     servedByDeployedBackend() cannot detect it — a real allowlisted pipe backs the shape, the
  //     VALUE is what is wrong. Rejecting beats rendering an invented number (§6).
  //   - 2 (the *_non_direct pair) had NO backend at any dimension and were already denied 422
  //     gated_dead_store. They now answer 400 with an earlier, clearer reason. Intended, not a
  //     regression — the request was never servable here.
  if (!ROUTE_ALLOWED_MODELS.has(model)) {
    const err = new Error(`The "${model}" attribution model isn't supported on this page. Must be one of: ${[...ROUTE_ALLOWED_MODELS].join(', ')}.`)
    err.statusCode = 400
    throw err
  }
  // This route called getFlexibleReport with NO gate at all — the PR#4 blocker: an unserved shape
  // fell to the engine's bare queryHogQL. Gate it against the SERVED allowlist.
  //
  // Deliberately servedByDeployedBackend(), NOT gatedReportReason(): this route's own columns are
  // served by pipes that the legacy DENYLIST wrongly rejects. `sessions` is in GATED_METRICS (gated
  // wholesale for the Report Builder), yet flexible_report_campaign_sessions_by_site serves
  // campaign × sessions and powers this page's Visitors column today. The allowlist is the truth
  // about what a live backend serves; the denylist is a Report-Builder-shaped rule. Asking the
  // allowlist directly keeps the page working AND still guarantees no bare-queryHogQL read.
  // viaRoutePreAgg:false + hasAttributionWindow:false — campaigns calls the engine directly and
  // passes no attribution_window, so only the window-free engine pipes can serve it.
  // D0: tz is hoisted above the gate and passed in. Campaigns renders in the SITE timezone, and a
  // non-UTC tz breaks the flex-pipe base case (engine _flexBaseCommon) — so a non-UTC site would
  // dead-read dead-store zeros on this page. The gate must see tz to deny it truthfully.
  // (filtersPresent/attributeBy are inert here: campaigns applies no dim filters and always
  // conversion_date, so their defaults hold.)
  const tz = isValidTimezone(req.site?.timezone) ? req.site.timezone : 'UTC'
  for (const m of ['revenue', 'conversions', 'sessions', 'leads']) {
    const backing = servedByDeployedBackend({
      model, group_by: dimension, group_by2: null, metric: m,
      preAggConversionMetric: PREAGG_CONVERSION_METRICS.has(m),
      preAggMultiTouchMetric: PREAGG_MULTITOUCH_METRICS.has(m),
      viaRoutePreAgg: false,
      hasAttributionWindow: false,
      tz
    })
    if (!backing) {
      // Shared with gatedReportReason's messages — do NOT re-inline this sentence. Campaigns and
      // Report Builder must say the same thing about the same gate (KI-57).
      const err = new Error(`A "${dimension}" breakdown of "${m}" ${UNAVAILABLE_SUFFIX}`)
      err.statusCode = 422
      err.error_code = 'gated_dead_store'
      throw err
    }
  }
  const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), MAX_DAYS)
  const search = (req.query.search || '').trim().toLowerCase()
  const statusFilter = req.query.status || 'all'

  const now = getNow(req)
  const dateTo = getLocalDateString(now, tz)
  const dateFrom = getLocalDateString(new Date(now.getTime() - days * 86400000), tz)
  const prevDateTo = getLocalDateString(new Date(now.getTime() - 86400000), tz)
  const prevDateFrom = getLocalDateString(new Date(now.getTime() - (days + 1) * 86400000), tz)

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
    safeHogQL(() => getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'revenue', { timezone: tz })),
    safeHogQL(() => getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'conversions', { timezone: tz })),
    safeHogQL(() => getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'sessions', { timezone: tz })),
    safeHogQL(() => getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'leads', { timezone: tz })),
    getFlexibleRev(posthogSiteId, model, prevDateFrom, prevDateTo, dimension, tz),
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
      // §6: when the analytics legs failed, these are computed from EMPTY arrays — that is "no
      // data", not zero. Emitting 0 put literal 0 tiles beside the "temporarily unavailable"
      // banner, which is exactly the fake zero the rule exists to prevent. null means "unknown",
      // so every consumer renders an empty state instead of inventing a number.
      // `total_spend` is deliberately NOT nulled: it comes from the Supabase campaign_costs read,
      // which is independent of the Tinybird analytics legs and stays truthful when they fail.
      total_revenue: analyticsAvailable ? totalRevenue : null,
      total_conversions: analyticsAvailable ? totalConversions : null,
      total_leads: analyticsAvailable ? totalLeads : null,
      total_visits: analyticsAvailable ? totalVisits : null,
      active_channels: analyticsAvailable ? activeChannels : null,
      avg_value: analyticsAvailable ? avgValue : null,
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
async function getFlexibleRev(posthogSiteId, model, dateFrom, dateTo, dimension, tz) {
  try {
    return await getFlexibleReport(posthogSiteId, model, dateFrom, dateTo, dimension, 'revenue', { timezone: tz })
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
    // A GATE is not a failure: surface its own status + error_code so the frontend renders the calm
    // "temporarily unavailable" state (describeQueryError branches on error_code) instead of the
    // generic 500 "Please try again" — retrying a deny cannot help. The gate's message is authored
    // and safe to return; only UNEXPECTED errors get the generic text.
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        data: null,
        error: err.message,
        error_code: err.error_code || null
      })
    }
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
    // A GATE is not a failure: surface its own status + error_code (same as overview()) so a
    // dead-store shape returns a clean 422 "temporarily unavailable" instead of a raw 500 CSV error.
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        success: false,
        error: err.message,
        error_code: err.error_code || null
      })
    }
    res.status(500).json({ success: false, error: err.message || 'Campaigns export failed' })
  }
}

export const campaignsRouter = express.Router()
campaignsRouter.get('/overview', overview)
campaignsRouter.get('/export', exportCsv)
