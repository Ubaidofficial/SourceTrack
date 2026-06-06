import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getJourney } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import {
  Search, Globe, Bot, MousePointerClick, Clock, MapPin, Filter,
  ArrowRight, GitBranch, ChevronDown, ChevronRight, Zap, AlertCircle,
  Timer, FileText, LogIn, LogOut
} from 'lucide-react'
import { formatCurrencyDecimal } from '../utils/numbers'

const FILTERS = [
  { key: 'all', label: 'All Events' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'ai', label: 'AI Touchpoints' }
]

function normalizeUrl(urlStr) {
  if (!urlStr) return ''
  let cleaned = urlStr
  try {
    const url = new URL(urlStr)
    cleaned = url.origin + url.pathname
  } catch (err) {
    cleaned = urlStr.split('?')[0].split('#')[0]
  }
  return cleaned.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '<1s'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function truncateUrl(urlStr, maxLen = 60) {
  if (!urlStr) return ''
  try {
    const path = new URL(urlStr).pathname
    return path.length > maxLen ? path.slice(0, maxLen) + '…' : path
  } catch {
    return urlStr.length > maxLen ? urlStr.slice(0, maxLen) + '…' : urlStr
  }
}

export default function Journey() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [site, setSite] = useState(null)
  const [visitorId, setVisitorId] = useState('')
  const [searchId, setSearchId] = useState('')
  const [filter, setFilter] = useState('all')
  const [expandedSessions, setExpandedSessions] = useState({})
  const [expandedEvents, setExpandedEvents] = useState({})

  useEffect(() => {
    async function load() {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const query = supabase
        .from('sites')
        .select('site_key')
        .limit(1)

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
    const vid = searchParams.get('visitorId')
    if (vid) {
      setVisitorId(vid)
      setSearchId(vid)
    }
  }, [searchParams])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['journey', site?.site_key, searchId],
    queryFn: () => getJourney(site?.site_key, searchId),
    enabled: !!site && !!searchId
  })

  const sessions = data?.sessions || []
  const events = data?.events || []

  // Filter events for the flat path summary
  const filteredEvents = filter === 'all'
    ? events
    : filter === 'conversions'
      ? events.filter(e => e.event === '$conversion')
      : events.filter(e => e.ai_source != null && e.ai_source !== '')

  const eventIcons = {
    '$pageview': Globe,
    '$conversion': MousePointerClick,
    'outbound_click': MousePointerClick
  }

  function toggleSession(idx) {
    setExpandedSessions(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  function toggleEvent(sessionIdx, eventIdx) {
    const key = `${sessionIdx}-${eventIdx}`
    setExpandedEvents(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // Build a simple pre-conversion path summary from ordered events.
  function buildPathSummary(allEvents) {
    if (!allEvents || allEvents.length === 0) return null

    const firstConversionIdx = allEvents.findIndex(e => e.event === '$conversion')
    const preConversion = firstConversionIdx >= 0
      ? allEvents.slice(0, firstConversionIdx + 1)
      : allEvents

    const segments = []
    for (const e of preConversion) {
      let label = null
      if (e.page_url) {
        try { label = new URL(e.page_url).pathname } catch { label = e.page_url }
        if (label.length > 1 && label.endsWith('/')) label = label.slice(0, -1)
      }
      if (!label || label === '/') {
        label = e.utm_source || 'unknown'
      }
      if (segments.length === 0 || segments[segments.length - 1] !== label) {
        segments.push(label)
      }
    }

    const hasConversion = firstConversionIdx >= 0
    return { segments, hasConversion }
  }

  const pathSummary = events.length > 0 ? buildPathSummary(events) : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-st-black">Visitor Journey</h2>
        <p className="text-sm text-st-gray mt-1">Search for a visitor to see their full journey grouped by sessions</p>
      </div>

      {/* Search */}
      <form
        onSubmit={(e) => { e.preventDefault(); setSearchId(visitorId.trim()); setExpandedSessions({}); setExpandedEvents({}) }}
        className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
      >
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-st-gray" />
            <input
              type="text"
              value={visitorId}
              onChange={(e) => setVisitorId(e.target.value)}
              placeholder="Enter visitor ID..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <button
            type="submit"
            disabled={!visitorId.trim()}
            className="px-4 py-2 bg-st-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
          >
            Search
          </button>
        </div>
      </form>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">Journey query failed</p>
            <p className="text-xs text-red-600 mt-1">{error?.message || 'An unexpected error occurred. Please try again.'}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {data && !isLoading && !isError && (
        <div className="space-y-4">
          {/* Summary bar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Visitor: {data.visitor_id}</h3>
                <p className="text-xs text-st-gray mt-0.5">
                  {data.session_count || 0} session{data.session_count !== 1 ? 's' : ''} · {data.event_count} events
                </p>
              </div>

              {/* Filter toggles */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-st-gray flex-shrink-0" />
                {FILTERS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      filter === f.key
                        ? 'bg-st-black text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Session aggregates */}
            {data.session_aggregates && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3 border-t border-gray-100">
                <AggregateStat label="Sessions" value={data.session_aggregates.total_sessions} />
                <AggregateStat label="Avg Duration" value={formatDuration(data.session_aggregates.avg_duration_seconds)} />
                <AggregateStat label="Avg Pages/Session" value={data.session_aggregates.avg_pageviews_per_session} />
                <AggregateStat label="Converting Sessions" value={data.session_aggregates.conversion_sessions} />
                <AggregateStat label="Total Revenue" value={data.session_aggregates.total_conversion_value > 0 ? formatCurrencyDecimal(data.session_aggregates.total_conversion_value) : '—'} />
              </div>
            )}
          </div>

          {/* Path Summary */}
          {pathSummary && pathSummary.segments.length >= 2 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <GitBranch className="w-3.5 h-3.5 text-st-gray" />
                <span className="text-xs text-st-gray font-medium uppercase tracking-wider">
                  Pre-conversion path summary
                </span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                {pathSummary.segments.map((seg, idx) => (
                  <span key={idx} className="flex items-center gap-1.5">
                    <span className={`px-2 py-1 rounded font-medium ${
                      idx === pathSummary.segments.length - 1 && pathSummary.hasConversion
                        ? 'bg-lime-100 text-lime-800'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {seg}
                    </span>
                    {idx < pathSummary.segments.length - 1 && (
                      <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                    )}
                  </span>
                ))}
              </div>
              <p className="text-xs text-st-gray mt-1.5">
                Consecutive duplicate pages merged. Based on ordered event data only — not full path analytics.
              </p>
            </div>
          )}

          {/* Session cards */}
          {sessions.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-sm text-st-gray">No events found for this visitor.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session, sIdx) => {
                const isOpen = expandedSessions[sIdx]
                const sessionEvents = session.events || []
                const filtered = filter === 'all'
                  ? sessionEvents
                  : filter === 'conversions'
                    ? sessionEvents.filter(e => e.event === '$conversion')
                    : sessionEvents.filter(e => e.ai_source != null && e.ai_source !== '')

                return (
                  <div
                    key={sIdx}
                    className={`bg-white rounded-xl shadow-sm border transition-all ${
                      session.contains_conversion
                        ? 'border-lime-300 bg-lime-50/30'
                        : 'border-gray-200'
                    }`}
                  >
                    {/* Session header — clickable */}
                    <button
                      onClick={() => toggleSession(sIdx)}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50/50 transition-colors rounded-xl"
                    >
                      {/* Session index badge */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                        session.contains_conversion
                          ? 'bg-lime-200 text-lime-900'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        #{session.session_index}
                      </div>

                      {/* Session meta */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">
                            Session {session.session_index}
                          </span>
                          {/* Source badge */}
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium truncate max-w-[140px]">
                            {session.source_label || 'Direct'}
                          </span>
                          {session.contains_conversion && (
                            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-lime-100 text-lime-800 font-medium">
                              <Zap className="w-3 h-3" /> Converted
                            </span>
                          )}
                          {session.conversion_value > 0 && (
                            <span className="text-xs font-semibold text-green-700">
                              {formatCurrencyDecimal(session.conversion_value)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-st-gray">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(session.started_at).toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {formatDuration(session.duration_seconds)}
                          </span>
                          <span className="flex items-center gap-1">
                            <FileText className="w-3 h-3" />
                            {session.pageview_count} page{session.pageview_count !== 1 ? 's' : ''} · {session.event_count} event{session.event_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        {/* Entry / Exit pages */}
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-st-gray">
                          {session.entry_page && (
                            <span className="flex items-center gap-1 truncate max-w-[200px]" title={session.entry_page}>
                              <LogIn className="w-3 h-3 flex-shrink-0" />
                              {truncateUrl(session.entry_page, 40)}
                            </span>
                          )}
                          {session.exit_page && session.exit_page !== session.entry_page && (
                            <>
                              <ArrowRight className="w-3 h-3 text-gray-300 flex-shrink-0" />
                              <span className="flex items-center gap-1 truncate max-w-[200px]" title={session.exit_page}>
                                <LogOut className="w-3 h-3 flex-shrink-0" />
                                {truncateUrl(session.exit_page, 40)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expand chevron */}
                      <div className="flex-shrink-0 text-gray-400">
                        {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </button>

                    {/* Expanded events timeline */}
                    {isOpen && (
                      <div className="px-4 pb-4 border-t border-gray-100">
                        {filtered.length === 0 ? (
                          <p className="text-sm text-st-gray py-4 text-center">
                            No {filter === 'conversions' ? 'conversion' : filter === 'ai' ? 'AI-referred' : ''} events in this session.
                          </p>
                        ) : (
                          <div className="relative pl-6 border-l-2 border-gray-200 space-y-4 mt-3">
                            {filtered.map((e, eIdx) => {
                              const Icon = eventIcons[e.event] || Clock
                              const isEventExpanded = expandedEvents[`${sIdx}-${eIdx}`]
                              return (
                                <div key={eIdx} className="relative -left-[27px] flex gap-3">
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                    e.is_conversion ? 'bg-green-100' : 'bg-gray-100'
                                  }`}>
                                    <Icon className={`w-3 h-3 ${e.is_conversion ? 'text-green-600' : 'text-gray-700'}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div
                                      className="flex items-center gap-2 cursor-pointer"
                                      onClick={() => toggleEvent(sIdx, eIdx)}
                                    >
                                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                        e.is_conversion ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                                      }`}>
                                        {e.event === 'outbound_click' ? 'Outbound Click' : e.event}
                                      </span>
                                      {e.ai_source && (
                                        <span className="flex items-center gap-1 text-xs text-purple-600">
                                          <Bot className="w-3 h-3" />
                                          {e.ai_source}
                                        </span>
                                      )}
                                      {e.conversion_value != null && e.conversion_value > 0 && (
                                        <span className="text-xs font-medium text-green-600">{formatCurrencyDecimal(e.conversion_value)}</span>
                                      )}
                                      <span className="ml-auto flex-shrink-0 text-gray-400">
                                        {isEventExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-0.5 text-xs text-st-gray">
                                      <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(e.timestamp).toLocaleString()}
                                      </span>
                                      {e.country && (
                                        <span className="flex items-center gap-1">
                                          <MapPin className="w-3 h-3" />
                                          {e.country}
                                        </span>
                                      )}
                                    </div>
                                    {e.page_url && (
                                      <p className="text-xs text-st-gray mt-0.5 truncate max-w-xs sm:max-w-md break-all" title={e.page_url}>
                                        {normalizeUrl(e.page_url)}
                                      </p>
                                    )}
                                    {/* Expanded event detail */}
                                    {isEventExpanded && (
                                      <div className="mt-2 p-2 bg-gray-50 rounded-lg text-xs text-st-gray space-y-1">
                                        {e.utm_source && (
                                          <p>UTM: {[e.utm_source, e.utm_medium, e.utm_campaign].filter(Boolean).join(' / ')}</p>
                                        )}
                                        {e.referrer && <p>Referrer: {e.referrer}</p>}
                                        {e.device_type && <p>Device: {e.device_type}</p>}
                                        {e.browser_name && <p>Browser: {[e.browser_name, e.browser_version].filter(Boolean).join(' ')}</p>}
                                        {e.os_name && <p>OS: {[e.os_name, e.os_version].filter(Boolean).join(' ')}</p>}
                                        {e.conversion_type && <p>Conversion Type: {e.conversion_type}</p>}
                                        {e.order_id && <p>Order ID: {e.order_id}</p>}
                                        {e.destination_domain && <p>Destination: {e.destination_domain}</p>}
                                        {e.destination_url && <p className="break-all">Destination URL: {normalizeUrl(e.destination_url)}</p>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AggregateStat({ label, value }) {
  return (
    <div className="text-center">
      <p className="text-sm font-bold text-gray-800">{value ?? '—'}</p>
      <p className="text-[10px] text-st-gray uppercase tracking-wide">{label}</p>
    </div>
  )
}
