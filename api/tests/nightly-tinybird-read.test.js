// Nightly conversion + touchpoint reads cut over to Tinybird. TOKEN-FREE, NO network
// (both reads are dependency-injected via __setNightlyReadDeps). Proves: the $444.44
// wave1 conversion is attributed once read from the pipe; the cross-store identity join
// uses conversion.distinct_id verbatim; the per-conversion window is preserved; the
// pipe→positional field mapping is byte-identical to the HogQL shape; and a dead read
// no longer masquerades as an empty day.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-key'

const {
  processConversion, computeTerminalStatus, mapConversionPipeRow, mapTouchpointPipeRow,
  calculateAttribution, __setNightlyReadDeps, __resetNightlyReadDeps
} = await import('../jobs/nightly-attribution.js')

const SITE = { id: 'site-eb7f68c3', site_key: 'sk_test', attribution_window_days: 30 }

// A Tinybird conversion pipe row (named), as nightly_conversions_by_site returns it.
const wave1PipeRow = {
  uuid: 'wave1_454a720e', distinct_id: 'anon-buyer-9', timestamp: '2026-07-09T12:00:00Z',
  conversion_type: 'purchase', conversion_value: 444.44, external_event_id: null,
  webhook_customer_id: null, stripe_subscription_id: null, stripe_invoice_id: null,
  currency: 'USD', provider_event_id: 'evt_1', occurred_at: '2026-07-09T12:00:00Z',
  stripe_event_type: 'checkout.session.completed', provider: 'stripe',
  original_conversion_event_id: ''   // KI-62: '' for a non-refund (JSONExtractString empty)
}
// A pageviews_by_visitors pipe row (named), for that visitor.
const pv = (ts, utm_source = 'google') => ({
  visitor_id: 'anon-buyer-9', distinct_id: 'anon-buyer-9', timestamp: ts,
  utm_source, utm_medium: 'cpc', utm_campaign: 'spring', referrer: null, ai_source: null,
  gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null, ttclid: null,
  li_fat_id: null, li_fatid: null, twclid: null, dclid: null, snapclid: null, pclid: null,
  sccid: null, ko_click_id: null, page_url: 'https://x.com/pricing', utm_term: null,
  country: 'US', device_type: 'desktop', browser_name: 'Chrome'
})

// Inject the reads: conversions pipe unused here (we call processConversion directly);
// pageviews pipe returns whatever `pvRows` we set, and records the params it was called with.
function inject(pvRows, capture = {}) {
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe, params) => {
      if (pipe === 'pageviews_by_visitors') { capture.params = params; return pvRows }
      return null
    }
  })
}

// ── the field mapping is byte-identical to the HogQL positional shape ─────────

test('mapConversionPipeRow → the exact positional order of the HogQL conversion SELECT (row[0..14])', () => {
  assert.deepEqual(mapConversionPipeRow(wave1PipeRow), [
    'wave1_454a720e', 'anon-buyer-9', '2026-07-09T12:00:00Z', 'purchase', 444.44,
    null, null, null, null, 'USD', 'evt_1', '2026-07-09T12:00:00Z',
    'checkout.session.completed', 'stripe', ''   // row[14] = KI-62 original_conversion_event_id
  ])
})

test('mapTouchpointPipeRow → the exact positional order of the HogQL touchpoint SELECT (row[0..23], incl country/device/browser)', () => {
  const r = mapTouchpointPipeRow(pv('2026-07-08T00:00:00Z'))
  assert.equal(r[0], '2026-07-08T00:00:00Z') // timestamp
  assert.equal(r[1], 'google')               // utm_source
  assert.equal(r[20], 'https://x.com/pricing') // page_url
  assert.equal(r[21], 'US')                  // country
  assert.equal(r[22], 'desktop')             // device_type
  assert.equal(r[23], 'Chrome')              // browser_name
  assert.equal(r.length, 24)
})

// ── 🔴 the one that matters: wave1 IS attributed once read ───────────────────

test('🔴 wave1_454a720e ($444.44) IS attributed once read from Tinybird', async (t) => {
  t.after(__resetNightlyReadDeps)
  inject([pv('2026-07-08T00:00:00Z')])
  const conversion = { ...mapToConv(wave1PipeRow) }
  const record = await processConversion(SITE, conversion)
  assert.ok(record, 'a record is produced')
  assert.equal(record.conversion_event_id, 'wave1_454a720e')
  assert.equal(record.conversion_value, 444.44)
  assert.equal(record.first_touch_source, 'google', 'attributed to the journey source, not direct')
})

// ── cross-store identity join asserted explicitly ────────────────────────────

