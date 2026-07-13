import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, BarElement, BarController } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { fetchApi } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Eye, RefreshCw, Copy, Check, BarChart3, Globe } from 'lucide-react'
import { safeNumber } from '../utils/numbers'
import { limeAreaGradient } from '../utils/limeAreaGradient'
import { tooltipPlugin, CHART_COLORS } from '../utils/chartTooltip'
import { SourceIcon, normalizeSource } from '../components/SourceIcon'
import { useSite } from '../contexts/SiteContext'
import { useCountUp } from '../utils/useCountUp'
import QueryError from '../components/QueryError'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler, BarElement, BarController)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDuration(s) {
  const n = safeNumber(s, 0)
  if (n === 0) return '—'
  if (n < 60) return `${Math.round(n)}s`
  return `${Math.floor(n / 60)}m ${Math.round(n % 60)}s`
}
function stripOrigin(url = '') { return url.replace(/^https?:\/\/[^/]+/, '') || '/' }

// ─── Visitors-only bar row ────────────────────────────────────────────────────
// ─── Visitors/Revenue bar row ─────────────────────────────────────────────────
function DataRow({ label, count, max, icon, onClick, active, revenue, maxRevenue }) {
  const n = safeNumber(count, 0)
  const pctVis = max > 0 ? (n / max) * 100 : 0
  const rev = safeNumber(revenue, 0)
  const pctRev = maxRevenue > 0 ? (rev / maxRevenue) * 100 : 0
  const showRevenueBar = rev > 0

  return (
    <div
      onClick={onClick}
      className={`group relative flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-dark-border last:border-0 overflow-hidden transition-all duration-200 motion-reduce:transition-none ${
        onClick ? 'cursor-pointer hover:translate-x-0.5' : ''
      } ${active ? 'bg-st-lime/10' : 'hover:bg-gray-50/40 dark:hover:bg-dark-hover/40'}`}
    >
      {/* Visitors fill bar behind label */}
      <div
        className="absolute inset-y-0 left-0 pointer-events-none transition-all duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${pctVis.toFixed(1)}%`, backgroundColor: 'rgba(17, 24, 39, 0.07)' }}
      />
      {/* Revenue fill bar overlay behind label (Sources panel only) */}
      {showRevenueBar && (
        <div
          className="absolute inset-y-0 left-0 pointer-events-none transition-all duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${pctRev.toFixed(1)}%`, backgroundColor: 'rgba(200, 240, 0, 0.30)' }}
        />
      )}

      {/* Label and Icon */}
      <div className="relative flex items-center gap-3 min-w-0 z-10">
        {icon && <span className="flex-shrink-0 w-4 flex items-center justify-center">{icon}</span>}
        <span className="text-xs font-medium text-st-black dark:text-dark-primary truncate block">{label}</span>
      </div>

      {/* Right-aligned Stats & Hover Trigger */}
      <div className="relative flex items-center gap-4 z-10">
        <span className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 motion-reduce:transition-none flex items-center gap-2 text-[10px] font-bold text-st-gray dark:text-gray-400">
          <span>Attribution →</span>
          {rev > 0 && <span>Leads →</span>}
        </span>
        <span className="text-sm font-semibold text-st-black dark:text-dark-primary w-16 text-right flex-shrink-0 tabular-nums">
          {rev > 0 ? `$${Math.round(rev).toLocaleString()}` : n.toLocaleString()}
        </span>
      </div>
    </div>
  )
}





