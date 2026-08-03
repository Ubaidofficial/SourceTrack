/**
 * Chat Lead Capture Detection — tracker.js + tracker.cookieless.js
 *
 * Phase 1 providers: Intercom + Crisp. Tawk.to is deferred to Phase 2 and is
 * asserted ABSENT here so it cannot land silently.
 *
 * The load-bearing assertions are the negative ones: no callback payload is ever
 * forwarded, a GPC/DNT visitor never registers a listener at all, and Crisp's
 * programmatic-set false positive stays suppressed.
 */
import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import vm from 'node:vm'
import { fileURLToPath } from 'url'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../..')

const trackerCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.js'), 'utf8')
const cookielessCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.cookieless.js'), 'utf8')

/**
 * Run a tracker in a mocked browser VM with injectable chat providers.
 * @param {string} code
 * @param {object} opts
 * @param {boolean} [opts.doNotTrack]   simulate DNT
 * @param {boolean} [opts.gpc]          simulate Global Privacy Control
 * @param {string}  [opts.excludePath]  data-exclude value
 * @param {boolean} [opts.withIntercom] install a window.Intercom stub at boot
 * @param {boolean} [opts.withCrisp]    install a window.$crisp array at boot
 */
function runTrackerInVm(code, opts = {}) {
  const pathname = opts.pathname || '/contact'
  const search = '?utm_source=google'
  const listeners = {}
  const payloads = []

  // ── Intercom stub: records handlers registered by method name ──────────────
  const intercomHandlers = {}
  const IntercomFn = (method, arg) => {
    if (typeof arg === 'function') intercomHandlers[method] = arg
  }

  // ── Crisp stub: an array whose push interprets ["on", event, cb] ───────────
  const crispHandlers = {}
  const crispArr = []
  crispArr.push = function (entry) {
    if (Array.isArray(entry) && entry[0] === 'on' && typeof entry[2] === 'function') {
      crispHandlers[entry[1]] = entry[2]
    }
    return Array.prototype.push.call(this, entry)
  }

  const locationMock = {
    href: 'https://example.com' + pathname + search,
    pathname,
    search,
    origin: 'https://example.com',
    hostname: 'example.com',
    protocol: 'https:'
  }

  const documentMock = {
    referrer: 'https://referrer.com',
    cookie: '',
    visibilityState: 'visible',
    currentScript: {
      getAttribute: (name) => {
        if (name === 'data-site-key') return 'sk-test'
        if (name === 'data-exclude') return opts.excludePath || null
        return null
      },
      src: ''
    },
    querySelector: () => null,
    addEventListener: (event, handler) => { listeners[event] = handler }
  }

  const storage = {}
  const localStorageMock = {
    getItem: (key) => storage[key] || null,
    setItem: (key, val) => { storage[key] = String(val) },
    removeItem: (key) => { delete storage[key] }
  }

  const windowMock = {
    location: locationMock,
    document: documentMock,
    navigator: {
      doNotTrack: opts.doNotTrack ? '1' : null,
      globalPrivacyControl: opts.gpc ? true : null,
      sendBeacon: (url, blob) => {
        if (blob && blob.parts && blob.parts[0]) {
          payloads.push({ url, body: JSON.parse(blob.parts[0]) })
        }
        return true
      }
    },
    history: { pushState: () => {}, replaceState: () => {} },
    fetch: async (url, options) => {
      if (url.includes('/api/tracker/id')) {
        return { ok: true, json: async () => ({ visitor_id: 'cl-visitor-123', session_id: 'cl-session-456' }) }
      }
      if (options && options.body) payloads.push({ url, body: JSON.parse(options.body) })
      return { ok: true, json: async () => ({ success: true }) }
    },
    addEventListener: (event, handler) => { listeners[event] = handler },
    Intercom: opts.withIntercom ? IntercomFn : undefined,
    $crisp: opts.withCrisp ? crispArr : undefined
  }

  const context = vm.createContext({
    window: windowMock,
    document: documentMock,
    location: locationMock,
    navigator: windowMock.navigator,
    history: windowMock.history,
    addEventListener: windowMock.addEventListener,
    fetch: windowMock.fetch,
    localStorage: localStorageMock,
    sessionStorage: localStorageMock,
    setTimeout: (fn, delay) => setTimeout(fn, delay),
    clearTimeout: (id) => clearTimeout(id),
    WeakMap: globalThis.WeakMap,
    URL: globalThis.URL,
    URLSearchParams: globalThis.URLSearchParams,
    Date: globalThis.Date,
    Blob: class { constructor(parts, options) { this.parts = parts; this.options = options } },
    console: { warn: () => {}, error: () => {}, log: () => {} }
  })

  vm.runInContext(code, context)

  const chatEvents = () => payloads.filter(p => p.body && p.body.event === 'chat_lead_captured')

  return { listeners, payloads, context, intercomHandlers, crispHandlers, crispArr, chatEvents }
}

