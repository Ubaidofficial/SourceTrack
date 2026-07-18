import test from 'node:test'
import assert from 'node:assert'

// Set mock environment variables before importing any modules that use them
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

// Use dynamic imports to ensure env vars are set before top-level initializations run
const { isLeadForm } = await import('../routes/track.js')
const { getDedupeKey, checkIsDuplicate, registerConversion, shortWindowCache } = await import('../lib/shared-dedupe-cache.js')

test('1. Lead Form Classification (isLeadForm)', async (t) => {
  await t.test('rejects login / auth forms', () => {
    assert.strictEqual(isLeadForm({ form_id: 'login-form', page_path: '/' }), false)
    assert.strictEqual(isLeadForm({ form_name: 'signin-widget', page_path: '/' }), false)
    assert.strictEqual(isLeadForm({ form_action_path: '/auth/signin', page_path: '/' }), false)
  })

  await t.test('rejects internal app / dashboard forms', () => {
    assert.strictEqual(isLeadForm({ form_id: 'signup', page_path: '/app/signup' }), false)
    assert.strictEqual(isLeadForm({ form_id: 'profile', page_path: '/dashboard/user' }), false)
    assert.strictEqual(isLeadForm({ form_id: 'settings', page_path: '/admin/settings' }), false)
  })

  await t.test('rejects search and filter forms', () => {
    assert.strictEqual(isLeadForm({ form_id: 'search-form', page_path: '/' }), false)
    assert.strictEqual(isLeadForm({ form_name: 'filter-results', page_path: '/' }), false)
  })

  await t.test('rejects newsletter-only subscribe forms', () => {
    assert.strictEqual(isLeadForm({ form_id: 'newsletter-signup', page_path: '/' }), false)
    assert.strictEqual(isLeadForm({ form_name: 'subscribe-btn', page_path: '/' }), false)
  })

  await t.test('accepts public lead forms with positive keywords', () => {
    assert.strictEqual(isLeadForm({ form_id: 'contact-form', page_path: '/' }), true)
    assert.strictEqual(isLeadForm({ form_id: 'demo-booking', page_path: '/' }), true)
    assert.strictEqual(isLeadForm({ form_id: 'get-quote', page_path: '/' }), true)
    assert.strictEqual(isLeadForm({ form_id: 'pricing-inquiry', page_path: '/' }), true)
  })

  await t.test('accepts public signup/register/waitlist forms', () => {
    assert.strictEqual(isLeadForm({ form_id: 'trial-signup', page_path: '/signup' }), true)
    assert.strictEqual(isLeadForm({ form_name: 'waitlist-form', page_path: '/' }), true)
    assert.strictEqual(isLeadForm({ form_action_path: '/register', page_path: '/' }), true)
  })

  await t.test('accepts ambiguous public forms by default', () => {
    assert.strictEqual(isLeadForm({ form_id: 'inquire', page_path: '/about-us' }), true)
  })
})

test('2. Shared Dedupe Cache Keys & Normalization', async (t) => {
  await t.test('normalizes keys by stripping query parameters and hashes', () => {
    const key1 = getDedupeKey(101, 'anon-123', 'https://example.com/contact?utm_source=google&gclid=1#section-2')
    const key2 = getDedupeKey(101, 'anon-123', 'https://example.com/contact')
    assert.strictEqual(key1, '101:anon-123:https://example.com/contact')
    assert.strictEqual(key1, key2)
  })
})

test('3. Cross-Deduplication Logic', async (t) => {
  t.beforeEach(() => {
    shortWindowCache.flushAll()
  })

  await t.test('auto-promoted conversion is suppressed if any conversion exists', () => {
    const siteId = 101
    const anonymousId = 'anon-123'
    const pageUrl = 'https://example.com/contact'

    // First register an explicit conversion
    registerConversion(siteId, anonymousId, pageUrl, true, 'purchase', 100, true)

    // Check if auto-promoted form conversion (implicit) is a duplicate
    const isDup = checkIsDuplicate(siteId, anonymousId, pageUrl, false, 'form', 0, false)
    assert.strictEqual(isDup, true)
  })

  await t.test('rich explicit conversion is NOT suppressed by nearby form conversion', () => {
    const siteId = 101
    const anonymousId = 'anon-123'
    const pageUrl = 'https://example.com/contact'

    // First register an auto-promoted form conversion
    registerConversion(siteId, anonymousId, pageUrl, false, 'form', 0, false)

    // Check if rich explicit conversion is duplicate (has order_id)
    const isDupOrder = checkIsDuplicate(siteId, anonymousId, pageUrl, true, 'form', 0, true)
    assert.strictEqual(isDupOrder, false)

    // Check if rich explicit conversion is duplicate (has positive value)
    const isDupVal = checkIsDuplicate(siteId, anonymousId, pageUrl, true, 'form', 10, false)
    assert.strictEqual(isDupVal, false)

    // Check if rich explicit conversion is duplicate (has specific non-form type)
    const isDupType = checkIsDuplicate(siteId, anonymousId, pageUrl, true, 'purchase', 0, false)
    assert.strictEqual(isDupType, false)
  })

  await t.test('generic explicit conversion is suppressed by nearby form conversion', () => {
    const siteId = 101
    const anonymousId = 'anon-123'
    const pageUrl = 'https://example.com/contact'

    // First register an auto-promoted form conversion
    registerConversion(siteId, anonymousId, pageUrl, false, 'form', 0, false)

    // Check if generic explicit conversion (type 'form' or empty, no order_id, no value) is duplicate
    const isDupGeneric = checkIsDuplicate(siteId, anonymousId, pageUrl, true, 'form', 0, false)
    assert.strictEqual(isDupGeneric, true)
  })
})

