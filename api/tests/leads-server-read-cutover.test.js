// Leads read-cutover — leads-server.js dispatch/fallback tests (D1b-2). TWO reads route through
// readTb: leads_list (GET /) and lead_detail (GET /:leadId). D1b-1 left this reader UNTESTED; this
// file proves it serves from its pipes before D1b-2 removes the HogQL fallback.
//
// ERROR-SURFACE (D1b-2 finding): leads_list and lead_detail sit in the handler's main try -> a null
// pipe surfaces as a LOUD 500.
//
// `leads_count` IS RETIRED (#289, ed714dc) — this header used to describe it as a third readTb read
// sitting behind an inner catch that degraded to a page-length count, and to say closing that
// fake-count "needs the inner catch removed (out of D1b-2 scope)". That was true when written and
// has not been since #289: the pipe is gone from leads-server.js entirely and totals now come from
// Supabase `attributed_conversions` (loud log + page-scoped fallback, never a silent zero). The
// stale text contradicted this file's own assertion at the `leads_count is retired` test below, so
// a reader cross-checking it found both claims. Corrected rather than deleted, per the repo's
// keep-the-history convention.

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

// Stub Supabase (attributed_conversions / lead_qualifications enrichment) so tests never dial the
// mock URL. Returns no rows -> the leads pass through the pipe values unchanged.
const _client = getSupabase()
const _realFrom = _client.from
function installSupabase (rows = []) {
  const chain = () => {
    const b = {
      select: () => b, eq: () => b, in: () => b,
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (r) => Promise.resolve({ data: rows, error: null }).then(r),
    }
    return b
  }
  _client.from = () => chain()
}
function restoreSupabase () { _client.from = _realFrom }

const handlerFor = (path) => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.get)
  return layer.route.stack[layer.route.stack.length - 1].handle // final handler, after validateSiteKey
}
const listHandler = handlerFor('/')
const detailHandler = handlerFor('/:leadId')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const listReq = (over = {}) => ({ site: { id: 'site-00' }, query: {}, ...over })
const detailReq = (over = {}) => ({ site: { id: 'site-00' }, params: { leadId: 'lead-1' }, query: {}, ...over })
const reset = () => { __resetLeadsReadDeps(); restoreSupabase(); delete process.env.TINYBIRD_FORCE_READ }

// A minimal NAMED lead_detail row (pipe aliases; ft_source/ft_medium per the ClickHouse rename).
const DETAIL_ROW = {
  first_seen: '2026-07-01T00:00:00Z', last_seen: '2026-07-10T00:00:00Z', pageviews: 5, conversions: 1,
  total_revenue: 99.5, source: 'google', medium: 'organic', ai_source: '', country: 'US',
  first_page_url: '/', campaign: null, ft_source: 'google', ft_medium: 'organic', active_days: 3,
}

// ── GET / (leads_list; totals now come from Supabase attributed_conversions, not leads_count) ──
test('(list-a) DISPATCH: leads_list served, tenant-scoped, HogQL NOT called', async (t) => {
  t.after(reset)
  installSupabase()
  const tbCalls = []
  __setLeadsReadDeps({
    queryTinybird: async (pipe, params) => {
      tbCalls.push({ pipe, params })
      if (pipe === 'leads_list') return []                        // empty -> no Supabase enrichment
      return null
    },
    queryHog: async () => { throw new Error('HogQL called — a leads pipe was not served (zero-fallback violated)') },
  })
  const res = mockRes()
  await listHandler(listReq(), res)
  assert.strictEqual(res.statusCode, 200)
  const pipes = tbCalls.map(c => c.pipe)
  assert.ok(pipes.includes('leads_list'), 'leads_list dispatched')
  assert.ok(!pipes.includes('leads_count'), 'leads_count is retired — totals now come from Supabase attributed_conversions')
  assert.strictEqual(tbCalls.find(c => c.pipe === 'leads_list').params.site_id, 'site-00', 'tenant-scoped site_id')
})

test('(list-loud-500) D1b-2: leads_list null -> 500 (main try, loud), HogQL fallback DELETED', async (t) => {
  t.after(reset)
  installSupabase()
  const hog = []
  __setLeadsReadDeps({
    queryTinybird: async (pipe) => (pipe === 'leads_list' ? null : []),
    queryHog: async (_s, n) => { hog.push(n); return [] },
  })
  const res = mockRes()
  await listHandler(listReq(), res)
  assert.strictEqual(res.statusCode, 500, 'leads_list is in the main try -> a null pipe 500s loud (no HogQL fallback)')
  assert.strictEqual(hog.length, 0, 'HogQL was NOT called — the fallback is deleted')
})

// ── GET /:leadId (lead_detail) ───────────────────────────────────────────────
test('(detail-a) DISPATCH: lead_detail served, tenant-scoped, HogQL NOT called', async (t) => {
  t.after(reset)
  installSupabase()
  const tbCalls = []
  __setLeadsReadDeps({
    queryTinybird: async (pipe, params) => { tbCalls.push({ pipe, params }); return pipe === 'lead_detail' ? [DETAIL_ROW] : null },
    queryHog: async () => { throw new Error('HogQL called — lead_detail pipe was not served') },
  })
  const res = mockRes()
  await detailHandler(detailReq(), res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(tbCalls[0].pipe, 'lead_detail')
  assert.deepStrictEqual(tbCalls[0].params, { site_id: 'site-00', distinct_id: 'lead-1' }, 'tenant + visitor scoped')
})

test('(detail-404) lead_detail served empty -> 404 (no dead-store zero), HogQL NOT called', async (t) => {
  t.after(reset)
  installSupabase()
  __setLeadsReadDeps({
    queryTinybird: async () => [],
    queryHog: async () => { throw new Error('HogQL called — pipe served (empty), no fallback allowed') },
  })
  const res = mockRes()
  await detailHandler(detailReq(), res)
  assert.strictEqual(res.statusCode, 404, 'empty pipe -> honest 404, not a fabricated lead')
})

test('(detail-loud-500) D1b-2: lead_detail null -> 500 (main try, loud), HogQL fallback DELETED', async (t) => {
  t.after(reset)
  installSupabase()
  const hog = []
  __setLeadsReadDeps({
    queryTinybird: async () => null,
    queryHog: async (_s, n) => { hog.push(n); return [] },
  })
  const res = mockRes()
  await detailHandler(detailReq(), res)
  assert.strictEqual(res.statusCode, 500, 'lead_detail is in the main try -> a null pipe 500s loud (no HogQL fallback)')
  assert.strictEqual(hog.length, 0, 'HogQL was NOT called — the fallback is deleted')
})
