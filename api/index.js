import 'dotenv/config'
import express from 'express'
import compression from 'compression'
import helmet from 'helmet'
import cors from 'cors'
import NodeCache from 'node-cache'
import { getSupabase } from './lib/supabase.js'

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
  identifyGlobalIpLimit
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
import { aiChatRouter } from './routes/ai-chat.js'
import { installRouter } from './routes/install.js'
import { eventsRouter } from './routes/events.js'
import { cohortsRouter } from './routes/cohorts.js'
import { alertsRouter } from './routes/alerts.js'
import { hygieneRouter } from './routes/hygiene.js'
import { exportRouter } from './routes/export.js'
import { onboardingRouter } from './routes/onboarding.js'
import { sitesRouter } from './routes/sites.js'
import { dashboardRouter } from './routes/dashboard.js'
import { aiAnalyticsRouter } from './routes/ai-analytics.js'
import { leadsRouter } from './routes/leads-server.js'
import { campaignsRouter } from './routes/campaigns.js'
import { campaignCostsRouter } from './routes/campaign-costs.js'
import { publicDashboardRouter } from './routes/public-dashboard.js'
import { integrationsRouter } from './routes/integrations.js'
import { googleSearchConsoleRouter } from './routes/google-search-console.js'
import { adPlatformsRouter } from './routes/ad-platforms.js'
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
import { annotationsRouter } from './routes/annotations.js'
import { webhooksRouter } from './routes/webhooks.js'
import { stripeWebhookRouter } from './routes/stripe-webhook.js'
import { shopifyWebhookRouter } from './routes/shopify-webhook.js'
import { inspectClientIp } from './lib/ip-resolver.js'
import { managedProxyEarlyGate, bindManagedProxySiteKey } from './middleware/managed-proxy.js'

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

  // Warn if ST_IP_RESOLVER_MODE is not set to railway in production
  if (process.env.ST_IP_RESOLVER_MODE !== 'railway') {
    console.warn('\n================================================================================')
    console.warn('[startup] WARNING: ST_IP_RESOLVER_MODE is not set to "railway" in production!')
    console.warn('Migrated ingestion routes will fall back to connection-mode (socket) IPs.')
    console.warn('If deployed behind Railway Edge, this will result in using internal 100.64.x.x IPs')
    console.warn('for client geo-location, cookieless visitor identity, and CAPI dispatches.')
    console.warn('Please ensure ST_IP_RESOLVER_MODE=railway is configured on the Railway service.')
    console.warn('================================================================================\n')
  }
}


const app = express()

// Stage 1 Early Managed Proxy Gate
app.use(managedProxyEarlyGate)

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
  res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
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

// Warn if PostHog vars missing but don't crash — Railway injects these at runtime
if (!process.env.POSTHOG_API_KEY) console.warn('WARN: POSTHOG_API_KEY is not set')
if (!process.env.POSTHOG_PERSONAL_API_KEY) console.warn('WARN: POSTHOG_PERSONAL_API_KEY is not set')
if (!process.env.POSTHOG_PROJECT_ID) console.warn('WARN: POSTHOG_PROJECT_ID is not set')

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
})

app.get('/tracker.cookieless.min.js', (req, res) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Cache-Control', TRACKER_CACHE_HEADER)
  res.type('application/javascript')
  res.sendFile(process.cwd() + '/tracker/tracker.cookieless.min.js')
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
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhookHandler)
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRouter)
app.use('/api/webhooks/shopify', express.raw({ type: 'application/json' }), shopifyWebhookRouter)

// 3. express.json
app.use(express.json())

