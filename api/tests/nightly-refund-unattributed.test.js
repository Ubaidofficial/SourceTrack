// REFUNDS ARE NEVER ATTRIBUTED TO A SOURCE (PR 4/5, founder decision 2026-08-01).
//
// REPLACES nightly-refund-inheritance.test.js, whose premise is now inverted. That suite asserted
// a refund COPIES its original conversion's attribution verbatim (KI-62 Step C), so the reversal
// debited the source that earned the sale. The decision reverses it: attribution on the original
// is a MODEL OUTPUT, so inheriting turns one uncertain credit into an equal-and-opposite uncertain
// DEBIT against the same channel — a mis-attributed sale becomes a mis-attributed sale AND a
// mis-attributed refund, doubling the error instead of cancelling it. The refund is a certain
// fact; which channel absorbs it is not.
//
// What these tests pin:
//   1. a refund with a resolvable original does NOT inherit — descriptors are CLEARED, marked
//      'unattributed', and the pointer is kept for provenance
//   2. descriptors are cleared rather than left at whatever the refund's own window derived
//      (which would be Direct — the one source it certainly did not come from)
//   3. a refund with NO pointer stays 'unresolved' — a distinct, diagnosable state
//   4. the refund keeps its own identity, negative value, type and date, so revenue still nets
//   5. a non-refund conversion is untouched
//   6. ZERO reads happen on the refund path now (the lookup is gone, not merely ignored)
// TOKEN-FREE, NO network — the touchpoint read is dependency-injected.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const {
  processConversion, conversionRowToObject, mapConversionPipeRow,
  ATTRIBUTION_DESCRIPTOR_FIELDS, __setNightlyReadDeps, __resetNightlyReadDeps
} = await import('../jobs/nightly-attribution.js')

const SITE = { id: 'site-refund-unattr', site_key: 'sk_test', attribution_window_days: 30 }

const refund = (overrides = {}) => ({
  uuid: 're_evt_1', distinct_id: 'stripe_refund:pi_x', timestamp: '2026-07-10T12:00:00Z',
  conversion_type: 'refund', conversion_value: -40, external_event_id: null,
  webhook_customer_id: null, stripe_subscription_id: null, stripe_invoice_id: null,
  currency: 'USD', provider_event_id: 'evt_refund_1', occurred_at: '2026-07-10T12:00:00Z',
  stripe_event_type: 'refund.created', provider: 'stripe',
  original_conversion_event_id: null, ...overrides
})

// The refund's own window has no touches → re-derived attribution would collapse to Direct/null.
// `pageviews` lets a test give the refund a window that WOULD derive a real source, to prove the
// clear is unconditional rather than an accident of an empty window.
function inject ({ pageviews = [] } = {}) {
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe) => (pipe === 'pageviews_by_visitors' ? pageviews : null)
  })
}

test('1) a refund with a resolvable original does NOT inherit — cleared, marked unattributed, pointer kept', async (t) => {
  t.after(__resetNightlyReadDeps)
  inject()

  const record = await processConversion(SITE, refund({ original_conversion_event_id: 'cs_original_1' }))

  assert.ok(record, 'a refund record is still produced — never dropped, or revenue would over-report')
  for (const field of ATTRIBUTION_DESCRIPTOR_FIELDS) {
    assert.equal(record[field], null, `${field} is CLEARED, not inherited`)
  }
  assert.equal(record.custom_properties.refund_attribution, 'unattributed',
    "marked 'unattributed' — the original IS known, we are choosing not to debit it")
  assert.equal(record.custom_properties.original_conversion_event_id, 'cs_original_1',
    'pointer still recorded: it is the audit trail to what was reversed')
})

test('2) descriptors are cleared even when the refund’s OWN window would derive a real source', async (t) => {
  t.after(__resetNightlyReadDeps)
  // A pageview inside the refund's window that would otherwise attribute it to google/cpc.
  inject({
    pageviews: [{
      distinct_id: 'stripe_refund:pi_x', timestamp: '2026-07-09T12:00:00Z',
      utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'spring',
      page_url: 'https://x.test/pricing', referrer: '', country: 'US',
      device_type: 'desktop', browser_name: 'Chrome', ai_source: null, gclid: 'g1'
    }]
  })

  const record = await processConversion(SITE, refund({ original_conversion_event_id: 'cs_original_2' }))

  assert.equal(record.first_touch_source, null,
    'a derivable source is discarded too — the clear is the policy, not a side effect of an empty window')
  assert.equal(record.channel, null)
  assert.equal(record.custom_properties.refund_attribution, 'unattributed')
})

