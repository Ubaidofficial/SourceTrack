// MONETIZATION RAIL — POST /api/server/event PAGEVIEW-cap enforcement.
//
// THE GAP (reproduced below before it was fixed): #419 closed the CONVERSION hole on this route
// and deliberately left the PAGEVIEW hole open. claimPageviewUsage appeared nowhere in
// server-events.js, so a site sitting at its monthly pageview cap could ingest unlimited
// pageviews through the documented public API. Pageviews are the PRIMARY metering unit on every
// plan (5k/10k/50k/150k/500k), so this was the larger of the two holes.
//
// ── THE DISCRIMINATOR: every non-conversion event meters (founder-decided 2026-07-25) ────────
// This route meters the COMPLEMENT of #419's conversion test, not a literal `$pageview` name.
// The reason is the same trap #419 hit, inverted: DevelopersApi.jsx documents `event` as a
// free-form label, so a caller sending {"event":"page_view"} (no $) would evade a literal-name
// gate entirely — shipping a second unmetered path immediately after closing the first. There is
// no name-based discriminator that closes this, because the name is caller-supplied: gating on a
// pageview-ish PATTERN still leaves {"event":"x"} free. Complement-of-conversion is the only rule
// under which every event on this route hits exactly one meter and nothing is unmetered.
//
// KNOWN AND ACCEPTED DIVERGENCE, pinned by the last two tests so a consistency pass cannot quietly
// revert it: the TRACKER paths meter only a literal `$pageview` (track.js:329, proxy.js:72), so the
// same custom event costs 0 via the tracker and 1 unit via this API. pageview-limits.js:8 says
// "Only called for true $pageview events" — true and meaningful on the tracker path, where OUR code
// picks the event name; meaningless here, where the caller does.
//
// FAIL-OPEN on a limit-check DB error is deliberate and matches every sibling
// (pageview-limits.js:12): an outage must not become an ingestion outage on the money rail.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getSupabase } = await import('../lib/supabase.js')
const { serverEventsRouter } = await import('../routes/server-events.js')
const { storeIdentityLink } = await import('../lib/identity-links.js')

const SITE_ID = 'site-under-test'
const PV_RPC = 'claim_site_pageview_usage'
const CONV_RPC = 'claim_site_conversion_usage'

const handlerFor = (router, path, method) => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.[method])
  assert.ok(layer, `${method.toUpperCase()} ${path} must exist`)
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const postEvent = handlerFor(serverEventsRouter, '/event', 'post')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

const _client = getSupabase()
const _realFrom = _client.from.bind(_client)
const _realRpc = _client.rpc ? _client.rpc.bind(_client) : undefined

// `identityWrites` records storeIdentityLink side effects so a test can prove the gate runs
// BEFORE them — a blocked event must leave nothing behind.
const identityWrites = []

function install ({ rpcMode = 'under-cap', plan = 'growth', pvLimit, rpcCalls = [] } = {}) {
  identityWrites.length = 0
  _client.from = (table) => {
    if (table === 'api_keys') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { id: 'key-1', site_id: SITE_ID, scopes: ['write:events'] }, error: null }),
        update: () => ({ eq: async () => ({ data: null, error: null }) })
      }
      return chain
    }
    if (table === 'sites') {
      // The mock HONORS the select list, returning only the requested columns — exactly what
      // PostgREST does. A permissive mock that returns every column regardless would hide the
      // whole class of bug this file exists to catch: #419's site.id trap and the pv_limit
      // override both come from a column the route forgot to SELECT. (Verified: with a
      // permissive mock, deleting `pv_limit` from the route's select still passed.)
      const row = { plan, ...(pvLimit === undefined ? {} : { pv_limit: pvLimit }) }
      const chain = {
        select: (cols) => {
          const want = String(cols || '').split(',').map(s => s.trim()).filter(Boolean)
          chain._row = want.length
            ? Object.fromEntries(Object.entries(row).filter(([k]) => want.includes(k)))
            : row
          return chain
        },
        eq: () => chain,
        maybeSingle: async () => ({ data: chain._row ?? row, error: null })
      }
      return chain
    }
    if (table === 'identity_links') {
      const chain = {
        upsert: async (row) => { identityWrites.push(row); return { data: null, error: null } },
        select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: null })
      }
      return chain
    }
    return _realFrom(table)
  }
  _client.rpc = async (fn, params) => {
    rpcCalls.push({ fn, params })
    if (rpcMode === 'throw') throw new Error('simulated RPC/DB outage')
    const allowed = rpcMode !== 'at-cap'
    return { data: [{ allowed, current_count: allowed ? 5 : 150000 }], error: null }
  }
  return rpcCalls
}
function restore () {
  _client.from = _realFrom
  if (_realRpc) _client.rpc = _realRpc
}

