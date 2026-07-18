// Grade B read-cutover — analytics.js pageviews dispatch/fallback tests.
// 5 call sites (summary, sources_ai, sources_ref, browsers, os) all route through
// the SAME dispatchPageviews helper, so the shared behavior is exercised via the
// two supabase-free routes (browsers, os) + deterministic unit tests on the
// exported param builder. Mirrors seo-revenue-read-cutover.test.js.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/analytics.js')
const router = mod.default
const { __setAnalyticsReadDeps, __resetAnalyticsReadDeps, buildPageviewPipeParams } = mod

const handlerFor = (path) => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.get)
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const osHandler = handlerFor('/os')
const browsersHandler = handlerFor('/browsers')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const req = (query = {}) => ({ site: { id: 'site-00' }, query })

// A pageview row — the pipe and fetchPageviews return this SAME named shape.
const ROW = (over = {}) => ({
  url: 'https://x/', referrer: null, utm_source: null, utm_medium: null, utm_campaign: null,
  country: null, device: 'desktop', browser: 'Chrome', os: 'Windows', ai_source: null,
  anonymous_id: 'v1', timestamp: '2026-07-10T10:00:00Z', ...over
})

// ── Deterministic param mapping: LIMIT / date-window / filters ────────────────

test('buildPageviewPipeParams — half-open window with +1-day EXCLUSIVE end + limit passthrough', () => {
  // from 2026-07-01, to 2026-07-02 -> pipe window [07-01 00:00:00, 07-03 00:00:00)
  // == HogQL serializeHogQLDateRange (exclusiveEnd default true): `>= from AND < to`.
  const p = buildPageviewPipeParams('s1', '2026-07-01', '2026-07-02', { limit: 10000 })
  assert.deepStrictEqual(p, {
    site_id: 's1',
    date_from_ts: '2026-07-01 00:00:00',
    date_to_ts: '2026-07-03 00:00:00',
    limit_val: 10000
  })
})

test('buildPageviewPipeParams — same-type MERGES to a comma-list; Channel mapped; unknown -> null', () => {
  const p = buildPageviewPipeParams('s1', '2026-07-01', '2026-07-02', {
    filters: [{ type: 'Source', value: 'google' }, { type: 'Country', value: 'US' }, { type: 'OS', value: 'Windows' }, { type: 'AI Source', value: 'ChatGPT' }]
  })
  assert.strictEqual(p.filter_source, 'google')
  assert.strictEqual(p.filter_country, 'US')
  assert.strictEqual(p.filter_os, 'Windows')
  assert.strictEqual(p.filter_ai_source, 'ChatGPT')
  // D1b-3 Item B: two filters of the SAME type MERGE into one comma-list (the pipe reads splitByChar).
  assert.strictEqual(buildPageviewPipeParams('s1', '2026-07-01', '2026-07-02', { filters: [{ type: 'Source', value: 'a' }, { type: 'Source', value: 'b' }] }).filter_source, 'a,b')
  // a single value stays byte-identical to before (1-item list == equality).
  assert.strictEqual(buildPageviewPipeParams('s1', '2026-07-01', '2026-07-02', { filters: [{ type: 'Source', value: 'a' }] }).filter_source, 'a')
  // D1b-3 Item A: Channel is now pipe-mapped -> filter_channel (was the reachable HogQL-forcing shape).
  assert.strictEqual(buildPageviewPipeParams('s1', '2026-07-01', '2026-07-02', { filters: [{ type: 'Channel', value: 'Organic Search' }] }).filter_channel, 'Organic Search')
  // a genuinely unknown filter type still -> null (HogQL until the fallback is removed in the follow-up).
  assert.strictEqual(buildPageviewPipeParams('s1', '2026-07-01', '2026-07-02', { filters: [{ type: 'Bogus', value: 'x' }] }), null)
})

test('(dispatch) Channel + multi-value Source served from the pipe with merged params, fetchPageviews NOT called', async (t) => {
  t.after(__resetAnalyticsReadDeps)
  const tbCalls = []
  __setAnalyticsReadDeps({
    queryTinybird: async (pipe, params) => { tbCalls.push({ pipe, params }); return [ROW({ os: 'Windows', anonymous_id: 'v1' })] },
    fetchPv: async () => { throw new Error('fetchPageviews (HogQL) called — Channel/multi-value must be pipe-served now') }
  })
  const res = mockRes()
  await osHandler(req({ days: '30', f: ['Channel:Organic Search', 'Source:google', 'Source:bing'] }), res)
  assert.strictEqual(res.body.success, true)
  assert.strictEqual(tbCalls[0].params.filter_channel, 'Organic Search', 'Channel reaches the pipe as filter_channel')
  assert.strictEqual(tbCalls[0].params.filter_source, 'google,bing', 'two Source filters merged into a comma-list')
})

// ── (a) DISPATCH — served from pipe, HogQL NOT called (load-bearing) ──────────

