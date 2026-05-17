import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Monitor, Smartphone, Tablet, Sparkles, TrendingUp, Users, Eye, Clock, Radio, LogIn, LogOut, ExternalLink, Zap, RefreshCw, UserCheck, UserPlus } from 'lucide-react'
import MetricTile from '../components/MetricTile'
import DashboardCard from '../components/DashboardCard'

const TIME_RANGES = [
  { label: '24h', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

function BarRow({ label, value, max }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600 w-36 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-st-black rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-st-black w-10 text-right flex-shrink-0">
        {value.toLocaleString()}
      </span>
    </div>
  )
}

function fmtDuration(seconds) {
  if (!seconds) return '0s'
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export default function Analytics() {
  const { user } = useAuth()
  const [days, setDays] = useState(30)

  const { data: site } = useQuery({
    queryKey: ['site', user?.id],
    queryFn: async () => {
      const { data: member } = await supabase
        .from('company_members').select('company_id').eq('user_id', user.id).maybeSingle()
      const query = supabase.from('sites').select('site_key, name, domain').limit(1)
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

  const d = summary?.data
  const kpis = d?.kpis || {}
  const newVisitors       = kpis.new_visitors ?? 0
  const returningVisitors = kpis.returning_visitors ?? 0
  const totalVisitors     = (newVisitors + returningVisitors) || 1
  const newPct            = Math.round(newVisitors / totalVisitors * 100)
  const returningPct      = Math.round(returningVisitors / totalVisitors * 100)
  const topPages = d?.top_pages || []
  const topSources = d?.top_sources || []
  const aiSources = d?.ai_sources || []
  const devices = d?.devices || {}
  const topCountries = d?.top_countries || []
  const trend = d?.trend || []

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

  const liveCount = liveData?.live_visitors ?? 0
  const entryPages = entryExitData?.data?.entry_pages || []
  const exitPages = entryExitData?.data?.exit_pages || []
  const outboundLinks = outboundData?.data || []
  const customEvents = customEventsData?.data?.events || []
  const recentEvents = customEventsData?.data?.recent || []

  const maxPage = Math.max(...topPages.map(r => r.views), 1)
  const maxSource = Math.max(...topSources.map(r => r.visits), 1)
  const maxCountry = Math.max(...topCountries.map(r => r.visits), 1)

  const snippetUrl = site
    ? `<script defer src="${window.location.origin}/analytics.js" data-site-key="${site.site_key}"></script>`
    : ''

  return (
    <div className="st-container space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-st-black">Analytics</h2>
          <p className="text-sm text-st-gray mt-0.5">Privacy-friendly, cookieless web analytics</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${liveCount > 0 ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
            <span className="text-xs font-medium text-st-black">{liveCount}</span>
            <span className="text-xs text-st-gray">live now</span>
            <button onClick={() => refetchLive()} className="ml-1 text-st-gray hover:text-st-black">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          {TIME_RANGES.map(tr => (
            <button key={tr.days} onClick={() => setDays(tr.days)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                days === tr.days ? 'bg-st-black text-white' : 'text-st-gray hover:bg-gray-100'
              }`}>
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
        </div>
      ) : !d ? (
        <div className="max-w-lg mx-auto py-16 text-center space-y-6">
          <Eye className="w-12 h-12 text-gray-200 mx-auto" />
          <div>
            <h3 className="text-lg font-semibold text-st-black mb-2">No analytics data yet</h3>
            <p className="text-sm text-st-gray">Add the analytics tracker to your site to start collecting pageview data.</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-left">
            <p className="text-xs font-semibold text-gray-700 mb-2">Add to your site head:</p>
            <code className="text-xs text-gray-600 break-all">{snippetUrl}</code>
          </div>
          <p className="text-xs text-st-gray">Cookieless · No consent banner required · GDPR compliant</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricTile label="Pageviews" value={kpis.pageviews} format="number" />
            <MetricTile label="Unique Visitors" value={kpis.unique_visitors} format="number" />
            <MetricTile label="Bounce Rate" value={kpis.bounce_rate} format="percent" />
            <MetricTile label="Avg Duration" value={fmtDuration(kpis.avg_duration_seconds)} format="text" />
          </div>

          {/* New vs Returning visitors */}
          {(newVisitors > 0 || returningVisitors > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <DashboardCard title="New vs Returning" subtitle="Visitor breakdown this period">
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-3">
                    <UserPlus className="w-4 h-4 text-st-gray flex-shrink-0" />
                    <span className="text-sm text-gray-600 w-20">New</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-st-black rounded-full" style={{ width: `${newPct}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-st-black w-10 text-right">{newPct}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <UserCheck className="w-4 h-4 text-st-gray flex-shrink-0" />
                    <span className="text-sm text-gray-600 w-20">Returning</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-st-lime rounded-full" style={{ width: `${returningPct}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-st-black w-10 text-right">{returningPct}%</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100 flex justify-between text-xs text-st-gray">
                    <span>{newVisitors.toLocaleString()} new</span>
                    <span>{returningVisitors.toLocaleString()} returning</span>
                  </div>
                </div>
              </DashboardCard>

              <div className="lg:col-span-2">
                {trend.length > 0 && (
                  <DashboardCard title="Pageviews Over Time" subtitle={`Last ${days} days`}>
                    <div className="h-24 flex items-end gap-1 pt-2">
                      {(() => {
                        const max = Math.max(...trend.map(d => d.views), 1)
                        return trend.map((d, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-st-black rounded-sm" style={{ height: `${(d.views / max) * 100}%`, minHeight: 2 }} />
                            {trend.length <= 14 && <span className="text-[9px] text-st-gray">{d.date.slice(5)}</span>}
                          </div>
                        ))
                      })()}
                    </div>
                  </DashboardCard>
                )}
              </div>
            </div>
          )}

          {trend.length > 0 && !(newVisitors > 0 || returningVisitors > 0) && (
            <DashboardCard title="Pageviews Over Time" subtitle={`Last ${days} days`}>
              <div className="h-24 flex items-end gap-1 pt-2">
                {(() => {
                  const max = Math.max(...trend.map(d => d.views), 1)
                  return trend.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-st-black rounded-sm"
                        style={{ height: `${(d.views / max) * 100}%`, minHeight: 2 }} />
                      {trend.length <= 14 && (
                        <span className="text-[9px] text-st-gray">{d.date.slice(5)}</span>
                      )}
                    </div>
                  ))
                })()}
              </div>
            </DashboardCard>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard title="Top Pages" subtitle="By pageviews">
              {topPages.length === 0
                ? <p className="text-sm text-st-gray py-4 text-center">No data</p>
                : topPages.map((r, i) => <BarRow key={i} label={r.page} value={r.views} max={maxPage} />)
              }
            </DashboardCard>
            <DashboardCard title="Top Sources" subtitle="Traffic origins including AI platforms">
              {topSources.length === 0
                ? <p className="text-sm text-st-gray py-4 text-center">No data</p>
                : topSources.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <span className={`text-sm w-36 truncate flex-shrink-0 ${r.source.startsWith('AI:') ? 'text-lime-700 font-medium' : 'text-gray-600'}`}>
                      {r.source.startsWith('AI:') ? '✦ ' : ''}{r.source}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${r.source.startsWith('AI:') ? 'bg-lime-500' : 'bg-st-black'}`}
                        style={{ width: `${(r.visits / maxSource) * 100}%` }} />
                    </div>
                    <span className="text-sm font-medium text-st-black w-10 text-right flex-shrink-0">
                      {r.visits.toLocaleString()}
                    </span>
                  </div>
                ))
              }
            </DashboardCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <DashboardCard title="AI Traffic" subtitle="Visits from AI platforms"
              action={<Sparkles className="w-4 h-4 text-lime-500" />}>
              {aiSources.length === 0 ? (
                <div className="py-6 text-center">
                  <Sparkles className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-xs text-st-gray">No AI traffic yet</p>
                </div>
              ) : aiSources.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-700 font-medium">{r.source}</span>
                  <span className="text-sm font-semibold text-st-black">{r.visits.toLocaleString()}</span>
                </div>
              ))}
            </DashboardCard>

            <DashboardCard title="Devices" subtitle="Visitor device breakdown">
              <div className="space-y-3 pt-2">
                {[
                  { key: 'desktop', label: 'Desktop', icon: Monitor },
                  { key: 'mobile', label: 'Mobile', icon: Smartphone },
                  { key: 'tablet', label: 'Tablet', icon: Tablet }
                ].map(({ key, label, icon: Icon }) => {
                  const val = devices[key] || 0
                  const total = Object.values(devices).reduce((a, b) => a + b, 0) || 1
                  const pct = Math.round((val / total) * 100)
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-st-gray flex-shrink-0" />
                      <span className="text-sm text-gray-600 w-16">{label}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-st-black rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-st-gray w-8 text-right">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </DashboardCard>

            <DashboardCard title="Top Countries" subtitle="By visits">
              {topCountries.length === 0
                ? <p className="text-sm text-st-gray py-4 text-center">No data</p>
                : topCountries.slice(0, 8).map((r, i) => (
                  <BarRow key={i} label={r.country} value={r.visits} max={maxCountry} />
                ))
              }
            </DashboardCard>
          </div>

          {/* Entry / Exit Pages */}
          {(entryPages.length > 0 || exitPages.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DashboardCard title="Entry Pages" subtitle="Where visitors start their session"
                action={<LogIn className="w-4 h-4 text-st-gray" />}>
                {entryPages.length === 0
                  ? <p className="text-sm text-st-gray py-4 text-center">No data</p>
                  : entryPages.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-600 flex-1 truncate">{r.page.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
                      <span className="text-xs text-st-gray">{r.pct}%</span>
                      <span className="text-sm font-medium text-st-black w-10 text-right">{r.count.toLocaleString()}</span>
                    </div>
                  ))
                }
              </DashboardCard>
              <DashboardCard title="Exit Pages" subtitle="Where visitors leave"
                action={<LogOut className="w-4 h-4 text-st-gray" />}>
                {exitPages.length === 0
                  ? <p className="text-sm text-st-gray py-4 text-center">No data</p>
                  : exitPages.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-600 flex-1 truncate">{r.page.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
                      <span className="text-xs text-st-gray">{r.pct}%</span>
                      <span className="text-sm font-medium text-st-black w-10 text-right">{r.count.toLocaleString()}</span>
                    </div>
                  ))
                }
              </DashboardCard>
            </div>
          )}

          {/* Outbound Clicks + Custom Events */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DashboardCard title="Outbound Clicks" subtitle="External links your visitors click"
              action={<ExternalLink className="w-4 h-4 text-st-gray" />}>
              {outboundLinks.length === 0 ? (
                <div className="py-6 text-center space-y-2">
                  <ExternalLink className="w-7 h-7 text-gray-200 mx-auto" />
                  <p className="text-xs text-st-gray">Outbound clicks tracked automatically — no setup needed</p>
                </div>
              ) : outboundLinks.map((r, i) => {
                let label = r.destination
                try { label = new URL(r.destination).hostname } catch (_e) {}
                return (
                  <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                    <ExternalLink className="w-3.5 h-3.5 text-st-gray flex-shrink-0" />
                    <span className="text-sm text-gray-600 flex-1 truncate">{label}</span>
                    <span className="text-sm font-medium text-st-black">{r.count.toLocaleString()}</span>
                  </div>
                )
              })}
            </DashboardCard>

            <DashboardCard title="Custom Events" subtitle="Track anything with sourcetrack.track()"
              action={<Zap className="w-4 h-4 text-st-gray" />}>
              {customEvents.length === 0 ? (
                <div className="py-4 space-y-3 text-center">
                  <Zap className="w-7 h-7 text-gray-200 mx-auto" />
                  <p className="text-xs text-st-gray">No custom events yet</p>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-left">
                    <p className="text-xs font-medium text-gray-700 mb-1">Track custom events:</p>
                    <code className="text-xs text-gray-500">sourcetrack.track('signup', {'{ plan: "pro" }'})</code>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {customEvents.map((e, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-st-black flex-shrink-0" />
                        <span className="text-sm font-medium text-st-black">{e.name}</span>
                      </div>
                      <span className="text-sm text-st-gray">{e.count.toLocaleString()}</span>
                    </div>
                  ))}
                  {recentEvents.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs font-medium text-st-gray mb-2">Recent</p>
                      {recentEvents.slice(0, 5).map((e, i) => (
                        <div key={i} className="flex items-center gap-2 py-1 text-xs text-st-gray">
                          <span className="font-medium text-st-black">{e.name}</span>
                          <span className="truncate flex-1">{e.url?.replace(/^https?:\/\/[^/]+/, '') || ''}</span>
                          <span className="flex-shrink-0">{new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </DashboardCard>
          </div>

          <DashboardCard title="Analytics Snippet" subtitle="Cookieless · No consent banner · GDPR compliant">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center gap-3">
              <code className="text-xs text-gray-600 flex-1 break-all">{snippetUrl}</code>
              <button onClick={() => navigator.clipboard.writeText(snippetUrl)}
                className="text-xs text-st-gray hover:text-st-black px-2 py-1 border border-gray-200 rounded flex-shrink-0">
                Copy
              </button>
            </div>
          </DashboardCard>
        </>
      )}
    </div>
  )
}
