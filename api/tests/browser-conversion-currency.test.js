// The browser conversion rail can now carry a currency — OPTIONALLY.
//
// WHY THIS EXISTS: /api/conversion, /api/events (server SDK) and the two tracker builds had no
// currency concept at all. Not "dropped one that was sent" — the field was never offered
// anywhere along that rail, so a browser-side purchase was recorded as an amount with no unit.
// Traced from a real prod row: 777.77 on www.techrupt.pk, ingestion_method 'server_routed',
// currency NULL.
//
// THE LOAD-BEARING PROPERTY IS THE NON-BREAKING ONE. This rail is live and customers already
// call sourcetrack.conversion({ value: X }) with no currency. Unlike /api/conversion/offline —
// which REJECTS with 400 when value > 0 and currency is missing — nothing here may become
// required, and a malformed code must not start failing requests that succeed today. Absent
// currency stays absent, which after #532 surfaces as 'partial' rather than a false 'ok'/USD.
//
// So the first test below is the one that matters most: a call with no currency must produce a
// dual-write payload with NO currency key at all — identical to what shipped before this change.

import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import vm from 'node:vm'
import { fileURLToPath } from 'url'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
// The literal all-zero placeholder every other test in this suite uses. check-secret-safety.js
// recognises this exact form; a computed equivalent ('0'.repeat(64)) reads to it as an inline
// secret assignment and fails qa:secrets.
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const {
  conversion, __setConversionDedupeDeps, __resetConversionDedupeDeps, __flushConversionDedupeCache
} = await import('../routes/conversion.js')

// ── /api/conversion, driven through the REAL handler ─────────────────────────
// Asserting on the properties handed to dualWrite is the point: that object IS the event that
// reaches Tinybird and, via nightly, attributed_conversions.currency. A source-level check
// could not tell whether the key actually survives to the wire.

function mockRes () {
  return { statusCode: 200, body: null, status (c) { this.statusCode = c; return this }, json (b) { this.body = b; return this } }
}

function mockReq (body = {}) {
  return {
    headers: {}, socket: { remoteAddress: '127.0.0.1' },
    body: { conversion_value: 99, conversion_type: 'purchase', page_url: 'https://x.example.com/checkout', order_id: `o-${Math.random()}`, ...body },
    site: { id: 'site-1', site_key: 'sk_test', plan: 'free', excluded_paths: [], custom_url_params: null }
  }
}

function makeDeps () {
  const captured = []
  return {
    captured,
    deps: {
      claim: async () => ({ success: true, duplicate: false }),
      rollback: async () => {},
      usage: async () => ({ allowed: true }),
      dualWrite: (evt) => { captured.push(evt); return true }
    }
  }
}

async function drive (body) {
  const h = makeDeps()
  __flushConversionDedupeCache()
  __setConversionDedupeDeps(h.deps)
  try {
    const res = mockRes()
    await conversion(mockReq(body), res)
    return { res, props: h.captured[0]?.properties, calls: h.captured.length }
  } finally { __resetConversionDedupeDeps() }
}

test('NON-BREAKING: no currency parameter → the key is ABSENT, exactly as before this change', async () => {
  const { res, props, calls } = await drive({})
  assert.strictEqual(calls, 1, 'the conversion still dual-writes')
  assert.ok(res.statusCode < 400, `no new rejection (got ${res.statusCode})`)
  // Not "currency: null" — the key must not appear at all, so the payload is byte-identical to
  // what an existing customer's call produced before this change.
  assert.ok(!('currency' in props), 'currency key must not be added when the caller sends none')
})

test('a valid currency is recorded, normalized to canonical form', async () => {
  const { res, props } = await drive({ currency: 'eur' })
  assert.ok(res.statusCode < 400)
  assert.strictEqual(props.currency, 'EUR', 'lower-case input is canonicalized')

  const padded = await drive({ currency: '  gbp ' })
  assert.strictEqual(padded.props.currency, 'GBP')
})

test('NON-BREAKING: a malformed currency does NOT 400 — it is simply not recorded', async () => {
  // /api/conversion/offline would reject these. This rail must not: a customer who starts
  // sending a bad code should keep getting their conversions counted, just without a unit.
  for (const bad of ['dollars', '$', 'US', 'USDD', '', '   ', 123, null]) {
    const { res, props, calls } = await drive({ currency: bad })
    assert.strictEqual(calls, 1, `${JSON.stringify(bad)}: conversion still written`)
    assert.ok(res.statusCode < 400, `${JSON.stringify(bad)}: must not introduce a 400`)
    assert.ok(!('currency' in props), `${JSON.stringify(bad)}: malformed code must not be recorded`)
  }
})

test('currency is accepted on a $0 conversion too — never required, never validated', async () => {
  // No "currency required when value > 0" rule exists on this rail, in either direction.
  const zeroNoCurrency = await drive({ conversion_value: 0 })
  assert.ok(zeroNoCurrency.res.statusCode < 400)
  assert.ok(!('currency' in zeroNoCurrency.props))

  const zeroWithCurrency = await drive({ conversion_value: 0, currency: 'JPY' })
  assert.ok(zeroWithCurrency.res.statusCode < 400)
  assert.strictEqual(zeroWithCurrency.props.currency, 'JPY')
})

