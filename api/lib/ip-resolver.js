/**
 * Central Client IP Resolver
 *
 * REQUIRES app.set('trust proxy', 1) in api/index.js. Railway's edge proxy is
 * confirmed (via Railway's own support channel, not assumed) to add exactly
 * ONE hop in front of every container, and to append its own trustworthy
 * observation of the real client IP as the LAST (rightmost) entry in
 * X-Forwarded-For. With trust proxy correctly set to 1, Express's own
 * req.ip/req.ips (backed by the `proxy-addr` package Express uses
 * internally) already implements the correct "trust exactly N hops counted
 * from the right" extraction — so resolveClientIp() below is a thin wrapper
 * over req.ip, not a second, independent header parser.
 *
 * DECISION (was previously left ambiguous — resolved here): this file used to
 * hand-parse X-Forwarded-For itself, picking the first "public-looking" IP
 * scanning from the LEFT (gated behind ST_IP_RESOLVER_MODE=railway), as a
 * workaround for trust proxy never being configured. That workaround read the
 * WRONG END of the header — Railway confirmed the trustworthy value is the
 * LAST entry, not the first — and was trivially spoofable: any client could
 * prepend an arbitrary fake public IP (e.g. `X-Forwarded-For: 8.8.8.8, <real
 * ip>`) and have it accepted, since the "public IP" filter only rejects
 * private/loopback/CGNAT ranges, not fake-but-valid public ones.
 *
 * Now that trust proxy is correctly configured, keeping a second hand-rolled
 * parser of the exact same untrusted header is not meaningful defense in
 * depth — both mechanisms would trust the same hop count against the same
 * input, so a bug in one is not caught by the other (as just happened: the
 * custom parser drifted from correct behavior while nothing validated it
 * against Express's own well-tested logic). resolveClientIp() below relies on
 * req.ip alone. inspectClientIp() is kept as a DIAGNOSTIC-ONLY helper (used by
 * the secret-gated /api/diag/ip endpoint) — it reports what Express resolved
 * plus raw header state and anomaly flags, for debugging trust-proxy
 * misconfiguration or unexpected header shapes, but is never used for any
 * rate-limiting or other security-relevant decision.
 */

/**
 * Normalizes an IP address by stripping the IPv6 representation prefix for IPv4 if present.
 *
 * @param {string} ip
 * @returns {string}
 */
function normalizeIp(ip) {
  if (!ip || typeof ip !== 'string') return ''
  const trimmed = ip.trim()
  if (trimmed.startsWith('::ffff:')) {
    return trimmed.substring(7)
  }
  return trimmed
}

/**
 * Check if a normalized IP address is a public IP (i.e. not loopback, private, CGNAT, link-local, or broadcast).
 * Used only for diagnostic warning flags below — never to alter which IP gets resolved.
 *
 * @param {string} ip
 * @returns {boolean} True if the IP is public
 */
export function isPublicIp(ip) {
  if (!ip || typeof ip !== 'string') return false
  const trimmed = ip.trim()

  // Basic check for loopback/localhost
  if (trimmed === '127.0.0.1' || trimmed === '::1' || trimmed === 'localhost') return false

  // IPv4 check
  const ipv4Match = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number)
    if (octets.some(o => o < 0 || o > 255)) return false

    // 10.0.0.0/8 (Private RFC1918)
    if (octets[0] === 10) return false
    // 172.16.0.0/12 (Private RFC1918)
    if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return false
    // 192.168.0.0/16 (Private RFC1918)
    if (octets[0] === 192 && octets[1] === 168) return false
    // 127.0.0.0/8 (Loopback)
    if (octets[0] === 127) return false
    // 100.64.0.0/10 (CGNAT - Carrier Grade NAT)
    if (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127) return false
    // 169.254.0.0/16 (Link-local)
    if (octets[0] === 169 && octets[1] === 254) return false
    // 0.0.0.0/8 (Current network)
    if (octets[0] === 0) return false

    return true
  }

  // IPv6 check
  const lower = trimmed.toLowerCase()
  // Unique Local Address (fc00::/7)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return false
  // Link-Local (fe80::/10)
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return false
  // Loopback (::1)
  if (lower === '::1' || lower === '::') return false

  // Basic check for plausible IPv6 (has colons, hex characters)
  return /^[0-9a-f:]+$/i.test(trimmed) && trimmed.includes(':')
}

/**
 * Resolves the trustworthy client IP for a request. Relies entirely on
 * Express's own req.ip, which is only correct when app.set('trust proxy', 1)
 * is configured (api/index.js) — see the file-level comment above for why
 * this file no longer hand-parses X-Forwarded-For itself.
 *
 * @param {import('express').Request} req
 * @returns {string} Resolved client IP, or '' if none could be resolved
 */
export function resolveClientIp(req) {
  return normalizeIp(req.ip)
}

/**
 * Diagnostic-only inspection of client IP resolution. NOT used for any
 * rate-limiting or security decision — see resolveClientIp() for that.
 * Reports what Express actually resolved (req.ip/req.ips) alongside raw
 * connection/header state, plus warning flags for shapes worth investigating
 * (e.g. trust-proxy misconfiguration, or a resolved IP that isn't public).
 *
 * @param {import('express').Request} req
 * @returns {object} Diagnostic information
 */
export function inspectClientIp(req) {
  const req_ip = req.ip || ''
  const req_ips = req.ips || []
  const socket_remote_address = req.socket?.remoteAddress || ''
  const raw_x_forwarded_for = req.headers['x-forwarded-for'] || null
  const cf_connecting_ip = req.headers['cf-connecting-ip'] || null

  const normalized_socket_ip = normalizeIp(socket_remote_address)
  const normalized_req_ip = normalizeIp(req_ip)
  const selected_ip = resolveClientIp(req)

  const warning_flags = []

  if (raw_x_forwarded_for) {
    warning_flags.push('XFF_HEADER_PRESENT')
  }

  if (!selected_ip) {
    warning_flags.push('NO_IP_RESOLVED')
  } else if (!isPublicIp(selected_ip)) {
    // With trust proxy correctly set to Railway's confirmed single hop, this
    // should never fire in production — a private/loopback resolved IP here
    // means trust proxy is misconfigured (wrong hop count) or the request
    // didn't come through Railway's edge at all.
    warning_flags.push('RESOLVED_IP_NOT_PUBLIC')
  }

  return {
    req_ip,
    req_ips,
    socket_remote_address,
    raw_x_forwarded_for,
    cf_connecting_ip,
    normalized_socket_ip,
    normalized_req_ip,
    selected_ip,
    warning_flags
  }
}
