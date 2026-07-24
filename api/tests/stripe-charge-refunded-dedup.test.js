// PR3 — `charge.refunded` subscription + CROSS-EVENT REFUND DEDUP. TOKEN-FREE, NO network.
//
// Stripe emits BOTH `refund.created` AND `charge.refunded` for the SAME refund. Both are
// now subscribed, so the load-bearing property is that one refund produces exactly ONE
// negative row no matter which event arrives, in which order, or how many times.
//
// WHY THE FIXTURES ARE STATEFUL: a mock that returns a scripted `duplicate: true` proves
// nothing — it asserts the answer we wanted. So this file stands up:
//   * a real idempotency STORE keyed (key_type,key_value) with the SAME all-or-nothing
//     semantics as claim_revenue_idempotency_keys (supabase/migrations/
//     20260606180000_revenue_foundation.sql:64 — ANY unique_violation rolls back the whole
//     claim and returns false), and
//   * a real Tinybird events STORE that the dedup read-check (conversion-write.js) queries
//     by (site_id, event_id), exactly as production does.
// The dedup then has to actually happen; it cannot be asserted into existence.
//
// SUPABASE PLANE: the webhook never writes attributed_conversions — the nightly does, keyed
// conversion_event_id = the Tinybird event_id (nightly_conversions_by_site.pipe:30
// `event_id AS uuid` → nightly-attribution.js:906 `conversion_event_id: conversion.uuid`)
// under UNIQUE(site_id, conversion_event_id) (baseline_schema.sql:1067). So the Supabase-side
// assertion is over that derived key: the distinct conversion_event_id set must be size 1.

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
  __setConversionWriteTransportFactory, __resetConversionWriteTransportFactory,
  __setConversionReadCheck, __resetConversionReadCheck
} = await import('../../tinybird/adapter/conversion-write.js')
const { __setRefundResolveRead, __resetRefundResolveRead } = await import('../lib/stripe-refund.js')

const stripe = new Stripe('fake_key_for_test_signature_only', { apiVersion: '2024-06-20' })

const SITE_KEY = 'sk_live_chargerefund'
const WEBHOOK_SECRET = 'fake_webhook_secret_for_charge_refund_test'
const SITE = { id: 'site-cr-1', site_key: SITE_KEY, encrypted_stripe_webhook_secret: encryptSecret(WEBHOOK_SECRET), plan: 'scale' }

const SHARED_PI = 'pi_test_cr_1'
const ORIGINAL_DISTINCT_ID = 'visitor_original_42'

// ── Event builders ───────────────────────────────────────────────────────────────
const refundObj = ({ id = 're_A', amount = 5000 } = {}) => ({
  id, object: 'refund', amount, currency: 'usd', payment_intent: SHARED_PI, charge: 'ch_1'
})
const refundCreatedEvent = ({ id = 're_A', amount = 5000, evt = 'evt_refund_created_1' } = {}) => ({
  id: evt, type: 'refund.created', created: 1_780_000_000,
  data: { object: refundObj({ id, amount }) }
})
// data.object is a CHARGE: `amount` is the ORIGINAL total (deliberately != the refund
// amount here, so a regression that reads charge.amount is caught by value), and the
// individual Refunds hang off refunds.data.
const chargeRefundedEvent = ({ refunds = [refundObj()], evt = 'evt_charge_refunded_1', chargeAmount = 99999 } = {}) => ({
  id: evt, type: 'charge.refunded', created: 1_780_000_050,
  data: {
    object: {
      id: 'ch_1', object: 'charge', amount: chargeAmount,
      amount_refunded: refunds.reduce((s, r) => s + r.amount, 0),
      refunded: true, currency: 'usd', payment_intent: SHARED_PI,
      refunds: { object: 'list', data: refunds }
    }
  }
})

const layer = stripeWebhookRouter.stack.find(l => l.route?.path === '/:site_key' && l.route?.methods?.post)
const handler = layer.route.stack[layer.route.stack.length - 1].handle

// ── Stateful world: idempotency store + Tinybird events store ────────────────────
const client = getSupabase()
const originalFrom = client.from
const originalRpc = client.rpc

