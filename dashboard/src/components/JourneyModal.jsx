import { useState, useEffect } from 'react'
import { getJourney, fetchApi } from '../lib/api'
import {
  Clock, Globe, MousePointerClick, User, Bot, MapPin,
  Download, X, ChevronDown, ChevronRight, Zap, ArrowRight,
  Timer, LogIn, LogOut, AlertCircle
} from 'lucide-react'
import { safeNumber } from '../utils/numbers'

const EVENT_ICONS = {
  '$pageview':   Globe,
  '$conversion': MousePointerClick,
  '$identify':   User,
  'outbound_click': MousePointerClick
}

const AI_COLORS = {
  'ChatGPT':    'text-emerald-600 bg-emerald-50',
  'Claude':     'text-orange-600 bg-orange-50',
  'Perplexity': 'text-purple-600 bg-purple-50',
  'Gemini':     'text-blue-600 bg-blue-50',
  'Grok':       'text-gray-600 dark:text-gray-300 bg-gray-100',
  'Copilot':    'text-sky-600 bg-sky-50',
  'DeepSeek':   'text-cyan-600 bg-cyan-50',
}
const getAIColor = (src) => AI_COLORS[src] || 'text-purple-600 bg-purple-50'

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

function formatDateTime(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

function shortIdentifier(value) {
  if (!value) return '—'
  const text = String(value)
  if (text.length <= 18) return text
  return `${text.slice(0, 8)}...${text.slice(-6)}`
}

function nameVersion(name, version) {
  if (!name) return null
  return [name, version].filter(Boolean).join(' ')
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '<1s'
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function truncateUrl(urlStr, maxLen = 50) {
  if (!urlStr) return ''
  try {
    const path = new URL(urlStr).pathname
    return path.length > maxLen ? path.slice(0, maxLen) + '…' : path
  } catch {
    return urlStr.length > maxLen ? urlStr.slice(0, maxLen) + '…' : urlStr
  }
}

export default function JourneyModal({ visitorId, siteKey, leadSummary, onClose, onQualified }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [filter, setFilter]   = useState('all') // all | conversions | ai
  const [expandedSessions, setExpandedSessions] = useState({})
  const [expandedEvents, setExpandedEvents] = useState({})

  // Local status so the dropdown holds the chosen value instead of snapping back
  // to the prop. Seeded from the persisted status (GET /leads -> canonical
  // 'unqualified' | 'qualified' | 'mql' | 'sql' | null); null/unknown -> 'unqualified'.
  const [statusValue, setStatusValue] = useState(
    ['unqualified', 'qualified', 'mql', 'sql'].includes(leadSummary?.status) ? leadSummary.status : 'unqualified'
  )
  useEffect(() => {
    setStatusValue(['unqualified', 'qualified', 'mql', 'sql'].includes(leadSummary?.status) ? leadSummary.status : 'unqualified')
  }, [leadSummary?.status])

  useEffect(() => {
    if (!visitorId || !siteKey) return
    setLoading(true)
    setError(null)
    getJourney(siteKey, visitorId)
      .then(setData)
      .catch(err => setError(err.message || 'Failed to load journey'))
      .finally(() => setLoading(false))
  }, [visitorId, siteKey])

  const allEvents = data?.events || []
  const sessions = data?.sessions || []

  const summary = computeSummary(allEvents, data, leadSummary)

  function toggleSession(idx) {
    setExpandedSessions(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  function toggleEvent(sessionIdx, eventIdx) {
    const key = `${sessionIdx}-${eventIdx}`
    setExpandedEvents(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(data || {}, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `journey-${visitorId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const shortId = shortIdentifier(summary.profileId || visitorId)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white dark:bg-dark-card shadow-2xl w-full md:max-w-2xl lg:max-w-3xl h-full overflow-hidden flex flex-col transform transition-transform duration-300 ease-in-out"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between flex-shrink-0 bg-gray-50/50 dark:bg-dark-bg/50">
          <div>
            <h2 className="text-base font-bold text-st-black dark:text-white">Visitor Journey</h2>
            <p className="text-xs text-st-gray dark:text-gray-400 font-mono mt-0.5">{shortId}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-xs text-st-gray dark:text-gray-400 border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>

            <div className="flex items-center gap-1.5 mr-2">
              <span className="text-xs text-st-gray dark:text-gray-400 font-medium">Status:</span>
              <select
                value={statusValue}
                onChange={async (e) => {
                  const newStatus = e.target.value
                  setStatusValue(newStatus)
                  try {
                    await fetchApi(`/leads/${visitorId}/qualify?site_key=${siteKey}`, {
                      method: 'PATCH',
                      body: JSON.stringify({ status: newStatus })
                    })
                    if (onQualified) {
                      onQualified(newStatus)
                    }
                  } catch (err) {
                    console.error("Failed to update status from journey modal", err)
                  }
                }}
                className="text-xs font-semibold px-2 py-1 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-st-black dark:text-white cursor-pointer focus:outline-none"
              >
                <option value="unqualified">Unqualified</option>
                <option value="qualified">Qualified</option>
                <option value="mql">MQL</option>
                <option value="sql">SQL</option>
              </select>
            </div>

            <button onClick={onClose} className="p-1.5 text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
            </div>
          ) : error ? (
            <div className="p-6 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800 dark:text-red-400">Journey query failed</p>
                <p className="text-xs text-red-600 dark:text-red-300 mt-1">{error}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 h-full">

              {/* ── Left Panel — lime tint ── */}
              <div className="lg:col-span-2 bg-st-lime/10 dark:bg-st-lime/5 p-6 space-y-5 border-r border-gray-100 dark:border-dark-border overflow-y-auto">
                <div>
                  <p className="text-[10px] text-st-gray dark:text-gray-400 uppercase tracking-wide">Profile</p>
                  <h3 className="mt-1 text-lg font-bold text-st-black dark:text-white font-mono break-all">{shortId}</h3>
                  {summary.userId && (
                    <p className="mt-1 text-xs text-st-gray dark:text-gray-400 break-all">
                      User ID: <span className="font-mono">{shortIdentifier(summary.userId)}</span>
                    </p>
                  )}
                </div>

                {/* Journey Overview Card */}
                <div className="bg-purple-50 border border-purple-200 dark:bg-purple-950/20 dark:border-purple-900/30 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-purple-900 dark:text-purple-400 font-semibold text-xs">
                    <span>Journey Overview</span>
                  </div>
                  <p className="text-xs text-purple-800 dark:text-purple-300 leading-normal font-sans">
                    {summary.aiSource ? (
                      <>Visitor arrived from <strong>{summary.aiSource}</strong>. The journey consists of {data?.session_count ?? summary.touchpoints} sessions with {summary.totalConversions} conversions over {summary.journeyDuration}.</>
                    ) : (
                      <>Visitor arrived via organic/direct navigation. No AI referral sources detected in this journey.</>
                    )}
                  </p>
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-2 gap-3">
                  <JourneyStat label="Sessions" value={data?.session_count ?? summary.touchpoints} />
                  <JourneyStat label="Conversions" value={summary.totalConversions} />
                  <JourneyStat label="Revenue" value={summary.conversionValue > 0 ? `$${safeNumber(summary.conversionValue, 0).toFixed(0)}` : '—'} />
                  <JourneyStat label="Duration" value={summary.journeyDuration} />
                </div>

                {/* Activity and attribution */}
                <div className="bg-white dark:bg-dark-card rounded-xl p-4 shadow-sm space-y-2">
                  <p className="text-xs font-semibold text-st-black dark:text-white mb-2">Journey Summary</p>
                  <SummaryField label="Profile ID" value={shortIdentifier(summary.profileId)} />
                  <SummaryField label="First Seen" value={summary.firstSeen} />
                  <SummaryField label="Last Active" value={summary.lastSeen} />
                  <SummaryField label="First Touch" value={summary.firstTouch} />
                  <SummaryField label="First Touch Date" value={summary.firstTouchDate} />
                  <SummaryField label="Last Page" value={summary.lastLocation} />
                  <SummaryField label="Last Conversion" value={summary.currentEventType !== '—' ? summary.currentEventType : null} />
                  {summary.aiSource && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <Bot className="w-3.5 h-3.5 text-purple-500" />
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getAIColor(summary.aiSource)}`}>
                        {summary.aiSource}
                      </span>
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-dark-card rounded-xl p-4 shadow-sm space-y-2">
                  <p className="text-xs font-semibold text-st-black dark:text-white mb-2">Environment</p>
                  <SummaryField label="Device" value={summary.device} />
                  <SummaryField label="Browser" value={summary.browser} />
                  <SummaryField label="OS" value={summary.os} />
                  <SummaryField label="Country" value={summary.country} />
                </div>

                {/* Path preview */}
                {summary.pathPreview.length > 1 && (
                  <div className="bg-white dark:bg-dark-card rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-semibold text-st-black dark:text-white mb-2">Page Path</p>
                    <div className="flex flex-wrap items-center gap-1">
                      {summary.pathPreview.map((p, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="text-[10px] bg-gray-100 dark:bg-dark-hover text-st-gray dark:text-gray-400 px-1.5 py-0.5 rounded font-mono truncate max-w-[80px]">{p}</span>
                          {i < summary.pathPreview.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right Panel — Session Timeline ── */}
              <div className="lg:col-span-3 p-6 flex flex-col overflow-hidden">
                {/* Filter pills */}
                <div className="flex items-center gap-2 mb-4 flex-shrink-0">
                  {[
                    { key: 'all', label: `All (${allEvents.length})` },
                    { key: 'conversions', label: `Conversions (${allEvents.filter(e => e.event === '$conversion').length})` },
                    { key: 'ai', label: `AI Touches (${allEvents.filter(e => e.ai_source).length})` }
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                        filter === f.key
                          ? 'bg-st-black text-white'
                          : 'bg-gray-100 dark:bg-dark-hover text-st-gray dark:text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Session cards */}
                {sessions.length === 0 ? (
                  <p className="text-sm text-st-gray dark:text-gray-400 py-8 text-center">No events match this filter.</p>
                ) : (
                  <div className="space-y-2 overflow-y-auto flex-1">
                    {sessions.map((session, sIdx) => {
                      const isOpen = expandedSessions[sIdx]
                      const sessionEvents = session.events || []
                      const filtered = filter === 'all'
                        ? sessionEvents
                        : filter === 'conversions'
                          ? sessionEvents.filter(e => e.event === '$conversion')
                          : sessionEvents.filter(e => e.ai_source)

                      // Skip sessions that have no matching events under current filter
                      if (filter !== 'all' && filtered.length === 0) return null

                      return (
                        <div
                          key={sIdx}
                          className={`rounded-xl border transition-all ${
                            session.contains_conversion
                              ? 'bg-st-lime/10 dark:bg-st-lime/5 border-st-lime/40'
                              : 'bg-white dark:bg-dark-card border-gray-100 dark:border-dark-border hover:border-gray-200'
                          }`}
                        >
                          {/* Session header */}
                          <div
                            className="flex items-start gap-3 p-3 cursor-pointer"
                            onClick={() => toggleSession(sIdx)}
                          >
                            {/* Session badge */}
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[10px] font-bold ${
                              session.contains_conversion ? 'bg-st-lime text-st-black' : 'bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-gray-300'
                            }`}>
                              #{session.session_index}
                            </div>

                            {/* Session info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-gray-800 dark:text-white">
                                  Session {session.session_index}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-dark-hover text-gray-500 dark:text-gray-400 font-medium truncate max-w-[120px]">
                                  {session.source_label || 'Direct'}
                                </span>
                                {session.contains_conversion && (
                                  <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-lime-100 text-lime-800 font-medium">
                                    <Zap className="w-2.5 h-2.5" /> Converted
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                                <span>{formatDateTime(session.started_at)}</span>
                                <span>·</span>
                                <span className="flex items-center gap-0.5">
                                  <Timer className="w-2.5 h-2.5" />
                                  {formatDuration(session.duration_seconds)}
                                </span>
                                <span>·</span>
                                <span>{session.pageview_count} pg · {session.event_count} ev</span>
                              </div>
                              {/* Entry / exit */}
                              <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gray-400 overflow-hidden">
                                {session.entry_page && (
                                  <span className="flex items-center gap-0.5 truncate max-w-[120px]" title={session.entry_page}>
                                    <LogIn className="w-2.5 h-2.5 flex-shrink-0" />
                                    {truncateUrl(session.entry_page, 30)}
                                  </span>
                                )}
                                {session.exit_page && session.exit_page !== session.entry_page && (
                                  <>
                                    <ArrowRight className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />
                                    <span className="flex items-center gap-0.5 truncate max-w-[120px]" title={session.exit_page}>
                                      <LogOut className="w-2.5 h-2.5 flex-shrink-0" />
                                      {truncateUrl(session.exit_page, 30)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            <button className="flex-shrink-0 text-st-gray dark:text-gray-400 mt-1">
                              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          </div>

                          {/* Expanded events */}
                          {isOpen && (
                            <div className="px-3 pb-3 ml-10 border-t border-gray-100 dark:border-dark-border">
                              {filtered.length === 0 ? (
                                <p className="text-xs text-gray-400 py-3 text-center">No matching events.</p>
                              ) : (
                                <div className="space-y-1.5 mt-2">
                                  {filtered.map((e, eIdx) => {
                                    const Icon = EVENT_ICONS[e.event] || Clock
                                    const isConversion = e.event === '$conversion'
                                    const isEventOpen = expandedEvents[`${sIdx}-${eIdx}`]
                                    const label = isConversion ? 'Conversion'
                                      : e.event === '$pageview' ? 'Pageview'
                                      : e.event === '$identify' ? 'Identify'
                                      : e.event === 'outbound_click' ? 'Outbound Click'
                                      : e.event

                                    return (
                                      <div
                                        key={eIdx}
                                        className={`rounded-lg border transition-all ${
                                          isConversion
                                            ? 'bg-st-lime/10 dark:bg-st-lime/5 border-st-lime/40'
                                            : 'bg-white dark:bg-dark-card border-gray-100 dark:border-dark-border'
                                        }`}
                                      >
                                        <div
                                          className="flex items-start gap-2 p-2 cursor-pointer"
                                          onClick={() => toggleEvent(sIdx, eIdx)}
                                        >
                                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                            isConversion ? 'bg-st-lime' : 'bg-gray-100 dark:bg-dark-hover'
                                          }`}>
                                            {isConversion
                                              ? <Zap className="w-2.5 h-2.5 text-st-black" />
                                              : <Icon className="w-2.5 h-2.5 text-gray-500 dark:text-gray-400" />
                                            }
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                              <span className={`text-[10px] font-semibold px-1 py-0.5 rounded ${
                                                isConversion ? 'bg-st-lime text-st-black' : 'bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-gray-300'
                                              }`}>
                                                {label}
                                              </span>
                                              {e.ai_source && (
                                                <span className={`text-[10px] px-1 py-0.5 rounded-full font-medium flex items-center gap-0.5 ${getAIColor(e.ai_source)}`}>
                                                  <Bot className="w-2 h-2" /> {e.ai_source}
                                                </span>
                                              )}
                                              {e.conversion_value > 0 && (
                                                <span className="text-[10px] font-semibold text-st-black dark:text-white">
                                                  ${safeNumber(e.conversion_value, 0).toFixed(0)}
                                                </span>
                                              )}
                                            </div>
                                            {e.page_url && (
                                              <p className="text-[10px] text-st-gray dark:text-gray-400 mt-0.5 truncate break-all" title={e.page_url}>
                                                {(() => { try { return new URL(e.page_url).pathname } catch { return e.page_url } })()}
                                              </p>
                                            )}
                                            <p className="text-[9px] text-gray-400 mt-0.5">
                                              {e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}
                                            </p>
                                          </div>
                                          <button className="flex-shrink-0 text-st-gray dark:text-gray-400 mt-1">
                                            {isEventOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                          </button>
                                        </div>

                                        {/* Expanded event detail */}
                                        {isEventOpen && (
                                          <div className="px-2 pb-2 pt-0 ml-7 text-[10px] text-st-gray dark:text-gray-400 space-y-0.5 border-t border-gray-100 dark:border-dark-border">
                                            {e.utm_source && (
                                              <p>UTM: {[e.utm_source, e.utm_medium, e.utm_campaign].filter(Boolean).join(' / ')}</p>
                                            )}
                                            {e.referrer && <p>Ref: {e.referrer}</p>}
                                            {e.country && (
                                              <p className="flex items-center gap-1">
                                                <MapPin className="w-3 h-3" /> {e.country}
                                              </p>
                                            )}
                                            {e.user_id && <p>User ID: {shortIdentifier(e.user_id)}</p>}
                                            {e.device_type && <p>Device: {e.device_type}</p>}
                                            {e.browser_name && <p>Browser: {nameVersion(e.browser_name, e.browser_version)}</p>}
                                            {e.os_name && <p>OS: {nameVersion(e.os_name, e.os_version)}</p>}
                                            {e.conversion_type && <p>Conversion Type: {e.conversion_type}</p>}
                                            {e.order_id && <p>Order ID: {e.order_id}</p>}
                                            {e.destination_domain && <p>Destination Domain: {e.destination_domain}</p>}
                                            {e.destination_url && <p className="break-all">Destination URL: {normalizeUrl(e.destination_url)}</p>}
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
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryField({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-st-gray dark:text-gray-400">{label}</p>
      <p className="text-xs font-medium text-st-black dark:text-white truncate max-w-[120px]">{value}</p>
    </div>
  )
}

function JourneyStat({ label, value }) {
  return (
    <div className="bg-white dark:bg-dark-card rounded-xl p-3 text-center shadow-sm border border-gray-100 dark:border-dark-border">
      <p className="text-lg font-bold text-st-black dark:text-white truncate">{value ?? '—'}</p>
      <p className="text-[10px] text-st-gray dark:text-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}

function computeSummary(events, data = {}, leadSummary = {}) {
  const empty = {
    lastLocation: 'Unknown', conversionValue: 0, device: 'Unknown',
    touchpoints: 0, totalConversions: 0, journeyDuration: '—', firstTouch: 'Direct',
    firstTouchDate: null, firstSeen: null, lastSeen: null, currentEventType: '—',
    aiSource: null, pathPreview: [], profileId: data?.visitor_id || null,
    userId: null, browser: null, os: null, country: null
  }
  if (!events?.length) return empty

  const pageviews   = events.filter(e => e.event === '$pageview')
  const conversions = events.filter(e => e.event === '$conversion')
  const lastEvent   = events[events.length - 1]
  const firstEvent  = events[0]
  const personProps = data?.person?.properties || {}
  const profileId = leadSummary?.id || data?.visitor_id || null
  const userId = leadSummary?.user_id || data?.user_id || personProps.user_id || events.find(e => e.user_id)?.user_id || null

  let lastLocation = '—'
  if (lastEvent?.page_url) {
    try { lastLocation = new URL(lastEvent.page_url).pathname } catch { lastLocation = lastEvent.page_url }
  }

  const leadRevenue = leadSummary?.revenue ?? leadSummary?.total_revenue
  const conversionValue = Number.isFinite(Number(leadRevenue))
    ? Number(leadRevenue)
    : conversions.reduce((s, e) => s + (Number(e.conversion_value) || 0), 0)
  const totalConversions = Number.isFinite(Number(leadSummary?.conversions))
    ? Number(leadSummary.conversions)
    : conversions.length
  const device = leadSummary?.device_type || events.find(e => e.device_type)?.device_type || 'Unknown'
  const country = leadSummary?.country || events.find(e => e.country)?.country || null
  const browserEvent = events.find(e => e.browser_name)
  const osEvent = events.find(e => e.os_name)
  const browser = nameVersion(browserEvent?.browser_name, browserEvent?.browser_version)
  const os = nameVersion(osEvent?.os_name, osEvent?.os_version)
  const firstSeen = formatDateTime(leadSummary?.first_seen || firstEvent?.timestamp)
  const lastSeen = formatDateTime(leadSummary?.last_seen || lastEvent?.timestamp)

  let journeyDuration = '<1 day'
  if (events.length >= 2) {
    try {
      const diff = new Date(lastEvent.timestamp) - new Date(firstEvent.timestamp)
      const days = Math.ceil(diff / 86400000)
      journeyDuration = days === 0 ? '<1 day' : `${days}d`
    } catch { /* ignore */ }
  }

  const firstTouch = leadSummary?.first_touch_source || leadSummary?.source || firstEvent?.first_touch_source || firstEvent?.utm_source || firstEvent?.source || 'Direct'
  const firstTouchDate = formatDateTime(firstEvent?.timestamp)
  const currentEventType = leadSummary?.last_conversion_type || conversions[conversions.length - 1]?.conversion_type || '—'
  const aiSource = events.find(e => e.ai_source)?.ai_source || null

  // Path preview — first 5 unique consecutive pages
  const pathPreview = []
  for (const e of pageviews) {
    try {
      const p = new URL(e.page_url).pathname
      if (pathPreview[pathPreview.length - 1] !== p) pathPreview.push(p)
      if (pathPreview.length >= 5) break
    } catch { /* skip */ }
  }

  return {
    lastLocation, conversionValue, device, country, browser, os,
    touchpoints: pageviews.length, totalConversions, journeyDuration,
    firstTouch, firstTouchDate, firstSeen, lastSeen,
    currentEventType, aiSource, pathPreview, profileId, userId
  }
}
