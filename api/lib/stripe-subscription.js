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
