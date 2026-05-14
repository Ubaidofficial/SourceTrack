import { useState, useEffect } from 'react'
import { getJourney } from '../lib/api'
import { Clock, Globe, MousePointerClick, User, Bot, MapPin, Download, ArrowLeft, ChevronDown, ChevronRight, GitBranch } from 'lucide-react'

const EVENT_ICONS = {
  '$pageview': Globe,
  '$conversion': MousePointerClick,
  '$identify': User
}

export default function JourneyModal({ visitorId, siteKey, onClose, onQualified }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!visitorId || !siteKey) return
    setLoading(true)
    setError(null)
    getJourney(siteKey, visitorId)
      .then(setData)
      .catch(err => setError(err.message || 'Failed to load journey'))
      .finally(() => setLoading(false))
  }, [visitorId, siteKey])

  const events = data?.events || []
  const summary = computeSummary(events)

  function toggleExpand(i) {
    setExpanded(prev => ({ ...prev, [i]: !prev[i] }))
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(data || {}, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `journey-${visitorId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Back to leads
            </button>
            <h2 className="text-lg font-semibold text-gray-900">Visitor Journey</h2>
          </div>
          <div className="flex items-center gap-2">
            <button disabled className="px-3 py-1.5 text-xs text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed">
              Sync To CRM
            </button>
            <button onClick={handleExport} className="px-3 py-1.5 text-xs text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
              <Download className="w-3.5 h-3.5 inline mr-1" /> Export
            </button>
            <button
              onClick={onQualified || (() => {})}
              disabled={!onQualified}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium ${onQualified ? 'bg-st-black text-white hover:bg-st-black/90' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
            >
              Mark as Qualified
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
          ) : error ? (
            <div className="py-20 text-center text-sm text-gray-400">{error}</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-5">
              {/* Summary Panel */}
              <div className="lg:col-span-2 bg-st-lime/15 p-6 space-y-4 border-r border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700">Summary</h3>
                <div className="space-y-3">
                  <SummaryField label="Last Location" value={summary.lastLocation} />
                  <SummaryField label="Conversion Value" value={summary.conversionValue > 0 ? `$${summary.conversionValue.toFixed(2)}` : '—'} />
                  <SummaryField label="Device" value={summary.device} />
                  <SummaryField label="Touchpoints" value={String(summary.touchpoints)} />
                  <SummaryField label="Duration" value={summary.journeyDuration} />
                  <SummaryField label="First Touch" value={summary.firstTouch} />
                  <SummaryField label="Event Type" value={summary.currentEventType} />
                </div>
              </div>

              {/* Timeline Panel */}
              <div className="lg:col-span-3 p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">All Activity</h3>
                {events.length === 0 ? (
                  <p className="text-sm text-gray-400">No events found.</p>
                ) : (
                  <div className="space-y-3">
                    {events.map((e, i) => {
                      const Icon = EVENT_ICONS[e.event] || Clock
                      const label = e.event === '$pageview' ? 'Pageview' : e.event === '$conversion' ? 'Conversion' : e.event === '$identify' ? 'Identify' : e.event
                      const isConversion = e.event === '$conversion'
                      const isExpanded = expanded[i]

                      return (
                        <div key={i} className={`rounded-lg border p-3 ${isConversion ? 'bg-green-50 border-green-200' : 'bg-white border-gray-100'}`}>
                          <div className="flex items-start gap-3 cursor-pointer" onClick={() => toggleExpand(i)}>
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${isConversion ? 'bg-green-200' : 'bg-gray-100'}`}>
                              <Icon className={`w-3.5 h-3.5 ${isConversion ? 'text-green-700' : 'text-gray-600'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${isConversion ? 'bg-green-200 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                                  {label}
                                </span>
                                {e.ai_source && (
                                  <span className="flex items-center gap-1 text-xs text-purple-600">
                                    <Bot className="w-3 h-3" /> {e.ai_source}
                                  </span>
                                )}
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}
                                </span>
                              </div>
                              {e.page_url && <p className="text-xs text-gray-500 mt-1 truncate">{e.page_url}</p>}
                              {isExpanded && (
                                <div className="mt-2 pt-2 border-t border-gray-100 space-y-1 text-xs text-gray-500">
                                  {e.utm_source && <p>UTM: {[e.utm_source, e.utm_medium, e.utm_campaign].filter(Boolean).join(' / ') || '—'}</p>}
                                  {e.referrer && <p>Referrer: {e.referrer}</p>}
                                  {e.country && <p className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {e.country}</p>}
                                  {e.device_type && <p>Device: {e.device_type}</p>}
                                  {e.conversion_value != null && <p className="font-medium text-green-700">${Number(e.conversion_value).toFixed(2)}</p>}
                                </div>
                              )}
                            </div>
                            <button className="flex-shrink-0 text-gray-400 hover:text-gray-600 mt-1">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          </div>
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
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value || '—'}</p>
    </div>
  )
}

function computeSummary(events) {
  if (!events || events.length === 0) return {
    lastLocation: 'Unknown',
    conversionValue: 0,
    device: 'Unknown',
    touchpoints: 0,
    journeyDuration: '—',
    firstTouch: 'Direct',
    currentEventType: '—'
  }

  const pageviews = events.filter(e => e.event === '$pageview')
  const conversions = events.filter(e => e.event === '$conversion')
  const lastEvent = events[events.length - 1]
  const firstEvent = events[0]

  let lastLocation = 'Unknown'
  if (lastEvent?.page_url) {
    try { lastLocation = new URL(lastEvent.page_url).pathname } catch { lastLocation = lastEvent.page_url }
  }

  const conversionValue = conversions.reduce((s, e) => s + (Number(e.conversion_value) || 0), 0)
  const device = events.find(e => e.device_type)?.device_type || 'Unknown'
  const touchpoints = pageviews.length

  let journeyDuration = '—'
  if (events.length >= 2) {
    try {
      const first = new Date(events[0].timestamp)
      const last = new Date(lastEvent.timestamp)
      const days = Math.ceil((last - first) / (1000 * 60 * 60 * 24))
      journeyDuration = days === 0 ? '<1 day' : `${days} day${days > 1 ? 's' : ''}`
    } catch { /* ignore */ }
  }

  const firstTouch = firstEvent?.first_touch_source || firstEvent?.utm_source || firstEvent?.source || 'Direct'
  const lastConversion = conversions[conversions.length - 1]
  const currentEventType = lastConversion?.conversion_type || '—'

  return { lastLocation, conversionValue, device, touchpoints, journeyDuration, firstTouch, currentEventType }
}
