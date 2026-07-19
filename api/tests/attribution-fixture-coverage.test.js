// Gate item 2 — field-coverage matrix for the D2 B3 construction fixture. Extends #300 (4 models + AI +
// same-timestamp tie) with the missing shapes: single-touchpoint degradation, the $0 carrier exclusion
// predicate, and external_event_id dedup handling. Same standard: hand-computed expected values in
// scripts/lib/attribution-fixture.mjs, asserted by construction — never a recompute. TOKEN-FREE, no network.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-key'

const { calculateAttribution } = await import('../jobs/nightly-attribution.js')
const { isSubscriptionCheckoutCarrier } = await import('../lib/stripe-subscription.js')
const { applyBackfill } = await import('../lib/backfill.js')
const { V3, V3_EXPECTED, V2_CARRIER_SHAPE, V4, projectSplit } = await import('../../scripts/lib/attribution-fixture.mjs')

// ── Single-touchpoint degradation — all 4 models give the one touch 100% ──────────────────────────
test('SINGLE-TOUCH: every model degrades to fraction 1.0 / full value on one touchpoint', () => {
  const r = calculateAttribution([{ utm_source: V3.touch.utm_source, utm_medium: V3.touch.utm_medium, utm_campaign: V3.touch.utm_campaign, timestamp: V3.touch.ts }], V3.conversionValue)
  for (const model of ['linear', 'u_shaped', 'time_decay', 'w_shaped']) {
    assert.deepEqual(projectSplit(r[model]), V3_EXPECTED[`${model}_attribution`], `${model}: single touch must get 100% (fraction 1, full value)`)
  }
  assert.equal(r.first_touch.source, 'google')
  assert.equal(r.last_touch.source, 'google', 'first and last touch are the same single touch')
})

// ── $0 subscription-checkout carrier — the exclusion predicate ─────────────────────────────────────
test('CARRIER: the $0 subscription-checkout carrier is identified for exclusion', () => {
  assert.equal(isSubscriptionCheckoutCarrier(V2_CARRIER_SHAPE), true, 'the fixture carrier shape must be recognized as a carrier (→ never written to attributed_conversions)')
})

test('CARRIER: a real purchase and a $0 non-checkout are NOT carriers (predicate is tight)', () => {
  assert.equal(isSubscriptionCheckoutCarrier({ provider: 'stripe', conversion_type: 'purchase', conversion_value: 100, stripe_subscription_id: 'sub_x', stripe_event_type: 'checkout.session.completed' }), false, 'a paid ($100) checkout is a real conversion, not a carrier')
  assert.equal(isSubscriptionCheckoutCarrier({ provider: 'stripe', conversion_type: 'purchase', conversion_value: 0, stripe_subscription_id: null, stripe_event_type: 'checkout.session.completed' }), false, 'a $0 checkout with no subscription id is not a subscription carrier')
})

// ── external_event_id dedup — the write-path collapses the duplicate to one row ────────────────────
test('DEDUP: two conversions sharing external_event_id collapse to ONE upserted row', async () => {
  // A store that mirrors the attributed_conversions partial-unique (site_id, external_event_id): the
  // second record with an already-seen external_event_id raises 23505 → applyBackfill skips it.
  const seen = new Set()
  const store = {
    async upsert (record) {
      if (seen.has(record.external_event_id)) return 'skipped_duplicate'
      seen.add(record.external_event_id)
      return 'upserted'
    }
  }
  const records = V4.conversions.map((c) => ({ conversion_event_id: c.event_id, external_event_id: V4.externalEventId, conversion_value: V4.conversionValue }))
  const result = await applyBackfill(records, { dryRun: false, store })

  assert.equal(result.total, 2, 'two duplicate conversions were processed')
  assert.equal(result.upserted, 1, 'exactly ONE row is written')
  assert.equal(result.skippedDuplicate, 1, 'the duplicate external_event_id is skipped (23505), not double-counted')
})
