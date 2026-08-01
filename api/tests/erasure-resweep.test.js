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
// Every real erasure_log row has requested_at (column default now()). Fixtures carry it so the
// stub's age filter is exercised rather than bypassed.
const ELIGIBLE = new Date(NOW - 60 * 60 * 1000).toISOString()

// Supabase stub covering the eligibility SELECT and the two ledger UPDATEs.
//
// The stub EVALUATES the age filter rather than echoing back whatever it was handed, so these
// tests discriminate the real predicate instead of asserting a string. Concretely:
//   * if the code calls .lt('executed_at', cutoff)  -> only executed_at is compared (the OLD,
//     buggy behaviour, which drops every NULL-executed_at row)
//   * if the code calls .or(...) with the null-fallback branch -> COALESCE semantics
// A revert to `.lt('executed_at', …)` therefore FAILS the failed-status test below rather than
// quietly passing it.
function ledger ({ rows = [], readError = null } = {}) {
  const updates = []
  const captured = { filters: {} }
  const applyAgeFilter = (all) => {
    const { orExpr, ltCol, cutoff } = captured.filters
    if (orExpr) {
      const m = orExpr.match(/"([^"]+)"/)
      const c = m ? m[1] : cutoff
      const hasNullFallback = /executed_at\.is\.null/.test(orExpr)
      return all.filter(r =>
        (r.executed_at != null && r.executed_at < c) ||
        (hasNullFallback && r.executed_at == null && r.requested_at != null && r.requested_at < c)
      )
    }
    if (ltCol === 'executed_at') {
      // NULL < anything is never true in Postgres — model that faithfully.
      return all.filter(r => r.executed_at != null && r.executed_at < cutoff)
    }
    return all
  }
  const api = {
    updates,
    captured,
    from () {
      const b = {
        select: () => b,
        in: (col, vals) => { captured.filters.statuses = vals; return b },
        is: (col, v) => { captured.filters.isNull = col; return b },
        lt: (col, v) => { captured.filters.ltCol = col; captured.filters.cutoff = v; return b },
        or: (expr) => { captured.filters.orExpr = expr; return b },
        order: () => b,
        limit: () => Promise.resolve(readError ? { data: null, error: { message: readError } } : { data: applyAgeFilter(rows), error: null }),
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
  const cutoff = new Date(NOW - RESWEEP_ELIGIBLE_AFTER_MS).toISOString()
  assert.ok(db.captured.filters.orExpr?.includes(cutoff), 'the cutoff must be applied')
})

test('🔴 a FAILED erasure (executed_at NULL) is eligible — it must not be excluded forever', async () => {
  // THE BUG THIS GUARDS. gdpr.js writes `executed_at: eraseExecuted(status) ? now : null`, so it
  // is NULL for every status except 'executed' — including 'failed'. `NULL < cutoff` is NULL in
  // Postgres, never true, so filtering on executed_at ALONE silently excluded every failed
  // erasure from the sweep forever: exactly the rows RESWEEPABLE_STATUSES says must "retry the
  // erasure itself". Silent, because a failed erasure simply never reappeared — no error, no log,
  // and the sweep kept reporting clean runs.
  //
  // No pre-existing test constructed a row this shape, which is why it stayed green.
  const old = new Date(NOW - 60 * 60 * 1000).toISOString()   // an hour ago, well past eligibility
  const db = ledger({
    rows: [
      { id: 'failed-1', subject_id: 'a', site_id: 's', status: 'failed', executed_at: null, requested_at: old, resweep_attempts: 0 },
      { id: 'exec-1', subject_id: 'b', site_id: 's', status: 'executed', executed_at: old, requested_at: old, resweep_attempts: 0 }
    ]
  })
  const { rows } = await findPendingResweeps(db, { now: NOW })
  const ids = rows.map(r => r.id)
  assert.ok(ids.includes('failed-1'), 'a failed erasure with executed_at NULL MUST be swept')
  assert.ok(ids.includes('exec-1'), 'and executed rows are still selected')
  // The fallback branch must be present, not merely a wider filter that happens to pass.
  assert.match(db.captured.filters.orExpr, /executed_at\.is\.null/)
  assert.match(db.captured.filters.orExpr, /requested_at\.lt/)
})

test('a not-yet-eligible failed erasure is still excluded — the fallback widens the column, not the window', async () => {
  const recent = new Date(NOW - 30 * 1000).toISOString()   // 30s ago: inside the anti-collision window
  const db = ledger({
    rows: [{ id: 'failed-recent', subject_id: 'a', site_id: 's', status: 'failed', executed_at: null, requested_at: recent, resweep_attempts: 0 }]
  })
  const { rows } = await findPendingResweeps(db, { now: NOW })
  assert.equal(rows.length, 0, 'requested_at must still be compared against the cutoff')
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
  const db = ledger({ rows: [{ id: 'e1', subject_id: 's', site_id: 'site', requested_at: ELIGIBLE, resweep_attempts: 0 }] })
  const s = await runErasureResweep(db, { host: 'h', adminToken: null, now: NOW })
  assert.equal(s.readFailed, true)
  assert.equal(db.updates.length, 0, 'no ledger write when nothing was attempted')
  assert.match(s.errors[0], /TINYBIRD_ADMIN_TOKEN/)
})

test('a successful re-sweep marks the erasure complete and stops retrying it', async () => {
  __setResweepEraseFn(erased('executed'))
  const db = ledger({ rows: [{ id: 'e1', subject_id: 'anon-1', site_id: 'site-1', requested_at: ELIGIBLE, resweep_attempts: 0 }] })
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
  const db = ledger({ rows: [{ id: 'e1', subject_id: 'anon-1', site_id: 'site-1', requested_at: ELIGIBLE, resweep_attempts: 0 }] })
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

  const first = ledger({ rows: [{ id: 'e1', subject_id: 'a', site_id: 's', requested_at: ELIGIBLE, resweep_attempts: 0 }] })
  assert.equal((await runErasureResweep(first, { host: 'h', adminToken: 'admin', now: NOW })).alerting, 0)

  const second = ledger({ rows: [{ id: 'e1', subject_id: 'a', site_id: 's', requested_at: ELIGIBLE, resweep_attempts: 1 }] })
  assert.equal((await runErasureResweep(second, { host: 'h', adminToken: 'admin', now: NOW })).alerting, 0)

  const third = ledger({ rows: [{ id: 'e1', subject_id: 'a', site_id: 's', requested_at: ELIGIBLE, resweep_attempts: RESWEEP_ALERT_AFTER_ATTEMPTS - 1 }] })
  assert.equal((await runErasureResweep(third, { host: 'h', adminToken: 'admin', now: NOW })).alerting, 1)
})

test('a delete that succeeded but could not be recorded is counted as FAILED, not swept', async () => {
  // Claiming success we cannot prove is the failure mode this whole arc removes. Re-running an
  // idempotent delete costs nothing; a false "done" is unrecoverable.
  __setResweepEraseFn(erased('executed'))
  const db = {
    from () {
      const b = {
        select: () => b, in: () => b, is: () => b, lt: () => b, or: () => b, order: () => b,
        limit: () => Promise.resolve({ data: [{ id: 'e1', subject_id: 'a', site_id: 's', requested_at: ELIGIBLE, resweep_attempts: 0 }], error: null }),
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
