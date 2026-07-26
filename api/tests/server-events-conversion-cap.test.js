// MONETIZATION RAIL — POST /api/server/event conversion METERING.
//
// THE GAP THIS FILE ORIGINALLY CLOSED: server-events.js was the ONE ingestion path with no
// plan-cap gate at all. Its only middleware is trackGlobalIpLimit, which is an IP rate
// limit, not a plan cap, and claimConversionUsage appeared nowhere in the file — so a
// conversion through the documented public API was never even counted.
//
// SUPERSEDED IN PART (founder decision 2026-07-26): the metering stays, the REJECTION goes.
// Conversions are never refused on quota, on any tier, because a dropped conversion is a
// permanently wrong revenue number. The 402 these tests used to assert is gone, and with it
// the 2026-07-25 "402 for a first-party client vs 200 {ignored} for a webhook sender"
// contract — that distinction only mattered while something was being dropped, and now
// nothing is. What REMAINS load-bearing, and is still asserted below, is that every
// conversion on this route is COUNTED, and counted against the right site.
//
// WHAT COUNTS AS A CONVERSION HERE IS THE PAYLOAD, NOT THE EVENT NAME. The public contract
// (dashboard/src/pages/developers/DevelopersApi.jsx:173) documents `event` as a free-form
// label — "Event label. Defaults to $pageview" — and its own worked example posts
// `"event": "purchase_completed"` with `"conversion_value": 149.00`. A meter keyed on
// `event === '$conversion'` would therefore miss the DOCUMENTED EXAMPLE entirely. That is
// the specific mistake these tests exist to prevent; several assert on a non-canonical
// event name on purpose, and that intent is unchanged by the decision above.
//
// FAIL-OPEN on a meter DB error is deliberate and matches every sibling: an outage must not
// become an ingestion outage on the money rail.

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getSupabase } = await import('../lib/supabase.js')
const { serverEventsRouter } = await import('../routes/server-events.js')

const SITE_ID = 'site-under-test'

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

// `rpcMode`: 'at-cap' | 'under-cap' | 'throw'. rpcCalls records every claim attempt so a
// test can assert the cap was consulted AND scoped to the right site.
function install ({ rpcMode = 'under-cap', plan = 'growth', rpcCalls = [] } = {}) {
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
      const chain = {
        select: () => chain,
        eq: () => chain,
        // NOTE: the route selects ONLY `plan` here — no `id`. claimConversionUsage THROWS
        // when site.id is missing, and that throw would be swallowed by the fail-open
        // catch, producing a gate that silently never blocks. The (under-cap-*) and
        // (at-cap) tests below would both pass a broken implementation if they only
        // checked status, which is why they also assert on the recorded p_site_id.
        maybeSingle: async () => ({ data: { plan }, error: null })
      }
      return chain
    }
    return _realFrom(table)
  }
  _client.rpc = async (fn, params) => {
    rpcCalls.push({ fn, params })
    if (rpcMode === 'throw') throw new Error('simulated RPC/DB outage')
    const allowed = rpcMode !== 'at-cap'
    return { data: [{ allowed, current_count: allowed ? 5 : 750 }], error: null }
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

// A conversion as the PUBLIC DOCS document it — free-form event label + conversion_value.
const DOCUMENTED_CONVERSION = { event: 'purchase_completed', anonymous_id: 'anon-1', conversion_value: 149.0 }

// ── the gap ───────────────────────────────────────────────────────────────────

test('🔴 at cap: a documented conversion is METERED AND INGESTED, never rejected', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  const res = mockRes()
  await postEvent(req(DOCUMENTED_CONVERSION), res)

  // Was: 402 + error_code 'conversion_limit_reached'. Conversions are metering-only now —
  // refusing one destroys real revenue, and the 402/200-{ignored} contract distinction only
  // existed while something was being dropped.
  assert.strictEqual(res.statusCode, 200,
    'a site at its cap must still ingest the conversion — dropping it is permanently wrong revenue')
  assert.strictEqual(res.body.data.received, true)
  assert.notStrictEqual(res.body.error_code, 'conversion_limit_reached')

  // STILL LOAD-BEARING: it must be counted, and counted against the right site. The route
  // selects only `plan`, so a naive claimConversionUsage(site) would pass id=undefined,
  // throw, and be swallowed by the fail-open catch — a meter that silently counts nothing.
  assert.strictEqual(calls.length, 1, 'the meter must actually run')
  assert.strictEqual(calls[0].fn, 'claim_site_conversion_usage')
  assert.strictEqual(calls[0].params.p_site_id, SITE_ID)
})

test('🔴 at cap: repeated conversions all keep being ingested and counted', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  // Pre-#419 every one of these was unmetered; between #419 and this change every one was
  // DESTROYED. Now each is both counted and kept.
  for (let i = 0; i < 5; i++) {
    const res = mockRes()
    await postEvent(req({ ...DOCUMENTED_CONVERSION, anonymous_id: `anon-${i}` }), res)
    assert.strictEqual(res.statusCode, 200, `conversion #${i + 1} must still be ingested`)
  }
  assert.strictEqual(calls.length, 5, 'and every one of them metered')
})

