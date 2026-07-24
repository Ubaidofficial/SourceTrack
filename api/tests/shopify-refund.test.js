// PR4 — Shopify refund netting. TOKEN-FREE, NO network. Drives the REAL shopify
// webhook route with a refunds/create event (real HMAC) and captures the
// dual-write batcher output. Mirrors the Stripe refund tests (#381).
//
// Fixtures are webhook-shaped: the original order stamps first_touch_source='shopify'.
// We do NOT assert against the 12,202 seeded generate_events.js refunds.

import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { gunzipSync } from 'node:zlib'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const {
  extractShopifyRefundAmount, resolveOriginalDistinctIdByOrderId, buildShopifyRefundConversion,
  __setShopifyRefundResolveRead, __resetShopifyRefundResolveRead
} = await import('../lib/shopify-refund.js')
const { getSupabase } = await import('../lib/supabase.js')
const { encryptSecret } = await import('../lib/utils.js')
const { shopifyWebhookRouter } = await import('../routes/shopify-webhook.js')
const { setDualWriteTransport, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')

const SITE_ID = 'site-shopify-1'
const SITE = { id: SITE_ID }

// ── UNIT: extractShopifyRefundAmount (STEP 4 — partial) ──────────────────────

test('amount: sums refund transactions (partial nets the partial, NOT the order total)', () => {
  assert.equal(extractShopifyRefundAmount({ transactions: [{ kind: 'refund', status: 'success', amount: '30.00' }] }), 30)
  assert.equal(extractShopifyRefundAmount({ transactions: [
    { kind: 'refund', status: 'success', amount: '10.50' }, { kind: 'refund', status: 'success', amount: '4.50' },
    { kind: 'sale', status: 'success', amount: '999' }                       // non-refund txn ignored
  ] }), 15)
})
test('amount: falls back to refund_line_items subtotals when no transactions', () => {
  assert.equal(extractShopifyRefundAmount({ refund_line_items: [{ subtotal: '20' }, { subtotal: '5' }] }), 25)
})
test('amount: $0 (restock-only) → 0', () => {
  assert.equal(extractShopifyRefundAmount({ transactions: [], refund_line_items: [] }), 0)
})

// ── UNIT: resolveOriginalDistinctIdByOrderId ─────────────────────────────────

test('resolve: order_id match → resolved distinct_id', async () => {
  const readFn = async ({ orderId }) => (orderId === '555' ? [{ distinct_id: 'visitor-real-1' }] : [])
  assert.deepEqual(await resolveOriginalDistinctIdByOrderId({ orderId: 555, siteId: SITE_ID }, { readFn }),
    { status: 'resolved', distinctId: 'visitor-real-1' })
})
test('resolve: no order_id → not_found (no read)', async () => {
  let called = false
  const r = await resolveOriginalDistinctIdByOrderId({ orderId: null, siteId: SITE_ID }, { readFn: async () => { called = true; return [] } })
  assert.deepEqual(r, { status: 'not_found' })
  assert.equal(called, false)
})
test('resolve: empty match → not_found; null read → unavailable (distinct)', async () => {
  assert.deepEqual(await resolveOriginalDistinctIdByOrderId({ orderId: 1, siteId: SITE_ID }, { readFn: async () => [] }), { status: 'not_found' })
  assert.deepEqual(await resolveOriginalDistinctIdByOrderId({ orderId: 1, siteId: SITE_ID }, { readFn: async () => null }), { status: 'unavailable' })
})

// ── UNIT: buildShopifyRefundConversion ───────────────────────────────────────

const refundPayload = (over = {}) => ({ id: 999, order_id: 555, currency: 'usd', processed_at: '2026-07-24T00:00:00Z',
  transactions: [{ kind: 'refund', status: 'success', amount: '100.00' }], ...over })

test('build: negative value, refund type, inherited id, refund-specific event_id', () => {
  const b = buildShopifyRefundConversion(refundPayload(), SITE, 'visitor-real-1', { unresolved: false })
  assert.equal(b.distinctId, 'visitor-real-1')
  assert.equal(b.properties.conversion_value, -100)
  assert.equal(b.properties.conversion_type, 'refund')
  assert.equal(b.properties.event_id, 'shopify_refund:999')
  assert.equal(b.properties.conversion_event_id, 'shopify_refund:999', 'refund-keyed → no collision with the order id 555')
})
test('build: NO source copy; no acquiring source fabricated; resolved carries no unresolved flag', () => {
  const { properties } = buildShopifyRefundConversion(refundPayload(), SITE, 'visitor-real-1', { unresolved: false })
  assert.equal(properties.first_touch_source, 'shopify')
  assert.equal(properties.utm_source, 'shopify')
  assert.equal(properties.attribution_status, undefined)
  for (const v of Object.values(properties)) {
    assert.ok(!['tiktok', 'google', 'facebook', 'reddit', 'newsletter'].includes(v), `no acquiring source fabricated (${v})`)
  }
})
test('build: unresolved → phantom distinct_id + attribution_status=refund_unresolved', () => {
  const b = buildShopifyRefundConversion(refundPayload(), SITE, undefined, { unresolved: true })
  assert.ok(b.distinctId.startsWith('shopify_refund:'))
  assert.equal(b.properties.attribution_status, 'refund_unresolved')
  assert.equal(b.properties.conversion_value, -100)
})
test('build: $0 refund → null (no row)', () => {
  assert.equal(buildShopifyRefundConversion(refundPayload({ transactions: [] }), SITE, 'v1'), null)
})

// ── ROUTE: drive the real shopify handler (refunds/create) ───────────────────

const SITE_KEY = 'sk_shopify_test'
const SECRET = 'shopify_shared_secret_for_test'
const ROUTE_SITE = { id: SITE_ID, site_key: SITE_KEY, encrypted_shopify_shared_secret: encryptSecret(SECRET), plan: 'scale' }
const BATCH_OPTS = { flushAt: 1000, flushInterval: 0 }

const layer = shopifyWebhookRouter.stack.find(l => l.route?.path === '/:site_key' && l.route?.methods?.post)
const handler = layer.route.stack[layer.route.stack.length - 1].handle

function recorder () {
  const payloads = []
  return { transport: async (p) => { payloads.push(p) }, lines: () => payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse)) }
}
const client = getSupabase()
const realFrom = client.from
const realRpc = client.rpc
function mockSupabase ({ claimResults = [true] } = {}) {
  let i = 0
  client.from = (table) => table === 'sites'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ROUTE_SITE, error: null }) }) }) }
    : { insert: async () => ({ error: null }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
  client.rpc = async (fn) => {
    if (fn === 'claim_revenue_idempotency_keys') { const r = claimResults[Math.min(i, claimResults.length - 1)]; i++; return { data: r, error: null } }
    return { data: null, error: null }
  }
}
function restore () { client.from = realFrom; client.rpc = realRpc; setDualWriteTransport(null); __resetShopifyRefundResolveRead(); delete process.env.TINYBIRD_DUAL_WRITE }

const sign = (raw) => crypto.createHmac('sha256', SECRET).update(raw).digest('base64')
async function drive (topic, obj, { webhookId = 'wh_1' } = {}) {
  const raw = Buffer.from(JSON.stringify(obj), 'utf8')
  const req = { params: { site_key: SITE_KEY }, headers: { 'x-shopify-topic': topic, 'x-shopify-hmac-sha256': sign(raw), 'x-shopify-webhook-id': webhookId }, body: raw }
  const res = { statusCode: 200, body: null, status (c) { this.statusCode = c; return this }, json (b) { this.body = b; return this } }
  await handler(req, res)
  return res
}

test('(route) refunds/create → ONE negative row, correct amount, inherited distinct_id, refund-typed', async (t) => {
  t.after(restore)
  mockSupabase()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); setDualWriteTransport(rec.transport, BATCH_OPTS)
  __setShopifyRefundResolveRead(async () => [{ distinct_id: 'visitor-real-1' }])

  const res = await drive('refunds/create', refundPayload())
  assert.equal(res.statusCode, 200)
  await __getDualWriteBatcher().flush()
  const lines = rec.lines()
  assert.equal(lines.length, 1, 'exactly one row')
  assert.equal(lines[0].conversion_value, -100)
  assert.equal(lines[0].conversion_type, 'refund', 'typed refund → inherits PR2a/2b count exclusion in BOTH stores')
  assert.equal(lines[0].distinct_id, 'visitor-real-1', 'inherited the original order visitor')
  assert.equal(lines[0].first_touch_source, 'shopify', 'symmetric stamp; no fabricated source')
})

