import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { useSite } from '../contexts/SiteContext'
import { hasFeature } from '../lib/planFeatures'
import { LIVE_FEED_POLL_MS } from '../lib/liveFeed'
import { safeNumber } from '../utils/numbers'
import { limeAreaGradient } from '../utils/limeAreaGradient'
import { tooltipPlugin, CHART_COLORS } from '../utils/chartTooltip'
import { densifyDailySeries, countReadings, honestLineStyle, readingsCaption, hasEnoughPointsForChart, formatShortDay } from '../utils/chartHonesty'
import { deriveTrafficState } from '../lib/trafficState.js'
import { normalizeSource } from '../components/SourceIcon'

// Single source of truth for /dashboard AND /app/attribution. The two are separate routes
// (only one mounts at a time), so this is not deduping a double-fetch — it exists so the
// fetch + EVERY derived value is defined ONCE (the pages can't drift), and so cache reuse
// survives navigation. The React Query keys below are byte-identical to the pre-extraction
// Dashboard.jsx keys — changing any key would refetch on every route switch.

export const MODELS = [
  { key: 'first_touch',            label: 'First Touch' },
  { key: 'last_touch',             label: 'Last Touch' },
  { key: 'first_touch_non_direct', label: 'First Touch (Non-Direct)' },
  { key: 'last_touch_non_direct',  label: 'Last Touch (Non-Direct)' },
  { key: 'linear',                 label: 'Linear' },
  { key: 'time_decay',             label: 'Time Decay' },
  { key: 'u_shaped',               label: 'U-Shaped' },
  { key: 'w_shaped',               label: 'W-Shaped' },
  { key: 'ai_platforms',           label: 'AI journey influence' },
]

export const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 }
]

// Selected time range survives a refresh. ONE key, shared with Analytics, so a
// range picked on either surface carries over to the other.
//
// Each caller passes the ranges IT can actually render, because the two surfaces
// don't offer the same set: TIME_RANGES above is 1/7/30, while Analytics also
// offers 90. Validating against a hardcoded [1,7,30,90] here would let a stored
// 90 through to FilterBar, whose `isActive = activeDate === d.key` would then
// match no button — the picker would show nothing selected while the header read
// "Last 90 days". A control that doesn't say what it's showing is worse than
// losing the selection, so an unrenderable stored value falls back to 30.
export const TIME_RANGE_STORAGE_KEY = 'st_time_range'

export function readStoredTimeRange(allowedDays) {
  try {
    const parsed = Number(localStorage.getItem(TIME_RANGE_STORAGE_KEY))
    return allowedDays.includes(parsed) ? parsed : 30
  } catch {
    // localStorage throws, not just returns null, in Safari private mode and
    // when storage is full. This runs in a useState initializer, so an
    // uncaught throw white-screens the whole page instead of losing a preference.
    return 30
  }
}

// Persisted from the setter rather than a useEffect on the value: an effect also
// fires on mount, so landing on Dashboard with a stored 90 would immediately
// overwrite it with the clamped 30 and destroy a preference Analytics can still
// render. Only a real user selection writes.
export function persistTimeRange(days) {
  try {
    localStorage.setItem(TIME_RANGE_STORAGE_KEY, String(days))
  } catch { /* preference is best-effort; never break the page over it */ }
}

