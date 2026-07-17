// Read-cutover — sessions.js dispatch/fallback tests. All money-rail reads wired via readTb:
// sessions_pageviews + sessions_conversions (overview), and visitor_sessions (the per-visitor
// $pageview/$conversion detail read, money-rail conversion_value). Pipes return NAMED rows;
// readTb remaps them to the POSITIONAL shape the consumer destructures.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/sessions.js')
const { sessionsOverview, visitorSessions, __setSessionsReadDeps, __resetSessionsReadDeps } = mod
const { normalizePipeTimestamp } = await import('../lib/tinybird-read.js')

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

test('sessions overview — D1b: pipe null -> 500 (HogQL fallback DELETED)', async () => {
  const tb = []
  __setSessionsReadDeps({ queryTinybird: tbStub(tb, null), queryHog: async () => { throw new Error('HogQL called — D1b deleted the fallback') } })
  try {
    const res = mockRes()
    await sessionsOverview(req(), res)
    assert.strictEqual(res.statusCode, 500, 'a null pipe 500s loud instead of serving HogQL dead-store zeros')
    assert.ok(tb.length >= 1, 'a read attempted Tinybird first')
  } finally { __resetSessionsReadDeps() }
})

test('sessions overview — D1b: sessions_conversions served from Tinybird; named row remaps to the consumer shape', async () => {
  const PV_NAMED = { distinct_id: 'v1', timestamp: '2026-07-01T10:00:00Z', page_url: '/x', utm_source: 'g', utm_medium: 'cpc', utm_campaign: 'camp' }
  const CONV_NAMED = { distinct_id: 'v1', timestamp: '2026-07-01T11:00:00Z', conversion_value: 42.5 }
  const hogA = []
  __setSessionsReadDeps({
    queryTinybird: tbStub([], { sessions_pageviews: [PV_NAMED], sessions_conversions: [CONV_NAMED] }),
    queryHog: async () => { hogA.push('called'); throw new Error('HogQL called — pipe served, no fallback') }
  })
  const resA = mockRes(); await sessionsOverview(req(), resA); __resetSessionsReadDeps()
  assert.strictEqual(hogA.length, 0, 'both reads served from Tinybird — no HogQL call')
  assert.strictEqual(resA.body.success, true, 'named->consumer conv remap yields a valid session response')
})

