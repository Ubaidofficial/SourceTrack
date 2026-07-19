// health-agent turns OBSERVATIONS into ASSERTIONS. TOKEN-FREE, NO network.
// A check that cannot go red on a business-logic failure is not a check — during the
// outage nightly_job/conversions were graded ✅ while conversions were 0 for weeks.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const { evaluateNightlyJob, evaluateConversions, evaluateDataFlow, CRITICAL_CHECKS, REQUIRED_ENV_VARS } = await import('../jobs/health-agent.js')

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

// ── evaluateDataFlow (D2: PostHog pageview count → Tinybird events_health_day fan-out) ──
// Semantics preserved from the retired global count===0 check; see the exact status strings.

test('data_flow OK: at least one monitored site has tracked events in 24h', async () => {
  const v = await evaluateDataFlow({ sites: [{ id: 'a' }, { id: 'b' }], queryPipe: async () => [{ cnt: 5 }] })
  assert.equal(v._status, undefined, 'no _status → check() grades it ok')
  assert.equal(v.events_24h, 10)
  assert.equal(v.sites_checked, 2)
})

test('data_flow WARNING: ALL qualifying sites return 0 events (analog of old global count===0)', async () => {
  const v = await evaluateDataFlow({ sites: [{ id: 'a' }, { id: 'b' }], queryPipe: async () => [{ cnt: 0 }] })
  assert.equal(v._status, 'warning')
  assert.equal(v.events_24h, 0)
  assert.match(v.warning, /Zero tracked events/)
})

test('🔴 data_flow ERROR: ANY site pipe read FAILS (null) → throws (check() → status error)', async () => {
  // second site fails after the first succeeds — must still throw
  let n = 0
  await assert.rejects(
    evaluateDataFlow({ sites: [{ id: 'a' }, { id: 'b' }], queryPipe: async () => (n++ === 0 ? [{ cnt: 3 }] : null) }),
    /events_health_day read failed for site b/
  )
})

test('data_flow SKIPPED: zero qualifying sites → explicit skipped status, NOT a silent pass', async () => {
  let called = false
  const v = await evaluateDataFlow({ sites: [], queryPipe: async () => { called = true; return [{ cnt: 0 }] } })
  assert.equal(v._status, 'skipped')
  assert.match(v.reason, /no qualifying sites/)
  assert.equal(v.sites_checked, 0)
  assert.equal(called, false, 'no pipe read when there are no sites')
})

// ── D2 structural retirements: posthog check + POSTHOG_* env ──────────────────

test('posthog is no longer a CRITICAL_CHECK (retired — store being decommissioned)', () => {
  assert.equal(CRITICAL_CHECKS.has('posthog'), false)
  // the surviving critical checks are unchanged
  for (const k of ['supabase', 'nightly_job', 'conversions', 'tinybird_quarantine']) {
    assert.ok(CRITICAL_CHECKS.has(k), `${k} must remain critical`)
  }
})

test('the posthog liveness check is deleted from the snapshot', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../jobs/health-agent.js'), 'utf8')
  assert.doesNotMatch(src, /check\(\s*['"]posthog['"]/, "check('posthog', ...) must not exist")
})

test('env_vars no longer requires any POSTHOG_* var (unblocks D5)', () => {
  for (const k of ['POSTHOG_API_KEY', 'POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST']) {
    assert.equal(REQUIRED_ENV_VARS.includes(k), false, `${k} must not be required`)
  }
  assert.ok(REQUIRED_ENV_VARS.includes('SUPABASE_URL'), 'Supabase URL stays required')
  assert.ok(REQUIRED_ENV_VARS.includes('SUPABASE_SERVICE_KEY'), 'Supabase service key stays required')
})
