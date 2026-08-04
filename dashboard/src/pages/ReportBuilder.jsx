import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { fetchApi } from '../lib/api'
import { format, subDays, startOfMonth } from 'date-fns'
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
  BarChart3, X, Lock, Settings, Sparkles, AlertTriangle,
  LineChart, AreaChart, PieChart, Hash, Table, CalendarX, UploadCloud
} from 'lucide-react'
import ConversionExplanationModal from '../components/ConversionExplanationModal'
import { describeQueryError } from '../lib/queryError'
import { dimensionGateReason, metricGateReason } from '../lib/reportGating'
import { modelSummary, isMultiTouchModel } from '../lib/attributionModels'
import { hasFeature } from '../lib/planFeatures'
import { useActiveSite } from '../hooks/useActiveSite'
import { DirectInfo, isDirectLabel } from '../components/DirectInfo'
import { SourceIcon, SourceChip } from '../components/SourceIcon'
import SparseReadings from '../components/SparseReadings'
import { densifyDailySeries, honestLineStyle, hasEnoughPointsForChart, readingsCaption, formatShortDay } from '../utils/chartHonesty'

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
  { key: 'ai_platforms',           label: 'AI journey influence' },
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

// The Report Builder's opening view. MUST be a metric the server will actually serve: the previous
// default was 'sessions' ("Unique Visitors"), which is in GATED_METRICS, so every user's first load
// hit a 422 and — after React Query's retry backoff — a "Temporarily unavailable" panel. The same
// component already DISABLES gated metrics in its picker, so the initial state contradicted the UI.
// Derived from metricGateReason (the same gate the picker uses) rather than hardcoded, so the
// default can never silently drift back onto a gated metric if GATED_METRICS changes.
const PREFERRED_DEFAULT_METRICS = ['conversions', 'revenue', 'leads']
export const DEFAULT_METRIC =
  PREFERRED_DEFAULT_METRICS.find((k) => !metricGateReason(k)) ||
  METRICS.map((m) => m.key).find((k) => !metricGateReason(k)) ||
  'conversions'


