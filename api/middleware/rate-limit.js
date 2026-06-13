import rateLimit from 'express-rate-limit'
import { resolveClientIp } from '../lib/ip-resolver.js'
import { createHash, createHmac } from 'crypto'

/**
 * SINGLE-INSTANCE PAID-BETA NOTE:
 * In-memory rate limits are per Node process and reset on deploy/restart.
 * This is acceptable for the current single-instance paid-beta deployment.
 * Redis, Upstash, or another shared store is strictly required before
 * horizontally scaling to a multi-instance production environment.
 */

// Safe environment variable parser
function getEnvInt(key, fallback) {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number.parseInt(raw, 10)
  const isValid = Number.isFinite(parsed) && parsed > 0
  if (!isValid && raw !== undefined) {
    console.warn(`[startup] WARNING: Invalid rate limit override for ${key} ("${raw}"). Using fallback value: ${fallback}`)
  }
  return isValid ? parsed : fallback
}

// Env configuration overrides / constants
const TRACK_VISITOR_MAX = getEnvInt('ST_RATE_TRACK_VISITOR_PER_MIN', process.env.NODE_ENV === 'test' ? 5 : 120)
const TRACK_IP_MAX      = getEnvInt('ST_RATE_TRACK_IP_PER_MIN', process.env.NODE_ENV === 'test' ? 10 : 3000)
const TRACK_SITE_MAX    = getEnvInt('ST_RATE_TRACK_SITE_PER_MIN', process.env.NODE_ENV === 'test' ? 15 : 10000)
const TRACK_GLOBAL_IP_MAX = getEnvInt('ST_RATE_TRACK_GLOBAL_IP_PER_MIN', process.env.NODE_ENV === 'test' ? 20 : 10000)

const CONV_VISITOR_MAX  = getEnvInt('ST_RATE_CONV_VISITOR_PER_MIN', process.env.NODE_ENV === 'test' ? 3 : 30)
const CONV_IP_MAX       = getEnvInt('ST_RATE_CONV_IP_PER_MIN', process.env.NODE_ENV === 'test' ? 6 : 600)
const CONV_SITE_MAX     = getEnvInt('ST_RATE_CONV_SITE_PER_MIN', process.env.NODE_ENV === 'test' ? 9 : 3000)
const CONV_GLOBAL_IP_MAX = getEnvInt('ST_RATE_CONV_GLOBAL_IP_PER_MIN', process.env.NODE_ENV === 'test' ? 10 : 2000)

const TRACKER_ID_VISITOR_MAX = getEnvInt('ST_RATE_TRACKER_ID_VISITOR_PER_MIN', process.env.NODE_ENV === 'test' ? 5 : 120)
const TRACKER_ID_IP_MAX      = getEnvInt('ST_RATE_TRACKER_ID_IP_PER_MIN', process.env.NODE_ENV === 'test' ? 10 : 1200)
const TRACKER_ID_SITE_MAX    = getEnvInt('ST_RATE_TRACKER_ID_SITE_PER_MIN', process.env.NODE_ENV === 'test' ? 15 : 5000)
const TRACKER_ID_GLOBAL_IP_MAX = getEnvInt('ST_RATE_TRACKER_ID_GLOBAL_IP_PER_MIN', process.env.NODE_ENV === 'test' ? 15 : 5000)

const IDENTIFY_VISITOR_MAX = getEnvInt('ST_RATE_IDENTIFY_VISITOR_PER_MIN', process.env.NODE_ENV === 'test' ? 5 : 120)
const IDENTIFY_IP_MAX      = getEnvInt('ST_RATE_IDENTIFY_IP_PER_MIN', process.env.NODE_ENV === 'test' ? 10 : 1200)
const IDENTIFY_SITE_MAX    = getEnvInt('ST_RATE_IDENTIFY_SITE_PER_MIN', process.env.NODE_ENV === 'test' ? 15 : 5000)
const IDENTIFY_GLOBAL_IP_MAX = getEnvInt('ST_RATE_IDENTIFY_GLOBAL_IP_PER_MIN', process.env.NODE_ENV === 'test' ? 15 : 5000)

