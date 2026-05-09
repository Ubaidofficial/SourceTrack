import posthog from 'posthog-js'

let initialized = false

export function initPostHog() {
  if (initialized) return
  initialized = true

  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY
  if (!apiKey) return

  const searchParams = new URLSearchParams(window.location.search)
  const debugParam = searchParams.get('__posthog_debug') === 'true'
  const debug = import.meta.env.DEV || debugParam

  const host = import.meta.env.VITE_POSTHOG_HOST
  const apiHost = import.meta.env.DEV
    ? window.location.origin
    : (host && (host.startsWith('http://') || host.startsWith('https://')))
      ? host
      : window.location.origin

  try {
    posthog.init(apiKey, {
      api_host: apiHost,
      defaults: '2026-01-30',
      capture_pageview: 'history_change',
      autocapture: true,
      debug
    })
  } catch (_err) {
    console.error(_err)
  }
}

export default posthog
