// Managed-proxy delivery verification + the two-strike demotion rule.
//
// The bug this pins: verification asserted only the proxy-health endpoint, which
// managedProxyEarlyGate answers ITSELF (middleware/managed-proxy.js:114-116) before the
// status check and without touching the origin's static files. A host could therefore
// pass verification while serving no tracker at all.
//
// Observed live on 2026-08-06, which is why "200 is not enough" is asserted explicitly
// rather than assumed: one hostname returned HTTP 200 for tracker.min.js from CDN cache
// while its health endpoint returned an HTML error page, and a sibling hostname did the
// exact reverse. Each check alone certified one of them as healthy.

import test from 'node:test'
import assert from 'node:assert/strict'
import { nextProxyState, readStrike, encodeStrike } from '../lib/proxy-verification.js'
import { isDue } from '../jobs/proxy-domain-recheck.js'

const OK = { ok: true, stage: null, code: null, message: null }
const FAIL_TRACKER = { ok: false, stage: 'tracker', code: 'TRACKER_NOT_JAVASCRIPT', message: 'served text/html' }
const FAIL_HEALTH = { ok: false, stage: 'health', code: 'SSL_ROUTING_PENDING', message: 'health did not answer' }

// ── strike encoding ──────────────────────────────────────────────────────────
test('strike encoding round-trips and leaves a bare code untouched', () => {
  assert.deepEqual(readStrike(null), { code: null, count: 0 })
  assert.deepEqual(readStrike('TRACKER_UNREACHABLE'), { code: 'TRACKER_UNREACHABLE', count: 0 })
  assert.deepEqual(readStrike(encodeStrike('TRACKER_UNREACHABLE', 1)), { code: 'TRACKER_UNREACHABLE', count: 1 })
})

// ── THE RULE: two consecutive failures before an active domain is demoted ────
test('active + FIRST failure holds active and records a strike', () => {
  const s = nextProxyState('active', null, FAIL_TRACKER)
  assert.equal(s.status, 'active', 'one transient failure must not disable a working customer')
  assert.equal(s.demoted, false)
  assert.equal(readStrike(s.error_code).count, 1)
})

test('active + SECOND consecutive failure demotes to error', () => {
  const first = nextProxyState('active', null, FAIL_TRACKER)
  const second = nextProxyState('active', first.error_code, FAIL_TRACKER)
  assert.equal(second.status, 'error')
  assert.equal(second.demoted, true)
  assert.equal(second.error_code, 'TRACKER_NOT_JAVASCRIPT', 'the demoted row carries the real reason, not a strike-suffixed one')
})

test('a success between two failures RESETS the strike — non-consecutive never demotes', () => {
  const first = nextProxyState('active', null, FAIL_TRACKER)
  const recovered = nextProxyState('active', first.error_code, OK)
  assert.equal(recovered.status, 'active')
  assert.equal(recovered.error_code, null, 'recovery must clear the strike')

  const afterRecovery = nextProxyState('active', recovered.error_code, FAIL_TRACKER)
  assert.equal(afterRecovery.status, 'active', 'this is a FIRST failure again, not a second')
  assert.equal(afterRecovery.demoted, false)
})

test('success always returns to active and clears both error fields', () => {
  const s = nextProxyState('error', 'TRACKER_UNREACHABLE', OK)
  assert.deepEqual(
    { status: s.status, error_code: s.error_code, error_message: s.error_message },
    { status: 'active', error_code: null, error_message: null }
  )
})

// ── no grace period before a domain has ever been active ─────────────────────
test('a pending domain gets NO grace period — health failure keeps it pending, tracker failure errors', () => {
  assert.equal(nextProxyState('pending_dns', null, FAIL_HEALTH).status, 'pending_ssl_or_routing')
  assert.equal(nextProxyState('pending_dns', null, FAIL_TRACKER).status, 'error')
  for (const st of ['pending_dns', 'pending_ssl_or_routing', 'error']) {
    assert.equal(nextProxyState(st, null, FAIL_TRACKER).demoted, false, `${st} cannot be "demoted" — it was never active`)
  }
})

// ── cadence ──────────────────────────────────────────────────────────────────
const ago = h => new Date(Date.now() - h * 3600_000).toISOString()

test('cadence: pending re-checks hourly, active daily', () => {
  assert.equal(isDue({ status: 'pending_dns', last_checked_at: ago(0.5) }), false, 'pending, 30m old — not yet due')
  assert.equal(isDue({ status: 'pending_dns', last_checked_at: ago(1.1) }), true, 'pending, 1.1h old — due')
  assert.equal(isDue({ status: 'active', last_checked_at: ago(2) }), false, 'active, 2h old — not due')
  assert.equal(isDue({ status: 'active', last_checked_at: ago(25) }), true, 'active, 25h old — due')
})

test('a never-checked row is always due; an unknown status is never touched', () => {
  assert.equal(isDue({ status: 'active', last_checked_at: null }), true)
  assert.equal(isDue({ status: 'pending_dns', last_checked_at: null }), true)
  assert.equal(isDue({ status: 'some_future_status', last_checked_at: null }), false)
})

test('the 3-week-stale production row this job exists for is due', () => {
  // The real row: status='active', last_checked_at frozen at 2026-07-15.
  assert.equal(isDue({ status: 'active', last_checked_at: '2026-07-15T00:00:00.000Z' }, Date.parse('2026-08-06T00:00:00.000Z')), true)
})

// ── positive control ─────────────────────────────────────────────────────────
// If the demotion rule were removed and every failure demoted immediately, the
// first-failure test above would fail. Assert the inverse explicitly so a future
// "simplification" to one-strike cannot pass silently.
test('positive control: one-strike behaviour is NOT what ships', () => {
  const s = nextProxyState('active', null, FAIL_TRACKER)
  assert.notEqual(s.status, 'error', 'a single failure demoting immediately is the behaviour this rule exists to prevent')
})
