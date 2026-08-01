// Phase 2 refund fix — the nightly must PERSIST refund conversions (negative value,
// conversion_type='refund') to attributed_conversions so the Supabase SUM nets
// Dashboard/Attribution revenue (gross − refund). All OTHER negatives stay skipped.
// TOKEN-FREE, NO network — the touchpoint read is dependency-injected (empty pageviews,
// mirroring a refund's stripe_refund:… distinct_id that has no journey).

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-key'

const { processConversion, __setNightlyReadDeps, __resetNightlyReadDeps } =
  await import('../jobs/nightly-attribution.js')

const SITE = { id: 'site-refund-nightly', site_key: 'sk_test', attribution_window_days: 30 }

// A refund's distinct_id (stripe_refund:…) has no pageviews → touchpoint read returns [].
function injectNoTouchpoints () {
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe) => (pipe === 'pageviews_by_visitors' ? [] : null)
  })
}

const refundConversion = (overrides = {}) => ({
  uuid: 're_evt_nightly_1', distinct_id: 'stripe_refund:pi_x', timestamp: '2026-07-10T12:00:00Z',
  conversion_type: 'refund', conversion_value: -40, external_event_id: null,
  webhook_customer_id: null, stripe_subscription_id: null, stripe_invoice_id: null,
  currency: 'USD', provider_event_id: 'evt_refund_1', occurred_at: '2026-07-10T12:00:00Z',
  stripe_event_type: 'refund.created', provider: 'stripe', ...overrides
})

test('refund (negative value) → PERSISTED: record built with conversion_value=-40, type=refund', async (t) => {
  t.after(__resetNightlyReadDeps)
  injectNoTouchpoints()

  const record = await processConversion(SITE, refundConversion())

  assert.ok(record, 'a refund is NOT skipped — a record is produced')
  assert.equal(record.conversion_value, -40, 'the NEGATIVE value is persisted (so the Supabase SUM nets)')
  assert.equal(record.conversion_type, 'refund', 'conversion_type preserved')
  assert.equal(record.conversion_event_id, 're_evt_nightly_1')
  // Every attribution DESCRIPTOR is cleared on a refund (PR 4/5 — refunds are never attributed to
  // a source). Previously this asserted touchpoint_count === 0 and linear_attribution === [], the
  // values the refund's own empty window derived. Those are now null: a refund makes no attribution
  // claim at all, and "0 touchpoints" / "[]" are claims. The negative value still persists, which
  // is the part that has to survive — see nightly-refund-unattributed.test.js for the policy suite.
  assert.equal(record.touchpoint_count, null, 'descriptor cleared — the refund asserts no journey')
  assert.equal(record.first_touch_source, null, 'no source claimed for a refund')
  assert.equal(record.last_touch_source, null)
  assert.equal(record.linear_attribution, null, 'descriptor cleared, not an empty-array claim')
})

test('non-refund negative (type=purchase, value=-5) → STILL SKIPPED (invalid)', async (t) => {
  t.after(__resetNightlyReadDeps)
  injectNoTouchpoints()

  const record = await processConversion(SITE, refundConversion({
    uuid: 'neg_purchase_1', conversion_type: 'purchase', conversion_value: -5
  }))

  assert.equal(record, undefined, 'a non-refund negative is skipped as invalid (returns undefined)')
})

test('refund with a positive-typo value still persists (skip scope is only for NEGATIVES; guards distinct_id)', async (t) => {
  t.after(__resetNightlyReadDeps)
  injectNoTouchpoints()

  // Missing distinct_id is still skipped even for a refund (the || clause is untouched).
  const skipped = await processConversion(SITE, refundConversion({ distinct_id: null }))
  assert.equal(skipped, undefined, 'refund WITHOUT a distinct_id is still skipped (distinct_id guard preserved)')
})
