import Stripe from 'stripe'
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getSupabase } from '../lib/supabase.js'
import { decryptSecret } from '../lib/utils.js'
import { claimIdempotencyKeys, logIngestionEvent } from '../lib/idempotency.js'
import { ph } from '../lib/posthog.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'fake_key_for_webhook_sync_construct', {
  apiVersion: '2024-06-20'
})

const router = Router()

router.post('/:site_key', async (req, res) => {
  const { site_key: siteKey } = req.params

  if (!siteKey) {
    return res.status(400).json({ error: 'Missing site_key' })
  }

  // 1. Confirm req.body is a Buffer (raw request body is required for Stripe signature verification)
  if (!Buffer.isBuffer(req.body)) {
    console.error('[stripe-webhook] Error: req.body is not a Buffer. Check middleware configuration.')
    return res.status(500).json({ error: 'Internal configuration error: raw body middleware required' })
  }

  let site = null
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('sites')
      .select('id, site_key, encrypted_stripe_webhook_secret, plan')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (error) throw error
    site = data
  } catch (dbErr) {
    console.error('[stripe-webhook] Database site lookup failed:', dbErr.message)
    return res.status(500).json({ error: 'Internal database error' })
  }

  // 2. Require unknown site / missing configured secret rejected with 404 or 400
  if (!site || !site.encrypted_stripe_webhook_secret) {
    return res.status(404).json({ error: 'Site not found or Stripe sync not configured' })
  }

  // 3. Decrypt the secret
  let decryptedSecret
  try {
    decryptedSecret = decryptSecret(site.encrypted_stripe_webhook_secret)
  } catch (decErr) {
    console.error('[stripe-webhook] Webhook secret decryption failed:', decErr.message)
    return res.status(500).json({ error: 'Failed to process webhook configurations' })
  }

  // 4. Verify Stripe signature using raw request body and stripe-signature header
  const sig = req.headers['stripe-signature']
  if (!sig) {
    return res.status(400).json({ error: 'Missing stripe-signature header' })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, decryptedSecret)
  } catch (err) {
    console.error('[stripe-webhook] Signature verification error:', err.message)
    return res.status(400).json({ error: `Invalid webhook signature: ${err.message}` })
  }

  // 5. Support only explicit event types, ignore unsupported event types with safe 200 response
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: true, reason: `Event type ${event.type} ignored` })
  }

  const session = event.data.object
  const providerEventId = event.id
  const orderId = session.id || null
  const paymentId = session.payment_intent || null
  const value = session.amount_total ? (session.amount_total / 100) : 0
  const currency = session.currency ? session.currency.toUpperCase() : 'USD'
  const eventType = event.type
  const occurredAt = event.created ? new Date(event.created * 1000).toISOString() : new Date().toISOString()

  // 6. Metadata/client_reference_id stitching logic
  const metadata = session.metadata || {}
  const stitchingId = session.client_reference_id ||
    metadata.anonymous_id ||
    metadata.visitor_id ||
    metadata.sourcetrack_user_id ||
    metadata.site_user_id ||
    null

  let distinctId
  let attributionStatus = undefined
  let stitchingMethod = 'none'

  if (stitchingId) {
    distinctId = stitchingId
    if (session.client_reference_id === stitchingId) {
      stitchingMethod = 'client_reference_id'
    } else if (metadata.anonymous_id === stitchingId) {
      stitchingMethod = 'metadata.anonymous_id'
    } else if (metadata.visitor_id === stitchingId) {
      stitchingMethod = 'metadata.visitor_id'
    } else if (metadata.sourcetrack_user_id === stitchingId) {
      stitchingMethod = 'metadata.sourcetrack_user_id'
    } else if (metadata.site_user_id === stitchingId) {
      stitchingMethod = 'metadata.site_user_id'
    }
  } else {
    // If no explicit metadata/client_reference_id exists, mark as unattributed
    distinctId = `stripe_unattributed:${session.id || uuidv4()}`
    attributionStatus = 'unattributed'
    stitchingMethod = 'none'
  }

  // 7. Dedupe / Idempotency handling
  const keys = [
    { key_type: 'provider_event_id', key_value: providerEventId }
  ]
  if (orderId) {
    keys.push({ key_type: 'order_id', key_value: orderId })
  }
  if (paymentId) {
    keys.push({ key_type: 'payment_id', key_value: paymentId })
  }

  const claim = await claimIdempotencyKeys(siteKey, 'stripe', keys)

  if (claim.duplicate) {
    console.log(`[stripe-webhook] Duplicate Stripe event ${providerEventId} for site ${siteKey} — skipping ingestion`)
    await logIngestionEvent(siteKey, 'stripe', {
      providerEventId,
      orderId: orderId || paymentId,
      value,
      currency,
      status: 'duplicate'
    })
    return res.status(200).json({ received: true, duplicate: true })
  }

  if (!claim.success) {
    console.error(`[stripe-webhook] Idempotency DB claim error for site ${siteKey}:`, claim.error)
    await logIngestionEvent(siteKey, 'stripe', {
      providerEventId,
      orderId: orderId || paymentId,
      value,
      currency,
      status: 'error',
      errorMessage: claim.error || 'Failed to claim idempotency keys in database'
    })
    return res.status(500).json({ error: 'Temporary processing failure' })
  }

  // 8. Ingest conversion and log success
  try {
    const conversionProperties = {
      site_id: site.id,
      site_key: site.site_key,
      conversion_value: value,
      currency,
      conversion_type: 'purchase',
      conversion_event_id: orderId || paymentId || providerEventId,
      order_id: orderId,
      payment_id: paymentId,
      provider: 'stripe',
      provider_event_id: providerEventId,
      stripe_event_type: eventType,
      occurred_at: occurredAt,
      ingestion_method: 'webhook_stripe',
      stitching_method: stitchingMethod,
      utm_source: 'stripe',
      utm_medium: 'webhook',
      utm_campaign: null,
      first_touch_source: 'stripe',
      first_touch_medium: 'webhook'
    }

    if (attributionStatus) {
      conversionProperties.attribution_status = attributionStatus
    }

    await ph.capture({
      distinctId,
      event: '$conversion',
      properties: conversionProperties
    })

    await logIngestionEvent(siteKey, 'stripe', {
      providerEventId,
      orderId: orderId || paymentId,
      value,
      currency,
      status: 'success'
    })

    return res.status(200).json({ received: true })
  } catch (phErr) {
    console.error('[stripe-webhook] PostHog capture conversion ingestion failed:', phErr.message)
    await logIngestionEvent(siteKey, 'stripe', {
      providerEventId,
      orderId: orderId || paymentId,
      value,
      currency,
      status: 'error',
      errorMessage: phErr.message || 'PostHog capture failed'
    })
    return res.status(500).json({ error: 'Temporary processing failure' })
  }
})

export { router as stripeWebhookRouter }
