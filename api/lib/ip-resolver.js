/**
 * Central Client IP Resolver
 *
 * For Session 124B:
 * This helper resolves client IP from safe connection/socket level values (connection mode)
 * or parses the Edge-sanitized XFF chain for the first valid public client IP (railway mode).
 *
 * Mode is enabled via environment variable: ST_IP_RESOLVER_MODE=railway
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
 * Inspects client IP headers and connection properties.
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

  const mode = process.env.ST_IP_RESOLVER_MODE === 'railway' ? 'railway' : 'connection'
  let selected_ip = normalized_req_ip || normalized_socket_ip
  const warning_flags = []

  if (raw_x_forwarded_for) {
    warning_flags.push('XFF_HEADER_PRESENT')
  }

  if (mode === 'railway') {
    if (raw_x_forwarded_for) {
      const parts = raw_x_forwarded_for.split(',').map(s => s.trim()).filter(Boolean)
      let foundPublic = null
      for (const part of parts) {
        const normalizedPart = normalizeIp(part)
        if (isPublicIp(normalizedPart)) {
          foundPublic = normalizedPart
          break
        }
      }

      if (foundPublic) {
        selected_ip = foundPublic
      } else {
        warning_flags.push('RAILWAY_NO_PUBLIC_XFF_IP')
      }
    } else {
      warning_flags.push('RAILWAY_MISSING_XFF_HEADER')
    }
  }

  // Compare XFF first IP with connection IP for warnings
  if (raw_x_forwarded_for) {
    const firstXff = normalizeIp(raw_x_forwarded_for.split(',')[0])
    if (firstXff !== (normalized_req_ip || normalized_socket_ip)) {
      warning_flags.push('XFF_CONNECTION_IP_MISMATCH')
    }
  }

  if (!selected_ip) {
    warning_flags.push('NO_IP_RESOLVED')
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
    mode,
    warning_flags
  }
}

/**
 * Resolves the connection IP address for client request.
 *
 * @param {import('express').Request} req
 * @returns {string} Resolved connection IP
 */
export function resolveClientIp(req) {
  const info = inspectClientIp(req)
  return info.selected_ip
}