test('(route) PARTIAL refund nets the partial amount, not the order total', async (t) => {
  t.after(restore)
  mockSupabase()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); setDualWriteTransport(rec.transport, BATCH_OPTS)
  __setShopifyRefundResolveRead(async () => [{ distinct_id: 'visitor-real-1' }])

  await drive('refunds/create', refundPayload({ transactions: [{ kind: 'refund', status: 'success', amount: '30.00' }] }))
  await __getDualWriteBatcher().flush()
  assert.equal(rec.lines()[0].conversion_value, -30, 'the partial refund, not -100')
})

test('(route) unresolved (Tinybird null) → phantom + refund_unresolved, 200, no throw', async (t) => {
  t.after(restore)
  mockSupabase()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); setDualWriteTransport(rec.transport, BATCH_OPTS)
  __setShopifyRefundResolveRead(async () => null)

  const res = await drive('refunds/create', refundPayload())
  assert.equal(res.statusCode, 200)
  await __getDualWriteBatcher().flush()
  const lines = rec.lines()
  assert.equal(lines.length, 1)
  assert.ok(String(lines[0].distinct_id).startsWith('shopify_refund:'))
  assert.equal(lines[0].attribution_status, 'refund_unresolved')
})

test('(route) idempotency: replayed refunds/create writes EXACTLY ONE row', async (t) => {
  t.after(restore)
  mockSupabase({ claimResults: [true, false] })
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); setDualWriteTransport(rec.transport, BATCH_OPTS)
  __setShopifyRefundResolveRead(async () => [{ distinct_id: 'visitor-real-1' }])

  const first = await drive('refunds/create', refundPayload())
  const second = await drive('refunds/create', refundPayload())
  await __getDualWriteBatcher().flush()
  assert.equal(first.statusCode, 200)
  assert.equal(second.body.duplicate, true, 'replay is a duplicate')
  assert.equal(rec.lines().length, 1, 'exactly one write across the replay')
})

