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
 * @param {string} code - tracker source
 * @param {object} opts
 * @param {string} opts.search - window.location.search (default has utm_source=google&gclid=g-123)
 * @param {boolean} opts.doNotTrack - simulate DNT
 * @param {boolean} opts.optOut - simulate optOut() after boot
 * @param {string} opts.excludePath - data-exclude attribute value
 * @param {string} opts.pathname - window.location.pathname (default /contact)
 */
function runTrackerInVm(code, opts = {}) {
  const search = opts.search !== undefined ? opts.search : '?utm_source=google&gclid=g-123'
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
    addEventListener: (event, handler, useCapture) => {
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
    }
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

  /**
   * Simulate a mousedown on an <a> element with the given href.
   * Returns the final href that was set on the anchor element (or original if not mutated).
   */
  function triggerMousedown(href, button = 0) {
    // Build a mock anchor element
    let currentHref = href
    const anchor = {
      nodeName: 'A',
      getAttribute: (name) => name === 'href' ? currentHref : null,
      setAttribute: (name, val) => { if (name === 'href') currentHref = val },
      parentNode: null,
      target: undefined,
      rel: undefined
    }
    // The event.target is the anchor itself
    const event = {
      type: 'mousedown',
      button,
      target: anchor,
      preventDefault: () => {}
    }
    if (listeners.mousedown) listeners.mousedown(event)
    return currentHref
  }

  return { listeners, payloads, triggerMousedown, context }
}

