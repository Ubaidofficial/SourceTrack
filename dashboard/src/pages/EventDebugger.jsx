import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getLatestEvents, getEventHealth, getEdgeCases, fetchApi } from '../lib/api'
import { RefreshCw, Bug, AlertTriangle, CheckCircle, XCircle, ExternalLink, Shield } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function EventDebugger() {
  const { user } = useAuth()
  const [site, setSite] = useState(null)
  const [events, setEvents] = useState([])
  const [health, setHealth] = useState(null)
  const [edge, setEdge] = useState(null)
  const [hygiene, setHygiene] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('sites')
        .select('site_key, name, domain')
        .eq('owner_id', user.id)
        .limit(1)
        .maybeSingle()
      setSite(data)
    }
    load()
  }, [user])

  const fetchAll = useCallback(async () => {
    if (!site) return
    setLoading(true)
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
    }
  }, [site])

  useEffect(() => {
    if (site) fetchAll()
  }, [site, fetchAll])

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Event Debugger</h2>
          <p className="text-sm text-gray-500 mt-1">Inspect incoming events and verify tracking health</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Health */}
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

      {/* Hints */}
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

      {/* Edge Cases */}
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

      {/* Data Quality / Hygiene */}
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

      {/* Events Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Latest Events</h3>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && events.length === 0 && (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            No events yet. Install the snippet and visit your site.
          </div>
        )}

        {!loading && events.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Event</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Time</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">AI Source</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Page</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Referrer</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Device</th>
                  <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">Country</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2 px-4">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                        e.is_conversion
                          ? 'bg-green-100 text-green-700'
                          : e.event === '$pageview'
                            ? 'bg-blue-100 text-blue-700'
                            : e.event === 'install_verified'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-700'
                      }`}>
                        {e.event}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(e.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2 px-4 text-gray-600 text-xs">
                      {e.ai_source || '—'}
                    </td>
                    <td className="py-2 px-4 text-gray-600 text-xs max-w-[200px] truncate">
                      {e.page_url ? (() => {
                        try { return new URL(e.page_url).pathname } catch { return e.page_url }
                      })() : '—'}
                    </td>
                    <td className="py-2 px-4 text-gray-500 text-xs max-w-[150px] truncate">
                      {e.referrer ? (() => {
                        try { return new URL(e.referrer).hostname } catch { return e.referrer }
                      })() : '—'}
                    </td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{e.device_type || '—'}</td>
                    <td className="py-2 px-4 text-gray-500 text-xs">{e.country || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
