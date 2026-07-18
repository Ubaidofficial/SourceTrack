// W1-bc1 read-cutover — getSessionReport dispatch. BOTH reads are wired pipe-first
// (session_report_pageviews + session_report_conversions); grouping happens in JS
// (deriveSessions). Post-D1c-1 the HogQL fallback is gone: a null/gated pipe throws
// the loud tinybird-force-read invariant instead of serving dead-store zeros. The
// FILTER GATE (content filter → pipe ineligible) therefore now THROWS rather than
// diverting to HogQL — a filtered session report can't serve real data until a
// filter-aware pipe exists. NOTE: getSessionReport caches on its full key, so each
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
const CONV = [{ distinct_id: 'v1', timestamp: '2026-07-01T10:05:00Z' }]

async function run (deps) {
  __evictSessionReportCache(SITE, FROM, TO, ...R) // fresh dispatch, no cross-run cache hit
  __setAttributionReadDeps(deps)
  try { return await getSessionReport(SITE, FROM, TO, ...R) } finally { __resetAttributionReadDeps() }
}

test('DISPATCH: named pipe rows produce the expected session report, HogQL untouched', async () => {
  const pipeRes = await run({
    queryTinybird: async (pipe) => pipe === 'session_report_pageviews' ? PV : pipe === 'session_report_conversions' ? CONV : null,
    queryHog: async () => { throw new Error('HogQL must not be called on the pipe path') }
  })
  // source 'google' aggregated 2 sessions
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

test('FILTER GATE: a content filter (filters.source) makes the pipe ineligible -> THROWS force-read, no HogQL', async () => {
  const F = ['source', 'session_count', { source: 'google' }, null]
  __evictSessionReportCache(SITE, FROM, TO, ...F)
  const pipes = []
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => { pipes.push(pipe); return pipe === 'session_report_pageviews' ? PV : pipe === 'session_report_conversions' ? CONV : null },
    queryHog: async () => { throw new Error('HogQL must not be called — the fallback is gone post-D1c-1') }
  })
  try {
    await assert.rejects(
      getSessionReport(SITE, FROM, TO, ...F),
      /tinybird-force-read.*session_report_pageviews returned null/,
      'a filtered (pipe-ineligible) session report must throw the loud force-read invariant, not serve dead-store zeros'
    )
  } finally { __resetAttributionReadDeps() }
  assert.ok(!pipes.includes('session_report_pageviews'), 'filtered -> pageviews pipe gated out (ineligible), never queried')
})

test('FILTER GATE: unfiltered request STILL dispatches the pipe (gate only diverts filtered)', async () => {
  const pipes = []
  __evictSessionReportCache(SITE, FROM, TO, ...R)
  __setAttributionReadDeps({
    queryTinybird: async (pipe) => { pipes.push(pipe); return pipe === 'session_report_pageviews' ? PV : pipe === 'session_report_conversions' ? CONV : null },
    queryHog: async () => { throw new Error('unfiltered must serve from the pipe, not HogQL') }
  })
  try { await getSessionReport(SITE, FROM, TO, ...R) } finally { __resetAttributionReadDeps() }
  assert.ok(pipes.includes('session_report_pageviews') && pipes.includes('session_report_conversions'), 'unfiltered -> both pipes serve')
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
