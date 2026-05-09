import 'dotenv/config'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import NodeCache from 'node-cache'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

import { defaultLimit, trackLimit } from './middleware/rate-limit.js'
import { validateSiteKey } from './middleware/auth.js'
import { detectAIPlatform } from './middleware/ai-platform.js'
import { track } from './routes/track.js'
import { identify } from './routes/identify.js'
import { conversion } from './routes/conversion.js'
import { attribution } from './routes/attribution.js'
import { journey } from './routes/journey.js'
import { aiChatRouter } from './routes/ai-chat.js'
import { installRouter } from './routes/install.js'
import { eventsRouter } from './routes/events.js'
import { cohortsRouter } from './routes/cohorts.js'
import { alertsRouter } from './routes/alerts.js'
import { hygieneRouter } from './routes/hygiene.js'
import { exportRouter } from './routes/export.js'
import { billingWebhookHandler, billingRouter } from './routes/billing.js'

const app = express()
const PORT = process.env.PORT || 3000

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
app.use(helmet())

// 1b. Static tracker files (before body parsing, public)
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
app.post('/api/identify', validateSiteKey, identify)
app.post('/api/conversion', validateSiteKey, detectAIPlatform, conversion)
app.get('/api/attribution', validateSiteKey, defaultLimit, attribution)
app.get('/api/journey/:visitorId', validateSiteKey, defaultLimit, journey)
app.use('/api/ai-chat', aiChatRouter)
app.use('/api/install', installRouter)
app.use('/api/events', eventsRouter)
app.use('/api/cohorts', cohortsRouter)
app.use('/api/alerts', alertsRouter)
app.use('/api/hygiene', hygieneRouter)
app.use('/api/export', exportRouter)
app.use('/api/billing', billingRouter)

// 7. Health check
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 8. Global error handler
app.use((_err, _req, res, _next) => {
  res.status(500).json({ success: false, data: null, error: 'Internal server error' })
})

app.listen(PORT, () => {
  process.stdout.write(`TrackIQ running on port ${PORT}\n`)
})
