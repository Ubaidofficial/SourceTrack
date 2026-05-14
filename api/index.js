import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import NodeCache from 'node-cache'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

import { defaultLimit, trackLimit } from './middleware/rate-limit.js'
import { validateSiteKey } from './middleware/auth.js'
import { requireSiteMembership } from './middleware/auth.js'
import { detectAIPlatform } from './middleware/ai-platform.js'
import { track } from './routes/track.js'
import { identify } from './routes/identify.js'
import { conversion } from './routes/conversion.js'
import { conversionOffline } from './routes/conversion-offline.js'
import { attribution, attributionExplain } from './routes/attribution.js'
import { journey } from './routes/journey.js'
import { aiChatRouter } from './routes/ai-chat.js'
import { installRouter } from './routes/install.js'
import { eventsRouter } from './routes/events.js'
import { cohortsRouter } from './routes/cohorts.js'
import { alertsRouter } from './routes/alerts.js'
import { hygieneRouter } from './routes/hygiene.js'
import { exportRouter } from './routes/export.js'
import { onboardingRouter } from './routes/onboarding.js'
import { dashboardRouter } from './routes/dashboard.js'
import { aiAnalyticsRouter } from './routes/ai-analytics.js'
import { leadsRouter } from './routes/leads-server.js'
import { campaignsRouter } from './routes/campaigns.js'
import { integrationsRouter } from './routes/integrations.js'
import { adminRouter } from './routes/admin.js'
import { savedReportsRouter } from './routes/saved-reports.js'
import { requireUserAuth } from './middleware/user-auth.js'
import { billingWebhookHandler, billingRouter } from './routes/billing.js'
import { sessionsOverview, visitorSessions } from './routes/sessions.js'

const app = express()

// Session 70 hard CORS fix for pixel API routes
app.use((req, res, next) => {
  const isPixelRoute =
    req.path === '/api/track' ||
    req.path === '/track' ||
    req.path.includes('/tracking') ||
    req.path.includes('/pageview') ||
    req.path.includes('/tracker');

  if (isPixelRoute) {
    res.header('Access-Control-Allow-Origin', '*');
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
// Session 70 global pixel CORS fix
app.use((req, res, next) => {
  if (
    req.path.includes('/track') ||
    req.path.includes('/pageview') ||
    req.path.includes('/tracking') ||
    req.path.includes('/tracker')
  ) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});
const PORT = process.env.PORT || 3000

if (!process.env.POSTHOG_API_KEY) {
  console.error('FATAL: POSTHOG_API_KEY is not set')
  process.exit(1)
}
if (!process.env.POSTHOG_PERSONAL_API_KEY) {
  console.error('FATAL: POSTHOG_PERSONAL_API_KEY is not set')
  process.exit(1)
}
if (!process.env.POSTHOG_PROJECT_ID) {
  console.error('FATAL: POSTHOG_PROJECT_ID is not set')
  process.exit(1)
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: WebSocket } }
)

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

  const hostname = await getOriginDomain(origin)
  if (!hostname) return false

  if (allowedOrigins.includes(hostname)) return true

  const cached = domainCache.get(hostname)
  if (cached !== undefined) return cached

  try {
    const { data } = await supabase
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

// 1. helmet
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

// 1b. Static tracker files (before body parsing, public)

// Allow SourceTrack pixel assets to load on customer websites

// Root alias required by tracker/loader.min.js
app.get('/tracker.min.js', (req, res) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.type('application/javascript')
  res.sendFile(process.cwd() + '/tracker/tracker.min.js')
})

app.use('/tracker', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  res.setHeader('Access-Control-Allow-Origin', '*')
  next()
})

app.use('/tracker', express.static('tracker'))

// 2. Stripe webhook (MUST be before express.json)
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingWebhookHandler)

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
app.use('/api/track', trackLimit)

// 6. Routes
app.post('/api/track', validateSiteKey, detectAIPlatform, track)
app.post('/api/collect', validateSiteKey, detectAIPlatform, track)
app.options('/api/collect', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
  return res.status(200).send('OK')
})
app.post('/api/identify', validateSiteKey, identify)
app.post('/api/conversion', validateSiteKey, detectAIPlatform, conversion)
app.post('/api/conversion/offline', validateSiteKey, conversionOffline)
app.get('/api/attribution', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, attribution)
app.get('/api/attribution/explain', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, attributionExplain)
app.get('/api/journey/:visitorId', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, journey)
app.use('/api/ai-chat', requireUserAuth, validateSiteKey, requireSiteMembership, aiChatRouter)
app.use('/api/install', requireUserAuth, installRouter)
app.use('/api/events', requireUserAuth, validateSiteKey, requireSiteMembership, eventsRouter)
app.use('/api/cohorts', requireUserAuth, validateSiteKey, requireSiteMembership, cohortsRouter)
app.use('/api/alerts', requireUserAuth, validateSiteKey, requireSiteMembership, alertsRouter)
app.use('/api/hygiene', requireUserAuth, validateSiteKey, requireSiteMembership, hygieneRouter)
app.use('/api/export', requireUserAuth, validateSiteKey, requireSiteMembership, exportRouter)
app.use('/api/onboarding', requireUserAuth, onboardingRouter)
app.use('/api/dashboard', requireUserAuth, validateSiteKey, requireSiteMembership, dashboardRouter)
app.use('/api/ai-analytics', requireUserAuth, validateSiteKey, requireSiteMembership, aiAnalyticsRouter)
app.use('/api/leads', requireUserAuth, validateSiteKey, requireSiteMembership, leadsRouter)
app.use('/api/campaigns', requireUserAuth, validateSiteKey, requireSiteMembership, campaignsRouter)
app.use('/api/integrations', requireUserAuth, validateSiteKey, requireSiteMembership, integrationsRouter)
app.use('/api/server', serverEventsRouter)
app.use('/api/billing', billingRouter)
app.use('/api/admin', requireUserAuth, adminRouter)
app.use('/api/reports', requireUserAuth, validateSiteKey, requireSiteMembership, savedReportsRouter)
app.get('/api/sessions/overview', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, sessionsOverview)
app.get('/api/sessions', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, visitorSessions)

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



// Session 70 root /track alias
// Tracker currently posts to /track, but backend routes are under /api.
app.post('/track', express.json({ limit: '100kb' }), async (req, res) => {
  try {
    const fetch = global.fetch || (await import('node-fetch')).default;

    const response = await fetch('http://localhost:' + (process.env.PORT || 3000) + '/api/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': req.headers.origin || ''
      },
      body: JSON.stringify(req.body || {})
    });

    const text = await response.text();
    res.status(response.status);

    response.headers.forEach((value, key) => {
      if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    try {
      return res.json(JSON.parse(text));
    } catch {
      return res.send(text);
    }
  } catch (err) {
    console.error('Root /track alias failed:', err);
    return res.status(500).json({
      success: false,
      error: 'Track alias failed'
    });
  }
});




app.listen(PORT, () => {
  process.stdout.write(`TrackIQ running on port ${PORT}\n`)
})
