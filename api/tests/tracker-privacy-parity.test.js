import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import vm from 'node:vm'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const trackerCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.js'), 'utf8')
const cookielessCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.cookieless.js'), 'utf8')

// Run a tracker build in a mocked browser. Captures every outbound payload
// (sendBeacon Blob + fetch POST body). Returns helpers to settle the async id
// fetch and inspect what was actually transmitted.
function run(code, opts = {}) {
  const { doNotTrack = null, gpc = null, consentRequired = false } = opts
  const payloads = []
  const listeners = {}
  const attrs = { 'data-site-key': 'sk-test' }
  if (consentRequired) attrs['data-consent-required'] = 'true'

  const location = { href: 'https://example.com/p?utm_source=google', pathname: '/p', search: '?utm_source=google', origin: 'https://example.com', hostname: 'example.com', protocol: 'https:' }
  const documentMock = {
    referrer: 'https://ref.example.com/x', cookie: '', readyState: 'complete', body: {},
    currentScript: { getAttribute: (n) => (n in attrs ? attrs[n] : null), src: 'https://api.srctk.com/tracker.js' },
    querySelector: () => null, querySelectorAll: () => [], createElement: () => ({}),
    addEventListener: (e, h) => { listeners[e] = h }
  }
  const storage = {}
  const ls = { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v) }, removeItem: (k) => { delete storage[k] } }
  const navigatorMock = {
    doNotTrack, globalPrivacyControl: gpc,
    sendBeacon: (u, blob) => { if (blob && blob.parts) payloads.push({ url: u, body: JSON.parse(blob.parts[0]) }); return true }
  }
  const windowMock = {
    location, document: documentMock, navigator: navigatorMock, doNotTrack,
    history: { pushState() {}, replaceState() {} },
    fetch: async (u, o) => {
      if (String(u).includes('/api/tracker/id')) return { ok: true, json: async () => ({ visitor_id: 'v1', session_id: 's1' }) }
      if (o && o.body) payloads.push({ url: u, body: JSON.parse(o.body) })
      return { ok: true, json: async () => ({ success: true }) }
    },
    addEventListener: (e, h) => { listeners[e] = h }
  }
  const context = vm.createContext({
    window: windowMock, document: documentMock, location, navigator: navigatorMock, history: windowMock.history,
    addEventListener: windowMock.addEventListener, fetch: windowMock.fetch,
    localStorage: ls, sessionStorage: ls,
    setTimeout: (fn) => { return 0 }, clearTimeout: () => {},
    MutationObserver: class { observe() {} disconnect() {} },
    WeakMap: globalThis.WeakMap, URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams,
    Blob: class { constructor(parts) { this.parts = parts } },
    console: { warn() {}, error() {}, log() {} }
  })
  vm.runInContext(code, context)
  const settle = () => new Promise(r => setTimeout(r, 0))  // let the async id fetch + flush resolve
  return { window: context.window, payloads, settle }
}

// ── DNT / GPC hard-abort (both builds) ──────────────────────────────────────
test('cookieless — DNT="1" aborts the whole tracker (no API, no payloads)', async () => {
  const h = run(cookielessCode, { doNotTrack: '1' })
  await h.settle()
  assert.strictEqual(h.window.sourcetrack, undefined)
  assert.strictEqual(h.payloads.length, 0)
})

test('cookieless — GPC=true aborts the whole tracker', async () => {
  const h = run(cookielessCode, { gpc: true })
  await h.settle()
  assert.strictEqual(h.window.sourcetrack, undefined)
  assert.strictEqual(h.payloads.length, 0)
})

test('cookie — DNT="1" aborts (parity sanity — unchanged)', async () => {
  const h = run(trackerCode, { doNotTrack: '1' })
  await h.settle()
  assert.strictEqual(h.window.sourcetrack, undefined)
})

// ── Consent gate (cookieless port) ──────────────────────────────────────────
test('cookieless — consent-required holds events, then flushes on consent(true)', async () => {
  const h = run(cookielessCode, { consentRequired: true })
  await h.settle()  // id resolves, queued pageview routed to the consent queue
  assert.strictEqual(h.payloads.length, 0, 'nothing sent before consent')
  assert.strictEqual(h.window.sourcetrack.hasConsent(), null)

  h.window.sourcetrack.consent(true)
  await h.settle()
  assert.ok(h.payloads.length > 0, 'queued events flushed after consent(true)')
  assert.strictEqual(h.window.sourcetrack.hasConsent(), true)
})

test('cookieless — optOut() suppresses subsequent sends; optIn() resumes', async () => {
  const h = run(cookielessCode)               // opt-out model (no consent attr) → tracking on
  await h.settle()
  const before = h.payloads.length

  h.window.sourcetrack.optOut()
  h.window.sourcetrack.track('after_optout')
  await h.settle()
  assert.ok(!h.payloads.some(p => p.body && p.body.event === 'after_optout'), 'optOut suppresses send')

  h.window.sourcetrack.optIn()
  h.window.sourcetrack.track('after_optin')
  await h.settle()
  assert.ok(h.payloads.some(p => p.body && p.body.event === 'after_optin'), 'optIn resumes send')
  assert.ok(h.payloads.length >= before)
})

test('cookieless — exposes the full consent API (parity with cookie build)', async () => {
  const h = run(cookielessCode)
  await h.settle()
  for (const m of ['consent', 'optIn', 'optOut', 'hasConsent']) {
    assert.strictEqual(typeof h.window.sourcetrack[m], 'function', `missing ${m}()`)
  }
})
