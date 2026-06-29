import test from 'node:test'
import assert from 'node:assert'

import { mapSubscriptionEvent, buildSubscriptionIdempotencyKeys } from '../lib/stripe-subscription.js'

// Synthetic Stripe events — the whole point is verifying ingestion logic WITHOUT
// a real paying customer (mapSubscriptionEvent / key construction are pure).

const invoicePaid = (overrides = {}) => ({
  id: 'evt_1', type: 'invoice.paid', created: 1700000000,
  data: { object: { id: 'in_001', customer: 'cus_1', subscription: 'sub_1', billing_reason: 'subscription_create', amount_paid: 4900, currency: 'usd', ...overrides } }
})
const subEvent = (type, object, previous_attributes) => ({
  id: 'evt_2', type, created: 1700000000, data: { object: { customer: 'cus_1', currency: 'usd', ...object }, previous_attributes }
})

// ── mapSubscriptionEvent ──────────────────────────────────────────────────────

test('invoice.paid first invoice → subscription, value in dollars', () => {
  const m = mapSubscriptionEvent(invoicePaid())
  assert.equal(m.conversionType, 'subscription')
  assert.equal(m.value, 49)               // 4900 cents / 100
  assert.equal(m.currency, 'USD')
  assert.equal(m.invoiceId, 'in_001')
  assert.equal(m.subscriptionId, 'sub_1')
  assert.equal(m.customerId, 'cus_1')
  assert.equal(m.skipReason, null)
})

test('invoice.paid subscription_cycle → renewal', () => {
  const m = mapSubscriptionEvent(invoicePaid({ id: 'in_002', billing_reason: 'subscription_cycle' }))
  assert.equal(m.conversionType, 'renewal')
  assert.equal(m.invoiceId, 'in_002')
})

test('subscription.created trialing → trial_start, value 0', () => {
  const m = mapSubscriptionEvent(subEvent('customer.subscription.created', { id: 'sub_1', status: 'trialing' }))
  assert.equal(m.conversionType, 'trial_start')
  assert.equal(m.value, 0)
  assert.equal(m.subscriptionId, 'sub_1')
  assert.equal(m.skipReason, null)
})

test('subscription.created active (no trial) → SKIP (avoid double-count with invoice.paid)', () => {
  const m = mapSubscriptionEvent(subEvent('customer.subscription.created', { id: 'sub_1', status: 'active' }))
  assert.equal(m.conversionType, null)
  assert.match(m.skipReason, /invoice\.paid/)
})

test('subscription.updated trialing→active → trial_converted', () => {
  const m = mapSubscriptionEvent(subEvent('customer.subscription.updated', { id: 'sub_1', status: 'active' }, { status: 'trialing' }))
  assert.equal(m.conversionType, 'trial_converted')
})

test('subscription.updated non-transition → SKIP', () => {
  const m = mapSubscriptionEvent(subEvent('customer.subscription.updated', { id: 'sub_1', status: 'active' }, { items: {} }))
  assert.equal(m.conversionType, null)
  assert.ok(m.skipReason)
})

test('subscription.deleted → churn', () => {
  const m = mapSubscriptionEvent(subEvent('customer.subscription.deleted', { id: 'sub_1', status: 'canceled' }))
  assert.equal(m.conversionType, 'churn')
})

test('unhandled event type → skipReason', () => {
  const m = mapSubscriptionEvent({ type: 'customer.subscription.paused', data: { object: {} } })
  assert.ok(m.skipReason)
})

// ── buildSubscriptionIdempotencyKeys (the renewal-dedup edge case) ────────────

test('invoice events key on invoice_id, NOT subscription-scoped (renewals must not collide)', () => {
  const r1 = buildSubscriptionIdempotencyKeys({ providerEventId: 'evt_a', conversionType: 'renewal', invoiceId: 'in_001', subscriptionId: 'sub_1' })
  const r2 = buildSubscriptionIdempotencyKeys({ providerEventId: 'evt_b', conversionType: 'renewal', invoiceId: 'in_002', subscriptionId: 'sub_1' })
  // No subscription_id key on invoice events.
  assert.ok(!r1.some(k => k.key_type === 'subscription_id'))
  // Two renewals of the same sub have DIFFERENT invoice_id keys → not duplicates.
  const inv1 = r1.find(k => k.key_type === 'invoice_id').key_value
  const inv2 = r2.find(k => k.key_type === 'invoice_id').key_value
  assert.notEqual(inv1, inv2)
})

test('lifecycle events scope subscription_id by conversion type (once per subscription)', () => {
  const keys = buildSubscriptionIdempotencyKeys({ providerEventId: 'evt_c', conversionType: 'trial_start', invoiceId: null, subscriptionId: 'sub_1' })
  assert.deepEqual(keys.find(k => k.key_type === 'subscription_id'), { key_type: 'subscription_id', key_value: 'sub_1:trial_start' })
  assert.ok(!keys.some(k => k.key_type === 'invoice_id'))
})

test('provider_event_id is always present (replay dedup)', () => {
  const keys = buildSubscriptionIdempotencyKeys({ providerEventId: 'evt_x', conversionType: 'churn', invoiceId: null, subscriptionId: 'sub_9' })
  assert.ok(keys.some(k => k.key_type === 'provider_event_id' && k.key_value === 'evt_x'))
})
