// Nightly-attribution HONEST reporting — a money-rail job must not report success on
// a swallowed failure. TOKEN-FREE, NO network (global.fetch is stubbed).
//
// The outage: nightly 403'd on EVERY PostHog query for 16 days and wrote
// status='success' every night, because the per-site catch returned failed:0 — a
// total outage was byte-identical, in job_runs, to "no conversions today".

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_HOST = 'https://ph.example.test'
process.env.POSTHOG_PROJECT_ID = '416017'
process.env.POSTHOG_PERSONAL_API_KEY = 'mock-personal-key'

const { processSite, computeTerminalStatus } = await import('../jobs/nightly-attribution.js')

// The real PostHog 403 body observed during the outage (personal API key lost the
// project scope). queryPostHog surfaces the status + body in the thrown Error.
const REAL_403_BODY = JSON.stringify({
  type: 'authentication_error',
  code: 'permission_denied',
  detail: 'You do not have permission to perform this action.'
})

const realFetch = global.fetch
function stub403 () {
  global.fetch = async () => ({ ok: false, status: 403, text: async () => REAL_403_BODY, json: async () => ({}) })
}
function restoreFetch () { global.fetch = realFetch }

// ── computeTerminalStatus: the honesty rules ─────────────────────────────────

test('computeTerminalStatus: a hard failure (thrown query) is FAILED', () => {
  assert.equal(computeTerminalStatus({ processed: 0, fetched: 0, hardFailures: 3 }), 'failed')
  assert.equal(computeTerminalStatus({ processed: 5, fetched: 5, hardFailures: 1 }), 'failed')
})

test('computeTerminalStatus: zero processed while the store returned rows is FAILED', () => {
  assert.equal(computeTerminalStatus({ processed: 0, fetched: 7, hardFailures: 0 }), 'failed')
})

test('computeTerminalStatus: zero processed AND store genuinely empty is SUCCESS (a real empty day is fine)', () => {
  assert.equal(computeTerminalStatus({ processed: 0, fetched: 0, hardFailures: 0 }), 'success')
})

test('computeTerminalStatus: processed > 0 is SUCCESS', () => {
  assert.equal(computeTerminalStatus({ processed: 4, fetched: 4, hardFailures: 0 }), 'success')
})

// ── Fix #1: a THROWN query returns failed>=1 (never failed:0) ────────────────

test('processSite: a thrown PostHog query (real 403 body) returns failed>=1 and queryFailed', async (t) => {
  t.after(restoreFetch)
  stub403()
  const result = await processSite({ id: 'site-1', site_key: 'sk_test' })
  assert.equal(result.processed, 0)
  assert.ok(result.failed >= 1, 'a thrown query must set failed >= 1, not 0')
  assert.equal(result.queryFailed, true)
  assert.equal(result.fetched, 0)
})

// ── 🔴 REGRESSION: the actual outage — 403 on EVERY site → FAILED + RED ───────

test('🔴 REGRESSION: PostHog 403 on every site → job reports FAILED and would alert RED', async (t) => {
  t.after(restoreFetch)
  stub403()
  const sites = [{ id: 's1', site_key: 'a' }, { id: 's2', site_key: 'b' }, { id: 's3', site_key: 'c' }]

  // Mirror main()'s worker aggregation.
  let totalProcessed = 0, totalFetched = 0, totalHardFailures = 0
  for (const site of sites) {
    const r = await processSite(site)
    totalProcessed += r.processed
    totalFetched += r.fetched || 0
    if (r.queryFailed) totalHardFailures++
  }

  assert.equal(totalHardFailures, 3, 'every site query failed')
  const status = computeTerminalStatus({ processed: totalProcessed, fetched: totalFetched, hardFailures: totalHardFailures })
  assert.equal(status, 'failed', 'a total outage MUST report failed — this is the whole point')
  // The EOF handler emits 🔴 whenever status !== 'success'.
  const slackEmoji = status === 'success' ? '✅' : '🔴'
  assert.equal(slackEmoji, '🔴', 'Slack must alert RED on a failed run')
})
