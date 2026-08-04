import crypto from 'crypto'
import { Router } from 'express'
import { getSupabase } from '../lib/supabase.js'
import { decryptSecret } from '../lib/utils.js'
import { claimIdempotencyKeys, logIngestionEvent } from '../lib/idempotency.js'
import { claimConversionUsage } from '../lib/conversion-limits.js'
import { dualWriteEvent } from '../../tinybird/adapter/dual-write.js'
import { SHOPIFY_REFUND_TOPIC, extractShopifyRefundAmount, refundHasAmountSource, buildShopifyRefundIdempotencyKeys, buildShopifyRefundConversion, resolveOriginalDistinctIdByOrderId } from '../lib/shopify-refund.js'


/**
 * Read an order's amount and its unit AS A PAIR, always from one source object.
 *
 * Previously these were two independent fallback chains: value took total_price →
 * current_total_price, while currency took payload.currency → payload.presentment_currency.
 * Nothing tied them together, so a payload missing `currency` but carrying
 * `presentment_currency` would have stamped a SHOP-currency amount with the BUYER's currency —
 * e.g. 753.06 (USD) labelled CAD. Shopify documents total_price as being in the shop currency
 * and `currency` as the shop currency, so those two belong together and presentment_currency
 * never belongs with either.
 *
 * Order of preference, each a single object that carries its own currency_code:
 *   1. total_price_set.shop_money          — amount + unit, self-describing
 *   2. current_total_price_set.shop_money  — same, post-edit totals
 *   3. total_price          + currency     — flat pair, both shop currency
 *   4. current_total_price  + currency     — flat pair, both shop currency
 *
 * DELIBERATELY SHOP MONEY AT EVERY STEP, never presentment_money. Presentment amounts are
 * denominated in whatever each individual buyer paid in; summing them across buyers produces a
 * meaningless total, so revenue-by-source must aggregate one currency. What the buyer actually
 * paid is a separate, order-level display concern and is not captured here.
 *
 * Exported for tests.
 *
 * @param {object} payload Shopify order webhook payload
 * @returns {{ rawValue: unknown, rawCurrency: unknown }}
 */
export function readShopifyOrderAmount (payload) {
  for (const set of [payload?.total_price_set, payload?.current_total_price_set]) {
    const shopMoney = set?.shop_money
    if (shopMoney?.amount !== undefined && shopMoney?.amount !== null) {
      return { rawValue: shopMoney.amount, rawCurrency: shopMoney.currency_code }
    }
  }
  const rawValue = payload?.total_price !== undefined ? payload.total_price : payload?.current_total_price
  return { rawValue, rawCurrency: payload?.currency }
}

const router = Router()

