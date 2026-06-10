import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
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
  Search, ChevronDown, ArrowRight, Plus, HelpCircle,
  BarChart3, X
} from 'lucide-react'
import ConversionExplanationModal from '../components/ConversionExplanationModal'
import { hasFeature } from '../lib/planFeatures'
import { DirectInfo, isDirectLabel } from '../components/DirectInfo'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, ArcElement, Title, Tooltip, Legend)

// Multi-touch models are paid-only.
const MULTI_TOUCH_KEYS = new Set(['linear', 'time_decay', 'u_shaped', 'w_shaped'])
const MODELS = [
  { key: 'first_touch',            label: 'First Touch' },
  { key: 'last_touch',             label: 'Last Touch' },
  { key: 'first_touch_non_direct', label: 'First Touch (Non-Direct)' },
  { key: 'last_touch_non_direct',  label: 'Last Touch (Non-Direct)' },
  { key: 'linear',                 label: 'Linear' },
  { key: 'time_decay',             label: 'Time Decay (7-day half-life)' },
  { key: 'u_shaped',               label: 'U-Shaped (40/20/40)' },
  { key: 'w_shaped',               label: 'W-Shaped (30/30/30/10)' },
  { key: 'ai_platforms',           label: 'AI conversion source' },
]

const DIMENSIONS = [
  { key: 'date', label: 'Time' },
  { key: 'channel', label: 'Channel' },
  { key: 'source', label: 'Source' },
  { key: 'medium', label: 'Medium' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'keyword', label: 'Keyword / Term' },
  { key: 'referrer_domain', label: 'Referrer Domain' },
  { key: 'provider', label: 'Revenue Provider' },
  { key: 'attribution_status', label: 'Attribution Status' },
  { key: 'stitching_method', label: 'Stitching Method' },
  { key: 'conversion_type', label: 'Conversion Type' },
  { key: 'ai_source', label: 'AI Source' },
  { key: 'landing_page', label: 'Landing Page' },
  { key: 'country', label: 'Country' },
  { key: 'device', label: 'Device' },
  { key: 'browser', label: 'Browser' }
]

const getDimensionLabel = (key) => {
  if (!key) return ''
  if (key.startsWith('custom_param:')) {
    const param = key.split(':')[1]
    return param.charAt(0).toUpperCase() + param.slice(1)
  }
  return DIMENSIONS.find(d => d.key === key)?.label || key
}

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
  { key: 'area', label: 'Area' },
  { key: 'pie', label: 'Pie' },
  { key: 'kpi', label: 'KPI' },
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

