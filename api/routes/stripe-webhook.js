import Stripe from 'stripe'
import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getSupabase } from '../lib/supabase.js'
import { decryptSecret } from '../lib/utils.js'
import { claimIdempotencyKeys, logIngestionEvent, rollbackIdempotencyKeys } from '../lib/idempotency.js'
import { resolveWebhookAnonymousId } from '../lib/identity-links.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'
import { SUBSCRIPTION_EVENTS, mapSubscriptionEvent, buildSubscriptionIdempotencyKeys, checkoutConversionValue } from '../lib/stripe-subscription.js'
import { REFUND_EVENT_TYPE, CHARGE_REFUNDED_EVENT_TYPE, buildRefundIdempotencyKeys, buildRefundConversion, resolveOriginalDistinctId, extractChargeRefunds } from '../lib/stripe-refund.js'
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
    // Monthly conversion METER (fail-open on DB error). Metering only — it never
    // refuses the write. This block used to roll the idempotency claim back and return
    // HTTP 200 at the cap: Stripe reads 2xx as delivered and never retries, and the
    // released claim meant no record survived anywhere, so a real customer purchase was
    // destroyed while we reported success. THE ACK RULE now governs this handler — we
    // never return 2xx for an event we did not persist — so the only 2xx below is the
    // one after a successful write, and a genuine write failure still rolls the claim
    // back and returns 500 for redelivery (see the catch at the end of this function).
    try {
      await claimConversionUsage(site)
    } catch (limitErr) {
      console.error('[stripe-webhook] Conversion meter failed, continuing (metering must never block revenue):', limitErr.message || limitErr)
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
    await logIngestionEvent(siteKey, 'stripe', { providerEventId, orderId: invoiceId || subscriptionId, value, currency, status: 'error', errorMessage: err.message || 'event ingestion failed' })
    return { status: 500, body: { error: 'Temporary processing failure' } }
  }
}

// Ingest a Stripe refund.created event as a compensating SIGNED $conversion
// (negative conversion_value), so a signed-sum revenue MV nets it against the
// original purchase (SCOPE_v3 §9).
//
// FACTUAL CORRECTION (PR3): this block used to say refunds are "TINYBIRD-ONLY … NOT
// written to Supabase attributed_conversions". That is STALE — #240 made the nightly
// PERSIST refunds (nightly-attribution.js:720 skips negatives EXCEPT
// conversion_type='refund'), keyed conversion_event_id = the Tinybird event_id, under
// UNIQUE(site_id, conversion_event_id). The webhook still writes only to Tinybird; the
// refund reaches Supabase via the nightly. This matters for dedup: BOTH stores key off
// the same re_… id, which is why one refund cannot become two rows in either.
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
  return ingestOneRefund({
    refund: event?.data?.object || {},
    event,
    site,
    siteKey,
    keys: buildRefundIdempotencyKeys(event),
    stripeEventType: REFUND_EVENT_TYPE
  })
}

// PR3: `charge.refunded` — the SAME refund Stripe already announced via refund.created.
// Subscribed as a SAFETY NET (a refund.created that is never delivered still nets), which
// makes dedup the whole job. It is NOT a second refund code path: it descends to the
// individual Refund objects and hands each to the SAME ingestOneRefund() the
// refund.created path uses, so resolution/build/write/rollback stay identical.
//
// TWO things this must get right, both verified against the Stripe Charge type:
//   1. data.object is a CHARGE. `charge.amount` is the ORIGINAL total, not the refunded
//      amount — feeding the charge straight in would net the full charge on a partial
//      refund. So we use charge.refunds.data[] and each Refund's OWN amount.
//   2. `charge.id` is ch_…, which would produce a DIFFERENT idempotency key AND a
//      different Tinybird event_id than refund.created's re_… → double-write. Keying on
//      each refund's re_… is what collapses the two events into one row.
//
// KEYS: refund_id (re_…) ONLY — deliberately dropping the provider_event_id key that
// refund.created claims. Two reasons: (a) re_… is the ONLY key that dedups ACROSS the two
// event types (the evt_… ids differ by construction), so it is the one doing the work;
// (b) a charge.refunded carrying N refunds would claim the SAME evt_… N times and
// self-collide — the claim is all-or-nothing (claim_revenue_idempotency_keys returns
// false on ANY unique_violation), so refunds 2..N would be wrongly dropped as duplicates.
async function handleChargeRefundedEvent(event, site, siteKey) {
  const refunds = extractChargeRefunds(event)
  if (refunds.length === 0) {
    // No expandable refunds on the payload (`refunds` is optional/nullable on Charge).
    // We ACK 200 and write NOTHING: the only id available here is ch_…, the exact key
    // that double-writes against refund.created, and a 500 would make Stripe retry an
    // array it is never going to materialise.
    //
    // BUT THIS MUST BE LOUD, NOT SILENT (§45 silent-success class). A merchant who
    // subscribed ONLY charge.refunded and NOT refund.created would otherwise get zero
    // refund netting forever, acked 200 every time — indistinguishable from "no refunds
    // happened", while their attributed revenue silently overstates by the return rate.
    // On modern API versions this is the DEFAULT shape, not an edge case: Stripe's
    // 2024-10-28 Acacia release stopped auto-expanding Charge.refunds and states refund
    // details are NOT available on charge.refunded, directing integrators to
    // refund.created (the same change broke refund webhooks in woocommerce-gateway-stripe
    // #2497 and Drupal Commerce #3407873 with a null refunds array).
    const chargeId = event?.data?.object?.id || 'unknown'
    console.warn(
      `[stripe-webhook] charge.refunded ${event.id} for charge ${chargeId} carried NO ` +
      `expandable refunds[] — NOTHING WRITTEN, this refund is NOT netted by this event. ` +
      `Charge.refunds is not auto-expanded on modern Stripe API versions. If this site is ` +
      `not also subscribed to '${REFUND_EVENT_TYPE}', its refunds are going UNRECORDED and ` +
      `its attributed revenue is overstated — subscribe '${REFUND_EVENT_TYPE}' (the primary ` +
      `refund path).`
    )
    return {
      status: 200,
      body: {
        received: true,
        ignored: true,
        reason: 'no refund objects on charge payload',
        // Surfaced in the response too, so the Stripe dashboard's delivery log shows the
        // remedy rather than a bare success.
        action_required: `Subscribe ${REFUND_EVENT_TYPE} — Charge.refunds is not expanded on this API version, so charge.refunded alone cannot net refunds.`
      }
    }
  }

  // Each refund is its own unit of work with its own claim, so a charge carrying an
  // ALREADY-INGESTED refund plus a NEW one writes exactly the new one.
  let written = 0, duplicate = 0, ignored = 0
  for (const refund of refunds) {
    const r = await ingestOneRefund({
      refund,
      event,
      site,
      siteKey,
      keys: [{ key_type: 'refund_id', key_value: refund.id }],
      stripeEventType: CHARGE_REFUNDED_EVENT_TYPE
    })
    // Any hard failure → 500 so Stripe redelivers the whole charge event. Refunds already
    // committed on the first attempt dedup on the retry, so the redelivery is safe.
    if (r.status >= 500) return r
    if (r.body?.duplicate) duplicate++
    else if (r.body?.ignored) ignored++
    else written++
  }
  return { status: 200, body: { received: true, refunds_written: written, refunds_duplicate: duplicate, refunds_ignored: ignored } }
}