test('4. Route-Level Ingestion & Promotion Integration Tests', async (t) => {
  const { track } = await import('../routes/track.js')
  // D3: PostHog is decommissioned — the route is Tinybird-sole (dualWriteEvent). This test asserts
  // the promotion behavior (a lead form_submit promotes to a $conversion event) on the DUAL-WRITE
  // output, not the removed ph.capture. Events map to normalized lines keyed by event_type.
  const { setDualWriteTransport, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')
  const { gunzipSync } = await import('node:zlib')

  const siteMock = {
    id: 101,
    site_key: 'sk-test',
    excluded_paths: null,
    custom_url_params: null
  }

  let payloads = []
  const prevFlag = process.env.TINYBIRD_DUAL_WRITE
  process.env.TINYBIRD_DUAL_WRITE = 'true'
  setDualWriteTransport(async (p) => { payloads.push(p) }, { flushAt: 1000, flushInterval: 0 })

  // Drive track() and return the normalized dual-write lines it emitted (gzipped ndjson).
  async function drive (reqMock, resMock) {
    payloads = []
    await track(reqMock, resMock)
    const b = __getDualWriteBatcher(); if (b) await b.flush()
    return payloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)))
  }

  t.beforeEach(() => {
    shortWindowCache.flushAll()
  })

  t.after(() => {
    setDualWriteTransport(null)
    if (prevFlag === undefined) delete process.env.TINYBIRD_DUAL_WRITE
    else process.env.TINYBIRD_DUAL_WRITE = prevFlag
  })

  await t.test('eligible public lead form_submit emits $conversion with conversion_type="form"', async () => {
    const reqMock = {
      headers: { 'user-agent': 'Mozilla/5.0' },
      site: siteMock,
      body: {
        event: 'form_submit',
        anonymous_id: 'anon-123',
        page_url: 'https://example.com/contact',
        properties: {
          form_provider: 'webflow',
          form_id: 'contact-us-form',
          form_name: 'ContactForm',
          page_path: '/contact'
        }
      }
    }

    const resMock = {
      status: (code) => {
        assert.strictEqual(code, 200)
        return {
          json: (data) => assert.strictEqual(data.success, true)
        }
      }
    }

    const lines = await drive(reqMock, resMock)

    // Two events dual-written: standard 'form_submit' and promoted '$conversion'
    assert.strictEqual(lines.length, 2)
    assert.strictEqual(lines[0].event_type, 'form_submit')
    assert.strictEqual(lines[1].event_type, '$conversion')
    // The adapter flattens the event bag to top-level typed columns (no nested `properties`).
    assert.strictEqual(lines[1].conversion_type, 'form')
    assert.strictEqual(lines[1].is_conversion, true)
  })

  await t.test('ignore_conversion=true prevents $conversion promotion', async () => {
    const reqMock = {
      headers: { 'user-agent': 'Mozilla/5.0' },
      site: siteMock,
      body: {
        event: 'form_submit',
        anonymous_id: 'anon-123',
        page_url: 'https://example.com/contact',
        properties: {
          form_provider: 'webflow',
          form_id: 'contact-us-form',
          form_name: 'ContactForm',
          page_path: '/contact',
          ignore_conversion: true
        }
      }
    }

    const resMock = {
      status: (code) => {
        assert.strictEqual(code, 200)
        return {
          json: (data) => assert.strictEqual(data.success, true)
        }
      }
    }

    const lines = await drive(reqMock, resMock)

    // Only 1 event dual-written: standard 'form_submit' (promotion skipped)
    assert.strictEqual(lines.length, 1)
    assert.strictEqual(lines[0].event_type, 'form_submit')
  })

  await t.test('excluded forms (e.g. search, login, newsletter) do not emit $conversion', async () => {
    const runExcludeTest = async (form_id, page_path) => {
      const reqMock = {
        headers: { 'user-agent': 'Mozilla/5.0' },
        site: siteMock,
        body: {
          event: 'form_submit',
          anonymous_id: 'anon-123',
          page_url: 'https://example.com' + page_path,
          properties: {
            form_provider: 'webflow',
            form_id,
            page_path
          }
        }
      }

      const resMock = {
        status: (code) => {
          assert.strictEqual(code, 200)
          return {
            json: (data) => assert.strictEqual(data.success, true)
          }
        }
      }

      const lines = await drive(reqMock, resMock)
      // Only 1 event dual-written (standard 'form_submit')
      assert.strictEqual(lines.length, 1)
      assert.strictEqual(lines[0].event_type, 'form_submit')
    }

    // 1. Search form
    await runExcludeTest('search-input-field', '/search')
    // 2. Login form
    await runExcludeTest('login-submit-btn', '/signin')
    // 3. Newsletter subscribe
    await runExcludeTest('subscribe-form', '/blog')
    // 4. Internal app page
    await runExcludeTest('settings-form', '/app/dashboard')
  })
})
