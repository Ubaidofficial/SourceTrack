import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import vm from 'node:vm'
import { fileURLToPath } from 'url'

// Observe the ACTUAL persisted properties (not just that the request was
// accepted). Wave-2 pageview cutover: track.js no longer calls ph.capture — it
// writes to Tinybird via dualWriteEvent, so we inspect the normalized dual-write
// line instead. The first dual-write line (track.js:406, the event line) always
// fires and carries form_provider/booking_provider. Returned in the same
// { event, distinctId, properties } shape the ph.capture args used, so existing
// `captured.properties.X` assertions keep working (normalize flattens the bag to
// the row top level, and null values pass through unchanged — normalize.js:242).
// The helper also enforces the cutover: ph.capture must NOT fire on this path.
// Modules are imported dynamically (after env is set below) so the PostHog client
// isn't constructed before POSTHOG_API_KEY exists.
async function withCaptureSpy(fn) {
  const { setDualWriteTransport, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')
  const { gunzipSync } = await import('node:zlib')
  const payloads = []
  const prevFlag = process.env.TINYBIRD_DUAL_WRITE
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  setDualWriteTransport(async (p) => { payloads.push(p) }, { flushAt: 1000, flushInterval: 0 })
  try {
    await fn()
    const b = __getDualWriteBatcher(); if (b) await b.flush()
  } finally {
    setDualWriteTransport(null)
    if (prevFlag === undefined) delete process.env.TINYBIRD_DUAL_WRITE
    else process.env.TINYBIRD_DUAL_WRITE = prevFlag
  }
  const lines = payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)))
  const line = lines[0]
  if (!line) return null
  return { event: line.event_type, distinctId: line.distinct_id, properties: line }
}

// ─────────────────────────────────────────────────────────────────────────────
// Session 140L — Provider Fallbacks + Support Matrix Truth Audit
//
// This file locks in the provider support truth boundaries. It does NOT test
// implementation details — it tests that what the code DOES matches what the
// support matrix CLAIMS.
//
// Tests prove:
//  A. Unsupported providers do NOT emit booking_scheduled events.
//  B. Unsupported providers do NOT emit false form_submit events via fake DOM.
//  C. TidyCal/SavvyCal remain UTM passthrough only (no confirmed booking).
//  D. Calendly confirmed booking still works (regression guard).
//  E. Cal.com best-effort embed API still works (regression guard).
//  F. Native/Webflow/WordPress form submit still works (regression guard).
//  G. Booking passthrough still works for all passthrough-only providers.
//  H. /api/conversion not touched.
//  I. No PII forwarded by any provider path.
//  J. form_provider allowlist: only native/webflow/wordpress/unknown accepted.
//  K. booking_provider allowlist: only calendly/calcom accepted by backend.
//  L. Cookieless tracker has identical truth boundaries (static parity).
// ─────────────────────────────────────────────────────────────────────────────

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../..')

const trackerCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.js'), 'utf8')

/**
 * Minimal VM harness for the standard tracker.
 * Supports:
 *   opts.CalFn       — pre-loaded window.Cal
 *   opts.pathname    — location.pathname
 *   opts.search      — location.search
 *   opts.doNotTrack  — simulate DNT=1
 */