test('a recorded currency always satisfies the DB CHECK it will land in', async () => {
  // attributed_conversions_currency_format is CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$').
  // Anything this rail writes must pass it, or the nightly write throws mid money rail.
  for (const input of ['usd', 'EUR', ' gbp ', 'jpy']) {
    const { props } = await drive({ currency: input })
    assert.match(props.currency, /^[A-Z]{3}$/)
  }
})

// ── the tracker builds ───────────────────────────────────────────────────────

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const trackerCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.js'), 'utf8')
const cookielessCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.cookieless.js'), 'utf8')

// Same mocked-browser harness as capi-clickid-tracker.test.js.
function run (code, { cookie = '' } = {}) {
  const payloads = []
  const listeners = {}
  const location = { href: 'https://example.com/thanks', pathname: '/thanks', search: '', origin: 'https://example.com', hostname: 'example.com', protocol: 'https:' }
  const documentMock = {
    referrer: '', cookie, readyState: 'complete', body: {},
    currentScript: { getAttribute: (n) => (n === 'data-site-key' ? 'sk' : null), src: 'https://api.srctk.com/t.js' },
    querySelector: () => null, querySelectorAll: () => [], addEventListener: (e, h) => { listeners[e] = h }
  }
  const storage = {}
  const ls = { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v) }, removeItem: (k) => { delete storage[k] } }
  const navigatorMock = {
    doNotTrack: null, globalPrivacyControl: null,
    sendBeacon: (u, blob) => { if (blob && blob.parts) payloads.push({ url: u, body: JSON.parse(blob.parts[0]) }); return true }
  }
  const windowMock = {
    location, document: documentMock, navigator: navigatorMock, doNotTrack: null,
    history: { pushState () {}, replaceState () {} },
    fetch: async (u) => String(u).includes('/api/tracker/id')
      ? { ok: true, json: async () => ({ visitor_id: 'v1', session_id: 's1' }) }
      : { ok: true, json: async () => ({}) },
    addEventListener: (e, h) => { listeners[e] = h }
  }
  const ctx = vm.createContext({
    window: windowMock, document: documentMock, location, navigator: navigatorMock, history: windowMock.history,
    addEventListener: windowMock.addEventListener, fetch: windowMock.fetch,
    localStorage: ls, sessionStorage: ls, setTimeout: (fn) => { fn && fn(); return 0 }, clearTimeout: () => {},
    MutationObserver: class { observe () {} disconnect () {} },
    WeakMap: globalThis.WeakMap, URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams,
    Blob: class { constructor (p) { this.parts = p } },
    console: { warn () {}, error () {}, log () {} }
  })
  vm.runInContext(code, ctx)
  return { window: ctx.window, payloads, settle: () => new Promise(r => setTimeout(r, 0)) }
}

test('cookie build: conversion() forwards an explicit currency, and sends null when omitted', async () => {
  const withCur = run(trackerCode)
  withCur.window.sourcetrack.conversion({ value: 99, currency: 'EUR', order_id: 'o1' })
  const a = withCur.payloads.find(p => p.url.includes('/api/conversion'))
  assert.ok(a, 'conversion payload sent')
  assert.strictEqual(a.body.currency, 'EUR')
  assert.strictEqual(a.body.conversion_value, 99, 'value still forwarded unchanged')

  // Omitted → null, matching how this file already sends order_id/event_id. The server treats
  // null exactly as it treats absent: the key never reaches the event.
  const without = run(trackerCode)
  without.window.sourcetrack.conversion({ value: 99, order_id: 'o2' })
  const b = without.payloads.find(p => p.url.includes('/api/conversion'))
  assert.strictEqual(b.body.currency, null)
  assert.strictEqual(b.body.conversion_value, 99)
})

test('cookieless build: currency works and the build still reads NO cookies', async () => {
  const h = run(cookielessCode, { cookie: '_fbp=fb.1.111.AAA; _fbc=fb.1.222.BBB' })
  h.window.sourcetrack.conversion({ value: 99, currency: 'gbp', order_id: 'o3' })
  await h.settle()   // cookieless buffers until the async id resolves
  const conv = h.payloads.find(p => p.url.includes('/api/conversion'))
  assert.ok(conv, 'conversion payload sent')
  assert.strictEqual(conv.body.currency, 'gbp', 'forwarded verbatim; the server canonicalizes')
  // The currency addition must not have introduced any device read into the cookieless build.
  assert.ok(!('fbp' in conv.body), 'cookieless must still not read _fbp')
  assert.ok(!('fbc' in conv.body), 'cookieless must still not read _fbc')
})

test('both tracker builds expose currency in their SHIPPED minified bundles', () => {
  // tracker.min.js / tracker.cookieless.min.js are committed artifacts served at the root
  // alias. Editing the source without rebuilding would ship a tracker that silently cannot
  // send the parameter this change exists to add.
  for (const f of ['tracker/tracker.min.js', 'tracker/tracker.cookieless.min.js']) {
    const min = fs.readFileSync(path.join(rootDir, f), 'utf8')
    assert.ok(min.includes('currency'), `${f} is stale — run npm run build:tracker`)
  }
})
