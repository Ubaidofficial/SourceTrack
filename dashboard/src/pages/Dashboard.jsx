import { useState, useEffect, useCallback } from 'react'
import { useQueries } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { format, subDays } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { Bar, Line } from 'react-chartjs-2'
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
  DollarSign, MousePointerClick, TrendingUp, Users, Building2, AlertTriangle, Bell,
  Plus, ChevronDown, MoreHorizontal, Pencil, Copy, Trash2, LayoutDashboard, ArrowUp, ArrowDown
} from 'lucide-react'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend)

const MODELS = [
  { key: 'first_touch', label: 'First Touch' },
  { key: 'last_touch', label: 'Last Touch' },
  { key: 'linear', label: 'Linear' },
  { key: 'ai_platforms', label: 'AI Platforms' }
]

const COLORS = [
  'rgba(99, 102, 241, 0.8)',
  'rgba(34, 197, 94, 0.8)',
  'rgba(249, 115, 22, 0.8)',
  'rgba(239, 68, 68, 0.8)',
  'rgba(168, 85, 247, 0.8)',
  'rgba(14, 165, 233, 0.8)',
  'rgba(245, 158, 11, 0.8)',
  'rgba(236, 72, 153, 0.8)'
]

const DASHBOARD_KEY = 'sourcetrack_dashboards'
const WIDGETS_PREFIX = 'sourcetrack_widgets_'

function loadDashboards() {
  try { return JSON.parse(localStorage.getItem(DASHBOARD_KEY)) || [{ id: 'default', name: 'Main Dashboard' }] }
  catch { return [{ id: 'default', name: 'Main Dashboard' }] }
}
function saveDashboards(list) {
  try { localStorage.setItem(DASHBOARD_KEY, JSON.stringify(list)) } catch { /* quota */ }
}
function loadWidgets(dashboardId) {
  try { return JSON.parse(localStorage.getItem(WIDGETS_PREFIX + dashboardId)) || [] } catch { return [] }
}
function saveWidgets(dashboardId, list) {
  try { localStorage.setItem(WIDGETS_PREFIX + dashboardId, JSON.stringify(list)) } catch { /* quota */ }
}

function migrateSharedWidgets(dashboardId) {
  const old = localStorage.getItem('sourcetrack_dashboard_widgets')
  if (!old) return
  try {
    const existing = localStorage.getItem(WIDGETS_PREFIX + dashboardId)
    if (!existing) {
      localStorage.setItem(WIDGETS_PREFIX + dashboardId, old)
    }
    localStorage.removeItem('sourcetrack_dashboard_widgets')
  } catch { /* ignore */ }
}

async function getFlexibleReport(siteKey, model, dateFrom, dateTo, groupBy, metric, filters = {}, groupBy2 = null, granularity = 'day', attributionWindow = null, attributeBy = 'conversion_date') {
  const params = new URLSearchParams({ site_key: siteKey, model, date_from: dateFrom, date_to: dateTo, group_by: groupBy, metric })
  if (groupBy2) params.set('group_by2', groupBy2)
  if (granularity && granularity !== 'day') params.set('time_granularity', granularity)
  if (attributionWindow) params.set('attribution_window', attributionWindow)
  if (attributeBy && attributeBy !== 'conversion_date') params.set('attribute_by', attributeBy)
  if (filters?.source) params.set('filter_source', filters.source)
  if (filters?.medium) params.set('filter_medium', filters.medium)
  if (filters?.campaign) params.set('filter_campaign', filters.campaign)
  if (filters?.ai_source) params.set('filter_ai_source', filters.ai_source)
  if (filters?.country) params.set('filter_country', filters.country)
  if (filters?.device_type) params.set('filter_device_type', filters.device_type)
  if (filters?.is_conversion) params.set('filter_is_conversion', filters.is_conversion)
  if (filters?.has_ai_source) params.set('filter_has_ai_source', filters.has_ai_source)
  if (filters?.min_conversions) params.set('filter_min_conversions', filters.min_conversions)
  return fetchApi(`/attribution?${params}`)
}

