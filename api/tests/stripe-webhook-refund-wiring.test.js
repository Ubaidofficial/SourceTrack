// Stripe-webhook REFUND wiring — TOKEN-FREE, NO network. Drives the real webhook
// route with a refund.created event and asserts the Phase-1 refund path:
//   - writeConversionDirect fires ONCE with a NEGATIVE conversion_value, event_id
//     stamped re_…, conversion_type='refund' (the compensating signed $conversion, §9)
//   - idempotency claimed with the REFUND-specific keys (provider_event_id + refund_id),
//     NEVER order_id/payment_id (which would collide with the purchase's claim)
//   - the conversion-limit gate (claim_site_conversion_usage) is NOT called — a refund
//     must not consume the customer's monthly quota
//   - a redelivery of the SAME refund is deduped → no second write
//   - an invalid amount (0/negative) → 200 ignored, no write
// Mirrors stripe-webhook-dualwrite-wiring.test.js (same DI/mocks + real signature).

import test from 'node:test'
import assert from 'node:assert'
import { gunzipSync } from 'node:zlib'
import Stripe from 'stripe'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getSupabase } = await import('../lib/supabase.js')
const { encryptSecret } = await import('../lib/utils.js')
const { stripeWebhookRouter } = await import('../routes/stripe-webhook.js')
const { __setConversionWriteTransportFactory, __resetConversionWriteTransportFactory } = await import('../../tinybird/adapter/conversion-write.js')

const stripe = new Stripe('fake_key_for_test_signature_only', { apiVersion: '2024-06-20' })

const SITE_KEY = 'sk_live_refundtest'
const WEBHOOK_SECRET = 'fake_webhook_secret_for_refund_test'
const SITE = { id: 'site-refund-1', site_key: SITE_KEY, encrypted_stripe_webhook_secret: encryptSecret(WEBHOOK_SECRET), plan: 'scale' }

// The refund's payment_intent EQUALS the purchase's payment_id (pi_…) — the exact
// collision the refund-specific keys must avoid.
const SHARED_PAYMENT_INTENT = 'pi_test_refund_789'
const refundEvent = ({ amount = 5000, id = 're_test_1', evt = 'evt_refund_1' } = {}) => ({
  id: evt, type: 'refund.created', created: 1_780_000_000,
  data: { object: { id, object: 'refund', amount, currency: 'usd', payment_intent: SHARED_PAYMENT_INTENT, charge: 'ch_1' } }
})

const layer = stripeWebhookRouter.stack.find(l => l.route?.path === '/:site_key' && l.route?.methods?.post)
const handler = layer.route.stack[layer.route.stack.length - 1].handle

function recorder () {
  const payloads = []
  const transport = async (payload) => { payloads.push(payload) }
  return { transport, lines: () => payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))) }
}
function resetDualWrite () { __resetConversionWriteTransportFactory(); delete process.env.TINYBIRD_DUAL_WRITE }

// Supabase mock: sites lookup + rpc recorder. `claim` toggles per call so a
// redelivery reads as a duplicate (data:false). Records EVERY rpc fn name so the
// test can assert the conversion-limit gate was never invoked.
const client = getSupabase()
const originalFrom = client.from
const originalRpc = client.rpc
function mockSupabase ({ claimResults = [true] } = {}) {
  const rpcCalls = []
  let claimIdx = 0
  client.from = (table) => {
    if (table === 'sites') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: SITE, error: null }), single: async () => ({ data: SITE, error: null }) }) }) }
    }
    return { insert: async () => ({ error: null }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
  }
  client.rpc = async (fn, params) => {
    rpcCalls.push({ fn, params })
    if (fn === 'claim_revenue_idempotency_keys') {
      const r = claimResults[Math.min(claimIdx, claimResults.length - 1)]; claimIdx++
      return { data: r, error: null }
    }
    if (fn === 'claim_site_conversion_usage') return { data: null, error: { message: 'mock' } }
    return { data: null, error: null }
  }
  return { rpcCalls }
}
function restoreSupabase () { client.from = originalFrom; client.rpc = originalRpc }

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
async function drive (eventObj) {
  const raw = Buffer.from(JSON.stringify(eventObj), 'utf8')
  const sig = stripe.webhooks.generateTestHeaderString({ payload: raw.toString('utf8'), secret: WEBHOOK_SECRET })
  const req = { params: { site_key: SITE_KEY }, headers: { 'stripe-signature': sig }, body: raw }
  const res = mockRes()
  await handler(req, res)
  return res
}