// Helper to hash and bound user-controlled key parts
export function hashKeyPart(value) {
  if (value === undefined || value === null || value === '') return 'missing'
  // Slice to bound the string length first (prevent huge strings causing memory/perf issues)
  const clean = String(value).slice(0, 500)
  return createHash('sha256').update(clean).digest('hex').slice(0, 16)
}

// Fail fast on startup in production if log hashing secret is missing
if (process.env.NODE_ENV === 'production') {
  if (!process.env.ST_LOG_HASH_SECRET && !process.env.TRACKER_SALT) {
    console.error('[startup] FATAL: Either ST_LOG_HASH_SECRET or TRACKER_SALT environment variable is required in production!')
    process.exit(1)
  }
}

function getLogHashSecret() {
  const secret = process.env.ST_LOG_HASH_SECRET || process.env.TRACKER_SALT
  if (secret) return secret
  return 'sourcetrack-log-fallback-salt'
}

// Helper for stable HMAC log hashing (prevents brute-force recovery of IPv4 or site keys from logs)
function hashForLog(value) {
  if (value === undefined || value === null || value === '') return 'missing'
  // Slice to bound the string length first
  const clean = String(value).slice(0, 500)
  const salt = getLogHashSecret()
  return createHmac('sha256', salt).update(clean).digest('hex').slice(0, 16)
}

// Helpers for request parsing
export function getSiteKey(req) {
  const raw = req.body?.site_key || req.query?.site_key || req.headers?.['x-site-key']
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'string') return raw
  try {
    return JSON.stringify(raw)
  } catch (_) {
    return 'malformed'
  }
}

export function getAnonymousKey(req) {
  // Try to find anonymous identifiers, fallback to resolved IP
  const rawId = req.body?.anonymous_id || req.body?.visitor_id || req.body?.user_id
  if (rawId === undefined || rawId === null) {
    return resolveClientIp(req) || 'fallback_anon'
  }
  if (typeof rawId === 'string') return rawId
  try {
    return JSON.stringify(rawId)
  } catch (_) {
    return 'malformed'
  }
}

// Skip rule configuration
const INGESTION_PATHS = new Set([
  '/api/track',
  '/api/collect',
  '/track',
  '/api/conversion',
  '/api/tracker/id',
  '/api/identify',
  '/sp/e',
  '/sp/c',
  '/api/conversion/offline',
  '/sp/pixel.gif',
  '/api/pixel'
])

export function isIngestionPath(path) {
  if (!path) return false
  // Normalize trailing slash if present (except for root '/')
  const cleanPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  return INGESTION_PATHS.has(cleanPath)
}

export function getSafeRouteLabel(req) {
  const url = req.originalUrl || ''
  const pathPart = url.split('?')[0]
  const cleanPath = pathPart.length > 1 && pathPart.endsWith('/') ? pathPart.slice(0, -1) : pathPart
  if (INGESTION_PATHS.has(cleanPath)) {
    return cleanPath
  }
  return cleanPath.slice(0, 100)
}

// Safe logging helper (no raw IPs, full site keys, anonymous IDs, etc.)
function logRateLimitTripped({ route, layer, req, siteKey, limiterKey }) {
  const sk = siteKey
  const ip = resolveClientIp(req) || ''
  const resolverMode = process.env.ST_IP_RESOLVER_MODE === 'railway' ? 'railway' : 'connection'

  const siteKeyHash = sk ? hashForLog(sk).slice(0, 8) : 'missing'
  const ipHash = ip ? hashForLog(ip) : 'missing'
  const limiterKeyHash = limiterKey ? hashForLog(limiterKey) : 'missing'

  console.warn(
    `[rate-limit] route=${route} layer=${layer} status=429 site_key_hash=${siteKeyHash} ip_hash=${ipHash} limiter_key_hash=${limiterKeyHash} resolver_mode=${resolverMode}`
  )
}

