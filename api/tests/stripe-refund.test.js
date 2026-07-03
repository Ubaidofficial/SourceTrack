// Stripe refund → compensating negative $conversion — TOKEN-FREE, NO NETWORK.
// Money-rail: asserts the SIGNED value, the two anti-collision guarantees
// (DB idempotency keys distinct from the purchase's; Tinybird event_id distinct
// from the purchase's), stability across webhook retries, and partial refunds.

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRefundConversion, buildRefundIdempotencyKeys, refundDistinctId, REFUND_EVENT_TYPE } from '../lib/stripe-refund.js'
import { deriveEventId } from '../../tinybird/adapter/normalize.js'

const SITE = { id: 'site-uuid-1', site_key: 'sk_live_testsite123' }

// A purchase and a refund of THAT purchase. The refund's payment_intent EQUALS
// the purchase's payment_id (pi_…) — the exact collision the design must avoid.
const PURCHASE_ORDER_ID = 'cs_test_123'
const SHARED_PAYMENT_INTENT = 'pi_test_789'

function refundEvent ({ amount = 5000, id = 're_test_1', evt = 'evt_refund_1', currency = 'usd', created = 1_780_000_000 } = {}) {
  return { id: evt, type: REFUND_EVENT_TYPE, created, data: { object: { id, object: 'refund', amount, currency, payment_intent: SHARED_PAYMENT_INTENT, charge: 'ch_1' } } }
}

// The purchase's Tinybird property bag + DB claim keys (mirrors stripe-webhook.js).
const purchaseProps = { order_id: PURCHASE_ORDER_ID, payment_id: SHARED_PAYMENT_INTENT, conversion_event_id: PURCHASE_ORDER_ID, provider_event_id: 'evt_purchase_1' }
const purchaseClaimKeys = [
  { key_type: 'provider_event_id', key_value: 'evt_purchase_1' },
  { key_type: 'order_id', key_value: PURCHASE_ORDER_ID },
  { key_type: 'payment_id', key_value: SHARED_PAYMENT_INTENT }
]

// ── signed value ─────────────────────────────────────────────────────────────

test('refund → NEGATIVE conversion_value of the refunded amount; type=refund', () => {
  const { properties, value } = buildRefundConversion(refundEvent({ amount: 5000 }), SITE)
  assert.equal(value, 50)
  assert.equal(properties.conversion_value, -50)
  assert.equal(properties.conversion_type, 'refund')
  assert.equal(properties.currency, 'USD')
})

test('PARTIAL refund → negative of the PARTIAL amount', () => {
  const { properties } = buildRefundConversion(refundEvent({ amount: 1234 }), SITE)
  assert.equal(properties.conversion_value, -12.34)
})

test('invalid/zero amount throws (handler acks + logs instead of emitting)', () => {
  assert.throws(() => buildRefundConversion(refundEvent({ amount: 0 }), SITE))
  assert.throws(() => buildRefundConversion(refundEvent({ amount: -1 }), SITE))
})

// ── LANDMINE 1: DB idempotency keys must NOT collide with the purchase ────────

test('refund idempotency keys are refund-specific — never reuse order_id / payment_id', () => {
  const keys = buildRefundIdempotencyKeys(refundEvent({ id: 're_test_1', evt: 'evt_refund_1' }))
  const values = keys.map(k => k.key_value)
  // The two keys: the refund event id and the refund id.
  assert.deepEqual(keys.map(k => k.key_type).sort(), ['provider_event_id', 'refund_id'])
  assert.ok(values.includes('evt_refund_1') && values.includes('re_test_1'))
  // THE LANDMINE: the shared pi_… and the purchase order_id must NOT appear —
  // else claim_revenue_idempotency_keys would flag the refund as a duplicate of
  // the purchase and silently drop it.
  assert.ok(!values.includes(SHARED_PAYMENT_INTENT), 'refund must NOT claim the shared payment_intent')
  assert.ok(!values.includes(PURCHASE_ORDER_ID), 'refund must NOT claim the purchase order_id')
  // No overlap with the purchase's claim key VALUES at all.
  const purchaseValues = new Set(purchaseClaimKeys.map(k => k.key_value))
  assert.ok(values.every(v => !purchaseValues.has(v)), 'no refund key collides with a purchase key')
})

// ── LANDMINE 2: Tinybird event_id must be distinct from the purchase's ────────

test('refund derives a DISTINCT Tinybird event_id from the purchase (stamped re_…)', () => {
  const { properties } = buildRefundConversion(refundEvent({ id: 're_test_1' }), SITE)
  const refundEventId = deriveEventId(properties)
  const purchaseEventId = deriveEventId(purchaseProps) // resolves via order_id (branch 5)
  assert.equal(refundEventId, 're_test_1', 'refund event_id is the stamped refund id (branch 1)')
  assert.equal(purchaseEventId, PURCHASE_ORDER_ID)
  assert.notEqual(refundEventId, purchaseEventId, 'refund and purchase must not share a Tinybird event_id')
})

// ── retry stability (exactly-once) ───────────────────────────────────────────

test('webhook retry of the SAME refund → identical event_id AND identical claim keys (no double-apply)', () => {
  const a = buildRefundConversion(refundEvent({ id: 're_test_1', evt: 'evt_refund_1' }), SITE)
  const b = buildRefundConversion(refundEvent({ id: 're_test_1', evt: 'evt_refund_1' }), SITE)
  assert.equal(deriveEventId(a.properties), deriveEventId(b.properties))
  assert.deepEqual(buildRefundIdempotencyKeys(refundEvent({ id: 're_test_1', evt: 'evt_refund_1' })),
    buildRefundIdempotencyKeys(refundEvent({ id: 're_test_1', evt: 'evt_refund_1' })))
})

test('two DIFFERENT partial refunds of one purchase get DISTINCT event_ids (both net)', () => {
  const r1 = buildRefundConversion(refundEvent({ id: 're_part_1', amount: 1000 }), SITE)
  const r2 = buildRefundConversion(refundEvent({ id: 're_part_2', amount: 2000 }), SITE)
  assert.notEqual(deriveEventId(r1.properties), deriveEventId(r2.properties))
  assert.equal(r1.properties.conversion_value, -10)
  assert.equal(r2.properties.conversion_value, -20)
})

// ── misc ─────────────────────────────────────────────────────────────────────

test('refund carries no reusable order_id; distinct_id is deterministic per refund', () => {
  const { properties, distinctId } = buildRefundConversion(refundEvent(), SITE)
  assert.equal(properties.order_id, null)
  assert.equal(distinctId, refundDistinctId(refundEvent().data.object))
  assert.match(distinctId, /^stripe_refund:/)
})
