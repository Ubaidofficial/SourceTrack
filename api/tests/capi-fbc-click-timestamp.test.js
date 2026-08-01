// Meta CAPI `fbc` carries the REAL ad-click instant when the tracker can supply one.
//
// THE BUG: Meta's fbc is `fb.1.<CLICK_time_ms>.<fbclid>` and that middle segment is defined as the
// instant of the AD CLICK. sendMetaCAPI stamped `Date.now()` there — send time — for as long as the
// sender has existed, overstating the click time by the whole browse-to-convert gap and costing
// match quality on every derived fbc.
//
// THE FIX SPANS FOUR LAYERS, so this file tests all four rather than just the last one:
//   tracker.js        writes `st_click_ts` (LAST-write-wins, unlike write-once `st_ft_*`) and
//                     forwards it as `click_timestamp`
//   conversion.js     sanitizes it through the EXISTING sanitizeClientTimestamp and puts it in
//                     `props` (which is both the Tinybird dual-write payload and the capiEvt source)
//   conversion-sync   metaFbcClickMs() converts ISO -> epoch ms for the fbc string
//
// THE REGRESSION GUARD THAT MATTERS MOST: absent click_timestamp must produce byte-identical
// behaviour to before this change. Three live populations depend on that — installs on a pre-fix
// tracker build, ALL cookieless traffic (that build has no storage by design), and merchant-uploaded
// offline conversions. TOKEN-FREE, NO network.

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0'.repeat(64)
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import vm from 'node:vm'
import { fileURLToPath } from 'url'
import { sendMetaCAPI, metaFbcClickMs, encryptCapiToken } from '../lib/conversion-sync.js'
import { sanitizeClientTimestamp } from '../lib/utils.js'

const {
  conversion, __setConversionDedupeDeps, __resetConversionDedupeDeps, __flushConversionDedupeCache
} = await import('../routes/conversion.js')

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

// ── LAYER 4: the fbc epoch conversion ────────────────────────────────────────────────────────

test('metaFbcClickMs: an ISO click timestamp becomes its epoch-ms equivalent', () => {
  const iso = '2026-07-20T10:30:00.000Z'
  assert.strictEqual(metaFbcClickMs(iso), Date.parse(iso))
})

test('🔴 REGRESSION GUARD: absent/garbage click timestamp falls back to Date.now(), exactly as before', () => {
  const before = Date.now()
  for (const bad of [undefined, null, '', 'not-a-date', 42, {}, []]) {
    const got = metaFbcClickMs(bad)
    assert.ok(got >= before && got <= Date.now() + 1000,
      `${JSON.stringify(bad)} must fall back to send time, got ${got}`)
  }
})

// ── LAYER 4 end-to-end: the real sender, real wire body ──────────────────────────────────────

function withFetch (stub, fn) {
  const orig = global.fetch
  global.fetch = stub
  return Promise.resolve(fn()).finally(() => { global.fetch = orig })
}
const okResp = () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}', headers: { get: () => null } })

async function fbcFor (evt) {
  let sent = null
  await withFetch(async (_u, opts) => { sent = JSON.parse(opts.body); return okResp() }, () =>
    sendMetaCAPI({ meta_pixel_id: 'px', meta_capi_token: encryptCapiToken('tok') }, evt))
  return sent?.data?.[0]?.user_data?.fbc
}

test('sendMetaCAPI: a click_timestamp puts the REAL click instant in fbc', async () => {
  const iso = '2026-07-20T10:30:00.000Z'
  const fbc = await fbcFor({ fbclid: 'ABC123', click_timestamp: iso, conversion_type: 'purchase', conversion_value: 10 })
  assert.strictEqual(fbc, `fb.1.${Date.parse(iso)}.ABC123`)
})

test('🔴 REGRESSION GUARD: no click_timestamp → fbc is send-time derived, unchanged from today', async () => {
  const before = Date.now()
  const fbc = await fbcFor({ fbclid: 'ABC123', conversion_type: 'purchase', conversion_value: 10 })
  const parts = String(fbc).split('.')
  assert.strictEqual(parts[0], 'fb')
  assert.strictEqual(parts[1], '1')
  assert.strictEqual(parts[3], 'ABC123')
  const ms = Number(parts[2])
  assert.ok(ms >= before && ms <= Date.now() + 1000, 'middle segment is send time, as before the change')
})

