import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Eye, RefreshCw, ExternalLink, Zap, Sparkles, Copy, Check, TrendingDown } from 'lucide-react'
import { formatPercent } from '../utils/numbers'
import FunnelChart from '../components/FunnelChart'

function fmtDuration(s) {
  if (!s) return '0s'
  if (s < 60) return `${Math.round(s)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

function stripOrigin(url = '') {
  return url.replace(/^https?:\/\/[^/]+/, '') || '/'
}

// Single tabbed panel used for both columns
function TabPanel({ tabs, activeTab, onTab, children }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
      <div className="flex border-b border-gray-100 overflow-x-auto flex-shrink-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => onTab(t.key)}
            className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === t.key
                ? 'border-st-black text-st-black'
                : 'border-transparent text-st-gray hover:text-st-black'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto" style={{ maxHeight: 340 }}>
        {children}
      </div>
    </div>
  )
}

function DataRow({ label, value, max, pct, isAI, onClick, active }) {
  const barPct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${
        active ? 'bg-lime-50' : 'hover:bg-gray-50'
      }`}
    >
      {isAI && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 flex-shrink-0" />}
      <span className={`text-xs flex-1 truncate ${isAI ? 'text-purple-700 font-medium' : 'text-gray-700'}`}>
        {isAI ? '✦ ' : ''}{label}
      </span>
      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
        <div className={`h-full rounded-full ${isAI ? 'bg-purple-400' : 'bg-st-black'}`}
          style={{ width: `${barPct}%` }} />
      </div>
      <span className="text-xs font-semibold text-st-black w-10 text-right flex-shrink-0">
        {value?.toLocaleString?.() ?? value}
      </span>
      {pct != null && (
        <span className="text-[10px] text-st-gray w-8 text-right flex-shrink-0">{pct}%</span>
      )}
    </div>
  )
}

