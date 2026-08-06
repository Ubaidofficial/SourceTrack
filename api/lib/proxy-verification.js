// Managed-proxy delivery verification — the single source of truth for "is this
// customer's tracking domain actually working?", shared by the manual verify route
// (api/routes/integrations.js) and the scheduled re-check job
// (api/jobs/proxy-domain-recheck.js). One function, two callers, so the two can
// never drift into disagreeing about what "active" means.
//
// ── WHY THE HEALTH CHECK ALONE WAS NOT ENOUGH ────────────────────────────────
// verifySslAndRouting() GETs /.well-known/sourcetrack/proxy-health and asserts the
// JSON body. That is a real check — TLS, DNS, Host binding and the gate all have to
// work for it to pass — but managedProxyEarlyGate answers that path itself, BEFORE
// the status check and without ever reaching the origin's static files. So it proves
// the gate is reachable; it does not prove the tracker is served.
//
// That gap is not hypothetical. On 2026-08-06 one live hostname returned a healthy
// 200 for tracker.min.js (a CDN-cached object) while the health endpoint returned an
// HTML error page, and a sibling hostname did the exact opposite. Either check alone
// would have called one of them healthy.
//
// So delivery verification is BOTH:
//   1. the health GET  — gate + TLS + host binding
//   2. a tracker GET   — the file a customer's browser will actually request
//
// ── WHY LENGTH IS NOT AN ASSERTION ───────────────────────────────────────────
// A cached error page is a 200 with a body. `size > 0` and even `size > 10_000`
// would both have passed the HTML error page seen above. The body must be shown to
// be JavaScript: content-type, plus a leading-bytes match against how the built
// tracker actually starts. Both are required — content-type alone is trivially wrong
// on a misconfigured CDN, and bytes alone would accept JS served as text/html.

import { normalizeDnsName, verifySslAndRouting } from './dns-resolver.js'
import { assertWebhookDestinationSafe } from './ssrf-guard.js'

const FETCH_TIMEOUT_MS = 8000

