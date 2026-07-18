import 'dotenv/config'
import express from 'express'
import compression from 'compression'
import helmet from 'helmet'
import cors from 'cors'
import NodeCache from 'node-cache'
import { getSupabase } from './lib/supabase.js'
import { initTinybirdDualWrite } from '../tinybird/adapter/boot.js'
import { drainDualWrite } from '../tinybird/adapter/dual-write.js'

import {
  defaultLimit,
  trackLimit,
  trackVisitorLimit,
  trackIpLimit,
  trackSiteLimit,
  trackGlobalIpLimit,
  conversionVisitorLimit,
  conversionIpLimit,
  conversionSiteLimit,
  conversionGlobalIpLimit,
  identifyVisitorLimit,
  identifyIpLimit,
  identifySiteLimit,
  identifyGlobalIpLimit,
  stripeWebhookLimit,
  isIngestionPath
} from './middleware/rate-limit.js'
import { validateSiteKey } from './middleware/auth.js'
import { requireSiteMembership } from './middleware/auth.js'
import { detectAIPlatform } from './middleware/ai-platform.js'
import { checkTierLimit } from './middleware/tier-check.js'
import { track } from './routes/track.js'
import { identify } from './routes/identify.js'
import { conversion } from './routes/conversion.js'
import { conversionOffline } from './routes/conversion-offline.js'
import { attribution, attributionExplain, attributionVerdicts } from './routes/attribution.js'
import { journey } from './routes/journey.js'
import { installRouter } from './routes/install.js'
import { eventsRouter } from './routes/events.js'
import { alertsRouter } from './routes/alerts.js'
import { siteAlertsRouter } from './routes/site-alerts.js'
import { hygieneRouter } from './routes/hygiene.js'
import { exportRouter } from './routes/export.js'
import { onboardingRouter } from './routes/onboarding.js'
import { sitesRouter } from './routes/sites.js'
import { dashboardRouter } from './routes/dashboard.js'
import { leadsRouter } from './routes/leads-server.js'
import { campaignsRouter } from './routes/campaigns.js'
import { campaignCostsRouter } from './routes/campaign-costs.js'
import { integrationsRouter } from './routes/integrations.js'
import { googleSearchConsoleRouter } from './routes/google-search-console.js'
import { adPlatformsRouter } from './routes/ad-platforms.js'
import { capiRouter } from './routes/capi.js'
import { seoRevenueRouter } from './routes/seo-revenue.js'
import { adminRouter } from './routes/admin.js'
import { savedReportsRouter } from './routes/saved-reports.js'
import { requireUserAuth } from './middleware/user-auth.js'
import { billingWebhookHandler, billingRouter } from './routes/billing.js'
import jobStatusRouter from './routes/job-status.js'
import { serverEventsRouter } from './routes/server-events.js'
import { sessionsOverview, visitorSessions } from './routes/sessions.js'
import liveRouter from './routes/live.js'
import analyticsRouter from './routes/analytics.js'
import proxyRouter from './routes/proxy.js'
import webhookIncomingRouter from './routes/webhook-incoming.js'
import { trackerIdRouter } from './routes/tracker-id.js'
import { gdprRouter } from './routes/gdpr.js'
import { pixelRouter } from './routes/pixel.js'
import { webhooksRouter } from './routes/webhooks.js'
import { stripeWebhookRouter } from './routes/stripe-webhook.js'
import { shopifyWebhookRouter } from './routes/shopify-webhook.js'
import { inspectClientIp } from './lib/ip-resolver.js'
import { managedProxyEarlyGate, bindManagedProxySiteKey } from './middleware/managed-proxy.js'
import { requestIdMiddleware } from './middleware/request-id.js'
import { logInfo, logError, sanitizeLogPath } from './lib/safe-logger.js'
import { handlePrivacySuppression } from './lib/privacy-suppression.js'

