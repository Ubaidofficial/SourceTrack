// Phase-1 read-cutover Wave-1 — live.js dispatch/fallback regression tests.
//
// Proves the load-bearing cutover contract on api/routes/live.js:
//   1. FALLBACK (flag off): queryTinybirdPipe returns null -> the HogQL path
//      runs -> response is the HogQL-derived value. Behavior unchanged.
//   2. DISPATCH (flag on, pipe returns rows): the Tinybird value is returned and
//      HogQL is NEVER called.
//   3. FAIL-CLOSED (TINYBIRD_FORCE_READ + pipe null): the route fails loudly
//      (500) instead of silently bypassing to HogQL — the anti-false-green guard.
//   4. Tenant isolation: the pipe is called with the AUTHENTICATED req.site.id.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const liveMod = await import('../routes/live.js')
const { __setLiveReadDeps, __resetLiveReadDeps } = liveMod
const router = liveMod.default

// Pull the GET '/' handler out of the router stack.
const handler = router.stack.find(l => l.route && l.route.path === '/').route.stack[0].handle

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}
const reqWithSite = (id = 'site-00') => ({ site: { id } })

// A queryHogQL stub returning the positional-array shape live.js expects ([[n]]).
function hogStub (value, calls) {
  return async (_sql, _name) => { calls.push(_name); return [[value]] }
}
// A queryTinybirdPipe stub returning named-object rows, or null.
function tbStub (rowsOrNull, calls) {
  return async (pipe, params) => { calls.push({ pipe, params }); return rowsOrNull }
}

test('live.js — D1b: pipe null (no FORCE_READ) -> soft-fail 200/live_visitors:0, HogQL NOT called', async () => {
  // D1b deleted the HogQL fallback. A null pipe throws; live.js's catch soft-fails this non-critical
  // realtime widget to 0 (a valid live count) in prod — it does NOT read HogQL. (Under FORCE_READ the
  // next test proves it 500s loud instead.)
  const tbCalls = []; const hogCalls = []
  __setLiveReadDeps({
    queryTinybird: tbStub(null, tbCalls),          // mirrors flag-off / not-serving real client
    queryHog: hogStub(7, hogCalls)
  })
  try {
    const res = mockRes()
    await handler(reqWithSite(), res)
    assert.strictEqual(res.statusCode, 200, 'soft-fail keeps the realtime widget alive')
    assert.strictEqual(res.body.data.live_visitors, 0, 'null pipe -> 0 (no HogQL dead-store read)')
    assert.strictEqual(hogCalls.length, 0, 'HogQL was NOT called — the fallback is deleted')
    assert.strictEqual(tbCalls.length, 1, 'Tinybird was attempted first')
  } finally { __resetLiveReadDeps() }
})

test('live.js — DISPATCH: flag on (pipe rows) -> Tinybird value, HogQL NOT called', async () => {
  const tbCalls = []; const hogCalls = []
  __setLiveReadDeps({
    queryTinybird: tbStub([{ live_visitors: 42 }], tbCalls),
    queryHog: hogStub(7, hogCalls)                  // sentinel differs from Tinybird's 42
  })
  try {
    const res = mockRes()
    await handler(reqWithSite('site-00'), res)
    assert.strictEqual(res.body.data.live_visitors, 42, 'Tinybird value surfaces (not HogQL 7)')
    assert.strictEqual(hogCalls.length, 0, 'HogQL was NOT called — Tinybird path exercised')
    // Tenant isolation: pipe called with the authenticated site id.
    assert.deepStrictEqual(tbCalls[0], { pipe: 'live_visitors_bag', params: { site_id: 'site-00' } })
  } finally { __resetLiveReadDeps() }
})

test('live.js — FAIL-CLOSED: TINYBIRD_FORCE_READ + pipe null -> 500, no silent HogQL bypass', async () => {
  const tbCalls = []; const hogCalls = []
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setLiveReadDeps({
    queryTinybird: tbStub(null, tbCalls),          // pipe yielded nothing under force
    queryHog: hogStub(7, hogCalls)
  })
  try {
    const res = mockRes()
    await handler(reqWithSite(), res)
    assert.strictEqual(res.statusCode, 500, 'fails loudly under force-read')
    assert.strictEqual(res.body.success, false)
    assert.strictEqual(hogCalls.length, 0, 'did NOT silently fall back to HogQL (anti-false-green)')
  } finally {
    delete process.env.TINYBIRD_FORCE_READ
    __resetLiveReadDeps()
  }
})

test('live.js — FORCE_READ pass-through: pipe rows still return Tinybird value', async () => {
  const tbCalls = []; const hogCalls = []
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setLiveReadDeps({
    queryTinybird: tbStub([{ live_visitors: 5 }], tbCalls),
    queryHog: hogStub(7, hogCalls)
  })
  try {
    const res = mockRes()
    await handler(reqWithSite(), res)
    assert.strictEqual(res.body.data.live_visitors, 5)
    assert.strictEqual(hogCalls.length, 0)
  } finally {
    delete process.env.TINYBIRD_FORCE_READ
    __resetLiveReadDeps()
  }
})

test('live.js — missing site context -> 400 (auth guard intact)', async () => {
  const res = mockRes()
  await handler({}, res)
  assert.strictEqual(res.statusCode, 400)
  assert.strictEqual(res.body.success, false)
})
