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
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import {
  Users, ArrowRight, Sparkles, RefreshCw, Zap, AlertTriangle
} from 'lucide-react'
import MetricTile from '../components/MetricTile'
import SetupDoctorCard from '../components/SetupDoctorCard'
import DashboardCard from '../components/DashboardCard'
import DashboardTable from '../components/DashboardTable'
import EmptyState from '../components/EmptyState'
import FilterBar from '../components/FilterBar'
import SupportModeBanner from '../components/SupportModeBanner'
import ConversionExplanationModal from '../components/ConversionExplanationModal'
import { DirectInfo, isDirectLabel } from '../components/DirectInfo'
import { SourceIcon, SourceChip } from '../components/SourceIcon'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend)

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
      { key: 'mrr_estimate',  label: 'MRR (est.)',    format: 'currency' },
      { key: 'ai_revenue',    label: 'AI Revenue',    format: 'currency' },
      { key: 'trial_to_paid', label: 'Trial → Paid',  format: 'percent',
        emptyHint: "Track trial starts with sourcetrack.track('trial_start') to see conversion rate." },
      { key: 'best_rpv',      label: 'Best Channel RPV', format: 'currency' },
    ]
    case 'ecommerce': return [
      { key: 'revenue',    label: 'Total Revenue', format: 'currency' },
      { key: 'aov',        label: 'AOV',           format: 'currency' },
      { key: 'orders',     label: 'Orders',        format: 'number' },
      { key: 'ai_roas',    label: 'AI ROAS',       format: 'number' },
      { key: 'best_rpv',   label: 'Best Channel RPV', format: 'currency' },
    ]
    case 'leadgen': return [
      { key: 'total_leads', label: 'Total Leads', format: 'number' },
      { key: 'lead_growth', label: 'Lead Growth', format: 'percent' },
      { key: 'ai_leads',    label: 'AI Leads',    format: 'number' },
      { key: 'sql_percent', label: 'SQL %',        format: 'percent',
        emptyHint: "Send conversion_type='sql' or 'qualified_lead' to see SQL conversion rate." },
      { key: 'best_rpv',    label: 'Best Channel RPV', format: 'currency' },
    ]
    default: return [
      { key: 'revenue',     label: 'Revenue',     format: 'currency' },
      { key: 'top_channel', label: 'Top Channel', format: 'text' },
      { key: 'conversion',  label: 'Conversion',  format: 'percent' },
      { key: 'cpc',         label: 'CPC',         format: 'currency' },
      { key: 'best_rpv',    label: 'Best Channel RPV', format: 'currency' },
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
  const mrrPrev = kpis.mrr_estimate_prev ?? (businessType === 'saas' && kpis.revenue_prev
    ? (kpis.revenue_prev / (new Date().getDate() || 30)) * 30
    : null)

  // trial_to_paid: computed from conversion_types map.
  // Looks for trial/trial_start events vs paid conversions in the same period.
  // Returns null if no trial data, letting the emptyHint show.
  const ctMap = kpis.conversion_types || {}
  const trialCount = (ctMap['trial'] || 0) + (ctMap['trial_start'] || 0)
  const paidCount  = (ctMap['purchase'] || 0) + (ctMap['subscription'] || 0) + (ctMap['subscribe'] || 0)
  const trialToPaid = trialCount > 0 ? parseFloat(((paidCount / trialCount) * 100).toFixed(1)) : null

  // sql_percent: already returned by the API dashboard route from attributed_conversions
  const sqlPct = kpis.sql_percent ?? null

  return {
    ...kpis,
    mrr_estimate:      mrrNow,
    mrr_estimate_prev: mrrPrev,
    aov:               aovNow,
    trial_to_paid:     trialToPaid,
    sql_percent:       sqlPct,
    revenue_prev:      kpis.revenue_prev      ?? null,
    leads_prev:        kpis.leads_prev        ?? null,
    ai_revenue_prev:   kpis.ai_revenue_prev   ?? null,
    conversions_prev:  kpis.conversions_prev  ?? null,
    sessions_prev:     kpis.sessions_prev     ?? null,
    total_leads_prev:  kpis.leads_prev        ?? null,
    best_rpv_channel:  kpis.best_rpv_channel  ?? '—',
    best_rpv:          kpis.best_rpv          ?? null,
  }
}
// ─────────────────────────────────────────────────────────────────────────────

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

