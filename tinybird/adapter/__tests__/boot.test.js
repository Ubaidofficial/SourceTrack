// Phase 2d — boot wiring. MOCK fetch only; NO real network, NO real token, NO POST.
// Proves: flag-off no-op, env-gated wiring POSTs to the right URL, missing token
// doesn't crash (warns + stays unwired), token never logged, idempotent.

import test from 'node:test'
import assert from 'node:assert'
import { initTinybirdDualWrite, __resetTinybirdBoot } from '../boot.js'
import { dualWriteEvent, setDualWriteTransport, __getDualWriteBatcher } from '../dual-write.js'

const HOST = 'https://api.test.tinybird.co'
const TOKEN = 'SECRET_APPEND_TOKEN_should_never_log'

function mockFetch () {
  const calls = []
  const fn = async (url, opts) => { calls.push({ url, opts }); return { status: 202, headers: new Map() } }
  fn.calls = calls
  return fn
}
// Sequenced mock fetch: returns responses[i] for attempt i (repeats the last once
// exhausted) and records every call. Each entry is a zero-arg factory so a fresh
// response object (with its own .json()) is produced per attempt.
function mockFetchSeq (responses) {
  const calls = []
  let i = 0
  const fn = async (url, opts) => {
    calls.push({ url, opts })
    const make = responses[Math.min(i, responses.length - 1)]
    i++
    return make()
  }
  fn.calls = calls
  return fn
}
const res429 = () => ({ status: 429, headers: new Map() })  // retryable, no Retry-After -> backoff+jitter
const res500 = () => ({ status: 500, headers: new Map() })  // retryable
const res400 = () => ({ status: 400, headers: new Map() })  // permanent (non-429 4xx) -> no retry
const res2xx = (body) => ({ status: 202, headers: new Map(), json: async () => body }) // onResult-capable 2xx
function captureLogs () {
  const lines = []
  const log = console.log; const warn = console.warn
  console.log = (...a) => lines.push(a.join(' '))
  console.warn = (...a) => lines.push(a.join(' '))
  return { lines, restore () { console.log = log; console.warn = warn } }
}
function resetEnv () {
  for (const k of ['TINYBIRD_DUAL_WRITE', 'TINYBIRD_HOST', 'TINYBIRD_APPEND_TOKEN', 'TINYBIRD_DATASOURCE', 'TINYBIRD_FLUSH_AT']) delete process.env[k]
  __resetTinybirdBoot()
  setDualWriteTransport(null)
}
const EVENT = { site_id: 's', event: '$conversion', properties: { site_id: 's', order_id: 'o1' } }

test('flag unset/false -> NOT wired (no-op, transport stays null)', () => {
  resetEnv()
  assert.strictEqual(initTinybirdDualWrite(), false, 'flag unset -> no-op')
  assert.strictEqual(__getDualWriteBatcher(), null, 'no batcher constructed')
  // flag explicitly false, host+token present -> STILL no-op
  process.env.TINYBIRD_DUAL_WRITE = 'false'
  process.env.TINYBIRD_HOST = HOST
  process.env.TINYBIRD_APPEND_TOKEN = TOKEN
  assert.strictEqual(initTinybirdDualWrite({ fetch: mockFetch() }), false)
  assert.strictEqual(dualWriteEvent(EVENT), false, 'dualWriteEvent no-ops when flag off')
  resetEnv()
})

test('flag true + host+token -> wired; emit POSTs to the right URL with bearer + gzip', async () => {
  resetEnv()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  process.env.TINYBIRD_HOST = HOST
  process.env.TINYBIRD_APPEND_TOKEN = TOKEN
  process.env.TINYBIRD_FLUSH_AT = '1000' // don't auto-flush; flush explicitly for determinism
  const fetch = mockFetch()
  assert.strictEqual(initTinybirdDualWrite({ fetch }), true, 'wired')
  assert.strictEqual(dualWriteEvent(EVENT), true)
  await __getDualWriteBatcher().flush()
  assert.strictEqual(fetch.calls.length, 1, 'POST sent via the wired transport')
  assert.strictEqual(fetch.calls[0].url, `${HOST}/v0/events?name=events`)
  assert.strictEqual(fetch.calls[0].opts.method, 'POST')
  assert.strictEqual(fetch.calls[0].opts.headers['Content-Encoding'], 'gzip')
  assert.strictEqual(fetch.calls[0].opts.headers.Authorization, `Bearer ${TOKEN}`)
  resetEnv()
})

test('TINYBIRD_DATASOURCE override respected; default is events', async () => {
  resetEnv()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  process.env.TINYBIRD_HOST = HOST
  process.env.TINYBIRD_APPEND_TOKEN = TOKEN
  process.env.TINYBIRD_DATASOURCE = 'events_staging'
  process.env.TINYBIRD_FLUSH_AT = '1000'
  const fetch = mockFetch()
  initTinybirdDualWrite({ fetch })
  dualWriteEvent(EVENT)
  await __getDualWriteBatcher().flush()
  assert.strictEqual(fetch.calls[0].url, `${HOST}/v0/events?name=events_staging`)
  resetEnv()
})

test('flag true + token MISSING -> app does not crash; warns; stays unwired', () => {
  resetEnv()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  process.env.TINYBIRD_HOST = HOST
  // TINYBIRD_APPEND_TOKEN intentionally absent
  const cap = captureLogs()
  let result
  assert.doesNotThrow(() => { result = initTinybirdDualWrite({ fetch: mockFetch() }) })
  cap.restore()
  assert.strictEqual(result, false, 'stays unwired')
  assert.strictEqual(__getDualWriteBatcher(), null)
  assert.strictEqual(dualWriteEvent(EVENT), false, 'dual-write no-ops when unwired')
  assert.ok(cap.lines.some((l) => l.includes('TINYBIRD_HOST/TINYBIRD_APPEND_TOKEN')), 'warned about missing config')
  resetEnv()
})