// Fail fast on missing required environment variables. Better to crash on
// startup than to fail every request with a cryptic 500 later.
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'POSTHOG_HOST', 'POSTHOG_API_KEY']
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k])
if (missingEnv.length) {
  console.error(`[startup] Missing required env vars: ${missingEnv.join(', ')}`)
  process.exit(1)
}

// Fail fast in production if ENCRYPTION_KEY is missing or invalid
if (process.env.NODE_ENV === 'production') {
  if (!process.env.ST_MANAGED_PROXY_TARGET) {
    console.error('[startup] FATAL: ST_MANAGED_PROXY_TARGET environment variable is missing in production!')
    process.exit(1)
  }
  if (!process.env.ST_PLATFORM_HOSTS) {
    console.error('[startup] FATAL: ST_PLATFORM_HOSTS environment variable is missing in production!')
    process.exit(1)
  }
  const rawKey = process.env.ENCRYPTION_KEY
  if (!rawKey) {
    console.error('[startup] FATAL: ENCRYPTION_KEY environment variable is missing in production!')
    console.error('To generate a secure key, run: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
    process.exit(1)
  }
  let isValid = false
  if (/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    isValid = true
  } else {
    try {
      const buf = Buffer.from(rawKey, 'base64')
      if (buf.length === 32) {
        isValid = true
      }
    } catch (_) {}
  }
  if (!isValid) {
    console.error('[startup] FATAL: ENCRYPTION_KEY must be a 64-character hex string or a 32-byte base64-encoded string in production!')
    console.error('To generate a secure key, run: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"')
    process.exit(1)
  }

}


const app = express()

// Railway's edge proxy adds exactly ONE hop in front of this container —
// confirmed via Railway's own support channel (not assumed): their edge
// appends its own trustworthy observation of the real client IP as the LAST
// entry in X-Forwarded-For, and their proxy fleet is a single tier (no
// separate internal load-balancer hop exposed in the header chain). Without
// this, Express's req.ip/req.ips fall back to the raw socket address (i.e.
// Railway's own edge IP for every request), which silently breaks two things:
// (1) any IP-based security decision that reads X-Forwarded-For directly
// becomes trivially spoofable (a client can prepend any fake IP), and (2) any
// rate limiter keyed on req.ip's default keyGenerator buckets ALL clients
// together under one shared limit instead of per-client. See
// api/lib/ip-resolver.js for how the resolved req.ip is consumed.
app.set('trust proxy', 1)

// Time-mocking middleware for testing (only in non-production environments with explicit opt-in)
app.use((req, res, next) => {
  const nowHeader = req.headers['x-sourcetrack-now'] || req.query.now_override
  const isTestMode = process.env.NODE_ENV !== 'production' && process.env.ALLOW_TEST_TIME_MOCK === 'true'

  if (nowHeader) {
    if (!isTestMode) {
      // Strictly fail-closed: strip headers and parameters at the middleware boundary in production
      delete req.headers['x-sourcetrack-now']
      if (req.query.now_override) {
        delete req.query.now_override
      }
      return next()
    }

    if (global.timeMockStorage) {
      const mockTime = new Date(nowHeader).getTime()
      if (!isNaN(mockTime)) {
        global.timeMockStorage.run(mockTime, () => next())
        return
      }
    }
  }
  next()
})

// Stage 1 Early Managed Proxy Gate
app.use(managedProxyEarlyGate)

// Request ID assignment and sanitization
app.use(requestIdMiddleware)

// Request completion logging (only for API routes, skip static assets and high-volume ingestion)
app.use((req, res, next) => {
  const isApi = req.path.startsWith('/api') || req.path.startsWith('/sp') || req.path === '/track'
  const isIngestion = isIngestionPath(req.path)

  if (!isApi || isIngestion) {
    return next()
  }

  const start = Date.now()

  res.on('finish', () => {
    const duration = Date.now() - start
    logInfo('request_completed', {
      request_id: req.requestId,
      method: req.method,
      path: sanitizeLogPath(req.path),
      status: res.statusCode,
      duration_ms: duration
    })
  })

  next()
})

// ── Hardcoded dashboard origins (not customer domains, not in env var) ────────
const HARDCODED_ALLOWED_ORIGINS = [
  'https://www.sourcetrack.ai',
  'https://sourcetrack.ai',
  'https://app.sourcetrack.ai',
  'http://localhost:5173',
  'http://localhost:8080',
]

// ── Global OPTIONS preflight ─────────────────────────────────────────────────
// Must run before any auth middleware since browsers send OPTIONS without
// Authorization headers. Allow only known dashboard origins + env-var origins.
// Customer-site origins (DB-validated) pass through to the cors middleware below.
app.use((req, res, next) => {
  if (req.method !== 'OPTIONS') return next()

  const origin = req.headers.origin
  if (!origin) return next()

  let hostname = null
  try { hostname = new URL(origin).hostname } catch {}

  const allAllowed = [...HARDCODED_ALLOWED_ORIGINS, ...allowedOrigins]
  if (!allAllowed.includes(origin) && !(hostname && allAllowed.includes(hostname))) {
    return next()
  }

  res.header('Access-Control-Allow-Origin', origin)
  res.header('Access-Control-Allow-Credentials', 'true')
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Sourcetrack-Support-Preview')
  res.header('Access-Control-Max-Age', '86400')
  return res.status(204).end()
})

// Session 70 hard CORS fix for pixel API routes
app.use((req, res, next) => {
  const isPixelRoute =
    req.path === '/api/track' ||
    req.path === '/api/collect' ||
    req.path === '/api/conversion' ||
    req.path === '/api/identify' ||
    req.path === '/api/pixel' ||
    req.path === '/track' ||
    req.path.includes('/tracking') ||
    req.path.includes('/pageview') ||
    req.path.includes('/tracker');

  if (isPixelRoute) {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Max-Age', '86400');
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  }

  if (isPixelRoute && req.method === 'OPTIONS') {
    return res.status(200).send('OK');
  }

  next();
});
const PORT = process.env.PORT || 3000

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const domainCache = new NodeCache({ stdTTL: 300 })

async function getOriginDomain(origin) {
  try {
    const url = new URL(origin)
    return url.hostname
  } catch {
    return null
  }
}

async function isAllowedOrigin(origin) {
  if (!origin) return true

  if (allowedOrigins.includes(origin)) return true

  // Hardcoded dashboard origins — browsers send full origin (scheme + host)
  if (HARDCODED_ALLOWED_ORIGINS.includes(origin)) return true

  const hostname = await getOriginDomain(origin)
  if (!hostname) return false

  if (allowedOrigins.includes(hostname)) return true

  const cached = domainCache.get(hostname)
  if (cached !== undefined) return cached

  try {
    const { data } = await getSupabase()
      .from('sites')
      .select('domain')
      .eq('domain', hostname)
      .maybeSingle()

    const allowed = !!data
    domainCache.set(hostname, allowed)
    return allowed
  } catch {
    domainCache.set(hostname, false)
    return false
  }
}

// 0. gzip compression for all responses (tracker.min.js goes from 4KB → 1.7KB)
app.use(compression())

// 1. helmet
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

// 1b. Static tracker files (before body parsing, public)

// Allow SourceTrack pixel assets to load on customer websites

// Browsers re-request tracker.min.js on every customer pageview unless we
// tell them otherwise. 24h + immutable is safe because we re-deploy when the
// tracker changes — and customers cache-bust by waiting for the deploy.
const TRACKER_CACHE_HEADER = 'public, max-age=86400, stale-while-revalidate=604800, immutable'


// Root alias required by tracker/loader.min.js
app.get('/tracker.min.js', (req, res) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Cache-Control', TRACKER_CACHE_HEADER)
  res.type('application/javascript')
  res.sendFile(process.cwd() + '/tracker/tracker.min.js')
  setImmediate(() => {
    handlePrivacySuppression(req).catch(() => {})
  })
})

