/**
 * T6.2 — Generic Incoming Webhook Receiver
 * Any app that can POST JSON can send conversions here.
 * Use cases: HubSpot deal closed, Calendly booking, GoHighLevel form,
 *            ClickFunnels purchase, any CRM, Zapier, Make, n8n
 *
 * Endpoint: POST /api/webhooks/incoming/:api_key
 * Auth: api_key in URL path (easier for no-code tools than headers)
 */
import express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { ph } from '../lib/posthog.js'
import { createClient } from '@supabase/supabase-js'

const router = express.Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
}

// Field mapping — try common field names from popular platforms
function extractFields(body = {}) {
  // Revenue / value
  const value = parseFloat(
    body.value ?? body.amount ?? body.revenue ?? body.total ??
    body.deal_value ?? body.price ?? body.conversion_value ?? 0
  ) || 0

  // Email
  const email =
    body.email ?? body.contact_email ?? body.customer_email ??
    body.properties?.email ?? body.data?.email ?? null

  // Name
  const name =
    body.name ?? body.full_name ?? body.contact_name ??
    body.properties?.name ?? body.data?.name ?? null

  // Order / event ID for deduplication
  const orderId =
    body.order_id ?? body.deal_id ?? body.event_id ??
    body.id ?? body.booking_id ?? body.submission_id ?? null

  // Conversion type
  const conversionType =
    body.conversion_type ?? body.event_type ?? body.type ??
    body.stage ?? body.status ?? 'webhook'

  // UTM / source
  const utmSource =
    body.utm_source ?? body.source ?? body.properties?.utm_source ?? null
  const utmMedium =
    body.utm_medium ?? body.medium ?? body.properties?.utm_medium ?? null
  const utmCampaign =
    body.utm_campaign ?? body.campaign ?? body.properties?.utm_campaign ?? null

  // Anonymous ID for journey linking
  const anonymousId =
    body.anonymous_id ?? body.visitor_id ?? body.user_id ??
    (email ? `email:${email}` : null) ?? uuidv4()

  return { value, email, name, orderId, conversionType, utmSource, utmMedium, utmCampaign, anonymousId }
}

// POST /api/webhooks/incoming/:api_key
router.post('/:api_key', async (req, res) => {
  try {
    const { api_key } = req.params
    if (!api_key) return res.status(401).json({ error: 'Missing API key' })

    const supabase = getSupabase()

    // Validate API key → get site
    const { data: site } = await supabase
      .from('sites')
      .select('id, site_key, name')
      .eq('api_key', api_key)
      .single()

    if (!site) return res.status(401).json({ error: 'Invalid API key' })

    const body = req.body || {}
    const fields = extractFields(body)

    // Log raw payload for debugging
    console.log(`[webhook-incoming] site=${site.site_key} type=${fields.conversionType} value=${fields.value} order=${fields.orderId}`)

    // Fire conversion event to PostHog
    await ph.capture({
      distinctId: fields.anonymousId,
      event: '$conversion',
      properties: {
        site_id: site.id,
        site_key: site.site_key,
        conversion_value: fields.value,
        conversion_type: fields.conversionType,
        conversion_event_id: fields.orderId || uuidv4(),
        email: fields.email,
        name: fields.name,
        utm_source: fields.utmSource || 'webhook',
        utm_medium: fields.utmMedium || 'webhook',
        utm_campaign: fields.utmCampaign || null,
        webhook_source: req.headers['user-agent'] || 'unknown',
        raw_payload: JSON.stringify(body).slice(0, 500), // store first 500 chars
        server_timestamp: new Date().toISOString(),
      }
    })

    res.json({ ok: true, received: true, conversion_type: fields.conversionType, value: fields.value })
  } catch (err) {
    console.error('[webhook-incoming]', err.message)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// GET /api/webhooks/incoming/test/:api_key — verify endpoint is working
router.get('/test/:api_key', async (req, res) => {
  const supabase = getSupabase()
  const { data: site } = await supabase
    .from('sites')
    .select('id, name, site_key')
    .eq('api_key', req.params.api_key)
    .single()

  if (!site) return res.status(401).json({ error: 'Invalid API key' })
  res.json({
    ok: true,
    site: site.name || site.site_key,
    message: 'Webhook endpoint is active. POST JSON to this URL to record conversions.',
    example_payload: {
      value: 99.00,
      email: 'customer@example.com',
      conversion_type: 'purchase',
      order_id: 'ORD-123',
      utm_source: 'google'
    }
  })
})

export default router
