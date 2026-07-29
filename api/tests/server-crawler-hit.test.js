// POST /api/server/crawler-hit — behavioural coverage.
//
// The five things that MUST hold, each of which is a load-bearing decision rather than a
// happy path:
//   1. the write lands in `crawler_hits` and NOWHERE near `events` / dualWriteEvent
//   2. NO meter runs on this path (claimPageviewUsage / claimConversionUsage)
//   3. scope enforcement: write:crawler_hits required, write:events does NOT satisfy it
//   4. fail-open on a bad payload — 200, but a body that says recorded:false + why
//   5. a FAILED write is never reported as a success (#413)
//
// Case 3 is the one worth writing down: reusing write:events would have been the cheaper
// call, and a test that only asserted "the right key works" would have passed under both
// designs. The 403-on-write:events assertion is what pins the decision.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'
process.env.TINYBIRD_HOST = 'https://api.mock.tinybird.co'
process.env.TINYBIRD_APPEND_TOKEN = 'mock-append-token'

const { getSupabase } = await import('../lib/supabase.js')
const { serverCrawlerHitsRouter, buildCrawlerHitRow } = await import('../routes/server-crawler-hits.js')
const { VERIFICATION } = await import('../lib/ai-crawler-detect.js')
const {
  VALID_API_KEY_SCOPES,
  DEFAULT_API_KEY_SCOPES,
  SCOPE_WRITE_CRAWLER_HITS
} = await import('../lib/api-key-scopes.js')

const SITE_ID = 'site-1'

// ── harness ───────────────────────────────────────────────────────────────────
const handlerFor = (router, path, method) => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.[method])
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const postHit = handlerFor(serverCrawlerHitsRouter, '/crawler-hit', 'post')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

const _client = getSupabase()
const _realFrom = _client.from.bind(_client)

// Stub `api_keys` and `sites`; anything else falls through to the real client so an
// unexpected table read is visible rather than silently mocked.
function installSupabase ({ apiKeyRow, plan = 'growth' }) {
  _client.from = (table) => {
    if (table === 'api_keys') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: apiKeyRow, error: null }),
        update: () => ({ eq: async () => ({ data: null, error: null }) })
      }
      return chain
    }
    if (table === 'sites') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { plan }, error: null })
      }
      return chain
    }
    return _realFrom(table)
  }
}
function restoreSupabase () { _client.from = _realFrom }

// Records every fetch so the test can assert WHERE the row went, not merely that
// something was sent.
function recordingFetch ({ ok = true, status = 200 } = {}) {
  const calls = []
  const impl = async (url, opts) => {
    calls.push({ url: String(url), opts })
    return { ok, status, text: async () => (ok ? '' : 'boom') }
  }
  impl.calls = calls
  return impl
}

const _realFetch = globalThis.fetch
function installFetch (impl) { globalThis.fetch = impl }
function restoreFetch () { globalThis.fetch = _realFetch }

const keyRow = (scopes) => ({ id: 'key-1', site_id: SITE_ID, scopes })

const validBody = (over = {}) => ({
  bot_name: 'GPTBot',
  operator: 'OpenAI',
  category: 'llm_crawler',
  verification: VERIFICATION.UA_ONLY,
  path: '/pricing',
  status_code: 200,
  collection_source: 'edge_middleware',
  timestamp: '2026-07-29T10:00:00.000Z',
  ...over
})

const hitReq = (body = validBody()) => ({
  headers: { authorization: 'Bearer st_live_test_token' },
  body,
  socket: {}
})

