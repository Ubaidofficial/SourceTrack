// Erasure re-sweep, PR 3 of 5 — the delayed second Tinybird delete.
//
// Closes the one gap PR 2 structurally cannot: a re-queued batch drains from the batcher's
// internal buffer straight to the transport, never re-entering dualWriteEvent(), so an event
// accepted just before an erasure can be delivered just after it.
//
// The properties that carry weight here are all about NOT lying when something goes wrong:
//   * a failed READ must not report "0 pending" — that makes an outage look healthy
//   * a failed re-sweep must stay eligible forever; there is no give-up state, because giving up
//     leaves a subject unprotected with no record that anyone stopped trying
//   * a missing internal secret must FAIL the health check, not quietly pass it
//   * the endpoint must fail CLOSED when unconfigured, never become an open delete trigger

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'mock-service-role-key-value'

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  runErasureResweep,
  findPendingResweeps,
  RESWEEP_ELIGIBLE_AFTER_MS,
  RESWEEP_ALERT_AFTER_ATTEMPTS,
  __setResweepEraseFn,
  __resetResweepEraseFn
} from '../lib/erasure-resweep.js'
import { requireInternalJobSecret } from '../routes/internal-jobs.js'

const NOW = Date.UTC(2026, 7, 1, 12, 0, 0)

// Supabase stub covering the eligibility SELECT and the two ledger UPDATEs.
function ledger ({ rows = [], readError = null } = {}) {
  const updates = []
  const captured = { filters: {} }
  const api = {
    updates,
    captured,
    from () {
      const b = {
        select: () => b,
        in: (col, vals) => { captured.filters.statuses = vals; return b },
        is: (col, v) => { captured.filters.isNull = col; return b },
        lt: (col, v) => { captured.filters.cutoff = v; return b },
        order: () => b,
        limit: () => Promise.resolve(readError ? { data: null, error: { message: readError } } : { data: rows, error: null }),
        update (patch) {
          const u = { patch }
          return {
            eq: (col, id) => { u.id = id; updates.push(u); const p = Promise.resolve({ error: null }); p.then = p.then.bind(p); return p }
          }
        }
      }
      return b
    }
  }
  return api
}

const erased = (status = 'executed') => async () => ({ status })

test.afterEach(() => __resetResweepEraseFn())

// ── eligibility ──────────────────────────────────────────────────────────────

test('eligibility: only attempted erasures, only un-swept, only past the anti-collision window', async () => {
  const db = ledger({ rows: [] })
  await findPendingResweeps(db, { now: NOW })
  // 'skipped_*' and 'dry_run' attempted no delete — there is nothing to finish.
  assert.deepEqual(db.captured.filters.statuses, ['executed', 'failed'])
  assert.equal(db.captured.filters.isNull, 'resweep_completed_at')
  assert.equal(db.captured.filters.cutoff, new Date(NOW - RESWEEP_ELIGIBLE_AFTER_MS).toISOString())
})

test('the eligibility window comfortably clears the ~20s requeue exposure', () => {
  // flush 10s x maxRequeue 2 = ~20s worst case. This is anti-collision spacing rather than a
  // derived margin (the */30 cron dominates the real delay), but it must never be SHORTER than
  // the window it is meant to sit behind.
  const requeueWorstCaseMs = 10_000 * 2
  assert.ok(RESWEEP_ELIGIBLE_AFTER_MS > requeueWorstCaseMs * 10,
    `eligibility (${RESWEEP_ELIGIBLE_AFTER_MS}ms) must sit well clear of the ~${requeueWorstCaseMs}ms requeue window`)
})

// ── the honesty properties ───────────────────────────────────────────────────

test('🔴 a failed READ reports readFailed — never "0 pending"', async () => {
  // Reporting zero here would make a Supabase outage look like a clean sweep, and the health
  // check would go green while nothing was ever swept.
  const db = ledger({ readError: 'connection reset' })
  const s = await runErasureResweep(db, { host: 'h', adminToken: 'admin', now: NOW })
  assert.equal(s.readFailed, true)
  assert.equal(s.swept, 0)
  assert.match(s.errors[0], /read failed/)
})

test('🔴 a missing admin token fails the sweep — it does not mark rows attempted', async () => {
  // Without the token nothing can be deleted. Incrementing attempts would burn the escalation
  // budget on work that never happened.
  const db = ledger({ rows: [{ id: 'e1', subject_id: 's', site_id: 'site', resweep_attempts: 0 }] })
  const s = await runErasureResweep(db, { host: 'h', adminToken: null, now: NOW })
  assert.equal(s.readFailed, true)
  assert.equal(db.updates.length, 0, 'no ledger write when nothing was attempted')
  assert.match(s.errors[0], /TINYBIRD_ADMIN_TOKEN/)
})

test('a successful re-sweep marks the erasure complete and stops retrying it', async () => {
  __setResweepEraseFn(erased('executed'))
  const db = ledger({ rows: [{ id: 'e1', subject_id: 'anon-1', site_id: 'site-1', resweep_attempts: 0 }] })
  const s = await runErasureResweep(db, { host: 'h', adminToken: 'admin', now: NOW })
  assert.equal(s.swept, 1)
  assert.equal(s.failed, 0)
  assert.equal(db.updates.length, 1)
  assert.equal(db.updates[0].patch.resweep_completed_at, new Date(NOW).toISOString())
})

