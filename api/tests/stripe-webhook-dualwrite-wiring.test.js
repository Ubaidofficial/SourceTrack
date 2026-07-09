// Stripe-webhook dual-write wiring regression tests — TOKEN-FREE, NO network.
// Mirrors api/tests/pageview-dualwrite-wiring.test.js: drives the real webhook
// route, mocks ph.capture + the dual-write transport, and asserts BOTH
// $conversion sites (subscription + checkout) dual-write to Tinybird with the
// resolved distinctId + conversionProperties. Wave-1 cutover: ph.capture is
// REMOVED on the revenue rail, so it must NOT be called; Tinybird is the sole
// $conversion writer. Flag-OFF => no capture AND no dual-write.
//
// Signature verification is satisfied for real via stripe.webhooks
// .generateTestHeaderString + a webhook secret encrypted with the test
// ENCRYPTION_KEY (real decryptSecret round-trips). Gate mocks: sites lookup,
// idempotency rpc -> claimed, conversion-limit rpc -> error (route fails open).

import test from 'node:test'
import assert from 'node:assert'
import { gunzipSync } from 'node:zlib'
import Stripe from 'stripe'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { ph } = await import('../lib/posthog.js')
const { getSupabase } = await import('../lib/supabase.js')
const { encryptSecret } = await import('../lib/utils.js')
const { stripeWebhookRouter } = await import('../routes/stripe-webhook.js')
const { setDualWriteTransport, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')

// Arbitrary non-secret strings (mirrors stripe-webhook.js's own 'fake_key_…'
// construct). The constructor key is never used for API calls here — only
// stripe.webhooks.generateTestHeaderString, which HMACs with WEBHOOK_SECRET.
// Kept free of sk_test_/whsec_ prefixes so the repo secret-safety audit passes.
const stripe = new Stripe('fake_key_for_test_signature_only', { apiVersion: '2024-06-20' })

const SITE_KEY = 'sk_live_wiringtest'
const WEBHOOK_SECRET = 'fake_webhook_secret_for_wiring_test'
const ANON_ID = '11111111-1111-4111-8111-111111111111'
const SITE = { id: 'site-webhook-1', site_key: SITE_KEY, encrypted_stripe_webhook_secret: encryptSecret(WEBHOOK_SECRET), plan: 'scale' }

// ── route POST handler ──────────────────────────────────────────────────────
const layer = stripeWebhookRouter.stack.find(l => l.route?.path === '/:site_key' && l.route?.methods?.post)
const handler = layer.route.stack[layer.route.stack.length - 1].handle

// ── dual-write transport recorder (mirrors the pageview suite) ──────────────
function recorder () {
  const payloads = []
  const transport = async (payload) => { payloads.push(payload) }
  return { transport, lines: () => payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))) }
}
const BATCH_OPTS = { flushAt: 1000, flushInterval: 0 }
function resetDualWrite () { setDualWriteTransport(null); delete process.env.TINYBIRD_DUAL_WRITE }

// ── ph.capture mock ─────────────────────────────────────────────────────────
const originalCapture = ph.capture
let captureCalls = []
function mockCapture () { captureCalls = []; ph.capture = (args) => { captureCalls.push(args); return Promise.resolve() } }
function restoreCapture () { ph.capture = originalCapture }

// ── Supabase mock: sites lookup + idempotency-claim rpc + benign inserts ─────
const client = getSupabase()
const originalFrom = client.from
const originalRpc = client.rpc
function mockSupabase () {
  client.from = (table) => {
    if (table === 'sites') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: SITE, error: null }), single: async () => ({ data: SITE, error: null }) }) }) }
    }
    return { insert: async () => ({ error: null }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
  }
  client.rpc = async (fn) => {
    if (fn === 'claim_revenue_idempotency_keys') return { data: true, error: null }      // claimed (not duplicate)
    if (fn === 'claim_site_conversion_usage') return { data: null, error: { message: 'mock' } } // -> route fails open (allowed)
    return { data: null, error: null }
  }
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

// Checkout one-shot purchase; anonymous_id in metadata -> distinctId short-circuit.
const checkoutEvent = () => ({
  id: 'evt_checkout_1', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000),
  data: { object: { id: 'cs_test_1', amount_total: 5000, currency: 'usd', payment_intent: 'pi_test_1', metadata: { anonymous_id: ANON_ID } } }
})
// First subscription invoice -> mapSubscriptionEvent yields a non-skip conversion.
const subscriptionEvent = () => ({
  id: 'evt_invoice_1', type: 'invoice.paid', created: Math.floor(Date.now() / 1000),
  data: { object: { id: 'in_test_1', customer: 'cus_1', subscription: 'sub_1', billing_reason: 'subscription_create', amount_paid: 4900, currency: 'usd', metadata: { anonymous_id: ANON_ID } } }
})

for (const [label, makeEvent] of [['checkout.session.completed', checkoutEvent], ['invoice.paid (subscription)', subscriptionEvent]]) {
  test(`stripe-webhook dual-write — ${label}: Tinybird dual-write fires once; ph.capture NOT called (Wave-1 cutover)`, async (t) => {
    t.after(() => { restoreCapture(); restoreSupabase(); resetDualWrite() })
    mockCapture(); mockSupabase(); resetDualWrite()
    process.env.TINYBIRD_DUAL_WRITE = 'true'
    const rec = recorder(); setDualWriteTransport(rec.transport, BATCH_OPTS)

    const res = await drive(makeEvent())

    assert.strictEqual(res.statusCode, 200, `2xx (body: ${JSON.stringify(res.body)})`)
    assert.strictEqual(captureCalls.length, 0, 'ph.capture must NOT be called (Wave-1: Tinybird is the sole $conversion writer)')

    await __getDualWriteBatcher().flush()
    const lines = rec.lines()
    assert.strictEqual(lines.length, 1, 'dual-write fired exactly once')
    assert.strictEqual(lines[0].event_type, '$conversion', 'canonical event_type')
    assert.strictEqual(lines[0].distinct_id, ANON_ID, 'dual-write distinct_id === the resolved conversion distinctId')
    assert.strictEqual(lines[0].site_id, SITE.id, 'conversionProperties carried through (site_id)')
    assert.ok(!('site_key' in lines[0]), 'site_key dropped by the adapter')
  })

  test(`stripe-webhook dual-write — ${label}: flag OFF => no ph.capture AND no dual-write`, async (t) => {
    t.after(() => { restoreCapture(); restoreSupabase(); resetDualWrite() })
    mockCapture(); mockSupabase(); resetDualWrite() // TINYBIRD_DUAL_WRITE unset
    const rec = recorder(); setDualWriteTransport(rec.transport, BATCH_OPTS)

    const res = await drive(makeEvent())

    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(captureCalls.length, 0, 'ph.capture removed — never called')
    // Post-cutover: with the flag off, $conversion is written NOWHERE (Tinybird is the
    // sole writer and it is gated). Prod runs with TINYBIRD_DUAL_WRITE=true (Gate 0).
    assert.strictEqual(rec.lines().length, 0, 'no dual-write when flag is off')
  })
}
