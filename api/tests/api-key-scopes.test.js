// KI-43 PR A — api_keys scope enforcement.
//
// The four load-bearing cases (all four required; none optional):
//   1. key with ['write:events']          -> POST /api/server/event succeeds
//   2. key with ['read:analytics'] only   -> 403 (NOT 200, not silently accepted)
//   3. key with [] (the DB default '{}', i.e. a non-app INSERT) -> 403
//   4. create with ['admin:everything']   -> 400 DENIED
//
// Case 4 is the point of this PR: validation is APP-ONLY (there is no DB CHECK constraint),
// so an unrecognised scope MUST be denied — never ignored, never silently dropped, never
// coerced into a valid one. A test that merely asserted "the key was created without the
// bad scope" would pass while the vulnerability shipped.
//
// Scope enforcement is a BREAKING CHANGE for any pre-existing key (one lacking
// 'write:events' starts getting 403). Safe ONLY because prod api_keys is 0 rows / 0 keys
// ever used (re-verified read-only on prod + staging 2026-07-21, migration merged cf18c69).

import test from 'node:test'
import assert from 'node:assert'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getSupabase } = await import('../lib/supabase.js')
const { serverEventsRouter } = await import('../routes/server-events.js')
const { integrationsRouter } = await import('../routes/integrations.js')
const {
  normalizeRequestedScopes,
  hasScope,
  VALID_API_KEY_SCOPES,
  DEFAULT_API_KEY_SCOPES
} = await import('../lib/api-key-scopes.js')

// ── harness ───────────────────────────────────────────────────────────────────
const handlerFor = (router, path, method) => {
  const layer = router.stack.find(l => l.route?.path === path && l.route?.methods?.[method])
  return layer.route.stack[layer.route.stack.length - 1].handle
}
const postEvent = handlerFor(serverEventsRouter, '/event', 'post')
const postApiKey = handlerFor(integrationsRouter, '/api-keys', 'post')

function mockRes () {
  const res = { statusCode: 200, body: null }
  res.status = (c) => { res.statusCode = c; return res }
  res.json = (b) => { res.body = b; return res }
  return res
}

const _client = getSupabase()
const _realFrom = _client.from.bind(_client)

// Stub `api_keys` (the scope lookup) and `sites` (the plan gate). Everything else falls
// through to the real client so an unexpected table read is visible rather than silently mocked.
function installSupabase ({ apiKeyRow, insertCapture }) {
  _client.from = (table) => {
    if (table === 'api_keys') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: apiKeyRow, error: null }),
        // The allowed path continues past the gate and stamps last_used_at; stub it so the
        // happy-path test doesn't leave an unhandled rejection behind.
        update: () => ({ eq: async () => ({ data: null, error: null }) }),
        insert: (row) => {
          if (insertCapture) insertCapture.push(row)
          return {
            select: () => ({
              single: async () => ({
                data: { id: 'key-1', key_prefix: 'st_live_abcd...', name: row.name, scopes: row.scopes, last_used_at: null, created_at: '2026-07-21T00:00:00Z' },
                error: null
              })
            })
          }
        }
      }
      return chain
    }
    if (table === 'sites') {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: { plan: 'growth' }, error: null })
      }
      return chain
    }
    return _realFrom(table)
  }
}
function restoreSupabase () { _client.from = _realFrom }

// A key row as the DB would return it. `scopes` is passed through verbatim so a test can
// simulate the '{}' DB default (empty array) or a legacy NULL.
const keyRow = (scopes) => ({ id: 'key-1', site_id: 'site-1', scopes })

const eventReq = () => ({
  headers: { authorization: 'Bearer st_live_test_token', 'user-agent': 'node' },
  body: { event: 'purchase', anonymous_id: 'anon-1' },
  socket: {}
})

