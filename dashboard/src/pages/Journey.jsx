import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getJourney } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Search, Globe, Bot, MousePointerClick, Clock, MapPin, Filter, ArrowRight, GitBranch } from 'lucide-react'
import { formatCurrencyDecimal } from '../utils/numbers'

const FILTERS = [
  { key: 'all', label: 'All Events' },
  { key: 'conversions', label: 'Conversions' },
  { key: 'ai', label: 'AI Touchpoints' }
]

export default function Journey() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [site, setSite] = useState(null)
  const [visitorId, setVisitorId] = useState('')
  const [searchId, setSearchId] = useState('')
  const [filter, setFilter] = useState('all')

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

  const { data, isLoading } = useQuery({
    queryKey: ['journey', site?.site_key, searchId],
    queryFn: () => getJourney(site?.site_key, searchId),
    enabled: !!site && !!searchId
  })

  const events = data?.events || []

  const filteredEvents = filter === 'all'
    ? events
    : filter === 'conversions'
      ? events.filter(e => e.event === '$conversion')
      : events.filter(e => e.ai_source != null && e.ai_source !== '')
  const eventIcons = {
    '$pageview': Globe,
    '$conversion': MousePointerClick
  }

  // Build a simple pre-conversion path summary from ordered events.
  // Rule: extract pathname from page_url, deduplicate consecutive identical pages,
  // stop at the first conversion event. If no conversion, show all deduplicated touchpoints.
  // Labeled as a simple summary — NOT full path analytics.
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
        // Clean trailing slash for consistency
        if (label.length > 1 && label.endsWith('/')) label = label.slice(0, -1)
      }
      if (!label || label === '/') {
        label = e.utm_source || 'unknown'
      }
      // Deduplicate consecutive identical segments
      if (segments.length === 0 || segments[segments.length - 1] !== label) {
        segments.push(label)
      }
    }

    // Mark the last segment as conversion if it was one
    const hasConversion = firstConversionIdx >= 0
    return { segments, hasConversion }
  }

  const pathSummary = events.length > 0 ? buildPathSummary(events) : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-st-black">Visitor Journey</h2>
        <p className="text-sm text-st-gray mt-1">Search for a visitor to see their full journey</p>
      </div>

      {/* Search */}
      <form
        onSubmit={(e) => { e.preventDefault(); setSearchId(visitorId.trim()) }}
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

      {/* Results */}
      {data && !isLoading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Visitor: {data.visitor_id}</h3>
            <p className="text-xs text-st-gray mt-1">
              {filteredEvents.length} of {data.event_count} events
              {filter !== 'all' ? ` (filtered)` : ''}
            </p>
          </div>

          {/* Filter toggles */}
          {events.length > 0 && (
            <div className="flex items-center gap-2 mb-4 pb-4 border-b border-gray-100">
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
          )}

          {/* Path Summary */}
          {pathSummary && pathSummary.segments.length >= 2 && (
            <div className="mb-4 pb-4 border-b border-gray-100">
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

          {events.length === 0 ? (
            <p className="text-sm text-st-gray">No events found for this visitor.</p>
          ) : filteredEvents.length === 0 ? (
            <p className="text-sm text-st-gray py-4 text-center">
              No {filter === 'conversions' ? 'conversion' : filter === 'ai' ? 'AI-referred' : ''} events found for this visitor.
            </p>
          ) : (
            <div className="relative pl-6 border-l-2 border-gray-200 space-y-5">
              {filteredEvents.map((e, i) => {
                const Icon = eventIcons[e.event] || Clock
                return (
                  <div key={i} className="relative -left-[31px] flex gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      e.is_conversion ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      <Icon className={`w-3.5 h-3.5 ${e.is_conversion ? 'text-green-600' : 'text-gray-700'}`} />
                    </div>
                    <div className="pb-4">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          e.is_conversion ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {e.event}
                        </span>
                        {e.ai_source && (
                          <span className="flex items-center gap-1 text-xs text-purple-600">
                            <Bot className="w-3 h-3" />
                            {e.ai_source}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-st-gray">
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
                        <p className="text-xs text-st-gray mt-1 truncate max-w-md">{e.page_url}</p>
                      )}
                      {e.utm_source && (
                        <p className="text-xs text-st-gray mt-0.5">
                          {[e.utm_source, e.utm_medium, e.utm_campaign].filter(Boolean).join(' / ')}
                        </p>
                      )}
                      {e.conversion_value != null && (
                        <p className="text-xs font-medium text-green-600 mt-0.5">{formatCurrencyDecimal(e.conversion_value)}</p>
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
}
