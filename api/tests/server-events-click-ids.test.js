// A1 — server-side click-ID capture on POST /api/server/event.
//
// WHY THIS EXISTS: marketing/src/pages/index.astro (promoted from /v3 at the cutover) claims "Server-side ingest and
// click-ID stitching keep the path intact." Before this change, `grep -E "gclid|fbclid"
// api/routes/server-events.js` returned ZERO — the server-side half of that claim was false.
// This suite makes it true and pins it.
//
// ── WHY EVERY ASSERTION IS AT THE ROOT OF THE EMITTED ROW, NEVER IN A BAG ───────────────────
// tinybird/datasources/events.datasource:46-59 types the 14 click-ID columns as
// `json:$.gclid` etc — read from the ROOT of the ingested JSON line. A row can carry
// gclid inside a nested `properties` object and still leave the TYPED COLUMN NULL.
//
// So an assertion like `JSON.parse(line.properties).gclid` would PASS while the column
// this feature exists to populate is empty — it would pass even if the adapter's flatten
// were deleted outright. Every assertion below reads `line.gclid` at the root, which is
// exactly the path `json:$.gclid` resolves. The recorder captures the gzipped NDJSON the
// batcher hands the transport, i.e. the literal bytes Tinybird ingests.
//
// ── THE FLATTEN THIS DEPENDS ON, STATED SO A FUTURE EDIT CANNOT BREAK IT SILENTLY ──────────
// The route nests click IDs inside `properties`. They reach the root only because
// tinybird/adapter/normalize.js:216-220 does `const { properties, ...top } = raw;
// src = { ...properties, ...top }` — TOP-LEVEL WINS ON COLLISION — and normalize's
// pass-through loop (:234-243) then emits every surviving key flat.
//
// The collision risk is real but does NOT apply to click IDs on this route: dualWriteEvent
// receives `{ distinctId, event, timestamp, properties }`, and all three top-level names are
// in WRAPPER_KEYS (normalize.js:95) or are `timestamp`. No click ID appears at top level, so
// nothing shadows one. `test('flatten holds…')` below proves that empirically rather than by
// argument, and the collision test pins the one collision that CAN occur (caller-nested).

import test from 'node:test'
import assert from 'node:assert'
import { gunzipSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getSupabase } = await import('../lib/supabase.js')
const { serverEventsRouter } = await import('../routes/server-events.js')
const { setDualWriteTransport, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
const SITE_ID = 'site-under-test'

// ── Harness (mirrors api/tests/server-events-pageview-cap.test.js) ──────────────────────────
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

const req = (body) => ({
  headers: { authorization: 'Bearer st_live_test_token', 'user-agent': 'node' },
  body,
  socket: {}
})

const _client = getSupabase()
const _realFrom = _client.from.bind(_client)
const _realRpc = _client.rpc ? _client.rpc.bind(_client) : undefined

function install () {
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
        // pv_limit Infinity short-circuits claimPageviewUsage before any RPC —
        // metering is not what this file tests.
        maybeSingle: async () => ({ data: { id: SITE_ID, plan: 'growth', pv_limit: Infinity }, error: null }),
        single: async () => ({ data: { id: SITE_ID, plan: 'growth', pv_limit: Infinity }, error: null })
      }
      return chain
    }
    const chain = { select: () => chain, eq: () => chain, insert: async () => ({ data: null, error: null }), update: () => ({ eq: async () => ({ data: null, error: null }) }), maybeSingle: async () => ({ data: null, error: null }) }
    return chain
  }
  _client.rpc = async () => ({ data: null, error: null })
}

function restore () {
  _client.from = _realFrom
  if (_realRpc) _client.rpc = _realRpc
  setDualWriteTransport(null)
  delete process.env.TINYBIRD_DUAL_WRITE
}

const BATCH_OPTS = { flushAt: 1000, flushInterval: 0 }

function recorder () {
  const payloads = []
  return {
    transport: async (payload) => { payloads.push(payload) },
    lines: () => payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)))
  }
}

// Runs `body` through a handler and returns the single emitted Tinybird row.
async function emit (handler, body) {
  const rec = recorder()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  setDualWriteTransport(rec.transport, BATCH_OPTS)
  const res = mockRes()
  await handler(req(body), res)
  await __getDualWriteBatcher().flush()
  const lines = rec.lines()
  assert.strictEqual(res.statusCode, 200, 'route must accept the event')
  assert.strictEqual(lines.length, 1, 'exactly one row must be emitted')
  return lines[0]
}

