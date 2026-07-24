// Phase 7 PR1 — refund → original-conversion resolution. TOKEN-FREE, NO network.
// Two levels:
//   UNIT  — resolveOriginalDistinctId + buildRefundConversion with an injected read.
//   ROUTE — drives the real webhook (reuses the wiring harness) to prove the
//           inherited distinct_id / degraded stamp actually reach the written row.
//
// FIXTURES ARE WEBHOOK-SHAPED: a real Stripe purchase EVENT stamps
// first_touch_source='stripe'. We assert the refund does NOT copy a true acquiring
// source (that would fabricate negative revenue on a source it never earned); the
// Supabase-side correction is the nightly's job via the inherited distinct_id.
// We deliberately do NOT assert source recovery against any 'tiktok'-on-a-purchase
// fixture — that shape the live code never produces.

import test from 'node:test'
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'
import Stripe from 'stripe'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const {
  buildRefundConversion, resolveOriginalDistinctId,
  __setRefundResolveRead, __resetRefundResolveRead
} = await import('../lib/stripe-refund.js')
const { getSupabase } = await import('../lib/supabase.js')
const { encryptSecret } = await import('../lib/utils.js')
const { stripeWebhookRouter } = await import('../routes/stripe-webhook.js')
const { __setConversionWriteTransportFactory, __resetConversionWriteTransportFactory } = await import('../../tinybird/adapter/conversion-write.js')

const SITE = { id: 'site-refund-1', site_key: 'sk_live_refundtest' }

// ── UNIT: resolveOriginalDistinctId ─────────────────────────────────────────

test('(a) resolved: resolves the original distinct_id AND the KI-62 pointer (its event_id) from a payment_id match', async () => {
  const reads = []
  // The real read now SELECTs distinct_id, event_id (stripe-refund.js) — the row carries both.
  const readFn = async ({ siteId, key, value }) => {
    reads.push({ siteId, key, value })
    return key === 'payment_id' && value === 'pi_1' ? [{ distinct_id: 'visitor-real-1', event_id: 'cs_original_1' }] : []
  }
  const r = await resolveOriginalDistinctId({ paymentId: 'pi_1', siteId: SITE.id }, { readFn })
  assert.deepEqual(r, { status: 'resolved', distinctId: 'visitor-real-1', originalConversionEventId: 'cs_original_1' })
  assert.equal(reads[0].key, 'payment_id')
})

test('(a2) KI-62: an older read seam that returns only distinct_id → resolved with a NULL pointer (never breaks resolution)', async () => {
  const readFn = async () => [{ distinct_id: 'visitor-real-1' }]   // no event_id in the row
  const r = await resolveOriginalDistinctId({ paymentId: 'pi_1', siteId: SITE.id }, { readFn })
  assert.deepEqual(r, { status: 'resolved', distinctId: 'visitor-real-1', originalConversionEventId: null })
})

test('(c) not_found: read succeeds but matches nothing → not_found (resolved-to-nothing)', async () => {
  const readFn = async () => []                    // [] = definitively no match
  const r = await resolveOriginalDistinctId({ paymentId: 'pi_x', siteId: SITE.id }, { readFn })
  assert.deepEqual(r, { status: 'not_found' })
})

test('(c2) no payment_intent → not_found, no read attempted', async () => {
  let called = false
  const readFn = async () => { called = true; return [] }
  const r = await resolveOriginalDistinctId({ paymentId: null, siteId: SITE.id }, { readFn })
  assert.deepEqual(r, { status: 'not_found' })
  assert.equal(called, false, 'no key → nothing to look up, read never called')
})

test('(d) Tinybird null → unavailable (NOT mistaken for not_found)', async () => {
  const readFn = async () => null                  // null = read FAILED
  const r = await resolveOriginalDistinctId({ paymentId: 'pi_1', siteId: SITE.id }, { readFn })
  assert.deepEqual(r, { status: 'unavailable' }, 'a failed read must be unavailable, never a silent miss')
})

