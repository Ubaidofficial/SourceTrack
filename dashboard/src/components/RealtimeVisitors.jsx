import { useState, useEffect, useCallback, useRef } from 'react'
import { Monitor, Smartphone, Tablet } from 'lucide-react'
import { fetchApi } from '../lib/api'
import { shouldPoll, LIVE_FEED_POLL_MS } from '../lib/liveFeed'
import DashboardCard from './DashboardCard'

// Anonymous display names. The tracker is cookieless and stores no PII (§6), so a visitor has
// no name to show — these are a stable label for an anonymous id, NOT an identity. Derived
// deterministically from the id so the same visitor keeps the same name across polls (a random
// name would re-shuffle every 10s and make the panel unreadable).
const ANIMALS = ['Koala', 'Otter', 'Panther', 'Falcon', 'Dolphin',
  'Raven', 'Jaguar', 'Lynx', 'Panda', 'Fox', 'Wolf', 'Eagle', 'Bear',
  'Hawk', 'Crane', 'Viper', 'Bison', 'Moose', 'Gecko', 'Manta']
const ADJECTIVES = ['Bright', 'Calm', 'Swift', 'Bold', 'Wise', 'Quick',
  'Keen', 'Quiet', 'Warm', 'Cool', 'Dark', 'Wild', 'Rare', 'Pure',
  'Soft', 'Fast', 'Deep', 'High', 'Near', 'Fair']

export function anonName (id) {
  const h = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0)
  return ADJECTIVES[Math.abs(h) % ADJECTIVES.length] + ' ' +
         ANIMALS[Math.abs(h >> 5) % ANIMALS.length]
}

// ISO-3166 alpha-2 -> regional-indicator flag emoji.
export function countryFlag (code) {
  if (!code) return '🌐'
  return code.toUpperCase().replace(/./g,
    c => String.fromCodePoint(c.charCodeAt(0) + 127397))
}

// Path only — the domain is the customer's own site, so it is noise in every row.
function pagePath (url) {
  const path = String(url || '/').replace(/^https?:\/\/[^/]+/, '') || '/'
  return path.length > 32 ? path.slice(0, 32) + '…' : path
}

function DeviceIcon ({ type, className = 'w-3.5 h-3.5' }) {
  if (type === 'mobile') return <Smartphone className={className} />
  if (type === 'tablet') return <Tablet className={className} />
  return <Monitor className={className} />
}

export default function RealtimeVisitors ({ siteKey }) {
  const [visitors, setVisitors] = useState([])
  const [loading, setLoading] = useState(true)
  // "Can't read" is not "nobody is here". The API reports degraded when the backing pipe is
  // undeployed or the read died, and this panel must then say so rather than claim an empty
  // room — the live counter next to it may well be showing visitors (§6).
  const [degraded, setDegraded] = useState(false)

  // A ref, not state: `load` must not change identity on every poll, or the interval effect
  // below would tear down and recreate the timer on each response.
  const hadDataRef = useRef(false)

  const load = useCallback(async () => {
    if (!siteKey) return
    try {
      const d = await fetchApi(`/live/visitors?site_key=${encodeURIComponent(siteKey)}`)
      setVisitors(d?.visitors || [])
      setDegraded(!!d?.degraded)
      if (!d?.degraded) hadDataRef.current = true
    } catch (_) {
      // Transient poll error (the route now 500s on a real failure) — keep the last good list
      // rather than blanking the panel. But if there has never been a good read, "unknown" is
      // the truth, not an empty room.
      if (!hadDataRef.current) setDegraded(true)
    } finally {
      setLoading(false)
    }
  }, [siteKey])

  useEffect(() => { load() }, [load])

  // Same cadence and same hidden-tab pause as the /events/latest feed — a backgrounded tab
  // should not keep hitting the API.
  useEffect(() => {
    if (!siteKey) return
    const id = setInterval(() => {
      if (!shouldPoll(typeof document !== 'undefined' && document.hidden)) return
      load()
    }, LIVE_FEED_POLL_MS)
    return () => clearInterval(id)
  }, [siteKey, load])

  const rows = visitors.slice(0, 10)

  return (
    <DashboardCard title="Realtime Visitors" subtitle="Active in the last 5 minutes" bodyClassName="p-0">
      {loading ? (
        <div className="divide-y divide-gray-100 dark:divide-dark-border">
          {[0, 1, 2].map(i => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-gray-100 dark:bg-dark-hover animate-pulse" />
              <div className="h-3 w-28 rounded bg-gray-100 dark:bg-dark-hover animate-pulse" />
              <div className="h-3 w-32 rounded bg-gray-100 dark:bg-dark-hover animate-pulse ml-auto" />
            </div>
          ))}
        </div>
      ) : degraded && rows.length === 0 ? (
        // Checked BEFORE the empty state: an unreadable feed must not render as an empty one.
        <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">
          Visitor data temporarily unavailable
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-st-gray dark:text-gray-400 py-6 text-center">
          No active visitors in the last 5 minutes
        </p>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-dark-border">
          {rows.map(v => (
            <div key={v.id} className="px-5 py-3 flex items-center gap-3 text-sm">
              <span className="text-base leading-none" aria-hidden="true">{countryFlag(v.country)}</span>
              <span className="font-medium text-st-black dark:text-dark-primary whitespace-nowrap">
                {anonName(String(v.id))}
              </span>
              <span className="font-mono text-xs text-st-gray dark:text-gray-400 truncate">
                {pagePath(v.current_page)}
              </span>
              <span
                className={`ml-auto shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                  v.is_ai
                    ? 'bg-st-lime/25 text-st-black dark:bg-st-lime-dark/20 dark:text-st-lime-dark'
                    : 'bg-gray-100 text-st-gray dark:bg-dark-hover dark:text-gray-400'
                }`}
              >
                {v.source}
              </span>
              <span className="shrink-0 text-st-gray dark:text-gray-400">
                <DeviceIcon type={v.device_type} />
              </span>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  )
}