test('Booking UTM Passthrough — tracker.js', async (t) => {
  // ── 1. Calendly link gets UTM params appended ─────────────────────────────
  await t.test('1. Calendly link gets safe UTM params appended', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=google&utm_medium=cpc&utm_campaign=spring'
    })
    const result = triggerMousedown('https://calendly.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.get('utm_source'), 'google')
    assert.strictEqual(u.searchParams.get('utm_medium'), 'cpc')
    assert.strictEqual(u.searchParams.get('utm_campaign'), 'spring')
    assert.strictEqual(u.hostname, 'calendly.com')
  })

  // ── 2. Cal.com link gets UTM params appended ───────────────────────────────
  await t.test('2. Cal.com link gets safe UTM params appended', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=linkedin&utm_medium=social'
    })
    const result = triggerMousedown('https://cal.com/team/discovery')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.get('utm_source'), 'linkedin')
    assert.strictEqual(u.searchParams.get('utm_medium'), 'social')
    assert.strictEqual(u.hostname, 'cal.com')
  })

  // ── 3. TidyCal link gets UTM params appended ──────────────────────────────
  await t.test('3. TidyCal link gets safe UTM params appended', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=email&utm_campaign=newsletter'
    })
    const result = triggerMousedown('https://tidycal.com/book/demo')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.get('utm_source'), 'email')
    assert.strictEqual(u.searchParams.get('utm_campaign'), 'newsletter')
    assert.strictEqual(u.hostname, 'tidycal.com')
  })

  // ── 4. SavvyCal link gets UTM params appended ─────────────────────────────
  await t.test('4. SavvyCal link gets safe UTM params appended', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=facebook&gclid=GA1.1.abc'
    })
    const result = triggerMousedown('https://savvycal.com/user/intro')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.get('utm_source'), 'facebook')
    assert.strictEqual(u.hostname, 'savvycal.com')
  })

  // ── 5. Existing booking-link params are preserved and not overwritten ──────
  await t.test('5. Existing booking-link params are not overwritten', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=google&utm_medium=cpc'
    })
    // Booking URL already has utm_source set
    const result = triggerMousedown('https://calendly.com/user/30min?utm_source=existing&utm_medium=existing')
    const u = new URL(result)
    // Existing values must survive
    assert.strictEqual(u.searchParams.get('utm_source'), 'existing')
    assert.strictEqual(u.searchParams.get('utm_medium'), 'existing')
  })

  // ── 6. Hash fragments are preserved ───────────────────────────────────────
  await t.test('6. Hash fragments are preserved after passthrough', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=google'
    })
    const result = triggerMousedown('https://calendly.com/user/30min#step2')
    const u = new URL(result)
    assert.strictEqual(u.hash, '#step2')
    assert.strictEqual(u.searchParams.get('utm_source'), 'google')
  })

  // ── 7. Non-booking links are not mutated ─────────────────────────────────
  await t.test('7. Non-booking external links are not mutated', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=google'
    })
    const original = 'https://example.org/some-page'
    const result = triggerMousedown(original)
    // Should be unchanged (not a booking host)
    assert.strictEqual(result, original)
  })

  // ── 8a. Email param rejected ──────────────────────────────────────────────
  await t.test('8a. Unsafe ref with email is not appended', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?ref=user@example.com'
    })
    const result = triggerMousedown('https://calendly.com/user/30min')
    const u = new URL(result)
    // ref should not be appended because it contains @
    assert.strictEqual(u.searchParams.has('ref'), false)
  })

  // ── 8b. Phone-like ref rejected ───────────────────────────────────────────
  await t.test('8b. Unsafe ref with phone digits is not appended', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?ref=1234567890'
    })
    const result = triggerMousedown('https://calendly.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.has('ref'), false)
  })

  // ── 8c. URL-like ref rejected ─────────────────────────────────────────────
  await t.test('8c. Unsafe ref with URL is not appended', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?ref=https://evil.com'
    })
    const result = triggerMousedown('https://calendly.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.has('ref'), false)
  })

  // ── 8d. Token-like ref rejected ───────────────────────────────────────────
  await t.test('8d. Unsafe ref with token prefix is not appended', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?ref=sk_live_something123'
    })
    const result = triggerMousedown('https://calendly.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.has('ref'), false)
  })

  // ── 8e. Overly long ref rejected ──────────────────────────────────────────
  await t.test('8e. Unsafe ref that is too long is not appended', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?ref=' + 'a'.repeat(100)
    })
    const result = triggerMousedown('https://calendly.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.has('ref'), false)
  })

  // ── 9. Raw email/name/phone/address params are never passed ───────────────
  await t.test('9. Raw PII params (email, name, phone, address) are not forwarded', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=google'
    })
    const result = triggerMousedown('https://calendly.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.has('email'), false)
    assert.strictEqual(u.searchParams.has('name'), false)
    assert.strictEqual(u.searchParams.has('phone'), false)
    assert.strictEqual(u.searchParams.has('address'), false)
    assert.strictEqual(u.searchParams.has('message'), false)
    assert.strictEqual(u.searchParams.has('password'), false)
    assert.strictEqual(u.searchParams.has('token'), false)
  })

  // ── 10. Opt-out prevents mutation ─────────────────────────────────────────
  await t.test('10. Opt-out prevents booking URL mutation', () => {
    const { triggerMousedown, context } = runTrackerInVm(trackerCode, {
      search: '?utm_source=google'
    })
    // Call optOut
    context.window.sourcetrack.optOut()
    const original = 'https://calendly.com/user/30min'
    const result = triggerMousedown(original)
    // Should not be mutated after opt-out
    assert.strictEqual(result, original)
  })

  // ── 11. DNT prevents tracker from running at all ──────────────────────────
  await t.test('11. DNT=1 prevents booking URL mutation (tracker skipped)', () => {
    // When doNotTrack is set, the tracker IIFE returns early and adds no listeners
    const { listeners, triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=google',
      doNotTrack: true
    })
    // With DNT, the IIFE returns before registering any listeners
    const original = 'https://calendly.com/user/30min'
    const result = triggerMousedown(original)
    // If no mousedown listener was registered, result is unchanged
    assert.strictEqual(result, original)
  })

  // ── 12. Link without href does not throw ──────────────────────────────────
  await t.test('12. Link without href does not throw', () => {
    const { listeners } = runTrackerInVm(trackerCode, { search: '?utm_source=google' })
    assert.doesNotThrow(() => {
      const anchor = {
        nodeName: 'A',
        getAttribute: (name) => null,  // no href
        setAttribute: () => {},
        parentNode: null
      }
      const event = { type: 'mousedown', button: 0, target: anchor, preventDefault: () => {} }
      if (listeners.mousedown) listeners.mousedown(event)
    })
  })

  // ── 13. Relative/internal link does not mutate ────────────────────────────
  await t.test('13. Relative internal link is not mutated', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, { search: '?utm_source=google' })
    const original = '/about'
    // Relative URLs resolve to example.com — same host — not a booking host
    const result = triggerMousedown(original)
    assert.strictEqual(result, original)
  })

  // ── 14. Existing outbound click tracking still fires ─────────────────────
  await t.test('14. Existing outbound click tracking still fires for booking links', () => {
    const { listeners, payloads } = runTrackerInVm(trackerCode, {
      search: '?utm_source=google'
    })
    payloads.length = 0

    // Trigger a click (not mousedown) — that's what outbound tracking listens on
    const anchor = {
      nodeName: 'A',
      getAttribute: (name) => name === 'href' ? 'https://calendly.com/user/30min' : null,
      setAttribute: () => {},
      parentNode: null
    }
    const clickEvent = {
      type: 'click',
      button: 0,
      target: anchor,
      preventDefault: () => {}
    }
    if (listeners.click) listeners.click(clickEvent)

    // outbound_click should have been sent
    assert.ok(payloads.length >= 1, 'Expected at least one payload from outbound click tracking')
    const outbound = payloads.find(p => p.body && p.body.event === 'outbound_click')
    assert.ok(outbound, 'Expected an outbound_click event payload')
    assert.strictEqual(outbound.body.properties.destination_domain, 'calendly.com')
  })

  // ── 15. /api/conversion unchanged ────────────────────────────────────────
  await t.test('15. /api/conversion is not called by booking passthrough', () => {
    const { payloads, triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?utm_source=google'
    })
    payloads.length = 0
    triggerMousedown('https://calendly.com/user/30min')
    // No conversion endpoint calls
    const conversionCalls = payloads.filter(p => p.url && p.url.includes('/api/conversion'))
    assert.strictEqual(conversionCalls.length, 0)
  })

  // ── 16. Safe short ref value IS passed ────────────────────────────────────
  await t.test('16. Safe short ref value is appended', () => {
    const { triggerMousedown } = runTrackerInVm(trackerCode, {
      search: '?ref=newsletter'
    })
    const result = triggerMousedown('https://calendly.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.get('ref'), 'newsletter')
  })
})

