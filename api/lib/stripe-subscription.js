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
    // Renewals (subscription_cycle) vs the first paid invoice of a subscription.
    out.conversionType = out.billingReason === 'subscription_cycle' ? 'renewal' : 'subscription'
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
// first_subscription_id is null for a checkout (no subscription on that event yet).
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