// Safe 429 response builder
function makeRateLimitHandler(layer) {
  return (req, res) => {
    const route = getSafeRouteLabel(req)
    const siteKey = getSiteKey(req)
    const limiterKey = req.rateLimitKey || ''
    logRateLimitTripped({ route, layer, req, siteKey, limiterKey })
    return res.status(429).json({
      success: false,
      data: null,
      error: 'Too many requests',
      message: `Rate limit exceeded (${layer} limit)`
    })
  }
}

// Keep trackLimit defined for legacy/simple public webhook-style routes (like /api/webhooks/incoming) that still use it.
export const trackLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    res.status(429).json({ success: false, data: null, error: 'Too many requests' })
  }
})

// Keep defaultLimit keyGenerator unchanged, but skip the six ingestion paths and OPTIONS requests
export const defaultLimit = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    /**
     * Browser OPTIONS preflight requests do not carry credentials or payload
     * (no user auth or site keys). Rate-limiting them globally is an anti-pattern
     * that breaks cross-origin client CORS preflight requests.
     */
    if (req.method === 'OPTIONS') return true
    return isIngestionPath(req.path)
  },
  handler(_req, res) {
    res.status(429).json({ success: false, data: null, error: 'Too many requests' })
  }
})

// Keep aiLimit as is
export const aiLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    res.status(429).json({ success: false, data: null, error: 'Too many requests' })
  }
})

// Public dashboard sharing rate limiter (IP-based, moderate limit for database protection)
export function createPublicDashboardLimit({ windowMs, max } = {}) {
  const finalWindow = windowMs ?? getEnvInt('PUBLIC_DASHBOARD_RATE_LIMIT_WINDOW_MS', 60_000)
  const finalMax = max ?? getEnvInt('PUBLIC_DASHBOARD_RATE_LIMIT_MAX', 30)

  return rateLimit({
    windowMs: finalWindow,
    max: finalMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    handler(_req, res) {
      res.status(429).json({ success: false, data: null, error: 'Too many requests' })
    }
  })
}

export const publicDashboardLimit = createPublicDashboardLimit()

// ─── Layered Ingestion Limiters ──────────────────────────────────────────────