test('Booking UTM Passthrough — tracker.cookieless.js', async (t) => {
  // ── CL-1. Calendly passthrough works in cookieless tracker ────────────────
  await t.test('CL-1. Cookieless tracker: Calendly link gets UTM params appended', () => {
    const { triggerMousedown } = runTrackerInVm(cookielessCode, {
      search: '?utm_source=google&utm_campaign=cl-campaign'
    })
    const result = triggerMousedown('https://calendly.com/user/30min')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.get('utm_source'), 'google')
    assert.strictEqual(u.searchParams.get('utm_campaign'), 'cl-campaign')
  })

  // ── CL-2. Non-booking link is not mutated in cookieless ───────────────────
  await t.test('CL-2. Cookieless tracker: non-booking link not mutated', () => {
    const { triggerMousedown } = runTrackerInVm(cookielessCode, {
      search: '?utm_source=google'
    })
    const original = 'https://other-site.com/page'
    const result = triggerMousedown(original)
    assert.strictEqual(result, original)
  })

  // ── CL-3. Excluded path suppresses mutation in cookieless ─────────────────
  await t.test('CL-3. Cookieless tracker: excluded path prevents booking URL mutation', () => {
    const { triggerMousedown } = runTrackerInVm(cookielessCode, {
      search: '?utm_source=google',
      pathname: '/admin',
      excludePath: '/admin'
    })
    const original = 'https://calendly.com/user/30min'
    const result = triggerMousedown(original)
    // On excluded path, mutation must not happen
    assert.strictEqual(result, original)
  })

  // ── CL-4. Cal.com gets params in cookieless ────────────────────────────────
  await t.test('CL-4. Cookieless tracker: Cal.com gets UTM params appended', () => {
    const { triggerMousedown } = runTrackerInVm(cookielessCode, {
      search: '?utm_source=email&utm_medium=newsletter'
    })
    const result = triggerMousedown('https://cal.com/team/discovery')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.get('utm_source'), 'email')
    assert.strictEqual(u.hostname, 'cal.com')
  })

  // ── CL-5. Email not leaked in cookieless ──────────────────────────────────
  await t.test('CL-5. Cookieless tracker: email not forwarded to booking URL', () => {
    const { triggerMousedown } = runTrackerInVm(cookielessCode, {
      search: '?utm_source=google'
    })
    const result = triggerMousedown('https://cal.com/team/intro')
    const u = new URL(result)
    assert.strictEqual(u.searchParams.has('email'), false)
    assert.strictEqual(u.searchParams.has('name'), false)
    assert.strictEqual(u.searchParams.has('phone'), false)
  })
})
