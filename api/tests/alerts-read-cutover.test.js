// Alerts read-cutover — alerts.js dispatch/fallback tests. All four alarm reads now route
// through readTb (Tinybird-first, HogQL fallback, TINYBIRD_FORCE_READ fail-closed):
//   alert_traffic (pageview counts), alert_recent (event count),
//   alert_conversions (money-rail $conversion counts), alert_ai (money-rail ai_source).
//
// THE POINT OF THIS FILE: these alarms had never been proven to FIRE against the Tinybird
// path. A read that returns 200 but can only ever report "calm" is the bug we are killing.
// Each money-rail alarm is shown to (a) DISPATCH from its pipe without touching dead HogQL,
// (b) FIRE when the pipe reports a drop / low-traffic condition, and (c) stay SILENT when it
// should not. Pipes return NAMED rows; readTb remaps them to the POSITIONAL shape each
// consumer reads — parity tests prove named == positional (the field-name/identity trap).

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
const req = (over = {}) => ({ site: { id: 'site-00', plan: 'business' }, ...over })
const reset = () => { __resetAlertsReadDeps(); delete process.env.TINYBIRD_FORCE_READ }

// NAMED pipe rows for all four alarm reads, tuned so NONE fire. Tests override one pipe to
// push a single alarm into its firing band. Baseline: traffic flat (100 vs 100), conversions
// flat (10 vs 10), recent non-zero (5), AI traffic below the low band (2).
const NOFIRE = {
  alert_traffic: [{ this_week: 100, last_week: 100 }],
  alert_conversions: [{ today: 10, yesterday: 10 }],
  alert_recent: [{ cnt: 5, last_ts: '2026-07-13T09:00:00Z' }],
  alert_ai: [{ ai_source: 'ChatGPT', cnt: 2 }],
}
// Serve every pipe from Tinybird (named rows); HogQL throws if ANY read falls back.
function stubServed (overrides = {}) {
  const map = { ...NOFIRE, ...overrides }
  __setAlertsReadDeps({
    queryTinybird: async (pipe) => (pipe in map ? map[pipe] : null),
    queryHog: async () => { throw new Error('HogQL called — a pipe was not served (zero-fallback violated)') },
  })
}
// Calm HogQL fallback for every alarm (nothing fires) — used by fallback-path tests.
const hogCalm = async (_sql, name) => {
  switch (name) {
    case 'alert_traffic': return [[100, 100]]
    case 'alert_conversions': return [[10, 10]]
    case 'alert_recent': return [[5, '2026-07-13T09:00:00Z']]
    case 'alert_ai': return [['ChatGPT', 2]]
    default: return [[0]]
  }
}
const idsOf = (res) => res.body.data.alerts.map(a => a.id)
const byId = (res, id) => res.body.data.alerts.find(a => a.id === id)

// ── Baseline ────────────────────────────────────────────────────────────────
test('(baseline) all pipes served, calm data -> zero alerts, HogQL NOT called', async (t) => {
  t.after(reset)
  stubServed()
  const res = mockRes()
  await handler(req(), res)
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(idsOf(res), [], 'calm data -> no alerts')
})

// ── alert_conversions (money rail): FIRE / SILENT / FALLBACK / PARITY / FAIL-CLOSED ──
test('(conv-FIRE) conversion drop from the pipe -> conversion_drop FIRES, HogQL NOT called (load-bearing)', async (t) => {
  t.after(reset)
  stubServed({ alert_conversions: [{ today: 2, yesterday: 10 }] }) // 2 < 10*0.3(=3) -> 80% drop
  const res = mockRes()
  await handler(req(), res)
  const a = byId(res, 'conversion_drop')
  assert.ok(a, 'conversion_drop alarm present')
  assert.strictEqual(a.severity, 'high')
  assert.strictEqual(a.message, 'Conversions dropped 80% today vs yesterday')
  assert.strictEqual(a.comparison, '2 vs 10 conversions')
})

test('(conv-tenant) alert_conversions dispatched with the authenticated site_id only', async (t) => {
  t.after(reset)
  const seen = {}
  __setAlertsReadDeps({
    queryTinybird: async (pipe, params) => { seen[pipe] = params; return NOFIRE[pipe] ?? null },
    queryHog: async () => { throw new Error('HogQL called — a pipe was not served') },
  })
  const res = mockRes()
  await handler(req(), res)
  assert.deepStrictEqual(seen.alert_conversions, { site_id: 'site-00' })
})

test('(conv-SILENT) shallow dip below the trigger -> conversion_drop does NOT fire', async (t) => {
  t.after(reset)
  stubServed({ alert_conversions: [{ today: 9, yesterday: 10 }] }) // 9 < 3 is false
  const res = mockRes()
  await handler(req(), res)
  assert.ok(!idsOf(res).includes('conversion_drop'), 'no false alarm on a shallow dip')
})

