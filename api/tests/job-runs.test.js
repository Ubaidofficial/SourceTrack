import test from 'node:test'
import assert from 'node:assert'
import { writeJobRun, JOB_RUNS_COLUMNS } from '../lib/job-runs.js'

// Minimal supabase double: captures the inserted row and returns a configurable
// { error } so we can prove the helper surfaces (not swallows) a DB error.
function makeSupabase({ error = null } = {}) {
  const inserts = []
  return {
    inserts,
    from() {
      return { insert: (row) => { inserts.push(row); return Promise.resolve({ error }) } }
    }
  }
}

test('writeJobRun — accepts only the real job_runs columns', async () => {
  const db = makeSupabase()
  const res = await writeJobRun(db, {
    job_name: 'email-reports-weekly',
    status: 'success',
    error_message: 'Sent 5, skipped 2, errors 0',
    ran_at: '2026-06-28T00:00:00Z'
  })
  assert.strictEqual(res.error, null)
  assert.strictEqual(db.inserts.length, 1)
  assert.deepStrictEqual(db.inserts[0].job_name, 'email-reports-weekly')
})

test('writeJobRun — REJECTS the nonexistent `details` column (the original bug)', async () => {
  const db = makeSupabase()
  await assert.rejects(
    () => writeJobRun(db, { job_name: 'x', status: 'success', details: 'Sent 5' }),
    /unknown job_runs column\(s\): details/
  )
  assert.strictEqual(db.inserts.length, 0, 'must not attempt the insert with a bad column')
})

test('writeJobRun — SURFACES a DB insert error (never swallows)', async () => {
  const db = makeSupabase({ error: { message: 'permission denied' } })
  const calls = []
  const origErr = console.error
  console.error = (...a) => calls.push(a.join(' '))
  try {
    const res = await writeJobRun(db, { job_name: 'x', status: 'success' })
    assert.ok(res.error, 'error is returned, not swallowed')
    assert.strictEqual(res.error.message, 'permission denied')
    assert.ok(calls.some(c => c.includes('insert FAILED')), 'logs the failure loudly')
  } finally {
    console.error = origErr
  }
})

test('JOB_RUNS_COLUMNS — matches the verified prod schema (no `details`)', () => {
  assert.deepStrictEqual(
    [...JOB_RUNS_COLUMNS].sort(),
    ['conversions_processed', 'duration_ms', 'error_message', 'job_name', 'ran_at', 'status']
  )
  assert.ok(!JOB_RUNS_COLUMNS.includes('details'))
})
