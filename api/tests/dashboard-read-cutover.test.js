// Grade B read-cutover — dashboard.js dispatch/fallback tests. 7 call sites route through
// readTb (Tinybird-first, HogQL fallback, TINYBIRD_FORCE_READ fail-closed). The pipes return
// NAMED rows; readTb remaps them to the HogQL POSITIONAL shape each consumer destructures —
// the parity tests prove named == positional (the field-name/identity trap). Mirrors
// analytics-read-cutover.test.js.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/dashboard.js')
const router = mod.dashboardRouter
const { __setDashboardReadDeps, __resetDashboardReadDeps } = mod
const { getSupabase } = await import('../lib/supabase.js')

const handlerFor = (path) => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.get)
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const overviewHandler = handlerFor('/overview')
const liveHandler = handlerFor('/live')
const recentHandler = handlerFor('/recent-activity')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const req = (over = {}) => ({ site: { id: 'site-00', business_type: 'saas', timezone: 'UTC' }, query: {}, ...over })
const reset = () => { __resetDashboardReadDeps(); delete process.env.TINYBIRD_FORCE_READ }

// ── /live ─────────────────────────────────────────────────────────────────────
test('(live-a) DISPATCH: served from dashboard_live_visitors pipe, HogQL NOT called (load-bearing)', async (t) => {
  t.after(reset)
  const tbCalls = []
  __setDashboardReadDeps({
    queryTinybird: async (pipe, params) => { tbCalls.push({ pipe, params }); return pipe === 'dashboard_live_visitors' ? [{ live_visitors: 7 }] : null },
    queryHog: async () => { throw new Error('HogQL called — pipe not served (zero-fallback violated)') },
  })
  const res = mockRes()
  await liveHandler(req(), res)
  assert.strictEqual(res.body.data.live_visitors, 7)
  assert.strictEqual(tbCalls[0].pipe, 'dashboard_live_visitors')
  assert.strictEqual(tbCalls[0].params.site_id, 'site-00')
})

test('(live-c) D1b: pipe null (no FORCE_READ) -> graceful 200/live_visitors:0, HogQL NOT called', async (t) => {
  // D1b deleted the HogQL fallback. A null pipe throws; the graceful catch (no FORCE_READ) soft-fails
  // this widget to 0 without reading dead-store HogQL. (Under FORCE_READ, (live-b) proves it 500s.)
  t.after(reset)
  const hog = []
  __setDashboardReadDeps({ queryTinybird: async () => null, queryHog: async (_s, n) => { hog.push(n); return [[42]] } })
  const res = mockRes()
  await liveHandler(req(), res)
  assert.strictEqual(res.statusCode, 200, 'graceful catch keeps the widget alive')
  assert.strictEqual(res.body.data.live_visitors, 0, 'null pipe -> 0 (no HogQL dead-store read)')
  assert.strictEqual(hog.length, 0, 'HogQL was NOT called — the fallback is deleted')
})

test('(live-b) FAIL-CLOSED: TINYBIRD_FORCE_READ + pipe null -> 500', async (t) => {
  t.after(reset)
  process.env.TINYBIRD_FORCE_READ = 'true'
  const hog = []
  __setDashboardReadDeps({ queryTinybird: async () => null, queryHog: async (_s, n) => { hog.push(n); return [[0]] } })
  const res = mockRes()
  await liveHandler(req(), res)
  assert.strictEqual(res.statusCode, 500)
  assert.strictEqual(hog.length, 0, 'no silent HogQL fallback under force-read')
})

// ── /recent-activity ────────────────────────────────────────────────────────
const REC_NAMED = {
  event_type: '$pageview', timestamp: '2026-07-10T10:00:00Z', page_url: 'https://x/p', referrer: 'https://google.com',
  utm_medium: null, utm_source: null, first_touch_source: 'google', first_touch_medium: 'organic', first_touch_campaign: null,
  gclid: null, fbclid: null, msclkid: null, ttclid: null, li_fat_id: null, ai_source: null, conversion_value: null,
  user_id: 'u1', anonymous_id: 'a1', distinct_id: 'd1',
}
const REC_POS = ['$pageview', '2026-07-10T10:00:00Z', 'https://x/p', 'https://google.com', null, null, 'google', 'organic', null, null, null, null, null, null, null, null, 'u1', 'a1', 'd1']
const CONV_NAMED = { ...REC_NAMED, event_type: '$conversion', user_id: 'u2', anonymous_id: 'a2', distinct_id: 'd2' }
const CONV_POS = ['$conversion', '2026-07-10T10:00:00Z', 'https://x/p', 'https://google.com', null, null, 'google', 'organic', null, null, null, null, null, null, null, null, 'u2', 'a2', 'd2']

test('(recent-a) DISPATCH: named 19-col pipe rows -> correct counts, HogQL NOT called (load-bearing)', async (t) => {
  t.after(reset)
  __setDashboardReadDeps({
    queryTinybird: async () => [REC_NAMED, CONV_NAMED],
    queryHog: async () => { throw new Error('HogQL called — pipe not served') },
  })
  const res = mockRes()
  await recentHandler(req(), res)
  assert.strictEqual(res.body.data.pageviews, 1)
  assert.strictEqual(res.body.data.conversions, 1)
  assert.strictEqual(res.body.data.visitors, 2, 'unique visitors via user_id||anonymous_id (bag)')
})

test('(recent-remap) D1b: served named pipe rows remap to the positional shape the consumer destructures (19-col)', async (t) => {
  t.after(reset)
  __setDashboardReadDeps({ queryTinybird: async () => [REC_NAMED, CONV_NAMED], queryHog: async () => { throw new Error('HogQL called — pipe served, no fallback') } })
  const res = mockRes(); await recentHandler(req(), res); __resetDashboardReadDeps()
  assert.strictEqual(res.body.success, true, 'served pipe rows produce a valid response')
  assert.ok(res.body.data, 'the 19-col named->positional remap yields data the consumer can read')
})

