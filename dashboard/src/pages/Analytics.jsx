import { useState, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { fetchApi } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Eye, RefreshCw, Copy, Check, BarChart3 } from 'lucide-react'
import { safeNumber } from '../utils/numbers'
import { SourceIcon } from '../components/SourceIcon'
import { isSupportPreviewActive } from '../utils/supportPreview'

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
      className={`flex items-center gap-3 px-4 py-2.5 border-b border-[#2A2E2E]/60 last:border-0 transition-colors ${
        onClick ? 'cursor-pointer' : ''
      } ${active ? 'bg-st-lime/5' : 'hover:bg-[#242829]'}`}
    >
      {icon && <span className="flex-shrink-0 w-4 flex items-center">{icon}</span>}
      <span className="text-xs flex-1 truncate text-white">{label}</span>
      <div className="w-20 flex-shrink-0">
        <div className="h-1.5 bg-[#2A2E2E] rounded-full overflow-hidden">
          <div className="h-full bg-st-lime rounded-full transition-all" style={{ width: `${pct.toFixed(1)}%` }} />
        </div>
      </div>
      <span className="text-sm font-medium text-white w-14 text-right flex-shrink-0 tabular-nums">{n.toLocaleString()}</span>
    </div>
  )
}

// ─── Section card ─────────────────────────────────────────────────────────────
function ListSection({ title, rows, getLabel, getCount, getIcon, onRowClick, isRowActive, emptyText = 'No data yet' }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? rows : rows.slice(0, 8)
  const max = useMemo(() => Math.max(1, ...rows.map(r => safeNumber(getCount(r), 0))), [rows, getCount])

  return (
    <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2A2E2E]">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-st-gray py-10 text-center">{emptyText}</p>
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
              className="w-full py-2 text-xs text-st-gray hover:text-white border-t border-[#2A2E2E] transition-colors"
            >
              {showAll ? '↑ Show less' : `↓ Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </div>
  )
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────
function KPITile({ label, value, delta, sub }) {
  return (
    <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl px-4 py-3">
      <p className="text-[11px] text-st-gray font-medium uppercase tracking-wide mb-1.5">{label}</p>
      <p className="text-xl font-semibold text-white tabular-nums">{value}</p>
      {delta && (
        <p className={`text-[10px] font-medium mt-0.5 ${delta.color}`}>{delta.arrow} {delta.pct}% vs prior</p>
      )}
      {sub && !delta && <p className="text-[10px] text-st-gray mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Analytics() {
  const { user } = useAuth()
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
        backgroundColor: '#0F1212',
        borderColor: '#2A2E2E',
        borderWidth: 1,
        titleColor: '#fff',
        bodyColor: '#9CA3AF',
        callbacks: { label: ctx => `Visitors: ${safeNumber(ctx.parsed.y, 0).toLocaleString()}` }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#7D8090', maxRotation: 0, maxTicksLimit: 8 } },
      y: { grid: { color: '#2A2E2E' }, ticks: { color: '#7D8090', precision: 0 } }
    }
  }), [])

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
  const isPreview = isSupportPreviewActive()

  if (!site) {
    if (isPreview) {
      return (
        <div className="st-container py-24 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#1A1D1D] border border-[#2A2E2E] flex items-center justify-center mx-auto">
              <BarChart3 className="w-5 h-5 text-st-gray" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white mb-1">Analytics View Disabled</h2>
              <p className="text-xs text-st-gray/80 leading-relaxed">
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
          <h2 className="text-xl font-bold text-white">Analytics</h2>
          <p className="text-xs text-st-gray mt-0.5">Understand traffic before you dig into attribution.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1A1D1D] border border-[#2A2E2E] rounded-lg">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${liveCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`} />
            <span className="text-xs font-medium text-white tabular-nums">{liveCount}</span>
            <span className="text-xs text-st-gray">live</span>
            <button onClick={() => refetchLive()} className="text-st-gray hover:text-white ml-0.5">
              <RefreshCw className="w-3 h-3" />
            </button>
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
      </div>

      {/* ─── Active filter pills ─────────────────────────────────────────── */}
      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((f, i) => (
            <span key={i} className="flex items-center gap-1 px-2 py-1 bg-[#242829] border border-[#2A2E2E] rounded-full text-xs text-white">
              <span className="text-st-gray">{f.type}:</span> {f.value}
              <button onClick={() => toggleFilter(f.type, f.value)} className="text-st-gray hover:text-white ml-1 leading-none text-sm">×</button>
            </span>
          ))}
          {filters.length > 1 && (
            <button onClick={() => setFilters([])} className="text-xs text-st-gray hover:text-white px-2">Clear all</button>
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
          <Eye className="w-10 h-10 text-st-gray/40 mx-auto" />
          <div>
            <h3 className="text-base font-semibold text-white mb-1">No pageviews yet</h3>
            <p className="text-sm text-st-gray">Install the tracker to start collecting traffic data.</p>
          </div>
          <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl p-4 text-left space-y-3">
            <p className="text-xs font-semibold text-white">Add to your site &lt;head&gt;:</p>
            <div className="flex items-start gap-2">
              <code className="text-[11px] text-st-gray flex-1 break-all leading-relaxed">{snippetUrl}</code>
              <button onClick={copySnippet} className="flex-shrink-0 p-1.5 text-st-gray hover:text-white border border-[#2A2E2E] rounded-lg">
                {copied ? <Check className="w-3.5 h-3.5 text-st-lime" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-st-gray">Pageviews appear here once the tracker fires on your site. Conversions appear after your site sends conversion events.</p>
          </div>
        </div>

      ) : (
        <>
          {/* ─── KPIs ────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <KPITile
              label="Visitors"
              value={safeNumber(kpis.unique_visitors, 0).toLocaleString()}
              delta={delta(kpis.unique_visitors, priorKpis.unique_visitors)}
            />
            <KPITile
              label="Pageviews"
              value={safeNumber(kpis.pageviews, 0).toLocaleString()}
              delta={delta(kpis.pageviews, priorKpis.pageviews)}
            />
            <KPITile
              label="Online now"
              value={liveCount.toLocaleString()}
              sub="refreshed every 30s"
            />
            <KPITile
              label="Conversions"
              value={convCount > 0 ? convCount.toLocaleString() : '—'}
              sub={convCount === 0 ? 'No conversion events yet' : null}
              delta={convCount > 0 ? delta(kpis.conversion_count, priorKpis.conversion_count) : null}
            />
            <KPITile
              label="Conv Rate"
              value={convRate > 0 ? `${convRate.toFixed(2)}%` : '—'}
              sub={convRate === 0 ? 'Send conversion events to track' : null}
              delta={convRate > 0 ? delta(kpis.conversion_rate, priorKpis.conversion_rate) : null}
            />
            <KPITile
              label="Avg Duration"
              value={fmtDuration(kpis.avg_duration_seconds)}
              delta={delta(kpis.avg_duration_seconds, priorKpis.avg_duration_seconds)}
            />
          </div>

          {/* ─── Visitors chart ─────────────────────────────────────────── */}
          <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl p-4">
            <p className="text-[11px] font-semibold text-st-gray uppercase tracking-wide mb-3">Visitors over time</p>
            <div style={{ height: 200 }}>
              {ts.labels && ts.labels.length > 0 ? (
                <Line data={chartData} options={chartOptions} />
              ) : (
                <p className="text-xs text-st-gray text-center py-12">No time-series data yet</p>
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
            <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2A2E2E] flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-white">Sources</h3>
                <div className="flex gap-1">
                  {[
                    { key: 'referrer',  label: 'Referrers' },
                    { key: 'medium',    label: 'Medium' },
                    { key: 'ai_source', label: 'AI' },
                  ].map(tab => (
                    <button key={tab.key}
                      onClick={() => { setSourceTab(tab.key); setSearchParams({ tab: tab.key }) }}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                        sourceTab === tab.key ? 'bg-st-lime text-st-black' : 'text-st-gray hover:text-white'
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
              rows={topCountries}
              getLabel={r => r.country || 'Unknown'}
              getCount={r => r.visits}
              onRowClick={r => toggleFilter('Country', r.country)}
              isRowActive={r => isActive('Country', r.country)}
              emptyText="No country data yet"
            />
            <ListSection
              title="Devices"
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
              rows={browsers}
              getLabel={r => r.browser}
              getCount={r => r.visitors}
              onRowClick={r => toggleFilter('Browser', r.browser)}
              isRowActive={r => isActive('Browser', r.browser)}
              emptyText="No browser data yet"
            />
            <ListSection
              title="Operating Systems"
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
            <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#2A2E2E] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">AI Traffic</h3>
                <span className="text-[10px] text-st-gray">
                  {Math.round(aiSources.reduce((s,r) => s + safeNumber(r.visits,0), 0) / Math.max(1, safeNumber(kpis.unique_visitors, 1)) * 100)}% of all visitors
                </span>
              </div>
              {(() => {
                const max = Math.max(1, ...aiSources.map(r => safeNumber(r.visits, 0)))
                return aiSources.map((r, i) => (
                  <DataRow
                    key={i}
                    label={r.source}
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

          {/* ─── Conversions notice ───────────────────────────────────────── */}
          {convCount === 0 && (
            <div className="bg-[#1A1D1D] border border-[#2A2E2E] rounded-xl px-4 py-4 flex items-start gap-3">
              <span className="w-1.5 h-1.5 mt-1.5 rounded-full bg-st-gray flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-white">No conversions in this period</p>
                <p className="text-xs text-st-gray mt-0.5">
                  Conversions appear after your site sends conversion events. See the <a href="/developers/conversions" className="underline hover:text-white">conversion events docs</a> for setup instructions.
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
          <p className="text-sm font-medium text-white">No AI traffic detected yet</p>
          <p className="text-xs text-st-gray max-w-sm mx-auto">
            When visitors arrive from ChatGPT, Claude, Perplexity, or other AI platforms, they'll appear here.
          </p>
        </div>
      )
    }
    return <p className="text-xs text-st-gray py-10 text-center">No {tab} data yet</p>
  }

  return (
    <>
      {visible.map((r, i) => (
        <DataRow
          key={i}
          label={r.name || 'Unknown'}
          count={r.visitors}
          max={max}
          icon={tab === 'referrer' ? <SourceIcon source={r.name || ''} className="w-3.5 h-3.5" /> : null}
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
          className="w-full py-2 text-xs text-st-gray hover:text-white border-t border-[#2A2E2E] transition-colors"
        >
          {showAll ? '↑ Show less' : `↓ Show all ${rows.length}`}
        </button>
      )}
    </>
  )
}
