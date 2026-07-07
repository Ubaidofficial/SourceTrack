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
