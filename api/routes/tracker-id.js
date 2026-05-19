/**
 * GET /api/tracker/id?site_key=xxx
 *
 * Returns a server-derived { visitor_id, session_id } for cookieless tracking.
 *
 * visitor_id  — rotates every 24 h (UTC day boundary)
 * session_id  — rotates every 1 h
 *
 * Both are SHA-256 hashes of:
 *   daily_salt + site_key + hashed_ip + hashed_ua
 * where daily_salt = HMAC-SHA256(UTC date string, TRACKER_SALT env var)
 *
 * This means:
 *  • No cookies, no localStorage, no fingerprinting APIs
 *  • Cannot reconstruct a real IP from the hash
 *  • Rotates daily — compliant with most EU DPA guidance on IP-based IDs
 *
 * GDPR note: IP address is a personal data point under GDPR. We never store the
 * raw IP — only the salted daily hash, which is not reversible.
 */

import { createHmac, createHash } from 'crypto'
import express from 'express'

export const trackerIdRouter = express.Router()

// Daily rotating salt: HMAC(UTC date, TRACKER_SALT)
function getDailySalt(date) {
  const secret = process.env.TRACKER_SALT || 'sourcetrack-default-salt-change-me'
  return createHmac('sha256', secret)
    .update(date)
    .digest('hex')
}

// Hourly salt for session IDs
function getHourlySalt(dateHour) {
  const secret = process.env.TRACKER_SALT || 'sourcetrack-default-salt-change-me'
  return createHmac('sha256', secret)
    .update(dateHour)
    .digest('hex')
}

function hashComponent(value) {
  return createHash('sha256').update(value || '').digest('hex').slice(0, 16)
}

function sha256(input) {
  return createHash('sha256').update(input).digest('hex')
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  if (forwarded) {
    // Take the first IP (client IP, not proxy chain)
    return forwarded.split(',')[0].trim()
  }
  return req.socket?.remoteAddress || req.ip || ''
}

trackerIdRouter.get('/', (req, res) => {
  // CORS — must work cross-origin (called from customer websites)
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'false')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

  const siteKey = req.query.site_key || ''
  const ip      = getClientIp(req)
  const ua      = req.headers['user-agent'] || ''

  const now       = new Date()
  const utcDate   = now.toISOString().slice(0, 10)                   // "2026-05-19"
  const utcHour   = now.toISOString().slice(0, 13)                   // "2026-05-19T14"

  const dailySalt  = getDailySalt(utcDate)
  const hourlySalt = getHourlySalt(utcHour)

  // Hash the IP and UA separately so the combined hash leaks neither
  const hashedIp = hashComponent(ip)
  const hashedUa = hashComponent(ua)

  // visitor_id: stable for 24 h per (site, visitor)
  const visitorId = sha256(`${dailySalt}:${siteKey}:${hashedIp}:${hashedUa}`)

  // session_id: stable for 1 h per (site, visitor)
  const sessionId = sha256(`${hourlySalt}:${siteKey}:${hashedIp}:${hashedUa}`)

  // No-store: prevent any proxy/CDN from caching this response
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  return res.json({ visitor_id: visitorId, session_id: sessionId })
})

trackerIdRouter.options('/', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '86400')
  return res.status(200).send('OK')
})