const PRESET_TEMPLATES = [
  { name: 'AI sources', desc: 'See which AI platforms send converting visitors', model: 'last_touch', groupBy: 'ai_source', groupBy2: null, metric: 'sessions', days: 30, chartType: 'bar', granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date', filters: { has_ai_source: 'true' } },
  { name: 'AI revenue', desc: 'Revenue generated from AI referral touchpoints', model: 'last_touch', groupBy: 'ai_source', groupBy2: null, metric: 'revenue', days: 30, chartType: 'bar', granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date', filters: { has_ai_source: 'true' } },
  { name: 'AI landing pages', desc: 'Landing pages where AI visitors convert best', model: 'first_touch', groupBy: 'landing_page', groupBy2: null, metric: 'conversions', days: 30, chartType: 'bar', granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date', filters: { has_ai_source: 'true' } },
  { name: 'Campaign revenue', desc: 'Revenue performance across campaigns', model: 'last_touch', groupBy: 'campaign', groupBy2: null, metric: 'revenue', days: 90, chartType: 'bar', granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date', filters: { min_conversions: '5' } },
  { name: 'Channel revenue', desc: 'Revenue grouped by high-level marketing channel', model: 'last_touch', groupBy: 'channel', groupBy2: null, metric: 'revenue', days: 30, chartType: 'bar', granularity: 'day', attributionWindow: null, attributeBy: 'conversion_date', filters: {} },
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

const SOURCE_GROUPS = [
  { name: 'Organic Search', icon: '🔍', subs: ['Google Organic', 'Bing Organic', 'DuckDuckGo Organic'] },
  { name: 'Paid Search', icon: '💰', subs: ['Google Ads'] },
  { name: 'Paid Social', icon: '📢', subs: ['Facebook Ads', 'LinkedIn Ads'] },
  { name: 'Organic Social', icon: '👥', subs: ['Facebook', 'Instagram', 'Twitter / X', 'LinkedIn'] },
  { name: 'AI', icon: '✦', subs: ['ChatGPT', 'Claude', 'Gemini', 'Perplexity'] },
  { name: 'Referral', icon: '🔗', subs: [] },
  { name: 'Review Sites', icon: '⭐', subs: ['G2', 'Capterra', 'Trustpilot'] },
  { name: 'Email', icon: '✉️', subs: [] },
  { name: 'SMS', icon: '💬', subs: [] },
  { name: 'Direct / None', icon: '🚪', subs: [] }
]

async function getFlexibleReport(siteKey, model, dateFrom, dateTo, groupBy, metric, filters = {}, groupBy2 = null, granularity = 'day', attributionWindow = null, attributeBy = 'conversion_date') {
  const params = new URLSearchParams({ site_key: siteKey, model, date_from: dateFrom, date_to: dateTo, group_by: groupBy, metric })
  if (groupBy2) params.set('group_by2', groupBy2)
  if (granularity && granularity !== 'day') params.set('time_granularity', granularity)
  if (attributionWindow) params.set('attribution_window', attributionWindow)
  if (attributeBy && attributeBy !== 'conversion_date') params.set('attribute_by', attributeBy)
  if (filters.channel) params.set('filter_channel', filters.channel)
  if (filters.source) params.set('filter_source', filters.source)
  if (filters.medium) params.set('filter_medium', filters.medium)
  if (filters.campaign) params.set('filter_campaign', filters.campaign)
  if (filters.ai_source) params.set('filter_ai_source', filters.ai_source)
  if (filters.country) params.set('filter_country', filters.country)
  if (filters.device_type) params.set('filter_device_type', filters.device_type)
  if (filters.is_conversion) params.set('filter_is_conversion', filters.is_conversion)
  if (filters.conversion_type) params.set('filter_conversion_type', filters.conversion_type)
  if (filters.has_ai_source) params.set('filter_has_ai_source', filters.has_ai_source)
  if (filters.min_conversions) params.set('filter_min_conversions', filters.min_conversions)
  if (filters.customer_type) params.set('filter_customer_type', filters.customer_type)
  return fetchApi(`/attribution?${params}`)
}

function getDefaultDateRange(days) {
  if (days === 'month') {
    return { from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }
  }
  return { from: format(subDays(new Date(), days), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }
}

function getRollingDateRange(days) {
  const safeDays = Number(days) > 0 ? Number(days) : 30
  return getDefaultDateRange(safeDays)
}

function getPriorPeriod(dateFrom, dateTo) {
  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return null
  }
  const durationMs = to.getTime() - from.getTime()
  const priorTo = new Date(from.getTime() - 24 * 60 * 60 * 1000)
  const priorFrom = new Date(priorTo.getTime() - durationMs)
  return {
    date_from: priorFrom.toISOString().slice(0, 10),
    date_to: priorTo.toISOString().slice(0, 10)
  }
}

// Custom Select Component for consistent dark mode look
function CustomSelect({ value, onChange, options, placeholder = 'Select option...', disabled = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectedOpt = options.find(o => o.value === value)
  const displayLabel = selectedOpt ? selectedOpt.label : placeholder

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-[#242829] border border-gray-300 dark:border-[#2A2E2E] rounded-lg shadow-sm focus:outline-none text-gray-700 dark:text-gray-200 text-left disabled:opacity-50"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="w-4 h-4 ml-2 text-gray-400 flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#242829] border border-gray-200 dark:border-[#2A2E2E] rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {options.map((opt) => {
            const isSelected = opt.value === value
            const isDisabled = opt.disabled
            return (
              <button
                key={opt.value}
                type="button"
                disabled={isDisabled}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-lime-50 text-lime-800 dark:bg-lime-950/20 dark:text-lime-400 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#252929]'
                } ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <span className="text-lime-600 dark:text-lime-400">✓</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Date Range Popover Component
function DateRangePopover({
  isRolling,
  setIsRolling,
  rollingDays,
  setRollingDays,
  datePreset,
  setDatePreset,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  handleDatePreset
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [customDaysVal, setCustomDaysVal] = useState(rollingDays)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setCustomDaysVal(rollingDays)
  }, [rollingDays])

  const displayLabel = isRolling
    ? `Rolling: Last ${rollingDays} days`
    : datePreset === 'month'
      ? 'This month'
      : datePreset === 0
        ? `${dateFrom} → ${dateTo}`
        : `Last ${datePreset} days`

  const handleRollingSelect = (days) => {
    setRollingDays(days)
    setIsRolling(true)
    setDatePreset(0)
    setIsOpen(false)
  }

  const handleCustomRollingApply = () => {
    let days = parseInt(customDaysVal, 10)
    if (isNaN(days) || days < 1) days = 1
    if (days > 730) days = 730
    setRollingDays(days)
    setIsRolling(true)
    setDatePreset(0)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-[#242829] border border-gray-300 dark:border-[#2A2E2E] rounded-lg shadow-sm focus:outline-none text-gray-700 dark:text-gray-200 text-left"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="w-4 h-4 ml-2 text-gray-400 flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 left-0 w-80 mt-1 bg-white dark:bg-[#242829] border border-gray-200 dark:border-[#2A2E2E] rounded-xl shadow-xl p-4 text-xs">
          <div className="flex gap-2 mb-3 border-b border-gray-100 dark:border-[#2A2E2E] pb-2">
            <button
              type="button"
              onClick={() => setIsRolling(true)}
              className={`flex-1 py-1 rounded-md font-medium text-center ${isRolling ? 'bg-st-black dark:bg-lime-500 dark:text-st-black text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
            >
              Rolling
            </button>
            <button
              type="button"
              onClick={() => { setIsRolling(false); setDatePreset(30) }}
              className={`flex-1 py-1 rounded-md font-medium text-center ${!isRolling ? 'bg-st-black dark:bg-lime-500 dark:text-st-black text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}
            >
              Fixed
            </button>
          </div>

          {isRolling ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-1.5">
                {[7, 14, 30, 60, 90].map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleRollingSelect(d)}
                    className={`py-1.5 rounded border ${rollingDays === d ? 'border-lime-500 bg-lime-500/10 text-lime-800 dark:text-lime-400' : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  >
                    Last {d} days
                  </button>
                ))}
              </div>
              <div className="pt-2 border-t border-gray-100 dark:border-[#2A2E2E] flex items-center gap-2">
                <span className="text-gray-500">Last</span>
                <input
                  type="number"
                  min="1"
                  max="730"
                  value={customDaysVal}
                  onChange={(e) => setCustomDaysVal(e.target.value)}
                  className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-center text-st-black dark:text-white"
                />
                <span className="text-gray-500">days</span>
                <button
                  type="button"
                  onClick={handleCustomRollingApply}
                  className="ml-auto px-2.5 py-1 bg-st-black dark:bg-lime-500 dark:text-st-black text-white rounded font-semibold"
                >
                  Apply
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { label: 'Last 7 days', days: 7 },
                  { label: 'Last 30 days', days: 30 },
                  { label: 'Last 90 days', days: 90 },
                  { label: 'This month', days: 'month' }
                ].map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { handleDatePreset(p); setIsOpen(false) }}
                    className={`py-1.5 rounded border ${datePreset === p.days ? 'border-lime-500 bg-lime-500/10 text-lime-800 dark:text-lime-400' : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="pt-2 border-t border-gray-100 dark:border-[#2A2E2E]">
                <button
                  type="button"
                  onClick={() => setDatePreset(0)}
                  className={`w-full py-1.5 rounded border mb-2 text-center ${datePreset === 0 ? 'border-lime-500 text-lime-800 dark:text-lime-400' : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  Custom date range
                </button>
                {datePreset === 0 && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">From</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-center text-st-black dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">To</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-center text-st-black dark:text-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReportBuilder() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [site, setSite] = useState(null)

  // Report state
  const [reportName, setReportName] = useState('')
  const [model, setModel] = useState('last_touch')
  const [groupBy, setGroupBy] = useState('source')
  const [metric, setMetric] = useState('revenue')
  const [selectedMetrics, setSelectedMetrics] = useState(['revenue'])

  const toggleMetric = (key) => {
    setSelectedMetrics(prev =>
      prev.includes(key)
        ? prev.length > 1 ? prev.filter(k => k !== key) : prev
        : [...prev, key]
    )
    setMetric(key)
  }
  const [chartType, setChartType] = useState('bar')
  const [datePreset, setDatePreset] = useState(30)
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [isRolling, setIsRolling] = useState(false)
  const [rollingDays, setRollingDays] = useState(30)
  const [granularity, setGranularity] = useState('day')
  const [groupBy2, setGroupBy2] = useState(null)
  const [showGroupBy2, setShowGroupBy2] = useState(false)
  const [attributionWindow, setAttributionWindow] = useState(null)
  const [attributeBy, setAttributeBy] = useState('conversion_date')
  const [filters, setFilters] = useState({})
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)
  const [filterCount, setFilterCount] = useState(0)
  const [showExplanation, setShowExplanation] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [explainModalOpen, setExplainModalOpen] = useState(false)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const isMultiTouch = ['linear', 'time_decay', 'u_shaped', 'w_shaped'].includes(model)

  // UI state
  const [editingId, setEditingId] = useState(null)
  const [metricSearch, setMetricSearch] = useState('')
  const [showMetricDropdown, setShowMetricDropdown] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const query = supabase.from('sites').select('site_key, name, plan, custom_url_params').limit(1)
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
    setIsRolling(Boolean(widget.isRolling))
    setRollingDays(widget.rollingDays || 30)
    setEditingId(widget.id)
  }, [searchParams])

  const effectiveDateRange = isRolling ? getRollingDateRange(rollingDays) : { from: dateFrom, to: dateTo }
  const effectiveDateFrom = effectiveDateRange.from
  const effectiveDateTo = effectiveDateRange.to

  const filterKey = JSON.stringify(filters)
  const { data, isLoading } = useQuery({
    queryKey: ['report', site?.site_key, model, groupBy, metric, effectiveDateFrom, effectiveDateTo, filterKey, groupBy2, granularity, attributionWindow, attributeBy],
    queryFn: () => getFlexibleReport(site?.site_key, model, effectiveDateFrom, effectiveDateTo, groupBy, metric, filters, groupBy2, granularity, attributionWindow, attributeBy),
    enabled: !!site
  })

  const { data: savedReports, isLoading: reportsLoading, refetch: refetchReports } = useQuery({
    queryKey: ['saved-reports', site?.site_key],
    queryFn: async () => {
      if (!site?.site_key) return []
      if (!hasFeature(site?.plan, 'saved_reports')) return []
      return fetchApi(`/reports/saved?site_key=${encodeURIComponent(site.site_key)}`)
    },
    enabled: !!site?.site_key && hasFeature(site?.plan, 'saved_reports'),
    initialData: []
  })

  const [saveFeedback, setSaveFeedback] = useState(null)
  const [dashboardFeedback, setDashboardFeedback] = useState(null)
  const [isDashboardToggling, setIsDashboardToggling] = useState(false)
  const [priorReportData, setPriorReportData] = useState(null)

  const priorPeriod = getPriorPeriod(effectiveDateFrom, effectiveDateTo)
  const { data: priorRes } = useQuery({
    queryKey: ['report-prior', site?.site_key, model, groupBy, metric, effectiveDateFrom, effectiveDateTo, filterKey, groupBy2, granularity, attributionWindow, attributeBy],
    queryFn: () => getFlexibleReport(site?.site_key, model, priorPeriod.date_from, priorPeriod.date_to, groupBy, metric, filters, groupBy2, granularity, attributionWindow, attributeBy),
    enabled: !!site && !!priorPeriod && showCompare
  })

  useEffect(() => {
    if (!showCompare) {
      setPriorReportData(null)
    } else if (priorRes) {
      setPriorReportData(priorRes)
    }
  }, [showCompare, priorRes])

  const results = data?.results || []
  const nightlyNotice = data?._notice || null
  const activeReport = (savedReports || []).find(r => r.id === editingId)
  const isPinned = activeReport?.show_on_dashboard || false
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
    setIsRolling(false)
    setRollingDays(30)
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

  // Handle Marketer-friendly Source Filter Presets
  const applySourceFilter = (groupName, subSourceName = null) => {
    setFilters(prev => {
      const next = { ...prev }

      // Clear all related source tags
      delete next.channel
      delete next.source
      delete next.medium
      delete next.ai_source
      delete next.has_ai_source

      if (groupName === 'Organic Search') {
        next.channel = 'Organic Search'
        if (subSourceName === 'Google Organic') {
          next.source = 'google'
          next.medium = 'organic'
        } else if (subSourceName === 'Bing Organic') {
          next.source = 'bing'
          next.medium = 'organic'
        } else if (subSourceName === 'DuckDuckGo Organic') {
          next.source = 'duckduckgo'
          next.medium = 'organic'
        }
      } else if (groupName === 'Paid Search') {
        next.channel = 'Paid Search'
        if (subSourceName === 'Google Ads') {
          next.source = 'google'
          next.medium = 'cpc'
        }
      } else if (groupName === 'Paid Social') {
        next.channel = 'Paid Social'
        if (subSourceName === 'Facebook Ads') {
          next.source = 'facebook'
          next.medium = 'cpc'
        } else if (subSourceName === 'LinkedIn Ads') {
          next.source = 'linkedin'
          next.medium = 'cpc'
        }
      } else if (groupName === 'Organic Social') {
        next.channel = 'Organic Social'
        if (subSourceName === 'Facebook') {
          next.source = 'facebook'
        } else if (subSourceName === 'Instagram') {
          next.source = 'instagram'
        } else if (subSourceName === 'Twitter / X') {
          next.source = 'twitter'
        } else if (subSourceName === 'LinkedIn') {
          next.source = 'linkedin'
        }
      } else if (groupName === 'AI') {
        next.channel = 'AI Search'
        next.has_ai_source = 'true'
        if (subSourceName === 'ChatGPT') {
          next.ai_source = 'ChatGPT'
        } else if (subSourceName === 'Claude') {
          next.ai_source = 'Claude'
        } else if (subSourceName === 'Gemini') {
          next.ai_source = 'Gemini'
        } else if (subSourceName === 'Perplexity') {
          next.ai_source = 'Perplexity'
        }
      } else if (groupName === 'Referral') {
        next.channel = 'Referral'
      } else if (groupName === 'Review Sites') {
        next.channel = 'Referral'
        if (subSourceName === 'G2') {
          next.source = 'g2.com'
        } else if (subSourceName === 'Capterra') {
          next.source = 'capterra.com'
        } else if (subSourceName === 'Trustpilot') {
          next.source = 'trustpilot.com'
        }
      } else if (groupName === 'Email') {
        next.channel = 'Email'
      } else if (groupName === 'SMS') {
        next.medium = 'sms'
      } else if (groupName === 'Direct / None') {
        next.channel = 'Direct'
      }

      setFilterCount(Object.keys(next).length)
      return next
    })
  }

  const isSourceGroupActive = (groupName) => {
    if (groupName === 'Organic Search') return filters.channel === 'Organic Search'
    if (groupName === 'Paid Search') return filters.channel === 'Paid Search'
    if (groupName === 'Paid Social') return filters.channel === 'Paid Social'
    if (groupName === 'Organic Social') return filters.channel === 'Organic Social'
    if (groupName === 'AI') return filters.channel === 'AI Search' && filters.has_ai_source === 'true'
    if (groupName === 'Referral') return filters.channel === 'Referral' && !['g2.com', 'capterra.com', 'trustpilot.com'].includes(filters.source)
    if (groupName === 'Review Sites') return filters.channel === 'Referral' && ['g2.com', 'capterra.com', 'trustpilot.com'].includes(filters.source)
    if (groupName === 'Email') return filters.channel === 'Email'
    if (groupName === 'SMS') return filters.medium === 'sms'
    if (groupName === 'Direct / None') return filters.channel === 'Direct'
    return false
  }

  const isSubSourceActive = (groupName, subName) => {
    if (groupName === 'Organic Search') {
      if (subName === 'Google Organic') return filters.source === 'google' && filters.medium === 'organic'
      if (subName === 'Bing Organic') return filters.source === 'bing' && filters.medium === 'organic'
      if (subName === 'DuckDuckGo Organic') return filters.source === 'duckduckgo' && filters.medium === 'organic'
    }
    if (groupName === 'Paid Search') {
      if (subName === 'Google Ads') return filters.source === 'google' && filters.medium === 'cpc'
    }
    if (groupName === 'Paid Social') {
      if (subName === 'Facebook Ads') return filters.source === 'facebook' && filters.medium === 'cpc'
      if (subName === 'LinkedIn Ads') return filters.source === 'linkedin' && filters.medium === 'cpc'
    }
    if (groupName === 'Organic Social') {
      if (subName === 'Facebook') return filters.source === 'facebook'
      if (subName === 'Instagram') return filters.source === 'instagram'
      if (subName === 'Twitter / X') return filters.source === 'twitter'
      if (subName === 'LinkedIn') return filters.source === 'linkedin'
    }
    if (groupName === 'AI') {
      if (subName === 'ChatGPT') return filters.ai_source === 'ChatGPT'
      if (subName === 'Claude') return filters.ai_source === 'Claude'
      if (subName === 'Gemini') return filters.ai_source === 'Gemini'
      if (subName === 'Perplexity') return filters.ai_source === 'Perplexity'
    }
    if (groupName === 'Review Sites') {
      if (subName === 'G2') return filters.source === 'g2.com'
      if (subName === 'Capterra') return filters.source === 'capterra.com'
      if (subName === 'Trustpilot') return filters.source === 'trustpilot.com'
    }
    return false
  }

  const handleEdit = (report) => {
    const cfg = report.config || report
    setReportName(report.name || cfg.name)
    setModel(cfg.model || 'last_touch')
    setGroupBy(cfg.groupBy || 'source')
    setMetric(cfg.metric || 'revenue')
    setSelectedMetrics(cfg.selectedMetrics || [cfg.metric || 'revenue'])
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
    setIsRolling(Boolean(cfg.isRolling))
    setRollingDays(cfg.rollingDays || 30)
    setEditingId(report.id)
    queryClient.invalidateQueries({ queryKey: ['report'] })
  }

  const handleSave = async () => {
    const name = reportName.trim() || `Report ${new Date().toLocaleDateString()}`
    const config = {
      model, groupBy, metric, selectedMetrics, chartType, dateFrom, dateTo,
      granularity, groupBy2, attributionWindow, attributeBy,
      filters, isRolling, rollingDays
    }
    const wasEditing = !!editingId
    try {
      const saveUrl = editingId
        ? `/reports/saved/${editingId}?site_key=${encodeURIComponent(site.site_key)}`
        : `/reports/saved?site_key=${encodeURIComponent(site.site_key)}`

      await fetchApi(saveUrl, {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify({ name, config })
      })
      setSaveFeedback(wasEditing ? 'updated' : 'saved')
      setReportName('')
      setEditingId(null)
      refetchReports()
    } catch (err) {
      console.error('Save report failed:', err)
      setSaveFeedback('error')
    }
    setTimeout(() => setSaveFeedback(null), 2500)
  }

  const handleDelete = async (id) => {
    try {
      await fetchApi(`/reports/saved/${id}?site_key=${encodeURIComponent(site.site_key)}`, { method: 'DELETE' })
      refetchReports()
    } catch { /* silent */ }
  }

  const handleDashboardToggle = async () => {
    if (isDashboardToggling) return
    if (!hasFeature(site?.plan, 'dashboard_widgets')) {
      navigate('/billing')
      return
    }
    setIsDashboardToggling(true)

    let reportId = editingId
    const name = reportName.trim() || `Report ${new Date().toLocaleDateString()}`
    const config = {
      model, groupBy, metric, selectedMetrics, chartType, dateFrom, dateTo,
      granularity, groupBy2, attributionWindow, attributeBy,
      filters, isRolling, rollingDays
    }

    try {
      if (!reportId) {
        const saveRes = await fetchApi(`/reports/saved?site_key=${encodeURIComponent(site.site_key)}`, {
          method: 'POST',
          body: { name, config }
        })
        if (!saveRes?.id) {
          throw new Error('Failed to save report configuration')
        }
        reportId = saveRes.id
        setEditingId(reportId)
        setReportName(saveRes.name)
      }

      const activeReport = (savedReports || []).find(r => r.id === reportId)
      const nextPinnedState = !(activeReport?.show_on_dashboard)

      await fetchApi(`/reports/saved/${reportId}/dashboard?site_key=${encodeURIComponent(site.site_key)}`, {
        method: 'PATCH',
        body: {
          show_on_dashboard: nextPinnedState,
          dashboard_size: activeReport?.dashboard_size || 'medium',
          dashboard_position: activeReport?.dashboard_position || 0
        }
      })

      setDashboardFeedback(nextPinnedState ? 'pinned' : 'unpinned')
      await refetchReports()
    } catch (err) {
      console.error('Dashboard toggle failed:', err)
      setDashboardFeedback('error')
    } finally {
      setIsDashboardToggling(false)
    }
    setTimeout(() => setDashboardFeedback(null), 3000)
  }

  const handleListPinToggle = async (report) => {
    if (!hasFeature(site?.plan, 'dashboard_widgets')) {
      navigate('/billing')
      return
    }
    try {
      const nextState = !report.show_on_dashboard
      await fetchApi(`/reports/saved/${report.id}/dashboard?site_key=${encodeURIComponent(site.site_key)}`, {
        method: 'PATCH',
        body: {
          show_on_dashboard: nextState,
          dashboard_size: report.dashboard_size || 'medium',
          dashboard_position: report.dashboard_position || 0
        }
      })
      refetchReports()
    } catch (err) {
      console.error('List pin toggle failed:', err)
    }
  }

  const handleLoad = (report) => {
    handleEdit(report)
  }

  const resetReport = () => {
    setEditingId(null)
    setReportName('')
    setModel('last_touch')
    setGroupBy('source')
    setMetric('revenue')
    setChartType('bar')
    setDatePreset(30)
    setDateFrom(format(subDays(new Date(), 30), 'yyyy-MM-dd'))
    setDateTo(format(new Date(), 'yyyy-MM-dd'))
    setGranularity('day')
    setGroupBy2(null)
    setShowGroupBy2(false)
    setAttributionWindow(null)
    setAttributeBy('conversion_date')
    setFilters({})
    setFilterCount(0)
    setIsRolling(false)
    setRollingDays(30)
    setSaveFeedback(null)
    setIsAdvancedOpen(false)
  }

  function getSavedReportMeta(report) {
    const cfg = report.config || {}
    return {
      metricLabel: METRICS.find(m => m.key === cfg.metric)?.label || cfg.metric || 'Metric',
      groupLabel: getDimensionLabel(cfg.groupBy) || 'Source',
      modelLabel: MODELS.find(m => m.key === cfg.model)?.label || cfg.model || 'Last Touch',
      dateLabel: cfg.dateFrom && cfg.dateTo
        ? `${cfg.dateFrom} → ${cfg.dateTo}`
        : cfg.datePreset
          ? `Last ${cfg.datePreset} days`
          : 'Date range',
      filterCount: Object.keys(cfg.filters || {}).length
    }
  }

  const handleExportCSV = () => {
    if (!site) return
    const params = new URLSearchParams({ site_key: site.site_key, model, date_from: effectiveDateFrom, date_to: effectiveDateTo, group_by: groupBy, metric })
    if (filters.channel) params.set('filter_channel', filters.channel)
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

  const MULTI_COLORS = [
    'rgba(17, 24, 39, 0.85)',
    'rgba(132, 204, 22, 0.85)',
    'rgba(59, 130, 246, 0.85)',
    'rgba(249, 115, 22, 0.85)',
  ]
  const isMultiMetric = selectedMetrics.length > 1
  const chartLabels = results.slice(0, 15).map(r => groupBy2 ? `${r.dim_value} / ${r.dim_value2}` : r.dim_value)
  const chartData = {
    labels: chartLabels,
    datasets: isMultiMetric
      ? selectedMetrics.map((mk, mi) => {
          const mDef = METRICS.find(x => x.key === mk)
          return {
            label: mDef?.label || mk,
            data: results.slice(0, 15).map(r => r[mk] ?? 0),
            backgroundColor: chartType === 'area' ? MULTI_COLORS[mi % MULTI_COLORS.length].replace('0.85)', '0.15)') : MULTI_COLORS[mi % MULTI_COLORS.length],
            borderColor: chartType === 'line' || chartType === 'area' ? MULTI_COLORS[mi % MULTI_COLORS.length] : undefined,
            borderRadius: chartType === 'bar' ? 4 : 0,
            tension: 0.3,
            fill: chartType === 'area',
            stack: chartType === 'bar' ? 'stack0' : undefined,
          }
        })
      : [{
          label: metricLabel,
          data: results.slice(0, 15).map(r => getMetricValue(r)),
          backgroundColor: results.slice(0, 15).map((_, i) => COLORS[i % COLORS.length]),
          borderColor: chartType === 'line' || chartType === 'area' ? 'rgba(17, 24, 39, 1)' : undefined,
          borderRadius: chartType === 'bar' ? 4 : 0,
          tension: 0.3,
          fill: chartType === 'area'
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

  function getKpiValue(rows, m) {
    if (!rows || rows.length === 0) return null
    const row = rows[0]
    if (row[m] !== undefined) return row[m]
    for (const key of Object.keys(row)) {
      if (key !== 'dim_value' && key !== 'dim_value2' && typeof row[key] === 'number') return row[key]
    }
    return null
  }

  function formatKpiValue(value, m) {
    if (value === null || value === undefined) return '—'
    const revenueMetrics = ['revenue', 'ai_revenue', 'ltv_revenue', 'avg_conversion_value']
    const rateMetrics = ['conversion_rate', 'ai_conversion_share', 'ai_revenue_share']
    if (revenueMetrics.includes(m)) return `$${Number(value).toFixed(2)}`
    if (rateMetrics.includes(m)) return `${Number(value).toFixed(1)}%`
    if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`
    return Number(value).toLocaleString()
  }

  function formatKpiDelta(currentVal, priorVal) {
    if (!priorVal || priorVal === 0) return null
    const delta = ((currentVal - priorVal) / priorVal) * 100
    return { value: delta, label: `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`, positive: delta >= 0 }
  }

  const canPreview = site && metric && groupBy && effectiveDateFrom && effectiveDateTo

  // Group By Options mapping
  const groupByOptions = [
    ...DIMENSIONS.map(d => ({ value: d.key, label: d.label })),
    ...(site?.custom_url_params || []).map(p => ({ value: `custom_param:${p}`, label: `Custom: ${p}` }))
  ]

  const groupBy2Options = [
    { value: '', label: 'None' },
    ...DIMENSIONS.filter(d => d.key !== groupBy || d.key === 'date').map(d => ({ value: d.key, label: d.label })),
    ...(site?.custom_url_params || []).filter(p => `custom_param:${p}` !== groupBy).map(p => ({ value: `custom_param:${p}`, label: `Custom: ${p}` }))
  ]

  // Attribution Model Options mapping
  const modelOptions = MODELS.map(m => {
    const locked = MULTI_TOUCH_KEYS.has(m.key) && !hasFeature(site?.plan, 'multi_touch_attribution')
    return {
      value: m.key,
      label: locked ? `🔒 ${m.label} · Upgrade` : m.label,
      disabled: locked
    }
  })

  // Window options
  const windowOptions = [
    { value: '', label: 'No lookback (date range only)' },
    { value: '1', label: '1 day' },
    { value: '7', label: '7 days' },
    { value: '14', label: '14 days' },
    { value: '30', label: '30 days' },
    { value: '60', label: '60 days' },
    { value: '90', label: '90 days' }
  ]

  // Attribute By options
  const attributeByOptions = [
    { value: 'conversion_date', label: 'Conversion Date' },
    { value: 'first_seen_date', label: 'First Seen Date' },
    { value: 'original_source_date', label: 'Original Source Date' }
  ]

  // Chart type options
  const chartTypeOptions = CHART_TYPES.map(c => ({ value: c.key, label: c.label }))

  // Device options
  const deviceOptions = [
    { value: '', label: 'Any Device' },
    { value: 'desktop', label: 'Desktop' },
    { value: 'mobile', label: 'Mobile' },
    { value: 'tablet', label: 'Tablet' }
  ]

  // AI Source filter options
  const aiSourceFilterOptions = [
    { value: '', label: 'Any AI Source' },
    { value: 'ChatGPT', label: 'ChatGPT' },
    { value: 'Claude', label: 'Claude' },
    { value: 'Perplexity', label: 'Perplexity' },
    { value: 'Gemini', label: 'Gemini' },
    { value: 'Grok', label: 'Grok' },
    { value: 'Copilot', label: 'Copilot' },
    { value: 'DeepSeek', label: 'DeepSeek' },
    { value: 'You.com AI', label: 'You.com AI' },
    { value: 'Phind', label: 'Phind' },
    { value: 'Kagi', label: 'Kagi' }
  ]

  // Has AI Source options
  const hasAiSourceFilterOptions = [
    { value: '', label: 'Any' },
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' }
  ]

  // Customer Type options
  const customerTypeFilterOptions = [
    { value: '', label: 'All Customers' },
    { value: 'new', label: 'New Customers Only' },
    { value: 'returning', label: 'Returning Customers Only' }
  ]

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Report Builder</h2>
          <p className="text-sm text-st-gray dark:text-gray-400 mt-1">Choose a business question → lightly configure → preview answer → save/pin</p>
        </div>
        <button
          onClick={() => setIsDrawerOpen(true)}
          className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-[#1A1D1D] border border-gray-300 dark:border-[#2A2E2E] rounded-lg hover:bg-gray-50 dark:hover:bg-[#252929] flex items-center gap-1.5 transition-all font-semibold shadow-sm"
        >
          <Bookmark className="w-4 h-4 text-lime-500" />
          Saved Reports
          {savedReports.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-lime-500 text-st-black rounded-full font-bold">
              {savedReports.length}
            </span>
          )}
        </button>
      </div>

      {/* Preset question pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Templates:</span>
        {PRESET_TEMPLATES.map((p) => {
          const isActive = reportName === p.name
          return (
            <button
              key={p.name}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                isActive
                  ? 'bg-lime-500 text-st-black border-lime-500 font-semibold'
                  : 'bg-white dark:bg-[#1A1D1D] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-[#2A2E2E] hover:bg-gray-50 dark:hover:bg-[#252929]'
              }`}
              title={p.desc}
            >
              {p.name}
            </button>
          )
        })}
      </div>

      {/* Active preset helper description */}
      {(() => {
        const activePreset = PRESET_TEMPLATES.find(p => reportName === p.name)
        if (activePreset && activePreset.desc) {
          return (
            <div className="text-xs text-st-gray dark:text-gray-400 bg-lime-500/10 border border-lime-500/20 rounded-lg px-3 py-2 max-w-max">
              💡 <span className="font-semibold text-gray-900 dark:text-white">{activePreset.name}:</span> {activePreset.desc}
            </div>
          )
        }
        return null
      })()}

      {/* Two-Panel Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column: Configure Card */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#2A2E2E] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white pb-3 border-b border-gray-100 dark:border-[#2A2E2E]">Configure Report</h3>

            {/* 1. Report Name */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Report Name</label>
              <input
                type="text"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="e.g. Weekly Revenue by Source"
                maxLength={60}
                className="w-full px-3 py-2 border border-gray-300 dark:border-[#2A2E2E] rounded-lg text-sm outline-none focus:ring-1 focus:ring-lime-500 dark:bg-[#242829] dark:text-white"
              />
            </div>

            {/* 2. Date Range */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Date Range</label>
              <DateRangePopover
                isRolling={isRolling}
                setIsRolling={setIsRolling}
                rollingDays={rollingDays}
                setRollingDays={setRollingDays}
                datePreset={datePreset}
                setDatePreset={setDatePreset}
                dateFrom={dateFrom}
                setDateFrom={setDateFrom}
                dateTo={dateTo}
                setDateTo={setDateTo}
                handleDatePreset={handleDatePreset}
              />
              {(groupBy === 'date' || groupBy2 === 'date') && (
                <div className="pt-2">
                  <label className="block text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Granularity</label>
                  <div className="flex flex-wrap gap-1">
                    {GRANULARITY.map(g => (
                      <button
                        key={g.key}
                        type="button"
                        onClick={() => setGranularity(g.key)}
                        className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                          granularity === g.key ? 'bg-lime-100 text-lime-800 dark:bg-lime-500/20 dark:text-lime-400 font-semibold' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 3. Metric Select */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Metric</label>
              {selectedMetrics.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {selectedMetrics.map(k => {
                    const m = METRICS.find(x => x.key === k)
                    return (
                      <span key={k} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-lime-100 dark:bg-lime-950/30 text-lime-800 dark:text-lime-400 rounded-full font-medium">
                        {m?.label || k}
                        {selectedMetrics.length > 1 && (
                          <button onClick={() => toggleMetric(k)} className="text-lime-600 hover:text-red-500 ml-0.5">&times;</button>
                        )}
                      </span>
                    )
                  })}
                </div>
              )}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMetricDropdown(!showMetricDropdown)}
                  className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-[#242829] border border-gray-300 dark:border-[#2A2E2E] rounded-lg shadow-sm text-gray-700 dark:text-gray-200 text-left"
                >
                  <span className="truncate text-xs text-st-gray dark:text-gray-400">
                    {selectedMetrics.length === 0 ? 'Select metrics...' : `+ Add metric (${selectedMetrics.length} selected)`}
                  </span>
                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                </button>
                {showMetricDropdown && (
                  <div className="absolute z-40 mt-1 w-full bg-white dark:bg-[#242829] border border-gray-200 dark:border-[#2A2E2E] rounded-lg shadow-lg max-h-72 overflow-auto">
                    <div className="p-2 border-b border-gray-100 dark:border-[#2A2E2E] sticky top-0 bg-white dark:bg-[#242829]">
                      <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-[#1A1D1D] rounded">
                        <Search className="w-3.5 h-3.5 text-st-gray dark:text-gray-400" />
                        <input
                          type="text"
                          value={metricSearch}
                          onChange={(e) => setMetricSearch(e.target.value)}
                          placeholder="Search metrics..."
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 bg-transparent text-sm outline-none"
                        />
                      </div>
                      <p className="text-[10px] text-st-gray dark:text-gray-400 mt-1 px-1">Click to add/remove (up to 4 metrics).</p>
                    </div>
                    {['Core', 'Conversion', 'AI', 'LTV', 'Session'].map(group => {
                      const groupMetrics = filteredMetrics.filter(m => m.group === group)
                      if (groupMetrics.length === 0) return null
                      return (
                        <div key={group}>
                          <div className="px-3 py-1 text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase bg-gray-50 dark:bg-[#252929]">{group}</div>
                          {groupMetrics.map((m) => {
                            const isSelected = selectedMetrics.includes(m.key)
                            return (
                              <button
                                key={m.key}
                                type="button"
                                onClick={() => {
                                  if (selectedMetrics.length < 4 || isSelected) toggleMetric(m.key)
                                  if (selectedMetrics.length === 1 && !isSelected) setShowMetricDropdown(false)
                                }}
                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-[#252929] transition-colors flex items-center gap-2 ${
                                  isSelected ? 'bg-lime-50 text-lime-800 dark:bg-lime-950/20 dark:text-lime-400 font-semibold' : 'text-gray-700 dark:text-gray-300'
                                }`}
                              >
                                <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${isSelected ? 'bg-lime-500 border-lime-500 text-white' : 'border-gray-300'}`}>
                                  {isSelected ? '✓' : ''}
                                </span>
                                <div>
                                  <div>{m.label}</div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 4. Group By */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Group By</label>
              <CustomSelect
                value={groupBy}
                onChange={setGroupBy}
                options={groupByOptions}
              />
            </div>

            {/* 5. Group By 2 */}
            {showGroupBy2 ? (
              <div className="space-y-1 pt-1.5 border-t border-dashed border-gray-100 dark:border-[#2A2E2E]">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Group By 2</label>
                  <button
                    onClick={() => { setShowGroupBy2(false); setGroupBy2(null) }}
                    className="text-xs text-red-500 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
                <CustomSelect
                  value={groupBy2 || ''}
                  onChange={(val) => setGroupBy2(val || null)}
                  options={groupBy2Options}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowGroupBy2(true)}
                className="text-xs text-lime-600 hover:text-lime-700 font-semibold flex items-center gap-1 pt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add secondary Group By
              </button>
            )}

            {/* Source Shortcut Chips */}
            <div className="space-y-1.5 pt-1.5 border-t border-dashed border-gray-100 dark:border-[#2A2E2E]">
              <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Filter by Traffic Source</label>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setFilters(prev => {
                      const next = { ...prev }
                      delete next.channel
                      delete next.source
                      delete next.medium
                      delete next.ai_source
                      delete next.has_ai_source
                      setFilterCount(Object.keys(next).length)
                      return next
                    })
                  }}
                  className={`px-2 py-0.5 rounded-full text-[10px] border transition-all ${
                    !(filters.channel || filters.source || filters.medium || filters.ai_source || filters.has_ai_source)
                      ? 'bg-lime-500 text-st-black border-lime-500 font-semibold'
                      : 'bg-white dark:bg-gray-800 text-gray-750 dark:text-gray-400 border-gray-200 dark:border-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  All Sources
                </button>
                {SOURCE_GROUPS.map((g) => {
                  const isActive = isSourceGroupActive(g.name)
                  return (
                    <button
                      key={g.name}
                      type="button"
                      onClick={() => applySourceFilter(g.name)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-all ${
                        isActive
                          ? 'bg-lime-500 text-st-black border-lime-500 font-semibold'
                          : 'bg-white dark:bg-gray-800 text-gray-750 dark:text-gray-400 border-gray-200 dark:border-gray-750 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {g.name}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Advanced Settings collapsible row */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                className="w-full flex items-center justify-between py-2 px-3 border border-gray-200 dark:border-[#2A2E2E] bg-gray-50/50 dark:bg-gray-800/20 hover:bg-gray-50 dark:hover:bg-[#252929] rounded-xl transition-all"
              >
                <div className="text-left">
                  <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Advanced Settings</div>
                  <div className="text-[10px] text-st-gray dark:text-gray-400 mt-0.5">Attribution · filters · comparison</div>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
              </button>

              {isAdvancedOpen && (
                <div className="space-y-4 mt-3 pt-3 border-t border-gray-100 dark:border-[#2A2E2E] text-xs">

                  {/* Attribution Model */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-st-gray dark:text-gray-400">Attribution Model</label>
                    <CustomSelect
                      value={model}
                      onChange={(next) => {
                        if (MULTI_TOUCH_KEYS.has(next) && !hasFeature(site?.plan, 'multi_touch_attribution')) {
                          return
                        }
                        setModel(next)
                      }}
                      options={modelOptions}
                    />
                    {model === 'ai_platforms' ? (
                      <p className="text-[10px] text-lime-600 dark:text-lime-400 mt-1">
                        Groups conversions by the AI source detected on the conversion event.
                      </p>
                    ) : (
                      <p className="text-[10px] text-st-gray dark:text-gray-400 mt-1">
                        How credit is assigned to each touchpoint in the customer journey.
                      </p>
                    )}
                    {!hasFeature(site?.plan, 'multi_touch_attribution') && (
                      <p className="text-[10px] text-st-gray dark:text-gray-400">
                        🔒 Multi-touch models require an <a href="/billing" className="text-st-lime hover:underline font-semibold">Upgrade</a>.
                      </p>
                    )}
                  </div>

                  {/* Attribution Window */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-st-gray dark:text-gray-400">Attribution Lookback Window</label>
                    <CustomSelect
                      value={attributionWindow || ''}
                      onChange={(val) => setAttributionWindow(val || null)}
                      options={windowOptions}
                    />
                    <p className="text-[10px] text-st-gray dark:text-gray-400 mt-1">How far back from conversion to look for touchpoints.</p>
                  </div>

                  {/* Attribute By */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-st-gray dark:text-gray-400">Attribute Anchored By</label>
                    <CustomSelect
                      value={attributeBy}
                      onChange={setAttributeBy}
                      options={attributeByOptions}
                    />
                  </div>

                  {/* Chart Type */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-st-gray dark:text-gray-400">Chart Type</label>
                    <CustomSelect
                      value={chartType}
                      onChange={setChartType}
                      options={chartTypeOptions}
                    />
                  </div>

                  {/* Sources filter grid */}
                  <div className="space-y-2 border-t border-gray-100 dark:border-[#2A2E2E] pt-3">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Traffic Sources</label>
                    <p className="text-[10px] text-st-gray dark:text-gray-400">Filter report results by category or specific source.</p>

                    <div className="grid grid-cols-2 gap-1.5">
                      {SOURCE_GROUPS.map((g) => {
                        const isGroupActive = isSourceGroupActive(g.name)
                        return (
                          <div key={g.name} className="space-y-1">
                            <button
                              type="button"
                              onClick={() => applySourceFilter(g.name)}
                              className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left transition-all border ${
                                isGroupActive
                                  ? 'bg-lime-500/10 border-lime-500 text-lime-800 dark:text-lime-400 font-semibold'
                                  : 'bg-gray-50 dark:bg-[#242829] border-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2A2E2E]'
                              }`}
                            >
                              <span>{g.icon}</span>
                              <span className="truncate">{g.name}</span>
                            </button>
                            {g.subs.length > 0 && isGroupActive && (
                              <div className="pl-2 space-y-0.5">
                                {g.subs.map((sub) => {
                                  const isSubActive = isSubSourceActive(g.name, sub)
                                  return (
                                    <button
                                      key={sub}
                                      type="button"
                                      onClick={() => applySourceFilter(g.name, sub)}
                                      className={`w-full text-[10px] text-left px-2 py-0.5 rounded transition-all ${
                                        isSubActive
                                          ? 'bg-lime-500 text-st-black font-semibold'
                                          : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                                      }`}
                                    >
                                      {sub}
                                    </button>
                                  )}
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {(filters.channel || filters.source || filters.medium || filters.ai_source || filters.has_ai_source) && (
                      <button
                        type="button"
                        onClick={() => {
                          setFilters(prev => {
                            const next = { ...prev }
                            delete next.channel
                            delete next.source
                            delete next.medium
                            delete next.ai_source
                            delete next.has_ai_source
                            setFilterCount(Object.keys(next).length)
                            return next
                          })
                        }}
                        className="text-xs text-red-500 hover:text-red-600 block mt-1 font-semibold"
                      >
                        Clear source filters
                      </button>
                    )}
                  </div>

                  {/* Other standard filter fields */}
                  <div className="space-y-3 border-t border-gray-100 dark:border-[#2A2E2E] pt-3">
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Other Filters</label>

                    <div className="grid grid-cols-2 gap-2">
                      {/* Channel */}
                      <div className="space-y-1">
                        <label className="block text-[10px] text-gray-500">Channel Name</label>
                        <input
                          type="text"
                          value={filters.channel || ''}
                          onChange={(e) => applyFilter('channel', e.target.value || undefined)}
                          placeholder="e.g. Organic Search"
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-st-black dark:text-white text-xs outline-none"
                        />
                      </div>

                      {/* Source */}
                      <div className="space-y-1">
                        <label className="block text-[10px] text-gray-500">Source Name</label>
                        <input
                          type="text"
                          value={filters.source || ''}
                          onChange={(e) => applyFilter('source', e.target.value || undefined)}
                          placeholder="e.g. google"
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-st-black dark:text-white text-xs outline-none"
                        />
                      </div>

                      {/* Medium */}
                      <div className="space-y-1">
                        <label className="block text-[10px] text-gray-500">Medium</label>
                        <input
                          type="text"
                          value={filters.medium || ''}
                          onChange={(e) => applyFilter('medium', e.target.value || undefined)}
                          placeholder="e.g. cpc"
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-st-black dark:text-white text-xs outline-none"
                        />
                      </div>

                      {/* Campaign */}
                      <div className="space-y-1">
                        <label className="block text-[10px] text-gray-500">Campaign</label>
                        <input
                          type="text"
                          value={filters.campaign || ''}
                          onChange={(e) => applyFilter('campaign', e.target.value || undefined)}
                          placeholder="e.g. summer_sale"
                          className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-st-black dark:text-white text-xs outline-none"
                        />
                      </div>
                    </div>

                    {/* Conversion Type */}
                    <div className="space-y-1">
                      <label className="block text-[10px] text-gray-500">Conversion Type</label>
                      <input
                        type="text"
                        value={filters.conversion_type || ''}
                        onChange={(e) => applyFilter('conversion_type', e.target.value || undefined)}
                        placeholder="e.g. signup"
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-st-black dark:text-white"
                      />
                    </div>

                    {/* Min Conversions */}
                    <div className="space-y-1">
                      <label className="block text-[10px] text-gray-500">Min Conversions (threshold)</label>
                      <input
                        type="number"
                        min="0"
                        value={filters.min_conversions || ''}
                        onChange={(e) => applyFilter('min_conversions', e.target.value || undefined)}
                        placeholder="e.g. 5"
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-st-black dark:text-white"
                      />
                    </div>

                    {/* Customer Type */}
                    <div className="space-y-1">
                      <label className="block text-[10px] text-gray-500">Customer Type</label>
                      <CustomSelect
                        value={filters.customer_type || ''}
                        onChange={(val) => applyFilter('customer_type', val || undefined)}
                        options={customerTypeFilterOptions}
                      />
                    </div>

                    {/* Device */}
                    <div className="space-y-1">
                      <label className="block text-[10px] text-gray-500">Device</label>
                      <CustomSelect
                        value={filters.device_type || ''}
                        onChange={(val) => applyFilter('device_type', val || undefined)}
                        options={deviceOptions}
                      />
                    </div>

                    {/* Country */}
                    <div className="space-y-1">
                      <label className="block text-[10px] text-gray-500">Country</label>
                      <input
                        type="text"
                        value={filters.country || ''}
                        onChange={(e) => applyFilter('country', e.target.value || undefined)}
                        placeholder="e.g. US"
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-st-black dark:text-white"
                      />
                    </div>

                    {/* Conversions only check */}
                    <label className="flex items-center gap-2 cursor-pointer pt-1 font-medium text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={filters.is_conversion === 'true'}
                        onChange={(e) => applyFilter('is_conversion', e.target.checked ? 'true' : undefined)}
                        className="rounded border-gray-300 text-st-black focus:ring-lime-500"
                      />
                      Conversions only
                    </label>

                    {filterCount > 0 && (
                      <button
                        type="button"
                        onClick={() => { setFilters({}); setFilterCount(0) }}
                        className="w-full py-1.5 border border-red-200 dark:border-red-950 text-red-500 hover:text-red-600 rounded transition-all font-semibold"
                      >
                        Clear all filters
                      </button>
                    )}

                  </div>

                </div>
              )}
            </div>

            {/* Reset / New button */}
            <div className="pt-2 border-t border-gray-100 dark:border-[#2A2E2E]">
              <button
                type="button"
                onClick={resetReport}
                className="w-full text-center text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 py-1"
              >
                Reset Configuration
              </button>
            </div>

          </div>
        </div>

        {/* Right Column: Live Preview Panel */}
        <div className="lg:col-span-2 space-y-4">
          {!canPreview ? (
            <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#2A2E2E] p-16 text-center">
              <ArrowRight className="w-10 h-10 text-gray-300 mx-auto mb-4" />
              <p className="text-st-gray dark:text-gray-400 font-semibold text-lg">Build your report</p>
              <p className="text-sm text-st-gray dark:text-gray-400 mt-1 max-w-sm mx-auto">
                Enter a report name, choose your date range, metric, and dimension to generate a real-time preview.
              </p>
            </div>
          ) : (
            <>
              {data?.truncated && (
                <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                  <span>⚠</span>
                  <span>Results may be incomplete — this report hit the 50,000 event limit. Try a shorter date range.</span>
                </div>
              )}

              {/* Summary and Header Actions Card */}
              <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#2A2E2E] p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Previewing</h4>
                    <p className="text-lg font-bold text-st-black truncate mt-0.5">{reportName || 'Untitled Report'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-lime-600 dark:text-lime-400">{metricFormat(total)}</span>
                      <span className="text-xs text-st-gray dark:text-gray-400">total {metricLabel}</span>
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-st-black/5 dark:bg-white/10 text-[10px] font-semibold text-st-black dark:text-white"
                        title={`Attribution model: ${MODELS.find(m => m.key === model)?.label || model}. The model determines which touch in the customer journey gets credit.`}
                      >
                        {MODELS.find(m => m.key === model)?.label || model}
                      </span>
                    </div>
                  </div>

                  {/* Actions Header */}
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    {hasFeature(site?.plan, 'saved_reports') ? (
                      <>
                        <button
                          onClick={handleSave}
                          className="px-3 py-1.5 text-xs bg-st-black text-white hover:bg-gray-800 dark:bg-lime-500 dark:text-st-black dark:hover:bg-lime-400 rounded-lg flex items-center gap-1 font-semibold transition-all shadow-sm"
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          {editingId ? 'Update' : 'Save'}
                        </button>
                        {hasFeature(site?.plan, 'dashboard_widgets') ? (
                          <button
                            onClick={handleDashboardToggle}
                            disabled={isDashboardToggling}
                            className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 font-semibold transition-colors border shadow-sm ${
                              isPinned
                                ? 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30 border-red-200'
                                : 'bg-lime-50 text-lime-800 hover:bg-lime-100 dark:bg-lime-950/20 dark:text-lime-400 dark:border-lime-900/30 border-lime-200'
                            }`}
                          >
                            {isDashboardToggling ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <BarChart3 className="w-3.5 h-3.5" />
                            )}
                            {isPinned ? 'Unpin' : 'Pin'}
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate('/billing')}
                            className="px-3 py-1.5 text-xs bg-gray-50 text-st-gray border border-gray-200 rounded-lg flex items-center gap-1.5 font-semibold opacity-70"
                            title="Pin to dashboard available on Growth"
                          >
                            🔒 Pin
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-st-gray dark:text-gray-400">
                        🔒 Save requires <a href="/billing" className="text-st-lime hover:underline font-semibold">Upgrade</a>
                      </span>
                    )}
                    {hasFeature(site?.plan, 'csv_export') ? (
                      <button
                        onClick={handleExportCSV}
                        className="px-3 py-1.5 text-xs bg-white dark:bg-[#242829] hover:bg-gray-50 dark:hover:bg-[#2A2E2E] text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-[#2A2E2E] rounded-lg flex items-center gap-1 font-semibold shadow-sm"
                      >
                        <Download className="w-3.5 h-3.5" />
                        CSV
                      </button>
                    ) : (
                      <a
                        href="/billing"
                        className="px-3 py-1.5 text-xs bg-white dark:bg-[#242829] hover:border-st-lime text-gray-400 border border-gray-300 dark:border-[#2A2E2E] rounded-lg flex items-center gap-1 font-semibold shadow-sm opacity-70"
                        title="CSV export available on Starter"
                      >
                        🔒 CSV
                      </a>
                    )}
                  </div>
                </div>

                {/* Save Feedback Messages */}
                {saveFeedback && (
                  <div className="mt-3 text-xs">
                    {saveFeedback === 'saved' && <p className="text-green-600 font-semibold">✓ Report saved successfully.</p>}
                    {saveFeedback === 'updated' && <p className="text-green-600 font-semibold">✓ Report updated successfully.</p>}
                    {saveFeedback === 'error' && <p className="text-red-500 font-semibold">⚠ Failed to save report.</p>}
                  </div>
                )}
                {dashboardFeedback && (
                  <div className="mt-3 text-xs">
                    {dashboardFeedback === 'pinned' && (
                      <p className="text-green-600 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-800 px-2 py-1.5 rounded flex items-center justify-between">
                        <span>✓ Pinned to dashboard.</span>
                        <Link to="/" className="underline font-bold">View Dashboard →</Link>
                      </p>
                    )}
                    {dashboardFeedback === 'unpinned' && <p className="text-gray-500 dark:text-gray-400">Removed from dashboard.</p>}
                    {dashboardFeedback === 'error' && <p className="text-red-500 font-semibold">⚠ Failed to update dashboard pin.</p>}
                  </div>
                )}
              </div>

              {/* Data Visualization / Sparse results check */}
              {results.length > 0 && results.length < 3 && !isLoading ? (
                <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#2A2E2E] p-6 space-y-4">
                  <h4 className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Sparse Result Overview</h4>
                  <div className="space-y-3.5">
                    {results.map((r, idx) => {
                      const val = getMetricValue(r)
                      const percent = total > 0 ? (val / total) * 100 : 0
                      return (
                        <div key={idx} className="space-y-1 text-xs">
                          <div className="flex justify-between items-center font-medium">
                            <span className="text-gray-800 dark:text-gray-200 truncate inline-flex items-center">
                              <span className="truncate">{r.dim_value || 'Direct / None'}</span>
                              {isDirectLabel(r.dim_value || 'Direct / None') && <DirectInfo />}
                            </span>
                            <span className="font-bold text-gray-900 dark:text-white">{metricFormat(val)}</span>
                          </div>
                          <div className="h-3 bg-gray-100 dark:bg-[#242829] rounded-full overflow-hidden flex">
                            <div className="h-full bg-lime-500 rounded-full" style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-st-gray dark:text-gray-400">Sparse dataset (fewer than 3 rows) loaded as ranked list.</p>
                </div>
              ) : (
                /* Chart visual card */
                (chartType === 'bar' || chartType === 'line' || chartType === 'area' || chartType === 'pie') && (
                  <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#2A2E2E] p-6">
                    {nightlyNotice && results.length === 0 && !isLoading && (
                      <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
                        <span className="text-amber-500 mt-0.5">⏳</span>
                        <p className="text-xs text-amber-800 dark:text-amber-300">{nightlyNotice}</p>
                      </div>
                    )}
                    {isLoading ? (
                      <div className="h-72 flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-st-gray dark:text-gray-400" />
                        <p className="text-xs text-st-gray dark:text-gray-400">Loading report data...</p>
                      </div>
                    ) : results.length === 0 ? (
                      <div className="h-72 flex items-center justify-center text-st-gray dark:text-gray-400 text-sm">
                        {nightlyNotice ? 'No data yet — nightly calculation pending.' : 'No data for this selection. Try a different date range or dimension.'}
                      </div>
                    ) : (
                      <div className="h-72">
                        {chartType === 'bar' && <Bar data={chartData} options={chartOptions} />}
                        {chartType === 'line' && <Line data={chartData} options={chartOptions} />}
                        {chartType === 'area' && <Line data={chartData} options={chartOptions} />}
                        {chartType === 'pie' && <Pie data={chartData} options={chartOptions} />}
                      </div>
                    )}
                  </div>
                )
              )}

              {/* KPI view */}
              {chartType === 'kpi' && (
                <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#2A2E2E] p-6">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-st-gray dark:text-gray-400" />
                      <p className="text-xs text-st-gray dark:text-gray-400">Loading report delta...</p>
                    </div>
                  ) : results.length === 0 ? (
                    <div className="py-12 text-center text-st-gray dark:text-gray-400 text-sm">No KPI data found</div>
                  ) : (() => {
                    const currentVal = getKpiValue(results, metric)
                    const priorRows = priorReportData?.results
                    const priorVal = getKpiValue(priorRows, metric)
                    const delta = formatKpiDelta(currentVal, priorVal)
                    return (
                      <div>
                        <p className="text-sm text-st-gray dark:text-gray-400">{metricLabel}</p>
                        <div className="mt-2 text-4xl font-semibold text-st-black dark:text-white">{formatKpiValue(currentVal, metric)}</div>
                        <div className="mt-3 text-sm">
                          {delta ? (
                            <span className={delta.positive ? 'text-green-600' : 'text-red-600'}>
                              {delta.label}
                            </span>
                          ) : (
                            <span className="text-st-gray dark:text-gray-400">No prior period comparison</span>
                          )}
                          <span className="text-st-gray dark:text-gray-400 ml-2">vs previous period</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Table Data list view */}
              <div className="bg-white dark:bg-[#1A1D1D] rounded-xl shadow-sm border border-gray-200 dark:border-[#2A2E2E] overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-[#2A2E2E] flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Data View</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCompare(c => !c)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                        showCompare
                          ? 'bg-st-black text-white border-st-black dark:bg-lime-500 dark:text-st-black'
                          : 'bg-white dark:bg-[#242829] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-[#2A2E2E] hover:bg-gray-50 dark:hover:bg-[#252929]'
                      }`}
                    >
                      Compare period
                    </button>
                    {!isMultiTouch && (
                      <button
                        onClick={() => setShowExplanation(!showExplanation)}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                          showExplanation
                            ? 'bg-st-black text-white border-st-black dark:bg-lime-500 dark:text-st-black'
                            : 'bg-white dark:bg-[#242829] text-gray-600 dark:text-gray-300 border-gray-200 dark:border-[#2A2E2E] hover:bg-gray-50 dark:hover:bg-[#252929]'
                        }`}
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        {showExplanation ? 'Hide Guide' : 'Attribution Guide'}
                      </button>
                    )}
                  </div>
                </div>

                {isLoading ? (
                  <div className="p-8 text-center space-y-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-st-gray dark:text-gray-400 mx-auto" />
                    <p className="text-xs text-st-gray dark:text-gray-400">Loading data...</p>
                  </div>
                ) : results.length === 0 ? (
                  <div className="p-8 text-center text-sm text-st-gray dark:text-gray-400">No report rows found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-[#2A2E2E] bg-gray-50 dark:bg-[#242829]">
                          <th className="text-left py-2.5 px-4 text-st-gray dark:text-gray-400 font-medium text-xs">
                            {getDimensionLabel(groupBy) || 'Dimension'}
                          </th>
                          {groupBy2 && (
                            <th className="text-left py-2.5 px-4 text-st-gray dark:text-gray-400 font-medium text-xs">
                              {getDimensionLabel(groupBy2) || 'Dimension 2'}
                            </th>
                          )}
                          {selectedMetrics.map(mk => (
                            <th key={mk} className="text-right py-2.5 px-4 text-st-gray dark:text-gray-400 font-medium text-xs">
                              {METRICS.find(m => m.key === mk)?.label || mk}
                            </th>
                          ))}
                          {showCompare && selectedMetrics.map(mk => (
                            <th key={mk + '_chg'} className="text-right py-2.5 px-4 text-st-gray dark:text-gray-400 font-medium text-xs">
                              vs prior
                            </th>
                          ))}
                          {showExplanation && !isMultiTouch && (
                            <th className="text-left py-2.5 px-4 text-st-gray dark:text-gray-400 font-medium text-xs">Attribution logic</th>
                          )}
                        </tr>
                        {/* Summary Row */}
                        <tr className="border-b border-gray-200 dark:border-[#2A2E2E] bg-gray-100/50 dark:bg-[#252929]/50">
                          <td className="py-2.5 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">Summary Total</td>
                          {groupBy2 && <td />}
                          {selectedMetrics.map(mk => {
                            const mDef = METRICS.find(m => m.key === mk)
                            const fmt = mDef?.format || (v => String(v))
                            const totalVal = results.reduce((s, r) => s + (r[mk] ?? 0), 0)
                            return <td key={mk} className="py-2.5 px-4 text-right text-xs font-bold text-st-black dark:text-white">{fmt(totalVal)}</td>
                          })}
                          {showCompare && selectedMetrics.map(mk => {
                            const curTotal = results.reduce((s, r) => s + (r[mk] ?? 0), 0)
                            const priorRows = priorReportData?.results || []
                            const priorTotal = priorRows.reduce((s, r) => s + (r[mk] ?? 0), 0)
                            const delta = priorTotal > 0 ? ((curTotal - priorTotal) / priorTotal) * 100 : null
                            return (
                              <td key={mk + '_chg_sum'} className="py-2.5 px-4 text-right text-xs">
                                {delta !== null
                                  ? <span className={delta >= 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                                      {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                                    </span>
                                  : <span className="text-gray-300 dark:text-gray-600">—</span>
                                }
                              </td>
                            )
                          })}
                          {showExplanation && !isMultiTouch && <td />}
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r, i) => {
                          const priorRows = priorReportData?.results || []
                          const priorRow = priorRows.find(p => p.dim_value === r.dim_value)
                          return (
                            <tr key={i} className="border-b border-gray-50 dark:border-[#2A2E2E] hover:bg-gray-50 dark:hover:bg-[#252929]">
                              <td className="py-2.5 px-4 text-st-black dark:text-gray-200 font-medium">
                                <span className="inline-flex items-center">
                                  {r.dim_value || 'Direct / None'}
                                  {isDirectLabel(r.dim_value || 'Direct / None') && <DirectInfo />}
                                </span>
                              </td>
                              {groupBy2 && <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">{r.dim_value2}</td>}
                              {selectedMetrics.map(mk => {
                                const mDef = METRICS.find(m => m.key === mk)
                                const fmt = mDef?.format || (v => String(v))
                                return <td key={mk} className="py-2.5 px-4 text-right font-semibold text-st-black dark:text-white">{fmt(r[mk] ?? 0)}</td>
                              })}
                              {showCompare && selectedMetrics.map(mk => {
                                const cur = r[mk] ?? 0
                                const prior = priorRow?.[mk] ?? 0
                                const delta = prior > 0 ? ((cur - prior) / prior) * 100 : null
                                return (
                                  <td key={mk + '_chg'} className="py-2.5 px-4 text-right text-xs">
                                    {delta !== null
                                      ? <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${delta >= 0 ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400'}`}>
                                          {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                                        </span>
                                      : <span className="text-gray-300 dark:text-gray-600 text-[10px]">—</span>
                                    }
                                  </td>
                                )
                              })}
                              {showExplanation && !isMultiTouch && (
                                <td className="py-2.5 px-4">
                                  <button
                                    onClick={() => setExplainModalOpen(true)}
                                    className="text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white flex items-center gap-1"
                                  >
                                    <HelpCircle className="w-3 h-3" />
                                    {model === 'first_touch' && 'First visit attribution'}
                                    {model === 'last_touch' && 'Conversion page referrer'}
                                    {model === 'first_touch_non_direct' && 'Earliest campaigns'}
                                    {model === 'last_touch_non_direct' && 'Latest campaigns'}
                                    {model === 'ai_platforms' && 'AI referrer domain'}
                                  </button>
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </div>

      {/* Slide-over Saved Reports Drawer */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsDrawerOpen(false)} />
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white dark:bg-[#1A1D1D] border-l border-gray-200 dark:border-[#2A2E2E] shadow-2xl flex flex-col">
              <div className="px-6 py-5 border-b border-gray-100 dark:border-[#2A2E2E] flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800 dark:text-white">Saved Reports</h3>
                <button onClick={() => setIsDrawerOpen(false)} className="text-gray-400 hover:text-gray-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {reportsLoading ? (
                  <div className="flex items-center justify-center py-8 text-st-gray">
                    <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
                  </div>
                ) : savedReports.length === 0 ? (
                  <div className="text-center py-12 text-sm text-st-gray dark:text-gray-400">
                    No saved reports found. Configure a report on the left and save it above.
                  </div>
                ) : (
                  savedReports.map((r) => {
                    const meta = getSavedReportMeta(r)
                    return (
                      <div key={r.id} className="rounded-xl border border-gray-200 dark:border-[#2A2E2E] p-4 bg-gray-50/50 dark:bg-[#242829]/50 hover:bg-gray-50 dark:hover:bg-[#252929] transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{r.name}</p>
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[10px] text-st-gray dark:text-gray-400">
                              <span className="bg-gray-100 dark:bg-gray-850 px-1.5 py-0.5 rounded">{meta.metricLabel}</span>
                              <span className="bg-gray-100 dark:bg-gray-850 px-1.5 py-0.5 rounded">{meta.groupLabel}</span>
                              <span className="bg-gray-100 dark:bg-gray-850 px-1.5 py-0.5 rounded">{meta.modelLabel}</span>
                              {meta.filterCount > 0 && (
                                <span className="bg-lime-50 text-lime-800 dark:bg-lime-950/20 dark:text-lime-400 px-1.5 py-0.5 rounded font-semibold">
                                  {meta.filterCount} filter{meta.filterCount > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between border-t border-gray-100 dark:border-[#2A2E2E] mt-3 pt-3">
                          {hasFeature(site?.plan, 'dashboard_widgets') ? (
                            <button
                              onClick={() => handleListPinToggle(r)}
                              className={`text-xs flex items-center gap-1 font-semibold transition-colors ${
                                r.show_on_dashboard
                                  ? 'text-lime-600 dark:text-lime-400'
                                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                              }`}
                            >
                              <Bookmark className="w-3.5 h-3.5" style={{ fill: r.show_on_dashboard ? 'currentColor' : 'none' }} />
                              {r.show_on_dashboard ? 'Pinned' : 'Pin'}
                            </button>
                          ) : (
                            <button
                              onClick={() => navigate('/billing')}
                              className="text-xs flex items-center gap-1 font-semibold text-gray-400 opacity-70"
                              title="Pin to dashboard available on Growth"
                            >
                              🔒 Pin
                            </button>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { handleLoad(r); setIsDrawerOpen(false) }}
                              className="px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-[#1A1D1D] hover:bg-gray-100 dark:hover:bg-[#252929] border border-gray-200 dark:border-[#2A2E2E] rounded transition-all font-semibold"
                            >
                              Load
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to delete "${r.name}"?`)) {
                                  handleDelete(r.id)
                                }
                              }}
                              className="px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded transition-all font-semibold"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConversionExplanationModal
        isOpen={explainModalOpen}
        onClose={() => setExplainModalOpen(false)}
        siteKey={site?.site_key}
        model={model}
      />
    </div>
  )
}
