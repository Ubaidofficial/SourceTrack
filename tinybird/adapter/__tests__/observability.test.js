// Phase 2d-obs — dual-write failure observability. MOCK fetch / MOCK sink only;
// NO real network, NO real token, NO POST. Proves:
//   - a forced transport failure IS logged (no longer silent)
//   - a normalize throw IS logged (no longer silent)
//   - high failure volume does NOT flood the log (sampling works)
//   - logs carry NO event body / NO PII / NO token
//   - flag OFF -> zero logs, zero work (committed default unchanged)

import test from 'node:test'
import assert from 'node:assert'
import { createSampledLogger, capLabel } from '../log-sampler.js'
import { initTinybirdDualWrite, __resetTinybirdBoot } from '../boot.js'
import { dualWriteEvent, setDualWriteTransport, __getDualWriteBatcher, __resetDualWriteObservability } from '../dual-write.js'

function capWarn () {
  const lines = []
  const orig = console.warn
  console.warn = (...a) => lines.push(a.join(' '))
  return { lines, restore () { console.warn = orig } }
}
function resetAll () {
  for (const k of ['TINYBIRD_DUAL_WRITE', 'TINYBIRD_HOST', 'TINYBIRD_APPEND_TOKEN', 'TINYBIRD_DATASOURCE', 'TINYBIRD_FLUSH_AT', 'TINYBIRD_FLUSH_INTERVAL_MS']) delete process.env[k]
  __resetTinybirdBoot()
  setDualWriteTransport(null)
  __resetDualWriteObservability()
}

// ---------------------------------------------------------------- sampler unit
test('sampler: first call emits; repeats within interval suppressed; next interval emits with suppressed count', () => {
  const lines = []
  let nowMs = 1000
  const log = createSampledLogger({ intervalMs: 60000, now: () => nowMs, sink: (m) => lines.push(m) })
  log('A')                               // first -> emits
  for (let i = 0; i < 99; i++) log('A')  // within interval -> suppressed
  assert.strictEqual(lines.length, 1, 'only the first emits within the interval (no flood)')
  nowMs += 60000                         // advance one interval
  log('A')                               // emits, reporting the suppressed run
  assert.strictEqual(lines.length, 2)
  assert.match(lines[1], /\+99 similar suppressed/, 'suppressed count rides the next emit')
})

test('sampler: never throws even when the sink throws', () => {
  const log = createSampledLogger({ intervalMs: 0, now: () => 0, sink: () => { throw new Error('sink boom') } })
  assert.doesNotThrow(() => log('x'))
})

test('capLabel: passes canonical types through, truncates oversized producer labels, handles null', () => {
  assert.strictEqual(capLabel('$conversion'), '$conversion', 'canonical type unchanged')
  assert.strictEqual(capLabel(null), '', 'null -> empty')
  assert.strictEqual(capLabel(undefined), '', 'undefined -> empty')
  const big = 'x'.repeat(500)
  const out = capLabel(big)
  assert.ok(out.length <= 65, 'truncated to the cap (+ ellipsis)')
  assert.ok(!out.includes(big), 'the full oversized label is NOT present')
})

test('a normalize throw with an oversized event name is truncated in the log (no bulk producer data)', () => {
  resetAll()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  setDualWriteTransport(async () => {})
  __resetDualWriteObservability()
  const cap = capWarn()
  const huge = 'EVT_' + 'A'.repeat(1000) // attacker stuffs bulk data into the "type" field
  dualWriteEvent({ distinctId: 'd', event: huge, properties: { /* no site_id -> throw */ } })
  cap.restore()
  const blob = cap.lines.join('\n')
  assert.ok(cap.lines.length >= 1, 'logged')
  assert.ok(!blob.includes(huge), 'the full 1000-char label is NOT in the log')
  assert.ok(blob.includes('EVT_AAAA'), 'a truncated prefix is present')
  resetAll()
})

