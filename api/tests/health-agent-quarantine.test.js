// health-agent 'tinybird_quarantine' check — maps the quarantine-alarm classify
// levels to the check status the snapshot consumes. TOKEN-FREE, NO network: the
// quarantine fetch is dependency-injected (stub fetchSummary), classify is the real
// pure classifier. Proves: critical → throw → status 'error' (and it is a
// CRITICAL_CHECK); warn → 'warning'; ok → 'ok'; and a fetch throw → 'warning' (an
// unreachable Tinybird must NOT read as a quarantined conversion).

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

const { check, runQuarantineCheck } = await import('../jobs/health-agent.js')

// Run the real check() wrapper over runQuarantineCheck with a stubbed summary fetch,
// so assertions are on the final check status ('ok' | 'warning' | 'error').
const runWith = (fetchSummary) => check('tinybird_quarantine', () => runQuarantineCheck({ fetchSummary }))

test('critical (a quarantined $conversion) → throws → status "error"', async () => {
  const rows = [{ event_type: '$conversion', n: 2, last_seen: '2026-07-16T00:00:00Z' }]
  const r = await runWith(async () => rows)
  assert.equal(r.name, 'tinybird_quarantine')
  assert.equal(r.status, 'error', 'a quarantined $conversion is an error (critical)')
  assert.match(r.error, /QUARANTINED CONVERSIONS/)
})

test('warn (quarantined non-conversion rows) → status "warning"', async () => {
  const rows = [{ event_type: '$pageview', n: 5, last_seen: '2026-07-16T00:00:00Z' }]
  const r = await runWith(async () => rows)
  assert.equal(r.status, 'warning')
  assert.match(r.warning, /quarantined row/)
})

test('ok (nothing quarantined) → status "ok"', async () => {
  const r = await runWith(async () => [])
  assert.equal(r.status, 'ok')
  assert.equal(r.conversionRows, 0)
  assert.equal(r.totalRows, 0)
  assert.match(r.summary, /clean/)
})

test('fetch throws (Tinybird unreachable/misconfigured) → status "warning", NOT "error"', async () => {
  const r = await runWith(async () => { throw new Error('Tinybird SQL API responded 503') })
  assert.equal(r.status, 'warning', 'an unreachable Tinybird warns, never critical')
  assert.match(r.warning, /quarantine check unavailable: Tinybird SQL API responded 503/)
})

test('runQuarantineCheck returns the raw shape (throw on critical) for direct use', async () => {
  await assert.rejects(
    () => runQuarantineCheck({ fetchSummary: async () => [{ event_type: '$conversion', n: 1 }] }),
    /QUARANTINED CONVERSIONS/
  )
  const warn = await runQuarantineCheck({ fetchSummary: async () => [{ event_type: '$pageview', n: 1 }] })
  assert.equal(warn._status, 'warning')
  const ok = await runQuarantineCheck({ fetchSummary: async () => [] })
  assert.equal(ok.ok, true)
})
