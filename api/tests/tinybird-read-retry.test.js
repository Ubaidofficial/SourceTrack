// B3 step 1 — queryTinybirdPipe retries TRANSIENT read failures (429 / 5xx / network throw
// / timeout) up to 3 attempts, so a single blip does not surface as null (which, once the
// nightly is fail-closed, would fail a whole run). PURELY ADDITIVE: the return contract is
// unchanged — [] for a served-empty result, null after retries are exhausted, never throws.
// Deterministic: fetch + sleep are injected, so no real timers and no real waiting.

import test from 'node:test'
import assert from 'node:assert/strict'

process.env.NODE_ENV = 'test'
// queryTinybirdPipe reads these each call; set them so the pre-loop guards pass and the
// injected fetch is what actually runs (host/token present, reads enabled, no allowlist).
process.env.TINYBIRD_READ_ENABLED = 'true'
delete process.env.TINYBIRD_READ_PIPES // no allowlist → every pipe is allowed
process.env.TINYBIRD_HOST = 'https://tb.example.test'
process.env.TINYBIRD_READ_TOKEN = 'mock-read-token'

const { queryTinybirdPipe } = await import('../lib/tinybird-read.js')

// A Response-like stub: only the surface queryTinybirdPipe touches.
function response ({ status = 200, data = [], retryAfter = null } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => (String(k).toLowerCase() === 'retry-after' && retryAfter != null ? String(retryAfter) : null) },
    text: async () => 'error body',
    json: async () => ({ data })
  }
}

// Build an injectable fetch that plays `steps` in order (a step is a response stub, or an
// Error to throw = network failure), plus a sleep seam that RECORDS waits without waiting.
function harness (steps) {
  const calls = []
  const sleeps = []
  let i = 0
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts })
    const step = steps[Math.min(i, steps.length - 1)]
    i++
    if (step instanceof Error) throw step
    return step
  }
  const sleep = async (ms) => { sleeps.push(ms) }
  return { fetchImpl, sleep, calls, sleeps }
}

const run = (steps, pipe = 'nightly_conversions_by_site') => {
  const h = harness(steps)
  return { h, promise: queryTinybirdPipe(pipe, { site_id: 's1' }, { fetchImpl: h.fetchImpl, sleep: h.sleep }) }
}

test('429 then 200 → succeeds, returns rows, exactly 2 fetch calls', async () => {
  const { h, promise } = run([response({ status: 429 }), response({ status: 200, data: [{ a: 1 }] })])
  const rows = await promise
  assert.deepEqual(rows, [{ a: 1 }])
  assert.equal(h.calls.length, 2)
  assert.equal(h.sleeps.length, 1) // one backoff between the two attempts
})

test('500, 500, 200 → succeeds, 3 fetch calls', async () => {
  const { h, promise } = run([response({ status: 500 }), response({ status: 500 }), response({ status: 200, data: [{ a: 1 }] })])
  const rows = await promise
  assert.deepEqual(rows, [{ a: 1 }])
  assert.equal(h.calls.length, 3)
  assert.equal(h.sleeps.length, 2)
})

test('429 x3 → returns null (NOT a throw), 3 fetch calls', async () => {
  const { h, promise } = run([response({ status: 429 }), response({ status: 429 }), response({ status: 429 })])
  const rows = await promise
  assert.equal(rows, null) // exhausted → null, never throws
  assert.equal(h.calls.length, 3)
  assert.equal(h.sleeps.length, 2) // backoff after attempts 1 and 2; the 3rd is terminal
})

test('network throw then 200 → succeeds', async () => {
  const { h, promise } = run([new Error('ECONNRESET'), response({ status: 200, data: [{ a: 1 }] })])
  const rows = await promise
  assert.deepEqual(rows, [{ a: 1 }])
  assert.equal(h.calls.length, 2)
  assert.equal(h.sleeps.length, 1)
})

test('400 → returns null after exactly 1 fetch call (no retry on a non-429 4xx)', async () => {
  const { h, promise } = run([response({ status: 400 })])
  const rows = await promise
  assert.equal(rows, null)
  assert.equal(h.calls.length, 1)
  assert.equal(h.sleeps.length, 0)
})

test('404 → returns null after exactly 1 fetch call (no retry)', async () => {
  const { h, promise } = run([response({ status: 404 })])
  const rows = await promise
  assert.equal(rows, null)
  assert.equal(h.calls.length, 1)
  assert.equal(h.sleeps.length, 0)
})

test('🔴 200 with data:[] → returns [], 1 fetch call, NO retry (served-empty is a SUCCESS)', async () => {
  const { h, promise } = run([response({ status: 200, data: [] })])
  const rows = await promise
  assert.deepEqual(rows, []) // the empty-vs-failed distinction everything downstream relies on
  assert.equal(h.calls.length, 1)
  assert.equal(h.sleeps.length, 0)
})

test('Retry-After header is honoured over the exponential default', async () => {
  // attempt 0 (500) → exponential 2000ms; attempt 1 (429, Retry-After: 2) → 2000ms from the
  // HEADER, where the exponential default would be 4000ms (2000 * 2^1). Proves the header wins.
  const { h, promise } = run([
    response({ status: 500 }),
    response({ status: 429, retryAfter: 2 }),
    response({ status: 200, data: [{ a: 1 }] })
  ])
  const rows = await promise
  assert.deepEqual(rows, [{ a: 1 }])
  assert.equal(h.sleeps[0], 2000, 'attempt 0: exponential 2000ms')
  assert.equal(h.sleeps[1], 2000, 'attempt 1: Retry-After:2 → 2000ms, NOT the exponential 4000ms')
})
