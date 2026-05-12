import { useState, useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { fetchApi } from '../lib/api'
import { format, subDays, startOfMonth } from 'date-fns'
import { useAuth } from '../contexts/AuthContext'
import { Bar, Line, Pie } from 'react-chartjs-2'
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
  RefreshCw, Bookmark, Trash2, Download, Copy,
  Search, ChevronDown, ArrowRight, Plus, HelpCircle
} from 'lucide-react'
import ConversionExplanationModal from '../components/ConversionExplanationModal'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend)

const MODELS = [
  { key: 'first_touch', label: 'First Touch' },
  { key: 'last_touch', label: 'Last Touch' },
  { key: 'first_touch_non_direct', label: 'First Touch (Non-Direct)' },
  { key: 'last_touch_non_direct', label: 'Last Touch (Non-Direct)' },
  { key: 'ai_platforms', label: 'AI Platforms' }
]

const DIMENSIONS = [
  { key: 'date', label: 'Time' },
  { key: 'channel', label: 'Channel' },
  { key: 'source', label: 'Source' },
  { key: 'medium', label: 'Medium' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'conversion_type', label: 'Conversion Type' },
  { key: 'ai_source', label: 'AI Source' },
  { key: 'landing_page', label: 'Landing Page' },
  { key: 'country', label: 'Country' },
  { key: 'device', label: 'Device' }
]

const METRICS = [
  { key: 'sessions', label: 'Unique Visitors', format: (v) => v.toLocaleString(), group: 'Core', desc: 'Count of distinct visitors (distinct_id). Not session-based.' },
  { key: 'conversions', label: 'Conversions', format: (v) => v.toLocaleString(), group: 'Core', desc: 'Completed conversion events' },
  { key: 'revenue', label: 'Revenue', format: (v) => `$${v.toFixed(2)}`, group: 'Core', desc: 'Total conversion value' },
  { key: 'leads', label: 'Leads', format: (v) => v.toLocaleString(), group: 'Core', desc: 'Identified users' },
  { key: 'conversion_rate', label: 'Conversion Rate', format: (v) => `${v.toFixed(1)}%`, group: 'Conversion', desc: 'Conversions / sessions' },
  { key: 'avg_conversion_value', label: 'Avg Conversion Value', format: (v) => `$${v.toFixed(2)}`, group: 'Conversion', desc: 'Average revenue per conversion' },
  { key: 'ai_conversions', label: 'AI Conversions', format: (v) => v.toLocaleString(), group: 'AI', desc: 'Conversions from AI tools (ChatGPT, Claude, etc.)' },
  { key: 'ai_revenue', label: 'AI Revenue', format: (v) => `$${v.toFixed(2)}`, group: 'AI', desc: 'Revenue from AI-referred visitors' },
  { key: 'ai_conversion_share', label: 'AI Conversion Share', format: (v) => `${v.toFixed(1)}%`, group: 'AI', desc: '% of all conversions that came from AI' },
  { key: 'ai_revenue_share', label: 'AI Revenue Share', format: (v) => `${v.toFixed(1)}%`, group: 'AI', desc: '% of all revenue that came from AI' },
  { key: 'ltv_revenue', label: 'LTV Revenue v1 (identified users)', format: (v) => `$${v.toFixed(2)}`, group: 'LTV', desc: 'Cumulative realized revenue (not predictive LTV) — sums all conversion_values per distinct_id, then attributes to the source under the selected model. Anonymous-only visitors (UUID format) excluded. Supports all single-touch models including non-direct variants.' },
  { key: 'session_count', label: 'Session Count', format: (v) => v.toLocaleString(), group: 'Session', desc: 'Number of sessions derived from pageview events using 30-minute inactivity rule. Sessions attributed by entry source (first pageview UTM). Computed on read — not materialized. Limited to 50,000 pageview events per query.' },
  { key: 'avg_session_duration', label: 'Avg Session Duration', format: (v) => `${Math.round(v / 60)}m`, group: 'Session', desc: 'Average session duration in seconds. Derived from pageview timestamps using 30-minute inactivity rule. Computed on read — not materialized.' },
  { key: 'pages_per_session', label: 'Pages per Session', format: (v) => v.toFixed(1), group: 'Session', desc: 'Average pageviews per session. Derived from pageview events using 30-minute inactivity rule. Computed on read — not materialized.' },
  { key: 'conversion_sessions', label: 'Conversion Sessions', format: (v) => v.toLocaleString(), group: 'Session', desc: 'Sessions that contained at least one conversion event. Derived on read from pageview + conversion events. Computed on read — not materialized.' }
]