function buildDerivedInsights(kpis, aiShareTotal, aiRevResults, activeResults, businessType) {
  const insights = []
  if (aiShareTotal > 20) {
    insights.push({
      type: 'opportunity', priority: 'opportunity',
      title: 'AI is a major channel',
      desc: `${aiShareTotal.toFixed(1)}% of revenue comes from AI platforms. Consider creating AI-optimised landing pages to capture more of this traffic.`
    })
  } else if (aiShareTotal > 5) {
    insights.push({
      type: 'opportunity', priority: 'opportunity',
      title: 'AI traffic growing',
      desc: `${aiShareTotal.toFixed(1)}% AI revenue share. Trending up — monitor ChatGPT and Perplexity as acquisition channels.`
    })
  }
  if (kpis.conversion_rate != null && kpis.conversion_rate > 0 && kpis.conversion_rate < 1) {
    insights.push({
      type: 'info', priority: 'info',
      title: 'Low conversion rate',
      desc: `${kpis.conversion_rate.toFixed(2)}% conversion rate detected. Review your landing pages and CTA copy.`
    })
  }
  if (activeResults.length > 0 && !activeResults.some(r => r.cac != null)) {
    insights.push({
      type: 'info', priority: 'info',
      title: 'Add spend data for ROAS',
      desc: 'No ad spend data found. Add campaign costs in the Campaigns page to unlock CAC and payback analysis.'
    })
  }
  return insights
}