router.post('/:site_key', async (req, res) => {
  const { site_key: siteKey } = req.params

  if (!siteKey) {
    return res.status(400).json({ error: 'Missing site_key' })
  }

  // 1. Confirm req.body is a Buffer (raw request body is required for Shopify signature verification)
  if (!Buffer.isBuffer(req.body)) {
    console.error('[shopify-webhook] Error: req.body is not a Buffer. Check middleware configuration.')
    return res.status(500).json({ error: 'Internal configuration error: raw body middleware required' })
  }

  // 2. Retrieve site by site_key
  let site = null
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('sites')
      .select('id, site_key, encrypted_shopify_shared_secret, plan')
      .eq('site_key', siteKey)
      .maybeSingle()

    if (error) throw error
    site = data
  } catch (dbErr) {
    console.error('[shopify-webhook] Database site lookup failed:', dbErr.message)
    return res.status(500).json({ error: 'Internal database error' })
  }

  // 3. Reject with 404/400 if site or secret is missing
  if (!site || !site.encrypted_shopify_shared_secret) {
    return res.status(404).json({ error: 'Site not found or Shopify sync not configured' })
  }

  // 4. Decrypt the secret
  let decryptedSecret
  try {
    decryptedSecret = decryptSecret(site.encrypted_shopify_shared_secret)
  } catch (decErr) {
    console.error('[shopify-webhook] Webhook secret decryption failed:', decErr.message)
    return res.status(500).json({ error: 'Failed to process webhook configurations' })
  }

  // 5. Verify Shopify signature timing-safely
  const signature = req.headers['x-shopify-hmac-sha256']
  if (!signature) {
    return res.status(400).json({ error: 'Missing X-Shopify-Hmac-Sha256 header' })
  }

  const computed = crypto
    .createHmac('sha256', decryptedSecret)
    .update(req.body)
    .digest('base64')

  const computedBuf = Buffer.from(computed, 'utf8')
  const providedBuf = Buffer.from(signature, 'utf8')

  if (computedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(computedBuf, providedBuf)) {
    console.error('[shopify-webhook] HMAC verification failed')
    return res.status(400).json({ error: 'Invalid HMAC signature' })
  }

  // 5b. Block inactive / archived sites
  if (site.plan === 'inactive' || site.plan === 'archived') {
    const msg = site.plan === 'archived'
      ? 'Site archived after 60 days of inactivity. Reactivate from your dashboard.'
      : 'Subscription inactive'
    return res.status(402).json({ success: false, data: null, error: msg })
  }


  // 6. Parse JSON payload only after verification
  let payload
  try {
    payload = JSON.parse(req.body.toString('utf8'))
  } catch (jsonErr) {
    console.error('[shopify-webhook] JSON parse error:', jsonErr.message)
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  // 7. Verify topic and filter for paid orders. Refunds route to their OWN path
  // BELOW (after this shared HMAC verify — NOT a second, weaker verification), so
  // orders/paid keeps its strict value guard (:110) unchanged. Negatives are
  // permitted ONLY on the refund path (STEP 2).
  const topic = req.headers['x-shopify-topic']
  if (topic === SHOPIFY_REFUND_TOPIC) {
    return handleShopifyRefund(req, res, { site, siteKey, payload })
  }
  if (topic !== 'orders/paid' && topic !== 'orders/create') {
    return res.status(200).json({ received: true, ignored: true, reason: `Topic ${topic} ignored` })
  }

  if (topic === 'orders/create' && payload.financial_status !== 'paid') {
    return res.status(200).json({
      received: true,
      ignored: true,
      reason: `orders/create event ignored because financial_status is '${payload.financial_status || 'missing'}'`
    })
  }

  // 8. Validate value and currency before claiming idempotency
  const { rawValue, rawCurrency } = readShopifyOrderAmount(payload)
  const value = parseFloat(rawValue || 0)
  if (isNaN(value) || value < 0) {
    return res.status(400).json({ error: 'Invalid conversion value' })
  }

  const currency = (rawCurrency || '').trim().toUpperCase()
  if (value > 0) {
    if (!currency || !/^[A-Z]{3}$/.test(currency)) {
      return res.status(400).json({ error: 'Invalid currency code' })
    }
  }

  const orderId = payload.id ? String(payload.id) : null
  if (!orderId) {
    return res.status(400).json({ error: 'Missing Shopify order id' })
  }

  const providerEventId = req.headers['x-shopify-webhook-id'] || null
  const occurredAt = payload.processed_at || payload.created_at || new Date().toISOString()

  // 9. Claim idempotency keys
  const keys = []
  if (providerEventId) {
    keys.push({ key_type: 'provider_event_id', key_value: providerEventId })
  }
  keys.push({ key_type: 'order_id', key_value: orderId })

  const claim = await claimIdempotencyKeys(siteKey, 'shopify', keys)

  if (claim.duplicate) {
    console.log(`[shopify-webhook] Duplicate event ${providerEventId || orderId} for site ${siteKey}`)
    await logIngestionEvent(siteKey, 'shopify', {
      providerEventId,
      orderId,
      value,
      currency,
      status: 'duplicate'
    })
    return res.status(200).json({ received: true, duplicate: true })
  }

  if (!claim.success) {
    console.error(`[shopify-webhook] Idempotency DB claim error for site ${siteKey}:`, claim.error)
    await logIngestionEvent(siteKey, 'shopify', {
      providerEventId,
      orderId,
      value,
      currency,
      status: 'error',
      errorMessage: claim.error || 'Failed to claim idempotency keys'
    })
    return res.status(500).json({ error: 'Temporary processing failure' })
  }

  // 10. Extract stitching ID from note_attributes or attributes
  const noteAttributes = payload.note_attributes || []
  const attributes = payload.attributes || {}
  const targetKeys = ['_st_aid', 'st_aid', 'anonymous_id', 'visitor_id', 'sourcetrack_user_id', 'site_user_id']

  let stitchingId = null
  let stitchingMethod = 'none'

  // Scan note_attributes array
  if (Array.isArray(noteAttributes)) {
    for (const key of targetKeys) {
      const attr = noteAttributes.find(a => a && a.name === key)
      if (attr && attr.value && String(attr.value).trim()) {
        stitchingId = String(attr.value).trim()
        stitchingMethod = `note_attributes.${key}`
        break
      }
    }
  }

  // Scan attributes map if not found
  if (!stitchingId && attributes && typeof attributes === 'object') {
    for (const key of targetKeys) {
      if (attributes[key] && String(attributes[key]).trim()) {
        stitchingId = String(attributes[key]).trim()
        stitchingMethod = `attributes.${key}`
        break
      }
    }
  }

  let distinctId
  let attributionStatus = undefined

  if (stitchingId) {
    distinctId = stitchingId
  } else {
    distinctId = `shopify_unattributed:${orderId}`
    attributionStatus = 'unattributed'
    stitchingMethod = 'none'
  }

  // 11. PostHog ingestion (privacy-safe, NO customer object, email, phone, names, addresses)
  try {
    const conversionProperties = {
      site_id: site.id,
      site_key: site.site_key,
      conversion_value: value,
      currency: currency || null,
      conversion_type: 'purchase',
      conversion_event_id: orderId,
      order_id: orderId,
      order_name: payload.name || (payload.order_number ? String(payload.order_number) : null) || null,
      provider: 'shopify',
      provider_event_id: providerEventId,
      occurred_at: occurredAt,
      ingestion_method: 'webhook_shopify',
      stitching_method: stitchingMethod,
      utm_source: 'shopify',
      utm_medium: 'webhook',
      utm_campaign: null,
      first_touch_source: 'shopify',
      first_touch_medium: 'webhook'
    }

    if (attributionStatus) {
      conversionProperties.attribution_status = attributionStatus
    }

    // Monthly conversion METER (fail-open on DB errors). Metering only — never refuses
    // the write. This carried the identical rollback-then-ack-200 defect as the Stripe
    // paths: an order at the cap was destroyed while Shopify was told it was delivered.
    try {
      await claimConversionUsage(site)
    } catch (limitErr) {
      console.error('[shopify-webhook] Conversion meter failed, continuing (metering must never block revenue):', limitErr.message || limitErr)
    }

    // Wave-2b cutover: Tinybird is the SOLE writer for this $conversion (ph.capture
    // removed; flag-gated OFF -> no-op + no network when off).
    // Reached ONLY after HMAC verify (:57-72) and the PERSISTENT claimIdempotencyKeys
    // duplicate-skip (:138) — so a duplicate the claim skips never dual-writes. The
    // conversion meter above never blocks. No external_event_id on Shopify;
    // conversionProperties.order_id (= String(payload.id)) lets deriveEventId branch-5
    // resolve event_id = order_id. site_key in props is dropped by the adapter.
    dualWriteEvent({ distinctId, event: '$conversion', timestamp: occurredAt, properties: conversionProperties })

    await logIngestionEvent(siteKey, 'shopify', {
      providerEventId,
      orderId,
      value,
      currency,
      status: 'success'
    })

    return res.status(200).json({ received: true })
  } catch (phErr) {
    console.error('[shopify-webhook] $conversion ingestion failed:', phErr.message)
    await logIngestionEvent(siteKey, 'shopify', {
      providerEventId,
      orderId,
      value,
      currency,
      status: 'error',
      errorMessage: phErr.message || 'event ingestion failed'
    })
    return res.status(500).json({ error: 'Temporary processing failure' })
  }
})

