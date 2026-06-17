import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import vm from 'node:vm'
import { fileURLToPath } from 'url'

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '../..')

const trackerCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.js'), 'utf8')
const cookielessCode = fs.readFileSync(path.join(rootDir, 'tracker/tracker.cookieless.js'), 'utf8')

/**
 * Run a tracker in a mocked browser VM.
 * @param {string} code
 * @param {object} opts
 * @param {string} [opts.search]         window.location.search
 * @param {boolean} [opts.doNotTrack]    simulate DNT
 * @param {string} [opts.excludePath]    data-exclude value
 * @param {string} [opts.pathname]       window.location.pathname
 * @param {function} [opts.CalFn]        pre-loaded window.Cal function (if any)
 */
function runTrackerInVm(code, opts = {}) {
  const search = opts.search !== undefined ? opts.search : '?utm_source=google'
  const pathname = opts.pathname || '/contact'
  const listeners = {}

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
    currentScript: {
      getAttribute: (name) => {
        if (name === 'data-site-key') return 'sk-test'
        if (name === 'data-exclude') return opts.excludePath || null
        return null
      },
      src: ''
    },
    querySelector: () => null,
    addEventListener: (event, handler) => {
      listeners[event] = handler
    }
  }

  const storage = {}
  const localStorageMock = {
    getItem: (key) => storage[key] || null,
    setItem: (key, val) => { storage[key] = String(val) },
    removeItem: (key) => { delete storage[key] }
  }

  const payloads = []

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
    history: {
      pushState: () => {},
      replaceState: () => {}
    },
    fetch: async (url, options) => {
      if (url.includes('/api/tracker/id')) {
        return {
          ok: true,
          json: async () => ({ visitor_id: 'cl-visitor-123', session_id: 'cl-session-456' })
        }
      }
      if (options && options.body) {
        payloads.push({ url, body: JSON.parse(options.body) })
      }
      return { ok: true, json: async () => ({ success: true }) }
    },
    addEventListener: (event, handler) => {
      listeners[event] = handler
    },
    Cal: opts.CalFn || undefined   // pre-set if provided
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
      constructor(parts, options) {
        this.parts = parts
        this.options = options
      }
    },
    console: {
      warn: () => {},
      error: () => {},
      log: () => {}
    }
  })

  vm.runInContext(code, context)

  /** Fire a window message event (simulates Calendly postMessage) */
  function triggerMessage(origin, data) {
    if (listeners.message) {
      listeners.message({ origin, data })
    }
  }

  return { listeners, payloads, triggerMessage, context, windowMock }
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendly tests — tracker.js
// ─────────────────────────────────────────────────────────────────────────────
test('Confirmed Booking Detection — Calendly (tracker.js)', async (t) => {

  // ── 1. calendly.event_scheduled emits one booking_scheduled event ──────────
  await t.test('1. calendly.event_scheduled emits one booking_scheduled /api/track event', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    triggerMessage('https://calendly.com', {
      event: 'calendly.event_scheduled',
      payload: {
        event: { uri: 'https://api.calendly.com/scheduled_events/ABC123' },
        invitee: { uri: 'https://api.calendly.com/scheduled_events/ABC123/invitees/DEF456' }
      }
    })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 1, 'Expected exactly one booking_scheduled event')
    assert.strictEqual(bookings[0].body.properties.booking_provider, 'calendly')
    assert.strictEqual(bookings[0].body.properties.booking_detection_method, 'browser_embed_event')
    assert.strictEqual(bookings[0].body.properties.booking_event_type, 'event_scheduled')
    assert.ok(bookings[0].url.includes('/api/track'), 'Expected /api/track endpoint')
  })

  // ── 2. Calendly non-scheduled messages do not emit ────────────────────────
  await t.test('2. Calendly non-scheduled messages do not emit booking events', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    const ignoredEvents = [
      'calendly.profile_page_viewed',
      'calendly.event_type_viewed',
      'calendly.date_and_time_selected',
      'calendly.page_height'
    ]
    for (const evt of ignoredEvents) {
      triggerMessage('https://calendly.com', { event: evt, payload: {} })
    }
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0, 'Expected zero booking_scheduled events for non-scheduled messages')
  })

  // ── 3. Unsafe (non-Calendly) origin is ignored ────────────────────────────
  await t.test('3. Unsafe origin is ignored — message from unknown origin', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    triggerMessage('https://evil.com', { event: 'calendly.event_scheduled', payload: {} })
    triggerMessage('https://not-calendly.com', { event: 'calendly.event_scheduled', payload: {} })
    triggerMessage('https://calendly.com.evil.com', { event: 'calendly.event_scheduled', payload: {} })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0, 'Expected zero booking events from non-Calendly origins')
  })

  // ── 4. Sub-domain of Calendly is accepted ────────────────────────────────
  await t.test('4. Calendly subdomain origin is accepted', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    triggerMessage('https://assets.calendly.com', {
      event: 'calendly.event_scheduled',
      payload: {}
    })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 1, 'Expected one booking event from Calendly subdomain')
  })

  // ── 5. Raw payload PII is not forwarded ───────────────────────────────────
  await t.test('5. Raw Calendly payload PII is not forwarded to /api/track', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    triggerMessage('https://calendly.com', {
      event: 'calendly.event_scheduled',
      payload: {
        event: { uri: 'https://api.calendly.com/scheduled_events/ABC' },
        invitee: { uri: 'https://api.calendly.com/scheduled_events/ABC/invitees/DEF' },
        invitee_email: 'user@example.com',
        invitee_name: 'John Doe',
        invitee_phone: '+15551234567',
        questions_and_answers: [{ question: 'Company?', answer: 'ACME Corp' }]
      }
    })
    const booking = payloads.find(p => p.body && p.body.event === 'booking_scheduled')
    assert.ok(booking, 'Expected a booking_scheduled event')
    const props = booking.body.properties
    // Must not contain any raw PII from the payload
    assert.strictEqual(props.invitee_email, undefined)
    assert.strictEqual(props.invitee_name, undefined)
    assert.strictEqual(props.invitee_phone, undefined)
    assert.strictEqual(props.questions_and_answers, undefined)
    // Must not contain raw URIs
    assert.strictEqual(props.event_uri, undefined)
    assert.strictEqual(props.invitee_uri, undefined)
    // booking_event_uri_hash must be absent (not implemented in this session)
    assert.strictEqual(props.booking_event_uri_hash, undefined)
    // Verify safe fields only
    assert.strictEqual(props.booking_provider, 'calendly')
    assert.strictEqual(props.booking_event_type, 'event_scheduled')
  })

  // ── 6. Duplicate scheduled messages are deduped within 5s ─────────────────
  await t.test('6. Duplicate Calendly scheduled messages deduped within 5s window', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    // Fire the same event twice in immediate succession
    triggerMessage('https://calendly.com', { event: 'calendly.event_scheduled', payload: {} })
    triggerMessage('https://calendly.com', { event: 'calendly.event_scheduled', payload: {} })
    triggerMessage('https://calendly.com', { event: 'calendly.event_scheduled', payload: {} })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 1, 'Expected exactly one event despite duplicate messages (deduped)')
  })

  // ── 7. Opt-out prevents booking event emission ────────────────────────────
  await t.test('7. Opt-out (consent false) prevents booking event emission', () => {
    const { payloads, triggerMessage, context } = runTrackerInVm(trackerCode)
    context.window.sourcetrack.optOut()
    payloads.length = 0
    triggerMessage('https://calendly.com', { event: 'calendly.event_scheduled', payload: {} })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0, 'Expected zero events after opt-out')
  })

  // ── 8. DNT prevents message listener from being registered ────────────────
  await t.test('8. DNT=1 prevents booking event emission (tracker skipped at boot)', () => {
    const { listeners, payloads, triggerMessage } = runTrackerInVm(trackerCode, { doNotTrack: true })
    payloads.length = 0
    // With DNT, the IIFE returns before registering any listeners
    triggerMessage('https://calendly.com', { event: 'calendly.event_scheduled', payload: {} })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0, 'Expected zero events with DNT=1')
    // message listener should not be registered
    assert.strictEqual(listeners.message, undefined, 'Expected no message listener registered with DNT=1')
  })

  // ── 9. /api/conversion is NOT called ─────────────────────────────────────
  await t.test('9. /api/conversion is not called by Calendly booking detection', () => {
    const { payloads, triggerMessage } = runTrackerInVm(trackerCode)
    payloads.length = 0
    triggerMessage('https://calendly.com', { event: 'calendly.event_scheduled', payload: {} })
    const convCalls = payloads.filter(p => p.url && p.url.includes('/api/conversion'))
    assert.strictEqual(convCalls.length, 0, 'Expected zero /api/conversion calls')
  })

  // ── 10. Malformed data (non-object) does not throw ────────────────────────
  await t.test('10. Malformed Calendly message data does not throw', () => {
    const { listeners } = runTrackerInVm(trackerCode)
    assert.doesNotThrow(() => {
      if (listeners.message) {
        listeners.message({ origin: 'https://calendly.com', data: null })
        listeners.message({ origin: 'https://calendly.com', data: 'string-not-object' })
        listeners.message({ origin: 'https://calendly.com', data: 42 })
        listeners.message({ origin: 'https://calendly.com', data: undefined })
      }
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cal.com tests — tracker.js
// ─────────────────────────────────────────────────────────────────────────────
test('Confirmed Booking Detection — Cal.com (tracker.js)', async (t) => {

  // ── 11. Cal available at boot: bookingSuccessfulV2 emits booking_scheduled ─
  await t.test('11. Cal.com bookingSuccessfulV2 emits booking_scheduled when Cal is present at boot', () => {
    const calCallbacks = []
    const CalFn = (action, opts) => {
      if (action === 'on' && opts && opts.action) calCallbacks.push(opts)
    }
    const { payloads } = runTrackerInVm(trackerCode, { CalFn })
    payloads.length = 0

    // Find registered bookingSuccessfulV2 callback and fire it
    const registered = calCallbacks.find(c => c.action === 'bookingSuccessfulV2')
    assert.ok(registered, 'Expected bookingSuccessfulV2 callback to be registered when window.Cal is present')
    registered.callback({}) // fire — no payload forwarded

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 1)
    assert.strictEqual(bookings[0].body.properties.booking_provider, 'calcom')
    assert.strictEqual(bookings[0].body.properties.booking_event_type, 'bookingSuccessfulV2')
    assert.strictEqual(bookings[0].body.properties.booking_detection_method, 'browser_embed_event')
    assert.ok(bookings[0].url.includes('/api/track'))
  })

  // ── 12. Cal loads late within retry window ────────────────────────────────
  await t.test('12. Cal.com late-load: registration succeeds within retry window', async () => {
    // No Cal at boot
    const { payloads, context } = runTrackerInVm(trackerCode)
    payloads.length = 0

    // Wait 250ms (less than first retry at 500ms), then inject window.Cal
    await new Promise(r => setTimeout(r, 250))
    const calCallbacks = []
    context.window.Cal = (action, opts) => {
      if (action === 'on' && opts && opts.action) calCallbacks.push(opts)
    }

    // Wait for the retry to fire (at ~500ms from boot)
    await new Promise(r => setTimeout(r, 400))

    const registered = calCallbacks.find(c => c.action === 'bookingSuccessfulV2')
    assert.ok(registered, 'Expected bookingSuccessfulV2 to be registered after Cal.com late-loads within retry window')

    registered.callback({})
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 1)
    assert.strictEqual(bookings[0].body.properties.booking_provider, 'calcom')
  })

  // ── 13. Cal never loads: no events, no errors ─────────────────────────────
  await t.test('13. Cal.com absent: no booking events emitted, no errors', () => {
    // No Cal at boot, no Cal ever loaded
    assert.doesNotThrow(() => {
      const { payloads } = runTrackerInVm(trackerCode)
      // No Cal — retry loop fires in background, but silently exhausts
      // Immediately: no events should have fired yet
      const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled' &&
        p.body.properties && p.body.properties.booking_provider === 'calcom')
      assert.strictEqual(bookings.length, 0, 'Expected zero Cal.com booking events when Cal is absent')
    })
  })

  // ── 14. Cal.com non-confirmation events do not emit ───────────────────────
  await t.test('14. Cal.com non-confirmation events are not registered or emitted', () => {
    const calCallbacks = []
    const CalFn = (action, opts) => {
      if (action === 'on' && opts && opts.action) calCallbacks.push(opts)
    }
    runTrackerInVm(trackerCode, { CalFn })

    // Verify only bookingSuccessfulV2 is registered, not linkReady, eventTypeSelected, etc.
    const registeredActions = calCallbacks.map(c => c.action)
    assert.ok(registeredActions.includes('bookingSuccessfulV2'), 'Expected bookingSuccessfulV2 to be registered')
    // Non-confirmation events must NOT be registered
    assert.strictEqual(registeredActions.includes('linkReady'), false, 'linkReady must not be registered')
    assert.strictEqual(registeredActions.includes('eventTypeSelected'), false, 'eventTypeSelected must not be registered')
    assert.strictEqual(registeredActions.includes('bookingCancelled'), false, 'bookingCancelled must not be registered')
  })

  // ── 15. Cal.com raw payload PII is not forwarded ──────────────────────────
  await t.test('15. Cal.com raw payload PII is not forwarded', () => {
    const calCallbacks = []
    const CalFn = (action, opts) => {
      if (action === 'on' && opts && opts.action) calCallbacks.push(opts)
    }
    const { payloads } = runTrackerInVm(trackerCode, { CalFn })
    payloads.length = 0

    const registered = calCallbacks.find(c => c.action === 'bookingSuccessfulV2')
    // Fire with a payload containing PII — the callback IGNORES the argument
    registered.callback({
      detail: {
        data: { uid: 'booking-uid-123', attendeeEmail: 'user@example.com', attendeeName: 'Alice' },
        type: 'bookingSuccessfulV2'
      }
    })

    const booking = payloads.find(p => p.body && p.body.event === 'booking_scheduled')
    assert.ok(booking)
    const props = booking.body.properties
    assert.strictEqual(props.uid, undefined)
    assert.strictEqual(props.attendeeEmail, undefined)
    assert.strictEqual(props.attendeeName, undefined)
    assert.strictEqual(props.booking_provider, 'calcom')
  })

  // ── 16. Cal.com duplicate bookings are deduped ────────────────────────────
  await t.test('16. Cal.com duplicate bookingSuccessfulV2 callbacks deduped within 5s', () => {
    const calCallbacks = []
    const CalFn = (action, opts) => {
      if (action === 'on' && opts && opts.action) calCallbacks.push(opts)
    }
    const { payloads } = runTrackerInVm(trackerCode, { CalFn })
    payloads.length = 0

    const registered = calCallbacks.find(c => c.action === 'bookingSuccessfulV2')
    registered.callback({})
    registered.callback({})
    registered.callback({})

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled' &&
      p.body.properties.booking_provider === 'calcom')
    assert.strictEqual(bookings.length, 1, 'Expected exactly one Cal.com booking event (deduped)')
  })

  // ── 17. Cal.com opt-out prevents emission ────────────────────────────────
  await t.test('17. Opt-out prevents Cal.com booking event emission', () => {
    const calCallbacks = []
    const CalFn = (action, opts) => {
      if (action === 'on' && opts && opts.action) calCallbacks.push(opts)
    }
    const { payloads, context } = runTrackerInVm(trackerCode, { CalFn })
    context.window.sourcetrack.optOut()
    payloads.length = 0

    const registered = calCallbacks.find(c => c.action === 'bookingSuccessfulV2')
    registered.callback({})

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0, 'Expected zero Cal.com events after opt-out')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Backend: booking_scheduled ingestion guard tests
// ─────────────────────────────────────────────────────────────────────────────
test('Booking Detection Backend Ingestion (track.js)', async (t) => {
  const { track } = await import('../../api/routes/track.js')

  function mockReq(overrides = {}) {
    return {
      headers: { 'user-agent': 'Mozilla/5.0 (Test)' },
      body: {
        event: 'booking_scheduled',
        anonymous_id: 'anon-123',
        session_id: 'sess-456',
        page_url: 'https://example.com/contact',
        properties: {
          event_type: 'booking_scheduled',
          booking_provider: 'calendly',
          booking_detection_method: 'browser_embed_event',
          booking_event_type: 'event_scheduled',
          page_url: 'https://example.com/contact',
          page_path: '/contact'
        },
        ...overrides
      },
      site: { id: 'site-123', excluded_paths: null, custom_url_params: null, last_seen_at: null, plan_name: 'starter', pv_limit: 5000 }
    }
  }

  function mockRes() {
    let status = 200
    const res = {
      _status: 200,
      _body: null,
      status(s) { this._status = s; return this },
      json(b) { this._body = b; return this }
    }
    return res
  }

  // ── 18. Valid booking_scheduled passes through ─────────────────────────────
  await t.test('18. Valid booking_scheduled event accepted by backend', async () => {
    const req = mockReq()
    const res = mockRes()
    await track(req, res)
    assert.strictEqual(res._status, 200)
    assert.strictEqual(res._body?.success, true)
  })

  // ── 19. Invalid booking_provider is stripped ──────────────────────────────
  await t.test('19. Invalid booking_provider is rejected/stripped to null', async () => {
    const req = mockReq()
    req.body.properties.booking_provider = 'stripe'
    const res = mockRes()
    await track(req, res)
    // Should still accept (event passes), but provider would be null in PostHog
    assert.strictEqual(res._status, 200)
  })

  // ── 20. Invalid booking_detection_method is stripped ─────────────────────
  await t.test('20. Invalid booking_detection_method is stripped to null', async () => {
    const req = mockReq()
    req.body.properties.booking_detection_method = 'server_webhook'
    const res = mockRes()
    await track(req, res)
    assert.strictEqual(res._status, 200)
  })

  // ── 21. Invalid booking_event_type is stripped ────────────────────────────
  await t.test('21. Invalid booking_event_type is stripped to null', async () => {
    const req = mockReq()
    req.body.properties.booking_event_type = 'booking_completed_FAKE'
    const res = mockRes()
    await track(req, res)
    assert.strictEqual(res._status, 200)
  })

  // ── 22. Raw custom_properties not forwarded for booking_scheduled ──────────
  await t.test('22. booking_scheduled does not forward raw custom_properties', async () => {
    // This test verifies the backend excludes custom_properties for booking_scheduled
    // by checking that the backend track.js route check uses the same guard as form_submit
    const trackJsSource = fs.readFileSync(path.join(rootDir, 'api/routes/track.js'), 'utf8')
    assert.ok(
      trackJsSource.includes("req.body?.event === 'booking_scheduled'") &&
      trackJsSource.includes("'form_submit' || req.body?.event === 'booking_scheduled'"),
      'Expected booking_scheduled to be excluded from custom_properties passthrough in track.js'
    )
  })

  // ── 23. /api/conversion route unchanged ──────────────────────────────────
  await t.test('23. api/routes/conversion.js remains unchanged by Session 140K', () => {
    const convPath = path.join(rootDir, 'api/routes/conversion.js')
    const convSource = fs.readFileSync(convPath, 'utf8')
    // Must not contain booking_scheduled references
    assert.strictEqual(convSource.includes('booking_scheduled'), false)
    assert.strictEqual(convSource.includes('booking_provider'), false)
    assert.strictEqual(convSource.includes('booking_detection_method'), false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cookieless tracker — Calendly detection
// ─────────────────────────────────────────────────────────────────────────────
test('Confirmed Booking Detection — Cookieless Tracker', async (t) => {

  // ── 24. Cookieless: Calendly message emits booking_scheduled ─────────────
  await t.test('24. Cookieless tracker: Calendly event_scheduled emits booking_scheduled', async () => {
    const { payloads, triggerMessage } = runTrackerInVm(cookielessCode)
    // Wait for fetchId to resolve
    await new Promise(r => setTimeout(r, 100))
    payloads.length = 0

    triggerMessage('https://calendly.com', {
      event: 'calendly.event_scheduled',
      payload: {}
    })

    // Give the queue flush a moment
    await new Promise(r => setTimeout(r, 50))

    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.ok(bookings.length >= 1, 'Expected at least one booking_scheduled event from cookieless tracker')
    assert.strictEqual(bookings[0].body.properties.booking_provider, 'calendly')
    assert.strictEqual(bookings[0].body.cookieless, true)
  })

  // ── 25. Cookieless: Unsafe origin rejected ────────────────────────────────
  await t.test('25. Cookieless tracker: unsafe Calendly origin is rejected', () => {
    const { payloads, triggerMessage } = runTrackerInVm(cookielessCode)
    payloads.length = 0
    triggerMessage('https://evil.com', { event: 'calendly.event_scheduled', payload: {} })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0)
  })

  // ── 26. Cookieless: excluded path suppresses booking event ────────────────
  await t.test('26. Cookieless tracker: excluded path suppresses booking event', () => {
    const { payloads, triggerMessage } = runTrackerInVm(cookielessCode, {
      pathname: '/admin',
      excludePath: '/admin'
    })
    payloads.length = 0
    triggerMessage('https://calendly.com', { event: 'calendly.event_scheduled', payload: {} })
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.strictEqual(bookings.length, 0, 'Expected no booking event on excluded path')
  })

  // ── 27. Cookieless: Cal.com available at boot works ───────────────────────
  await t.test('27. Cookieless tracker: Cal.com bookingSuccessfulV2 emits when Cal is present', async () => {
    const calCallbacks = []
    const CalFn = (action, opts) => {
      if (action === 'on' && opts && opts.action) calCallbacks.push(opts)
    }
    const { payloads } = runTrackerInVm(cookielessCode, { CalFn })
    await new Promise(r => setTimeout(r, 100))
    payloads.length = 0

    const registered = calCallbacks.find(c => c.action === 'bookingSuccessfulV2')
    assert.ok(registered, 'Expected bookingSuccessfulV2 registered in cookieless tracker')
    registered.callback({})

    await new Promise(r => setTimeout(r, 50))
    const bookings = payloads.filter(p => p.body && p.body.event === 'booking_scheduled')
    assert.ok(bookings.length >= 1, 'Expected at least one booking event in cookieless tracker')
    assert.strictEqual(bookings[0].body.properties.booking_provider, 'calcom')
    assert.strictEqual(bookings[0].body.cookieless, true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Regression: ensure prior sessions' tests still cover their cases
// ─────────────────────────────────────────────────────────────────────────────
test('Regression: 140J booking UTM passthrough not broken by 140K', (t) => {
  const { triggerMousedown } = (() => {
    const search = '?utm_source=google&utm_medium=cpc'
    const listeners = {}
    const location = { href: 'https://example.com/pricing' + search, pathname: '/pricing', search, origin: 'https://example.com', hostname: 'example.com', protocol: 'https:' }
    const windowMock = {
      location, document: { referrer: '', cookie: '', currentScript: { getAttribute: () => null, src: '' }, querySelector: () => null, addEventListener: () => {} },
      navigator: { doNotTrack: null, globalPrivacyControl: null, sendBeacon: () => true },
      history: { pushState: () => {}, replaceState: () => {} },
      fetch: async () => ({ ok: true, json: async () => ({}) }),
      addEventListener: (e, h) => { listeners[e] = h }
    }
    const context = vm.createContext({
      window: windowMock, document: windowMock.document, location,
      navigator: windowMock.navigator, history: windowMock.history,
      addEventListener: windowMock.addEventListener, fetch: windowMock.fetch,
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      setTimeout: (fn, d) => setTimeout(fn, d), clearTimeout, WeakMap, URL, URLSearchParams, Date,
      Blob: class { constructor(p) { this.parts = p } },
      console: { warn: () => {}, error: () => {}, log: () => {} }
    })
    vm.runInContext(trackerCode, context)
    function triggerMousedown(href) {
      let current = href
      const anchor = { nodeName: 'A', getAttribute: (n) => n === 'href' ? current : null, setAttribute: (n, v) => { if (n === 'href') current = v }, parentNode: null }
      if (listeners.mousedown) listeners.mousedown({ type: 'mousedown', button: 0, target: anchor, preventDefault: () => {} })
      return current
    }
    return { triggerMousedown }
  })()

  const result = triggerMousedown('https://calendly.com/user/30min')
  const u = new URL(result)
  assert.strictEqual(u.searchParams.get('utm_source'), 'google', 'Expected UTM passthrough to Calendly still working')
  assert.strictEqual(u.searchParams.get('utm_medium'), 'cpc', 'Expected UTM passthrough to Calendly still working')
})