// The built tracker is an IIFE. Both bundles start with one of these forms; the
// esbuild arrow form `(()=>{` is what ships today, the others are kept so a bundler
// or minifier change does not read as an outage.
//
// Deliberately NOT a substring search for "sourcetrack" or a site key: the cookieless
// build must remain byte-identical for every customer, and matching on tenant data
// here would be a §6.5 mistake as well as a fragile assertion.
const JS_LEADING_PATTERNS = [
  /^\(\(\)\s*=>\s*\{/,       // esbuild arrow IIFE  — `(()=>{`
  /^\(function\s*\(/,         // classic IIFE        — `(function(`
  /^!function\s*\(/,          // minified bang-IIFE  — `!function(`
  /^["']use strict["']/,      // directive prologue
  /^\/\*/,                    // banner comment
  /^var\s|^const\s|^let\s/    // unminified dev build
]

function looksLikeJavaScript (body) {
  const head = String(body || '').trimStart().slice(0, 200)
  if (!head) return false
  return JS_LEADING_PATTERNS.some(re => re.test(head))
}

function isJavaScriptContentType (ct) {
  return /(^|[/+])(java|ecma)script/i.test(String(ct || ''))
}

/**
 * GET https://<domain>/<tracker file> and assert it is really the tracker.
 *
 * Returns { ok, code, message, httpStatus, contentType }. Never throws — a verifier
 * that throws on a customer's broken DNS would take the whole sweep down with it.
 *
 * ⚠️ KNOWN LIMIT — THIS CHECK CAN BE UP TO ~8 DAYS STALE, AND THAT IS ACCEPTED.
 * Ruled 2026-08-06. Read this before trusting a pass, and before "fixing" it.
 *
 * tracker.min.js is served through Bunny with (measured on a live customer domain):
 *
 *     cache-control: public, max-age=86400, stale-while-revalidate=604800, immutable
 *     cdn-cache: HIT
 *
 * That is 1 day fresh + 7 days stale-while-revalidate = up to 8 days during which the
 * edge can answer without the origin. THE CLIENT CANNOT FORCE FRESHNESS: a cache-buster
 * query string still returned HIT (the zone ignores query strings), and a
 * `Cache-Control: no-cache` REQUEST header did not bypass it either. Both measured, not
 * assumed.
 *
 * WHY IT IS NOT FIXED. That caching is CORRECT for a static asset — degrading a
 * customer-facing tracker cache to serve a monitor is the wrong trade, and a Bunny-side
 * cache-bypass rule would add a founder-gated console dependency. So the staleness is
 * accepted and documented here instead. The sibling proxy-health check IS made
 * uncacheable (no-store at the origin, api/index.js) because nothing depends on caching
 * it — the two paths differ deliberately.
 *
 * ⚠️ AND IT DEFEATS THE TWO-STRIKE DEMOTION. This is the consequence worth knowing:
 * nextProxyState() demotes only after TWO consecutive failures, which assumes two checks
 * see two INDEPENDENT responses. They may not. proxy-domain-recheck's cadence for an
 * active domain is DUE_AFTER_MS.active = 24h, and the cache window is up to 8 days — so
 * consecutive strikes can both read the SAME cached success. If the origin dies, the edge
 * keeps answering, no strike is ever recorded, and the domain stays `active`.
 *
 * For two strikes to mean two observations the interval would have to EXCEED the whole
 * cache window (>8 days), making demotion take >16 days. That is worse than the problem,
 * so the interval is NOT the fix and was not changed.
 *
 * WHAT ACTUALLY HAPPENS: detection is DELAYED, not prevented. Once the
 * stale-while-revalidate window expires the edge must reach the origin, the check then
 * fails, and the strikes proceed normally — so worst case is roughly 8 days of cache plus
 * 2 days of strikes ≈ 10 days to demote. `status` therefore means "was serving within
 * about the last 10 days", NOT "is serving now". Setup.jsx:77 keys the install snippet
 * off `status === 'active'`, so that window is the real exposure.
 *
 * ⚠️ ONE PART OF THIS IS DERIVED, NOT MEASURED: the max-age portion was observed
 * directly (a fresh HIT ~20h after cdn-cachedat). Bunny's exact stale-while-revalidate
 * behaviour was NOT observed — the 7-day extension is read from the declared header
 * semantics. If it matters to a decision, measure it rather than inheriting this line.
 *
 * @param {string} domain          customer hostname (no scheme)
 * @param {boolean} cookielessMode pick the cookieless bundle, matching Setup.jsx:134
 */
export async function verifyTrackerDelivery (domain, cookielessMode = false) {
  const host = normalizeDnsName(domain)
  const file = cookielessMode ? 'tracker.cookieless.min.js' : 'tracker.min.js'
  const url = `https://${host}/${file}`

  if (process.env.ST_MOCK_DNS_RESOLVE === 'true') {
    if (host === 'track.testcustomer.com') return { ok: true, code: null, message: null, httpStatus: 200, contentType: 'application/javascript' }
    return { ok: false, code: 'TRACKER_NOT_SERVED', message: `Mock: ${host} does not serve ${file}`, httpStatus: null, contentType: null }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    // The hostname is customer-controlled, so the same SSRF guard the health check
    // uses applies here — reject private/loopback/link-local resolutions before fetch.
    await assertWebhookDestinationSafe(url)

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': 'SourceTrack-Proxy-Verifier/1.0', Accept: '*/*' },
      signal: controller.signal
    })

    const contentType = res.headers.get('content-type')
    if (!res.ok) {
      return { ok: false, code: 'TRACKER_HTTP_ERROR', message: `${file} returned HTTP ${res.status}.`, httpStatus: res.status, contentType }
    }

    const body = await res.text()

    if (!isJavaScriptContentType(contentType)) {
      return {
        ok: false,
        code: 'TRACKER_NOT_JAVASCRIPT',
        message: `${file} returned HTTP 200 but content-type was "${contentType || 'none'}" — the host is serving something other than the tracker (a cached error page returns 200 too).`,
        httpStatus: res.status,
        contentType
      }
    }
    if (!looksLikeJavaScript(body)) {
      return {
        ok: false,
        code: 'TRACKER_BODY_NOT_JS',
        message: `${file} returned HTTP 200 with a JavaScript content-type, but the body does not begin like the built tracker.`,
        httpStatus: res.status,
        contentType
      }
    }

    return { ok: true, code: null, message: null, httpStatus: res.status, contentType }
  } catch (err) {
    // Fails closed, matching verifySslAndRouting. Includes SSRF rejections, TLS
    // handshake failures, DNS failures and the timeout.
    return { ok: false, code: 'TRACKER_UNREACHABLE', message: `Could not fetch ${file}: ${err?.name === 'AbortError' ? `timed out after ${FETCH_TIMEOUT_MS}ms` : (err?.message || 'network error')}`, httpStatus: null, contentType: null }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Full delivery verification: gate health AND tracker delivery. Both must pass.
 *
 * Health runs first because it is the cheaper, more diagnostic failure — if the gate
 * is unreachable, the tracker result adds nothing and would only produce a second,
 * noisier error for the same root cause.
 *
 * @returns {{ok: boolean, code: string|null, message: string|null, stage: 'health'|'tracker'|null}}
 */
export async function verifyProxyDelivery (domain, cookielessMode = false) {
  const healthy = await verifySslAndRouting(domain)
  if (!healthy) {
    return {
      ok: false,
      stage: 'health',
      code: 'SSL_ROUTING_PENDING',
      message: 'DNS resolves, but the proxy health endpoint did not answer over HTTPS. If the domain was just added, certificate issuance can take 10-30 minutes.'
    }
  }

  const tracker = await verifyTrackerDelivery(domain, cookielessMode)
  if (!tracker.ok) {
    return { ok: false, stage: 'tracker', code: tracker.code, message: tracker.message }
  }

  return { ok: true, stage: null, code: null, message: null }
}

// ── Two-strike demotion ──────────────────────────────────────────────────────
// An `active` domain is NOT demoted on a single failure. One CDN blip, one DNS
// hiccup or one 5s timeout would otherwise disable a working customer's tracking —
// and because the snippet reads `status === 'active'` (Setup.jsx:77), demotion
// silently changes the script tag a customer is told to install.
//
// No DDL was permitted for this work and there is no strike column, so the count is
// carried in `error_code`, which is already nullable text and already cleared on
// success. Encoded as a suffix so the underlying reason survives the round trip.
// If a strike column is ever added, replace this — it is a workaround, not a design.
const STRIKE_RE = /^(.*)_STRIKE_(\d+)$/

export function readStrike (errorCode) {
  const m = STRIKE_RE.exec(String(errorCode || ''))
  return m ? { code: m[1], count: Number(m[2]) } : { code: errorCode || null, count: 0 }
}

export function encodeStrike (code, count) {
  return `${code || 'DELIVERY_FAILED'}_STRIKE_${count}`
}

/**
 * Decide the next persisted state for a domain after one verification result.
 * Pure — no I/O, no clock — so the demotion rule is testable in isolation.
 *
 * @param {string} currentStatus  status now
 * @param {string|null} currentErrorCode  error_code now (may carry a strike suffix)
 * @param {{ok:boolean, code:string|null, message:string|null}} result
 * @returns {{status:string, error_code:string|null, error_message:string|null, demoted:boolean}}
 */
export function nextProxyState (currentStatus, currentErrorCode, result) {
  if (result.ok) {
    return { status: 'active', error_code: null, error_message: null, demoted: false }
  }

  const prior = readStrike(currentErrorCode)

  if (currentStatus === 'active') {
    const count = prior.count + 1
    if (count < 2) {
      // First failure: hold `active`, record the strike. The customer's tracking keeps
      // working through a transient blip, and the UI still shows a stale-age warning
      // because last_checked_at is written regardless.
      return {
        status: 'active',
        error_code: encodeStrike(result.code, count),
        error_message: `${result.message} (first failure — will demote if the next check also fails)`,
        demoted: false
      }
    }
    return { status: 'error', error_code: result.code, error_message: result.message, demoted: true }
  }

  // Not active yet: no grace period to give. pending_ssl_or_routing is the honest
  // state while a certificate is still being issued; anything else is an error.
  return {
    status: result.stage === 'health' ? 'pending_ssl_or_routing' : 'error',
    error_code: result.code,
    error_message: result.message,
    demoted: false
  }
}