export default function Dashboard() {
  const { user } = useAuth()
  const { activeSite, loading: siteLoading } = useSite()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [timeRange, setTimeRange] = useState(30)
  const [previewMode, setPreviewMode] = useState(false)
  const [explainModalOpen, setExplainModalOpen] = useState(false)
  const [explainModel, setExplainModel] = useState(null)
  const [previewSiteName, setPreviewSiteName] = useState('')
  const [previewSiteDomain, setPreviewSiteDomain] = useState('')
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const freshnessLabel = useFreshnessLabel(lastRefresh)
  const location = useLocation()
  const activeTab = location.pathname === '/attribution' ? 'attribution' : 'overview'

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

  const { data: dashboardReports = [] } = useQuery({
    queryKey: ['dashboard-widgets', site?.site_key],
    queryFn: async () => {
      if (!site?.site_key) return []
      if (!hasFeature(site?.plan, 'dashboard_widgets')) return []
      return fetchApi(`/reports/saved?site_key=${encodeURIComponent(site.site_key)}&show_on_dashboard=true`)
    },
    enabled: !!site?.site_key && !previewMode && hasFeature(site?.plan, 'dashboard_widgets')
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


  const { data: cacData } = useQuery({
    queryKey: ['dashboard-cac', site?.site_key, overview?.date_from, overview?.date_to],
    queryFn: async () => {
      if (!site?.site_key) return []
      const params = new URLSearchParams({ site_key: site.site_key })
      if (overview?.date_from) params.set('date_from', overview.date_from)
      if (overview?.date_to) params.set('date_to', overview.date_to)
      return fetchApi(`/dashboard/cac?${params}`)
    },
    enabled: !!site?.site_key && !!overview
  })
  const cacResults = Array.isArray(cacData) ? cacData : (cacData?.results || [])
  const cacUnavailable = cacData?.cac_unavailable || false
  const avgCAC = (() => {
    const withSpend = cacResults.filter(r => r.cac != null)
    if (withSpend.length === 0) return null
    return withSpend.reduce((s, r) => s + r.cac, 0) / withSpend.length
  })()

  // ── Annotations ──────────────────────────────────────────────────────────
  const [annotationForm, setAnnotationForm] = useState({ open: false, date: format(new Date(), 'yyyy-MM-dd'), note: '', type: 'note' })
  const [annotationSaving, setAnnotationSaving] = useState(false)

  const dateFrom = format(subDays(new Date(), timeRange), 'yyyy-MM-dd')
  const dateTo   = format(new Date(), 'yyyy-MM-dd')

  const { data: annotationsData, refetch: refetchAnnotations } = useQuery({
    queryKey: ['annotations', site?.site_key, dateFrom, dateTo],
    queryFn: () => fetchApi(`/annotations?site_key=${site.site_key}&date_from=${dateFrom}&date_to=${dateTo}`),
    enabled: !!site?.site_key && !previewMode,
    staleTime: 60_000
  })
  const annotations = Array.isArray(annotationsData) ? annotationsData : []

  const handleSaveAnnotation = async () => {
    if (!site?.site_key || !annotationForm.note.trim()) return
    setAnnotationSaving(true)
    try {
      await fetchApi(`/annotations?site_key=${site.site_key}`, {
        method: 'POST',
        body: JSON.stringify({ date: annotationForm.date, note: annotationForm.note.trim(), type: annotationForm.type })
      })
      setAnnotationForm(f => ({ ...f, open: false, note: '' }))
      await refetchAnnotations()
    } catch (_err) {
      // Table may not exist yet — silently fail rather than crashing the dashboard
    } finally {
      setAnnotationSaving(false)
    }
  }

  const handleDeleteAnnotation = async (id) => {
    if (!site?.site_key) return
    try {
      await fetchApi(`/annotations/${id}?site_key=${site.site_key}`, { method: 'DELETE' })
      await refetchAnnotations()
    } catch (_err) { /* swallow */ }
  }

  // Update freshness timestamp whenever new overview data arrives
  useEffect(() => {
    if (overview) setLastRefresh(new Date())
  }, [overview])


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
  const topPagesResults = overview?.top_pages || []
  const campaignResults = overview?.campaigns || []
  const timeResults = overview?.revenue_trend || []
  const installData = overview?.install
  const alerts = overview?.alerts || []
  const derivedInsights = buildDerivedInsights(kpis, aiShareTotal, aiRevResults, activeResults, businessType)
  const isAnalyticsUnavailable = overview?.analytics_unavailable || false
  const allInsights = [
    ...(isAnalyticsUnavailable ? [{
      id: 'analytics_unavailable',
      type: 'alert',
      priority: 'high',
      severity: 'high',
      title: 'Analytics unavailable',
      desc: 'Analytics are temporarily unavailable. Showing safe fallback data.',
      suggested_action: 'Please refresh the page in a few minutes.'
    }] : []),
    ...(cacUnavailable ? [{
      id: 'cac_unavailable',
      type: 'alert',
      priority: 'medium',
      severity: 'medium',
      title: 'Spend data unavailable',
      desc: 'Spend data is temporarily unavailable.',
      suggested_action: 'Please check back in a few minutes.'
    }] : []),
    ...alerts.map(a => ({ ...a, type: 'alert' })),
    ...derivedInsights
  ]

  const models = overview?.models || {}
  // Hide multi-touch model rows on free plan — the nightly job doesn't compute
  // them for free sites so they would otherwise render as $0 and confuse users.
  const MULTI_TOUCH = new Set(['linear', 'time_decay', 'u_shaped', 'w_shaped'])
  const canMultiTouch = hasFeature(site?.plan, 'multi_touch_attribution')
  const modelRevenues = MODELS
    .filter(m => canMultiTouch || !MULTI_TOUCH.has(m.key))
    .map(m => ({ model: m.key, label: m.label, total: models[m.key] || 0 }))

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

  const chartOpts = (prefix = '$') => {
    const isDark = document.documentElement.classList.contains('dark')
    const gridColor = isDark ? '#2A2E2E' : '#f3f4f6'
    const tickColor = isDark ? '#9CA3AF' : '#6b7280'
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => `${prefix}${v}`, maxTicksLimit: 5 }, grid: { color: gridColor } },
        x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } }
      }
    }
  }

  const recentLeadsData = activeResults.slice(0, 10).map(r => {
    const source = (r.dim_value || r.source || 'unknown').toLowerCase()
    const cacRow = cacResults.find(c => c.channel === source)
    return {
      source: r.dim_value || r.source || 'unknown',
      conversions: r.conversions || 0,
      revenue: r.revenue || 0,
      rpv: r.rpv || 0,
      cac: cacRow?.cac ?? null,
      payback_months: cacRow?.payback_months ?? null
    }
  })

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

  const isEmpty = !isLoading && dashboardReports.length === 0

  const hasRevenue = totalRevenue > 0;
  const hasCost = cacResults && cacResults.length > 0 && !cacUnavailable && avgCAC != null;
  const isGscConnected = site?.gsc_connected || overview?.gsc_connected || false;

  return (
    <div className="st-container space-y-6">
      {previewMode && (
        <SupportModeBanner siteName={previewSiteName} siteDomain={previewSiteDomain} />
      )}

      {/* Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-st-black dark:text-white">
            {location.pathname === '/attribution' ? 'Attribution' : 'Dashboard'}
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
      ) : (
        <>
          {/* Setup Doctor alerts if pixel not verified */}
          {!previewMode && site?.site_key && <SetupDoctorCard siteKey={site.site_key} mode="dashboard" />}

          {/* Onboarding / Installation Alert Banner */}
          {!isLoading && !previewMode && site && (!site.last_seen_at || site.onboarding_completed === false) && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-amber-800 dark:text-amber-400">
                    {site.onboarding_completed === false ? 'Onboarding incomplete' : 'No tracking data received yet'}
                  </h4>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 max-w-2xl leading-relaxed">
                    {site && site.onboarding_completed === false
                      ? "This site hasn't finished onboarding yet. Resume setup to add your tracking snippet and start seeing attribution reports."
                      : "SourceTrack hasn't received any data yet. Install the tracker snippet on your website to start seeing attribution reports."}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {site && site.onboarding_completed === false && site.id && (
                      <button
                        onClick={() => navigate(`/onboarding?site_id=${site.id}&mode=onboarding`)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                      >
                        <Zap className="w-3.5 h-3.5" /> Resume setup
                      </button>
                    )}
                    <button
                      onClick={() => navigate('/snippet')}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" /> Go to Install Guide
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ──────────────────────────────────────────────────────── */}
          {/* TAB 1: OVERVIEW */}
          {/* ──────────────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {activeResults.length === 0 ? (
                <div className="bg-white dark:bg-[#1A1D1D] rounded-2xl border border-gray-150 dark:border-[#2A2E2E] p-12 text-center flex flex-col items-center justify-center space-y-6">
                  <div>
                    <Users className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-st-black dark:text-white mb-2">No attribution data yet</h3>
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
              ) : (
                <>
                  {/* KPI Strip: strictly max 3 primary KPIs */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {hasRevenue ? (
                  <>
                    <MetricTile label="Revenue" value={totalRevenue} format="currency" trend={revenueDelta?.pct} />
                    <MetricTile label="Conversions" value={totalConversions} />
                    <MetricTile label="Conversion Rate" value={convRate} format="percent" />
                  </>
                ) : (
                  <>
                    <MetricTile label="Total Leads" value={totalLeads} trend={leadsDelta?.pct} />
                    <MetricTile label="Conversions" value={totalConversions} />
                    <MetricTile label="Conversion Rate" value={convRate} format="percent" />
                  </>
                )}
              </div>

              {/* AI Attribution Hero */}
              <div className="bg-lime-50 border border-lime-200 dark:bg-lime-950/20 dark:border-lime-900/30 rounded-xl p-5 flex items-start gap-4">
                <div className="p-2 rounded-lg bg-st-lime text-st-black shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-lime-900 dark:text-lime-400 mb-1">AI Referral Context</h3>
                  <p className="text-xs text-lime-700 dark:text-lime-300 leading-relaxed">
                    Detected AI-assisted entry themes and intent mappings. AI search engines like ChatGPT, Claude, Gemini, and Perplexity are analyzed using journey events and source data.
                    {totalAIRevenue > 0 && ` AI platforms contributed $${totalAIRevenue.toLocaleString()} (${aiShareTotal.toFixed(1)}% of total revenue).`}
                  </p>
                </div>
              </div>

              {/* Performance Trend Chart */}
              <DashboardCard title="Performance Trend" subtitle={`Last ${timeRange} days • ${site?.timezone || 'UTC'}`}>
                <div className="h-64">
                  <Line data={hasRevenue ? revTrendData : channelTrendData} options={chartOpts(hasRevenue ? '$' : '')} />
                </div>
              </DashboardCard>

              {/* Top Sources & Recent Conversions */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <DashboardCard title="Top Sources" subtitle="Traffic and conversions by source">
                  {activeResults.length === 0 ? (
                    <p className="text-sm text-st-gray py-6 text-center">No traffic detected yet.</p>
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

                <DashboardCard title="Recent Conversions" subtitle="Latest attributed conversions"
                  action={
                    <button onClick={() => navigate('/leads')} className="text-xs font-semibold text-st-black dark:text-white flex items-center gap-1">
                      View Leads <ArrowRight className="w-3 h-3" />
                    </button>
                  }
                >
                  {!recentActivity || !recentActivity.events || recentActivity.events.length === 0 ? (
                    <p className="text-sm text-st-gray py-6 text-center">No conversions in last 30 minutes.</p>
                  ) : (
                    <DashboardTable
                      columns={[
                        { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.referrer || r.utm_source || 'Direct'} /> },
                        { key: 'event', label: 'Event', render: (r) => r.event === '$conversion' ? 'Conversion' : r.event },
                        { key: 'time', label: 'Time', render: (r) => new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                        { key: 'action', label: 'Action', render: (r) => (
                          <button onClick={() => navigate('/leads')} className="text-xs text-st-black dark:text-white font-semibold hover:underline">
                            View Journey
                          </button>
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
                      <p className="text-sm text-st-gray">No pinned reports yet. Pin reports from the Report Builder.</p>
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
                  <Line data={channelTrendData} options={chartOpts('')} />
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
                  <select
                    value={explainModel || 'last_touch'}
                    onChange={(e) => setExplainModel(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-st-black font-semibold outline-none"
                  >
                    {MODELS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </div>
                <DashboardTable
                  columns={
                    hasRevenue ? [
                      { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.dim_value || r.source || 'Direct'} /> },
                      { key: 'conversions', label: 'Conversions', render: (r) => r.conversions || 0 },
                      { key: 'revenue', label: 'Revenue', render: (r) => `$${(r.revenue || 0).toFixed(2)}` },
                      { key: 'details', label: 'Details', render: (r) => (
                        <button onClick={() => { setExplainModel(explainModel || 'last_touch'); setExplainModalOpen(true) }} className="text-xs text-st-black dark:text-white font-semibold hover:underline">
                          View details
                        </button>
                      )}
                    ] : [
                      { key: 'source', label: 'Source', render: (r) => <SourceChip source={r.dim_value || r.source || 'Direct'} /> },
                      { key: 'conversions', label: 'Conversions', render: (r) => r.conversions || 0 },
                      { key: 'cvr', label: 'CVR%', render: (r) => `${(r.cvr || 0).toFixed(1)}%` },
                      { key: 'details', label: 'Details', render: (r) => (
                        <button onClick={() => { setExplainModel(explainModel || 'last_touch'); setExplainModalOpen(true) }} className="text-xs text-st-black dark:text-white font-semibold hover:underline">
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
                  <p className="text-sm text-st-gray py-6 text-center">No AI referrals detected yet.</p>
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
                  <p className="text-sm text-st-gray py-4 text-center">No search query data matches in this range.</p>
                </DashboardCard>
              )}
            </div>
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
            <h4 className="text-xs font-semibold text-st-black dark:text-white truncate" title={report.name}>{report.name}</h4>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[9px] text-st-gray dark:text-gray-400 mt-0.5">
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-st-black/5 dark:bg-white/10 text-[9px] font-semibold text-st-black dark:text-white"
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
            className="text-[10px] text-st-gray hover:text-st-black dark:hover:text-white font-medium shrink-0"
          >
            Edit
          </button>
        </div>

        {isLoading ? (
          <div className="h-28 flex items-center justify-center">
            <RefreshCw className="w-4 h-4 animate-spin text-st-gray" />
          </div>
        ) : isError ? (
          <div className="h-28 flex flex-col items-center justify-center text-center p-2">
            <span className="text-red-500 text-xs font-semibold">⚠️ Query failed</span>
            <p className="text-[9px] text-st-gray mt-1 leading-normal">
              {error?.message || 'Configuration error'}
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="h-28 flex items-center justify-center text-st-gray text-xs text-center p-4">
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
              <span className="text-2xl font-bold text-st-black dark:text-white tabular-nums">
                {metricDef.format(total)}
              </span>
              <span className="text-[10px] text-st-gray">{metricDef.label}</span>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-gray-100/50 dark:border-[#2A2E2E]/50">
              {results.slice(0, 5).map((r, i) => {
                const mk = cfg.metric || 'revenue'
                const val = r[mk] || r.revenue || r.conversions || r.sessions || 0
                const barW = maxVal > 0 ? (val / maxVal) * 100 : 0
                const label = r.dim_value || '—'
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-st-gray dark:text-gray-400 w-20 truncate flex-shrink-0 inline-flex items-center" title={label}>
                      <span className="truncate">{label}</span>
                      {isDirectLabel(label) && <DirectInfo />}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-st-black dark:bg-white rounded-full transition-all" style={{ width: `${barW}%` }} />
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
