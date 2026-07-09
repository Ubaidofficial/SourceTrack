import test from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Set mock environment variables before importing any modules that use them
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test('PII Sanitization Hardening Test Suite', async (t) => {
  // Dynamically import to ensure process.env variables are initialized first
  const { redactPiiFromUrl, redactPiiFromObject } = await import('../lib/utils.js')
  const { ph } = await import('../lib/posthog.js')
  const { getSupabase } = await import('../lib/supabase.js')
  // Wave-2 pageview cutover: the proxy /sp/e, /sp/c and /api/track producers write
  // to Tinybird via dualWriteEvent (ph.capture removed). Those tests inspect the
  // normalized dual-write line via dwLine() instead of lastCaptureArgs. The adapter
  // DROPS PII keys (email/phone/name) — asserted absent — while sanitized survivors
  // (page_url/referrer/utm_*/ai_source) carry through with their redacted value.
  // NOTE: webhook-incoming, analytics/collect and identify tests below are NOT part
  // of this wave — their routes still call ph.capture, so they keep asserting it.
  const { setDualWriteTransport, __getDualWriteBatcher } = await import('../../tinybird/adapter/dual-write.js')
  const { gunzipSync } = await import('node:zlib')
  let dwPayloads = []
  const dwLine = async () => {
    const b = __getDualWriteBatcher(); if (b) await b.flush()
    const lines = dwPayloads.flatMap(p => gunzipSync(p).toString('utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)))
    return lines[lines.length - 1] || {}
  }

  // --- URL Sanitization Tests ---
  await t.test('redactPiiFromUrl redacts email query param', () => {
    const url = 'https://example.com/path?email=test@example.com&e-mail=user@test.com&other=123'
    const res = redactPiiFromUrl(url)
    assert.ok(res.includes('email=%5BREDACTED%5D'))
    assert.ok(res.includes('e-mail=%5BREDACTED%5D'))
    assert.ok(res.includes('other=123'))
  })

  await t.test('redactPiiFromUrl redacts phone/token/password query params', () => {
    const url = 'https://example.com/path?phone=%2B123456&token=secret123&password=pass'
    const res = redactPiiFromUrl(url)
    assert.ok(res.includes('phone=%5BREDACTED%5D'))
    assert.ok(res.includes('token=%5BREDACTED%5D'))
    assert.ok(res.includes('password=%5BREDACTED%5D'))
  })

  await t.test('redactPiiFromUrl redacts session_id query param', () => {
    const url = 'https://example.com/path?session_id=sess_abc123'
    const res = redactPiiFromUrl(url)
    assert.ok(res.includes('session_id=%5BREDACTED%5D'))
  })

  await t.test('redactPiiFromUrl redacts key query param', () => {
    const url = 'https://example.com/path?key=apikey123'
    const res = redactPiiFromUrl(url)
    assert.ok(res.includes('key=%5BREDACTED%5D'))
  })

  await t.test('redactPiiFromUrl preserves UTM and click ID query params', () => {
    const url = 'https://example.com/path?utm_source=google&gclid=g-123&fbclid=fb-456'
    const res = redactPiiFromUrl(url)
    assert.ok(res.includes('utm_source=google'))
    assert.ok(res.includes('gclid=g-123'))
    assert.ok(res.includes('fbclid=fb-456'))
  })

  // --- Object Sanitization Tests ---
  await t.test('redactPiiFromObject redacts direct email field', () => {
    const input = { email: 'test@example.com', other: '123' }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.email, '[REDACTED]')
    assert.strictEqual(res.other, '123')
  })

  await t.test('redactPiiFromObject redacts nested properties.email field', () => {
    const input = { properties: { email: 'test@example.com' } }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.properties.email, '[REDACTED]')
  })

  await t.test('redactPiiFromObject redacts phone/password/token/secret/api_key fields', () => {
    const input = {
      phone: '1234',
      password: 'pwd',
      token: 'tok',
      secret: 'sec',
      api_key: 'key',
      billing_phone: '5678'
    }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.phone, '[REDACTED]')
    assert.strictEqual(res.password, '[REDACTED]')
    assert.strictEqual(res.token, '[REDACTED]')
    assert.strictEqual(res.secret, '[REDACTED]')
    assert.strictEqual(res.api_key, '[REDACTED]')
    assert.strictEqual(res.billing_phone, '[REDACTED]')
  })

  await t.test('redactPiiFromObject redacts checkout_session_id / stripe_session_id', () => {
    const input = {
      checkout_session_id: 'cs_123',
      stripe_session_id: 'ss_456',
      payment_session_id: 'ps_789'
    }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.checkout_session_id, '[REDACTED]')
    assert.strictEqual(res.stripe_session_id, '[REDACTED]')
    assert.strictEqual(res.payment_session_id, '[REDACTED]')
  })

  await t.test('redactPiiFromObject redacts direct name / first_name / last_name / full_name fields', () => {
    const input = {
      name: 'John',
      first_name: 'J',
      last_name: 'D',
      full_name: 'John Doe',
      customer_name: 'Cust',
      billing_name: 'Bill',
      shipping_name: 'Ship'
    }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.name, '[REDACTED]')
    assert.strictEqual(res.first_name, '[REDACTED]')
    assert.strictEqual(res.last_name, '[REDACTED]')
    assert.strictEqual(res.full_name, '[REDACTED]')
    assert.strictEqual(res.customer_name, '[REDACTED]')
    assert.strictEqual(res.billing_name, '[REDACTED]')
    assert.strictEqual(res.shipping_name, '[REDACTED]')
  })

  await t.test('redactPiiFromObject preserves direct session_id', () => {
    const input = { session_id: 'sess_123' }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.session_id, 'sess_123')
  })

  await t.test('redactPiiFromObject preserves direct generic key', () => {
    const input = { key: 'my-value' }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.key, 'my-value')
  })

  await t.test('redactPiiFromObject preserves UTM fields', () => {
    const input = {
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'campaign_name'
    }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.utm_source, 'google')
    assert.strictEqual(res.utm_medium, 'cpc')
    assert.strictEqual(res.utm_campaign, 'campaign_name')
  })

  await t.test('redactPiiFromObject preserves click IDs', () => {
    const input = {
      gclid: 'g-123',
      fbclid: 'fb-456',
      li_fat_id: 'li-789'
    }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.gclid, 'g-123')
    assert.strictEqual(res.fbclid, 'fb-456')
    assert.strictEqual(res.li_fat_id, 'li-789')
  })

  await t.test('redactPiiFromObject preserves order_id/value/currency/product metadata', () => {
    const input = {
      order_id: 'ord-123',
      value: 99.99,
      currency: 'USD',
      category: 'shoes'
    }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.order_id, 'ord-123')
    assert.strictEqual(res.value, 99.99)
    assert.strictEqual(res.currency, 'USD')
    assert.strictEqual(res.category, 'shoes')
  })

  await t.test('redactPiiFromObject preserves product_name', () => {
    const input = { product_name: 'Leather Jacket' }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.product_name, 'Leather Jacket')
  })

  await t.test('redactPiiFromObject redacts URL query PII inside page_url/referrer/current_url', () => {
    const input = {
      page_url: 'https://example.com?email=test@example.com&utm_source=google',
      referrer: 'https://referrer.com?phone=%2B123&gclid=abc',
      current_url: 'https://current.com?session_id=123'
    }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.page_url, 'https://example.com/?email=%5BREDACTED%5D&utm_source=google')
    assert.strictEqual(res.referrer, 'https://referrer.com/?phone=%5BREDACTED%5D&gclid=abc')
    assert.strictEqual(res.current_url, 'https://current.com/?session_id=%5BREDACTED%5D')
  })

  // --- Router/Integration Tests ---
  const client = getSupabase()
  const originalFrom = client.from
  const originalRpc = client.rpc
  const originalCapture = ph.capture
  const originalAlias = ph.alias

  let captureCalled = false
  let aliasCalled = false
  let lastCaptureArgs = null
  let insertedPageviews = []
  let insertedCustomEvents = []
  let updatedSites = []
  let rpcCalls = []
  let identityLinkUpserts = []

  const setupMocks = () => {
    captureCalled = false
    aliasCalled = false
    lastCaptureArgs = null
    insertedPageviews = []
    insertedCustomEvents = []
    updatedSites = []
    rpcCalls = []
    identityLinkUpserts = []

    ph.capture = (args) => {
      captureCalled = true
      lastCaptureArgs = args
    }
    ph.alias = () => { aliasCalled = true }
    dwPayloads = []
    process.env.TINYBIRD_DUAL_WRITE = 'true'
    setDualWriteTransport(async (p) => { dwPayloads.push(p) }, { flushAt: 1000, flushInterval: 0 })

    client.rpc = async (fn, args) => {
      rpcCalls.push({ fn, args })
      if (fn === 'claim_site_pageview_usage' || fn === 'claim_site_conversion_usage') {
        return { data: [{ allowed: true, current_count: 1 }], error: null }
      }
      return { data: null, error: null }
    }

    client.from = (table) => {
      if (table === 'sites') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'site-123',
                  site_key: 'sk-test',
                  name: 'Test Site',
                  plan: 'free',
                  pv_limit: 5000,
                  trial_ends_at: null,
                  excluded_paths: [],
                  custom_url_params: []
                },
                error: null
              }),
              maybeSingle: async () => ({
                data: {
                  id: 'site-123',
                  site_key: 'sk-test',
                  name: 'Test Site',
                  plan: 'free',
                  pv_limit: 5000,
                  trial_ends_at: null,
                  excluded_paths: [],
                  custom_url_params: []
                },
                error: null
              })
            })
          }),
          update: (fields) => {
            updatedSites.push(fields)
            return { eq: () => Promise.resolve({ error: null }) }
          }
        }
      }
      if (table === 'pageviews') {
        return {
          insert: async (data) => {
            insertedPageviews.push(data)
            return { error: null }
          },
          update: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) })
        }
      }
      if (table === 'custom_events') {
        return {
          insert: async (data) => {
            insertedCustomEvents.push(data)
            return { error: null }
          }
        }
      }
      if (table === 'site_identity_links') {
        return {
          upsert: async (data) => {
            identityLinkUpserts.push(data)
            return { error: null }
          }
        }
      }
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) })
      }
    }
  }

  const restoreMocks = () => {
    ph.capture = originalCapture
    ph.alias = originalAlias
    setDualWriteTransport(null)
    delete process.env.TINYBIRD_DUAL_WRITE
    client.from = originalFrom
    client.rpc = originalRpc
  }

  const makeMockRes = () => {
    let statusCode = 200
    let jsonBody = null
    let ended = false
    const res = {
      get statusCode() { return statusCode },
      get json_body() { return jsonBody },
      get ended() { return ended },
      status: (code) => { statusCode = code; return res },
      json: (b) => { jsonBody = b; return res },
      set: () => res,
      end: () => { ended = true; return res }
    }
    return res
  }

  await t.test('/sp/e sends sanitized payload to ph.capture', async () => {
    setupMocks()
    const { default: proxyRouter } = await import('../routes/proxy.js')
    const layer = proxyRouter.stack.find(s => s.route?.path === '/e' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      body: {
        site_key: 'sk-test',
        event: 'custom_event',
        anonymous_id: 'anon-1',
        properties: {
          email: 'user@test.com',
          phone: '1234',
          name: 'Jane Doe',
          utm_source: 'google',
          page_url: 'https://example.com?phone=5678'
        }
      },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.ok(!('email' in capturedProps), 'email dropped from dual-write payload (adapter PII strip)')
    assert.ok(!('phone' in capturedProps), 'phone dropped from dual-write payload (adapter PII strip)')
    assert.ok(!('name' in capturedProps), 'name dropped from dual-write payload (adapter PII strip)')
    assert.strictEqual(capturedProps.page_url, 'https://example.com/?phone=%5BREDACTED%5D')
    restoreMocks()
  })

  await t.test('/sp/e preserves non-PII attribution fields', async () => {
    setupMocks()
    const { default: proxyRouter } = await import('../routes/proxy.js')
    const layer = proxyRouter.stack.find(s => s.route?.path === '/e' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      body: {
        site_key: 'sk-test',
        event: 'custom_event',
        anonymous_id: 'anon-1',
        properties: {
          utm_source: 'google',
          utm_medium: 'cpc',
          gclid: 'g-123'
        }
      },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.strictEqual(capturedProps.utm_source, 'google')
    assert.strictEqual(capturedProps.utm_medium, 'cpc')
    assert.strictEqual(capturedProps.gclid, 'g-123')
    restoreMocks()
  })

  await t.test('/sp/c sends sanitized conversion payload to ph.capture', async () => {
    setupMocks()
    const { default: proxyRouter } = await import('../routes/proxy.js')
    const layer = proxyRouter.stack.find(s => s.route?.path === '/c' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      body: {
        site_key: 'sk-test',
        anonymous_id: 'anon-1',
        conversion_value: 50.00,
        conversion_type: 'purchase',
        order_id: 'ORD-555',
        properties: {
          email: 'cust@domain.com',
          name: 'Bob',
          phone: '9999'
        }
      },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.ok(!('email' in capturedProps), 'email dropped from dual-write payload (adapter PII strip)')
    assert.ok(!('name' in capturedProps), 'name dropped from dual-write payload (adapter PII strip)')
    assert.ok(!('phone' in capturedProps), 'phone dropped from dual-write payload (adapter PII strip)')
    restoreMocks()
  })

  await t.test('/sp/c preserves conversion value/currency/order_id', async () => {
    setupMocks()
    const { default: proxyRouter } = await import('../routes/proxy.js')
    const layer = proxyRouter.stack.find(s => s.route?.path === '/c' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      body: {
        site_key: 'sk-test',
        anonymous_id: 'anon-1',
        conversion_value: 50.00,
        conversion_type: 'purchase',
        order_id: 'ORD-555',
        properties: {
          currency: 'EUR'
        }
      },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.strictEqual(capturedProps.conversion_value, 50.00)
    assert.strictEqual(capturedProps.conversion_type, 'purchase')
    assert.strictEqual(capturedProps.conversion_event_id, 'ORD-555')
    assert.strictEqual(capturedProps.currency, 'EUR')
    restoreMocks()
  })

  await t.test('standard /api/track still sanitizes URL query PII', async () => {
    setupMocks()
    const { track } = await import('../routes/track.js')
    const req = {
      body: {
        event: '$pageview',
        page_url: 'https://example.com?email=test@example.com',
        referrer: 'https://example.com?phone=123',
        anonymous_id: 'anon-1'
      },
      site: { id: 'site-123', plan: 'free', pv_limit: 5000, excluded_paths: [], custom_url_params: [] },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()
    await track(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.strictEqual(capturedProps.page_url, 'https://example.com/?email=%5BREDACTED%5D')
    assert.strictEqual(capturedProps.referrer, 'https://example.com/?phone=%5BREDACTED%5D')
    restoreMocks()
  })

  await t.test('standard /api/track now sanitizes direct object-level PII', async () => {
    setupMocks()
    const { track } = await import('../routes/track.js')
    const req = {
      body: {
        event: 'custom_event',
        anonymous_id: 'anon-1',
        properties: {
          email: 'test@example.com',
          phone: '123'
        }
      },
      site: { id: 'site-123', plan: 'free', pv_limit: 5000, excluded_paths: [], custom_url_params: [] },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()
    await track(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    // custom_properties is a nested bag — sanitizeDeep drops PII keys at every depth
    // (normalize.js:191), so email/phone never reach the Tinybird row at all.
    assert.ok(!('email' in (capturedProps.custom_properties || {})), 'nested email dropped from custom_properties')
    assert.ok(!('phone' in (capturedProps.custom_properties || {})), 'nested phone dropped from custom_properties')
    restoreMocks()
  })

  await t.test('webhook-incoming drops raw_payload + PII from the dual-write payload', async () => {
    setupMocks()
    const { default: webhookRouter } = await import('../routes/webhook-incoming.js')
    const layer = webhookRouter.stack.find(s => s.route?.path === '/:api_key' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      params: { api_key: 'apikey123' },
      body: {
        value: 120.00,
        email: 'user@webhook.com',
        phone: '123-456'
      },
      headers: { 'user-agent': 'WebhookTester' }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2b: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    // raw_payload is a FORBIDDEN key (normalize.js FORBIDDEN_KEYS) — the adapter drops
    // it entirely, so the redacted webhook body (and any PII embedded in it) never
    // reaches Tinybird. The webhook's top-level email/phone are likewise dropped.
    assert.ok(!('raw_payload' in capturedProps), 'raw_payload dropped by the adapter (forbidden key)')
    assert.ok(!('email' in capturedProps), 'email dropped from dual-write payload (adapter PII strip)')
    assert.ok(!('phone' in capturedProps), 'phone dropped from dual-write payload (adapter PII strip)')
    restoreMocks()
  })

  await t.test('webhook-incoming drops mapped customer name from the dual-write payload', async () => {
    setupMocks()
    const { default: webhookRouter } = await import('../routes/webhook-incoming.js')
    const layer = webhookRouter.stack.find(s => s.route?.path === '/:api_key' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      params: { api_key: 'apikey123' },
      body: {
        value: 120.00,
        name: 'Alice Cooper',
        email: 'alice@domain.com'
      },
      headers: { 'user-agent': 'WebhookTester' }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2b: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.ok(!('name' in capturedProps), 'name dropped from dual-write payload (adapter PII strip)')
    assert.ok(!('email' in capturedProps), 'email dropped from dual-write payload (adapter PII strip)')
    restoreMocks()
  })

  await t.test('webhook-incoming preserves conversion value/currency/order_id', async () => {
    setupMocks()
    const { default: webhookRouter } = await import('../routes/webhook-incoming.js')
    const layer = webhookRouter.stack.find(s => s.route?.path === '/:api_key' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      params: { api_key: 'apikey123' },
      body: {
        value: 120.00,
        currency: 'USD',
        order_id: 'ORD-777'
      },
      headers: { 'user-agent': 'WebhookTester' }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2b: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.strictEqual(capturedProps.conversion_value, 120.00)
    assert.strictEqual(capturedProps.conversion_event_id, 'ORD-777')
    restoreMocks()
  })

  await t.test('webhook-incoming raw_payload never reaches the dual-write payload (dropped)', async () => {
    setupMocks()
    const { default: webhookRouter } = await import('../routes/webhook-incoming.js')
    const layer = webhookRouter.stack.find(s => s.route?.path === '/:api_key' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const veryLongName = 'a'.repeat(600)
    const req = {
      params: { api_key: 'apikey123' },
      body: {
        value: 10.00,
        long_field: veryLongName
      },
      headers: { 'user-agent': 'WebhookTester' }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2b: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    // The route still truncates raw_payload to 500 chars before handing it off, but
    // the adapter drops the FORBIDDEN raw_payload key outright — so no raw webhook
    // body (truncated or not) ever lands in the Tinybird event.
    assert.ok(!('raw_payload' in capturedProps), 'raw_payload dropped by the adapter (forbidden key)')
    restoreMocks()
  })

  await t.test('legacy /api/analytics/collect redacts URL/referrer query PII before Supabase insert', async () => {
    setupMocks()
    const { default: analyticsRouter } = await import('../routes/analytics.js')
    const layer = analyticsRouter.stack.find(s => s.route?.path === '/collect' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      body: {
        site_key: 'sk-test',
        url: 'https://example.com?email=test@example.com',
        referrer: 'https://referrer.com?phone=%2B1234',
        duration_seconds: 0
      },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(insertedPageviews.length, 1)
    const pageview = insertedPageviews[0]
    assert.strictEqual(pageview.url, 'https://example.com/?email=%5BREDACTED%5D')
    assert.strictEqual(pageview.referrer, 'https://referrer.com/?phone=%5BREDACTED%5D')
    restoreMocks()
  })

  await t.test('redactPiiFromObject does not return original nested object past depth limit', () => {
    const nested = {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                level6: {
                  email: 'dangerous@leak.com'
                }
              }
            }
          }
        }
      }
    }
    const res = redactPiiFromObject(nested)
    assert.strictEqual(res.level1.level2.level3.level4.level5.level6, '[REDACTED]')
  })

  await t.test('/sp/e redacts PII from properties.referrer before ph.capture', async () => {
    setupMocks()
    const { default: proxyRouter } = await import('../routes/proxy.js')
    const layer = proxyRouter.stack.find(s => s.route?.path === '/e' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      body: {
        site_key: 'sk-test',
        event: '$pageview',
        anonymous_id: 'anon-1',
        properties: {
          referrer: 'https://example.com?email=test@example.com'
        }
      },
      headers: {}
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.strictEqual(capturedProps.referrer, 'https://example.com/?email=%5BREDACTED%5D')
    restoreMocks()
  })

  await t.test('/sp/e redacts PII from req.headers.referer before ph.capture', async () => {
    setupMocks()
    const { default: proxyRouter } = await import('../routes/proxy.js')
    const layer = proxyRouter.stack.find(s => s.route?.path === '/e' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      body: {
        site_key: 'sk-test',
        event: '$pageview',
        anonymous_id: 'anon-1',
        properties: {}
      },
      headers: {
        referer: 'https://example.com?phone=%2B12345'
      }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.strictEqual(capturedProps.referrer, 'https://example.com/?phone=%5BREDACTED%5D')
    restoreMocks()
  })

  await t.test('/sp/e does not reintroduce unsanitized referrer after spreading sanitizedProperties', async () => {
    setupMocks()
    const { default: proxyRouter } = await import('../routes/proxy.js')
    const layer = proxyRouter.stack.find(s => s.route?.path === '/e' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      body: {
        site_key: 'sk-test',
        event: '$pageview',
        anonymous_id: 'anon-1',
        properties: {
          referrer: 'https://example.com?email=leak@leak.com'
        }
      },
      headers: {
        referer: 'https://example.com?email=otherleak@leak.com'
      }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.strictEqual(capturedProps.referrer, 'https://example.com/?email=%5BREDACTED%5D')
    restoreMocks()
  })

  await t.test('/sp/c redacts PII from properties.referrer / headers before ph.capture', async () => {
    setupMocks()
    const { default: proxyRouter } = await import('../routes/proxy.js')
    const layer = proxyRouter.stack.find(s => s.route?.path === '/c' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      body: {
        site_key: 'sk-test',
        anonymous_id: 'anon-1',
        conversion_value: 50.00,
        conversion_type: 'purchase',
        order_id: 'ORD-555',
        properties: {
          referrer: 'https://example.com?email=leak@leak.com'
        }
      },
      headers: {
        referer: 'https://example.com?phone=%2B999'
      }
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.strictEqual(capturedProps.referrer, 'https://example.com/?email=%5BREDACTED%5D')
    restoreMocks()
  })

  await t.test('redactPiiFromObject preserves microphone/headphone metadata and redacts custom contact keys', () => {
    const input = {
      microphone: 'Blue Yeti',
      headphone: 'Sony WH-1000XM4',
      billing_email: 'billing@domain.com',
      shipping_phone: '123-456',
      contact_phone: '999-999',
      customer_email: 'cust@domain.com'
    }
    const res = redactPiiFromObject(input)
    assert.strictEqual(res.microphone, 'Blue Yeti')
    assert.strictEqual(res.headphone, 'Sony WH-1000XM4')
    assert.strictEqual(res.billing_email, '[REDACTED]')
    assert.strictEqual(res.shipping_phone, '[REDACTED]')
    assert.strictEqual(res.contact_phone, '[REDACTED]')
    assert.strictEqual(res.customer_email, '[REDACTED]')
  })

  await t.test('/sp/e uses sanitizedProperties.ai_source instead of raw properties.ai_source', async () => {
    setupMocks()
    const { default: proxyRouter } = await import('../routes/proxy.js')
    const layer = proxyRouter.stack.find(s => s.route?.path === '/e' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle

    const req = {
      body: {
        site_key: 'sk-test',
        event: '$pageview',
        anonymous_id: 'anon-1',
        properties: {
          ai_source: 'ChatGPT'
        }
      },
      headers: {}
    }
    const res = makeMockRes()
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'Wave-2: ph.capture removed (Tinybird sole writer)')
    const capturedProps = await dwLine()
    assert.strictEqual(capturedProps.ai_source, 'ChatGPT')
    restoreMocks()
  })

  await t.test('/api/identify writes ONLY the Supabase identity link — no PostHog $identify write', async () => {
    setupMocks()
    const { identify } = await import('../routes/identify.js')

    const req = {
      site: { id: 'site-123' },
      body: {
        user_id: 'safe-user-123',
        anonymous_id: 'anon-abc',
        visitor_id: 'visitor-xyz',
        contact_email: 'Test@Example.Com',
        traits: { custom_trait: 'val', password: 'supersecret', address: '123 Main St' }
      }
    }
    const res = makeMockRes()
    await identify(req, res)

    // PostHog person writes decommissioned: neither ph.capture($identify) nor ph.alias fires.
    assert.strictEqual(captureCalled, false, 'ph.capture($identify) must NOT be called')
    assert.strictEqual(aliasCalled, false, 'ph.alias must NOT be called')

    // The durable Supabase link IS written: (site_id, user_id, anonymous_id, 'identify').
    assert.strictEqual(identityLinkUpserts.length, 1)
    const link = identityLinkUpserts[0]
    assert.strictEqual(link.site_id, 'site-123')
    assert.strictEqual(link.user_id, 'safe-user-123')
    assert.strictEqual(link.anonymous_id, 'anon-abc')
    assert.strictEqual(link.source, 'identify')
    assert.strictEqual(res.statusCode, 200)

    restoreMocks()
  })

  await t.test('/api/identify stores NO link and no PostHog write when user_id is unsafe', async () => {
    setupMocks()
    const { identify } = await import('../routes/identify.js')

    const unsafeIds = ['user@domain.com', '+123456789', 'ghp_abcdefghijklmnop', 'a'.repeat(32), 'secret_token_123', 'sk_live_123', 'pk_test_456']
    for (const id of unsafeIds) {
      captureCalled = false; aliasCalled = false; identityLinkUpserts = []
      const res = makeMockRes()
      await identify({ site: { id: 'site-123' }, body: { user_id: id, anonymous_id: 'anon-abc' } }, res)
      assert.strictEqual(identityLinkUpserts.length, 0, `unsafe user_id ${id}: no link`)
      assert.strictEqual(captureCalled, false)
      assert.strictEqual(aliasCalled, false)
      assert.strictEqual(res.statusCode, 200)
    }

    restoreMocks()
  })

  await t.test('/api/identify stores NO link when anonymous_id is unsafe/missing or equals user_id', async () => {
    setupMocks()
    const { identify } = await import('../routes/identify.js')

    for (const id of ['user@domain.com', '+123456789', 'ghp_abc', 'sk_123']) {
      identityLinkUpserts = []
      const res = makeMockRes()
      await identify({ site: { id: 'site-123' }, body: { user_id: 'safe-user', anonymous_id: id } }, res)
      assert.strictEqual(identityLinkUpserts.length, 0, `unsafe anonymous_id ${id}: no link`)
    }

    // user_id === anonymous_id -> no self-link
    identityLinkUpserts = []
    const resEq = makeMockRes()
    await identify({ site: { id: 'site-123' }, body: { user_id: 'same-id', anonymous_id: 'same-id' } }, resEq)
    assert.strictEqual(identityLinkUpserts.length, 0, 'equal ids: no link')

    restoreMocks()
  })

  await t.test('identify validator exports still reject unsafe values (exports unchanged)', async () => {
    const m = await import('../routes/identify.js')
    assert.strictEqual(m.normalizeEmailForHash('Test@Example.Com'), 'test@example.com')
    assert.strictEqual(m.normalizeEmailForHash('not-an-email'), null)
    assert.strictEqual(m.normalizeSha256Hex('a'.repeat(64)), 'a'.repeat(64))
    assert.strictEqual(m.normalizeSha256Hex('not-a-hash'), null)
    assert.strictEqual(m.validateAndSanitizeUserId('safe-user'), 'safe-user')
    assert.strictEqual(m.validateAndSanitizeUserId('sk_live_123'), null)
    assert.strictEqual(m.validateAndSanitizeTrackingId('anon-abc'), 'anon-abc')
    assert.strictEqual(m.validateAndSanitizeTrackingId('user@x.com'), null)
  })

  await t.test('No committed [DEBUG proxy/e] request-body logging remains', () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../routes/proxy.js'), 'utf8')
    assert.ok(!code.includes('[DEBUG proxy/e]'), 'Must not contain [DEBUG proxy/e] debug logs')
    assert.ok(!code.includes('Route called with body'), 'Must not contain Route called with body logs')
  })
})
