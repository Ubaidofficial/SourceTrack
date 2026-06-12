import test from 'node:test'
import assert from 'node:assert'

// Set mock environment variables so getSupabase() doesn't throw or complain about env-safety
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

import { getSupabase } from '../lib/supabase.js'
import { validateSiteKey, siteCache } from '../middleware/auth.js'
import { isValidRedirectUrl, getRedirectAllowlist, getDefaultBillingReturnUrl } from '../routes/billing.js'
import { checkTierLimit, bustTierCache } from '../middleware/tier-check.js'

test('validateSiteKey Billing Customer Regression Tests', async (t) => {
  const client = getSupabase()
  let mockData = null
  let mockError = null
  let triggerFallback = false
  let selectCallCount = 0
  let lastFieldsSelected = []

  // Mock getSupabase().from('sites') query builder chain
  const originalFrom = client.from
  const originalAuth = client.auth

  client.from = (table) => {
    assert.strictEqual(table, 'sites')
    return {
      select: (fields) => {
        selectCallCount++
        lastFieldsSelected.push(fields)
        return {
          eq: (col, val) => {
            assert.strictEqual(col, 'site_key')
            assert.strictEqual(val, 'test-site-key')
            return {
              single: async () => {
                if (selectCallCount === 1 && triggerFallback) {
                  return {
                    data: null,
                    error: {
                      code: '42703',
                      message: 'column attribution_window_days does not exist'
                    }
                  }
                }
                return { data: mockData, error: mockError }
              }
            }
          }
        }
      }
    }
  }

  client.auth = {
    admin: {
      getUserById: async (userId) => {
        return { data: { user: { email_confirmed_at: '2026-06-12T00:00:00Z' } }, error: null }
      }
    }
  }

  t.afterEach(() => {
    mockData = null
    mockError = null
    triggerFallback = false
    selectCallCount = 0
    lastFieldsSelected = []
    siteCache.flushAll()
  })

  // Restore client methods when all tests in this suite are finished
  t.after(() => {
    client.from = originalFrom
    client.auth = originalAuth
  })

  await t.test('Requirement 1: primary SELECT includes stripe_customer_id', async () => {
    mockData = {
      id: 'site-123',
      site_key: 'test-site-key',
      plan: 'starter',
      stripe_customer_id: 'cus_primary123'
    }

    const req = { body: { site_key: 'test-site-key' } }
    const res = {}
    let nextCalled = false
    const next = () => { nextCalled = true }

    await validateSiteKey(req, res, next)

    assert.strictEqual(nextCalled, true)
    assert.strictEqual(selectCallCount, 1)
    const selectFields = lastFieldsSelected[0]
    assert.ok(selectFields.includes('stripe_customer_id'), 'Primary SELECT fields must include stripe_customer_id')
  })

  await t.test('Requirement 2: fallback SELECT also includes stripe_customer_id', async () => {
    triggerFallback = true
    mockData = {
      id: 'site-123',
      site_key: 'test-site-key',
      plan: 'starter',
      stripe_customer_id: 'cus_fallback123'
    }

    const req = { body: { site_key: 'test-site-key' } }
    const res = {}
    let nextCalled = false
    const next = () => { nextCalled = true }

    await validateSiteKey(req, res, next)

    assert.strictEqual(nextCalled, true)
    assert.strictEqual(selectCallCount, 2)

    const primarySelectFields = lastFieldsSelected[0]
    const fallbackSelectFields = lastFieldsSelected[1]

    assert.ok(primarySelectFields.includes('stripe_customer_id'), 'Primary SELECT fields must include stripe_customer_id')
    assert.ok(fallbackSelectFields.includes('stripe_customer_id'), 'Fallback SELECT fields must include stripe_customer_id')
  })

  await t.test('Requirement 3: req.site.stripe_customer_id is set when database returns it', async () => {
    mockData = {
      id: 'site-123',
      site_key: 'test-site-key',
      plan: 'starter',
      stripe_customer_id: 'cus_valid_id'
    }

    const req = { body: { site_key: 'test-site-key' } }
    const res = {}
    let nextCalled = false
    const next = () => { nextCalled = true }

    await validateSiteKey(req, res, next)

    assert.strictEqual(nextCalled, true)
    assert.ok(req.site, 'req.site must be populated')
    assert.strictEqual(req.site.stripe_customer_id, 'cus_valid_id', 'req.site.stripe_customer_id must match database value')
  })

  await t.test('Requirement 4: req.site.stripe_customer_id is null when database value is missing/null', async () => {
    // Scenario A: DB explicitly returns null
    mockData = {
      id: 'site-123',
      site_key: 'test-site-key',
      plan: 'starter',
      stripe_customer_id: null
    }

    const reqA = { body: { site_key: 'test-site-key' } }
    let nextCalledA = false
    const nextA = () => { nextCalledA = true }

    await validateSiteKey(reqA, {}, nextA)

    assert.strictEqual(nextCalledA, true)
    assert.ok(reqA.site, 'req.site must be populated')
    assert.strictEqual(reqA.site.stripe_customer_id, null, 'req.site.stripe_customer_id must be null')

    // Scenario B: DB returns object missing the stripe_customer_id property
    siteCache.flushAll()
    mockData = {
      id: 'site-123',
      site_key: 'test-site-key',
      plan: 'starter'
    }

    const reqB = { body: { site_key: 'test-site-key' } }
    let nextCalledB = false
    const nextB = () => { nextCalledB = true }

    await validateSiteKey(reqB, {}, nextB)

    assert.strictEqual(nextCalledB, true)
    assert.ok(reqB.site, 'req.site must be populated')
    assert.strictEqual(reqB.site.stripe_customer_id, null, 'req.site.stripe_customer_id must default to null')
  })
})

