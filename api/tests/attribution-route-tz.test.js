// Regression: attribution.js flexible path threw `tz is not defined` (ReferenceError at
// `filters.timezone = tz`) on any non-pre-aggregated model, which the outer catch turned
// into a SILENT { success:true, results:[], analytics_unavailable:true } 200. This drives
// the route handler on a flexible model (first_touch_non_direct) + a session metric (routes
// getFlexibleReport -> getSessionReport, which uses the injectable read seam) and asserts:
// no analytics_unavailable, real results, and tz defaults sanely from req.site.timezone.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { attribution } = await import('../routes/attribution.js')
const { __setAttributionReadDeps, __resetAttributionReadDeps } = await import('../lib/attribution-engine.js')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
// first_touch_non_direct (flexible path -> line 220 tz) + session_count (routes to
// getSessionReport, seam-injectable). group_by=source.
const req = (timezone, siteId) => ({
  site: { id: siteId, plan: 'business', timezone },
  query: { model: 'first_touch_non_direct', date_from: '2026-07-01', date_to: '2026-07-06', group_by: 'source', metric: 'session_count' }
})

// One google pageview -> one session -> source 'google', session_count 1. NAMED
// session_report_pageviews pipe rows (the seam maps these). Post-D1c-1 the session-report
// read is Tinybird-SOLE — serve it from the PIPE (a null pipe would now throw, not fall back).
const PV = [{ distinct_id: 'v1', timestamp: '2026-07-01T10:00:00Z', page_url: '/a', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand', country: 'US', device_type: 'desktop' }]
function stubDeps () {
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => pipe === 'session_report_pageviews' ? PV : pipe === 'session_report_conversions' ? [] : null,
    queryHog: async () => { throw new Error('HogQL must not be called — the session-report read is Tinybird-sole post-D1c-1') }
  })
}

test('flexible path (first_touch_non_direct) returns real data, not analytics_unavailable', async () => {
  stubDeps()
  const res = mockRes()
  try { await attribution(req('America/New_York', 'site-tz-1'), res) } finally { __resetAttributionReadDeps() }

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.success, true)
  assert.ok(!res.body.data.analytics_unavailable, 'the tz ReferenceError no longer swallows the response into analytics_unavailable')
  assert.ok(Array.isArray(res.body.data.results), 'results is an array')
  const google = res.body.data.results.find((r) => r.dim_value === 'google')
  assert.ok(google && google.session_count === 1, 'real session data flows through the flexible path')
})

test('tz resolves from req.site.timezone when valid', async () => {
  stubDeps()
  const res = mockRes()
  try { await attribution(req('America/New_York', 'site-tz-2'), res) } finally { __resetAttributionReadDeps() }
  assert.strictEqual(res.body.data.filters?.timezone, 'America/New_York', 'valid site timezone is used')
})

test('tz defaults to UTC when req.site.timezone is missing/invalid', async () => {
  stubDeps()
  const resMissing = mockRes()
  try { await attribution(req(undefined, 'site-tz-3'), resMissing) } finally { __resetAttributionReadDeps() }
  assert.strictEqual(resMissing.body.data.filters?.timezone, 'UTC', 'missing timezone -> UTC')

  stubDeps()
  const resInvalid = mockRes()
  try { await attribution(req('Not/AZone', 'site-tz-4'), resInvalid) } finally { __resetAttributionReadDeps() }
  assert.strictEqual(resInvalid.body.data.filters?.timezone, 'UTC', 'invalid timezone -> UTC')
})