test('(conv-SILENT-zero) yesterday=0 -> guarded, no divide-by-zero alarm', async (t) => {
  t.after(reset)
  stubServed({ alert_conversions: [{ today: 0, yesterday: 0 }] })
  const res = mockRes()
  await handler(req(), res)
  assert.ok(!idsOf(res).includes('conversion_drop'), 'yesterday>0 guard holds')
})

test('(conv-FALLBACK) pipe null -> HogQL positional [[today,yesterday]] -> same alarm', async (t) => {
  t.after(reset)
  __setAlertsReadDeps({
    queryTinybird: async (pipe) => (pipe === 'alert_conversions' ? null : NOFIRE[pipe] ?? null),
    queryHog: async (_sql, name) => {
      if (name === 'alert_conversions') return [[2, 10]]
      throw new Error(`unexpected HogQL fallback: ${name}`)
    },
  })
  const res = mockRes()
  await handler(req(), res)
  const a = byId(res, 'conversion_drop')
  assert.ok(a, 'alarm fires via HogQL fallback too')
  assert.strictEqual(a.comparison, '2 vs 10 conversions')
})

test('(conv-PARITY) named pipe rows == HogQL positional rows -> IDENTICAL response', async (t) => {
  t.after(reset)
  stubServed({ alert_conversions: [{ today: 2, yesterday: 10 }] })
  const resA = mockRes(); await handler(req(), resA); __resetAlertsReadDeps()
  __setAlertsReadDeps({
    queryTinybird: async (pipe) => (pipe === 'alert_conversions' ? null : NOFIRE[pipe] ?? null),
    queryHog: async (_sql, name) => { if (name === 'alert_conversions') return [[2, 10]]; throw new Error(`unexpected: ${name}`) },
  })
  const resB = mockRes(); await handler(req(), resB); __resetAlertsReadDeps()
  assert.deepStrictEqual(resA.body, resB.body, 'pipe named {today,yesterday} remaps to the exact [[today,yesterday]] the consumer reads')
})

test('(conv-FAILCLOSED) FORCE_READ + pipe null -> 500 (no silent dead-HogQL fallback)', async (t) => {
  t.after(reset)
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setAlertsReadDeps({
    queryTinybird: async (pipe) => (pipe === 'alert_conversions' ? null : NOFIRE[pipe] ?? null),
    queryHog: async () => { throw new Error('should not reach HogQL under force-read') },
  })
  const res = mockRes()
  await handler(req(), res)
  assert.strictEqual(res.statusCode, 500)
})

// ── alert_ai (money rail — the genuine port): DISPATCH / FIRE / SILENT / FALLBACK / PARITY / FAIL-CLOSED ──
test('(ai-FIRE) AI traffic in the low band from the pipe -> ai_traffic_low FIRES, HogQL NOT called (load-bearing)', async (t) => {
  t.after(reset)
  // cnt 4 + 3 = 7 -> 5 < 7 < 10 -> fires. Also proves multi-row reduce over the pipe rows.
  stubServed({ alert_ai: [{ ai_source: 'ChatGPT', cnt: 4 }, { ai_source: 'Perplexity', cnt: 3 }] })
  const res = mockRes()
  await handler(req(), res)
  const a = byId(res, 'ai_traffic_low')
  assert.ok(a, 'ai_traffic_low alarm present')
  assert.strictEqual(a.severity, 'medium')
  assert.strictEqual(a.message, 'AI source traffic at 7 events this week (below healthy threshold)')
  assert.strictEqual(a.comparison, 'Threshold: 10 events/week')
})

test('(ai-DISPATCH) alert_ai served from pipe with the authenticated site_id, HogQL NOT called', async (t) => {
  t.after(reset)
  const seen = {}
  __setAlertsReadDeps({
    queryTinybird: async (pipe, params) => { seen[pipe] = params; return NOFIRE[pipe] ?? null },
    queryHog: async () => { throw new Error('HogQL called — alert_ai not served') },
  })
  const res = mockRes()
  await handler(req(), res)
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(seen.alert_ai, { site_id: 'site-00' }, 'alert_ai dispatched, tenant-scoped')
})

test('(ai-SILENT-below) AI traffic under the band -> ai_traffic_low does NOT fire', async (t) => {
  t.after(reset)
  stubServed({ alert_ai: [{ ai_source: 'ChatGPT', cnt: 3 }] }) // 3>5 false
  const res = mockRes()
  await handler(req(), res)
  assert.ok(!idsOf(res).includes('ai_traffic_low'), 'no alarm below the band')
})