function runTrackerInVm(code, opts = {}) {
  const pathname = opts.pathname || '/contact'
  const search = opts.search !== undefined ? opts.search : '?utm_source=google'
  const listeners = {}
  const payloads = []

  const locationMock = {
    href: 'https://example.com' + pathname + search,
    pathname,
    search,
    origin: 'https://example.com',
    hostname: 'example.com',
    protocol: 'https:'
  }

  const documentMock = {
    referrer: '',
    cookie: '',
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
      globalPrivacyControl: null,
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
        return { ok: true, json: async () => ({ visitor_id: 'v-123', session_id: 's-456' }) }
      }
      if (options && options.body) {
        payloads.push({ url, body: JSON.parse(options.body) })
      }
      return { ok: true, json: async () => ({ success: true }) }
    },
    addEventListener: (event, handler) => { listeners[event] = handler },
    Cal: opts.CalFn || undefined
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
    Blob: class {
      constructor(parts, options) { this.parts = parts; this.options = options }
    },
    console: { warn: () => {}, error: () => {}, log: () => {} }
  })

  vm.runInContext(code, context)

  function triggerMessage(origin, data) {
    if (listeners.message) listeners.message({ origin, data })
  }

  function triggerMousedown(href) {
    let current = href
    const anchor = {
      nodeName: 'A',
      getAttribute: (n) => n === 'href' ? current : null,
      setAttribute: (n, v) => { if (n === 'href') current = v },
      parentNode: null
    }
    if (listeners.mousedown) {
      listeners.mousedown({ type: 'mousedown', button: 0, target: anchor, preventDefault: () => {} })
    }
    return current
  }

  return { listeners, payloads, triggerMessage, triggerMousedown, context, windowMock }
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Unsupported providers: no booking_scheduled events
// ─────────────────────────────────────────────────────────────────────────────
test('140L — A. Unsupported providers do not emit booking_scheduled', async (t) => {

  // ── A1. TidyCal postMessage cannot trigger booking_scheduled ─────────────
  await t.test('A1. TidyCal postMessage does not emit booking_scheduled', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0

    // TidyCal does not have a documented embed postMessage API.
    // Send any message from tidycal.com — must not emit booking_scheduled.
    triggerMessage('https://tidycal.com', {
      event: 'booking_confirmed',
      payload: { booking_id: '12345' }
    })
    triggerMessage('https://tidycal.com', {
      event: 'form_submitted',
      payload: {}
    })
    triggerMessage('https://tidycal.com', { event: 'any_event', payload: {} })

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0,
      'TidyCal postMessage must not emit booking_scheduled — UTM passthrough only')
  })

  // ── A2. SavvyCal postMessage cannot trigger booking_scheduled ────────────
  await t.test('A2. SavvyCal postMessage does not emit booking_scheduled', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0

    triggerMessage('https://savvycal.com', {
      event: 'booking_confirmed',
      payload: { booking_id: '12345' }
    })
    triggerMessage('https://embed.savvycal.com', {
      event: 'savvycal.event_scheduled',
      payload: {}
    })

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0,
      'SavvyCal postMessage must not emit booking_scheduled — UTM passthrough only')
  })

  // ── A3. Typeform postMessage cannot trigger booking_scheduled ────────────
  await t.test('A3. Typeform postMessage does not emit booking_scheduled', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0

    triggerMessage('https://embed.typeform.com', {
      type: 'form-submit',
      formId: 'abc123',
      responseId: 'xyz'
    })
    triggerMessage('https://form.typeform.com', {
      type: 'form-submit',
      payload: {}
    })
    triggerMessage('https://typeform.com', { type: 'form-ready', payload: {} })

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0,
      'Typeform postMessage must not emit booking_scheduled')
  })

  // ── A4. Tally postMessage cannot trigger booking_scheduled ───────────────
  await t.test('A4. Tally postMessage does not emit booking_scheduled', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0

    triggerMessage('https://tally.so', {
      event: 'Tally.FormSubmitted',
      payload: { formId: 'abc', respondentId: 'xyz' }
    })
    triggerMessage('https://form.tally.so', {
      event: 'Tally.FormSubmitted',
      payload: {}
    })

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0,
      'Tally postMessage must not emit booking_scheduled')
  })

  // ── A5. HubSpot postMessage cannot trigger booking_scheduled ─────────────
  await t.test('A5. HubSpot postMessage does not emit booking_scheduled', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0

    triggerMessage('https://js.hsforms.net', {
      type: 'hsFormCallback',
      eventName: 'onFormSubmit',
      data: { formGuid: 'abc-123' }
    })
    triggerMessage('https://forms.hubspot.com', {
      type: 'hsFormCallback',
      eventName: 'onFormSubmit',
      data: {}
    })

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0,
      'HubSpot postMessage must not emit booking_scheduled')
  })

  // ── A6. Jotform postMessage cannot trigger booking_scheduled ─────────────
  await t.test('A6. Jotform postMessage does not emit booking_scheduled', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0

    triggerMessage('https://form.jotform.com', {
      action: 'submission-completed',
      formID: '12345'
    })
    triggerMessage('https://jotform.com', {
      action: 'submission-completed',
      payload: {}
    })

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0,
      'Jotform postMessage must not emit booking_scheduled')
  })

  // ── A7. Google Forms postMessage cannot trigger booking_scheduled ─────────
  await t.test('A7. Google Forms postMessage does not emit booking_scheduled', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0

    triggerMessage('https://docs.google.com', {
      type: 'form-submitted',
      formId: 'abc123'
    })
    triggerMessage('https://forms.google.com', {
      type: 'form-submitted',
      payload: {}
    })

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0,
      'Google Forms postMessage must not emit booking_scheduled')
  })

  // ── A8. Arbitrary unknown origin cannot trigger booking_scheduled ─────────
  await t.test('A8. Arbitrary unknown origin cannot trigger booking_scheduled', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0

    const fakeOrigins = [
      'https://evil.com',
      'https://booking-provider.io',
      'https://calendly.com.phishing.net',
      'https://not-calendly.com',
      'null',
      'http://localhost:3000'
    ]
    for (const origin of fakeOrigins) {
      triggerMessage(origin, { event: 'calendly.event_scheduled', payload: {} })
      triggerMessage(origin, { event: 'booking_confirmed', payload: {} })
      triggerMessage(origin, { event: 'bookingSuccessfulV2', payload: {} })
    }

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0,
      'No arbitrary origin may emit booking_scheduled')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// B. Unsupported providers: no fake form_submit via unsupported DOM markers