const req = (body) => ({
  headers: { authorization: 'Bearer st_live_test_token', 'user-agent': 'node' },
  body,
  socket: {}
})

const pvCalls = (calls) => calls.filter(c => c.fn === PV_RPC)
const convCalls = (calls) => calls.filter(c => c.fn === CONV_RPC)

// ── THE GAP ───────────────────────────────────────────────────────────────────────────────────

test('🔴 at cap: a canonical $pageview is REJECTED, not silently ingested', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  const res = mockRes()
  await postEvent(req({ event: '$pageview', anonymous_id: 'anon-1', page_url: 'https://x.test/' }), res)

  assert.notStrictEqual(res.statusCode, 200,
    'a site at its monthly pageview cap must not ingest another pageview through the server API')
  assert.strictEqual(res.statusCode, 402)
  assert.strictEqual(res.body.success, false)
  assert.strictEqual(res.body.data, null)
  assert.strictEqual(res.body.error_code, 'pageview_limit_reached',
    'the structured code is the contract — callers branch on it, not on the prose')
  assert.notStrictEqual(res.body.data?.received, true, 'must never claim received:true while dropping')
  assert.strictEqual(pvCalls(calls).length, 1, 'the pageview cap must actually be consulted')
})

test('🔴 at cap: {"event":"page_view"} — the no-$ evasion — is ALSO metered', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  const res = mockRes()
  await postEvent(req({ event: 'page_view', anonymous_id: 'anon-1' }), res)

  assert.strictEqual(res.statusCode, 402,
    'a literal-$pageview gate would let this through — the exact second hole this route must not ship')
  assert.strictEqual(pvCalls(calls).length, 1)
})

test('🔴 at cap: an event with NO `event` field is metered (docs say it defaults to $pageview)', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  const res = mockRes()
  await postEvent(req({ anonymous_id: 'anon-1', page_url: 'https://x.test/' }), res)

  // dualWriteEvent stores `req.body.event || '$pageview'`, so this IS a pageview once written.
  assert.strictEqual(res.statusCode, 402)
  assert.strictEqual(pvCalls(calls).length, 1)
})

test('🔴 at cap: repeated pageviews stay blocked (the unmetered-forever case)', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  for (let i = 0; i < 3; i++) {
    const res = mockRes()
    await postEvent(req({ event: '$pageview', anonymous_id: `anon-${i}` }), res)
    assert.strictEqual(res.statusCode, 402, `pageview ${i + 1} must stay blocked`)
  }
  assert.strictEqual(pvCalls(calls).length, 3, 'every attempt consults the cap; none slips through')
})

// ── THE ACCEPTED DIVERGENCE — pinned so a "consistency pass" cannot silently revert it ────────

test('🔴 at cap: a CUSTOM event is metered too (complement-of-conversion, by decision)', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  const res = mockRes()
  await postEvent(req({ event: 'button_clicked', anonymous_id: 'anon-1' }), res)

  assert.strictEqual(res.statusCode, 402,
    'DELIBERATE: `event` is caller-supplied here, so any name-based gate is evadable. Metering the ' +
    'complement of the conversion test is the only rule under which nothing on this route is ' +
    'unmetered. This DIVERGES from track.js:329 / proxy.js:72, which meter only a literal $pageview.')
  assert.strictEqual(pvCalls(calls).length, 1)
})

test('🔴 the route does NOT gate on a literal event name (the whole point)', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  for (const name of ['$pageview', 'page_view', 'pageview', 'app_opened', 'PageView', '']) {
    const res = mockRes()
    await postEvent(req({ event: name, anonymous_id: 'a' }), res)
    assert.strictEqual(res.statusCode, 402, `event="${name}" must meter — no name is exempt`)
  }
  assert.strictEqual(pvCalls(calls).length, 6)
})

// ── OVER-GATING GUARDS — these must keep passing ─────────────────────────────────────────────

test('a CONVERSION is metered by the conversion cap only — never double-charged', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'under-cap' })

  const res = mockRes()
  await postEvent(req({ event: 'purchase_completed', anonymous_id: 'anon-1', conversion_value: 149.0 }), res)

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(convCalls(calls).length, 1, 'the conversion meter runs')
  assert.strictEqual(pvCalls(calls).length, 0,
    'a conversion must NOT also consume pageview quota — one event, exactly one meter')
})