function world ({ resolveDistinctId = ORIGINAL_DISTINCT_ID } = {}) {
  const claimed = new Set()            // "key_type key_value" — the unique index
  const rows = []                      // Tinybird `events` (append-only, no dedup)
  const rpcCalls = []

  client.from = (table) => {
    if (table === 'sites') {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: SITE, error: null }), single: async () => ({ data: SITE, error: null }) }) }) }
    }
    return { insert: async () => ({ error: null }), delete: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }) }), select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }
  }
  client.rpc = async (fn, params) => {
    rpcCalls.push({ fn, params })
    if (fn === 'claim_revenue_idempotency_keys') {
      const keys = params.p_keys || []
      // EXACT semantics of the SQL function: insert all, and if ANY collides the whole
      // block rolls back and returns false. No partial claim is ever persisted.
      const ks = keys.map(k => `${k.key_type} ${k.key_value}`)
      if (ks.some(k => claimed.has(k))) return { data: false, error: null }
      ks.forEach(k => claimed.add(k))
      return { data: true, error: null }
    }
    if (fn === 'claim_site_conversion_usage') return { data: null, error: { message: 'mock' } }
    return { data: null, error: null }
  }

  // Tinybird write + the (site_id,event_id) dedup read-check, both over `rows`.
  __setConversionWriteTransportFactory(() => async (payload) => {
    gunzipSync(payload).toString('utf8').trim().split('\n').filter(Boolean)
      .forEach(l => rows.push(JSON.parse(l)))
  })
  __setConversionReadCheck(async (siteId, eventId) =>
    rows.filter(r => r.site_id === siteId && r.event_id === eventId).length)

  // #381 resolution seam — returns the ORIGINAL purchase's distinct_id.
  __setRefundResolveRead(async () => (resolveDistinctId ? [{ distinct_id: resolveDistinctId }] : []))

  process.env.TINYBIRD_DUAL_WRITE = 'true'
  return { rows, claimed, rpcCalls }
}

function teardown () {
  client.from = originalFrom
  client.rpc = originalRpc
  __resetConversionWriteTransportFactory()
  __resetConversionReadCheck()
  __resetRefundResolveRead()
  delete process.env.TINYBIRD_DUAL_WRITE
}

async function send (event) {
  const body = Buffer.from(JSON.stringify(event))
  const sig = stripe.webhooks.generateTestHeaderString({ payload: body.toString(), secret: WEBHOOK_SECRET })
  const req = { params: { site_key: SITE_KEY }, body, headers: { 'stripe-signature': sig } }
  let captured = { status: 0, body: null }
  const res = { status (s) { captured.status = s; return this }, json (b) { captured.body = b; return this } }
  await handler(req, res)
  return captured
}

// The Supabase plane's key, derived exactly as the nightly derives it.
const supabaseKeys = (rows) => [...new Set(rows.map(r => r.event_id))]
// normalizeEvent PROMOTES the known conversion fields to TOP-LEVEL Tinybird columns —
// there is no nested `properties` bag to read them out of (verified against normalize.js:
// a normalized $conversion row is flat: site_id, conversion_value, conversion_type,
// event_id, conversion_event_id, stripe_event_type, distinct_id, …).
const refundRows = (rows) => rows.filter(r => r.conversion_type === 'refund')
const props = (r) => r

// ── 1. charge.refunded ALONE writes exactly one negative row ─────────────────────
test('charge.refunded alone writes exactly ONE negative row, with the REFUND amount', async (t) => {
  const w = world(); t.after(teardown)

  const res = await send(chargeRefundedEvent({ refunds: [refundObj({ id: 're_A', amount: 5000 })], chargeAmount: 99999 }))
  assert.strictEqual(res.status, 200)

  const refunds = refundRows(w.rows)
  assert.strictEqual(refunds.length, 1, 'exactly one refund row')
  const p = props(refunds[0])
  // -50.00 = the REFUND's 5000 cents. A regression reading charge.amount would give -999.99.
  assert.strictEqual(p.conversion_value, -50, 'negative value = the refund amount, NOT charge.amount')
  assert.strictEqual(refunds[0].event_id, 're_A', 'Tinybird event_id is the re_… id, never ch_…')
  assert.strictEqual(p.conversion_event_id, 're_A')
  assert.strictEqual(p.stripe_event_type, 'charge.refunded', 'traceable to the event that produced it')
})

