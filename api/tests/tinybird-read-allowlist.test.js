// tinybird-read per-pipe allowlist test — TOKEN-FREE, NO NETWORK.
//
// Verifies the optional TINYBIRD_READ_PIPES narrowing layer over the master
// TINYBIRD_READ_ENABLED flag (incremental cutover): master-off => all off;
// master-on + allowlist unset => all serve (backward compat); master-on +
// allowlist set => only listed pipes serve, others fall back to null.
// Stubs global fetch (records whether it was called) so "fetch NOT called" is
// directly assertable, and saves/restores all four env vars incl. TINYBIRD_READ_PIPES.

import test from 'node:test'
import assert from 'node:assert/strict'

import { queryTinybirdPipe, isPipeReadAllowed } from '../lib/tinybird-read.js'

// opts: { enabled?: boolean, pipes?: string|undefined }
function setup(t, { enabled = false, pipes } = {}) {
  const saved = {
    TINYBIRD_READ_ENABLED: process.env.TINYBIRD_READ_ENABLED,
    TINYBIRD_HOST: process.env.TINYBIRD_HOST,
    TINYBIRD_READ_TOKEN: process.env.TINYBIRD_READ_TOKEN,
    TINYBIRD_READ_PIPES: process.env.TINYBIRD_READ_PIPES
  }
  // Host/token are always present so a null return can only come from the gate.
  process.env.TINYBIRD_HOST = 'https://api.tinybird.example'
  process.env.TINYBIRD_READ_TOKEN = 'mock-read-token-for-tests'
  if (enabled) process.env.TINYBIRD_READ_ENABLED = 'true'
  else delete process.env.TINYBIRD_READ_ENABLED
  if (pipes === undefined) delete process.env.TINYBIRD_READ_PIPES
  else process.env.TINYBIRD_READ_PIPES = pipes

  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    return { ok: true, json: async () => ({ data: [] }) }
  }

  t.after(() => {
    globalThis.fetch = realFetch
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })
  return calls
}

// ── queryTinybirdPipe end-to-end (gate + fetch) ───────────────────────────────

test('Case 1 — master OFF: returns null and does NOT call fetch', async (t) => {
  const calls = setup(t, { enabled: false })
  const rows = await queryTinybirdPipe('events_latest', {})
  assert.equal(rows, null)
  assert.equal(calls.length, 0, 'fetch must not be called when master flag is off')
})

test('Case 2 — master ON, allowlist unset: serves (backward compat, fetch called)', async (t) => {
  const calls = setup(t, { enabled: true, pipes: undefined })
  const rows = await queryTinybirdPipe('events_latest', {})
  assert.notEqual(rows, null, 'stubbed 2xx must not fall back to null')
  assert.equal(calls.length, 1, 'fetch called exactly once')
  assert.match(calls[0], /\/v0\/pipes\/events_latest\.json/)
})

test('Case 3 — allowlist set, pipe listed: serves (fetch called)', async (t) => {
  const calls = setup(t, { enabled: true, pipes: 'sessions_conversions,alert_ai' })
  const rows = await queryTinybirdPipe('alert_ai', {})
  assert.notEqual(rows, null)
  assert.equal(calls.length, 1)
  assert.match(calls[0], /\/v0\/pipes\/alert_ai\.json/)
})

test('Case 4 — allowlist set, pipe NOT listed: returns null, no fetch', async (t) => {
  const calls = setup(t, { enabled: true, pipes: 'sessions_conversions,alert_ai' })
  const rows = await queryTinybirdPipe('events_latest', {})
  assert.equal(rows, null)
  assert.equal(calls.length, 0, 'a non-allowlisted pipe must not hit the network')
})

test('Case 5 — whitespace/empty tolerance: " a , events_latest , " serves events_latest', async (t) => {
  const calls = setup(t, { enabled: true, pipes: ' a , events_latest , ' })
  const rows = await queryTinybirdPipe('events_latest', {})
  assert.notEqual(rows, null)
  assert.equal(calls.length, 1)
})

// ── isPipeReadAllowed unit matrix (same semantics, direct) ────────────────────

test('isPipeReadAllowed — master OFF: always false', (t) => {
  setup(t, { enabled: false, pipes: 'events_latest' })
  assert.equal(isPipeReadAllowed('events_latest'), false)
})

test('isPipeReadAllowed — master ON, allowlist unset: true for any pipe', (t) => {
  setup(t, { enabled: true, pipes: undefined })
  assert.equal(isPipeReadAllowed('events_latest'), true)
  assert.equal(isPipeReadAllowed('anything_else'), true)
})

test('isPipeReadAllowed — master ON, empty/whitespace allowlist: true (backward compat)', (t) => {
  setup(t, { enabled: true, pipes: '   ' })
  assert.equal(isPipeReadAllowed('events_latest'), true)
})

test('isPipeReadAllowed — master ON, allowlist set: only-listed, case-sensitive, whitespace-tolerant', (t) => {
  setup(t, { enabled: true, pipes: ' sessions_conversions , alert_ai , ' })
  assert.equal(isPipeReadAllowed('alert_ai'), true)
  assert.equal(isPipeReadAllowed('sessions_conversions'), true)
  assert.equal(isPipeReadAllowed('events_latest'), false)
  assert.equal(isPipeReadAllowed('Alert_AI'), false, 'match is case-sensitive')
})
