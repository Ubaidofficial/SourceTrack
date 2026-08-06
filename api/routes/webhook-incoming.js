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
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { getSupabase } from '../lib/supabase.js'
import { resolveWebhookAnonymousId } from '../lib/identity-links.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'
import { redactPiiFromObject } from '../lib/utils.js'
import { dualWriteEvent } from '../../tinybird/adapter/dual-write.js'


const router = express.Router()

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

    const keyHash = crypto.createHash('sha256').update(api_key).digest('hex')
    // Validate API key → get site
    let { data: site } = await supabase
      .from('sites')
      .select('id, site_key, name, plan')
      .eq('api_key_hash', keyHash)
      .maybeSingle()

    if (!site) {
      // Fallback check for plaintext api_key
      const { data: fallbackSite } = await supabase
        .from('sites')
        .select('id, site_key, name, plan')
        .eq('api_key', api_key)
        .maybeSingle()
      site = fallbackSite
    }

    if (!site) return res.status(401).json({ error: 'Invalid API key' })

    if (site.plan === 'inactive' || site.plan === 'archived') {
      const msg = site.plan === 'archived'
        ? 'Site archived after 60 days of inactivity. Reactivate from your dashboard.'
        : 'Subscription inactive'
      return res.status(402).json({ success: false, data: null, error: msg })
    }


    const body = req.body || {}
    const fields = extractFields(body)

    const parsedAnonymousId = body.anonymous_id || null
    const parsedVisitorId   = body.visitor_id || null
    const parsedUserId      = body.user_id || null
    const parsedEmail       = fields.email || null
    const parsedCustomerId  = body.customer_id || body.customerId || null

    const resolved = await resolveWebhookAnonymousId({
      siteId: site.id,
      anonymousId: parsedAnonymousId,
      visitorId: parsedVisitorId,
      userId: parsedUserId,
      email: parsedEmail,
      customerId: parsedCustomerId
    })

    let distinctId
    let stitchingMethod = 'none'

    if (resolved.anonymousId) {
      distinctId = resolved.anonymousId
      stitchingMethod = resolved.source
    } else {
      // Fallback: use explicit browser/user IDs from the payload if present.
      // Do NOT fall back to email as it leaks plaintext PII in distinct_id.
      const fallbackId = parsedAnonymousId || parsedVisitorId || parsedUserId
      if (fallbackId) {
        distinctId = fallbackId
        if (parsedAnonymousId) stitchingMethod = 'payload.anonymous_id'
        else if (parsedVisitorId) stitchingMethod = 'payload.visitor_id'
        else if (parsedUserId) stitchingMethod = 'payload.user_id'
      } else {
        distinctId = `webhook_unattributed:${uuidv4()}`
        stitchingMethod = 'none'
      }
    }

    // Debug line. Identifies the tenant by site_id, NEVER site_key: site_id is the
    // internal identifier, site_key is the customer-facing tracking credential and
    // must not reach logs (§6.5). Same debuggability — site_id joins to `sites` —
    // without putting a live credential in log storage, where retention and access
    // are wider than the code path that produced it.
    console.log(`[webhook-incoming] site_id=${site.id} type=${fields.conversionType} value=${fields.value} order=${fields.orderId} resolved=${resolved.anonymousId ? 'yes' : 'no'}`)

    // Monthly conversion METER (fail-open on DB errors). Metering only — it never
    // refuses the write. This is the generic inbound-webhook rail (ClickFunnels, CRMs,
    // Zapier/Make/n8n): a 402 here made the sender's retry policy decide whether a real
    // purchase survived, and most such senders do not retry a 4xx.
    try {
      await claimConversionUsage(site)
    } catch (limitErr) {
      console.error('[webhook-incoming] Conversion meter failed, continuing (metering must never block revenue):', limitErr.message || limitErr)
    }

    // Fire conversion event to PostHog
    const propertiesObject = {
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
      raw_payload: JSON.stringify(redactPiiFromObject(body)).slice(0, 500), // store first 500 chars after sanitizing
      server_timestamp: new Date().toISOString(),
      stitching_method: stitchingMethod,
      webhook_user_id: parsedUserId,
      webhook_email_present: !!fields.email,
      identity_resolution_source: resolved.source,
      identity_resolution_status: resolved.anonymousId ? 'resolved' : 'unresolved'
    }

    const sanitizedProps = redactPiiFromObject(propertiesObject)

    // Wave-2b cutover: Tinybird is the SOLE writer for this $conversion (ph.capture
    // removed; flag-gated OFF -> no-op + no network when off).
    // Pass the producer's coalesced natural id (fields.orderId) as raw order_id so
    // deriveEventId resolves it (else uuid). NOT conversion_event_id, which bakes in
    // a uuid fallback when orderId is null (per 2b precedence). site_key/email/name
    // in sanitizedProps are dropped by the adapter.
    dualWriteEvent({ distinctId, event: '$conversion', order_id: fields.orderId, properties: sanitizedProps })

    res.json({ ok: true, received: true, conversion_type: fields.conversionType, value: fields.value })
  } catch (err) {
    console.error('[webhook-incoming]', err.message)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// GET /api/webhooks/incoming/test/:api_key — verify endpoint is working
router.get('/test/:api_key', async (req, res) => {
  try {
    const supabase = getSupabase()
    const keyHash = crypto.createHash('sha256').update(req.params.api_key).digest('hex')
    let { data: site } = await supabase
      .from('sites')
      .select('id, name, site_key, plan')
      .eq('api_key_hash', keyHash)
      .maybeSingle()

    if (!site) {
      // Fallback check for plaintext api_key
      const { data: fallbackSite } = await supabase
        .from('sites')
        .select('id, name, site_key, plan')
        .eq('api_key', req.params.api_key)
        .maybeSingle()
      site = fallbackSite
    }

    if (!site) return res.status(401).json({ error: 'Invalid API key' })

    if (site.plan === 'inactive' || site.plan === 'archived') {
      const msg = site.plan === 'archived'
        ? 'Site archived after 60 days of inactivity. Reactivate from your dashboard.'
        : 'Subscription inactive'
      return res.status(402).json({ success: false, data: null, error: msg })
    }
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
  } catch (err) {
    console.error('[webhook-incoming/test]', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
