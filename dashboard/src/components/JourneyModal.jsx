import { useState, useEffect } from 'react'
import { getJourney } from '../lib/api'
import {
  Clock, Globe, MousePointerClick, User, Bot, MapPin,
  Download, X, ChevronDown, ChevronRight, Zap, ArrowRight
} from 'lucide-react'

const EVENT_ICONS = {
  '$pageview':   Globe,
  '$conversion': MousePointerClick,
  '$identify':   User
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

export default function JourneyModal({ visitorId, siteKey, onClose, onQualified }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [error, setError]     = useState(null)
  const [filter, setFilter]   = useState('all') // all | conversions | ai

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
  const events = filter === 'conversions'
    ? allEvents.filter(e => e.event === '$conversion')
    : filter === 'ai'
    ? allEvents.filter(e => e.ai_source)
    : allEvents

  const summary = computeSummary(allEvents)

  function toggleExpand(i) {
    setExpanded(prev => ({ ...prev, [i]: !prev[i] }))
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

  const shortId = visitorId ? visitorId.slice(0, 8) + '…' : '—'

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#1A1D1D] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-[#2A2E2E] flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-st-black">Visitor Journey</h2>
            <p className="text-xs text-st-gray dark:text-gray-400 font-mono mt-0.5">{shortId}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="px-3 py-1.5 text-xs text-st-gray dark:text-gray-400 border border-gray-200 dark:border-[#333838] rounded-lg hover:bg-gray-50 dark:hover:bg-[#252929] dark:bg-[#111414] flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            {onQualified && (
              <button
                onClick={onQualified}
                className="px-3 py-1.5 text-xs bg-st-black text-white rounded-lg font-medium hover:bg-st-black/90"
              >
                Mark Qualified
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-st-gray dark:text-gray-400 hover:text-st-black dark:text-white rounded-lg hover:bg-gray-100">
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
            <div className="py-20 text-center text-sm text-st-gray">{error}</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5 h-full">

              {/* ── Left Panel — lime tint ── */}
              <div className="lg:col-span-2 bg-st-lime/10 dark:bg-st-lime/5 p-6 space-y-5 border-r border-gray-100">

                {/* KPI row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white dark:bg-[#1A1D1D] rounded-xl p-3 text-center shadow-sm">
                    <p className="text-xl font-bold text-st-black">{summary.touchpoints}</p>
                    <p className="text-[10px] text-st-gray dark:text-gray-400 uppercase tracking-wide mt-0.5">Touchpoints</p>
                  </div>
                  <div className="bg-white dark:bg-[#1A1D1D] rounded-xl p-3 text-center shadow-sm">
                    <p className="text-xl font-bold text-st-black">
                      {summary.conversionValue > 0 ? `$${summary.conversionValue.toFixed(0)}` : '—'}
                    </p>
                    <p className="text-[10px] text-st-gray dark:text-gray-400 uppercase tracking-wide mt-0.5">Value</p>
                  </div>
                  <div className="bg-white dark:bg-[#1A1D1D] rounded-xl p-3 text-center shadow-sm">
                    <p className="text-sm font-bold text-st-black dark:text-white truncate">{summary.journeyDuration}</p>
                    <p className="text-[10px] text-st-gray dark:text-gray-400 uppercase tracking-wide mt-0.5">Duration</p>
                  </div>
                  <div className="bg-white dark:bg-[#1A1D1D] rounded-xl p-3 text-center shadow-sm">
                    <p className="text-sm font-bold text-st-black dark:text-white truncate">{summary.device}</p>
                    <p className="text-[10px] text-st-gray dark:text-gray-400 uppercase tracking-wide mt-0.5">Device</p>
                  </div>
                </div>

                {/* Attribution path */}
                <div className="bg-white dark:bg-[#1A1D1D] rounded-xl p-4 shadow-sm space-y-2">
                  <p className="text-xs font-semibold text-st-black dark:text-white mb-2">Attribution</p>
                  <SummaryField label="First Touch"    value={summary.firstTouch} />
                  <SummaryField label="Last Page"      value={summary.lastLocation} />
                  <SummaryField label="Conversion"     value={summary.currentEventType !== '—' ? summary.currentEventType : null} />
                  {summary.aiSource && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <Bot className="w-3.5 h-3.5 text-purple-500" />
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getAIColor(summary.aiSource)}`}>
                        {summary.aiSource}
                      </span>
                    </div>
                  )}
                </div>

                {/* Path preview */}
                {summary.pathPreview.length > 1 && (
                  <div className="bg-white dark:bg-[#1A1D1D] rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-semibold text-st-black dark:text-white mb-2">Page Path</p>
                    <div className="flex flex-wrap items-center gap-1">
                      {summary.pathPreview.map((p, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="text-[10px] bg-gray-100 dark:bg-[#252929] text-st-gray dark:text-gray-400 px-1.5 py-0.5 rounded font-mono truncate max-w-[80px]">{p}</span>
                          {i < summary.pathPreview.length - 1 && <ArrowRight className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Right Panel — Timeline ── */}
              <div className="lg:col-span-3 p-6 flex flex-col">
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
                          : 'bg-gray-100 dark:bg-[#252929] text-st-gray dark:text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Timeline */}
                {events.length === 0 ? (
                  <p className="text-sm text-st-gray dark:text-gray-400 py-8 text-center">No events match this filter.</p>
                ) : (
                  <div className="space-y-2 overflow-y-auto flex-1">
                    {events.map((e, i) => {
                      const Icon = EVENT_ICONS[e.event] || Clock
                      const isConversion = e.event === '$conversion'
                      const isExpanded   = expanded[i]
                      const label = isConversion ? 'Conversion'
                        : e.event === '$pageview' ? 'Pageview'
                        : e.event === '$identify' ? 'Identify'
                        : e.event

                      return (
                        <div
                          key={i}
                          className={`rounded-xl border transition-all ${
                            isConversion
                              ? 'bg-st-lime/10 dark:bg-st-lime/5 border-st-lime/40'
                              : 'bg-white dark:bg-[#1A1D1D] border-gray-100 dark:border-[#2A2E2E] hover:border-gray-200'
                          }`}
                        >
                          <div
                            className="flex items-start gap-3 p-3 cursor-pointer"
                            onClick={() => toggleExpand(i)}
                          >
                            {/* Icon */}
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                              isConversion ? 'bg-st-lime' : 'bg-gray-100'
                            }`}>
                              {isConversion
                                ? <Zap className="w-3.5 h-3.5 text-st-black" />
                                : <Icon className="w-3.5 h-3.5 text-gray-500" />
                              }
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                                  isConversion ? 'bg-st-lime text-st-black' : 'bg-gray-100 dark:bg-[#252929] text-gray-600'
                                }`}>
                                  {label}
                                </span>
                                {e.ai_source && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1 ${getAIColor(e.ai_source)}`}>
                                    <Bot className="w-2.5 h-2.5" /> {e.ai_source}
                                  </span>
                                )}
                                {e.conversion_value > 0 && (
                                  <span className="text-xs font-semibold text-st-black">
                                    ${Number(e.conversion_value).toFixed(0)}
                                  </span>
                                )}
                              </div>
                              {e.page_url && (
                                <p className="text-xs text-st-gray dark:text-gray-400 mt-0.5 truncate">
                                  {(() => { try { return new URL(e.page_url).pathname } catch { return e.page_url } })()}
                                </p>
                              )}
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}
                              </p>
                            </div>

                            <button className="flex-shrink-0 text-st-gray dark:text-gray-400 mt-1">
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          </div>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-0 ml-10 text-xs text-st-gray dark:text-gray-400 space-y-1 border-t border-gray-100">
                              {e.utm_source && (
                                <p>UTM: {[e.utm_source, e.utm_medium, e.utm_campaign].filter(Boolean).join(' / ')}</p>
                              )}
                              {e.referrer && <p>Ref: {e.referrer}</p>}
                              {e.country && (
                                <p className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" /> {e.country}
                                </p>
                              )}
                              {e.device_type && <p>Device: {e.device_type}</p>}
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
  if (!value) return null
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-st-gray">{label}</p>
      <p className="text-xs font-medium text-st-black dark:text-white truncate max-w-[120px]">{value}</p>
    </div>
  )
}

