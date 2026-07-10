// Central timestamp normalization at the pipe-read boundary (kills the W1 format-trap
// class — docs/TIMESTAMP_TRAP_AUDIT.md). Proves:
//   (a) PASSTHROUGH SAFETY — a non-datetime value under a ts-named key is NOT mangled.
//   (3) the central walk itself — flat/nested/array shapes, mixed keys, idempotent.
//       + explicit coverage of the 2 audit breakers + the latent alert_recent.last_ts.
//   (b) ALLOWLIST COMPLETENESS / self-policing — every ts-shaped .pipe output alias/column
//       is in PIPE_TIMESTAMP_KEYS (or the documented SQL-bucketed exclusion set), so a novel
//       timestamp column name is a LOUD failure here, not a silent central-walk miss.

import test from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePipeTimestamp, normalizePipeRowTimestamps, PIPE_TIMESTAMP_KEYS } from '../lib/tinybird-read.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PIPES_DIR = path.resolve(__dirname, '../../tinybird/pipes')

// (a) PASSTHROUGH SAFETY — the crux of "central": it must not silently mis-normalize.
test('central — passthrough safety: non-datetime values under ts-keys are UNCHANGED (no mangling)', () => {
  // helper level (the date-time-shape guard)
  assert.strictEqual(normalizePipeTimestamp('2026-07-01'), '2026-07-01', 'date-only -> unchanged (no bogus Z)')
  assert.strictEqual(normalizePipeTimestamp('active'), 'active', 'plain label -> unchanged')
  assert.strictEqual(normalizePipeTimestamp('12345'), '12345', 'numeric-ish string -> unchanged')
  assert.strictEqual(normalizePipeTimestamp(''), '')
  assert.strictEqual(normalizePipeTimestamp(null), null)
  assert.strictEqual(normalizePipeTimestamp(undefined), undefined)
  // walk level — the same non-datetime values sitting UNDER recognized ts-keys
  const row = { last_seen: '2026-07-01', min_ts: '', timestamp: null, status: 'active', first_seen: 'never' }
  normalizePipeRowTimestamps([row])
  assert.deepStrictEqual(row, { last_seen: '2026-07-01', min_ts: '', timestamp: null, status: 'active', first_seen: 'never' },
    'non-datetime values under ts-keys pass through the walk unchanged')
  // real datetimes ARE still normalized (sanity)
  assert.strictEqual(normalizePipeTimestamp('2026-07-01 20:29:28.976'), '2026-07-01T20:29:28.976Z')
})

// (3) the central walk — flat rows, arrays of rows, nested objects, mixed keys, idempotent
test('central — walk normalizes recognized ts keys across flat/nested/array shapes; leaves other keys', () => {
  const data = [
    { distinct_id: 'v1', timestamp: '2026-07-01 20:29:28.976', conversion_value: 42.5, page_url: '/x' },
    { distinct_id: 'v2', server_timestamp: '2026-07-02 09:00:00', last_seen: '2026-07-02T09:05:00Z' }
  ]
  normalizePipeRowTimestamps(data)
  assert.strictEqual(data[0].timestamp, '2026-07-01T20:29:28.976Z', 'space form -> ISO-UTC')
  assert.strictEqual(data[0].conversion_value, 42.5, 'non-ts number untouched')
  assert.strictEqual(data[0].page_url, '/x', 'non-ts string untouched')
  assert.strictEqual(data[1].server_timestamp, '2026-07-02T09:00:00Z')
  assert.strictEqual(data[1].last_seen, '2026-07-02T09:05:00Z', 'already-ISO idempotent')

  // nested object + array-of-rows (defensive recursion)
  const nested = [{ meta: { last_ts: '2026-07-03 12:00:00' }, rows: [{ occurred_at: '2026-07-03 13:00:00' }] }]
  normalizePipeRowTimestamps(nested)
  assert.strictEqual(nested[0].meta.last_ts, '2026-07-03T12:00:00Z', 'nested object ts normalized')
  assert.strictEqual(nested[0].rows[0].occurred_at, '2026-07-03T13:00:00Z', 'array-of-rows ts normalized')

  // idempotent — a second pass is a no-op
  const before = JSON.stringify(data)
  normalizePipeRowTimestamps(data)
  assert.strictEqual(JSON.stringify(data), before, 'second pass is a no-op')
})

