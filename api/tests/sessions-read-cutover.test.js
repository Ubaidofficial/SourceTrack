// Wave-3 read-cutover — sessions.js dispatch/fallback tests.
// Wired: sessions_pageviews (pageview read) + sessions_conversions (money-rail
// $conversion + conversion_value). visitor_sessions stays on HogQL.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/sessions.js')
const { sessionsOverview, __setSessionsReadDeps, __resetSessionsReadDeps } = mod

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const req = () => ({ site: { id: 'site-00' }, query: { date_from: '2026-07-01', date_to: '2026-07-02' } })

const PV_ROW = ['v1', '2026-07-01T10:00:00Z', '/x', 'g', 'cpc', 'camp']
function hogStub (calls) {
  return async (_sql, name) => {
    calls.push(name)
    if (name === 'sessions_pageviews') return [PV_ROW]
    return [] // sessions_conversions: none
  }
}
function tbStub (calls, rowsByPipe) {
  return async (pipe, params) => { calls.push({ pipe, params }); return rowsByPipe === null ? null : (rowsByPipe[pipe] ?? null) }
}

test('sessions overview — FALLBACK: flag off (pipe null) -> HogQL for pageviews + conversions', async () => {
  const tb = []; const hog = []
  __setSessionsReadDeps({ queryTinybird: tbStub(tb, null), queryHog: hogStub(hog) })
  try {
    const res = mockRes()
    await sessionsOverview(req(), res)
    assert.strictEqual(res.body.success, true)
    assert.deepStrictEqual(hog.sort(), ['sessions_conversions', 'sessions_pageviews'])
    assert.deepStrictEqual(tb.map(c => c.pipe), ['sessions_pageviews', 'sessions_conversions'], 'both wired reads attempt Tinybird')
  } finally { __resetSessionsReadDeps() }
})

test('sessions overview — DISPATCH conversions: sessions_conversions served from Tinybird; named→consumer shape == HogQL positional', async () => {
  const PV_NAMED = { distinct_id: 'v1', timestamp: '2026-07-01T10:00:00Z', page_url: '/x', utm_source: 'g', utm_medium: 'cpc', utm_campaign: 'camp' }
  const CONV_NAMED = { distinct_id: 'v1', timestamp: '2026-07-01T11:00:00Z', conversion_value: 42.5 }
  const CONV_POS = ['v1', '2026-07-01T11:00:00Z', 42.5] // HogQL positional equivalent

  // Run A: both reads via Tinybird (conversions named rows through readTb mapRows).
  const hogA = []
  __setSessionsReadDeps({
    queryTinybird: tbStub([], { sessions_pageviews: [PV_NAMED], sessions_conversions: [CONV_NAMED] }),
    queryHog: hogStub(hogA)
  })
  const resA = mockRes(); await sessionsOverview(req(), resA); __resetSessionsReadDeps()

  // Run B: conversions via HogQL positional (identical data); pageviews via Tinybird.
  const hogB = []
  __setSessionsReadDeps({
    queryTinybird: tbStub([], { sessions_pageviews: [PV_NAMED] }), // conversions pipe null -> HogQL
    queryHog: async (_sql, name) => { hogB.push(name); return name === 'sessions_conversions' ? [CONV_POS] : [] }
  })
  const resB = mockRes(); await sessionsOverview(req(), resB); __resetSessionsReadDeps()

  assert.strictEqual(hogA.length, 0, 'conversions served from Tinybird — no HogQL call')
  assert.strictEqual(resA.body.success, true)
  assert.deepStrictEqual(resA.body, resB.body, 'named→positional conv remap yields identical session output')
})

test('sessions overview — DISPATCH: flag on -> Tinybird for pageviews, HogQL only for conversions (money-rail)', async () => {
  const tb = []; const hog = []
  __setSessionsReadDeps({
    queryTinybird: tbStub(tb, { sessions_pageviews: [{ distinct_id: 'v1', timestamp: '2026-07-01T10:00:00Z', page_url: '/x', utm_source: 'g', utm_medium: 'cpc', utm_campaign: 'camp' }] }),
    queryHog: hogStub(hog)
  })
  try {
    const res = mockRes()
    await sessionsOverview(req(), res)
    assert.strictEqual(res.body.success, true)
    assert.deepStrictEqual(hog, ['sessions_conversions'], 'pageviews bypassed HogQL; only money-rail read used HogQL')
    const pv = tb.find(c => c.pipe === 'sessions_pageviews')
    assert.deepStrictEqual(pv.params, { site_id: 'site-00', date_from_ts: '2026-07-01 00:00:00', date_to_ts: '2026-07-03 00:00:00' })
  } finally { __resetSessionsReadDeps() }
})

test('sessions overview — FAIL-CLOSED: TINYBIRD_FORCE_READ + pipe null -> 500, no silent HogQL bypass', async () => {
  const tb = []; const hog = []
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setSessionsReadDeps({ queryTinybird: tbStub(tb, null), queryHog: hogStub(hog) })
  try {
    const res = mockRes()
    await sessionsOverview(req(), res)
    assert.strictEqual(res.statusCode, 500)
    assert.strictEqual(res.body.success, false)
    assert.ok(!hog.includes('sessions_pageviews'), 'no silent HogQL fallback for the wired read')
  } finally {
    delete process.env.TINYBIRD_FORCE_READ
    __resetSessionsReadDeps()
  }
})

test('sessions overview — validation guard: missing date range -> 400', async () => {
  const res = mockRes()
  await sessionsOverview({ site: { id: 'site-00' }, query: {} }, res)
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.body.success, false)
})
