import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Filler } from 'chart.js'
import { Chart } from 'react-chartjs-2'
import { fetchApi } from '../lib/api'
import { useTheme } from '../contexts/ThemeContext'
// Target is the goals empty-state icon. None of the already-imported icons is a target/crosshair,
// and this is a named import from a dependency the file already pulls in — not a new dependency.
import { Eye, RefreshCw, Copy, Check, BarChart3, Globe, Monitor, Target } from 'lucide-react'
import { safeNumber, fmtMoney } from '../utils/numbers'
import { flagEmoji, countryName } from '../utils/country'
import DataRow from '../components/DataRow'
import { tooltipPlugin, CHART_COLORS } from '../utils/chartTooltip'
import { SourceIcon, normalizeSource } from '../components/SourceIcon'
import { useActiveSite } from '../hooks/useActiveSite'
import { readStoredTimeRange, persistTimeRange } from '../hooks/useDashboardData'
import { LIVE_FEED_POLL_MS } from '../lib/liveFeed'
import { useCountUp } from '../utils/useCountUp'
import QueryError from '../components/QueryError'
import FunnelChart from '../components/FunnelChart'
import SparseReadings from '../components/SparseReadings'
import { honestLineStyle, hasEnoughPointsForChart, readingsCaption, formatShortDay } from '../utils/chartHonesty'
import { hasFeature } from '../lib/planFeatures'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Filler)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function stripOrigin(url = '') { return url.replace(/^https?:\/\/[^/]+/, '') || '/' }

// fmtMoney (§5.2 exact money) moved VERBATIM to utils/numbers.js — imported above, same behavior.

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

// flagEmoji / countryName moved VERBATIM to utils/country.js (imported above) so the Leads table
// renders locations through the same implementation instead of a second copy.
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
// Keys are the lowercased browser name as ua-parser-js reports it (see enrich()
// in api/routes/track.js, which stores getBrowser().name lowercased) — so
// 'mobile safari' and 'ucbrowser' are the real values, NOT 'uc browser'.
//
// Pick the mark of the BROWSER, not of the company that makes it. firefox was pointed at
// mozilla.org, whose favicon is the Mozilla foundation's green "m:3" wordmark, not the
// Firefox flame — at the 14px this renders at, that reads as a plain green dot, which is
// exactly how it was reported. chrome had the same shape of bug: google.com serves the
// Google "G", the search mark, not the Chrome wheel.
//
// A value may therefore be a PATH, not just a host — s2 resolves the favicon of that page's
// site section, so 'google.com/chrome' yields the wheel where 'google.com' yields the G.
// encodeURIComponent escapes the slash and the service handles it (verified end to end).
// Do not "tidy" these back to bare hosts.
//
// safari and silk keep a vendor mark on purpose: Apple has no Safari-specific domain and
// Amazon none for Silk, and a recognizable vendor logo beats the neutral dot.
const BROWSER_DOMAIN = {
  chrome: 'google.com/chrome', 'google chrome': 'google.com/chrome', safari: 'apple.com', 'mobile safari': 'apple.com',
  edge: 'microsoft.com', 'microsoft edge': 'microsoft.com', firefox: 'firefox.com', 'mozilla firefox': 'firefox.com',
  opera: 'opera.com', brave: 'brave.com', samsung: 'samsung.com', 'samsung internet': 'samsung.com', yandex: 'yandex.com',
  ucbrowser: 'ucweb.com', 'uc browser': 'ucweb.com',
  vivaldi: 'vivaldi.com', duckduckgo: 'duckduckgo.com', chromium: 'chromium.org',
  puffin: 'puffin.com', silk: 'amazon.com', waterfox: 'waterfox.net',
}
const OS_DOMAIN = {
  windows: 'microsoft.com', macos: 'apple.com', 'mac os': 'apple.com', ios: 'apple.com', ipados: 'apple.com',
  android: 'android.com', 'chrome os': 'google.com', chromeos: 'google.com', linux: null,
}
function browserDomain(name = '') { return BROWSER_DOMAIN[String(name).toLowerCase().trim()] || null }
function osDomain(name = '') { return OS_DOMAIN[String(name).toLowerCase().trim()] || null }

// DataRow moved VERBATIM to components/DataRow.jsx (imported above) so the Dashboard's
// Top Sources / AI Source Performance panels render through the same row, not a second copy.

