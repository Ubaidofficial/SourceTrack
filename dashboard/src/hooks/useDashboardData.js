import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { useSite } from '../contexts/SiteContext'
import { hasFeature } from '../lib/planFeatures'
import { safeNumber } from '../utils/numbers'
import { limeAreaGradient } from '../utils/limeAreaGradient'
import { tooltipPlugin, CHART_COLORS } from '../utils/chartTooltip'
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
  const [timeRange, setTimeRange] = useState(30)
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

  const { data: analyticsSummary } = useQuery({
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
    refetchInterval: 30000,
  })
  const liveCount = liveData?.live_visitors ?? 0

  const { data: recentActivityQuery } = useQuery({
    queryKey: ['recent-activity', site?.site_key],
    queryFn: async () => {
      if (!site?.site_key) return null
      return fetchApi(`/dashboard/recent-activity?site_key=${encodeURIComponent(site.site_key)}`)
    },
    enabled: !!site?.site_key && !previewMode,
    refetchInterval: 30000,
  })
  const recentActivity = recentActivityQuery?.data ?? recentActivityQuery ?? null

  // Recent Conversions list. Same store (Supabase attributed_conversions) and same window
  // (days=timeRange) as the `totalConversions` header count from /dashboard/overview, so the
  // count and the list cannot disagree. Deliberately NOT recentActivity: that is a fixed
  // 30-MINUTE Tinybird live feed, which disagreed with a range-scoped header by construction.
  const { data: recentConversionsQuery } = useQuery({
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
  const activeResults = overview?.sources || []
  const topPagesResults = overview?.top_pages || []
  const timeResults = overview?.revenue_trend || []

  const models = overview?.models || {}
  const MULTI_TOUCH = new Set(['linear', 'time_decay', 'u_shaped', 'w_shaped'])
  const canMultiTouch = hasFeature(site?.plan, 'multi_touch_attribution')
  const modelRevenues = MODELS
    .filter(m => canMultiTouch || !MULTI_TOUCH.has(m.key))
    .map(m => ({ model: m.key, label: m.label, total: models[m.key] || 0 }))

  const revTrendData = {
    labels: timeResults.map(r => r.dim_value || ''),
    datasets: [{
      label: 'Revenue', data: timeResults.map(r => r.revenue || 0),
      borderColor: 'rgba(17, 24, 39, 1)', backgroundColor: limeAreaGradient,
      fill: true, tension: 0.3, pointRadius: 2,
      pointHoverRadius: 5, pointHoverBackgroundColor: CHART_COLORS.lime, pointHoverBorderColor: CHART_COLORS.lime
    }]
  }

  const channelTrendResults = overview?.channel_trend || []
  const channelTrendData = {
    labels: channelTrendResults.map(r => r.dim_value || ''),
    datasets: [{
      label: 'Conversions',
      data: channelTrendResults.map(r => r.conversions || 0),
      borderColor: 'rgba(17,24,39,0.85)',
      backgroundColor: limeAreaGradient,
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5, pointHoverBackgroundColor: CHART_COLORS.lime, pointHoverBorderColor: CHART_COLORS.lime,
      tension: 0.3,
      fill: true
    }]
  }

  const revTooltipRows = (i) => {
    const rev = timeResults[i]?.revenue
    return rev > 0 ? [{ label: 'Revenue', value: `$${safeNumber(rev, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, accent: true }] : []
  }
  const convTooltipRows = (i) => [
    { label: 'Conversions', value: safeNumber(channelTrendResults[i]?.conversions, 0).toLocaleString(), accent: true }
  ]

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
  const hasConversions = activeResults.length > 0
  const hasTraffic = previewMode
    ? hasConversions
    : (trafficPageviews > 0
        || topPagesResults.length > 0
        || safeNumber(overview?.kpis?.sessions, 0) > 0)

  return {
    // shell / identity
    user, site, siteLoading, navigate, previewMode, previewSiteName, previewSiteDomain,
    timeRange, setTimeRange, liveCount, freshnessLabel, handleExport,
    isLoading, isError, error, refetch,
    // raw data
    overview, analyticsSummary, recentActivity, recentConversions, dashboardReports,
    // derived
    kpis, totalRevenue, totalConversions, totalLeads, leadsTracked, totalCustomers,
    leadConvRate, customerConvRate, avgValue, revenueDelta, leadsDelta, customersDelta,
    aiRevResults, aiSourceRows, activeResults, topPagesResults, timeResults,
    models, modelRevenues, revTrendData, channelTrendResults, channelTrendData,
    revTooltipRows, convTooltipRows, chartOpts, hasRevenue, isGscConnected,
    trafficKpis, trafficVisitors, trafficPageviews, trafficSources, trafficTopPages,
    hasConversions, hasTraffic,
  }
}
