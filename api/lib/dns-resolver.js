import dns from 'dns'
import { inspectClientIp } from './ip-resolver.js'
import { assertWebhookDestinationSafe } from './ssrf-guard.js'

/**
 * Normalizes CNAME target domains by stripping any trailing dots and lowercasing.
 * 
 * @param {string} domain 
 * @returns {string}
 */
export function normalizeDnsName(domain) {
  if (!domain || typeof domain !== 'string') return ''
  return domain.trim().toLowerCase().replace(/\.$/, '')
}

/**
 * Resolves CNAME records for a domain, with environment-controlled testing overrides.
 * 
 * @param {string} domain 
 * @returns {Promise<string[]>} List of resolved CNAMEs
 */
export async function resolveCname(domain) {
  const normalizedDomain = normalizeDnsName(domain)

  // Dev/Test Mock Mode
  if (process.env.ST_MOCK_DNS_RESOLVE === 'true') {
    if (normalizedDomain === 'track.testcustomer.com' || normalizedDomain === 'ssl-fail.testcustomer.com') {
      const target = normalizeDnsName(process.env.ST_MANAGED_PROXY_TARGET || 'proxy.sourcetrack.ai')
      return [target]
    }
    if (normalizedDomain === 'dns-fail.testcustomer.com') {
      const err = new Error('queryCname ENOTFOUND dns-fail.testcustomer.com')
      err.code = 'ENOTFOUND'
      throw err
    }
    // Default mock behavior is to resolve nothing / throw
    const err = new Error('queryCname ENODATA mock-unconfigured')
    err.code = 'ENODATA'
    throw err
  }

  // Production network lookup
  try {
    const records = await dns.promises.resolveCname(domain)
    return records.map(normalizeDnsName)
  } catch (err) {
    // Re-throw standardized DNS errors for fail-closed handling
    throw err
  }
}

/**
 * Verifies that the custom domain terminates SSL and routes requests successfully to the API gateway.
 * Performs a GET request to the pending-safe path: /.well-known/sourcetrack/proxy-health
 * 
 * ⚠️ TWO KNOWN REASONS A 200 HERE MEANS LESS THAN IT LOOKS. Both must be fixed together;
 * fixing either alone leaves a check that still cannot fail. Recorded 2026-08-06, not yet
 * fixed — the fix is a founder ruling, and this note exists so the next reader does not
 * mistake a green verification for a working customer install.
 *
 *   1. THE GATE ANSWERS THIS PATH ITSELF. managedProxyEarlyGate handles
 *      /.well-known/sourcetrack/proxy-health before the status check and returns
 *      {ok:true} without ever reaching the origin's static files. A 200 proves the gate
 *      is up, not that the tracker is served. (Known since #648.)
 *
 *   2. THE RESPONSE IS EDGE-CACHED FOR 30 DAYS. Measured on a live customer domain:
 *      `cache-control: public, max-age=2592000`, `cdn-cache: HIT`, with the cached copy
 *      a day old at the time of measurement. A cache-buster query string does NOT force
 *      a pull (the zone ignores query strings) and a `Cache-Control: no-cache` REQUEST
 *      header does not bypass it either — both still returned HIT. So this check can
 *      return 200 for a month after the origin stops answering.
 *
 *      ⚠️ verifyTrackerDelivery — #648's stronger half — is cached the SAME way:
 *      `max-age=86400, stale-while-revalidate=604800, immutable`, also observed as
 *      `cdn-cache: HIT`. That is up to 8 days of serving a stale success. The stronger
 *      check is not exempt from the weaker check's problem.
 *
 * ⚠️ AND A DESIGN GAP, BROADER THAN EITHER. This function resolves the domain it is GIVEN,
 * which comes from `managed_proxy_domains.domain` — the hostname registered as the CDN's
 * origin. That is not necessarily the hostname a customer's browser contacts. Tenant
 * resolution at the gate uses the `cdn-host` header supplied by the CDN
 * (managed-proxy.js:60-62), so a site can serve live traffic on a hostname that appears in
 * no row, while this job verifies a different hostname and reports healthy.
 *
 * Observed live 2026-08-06: `managed_proxy_domains` held one row (`track2.<domain>`) while
 * the browser-facing hostname was `track.<domain>`. Both served; only one was monitored.
 * So this job checks OUR plumbing rather than the CUSTOMER'S edge, and the table can drift
 * from reality indefinitely with nothing detecting it. Whether the row should record the
 * customer-facing hostname, or whether a second column is needed, is a schema decision and
 * is deliberately NOT made here.
 *
 * @param {string} domain
 * @returns {Promise<boolean>} True if the routing and SSL are fully provisioned and functional
 */
export async function verifySslAndRouting(domain) {
  const normalizedDomain = normalizeDnsName(domain)

  // Dev/Test Mock Mode
  if (process.env.ST_MOCK_DNS_RESOLVE === 'true') {
    if (normalizedDomain === 'track.testcustomer.com') {
      return true
    }
    if (normalizedDomain === 'ssl-fail.testcustomer.com') {
      return false
    }
    return false
  }

  // Production verification check
  try {
    const url = `https://${normalizedDomain}/.well-known/sourcetrack/proxy-health`

    // SSRF guard: the domain is customer-controlled, so validate it (and reject
    // private/loopback/link-local resolutions) before fetching. assertWebhook
    // DestinationSafe accepts a full URL string and resolves the host itself.
    await assertWebhookDestinationSafe(url)

    // Set a strict 5-second timeout to prevent verification hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'SourceTrack-Proxy-Verifier/1.0',
        'Accept': 'application/json'
      },
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)

    if (!res.ok) return false
    
    const body = await res.json()
    return body && body.ok === true && body.service === 'sourcetrack-proxy'
  } catch (err) {
    // Any network connection failure, SSL handshake error, or timeout fails closed
    return false
  }
}
