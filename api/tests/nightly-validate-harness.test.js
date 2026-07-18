// D2 B1 — the write-path validation harness. Proves the byte-diff has the sensitivity the money rail
// requires: EXACT equality on conversion_value + the 4 jsonb credit splits (no tolerance), jsonb
// ORDER-sensitivity, and — the headline fixture — that a SAME-TIMESTAMP touchpoint tie changes the
// attribution output, so the pipe's (timestamp, event_id) order vs HogQL's timestamp-only order is a
// real divergence the diff catches (an aggregate/sum check never would). TOKEN-FREE, no network.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-key'

const { diffAttributedConversionRecord, calculateAttribution, processConversion, __setNightlyReadDeps, __resetNightlyReadDeps } = await import('../jobs/nightly-attribution.js')

// A minimal but representative computed record (only the money-rail-relevant fields).
const baseRecord = () => ({
  conversion_value: 49.0,
  linear_attribution: [{ source: 'google', credit: 0.5 }, { source: 'facebook', credit: 0.5 }],
  u_shaped_attribution: null,
  time_decay_attribution: null,
  w_shaped_attribution: null,
  first_touch_source: 'google',
  last_touch_source: 'facebook',
  confidence_signals: { has_utm: true, has_click_id: false, has_ai_source: false, touchpoint_count: 2 },
  processing_version: '1.0'
})

test('identical records → zero mismatches', () => {
  assert.deepEqual(diffAttributedConversionRecord(baseRecord(), baseRecord()), [])
})

test('MONEY exact: a 1-cent conversion_value difference is flagged (no tolerance)', () => {
  const computed = baseRecord()
  const stored = { ...baseRecord(), conversion_value: 49.01 }
  const diffs = diffAttributedConversionRecord(computed, stored)
  assert.equal(diffs.length, 1)
  assert.equal(diffs[0].field, 'conversion_value')
})

test('MONEY exact: a sub-micro credit-split weight difference is flagged', () => {
  const computed = baseRecord()
  const stored = { ...baseRecord(), linear_attribution: [{ source: 'google', credit: 0.5000001 }, { source: 'facebook', credit: 0.4999999 }] }
  const diffs = diffAttributedConversionRecord(computed, stored)
  assert.ok(diffs.some(d => d.field === 'linear_attribution'), 'a credit-split weight drift must be caught exactly')
})

test('jsonb splits are ORDER-sensitive — a touchpoint REORDER (same elements) is a mismatch', () => {
  const computed = baseRecord() // [google, facebook]
  const stored = { ...baseRecord(), linear_attribution: [{ source: 'facebook', credit: 0.5 }, { source: 'google', credit: 0.5 }] }
  const diffs = diffAttributedConversionRecord(computed, stored)
  assert.ok(diffs.some(d => d.field === 'linear_attribution'), 'the split array order is semantic (touchpoint order) — a reorder must diff')
})

test('object jsonb (confidence_signals) is key-order-INSENSITIVE — no false mismatch', () => {
  const computed = baseRecord()
  const stored = { ...baseRecord(), confidence_signals: { touchpoint_count: 2, has_ai_source: false, has_click_id: false, has_utm: true } }
  assert.deepEqual(diffAttributedConversionRecord(computed, stored), [], 'Postgres jsonb object key order is not preserved — must not be a false mismatch')
})

test('processing_version (build metadata) is ignored, not diffed', () => {
  const computed = baseRecord()
  const stored = { ...baseRecord(), processing_version: '0.9' }
  assert.deepEqual(diffAttributedConversionRecord(computed, stored), [])
})

// ── The same-timestamp tie fixture — the divergence an aggregate check would never catch ──────────
test('🔴 SAME-TIMESTAMP TIE: touchpoint order changes attribution → pipe (timestamp,event_id) vs HogQL (timestamp) diverges', () => {
  const T = '2026-07-09T12:00:00Z'
  const google   = { timestamp: T, utm_source: 'google',   utm_medium: 'cpc',    utm_campaign: 'c', derived_source: 'google' }
  const facebook = { timestamp: T, utm_source: 'facebook', utm_medium: 'social', utm_campaign: 'c', derived_source: 'facebook' }

  // The pipe's ORDER BY (timestamp, event_id) yields a DETERMINISTIC order (say google first);
  // HogQL's ORDER BY timestamp only leaves the tie unspecified → the stored row may have been
  // computed from the other order. Same two touchpoints, same timestamp — different first touch.
  const pipeOrder  = calculateAttribution([google, facebook], 100)
  const hogqlOrder = calculateAttribution([facebook, google], 100)

  assert.notEqual(
    pipeOrder.first_touch?.source ?? pipeOrder.first_touch?.derived_source,
    hogqlOrder.first_touch?.source ?? hogqlOrder.first_touch?.derived_source,
    'a same-timestamp tie MUST change first_touch — proving the read ORDER BY is material to the money rail'
  )

  // And the byte-diff catches exactly this: a record computed from the pipe order vs one stored from
  // the HogQL order differs on first_touch_source — invisible to any conversions/revenue SUM.
  const computed = { first_touch_source: pipeOrder.first_touch?.source, conversion_value: 100 }
  const stored   = { first_touch_source: hogqlOrder.first_touch?.source, conversion_value: 100 }
  assert.ok(
    diffAttributedConversionRecord(computed, stored).some(d => d.field === 'first_touch_source'),
    'the harness flags the tie-order divergence that an aggregate check cannot'
  )
})

// The tie-COUNTER plumbing: dryRun returns { record, touchpoints } so validateSite can tally REAL
// same-timestamp ties from the pipe-read touchpoints. Proves the input the tally consumes is present.
const pvRow = (ts, utm_source) => ({
  visitor_id: 'v1', distinct_id: 'v1', timestamp: ts, utm_source, utm_medium: 'cpc', utm_campaign: 'c',
  referrer: null, ai_source: null, gclid: null, gbraid: null, wbraid: null, fbclid: null, msclkid: null,
  ttclid: null, li_fat_id: null, li_fatid: null, twclid: null, dclid: null, snapclid: null, pclid: null,
  sccid: null, ko_click_id: null, page_url: 'https://x/p', utm_term: null, country: 'US',
  device_type: 'desktop', browser_name: 'Chrome'
})

test('dryRun returns { record, touchpoints }; same-timestamp touchpoints surface as a detectable tie', async (t) => {
  t.after(__resetNightlyReadDeps)
  const T = '2026-07-09T10:00:00Z' // two pageviews at the SAME timestamp → a real tie
  __setNightlyReadDeps({
    tbReadEnabled: () => true,
    queryPipe: async (pipe) => pipe === 'pageviews_by_visitors' ? [pvRow(T, 'google'), pvRow(T, 'facebook')] : null
  })
  const conv = { uuid: 'c1', distinct_id: 'v1', timestamp: '2026-07-09T12:00:00Z', conversion_type: 'purchase', conversion_value: 100 }
  const res = await processConversion({ id: 's1', site_key: 'sk', attribution_window_days: 30 }, conv, { dryRun: true })

  assert.ok(res && res.record && Array.isArray(res.touchpoints), 'dryRun returns { record, touchpoints }')
  const ts = res.touchpoints.map((tp) => tp.timestamp)
  assert.equal(ts.length, 2, 'both same-timestamp touchpoints are in the window')
  assert.notEqual(ts.length, new Set(ts).size, 'the two identical timestamps register as a real tie (validateSite realTies++)')
})
