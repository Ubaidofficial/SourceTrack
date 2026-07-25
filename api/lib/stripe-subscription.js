// Pure decision + idempotency-key logic for Stripe subscription-lifecycle
// ingestion. No I/O and no heavy deps, so it is unit-testable directly with
// synthetic events (the customers'-buyers' recurring-revenue rail). The route
// (api/routes/stripe-webhook.js) wires these into identity stitching, PostHog
// capture, idempotency claiming, and conversion limits.

// Stripe subscription-lifecycle events handled by the recurring ingest path.
export const SUBSCRIPTION_EVENTS = new Set([
  'invoice.paid',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted'
])

// Map a Stripe event → an ingestion decision. Returns a non-null `skipReason`
// when the event should be acknowledged but not ingested (e.g. a no-trial active
// create whose revenue arrives on invoice.paid, or a non-transition update).
export function mapSubscriptionEvent(event) {
  const obj = (event && event.data && event.data.object) || {}
  const eventType = event?.type
  const out = {
    conversionType: null, value: 0, currency: (obj.currency || 'usd').toUpperCase(),
    customerId: obj.customer || null, subscriptionId: null, invoiceId: null,
    billingReason: null, skipReason: null
  }

  if (eventType === 'invoice.paid') {
    out.invoiceId = obj.id || null
    out.subscriptionId = obj.subscription || null
    out.billingReason = obj.billing_reason || null
    out.value = obj.amount_paid != null ? obj.amount_paid / 100 : 0
    if (out.billingReason === 'subscription_cycle') {
      // Renewals. Never skipped, even at $0 (a fully-credited period is still a renewal).
      out.conversionType = 'renewal'
    } else if (obj.amount_paid === 0 && obj.subtotal === 0) {
      // TRIAL-START CARRIER. A subscription created WITH a trial also emits an invoice.paid at
      // trial START: billing_reason='subscription_create', amount_paid=0, whose only line is the
      // $0 "Free trial for 1 × <plan>" item. Verified empirically on a Stripe sandbox test clock
      // (clock_1Tx8mJLZY0IPZEmwX9lYJQva) — reasoning alone had missed it.
      //
      // Skipped rather than typed, mirroring the 'active subscription create' skip below: this
      // invoice is a billing artifact of a trial that is ALREADY recorded — the trial start by
      // trial_start (subscription.created), and the eventual conversion by trial_converted
      // (subscription.updated). Typing it 'subscription' made EVERY trial start register a
      // customer whether or not it ever converted: 100 trials + 10 conversions -> ~110 customers.
      //
      // THE DISCRIMINATOR IS `subtotal`, NOT `amount_paid`. amount_paid===0 alone would also skip
      // a 100%-discount coupon on a REAL acquisition, which IS a customer. The question is whether
      // anything was ever OWED: a trial-start invoice has subtotal 0 (its only line is $0), while a
      // fully-discounted acquisition has subtotal > 0 reduced to 0 by the discount.
      //
      // BOTH must be EXPLICITLY 0. A missing/undefined subtotal must NOT trigger the skip — that
      // keeps the acquisition instead of silently dropping a real conversion, the same
      // fail-toward-keeping stance isSubscriptionCheckoutCarrier documents below.
      //
      // KNOWN PRODUCT QUESTION, deliberately not decided here: a genuinely $0-priced plan (free
      // tier) also has subtotal 0 and is therefore skipped too. Whether a free-plan signup should
      // count as a "customer" is a product call — today's answer (no, it is not a paying customer)
      // matches what the customers metric means everywhere else.
      out.skipReason = 'trial-start $0 invoice — nothing was owed; the trial is already recorded by trial_start and its conversion by trial_converted'
    } else {
      // First paid invoice of a subscription (or a fully-discounted one) — a real acquisition.
      out.conversionType = 'subscription'
    }
  } else if (eventType === 'customer.subscription.created') {
    out.subscriptionId = obj.id || null
    if (obj.status === 'trialing') {
      out.conversionType = 'trial_start'   // no immediate revenue
    } else {
      // Active-on-create with no trial — revenue arrives via invoice.paid.
      out.skipReason = 'active subscription create — revenue ingested via invoice.paid'
    }
  } else if (eventType === 'customer.subscription.updated') {
    out.subscriptionId = obj.id || null
    const prev = (event.data && event.data.previous_attributes) || {}
    if (prev.status === 'trialing' && obj.status === 'active') {
      out.conversionType = 'trial_converted'   // funnel transition; paid amount lands on invoice.paid
    } else {
      out.skipReason = `subscription update (${prev.status || '?'}→${obj.status || '?'}) not a tracked transition`
    }
  } else if (eventType === 'customer.subscription.deleted') {
    out.subscriptionId = obj.id || null
    out.conversionType = 'churn'
  } else {
    out.skipReason = 'unhandled subscription event'
  }
  return out
}

