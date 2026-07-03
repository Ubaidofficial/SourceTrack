// SourceTrack — Stripe refund → compensating SIGNED $conversion (SCOPE_v3 §9).
//
// A refund is ingested as a $conversion with a NEGATIVE conversion_value, so a
// signed-sum revenue MV nets it against the original purchase (gross − refund).
// TINYBIRD-ONLY for now (founder decision Q1=A): the refund is dual-written to
// Tinybird but NOT ph.capture'd to PostHog and NOT written to Supabase
// attributed_conversions — so PostHog-read and Supabase revenue both stay GROSS
// pending the deferred netting decision. (nightly-attribution.js already skips
// convValue < 0, so even a PostHog-captured refund would never reach Supabase —
// but we omit the capture entirely to keep PostHog-read revenue gross too.)
//
// TWO DEDUP LANDMINES this module is built around (both verified in code):
//   1. DB idempotency: a refund's Stripe payment_intent EQUALS the purchase's
//      payment_id (pi_…), and refund/charge can share the original order_id. So
//      the refund's idempotency-claim keys MUST NOT reuse order_id/payment_id —
//      they'd collide with the purchase's claim and the refund would be dropped
//      as a duplicate. Refund keys are refund-specific: provider_event_id
//      (evt_… of refund.created) + refund_id (re_…).
//   2. Tinybird event_id: deriveEventId (normalize.js) resolves a purchase via
//      order_id (branch 5). If the refund carried the original order_id it would
//      derive the SAME event_id → signed-sum dedup collapses purchase+refund →
//      net revenue wrong. So the refund is STAMPED with its own event_id =
//      refund.id (re_…), which wins deriveEventId branch 1. This is both the
//      distinct idempotency key (exactly-once across webhook retries — a retry
//      of refund.created carries the same re_… → same event_id → deduped) and
//      the collision guard. (Locked by derive-event-id.test.js.)

export const REFUND_EVENT_TYPE = 'refund.created'

// Idempotency-claim keys for a refund. DELIBERATELY excludes order_id and
// payment_id (= the purchase's pi_…) so it never collides with the purchase's
// claim. Both keys are refund-specific and stable across Stripe retries.
export function buildRefundIdempotencyKeys (event) {
  const refund = event?.data?.object || {}
  const keys = []
  if (event?.id) keys.push({ key_type: 'provider_event_id', key_value: event.id })
  if (refund?.id) keys.push({ key_type: 'refund_id', key_value: refund.id })
  return keys
}

// Deterministic distinct_id for a refund when the Refund object carries no
// stitching metadata (Stripe Refund objects usually don't). Stable per refund.
// Site-level revenue nets regardless of distinct_id; per-visitor/per-source
// netting would need the refund resolved to the original visitor — a documented
// limitation, deferred (see PR).
export function refundDistinctId (refund) {
  const anchor = refund?.payment_intent || refund?.charge || refund?.id || 'unknown'
  return `stripe_refund:${anchor}`
}

/**
 * Build the compensating $conversion for a Stripe refund.created event.
 * @returns { distinctId, occurredAt, value, properties } — value is the POSITIVE
 *   refunded amount (for logging); properties.conversion_value is its NEGATIVE.
 * @param {object} event  Stripe event (event.data.object = Refund)
 * @param {object} site   resolved site row ({ id, site_key })
 * @param {string} [distinctId]  resolved visitor id; falls back to refundDistinctId
 */
export function buildRefundConversion (event, site, distinctId) {
  const refund = event?.data?.object || {}
  const amount = Number(refund.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`buildRefundConversion: invalid refund amount ${refund.amount}`)
  }
  // Partial refunds: refund.amount is the partial amount, so this is the
  // negative of exactly what was refunded this event.
  const value = amount / 100
  const currency = refund.currency ? String(refund.currency).toUpperCase() : 'USD'
  const occurredAt = event.created ? new Date(event.created * 1000).toISOString() : new Date().toISOString()
  const did = distinctId || refundDistinctId(refund)

  const properties = {
    site_id: site.id,
    site_key: site.site_key,
    conversion_value: -value,            // SIGNED NEGATIVE — the whole point (§9)
    currency,
    conversion_type: 'refund',
    // STAMP: event_id = re_… wins deriveEventId branch 1 → distinct from the
    // purchase's order_id-derived id, and stable across retries. NEVER reuse the
    // purchase's order_id here (would collide in Tinybird).
    event_id: refund.id,
    conversion_event_id: refund.id,
    order_id: null,
    payment_id: refund.payment_intent || null, // traceability only; event_id dominates dedup
    provider: 'stripe',
    provider_event_id: event.id,
    stripe_event_type: REFUND_EVENT_TYPE,
    occurred_at: occurredAt,
    ingestion_method: 'webhook_stripe_refund',
    stitching_method: 'none',
    // Mirror the purchase carrier so the refund nets in the same stripe/webhook
    // bucket at the Tinybird site level.
    utm_source: 'stripe',
    utm_medium: 'webhook',
    utm_campaign: null,
    first_touch_source: 'stripe',
    first_touch_medium: 'webhook'
  }

  return { distinctId: did, occurredAt, value, currency, properties }
}