test('a real _fbc cookie still WINS over the derived value — click_timestamp must not override it', async () => {
  const fbc = await fbcFor({
    fbc: 'fb.1.999.REALCOOKIE', fbclid: 'ABC123',
    click_timestamp: '2026-07-20T10:30:00.000Z', conversion_type: 'purchase', conversion_value: 10
  })
  assert.strictEqual(fbc, 'fb.1.999.REALCOOKIE', 'the merchant cookie is highest match quality and is untouched')
})

// ── LAYER 3: the real /api/conversion handler ────────────────────────────────────────────────

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
async function drive (body) {
  const captured = []
  __flushConversionDedupeCache()
  __setConversionDedupeDeps({
    claim: async () => ({ success: true, duplicate: false }),
    rollback: async () => {},
    usage: async () => ({ allowed: true }),
    dualWrite: (evt) => { captured.push(evt); return true }
  })
  try {
    const res = mockRes()
    await conversion(mockReq(body), res)
    return { res, props: captured[0]?.properties, calls: captured.length }
  } finally { __resetConversionDedupeDeps() }
}

test('conversion route: a valid click_timestamp is sanitized and lands in props', async () => {
  const iso = new Date(Date.now() - 3600 * 1000).toISOString()
  const { props, res } = await drive({ click_timestamp: iso })
  assert.ok(res.statusCode < 400)
  assert.strictEqual(props.click_timestamp, sanitizeClientTimestamp(iso),
    'stored in the canonical form the shared sanitizer returns')
})

test('NON-BREAKING: no click_timestamp → the key is ABSENT from props, not null', async () => {
  const { props, calls } = await drive({})
  assert.strictEqual(calls, 1, 'the conversion still dual-writes')
  assert.ok(!('click_timestamp' in props),
    'an absent value must omit the key — a null would positively assert "no click", which is not the same claim')
})

test('a malformed click_timestamp is DROPPED, never passed through raw', async () => {
  for (const bad of ['not-a-date', '', 'x'.repeat(200), '2026-13-45T99:99:99Z']) {
    const { props, res } = await drive({ click_timestamp: bad })
    assert.ok(res.statusCode < 400, `malformed input must not 400 (got ${res.statusCode} for ${JSON.stringify(bad)})`)
    assert.ok(!('click_timestamp' in props), `malformed ${JSON.stringify(bad)} must not reach props`)
  }
})

test('a SPOOFED click_timestamp is rejected by the shared sanitizer bounds', async () => {
  const farFuture = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
  const farPast = new Date(Date.now() - 200 * 24 * 3600 * 1000).toISOString()
  for (const bad of [farFuture, farPast]) {
    const { props } = await drive({ click_timestamp: bad })
    assert.ok(!('click_timestamp' in props),
      `${bad} is outside sanitizeClientTimestamp's +1h/-90d window and must be dropped before Meta sees it`)
  }
})

// ── LAYERS 1+2: the tracker builds ───────────────────────────────────────────────────────────

const trackerCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.js'), 'utf8')
const cookielessCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.cookieless.js'), 'utf8')

// `search` drives which click ids params() sees; `storage` is shared across runs so a second
// pageview can observe what the first one wrote (that is the whole point of the overwrite test).
function run (code, { search = '', storage = {} } = {}) {
  const payloads = []
  const location = { href: 'https://example.com/p' + search, pathname: '/p', search, origin: 'https://example.com', hostname: 'example.com', protocol: 'https:' }
  const documentMock = {
    referrer: '', cookie: '', readyState: 'complete', body: {},
    currentScript: { getAttribute: (n) => (n === 'data-site-key' ? 'sk' : null), src: 'https://api.srctk.com/t.js' },
    querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}
  }
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
    addEventListener: () => {}
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
  return { window: ctx.window, payloads, storage }
}

test('tracker: a pageview carrying a click id writes st_click_ts', () => {
  const { storage } = run(trackerCode, { search: '?fbclid=ABC' })
  assert.ok(storage.st_click_ts, 'st_click_ts is written')
  assert.ok(!isNaN(Date.parse(storage.st_click_ts)), 'stored as a parseable ISO string')
})

