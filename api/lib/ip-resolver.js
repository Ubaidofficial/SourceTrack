/**
 * Central Client IP Resolver
 *
 * For Session 124A:
 * This helper resolves client IP from safe connection/socket level values only.
 * It does NOT trust raw X-Forwarded-For headers, preventing IP spoofing.
 *
 * IMPORTANT: Because Express trust proxy is disabled, selected_ip represents the
 * immediate network connection IP (e.g. Railway's edge/proxy IP if deployed behind
 * a reverse proxy). Do not assume this is the true visitor IP until deployment
 * topology is verified using the diagnostic endpoint.
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

  // Express trust proxy is disabled. Mode is set to connection-only.
  const mode = 'connection'

  // When trust proxy is disabled, req.ip falls back to socket connection.
  // We prefer normalized_req_ip first, then normalized_socket_ip.
  const selected_ip = normalized_req_ip || normalized_socket_ip

  const warning_flags = []
  if (raw_x_forwarded_for) {
    warning_flags.push('XFF_HEADER_PRESENT')
    const firstXff = normalizeIp(raw_x_forwarded_for.split(',')[0])
    if (firstXff !== selected_ip) {
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
