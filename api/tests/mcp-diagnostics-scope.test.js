// GET /api/diagnostics/* — read:diagnostics / read:volume scope enforcement.
//
// This is the only endpoint family that enforces either read scope, and the mount
// deliberately has no app-level requireUserAuth — so the per-route guard is the entire
// trust boundary. Every assertion below is about that boundary, not about the payloads.
//
// ── What changed when read:analytics was split ───────────────────────────────────────
// The router originally enforced ONE scope, `read:analytics`, across all seven routes.
// docs/mcp_tool_policy.md §5 split it into read:diagnostics (five pipeline-state routes)
// and read:volume (two count routes), and removed read:analytics from the vocabulary
// outright — prod api_keys is 0 rows, so no live key held it. Three things follow, and
// each is asserted below rather than assumed:
//
//   1. The old scope must be GONE, not merely undocumented. A key still holding
//      ['read:analytics'] has to 403 on both guards (§2's matrix). Without this case the
//      removal is a rename in the comments and a no-op in the auth layer.
//   2. The two new scopes are SIBLINGS. read:diagnostics gets 403 on a volume route and
//      read:volume gets 403 on a diagnostic route (§3). A split whose halves admit each
//      other is one scope wearing two names.
//   3. WHICH route carries WHICH scope is itself an assertion (§6). Every guard this
//      factory returns is the same named function, so a router-stack walk could only ever
//      prove "some guard is present" — which stays true if a volume route is quietly moved
//      under the diagnostics guard, silently widening what a diagnostics key can read.
//      requireApiKeyScope stamps `guard.requiredScope`, and the two route-list assertions
//      read it.
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

const { SCOPE_READ_DIAGNOSTICS, SCOPE_READ_VOLUME } = await import('../lib/api-key-scopes.js')

// `required` is the scope the GUARD demands; `scopes` is what the KEY holds. Keeping them
// separate arguments is what makes the cross-scope denials in §3 expressible at all.
async function runGuard (authHeader, scopes, required = SCOPE_READ_DIAGNOSTICS) {
  setKey(scopes)
  const { requireApiKeyScope } = await import('../middleware/api-key-scope.js')
  const guard = requireApiKeyScope(required)
  const req = { headers: authHeader ? { authorization: authHeader } : {} }
  const res = fakeRes()
  let nexted = false
  await guard(req, res, () => { nexted = true })
  return { req, res, nexted }
}

// ── 1. No credential ─────────────────────────────────────────────────────────────────
test('🔴 no Authorization header -> 401, guard does not call next()', async () => {
  const { res, nexted } = await runGuard(null, [SCOPE_READ_DIAGNOSTICS])
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(nexted, false)
})

test('🔴 Bearer with an empty token -> 401 (not treated as a valid empty key)', async () => {
  const { res, nexted } = await runGuard('Bearer    ', [SCOPE_READ_DIAGNOSTICS])
  assert.strictEqual(res.statusCode, 401)
  assert.strictEqual(nexted, false)
})

// ── 2. Fail-closed scope matrix — the core of KI-43 ──────────────────────────────────
// Run against BOTH read guards. A matrix that only covered one of them would let the other
// ship fail-OPEN, and the two guards are separate instances of the same factory — sameness
// is the thing being asserted, not something that can be assumed.
for (const required of [SCOPE_READ_DIAGNOSTICS, SCOPE_READ_VOLUME]) {
  for (const [label, scopes] of [
    ['{} (the DB default)', []],
    ['null', null],
    ['write:events only', ['write:events']],
    // Became testable when #497 landed the third scope. Included because "siblings, not a
    // hierarchy" has to hold in every direction, not just the two that existed before.
    ['write:crawler_hits only', ['write:crawler_hits']],
    ['both write scopes but no read', ['write:events', 'write:crawler_hits']],
    ['an unrecognised scope', ['read:everything']],
    // THE REMOVED SCOPE. read:analytics was deleted from VALID_API_KEY_SCOPES, not
    // deprecated — but validation is app-only on the CREATE path, and this guard reads
    // whatever `scopes` the row holds. A key row carrying the old value (hand-written SQL,
    // a restored backup, a fixture that was never updated) must therefore be denied by the
    // GUARD, not merely rejected at mint time. Without this case, "removed" is a claim
    // about a constants file rather than a fact about the auth boundary.
    ['the REMOVED read:analytics scope', ['read:analytics']],
    // The same key with a write scope alongside it — proves the denial is not an artifact
    // of the array having exactly one element.
    ['read:analytics plus write:events', ['read:analytics', 'write:events']]
  ]) {
    test(`🔴 [${required}] a key with ${label} is DENIED 403`, async () => {
      const { res, nexted } = await runGuard(`Bearer ${RAW_KEY}`, scopes, required)
      assert.strictEqual(res.statusCode, 403, `${label} must not be admitted`)
      assert.match(res.body.error, new RegExp(required), 'the error must name the scope actually required')
      assert.doesNotMatch(res.body.error, /read:analytics/, 'the removed scope must not survive in the error copy')
      assert.strictEqual(nexted, false)
    })
  }
}

test('🔴 write:events does NOT imply either read scope (siblings, not a hierarchy)', async () => {
  for (const required of [SCOPE_READ_DIAGNOSTICS, SCOPE_READ_VOLUME]) {
    const { res } = await runGuard(`Bearer ${RAW_KEY}`, ['write:events'], required)
    assert.strictEqual(res.statusCode, 403, `write:events must not admit ${required}`)
  }
})

