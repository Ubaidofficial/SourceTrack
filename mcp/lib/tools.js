import { detectPlatform } from '../../api/lib/platform-detector.js'
import {
  SHOPIFY_STEPS,
  WORDPRESS_STEPS,
  WEBFLOW_STEPS,
  GTM_STEPS,
  HTML_STEPS,
  PLATFORM_GUIDES
} from '../../api/lib/platform-guides.js'

export { SHOPIFY_STEPS, WORDPRESS_STEPS, WEBFLOW_STEPS, GTM_STEPS, HTML_STEPS, PLATFORM_GUIDES }

export async function handleDetectPlatform({ domain, siteKey, apiBaseUrl }) {
  if (!domain) {
    throw new Error('domain argument is required for detect_platform')
  }

  const baseUrl = apiBaseUrl || process.env.SOURCETRACK_API_URL
  if (baseUrl) {
    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/api/install/detect-platform?domain=${encodeURIComponent(domain)}`
      const headers = siteKey ? { 'x-site-key': siteKey } : {}
      const res = await fetch(url, { headers })
      if (res.ok) {
        const json = await res.json()
        return json.data || json
      }
    } catch (_) {}
  }

  return await detectPlatform(domain, siteKey || null)
}

export async function handleGetInstallSnippet({ platform, siteKey, siteId, apiBaseUrl }) {
  const baseUrl = apiBaseUrl || process.env.SOURCETRACK_API_URL || 'https://api.srctk.com'
  let effectiveSiteKey = siteKey || process.env.SOURCETRACK_SITE_KEY || '<YOUR_SITE_KEY>'
  let snippet = `<script async src="${baseUrl.replace(/\/+$/, '')}/tracker.min.js" data-site-key="${effectiveSiteKey}"></script>`

  // Call server route if siteId is provided
  if (siteId) {
    try {
      const url = `${baseUrl.replace(/\/+$/, '')}/api/install/snippet?site_id=${encodeURIComponent(siteId)}`
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        if (json?.data?.snippet) {
          snippet = json.data.snippet
        }
        if (json?.data?.site_key) {
          effectiveSiteKey = json.data.site_key
        }
      }
    } catch (_) {}
  }

  const selectedPlatform = (platform || 'html').toLowerCase()
  const guide = PLATFORM_GUIDES[selectedPlatform] || PLATFORM_GUIDES.html

  return {
    platform: selectedPlatform in PLATFORM_GUIDES ? selectedPlatform : 'html',
    site_key: effectiveSiteKey,
    snippet,
    ...(guide.doc_url ? { doc_url: guide.doc_url } : {}),
    steps: guide.steps
  }
}

export async function handleVerifyInstallation({ siteKey, apiBaseUrl }) {
  const effectiveSiteKey = siteKey || process.env.SOURCETRACK_SITE_KEY
  if (!effectiveSiteKey) {
    return {
      verified: false,
      status: 'error',
      error: 'MISSING_SITE_KEY',
      message: 'site_key is required (pass site_key argument or set SOURCETRACK_SITE_KEY environment variable)'
    }
  }

  const baseUrl = apiBaseUrl || process.env.SOURCETRACK_API_URL || 'https://api.srctk.com'
  const url = `${baseUrl.replace(/\/+$/, '')}/api/install/status`

  try {
    const res = await fetch(url, {
      headers: { 'x-site-key': effectiveSiteKey }
    })
    if (res.ok) {
      const json = await res.json()
      return json.data || json
    }
    return {
      verified: false,
      status: 'check_failed',
      error: 'HTTP_ERROR_' + res.status,
      message: `Verification API returned HTTP status ${res.status}`
    }
  } catch (err) {
    return {
      verified: false,
      status: 'check_failed',
      error: 'FETCH_FAILED',
      message: `Failed to connect to verification API (${err?.message || 'network error'})`
    }
  }
}
