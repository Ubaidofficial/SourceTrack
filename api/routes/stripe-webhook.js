import Stripe from 'stripe'
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getSupabase } from '../lib/supabase.js'
import { decryptSecret } from '../lib/utils.js'
import { claimIdempotencyKeys, logIngestionEvent, rollbackIdempotencyKeys } from '../lib/idempotency.js'
import { ph } from '../lib/posthog.js'
import { resolveWebhookAnonymousId } from '../lib/identity-links.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'
import { SUBSCRIPTION_EVENTS, mapSubscriptionEvent, buildSubscriptionIdempotencyKeys } from '../lib/stripe-subscription.js'
import { dualWriteEvent } from '../../tinybird/adapter/dual-write.js'



const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'fake_key_for_webhook_sync_construct', {
  apiVersion: '2024-06-20'
})

// Ingest a Stripe subscription-lifecycle event as a $conversion.
//
// STEP 1 scope: ingest + PRESERVE the durable keys (stripe customer_id /
// subscription_id / invoice_id) so step 2's subscription_identity table can
// backfill acquisition attribution. Source attribution is NOT resolved here —
// renewals/invoices carry no anonymous_id and (by decision) email/customer_id
// are not visitor-identity join keys, so when no in-event stitch key is present
// the conversion is marked attribution_status='unknown' and NEVER bucketed to a
// fabricated source (decisions 3/4). Acquisition-locked attribution is applied
// later (step 4) from the preserved keys.
//
// Idempotency: claim → capture → rollback-on-failure, so the claim becomes
// permanent only after the write succeeds (§6.5) and a Stripe retry of a failed
// delivery re-attempts instead of being dropped as a duplicate.
//
// Returns { status, body } for the caller to send.
async function handleSubscriptionEvent(event, site, siteKey) {
  const obj = event.data.object || {}
  const providerEventId = event.id
  const eventType = event.type
  const occurredAt = event.created ? new Date(event.created * 1000).toISOString() : new Date().toISOString()

  const { conversionType, value, currency, customerId, subscriptionId, invoiceId, billingReason, skipReason } = mapSubscriptionEvent(event)

  if (skipReason) {
    return { status: 200, body: { received: true, ignored: true, reason: skipReason } }
  }

  // Identity stitch. client_reference_id is checkout-only, so subscription events
  // can only stitch via explicit metadata IDs; customer_id is preserved but is
  // not a visitor-identity join key today (resolved later in step 2).
  const metadata = obj.metadata || {}
  const resolved = await resolveWebhookAnonymousId({
    siteId: site.id,
    anonymousId: metadata.anonymous_id || null,
    visitorId: metadata.visitor_id || null,
    userId: metadata.sourcetrack_user_id || metadata.site_user_id || null,
    email: null,
    customerId
  })

  let distinctId
  let attributionStatus
  let stitchingMethod = 'none'
  if (resolved.anonymousId) {
    distinctId = resolved.anonymousId
    stitchingMethod = resolved.source
  } else {
    distinctId = `stripe_subscription_unattributed:${subscriptionId || customerId || providerEventId}`
    attributionStatus = 'unknown'
  }

  const keys = buildSubscriptionIdempotencyKeys({ providerEventId, conversionType, invoiceId, subscriptionId })

  const claim = await claimIdempotencyKeys(siteKey, 'stripe', keys)
  if (claim.duplicate) {
    await logIngestionEvent(siteKey, 'stripe', { providerEventId, orderId: invoiceId || subscriptionId, value, currency, status: 'duplicate' })
    return { status: 200, body: { received: true, duplicate: true } }
  }
  if (!claim.success) {
    await logIngestionEvent(siteKey, 'stripe', { providerEventId, orderId: invoiceId || subscriptionId, value, currency, status: 'error', errorMessage: claim.error || 'Failed to claim idempotency keys' })
    return { status: 500, body: { error: 'Temporary processing failure' } }
  }

  try {
    // Monthly conversion-limit gate (fail-open on DB error), mirroring the
    // checkout path. Roll the claim back if blocked so it isn't a silent drop.
    let allowed = true
    try {
      const lc = await claimConversionUsage(site)
      if (!lc.allowed) allowed = false
    } catch (limitErr) {
      console.error('[stripe-webhook] Conversion limit check failed, failing open:', limitErr.message || limitErr)
    }
    if (!allowed) {
      await rollbackIdempotencyKeys(siteKey, 'stripe', keys)
      return { status: 200, body: { success: false, data: null, error: 'Conversion limit reached for your plan', ignored: true } }
    }

    const conversionProperties = {
      site_id: site.id,
      site_key: site.site_key,
      conversion_value: value,
      currency,
      conversion_type: conversionType,
      conversion_event_id: invoiceId || (subscriptionId ? `${subscriptionId}:${conversionType}` : providerEventId),
      provider: 'stripe',
      provider_event_id: providerEventId,
      stripe_event_type: eventType,
      stripe_billing_reason: billingReason,
      occurred_at: occurredAt,
      ingestion_method: 'webhook_stripe',
      stitching_method: stitchingMethod,
      utm_source: 'stripe',
      utm_medium: 'webhook',
      utm_campaign: null,
      first_touch_source: 'stripe',
      first_touch_medium: 'webhook',
      // Durable keys preserved for step 2 (subscription_identity backfill):
      webhook_customer_id: customerId || null,
      stripe_subscription_id: subscriptionId || null,
      stripe_invoice_id: invoiceId || null,
      identity_resolution_source: resolved.source,
      identity_resolution_status: resolved.anonymousId ? 'resolved' : 'unresolved'
    }
    if (attributionStatus) {
      conversionProperties.attribution_status = attributionStatus
    }

    await ph.capture({ distinctId, event: '$conversion', properties: conversionProperties })

    // Additive Tinybird dual-write (flag-gated OFF; no-op + no network when off).
    // Subscription path: reached only after signature verify, the persistent claim
    // duplicate-skip, and plan-limit returned — a duplicate the claim skips never
    // dual-writes. deriveEventId resolves stripe_invoice_id (branch 3) else
    // stripe_subscription_id:type (branch 4) from props; NOT conversion_event_id.
    dualWriteEvent({ distinctId, event: '$conversion', timestamp: occurredAt, properties: conversionProperties })

    await logIngestionEvent(siteKey, 'stripe', { providerEventId, orderId: invoiceId || subscriptionId, value, currency, status: 'success' })
    return { status: 200, body: { received: true } }
  } catch (err) {
    // Release the claim so Stripe's retry re-attempts instead of dropping.
    try { await rollbackIdempotencyKeys(siteKey, 'stripe', keys) } catch (_) { /* best-effort */ }
    console.error('[stripe-webhook] Subscription event capture failed:', err.message)
    await logIngestionEvent(siteKey, 'stripe', { providerEventId, orderId: invoiceId || subscriptionId, value, currency, status: 'error', errorMessage: err.message || 'PostHog capture failed' })
    return { status: 500, body: { error: 'Temporary processing failure' } }
  }
}

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

  // 4b. Block inactive / archived sites
  if (site.plan === 'inactive' || site.plan === 'archived') {
    const msg = site.plan === 'archived'
      ? 'Site archived after 60 days of inactivity. Reactivate from your dashboard.'
      : 'Subscription inactive'
    return res.status(402).json({ success: false, data: null, error: msg })
  }


  // 5. Route supported event types. Subscription lifecycle (renewals, trials,
  // upgrades, cancellations) goes to the recurring handler; one-shot checkouts
  // use the existing path below; everything else is ignored with a safe 200.
  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    const r = await handleSubscriptionEvent(event, site, siteKey)
    return res.status(r.status).json(r.body)
  }
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
  const resolved = await resolveWebhookAnonymousId({
    siteId: site.id,
    anonymousId: metadata.anonymous_id || null,
    visitorId: metadata.visitor_id || null,
    userId: metadata.sourcetrack_user_id || metadata.site_user_id || session.client_reference_id || null,
    email: session.customer_details?.email || null,
    customerId: session.customer || null
  })

  let distinctId
  let attributionStatus = undefined
  let stitchingMethod = 'none'

  if (resolved.anonymousId) {
    distinctId = resolved.anonymousId
    stitchingMethod = resolved.source
  } else {
    const stitchingId = session.client_reference_id ||
      metadata.anonymous_id ||
      metadata.visitor_id ||
      metadata.sourcetrack_user_id ||
      metadata.site_user_id ||
      null

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
      first_touch_medium: 'webhook',
      webhook_user_id: metadata.sourcetrack_user_id || metadata.site_user_id || session.client_reference_id || null,
      webhook_customer_id: session.customer || null,
      webhook_email_present: !!session.customer_details?.email,
      identity_resolution_source: resolved.source,
      identity_resolution_status: resolved.anonymousId ? 'resolved' : 'unresolved'
    }

    if (attributionStatus) {
      conversionProperties.attribution_status = attributionStatus
    }

    // Enforce monthly conversion limits (fail-open on DB errors)
    let limitCheckAllowed = true
    try {
      const limitCheck = await claimConversionUsage(site)
      if (!limitCheck.allowed) {
        limitCheckAllowed = false
      }
    } catch (limitErr) {
      console.error('[stripe-webhook] Conversion limit check failed, failing open:', limitErr.message || limitErr)
    }

    if (!limitCheckAllowed) {
      try {
        await rollbackIdempotencyKeys(siteKey, 'stripe', keys)
      } catch (rollbackErr) {
        console.error('[stripe-webhook] Failed to rollback idempotency keys after conversion limit block:', rollbackErr.message || rollbackErr)
      }
      return res.status(200).json({
        success: false,
        data: null,
        error: 'Conversion limit reached for your plan',
        ignored: true
      })
    }

    await ph.capture({
      distinctId,
      event: '$conversion',
      properties: conversionProperties
    })

    // Additive Tinybird dual-write (flag-gated OFF; no-op + no network when off).
    // Checkout path: reached only after signature verify, the persistent claim
    // duplicate-skip (:285), and plan-limit returned. deriveEventId resolves order_id
    // (= session.id, branch 5) from props; NOT conversion_event_id.
    // NOTE: a subscription-mode checkout ALSO emits an invoice.paid $conversion — the
    // known double-count. Mirrored here as-is and ACCEPTABLE (flag OFF, nothing emits);
    // Phase 5c adds the session.mode suppression before the flag ever flips.
    dualWriteEvent({ distinctId, event: '$conversion', timestamp: occurredAt, properties: conversionProperties })

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
