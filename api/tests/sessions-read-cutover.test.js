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
  const pvPosIso = EV.map(e => [e.did, e.iso, e.url, null, null, null])
  const convPosIso = [[CONV.did, CONV.iso, CONV.val]]

  // OFF leg (baseline): HogQL serves ISO positional rows; pipe null.
  __setSessionsReadDeps({
    queryTinybird: async () => null,
    queryHog: async (_sql, name) => name === 'sessions_pageviews' ? pvPosIso : name === 'sessions_conversions' ? convPosIso : []
  })
  const resA = mockRes(); await sessionsOverview(req(), resA); __resetSessionsReadDeps()

  // ON leg: Tinybird serves SPACE-form named rows; HogQL must NOT be called.
  __setSessionsReadDeps({
    queryTinybird: async (pipe) => pipe === 'sessions_pageviews' ? pvNamedSpace : pipe === 'sessions_conversions' ? convNamedSpace : null,
    queryHog: async (_sql, name) => { throw new Error(`HogQL called for ${name} on the ON leg (zero-fallback violated)`) }
  })
  const resB = mockRes(); await sessionsOverview(req(), resB); __resetSessionsReadDeps()

  assert.strictEqual(resA.body.success, true)
  assert.strictEqual(resB.body.success, true)
  // Buckets are plain YYYY-MM-DD (proves started_at.split('T') works on the normalized ts)
  assert.ok(resA.body.data.time_series.length >= 2, 'events span two days -> at least two daily buckets')
  for (const t of resB.body.data.time_series) assert.match(t.date, /^\d{4}-\d{2}-\d{2}$/, 'daily bucket is a plain date, not the whole timestamp string')
  // Full parity: identical daily buckets AND identical aggregates (durations, etc.)
  assert.deepStrictEqual(resB.body.data.time_series, resA.body.data.time_series, 'identical daily buckets')
  assert.deepStrictEqual(resB.body, resA.body, 'SPACE pipe ts normalized to ISO -> byte-identical session output vs the HogQL ISO leg')
})