test('🔴 a FAILED re-sweep stays eligible — there is no give-up state', async () => {
  // resweep_completed_at must remain NULL so the next cron run retries. Marking it done on
  // failure would leave the subject unprotected with the ledger claiming otherwise.
  __setResweepEraseFn(erased('failed'))
  const db = ledger({ rows: [{ id: 'e1', subject_id: 'anon-1', site_id: 'site-1', resweep_attempts: 0 }] })
  const s = await runErasureResweep(db, { host: 'h', adminToken: 'admin', now: NOW })
  assert.equal(s.failed, 1)
  assert.equal(s.swept, 0)
  const patch = db.updates[0].patch
  assert.equal(patch.resweep_attempts, 1)
  assert.ok(!('resweep_completed_at' in patch), 'must NOT be marked complete on failure')
})

test('🔴 escalation fires at the 3rd failure, not the 1st', async () => {
  // Tinybird caps ACTIVE delete jobs per workspace, so one rejection is an expected collision.
  // Alerting on it would train everyone to ignore the alert.
  __setResweepEraseFn(erased('failed'))

  const first = ledger({ rows: [{ id: 'e1', subject_id: 'a', site_id: 's', resweep_attempts: 0 }] })
  assert.equal((await runErasureResweep(first, { host: 'h', adminToken: 'admin', now: NOW })).alerting, 0)

  const second = ledger({ rows: [{ id: 'e1', subject_id: 'a', site_id: 's', resweep_attempts: 1 }] })
  assert.equal((await runErasureResweep(second, { host: 'h', adminToken: 'admin', now: NOW })).alerting, 0)

  const third = ledger({ rows: [{ id: 'e1', subject_id: 'a', site_id: 's', resweep_attempts: RESWEEP_ALERT_AFTER_ATTEMPTS - 1 }] })
  assert.equal((await runErasureResweep(third, { host: 'h', adminToken: 'admin', now: NOW })).alerting, 1)
})

test('a delete that succeeded but could not be recorded is counted as FAILED, not swept', async () => {
  // Claiming success we cannot prove is the failure mode this whole arc removes. Re-running an
  // idempotent delete costs nothing; a false "done" is unrecoverable.
  __setResweepEraseFn(erased('executed'))
  const db = {
    from () {
      const b = {
        select: () => b, in: () => b, is: () => b, lt: () => b, order: () => b,
        limit: () => Promise.resolve({ data: [{ id: 'e1', subject_id: 'a', site_id: 's', resweep_attempts: 0 }], error: null }),
        update: () => ({ eq: () => Promise.resolve({ error: { message: 'write failed' } }) })
      }
      return b
    }
  }
  const s = await runErasureResweep(db, { host: 'h', adminToken: 'admin', now: NOW })
  assert.equal(s.swept, 0)
  assert.equal(s.failed, 1)
  assert.match(s.errors[0], /ledger update failed/)
})

// ── the endpoint guard ───────────────────────────────────────────────────────

function res () {
  const r = { code: 200, body: null }
  r.status = (c) => { r.code = c; return r }
  r.json = (b) => { r.body = b; return r }
  return r
}
const req = (secret) => ({ get: (h) => (h === 'x-internal-job-secret' ? secret : undefined) })

test('🔴 the endpoint FAILS CLOSED when the secret is unconfigured — 503, never open', async () => {
  const prev = process.env.ST_INTERNAL_JOB_SECRET
  delete process.env.ST_INTERNAL_JOB_SECRET
  try {
    const r = res()
    let nexted = false
    requireInternalJobSecret(req('anything'), r, () => { nexted = true })
    assert.equal(nexted, false, 'a misconfigured secret must never fall through to the handler')
    assert.equal(r.code, 503)
  } finally { if (prev !== undefined) process.env.ST_INTERNAL_JOB_SECRET = prev }
})

test('the endpoint rejects a wrong or missing secret with 401', () => {
  const prev = process.env.ST_INTERNAL_JOB_SECRET
  process.env.ST_INTERNAL_JOB_SECRET = 'correct-horse-battery-staple'
  try {
    for (const bad of [undefined, '', 'wrong', 'correct-horse-battery-stapl', 'correct-horse-battery-stapleX']) {
      const r = res()
      let nexted = false
      requireInternalJobSecret(req(bad), r, () => { nexted = true })
      assert.equal(nexted, false, `secret ${JSON.stringify(bad)} must not pass`)
      assert.equal(r.code, 401)
    }
    // And the correct one passes.
    const ok = res()
    let nexted = false
    requireInternalJobSecret(req('correct-horse-battery-staple'), ok, () => { nexted = true })
    assert.equal(nexted, true)
  } finally {
    if (prev === undefined) delete process.env.ST_INTERNAL_JOB_SECRET
    else process.env.ST_INTERNAL_JOB_SECRET = prev
  }
})

// ── the health check's severity ──────────────────────────────────────────────

test('🔴 erasure_resweep is a CRITICAL check, not a warning', async () => {
  // A stuck re-sweep means a subject who exercised Art. 17 is still unprotected. That is the same
  // tier as the money-rail checks, not a ⚠️.
  const { CRITICAL_CHECKS } = await import('../jobs/health-agent.js')
  assert.ok(CRITICAL_CHECKS.has('erasure_resweep'))
})