// ─── Main page ────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { user } = useAuth()
  const { activeSite } = useSite()
  const { theme } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const [days, setDays] = useState(30)
  const [filters, setFilters] = useState([])
  const [sourceTab, setSourceTab] = useState(
    ['referrer', 'medium', 'ai_source'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'referrer'
  )
  const [copied, setCopied] = useState(false)
  const [deviceTab, setDeviceTab] = useState('browser')

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

  const filterQuery = useMemo(
    () => filters.map(f => `&f=${encodeURIComponent(f.type + ':' + f.value)}`).join(''),
    [filters]
  )

  // ─── Summary ──────────────────────────────────────────────────────────────
  const { data: summary, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['analytics-summary', site?.site_key, days, 'daily', filters],
    queryFn: () => fetchApi(`/analytics/summary?site_key=${site.site_key}&days=${days}&granularity=daily${filterQuery}`),
    enabled: !!site?.site_key
  })

  const priorFrom = new Date(Date.now() - days * 2 * 86400000).toISOString().slice(0, 10)
  const priorTo   = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
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

  // ─── Sources ──────────────────────────────────────────────────────────────
  const { data: sourcesData } = useQuery({
    queryKey: ['analytics-sources', site?.site_key, days, sourceTab, filters],
    queryFn: () => fetchApi(`/analytics/sources?site_key=${site.site_key}&days=${days}&tab=${sourceTab}${filterQuery}`),
    enabled: !!site?.site_key
  })

  // ─── Entry/Exit ────────────────────────────────────────────────────────────
  const { data: entryExitData } = useQuery({
    queryKey: ['analytics-entry-exit', site?.site_key, days, filters],
    queryFn: () => fetchApi(`/analytics/entry-exit?site_key=${site.site_key}&days=${days}${filterQuery}`),
    enabled: !!site?.site_key
  })

  // ─── Browsers + OS ────────────────────────────────────────────────────────
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

  // ─── SEO Traffic (Search Console, traffic-only) ─────────────────────────────
  // GSC finalizes data on a 2-3 day lag, so bound the window at yesterday.
  const { data: seoTraffic } = useQuery({
    queryKey: ['analytics-seo-traffic', site?.site_key, days],
    queryFn: () => {
      const to = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
      return fetchApi(`/seo-revenue?site_key=${site.site_key}&from=${from}&to=${to}`, { skipBillingRedirect: true })
    },
    enabled: !!site?.site_key,
    retry: false
  })

  // ─── Shape data ────────────────────────────────────────────────────────────
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
  const ts           = d.timeseries || { labels: [], visitors: [] }

  // SEO Traffic surface only renders when GSC is connected AND a property is selected.
  const seoConnected = !!(seoTraffic?.gsc_connected && seoTraffic?.gsc_property_selected)
  const seoQueries   = seoTraffic?.queries || []

  const convCount  = safeNumber(kpis.conversion_count, 0)
  const convRate   = safeNumber(kpis.conversion_rate, 0)

  // ─── Delta calc ────────────────────────────────────────────────────────────
  function delta(current, prior, invertedIsGood = false) {
    const c = safeNumber(current, 0), p = safeNumber(prior, 0)
    if (p === 0) return null
    const pct = ((c - p) / Math.abs(p)) * 100
    const isGood = invertedIsGood ? pct < 0 : pct > 0
    return {
      pct: Math.abs(pct).toFixed(1),
      color: pct === 0 ? 'text-st-gray' : isGood ? 'text-green-400' : 'text-red-400',
      arrow: pct === 0 ? '·' : pct > 0 ? '▲' : '▼'
    }
  }

  // ─── Filter helpers ────────────────────────────────────────────────────────
  function toggleFilter(type, value) {
    setFilters(prev => {
      const exists = prev.find(f => f.type === type && f.value === value)
      if (exists) return prev.filter(f => !(f.type === type && f.value === value))
      return [...prev, { type, value }]
    })
  }
  function isActive(type, value) { return filters.some(f => f.type === type && f.value === value) }

  // ─── Visitors chart ───
  const rangeRevenue = useMemo(() => ts.revenue ? ts.revenue.reduce((a, b) => a + safeNumber(b, 0), 0) : 0, [ts.revenue])
  const hasRevenue = rangeRevenue > 0

  const chartData = useMemo(() => {
    const datasets = [
      {
        type: 'line',
        label: 'Visitors',
        data: ts.visitors || [],
        borderColor: 'rgba(17,24,39,1)',
        backgroundColor: 'rgba(17,24,39,0.05)',
        fill: false,
        tension: 0.4,
        pointRadius: 2,
        pointBackgroundColor: '#111827',
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#111827',
        pointHoverBorderColor: '#111827',
        yAxisID: 'y',
        order: 1
      }
    ]

    if (hasRevenue) {
      datasets.push({
        type: 'bar',
        label: 'Revenue',
        data: ts.revenue || [],
        backgroundColor: '#C8F000',
        hoverBackgroundColor: '#B8DE00',
        borderRadius: 4,
        yAxisID: 'y1',
        order: 2
      })
    }

    return {
      labels: ts.labels || [],
      datasets
    }
  }, [ts, hasRevenue])

  // Custom dual-axis tooltip: Revenue (if > 0) | Visitors | Revenue/visitor
  const visitorsTooltipRows = (i) => {
    const vis = safeNumber(ts.visitors?.[i], 0)
    const rev = safeNumber(ts.revenue?.[i], 0)
    const rows = []

    if (rev > 0) {
      rows.push({ label: 'Revenue', value: `$${Math.round(rev).toLocaleString()}` })
    }

    rows.push({ label: 'Visitors', value: vis.toLocaleString(), accent: true })

    if (rev > 0 && vis > 0) {
      const rpv = rev / vis
      rows.push({ label: 'Revenue/visitor', value: `$${rpv.toFixed(2)}` })
    }

    return rows
  }

  const chartOptions = useMemo(() => {
    const isDark = theme === 'dark'
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: tooltipPlugin(visitorsTooltipRows)
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: isDark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light, maxRotation: 0, maxTicksLimit: 8 }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: isDark ? CHART_COLORS.grid.dark : CHART_COLORS.grid.light },
          ticks: { color: isDark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light, precision: 0 }
        },
        y1: {
          type: 'linear',
          display: hasRevenue,
          position: 'right',
          grid: { display: false },
          ticks: {
            color: isDark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light,
            precision: 0,
            callback: (val) => `$${Math.round(val).toLocaleString()}`
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, ts, hasRevenue])

  // ─── Snippet ───────────────────────────────────────────────────────────────
  const trackerFile = site?.cookieless_mode ? 'tracker.cookieless.min.js' : 'tracker.min.js'
  const snippetUrl  = site
    ? `<script async src="${window.location.origin}/${trackerFile}" data-site-key="${site.site_key}"></script>`
    : ''
  function copySnippet() {
    navigator.clipboard.writeText(snippetUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const hasData = safeNumber(kpis.pageviews, 0) > 0
  const isPreview = activeSite?.support_preview || false

  if (!site) {
    if (isPreview) {
      return (
        <div className="st-container py-24 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-full bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border flex items-center justify-center mx-auto shadow-sm">
              <BarChart3 className="w-5 h-5 text-st-gray dark:text-gray-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-st-black dark:text-dark-primary mb-1">Analytics View Disabled</h2>
              <p className="text-xs text-st-gray/80 dark:text-gray-400/80 leading-relaxed">
                Analytics is not available in Support Preview. Use Dashboard and Attribution for read-only customer context.
              </p>
            </div>
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="st-container space-y-4">

      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-st-black dark:text-dark-primary">Analytics</h2>
          <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">Understand traffic before you dig into attribution.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg shadow-sm">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${liveCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-xs font-medium text-st-black dark:text-dark-primary tabular-nums">{liveCount}</span>
            <span className="text-xs text-st-gray dark:text-gray-400">live</span>
            <button onClick={() => refetchLive()} className="text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text ml-0.5 transition-colors">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg p-1 shadow-sm">
            {[{l:'24h',d:1},{l:'7d',d:7},{l:'30d',d:30},{l:'90d',d:90}].map(t => (
              <button key={t.d} onClick={() => setDays(t.d)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  days === t.d ? 'bg-st-lime text-st-black font-semibold' : 'text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text'
                }`}>
                {t.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Active filter pills ─────────────────────────────────────────── */}
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((f, i) => (
            <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-full text-xs text-st-black dark:text-dark-primary shadow-sm">
              <span className="text-st-gray dark:text-gray-400">{f.type}:</span> {f.value}
              <button onClick={() => toggleFilter(f.type, f.value)} className="text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text ml-1.5 leading-none text-sm font-semibold">×</button>
            </span>
          ))}
          {filters.length > 1 && (
            <button onClick={() => setFilters([])} className="text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text px-2 transition-colors">Clear all</button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-lime" />
        </div>
      ) : isError ? (
        <QueryError isError={isError} error={error} onRetry={refetch} />
      ) : !hasData ? (

        /* ─── Empty state ──────────────────────────────────────────────── */
        <div className="max-w-md mx-auto py-16 text-center space-y-6">
          <Eye className="w-10 h-10 text-st-gray/40 dark:text-gray-500/40 mx-auto" />
          <div>
            <h3 className="text-base font-semibold text-st-black dark:text-dark-primary mb-1">No pageviews yet</h3>
            <p className="text-sm text-st-gray dark:text-gray-400">Install the tracker to start collecting traffic data.</p>
          </div>
          <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-4 text-left space-y-3 shadow-sm">
            <p className="text-xs font-semibold text-st-black dark:text-dark-primary">Add to your site &lt;head&gt;:</p>
            <div className="flex items-start gap-2">
              <code className="text-[11px] text-st-gray dark:text-gray-300 flex-1 break-all leading-relaxed">{snippetUrl}</code>
              <button onClick={copySnippet} className="flex-shrink-0 p-1.5 text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text border border-gray-200 dark:border-dark-border rounded-lg transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-st-lime" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-st-gray dark:text-gray-400">Pageviews appear here once the tracker fires on your site. Conversions appear after your site sends conversion events.</p>
          </div>
        </div>

      ) : (
        <>
          {/* ─── KPIs Strip ────────────────────────────────────────────────── */}
          <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-dark-border overflow-hidden shadow-sm mb-4">
            {/* Revenue Hero KPI (only if revenue > 0) */}
            {hasRevenue && (
              <div className="flex-1 p-4 flex flex-col justify-between min-w-[150px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
                <div>
                  <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Revenue</p>
                  <p className="text-2xl sm:text-3xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">
                    {formattedRevenue}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  {delta(kpis.revenue, priorKpis.revenue) && (
                    <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-semibold leading-none shadow-sm ${
                      delta(kpis.revenue, priorKpis.revenue).arrow === '▲'
                        ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-100 dark:border-green-900/30'
                        : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-100 dark:border-red-900/20'
                    }`}>
                      {delta(kpis.revenue, priorKpis.revenue).arrow} {delta(kpis.revenue, priorKpis.revenue).pct}%
                    </span>
                  )}
                  <span className="text-[10px] text-st-gray dark:text-gray-400 font-medium">vs prior</span>
                </div>
              </div>
            )}

            {/* Visitors KPI */}
            <div className="flex-1 p-4 flex flex-col justify-between min-w-[120px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
              <div>
                <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Visitors</p>
                <p className="text-xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">
                  {animUniqueVisitors != null ? Math.round(animUniqueVisitors).toLocaleString() : '—'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {delta(kpis.unique_visitors, priorKpis.unique_visitors) && (
                  <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-semibold leading-none shadow-sm ${
                    delta(kpis.unique_visitors, priorKpis.unique_visitors).arrow === '▲'
                      ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-100 dark:border-green-900/30'
                      : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-100 dark:border-red-900/20'
                  }`}>
                    {delta(kpis.unique_visitors, priorKpis.unique_visitors).arrow} {delta(kpis.unique_visitors, priorKpis.unique_visitors).pct}%
                  </span>
                )}
                <span className="text-[10px] text-st-gray dark:text-gray-400 font-medium">vs prior</span>
              </div>
            </div>

            {/* Conversions KPI */}
            <div className="flex-1 p-4 flex flex-col justify-between min-w-[120px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
              <div>
                <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Conversions</p>
                <p className="text-xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">
                  {animConversions != null && animConversions > 0 ? Math.round(animConversions).toLocaleString() : '—'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {convCount > 0 && delta(kpis.conversion_count, priorKpis.conversion_count) ? (
                  <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-semibold leading-none shadow-sm ${
                    delta(kpis.conversion_count, priorKpis.conversion_count).arrow === '▲'
                      ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-100 dark:border-green-900/30'
                      : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-100 dark:border-red-900/20'
                  }`}>
                    {delta(kpis.conversion_count, priorKpis.conversion_count).arrow} {delta(kpis.conversion_count, priorKpis.conversion_count).pct}%
                  </span>
                ) : (
                  <p className="text-[10px] text-st-gray dark:text-gray-400 font-medium truncate">No conversion events yet</p>
                )}
              </div>
            </div>

            {/* Conv Rate KPI */}
            <div className="flex-1 p-4 flex flex-col justify-between min-w-[120px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
              <div>
                <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Conv Rate</p>
                <p className="text-xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">
                  {animConvRate != null && animConvRate > 0 ? `${animConvRate.toFixed(2)}%` : '—'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {convRate > 0 && delta(kpis.conversion_rate, priorKpis.conversion_rate) ? (
                  <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-semibold leading-none shadow-sm ${
                    delta(kpis.conversion_rate, priorKpis.conversion_rate).arrow === '▲'
                      ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-100 dark:border-green-900/30'
                      : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-100 dark:border-red-900/20'
                  }`}>
                    {delta(kpis.conversion_rate, priorKpis.conversion_rate).arrow} {delta(kpis.conversion_rate, priorKpis.conversion_rate).pct}%
                  </span>
                ) : (
                  <p className="text-[10px] text-st-gray dark:text-gray-400 font-medium truncate">Send events to track</p>
                )}
              </div>
            </div>

            {/* Revenue per Visitor KPI (only if revenue > 0) */}
            {hasRevenue && (
              <div className="flex-1 p-4 flex flex-col justify-between min-w-[120px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
                <div>
                  <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Rev/visitor</p>
                  <p className="text-xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">
                    {formattedRevenuePerVisitor}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className="text-[10px] text-st-gray dark:text-gray-400 font-medium">calculated</span>
                </div>
              </div>
            )}

            {/* Online Now KPI */}
            <div className="flex-1 p-4 flex flex-col justify-between min-w-[120px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
              <div>
                <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Online now</p>
                <p className="text-xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">
                  {liveCount.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <p className="text-[10px] text-st-gray dark:text-gray-400 font-medium truncate">refreshed every 30s</p>
              </div>
            </div>
          </div>

          {/* ─── Mixed Dual-Axis Chart ────────────────────────────────────── */}
          <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-4 shadow-sm mb-4">
            <p className="text-[11px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wide mb-3">Traffic & Revenue over time</p>
            <div style={{ height: 220 }}>
              {ts.labels && ts.labels.length > 0 ? (
                <Chart type="line" data={chartData} options={chartOptions} />
              ) : (
                <p className="text-xs text-st-gray dark:text-gray-400 text-center py-12">No time-series data yet</p>
              )}
            </div>
          </div>

          {/* ─── Contextual Handoff Strip ─────────────────────────────────── */}
          {hasRevenue && (
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-3 flex items-center justify-between text-xs text-st-gray dark:text-gray-400 mb-4 shadow-sm">
              <span>
                <strong className="text-st-black dark:text-dark-primary font-semibold">${Math.round(kpis.revenue).toLocaleString()}</strong> came from{' '}
                <strong className="text-st-black dark:text-dark-primary font-semibold">{kpis.conversion_count}</strong> conversions — which touchpoint earned it?
              </span>
              <div className="flex items-center gap-3">
                <a href="/attribution" className="font-semibold text-st-black dark:text-dark-primary hover:underline flex items-center gap-1">
                  Attribution →
                </a>
                <a href={`/leads?site_key=${site.site_key}`} className="font-semibold text-st-black dark:text-dark-primary hover:underline flex items-center gap-1">
                  {kpis.conversion_count} leads →
                </a>
              </div>
            </div>
          )}

          {/* ─── Redesigned 2x2 Panels Grid ───────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Card 1: Sources */}
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 motion-reduce:transition-none flex flex-col h-full">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-st-black dark:text-dark-primary">Sources</h3>
                <div className="flex gap-1">
                  {[
                    { key: 'referrer',  label: 'Referrer' },
                    { key: 'channel',   label: 'Channel' },
                    { key: 'ai_source', label: 'AI' },
                  ].map(tab => (
                    <button key={tab.key}
                      onClick={() => { setSourceTab(tab.key); setSearchParams({ tab: tab.key }) }}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors duration-150 motion-reduce:transition-none ${
                        sourceTab === tab.key ? 'bg-st-lime text-st-black' : 'text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text'
                      }`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <SourceTabList
                  rows={sourcesRows}
                  tab={sourceTab}
                  toggleFilter={toggleFilter}
                  isActive={isActive}
                />
              </div>
            </div>

            {/* Card 2: Locations (Country only, No Tabs) */}
            <ListSectionRedesign
              title="Locations"
              rows={topCountries}
              getLabel={r => r.country || 'Unknown'}
              getCount={r => r.visits}
              getIcon={r => countryFlagIcon(r.country)}
              onRowClick={r => toggleFilter('Country', r.country)}
              isRowActive={r => isActive('Country', r.country)}
              emptyText="No country data yet"
            />

            {/* Card 3: Pages (Page list only, No Tabs) */}
            <ListSectionRedesign
              title="Pages"
              rows={topPages}
              getLabel={r => stripOrigin(r.page)}
              getCount={r => r.views}
              onRowClick={r => toggleFilter('Page', stripOrigin(r.page))}
              isRowActive={r => isActive('Page', stripOrigin(r.page))}
              emptyText="No page data yet"
            />

            {/* Card 4: Devices */}
            <ListSectionRedesign
              title="Devices"
              rows={deviceRowsToRender}
              getLabel={getDeviceLabel}
              getCount={getDeviceCount}
              getIcon={getDeviceIcon}
              onRowClick={handleDeviceClick}
              isRowActive={getDeviceActive}
              emptyText={`No ${deviceTab} data yet`}
              tabs={[
                { key: 'browser', label: 'Browser' },
                { key: 'os',      label: 'OS' },
                { key: 'device',  label: 'Device' }
              ]}
              activeTab={deviceTab}
              onTabChange={setDeviceTab}
            />
          </div>

          {/* Helper container function for redesigned panels */}
          {(() => {
            // Define country flag helper locally to keep component pure
            function countryFlagIcon(code) {
              if (!code || code === 'Unknown') return null
              return (
                <img
                  src={`https://flagcdn.com/16x12/${code.toLowerCase()}.png`}
                  alt={code}
                  className="w-3.5 h-2.5 object-cover rounded-sm flex-shrink-0"
                  onError={(e) => e.target.style.display = 'none'}
                />
              )
            }

            // Define device logic variables
            const devicesRows = Object.entries(devices).sort((a,b) => safeNumber(b[1],0) - safeNumber(a[1],0)).map(([k,v]) => ({ device: k, count: v }))
            const deviceRowsToRender = deviceTab === 'browser' ? browsers : deviceTab === 'os' ? osList : devicesRows

            function getDeviceLabel(r) {
              if (deviceTab === 'browser') return r.browser
              if (deviceTab === 'os') return r.os
              return r.device.charAt(0).toUpperCase() + r.device.slice(1)
            }
            function getDeviceCount(r) {
              if (deviceTab === 'browser') return r.visitors
              if (deviceTab === 'os') return r.visitors
              return r.count
            }
            function getDeviceIcon(r) {
              if (deviceTab === 'browser') {
                const name = (r.browser || '').toLowerCase()
                if (name.includes('chrome')) return <SourceIcon source="chrome" className="w-3.5 h-3.5" />
                if (name.includes('firefox')) return <SourceIcon source="firefox" className="w-3.5 h-3.5" />
                if (name.includes('safari')) return <SourceIcon source="safari" className="w-3.5 h-3.5" />
                if (name.includes('edge')) return <SourceIcon source="edge" className="w-3.5 h-3.5" />
                return <Globe className="w-3.5 h-3.5 text-gray-400" />
              }
              return null
            }
            function getDeviceActive(r) {
              if (deviceTab === 'browser') return isActive('Browser', r.browser)
              if (deviceTab === 'os') return isActive('OS', r.os)
              return isActive('Device', r.device)
            }
            function handleDeviceClick(r) {
              if (deviceTab === 'browser') toggleFilter('Browser', r.browser)
              else if (deviceTab === 'os') toggleFilter('OS', r.os)
              else toggleFilter('Device', r.device)
            }

            // Return custom render block to inject the redesign ListSection helper
            window.__ListSectionRedesign = function ListSectionRedesign({ title, rows, getLabel, getCount, getIcon, onRowClick, isRowActive, emptyText, tabs, activeTab, onTabChange }) {
              const [showAll, setShowAll] = useState(false)
              const visible = showAll ? rows : rows.slice(0, 8)
              const max = useMemo(() => Math.max(1, ...rows.map(r => safeNumber(getCount(r), 0))), [rows, getCount])

              return (
                <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 motion-reduce:transition-none flex flex-col h-full">
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border flex items-center justify-between flex-wrap gap-2">
                    <h3 className="text-sm font-semibold text-st-black dark:text-dark-primary">{title}</h3>
                    {tabs && (
                      <div className="flex gap-1">
                        {tabs.map(tab => (
                          <button
                            key={tab.key}
                            onClick={() => onTabChange(tab.key)}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors duration-150 motion-reduce:transition-none ${
                              activeTab === tab.key
                                ? 'bg-st-lime text-st-black'
                                : 'text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    {rows.length === 0 ? (
                      <p className="text-xs text-st-gray dark:text-gray-400 py-10 text-center">{emptyText}</p>
                    ) : (
                      <div className="flex flex-col">
                        {visible.map((r, i) => (
                          <DataRow
                            key={i}
                            label={getLabel(r)}
                            count={getCount(r)}
                            max={max}
                            icon={getIcon ? getIcon(r) : null}
                            onClick={onRowClick ? () => onRowClick(r) : null}
                            active={isRowActive ? isRowActive(r) : false}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  {rows.length > 8 && (
                    <button
                      onClick={() => setShowAll(s => !s)}
                      className="w-full py-2 text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text border-t border-gray-100 dark:border-dark-border transition-colors duration-150 motion-reduce:transition-none"
                    >
                      {showAll ? '↑ Show less' : `↓ Show all ${rows.length}`}
                    </button>
                  )}
                </div>
              )
            }
            return null
          })()}

          {/* Render ListSectionRedesign wrapper */}
          {(() => {
            const countryFlagIcon = (code) => {
              if (!code || code === 'Unknown') return null
              return (
                <img
                  src={`https://flagcdn.com/16x12/${code.toLowerCase()}.png`}
                  alt={code}
                  className="w-3.5 h-2.5 object-cover rounded-sm flex-shrink-0"
                  onError={(e) => e.target.style.display = 'none'}
                />
              )
            }
            const devicesRows = Object.entries(devices).sort((a,b) => safeNumber(b[1],0) - safeNumber(a[1],0)).map(([k,v]) => ({ device: k, count: v }))
            const deviceRowsToRender = deviceTab === 'browser' ? browsers : deviceTab === 'os' ? osList : devicesRows

            const getDeviceLabel = (r) => {
              if (deviceTab === 'browser') return r.browser
              if (deviceTab === 'os') return r.os
              return r.device.charAt(0).toUpperCase() + r.device.slice(1)
            }
            const getDeviceCount = (r) => {
              if (deviceTab === 'browser') return r.visitors
              if (deviceTab === 'os') return r.visitors
              return r.count
            }
            const getDeviceIcon = (r) => {
              if (deviceTab === 'browser') {
                const name = (r.browser || '').toLowerCase()
                if (name.includes('chrome')) return <SourceIcon source="chrome" className="w-3.5 h-3.5" />
                if (name.includes('firefox')) return <SourceIcon source="firefox" className="w-3.5 h-3.5" />
                if (name.includes('safari')) return <SourceIcon source="safari" className="w-3.5 h-3.5" />
                if (name.includes('edge')) return <SourceIcon source="edge" className="w-3.5 h-3.5" />
                return <Globe className="w-3.5 h-3.5 text-gray-400" />
              }
              return null
            }
            const getDeviceActive = (r) => {
              if (deviceTab === 'browser') return isActive('Browser', r.browser)
              if (deviceTab === 'os') return isActive('OS', r.os)
              return isActive('Device', r.device)
            }
            const handleDeviceClick = (r) => {
              if (deviceTab === 'browser') toggleFilter('Browser', r.browser)
              else if (deviceTab === 'os') toggleFilter('OS', r.os)
              else toggleFilter('Device', r.device)
            }

            const L = window.__ListSectionRedesign
            if (!L) return null

            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Pages Card */}
                <L
                  title="Pages"
                  rows={topPages}
                  getLabel={r => stripOrigin(r.page)}
                  getCount={r => r.views}
                  onRowClick={r => toggleFilter('Page', stripOrigin(r.page))}
                  isRowActive={r => isActive('Page', stripOrigin(r.page))}
                  emptyText="No page data yet"
                />

                {/* Locations Card */}
                <L
                  title="Locations"
                  rows={topCountries}
                  getLabel={r => r.country || 'Unknown'}
                  getCount={r => r.visits}
                  getIcon={countryFlagIcon}
                  onRowClick={r => toggleFilter('Country', r.country)}
                  isRowActive={r => isActive('Country', r.country)}
                  emptyText="No country data yet"
                />

                {/* Devices Card */}
                <L
                  title="Devices"
                  rows={deviceRowsToRender}
                  getLabel={getDeviceLabel}
                  getCount={getDeviceCount}
                  getIcon={getDeviceIcon}
                  onRowClick={handleDeviceClick}
                  isRowActive={getDeviceActive}
                  emptyText={`No ${deviceTab} data yet`}
                  tabs={[
                    { key: 'browser', label: 'Browser' },
                    { key: 'os',      label: 'OS' },
                    { key: 'device',  label: 'Device' }
                  ]}
                  activeTab={deviceTab}
                  onTabChange={setDeviceTab}
                />
              </div>
            )
          })()}

          {/* ─── Conversions notice ───────────────────────────────────────── */}
          {convCount === 0 && (
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl px-4 py-4 flex items-start gap-3 shadow-sm mt-4">
              <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-st-gray dark:bg-gray-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-st-black dark:text-dark-primary">No conversions in this period</p>
                <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">
                  Conversions appear after your site sends conversion events. See the <a href="/developers/conversions" className="underline hover:text-st-black dark:hover:text-dark-text transition-colors">conversion events docs</a> for setup instructions.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Sources tab list ─────────────────────────────────────────────────────────
function SourceTabList({ rows, tab, toggleFilter, isActive }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? rows : rows.slice(0, 8)
  const max = useMemo(() => Math.max(1, ...(rows || []).map(r => safeNumber(r.visitors, 0))), [rows])
  const maxRevenue = useMemo(() => Math.max(1, ...(rows || []).map(r => safeNumber(r.revenue, 0))), [rows])

  if (!rows || rows.length === 0) {
    if (tab === 'ai_source') {
      return (
        <div className="text-center py-12 px-4 space-y-2">
          <p className="text-sm font-medium text-st-black dark:text-dark-primary">No AI traffic detected yet</p>
          <p className="text-xs text-st-gray dark:text-gray-400 max-w-sm mx-auto">
            When visitors arrive from ChatGPT, Claude, Perplexity, or other AI platforms, they'll appear here.
          </p>
        </div>
      )
    }
    return <p className="text-xs text-st-gray dark:text-gray-400 py-10 text-center">No {tab} data yet</p>
  }

  return (
    <>
      {visible.map((r, i) => (
        <DataRow
          key={i}
          label={normalizeSource(r.name || '').name}
          count={r.visitors}
          max={max}
          revenue={r.revenue}
          maxRevenue={maxRevenue}
          icon={<SourceIcon source={r.name || ''} className="w-3.5 h-3.5" />}
          onClick={() => {
            if (tab === 'referrer')  toggleFilter('Source', r.name)
            if (tab === 'ai_source') toggleFilter('AI Source', r.name)
            if (tab === 'channel')   toggleFilter('Channel', r.name)
          }}
          active={
            tab === 'referrer'  ? isActive('Source', r.name) :
            tab === 'ai_source' ? isActive('AI Source', r.name) :
            tab === 'channel'   ? isActive('Channel', r.name) : false
          }
        />
      ))}
      {rows.length > 8 && (
        <button
          onClick={() => setShowAll(s => !s)}
          className="w-full py-2 text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text border-t border-gray-100 dark:border-dark-border transition-colors"
        >
          {showAll ? '↑ Show less' : `↓ Show all ${rows.length}`}
        </button>
      )}
    </>
  )
}
