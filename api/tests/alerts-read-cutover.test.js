// Wave-3 read-cutover — alerts.js dispatch/fallback tests.
// Wired: alert_traffic (pageview counts), alert_recent (event count),
// alert_conversions (money-rail $conversion). Held: alert_ai (ai_source).

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/alerts.js')
const { alertsRouter, __setAlertsReadDeps, __resetAlertsReadDeps } = mod
const layer = alertsRouter.stack.find(l => l.route && l.route.path === '/')
const handler = layer.route.stack[layer.route.stack.length - 1].handle // async handler (after middleware)

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const reqSite = () => ({ site: { id: 'site-00', plan: 'business' } })

function hogStub (calls) {
  return async (_sql, name) => {
    calls.push(name)
    switch (name) {
      case 'alert_traffic': return [[50, 60]]
      case 'alert_recent': return [[7, '2026-07-08T00:00:00Z']]
      case 'alert_conversions': return [[3, 4]]
      case 'alert_ai': return [['ChatGPT', 6]]
      default: return [[0]]
    }
  }
}
function tbStub (calls, rowsByPipe) {
  return async (pipe, params) => { calls.push({ pipe, params }); return rowsByPipe === null ? null : (rowsByPipe[pipe] ?? null) }
}

test('alerts — FALLBACK: flag off -> HogQL for wired + held reads', async () => {
  const tb = []; const hog = []
  __setAlertsReadDeps({ queryTinybird: tbStub(tb, null), queryHog: hogStub(hog) })
  try {
    const res = mockRes()
    await handler(reqSite(), res)
    assert.strictEqual(res.body.success, true)
    assert.deepStrictEqual(hog.sort(), ['alert_ai', 'alert_conversions', 'alert_recent', 'alert_traffic'])
    assert.deepStrictEqual(tb.map(c => c.pipe).sort(), ['alert_conversions', 'alert_recent', 'alert_traffic'], 'wired reads attempt Tinybird')
  } finally { __resetAlertsReadDeps() }
})

test('alerts — DISPATCH conversions: alert_conversions served from Tinybird triggers conversion_drop', async () => {
  const tb = []; const hog = []
  __setAlertsReadDeps({
    queryTinybird: tbStub(tb, { alert_conversions: [{ today: 1, yesterday: 10 }] }), // 1 < 10*0.3 -> conversion_drop
    queryHog: hogStub(hog)
  })
  try {
    const res = mockRes()
    await handler(reqSite(), res)
    const ids = res.body.data.alerts.map(a => a.id)
    assert.ok(ids.includes('conversion_drop'), 'conversion_drop from Tinybird alert_conversions (1 vs 10)')
    assert.ok(!hog.includes('alert_conversions'), 'alert_conversions bypassed HogQL (served from Tinybird)')
    const cc = tb.find(c => c.pipe === 'alert_conversions')
    assert.deepStrictEqual(cc.params, { site_id: 'site-00' }, 'alert_conversions scoped to authenticated site_id')
  } finally { __resetAlertsReadDeps() }
})

test('alerts — DISPATCH: flag on -> Tinybird for wired reads, HogQL only for money-rail reads', async () => {
  const tb = []; const hog = []
  __setAlertsReadDeps({
    queryTinybird: tbStub(tb, {
      alert_traffic: [{ this_week: 40, last_week: 200 }], // triggers traffic_drop
      alert_recent: [{ cnt: 0, last_ts: null }] // triggers install_silent
    }),
    queryHog: hogStub(hog)
  })
  try {
    const res = mockRes()
    await handler(reqSite(), res)
    const ids = res.body.data.alerts.map(a => a.id)
    assert.ok(ids.includes('traffic_drop'), 'traffic_drop from Tinybird alert_traffic (40 vs 200)')
    assert.ok(ids.includes('install_silent'), 'install_silent from Tinybird alert_recent (0)')
    assert.deepStrictEqual(hog.sort(), ['alert_ai', 'alert_conversions'], 'only money-rail reads used HogQL')
    assert.ok(tb.every(c => c.params.site_id === 'site-00'), 'wired pipes scoped to authenticated site_id')
  } finally { __resetAlertsReadDeps() }
})

test('alerts — FAIL-CLOSED: TINYBIRD_FORCE_READ + null -> 500, no silent HogQL bypass', async () => {
  const tb = []; const hog = []
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setAlertsReadDeps({ queryTinybird: tbStub(tb, null), queryHog: hogStub(hog) })
  try {
    const res = mockRes()
    await handler(reqSite(), res)
    assert.strictEqual(res.statusCode, 500)
    assert.ok(!hog.includes('alert_traffic'), 'no silent HogQL fallback for the wired read')
  } finally {
    delete process.env.TINYBIRD_FORCE_READ
    __resetAlertsReadDeps()
  }
})

test('alerts — missing site -> 500 (graceful)', async () => {
  const res = mockRes()
  await handler({}, res)
  assert.strictEqual(res.statusCode, 500)
})