const CHART_TYPES = [
  { key: 'bar', label: 'Bar' },
  { key: 'line', label: 'Line' },
  { key: 'pie', label: 'Pie' },
  { key: 'table', label: 'Table Only' }
]

const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'This month', days: 'month' },
  { label: 'Custom', days: 0 }
]

const GRANULARITY = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'quarter', label: 'Quarterly' },
  { key: 'year', label: 'Yearly' }
]

const PRESETS = [
  { name: 'AI Revenue by Source', model: 'ai_platforms', groupBy: 'ai_source', groupBy2: null, metric: 'ai_revenue', days: 30, chartType: 'bar', granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date', filters: { has_ai_source: 'true' }, desc: 'See which AI platforms send the most revenue' },
  { name: 'Best Lead Sources', model: 'last_touch', groupBy: 'channel', groupBy2: null, metric: 'leads', days: 30, chartType: 'bar', granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date', filters: { min_conversions: '1' }, desc: 'Which channels bring in the most leads' },
  { name: 'Campaign Revenue', model: 'last_touch', groupBy: 'campaign', groupBy2: null, metric: 'revenue', days: 90, chartType: 'bar', granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date', filters: { min_conversions: '5' }, desc: 'Revenue performance across campaigns' },
  { name: 'Top Landing Pages', model: 'first_touch', groupBy: 'landing_page', groupBy2: null, metric: 'conversions', days: 30, chartType: 'bar', granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date', filters: {}, desc: 'Which pages convert visitors best' },
  { name: 'Conversion Trend', model: 'last_touch', groupBy: 'date', groupBy2: null, metric: 'conversions', days: 30, chartType: 'line', granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date', filters: {}, desc: 'How conversions are trending over time' },
  { name: 'AI Platform Share', model: 'ai_platforms', groupBy: 'ai_source', groupBy2: null, metric: 'ai_conversion_share', days: 30, chartType: 'pie', granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date', filters: { has_ai_source: 'true' }, desc: 'Share of AI-driven conversions by platform' }
]



const COLORS = [
  'rgba(17, 24, 39, 0.85)',
  'rgba(215, 245, 80, 0.85)',
  'rgba(107, 114, 128, 0.85)',
  'rgba(55, 65, 81, 0.85)',
  'rgba(209, 213, 219, 0.85)',
  'rgba(31, 41, 55, 0.85)',
  'rgba(180, 195, 60, 0.85)',
  'rgba(156, 163, 175, 0.85)'
]

async function getFlexibleReport(siteKey, model, dateFrom, dateTo, groupBy, metric, filters = {}, groupBy2 = null, granularity = 'day', attributionWindow = null, attributeBy = 'conversion_date') {
  const params = new URLSearchParams({ site_key: siteKey, model, date_from: dateFrom, date_to: dateTo, group_by: groupBy, metric })
  if (groupBy2) params.set('group_by2', groupBy2)
  if (granularity && granularity !== 'day') params.set('time_granularity', granularity)
  if (attributionWindow) params.set('attribution_window', attributionWindow)
  if (attributeBy && attributeBy !== 'conversion_date') params.set('attribute_by', attributeBy)
  if (filters.source) params.set('filter_source', filters.source)
  if (filters.medium) params.set('filter_medium', filters.medium)
  if (filters.campaign) params.set('filter_campaign', filters.campaign)
  if (filters.ai_source) params.set('filter_ai_source', filters.ai_source)
  if (filters.country) params.set('filter_country', filters.country)
  if (filters.device_type) params.set('filter_device_type', filters.device_type)
  if (filters.is_conversion) params.set('filter_is_conversion', filters.is_conversion)
  if (filters.has_ai_source) params.set('filter_has_ai_source', filters.has_ai_source)
  if (filters.min_conversions) params.set('filter_min_conversions', filters.min_conversions)
  return fetchApi(`/attribution?${params}`)
}

function getDefaultDateRange(days) {
  if (days === 'month') {
    return { from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }
  }
  return { from: format(subDays(new Date(), days), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }
}

export default function ReportBuilder() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [site, setSite] = useState(null)

  // Report state
  const [reportName, setReportName] = useState('')
  const [model, setModel] = useState('last_touch')
  const [groupBy, setGroupBy] = useState('source')
  const [metric, setMetric] = useState('revenue')
  const [chartType, setChartType] = useState('bar')
  const [datePreset, setDatePreset] = useState(30)
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [granularity, setGranularity] = useState('day')
  const [groupBy2, setGroupBy2] = useState(null)
  const [showGroupBy2, setShowGroupBy2] = useState(false)
  const [attributionWindow, setAttributionWindow] = useState(null)
  const [attributeBy, setAttributeBy] = useState('conversion_date')
  const [filters, setFilters] = useState({})
  const [showFilters, setShowFilters] = useState(false)
  const [filterCount, setFilterCount] = useState(0)
  const [showExplanation, setShowExplanation] = useState(false)
  const [explainModalOpen, setExplainModalOpen] = useState(false)

  // UI state
  const [editingId, setEditingId] = useState(null)
  const [metricSearch, setMetricSearch] = useState('')
  const [showMetricDropdown, setShowMetricDropdown] = useState(false)

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
    const editParam = searchParams.get('edit')
    if (!editParam) return
    const stored = sessionStorage.getItem('sourcetrack_edit_widget')
    if (!stored) return
    let widget
    try { widget = JSON.parse(stored) } catch { return }
    if (!widget) return
    sessionStorage.removeItem('sourcetrack_edit_widget')
    setReportName(widget.name || '')
    setModel(widget.model || 'last_touch')
    setGroupBy(widget.groupBy || 'source')
    setMetric(widget.metric || 'revenue')
    setChartType(widget.chartType || 'bar')
    setDateFrom(widget.dateFrom || format(subDays(new Date(), 30), 'yyyy-MM-dd'))
    setDateTo(widget.dateTo || format(new Date(), 'yyyy-MM-dd'))
    setDatePreset(0)
    setGranularity(widget.granularity || 'day')
    setGroupBy2(widget.groupBy2 || null)
    setShowGroupBy2(!!widget.groupBy2)
    setAttributionWindow(widget.attributionWindow || null)
    setAttributeBy(widget.attributeBy || 'conversion_date')
    setFilters(widget.filters || {})
    setFilterCount(Object.keys(widget.filters || {}).length)
    setEditingId(widget.id)
  }, [searchParams])

  const filterKey = JSON.stringify(filters)
  const { data, isLoading } = useQuery({
    queryKey: ['report', site?.site_key, model, groupBy, metric, dateFrom, dateTo, filterKey, groupBy2, granularity, attributionWindow, attributeBy],
    queryFn: () => getFlexibleReport(site?.site_key, model, dateFrom, dateTo, groupBy, metric, filters, groupBy2, granularity, attributionWindow, attributeBy),
    enabled: !!site
  })

  const { data: savedReports, isLoading: reportsLoading, refetch: refetchReports } = useQuery({
    queryKey: ['saved-reports', site?.site_key],
    queryFn: async () => {
      if (!site?.site_key) return []
      return fetchApi(`/reports/saved?site_key=${encodeURIComponent(site.site_key)}`)
    },
    enabled: !!site?.site_key,
    initialData: []
  })

  const [saveFeedback, setSaveFeedback] = useState(null)

  const results = data?.results || []
  const metricDef = METRICS.find(m => m.key === metric)
  const metricLabel = metricDef?.label || 'Value'
  const metricFormat = metricDef?.format || ((v) => String(v))

  const filteredMetrics = METRICS.filter(m =>
    m.label.toLowerCase().includes(metricSearch.toLowerCase())
  )

  const applyPreset = useCallback((preset) => {
    setReportName(preset.name)
    setModel(preset.model)
    setGroupBy(preset.groupBy)
    setGroupBy2(preset.groupBy2 || null)
    setShowGroupBy2(!!preset.groupBy2)
    setMetric(preset.metric)
    setChartType(preset.chartType || 'bar')
    setGranularity(preset.granularity || 'day')
    setAttributionWindow(preset.attributionWindow || null)
    setAttributeBy(preset.attributeBy || 'conversion_date')
    if (preset.groupBy === 'date') {
      setChartType('line')
    }
    setDatePreset(preset.days || 30)
    const range = getDefaultDateRange(preset.days || 30)
    setDateFrom(range.from)
    setDateTo(range.to)
    setFilters(preset.filters || {})
    setFilterCount(Object.keys(preset.filters || {}).length)
    setShowFilters(false)
    setEditingId(null)
  }, [])

  const handleDatePreset = (preset) => {
    setDatePreset(preset.days)
    if (preset.days === 0) return
    const range = getDefaultDateRange(preset.days)
    setDateFrom(range.from)
    setDateTo(range.to)
  }

  const applyFilter = (key, value) => {
    setFilters(prev => {
      const next = { ...prev }
      if (value) { next[key] = value } else { delete next[key] }
      setFilterCount(Object.keys(next).length)
      return next
    })
  }

  const handleEdit = (report) => {
    const cfg = report.config || report
    setReportName(report.name || cfg.name)
    setModel(cfg.model || 'last_touch')
    setGroupBy(cfg.groupBy || 'source')
    setMetric(cfg.metric || 'revenue')
    setChartType(cfg.chartType || 'bar')
    setDatePreset(0)
    setDateFrom(cfg.dateFrom || format(subDays(new Date(), 30), 'yyyy-MM-dd'))
    setDateTo(cfg.dateTo || format(new Date(), 'yyyy-MM-dd'))
    setGranularity(cfg.granularity || 'day')
    setGroupBy2(cfg.groupBy2 || null)
    setShowGroupBy2(!!cfg.groupBy2)
    setAttributionWindow(cfg.attributionWindow || null)
    setAttributeBy(cfg.attributeBy || 'conversion_date')
    setFilters(cfg.filters || {})
    setFilterCount(Object.keys(cfg.filters || {}).length)
    setEditingId(report.id)
    queryClient.invalidateQueries({ queryKey: ['report'] })
  }

  const handleSave = async () => {
    const name = reportName.trim() || `Report ${new Date().toLocaleDateString()}`
    const config = {
      model, groupBy, metric, chartType, dateFrom, dateTo,
      granularity, groupBy2, attributionWindow, attributeBy,
      filters
    }
    try {
      const saveUrl = editingId
        ? `/reports/saved/${editingId}?site_key=${encodeURIComponent(site.site_key)}`
        : `/reports/saved?site_key=${encodeURIComponent(site.site_key)}`

      await fetchApi(saveUrl, {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({ name, config })
      })
      setSaveFeedback('saved')
      setReportName('')
      setEditingId(null)
      refetchReports()
    } catch (err) {
      console.error('Save report failed:', err)
      setSaveFeedback('error')
    }
    setTimeout(() => setSaveFeedback(null), 2500)
  }

  const handleDuplicate = async (report) => {
    try {
      await fetchApi(`/reports/saved?site_key=${encodeURIComponent(site.site_key)}`, {
        method: 'POST',
        body: { site_key: site.site_key, name: `${report.name} (copy)`, config: report.config }
      })
      refetchReports()
    } catch { /* silent */ }
  }

  const handleDelete = async (id) => {
    try {
      await fetchApi(`/reports/saved/${id}?site_key=${encodeURIComponent(site.site_key)}`, { method: 'DELETE' })
      refetchReports()
    } catch { /* silent */ }
  }

  const handleLoad = (report) => {
    handleEdit(report)
  }

  const handleExportCSV = () => {
    if (!site) return
    const params = new URLSearchParams({ site_key: site.site_key, model, date_from: dateFrom, date_to: dateTo, group_by: groupBy, metric })
    if (filters.source) params.set('filter_source', filters.source)
    if (filters.medium) params.set('filter_medium', filters.medium)
    if (filters.campaign) params.set('filter_campaign', filters.campaign)
    if (filters.ai_source) params.set('filter_ai_source', filters.ai_source)
    if (filters.country) params.set('filter_country', filters.country)
    if (filters.device_type) params.set('filter_device_type', filters.device_type)
    if (filters.is_conversion) params.set('filter_is_conversion', filters.is_conversion)
    if (filters.has_ai_source) params.set('filter_has_ai_source', filters.has_ai_source)
    if (filters.min_conversions) params.set('filter_min_conversions', filters.min_conversions)
    window.open(`/api/export/report?${params}`, '_blank')
  }

  const getMetricValue = (row) => {
    return row[metric] || row.revenue || row.conversions || row.sessions || row.leads || row.conversion_rate || row.avg_conversion_value || 0
  }

  const chartData = {
    labels: results.slice(0, 15).map(r => groupBy2 ? `${r.dim_value} / ${r.dim_value2}` : r.dim_value),
    datasets: [{
      label: metricLabel,
      data: results.slice(0, 15).map(r => getMetricValue(r)),
      backgroundColor: results.slice(0, 15).map((_, i) => COLORS[i % COLORS.length]),
      borderColor: chartType === 'line' ? 'rgba(17, 24, 39, 1)' : undefined,
      borderRadius: chartType === 'bar' ? 4 : 0,
      tension: 0.3
    }]
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: chartType === 'pie', position: 'right' },
      tooltip: { callbacks: { label: (ctx) => `${metricLabel}: ${metricFormat(ctx.raw)}` } }
    },
    scales: chartType !== 'pie' ? {
      y: { beginAtZero: true, ticks: { callback: (v) => metric === 'revenue' || metric === 'avg_conversion_value' ? `$${v}` : v } }
    } : {}
  }

  const total = results.reduce((s, r) => s + getMetricValue(r), 0)
  const canPreview = site && metric && groupBy && dateFrom && dateTo

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Report Builder</h2>
          <p className="text-sm text-gray-500 mt-1">Build attribution reports with a guided workflow</p>
        </div>
        <div className="flex items-center gap-2">
          {canPreview && (
            <button onClick={handleExportCSV}
              className="px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1">
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Guided controls */}
        <div className="space-y-3">
          {/* Presets */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Quick Start</h3>
            <div className="grid grid-cols-1 gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.name} onClick={() => applyPreset(p)}
                  className="w-full text-left px-3 py-2.5 text-sm bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-100 hover:border-gray-200">
                  <span className="text-gray-700 font-medium">{p.name}</span>
                  {p.desc && <span className="block text-xs text-gray-400 mt-0.5">{p.desc}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Step 1: Name */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-lime-100 text-lime-800 text-xs flex items-center justify-center font-bold">1</span>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Report Name</h3>
            </div>
            <input type="text" value={reportName} onChange={(e) => setReportName(e.target.value)}
              placeholder="e.g. Weekly Revenue by Source" maxLength={60}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" />
          </div>

          {/* Step 2: Date Range */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-lime-100 text-lime-800 text-xs flex items-center justify-center font-bold">2</span>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Date Range</h3>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {DATE_PRESETS.map((p) => (
                <button key={p.label} onClick={() => handleDatePreset(p)}
                  className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                    datePreset === p.days ? 'bg-lime-100 text-lime-800 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            {datePreset === 0 && (
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" />
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
            )}
            {(groupBy === 'date' || groupBy2 === 'date') && (
              <div className="mt-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">Granularity</label>
                <div className="flex flex-wrap gap-1.5">
                  {GRANULARITY.map(g => (
                    <button key={g.key} onClick={() => setGranularity(g.key)}
                      className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                        granularity === g.key ? 'bg-lime-100 text-lime-800 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Metric */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-lime-100 text-lime-800 text-xs flex items-center justify-center font-bold">3</span>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Metric</h3>
            </div>
            <div className="relative">
              <div className="flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm cursor-pointer hover:border-gray-400"
                onClick={() => setShowMetricDropdown(!showMetricDropdown)}>
                <span className="flex-1 text-gray-900">{metricDef?.label || 'Select metric'}</span>
                <ChevronDown className="w-4 h-4 text-gray-400" />
              </div>
              {showMetricDropdown && (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto">
                  <div className="p-2 border-b border-gray-100 sticky top-0 bg-white">
                    <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded">
                      <Search className="w-3.5 h-3.5 text-gray-400" />
                      <input type="text" value={metricSearch} onChange={(e) => setMetricSearch(e.target.value)}
                        placeholder="Search metrics..." onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-transparent text-sm outline-none" />
                    </div>
                  </div>
                  {['Core', 'Conversion', 'AI', 'LTV'].map(group => {
                    const groupMetrics = filteredMetrics.filter(m => m.group === group)
                    if (groupMetrics.length === 0) return null
                    return (
                      <div key={group}>
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase bg-gray-50">{group}</div>
                        {groupMetrics.map((m) => (
                          <button key={m.key} onClick={() => { setMetric(m.key); setShowMetricDropdown(false); setMetricSearch('') }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                              metric === m.key ? 'bg-lime-50 text-lime-800 font-medium' : 'text-gray-700'
                            }`}>
                            <div>{m.label}</div>
                            {m.desc && <div className="text-xs text-gray-400">{m.desc}</div>}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Step 4: Group By */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-lime-100 text-lime-800 text-xs flex items-center justify-center font-bold">4</span>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Group By</h3>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DIMENSIONS.map((d) => (
                <button key={d.key} onClick={() => setGroupBy(d.key)}
                  className={`px-2.5 py-1.5 text-xs rounded-full transition-colors ${
                    groupBy === d.key ? 'bg-lime-100 text-lime-800 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {d.label}
                </button>
              ))}
            </div>
            {!showGroupBy2 ? (
              <button onClick={() => setShowGroupBy2(true)}
                className="mt-2 text-xs text-gray-900 hover:text-gray-800 font-medium">
                + Add another Group By
              </button>
            ) : (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-500">Group By 2</label>
                  <button onClick={() => { setShowGroupBy2(false); setGroupBy2(null) }}
                    className="text-xs text-gray-400 hover:text-red-500">&times; Remove</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DIMENSIONS.filter(d => d.key !== groupBy || d.key === 'date').map((d) => (
                    <button key={d.key} onClick={() => setGroupBy2(d.key)}
                      className={`px-2.5 py-1.5 text-xs rounded-full transition-colors ${
                        groupBy2 === d.key ? 'bg-lime-100 text-lime-800 font-medium' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Step 5: Model */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-lime-100 text-lime-800 text-xs flex items-center justify-center font-bold">5</span>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Attribution</h3>
            </div>
            <select value={model} onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
              {MODELS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <p className="text-xs text-gray-400 mt-1">How credit is assigned to each touchpoint in the customer journey.</p>
            <div className="mt-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Attribution Window</label>
              <select value={attributionWindow || ''} onChange={(e) => setAttributionWindow(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
                <option value="">No lookback (date range only)</option>
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">How far back from conversion to look for touchpoints. &quot;No lookback&quot; uses only the selected date range.</p>
            </div>
            <div className="mt-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Attribute By</label>
              <select value={attributeBy} onChange={(e) => setAttributeBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
                <option value="conversion_date">Conversion Date</option>
                <option value="first_seen_date">First Seen Date</option>
                <option value="original_source_date">Original Source Date</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">
                {attributeBy === 'conversion_date' && 'Group conversions by the date they occurred.'}
                {attributeBy === 'first_seen_date' && 'Group conversions by the date each visitor was first seen.'}
                {attributeBy === 'original_source_date' && 'Group conversions by the date of the first UTM-tagged touchpoint. Visitors without UTM source data are excluded.'}
              </p>
            </div>
          </div>

          {/* Step 6: Chart Type */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-lime-100 text-lime-800 text-xs flex items-center justify-center font-bold">6</span>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Chart</h3>
            </div>
            <select value={chartType} onChange={(e) => setChartType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
              {CHART_TYPES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>

          {/* Step 7: Filters (collapsible) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <button onClick={() => setShowFilters(!showFilters)}
              className="flex items-center justify-between w-full text-left">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-bold">7</span>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filters</h3>
                {filterCount > 0 ? (
                  <span className="px-1.5 py-0.5 text-xs bg-lime-100 text-lime-800 rounded-full">{filterCount} active</span>
                ) : (
                  <span className="text-xs text-gray-400">None</span>
                )}
              </div>
              <span className="text-xs text-gray-400">{showFilters ? 'Hide' : 'Show'}</span>
            </button>

            {/* Active filter pills */}
            {filterCount > 0 && !showFilters && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {Object.entries(filters).map(([key, value]) => (
                  <span key={key} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-lime-50 text-lime-800 rounded-full">
                    {key}: {String(value)}
                    <button onClick={() => applyFilter(key, undefined)} className="text-lime-600 hover:text-gray-800">&times;</button>
                  </span>
                ))}
              </div>
            )}

            {showFilters && (
              <div className="space-y-2 mt-3 pt-3 border-t border-gray-100">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Channel</label>
                  <select value={filters.channel || ''} onChange={(e) => applyFilter('channel', e.target.value || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="">Any</option>
                    <option value="Organic Search">Organic Search</option>
                    <option value="Paid Search">Paid Search</option>
                    <option value="Organic Social">Organic Social</option>
                    <option value="Paid Social">Paid Social</option>
                    <option value="Email">Email</option>
                    <option value="AI">AI</option>
                    <option value="Direct">Direct</option>
                    <option value="Referral">Referral</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
                  <input type="text" value={filters.source || ''} onChange={(e) => applyFilter('source', e.target.value || undefined)}
                    placeholder="e.g. google" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Medium</label>
                  <input type="text" value={filters.medium || ''} onChange={(e) => applyFilter('medium', e.target.value || undefined)}
                    placeholder="e.g. cpc" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Campaign</label>
                  <input type="text" value={filters.campaign || ''} onChange={(e) => applyFilter('campaign', e.target.value || undefined)}
                    placeholder="e.g. summer_sale" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                  <input type="text" value={filters.country || ''} onChange={(e) => applyFilter('country', e.target.value || undefined)}
                    placeholder="e.g. US" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Device</label>
                  <select value={filters.device_type || ''} onChange={(e) => applyFilter('device_type', e.target.value || undefined)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
                    <option value="">Any</option><option value="desktop">Desktop</option><option value="mobile">Mobile</option><option value="tablet">Tablet</option>
                  </select>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-400 uppercase mb-2">Advanced</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Conversion Type</label>
                    <input type="text" value={filters.conversion_type || ''} onChange={(e) => applyFilter('conversion_type', e.target.value || undefined)}
                      placeholder="e.g. lead_created, purchase" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">AI Source</label>
                    <select value={filters.ai_source || ''} onChange={(e) => applyFilter('ai_source', e.target.value || undefined)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
                      <option value="">Any</option>
                      <option value="ChatGPT">ChatGPT</option><option value="Claude">Claude</option>
                      <option value="Perplexity">Perplexity</option><option value="Gemini">Gemini</option>
                      <option value="Grok">Grok</option><option value="Copilot">Copilot</option>
                      <option value="DeepSeek">DeepSeek</option>
                      <option value="You.com AI">You.com AI</option><option value="Phind">Phind</option>
                      <option value="Kagi">Kagi</option>
                    </select>
                  </div>
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Has AI Source</label>
                    <select value={filters.has_ai_source || ''} onChange={(e) => applyFilter('has_ai_source', e.target.value || undefined)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900">
                      <option value="">Any</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Show only traffic from or excluding AI platforms (ChatGPT, Claude, etc.).</p>
                  </div>
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Min Conversions</label>
                    <input type="number" value={filters.min_conversions || ''} onChange={(e) => applyFilter('min_conversions', e.target.value || undefined)}
                      placeholder="e.g. 10" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer mt-2">
                    <input type="checkbox" checked={filters.is_conversion === 'true'}
                      onChange={(e) => applyFilter('is_conversion', e.target.checked ? 'true' : undefined)}
                      className="rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
                    Conversions only
                  </label>
                </div>
                {filterCount > 0 && (
                  <button type="button" onClick={() => { setFilters({}); setFilterCount(0) }}
                    className="w-full px-3 py-1.5 text-xs text-red-500 hover:text-red-700 transition-colors">
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Save */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-5 h-5 rounded-full bg-lime-100 text-lime-800 text-xs flex items-center justify-center font-bold">✓</span>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Save Report</h3>
            </div>
            <div className="space-y-2">
              <input type="text" value={reportName} onChange={(e) => setReportName(e.target.value)}
                placeholder="Report name..." maxLength={60}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900" />
              <div className="flex gap-2">
                <button onClick={handleSave}
                  className="flex-1 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-gray-800 flex items-center justify-center gap-1">
                  <Bookmark className="w-4 h-4" />
                  {editingId ? 'Update' : 'Save'}
                </button>
                {editingId && (
                  <button onClick={() => { setEditingId(null); setReportName('') }}
                    className="px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                    Cancel
                  </button>
                )}
              </div>
              {saveFeedback === 'saved' && (
                <p className="text-xs text-green-600 mt-1.5">Report saved to backend</p>
              )}
              {saveFeedback === 'error' && (
                <p className="text-xs text-red-600 mt-1.5">Failed to save — try again</p>
              )}
            </div>
          </div>

          {/* Saved Reports */}
          {savedReports.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Saved Reports</h3>
              <div className="space-y-0.5">
                {savedReports.map((r) => (
                  <div key={r.id} className="flex items-center justify-between group px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                    <button onClick={() => handleLoad(r)}
                      className="flex-1 text-left text-sm text-gray-700 hover:text-gray-900 transition-colors truncate">
                      {r.name}
                    </button>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      <button onClick={() => handleDuplicate(r)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors" title="Duplicate">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors" title="Delete">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Live Preview */}
        <div className="lg:col-span-2 space-y-4">
          {!canPreview ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <ArrowRight className="w-10 h-10 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">Build your report</p>
              <p className="text-sm text-gray-400 mt-1">
                Select a metric, group-by dimension, and date range to see results.
              </p>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-400">Total {metricLabel}</p>
                    <p className="text-2xl font-bold text-gray-900">{metricFormat(total)}</p>
                  </div>
                  {isLoading && <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />}
                </div>
              </div>

              {/* Chart */}
              {(chartType === 'bar' || chartType === 'line' || chartType === 'pie') && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  {isLoading ? (
                    <div className="h-72 flex items-center justify-center">
                      <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : results.length === 0 ? (
                    <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
                      No data for this selection. Try a different date range or dimension.
                    </div>
                  ) : (
                    <div className="h-72">
                      {chartType === 'bar' && <Bar data={chartData} options={chartOptions} />}
                      {chartType === 'line' && <Line data={chartData} options={chartOptions} />}
                      {chartType === 'pie' && <Pie data={chartData} options={chartOptions} />}
                    </div>
                  )}
                </div>
              )}

              {/* Table */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Data</h3>
                  <button
                    onClick={() => setShowExplanation(!showExplanation)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      showExplanation
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    {showExplanation ? 'Hide Explanation' : 'Show Explanation'}
                  </button>
                </div>
                {isLoading ? (
                  <div className="p-8 text-center">
                    <RefreshCw className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
                  </div>
                ) : results.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">No data yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Dimension</th>
                          {groupBy2 && <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Dimension 2</th>}
                          <th className="text-right py-2 px-4 text-gray-500 font-medium text-xs">{metricLabel}</th>
                          {showExplanation && <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Explanation</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 px-4 text-gray-900">{r.dim_value}</td>
                            {groupBy2 && <td className="py-2 px-4 text-gray-600">{r.dim_value2}</td>}
                            <td className="py-2 px-4 text-right font-medium text-gray-900">{metricFormat(getMetricValue(r))}</td>
                            {showExplanation && (
                              <td className="py-2 px-4">
                                <button
                                  onClick={() => setExplainModalOpen(true)}
                                  className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"
                                >
                                  <HelpCircle className="w-3 h-3" />
                                  {model === 'first_touch' && 'First visit UTM'}
                                  {model === 'last_touch' && 'Conversion page UTM'}
                                  {model === 'first_touch_non_direct' && 'Earliest non-direct'}
                                  {model === 'last_touch_non_direct' && 'Latest non-direct'}
                                  {model === 'ai_platforms' && 'AI referrer match'}
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ConversionExplanationModal
        isOpen={explainModalOpen}
        onClose={() => setExplainModalOpen(false)}
        siteKey={site?.site_key}
        model={model}
      />
    </div>
  )
}