// The SINGLE refund ingestion path, shared by refund.created and charge.refunded.
// `refund` is always an individual Stripe Refund object (re_…); `event` is the envelope
// it arrived in (used for event.id / event.created only).
async function ingestOneRefund({ refund: rawRefund, event, site, siteKey, keys, stripeEventType }) {
  const providerEventId = event.id
  const refund = rawRefund || {}

  // Amount validation up front. 200 (not 500) so Stripe does NOT retry a malformed
  // refund forever. buildRefundConversion throws on an invalid amount — guard here.
  const amount = Number(refund.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { status: 200, body: { received: true, ignored: true, reason: 'invalid refund amount' } }
  }

  if (!Array.isArray(keys) || keys.length === 0) {
    return { status: 200, body: { received: true, ignored: true, reason: 'no refund idempotency key' } }
  }

  // Every downstream helper reads the Refund off event.data.object, so wrap this ONE
  // refund in an envelope carrying the real event's id/created. For refund.created this
  // is byte-identical to the original event.
  const refundEvent = { id: event.id, created: event.created, type: stripeEventType, data: { object: refund } }

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

  // Phase 7 PR1: resolve the refund to its original conversion (by payment_intent,
  // then stripe_invoice_id) and inherit the ORIGINAL's distinct_id — so the nightly
  // rebuilds the refund's Supabase attribution from the real visitor's touchpoints
  // and it nets against the acquiring source (not 'stripe'/'direct'). DEGRADED PATH
  // (§requirement): a miss OR a Tinybird failure NEVER drops the refund and NEVER
  // silently writes today's phantom — it keeps the phantom distinct_id AND stamps
  // attribution_status='refund_unresolved' so the gap is queryable. resolve* never
  // throws (returns 'unavailable' on a null read), so this cannot break the write.
  // payment_intent is the ONLY join key (Stripe Refund has no `invoice`; purchase
  // stores payment_id=session.payment_intent). A subscription-mode refund with no
  // payment_intent resolves as refund_unresolved — Invoice Payment lookup deferred.
  const resolution = await resolveOriginalDistinctId({
    paymentId: refund.payment_intent || null,
    siteId: site.id
  })
  const resolved = resolution.status === 'resolved'
  if (!resolved) {
    console.warn(`[stripe-webhook] refund ${refund.id} attribution ${resolution.status} ` +
      `(payment_intent=${refund.payment_intent || 'null'}) ` +
      `— writing with phantom distinct_id + attribution_status=refund_unresolved`)
  }
  const { distinctId, value, currency, properties } = buildRefundConversion(
    refundEvent, site, resolved ? resolution.distinctId : undefined,
    // KI-62: carry the resolved original's conversion_event_id onto the refund event
    // (undefined when unresolved → no pointer stamped).
    { unresolved: !resolved, stripeEventType, originalConversionEventId: resolution.originalConversionEventId }
  )

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
  // Refunds: compensating SIGNED (negative) $conversion (§9). Stripe emits BOTH
  // refund.created AND charge.refunded for the SAME refund; both are subscribed so a
  // dropped refund.created still nets, and both dedup on the refund's re_… id.
  if (event.type === REFUND_EVENT_TYPE) {
    const r = await handleRefundEvent(event, site, siteKey)
    return res.status(r.status).json(r.body)
  }
  if (event.type === CHARGE_REFUNDED_EVENT_TYPE) {
    const r = await handleChargeRefundedEvent(event, site, siteKey)
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
      // only, count-only impact — see tinybird/archive/PHASE7_ATTRIBUTED_CONVERSIONS_DOUBLE_UPSERT_PROPOSAL.md).
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

    // Monthly conversion METER (fail-open on DB errors). Metering only — never refuses
    // the write. Same fix as the subscription path above: this used to roll the claim
    // back and ack 200 at the cap, destroying the purchase while reporting success.
    try {
      await claimConversionUsage(site)
    } catch (limitErr) {
      console.error('[stripe-webhook] Conversion meter failed, continuing (metering must never block revenue):', limitErr.message || limitErr)
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