test('token never appears in ANY log output (success path logs host, not token)', () => {
  resetEnv()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  process.env.TINYBIRD_HOST = HOST
  process.env.TINYBIRD_APPEND_TOKEN = TOKEN
  const cap = captureLogs()
  initTinybirdDualWrite({ fetch: mockFetch() }) // logs the success line
  cap.restore()
  assert.ok(cap.lines.length > 0, 'something was logged on wire')
  assert.ok(cap.lines.some((l) => l.includes(HOST)), 'host is logged (not a secret)')
  for (const l of cap.lines) assert.ok(!l.includes(TOKEN), `token must NEVER be logged (saw: ${l})`)
  resetEnv()
})

test('idempotent: a second init is a no-op (no double-wire)', () => {
  resetEnv()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  process.env.TINYBIRD_HOST = HOST
  process.env.TINYBIRD_APPEND_TOKEN = TOKEN
  assert.strictEqual(initTinybirdDualWrite({ fetch: mockFetch() }), true, 'first call wires')
  assert.strictEqual(initTinybirdDualWrite({ fetch: mockFetch() }), false, 'second call is a no-op')
  resetEnv()
})

// ── Retry-at-boot (fix/tinybird-retry-transport-at-boot) ─────────────────────
// boot now wraps the transport in withRetry so 429/5xx get bounded retry instead
// of being logged-and-dropped. Tests inject retry.sleep=no-op for determinism (no
// real waiting). onResult/onError are internal to boot; they are observed via the
// SAMPLED log lines they emit (quarantine warn / "dual-write POST failed").

test('retry: 429 then 200 -> exactly 2 attempts AND onResult still fires on the eventual 2xx', async () => {
  resetEnv()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  process.env.TINYBIRD_HOST = HOST
  process.env.TINYBIRD_APPEND_TOKEN = TOKEN
  process.env.TINYBIRD_FLUSH_AT = '1000' // no auto-flush; flush explicitly
  const fetch = mockFetchSeq([res429, () => res2xx({ successful_rows: 0, quarantined_rows: 1 })])
  const cap = captureLogs()
  assert.strictEqual(initTinybirdDualWrite({ fetch, retry: { sleep: () => Promise.resolve() } }), true, 'wired')
  assert.strictEqual(dualWriteEvent(EVENT), true)
  await __getDualWriteBatcher().flush()
  cap.restore()
  // (a) one 429 -> one retry -> 200 = 2 fetch attempts
  assert.strictEqual(fetch.calls.length, 2, '429 -> one retry -> 200 = 2 attempts')
  // (b) onResult preserved through withRetry: quarantine observability fired on the retried 2xx
  assert.ok(cap.lines.some((l) => l.includes('quarantined 1 row')), 'onResult fired on the retried 2xx (Layer A intact)')
  resetEnv()
})

test('retry: a permanent 4xx (non-429) does NOT retry -> 1 attempt, onError fires once', async () => {
  resetEnv()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  process.env.TINYBIRD_HOST = HOST
  process.env.TINYBIRD_APPEND_TOKEN = TOKEN
  process.env.TINYBIRD_FLUSH_AT = '1000'
  const fetch = mockFetchSeq([res400])
  const cap = captureLogs()
  initTinybirdDualWrite({ fetch, retry: { sleep: () => Promise.resolve() } })
  dualWriteEvent(EVENT)
  await __getDualWriteBatcher().flush().catch(() => {}) // non-retryable surfaces -> onError + reject
  cap.restore()
  // (c) 400 is not retryable -> surrender on the first attempt
  assert.strictEqual(fetch.calls.length, 1, 'non-retryable 4xx -> exactly 1 attempt (no retry)')
  const failLines = cap.lines.filter((l) => l.includes('dual-write POST failed'))
  assert.strictEqual(failLines.length, 1, 'onError (chain-recovery) fired exactly once')
  resetEnv()
})

test('retry: surrender after maxRetries (persistent 5xx) fires onError exactly once', async () => {
  resetEnv()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  process.env.TINYBIRD_HOST = HOST
  process.env.TINYBIRD_APPEND_TOKEN = TOKEN
  process.env.TINYBIRD_FLUSH_AT = '1000'
  process.env.TINYBIRD_MAX_REQUEUE = '0' // isolate the onError-on-surrender path (re-queue is covered in ingest-durability.test.js)
  const fetch = mockFetchSeq([res500]) // always 500
  const cap = captureLogs()
  initTinybirdDualWrite({ fetch, retry: { sleep: () => Promise.resolve() } })
  dualWriteEvent(EVENT)
  await __getDualWriteBatcher().flush().catch(() => {})
  cap.restore()
  // (d) withRetry default maxRetries=4 -> 1 initial + 4 retries = 5 attempts, then surrender
  assert.strictEqual(fetch.calls.length, 5, 'maxRetries=4 -> 5 total attempts then surrender')
  const failLines = cap.lines.filter((l) => l.includes('dual-write POST failed'))
  assert.strictEqual(failLines.length, 1, 'onError fired exactly once on surrender (not once per attempt)')
  delete process.env.TINYBIRD_MAX_REQUEUE
  resetEnv()
})
