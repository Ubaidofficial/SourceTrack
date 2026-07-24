// KI-62 write-path prerequisite — the refund → original-conversion POINTER.
// TOKEN-FREE, NO network, own in-process fixtures.
//
// The KI-62 defect: the nightly re-derives a refund's attribution on the REFUND's
// own (later) timestamp window, so a refund outside windowDays of the acquiring touch
// resolves to Direct while the purchase keeps its source. The fix (a SEPARATE
// inheritance PR) is to COPY the original conversion's attribution verbatim — which
// requires the nightly to know WHICH conversion a refund reverses. It does not today.
//
// THIS PR only creates that pointer and makes it reach the nightly. These tests prove:
//   1. a Stripe checkout refund carries original_conversion_event_id = the original's
//      event_id (its cs_…), resolved via payment_intent, end-to-end through the route
//   2. a Shopify refund carries it = String(order_id)
//   3. a subscription-mode refund (no payment_intent) resolves refund_unresolved and
//      stamps NO pointer — the founder-confirmed degraded path, unchanged
//   4. a Stripe refund whose original is NOT resolvable stamps no pointer (no guess)
//   5. the nightly pipe PROJECTS the new column (asserted against .pipe text — this PR
//      does NOT deploy the pipe)
// It does NOT build the nightly consumer or the custom_properties write — that is the
// inheritance PR.

import test from 'node:test'
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import Stripe from 'stripe'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { buildShopifyRefundConversion } = await import('../lib/shopify-refund.js')
const { __setRefundResolveRead, __resetRefundResolveRead } = await import('../lib/stripe-refund.js')
const { getSupabase } = await import('../lib/supabase.js')
const { encryptSecret } = await import('../lib/utils.js')
const { stripeWebhookRouter } = await import('../routes/stripe-webhook.js')
const {
  __setConversionWriteTransportFactory, __resetConversionWriteTransportFactory,
  __setConversionReadCheck, __resetConversionReadCheck
} = await import('../../tinybird/adapter/conversion-write.js')

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─────────────────────────────────────────────────────────────────────────────
// 1 + 3 + 4. STRIPE — end-to-end through the real webhook route.
// ─────────────────────────────────────────────────────────────────────────────
const stripe = new Stripe('fake_key_for_test_signature_only', { apiVersion: '2024-06-20' })
const SITE_KEY = 'sk_live_ki62pointer'
const WEBHOOK_SECRET = 'fake_webhook_secret_ki62'
const SITE = { id: 'site-ki62-1', site_key: SITE_KEY, encrypted_stripe_webhook_secret: encryptSecret(WEBHOOK_SECRET), plan: 'scale' }

const layer = stripeWebhookRouter.stack.find(l => l.route?.path === '/:site_key' && l.route?.methods?.post)
const handler = layer.route.stack[layer.route.stack.length - 1].handle

const client = getSupabase()
const originalFrom = client.from
const originalRpc = client.rpc

// origEventId: what the resolve read returns as the original's event_id (null = older
// seam / not part of the row). resolveRows null → resolve 'unavailable'; [] → not_found.
function stripeWorld ({ resolveRows } = {}) {
  const rows = []
  client.from = (table) => table === 'sites'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: SITE, error: null }), single: async () => ({ data: SITE, error: null }) }) }) }
    : { insert: async () => ({ error: null }) }
  client.rpc = async (fn) => fn === 'claim_revenue_idempotency_keys'
    ? { data: true, error: null }
    : { data: null, error: { message: 'mock' } }
  __setConversionWriteTransportFactory(() => async (payload) => {
    gunzipSync(payload).toString('utf8').trim().split('\n').filter(Boolean).forEach(l => rows.push(JSON.parse(l)))
  })
  __setConversionReadCheck(async () => 0)
  __setRefundResolveRead(async () => resolveRows)
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  return { rows }
}
function stripeTeardown () {
  client.from = originalFrom; client.rpc = originalRpc
  __resetConversionWriteTransportFactory(); __resetConversionReadCheck(); __resetRefundResolveRead()
  delete process.env.TINYBIRD_DUAL_WRITE
}
async function sendRefund ({ paymentIntent }) {
  const evt = {
    id: 'evt_refund_ki62', type: 'refund.created', created: 1_780_000_000,
    data: { object: { id: 're_ki62', object: 'refund', amount: 5000, currency: 'usd', payment_intent: paymentIntent, charge: 'ch_1' } }
  }
  const body = Buffer.from(JSON.stringify(evt))
  const sig = stripe.webhooks.generateTestHeaderString({ payload: body.toString(), secret: WEBHOOK_SECRET })
  let cap = { status: 0, body: null }
  await handler({ params: { site_key: SITE_KEY }, body, headers: { 'stripe-signature': sig } },
    { status (s) { cap.status = s; return this }, json (b) { cap.body = b; return this } })
  return cap
}

