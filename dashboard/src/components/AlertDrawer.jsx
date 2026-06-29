import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Bell, TrendingUp, EyeOff, Activity } from 'lucide-react'
import { fetchApi } from '../lib/api'

// Icon per anomaly type. Unknown types fall back to a generic bell.
const TYPE_ICON = {
  direct_spike: TrendingUp,
  source_silent: EyeOff,
  coverage_drop: Activity
}

function relativeTime(value) {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function AlertDrawer({ isOpen, onClose, siteKey, alerts = [] }) {
  const queryClient = useQueryClient()
  const [dismissingId, setDismissingId] = useState(null)

  if (!isOpen) return null

  async function handleDismiss(id) {
    if (!siteKey) return
    setDismissingId(id)
    try {
      await fetchApi(`/site-alerts/${id}/dismiss?site_key=${encodeURIComponent(siteKey)}`, { method: 'POST' })
      queryClient.invalidateQueries({ queryKey: ['site-alerts', siteKey] })
    } catch (_err) {
      console.error('Failed to dismiss alert', _err)
    } finally {
      setDismissingId(null)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} aria-hidden="true" />

      {/* Right-side slide-in */}
      <div className="fixed top-0 right-0 h-full w-full max-w-sm bg-white dark:bg-dark-card border-l border-gray-200 dark:border-dark-border shadow-xl z-50 flex flex-col">
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-200 dark:border-dark-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-st-black dark:text-dark-primary" />
            <h2 className="text-sm font-semibold text-st-black dark:text-dark-primary">Alerts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
            aria-label="Close alerts"
          >
            <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {alerts.length === 0 ? (
            <p className="text-sm text-st-gray dark:text-gray-400 text-center py-12">
              No alerts — everything looks healthy.
            </p>
          ) : (
            alerts.map((alert) => {
              const Icon = TYPE_ICON[alert.type] || Bell
              return (
                <div
                  key={alert.id}
                  className="rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/50 dark:bg-dark-hover/30 p-3 space-y-2"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 flex-shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-st-black dark:text-gray-200 leading-relaxed">{alert.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{relativeTime(alert.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      disabled={dismissingId === alert.id}
                      className="text-[11px] font-medium text-st-gray dark:text-gray-400 hover:text-st-black dark:hover:text-dark-text px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors disabled:opacity-50"
                    >
                      {dismissingId === alert.id ? 'Dismissing…' : 'Dismiss'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