test('refund.created → ONE negative $conversion, event_id re_…, type=refund; refund-specific keys; quota untouched', async (t) => {
  t.after(() => { restoreSupabase(); resetDualWrite() })
  const { rpcCalls } = mockSupabase()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)

  const res = await drive(refundEvent({ amount: 5000 }))

  assert.strictEqual(res.statusCode, 200, `2xx (body: ${JSON.stringify(res.body)})`)

  // exactly one write, and it is the compensating SIGNED conversion
  const lines = rec.lines()
  assert.strictEqual(lines.length, 1, 'refund wrote exactly one $conversion')
  assert.strictEqual(lines[0].event_type, '$conversion', 'canonical event_type')
  assert.ok(lines[0].conversion_value < 0, `conversion_value NEGATIVE (got ${lines[0].conversion_value})`)
  assert.strictEqual(lines[0].conversion_value, -50, 'negative of 5000 cents = -50')
  assert.strictEqual(lines[0].conversion_type, 'refund', 'conversion_type=refund')
  assert.ok(String(lines[0].event_id).startsWith('re_'), `event_id stamped re_… (got ${lines[0].event_id})`)

  // refund-specific idempotency keys: provider_event_id (evt_…) + refund_id (re_…) ONLY
  const claim = rpcCalls.find(c => c.fn === 'claim_revenue_idempotency_keys')
  assert.ok(claim, 'idempotency claim attempted')
  const keyTypes = claim.params.p_keys.map(k => k.key_type).sort()
  assert.deepStrictEqual(keyTypes, ['provider_event_id', 'refund_id'], 'claims provider_event_id + refund_id')
  assert.ok(!keyTypes.includes('order_id') && !keyTypes.includes('payment_id'), 'NEVER reuses order_id/payment_id (purchase-collision guard)')
  const refundKey = claim.params.p_keys.find(k => k.key_type === 'refund_id')
  assert.ok(refundKey.key_value.startsWith('re_'), 'refund_id key is the re_… id')

  // quota gate must NOT run for a refund
  assert.ok(!rpcCalls.some(c => c.fn === 'claim_site_conversion_usage'), 'claim_site_conversion_usage NOT called (refund does not consume quota)')
})

test('refund redelivery (same event) → deduped, NO second write', async (t) => {
  t.after(() => { restoreSupabase(); resetDualWrite() })
  // first claim succeeds, second reads as a duplicate
  mockSupabase({ claimResults: [true, false] })
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)

  const first = await drive(refundEvent())
  const second = await drive(refundEvent())

  assert.strictEqual(first.statusCode, 200)
  assert.strictEqual(second.statusCode, 200)
  assert.strictEqual(second.body.duplicate, true, 'redelivery reported as duplicate')
  assert.strictEqual(rec.lines().length, 1, 'only the FIRST delivery wrote — no double-apply')
})

test('invalid amount (0) → 200 ignored, NO write, NO claim', async (t) => {
  t.after(() => { restoreSupabase(); resetDualWrite() })
  const { rpcCalls } = mockSupabase()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)

  const res = await drive(refundEvent({ amount: 0 }))

  assert.strictEqual(res.statusCode, 200, 'acked so Stripe does not retry a malformed refund forever')
  assert.strictEqual(res.body.ignored, true)
  assert.match(res.body.reason, /invalid refund amount/)
  assert.strictEqual(rec.lines().length, 0, 'no write for an invalid amount')
  assert.ok(!rpcCalls.some(c => c.fn === 'claim_revenue_idempotency_keys'), 'no idempotency claim before the amount is validated')
})

test('invalid amount (negative) → 200 ignored, NO write', async (t) => {
  t.after(() => { restoreSupabase(); resetDualWrite() })
  mockSupabase()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)

  const res = await drive(refundEvent({ amount: -100 }))

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.ignored, true)
  assert.strictEqual(rec.lines().length, 0, 'no write for a negative amount')
})
