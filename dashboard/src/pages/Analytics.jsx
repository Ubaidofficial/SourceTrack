import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { fetchApi } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Eye, RefreshCw, Copy, Check, BarChart3 } from 'lucide-react'
import { safeNumber } from '../utils/numbers'
import { SourceIcon, normalizeSource } from '../components/SourceIcon'
import { useSite } from '../contexts/SiteContext'
import MetricTile from '../components/MetricTile'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler)

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDuration(s) {
  const n = safeNumber(s, 0)
  if (n === 0) return '—'
  if (n < 60) return `${Math.round(n)}s`
  return `${Math.floor(n / 60)}m ${Math.round(n % 60)}s`
}
function stripOrigin(url = '') { return url.replace(/^https?:\/\/[^/]+/, '') || '/' }

// ─── Visitors-only bar row ────────────────────────────────────────────────────
function DataRow({ label, count, max, icon, onClick, active }) {
  const n = safeNumber(count, 0)
  const pct = max > 0 ? (n / max) * 100 : 0
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-dark-border last:border-0 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${active ? 'bg-st-lime/5' : 'hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
    >
      {icon && <span className="flex-shrink-0 w-4 flex items-center">{icon}</span>}
      <div className="flex-1 min-w-0">
        <span className="text-xs truncate text-st-black dark:text-white block">{label}</span>
        <div style={{ height: '2px', width: `${pct.toFixed(1)}%`, background: 'rgba(204,240,63,0.6)', borderRadius: '1px', marginTop: '3px' }} />
      </div>
      <span className="text-sm font-medium text-st-black dark:text-white w-14 text-right flex-shrink-0 tabular-nums">{n.toLocaleString()}</span>
    </div>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────
function ListSection({ title, rows, getLabel, getCount, getIcon, onRowClick, isRowActive, emptyText = 'No data yet', unit }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? rows : rows.slice(0, 8)
  const max = useMemo(() => Math.max(1, ...rows.map(r => safeNumber(getCount(r), 0))), [rows, getCount])

  return (
    <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-st-black dark:text-white">{title}</h3>
        {unit && <span className="text-[10px] uppercase tracking-wide text-st-gray dark:text-gray-400 font-medium flex-shrink-0">{unit}</span>}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-st-gray dark:text-gray-400 py-10 text-center">{emptyText}</p>
      ) : (
        <>
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
          {rows.length > 8 && (
            <button
              onClick={() => setShowAll(s => !s)}
              className="w-full py-2 text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white border-t border-gray-100 dark:border-dark-border transition-colors"
            >
              {showAll ? '↑ Show less' : `↓ Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
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
  const { data: summary, isLoading } = useQuery({
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

  // ─── Visitors chart ────────────────────────────────────────────────────────
  const chartData = useMemo(() => ({
    labels: ts.labels || [],
    datasets: [{
      label: 'Visitors',
      data: ts.visitors || [],
      borderColor: '#CCF03F',
      backgroundColor: 'rgba(204,240,63,0.06)',
      fill: true,
      tension: 0.4,
      pointRadius: 2,
      pointBackgroundColor: '#CCF03F',
    }]
  }), [ts])

  const chartOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: theme === 'dark' ? '#1A1D1D' : '#ffffff',
        borderColor: theme === 'dark' ? '#2A2E2E' : '#e5e7eb',
        borderWidth: 1,
        titleColor: theme === 'dark' ? '#ffffff' : '#111827',
        bodyColor: theme === 'dark' ? '#9CA3AF' : '#4B5563',
        callbacks: { label: ctx => `Visitors: ${safeNumber(ctx.parsed.y, 0).toLocaleString()}` }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: theme === 'dark' ? '#7D8090' : '#4B5563', maxRotation: 0, maxTicksLimit: 8 } },
      y: { grid: { color: theme === 'dark' ? '#2A2E2E' : '#f3f4f6' }, ticks: { color: theme === 'dark' ? '#7D8090' : '#4B5563', precision: 0 } }
    }
  }), [theme])

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
              <h2 className="text-sm font-semibold text-st-black dark:text-white mb-1">Analytics View Disabled</h2>
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
          <h2 className="text-xl font-bold text-st-black dark:text-white">Analytics</h2>
          <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">Understand traffic before you dig into attribution.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg shadow-sm">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${liveCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-xs font-medium text-st-black dark:text-white tabular-nums">{liveCount}</span>
            <span className="text-xs text-st-gray dark:text-gray-400">live</span>
            <button onClick={() => refetchLive()} className="text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white ml-0.5 transition-colors">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg p-1 shadow-sm">
            {[{l:'24h',d:1},{l:'7d',d:7},{l:'30d',d:30},{l:'90d',d:90}].map(t => (
              <button key={t.d} onClick={() => setDays(t.d)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  days === t.d ? 'bg-st-lime text-st-black font-semibold' : 'text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white'
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
            <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-full text-xs text-st-black dark:text-white shadow-sm">
              <span className="text-st-gray dark:text-gray-400">{f.type}:</span> {f.value}
              <button onClick={() => toggleFilter(f.type, f.value)} className="text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white ml-1.5 leading-none text-sm font-semibold">×</button>
            </span>
          ))}
          {filters.length > 1 && (
            <button onClick={() => setFilters([])} className="text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white px-2 transition-colors">Clear all</button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-lime" />
        </div>
      ) : !hasData ? (

        /* ─── Empty state ──────────────────────────────────────────────── */
        <div className="max-w-md mx-auto py-16 text-center space-y-6">
          <Eye className="w-10 h-10 text-st-gray/40 dark:text-gray-500/40 mx-auto" />
          <div>
            <h3 className="text-base font-semibold text-st-black dark:text-white mb-1">No pageviews yet</h3>
            <p className="text-sm text-st-gray dark:text-gray-400">Install the tracker to start collecting traffic data.</p>
          </div>
          <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-4 text-left space-y-3 shadow-sm">
            <p className="text-xs font-semibold text-st-black dark:text-white">Add to your site &lt;head&gt;:</p>
            <div className="flex items-start gap-2">
              <code className="text-[11px] text-st-gray dark:text-gray-300 flex-1 break-all leading-relaxed">{snippetUrl}</code>
              <button onClick={copySnippet} className="flex-shrink-0 p-1.5 text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white border border-gray-200 dark:border-dark-border rounded-lg transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-st-lime" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-st-gray dark:text-gray-400">Pageviews appear here once the tracker fires on your site. Conversions appear after your site sends conversion events.</p>
          </div>
        </div>

      ) : (
        <>
          {/* ─── KPIs ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <MetricTile
              label="Visitors"
              value={safeNumber(kpis.unique_visitors, 0).toLocaleString()}
              delta={delta(kpis.unique_visitors, priorKpis.unique_visitors)}
              compact
            />
            <MetricTile
              label="Pageviews"
              value={safeNumber(kpis.pageviews, 0).toLocaleString()}
              delta={delta(kpis.pageviews, priorKpis.pageviews)}
              compact
            />
            <MetricTile
              label="Online now"
              value={liveCount.toLocaleString()}
              sub="refreshed every 30s"
              compact
            />
            <MetricTile
              label="Conversions"
              value={convCount > 0 ? convCount.toLocaleString() : '—'}
              sub={convCount === 0 ? 'No conversion events yet' : null}
              delta={convCount > 0 ? delta(kpis.conversion_count, priorKpis.conversion_count) : null}
              compact
            />
            <MetricTile
              label="Conv Rate"
              value={convRate > 0 ? `${convRate.toFixed(2)}%` : '—'}
              sub={convRate === 0 ? 'Send conversion events to track' : null}
              delta={convRate > 0 ? delta(kpis.conversion_rate, priorKpis.conversion_rate) : null}
              compact
            />
            <MetricTile
              label="Avg Duration"
              value={fmtDuration(kpis.avg_duration_seconds)}
              sub={kpis.avg_duration_seconds == null ? 'Not available' : null}
              delta={kpis.avg_duration_seconds == null ? null : delta(kpis.avg_duration_seconds, priorKpis.avg_duration_seconds)}
              compact
            />
          </div>

          {/* ─── Visitors chart ─────────────────────────────────────────── */}
          <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-st-gray dark:text-gray-400 uppercase tracking-wide mb-3">Visitors over time</p>
            <div style={{ height: 200 }}>
              {ts.labels && ts.labels.length > 0 ? (
                <Line data={chartData} options={chartOptions} />
              ) : (
                <p className="text-xs text-st-gray dark:text-gray-400 text-center py-12">No time-series data yet</p>
              )}
            </div>
          </div>

          {/* ─── Pages + Sources ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ListSection
              title="Top Pages"
              rows={topPages}
              getLabel={r => stripOrigin(r.page)}
              getCount={r => r.views}
              onRowClick={r => toggleFilter('Page', stripOrigin(r.page))}
              isRowActive={r => isActive('Page', stripOrigin(r.page))}
              emptyText="No page data yet"
            />

            {/* Sources — referrers, medium, AI */}
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-st-black dark:text-white">Sources</h3>
                <div className="flex gap-1">
                  {[
                    { key: 'referrer',  label: 'Referrers' },
                    { key: 'medium',    label: 'Medium' },
                    { key: 'ai_source', label: 'AI' },
                  ].map(tab => (
                    <button key={tab.key}
                      onClick={() => { setSourceTab(tab.key); setSearchParams({ tab: tab.key }) }}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        sourceTab === tab.key ? 'bg-st-lime text-st-black font-semibold' : 'text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white'
                      }`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <SourceTabList
                rows={sourcesRows}
                tab={sourceTab}
                toggleFilter={toggleFilter}
                isActive={isActive}
              />
            </div>
          </div>

          {/* ─── Countries + Devices ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ListSection
              title="Top Countries"
              unit="pageviews"
              rows={topCountries}
              getLabel={r => r.country || 'Unknown'}
              getCount={r => r.visits}
              onRowClick={r => toggleFilter('Country', r.country)}
              isRowActive={r => isActive('Country', r.country)}
              emptyText="No country data yet"
            />
            <ListSection
              title="Devices"
              unit="pageviews"
              rows={Object.entries(devices).sort((a,b) => safeNumber(b[1],0) - safeNumber(a[1],0)).map(([k,v]) => ({ device: k, count: v }))}
              getLabel={r => r.device.charAt(0).toUpperCase() + r.device.slice(1)}
              getCount={r => r.count}
              onRowClick={r => toggleFilter('Device', r.device)}
              isRowActive={r => isActive('Device', r.device)}
              emptyText="No device data yet"
            />
          </div>

          {/* ─── Browsers + OS ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ListSection
              title="Browsers"
              unit="visitors"
              rows={browsers}
              getLabel={r => r.browser}
              getCount={r => r.visitors}
              onRowClick={r => toggleFilter('Browser', r.browser)}
              isRowActive={r => isActive('Browser', r.browser)}
              emptyText="No browser data yet"
            />
            <ListSection
              title="Operating Systems"
              unit="visitors"
              rows={osList}
              getLabel={r => r.os}
              getCount={r => r.visitors}
              onRowClick={r => toggleFilter('OS', r.os)}
              isRowActive={r => isActive('OS', r.os)}
              emptyText="No OS data yet"
            />
          </div>

          {/* ─── Entry / Exit ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ListSection
              title="Entry Pages"
              rows={entryPages}
              getLabel={r => stripOrigin(r.page)}
              getCount={r => r.count}
              onRowClick={r => toggleFilter('Entry', stripOrigin(r.page))}
              isRowActive={r => isActive('Entry', stripOrigin(r.page))}
              emptyText="No entry data yet"
            />
            <ListSection
              title="Exit Pages"
              rows={exitPages}
              getLabel={r => stripOrigin(r.page)}
              getCount={r => r.count}
              onRowClick={r => toggleFilter('Exit', stripOrigin(r.page))}
              isRowActive={r => isActive('Exit', stripOrigin(r.page))}
              emptyText="No exit data yet"
            />
          </div>

          {/* ─── AI Traffic (conditional) ─────────────────────────────────── */}
          {aiSources.length > 0 && (
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-st-black dark:text-white">AI Traffic</h3>
                <span className="text-[10px] text-st-gray dark:text-gray-400">
                  {Math.round(aiSources.reduce((s,r) => s + safeNumber(r.visits,0), 0) / Math.max(1, safeNumber(kpis.unique_visitors, 1)) * 100)}% of all visitors
                </span>
              </div>
              {(() => {
                const max = Math.max(1, ...aiSources.map(r => safeNumber(r.visits, 0)))
                return aiSources.map((r, i) => (
                  <DataRow
                    key={i}
                    label={normalizeSource(r.source).name}
                    count={r.visits}
                    max={max}
                    icon={<SourceIcon source={r.source} className="w-3.5 h-3.5" />}
                    onClick={() => toggleFilter('AI Source', r.source)}
                    active={isActive('AI Source', r.source)}
                  />
                ))
              })()}
            </div>
          )}

          {/* ─── SEO Traffic — Search Console (conditional, traffic-only) ──── */}
          {seoConnected && (
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-st-black dark:text-white">SEO Traffic</h3>
                <span className="text-[10px] text-st-gray dark:text-gray-400 flex-shrink-0">
                  {safeNumber(seoTraffic?.summary?.gsc_clicks, 0).toLocaleString()} Search Console clicks
                </span>
              </div>
              {seoQueries.length === 0 ? (
                <p className="text-xs text-st-gray dark:text-gray-400 py-10 text-center">No Search Console queries in this period</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-dark-border text-st-gray dark:text-gray-400 text-[10px] uppercase tracking-wide">
                        <th className="py-2 px-4 font-medium">Query</th>
                        <th className="py-2 px-3 font-medium text-right">Clicks</th>
                        <th className="py-2 px-3 font-medium text-right">Impressions</th>
                        <th className="py-2 px-3 font-medium text-right">CTR</th>
                        <th className="py-2 px-4 font-medium text-right">Avg Pos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seoQueries.slice(0, 10).map((q, i) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-dark-border last:border-0 text-xs">
                          <td className="py-2.5 px-4 font-mono text-st-black dark:text-white max-w-[240px] truncate" title={q.query}>{q.query}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-st-black dark:text-white">{safeNumber(q.clicks, 0).toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-st-gray dark:text-gray-400">{safeNumber(q.impressions, 0).toLocaleString()}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-st-gray dark:text-gray-400">{(safeNumber(q.ctr, 0) * 100).toFixed(1)}%</td>
                          <td className="py-2.5 px-4 text-right tabular-nums text-st-gray dark:text-gray-400">{safeNumber(q.position, 0).toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ─── Conversions notice ───────────────────────────────────────── */}
          {convCount === 0 && (
            <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl px-4 py-4 flex items-start gap-3 shadow-sm">
              <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-st-gray dark:bg-gray-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-st-black dark:text-white">No conversions in this period</p>
                <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5">
                  Conversions appear after your site sends conversion events. See the <a href="/developers/conversions" className="underline hover:text-st-black dark:hover:text-white transition-colors">conversion events docs</a> for setup instructions.
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

  if (!rows || rows.length === 0) {
    if (tab === 'ai_source') {
      return (
        <div className="text-center py-12 px-4 space-y-2">
          <p className="text-sm font-medium text-st-black dark:text-white">No AI traffic detected yet</p>
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
          icon={<SourceIcon source={r.name || ''} className="w-3.5 h-3.5" />}
          onClick={() => {
            if (tab === 'referrer')  toggleFilter('Source', r.name)
            if (tab === 'ai_source') toggleFilter('AI Source', r.name)
          }}
          active={
            tab === 'referrer'  ? isActive('Source', r.name) :
            tab === 'ai_source' ? isActive('AI Source', r.name) : false
          }
        />
      ))}
      {rows.length > 8 && (
        <button
          onClick={() => setShowAll(s => !s)}
          className="w-full py-2 text-xs text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white border-t border-gray-100 dark:border-dark-border transition-colors"
        >
          {showAll ? '↑ Show less' : `↓ Show all ${rows.length}`}
        </button>
      )}
    </>
  )
}
