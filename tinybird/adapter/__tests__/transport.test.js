// Phase 2d — Events API transport + 429/5xx-aware retry. MOCK fetch + MOCK sleep only.
// No real network, no token, no POST to any workspace. The flag stays OFF except in
// the failure-isolation test (which still injects a mock throwing transport).

import test from 'node:test'
import assert from 'node:assert'
import {
  createTinybirdTransport, withRetry, parseRetryAfterMs, TinybirdTransportError, createRetryingTinybirdTransport
} from '../transport.js'
import { dualWriteEvent, setDualWriteTransport, __getDualWriteBatcher } from '../dual-write.js'

const FAKE = { host: 'https://api.test.tinybird.co', token: 'FAKE_TEST_TOKEN_not_a_secret', datasource: 'events' }

// Mock fetch: programmable responses (or a per-call thrower). Records calls.
function mockFetch (responses) {
  const calls = []
  let i = 0
  const fn = async (url, opts) => {
    calls.push({ url, opts })
    const r = Array.isArray(responses) ? responses[Math.min(i, responses.length - 1)] : responses
    i++
    if (r.throwNetwork) throw new Error(r.throwNetwork)
    return { status: r.status, headers: new Map(Object.entries(r.headers || {})) }
  }
  fn.calls = calls
  return fn
}
// Mock sleep: records the requested wait durations; never actually waits.
function mockSleep () {
  const waits = []
  const fn = async (ms) => { waits.push(ms) }
  fn.waits = waits
  return fn
}
const GZ = Buffer.from('fake-gzipped-ndjson') // stand-in for the batcher's gzipped payload

// ── POST shape ────────────────────────────────────────────────────────────────
test('POST shape: URL /v0/events?name=, gzip + bearer headers, body = payload', async () => {
  const fetch = mockFetch([{ status: 202 }])
  const transport = createTinybirdTransport({ ...FAKE, fetch })
  await transport(GZ)
  assert.strictEqual(fetch.calls.length, 1)
  const { url, opts } = fetch.calls[0]
  assert.strictEqual(url, 'https://api.test.tinybird.co/v0/events?name=events')
  assert.strictEqual(opts.method, 'POST')
  assert.strictEqual(opts.headers['Content-Encoding'], 'gzip')
  assert.strictEqual(opts.headers.Authorization, 'Bearer FAKE_TEST_TOKEN_not_a_secret')
  assert.strictEqual(opts.body, GZ)
})

test('2xx resolves; required args enforced', async () => {
  await createTinybirdTransport({ ...FAKE, fetch: mockFetch([{ status: 200 }]) })(GZ) // no throw
  assert.throws(() => createTinybirdTransport({ host: 'h', datasource: 'd' /* no token */ }), /required/)
})

test('non-2xx throws a typed error; 429 carries retryAfterMs from headers', async () => {
  const t = createTinybirdTransport({ ...FAKE, fetch: mockFetch([{ status: 429, headers: { 'Retry-After': '3' } }]) })
  await assert.rejects(() => t(GZ), (e) => {
    assert.ok(e instanceof TinybirdTransportError)
    assert.strictEqual(e.status, 429)
    assert.strictEqual(e.retryable, true)
    assert.strictEqual(e.retryAfterMs, 3000)
    return true
  })
})

// ── parseRetryAfterMs ───────────────────────────────────────────────────────────
test('parseRetryAfterMs: Retry-After secs/date, X-RateLimit-Reset epoch/secs', () => {
  const now = 1_000_000_000_000
  assert.strictEqual(parseRetryAfterMs({ 'Retry-After': '2' }, now), 2000)
  assert.strictEqual(parseRetryAfterMs({ 'X-RateLimit-Reset': '5' }, now), 5000) // seconds-from-now
  assert.strictEqual(parseRetryAfterMs({ 'X-RateLimit-Reset': String(now / 1000 + 4) }, now), 4000) // epoch secs
  assert.strictEqual(parseRetryAfterMs({}, now), undefined)
})

// ── retry semantics (header-driven, bounded) ────────────────────────────────────
test('429 with Retry-After -> waits that long, then retries and succeeds', async () => {
  const fetch = mockFetch([{ status: 429, headers: { 'Retry-After': '2' } }, { status: 202 }])
  const sleep = mockSleep()
  const t = withRetry(createTinybirdTransport({ ...FAKE, fetch }), { sleep })
  await t(GZ)
  assert.deepStrictEqual(sleep.waits, [2000], 'honored Retry-After exactly')
  assert.strictEqual(fetch.calls.length, 2)
})

test('429 without header -> exponential backoff + jitter', async () => {
  const fetch = mockFetch([{ status: 429 }, { status: 429 }, { status: 202 }])
  const sleep = mockSleep()
  const t = withRetry(createTinybirdTransport({ ...FAKE, fetch }), { sleep, baseDelayMs: 200, random: () => 0 })
  await t(GZ)
  // attempt 0 -> 200*2^0=200, attempt 1 -> 200*2^1=400 (jitter 0)
  assert.deepStrictEqual(sleep.waits, [200, 400])
})

