// GET /api/diagnostics/* — read:analytics scope enforcement.
//
// This is the FIRST endpoint family that enforces read:analytics (api/lib/api-key-scopes.js
// previously said "Enforced by NOTHING today"), and the mount deliberately has no
// app-level requireUserAuth — so the per-route guard is the entire trust boundary. Every
// assertion below is about that boundary, not about the payloads.
//
// Mirrors api/tests/api-key-scopes.test.js's shape: a fake Supabase installed via the
// module registry so nothing touches a real project.

import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'crypto'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const { getSupabase } = await import('../lib/supabase.js')

// Same seam api/tests/api-key-scopes.test.js uses: the client is a mutable singleton, so
// `from` is swapped rather than the (immutable) ESM namespace being reassigned.
let fixture = { apiKeyRow: null, siteRow: null }
const _client = getSupabase()
_client.from = (table) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    range: async () => ({ data: [], error: null }),
    update: () => ({ eq: async () => ({ data: null, error: null }) }),
    maybeSingle: async () => {
      if (table === 'api_keys') return { data: fixture.apiKeyRow, error: null }
      if (table === 'sites') return { data: fixture.siteRow, error: null }
      return { data: null, error: null }
    }
  }
  return chain
}

const RAW_KEY = 'st_live_' + 'a'.repeat(64)
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

const SITE = {
  id: 'site-uuid-1',
  plan: 'growth',
  domain: 'example.com',
  name: 'Example',
  timezone: 'UTC',
  attribution_window_days: 30,
  onboarding_completed: true,
  last_seen_at: '2026-07-29T10:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  trial_ends_at: null
}

// NO_KEY is a distinct sentinel from a key row whose `scopes` column is null: the first is
// an unknown/revoked key (401), the second is a real key granting nothing (403). Collapsing
// them would let the null-scopes case pass on the wrong status code.
const NO_KEY = Symbol('no api_keys row')

function setKey (scopes) {
  fixture = {
    apiKeyRow: scopes === NO_KEY ? null : { id: 'key-1', site_id: SITE.id, scopes },
    siteRow: SITE
  }
}

// Minimal Express-ish harness: run the guard directly, capture the response.
function fakeRes () {
  const res = {
    statusCode: 200,
    body: null,
    status (c) { res.statusCode = c; return res },
    json (b) { res.body = b; return res }
  }
  return res
}

async function runGuard (authHeader, scopes) {
  setKey(scopes)
  const { requireApiKeyScope } = await import('../middleware/api-key-scope.js')
  const { SCOPE_READ_ANALYTICS } = await import('../lib/api-key-scopes.js')
  const guard = requireApiKeyScope(SCOPE_READ_ANALYTICS)
  const req = { headers: authHeader ? { authorization: authHeader } : {} }
  const res = fakeRes()
  let nexted = false
  await guard(req, res, () => { nexted = true })
  return { req, res, nexted }
}

// ── 1. No credential ─────────────────────────────────────────────────────────────────
test('🔴 no Authorization header -> 401, guard does not call next()', async () => {
  const { res, nexted } = await runGuard(null, ['read:analytics'])
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(nexted, false)
})

test('🔴 Bearer with an empty token -> 401 (not treated as a valid empty key)', async () => {
  const { res, nexted } = await runGuard('Bearer    ', ['read:analytics'])
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(nexted, false)
})

// ── 2. Fail-closed scope matrix — the core of KI-43 ──────────────────────────────────
for (const [label, scopes] of [
  ['{} (the DB default)', []],
  ['null', null],
  ['write:events only', ['write:events']],
  // Became testable when #497 landed the third scope. Included because "siblings, not a
  // hierarchy" has to hold in every direction, not just the two that existed before.
  ['write:crawler_hits only', ['write:crawler_hits']],
  ['both write scopes but no read', ['write:events', 'write:crawler_hits']],
  ['an unrecognised scope', ['read:everything']]
]) {
  test(`🔴 a key with ${label} is DENIED 403 on /api/diagnostics/*`, async () => {
    const { res, nexted } = await runGuard(`Bearer ${RAW_KEY}`, scopes)
    assert.strictEqual(res.statusCode, 403, `${label} must not be admitted`)
    assert.match(res.body.error, /read:analytics/)
    assert.strictEqual(nexted, false)
  })
}

