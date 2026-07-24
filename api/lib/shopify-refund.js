// SourceTrack — Shopify refund → compensating SIGNED $conversion (mirrors the
// Stripe design in api/lib/stripe-refund.js / #381). A refund is ingested as a
// $conversion with a NEGATIVE conversion_value so signed-sum revenue nets it
// against the original order (gross − refund). We inherit the ORIGINAL order's
// distinct_id ONLY (so the nightly re-derives the refund's Supabase attribution
// from that visitor's touchpoints); we do NOT copy first_touch_source/utm_* — the
// order event stamps 'shopify', symmetric with the refund, and stamping a true
// acquiring source on the refund alone would fabricate negative revenue on a
// source it never earned (§5.1, same asymmetry trap as #381).
//
// JOIN KEY: the original orders/paid write stores conversion_event_id = order id
// and its typed `event_id` = order id (deriveEventId branch-5). A refunds/create
// payload carries `order_id`, so we resolve the original by `event_id = order_id`.

import { esc } from './utils.js'

export const SHOPIFY_REFUND_TOPIC = 'refunds/create'

// ── Refund amount (STEP 4 — partial refunds) ─────────────────────────────────
// Shopify refunds are frequently PARTIAL (a line item, or a fixed amount). The
// authoritative money-moved figure is the sum of `transactions[]` with
// kind='refund' & status='success' (`amount`, a string). We net THAT, never the
// order total. Fallback: if no transactions, sum `refund_line_items[].subtotal`.
// Returns the POSITIVE refunded amount (0 → nothing moved → caller ignores).
export function extractShopifyRefundAmount (payload) {
  const txns = Array.isArray(payload?.transactions) ? payload.transactions : []
  const txnSum = txns
    .filter(t => t && t.kind === 'refund' && (t.status === undefined || t.status === 'success'))
    .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0)
  if (txnSum > 0) return txnSum
  const lines = Array.isArray(payload?.refund_line_items) ? payload.refund_line_items : []
  const lineSum = lines.reduce((s, l) => s + (parseFloat(l?.subtotal) || 0), 0)
  return lineSum > 0 ? lineSum : 0
}

// Whether the payload carried ANY amount structure we could parse. A `0` amount is
// only trustworthy ("genuine restock-only refund") when at least one source is
// PRESENT (a present-but-empty transactions:[] is Shopify saying "no money moved").
// If BOTH are absent, a `0` is a PARSE FAILURE, not a real $0 — the caller must NOT
// silently ack it (that would be money-rail loss behind a 200). Merchants have
// reported refunds/create arriving without the nested transactions list, and 2025
// subscriptions use include_fields to shape the payload — so presence is not assumed.
export function refundHasAmountSource (payload) {
  return Array.isArray(payload?.transactions) || Array.isArray(payload?.refund_line_items)
}

// Idempotency-claim keys for a refund. Refund-specific (provider_event_id = the
// refund webhook's own X-Shopify-Webhook-Id, + refund_id) — DELIBERATELY excludes
// order_id, which is the ORIGINAL order's claim key and would collide (dropping the
// refund as a duplicate of the order). Mirrors the Stripe refund key policy.
export function buildShopifyRefundIdempotencyKeys (payload, providerEventId) {
  const keys = []
  if (providerEventId) keys.push({ key_type: 'provider_event_id', key_value: String(providerEventId) })
  if (payload?.id != null) keys.push({ key_type: 'refund_id', key_value: String(payload.id) })
  return keys
}

// Phantom distinct_id when the original order cannot be resolved. Stable per refund.
export function shopifyRefundDistinctId (payload) {
  const anchor = payload?.id ?? payload?.order_id ?? 'unknown'
  return `shopify_refund:${anchor}`
}

// ── Resolve the original order → its distinct_id, by event_id = order_id ──────
const RESOLVE_TIMEOUT_MS = 5000

