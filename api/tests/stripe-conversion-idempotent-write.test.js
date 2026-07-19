// MONEY PATH — $conversion idempotency (2nd half of #204). writeConversionDirect now
// does a READ-token dedup check before the POST: if the event_id already exists for the
// site, SKIP the POST (return success, claim HOLDS) — closing the lost-ack / redelivery
// double-count on the append-only, no-dedup `events` datasource. FAIL-OPEN on a failed
// read (POST anyway). Module-level tests exercise the read-check directly; webhook-level
// tests prove the claim HOLDS on skip and rolls back on a real POST failure (#204).

import test from 'node:test'
import assert from 'node:assert'
import { gunzipSync } from 'node:zlib'
import Stripe from 'stripe'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const {
  writeConversionDirect,
  __setConversionWriteTransportFactory, __resetConversionWriteTransportFactory,
  __setConversionReadCheck, __resetConversionReadCheck
} = await import('../../tinybird/adapter/conversion-write.js')
const { getSupabase } = await import('../lib/supabase.js')
const { encryptSecret } = await import('../lib/utils.js')
const { stripeWebhookRouter } = await import('../routes/stripe-webhook.js')
const { setDualWriteTransport, dualWriteEvent, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')

const ANON_ID = '11111111-1111-4111-8111-111111111111'
function recorder () {
  const payloads = []
  return { transport: async (p) => { payloads.push(p) }, lines: () => payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))) }
}
const CONV = (over = {}) => ({ distinctId: ANON_ID, event: '$conversion', properties: { site_id: 's1', stripe_invoice_id: 'in_ded_1', conversion_value: 49, ...over } })
function resetModule () { __resetConversionWriteTransportFactory(); __resetConversionReadCheck(); delete process.env.TINYBIRD_DUAL_WRITE }

// ── (a) event ALREADY present -> POST NOT made, returns success (claim will HOLD) ──
test('(a) event already in Tinybird -> read-check finds it -> POST is NOT made (load-bearing)', async (t) => {
  t.after(resetModule)
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)
  const readArgs = []
  __setConversionReadCheck(async (siteId, eventId) => { readArgs.push({ siteId, eventId }); return 1 }) // already present
  const r = await writeConversionDirect(CONV())
  assert.strictEqual(rec.lines().length, 0, 'POST NOT made — the event is already there')
  assert.deepStrictEqual(r, { skipped: true, reason: 'already_present', eventId: 'in_ded_1' })
  assert.deepStrictEqual(readArgs[0], { siteId: 's1', eventId: 'in_ded_1' }, 'read-check keyed on (site_id, deterministic event_id)')
})

// ── (b) event ABSENT -> POST made exactly once ────────────────────────────────
test('(b) event absent -> read-check returns 0 -> POST made exactly once', async (t) => {
  t.after(resetModule)
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)
  __setConversionReadCheck(async () => 0) // absent
  const r = await writeConversionDirect(CONV())
  assert.strictEqual(r.written, true)
  assert.strictEqual(rec.lines().length, 1, 'POST made exactly once')
  assert.strictEqual(rec.lines()[0].event_type, '$conversion')
})

// ── (c) read-check ITSELF errors -> FAIL-OPEN: still POST, do NOT skip ─────────
test('(c) read-check errors -> fail-open: POST is still made, NOT skipped (load-bearing)', async (t) => {
  t.after(resetModule)
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)
  __setConversionReadCheck(async () => { throw new Error('read-check 503') }) // read fails
  const r = await writeConversionDirect(CONV())
  assert.strictEqual(r.written, true, 'fail-open: a failed read must NOT skip (a double-count beats a silent loss)')
  assert.strictEqual(rec.lines().length, 1, 'POST still made after a failed read-check')
})

// ── (d) absent + POST FAILS -> writeConversionDirect throws (#204 rollback path) ──
test('(d) absent, then POST fails after retries -> throws (so the caller rolls back + 500)', async (t) => {
  t.after(resetModule)
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  __setConversionWriteTransportFactory(() => async () => { throw new Error('tinybird down (retries exhausted)') })
  __setConversionReadCheck(async () => 0) // absent -> proceed to POST
  await assert.rejects(() => writeConversionDirect(CONV()), /tinybird down/, 'a real write failure still throws (#204 behaviour holds)')
})

// ══════════════════════════════════════════════════════════════════════════════
// WEBHOOK LEVEL — claim HOLDS on dedup-skip; rolls back on a real POST failure.
// ══════════════════════════════════════════════════════════════════════════════
const stripe = new Stripe('fake_key_for_test_signature_only', { apiVersion: '2024-06-20' })
const SITE_KEY = 'sk_live_idemtest'
const WEBHOOK_SECRET = 'fake_webhook_secret_for_idem_test'
const SITE = { id: 'site-idem-1', site_key: SITE_KEY, encrypted_stripe_webhook_secret: encryptSecret(WEBHOOK_SECRET), plan: 'scale' }
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
  id: 'evt_checkout_i', type: 'checkout.session.completed', created: Math.floor(Date.now() / 1000),
  data: { object: { id: 'cs_test_i', amount_total: 5000, currency: 'usd', payment_intent: 'pi_test_i', metadata: { anonymous_id: ANON_ID } } }
})

