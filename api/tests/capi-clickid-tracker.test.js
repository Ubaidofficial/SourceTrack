import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import vm from 'node:vm'
import { fileURLToPath } from 'url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const trackerCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.js'), 'utf8')
const cookielessCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.cookieless.js'), 'utf8')

// Run a tracker build with a mocked browser; capture outbound payloads. `cookie`
// seeds document.cookie (read-only — the merchant's own Meta _fbp/_fbc).
function run(code, { doNotTrack = null, cookie = '' } = {}) {
  const payloads = []
  const listeners = {}
  const location = { href: 'https://example.com/thanks?utm_source=fb', pathname: '/thanks', search: '?utm_source=fb', origin: 'https://example.com', hostname: 'example.com', protocol: 'https:' }
  const documentMock = {
    referrer: '', cookie, readyState: 'complete', body: {},
    currentScript: { getAttribute: (n) => (n === 'data-site-key' ? 'sk' : null), src: 'https://api.srctk.com/t.js' },
    querySelector: () => null, querySelectorAll: () => [], addEventListener: (e, h) => { listeners[e] = h }
  }
  const storage = {}
  const ls = { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v) }, removeItem: (k) => { delete storage[k] } }
  const navigatorMock = {
    doNotTrack, globalPrivacyControl: null,
    sendBeacon: (u, blob) => { if (blob && blob.parts) payloads.push({ url: u, body: JSON.parse(blob.parts[0]) }); return true }
  }
  const windowMock = {
    location, document: documentMock, navigator: navigatorMock, doNotTrack,
    history: { pushState() {}, replaceState() {} },
    fetch: async (u) => String(u).includes('/api/tracker/id')
      ? { ok: true, json: async () => ({ visitor_id: 'v1', session_id: 's1' }) }
      : { ok: true, json: async () => ({}) },
    addEventListener: (e, h) => { listeners[e] = h }
  }
  const ctx = vm.createContext({
    window: windowMock, document: documentMock, location, navigator: navigatorMock, history: windowMock.history,
    addEventListener: windowMock.addEventListener, fetch: windowMock.fetch,
    localStorage: ls, sessionStorage: ls, setTimeout: (fn) => { fn && fn(); return 0 }, clearTimeout: () => {},
    MutationObserver: class { observe() {} disconnect() {} },
    WeakMap: globalThis.WeakMap, URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams,
    Blob: class { constructor(p) { this.parts = p } },
    console: { warn() {}, error() {}, log() {} }
  })
  vm.runInContext(code, ctx)
  return { window: ctx.window, payloads, settle: () => new Promise(r => setTimeout(r, 0)) }
}

test('cookie build: conversion() forwards event_id + the merchant _fbp/_fbc cookies', async () => {
  const h = run(trackerCode, { cookie: '_fbp=fb.1.111.AAA; _fbc=fb.1.222.BBB' })
  h.window.sourcetrack.conversion({ event_id: 'e1', value: 10, order_id: 'o1' })
  const conv = h.payloads.find(p => p.url.includes('/api/conversion'))
  assert.ok(conv, 'conversion payload sent')
  assert.strictEqual(conv.body.event_id, 'e1')
  assert.strictEqual(conv.body.fbp, 'fb.1.111.AAA')
  assert.strictEqual(conv.body.fbc, 'fb.1.222.BBB')
})

test('cookieless build: forwards event_id but NOT _fbp/_fbc (reads no cookies)', async () => {
  const h = run(cookielessCode, { cookie: '_fbp=fb.1.111.AAA; _fbc=fb.1.222.BBB' })
  h.window.sourcetrack.conversion({ event_id: 'e2', value: 10, order_id: 'o2' })
  await h.settle()  // cookieless buffers until the async id resolves
  const conv = h.payloads.find(p => p.url.includes('/api/conversion'))
  assert.ok(conv, 'conversion payload sent')
  assert.strictEqual(conv.body.event_id, 'e2')
  assert.ok(!('fbp' in conv.body), 'cookieless must not read _fbp')
  assert.ok(!('fbc' in conv.body), 'cookieless must not read _fbc')
})

test('cookie build: DNT exposes an all-no-op stub — a conversion() call captures nothing', () => {
  const h = run(trackerCode, { doNotTrack: '1', cookie: '_fbp=fb.1.111.AAA' })
  assert.ok(h.window.sourcetrack, 'stub exists so customer calls never throw')
  h.window.sourcetrack.conversion({ event_id: 'e', value: 10, order_id: 'o' })  // must be a safe no-op
  assert.strictEqual(h.payloads.length, 0, 'no capture surface under DNT — no _fbp, no payloads')
})
