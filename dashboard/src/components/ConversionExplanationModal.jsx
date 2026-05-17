import { useState, useEffect } from 'react'
import { X, HelpCircle, ArrowRight, MousePointerClick, Clock, Route, AlertTriangle, CheckCircle2, Layers } from 'lucide-react'
import { fetchApi } from '../lib/api'
import { supabase } from '../lib/supabase'

export default function ConversionExplanationModal({ isOpen, onClose, siteKey, model, distinctId }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState('events') // 'events' | 'sessions'

  const isGeneric = !distinctId

  useEffect(() => {
    if (!isOpen || !siteKey || !model) return
    if (isGeneric) {
      // Generic mode: show model explanation without specific conversion
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token
        const headers = { Authorization: `Bearer ${token}` }
        const res = await fetchApi(
          `/attribution/explain?site_key=${encodeURIComponent(siteKey)}&model=${encodeURIComponent(model)}&distinct_id=${encodeURIComponent(distinctId)}`,
          { headers }
        )
        setData(res)
      } catch (e) {
        setError(e.message || 'Failed to load explanation')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [isOpen, siteKey, model, distinctId, isGeneric])

  if (!isOpen) return null

  const modelLabels = {
    first_touch: 'First Touch',
    last_touch: 'Last Touch',
    first_touch_non_direct: 'First Touch (Non-Direct)',
    last_touch_non_direct: 'Last Touch (Non-Direct)',
    ai_platforms: 'AI Platform'
  }

  const attributedTouch = data?.all_touches?.find(t => {
    if (!data.attributed_to) return false
    return t.source === data.attributed_to.source && t.type !== 'direct'
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-st-gray" />
            <h3 className="text-base font-semibold text-st-black">Attribution Explanation</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-st-gray hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-st-black" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && isGeneric && (
            <div className="space-y-5">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-1">{modelLabels[model] || model}</p>
                <p className="text-sm text-blue-700">This is a generic model explanation. Select a specific conversion from the journey or leads view to see the full attribution breakdown for an individual visitor.</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-2">
                <p className="font-medium text-gray-700">How this model works</p>
                {model === 'first_touch' && (
                  <p>First Touch assigns 100% credit to the first UTM source this visitor ever encountered. The value is stored in a browser cookie at their initial visit and sent with every conversion event. If no UTM was present on the first visit, the source is "direct".</p>
                )}
                {model === 'last_touch' && (
                  <p>Last Touch assigns 100% credit to the UTM source on the page at the time of conversion. If no UTM params are present on the conversion page, the source is "direct".</p>
                )}
                {model === 'first_touch_non_direct' && (
                  <p>First Touch (Non-Direct) finds the earliest pageview with a non-empty, non-direct UTM source. Direct touches (no UTM or UTM source = "direct") are skipped. If the visitor never had a non-direct pageview, it falls back to the first-touch cookie value.</p>
                )}
                {model === 'last_touch_non_direct' && (
                  <p>Last Touch (Non-Direct) finds the latest pageview with a non-empty, non-direct UTM source. Direct touches are skipped. If the visitor never had a non-direct pageview, it falls back to the conversion page UTM.</p>
                )}
                {model === 'ai_platforms' && (
                  <p>AI Platform attribution detects the referrer at conversion time and matches it against known AI platform domains (ChatGPT, Claude, Perplexity, Gemini, Grok, Copilot, DeepSeek). Only conversions with a detected AI referrer receive credit.</p>
                )}
                <p className="text-st-gray">Single-touch model: only one touchpoint receives 100% credit.</p>
              </div>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* Conversion details */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-st-gray uppercase tracking-wide">Conversion</span>
                  <span className="text-xs text-st-gray">{data.conversion?.ingestion_method || 'server_routed'}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-st-gray">Value</p>
                    <p className="font-medium text-st-black">${(data.conversion?.value || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-st-gray">Date</p>
                    <p className="font-medium text-st-black">{data.conversion?.timestamp ? new Date(data.conversion.timestamp).toLocaleString() : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-st-gray">Attributed To</p>
                    <p className="font-medium text-st-black">
                      {data.attributed_to?.source || 'direct'}
                      {data.attributed_to?.medium && data.attributed_to.medium !== 'none' && (
                        <span className="text-st-gray"> / {data.attributed_to.medium}</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Explanation card */}
              <div className={`rounded-lg p-4 border ${data.fallback ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                <div className="flex items-start gap-3">
                  {data.fallback ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-st-black">
                      {modelLabels[data.model] || data.model}
                      {data.fallback && <span className="text-amber-700 ml-1">(fallback)</span>}
                    </p>
                    <p className="text-sm text-gray-600">{data.reason}</p>
                  </div>
                </div>
              </div>

              {/* Journey summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                  <Route className="w-4 h-4 text-st-gray mx-auto mb-1" />
                  <p className="text-lg font-semibold text-st-black">{data.journey_summary?.touchpoint_count || 0}</p>
                  <p className="text-xs text-st-gray">Touchpoints</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                  <Clock className="w-4 h-4 text-st-gray mx-auto mb-1" />
                  <p className="text-lg font-semibold text-st-black">{data.journey_summary?.journey_duration_days || 0}d</p>
                  <p className="text-xs text-st-gray">Journey Duration</p>
                </div>
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                  <MousePointerClick className="w-4 h-4 text-st-gray mx-auto mb-1" />
                  <p className="text-lg font-semibold text-st-black">{data.journey_summary?.total_events || 0}</p>
                  <p className="text-xs text-st-gray">Total Events</p>
                </div>
              </div>

              {/* Session summary */}
              {data.journey_summary?.session_count > 0 && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                    <Layers className="w-4 h-4 text-st-gray mx-auto mb-1" />
                    <p className="text-lg font-semibold text-st-black">{data.journey_summary?.session_count || 0}</p>
                    <p className="text-xs text-st-gray">Sessions</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                    <Clock className="w-4 h-4 text-st-gray mx-auto mb-1" />
                    <p className="text-lg font-semibold text-st-black">
                      {data.journey_summary?.converting_session_index || '—'}
                    </p>
                    <p className="text-xs text-st-gray">Converting Session</p>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                    <Route className="w-4 h-4 text-st-gray mx-auto mb-1" />
                    <p className="text-lg font-semibold text-st-black">
                      {data.sessions?.find(s => s.contains_conversion)?.pageview_count || 0}
                    </p>
                    <p className="text-xs text-st-gray">Pages in Conv. Session</p>
                  </div>
                </div>
              )}

              {/* Timeline toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode('events')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    viewMode === 'events'
                      ? 'bg-st-black text-white border-st-black'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Event Timeline
                </button>
                <button
                  onClick={() => setViewMode('sessions')}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    viewMode === 'sessions'
                      ? 'bg-st-black text-white border-st-black'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  Session Timeline
                </button>
              </div>

              {/* Event timeline */}
              {viewMode === 'events' && (
                <div>
                  <h4 className="text-sm font-medium text-st-black mb-3">Journey Timeline</h4>
                  <div className="space-y-2">
                    {data.all_touches?.map((touch, i) => {
                      const isAttributed = attributedTouch &&
                        touch.timestamp === attributedTouch.timestamp &&
                        touch.source === attributedTouch.source
                      const isSkipped = data.skipped_touches?.some(s => s.timestamp === touch.timestamp)

                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-3 p-2.5 rounded-lg border text-sm ${
                            isAttributed
                              ? 'bg-green-50 border-green-200'
                              : isSkipped
                              ? 'bg-gray-50 border-gray-100 opacity-60'
                              : 'bg-white border-gray-100'
                          }`}
                        >
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isAttributed ? 'bg-green-500' : isSkipped ? 'bg-gray-300' : 'bg-gray-400'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-st-black">{touch.source || 'direct'}</span>
                              {touch.medium && touch.medium !== 'none' && (
                                <span className="text-xs text-st-gray">/ {touch.medium}</span>
                              )}
                              {isAttributed && (
                                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Credit</span>
                              )}
                              {isSkipped && (
                                <span className="text-xs bg-gray-100 text-st-gray px-1.5 py-0.5 rounded line-through">Skipped</span>
                              )}
                            </div>
                            <p className="text-xs text-st-gray truncate">{touch.page_url || '—'}</p>
                          </div>
                          <span className="text-xs text-st-gray whitespace-nowrap">
                            {new Date(touch.timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Session timeline */}
              {viewMode === 'sessions' && data.sessions?.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-st-black mb-3">Session Timeline</h4>
                  <div className="space-y-3">
                    {data.sessions.map((sess) => (
                      <div
                        key={sess.session_index}
                        className={`rounded-lg border p-3 text-sm ${
                          sess.contains_conversion
                            ? 'bg-green-50 border-green-200'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Layers className="w-3.5 h-3.5 text-st-gray" />
                            <span className="font-medium text-st-black">Session {sess.session_index}</span>
                            {sess.contains_conversion && (
                              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Conversion</span>
                            )}
                          </div>
                          <span className="text-xs text-st-gray">
                            {Math.round((sess.duration_seconds || 0) / 60)}m
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-2">
                          <div>
                            <span className="text-st-gray">Entry:</span>{' '}
                            <span className={sess.is_direct_entry ? 'text-st-gray' : 'text-st-black'}>
                              {sess.entry_source || 'direct'}
                            </span>
                          </div>
                          <div>
                            <span className="text-st-gray">Pages:</span>{' '}
                            {sess.pageview_count || 0}
                          </div>
                          <div>
                            <span className="text-st-gray">Start:</span>{' '}
                            {new Date(sess.started_at).toLocaleDateString()}
                          </div>
                          <div>
                            <span className="text-st-gray">Events:</span>{' '}
                            {sess.event_count || 0}
                          </div>
                        </div>
                        {sess.entry_page && (
                          <p className="text-xs text-st-gray truncate">{sess.entry_page}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Model logic tooltip */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                <p className="font-medium text-gray-700">Why this attribution?</p>
                {data.model === 'first_touch' && (
                  <p>First Touch assigns 100% credit to the first UTM source this visitor ever encountered. The value is stored in a browser cookie at their initial visit and sent with every conversion event.</p>
                )}
                {data.model === 'last_touch' && (
                  <p>Last Touch assigns 100% credit to the UTM source on the page at the time of conversion. If no UTM params are present, the conversion is attributed to "direct".</p>
                )}
                {data.model === 'first_touch_non_direct' && (
                  <p>First Touch (Non-Direct) finds the earliest pageview with a non-empty, non-direct UTM source. If the visitor never had such a pageview, it falls back to the first-touch cookie value (which may be direct).</p>
                )}
                {data.model === 'last_touch_non_direct' && (
                  <p>Last Touch (Non-Direct) finds the latest pageview with a non-empty, non-direct UTM source. If the visitor never had such a pageview, it falls back to the conversion page UTM (which may be direct).</p>
                )}
                {data.model === 'ai_platforms' && (
                  <p>AI Platform attribution detects the referrer at conversion time and matches it against known AI platform domains (ChatGPT, Claude, Perplexity, Gemini, Grok, Copilot, DeepSeek).</p>
                )}
                <p className="text-st-gray mt-1">Single-touch model: only one touchpoint receives credit.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}