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

export async function handleVerifyInstallation({ siteKey, authToken, apiBaseUrl }) {
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

  const headers = { 'x-site-key': effectiveSiteKey }
  const effectiveToken = authToken || process.env.SOURCETRACK_AUTH_TOKEN
  if (effectiveToken) {
    headers['Authorization'] = `Bearer ${effectiveToken}`
  }

  try {
    const res = await fetch(url, { headers })
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

// ─────────────────────────────────────────────────────────────────────────────────────
// MCP v1 diagnostic tools (roadmap §1.5)
//
// TWO AUTH MODELS LIVE IN THIS SERVER AND THEY DO NOT SHARE A CREDENTIAL SLOT.
//
//   AUTH_USER_JWT — verify_installation. A Supabase user session JWT, taken from the
//                   `auth_token` argument or SOURCETRACK_AUTH_TOKEN. Resolves to a PERSON,
//                   who may belong to many sites, so the tool also takes a site_key and the
//                   API checks membership.
//   AUTH_API_KEY  — every tool below. A SourceTrack API key (st_live_…), taken from the
//                   `api_key` argument or SOURCETRACK_API_KEY, and NEVER from auth_token /
//                   SOURCETRACK_AUTH_TOKEN. Resolves to exactly ONE site_id, which is why
//                   none of these tools accepts a site_id/site_key argument at all —
//                   the key is the tenant.
//
// The separation is structural, not a heuristic: distinct argument names, distinct env
// vars, and (server-side) distinct routes — /api/diagnostics/* accepts API keys only while
// /api/analytics/* accepts user JWTs only. Nothing anywhere inspects a bearer token to
// guess which verifier to use, and there is NO cross-fallback: a tool declaring
// AUTH_API_KEY with no API key present fails before it opens a socket rather than
// quietly reaching for the JWT.
export const AUTH_NONE = 'none'
export const AUTH_USER_JWT = 'user_jwt'
export const AUTH_API_KEY = 'api_key'

// Shared caller for the five diagnostic reads.
async function callDiagnostic(path, { apiKey, apiBaseUrl, query = {} } = {}) {
  const effectiveKey = apiKey || process.env.SOURCETRACK_API_KEY
  if (!effectiveKey) {
    // Fail closed BEFORE any request. Deliberately does not fall back to
    // SOURCETRACK_AUTH_TOKEN — sending a user JWT to a key-authed route would produce a
    // confusing 401 from the wrong subsystem and blur the two auth models.
    return {
      ok: false,
      error: 'MISSING_API_KEY',
      message: 'api_key is required (pass the api_key argument or set SOURCETRACK_API_KEY). A user auth_token will not work here: diagnostic tools authenticate with a SourceTrack API key holding the read:analytics scope.'
    }
  }

  const baseUrl = (apiBaseUrl || process.env.SOURCETRACK_API_URL || 'https://api.srctk.com').replace(/\/+$/, '')
  const qs = new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
  ).toString()
  const url = `${baseUrl}/api/diagnostics/${path}${qs ? `?${qs}` : ''}`

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${effectiveKey}` } })
    const json = await res.json().catch(() => null)

    if (res.ok) return { ok: true, data: json?.data ?? json }

    // Each of these means something different to an agent, so none of them collapses into
    // a generic failure — and none of them is ever reported as "no data".
    const byStatus = {
      401: 'INVALID_API_KEY',
      403: 'MISSING_SCOPE',
      402: 'PLAN_GATED',
      503: 'READ_STORE_UNAVAILABLE'
    }
    return {
      ok: false,
      error: byStatus[res.status] || `HTTP_ERROR_${res.status}`,
      message: json?.error || `Diagnostics API returned HTTP ${res.status}`
    }
  } catch (err) {
    return {
      ok: false,
      error: 'FETCH_FAILED',
      message: `Failed to reach the diagnostics API (${err?.message || 'network error'})`
    }
  }
}

export function handleGetWorkspaceContext({ apiKey, apiBaseUrl }) {
  return callDiagnostic('workspace-context', { apiKey, apiBaseUrl })
}

export function handleGetSiteHealth({ apiKey, apiBaseUrl }) {
  return callDiagnostic('site-health', { apiKey, apiBaseUrl })
}

export function handleGetDataQuality({ apiKey, apiBaseUrl }) {
  return callDiagnostic('data-quality', { apiKey, apiBaseUrl })
}

export function handleDebugDataFlow({ apiKey, apiBaseUrl, days }) {
  return callDiagnostic('data-flow', { apiKey, apiBaseUrl, query: { days } })
}

export function handleVerifyEvents({ apiKey, apiBaseUrl }) {
  return callDiagnostic('verify-events', { apiKey, apiBaseUrl })
}