// 1. /api/track, /api/collect, /track limiters
export const trackVisitorLimit = rateLimit({
  windowMs: 60_000,
  max: TRACK_VISITOR_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    const ak = getAnonymousKey(req)
    const key = `track:visitor:${hashKeyPart(sk)}:${hashKeyPart(ak)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('visitor')
})

export const trackIpLimit = rateLimit({
  windowMs: 60_000,
  max: TRACK_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    const ip = resolveClientIp(req)
    const key = `track:ip:${hashKeyPart(sk)}:${hashKeyPart(ip)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('ip')
})

export const trackSiteLimit = rateLimit({
  windowMs: 60_000,
  max: TRACK_SITE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    const key = `track:site:${hashKeyPart(sk)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('site')
})

export const trackGlobalIpLimit = rateLimit({
  windowMs: 60_000,
  max: TRACK_GLOBAL_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const ip = resolveClientIp(req)
    const key = `track:global-ip:${hashKeyPart(ip)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('global-ip')
})

// 2. /api/conversion limiters
export const conversionVisitorLimit = rateLimit({
  windowMs: 60_000,
  max: CONV_VISITOR_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    // For conversions, check order ID first, then fallback to anonymous/IP ID
    const orderId = req.body?.order_id || req.body?.orderId
    const visitorKey = orderId || getAnonymousKey(req)
    const key = `conversion:visitor:${hashKeyPart(sk)}:${hashKeyPart(visitorKey)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('visitor')
})

export const conversionIpLimit = rateLimit({
  windowMs: 60_000,
  max: CONV_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    const ip = resolveClientIp(req)
    const key = `conversion:ip:${hashKeyPart(sk)}:${hashKeyPart(ip)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('ip')
})

export const conversionSiteLimit = rateLimit({
  windowMs: 60_000,
  max: CONV_SITE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    const key = `conversion:site:${hashKeyPart(sk)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('site')
})

export const conversionGlobalIpLimit = rateLimit({
  windowMs: 60_000,
  max: CONV_GLOBAL_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const ip = resolveClientIp(req)
    const key = `conversion:global-ip:${hashKeyPart(ip)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('global-ip')
})

// 3. /api/tracker/id limiters
export const trackerIdVisitorLimit = rateLimit({
  windowMs: 60_000,
  max: TRACKER_ID_VISITOR_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    const ip = resolveClientIp(req)
    const ua = req.headers['user-agent'] || ''
    // visitor for tracker/id is IP + hashed UA
    const uaHash = hashKeyPart(ua)
    const key = `trackerId:visitor:${hashKeyPart(sk)}:${hashKeyPart(ip)}:${uaHash}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('visitor')
})

export const trackerIdIpLimit = rateLimit({
  windowMs: 60_000,
  max: TRACKER_ID_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    const ip = resolveClientIp(req)
    const key = `trackerId:ip:${hashKeyPart(sk)}:${hashKeyPart(ip)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('ip')
})

export const trackerIdSiteLimit = rateLimit({
  windowMs: 60_000,
  max: TRACKER_ID_SITE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    const key = `trackerId:site:${hashKeyPart(sk)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('site')
})

export const trackerIdGlobalIpLimit = rateLimit({
  windowMs: 60_000,
  max: TRACKER_ID_GLOBAL_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const ip = resolveClientIp(req)
    const key = `trackerId:global-ip:${hashKeyPart(ip)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('global-ip')
})

// 4. /api/identify limiters
export const identifyVisitorLimit = rateLimit({
  windowMs: 60_000,
  max: IDENTIFY_VISITOR_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    const visitorKey = req.body?.user_id || getAnonymousKey(req)
    const key = `identify:visitor:${hashKeyPart(sk)}:${hashKeyPart(visitorKey)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('visitor')
})

export const identifyIpLimit = rateLimit({
  windowMs: 60_000,
  max: IDENTIFY_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    const ip = resolveClientIp(req)
    const key = `identify:ip:${hashKeyPart(sk)}:${hashKeyPart(ip)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('ip')
})

export const identifySiteLimit = rateLimit({
  windowMs: 60_000,
  max: IDENTIFY_SITE_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const sk = getSiteKey(req)
    const key = `identify:site:${hashKeyPart(sk)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('site')
})

export const identifyGlobalIpLimit = rateLimit({
  windowMs: 60_000,
  max: IDENTIFY_GLOBAL_IP_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS',
  keyGenerator: (req) => {
    const ip = resolveClientIp(req)
    const key = `identify:global-ip:${hashKeyPart(ip)}`
    req.rateLimitKey = key
    return key
  },
  handler: makeRateLimitHandler('global-ip')
})

// 5. Stripe webhook limiters
export function createStripeWebhookLimit({ windowMs, max } = {}) {
  const finalWindow = windowMs ?? getEnvInt('STRIPE_WEBHOOK_RATE_LIMIT_WINDOW_MS', 60_000)
  const finalMax = max ?? getEnvInt('STRIPE_WEBHOOK_RATE_LIMIT_MAX', 60)

  return rateLimit({
    windowMs: finalWindow,
    max: finalMax,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.method === 'OPTIONS',
    keyGenerator: (req) => {
      const ip = resolveClientIp(req)
      const key = `stripe-webhook:ip:${hashKeyPart(ip)}`
      req.rateLimitKey = key
      return key
    },
    handler: makeRateLimitHandler('stripe-webhook')
  })
}

export const stripeWebhookLimit = createStripeWebhookLimit()
