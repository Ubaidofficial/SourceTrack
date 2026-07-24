// SPA navigation coverage for BOTH tracker builds.
//
// WHY A DEDICATED HARNESS (not tracker-privacy-parity's run()): that harness stubs
// `setTimeout: (fn) => 0`, which NEVER runs the callback — so the tracker's 100ms pushState debounce
// can't fire, and its ~30 existing tests rely on that no-op (heartbeat / consent-flush timers must
// NOT fire during synchronous load). Retrofitting it would risk those tests. Instead this file uses
// a purpose-built, ms-aware FAKE CLOCK: `tick()` runs only timers due within the debounce window
// (≤150ms), isolating the pushState debounce from the tracker's 500ms Cal.com retry and 10s observer
// timers. A synchronous setTimeout would be WRONG here — it would fire a pageview per pushState
// (running each callback before the next call), so it could not test that a BURST collapses to one.
//
// The pushState/popstate pageview path has NEVER executed in production (techrupt.pk is multi-page
// WordPress; no customer site uses SPA nav yet — see KNOWN_ISSUES). This is its first coverage; live
// confirmation on a real SPA/pjax page is still required.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const trackerCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.js'), 'utf8')
const cookielessCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.cookieless.js'), 'utf8')

const ORIGIN = 'https://shop.example.com'

function makeHarness (code, { entry = '/landing?utm_source=google&utm_medium=cpc&utm_campaign=spring', referrer = '' } = {}) {
  const payloads = []          // /api/track $pageview bodies, in order
  const listeners = {}

  // ── ms-aware fake clock ──────────────────────────────────────────────────────
  const timers = new Map(); let nextId = 1
  const setTimeoutFake = (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms: ms || 0 }); return id }
  const clearTimeoutFake = (id) => { timers.delete(id) }
  const tick = () => {                       // fire only debounce-window timers (≤150ms), leave the rest
    for (const [id, t] of [...timers]) { if (t.ms <= 150) { timers.delete(id); t.fn() } }
  }

  // ── mutable location that pushState/replaceState update ───────────────────────
  const asLoc = (href) => { const u = new URL(href); return { href: u.href, pathname: u.pathname, search: u.search, hash: u.hash, origin: u.origin, hostname: u.hostname, protocol: u.protocol } }
  const location = asLoc(ORIGIN + entry)
  const setLoc = (url) => Object.assign(location, asLoc(new URL(url, location.href).href))

  const history = {
    pushState (_s, _t, url) { if (url != null) setLoc(url) },
    replaceState (_s, _t, url) { if (url != null) setLoc(url) }
  }
  const attrs = { 'data-site-key': 'sk-test' }
  const documentMock = {
    referrer, cookie: '', readyState: 'complete', title: 'T', body: {},
    currentScript: { getAttribute: (n) => (n in attrs ? attrs[n] : null), src: 'https://api.srctk.com/tracker.js' },
    querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {} }),
    addEventListener: (e, h) => { listeners[e] = h }
  }
  const store = {}
  const ls = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v) }, removeItem: (k) => { delete store[k] } }
  const navigatorMock = {
    doNotTrack: null, globalPrivacyControl: null, userAgent: 'test',
    // No `Request` in this context → supportsKeepalive is false → send() uses sendBeacon (single capture).
    sendBeacon: (u, blob) => { if (String(u).includes('/api/track') && blob && blob.parts) payloads.push(JSON.parse(blob.parts[0])); return true }
  }
  const fetchMock = async (u) => {           // cookieless id fetch only; never captures /api/track
    if (String(u).includes('/api/tracker/id')) return { ok: true, json: async () => ({ visitor_id: 'v1', session_id: 's1' }) }
    return { ok: true, json: async () => ({ success: true }) }
  }
  const windowMock = { location, document: documentMock, navigator: navigatorMock, doNotTrack: null, history, fetch: fetchMock, addEventListener: (e, h) => { listeners[e] = h } }
  const ctx = vm.createContext({
    window: windowMock, document: documentMock, location, navigator: navigatorMock, history,
    addEventListener: windowMock.addEventListener, fetch: fetchMock, localStorage: ls, sessionStorage: ls,
    setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake,
    MutationObserver: class { observe () {} disconnect () {} },
    WeakMap: globalThis.WeakMap, URL: globalThis.URL, URLSearchParams: globalThis.URLSearchParams,
    Blob: class { constructor (parts) { this.parts = parts } },
    console: { warn () {}, error () {}, log () {} }
  })
  vm.runInContext(code, ctx)

  const settle = () => new Promise(r => globalThis.setTimeout(r, 0))   // let the cookieless id fetch resolve
  const pushState = (url) => ctx.history.pushState({}, '', url)        // calls the tracker's WRAPPED pushState
  const popstate = (url) => { setLoc(url); (listeners.popstate || (() => {}))({}) }
  return { payloads, settle, tick, pushState, popstate, location }
}

const BUILDS = [['cookie', trackerCode], ['cookieless', cookielessCode]]
const lastPv = (h) => h.payloads[h.payloads.length - 1]