const client = getSupabase()
const originalFrom = client.from
const originalRpc = client.rpc
let rollbackDeletes = []
function mockSupabase () {
  rollbackDeletes = []
  client.from = (table) => {
    if (table === 'sites') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: SITE, error: null }), single: async () => ({ data: SITE, error: null }) }) }) }
    if (table === 'revenue_idempotency_keys') {
      const chain = { eq: () => chain, then: (resolve) => resolve({ error: null }) }
      return { delete: () => { rollbackDeletes.push(1); return chain }, insert: async () => ({ error: null }) }
    }
    return { insert: async () => ({ error: null }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
  }
  client.rpc = async (fn) => {
    if (fn === 'claim_revenue_idempotency_keys') return { data: true, error: null }
    if (fn === 'claim_site_conversion_usage') return { data: null, error: { message: 'mock' } }
    return { data: null, error: null }
  }
}
function restoreSupabase () { client.from = originalFrom; client.rpc = originalRpc }
function resetWebhook () { restoreSupabase(); __resetConversionWriteTransportFactory(); __resetConversionReadCheck(); delete process.env.TINYBIRD_DUAL_WRITE }

test('(a-webhook) event already present -> dedup-skip -> 200 and claim HOLDS (no rollback), no POST', async (t) => {
  t.after(resetWebhook)
  mockSupabase(); process.env.TINYBIRD_DUAL_WRITE = 'true'
  const rec = recorder(); __setConversionWriteTransportFactory(() => rec.transport)
  __setConversionReadCheck(async () => 1) // already in Tinybird
  const res = await drive(checkoutEvent())
  assert.strictEqual(res.statusCode, 200, 'redelivery of an already-written event still gets a 200')
  assert.strictEqual(rollbackDeletes.length, 0, 'claim HOLDS — not rolled back on a dedup skip')
  assert.strictEqual(rec.lines().length, 0, 'no duplicate POST')
})

test('(d-webhook) absent + POST fails -> claim rolled back + 500 (idempotency check does not weaken #204)', async (t) => {
  t.after(resetWebhook)
  mockSupabase(); process.env.TINYBIRD_DUAL_WRITE = 'true'
  __setConversionWriteTransportFactory(() => async () => { throw new Error('tinybird 503') })
  __setConversionReadCheck(async () => 0) // absent -> POST attempted -> fails
  const res = await drive(checkoutEvent())
  assert.strictEqual(res.statusCode, 500)
  assert.ok(rollbackDeletes.length > 0, 'claim rolled back so Stripe redelivers')
})

// ── (e) pageview path UNCHANGED — no read-check, still fire-and-forget ─────────
test('(e) pageview path unchanged: dualWriteEvent has NO read-check, returns true SYNC (fire-and-forget)', async (t) => {
  t.after(() => { setDualWriteTransport(null); delete process.env.TINYBIRD_DUAL_WRITE })
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  let readChecked = false
  __setConversionReadCheck(async () => { readChecked = true; return 1 }) // would skip IF the pageview path used it
  let transportCalled = false
  // flushAt:1 keeps enqueue-triggered AUTO-FLUSH coverage — the same delivery mechanism prod's
  // fire-and-forget pageview path uses (prod runs the default flushAt=20 threshold via boot.js, and
  // never calls flush()/drain() explicitly on the hot path).
  setDualWriteTransport(async () => { transportCalled = true }, { flushAt: 1, flushInterval: 0 })
  const ret = dualWriteEvent({ distinctId: 'v1', event: '$pageview', properties: { site_id: 's1' } })
  assert.strictEqual(ret, true, 'pageview stays fire-and-forget (returns true sync)')
  // Deterministically await delivery, not a fixed timer. dualWriteEvent returns true SYNC and the
  // enqueue-triggered auto-flush lands the delivery in the batcher's in-flight `chain`; drain() awaits
  // that chain to settle (batch.js: Promise.allSettled([flushed, chain])). The old setTimeout(10) raced
  // it under event-loop contention (POST landing after the timer — 0/24 in isolation, flaky under load).
  // FAIL-CLOSED: assert the batcher is present so a null accessor cannot silently skip the wait and
  // let the race back in (this is the dual-write money-rail delivery assertion).
  const b = __getDualWriteBatcher()
  assert.ok(b, 'batcher present — the delivery wait must not be skipped')
  await b.drain()
  assert.strictEqual(readChecked, false, 'the conversion read-check is NEVER invoked on the pageview path')
  assert.strictEqual(transportCalled, true, 'pageview still delivered via the batcher')
  __resetConversionReadCheck()
})
