// verifySslAndRouting() must be satisfiable ONLY by the origin, never by the gate.
//
// THE DEFECT (#648's one real gap). managedProxyEarlyGate answers
// /.well-known/sourcetrack/proxy-health itself, before the status check, and it used to
// return the exact shape the verifier asserted: { ok: true, service: 'sourcetrack-proxy' }.
// So a 200 proved the gate was up and nothing more — the request never reached the origin,
// and a customer whose origin was dead still verified green.
//
// THE FIX. The origin handler (api/index.js, mounted AFTER the gate) adds `origin: true`.
// The gate's reply carries `gate: true` instead. The verifier now requires `origin === true`,
// so the gate is STRUCTURALLY INCAPABLE of producing a passing response — which is stronger
// than trusting it not to.
//
// ⚠️ THE POSITIVE CONTROL BELOW IS THE POINT OF THIS FILE. Asserting that the origin shape
// passes proves nothing on its own: the OLD code passed that too. Only asserting that the
// GATE's shape FAILS demonstrates the fix does what it claims. Same gap as pairing
// "whatsapp is now ingested" with "the old predicate really did drop it" (#666) — without
// the second half, two indistinguishable behaviours satisfy the same test.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p) => readFileSync(join(REPO, p), 'utf8')

const GATE = read('api/middleware/managed-proxy.js')
const INDEX = read('api/index.js')
const RESOLVER = read('api/lib/dns-resolver.js')

// The predicate verifySslAndRouting applies to the parsed body, mirrored here so the
// decision can be tested without a network round trip. Kept in step by the wiring
// assertion at the bottom, which fails if the resolver's clause changes.
const accepts = (body) =>
  Boolean(body) && body.ok === true &&
  body.service === 'sourcetrack-proxy' &&
  body.origin === true

const ORIGIN_BODY = { ok: true, service: 'sourcetrack-proxy', origin: true }
const GATE_BODY = { ok: true, service: 'sourcetrack-proxy', gate: true }
const LEGACY_BODY = { ok: true, service: 'sourcetrack-proxy' }

test('the ORIGIN response passes verification', () => {
  assert.equal(accepts(ORIGIN_BODY), true,
    'the post-gate origin handler must satisfy the verifier — otherwise every domain fails')
})

test('🔴 POSITIVE CONTROL — the GATE response FAILS verification', () => {
  // This is the assertion that proves the fix. If the gate's shape ever passes, the check
  // has silently reverted to certifying its own middleware.
  assert.equal(accepts(GATE_BODY), false,
    'managedProxyEarlyGate\'s reply must NOT satisfy the verifier — if it does, a 200 proves ' +
    'only that the gate is up, which is exactly the #648 defect')
})

test('🔴 POSITIVE CONTROL — the PRE-FIX shape also fails', () => {
  // The old body had no discriminator at all. Asserting it now fails documents that the
  // change is real rather than cosmetic, and catches a partial revert that drops `origin`
  // from the origin handler while leaving the resolver's clause in place.
  assert.equal(accepts(LEGACY_BODY), false,
    'the pre-fix { ok, service } shape must no longer pass — it is indistinguishable from the gate')
})

test('NEGATIVE CONTROL — a wrong service or a falsy ok still fails', () => {
  // A predicate that accepts everything with `origin: true` would pass the tests above
  // while accepting garbage.
  assert.equal(accepts({ ok: true, service: 'something-else', origin: true }), false, 'wrong service')
  assert.equal(accepts({ ok: false, service: 'sourcetrack-proxy', origin: true }), false, 'ok false')
  assert.equal(accepts({ origin: true }), false, 'missing fields')
  assert.equal(accepts(null), false, 'null body')
})

// ── wiring: the three files must agree, or the predicate above is fiction ────────────
test('the gate emits `gate: true` and NOT `origin: true`', () => {
  const health = GATE.slice(GATE.indexOf("req.path === '/.well-known/sourcetrack/proxy-health'"))
  const block = health.slice(0, health.indexOf('\n    }') + 6)
  assert.match(block, /gate:\s*true/, 'the gate reply must carry gate:true')
  assert.doesNotMatch(block, /origin:\s*true/,
    'the gate must NEVER set origin:true — that single word restores the #648 defect')
})

test('the ORIGIN handler exists, is mounted AFTER the gate, and sets origin:true', () => {
  const gateMount = INDEX.indexOf('app.use(managedProxyEarlyGate)')
  const originRoute = INDEX.indexOf("app.get('/.well-known/sourcetrack/proxy-health'")
  assert.ok(gateMount !== -1, 'the gate must be mounted')
  assert.ok(originRoute !== -1, 'the origin health handler must exist in api/index.js')
  assert.ok(originRoute > gateMount,
    'the origin handler must be mounted AFTER the gate — before it, the gate never runs and ' +
    'reaching the handler would prove nothing about the gate')
  const route = INDEX.slice(originRoute, originRoute + 500)
  assert.match(route, /origin:\s*true/, 'the origin handler must set origin:true')
})

test('the resolver actually REQUIRES origin === true', () => {
  // The bodies could be perfect while the verifier ignores the field — which is the same
  // shape as a route calling the wrong predicate. Assert the clause exists.
  assert.match(RESOLVER, /body\.origin === true/,
    'verifySslAndRouting must assert body.origin === true')
})

// ── layer 3a: the health response must be uncacheable at the edge ────────────────────
test('both health responses set no-store, so the edge cannot cache a success', () => {
  // Measured on the live pull zone: this path was returned with
  // `cache-control: public, max-age=2592000` and `cdn-cache: HIT`. Neither a cache-buster
  // query string nor a `Cache-Control: no-cache` request header defeated it, so the ORIGIN
  // must refuse to be cached — the client cannot force freshness.
  const originRoute = INDEX.slice(INDEX.indexOf("app.get('/.well-known/sourcetrack/proxy-health'"))
  assert.match(originRoute.slice(0, 500), /no-store/,
    'the origin health handler must send Cache-Control: no-store')
  const gateHealth = GATE.slice(GATE.indexOf("req.path === '/.well-known/sourcetrack/proxy-health'"))
  assert.match(gateHealth.slice(0, 500), /no-store/,
    'the gate health reply must also be uncacheable — a cached gate reply would be served ' +
    'to the verifier for up to 30 days')
})