export default function Analytics() {
  const { user } = useAuth()
  const [days, setDays] = useState(30)
  const [leftTab, setLeftTab]   = useState('pages')
  const [rightTab, setRightTab] = useState('sources')
  const [filter, setFilter]     = useState(null) // { type, value }
  const [copied, setCopied]     = useState(false)
  const [funnelInput, setFunnelInput] = useState('')
  const [funnelSteps, setFunnelSteps] = useState([])

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

  const { data: summary, isLoading } = useQuery({
    queryKey: ['analytics-summary', site?.site_key, days],
    queryFn: () => fetchApi(`/analytics/summary?site_key=${site.site_key}&days=${days}`),
    enabled: !!site?.site_key
  })

  const priorFrom = new Date(Date.now() - days * 2 * 86400000).toISOString().slice(0, 10)
  const priorTo = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

  const { data: priorSummary } = useQuery({
    queryKey: ['prior-analytics-summary', site?.site_key, days],
    queryFn: () => fetchApi(`/analytics/summary?site_key=${site.site_key}&from=${priorFrom}&to=${priorTo}`),
    enabled: !!site?.site_key
  })

  const { data: liveData, refetch: refetchLive } = useQuery({
    queryKey: ['analytics-live', site?.site_key],
    queryFn: () => fetchApi(`/live?site_key=${site.site_key}`),
    enabled: !!site?.site_key,
    refetchInterval: 30000
  })

  const { data: entryExitData } = useQuery({
    queryKey: ['analytics-entry-exit', site?.site_key, days],
    queryFn: () => fetchApi(`/analytics/entry-exit?site_key=${site.site_key}&days=${days}`),
    enabled: !!site?.site_key
  })

  const { data: outboundData } = useQuery({
    queryKey: ['analytics-outbound', site?.site_key, days],
    queryFn: () => fetchApi(`/analytics/outbound?site_key=${site.site_key}&days=${days}`),
    enabled: !!site?.site_key
  })

  const { data: customEventsData } = useQuery({
    queryKey: ['analytics-custom', site?.site_key, days],
    queryFn: () => fetchApi(`/analytics/custom-events?site_key=${site.site_key}&days=${days}`),
    enabled: !!site?.site_key
  })

  const { data: browserData } = useQuery({
    queryKey: ['analytics-browsers', site?.site_key, days],
    queryFn: () => fetchApi(`/analytics/browsers?site_key=${site.site_key}&days=${days}`),
    enabled: !!site?.site_key
  })

  const { data: osData } = useQuery({
    queryKey: ['analytics-os', site?.site_key, days],
    queryFn: () => fetchApi(`/analytics/os?site_key=${site.site_key}&days=${days}`),
    enabled: !!site?.site_key
  })

  const { data: funnelData } = useQuery({
    queryKey: ['funnel', site?.site_key, funnelSteps, days],
    queryFn: async () => {
      const params = new URLSearchParams({
        site_key: site.site_key,
        steps: funnelSteps.join(','),
        days: String(days)
      })
      const res = await fetch(`/api/analytics/funnel?${params}`)
      const json = await res.json()
      return json?.data || []
    },
    enabled: !!site?.site_key && funnelSteps.length > 0
  })

  const d            = summary?.data
  const kpis         = d?.kpis || {}
  const priorKpis    = priorSummary?.data?.kpis || {}
  const topPages     = d?.top_pages || []
  const topSources   = d?.top_sources || []
  const aiSources    = d?.ai_sources || []
  const devices      = d?.devices || {}
  const topCountries = d?.top_countries || []
  const trend        = d?.trend || []
  const liveCount    = liveData?.live_visitors ?? 0
  const entryPages   = entryExitData?.data?.entry_pages || []
  const exitPages    = entryExitData?.data?.exit_pages || []
  const outboundLinks= outboundData?.data || []
  const customEvents = customEventsData?.data?.events || []
  const recentEvents = customEventsData?.data?.recent || []
  const browsers      = browserData?.data || []
  const osList        = osData?.data || []

  const newVisitors       = kpis.new_visitors ?? 0
  const returningVisitors = kpis.returning_visitors ?? 0
  const totalVis          = (newVisitors + returningVisitors) || 1
  const newPct            = Math.round(newVisitors / totalVis * 100)

  const maxPage    = Math.max(...topPages.map(r => r.views), 1)
  const maxSource  = Math.max(...topSources.map(r => r.visits), 1)
  const maxAI      = Math.max(...aiSources.map(r => r.visits), 1)
  const maxCountry = Math.max(...topCountries.map(r => r.visits), 1)
  const maxDevice  = Math.max(...Object.values(devices), 1)
  const maxEntry   = Math.max(...entryPages.map(r => r.count), 1)
  const maxExit    = Math.max(...exitPages.map(r => r.count), 1)
  const maxEvent   = Math.max(...customEvents.map(r => r.count), 1)
  const maxOutbound= Math.max(...outboundLinks.map(r => r.count), 1)
  const maxBrowser = Math.max(...browsers.map(r => r.visitors), 1)
  const maxOS      = Math.max(...osList.map(r => r.visitors), 1)
  const trendMax   = Math.max(...trend.map(t => t.views), 1)

  const trackerFile = site?.cookieless_mode ? 'tracker.cookieless.js' : 'tracker.min.js'
  const snippetUrl = site
    ? `<script async src="${window.location.origin}/tracker/${trackerFile}" data-site-key="${site.site_key}"></script>`
    : ''

  function toggleFilter(type, value) {
    if (filter?.type === type && filter?.value === value) setFilter(null)
    else setFilter({ type, value })
  }
  function isActive(type, value) {
    return filter?.type === type && filter?.value === value
  }

  function copySnippet() {
    navigator.clipboard.writeText(snippetUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function delta(current, prior, inverted = false) {
    if (prior == null || prior === 0) return null
    const pct = ((current - prior) / Math.abs(prior)) * 100
    const isPositive = inverted ? pct < 0 : pct > 0
    const isNeg = inverted ? pct > 0 : pct < 0
    return { pct: Math.abs(pct).toFixed(1), color: isPositive ? 'text-green-600' : isNeg ? 'text-red-500' : 'text-st-gray' }
  }

  const pageviewsDelta = delta(kpis.pageviews, priorKpis.pageviews)
  const visitorsDelta = delta(kpis.unique_visitors, priorKpis.unique_visitors)
  const bounceDelta = delta(kpis.bounce_rate, priorKpis.bounce_rate, true)
  const durationDelta = delta(kpis.avg_duration_seconds, priorKpis.avg_duration_seconds)

  const KPI_ITEMS = [
    { label: 'Pageviews',      value: kpis.pageviews?.toLocaleString()          ?? '—', delta: pageviewsDelta },
    { label: 'Visitors',       value: kpis.unique_visitors?.toLocaleString()    ?? '—', delta: visitorsDelta },
    { label: 'Bounce rate',    value: kpis.bounce_rate != null ? formatPercent(kpis.bounce_rate, 1) : '—', delta: bounceDelta },
    { label: 'Duration',       value: fmtDuration(kpis.avg_duration_seconds), delta: durationDelta },
    { label: 'New visitors',   value: newVisitors > 0 ? `${newPct}%` : '—',
      sub: newVisitors > 0 ? `${newVisitors.toLocaleString()} new · ${returningVisitors.toLocaleString()} returning` : null },
  ]

  const LEFT_TABS = [
    { key: 'pages',  label: 'Pages' },
    { key: 'entry',  label: 'Entry' },
    { key: 'exit',   label: 'Exit' },
    { key: 'events', label: 'Events' },
  ]

  const RIGHT_TABS = [
    { key: 'sources',   label: 'Sources' },
    { key: 'ai',        label: '✦ AI Traffic' },
    { key: 'countries', label: 'Countries' },
    { key: 'devices',   label: 'Devices' },
    { key: 'browsers',  label: 'Browsers' },
    { key: 'os',        label: 'OS' },
  ]

  if (!site) return null

  return (
    <div className="st-container space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-st-black">Analytics</h2>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-full">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${liveCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-xs font-medium text-st-black">{liveCount}</span>
            <span className="text-xs text-st-gray">live</span>
            <button onClick={() => refetchLive()} className="text-st-gray hover:text-st-black ml-0.5">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <div className="hidden sm:flex gap-1.5">
            {['Cookieless','No consent','GDPR'].map(b => (
              <span key={b} className="text-[10px] text-st-gray border border-gray-200 rounded-full px-2 py-0.5">{b}</span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {[{l:'24h',d:1},{l:'7d',d:7},{l:'30d',d:30},{l:'90d',d:90}].map(t => (
            <button key={t.d} onClick={() => setDays(t.d)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                days === t.d ? 'bg-white text-st-black shadow-sm' : 'text-st-gray hover:text-st-black'
              }`}>
              {t.l}
            </button>
          ))}
        </div>
      </div>

      {/* Active filter pill */}
      {filter && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-st-gray">Filtered by:</span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-st-black text-white rounded-full text-xs font-medium">
            {filter.type}: {filter.value}
            <button onClick={() => setFilter(null)} className="opacity-70 hover:opacity-100 text-sm leading-none">×</button>
          </span>
          <span className="text-xs text-st-gray">Click again to remove</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
        </div>
      ) : !d ? (
        <div className="max-w-lg mx-auto py-16 text-center space-y-6">
          <Eye className="w-12 h-12 text-gray-200 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-st-black mb-2">No analytics data yet</h3>
            <p className="text-sm text-st-gray">Add the tracking script to your site to start collecting data.</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-left">
            <p className="text-xs font-semibold text-gray-700 mb-2">Add to your site &lt;head&gt;:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-gray-600 flex-1 break-all">{snippetUrl}</code>
              <button onClick={copySnippet} className="flex-shrink-0 p-1.5 text-st-gray hover:text-st-black border border-gray-200 rounded-lg">
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* KPI bar */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-5 divide-x divide-gray-100">
              {KPI_ITEMS.map((k, i) => (
                <div key={i} className="px-4 py-3">
                  <p className="text-[11px] text-st-gray font-medium mb-1">{k.label}</p>
                  <p className="text-xl font-semibold text-st-black">{k.value}</p>
                  {k.delta && (
                    <p className={`text-[10px] font-medium mt-0.5 ${k.delta.color}`}>
                      {k.delta.pct}% vs prior
                    </p>
                  )}
                  {k.sub && <p className="text-[10px] text-st-gray mt-0.5">{k.sub}</p>}
                </div>
              ))}
            </div>
            {/* Trend bars */}
            {trend.length > 0 && (
              <div className="px-4 pb-3 pt-1 border-t border-gray-50">
                <div className="flex items-end gap-px h-10">
                  {trend.map((t, i) => (
                    <div key={i} className="flex-1 bg-st-black rounded-sm opacity-20 hover:opacity-60 transition-opacity"
                      style={{ height: `${Math.max(4, (t.views / trendMax) * 100)}%` }}
                      title={`${t.date}: ${t.views?.toLocaleString()} views`} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Two-column panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Left: Pages / Entry / Exit / Events */}
            <TabPanel tabs={LEFT_TABS} activeTab={leftTab} onTab={setLeftTab}>
              {leftTab === 'pages' && (
                topPages.length === 0
                  ? <p className="text-xs text-st-gray py-8 text-center">No page data yet</p>
                  : topPages.map((r, i) => (
                    <DataRow key={i} label={stripOrigin(r.page)} value={r.views} max={maxPage}
                      pct={Math.round(r.views / kpis.pageviews * 100)}
                      onClick={() => toggleFilter('Page', stripOrigin(r.page))}
                      active={isActive('Page', stripOrigin(r.page))} />
                  ))
              )}
              {leftTab === 'entry' && (
                entryPages.length === 0
                  ? <p className="text-xs text-st-gray py-8 text-center">No entry data yet</p>
                  : entryPages.map((r, i) => (
                    <DataRow key={i} label={stripOrigin(r.page)} value={r.count} max={maxEntry} pct={r.pct}
                      onClick={() => toggleFilter('Entry', stripOrigin(r.page))}
                      active={isActive('Entry', stripOrigin(r.page))} />
                  ))
              )}
              {leftTab === 'exit' && (
                exitPages.length === 0
                  ? <p className="text-xs text-st-gray py-8 text-center">No exit data yet</p>
                  : exitPages.map((r, i) => (
                    <DataRow key={i} label={stripOrigin(r.page)} value={r.count} max={maxExit} pct={r.pct}
                      onClick={() => toggleFilter('Exit', stripOrigin(r.page))}
                      active={isActive('Exit', stripOrigin(r.page))} />
                  ))
              )}
              {leftTab === 'events' && (
                customEvents.length === 0 ? (
                  <div className="py-8 text-center space-y-3 px-4">
                    <Zap className="w-6 h-6 text-gray-200 mx-auto" />
                    <p className="text-xs text-st-gray">No custom events yet</p>
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-left">
                      <code className="text-[11px] text-gray-500">sourcetrack.track('signup', {'{ plan: "pro" }'})</code>
                    </div>
                  </div>
                ) : customEvents.map((e, i) => (
                  <DataRow key={i} label={e.name} value={e.count} max={maxEvent}
                    onClick={() => toggleFilter('Event', e.name)}
                    active={isActive('Event', e.name)} />
                ))
              )}
            </TabPanel>

            {/* Right: Sources / AI / Countries / Devices */}
            <TabPanel tabs={RIGHT_TABS} activeTab={rightTab} onTab={setRightTab}>
              {rightTab === 'sources' && (
                topSources.length === 0
                  ? <p className="text-xs text-st-gray py-8 text-center">No source data yet</p>
                  : topSources.map((r, i) => {
                    const isAI = r.source?.startsWith('AI:')
                    const label = isAI ? r.source.replace('AI:', '').trim() : r.source
                    return (
                      <DataRow key={i} label={label} value={r.visits} max={maxSource}
                        pct={Math.round(r.visits / kpis.unique_visitors * 100)}
                        isAI={isAI}
                        onClick={() => toggleFilter('Source', label)}
                        active={isActive('Source', label)} />
                    )
                  })
              )}
              {rightTab === 'ai' && (
                aiSources.length === 0 ? (
                  <div className="py-8 text-center space-y-2">
                    <Sparkles className="w-6 h-6 text-gray-200 mx-auto" />
                    <p className="text-xs text-st-gray">No AI traffic detected yet</p>
                    <p className="text-[11px] text-st-gray px-6">When visitors arrive from ChatGPT, Claude, Perplexity or other AI platforms, they'll appear here.</p>
                  </div>
                ) : (
                  <>
                    <div className="px-4 py-2 bg-purple-50 border-b border-purple-100">
                      <p className="text-[11px] text-purple-700 font-medium">
                        ✦ AI search drove {Math.round(aiSources.reduce((s,r)=>s+r.visits,0) / (kpis.unique_visitors||1) * 100)}% of all traffic
                      </p>
                    </div>
                    {aiSources.map((r, i) => (
                      <DataRow key={i} label={r.source} value={r.visits} max={maxAI} isAI
                        onClick={() => toggleFilter('AI Source', r.source)}
                        active={isActive('AI Source', r.source)} />
                    ))}
                  </>
                )
              )}
              {rightTab === 'countries' && (
                topCountries.length === 0
                  ? <p className="text-xs text-st-gray py-8 text-center">No country data yet</p>
                  : topCountries.map((r, i) => (
                    <DataRow key={i} label={r.country || 'Unknown'} value={r.visits} max={maxCountry}
                      pct={Math.round(r.visits / (kpis.unique_visitors||1) * 100)}
                      onClick={() => toggleFilter('Country', r.country)}
                      active={isActive('Country', r.country)} />
                  ))
              )}
              {rightTab === 'devices' && (
                Object.keys(devices).length === 0
                  ? <p className="text-xs text-st-gray py-8 text-center">No device data yet</p>
                  : Object.entries(devices).sort((a,b)=>b[1]-a[1]).map(([key, val], i) => (
                    <DataRow key={i} label={key.charAt(0).toUpperCase() + key.slice(1)} value={val} max={maxDevice}
                      pct={Math.round(val / Object.values(devices).reduce((s,v)=>s+v,0) * 100)}
                      onClick={() => toggleFilter('Device', key)}
                      active={isActive('Device', key)} />
                  ))
              )}
              {rightTab === 'browsers' && (
                browsers.length === 0
                  ? <p className="text-xs text-st-gray py-8 text-center">No browser data yet</p>
                  : browsers.map((r, i) => (
                    <DataRow key={i} label={r.browser} value={r.visitors} max={maxBrowser}
                      pct={r.percentage}
                      onClick={() => toggleFilter('Browser', r.browser)}
                      active={isActive('Browser', r.browser)} />
                  ))
              )}
              {rightTab === 'os' && (
                osList.length === 0
                  ? <p className="text-xs text-st-gray py-8 text-center">No OS data yet</p>
                  : osList.map((r, i) => (
                    <DataRow key={i} label={r.os} value={r.visitors} max={maxOS}
                      pct={r.percentage}
                      onClick={() => toggleFilter('OS', r.os)}
                      active={isActive('OS', r.os)} />
                  ))
              )}
            </TabPanel>
          </div>

          {/* Bottom: Outbound + Snippet */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                <ExternalLink className="w-3.5 h-3.5 text-st-gray" />
                <span className="text-xs font-medium text-st-black">Outbound Clicks</span>
              </div>
              {outboundLinks.length === 0 ? (
                <div className="py-6 text-center px-4">
                  <p className="text-xs text-st-gray">Tracked automatically — no setup needed</p>
                </div>
              ) : outboundLinks.map((r, i) => {
                let label = r.destination
                try { label = new URL(r.destination).hostname } catch (_) {}
                return <DataRow key={i} label={label} value={r.count} max={maxOutbound} />
              })}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-st-black">Tracking snippet</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-st-gray">Cookieless · No consent · GDPR</span>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center gap-2">
                <code className="text-[11px] text-gray-500 flex-1 truncate bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100">
                  {snippetUrl}
                </code>
                <button onClick={copySnippet}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-st-black text-white text-xs font-medium rounded-lg hover:bg-st-black/90">
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          {/* Funnel */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-3.5 h-3.5 text-st-gray" />
                <span className="text-xs font-medium text-st-black">Funnel Analysis</span>
              </div>
              <span className="text-[10px] text-st-gray">Privacy-safe · aggregate only</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={funnelInput}
                  onChange={e => setFunnelInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && funnelInput.trim() && setFunnelSteps(funnelInput.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8))}
                  placeholder="pricing, signup, dashboard"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-st-black/20"
                />
                <button
                  onClick={() => funnelInput.trim() && setFunnelSteps(funnelInput.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8))}
                  disabled={!funnelInput.trim()}
                  className="px-3 py-2 bg-st-black text-white text-xs font-medium rounded-lg hover:bg-st-black/90 disabled:opacity-40"
                >
                  Build Funnel
                </button>
                {funnelSteps.length > 0 && (
                  <button
                    onClick={() => { setFunnelInput(''); setFunnelSteps([]) }}
                    className="px-3 py-2 text-xs text-st-gray border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-[10px] text-st-gray">Enter URL path keywords, comma separated · Add up to 8 steps</p>
              <FunnelChart steps={funnelData} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
