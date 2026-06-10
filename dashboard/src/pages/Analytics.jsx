import { useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { fetchApi } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Eye, RefreshCw, ExternalLink, Zap, Sparkles, Copy, Check, TrendingDown, DollarSign } from 'lucide-react'
import { safeNumber, formatPercent, formatCurrency } from '../utils/numbers'
import FunnelChart from '../components/FunnelChart'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Title, Tooltip, Legend, Filler)

// ─── Constants ───────────────────────────────────────────────────────────────
const DARK_BG       = '#1A1D1D'
const CARD_BG       = '#242829'
const BORDER_COLOR  = '#2A2E2E'
const ST_LIME       = '#CCF03F'
const ORANGE_400    = 'rgb(251,146,60)'

const FUNNEL_PRESETS = [
  { label: 'Pricing → Signup', steps: ['pricing', 'signup'] },
  { label: 'Landing → Pricing → Checkout', steps: ['landing', 'pricing', 'checkout'] },
  { label: 'Blog → Product → Checkout', steps: ['blog', 'product', 'checkout'] },
  { label: 'Features → Pricing → Demo', steps: ['features', 'pricing', 'demo'] },
  { label: 'Custom', steps: [] }
]

const CHANNEL_COLORS = {
  'Paid Search':    'bg-blue-500/20 text-blue-400',
  'Paid Social':    'bg-purple-500/20 text-purple-400',
  'Organic Search': 'bg-green-500/20 text-green-400',
  'Organic Social': 'bg-pink-500/20 text-pink-400',
  'Email':          'bg-yellow-500/20 text-yellow-400',
  'Direct':         'bg-gray-500/20 text-gray-400',
  'AI Search':      'bg-orange-500/20 text-orange-400',
  'Referral':       'bg-cyan-500/20 text-cyan-400',
  'Affiliate':      'bg-emerald-500/20 text-emerald-400',
  'Display':        'bg-indigo-500/20 text-indigo-400',
  'SMS':            'bg-rose-500/20 text-rose-400',
  'Other Campaign': 'bg-slate-500/20 text-slate-400'
}

// ─── Small helpers ───────────────────────────────────────────────────────────
function fmtDuration(s) {
  if (!s) return '0s'
  const n = safeNumber(s, 0)
  if (n < 60) return `${Math.round(n)}s`
  return `${Math.floor(n / 60)}m ${Math.round(n % 60)}s`
}
function stripOrigin(url = '') { return url.replace(/^https?:\/\/[^/]+/, '') || '/' }

// ─── Dual-bar data row (visitor bar + revenue bar) ───────────────────────────
function DataRow({ label, visitors, revenue, maxVisitors, maxRevenue, channel, onClick, active }) {
  const v = safeNumber(visitors, 0)
  const r = safeNumber(revenue, 0)
  const visitorPct = maxVisitors > 0 ? (v / maxVisitors) * 100 : 0
  const revenuePct = maxRevenue > 0 ? (r / maxRevenue) * 100 : 0
  const chPill = channel && CHANNEL_COLORS[channel]
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2 border-b border-[#2A2E2E]/60 last:border-0 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${active ? 'bg-st-lime/5' : 'hover:bg-[#242829]'}`}
    >
      <span className="text-xs flex-1 truncate text-white">
        {chPill && <span className={`text-[10px] px-1.5 py-0.5 rounded mr-2 ${chPill}`}>{channel}</span>}
        {label}
      </span>
      <div className="flex flex-col gap-0.5 w-24 flex-shrink-0">
        <div className="h-1.5 bg-[#2A2E2E] rounded-full overflow-hidden">
          <div className="h-full bg-st-lime rounded-full transition-all" style={{ width: `${visitorPct.toFixed(1)}%` }} />
        </div>
        {r > 0 && (
          <div className="h-1.5 bg-[#2A2E2E] rounded-full overflow-hidden">
            <div className="h-full bg-orange-400 rounded-full transition-all" style={{ width: `${revenuePct.toFixed(1)}%` }} />
          </div>
        )}
      </div>
      <span className="text-sm font-medium text-white w-14 text-right flex-shrink-0 tabular-nums">{v.toLocaleString()}</span>
      <span className={`text-xs w-16 text-right flex-shrink-0 tabular-nums ${r > 0 ? 'text-orange-400' : 'text-st-gray/50'}`}>
        {r > 0 ? formatCurrency(r, 0) : '—'}
      </span>
    </div>
  )
}

