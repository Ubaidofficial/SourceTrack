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

// A hidden input with the bits fillHiddenFields touches: value + get/setAttribute.
function hiddenInput(name, value = '') {
  return {
    type: 'hidden', name, value, _attrs: {},
    getAttribute(n) { return this._attrs[n] !== undefined ? this._attrs[n] : null },
    setAttribute(n, v) { this._attrs[n] = String(v) }
  }
}
// A form holding hidden inputs by name. querySelector parses name="X".
function makeForm(inputs = {}) {
  return {
    nodeName: 'FORM',
    _inputs: inputs,
    appendChildCalls: 0,
    appendChild() { this.appendChildCalls++ },     // must NEVER be called (createMissing:false)
    querySelector(sel) {
      const m = /name="([^"]+)"/.exec(sel)
      if (!m) return null
      return this._inputs[m[1]] || null
    }
  }
}

function run(code, opts = {}) {
  const {
    autoFields = false, consentRequired = false, doNotTrack = null,
    gpc = null, readyState = 'complete', forms = []
  } = opts

  const listeners = {}
  let qsaCalls = 0
  const observers = []
  const timeouts = []

  const attrs = { 'data-site-key': 'sk-test' }
  if (autoFields) attrs['data-auto-fields'] = 'true'
  if (consentRequired) attrs['data-consent-required'] = 'true'

  const documentMock = {
    referrer: 'https://ref.example.com/page',
    cookie: '',
    readyState,
    body: {},
    currentScript: { getAttribute: (n) => (n in attrs ? attrs[n] : null) },
    querySelector: () => null,
    querySelectorAll: () => { qsaCalls++; return forms },
    createElement: () => hiddenInput('created'),       // if ever called → createMissing leak
    addEventListener: (e, h) => { listeners[e] = h }
  }
  class MutationObserverMock {
    constructor(cb) { this.cb = cb; this.observed = false; this.disconnected = false; observers.push(this) }
    observe() { this.observed = true }
    disconnect() { this.disconnected = true }
  }
  const storage = {}
  const ls = { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v) }, removeItem: (k) => { delete storage[k] } }
  const navigatorMock = {
    doNotTrack, globalPrivacyControl: gpc,
    sendBeacon: () => true
  }
  const windowMock = {
    location: { href: 'https://example.com/contact?utm_source=google&gclid=g-123', pathname: '/contact', search: '?utm_source=google&gclid=g-123', origin: 'https://example.com', hostname: 'example.com' },
    document: documentMock, navigator: navigatorMock, doNotTrack,
    history: { pushState() {}, replaceState() {} },
    fetch: async (url) => url.includes('/api/tracker/id')
      ? { ok: true, json: async () => ({ visitor_id: 'v1', session_id: 's1' }) }
      : { ok: true, json: async () => ({ success: true }) },
    addEventListener: (e, h) => { listeners[e] = h }
  }
  const context = vm.createContext({
    window: windowMock, document: documentMock, location: windowMock.location,
    navigator: navigatorMock, history: windowMock.history,
    addEventListener: windowMock.addEventListener, fetch: windowMock.fetch,
    localStorage: ls, sessionStorage: ls,
    setTimeout: (fn, d) => { timeouts.push(fn); return timeouts.length },
    clearTimeout: () => {},
    MutationObserver: MutationObserverMock,
    WeakMap: globalThis.WeakMap, URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams,
    Blob: class { constructor(p) { this.parts = p } },
    console: { warn() {}, error() {}, log() {} }
  })
  vm.runInContext(code, context)
  return { window: context.window, listeners, observers, timeouts, qsaCalls: () => qsaCalls, documentMock }
}

for (const [label, code] of [['cookie', trackerCode], ['cookieless', cookielessCode]]) {
  test(`auto-fields [${label}] — flag OFF → zero behavior (no querySelectorAll, no observer)`, () => {
    const input = hiddenInput('st_utm_source', '')
    const h = run(code, { autoFields: false, forms: [makeForm({ st_utm_source: input })] })
    assert.strictEqual(input.value, '')
    assert.strictEqual(h.qsaCalls(), 0)
    assert.strictEqual(h.observers.length, 0)
  })

  test(`auto-fields [${label}] — empty matching field is filled (+ marked)`, () => {
    const input = hiddenInput('st_utm_source', '')
    const gclid = hiddenInput('st_gclid', '')
    run(code, { autoFields: true, forms: [makeForm({ st_utm_source: input, st_gclid: gclid })] })
    assert.strictEqual(input.value, 'google')
    assert.strictEqual(gclid.value, 'g-123')
    assert.strictEqual(input.getAttribute('data-st-injected'), '1')
  })

  test(`auto-fields [${label}] — NON-empty field is NOT overwritten`, () => {
    const input = hiddenInput('st_utm_source', 'preset-by-customer')
    run(code, { autoFields: true, forms: [makeForm({ st_utm_source: input })] })
    assert.strictEqual(input.value, 'preset-by-customer')
  })

  test(`auto-fields [${label}] — no matching field → no node created (createMissing:false)`, () => {
    const form = makeForm({})  // no hidden inputs
    run(code, { autoFields: true, forms: [form] })
    assert.strictEqual(form.appendChildCalls, 0)
  })

  test(`auto-fields [${label}] — GPC/DNT blocks fill`, () => {
    const input = hiddenInput('st_utm_source', '')
    run(code, { autoFields: true, gpc: true, forms: [makeForm({ st_utm_source: input })] })
    assert.strictEqual(input.value, '')
  })

  test(`auto-fields [${label}] — idempotent: data-st-injected prevents re-fill`, () => {
    const input = hiddenInput('st_utm_source', '')
    const form = makeForm({ st_utm_source: input })
    const h = run(code, { autoFields: true, forms: [form] })
    assert.strictEqual(input.value, 'google')
    input.value = ''  // simulate the page clearing it; marker should still block re-fill
    // fire the observer's late-form path → runAutoFill again
    if (h.observers[0]) h.observers[0].cb([{ addedNodes: [form] }])
    assert.strictEqual(input.value, '')  // not re-filled (marker guard)
  })

  test(`auto-fields [${label}] — a throw inside fill never escapes (form unaffected)`, () => {
    const input = hiddenInput('st_utm_source', '')
    const form = makeForm({ st_utm_source: input })
    const h = run(code, { autoFields: true, forms: [form] })
    h.window.sourcetrack.fillHiddenFields = () => { throw new Error('boom') }
    assert.doesNotThrow(() => { if (h.observers[0]) h.observers[0].cb([{ addedNodes: [form] }]) })
  })

  test(`auto-fields [${label}] — bounded observer disconnects on the timeout cap`, () => {
    const h = run(code, { autoFields: true, forms: [makeForm({})] })
    assert.strictEqual(h.observers.length, 1)
    assert.strictEqual(h.observers[0].observed, true)
    h.timeouts.forEach(fn => fn())  // fire the 10s cap
    assert.strictEqual(h.observers[0].disconnected, true)
  })
}

// Consent gate exists only in the cookie build.
test('auto-fields [cookie] — consent required & not given → not filled', () => {
  const input = hiddenInput('st_utm_source', '')
  run(trackerCode, { autoFields: true, consentRequired: true, forms: [makeForm({ st_utm_source: input })] })
  assert.strictEqual(input.value, '')
})
