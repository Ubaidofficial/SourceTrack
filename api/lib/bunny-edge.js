// Thin server-side client for BunnyCDN's pull-zone edge, used to make the
// managed custom-tracking-domain flow self-serve:
//   • addPullZoneHostname()    — register a customer hostname on the pull zone
//   • loadFreeCertificate()    — issue the free Let's Encrypt cert for it
//   • removePullZoneHostname() — best-effort teardown on domain delete
//
// Endpoints (verified against Bunny's live API reference, 2026):
//   POST   https://api.bunny.net/pullzone/{id}/addHostname     body {"Hostname"} → 204
//   GET    https://api.bunny.net/pullzone/loadFreeCertificate?hostname=<host>    → 200/201
//   DELETE https://api.bunny.net/pullzone/{id}/removeHostname  body {"Hostname"} → 204
//   Auth: `AccessKey: <BUNNY_API_KEY>` header on every request.
//   Ordering constraint: the hostname MUST already exist on the pull zone before
//   loadFreeCertificate — otherwise Bunny returns 404 (hostname_not_found).
//
// Security & safety invariants (CLAUDE.md §0, §6.5):
//   • BUNNY_API_KEY is account-scoped. SERVER-SIDE ONLY. It is sent only in the
//     AccessKey request header — never logged, never returned to a caller/client.
//   • Fail-CLOSED: when the key / zone id is not configured, the feature is
//     disabled (returns { disabled:true }) rather than crashing or half-working.
//   • Fail-SAFE: never throws to the caller; all errors resolve to a result
//     object so the proxy-domain flow degrades gracefully.
//   • No SSRF surface here: requests target the trusted api.bunny.net host only;
//     the customer hostname travels as an opaque string (header/body/query), we
//     never fetch the customer domain from this module.

import { normalizeDnsName } from './dns-resolver.js'

const BUNNY_API_BASE = 'https://api.bunny.net'
const REQUEST_TIMEOUT_MS = 8000

function getConfig() {
  return {
    apiKey: process.env.BUNNY_API_KEY || '',
    pullZoneId: process.env.BUNNY_PULL_ZONE_ID || ''
  }
}

// True only when both the account key and the target pull zone id are present.
export function isBunnyConfigured() {
  const { apiKey, pullZoneId } = getConfig()
  return Boolean(apiKey && pullZoneId)
}

// Mock/test path — mirrors dns-resolver.js so unit + E2E suites never touch the
// network. All real Bunny calls are additionally gated in the routes.
function inMockMode() {
  return process.env.ST_MOCK_DNS_RESOLVE === 'true'
}

// Single place the AccessKey header is attached. Returns only { ok, status } —
// the response body (and the key) never leave this function.
async function bunnyRequest(method, path, { query, body } = {}) {
  const { apiKey } = getConfig()
  const url = new URL(BUNNY_API_BASE + path)
  if (query) {
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), {
      method,
      headers: {
        AccessKey: apiKey,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })
    return { ok: res.ok, status: res.status }
  } finally {
    clearTimeout(timeoutId)
  }
}

// Shared guard: mock short-circuit → fail-closed config check → hostname
// validation → fail-safe try/catch. `label` is a coarse operation name used in
// logs; the API key is never included in any log line.
async function guarded(label, hostname, fn) {
  if (inMockMode()) return { ok: true, skipped: 'mock' }
  if (!isBunnyConfigured()) {
    return {
      ok: false,
      disabled: true,
      status: null,
      error: 'Bunny edge automation disabled (BUNNY_API_KEY / BUNNY_PULL_ZONE_ID not set)'
    }
  }
  const host = normalizeDnsName(hostname)
  if (!host) return { ok: false, status: null, error: 'Invalid hostname' }
  try {
    return await fn(host)
  } catch (err) {
    // err is a network/abort error (never carries the key, which lives only in
    // the request header). Log a coarse label + message, nothing else.
    console.warn(`[bunny-edge] ${label} error: ${err?.message || 'unknown'}`)
    return { ok: false, status: null, error: 'Bunny request failed' }
  }
}

// Register a customer hostname on the pull zone. Idempotent from the caller's
// perspective — safe to call again on an already-added hostname (Bunny returns
// a non-2xx we surface as { ok:false } for the caller to treat as non-fatal).
export async function addPullZoneHostname(hostname) {
  return guarded('addHostname', hostname, async (host) => {
    const { pullZoneId } = getConfig()
    const { ok, status } = await bunnyRequest(
      'POST',
      `/pullzone/${encodeURIComponent(pullZoneId)}/addHostname`,
      { body: { Hostname: host } }
    )
    if (!ok) console.warn(`[bunny-edge] addHostname non-2xx (status=${status})`)
    return { ok, status }
  })
}

// Issue the free Let's Encrypt certificate for a hostname already on the zone.
// Bunny provisions ASYNCHRONOUSLY — a 2xx here means "issuance started", not
// "cert live". The route keeps the real HTTPS self-check as the activation gate.
export async function loadFreeCertificate(hostname) {
  return guarded('loadFreeCertificate', hostname, async (host) => {
    const { ok, status } = await bunnyRequest(
      'GET',
      '/pullzone/loadFreeCertificate',
      { query: { hostname: host } }
    )
    if (!ok) console.warn(`[bunny-edge] loadFreeCertificate not ready (status=${status})`)
    return { ok, status }
  })
}

// Best-effort teardown so a released hostname can be re-added later.
export async function removePullZoneHostname(hostname) {
  return guarded('removeHostname', hostname, async (host) => {
    const { pullZoneId } = getConfig()
    const { ok, status } = await bunnyRequest(
      'DELETE',
      `/pullzone/${encodeURIComponent(pullZoneId)}/removeHostname`,
      { body: { Hostname: host } }
    )
    if (!ok) console.warn(`[bunny-edge] removeHostname non-2xx (status=${status})`)
    return { ok, status }
  })
}