// ─── Section card with "Show more" expansion ─────────────────────────────────
function ListSection({ title, rows, getLabel, getVisitors, getRevenue, getChannel, onRowClick, isRowActive, emptyText = 'No data yet' }) {
  const [showAll, setShowAll] = useState(false)
  const total = rows.length
  const visible = showAll ? rows : rows.slice(0, 8)
  const maxVisitors = useMemo(() => Math.max(1, ...rows.map(r => safeNumber(getVisitors(r), 0))), [rows])
  const maxRevenue  = useMemo(() => Math.max(1, ...rows.map(r => safeNumber(getRevenue(r), 0))), [rows])

  return (
    <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2A2E2E] flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="flex items-center gap-3 text-[10px] text-st-gray uppercase tracking-wide">
          <span className="flex items-center gap-1">
            <span className="w-2 h-1 rounded-sm bg-st-lime inline-block" /> Visitors
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-1 rounded-sm bg-orange-400 inline-block" /> Revenue
          </span>
        </div>
      </div>
      {total === 0 ? (
        <p className="text-xs text-st-gray py-10 text-center">{emptyText}</p>
      ) : (
        <>
          {visible.map((r, i) => (
            <DataRow
              key={i}
              label={getLabel(r)}
              visitors={getVisitors(r)}
              revenue={getRevenue(r)}
              maxVisitors={maxVisitors}
              maxRevenue={maxRevenue}
              channel={getChannel ? getChannel(r) : null}
              onClick={onRowClick ? () => onRowClick(r) : null}
              active={isRowActive ? isRowActive(r) : false}
            />
          ))}
          {total > 8 && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="w-full py-2 text-xs text-st-gray hover:text-white border-t border-[#2A2E2E] transition-colors"
            >
              {showAll ? '↑ Show less' : `↓ Show all ${total}`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─── KPI tile ────────────────────────────────────────────────────────────────
function KPITile({ label, value, delta, sub, dotColor, onClick, active, dim }) {
  return (
    <div
      onClick={onClick}
      className={`bg-[#1A1D1D] border ${active ? 'border-st-lime/60' : 'border-[#2A2E2E]'} rounded-xl px-4 py-3 transition-colors ${
        onClick ? 'cursor-pointer hover:border-[#3A3E3E]' : ''
      } ${dim ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        {dotColor && <span className="w-2 h-2 rounded-sm" style={{ background: dotColor }} />}
        <p className="text-[11px] text-st-gray font-medium uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-xl font-semibold text-white tabular-nums">{value}</p>
      {delta && (
        <p className={`text-[10px] font-medium mt-0.5 ${delta.color}`}>{delta.arrow} {delta.pct}% vs prior</p>
      )}
      {sub && <p className="text-[10px] text-st-gray mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function Analytics() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'referrer'
  const [days, setDays] = useState(30)
  const [granularity, setGranularity] = useState('daily')
  const [filters, setFilters] = useState([])          // Feature 2: multi-filter
  const [showVisitors, setShowVisitors] = useState(true)
  const [showRevenue, setShowRevenue]   = useState(true)
  const [sourceTab, setSourceTab] = useState(
    ['channel', 'referrer', 'campaign', 'medium', 'ai_source'].includes(initialTab) ? initialTab : 'referrer'
  )
  const [copied, setCopied] = useState(false)
  const [funnelInput, setFunnelInput] = useState('')
  const [funnelSteps, setFunnelSteps] = useState([])
  const [selectedPreset, setSelectedPreset] = useState(null)

  // ─── Site ──────────────────────────────────────────────────────────────────
  const { data: site } = useQuery({
    queryKey: ['site', user?.id],
    queryFn: async () => {
      const { data: member } = await supabase
        .from('company_members').select('company_id').eq('user_id', user.id).maybeSingle()
      const query = supabase.from('sites').select('site_key, name, domain, cookieless_mode').limit(1)
      if (member?.company_id) query.eq('company_id', member.company_id)
      else query.eq('owner_id', user.id)
      const { data } = await query.maybeSingle()
      return data
    },
    enabled: !!user
  })

  // ─── Build filter query string (Feature 2) ─────────────────────────────────
  const filterQuery = useMemo(() => {
    return filters.map(f => `&f=${encodeURIComponent(f.type + ':' + f.value)}`).join('')
  }, [filters])

  // ─── Summary (with revenue + timeseries) ───────────────────────────────────
  const { data: summary, isLoading } = useQuery({
    queryKey: ['analytics-summary', site?.site_key, days, granularity, filters],
    queryFn: () => fetchApi(`/analytics/summary?site_key=${site.site_key}&days=${days}&granularity=${granularity}${filterQuery}`),
    enabled: !!site?.site_key
  })

  // Prior period for deltas
  const priorFrom = new Date(Date.now() - days * 2 * 86400000).toISOString().slice(0, 10)
  const priorTo = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const { data: priorSummary } = useQuery({
    queryKey: ['prior-analytics-summary', site?.site_key, days, filters],
    queryFn: () => fetchApi(`/analytics/summary?site_key=${site.site_key}&from=${priorFrom}&to=${priorTo}${filterQuery}`),
    enabled: !!site?.site_key
  })

  // ─── Live ──────────────────────────────────────────────────────────────────
  const { data: liveData, refetch: refetchLive } = useQuery({
    queryKey: ['analytics-live', site?.site_key],
    queryFn: () => fetchApi(`/live?site_key=${site.site_key}`),
    enabled: !!site?.site_key,
    refetchInterval: 30000
  })

  // ─── Sources tab (Feature 5) ───────────────────────────────────────────────
  const { data: sourcesData } = useQuery({
    queryKey: ['analytics-sources', site?.site_key, days, sourceTab, filters],
    queryFn: () => fetchApi(`/analytics/sources?site_key=${site.site_key}&days=${days}&tab=${sourceTab}${filterQuery}`),
    enabled: !!site?.site_key
  })

  // ─── Recent conversions (Feature 7) ────────────────────────────────────────
  const { data: recentConversions } = useQuery({
    queryKey: ['analytics-recent', site?.site_key, days],
    queryFn: () => fetchApi(`/analytics/recent-conversions?site_key=${site.site_key}&days=${days}`),
    enabled: !!site?.site_key
  })

  // ─── Other sections ────────────────────────────────────────────────────────
  const { data: entryExitData } = useQuery({
    queryKey: ['analytics-entry-exit', site?.site_key, days, filters],
    queryFn: () => fetchApi(`/analytics/entry-exit?site_key=${site.site_key}&days=${days}${filterQuery}`),
    enabled: !!site?.site_key
  })
  const { data: browserData } = useQuery({
    queryKey: ['analytics-browsers', site?.site_key, days, filters],
    queryFn: () => fetchApi(`/analytics/browsers?site_key=${site.site_key}&days=${days}${filterQuery}`),
    enabled: !!site?.site_key
  })
  const { data: osData } = useQuery({
    queryKey: ['analytics-os', site?.site_key, days, filters],
    queryFn: () => fetchApi(`/analytics/os?site_key=${site.site_key}&days=${days}${filterQuery}`),
    enabled: !!site?.site_key
  })
  const { data: funnelData, isLoading: isFunnelLoading, isError: isFunnelError } = useQuery({
    queryKey: ['funnel', site?.site_key, funnelSteps, days],
    queryFn: () => fetchApi(`/analytics/funnel?site_key=${site.site_key}&steps=${encodeURIComponent(funnelSteps.join(','))}&days=${days}`),
    enabled: !!site?.site_key && funnelSteps.length > 0
  })

  // fetchApi already unwraps `data.data`; `summary` is the inner object.
  const d            = summary || {}
  const kpis         = d.kpis || {}
  const priorKpis    = (priorSummary || {}).kpis || {}
  const topPages     = d.top_pages || []
  const aiSources    = d.ai_sources || []
  const devices      = d.devices || {}
  const topCountries = d.top_countries || []
  const liveCount    = safeNumber(liveData?.live_visitors, 0)
  const entryPages   = entryExitData?.entry_pages || []
  const exitPages    = entryExitData?.exit_pages  || []
  const browsers     = browserData || []
  const osList       = osData || []
  const sourcesRows  = sourcesData?.rows || []
  const ts           = d.timeseries || { labels: [], visitors: [], revenue: [] }
  const recents      = recentConversions || []

  const newVisitors       = safeNumber(kpis.new_visitors, 0)
  const returningVisitors = safeNumber(kpis.returning_visitors, 0)
  const totalVis          = (newVisitors + returningVisitors) || 1
  const newPct            = Math.round(newVisitors / totalVis * 100)

  // ─── Filter helpers (Feature 2) ────────────────────────────────────────────
  function toggleFilter(type, value) {
    setFilters(prev => {
      const exists = prev.find(f => f.type === type && f.value === value)
      if (exists) return prev.filter(f => !(f.type === type && f.value === value))
      return [...prev, { type, value }]
    })
  }
  function isActive(type, value) {
    return filters.some(f => f.type === type && f.value === value)
  }

  // ─── Funnel helpers ────────────────────────────────────────────────────────
  const stepsFromInput = useMemo(() => {
    return funnelInput.split(',').map(s => s.trim()).filter(Boolean)
  }, [funnelInput])

  const isValidFunnel = stepsFromInput.length >= 2

  function handleSelectPreset(idx) {
    setSelectedPreset(idx)
    const preset = FUNNEL_PRESETS[idx]
    if (preset.steps.length > 0) {
      const stepsStr = preset.steps.join(', ')
      setFunnelInput(stepsStr)
    } else {
      setFunnelInput('')
    }
  }

  function handleInputChange(val) {
    setFunnelInput(val)
    setSelectedPreset(null)
  }

  function handleBuild() {
    if (isValidFunnel) {
      setFunnelSteps(stepsFromInput.slice(0, 8))
    }
  }

  function handleRemoveStep(idxToRemove) {
    const newSteps = funnelSteps.filter((_, idx) => idx !== idxToRemove)
    setFunnelSteps(newSteps)
    setFunnelInput(newSteps.join(', '))
    setSelectedPreset(null)
  }

  // ─── Delta calc ────────────────────────────────────────────────────────────
  function delta(current, prior, invertedIsGood = false) {
    const c = safeNumber(current, 0), p = safeNumber(prior, 0)
    if (p === 0) return null
    const pct = ((c - p) / Math.abs(p)) * 100
    const positiveSwing = pct > 0
    const isGood = invertedIsGood ? !positiveSwing : positiveSwing
    return {
      pct: Math.abs(pct).toFixed(1),
      color: pct === 0 ? 'text-st-gray' : isGood ? 'text-green-400' : 'text-red-400',
      arrow: pct === 0 ? '·' : positiveSwing ? '▲' : '▼'
    }
  }

  // ─── Chart data (Feature 3) ────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const datasets = []
    if (showVisitors) datasets.push({
      type: 'line',
      label: 'Visitors',
      data: ts.visitors,
      borderColor: ST_LIME,
      backgroundColor: 'rgba(204,240,63,0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
      pointBackgroundColor: ST_LIME,
      yAxisID: 'y',
      order: 1
    })
    if (showRevenue) datasets.push({
      type: 'bar',
      label: 'Revenue',
      data: ts.revenue,
      backgroundColor: 'rgba(251,146,60,0.7)',
      borderRadius: 3,
      borderSkipped: false,
      yAxisID: 'y2',
      order: 2
    })
    return { labels: ts.labels, datasets }
  }, [ts, showVisitors, showRevenue])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0F1212',
        borderColor: BORDER_COLOR,
        borderWidth: 1,
        titleColor: '#fff',
        bodyColor: '#fff',
        callbacks: {
          label: (ctx) => {
            const v = safeNumber(ctx.parsed.y, 0)
            if (ctx.dataset.label === 'Revenue') return `Revenue: ${formatCurrency(v, 2)}`
            return `Visitors: ${v.toLocaleString()}`
          }
        }
      }
    },
    scales: {
      x:  { grid: { display: false }, ticks: { color: '#7D8090', maxRotation: 0 } },
      y:  { position: 'left',  grid: { color: BORDER_COLOR }, ticks: { color: '#7D8090', precision: 0 } },
      y2: { position: 'right', grid: { display: false },     ticks: { color: '#7D8090', callback: v => '$' + safeNumber(v, 0).toLocaleString() } }
    }
  }), [])

  // ─── KPI deltas ────────────────────────────────────────────────────────────
  const visitorsDelta = delta(kpis.unique_visitors, priorKpis.unique_visitors)
  const revenueDelta  = delta(kpis.total_revenue,   priorKpis.total_revenue)
  const rpvDelta      = delta(kpis.revenue_per_visitor, priorKpis.revenue_per_visitor)
  const convDelta     = delta(kpis.conversion_rate, priorKpis.conversion_rate)
  const bounceDelta   = delta(kpis.bounce_rate,     priorKpis.bounce_rate, true)
  const durationDelta = delta(kpis.avg_duration_seconds, priorKpis.avg_duration_seconds)

  const trackerFile = site?.cookieless_mode ? 'tracker.cookieless.min.js' : 'tracker.min.js'
  const snippetUrl = site
    ? `<script async src="${window.location.origin}/${trackerFile}" data-site-key="${site.site_key}"></script>`
    : ''
  function copySnippet() {
    navigator.clipboard.writeText(snippetUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Has-data check
  const hasData = safeNumber(kpis.pageviews, 0) > 0

  if (!site) return null

  return (
    <div className="st-container space-y-4">

      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">Analytics</h2>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1A1D1D] border border-[#2A2E2E] rounded-full">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${liveCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-xs font-medium text-white">{liveCount}</span>
            <span className="text-xs text-st-gray">live</span>
            <button onClick={() => refetchLive()} className="text-st-gray hover:text-white ml-0.5">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="hidden sm:flex gap-1.5">
            {['Cookieless','No consent','GDPR'].map(b => (
              <span key={b} className="text-[10px] text-st-gray border border-[#2A2E2E] rounded-full px-2 py-0.5">{b}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 bg-[#1A1D1D] border border-[#2A2E2E] rounded-lg p-1">
          {[{l:'24h',d:1},{l:'7d',d:7},{l:'30d',d:30},{l:'90d',d:90}].map(t => (
            <button key={t.d} onClick={() => setDays(t.d)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                days === t.d ? 'bg-st-lime text-st-black' : 'text-st-gray hover:text-white'
              }`}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Active filter pills (Feature 2) ─────────────────────────────── */}
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((f, i) => (
            <span key={i} className="flex items-center gap-1 px-2 py-1 bg-[#242829] border border-[#2A2E2E] rounded-full text-xs text-white">
              <span className="text-st-gray">{f.type}:</span> {f.value}
              <button onClick={() => toggleFilter(f.type, f.value)} className="text-st-gray hover:text-white ml-1 leading-none text-sm">×</button>
            </span>
          ))}
          {filters.length > 1 && (
            <button onClick={() => setFilters([])} className="text-xs text-st-gray hover:text-white px-2">
              Clear all
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-lime" />
        </div>
      ) : !hasData ? (
        <div className="max-w-lg mx-auto py-16 text-center space-y-6">
          <Eye className="w-12 h-12 text-st-gray/40 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">No analytics data yet</h3>
            <p className="text-sm text-st-gray">Add the tracking script to your site to start collecting data.</p>
          </div>
          <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl p-4 text-left">
            <p className="text-xs font-semibold text-white mb-2">Add to your site &lt;head&gt;:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-st-gray flex-1 break-all">{snippetUrl}</code>
              <button onClick={copySnippet} className="flex-shrink-0 p-1.5 text-st-gray hover:text-white border border-[#2A2E2E] rounded-lg">
                {copied ? <Check className="w-3.5 h-3.5 text-st-lime" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ─── KPI tiles (Feature 1) ──────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            <KPITile
              label="Visitors"
              dotColor={ST_LIME}
              value={safeNumber(kpis.unique_visitors, 0).toLocaleString()}
              delta={visitorsDelta}
              onClick={() => setShowVisitors(s => !s)}
              dim={!showVisitors}
              sub={newVisitors > 0 ? `${newPct}% new` : null}
            />
            <KPITile
              label="Revenue"
              dotColor={ORANGE_400}
              value={formatCurrency(kpis.total_revenue, 0)}
              delta={revenueDelta}
              onClick={() => setShowRevenue(s => !s)}
              dim={!showRevenue}
            />
            <KPITile
              label="Rev/Visitor"
              dotColor={ORANGE_400}
              value={formatCurrency(kpis.revenue_per_visitor, 2)}
              delta={rpvDelta}
            />
            <KPITile
              label="Conv Rate"
              dotColor={ST_LIME}
              value={`${safeNumber(kpis.conversion_rate, 0).toFixed(2)}%`}
              delta={convDelta}
              sub={kpis.conversion_count != null ? `${safeNumber(kpis.conversion_count,0).toLocaleString()} conv` : null}
            />
            <KPITile
              label="Bounce"
              value={formatPercent(kpis.bounce_rate, 1)}
              delta={bounceDelta}
            />
            <KPITile
              label="Duration"
              value={fmtDuration(kpis.avg_duration_seconds)}
              delta={durationDelta}
            />
            <KPITile
              label="Online now"
              value={liveCount.toLocaleString()}
              sub="updated 30s"
            />
          </div>

          {/* ─── Dual-axis chart (Feature 3) ────────────────────────────── */}
          <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-white">
                  <input type="checkbox" checked={showVisitors} onChange={e => setShowVisitors(e.target.checked)}
                    className="accent-st-lime w-3 h-3" />
                  <span className="w-2 h-2 rounded-sm" style={{ background: ST_LIME }} />
                  Visitors
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs text-white">
                  <input type="checkbox" checked={showRevenue} onChange={e => setShowRevenue(e.target.checked)}
                    className="accent-orange-400 w-3 h-3" />
                  <span className="w-2 h-2 rounded-sm" style={{ background: ORANGE_400 }} />
                  Revenue
                </label>
              </div>
              <div className="flex items-center gap-1 bg-[#242829] border border-[#2A2E2E] rounded-lg p-0.5">
                {['daily','weekly','monthly'].map(g => (
                  <button key={g} onClick={() => setGranularity(g)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md capitalize transition-colors ${
                      granularity === g ? 'bg-st-lime text-st-black' : 'text-st-gray hover:text-white'
                    }`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 240 }}>
              {ts.labels.length > 0 ? (
                <Chart type="bar" data={chartData} options={chartOptions} />
              ) : (
                <p className="text-xs text-st-gray text-center py-12">No time-series data yet</p>
              )}
            </div>
          </div>

          {/* ─── Two-column: Pages + Sources ────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Top Pages */}
            <ListSection
              title="Top Pages"
              rows={topPages}
              getLabel={r => stripOrigin(r.page)}
              getVisitors={r => r.views}
              getRevenue={() => 0}
              onRowClick={r => toggleFilter('Page', stripOrigin(r.page))}
              isRowActive={r => isActive('Page', stripOrigin(r.page))}
              emptyText="No page data yet"
            />

            {/* Sources with channel/referrer/campaign/medium tabs */}
            <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2A2E2E] flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-white">Sources</h3>
                <div className="flex gap-1">
                  {['channel','referrer','campaign','medium','ai_source'].map(tab => (
                    <button key={tab} onClick={() => { setSourceTab(tab); setSearchParams({ tab }); }}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize transition-colors ${
                        sourceTab === tab ? 'bg-st-lime text-st-black' : 'text-st-gray hover:text-white'
                      }`}>
                      {tab === 'ai_source' ? 'AI Sources' : tab}
                    </button>
                  ))}
                </div>
              </div>
              {/* Channel/campaign tabs pull from attributed_conversions — the count column
                  shows conversion counts, not visitors. Make that explicit so the number
                  isn't misread. */}
              {['channel','campaign'].includes(sourceTab) && (
                <p className="text-[11px] text-st-gray px-4 pt-2">
                  Showing conversion counts · visitor-level data requires a pageview join
                </p>
              )}
              {sourceTab === 'ai_source' && (
                <p className="text-[11px] text-st-gray px-4 pt-2">
                  Revenue uses first-touch attributed conversions for this source overview.
                </p>
              )}
              <SourceTabList
                rows={sourcesRows}
                tab={sourceTab}
                toggleFilter={toggleFilter}
                isActive={isActive}
              />
            </div>
          </div>

          {/* ─── AI Traffic (special section — kept from before) ──────── */}
          {aiSources.length > 0 && (
            <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2A2E2E] flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-orange-400" />
                <h3 className="text-sm font-semibold text-white">AI Traffic</h3>
                <span className="text-[10px] text-st-gray ml-auto">
                  ✦ {Math.round(aiSources.reduce((s,r)=>s+safeNumber(r.visits,0),0) / Math.max(1, safeNumber(kpis.unique_visitors, 1)) * 100)}% of all traffic
                </span>
              </div>
              {(() => {
                const max = Math.max(1, ...aiSources.map(r => safeNumber(r.visits, 0)))
                return aiSources.map((r, i) => (
                  <DataRow
                    key={i}
                    label={`✦ ${r.source}`}
                    visitors={r.visits}
                    revenue={0}
                    maxVisitors={max}
                    maxRevenue={1}
                    onClick={() => toggleFilter('AI Source', r.source)}
                    active={isActive('AI Source', r.source)}
                  />
                ))
              })()}
            </div>
          )}

          {/* ─── Entry/Exit pages two-column ────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ListSection
              title="Entry Pages"
              rows={entryPages}
              getLabel={r => stripOrigin(r.page)}
              getVisitors={r => r.count}
              getRevenue={() => 0}
              onRowClick={r => toggleFilter('Entry', stripOrigin(r.page))}
              isRowActive={r => isActive('Entry', stripOrigin(r.page))}
              emptyText="No entry data yet"
            />
            <ListSection
              title="Exit Pages"
              rows={exitPages}
              getLabel={r => stripOrigin(r.page)}
              getVisitors={r => r.count}
              getRevenue={() => 0}
              onRowClick={r => toggleFilter('Exit', stripOrigin(r.page))}
              isRowActive={r => isActive('Exit', stripOrigin(r.page))}
              emptyText="No exit data yet"
            />
          </div>

          {/* ─── Countries + Devices ────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ListSection
              title="Top Countries"
              rows={topCountries}
              getLabel={r => r.country || 'Unknown'}
              getVisitors={r => r.visits}
              getRevenue={() => 0}
              onRowClick={r => toggleFilter('Country', r.country)}
              isRowActive={r => isActive('Country', r.country)}
              emptyText="No country data yet"
            />
            <ListSection
              title="Devices"
              rows={Object.entries(devices).sort((a,b) => safeNumber(b[1],0) - safeNumber(a[1],0)).map(([k,v]) => ({ device: k, count: v }))}
              getLabel={r => r.device.charAt(0).toUpperCase() + r.device.slice(1)}
              getVisitors={r => r.count}
              getRevenue={() => 0}
              onRowClick={r => toggleFilter('Device', r.device)}
              isRowActive={r => isActive('Device', r.device)}
              emptyText="No device data yet"
            />
          </div>

          {/* ─── Browsers + OS ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ListSection
              title="Browsers"
              rows={browsers}
              getLabel={r => r.browser}
              getVisitors={r => r.visitors}
              getRevenue={() => 0}
              onRowClick={r => toggleFilter('Browser', r.browser)}
              isRowActive={r => isActive('Browser', r.browser)}
              emptyText="No browser data yet"
            />
            <ListSection
              title="Operating Systems"
              rows={osList}
              getLabel={r => r.os}
              getVisitors={r => r.visitors}
              getRevenue={() => 0}
              onRowClick={r => toggleFilter('OS', r.os)}
              isRowActive={r => isActive('OS', r.os)}
              emptyText="No OS data yet"
            />
          </div>

          {/* ─── Recent Conversions (Feature 7) ─────────────────────────── */}
          <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="w-3.5 h-3.5 text-orange-400" />
              <h3 className="text-sm font-semibold text-white">Recent Conversions</h3>
              <span className="text-[10px] text-st-gray ml-auto">Privacy-safe · anonymized</span>
            </div>
            {recents.length === 0 ? (
              <p className="text-center text-st-gray text-sm py-6">No conversions in this period</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-st-gray border-b border-[#2A2E2E]">
                      <th className="text-left pb-2 font-medium">Visitor</th>
                      <th className="text-left pb-2 font-medium">Channel</th>
                      <th className="text-left pb-2 font-medium">Source</th>
                      <th className="text-right pb-2 font-medium">Value</th>
                      <th className="text-right pb-2 font-medium">Touchpoints</th>
                      <th className="text-right pb-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recents.map((c, i) => {
                      const tp = Math.max(1, Math.min(safeNumber(c.touchpoint_count, 1), 8))
                      const chPill = c.first_touch_channel && CHANNEL_COLORS[c.first_touch_channel]
                      return (
                        <tr key={i} className="border-b border-[#242829] hover:bg-[#242829] transition-colors">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-st-lime/20 to-st-lime/5 flex items-center justify-center text-xs font-bold text-st-lime border border-st-lime/20">
                                {c.display_id.slice(0, 2)}
                              </div>
                              <span className="text-white font-medium tabular-nums">{c.display_id}</span>
                            </div>
                          </td>
                          <td className="py-2.5">
                            {chPill ? (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${chPill}`}>{c.first_touch_channel}</span>
                            ) : (
                              <span className="text-st-gray text-xs">—</span>
                            )}
                          </td>
                          <td className="py-2.5 text-st-gray">{c.first_touch_source || 'Direct'}</td>
                          <td className="py-2.5 text-right">
                            <span className="text-orange-400 font-medium tabular-nums">
                              {safeNumber(c.conversion_value, 0) > 0 ? formatCurrency(c.conversion_value, 0) : '—'}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            <div className="flex gap-0.5 justify-end">
                              {Array.from({ length: tp }).map((_, j) => (
                                <div key={j} className={`w-2 h-2 rounded-full ${
                                  j === 0 ? 'bg-st-lime' :
                                  j === tp - 1 ? 'bg-orange-400' :
                                  'bg-[#2A2E2E] border border-[#3A3E3E]'
                                }`} />
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 text-right text-st-gray text-xs">
                            {c.conversion_date ? new Date(c.conversion_date).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ─── Snippet + Funnel ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2A2E2E] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ExternalLink className="w-3.5 h-3.5 text-st-gray" />
                  <span className="text-sm font-semibold text-white">Tracking snippet</span>
                </div>
                <span className="text-[10px] text-st-gray">Cookieless · No consent · GDPR</span>
              </div>
              <div className="px-4 py-3 flex items-center gap-2">
                <code className="text-[11px] text-st-gray flex-1 truncate bg-[#242829] px-2 py-1.5 rounded-lg border border-[#2A2E2E]">{snippetUrl}</code>
                <button onClick={copySnippet}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-st-lime text-st-black text-xs font-semibold rounded-lg hover:opacity-90">
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2A2E2E] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-3.5 h-3.5 text-st-gray" />
                  <span className="text-sm font-semibold text-white">Page-Path Funnel</span>
                </div>
                <span className="text-[10px] text-st-gray">Privacy-safe</span>
              </div>
              <div className="p-4 space-y-4">
                {/* Quick Presets */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-st-gray font-medium uppercase tracking-wide">Quick Presets</span>
                  <div className="flex flex-wrap gap-1.5">
                    {FUNNEL_PRESETS.map((preset, idx) => {
                      const isSelected = selectedPreset === idx
                      return (
                        <button
                          key={preset.label}
                          onClick={() => handleSelectPreset(idx)}
                          className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors ${
                            isSelected
                              ? 'bg-st-lime border-st-lime text-st-black'
                              : 'bg-[#242829] border-[#2A2E2E] text-st-gray hover:text-white hover:border-[#3A3E3E]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Input & Build button */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={funnelInput}
                      onChange={e => handleInputChange(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && isValidFunnel && handleBuild()}
                      placeholder="pricing, signup, thank-you"
                      className="flex-1 px-3 py-2 bg-[#242829] border border-[#2A2E2E] rounded-lg text-xs text-white placeholder-st-gray focus:outline-none focus:border-st-lime/40"
                    />
                    <button
                      onClick={handleBuild}
                      disabled={!isValidFunnel || isFunnelLoading}
                      className="px-3 py-2 bg-st-lime text-st-black text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      Build
                    </button>
                  </div>
                  {!isValidFunnel && funnelInput.trim() !== '' && (
                    <p className="text-[11px] text-red-400">
                      Enter at least 2 page-path keywords to build a funnel.
                    </p>
                  )}
                  <p className="text-[10px] text-st-gray leading-normal">
                    Page-path funnels match URLs containing each keyword and follow visitors within the same session. They are based on pageviews, not conversion events or revenue.
                  </p>
                </div>

                {/* Step pills */}
                {funnelSteps.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 items-center pt-2 border-t border-[#2A2E2E]/60">
                    <span className="text-[10px] text-st-gray uppercase font-semibold">Active Steps:</span>
                    {funnelSteps.map((step, idx) => (
                      <span key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-[#242829] border border-[#2A2E2E] rounded-full text-xs text-white">
                        <span className="text-st-gray text-[10px]">{idx + 1}.</span>
                        <span className="truncate max-w-[100px]">{step}</span>
                        <button
                          onClick={() => handleRemoveStep(idx)}
                          className="text-st-gray hover:text-white hover:bg-white/10 rounded-full w-3.5 h-3.5 flex items-center justify-center text-[10px] transition-colors ml-0.5"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Chart/State viz */}
                <div className="pt-2">
                  <FunnelChart
                    steps={funnelData || []}
                    loading={isFunnelLoading}
                    hasSteps={funnelSteps.length > 0}
                    error={isFunnelError}
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sources tab list — renders dual-bars for channel/referrer/campaign/medium
function SourceTabList({ rows, tab, toggleFilter, isActive }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? rows : rows.slice(0, 8)
  const maxVisitors = useMemo(() => Math.max(1, ...rows.map(r => safeNumber(r.visitors, 0))), [rows])
  const maxRevenue  = useMemo(() => Math.max(1, ...rows.map(r => safeNumber(r.revenue, 0))), [rows])

  if (!rows || rows.length === 0) {
    if (tab === 'ai_source') {
      return (
        <div className="flex flex-col items-center justify-center text-center py-12 px-4 space-y-3">
          <div className="text-white font-semibold text-sm">No AI traffic detected yet</div>
          <p className="text-xs text-st-gray max-w-sm">
            When visitors arrive from ChatGPT, Claude, Perplexity, Gemini, or similar AI platforms, they’ll appear here.
          </p>
          <div className="flex items-center gap-2 pt-2">
            <a
              href="https://www.sourcetrack.ai/docs"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 bg-[#242829] border border-[#2A2E2E] text-st-gray hover:text-white text-xs font-medium rounded-lg transition-colors"
            >
              View install guide
            </a>
            <Link
              to="/report-builder"
              className="px-3 py-1.5 bg-st-lime text-st-black hover:opacity-90 text-xs font-semibold rounded-lg transition-opacity"
            >
              Create AI report
            </Link>
          </div>
        </div>
      )
    }
    return <p className="text-xs text-st-gray py-10 text-center">No {tab === 'ai_source' ? 'AI Sources' : tab} data yet</p>
  }

  // Channel tab uses channel-pill labels (label IS the channel)
  return (
    <>
      {visible.map((r, i) => (
        <DataRow
          key={i}
          label={r.name || 'Unknown'}
          visitors={r.visitors}
          revenue={r.revenue}
          maxVisitors={maxVisitors}
          maxRevenue={maxRevenue}
          channel={tab === 'channel' ? r.name : null}
          onClick={() => {
            // Filtering by channel/campaign/medium requires backend filter mapping —
            // for now we only emit click events for the referrer tab (which maps to Source) and AI sources.
            if (tab === 'referrer') toggleFilter('Source', r.name)
            else if (tab === 'ai_source') toggleFilter('AI Source', r.name)
          }}
          active={
            tab === 'referrer' ? isActive('Source', r.name) :
            tab === 'ai_source' ? isActive('AI Source', r.name) : false
          }
        />
      ))}
      {rows.length > 8 && (
        <button
          onClick={() => setShowAll(s => !s)}
          className="w-full py-2 text-xs text-st-gray hover:text-white border-t border-[#2A2E2E] transition-colors"
        >
          {showAll ? '↑ Show less' : `↓ Show all ${rows.length}`}
        </button>
      )}
    </>
  )
}
