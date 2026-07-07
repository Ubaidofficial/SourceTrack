// Phase 2b — deriveEventId precedence + cross-producer dedup behavior.

import test from 'node:test'
import assert from 'node:assert'
import { deriveEventId, normalizeEvent } from '../normalize.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('precedence: each branch wins over all lower branches', () => {
  // 1. client event_id beats everything
  assert.strictEqual(deriveEventId({
    event_id: 'cli_1', external_event_id: 'ext', stripe_invoice_id: 'in', order_id: 'o'
  }), 'cli_1')
  // 2. external_event_id beats invoice/order/...
  assert.strictEqual(deriveEventId({
    external_event_id: 'site:ord:purchase', stripe_invoice_id: 'in_1', order_id: 'o1'
  }), 'site:ord:purchase')
  // 3. stripe_invoice_id beats subscription/order
  assert.strictEqual(deriveEventId({
    stripe_invoice_id: 'in_9', stripe_subscription_id: 'sub_9', order_id: 'o9'
  }), 'in_9')
  // 4. stripe_subscription_id (no invoice) scoped by conversion_type
  assert.strictEqual(deriveEventId({
    stripe_subscription_id: 'sub_7', conversion_type: 'trial_start', order_id: 'o7'
  }), 'sub_7:trial_start')
  assert.strictEqual(deriveEventId({ stripe_subscription_id: 'sub_7' }), 'sub_7:conversion')
  // 5-8. order -> payment -> idempotency_key -> provider_event_id
  assert.strictEqual(deriveEventId({ order_id: 'o', payment_id: 'p', idempotency_key: 'i', provider_event_id: 'e' }), 'o')
  assert.strictEqual(deriveEventId({ payment_id: 'p', idempotency_key: 'i', provider_event_id: 'e' }), 'p')
  assert.strictEqual(deriveEventId({ idempotency_key: 'i', provider_event_id: 'e' }), 'i')
  assert.strictEqual(deriveEventId({ provider_event_id: 'e' }), 'e')
})

test('subscription renewal is NOT collapsed: invoice_id (branch 3) wins over subscription_id', () => {
  // Two renewals of the same subscription have different invoice_ids -> different
  // event_ids (each period counts once). Mirrors stripe-subscription.js:60-69.
  const r1 = deriveEventId({ stripe_invoice_id: 'in_001', stripe_subscription_id: 'sub_1', conversion_type: 'renewal' })
  const r2 = deriveEventId({ stripe_invoice_id: 'in_002', stripe_subscription_id: 'sub_1', conversion_type: 'renewal' })
  assert.notStrictEqual(r1, r2)
  assert.strictEqual(r1, 'in_001')
})

test('determinism: same raw -> same id (every non-uuid branch)', () => {
  const raws = [
    { event_id: 'c' }, { external_event_id: 'e' }, { stripe_invoice_id: 'in' },
    { stripe_subscription_id: 's', conversion_type: 'churn' }, { order_id: 'o' },
    { payment_id: 'p' }, { idempotency_key: 'i' }, { provider_event_id: 'pe' }
  ]
  for (const r of raws) assert.strictEqual(deriveEventId({ ...r }), deriveEventId({ ...r }))
})

test('empty/whitespace ids are skipped (fall to the next branch)', () => {
  assert.strictEqual(deriveEventId({ event_id: '   ', external_event_id: '', order_id: 'o9' }), 'o9')
})

test('offline <-> browser: SAME shared external_event_id => SAME event_id (cross-dedup)', () => {
  const shared = 'site-1:ord_42:purchase' // resolveCapiEventId output both sides compute
  const browserRaw = {
    site_id: 'site-1', event: '$conversion', anonymous_id: 'a',
    external_event_id: shared, order_id: 'ord_42', conversion_type: 'purchase',
    ingestion_method: 'server_routed'
  }
  const offlineRaw = {
    site_id: 'site-1', event: '$conversion', anonymous_id: 'a',
    external_event_id: shared, order_id: 'ord_42', conversion_type: 'purchase',
    ingestion_method: 'offline', provider: 'payments_api'
  }
  assert.strictEqual(deriveEventId(browserRaw), deriveEventId(offlineRaw))
  // and end-to-end through normalizeEvent:
  assert.strictEqual(normalizeEvent(browserRaw).event_id, normalizeEvent(offlineRaw).event_id)
  assert.strictEqual(normalizeEvent(browserRaw).event_id, shared)
})

test('browser <-> Stripe: DIFFERENT ids (documented limitation, no shared id)', () => {
  const browser = deriveEventId({ external_event_id: 'site-1:ord_42:purchase', order_id: 'ord_42' })
  const stripe = deriveEventId({ stripe_invoice_id: 'in_abc', provider_event_id: 'evt_x' })
  assert.notStrictEqual(browser, stripe) // genuinely un-dedupable across these producers
})

test('refund contract (Phase-2c GATE): stamped refund -> distinct id; UNSTAMPED refund collides', () => {
  // A refund is a compensating signed event (§9) and MUST get a DISTINCT event_id
  // from its original, or the (site_id,event_id) claim drops it and over-counts
  // revenue. deriveEventId has no refund-awareness by design (LOCKED precedence) —
  // so the PRODUCER must stamp a distinct event_id. The generator already does
  // (generate_events.js: event_id = `${orig}:refund`). This test locks that
  // boundary contract for the Phase-2c refund producer.
  const orig = deriveEventId({ order_id: 'in_orig', conversion_value: 50 })
  // SAFE: producer stamps a distinct event_id (client/event_id branch wins)
  const stampedRefund = deriveEventId({ event_id: 'in_orig:refund', order_id: 'in_orig', conversion_value: -50, conversion_type: 'refund' })
  assert.notStrictEqual(stampedRefund, orig, 'stamped refund must derive a distinct id')
  // HAZARD (documented): an UNSTAMPED refund (only order_id reused) collides with
  // the original -> would be deduped/dropped. Phase-2c MUST prevent this.
  const unstampedRefund = deriveEventId({ order_id: 'in_orig', conversion_value: -50, conversion_type: 'refund' })
  assert.strictEqual(unstampedRefund, orig, 'unstamped refund collides — the Phase-2c gate this test guards')
})

test('uuid fallback: no-natural-id producers (proxy / pixel / server-events / webhook-incoming)', () => {
  // proxy /sp/c with no order_id, pixel email-open, server SDK with no ids, and a
  // webhook-incoming row whose only id lives in conversion_event_id (NOT in the
  // precedence by design) all fall to a generated uuid.
  const shapes = [
    { site_id: 's', event_type: 'custom', proxy: true },                       // proxy
    { site_id: 's', event_type: 'email_open', tracking_method: 'pixel' },        // pixel
    { site_id: 's', event_type: '$conversion', ingestion_method: 'server_sdk' }, // server-events
    { site_id: 's', event_type: '$conversion', conversion_event_id: 'webhook_order_9' } // webhook-incoming
  ]
  for (const s of shapes) {
    const id = deriveEventId(s)
    assert.match(id, UUID, `uuid fallback for ${JSON.stringify(s)}`)
  }
  // uuid branch is non-deterministic (each call fresh) — append-only, not dedupable
  assert.notStrictEqual(deriveEventId({ site_id: 's' }), deriveEventId({ site_id: 's' }))
})
