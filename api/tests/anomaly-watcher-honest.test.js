// anomaly-watcher must not report ✅ SUCCESS when its per-site scans were swallowed
// (the same lie the nightly job told). A zero-alert run is legitimate (no anomalies =
// good); a run whose scans all FAILED is not. TOKEN-FREE, NO network.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const { computeAnomalyStatus } = await import('../jobs/anomaly-watcher.js')

test('SUCCESS: sites scanned cleanly, zero alerts (no anomalies is a healthy outcome)', () => {
  assert.equal(computeAnomalyStatus({ sitesScanned: 5, scanFailures: 0 }), 'success')
})

test('SUCCESS: no sites to scan', () => {
  assert.equal(computeAnomalyStatus({ sitesScanned: 0, scanFailures: 0 }), 'success')
})

test('🔴 FAILED: every scanned site threw (swallowed failure must not report success)', () => {
  assert.equal(computeAnomalyStatus({ sitesScanned: 5, scanFailures: 5 }), 'failed')
})
