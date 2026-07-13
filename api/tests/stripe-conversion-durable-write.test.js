// MONEY PATH — $conversion durable-write tests. Closes the revenue-loss hole:
// the $conversion now takes a DIRECT, AWAITED, RETRIED write (writeConversionDirect),
// so a Tinybird failure rolls the idempotency claim back and returns 500 (Stripe
// redelivers) instead of committing the claim + 200 + silently dropping the event.
//
// Drives the REAL webhook route with a real Stripe test signature; mocks the sites
// lookup + idempotency rpc + records rollback deletes; injects the conversion-write
// transport factory (no network, no token). Mirrors stripe-webhook-dualwrite-wiring.test.js.

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
const {
  writeConversionDirect, __setConversionWriteTransportFactory, __resetConversionWriteTransportFactory
} = await import('../../tinybird/adapter/conversion-write.js')
const { createRetryingTinybirdTransport } = await import('../../tinybird/adapter/transport.js')
const { setDualWriteTransport, dualWriteEvent } = await import('../../tinybird/adapter/dual-write.js')

const stripe = new Stripe('fake_key_for_test_signature_only', { apiVersion: '2024-06-20' })
const SITE_KEY = 'sk_live_durabletest'
const WEBHOOK_SECRET = 'fake_webhook_secret_for_durable_test'
const ANON_ID = '11111111-1111-4111-8111-111111111111'
const SITE = { id: 'site-durable-1', site_key: SITE_KEY, encrypted_stripe_webhook_secret: encryptSecret(WEBHOOK_SECRET), plan: 'scale' }

const layer = stripeWebhookRouter.stack.find(l => l.route?.path === '/:site_key' && l.route?.methods?.post)
const handler = layer.route.stack[layer.route.stack.length - 1].handle

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
async function drive (eventObj) {
  const raw = Buffer.from(JSON.stringify(eventObj), 'utf8')
  const sig = stripe.webhooks.generateTestHeaderString({ payload: raw.toString('utf8'), secret: WEBHOOK_SECRET })
  const res = mockRes()
  await handler({ params: { site_key: SITE_KEY }, headers: { 'stripe-signature': sig }, body: raw }, res)
  return res
}
const checkoutEvent = () => ({
  id: 'evt_checkout_d', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000),
  data: { object: { id: 'cs_test_d', amount_total: 5000, currency: 'usd', payment_intent: 'pi_test_d', metadata: { anonymous_id: ANON_ID } } }
})
const subscriptionEvent = () => ({
  id: 'evt_invoice_d', type: 'invoice.paid', created: Math.floor(Date.now() / 1000),
  data: { object: { id: 'in_test_d', customer: 'cus_d', subscription: 'sub_d', billing_reason: 'subscription_create', amount_paid: 4900, currency: 'usd', metadata: { anonymous_id: ANON_ID } } }
})

// ── Supabase mock: sites + idempotency claim rpc + rollback-delete recorder ────
const client = getSupabase()
const originalFrom = client.from
const originalRpc = client.rpc
let rollbackDeletes = []
function mockSupabase () {
  rollbackDeletes = []
  client.from = (table) => {
    if (table === 'sites') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: SITE, error: null }), single: async () => ({ data: SITE, error: null }) }) }) }
    }
    if (table === 'revenue_idempotency_keys') {
      const chain = { eq: () => chain, then: (resolve) => resolve({ error: null }) }
      return { delete: () => { rollbackDeletes.push(1); return chain }, insert: async () => ({ error: null }) }
    }
    return { insert: async () => ({ error: null }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
  }
  client.rpc = async (fn) => {
    if (fn === 'claim_revenue_idempotency_keys') return { data: true, error: null }       // claimed (not duplicate)
    if (fn === 'claim_site_conversion_usage') return { data: null, error: { message: 'mock' } } // -> fail open (allowed)
    return { data: null, error: null }
  }
}
function restoreSupabase () { client.from = originalFrom; client.rpc = originalRpc }
function reset () { restoreSupabase(); __resetConversionWriteTransportFactory(); delete process.env.TINYBIRD_DUAL_WRITE }

function recorder () {
  const payloads = []
  return { transport: async (p) => { payloads.push(p) }, lines: () => payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))) }
}