test('header wait > maxDelayMs is CLAMPED to maxDelayMs (bounded duration)', async () => {
  // hostile/malformed Retry-After: 86400s (24h) -> must clamp to maxDelayMs.
  const fetch = mockFetch([{ status: 429, headers: { 'Retry-After': '86400' } }, { status: 202 }])
  const sleep = mockSleep()
  await withRetry(createTinybirdTransport({ ...FAKE, fetch }), { sleep, maxDelayMs: 30000 })(GZ)
  assert.deepStrictEqual(sleep.waits, [30000], 'clamped to maxDelayMs, not 86400000')
  // finding #2 incidental: a misparsed X-RateLimit-Reset epoch -> huge ms -> also clamped.
  const fetch2 = mockFetch([{ status: 429, headers: { 'X-RateLimit-Reset': '1000000000' } }, { status: 202 }])
  const sleep2 = mockSleep()
  await withRetry(createTinybirdTransport({ ...FAKE, fetch: fetch2 }), { sleep: sleep2, maxDelayMs: 30000 })(GZ)
  assert.strictEqual(sleep2.waits.length, 1)
  assert.ok(sleep2.waits[0] <= 30000, 'misparsed-epoch huge wait is clamped to maxDelayMs')
  // a header UNDER the cap is still honored exactly (intent preserved up to the cap).
  const fetch3 = mockFetch([{ status: 429, headers: { 'Retry-After': '2' } }, { status: 202 }])
  const sleep3 = mockSleep()
  await withRetry(createTinybirdTransport({ ...FAKE, fetch: fetch3 }), { sleep: sleep3, maxDelayMs: 30000 })(GZ)
  assert.deepStrictEqual(sleep3.waits, [2000], 'header under the cap honored exactly')
})

test('5xx -> retries with backoff', async () => {
  const fetch = mockFetch([{ status: 503 }, { status: 202 }])
  const sleep = mockSleep()
  await withRetry(createTinybirdTransport({ ...FAKE, fetch }), { sleep, random: () => 0 })(GZ)
  assert.strictEqual(sleep.waits.length, 1)
  assert.strictEqual(fetch.calls.length, 2)
})

test('4xx non-429 (schema reject) -> NO retry, surfaced immediately', async () => {
  const fetch = mockFetch([{ status: 400 }])
  const sleep = mockSleep()
  await assert.rejects(() => withRetry(createTinybirdTransport({ ...FAKE, fetch }), { sleep })(GZ), (e) => e.status === 400)
  assert.strictEqual(sleep.waits.length, 0, 'permanent error never retried')
  assert.strictEqual(fetch.calls.length, 1)
})

test('network error/timeout -> retryable; retry cap -> surrenders to caller', async () => {
  const fetch = mockFetch({ throwNetwork: 'ECONNRESET' }) // always fails
  const sleep = mockSleep()
  await assert.rejects(() => withRetry(createTinybirdTransport({ ...FAKE, fetch }), { sleep, maxRetries: 2 })(GZ),
    (e) => e instanceof TinybirdTransportError && e.retryable === true)
  assert.strictEqual(sleep.waits.length, 2, 'retried exactly maxRetries times then surrendered')
  assert.strictEqual(fetch.calls.length, 3, '1 initial + 2 retries')
})

test('createRetryingTinybirdTransport composes transport + retry', async () => {
  const fetch = mockFetch([{ status: 429 }, { status: 202 }])
  const sleep = mockSleep()
  await createRetryingTinybirdTransport({ ...FAKE, fetch, retry: { sleep, random: () => 0 } })(GZ)
  assert.strictEqual(fetch.calls.length, 2)
})

// ── FAILURE ISOLATION (the invariant) ───────────────────────────────────────────
test('failure isolation: a throwing transport never breaks the producer; chain recovers', async () => {
  const unhandled = []
  const onUnhandled = (e) => unhandled.push(e)
  process.on('unhandledRejection', onUnhandled)

  const errs = []
  // a real retrying transport whose fetch ALWAYS 500s -> exhausts retries -> throws
  const fetch = mockFetch({ status: 500 })
  const transport = createRetryingTinybirdTransport({ ...FAKE, fetch, retry: { sleep: async () => {}, maxRetries: 1 } })
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  setDualWriteTransport(transport, { flushAt: 1, flushInterval: 0, onError: (e) => errs.push(e) })

  // dualWriteEvent (the producer's call) must return synchronously and NOT throw.
  const ok = dualWriteEvent({ site_id: 's', event: '$conversion', properties: { site_id: 's', order_id: 'o1' } })
  assert.strictEqual(ok, true, 'dualWriteEvent returns true; producer path unaffected')

  // let the failing flush settle, then prove a LATER batch still flushes (chain recovered)
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(errs.length >= 1, 'transport failure surfaced to onError (not the producer)')

  const before = fetch.calls.length
  dualWriteEvent({ site_id: 's', event: '$conversion', properties: { site_id: 's', order_id: 'o2' } })
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(fetch.calls.length > before, 'later batch still attempted -> chain not poisoned')

  await new Promise((r) => setTimeout(r, 5))
  process.removeListener('unhandledRejection', onUnhandled)
  assert.strictEqual(unhandled.length, 0, 'no unhandled rejection escaped the dual-write path')

  setDualWriteTransport(null)
  delete process.env.TINYBIRD_DUAL_WRITE
})
