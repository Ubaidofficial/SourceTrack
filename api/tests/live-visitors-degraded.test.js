// GET /api/live/visitors must never report a dead read as "nobody is online".
//
// The panel this feeds prints "No active visitors in the last 5 minutes" on an empty list.
// The route originally collapsed BOTH a served-empty result ([]) and a dead read (null,
// per §5) into [], so an undeployed pipe made the UI assert ABSENCE while the live counter
// next to it showed N visitors. Same table, same 5-minute window — they cannot legitimately
// disagree, so the panel was stating something the app could not know (§6: no fake zeros).
//
// These tests pin the distinction: [] => degraded false (truthful empty), null or throw
// => degraded true (unknown). If someone reintroduces `rows ?? []`, the null case flips
// degraded to false and this fails.

import test from 'node:test'
import assert from 'node:assert/strict'
import liveRouter, { __setLiveReadDeps, __resetLiveReadDeps } from '../routes/live.js'

// Pull the GET '/visitors' handler straight off the router stack — no server needed.
function visitorsHandler () {
  const layer = liveRouter.stack.find(
    l => l.route?.path === '/visitors' && l.route?.methods?.get
  )
  assert.ok(layer, 'GET /visitors route should be registered on the live router')
  return layer.route.stack[layer.route.stack.length - 1].handle
}

function mockRes () {
  return {
    statusCode: 200,
    body: null,
    status (code) { this.statusCode = code; return this },
    json (payload) { this.body = payload; return this }
  }
}

const REQ = { site: { id: 'site-abc' } }

async function invoke () {
  const res = mockRes()
  await visitorsHandler()(REQ, res)
  return res
}

test('served-empty ([]) reports degraded:false — a truthful empty room', async () => {
  __setLiveReadDeps({ queryTinybird: async () => [] })
  try {
    const res = await invoke()
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body.data.visitors, [])
    assert.equal(res.body.data.degraded, false,
      'an empty window is KNOWN to be empty and must not be flagged degraded')
  } finally { __resetLiveReadDeps() }
})

test('dead read (null) reports degraded:true and NEVER a bare empty success', async () => {
  __setLiveReadDeps({ queryTinybird: async () => null })
  try {
    const res = await invoke()
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.body.data.visitors, [], 'no fabricated rows')
    assert.equal(res.body.data.degraded, true,
      'null is a DEAD READ, not "nobody online" — regression guard for `rows ?? []`')
  } finally { __resetLiveReadDeps() }
})

test('a thrown read also reports degraded:true, not an empty room', async () => {
  __setLiveReadDeps({ queryTinybird: async () => { throw new Error('pipe exploded') } })
  try {
    const res = await invoke()
    assert.equal(res.body.data.degraded, true)
    assert.deepEqual(res.body.data.visitors, [])
  } finally { __resetLiveReadDeps() }
})

test('real rows are mapped and reported as not degraded', async () => {
  __setLiveReadDeps({
    queryTinybird: async () => [{
      distinct_id: 'v1',
      current_page: 'https://example.com/pricing',
      country: 'ES',
      device_type: 'mobile',
      utm_source: null,
      ai_source: 'chatgpt.com',
      referrer: 'https://www.google.com/',
      last_seen: '2026-07-27T10:00:00Z'
    }]
  })
  try {
    const res = await invoke()
    assert.equal(res.body.data.degraded, false)
    assert.equal(res.body.data.visitors.length, 1)
    const v = res.body.data.visitors[0]
    assert.equal(v.id, 'v1')
    assert.equal(v.country, 'ES')
    assert.equal(v.is_ai, true)
    assert.equal(v.source, 'chatgpt.com', 'ai_source wins over the referrer host')
  } finally { __resetLiveReadDeps() }
})

test('under TINYBIRD_FORCE_READ a dead read fails CLOSED with 500, never degraded-200', async () => {
  const prev = process.env.TINYBIRD_FORCE_READ
  process.env.TINYBIRD_FORCE_READ = 'true'
  __setLiveReadDeps({ queryTinybird: async () => null })
  try {
    const res = await invoke()
    assert.equal(res.statusCode, 500,
      'the dispatch-proof harness must not get a false green from a 200')
    assert.equal(res.body.success, false)
  } finally {
    __resetLiveReadDeps()
    if (prev === undefined) delete process.env.TINYBIRD_FORCE_READ
    else process.env.TINYBIRD_FORCE_READ = prev
  }
})

test('missing site context is a 400 — tenant scope is never assumed', async () => {
  const res = mockRes()
  await visitorsHandler()({ site: null }, res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.success, false)
})
