// MONETIZATION RAIL — POST /api/server/event conversion-cap enforcement.
//
// THE GAP (reproduced below before it was fixed): server-events.js was the ONE ingestion
// path with no plan-cap gate. Its only middleware is trackGlobalIpLimit, which is an IP
// rate limit, not a plan cap, and claimConversionUsage appeared nowhere in the file. Seven
// sibling routes gate (track, conversion, conversion-offline, proxy, webhook-incoming,
// stripe-webhook, shopify-webhook), so a site at its monthly conversion cap could ingest
// unlimited conversions through the documented public API and never be metered.
//
// WHAT COUNTS AS A CONVERSION HERE IS THE PAYLOAD, NOT THE EVENT NAME. The public contract
// (dashboard/src/pages/developers/DevelopersApi.jsx:173) documents `event` as a free-form
// label — "Event label. Defaults to $pageview" — and its own worked example posts
// `"event": "purchase_completed"` with `"conversion_value": 149.00`. A gate keyed on
// `event === '$conversion'` would therefore let the DOCUMENTED EXAMPLE through unmetered.
// That is the specific mistake these tests exist to prevent; several assert on a
// non-canonical event name on purpose.
//
// FAIL-OPEN on a limit-check DB error is deliberate and matches all seven siblings: an
// outage must not become an ingestion outage on the money rail.

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

test('at cap: a documented conversion is REJECTED, not silently ingested', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  const res = mockRes()
  await postEvent(req(DOCUMENTED_CONVERSION), res)

  assert.notStrictEqual(res.statusCode, 200,
    'a site at its monthly conversion cap must not ingest another conversion through the server API')

  // FOUNDER-DECIDED CONTRACT (2026-07-25) — pinned deliberately. This DIVERGES from the
  // stripe/shopify webhook siblings' 200 {ignored:true}, and the divergence is the point:
  //   - 200 {ignored:true} is right for a THIRD-PARTY webhook sender (Stripe/Shopify retry
  //     on 4xx, so a 402 would loop forever) and wrong for a FIRST-PARTY API client, which
  //     can read and act on a 402.
  //   - a 200 saying received:true while the event is dropped is the #413 fake-success
  //     violation in a new place.
  // Do not "fix" this back to match the webhooks in a consistency pass.
  assert.strictEqual(res.statusCode, 402)
  assert.strictEqual(res.body.success, false)
  assert.strictEqual(res.body.data, null)
  assert.strictEqual(res.body.error, 'Conversion limit reached for your plan')
  assert.strictEqual(res.body.error_code, 'conversion_limit_reached',
    'the structured code is part of the contract — callers branch on it, not on the prose')
  assert.notStrictEqual(res.body.data?.received, true, 'must never claim received:true while dropping')
  assert.strictEqual(calls.length, 1, 'the cap must actually be consulted')
  assert.strictEqual(calls[0].fn, 'claim_site_conversion_usage')
})

test('at cap: repeated conversions stay blocked (the unmetered-forever case)', async (t) => {
  t.after(restore)
  install({ rpcMode: 'at-cap' })

  // Pre-fix, every one of these returned 200 {received:true} — unlimited paid usage.
  for (let i = 0; i < 5; i++) {
    const res = mockRes()
    await postEvent(req({ ...DOCUMENTED_CONVERSION, anonymous_id: `anon-${i}` }), res)
    assert.strictEqual(res.statusCode, 402, `conversion #${i + 1} must stay blocked`)
  }
})

test('at cap: conversion_type alone (no value) is still metered', async (t) => {
  t.after(restore)
  install({ rpcMode: 'at-cap' })

  const res = mockRes()
  await postEvent(req({ event: 'signup', anonymous_id: 'a', conversion_type: 'lead' }), res)
  assert.strictEqual(res.statusCode, 402, 'conversion_type marks a conversion even with no monetary value')
})

test('at cap: an explicit conversion_value of 0 is still metered', async (t) => {
  t.after(restore)
  install({ rpcMode: 'at-cap' })

  // A $0 lead conversion is a conversion. Metering keyed on truthiness would miss it.
  const res = mockRes()
  await postEvent(req({ event: 'free_signup', anonymous_id: 'a', conversion_value: 0 }), res)
  assert.strictEqual(res.statusCode, 402, 'conversion_value: 0 must not slip past the meter')
})

// ── what must NOT be gated ────────────────────────────────────────────────────

test('pageviews do NOT consume conversion quota (metered separately)', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  // No conversion_value / conversion_type -> a plain event. The conversion cap must not
  // touch it even at cap; pageview volume is pageview-limits.js's job.
  const res = mockRes()
  await postEvent(req({ event: '$pageview', anonymous_id: 'anon-1', page_url: 'https://x.test/' }), res)

  assert.strictEqual(res.statusCode, 200, 'a pageview must not be blocked by the CONVERSION cap')
  assert.strictEqual(calls.length, 0, 'the conversion cap must not even be consulted for a non-conversion')
})

test('an event with no conversion payload at all is not gated', async (t) => {
  t.after(restore)
  const calls = install({ rpcMode: 'at-cap' })

  const res = mockRes()
  await postEvent(req({ event: 'app_opened', anonymous_id: 'anon-1' }), res)
  assert.strictEqual(res.statusCode, 200)
  assert.strictEqual(calls.length, 0)
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

test('the gate is not keyed on the canonical event name alone', async () => {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const url = await import('node:url')
  const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../..')
  const src = fs.readFileSync(path.join(root, 'api/routes/server-events.js'), 'utf8')

  assert.ok(src.includes('claimConversionUsage('),
    'server-events.js must consult the conversion cap — it was the one unmetered ingestion path')

  // The discriminator must read the conversion PAYLOAD, not just the event name. Isolate the
  // isConversion expression itself rather than a byte window, so this cannot drift.
  const m = src.match(/const isConversion =([\s\S]*?)\n\n/)
  assert.ok(m, 'the conversion discriminator must be a named `isConversion` expression')
  const expr = m[1]
  assert.ok(expr.includes('conversion_value'), 'must consider conversion_value')
  assert.ok(expr.includes('conversion_type'), 'must consider conversion_type')
  assert.ok(!/conversion_value\s*\|\|/.test(expr) && !/conversion_type\s*\|\|/.test(expr),
    'must use != null, not truthiness — a conversion_value of 0 is a real $0 conversion and must still meter')

  // The founder-decided contract, pinned at the source so a consistency pass cannot quietly
  // swap it for the webhooks' 200 {ignored:true}.
  assert.ok(src.includes("error_code: 'conversion_limit_reached'"), 'the structured error_code is part of the contract')
  assert.ok(/status\(402\)[\s\S]{0,200}conversion_limit_reached/.test(src), 'a capped caller must get 402, not 200')
})
