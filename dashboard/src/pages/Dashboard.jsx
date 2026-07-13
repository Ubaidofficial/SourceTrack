import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { useSite } from '../contexts/SiteContext'
import { Line } from 'react-chartjs-2'
import { hasFeature } from '../lib/planFeatures'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import {
  Users, ArrowRight, RefreshCw, Zap, AlertTriangle
} from 'lucide-react'
import MetricTile from '../components/MetricTile'
import DashboardCard from '../components/DashboardCard'
import DashboardTable from '../components/DashboardTable'
import EmptyState from '../components/EmptyState'
import QueryError from '../components/QueryError'
import FilterBar from '../components/FilterBar'

import ConversionExplanationModal from '../components/ConversionExplanationModal'
import JourneyModal from '../components/JourneyModal'
import { DirectInfo, isDirectLabel } from '../components/DirectInfo'
import { SourceIcon, SourceChip } from '../components/SourceIcon'
import { safeNumber } from '../utils/numbers'
import { limeAreaGradient } from '../utils/limeAreaGradient'
import { tooltipPlugin, CHART_COLORS } from '../utils/chartTooltip'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

const MODELS = [
  { key: 'first_touch',            label: 'First Touch' },
  { key: 'last_touch',             label: 'Last Touch' },
  { key: 'first_touch_non_direct', label: 'First Touch (Non-Direct)' },
  { key: 'last_touch_non_direct',  label: 'Last Touch (Non-Direct)' },
  { key: 'linear',                 label: 'Linear' },
  { key: 'time_decay',             label: 'Time Decay' },
  { key: 'u_shaped',               label: 'U-Shaped' },
  { key: 'w_shaped',               label: 'W-Shaped' },
  // Label matches ReportBuilder.jsx and reflects the engine's actual scope:
  // we credit the most recent AI touchpoint in the visitor journey before conversion.
  { key: 'ai_platforms',           label: 'AI journey influence' },
]

const METRIC_DEFS = {
  revenue: { label: 'Revenue', format: (v) => `$${v.toFixed(2)}` },
  conversions: { label: 'Conversions', format: (v) => v.toLocaleString() },
  sessions: { label: 'Sessions', format: (v) => v.toLocaleString() },
  leads: { label: 'Leads', format: (v) => v.toLocaleString() },
  conversion_rate: { label: 'Conversion Rate', format: (v) => `${v.toFixed(1)}%` },
  avg_conversion_value: { label: 'Avg Value', format: (v) => `$${v.toFixed(2)}` },
  ai_conversions: { label: 'AI Conversions', format: (v) => v.toLocaleString() },
  ai_revenue: { label: 'AI Revenue', format: (v) => `$${v.toFixed(2)}` },
  ai_conversion_share: { label: 'AI Conv Share', format: (v) => `${v.toFixed(1)}%` },
  ai_revenue_share: { label: 'AI Rev Share', format: (v) => `${v.toFixed(1)}%` },
  ltv_revenue: { label: 'LTV Revenue', format: (v) => `$${v.toFixed(2)}` }
}

const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 }
]

function formatDeltaVal(current, previous) {
  if (!previous || previous === 0) return null
  const pct = ((current - previous) / previous) * 100
  return { pct, up: pct >= 0 }
}

function getRollingDateRange(days) {
  const safeDays = Number(days) > 0 ? Number(days) : 30
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - safeDays)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10)
  }
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

