// W1-bc1 read-cutover — getSessionReport dispatch parity. BOTH reads are wired pipe-first
// (session_report_pageviews + session_report_conversions); grouping happens in JS
// (deriveSessions) so it's identical on both legs. Proves the pipe named-row remap ==
// the HogQL positional shape. NOTE: getSessionReport caches on its full key, so each
// run evicts first (via the __evictSessionReportCache seam) to avoid a cross-run cache hit.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getSessionReport, __setAttributionReadDeps, __resetAttributionReadDeps, __evictSessionReportCache } = await import('../lib/attribution-engine.js')

const SITE = 'site-sr'
const FROM = '2026-07-01'
const TO = '2026-07-06'
const R = ['source', 'session_count', {}, null] // groupBy, metric, filters, groupBy2

// Two visitors, each a google pageview -> 2 sessions -> source 'google' session_count = 2.
// Pipe pageview named rows == the pipe SELECT aliases; HogQL positional == the mapRows order.
const PV = [
  { distinct_id: 'v1', timestamp: '2026-07-01T10:00:00Z', page_url: '/a', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand', country: 'US', device_type: 'desktop' },
  { distinct_id: 'v2', timestamp: '2026-07-02T10:00:00Z', page_url: '/b', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand', country: 'US', device_type: 'desktop' }
]
const PV_KEYS = ['distinct_id', 'timestamp', 'page_url', 'utm_source', 'utm_medium', 'utm_campaign', 'country', 'device_type']
const pvPos = (o) => PV_KEYS.map((k) => o[k])
const CONV = [{ distinct_id: 'v1', timestamp: '2026-07-01T10:05:00Z' }]
const convPos = (o) => [o.distinct_id, o.timestamp]

async function run (deps) {
  __evictSessionReportCache(SITE, FROM, TO, ...R) // fresh dispatch, no cross-run cache hit
  __setAttributionReadDeps(deps)
  try { return await getSessionReport(SITE, FROM, TO, ...R) } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: named pipe rows and positional HogQL rows produce the identical session report', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === 'session_report_pageviews' ? PV : pipe === 'session_report_conversions' ? CONV : null,
    queryHog: async () => { throw new Error('HogQL must not be called on the pipe path') }
  })
  const hogRes = await run({
    queryTinybird: async () => null,
    queryHog: async (_sql, name) => name === 'session_report_pageviews' ? PV.map(pvPos) : name === 'session_report_conversions' ? CONV.map(convPos) : []
  })
  assert.deepStrictEqual(pipeRes, hogRes, 'pipe named-row remap == HogQL positional -> byte-identical output')
  // sanity: source 'google' aggregated 2 sessions
  const google = pipeRes.find((r) => r.dim_value === 'google')
  assert.ok(google && google.session_count === 2, 'both visitors folded into source=google, session_count=2')
})

test('DISPATCH: pipe path serves WITHOUT touching HogQL (zero fallback)', async () => {
  let hogCalled = false
  await run({
    queryTinybird: async (pipe) => pipe === 'session_report_pageviews' ? PV : pipe === 'session_report_conversions' ? CONV : null,
    queryHog: async () => { hogCalled = true; return [] }
  })
  assert.strictEqual(hogCalled, false, 'both wired reads served from the pipe; HogQL untouched')
})

test('daily-bucket safety: pipe timestamps (ISO via #155) keep started_at.split(T) correct', async () => {
  // groupBy=date exercises sess.started_at.split('T')[0]; ISO pipe ts -> plain YYYY-MM-DD.
  __evictSessionReportCache(SITE, FROM, TO, 'date', 'session_count', {}, null)
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => pipe === 'session_report_pageviews' ? PV : pipe === 'session_report_conversions' ? CONV : null,
    queryHog: async () => []
  })
  let res
  try { res = await getSessionReport(SITE, FROM, TO, 'date', 'session_count', {}, null) } finally { __resetAttributionReadDeps() }
  for (const r of res) assert.match(r.dim_value, /^\d{4}-\d{2}-\d{2}$/, 'daily bucket is a plain date, not a whole timestamp string')
})
