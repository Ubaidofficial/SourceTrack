// Conversion-quarantine alarm tests — TOKEN-FREE, NO NETWORK.
// Covers the §11 alert policy (pure), the SQL-API fetch wiring (stubbed fetch),
// and transport.js's Layer-A onResult hook (observation-only guarantees).

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildQuarantineSql, fetchQuarantineSummary, classifyQuarantine } from '../lib/quarantine-alarm.js'
import { createTinybirdTransport } from '../../tinybird/adapter/transport.js'

// ── Alert policy (SCOPE_v3 §11) ──────────────────────────────────────────────

test('policy: any quarantined $conversion -> CRITICAL (silent revenue loss)', () => {
  const v = classifyQuarantine([
    { event_type: '$pageview', n: 3, last_seen: '2026-07-03 10:00:00' },
    { event_type: '$conversion', n: 1, last_seen: '2026-07-03 10:05:00' }
  ])
  assert.equal(v.level, 'critical')
  assert.equal(v.conversionRows, 1)
  assert.equal(v.totalRows, 4)
  assert.match(v.summary, /QUARANTINED CONVERSIONS/)
})

test('policy: non-conversion quarantine rows -> WARN', () => {
  const v = classifyQuarantine([{ event_type: '$pageview', n: 2, last_seen: '2026-07-03 10:00:00' }])
  assert.equal(v.level, 'warn')
  assert.equal(v.conversionRows, 0)
  assert.equal(v.totalRows, 2)
})

test('policy: empty quarantine -> ok', () => {
  assert.equal(classifyQuarantine([]).level, 'ok')
  assert.equal(classifyQuarantine(null).level, 'ok')
})

// ── SQL construction ─────────────────────────────────────────────────────────

test('buildQuarantineSql: numeric lookback only; garbage falls back to default', () => {
  assert.match(buildQuarantineSql(6), /INTERVAL 6 HOUR/)
  assert.match(buildQuarantineSql('26'), /INTERVAL 26 HOUR/)
  // Injection-shaped input must NOT survive into the SQL.
  assert.match(buildQuarantineSql("1; DROP TABLE events"), /INTERVAL \d+ HOUR/)
  assert.ok(!buildQuarantineSql("1; DROP TABLE events").includes('DROP'))
  assert.match(buildQuarantineSql(undefined), /INTERVAL 2 HOUR/)
  assert.match(buildQuarantineSql(-5), /INTERVAL 2 HOUR/)
})

// ── SQL-API fetch wiring (stubbed) ───────────────────────────────────────────

test('fetchQuarantineSummary: hits /v0/sql with Bearer token and returns body.data', async () => {
  const calls = []
  const rows = [{ event_type: '$conversion', n: 1, last_seen: '2026-07-03 10:05:00' }]
  const fetchImpl = async (url, opts) => {
    calls.push({ url: String(url), auth: opts?.headers?.Authorization })
    return { ok: true, json: async () => ({ data: rows }) }
  }
  const out = await fetchQuarantineSummary({ host: 'https://api.tinybird.example/', token: 'mock-read-token', lookbackHours: 2, fetchImpl })
  assert.deepEqual(out, rows)
  assert.equal(calls.length, 1)
  assert.ok(calls[0].url.startsWith('https://api.tinybird.example/v0/sql?q='), calls[0].url)
  assert.ok(decodeURIComponent(calls[0].url).includes('FROM events_quarantine'))
  assert.equal(calls[0].auth, 'Bearer mock-read-token')
})

test('fetchQuarantineSummary: non-2xx throws (caller maps to WARN, not CRITICAL)', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, json: async () => ({}) })
  await assert.rejects(
    () => fetchQuarantineSummary({ host: 'https://h', token: 't', fetchImpl }),
    /403/
  )
})

// ── Layer A: transport onResult (observation-only) ───────────────────────────

test('transport onResult: receives the parsed 2xx body; a throwing callback never breaks the write path', async () => {
  const seen = []
  const fetchImpl = async () => ({ status: 202, headers: new Map(), json: async () => ({ successful_rows: 5, quarantined_rows: 2 }) })
  const t = createTinybirdTransport({
    host: 'https://h', token: 'mock-append', datasource: 'events', fetch: fetchImpl,
    onResult: (body) => { seen.push(body); throw new Error('observer bug — must not propagate') }
  })
  await t('payload') // must resolve despite the throwing observer
  assert.deepEqual(seen, [{ successful_rows: 5, quarantined_rows: 2 }])
})

test('transport without onResult: behavior unchanged (2xx resolves, body untouched)', async () => {
  let jsonCalled = false
  const fetchImpl = async () => ({ status: 202, headers: new Map(), json: async () => { jsonCalled = true; return {} } })
  const t = createTinybirdTransport({ host: 'https://h', token: 'mock-append', datasource: 'events', fetch: fetchImpl })
  await t('payload')
  assert.equal(jsonCalled, false, 'no onResult -> response body is not even read')
})