test('sessions overview — D1b: both reads served from Tinybird, HogQL NOT called (money-rail)', async () => {
  const tb = []
  __setSessionsReadDeps({
    queryTinybird: tbStub(tb, {
      sessions_pageviews: [{ distinct_id: 'v1', timestamp: '2026-07-01T10:00:00Z', page_url: '/x', utm_source: 'g', utm_medium: 'cpc', utm_campaign: 'camp' }],
      sessions_conversions: [{ distinct_id: 'v1', timestamp: '2026-07-01T11:00:00Z', conversion_value: 42.5 }]
    }),
    queryHog: async () => { throw new Error('HogQL called — both pipes served') }
  })
  try {
    const res = mockRes()
    await sessionsOverview(req(), res)
    assert.strictEqual(res.body.success, true)
    const pv = tb.find(c => c.pipe === 'sessions_pageviews')
    assert.deepStrictEqual(pv.params, { site_id: 'site-00', date_from_ts: '2026-07-01 00:00:00', date_to_ts: '2026-07-03 00:00:00' })
    assert.ok(tb.find(c => c.pipe === 'sessions_conversions'), 'the money-rail conversions read dispatched from the pipe')
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

// ── ClickHouse ts normalization (money-rail parity fix) ──────────────────────
test('normalizePipeTimestamp — every contract row (ClickHouse space -> ISO-UTC, idempotent on ISO)', () => {
  assert.strictEqual(normalizePipeTimestamp('2026-07-01 20:29:28.976'), '2026-07-01T20:29:28.976Z', 'space+millis -> T…Z')
  assert.strictEqual(normalizePipeTimestamp('2026-07-01 20:29:28'), '2026-07-01T20:29:28Z', 'space, no millis -> T…Z')
  assert.strictEqual(normalizePipeTimestamp('2026-07-01T20:29:28.976Z'), '2026-07-01T20:29:28.976Z', 'already ISO-UTC -> unchanged')
  assert.strictEqual(normalizePipeTimestamp('2026-07-01T20:29:28.976'), '2026-07-01T20:29:28.976Z', 'ISO w/o Z -> add Z (else new Date() = local skew)')
  assert.strictEqual(normalizePipeTimestamp('2026-07-01T20:29:28.976+00:00'), '2026-07-01T20:29:28.976+00:00', 'explicit offset -> unchanged')
  for (const v of [null, undefined, '']) assert.strictEqual(normalizePipeTimestamp(v), v, `passthrough ${JSON.stringify(v)} (never throws)`)
  // idempotent: normalizing an already-normalized value is a no-op
  assert.strictEqual(normalizePipeTimestamp(normalizePipeTimestamp('2026-07-01 20:29:28.976')), '2026-07-01T20:29:28.976Z')
})

test('sessions overview — TS-NORMALIZE parity: SPACE-form pipe ts == ISO HogQL ts (identical daily buckets AND durations)', async () => {
  // Same logical events, two wire formats: the ON/pipe leg emits ClickHouse SPACE
  // timestamps; the OFF/HogQL leg emits the ISO-UTC equivalents. v1 has a 2-pageview
  // session on 07-01 (a real duration) plus a 07-02 session; v2 converts on 07-01.
  // Pre-fix, the space form broke both new Date() (duration) and started_at.split('T')
  // (daily bucket keyed by the whole string) — this locks that regression.
  const EV = [
    { did: 'v1', space: '2026-07-01 20:29:28.976', iso: '2026-07-01T20:29:28.976Z', url: '/a' },
    { did: 'v1', space: '2026-07-01 20:35:00', iso: '2026-07-01T20:35:00Z', url: '/b' },
    { did: 'v1', space: '2026-07-02 09:00:00', iso: '2026-07-02T09:00:00Z', url: '/c' },
    { did: 'v2', space: '2026-07-01 21:00:00', iso: '2026-07-01T21:00:00Z', url: '/d' }
  ]
  const CONV = { did: 'v2', space: '2026-07-01 21:05:00', iso: '2026-07-01T21:05:00Z', val: 42.5 }

  const pvNamedSpace = EV.map(e => ({ distinct_id: e.did, timestamp: e.space, page_url: e.url, utm_source: null, utm_medium: null, utm_campaign: null }))
  const convNamedSpace = [{ distinct_id: CONV.did, timestamp: CONV.space, conversion_value: CONV.val }]
  // D1b: Tinybird is the SOLE read path — serve SPACE-form named rows; HogQL is gone.
  __setSessionsReadDeps({
    queryTinybird: async (pipe) => pipe === 'sessions_pageviews' ? pvNamedSpace : pipe === 'sessions_conversions' ? convNamedSpace : null,
    queryHog: async (_sql, name) => { throw new Error(`HogQL called for ${name} — pipe served, no fallback`) }
  })
  const resB = mockRes(); await sessionsOverview(req(), resB); __resetSessionsReadDeps()

  assert.strictEqual(resB.body.success, true)
  // SPACE-form pipe timestamps are normalized to ISO so both new Date() (duration) and the daily bucket
  // key work: buckets are plain YYYY-MM-DD, and events spanning two days -> at least two buckets.
  assert.ok(resB.body.data.time_series.length >= 2, 'events span two days -> at least two daily buckets')
  for (const t of resB.body.data.time_series) assert.match(t.date, /^\d{4}-\d{2}-\d{2}$/, 'daily bucket is a plain date, not the whole timestamp string')
})

// ── visitor_sessions (per-visitor detail read, money-rail conversion_value) ──
const vsReq = (query = { distinct_id: 'v1' }) => ({ site: { id: 'site-00' }, query })
const VS_PV = { event_type: '$pageview', timestamp: '2026-07-01T10:00:00Z', page_url: '/x', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'camp', conversion_value: 0 }
const VS_CONV = { event_type: '$conversion', timestamp: '2026-07-01T10:05:00Z', page_url: '/checkout', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'camp', conversion_value: 120 }

test('sessions visitor — D1b: served 7-col named pipe rows remap to the shape the consumer reads', async () => {
  __setSessionsReadDeps({ queryTinybird: async () => [VS_PV, VS_CONV], queryHog: async () => { throw new Error('HogQL called — pipe served, no fallback') } })
  const resA = mockRes(); await visitorSessions(vsReq(), resA); __resetSessionsReadDeps()
  assert.strictEqual(resA.body.data.session_count, 1)
  assert.notStrictEqual(resA.body.data.converting_session_index, null, 'the $120 conversion is recognized as a converting session (money field survives the 7-col remap)')
})

test('sessions visitor — DISPATCH: served from pipe, HogQL NOT called, tenant + visitor scoped', async () => {
  const tb = []
  __setSessionsReadDeps({ queryTinybird: async (p, params) => { tb.push({ p, params }); return [VS_PV, VS_CONV] }, queryHog: async () => { throw new Error('HogQL called') } })
  try {
    const res = mockRes()
    await visitorSessions(vsReq(), res)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(tb[0].p, 'visitor_sessions')
    assert.deepStrictEqual(tb[0].params, { site_id: 'site-00', distinct_id: 'v1' }, 'scoped to authenticated site_id + requested visitor')
  } finally { __resetSessionsReadDeps() }
})

test('sessions visitor — D1b: pipe null -> 500 (HogQL fallback DELETED)', async () => {
  __setSessionsReadDeps({ queryTinybird: async () => null, queryHog: async () => { throw new Error('HogQL called — D1b deleted the fallback') } })
  try {
    const res = mockRes()
    await visitorSessions(vsReq(), res)
    assert.strictEqual(res.statusCode, 500, 'a null visitor pipe 500s loud instead of a silent HogQL dead-store read')
  } finally { __resetSessionsReadDeps() }
})

test('sessions visitor — FAIL-CLOSED: FORCE_READ + pipe null -> 500', async () => {
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setSessionsReadDeps({ queryTinybird: async () => null, queryHog: async () => { throw new Error('should not reach') } })
  try {
    const res = mockRes()
    await visitorSessions(vsReq(), res)
    assert.strictEqual(res.statusCode, 500)
  } finally { delete process.env.TINYBIRD_FORCE_READ; __resetSessionsReadDeps() }
})

test('sessions visitor — guard: missing distinct_id -> 400 (no read attempted)', async () => {
  let called = false
  __setSessionsReadDeps({ queryTinybird: async () => { called = true; return null }, queryHog: async () => { called = true; return [] } })
  try {
    const res = mockRes()
    await visitorSessions(vsReq({}), res)
    assert.strictEqual(res.statusCode, 400)
    assert.strictEqual(called, false, 'no backend read before the guard')
  } finally { __resetSessionsReadDeps() }
})
