import { useState, useEffect } from 'react'
import { getJourney, fetchApi } from '../lib/api'
import {
  Clock, Globe, MousePointerClick, User, Bot, MapPin,
  Download, X, ChevronDown, ChevronRight, Zap, ArrowRight,
  Timer, LogIn, LogOut, AlertCircle, Check
} from 'lucide-react'
import { safeNumber } from '../utils/numbers'
import { SourceIcon } from './SourceIcon'
import { visitorAlias } from '../lib/visitorAlias'
import { buildActivityGrid, intensity, JOURNEY_EVENT_CAP, GRID_WEEKS } from '../lib/activityGrid'

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

// Relative "x ago" with the exact datetime available as a tooltip via title.
function relativeTime(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const diffMs = Date.now() - d.getTime()
  const sec = Math.round(diffMs / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? '' : 's'} ago`
  const mo = Math.round(day / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.round(day / 365)}y ago`
}

// Integration source per event (C3). Event type from ingestion_method
// (browser -> "Browser", anything else -> "Server"); integration from
// source_system. Returns null when neither field is present (show nothing).
const INTEGRATIONS = {
  stripe:   { label: 'Stripe',   dot: 'bg-violet-500' },
  shopify:  { label: 'Shopify',  dot: 'bg-green-500' },
  zapier:   { label: 'Zapier',   dot: 'bg-orange-500' },
  calendly: { label: 'Calendly', dot: 'bg-blue-500' },
  webhook:  { label: 'Webhook',  dot: 'bg-gray-500' },
  manual:   { label: 'Manual',   dot: 'bg-gray-400' },
}
function integrationMeta(e) {
  const im = (e.ingestion_method || '').toLowerCase()
  const ss = (e.source_system || '').toLowerCase()
  if (!im && !ss) return null
  const eventType = im ? (im === 'browser' ? 'Browser' : 'Server') : null
  const integ = ss
    ? (INTEGRATIONS[ss] || { label: ss.charAt(0).toUpperCase() + ss.slice(1), dot: 'bg-gray-400' })
    : null
  if (!eventType && !integ) return null
  return { eventType, integ }
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

  // C1 — default-expand the most recent (last) session once data loads.
  useEffect(() => {
    const s = data?.sessions || []
    if (s.length > 0) setExpandedSessions({ [s.length - 1]: true })
  }, [data])

  const allEvents = data?.events || []
  const sessions = data?.sessions || []
  // Dark-traffic stitching: prior AI session behind a Direct conversion. Set
  // server-side only when stitched deterministically (never inferred).
  const aiInfluence = data?.ai_influence || null

  const summary = computeSummary(allEvents, data, leadSummary)
  // C4b — real revenue only (truth-gated: value > 0). Hidden entirely if none.
  const revenueEvents = allEvents.filter(e => e.event === '$conversion' && Number(e.conversion_value) > 0)

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
  // Friendly, deterministic pseudonym so this journey can be referred to in words. Derived
  // from the opaque id ONLY, and always rendered alongside that id — never instead of it, so
  // it can't be read as the visitor's actual name (see lib/visitorAlias.js).
  const alias = visitorAlias(summary.profileId || visitorId)

  // Activity grid + the honest window behind it. The journey read is ASC LIMIT 500, so a
  // visitor over the cap is missing their MOST RECENT events, not their oldest.
  const activity = buildActivityGrid(allEvents)
  const historyTruncated = activity.truncated

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white dark:bg-dark-card shadow-2xl w-full md:max-w-2xl lg:max-w-3xl h-full overflow-hidden flex flex-col transform transition-transform duration-300 ease-in-out"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-dark-border flex items-center justify-between flex-shrink-0 bg-gray-50/50 dark:bg-dark-bg/50">
          <div>
            <h2 className="text-base font-bold text-st-black dark:text-dark-primary">
              {alias || 'Visitor Journey'}
            </h2>
            {/* The raw id stays on screen next to the alias — the alias is a generated
                reference for an anonymous visitor, not a name, and hiding the id behind it
                would let it read as one. */}
            <p className="text-xs text-st-gray dark:text-gray-400 font-mono mt-0.5" title="Anonymous visitor ID">
              {shortId}
            </p>
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
                className="text-xs font-semibold px-2 py-1 rounded-lg border border-gray-300 dark:border-dark-border-strong bg-white dark:bg-dark-bg text-st-black dark:text-dark-primary cursor-pointer focus:outline-none"
              >
                <option value="unqualified">Unqualified</option>
                <option value="qualified">Qualified</option>
                <option value="mql">MQL</option>
                <option value="sql">SQL</option>
              </select>
            </div>

            <button onClick={onClose} className="p-1.5 text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover">
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
                  <div className="mt-1 flex items-center gap-2.5">
                    <VisitorAvatar shortId={shortId} status={statusValue} />
                    <div className="min-w-0">
                      {alias ? (
                        <>
                          <h3 className="text-lg font-bold text-st-black dark:text-dark-primary leading-tight truncate" title="Generated reference for this anonymous visitor — not a real name">
                            {alias}
                          </h3>
                          <p className="text-[11px] text-st-gray dark:text-gray-400 font-mono break-all leading-tight">{shortId}</p>
                        </>
                      ) : (
                        <h3 className="text-lg font-bold text-st-black dark:text-dark-primary font-mono break-all leading-tight">{shortId}</h3>
                      )}
                      {summary.userId && (
                        <p className="mt-0.5 text-xs text-st-gray dark:text-gray-400 break-all">
                          User ID: <span className="font-mono">{shortIdentifier(summary.userId)}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Attribution trail (design §8.6 / §14.1 item 4): [Source] -> [Landing page] ->
                    [Event] -> [Revenue/Lead], thin connectors. Same values already shown as text
                    rows in Journey Summary below — this is the scannable form of them, not a
                    second data source. Every slot is truth-gated: a slot with no real value is
                    omitted rather than rendered as a dash or a zero (§6). */}
                <AttributionTrail summary={summary} />

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

                {/* Visit frequency over ~6 months. Hidden entirely when there is nothing
                    measured to show — an all-empty grid is not a calm empty state, it is a
                    wall of squares asserting six months of inactivity (§6). */}
                {activity.activeDays > 0 && <ActivityGrid activity={activity} />}

                {/* Activity and attribution */}
                <div className="bg-white dark:bg-dark-card rounded-xl p-4 shadow-sm space-y-2">
                  <p className="text-xs font-semibold text-st-black dark:text-dark-primary mb-2">Journey Summary</p>
                  <SummaryField label="Profile ID" value={shortIdentifier(summary.profileId)} />
                  <SummaryField label="First Active" value={summary.firstSeenRel} title={summary.firstSeen} />
                  <SummaryField label="Last Active" value={summary.lastSeenRel} title={summary.lastSeen} />
                  <SummaryField label="Create Date" value={summary.createDate} title={summary.createDateAbs} />
                  <SummaryField label="First Touch" value={summary.firstTouch} />
                  <SummaryField label="First Touch Date" value={summary.firstTouchDateRel} title={summary.firstTouchDate} />
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

                {/* C4b — Revenue / Transactions. Only real revenue (value > 0); hidden if none. */}
                {revenueEvents.length > 0 && (
                  <div className="bg-white dark:bg-dark-card rounded-xl p-4 shadow-sm space-y-2">
                    <p className="text-xs font-semibold text-st-black dark:text-dark-primary mb-2">Revenue</p>
                    <div className="space-y-2">
                      {revenueEvents.map((e, i) => {
                        const meta = integrationMeta(e)
                        return (
                          <div key={i} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-st-lime/20 text-st-black dark:text-st-lime truncate max-w-[90px]">
                                {e.conversion_type || 'Conversion'}
                              </span>
                              {meta?.integ && (
                                <span className="flex items-center gap-0.5 text-[10px] text-st-gray dark:text-gray-400">
                                  <span className={`w-1.5 h-1.5 rounded-full ${meta.integ.dot}`} />
                                  {meta.integ.label}
                                </span>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs font-semibold text-st-black dark:text-dark-primary">${safeNumber(e.conversion_value, 0).toFixed(0)}</p>
                              <p className="text-[9px] text-gray-400" title={formatDateTime(e.timestamp) || undefined}>
                                {relativeTime(e.timestamp) || '—'}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="bg-white dark:bg-dark-card rounded-xl p-4 shadow-sm space-y-2">
                  <p className="text-xs font-semibold text-st-black dark:text-dark-primary mb-2">Environment</p>
                  <SummaryField label="Device" value={summary.device} />
                  <SummaryField label="Browser" value={summary.browser} />
                  <SummaryField label="OS" value={summary.os} />
                  <SummaryField label="Country" value={summary.country} />
                </div>

                {/* Path preview */}
                {summary.pathPreview.length > 1 && (
                  <div className="bg-white dark:bg-dark-card rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-semibold text-st-black dark:text-dark-primary mb-2">Page Path</p>
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
                    {/* START-OF-HISTORY marker. Sessions render oldest-first, so the top of this
                        list IS the beginning of what we hold.

                        Why the claim is safe: the journey read is `ORDER BY timestamp ASC
                        LIMIT 500`, so the response always contains a visitor's OLDEST events —
                        truncation clips the RECENT end, never this one. The nightly retention
                        purge deletes Supabase rows and free-tier `pageviews`, neither of which
                        is the Tinybird events store this reads, so nothing earlier has been
                        quietly aged out either. If a TTL is ever added to that store, this
                        message is the first thing that becomes a lie.

                        Only under filter 'all': with a filter applied the first visible card is
                        just the earliest MATCH, not the start of anything. */}
                    {filter === 'all' && (
                      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-st-lime/10 dark:bg-st-lime/5 border border-st-lime/30">
                        <span className="w-6 h-6 rounded-full bg-st-lime/40 flex items-center justify-center flex-shrink-0">
                          <MapPin className="w-3 h-3 text-st-black" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-st-black dark:text-dark-primary">This is where their journey begins</p>
                          {sessions[0]?.started_at && (
                            <p className="text-[10px] text-st-gray dark:text-gray-400 mt-0.5">
                              First seen {formatDateTime(sessions[0].started_at)}
                              {summary.firstTouch ? ` · arrived via ${summary.firstTouch}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {sessions.map((session, sIdx) => {
                      const isOpen = expandedSessions[sIdx]
                      // $heartbeat is a page-exit beacon, not something the customer did — it has
                      // no EVENT_ICONS entry and no label case, so it would render as an unlabeled
                      // Clock row reading "$heartbeat" (the fallbacks at the icon/label lines below).
                      // Filtered HERE, at the render layer, and deliberately NOT in journey.pipe:
                      // journey.js feeds ONE events array to both this timeline AND deriveSessions
                      // (:171) + sessionAggregates (:209), so removing heartbeats upstream would
                      // freeze Journey's session durations at 0s while every other surface reported
                      // real dwell time. The data layer keeps the data; presentation decides what shows.
                      const sessionEvents = (session.events || []).filter(e => e.event !== '$heartbeat')
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
                                <span className="text-xs font-semibold text-gray-800 dark:text-dark-primary">
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
                                                <span className="text-[10px] font-semibold text-st-black dark:text-dark-primary">
                                                  ${safeNumber(e.conversion_value, 0).toFixed(0)}
                                                </span>
                                              )}
                                              {(() => {
                                                const meta = integrationMeta(e)
                                                if (!meta) return null
                                                return (
                                                  <span className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                                                    {meta.eventType}
                                                    {meta.eventType && meta.integ && <span>·</span>}
                                                    {meta.integ && (
                                                      <span className="flex items-center gap-0.5">
                                                        <span className={`w-1.5 h-1.5 rounded-full ${meta.integ.dot}`} />
                                                        via {meta.integ.label}
                                                      </span>
                                                    )}
                                                  </span>
                                                )
                                              })()}
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

                                        {/* Dark-traffic stitching badge — only on the
                                            conversion row when a prior AI session was stitched. */}
                                        {isConversion && aiInfluence && (
                                          <div className="px-2 pb-2 ml-7">
                                            <span
                                              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400 font-medium"
                                              title="This conversion arrived as Direct traffic but a prior AI session was detected. Attribution is based on a clicked link, not inferred awareness."
                                            >
                                              <Bot className="w-2.5 h-2.5" />
                                              Via {aiInfluence.source}{aiInfluence.session_at ? ` (${relativeTime(aiInfluence.session_at)})` : ''}
                                            </span>
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
                    {/* The other end. Without this the last card reads as "and that's the
                        latest", which for a capped visitor is false — the events we are missing
                        are precisely the most recent ones. */}
                    {filter === 'all' && historyTruncated && (
                      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-dashed border-gray-300 dark:border-white/15">
                        <AlertCircle className="w-3.5 h-3.5 text-st-gray dark:text-gray-400 flex-shrink-0 mt-0.5" />
                        <p className="text-[10px] text-st-gray dark:text-gray-400 leading-normal">
                          This visitor has more than {JOURNEY_EVENT_CAP} events. The timeline shows their
                          earliest {JOURNEY_EVENT_CAP} — more recent activity exists but isn&apos;t loaded here.
                        </p>
                      </div>
                    )}
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

function SummaryField({ label, value, title }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-st-gray dark:text-gray-400">{label}</p>
      <p className="text-xs font-medium text-st-black dark:text-dark-primary truncate max-w-[120px]" title={title || undefined}>{value}</p>
    </div>
  )
}

// Qualification statuses that earn the check overlay (design §8.4 qualification badges).
// 'unqualified' — and any unrecognised value — deliberately gets nothing: an absent badge
// must mean "not qualified", so it can never be confused with a default.
const QUALIFIED_STATUSES = new Set(['qualified', 'mql', 'sql'])

// Avatar for an ANONYMOUS visitor: a mono glyph off the short id, never a name or a photo —
// there is no person-level identity to render here and inventing one would breach the
// cookieless/no-de-anonymisation rule (§6). The check is an overlay on the avatar, matching
// the reference, and is driven by the status already held in component state — no new read.
function VisitorAvatar({ shortId, status }) {
  const glyph = String(shortId || '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '?'
  const qualified = QUALIFIED_STATUSES.has(String(status || '').toLowerCase())
  return (
    <div className="relative flex-shrink-0">
      <div className="w-10 h-10 rounded-full bg-st-lime/25 dark:bg-st-lime/15 border border-st-lime/40 flex items-center justify-center">
        <span className="text-xs font-bold font-mono text-st-black dark:text-dark-primary tracking-tight">{glyph}</span>
      </div>
      {qualified && (
        <span
          title={`Qualification: ${String(status).toUpperCase()}`}
          className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-st-green flex items-center justify-center ring-2 ring-white dark:ring-dark-card"
        >
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </span>
      )}
    </div>
  )
}

// One chip in the attribution trail. `icon` is optional so the source slot can carry a brand
// mark while the rest stay text-only — the reference row is icon-led at the source end.
function TrailChip({ icon, label, title, tone = 'default' }) {
  const tones = {
    default: 'bg-white dark:bg-dark-card text-st-black dark:text-dark-primary border-gray-200 dark:border-dark-border',
    revenue: 'bg-st-lime/25 dark:bg-st-lime/15 text-st-black dark:text-st-lime border-st-lime/40'
  }
  return (
    <span
      title={title || label}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-medium max-w-[92px] ${tones[tone] || tones.default}`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </span>
  )
}

// [Source chip] -> [Landing page] -> [Event] -> [Revenue/Lead] (design §8.6). Thin connectors,
// compact arrows. Reads ONLY fields computeSummary already produces.
//
// WRAPS rather than scrolls, matching the Page Path block below it. A single scrollable line
// looked tighter until it was rendered: in this narrow left column the row overflows and the
// chip that gets cut off is the LAST one — the revenue/outcome chip the trail exists to lead
// to. Wrapping costs a line and keeps the payoff on screen.
function AttributionTrail({ summary }) {
  const landing = summary.pathPreview?.[0] || null
  const event = summary.currentEventType && summary.currentEventType !== '—' ? summary.currentEventType : null
  // Revenue only when real (§6 — never a fabricated $0). Falls back to the Lead badge when the
  // visitor converted without a value, and to nothing at all when they never converted.
  const outcome = summary.conversionValue > 0
    ? { label: `$${safeNumber(summary.conversionValue, 0).toFixed(0)}`, tone: 'revenue' }
    : summary.totalConversions > 0
      ? { label: 'Lead', tone: 'revenue' }
      : null

  const chips = [
    { key: 'source', label: summary.firstTouch || 'Direct', title: `First touch: ${summary.firstTouch || 'Direct'}`, icon: <SourceIcon source={summary.firstTouch || 'Direct'} className="w-3 h-3 flex-shrink-0" /> },
    landing && { key: 'landing', label: landing, title: `Landing page: ${landing}` },
    event && { key: 'event', label: event, title: `Event: ${event}` },
    outcome && { key: 'outcome', label: outcome.label, tone: outcome.tone, title: outcome.tone === 'revenue' && outcome.label !== 'Lead' ? 'Attributed revenue' : 'Converted' }
  ].filter(Boolean)

  // A lone source chip is not a trail — that is just the First Touch row restated.
  if (chips.length < 2) return null

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl p-3 shadow-sm">
      <p className="text-[10px] text-st-gray dark:text-gray-400 uppercase tracking-wide mb-2">Attribution trail</p>
      <div className="flex flex-wrap items-center gap-1">
        {chips.map((c, i) => (
          <span key={c.key} className="flex items-center gap-1">
            <TrailChip icon={c.icon} label={c.label} title={c.title} tone={c.tone} />
            {i < chips.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-gray-300 dark:text-gray-600 flex-shrink-0" />}
          </span>
        ))}
      </div>
    </div>
  )
}

// Intensity classes written as LITERAL strings — Tailwind's content scanner cannot see a class
// built by interpolation, so a computed `bg-st-lime/${n}` would ship unstyled.
const CELL_TONE = [
  'bg-gray-100 dark:bg-white/[0.06]',   // 0 — measured, no activity
  'bg-st-lime/30',
  'bg-st-lime/50',
  'bg-st-lime/75',
  'bg-st-lime'
]
// UNKNOWN is deliberately not a lighter shade of the same ramp — it must not read as "less
// activity". A hatched/outlined cell reads as "no data", which is what it is.
const CELL_UNKNOWN = 'bg-transparent border border-dashed border-gray-300 dark:border-white/20'

// GitHub-style contribution grid for one visitor. Every cell is one of three things and they
// are visually distinct: measured activity, measured absence, and unknown (outside the window
// the journey read actually returned). See lib/activityGrid.js for why that third state has to
// exist at all.
function ActivityGrid({ activity }) {
  const { columns, truncated, activeDays, maxCount, knownThrough } = activity
  return (
    <div className="bg-white dark:bg-dark-card rounded-xl p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-st-black dark:text-dark-primary">Activity</p>
        <p className="text-[10px] text-st-gray dark:text-gray-400">
          {activeDays} active {activeDays === 1 ? 'day' : 'days'}
        </p>
      </div>

      <div className="flex gap-[2px] overflow-x-auto pb-1">
        {columns.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[2px]">
            {col.map((cell) => {
              if (cell.future) {
                // Not yet happened. Occupies the slot so the grid keeps its shape, draws nothing.
                return <div key={cell.date} className="w-[9px] h-[9px] rounded-[2px]" />
              }
              const known = cell.known
              const tone = known ? CELL_TONE[intensity(cell.count, maxCount)] : CELL_UNKNOWN
              const title = known
                ? `${cell.date} — ${cell.count} ${cell.count === 1 ? 'event' : 'events'}`
                : `${cell.date} — not loaded (beyond the ${JOURNEY_EVENT_CAP}-event window)`
              return (
                <div
                  key={cell.date}
                  title={title}
                  className={`w-[9px] h-[9px] rounded-[2px] ${tone}`}
                />
              )
            })}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 mt-2">
        <p className="text-[10px] text-st-gray dark:text-gray-400">~{Math.round(GRID_WEEKS / 4.345)} months</p>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-st-gray dark:text-gray-400">Less</span>
          {CELL_TONE.map((t, i) => <span key={i} className={`w-[9px] h-[9px] rounded-[2px] ${t}`} />)}
          <span className="text-[9px] text-st-gray dark:text-gray-400">More</span>
        </div>
      </div>

      {/* Truncation is stated, not implied. Without this the dashed cells read as a rendering
          quirk rather than "we did not load this". */}
      {truncated && (
        <p className="text-[10px] text-st-gray dark:text-gray-400 mt-2 leading-normal border-t border-gray-100 dark:border-dark-border pt-2">
          <span className="inline-block w-[9px] h-[9px] rounded-[2px] align-middle mr-1 border border-dashed border-gray-300 dark:border-white/20" />
          This visitor has more than {JOURNEY_EVENT_CAP} events. Activity is measured through{' '}
          <span className="font-medium">{knownThrough}</span>; later days aren&apos;t loaded and are shown as unknown, not as zero.
        </p>
      )}
    </div>
  )
}

function JourneyStat({ label, value }) {
  return (
    <div className="bg-white dark:bg-dark-card rounded-xl p-3 text-center shadow-sm border border-gray-100 dark:border-dark-border">
      <p className="text-lg font-bold text-st-black dark:text-dark-primary truncate">{value ?? '—'}</p>
      <p className="text-[10px] text-st-gray dark:text-gray-400 uppercase tracking-wide mt-0.5">{label}</p>
    </div>
  )
}

function computeSummary(events, data = {}, leadSummary = {}) {
  const empty = {
    lastLocation: 'Unknown', conversionValue: 0, device: 'Unknown',
    touchpoints: 0, totalConversions: 0, journeyDuration: '—', firstTouch: 'Direct',
    firstTouchDate: null, firstTouchDateRel: null, firstSeen: null, firstSeenRel: null,
    lastSeen: null, lastSeenRel: null, createDate: null, createDateAbs: null,
    currentEventType: '—', aiSource: null, pathPreview: [], profileId: data?.visitor_id || null,
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
  const firstSeenRaw = leadSummary?.first_seen || firstEvent?.timestamp
  const lastSeenRaw = leadSummary?.last_seen || lastEvent?.timestamp
  const firstSeen = formatDateTime(firstSeenRaw)
  const lastSeen = formatDateTime(lastSeenRaw)
  // Create Date — when this profile became a lead (first conversion). Hidden if never converted.
  const createDateRaw = conversions[0]?.timestamp || null

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
    firstTouch, firstTouchDate, firstTouchDateRel: relativeTime(firstEvent?.timestamp),
    firstSeen, firstSeenRel: relativeTime(firstSeenRaw),
    lastSeen, lastSeenRel: relativeTime(lastSeenRaw),
    createDate: relativeTime(createDateRaw), createDateAbs: formatDateTime(createDateRaw),
    currentEventType, aiSource, pathPreview, profileId, userId
  }
}
