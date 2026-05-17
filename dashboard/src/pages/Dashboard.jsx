import { useState, useEffect } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import {
  DollarSign, Users, Bot, TrendingUp,
  ArrowRight, Download, ExternalLink, Sparkles, Bookmark,
  FileText, BarChart3, Plus, AlertTriangle
} from 'lucide-react'
import MetricTile from '../components/MetricTile'
import DashboardCard from '../components/DashboardCard'
import DashboardTable from '../components/DashboardTable'
import EmptyState from '../components/EmptyState'
import FilterBar from '../components/FilterBar'
import StatusBadge from '../components/StatusBadge'
import SupportModeBanner from '../components/SupportModeBanner'
import ConversionExplanationModal from '../components/ConversionExplanationModal'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend)

const MODELS = [
  { key: 'first_touch', label: 'First Touch' },
  { key: 'last_touch', label: 'Last Touch' },
  { key: 'first_touch_non_direct', label: 'First Touch (Non-Direct)' },
  { key: 'last_touch_non_direct', label: 'Last Touch (Non-Direct)' },
  { key: 'ai_platforms', label: 'AI Platforms' }
]

const AI_SOURCES = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok', 'Copilot', 'DeepSeek', 'You.com AI', 'Phind', 'Kagi'] // matches ai-platform.js AI_HOST_MAP (11 platforms)