// provider_event_id dedups webhook replays. For invoice events the unique
// per-period invoice_id is the logical key — a renewal gets a fresh invoice_id,
// so it is correctly NOT a duplicate of the prior period (and we must NOT add a
// subscription-scoped key here, or every renewal of the same subscription would
// collide and be dropped). For the once-per-subscription lifecycle events
// (trial_start / trial_converted / churn), scope by subscription_id + conversion
// type so each transition claims at most once.
export function buildSubscriptionIdempotencyKeys({ providerEventId, conversionType, invoiceId, subscriptionId }) {
  const keys = [{ key_type: 'provider_event_id', key_value: providerEventId }]
  if (invoiceId) {
    keys.push({ key_type: 'invoice_id', key_value: invoiceId })
  } else if (subscriptionId) {
    keys.push({ key_type: 'subscription_id', key_value: `${subscriptionId}:${conversionType}` })
  }
  return keys
}

// ── Phase 5c: subscription-mode checkout double-count fix ──────────────────────
//
// A subscription-creating checkout fires BOTH checkout.session.completed AND
// invoice.paid, each as a $conversion — double-counting the first payment. The
// fix counts subscription revenue ONCE (on invoice.paid) while keeping the
// checkout event as a $0 attribution carrier (it alone can stitch via
// client_reference_id, which invoice.paid never sees).

// The checkout $conversion's revenue: $0 for a subscription-mode checkout (revenue
// lands on invoice.paid), full value for a one-time (payment-mode) checkout.
// Pure: the live route applies this to conversion_value only — everything else
// (customer_id, the client_reference_id stitch, distinct_id) is unchanged.
export function checkoutConversionValue(sessionMode, value) {
  return sessionMode === 'subscription' ? 0 : value
}

// The acquisition-locked subscription_identity SEED row for one nightly conversion,
// or null to SKIP. Seeds on stripe customer_id ALONE (so a subscription-mode
// checkout — customer_id + a client_reference_id stitch but NO subscription_id —
// seeds, letting the surviving invoice.paid self-resolve its source via the backfill).
// STITCHED-ONLY (no-downgrade): returns null for an unstitched conversion, so it
// never locks an 'unknown' row that would block a later self-stitching invoice.paid.
// first_subscription_id: as of Phase 7, a subscription-mode checkout now carries its
// own stripe_subscription_id (forwarded from Stripe's session.subscription — see
// isSubscriptionCheckoutCarrier below), so this is populated at seed time when
// available; it is write-once/informational only (no downstream code reads it back,
// and it is not part of subscription_identity's ON CONFLICT target), so this is a
// pure accuracy improvement, not a behavior change.
export function buildSubscriptionIdentitySeed({ conversion, touchpoints, record }) {
  if (!conversion || !conversion.webhook_customer_id) return null
  const unstitched = String(conversion.distinct_id || '').startsWith('stripe_') ||
    (touchpoints?.length || 0) === 0
  if (unstitched) return null
  return {
    stripe_customer_id:    conversion.webhook_customer_id,
    first_subscription_id: conversion.stripe_subscription_id || null,
    source_conversion_id:  conversion.uuid || null,
    anonymous_id:          conversion.distinct_id,
    first_touch_source:    record.first_touch_source,
    first_touch_channel:   record.first_touch_channel,
    first_touch_campaign:  record.first_touch_campaign,
    last_touch_source:     record.last_touch_source,
    last_touch_channel:    record.last_touch_channel,
    attribution_status:    'resolved'
  }
}

// ── Phase 7: subscription-checkout-carrier discriminator ───────────────────────
//
// Identifies the $0 subscription-mode checkout $conversion (the "carrier" from
// Phase 5c above) so a caller can EXCLUDE it from conversion-COUNT aggregates
// (attributed_conversions rows in nightly-attribution.js; live multi-touch model
// credit in attribution-engine.js) without touching revenue, customer counts, or
// the subscription_identity/subscription_revenue write path — none of those read
// this helper. The carrier's $0 value and its role as the client_reference_id
// stitch source are both left completely alone; this only answers "should this
// row count as its own conversion for COUNTING purposes."
//
// Requires `stripe_subscription_id` to be PRESENT on the carrier. The checkout
// handler (api/routes/stripe-webhook.js) forwards Stripe's own `session.subscription`
// onto the $0 carrier event for exactly this reason: Stripe populates
// session.subscription at checkout completion for a subscription-mode session, and
// NEVER populates it for a one-time (payment-mode) session. That's what makes
// presence (not absence) of stripe_subscription_id the unambiguous signal here — a
// genuinely fully-discounted ($0) ONE-TIME checkout has the identical provider /
// conversion_type / conversion_value / stripe_event_type as the subscription
// carrier, but can never have a subscription_id, so it correctly does NOT match.
//
// conversion_value null-coercion (explicit choice, not implicit): Number(null) === 0,
// so a `null` conversion_value is treated the same as an explicit `0` (may match).
// Number(undefined) is NaN, which is never === 0, so a conversion whose
// conversion_value is truly absent (key not sent at all) never matches — this fails
// CLOSED (does not skip) rather than guessing. A false negative here only preserves
// today's existing count-inflation behavior (no new bug); a false positive would
// newly and incorrectly exclude a real conversion from every count that reads this
// helper. Uncertain/malformed data should never cause a row to be skipped.
export function isSubscriptionCheckoutCarrier({ provider, conversion_type, conversion_value, stripe_subscription_id, stripe_event_type } = {}) {
  return provider === 'stripe' &&
    conversion_type === 'purchase' &&
    Number(conversion_value) === 0 &&
    !!stripe_subscription_id &&
    stripe_event_type === 'checkout.session.completed'
}
