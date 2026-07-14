// Read-cutover — events.js dispatch/fallback tests. ALL money-rail reads now wired via
// readTb (Tinybird-first, HogQL fallback, TINYBIRD_FORCE_READ fail-closed):
//   events_health_last/hour/day, edge_domains, edge_ai_no_utm, edge_utm_no_ai, and the
//   50-column events_latest raw event log (conversion_value/conversion_type/ai_source/
//   first_touch). Pipes return NAMED rows; readTb remaps them to the POSITIONAL shape each
//   consumer destructures — the events_latest parity test proves the 50-col named->positional
//   remap is order-correct against the HogQL SELECT order (the field-name/identity trap).

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/events.js')
const { eventsRouter, __setEventsReadDeps, __resetEventsReadDeps } = mod
const handlerFor = (path) => {
  const layer = eventsRouter.stack.find(l => l.route && l.route.path === path)
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const healthHandler = handlerFor('/health')
const edgeHandler = handlerFor('/edge-cases')
const latestHandler = handlerFor('/latest')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
// Unique site id per test avoids the module-level NodeCache health cache.
let n = 0
const reqSite = () => ({ site: { id: `site-${n++}` }, query: {} })

function hogStub (calls) {
  return async (_sql, name) => {
    calls.push(name)
    switch (name) {
      case 'events_health_last': return [['2026-07-01T00:00:00Z']]
      case 'events_health_hour': return [[9]]
      case 'events_health_day': return [[99]]
      case 'edge_domains': return [['https://a.com/x', 3]]
      case 'edge_ai_no_utm': return [[2]]
      case 'edge_utm_no_ai': return [[4]]
      default: return [[0]]
    }
  }
}
function tbStub (calls, rowsByPipe) {
  return async (pipe, params) => { calls.push({ pipe, params }); return rowsByPipe === null ? null : (rowsByPipe[pipe] ?? null) }
}

test('events /health — FALLBACK: flag off -> HogQL for all 3 health reads', async () => {
  const tb = []; const hog = []
  __setEventsReadDeps({ queryTinybird: tbStub(tb, null), queryHog: hogStub(hog) })
  try {
    const res = mockRes()
    await healthHandler(reqSite(), res)
    assert.strictEqual(res.body.data.count_hour, 9)
    assert.deepStrictEqual(hog.sort(), ['events_health_day', 'events_health_hour', 'events_health_last'])
    assert.strictEqual(tb.length, 3, 'all 3 health reads attempted Tinybird first')
  } finally { __resetEventsReadDeps() }
})

test('events /health — DISPATCH: flag on -> Tinybird values, HogQL not called', async () => {
  const tb = []; const hog = []
  __setEventsReadDeps({
    queryTinybird: tbStub(tb, {
      events_health_last: [{ timestamp: '2026-07-08T00:00:00Z' }],
      events_health_hour: [{ cnt: 42 }],
      events_health_day: [{ cnt: 100 }]
    }),
    queryHog: hogStub(hog)
  })
  try {
    const res = mockRes()
    await healthHandler(reqSite(), res)
    assert.strictEqual(res.body.data.count_hour, 42, 'Tinybird value surfaces')
    assert.strictEqual(res.body.data.count_day, 100)
    assert.strictEqual(hog.length, 0, 'HogQL not called — Tinybird path exercised')
    assert.ok(tb.every(c => String(c.params.site_id).startsWith('site-')), 'pipes scoped to authenticated site_id')
  } finally { __resetEventsReadDeps() }
})

test('events /health — FAIL-CLOSED: TINYBIRD_FORCE_READ + null -> 500', async () => {
  const tb = []; const hog = []
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setEventsReadDeps({ queryTinybird: tbStub(tb, null), queryHog: hogStub(hog) })
  try {
    const res = mockRes()
    await healthHandler(reqSite(), res)
    assert.strictEqual(res.statusCode, 500)
    assert.strictEqual(hog.length, 0, 'no silent HogQL bypass')
  } finally {
    delete process.env.TINYBIRD_FORCE_READ
    __resetEventsReadDeps()
  }
})

test('events /edge-cases — DISPATCH: all three edge reads served from Tinybird, HogQL NOT called', async () => {
  const tb = []; const hog = []
  __setEventsReadDeps({
    queryTinybird: tbStub(tb, {
      edge_domains: [{ page_url: 'https://a.com/x', cnt: 3 }, { page_url: 'https://b.com/y', cnt: 1 }],
      edge_ai_no_utm: [{ cnt: 7 }],
      edge_utm_no_ai: [{ cnt: 12 }]
    }),
    queryHog: hogStub(hog)
  })
  try {
    const res = mockRes()
    await edgeHandler(reqSite(), res)
    assert.strictEqual(res.body.data.domain_count, 2, 'edge_domains value from Tinybird')
    assert.strictEqual(res.body.data.ai_without_utm, 7, 'edge_ai_no_utm count from Tinybird')
    assert.strictEqual(res.body.data.utm_without_ai, 12, 'edge_utm_no_ai count from Tinybird')
    assert.deepStrictEqual(tb.map(c => c.pipe).sort(), ['edge_ai_no_utm', 'edge_domains', 'edge_utm_no_ai'], 'all three attempt Tinybird')
    assert.strictEqual(hog.length, 0, 'no read fell back to HogQL')
    assert.ok(tb.every(c => String(c.params.site_id).startsWith('site-')), 'all three tenant-scoped to authenticated site_id')
  } finally { __resetEventsReadDeps() }
})

test('events /edge-cases — FALLBACK: pipes null -> HogQL positional counts -> same values', async () => {
  const tb = []; const hog = []
  __setEventsReadDeps({ queryTinybird: tbStub(tb, null), queryHog: hogStub(hog) })
  try {
    const res = mockRes()
    await edgeHandler(reqSite(), res)
    assert.strictEqual(res.body.data.ai_without_utm, 2, 'edge_ai_no_utm via HogQL fallback (hogStub=2)')
    assert.strictEqual(res.body.data.utm_without_ai, 4, 'edge_utm_no_ai via HogQL fallback (hogStub=4)')
    assert.deepStrictEqual(hog.sort(), ['edge_ai_no_utm', 'edge_domains', 'edge_utm_no_ai'], 'all three fell back')
  } finally { __resetEventsReadDeps() }
})

// ── events_latest (50-col money-rail raw event log) ─────────────────────────
// The HogQL SELECT column order (events.js) — the ground truth the positional consumer
// destructures. Defined here INDEPENDENTLY so an order bug in the route's mapRows is caught.
const LATEST_COLS = [
  'event_type', 'timestamp', 'distinct_id', 'page_url', 'referrer', 'ai_source', 'is_conversion',
  'device_type', 'country', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', 'msclkid', 'ttclid', 'ref_param', 'source_param', 'via_param',
  'first_touch_source', 'first_touch_medium', 'first_touch_campaign', 'conversion_type',
  'conversion_value', 'ingestion_method', 'browser_name', 'browser_version', 'os_name', 'os_version',
  'gbraid', 'wbraid', 'li_fat_id', 'li_fatid', 'twclid', 'dclid', 'snapclid', 'pclid', 'sccid',
  'ko_click_id', 'utm_id', 'st_campaign_id', 'st_adgroup_id', 'st_ad_id', 'st_target_id',
  'st_network', 'st_device', 'st_matchtype', 'raw_properties'
]
// A $120 conversion with a distinctive value per column so a mis-ordered remap is detectable.
const NAMED_CONV = {
  event_type: '$conversion', timestamp: '2026-07-10T10:00:00Z', distinct_id: 'd1', page_url: 'https://x/p',
  referrer: 'https://google.com', ai_source: 'ChatGPT', is_conversion: 'true', device_type: 'desktop',
  country: 'US', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'camp', utm_content: 'content',
  utm_term: 'term', gclid: 'g1', fbclid: 'f1', msclkid: 'm1', ttclid: 't1', ref_param: 'rp', source_param: 'sp',
  via_param: 'vp', first_touch_source: 'fts', first_touch_medium: 'ftm', first_touch_campaign: 'ftc',
  conversion_type: 'closed_won', conversion_value: 120, ingestion_method: 'offline', browser_name: 'Chrome',
  browser_version: '120', os_name: 'macOS', os_version: '14', gbraid: 'gb', wbraid: 'wb', li_fat_id: 'li',
  li_fatid: 'li2', twclid: 'tw', dclid: 'dc', snapclid: 'sn', pclid: 'pc', sccid: 'sc', ko_click_id: 'ko',
  utm_id: 'uid', st_campaign_id: 'sc1', st_adgroup_id: 'sa1', st_ad_id: 'sad1', st_target_id: 'st1',
  st_network: 'sn1', st_device: 'sd1', st_matchtype: 'sm1', raw_properties: { k: 'v' }
}
const toPos = (named) => LATEST_COLS.map(k => named[k])

test('events /latest — PARITY: named 50-col pipe row == HogQL positional row -> IDENTICAL events, money fields intact', async () => {
  __setEventsReadDeps({ queryTinybird: async () => [NAMED_CONV], queryHog: async () => { throw new Error('HogQL called — pipe not served') } })
  const resA = mockRes(); await latestHandler(reqSite(), resA); __resetEventsReadDeps()
  __setEventsReadDeps({ queryTinybird: async () => null, queryHog: async () => [toPos(NAMED_CONV)] })
  const resB = mockRes(); await latestHandler(reqSite(), resB); __resetEventsReadDeps()
  assert.deepStrictEqual(resA.body, resB.body, 'the 50-col named->positional remap matches the HogQL SELECT order exactly')
  const ev = resA.body.data.events[0]
  assert.strictEqual(ev.conversion_value, 120, 'money field survives the remap')
  assert.strictEqual(ev.conversion_type, 'closed_won')
  assert.strictEqual(ev.ai_source, 'ChatGPT')
  assert.strictEqual(ev.is_conversion, true)
})

test('events /latest — DISPATCH: served from pipe, HogQL NOT called, tenant-scoped', async () => {
  const tb = []
  __setEventsReadDeps({ queryTinybird: async (p, params) => { tb.push({ p, params }); return [NAMED_CONV] }, queryHog: async () => { throw new Error('HogQL called') } })
  try {
    const res = mockRes()
    await latestHandler(reqSite(), res)
    assert.strictEqual(res.body.data.count, 1)
    assert.strictEqual(tb[0].p, 'events_latest')
    assert.ok(String(tb[0].params.site_id).startsWith('site-'), 'scoped to authenticated site_id')
    assert.strictEqual(tb[0].params.limit_val, 100, 'default limit clamp applied')
  } finally { __resetEventsReadDeps() }
})

test('events /latest — PARAMS: optional filters map to the pipe\'s defined() params', async () => {
  const tb = []
  __setEventsReadDeps({ queryTinybird: async (p, params) => { tb.push(params); return [] }, queryHog: async () => { throw new Error('no hog') } })
  try {
    const res = mockRes()
    await latestHandler({ site: { id: 'site-x' }, query: { event_type: '$conversion', source: 'Google', search: 'Foo', limit: '5000', date_from: '2026-07-01', date_to: '2026-07-31' } }, res)
    const p = tb[0]
    assert.strictEqual(p.event_type_filter, '$conversion')
    assert.strictEqual(p.source_filter, 'google', 'source lowercased/trimmed to match the pipe\'s lower() compare')
    assert.strictEqual(p.search_filter, 'foo', 'search lowercased/trimmed')
    assert.strictEqual(p.limit_val, 500, 'limit clamped to [1,500]')
    assert.strictEqual(p.date_from_ts, '2026-07-01 00:00:00', 'inclusive start as ClickHouse datetime')
    assert.strictEqual(p.date_to_ts, '2026-08-01 00:00:00', 'exclusive end (+1 day) as ClickHouse datetime')
  } finally { __resetEventsReadDeps() }
})

test('events /latest — $0 conversion: Float64 DEFAULT 0 -> conversion_value null (§6, no fake $0)', async () => {
  // The pipe cannot distinguish a genuine $0 conversion from an absent value; both arrive 0.
  __setEventsReadDeps({ queryTinybird: async () => [{ ...NAMED_CONV, conversion_value: 0 }], queryHog: async () => { throw new Error('no hog') } })
  try {
    const res = mockRes()
    await latestHandler(reqSite(), res)
    assert.strictEqual(res.body.data.events[0].conversion_value, null, 'pipe $0 -> null (documented money-rail characteristic)')
  } finally { __resetEventsReadDeps() }
})

test('events /latest — FAIL-CLOSED: FORCE_READ + pipe null -> 500', async () => {
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setEventsReadDeps({ queryTinybird: async () => null, queryHog: async () => { throw new Error('should not reach') } })
  try {
    const res = mockRes()
    await latestHandler(reqSite(), res)
    assert.strictEqual(res.statusCode, 500)
  } finally { delete process.env.TINYBIRD_FORCE_READ; __resetEventsReadDeps() }
})

test('events /health — missing site -> 500 (graceful)', async () => {
  const res = mockRes()
  await healthHandler({ query: {} }, res)
  assert.strictEqual(res.statusCode, 500)
})