// ─── Section card (optional internal tabs) ─────────────────────────────────────
// `subtitle`, `loading`, `emptyState`, `getRevenue` and `getRate` are all OPTIONAL and additive —
// every pre-existing call site omits them and renders byte-identically. Added so the Goals card can
// reuse this exact card/row treatment instead of hand-rolling a second one (the drift that made the
// Dashboard and Analytics read as different products in the first place).
function ListSection({ title, subtitle, rows, getLabel, getCount, getIcon, onRowClick, isRowActive, emptyText = 'No data yet', emptyState, loading = false, getRevenue, getRate, tabs, activeTab, onTabChange }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? rows : rows.slice(0, 8)
  const max = useMemo(() => Math.max(1, ...rows.map(r => safeNumber(getCount(r), 0))), [rows, getCount])
  const maxRevenue = useMemo(
    () => (getRevenue ? Math.max(0, ...rows.map(r => safeNumber(getRevenue(r), 0))) : 0),
    [rows, getRevenue]
  )
  return (
    <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200 motion-reduce:transition-none flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-st-black dark:text-dark-primary">{title}</h3>
          {subtitle && <p className="text-[11px] text-st-gray dark:text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
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
        {loading ? (
          <div>
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-dark-border last:border-0">
                <div className="flex-1 min-w-0">
                  <div className="h-3 w-32 rounded bg-gray-100 dark:bg-dark-hover animate-pulse motion-reduce:animate-none" />
                  <div className="h-[2px] w-20 rounded bg-gray-100 dark:bg-dark-hover mt-[3px]" />
                </div>
                <div className="flex-shrink-0 w-20 flex justify-end">
                  <div className="h-3 w-10 rounded bg-gray-100 dark:bg-dark-hover animate-pulse motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          emptyState || <p className="text-xs text-st-gray dark:text-gray-400 py-10 text-center">{emptyText}</p>
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
              revenue={getRevenue ? getRevenue(r) : undefined}
              maxRevenue={maxRevenue}
              rate={getRate ? getRate(r) : undefined}
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
// Hoisted out of the JSX below so the range picker and the persisted-value
// validation read the SAME list — otherwise adding a range here would silently
// fail to restore after a refresh. Note this surface offers 90d and the
// Dashboard/Attribution picker (TIME_RANGES) does not; see readStoredTimeRange.
const ANALYTICS_TIME_RANGES = [{ l: '24h', d: 1 }, { l: '7d', d: 7 }, { l: '30d', d: 30 }, { l: '90d', d: 90 }]

export default function Analytics() {
  const { site, activeSite } = useActiveSite('cookieless_mode')
  const { theme } = useTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const [days, setDaysState] = useState(() => readStoredTimeRange(ANALYTICS_TIME_RANGES.map(t => t.d)))
  const setDays = (d) => {
    setDaysState(d)
    persistTimeRange(d)
  }
  const [filters, setFilters] = useState([])
  const [sourceTab, setSourceTab] = useState(
    ['referrer', 'channel', 'ai_source'].includes(searchParams.get('tab')) ? searchParams.get('tab') : 'referrer'
  )
  const [deviceTab, setDeviceTab] = useState('browser')
  const [copied, setCopied] = useState(false)

  const filterQuery = filters.length ? '&' + filters.map(f => `f=${encodeURIComponent(`${f.type}:${f.value}`)}`).join('&') : ''

  // ─── Summary ─────────────────────────────────────────────────────────────────
  const { data: summary, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['analytics-summary', site?.site_key, days, 'daily', filters],
    queryFn: () => fetchApi(`/analytics/summary?site_key=${site.site_key}&days=${days}&granularity=daily${filterQuery}`),
    enabled: !!site?.site_key,
    // Explicit, not inherited: this feeds the main chart and must not silently
    // revert to refetch-on-every-focus if App.jsx's defaultOptions change.
    staleTime: 60_000
  })

  const priorFrom = new Date(Date.now() - days * 2 * 86400000).toISOString().slice(0, 10)
  const priorTo   = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const { data: priorSummary } = useQuery({
    queryKey: ['prior-analytics-summary', site?.site_key, days, filters],
    queryFn: () => fetchApi(`/analytics/summary?site_key=${site.site_key}&from=${priorFrom}&to=${priorTo}${filterQuery}`),
    enabled: !!site?.site_key,
    // Explicit for the same reason as the query above — this is the
    // prior-period comparison the chart's deltas are computed against.
    staleTime: 60_000
  })

  const { data: liveData, refetch: refetchLive } = useQuery({
    queryKey: ['analytics-live', site?.site_key],
    queryFn: () => fetchApi(`/live?site_key=${site.site_key}`),
    enabled: !!site?.site_key,
    // Shared constant, not a second hardcoded interval. This was 30000 while the Dashboard's
    // live count moved to LIVE_FEED_POLL_MS in #438, and the "Online now" caption below still
    // claimed 30s — the fork IS the drift. One source of truth for both the poll and the label.
    refetchInterval: LIVE_FEED_POLL_MS
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

  // Custom goals ($conversion bucketed by conversion_type). Explicit staleTime for the same reason
  // the two summary queries carry one: it must not silently revert if App.jsx's defaults change.
  const {
    data: goalsData,
    isLoading: goalsLoading,
    // Surfaced so a FAILED read renders QueryError instead of the "no goals yet" empty state —
    // the route throws on a null (dead-store) pipe read, so without these the failure path would
    // have asserted an absence we cannot verify.
    isError: goalsIsError,
    error: goalsError,
    refetch: refetchGoals
  } = useQuery({
    queryKey: ['analytics-goals', site?.site_key, days],
    queryFn: () => fetchApi(`/analytics/goals?site_key=${encodeURIComponent(site.site_key)}&days=${days}`),
    enabled: !!site?.site_key,
    staleTime: 60_000
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

  // RATE_DENOMINATOR — goal conversion rate is computed HERE, not server-side, against the SAME
  // uniqVis this page uses for every other rate. /analytics/goals deliberately returns
  // total_visitors: null so it does not need a second Tinybird read for a denominator the page
  // already holds, and so the Goals rate can never disagree with the rates beside it.
  // Null (not 0) when there are no visitors: a rate with no denominator is unknown, not zero (§6).
  // ─── Funnels ────────────────────────────────────────────────────────────────
  // Two pieces of state on purpose: `funnelInput` is what the user is typing, `funnelSteps`
  // is what has been SUBMITTED. Querying on every keystroke would fire a 50k-row pipe read
  // per character. The query is `enabled` only once at least 2 steps exist, because the
  // route 400s below that — asking and being told off is not a useful round-trip.
  const [funnelInput, setFunnelInput] = useState('')
  const [funnelSteps, setFunnelSteps] = useState('')
  const funnelStepList = funnelSteps.split(',').map(s => s.trim()).filter(Boolean)
  const funnelReady = funnelStepList.length >= 2
  // Client-side gate mirrors the server's requireFeature('funnels_cohorts'). The SERVER
  // is the real gate (402); this only avoids rendering a control that could never succeed.
  const canSeeFunnels = hasFeature(site?.plan, 'funnels_cohorts')

  const {
    data: funnelData,
    isLoading: funnelLoading,
    isError: funnelIsError
  } = useQuery({
    queryKey: ['analytics-funnel', site?.site_key, days, funnelSteps],
    queryFn: () => fetchApi(
      `/analytics/funnel?site_key=${encodeURIComponent(site.site_key)}&days=${days}&steps=${encodeURIComponent(funnelSteps)}`
    ),
    enabled: !!site?.site_key && funnelReady && canSeeFunnels,
    staleTime: 60_000,
    retry: false
  })
  // The route returns { success, data: { steps, truncated, sample_size, row_cap } };
  // fetchApi unwraps to `data`. The Array.isArray fallback keeps a stale cached response
  // from the previous bare-array shape rendering rather than blanking the chart.
  const funnelRows = Array.isArray(funnelData)
    ? funnelData
    : Array.isArray(funnelData?.steps) ? funnelData.steps : []
  const funnelTruncated = funnelData?.truncated === true
  const funnelSampleSize = typeof funnelData?.sample_size === 'number' ? funnelData.sample_size : null

  const goalRows = goalsData?.goals || []
  const goalRate = (conversions) => (uniqVis > 0 ? (safeNumber(conversions, 0) / uniqVis) * 100 : null)

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
  //
  // §9.2 point count. Unlike the /dashboard trend series, this axis is already zero-padded
  // to the full window server-side (api/routes/analytics.js:441-456), so every slot IS a
  // real reading — a day with 0 visitors was measured, not missing — and the x-axis already
  // reflects true elapsed time. No densifying needed here; the count is the label count.
  //
  // The presets are 24h/7d/30d/90d, which pad to 2/8/31/91 slots. The 24h preset therefore
  // lands under the 3-point floor and must not draw a chart at all.
  const tsPoints = (ts.labels || []).length
  const tsPlottable = hasEnoughPointsForChart(tsPoints)
  const tsCaption = readingsCaption(ts.labels || [], ts.visitors || [])

  const chartData = useMemo(() => {
    const datasets = [{
      type: 'line', label: 'Visitors', data: ts.visitors || [],
      borderColor: 'rgba(17,24,39,1)', backgroundColor: visitorAreaGradient,
      pointBackgroundColor: '#111827', yAxisID: 'y', order: 2,
      ...honestLineStyle((ts.labels || []).length, { fill: true, tension: 0.4, pointRadius: 2, pointHoverRadius: 5 })
    }]
    if (hasRevenue) {
      datasets.push({
        type: 'bar', label: 'Revenue', data: ts.revenue || [],
        backgroundColor: '#D2EC2A', hoverBackgroundColor: '#BCD41C', borderRadius: 4, yAxisID: 'y1', order: 1
      })
    }
    return { labels: ts.labels || [], datasets }
  }, [ts, hasRevenue])

  // §9.2 under-3 fallback: the readings themselves, for the 24h preset.
  const tsReadingRows = (ts.labels || []).map((l, i) => ({
    label: formatShortDay(l),
    value: safeNumber(ts.visitors?.[i], 0).toLocaleString(),
    // Revenue rides along only when a real revenue source exists (§6) — the same
    // hasRevenue gate the bar dataset uses.
    sub: hasRevenue && ts.revenue ? fmtMoney(safeNumber(ts.revenue[i], 0)) : null
  }))

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
            {ANALYTICS_TIME_RANGES.map(t => (
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
              {/* Derived from the constant, never retyped — a hardcoded "30s" here outlived the
                  interval it described. If the poll changes, this caption changes with it. */}
              <div className="flex items-center gap-1.5 flex-wrap mt-2"><p className="text-[10px] text-st-gray dark:text-gray-400 font-medium truncate">refreshed every {Math.round(LIVE_FEED_POLL_MS / 1000)}s</p></div>
            </div>
          </div>

          {/* ─── Dual-axis chart ─────────────────────────────────────────── */}
          <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wide mb-3">{hasRevenue ? 'Traffic & Revenue over time' : 'Visitors over time'}</p>
            {/* §9.2: the 24h preset pads to 2 days, which is under the 3-point floor — the two
                numbers are rendered instead of a two-point curve. Gate sits OUTSIDE the fixed
                220px box so the fallback isn't squeezed into a chart-shaped hole. */}
            {tsPlottable ? (
              <>
                <div style={{ height: 220 }}>
                  <Chart type="line" data={chartData} options={chartOptions} />
                </div>
                {tsCaption && <p className="mt-2 text-[10px] text-st-gray dark:text-gray-400">{tsCaption}</p>}
              </>
            ) : tsReadingRows.length > 0 ? (
              <SparseReadings readings={tsReadingRows} unit={hasRevenue ? 'traffic' : 'visitors'} />
            ) : (
              <p className="text-xs text-st-gray dark:text-gray-400 text-center py-12">No time-series data yet</p>
            )}
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

          {/* ─── Goals (custom conversion_type events) ─────────────────────────
              Standalone full-width card, not a 4th cell in the grid above and not a Devices
              sub-tab. Rows are passive in V1 — no toggleFilter, because 'Goal' is not one of
              the 9 pipe-backed drill-down filter types (PIPE_FILTER_PARAM), so a click would
              produce a filter the read cannot honour.
              Rendered whenever the query has resolved, INCLUDING the zero case: the empty state
              is the only place that tells a customer how to send their first goal, so gating the
              whole card on goals.length > 0 would make that instruction unreachable.

              THREE OUTCOMES, never conflated. Loading -> skeleton rows. A FAILED read -> QueryError,
              NOT the empty state: the route throws when the pipe returns null (dead store), so
              without this branch the guaranteed result of that failure was the card confidently
              telling a customer "No goals tracked yet" when we simply could not read. Absence we
              cannot verify is not absence (§6) — same rule as the Realtime panel's degraded state.
              A genuine zero -> the onboarding prompt, which IS a known zero and safe to assert. */}
          <ListSection
            title="Goals"
            subtitle="Conversion events tracked on your site"
            rows={goalsIsError ? [] : goalRows}
            loading={goalsLoading}
            getLabel={r => r.label || r.type}
            getCount={r => r.conversions}
            getRevenue={r => r.revenue}
            getRate={r => goalRate(r.conversions)}
            emptyState={goalsIsError ? (
              <div className="px-4 py-6">
                <QueryError isError={goalsIsError} error={goalsError} onRetry={refetchGoals} />
              </div>
            ) : (
              <div className="py-10 text-center px-4">
                <Target className="w-5 h-5 mx-auto text-st-gray dark:text-gray-400" aria-hidden="true" />
                <p className="text-sm font-medium text-st-black dark:text-dark-primary mt-2">No goals tracked yet</p>
                <p className="text-xs text-st-gray dark:text-gray-400 mt-1">
                  Call <code className="font-mono text-[11px]">sourcetrack.conversion(&#123; type: 'signup' &#125;)</code> to track your first goal.
                </p>
                {/* Plain anchor with this file's own link treatment (see the Attribution /
                    leads links) — Analytics.jsx has no useNavigate, and adding one for a single
                    CTA would be a second navigation idiom in the same file. */}
                <a href="/setup" className="inline-block mt-3 text-xs font-semibold text-st-black dark:text-dark-primary hover:underline">
                  Set up conversions →
                </a>
              </div>
            )}
          />

          {/* ─── Funnels ───────────────────────────────────────────────────────
              A SECTION on this page, not a new page and not a sidebar entry. The card
              shell matches ListSection's (same border/radius/shadow/header) so it reads as
              a sibling of Sources/Pages/Devices/Goals rather than a bolted-on panel.
              Entitlement note: this whole block only renders for plans where
              funnels_cohorts is true; the server is the real gate (402), this just avoids
              showing a control that would always 402. */}
          {canSeeFunnels && (
          <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border">
              <h3 className="text-sm font-semibold text-st-black dark:text-dark-primary">Funnels</h3>
              <p className="text-[11px] text-st-gray dark:text-gray-400 mt-0.5">
                Comma-separated path keywords, in order — each step matches any URL containing it
              </p>
            </div>
            <div className="px-4 py-3">
              {/* Submit-on-form, not on change: each run is a 50k-row pipe read, so it fires
                  when the user says so. Enter submits because the input is inside a form. */}
              <form
                onSubmit={(e) => { e.preventDefault(); setFunnelSteps(funnelInput) }}
                className="flex items-center gap-2 mb-3"
              >
                <input
                  type="text"
                  value={funnelInput}
                  onChange={(e) => setFunnelInput(e.target.value)}
                  placeholder="/pricing, /signup, /welcome"
                  aria-label="Funnel steps, comma separated"
                  className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-lg bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border-strong text-st-black dark:text-dark-primary placeholder:text-st-gray focus:outline-none focus:ring-1 focus:ring-st-lime"
                />
                <button
                  type="submit"
                  disabled={funnelInput.split(',').map(s => s.trim()).filter(Boolean).length < 2}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-st-lime text-st-black disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                >
                  Run
                </button>
              </form>

              {/* Four states, never conflated: not-yet-asked, failed, loading, result.
                  A FAILED read must not fall through to FunnelChart's "no data" copy — that
                  would assert an absence we cannot verify (§6). */}
              {!funnelReady ? (
                <p className="text-xs text-st-gray dark:text-gray-400 py-6 text-center">
                  Enter at least 2 steps to run a funnel.
                </p>
              ) : funnelIsError ? (
                <p className="text-xs text-st-gray dark:text-gray-400 py-6 text-center">
                  Funnel unavailable right now.
                </p>
              ) : (
                <FunnelChart
                  steps={funnelRows}
                  loading={funnelLoading}
                  hasSteps={funnelRows.length > 0}
                  truncated={funnelTruncated}
                  sampleSize={funnelSampleSize}
                />
              )}
            </div>
          </div>
          )}

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
