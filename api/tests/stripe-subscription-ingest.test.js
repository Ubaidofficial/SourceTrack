import test from 'node:test'
import assert from 'node:assert'

import { mapSubscriptionEvent, buildSubscriptionIdempotencyKeys, checkoutConversionValue, buildSubscriptionIdentitySeed, isSubscriptionCheckoutCarrier } from '../lib/stripe-subscription.js'

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

// ── Phase 5c: subscription-mode checkout double-count fix ──────────────────────

const RECORD = {
  first_touch_source: 'google', first_touch_channel: 'Paid Search', first_touch_campaign: 'spring',
  last_touch_source: 'google', last_touch_channel: 'Paid Search'
}

// TEST 1 — subscription-mode checkout contributes $0; one-time keeps full value.
test('5c: subscription-mode checkout -> $0 conversion_value; one-time -> full value', () => {
  assert.strictEqual(checkoutConversionValue('subscription', 49), 0, 'subscription mode zeroed (no double-count)')
  assert.strictEqual(checkoutConversionValue('payment', 49), 49, 'one-time keeps full value')
  assert.strictEqual(checkoutConversionValue('setup', 0), 0)
})

// TEST 2 — carry-forward: a RESOLVED subscription-mode checkout (customer_id, NO
// subscription_id) now SEEDS a resolved subscription_identity row (it didn't before,
// because the old gate required stripe_subscription_id). That resolved seed is what
// the existing backfill reads to flip the later invoice.paid revenue row -> resolved.
test('5c: resolved subscription-mode checkout seeds subscription_identity (carry-forward)', () => {
  const seed = buildSubscriptionIdentitySeed({
    conversion: { webhook_customer_id: 'cus_1', stripe_subscription_id: null, distinct_id: 'anon-visitor-1', uuid: 'evt-checkout-1' },
    touchpoints: [{ timestamp: 't' }],   // stitched: a real journey exists
    record: RECORD
  })
  assert.ok(seed, 'checkout with customer_id + stitch seeds even without subscription_id')
  assert.strictEqual(seed.stripe_customer_id, 'cus_1')
  assert.strictEqual(seed.first_subscription_id, null, 'checkout has no subscription_id yet')
  assert.strictEqual(seed.anonymous_id, 'anon-visitor-1')
  assert.strictEqual(seed.first_touch_source, 'google')
  assert.strictEqual(seed.attribution_status, 'resolved')
})

// TEST 3 — NO-DOWNGRADE: an UNSTITCHED checkout does NOT seed (returns null), so it
// never locks 'unknown'; a later self-stitching invoice.paid still seeds resolved.
test('5c: unstitched checkout does NOT seed; later stitched invoice.paid seeds resolved', () => {
  // unstitched via placeholder distinct_id
  assert.strictEqual(buildSubscriptionIdentitySeed({
    conversion: { webhook_customer_id: 'cus_2', stripe_subscription_id: null, distinct_id: 'stripe_unattributed:cs_x', uuid: 'e' },
    touchpoints: [{ timestamp: 't' }], record: RECORD
  }), null, 'placeholder distinct_id -> no seed (no-downgrade)')
  // unstitched via no journey
  assert.strictEqual(buildSubscriptionIdentitySeed({
    conversion: { webhook_customer_id: 'cus_2', stripe_subscription_id: null, distinct_id: 'anon-x', uuid: 'e' },
    touchpoints: [], record: RECORD
  }), null, 'no touchpoints -> no seed')
  // the later self-stitching invoice.paid still seeds resolved (with its subscription_id)
  const seed = buildSubscriptionIdentitySeed({
    conversion: { webhook_customer_id: 'cus_2', stripe_subscription_id: 'sub_2', distinct_id: 'anon-visitor-2', uuid: 'evt-inv-2' },
    touchpoints: [{ timestamp: 't' }], record: RECORD
  })
  assert.ok(seed && seed.attribution_status === 'resolved')
  assert.strictEqual(seed.first_subscription_id, 'sub_2')
})

// TEST 4 — one-time payment path & non-Stripe conversions are unaffected.
test('5c: one-time path untouched; non-customer conversions never seed', () => {
  assert.strictEqual(checkoutConversionValue('payment', 123.45), 123.45, 'one-time value passes through unchanged')
  // a conversion with no stripe customer id (e.g. a browser/shopify conversion) never seeds
  assert.strictEqual(buildSubscriptionIdentitySeed({
    conversion: { distinct_id: 'anon-3', uuid: 'u', stripe_subscription_id: null },
    touchpoints: [{ timestamp: 't' }], record: RECORD
  }), null, 'no webhook_customer_id -> no seed')
})

// ── Phase 7: isSubscriptionCheckoutCarrier ────────────────────────────────────

const carrierBase = () => ({
  provider: 'stripe',
  conversion_type: 'purchase',
  conversion_value: 0,
  stripe_subscription_id: 'sub_1',
  stripe_event_type: 'checkout.session.completed'
})

// CASE 1 — the actual bug: subscription-mode checkout carrier, all fields match.
test('7: subscription-mode checkout carrier -> true', () => {
  assert.strictEqual(isSubscriptionCheckoutCarrier(carrierBase()), true)
})

