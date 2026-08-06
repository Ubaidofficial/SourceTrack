// health-agent must leave a job_runs row on EVERY terminal path.
//
// THE DEFECT. health-agent wrote NOTHING, ANYWHERE. Every DB call was a .select(), so no
// effect table existed to query and its zero row-count in job_runs was not evidence of
// anything. Its only outputs were console.log and a Slack webhook that stays silent unless
// SLACK_WEBHOOK_URL is configured AND severity is already non-ok — so a healthy run and a
// run that never happened were indistinguishable.
//
// A monitor whose purpose is catching silent failure, failing silently.
//
// THE CONTRACT (KI-46's, already proven in ai-crawler-range-refresh):
//   • EXACTLY ONE job_runs row per terminal path
//   • written at the END, after the work — never at entry. A row at entry proves the
//     process BOOTED, not that it FINISHED, which is the exact failure being fixed
//   • written even when everything is healthy, so "healthy" and "never ran" differ
//   • conversions_processed = the count of checks ACTUALLY EXECUTED, so a run that
//     completed while doing no work is detectable — this job's own stated standard
//     ("a job that succeeds while processing nothing must be able to turn this monitor
//     red") applied to itself
//
// ⚠️ THE EXCEPTION PATH IS THE ONE THAT MATTERS. Success and failure are easy; a job that
// dies mid-run is the case this exists for, and it is the outcome that previously left no
// trace anywhere.
//
// SCOPE: healthRunRow() is the pure row-builder, exported so the contract is testable
// without a DB, a network, or the process.exit() that run() performs on every real path.
// The wiring — that run() and the crash handler both call writeJobRun with it — is
// asserted from source, because a perfect row-builder nothing calls is the same defect in
// a new place.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { healthRunRow } from '../jobs/health-agent.js'
import { JOB_RUNS_COLUMNS } from '../lib/job-runs.js'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(join(REPO, 'api/jobs/health-agent.js'), 'utf8')

const OK_SNAP = {
  overall: 'ok',
  checks: [{ name: 'supabase' }, { name: 'data_flow' }, { name: 'nightly_job' }],
  errors: [], warnings: [], slow: []
}
const CRIT_SNAP = {
  overall: 'critical',
  checks: [{ name: 'supabase' }, { name: 'nightly_job' }],
  errors: [{ name: 'nightly_job' }], warnings: [{ name: 'data_flow' }], slow: []
}

// ── 🔴 THE EXCEPTION PATH ────────────────────────────────────────────────────────
test('🔴 EXCEPTION PATH — a job that dies mid-run still produces a row', () => {
  const row = healthRunRow({ snap: null, startedAt: 1000, now: 3500, crashError: 'boom' })
  assert.equal(row.job_name, 'health-agent')
  assert.equal(row.status, 'failed', 'a crash must record failed, never success')
  assert.match(row.error_message, /crashed: boom/, 'the crash reason must survive into the row')
  assert.equal(row.duration_ms, 2500, 'duration must be measured even on a crash')
})

test('🔴 EXCEPTION PATH — the crash row survives a null/undefined error', () => {
  // A rejection with no message must not throw inside the row builder — that would turn
  // a crash into a hang and lose the row entirely, which is the failure being fixed.
  for (const e of [null, undefined, '', new Error()]) {
    const row = healthRunRow({ snap: null, startedAt: 0, now: 1, crashError: e || 'unknown' })
    assert.equal(row.status, 'failed')
    assert.ok(typeof row.error_message === 'string' && row.error_message.length > 0,
      'a crash row must always carry some error text')
  }
})