test('at cap: conversion_type alone (no value) is still metered', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  const res = mockRes()
  await postEvent(req({ event: 'signup', anonymous_id: 'a', conversion_type: 'lead' }), res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(calls.length, 1, 'conversion_type marks a conversion even with no monetary value')
  assert.strictEqual(calls[0].fn, 'claim_site_conversion_usage')
})

test('at cap: an explicit conversion_value of 0 is still metered', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  // A $0 lead conversion is a conversion. Metering keyed on truthiness would miss it.
  const res = mockRes()
  await postEvent(req({ event: 'free_signup', anonymous_id: 'a', conversion_value: 0 }), res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(calls.length, 1, 'conversion_value: 0 must not slip past the meter')
  assert.strictEqual(calls[0].fn, 'claim_site_conversion_usage')
})

// ── what must NOT be gated ────────────────────────────────────────────────────

// UPDATED when the pageview cap landed. The INTENT of both tests below is unchanged and still
// load-bearing — the CONVERSION meter must not touch a non-conversion — but their original
// assertions (`statusCode === 200`, `calls.length === 0`) also happened to encode the fact that
// non-conversions were metered by NOTHING. That was the open hole, now closed, so those two
// assertions are narrowed to the conversion meter specifically rather than deleted. See
// api/tests/server-events-pageview-cap.test.js for the pageview side.
const CONV_RPC = 'claim_site_conversion_usage'
const conversionClaims = (calls) => calls.filter(c => c.fn === CONV_RPC)

test('pageviews do NOT consume conversion quota (metered separately)', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  // No conversion_value / conversion_type -> a plain event. The conversion cap must not
  // touch it even at cap; pageview volume is pageview-limits.js's job.
  const res = mockRes()
  await postEvent(req({ event: '$pageview', anonymous_id: 'anon-1', page_url: 'https://x.test/' }), res)

  assert.strictEqual(conversionClaims(calls).length, 0,
    'the conversion cap must not even be consulted for a non-conversion — one event, one meter')
  // (The 402 here now comes from the PAGEVIEW cap, which this fixture also pins at 'at-cap'.
  // That path is asserted in server-events-pageview-cap.test.js; what matters here is WHICH
  // meter was consulted, not the status.)
})

test('an event with no conversion payload at all does not touch the conversion meter', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  const res = mockRes()
  await postEvent(req({ event: 'app_opened', anonymous_id: 'anon-1' }), res)
  assert.strictEqual(conversionClaims(calls).length, 0)
  assert.notStrictEqual(res.body?.error_code, 'conversion_limit_reached',
    'a custom event must never be rejected AS A CONVERSION')
})

// ── under cap + tenant scoping ────────────────────────────────────────────────

test('under cap: the conversion is ingested AND claimed against the right site', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'under-cap' })

  const res = mockRes()
  await postEvent(req(DOCUMENTED_CONVERSION), res)

  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(res.body.data.received, true)
  assert.strictEqual(calls.length, 1, 'an allowed conversion still consumes one unit of quota')
  // The load-bearing assertion: the route selects only `plan`, so a naive
  // claimConversionUsage(site) would pass id=undefined, throw, and fail open forever.
  assert.strictEqual(calls[0].params.p_site_id, SITE_ID,
    'the claim must carry the API key\'s site id — undefined here means the gate never blocks')
})

// ── fail-open, matching all seven siblings ────────────────────────────────────

test('a limit-check DB outage FAILS OPEN (ingestion continues)', async (t) => {
  t.after(restore)
  install({ rpcMode: 'throw' })

  const res = mockRes()
  await postEvent(req(DOCUMENTED_CONVERSION), res)

  assert.strictEqual(res.statusCode, 200,
    'a limit-check outage must not become an ingestion outage — every sibling fails open here')
  assert.strictEqual(res.body.data.received, true)
})

// ── source guard: the gate must not be keyed on the event NAME ────────────────

test('the meter is not keyed on the canonical event name alone', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const url = await import('node:url')
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..')
  const src = fs.readFileSync(path.join(root, 'api/routes/server-events.js'), 'utf8')

  assert.ok(src.includes('claimConversionUsage('),
    'server-events.js must still METER conversions — it was the one unmetered ingestion path')

  // The discriminator must read the conversion PAYLOAD, not just the event name. Isolate the
  // isConversion expression itself rather than a byte window, so this cannot drift.
  const m = src.match(/const isConversion =([\s\S]*?)\n\n/)
  assert.ok(m, 'the conversion discriminator must be a named `isConversion` expression')
  const expr = m[1]
  assert.ok(expr.includes('conversion_value'), 'must consider conversion_value')
  assert.ok(expr.includes('conversion_type'), 'must consider conversion_type')
  assert.ok(!/conversion_value\s*\|\|/.test(expr) && !/conversion_type\s*\|\|/.test(expr),
    'must use != null, not truthiness — a conversion_value of 0 is a real $0 conversion and must still meter')

  // The 2026-07-25 402 contract used to be pinned here. It is deliberately GONE: conversions
  // are never refused on quota, so there is no capped-caller response left to shape. The
  // inverse is now asserted in api/tests/conversion-quota-never-drops.test.js, which requires
  // 'conversion_limit_reached' to be absent from every enforcement site.
  assert.ok(!src.includes("error_code: 'conversion_limit_reached'"),
    'the conversion refusal is removed — a 402 here would destroy real revenue')
})