// ── 1. the write lands in crawler_hits, not events ────────────────────────────
test('1. a valid hit is written to the crawler_hits datasource — never to events', async (t) => {
  installSupabase({ apiKeyRow: keyRow([SCOPE_WRITE_CRAWLER_HITS]) })
  const fetchImpl = recordingFetch()
  installFetch(fetchImpl)
  t.after(() => { restoreSupabase(); restoreFetch() })

  const res = mockRes()
  await postHit(hitReq(), res)

  assert.strictEqual(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`)
  assert.deepStrictEqual(res.body.data, { recorded: true })

  assert.strictEqual(fetchImpl.calls.length, 1, 'exactly one write')
  const { url, opts } = fetchImpl.calls[0]
  assert.ok(url.includes('/v0/events?name=crawler_hits'), `expected a crawler_hits append, got ${url}`)
  assert.ok(!/name=events(\b|_)/.test(url), 'must never target the events datasource')

  const row = JSON.parse(opts.body)
  assert.strictEqual(row.site_id, SITE_ID, 'site_id comes from the API key, not the payload')
  assert.strictEqual(row.bot_name, 'GPTBot')
  assert.strictEqual(row.path, '/pricing')
  assert.strictEqual(row.collection_source, 'edge_middleware')
})

test('1b. the row carries no raw IP, user agent, query string or visitor id (§6)', async (t) => {
  installSupabase({ apiKeyRow: keyRow([SCOPE_WRITE_CRAWLER_HITS]) })
  const fetchImpl = recordingFetch()
  installFetch(fetchImpl)
  t.after(() => { restoreSupabase(); restoreFetch() })

  // A producer that sends MORE than the contract must not get the extras stored.
  const req = hitReq(validBody({
    path: '/checkout?utm_source=google&email=someone@example.com',
    ip: '203.0.113.9',
    user_agent: 'GPTBot/1.0',
    visitor_id: 'v-1',
    distinct_id: 'd-1'
  }))
  req.headers['user-agent'] = 'GPTBot/1.0'
  req.headers['x-forwarded-for'] = '203.0.113.9'

  const res = mockRes()
  await postHit(req, res)

  const row = JSON.parse(fetchImpl.calls[0].opts.body)
  assert.deepStrictEqual(
    Object.keys(row).sort(),
    ['bot_name', 'category', 'collection_source', 'operator', 'path', 'site_id', 'status_code', 'timestamp', 'verification'],
    'the stored column set is pinned — a new field here needs the §6.5 GDPR-paths decision revisited'
  )
  // Query string stripped server-side even though the producer failed to strip it.
  assert.strictEqual(row.path, '/checkout')
  const serialized = fetchImpl.calls[0].opts.body
  assert.ok(!serialized.includes('203.0.113.9'), 'no raw IP on the wire')
  assert.ok(!serialized.includes('someone@example.com'), 'no query-string PII on the wire')
  assert.ok(!serialized.includes('GPTBot/1.0'), 'no raw User-Agent on the wire')
})

test('1c. operator and category come from the registry, never from the caller', async (t) => {
  installSupabase({ apiKeyRow: keyRow([SCOPE_WRITE_CRAWLER_HITS]) })
  const fetchImpl = recordingFetch()
  installFetch(fetchImpl)
  t.after(() => { restoreSupabase(); restoreFetch() })

  const res = mockRes()
  await postHit(hitReq(validBody({ operator: 'Totally Not OpenAI', category: 'seo_tool' })), res)

  const row = JSON.parse(fetchImpl.calls[0].opts.body)
  assert.strictEqual(row.operator, 'OpenAI', 'a caller must not be able to relabel a vendor')
  assert.strictEqual(row.category, 'llm_crawler', 'a caller must not be able to recategorise a bot')
})

// ── 2. no metering on this path ───────────────────────────────────────────────
test('2. the route imports no meter — claimPageviewUsage / claimConversionUsage are absent', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const raw = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'routes', 'server-crawler-hits.js'),
    'utf8'
  )
  // COMMENTS STRIPPED FIRST. The route's header explains at length why it does not call
  // dualWriteEvent or either meter, so a scan of the raw file matches its own prose and
  // fails on a correct file — which is exactly what happened when this test was first
  // run. Scan the code.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  // Static, not behavioural, on purpose: a meter is only observable through a mock, and a
  // mock proves nothing about the meter that gets added next month. The source assertion
  // fails the moment anyone wires one in, which is the actual invariant.
  assert.ok(!/claimPageviewUsage/.test(src), 'a crawler fetch must never consume the pageview allowance')
  assert.ok(!/claimConversionUsage/.test(src), 'a crawler fetch is not a conversion')
  assert.ok(!/pageview-limits|conversion-limits/.test(src), 'the meters must not even be imported here')
  assert.ok(!/dualWriteEvent/.test(src), 'crawler hits must never enter the events table')
  // Guard the guard: if the strip ever eats the whole file the assertions above pass
  // vacuously, which would be this test lying about the thing it exists to prove.
  assert.ok(/writeCrawlerHit/.test(src) && /crawler_hits/.test(src), 'the stripped source must still contain the route body')
})

test('2b. a valid hit issues exactly one Tinybird write and no second network call', async (t) => {
  installSupabase({ apiKeyRow: keyRow([SCOPE_WRITE_CRAWLER_HITS]) })
  const fetchImpl = recordingFetch()
  installFetch(fetchImpl)
  t.after(() => { restoreSupabase(); restoreFetch() })

  await postHit(hitReq(), mockRes())
  assert.strictEqual(fetchImpl.calls.length, 1, 'no meter call, no second write')
})

// ── 3. scope enforcement ──────────────────────────────────────────────────────
test('3. a key with [write:crawler_hits] is accepted', async (t) => {
  installSupabase({ apiKeyRow: keyRow(['write:crawler_hits']) })
  installFetch(recordingFetch())
  t.after(() => { restoreSupabase(); restoreFetch() })

  const res = mockRes()
  await postHit(hitReq(), res)
  assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body))
})

test('3b. a key with [write:events] is DENIED 403 — write:events does not imply crawler hits', async (t) => {
  installSupabase({ apiKeyRow: keyRow(['write:events']) })
  const fetchImpl = recordingFetch()
  installFetch(fetchImpl)
  t.after(() => { restoreSupabase(); restoreFetch() })

  const res = mockRes()
  await postHit(hitReq(), res)

  assert.strictEqual(res.statusCode, 403, 'the events scope must not carry over to this route')
  assert.match(res.body.error, /write:crawler_hits/, 'the error names the scope that is required')
  assert.strictEqual(fetchImpl.calls.length, 0, 'nothing may be written on a denied request')
})

test('3c. a key with [] (the DB default) is DENIED 403 — fail-closed', async (t) => {
  installSupabase({ apiKeyRow: keyRow([]) })
  installFetch(recordingFetch())
  t.after(() => { restoreSupabase(); restoreFetch() })

  const res = mockRes()
  await postHit(hitReq(), res)
  assert.strictEqual(res.statusCode, 403)
})

test('3d. a NULL scopes column (a legacy row) is DENIED 403', async (t) => {
  installSupabase({ apiKeyRow: keyRow(null) })
  installFetch(recordingFetch())
  t.after(() => { restoreSupabase(); restoreFetch() })

  const res = mockRes()
  await postHit(hitReq(), res)
  assert.strictEqual(res.statusCode, 403)
})

test('3e. a missing or unknown API key is 401, and writes nothing', async (t) => {
  installSupabase({ apiKeyRow: null })
  const fetchImpl = recordingFetch()
  installFetch(fetchImpl)
  t.after(() => { restoreSupabase(); restoreFetch() })

  const noAuth = mockRes()
  await postHit({ headers: {}, body: validBody(), socket: {} }, noAuth)
  assert.strictEqual(noAuth.statusCode, 401)

  const unknown = mockRes()
  await postHit(hitReq(), unknown)
  assert.strictEqual(unknown.statusCode, 401)

  assert.strictEqual(fetchImpl.calls.length, 0)
})

test('3f. write:crawler_hits is grantable but is NOT in the app default', () => {
  assert.ok(VALID_API_KEY_SCOPES.includes('write:crawler_hits'), 'it must be mintable')
  assert.ok(
    !DEFAULT_API_KEY_SCOPES.includes('write:crawler_hits'),
    'adding it to the app default would silently widen every key created without explicit scopes'
  )
  assert.deepStrictEqual(
    [...VALID_API_KEY_SCOPES],
    ['write:events', 'write:crawler_hits', 'read:analytics'],
    'the vocabulary is pinned — a fourth value is a design decision, not a detail'
  )
})

test('3g. a plan without api_access is refused 402', async (t) => {
  installSupabase({ apiKeyRow: keyRow([SCOPE_WRITE_CRAWLER_HITS]), plan: 'free' })
  const fetchImpl = recordingFetch()
  installFetch(fetchImpl)
  t.after(() => { restoreSupabase(); restoreFetch() })

  const res = mockRes()
  await postHit(hitReq(), res)
  assert.strictEqual(res.statusCode, 402)
  assert.strictEqual(fetchImpl.calls.length, 0)
})

// ── 4. fail-open on a bad payload, WITHOUT a fake success ─────────────────────
// The producer swallows the response and degrades to silence on any error, so a 4xx here
// would only fill a customer's logs with something they cannot act on. The status stays
// 200; the BODY is what has to stay honest.
for (const [label, body, reason] of [
  ['an unknown bot name', validBody({ bot_name: 'DefinitelyNotABot' }), 'unknown_bot'],
  ['a missing bot name', validBody({ bot_name: undefined }), 'unknown_bot'],
  ['an invalid verification', validBody({ verification: 'verified' }), 'invalid_verification'],
  ['a missing verification', validBody({ verification: undefined }), 'invalid_verification'],
  ['an unknown collection source', validBody({ collection_source: 'carrier_pigeon' }), 'invalid_collection_source'],
  ['an empty body', {}, 'unknown_bot']
]) {
  test(`4. ${label} → 200 recorded:false reason=${reason}, and nothing is written`, async (t) => {
    installSupabase({ apiKeyRow: keyRow([SCOPE_WRITE_CRAWLER_HITS]) })
    const fetchImpl = recordingFetch()
    installFetch(fetchImpl)
    t.after(() => { restoreSupabase(); restoreFetch() })

    const res = mockRes()
    await postHit(hitReq(body), res)

    assert.strictEqual(res.statusCode, 200, 'fail-open: the producer must not see an error it cannot act on')
    assert.strictEqual(res.body.data.recorded, false, 'and it must NOT claim a write that did not happen')
    assert.strictEqual(res.body.data.reason, reason)
    assert.strictEqual(fetchImpl.calls.length, 0, 'a rejected payload writes nothing')
  })
}

test('4b. a null body fails open rather than throwing a 500', async (t) => {
  installSupabase({ apiKeyRow: keyRow([SCOPE_WRITE_CRAWLER_HITS]) })
  installFetch(recordingFetch())
  t.after(() => { restoreSupabase(); restoreFetch() })

  const res = mockRes()
  await postHit({ headers: { authorization: 'Bearer k' }, body: undefined, socket: {} }, res)

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.data.recorded, false)
  assert.strictEqual(res.body.data.reason, 'missing_payload')
})

test('4c. an unrecognised verification is DROPPED, never downgraded to ua_only', () => {
  const built = buildCrawlerHitRow(validBody({ verification: 'probably_fine' }), SITE_ID)
  assert.strictEqual(built.ok, false)
  assert.strictEqual(built.reason, 'invalid_verification')
  assert.strictEqual(built.row, undefined, 'coercing to a valid verdict would fabricate one nobody reached')
})

test('4d. all four verification values survive the round trip, distinctly', () => {
  for (const value of Object.values(VERIFICATION)) {
    const built = buildCrawlerHitRow(validBody({ verification: value }), SITE_ID)
    assert.strictEqual(built.ok, true, `${value} must be accepted`)
    assert.strictEqual(built.row.verification, value, `${value} must be stored verbatim, never collapsed`)
  }
})

test('4e. an out-of-range status code becomes 0 rather than wrapping the UInt16 column', () => {
  assert.strictEqual(buildCrawlerHitRow(validBody({ status_code: 70000 }), SITE_ID).row.status_code, 0)
  assert.strictEqual(buildCrawlerHitRow(validBody({ status_code: -1 }), SITE_ID).row.status_code, 0)
  assert.strictEqual(buildCrawlerHitRow(validBody({ status_code: 'abc' }), SITE_ID).row.status_code, 0)
  assert.strictEqual(buildCrawlerHitRow(validBody({ status_code: 404 }), SITE_ID).row.status_code, 404)
})

test('4f. an unparseable timestamp falls back to now rather than dropping the hit', () => {
  const built = buildCrawlerHitRow(validBody({ timestamp: 'not-a-date' }), SITE_ID)
  assert.strictEqual(built.ok, true, 'the fetch was still real — only its clock is missing')
  assert.ok(!Number.isNaN(Date.parse(built.row.timestamp)))
})

// ── 4g. producer/consumer lockstep ────────────────────────────────────────────
// The middleware and this route were written together, so nothing catches them drifting
// apart except a test that runs one into the other. This drives the REAL producer output
// (including its default collectionSource, changed from 'server_api' to 'edge_middleware'
// when this route landed) through the REAL consumer.
test('4g. a payload built by the shipped middleware is accepted verbatim by the route', async () => {
  const { createCrawlerMiddleware } = await import('../../integrations/express-crawler-middleware.js')

  const sent = []
  const mw = createCrawlerMiddleware({
    apiKey: 'k',
    endpoint: 'https://api.example/hit',
    fetchImpl: async (_url, opts) => { sent.push(JSON.parse(opts.body)); return { ok: true, status: 200 } }
  })

  const { EventEmitter } = await import('node:events')
  const res = new EventEmitter()
  res.statusCode = 200
  mw({ headers: { 'user-agent': 'Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)' }, originalUrl: '/blog/post?utm_source=x', socket: {} }, res, () => {})
  res.emit('finish')
  await new Promise((r) => setImmediate(() => setImmediate(r)))

  assert.strictEqual(sent.length, 1, 'the middleware should have reported one hit')

  const built = buildCrawlerHitRow(sent[0], SITE_ID)
  assert.strictEqual(built.ok, true, `the route rejected the middleware's own payload: ${built.reason}`)
  assert.strictEqual(built.row.bot_name, 'GPTBot')
  assert.strictEqual(built.row.collection_source, 'edge_middleware', "the middleware's default must be a value the route accepts")
  assert.strictEqual(built.row.path, '/blog/post')
  assert.strictEqual(built.row.verification, VERIFICATION.UA_ONLY, 'a customer install has no ranges — ua_only is the honest ceiling')
})

// ── 5. a failed write is never a success ──────────────────────────────────────
test('5. a non-2xx from Tinybird is a 502 — not a 200 over a dropped row (#413)', async (t) => {
  installSupabase({ apiKeyRow: keyRow([SCOPE_WRITE_CRAWLER_HITS]) })
  installFetch(recordingFetch({ ok: false, status: 500 }))
  t.after(() => { restoreSupabase(); restoreFetch() })

  const res = mockRes()
  await postHit(hitReq(), res)

  assert.strictEqual(res.statusCode, 502, 'a caller that sees 2xx is entitled to believe the hit was stored')
  assert.strictEqual(res.body.success, false)
})

test('5b. a network failure is a 502, not a silent success', async (t) => {
  installSupabase({ apiKeyRow: keyRow([SCOPE_WRITE_CRAWLER_HITS]) })
  installFetch(async () => { throw new Error('ECONNRESET') })
  t.after(() => { restoreSupabase(); restoreFetch() })

  const res = mockRes()
  await postHit(hitReq(), res)
  assert.strictEqual(res.statusCode, 502)
})

test('5c. missing Tinybird env is a 502, never a 200 over a row with nowhere to go', async (t) => {
  installSupabase({ apiKeyRow: keyRow([SCOPE_WRITE_CRAWLER_HITS]) })
  const fetchImpl = recordingFetch()
  installFetch(fetchImpl)
  const savedHost = process.env.TINYBIRD_HOST
  delete process.env.TINYBIRD_HOST
  t.after(() => { process.env.TINYBIRD_HOST = savedHost; restoreSupabase(); restoreFetch() })

  const res = mockRes()
  await postHit(hitReq(), res)

  assert.strictEqual(res.statusCode, 502)
  assert.strictEqual(fetchImpl.calls.length, 0)
})