test('a conversion at the PAGEVIEW cap is still accepted (the meters are independent)', async (t) => {
  t.after(restore)
  // rpcMode at-cap makes BOTH meters report full; a conversion must only consult the conversion one.
  const calls = install({ rpcMode: 'under-cap' })
  _client.rpc = async (fn, params) => {
    calls.push({ fn, params })
    // pageview meter full, conversion meter has room
    const allowed = fn !== PV_RPC
    return { data: [{ allowed, current_count: allowed ? 1 : 999999 }], error: null }
  }

  const res = mockRes()
  await postEvent(req({ event: 'purchase_completed', conversion_value: 10, anonymous_id: 'a' }), res)
  assert.strictEqual(res.statusCode, 200, 'a full pageview quota must not block a conversion')
  assert.strictEqual(pvCalls(calls).length, 0)
})

test('under cap: the pageview is ingested AND claimed against the right site', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'under-cap' })

  const res = mockRes()
  await postEvent(req({ event: '$pageview', anonymous_id: 'anon-1' }), res)

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.data.received, true)
  assert.strictEqual(pvCalls(calls).length, 1, 'an allowed pageview still consumes one unit')
  // Same trap #419 hit: the route selects only `plan`, so a naive claimPageviewUsage(site) passes
  // id=undefined, THROWS, and is swallowed by the fail-open catch — a gate that never blocks.
  assert.strictEqual(pvCalls(calls)[0].params.p_site_id, SITE_ID,
    'the claim must carry the API key\'s site id — undefined here means the gate never blocks')
})

test('🔴 a per-site pv_limit override is honored, not the plan default', async (t) => {
  t.after(restore)
  // sites.pv_limit is "set by Stripe webhook from price metadata" — a Starter@50K site metered at
  // the plan default would be a BILLING error, not just a metering one. Same shape as #419's
  // site.id trap: a column the route forgot to select.
  // NOTE: 'growth', not 'starter' — starter has api_access:false, so a starter key is rejected by
  // requireFeature long before any meter runs. Only trial/growth/scale can reach this route at all.
  // 123456 differs from growth's 150_000 default, so this fails if the override is dropped.
  const calls = install({ rpcMode: 'under-cap', plan: 'growth', pvLimit: 123456 })

  const res = mockRes()
  await postEvent(req({ event: '$pageview', anonymous_id: 'a' }), res)

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(pvCalls(calls)[0].params.p_limit, 123456,
    'the route must SELECT pv_limit and pass it through — otherwise a purchased limit is ignored')
})

test('a limit-check DB outage FAILS OPEN (ingestion continues)', async (t) => {
  t.after(restore)
  install({ rpcMode: 'throw' })

  const res = mockRes()
  await postEvent(req({ event: '$pageview', anonymous_id: 'anon-1' }), res)

  assert.strictEqual(res.statusCode, 200,
    'a limit-check outage must not become an ingestion outage (pageview-limits.js:12)')
  assert.strictEqual(res.body.data.received, true)
})

test('🔴 a blocked event leaves NOTHING behind (gate runs before storeIdentityLink)', async (t) => {
  t.after(restore)
  install({ rpcMode: 'at-cap' })

  const res = mockRes()
  // user_id + a DIFFERENT anonymous_id is what triggers storeIdentityLink on the accepted path.
  await postEvent(req({ event: '$pageview', anonymous_id: 'anon-1', user_id: 'user-9' }), res)

  assert.strictEqual(res.statusCode, 402)
  assert.strictEqual(identityWrites.length, 0,
    'a rejected event must not have written an identity link — gate BEFORE side effects')
})

test('the 402 body shape matches #419 (first-party API contract, not the webhook 200 shape)', async (t) => {
  t.after(restore)
  install({ rpcMode: 'at-cap' })

  const res = mockRes()
  await postEvent(req({ event: '$pageview', anonymous_id: 'a' }), res)

  // Same founder-decided divergence #419 pinned: a first-party client can read and act on a 402,
  // and a 200 {received:true} while dropping the event is the #413 fake-success violation.
  assert.deepStrictEqual(Object.keys(res.body).sort(), ['data', 'error', 'error_code', 'success'])
  assert.strictEqual(typeof res.body.error, 'string')
  assert.ok(res.body.error.length > 0)
})
