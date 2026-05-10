import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  ArrowRight, Download, ExternalLink
} from 'lucide-react'
import MetricTile from '../components/MetricTile'
import DashboardCard from '../components/DashboardCard'
import StatusBadge from '../components/StatusBadge'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend)

const MODELS = [
  { key: 'first_touch', label: 'First Touch' },
  { key: 'last_touch', label: 'Last Touch' },
  { key: 'linear', label: 'Linear' },
  { key: 'ai_platforms', label: 'AI Platforms' }
]

const AI_SOURCES = ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok', 'Copilot', 'DeepSeek']
const CONVERSION_LABELS = {
  purchase: 'Purchase', trial: 'Free Trial', lead: 'Lead Form',
  signup: 'Sign Up', meeting: 'Meeting'
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

  useEffect(() => {
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
    queryKey: ['dashboard-overview', site?.site_key, timeRange],
    queryFn: async () => {
      if (!site?.site_key) return null
      const params = new URLSearchParams({ site_key: site.site_key, days: String(timeRange) })
      return fetchApi(`/dashboard/overview?${params}`)
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

  return (
    <div className="space-y-6">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Performance Overview</h2>
          {site && <p className="text-sm text-gray-500 mt-0.5">{site.domain || site.name}</p>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {TIME_RANGES.map(tr => (
              <button
                key={tr.label}
                onClick={() => setTimeRange(tr.days)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  timeRange === tr.days ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tr.label}
              </button>
            ))}
          </div>
          <button onClick={handleExport}
            className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
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

          {/* Row 1: Recent Leads + Revenue Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <DashboardCard title="Recent Leads" subtitle="Latest attributed conversions by source"
              action={
                <button onClick={() => navigate('/leads')} className="text-xs text-gray-900 hover:text-gray-700 font-medium flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              }
              className="lg:col-span-2"
            >
              {recentLeadsData.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">No recent leads yet. Data will appear as conversions flow in.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Source</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Conversions</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Revenue</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentLeadsData.map((r, i) => {
                      const isAI = AI_SOURCES.includes(r.source)
                      return (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                          <td className="py-2.5 px-3 text-gray-900 flex items-center gap-2">
                            {r.source}
                            {isAI && <StatusBadge status="verified" label="AI" />}
                          </td>
                          <td className="py-2.5 px-3 text-right text-gray-600">{r.conversions}</td>
                          <td className="py-2.5 px-3 text-right font-medium text-gray-900">${r.revenue.toFixed(0)}</td>
                          <td className="py-2.5 px-3 text-right">
                            <StatusBadge status="active" label="Active" />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </DashboardCard>

            <DashboardCard title="Revenue Trend" subtitle={`Last ${timeRange} days`}>
              {timeResults.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm text-gray-400">No data yet</div>
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
              subtitle="Revenue and conversions from AI platforms"
              action={
                <button onClick={() => navigate('/report-builder')} className="text-xs text-gray-900 hover:text-gray-700 font-medium">
                  Analyze
                </button>
              }
            >
              {aiRevResults.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">No AI-source traffic detected yet. AI platforms like ChatGPT and Claude will appear here.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">AI Source</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Revenue</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Conversions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiRevResults.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2.5 px-3 text-gray-900 font-medium">{r.dim_value || 'unknown'}</td>
                        <td className="py-2.5 px-3 text-right text-gray-900">${(r.ai_revenue || 0).toFixed(0)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-600">{(r.ai_conversions || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              action={
                <button onClick={() => navigate('/campaigns')} className="text-xs text-gray-900 hover:text-gray-700 font-medium flex items-center gap-1">
                  View all <ArrowRight className="w-3 h-3" />
                </button>
              }
            >
              {activeResults.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">No attribution data yet. Start sending events to see source breakdown.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Source</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Revenue</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeResults.slice(0, 7).map((r, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2.5 px-3 text-gray-900">{r.dim_value || r.source || 'unknown'}</td>
                        <td className="py-2.5 px-3 text-right text-gray-900 font-medium">${(r.revenue || 0).toFixed(0)}</td>
                        <td className="py-2.5 px-3 text-right text-gray-500">
                          {totalRevenue > 0 ? `${((r.revenue / totalRevenue) * 100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DashboardCard>
          </div>

          {/* Row 3: Conversion Events + Landing Pages */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard title="Conversion Events"
              subtitle="Tracked conversion types across your site"
              action={
                <button onClick={() => navigate('/settings')} className="text-xs text-gray-900 hover:text-gray-700 font-medium">
                  Configure
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(CONVERSION_LABELS).map(([key, label]) => (
                  <div key={key} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-lg font-semibold text-gray-900 mt-0.5">
                      {/* TODO confirm: per-type conversion counts not available from current aggregation */}
                      —
                    </p>
                    <StatusBadge status="pending" label="Tracking" />
                  </div>
                ))}
              </div>
            </DashboardCard>

            <DashboardCard title="Landing Page Performance"
              subtitle="Top pages by attributed revenue"
            >
              {landingResults.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Landing page data will appear after your first attributed conversions.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Page</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {landingResults.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2.5 px-3 text-gray-900 text-xs truncate max-w-[200px]">{r.dim_value || 'unknown'}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-gray-900">${(r.revenue || 0).toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DashboardCard>
          </div>

          {/* Row 4: Campaign Performance + Tracking Health */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard title="Campaign Performance"
              subtitle="Revenue by marketing campaign"
            >
              {campaignResults.length === 0 ? (
                <p className="text-sm text-gray-400 py-6 text-center">Campaign data will appear when UTM-tagged traffic converts.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2.5 px-3 text-xs font-medium text-gray-500">Campaign</th>
                      <th className="text-right py-2.5 px-3 text-xs font-medium text-gray-500">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignResults.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2.5 px-3 text-gray-900">{r.dim_value || 'unknown'}</td>
                        <td className="py-2.5 px-3 text-right font-medium text-gray-900">${(r.revenue || 0).toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DashboardCard>

            <DashboardCard title="Tracking Health"
              subtitle="Install status and data quality"
              action={
                <button onClick={() => navigate('/integrations')} className="text-xs text-gray-900 hover:text-gray-700 font-medium flex items-center gap-1">
                  Details <ExternalLink className="w-3 h-3" />
                </button>
              }
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
                {(!installData || installData?.status !== 'verified') && (
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

          {/* Row 5: Model Attribution quick view */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {modelRevenues.map((m, i) => (
              <div key={m.model} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <p className="text-xs text-gray-500">{m.label}</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5" style={{ color: COLORS[i % COLORS.length] }}>
                  ${m.total.toFixed(0)}
                </p>
              </div>
            ))}
          </div>

          {/* Alerts Banner */}
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
    </div>
  )
}
