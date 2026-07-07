import test from 'node:test'
import assert from 'node:assert'

import {
  isBunnyConfigured,
  addPullZoneHostname,
  loadFreeCertificate,
  removePullZoneHostname
} from '../lib/bunny-edge.js'

const KEY = 'super-secret-bunny-key-DO-NOT-LOG-abc123'
const ZONE = '6119064'

// ── env harness ───────────────────────────────────────────────────────────────
function setEnv({ key = KEY, zone = ZONE, mock } = {}) {
  const prev = {
    BUNNY_API_KEY: process.env.BUNNY_API_KEY,
    BUNNY_PULL_ZONE_ID: process.env.BUNNY_PULL_ZONE_ID,
    ST_MOCK_DNS_RESOLVE: process.env.ST_MOCK_DNS_RESOLVE
  }
  if (key === null) delete process.env.BUNNY_API_KEY
  else process.env.BUNNY_API_KEY = key
  if (zone === null) delete process.env.BUNNY_PULL_ZONE_ID
  else process.env.BUNNY_PULL_ZONE_ID = zone
  if (mock === undefined) delete process.env.ST_MOCK_DNS_RESOLVE
  else process.env.ST_MOCK_DNS_RESOLVE = mock
  return prev
}
function restoreEnv(prev) {
  for (const k of Object.keys(prev)) {
    if (prev[k] === undefined) delete process.env[k]
    else process.env[k] = prev[k]
  }
}

// Replaces global.fetch with a recorder. `impl` returns { ok, status } or throws.
function withFetch(impl, fn) {
  const calls = []
  const orig = global.fetch
  global.fetch = async (url, options) => {
    calls.push({ url, options })
    return impl(url, options)
  }
  return Promise.resolve(fn(calls)).finally(() => { global.fetch = orig })
}

const okResp = (status = 204) => ({ ok: status >= 200 && status < 300, status })

// Capture everything written to console.{log,warn,error} during fn.
async function captureConsole(fn) {
  const out = []
  const orig = { log: console.log, warn: console.warn, error: console.error }
  console.log = (...a) => out.push(a.join(' '))
  console.warn = (...a) => out.push(a.join(' '))
  console.error = (...a) => out.push(a.join(' '))
  try {
    await fn()
  } finally {
    Object.assign(console, orig)
  }
  return out.join('\n')
}

test('bunny-edge — addPullZoneHostname hits the correct endpoint/method/headers/body', async () => {
  const prev = setEnv()
  try {
    await withFetch(() => okResp(204), async (calls) => {
      const r = await addPullZoneHostname('  Track.Example.COM.  ')
      assert.strictEqual(r.ok, true)
      assert.strictEqual(r.status, 204)
      assert.strictEqual(calls.length, 1)
      assert.strictEqual(calls[0].url, 'https://api.bunny.net/pullzone/6119064/addHostname')
      assert.strictEqual(calls[0].options.method, 'POST')
      assert.strictEqual(calls[0].options.headers.AccessKey, KEY)
      // Hostname normalized (lowercased, trailing dot stripped) + Bunny's exact field name.
      assert.deepStrictEqual(JSON.parse(calls[0].options.body), { Hostname: 'track.example.com' })
    })
  } finally { restoreEnv(prev) }
})

test('bunny-edge — loadFreeCertificate is GET with hostname query + AccessKey', async () => {
  const prev = setEnv()
  try {
    await withFetch(() => okResp(200), async (calls) => {
      const r = await loadFreeCertificate('track.example.com')
      assert.strictEqual(r.ok, true)
      assert.strictEqual(calls[0].url, 'https://api.bunny.net/pullzone/loadFreeCertificate?hostname=track.example.com')
      assert.strictEqual(calls[0].options.method, 'GET')
      assert.strictEqual(calls[0].options.headers.AccessKey, KEY)
      assert.strictEqual(calls[0].options.body, undefined)
    })
  } finally { restoreEnv(prev) }
})

