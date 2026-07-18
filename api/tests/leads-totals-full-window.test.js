// All Leads full-window totals (the quad-fix root: values were computed over the ≤100-row page).
// GET /leads now derives total (distinct converters), total_conversions, and total_revenue from a
// single Supabase attributed_conversions aggregate over the FULL window (the §5 source of truth for
// conversions & revenue, same as Analytics) — NOT a reduce over the returned page. These tests prove
// the totals are correct even when the revenue-bearing converters sit BEYOND the returned page.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const mod = await import('../routes/leads-server.js')
const router = mod.leadsRouter
const { __setLeadsReadDeps, __resetLeadsReadDeps } = mod
const { getSupabase } = await import('../lib/supabase.js')

// The totals aggregate is the ONLY attributed_conversions query that uses .gte/.lte (a date window);
// the per-lead enrichment uses .in(distinct_id). The mock returns aggRows for the windowed aggregate
// and enrichRows otherwise, so the two reads don't collide.
const _client = getSupabase()
const _realFrom = _client.from
function installSupabase ({ aggRows = [], aggError = null, enrichRows = [] } = {}) {
  _client.from = () => {
    let windowed = false
    const b = {
      select: () => b, eq: () => b, in: () => b,
      gte: () => { windowed = true; return b },
      lte: () => b,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (r) => Promise.resolve(windowed ? { data: aggError ? null : aggRows, error: aggError } : { data: enrichRows, error: null }).then(r),
    }
    return b
  }
}
function restoreSupabase () { _client.from = _realFrom }

const handlerFor = (path) => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.get)
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const listHandler = handlerFor('/')
function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
// 30-day window so the totals aggregate applies its .gte/.lte date filter.
const listReq = () => ({ site: { id: 'site-00' }, query: { date_from: '2026-06-18', date_to: '2026-07-18' } })
const reset = () => { __resetLeadsReadDeps(); restoreSupabase() }

// A page of engaged-only visitors (conversions=0, revenue=0) — the revenue-bearing converters are
// deliberately NOT on this page (they sort older / beyond the limit). Page-reduce would give 0.
const PAGE = ['p1', 'p2'].map(id => ({
  distinct_id: id, first_seen: '2026-07-14T00:00:00Z', last_seen: '2026-07-14T00:00:00Z',
  pageviews: 4, conversions: 0, total_revenue: 0, source: 'google', medium: 'organic',
  campaign: null, ai_source: '', country: 'US', first_page_url: '/', last_conversion_type: null,
}))
// Full-window attributed_conversions: 4 distinct converters, 4 rows, $999.99 (techrupt.pk ground truth).
const AGG = [
  { distinct_id: 'c1', conversion_value: 100 },
  { distinct_id: 'c2', conversion_value: 200 },
  { distinct_id: 'c3', conversion_value: 300 },
  { distinct_id: 'c4', conversion_value: 399.99 },
]

function serveLeadsList (rows) {
  __setLeadsReadDeps({
    queryTinybird: async (pipe) => (pipe === 'leads_list' ? rows : null),
    queryHog: async () => { throw new Error('HogQL called — leads_list must serve from the pipe') },
  })
}

test('(full-window) totals come from attributed_conversions, NOT the returned page', async (t) => {
  t.after(reset)
  installSupabase({ aggRows: AGG })
  serveLeadsList(PAGE)             // page shows 2 engaged-only rows (conversions=0, revenue=0)
  const res = mockRes()
  await listHandler(listReq(), res)
  assert.strictEqual(res.statusCode, 200)
  const d = res.body.data
  assert.strictEqual(d.total, 4, 'distinct converters = full-window (4), NOT the page converter count (0)')
  assert.strictEqual(d.total_conversions, 4, 'conversion count = full-window (4), NOT the page reduce (0)')
  assert.strictEqual(Number(d.total_revenue.toFixed(2)), 999.99, 'revenue = full-window $999.99, NOT the page reduce ($0) — fixes the false "No revenue" banner')
  // and the table still shows its own (page) rows, independent of the totals
  assert.strictEqual(d.leads.length, 2, 'table renders the returned page rows')
})

test('(consistency) converters ≤ conversions (single-source guarantee)', async (t) => {
  t.after(reset)
  // one visitor converts twice -> 3 distinct converters, 4 conversion rows
  installSupabase({ aggRows: [{ distinct_id: 'c1', conversion_value: 10 }, { distinct_id: 'c1', conversion_value: 10 }, { distinct_id: 'c2', conversion_value: 5 }, { distinct_id: 'c3', conversion_value: 5 }] })
  serveLeadsList(PAGE)
  const res = mockRes()
  await listHandler(listReq(), res)
  assert.strictEqual(res.body.data.total, 3, 'distinct converters')
  assert.strictEqual(res.body.data.total_conversions, 4, 'conversion events')
  assert.ok(res.body.data.total <= res.body.data.total_conversions, 'converters can never exceed conversions (same source)')
})

test('(fallback) a failed totals aggregate keeps the page-derived fallback, never a silent 500', async (t) => {
  t.after(reset)
  installSupabase({ aggError: { message: 'boom' } })
  // page HAS a converter this time so the fallback is observably non-zero
  serveLeadsList([{ ...PAGE[0], distinct_id: 'v1', conversions: 1, total_revenue: 50 }])
  const res = mockRes()
  await listHandler(listReq(), res)
  assert.strictEqual(res.statusCode, 200, 'aggregate error must not 500 the whole page')
  assert.strictEqual(res.body.data.total, 1, 'fallback: distinct converters on the page')
  assert.strictEqual(res.body.data.total_conversions, 1, 'fallback: page conversion sum')
  assert.strictEqual(res.body.data.total_revenue, 50, 'fallback: page revenue sum')
})
