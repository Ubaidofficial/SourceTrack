import posthog from 'posthog-js'

let initialized = false

export function initPostHog() {
  if (initialized) return

  const apiKey = import.meta.env.VITE_POSTHOG_API_KEY
  if (!apiKey) return

  initialized = true

  const searchParams = new URLSearchParams(window.location.search)
  const debugParam = searchParams.get('__posthog_debug') === 'true'
  const debug = import.meta.env.DEV || debugParam

  const envApiHost = import.meta.env.VITE_POSTHOG_HOST
  const envUiHost = import.meta.env.VITE_POSTHOG_UI_HOST

  const apiHost =
    envApiHost && /^(https?:)?\/\//.test(envApiHost)
      ? envApiHost
      : 'https://us.i.posthog.com'

  const uiHost =
    envUiHost && /^(https?:)?\/\//.test(envUiHost)
      ? envUiHost
      : 'https://us.posthog.com'

  try {
    posthog.init(apiKey, {
      api_host: apiHost,
      ui_host: uiHost,
      defaults: '2026-01-30',
      capture_pageview: 'history_change',
      autocapture: true,
      debug
    })
  } catch (err) {
    console.error('PostHog init failed:', err)
  }
}

export default posthog