export default function Dashboard() {
  const { user } = useAuth()
  const { activeSite, loading: siteLoading } = useSite()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [timeRange, setTimeRange] = useState(30)
  const [previewMode, setPreviewMode] = useState(false)
  const [explainModalOpen, setExplainModalOpen] = useState(false)
  const [explainModel, setExplainModel] = useState('first_touch')
  const [journeyLead, setJourneyLead] = useState(null)
  const [previewSiteName, setPreviewSiteName] = useState('')
  const [previewSiteDomain, setPreviewSiteDomain] = useState('')
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const freshnessLabel = useFreshnessLabel(lastRefresh)
  const location = useLocation()
  const activeTab = location.pathname === '/app/attribution' ? 'attribution' : 'overview'

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

    if (activeSite) {
      setSite(activeSite)
    } else {
      setSite(null)
    }
  }, [user, activeSite])

  const { data: overview, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard-overview', site?.site_key, timeRange, previewMode],
    queryFn: async () => {
      if (!site?.site_key) return null
      if (previewMode) {
        return fetchApi(`/admin/preview/${encodeURIComponent(site.site_key)}`)
      }
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

  // Traffic signal via the Analytics data path. overview.sources is derived from
  // attributed_conversions, so it is empty whenever conversions = 0 — even when the
  // site has real traffic. This query lets the Overview tell "no traffic" apart from
  // "traffic but no conversions" and reuse the same visitors/pageviews/sources cards.
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
      // fetchApi sends the auth token and unwraps the { success, data, error }
      // envelope returned by the new live.js route.
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


  // Update freshness timestamp whenever new overview data arrives
  useEffect(() => {
    if (overview) setLastRefresh(new Date())
  }, [overview])


  const kpis = overview?.kpis || {}

  const totalRevenue = kpis.revenue || 0
  const totalConversions = kpis.conversions || 0
  const totalLeads = kpis.leads || 0
  const totalCustomers = kpis.customers || 0
  const leadConvRate = kpis.lead_conversion_rate || 0
  const customerConvRate = kpis.customer_conversion_rate || 0
  const avgValue = kpis.avg_value || 0

  const revenueDelta = formatDeltaVal(kpis.revenue, kpis.revenue_prev)
  const leadsDelta = formatDeltaVal(kpis.leads, kpis.leads_prev)
  const customersDelta = formatDeltaVal(kpis.customers, kpis.customers_prev)

  const aiRevResults = overview?.ai_sources || []
  const activeResults = overview?.sources || []
  const topPagesResults = overview?.top_pages || []
  const timeResults = overview?.revenue_trend || []

  const models = overview?.models || {}
  // Hide multi-touch model rows on free plan — the nightly job doesn't compute
  // them for free sites so they would otherwise render as $0 and confuse users.
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

  // T5.4 — Conversions over time (channel states)
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

  // Truth-gated tooltip rows — render ONLY fields present in the data source.
  // revenue_trend rows are { dim_value, revenue }; channel_trend rows are
  // { dim_value, conversions }. No fabricated metrics.
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

  // ── Three-state Overview gate (decided in this order) ──────────────────────
  //  (a) NO TRAFFIC       → install-guide empty state
  //  (b) TRAFFIC, 0 conv  → traffic cards + conversion-setup CTA (revenue/attribution gated)
  //  (c) FULL DATA        → normal overview
  // Traffic cards reuse the Analytics summary path (visitors/pageviews/sources/pages).
  const trafficKpis      = analyticsSummary?.kpis || {}
  const trafficVisitors  = safeNumber(trafficKpis.unique_visitors, 0)
  const trafficPageviews = safeNumber(trafficKpis.pageviews, 0)
  const trafficSources   = analyticsSummary?.top_sources || []
  const trafficTopPages  = analyticsSummary?.top_pages || []
  const hasConversions = activeResults.length > 0
  // Support preview can't fetch the analytics traffic path, so retain the original
  // 2-state behavior there (install guide vs full overview) instead of a half-populated
  // state (b). For real users, traffic is read from the Analytics summary, falling back to
  // overview-native signals (pageview sessions / top_pages) to avoid a load-race flash.
  const hasTraffic = previewMode
    ? hasConversions
    : (trafficPageviews > 0
        || topPagesResults.length > 0
        || safeNumber(overview?.kpis?.sessions, 0) > 0)

  return (
    <div className="st-container space-y-6">


      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-st-black dark:text-dark-primary">
            {location.pathname === '/app/attribution' ? 'Attribution' : 'Dashboard'}
          </h2>
          {site && <p className="text-sm text-st-gray dark:text-gray-400 mt-0.5">{site.domain || site.name}</p>}
        </div>
        {!previewMode && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] text-st-gray dark:text-gray-300 text-xs">
              <Users className="w-3.5 h-3.5" />
              Recent visitors (5m): {liveCount}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] text-st-gray dark:text-gray-300 text-xs">
              <RefreshCw className="w-3 h-3" />
              Updated {freshnessLabel}
            </div>
            <FilterBar
              dateButtons={TIME_RANGES.map((tr) => ({ key: tr.days, label: tr.label }))}
              activeDate={timeRange}
              onDateChange={setTimeRange}
              onExport={handleExport}
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black dark:border-white" />
        </div>
      ) : isError ? (
        <QueryError isError={isError} error={error} onRetry={refetch} />
      ) : (
        <>
          {/* Onboarding / Installation Alert Banner */}
          {!isLoading && !previewMode && site && (!site.last_seen_at || site.onboarding_completed === false) && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-800 dark:text-amber-400">Tracking setup incomplete</h4>
                  <p className="text-amber-700 dark:text-gray-300 mt-0.5">No events received yet. Finish setup to start seeing analytics and attribution.</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/setup')}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shrink-0 transition-colors self-start sm:self-center"
              >
                Open Setup
              </button>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* TAB 1: OVERVIEW */}
          {/* ──────────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {!hasTraffic ? (
                <div className="bg-white dark:bg-[#1A1D1D] rounded-2xl border border-gray-200 dark:border-[#2A2E2E] p-12 text-center flex flex-col items-center justify-center space-y-6">
                  <div>
                    <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-st-black dark:text-dark-primary mb-2">No attribution data yet</h3>
                    <p className="text-sm text-st-gray dark:text-gray-400 max-w-md mx-auto">
                      {!site?.last_seen_at
                        ? 'Install the tracker on your website to start seeing traffic and attribution reports.'
                        : 'Your dashboard is empty because no traffic or conversion data has been recorded for this date range.'}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate('/snippet')}
                    className="px-4 py-2 bg-st-black text-white rounded-lg text-xs font-semibold hover:bg-st-black/90 transition-colors flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5" /> Go to Install Guide
                  </button>
                </div>
              ) : !hasConversions ? (
                /* ── STATE (b): traffic exists, zero conversion events ─────────── */
                <>
                  <div className="bg-white dark:bg-[#1A1D1D] rounded-2xl border border-gray-200 dark:border-[#2A2E2E] p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <Zap className="w-5 h-5 text-st-black dark:text-dark-primary shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-base font-semibold text-st-black dark:text-dark-primary">
                          You're getting visitors — now tell SourceTrack what counts as a conversion.
                        </h3>
                        <p className="text-sm text-st-gray dark:text-gray-400 mt-1 max-w-xl">
                          Traffic is flowing in. Set up conversion events to unlock revenue, attribution, and ROI reporting.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/setup?tab=conversions')}
                      className="px-4 py-2 bg-st-black text-white rounded-lg text-xs font-semibold hover:bg-st-black/90 transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      Set up conversion events <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Traffic KPIs (real data) + gated conversions tile */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <MetricTile label="Visitors" value={trafficVisitors} format="number" />
                    <MetricTile label="Pageviews" value={trafficPageviews} format="number" />
                    <MetricTile label="Conversions" value="—" sub="No conversion events yet" />
                  </div>

                  {/* Command Center Nav */}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => navigate('/analytics')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Analytics <ArrowRight className="w-3 h-3" /></button>
                    <button onClick={() => navigate('/setup?tab=conversions')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Set up conversions <ArrowRight className="w-3 h-3" /></button>
                  </div>

                  {/* Top Sources + Top Pages — Analytics traffic data path */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <DashboardCard title="Top Sources" subtitle="Traffic by source">
                      {trafficSources.length === 0 ? (
                        <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No traffic detected yet.</p>
                      ) : (
                        <DashboardTable
                          columns={[
                            { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.source || 'Direct'} /> },
                            { key: 'visits', label: 'Visits', render: (r) => safeNumber(r.visits, 0).toLocaleString() }
                          ]}
                          rows={trafficSources.slice(0, 5)}
                        />
                      )}
                    </DashboardCard>

                    <DashboardCard title="Top Pages" subtitle="Most viewed pages">
                      {trafficTopPages.length === 0 ? (
                        <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No page data yet.</p>
                      ) : (
                        <DashboardTable
                          columns={[
                            { key: 'page', label: 'Page', render: (r) => <span className="font-mono text-xs">{(r.page || '/').replace(/^https?:\/\/[^/]+/, '') || '/'}</span> },
                            { key: 'views', label: 'Views', render: (r) => safeNumber(r.views, 0).toLocaleString() }
                          ]}
                          rows={trafficTopPages.slice(0, 5)}
                        />
                      )}
                    </DashboardCard>
                  </div>

                  {/* Truth-gate: revenue / attribution withheld until conversions exist */}
                  <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl px-4 py-4 flex items-start gap-3 shadow-sm">
                    <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-st-gray dark:bg-gray-400 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-st-black dark:text-dark-primary">Revenue &amp; attribution — no conversion events yet</p>
                      <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">
                        Revenue, source attribution, and ROI reporting appear here once your site sends conversion events. See the <a href="/developers/conversions" className="underline hover:text-st-black dark:hover:text-dark-text transition-colors">conversion events docs</a> or <button onClick={() => navigate('/setup?tab=conversions')} className="underline hover:text-st-black dark:hover:text-dark-text transition-colors">set them up now</button>.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* KPI Strip: strictly max 3 primary KPIs */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {hasRevenue ? (
                  <>
                    <MetricTile
                      label="Revenue"
                      value={totalRevenue}
                      format="currency"
                      trend={revenueDelta?.pct}
                      sub={avgValue > 0 ? `Avg value: $${avgValue.toFixed(2)}` : null}
                    />
                    <MetricTile
                      label="Leads"
                      value={totalLeads}
                      trend={leadsDelta?.pct}
                      sub={leadConvRate > 0 ? `${leadConvRate.toFixed(1)}% conversion rate` : null}
                    />
                    <MetricTile
                      label="Customers"
                      value={totalCustomers}
                      trend={customersDelta?.pct}
                      sub={customerConvRate > 0 ? `${customerConvRate.toFixed(1)}% conversion rate` : null}
                    />
                  </>
                ) : (
                  <>
                    <MetricTile
                      label="Total Leads"
                      value={totalLeads}
                      trend={leadsDelta?.pct}
                    />
                    <MetricTile
                      label="Customers"
                      value={totalCustomers}
                      trend={customersDelta?.pct}
                    />
                    <MetricTile
                      label="Lead Conversion Rate"
                      value={totalLeads > 0 ? leadConvRate : null}
                      format="percent"
                      isEmpty={totalLeads === 0}
                    />
                  </>
                )}
              </div>

              {/* Secondary metric: Bounce Rate. Truth-gated — hidden entirely
                  when null (Analytics path / no data); never a fake 0% placeholder. */}
              {kpis.bounce_rate != null && (
                <div className="flex flex-wrap gap-4">
                  <div className="w-full sm:w-52" title="Bounce rate — share of sessions with only one page or action.">
                    <MetricTile
                      label="Bounce Rate"
                      value={`${Number(kpis.bounce_rate).toFixed(1)}%`}
                      compact
                      sub="Sessions with one page/action"
                    />
                  </div>
                </div>
              )}

              {/* Command Center Nav */}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => navigate('/analytics')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Analytics <ArrowRight className="w-3 h-3" /></button>
                <button onClick={() => navigate('/app/attribution')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Attribution <ArrowRight className="w-3 h-3" /></button>
                <button onClick={() => navigate('/leads')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Leads <ArrowRight className="w-3 h-3" /></button>
                <button onClick={() => navigate('/app/integrations')} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 dark:border-[#2A2E2E] bg-white dark:bg-[#1A1D1D] text-st-black dark:text-dark-primary hover:border-st-black dark:hover:border-white transition-colors">Integrations <ArrowRight className="w-3 h-3" /></button>
              </div>

              {/* Performance Trend Chart */}
              <DashboardCard title="Performance Trend" subtitle={`Last ${timeRange} days • ${site?.timezone || 'UTC'}`}>
                <div className="h-64">
                  <Line data={hasRevenue ? revTrendData : channelTrendData} options={chartOpts(hasRevenue ? '$' : '', hasRevenue ? revTooltipRows : convTooltipRows)} />
                </div>
              </DashboardCard>

              {/* Top Sources & Recent Conversions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DashboardCard title="Top Sources" subtitle="Traffic and conversions by source">
                  {activeResults.length === 0 ? (
                    <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No traffic detected yet.</p>
                  ) : (
                    <DashboardTable
                      columns={[
                        { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.dim_value || r.source || 'Direct'} /> },
                        { key: 'conversions', label: 'Conversions', render: (r) => r.conversions },
                        { key: 'revenue', label: 'Revenue', render: (r) => hasRevenue ? `$${(r.revenue || 0).toFixed(2)}` : '—' }
                      ].filter(c => hasRevenue || c.key !== 'revenue')}
                      rows={activeResults.slice(0, 5)}
                    />
                  )}
                </DashboardCard>

                <DashboardCard title="Recent Conversions" subtitle={totalConversions > 0 ? `Latest attributed conversions • ${totalConversions} total` : 'Latest attributed conversions'}
                  action={
                    <button onClick={() => navigate('/leads')} className="text-xs font-semibold text-st-black dark:text-dark-primary flex items-center gap-1">
                      View Leads <ArrowRight className="w-3 h-3" />
                    </button>
                  }
                >
                  {!recentActivity || !recentActivity.events || recentActivity.events.length === 0 ? (
                    <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No conversions in last 30 minutes.</p>
                  ) : (
                    <DashboardTable
                      columns={[
                        { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.referrer || r.utm_source || 'Direct'} /> },
                        { key: 'event', label: 'Event', render: (r) => r.event === '$conversion' ? 'Conversion' : r.event },
                        { key: 'time', label: 'Time', render: (r) => new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                        { key: 'action', label: '', render: (r) => (
                          r.visitor_id ? (
                            <button
                              onClick={() => setJourneyLead(r)}
                              className="text-xs text-st-black dark:text-dark-primary font-semibold hover:underline"
                            >
                              View journey
                            </button>
                          ) : (
                            <span className="text-xs text-st-gray">—</span>
                          )
                        )}
                      ]}
                      rows={recentActivity.events.filter(e => e.event === '$conversion').slice(0, 5)}
                    />
                  )}
                </DashboardCard>
              </div>

              {/* AI Source Performance (Only if real data exists) */}
              {aiRevResults.length > 0 && (
                <DashboardCard title="AI Source Performance" subtitle="Traffic and conversions from AI engines">
                  <DashboardTable
                    columns={[
                      { key: 'source', label: 'AI Platform', render: (r) => <SourceChip source={r.dim_value || r.source} /> },
                      { key: 'leads', label: 'Leads', render: (r) => r.ai_leads || r.conversions || 0 },
                      { key: 'revenue', label: 'Revenue', render: (r) => hasRevenue ? `$${(r.ai_revenue || 0).toFixed(2)}` : '—' }
                    ].filter(c => hasRevenue || c.key !== 'revenue')}
                    rows={aiRevResults}
                  />
                </DashboardCard>
              )}

              {/* Pinned Reports Widgets - strictly below core cards */}
              {hasFeature(site?.plan, 'dashboard_widgets') && (
                <DashboardCard title="Pinned Reports" subtitle="Saved report widgets pinned to your dashboard">
                  {dashboardReports.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
                      <p className="text-sm text-st-gray dark:text-gray-400">No pinned reports yet. Pin reports from the Report Builder.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {dashboardReports.map((report) => (
                        <DashboardWidgetCard key={report.id} report={report} site={site} />
                      ))}
                    </div>
                  )}
                </DashboardCard>
              )}
            </>
          )}
        </div>
      )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* TAB 2: ATTRIBUTION */}
          {/* ──────────────────────────────────────────────────────── */}
          {activeTab === 'attribution' && (
            <div className="space-y-6">
              {/* 1. Source performance trend chart */}
              <DashboardCard title="Source Performance Trend" subtitle="Conversions by source over time">
                <div className="h-64">
                  <Line data={channelTrendData} options={chartOpts('', convTooltipRows)} />
                </div>
              </DashboardCard>

              {/* 2. SEO revenue attribution card only when GSC connected */}
              {isGscConnected && (
                <div className="bg-blue-50 border border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/30 rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-400 mb-1">Search Console Connected</h4>
                  <p className="text-xs text-blue-700 dark:text-blue-300">Matched by landing page and date range. Query revenue is estimated.</p>
                </div>
              )}

              {/* 3. Source Attribution table with switcher */}
              <DashboardCard title="Source Attribution" subtitle="Detailed performance breakdown by model">
              <div className="mb-4">
                <span className="inline-block px-3 py-1.5 border border-gray-200 dark:border-dark-border rounded-lg text-sm bg-gray-50 dark:bg-dark-bg text-st-black dark:text-dark-primary font-semibold">
                  First-touch attribution
                </span>
              </div>
                <DashboardTable
                  columns={
                    hasRevenue ? [
                      { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.dim_value || r.source || 'Direct'} /> },
                      { key: 'conversions', label: 'Conversions', render: (r) => r.conversions || 0 },
                      { key: 'revenue', label: 'Revenue', render: (r) => `$${(r.revenue || 0).toFixed(2)}` },
                      { key: 'details', label: 'Details', render: (r) => (
                        <button onClick={() => { setExplainModel('first_touch'); setExplainModalOpen(true) }} className="text-xs text-st-black dark:text-dark-primary font-semibold hover:underline">
                          View details
                        </button>
                      )}
                    ] : [
                      { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.dim_value || r.source || 'Direct'} /> },
                      { key: 'conversions', label: 'Conversions', render: (r) => r.conversions || 0 },
                      { key: 'cvr', label: 'CVR%', render: (r) => r.cvr > 0 ? `${r.cvr.toFixed(1)}%` : '—' },
                      { key: 'details', label: 'Details', render: (r) => (
                        <button onClick={() => { setExplainModel('first_touch'); setExplainModalOpen(true) }} className="text-xs text-st-black dark:text-dark-primary font-semibold hover:underline">
                          View details
                        </button>
                      )}
                    ]
                  }
                  rows={activeResults}
                />
              </DashboardCard>

              {/* 4. Landing Page Performance */}
              <DashboardCard title="Landing Page Performance" subtitle="Traffic and conversions by landing page">
                <DashboardTable
                  columns={[
                    { key: 'path', label: 'Landing Page', render: (r) => <span className="font-mono text-xs">{r.path || '/'}</span> },
                    { key: 'views', label: 'Views', render: (r) => r.views }
                  ]}
                  rows={topPagesResults}
                />
              </DashboardCard>

              {/* 5. AI Source Performance */}
              <DashboardCard title="AI Source Performance" subtitle="Traffic and conversions from AI engines">
                {aiRevResults.length === 0 ? (
                  <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No AI referrals detected yet.</p>
                ) : (
                  <DashboardTable
                    columns={[
                      { key: 'source', label: 'AI Platform', render: (r) => <SourceChip source={r.dim_value || r.source} /> },
                      { key: 'leads', label: 'Leads', render: (r) => r.ai_leads || r.conversions || 0 },
                      { key: 'revenue', label: 'Revenue', render: (r) => hasRevenue ? `$${(r.ai_revenue || 0).toFixed(2)}` : '—' }
                    ].filter(c => hasRevenue || c.key !== 'revenue')}
                    rows={aiRevResults}
                  />
                )}
              </DashboardCard>

              {/* 6. Search Terms / SEO Queries */}
              {isGscConnected && (
                <DashboardCard title="Search Terms / SEO Queries" subtitle="Organic query performance estimate">
                  <p className="text-xs text-st-gray dark:text-gray-400 mb-3">Matched by landing page and date range. Query revenue is estimated.</p>
                  <p className="text-sm text-st-gray dark:text-gray-400 py-4 text-center">No search query data matches in this range.</p>
                </DashboardCard>
              )}
            </div>
          )}
        </>
      )}

      {journeyLead?.visitor_id && (
        <JourneyModal
          visitorId={journeyLead.visitor_id}
          siteKey={site?.site_key}
          leadSummary={{ id: journeyLead.visitor_id }}
          onClose={() => setJourneyLead(null)}
          onQualified={() => setJourneyLead(null)}
        />
      )}

      <ConversionExplanationModal
        isOpen={explainModalOpen}
        onClose={() => setExplainModalOpen(false)}
        siteKey={site?.site_key}
        model={explainModel}
      />
    </div>
  )
}