test('(route) restock-only $0 (source PRESENT, sum 0) → 200 ignored, NO row', async (t) => {
  t.after(restore)
  mockSupabase()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); setDualWriteTransport(rec.transport, BATCH_OPTS)
  __setShopifyRefundResolveRead(async () => [{ distinct_id: 'visitor-real-1' }])

  const res = await drive('refunds/create', refundPayload({ transactions: [], refund_line_items: [{ subtotal: '0' }] }))
  assert.equal(res.statusCode, 200)
  assert.match(JSON.stringify(res.body), /restock-only/)
  { const b = __getDualWriteBatcher(); if (b) await b.flush() }
  assert.equal(rec.lines().length, 0, 'a genuine $0 refund writes no row')
})

test('🔴 (route) PARSE FAILURE (both sources ABSENT) → 500 (retry), NOT a silent $0 200', async (t) => {
  t.after(restore)
  mockSupabase()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); setDualWriteTransport(rec.transport, BATCH_OPTS)
  __setShopifyRefundResolveRead(async () => [{ distinct_id: 'visitor-real-1' }])

  // No transactions[], no refund_line_items[] — a shape/include_fields failure.
  const res = await drive('refunds/create', { id: 999, order_id: 555, currency: 'usd' })
  assert.equal(res.statusCode, 500, 'a payload with no amount source must NOT be acked 200 — Shopify must retry')
  { const b = __getDualWriteBatcher(); if (b) await b.flush() }
  assert.equal(rec.lines().length, 0, 'nothing written on a parse failure')
})

test('(route) a NEGATIVE value on orders/paid is STILL rejected (guard unchanged)', async (t) => {
  t.after(restore)
  mockSupabase()
  const res = await drive('orders/paid', { id: 777, total_price: '-5.00', currency: 'USD' })
  assert.equal(res.statusCode, 400, 'orders/paid negative → 400, the refund path did not weaken this')
  assert.match(JSON.stringify(res.body), /Invalid conversion value/)
})