// ── THE POSITIVE CONTROL ────────────────────────────────────────────────────────────────────
// Loads the route AS IT EXISTS AT THE PINNED PRE-CHANGE REF and runs the IDENTICAL request through it.
// This is the only control that actually proves the assertions discriminate: a hand-written
// "simulation" of the old behaviour is a copy that can drift, and would keep passing after
// the real code changed underneath it.
//
// api/tests/ sits at the same depth as api/routes/, so main's relative imports
// (`../lib/…`, `../../tinybird/…`) resolve identically from the temp file. Node keys the
// module registry by resolved path, so BOTH copies share one dual-write module — the same
// recorder observes both.
//
// ⚠️ PINNED TO A SHA, NOT origin/main. THIS IS THE WHOLE POINT — DO NOT "MODERNISE" IT BACK.
//
// GENERAL RULE, worth carrying beyond this file:
//
//     A positive control that reads a MUTABLE ref has a shelf life ending at its own merge.
//
// This control originally read `origin/main`. That was correct at review and broken the
// instant the PR landed: #676 merged at 09:52 on 2026-08-07, main gained click-ID handling,
// and the precondition below — "the pre-change route must contain NO click-ID handling" —
// started failing on main and on every branch that merged main. Four open PRs went red on
// code they had never touched. Run 31168556649 (head 3e495e6b) is the failure:
//
//     not ok 847 - CONTROL — the identical request on the pre-change ref emits NO click-ID columns
//     not ok 851 - CONTROL — li_fatid alone on the pre-change ref populates NEITHER column
//
// ⚠️ THE ASSERTION WAS NOT WRONG — IT FIRED CORRECTLY. It exists to say "this ref no longer
// proves anything", and that is exactly what it reported. The defect is the REF, not the
// approach: loading the real pre-change route still beats a hand-written simulation, which
// would have silently drifted and kept passing. So the fix pins the ref; it does not delete
// the control. Deleting it would lose the proof and leave the feature unfalsifiable, which
// is the precise thing these controls exist to prevent.
//
// 2e65b821 is main immediately BEFORE #676. Verified: it contains 0 occurrences of
// gclid|fbclid|normalizeClickIds, and it is an ancestor of main, so CI's fetch-depth: 0
// checkout always has it.
//
// If the ref cannot be read this THROWS. It must never skip: a control that quietly no-ops
// is the assertion-free pass KI-49 exists to prevent. There is deliberately NO fallback ref
// — a fallback would reintroduce the mutable-ref defect by another route.
const PRE_CHANGE_REF = '2e65b821'   // main @ 2026-08-06, immediately before #676

let _mainHandler = null
let _tmpPath = null
async function mainRouteHandler () {
  if (_mainHandler) return _mainHandler
  let src
  try {
    src = execFileSync('git', ['show', `${PRE_CHANGE_REF}:api/routes/server-events.js`], { cwd: REPO, encoding: 'utf8' })
  } catch (err) {
    // THROW, never skip. A missing ref means the control cannot run, and a control that
    // cannot run must fail loudly rather than pass silently.
    throw new Error(
      `control: could not read ${PRE_CHANGE_REF}:api/routes/server-events.js — ` +
      `the pinned pre-change ref is unreadable, so the control proves nothing. ` +
      `CI checks out with fetch-depth: 0; if this fires there, the pin is wrong or the ` +
      `history was rewritten. Original error: ${err?.message || err}`
    )
  }
  assert.ok(src && src.length > 500, `control: the ${PRE_CHANGE_REF} copy of the route must load`)
  assert.ok(
    !/gclid|fbclid|normalizeClickIds/.test(src),
    `control precondition: ${PRE_CHANGE_REF} must contain NO click-ID handling — if this fails, ` +
    `the pin has drifted onto a commit that already has the feature and the control proves nothing`
  )
  _tmpPath = join(HERE, '.control-server-events-main.mjs')
  writeFileSync(_tmpPath, src)
  const mod = await import(`${_tmpPath}?v=${Date.now()}`)
  _mainHandler = handlerFor(mod.serverEventsRouter, '/event', 'post')
  return _mainHandler
}

const CLICK_BODY = {
  event: '$pageview',
  anonymous_id: 'anon-1',
  page_url: 'https://x.test/landing',
  gclid: 'GCL-123',
  fbclid: 'FB-456',
  dclid: 'DC-789'
}

// ── 1. THE FEATURE, ASSERTED AT THE TYPED COLUMN ────────────────────────────────────────────

test('top-level click IDs land at the ROOT of the emitted row (= the typed column)', async (t) => {
  install(); t.after(restore)
  const row = await emit(postEvent, CLICK_BODY)

  // Root position IS the typed column: events.datasource reads `json:$.gclid`.
  assert.strictEqual(row.gclid, 'GCL-123', 'gclid must be a root key')
  assert.strictEqual(row.fbclid, 'FB-456', 'fbclid must be a root key')
  // dclid is the disputed key that IS a real column (rdt_cid / epik are not columns at all).
  assert.strictEqual(row.dclid, 'DC-789', 'dclid must be a root key')
})

test('CONTROL — the identical request on the pre-change ref emits NO click-ID columns', async (t) => {
  install(); t.after(() => { restore(); if (_tmpPath) { try { unlinkSync(_tmpPath) } catch {} _tmpPath = null; _mainHandler = null } })
  const row = await emit(await mainRouteHandler(), CLICK_BODY)

  assert.strictEqual(row.gclid, undefined, 'pre-change: gclid must be absent — if present, test 1 was not measuring this change')
  assert.strictEqual(row.fbclid, undefined, 'pre-change: fbclid must be absent')
  assert.strictEqual(row.dclid, undefined, 'pre-change: dclid must be absent')
})