for (const [label, code] of BUILDS) {
  // (1)+(2) pushState to a NEW url → exactly ONE $pageview, page_url = the DESTINATION
  test(`${label}: pushState to a new URL fires exactly one $pageview for the destination`, async () => {
    const h = makeHarness(code); await h.settle()
    const before = h.payloads.length
    h.pushState('/rooms/deluxe'); h.tick()
    assert.equal(h.payloads.length - before, 1, 'exactly one pageview')
    assert.equal(lastPv(h).event, '$pageview')
    assert.equal(lastPv(h).page_url, ORIGIN + '/rooms/deluxe', 'reports the DESTINATION url, not the entry url')
  })

  // (3) pushState to the SAME url → NOTHING (de-dupe on location.href)
  test(`${label}: pushState to the same URL fires nothing (de-dupe)`, async () => {
    const h = makeHarness(code); await h.settle()
    h.pushState('/rooms/deluxe'); h.tick()          // first nav
    const before = h.payloads.length
    h.pushState('/rooms/deluxe'); h.tick()          // same href again
    assert.equal(h.payloads.length - before, 0, 'a same-URL pushState must not double-count')
  })

  // (4) burst of 3 pushState within the debounce → ONE pageview, for the FINAL url
  test(`${label}: a burst of 3 pushState collapses to one pageview for the final URL`, async () => {
    const h = makeHarness(code); await h.settle()
    const before = h.payloads.length
    h.pushState('/a'); h.pushState('/b'); h.pushState('/c')   // no tick between — all inside the window
    h.tick()
    assert.equal(h.payloads.length - before, 1, 'the burst debounces to a single pageview')
    assert.equal(lastPv(h).page_url, ORIGIN + '/c', 'the surviving pageview is the FINAL url')
  })

  // (5) popstate (back button) → a pageview
  test(`${label}: popstate (back/forward) fires a pageview`, async () => {
    const h = makeHarness(code); await h.settle()
    h.pushState('/rooms/deluxe'); h.tick()
    const before = h.payloads.length
    h.popstate(ORIGIN + '/landing?utm_source=google&utm_medium=cpc&utm_campaign=spring'); h.tick()
    assert.equal(h.payloads.length - before, 1, 'back navigation fires a pageview')
    assert.equal(lastPv(h).page_url, ORIGIN + '/landing?utm_source=google&utm_medium=cpc&utm_campaign=spring')
  })
}

// (6) attribution: first_touch_* must SURVIVE SPA navigation. The two builds persist differently, so
// the assertion is per-build honest, not a copy-paste.

// Cookie build persists first-touch in localStorage (storeFirstTouch writes ONCE), so a nav that
// DROPS the utm params still reports the ENTRY's first_touch — the strong client-side guarantee.
test('cookie: first_touch_* survives SPA navigation even when the destination URL has no utm', async () => {
  const h = makeHarness(trackerCode); await h.settle()
  const entry = h.payloads[0]
  assert.equal(entry.first_touch_source, 'google')
  h.pushState('/rooms/deluxe'); h.tick()          // destination has NO utm params
  const nav = lastPv(h)
  assert.equal(nav.first_touch_source, entry.first_touch_source, 'localStorage persistence carries the entry source')
  assert.equal(nav.first_touch_medium, entry.first_touch_medium)
  assert.equal(nav.first_touch_campaign, entry.first_touch_campaign)
})

// Cookieless has NO client storage (tracker.cookieless.js:73) — deriveFirstTouch re-derives from the
// CURRENT URL each pageview. It is stable across SPA nav ONLY when first-touch comes from the
// document.referrer (unchanged on pushState), not from utm params on the entry URL.
test('cookieless: a REFERRER-derived first_touch survives SPA navigation (referrer is stable across pushState)', async () => {
  const h = makeHarness(cookielessCode, { entry: '/landing', referrer: 'https://www.google.com/search' })
  await h.settle()
  const entry = h.payloads[0]
  assert.equal(entry.first_touch_source, 'google.com', 'entry first-touch derived from the referrer host')
  h.pushState('/rooms/deluxe'); h.tick()
  assert.equal(lastPv(h).first_touch_source, entry.first_touch_source, 'referrer unchanged on pushState → same first-touch')
})

// FINDING (documented, not a pass-by-accident): cookieless does NOT persist a UTM-based first_touch
// across SPA nav — it re-derives to 'direct' when the destination URL drops the utm params. The
// server-side re-derivation from the pageview sequence is the actual attribution backstop (UNVERIFIED
// here). See KNOWN_ISSUES.
test('cookieless: a UTM-based first_touch is NOT carried on the SPA nav (re-derives to direct) — logged finding', async () => {
  const h = makeHarness(cookielessCode, { entry: '/landing?utm_source=google&utm_medium=cpc', referrer: '' })
  await h.settle()
  assert.equal(h.payloads[0].first_touch_source, 'google', 'entry: utm-based first-touch')
  h.pushState('/rooms/deluxe'); h.tick()
  assert.equal(lastPv(h).first_touch_source, 'direct', 'nav: utm dropped, no client storage → re-derives to direct')
  assert.notEqual(lastPv(h).first_touch_source, h.payloads[0].first_touch_source, 'the client-side inconsistency this build has')
})