// ── 2b. The two read scopes do not admit each other ──────────────────────────────────
// The whole point of the split. If either direction passes, there is one scope with two
// spellings and a leaked diagnostics key reads the customer's lead counts.
test('🔴 read:diagnostics is DENIED on a read:volume route', async () => {
  const { res, nexted } = await runGuard(`Bearer ${RAW_KEY}`, [SCOPE_READ_DIAGNOSTICS], SCOPE_READ_VOLUME)
  assert.strictEqual(res.statusCode, 403, 'a diagnostics key must not reach lead/campaign counts')
  assert.match(res.body.error, /read:volume/)
  assert.strictEqual(nexted, false)
})

test('🔴 read:volume is DENIED on a read:diagnostics route', async () => {
  const { res, nexted } = await runGuard(`Bearer ${RAW_KEY}`, [SCOPE_READ_VOLUME], SCOPE_READ_DIAGNOSTICS)
  assert.strictEqual(res.statusCode, 403, 'the split is symmetric — neither scope is a superset')
  assert.match(res.body.error, /read:diagnostics/)
  assert.strictEqual(nexted, false)
})

// ── 3. The happy path, and what it puts on req ───────────────────────────────────────
for (const required of [SCOPE_READ_DIAGNOSTICS, SCOPE_READ_VOLUME]) {
  test(`🟢 [${required}] a key holding it is admitted, and site_id comes from the KEY`, async () => {
    const { req, res, nexted } = await runGuard(`Bearer ${RAW_KEY}`, [required], required)
    assert.strictEqual(nexted, true, `expected next(), got ${res.statusCode}: ${JSON.stringify(res.body)}`)
    assert.strictEqual(req.site.id, SITE.id)
    assert.strictEqual(req.apiKeySite.id, SITE.id)
    assert.strictEqual(req.apiKeyId, 'key-1')
  })
}

test('🟢 extra scopes are not a problem — a key may hold both reads and a write', async () => {
  for (const required of [SCOPE_READ_DIAGNOSTICS, SCOPE_READ_VOLUME]) {
    const { nexted } = await runGuard(
      `Bearer ${RAW_KEY}`,
      ['write:events', SCOPE_READ_DIAGNOSTICS, SCOPE_READ_VOLUME],
      required
    )
    assert.strictEqual(nexted, true, `${required} must be admitted from a superset key`)
  }
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

// The scope each route actually enforces, read off the middleware itself. Every guard is
// the same named function (`apiKeyScopeGuard`), so nothing else on the stack distinguishes
// them — requireApiKeyScope stamps `requiredScope` on what it returns precisely so this
// walk is possible. Reading it here rather than trusting the route file is the point: it
// is the only way a MOVE between the two scopes fails a test instead of passing silently.
async function routesByScope () {
  const { default: router } = await import('../routes/diagnostics.js')
  const out = {}
  for (const layer of router.stack.filter(l => l.route)) {
    const guards = layer.route.stack.map(s => s.handle).filter(h => h.requiredScope)
    assert.strictEqual(
      guards.length, 1,
      `${layer.route.path} must carry exactly one scope guard, found ${guards.length}`
    )
    const scope = guards[0].requiredScope
    ;(out[scope] ||= []).push(layer.route.path)
  }
  for (const paths of Object.values(out)) paths.sort()
  return out
}

test('🔴 the five roadmap §1.5 diagnostic routes are EXACTLY the read:diagnostics set', async () => {
  const byScope = await routesByScope()
  // Exact list, per scope. The all-routes-are-guarded test above proves each route carries
  // a guard; this proves each carries the RIGHT one. A volume route moved under the
  // diagnostics guard would widen what a leaked diagnostics key reads, and would fail here
  // rather than anywhere else in the suite.
  assert.deepStrictEqual(byScope[SCOPE_READ_DIAGNOSTICS], [
    '/data-flow',
    '/data-quality',
    '/site-health',
    '/verify-events',
    '/workspace-context'
  ])
})

test('🔴 the two volume routes are EXACTLY the read:volume set — no diagnostic route among them', async () => {
  const byScope = await routesByScope()
  assert.deepStrictEqual(byScope[SCOPE_READ_VOLUME], [
    '/campaign-volume',
    '/leads-volume'
  ])
})

test('🔴 the router enforces those two scopes and nothing else', async () => {
  const byScope = await routesByScope()
  // Catches a third scope arriving on this router without a deliberate edit here — and
  // catches read:analytics coming back.
  assert.deepStrictEqual(
    Object.keys(byScope).sort(),
    [SCOPE_READ_DIAGNOSTICS, SCOPE_READ_VOLUME].sort()
  )
})

// ── 7. §6.5 — no raw site_key may ever leave this surface ─────────────────────────────
test('🔴 workspace-context response never contains a site_key', async () => {
  const { req, nexted } = await runGuard(`Bearer ${RAW_KEY}`, [SCOPE_READ_DIAGNOSTICS])
  assert.strictEqual(nexted, true)
  // The guard's own site selection is the only place a site_key could enter the handler.
  assert.ok(!('site_key' in req.apiKeySite), 'the guard must not load site_key onto req')
})
