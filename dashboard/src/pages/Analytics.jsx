import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Filler } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { fetchApi } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Eye, RefreshCw, Copy, Check, BarChart3, Globe, Monitor } from 'lucide-react'
import { safeNumber } from '../utils/numbers'
import { tooltipPlugin, CHART_COLORS } from '../utils/chartTooltip'
import { SourceIcon, normalizeSource } from '../components/SourceIcon'
import { useSite } from '../contexts/SiteContext'
import { useCountUp } from '../utils/useCountUp'
import QueryError from '../components/QueryError'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Filler)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stripOrigin(url = '') { return url.replace(/^https?:\/\/[^/]+/, '') || '/' }

// Money is EXACT — always 2 decimals, never rounded (§5.2: $999.99 is not "$1,000").
function fmtMoney(n) { return '$' + safeNumber(n, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

// Lime vertical fill under the visitors line: 18% at the line fading to transparent at
// the bottom. A Chart.js scriptable backgroundColor (needs chartArea, so it's a function).
function visitorAreaGradient(ctx) {
  const chart = ctx.chart
  const area = chart.chartArea
  if (!area) return 'rgba(200,240,63,0.10)' // pre-layout first paint
  const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom)
  g.addColorStop(0, 'rgba(200,240,63,0.18)')
  g.addColorStop(1, 'rgba(200,240,63,0)')
  return g
}

// Emoji flag from an ISO-3166 alpha-2 code (regional indicators). NO network.
function flagEmoji(code) {
  if (!code || !/^[a-zA-Z]{2}$/.test(code)) return null
  const cp = [...code.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...cp)
}
// Country NAME from an ISO code via Intl.DisplayNames (built-in, NO network).
const REGION_NAMES = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }) } catch { return null } })()
function countryName(code) {
  if (!code || code === 'Unknown') return 'Unknown'
  try { return (REGION_NAMES && REGION_NAMES.of(String(code).toUpperCase())) || code } catch { return code }
}
// Title Case a raw DB value; proper-cased overrides for names that aren't simple words.
const PROPER = { ios: 'iOS', ipados: 'iPadOS', macos: 'macOS', 'mac os': 'macOS', 'chrome os': 'ChromeOS', chromeos: 'ChromeOS' }
function titleCase(s = '') {
  return String(s).trim().split(/\s+/).map(w => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(' ')
}
function properName(s = '') { const k = String(s).toLowerCase().trim(); return PROPER[k] || titleCase(s) || 'Unknown' }
// Favicon-by-domain with a NEUTRAL-DOT fallback (never a globe). SourceIcon resolves SVG
// brand logos by key and can't resolve arbitrary domains or OS names, so Pages (the site
// favicon) and Devices (per-browser / per-OS brand) use the favicon service — the same
// approach the page already used for the site favicon, consolidated into one helper.
function BrandFavicon({ domain, className = 'w-3.5 h-3.5' }) {
  const [failed, setFailed] = useState(false)
  if (!domain || failed) {
    return <span className="inline-block rounded-full bg-st-gray/40 dark:bg-gray-500/50" style={{ width: 7, height: 7 }} aria-hidden="true" />
  }
  return <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`} alt="" className={`${className} rounded-sm`} onError={() => setFailed(true)} />
}
// Map a raw browser/OS name to the brand's domain (whose favicon we resolve).
const BROWSER_DOMAIN = {
  chrome: 'google.com', 'google chrome': 'google.com', safari: 'apple.com', 'mobile safari': 'apple.com',
  edge: 'microsoft.com', 'microsoft edge': 'microsoft.com', firefox: 'mozilla.org', 'mozilla firefox': 'mozilla.org',
  opera: 'opera.com', brave: 'brave.com', samsung: 'samsung.com', 'samsung internet': 'samsung.com', yandex: 'yandex.com',
}
const OS_DOMAIN = {
  windows: 'microsoft.com', macos: 'apple.com', 'mac os': 'apple.com', ios: 'apple.com', ipados: 'apple.com',
  android: 'android.com', 'chrome os': 'google.com', chromeos: 'google.com', linux: null,
}
function browserDomain(name = '') { return BROWSER_DOMAIN[String(name).toLowerCase().trim()] || null }
function osDomain(name = '') { return OS_DOMAIN[String(name).toLowerCase().trim()] || null }

// ─── Bar-behind-label row (visitors bar; optional revenue accent bar) ──────────
function DataRow({ label, count, max, icon, onClick, active, revenue, maxRevenue }) {
  const n = safeNumber(count, 0)
  const pct = max > 0 ? (n / max) * 100 : 0
  const rev = safeNumber(revenue, 0)
  const revPct = maxRevenue > 0 ? (rev / maxRevenue) * 100 : 0
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-dark-border last:border-0 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${active ? 'bg-st-lime/5' : 'hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
    >
      {icon && <span className="flex-shrink-0 w-4 flex items-center justify-center">{icon}</span>}
      <div className="flex-1 min-w-0">
        <span className="text-xs truncate text-st-black dark:text-dark-primary block">{label}</span>
        <div style={{ height: '2px', width: `${pct.toFixed(1)}%`, background: 'rgba(204,240,63,0.6)', borderRadius: '1px', marginTop: '3px' }} />
        {rev > 0 && (
          <div style={{ height: '2px', width: `${revPct.toFixed(1)}%`, background: '#C8F000', borderRadius: '1px', marginTop: '2px' }} />
        )}
      </div>
      <div className="flex-shrink-0 text-right w-20">
        <span className="text-sm font-medium text-st-black dark:text-dark-primary tabular-nums block">{n.toLocaleString()}</span>
        {rev > 0 && <span className="text-[10px] text-st-gray dark:text-gray-400 tabular-nums">{fmtMoney(rev)}</span>}
      </div>
    </div>
  )
}

// ─── Section card (optional internal tabs) ─────────────────────────────────────
function ListSection({ title, rows, getLabel, getCount, getIcon, onRowClick, isRowActive, emptyText = 'No data yet', tabs, activeTab, onTabChange }) {
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
              <button key={tab.key} onClick={() => onTabChange(tab.key)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors duration-150 motion-reduce:transition-none ${
                  activeTab === tab.key ? 'bg-st-lime text-st-black' : 'text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text'
                }`}>
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
          visible.map((r, i) => (
            <DataRow
              key={i}
              label={getLabel(r)}
              count={getCount(r)}
              max={max}
              icon={getIcon ? getIcon(r) : null}
              onClick={onRowClick ? () => onRowClick(r) : null}
              active={isRowActive ? isRowActive(r) : false}
            />
          ))
        )}
      </div>
      {rows.length > 8 && (
        <button onClick={() => setShowAll(s => !s)}
          className="w-full py-2 text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text border-t border-gray-100 dark:border-dark-border transition-colors duration-150 motion-reduce:transition-none">
          {showAll ? '↑ Show less' : `↓ Show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}

// ─── Sources tab list (revenue-aware rows) ─────────────────────────────────────
function SourceTabList({ rows, tab, toggleFilter, isActive, faviconEl }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? rows : rows.slice(0, 8)
  const max = useMemo(() => Math.max(1, ...(rows || []).map(r => safeNumber(r.visitors, 0))), [rows])
  const maxRevenue = useMemo(() => Math.max(1, ...(rows || []).map(r => safeNumber(r.revenue, 0))), [rows])

  if (!rows || rows.length === 0) {
    if (tab === 'ai_source') {
      return (
        <div className="text-center py-12 px-4 space-y-2">
          <p className="text-sm font-medium text-st-black dark:text-dark-primary">No AI traffic detected yet</p>
          <p className="text-xs text-st-gray dark:text-gray-400 max-w-sm mx-auto">When visitors arrive from ChatGPT, Claude, Perplexity, or other AI platforms, they'll appear here.</p>
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
            if (tab === 'referrer') toggleFilter('Source', r.name)
            if (tab === 'ai_source') toggleFilter('AI Source', r.name)
            if (tab === 'channel') toggleFilter('Channel', r.name)
          }}
          active={
            tab === 'referrer' ? isActive('Source', r.name) :
            tab === 'ai_source' ? isActive('AI Source', r.name) :
            tab === 'channel' ? isActive('Channel', r.name) : false
          }
        />
      ))}
      {rows.length > 8 && (
        <button onClick={() => setShowAll(s => !s)}
          className="w-full py-2 text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text border-t border-gray-100 dark:border-dark-border transition-colors">
          {showAll ? '↑ Show less' : `↓ Show all ${rows.length}`}
        </button>
      )}
    </>
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
    ['referrer', 'channel', 'ai_source'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'referrer'
  )
  const [deviceTab, setDeviceTab] = useState('browser')
  const [copied, setCopied] = useState(false)

  const filterQuery = filters.length ? '&' + filters.map(f => `f=${encodeURIComponent(`${f.type}:${f.value}`)}`).join('&') : ''

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

  // ─── Summary ─────────────────────────────────────────────────────────────────
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

  const { data: liveData, refetch: refetchLive } = useQuery({
    queryKey: ['analytics-live', site?.site_key],
    queryFn: () => fetchApi(`/live?site_key=${site.site_key}`),
    enabled: !!site?.site_key,
    refetchInterval: 30000
  })

  const { data: sourcesData } = useQuery({
    queryKey: ['analytics-sources', site?.site_key, days, sourceTab, filters],
    queryFn: () => fetchApi(`/analytics/sources?site_key=${site.site_key}&days=${days}&tab=${sourceTab}${filterQuery}`),
    enabled: !!site?.site_key
  })

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

  // ─── Shape data (data layer unchanged; entryExitData intentionally unused —
  //     Entry/Exit panels removed, query kept byte-identical per the brief) ──────
  const d            = summary || {}
  const kpis         = d.kpis || {}
  const priorKpis    = (priorSummary || {}).kpis || {}
  const topPages     = d.top_pages || []
  const devices      = d.devices || {}
  const topCountries = d.top_countries || []
  const liveCount    = safeNumber(liveData?.live_visitors, 0)
  const browsers     = browserData || []
  const osList       = osData || []
  const sourcesRows  = sourcesData?.rows || []
  const ts           = d.timeseries || { labels: [], visitors: [] }

  const convCount = safeNumber(kpis.conversion_count, 0)
  const convRate  = safeNumber(kpis.conversion_rate, 0)

  const hasData    = safeNumber(kpis.pageviews, 0) > 0
  const rangeRevenue = useMemo(() => (ts.revenue ? ts.revenue.reduce((a, b) => a + safeNumber(b, 0), 0) : 0), [ts.revenue])
  const hasRevenue = safeNumber(kpis.total_revenue, 0) > 0 || rangeRevenue > 0

  // Revenue reads the SAME field the Sources panel / chart use: the backend puts revenue at
  // kpis.total_revenue + kpis.revenue_per_visitor (analytics.js:386/389), NOT kpis.revenue.
  // Exact money, never rounded.
  const totalRevenue = safeNumber(kpis.total_revenue, 0)
  const uniqVis = safeNumber(kpis.unique_visitors, 0)
  const formattedRevenue = fmtMoney(totalRevenue)
  const formattedRevenuePerVisitor = fmtMoney(kpis.revenue_per_visitor != null ? kpis.revenue_per_visitor : (uniqVis > 0 ? totalRevenue / uniqVis : 0))

  // Animated KPI counters (hooks — unconditional, before any early return).
  const animUniqueVisitors = useCountUp(kpis.unique_visitors ?? null)
  const animConversions    = useCountUp(kpis.conversion_count ?? null)
  const animConvRate       = useCountUp(kpis.conversion_rate ?? null)

  // ─── Delta calc ────────────────────────────────────────────────────────────
  function delta(current, prior) {
    const c = safeNumber(current, 0), p = safeNumber(prior, 0)
    if (p === 0) return null
    const pct = ((c - p) / Math.abs(p)) * 100
    return { pct: Math.abs(pct).toFixed(1), arrow: pct === 0 ? '·' : pct > 0 ? '▲' : '▼' }
  }
  function DeltaBadge({ d }) {
    if (!d) return null
    const up = d.arrow === '▲'
    return (
      <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-semibold leading-none shadow-sm ${
        up ? 'bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-100 dark:border-green-900/30'
           : 'bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-100 dark:border-red-900/20'
      }`}>{d.arrow} {d.pct}%</span>
    )
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

  // ─── Dual-axis chart: dark visitors LINE (left) + lime revenue BARS (right) ──
  const chartData = useMemo(() => {
    const datasets = [{
      type: 'line', label: 'Visitors', data: ts.visitors || [],
      borderColor: 'rgba(17,24,39,1)', backgroundColor: visitorAreaGradient, fill: true,
      tension: 0.4, pointRadius: 2, pointBackgroundColor: '#111827', pointHoverRadius: 5, yAxisID: 'y', order: 2
    }]
    if (hasRevenue) {
      datasets.push({
        type: 'bar', label: 'Revenue', data: ts.revenue || [],
        backgroundColor: '#C8F000', hoverBackgroundColor: '#B8DE00', borderRadius: 4, yAxisID: 'y1', order: 1
      })
    }
    return { labels: ts.labels || [], datasets }
  }, [ts, hasRevenue])

  const visitorsTooltipRows = (i) => {
    const vis = safeNumber(ts.visitors?.[i], 0)
    const rev = safeNumber(ts.revenue?.[i], 0)
    const rows = []
    if (rev > 0) rows.push({ label: 'Revenue', value: fmtMoney(rev) })
    rows.push({ label: 'Visitors', value: vis.toLocaleString(), accent: true })
    if (rev > 0 && vis > 0) rows.push({ label: 'Revenue/visitor', value: `$${(rev / vis).toFixed(2)}` })
    return rows
  }

  const chartOptions = useMemo(() => {
    const isDark = theme === 'dark'
    return {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: tooltipPlugin(visitorsTooltipRows) },
      scales: {
        x: { grid: { display: false }, ticks: { color: isDark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light, maxRotation: 0, maxTicksLimit: 8 } },
        y: { type: 'linear', position: 'left', grid: { color: isDark ? CHART_COLORS.grid.dark : CHART_COLORS.grid.light }, ticks: { color: isDark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light, precision: 0 } },
        y1: { type: 'linear', position: 'right', display: hasRevenue, grid: { display: false }, ticks: { color: isDark ? CHART_COLORS.tick.dark : CHART_COLORS.tick.light, precision: 0, callback: (v) => `$${Math.round(v).toLocaleString()}` } }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, ts, hasRevenue])

  // ─── Snippet ───────────────────────────────────────────────────────────────
  const trackerFile = site?.cookieless_mode ? 'tracker.cookieless.min.js' : 'tracker.min.js'
  const snippetUrl  = site ? `<script async src="${window.location.origin}/${trackerFile}" data-site-key="${site.site_key}"></script>` : ''
  function copySnippet() { navigator.clipboard.writeText(snippetUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  // ─── Icon builders (reuse SourceIcon; flags/OS need no brand resolver) ───────
  // Pages: the SITE's own favicon on every row (one site, one favicon), dot fallback.
  const siteFavicon = <BrandFavicon domain={site?.domain} />
  function countryFlagIcon(code) {
    const flag = flagEmoji(code)
    return flag ? <span className="text-sm leading-none">{flag}</span> : <Globe className="w-3.5 h-3.5 text-st-gray dark:text-gray-400" />
  }

  // ─── Devices tab plumbing ────────────────────────────────────────────────────
  const deviceRows = deviceTab === 'browser' ? browsers
    : deviceTab === 'os' ? osList
    : Object.entries(devices).sort((a, b) => safeNumber(b[1], 0) - safeNumber(a[1], 0)).map(([k, v]) => ({ device: k, count: v }))
  const getDeviceLabel = (r) => deviceTab === 'browser' ? properName(r.browser) : deviceTab === 'os' ? properName(r.os) : properName(r.device)
  const getDeviceCount = (r) => deviceTab === 'device' ? r.count : r.visitors
  const getDeviceIcon = (r) => deviceTab === 'browser'
    ? <BrandFavicon domain={browserDomain(r.browser)} />
    : deviceTab === 'os' ? <BrandFavicon domain={osDomain(r.os)} /> : <Monitor className="w-3.5 h-3.5 text-st-gray dark:text-gray-400" />
  const onDeviceClick = (r) => deviceTab === 'browser' ? toggleFilter('Browser', r.browser) : deviceTab === 'os' ? toggleFilter('OS', r.os) : toggleFilter('Device', r.device)
  const isDeviceActive = (r) => deviceTab === 'browser' ? isActive('Browser', r.browser) : deviceTab === 'os' ? isActive('OS', r.os) : isActive('Device', r.device)

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
              <p className="text-xs text-st-gray/80 dark:text-gray-400/80 leading-relaxed">Analytics is not available in Support Preview. Use Dashboard and Attribution for read-only customer context.</p>
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
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${liveCount > 0 ? 'bg-green-500 animate-pulse motion-reduce:animate-none' : 'bg-gray-600'}`} />
            <span className="text-xs font-medium text-st-black dark:text-dark-primary tabular-nums">{liveCount}</span>
            <span className="text-xs text-st-gray dark:text-gray-400">live</span>
            <button onClick={() => refetchLive()} className="text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text ml-0.5 transition-colors">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg p-1 shadow-sm">
            {[{ l: '24h', d: 1 }, { l: '7d', d: 7 }, { l: '30d', d: 30 }, { l: '90d', d: 90 }].map(t => (
              <button key={t.d} onClick={() => setDays(t.d)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${days === t.d ? 'bg-st-lime text-st-black font-semibold' : 'text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text'}`}>
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
        <div className="flex items-center justify-center py-20"><div className="animate-spin motion-reduce:animate-none rounded-full h-8 w-8 border-b-2 border-st-lime" /></div>
      ) : isError ? (
        <QueryError isError={isError} error={error} onRetry={refetch} />
      ) : !hasData ? (
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
          </div>
        </div>
      ) : (
        <>
          {/* ─── KPI strip (Revenue first + largest; Avg-duration removed) ──── */}
          <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-gray-100 dark:divide-dark-border overflow-hidden shadow-sm">
            {hasRevenue && (
              <div className="flex-1 p-4 flex flex-col justify-between min-w-[150px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
                <div>
                  <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Revenue</p>
                  <p className="text-2xl sm:text-3xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">{formattedRevenue}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <DeltaBadge d={delta(kpis.total_revenue, priorKpis.total_revenue)} />
                  <span className="text-[10px] text-st-gray dark:text-gray-400 font-medium">vs prior</span>
                </div>
              </div>
            )}
            <div className="flex-1 p-4 flex flex-col justify-between min-w-[120px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
              <div>
                <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Visitors</p>
                <p className="text-xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">{animUniqueVisitors != null ? Math.round(animUniqueVisitors).toLocaleString() : '—'}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <DeltaBadge d={delta(kpis.unique_visitors, priorKpis.unique_visitors)} />
                <span className="text-[10px] text-st-gray dark:text-gray-400 font-medium">vs prior</span>
              </div>
            </div>
            <div className="flex-1 p-4 flex flex-col justify-between min-w-[120px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
              <div>
                <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Conversions</p>
                <p className="text-xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">{animConversions != null && animConversions > 0 ? Math.round(animConversions).toLocaleString() : '—'}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {convCount > 0 ? <DeltaBadge d={delta(kpis.conversion_count, priorKpis.conversion_count)} /> : <p className="text-[10px] text-st-gray dark:text-gray-400 font-medium truncate">No conversion events yet</p>}
              </div>
            </div>
            <div className="flex-1 p-4 flex flex-col justify-between min-w-[120px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
              <div>
                <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Conv Rate</p>
                <p className="text-xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">{animConvRate != null && animConvRate > 0 ? `${animConvRate.toFixed(2)}%` : '—'}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                {convRate > 0 ? <DeltaBadge d={delta(kpis.conversion_rate, priorKpis.conversion_rate)} /> : <p className="text-[10px] text-st-gray dark:text-gray-400 font-medium truncate">Send events to track</p>}
              </div>
            </div>
            {hasRevenue && (
              <div className="flex-1 p-4 flex flex-col justify-between min-w-[120px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
                <div>
                  <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Rev/visitor</p>
                  <p className="text-xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">{formattedRevenuePerVisitor}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-2"><span className="text-[10px] text-st-gray dark:text-gray-400 font-medium">calculated</span></div>
              </div>
            )}
            <div className="flex-1 p-4 flex flex-col justify-between min-w-[120px] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none">
              <div>
                <p className="text-[10px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wider mb-1">Online now</p>
                <p className="text-xl font-bold text-st-black dark:text-dark-primary tabular-nums tracking-tight">{liveCount.toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mt-2"><p className="text-[10px] text-st-gray dark:text-gray-400 font-medium truncate">refreshed every 30s</p></div>
            </div>
          </div>

          {/* ─── Dual-axis chart ─────────────────────────────────────────── */}
          <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wide mb-3">{hasRevenue ? 'Traffic & Revenue over time' : 'Visitors over time'}</p>
            <div style={{ height: 220 }}>
              {ts.labels && ts.labels.length > 0 ? <Chart type="line" data={chartData} options={chartOptions} /> : <p className="text-xs text-st-gray dark:text-gray-400 text-center py-12">No time-series data yet</p>}
            </div>
          </div>

          {/* ─── Contextual handoff (only when revenue exists) ───────────── */}
          {hasRevenue && (
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-3 flex items-center justify-between flex-wrap gap-2 text-xs text-st-gray dark:text-gray-400 shadow-sm">
              <span>
                <strong className="text-st-black dark:text-dark-primary font-semibold">{formattedRevenue}</strong> from{' '}
                <strong className="text-st-black dark:text-dark-primary font-semibold">{convCount}</strong> conversions — which touchpoint earned it?
              </span>
              <div className="flex items-center gap-3">
                <a href="/app/attribution" className="font-semibold text-st-black dark:text-dark-primary hover:underline">Attribution →</a>
                <a href={`/leads?site_key=${site.site_key}`} className="font-semibold text-st-black dark:text-dark-primary hover:underline">{convCount} leads →</a>
              </div>
            </div>
          )}

          {/* ─── Panels: Sources / Pages / Locations / Devices ───────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Sources (internal tabs) */}
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 motion-reduce:transition-none flex flex-col h-full">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-st-black dark:text-dark-primary">Sources</h3>
                <div className="flex gap-1">
                  {[{ key: 'referrer', label: 'Referrer' }, { key: 'channel', label: 'Channel' }, { key: 'ai_source', label: 'AI' }].map(tab => (
                    <button key={tab.key} onClick={() => { setSourceTab(tab.key); setSearchParams({ tab: tab.key }) }}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors duration-150 motion-reduce:transition-none ${sourceTab === tab.key ? 'bg-st-lime text-st-black' : 'text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text'}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1"><SourceTabList rows={sourcesRows} tab={sourceTab} toggleFilter={toggleFilter} isActive={isActive} /></div>
            </div>

            {/* Pages (site favicon per row) */}
            <ListSection
              title="Pages"
              rows={topPages}
              getLabel={r => stripOrigin(r.page)}
              getCount={r => r.views}
              getIcon={() => siteFavicon}
              onRowClick={r => toggleFilter('Page', stripOrigin(r.page))}
              isRowActive={r => isActive('Page', stripOrigin(r.page))}
              emptyText="No page data yet"
            />

            {/* Locations (emoji flag + country name) */}
            <ListSection
              title="Locations"
              rows={topCountries}
              getLabel={r => countryName(r.country)}
              getCount={r => r.visits}
              getIcon={r => countryFlagIcon(r.country)}
              onRowClick={r => toggleFilter('Country', r.country)}
              isRowActive={r => isActive('Country', r.country)}
              emptyText="No country data yet"
            />

            {/* Devices (Browser / OS / Device tabs; icons + Title Case) */}
            <ListSection
              title="Devices"
              rows={deviceRows}
              getLabel={getDeviceLabel}
              getCount={getDeviceCount}
              getIcon={getDeviceIcon}
              onRowClick={onDeviceClick}
              isRowActive={isDeviceActive}
              emptyText={`No ${deviceTab} data yet`}
              tabs={[{ key: 'browser', label: 'Browser' }, { key: 'os', label: 'OS' }, { key: 'device', label: 'Device' }]}
              activeTab={deviceTab}
              onTabChange={setDeviceTab}
            />
          </div>

          {/* ─── Conversions notice ───────────────────────────────────────── */}
          {convCount === 0 && (
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl px-4 py-4 flex items-start gap-3 shadow-sm">
              <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-st-gray dark:bg-gray-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-st-black dark:text-dark-primary">No conversions in this period</p>
                <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">Conversions appear after your site sends conversion events.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
