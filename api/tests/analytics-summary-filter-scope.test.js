// Analytics /summary revenue filter-scope (§6 wrong-scope closure).
// BUG: a Channel filter scoped visitors/pages (pageview pipes) but the revenue/conversions KPIs came
// from a separate attributed_conversions read that ignored the filter — so REVENUE/CONVERSIONS/
// CONV RATE/REV-PER-VISITOR stayed unfiltered (e.g. $999.99 / 4 / 100% / $500). FIX (hybrid):
//   - pass-through dims (Channel/Source/Country/Device/Browser/Page/AI Source) -> scope `conversions`
//     by the matching attributed_conversions column, so KPIs + revenue series/map all filter.
//   - gated dims (Entry/Exit/OS — no conversion-row column) -> the revenue KPIs (and series/map)
//     return null so the frontend hides them (never unfiltered numbers).

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/analytics.js')
const router = mod.default
const { __setAnalyticsReadDeps, __resetAnalyticsReadDeps } = mod
const { getSupabase } = await import('../lib/supabase.js')

const handlerFor = (path) => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.get)
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const summaryHandler = handlerFor('/summary')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
// Fixed window so the client-side conversion date filter is deterministic.
const req = (f) => ({ site: { id: 'site-00', timezone: 'UTC' }, query: { from: '2026-07-01', to: '2026-07-31', ...(f ? { f } : {}) } })

// Four distinct pageview visitors (the denominator). dispatchPageviews is stubbed to return these
// regardless of pipe params — we assert the REVENUE side here, not the (already-correct) pageview side.
const PV = ['v1', 'v2', 'v3', 'v4'].map(id => ({
  url: 'https://x/', referrer: null, utm_source: null, utm_medium: null, utm_campaign: null,
  country: 'US', device: 'desktop', browser: 'Chrome', os: 'Windows', ai_source: null,
  anonymous_id: id, timestamp: '2026-07-10T10:00:00Z',
}))

// Two conversions on different channels: $100 Organic Search + $900 Direct = $1000 unfiltered.
const CONV = [
  { conversion_value: 100, first_touch_source: 'google', first_touch_channel: 'Organic Search', country: 'US', device: 'desktop', browser: 'Chrome', landing_page: '/', ai_influenced_source: null, conversion_timestamp: '2026-07-10T10:00:00Z', conversion_date: '2026-07-10', distinct_id: 'c1', anonymous_id: 'c1' },
  { conversion_value: 900, first_touch_source: 'direct', first_touch_channel: 'Direct', country: 'GB', device: 'mobile', browser: 'Safari', landing_page: '/pricing', ai_influenced_source: null, conversion_timestamp: '2026-07-11T10:00:00Z', conversion_date: '2026-07-11', distinct_id: 'c2', anonymous_id: 'c2' },
]

// Stub the attributed_conversions read (site+date scoped in code; we return the full set and let the
// handler's own filter logic scope it). getSupabase() is a singleton -> monkeypatch .from.
const _client = getSupabase()
const _realFrom = _client.from
function installSupabase (rows) {
  const chain = () => {
    const b = { select: () => b, eq: () => b, gte: () => b, lte: () => b, then: (r) => Promise.resolve({ data: rows, error: null }).then(r) }
    return b
  }
  _client.from = () => chain()
}
function restoreSupabase () { _client.from = _realFrom }

function stubPageviews () {
  __setAnalyticsReadDeps({
    queryTinybird: async () => PV,       // dispatchPageviews serves from the pipe
    fetchPv: async () => { throw new Error('fetchPageviews (HogQL) called — pageviews must serve from the pipe') },
  })
}
const reset = () => { __resetAnalyticsReadDeps(); restoreSupabase() }

// ── (c) UNFILTERED — byte-identical baseline ──────────────────────────────────
test('(c) no filter -> revenue KPIs are the full unfiltered totals (baseline unchanged)', async (t) => {
  t.after(reset)
  installSupabase(CONV); stubPageviews()
  const res = mockRes()
  await summaryHandler(req(), res)
  const k = res.body.data.kpis
  assert.strictEqual(k.total_revenue, 1000, 'both conversions summed')
  assert.strictEqual(k.conversion_count, 2)
  assert.strictEqual(k.conversion_rate, 50, '2 converters / 4 visitors')
  assert.strictEqual(k.revenue_per_visitor, 250, '1000 / 4')
  assert.strictEqual(res.body.data.revenue_by_source.google, 100)
})

// ── (a) PASS-THROUGH — Channel filter scopes the revenue rail ─────────────────
test('(a) Channel:Organic Search -> revenue KPIs scope to that channel (leak closed)', async (t) => {
  t.after(reset)
  installSupabase(CONV); stubPageviews()
  const res = mockRes()
  await summaryHandler(req('Channel:Organic Search'), res)
  const k = res.body.data.kpis
  assert.strictEqual(k.total_revenue, 100, 'ONLY the Organic Search conversion — NOT the unfiltered 1000')
  assert.strictEqual(k.conversion_count, 1)
  // (3) numerator (1 scoped converter) AND denominator (4 visitors) both scoped -> 25%, not the bogus 100%.
  assert.strictEqual(k.conversion_rate, 25, 'consistent numerator/denominator — no more bogus 100%')
  assert.strictEqual(k.revenue_per_visitor, 25, '100 / 4')
  assert.strictEqual(res.body.data.revenue_by_source.google, 100)
  assert.strictEqual(res.body.data.revenue_by_source.direct, undefined, 'Direct-channel revenue excluded')
})

test('(a2) pass-through works for a non-channel dim (Country:GB -> only the $900 GB conversion)', async (t) => {
  t.after(reset)
  installSupabase(CONV); stubPageviews()
  const res = mockRes()
  await summaryHandler(req('Country:GB'), res)
  assert.strictEqual(res.body.data.kpis.total_revenue, 900)
  assert.strictEqual(res.body.data.kpis.conversion_count, 1)
})

// ── (b) GATED — OS has no conversion column -> revenue KPIs null (hidden, not faked) ──
test('(b) OS:Windows -> revenue KPIs are NULL (gated, not unfiltered numbers)', async (t) => {
  t.after(reset)
  installSupabase(CONV); stubPageviews()
  const res = mockRes()
  await summaryHandler(req('OS:Windows'), res)
  const k = res.body.data.kpis
  assert.strictEqual(k.total_revenue, null, 'no conversion-row column for OS -> hide, do not leak 1000')
  assert.strictEqual(k.conversion_count, null)
  assert.strictEqual(k.conversion_rate, null)
  assert.strictEqual(k.revenue_per_visitor, null)
  // the leak is closed on EVERY revenue surface, not just the KPI cards
  assert.strictEqual(res.body.data.revenue_by_source, null, 'per-source revenue map gated too')
  assert.strictEqual(res.body.data.timeseries.revenue, null, 'revenue timeseries gated too')
  assert.ok(res.body.data.top_sources.every(s => s.revenue === null), 'top_sources revenue overlay gated too')
  // pageview KPIs still serve (the gate is revenue-only)
  assert.strictEqual(k.unique_visitors, 4, 'visitor KPI unaffected by the revenue gate')
})

test('(b2) a mixed request with any gated dim gates revenue even if another dim is pass-through', async (t) => {
  t.after(reset)
  installSupabase(CONV); stubPageviews()
  const res = mockRes()
  await summaryHandler(req(['Channel:Organic Search', 'OS:Windows']), res)
  assert.strictEqual(res.body.data.kpis.total_revenue, null, 'OS (gated) present -> revenue cannot be honestly scoped -> null')
})