for (const [label, makeEvent] of [['checkout', checkoutEvent], ['subscription', subscriptionEvent]]) {
  test(`(a) ${label}: Tinybird write FAILS -> claim ROLLED BACK, response 500 (NOT 200)`, async (t) => {
    t.after(reset)
    mockSupabase(); process.env.TINYBIRD_DUAL_WRITE = 'true'
    __setConversionWriteTransportFactory(() => async () => { throw new Error('tinybird down (retries exhausted)') })
    const res = await drive(makeEvent())
    assert.strictEqual(res.statusCode, 500, 'must be 500 so Stripe redelivers — NOT a 200 that drops the event')
    assert.notStrictEqual(res.statusCode, 200)
    assert.ok(rollbackDeletes.length > 0, 'the idempotency claim was rolled back (deleted from revenue_idempotency_keys)')
  })

  test(`(b) ${label}: write FAILS -> claim released so Stripe redelivery is NOT blocked as duplicate`, async (t) => {
    t.after(reset)
    mockSupabase(); process.env.TINYBIRD_DUAL_WRITE = 'true'
    __setConversionWriteTransportFactory(() => async () => { throw new Error('tinybird 503') })
    await drive(makeEvent())
    // Rollback deleted the claimed keys -> a redelivery's claim will NOT see a duplicate.
    assert.ok(rollbackDeletes.length > 0, 'claim keys deleted -> redelivery re-attempts instead of being skipped')
  })

  test(`(c) ${label}: write SUCCEEDS -> claim HOLDS (no rollback), 200, event written exactly once`, async (t) => {
    t.after(reset)
    mockSupabase(); process.env.TINYBIRD_DUAL_WRITE = 'true'
    const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)
    const res = await drive(makeEvent())
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(rollbackDeletes.length, 0, 'claim held — NOT rolled back on success')
    const lines = rec.lines()
    assert.strictEqual(lines.length, 1, 'written exactly once')
    assert.strictEqual(lines[0].event_type, '$conversion')
    assert.strictEqual(lines[0].site_id, SITE.id)
    assert.ok(!('site_key' in lines[0]), 'site_key dropped by the adapter')
  })

  test(`(e) ${label}: transient 429 -> withRetry recovers -> 200 (retry still works end-to-end)`, async (t) => {
    t.after(reset)
    mockSupabase(); process.env.TINYBIRD_DUAL_WRITE = 'true'
    let calls = 0
    const mockFetch = async () => {
      calls++
      if (calls === 1) return { status: 429, headers: { get: () => null }, text: async () => 'rate limited' }
      return { status: 202, json: async () => ({ successful_rows: 1, quarantined_rows: 0 }) }
    }
    __setConversionWriteTransportFactory(() =>
      createRetryingTinybirdTransport({ host: 'https://h', token: 't', datasource: 'events', fetch: mockFetch, retry: { sleep: async () => {} } }))
    const res = await drive(makeEvent())
    assert.strictEqual(res.statusCode, 200, 'a single transient 429 is retried and recovers -> 200')
    assert.strictEqual(calls, 2, 'exactly one retry (429 then 2xx)')
    assert.strictEqual(rollbackDeletes.length, 0, 'no rollback — the write ultimately succeeded')
  })
}

// ── (d) pageview path UNCHANGED — still fire-and-forget, batched, not awaited ──
test('(d) pageview path unchanged: dualWriteEvent is fire-and-forget (returns true SYNC; transport rejection never surfaces)', async (t) => {
  t.after(() => { setDualWriteTransport(null); delete process.env.TINYBIRD_DUAL_WRITE })
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  let transportCalled = false
  setDualWriteTransport(async () => { transportCalled = true; throw new Error('transport boom') }, { flushAt: 1, flushInterval: 0 })
  const ret = dualWriteEvent({ distinctId: 'v1', event: '$pageview', properties: { site_id: 's1' } })
  // Mutation guard: if someone makes the pageview path synchronous/awaited, this becomes
  // a Promise (or throws) and the strict === true fails.
  assert.strictEqual(ret, true, 'returns true synchronously — not awaited, not a promise')
  await new Promise(r => setTimeout(r, 10))
  assert.strictEqual(transportCalled, true, 'still delivered asynchronously via the batcher')
})

// ── module units: writeConversionDirect contract ──────────────────────────────
test('writeConversionDirect — flag OFF -> skipped no-op (no transport built)', async (t) => {
  t.after(__resetConversionWriteTransportFactory)
  delete process.env.TINYBIRD_DUAL_WRITE
  let built = false
  __setConversionWriteTransportFactory(() => { built = true; return async () => {} })
  const r = await writeConversionDirect({ distinctId: 'v1', event: '$conversion', properties: { site_id: 's1' } })
  assert.deepStrictEqual(r, { skipped: true, reason: 'dual_write_off' })
  assert.strictEqual(built, false, 'flag off: no transport constructed, no network')
})

test('writeConversionDirect — flag ON but no transport (misconfig) -> THROWS (loud, never silent drop)', async (t) => {
  t.after(reset)
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  __setConversionWriteTransportFactory(() => null)
  await assert.rejects(() => writeConversionDirect({ distinctId: 'v1', event: '$conversion', properties: { site_id: 's1' } }), /not configured/)
})

test('writeConversionDirect — flag ON, transport ok -> written once, deterministic event_id, no site_key', async (t) => {
  t.after(reset)
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)
  const r = await writeConversionDirect({ distinctId: ANON_ID, event: '$conversion', properties: { site_id: 's1', site_key: 'sk_x', stripe_invoice_id: 'in_ded_1', conversion_value: 49 } })
  assert.strictEqual(r.written, true)
  assert.strictEqual(r.eventId, 'in_ded_1', 'deterministic event_id from the Stripe invoice id')
  const lines = rec.lines()
  assert.strictEqual(lines.length, 1)
  assert.ok(!('site_key' in lines[0]), 'site_key dropped')
})