app.get('/tracker.cookieless.min.js', (req, res) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Cache-Control', TRACKER_CACHE_HEADER)
  res.type('application/javascript')
  res.sendFile(process.cwd() + '/tracker/tracker.cookieless.min.js')
  setImmediate(() => {
    handlePrivacySuppression(req).catch(() => {})
  })
})

app.use('/tracker', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  // Cache .min.js (production artifacts); leave .js (dev) uncached
  if (req.path.endsWith('.min.js')) {
    res.setHeader('Cache-Control', TRACKER_CACHE_HEADER)
  }
  next()
})

app.use('/tracker', express.static('tracker'))

// 2. Stripe webhook (MUST be before express.json)
app.post('/api/billing/webhook', stripeWebhookLimit, express.raw({ type: 'application/json' }), billingWebhookHandler)
app.use('/api/webhooks/stripe', stripeWebhookLimit, express.raw({ type: 'application/json' }), stripeWebhookRouter)
app.use('/api/webhooks/shopify', express.raw({ type: 'application/json' }), shopifyWebhookRouter)

// 3. express.json
app.use(express.json())

// 4. CORS
app.use(cors({
  origin: async (origin, cb) => {
    const allowed = await isAllowedOrigin(origin)
    cb(null, allowed)
  },
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Sourcetrack-Support-Preview'],
  optionsSuccessStatus: 204
}))

