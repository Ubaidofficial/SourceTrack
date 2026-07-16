// getSessionReport dimension contract — the dim switch used to FABRICATE buckets.
// TOKEN-FREE, NO network (the pageview/conversion reads are dependency-injected).
//
// Two bugs this locks:
//   1. `conversion_type` returned a raw SQL STRING as the JS group key, so every session
//      bucketed under the literal "COALESCE(NULLIF(any(properties.conversion_type)...".
//   2. Class-A dims (provider/attribution_status/stitching_method) had NO case ->
//      `default: 'unknown'` -> every session collapsed into one invented bucket.
// Plus the root cause behind country/device/channel/custom_param: the switch read
// sess.entry_event / sess.country / sess.device_type — fields startSession never set.
//
// A fabricated bucket is WORSE than a zero: it presents invented structure as the
// customer's real data (§6). Unsupported dims now throw `unsupported_session_dim`.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'

const {
  getSessionReport, SESSION_REPORT_DIMS, isSessionReportDim,
  __setAttributionReadDeps, __resetAttributionReadDeps
} = await import('../lib/attribution-engine.js')

// Two visitors, distinct country/device/campaign, so a real per-dim split is observable.
// Positional order matches the pageview SELECT:
// [distinct_id, timestamp, page_url, utm_source, utm_medium, utm_campaign, country, device_type]
const PV_ROWS = [
  ['v1', '2026-07-01T10:00:00Z', '/pricing', 'google', 'cpc', 'summer', 'US', 'desktop'],
  ['v2', '2026-07-01T11:00:00Z', '/blog', 'facebook', 'social', 'brand', 'DE', 'mobile']
]

function inject () {
  __setAttributionReadDeps({
    queryTinybird: async () => null,          // force the HogQL leg
    queryHog: async (_sql, name) => (name === 'session_report_conversions' ? [] : PV_ROWS)
  })
}
const run = (groupBy, groupBy2 = null) =>
  getSessionReport('site-1', '2026-07-01', '2026-07-02', groupBy, 'session_count', {}, groupBy2)

// ── the contract ─────────────────────────────────────────────────────────────
test('SESSION_REPORT_DIMS is exactly the pageview-derivable set', () => {
  assert.deepEqual([...SESSION_REPORT_DIMS].sort(),
    ['campaign', 'country', 'date', 'device', 'landing_page', 'medium', 'source'])
  for (const d of ['source', 'country', 'device']) assert.ok(isSessionReportDim(d), d)
  for (const d of ['channel', 'keyword', 'conversion_type', 'provider', null]) assert.ok(!isSessionReportDim(d), String(d))
})

// ── BUG 1: conversion_type returned raw SQL as the group key ──────────────────
test('🔴 conversion_type no longer buckets under a raw SQL literal — it throws as unsupported', async (t) => {
  t.after(__resetAttributionReadDeps); inject()
  await assert.rejects(() => run('conversion_type'), (err) => {
    assert.equal(err.code, 'unsupported_session_dim')
    assert.doesNotMatch(err.message, /COALESCE|NULLIF|properties\./, 'must not leak SQL to the caller')
    return true
  })
})

// ── BUG 2: Class-A dims collapsed into one fake 'unknown' bucket ──────────────
for (const dim of ['provider', 'attribution_status', 'stitching_method']) {
  test(`🔴 ${dim} no longer collapses to a fabricated 'unknown' bucket — it throws as unsupported`, async (t) => {
    t.after(__resetAttributionReadDeps); inject()
    await assert.rejects(() => run(dim), (err) => {
      assert.equal(err.code, 'unsupported_session_dim')
      assert.match(err.message, new RegExp(dim))
      return true
    })
  })
}

// ── the other fabricators ────────────────────────────────────────────────────
for (const dim of ['channel', 'keyword', 'referrer_domain', 'browser', 'custom_param:plan']) {
  test(`${dim} is rejected as unsupported (data not fetched -> any value would be invented)`, async (t) => {
    t.after(__resetAttributionReadDeps); inject()
    await assert.rejects(() => run(dim), (err) => err.code === 'unsupported_session_dim')
  })
}

test('an unsupported SECONDARY dim (group_by2) is rejected too', async (t) => {
  t.after(__resetAttributionReadDeps); inject()
  await assert.rejects(() => run('source', 'channel'), (err) => {
    assert.equal(err.code, 'unsupported_session_dim')
    assert.match(err.message, /group_by2/)
    return true
  })
})

// ── the supported dims produce REAL per-dim buckets ──────────────────────────
test('source buckets by real value (not one collapsed bucket)', async (t) => {
  t.after(__resetAttributionReadDeps); inject()
  const rows = await run('source')
  assert.deepEqual(rows.map(r => r.dim_value).sort(), ['facebook', 'google'])
})

test('🔴 country buckets by REAL value — was always the fabricated \'unknown\' (sess.country never existed)', async (t) => {
  t.after(__resetAttributionReadDeps); inject()
  const rows = await run('country')
  assert.deepEqual(rows.map(r => r.dim_value).sort(), ['DE', 'US'])
  assert.ok(!rows.some(r => r.dim_value === 'unknown'), 'no fabricated unknown bucket')
})

test('🔴 device buckets by REAL value — was always \'unknown\' (sess.device_type never existed)', async (t) => {
  t.after(__resetAttributionReadDeps); inject()
  const rows = await run('device')
  assert.deepEqual(rows.map(r => r.dim_value).sort(), ['desktop', 'mobile'])
  assert.ok(!rows.some(r => r.dim_value === 'unknown'), 'no fabricated unknown bucket')
})

test('campaign / landing_page / date bucket by real value', async (t) => {
  t.after(__resetAttributionReadDeps); inject()
  assert.deepEqual((await run('campaign')).map(r => r.dim_value).sort(), ['brand', 'summer'])
  assert.deepEqual((await run('landing_page')).map(r => r.dim_value).sort(), ['/blog', '/pricing'])
  assert.deepEqual((await run('date')).map(r => r.dim_value), ['2026-07-01'])
})

test('a supported cross-tab (source × country) splits on both real dims', async (t) => {
  t.after(__resetAttributionReadDeps); inject()
  const rows = await run('source', 'country')
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map(r => `${r.dim_value}|${r.dim_value2}`).sort(), ['facebook|DE', 'google|US'])
})