test('🔴 LAST-WRITE-WINS: a second click OVERWRITES st_click_ts (opposite of write-once st_ft_*)', () => {
  const storage = {}
  run(trackerCode, { search: '?fbclid=FIRST', storage })
  const first = storage.st_click_ts
  const firstTouch = storage.st_ft_src
  assert.ok(first)

  storage.st_click_ts = '2020-01-01T00:00:00.000Z'   // a distinctly older value to prove overwrite
  run(trackerCode, { search: '?gclid=SECOND', storage })

  assert.notStrictEqual(storage.st_click_ts, '2020-01-01T00:00:00.000Z',
    'a later ad click must replace the stored instant — a visitor can click a fresh ad on visit 3')
  assert.strictEqual(storage.st_ft_src, firstTouch,
    'first-touch is still write-once and untouched — the two have deliberately opposite semantics')
})

test('a pageview with NO click id leaves an existing st_click_ts untouched', () => {
  const storage = { st_click_ts: '2026-07-20T10:30:00.000Z' }
  run(trackerCode, { search: '?utm_source=newsletter', storage })
  assert.strictEqual(storage.st_click_ts, '2026-07-20T10:30:00.000Z',
    'organic browsing between the click and the conversion must not clear the click instant')
})

test('a pageview with no click id and no prior value writes nothing', () => {
  const { storage } = run(trackerCode, { search: '?utm_source=newsletter' })
  assert.ok(!('st_click_ts' in storage), 'never invent a click instant for a visitor who never clicked an ad')
})

test('the mechanism is GENERAL — it fires for non-Meta click ids too', () => {
  for (const q of ['?gclid=G', '?msclkid=M', '?ttclid=T', '?li_fat_id=L', '?dclid=D', '?ko_click_id=K']) {
    const { storage } = run(trackerCode, { search: q })
    assert.ok(storage.st_click_ts, `${q} must record a click instant (the click time is not Meta-specific)`)
  }
})

test('conversion() forwards click_timestamp when present, and OMITS the key when absent', () => {
  const withClick = run(trackerCode, { search: '?fbclid=ABC' })
  withClick.window.sourcetrack.conversion({ value: 10 })
  const a = withClick.payloads.find(p => p.url.includes('/api/conversion'))
  assert.ok(a, 'conversion payload sent')
  assert.strictEqual(a.body.click_timestamp, withClick.storage.st_click_ts, 'forwards the stored instant verbatim')

  const noClick = run(trackerCode, { search: '?utm_source=newsletter' })
  noClick.window.sourcetrack.conversion({ value: 10 })
  const b = noClick.payloads.find(p => p.url.includes('/api/conversion'))
  assert.ok(b, 'conversion payload sent')
  assert.ok(!('click_timestamp' in b.body),
    'never send a bare null — the key is simply absent, which the route and sendMetaCAPI both read as "not reported"')
})

test('cookieless build: click_timestamp is NOT sent, and the documented gap is stated in source', () => {
  const h = run(cookielessCode, { search: '?fbclid=ABC' })
  h.window.sourcetrack.conversion({ value: 10 })
  const conv = h.payloads.find(p => p.url.includes('/api/conversion'))
  if (conv) {
    assert.ok(!('click_timestamp' in conv.body), 'the cookieless build has no storage, so it cannot carry a click instant')
  }
  assert.match(cookielessCode, /click_timestamp/,
    'the gap must be STATED in the cookieless source, not silently absent — a future reader has to find the reason here')

  // The source MENTIONS both names (in the comment explaining why the gap exists), which is the
  // point. Proving no MECHANISM shipped is done against the minified artifact instead: esbuild
  // strips comments, so a comment leaves nothing behind while real code would survive. This is a
  // stronger check than grepping the source, and it cannot be fooled by rewording the comment.
  const minCookieless = fs.readFileSync(path.join(rootDir, 'tracker/tracker.cookieless.min.js'), 'utf8')
  assert.ok(!/st_click_ts/.test(minCookieless),
    'no click-timestamp storage may ship in the cookieless bundle — it has no storage by design')
  assert.ok(!/click_timestamp/.test(minCookieless),
    'the cookieless bundle must not forward a click_timestamp it cannot have')
})

// ── the shipped artifact, not just the source ────────────────────────────────────────────────

test('the SHIPPED minified cookie bundle carries the click-timestamp logic', () => {
  const min = fs.readFileSync(path.join(rootDir, 'tracker/tracker.min.js'), 'utf8')
  assert.match(min, /st_click_ts/, 'tracker.min.js is committed and served — a source-only change would ship nothing')
  assert.match(min, /click_timestamp/, 'the forwarded key must survive minification')
})