// NOTE: no invoice-fallback test — a Stripe Refund object has no `invoice` field
// (identifiers are `charge` + `payment_intent` only), so payment_intent is the sole
// join key. A subscription-mode refund without a payment_intent resolves as
// refund_unresolved by design (Invoice Payment lookup deferred to a later PR).

// ── UNIT: buildRefundConversion (no-copy + degraded stamp) ───────────────────

const refundObj = (over = {}) => ({
  id: 're_1', created: 1_780_000_000,
  data: { object: { id: 're_1', object: 'refund', amount: 5000, currency: 'usd', payment_intent: 'pi_1', ...over } }
})

test('(a) buildRefundConversion inherits the resolved distinct_id', () => {
  const { distinctId } = buildRefundConversion(refundObj(), SITE, 'visitor-real-1', { unresolved: false })
  assert.equal(distinctId, 'visitor-real-1')
})

test('(b) NO source copy: refund keeps stripe/webhook stamps; no acquiring source fabricated', () => {
  // Even a resolved refund keeps the symmetric 'stripe' carrier — the original
  // webhook event is 'stripe' too, so copying it would be pointless, and stamping a
  // TRUE source here alone would fabricate negative revenue on that source (§5.1).
  const { properties } = buildRefundConversion(refundObj(), SITE, 'visitor-real-1', { unresolved: false })
  assert.equal(properties.first_touch_source, 'stripe')
  assert.equal(properties.first_touch_medium, 'webhook')
  assert.equal(properties.utm_source, 'stripe')
  assert.equal(properties.conversion_value, -50)
  assert.equal(properties.conversion_type, 'refund')
  assert.equal(properties.attribution_status, undefined, 'resolved refund carries NO refund_unresolved flag')
  // Guard: no property was set to a plausible acquiring source.
  for (const v of Object.values(properties)) {
    assert.ok(!['tiktok', 'google', 'facebook', 'reddit', 'newsletter'].includes(v),
      `no acquiring source may be fabricated onto the refund (found "${v}")`)
  }
})

test('(c/d) unresolved: phantom distinct_id retained + attribution_status=refund_unresolved', () => {
  const { distinctId, properties } = buildRefundConversion(refundObj(), SITE, undefined, { unresolved: true })
  assert.ok(distinctId.startsWith('stripe_refund:'), `phantom retained (got ${distinctId})`)
  assert.equal(properties.attribution_status, 'refund_unresolved')
  assert.equal(properties.conversion_value, -50, 'still a real negative refund row — never dropped')
})

// ── ROUTE: drive the real webhook (inherited id / degraded stamp reach the row) ──

const stripe = new Stripe('fake_key_for_test_signature_only', { apiVersion: '2024-06-20' })
const SITE_KEY = 'sk_live_refundtest'
const WEBHOOK_SECRET = 'fake_webhook_secret_for_refund_test'
const ROUTE_SITE = { id: 'site-refund-1', site_key: SITE_KEY, encrypted_stripe_webhook_secret: encryptSecret(WEBHOOK_SECRET), plan: 'scale' }

const refundEvent = ({ amount = 5000, id = 're_test_1', evt = 'evt_refund_1', payment_intent = 'pi_test_1' } = {}) => ({
  id: evt, type: 'refund.created', created: 1_780_000_000,
  data: { object: { id, object: 'refund', amount, currency: 'usd', payment_intent, charge: 'ch_1' } }
})

const layer = stripeWebhookRouter.stack.find(l => l.route?.path === '/:site_key' && l.route?.methods?.post)
const handler = layer.route.stack[layer.route.stack.length - 1].handle