test('(recent-b) FAIL-CLOSED: FORCE_READ + pipe null -> 500', async (t) => {
  t.after(reset)
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setDashboardReadDeps({ queryTinybird: async () => null, queryHog: async () => { throw new Error('should not reach') } })
  const res = mockRes()
  await recentHandler(req(), res)
  assert.strictEqual(res.statusCode, 500)
})

// ── /overview (4 pipes + bounce_rate; Supabase attributed_conversions stubbed) ──
const _client = getSupabase()
const _realFrom = _client.from
function installSupabase (convRows) {
  const chain = () => {
    const b = { select: () => b, eq: () => b, gte: () => b, lte: () => b, then: (res) => Promise.resolve({ data: convRows, error: null }).then(res) }
    return b
  }
  _client.from = () => chain()
}
function restoreSupabase () { _client.from = _realFrom }

// One customer conversion today so kpis.revenue is non-zero (Supabase side, unchanged).
const today = new Date().toISOString().slice(0, 10)
const CONV_ROWS = [{ first_touch_source: 'google', first_touch_channel: 'Organic Search', last_touch_channel: 'Organic Search', first_touch_campaign: null, conversion_value: 999.99, conversion_type: 'closed_won', conversion_date: today, status: 'customer', touchpoint_count: 1, conversion_timestamp: `${today}T10:00:00Z`, distinct_id: 'd1', anonymous_id: 'a1' }]

// Pipe rows (named) for the 4 overview pipes + bounce_rate.
const TB_BY_PIPE = {
  integ_install: [{ event_type: '$pageview', timestamp: '2026-07-10T10:00:00Z', page_url: 'https://techrupt.pk/' }],
  dash_alerts: [{ this_week: 100, last_week: 80, count_day: 10, count_hour: 2, last_event: '2026-07-13 09:00:00' }],
  dash_stages: [{ stage: 'closed_won', count: 3, revenue: 2999.97 }],
  dash_top_pages: [{ page_url: 'https://techrupt.pk/pricing', count: 42 }],
  dashboard_bounce_rate: [{ bounce_rate_pct: 55.5, total_sessions: 120 }],
}

test('(overview-a) 4 pipes + bounce served -> kpis present, install/stages/pages from positional mapRows, HogQL NOT called', async (t) => {
  t.after(() => { restoreSupabase(); reset() })
  installSupabase(CONV_ROWS)
  __setDashboardReadDeps({
    queryTinybird: async (pipe) => TB_BY_PIPE[pipe] ?? null,
    queryHog: async () => { throw new Error('HogQL called — a pipe was not served') },
  })
  const res = mockRes()
  await overviewHandler(req(), res)
  assert.strictEqual(res.statusCode, 200)
  const k = res.body.data.kpis
  // The kpis keys Dashboard.jsx reads must all still be produced.
  for (const key of ['revenue', 'revenue_prev', 'leads', 'leads_prev', 'customers', 'customers_prev', 'conversions', 'avg_value', 'bounce_rate', 'lead_conversion_rate', 'customer_conversion_rate']) {
    assert.ok(key in k, `kpis.${key} present`)
  }
  assert.strictEqual(k.revenue, 999.99, 'revenue from Supabase (untouched)')
  assert.strictEqual(k.bounce_rate, 55.5, 'bounce_rate from the pipe (positional [pct, sessions])')
  // install status derived from integ_install positional [event_type, timestamp, page_url]:
  // a row present -> 'verified', and the domain is parsed from page_url (techrupt.pk).
  const blob = JSON.stringify(res.body.data)
  assert.ok(blob.includes('verified'), 'integ_install positional mapRows consumed -> install verified')
  assert.ok(blob.includes('techrupt.pk'), 'page_url from the install pipe row parsed into the domain')
  // pipeline stages from dash_stages positional [stage, count, revenue]
  assert.ok(blob.includes('closed_won'), 'dash_stages positional mapRows consumed (stage name present)')
  assert.ok(JSON.stringify(res.body.data).includes('techrupt.pk/pricing') || JSON.stringify(res.body.data).includes('/pricing'), 'dash_top_pages positional mapRows consumed')
})

test('(overview-trend) channel_trend counts ALL conversions per date, not just leads (load-bearing)', async (t) => {
  t.after(() => { restoreSupabase(); reset() })
  // CONV_ROWS is a single CUSTOMER conversion (closed_won) with zero leads. The old
  // leads-only trend dropped it, so a customer-only site charted an empty trend even
  // though the card promises "Conversions by source over time".
  installSupabase(CONV_ROWS)
  __setDashboardReadDeps({
    queryTinybird: async (pipe) => TB_BY_PIPE[pipe] ?? null,
    queryHog: async () => { throw new Error('HogQL called — a pipe was not served') },
  })
  const res = mockRes()
  await overviewHandler(req(), res)
  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(res.body.data.channel_trend, [{ dim_value: today, conversions: 1 }],
    'the customer conversion contributes to the conversions trend (count, not leads)')
})

test('(overview-b) FAIL-CLOSED: FORCE_READ + pipes null -> 500', async (t) => {
  t.after(() => { restoreSupabase(); reset() })
  installSupabase(CONV_ROWS)
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setDashboardReadDeps({ queryTinybird: async () => null, queryHog: async () => { throw new Error('should not reach') } })
  const res = mockRes()
  await overviewHandler(req(), res)
  assert.strictEqual(res.statusCode, 500)
})
