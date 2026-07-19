// Nightly-attribution HONEST reporting — a money-rail job must not report success on a
// swallowed failure. TOKEN-FREE, NO network.
//
// The original outage: the nightly 403'd on EVERY PostHog query for 16 days and wrote
// status='success' every night, because the per-site catch returned failed:0 — a total
// outage was byte-identical, in job_runs, to "no conversions today". PostHog is now
// decommissioned (B3 step 4 deleted queryPostHog), so the read-failure surface moved to the
// Tinybird pipe returning null — covered by nightly-normal-path-fail-closed.test.js. This file
// keeps the deterministic honesty rules that make either outage report FAILED, not SUCCESS.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const { computeTerminalStatus } = await import('../jobs/nightly-attribution.js')

// ── computeTerminalStatus: the honesty rules ─────────────────────────────────

test('computeTerminalStatus: a hard failure (a site read failed) is FAILED', () => {
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

test('🔴 the outage shape reports FAILED: a total read failure (all sites hard-failed) is never a silent empty day', () => {
  // hardFailures>0 wins over any processed/fetched combination — a swallowed outage cannot mask as success.
  const status = computeTerminalStatus({ processed: 0, fetched: 0, hardFailures: 3 })
  assert.equal(status, 'failed')
  const slackEmoji = status === 'success' ? '✅' : '🔴'
  assert.equal(slackEmoji, '🔴', 'Slack must alert RED on a failed run')
})