test('Billing Redirection Allowlist and Validation Tests', async (t) => {
  const originalEnv = { ...process.env }

  t.afterEach(() => {
    process.env = { ...originalEnv }
  })

  await t.test('returns correct default allowlist when no env vars are defined', () => {
    // Clear relevant environment variables
    delete process.env.ALLOWED_ORIGINS
    delete process.env.FRONTEND_URL
    delete process.env.DASHBOARD_URL

    const allowlist = getRedirectAllowlist()

    // Check for hardcoded defaults
    assert.ok(allowlist.includes('https://www.sourcetrack.ai'))
    assert.ok(allowlist.includes('https://sourcetrack.ai'))
    assert.ok(allowlist.includes('https://app.sourcetrack.ai'))
    assert.ok(allowlist.includes('http://localhost:5173'))
    assert.ok(allowlist.includes('http://localhost:8080'))
  })

  await t.test('correctly incorporates ALLOWED_ORIGINS, FRONTEND_URL, and DASHBOARD_URL', () => {
    process.env.ALLOWED_ORIGINS = 'https://test.example.com/sub/route?foo=bar'
    process.env.FRONTEND_URL = 'https://frontend.example.com/'
    process.env.DASHBOARD_URL = 'https://dashboard.example.com'

    const allowlist = getRedirectAllowlist()

    // Full URL origin configurations with trailing slash and query params/paths
    assert.ok(allowlist.includes('https://test.example.com'))
    assert.ok(allowlist.includes('https://frontend.example.com'))
    assert.ok(allowlist.includes('https://dashboard.example.com'))
  })

  await t.test('hostname-only ALLOWED_ORIGINS defaults to HTTPS only', () => {
    process.env.ALLOWED_ORIGINS = 'staging.example.com'
    const allowlist = getRedirectAllowlist()

    assert.ok(allowlist.includes('https://staging.example.com'))
    assert.strictEqual(allowlist.includes('http://staging.example.com'), false)
  })

  await t.test('explicit http://localhost / http://127.0.0.1 remains allowed', () => {
    process.env.ALLOWED_ORIGINS = 'localhost:3000, 127.0.0.1:4000'
    const allowlist = getRedirectAllowlist()

    assert.ok(allowlist.includes('https://localhost:3000'))
    assert.ok(allowlist.includes('http://localhost:3000'))
    assert.ok(allowlist.includes('https://127.0.0.1:4000'))
    assert.ok(allowlist.includes('http://127.0.0.1:4000'))
  })

  await t.test('arbitrary hostname-only config does not auto-allow HTTP', () => {
    process.env.ALLOWED_ORIGINS = 'another-staging.com/path'
    const allowlist = getRedirectAllowlist()

    assert.ok(allowlist.includes('https://another-staging.com'))
    assert.strictEqual(allowlist.includes('http://another-staging.com'), false)
  })

  await t.test('getDefaultBillingReturnUrl() validation and fallbacks', () => {
    // 1. Returns default when no env vars are set
    delete process.env.DASHBOARD_URL
    delete process.env.FRONTEND_URL
    assert.strictEqual(getDefaultBillingReturnUrl(), 'https://app.sourcetrack.ai/billing')

    // 2. Normalizes DASHBOARD_URL with trailing slash/path/query to origin + /billing
    process.env.ALLOWED_ORIGINS = 'dashboard.example.com'
    process.env.DASHBOARD_URL = 'https://dashboard.example.com/some/path?query=123/'
    assert.strictEqual(getDefaultBillingReturnUrl(), 'https://dashboard.example.com/billing')

    // 3. Rejects unsafe/malformed DASHBOARD_URL and falls back
    process.env.DASHBOARD_URL = 'https://evil.com/some/path'
    assert.strictEqual(getDefaultBillingReturnUrl(), 'https://app.sourcetrack.ai/billing')
  })

  await t.test('isValidRedirectUrl identifies allowed vs disallowed targets', () => {
    process.env.ALLOWED_ORIGINS = 'staging.example.com/some/path'
    process.env.FRONTEND_URL = 'https://frontend.example.com/'

    // Valid inputs
    assert.strictEqual(isValidRedirectUrl('https://sourcetrack.ai/billing'), true)
    assert.strictEqual(isValidRedirectUrl('http://localhost:5173/billing?upgrade=success'), true)
    assert.strictEqual(isValidRedirectUrl('https://staging.example.com/billing'), true)
    assert.strictEqual(isValidRedirectUrl('http://staging.example.com/billing'), false)
    assert.strictEqual(isValidRedirectUrl('https://frontend.example.com/billing'), true)

    // Invalid/disallowed inputs
    assert.strictEqual(isValidRedirectUrl('https://evil.com'), false)
    assert.strictEqual(isValidRedirectUrl('https://google.com/billing'), false)
    assert.strictEqual(isValidRedirectUrl('https://app.sourcetrack.ai.evil.com/billing'), false) // mimicking subdomain suffix
    assert.strictEqual(isValidRedirectUrl('http://localhost.evil.com:5173'), false)
    assert.strictEqual(isValidRedirectUrl('relative/path'), false)
    assert.strictEqual(isValidRedirectUrl(''), false)
    assert.strictEqual(isValidRedirectUrl(null), false)
    assert.strictEqual(isValidRedirectUrl({}), false)
  })
})