test('bunny-edge — removePullZoneHostname is DELETE with Hostname body', async () => {
  const prev = setEnv()
  try {
    await withFetch(() => okResp(204), async (calls) => {
      const r = await removePullZoneHostname('track.example.com')
      assert.strictEqual(r.ok, true)
      assert.strictEqual(calls[0].url, 'https://api.bunny.net/pullzone/6119064/removeHostname')
      assert.strictEqual(calls[0].options.method, 'DELETE')
      assert.deepStrictEqual(JSON.parse(calls[0].options.body), { Hostname: 'track.example.com' })
    })
  } finally { restoreEnv(prev) }
})

test('bunny-edge — fail-closed when BUNNY_API_KEY is missing (no network call)', async () => {
  const prev = setEnv({ key: null })
  try {
    assert.strictEqual(isBunnyConfigured(), false)
    await withFetch(() => { throw new Error('network must not be called') }, async (calls) => {
      const r = await addPullZoneHostname('track.example.com')
      assert.strictEqual(r.ok, false)
      assert.strictEqual(r.disabled, true)
      assert.strictEqual(calls.length, 0)
    })
  } finally { restoreEnv(prev) }
})

test('bunny-edge — fail-closed when BUNNY_PULL_ZONE_ID is missing', async () => {
  const prev = setEnv({ zone: null })
  try {
    assert.strictEqual(isBunnyConfigured(), false)
    await withFetch(() => { throw new Error('network must not be called') }, async (calls) => {
      const r = await loadFreeCertificate('track.example.com')
      assert.strictEqual(r.disabled, true)
      assert.strictEqual(calls.length, 0)
    })
  } finally { restoreEnv(prev) }
})

test('bunny-edge — mock mode short-circuits without touching the network', async () => {
  const prev = setEnv({ mock: 'true' })
  try {
    await withFetch(() => { throw new Error('network must not be called') }, async (calls) => {
      const r = await addPullZoneHostname('track.example.com')
      assert.deepStrictEqual(r, { ok: true, skipped: 'mock' })
      assert.strictEqual(calls.length, 0)
    })
  } finally { restoreEnv(prev) }
})

test('bunny-edge — fail-safe: never throws when fetch rejects', async () => {
  const prev = setEnv()
  try {
    await withFetch(() => { throw new Error('boom fetch failed') }, async () => {
      const r = await addPullZoneHostname('track.example.com')
      assert.strictEqual(r.ok, false)
      assert.strictEqual(r.error, 'Bunny request failed')
    })
  } finally { restoreEnv(prev) }
})

test('bunny-edge — API key is NEVER logged (success, non-2xx, and error paths)', async () => {
  const prev = setEnv()
  try {
    // success
    let logs = await captureConsole(() =>
      withFetch(() => okResp(204), () => addPullZoneHostname('track.example.com')))
    assert.ok(!logs.includes(KEY), 'key leaked on success path')

    // non-2xx (logs a status warning)
    logs = await captureConsole(() =>
      withFetch(() => okResp(400), () => addPullZoneHostname('track.example.com')))
    assert.ok(!logs.includes(KEY), 'key leaked on non-2xx path')

    // fetch throws a realistic network error (never carries the header key) —
    // proves our own logging never surfaces the key.
    logs = await captureConsole(() =>
      withFetch(() => { throw new Error('fetch failed') }, () => loadFreeCertificate('track.example.com')))
    assert.ok(!logs.includes(KEY), 'key leaked on error path')
  } finally { restoreEnv(prev) }
})

test('bunny-edge — invalid/empty hostname returns error without a network call', async () => {
  const prev = setEnv()
  try {
    await withFetch(() => { throw new Error('network must not be called') }, async (calls) => {
      const r = await addPullZoneHostname('')
      assert.strictEqual(r.ok, false)
      assert.strictEqual(r.error, 'Invalid hostname')
      assert.strictEqual(calls.length, 0)
    })
  } finally { restoreEnv(prev) }
})
