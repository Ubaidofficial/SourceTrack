import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Send, RefreshCw, AlertTriangle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { fetchApi } from '../lib/api'

// Deterministic, read-only CAPI Delivery Status surface for Setup & Health.
// Shows the last 50 server-side conversion-forward attempts for this site.
// Diagnostic only — no revenue, no attribution claims, no LLM narration, no
// recommendations/predictions (§26-safe). Data comes solely from the
// SourceTrack API (/integrations/capi/deliveries) — no PostHog, no direct
// Supabase, no external service.

// Platform filter chips (client-side). Values match capi_deliveries.platform, which is
// written by dispatchCapi's fan-out in api/lib/conversion-sync.js.
//
// This list had drifted: ga4 and tiktok went live in #498 but were never added here, so
// two already-forwarding platforms had no filter chip and fell through the label lookup
// to their raw key ("ga4", "tiktok") in the delivery table. Fixed alongside adding
// linkedin, because the drift and the addition are the same bug.
//
// `microsoft` is deliberately NOT here. Its sender is in the fan-out but never transmits
// its token (see the CAPI_PLATFORMS note in api/routes/capi.js), so no site can be
// configured for it and it can never produce a delivery row. A chip that always filters
// to nothing reads as "working, no activity" rather than "not available".
const PLATFORMS = [
  { key: 'all', label: 'All' },
  { key: 'meta', label: 'Meta' },
  { key: 'google', label: 'Google' },
  { key: 'ga4', label: 'GA4' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'linkedin', label: 'LinkedIn' }
]

// Kept in sync with PLATFORMS above. The `|| r.platform` fallback at the call sites means
// a missing entry degrades to the raw key rather than crashing — which is why the ga4 /
// tiktok omission went unnoticed.
const PLATFORM_LABEL = { meta: 'Meta', google: 'Google', ga4: 'GA4', tiktok: 'TikTok', linkedin: 'LinkedIn' }

// Status → badge classes. Covers the prod CHECK values (success/failed/skipped)
// AND the spec vocabulary (pending/retry/error/rejected) so it renders correctly
// regardless of which the writer emits. Unknown → neutral.
const STATUS_STYLE = {
  success:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  retry:    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  failed:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  error:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  skipped:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
}
const NEUTRAL_STYLE = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'

// Failure statuses that feed the stalling alert (prod uses 'failed'; spec uses
// 'error'/'rejected').
const FAILURE_STATUSES = new Set(['failed', 'error', 'rejected'])
const STALL_WINDOW_MS = 30 * 60 * 1000

function relativeTime(ts) {
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true })
  } catch (_) {
    return ''
  }
}

export default function CapiDeliveryStatus({ siteKey }) {
  const [platform, setPlatform] = useState('all')
  const [expanded, setExpanded] = useState(null)

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['capi-deliveries', siteKey],
    queryFn: () => fetchApi(`/integrations/capi/deliveries?site_key=${encodeURIComponent(siteKey)}`),
    enabled: !!siteKey,
    retry: false
  })

  const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []
  const filtered = platform === 'all' ? rows : rows.filter(r => r.platform === platform)

  // Deterministic stalling alert: any failure with >=2 attempts in the last 30 min.
  const now = Date.now()
  const stalling = rows.filter(r =>
    FAILURE_STATUSES.has(r.status) &&
    (r.attempt || 0) >= 2 &&
    (now - new Date(r.created_at).getTime()) < STALL_WINDOW_MS
  )
  const stallingPlatforms = [...new Set(stalling.map(r => PLATFORM_LABEL[r.platform] || r.platform))]

  const Shell = ({ children }) => (
    <div className="bg-white dark:bg-[#1A1D1D] border border-gray-200 dark:border-[#2A2E2E] rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Send className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        <h3 className="text-sm font-semibold text-st-black dark:text-dark-primary">CAPI Delivery Status</h3>
      </div>
      {children}
    </div>
  )

  if (isLoading) {
    return (
      <Shell>
        <p className="text-xs text-gray-500 dark:text-gray-400">Server-side conversion forwarding — last 50 attempts.</p>
        <div className="mt-3 space-y-2" aria-hidden>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-9 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </Shell>
    )
  }

  // Calm empty state — never a fake zero. Covers error and no-rows alike.
  if (error || rows.length === 0) {
    return (
      <Shell>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mt-1">
          No CAPI deliveries recorded yet — connect Meta or Google to start forwarding conversions.
        </p>
      </Shell>
    )
  }

  return (
    <Shell>
      <p className="text-xs text-gray-500 dark:text-gray-400">Server-side conversion forwarding — last 50 attempts.</p>

      {stalling.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-3">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            CAPI deliveries stalling — check your {stallingPlatforms.join(', ')} token.
          </p>
        </div>
      )}

      {/* Platform filter chips (client-side) */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PLATFORMS.map(p => (
          <button
            key={p.key}
            onClick={() => setPlatform(p.key)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              platform === p.key
                ? 'bg-st-black text-white dark:bg-white dark:text-st-black'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No deliveries for this platform.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-[#2A2E2E]">
                <th className="py-2 pr-3 font-medium">Platform</th>
                <th className="py-2 pr-3 font-medium">Event ref</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">HTTP</th>
                <th className="py-2 pr-3 font-medium">Attempts</th>
                <th className="py-2 pr-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const hasError = !!r.error_message
                const isOpen = expanded === r.id
                return (
                  <tr key={r.id} className="border-b border-gray-50 dark:border-[#222626] align-top">
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium">
                        {PLATFORM_LABEL[r.platform] || r.platform}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-gray-600 dark:text-gray-400 max-w-[140px] truncate" title={r.event_ref || ''}>
                      {r.event_ref || '—'}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-medium capitalize ${STATUS_STYLE[r.status] || NEUTRAL_STYLE}`}>
                        {r.status}
                      </span>
                      {hasError && (
                        <button
                          onClick={() => setExpanded(isOpen ? null : r.id)}
                          className="ml-2 text-gray-400 hover:text-st-black dark:hover:text-dark-text underline decoration-dotted"
                        >
                          {isOpen ? 'hide' : 'error'}
                        </button>
                      )}
                      {hasError && isOpen && (
                        <p className="mt-1 font-mono text-[11px] text-red-600 dark:text-red-400 break-all whitespace-pre-wrap max-w-[260px]">
                          {r.error_message}
                        </p>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums text-gray-600 dark:text-gray-400">{r.http_status ?? '—'}</td>
                    <td className="py-2 pr-3 tabular-nums text-gray-600 dark:text-gray-400">{r.attempt ?? '—'}</td>
                    <td className="py-2 pr-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{relativeTime(r.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  )
}
