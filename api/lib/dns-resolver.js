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
    return body && body.status === 'ok' && body.service === 'sourcetrack-managed-proxy'
  } catch (err) {
    // Any network connection failure, SSL handshake error, or timeout fails closed
    return false
  }
}