// ── 2. LOAD-BEARING: refund.created THEN charge.refunded → ONE row in BOTH stores ─
test('LOAD-BEARING: refund.created THEN charge.refunded for the SAME refund writes exactly ONE row in BOTH stores', async (t) => {
  const w = world(); t.after(teardown)

  const r1 = await send(refundCreatedEvent({ id: 're_A', amount: 5000, evt: 'evt_rc_1' }))
  const r2 = await send(chargeRefundedEvent({ refunds: [refundObj({ id: 're_A', amount: 5000 })], evt: 'evt_ch_1' }))

  assert.strictEqual(r1.status, 200)
  assert.strictEqual(r2.status, 200)
  assert.strictEqual(r2.body.refunds_duplicate, 1, 'charge.refunded recognised the refund as already ingested')
  assert.strictEqual(r2.body.refunds_written, 0)

  // STORE 1 — Tinybird.
  const refunds = refundRows(w.rows)
  assert.strictEqual(refunds.length, 1, 'Tinybird: exactly ONE negative row for one refund')
  assert.strictEqual(props(refunds[0]).conversion_value, -50, 'net is -50.00, not -100.00')

  // STORE 2 — Supabase, via the nightly's key. UNIQUE(site_id, conversion_event_id) can
  // only collapse duplicates if BOTH events derive the SAME key; assert that directly.
  assert.deepStrictEqual(supabaseKeys(w.rows), ['re_A'],
    'Supabase: one distinct conversion_event_id → the upsert cannot produce a second row')

  // The evt_… ids DID differ — proving refund_id (re_…), not the event id, did the work.
  const claimedRefundIds = [...w.claimed].filter(k => k.startsWith('refund_id '))
  assert.deepStrictEqual(claimedRefundIds, ['refund_id re_A'])
})

// ── 3. Reverse order ─────────────────────────────────────────────────────────────
test('reverse order (charge.refunded FIRST, then refund.created) also writes exactly ONE', async (t) => {
  const w = world(); t.after(teardown)

  const r1 = await send(chargeRefundedEvent({ refunds: [refundObj({ id: 're_A', amount: 5000 })], evt: 'evt_ch_2' }))
  const r2 = await send(refundCreatedEvent({ id: 're_A', amount: 5000, evt: 'evt_rc_2' }))

  assert.strictEqual(r1.body.refunds_written, 1)
  assert.strictEqual(r2.status, 200)
  assert.strictEqual(r2.body.duplicate, true, 'refund.created deduped against the charge-derived claim')

  assert.strictEqual(refundRows(w.rows).length, 1)
  assert.deepStrictEqual(supabaseKeys(w.rows), ['re_A'])
})

// ── 4. Multiple refunds on one charge ────────────────────────────────────────────
//
// "CORRECTLY" means: each DISTINCT refund produces exactly one row carrying ITS OWN
// amount, and a re-announced refund produces none. Stripe fires charge.refunded on EVERY
// refund of a charge, and the payload's refunds[] is CUMULATIVE — so the 2nd event
// re-presents refund #1 alongside the new #2. Writing the array wholesale would re-net
// #1; skipping the event because "we've seen this charge" would lose #2. Per-refund
// claims are what make both come out right.
test('a charge.refunded carrying MULTIPLE refunds writes one row per DISTINCT refund, each with its own amount', async (t) => {
  const w = world(); t.after(teardown)

  const res = await send(chargeRefundedEvent({
    refunds: [refundObj({ id: 're_A', amount: 5000 }), refundObj({ id: 're_B', amount: 2500 })],
    evt: 'evt_ch_multi'
  }))
  assert.strictEqual(res.status, 200)
  assert.strictEqual(res.body.refunds_written, 2)

  const refunds = refundRows(w.rows)
  assert.strictEqual(refunds.length, 2)
  assert.deepStrictEqual(refunds.map(r => r.event_id).sort(), ['re_A', 're_B'])
  assert.deepStrictEqual(refunds.map(r => props(r).conversion_value).sort((a, b) => a - b), [-50, -25],
    'each row carries its OWN refund amount')
  assert.deepStrictEqual(supabaseKeys(w.rows).sort(), ['re_A', 're_B'])
})

test('the CUMULATIVE second charge.refunded re-presents refund #1 and adds #2 — only #2 is written', async (t) => {
  const w = world(); t.after(teardown)

  // Refund #1 happens.
  await send(chargeRefundedEvent({ refunds: [refundObj({ id: 're_A', amount: 5000 })], evt: 'evt_ch_p1' }))
  // Refund #2 happens — Stripe re-sends #1 in the array alongside #2.
  const res2 = await send(chargeRefundedEvent({
    refunds: [refundObj({ id: 're_A', amount: 5000 }), refundObj({ id: 're_B', amount: 2500 })],
    evt: 'evt_ch_p2'
  }))

  assert.strictEqual(res2.body.refunds_written, 1, 'only the NEW refund is written')
  assert.strictEqual(res2.body.refunds_duplicate, 1, 'the re-presented refund is deduped')

  const refunds = refundRows(w.rows)
  assert.strictEqual(refunds.length, 2, 'total 2 rows — re_A was NOT netted twice')
  assert.strictEqual(refunds.reduce((s, r) => s + props(r).conversion_value, 0), -75, 'net = -(50 + 25)')
})

