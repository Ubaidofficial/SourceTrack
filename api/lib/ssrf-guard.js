import net from 'net'
import dns from 'dns/promises'
import http from 'node:http'
import https from 'node:https'

// Outbound-webhook SSRF guard.
//
// Security checks run UNCONDITIONALLY in every environment. Private/loopback/
// link-local destinations and plain-http are allowed ONLY when the operator
// explicitly opts in via WEBHOOK_ALLOW_PRIVATE=true (for local testing) — the
// allowance is NEVER inferred from NODE_ENV.
//
// CREATE-time validation (validateWebhookUrl) classifies literal addresses, but
// cannot stop DNS rebinding (a public hostname that resolves to an internal IP).
// assertWebhookDestinationSafe() closes that gap at delivery time by resolving
// the hostname and rejecting if any resolved IP falls in a blocked range.

export function privateDestinationsAllowed() {
  return process.env.WEBHOOK_ALLOW_PRIVATE === 'true'
}

// --- IP classification -------------------------------------------------------

function isBlockedIPv4(ip) {
  const parts = ip.split('.')
  if (parts.length !== 4) return true
  const octets = parts.map(p => Number(p))
  if (octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = octets
  if (a === 0) return true                            // 0.0.0.0/8 (incl. 0.0.0.0)
  if (a === 127) return true                          // 127.0.0.0/8 loopback
  if (a === 10) return true                           // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true    // 172.16.0.0/12
  if (a === 192 && b === 168) return true             // 192.168.0.0/16
  if (a === 169 && b === 254) return true             // 169.254.0.0/16 (incl. 169.254.169.254)
  return false
}

// Expand an IPv6 string (with :: compression and/or an embedded IPv4 tail) into
// its 8 16-bit words. Returns null when the input cannot be parsed.
function ipv6ToWords(ipRaw) {
  let ip = ipRaw.toLowerCase()

  // Convert a trailing embedded IPv4 (e.g. ::ffff:1.2.3.4) into two hextets.
  const v4 = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (v4) {
    const q = v4[1].split('.').map(Number)
    if (q.length !== 4 || q.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return null
    const hi = ((q[0] << 8) | q[1]).toString(16)
    const lo = ((q[2] << 8) | q[3]).toString(16)
    ip = ip.slice(0, v4.index) + hi + ':' + lo
  }

  const halves = ip.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : []

  let words
  if (halves.length === 1) {
    words = head
  } else {
    const missing = 8 - (head.length + tail.length)
    if (missing < 0) return null
    words = [...head, ...Array(missing).fill('0'), ...tail]
  }
  if (words.length !== 8) return null

  const out = words.map(h => (h === '' ? 0 : parseInt(h, 16)))
  if (out.some(n => Number.isNaN(n) || n < 0 || n > 0xffff)) return null
  return out
}

function isBlockedIPv6(ip) {
  const w = ipv6ToWords(ip)
  if (!w) return true                                              // unparseable → fail closed
  if (w.every(x => x === 0)) return true                           // :: unspecified
  if (w.slice(0, 7).every(x => x === 0) && w[7] === 1) return true // ::1 loopback
  // IPv4-mapped ::ffff:a.b.c.d — validate the embedded v4.
  if (w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0xffff) {
    const a = (w[6] >> 8) & 0xff, b = w[6] & 0xff, c = (w[7] >> 8) & 0xff, d = w[7] & 0xff
    return isBlockedIPv4(`${a}.${b}.${c}.${d}`)
  }
  if (((w[0] >> 8) & 0xfe) === 0xfc) return true   // fc00::/7 unique-local
  if ((w[0] & 0xffc0) === 0xfe80) return true      // fe80::/10 link-local
  return false
}

// Classify a literal IP string. Non-IP input fails closed (returns true).
export function isBlockedIp(ip) {
  const kind = net.isIP(ip)
  if (kind === 4) return isBlockedIPv4(ip)
  if (kind === 6) return isBlockedIPv6(ip)
  return true
}

// Hostname-string blocks that don't require DNS resolution.
function isBlockedHostnameLiteral(host) {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  )
}

// --- URL validation (CREATE time) -------------------------------------------

export function validateWebhookUrl(urlStr) {
  let parsed
  try {
    parsed = new URL(urlStr)
  } catch {
    return { valid: false, error: 'Invalid or malformed URL' }
  }

  const allowPrivate = privateDestinationsAllowed()

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, error: 'URL must use HTTP or HTTPS protocol' }
  }
  // HTTPS is required always, unless the explicit dev opt-in is set.
  if (parsed.protocol !== 'https:' && !allowPrivate) {
    return { valid: false, error: 'URL must use HTTPS protocol' }
  }

  // The WHATWG URL parser normalizes non-standard IPv4 encodings (decimal,
  // hex, octal, 127.1) to dotted-quad for http/https, and brackets IPv6 hosts.
  let host = parsed.hostname.toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)

  if (!allowPrivate) {
    if (isBlockedHostnameLiteral(host)) {
      return { valid: false, error: 'Private or local addresses are not allowed' }
    }
    if (net.isIP(host) && isBlockedIp(host)) {
      return { valid: false, error: 'Private or local addresses are not allowed' }
    }
  }

  return { valid: true, hostname: host }
}

// --- Delivery-time guard -----------------------------------------------------

