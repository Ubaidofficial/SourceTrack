import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getJourney } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { Search, Globe, Bot, MousePointerClick, Clock, MapPin } from 'lucide-react'

export default function Journey() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)
  const [visitorId, setVisitorId] = useState('')
  const [searchId, setSearchId] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sites')
        .select('site_key')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()
      setSite(data)
    }
    load()
  }, [user])

  const { data, isLoading } = useQuery({
    queryKey: ['journey', site?.site_key, searchId],
    queryFn: () => getJourney(site?.site_key, searchId),
    enabled: !!site && !!searchId
  })

  const events = data?.events || []
  const eventIcons = {
    '$pageview': Globe,
    '$conversion': MousePointerClick
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Visitor Journey</h2>
        <p className="text-sm text-gray-500 mt-1">Search for a visitor to see their full journey</p>
      </div>

      {/* Search */}
      <form
        onSubmit={(e) => { e.preventDefault(); setSearchId(visitorId.trim()) }}
        className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
      >
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={visitorId}
              onChange={(e) => setVisitorId(e.target.value)}
              placeholder="Enter visitor ID..."
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={!visitorId.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            Search
          </button>
        </div>
      </form>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      )}

      {/* Results */}
      {data && !isLoading && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Visitor: {data.visitor_id}</h3>
            <p className="text-xs text-gray-400 mt-1">{data.event_count} events found</p>
          </div>

          {events.length === 0 ? (
            <p className="text-sm text-gray-400">No events found for this visitor.</p>
          ) : (
            <div className="relative pl-6 border-l-2 border-indigo-200 space-y-5">
              {events.map((e, i) => {
                const Icon = eventIcons[e.event] || Clock
                return (
                  <div key={i} className="relative -left-[31px] flex gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      e.is_conversion ? 'bg-green-100' : 'bg-indigo-100'
                    }`}>
                      <Icon className={`w-3.5 h-3.5 ${e.is_conversion ? 'text-green-600' : 'text-indigo-600'}`} />
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
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
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
                        <p className="text-xs text-gray-500 mt-1 truncate max-w-md">{e.page_url}</p>
                      )}
                      {e.utm_source && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {[e.utm_source, e.utm_medium, e.utm_campaign].filter(Boolean).join(' / ')}
                        </p>
                      )}
                      {e.conversion_value != null && (
                        <p className="text-xs font-medium text-green-600 mt-0.5">${Number(e.conversion_value).toFixed(2)}</p>
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
