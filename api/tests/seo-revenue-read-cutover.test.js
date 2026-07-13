// Grade B read-cutover — seo-revenue.js dispatch/fallback tests.
// Wired: seo_revenue_landing_pages (first organic-search landing page per
// converted visitor). Mirrors sessions-read-cutover.test.js.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/seo-revenue.js')
const { seoRevenueRouter, __setSeoRevenueReadDeps, __resetSeoRevenueReadDeps } = mod
const { getSupabase } = await import('../lib/supabase.js')

// Extract the GET '/' handler from the router.
const handler = (() => {
  const layer = seoRevenueRouter.stack.find(l => l.route?.path === '/' && l.route?.methods?.get)
  return layer.route.stack[layer.route.stack.length - 1].handle
})()

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const req = () => ({ site: { id: 'site-00', site_key: 'sk_x', plan: 'scale' }, query: { from: '2026-07-01', to: '2026-07-02' } })

// Chainable Supabase stub: gsc_connections (maybeSingle), attributed_conversions
// + gsc_performance_daily (awaited).
const _client = getSupabase()
const _realFrom = _client.from
function installSupabase (cfg) {
  const result = (table) => {
    if (table === 'gsc_connections') return { data: cfg.conn ?? null, error: null }
    if (table === 'attributed_conversions') return { data: cfg.conversions ?? [], error: null }
    if (table === 'gsc_performance_daily') return { data: cfg.gsc ?? [], error: null }
    return { data: [], error: null }
  }
  const chain = (table) => {
    const b = {
      select: () => b, eq: () => b, gte: () => b, lte: () => b,
      maybeSingle: async () => result(table),
      then: (res, rej) => Promise.resolve(result(table)).then(res, rej)
    }
    return b
  }
  _client.from = (t) => ({ select: () => chain(t) })
}
function restoreSupabase () { _client.from = _realFrom }

const ONE_CONVERSION = [{ distinct_id: 'v1', conversion_value: 100, conversion_date: '2026-07-01' }]

test('(a) seo-revenue landing pages — DISPATCH: served from pipe, HogQL NOT called (load-bearing: HogQL stub throws)', async (t) => {
  t.after(() => { restoreSupabase(); __resetSeoRevenueReadDeps() })
  installSupabase({ conn: null, conversions: ONE_CONVERSION, gsc: [] })
  const tbCalls = []
  __setSeoRevenueReadDeps({
    queryTinybird: async (pipe, params) => {
      tbCalls.push({ pipe, params })
      return pipe === 'seo_revenue_landing_pages' ? [{ distinct_id: 'v1', landing_page: '/landing' }] : null
    },
    // LOAD-BEARING: if the code falls back to HogQL, this throws and the test fails.
    queryHog: async () => { throw new Error('HogQL called — pipe was not served (zero-fallback violated)') }
  })
  const res = mockRes()
  await handler(req(), res)

  assert.strictEqual(res.body.success, true)
  // The pipe row resolved the landing page — revenue is bucketed under it, NOT 'unknown'.
  assert.strictEqual(res.body.landing_pages.length, 1)
  assert.strictEqual(res.body.landing_pages[0].revenue, 100)
  assert.strictEqual(res.body.landing_pages[0].conversions, 1)
  assert.notStrictEqual(res.body.landing_pages[0].page_path, 'unknown', 'pipe row was used, not the unknown fallback')
  // Dispatch used the authenticated site_id + exact window bounds.
  assert.deepStrictEqual(tbCalls[0].params, {
    site_id: 'site-00', visitor_ids: ['v1'], from_ts: '2026-07-01 00:00:00', to_ts: '2026-07-02 23:59:59'
  })
})

test('(b) seo-revenue — FAIL-CLOSED: TINYBIRD_FORCE_READ + pipe null -> 500, no silent HogQL bypass', async (t) => {
  t.after(() => { delete process.env.TINYBIRD_FORCE_READ; restoreSupabase(); __resetSeoRevenueReadDeps() })
  installSupabase({ conn: null, conversions: ONE_CONVERSION, gsc: [] })
  process.env.TINYBIRD_FORCE_READ = 'true'
  const hog = []
  __setSeoRevenueReadDeps({
    queryTinybird: async () => null,
    queryHog: async (_sql, name) => { hog.push(name); return [] }
  })
  const res = mockRes()
  await handler(req(), res)

  assert.strictEqual(res.statusCode, 500)
  assert.strictEqual(res.body.success, false)
  assert.ok(!hog.includes('seo-revenue-landing-pages'), 'no silent HogQL fallback for the wired read under force-read')
})

test('(c) seo-revenue — FALLBACK: flag off (pipe null) -> HogQL serves landing pages (byte-identical path)', async (t) => {
  t.after(() => { restoreSupabase(); __resetSeoRevenueReadDeps() })
  installSupabase({ conn: null, conversions: ONE_CONVERSION, gsc: [] })
  const tbCalls = []; const hog = []
  __setSeoRevenueReadDeps({
    queryTinybird: async (pipe, params) => { tbCalls.push(pipe); return null }, // flag off
    queryHog: async (_sql, name) => { hog.push(name); return name === 'seo-revenue-landing-pages' ? [['v1', '/hoglanding']] : [] }
  })
  const res = mockRes()
  await handler(req(), res)

  assert.strictEqual(res.body.success, true)
  assert.deepStrictEqual(tbCalls, ['seo_revenue_landing_pages'], 'the wired read attempts Tinybird first')
  assert.ok(hog.includes('seo-revenue-landing-pages'), 'flag off -> HogQL fallback served the landing pages')
  assert.strictEqual(res.body.landing_pages.length, 1)
  assert.strictEqual(res.body.landing_pages[0].revenue, 100)
  assert.notStrictEqual(res.body.landing_pages[0].page_path, 'unknown', 'HogQL positional row resolved the landing page')
})

test('(d) seo-revenue — plan gate: feature not on plan -> 402', async (t) => {
  t.after(() => { restoreSupabase(); __resetSeoRevenueReadDeps() })
  installSupabase({ conn: null, conversions: [], gsc: [] })
  const res = mockRes()
  await handler({ site: { id: 'site-00', site_key: 'sk_x', plan: 'free' }, query: { from: '2026-07-01', to: '2026-07-02' } }, res)
  assert.strictEqual(res.statusCode, 402)
})