test('🔴 write:events does NOT imply read:analytics (siblings, not a hierarchy)', async () => {
  const { res } = await runGuard(`Bearer ${RAW_KEY}`, ['write:events'])
  assert.strictEqual(res.statusCode, 403)
})

// ── 3. The happy path, and what it puts on req ───────────────────────────────────────
test('🟢 a key holding read:analytics is admitted, and site_id comes from the KEY', async () => {
  const { req, res, nexted } = await runGuard(`Bearer ${RAW_KEY}`, ['read:analytics'])
  assert.strictEqual(nexted, true, `expected next(), got ${res.statusCode}: ${JSON.stringify(res.body)}`)
  assert.strictEqual(req.site.id, SITE.id)
  assert.strictEqual(req.apiKeySite.id, SITE.id)
  assert.strictEqual(req.apiKeyId, 'key-1')
})

test('🟢 a key holding both scopes is admitted (extra scopes are not a problem)', async () => {
  const { nexted } = await runGuard(`Bearer ${RAW_KEY}`, ['write:events', 'read:analytics'])
  assert.strictEqual(nexted, true)
})

// ── 4. Unknown / revoked key ─────────────────────────────────────────────────────────
test('🔴 an unknown (or revoked) key hash -> 401 Invalid API key', async () => {
  const { res, nexted } = await runGuard(`Bearer ${RAW_KEY}`, NO_KEY)
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(nexted, false)
})

// ── 5. Constructing the guard without a scope must fail at boot, not admit everything ─
test('🔴 requireApiKeyScope() with no scope throws rather than producing an open guard', async () => {
  const { requireApiKeyScope } = await import('../middleware/api-key-scope.js')
  assert.throws(() => requireApiKeyScope(), /scope is required/)
  assert.throws(() => requireApiKeyScope(''), /scope is required/)
})

// ── 6. Every route on the diagnostics router carries a guard ──────────────────────────
// The mount has no requireUserAuth, so a route registered without requireApiKeyScope is
// simply public. This walks the real router's stack rather than trusting review.
test('🔴 EVERY registered /api/diagnostics route has more than one handler (i.e. a guard)', async () => {
  const { default: router } = await import('../routes/diagnostics.js')
  const routes = router.stack.filter(l => l.route).map(l => ({
    path: l.route.path,
    handlers: l.route.stack.length
  }))
  assert.ok(routes.length >= 5, `expected at least 5 diagnostic routes, found ${routes.length}`)
  for (const r of routes) {
    assert.ok(r.handlers >= 2, `${r.path} has only ${r.handlers} handler(s) — it is missing its scope guard`)
  }
})

test('🔴 the five roadmap §1.5 routes are all present', async () => {
  const { default: router } = await import('../routes/diagnostics.js')
  const paths = router.stack.filter(l => l.route).map(l => l.route.path).sort()
  assert.deepStrictEqual(paths, [
    '/data-flow',
    '/data-quality',
    '/site-health',
    '/verify-events',
    '/workspace-context'
  ])
})

// ── 7. §6.5 — no raw site_key may ever leave this surface ─────────────────────────────
test('🔴 workspace-context response never contains a site_key', async () => {
  const { req, nexted } = await runGuard(`Bearer ${RAW_KEY}`, ['read:analytics'])
  assert.strictEqual(nexted, true)
  // The guard's own site selection is the only place a site_key could enter the handler.
  assert.ok(!('site_key' in req.apiKeySite), 'the guard must not load site_key onto req')
})