function formatDeltaVal(current, previous) {
  if (!previous || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  return { pct, up: pct >= 0 }
}

function useFreshnessLabel(ts) {
  const [label, setLabel] = useState('just now')
  useEffect(() => {
    const tick = () => {
      const secs = Math.floor((Date.now() - ts.getTime()) / 1000)
      if (secs < 10) setLabel('just now')
      else if (secs < 60) setLabel(`${secs}s ago`)
      else setLabel(`${Math.floor(secs / 60)}m ago`)
    }
    tick()
    const id = setInterval(tick, 5000)
    return () => clearInterval(id)
  }, [ts])
  return label
}

export function useDashboardData() {
  const { user } = useAuth()
  const { activeSite, loading: siteLoading } = useSite()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  // Validated against TIME_RANGES — the only ranges this surface's picker renders.
  const [timeRange, setTimeRangeState] = useState(() => readStoredTimeRange(TIME_RANGES.map(tr => tr.days)))
  const setTimeRange = (days) => {
    setTimeRangeState(days)
    persistTimeRange(days)
  }
  const [previewMode, setPreviewMode] = useState(false)
  const [previewSiteName, setPreviewSiteName] = useState('')
  const [previewSiteDomain, setPreviewSiteDomain] = useState('')
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const freshnessLabel = useFreshnessLabel(lastRefresh)

  useEffect(() => {
    // Check for support-mode preview context
    const previewRaw = sessionStorage.getItem('sourcetrack_admin_preview')
    if (previewRaw) {
      try {
        const preview = JSON.parse(previewRaw)
        setPreviewMode(true)
        setPreviewSiteName(preview.site_name || '')
        setPreviewSiteDomain(preview.site_domain || '')
        setSite({ site_key: preview.site_key, name: preview.site_name, domain: preview.site_domain })
        return
      } catch { /* corrupt preview data */ }
    }
    if (activeSite) setSite(activeSite)
    else setSite(null)
  }, [user, activeSite])

  const { data: overview, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard-overview', site?.site_key, timeRange, previewMode],
    queryFn: async () => {
      if (!site?.site_key) return null
      if (previewMode) return fetchApi(`/admin/preview/${encodeURIComponent(site.site_key)}`)
      const params = new URLSearchParams({ site_key: site.site_key, days: String(timeRange) })
      return fetchApi(`/dashboard/overview?${params}`)
    },
    enabled: !!site?.site_key
  })

  const { data: dashboardReports = [] } = useQuery({
    queryKey: ['dashboard-widgets', site?.site_key],
    queryFn: async () => {
      if (!site?.site_key) return []
      if (!hasFeature(site?.plan, 'dashboard_widgets')) return []
      return fetchApi(`/reports/saved?site_key=${encodeURIComponent(site.site_key)}&show_on_dashboard=true`)
    },
    enabled: !!site?.site_key && !previewMode && hasFeature(site?.plan, 'dashboard_widgets')
  })

  // isError is captured, NOT just data. Destructuring `data` alone was the #278/#413 bug: a
  // failed traffic read produced `undefined`, every derived count fell to 0, and the Dashboard
  // told a customer with real traffic to go install the tracker. See lib/trafficState.js.
  const {
    data: analyticsSummary,
    isError: summaryIsError,
    error: summaryError,
    refetch: refetchSummary
  } = useQuery({
    queryKey: ['dashboard-traffic-summary', site?.site_key, timeRange],
    queryFn: async () => {
      if (!site?.site_key) return null
      return fetchApi(`/analytics/summary?site_key=${encodeURIComponent(site.site_key)}&days=${timeRange}`)
    },
    enabled: !!site?.site_key && !previewMode
  })

  const { data: liveData } = useQuery({
    queryKey: ['live-visitors', site?.site_key],
    queryFn: async () => {
      if (!site?.site_key) return { live_visitors: 0 }
      return fetchApi(`/live?site_key=${encodeURIComponent(site.site_key)}`)
    },
    enabled: !!site?.site_key && !previewMode,
    refetchInterval: LIVE_FEED_POLL_MS,
  })
  const liveCount = liveData?.live_visitors ?? 0

  // Recent Conversions list. Same store (Supabase attributed_conversions) and same window
  // (days=timeRange) as the `totalConversions` header count from /dashboard/overview, so the
  // count and the list cannot disagree. Deliberately NOT /dashboard/recent-activity: that is a
  // fixed 30-MINUTE Tinybird live feed, which disagreed with a range-scoped header by
  // construction. #368 repointed both panels here, which left the recent-activity query polling
  // every 30s with no consumer — removed.
  // Same treatment as the summary read above: an empty list and a failed fetch are different
  // facts, and the card must not render "No conversions in the recent window" for the latter.
  const {
    data: recentConversionsQuery,
    isError: recentConversionsIsError,
    refetch: refetchRecentConversions
  } = useQuery({
    queryKey: ['recent-conversions', site?.site_key, timeRange],
    queryFn: async () => {
      if (!site?.site_key) return null
      return fetchApi(`/analytics/recent-conversions?site_key=${encodeURIComponent(site.site_key)}&days=${timeRange}`)
    },
    enabled: !!site?.site_key && !previewMode,
  })
  const recentConversions = recentConversionsQuery?.data ?? null

  useEffect(() => {
    if (overview) setLastRefresh(new Date())
  }, [overview])

  const kpis = overview?.kpis || {}
  const totalRevenue = kpis.revenue || 0
  const totalConversions = kpis.conversions || 0
  const totalLeads = kpis.leads || 0
  // Whether this site tracks lead-type conversions at all. Separates a REAL 0 (lead events exist,
  // none converted in range) from "no data" (purchase-only site). Defaults TRUE when the API has
  // not answered yet, so a tile never flashes an empty state while loading; the §6 empty state is
  // only shown once the server has explicitly said this site tracks no leads.
  const leadsTracked = kpis.leads_tracked !== false
  const totalCustomers = kpis.customers || 0
  const leadConvRate = kpis.lead_conversion_rate || 0
  const customerConvRate = kpis.customer_conversion_rate || 0
  const avgValue = kpis.avg_value || 0

  const revenueDelta = formatDeltaVal(kpis.revenue, kpis.revenue_prev)
  const leadsDelta = formatDeltaVal(kpis.leads, kpis.leads_prev)
  const customersDelta = formatDeltaVal(kpis.customers, kpis.customers_prev)

  const aiRevResults = overview?.ai_sources || []

  // AI Source Performance = AI TRAFFIC (analytics summary, the verified sources_ai path)
  // MERGED with AI CONVERSIONS (overview attributed_conversions). Derived once here so
  // /dashboard and /app/attribution render the SAME rows (no local recompute -> no drift).
  const aiSourceRows = (() => {
    const aiTraffic = analyticsSummary?.ai_sources || []   // [{ source, visits }]
    const keyOf = (s) => normalizeSource(s || '').name || String(s || '').trim() || 'Unknown'
    const map = {}
    const bucket = (k) => (map[k] = map[k] || { name: k, visitors: 0, conversions: 0, revenue: 0 })
    for (const t of aiTraffic) bucket(keyOf(t.source)).visitors += safeNumber(t.visits, 0)
    for (const c of aiRevResults) {
      const b = bucket(keyOf(c.dim_value || c.source))
      b.conversions += safeNumber(c.ai_conversions ?? c.ai_leads, 0)
      b.revenue += safeNumber(c.ai_revenue, 0)
    }
    return Object.values(map).sort((a, b) => (b.visitors - a.visitors) || (b.revenue - a.revenue))
  })()
  // Set by /dashboard/overview's outer catch when the read genuinely failed. Previously
  // set and read NOWHERE, so a failure rendered as zeros — the #413 shape. Surfaced here
  // so pages can show 'temporarily unavailable' instead of a fabricated empty state (§6).
  const analyticsUnavailable = overview?.analytics_unavailable === true
  const activeResults = overview?.sources || []
  const topPagesResults = overview?.top_pages || []
  const timeResults = overview?.revenue_trend || []

  const models = overview?.models || {}
  const MULTI_TOUCH = new Set(['linear', 'time_decay', 'u_shaped', 'w_shaped'])
  const canMultiTouch = hasFeature(site?.plan, 'multi_touch_attribution')
  const modelRevenues = MODELS
    .filter(m => canMultiTouch || !MULTI_TOUCH.has(m.key))
    .map(m => ({ model: m.key, label: m.label, total: models[m.key] || 0 }))

  const channelTrendResults = overview?.channel_trend || []

  // §9.2 x-axis honesty, applied to BOTH trend series here so /dashboard and
  // /app/attribution cannot drift.
  //
  // revenue_trend and channel_trend carry only the dates that actually had rows —
  // api/routes/dashboard.js:325-326 build them from a keyed map with no zero-fill. On a
  // Chart.js CATEGORY axis, slots are spaced by array index, so conversions on the 1st,
  // 9th and 27th drew as three evenly spaced points: a fabricated timeline, and a worse
  // lie than the smoothing §9.2 names. densifyDailySeries gives every calendar day in
  // between its own slot so horizontal distance is elapsed time again. Gap days hold
  // null, never 0 — §9.2: "Days with no reading are not zero."
  const revTrend = densifyDailySeries(
    timeResults.map(r => r.dim_value || ''),
    [timeResults.map(r => safeNumber(r.revenue, 0))]
  )
  const revTrendValues = revTrend.series[0] || []
  // Tier on REAL readings, never on labels.length — densifying inflates the slot count,
  // and a tier read off the axis would grant smoothing to a 2-reading series.
  const revTrendReadings = countReadings(revTrendValues)
  const revTrendCaption = readingsCaption(revTrend.labels, revTrendValues)

  const revTrendData = {
    labels: revTrend.labels,
    datasets: [{
      label: 'Revenue', data: revTrendValues,
      borderColor: 'rgba(17, 24, 39, 1)', backgroundColor: limeAreaGradient,
      pointHoverBackgroundColor: CHART_COLORS.lime, pointHoverBorderColor: CHART_COLORS.lime,
      ...honestLineStyle(revTrendReadings, { fill: true, tension: 0.3, pointRadius: 2, pointHoverRadius: 5 })
    }]
  }

  const convTrend = densifyDailySeries(
    channelTrendResults.map(r => r.dim_value || ''),
    [channelTrendResults.map(r => safeNumber(r.conversions, 0))]
  )
  const convTrendValues = convTrend.series[0] || []
  const convTrendReadings = countReadings(convTrendValues)
  const convTrendCaption = readingsCaption(convTrend.labels, convTrendValues)

  const channelTrendData = {
    labels: convTrend.labels,
    datasets: [{
      label: 'Conversions',
      data: convTrendValues,
      borderColor: 'rgba(17,24,39,0.85)',
      backgroundColor: limeAreaGradient,
      borderWidth: 2,
      pointHoverBackgroundColor: CHART_COLORS.lime, pointHoverBorderColor: CHART_COLORS.lime,
      ...honestLineStyle(convTrendReadings, { fill: true, tension: 0.3, pointRadius: 3, pointHoverRadius: 5 })
    }]
  }

  // Tooltips read the DENSE arrays, not the raw results — after densifying, a Chart.js
  // dataIndex addresses a calendar day, and indexing timeResults/channelTrendResults with
  // it would report the wrong day's number.
  const revTooltipRows = (i) => {
    const rev = revTrendValues[i]
    return rev > 0 ? [{ label: 'Revenue', value: `$${safeNumber(rev, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, accent: true }] : []
  }
  const convTooltipRows = (i) => {
    const conv = convTrendValues[i]
    // A gap day has no reading, so it gets no tooltip. Returning a row here would have
    // the chart assert "0 conversions" on a day it simply has no data for (§9.2/§6).
    if (conv == null) return []
    return [{ label: 'Conversions', value: safeNumber(conv, 0).toLocaleString(), accent: true }]
  }

  // Under 3 readings §9.2 forbids a chart entirely and asks for the numbers instead, so
  // the readings themselves are derived here — same place as everything else the two
  // pages share, so neither can invent its own version of "too sparse to plot".
  const readingRows = (labels, values, fmt) => labels
    .map((l, i) => (values[i] == null ? null : { label: formatShortDay(l), value: fmt(values[i]) }))
    .filter(Boolean)

  const revTrendReadingRows = readingRows(revTrend.labels, revTrendValues,
    v => `$${safeNumber(v, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
  const convTrendReadingRows = readingRows(convTrend.labels, convTrendValues,
    v => safeNumber(v, 0).toLocaleString())

  const revTrendPlottable = hasEnoughPointsForChart(revTrendReadings)
  const convTrendPlottable = hasEnoughPointsForChart(convTrendReadings)

  const chartOpts = (prefix = '$', getRows = revTooltipRows) => {
    const isDark = document.documentElement.classList.contains('dark')
    const gridColor = isDark ? CHART_COLORS.grid.dark : CHART_COLORS.grid.light
    const tickColor = isDark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: tooltipPlugin(getRows) },
      scales: {
        y: { beginAtZero: true, ticks: { color: tickColor, callback: (v) => `${prefix}${v}`, maxTicksLimit: 5 }, grid: { color: gridColor } },
        x: { ticks: { color: tickColor, maxTicksLimit: 8 }, grid: { display: false } }
      }
    }
  }

  const handleExport = () => {
    if (!site) return
    const params = new URLSearchParams({
      site_key: site.site_key, model: 'first_touch',
      date_from: overview?.date_from || format(subDays(new Date(), timeRange), 'yyyy-MM-dd'),
      date_to: overview?.date_to || format(new Date(), 'yyyy-MM-dd'),
      group_by: 'source', metric: 'revenue'
    })
    window.open(`/api/export/report?${params}`, '_blank')
  }

  const hasRevenue = totalRevenue > 0
  const isGscConnected = site?.gsc_connected || overview?.gsc_connected || false

  const trafficKpis      = analyticsSummary?.kpis || {}
  const trafficVisitors  = safeNumber(trafficKpis.unique_visitors, 0)
  const trafficPageviews = safeNumber(trafficKpis.pageviews, 0)
  const trafficSources   = analyticsSummary?.top_sources || []
  const trafficTopPages  = analyticsSummary?.top_pages || []
  // Conversion EXISTENCE comes from the conversion COUNT, never from the attribution
  // breakdown's length. A site can have real conversions with no attributable touches
  // (NULL first/last touch), which left activeResults empty and told the user to go
  // configure conversions they had already recorded.
  const hasConversions = totalConversions > 0 || activeResults.length > 0
  // hasTraffic keeps its exact previous meaning (positive proof only) so AttributionPage and the
  // cold-start feed gate are unchanged. What is NEW is that a failed read no longer masquerades
  // as proven absence — trafficUnavailable and showEmptyState carry that distinction.
  const { hasTraffic, trafficUnavailable, showEmptyState } = deriveTrafficState({
    previewMode,
    summaryFailed: summaryIsError,
    trafficPageviews,
    topPagesCount: topPagesResults.length,
    sessions: safeNumber(overview?.kpis?.sessions, 0),
    hasConversions
  })

  // "Tracking setup incomplete / No events received yet" banner (Dashboard + Attribution).
  // Derived HERE so the two pages cannot drift. NEITHER flag proves the absence of events:
  // last_seen_at is stamped ONLY by the live ingestion path (track.js / conversion.js /
  // analytics.js), so a site whose rows arrived any other way keeps it NULL forever, and
  // onboarding_completed stays false on a site that tracks fine but never finished the wizard.
  // Either one alone claimed "No events received yet" over a site with conversions in range.
  // §6: the DATA decides what the banner may claim, so require no traffic AND no conversions.
  const setupIncomplete = !!site
    && (!site.last_seen_at || site.onboarding_completed === false)
    && !hasTraffic && !hasConversions

  return {
    // shell / identity
    user, site, siteLoading, navigate, previewMode, previewSiteName, previewSiteDomain,
    timeRange, setTimeRange, liveCount, freshnessLabel, handleExport,
    isLoading, isError, error, refetch,
    // raw data
    overview, analyticsSummary, recentConversions, dashboardReports,
    // derived
    kpis, totalRevenue, totalConversions, totalLeads, leadsTracked, totalCustomers, analyticsUnavailable,
    leadConvRate, customerConvRate, avgValue, revenueDelta, leadsDelta, customersDelta,
    aiRevResults, aiSourceRows, activeResults, topPagesResults, timeResults,
    models, modelRevenues, revTrendData, channelTrendResults, channelTrendData,
    revTooltipRows, convTooltipRows, chartOpts, hasRevenue, isGscConnected,
    // §9.2 trend honesty — reading counts, captions and the under-3 fallback rows.
    revTrendReadings, convTrendReadings, revTrendCaption, convTrendCaption,
    revTrendReadingRows, convTrendReadingRows, revTrendPlottable, convTrendPlottable,
    trafficKpis, trafficVisitors, trafficPageviews, trafficSources, trafficTopPages,
    hasConversions, hasTraffic, setupIncomplete,
    // Read-failure surfaces. An empty result and a failed fetch are different facts;
    // pages must render the error BEFORE any empty state (queryError.js).
    trafficUnavailable, showEmptyState, summaryIsError, summaryError,
    recentConversionsIsError, refetchSummary, refetchRecentConversions,
  }
}
