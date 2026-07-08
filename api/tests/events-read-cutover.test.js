// Wave-3 read-cutover — events.js dispatch/fallback tests.
// Wired: events_health_last/hour/day, edge_domains (pure counts/URLs).
// Held (money-rail): events_latest (conversion_value/ai_source/first_touch),
// edge_ai_no_utm, edge_utm_no_ai (read ai_source).

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

test('events /edge-cases — DISPATCH: edge_domains wired to Tinybird, ai reads held on HogQL', async () => {
  const tb = []; const hog = []
  __setEventsReadDeps({
    queryTinybird: tbStub(tb, { edge_domains: [{ page_url: 'https://a.com/x', cnt: 3 }, { page_url: 'https://b.com/y', cnt: 1 }] }),
    queryHog: hogStub(hog)
  })
  try {
    const res = mockRes()
    await edgeHandler(reqSite(), res)
    assert.strictEqual(res.body.data.domain_count, 2, 'edge_domains value from Tinybird')
    assert.deepStrictEqual(tb.map(c => c.pipe), ['edge_domains'], 'only edge_domains attempts Tinybird')
    // Money-rail ai reads stayed on HogQL.
    assert.deepStrictEqual(hog.sort(), ['edge_ai_no_utm', 'edge_utm_no_ai'])
  } finally { __resetEventsReadDeps() }
})

test('events /health — missing site -> 500 (graceful)', async () => {
  const res = mockRes()
  await healthHandler({ query: {} }, res)
  assert.strictEqual(res.statusCode, 500)
})