function recorder () {
  const payloads = []
  return { transport: async (p) => { payloads.push(p) }, lines: () => payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse)) }
}
const client = getSupabase()
const originalFrom = client.from
const originalRpc = client.rpc
function mockSupabase ({ claimResults = [true] } = {}) {
  let idx = 0
  client.from = (table) => table === 'sites'
    ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ROUTE_SITE, error: null }), single: async () => ({ data: ROUTE_SITE, error: null }) }) }) }
    : { insert: async () => ({ error: null }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
  client.rpc = async (fn) => {
    if (fn === 'claim_revenue_idempotency_keys') { const r = claimResults[Math.min(idx, claimResults.length - 1)]; idx++; return { data: r, error: null } }
    return { data: null, error: null }
  }
}
function restore () { client.from = originalFrom; client.rpc = originalRpc; __resetConversionWriteTransportFactory(); __resetRefundResolveRead(); delete process.env.TINYBIRD_DUAL_WRITE }
async function drive (eventObj) {
  const raw = Buffer.from(JSON.stringify(eventObj), 'utf8')
  const sig = stripe.webhooks.generateTestHeaderString({ payload: raw.toString('utf8'), secret: WEBHOOK_SECRET })
  const res = { statusCode: 200, body: null, status (c) { this.statusCode = c; return this }, json (b) { this.body = b; return this } }
  await handler({ params: { site_key: SITE_KEY }, headers: { 'stripe-signature': sig }, body: raw }, res)
  return res
}

test('(a-route) resolved refund writes ONE row with the INHERITED distinct_id, stripe stamp intact', async (t) => {
  t.after(restore)
  mockSupabase()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)
  __setRefundResolveRead(async ({ key }) => (key === 'payment_id' ? [{ distinct_id: 'visitor-real-1' }] : []))

  const res = await drive(refundEvent())
  assert.equal(res.statusCode, 200)
  const lines = rec.lines()
  assert.equal(lines.length, 1, 'exactly one row')
  assert.equal(lines[0].distinct_id, 'visitor-real-1', 'inherited the original visitor id')
  assert.equal(lines[0].first_touch_source, 'stripe', 'symmetric stripe stamp — no fabricated source')
  assert.equal(lines[0].conversion_value, -50)
  assert.equal(lines[0].attribution_status ?? null, null, 'resolved → no refund_unresolved flag')
})

test('(c-route) payment_intent null → phantom retained, attribution_status=refund_unresolved, 200, no throw', async (t) => {
  t.after(restore)
  mockSupabase()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)
  // resolve read must not even be needed (no key); leave default env seam (would return null w/o config) — but assert phantom regardless
  __setRefundResolveRead(async () => [])

  const res = await drive(refundEvent({ payment_intent: null }))
  assert.equal(res.statusCode, 200)
  const lines = rec.lines()
  assert.equal(lines.length, 1, 'the refund is NEVER dropped')
  assert.ok(String(lines[0].distinct_id).startsWith('stripe_refund:'), 'phantom retained')
  assert.equal(lines[0].attribution_status, 'refund_unresolved')
})

test('(d-route) Tinybird read returns null → phantom + refund_unresolved, 200, no throw', async (t) => {
  t.after(restore)
  mockSupabase()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)
  __setRefundResolveRead(async () => null)          // Tinybird unavailable

  const res = await drive(refundEvent())
  assert.equal(res.statusCode, 200)
  const lines = rec.lines()
  assert.equal(lines.length, 1)
  assert.ok(String(lines[0].distinct_id).startsWith('stripe_refund:'))
  assert.equal(lines[0].attribution_status, 'refund_unresolved', 'a failed read is queryable, not silent')
})

test('(e) idempotency: replayed refund.created writes EXACTLY ONE row', async (t) => {
  t.after(restore)
  mockSupabase({ claimResults: [true, false] })     // 2nd claim reads as duplicate
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)
  __setRefundResolveRead(async () => [{ distinct_id: 'visitor-real-1' }])

  const first = await drive(refundEvent())
  const second = await drive(refundEvent())
  assert.equal(first.statusCode, 200)
  assert.equal(second.statusCode, 200)
  assert.equal(second.body.duplicate, true, 'redelivery reported duplicate')
  assert.equal(rec.lines().length, 1, 'exactly one write across the replay')
})