test('checkTierLimit Middleware Tests', async (t) => {
  const client = getSupabase()
  let mockRpcResult = 0
  let mockRpcError = null

  const originalRpc = client.rpc
  client.rpc = async (fn, args) => {
    assert.strictEqual(fn, 'count_monthly_pageviews')
    if (mockRpcError) return { data: null, error: mockRpcError }
    return { data: mockRpcResult, error: null }
  }

  t.afterEach(() => {
    mockRpcResult = 0
    mockRpcError = null
    bustTierCache('site-123')
  })

  t.after(() => {
    client.rpc = originalRpc
  })

  await t.test('calls next() if plan has no pageview limit', async () => {
    const req = { site: { plan: 'scale', pv_limit: 0, id: 'site-123' } }
    const res = {}
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, true)
  })

  await t.test('calls next() if plan is active and usage is below limit', async () => {
    const req = { site: { plan: 'starter', pv_limit: 50000, id: 'site-123' } }
    mockRpcResult = 1000
    const res = {}
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, true)
  })

  await t.test('returns 402 if monthly pageview limit is reached', async () => {
    const req = { site: { plan: 'free', pv_limit: 5000, id: 'site-123' } }
    mockRpcResult = 5000
    let resStatus = null
    let resJson = null
    const res = {
      status: (code) => {
        resStatus = code
        return {
          json: (data) => { resJson = data }
        }
      }
    }
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, false)
    assert.strictEqual(resStatus, 402)
    assert.strictEqual(resJson.error, 'Monthly pageview limit reached')
  })

  await t.test('returns 402 if trial is expired', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const req = { site: { plan: 'trial', trial_ends_at: pastDate, id: 'site-123' } }
    let resStatus = null
    let resJson = null
    const res = {
      status: (code) => {
        resStatus = code
        return {
          json: (data) => { resJson = data }
        }
      }
    }
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, false)
    assert.strictEqual(resStatus, 402)
    assert.strictEqual(resJson.error, 'Trial expired')
  })

  await t.test('returns 402 if subscription is inactive or archived', async () => {
    const req = { site: { plan: 'inactive', id: 'site-123' } }
    let resStatus = null
    let resJson = null
    const res = {
      status: (code) => {
        resStatus = code
        return {
          json: (data) => { resJson = data }
        }
      }
    }
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, false)
    assert.strictEqual(resStatus, 402)
    assert.strictEqual(resJson.error, 'Subscription inactive')
  })

  await t.test('fails open (calls next()) if RPC returns an error', async () => {
    const req = { site: { plan: 'free', pv_limit: 5000, id: 'site-123' } }
    mockRpcError = { message: 'Database connection failed' }
    const res = {}
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, true)
  })
})