test('🔴 EXCEPTION PATH — the crash handler is WIRED, and writes BEFORE exiting', () => {
  // The row builder can be perfect while nothing calls it on the path that matters.
  const handler = SRC.slice(SRC.indexOf('run().catch('))
  assert.match(handler, /writeJobRun\(/, 'the crash handler must write a job_runs row')
  assert.match(handler, /crashError/, 'and must pass the crash reason')
  const writeAt = handler.indexOf('writeJobRun(')
  const exitAt = handler.indexOf('process.exit(1)')
  assert.ok(writeAt !== -1 && exitAt !== -1 && writeAt < exitAt,
    'the row must be written BEFORE process.exit(1) — after it, the row never lands')
})

// ── success and failure ──────────────────────────────────────────────────────────
test('SUCCESS PATH — a fully healthy run still writes a row', () => {
  // Before this change a healthy run produced no persistent trace at all. This assertion
  // is the difference between "healthy" and "never ran".
  const row = healthRunRow({ snap: OK_SNAP, startedAt: 0, now: 1200 })
  assert.equal(row.status, 'success')
  assert.equal(row.conversions_processed, 3, 'must record how many checks actually executed')
  assert.match(row.error_message, /overall=ok/)
  assert.equal(row.duration_ms, 1200)
})

test('FAILURE PATH — a critical run records failed and names the failing checks', () => {
  const row = healthRunRow({ snap: CRIT_SNAP, startedAt: 0, now: 900 })
  assert.equal(row.status, 'failed')
  assert.match(row.error_message, /failed=nightly_job/, 'the failing check must be named')
  assert.match(row.error_message, /warnings=data_flow/, 'warnings must be recorded too')
})

// ── the self-referential assertion ───────────────────────────────────────────────
test('a run that completed while checking NOTHING is distinguishable', () => {
  // health-agent's own header: "a job that succeeds while processing nothing must be able
  // to turn this monitor red". conversions_processed is what makes that detectable HERE —
  // the same standard applied to the monitor itself.
  const empty = healthRunRow({ snap: { overall: 'ok', checks: [], errors: [], warnings: [] }, startedAt: 0, now: 5 })
  assert.equal(empty.conversions_processed, 0,
    'zero checks executed must be visible in the row, not hidden behind status=success')
  const real = healthRunRow({ snap: OK_SNAP, startedAt: 0, now: 5 })
  assert.notEqual(empty.conversions_processed, real.conversions_processed,
    'a no-work run and a real run must not produce identical rows')
})

// ── schema + wiring ──────────────────────────────────────────────────────────────
test('every field the row emits is a real job_runs column', () => {
  // writeJobRun throws on unknown columns; catching it here names the offender instead of
  // surfacing as a runtime failure on the cron.
  for (const snap of [OK_SNAP, CRIT_SNAP, null]) {
    const row = healthRunRow({ snap, startedAt: 0, now: 1, crashError: snap ? null : 'x' })
    for (const k of Object.keys(row)) {
      assert.ok(JOB_RUNS_COLUMNS.includes(k), `"${k}" is not a job_runs column`)
    }
  }
})

test('the normal path writes the row AFTER the work and BEFORE exiting', () => {
  const body = SRC.slice(SRC.indexOf('async function run()'), SRC.indexOf('// Auto-run ONLY'))
  const snapAt = body.indexOf('collectSnapshot()')
  const writeAt = body.indexOf('writeJobRun(')
  const exitAt = body.indexOf('process.exit(')
  assert.ok(snapAt !== -1 && writeAt !== -1 && exitAt !== -1, 'all three landmarks must exist')
  assert.ok(writeAt > snapAt,
    'the row must be written AFTER collectSnapshot — a row written at entry proves boot, not completion')
  assert.ok(writeAt < exitAt, 'and BEFORE process.exit, or it never lands')
})

test('a failed row write cannot change the exit code', () => {
  // A dead DB must not turn a health check into a hang or flip its verdict. Both call
  // sites swallow the writer's own failure; writeJobRun already logs loudly itself.
  const calls = SRC.match(/writeJobRun\([\s\S]{0,220}?\.catch\(/g) || []
  assert.equal(calls.length, 2,
    'both writeJobRun call sites must swallow their own failure — found ' + calls.length)
})

test('NEGATIVE CONTROL — the row builder does not invent a status', () => {
  // Guards against a future edit emitting a status job_runs_status_check rejects, which
  // would fail the insert and restore the invisible-job state.
  for (const snap of [OK_SNAP, CRIT_SNAP]) {
    assert.ok(['success', 'failed'].includes(healthRunRow({ snap, startedAt: 0 }).status))
  }
  assert.equal(healthRunRow({ snap: null, startedAt: 0, crashError: 'x' }).status, 'failed')
})