function computeSummary(events) {
  const empty = {
    lastLocation: 'Unknown', conversionValue: 0, device: 'Unknown',
    touchpoints: 0, journeyDuration: '—', firstTouch: 'Direct',
    currentEventType: '—', aiSource: null, pathPreview: []
  }
  if (!events?.length) return empty

  const pageviews   = events.filter(e => e.event === '$pageview')
  const conversions = events.filter(e => e.event === '$conversion')
  const lastEvent   = events[events.length - 1]
  const firstEvent  = events[0]

  let lastLocation = '—'
  if (lastEvent?.page_url) {
    try { lastLocation = new URL(lastEvent.page_url).pathname } catch { lastLocation = lastEvent.page_url }
  }

  const conversionValue = conversions.reduce((s, e) => s + (Number(e.conversion_value) || 0), 0)
  const device = events.find(e => e.device_type)?.device_type || 'Unknown'

  let journeyDuration = '<1 day'
  if (events.length >= 2) {
    try {
      const diff = new Date(lastEvent.timestamp) - new Date(firstEvent.timestamp)
      const days = Math.ceil(diff / 86400000)
      journeyDuration = days === 0 ? '<1 day' : `${days}d`
    } catch { /* ignore */ }
  }

  const firstTouch = firstEvent?.first_touch_source || firstEvent?.utm_source || firstEvent?.source || 'Direct'
  const currentEventType = conversions[conversions.length - 1]?.conversion_type || '—'
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
    lastLocation, conversionValue, device,
    touchpoints: pageviews.length, journeyDuration,
    firstTouch, currentEventType, aiSource, pathPreview
  }
}
