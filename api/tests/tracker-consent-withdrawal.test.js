// consent(false) must ERASE stored identifiers, not just stop using them (GDPR withdrawal).
// Before this fix consent(false) only set _consentGiven=false + cleared the queue; st_aid, the
// first-touch keys, st_sid, and the st_aid cookie all survived. This pins the erasure:
//  - every st_* key gone after withdrawal EXCEPT st_consent (with and without data-cookie-domain);
//  - the st_aid cookie deleted (domain + host-only variants);
//  - getToken() returns null while withdrawn (in-memory AID nulled);
//  - same-page optIn() mints a NEW id — the erased one never returns;
//  - the preserve-list is EXACTLY ['st_consent'] (source-pinned, so extending it forces a test).
// NOTE: client-side erasure only. Server-side GDPR erasure is Phase 7 and NOT part of this.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import vm from 'node:vm'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const trackerCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.js'), 'utf8')

function makeStorage () {
  const data = {}
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v) },
    removeItem: (k) => { delete data[k] },
    key: (i) => { const ks = Object.keys(data); return i < ks.length ? ks[i] : null },
    get length () { return Object.keys(data).length },
    _keys: () => Object.keys(data)
  }
}

function run (opts = {}) {
  const attrs = { 'data-site-key': 'sk-test' }
  if (opts.cookieDomain) attrs['data-cookie-domain'] = opts.cookieDomain
  const payloads = []
  const cookieJar = {}   // name -> value (mock keys by name; domain/path are metadata here)

  const documentMock = {
    referrer: '', readyState: 'complete', body: {},
    currentScript: { getAttribute: (n) => (n in attrs ? attrs[n] : null), src: 'https://api.srctk.com/tracker.js' },
    querySelector: () => null, querySelectorAll: () => [], createElement: () => ({}),
    addEventListener: () => {}
  }
  Object.defineProperty(documentMock, 'cookie', {
    get () { return Object.keys(cookieJar).map((k) => k + '=' + cookieJar[k]).join('; ') },
    set (str) {
      const seg = String(str).split(';')
      const eq = seg[0].indexOf('=')
      const name = seg[0].slice(0, eq).trim()
      const value = seg[0].slice(eq + 1)
      if (/(?:^|;\s*)max-age=0\b/i.test(str) || /expires=Thu, 01 Jan 1970/i.test(str)) { delete cookieJar[name] }
      else if (name) { cookieJar[name] = value }
    }
  })

  const location = { href: 'https://example.com/p?utm_source=google&utm_medium=cpc', pathname: '/p', search: '?utm_source=google&utm_medium=cpc', origin: 'https://example.com', hostname: 'example.com', protocol: 'https:' }
  const localStorageMock = makeStorage()
  const sessionStorageMock = makeStorage()
  const navigatorMock = {
    doNotTrack: null, globalPrivacyControl: null,
    sendBeacon: (u, blob) => { if (blob && blob.parts) payloads.push({ url: u, body: JSON.parse(blob.parts[0]) }); return true }
  }
  const windowMock = {
    location, document: documentMock, navigator: navigatorMock, doNotTrack: null,
    history: { pushState () {}, replaceState () {} },
    fetch: async (u, o) => {
      if (String(u).includes('/api/tracker/id')) return { ok: true, json: async () => ({ visitor_id: 'v1', session_id: 's1' }) }
      if (o && o.body) payloads.push({ url: u, body: JSON.parse(o.body) })
      return { ok: true, json: async () => ({ success: true }) }
    },
    addEventListener: () => {}
  }
  const context = vm.createContext({
    window: windowMock, document: documentMock, location, navigator: navigatorMock, history: windowMock.history,
    addEventListener: () => {}, fetch: windowMock.fetch,
    localStorage: localStorageMock, sessionStorage: sessionStorageMock,
    setTimeout: (fn) => { return 0 }, clearTimeout: () => {},
    MutationObserver: class { observe () {} disconnect () {} },
    WeakMap: globalThis.WeakMap, URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams,
    Blob: class { constructor (parts) { this.parts = parts } },
    console: { warn () {}, error () {}, log () {} }
  })
  vm.runInContext(trackerCode, context)
  const settle = () => new Promise((r) => setTimeout(r, 0))
  return {
    st: () => context.window.sourcetrack,
    ls: localStorageMock, ss: sessionStorageMock,
    cookieNames: () => Object.keys(cookieJar),
    payloads, settle
  }
}

test('consent(false) erases every st_* key EXCEPT st_consent (no cookie-domain)', async () => {
  const h = run()
  await h.settle()
  // pre: identifiers present
  assert.ok(h.ls.getItem('st_aid'), 'st_aid stored before withdrawal')
  assert.ok(h.ls.getItem('st_ft_src'), 'first-touch stored before withdrawal')
  assert.ok(h.ss.getItem('st_sid'), 'session id stored before withdrawal')

  h.st().consent(false)

  const survivors = h.ls._keys().concat(h.ss._keys())
  assert.deepEqual(survivors, ['st_consent'], 'only st_consent survives withdrawal')
  assert.equal(h.ls.getItem('st_consent'), 'false', 'withdrawal is remembered')
  assert.equal(h.st().getToken(), null, 'getToken() returns null while withdrawn (in-memory AID nulled)')
})

test('consent(false) deletes the st_aid cookie (data-cookie-domain set)', async () => {
  const h = run({ cookieDomain: '.example.com' })
  await h.settle()
  assert.ok(h.cookieNames().includes('st_aid'), 'st_aid cookie written when cookie-domain configured')

  h.st().consent(false)
  assert.ok(!h.cookieNames().includes('st_aid'), 'st_aid cookie deleted on withdrawal')
})

test('optIn() after withdrawal mints a NEW id — the erased one never returns', async () => {
  const h = run()
  await h.settle()
  const original = h.st().getToken()
  assert.ok(original, 'had an id')

  h.st().consent(false)
  assert.equal(h.st().getToken(), null)

  h.st().optIn()
  const resumed = h.st().getToken()
  assert.ok(resumed, 're-consent produces an id')
  assert.notEqual(resumed, original, 're-consent mints a FRESH id, not the erased one')
  assert.equal(h.ls.getItem('st_aid'), resumed, 'the fresh id is persisted')
})

test('nothing transmits while withdrawn, and re-consent does not replay withdrawal-era data', async () => {
  const h = run()
  await h.settle()
  h.st().consent(false)
  const before = h.payloads.length
  h.st().track('while_withdrawn', {})     // an event fired during withdrawal
  await h.settle()
  assert.equal(h.payloads.length, before, 'no transmission while withdrawn (dropped, not queued)')
  h.st().optIn()
  await h.settle()
  assert.ok(!h.payloads.some((p) => p.body && p.body.event === 'while_withdrawn'), 'withdrawal-era event never sent after re-consent')
})

test('preserve-list is EXACTLY ["st_consent"] (extending it must change this test)', () => {
  const src = fs.readFileSync(path.join(rootDir, 'tracker/tracker.js'), 'utf8')
  assert.match(src, /PRESERVE_ON_WITHDRAWAL = \['st_consent'\]/, 'the ONLY key that survives withdrawal is st_consent')
})