// ─────────────────────────────────────────────────────────────────────────────
test('140L — B. Unsupported form providers do not get custom form_provider labels', async (t) => {

  // The tracker classifies forms as 'native', 'webflow', 'wordpress', or (via backend) 'unknown'.
  // There is no 'typeform', 'tally', 'hubspot', 'jotform' classification in the tracker.
  // This test reads the tracker source and verifies no unsupported provider strings are present
  // in the form provider classification block.

  await t.test('B1. tracker.js does not classify Typeform, Tally, HubSpot, Jotform as form providers', () => {
    const source = trackerCode

    // The form provider classification block should NOT contain these strings
    const unsupportedProviderLabels = [
      "'typeform'",
      '"typeform"',
      "'tally'",
      '"tally"',
      "'hubspot'",
      '"hubspot"',
      "'jotform'",
      '"jotform"',
      "'google_forms'",
      '"google_forms"'
    ]

    for (const label of unsupportedProviderLabels) {
      assert.strictEqual(
        source.includes(label), false,
        `tracker.js must not assign form_provider = ${label} — unsupported provider`
      )
    }
  })

  await t.test('B2. tracker.js only classifies webflow, wordpress as named form providers (others are native)', () => {
    // The form provider logic: provider starts as 'native', may be reassigned to 'webflow' or 'wordpress'.
    // Assert these are the only non-native assignments.
    assert.ok(
      trackerCode.includes("provider = 'webflow'"),
      "tracker.js must have provider = 'webflow'"
    )
    assert.ok(
      trackerCode.includes("provider = 'wordpress'"),
      "tracker.js must have provider = 'wordpress'"
    )
    // No other provider assignments should exist in form classification context
    // (booking_provider is a separate field — this check is narrowly scoped to form_provider)
    const formBlock = trackerCode.slice(
      trackerCode.indexOf("var provider = 'native'"),
      trackerCode.indexOf("var sanitizedId = sanitizeFormMetadata")
    )
    assert.ok(formBlock.includes("provider = 'webflow'"), 'webflow classification present')
    assert.ok(formBlock.includes("provider = 'wordpress'"), 'wordpress classification present')
    assert.strictEqual(formBlock.includes("provider = 'typeform'"), false, 'typeform must not be classified')
    assert.strictEqual(formBlock.includes("provider = 'hubspot'"), false, 'hubspot must not be classified')
    assert.strictEqual(formBlock.includes("provider = 'tally'"), false, 'tally must not be classified')
    assert.strictEqual(formBlock.includes("provider = 'jotform'"), false, 'jotform must not be classified')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// C. TidyCal and SavvyCal: UTM passthrough only, no confirmed booking
// ─────────────────────────────────────────────────────────────────────────────
test('140L — C. TidyCal and SavvyCal are UTM passthrough only', async (t) => {

  // ── C1. TidyCal link gets UTM params appended (regression guard) ──────────
  await t.test('C1. TidyCal link receives UTM passthrough', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=google&utm_medium=cpc'
    })
    const result = triggerMousedown('https://tidycal.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.hostname, 'tidycal.com')
    assert.strictEqual(u.searchParams.get('utm_source'), 'google')
    assert.strictEqual(u.searchParams.get('utm_medium'), 'cpc')
  })

  // ── C2. TidyCal postMessage from any origin does not produce booking_scheduled
  await t.test('C2. TidyCal does not produce booking_scheduled from any message', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    triggerMessage('https://tidycal.com', { event: 'booking_confirmed', bookingId: '123' })
    triggerMessage('https://app.tidycal.com', { event: 'booking_confirmed', bookingId: '123' })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0, 'TidyCal must not emit booking_scheduled')
  })

  // ── C3. SavvyCal link gets UTM params appended (regression guard) ─────────
  await t.test('C3. SavvyCal link receives UTM passthrough', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=google&utm_medium=cpc'
    })
    const result = triggerMousedown('https://savvycal.com/user/intro')
    const u = new URL(result)
    assert.strictEqual(u.hostname, 'savvycal.com')
    assert.strictEqual(u.searchParams.get('utm_source'), 'google')
  })

  // ── C4. SavvyCal postMessage from any origin does not produce booking_scheduled
  await t.test('C4. SavvyCal does not produce booking_scheduled from any message', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    triggerMessage('https://savvycal.com', { event: 'savvycal.booking_confirmed', payload: {} })
    triggerMessage('https://embed.savvycal.com', { event: 'booking_confirmed', payload: {} })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0, 'SavvyCal must not emit booking_scheduled')
  })

  // ── C5. Fake window.Cal registered as TidyCal does not emit booking_scheduled
  await t.test('C5. A fake Cal function registered for TidyCal does not produce booking_scheduled', () => {
    // If someone named a CalFn present on page — only bookingSuccessfulV2 from Cal.com embed API
    // fires; TidyCal does not use the Cal() API, so no event should fire unless the page has
    // window.Cal AND the callback fires. This test proves no TidyCal-specific event is registered.
    const calCallbacks = []
    const CalFn = (action, opts) => {
      if (action === 'on' && opts && opts.action) calCallbacks.push(opts)
    }
    runTrackerInVm(trackerCode, { CalFn })
    // Only bookingSuccessfulV2 should be registered — NOT any TidyCal-specific action
    const registeredActions = calCallbacks.map(c => c.action)
    assert.ok(registeredActions.includes('bookingSuccessfulV2'), 'Cal.com bookingSuccessfulV2 registered')
    assert.strictEqual(registeredActions.some(a => a.toLowerCase().includes('tidycal')), false,
      'No TidyCal-specific Cal action registered')
    assert.strictEqual(registeredActions.some(a => a.toLowerCase().includes('savvycal')), false,
      'No SavvyCal-specific Cal action registered')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// D. Regression: Calendly confirmed booking still works
// ─────────────────────────────────────────────────────────────────────────────
test('140L — D. Calendly confirmed booking regression guard', async (t) => {

  await t.test('D1. calendly.event_scheduled still emits booking_scheduled after 140L', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    triggerMessage('https://calendly.com', {
      event: 'calendly.event_scheduled',
      payload: {}
    })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 1)
    assert.strictEqual(bookings[0].body.properties.booking_provider, 'calendly')
    assert.ok(bookings[0].url.includes('/api/track'))
  })

  await t.test('D2. Calendly subdomain still accepted after 140L', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    triggerMessage('https://assets.calendly.com', {
      event: 'calendly.event_scheduled',
      payload: {}
    })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 1)
  })

  await t.test('D3. Non-Calendly origin with calendly event name is still rejected', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    triggerMessage('https://calendly.com.evil.io', {
      event: 'calendly.event_scheduled',
      payload: {}
    })
    triggerMessage('https://not-calendly.com', {
      event: 'calendly.event_scheduled',
      payload: {}
    })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0, 'Spoofed Calendly origin must be rejected')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// E. Regression: Cal.com best-effort embed API still works
