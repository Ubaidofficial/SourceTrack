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

// REGRESSION (prod 2026-07-16): the silent-zero clause compared a PER-RUN count against a
// ROLLING 48h count, so a normal "nothing new to attribute" run went CRITICAL whenever the
// window still held conversions an EARLIER run had attributed — process.exit(1) every 30
// min, cron permanently [CRASHED], while `conversions` graded ✅ attributed=2/store=2.
// nightly_job asserts RUN HEALTH only; the outcome is evaluateConversions' job.
test('🔴 nightly_job NOT critical: fresh success that processed 0 while the store holds 2 (the false positive that crashed the cron)', () => {
  const v = evaluateNightlyJob({ run: { status: 'success', ran_at: runAt(2), conversions_processed: 0 }, storeConversions: 2, now: NOW })
  assert.equal(v.critical, false, 'a run with nothing new to attribute is healthy — the outcome is the conversions check')
})

test('nightly_job OK: fresh success that processed conversions', () => {
  const v = evaluateNightlyJob({ run: { status: 'success', ran_at: runAt(2), conversions_processed: 12 }, now: NOW })
  assert.equal(v.critical, false)
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