// 5. Rate limits
app.use(defaultLimit)

// 6. Routes
app.post('/api/track',
  bindManagedProxySiteKey,
  trackVisitorLimit,
  trackIpLimit,
  trackSiteLimit,
  trackGlobalIpLimit,
  validateSiteKey,
  checkTierLimit,
  detectAIPlatform,
  track
)
app.get('/api/pixel',
  trackVisitorLimit,
  trackIpLimit,
  trackSiteLimit,
  trackGlobalIpLimit,
  pixelRouter
)  // 1×1 GIF — email & no-JS tracking
app.post('/api/collect',
  (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    next()
  },
  bindManagedProxySiteKey,
  trackVisitorLimit,
  trackIpLimit,
  trackSiteLimit,
  trackGlobalIpLimit,
  validateSiteKey,
  checkTierLimit,
  detectAIPlatform,
  track
)
app.options('/api/collect', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    res.setHeader('Access-Control-Max-Age', '86400')
    return res.status(200).send('OK')
  })
app.post('/api/identify',
  bindManagedProxySiteKey,
  identifyVisitorLimit,
  identifyIpLimit,
  identifySiteLimit,
  identifyGlobalIpLimit,
  validateSiteKey,
  identify
)
app.post('/api/conversion',
  bindManagedProxySiteKey,
  conversionVisitorLimit,
  conversionIpLimit,
  conversionSiteLimit,
  conversionGlobalIpLimit,
  validateSiteKey,
  detectAIPlatform,
  conversion
)
app.post('/api/conversion/offline',
  conversionIpLimit,
  conversionSiteLimit,
  conversionGlobalIpLimit,
  validateSiteKey,
  conversionOffline
)
app.get('/api/attribution', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, attribution)
app.get('/api/attribution/explain', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, attributionExplain)
app.get("/api/attribution/verdicts", requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, attributionVerdicts)
app.get('/api/journey/:visitorId', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, journey)
// ── Support Preview Mutation Guard ─────────────────────────────────────────────
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next()
  }
  // Allow mutations on /api/admin/* (so operator can do operator things)
  if (req.path.startsWith('/api/admin/')) {
    return next()
  }
  // If the frontend flagged this as a support preview request
  if (req.headers['x-sourcetrack-support-preview'] === 'true') {
    return res.status(403).json({ success: false, error: 'Support preview is read-only' })
  }
  next()
})