test('3) a refund with NO pointer stays refund_unresolved — a distinct, diagnosable state', async (t) => {
  t.after(__resetNightlyReadDeps)
  inject()

  const record = await processConversion(SITE, refund({ original_conversion_event_id: null }))

  // Kept separate from 'unattributed' on purpose. 'unresolved' means the original could not be
  // identified at all (subscription-mode refund, no payment_intent) — a real data gap worth
  // chasing. 'unattributed' means it IS known and we declined to debit it. Collapsing the two
  // would erase the only one of them anybody can act on.
  assert.equal(record.custom_properties.refund_attribution, 'unresolved')
  assert.ok(!('original_conversion_event_id' in record.custom_properties), 'nothing to point at → not stamped')
  assert.equal(record.first_touch_source, null, 'still never Direct-by-accident')
})

test('4) the refund keeps its own id, negative value, type and date — revenue still nets', async (t) => {
  t.after(__resetNightlyReadDeps)
  inject()

  const record = await processConversion(SITE, refund({ original_conversion_event_id: 'cs_original_3' }))

  // Not attributing the refund must not mean losing it. The certain fact — money came back — is
  // exactly what still has to land.
  assert.equal(record.conversion_event_id, 're_evt_1')
  assert.equal(record.conversion_value, -40, 'the negative value persists so the site-level SUM nets')
  assert.equal(record.conversion_type, 'refund')
  assert.equal(record.conversion_date, '2026-07-10', 'refund keeps its own date, not the original’s')
})

test('5) a NON-refund conversion is untouched — descriptors intact, no refund marks', async (t) => {
  t.after(__resetNightlyReadDeps)
  inject({
    pageviews: [{
      distinct_id: 'anon-buyer-1', timestamp: '2026-07-09T12:00:00Z',
      utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'spring',
      page_url: 'https://x.test/pricing', referrer: '', country: 'US',
      device_type: 'desktop', browser_name: 'Chrome', ai_source: null, gclid: 'g1'
    }]
  })

  const record = await processConversion(SITE, refund({
    uuid: 'purchase_1', conversion_type: 'purchase', conversion_value: 50,
    distinct_id: 'anon-buyer-1', original_conversion_event_id: 'cs_should_be_ignored'
  }))

  assert.equal(record.first_touch_source, 'google', 'a purchase keeps its real attribution')
  assert.ok(!record.custom_properties || !('refund_attribution' in record.custom_properties),
    'no refund_attribution mark on a non-refund')
})

test('6) the refund path performs ZERO reads — the original lookup is gone, not just ignored', async (t) => {
  t.after(__resetNightlyReadDeps)
  const pipesQueried = []
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe) => { pipesQueried.push(pipe); return pipe === 'pageviews_by_visitors' ? [] : null }
  })

  await processConversion(SITE, refund({ original_conversion_event_id: 'cs_original_4' }))

  // The old design paid a Supabase round-trip per refund to fetch the original's attribution.
  // Nothing is copied now, so that read would be pure cost. Asserted rather than assumed: leaving
  // a discarded lookup in place is exactly the kind of dead cost that survives a refactor.
  assert.ok(!pipesQueried.includes('attributed_conversions'), 'no original-attribution lookup')
  assert.deepEqual([...new Set(pipesQueried)], ['pageviews_by_visitors'],
    'only the touchpoint read runs on the refund path')
})

test('7) the pointer still survives the pipe row[14] round-trip', async (t) => {
  t.after(__resetNightlyReadDeps)
  inject()

  const pipeRow = {
    uuid: 're_evt_2', distinct_id: 'stripe_refund:pi_y', timestamp: '2026-07-11T09:00:00Z',
    conversion_type: 'refund', conversion_value: -12, external_event_id: null,
    webhook_customer_id: null, stripe_subscription_id: null, stripe_invoice_id: null,
    currency: 'USD', provider_event_id: 'evt_refund_2', occurred_at: '2026-07-11T09:00:00Z',
    stripe_event_type: 'refund.created', provider: 'stripe',
    original_conversion_event_id: 'cs_from_pipe'
  }
  const conv = conversionRowToObject(mapConversionPipeRow(pipeRow))
  assert.equal(conv.original_conversion_event_id, 'cs_from_pipe', 'pointer survives the row[14] round-trip')

  const record = await processConversion(SITE, conv)
  assert.equal(record.custom_properties.original_conversion_event_id, 'cs_from_pipe',
    'and reaches custom_properties as provenance')
  assert.equal(record.custom_properties.refund_attribution, 'unattributed')
})