// Isolated Dashboard Widget Component
function DashboardWidgetCard({ report, site }) {
  const navigate = useNavigate()
  const cfg = report.config || {}

  // Guardrail 3: Handle legacy/invalid configurations safely
  const reportDateRange = (() => {
    try {
      if (cfg.isRolling) {
        return getRollingDateRange(cfg.rollingDays || 30)
      }
      return {
        from: cfg.dateFrom || format(subDays(new Date(), 30), 'yyyy-MM-dd'),
        to: cfg.dateTo || format(new Date(), 'yyyy-MM-dd')
      }
    } catch (e) {
      console.warn("Invalid widget date range:", report.id, e)
      return {
        from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
        to: format(new Date(), 'yyyy-MM-dd')
      }
    }
  })()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'saved-report-data',
      report.id,
      report.updated_at,
      site?.site_key,
      JSON.stringify(cfg)
    ],
    queryFn: async () => {
      // Guardrail 3: do not execute if config missing metric
      if (!cfg.metric) {
        throw new Error('Config missing metric')
      }
      const params = new URLSearchParams({
        site_key: site.site_key,
        model: cfg.model || 'last_touch',
        date_from: reportDateRange.from,
        date_to: reportDateRange.to,
        group_by: cfg.groupBy || 'source',
        metric: cfg.metric || 'revenue'
      })
      if (cfg.granularity && cfg.granularity !== 'day') params.set('time_granularity', cfg.granularity)
      if (cfg.groupBy2) params.set('group_by2', cfg.groupBy2)
      if (cfg.attributionWindow) params.set('attribution_window', cfg.attributionWindow)
      if (cfg.attributeBy && cfg.attributeBy !== 'conversion_date') params.set('attribute_by', cfg.attributeBy)
      if (cfg.filters) {
        Object.entries(cfg.filters).forEach(([k, v]) => {
          if (v) params.set(`filter_${k}`, v)
        })
      }
      return fetchApi(`/attribution?${params}`)
    },
    enabled: !!site?.site_key && !!cfg.metric
  })

  const results = data?.results || []
  const nightlyNotice = data?._notice || null
  const total = results.reduce((s, r) => {
    const metricKey = cfg.metric || 'revenue'
    return s + (r[metricKey] || r.revenue || r.conversions || r.sessions || 0)
  }, 0)
  const metricDef = METRIC_DEFS[cfg.metric] || METRIC_DEFS.revenue
  const maxVal = Math.max(...results.slice(0, 4).map(r => {
    const mk = cfg.metric || 'revenue'
    return r[mk] || r.revenue || r.conversions || r.sessions || 0
  }), 1)

  const sizeClasses = {
    small: 'col-span-1',
    medium: 'col-span-1 md:col-span-2',
    large: 'col-span-1 md:col-span-3'
  }
  const sizeClass = sizeClasses[report.dashboard_size] || sizeClasses.medium

  return (
    <div className={`bg-gray-50 dark:bg-[#111414] rounded-lg p-4 text-left border border-gray-100 dark:border-[#2A2E2E] hover:border-gray-300 dark:hover:border-gray-600 transition-colors flex flex-col justify-between ${sizeClass}`}>
      <div>
        <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-[#2A2E2E] pb-2">
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-st-black dark:text-dark-primary truncate" title={report.name}>{report.name}</h4>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[9px] text-st-gray dark:text-gray-400 mt-0.5">
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-st-black/5 dark:bg-white/10 text-[9px] font-semibold text-st-black dark:text-dark-primary"
                title={`Attribution model: ${MODELS.find(m => m.key === cfg.model)?.label || cfg.model}. The model determines which touch in the customer journey gets credit for this metric.`}
              >
                {MODELS.find(m => m.key === cfg.model)?.label || cfg.model}
              </span>
              <span>•</span>
              <span className="truncate">{cfg.groupBy}</span>
              {cfg.isRolling && (
                <>
                  <span>•</span>
                  <span className="text-lime-700 font-medium">Rolling ({cfg.rollingDays}d)</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              sessionStorage.setItem('sourcetrack_edit_widget', JSON.stringify({
                id: report.id, name: report.name, ...cfg
              }))
              navigate(`/report-builder?edit=${report.id}`)
            }}
            className="text-[10px] text-st-gray hover:text-st-black dark:hover:text-dark-text font-medium shrink-0"
          >
            Edit
          </button>
        </div>

        {isLoading ? (
          <div className="h-28 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 animate-spin text-st-gray dark:text-gray-400" />
          </div>
        ) : isError ? (
          <div className="h-28 flex flex-col items-center justify-center text-center p-2">
            <span className="text-red-500 text-xs font-semibold">⚠️ Query failed</span>
            <p className="text-[9px] text-st-gray dark:text-gray-400 mt-1 leading-normal">
              {error?.message || 'Configuration error'}
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="h-28 flex items-center justify-center text-st-gray dark:text-gray-400 text-xs text-center p-4">
            {nightlyNotice ? (
              <span>
                <span className="block font-semibold text-amber-600 dark:text-amber-400 mb-1">Nightly calculation pending</span>
                <span className="block text-[10px] leading-snug">This model needs processed attribution data. If your site is new or the nightly job hasn't run yet, this report will populate once it does.</span>
              </span>
            ) : (
              <span>No data for this selection</span>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-st-black dark:text-dark-primary tabular-nums">
                {metricDef.format(total)}
              </span>
              <span className="text-[10px] text-st-gray dark:text-gray-400">{metricDef.label}</span>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-gray-100/50 dark:border-[#2A2E2E]/50">
              {results.slice(0, 5).map((r, i) => {
                const mk = cfg.metric || 'revenue'
                const val = r[mk] || r.revenue || r.conversions || r.sessions || 0
                const barW = maxVal > 0 ? (val / maxVal) * 100 : 0
                const label = r.dim_value || '—'
                return (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] text-st-gray dark:text-gray-400 truncate inline-flex items-center max-w-full" title={label}>
                        <span className="truncate">{label}</span>
                        {isDirectLabel(label) && <DirectInfo />}
                      </span>
                      <div style={{ height: '2px', width: `${barW}%`, background: 'rgba(204,240,63,0.6)', borderRadius: '1px', marginTop: '3px' }} />
                    </div>
                    <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300 w-14 text-right flex-shrink-0 tabular-nums">
                      {metricDef.format(val)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