// Re-validate the destination immediately before an outbound send and, for
// hostnames (not literal IPs), resolve every A/AAAA record and reject if any
// maps to a blocked range. Throws an Error (with .code) on rejection so callers
// can fail closed. When WEBHOOK_ALLOW_PRIVATE=true, DNS pinning is skipped.
export async function assertWebhookDestinationSafe(urlStr) {
  const check = validateWebhookUrl(urlStr)
  if (!check.valid) {
    const err = new Error(check.error)
    err.code = 'WEBHOOK_URL_BLOCKED'
    throw err
  }

  if (privateDestinationsAllowed()) return check

  const host = check.hostname
  // Literal IPs were already vetted by validateWebhookUrl.
  if (net.isIP(host)) return check

  let addresses
  try {
    addresses = await dns.lookup(host, { all: true })
  } catch {
    const err = new Error('Webhook host could not be resolved')
    err.code = 'WEBHOOK_DNS_ERROR'
    throw err
  }
  if (!addresses.length) {
    const err = new Error('Webhook host could not be resolved')
    err.code = 'WEBHOOK_DNS_ERROR'
    throw err
  }
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      const err = new Error('Webhook host resolves to a private or local address')
      err.code = 'WEBHOOK_URL_BLOCKED'
      throw err
    }
  }
  return check
}

// True when an outbound response is a redirect that must be rejected. With
// fetch redirect:'manual', a redirect surfaces as an opaque-redirect response
// (type 'opaqueredirect', status 0); some runtimes expose the raw 3xx instead.
export function isRedirectResponse(res) {
  return res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)
}

// TOCTOU-safe outbound POST for webhook delivery.
//
// The previous flow validated the destination (DNS lookup) and then let fetch
// resolve DNS a SECOND time — a DNS-rebinding window between check and connect.
// safeWebhookPost resolves once, validates every resolved IP, and PINS the
// connection to a validated IP via a custom Agent `lookup`, so the socket
// connects to the exact IP that was checked. SNI, the TLS certificate, and the
// Host header all still use the original hostname (correct TLS) — only the
// address the socket dials is pinned. (undici's `connect` would do the same;
// it isn't in the dependency tree, so we use Node's built-in http/https Agent.)
//
// The SSRF check logic is unchanged — this reuses validateWebhookUrl + isBlockedIp.
// Redirects are never followed by http(s).request, so a 3xx is reported and
// rejected. Returns { statusCode, success, errorMessage } (never throws on a
// network error; throws only when the destination is blocked/unresolvable).
export async function safeWebhookPost(urlStr, { headers = {}, body = '', timeoutMs = 5000 } = {}) {
  const check = validateWebhookUrl(urlStr)
  if (!check.valid) {
    const err = new Error(check.error)
    err.code = 'WEBHOOK_URL_BLOCKED'
    throw err
  }

  const parsed = new URL(urlStr)
  const lib = parsed.protocol === 'https:' ? https : http

  // Resolve once and pick the validated IP to pin (skipped under the dev opt-in).
  let pinnedIp = null
  let pinnedFamily = 0
  if (!privateDestinationsAllowed()) {
    const host = check.hostname
    if (net.isIP(host)) {
      pinnedIp = host
      pinnedFamily = net.isIP(host)
    } else {
      let addresses
      try {
        addresses = await dns.lookup(host, { all: true })
      } catch {
        const err = new Error('Webhook host could not be resolved')
        err.code = 'WEBHOOK_DNS_ERROR'
        throw err
      }
      if (!addresses.length) {
        const err = new Error('Webhook host could not be resolved')
        err.code = 'WEBHOOK_DNS_ERROR'
        throw err
      }
      for (const { address } of addresses) {
        if (isBlockedIp(address)) {
          const err = new Error('Webhook host resolves to a private or local address')
          err.code = 'WEBHOOK_URL_BLOCKED'
          throw err
        }
      }
      pinnedIp = addresses[0].address
      pinnedFamily = addresses[0].family || net.isIP(addresses[0].address)
    }
  }

  const agentOpts = {}
  if (pinnedIp) {
    // Pin DNS resolution for this connection to the already-validated IP.
    agentOpts.lookup = (_hostname, _opts, cb) => cb(null, pinnedIp, pinnedFamily)
  }
  const agent = new lib.Agent(agentOpts)

  return await new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      try { agent.destroy() } catch { /* noop */ }
      resolve(result)
    }

    const req = lib.request(urlStr, { method: 'POST', headers, agent }, (res) => {
      const status = res.statusCode || 0
      res.resume() // drain; we never store the response body
      if (status >= 300 && status < 400) {
        finish({ statusCode: status, success: false, errorMessage: 'Webhook endpoint returned a redirect, which is not allowed' })
      } else {
        const ok = status >= 200 && status < 300
        finish({ statusCode: status, success: ok, errorMessage: ok ? null : `HTTP error ${status}` })
      }
    })

    req.setTimeout(timeoutMs, () => {
      req.destroy()
      finish({ statusCode: null, success: false, errorMessage: `Webhook timed out after ${timeoutMs}ms` })
    })
    req.on('error', (err) => {
      finish({ statusCode: null, success: false, errorMessage: err.message })
    })

    if (body) req.write(body)
    req.end()
  })
}