test('(a) /os DISPATCH: served from pipe, fetchPageviews NOT called (load-bearing: HogQL stub throws)', async (t) => {
  t.after(__resetAnalyticsReadDeps)
  const tbCalls = []
  __setAnalyticsReadDeps({
    queryTinybird: async (pipe, params) => { tbCalls.push({ pipe, params }); return [ROW({ os: 'Windows', anonymous_id: 'v1' }), ROW({ os: 'macOS', anonymous_id: 'v2' })] },
    fetchPv: async () => { throw new Error('fetchPageviews (HogQL) called — pipe was not served (zero-fallback violated)') }
  })
  const res = mockRes()
  await osHandler(req({ days: '30' }), res)
  assert.strictEqual(res.body.success, true)
  assert.strictEqual(tbCalls[0].pipe, 'os', 'pipe name == queryName')
  assert.strictEqual(tbCalls[0].params.site_id, 'site-00', 'authenticated site_id')
  assert.strictEqual(tbCalls[0].params.limit_val, 50000)
  assert.match(tbCalls[0].params.date_from_ts, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, 'ClickHouse DateTime literal')
  assert.match(tbCalls[0].params.date_to_ts, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  assert.deepStrictEqual(res.body.data.map(d => d.os).sort(), ['Windows', 'macOS'])
})

test('(a2) /browsers DISPATCH: served from pipe, fetchPageviews NOT called', async (t) => {
  t.after(__resetAnalyticsReadDeps)
  __setAnalyticsReadDeps({
    queryTinybird: async () => [ROW({ browser: 'Chrome', anonymous_id: 'v1' }), ROW({ browser: 'Safari', anonymous_id: 'v2' })],
    fetchPv: async () => { throw new Error('fetchPageviews called — pipe not served') }
  })
  const res = mockRes()
  await browsersHandler(req({ days: '30' }), res)
  assert.strictEqual(res.body.success, true)
  assert.deepStrictEqual(res.body.data.map(d => d.browser).sort(), ['Chrome', 'Safari'])
})

// ── (b) FAIL-CLOSED ───────────────────────────────────────────────────────────

test('(b) /os FAIL-CLOSED: TINYBIRD_FORCE_READ + pipe null -> 500, no silent HogQL bypass', async (t) => {
  t.after(() => { delete process.env.TINYBIRD_FORCE_READ; __resetAnalyticsReadDeps() })
  process.env.TINYBIRD_FORCE_READ = 'true'
  const hog = []
  __setAnalyticsReadDeps({ queryTinybird: async () => null, fetchPv: async () => { hog.push('hog'); return [] } })
  const res = mockRes()
  await osHandler(req({ days: '30' }), res)
  assert.strictEqual(res.statusCode, 500)
  assert.strictEqual(hog.length, 0, 'no silent HogQL fallback for the wired read under force-read')
})

// ── (c) FALLBACK ──────────────────────────────────────────────────────────────

test('(c) /browsers FALLBACK: flag off (pipe null) -> fetchPageviews (HogQL) serves', async (t) => {
  t.after(__resetAnalyticsReadDeps)
  const tb = []; const hog = []
  __setAnalyticsReadDeps({
    queryTinybird: async (pipe) => { tb.push(pipe); return null },
    fetchPv: async () => { hog.push('hog'); return [ROW({ browser: 'Chrome', anonymous_id: 'v1' })] }
  })
  const res = mockRes()
  await browsersHandler(req({ days: '30' }), res)
  assert.strictEqual(res.body.success, true)
  assert.deepStrictEqual(tb, ['browsers'], 'the wired read attempts Tinybird first')
  assert.strictEqual(hog.length, 1, 'flag off -> HogQL fallback served')
  assert.strictEqual(res.body.data[0].browser, 'Chrome')
})

// ── (parity) the os JSONExtract '' vs HogQL null divergence is INERT ──────────

test("(parity) /os: pipe os='' and HogQL os=null yield IDENTICAL output (if(!r.os) drops both)", async (t) => {
  t.after(__resetAnalyticsReadDeps)
  // Same logical rows, two wire values for a MISSING os: pipe emits '' (JSONExtractString),
  // HogQL emits null (properties.os_name). The missing-os visitor (v1) must be dropped by
  // BOTH via `if (!r.os) continue`, leaving only Windows (v2) — byte-identical response.
  const ROWS_PIPE = [ROW({ os: '', anonymous_id: 'v1' }), ROW({ os: 'Windows', anonymous_id: 'v2' })]
  const ROWS_HOG = [ROW({ os: null, anonymous_id: 'v1' }), ROW({ os: 'Windows', anonymous_id: 'v2' })]

  __setAnalyticsReadDeps({ queryTinybird: async () => ROWS_PIPE, fetchPv: async () => { throw new Error('no hog on ON leg') } })
  const resA = mockRes(); await osHandler(req({ days: '30' }), resA); __resetAnalyticsReadDeps()

  __setAnalyticsReadDeps({ queryTinybird: async () => null, fetchPv: async () => ROWS_HOG })
  const resB = mockRes(); await osHandler(req({ days: '30' }), resB); __resetAnalyticsReadDeps()

  assert.deepStrictEqual(resA.body, resB.body, "os='' (pipe) collapses identically to os=null (HogQL)")
  assert.deepStrictEqual(resA.body.data.map(d => d.os), ['Windows'], 'the empty/null-os visitor is dropped, not bucketed')
})
