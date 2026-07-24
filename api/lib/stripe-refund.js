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

import { esc } from './utils.js'

export const REFUND_EVENT_TYPE = 'refund.created'

// ── Phase 7 PR1: resolve the refund to the ORIGINAL conversion ───────────────
// The purchase write persists payment_intent in the Tinybird event's properties
// bag (stripe-webhook.js:410 `payment_id`), and a Stripe refund's payment_intent
// EQUALS the purchase's — so we look up the original conversion by it and inherit
// its distinct_id. payment_intent is the ONLY join key: a Stripe Refund object
// exposes `charge` and `payment_intent` only (no `invoice`), and the purchase
// stores `payment_id = session.payment_intent` (no charge-side counterpart), so
// there is no secondary key. BOUNDARY: a subscription-mode refund that carries no
// payment_intent resolves as `refund_unresolved` — recovering it needs an Invoice
// Payment lookup (a separate Stripe read), deferred to a later PR.
//
// We inherit the distinct_id ONLY. We deliberately do NOT copy the original's
// first_touch_source etc.: a real Stripe purchase event stamps
// first_touch_source='stripe' (webhook, not the acquiring source), so copying it
// would just move 'stripe' around — and stamping the TRUE source on the refund
// alone (while the purchase keeps 'stripe') would make TikTok show negative
// revenue it never earned (asymmetric pair = fabricated attribution, §5.1). The
// real fix is the distinct_id: the nightly rebuilds the refund's Supabase
// attribution from THAT visitor's pageviews (nightly-attribution.js:866 derives
// first_touch from touchpoints, never the event stamp), so a refund nets against
// the acquiring source on the Supabase surface dashboard.js sourceMap reads.
const RESOLVE_TIMEOUT_MS = 5000

// Env READ-token /v0/sql seam (mirrors conversion-write.js:55). Returns an array
// of matched rows, or NULL on ANY failure (missing config, non-2xx, network/
// timeout). NEVER throws — a null is handled by the caller as 'unavailable'
// (unresolved), DISTINCT from [] ('resolved to nothing'). We never treat a failed
// read as "no original conversion" (that would drop attribution on a blip).
async function envResolveOriginalRead ({ siteId, key, value }, { fetchImpl } = {}) {
  const host = process.env.TINYBIRD_HOST
  const readToken = process.env.TINYBIRD_READ_TOKEN
  if (!host || !readToken) return null
  const doFetch = fetchImpl || globalThis.fetch
  // payment_id rides in the properties json:$ bag (NOT a typed column). site_id and
  // value are esc()'d → they can only ever be string literals. (`key` is always
  // 'payment_id'; kept in the seam signature for a legible call site.)
  const predicate = `JSONExtractString(properties, 'payment_id') = '${esc(value)}'`
  const sql = `SELECT distinct_id FROM events WHERE site_id = '${esc(siteId)}' ` +
    `AND event_type = '$conversion' AND conversion_type != 'refund' AND ${predicate} ` +
    `ORDER BY timestamp ASC LIMIT 1 FORMAT JSON`
  const url = `${String(host).replace(/\/$/, '')}/v0/sql?q=${encodeURIComponent(sql)}`
  try {
    const res = await doFetch(url, { headers: { Authorization: `Bearer ${readToken}` }, signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS) })
    if (!res.ok) return null
    const body = await res.json()
    return Array.isArray(body?.data) ? body.data : []
  } catch (_) {
    return null
  }
}

// Test seam (production uses the env READ-token query above). NEVER a token literal.
let _resolveRead = envResolveOriginalRead
export function __setRefundResolveRead (fn) { _resolveRead = fn || envResolveOriginalRead }
export function __resetRefundResolveRead () { _resolveRead = envResolveOriginalRead }

/**
 * Resolve a refund to its original conversion's distinct_id, by payment_intent.
 * @returns {Promise<{status:'resolved', distinctId:string} | {status:'not_found'} | {status:'unavailable'}>}
 *   - resolved   : a real original conversion was found; inherit its distinct_id.
 *   - not_found  : no payment_intent to look up, OR the read matched nothing.
 *   - unavailable: the read FAILED (null) — Tinybird unreachable / misconfigured.
 *   Both not_found and unavailable route to the degraded path (phantom +
 *   attribution_status='refund_unresolved'); the split exists so a blip is never
 *   mistaken for a definitive "no original" and so the two can be logged apart.
 */
export async function resolveOriginalDistinctId ({ paymentId, siteId }, { readFn } = {}) {
  const read = readFn || _resolveRead
  if (!paymentId) return { status: 'not_found' }                // no join key (e.g. subscription-mode refund w/o payment_intent)
  const rows = await read({ siteId, key: 'payment_id', value: paymentId })
  if (rows === null) return { status: 'unavailable' }           // read FAILED — never a silent miss
  const did = rows.length > 0 ? rows[0]?.distinct_id : null
  return did ? { status: 'resolved', distinctId: did } : { status: 'not_found' }
}

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
export function buildRefundConversion (event, site, distinctId, { unresolved = false } = {}) {
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
    // bucket at the Tinybird site level. UNCHANGED by Phase 7 PR1: kept SYMMETRIC
    // with the purchase (both stamp 'stripe'), so the Tinybird plane nets
    // stripe +X / stripe −X → zero. The acquiring-source correction happens on the
    // Supabase surface via the inherited distinct_id + the nightly rebuild, never
    // by stamping a true source on the refund alone (that would fabricate negative
    // revenue on a source the refund's carrier never earned).
    utm_source: 'stripe',
    utm_medium: 'webhook',
    utm_campaign: null,
    first_touch_source: 'stripe',
    first_touch_medium: 'webhook',
    // Degraded path: the original could not be resolved (miss or Tinybird
    // unavailable), so `did` is the synthesized phantom. Mark the row so the
    // missing attribution is QUERYABLE rather than silently 'direct'.
    ...(unresolved ? { attribution_status: 'refund_unresolved' } : {})
  }

  return { distinctId: did, occurredAt, value, currency, properties }
}