// ── Shopify refunds/create → compensating negative $conversion ───────────────
// Mirrors the Stripe refund path (#381) on the Shopify rail: refund-specific
// idempotency keys (claim-after-write via the SAME rail), resolve the original
// order by order_id and inherit its distinct_id, negative value, conversion_type
// 'refund'. DEGRADED PATH: a resolution miss or Tinybird failure keeps the phantom
// distinct_id AND stamps attribution_status='refund_unresolved', logs at warn,
// still writes, never throws. Uses dualWriteEvent (the SAME writer as the order
// path). No claimConversionUsage — a refund must not consume the monthly quota.
async function handleShopifyRefund (req, res, { site, siteKey, payload }) {
  const providerEventId = req.headers['x-shopify-webhook-id'] || null
  const orderId = payload?.order_id != null ? String(payload.order_id) : null

  // Validate the refunded amount BEFORE claiming (mirrors the order path). A `0`
  // amount splits two ways — a payload-shape failure must NOT be acked as a silent
  // $0 (that would be money-rail loss behind a 200 — the email-reports/gsc pattern):
  //   - amount 0 with a source PRESENT  -> genuine restock-only refund. Ack 200, no row.
  //   - amount 0 with BOTH sources ABSENT -> PARSE FAILURE. Log ERROR + return 500 so
  //     Shopify's retry window (8 attempts / 4h) redelivers, and repeated failures
  //     surface loudly in the Shopify admin rather than vanishing.
  const amount = extractShopifyRefundAmount(payload)
  if (!(amount > 0)) {
    if (refundHasAmountSource(payload)) {
      return res.status(200).json({ received: true, ignored: true, reason: 'restock-only refund (no money moved)' })
    }
    console.error(`[shopify-webhook] refund ${payload?.id} for order ${orderId || 'null'}: NO amount source ` +
      `(transactions[] and refund_line_items[] both absent) — possible payload-shape / include_fields issue. ` +
      `Returning 500 for Shopify retry so the refund is NOT silently lost.`)
    return res.status(500).json({ error: 'Refund payload missing amount source — retry expected' })
  }

  const keys = buildShopifyRefundIdempotencyKeys(payload, providerEventId)
  if (keys.length === 0) {
    return res.status(200).json({ received: true, ignored: true, reason: 'no refund idempotency key' })
  }

  const claim = await claimIdempotencyKeys(siteKey, 'shopify', keys)
  if (claim.duplicate) {
    await logIngestionEvent(siteKey, 'shopify', { providerEventId, orderId, value: amount, currency: null, status: 'duplicate' })
    return res.status(200).json({ received: true, duplicate: true })
  }
  if (!claim.success) {
    await logIngestionEvent(siteKey, 'shopify', { providerEventId, orderId, value: amount, currency: null, status: 'error', errorMessage: claim.error || 'Failed to claim idempotency keys' })
    return res.status(500).json({ error: 'Temporary processing failure' })
  }

  // Resolve the original order (by order_id → its event_id) and inherit its
  // distinct_id, so the nightly re-derives attribution from the real visitor's
  // touchpoints. resolve* never throws (null read → 'unavailable').
  const resolution = await resolveOriginalDistinctIdByOrderId({ orderId, siteId: site.id })
  const resolved = resolution.status === 'resolved'
  if (!resolved) {
    console.warn(`[shopify-webhook] refund ${payload?.id} for order ${orderId || 'null'} attribution ${resolution.status} — writing with phantom distinct_id + attribution_status=refund_unresolved`)
  }

  const built = buildShopifyRefundConversion(payload, site, resolved ? resolution.distinctId : undefined, { unresolved: !resolved })
  if (!built) {
    // extractShopifyRefundAmount re-checked inside build; amount>0 guaranteed above.
    return res.status(200).json({ received: true, ignored: true, reason: 'refund with no money movement' })
  }
  const { distinctId, value, currency, properties } = built
  properties.provider_event_id = providerEventId
  const occurredAt = properties.occurred_at

  // Fire-and-forget batcher (same writer as the order path). Never throws on a
  // Tinybird hiccup; the persistent idempotency claim above is what makes a
  // webhook retry a no-op.
  dualWriteEvent({ distinctId, event: '$conversion', timestamp: occurredAt, properties })
  await logIngestionEvent(siteKey, 'shopify', { providerEventId, orderId, value: -value, currency, status: 'success' })
  return res.status(200).json({ received: true, refund: true, resolved })
}

export { router as shopifyWebhookRouter }