// 4. CORS
app.use(cors({
  origin: async (origin, cb) => {
    const allowed = await isAllowedOrigin(origin)
    cb(null, allowed)
  },
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
app.get('/api/pixel', trackLimit, pixelRouter)  // 1×1 GIF — email & no-JS tracking
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
  checkTierLimit,
  detectAIPlatform,
  conversion
)
app.post('/api/conversion/offline', validateSiteKey, conversionOffline)
app.get('/api/attribution', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, attribution)
app.get('/api/attribution/explain', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, attributionExplain)
app.get("/api/attribution/verdicts", requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, attributionVerdicts)
app.get('/api/journey/:visitorId', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, journey)
app.use('/api/ai-chat', requireUserAuth, validateSiteKey, requireSiteMembership, aiChatRouter)
app.use('/api/install', requireUserAuth, installRouter)
app.use('/api/events', requireUserAuth, validateSiteKey, requireSiteMembership, eventsRouter)
app.use('/api/cohorts', requireUserAuth, validateSiteKey, requireSiteMembership, cohortsRouter)
app.use('/api/alerts', requireUserAuth, validateSiteKey, requireSiteMembership, alertsRouter)
app.use('/api/hygiene', requireUserAuth, validateSiteKey, requireSiteMembership, hygieneRouter)
app.use('/api/export', requireUserAuth, validateSiteKey, requireSiteMembership, exportRouter)
app.use('/api/onboarding', requireUserAuth, onboardingRouter)
app.use('/api/sites', requireUserAuth, sitesRouter)
app.use('/api/dashboard', requireUserAuth, validateSiteKey, requireSiteMembership, dashboardRouter)
app.use('/api/ai-analytics', requireUserAuth, validateSiteKey, requireSiteMembership, aiAnalyticsRouter)
app.use('/api/leads', requireUserAuth, validateSiteKey, requireSiteMembership, leadsRouter)
app.use('/api/campaigns', requireUserAuth, validateSiteKey, requireSiteMembership, campaignsRouter)
app.use('/api/saved-reports', requireUserAuth, validateSiteKey, requireSiteMembership, savedReportsRouter)
// Backwards-compatible alias used by the dashboard app and onboarding seeds.
// The router path is /saved, so this exposes /api/reports/saved.
app.use('/api/reports', requireUserAuth, validateSiteKey, requireSiteMembership, savedReportsRouter)
app.use('/api/integrations/google-search-console', googleSearchConsoleRouter)
app.use('/api/integrations/ad-platforms', adPlatformsRouter)
app.use('/api/integrations', requireUserAuth, validateSiteKey, requireSiteMembership, integrationsRouter)
app.use('/api/seo-revenue', requireUserAuth, validateSiteKey, requireSiteMembership, seoRevenueRouter)
app.use('/api/campaign-costs', requireUserAuth, validateSiteKey, requireSiteMembership, campaignCostsRouter)
app.use('/api/public', publicDashboardRouter)
app.use('/api/server', serverEventsRouter)
app.use('/api/billing', billingRouter)
app.use('/api/admin', requireUserAuth, adminRouter)
app.use('/api/jobs', requireUserAuth, jobStatusRouter)
app.use('/api/live', requireUserAuth, validateSiteKey, requireSiteMembership, liveRouter)
app.use("/api/analytics", analyticsRouter)
app.use("/sp", proxyRouter)
app.use("/api/webhooks/incoming", webhookIncomingRouter)
app.use("/api/webhooks", webhooksRouter)
app.get('/api/sessions/overview', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, sessionsOverview)
app.get('/api/sessions', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, visitorSessions)

// Cookieless tracker identity endpoint (public — called from customer sites)
app.use('/api/tracker/id', bindManagedProxySiteKey, trackerIdRouter)

// Annotations — chart markers for deploys, campaigns, events
app.use('/api/annotations', requireUserAuth, validateSiteKey, requireSiteMembership, annotationsRouter)

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
      mode: info.mode,
      warning_flags: info.warning_flags
    })
  })
}

// 7. Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 8. Global error handler
app.use((err, req, res, next) => {
  console.error('Global API error:', err)
  return res.status(500).json({
    success: false,
    data: null,
    error: 'Internal server error'
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




const server = app.listen(PORT, () => {
  process.stdout.write(`TrackIQ running on port ${PORT}\n`)
})

// Graceful shutdown — Railway sends SIGTERM ~10s before SIGKILL on deploys.
// Close the HTTP server so in-flight requests finish, then exit.
function shutdown(signal) {
  console.log(`[shutdown] ${signal} received, draining…`)
  server.close(() => {
    console.log('[shutdown] http server closed')
    process.exit(0)
  })
  // Hard exit if we exceed the platform's grace window.
  setTimeout(() => {
    console.error('[shutdown] timeout — forcing exit')
    process.exit(1)
  }, 10_000).unref()
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
