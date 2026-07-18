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
const sourcesHandler = handlerFor('/sources')

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

// ── (b) D1b-3b: pipe null -> 500 (HogQL fallback DELETED, unconditional) ───────

test('(b) /os: pipe null -> 500 (HogQL fallback DELETED), no dead-store read', async (t) => {
  t.after(__resetAnalyticsReadDeps)
  __setAnalyticsReadDeps({ queryTinybird: async () => null })
  const res = mockRes()
  await osHandler(req({ days: '30' }), res)
  assert.strictEqual(res.statusCode, 500, 'a null pipe 500s loud (FIX THE PIPE), never a silent HogQL fall-through')
})

test('(c) /browsers: pipe null -> 500 (no HogQL fallback), the wired read attempted Tinybird', async (t) => {
  t.after(__resetAnalyticsReadDeps)
  const tb = []
  __setAnalyticsReadDeps({ queryTinybird: async (pipe) => { tb.push(pipe); return null } })
  const res = mockRes()
  await browsersHandler(req({ days: '30' }), res)
  assert.strictEqual(res.statusCode, 500, 'null pipe -> 500, no dead-store HogQL read')
  assert.deepStrictEqual(tb, ['browsers'], 'the wired read attempted Tinybird')
})

// ── (item-c) unrepresentable request -> 400 (client error), not HogQL, not a pipe call ──
test('(item-c) /os unsupported filter type -> 400, no pipe call, no HogQL', async (t) => {
  t.after(__resetAnalyticsReadDeps)
  const tb = []
  __setAnalyticsReadDeps({ queryTinybird: async (p) => { tb.push(p); return [] } })
  const res = mockRes()
  await osHandler(req({ days: '30', f: ['Bogus:x'] }), res)
  assert.strictEqual(res.statusCode, 400, 'an unrepresentable request is a 400 client error, not a dead-store read')
  assert.strictEqual(tb.length, 0, 'no pipe call for an unrepresentable request')
})

// ── (parity) the os JSONExtract '' rows are dropped, not bucketed ─────────────

test("(parity) /os: pipe os='' is dropped by if(!r.os), not bucketed", async (t) => {
  t.after(__resetAnalyticsReadDeps)
  const ROWS_PIPE = [ROW({ os: '', anonymous_id: 'v1' }), ROW({ os: 'Windows', anonymous_id: 'v2' })]
  __setAnalyticsReadDeps({ queryTinybird: async () => ROWS_PIPE })
  const res = mockRes(); await osHandler(req({ days: '30' }), res)
  assert.deepStrictEqual(res.body.data.map(d => d.os), ['Windows'], 'the empty-os visitor is dropped, not bucketed')
})

test('/sources tab=channel & tab=campaign fetch from pageviews and reconcile', async (t) => {
  t.after(__resetAnalyticsReadDeps)

  // Mock pageview rows returned by Tinybird (now containing channel column)
  const ROWS = [
    ROW({ anonymous_id: 'v1', channel: 'Paid Social', utm_campaign: 'black_friday', utm_source: 'facebook', referrer: 'https://l.facebook.com/' }),
    ROW({ anonymous_id: 'v2', channel: 'Paid Social', utm_campaign: 'black_friday', utm_source: 'facebook', referrer: 'https://l.facebook.com/' }),
    ROW({ anonymous_id: 'v3', channel: 'Organic Search', utm_campaign: 'untagged', utm_source: 'google', referrer: 'https://google.com/' })
  ]

  // Mock global fetch for Supabase select from attributed_conversions
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    if (url.includes('/rest/v1/attributed_conversions')) {
      return {
        status: 200,
        ok: true,
        text: async () => JSON.stringify([
          {
            first_touch_channel: 'Paid Social',
            first_touch_campaign: 'black_friday',
            conversion_value: 100,
            conversion_timestamp: '2026-07-10T10:05:00Z',
            conversion_date: '2026-07-10'
          }
        ]),
        headers: new Headers({ 'content-type': 'application/json' })
      }
    }
    return originalFetch(url, options)
  }

  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const queryTinybirdCalls = []
  __setAnalyticsReadDeps({
    queryTinybird: async (pipe, params) => {
      queryTinybirdCalls.push(pipe)
      return ROWS
    }
  })

  // Test Channel tab
  {
    const res = mockRes()
    await sourcesHandler({ site: { id: 'site-00', timezone: 'UTC' }, query: { days: '30', tab: 'channel' } }, res)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.body.success, true)
    const rows = res.body.data.rows

    // Paid Social should have 2 visitors (v1, v2) and $100 revenue
    const paidSocial = rows.find(r => r.name === 'Paid Social')
    assert.ok(paidSocial)
    assert.strictEqual(paidSocial.visitors, 2)
    assert.strictEqual(paidSocial.revenue, 100)

    // Organic Search should have 1 visitor (v3) and $0 revenue
    const organicSearch = rows.find(r => r.name === 'Organic Search')
    assert.ok(organicSearch)
    assert.strictEqual(organicSearch.visitors, 1)
    assert.strictEqual(organicSearch.revenue, 0)

    const totalChannelVisitors = rows.reduce((acc, r) => acc + r.visitors, 0)
    assert.strictEqual(totalChannelVisitors, 3, 'Total channel visitors should equal 3')
  }

  // Test Campaign tab
  {
    const res = mockRes()
    await sourcesHandler({ site: { id: 'site-00', timezone: 'UTC' }, query: { days: '30', tab: 'campaign' } }, res)
    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(res.body.success, true)
    const rows = res.body.data.rows

    // black_friday should have 2 visitors (v1, v2) and $100 revenue
    const blackFriday = rows.find(r => r.name === 'black_friday')
    assert.ok(blackFriday)
    assert.strictEqual(blackFriday.visitors, 2)
    assert.strictEqual(blackFriday.revenue, 100)

    // untagged should have 1 visitor (v3) and $0 revenue
    const untagged = rows.find(r => r.name === 'untagged')
    assert.ok(untagged)
    assert.strictEqual(untagged.visitors, 1)
    assert.strictEqual(untagged.revenue, 0)

    const totalCampaignVisitors = rows.reduce((acc, r) => acc + r.visitors, 0)
    assert.strictEqual(totalCampaignVisitors, 3, 'Total campaign visitors should equal 3')
  }

  assert.deepStrictEqual(queryTinybirdCalls, ['sources_ref', 'sources_ref'], 'Both tab checks fetched from sources_ref pageview pipe')
})