// ── 5. Resolution path + degraded path, unchanged on the new event type ──────────
test('charge.refunded inherits the ORIGINAL conversion distinct_id via the #381 resolution path', async (t) => {
  const w = world({ resolveDistinctId: ORIGINAL_DISTINCT_ID }); t.after(teardown)

  await send(chargeRefundedEvent({ refunds: [refundObj({ id: 're_A', amount: 5000 })] }))

  const row = refundRows(w.rows)[0]
  assert.strictEqual(row.distinct_id, ORIGINAL_DISTINCT_ID, 'inherited, not the phantom')
  assert.ok(!('attribution_status' in props(row)), 'resolved → NOT marked refund_unresolved')
})

test('degraded path unchanged: an unresolvable charge.refunded still writes, with attribution_status=refund_unresolved', async (t) => {
  const w = world({ resolveDistinctId: null }); t.after(teardown)

  await send(chargeRefundedEvent({ refunds: [refundObj({ id: 're_A', amount: 5000 })] }))

  const row = refundRows(w.rows)[0]
  assert.strictEqual(props(row).attribution_status, 'refund_unresolved', 'gap is queryable, never silently direct')
  assert.strictEqual(row.distinct_id, `stripe_refund:${SHARED_PI}`, 'deterministic phantom')
  assert.strictEqual(props(row).conversion_value, -50, 'the refund still NETS — never dropped')
})

// ── 6. The payload shapes that must NOT write ────────────────────────────────────
test('charge.refunded with NO expandable refunds[] acks 200 and writes NOTHING (never falls back to ch_…)', async (t) => {
  const w = world(); t.after(teardown)

  const evt = chargeRefundedEvent({ refunds: [] })
  delete evt.data.object.refunds   // `refunds` is optional/nullable on the Charge type
  const res = await send(evt)

  assert.strictEqual(res.status, 200, 'acked — Stripe must not retry forever')
  assert.strictEqual(res.body.ignored, true)
  assert.strictEqual(refundRows(w.rows).length, 0, 'no row: a ch_… key would double-write against refund.created')
})

// The no-refunds[] path is a REAL not-netted refund, so acking it silently is the
// phantom-success shape (KNOWN_ISSUES §45 silent-success class): a merchant subscribed to
// charge.refunded but NOT refund.created would get zero netting forever behind a 200,
// indistinguishable from "no refunds occurred". On modern API versions (Stripe 2024-10-28
// Acacia stopped auto-expanding Charge.refunds) this is the DEFAULT shape, not an edge
// case — so the warning is load-bearing and pinned here.
test('the no-refunds[] path WARNS loudly with the charge id and the remedy — never a silent 200', async (t) => {
  const w = world(); t.after(teardown)
  const warnings = []
  const origWarn = console.warn
  console.warn = (...a) => { warnings.push(a.join(' ')) }
  t.after(() => { console.warn = origWarn })

  const evt = chargeRefundedEvent({ refunds: [], evt: 'evt_ch_bare' })
  delete evt.data.object.refunds
  const res = await send(evt)

  const warn = warnings.find(w2 => w2.includes('charge.refunded'))
  assert.ok(warn, 'a warning MUST be emitted — a silent ack hides unrecorded refunds')
  assert.ok(warn.includes('ch_1'), 'names the charge id so the specific refund is traceable')
  assert.ok(warn.includes('NOTHING WRITTEN'), 'states plainly that nothing was netted')
  assert.ok(warn.includes('refund.created'), 'names the remedy: subscribe the primary refund event')
  // The remedy is on the response too, so the Stripe delivery log is not a bare success.
  assert.ok(String(res.body.action_required || '').includes('refund.created'))
  assert.strictEqual(refundRows(w.rows).length, 0)
})

// ── 7. Defense in depth: even if the CLAIM layer is bypassed, the stores still hold ─
// Proves the dedup is layered rather than resting solely on the idempotency table — the
// Tinybird read-check keys on the same re_…, so a rolled-back/replayed claim cannot
// double-net.
test('defense in depth: with the idempotency claim forced to always succeed, the Tinybird (site_id,event_id) check still collapses the duplicate', async (t) => {
  const w = world(); t.after(teardown)
  client.rpc = async (fn) => {
    if (fn === 'claim_revenue_idempotency_keys') return { data: true, error: null }  // always "fresh"
    if (fn === 'claim_site_conversion_usage') return { data: null, error: { message: 'mock' } }
    return { data: null, error: null }
  }

  await send(refundCreatedEvent({ id: 're_A', amount: 5000, evt: 'evt_dd_1' }))
  await send(chargeRefundedEvent({ refunds: [refundObj({ id: 're_A', amount: 5000 })], evt: 'evt_dd_2' }))

  assert.strictEqual(refundRows(w.rows).length, 1, 'second write skipped by the event_id read-check')
  assert.deepStrictEqual(supabaseKeys(w.rows), ['re_A'])
})
