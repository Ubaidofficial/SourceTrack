// gsc-daily-sync job_runs status derivation — proves the nightly job no longer reports
// a clean "success" when nothing synced or a connection is disqualified. Regression for the
// prod bug where status:'success' was hardcoded and 3 weeks of failures read as successes.
import test from 'node:test'
import assert from 'node:assert/strict'

// nightly-attribution.js calls getSupabase() at module load — give it dummy env
// (token-free, no network), same as the other nightly unit tests.
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const { deriveGscJobStatus } = await import('../jobs/nightly-attribution.js')

test('a per-connection failure with zero records synced MUST NOT be a success', () => {
  const out = deriveGscJobStatus({ eligible: 1, failed: 1, records_synced: 0 })
  assert.notEqual(out.status, 'success', 'a failed-with-nothing-synced run must not report success')
  assert.equal(out.status, 'failed')
  assert.ok(out.error_message, 'error_message must be populated')
})

test('eligible:0 with a connection in error/needs_reconnect writes a non-null error_message', () => {
  const out = deriveGscJobStatus({ eligible: 0, failed: 0, records_synced: 0 }, 1)
  assert.notEqual(out.error_message, null, 'must name the disqualified connection(s)')
  assert.match(out.error_message, /error\/needs_reconnect/)
  assert.notEqual(out.status, 'success', 'a fully-disqualified batch must not read as success')
})

test('eligible:0 with genuinely zero connections MAY report success', () => {
  const out = deriveGscJobStatus({ eligible: 0, failed: 0, records_synced: 0 }, 0)
  assert.equal(out.status, 'success', 'no connections at all is a legitimate success')
})

test('partial failure (some synced, some failed) reports partial', () => {
  const out = deriveGscJobStatus({ eligible: 2, failed: 1, records_synced: 5 })
  assert.equal(out.status, 'partial', "'partial' is an allowed job_runs status")
  assert.ok(out.error_message)
})

test('happy path is unchanged — success with null error_message', () => {
  const out = deriveGscJobStatus({ eligible: 2, failed: 0, records_synced: 10 })
  assert.equal(out.status, 'success')
  assert.equal(out.error_message, null)
})
