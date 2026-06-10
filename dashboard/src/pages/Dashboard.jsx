import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { useSite } from '../contexts/SiteContext'
import { Line, Doughnut, Bar } from 'react-chartjs-2'
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
  DollarSign, Users, Bot, TrendingUp,
  ArrowRight, Download, ExternalLink, Sparkles, Bookmark,
  FileText, BarChart3, Plus, AlertTriangle, RefreshCw,
  MessageSquare, Zap, TrendingDown, Info, Flag, X, Pencil
} from 'lucide-react'
import MetricTile from '../components/MetricTile'
import DashboardCard from '../components/DashboardCard'
import DashboardTable from '../components/DashboardTable'
import EmptyState from '../components/EmptyState'
import FilterBar from '../components/FilterBar'
import StatusBadge from '../components/StatusBadge'
import SupportModeBanner from '../components/SupportModeBanner'
import ConversionExplanationModal from '../components/ConversionExplanationModal'
import { DirectInfo, isDirectLabel } from '../components/DirectInfo'

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
  { key: 'ai_platforms',           label: 'AI Platforms' },
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
  const [aiQuery, setAiQuery] = useState('')
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
      return fetchApi(`/recent-activity?site_key=${encodeURIComponent(site.site_key)}`)
    },
    enabled: !!site?.site_key && !previewMode,
    refetchInterval: 30000,
  })
  const recentActivity = recentActivityQuery?.data ?? recentActivityQuery ?? null

  const { data: healthQuery, refetch: refetchHealth, isLoading: isHealthLoading } = useQuery({
    queryKey: ['tracking-health', site?.site_key],
    queryFn: async () => {
      if (!site?.site_key) return null
      return fetchApi(`/dashboard/tracking-health?site_key=${encodeURIComponent(site.site_key)}`)
    },
    enabled: !!site?.site_key && !previewMode,
  })
  const healthData = healthQuery?.data ?? healthQuery ?? null

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

  const handleAiQuery = (e) => {
    e?.preventDefault()
    if (!aiQuery.trim()) return
    navigate(`/ai-chat?q=${encodeURIComponent(aiQuery.trim())}`)
    setAiQuery('')
  }

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

  return (
    <div className="st-container space-y-6">
      {previewMode && (
        <SupportModeBanner siteName={previewSiteName} siteDomain={previewSiteDomain} />
      )}

      {/* Header Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-st-black">Performance Overview</h2>
          {site && <p className="text-sm text-st-gray dark:text-gray-400 mt-0.5">{site.domain || site.name}</p>}
        </div>
        {!previewMode && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] text-st-gray text-xs">
              <Users className="w-3.5 h-3.5 text-st-gray" />
              Recent visitors (5m): {liveCount}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] text-st-gray text-xs">
              <RefreshCw className="w-3 h-3" />
              Updated {freshnessLabel}
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
          {/* Setup prompt when tracker not yet verified */}
          {(!healthData || healthData.status === 'pending' || healthData.status === 'never_seen') && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 rounded-xl p-5 text-left">
              <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">Finish setting up</h4>
              <p className="text-xs text-blue-700 dark:text-blue-400 mb-3">
                SourceTrack hasn't received any data yet. Install the tracker snippet on your website to start seeing attribution reports.
              </p>
              <button
                onClick={() => navigate('/snippet')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" /> Go to Install Guide
              </button>
            </div>
          )}

          <div>
            <BarChart3 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-st-black dark:text-white mb-2">No reports yet</h3>
            <p className="text-sm text-st-gray dark:text-gray-400 max-w-md mx-auto">
              {(!healthData || healthData.status === 'pending' || healthData.status === 'never_seen')
                ? 'Install the tracker, then create reports to see your attribution data here.'
                : 'Your dashboard is empty because no reports have been created yet. Build reports for the metrics and attribution views you care about.'}
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
            <p className="text-xs text-st-gray dark:text-gray-400 mb-3">Or start with a template</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => createStarterReport('sources')}
                className="px-5 py-2.5 bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#333838] rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#252929] hover:border-gray-300 flex items-center gap-2"
              >
                <FileText className="w-4 h-4 text-st-gray" /> Sources
              </button>
              <button
                onClick={() => createStarterReport('totals')}
                className="px-5 py-2.5 bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#333838] rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#252929] hover:border-gray-300 flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4 text-st-gray" /> Totals
              </button>
              <button
                onClick={() => createStarterReport('trend')}
                className="px-5 py-2.5 bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#333838] rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#252929] hover:border-gray-300 flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4 text-st-gray" /> Conversion Trend
              </button>
            </div>
          </div>

          <p className="text-xs text-st-gray dark:text-gray-400 max-w-sm mx-auto">
            Templates use live attribution data. Build reports in the Report Builder for more metric and filter options.
          </p>
        </div>
      ) : (
        <>
          {/* ── AI Quick-Query Bar ──────────────────────────────────────── */}
          {!previewMode && (
            <div className="flex items-center gap-3 bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] rounded-xl px-4 py-2.5 shadow-sm">
              <Sparkles className="w-4 h-4 text-st-gray shrink-0" />
              <form onSubmit={handleAiQuery} className="flex-1 flex items-center gap-2 min-w-0">
                <input
                  value={aiQuery}
                  onChange={e => setAiQuery(e.target.value)}
                  placeholder='Ask about your data… e.g. "What is driving most revenue this week?"'
                  className="flex-1 text-sm bg-transparent outline-none text-st-black dark:text-white placeholder:text-gray-400 min-w-0"
                />
                {aiQuery && (
                  <button type="submit"
                    className="shrink-0 px-3 py-1 bg-st-black dark:bg-white text-white dark:text-st-black text-xs rounded-lg font-semibold hover:bg-st-black/90 transition-colors">
                    Ask →
                  </button>
                )}
              </form>
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                {['Best channel', 'AI traffic trend', 'What to scale?'].map(q => (
                  <button key={q}
                    onClick={() => navigate(`/ai-chat?q=${encodeURIComponent(q)}`)}
                    className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-[#252929] text-st-gray hover:bg-gray-200 dark:hover:bg-[#333838] transition-colors whitespace-nowrap">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* SourceTrack Doctor Card */}
          {!previewMode && healthData && (
            <div className="bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-lg ${
                    healthData.severity === 'success' ? 'bg-green-50 text-green-600 dark:bg-green-950/30 dark:text-green-400' :
                    healthData.severity === 'warning' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400' :
                    healthData.severity === 'error' ? 'bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400' :
                    'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400'
                  }`}>
                    {healthData.severity === 'success' && <Info className="w-5 h-5" />}
                    {healthData.severity === 'warning' && <AlertTriangle className="w-5 h-5" />}
                    {healthData.severity === 'error' && <AlertTriangle className="w-5 h-5" />}
                    {healthData.severity === 'info' && <Info className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-st-black dark:text-white">SourceTrack Doctor</h3>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        healthData.status === 'healthy' ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                        healthData.status === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                        healthData.status === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400' :
                        healthData.status === 'pending' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400' :
                        'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {healthData.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{healthData.message}</p>

                    {/* Event metadata details */}
                    {healthData.last_seen_at && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-st-gray dark:text-gray-500 mt-2">
                        <span>Last Event: <strong className="text-gray-700 dark:text-gray-300">{healthData.last_event_name}</strong></span>
                        <span>Seen At: <strong className="text-gray-700 dark:text-gray-300">{new Date(healthData.last_seen_at).toLocaleString()}</strong></span>
                        {healthData.last_event_domain && (
                          <span>Source Domain: <strong className="text-gray-700 dark:text-gray-300">{healthData.last_event_domain}</strong></span>
                        )}
                        {healthData.registered_domain && (
                          <span>Registered Domain: <strong className="text-gray-700 dark:text-gray-300">{healthData.registered_domain}</strong></span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 self-start sm:self-center shrink-0">
                  <button
                    onClick={() => navigate('/debugger')}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-[#252929] hover:bg-gray-200 dark:hover:bg-[#333838] rounded-lg transition-colors flex items-center gap-1"
                  >
                    <FileText className="w-3.5 h-3.5" /> Event Logger
                  </button>
                  {site && (
                    <button
                      onClick={() => navigate('/snippet')}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-[#252929] hover:bg-gray-200 dark:hover:bg-[#333838] rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Zap className="w-3.5 h-3.5" /> View Snippet
                    </button>
                  )}
                  <button
                    onClick={() => refetchHealth()}
                    disabled={isHealthLoading}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-[#252929] hover:bg-gray-200 dark:hover:bg-[#333838] rounded-lg transition-colors flex items-center gap-1 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isHealthLoading ? 'animate-spin' : ''}`} /> Try Again
                  </button>
                </div>
              </div>

              {/* Individual Checks Grid */}
              {healthData.checks && healthData.checks.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-gray-100 dark:border-[#2A2E2E]">
                  {healthData.checks.map((check, i) => (
                    <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-gray-50 dark:bg-[#252929]/50">
                      <span className="font-medium text-gray-600 dark:text-gray-400">{check.label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          check.status === 'passed' ? 'bg-green-500' :
                          check.status === 'warning' ? 'bg-amber-500' :
                          check.status === 'failed' ? 'bg-red-500' :
                          check.status === 'pending' ? 'bg-blue-500' :
                          'bg-gray-400'
                        }`} />
                        <span className="text-gray-500 dark:text-gray-400">{check.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Recent Activity Panel ── */}
          {!previewMode && (
            <div className="bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-[#2A2E2E] pb-3">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-st-gray" />
                  <h3 className="font-semibold text-st-black dark:text-white text-sm sm:text-base">Recent Activity — Last 30 minutes</h3>
                  <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded font-normal">Auto-refreshes every 30s</span>
                </div>
                <button
                  onClick={() => navigate('/debugger')}
                  className="text-xs text-st-gray hover:text-st-black dark:hover:text-white font-medium flex items-center gap-1"
                >
                  View Event Debugger <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              {!recentActivity || (!recentActivity.pageviews && !recentActivity.visitors && !recentActivity.conversions && (!recentActivity.events || recentActivity.events.length === 0)) ? (
                <div className="text-center py-6 text-sm text-st-gray dark:text-gray-400">
                  No recent activity yet. Visit your site or trigger a test event.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Stats Column */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Metrics Summary</h4>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-gray-50 dark:bg-[#252929]/50 p-3 rounded-lg border border-gray-100 dark:border-[#2A2E2E] text-center">
                        <div className="text-xs text-st-gray mb-1">Visitors</div>
                        <div className="text-lg font-bold text-st-black dark:text-white">{recentActivity.visitors || 0}</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-[#252929]/50 p-3 rounded-lg border border-gray-100 dark:border-[#2A2E2E] text-center">
                        <div className="text-xs text-st-gray mb-1">Pageviews</div>
                        <div className="text-lg font-bold text-st-black dark:text-white">{recentActivity.pageviews || 0}</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-[#252929]/50 p-3 rounded-lg border border-gray-100 dark:border-[#2A2E2E] text-center">
                        <div className="text-xs text-st-gray mb-1">Conversions</div>
                        <div className="text-lg font-bold text-st-black dark:text-white">{recentActivity.conversions || 0}</div>
                      </div>
                    </div>

                    {/* Top Channels/Referrers breakdown inside the panel */}
                    <div className="space-y-3 pt-2">
                      {recentActivity.top_channels && recentActivity.top_channels.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-st-gray mb-1.5">Top Channels</div>
                          <div className="space-y-1">
                            {recentActivity.top_channels.map((tc, idx) => {
                              const label = tc.name || 'Direct'
                              return (
                                <div key={idx} className="flex justify-between items-center text-xs">
                                  <span className="text-gray-700 dark:text-gray-300 font-medium inline-flex items-center">
                                    {label}
                                    {isDirectLabel(label) && <DirectInfo />}
                                  </span>
                                  <span className="text-st-gray">{tc.count} event{tc.count > 1 ? 's' : ''}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {recentActivity.top_referrers && recentActivity.top_referrers.length > 0 && (
                        <div className="pt-2">
                          <div className="text-xs font-medium text-st-gray mb-1.5">Top Referrers</div>
                          <div className="space-y-1">
                            {recentActivity.top_referrers.map((tr, idx) => {
                              const label = tr.name || 'Direct'
                              return (
                                <div key={idx} className="flex justify-between items-center text-xs">
                                  <span className="text-gray-700 dark:text-gray-300 truncate max-w-[200px] inline-flex items-center">
                                    {label}
                                    {isDirectLabel(label) && <DirectInfo />}
                                  </span>
                                  <span className="text-st-gray">{tr.count} visit{tr.count > 1 ? 's' : ''}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top Pages Column */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Top Pages (Last 30m)</h4>
                    {recentActivity.top_pages && recentActivity.top_pages.length > 0 ? (
                      <div className="space-y-2">
                        {recentActivity.top_pages.map((tp, idx) => (
                          <div key={idx} className="bg-gray-50 dark:bg-[#252929]/30 p-2.5 rounded-lg border border-gray-100 dark:border-[#2A2E2E] flex justify-between items-center text-xs">
                            <span className="text-gray-700 dark:text-gray-300 font-mono truncate max-w-[180px] sm:max-w-[240px]">{tp.path || '/'}</span>
                            <span className="bg-gray-200/60 dark:bg-[#333838] px-2 py-0.5 rounded text-st-black dark:text-white font-semibold">{tp.count} view{tp.count > 1 ? 's' : ''}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-st-gray py-4">No pageview events.</div>
                    )}
                  </div>

                  {/* Recent Events List Column */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Event Feed</h4>
                    {recentActivity.events && recentActivity.events.length > 0 ? (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {recentActivity.events.map((evt, idx) => (
                          <div key={idx} className="p-2 rounded-lg border border-gray-100 dark:border-[#2A2E2E] bg-gray-50 dark:bg-[#252929]/20 flex justify-between items-center text-xs gap-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${evt.event === '$conversion' ? 'bg-green-500' : 'bg-blue-400'}`} />
                                <span className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                                  {evt.event === '$pageview' ? 'Pageview' : evt.event === '$conversion' ? 'Conversion' : evt.event}
                                </span>
                              </div>
                              <div className="text-[10px] text-st-gray mt-0.5 truncate font-mono">
                                {evt.page_path || '/'}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              {evt.conversion_value != null && evt.conversion_value > 0 && (
                                <span className="text-xs font-bold text-green-600 dark:text-green-400 block">${evt.conversion_value.toFixed(2)}</span>
                              )}
                              <span className="text-[10px] text-st-gray">
                                {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-st-gray py-4">No events found.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Priority Insights Board ─────────────────────────────────── */}
          {allInsights.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3 h-3" /> Insights & Alerts
                </p>
                <span className="text-xs text-st-gray">{allInsights.length} item{allInsights.length > 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {allInsights.slice(0, 6).map((insight, i) => {
                  const priority = insight.severity || insight.priority || 'info'
                  const isHigh = priority === 'high'
                  const isMed  = priority === 'medium'
                  const isOpp  = insight.type === 'opportunity'
                  const bg   = isHigh ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                               : isMed ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                               : isOpp ? 'bg-lime-50 dark:bg-lime-900/20 border-lime-200 dark:border-lime-800'
                               : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                  const dot  = isHigh ? 'bg-red-500' : isMed ? 'bg-amber-500' : isOpp ? 'bg-lime-500' : 'bg-blue-500'
                  const tag  = isHigh ? 'bg-red-100 text-red-700' : isMed ? 'bg-amber-100 text-amber-700' : isOpp ? 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-400' : 'bg-blue-100 text-blue-700'
                  const tagLabel = isHigh ? 'HIGH' : isMed ? 'MED' : isOpp ? 'OPPORTUNITY' : 'INFO'
                  const title = insight.metric || insight.title || 'Alert'
                  const desc  = insight.message || insight.desc || ''
                  return (
                    <div key={i} className={`rounded-xl px-4 py-3 border flex items-start gap-3 ${bg}`}>
                      <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${tag}`}>
                            {tagLabel}
                          </span>
                          <span className="text-xs font-semibold text-st-black dark:text-white truncate">{title}</span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{desc}</p>
                        {insight.suggested_action && (
                          <p className="text-[10px] text-st-gray dark:text-gray-500 mt-1">{insight.suggested_action}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* KPI Strip — T2.1: business-type aware with deltas */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {kpiConfig.map((metric) => {
              if (metric.key === 'best_rpv') {
                const channel = enrichedKpis?.best_rpv_channel || '—'
                const rpvValue = enrichedKpis?.best_rpv ?? null
                return (
                  <div key="best_rpv" className="metric-tile bg-white dark:bg-[#1A1D1D] rounded-xl p-5 shadow-sm border border-gray-100 dark:border-[#2A2E2E] flex flex-col gap-1">
                    <p className="text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wide">Best Channel RPV</p>
                    <p className="text-2xl font-semibold text-st-black dark:text-white tabular-nums truncate">{channel}</p>
                    {rpvValue != null && (
                      <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">
                        ${rpvValue.toFixed(2)} per visitor
                      </p>
                    )}
                  </div>
                )
              }
              const rawValue  = enrichedKpis?.[metric.key] ?? null
              const prevValue = enrichedKpis?.[metric.key + '_prev'] ?? null
              // isEmpty: value is null AND there's a hint to show (setup instruction)
              const isEmpty   = rawValue == null && !!metric.emptyHint
              const delta = (!isEmpty && rawValue != null && prevValue != null && prevValue !== 0)
                ? ((rawValue - prevValue) / Math.abs(prevValue)) * 100
                : null
              return (
                <MetricTile
                  key={metric.key}
                  label={metric.label}
                  value={isEmpty ? metric.emptyHint : rawValue}
                  format={isEmpty ? 'text' : metric.format}
                  trend={isEmpty ? null : delta}
                />
              )
            })}
            {/* Avg CAC KPI tile */}
            <div className="metric-tile bg-white dark:bg-[#1A1D1D] rounded-xl p-5 shadow-sm border border-gray-100 dark:border-[#2A2E2E] flex flex-col gap-1">
              <p className="text-xs font-medium text-st-gray dark:text-gray-400 uppercase tracking-wide">Avg CAC</p>
              {cacUnavailable ? (
                <>
                  <p className="text-2xl font-semibold text-amber-500">Unavailable</p>
                  <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">spend data unavailable</p>
                </>
              ) : avgCAC != null ? (
                <>
                  <p className="text-2xl font-semibold text-st-black dark:text-white tabular-nums">${avgCAC.toFixed(2)}</p>
                  <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">cost per new customer</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold text-st-gray dark:text-gray-400">Add spend data</p>
                  <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">cost per new customer</p>
                </>
              )}
            </div>
          </div>

          {/* Pinned Reports widgets - isolated states, custom sizes, max 9 */}
          {!previewMode && hasFeature(site?.plan, 'dashboard_widgets') && (
            <DashboardCard title="Pinned Reports"
              subtitle="Saved report widgets pinned to your dashboard — max 9"
              action={
                <button onClick={() => navigate('/report-builder')} className="text-xs text-st-black dark:text-white hover:text-gray-700 font-medium flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Manage Reports
                </button>
              }
            >
              {dashboardReports.length === 0 ? (
                <div className="text-center py-8 bg-gray-50/50 dark:bg-[#111414]/30 rounded-lg border border-dashed border-gray-200 dark:border-[#2A2E2E] p-6">
                  <Bookmark className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No reports pinned to dashboard</p>
                  <p className="text-xs text-st-gray dark:text-gray-500 mt-1 max-w-sm mx-auto mb-3">
                    Pin your saved reports from the Report Builder to display them as widgets on your dashboard.
                  </p>
                  <button onClick={() => navigate('/report-builder')} className="px-3 py-1.5 bg-st-black text-white rounded-lg text-xs font-bold hover:bg-gray-800">
                    Go to Report Builder
                  </button>
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

          {/* Row 1: Recent Leads + Revenue Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <DashboardCard title="Recent Leads" subtitle="Latest attributed conversions by source"
              action={!previewMode && (
                <button onClick={() => navigate('/leads')} className="text-xs text-st-black dark:text-white hover:text-gray-700 font-medium flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              )}
              className="lg:col-span-2"
            >
              {recentLeadsData.length === 0 ? (
                <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No recent leads yet. Data will appear as conversions flow in.</p>
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
                    { key: 'rpv', label: 'Rev/Conv', render: (r) => `$${(r.rpv || 0).toFixed(2)}`, cellClassName: 'text-right text-st-gray' },
                    { key: 'cac', label: 'CAC', render: (r) => cacUnavailable ? 'Unavailable' : (r.cac != null ? `$${r.cac.toFixed(2)}` : 'No spend data'), cellClassName: 'text-right text-gray-600' },
                    { key: 'payback', label: 'Payback', render: (r) => cacUnavailable ? 'Unavailable' : (r.payback_months != null ? `${r.payback_months.toFixed(1)} mo` : '—'), cellClassName: 'text-right text-st-gray' },
                    { key: 'status', label: 'Status', render: () => <StatusBadge status="active" label="Active" />, cellClassName: 'text-right' }
                  ]}
                  rows={recentLeadsData}
                  emptyMessage="No recent leads yet. Data will appear as conversions flow in."
                />
              )}
            </DashboardCard>

            <DashboardCard
              title="Revenue Trend"
              subtitle={`Last ${timeRange} days • ${site?.timezone || 'UTC'}`}
              action={!previewMode && (
                <button
                  onClick={() => setAnnotationForm(f => ({ ...f, open: !f.open, date: format(new Date(), 'yyyy-MM-dd'), note: '' }))}
                  className="flex items-center gap-1 text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white transition-colors"
                >
                  <Flag className="w-3 h-3" /> Annotate
                </button>
              )}
            >
              {timeResults.length === 0 ? (
                <EmptyState icon={TrendingUp} title="No data yet" description="Revenue trend data will appear as conversions flow in." />
              ) : (
                <div className="h-48">
                  <Line data={revTrendData} options={chartOpts('$')} />
                </div>
              )}

              {/* Annotation add form */}
              {annotationForm.open && !previewMode && (
                <div className="mt-3 p-3 bg-gray-50 dark:bg-[#111414] rounded-lg border border-gray-200 dark:border-[#2A2E2E] space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={annotationForm.date}
                      onChange={e => setAnnotationForm(f => ({ ...f, date: e.target.value }))}
                      className="px-2 py-1 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded text-xs focus:outline-none"
                    />
                    <select
                      value={annotationForm.type}
                      onChange={e => setAnnotationForm(f => ({ ...f, type: e.target.value }))}
                      className="px-2 py-1 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded text-xs focus:outline-none"
                    >
                      <option value="note">Note</option>
                      <option value="deploy">Deploy</option>
                      <option value="campaign">Campaign</option>
                      <option value="alert">Alert</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={annotationForm.note}
                      onChange={e => setAnnotationForm(f => ({ ...f, note: e.target.value }))}
                      placeholder="e.g. Launched new landing page"
                      maxLength={280}
                      className="flex-1 px-2 py-1 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded text-xs focus:outline-none"
                      onKeyDown={e => e.key === 'Enter' && handleSaveAnnotation()}
                    />
                    <button
                      onClick={handleSaveAnnotation}
                      disabled={annotationSaving || !annotationForm.note.trim()}
                      className="px-3 py-1 bg-st-black dark:bg-white text-white dark:text-st-black text-xs font-semibold rounded hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      {annotationSaving ? '…' : 'Add'}
                    </button>
                    <button
                      onClick={() => setAnnotationForm(f => ({ ...f, open: false }))}
                      className="p-1 text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Existing annotations */}
              {annotations.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {annotations.map(a => (
                    <div key={a.id} className="flex items-start gap-2 group">
                      <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                        a.type === 'deploy'   ? 'bg-blue-400' :
                        a.type === 'campaign' ? 'bg-green-400' :
                        a.type === 'alert'    ? 'bg-red-400'  : 'bg-gray-400'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-mono text-st-gray dark:text-gray-500 mr-1.5">{a.date}</span>
                        <span className="text-xs text-st-black dark:text-white">{a.note}</span>
                      </div>
                      {!previewMode && (
                        <button
                          onClick={() => handleDeleteAnnotation(a.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-st-gray dark:text-gray-400 hover:text-red-500 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
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
                <button onClick={() => navigate('/report-builder')} className="text-xs text-st-black dark:text-white hover:text-gray-700 font-medium">
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
              subtitle={`AI-driven traffic accounts for ${aiShareTotal.toFixed(1)}% of your revenue — view AI Sources for deeper insights`}
              action={
                <button onClick={() => navigate('/analytics?tab=ai_source')} className="text-xs text-lime-800 hover:text-lime-700 font-medium flex items-center gap-1">
                  View AI Sources <ArrowRight className="w-3 h-3" />
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
            <DashboardCard title="Leads Over Time" subtitle={`Daily lead trend — last ${timeRange} days • ${site?.timezone || 'UTC'}`}>
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
                <button onClick={() => navigate('/campaigns')} className="text-xs text-st-black dark:text-white hover:text-st-gray dark:text-gray-400 font-medium">
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
                <button onClick={() => navigate('/settings')} className="text-xs text-st-black dark:text-white hover:text-gray-700 font-medium">
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
                        <div key={key} className="bg-gray-50 dark:bg-[#111414] rounded-lg p-3">
                          <p className="text-xs text-st-gray">{label}</p>
                          <p className="text-lg font-semibold text-st-black dark:text-white mt-0.5">
                            {hasData ? typeData.count.toLocaleString() : '—'}
                          </p>
                          <StatusBadge status={hasData ? 'active' : 'pending'} label={hasData ? 'Active' : 'Not tracking'} />
                        </div>
                      )
                    })}
                    {convTypes.untyped && convTypes.untyped.count > 0 && (
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-100">
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
                <p className="text-xs text-st-gray dark:text-gray-400 mt-3">
                  {businessType === 'ecommerce' ? 'Track purchases and checkouts by sending conversion events.' : businessType === 'saas' ? 'Track free trials and signups by sending conversion events.' : 'Track lead form submissions by sending conversion events.'}
                </p>
              )}
            </DashboardCard>

            <DashboardCard title="Top Pages"
              subtitle="Most visited pages by pageviews"
            >
              {topPagesResults.length === 0 ? (
                <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">No pageview data for this date range.</p>
              ) : (
                <DashboardTable
                  columns={[
                    { key: 'path', label: 'Path', render: (r) => <span className="text-xs truncate max-w-[200px] block">{r.path || '/'}</span> },
                    { key: 'views', label: 'Views', render: (r) => (r.views || 0).toLocaleString(), cellClassName: 'text-right font-medium text-st-black' }
                  ]}
                  rows={topPagesResults.slice(0, 5)}
                  emptyMessage="No pageview data for this date range."
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
                    className="bg-white dark:bg-[#1A1D1D] rounded-lg border border-gray-200 dark:border-[#333838] p-3 text-center hover:bg-gray-50 dark:hover:bg-[#252929] transition-colors text-left"
                  >
                    <p className="text-xs text-st-gray dark:text-gray-400 mb-1">{m.label}</p>
                    <p className="text-base font-bold text-st-black" style={{ color: COLORS[i % COLORS.length] }}>
                      ${m.total.toFixed(0)}
                    </p>
                    <div className="mt-2 h-1 bg-gray-100 dark:bg-[#252929] rounded-full overflow-hidden">
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
                    : { label: 'Pause', color: 'bg-gray-100 dark:bg-[#252929] text-st-gray' }
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-st-gray dark:text-gray-400 w-28 truncate shrink-0">{name}</span>
                      <div className="flex-1 h-2 bg-gray-100 dark:bg-[#252929] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-st-black transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-st-black dark:text-white w-14 text-right shrink-0">
                        ${revenue.toFixed(0)}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${verdict.color}`}>
                        {verdict.label}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-st-gray dark:text-gray-400 mt-3">
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
                <button onClick={() => navigate('/report-builder')} className="text-xs text-st-black dark:text-white hover:text-st-gray dark:text-gray-400 font-medium flex items-center gap-1">
                  Create AI Report <ArrowRight className="w-3 h-3" />
                </button>
              }
            >
              <div className="flex items-center gap-4 py-2">
                <div className="w-10 h-10 rounded-xl bg-st-lime/10 dark:bg-st-lime/5 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-st-black" />
                </div>
                <div>
                  <p className="text-sm text-st-black dark:text-white font-medium">Predict next 7 days of revenue and leads</p>
                  <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">DeepSeek analyzes your trend, weekly patterns, and momentum</p>
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
