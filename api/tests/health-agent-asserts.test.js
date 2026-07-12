// health-agent turns OBSERVATIONS into ASSERTIONS. TOKEN-FREE, NO network.
// A check that cannot go red on a business-logic failure is not a check — during the
// outage nightly_job/conversions were graded ✅ while conversions were 0 for weeks.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const { evaluateNightlyJob, evaluateConversions } = await import('../jobs/health-agent.js')

const NOW = Date.parse('2026-07-12T09:00:00Z')
const runAt = (hoursAgo) => new Date(NOW - hoursAgo * 3_600_000).toISOString()

// ── evaluateNightlyJob ───────────────────────────────────────────────────────

test('nightly_job CRITICAL: no run has ever been recorded', () => {
  assert.equal(evaluateNightlyJob({ run: null, now: NOW }).critical, true)
})

test('nightly_job CRITICAL: last run status is not success', () => {
  const v = evaluateNightlyJob({ run: { status: 'failed', ran_at: runAt(2), error_message: '3 site queries failed' }, now: NOW })
  assert.equal(v.critical, true)
  assert.match(v.reason, /failed/)
})

test('nightly_job CRITICAL: last run is stale (> 26h)', () => {
  const v = evaluateNightlyJob({ run: { status: 'success', ran_at: runAt(30), conversions_processed: 5 }, now: NOW })
  assert.equal(v.critical, true)
  assert.match(v.reason, /stale/)
})

test('🔴 nightly_job CRITICAL: the outage signature — 0 processed while the store has recent conversions', () => {
  const v = evaluateNightlyJob({ run: { status: 'success', ran_at: runAt(2), conversions_processed: 0 }, storeConversions: 2, now: NOW })
  assert.equal(v.critical, true, 'a "successful" run that processed 0 while the store has 2 must be CRITICAL')
})

test('nightly_job OK: fresh success that processed conversions', () => {
  const v = evaluateNightlyJob({ run: { status: 'success', ran_at: runAt(2), conversions_processed: 12 }, storeConversions: 12, now: NOW })
  assert.equal(v.critical, false)
})

test('nightly_job OK: a genuine empty day (0 processed, store also 0) is NOT critical', () => {
  const v = evaluateNightlyJob({ run: { status: 'success', ran_at: runAt(2), conversions_processed: 0 }, storeConversions: 0, now: NOW })
  assert.equal(v.critical, false)
})

test('nightly_job does NOT assert the silent-zero rule when the store is unreachable (null)', () => {
  const v = evaluateNightlyJob({ run: { status: 'success', ran_at: runAt(2), conversions_processed: 0 }, storeConversions: null, now: NOW })
  assert.equal(v.critical, false, 'unknown store → cannot claim silent failure (posthog check covers connectivity)')
})

// ── evaluateConversions ──────────────────────────────────────────────────────

test('🔴 conversions CRITICAL: 0 attributed in 48h while the store has recent conversions', () => {
  assert.equal(evaluateConversions({ attributed48h: 0, storeConversions: 2 }).critical, true)
})

test('conversions OK: some attributed', () => {
  assert.equal(evaluateConversions({ attributed48h: 9, storeConversions: 9 }).critical, false)
})

test('conversions OK: 0 attributed but store also empty (genuine quiet period)', () => {
  assert.equal(evaluateConversions({ attributed48h: 0, storeConversions: 0 }).critical, false)
})
