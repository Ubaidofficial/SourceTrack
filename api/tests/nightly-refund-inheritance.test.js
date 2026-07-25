// KI-62 Step C — refund attribution INHERITANCE (the nightly consumer).
//
// Step B stamped original_conversion_event_id into the refund event's custom_properties
// bag and made nightly_conversions_by_site project it. This is the consumer: when the
// nightly processes a refund, it must COPY the original conversion's attribution VERBATIM
// (resolved via that pointer) instead of re-deriving on the refund's own later window —
// which collapses to Direct and silently misattributes the reversal. These tests prove:
//   1. a resolvable refund inherits EVERY attribution field verbatim; keeps its own
//      negative value + id + type; is marked refund_attribution:'inherited'
//   2. a refund whose pointer resolves to NOTHING is marked refund_unresolved — source
//      stays null (never guessed, never silent Direct) and the value still persists
//   3. a subscription-mode refund (no pointer) NEVER attempts a lookup and stays
//      refund_unresolved (founder-confirmed v1 boundary)
//   4. the pointer travels from the pipe row (row[14]) through conversionRowToObject and
//      drives the lookup end-to-end
//   5. a NON-refund conversion is untouched (no lookup, no refund marks)
// TOKEN-FREE, NO network — the touchpoint read AND the original-attribution resolve are
// both dependency-injected via __setNightlyReadDeps.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-key'

const {
  processConversion, conversionRowToObject, mapConversionPipeRow,
  REFUND_INHERITED_FIELDS, __setNightlyReadDeps, __resetNightlyReadDeps
} = await import('../jobs/nightly-attribution.js')

const SITE = { id: 'site-refund-inherit', site_key: 'sk_test', attribution_window_days: 30 }

// What the resolver returns for the ORIGINAL purchase — a fully Paid-Search attribution.
// The refund must end up looking EXACTLY like this on every source-bearing column.
const ORIGINAL_ATTR = {
  first_touch_source: 'google', first_touch_medium: 'cpc', first_touch_campaign: 'spring',
  first_touch_timestamp: '2026-05-01T00:00:00Z',
  last_touch_source: 'google', last_touch_medium: 'cpc', last_touch_campaign: 'spring',
  last_touch_timestamp: '2026-05-01T02:00:00Z',
  linear_attribution: [{ channel: 'Paid Search', weight: 1 }],
  u_shaped_attribution: null, time_decay_attribution: null, w_shaped_attribution: null,
  touchpoint_count: 3, first_touch_channel: 'Paid Search', last_touch_channel: 'Paid Search',
  channel: 'Paid Search', channel_30d: 'Paid Search',
  ai_influenced_source: null, ai_influenced_session_at: null,
  attribution_confidence: 90, confidence_signals: { has_utm: true, has_click_id: true, has_ai_source: false, touchpoint_count: 3 },
  first_touch_country: 'US', last_touch_country: 'US',
  first_touch_device: 'desktop', last_touch_device: 'desktop',
  first_touch_browser: 'Chrome', last_touch_browser: 'Chrome',
  first_touch_landing_page: '/pricing', last_touch_landing_page: '/checkout'
}

// A refund event as the nightly consumes it. Its own window has NO pageviews (the touch
// is months earlier, outside windowDays) → the re-derived attribution would be Direct/null.
const refund = (overrides = {}) => ({
  uuid: 're_evt_1', distinct_id: 'stripe_refund:pi_x', timestamp: '2026-07-10T12:00:00Z',
  conversion_type: 'refund', conversion_value: -40, external_event_id: null,
  webhook_customer_id: null, stripe_subscription_id: null, stripe_invoice_id: null,
  currency: 'USD', provider_event_id: 'evt_refund_1', occurred_at: '2026-07-10T12:00:00Z',
  stripe_event_type: 'refund.created', provider: 'stripe',
  original_conversion_event_id: null, ...overrides
})

// Inject: pageviews pipe → [] (refund's window has no touches); resolver → supplied fn.
function inject ({ resolveOriginal }) {
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe) => (pipe === 'pageviews_by_visitors' ? [] : null),
    resolveOriginal
  })
}

