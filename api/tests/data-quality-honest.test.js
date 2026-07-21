// data-quality-check must not report status 'ok' for checks it did NOT run (KI-45, the
// silent-success class). A site below the data-sufficiency threshold has its ratio checks
// SKIPPED — that skip is recorded as 'skipped' (unknown), never 'ok' (healthy). A site above the
// threshold still gets the real ok/warning/critical verdict, unchanged. TOKEN-FREE, NO network
// (the run-guard keeps run() from firing on import). Sibling precedent: anomaly-watcher-honest,
// health-agent-asserts.
import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const { insufficientDataStatus, DATA_SUFFICIENCY_MIN, classify, classifyMax, checkErrorReport } =
  await import('../jobs/data-quality-check.js')

// ── skip path: below threshold -> 'skipped', never 'ok' ──────────────────────────────────────
test("below the data-sufficiency threshold writes 'skipped', NOT 'ok'", () => {
  assert.equal(insufficientDataStatus(0), 'skipped')
  assert.equal(insufficientDataStatus(4), 'skipped')
  assert.equal(insufficientDataStatus(DATA_SUFFICIENCY_MIN - 1), 'skipped')
  // The whole point of KI-45: a skipped check is never rendered/recorded as healthy.
  assert.notEqual(insufficientDataStatus(0), 'ok')
})

test('at or above the threshold does NOT skip (real checks run)', () => {
  assert.equal(insufficientDataStatus(DATA_SUFFICIENCY_MIN), null)
  assert.equal(insufficientDataStatus(5), null)
  assert.equal(insufficientDataStatus(100), null)
})

// ── real checks: threshold verdicts unchanged ────────────────────────────────────────────────
test('classify (higher-is-better) still returns ok/warning/critical, unchanged', () => {
  assert.equal(classify(0.9, 0.5, 0.2), 'ok')
  assert.equal(classify(0.3, 0.5, 0.2), 'warning')
  assert.equal(classify(0.1, 0.5, 0.2), 'critical')
})

test('classifyMax (lower-is-better) still returns ok/warning/critical, unchanged', () => {
  assert.equal(classifyMax(0.5, 0.7, 0.9), 'ok')
  assert.equal(classifyMax(0.8, 0.7, 0.9), 'warning')
  assert.equal(classifyMax(0.95, 0.7, 0.9), 'critical')
})

// ── PR B: a thrown check leaves a VISIBLE 'skipped' row, not an absent one ────────────────────
test("a thrown check reports 'skipped' under a distinct <check>_error name — never ok/critical", () => {
  const r = checkErrorReport('source_attribution_rate', new Error('boom'))
  assert.equal(r.status, 'skipped')
  assert.notEqual(r.status, 'ok')       // must not look healthy
  assert.notEqual(r.status, 'critical') // and must not look like a threshold failure
  assert.equal(r.check_name, 'source_attribution_rate_error') // suffix ⇒ not mistaken for a verdict
  assert.match(r.message, /boom/)       // error text preserved for the operator
})

test('checkErrorReport tolerates a non-Error throw', () => {
  const r = checkErrorReport('non_direct_rate', 'raw string error')
  assert.equal(r.status, 'skipped')
  assert.equal(r.check_name, 'non_direct_rate_error')
  assert.match(r.message, /raw string error/)
})
