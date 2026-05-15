import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getEventHealth, getEdgeCases, fetchApi, getLatestEvents } from '../lib/api'
import {
  RefreshCw,
  Bug,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ExternalLink,
  Shield,
  Search,
  Filter,
  X,
  Database
} from 'lucide-react'
import { Link } from 'react-router-dom'

function formatPath(url) {
  if (!url) return '—'
  try {
    return new URL(url).pathname || '/'
  } catch {
    return url
  }
}

function formatHost(url) {
  if (!url) return '—'
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function eventBadgeClass(event, isConversion) {
  if (isConversion) return 'bg-green-100 text-green-700'
  if (event === '$pageview') return 'bg-blue-100 text-blue-700'
  if (event === 'install_verified') return 'bg-purple-100 text-purple-700'
  return 'bg-gray-100 text-gray-700'
}

function normalizeEventName(eventName = '') {
  return String(eventName).replace(/^\$/, '').toLowerCase()
}

export default function EventDebugger() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)
  const [events, setEvents] = useState([])
  const [health, setHealth] = useState(null)
  const [edge, setEdge] = useState(null)
  const [hygiene, setHygiene] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [filters, setFilters] = useState({
    event_type: 'all',
    source: '',
    date_from: '',
    date_to: '',
    search: ''
  })

  useEffect(() => {
    async function load() {
      const { data: member } = await supabase
        .from('company_members')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle()

      const query = supabase.from('sites').select('site_key, name, domain').limit(1)
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

  const buildLatestEventsPath = useCallback(() => {
    const params = new URLSearchParams({ site_key: site.site_key, limit: '100' })

    Object.entries(filters).forEach(([key, value]) => {
      if (value && value !== 'all') params.set(key, value)
    })

    return `/events/latest?${params.toString()}`
  }, [site, filters])

  const fetchAll = useCallback(async () => {
    if (!site) return

    const isInitialLoad = !health && events.length === 0
    if (isInitialLoad) setLoading(true)
    setRefreshing(true)

    try {
      const [eventsData, healthData, edgeData, hygieneData] = await Promise.all([
        getLatestEvents(site.site_key),
        getEventHealth(site.site_key),
        getEdgeCases(site.site_key),
        (async () => {
          const params = new URLSearchParams({ site_key: site.site_key })
          return fetchApi(`/hygiene/utms?${params}`)
        })()
      ])
      setEvents(eventsData?.events || [])
      setHealth(healthData)
      setEdge(edgeData)
      setHygiene(hygieneData)
    } catch (_err) {
      /* silent */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [site, health, events.length])

  useEffect(() => {
    if (site) fetchAll()
  }, [site, fetchAll])

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({
      event_type: 'all',
      source: '',
      date_from: '',
      date_to: '',
      search: ''
    })
  }

  const statusChip = () => {
    if (!health) return null

    switch (health.status) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle className="w-3.5 h-3.5" />
            Healthy
          </span>
        )
      case 'silent_24h':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" />
            Silent &gt;24h
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            <XCircle className="w-3.5 h-3.5" />
            Never seen events
          </span>
        )
    }
  }

  const hints = []
  if (health?.status === 'never_seen') {
    hints.push({ text: 'Check snippet — paste it in the <head> of your live site.', link: '/snippet' })
    hints.push({ text: 'Verify domain matches your Supabase site settings.', link: '/settings' })
  }
  if (health?.status === 'silent_24h') {
    hints.push({ text: 'No events in 24h. Visit your site or check the snippet is still live.', link: '/snippet' })
  }
  if (edge?.multiple_domains) {
    hints.push({ text: `Events coming from ${edge.domain_count} domains. Make sure you are tracking the right site.` })
  }
  if (edge?.ai_without_utm > 0) {
    hints.push({ text: `${edge.ai_without_utm} events have AI source but no UTM params. This is normal for organic AI traffic.` })
  }
  if (edge?.utm_without_ai > 0) {
    hints.push({ text: `${edge.utm_without_ai} events have UTM but no AI source. Expected for non-AI campaigns.` })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Event Logger</h2>
          <p className="text-sm text-gray-500 mt-1">Inspect incoming events and verify tracking health</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading || !site}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bug className="w-4 h-4 text-gray-700" />
          <h3 className="text-sm font-semibold text-gray-700">Health</h3>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {statusChip()}
          {health?.count_day != null && (
            <span className="text-sm text-gray-500">{health.count_day} events in 24h</span>
          )}
          {health?.count_hour != null && (
            <span className="text-sm text-gray-400">{health.count_hour} in last hour</span>
          )}
          {health?.last_event && (
            <span className="text-sm text-gray-400">
              Last: {new Date(health.last_event).toLocaleString()}
            </span>
          )}
        </div>
      </div>

      {hints.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-5 space-y-2">
          <p className="text-sm font-semibold text-amber-800">Suggestions</p>
          {hints.map((h, i) => (
            <p key={i} className="text-sm text-amber-700">
              {h.link ? (
                <Link to={h.link} className="inline-flex items-center gap-1 underline hover:no-underline">
                  {h.text} <ExternalLink className="w-3 h-3" />
                </Link>
              ) : (
                h.text
              )}
            </p>
          ))}
        </div>
      )}

      {edge && (edge.multiple_domains || edge.ai_without_utm > 0 || edge.utm_without_ai > 0) && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Edge Cases</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {edge.multiple_domains && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-400">Multiple Domains</p>
                <p className="text-lg font-semibold text-gray-900">{edge.domain_count}</p>
                <p className="text-xs text-gray-500 mt-1 truncate">{edge.domains?.slice(0, 3).join(', ')}</p>
              </div>
            )}
            {edge.ai_without_utm > 0 && (
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-xs text-purple-400">AI w/o UTM</p>
                <p className="text-lg font-semibold text-purple-700">{edge.ai_without_utm}</p>
                <p className="text-xs text-purple-500 mt-1">Organic AI visits</p>
              </div>
            )}
            {edge.utm_without_ai > 0 && (
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-xs text-blue-400">UTM w/o AI</p>
                <p className="text-lg font-semibold text-blue-700">{edge.utm_without_ai}</p>
                <p className="text-xs text-blue-500 mt-1">Standard campaigns</p>
              </div>
            )}
          </div>
        </div>
      )}

      {hygiene && hygiene.issues && hygiene.issues.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-700">Data Quality</h3>
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
              {hygiene.issues.length} issue{hygiene.issues.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-2">
            {hygiene.issues.map((issue, i) => (
              <div key={i} className={`rounded-lg p-3 text-sm ${
                issue.severity === 'high'
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : issue.severity === 'medium'
                    ? 'bg-amber-50 border border-amber-200 text-amber-800'
                    : 'bg-gray-50 border border-gray-200 text-gray-700'
              }`}>
                <p className="font-medium">{issue.message}</p>
                <p className="text-xs mt-1 opacity-75">{issue.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-gray-700" />
              <h3 className="text-sm font-semibold text-gray-700">Latest Events</h3>
              {!loading && (
                <span className="text-xs text-gray-400">{events.length} shown</span>
              )}
            </div>
            <button
              onClick={clearFilters}
              className="text-xs text-gray-500 hover:text-gray-900"
            >
              Clear filters
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <label className="space-y-1">
              <span className="text-xs text-gray-500">Event type</span>
              <select
                value={filters.event_type}
                onChange={(e) => updateFilter('event_type', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
              >
                <option value="all">All events</option>
                <option value="$pageview">Pageviews</option>
                <option value="$conversion">Conversions</option>
                <option value="install_verified">Install verified</option>
                <option value="$identify">Identify</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs text-gray-500">Source</span>
              <div className="relative">
                <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  value={filters.source}
                  onChange={(e) => updateFilter('source', e.target.value)}
                  placeholder="google, chatgpt..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>
            </label>

            <label className="space-y-1">
              <span className="text-xs text-gray-500">From</span>
              <input
                type="date"
                value={filters.date_from}
                onChange={(e) => updateFilter('date_from', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-gray-500">To</span>
              <input
                type="date"
                value={filters.date_to}
                onChange={(e) => updateFilter('date_to', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs text-gray-500">Search</span>
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                <input
                  value={filters.search}
                  onChange={(e) => updateFilter('search', e.target.value)}
                  placeholder="event, page, id..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg"
                />
              </div>
            </label>
          </div>
        </div>

        {error && (
          <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && events.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-gray-500">No events match these filters.</p>
            <p className="text-xs text-gray-400 mt-1">Clear filters or send a fresh pageview/conversion event.</p>
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Event</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Time</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Distinct ID</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Source</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Medium</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Campaign</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Click IDs</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">AI Source</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Page</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Referrer</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Conversion</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Value</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Ingestion</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Device</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Country</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr
                    key={`${e.timestamp}-${e.event}-${i}`}
                    onClick={() => setSelectedEvent(e)}
                    className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="py-2 px-4">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${eventBadgeClass(e.event, e.is_conversion)}`}>
                        {e.event}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-gray-500 text-xs max-w-[160px] truncate">
                      {e.distinct_id || '—'}
                    </td>
                    <td className="py-2 px-4 text-gray-600 text-xs">{e.source || '—'}</td>
                    <td className="py-2 px-4 text-gray-600 text-xs">{e.medium || '—'}</td>
                    <td className="py-2 px-4 text-gray-600 text-xs max-w-[160px] truncate">{e.campaign || '—'}</td>
                    <td className="py-2 px-4 text-gray-600 text-xs text-[10px]">
                      {[e.gclid, e.fbclid, e.msclkid, e.ttclid].filter(Boolean).map(id => id.slice(0, 8)).join(", ") || "—"}
                    </td>
                    <td className="py-2 px-4 text-gray-600 text-xs">{e.ai_source || '—'}</td>
                    <td className="py-2 px-4 text-gray-600 text-xs max-w-[200px] truncate">{formatPath(e.page_url)}</td>
                    <td className="py-2 px-4 text-gray-500 text-xs max-w-[150px] truncate">{formatHost(e.referrer)}</td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{e.conversion_type || '—'}</td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{e.conversion_value ?? '—'}</td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{e.ingestion_method || 'pixel'}</td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{e.device_type || '—'}</td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{e.country || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setSelectedEvent(null)}>
          <div
            className="h-full w-full max-w-xl bg-white shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 p-5 flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-400">Event details</p>
                <h3 className="text-lg font-semibold text-gray-900">{selectedEvent.event}</h3>
                <p className="text-xs text-gray-500 mt-1">{new Date(selectedEvent.timestamp).toLocaleString()}</p>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['Distinct ID', selectedEvent.distinct_id],
                  ['Source', selectedEvent.source],
                  ['Medium', selectedEvent.medium],
                  ['Campaign', selectedEvent.campaign],
                  ['UTM Content', selectedEvent.utm_content],
                  ['UTM Term', selectedEvent.utm_term],
                  ['Ref Param', selectedEvent.ref_param],
                  ['Source Param', selectedEvent.source_param],
                  ['Via Param', selectedEvent.via_param],
                  ['First Touch Source', selectedEvent.first_touch_source],
                  ['First Touch Medium', selectedEvent.first_touch_medium],
                  ['First Touch Campaign', selectedEvent.first_touch_campaign],
                  ['AI Source', selectedEvent.ai_source],
                  ['Page', selectedEvent.page_url],
                  ['Referrer', selectedEvent.referrer],
                  ['Conversion Type', selectedEvent.conversion_type],
                  ['Conversion Value', selectedEvent.conversion_value],
                  ['Ingestion', selectedEvent.ingestion_method || 'pixel'],
                  ['Device', selectedEvent.device_type],
                  ['Country', selectedEvent.country]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-400">{label}</p>
                    <p className="mt-1 text-gray-800 break-words">{value ?? '—'}</p>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-gray-700">Raw properties</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(selectedEvent.properties || {}, null, 2))}
                    className="text-xs text-gray-500 hover:text-gray-900"
                  >
                    Copy JSON
                  </button>
                </div>
                <pre className="text-xs bg-gray-950 text-gray-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(selectedEvent.properties || {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