// ─────────────────────────────────────────────────────────────────────────────
test('140L — E. Cal.com best-effort embed API regression guard', async (t) => {

  await t.test('E1. Cal.com bookingSuccessfulV2 still emits booking_scheduled after 140L', () => {
    const calCallbacks = []
    const CalFn = (action, opts) => {
      if (action === 'on' && opts && opts.action) calCallbacks.push(opts)
    }
    const { payloads } = runTrackerInVm(trackerCode, { CalFn })
    payloads.length = 0

    const registered = calCallbacks.find(c => c.action === 'bookingSuccessfulV2')
    assert.ok(registered, 'bookingSuccessfulV2 must be registered')
    registered.callback({})

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 1)
    assert.strictEqual(bookings[0].body.properties.booking_provider, 'calcom')
  })

  await t.test('E2. Cal.com absent: no booking events, no throw', () => {
    assert.doesNotThrow(() => {
      const { payloads } = runTrackerInVm(trackerCode)
      const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled' &&
        p.body.properties && p.body.properties.booking_provider === 'calcom')
      assert.strictEqual(bookings.length, 0)
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// F. Regression: Native/Webflow/WordPress form submit still works
// ─────────────────────────────────────────────────────────────────────────────
test('140L — F. Native/Webflow/WordPress form submit regression guard', async (t) => {

  // Shared minimal form submit trigger
  function triggerFormSubmit(context, formAttrs = {}, parentClass = '') {
    const listeners = context._listeners || {}
    const submitHandler = listeners.submit
    if (!submitHandler) return

    const form = {
      nodeName: 'FORM',
      getAttribute: (name) => formAttrs[name] || null,
      action: formAttrs.action || '',
      parentNode: parentClass
        ? { getAttribute: (n) => n === 'class' ? parentClass : null }
        : null,
      _stLastSubmit: null
    }
    submitHandler({ target: form, preventDefault: () => {} })
  }

  await t.test('F1. Native form submit emits form_submit with provider=native', () => {
    const listeners = {}
    const payloads = []

    const locationMock = {
      href: 'https://example.com/contact',
      pathname: '/contact',
      search: '',
      origin: 'https://example.com',
      hostname: 'example.com',
      protocol: 'https:'
    }

    const documentMock = {
      referrer: '',
      cookie: '',
      currentScript: {
        getAttribute: (name) => name === 'data-site-key' ? 'sk-test' : null,
        src: ''
      },
      querySelector: () => null,
      addEventListener: (event, handler) => { listeners[event] = handler }
    }

    const storage = {}
    const context = vm.createContext({
      window: {
        location: locationMock,
        document: documentMock,
        navigator: {
          doNotTrack: null, globalPrivacyControl: null,
          sendBeacon: (url, blob) => {
            if (blob && blob.parts && blob.parts[0]) payloads.push({ url, body: JSON.parse(blob.parts[0]) })
            return true
          }
        },
        history: { pushState: () => {}, replaceState: () => {} },
        fetch: async (url, options) => {
          if (options && options.body) payloads.push({ url, body: JSON.parse(options.body) })
          return { ok: true, json: async () => ({ success: true }) }
        },
        addEventListener: (event, handler) => { listeners[event] = handler }
      },
      document: documentMock,
      location: locationMock,
      navigator: {
        doNotTrack: null, globalPrivacyControl: null,
        sendBeacon: (url, blob) => {
          if (blob && blob.parts && blob.parts[0]) payloads.push({ url, body: JSON.parse(blob.parts[0]) })
          return true
        }
      },
      history: { pushState: () => {}, replaceState: () => {} },
      addEventListener: (event, handler) => { listeners[event] = handler },
      fetch: async (url, options) => {
        if (options && options.body) payloads.push({ url, body: JSON.parse(options.body) })
        return { ok: true, json: async () => ({ success: true }) }
      },
      localStorage: {
        getItem: (k) => storage[k] || null,
        setItem: (k, v) => { storage[k] = String(v) },
        removeItem: (k) => { delete storage[k] }
      },
      sessionStorage: {
        getItem: (k) => storage[k] || null,
        setItem: (k, v) => { storage[k] = String(v) },
        removeItem: (k) => { delete storage[k] }
      },
      setTimeout: (fn, d) => setTimeout(fn, d),
      clearTimeout,
      WeakMap: globalThis.WeakMap,
      URL: globalThis.URL,
      URLSearchParams: globalThis.URLSearchParams,
      Date: globalThis.Date,
      Blob: class { constructor(p) { this.parts = p } },
      console: { warn: () => {}, error: () => {}, log: () => {} }
    })

    vm.runInContext(trackerCode, context)

    // Simulate a plain native form submit
    const nativeForm = {
      nodeName: 'FORM',
      getAttribute: (name) => ({ id: 'contact-form', class: '', name: 'contact', action: '/submit' }[name] || null),
      action: '/submit',
      parentNode: null,
      _stLastSubmit: null
    }

    if (listeners.submit) {
      listeners.submit({ target: nativeForm, preventDefault: () => {} })
    }

    const formEvents = payloads.filter(p => p.body && p.body.event === 'form_submit')
    assert.ok(formEvents.length >= 1, 'Expected at least one form_submit event')
    assert.strictEqual(formEvents[0].body.properties.form_provider, 'native')
    assert.ok(formEvents[0].url.includes('/api/track'))
  })

  await t.test('F2. Webflow form classified as webflow provider', () => {
    // Static check: webflow classification is present in tracker source
    assert.ok(trackerCode.includes("provider = 'webflow'"))
    assert.ok(trackerCode.includes("data-wf-form"))
  })

  await t.test('F3. WordPress form classified as wordpress provider', () => {
    // Static check: wordpress classification is present in tracker source
    assert.ok(trackerCode.includes("provider = 'wordpress'"))
    assert.ok(trackerCode.includes('wpcf7'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// G. Booking passthrough regression: all UTM passthrough providers work
// ─────────────────────────────────────────────────────────────────────────────
test('140L — G. Booking UTM passthrough regression for all passthrough-only providers', async (t) => {
  const setupPassthroughVm = () => runTrackerInVm(trackerCode, {
    search: '?utm_source=google&utm_medium=cpc&utm_campaign=test'
  })

  await t.test('G1. Calendly link gets UTM passthrough', () => {
    const { triggerMousedown } = setupPassthroughVm()
    const result = triggerMousedown('https://calendly.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.get('utm_source'), 'google')
  })

  await t.test('G2. Cal.com link gets UTM passthrough', () => {
    const { triggerMousedown } = setupPassthroughVm()
    const result = triggerMousedown('https://cal.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.get('utm_source'), 'google')
  })

  await t.test('G3. TidyCal link gets UTM passthrough', () => {
    const { triggerMousedown } = setupPassthroughVm()
    const result = triggerMousedown('https://tidycal.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.get('utm_source'), 'google')
  })

  await t.test('G4. SavvyCal link gets UTM passthrough', () => {
    const { triggerMousedown } = setupPassthroughVm()
    const result = triggerMousedown('https://savvycal.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.get('utm_source'), 'google')
  })

  await t.test('G5. Non-booking link is NOT mutated', () => {
    const { triggerMousedown } = setupPassthroughVm()
    const original = 'https://external-site.com/page'
    const result = triggerMousedown(original)
    assert.strictEqual(result, original, 'Non-booking links must not be mutated')
  })

  await t.test('G6. Typeform link is NOT mutated (not a booking provider)', () => {
    const { triggerMousedown } = setupPassthroughVm()
    const original = 'https://form.typeform.com/to/abc123'
    const result = triggerMousedown(original)
    assert.strictEqual(result, original, 'Typeform links must not be mutated — not a booking provider')
  })

  await t.test('G7. Tally link is NOT mutated (not a booking provider)', () => {
    const { triggerMousedown } = setupPassthroughVm()
    const original = 'https://tally.so/r/abc123'
    const result = triggerMousedown(original)
    assert.strictEqual(result, original, 'Tally links must not be mutated — not a booking provider')
  })

  await t.test('G8. HubSpot form link is NOT mutated', () => {
    const { triggerMousedown } = setupPassthroughVm()
    const original = 'https://share.hsforms.com/abc123'
    const result = triggerMousedown(original)
    assert.strictEqual(result, original, 'HubSpot form links must not be mutated')
  })

  await t.test('G9. Jotform link is NOT mutated', () => {
    const { triggerMousedown } = setupPassthroughVm()
    const original = 'https://form.jotform.com/12345678'
    const result = triggerMousedown(original)
    assert.strictEqual(result, original, 'Jotform links must not be mutated')
  })

  await t.test('G10. Google Forms link is NOT mutated', () => {
    const { triggerMousedown } = setupPassthroughVm()
    const original = 'https://docs.google.com/forms/d/abc/viewform'
    const result = triggerMousedown(original)
    assert.strictEqual(result, original, 'Google Forms links must not be mutated')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// H. /api/conversion unchanged
// ─────────────────────────────────────────────────────────────────────────────
test('140L — H. /api/conversion route unchanged by 140L', () => {
  const convPath = path.join(rootDir, 'api/routes/conversion.js')
  const convSource = fs.readFileSync(convPath, 'utf8')

  // No provider-specific booking references in conversion route
  assert.strictEqual(convSource.includes('booking_scheduled'), false,
    'conversion.js must not reference booking_scheduled')
  assert.strictEqual(convSource.includes('booking_provider'), false,
    'conversion.js must not reference booking_provider')
  assert.strictEqual(convSource.includes('form_submit'), false,
    'conversion.js must not reference form_submit')
  assert.strictEqual(convSource.includes('tidycal'), false,
    'conversion.js must not reference tidycal')
  assert.strictEqual(convSource.includes('savvycal'), false,
    'conversion.js must not reference savvycal')
  assert.strictEqual(convSource.includes('typeform'), false,
    'conversion.js must not reference typeform')
})

// ─────────────────────────────────────────────────────────────────────────────
// I. No PII forwarded by any provider path (source audit)
// ─────────────────────────────────────────────────────────────────────────────
test('140L — I. No PII forwarded by form or booking provider detection', async (t) => {

  await t.test('I1. Calendly raw PII not forwarded (regression guard)', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    triggerMessage('https://calendly.com', {
      event: 'calendly.event_scheduled',
      payload: {
        invitee_email: 'user@example.com',
        invitee_name: 'John Doe',
        invitee_phone: '+15551234567',
        event: { uri: 'https://api.calendly.com/scheduled_events/ABC' },
        invitee: { uri: 'https://api.calendly.com/scheduled_events/ABC/invitees/DEF' }
      }
    })
    const booking = payloads.find(p => p.body && p.body.event === 'booking_scheduled')
    assert.ok(booking)
    const props = booking.body.properties
    assert.strictEqual(props.invitee_email, undefined)
    assert.strictEqual(props.invitee_name, undefined)
    assert.strictEqual(props.invitee_phone, undefined)
    assert.strictEqual(props.event_uri, undefined)
    assert.strictEqual(props.invitee_uri, undefined)
  })

  await t.test('I2. Cal.com raw payload PII not forwarded (regression guard)', () => {
    const calCallbacks = []
    const CalFn = (action, opts) => {
      if (action === 'on' && opts && opts.action) calCallbacks.push(opts)
    }
    const { payloads } = runTrackerInVm(trackerCode, { CalFn })
    payloads.length = 0

    const registered = calCallbacks.find(c => c.action === 'bookingSuccessfulV2')
    registered.callback({
      detail: {
        data: {
          uid: 'booking-uid-123',
          attendeeEmail: 'user@example.com',
          attendeeName: 'Alice',
          attendeePhone: '+15551234567'
        }
      }
    })

    const booking = payloads.find(p => p.body && p.body.event === 'booking_scheduled')
    assert.ok(booking)
    const props = booking.body.properties
    assert.strictEqual(props.uid, undefined)
    assert.strictEqual(props.attendeeEmail, undefined)
    assert.strictEqual(props.attendeeName, undefined)
    assert.strictEqual(props.attendeePhone, undefined)
  })

  await t.test('I3. tracker.js booking detection: raw PII param names not in source properties block', () => {
    // Static check: the _sendBookingScheduled function must not reference email, name, phone, address
    const sendBlock = trackerCode.slice(
      trackerCode.indexOf('function _sendBookingScheduled'),
      trackerCode.indexOf('// ── Calendly ──')
    )
    assert.strictEqual(sendBlock.includes('email'), false, 'email must not be in _sendBookingScheduled')
    assert.strictEqual(sendBlock.includes('phone'), false, 'phone must not be in _sendBookingScheduled')
    assert.strictEqual(sendBlock.includes('invitee'), false, 'invitee must not be in _sendBookingScheduled')
    assert.strictEqual(sendBlock.includes('attendee'), false, 'attendee must not be in _sendBookingScheduled')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// J. form_provider allowlist (backend): only native/webflow/wordpress/unknown
// ─────────────────────────────────────────────────────────────────────────────
test('140L — J. Backend form_provider allowlist matches provider truth', async (t) => {
  const { track } = await import('../../api/routes/track.js')

  function mockFormReq(provider) {
    return {
      headers: { 'user-agent': 'Mozilla/5.0 (Test)' },
      body: {
        event: 'form_submit',
        anonymous_id: 'anon-123',
        session_id: 'sess-456',
        page_url: 'https://example.com/contact',
        properties: {
          event_type: 'form_submit',
          form_provider: provider,
          form_id: 'contact',
          form_name: 'contact',
          form_action_host: 'example.com',
          form_action_path: '/submit',
          page_path: '/contact'
        }
      },
      site: { id: 'site-123', excluded_paths: null, custom_url_params: null, last_seen_at: null, plan_name: 'starter', pv_limit: 5000 }
    }
  }

  function mockRes() {
    return {
      _status: 200,
      _body: null,
      status(s) { this._status = s; return this },
      json(b) { this._body = b; return this }
    }
  }

  await t.test('J1. form_provider=native accepted by backend', async () => {
    const res = mockRes()
    await track(mockFormReq('native'), res)
    assert.strictEqual(res._status, 200)
  })

  await t.test('J2. form_provider=webflow accepted by backend', async () => {
    const res = mockRes()
    await track(mockFormReq('webflow'), res)
    assert.strictEqual(res._status, 200)
  })

  await t.test('J3. form_provider=wordpress accepted by backend', async () => {
    const res = mockRes()
    await track(mockFormReq('wordpress'), res)
    assert.strictEqual(res._status, 200)
  })

  await t.test('J4. form_provider=unknown accepted by backend (fallback)', async () => {
    const res = mockRes()
    await track(mockFormReq('unknown'), res)
    assert.strictEqual(res._status, 200)
  })

  await t.test('J5. form_provider=typeform accepted (200) but coerced to "unknown" by backend allowlist', async () => {
    // The backend enforces a form_provider allowlist in track.js: only
    // native/webflow/wordpress survive as-is; any other value (including a
    // spoofed 'typeform') is coerced to 'unknown'. The event is still accepted
    // (200) — it is not rejected — but the unsupported label never persists.
    // This proves an unsupported provider cannot smuggle a false form_provider
    // label into analytics.
    const res = mockRes()
    const captured = await withCaptureSpy(() => track(mockFormReq('typeform'), res))
    assert.strictEqual(res._status, 200, 'unsupported form_provider is accepted, not rejected')
    assert.strictEqual(captured.properties.form_provider, 'unknown',
      'spoofed form_provider="typeform" must be coerced to "unknown" — never stored as "typeform"')
  })

  await t.test('J6. form_provider=native is preserved verbatim (allowlist passthrough)', async () => {
    const res = mockRes()
    const captured = await withCaptureSpy(() => track(mockFormReq('native'), res))
    assert.strictEqual(captured.properties.form_provider, 'native',
      'allowlisted form_provider must persist as-is')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// K. booking_provider allowlist (backend): only calendly/calcom accepted
// ─────────────────────────────────────────────────────────────────────────────
test('140L — K. Backend booking_provider allowlist enforces calendly/calcom only', async (t) => {
  const { track } = await import('../../api/routes/track.js')

  // eventType is parameterised because booking_event_type is validated AGAINST the
  // resolved provider: 'event_scheduled' is Calendly's completion event and
  // 'bookingSuccessfulV2' is Cal.com's. K2 previously passed calcom paired with
  // Calendly's event — a combination no tracker build emits — and still passed,
  // because it only asserted the provider field.
  function mockBookingReq(provider, eventType = 'event_scheduled') {
    return {
      headers: { 'user-agent': 'Mozilla/5.0 (Test)' },
      body: {
        event: 'booking_scheduled',
        anonymous_id: 'anon-123',
        session_id: 'sess-456',
        page_url: 'https://example.com/contact',
        properties: {
          event_type: 'booking_scheduled',
          booking_provider: provider,
          booking_detection_method: 'browser_embed_event',
          booking_event_type: eventType,
          page_path: '/contact'
        }
      },
      site: { id: 'site-123', excluded_paths: null, custom_url_params: null, last_seen_at: null, plan_name: 'starter', pv_limit: 5000 }
    }
  }

  function mockRes() {
    return {
      _status: 200, _body: null,
      status(s) { this._status = s; return this },
      json(b) { this._body = b; return this }
    }
  }

  await t.test('K1. booking_provider=calendly accepted and persisted verbatim', async () => {
    const res = mockRes()
    const captured = await withCaptureSpy(() => track(mockBookingReq('calendly'), res))
    assert.strictEqual(res._status, 200)
    assert.strictEqual(captured.properties.booking_provider, 'calendly',
      'allowlisted booking_provider must persist as-is')
  })

  await t.test('K2. booking_provider=calcom accepted and persisted verbatim', async () => {
    const res = mockRes()
    const captured = await withCaptureSpy(() => track(mockBookingReq('calcom', 'bookingSuccessfulV2'), res))
    assert.strictEqual(res._status, 200)
    assert.strictEqual(captured.properties.booking_provider, 'calcom',
      'allowlisted booking_provider must persist as-is')
    assert.strictEqual(captured.properties.booking_event_type, 'bookingSuccessfulV2',
      "Cal.com's own completion event must persist as-is")
  })

  // K3–K7: unsupported booking providers are accepted (200) but their provider
  // label is coerced to null by the backend allowlist — they can never be
  // attributed as a confirmed Calendly/Cal.com booking.
  for (const provider of ['tidycal', 'savvycal', 'typeform', 'tally', 'hubspot']) {
    await t.test(`K. booking_provider=${provider} stripped to null (not in allowlist)`, async () => {
      const res = mockRes()
      const captured = await withCaptureSpy(() => track(mockBookingReq(provider), res))
      assert.strictEqual(res._status, 200,
        'unsupported booking_provider is accepted, not rejected')
      assert.strictEqual(captured.properties.booking_provider, null,
        `unsupported booking_provider="${provider}" must be coerced to null`)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// K8+. Confirmed-booking PROMOTION requires ALL THREE provenance fields
// ─────────────────────────────────────────────────────────────────────────────
// Why this block exists: section K above validated the provider allowlist only, and
// used booking_detection_method / booking_event_type purely as a valid FIXTURE. It
// never asserted what happens when they are missing, wrong, or belong to a different
// provider — so the promotion gate reading `booking_provider` alone was consistent
// with a green suite. A bare { booking_provider: 'calendly' } wrote a real $conversion
// of type 'meeting' (a LEAD) with both other fields null.
//
// Promotion is the thing worth pinning, not storage: an over-permissive gate invents
// leads. Every case below asserts the CONVERSION outcome, not just the stored label.
test('140L — K8+. Booking promotion requires provider + detection_method + that provider\'s own event', async (t) => {
  const { track } = await import('../../api/routes/track.js')
  const { setDualWriteTransport, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')
  const { gunzipSync } = await import('node:zlib')

  // Unlike withCaptureSpy (which returns only the first row) this returns EVERY row,
  // because a promoted booking writes two: the booking_scheduled event AND the
  // derived $conversion. Asserting on row[0] alone cannot see promotion at all.
  let seq = 0
  async function ingestAll(properties) {
    const payloads = []
    const prevFlag = process.env.TINYBIRD_DUAL_WRITE
    process.env.TINYBIRD_DUAL_WRITE = 'true'
    setDualWriteTransport(async (p) => { payloads.push(p) }, { flushAt: 1000, flushInterval: 0 })
    try {
      const req = {
        headers: { 'user-agent': 'Mozilla/5.0 (Test)' },
        // Distinct anonymous_id per case: the shared dedupe cache is process-wide, so
        // reusing one id would let case N suppress case N+1 and fake a rejection.
        body: {
          event: 'booking_scheduled',
          anonymous_id: `anon-promo-${seq++}`,
          session_id: 'sess-456',
          page_url: 'https://example.com/contact',
          properties: { event_type: 'booking_scheduled', page_path: '/contact', ...properties }
        },
        site: { id: 'site-123', excluded_paths: null, custom_url_params: null, last_seen_at: null, plan_name: 'starter', pv_limit: 5000 }
      }
      const res = { _status: 200, status (s) { this._status = s; return this }, json () { return this } }
      await track(req, res)
      const b = __getDualWriteBatcher(); if (b) await b.flush()
      return { status: res._status, rows: payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))) }
    } finally {
      setDualWriteTransport(null)
      if (prevFlag === undefined) delete process.env.TINYBIRD_DUAL_WRITE
      else process.env.TINYBIRD_DUAL_WRITE = prevFlag
    }
  }
  const promotion = (rows) => rows.find(r => r.event_type === '$conversion') || null

  const VALID_CALENDLY = {
    booking_provider: 'calendly',
    booking_detection_method: 'browser_embed_event',
    booking_event_type: 'event_scheduled'
  }

  // ── Positive control FIRST — if this ever fails, every rejection below is vacuous ──
  await t.test('K8. Baseline: all three fields valid DOES promote to a meeting conversion', async () => {
    const { status, rows } = await ingestAll(VALID_CALENDLY)
    assert.strictEqual(status, 200)
    const conv = promotion(rows)
    assert.ok(conv, 'a fully-valid Calendly booking must still promote')
    assert.strictEqual(conv.conversion_type, 'meeting')
  })

  await t.test('K9. Baseline: Cal.com with its OWN event promotes', async () => {
    const { rows } = await ingestAll({
      booking_provider: 'calcom',
      booking_detection_method: 'browser_embed_event',
      booking_event_type: 'bookingSuccessfulV2'
    })
    const conv = promotion(rows)
    assert.ok(conv, 'a fully-valid Cal.com booking must still promote')
    assert.strictEqual(conv.conversion_type, 'meeting')
  })

  // ── The five patterns that were WRONGLY promoted before this gate was fixed ──────
  const WRONGLY_PROMOTED = [
    ['K10. detection_method bogus', { ...VALID_CALENDLY, booking_detection_method: 'totally_made_up' }],
    ['K11. event_type bogus', { ...VALID_CALENDLY, booking_event_type: 'NONSENSE_XYZ' }],
    ['K12. both other fields bogus', { booking_provider: 'calendly', booking_detection_method: 'x', booking_event_type: 'y' }],
    ['K13. other fields absent entirely', { booking_provider: 'calendly' }],
    // Both individually allowlisted, but the pair is one no tracker build emits.
    ['K14. cross-provider mismatch (calendly + Cal.com event)', { ...VALID_CALENDLY, booking_event_type: 'bookingSuccessfulV2' }]
  ]

  for (const [name, properties] of WRONGLY_PROMOTED) {
    await t.test(`${name} — accepted (200) but must NOT promote`, async () => {
      const { status, rows } = await ingestAll(properties)
      // Still 200: an incomplete payload is stored, not rejected. Only the LEAD is refused.
      assert.strictEqual(status, 200, 'incomplete provenance is accepted, not rejected')
      assert.ok(rows.some(r => r.event_type === 'booking_scheduled'),
        'the booking_scheduled event itself must still be recorded')
      assert.strictEqual(promotion(rows), null,
        'incomplete/mismatched provenance must NOT write a $conversion')
    })
  }

  await t.test('K15. Mismatch rejects in BOTH directions (calcom + Calendly event)', async () => {
    const { rows } = await ingestAll({
      booking_provider: 'calcom',
      booking_detection_method: 'browser_embed_event',
      booking_event_type: 'event_scheduled'
    })
    assert.strictEqual(promotion(rows), null,
      'the pairing check must not be one-directional')
  })

  await t.test('K16. A mismatched event name is stored as null, not kept as a valid-looking label', async () => {
    const { rows } = await ingestAll({ ...VALID_CALENDLY, booking_event_type: 'bookingSuccessfulV2' })
    const evt = rows.find(r => r.event_type === 'booking_scheduled')
    assert.strictEqual(evt.booking_event_type, null,
      "Cal.com's event name must not persist on a Calendly booking")
  })

  await t.test('K17. Casing/whitespace is still tolerated on a genuine booking', async () => {
    const { rows } = await ingestAll({
      booking_provider: '  CALENDLY ',
      booking_detection_method: ' Browser_Embed_Event ',
      booking_event_type: 'event_scheduled'
    })
    assert.ok(promotion(rows), 'normalisation must not be tightened into a false rejection')
  })

  await t.test('K18. ignore_conversion still suppresses an otherwise-valid booking', async () => {
    const { rows } = await ingestAll({ ...VALID_CALENDLY, ignore_conversion: true })
    assert.strictEqual(promotion(rows), null, 'the opt-out must survive the tighter gate')
  })

  await t.test('K19. The gate and the ingest allowlist share ONE pairing map', async () => {
    // Anti-drift: the bug was two independent lists that could disagree. If a future
    // change re-forks them, this fails rather than silently re-opening the gap.
    const { BOOKING_PROVIDER_EVENTS, BOOKING_DETECTION_METHOD } = await import('../../api/routes/track.js')
    assert.deepStrictEqual(BOOKING_PROVIDER_EVENTS, {
      calendly: ['event_scheduled'],
      calcom: ['bookingSuccessfulV2']
    }, 'the pairing map must match what tracker.js actually emits')
    assert.strictEqual(BOOKING_DETECTION_METHOD, 'browser_embed_event')

    // And it must match the trackers themselves — the real producers.
    for (const f of ['tracker/tracker.js', 'tracker/tracker.cookieless.js']) {
      const src = fs.readFileSync(path.join(rootDir, f), 'utf8')
      for (const [provider, events] of Object.entries(BOOKING_PROVIDER_EVENTS)) {
        assert.ok(src.includes(`_sendBookingScheduled('${provider}', '${events[0]}')`),
          `${f} must emit ${provider} -> ${events[0]}`)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// L. Cookieless tracker: identical truth boundaries (static source parity)
// ─────────────────────────────────────────────────────────────────────────────
// The cookieless tracker is a separate build with its own form/booking code.
// Its runtime behavior is covered by the existing tracker-*.test.js suites;
// here we lock in that it carries NO unsupported-provider classification and
// the SAME confirmed-booking surface (Calendly + Cal.com only).
test('140L — L. Cookieless tracker shares the same provider truth boundaries', async (t) => {
  const cookielessCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.cookieless.js'), 'utf8')

  await t.test('L1. Cookieless tracker classifies only webflow/wordpress (no unsupported providers)', () => {
    assert.ok(cookielessCode.includes("provider = 'webflow'"), 'webflow classification present')
    assert.ok(cookielessCode.includes("provider = 'wordpress'"), 'wordpress classification present')
    for (const label of ["'typeform'", "'tally'", "'hubspot'", "'jotform'", "'google_forms'"]) {
      assert.strictEqual(cookielessCode.includes('provider = ' + label), false,
        `cookieless tracker must not classify form_provider = ${label}`)
    }
  })

  await t.test('L2. Cookieless tracker confirms bookings only for Calendly + Cal.com', () => {
    assert.ok(cookielessCode.includes('calendly.event_scheduled'),
      'Calendly confirmed event present')
    assert.ok(cookielessCode.includes('bookingSuccessfulV2'),
      'Cal.com confirmed event present')
    // No confirmed-booking/submit event listeners for unsupported providers.
    // NOTE: tidycal.com / savvycal.com appear in BOOKING_HOSTS (UTM passthrough)
    // — that is correct and intentional, so we check for provider-specific
    // CONFIRMED-EVENT names only, not host substrings.
    for (const label of ['tidycal.event_scheduled', 'savvycal.event_scheduled',
                         'Tally.FormSubmitted', 'hsFormCallback', 'submission-completed']) {
      assert.strictEqual(cookielessCode.includes(label), false,
        `cookieless tracker must not listen for confirmed event "${label}"`)
    }
  })

  await t.test('L3. Cookieless tracker emits booking_scheduled via /api/track, never /api/conversion', () => {
    assert.ok(cookielessCode.includes("event: 'booking_scheduled'"), 'booking_scheduled present')
    const bookingIdx = cookielessCode.indexOf("event: 'booking_scheduled'")
    const around = cookielessCode.slice(bookingIdx - 400, bookingIdx + 400)
    assert.strictEqual(around.includes('/api/conversion'), false,
      'booking_scheduled must not route through /api/conversion')
  })
})