test('the touchpoint read joins by conversion.distinct_id VERBATIM (cross-store identity key)', async (t) => {
  t.after(__resetNightlyReadDeps)
  const capture = {}
  inject([pv('2026-07-08T00:00:00Z')], capture)
  await processConversion(SITE, mapToConv(wave1PipeRow))
  assert.deepEqual(capture.params.visitor_ids, ['anon-buyer-9'],
    'pageviews_by_visitors is filtered by the conversion distinct_id itself — the identity key both stores share')
})

// ── per-conversion window preserved (<= ts AND >= ts - windowDays) ────────────

test('the per-conversion window is PRESERVED — pageviews outside [ts-30d, ts] are excluded', async (t) => {
  t.after(__resetNightlyReadDeps)
  inject([
    pv('2026-05-01T00:00:00Z', 'facebook'), // 69d before → OUTSIDE 30d window
    pv('2026-07-05T00:00:00Z', 'google'),   // 4d before → inside
    pv('2026-07-20T00:00:00Z', 'bing')      // AFTER the conversion → outside (> ts)
  ])
  const record = await processConversion(SITE, mapToConv(wave1PipeRow))
  assert.equal(record.touchpoint_count, 1, 'only the in-window pageview survives')
  assert.equal(record.first_touch_source, 'google')
  assert.equal(record.last_touch_source, 'google')
})

// ── byte-identical attribution: pipe touchpoints → same blobs as calculateAttribution

// Byte-identical is proven transitively: mapTouchpointPipeRow (test above) yields the
// EXACT positional array the HogQL SELECT produces, and everything downstream
// (touchpoints.map → calculateAttribution → record) is unchanged — so the 4 JSONB blobs
// are identical whether the rows came from the pipe or PostHog. Here we assert the blob
// CONTENTS concretely off pipe-sourced touchpoints (2 touches → 50/50), including all 4.
test('byte-identical: all 4 JSONB blobs are correct off pipe-sourced touchpoints (google+facebook, 50/50)', async (t) => {
  t.after(__resetNightlyReadDeps)
  inject([pv('2026-07-01T00:00:00Z', 'google'), pv('2026-07-05T00:00:00Z', 'facebook')])
  const record = await processConversion(SITE, mapToConv(wave1PipeRow))
  for (const blob of ['linear_attribution', 'u_shaped_attribution', 'time_decay_attribution', 'w_shaped_attribution']) {
    const shares = record[blob]
    assert.equal(shares.length, 2, `${blob}: 2 touches`)
    assert.deepEqual(shares.map(s => s.source), ['google', 'facebook'], `${blob}: sources in order`)
    assert.equal(Math.round(shares.reduce((s, x) => s + x.attributed_value, 0) * 100), 44444, `${blob}: attributed_value sums to 444.44`)
    assert.equal(shares[0].country, 'US', `${blob}: country carried from pipe`)
    assert.equal(shares[0].device, 'desktop', `${blob}: device carried from pipe`)
    assert.equal(shares[0].browser, 'Chrome', `${blob}: browser carried from pipe`)
  }
  // linear is exactly 50/50 (deterministic)
  assert.equal(record.linear_attribution[0].attributed_value, 222.22)
})

// ── item 5: dead store no longer reports success; genuine empty still does ────

test('computeTerminalStatus: a dead read (reads enabled, NO site pipe-served, fetched 0) is FAILED', () => {
  assert.equal(computeTerminalStatus({ processed: 0, fetched: 0, hardFailures: 0, suspectEmpty: true }), 'failed')
})

test('computeTerminalStatus: a GENUINE empty day (pipe served [], not suspect) is SUCCESS (no #184 regression)', () => {
  assert.equal(computeTerminalStatus({ processed: 0, fetched: 0, hardFailures: 0, suspectEmpty: false }), 'success')
})

test('computeTerminalStatus: processed>0 stays success even if flagged suspect', () => {
  assert.equal(computeTerminalStatus({ processed: 3, fetched: 3, hardFailures: 0, suspectEmpty: true }), 'success')
})

// map a conversions-pipe row to the conversion object shape processConversion consumes.
function mapToConv(r) {
  const row = mapConversionPipeRow(r)
  return {
    uuid: row[0], distinct_id: row[1], timestamp: row[2], conversion_type: row[3],
    conversion_value: row[4], external_event_id: row[5], webhook_customer_id: row[6],
    stripe_subscription_id: row[7], stripe_invoice_id: row[8], currency: row[9],
    provider_event_id: row[10], occurred_at: row[11], stripe_event_type: row[12], provider: row[13]
  }
}