app.use('/api/install', requireUserAuth, installRouter)
app.use('/api/events', requireUserAuth, validateSiteKey, requireSiteMembership, eventsRouter)
app.use('/api/alerts', requireUserAuth, validateSiteKey, requireSiteMembership, alertsRouter)
app.use('/api/site-alerts', requireUserAuth, validateSiteKey, requireSiteMembership, siteAlertsRouter)
app.use('/api/hygiene', requireUserAuth, validateSiteKey, requireSiteMembership, hygieneRouter)
app.use('/api/export', requireUserAuth, validateSiteKey, requireSiteMembership, exportRouter)
app.use('/api/onboarding', requireUserAuth, onboardingRouter)
app.use('/api/sites', requireUserAuth, sitesRouter)
app.use('/api/dashboard', requireUserAuth, validateSiteKey, requireSiteMembership, dashboardRouter)
app.use('/api/leads', requireUserAuth, validateSiteKey, requireSiteMembership, leadsRouter)
app.use('/api/campaigns', requireUserAuth, validateSiteKey, requireSiteMembership, campaignsRouter)
app.use('/api/saved-reports', requireUserAuth, validateSiteKey, requireSiteMembership, savedReportsRouter)
// Backwards-compatible alias used by the dashboard app and onboarding seeds.
// The router path is /saved, so this exposes /api/reports/saved.
app.use('/api/reports', requireUserAuth, validateSiteKey, requireSiteMembership, savedReportsRouter)
app.use('/api/integrations/google-search-console', googleSearchConsoleRouter)
app.use('/api/integrations/ad-platforms', adPlatformsRouter)
app.use('/api/integrations/capi', requireUserAuth, validateSiteKey, requireSiteMembership, capiRouter)
app.use('/api/integrations', requireUserAuth, validateSiteKey, requireSiteMembership, integrationsRouter)
app.use('/api/seo-revenue', requireUserAuth, validateSiteKey, requireSiteMembership, seoRevenueRouter)
app.use('/api/campaign-costs', requireUserAuth, validateSiteKey, requireSiteMembership, campaignCostsRouter)
app.use('/api/server', serverEventsRouter)
app.use('/api/billing', billingRouter)
app.use('/api/admin', requireUserAuth, adminRouter)
app.use('/api/jobs', requireUserAuth, jobStatusRouter)
app.use('/api/live', requireUserAuth, validateSiteKey, requireSiteMembership, liveRouter)
app.use("/api/analytics", analyticsRouter)
app.use("/sp", proxyRouter)
app.use("/api/webhooks/incoming", trackLimit, webhookIncomingRouter)
app.use("/api/webhooks", webhooksRouter)
app.get('/api/sessions/overview', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, sessionsOverview)
app.get('/api/sessions', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, visitorSessions)

// Cookieless tracker identity endpoint (public — called from customer sites)
app.use('/api/tracker/id', bindManagedProxySiteKey, trackerIdRouter)

// GDPR / privacy endpoints (authenticated)
app.use('/api/gdpr', requireUserAuth, gdprRouter)

// Temporary deployment diagnostic route. Should be disabled by removing
// ST_IP_DIAGNOSTIC_SECRET from the environment after verification.
if (process.env.ST_IP_DIAGNOSTIC_SECRET) {
  app.get('/api/diag/ip', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    const secret = req.headers['x-diagnostic-secret']
    if (!secret || secret !== process.env.ST_IP_DIAGNOSTIC_SECRET) {
      return res.status(401).json({ error: 'Unauthorized diagnostic request' })
    }
    const info = inspectClientIp(req)
    return res.json({
      req_ip: info.req_ip,
      req_ips: info.req_ips,
      socket_remote_address: info.socket_remote_address,
      raw_x_forwarded_for: info.raw_x_forwarded_for,
      cf_connecting_ip: info.cf_connecting_ip,
      normalized_socket_ip: info.normalized_socket_ip,
      normalized_req_ip: info.normalized_req_ip,
      selected_ip: info.selected_ip,
      warning_flags: info.warning_flags
    })
  })
}

