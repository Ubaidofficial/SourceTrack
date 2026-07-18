// Leads read-cutover — leads-server.js dispatch/fallback tests (D1b-2). Three reads route through
// readTb: leads_list + leads_count (GET /) and lead_detail (GET /:leadId). D1b-1 left this reader
// UNTESTED; this file proves it serves from its pipes before D1b-2 removes the HogQL fallback.
//
// ERROR-SURFACE (D1b-2 finding): leads_list and lead_detail sit in the handler's main try -> a null
// pipe surfaces as a LOUD 500. leads_count sits in an INNER try/catch (keep the page-length fallback
// rather than 500) -> a null pipe DEGRADES to 200 with the page-length count, NOT a loud 500. That
// inner catch swallows the throw regardless of FORCE_READ; closing that fake-count needs the inner
// catch removed (out of D1b-2 scope) — asserted here so the behavior is pinned, not assumed.

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

// ── GET / (leads_list + leads_count) ─────────────────────────────────────────
test('(list-a) DISPATCH: leads_list + leads_count served, tenant-scoped, HogQL NOT called', async (t) => {
  t.after(reset)
  installSupabase()
  const tbCalls = []
  __setLeadsReadDeps({
    queryTinybird: async (pipe, params) => {
      tbCalls.push({ pipe, params })
      if (pipe === 'leads_list') return []                        // empty -> no Supabase enrichment
      if (pipe === 'leads_count') return [{ leads_count: 0 }]
      return null
    },
    queryHog: async () => { throw new Error('HogQL called — a leads pipe was not served (zero-fallback violated)') },
  })
  const res = mockRes()
  await listHandler(listReq(), res)
  assert.strictEqual(res.statusCode, 200)
  const pipes = tbCalls.map(c => c.pipe)
  assert.ok(pipes.includes('leads_list'), 'leads_list dispatched')
  assert.ok(pipes.includes('leads_count'), 'leads_count dispatched')
  assert.strictEqual(tbCalls.find(c => c.pipe === 'leads_list').params.site_id, 'site-00', 'tenant-scoped site_id')
})

test('(list-loud-500) FAIL-CLOSED: leads_list null under FORCE_READ -> 500 (main try, loud)', async (t) => {
  t.after(reset)
  installSupabase()
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setLeadsReadDeps({
    queryTinybird: async (pipe) => (pipe === 'leads_list' ? null : [{ leads_count: 0 }]),
    queryHog: async () => { throw new Error('should not reach HogQL under force-read') },
  })
  const res = mockRes()
  await listHandler(listReq(), res)
  assert.strictEqual(res.statusCode, 500, 'leads_list is in the main try -> a null pipe 500s loud')
})

test('(list-count-DEGRADE) leads_count null under FORCE_READ -> 200 degrade (inner catch swallows the throw)', async (t) => {
  t.after(reset)
  installSupabase()
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setLeadsReadDeps({
    queryTinybird: async (pipe) => (pipe === 'leads_count' ? null : []), // leads_list served [] (page length 0)
    queryHog: async () => { throw new Error('should not reach HogQL under force-read') },
  })
  const res = mockRes()
  await listHandler(listReq(), res)
  // FINDING: the leads_count read is wrapped in its own try/catch (keep the page-length fallback,
  // not a 500). The throw is swallowed even under FORCE_READ -> the endpoint still returns 200 with
  // total = page length. The flip does NOT close this count's fake value; the inner catch must go.
  assert.strictEqual(res.statusCode, 200, 'leads_count inner catch swallows the throw -> 200 degrade (flagged)')
  assert.strictEqual(res.body.data.total, 0, 'total falls back to the page length (0), not the pipe count')
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

test('(detail-loud-500) FAIL-CLOSED: lead_detail null under FORCE_READ -> 500 (main try, loud)', async (t) => {
  t.after(reset)
  installSupabase()
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setLeadsReadDeps({
    queryTinybird: async () => null,
    queryHog: async () => { throw new Error('should not reach HogQL under force-read') },
  })
  const res = mockRes()
  await detailHandler(detailReq(), res)
  assert.strictEqual(res.statusCode, 500, 'lead_detail is in the main try -> a null pipe 500s loud')
})
