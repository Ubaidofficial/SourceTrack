// Journey read-cutover — journey.js dispatch/fallback tests (D1b-2). The single visitor-journey
// read routes through readTb (Tinybird-first). D1b-1 left this reader UNTESTED; this file proves
// it serves from the `journey` pipe before D1b-2 removes its HogQL fallback.
//
// journey's read path is pipe-only (no Supabase), so the real handler is exercised through the
// __setJourneyReadDeps seam alone. Asserts: (a) the pipe dispatches tenant-scoped, (b) no HogQL
// when the pipe serves, (c) a null pipe under FORCE_READ 500s (journey has NO inner catch on the
// read → the outer catch surfaces it as a loud 500, never a dead-store zero).

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { journey, __setJourneyReadDeps, __resetJourneyReadDeps } = await import('../routes/journey.js')
const { getSupabase } = await import('../lib/supabase.js')

// journey enriches from Supabase attributed_conversions after the pipe read. Stub the client so the
// test never dials the mock URL (a real DNS timeout otherwise); the enrichment returns no rows.
const _client = getSupabase()
const _realFrom = _client.from
function installSupabase (rows = []) {
  const chain = () => {
    const b = { select: () => b, eq: () => b, in: () => b, single: () => Promise.resolve({ data: rows[0] ?? null, error: null }), then: (r) => Promise.resolve({ data: rows, error: null }).then(r) }
    return b
  }
  _client.from = () => chain()
}
function restoreSupabase () { _client.from = _realFrom }

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const req = (over = {}) => ({ site: { id: 'site-00' }, params: { visitorId: 'visitor-1' }, query: {}, ...over })
const reset = () => { __resetJourneyReadDeps(); restoreSupabase(); delete process.env.TINYBIRD_FORCE_READ }

// A minimal NAMED journey row (the pipe's own aliases). readTb remaps it to the 23-col positional
// shape the consumer destructures; a single pageview row is enough to prove the remap yields data.
const NAMED_ROW = {
  event_type: '$pageview', timestamp: '2026-07-10T10:00:00Z', page_url: 'https://x/p', referrer: 'https://google.com',
  utm_source: 'google', utm_medium: 'organic', utm_campaign: null, ai_source: null, is_conversion: false,
  conversion_value: null, conversion_type: null, device_type: 'desktop', browser_name: 'Chrome', browser_version: '120',
  os_name: 'macOS', os_version: '14', country: 'US', user_id: 'u1', order_id: null,
  destination_domain: null, destination_url: null, source_system: null, ingestion_method: null,
}

test('(a) DISPATCH: served from the `journey` pipe, tenant-scoped, HogQL NOT called', async (t) => {
  t.after(reset)
  installSupabase()
  const tbCalls = []
  __setJourneyReadDeps({
    queryTinybird: async (pipe, params) => { tbCalls.push({ pipe, params }); return pipe === 'journey' ? [NAMED_ROW] : null },
    queryHog: async () => { throw new Error('HogQL called — the journey pipe was not served (zero-fallback violated)') },
  })
  const res = mockRes()
  await journey(req(), res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(tbCalls[0].pipe, 'journey')
  assert.strictEqual(tbCalls[0].params.site_id, 'site-00', 'dispatched with the authenticated site_id only')
  assert.strictEqual(tbCalls[0].params.visitor_id, 'visitor-1', 'scoped to the requested visitor')
  assert.ok(Array.isArray(res.body.data?.events) && res.body.data.events.length === 1, 'named pipe row remapped to the positional shape the consumer reads')
})

test('(b) served empty pipe -> 200 with empty journey, HogQL NOT called', async (t) => {
  t.after(reset)
  installSupabase()
  __setJourneyReadDeps({
    queryTinybird: async () => [],
    queryHog: async () => { throw new Error('HogQL called — pipe served (empty), no fallback allowed') },
  })
  const res = mockRes()
  await journey(req(), res)
  assert.strictEqual(res.statusCode, 200)
})

test('(c) D1b-2: pipe null -> 500 (loud), HogQL fallback DELETED (no FORCE_READ needed)', async (t) => {
  t.after(reset)
  const hog = []
  __setJourneyReadDeps({
    queryTinybird: async () => null,
    queryHog: async (_s, n) => { hog.push(n); return [] },
  })
  const res = mockRes()
  await journey(req(), res)
  assert.strictEqual(res.statusCode, 500, 'a null journey pipe 500s loud — no dead-store HogQL read')
  assert.strictEqual(hog.length, 0, 'HogQL was NOT called — the fallback is deleted')
})

test('(c-forceread) FORCE_READ + pipe null -> still 500 (unconditional throw)', async (t) => {
  t.after(reset)
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setJourneyReadDeps({ queryTinybird: async () => null, queryHog: async () => { throw new Error('should not reach HogQL') } })
  const res = mockRes()
  await journey(req(), res)
  assert.strictEqual(res.statusCode, 500)
})