test('flatten holds — the value is at ROOT, not merely inside a properties bag', async (t) => {
  install(); t.after(restore)
  const row = await emit(postEvent, CLICK_BODY)

  // The discriminator this whole file is built around. `properties` is a WRAPPER_KEY, so a
  // correctly flattened row does not re-emit it; if a future edit reintroduced a nested bag
  // while breaking the lift, root would be undefined and this fails.
  assert.strictEqual(row.gclid, 'GCL-123')
  const bag = typeof row.properties === 'string' ? JSON.parse(row.properties) : (row.properties || {})
  assert.ok(
    row.gclid !== undefined,
    'a bag-only gclid leaves the typed column NULL — root is the only position that counts'
  )
  assert.strictEqual(bag.gclid, undefined, 'gclid must not be duplicated into a nested bag')
})

// ── 2. COLLISION ────────────────────────────────────────────────────────────────────────────

test('collision — a caller-nested properties.gclid WINS over the top-level one, intentionally', async (t) => {
  install(); t.after(restore)
  const row = await emit(postEvent, {
    ...CLICK_BODY,
    gclid: 'TOP-LEVEL',
    properties: { gclid: 'NESTED' }
  })

  // INTENTIONAL, not incidental. `...clickIds` is spread BEFORE `...req.body.properties`
  // in the route. Callers already sending properties.gclid reached the typed column before
  // this change (via the same flatten), so the nested form must keep winning or this
  // "additive" change would silently retarget their data.
  assert.strictEqual(row.gclid, 'NESTED', 'nested properties.gclid is the more specific signal and wins')
})

// ── 3. THE LINKEDIN ASYMMETRY (utils.js:759-763) ────────────────────────────────────────────
// li_fat_id = rawLiFatId || rawLiFatid   (falls back to the alt spelling)
// li_fatid  = rawLiFatid                 (NO fallback)

test('li_fatid alone populates BOTH li_fat_id (via fallback) and li_fatid', async (t) => {
  install(); t.after(restore)
  const row = await emit(postEvent, { event: '$pageview', anonymous_id: 'anon-1', li_fatid: 'LI-ALT' })

  assert.strictEqual(row.li_fat_id, 'LI-ALT', 'li_fat_id must fall back to the li_fatid spelling')
  assert.strictEqual(row.li_fatid, 'LI-ALT', 'li_fatid must carry its own raw value')
})

test('CONTROL — li_fatid alone on the pre-change ref populates NEITHER column', async (t) => {
  install(); t.after(() => { restore(); if (_tmpPath) { try { unlinkSync(_tmpPath) } catch {} _tmpPath = null; _mainHandler = null } })
  const row = await emit(await mainRouteHandler(), { event: '$pageview', anonymous_id: 'anon-1', li_fatid: 'LI-ALT' })

  assert.strictEqual(row.li_fat_id, undefined, 'pre-change: li_fat_id absent')
  assert.strictEqual(row.li_fatid, undefined, 'pre-change: li_fatid absent')
})

test('li_fat_id alone leaves li_fatid NULL — the asymmetry does NOT run backwards', async (t) => {
  install(); t.after(restore)
  const row = await emit(postEvent, { event: '$pageview', anonymous_id: 'anon-1', li_fat_id: 'LI-CANON' })

  assert.strictEqual(row.li_fat_id, 'LI-CANON')
  // Absent === NULL to Tinybird (a missing json path maps to NULL, normalize.js:259-261).
  assert.strictEqual(row.li_fatid, undefined, 'li_fatid must NOT be back-filled from li_fat_id')
})

test('CONTROL — the li_fatid-is-NULL assertion CAN fail: the same read reports a value when one is sent', async (t) => {
  install(); t.after(restore)
  // An "assert it is absent" test passes trivially against a route that emits nothing at all,
  // so on its own it proves nothing. This pins that the exact read used above (`row.li_fatid`)
  // does report a value when the field is genuinely populated — which is what makes the
  // preceding NULL assertion meaningful rather than vacuous.
  const row = await emit(postEvent, { event: '$pageview', anonymous_id: 'anon-1', li_fatid: 'LI-ALT' })
  assert.strictEqual(row.li_fatid, 'LI-ALT', 'the same field read must be capable of returning a value')
})

// ── 4. NO CHANGE FOR EVENTS THAT CARRY NO CLICK ID ──────────────────────────────────────────

test('an event with no click IDs emits NO click-ID keys at all (nulls are stripped, not spread)', async (t) => {
  install(); t.after(restore)
  const row = await emit(postEvent, { event: '$pageview', anonymous_id: 'anon-1', page_url: 'https://x.test/' })

  // normalizeClickIds always returns all 14 keys; spreading it raw would add 14 explicit
  // nulls to EVERY server event. The route filters them, so a click-ID-free event is
  // byte-identical to what it emitted before this change.
  for (const k of ['gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'ttclid', 'li_fat_id', 'li_fatid', 'twclid', 'dclid', 'snapclid', 'pclid', 'sccid', 'ko_click_id']) {
    assert.strictEqual(row[k], undefined, `${k} must be absent, not an explicit null`)
  }
})