// ── 1. write:events -> allowed ────────────────────────────────────────────────
test('1. key with [write:events] succeeds on POST /api/server/event', async (t) => {
  installSupabase({ apiKeyRow: keyRow(['write:events']) })
  t.after(restoreSupabase)

  const res = mockRes()
  await postEvent(eventReq(), res)

  assert.strictEqual(res.statusCode, 200, `expected the write:events key to succeed, got ${res.statusCode}: ${JSON.stringify(res.body)}`)
  assert.strictEqual(res.body.success, true)
})

// ── 2. read:analytics only -> 403 ─────────────────────────────────────────────
test('2. key with [read:analytics] only is DENIED 403 on /event', async (t) => {
  installSupabase({ apiKeyRow: keyRow(['read:analytics']) })
  t.after(restoreSupabase)

  const res = mockRes()
  await postEvent(eventReq(), res)

  assert.strictEqual(res.statusCode, 403, 'a read-only key must not be able to write events')
  assert.strictEqual(res.body.success, false)
  assert.match(res.body.error, /write:events/, 'the error should name the scope that is required')
})

// ── 2b. the reverse direction of the same rule ────────────────────────────────
// The mirror of api/tests/server-crawler-hit.test.js case 3b. Together they pin that the
// two write scopes are siblings: neither endpoint accepts the other's credential.
test('2b. key with [write:crawler_hits] only is DENIED 403 on /event', async (t) => {
  installSupabase({ apiKeyRow: keyRow(['write:crawler_hits']) })
  t.after(restoreSupabase)

  const res = mockRes()
  await postEvent(eventReq(), res)

  assert.strictEqual(res.statusCode, 403, 'a crawler-hit key must not reach the events/revenue rail')
  assert.match(res.body.error, /write:events/)
})

// ── 3. '{}' DB default (non-app INSERT) -> 403 ────────────────────────────────
test('3. key with [] — the DB default, i.e. a non-app INSERT — is DENIED 403', async (t) => {
  installSupabase({ apiKeyRow: keyRow([]) })
  t.after(restoreSupabase)

  const res = mockRes()
  await postEvent(eventReq(), res)

  assert.strictEqual(res.statusCode, 403, "the '{}' DB default must be the fail-closed backstop, not an implicit grant")
})

test('3b. key with NULL scopes is DENIED 403 (fail-closed, not fail-open)', async (t) => {
  installSupabase({ apiKeyRow: keyRow(null) })
  t.after(restoreSupabase)

  const res = mockRes()
  await postEvent(eventReq(), res)

  assert.strictEqual(res.statusCode, 403, 'a null/absent scopes column must deny, never allow')
})

// ── 4. unrecognised scope on create -> 400 DENIED ─────────────────────────────
test('4. create with [admin:everything] is DENIED 400 — not ignored, not dropped', async (t) => {
  const captured = []
  installSupabase({ apiKeyRow: null, insertCapture: captured })
  t.after(restoreSupabase)

  const req = {
    site: { id: 'site-1', plan: 'growth' },
    user: { id: 'user-1' },
    body: { name: 'evil token', scopes: ['admin:everything'] }
  }
  const res = mockRes()
  await postApiKey(req, res)

  assert.strictEqual(res.statusCode, 400, 'an unrecognised scope must be rejected')
  assert.match(res.body.error, /admin:everything/, 'the error should name the offending scope')
  // The vulnerability this guards: accepting the request and quietly stripping the bad scope.
  assert.strictEqual(captured.length, 0, 'no key may be created when validation fails')
})

test('4b. a valid scope alongside an invalid one still DENIES the whole request', async (t) => {
  const captured = []
  installSupabase({ apiKeyRow: null, insertCapture: captured })
  t.after(restoreSupabase)

  const req = {
    site: { id: 'site-1', plan: 'growth' },
    user: { id: 'user-1' },
    body: { name: 'mixed', scopes: ['write:events', 'admin:everything'] }
  }
  const res = mockRes()
  await postApiKey(req, res)

  assert.strictEqual(res.statusCode, 400, 'one bad scope must fail the whole request')
  assert.strictEqual(captured.length, 0, 'no partial-grant key may be created')
})