// audit-breaker coverage — the exact keys the 2 live breakers + the latent read emit
test('central — covers the audit breakers: events_health_last.timestamp, aiplatform/pageviews .timestamp, alert_recent.last_ts', () => {
  for (const k of ['timestamp', 'last_ts']) assert.ok(PIPE_TIMESTAMP_KEYS.has(k), `${k} is recognized`)
  const health = [{ timestamp: '2026-07-01 20:29:28' }]                                   // events.js /health
  const ai = [{ distinct_id: 'v', timestamp: '2026-07-01 20:29:28', conversion_value: 10 }] // getAiPlatformAttributionLive
  const alert = [{ cnt: 3, last_ts: '2026-07-01 20:29:28' }]                               // alert_recent (latent)
  normalizePipeRowTimestamps(health); normalizePipeRowTimestamps(ai); normalizePipeRowTimestamps(alert)
  assert.strictEqual(health[0].timestamp, '2026-07-01T20:29:28Z', 'events-health breaker covered')
  assert.strictEqual(ai[0].timestamp, '2026-07-01T20:29:28Z', 'ai-platform breaker covered')
  assert.strictEqual(alert[0].last_ts, '2026-07-01T20:29:28Z', 'alert_recent latent covered')
})

// (b) ALLOWLIST COMPLETENESS — static scan of every wired .pipe's OUTPUT columns.
// ts-shaped OUTPUT names that are pre-bucketed date strings (not per-row instants) go here.
// None today: hygiene's day/today/yesterday end in 'day' (not matched by TS_SHAPE); no *date alias exists.
const SQL_BUCKETED_EXCLUSIONS = new Set([])
const TS_SHAPE = /(_ts|timestamp|_at|_seen|_time|date)$/i

test('central — allowlist completeness: every ts-shaped .pipe output alias/column is recognized (self-policing)', () => {
  const files = fs.readdirSync(PIPES_DIR).filter((f) => f.endsWith('.pipe'))
  assert.ok(files.length > 0, 'found .pipe files to scan')

  const found = new Map() // lowercased name -> first .pipe it appeared in
  for (const f of files) {
    const src = fs.readFileSync(path.join(PIPES_DIR, f), 'utf8')
    const names = []
    // 1) explicit projection aliases: `... AS <name>`
    for (const m of src.matchAll(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)/gi)) names.push(m[1])
    // 2) bare projected columns: a line that is JUST an identifier (+ optional trailing comma)
    for (const line of src.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*),?\s*$/)
      if (m) names.push(m[1])
    }
    for (const n of names) {
      if (TS_SHAPE.test(n)) { const k = n.toLowerCase(); if (!found.has(k)) found.set(k, f) }
    }
  }

  const unrecognized = [...found].filter(([k]) => !PIPE_TIMESTAMP_KEYS.has(k) && !SQL_BUCKETED_EXCLUSIONS.has(k))
  assert.deepStrictEqual(
    unrecognized, [],
    `Timestamp-shaped pipe output column(s) NOT in PIPE_TIMESTAMP_KEYS. Add each to the recognized set ` +
    `(real per-row timestamp) or to SQL_BUCKETED_EXCLUSIONS (pre-bucketed date string): ` +
    unrecognized.map(([k, f]) => `${k} (${f})`).join(', ')
  )

  // sanity: the scan actually saw the known timestamp columns (guards against a broken scan silently passing)
  for (const expected of ['timestamp', 'last_ts', 'conversion_timestamp']) {
    assert.ok(found.has(expected), `scan should have found '${expected}' among pipe outputs`)
  }
})