/** Let the cookieless build's async fetchId() settle so AID is populated. */
const settle = () => new Promise(r => setTimeout(r, 10))

// ─────────────────────────────────────────────────────────────────────────────
// Intercom — tracker.js
// ─────────────────────────────────────────────────────────────────────────────
test('Chat Lead Capture — Intercom (tracker.js)', async (t) => {

  await t.test('1. onUserEmailSupplied emits exactly one chat_lead_captured /api/track event', () => {
    const { intercomHandlers, payloads, chatEvents } = runTrackerInVm(trackerCode, { withIntercom: true })
    payloads.length = 0
    assert.ok(intercomHandlers.onUserEmailSupplied, 'Expected onUserEmailSupplied to be registered')

    intercomHandlers.onUserEmailSupplied()

    const evts = chatEvents()
    assert.strictEqual(evts.length, 1, 'Expected exactly one chat_lead_captured event')
    assert.strictEqual(evts[0].body.properties.chat_provider, 'intercom')
    assert.strictEqual(evts[0].body.properties.chat_detection_method, 'browser_embed_event')
    assert.strictEqual(evts[0].body.properties.chat_event_type, 'user_email_supplied')
    assert.ok(evts[0].url.includes('/api/track'), 'Expected /api/track endpoint')
  })

  await t.test('2. chat_started is NOT the signal — only email-supplied registers', () => {
    const { intercomHandlers } = runTrackerInVm(trackerCode, { withIntercom: true })
    // We must not hook show/hide/unread — those are chat-start-ish signals we rejected.
    assert.strictEqual(intercomHandlers.onShow, undefined, 'Must not hook onShow')
    assert.strictEqual(intercomHandlers.onHide, undefined, 'Must not hook onHide')
    assert.strictEqual(intercomHandlers.onUnreadCountChange, undefined, 'Must not hook onUnreadCountChange')
  })

  await t.test('3. No callback payload is forwarded, even when arguments are passed', () => {
    const { intercomHandlers, payloads, chatEvents } = runTrackerInVm(trackerCode, { withIntercom: true })
    payloads.length = 0
    // Intercom's documented callback takes no args, but prove we ignore any it sends.
    intercomHandlers.onUserEmailSupplied({
      email: 'visitor@example.com',
      name: 'Jane Doe',
      phone: '+15551234567',
      message: 'my credit card is 4111111111111111'
    })
    const props = chatEvents()[0].body.properties
    const serialized = JSON.stringify(chatEvents()[0].body)
    assert.strictEqual(props.email, undefined)
    assert.strictEqual(props.name, undefined)
    assert.strictEqual(props.phone, undefined)
    assert.strictEqual(props.message, undefined)
    assert.ok(!serialized.includes('visitor@example.com'), 'Email must not appear anywhere in the payload')
    assert.ok(!serialized.includes('Jane Doe'), 'Name must not appear anywhere in the payload')
    assert.ok(!serialized.includes('4111111111111111'), 'Message content must not appear anywhere in the payload')
    // Only the fixed schema survives
    assert.deepStrictEqual(Object.keys(props).sort(), [
      'chat_detection_method', 'chat_event_type', 'chat_provider',
      'event_type', 'page_path', 'page_url'
    ])
  })

  await t.test('4. Duplicate fires deduped within the 5s window', () => {
    const { intercomHandlers, payloads, chatEvents } = runTrackerInVm(trackerCode, { withIntercom: true })
    payloads.length = 0
    intercomHandlers.onUserEmailSupplied()
    intercomHandlers.onUserEmailSupplied()
    intercomHandlers.onUserEmailSupplied()
    assert.strictEqual(chatEvents().length, 1, 'Expected one event despite three fires')
  })

  await t.test('5. Opt-out (consent false) prevents emission', () => {
    const { intercomHandlers, context, payloads, chatEvents } = runTrackerInVm(trackerCode, { withIntercom: true })
    context.window.sourcetrack.optOut()
    payloads.length = 0
    intercomHandlers.onUserEmailSupplied()
    assert.strictEqual(chatEvents().length, 0, 'Expected zero events after opt-out')
  })

  await t.test('6. Excluded path prevents emission', () => {
    const { intercomHandlers, payloads, chatEvents } = runTrackerInVm(trackerCode, {
      withIntercom: true, excludePath: '/contact'
    })
    payloads.length = 0
    intercomHandlers.onUserEmailSupplied()
    assert.strictEqual(chatEvents().length, 0, 'Expected zero events on an excluded path')
  })

  await t.test('7. /api/conversion is never called', () => {
    const { intercomHandlers, payloads } = runTrackerInVm(trackerCode, { withIntercom: true })
    payloads.length = 0
    intercomHandlers.onUserEmailSupplied()
    assert.strictEqual(payloads.filter(p => p.url && p.url.includes('/api/conversion')).length, 0)
  })

  await t.test('8. Late load: registration succeeds inside the bounded retry window', async () => {
    const { context, payloads } = runTrackerInVm(trackerCode)  // no Intercom at boot
    const handlers = {}
    context.window.Intercom = (method, arg) => { if (typeof arg === 'function') handlers[method] = arg }
    await new Promise(r => setTimeout(r, 700))  // one 500ms retry tick
    assert.ok(handlers.onUserEmailSupplied, 'Expected registration after late Intercom load')
    payloads.length = 0
    handlers.onUserEmailSupplied()
    assert.strictEqual(payloads.filter(p => p.body && p.body.event === 'chat_lead_captured').length, 1)
  })

  await t.test('9. Absent Intercom does not throw and emits nothing', () => {
    const { chatEvents } = runTrackerInVm(trackerCode)
    assert.strictEqual(chatEvents().length, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Crisp — tracker.js
// ─────────────────────────────────────────────────────────────────────────────
test('Chat Lead Capture — Crisp (tracker.js)', async (t) => {

  await t.test('10. Engaged visitor: email change emits one chat_lead_captured', () => {
    const { crispHandlers, payloads, chatEvents } = runTrackerInVm(trackerCode, { withCrisp: true })
    payloads.length = 0
    crispHandlers['chat:initiated']()                 // visitor clicked the chatbox
    crispHandlers['user:email:changed']('a@b.com')

    const evts = chatEvents()
    assert.strictEqual(evts.length, 1)
    assert.strictEqual(evts[0].body.properties.chat_provider, 'crisp')
    assert.strictEqual(evts[0].body.properties.chat_detection_method, 'browser_embed_event')
    assert.strictEqual(evts[0].body.properties.chat_event_type, 'user_email_changed')
    assert.ok(evts[0].url.includes('/api/track'))
  })

  await t.test('11. GUARD — programmatic set with no engagement emits NOTHING', () => {
    const { crispHandlers, payloads, chatEvents } = runTrackerInVm(trackerCode, { withCrisp: true })
    payloads.length = 0
    // This is the logged-in-page boot case: $crisp.push(["set","user:email",...])
    // fires user:email:changed without the visitor ever touching the chatbox.
    crispHandlers['user:email:changed']('loggedin@customer.com')
    crispHandlers['user:email:changed']('loggedin@customer.com')
    assert.strictEqual(chatEvents().length, 0,
      'Programmatic email set must not be counted as a captured lead')
  })

  await t.test('12. GUARD — chat:opened also satisfies engagement', () => {
    const { crispHandlers, payloads, chatEvents } = runTrackerInVm(trackerCode, { withCrisp: true })
    payloads.length = 0
    crispHandlers['chat:opened']()
    crispHandlers['user:email:changed']('a@b.com')
    assert.strictEqual(chatEvents().length, 1)
  })

  await t.test('13. GUARD — ordering matters: engagement AFTER the set does not retro-fire', () => {
    const { crispHandlers, payloads, chatEvents } = runTrackerInVm(trackerCode, { withCrisp: true })
    payloads.length = 0
    crispHandlers['user:email:changed']('loggedin@customer.com')  // suppressed
    crispHandlers['chat:initiated']()                             // engagement later
    assert.strictEqual(chatEvents().length, 0,
      'A suppressed email change must not be replayed when engagement arrives afterwards')
  })

  await t.test('14. Message content is never read — message:sent is not hooked at all', () => {
    const { crispHandlers } = runTrackerInVm(trackerCode, { withCrisp: true })
    assert.strictEqual(crispHandlers['message:sent'], undefined,
      'Must not register a listener on message:sent — it carries visitor message content')
    assert.strictEqual(crispHandlers['message:received'], undefined)
    assert.strictEqual(crispHandlers['message:compose:sent'], undefined)
  })

  await t.test('15. The email argument is never forwarded', () => {
    const { crispHandlers, payloads, chatEvents } = runTrackerInVm(trackerCode, { withCrisp: true })
    payloads.length = 0
    crispHandlers['chat:initiated']()
    crispHandlers['user:email:changed']('secret-visitor@example.com')
    const body = chatEvents()[0].body
    assert.ok(!JSON.stringify(body).includes('secret-visitor@example.com'),
      'Crisp email argument must not appear anywhere in the payload')
    assert.deepStrictEqual(Object.keys(body.properties).sort(), [
      'chat_detection_method', 'chat_event_type', 'chat_provider',
      'event_type', 'page_path', 'page_url'
    ])
  })

  await t.test('16. Duplicate email changes deduped within 5s', () => {
    const { crispHandlers, payloads, chatEvents } = runTrackerInVm(trackerCode, { withCrisp: true })
    payloads.length = 0
    crispHandlers['chat:initiated']()
    crispHandlers['user:email:changed']('a@b.com')
    crispHandlers['user:email:changed']('a@b.com')
    crispHandlers['user:email:changed']('c@d.com')
    assert.strictEqual(chatEvents().length, 1, 'Expected one event despite three changes')
  })

  await t.test('17. Opt-out prevents emission even when engaged', () => {
    const { crispHandlers, context, payloads, chatEvents } = runTrackerInVm(trackerCode, { withCrisp: true })
    crispHandlers['chat:initiated']()
    context.window.sourcetrack.optOut()
    payloads.length = 0
    crispHandlers['user:email:changed']('a@b.com')
    assert.strictEqual(chatEvents().length, 0)
  })

  await t.test('18. Intercom and Crisp dedupe independently (shared map, namespaced key)', () => {
    const { intercomHandlers, crispHandlers, payloads, chatEvents } = runTrackerInVm(trackerCode, {
      withIntercom: true, withCrisp: true
    })
    payloads.length = 0
    intercomHandlers.onUserEmailSupplied()
    crispHandlers['chat:initiated']()
    crispHandlers['user:email:changed']('a@b.com')
    const evts = chatEvents()
    assert.strictEqual(evts.length, 2, 'Both providers must emit — the dedupe key is provider-namespaced')
    assert.deepStrictEqual(evts.map(e => e.body.properties.chat_provider).sort(), ['crisp', 'intercom'])
  })

  await t.test('19. Booking dedupe is not disturbed by chat sharing the map', () => {
    const { intercomHandlers, listeners, payloads } = runTrackerInVm(trackerCode, { withIntercom: true })
    payloads.length = 0
    intercomHandlers.onUserEmailSupplied()
    listeners.message({ origin: 'https://calendly.com', data: { event: 'calendly.event_scheduled' } })
    assert.strictEqual(payloads.filter(p => p.body && p.body.event === 'chat_lead_captured').length, 1)
    assert.strictEqual(payloads.filter(p => p.body && p.body.event === 'booking_scheduled').length, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Privacy suppression — the load-bearing proof
// ─────────────────────────────────────────────────────────────────────────────
test('Chat Lead Capture — privacy suppression (both builds)', async (t) => {

  await t.test('20. DNT=1 — NO chat listener is ever registered (tracker.js)', () => {
    const { intercomHandlers, crispHandlers, chatEvents } = runTrackerInVm(trackerCode, {
      doNotTrack: true, withIntercom: true, withCrisp: true
    })
    assert.strictEqual(Object.keys(intercomHandlers).length, 0,
      'DNT: Intercom must have zero registered handlers')
    assert.strictEqual(Object.keys(crispHandlers).length, 0,
      'DNT: Crisp must have zero registered handlers')
    assert.strictEqual(chatEvents().length, 0)
  })

  await t.test('21. GPC=true — NO chat listener is ever registered (tracker.js)', () => {
    const { intercomHandlers, crispHandlers, crispArr, chatEvents } = runTrackerInVm(trackerCode, {
      gpc: true, withIntercom: true, withCrisp: true
    })
    assert.strictEqual(Object.keys(intercomHandlers).length, 0,
      'GPC: Intercom must have zero registered handlers')
    assert.strictEqual(Object.keys(crispHandlers).length, 0,
      'GPC: Crisp must have zero registered handlers')
    // Nothing was even pushed onto the Crisp queue
    assert.strictEqual(crispArr.length, 0, 'GPC: nothing may be pushed to $crisp at all')
    assert.strictEqual(chatEvents().length, 0)
  })

  await t.test('22. GPC=true — the no-op stub is installed and optIn cannot re-enable chat', () => {
    const { context, chatEvents } = runTrackerInVm(trackerCode, { gpc: true, withIntercom: true })
    assert.strictEqual(context.window.sourcetrack.hasConsent(), false)
    context.window.sourcetrack.optIn()  // must remain a no-op under GPC
    assert.strictEqual(context.window.sourcetrack.hasConsent(), false)
    assert.strictEqual(chatEvents().length, 0)
  })

  await t.test('23. DNT=1 — NO chat listener is ever registered (cookieless)', () => {
    const { intercomHandlers, crispHandlers, chatEvents } = runTrackerInVm(cookielessCode, {
      doNotTrack: true, withIntercom: true, withCrisp: true
    })
    assert.strictEqual(Object.keys(intercomHandlers).length, 0)
    assert.strictEqual(Object.keys(crispHandlers).length, 0)
    assert.strictEqual(chatEvents().length, 0)
  })

  await t.test('24. GPC=true — NO chat listener is ever registered (cookieless)', () => {
    const { intercomHandlers, crispHandlers, crispArr, chatEvents } = runTrackerInVm(cookielessCode, {
      gpc: true, withIntercom: true, withCrisp: true
    })
    assert.strictEqual(Object.keys(intercomHandlers).length, 0)
    assert.strictEqual(Object.keys(crispHandlers).length, 0)
    assert.strictEqual(crispArr.length, 0)
    assert.strictEqual(chatEvents().length, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cookieless parity
// ─────────────────────────────────────────────────────────────────────────────
test('Chat Lead Capture — cookieless build', async (t) => {

  await t.test('25. Intercom emits chat_lead_captured with cookieless:true', async () => {
    const { intercomHandlers, payloads, chatEvents } = runTrackerInVm(cookielessCode, { withIntercom: true })
    await settle()
    payloads.length = 0
    intercomHandlers.onUserEmailSupplied()
    const evts = chatEvents()
    assert.strictEqual(evts.length, 1)
    assert.strictEqual(evts[0].body.cookieless, true)
    assert.strictEqual(evts[0].body.properties.chat_provider, 'intercom')
    assert.strictEqual(evts[0].body.properties.chat_event_type, 'user_email_supplied')
  })

  await t.test('26. Crisp guard holds in the cookieless build', async () => {
    const { crispHandlers, payloads, chatEvents } = runTrackerInVm(cookielessCode, { withCrisp: true })
    await settle()
    payloads.length = 0
    crispHandlers['user:email:changed']('loggedin@customer.com')
    assert.strictEqual(chatEvents().length, 0, 'Unengaged programmatic set must be suppressed')
    crispHandlers['chat:opened']()
    crispHandlers['user:email:changed']('typed@visitor.com')
    assert.strictEqual(chatEvents().length, 1, 'Engaged change must emit')
  })

  await t.test('27. No cookie is read or written by the cookieless chat path', async () => {
    const { intercomHandlers, crispHandlers, context } = runTrackerInVm(cookielessCode, {
      withIntercom: true, withCrisp: true
    })
    await settle()
    context.document.cookie = ''
    intercomHandlers.onUserEmailSupplied()
    crispHandlers['chat:initiated']()
    crispHandlers['user:email:changed']('a@b.com')
    assert.strictEqual(context.document.cookie, '',
      'Cookieless build must not write a cookie on the chat path')
  })

  await t.test('28. Cookieless payload carries the same fixed schema — no PII', async () => {
    const { crispHandlers, payloads, chatEvents } = runTrackerInVm(cookielessCode, { withCrisp: true })
    await settle()
    payloads.length = 0
    crispHandlers['chat:initiated']()
    crispHandlers['user:email:changed']('secret@example.com')
    const body = chatEvents()[0].body
    assert.ok(!JSON.stringify(body).includes('secret@example.com'))
    assert.deepStrictEqual(Object.keys(body.properties).sort(), [
      'chat_detection_method', 'chat_event_type', 'chat_provider',
      'event_type', 'page_path', 'page_url'
    ])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase-2 scope guard
// ─────────────────────────────────────────────────────────────────────────────
test('Chat Lead Capture — Tawk.to stays deferred', async (t) => {

  // Comments are stripped first: both builds deliberately DOCUMENT why Tawk.to is
  // deferred, naming its callbacks. That prose must not trip the guard — only real
  // code may fail it.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n')

  await t.test('29. Neither build references Tawk_API in code', () => {
    for (const [name, code] of [['tracker.js', trackerCode], ['tracker.cookieless.js', cookielessCode]]) {
      const src = stripComments(code)
      assert.ok(!/Tawk_API/.test(src),
        `${name} must not touch Tawk_API — Tawk.to is Phase 2`)
      assert.ok(!/onPrechatSubmit|onOfflineSubmit|onChatStarted/.test(src),
        `${name} must not register Tawk callbacks — Tawk.to is Phase 2`)
    }
  })

  await t.test('30. Neither build emits a tawkto provider string', () => {
    for (const code of [trackerCode, cookielessCode]) {
      assert.ok(!/_sendChatLeadCaptured\(\s*['"]tawkto['"]/.test(code))
    }
  })
})