// ── create-path defaults ──────────────────────────────────────────────────────
test('create without `scopes` persists the APP default [write:events]', async (t) => {
  const captured = []
  installSupabase({ apiKeyRow: null, insertCapture: captured })
  t.after(restoreSupabase)

  const req = { site: { id: 'site-1', plan: 'growth' }, user: { id: 'user-1' }, body: { name: 'default token' } }
  const res = mockRes()
  await postApiKey(req, res)

  assert.strictEqual(res.statusCode, 200)
  assert.deepStrictEqual(captured[0].scopes, ['write:events'], 'the app default must be written explicitly, not left to the DB default')
  assert.deepStrictEqual(res.body.data.scopes, ['write:events'], 'the create response must expose the scopes')
})

test('the APP default and the DB default are DIFFERENT on purpose', () => {
  // The DB column default is '{}' (deny). The app default is ['write:events'].
  // If these are ever unified, the fail-closed backstop for non-app INSERTs becomes a grant.
  assert.deepStrictEqual([...DEFAULT_API_KEY_SCOPES], ['write:events'])
  assert.notDeepStrictEqual([...DEFAULT_API_KEY_SCOPES], [], 'app default must not collapse to the DB default')
  assert.strictEqual(hasScope([], 'write:events'), false, "the DB default '{}' must grant nothing")
})

// ── the scope vocabulary is exactly three values ──────────────────────────────
// Was two (KI-43's MVP set). `write:crawler_hits` was added deliberately for
// POST /api/server/crawler-hit — the rationale is in api/lib/api-key-scopes.js, and the
// enforcement is pinned in api/tests/server-crawler-hit.test.js (3b asserts a
// write:events key gets 403 there). This assertion is the guard against ACCIDENTAL
// vocabulary creep, not a prohibition: a fourth value is allowed, but only alongside a
// stated reason and an enforcing endpoint.
test('the scope vocabulary is exactly write:events, write:crawler_hits and read:analytics', () => {
  assert.deepStrictEqual([...VALID_API_KEY_SCOPES], ['write:events', 'write:crawler_hits', 'read:analytics'])
})

test('write:crawler_hits does not imply write:events, and vice versa', () => {
  // The two write scopes are siblings, not a hierarchy. If either ever implies the other,
  // scoping the edge-deployed credential to a narrow blast radius stops working.
  assert.strictEqual(hasScope(['write:crawler_hits'], 'write:events'), false)
  assert.strictEqual(hasScope(['write:events'], 'write:crawler_hits'), false)
})

test('normalizeRequestedScopes rejects non-arrays, empty arrays, and non-strings', () => {
  assert.strictEqual(normalizeRequestedScopes('write:events').ok, false, 'a bare string is not a scope array')
  assert.strictEqual(normalizeRequestedScopes([]).ok, false, 'an explicit empty array is rejected, not silently defaulted')
  assert.strictEqual(normalizeRequestedScopes([123]).ok, false)
  assert.strictEqual(normalizeRequestedScopes(['WRITE:EVENTS']).ok, false, 'scope matching is case-sensitive — no coercion')
  assert.deepStrictEqual(normalizeRequestedScopes(undefined).scopes, ['write:events'], 'omitted -> app default')
  assert.deepStrictEqual(normalizeRequestedScopes(['write:events', 'write:events']).scopes, ['write:events'], 'duplicates collapse')
  assert.deepStrictEqual(
    normalizeRequestedScopes(['read:analytics', 'write:events']).scopes,
    ['read:analytics', 'write:events'],
    'both valid scopes are grantable together'
  )
})

// read:analytics is deliberately inert in this PR — it is stored and grantable, but wired
// to no endpoint. This test documents that and will need updating when the read API lands.
test('read:analytics is grantable but enforced by nothing in this PR', () => {
  assert.ok(VALID_API_KEY_SCOPES.includes('read:analytics'), 'it must be grantable')
  assert.strictEqual(hasScope(['read:analytics'], 'write:events'), false, 'it must not imply write access')
})
