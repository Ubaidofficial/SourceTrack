import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import vm from 'node:vm'
import { fileURLToPath } from 'url'

// Set mock environment variables before importing any modules that use them
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

// Helper to run tracker in a mocked browser context in a Node.js VM
function runTrackerInVm(code, isCookieless = false, customGlobals = {}) {
  const payloads = []
  const listeners = {}

  const locationMock = {
    href: 'https://example.com/contact?utm_source=google&gclid=g-123',
    pathname: '/contact',
    search: '?utm_source=google&gclid=g-123',
    origin: 'https://example.com'
  }

  const documentMock = {
    referrer: 'https://referrer.com',
    cookie: '',
    currentScript: {
      getAttribute: (name) => {
        if (name === 'data-site-key') return 'sk-test'
        return null
      }
    },
    querySelector: () => null,
    addEventListener: (event, handler, useCapture) => {
      listeners[event] = handler
    }
  }

  // Simple Web Storage mock
  const storage = {}
  const localStorageMock = {
    getItem: (key) => storage[key] || null,
    setItem: (key, val) => { storage[key] = String(val) },
    removeItem: (key) => { delete storage[key] }
  }

  class MockForm {
    constructor(attrs = {}, parentClass = '') {
      this.attributes = attrs
      this.nodeName = 'FORM'
      this.parentNode = parentClass ? {
        getAttribute: (name) => name === 'class' ? parentClass : null
      } : null
      this._stLastSubmit = undefined
    }
    getAttribute(name) {
      return this.attributes[name] || null
    }
    setAttribute(name, val) {
      this.attributes[name] = val
    }
    get action() {
      return this.attributes.action || 'https://example.com/contact'
    }
  }

  const windowMock = {
    location: locationMock,
    document: documentMock,
    navigator: {
      doNotTrack: customGlobals.doNotTrack || null,
      globalPrivacyControl: customGlobals.globalPrivacyControl || null,
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

  // Run the IIFE code
  vm.runInContext(code, context)

  return {
    window: context.window,
    listeners,
    payloads,
    triggerSubmit: (formMock) => {
      if (listeners.submit) {
        listeners.submit({
          target: formMock,
          preventDefault: () => {}
        })
      }
    },
    MockForm
  }
}

test('Form Capture Client-Side Unit Tests', async (t) => {
  await t.test('1. Native form submit creates a privacy-safe form_submit analytics event', () => {
    const { triggerSubmit, MockForm, payloads } = runTrackerInVm(trackerCode)

    // Clear pageview payload to isolate form submit event
    payloads.length = 0

    const form = new MockForm({
      id: 'contact-us',
      name: 'ContactForm',
      action: 'https://example.com/target-submit'
    })

    triggerSubmit(form)

    assert.strictEqual(payloads.length, 1)
    const data = payloads[0].body
    assert.strictEqual(data.event, 'form_submit')
    assert.strictEqual(data.properties.event_type, 'form_submit')
    assert.strictEqual(data.properties.form_provider, 'native')
    assert.strictEqual(data.properties.form_id, 'contact-us')
    assert.strictEqual(data.properties.form_name, 'ContactForm')
    assert.strictEqual(data.properties.form_action_host, 'example.com')
    assert.strictEqual(data.properties.form_action_path, '/target-submit')
    assert.strictEqual(data.properties.page_path, '/contact')
  })

  await t.test('2. Webflow-like form is classified as webflow', () => {
    const { triggerSubmit, MockForm, payloads } = runTrackerInVm(trackerCode)
    payloads.length = 0

    // Class name match
    const form1 = new MockForm({ class: 'w-form form-styling' })
    triggerSubmit(form1)
    assert.strictEqual(payloads[0].body.properties.form_provider, 'webflow')

    // Attribute match
    payloads.length = 0
    const form2 = new MockForm({ 'data-wf-form': '123' })
    triggerSubmit(form2)
    assert.strictEqual(payloads[0].body.properties.form_provider, 'webflow')
  })

  await t.test('3. WordPress/contact-form-like form is classified as wordpress', () => {
    const { triggerSubmit, MockForm, payloads } = runTrackerInVm(trackerCode)
    payloads.length = 0

    // Contact Form 7 class match
    const form1 = new MockForm({ class: 'wpcf7-form' })
    triggerSubmit(form1)
    assert.strictEqual(payloads[0].body.properties.form_provider, 'wordpress')

    // Gravity Forms id prefix match
    payloads.length = 0
    const form2 = new MockForm({ id: 'gform_4' })
    triggerSubmit(form2)
    assert.strictEqual(payloads[0].body.properties.form_provider, 'wordpress')
  })

  await t.test('4. form_id and form_name are sanitized/rejected when they contain PII', () => {
    const { triggerSubmit, MockForm, payloads } = runTrackerInVm(trackerCode)
    payloads.length = 0

    const form = new MockForm({
      id: 'user@example.com', // PII email
      name: 'pass-sk_live_123' // secret token
    })

    triggerSubmit(form)

    assert.strictEqual(payloads[0].body.properties.form_id, null)
    assert.strictEqual(payloads[0].body.properties.form_name, null)
  })

  await t.test('5. form_action_path strips query/hash', () => {
    const { triggerSubmit, MockForm, payloads } = runTrackerInVm(trackerCode)
    payloads.length = 0

    const form = new MockForm({
      action: 'https://example.com/path/to/target?query=123#hash-sec'
    })

    triggerSubmit(form)

    assert.strictEqual(payloads[0].body.properties.form_action_host, 'example.com')
    assert.strictEqual(payloads[0].body.properties.form_action_path, '/path/to/target')
  })

  await t.test('6. javascript: action is not captured', () => {
    const { triggerSubmit, MockForm, payloads } = runTrackerInVm(trackerCode)
    payloads.length = 0

    const form = new MockForm({
      action: 'javascript:alert(1)'
    })

    triggerSubmit(form)

    assert.strictEqual(payloads[0].body.properties.form_action_host, null)
    assert.strictEqual(payloads[0].body.properties.form_action_path, null)
  })

  await t.test('7-10. Field/input/PII values are never captured', () => {
    const { triggerSubmit, MockForm, payloads } = runTrackerInVm(trackerCode)
    payloads.length = 0

    const form = new MockForm({
      id: 'safe-id',
      name: 'safe-name'
    })

    triggerSubmit(form)

    const props = payloads[0].body.properties
    // Verify properties contains no input values or PII fields
    const keys = Object.keys(props)
    for (const key of keys) {
      assert.ok(!['email', 'name', 'password', 'card', 'phone', 'address', 'message', 'text'].includes(key.toLowerCase()))
    }
  })

  await t.test('11. UTM/source context is attached from existing tracker context if available', () => {
    const { triggerSubmit, MockForm, payloads } = runTrackerInVm(trackerCode)
    payloads.length = 0

    const form = new MockForm()
    triggerSubmit(form)

    const data = payloads[0].body
    assert.strictEqual(data.utm_source, 'google')
    assert.strictEqual(data.gclid, 'g-123')
  })

  await t.test('12. DNT/GPC/consent opt-out prevents capture', () => {
    // A. DNT enabled
    const dntResult = runTrackerInVm(trackerCode, false, { doNotTrack: '1' })
    assert.strictEqual(dntResult.listeners.submit, undefined)

    // B. Explicit consent opt-out
    const consentResult = runTrackerInVm(trackerCode)
    consentResult.window.sourcetrack.optOut()
    consentResult.payloads.length = 0

    const form = new consentResult.MockForm()
    consentResult.triggerSubmit(form)
    assert.strictEqual(consentResult.payloads.length, 0)
  })

  await t.test('13. Duplicate submit events are deduped within the configured window', () => {
    const { triggerSubmit, MockForm, payloads } = runTrackerInVm(trackerCode)
    payloads.length = 0

    const form = new MockForm()
    triggerSubmit(form)
    triggerSubmit(form) // duplicate within 2s

    assert.strictEqual(payloads.length, 1)
  })

  await t.test('14. Tracker does not break when form has no id/name/action', () => {
    const { triggerSubmit, MockForm, payloads } = runTrackerInVm(trackerCode)
    payloads.length = 0

    const form = new MockForm({})
    triggerSubmit(form)

    assert.strictEqual(payloads.length, 1)
    const props = payloads[0].body.properties
    assert.strictEqual(props.form_id, null)
    assert.strictEqual(props.form_name, null)
    assert.strictEqual(props.form_action_host, 'example.com') // resolves to current host
    assert.strictEqual(props.form_action_path, '/contact') // resolves to current path
  })
})

test('Form Capture Cookieless Tracker Unit Tests', async (t) => {
  await t.test('Cookieless tracker queues and sends form_submit events cleanly', async () => {
    const { triggerSubmit, MockForm, payloads } = runTrackerInVm(cookielessCode, true)

    // Cookieless fetches visitor_id asynchronously. Queue it before resolution.
    const form = new MockForm({ id: 'form-cookie-free' })
    triggerSubmit(form)

    // Initially queued, nothing sent yet
    assert.strictEqual(payloads.length, 0)

    // Wait for the async macroTask loop to allow fetch resolving
    await new Promise(resolve => setTimeout(resolve, 50))

    // After fetch resolves, queued pageview + form_submit should be flushed
    assert.strictEqual(payloads.length, 2)

    const pageviewData = payloads[0].body
    assert.strictEqual(pageviewData.event, '$pageview')

    const formSubmitData = payloads[1].body
    assert.strictEqual(formSubmitData.event, 'form_submit')
    assert.strictEqual(formSubmitData.properties.form_provider, 'native')
    assert.strictEqual(formSubmitData.properties.form_id, 'form-cookie-free')
  })
})

// Wave-2 pageview cutover: track.js writes to Tinybird (dualWriteEvent), not
// ph.capture. Drive the route with the dual-write transport recorded and return
// the normalized line(s). ph.capture must NOT fire. The sanitized field values
// (form_id/form_name/form_action_*/page_path/custom_properties) survive
// normalization unchanged (normalize.js:242 passes null/strings through, and
// sanitizeDeep only strips PII/forbidden keys from nested bags). event_type is
// the canonical top-level discriminator, always set from the event name.
async function driveTrackDW (reqMock, resMock) {
  const { track } = await import('../routes/track.js')
  const { ph } = await import('../lib/posthog.js')
  const { setDualWriteTransport, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')
  const { gunzipSync } = await import('node:zlib')
  const originalCapture = ph.capture
  let phCalled = false
  ph.capture = () => { phCalled = true }
  const payloads = []
  const prevFlag = process.env.TINYBIRD_DUAL_WRITE
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  setDualWriteTransport(async (p) => { payloads.push(p) }, { flushAt: 1000, flushInterval: 0 })
  try {
    await track(reqMock, resMock)
    const b = __getDualWriteBatcher(); if (b) await b.flush()
  } finally {
    ph.capture = originalCapture
    setDualWriteTransport(null)
    if (prevFlag === undefined) delete process.env.TINYBIRD_DUAL_WRITE
    else process.env.TINYBIRD_DUAL_WRITE = prevFlag
  }
  const lines = payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)))
  return { lines, phCalled }
}