test('(ai-SILENT-above) AI traffic above the band -> ai_traffic_low does NOT fire', async (t) => {
  t.after(reset)
  stubServed({ alert_ai: [{ ai_source: 'ChatGPT', cnt: 20 }] }) // 20<10 false
  const res = mockRes()
  await handler(req(), res)
  assert.ok(!idsOf(res).includes('ai_traffic_low'), 'no alarm above the band')
})

test('(ai-FALLBACK) pipe null -> HogQL positional [ai_source,cnt] rows -> same total/alarm', async (t) => {
  t.after(reset)
  __setAlertsReadDeps({
    queryTinybird: async (pipe) => (pipe === 'alert_ai' ? null : NOFIRE[pipe] ?? null),
    queryHog: async (_sql, name) => {
      if (name === 'alert_ai') return [['ChatGPT', 4], ['Perplexity', 3]]
      throw new Error(`unexpected HogQL fallback: ${name}`)
    },
  })
  const res = mockRes()
  await handler(req(), res)
  assert.ok(byId(res, 'ai_traffic_low'), 'alarm fires via HogQL fallback too (aiTotal=7)')
})

test('(ai-PARITY) named {ai_source,cnt} == HogQL positional [ai_source,cnt] -> IDENTICAL response', async (t) => {
  t.after(reset)
  stubServed({ alert_ai: [{ ai_source: 'ChatGPT', cnt: 4 }, { ai_source: 'Perplexity', cnt: 3 }] })
  const resA = mockRes(); await handler(req(), resA); __resetAlertsReadDeps()
  __setAlertsReadDeps({
    queryTinybird: async (pipe) => (pipe === 'alert_ai' ? null : NOFIRE[pipe] ?? null),
    queryHog: async (_sql, name) => { if (name === 'alert_ai') return [['ChatGPT', 4], ['Perplexity', 3]]; throw new Error(`unexpected: ${name}`) },
  })
  const resB = mockRes(); await handler(req(), resB); __resetAlertsReadDeps()
  assert.deepStrictEqual(resA.body, resB.body, 'pipe rows remap to the exact positional [ai_source,cnt] the consumer reduces over')
})

test('(ai-FAILCLOSED) FORCE_READ + pipe null -> 500', async (t) => {
  t.after(reset)
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setAlertsReadDeps({
    queryTinybird: async (pipe) => (pipe === 'alert_ai' ? null : NOFIRE[pipe] ?? null),
    queryHog: async () => { throw new Error('should not reach HogQL under force-read') },
  })
  const res = mockRes()
  await handler(req(), res)
  assert.strictEqual(res.statusCode, 500)
})

// ── Preserved from the original file: whole-route fallback, dispatch matrix, graceful 500 ──
test('(fallback-all) flag off -> all four reads attempt Tinybird then fall back to HogQL', async (t) => {
  t.after(reset)
  const tb = []; const hog = []
  __setAlertsReadDeps({
    queryTinybird: async (pipe) => { tb.push(pipe); return null },
    queryHog: async (sql, name) => { hog.push(name); return hogCalm(sql, name) },
  })
  const res = mockRes()
  await handler(req(), res)
  assert.strictEqual(res.body.success, true)
  assert.deepStrictEqual(tb.sort(), ['alert_ai', 'alert_conversions', 'alert_recent', 'alert_traffic'], 'all four wired reads attempt Tinybird')
  assert.deepStrictEqual(hog.sort(), ['alert_ai', 'alert_conversions', 'alert_recent', 'alert_traffic'], 'all four fall back to HogQL when the pipe returns null')
  assert.deepStrictEqual(idsOf(res), [], 'calm HogQL data -> no alerts')
})

test('(dispatch-matrix) flag on -> traffic_drop + install_silent fire from Tinybird pipes', async (t) => {
  t.after(reset)
  const hog = []
  __setAlertsReadDeps({
    queryTinybird: async (pipe) => {
      if (pipe === 'alert_traffic') return [{ this_week: 40, last_week: 200 }] // 40 < 100 -> traffic_drop
      if (pipe === 'alert_recent') return [{ cnt: 0, last_ts: null }]          // 0 -> install_silent
      return null // conversions + ai fall back
    },
    queryHog: async (sql, name) => { hog.push(name); return hogCalm(sql, name) },
  })
  const res = mockRes()
  await handler(req(), res)
  const ids = idsOf(res)
  assert.ok(ids.includes('traffic_drop'), 'traffic_drop from Tinybird alert_traffic (40 vs 200)')
  assert.ok(ids.includes('install_silent'), 'install_silent from Tinybird alert_recent (0)')
  assert.deepStrictEqual(hog.sort(), ['alert_ai', 'alert_conversions'], 'only the unserved reads fell back to HogQL')
})

test('(missing-site) no req.site -> 500 (graceful)', async (t) => {
  t.after(reset)
  const res = mockRes()
  await handler({}, res)
  assert.strictEqual(res.statusCode, 500)
})