// CASE 2 — invoice.paid (or any subscription-lifecycle event): conversion_type is
// never 'purchase' on that path (mapSubscriptionEvent only emits
// subscription/renewal/trial_start/trial_converted/churn), so it must not match
// even though it shares provider='stripe' and carries a real stripe_subscription_id.
test('7: invoice.paid / subscription-lifecycle event -> false (conversion_type is never purchase)', () => {
  assert.strictEqual(isSubscriptionCheckoutCarrier({ ...carrierBase(), conversion_type: 'subscription' }), false)
  assert.strictEqual(isSubscriptionCheckoutCarrier({ ...carrierBase(), conversion_type: 'renewal' }), false)
})

// CASE 3 — a real one-time (payment-mode) checkout with a non-zero value must
// never be excluded from counts.
test('7: one-time checkout with real value -> false', () => {
  assert.strictEqual(isSubscriptionCheckoutCarrier({ ...carrierBase(), conversion_value: 49, stripe_subscription_id: null }), false)
})

// CASE 4 — the edge case both proposals flagged: a genuinely fully-discounted
// ($0) ONE-TIME checkout. Payment-mode checkouts never get a subscription_id
// (session.subscription is null), so this must NOT match — presence of
// stripe_subscription_id is what disambiguates it from CASE 1.
test('7: fully-discounted ($0) one-time checkout -> false (no subscription_id)', () => {
  assert.strictEqual(isSubscriptionCheckoutCarrier({ ...carrierBase(), stripe_subscription_id: null }), false)
})

// CASE 5 — a non-Stripe $0 'purchase' conversion (e.g. a hypothetical future
// provider reusing the same conversion_type) must never match on provider alone.
test('7: non-Stripe provider -> false even with matching value/type', () => {
  assert.strictEqual(isSubscriptionCheckoutCarrier({ ...carrierBase(), provider: 'shopify' }), false)
  assert.strictEqual(isSubscriptionCheckoutCarrier({ ...carrierBase(), provider: null }), false)
})

// conversion_value null-coercion, stated explicitly per the code comment: null
// coerces to 0 (may match), but a truly-absent value (undefined) never matches.
test('7: conversion_value null-coercion — null matches as 0, undefined fails closed', () => {
  assert.strictEqual(isSubscriptionCheckoutCarrier({ ...carrierBase(), conversion_value: null }), true, 'Number(null) === 0')
  assert.strictEqual(isSubscriptionCheckoutCarrier({ ...carrierBase(), conversion_value: undefined }), false, 'Number(undefined) is NaN, never skip on missing data')
})

// ── Regression: nightly-attribution.js:797's insertSubscriptionRevenue gate ──
//
// `if (conversion.webhook_customer_id && conversion.stripe_subscription_id &&
// !isSubscriptionCheckoutCarrier(conversion))` — since Phase 7 forwards
// session.subscription onto the checkout carrier, the carrier now has
// webhook_customer_id AND stripe_subscription_id both truthy, so
// isSubscriptionCheckoutCarrier(conversion) is the ONLY thing still excluding it
// from firing insertSubscriptionRevenue (which would otherwise attempt
// event_type: 'purchase', rejected by subscription_revenue's CHECK constraint).
// These two tests lock in that exclusion AND confirm the fix didn't collaterally
// exclude the legitimate funnel events that share stripe_subscription_id but
// have no stripe_invoice_id.

// CASE 6 — a carrier-shaped conversion object (exactly what nightly-attribution.js
// builds from a checkout-carrier PostHog row) must be excluded.
test('7: carrier-shaped conversion -> isSubscriptionCheckoutCarrier true (gate must exclude it)', () => {
  const carrierConversion = {
    webhook_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    stripe_invoice_id: null,
    provider: 'stripe',
    conversion_type: 'purchase',
    conversion_value: 0,
    stripe_event_type: 'checkout.session.completed'
  }
  assert.strictEqual(isSubscriptionCheckoutCarrier(carrierConversion), true)
})

// CASE 7 — trial_start / trial_converted / churn funnel events: these legitimately
// have webhook_customer_id + stripe_subscription_id (same shape the carrier now
// has) but conversion_type is never 'purchase' on that path (mapSubscriptionEvent
// only emits subscription/renewal/trial_start/trial_converted/churn) — must NOT
// be excluded, or insertSubscriptionRevenue would stop firing for real lifecycle
// events too.
test('7: trial_start/trial_converted/churn funnel events -> isSubscriptionCheckoutCarrier false (gate must still admit them)', () => {
  for (const conversion_type of ['trial_start', 'trial_converted', 'churn']) {
    const funnelConversion = {
      webhook_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      stripe_invoice_id: null,
      provider: 'stripe',
      conversion_type,
      conversion_value: 0,
      stripe_event_type: conversion_type === 'churn' ? 'customer.subscription.deleted' : 'customer.subscription.created'
    }
    assert.strictEqual(isSubscriptionCheckoutCarrier(funnelConversion), false, `${conversion_type} must not be excluded`)
  }
})