test('1) Stripe checkout refund stamps original_conversion_event_id = the original event_id (cs_…), resolved by payment_intent', async (t) => {
  // The resolve read now returns distinct_id + event_id; event_id is the original
  // purchase's cs_… (its typed event_id == its attributed_conversions.conversion_event_id).
  const w = stripeWorld({ resolveRows: [{ distinct_id: 'visitor-real-1', event_id: 'cs_original_checkout_1' }] })
  t.after(stripeTeardown)

  const res = await sendRefund({ paymentIntent: 'pi_shared_1' })
  assert.equal(res.status, 200)
  const refundRow = w.rows.find(r => r.conversion_type === 'refund')
  assert.ok(refundRow, 'a refund row was written')
  assert.equal(refundRow.original_conversion_event_id, 'cs_original_checkout_1',
    'the pointer = the original checkout session id, carried through resolve → build → normalized Tinybird row')
  assert.equal(refundRow.distinct_id, 'visitor-real-1', 'still inherits the original visitor (unchanged)')
  assert.ok(!('attribution_status' in refundRow), 'resolved → not marked refund_unresolved')
})

test('3) subscription-mode refund (no payment_intent) → refund_unresolved and NO pointer stamped', async (t) => {
  const w = stripeWorld({ resolveRows: [] })   // irrelevant: no payment_intent → read never runs
  t.after(stripeTeardown)

  const res = await sendRefund({ paymentIntent: null })
  assert.equal(res.status, 200)
  const refundRow = w.rows.find(r => r.conversion_type === 'refund')
  assert.ok(refundRow, 'the refund still writes — never dropped')
  assert.equal(refundRow.attribution_status, 'refund_unresolved', 'degraded path preserved (founder-confirmed v1 boundary)')
  assert.ok(!('original_conversion_event_id' in refundRow), 'NO pointer — nothing to point at, never guessed')
})

test('4) Stripe refund whose original is NOT found → no pointer (no guess), degraded as today', async (t) => {
  const w = stripeWorld({ resolveRows: [] })   // read succeeds, matches nothing → not_found
  t.after(stripeTeardown)

  const res = await sendRefund({ paymentIntent: 'pi_unmatched' })
  assert.equal(res.status, 200)
  const refundRow = w.rows.find(r => r.conversion_type === 'refund')
  assert.equal(refundRow.attribution_status, 'refund_unresolved')
  assert.ok(!('original_conversion_event_id' in refundRow), 'no original resolved → no pointer')
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. SHOPIFY — unit-level on the builder (order_id is intrinsic to the payload).
// ─────────────────────────────────────────────────────────────────────────────
const SHOPIFY_SITE = { id: 'site-ki62-shop', site_key: 'sk_live_ki62shop' }
const shopifyRefundPayload = ({ orderId = 998877, refundId = 'r_1' } = {}) => ({
  id: refundId, order_id: orderId, currency: 'usd',
  transactions: [{ kind: 'refund', status: 'success', amount: '25.00' }]
})

test('2) Shopify refund stamps original_conversion_event_id = String(order_id) — the original order id', () => {
  const built = buildShopifyRefundConversion(shopifyRefundPayload({ orderId: 998877 }), SHOPIFY_SITE, 'visitor-shop-1')
  assert.ok(built, 'a refund conversion was built (amount > 0)')
  assert.equal(built.properties.original_conversion_event_id, '998877',
    'the pointer = String(order_id) = the original order’s event_id/conversion_event_id')
  // Numeric order id is stringified — the original order stored conversion_event_id = String(order.id).
  assert.equal(typeof built.properties.original_conversion_event_id, 'string')
})

test('2b) Shopify pointer is stamped even on the degraded (unresolved) path — it is intrinsic to the payload', () => {
  const built = buildShopifyRefundConversion(shopifyRefundPayload({ orderId: 555 }), SHOPIFY_SITE, undefined, { unresolved: true })
  assert.equal(built.properties.original_conversion_event_id, '555',
    'order_id is on the payload regardless of resolution, so a later nightly can still find the original')
  assert.equal(built.properties.attribution_status, 'refund_unresolved', 'degraded stamp still applied')
})

test('2c) Shopify refund with NO order_id stamps no pointer (nothing to point at)', () => {
  const payload = { id: 'r_x', currency: 'usd', transactions: [{ kind: 'refund', status: 'success', amount: '10.00' }] }
  const built = buildShopifyRefundConversion(payload, SHOPIFY_SITE, 'visitor-shop-2')
  assert.ok(built)
  assert.ok(!('original_conversion_event_id' in built.properties), 'no order_id → no pointer')
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. PIPE — the nightly row-pull PROJECTS the new column. Asserted against the
//    committed .pipe text, NOT a live deploy (deploy is founder-gated).
// ─────────────────────────────────────────────────────────────────────────────
test('5) nightly_conversions_by_site.pipe projects original_conversion_event_id (append-only, bag-extracted)', () => {
  const pipePath = join(__dirname, '..', '..', 'tinybird', 'pipes', 'nightly_conversions_by_site.pipe')
  const src = readFileSync(pipePath, 'utf8')
  assert.match(src,
    /JSONExtractString\(properties,\s*'original_conversion_event_id'\)\s+AS\s+original_conversion_event_id/,
    'pipe must extract the bag pointer and alias it so it reaches the nightly')
  // It must be the LAST projected column (append-only — the nightly maps the first 14
  // by name, so appending cannot disturb the existing positional consumer).
  const sql = src.slice(src.indexOf('SELECT'))
  const fromIdx = sql.search(/\bFROM\s+events/)
  const selectList = sql.slice(0, fromIdx)
  const lastCol = selectList.split(',').map(s => s.trim()).filter(Boolean).pop()
  assert.match(lastCol, /original_conversion_event_id/, 'the new column is appended LAST')
})
