// Regression: attribution.js's outer catch masked ANY thrown error as
// { success:true, results:[], analytics_unavailable:true } HTTP 200 — conflating a real
// failure (500) with the honest "query succeeded, zero rows" case, which is how the tz bug
// hid and how a mid-migration Tinybird read-wiring failure would be masked. This asserts a
// THROWN read surfaces as a real error (500, success:false, NO analytics_unavailable),
// while a read returning [] still returns the honest empty shape (200, success:true).

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
// Flexible model + session metric -> getFlexibleReport -> getSessionReport (read seam).
const req = (siteId) => ({
  site: { id: siteId, plan: 'business', timezone: 'UTC' },
  query: { model: 'first_touch_non_direct', date_from: '2026-07-01', date_to: '2026-07-06', group_by: 'source', metric: 'session_count' }
})

test('a THROWN read surfaces as a real 500 — NOT masked as analytics_unavailable:200', async () => {
  __setAttributionReadDeps({
    queryTinybird: async () => { throw new Error('simulated read-wiring failure') }, // the read is the pipe (Tinybird-sole)
    queryHog: async () => { throw new Error('HogQL must not be called post-D1c-1') }
  })
  const res = mockRes()
  try { await attribution(req('site-err-1'), res) } finally { __resetAttributionReadDeps() }

  assert.strictEqual(res.statusCode, 500, 'thrown error -> real 500')
  assert.strictEqual(res.body.success, false, 'success:false so fetchApi (!res.ok || !data.success) throws')
  assert.ok(!res.body.data?.analytics_unavailable, 'NOT masked as analytics_unavailable')
  assert.ok(res.body.error, 'carries an error message')
})

test('a read returning [] stays the HONEST empty shape — 200 success, no analytics_unavailable', async () => {
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => (pipe === 'session_report_pageviews' || pipe === 'session_report_conversions') ? [] : null, // pipe served zero rows
    queryHog: async () => { throw new Error('HogQL must not be called post-D1c-1') }
  })
  const res = mockRes()
  try { await attribution(req('site-err-2'), res) } finally { __resetAttributionReadDeps() }

  assert.strictEqual(res.statusCode, 200, 'legit empty is a success')
  assert.strictEqual(res.body.success, true)
  assert.deepStrictEqual(res.body.data.results, [], 'honest empty results')
  assert.ok(!res.body.data.analytics_unavailable, 'zero-rows is not an error — no analytics_unavailable flag')
})

test('a ClickHouse max-execution-time (504) surfaces error_code: query_timeout — honest, no raw leak, not empty', async () => {
  __setAttributionReadDeps({
    queryTinybird: async () => { throw new Error('Tinybird session_report_pageviews failed (504): "Query has hit the max execution time before completing... You may need to materialize."') }, // pipe read timeout
    queryHog: async () => { throw new Error('HogQL must not be called post-D1c-1') }
  })
  const res = mockRes()
  try { await attribution(req('site-timeout'), res) } finally { __resetAttributionReadDeps() }

  assert.strictEqual(res.statusCode, 500, 'real error status -> fetchApi throws (not a silent 200 empty)')
  assert.strictEqual(res.body.success, false)
  assert.strictEqual(res.body.error_code, 'query_timeout', 'structured timeout code so the dashboard renders an honest state, not "no data"')
  assert.match(res.body.error, /narrower date range|timed out/i, 'actionable message')
  assert.ok(!/max execution time|504/i.test(res.body.error), 'raw ClickHouse message NOT leaked to the client')
  assert.ok(!res.body.data?.analytics_unavailable, 'NOT masked as empty')
})

test('a non-timeout failure gets error_code: query_failed (not mislabeled as timeout)', async () => {
  __setAttributionReadDeps({
    queryTinybird: async () => { throw new Error('simulated read-wiring failure') }, // pipe read failure
    queryHog: async () => { throw new Error('HogQL must not be called post-D1c-1') }
  })
  const res = mockRes()
  try { await attribution(req('site-generic'), res) } finally { __resetAttributionReadDeps() }
  assert.strictEqual(res.body.error_code, 'query_failed', 'generic failures classified distinctly')
})