// Platform accent colors for AI source table badges
const AI_PLATFORM_COLORS = {
  'ChatGPT':    { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'Claude':     { bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500' },
  'Perplexity': { bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500' },
  'Gemini':     { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  'Grok':       { bg: 'bg-gray-100',    text: 'text-gray-700',    dot: 'bg-gray-500' },
  'Copilot':    { bg: 'bg-sky-100',     text: 'text-sky-700',     dot: 'bg-sky-500' },
  'DeepSeek':   { bg: 'bg-cyan-100',    text: 'text-cyan-700',    dot: 'bg-cyan-500' },
}
const getAIPlatformColor = (name) => AI_PLATFORM_COLORS[name] || { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' }
const CONVERSION_LABELS = {
  purchase: 'Purchase', trial: 'Free Trial', lead: 'Lead Form',
  signup: 'Sign Up', meeting: 'Meeting', booking: 'Booking'
}

const STAGE_LABELS = {
  lead_created: 'Lead Created', qualified: 'Qualified',
  opportunity: 'Opportunity', closed_won: 'Closed Won'
}

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

const COLORS = [
  'rgba(17, 24, 39, 0.85)',
  'rgba(215, 245, 80, 0.85)',
  'rgba(107, 114, 128, 0.85)',
  'rgba(55, 65, 81, 0.85)',
  'rgba(209, 213, 219, 0.85)',
  'rgba(31, 41, 55, 0.85)',
  'rgba(180, 195, 60, 0.85)'
]

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

// ─── T3.4: KPI Config by business_type ─────────────────────────────────────
const getKpiConfig = (businessType) => {
  switch (businessType) {
    case 'saas': return [
      { key: 'revenue',       label: 'Revenue',       format: 'currency' },
      { key: 'mrr_estimate',  label: 'MRR (est.)',    format: 'currency', emptyState: true },
      { key: 'ai_revenue',    label: 'AI Revenue',    format: 'currency' },
      { key: 'trial_to_paid', label: 'Trial → Paid', format: 'percent',  emptyState: true },
      { key: 'best_cac',      label: 'Best CAC',      format: 'currency', emptyState: true },
    ]
    case 'ecommerce': return [
      { key: 'revenue',    label: 'Total Revenue', format: 'currency' },
      { key: 'aov',        label: 'AOV',           format: 'currency', emptyState: true },
      { key: 'orders',     label: 'Orders',        format: 'number' },
      { key: 'ai_roas',    label: 'AI ROAS',       format: 'number' },
      { key: 'best_roas',  label: 'Best ROAS',     format: 'number',   emptyState: true },
    ]
    case 'leadgen': return [
      { key: 'total_leads', label: 'Total Leads', format: 'number' },
      { key: 'lead_growth', label: 'Lead Growth', format: 'percent' },
      { key: 'ai_leads',    label: 'AI Leads',    format: 'number' },
      { key: 'sql_percent', label: 'SQL %',       format: 'percent',  emptyState: true },
      { key: 'best_cpl',    label: 'Best CPL',    format: 'currency', emptyState: true },
    ]
    default: return [
      { key: 'revenue',     label: 'Revenue',     format: 'currency' },
      { key: 'top_channel', label: 'Top Channel', format: 'text' },
      { key: 'conversion',  label: 'Conversion',  format: 'percent' },
      { key: 'cpc',         label: 'CPC',         format: 'currency' },
      { key: 'roas',        label: 'ROAS / ROI',  format: 'number',   emptyState: true },
    ]
  }
}
const computeMrrEstimate = (d) => {
  if (!d?.revenue) return null
  const days = new Date().getDate()
  return days < 3 ? null : (d.revenue / days) * 30
}
const computeAov = (d) => (!d?.revenue || !d?.orders || d.orders === 0) ? null : d.revenue / d.orders
const enrichKpis = (kpis, businessType) => {
  const mrrNow  = kpis.mrr_estimate  ?? (businessType === 'saas'      ? computeMrrEstimate(kpis) : null)
  const aovNow  = kpis.aov           ?? (businessType === 'ecommerce' ? computeAov(kpis)         : null)
  // Previous-period MRR estimate — same formula applied to prev revenue
  const mrrPrev = kpis.mrr_estimate_prev ?? (businessType === 'saas' && kpis.revenue_prev
    ? (kpis.revenue_prev / (new Date().getDate() || 30)) * 30
    : null)
  return {
    ...kpis,
    // Computed metrics
    mrr_estimate:      mrrNow,
    mrr_estimate_prev: mrrPrev,
    aov:               aovNow,
    // Expose _prev keys for every KPI the strip might display
    revenue_prev:      kpis.revenue_prev      ?? null,
    leads_prev:        kpis.leads_prev        ?? null,
    ai_revenue_prev:   kpis.ai_revenue_prev   ?? null,
    conversions_prev:  kpis.conversions_prev  ?? null,
    sessions_prev:     kpis.sessions_prev     ?? null,
    total_leads_prev:  kpis.leads_prev        ?? null,  // leadgen alias
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [timeRange, setTimeRange] = useState(30)
  const [previewMode, setPreviewMode] = useState(false)
  const [explainModalOpen, setExplainModalOpen] = useState(false)
  const [explainModel, setExplainModel] = useState(null)
  const [previewSiteName, setPreviewSiteName] = useState('')
  const [previewSiteDomain, setPreviewSiteDomain] = useState('')

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

    // Normal mode: load user's own site
    async function load() {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const query = supabase
        .from('sites')
        .select('site_key, name, domain')
        .limit(1)

      if (member?.company_id) {
        query.eq('company_id', member.company_id)
      } else {
        query.eq('owner_id', user.id)
      }

      const { data } = await query.maybeSingle()
      setSite(data)
    }
    load()
  }, [user])

  const { data: overview, isLoading } = useQuery({
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

  const { data: savedReports = [] } = useQuery({
    queryKey: ['saved-reports-dash', site?.site_key],
    queryFn: async () => {
      if (!site?.site_key) return []
      return fetchApi(`/reports/saved?site_key=${encodeURIComponent(site.site_key)}`)
    },
    enabled: !!site?.site_key && !previewMode
  })

  const topReports = (savedReports || []).slice(0, 3)

  const reportQueries = useQueries({
    queries: topReports.map((r) => {
      const cfg = r.config || {}
      const reportDateRange = cfg.isRolling
        ? getRollingDateRange(cfg.rollingDays || 30)
        : { from: cfg.dateFrom || format(subDays(new Date(), 30), 'yyyy-MM-dd'), to: cfg.dateTo || format(new Date(), 'yyyy-MM-dd') }
      return {
        queryKey: ['saved-report-data', r.id, site?.site_key, cfg.isRolling ? `rolling-${cfg.rollingDays || 30}` : null],
        queryFn: async () => {
          if (!site?.site_key) return null
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
      }
    })
  })



  const { data: liveData } = useQuery({
    queryKey: ['live-visitors', site?.site_key],
    queryFn: async () => {
      if (!site?.site_key) return { live_visitors: 0 }
      const res = await fetch(`/api/live?site_key=${site.site_key}`)
      return res.json()
    },
    enabled: !!site?.site_key && !previewMode,
    refetchInterval: 30000,
  })
  const liveCount = liveData?.live_visitors ?? 0

  const kpis = overview?.kpis || {}
  const businessType = overview?.business_type || site?.business_type || 'saas'
  const kpiConfig    = getKpiConfig(businessType)
  const enrichedKpis = enrichKpis(kpis, businessType)

  const totalRevenue = kpis.revenue || 0
  const totalConversions = kpis.conversions || 0
  const totalSessions = kpis.sessions || 0
  const totalLeads = kpis.leads || 0
  const convRate = kpis.conversion_rate || 0
  const avgValue = kpis.avg_value || 0
  const totalAIRevenue = kpis.ai_revenue || 0

  const revenueDelta = formatDeltaVal(kpis.revenue, kpis.revenue_prev)
  const leadsDelta = formatDeltaVal(kpis.leads, kpis.leads_prev)

  const aiRevResults = overview?.ai_sources || []
  const aiTrendResults = overview?.ai_trend || []
  const aiShareTotal = kpis.ai_revenue_share || 0
  const aiDelta = null

  const activeResults = overview?.sources || []
  const landingResults = overview?.landing_pages || []
  const campaignResults = overview?.campaigns || []
  const timeResults = overview?.revenue_trend || []
  const installData = overview?.install
  const alerts = overview?.alerts || []

  const models = overview?.models || {}
  const modelRevenues = MODELS.map(m => ({
    model: m.key, label: m.label, total: models[m.key] || 0
  }))

  const aiTrendChartData = {
    labels: aiTrendResults.map(r => r.dim_value || ''),
    datasets: [{
      label: 'AI Revenue', data: aiTrendResults.map(r => r.ai_revenue || 0),
      borderColor: '#D7F550', backgroundColor: 'rgba(215, 245, 80, 0.08)',
      fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2
    }]
  }

  const revTrendData = {
    labels: timeResults.map(r => r.dim_value || ''),
    datasets: [{
      label: 'Revenue', data: timeResults.map(r => r.revenue || 0),
      borderColor: 'rgba(17, 24, 39, 1)', backgroundColor: 'rgba(17, 24, 39, 0.08)',
      fill: true, tension: 0.3, pointRadius: 2
    }]
  }

  // T5.4 — Leads over time (channel states)
  const channelTrendResults = overview?.channel_trend || []
  const channelTrendData = {
    labels: channelTrendResults.map(r => r.dim_value || ''),
    datasets: [{
      label: 'Leads',
      data: channelTrendResults.map(r => r.leads || 0),
      borderColor: 'rgba(17,24,39,0.85)',
      backgroundColor: 'rgba(17,24,39,0.08)',
      borderWidth: 2,
      pointRadius: 3,
      tension: 0.3,
      fill: true
    }]
  }

  // T5.3 — Orders/Leads by Channels bar chart
  const channelBarData = {
    labels: activeResults.slice(0, 8).map(r => r.dim_value || r.source || 'Unknown'),
    datasets: [
      {
        label: businessType === 'ecommerce' ? 'Orders' : 'Leads',
        data: activeResults.slice(0, 8).map(r => r.conversions || 0),
        backgroundColor: activeResults.slice(0, 8).map((_, i) =>
          i === 0 ? 'rgba(17,24,39,0.85)' : i === 1 ? 'rgba(204,240,63,0.85)' : 'rgba(107,114,128,0.6)'
        ),
        borderRadius: 6,
        borderSkipped: false
      }
    ]
  }
  const channelBarOpts = {
    responsive: true, maintainAspectRatio: false, indexAxis: 'y',
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { maxTicksLimit: 5 } },
      y: { grid: { display: false }, ticks: { font: { size: 12 } } }
    }
  }

  // T5.5 — Leads by Campaign donut
  const topCampaigns = campaignResults.slice(0, 6)
  const donutColors = [
    'rgba(17,24,39,0.85)', 'rgba(215,245,80,0.9)', 'rgba(107,114,128,0.8)',
    'rgba(55,65,81,0.8)', 'rgba(180,195,60,0.8)', 'rgba(209,213,219,0.9)'
  ]
  const campaignDonutData = {
    labels: topCampaigns.map(r => r.dim_value || 'unknown'),
    datasets: [{
      data: topCampaigns.map(r => r.revenue || 0),
      backgroundColor: donutColors,
      borderWidth: 0,
      hoverOffset: 4
    }]
  }
  const donutOpts = {
    responsive: true, maintainAspectRatio: false, cutout: '68%',
    plugins: {
      legend: { position: 'right', labels: { boxWidth: 10, padding: 12, font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx) => ` $${(ctx.raw || 0).toFixed(0)}` } }
    }
  }

  const chartOpts = (prefix = '$') => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { callback: (v) => `${prefix}${v}`, maxTicksLimit: 5 }, grid: { color: '#f3f4f6' } },
      x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } }
    }
  })

  const recentLeadsData = activeResults.slice(0, 10).map(r => ({
    source: r.dim_value || r.source || 'unknown',
    conversions: r.conversions || 0,
    revenue: r.revenue || 0
  }))

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

  const createStarterReport = async (template) => {
    if (!site?.site_key) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd')
    const configs = {
      sources: {
        name: 'Sources', metric: 'revenue', groupBy: 'source', model: 'last_touch',
        chartType: 'bar', dateFrom: thirtyDaysAgo, dateTo: today, filters: {}
      },
      totals: {
        name: 'Totals', metric: 'conversions', groupBy: 'date', model: 'last_touch',
        chartType: 'line', dateFrom: thirtyDaysAgo, dateTo: today, filters: {}
      },
      trend: {
        name: 'Conversion Trend', metric: 'conversions', groupBy: 'date', model: 'last_touch',
        chartType: 'line', dateFrom: thirtyDaysAgo, dateTo: today, filters: {}
      }
    }
    const cfg = configs[template]
    if (!cfg) return
    await fetchApi('/reports/saved', {
      method: 'POST',
      body: JSON.stringify({
        site_key: site.site_key,
        name: cfg.name,
        config: {
          model: cfg.model, groupBy: cfg.groupBy, groupBy2: null, metric: cfg.metric,
          chartType: cfg.chartType, datePreset: 30, dateFrom: cfg.dateFrom, dateTo: cfg.dateTo,
          granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date',
          filters: cfg.filters
        }
      })
    })
    window.location.reload()
  }

  const isEmpty = !isLoading && savedReports.length === 0

  return (
    <div className="st-container space-y-6">
      {previewMode && (
        <SupportModeBanner siteName={previewSiteName} siteDomain={previewSiteDomain} />
      )}

      {/* Header Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-st-black">Performance Overview</h2>
          {site && <p className="text-sm text-st-gray mt-0.5">{site.domain || site.name}</p>}
        </div>
        {!previewMode && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              {liveCount} live now
            </div>
            <button onClick={() => navigate('/report-builder')}
              className="px-3 py-1.5 text-sm text-white bg-st-black rounded-lg hover:bg-st-black/90 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Create Report
            </button>
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
        </div>
      ) : isEmpty ? (
        /* Empty state — no saved reports */
        <div className="max-w-2xl mx-auto py-12 text-center space-y-8">
          <div>
            <BarChart3 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-st-black mb-2">No reports yet</h3>
            <p className="text-sm text-st-gray max-w-md mx-auto">
              Your dashboard is empty because no reports have been created yet.
              Build reports for the metrics and attribution views you care about.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => navigate('/report-builder')}
              className="w-full max-w-sm py-3 bg-st-black text-white rounded-lg text-sm font-semibold hover:bg-st-black/90 flex items-center justify-center gap-2 mx-auto"
            >
              <Plus className="w-4 h-4" /> Create Report
            </button>
          </div>

          <div>
            <p className="text-xs text-st-gray mb-3">Or start with a template</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => createStarterReport('sources')}
                className="px-5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 flex items-center gap-2"
              >
                <FileText className="w-4 h-4 text-st-gray" /> Sources
              </button>
              <button
                onClick={() => createStarterReport('totals')}
                className="px-5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4 text-st-gray" /> Totals
              </button>
              <button
                onClick={() => createStarterReport('trend')}
                className="px-5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4 text-st-gray" /> Conversion Trend
              </button>
            </div>
          </div>

          <p className="text-xs text-st-gray max-w-sm mx-auto">
            Templates use live attribution data. Build reports in the Report Builder for more metric and filter options.
          </p>
        </div>
      ) : (
        <>
          {/* T5.8 — Alert banner at top */}
          {alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.slice(0, 2).map((a, i) => (
                <div key={i} className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm ${
                  a.severity === 'high'
                    ? 'bg-red-50 border border-red-200 text-red-800'
                    : 'bg-amber-50 border border-amber-200 text-amber-800'
                }`}>
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{a.metric}: </span>
                    <span>{a.message}</span>
                    {a.suggested_action && (
                      <p className="text-xs mt-0.5 opacity-75">{a.suggested_action}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* KPI Strip — T2.1: business-type aware with deltas */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {kpiConfig.map((metric) => {
              const rawValue  = enrichedKpis?.[metric.key] ?? null
              const prevValue = enrichedKpis?.[metric.key + '_prev'] ?? null
              const isEmpty   = metric.emptyState === true && rawValue == null
              // Compute delta % vs previous period when both values exist
              const delta = (!isEmpty && rawValue != null && prevValue != null && prevValue !== 0)
                ? ((rawValue - prevValue) / Math.abs(prevValue)) * 100
                : null
              return (
                <MetricTile
                  key={metric.key}
                  label={metric.label}
                  value={rawValue}
                  format={metric.format}
                  isEmpty={isEmpty}
                  trend={delta}
                />
              )
            })}
          </div>

          {/* Saved Reports — shown first, above the analytics wall */}
          {!previewMode && (savedReports.length > 0 ? (
            <DashboardCard title="Your Reports"
              subtitle="Saved report configurations — data fetched live"
              action={
                <button onClick={() => navigate('/report-builder')} className="text-xs text-st-black hover:text-gray-700 font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" /> New Report
                </button>
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {topReports.map((report, idx) => {
                  const cfg = report.config || {}
                  const reportData = reportQueries[idx]?.data
                  const results = reportData?.results || []
                  const total = results.reduce((s, r) => {
                    const metricKey = cfg.metric || 'revenue'
                    return s + (r[metricKey] || r.revenue || r.conversions || r.sessions || 0)
                  }, 0)
                  const metricDef = METRIC_DEFS[cfg.metric] || METRIC_DEFS.revenue
                  const maxVal = Math.max(...results.slice(0, 4).map(r => {
                    const mk = cfg.metric || 'revenue'
                    return r[mk] || r.revenue || r.conversions || r.sessions || 0
                  }), 1)

                  return (
                    <button
                      key={report.id}
                      onClick={() => {
                        sessionStorage.setItem('sourcetrack_edit_widget', JSON.stringify({
                          id: report.id, name: report.name, ...cfg
                        }))
                        navigate(`/report-builder?edit=${report.id}`)
                      }}
                      className="bg-gray-50 rounded-lg p-3 text-left hover:bg-gray-100 transition-colors border border-gray-100 hover:border-gray-300"
                    >
                      <p className="text-xs font-medium text-st-black truncate">{report.name}</p>
                      <p className="text-lg font-bold text-st-black mt-0.5">
                        {metricDef.format(total)}
                      </p>
                      <p className="text-xs text-st-gray">{metricDef.label} total</p>
                      {cfg.isRolling && (
                        <p className="text-xs text-lime-700 mt-0.5">Rolling — last {cfg.rollingDays || 30} days</p>
                      )}

                      {results.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {results.slice(0, 5).map((r, i) => {
                            const mk = cfg.metric || 'revenue'
                            const val = r[mk] || r.revenue || r.conversions || r.sessions || 0
                            const barW = maxVal > 0 ? (val / maxVal) * 100 : 0
                            return (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="text-xs text-st-gray w-16 truncate flex-shrink-0">
                                  {r.dim_value || '—'}
                                </span>
                                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-st-black rounded-full transition-all" style={{ width: `${barW}%` }} />
                                </div>
                                <span className="text-xs text-gray-600 w-12 text-right flex-shrink-0">
                                  {metricDef.format(val)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      ) : reportQueries[idx]?.isLoading ? (
                        <div className="h-16 flex items-center justify-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400" />
                        </div>
                      ) : (
                        <p className="text-xs text-st-gray mt-2">No data for this period</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </DashboardCard>
          ) : null)}

          {/* Row 1: Recent Leads + Revenue Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <DashboardCard title="Recent Leads" subtitle="Latest attributed conversions by source"
              action={!previewMode && (
                <button onClick={() => navigate('/leads')} className="text-xs text-st-black hover:text-gray-700 font-medium flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              )}
              className="lg:col-span-2"
            >
              {recentLeadsData.length === 0 ? (
                <p className="text-sm text-st-gray py-6 text-center">No recent leads yet. Data will appear as conversions flow in.</p>
              ) : (
                <DashboardTable
                  columns={[
                    { key: 'source', label: 'Source', render: (r) => (
                      <span className="flex items-center gap-2">
                        {r.source}
                        {AI_SOURCES.includes(r.source) && <StatusBadge status="verified" label="AI" />}
                      </span>
                    )},
                    { key: 'conversions', label: 'Conversions', render: (r) => r.conversions, cellClassName: 'text-right text-gray-600' },
                    { key: 'revenue', label: 'Revenue', render: (r) => `$${r.revenue.toFixed(0)}`, cellClassName: 'text-right font-medium text-st-black' },
                    { key: 'status', label: 'Status', render: () => <StatusBadge status="active" label="Active" />, cellClassName: 'text-right' }
                  ]}
                  rows={recentLeadsData}
                  emptyMessage="No recent leads yet. Data will appear as conversions flow in."
                />
              )}
            </DashboardCard>

            <DashboardCard title="Revenue Trend" subtitle={`Last ${timeRange} days`}>
              {timeResults.length === 0 ? (
                <EmptyState icon={TrendingUp} title="No data yet" description="Revenue trend data will appear as conversions flow in." />
              ) : (
                <div className="h-48">
                  <Line data={revTrendData} options={chartOpts('$')} />
                </div>
              )}
            </DashboardCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard title="Leads From AI Search"
              subtitle={aiRevResults.length > 0
                ? `AI platforms drive ${aiShareTotal.toFixed(1)}% of revenue — ${aiRevResults.reduce((s,r) => s + (r.ai_leads||0), 0).toLocaleString()} leads this period`
                : 'Leads, conversions and revenue from AI platforms'}
              action={!previewMode && (
                <button onClick={() => navigate('/report-builder')} className="text-xs text-st-black hover:text-gray-700 font-medium">
                  Analyze
                </button>
              )}
            >
              {aiRevResults.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="Track AI-platform traffic to your site"
                  description="When visitors arrive from ChatGPT, Claude, Perplexity, or other AI tools, they'll appear here with attribution data."
                  action={{ label: 'Set up tracking', onClick: () => navigate('/snippet') }}
                />
              ) : (
                <>
                  {aiShareTotal > 0 && (
                    <div className="mb-4 p-3 bg-lime-50 rounded-lg border border-lime-200">
                      <p className="text-xs text-lime-800">
                        <span className="font-semibold">{aiShareTotal.toFixed(1)}%</span> of your revenue comes from AI platforms.
                        {aiShareTotal > 20 ? ' This is a significant channel — consider optimizing for AI visibility.' :
                         aiShareTotal > 5 ? ' Growing steadily — AI is becoming a meaningful acquisition channel.' :
                         ' Still emerging — track this trend as AI search adoption grows.'}
                      </p>
                    </div>
                  )}
                  <DashboardTable
                    columns={[
                      { key: 'aiSource', label: 'AI Platform', render: (r) => {
                        const name = r.dim_value || 'Unknown'
                        const c = getAIPlatformColor(name)
                        return (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                            {name}
                          </span>
                        )
                      }},
                      { key: 'aiLeads', label: 'Leads', render: (r) => (r.ai_leads || 0).toLocaleString(), cellClassName: 'text-right font-medium text-st-black' },
                      { key: 'aiConversions', label: 'Conv.', render: (r) => (r.ai_conversions || 0).toLocaleString(), cellClassName: 'text-right text-st-gray' },
                      { key: 'aiRevenue', label: 'Revenue', render: (r) => `$${(r.ai_revenue || 0).toFixed(0)}`, cellClassName: 'text-right font-semibold text-st-black' },
                    ]}
                    rows={aiRevResults}
                  />
                </>
              )}
              {aiTrendResults.length > 0 && (
                <div className="h-32 mt-4">
                  <Line data={aiTrendChartData} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, grid: { color: '#f3f4f6' }, ticks: { maxTicksLimit: 3 } },
                      x: { display: false }
                    }
                  }} />
                </div>
              )}
            </DashboardCard>

          </div>

          {/* AI Analytics promo — shown when AI share is meaningful */}
          {aiShareTotal > 5 && !previewMode && (
            <DashboardCard
              title="AI Analytics"
              subtitle={`AI-driven traffic accounts for ${aiShareTotal.toFixed(1)}% of your revenue — use AI Analytics for deeper insights`}
              action={
                <button onClick={() => navigate('/ai-analytics')} className="text-xs text-lime-800 hover:text-lime-700 font-medium flex items-center gap-1">
                  Open AI Analytics <ArrowRight className="w-3 h-3" />
                </button>
              }
            >
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-lime-100 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-lime-600" />
                </div>
                <div className="flex-1">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-st-gray">AI Revenue</p>
                      <p className="text-lg font-semibold text-st-black">${totalAIRevenue.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-st-gray">AI Share</p>
                      <p className="text-lg font-semibold text-st-black">{aiShareTotal.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-st-gray">Platforms</p>
                      <p className="text-lg font-semibold text-st-black">{aiRevResults.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </DashboardCard>
          )}

          {/* T5.4 — Leads Over Time (Channel States) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard title="Leads Over Time" subtitle={`Daily lead trend — last ${timeRange} days`}>
              {channelTrendResults.length === 0 ? (
                <EmptyState icon={TrendingUp} title="No lead data yet" description="Lead trend will appear as conversions flow in." />
              ) : (
                <div className="h-48">
                  <Line data={channelTrendData} options={chartOpts('')} />
                </div>
              )}
            </DashboardCard>

            {/* T5.5 — Leads by Campaign donut */}
            <DashboardCard title="Revenue by Campaign"
              subtitle={topCampaigns.length > 0 ? `Top ${topCampaigns.length} campaigns by revenue` : 'Campaign revenue distribution'}
              action={!previewMode && (
                <button onClick={() => navigate('/campaigns')} className="text-xs text-st-black hover:text-st-gray font-medium">
                  View all
                </button>
              )}
            >
              {topCampaigns.length === 0 ? (
                <EmptyState icon={BarChart3} title="No campaign data yet" description="Tag your URLs with UTM campaign parameters to see distribution here." />
              ) : (
                <div className="h-48">
                  <Doughnut data={campaignDonutData} options={donutOpts} />
                </div>
              )}
            </DashboardCard>
          </div>

          {/* T5.3 — Orders/Leads by Channels bar chart */}
          {activeResults.length > 0 && (
            <DashboardCard
              title={businessType === 'ecommerce' ? 'Orders by Channel' : businessType === 'saas' ? 'Signups by Channel' : 'Leads by Channel'}
              subtitle="Top 8 channels by conversion volume"
            >
              <div className="h-56">
                <Bar data={channelBarData} options={channelBarOpts} />
              </div>
            </DashboardCard>
          )}

          {/* Row 3: Conversion Events + Landing Pages */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard title="Conversion Events"
              subtitle={businessType === 'ecommerce' ? 'Orders, trials and signups' : businessType === 'saas' ? 'Trials, signups and meetings' : 'Leads, signups and meetings'}
              action={!previewMode && (
                <button onClick={() => navigate('/settings')} className="text-xs text-st-black hover:text-gray-700 font-medium">
                  Configure
                </button>
              )}
            >
              {(() => {
                // Priority events by business type
                const priorityKeys = businessType === 'ecommerce'
                  ? ['purchase', 'trial', 'signup', 'lead', 'meeting', 'booking']
                  : businessType === 'saas'
                  ? ['trial', 'signup', 'meeting', 'lead', 'purchase', 'booking']
                  : ['lead', 'meeting', 'signup', 'trial', 'purchase', 'booking']
                const convTypes = overview?.conversion_types || {}
                const sorted = priorityKeys.filter(k => CONVERSION_LABELS[k])
                return (
                  <div className="grid grid-cols-2 gap-3">
                    {sorted.map((key) => {
                      const label = CONVERSION_LABELS[key]
                      const typeData = convTypes[key]
                      const hasData = typeData && typeData.count > 0
                      return (
                        <div key={key} className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-st-gray">{label}</p>
                          <p className="text-lg font-semibold text-st-black mt-0.5">
                            {hasData ? typeData.count.toLocaleString() : '—'}
                          </p>
                          <StatusBadge status={hasData ? 'active' : 'pending'} label={hasData ? 'Active' : 'Not tracking'} />
                        </div>
                      )
                    })}
                    {convTypes.untyped && convTypes.untyped.count > 0 && (
                      <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                        <p className="text-xs text-amber-700">Untagged</p>
                        <p className="text-lg font-semibold text-amber-900 mt-0.5">
                          {convTypes.untyped.count.toLocaleString()}
                        </p>
                        <StatusBadge status="warning" label="Needs type" />
                      </div>
                    )}
                  </div>
                )
              })()}
              {Object.values(overview?.conversion_types || {}).every(t => !t || t.count === 0) && (
                <p className="text-xs text-st-gray mt-3">
                  {businessType === 'ecommerce' ? 'Track purchases and checkouts by sending conversion events.' : businessType === 'saas' ? 'Track free trials and signups by sending conversion events.' : 'Track lead form submissions by sending conversion events.'}
                </p>
              )}
            </DashboardCard>

            <DashboardCard title="Landing Page Performance"
              subtitle="Top pages by attributed revenue"
            >
              {landingResults.length === 0 ? (
                <p className="text-sm text-st-gray py-6 text-center">Landing page data will appear after your first attributed conversions.</p>
              ) : (
                <DashboardTable
                  columns={[
                    { key: 'page', label: 'Page', render: (r) => <span className="text-xs truncate max-w-[200px] block">{r.dim_value || 'unknown'}</span> },
                    { key: 'revenue', label: 'Revenue', render: (r) => `$${(r.revenue || 0).toFixed(0)}`, cellClassName: 'text-right font-medium text-st-black' }
                  ]}
                  rows={landingResults.slice(0, 5)}
                  emptyMessage="Landing page data will appear after your first attributed conversions."
                />
              )}
            </DashboardCard>
          </div>

          {/* Row 5: Model Attribution comparison */}
          <DashboardCard title="Attribution Models"
            subtitle="How revenue distributes across different attribution methods. Non-direct models ignore unbranded/direct traffic."
          >
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {modelRevenues.map((m, i) => {
                const maxRev = Math.max(...modelRevenues.map(x => x.total), 1)
                const barWidth = maxRev > 0 ? (m.total / maxRev) * 100 : 0
                return (
                  <button
                    key={m.model}
                    onClick={() => { setExplainModel(m.model); setExplainModalOpen(true) }}
                    className="bg-white rounded-lg border border-gray-200 p-3 text-center hover:bg-gray-50 transition-colors text-left"
                  >
                    <p className="text-xs text-st-gray mb-1">{m.label}</p>
                    <p className="text-base font-bold text-st-black" style={{ color: COLORS[i % COLORS.length] }}>
                      ${m.total.toFixed(0)}
                    </p>
                    <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${barWidth}%`,
                        backgroundColor: COLORS[i % COLORS.length].replace('0.85)', '1)')
                      }} />
                    </div>
                  </button>
                )
              })}
            </div>
          </DashboardCard>

          {/* T5.1 — Revenue/Leads Payback Analysis */}
          {activeResults.length > 0 && (
            <DashboardCard title="Channel Payback Analysis"
              subtitle="Which channels to scale, pause, or cut — based on revenue vs conversions"
            >
              <div className="space-y-2">
                {activeResults.slice(0, 6).map((r, i) => {
                  const revenue = r.revenue || 0
                  const convs   = r.conversions || 0
                  const name    = r.dim_value || r.source || 'Unknown'
                  const maxRev  = activeResults[0]?.revenue || 1
                  const pct     = Math.round((revenue / maxRev) * 100)
                  // Simple verdict: top 2 = Scale, middle = Watch, bottom = Pause
                  const verdict = i === 0 ? { label: 'Scale', color: 'bg-st-lime text-st-black' }
                    : i <= 1 ? { label: 'Scale', color: 'bg-st-lime text-st-black' }
                    : i <= 3 ? { label: 'Watch', color: 'bg-amber-100 text-amber-700' }
                    : { label: 'Pause', color: 'bg-gray-100 text-st-gray' }
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-st-gray w-28 truncate shrink-0">{name}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-st-black transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-st-black w-14 text-right shrink-0">
                        ${revenue.toFixed(0)}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${verdict.color}`}>
                        {verdict.label}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-st-gray mt-3">
                Scale = top revenue drivers · Watch = mid-tier · Pause = low return. Add spend data in Campaigns for ROAS-based verdicts.
              </p>
            </DashboardCard>
          )}

          {/* T7.5 — AI Forecast teaser card */}
          {!previewMode && (
            <DashboardCard
              title="AI Revenue Forecast"
              subtitle="7-day prediction powered by DeepSeek"
              action={
                <button onClick={() => navigate('/ai-analytics')} className="text-xs text-st-black hover:text-st-gray font-medium flex items-center gap-1">
                  Run Forecast <ArrowRight className="w-3 h-3" />
                </button>
              }
            >
              <div className="flex items-center gap-4 py-2">
                <div className="w-10 h-10 rounded-xl bg-st-lime/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-st-black" />
                </div>
                <div>
                  <p className="text-sm text-st-black font-medium">Predict next 7 days of revenue and leads</p>
                  <p className="text-xs text-st-gray mt-0.5">DeepSeek analyzes your trend, weekly patterns, and momentum</p>
                </div>
              </div>
            </DashboardCard>
          )}


        </>
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
