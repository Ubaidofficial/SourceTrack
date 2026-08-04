// SourceTrack — Stripe refund → compensating SIGNED $conversion (SCOPE_v3 §9).
//
// A refund is ingested as a $conversion with a NEGATIVE conversion_value, so a
// signed-sum revenue MV nets it against the original purchase (gross − refund).
// FACTUAL CORRECTION (PR3): this header used to say the refund is "TINYBIRD-ONLY …
// NOT written to Supabase attributed_conversions" because "nightly-attribution.js
// already skips convValue < 0". BOTH halves are now stale. #240 changed the nightly to
// PERSIST refunds: nightly-attribution.js:809 skips negatives EXCEPT
// conversion_type='refund' (grep the guard, not the line — it read :720 until this
// correction and will drift again:
//   `if ((convValue < 0 && conversion.conversion_type !== 'refund') || !conversion.distinct_id)`)
// so a refund DOES reach Supabase attributed_conversions with
// its negative value and Supabase revenue nets (gross − refund). The WEBHOOK still
// writes only to Tinybird — the Supabase row arrives via the nightly, keyed
// conversion_event_id = the Tinybird event_id (re_…) under
// UNIQUE(site_id, conversion_event_id). (PostHog is fully decommissioned.)
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
import { normalizeCurrencyCode } from './currency.js'

export const REFUND_EVENT_TYPE = 'refund.created'

// PR3: Stripe emits BOTH `refund.created` AND `charge.refunded` for the SAME refund.
// We subscribe both (charge.refunded is the safety net for a refund.created that is
// never delivered), which makes the DEDUP KEY load-bearing. The key is `refund.id`
// (re_…) — NOT the Stripe event id, which DIFFERS between the two event types for one
// refund. See buildRefundIdempotencyKeys + extractChargeRefunds below.
export const CHARGE_REFUNDED_EVENT_TYPE = 'charge.refunded'

/**
 * Pull the individual Refund objects out of a `charge.refunded` event.
 *
 * `charge.refunded`'s data.object is a CHARGE, not a Refund. Two consequences that
 * make a naive "just point charge.refunded at the refund handler" WRONG:
 *   1. `charge.amount` is the ORIGINAL charge total, NOT the refunded amount
 *      (`amount_refunded` is the cumulative refunded figure). Feeding the charge to
 *      buildRefundConversion would net the FULL charge on a partial refund.
 *   2. `charge.id` is `ch_…`, so it produces a DIFFERENT idempotency key and a
 *      DIFFERENT Tinybird event_id than the `re_…` that refund.created already used
 *      → both rows write → the refund double-nets.
 * So we descend to charge.refunds.data and treat each element as the unit of work,
 * keyed by its own `re_…`.
 *
 * `refunds` is OPTIONAL and NULLABLE on the Charge type (node_modules/stripe/types/
 * Charges.d.ts:194 `refunds?: ApiList<Stripe.Refund> | null`) — it is not guaranteed
 * to be expanded on the event payload. When it is absent we return [] and the caller
 * ACKS 200 WITHOUT WRITING. We deliberately do NOT synthesize a refund from
 * `amount_refunded` + `ch_…`: that id is exactly the double-write key above, and
 * refund.created already covers the refund. Missing data → write nothing, never guess.
 *
 * @returns {Array<object>} Refund objects (possibly empty), never null.
 */
export function extractChargeRefunds (event) {
  const charge = event?.data?.object || {}
  const list = charge?.refunds?.data
  if (!Array.isArray(list)) return []
  // Only refunds carrying a usable id — the id IS the dedup key, so an id-less entry
  // cannot be deduped and must not be written.
  return list.filter(r => r && typeof r.id === 'string' && r.id)
}

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
  // KI-62: also read the original's TYPED event_id. That column is exactly what the
  // nightly stores as attributed_conversions.conversion_event_id (pipe projects
  // `event_id AS uuid` -> nightly record.conversion_event_id: conversion.uuid), so it is
  // the precise key the inheritance PR needs to look the original up by — whatever
  // deriveEventId branch produced it. Reading the stored column keeps refund and
  // original symmetric by construction.
  const sql = `SELECT distinct_id, event_id FROM events WHERE site_id = '${esc(siteId)}' ` +
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
 * @returns {Promise<{status:'resolved', distinctId:string, originalConversionEventId:(string|null)} | {status:'not_found'} | {status:'unavailable'}>}
 *   - resolved   : a real original conversion was found; inherit its distinct_id, and
 *                  carry originalConversionEventId (KI-62 pointer) = its typed event_id,
 *                  which equals its attributed_conversions.conversion_event_id.
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
  const row = rows.length > 0 ? rows[0] : null
  const did = row?.distinct_id || null
  if (!did) return { status: 'not_found' }
  // KI-62 pointer, best-effort: absent on an older read seam that only selected
  // distinct_id (undefined -> null), so resolution never depends on it.
  return { status: 'resolved', distinctId: did, originalConversionEventId: row?.event_id || null }
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
export function buildRefundConversion (event, site, distinctId, { unresolved = false, stripeEventType = REFUND_EVENT_TYPE, originalConversionEventId = null } = {}) {
  const refund = event?.data?.object || {}
  const amount = Number(refund.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`buildRefundConversion: invalid refund amount ${refund.amount}`)
  }
  // Partial refunds: refund.amount is the partial amount, so this is the
  // negative of exactly what was refunded this event.
  const value = amount / 100
  // CONSISTENCY, not a live gap: Stripe types `currency` as REQUIRED and non-nullable on the
  // Refund object (node_modules/stripe/types/Refunds.d.ts:46 `currency: string`), so a
  // well-formed Stripe payload always carries one and this default effectively never fired.
  // It is removed anyway because the money rails must have ONE rule — unknown is never 'USD'
  // (#529/#532) — and the only payloads that would have hit it are malformed/synthetic ones,
  // exactly the case where inventing a unit is most misleading. null is representable end to
  // end: events.currency is Nullable and not a REQUIRED_COLUMN, and the returned `currency`
  // reaches revenue_ingestion_events.currency as NULL via logIngestionEvent's `currency ||
  // null`, so collapseCurrencies() reports 'partial' rather than a confident fake unit.
  const currency = normalizeCurrencyCode(refund.currency)
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
    // KI-62 pointer: the ORIGINAL conversion this refund reverses, so the nightly can
    // INHERIT its attribution verbatim rather than re-derive on the refund's own
    // (later, wrongly-anchored) window. = the original's typed event_id, which is
    // exactly its attributed_conversions.conversion_event_id. Present ONLY when the
    // original was resolved (Stripe's pointer requires the write-time read); the
    // unresolved/degraded path stamps no pointer and the inheritance PR marks it.
    // Bag-only field — projected by nightly_conversions_by_site.pipe. The nightly
    // consumer + custom_properties persistence land in the SEPARATE inheritance PR.
    ...(originalConversionEventId ? { original_conversion_event_id: originalConversionEventId } : {}),
    provider: 'stripe',
    provider_event_id: event.id,
    // Which Stripe event type produced THIS row — 'refund.created' or 'charge.refunded'.
    // Traceability only; it is NOT part of dedup (event_id/re_… is). Defaults to
    // refund.created so every existing call site is byte-identical.
    stripe_event_type: stripeEventType,
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