test('1) resolvable refund INHERITS every attribution field verbatim; keeps its own value/id/type; marked inherited', async (t) => {
  t.after(__resetNightlyReadDeps)
  let pointerSeen = null
  inject({ resolveOriginal: async (_site, pointer) => { pointerSeen = pointer; return { ...ORIGINAL_ATTR } } })

  const record = await processConversion(SITE, refund({ original_conversion_event_id: 'cs_original_1' }))

  assert.ok(record, 'a refund record is produced (never dropped)')
  assert.equal(pointerSeen, 'cs_original_1', 'the resolver was called with the bag pointer')

  for (const field of REFUND_INHERITED_FIELDS) {
    assert.deepEqual(record[field], ORIGINAL_ATTR[field], `${field} inherited verbatim from the original`)
  }
  // The whole point: NOT the collapsed Direct/null the refund's own window would give.
  assert.equal(record.first_touch_source, 'google', 'source is the original’s, not Direct/null')
  assert.equal(record.channel, 'Paid Search', 'channel is the original’s')

  // The refund keeps its OWN identity, negative value, type and (refund) date.
  assert.equal(record.conversion_event_id, 're_evt_1', 'refund keeps its own event id')
  assert.equal(record.conversion_value, -40, 'refund keeps its own negative value (nets on the refund date)')
  assert.equal(record.conversion_type, 'refund')
  assert.equal(record.conversion_date, '2026-07-10', 'refund keeps its own (refund) date, not the original’s')

  assert.equal(record.custom_properties.refund_attribution, 'inherited', 'explicitly marked inherited')
  assert.equal(record.custom_properties.original_conversion_event_id, 'cs_original_1', 'pointer recorded for provenance')
})

test('2) pointer resolves to NOTHING → refund_unresolved: source stays null (never guessed), value persists', async (t) => {
  t.after(__resetNightlyReadDeps)
  inject({ resolveOriginal: async () => null })   // original not found (or a swallowed read error)

  const record = await processConversion(SITE, refund({ original_conversion_event_id: 'cs_missing' }))

  assert.equal(record.custom_properties.refund_attribution, 'unresolved', 'explicitly marked unresolved')
  assert.equal(record.custom_properties.original_conversion_event_id, 'cs_missing', 'pointer still recorded (debuggable)')
  assert.equal(record.first_touch_source, null, 'NOT guessed, NOT defaulted to a fake source')
  assert.equal(record.last_touch_source, null)
  assert.equal(record.conversion_value, -40, 'the refund still persists so the site-level SUM nets')
})

test('3) subscription-mode refund (no pointer) NEVER attempts a lookup and stays refund_unresolved', async (t) => {
  t.after(__resetNightlyReadDeps)
  let called = false
  inject({ resolveOriginal: async () => { called = true; return { ...ORIGINAL_ATTR } } })

  const record = await processConversion(SITE, refund({ original_conversion_event_id: null }))

  assert.equal(called, false, 'no pointer → no resolve attempted (founder-confirmed v1 boundary)')
  assert.equal(record.custom_properties.refund_attribution, 'unresolved')
  assert.ok(!('original_conversion_event_id' in record.custom_properties), 'nothing to point at → not stamped')
  assert.equal(record.first_touch_source, null, 'stays unresolved, never Direct-by-accident')
})

test('4) the pointer travels from the pipe row (row[14]) through conversionRowToObject and drives the lookup', async (t) => {
  t.after(__resetNightlyReadDeps)
  let pointerSeen = null
  inject({ resolveOriginal: async (_site, pointer) => { pointerSeen = pointer; return { ...ORIGINAL_ATTR } } })

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
  assert.equal(pointerSeen, 'cs_from_pipe', 'the pipe-carried pointer drove the resolve')
  assert.equal(record.first_touch_source, 'google', 'inherited end-to-end from a pipe row')
})

test('5) a NON-refund conversion is untouched — no resolve, no refund marks', async (t) => {
  t.after(__resetNightlyReadDeps)
  let called = false
  inject({ resolveOriginal: async () => { called = true; return { ...ORIGINAL_ATTR } } })

  const record = await processConversion(SITE, refund({
    uuid: 'purchase_1', conversion_type: 'purchase', conversion_value: 50,
    distinct_id: 'anon-buyer-1', original_conversion_event_id: 'cs_should_be_ignored'
  }))

  assert.equal(called, false, 'inheritance is refund-only — a purchase never resolves an original')
  assert.ok(!record.custom_properties || !('refund_attribution' in record.custom_properties),
    'no refund_attribution mark on a non-refund')
})
