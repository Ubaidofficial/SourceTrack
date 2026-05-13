import { useState, useEffect } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import {
  DollarSign, Users, Bot, TrendingUp,
  ArrowRight, Download, ExternalLink, Sparkles, Bookmark,
  FileText, BarChart3, Plus
} from 'lucide-react'
import MetricTile from '../components/MetricTile'
import DashboardCard from '../components/DashboardCard'
import DashboardTable from '../components/DashboardTable'
import EmptyState from '../components/EmptyState'
import FilterBar from '../components/FilterBar'
import StatusBadge from '../components/StatusBadge'
import SupportModeBanner from '../components/SupportModeBanner'
import ConversionExplanationModal from '../components/ConversionExplanationModal'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend)

const MODELS = [
  { key: 'first_touch', label: 'First Touch' },
  { key: 'last_touch', label: 'Last Touch' },
  { key: 'first_touch_non_direct', label: 'First Touch (Non-Direct)' },
  { key: 'last_touch_non_direct', label: 'Last Touch (Non-Direct)' },
  { key: 'ai_platforms', label: 'AI Platforms' }
]

const AI_SOURCES = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok', 'Copilot', 'DeepSeek', 'You.com AI', 'Phind', 'Kagi']
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

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [timeRange, setTimeRange] = useState(30)
  const [previewMode, setPreviewMode] = useState(false)
  const [explainModalOpen, setExplainModalOpen] = useState(false)
  const [explainModel, setExplainModel] = useState(null)
  const [ltvModel, setLtvModel] = useState('first_touch')
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
      const { data } = await supabase
        .from('sites')
        .select('site_key, name, domain')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()
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
      return {
        queryKey: ['saved-report-data', r.id, site?.site_key],
        queryFn: async () => {
          if (!site?.site_key) return null
          const params = new URLSearchParams({
            site_key: site.site_key,
            model: cfg.model || 'last_touch',
            date_from: cfg.dateFrom || format(subDays(new Date(), 30), 'yyyy-MM-dd'),
            date_to: cfg.dateTo || format(new Date(), 'yyyy-MM-dd'),
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

  // LTV comparison: fetch LTV revenue for all single-touch models
  const ltvQueries = useQueries({
    queries: MODELS.filter(m => m.key !== 'ai_platforms').map((m) => ({
      queryKey: ['ltv-model', m.key, site?.site_key, timeRange],
      queryFn: async () => {
        if (!site?.site_key) return null
        const from = format(subDays(new Date(), timeRange), 'yyyy-MM-dd')
        const to = format(new Date(), 'yyyy-MM-dd')
        const params = new URLSearchParams({
          site_key: site.site_key,
          model: m.key,
          date_from: from,
          date_to: to,
          group_by: 'source',
          metric: 'ltv_revenue'
        })
        return fetchApi(`/attribution?${params}`)
      },
      enabled: !!site?.site_key
    }))
  })

  // Session analytics query
  const { data: sessionOverview, isLoading: sessionsLoading } = useQuery({
    queryKey: ['sessions-overview', site?.site_key, timeRange],
    queryFn: async () => {
      if (!site?.site_key) return null
      const from = format(subDays(new Date(), timeRange), 'yyyy-MM-dd')
      const to = format(new Date(), 'yyyy-MM-dd')
      const params = new URLSearchParams({
        site_key: site.site_key,
        date_from: from,
        date_to: to
      })
      return fetchApi(`/sessions/overview?${params}`)
    },
    enabled: !!site?.site_key
  })

  const kpis = overview?.kpis || {}
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
          <h2 className="text-2xl font-bold text-gray-900">Performance Overview</h2>
          {site && <p className="text-sm text-gray-500 mt-0.5">{site.domain || site.name}</p>}
        </div>
        {!previewMode && (
          <div className="flex items-center gap-3">
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      ) : isEmpty ? (
        /* Empty state — no saved reports */
        <div className="max-w-2xl mx-auto py-12 text-center space-y-8">
          <div>
            <BarChart3 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No reports yet</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
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
            <p className="text-xs text-gray-400 mb-3">Or start with a template</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => createStarterReport('sources')}
                className="px-5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 flex items-center gap-2"
              >
                <FileText className="w-4 h-4 text-gray-400" /> Sources
              </button>
              <button
                onClick={() => createStarterReport('totals')}
                className="px-5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4 text-gray-400" /> Totals
              </button>
              <button
                onClick={() => createStarterReport('trend')}
                className="px-5 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4 text-gray-400" /> Conversion Trend
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Templates use live attribution data. Build reports in the Report Builder for more metric and filter options.
          </p>
        </div>
      ) : (
        <>
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricTile label="Revenue" value={`$${totalRevenue.toFixed(0)}`} delta={revenueDelta}
              icon={DollarSign} iconBg="bg-green-100" iconColor="text-green-600" />
            <MetricTile label="Leads" value={totalLeads.toLocaleString()} delta={leadsDelta}
              icon={Users} iconBg="bg-blue-100" iconColor="text-blue-600" />
            <MetricTile label="AI Revenue" value={`$${totalAIRevenue.toFixed(0)}`}
              delta={aiDelta}
              icon={Bot} iconBg="bg-lime-100" iconColor="text-lime-700" />
            <MetricTile label="Conversion Rate" value={`${convRate.toFixed(1)}%`}
              icon={TrendingUp} iconBg="bg-purple-100" iconColor="text-purple-600" />
            <MetricTile label="Avg Value" value={`$${avgValue.toFixed(2)}`}
              icon={DollarSign} iconBg="bg-orange-100" iconColor="text-orange-600" />
          </div>

          {/* Saved Reports — shown first, above the analytics wall */}
          {!previewMode && (savedReports.length > 0 ? (
            <DashboardCard title="Your Reports"
              subtitle="Saved report configurations — data fetched live"
              action={
                <button onClick={() => navigate('/report-builder')} className="text-xs text-gray-900 hover:text-gray-700 font-medium flex items-center gap-1">
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
                      <p className="text-xs font-medium text-gray-900 truncate">{report.name}</p>
                      <p className="text-lg font-bold text-gray-900 mt-0.5">
                        {metricDef.format(total)}
                      </p>
                      <p className="text-xs text-gray-400">{metricDef.label} total</p>

                      {results.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {results.slice(0, 5).map((r, i) => {
                            const mk = cfg.metric || 'revenue'
                            const val = r[mk] || r.revenue || r.conversions || r.sessions || 0
                            const barW = maxVal > 0 ? (val / maxVal) * 100 : 0
                            return (
                              <div key={i} className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-500 w-16 truncate flex-shrink-0">
                                  {r.dim_value || '—'}
                                </span>
                                <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div className="h-full bg-gray-900 rounded-full transition-all" style={{ width: `${barW}%` }} />
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
                        <p className="text-xs text-gray-400 mt-2">No data for this period</p>
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
                <button onClick={() => navigate('/leads')} className="text-xs text-gray-900 hover:text-gray-700 font-medium flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              )}
              className="lg:col-span-2"
            >
              {recentLeadsData.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">No recent leads yet. Data will appear as conversions flow in.</p>
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
                    { key: 'revenue', label: 'Revenue', render: (r) => `$${r.revenue.toFixed(0)}`, cellClassName: 'text-right font-medium text-gray-900' },
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

          {/* Row 2: AI Sources Performance + Revenue Source Attribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard title="AI Sources Performance"
              subtitle={aiRevResults.length > 0
                ? `AI platforms drive ${aiShareTotal.toFixed(1)}% of your total revenue`
                : 'Revenue and conversions from AI platforms'}
              action={!previewMode && (
                <button onClick={() => navigate('/report-builder')} className="text-xs text-gray-900 hover:text-gray-700 font-medium">
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
                      { key: 'aiSource', label: 'AI Source', render: (r) => <span className="font-medium">{r.dim_value || 'unknown'}</span> },
                      { key: 'aiRevenue', label: 'Revenue', render: (r) => `$${(r.ai_revenue || 0).toFixed(0)}`, cellClassName: 'text-right text-gray-900' },
                      { key: 'aiConversions', label: 'Conversions', render: (r) => (r.ai_conversions || 0).toLocaleString(), cellClassName: 'text-right text-gray-600' }
                    ]}
                    rows={aiRevResults.slice(0, 5)}
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

            <DashboardCard title="Revenue Source Attribution"
              subtitle="Top channels by attributed revenue"
              action={!previewMode && (
                <button onClick={() => navigate('/campaigns')} className="text-xs text-gray-900 hover:text-gray-700 font-medium flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              )}
            >
              {activeResults.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">No attribution data yet. Start sending events to see source breakdown.</p>
              ) : (
                <DashboardTable
                  columns={[
                    { key: 'source', label: 'Source', render: (r) => r.dim_value || r.source || 'unknown' },
                    { key: 'revenue', label: 'Revenue', render: (r) => `$${(r.revenue || 0).toFixed(0)}`, cellClassName: 'text-right font-medium text-gray-900' },
                    { key: 'share', label: 'Share', render: (r) => totalRevenue > 0 ? `${((r.revenue / totalRevenue) * 100).toFixed(1)}%` : '—', cellClassName: 'text-right text-gray-500' }
                  ]}
                  rows={activeResults.slice(0, 7)}
                  emptyMessage="No attribution data yet. Start sending events to see source breakdown."
                />
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
                      <p className="text-xs text-gray-500">AI Revenue</p>
                      <p className="text-lg font-semibold text-gray-900">${totalAIRevenue.toFixed(0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">AI Share</p>
                      <p className="text-lg font-semibold text-gray-900">{aiShareTotal.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Platforms</p>
                      <p className="text-lg font-semibold text-gray-900">{aiRevResults.length}</p>
                    </div>
                  </div>
                </div>
              </div>
            </DashboardCard>
          )}

          {/* Row 3: Conversion Events + Landing Pages */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard title="Conversion Events"
              subtitle="Tracked conversion types across your site"
              action={!previewMode && (
                <button onClick={() => navigate('/settings')} className="text-xs text-gray-900 hover:text-gray-700 font-medium">
                  Configure
                </button>
              )}
            >
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(CONVERSION_LABELS).map(([key, label]) => {
                  const typeData = overview?.conversion_types?.[key]
                  const hasData = typeData && typeData.count > 0
                  return (
                    <div key={key} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">{label}</p>
                      <p className="text-lg font-semibold text-gray-900 mt-0.5">
                        {hasData ? typeData.count.toLocaleString() : '—'}
                      </p>
                      <StatusBadge status={hasData ? 'active' : 'pending'} label={hasData ? 'Active' : 'Not tracking'} />
                    </div>
                  )
                })}
                {overview?.conversion_types?.untyped && overview.conversion_types.untyped.count > 0 && (
                  <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                    <p className="text-xs text-amber-700">Untagged</p>
                    <p className="text-lg font-semibold text-amber-900 mt-0.5">
                      {overview.conversion_types.untyped.count.toLocaleString()}
                    </p>
                    <StatusBadge status="warning" label="Needs type" />
                  </div>
                )}
              </div>
              {Object.values(overview?.conversion_types || {}).every(t => !t || t.count === 0) && (
                <p className="text-xs text-gray-400 mt-3">
                  When conversions specify a type (e.g., lead, purchase), counts appear here. Previous conversions without a type are counted as untagged.
                </p>
              )}
            </DashboardCard>

            <DashboardCard title="Landing Page Performance"
              subtitle="Top pages by attributed revenue"
            >
              {landingResults.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Landing page data will appear after your first attributed conversions.</p>
              ) : (
                <DashboardTable
                  columns={[
                    { key: 'page', label: 'Page', render: (r) => <span className="text-xs truncate max-w-[200px] block">{r.dim_value || 'unknown'}</span> },
                    { key: 'revenue', label: 'Revenue', render: (r) => `$${(r.revenue || 0).toFixed(0)}`, cellClassName: 'text-right font-medium text-gray-900' }
                  ]}
                  rows={landingResults.slice(0, 5)}
                  emptyMessage="Landing page data will appear after your first attributed conversions."
                />
              )}
            </DashboardCard>
          </div>

          {/* Row 3.5: Pipeline Stages */}
          <DashboardCard title="Pipeline Stages"
            subtitle={`CRM stages from offline conversions — ${Object.values(overview?.pipeline_stages || {}).reduce((s, t) => s + (t.count || 0), 0)} total in period`}
            action={
              <span className="text-xs text-gray-400">API-driven</span>
            }
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(STAGE_LABELS).map(([key, label]) => {
                const stageData = overview?.pipeline_stages?.[key]
                const hasData = stageData && stageData.count > 0
                return (
                  <div key={key} className={`rounded-lg p-3 ${hasData ? 'bg-gray-50' : 'bg-gray-50/50'}`}>
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-lg font-semibold text-gray-900 mt-0.5">
                      {hasData ? stageData.count.toLocaleString() : '—'}
                    </p>
                    {hasData && stageData.revenue > 0 && (
                      <p className="text-xs text-gray-400 mt-0.5">${stageData.revenue.toFixed(0)}</p>
                    )}
                    <StatusBadge status={hasData ? 'active' : 'pending'} label={hasData ? 'Active' : 'No data'} />
                  </div>
                )
              })}
            </div>
            {Object.values(overview?.pipeline_stages || {}).every(t => !t || t.count === 0) && (
              <p className="text-xs text-gray-400 mt-3">
                Send offline conversions with stage-type conversion_type values (lead_created, qualified, opportunity, closed_won) via POST /api/conversion/offline. Only offline conversions with known stage types are counted.
              </p>
            )}
          </DashboardCard>

          {/* Row 4: Campaign Performance + Tracking Health */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard title="Campaign Performance"
              subtitle="Revenue by marketing campaign"
            >
              {campaignResults.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Campaign data will appear when UTM-tagged traffic converts.</p>
              ) : (
                <DashboardTable
                  columns={[
                    { key: 'campaign', label: 'Campaign', render: (r) => r.dim_value || 'unknown' },
                    { key: 'revenue', label: 'Revenue', render: (r) => `$${(r.revenue || 0).toFixed(0)}`, cellClassName: 'text-right font-medium text-gray-900' }
                  ]}
                  rows={campaignResults.slice(0, 5)}
                  emptyMessage="Campaign data will appear when UTM-tagged traffic converts."
                />
              )}
            </DashboardCard>

            <DashboardCard title="Tracking Health"
              subtitle="Install status and data quality"
              action={!previewMode && (
                <button onClick={() => navigate('/integrations')} className="text-xs text-gray-900 hover:text-gray-700 font-medium flex items-center gap-1">
                  Details <ExternalLink className="w-3 h-3" />
                </button>
              )}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Install Status</span>
                  <StatusBadge
                    status={installData?.status === 'verified' ? 'verified' : 'pending'}
                    label={installData?.status === 'verified' ? 'Verified' : 'Pending'}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Last Event</span>
                  <span className="text-sm text-gray-900">{installData?.last_event || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Domain</span>
                  <span className="text-sm text-gray-900">{installData?.domain || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Data Alerts</span>
                  {alerts.length > 0 ? (
                    <StatusBadge status="warning" label={`${alerts.length} issue${alerts.length > 1 ? 's' : ''}`} />
                  ) : (
                    <StatusBadge status="success" label="No issues" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Health</span>
                  <StatusBadge
                    status={overview?.health?.status === 'healthy' ? 'success' : overview?.health?.status === 'silent_24h' ? 'warning' : 'pending'}
                    label={overview?.health?.status === 'healthy' ? 'Healthy' : overview?.health?.status === 'silent_24h' ? 'Silent >24h' : 'No data'}
                  />
                </div>
                {(!installData || installData?.status !== 'verified') && !previewMode && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <button onClick={() => navigate('/snippet')}
                      className="w-full py-2 text-sm text-gray-900 bg-gray-50 rounded-lg hover:bg-gray-100 font-medium">
                      Complete Installation
                    </button>
                  </div>
                )}
              </div>
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
                    <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                    <p className="text-base font-bold text-gray-900" style={{ color: COLORS[i % COLORS.length] }}>
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

          {/* Row 5b: LTV Comparison */}
          <DashboardCard
            title="LTV by Model"
            subtitle="Lifetime value comparison across attribution models. LTV varies by model due to different attribution rules."
            action={(
              <select
                value={ltvModel}
                onChange={(e) => setLtvModel(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white"
              >
                {MODELS.filter(m => m.key !== 'ai_platforms').map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            )}
          >
            {/* Model totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {MODELS.filter(m => m.key !== 'ai_platforms').map((m, i) => {
                const q = ltvQueries[i]
                const results = q?.data?.results || []
                const total = results.reduce((s, r) => s + (r.ltv_revenue || 0), 0)
                const isSelected = ltvModel === m.key
                return (
                  <button
                    key={m.key}
                    onClick={() => setLtvModel(m.key)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      isSelected ? 'border-gray-900 bg-gray-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <p className="text-xs text-gray-500 mb-1">{m.label}</p>
                    <p className="text-sm font-bold text-gray-900">${total.toFixed(0)}</p>
                    {q.isLoading && <p className="text-[10px] text-gray-400 mt-1">Loading…</p>}
                  </button>
                )
              })}
            </div>

            {/* Selected model breakdown */}
            {(() => {
              const selectedIdx = MODELS.filter(m => m.key !== 'ai_platforms').findIndex(m => m.key === ltvModel)
              const q = ltvQueries[selectedIdx]
              const results = (q?.data?.results || []).slice(0, 5)
              const maxVal = Math.max(...results.map(r => r.ltv_revenue || 0), 1)
              if (q?.isLoading) {
                return <div className="text-xs text-gray-400 py-4 text-center">Loading LTV breakdown…</div>
              }
              if (results.length === 0) {
                return <div className="text-xs text-gray-400 py-4 text-center">No LTV data for this model</div>
              }
              return (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-gray-500 mb-2">Top sources by LTV — {MODELS.find(m => m.key === ltvModel)?.label}</p>
                  {results.map((r, i) => {
                    const val = r.ltv_revenue || 0
                    const pct = maxVal > 0 ? (val / maxVal) * 100 : 0
                    return (
                      <div key={r.dim_value || i} className="flex items-center gap-3">
                        <span className="text-xs text-gray-600 w-24 truncate">{r.dim_value || 'unknown'}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gray-900 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-gray-900 w-16 text-right">${val.toFixed(0)}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </DashboardCard>

          {/* Row 5c: Session Analytics */}
          <DashboardCard
            title="Session Analytics"
            subtitle="Sessions derived from pageview events using 30-minute inactivity rule."
          >
            {sessionsLoading ? (
              <div className="py-8 text-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 mx-auto" />
              </div>
            ) : !sessionOverview?.data ? (
              <div className="py-8 text-center text-sm text-gray-400">No session data available</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Total Sessions</p>
                    <p className="text-lg font-bold text-gray-900">{(sessionOverview.data.total_sessions || 0).toLocaleString()}</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Avg Duration</p>
                    <p className="text-lg font-bold text-gray-900">
                      {Math.round((sessionOverview.data.avg_duration_seconds || 0) / 60)}m
                    </p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Pages / Session</p>
                    <p className="text-lg font-bold text-gray-900">{sessionOverview.data.avg_pageviews_per_session || 0}</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 mb-1">Conv. Sessions</p>
                    <p className="text-lg font-bold text-gray-900">{(sessionOverview.data.conversion_sessions || 0).toLocaleString()}</p>
                  </div>
                </div>

                {sessionOverview.data.time_series?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Sessions over time</p>
                    <div className="h-24 flex items-end gap-1">
                      {(() => {
                        const series = sessionOverview.data.time_series
                        const max = Math.max(...series.map(d => d.sessions), 1)
                        return series.slice(-14).map((d, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div
                              className="w-full bg-gray-900 rounded-sm"
                              style={{ height: `${(d.sessions / max) * 100}%`, minHeight: 2 }}
                            />
                            <span className="text-[9px] text-gray-400">{d.date.slice(5)}</span>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-gray-400">
                  Derived on read from pageview events. 30-minute inactivity threshold. Not materialized.
                </p>
              </div>
            )}
          </DashboardCard>

          {alerts.length > 0 && (
            <DashboardCard title={`${alerts.length} Alert${alerts.length > 1 ? 's' : ''}`} subtitle="Issues requiring attention">
              <div className="space-y-2">
                {alerts.slice(0, 3).map(a => (
                  <div key={a.id} className={`rounded-lg p-3 text-sm ${
                    a.severity === 'high' ? 'bg-red-50 border border-red-200 text-red-800' :
                    'bg-amber-50 border border-amber-200 text-amber-800'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.metric}:</span>
                      <span>{a.message}</span>
                    </div>
                    <p className="text-xs mt-1 opacity-75">{a.suggested_action}</p>
                  </div>
                ))}
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