// 7. Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      service: 'api',
      timestamp: new Date().toISOString(),
      request_id: req.requestId
    },
    error: null
  })
})

// 8. Global error handler
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500

  logError('request_failed', {
    request_id: req.requestId,
    method: req.method,
    path: sanitizeLogPath(req.path),
    status,
    error: err
  })

  return res.status(status).json({
    success: false,
    data: null,
    error: err.publicMessage || (status >= 500 ? 'Internal server error' : 'Request failed'),
    request_id: req.requestId
  })
})



// Root /track alias — same handler as /api/track, no loopback
app.post('/track',
  express.json({ limit: '100kb' }),
  bindManagedProxySiteKey,
  trackVisitorLimit,
  trackIpLimit,
  trackSiteLimit,
  trackGlobalIpLimit,
  validateSiteKey,
  checkTierLimit,
  detectAIPlatform,
  track
)




// Optional Tinybird dual-write transport — wired from env ONLY when
// TINYBIRD_DUAL_WRITE is on AND TINYBIRD_HOST/TINYBIRD_APPEND_TOKEN are set. No-op
// (and never crashes) otherwise; flag default OFF unchanged.
initTinybirdDualWrite()

const server = app.listen(PORT, () => {
  process.stdout.write(`TrackIQ running on port ${PORT}\n`)
})

// Graceful shutdown — Railway sends SIGTERM ~10s before SIGKILL on deploys.
// Single ordered owner: drain in-flight HTTP requests, THEN drain the Tinybird
// dual-write buffer (so events from those in-flight requests are delivered before
// exit — otherwise a claimed quota unit could outlive its event), THEN exit.
// (PostHog is decommissioned; the old ph.shutdown() flush was removed in D3.)
let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[shutdown] ${signal} received, draining…`)
  // Hard exit if we exceed the platform's grace window.
  const forceExit = setTimeout(() => {
    console.error('[shutdown] timeout — forcing exit')
    process.exit(1)
  }, 10_000)
  forceExit.unref()
  server.close(async () => {
    console.log('[shutdown] http server closed')
    try {
      const deadline = Number(process.env.TINYBIRD_SHUTDOWN_DRAIN_MS) || 8000
      await drainDualWrite({ deadlineMs: deadline })
      console.log('[shutdown] tinybird dual-write buffer drained')
    } catch (err) {
      console.error('[shutdown] tinybird dual-write drain failed:', err?.message)
    }
    clearTimeout(forceExit)
    process.exit(0)
  })
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

// Process-level exception and rejection tracking. Log clean details and exit with failure.
// Critical security: Do NOT log process.env, secrets, auth headers, cookies, payloads, or PII.
process.on('uncaughtException', (err) => {
  const timestamp = new Date().toISOString()
  const errorMsg = err instanceof Error ? err.message : String(err)
  const stackTrace = err instanceof Error ? err.stack : 'No stack trace available'

  console.error(`[${timestamp}] FATAL: uncaughtException - Message: ${errorMsg}`)
  if (err instanceof Error && err.stack) {
    console.error(`[${timestamp}] FATAL: uncaughtException - Stack:\n${stackTrace}`)
  }
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  const timestamp = new Date().toISOString()
  const errorMsg = reason instanceof Error ? reason.message : String(reason)
  const stackTrace = reason instanceof Error ? reason.stack : 'No stack trace available'

  console.error(`[${timestamp}] FATAL: unhandledRejection - Reason: ${errorMsg}`)
  if (reason instanceof Error && reason.stack) {
    console.error(`[${timestamp}] FATAL: unhandledRejection - Stack:\n${stackTrace}`)
  }
  process.exit(1)
})
