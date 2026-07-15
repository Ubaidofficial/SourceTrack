import Stripe from 'stripe'
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getSupabase } from '../lib/supabase.js'
import { decryptSecret } from '../lib/utils.js'
import { claimIdempotencyKeys, logIngestionEvent, rollbackIdempotencyKeys } from '../lib/idempotency.js'
import { resolveWebhookAnonymousId } from '../lib/identity-links.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'
import { SUBSCRIPTION_EVENTS, mapSubscriptionEvent, buildSubscriptionIdempotencyKeys, checkoutConversionValue } from '../lib/stripe-subscription.js'
import { REFUND_EVENT_TYPE, buildRefundIdempotencyKeys, buildRefundConversion } from '../lib/stripe-refund.js'
import { writeConversionDirect } from '../../tinybird/adapter/conversion-write.js'



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

    // Wave-1 revenue cutover: Tinybird is the SOLE writer for $conversion, and this is
    // the MONEY PATH — a DIRECT, AWAITED, RETRIED write (NOT the fire-and-forget batcher,
    // whose enqueue resolves before the Tinybird ack: batch.js:90/94). On failure it
    // THROWS, so the catch below rolls the idempotency claim back and returns 500 →
    // Stripe redelivers (the recovery path). Flag-OFF → skip (no-op, no network). Reached
    // only after the claim succeeded (claim→rollback-on-fail).
    await writeConversionDirect({ distinctId, event: '$conversion', properties: conversionProperties })
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