const METRIC_LABELS = {
  revenue: 'Revenue', conversions: 'Conversions', sessions: 'Sessions',
  leads: 'Leads', conversion_rate: 'Conversion Rate', avg_conversion_value: 'Avg Value',
  ai_conversions: 'AI Conversions', ai_revenue: 'AI Revenue',
  ai_conversion_share: '% Conversions from AI', ai_revenue_share: '% Revenue from AI'
}
const METRIC_FORMATS = {
  revenue: (v) => `$${Number(v).toFixed(2)}`,
  conversions: (v) => Number(v).toLocaleString(),
  sessions: (v) => Number(v).toLocaleString(),
  leads: (v) => Number(v).toLocaleString(),
  conversion_rate: (v) => `${Number(v).toFixed(1)}%`,
  avg_conversion_value: (v) => `$${Number(v).toFixed(2)}`,
  ai_conversions: (v) => Number(v).toLocaleString(),
  ai_revenue: (v) => `$${Number(v).toFixed(2)}`,
  ai_conversion_share: (v) => `${Number(v).toFixed(1)}%`,
  ai_revenue_share: (v) => `${Number(v).toFixed(1)}%`
}

function WidgetCard({ widget, siteKey, onEdit, onDuplicate, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const metric = widget.metric
  const groupBy = widget.groupBy

  const { data, isLoading } = useQueries({
    queries: [{
      queryKey: ['widget', widget.id, siteKey, metric, groupBy],
      queryFn: () => getFlexibleReport(siteKey, widget.model, widget.dateFrom, widget.dateTo, groupBy, metric, widget.filters, widget.groupBy2, widget.granularity, widget.attributionWindow),
      enabled: !!siteKey
    }]
  })[0]

  const results = data?.results || []
  const total = results.reduce((s, r) => s + ((r[metric] || r.revenue || r.conversions || r.sessions || r.leads || r.conversion_rate || r.avg_conversion_value) || 0), 0)
  const label = METRIC_LABELS[metric] || metric
  const fmt = METRIC_FORMATS[metric] || ((v) => String(v))

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isFirst && <button onClick={onMoveUp} className="p-0.5 text-gray-300 hover:text-gray-500"><ArrowUp className="w-3.5 h-3.5" /></button>}
          {!isLast && <button onClick={onMoveDown} className="p-0.5 text-gray-300 hover:text-gray-500"><ArrowDown className="w-3.5 h-3.5" /></button>}
          <h3 className="text-sm font-semibold text-gray-700 truncate">{widget.name}</h3>
        </div>
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)}
            className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-10 w-40 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
              <button onClick={() => { setMenuOpen(false); onEdit(widget) }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={() => { setMenuOpen(false); onDuplicate(widget) }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                <Copy className="w-3.5 h-3.5" /> Duplicate
              </button>
              <button onClick={() => { setMenuOpen(false); onRemove(widget.id) }}
                className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" /> Remove
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="h-32 flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
          </div>
        ) : results.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-xs text-gray-400">No data</div>
        ) : (
          <div>
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-xs text-gray-400">{label}</span>
              <span className="text-lg font-bold text-gray-900">{fmt(total)}</span>
            </div>
            <div className="space-y-1">
              {results.slice(0, 5).map((r, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600 truncate max-w-[60%]">{r.dim_value}</span>
                  <span className="text-gray-900 font-medium">
                    {fmt(r[metric] || r.revenue || r.conversions || r.sessions || r.leads || r.conversion_rate || r.avg_conversion_value || 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)
  const [activeModel, setActiveModel] = useState('first_touch')
  const dateFrom = format(subDays(new Date(), 30), 'yyyy-MM-dd')
  const dateTo = format(new Date(), 'yyyy-MM-dd')

  // Dashboard management
  const [dashboards, setDashboards] = useState(loadDashboards)
  const [activeDashboardId, setActiveDashboardId] = useState(dashboards[0]?.id || 'default')
  const [widgets, setWidgets] = useState(() => {
    migrateSharedWidgets(dashboards[0]?.id || 'default')
    return loadWidgets(dashboards[0]?.id || 'default')
  })
  const [showDashMenu, setShowDashMenu] = useState(false)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')

  const activeDashboard = dashboards.find(d => d.id === activeDashboardId) || dashboards[0]

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sites')
        .select('site_key, name')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()
      setSite(data)
    }
    load()
  }, [user])

  useEffect(() => {
    const handleWidgetAdded = () => setWidgets(loadWidgets(activeDashboardId))
    window.addEventListener('storage', handleWidgetAdded)
    return () => window.removeEventListener('storage', handleWidgetAdded)
  }, [activeDashboardId])

  useEffect(() => {
    setWidgets(loadWidgets(activeDashboardId))
    const interval = setInterval(() => {
      setWidgets(loadWidgets(activeDashboardId))
      const staging = localStorage.getItem('sourcetrack_dashboard_widgets_staging')
      if (staging) {
        try {
          const staged = JSON.parse(staging)
          if (Array.isArray(staged) && staged.length > 0) {
            const current = loadWidgets(activeDashboardId)
            const merged = [...current, ...staged]
            saveWidgets(activeDashboardId, merged)
            setWidgets(merged)
          }
        } catch { /* ignore */ }
        localStorage.removeItem('sourcetrack_dashboard_widgets_staging')
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [activeDashboardId])

  // Revenue by model queries
  const modelQueries = useQueries({
    queries: MODELS.map(m => ({
      queryKey: ['dashboard-model-rev', site?.site_key, m.key, dateFrom, dateTo],
      queryFn: () => getFlexibleReport(site?.site_key, m.key, dateFrom, dateTo, 'source', 'revenue', {}),
      enabled: !!site
    }))
  })

  const timeSeriesQuery = useQueries({
    queries: [{ queryKey: ['dashboard-time', site?.site_key, activeModel, dateFrom, dateTo], queryFn: () => getFlexibleReport(site?.site_key, activeModel, dateFrom, dateTo, 'date', 'revenue', {}), enabled: !!site }]
  })[0]

  const alertsQuery = useQueries({
    queries: [{ queryKey: ['dashboard-alerts', site?.site_key], queryFn: async () => { const params = new URLSearchParams({ site_key: site?.site_key }); return fetchApi(`/alerts?${params}`) }, enabled: !!site, refetchInterval: 120_000 }]
  })[0]

  const isLoading = modelQueries.some(q => q.isLoading) || timeSeriesQuery.isLoading
  const activeData = modelQueries[MODELS.findIndex(m => m.key === activeModel)]
  const activeResults = activeData?.data?.results || []
  const totalRevenue = activeResults.reduce((sum, r) => sum + (r.revenue || 0), 0)
  const totalConversions = activeResults.reduce((sum, r) => sum + (r.conversions || 0), 0)
  const avgRevenue = totalConversions > 0 ? totalRevenue / totalConversions : 0
  const modelRevenues = modelQueries.map((q, i) => ({ model: MODELS[i].key, label: MODELS[i].label, total: (q.data?.results || []).reduce((s, r) => s + (r.revenue || 0), 0) }))

  const timeResults = timeSeriesQuery.data?.results || []

  const barData = {
    labels: activeResults.slice(0, 10).map(r => r.dim_value || r.source || 'unknown'),
    datasets: [{ label: 'Revenue', data: activeResults.slice(0, 10).map(r => r.revenue || 0), backgroundColor: 'rgba(99, 102, 241, 0.8)', borderRadius: 4 }]
  }
  const timeChartData = {
    labels: timeResults.map(r => r.dim_value || ''),
    datasets: [{ label: 'Revenue', data: timeResults.map(r => r.revenue || 0), borderColor: 'rgba(99, 102, 241, 1)', backgroundColor: 'rgba(99, 102, 241, 0.1)', fill: true, tension: 0.3, pointRadius: 2 }]
  }
  const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `$${Number(ctx.raw).toFixed(2)}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => `$${v}` } } } }
  const timeChartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `$${Number(ctx.raw).toFixed(2)}` } } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => `$${v}` } }, x: { ticks: { maxTicksLimit: 10 } } } }

  const aiResults = activeResults.filter(r => ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok', 'Copilot', 'DeepSeek'].includes(r.dim_value || r.source || ''))

  // Dashboard actions
  const handleCreateDashboard = () => {
    const newDash = { id: Date.now().toString(), name: `Dashboard ${dashboards.length + 1}` }
    const updated = [...dashboards, newDash]
    setDashboards(updated)
    saveDashboards(updated)
    setActiveDashboardId(newDash.id)
    setShowDashMenu(false)
  }

  const handleSwitchDashboard = (id) => {
    setActiveDashboardId(id)
    setShowDashMenu(false)
    migrateSharedWidgets(id)
    setWidgets(loadWidgets(id))
  }

  const handleRenameStart = (d) => { setRenamingId(d.id); setRenameValue(d.name) }
  const handleRenameSave = () => {
    if (!renameValue.trim()) return
    const updated = dashboards.map(d => d.id === renamingId ? { ...d, name: renameValue.trim() } : d)
    setDashboards(updated); saveDashboards(updated); setRenamingId(null)
  }

  const handleDeleteDashboard = (id) => {
    if (dashboards.length <= 1) return
    const updated = dashboards.filter(d => d.id !== id)
    setDashboards(updated); saveDashboards(updated)
    if (activeDashboardId === id) setActiveDashboardId(updated[0].id)
    setShowDashMenu(false)
  }

  const handleDuplicateDashboard = (d) => {
    const dup = { ...d, id: Date.now().toString(), name: `${d.name} (copy)` }
    const updated = [...dashboards, dup]
    setDashboards(updated); saveDashboards(updated)
    setShowDashMenu(false)
  }

  // Widget actions
  const handleEditWidget = (widget) => {
    sessionStorage.setItem('sourcetrack_edit_widget', JSON.stringify(widget))
    navigate('/report-builder?edit=1')
  }

  const handleDuplicateWidget = (widget) => {
    const dup = { ...widget, id: Date.now().toString(), name: `${widget.name} (copy)` }
    const updated = [...widgets, dup]
    setWidgets(updated); saveWidgets(activeDashboardId, updated)
  }

  const handleRemoveWidget = (id) => {
    const updated = widgets.filter(w => w.id !== id)
    setWidgets(updated); saveWidgets(activeDashboardId, updated)
  }

  const handleMoveWidget = (id, direction) => {
    const idx = widgets.findIndex(w => w.id === id)
    if (idx === -1) return
    const newIdx = idx + direction
    if (newIdx < 0 || newIdx >= widgets.length) return
    const updated = [...widgets]
    const [moved] = updated.splice(idx, 1)
    updated.splice(newIdx, 0, moved)
    setWidgets(updated); saveWidgets(activeDashboardId, updated)
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <div className="relative">
            <button onClick={() => setShowDashMenu(!showDashMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              {activeDashboard?.name || 'Main Dashboard'}
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>
            {showDashMenu && (
              <div className="absolute left-0 top-10 z-20 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                {dashboards.map(d => (
                  <div key={d.id} className="group flex items-center justify-between px-3 py-1.5 hover:bg-gray-50">
                    {renamingId === d.id ? (
                      <form onSubmit={(e) => { e.preventDefault(); handleRenameSave() }} className="flex-1 flex gap-1">
                        <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus
                          className="flex-1 px-2 py-0.5 border border-indigo-300 rounded text-sm outline-none focus:ring-1 focus:ring-indigo-500" />
                        <button type="submit" className="text-xs text-indigo-600 font-medium">Save</button>
                      </form>
                    ) : (
                      <>
                        <button onClick={() => handleSwitchDashboard(d.id)}
                          className={`flex-1 text-left text-sm ${d.id === activeDashboardId ? 'text-indigo-700 font-medium' : 'text-gray-700'}`}>
                          {d.name}
                        </button>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <button onClick={() => handleRenameStart(d)} className="p-0.5 text-gray-300 hover:text-gray-500"><Pencil className="w-3 h-3" /></button>
                          <button onClick={() => handleDuplicateDashboard(d)} className="p-0.5 text-gray-300 hover:text-gray-500"><Copy className="w-3 h-3" /></button>
                          {dashboards.length > 1 && (
                            <button onClick={() => handleDeleteDashboard(d.id)} className="p-0.5 text-gray-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <button onClick={handleCreateDashboard}
                    className="w-full text-left px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-50 flex items-center gap-2">
                    <Plus className="w-3.5 h-3.5" /> New Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
          {site && <span className="text-sm text-gray-400">{site.name}</span>}
        </div>
        <button onClick={() => navigate('/report-builder')}
          className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-1">
          <Plus className="w-4 h-4" /> Add Report
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"><div className="flex items-center gap-3"><div className="p-2 bg-green-100 rounded-lg"><DollarSign className="w-5 h-5 text-green-600" /></div><div><p className="text-xs text-gray-500 font-medium">Revenue</p><p className="text-xl font-bold text-gray-900">${totalRevenue.toFixed(2)}</p></div></div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"><div className="flex items-center gap-3"><div className="p-2 bg-blue-100 rounded-lg"><MousePointerClick className="w-5 h-5 text-blue-600" /></div><div><p className="text-xs text-gray-500 font-medium">Conversions</p><p className="text-xl font-bold text-gray-900">{totalConversions}</p></div></div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"><div className="flex items-center gap-3"><div className="p-2 bg-purple-100 rounded-lg"><TrendingUp className="w-5 h-5 text-purple-600" /></div><div><p className="text-xs text-gray-500 font-medium">Avg. Revenue</p><p className="text-xl font-bold text-gray-900">${avgRevenue.toFixed(2)}</p></div></div></div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5"><div className="flex items-center gap-3"><div className="p-2 bg-orange-100 rounded-lg"><Users className="w-5 h-5 text-orange-600" /></div><div><p className="text-xs text-gray-500 font-medium">Channels</p><p className="text-xl font-bold text-gray-900">{activeResults.length}</p></div></div></div>
      </div>

      {/* Revenue by Model */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Revenue by Attribution Model</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {modelRevenues.map((m, i) => (
            <div key={m.model} className="bg-gray-50 rounded-lg p-3">
              <p className="text-xs text-gray-400">{m.label}</p>
              <p className="text-lg font-semibold text-gray-900" style={{ color: COLORS[i % COLORS.length] }}>${m.total.toFixed(0)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts */}
      {alertsQuery.data?.alerts && alertsQuery.data.alerts.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-5">
          <div className="flex items-center gap-2 mb-3"><Bell className="w-4 h-4 text-red-500" /><h3 className="text-sm font-semibold text-gray-700">Alerts</h3><span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">{alertsQuery.data.alerts.length}</span></div>
          <div className="space-y-2">
            {alertsQuery.data.alerts.map((a) => (
              <div key={a.id} className={`rounded-lg p-3 text-sm ${a.severity === 'high' ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-amber-50 border border-amber-200 text-amber-800'}`}>
                <div className="flex items-center gap-2"><AlertTriangle className={`w-4 h-4 ${a.severity === 'high' ? 'text-red-500' : 'text-amber-500'}`} /><span className="font-medium">{a.metric}:</span><span>{a.message}</span></div>
                <div className="mt-1 ml-6 flex items-center gap-4 text-xs opacity-75"><span>{a.comparison}</span><span>→ {a.suggested_action}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Widget Cards */}
      {widgets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Reports</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {widgets.map((w, i) => (
              <WidgetCard key={w.id} widget={w} siteKey={site?.site_key}
                onEdit={handleEditWidget} onDuplicate={handleDuplicateWidget} onRemove={handleRemoveWidget}
                onMoveUp={() => handleMoveWidget(w.id, -1)} onMoveDown={() => handleMoveWidget(w.id, 1)}
                isFirst={i === 0} isLast={i === widgets.length - 1} />
            ))}
          </div>
        </div>
      )}

      {/* Empty widgets state */}
      {widgets.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-dashed border-gray-300 p-8 text-center">
          <LayoutDashboard className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500 font-medium">No reports on this dashboard yet</p>
          <p className="text-xs text-gray-400 mt-1">Build a report and click "Add to Dashboard" to see it here.</p>
          <button onClick={() => navigate('/report-builder')}
            className="mt-4 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 inline-flex items-center gap-1">
            <Plus className="w-4 h-4" /> Add Report
          </button>
        </div>
      )}

      {/* Revenue Over Time */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Revenue Over Time</h3>
        {isLoading ? (<div className="h-64 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>)
        : timeResults.length === 0 ? (<div className="h-64 flex items-center justify-center text-gray-400 text-sm">No revenue data yet</div>)
        : (<div className="h-64"><Line data={timeChartData} options={timeChartOptions} /></div>)}
      </div>

      {/* Model Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {MODELS.map(({ key, label }) => (
          <button key={key} onClick={() => setActiveModel(key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeModel === key ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Channel Attribution Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Sources by Revenue</h3>
        {isLoading ? (<div className="h-64 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" /></div>)
        : activeResults.length === 0 ? (<div className="h-64 flex items-center justify-center text-gray-400 text-sm">No data yet</div>)
        : (<div className="h-64"><Bar data={barData} options={chartOptions} /></div>)}
      </div>

      {/* AI Platform Cards */}
      {activeModel === 'ai_platforms' && aiResults.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">AI Platform Revenue</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {aiResults.map((r, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <p className="font-semibold text-gray-900">{r.dim_value || r.source}</p>
                <div className="flex justify-between mt-2 text-sm"><span className="text-gray-500">{r.conversions || 0} conv.</span><span className="font-medium text-gray-900">${(r.revenue || 0).toFixed(2)}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Channel Revenue Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100"><h3 className="text-sm font-semibold text-gray-700">Revenue by Source</h3></div>
        {activeResults.length === 0 ? (<div className="p-8 text-center text-sm text-gray-400">No data yet</div>) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-gray-100 bg-gray-50"><th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Source</th><th className="text-right py-2 px-4 text-gray-500 font-medium text-xs">Conversions</th><th className="text-right py-2 px-4 text-gray-500 font-medium text-xs">Revenue</th><th className="text-right py-2 px-4 text-gray-500 font-medium text-xs">Avg Value</th></tr></thead>
              <tbody>{activeResults.map((r, i) => (<tr key={i} className="border-b border-gray-50 hover:bg-gray-50"><td className="py-2 px-4 text-gray-900">{r.dim_value || r.source || 'unknown'}</td><td className="py-2 px-4 text-right text-gray-600">{r.conversions || 0}</td><td className="py-2 px-4 text-right font-medium text-gray-900">${(r.revenue || 0).toFixed(2)}</td><td className="py-2 px-4 text-right text-gray-500">${r.conversions ? ((r.revenue || 0) / r.conversions).toFixed(2) : '0.00'}</td></tr>))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Account / Company (placeholder) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-4"><Building2 className="w-5 h-5 text-indigo-600" /><h3 className="text-sm font-semibold text-gray-700">Account / Company Reporting</h3></div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-700">Account-level reporting is not yet configured. To enable revenue by account:</p>
          <ul className="list-disc list-inside text-sm text-amber-600 mt-2 space-y-1">
            <li>TODO: confirm the source of account/company identity (CRM, user traits, identify calls)</li>
            <li>TODO: confirm PostHog property name for account grouping (e.g., properties.account_id)</li>
            <li>Once identity is defined, revenue-by-account views will appear here automatically</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