// -------------------------------------------------- boot onError (transport fail)
test('boot onError: a failing POST is LOGGED (msg+count+types), not silent, and carries no body/PII/token', async () => {
  resetAll()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  process.env.TINYBIRD_HOST = 'https://api.test.tinybird.co'
  process.env.TINYBIRD_APPEND_TOKEN = 'SECRET_TOKEN_should_never_log'
  process.env.TINYBIRD_FLUSH_AT = '1000' // buffer; we flush MANUALLY and await the deliver (so onError fires before restore)
  process.env.TINYBIRD_MAX_REQUEUE = '0' // isolate onError-on-surrender (the bounded re-queue is covered in ingest-durability.test.js)
  const fetch = async () => { throw new Error('getaddrinfo ENOTFOUND boom-host') }
  // retry.sleep no-op: boot now wraps the transport in withRetry; a network error is
  // retryable, so inject an instant sleep to keep the deliver deterministic (no real
  // backoff). onError still fires ONCE per batch (after withRetry surrenders).
  assert.strictEqual(initTinybirdDualWrite({ fetch, retry: { sleep: () => Promise.resolve() } }), true, 'wired')

  const cap = capWarn()
  dualWriteEvent({
    distinctId: 'd1', event: '$conversion',
    properties: { site_id: 'site-xyz', order_id: 'ORDER-SECRET-9', conversion_value: 49, customer_email: 'leak@example.com' }
  })
  await __getDualWriteBatcher().flush().catch(() => {})
  cap.restore()

  const blob = cap.lines.join('\n')
  assert.ok(cap.lines.length >= 1, 'transport failure WAS logged (not silent)')
  assert.match(blob, /ENOTFOUND boom-host/, 'logs the error message')
  assert.match(blob, /\$conversion/, 'logs the non-PII event_type')
  assert.match(blob, /batch=1/, 'logs the batch count')
  assert.ok(!blob.includes('leak@example.com'), 'NO PII (email) in logs')
  assert.ok(!blob.includes('ORDER-SECRET-9'), 'NO body value (order_id) in logs')
  assert.ok(!blob.includes('SECRET_TOKEN_should_never_log'), 'NO token in logs')
  delete process.env.TINYBIRD_MAX_REQUEUE
  resetAll()
})

test('boot onError: high failure volume does NOT flood the log (sampled to 1 line)', async () => {
  resetAll()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  process.env.TINYBIRD_HOST = 'https://api.test.tinybird.co'
  process.env.TINYBIRD_APPEND_TOKEN = 't'
  process.env.TINYBIRD_FLUSH_AT = '1000' // buffer; flush+await per event so each deliver failure is observed
  const fetch = async () => { throw new Error('boom') }
  // retry.sleep no-op (see above): instant retries so all 50 failures land within the
  // sampler interval — otherwise real backoff would stretch the loop across intervals
  // and emit more than the 1 expected line.
  initTinybirdDualWrite({ fetch, retry: { sleep: () => Promise.resolve() } })

  const cap = capWarn()
  for (let i = 0; i < 50; i++) {
    dualWriteEvent({ distinctId: 'd', event: '$conversion', properties: { site_id: 's', order_id: 'O' + i } })
    await __getDualWriteBatcher().flush().catch(() => {}) // 50 distinct deliver failures, all awaited
  }
  cap.restore()
  assert.strictEqual(cap.lines.length, 1, '50 POST failures within the interval -> exactly 1 log line')
  resetAll()
})

// -------------------------------------------- dual-write normalize-throw swallow
test('dual-write: a normalize throw is LOGGED (msg+event only), still returns false, never throws, no body/PII', () => {
  resetAll()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  setDualWriteTransport(async () => {}) // non-null transport so getBatcher() exists and we reach normalize
  __resetDualWriteObservability()

  const cap = capWarn()
  let ret
  assert.doesNotThrow(() => {
    // missing site_id -> normalizeEvent throws -> caught -> sampled warn. The raw STILL
    // contains PII (customer_email) + a body value (order_id) we must NOT log.
    ret = dualWriteEvent({ distinctId: 'd', event: '$conversion', properties: { customer_email: 'leak@example.com', order_id: 'ORDER-SECRET' } })
  })
  cap.restore()

  assert.strictEqual(ret, false, 'still returns false on a normalize throw')
  const blob = cap.lines.join('\n')
  assert.ok(cap.lines.length >= 1, 'normalize throw WAS logged (not silent)')
  assert.match(blob, /missing site_id/, 'logs the error message')
  assert.match(blob, /event=\$conversion/, 'logs the wrapper event name only')
  assert.ok(!blob.includes('leak@example.com'), 'NO PII (email) in logs — raw body is not logged')
  assert.ok(!blob.includes('ORDER-SECRET'), 'NO body value (order_id) in logs')
  resetAll()
})

test('dual-write: high normalize-throw volume does NOT flood (sampled to 1 line)', () => {
  resetAll()
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  setDualWriteTransport(async () => {})
  __resetDualWriteObservability()

  const cap = capWarn()
  for (let i = 0; i < 100; i++) dualWriteEvent({ distinctId: 'd', event: '$conversion', properties: { /* no site_id */ } })
  cap.restore()
  assert.strictEqual(cap.lines.length, 1, '100 normalize throws within the interval -> exactly 1 log line')
  resetAll()
})

// ------------------------------------------------------------ flag-off default
test('flag OFF (committed default): zero logs, zero work', () => {
  resetAll()
  const cap = capWarn()
  assert.strictEqual(dualWriteEvent({ event: '$conversion', properties: {} }), false)
  cap.restore()
  assert.strictEqual(cap.lines.length, 0, 'flag off -> no normalize, no log, no work')
  resetAll()
})