// Ingest a Stripe refund.created event as a compensating SIGNED $conversion
// (negative conversion_value), so a signed-sum revenue MV nets it against the
// original purchase (SCOPE_v3 §9). TINYBIRD-ONLY (founder decision Q1=A): NOT
// ph.capture'd and NOT written to Supabase attributed_conversions.
//
// Identical to handleSubscriptionEvent (claim → write → rollback-on-failure →
// logIngestionEvent) EXCEPT: (a) uses the refund helpers with their refund-specific
// idempotency keys (provider_event_id + refund_id — NEVER order_id/payment_id,
// which collide with the purchase's claim) and event_id=re_… dedup stamp; (b) SKIPS
// the conversion-limit gate — a refund must never consume the customer's monthly
// conversion quota; (c) validates the refund amount up front (buildRefundConversion
// throws on an invalid amount, so a malformed refund is acked with 200 + logged
// rather than 500-looped by Stripe forever).
//
// Returns { status, body } for the caller to send.
async function handleRefundEvent(event, site, siteKey) {
  const providerEventId = event.id
  const refund = event?.data?.object || {}

  // Amount validation up front. 200 (not 500) so Stripe does NOT retry a malformed
  // refund forever. buildRefundConversion throws on an invalid amount — guard here.
  const amount = Number(refund.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { status: 200, body: { received: true, ignored: true, reason: 'invalid refund amount' } }
  }

  const keys = buildRefundIdempotencyKeys(event)
  if (keys.length === 0) {
    return { status: 200, body: { received: true, ignored: true, reason: 'no refund idempotency key' } }
  }

  // Idempotency: claim → write → rollback-on-failure, so the claim is permanent only
  // after the write succeeds (§6.5) and a Stripe retry re-attempts rather than dropping.
  const claim = await claimIdempotencyKeys(siteKey, 'stripe', keys)
  if (claim.duplicate) {
    await logIngestionEvent(siteKey, 'stripe', { providerEventId, orderId: providerEventId, value: null, currency: null, status: 'duplicate' })
    return { status: 200, body: { received: true, duplicate: true } }
  }
  if (!claim.success) {
    await logIngestionEvent(siteKey, 'stripe', { providerEventId, orderId: providerEventId, value: null, currency: null, status: 'error', errorMessage: claim.error || 'Failed to claim idempotency keys' })
    return { status: 500, body: { error: 'Temporary processing failure' } }
  }

  // NO claimConversionUsage gate — a refund must NOT consume the monthly quota.

  const { distinctId, value, currency, properties } = buildRefundConversion(event, site)

  try {
    // MONEY PATH (Wave-1): Tinybird is the SOLE writer — DIRECT, AWAITED, RETRIED.
    // properties.conversion_value is NEGATIVE; properties.event_id = refund.id (re_…),
    // the dedup stamp that keeps this distinct from the purchase's order_id-derived id.
    // On failure it THROWS → the catch rolls the claim back and returns 500 → Stripe redelivers.
    await writeConversionDirect({ distinctId, event: '$conversion', properties })
    await logIngestionEvent(siteKey, 'stripe', { providerEventId, orderId: properties.provider_event_id, value, currency, status: 'success' })
    return { status: 200, body: { received: true } }
  } catch (err) {
    // Release the claim so Stripe's retry re-attempts instead of dropping.
    try { await rollbackIdempotencyKeys(siteKey, 'stripe', keys) } catch (_) { /* best-effort */ }
    console.error('[stripe-webhook] Refund event capture failed:', err.message)
    await logIngestionEvent(siteKey, 'stripe', { providerEventId, orderId: properties.provider_event_id, value, currency, status: 'error', errorMessage: err.message || 'Refund conversion write failed' })
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
  // Refunds: compensating SIGNED (negative) $conversion — Tinybird-only (§9).
  if (event.type === REFUND_EVENT_TYPE) {
    const r = await handleRefundEvent(event, site, siteKey)
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
      // Phase 5c: a subscription-mode checkout contributes $0 (subscription revenue
      // counts ONCE, on invoice.paid) — but the event is still emitted with full
      // customer_id + client_reference_id stitch so nightly seeds subscription_identity.
      // One-time (payment-mode) checkout keeps its full value. (The audit log below
      // still records the real `value`.)
      // Carrier stays 'purchase' because moving it off would drop subscription
      // signups from the customers metric (classifyConversionType: only
      // 'purchase'/'closed_won' = customer). PREVIOUSLY a known limitation (raw
      // conversions count inflated by 1/signup, revenue/customers unaffected) — as
      // of Phase 7 this carrier is excluded from conversion-COUNT aggregates by
      // isSubscriptionCheckoutCarrier (stripe-subscription.js) at both read sites
      // (nightly-attribution.js processSite, attribution-engine.js
      // getMultiTouchAttributionLive); historical rows are not backfilled (fix-forward
      // only, count-only impact — see tinybird/PHASE7_ATTRIBUTED_CONVERSIONS_DOUBLE_UPSERT_PROPOSAL.md).
      conversion_value: checkoutConversionValue(session.mode, value),
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
      // Phase 7: forward Stripe's own session.subscription. Present only for a
      // subscription-mode checkout (never for one-time/payment-mode) — this is what
      // lets isSubscriptionCheckoutCarrier (stripe-subscription.js) tell a genuine
      // $0 subscription-mode carrier apart from a fully-discounted one-time $0
      // checkout, which would otherwise look identical on every other field.
      stripe_subscription_id: session.subscription || null,
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

    // Wave-1 revenue cutover: Tinybird is the SOLE writer for $conversion, and this is
    // the MONEY PATH — a DIRECT, AWAITED, RETRIED write (NOT the fire-and-forget batcher,
    // whose enqueue resolves before the Tinybird ack: batch.js:90/94). On failure it
    // THROWS, so the catch below rolls the idempotency claim back and returns 500 →
    // Stripe redelivers (the recovery path). Flag-OFF → skip (no-op, no network). Reached
    // only after the claim succeeded (claim→rollback-on-fail).
    await writeConversionDirect({ distinctId, event: '$conversion', properties: conversionProperties })

    await logIngestionEvent(siteKey, 'stripe', {
      providerEventId,
      orderId: orderId || paymentId,
      value,
      currency,
      status: 'success'
    })

    return res.status(200).json({ received: true })
  } catch (phErr) {
    // Roll the idempotency claim back so Stripe's redelivery re-attempts instead of
    // being skipped as a duplicate — the recovery path for a failed $conversion write.
    // (Previously absent here: a failed write returned 500 with the claim still held,
    // so redelivery hit claim.duplicate and the revenue event was lost forever.)
    try { await rollbackIdempotencyKeys(siteKey, 'stripe', keys) } catch (_) { /* best-effort */ }
    console.error('[stripe-webhook] $conversion ingestion failed:', phErr.message)
    await logIngestionEvent(siteKey, 'stripe', {
      providerEventId,
      orderId: orderId || paymentId,
      value,
      currency,
      status: 'error',
      errorMessage: phErr.message || 'Conversion write failed'
    })
    return res.status(500).json({ error: 'Temporary processing failure' })
  }
})

export { router as stripeWebhookRouter }