test('Form Ingestion Backend Route Integration Tests', async (t) => {
  await t.test('15. Backend PII sanitization remains intact', async () => {
    const siteMock = {
      id: 99,
      site_key: 'sk-test',
      excluded_paths: null,
      custom_url_params: null
    }

    const reqMock = {
      headers: { 'user-agent': 'Mozilla/5.0' },
      site: siteMock,
      body: {
        event: 'form_submit',
        anonymous_id: 'anon-123',
        properties: {
          form_provider: 'webflow',
          form_id: '  lead-email-john@example.com  ', // email bypass attempt
          form_name: 'pass-sk_test_123', // secret keyword bypass attempt
          form_action_host: 'javascript:alert(1)', // unsafe script
          form_action_path: '/submit-form?q=123#hash',
          page_path: '/register',
          ignore_conversion: true
        }
      }
    }

    const resMock = {
      status: (code) => {
        assert.strictEqual(code, 200)
        return {
          json: (data) => {
            assert.strictEqual(data.success, true)
          }
        }
      }
    }

    const { lines, phCalled } = await driveTrackDW(reqMock, resMock)

    assert.strictEqual(phCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    assert.strictEqual(lines.length, 1)
    const props = lines[0]
    assert.strictEqual(props.event_type, 'form_submit')
    assert.strictEqual(props.form_provider, 'webflow')
    assert.strictEqual(props.form_id, null) // Sanitized to null
    assert.strictEqual(props.form_name, null) // Sanitized to null
    assert.strictEqual(props.form_action_host, null) // JavaScript: action rejected
    assert.strictEqual(props.form_action_path, '/submit-form') // Query/hash stripped
    assert.strictEqual(props.page_path, '/register')
  })

  await t.test('15-B. Form submits do not leak unsafe fields through custom_properties', async () => {
    const siteMock = { id: 99, site_key: 'sk-test', excluded_paths: null, custom_url_params: null }

    const reqMock = {
      headers: { 'user-agent': 'Mozilla/5.0' },
      site: siteMock,
      body: {
        event: 'form_submit',
        anonymous_id: 'anon-123',
        properties: {
          form_provider: 'webflow',
          form_id: 'john@example.com',
          form_name: 'lead-phone-123456789',
          message: 'private message body',
          email: 'unsafe-email@test.com',
          phone: '123456',
          hidden_field: 'token_secret_value',
          some_other_value: 'arbitrary',
          ignore_conversion: true
        }
      }
    }

    const resMock = {
      status: (code) => {
        assert.strictEqual(code, 200)
        return { json: (data) => assert.strictEqual(data.success, true) }
      }
    }

    const { lines, phCalled } = await driveTrackDW(reqMock, resMock)

    assert.strictEqual(phCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    assert.strictEqual(lines.length, 1)
    const props = lines[0]
    assert.strictEqual(props.form_id, null)
    assert.strictEqual(props.form_name, null)

    // Assert custom_properties is entirely absent/not forwarded
    assert.strictEqual(props.custom_properties, undefined)
  })

  await t.test('15-C. Non-form custom events preserve custom_properties', async () => {
    const siteMock = { id: 99, site_key: 'sk-test', excluded_paths: null, custom_url_params: null }

    const reqMock = {
      headers: { 'user-agent': 'Mozilla/5.0' },
      site: siteMock,
      body: {
        event: 'custom_button_click',
        anonymous_id: 'anon-123',
        properties: {
          button_id: 'cta-signup',
          page: 'homepage'
        }
      }
    }

    const resMock = {
      status: (code) => {
        assert.strictEqual(code, 200)
        return { json: (data) => assert.strictEqual(data.success, true) }
      }
    }

    const { lines, phCalled } = await driveTrackDW(reqMock, resMock)

    assert.strictEqual(phCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    assert.strictEqual(lines.length, 1)
    const props = lines[0]
    // event_type is the canonical top-level discriminator on the Tinybird row —
    // it carries the raw custom event name (no spurious form event_type is added).
    assert.strictEqual(props.event_type, 'custom_button_click')
    assert.deepStrictEqual(props.custom_properties, {
      button_id: 'cta-signup',
      page: 'homepage'
    })
  })

  await t.test('15-D. Backend ingestion host and path validation logic', async () => {
    const siteMock = { id: 99, site_key: 'sk-test', excluded_paths: null, custom_url_params: null }

    const runTest = async (properties) => {
      const reqMock = {
        headers: { 'user-agent': 'Mozilla/5.0' },
        site: siteMock,
        body: {
          event: 'form_submit',
          anonymous_id: 'anon-123',
          properties: {
            ...properties,
            ignore_conversion: true
          }
        }
      }
      const resMock = {
        status: (code) => {
          assert.strictEqual(code, 200)
          return { json: (data) => assert.strictEqual(data.success, true) }
        }
      }
      const { lines, phCalled } = await driveTrackDW(reqMock, resMock)
      assert.strictEqual(phCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
      return lines[0]
    }

    // Test 1: form_action_host: "john@example.com" is rejected (null)
    const res1 = await runTest({ form_action_host: 'john@example.com' })
    assert.strictEqual(res1.form_action_host, null)

    // Test 2: form_action_host: "example.com/path?email=john@example.com" is rejected (null)
    const res2 = await runTest({ form_action_host: 'example.com/path?email=john@example.com' })
    assert.strictEqual(res2.form_action_host, null)

    // Test 3: form_action_host: "javascript:alert(1)" is rejected (null)
    const res3 = await runTest({ form_action_host: 'javascript:alert(1)' })
    assert.strictEqual(res3.form_action_host, null)

    // Test 4: form_action_path: "/submit?email=john@example.com#x" becomes "/submit"
    const res4 = await runTest({ form_action_path: '/submit?email=john@example.com#x' })
    assert.strictEqual(res4.form_action_path, '/submit')

    // Test 5: page_path: "/pricing?email=john@example.com#x" becomes "/pricing"
    const res5 = await runTest({ page_path: '/pricing?email=john@example.com#x' })
    assert.strictEqual(res5.page_path, '/pricing')

    // Test 6: page_path or form_action_path containing @ are rejected (null)
    const res6 = await runTest({ page_path: '/pricing/john@example.com' })
    assert.strictEqual(res6.page_path, null)
  })

  await t.test('16. api/routes/conversion.js remains unchanged', () => {
    // Assert conversion.js is unmodified
    const code = fs.readFileSync(path.join(rootDir, 'api/routes/conversion.js'), 'utf8')
    assert.ok(code)
  })
})