// `icon` added for the picker row that replaced the dropdown. The key/label pairs are UNCHANGED —
// saved reports store chartType by key, so every existing report keeps rendering as it did.
const CHART_TYPES = [
  { key: 'bar', label: 'Bar', icon: BarChart3 },
  { key: 'line', label: 'Line', icon: LineChart },
  { key: 'area', label: 'Area', icon: AreaChart },
  { key: 'pie', label: 'Pie', icon: PieChart },
  { key: 'kpi', label: 'KPI', icon: Hash },
  { key: 'table', label: 'Table Only', icon: Table }
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
  // Universal
  { id: 'univ_channel_rev', name: 'Channel revenue', desc: 'Revenue grouped by high-level marketing channel', model: 'last_touch', groupBy: 'channel', groupBy2: null, metric: 'revenue', days: 30, chartType: 'bar', granularity: 'day', filters: {}, category: 'Universal', requiredData: 'revenue' },
  { id: 'univ_campaign_rev', name: 'Campaign revenue', desc: 'Revenue performance across campaigns', model: 'last_touch', groupBy: 'campaign', groupBy2: null, metric: 'revenue', days: 90, chartType: 'bar', granularity: 'day', filters: {}, category: 'Universal', requiredData: 'revenue' },
  // REMOVED: univ_visitors (metric 'sessions') + univ_cvr (metric 'conversion_rate'). Both metrics
  // are in GATED_METRICS (gate-constants.js:48, founder decision Option A) — dead on EVERY dim for
  // EVERY site, so both templates were dead-on-click for everyone. They were also not `Locked`:
  // requiredData:'none' means isTemplateGated returned null, so they rendered as working cards and
  // only failed after the click. A locked badge would have been no better — every other lock reason
  // (revenue/cost/gsc/ai) is something the user can fix, and this one is not. Re-add them in the
  // same PR that lands a sessions/conversion_rate backend.

  // SaaS
  { id: 'saas_trials', name: 'Trials by Source', desc: 'Attributed trial signups by traffic source', model: 'last_touch', groupBy: 'source', groupBy2: null, metric: 'conversions', days: 30, chartType: 'bar', granularity: 'day', filters: { conversion_type: 'trial' }, category: 'SaaS', requiredData: 'none' },
  { id: 'saas_demos', name: 'Demo Bookings by Source', desc: 'Demo bookings by traffic source', model: 'last_touch', groupBy: 'source', groupBy2: null, metric: 'conversions', days: 30, chartType: 'bar', granularity: 'day', filters: { conversion_type: 'demo' }, category: 'SaaS', requiredData: 'none' },
  { id: 'saas_signups', name: 'Signup Landing Pages', desc: 'Landing pages where signup conversions occur', model: 'first_touch', groupBy: 'landing_page', groupBy2: null, metric: 'conversions', days: 30, chartType: 'bar', granularity: 'day', filters: { conversion_type: 'signup' }, category: 'SaaS', requiredData: 'none' },

  // Ecommerce
  { id: 'ecom_orders', name: 'Orders by Source', desc: 'Attributed purchase orders by source (Manual webhook)', model: 'last_touch', groupBy: 'source', groupBy2: null, metric: 'conversions', days: 30, chartType: 'bar', granularity: 'day', filters: { conversion_type: 'purchase' }, category: 'Ecommerce', requiredData: 'none', shopifyBadge: true },
  { id: 'ecom_revenue', name: 'Revenue by Source', desc: 'Attributed revenue by traffic source', model: 'last_touch', groupBy: 'source', groupBy2: null, metric: 'revenue', days: 30, chartType: 'bar', granularity: 'day', filters: {}, category: 'Ecommerce', requiredData: 'revenue' },
  { id: 'ecom_aov', name: 'AOV by Campaign', desc: 'Average Order Value by campaign (Manual webhook)', model: 'last_touch', groupBy: 'campaign', groupBy2: null, metric: 'avg_conversion_value', days: 30, chartType: 'bar', granularity: 'day', filters: {}, category: 'Ecommerce', requiredData: 'revenue', shopifyBadge: true },
  { id: 'ecom_shopify', name: 'Shopify Webhook Orders', desc: 'Attributed orders tracked via manual Shopify webhook (Manual webhook)', model: 'last_touch', groupBy: 'source', groupBy2: null, metric: 'conversions', days: 30, chartType: 'bar', granularity: 'day', filters: { conversion_type: 'shopify_order' }, category: 'Ecommerce', requiredData: 'none', shopifyBadge: true },

  // Lead Gen / Agency
  { id: 'lead_leads', name: 'Leads by Source', desc: 'Attributed new leads by traffic source', model: 'last_touch', groupBy: 'source', groupBy2: null, metric: 'leads', days: 30, chartType: 'bar', granularity: 'day', filters: {}, category: 'Lead Gen / Agency', requiredData: 'none' },
  { id: 'lead_forms', name: 'Form Conversions by Landing Page', desc: 'Conversions driven by landing pages', model: 'first_touch', groupBy: 'landing_page', groupBy2: null, metric: 'conversions', days: 30, chartType: 'bar', granularity: 'day', filters: { conversion_type: 'form' }, category: 'Lead Gen / Agency', requiredData: 'none' },

  // SEO / GSC
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
  if (filters.channel) params.set('filter_channel', filters.channel)
  if (filters.source) params.set('filter_source', filters.source)
  if (filters.medium) params.set('filter_medium', filters.medium)
  if (filters.campaign) params.set('filter_campaign', filters.campaign)
  if (filters.conversion_type) params.set('filter_conversion_type', filters.conversion_type)
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
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border-strong rounded-lg shadow-sm focus:outline-none text-gray-700 dark:text-gray-200 text-left disabled:opacity-50"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="w-4 h-4 ml-2 text-gray-400 flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {options.map((opt) => {
            const isSelected = opt.value === value
            const isDisabled = opt.disabled
            return (
              <button
                key={opt.value}
                type="button"
                disabled={isDisabled}
                // `title` carries the reason a disabled option is greyed (the gate's copy).
                // Native tooltip: no popover dep, and it still reaches keyboard/AT users.
                title={opt.title || undefined}
                onClick={() => {
                  onChange(opt.value)
                  setIsOpen(false)
                }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${
                  isSelected
                    ? 'bg-lime-50 text-lime-800 dark:bg-lime-950/20 dark:text-lime-400 font-medium'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'
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
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border-strong rounded-lg shadow-sm focus:outline-none text-gray-700 dark:text-gray-200 text-left"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="w-4 h-4 ml-2 text-gray-400 flex-shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute z-50 left-0 w-80 mt-1 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl shadow-xl p-4 text-xs">
          <div className="flex gap-2 mb-3 border-b border-gray-100 dark:border-dark-border pb-2">
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
              <div className="pt-2 border-t border-gray-100 dark:border-dark-border flex items-center gap-2">
                <span className="text-gray-500">Last</span>
                <input
                  type="number"
                  min="1"
                  max="730"
                  value={customDaysVal}
                  onChange={(e) => setCustomDaysVal(e.target.value)}
                  className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-center text-st-black dark:text-dark-primary"
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
              <div className="pt-2 border-t border-gray-100 dark:border-dark-border">
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
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-center text-st-black dark:text-dark-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">To</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded text-center text-st-black dark:text-dark-primary"
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
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { site, activeSite } = useActiveSite('custom_url_params')
  const isPreview = activeSite?.support_preview || false

  // Report state
  const [uiMode, setUiMode] = useState('builder') // 'hub' or 'builder'
  const [activeTemplateId, setActiveTemplateId] = useState(null)
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [reportName, setReportName] = useState('')
  const [model, setModel] = useState('first_touch')
  const [groupBy, setGroupBy] = useState('channel')
  const [metric, setMetric] = useState(DEFAULT_METRIC)
  const [selectedMetrics, setSelectedMetrics] = useState([DEFAULT_METRIC])

  const toggleMetric = (key) => {
    setSelectedMetrics(prev =>
      prev.includes(key)
        ? prev.length > 1 ? prev.filter(k => k !== key) : prev
        : [...prev, key]
    )
    setMetric(key)
  }
  const [chartType, setChartType] = useState('bar')
  // OFF by default — see the chartRows comment: an empty date is data, so hiding it is opt-in.
  const [hideEmptyDates, setHideEmptyDates] = useState(false)
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
  const [isAttributionOpen, setIsAttributionOpen] = useState(false)
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)
  const isMultiTouch = ['linear', 'time_decay', 'u_shaped', 'w_shaped'].includes(model)

  // UI state
  const [editingId, setEditingId] = useState(null)
  const [metricSearch, setMetricSearch] = useState('')
  const [showMetricDropdown, setShowMetricDropdown] = useState(false)

  // Personalization other categories disclosure state
  const [showOtherCategories, setShowOtherCategories] = useState(false)

  // Gating status hooks
  const { data: stripeStatus } = useQuery({
    queryKey: ['stripe-status', site?.site_key],
    queryFn: () => fetchApi(`/integrations/stripe?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const { data: shopifyStatus } = useQuery({
    queryKey: ['shopify-status', site?.site_key],
    queryFn: () => fetchApi(`/integrations/shopify?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const { data: adPlatStatus } = useQuery({
    queryKey: ['ad-platforms-status', site?.site_key],
    queryFn: () => fetchApi(`/integrations/ad-platforms/status?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const { data: gscStatus } = useQuery({
    queryKey: ['gsc-status', site?.site_key],
    queryFn: () => fetchApi(`/integrations/google-search-console/status?site_key=${site.site_key}`),
    enabled: !!site?.site_key
  })

  const { data: dashboardOverview } = useQuery({
    queryKey: ['dashboard-overview', site?.site_key],
    queryFn: () => fetchApi(`/dashboard/overview?site_key=${site.site_key}&days=30`),
    enabled: !!site?.site_key
  })

  const { data: campaignsOverview } = useQuery({
    queryKey: ['campaigns-overview', site?.site_key],
    queryFn: () => fetchApi(`/campaigns/overview?site_key=${site.site_key}&days=30`),
    enabled: !!site?.site_key
  })

  // Derived gates
  const totalRevenue = dashboardOverview?.kpis?.revenue || 0
  const hasRevenueData = totalRevenue > 0
  const stripeConnected = stripeStatus?.configured === true
  const shopifyConnected = shopifyStatus?.configured === true
  const isRevenueConfigured = stripeConnected || shopifyConnected || hasRevenueData

  const googleConnected = adPlatStatus?.google_ads?.connected === true || adPlatStatus?.google_ads?.status === 'connected'
  const metaConnected = adPlatStatus?.meta_ads?.connected === true || adPlatStatus?.meta_ads?.status === 'connected'
  const totalSpend = campaignsOverview?.kpis?.total_spend || 0
  const hasCostData = totalSpend > 0
  const isCostConfigured = googleConnected || metaConnected || hasCostData

  const gates = {
    hasRevenueData,
    isRevenueConfigured,
    hasCostData,
    isCostConfigured,
    isGscConnected: gscStatus?.connected === true,
    isGscPropertySelected: !!gscStatus?.property_url,
    hasAiSources: (dashboardOverview?.ai_sources || []).length > 0
  }

  const isTemplateGated = (template, gates) => {
    if (template.requiredData === 'revenue') {
      return !gates.isRevenueConfigured ? 'revenue_unconfigured' : (!gates.hasRevenueData ? 'revenue_no_data' : null)
    }
    if (template.requiredData === 'cost') {
      return !gates.isCostConfigured ? 'cost_unconfigured' : (!gates.hasCostData ? 'cost_no_data' : null)
    }
    if (template.requiredData === 'gsc') {
      return !gates.isGscConnected ? 'gsc_unconfigured' : (!gates.isGscPropertySelected ? 'gsc_no_property' : null)
    }
    if (template.requiredData === 'ai') {
      return !gates.hasAiSources ? 'ai_no_data' : null
    }
    if (template.requiredData === 'lead_gen') {
      return 'lead_gen'
    }
    return null
  }

  const isMetricGated = (metricKey) => {
    if (['revenue', 'avg_conversion_value', 'ai_revenue', 'ai_revenue_share', 'ltv_revenue'].includes(metricKey)) {
      return !gates.isRevenueConfigured ? 'revenue_unconfigured' : (!gates.hasRevenueData ? 'revenue_no_data' : null)
    }
    if (['ai_conversions', 'ai_conversion_share'].includes(metricKey)) {
      return !gates.hasAiSources ? 'ai_no_data' : null
    }
    return null
  }

  const selectedTemplate = PRESET_TEMPLATES.find(p => p.id === activeTemplateId)
  const templateGateError = selectedTemplate ? isTemplateGated(selectedTemplate, gates) : null
  const metricGateError = isMetricGated(metric)
  const activeGateError = templateGateError || metricGateError

  const getNormalizedBusinessType = (type) => {
    if (!type) return 'unknown'
    const t = type.toLowerCase()
    if (t === 'saas') return 'SaaS'
    if (t === 'ecommerce' || t === 'e-commerce') return 'Ecommerce'
    if (t === 'lead_gen' || t === 'lead generation' || t === 'agency') return 'Lead Gen / Agency'
    return 'unknown'
  }

  const normalizedType = getNormalizedBusinessType(site?.business_type)

  const recommendedTemplates = []
  if (normalizedType !== 'unknown') {
    recommendedTemplates.push(...PRESET_TEMPLATES.filter(p => p.category === normalizedType))
    recommendedTemplates.push(...PRESET_TEMPLATES.filter(p => p.category === 'Universal'))
  } else {
    recommendedTemplates.push(...PRESET_TEMPLATES.filter(p => p.category === 'Universal'))
  }

  const allCategories = ['SaaS', 'Ecommerce', 'Lead Gen / Agency']
  const otherCategories = allCategories.filter(cat => cat !== normalizedType)

  useEffect(() => {
    const editParam = searchParams.get('edit')
    if (!editParam) return
    const stored = sessionStorage.getItem('sourcetrack_edit_widget')
    if (!stored) return
    let widget
    try { widget = JSON.parse(stored) } catch { return }
    if (!widget) return
    sessionStorage.removeItem('sourcetrack_edit_widget')
    setActiveTemplateId(widget.templateId || null)
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
    setUiMode('builder')
  }, [searchParams])

  const effectiveDateRange = isRolling ? getRollingDateRange(rollingDays) : { from: dateFrom, to: dateTo }
  const effectiveDateFrom = effectiveDateRange.from
  const effectiveDateTo = effectiveDateRange.to

  const filterKey = JSON.stringify(filters)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['report', site?.site_key, model, groupBy, metric, effectiveDateFrom, effectiveDateTo, filterKey, groupBy2, granularity, attributionWindow, attributeBy],
    queryFn: () => getFlexibleReport(site?.site_key, model, effectiveDateFrom, effectiveDateTo, groupBy, metric, filters, groupBy2, granularity, attributionWindow, attributeBy),
    enabled: !!site && !activeGateError
  })
  // A failed query must NEVER render as an empty "no data" state — that is a silent lie about the
  // customer's business. Descriptors come from describeQueryError (the SINGLE source of truth this
  // file previously duplicated inline, so a new branch had to be written twice to hold everywhere):
  //   timeout -> narrow-the-range guidance
  //   GATED   -> a calm "temporarily unavailable" state, NO retry (the server denied this shape
  //              because it has no live backend; retrying cannot help)
  //   other   -> generic fetch-error copy
  const { title: reportErrorTitle, message: reportErrorMessage, isTimeout: isTimeoutError, isGated: isGatedError } =
    isError ? describeQueryError(error) : { title: null, message: null, isTimeout: false, isGated: false }

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
    enabled: !!site && !!priorPeriod && showCompare && !activeGateError
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
    setActiveTemplateId(preset.id)
    setReportName(preset.name)
    setModel(preset.model || 'last_touch')
    setGroupBy(preset.groupBy)
    setGroupBy2(preset.groupBy2 || null)
    setShowGroupBy2(!!preset.groupBy2)
    setMetric(preset.metric)
    setSelectedMetrics([preset.metric])
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
    setUiMode('builder')
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
    const matchingTemplate = PRESET_TEMPLATES.find(p => p.metric === (cfg.metric || 'revenue') && p.groupBy === (cfg.groupBy || 'source'))
    setActiveTemplateId(cfg.templateId || matchingTemplate?.id || null)
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
    setUiMode('builder')
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
    setUiMode('builder')
  }

  const resetReport = () => {
    setActiveTemplateId(null)
    setUiMode('builder')
    setIsCustomMode(false)
    setEditingId(null)
    setReportName('')
    setModel('first_touch')
    setGroupBy('channel')
    setMetric('sessions')
    setSelectedMetrics(['sessions'])
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
      filterCount: Object.keys(cfg.filters || {}).length,
      // A saved config can predate the gate. Derived from the same source the pickers use, so
      // the drawer says "unavailable" up front instead of on Load. Won't flag the window-gated
      // edge (that gate is dim-aware, runtime-only) — the locked state still catches it.
      gateReason: metricGateReason(cfg.metric) || dimensionGateReason(cfg.groupBy, cfg.metric)
    }
  }

  const handleExportCSV = () => {
    if (!site) return
    const params = new URLSearchParams({ site_key: site.site_key, model, date_from: effectiveDateFrom, date_to: effectiveDateTo, group_by: groupBy, metric })
    if (filters.channel) params.set('filter_channel', filters.channel)
    if (filters.source) params.set('filter_source', filters.source)
    if (filters.medium) params.set('filter_medium', filters.medium)
    if (filters.campaign) params.set('filter_campaign', filters.campaign)
    if (filters.conversion_type) params.set('filter_conversion_type', filters.conversion_type)
    window.open(`/api/export/report?${params}`, '_blank')
  }

  const getMetricValue = (row, metricKey = metric) => {
    if (!row) return 0
    const v = row[metricKey]
    if (v === undefined) {
      if (import.meta.env.DEV) {
        console.warn(`metric key missing: ${metricKey}`, row)
      }
      return 0
    }
    return Number(v) || 0
  }

  const MULTI_COLORS = [
    'rgba(17, 24, 39, 0.85)',
    'rgba(132, 204, 22, 0.85)',
    'rgba(59, 130, 246, 0.85)',
    'rgba(249, 115, 22, 0.85)',
  ]
  const isMultiMetric = selectedMetrics.length > 1

  // "Display only dates with data" (item 10). A sparse range renders a run of flat-zero days that
  // squeezes the real points into a corner. This drops the all-zero rows FROM THE CHART ONLY.
  //
  // Three deliberate limits, because dropping rows is a truth-sensitive act (§6):
  //   - It is OFF by default, so the default chart still shows every date in the range. A zero day
  //     IS data ("nothing converted on the 4th"), and hiding it must be the reader's choice.
  //   - It only applies on a TIME-SERIES (groupBy/groupBy2 === 'date'). On a categorical dim a
  //     zero row is a named bucket, not a gap, and hiding it would silently shorten the answer.
  //   - The Data View table below is NOT filtered — it stays the complete result set, so the
  //     numbers behind the chart are always fully inspectable.
  // Filtering runs BEFORE the 15-row cap, so hiding empty days surfaces MORE real days, not fewer.
  const isTimeSeries = groupBy === 'date' || groupBy2 === 'date'
  const canHideEmptyDates = isTimeSeries && chartType !== 'table' && chartType !== 'kpi'
  const rowHasValue = (r) => (isMultiMetric ? selectedMetrics : [metric]).some(mk => getMetricValue(r, mk) !== 0)
  const chartRows = (canHideEmptyDates && hideEmptyDates ? results.filter(rowHasValue) : results).slice(0, 15)
  const hiddenDateCount = canHideEmptyDates ? results.length - results.filter(rowHasValue).length : 0

  const chartLabels = chartRows.map(r => groupBy2 ? `${r.dim_value} / ${r.dim_value2}` : r.dim_value)

  // ─── design.md §9.2 chart honesty ──────────────────────────────────────────
  // Only line/area draw a shape between points; bar and pie are unaffected and keep
  // their existing config byte-for-byte.
  const isLineLike = chartType === 'line' || chartType === 'area'
  const chartMetricKeys = isMultiMetric ? selectedMetrics : [metric]
  const rawSeries = chartMetricKeys.map(mk => chartRows.map(r => getMetricValue(r, mk)))

  // Give every calendar day its own slot on a date series, so the x-axis measures elapsed
  // time instead of row position. Skipped in three cases, each for a reason:
  //   - not line/area — a bar/pie slot is a bucket, not a moment;
  //   - groupBy2 — labels are composite ("2026-07-02 / google"), not dates;
  //   - hideEmptyDates ON — the reader explicitly asked for only the dates with data, and
  //     that toggle already states how many it removed. Re-adding them would override an
  //     express choice.
  // densifyDailySeries itself no-ops on labels that aren't all YYYY-MM-DD, so a categorical
  // dimension passes through untouched even if it reaches here.
  const canDensify = isLineLike && !groupBy2 && !(canHideEmptyDates && hideEmptyDates)
  const dense = canDensify
    ? densifyDailySeries(chartLabels, rawSeries)
    : { labels: chartLabels, series: rawSeries, densified: false }

  // Tier on the number of RESULT ROWS, not dense.labels.length — densifying adds slots,
  // never readings, and tiering off the axis would hand smoothing to a 2-row report.
  const chartReadings = chartRows.length
  const chartPlottable = !isLineLike || hasEnoughPointsForChart(chartReadings)
  // Caption only where it would be true: it talks about days, so it is limited to a series
  // that actually is one.
  const chartCaption = dense.densified ? readingsCaption(dense.labels, dense.series[0] || []) : null

  const chartData = {
    labels: dense.labels,
    datasets: isMultiMetric
      ? selectedMetrics.map((mk, mi) => {
          const mDef = METRICS.find(x => x.key === mk)
          return {
            label: mDef?.label || mk,
            data: dense.series[mi] || [],
            backgroundColor: chartType === 'area' ? MULTI_COLORS[mi % MULTI_COLORS.length].replace('0.85)', '0.15)') : MULTI_COLORS[mi % MULTI_COLORS.length],
            borderColor: chartType === 'line' || chartType === 'area' ? MULTI_COLORS[mi % MULTI_COLORS.length] : undefined,
            borderRadius: chartType === 'bar' ? 4 : 0,
            stack: chartType === 'bar' ? 'stack0' : undefined,
            ...(isLineLike
              ? honestLineStyle(chartReadings, { tension: 0.3, fill: chartType === 'area' })
              : { tension: 0.3, fill: chartType === 'area' })
          }
        })
      : [{
          label: metricLabel,
          data: dense.series[0] || [],
          // Mapped over the rendered slots rather than chartRows so the per-point color array
          // still lines up after densifying. Identical output when nothing was densified.
          backgroundColor: dense.labels.map((_, i) => COLORS[i % COLORS.length]),
          borderColor: chartType === 'line' || chartType === 'area' ? 'rgba(17, 24, 39, 1)' : undefined,
          borderRadius: chartType === 'bar' ? 4 : 0,
          ...(isLineLike
            ? honestLineStyle(chartReadings, { tension: 0.3, fill: chartType === 'area' })
            : { tension: 0.3, fill: chartType === 'area' })
        }]
  }

  // §9.2 under-3 fallback rows for a line/area report.
  const chartReadingRows = chartRows.map((r) => ({
    label: dense.densified ? formatShortDay(r.dim_value) : String(r.dim_value ?? ''),
    value: (METRICS.find(m => m.key === metric)?.format || String)(getMetricValue(r))
  }))

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: chartType === 'pie', position: 'right' },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const datasetKey = isMultiMetric ? selectedMetrics[ctx.datasetIndex] : metric
            const mDef = METRICS.find(m => m.key === datasetKey)
            const fmt = mDef?.format || ((v) => String(v))
            return `${ctx.dataset.label || metricLabel}: ${fmt(ctx.raw)}`
          }
        }
      }
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

  // Group By Options mapping.
  // Gated dims are DISABLED, not hidden: they come back when their pipe lands, and hiding
  // them would make the product look thinner than it is and conceal that they're returning.
  // The gated set is DERIVED from the server's gate (lib/reportGating -> the same
  // report-config-validation module the API denies with) — never re-typed here, so the picker
  // cannot drift from what the gate actually allows.
  const dimOption = (value, label) => {
    const reason = dimensionGateReason(value, metric)
    return { value, label: reason ? `${label} · Unavailable` : label, disabled: !!reason, title: reason || undefined }
  }

  const groupByOptions = [
    ...DIMENSIONS.map(d => dimOption(d.key, d.label)),
    ...(site?.custom_url_params || []).map(p => dimOption(`custom_param:${p}`, `Custom: ${p}`))
  ]

  const groupBy2Options = [
    { value: '', label: 'None' },
    ...DIMENSIONS.filter(d => d.key !== groupBy || d.key === 'date').map(d => dimOption(d.key, d.label)),
    ...(site?.custom_url_params || []).filter(p => `custom_param:${p}` !== groupBy).map(p => dimOption(`custom_param:${p}`, `Custom: ${p}`))
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

  const getLockedEmptyState = (gateError, templateName) => {
    const iconClass = "w-8 h-8 text-lime-600 dark:text-lime-400"
    const containerClass = "bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center max-w-2xl mx-auto my-8 shadow-sm flex flex-col items-center justify-center animate-fade-in"

    if (gateError === 'revenue_unconfigured') {
      return (
        <div className={containerClass}>
          <div className="w-16 h-16 bg-lime-500/10 border border-lime-500/20 text-lime-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className={iconClass} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-dark-primary mb-2">Revenue Tracking Required</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            This report requires revenue integration. Connect Stripe, Shopify manual webhook, or send Conversion API revenue events to start tracking sales.
          </p>
          <Link
            to="/app/integrations"
            className="inline-flex items-center gap-2 px-4 py-2 bg-lime-500 text-st-black hover:bg-lime-400 rounded-lg text-sm font-bold transition-all shadow-sm"
          >
            <Settings className="w-4 h-4" />
            Connect Revenue Sources
          </Link>
        </div>
      )
    }

    if (gateError === 'revenue_no_data') {
      return (
        <div className={containerClass}>
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-dark-primary mb-2">Waiting for Revenue Data</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Stripe/Shopify status is configured, but no revenue data has been recorded for this site yet.
            Once a purchase or payment event occurs, revenue reports will populate automatically.
          </p>
          <Link
            to="/app/integrations"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 rounded-lg text-sm font-semibold transition-all"
          >
            <Settings className="w-4 h-4" />
            Manage Integrations
          </Link>
        </div>
      )
    }

    if (gateError === 'cost_unconfigured') {
      return (
        <div className={containerClass}>
          <div className="w-16 h-16 bg-lime-500/10 border border-lime-500/20 text-lime-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className={iconClass} />
          </div>
          {/* #624 — this used to read "Connect Google Ads or Meta Ads in Integrations" with a
              "Connect Ad Accounts" button pointing at /app/integrations. No such flow exists
              there: POST /google/save-account and POST /meta/connect have zero dashboard
              callers, and the Integrations page's own copy says "SourceTrack does not
              auto-sync from ad networks here." The CTA outlived the surface it pointed at
              (PR #23 removed the UI; the endpoints and this link survived).

              Now points at the path that actually works today — CSV import — reusing the
              existing ?import=true deep link that Integrations.jsx:1425 already uses. Wording
              follows design.md §19.5/§22's canonical line ("Connect ad cost data to unlock
              ROAS, CPL, and CAC") rather than inventing a third phrasing. */}
          <h3 className="text-lg font-bold text-gray-900 dark:text-dark-primary mb-2">Ad Cost Data Required</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Connect ad cost data to unlock ROAS, CPL, and CAC. Import your ad spend as a CSV —
            SourceTrack does not sync from ad networks automatically.
          </p>
          <Link
            to="/campaigns?import=true"
            className="inline-flex items-center gap-2 px-4 py-2 bg-lime-500 text-st-black hover:bg-lime-400 rounded-lg text-sm font-bold transition-all shadow-sm"
          >
            <UploadCloud className="w-4 h-4" />
            Import Ad Spend
          </Link>
        </div>
      )
    }

    if (gateError === 'cost_no_data') {
      return (
        <div className={containerClass}>
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          {/* #624, adjacent branch of the same gate. This said "Cost data typically updates
              every few hours" — a cadence that does not exist. There is no scheduled ad-cost
              sync: no job in api/jobs/, and none is even possible through these routes, since
              every sync endpoint sits behind requireUserAuth (ad-platforms.js:143) and a cron
              cannot authenticate as a user. Syncing is manual, via Campaigns → "Sync connected
              accounts". Promising an automatic refresh made an empty state look like a wait
              rather than a required action. */}
          <h3 className="text-lg font-bold text-gray-900 dark:text-dark-primary mb-2">No Cost Data Yet</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            An ad account is connected, but no spend has been imported for this range. Cost
            syncing is manual — run a sync, or import your ad spend as a CSV.
          </p>
          <Link
            to="/campaigns"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 rounded-lg text-sm font-semibold transition-all"
          >
            <Settings className="w-4 h-4" />
            Go to Campaigns
          </Link>
        </div>
      )
    }

    if (gateError === 'gsc_unconfigured') {
      return (
        <div className={containerClass}>
          <div className="w-16 h-16 bg-lime-500/10 border border-lime-500/20 text-lime-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className={iconClass} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-dark-primary mb-2">Google Search Console Required</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Connect your Google Search Console account in Integrations to sync organic search queries.
          </p>
          <Link
            to="/app/integrations"
            className="inline-flex items-center gap-2 px-4 py-2 bg-lime-500 text-st-black hover:bg-lime-400 rounded-lg text-sm font-bold transition-all shadow-sm"
          >
            <Settings className="w-4 h-4" />
            Connect Search Console
          </Link>
        </div>
      )
    }

    if (gateError === 'gsc_no_property') {
      return (
        <div className={containerClass}>
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-dark-primary mb-2">Select Search Console Property</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Google Search Console is connected, but no property is selected yet. Go to Integrations to select a property.
          </p>
          <Link
            to="/app/integrations"
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 rounded-lg text-sm font-semibold transition-all"
          >
            <Settings className="w-4 h-4" />
            Select Property
          </Link>
        </div>
      )
    }

    if (gateError === 'ai_no_data') {
      return (
        <div className={containerClass}>
          <div className="w-16 h-16 bg-lime-500/10 border border-lime-500/20 text-lime-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-lime-600 dark:text-lime-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-dark-primary mb-2">No AI Referral Traffic Detected</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            AI journey and trials templates populate automatically once visitors refer from platforms like ChatGPT, Claude, Gemini, or Perplexity.
          </p>
        </div>
      )
    }

    return null
  }

  const renderTemplateHub = () => {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 space-y-6 animate-fade-in">
        <div className="border-b border-gray-100 dark:border-dark-border pb-4">
          <h3 className="text-lg font-bold text-gray-800 dark:text-dark-primary">
            {normalizedType !== 'unknown'
              ? `Recommended templates for ${normalizedType === 'Lead Gen / Agency' ? 'Lead Gen & Agency' : normalizedType}`
              : 'Recommended templates'}
          </h3>
          {normalizedType === 'unknown' ? (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 font-medium bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1 rounded inline-block">
              Choose a business type in Settings to personalize templates.
            </p>
          ) : (
            <p className="text-sm text-st-gray dark:text-gray-400 mt-1">
              Preset templates tailored to your {normalizedType === 'Lead Gen / Agency' ? 'lead generation or agency' : normalizedType.toLowerCase()} business model and data availability.
            </p>
          )}
        </div>

        {/* Template Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recommendedTemplates.map((p) => {
            const isGated = isTemplateGated(p, gates)
            const showLock = Boolean(isGated)
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className="group relative flex flex-col text-left p-5 bg-gray-50 dark:bg-dark-card/50 border border-gray-200 dark:border-dark-border hover:border-lime-500 rounded-xl transition-all shadow-sm"
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <span className="font-bold text-sm text-gray-900 dark:text-dark-primary group-hover:text-lime-600 dark:group-hover:text-lime-400">
                    {p.name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {p.category && p.category !== 'Universal' && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-lime-50 dark:bg-lime-950/10 text-[9px] font-semibold text-lime-700 dark:text-lime-400 border border-lime-200 dark:border-lime-900">
                        {p.category}
                      </span>
                    )}
                    {showLock && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-800 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                        <Lock className="w-2.5 h-2.5" />
                        Locked
                      </span>
                    )}
                    {p.shopifyBadge && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/20 text-[10px] font-semibold text-blue-800 dark:text-blue-400">
                        Manual webhook
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-st-gray dark:text-gray-400 mt-2 flex-grow">{p.desc}</p>
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-[10px] text-st-gray dark:text-gray-400 flex justify-between items-center w-full">
                  <span>Metric: <strong className="text-gray-700 dark:text-gray-300">{METRICS.find(m => m.key === p.metric)?.label || p.metric}</strong></span>
                  <span>Dimension: <strong className="text-gray-700 dark:text-gray-300">{getDimensionLabel(p.groupBy)}</strong></span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Collapsible section for other business types */}
        {otherCategories.length > 0 && (
          <div className="pt-4 border-t border-gray-100 dark:border-dark-border">
            <button
              type="button"
              onClick={() => setShowOtherCategories(!showOtherCategories)}
              className="text-xs font-semibold text-lime-600 hover:text-lime-500 dark:text-lime-400 dark:hover:text-lime-300 flex items-center gap-1 transition-all"
            >
              {showOtherCategories ? 'Hide other template types' : 'Show other template types'}
            </button>
            {showOtherCategories && (
              <div className="mt-4 space-y-6 animate-fade-in p-5 bg-gray-50/50 dark:bg-dark-card/20 rounded-xl border border-gray-200 dark:border-dark-border">
                <p className="text-xs text-st-gray dark:text-gray-400 font-medium">Templates from other business models (may not align with your current site setup):</p>
                <div className="space-y-6">
                  {otherCategories.map(cat => {
                    const catTemplates = PRESET_TEMPLATES.filter(p => p.category === cat)
                    if (catTemplates.length === 0) return null
                    return (
                      <div key={cat} className="space-y-2.5">
                        <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider">{cat}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {catTemplates.map(p => {
                            const isGated = isTemplateGated(p, gates)
                            const showLock = Boolean(isGated)
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => applyPreset(p)}
                                className="group relative flex flex-col text-left p-4 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border hover:border-lime-500 rounded-xl transition-all shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-2 w-full">
                                  <span className="font-bold text-xs text-gray-800 dark:text-dark-primary group-hover:text-lime-600 dark:group-hover:text-lime-400">
                                    {p.name}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {showLock && (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[9px] font-semibold text-gray-500 dark:text-gray-400">
                                        <Lock className="w-2.5 h-2.5" />
                                        Locked
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <p className="text-[11px] text-st-gray dark:text-gray-400 mt-1.5 flex-grow">{p.desc}</p>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Start from Blank Footer */}
        <div className="pt-6 border-t border-gray-100 dark:border-dark-border flex justify-center">
          <button
            type="button"
            onClick={() => {
              setIsCustomMode(true)
              setActiveTemplateId(null)
              setReportName('')
              setModel('first_touch')
              setGroupBy('channel')
              setGroupBy2(null)
              setShowGroupBy2(false)
              setMetric('sessions')
              setSelectedMetrics(['sessions'])
              setChartType('bar')
              setFilters({})
              setFilterCount(0)
              setDatePreset(30)
              const range = getDefaultDateRange(30)
              setDateFrom(range.from)
              setDateTo(range.to)
              setIsRolling(false)
              setRollingDays(30)
              setEditingId(null)
              setUiMode('builder')
            }}
            className="px-5 py-2.5 bg-st-black text-white hover:bg-gray-800 dark:bg-lime-500 dark:text-st-black dark:hover:bg-lime-400 rounded-lg flex items-center gap-1.5 font-bold transition-all shadow-sm text-sm"
          >
            <Plus className="w-4 h-4" />
            Start from Blank (Advanced)
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pt-1.5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-dark-primary">Report Builder</h2>
          <p className="text-sm text-st-gray dark:text-gray-400 mt-1">Configure your lightweight report and preview live results</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border-strong rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover flex items-center gap-1.5 transition-all font-semibold shadow-sm"
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
      </div>

      {/* Active preset helper description */}
      {(() => {
        const activePreset = PRESET_TEMPLATES.find(p => reportName === p.name)
        if (activePreset && activePreset.desc) {
          return (
            <div className="text-xs text-st-gray dark:text-gray-400 bg-lime-500/10 border border-lime-500/20 rounded-lg px-3 py-2 max-w-max">
              💡 <span className="font-semibold text-gray-900 dark:text-dark-primary">{activePreset.name}:</span> {activePreset.desc}
            </div>
          )
        }
        return null
      })()}

      {/* Two-Panel Layout */}
      <div className="flex flex-col xl:flex-row gap-6">

        {/* Left Column: Configure Card */}
        <div className="w-full xl:w-[360px] flex-shrink-0 space-y-4">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-dark-primary pb-2 border-b border-gray-100 dark:border-dark-border">Configure Report</h3>

            {/* A. Recommended Templates Section */}
            <div className="space-y-2 border-b border-gray-100 dark:border-dark-border pb-3">
              <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Recommended Templates</label>
              {normalizedType === 'unknown' && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium bg-amber-50 dark:bg-amber-950/20 px-2 py-1 rounded">
                  Choose business type in Settings to personalize templates.
                </p>
              )}
              <div className="space-y-1 max-h-[160px] overflow-y-auto pr-1">
                {recommendedTemplates.map((p) => {
                  const isGated = isTemplateGated(p, gates)
                  const showLock = Boolean(isGated)
                  const isActive = activeTemplateId === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => applyPreset(p)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs transition-all flex flex-col gap-0.5 ${
                        isActive
                          ? 'bg-lime-50 dark:bg-lime-950/20 border-lime-500 text-lime-800 dark:text-lime-400 font-semibold'
                          : 'bg-white dark:bg-dark-card border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full gap-1">
                        <span className="font-bold truncate">{p.name}</span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {showLock && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-gray-100 dark:bg-gray-800 text-[9px] rounded text-gray-500 dark:text-gray-400 font-medium">
                              <Lock className="w-2.5 h-2.5" />
                              Locked
                            </span>
                          )}
                          {p.shopifyBadge && (
                            <span className="px-1 py-0.5 bg-blue-50 dark:bg-blue-950/20 text-[9px] text-blue-800 dark:text-blue-400 rounded font-medium">
                              Webhook
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] text-st-gray dark:text-gray-400 truncate">{p.desc}</span>
                    </button>
                  )
                })}
              </div>

              {/* Disclosure for other categories */}
              {otherCategories.length > 0 && (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowOtherCategories(!showOtherCategories)}
                    className="text-[10px] font-semibold text-lime-600 hover:text-lime-500 dark:text-lime-400 flex items-center gap-1 transition-all"
                  >
                    {showOtherCategories ? 'Hide other template types' : 'Show other template types'}
                  </button>
                  {showOtherCategories && (
                    <div className="mt-2 space-y-2 max-h-[160px] overflow-y-auto pr-1">
                      {otherCategories.map(cat => {
                        const catTemplates = PRESET_TEMPLATES.filter(p => p.category === cat)
                        if (catTemplates.length === 0) return null
                        return (
                          <div key={cat} className="space-y-1">
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block">{cat}</span>
                            {catTemplates.map(p => {
                              const isGated = isTemplateGated(p, gates)
                              const showLock = Boolean(isGated)
                              const isActive = activeTemplateId === p.id
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => applyPreset(p)}
                                  className={`w-full text-left px-2 py-1 rounded-lg border text-[11px] transition-all flex flex-col ${
                                    isActive
                                      ? 'bg-lime-50 dark:bg-lime-950/20 border-lime-500 text-lime-800 dark:text-lime-400 font-semibold'
                                      : 'bg-white dark:bg-dark-card border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'
                                  }`}
                                >
                                  <div className="flex items-center justify-between w-full gap-1">
                                    <span className="font-semibold truncate">{p.name}</span>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {showLock && (
                                        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 bg-gray-100 dark:bg-gray-800 text-[8px] rounded text-gray-500 dark:text-gray-400 font-medium">
                                          <Lock className="w-1.5 h-1.5" />
                                          Locked
                                        </span>
                                      )}
                                    </div>
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
              )}
            </div>

            {/* B. Start Blank Button */}
            <div className="pb-3 border-b border-gray-100 dark:border-dark-border">
              <button
                type="button"
                onClick={() => {
                  setIsCustomMode(true)
                  setActiveTemplateId(null)
                  setReportName('')
                  setModel('first_touch')
                  setGroupBy('channel')
                  setGroupBy2(null)
                  setShowGroupBy2(false)
                  setMetric('sessions')
                  setSelectedMetrics(['sessions'])
                  setChartType('bar')
                  setFilters({})
                  setFilterCount(0)
                  setDatePreset(30)
                  const range = getDefaultDateRange(30)
                  setDateFrom(range.from)
                  setDateTo(range.to)
                  setIsRolling(false)
                  setRollingDays(30)
                  setEditingId(null)
                }}
                className="w-full py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 border border-transparent rounded-lg flex items-center justify-center gap-1.5 font-bold transition-all text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Start from blank (Advanced)
              </button>
            </div>

            {/* C. Report Setup Section */}
            <div className="space-y-4">
              {/* 1. Report Name */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Report Name</label>
                <input
                  type="text"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder="e.g. Weekly Revenue by Source"
                  maxLength={60}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border-strong rounded-lg text-sm outline-none focus:ring-1 focus:ring-lime-500 dark:bg-dark-card dark:text-dark-primary"
                />
              </div>

              {/* 2. Chart Type — icon row, not a dropdown. Six choices that are all visual is
                  exactly the case a segmented icon control fits: every option is visible and one
                  click away, where the select hid five of them behind "Bar". Same keys, same
                  setChartType, so saved reports are unaffected. */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Chart / Report Type</label>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Chart type">
                  {CHART_TYPES.map(c => {
                    const Icon = c.icon
                    const isActive = chartType === c.key
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setChartType(c.key)}
                        title={c.label}
                        aria-label={c.label}
                        aria-pressed={isActive}
                        className={`flex flex-col items-center justify-center gap-1 flex-1 min-w-[52px] px-2 py-2 rounded-lg border transition-colors ${
                          isActive
                            ? 'border-lime-500 bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-400'
                            : 'border-gray-200 dark:border-dark-border text-st-gray dark:text-gray-400 hover:border-gray-300 dark:hover:border-dark-border-strong hover:text-st-black dark:hover:text-dark-primary'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-[9px] font-semibold leading-none whitespace-nowrap">{c.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 3. Date Range */}
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

              {/* 4. Metric Select */}
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
                    className="w-full flex items-center justify-between px-3 py-2 text-sm bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border-strong rounded-lg shadow-sm text-gray-700 dark:text-gray-200 text-left"
                  >
                    <span className="truncate text-xs text-st-gray dark:text-gray-400">
                      {selectedMetrics.length === 0 ? 'Select metrics...' : `+ Add metric (${selectedMetrics.length} selected)`}
                    </span>
                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                  {showMetricDropdown && (
                    <div className="absolute z-40 mt-1 w-full bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg shadow-lg max-h-72 overflow-auto">
                      <div className="p-2 border-b border-gray-100 dark:border-dark-border sticky top-0 bg-white dark:bg-dark-card">
                        <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 dark:bg-dark-card rounded">
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
                            <div className="px-3 py-1 text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase bg-gray-50 dark:bg-dark-hover">{group}</div>
                            {groupMetrics.map((m) => {
                              const isSelected = selectedMetrics.includes(m.key)
                              // Dead-store gate (DERIVED from the server's gate) — distinct from
                              // isMetricGated below, which is the DATA-availability gate ("revenue
                              // not connected yet"). This one means: no live backend for this read,
                              // so the server would deny it. Grey + explain instead of bouncing the
                              // user into the locked state after they pick it.
                              const deadStoreReason = metricGateReason(m.key)
                              return (
                                <button
                                  key={m.key}
                                  type="button"
                                  disabled={!!deadStoreReason}
                                  title={deadStoreReason || undefined}
                                  onClick={() => {
                                    if (selectedMetrics.length < 4 || isSelected) toggleMetric(m.key)
                                    if (selectedMetrics.length === 1 && !isSelected) setShowMetricDropdown(false)
                                  }}
                                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                                    deadStoreReason
                                      ? 'opacity-40 cursor-not-allowed text-gray-700 dark:text-gray-300'
                                      : `hover:bg-gray-50 dark:hover:bg-dark-hover ${isSelected ? 'bg-lime-50 text-lime-800 dark:bg-lime-950/20 dark:text-lime-400 font-semibold' : 'text-gray-700 dark:text-gray-300'}`
                                  }`}
                                >
                                  <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center text-[10px] ${isSelected && !deadStoreReason ? 'bg-lime-500 border-lime-500 text-white' : 'border-gray-300'}`}>
                                    {isSelected && !deadStoreReason ? '✓' : ''}
                                  </span>
                                  <div>
                                    <div className="flex items-center gap-1">
                                      <span>{m.label}</span>
                                      {deadStoreReason && <span className="text-[10px] text-st-gray dark:text-gray-400">· Unavailable</span>}
                                      {!deadStoreReason && isMetricGated(m.key) && (
                                        <span className="text-[10px]" title="Required integration not fully connected or active">🔒</span>
                                      )}
                                    </div>
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

              {/* 5. Group By */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Group By</label>
                <CustomSelect
                  value={groupBy}
                  onChange={setGroupBy}
                  options={groupByOptions}
                />
              </div>

              {/* 6. Group By 2 */}
              {showGroupBy2 ? (
                <div className="space-y-1 pt-1.5 border-t border-dashed border-gray-100 dark:border-dark-border">
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
            </div>

            {/* D. Attribution Collapsible Section */}
            <div className="pt-2 border-t border-gray-100 dark:border-dark-border">
              <button
                type="button"
                onClick={() => setIsAttributionOpen(!isAttributionOpen)}
                className="w-full flex items-center justify-between py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-lime-600 dark:hover:text-lime-400 transition-all"
              >
                <span>Attribution Settings</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isAttributionOpen ? 'rotate-180' : ''}`} />
              </button>
              {isAttributionOpen && (
                <div className="space-y-3 mt-2 pt-2 border-t border-dashed border-gray-100 dark:border-dark-border text-xs animate-fade-in">
                  {/* Attribution Model */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Attribution Model</label>
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
                    {/* The described card. The line under this selector used to be the SAME
                        sentence for eight of the nine models ("How credit is assigned to each
                        touchpoint…"), so the control that decides the numbers explained nothing
                        about the choice being made. Now it names the selected model and says what
                        it actually does, in one line, from the shared MODEL_SUMMARY. */}
                    <div className="mt-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-st-black dark:text-dark-primary">
                          {MODELS.find(m => m.key === model)?.label || model}
                        </span>
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-st-gray dark:text-gray-400 whitespace-nowrap">
                          {isMultiTouchModel(model) ? 'Multi-touch' : 'Single-touch'}
                        </span>
                      </div>
                      <p className="text-[10px] text-st-gray dark:text-gray-400 mt-0.5 leading-normal">
                        {modelSummary(model) || 'How credit is assigned to each touchpoint in the customer journey.'}
                      </p>
                    </div>
                    {!hasFeature(site?.plan, 'multi_touch_attribution') && (
                      <p className="text-[10px] text-st-gray dark:text-gray-400">
                        🔒 Multi-touch models require an Upgrade.
                      </p>
                    )}
                  </div>

                  {/* Lookback Window */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Lookback Window</label>
                    <CustomSelect
                      value={attributionWindow || ''}
                      onChange={(val) => setAttributionWindow(val || null)}
                      options={windowOptions}
                    />
                    <p className="text-[10px] text-st-gray dark:text-gray-400 mt-1">How far back from conversion to look for touchpoints.</p>
                  </div>

                  {/* Attribute Anchored By */}
                  <div className="space-y-1">
                    <label className="block text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Attribute Anchored By</label>
                    <CustomSelect
                      value={attributeBy}
                      onChange={setAttributeBy}
                      options={attributeByOptions}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* E. Sources & Filters Collapsible Section */}
            <div className="pt-2 border-t border-gray-100 dark:border-dark-border">
              <button
                type="button"
                onClick={() => setIsFiltersOpen(!isFiltersOpen)}
                className="w-full flex items-center justify-between py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-lime-600 dark:hover:text-lime-400 transition-all"
              >
                <span>Sources & Filters</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isFiltersOpen ? 'rotate-180' : ''}`} />
              </button>
              {isFiltersOpen && (
                <div className="space-y-3 mt-2 pt-2 border-t border-dashed border-gray-100 dark:border-dark-border text-xs animate-fade-in">


                  {/* Channel Filter */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-gray-500">Channel</label>
                    <input
                      type="text"
                      value={filters.channel || ''}
                      onChange={(e) => applyFilter('channel', e.target.value || undefined)}
                      placeholder="e.g. Organic Search"
                      className="w-full px-2 py-1 border border-gray-300 dark:border-dark-border-strong dark:bg-dark-card rounded text-xs outline-none focus:ring-1 focus:ring-lime-500 dark:text-dark-primary"
                    />
                  </div>

                  {/* Source Filter */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-gray-500">Source</label>
                    <input
                      type="text"
                      value={filters.source || ''}
                      onChange={(e) => applyFilter('source', e.target.value || undefined)}
                      placeholder="e.g. google"
                      className="w-full px-2 py-1 border border-gray-300 dark:border-dark-border-strong dark:bg-dark-card rounded text-xs outline-none focus:ring-1 focus:ring-lime-500 dark:text-dark-primary"
                    />
                  </div>

                  {/* Medium Filter */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-gray-500">Medium</label>
                    <input
                      type="text"
                      value={filters.medium || ''}
                      onChange={(e) => applyFilter('medium', e.target.value || undefined)}
                      placeholder="e.g. cpc"
                      className="w-full px-2 py-1 border border-gray-300 dark:border-dark-border-strong dark:bg-dark-card rounded text-xs outline-none focus:ring-1 focus:ring-lime-500 dark:text-dark-primary"
                    />
                  </div>

                  {/* Campaign Filter */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-gray-500">Campaign</label>
                    <input
                      type="text"
                      value={filters.campaign || ''}
                      onChange={(e) => applyFilter('campaign', e.target.value || undefined)}
                      placeholder="e.g. summer_sale"
                      className="w-full px-2 py-1 border border-gray-300 dark:border-dark-border-strong dark:bg-dark-card rounded text-xs outline-none focus:ring-1 focus:ring-lime-500 dark:text-dark-primary"
                    />
                  </div>

                  {/* Conversion Type Filter */}
                  <div className="space-y-1">
                    <label className="block text-[10px] text-gray-500">Conversion Type</label>
                    <input
                      type="text"
                      value={filters.conversion_type || ''}
                      onChange={(e) => applyFilter('conversion_type', e.target.value || undefined)}
                      placeholder="e.g. signup"
                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-dark-border-strong dark:bg-dark-card rounded text-xs outline-none focus:ring-1 focus:ring-lime-500 dark:text-dark-primary"
                    />
                  </div>

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
              )}
            </div>

            {/* Reset Configuration */}
            <div className="pt-2 border-t border-gray-100 dark:border-dark-border">
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
        <div className="flex-1 min-w-0 space-y-4">
          {!canPreview ? (
            <div className="bg-white dark:bg-dark-card rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-16 text-center">
              <ArrowRight className="w-10 h-10 text-gray-300 mx-auto mb-4" />
              <p className="text-st-gray dark:text-gray-400 font-semibold text-lg">Build your report</p>
              <p className="text-sm text-st-gray dark:text-gray-400 mt-1 max-w-sm mx-auto">
                Enter a report name, choose your date range, metric, and dimension to generate a real-time preview.
              </p>
            </div>
          ) : activeGateError ? (
            getLockedEmptyState(activeGateError, selectedTemplate?.name)
          ) : (
            <>
              {data?.truncated && (
                <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                  <span>⚠</span>
                  <span>Results may be incomplete — this report hit the 50,000 event limit. Try a shorter date range.</span>
                </div>
              )}

              {/* Summary and Header Actions Card */}
              <div className="bg-white dark:bg-dark-card rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider">Previewing</h4>
                    <p className="text-lg font-bold text-st-black dark:text-dark-primary truncate mt-0.5">{reportName || 'Untitled Report'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-lime-600 dark:text-lime-400">{metricFormat(total)}</span>
                      <span className="text-xs text-st-gray dark:text-gray-400">total {metricLabel}</span>
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded bg-st-black/5 dark:bg-white/10 text-[10px] font-semibold text-st-black dark:text-dark-primary"
                        title={`Attribution model: ${MODELS.find(m => m.key === model)?.label || model}. The model determines which touch in the customer journey gets credit.`}
                      >
                        {MODELS.find(m => m.key === model)?.label || model}
                      </span>
                    </div>
                  </div>

                  {/* Actions Header */}
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                    {!isPreview && (
                      <>
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
                                className={`px-3 py-1.5 text-xs rounded-lg flex items-center gap-1.5 font-semibold transition-colors border shadow-sm disabled:opacity-50 ${
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
                                className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-dark-card text-st-gray dark:text-gray-400 border border-gray-200 dark:border-dark-border rounded-lg flex items-center gap-1.5 font-semibold opacity-70"
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
                            className="px-3 py-1.5 text-xs bg-white dark:bg-dark-card hover:bg-gray-50 dark:hover:bg-dark-border text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-dark-border-strong rounded-lg flex items-center gap-1 font-semibold shadow-sm"
                          >
                            <Download className="w-3.5 h-3.5" />
                            CSV
                          </button>
                        ) : (
                          <a
                            href="/billing"
                            className="px-3 py-1.5 text-xs bg-white dark:bg-dark-card hover:border-st-lime text-gray-400 border border-gray-300 dark:border-dark-border-strong rounded-lg flex items-center gap-1 font-semibold shadow-sm opacity-70"
                            title="CSV export available on Starter"
                          >
                            🔒 CSV
                          </a>
                        )}
                      </>
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
                <div className="bg-white dark:bg-dark-card rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6 space-y-4">
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
                            <span className="font-bold text-gray-900 dark:text-dark-primary">{metricFormat(val)}</span>
                          </div>
                          <div className="h-3 bg-gray-100 dark:bg-dark-card rounded-full overflow-hidden flex">
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
                  <div className="bg-white dark:bg-dark-card rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
                    {/* Time-series only, and only worth offering when there is actually an empty
                        date to hide. The count is stated so the toggle never silently removes
                        rows — the reader always knows exactly what came off the chart, and the
                        Data View below still lists every row. */}
                    {canHideEmptyDates && (hiddenDateCount > 0 || hideEmptyDates) && (
                      <div className="mb-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setHideEmptyDates(v => !v)}
                          aria-pressed={hideEmptyDates}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                            hideEmptyDates
                              ? 'border-lime-500 bg-lime-50 dark:bg-lime-500/10 text-lime-700 dark:text-lime-400'
                              : 'border-gray-200 dark:border-dark-border text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-primary'
                          }`}
                          title="Chart only — the Data View below always lists every row in the range."
                        >
                          <CalendarX className="w-3.5 h-3.5" />
                          Display only dates with data
                        </button>
                        {hideEmptyDates && hiddenDateCount > 0 && (
                          <span className="text-[10px] text-st-gray dark:text-gray-400">
                            {hiddenDateCount} empty {hiddenDateCount === 1 ? 'date' : 'dates'} hidden from the chart
                          </span>
                        )}
                      </div>
                    )}
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
                    ) : isError ? (
                      <div className="h-72 flex flex-col items-center justify-center gap-2 px-6 text-center">
                        {/* GATED = a deliberate server deny, not a failure: calm lock, no alarm, no retry. */}
                        {isGatedError
                          ? <Lock className="w-6 h-6 text-st-gray dark:text-gray-400" />
                          : <AlertTriangle className="w-6 h-6 text-amber-500" />}
                        <p className="text-sm font-medium text-st-black dark:text-dark-primary">{reportErrorTitle}</p>
                        <p className="text-xs text-st-gray dark:text-gray-400 max-w-md">{reportErrorMessage}</p>
                      </div>
                    ) : results.length === 0 ? (
                      <div className="h-72 flex items-center justify-center text-st-gray dark:text-gray-400 text-sm">
                        {nightlyNotice ? 'No data yet — nightly calculation pending.' : 'No data for this selection. Try a different date range or dimension.'}
                      </div>
                    ) : !chartPlottable ? (
                      /* §9.2: a line/area report with fewer than 3 rows renders its numbers.
                         The 15-row cap makes small result sets ordinary here, so this is a
                         common path, not an edge case. Bar and pie never reach it. */
                      <SparseReadings readings={chartReadingRows} unit={metricLabel.toLowerCase()} />
                    ) : (
                      <>
                        <div className="h-72">
                          {chartType === 'bar' && <Bar data={chartData} options={chartOptions} />}
                          {chartType === 'line' && <Line data={chartData} options={chartOptions} />}
                          {chartType === 'area' && <Line data={chartData} options={chartOptions} />}
                          {chartType === 'pie' && <Pie data={chartData} options={chartOptions} />}
                        </div>
                        {/* §9.2 caption for the 3-6 tier — names the days that carry readings. */}
                        {chartCaption && (
                          <p className="mt-2 text-[10px] text-st-gray dark:text-gray-400">{chartCaption}</p>
                        )}
                      </>
                    )}
                  </div>
                )
              )}

              {/* KPI view */}
              {chartType === 'kpi' && (
                <div className="bg-white dark:bg-dark-card rounded-xl shadow-sm border border-gray-200 dark:border-dark-border p-6">
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
                        <div className="mt-2 text-4xl font-semibold text-st-black dark:text-dark-primary">{formatKpiValue(currentVal, metric)}</div>
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
              <div className="bg-white dark:bg-dark-card rounded-xl shadow-sm border border-gray-200 dark:border-dark-border overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Data View</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowCompare(c => !c)}
                      className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                        showCompare
                          ? 'bg-st-black text-white border-st-black dark:bg-lime-500 dark:text-st-black'
                          : 'bg-white dark:bg-dark-card text-gray-600 dark:text-gray-300 border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'
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
                            : 'bg-white dark:bg-dark-card text-gray-600 dark:text-gray-300 border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'
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
                        <tr className="border-b border-gray-100 dark:border-dark-border bg-gray-50/50 dark:bg-[#1B1811]/40">
                          <th className="text-left py-2.5 px-4 text-st-gray dark:text-gray-400 font-semibold text-xs uppercase tracking-wider">
                            {getDimensionLabel(groupBy) || 'Dimension'}
                          </th>
                          {groupBy2 && (
                            <th className="text-left py-2.5 px-4 text-st-gray dark:text-gray-400 font-semibold text-xs uppercase tracking-wider">
                              {getDimensionLabel(groupBy2) || 'Dimension 2'}
                            </th>
                          )}
                          {selectedMetrics.map(mk => (
                            <th key={mk} className="text-right py-2.5 px-4 text-st-gray dark:text-gray-400 font-semibold text-xs uppercase tracking-wider">
                              {METRICS.find(m => m.key === mk)?.label || mk}
                            </th>
                          ))}
                          {showCompare && selectedMetrics.map(mk => (
                            <th key={mk + '_chg'} className="text-right py-2.5 px-4 text-st-gray dark:text-gray-400 font-semibold text-xs uppercase tracking-wider">
                              vs prior
                            </th>
                          ))}
                          {showExplanation && !isMultiTouch && (
                            <th className="text-left py-2.5 px-4 text-st-gray dark:text-gray-400 font-semibold text-xs uppercase tracking-wider">Attribution logic</th>
                          )}
                        </tr>
                        {/* Summary Row */}
                        <tr className="border-b border-gray-100 dark:border-dark-border bg-gray-100/50 dark:bg-dark-hover/30">
                          <td className="py-2.5 px-4 text-xs font-semibold text-gray-700 dark:text-gray-300">Summary Total</td>
                          {groupBy2 && <td />}
                          {selectedMetrics.map(mk => {
                            const mDef = METRICS.find(m => m.key === mk)
                            const fmt = mDef?.format || (v => String(v))
                            const totalVal = results.reduce((s, r) => s + getMetricValue(r, mk), 0)
                            return <td key={mk} className="py-2.5 px-4 text-right text-xs font-bold text-st-black dark:text-dark-primary tabular-nums">{fmt(totalVal)}</td>
                          })}
                          {showCompare && selectedMetrics.map(mk => {
                            const curTotal = results.reduce((s, r) => s + getMetricValue(r, mk), 0)
                            const priorRows = priorReportData?.results || []
                            const priorTotal = priorRows.reduce((s, r) => s + getMetricValue(r, mk), 0)
                            const delta = priorTotal > 0 ? ((curTotal - priorTotal) / priorTotal) * 100 : null
                            return (
                              <td key={mk + '_chg_sum'} className="py-2.5 px-4 text-right text-xs tabular-nums">
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
                            <tr key={i} className="border-b border-gray-100/70 dark:border-dark-border hover:bg-gray-50/50 dark:hover:bg-dark-hover/40 transition-colors">
                              <td className="py-2.5 px-4 text-st-black dark:text-gray-200 font-medium">
                                <span className="inline-flex items-center">
                                  {['source', 'channel'].includes(groupBy) ? (
                                    // raw for channel: normalizeSource is a SOURCE normalizer and
                                    // channel values are already display labels, so it collapsed
                                    // 'Paid Search' + 'Paid Social' into one 'Paid Ads' label while
                                    // the chart (chartLabels, raw dim_value) kept them apart.
                                    <SourceChip source={r.dim_value || 'Direct / None'} raw={groupBy === 'channel'} />
                                  ) : (
                                    <>
                                      {r.dim_value || 'Direct / None'}
                                      {isDirectLabel(r.dim_value || 'Direct / None') && <DirectInfo />}
                                    </>
                                  )}
                                </span>
                              </td>
                              {groupBy2 && <td className="py-2.5 px-4 text-gray-600 dark:text-gray-400">{r.dim_value2}</td>}
                              {selectedMetrics.map(mk => {
                                const mDef = METRICS.find(m => m.key === mk)
                                const fmt = mDef?.format || (v => String(v))
                                return <td key={mk} className="py-2.5 px-4 text-right font-semibold text-st-black dark:text-dark-primary tabular-nums">{fmt(getMetricValue(r, mk))}</td>
                              })}
                              {showCompare && selectedMetrics.map(mk => {
                                const cur = getMetricValue(r, mk)
                                const prior = getMetricValue(priorRow, mk)
                                const delta = prior > 0 ? ((cur - prior) / prior) * 100 : null
                                return (
                                  <td key={mk + '_chg'} className="py-2.5 px-4 text-right text-xs tabular-nums">
                                    {delta !== null
                                      ? <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${delta >= 0 ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-100 dark:border-green-900/30' : 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/20'}`}>
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
                                    className="text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text flex items-center gap-1"
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
            <div className="w-screen max-w-md bg-white dark:bg-dark-card border-l border-gray-200 dark:border-dark-border shadow-2xl flex flex-col">
              <div className="px-6 py-5 border-b border-gray-100 dark:border-dark-border flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-800 dark:text-dark-primary">Saved Reports</h3>
                <button onClick={() => setIsDrawerOpen(false)} className="text-gray-400 hover:text-gray-500">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {reportsLoading ? (
                  <div className="flex items-center justify-center py-8 text-st-gray dark:text-gray-400">
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
                      <div key={r.id} className="rounded-xl border border-gray-200 dark:border-dark-border p-4 bg-gray-50/50 dark:bg-dark-card/50 hover:bg-gray-50 dark:hover:bg-dark-hover transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-dark-primary truncate">{r.name}</p>
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5 text-[10px] text-st-gray dark:text-gray-400">
                              <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{meta.metricLabel}</span>
                              <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{meta.groupLabel}</span>
                              <span className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{meta.modelLabel}</span>
                              {meta.filterCount > 0 && (
                                <span className="bg-lime-50 text-lime-800 dark:bg-lime-950/20 dark:text-lime-400 px-1.5 py-0.5 rounded font-semibold">
                                  {meta.filterCount} filter{meta.filterCount > 1 ? 's' : ''}
                                </span>
                              )}
                              {meta.gateReason && (
                                <span
                                  title={meta.gateReason}
                                  className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-semibold"
                                >
                                  <Lock className="w-2.5 h-2.5" /> Unavailable
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className={`flex items-center ${isPreview ? 'justify-end' : 'justify-between'} border-t border-gray-100 dark:border-dark-border mt-3 pt-3`}>
                          {!isPreview && (
                            hasFeature(site?.plan, 'dashboard_widgets') ? (
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
                            )
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { handleLoad(r); setIsDrawerOpen(false) }}
                              className="px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-card hover:bg-gray-100 dark:hover:bg-dark-hover border border-gray-200 dark:border-dark-border rounded transition-all font-semibold"
                            >
                              Load
                            </button>
                            {!isPreview && (
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
                            )}
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