// Env READ-token /v0/sql seam (mirrors stripe-refund.js). Returns matched rows, or
// NULL on ANY failure — NEVER throws. A null is handled as 'unavailable'
// (unresolved), DISTINCT from [] ('resolved to nothing'); a failed read is never
// mistaken for "no original order".
async function envResolveOrderRead ({ siteId, orderId }, { fetchImpl } = {}) {
  const host = process.env.TINYBIRD_HOST
  const readToken = process.env.TINYBIRD_READ_TOKEN
  if (!host || !readToken) return null
  const doFetch = fetchImpl || globalThis.fetch
  // event_id (a TYPED column) = the Shopify order id for the original order.
  // site_id/orderId are esc()'d → they can only ever be string literals.
  const sql = `SELECT distinct_id FROM events WHERE site_id = '${esc(siteId)}' ` +
    `AND event_type = '$conversion' AND conversion_type != 'refund' AND event_id = '${esc(orderId)}' ` +
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
let _resolveRead = envResolveOrderRead
export function __setShopifyRefundResolveRead (fn) { _resolveRead = fn || envResolveOrderRead }
export function __resetShopifyRefundResolveRead () { _resolveRead = envResolveOrderRead }

/**
 * Resolve a Shopify refund to its original order's distinct_id, by order_id.
 * @returns {Promise<{status:'resolved', distinctId:string} | {status:'not_found'} | {status:'unavailable'}>}
 *   resolved: found; inherit distinct_id. not_found: no order_id, or matched nothing.
 *   unavailable: the read FAILED (null) — Tinybird unreachable. Both degrade.
 */
export async function resolveOriginalDistinctIdByOrderId ({ orderId, siteId }, { readFn } = {}) {
  const read = readFn || _resolveRead
  if (!orderId) return { status: 'not_found' }
  const rows = await read({ siteId, orderId: String(orderId) })
  if (rows === null) return { status: 'unavailable' }
  const did = rows.length > 0 ? rows[0]?.distinct_id : null
  return did ? { status: 'resolved', distinctId: did } : { status: 'not_found' }
}

/**
 * Build the compensating $conversion for a Shopify refunds/create event.
 * @param {object} payload  the Shopify Refund object (event body)
 * @param {object} site     resolved site row ({ id, site_key })
 * @param {string} [distinctId]  resolved original distinct_id; falls back to phantom
 * @param {object} [opts]    { unresolved } — degraded path stamps refund_unresolved
 * @returns {{ distinctId, value, currency, properties } | null}  null = $0 refund, ignore
 */
export function buildShopifyRefundConversion (payload, site, distinctId, { unresolved = false } = {}) {
  const amount = extractShopifyRefundAmount(payload)
  if (!(amount > 0)) return null                                   // no money moved → nothing to net
  const value = amount
  const currency = (payload?.currency || '').trim().toUpperCase() || 'USD'
  const occurredAt = payload?.processed_at || payload?.created_at || new Date().toISOString()
  const did = distinctId || shopifyRefundDistinctId(payload)
  // conversion_event_id / event_id are refund-specific (prefixed) so they can NEVER
  // collide with the original order's id under UNIQUE(site_id, conversion_event_id).
  const refundEventId = `shopify_refund:${payload?.id ?? payload?.order_id ?? 'unknown'}`

  const properties = {
    site_id: site.id,
    site_key: site.site_key,
    conversion_value: -value,            // SIGNED NEGATIVE — the whole point
    currency,
    conversion_type: 'refund',
    event_id: refundEventId,
    conversion_event_id: refundEventId,
    order_id: payload?.order_id != null ? String(payload.order_id) : null,  // traceability only; event_id dominates
    provider: 'shopify',
    provider_event_id: null,             // set by the route from the refund webhook header
    occurred_at: occurredAt,
    ingestion_method: 'webhook_shopify_refund',
    stitching_method: 'none',
    // Symmetric 'shopify' carrier — NOT the acquiring source (see header). The
    // nightly corrects Supabase attribution via the inherited distinct_id.
    utm_source: 'shopify',
    utm_medium: 'webhook',
    utm_campaign: null,
    first_touch_source: 'shopify',
    first_touch_medium: 'webhook',
    // Degraded path: original not resolved → phantom did → mark it queryable.
    ...(unresolved ? { attribution_status: 'refund_unresolved' } : {})
  }

  return { distinctId: did, value, currency, properties }
}
