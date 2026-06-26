import test from 'node:test'
import assert from 'node:assert'

// Set mock environment variables so getSupabase() doesn't throw or complain about env-safety
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'
process.env.POSTHOG_API_KEY = 'mock-posthog-key'
process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000000'


import { getSupabase } from '../lib/supabase.js'
import { validateSiteKey, siteCache } from '../middleware/auth.js'
import { isValidRedirectUrl, getRedirectAllowlist, getDefaultBillingReturnUrl, resolveCheckoutPrice, getPriceMap, getCurrentMonthUsage, billingWebhookHandler, stripe as billingStripe } from '../routes/billing.js'
import { checkTierLimit } from '../middleware/tier-check.js'
import { dispatchWebhook } from '../lib/webhook.js'
import { checkSiteCreationLimit } from '../lib/site-limits.js'

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

test('checkTierLimit Middleware Tests — Status Gate Only (140G-4)', async (t) => {
  // NOTE (140G-4): checkTierLimit now enforces ACCOUNT STATUS only (trial expiry,
  // inactive, archived). Pageview QUOTA claiming was moved into each ingestion handler
  // at the latest safe point. The old count_monthly_pageviews RPC mock is removed
  // because that RPC is no longer called by checkTierLimit.

  await t.test('calls next() for an active free plan site', async () => {
    const req = { site: { plan: 'free', pv_limit: 5000, id: 'site-123' } }
    const res = {}
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, true)
  })

  await t.test('calls next() for an active starter plan site', async () => {
    const req = { site: { plan: 'starter', pv_limit: 50000, id: 'site-123' } }
    const res = {}
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, true)
  })

  await t.test('calls next() for a scale plan site (no volume limit blocks in middleware)', async () => {
    const req = { site: { plan: 'scale', pv_limit: 500000, id: 'site-123' } }
    const res = {}
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, true)
  })

  await t.test('returns 402 if trial is expired', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const req = { site: { plan: 'trial', trial_ends_at: pastDate, id: 'site-123' } }
    let resStatus = null
    let resJson = null
    const res = {
      status: (code) => {
        resStatus = code
        return { json: (data) => { resJson = data } }
      }
    }
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, false)
    assert.strictEqual(resStatus, 402)
    assert.strictEqual(resJson.error, 'Trial expired')
  })

  await t.test('calls next() for a non-expired trial', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const req = { site: { plan: 'trial', trial_ends_at: futureDate, id: 'site-123' } }
    const res = {}
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, true)
  })

  await t.test('returns 402 if subscription is inactive', async () => {
    const req = { site: { plan: 'inactive', id: 'site-123' } }
    let resStatus = null
    let resJson = null
    const res = {
      status: (code) => {
        resStatus = code
        return { json: (data) => { resJson = data } }
      }
    }
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, false)
    assert.strictEqual(resStatus, 402)
    assert.strictEqual(resJson.error, 'Subscription inactive')
  })

  await t.test('returns 402 if site is archived', async () => {
    const req = { site: { plan: 'archived', id: 'site-123' } }
    let resStatus = null
    let resJson = null
    const res = {
      status: (code) => {
        resStatus = code
        return { json: (data) => { resJson = data } }
      }
    }
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, false)
    assert.strictEqual(resStatus, 402)
    assert.strictEqual(resJson.error, 'Site archived due to inactivity')
  })

  await t.test('fails open (calls next()) on internal error', async () => {
    // Simulate req.site being null/undefined so plan normalization might fail
    const req = { site: null }
    const res = {}
    let nextCalled = false
    const next = () => { nextCalled = true }

    await checkTierLimit(req, res, next)
    assert.strictEqual(nextCalled, true)
  })
})

test('dispatchWebhook plan limit enforcement', async (t) => {
  const client = getSupabase()
  const originalFrom = client.from
  let mockDestData = null
  let mockDestError = null
  let mockSiteData = null
  let mockSiteError = null
  let insertCalled = false
  let fetchCalled = false
  let fetchArgs = []

  // Mock global fetch
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    fetchCalled = true
    fetchArgs.push({ url, options })
    return { ok: true, status: 200 }
  }

  client.from = (table) => {
    if (table === 'webhook_destinations') {
      return {
        select: (fields) => {
          assert.strictEqual(fields, 'id, url, secret, active, site_key')
          return {
            eq: (col, val) => {
              assert.strictEqual(col, 'site_key')
              assert.strictEqual(val, 'site-key-123')
              return {
                eq: (col2, val2) => {
                  assert.strictEqual(col2, 'active')
                  assert.strictEqual(val2, true)
                  return {
                    maybeSingle: async () => {
                      return { data: mockDestData, error: mockDestError }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    if (table === 'sites') {
      return {
        select: (fields) => {
          assert.strictEqual(fields, 'plan')
          return {
            eq: (col, val) => {
              assert.strictEqual(col, 'site_key')
              assert.strictEqual(val, 'site-key-123')
              return {
                maybeSingle: async () => {
                  return { data: mockSiteData, error: mockSiteError }
                }
              }
            }
          }
        }
      }
    }
    if (table === 'webhook_deliveries') {
      return {
        insert: async (data) => {
          insertCalled = true
          return { error: null }
        }
      }
    }
    return originalFrom.call(client, table)
  }

  t.afterEach(() => {
    mockDestData = null
    mockDestError = null
    mockSiteData = null
    mockSiteError = null
    insertCalled = false
    fetchCalled = false
    fetchArgs = []
  })

  t.after(() => {
    client.from = originalFrom
    globalThis.fetch = originalFetch
  })

  await t.test('dispatch is allowed for a plan with webhook_outbound', async () => {
    mockDestData = {
      id: 'dest-123',
      url: 'https://example.com/webhook',
      secret: 'whsec_secret123',
      active: true,
      site_key: 'site-key-123'
    }
    mockSiteData = { plan: 'growth' }

    dispatchWebhook('conversion.created', { site_key: 'site-key-123' })

    // Wait a tiny bit since dispatchWebhook runs inside an async Promise.resolve().then()
    await new Promise(resolve => setTimeout(resolve, 50))

    assert.strictEqual(fetchCalled, true)
    assert.strictEqual(fetchArgs[0].url, 'https://example.com/webhook')
    assert.strictEqual(insertCalled, true)
  })

  await t.test('dispatch is skipped for free/downgraded plan', async () => {
    mockDestData = {
      id: 'dest-123',
      url: 'https://example.com/webhook',
      secret: 'whsec_secret123',
      active: true,
      site_key: 'site-key-123'
    }
    mockSiteData = { plan: 'free' } // 'free' has webhook_outbound: false

    dispatchWebhook('conversion.created', { site_key: 'site-key-123' })

    await new Promise(resolve => setTimeout(resolve, 50))

    assert.strictEqual(fetchCalled, false)
    assert.strictEqual(insertCalled, false)
  })

  await t.test('missing site or DB error safely skips dispatch', async () => {
    mockDestError = new Error('Database connection failed')

    dispatchWebhook('conversion.created', { site_key: 'site-key-123' })

    await new Promise(resolve => setTimeout(resolve, 50))

    assert.strictEqual(fetchCalled, false)
    assert.strictEqual(insertCalled, false)
  })

  await t.test('missing site/webhook destination safely skips dispatch', async () => {
    mockDestData = null

    dispatchWebhook('conversion.created', { site_key: 'site-key-123' })

    await new Promise(resolve => setTimeout(resolve, 50))

    assert.strictEqual(fetchCalled, false)
    assert.strictEqual(insertCalled, false)
  })
})

test('checkSiteCreationLimit - plan site limit enforcement helper', async (t) => {
  const client = getSupabase()
  const originalFrom = client.from
  let mockSitesData = null
  let mockSitesError = null
  let lastQueryArgs = {}

  client.from = (table) => {
    if (table === 'sites') {
      return {
        select: (fields) => {
          assert.strictEqual(fields, 'plan')
          return {
            neq: (neqCol, neqVal) => {
              assert.strictEqual(neqCol, 'plan')
              assert.strictEqual(neqVal, 'archived')
              return {
                eq: (scopeCol, scopeVal) => {
                  lastQueryArgs[scopeCol] = scopeVal
                  return (async () => {
                    if (mockSitesError) {
                      return { data: null, error: mockSitesError }
                    }
                    return { data: mockSitesData, error: null }
                  })()
                }
              }
            }
          }
        }
      }
    }
    return originalFrom.call(client, table)
  }

  t.afterEach(() => {
    mockSitesData = null
    mockSitesError = null
    lastQueryArgs = {}
  })

  t.after(() => {
    client.from = originalFrom
  })

  await t.test('free/new user with 0 active sites can create first site', async () => {
    mockSitesData = []
    const result = await checkSiteCreationLimit({ owner_id: 'user-123' })
    assert.strictEqual(result.allowed, true)
    assert.strictEqual(result.count, 0)
    assert.strictEqual(result.limit, 1)
    assert.strictEqual(result.scopeType, 'owner')
    assert.strictEqual(lastQueryArgs.owner_id, 'user-123')
  })

  await t.test('free user with 1 active site is blocked', async () => {
    mockSitesData = [{ plan: 'free' }]
    const result = await checkSiteCreationLimit({ owner_id: 'user-123' })
    assert.strictEqual(result.allowed, false)
    assert.strictEqual(result.count, 1)
    assert.strictEqual(result.limit, 1)
  })

  await t.test('growth plan allows below limit', async () => {
    mockSitesData = [{ plan: 'growth' }]
    const result = await checkSiteCreationLimit({ company_id: 'company-123' })
    assert.strictEqual(result.allowed, true)
    assert.strictEqual(result.count, 1)
    assert.strictEqual(result.limit, 3)
    assert.strictEqual(result.scopeType, 'company')
    assert.strictEqual(lastQueryArgs.company_id, 'company-123')
  })

  await t.test('growth plan blocks at limit', async () => {
    mockSitesData = [{ plan: 'growth' }, { plan: 'free' }, { plan: 'free' }]
    const result = await checkSiteCreationLimit({ company_id: 'company-123' })
    assert.strictEqual(result.allowed, false)
    assert.strictEqual(result.count, 3)
    assert.strictEqual(result.limit, 3)
  })

  await t.test('scale/unlimited plan is not blocked', async () => {
    mockSitesData = [{ plan: 'scale' }]
    const result = await checkSiteCreationLimit({ owner_id: 'user-123' })
    assert.strictEqual(result.allowed, true)
    assert.strictEqual(result.count, 1)
    assert.strictEqual(result.limit, Infinity)
  })

  await t.test('archived-plan sites are excluded if using plan != archived', async () => {
    // Note: archived sites are filtered database-side using neq('plan', 'archived'),
    // so our mock query returns 0 rows (representing archived sites excluded from the active list).
    mockSitesData = []
    const result = await checkSiteCreationLimit({ owner_id: 'user-123' })
    assert.strictEqual(result.allowed, true)
    assert.strictEqual(result.count, 0)
    assert.strictEqual(result.limit, 1)
  })

  await t.test('company scope is preferred over owner scope', async () => {
    mockSitesData = []
    const result = await checkSiteCreationLimit({ company_id: 'company-123', owner_id: 'user-123' })
    assert.strictEqual(result.scopeType, 'company')
    assert.strictEqual(lastQueryArgs.company_id, 'company-123')
    assert.strictEqual(lastQueryArgs.owner_id, undefined)
  })

  await t.test('owner scope works when company_id is missing', async () => {
    mockSitesData = []
    const result = await checkSiteCreationLimit({ owner_id: 'user-123' })
    assert.strictEqual(result.scopeType, 'owner')
    assert.strictEqual(lastQueryArgs.owner_id, 'user-123')
    assert.strictEqual(lastQueryArgs.company_id, undefined)
  })

  await t.test('DB query error fails closed', async () => {
    mockSitesError = new Error('Database connection failed')
    await assert.rejects(
      async () => {
        await checkSiteCreationLimit({ owner_id: 'user-123' })
      },
      /Database connection failed/
    )
  })
})

test('claimConversionUsage - plan conversion limit enforcement helper', async (t) => {
  const { claimConversionUsage } = await import('../lib/conversion-limits.js')
  const client = getSupabase()

  const originalRpc = client.rpc
  let mockRpcResult = null
  let mockRpcError = null
  let mockRpcFn = null
  let rpcCallCount = 0
  let lastRpcArgs = {}

  client.rpc = async (fn, args) => {
    if (fn === 'claim_site_conversion_usage') {
      rpcCallCount++
      lastRpcArgs = args
      if (mockRpcFn) return mockRpcFn(args)
      if (mockRpcError) return { data: null, error: mockRpcError }
      return { data: mockRpcResult, error: null }
    }
    return originalRpc ? originalRpc.call(client, fn, args) : { data: null, error: null }
  }

  t.afterEach(() => {
    mockRpcResult = null
    mockRpcError = null
    mockRpcFn = null
    rpcCallCount = 0
    lastRpcArgs = {}
  })

  t.after(() => {
    client.rpc = originalRpc
  })

  await t.test('unlimited limit (Infinity) bypasses query', async (t) => {
    const { PLAN_STRUCTURAL_LIMITS } = await import('../lib/plan-features.js')
    const originalLimit = PLAN_STRUCTURAL_LIMITS.scale.conversion_events
    PLAN_STRUCTURAL_LIMITS.scale.conversion_events = Infinity

    const result = await claimConversionUsage({ id: 'site-123', plan: 'scale' })
    assert.strictEqual(result.allowed, true)
    assert.strictEqual(result.count, 0)
    assert.strictEqual(result.limit, Infinity)
    assert.strictEqual(rpcCallCount, 0)

    PLAN_STRUCTURAL_LIMITS.scale.conversion_events = originalLimit
  })

  await t.test('free plan below limit allows and increments', async () => {
    mockRpcResult = [{ allowed: true, current_count: 15 }]
    const result = await claimConversionUsage({ id: 'site-123', plan: 'free' })
    assert.strictEqual(result.allowed, true)
    assert.strictEqual(result.count, 15)
    assert.strictEqual(result.limit, 30)
    assert.strictEqual(lastRpcArgs.p_site_id, 'site-123')
    assert.strictEqual(lastRpcArgs.p_limit, 30)
    assert.ok(lastRpcArgs.p_month.match(/^[0-9]{4}-[0-9]{2}$/))
    assert.strictEqual(rpcCallCount, 1)
  })

  await t.test('free plan at limit blocks and does not increment', async () => {
    mockRpcResult = [{ allowed: false, current_count: 30 }]
    const result = await claimConversionUsage({ id: 'site-123', plan: 'free' })
    assert.strictEqual(result.allowed, false)
    assert.strictEqual(result.count, 30)
    assert.strictEqual(result.limit, 30)
    assert.strictEqual(rpcCallCount, 1)
  })

  await t.test('sequential claims reach/block at limit', async () => {
    let mockCountState = 29
    mockRpcFn = (args) => {
      if (mockCountState < args.p_limit) {
        mockCountState++
        return { data: [{ allowed: true, current_count: mockCountState }], error: null }
      }
      return { data: [{ allowed: false, current_count: mockCountState }], error: null }
    }

    // Call 1: allowed (29 -> 30)
    const res1 = await claimConversionUsage({ id: 'site-123', plan: 'free' })
    assert.strictEqual(res1.allowed, true)
    assert.strictEqual(res1.count, 30)

    // Call 2: blocked (at 30)
    const res2 = await claimConversionUsage({ id: 'site-123', plan: 'free' })
    assert.strictEqual(res2.allowed, false)
    assert.strictEqual(res2.count, 30)
    assert.strictEqual(rpcCallCount, 2)
  })

  await t.test('DB query error throws', async () => {
    mockRpcError = new Error('RPC claim failed')
    await assert.rejects(
      async () => {
        await claimConversionUsage({ id: 'site-123', plan: 'free' })
      },
      /RPC claim failed/
    )
  })
})

test('Conversion Routes Ingestion and Fail-Open Integration Tests', async (t) => {
  const { conversion } = await import('../routes/conversion.js')
  const { conversionOffline } = await import('../routes/conversion-offline.js')
  const { shopifyWebhookRouter } = await import('../routes/shopify-webhook.js')
  const { default: proxyRouter } = await import('../routes/proxy.js')
  const { default: webhookIncomingRouter } = await import('../routes/webhook-incoming.js')
  const { ph } = await import('../lib/posthog.js')
  const client = getSupabase()

  // Intercept Stripe prototype webhooks using defineProperty getter
  const Stripe = (await import('stripe')).default
  Object.defineProperty(Stripe.prototype, 'webhooks', {
    get() {
      return {
        constructEvent: () => {
          return { id: 'evt-123', type: 'checkout.session.completed', data: { object: { id: 'cs-123', amount_total: 10000, currency: 'usd' } } }
        }
      }
    },
    set() {},
    configurable: true
  })

  const originalFrom = client.from
  const originalRpc = client.rpc
  const originalCapture = ph.capture

  let captureCalled = false
  ph.capture = () => { captureCalled = true }

  let mockRpcResult = null
  let mockRpcError = null
  let mockIdempotencyResult = true
  let rpcCallCount = 0

  const makeMockChain = () => {
    const chain = {
      select: () => chain,
      insert: async () => ({ data: [], error: null }),
      update: () => chain,
      delete: () => chain,
      eq: () => chain,
      neq: () => chain,
      single: async () => ({ data: {}, error: null }),
      maybeSingle: async () => ({ data: null, error: null })
    }
    return chain
  }

  client.rpc = async (fn, args) => {
    if (fn === 'claim_site_conversion_usage') {
      rpcCallCount++
      if (mockRpcError) return { data: null, error: mockRpcError }
      return { data: mockRpcResult, error: null }
    }
    if (fn === 'claim_revenue_idempotency_keys') {
      return { data: mockIdempotencyResult, error: null }
    }
    return originalRpc ? originalRpc.call(client, fn, args) : { data: null, error: null }
  }

  client.from = (table) => {
    if (table === 'sites') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', shopify_shared_secret: 'enc-secret' },
              error: null
            }),
            maybeSingle: async () => ({
              data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', shopify_shared_secret: 'enc-secret' },
              error: null
            })
          })
        })
      }
    }
    return makeMockChain()
  }

  t.afterEach(() => {
    mockRpcResult = null
    mockRpcError = null
    mockIdempotencyResult = true
    rpcCallCount = 0
    captureCalled = false
  })

  t.after(() => {
    client.from = originalFrom
    client.rpc = originalRpc
    ph.capture = originalCapture
    delete Stripe.prototype.webhooks
  })

  await t.test('direct /api/conversion endpoint allows and captures when below limit', async () => {
    mockRpcResult = [{ allowed: true, current_count: 10 }]
    const req = {
      site: { id: 'site-123', plan: 'free', site_key: 'sk-123' },
      body: { anonymous_id: 'anon-123', conversion_type: 'purchase' },
      headers: { 'user-agent': 'Mozilla' }
    }
    let statusVal = null
    let jsonVal = null
    const res = {
      status: (code) => {
        statusVal = code
        return { json: (obj) => { jsonVal = obj } }
      }
    }

    await conversion(req, res)
    assert.strictEqual(statusVal, 200)
    assert.strictEqual(jsonVal.success, true)
    assert.strictEqual(captureCalled, true)
    assert.strictEqual(rpcCallCount, 1)
  })

  await t.test('direct /api/conversion endpoint blocks with 402 when limit reached', async () => {
    mockRpcResult = [{ allowed: false, current_count: 30 }]
    const req = {
      site: { id: 'site-123', plan: 'free', site_key: 'sk-123' },
      body: { anonymous_id: 'anon-123', conversion_type: 'purchase' },
      headers: { 'user-agent': 'Mozilla' }
    }
    let statusVal = null
    let jsonVal = null
    const res = {
      status: (code) => {
        statusVal = code
        return { json: (obj) => { jsonVal = obj } }
      }
    }

    await conversion(req, res)
    assert.strictEqual(statusVal, 402)
    assert.strictEqual(jsonVal.success, false)
    assert.strictEqual(jsonVal.error, 'Conversion limit reached for your plan')
    assert.strictEqual(captureCalled, false)
    assert.strictEqual(rpcCallCount, 1)
  })

  await t.test('direct /api/conversion endpoint fails open and captures on RPC error', async () => {
    mockRpcError = new Error('Database connection failed')
    const req = {
      site: { id: 'site-123', plan: 'free', site_key: 'sk-123' },
      body: { anonymous_id: 'anon-123', conversion_type: 'purchase' },
      headers: { 'user-agent': 'Mozilla' }
    }
    let statusVal = null
    let jsonVal = null
    const res = {
      status: (code) => {
        statusVal = code
        return { json: (obj) => { jsonVal = obj } }
      }
    }

    await conversion(req, res)
    assert.strictEqual(statusVal, 200)
    assert.strictEqual(jsonVal.success, true)
    assert.strictEqual(captureCalled, true)
    assert.strictEqual(rpcCallCount, 1)
  })

  await t.test('offline conversion route blocks with 402 when limit reached', async () => {
    mockRpcResult = [{ allowed: false, current_count: 30 }]
    const req = {
      site: { id: 'site-123', plan: 'free', site_key: 'sk-123' },
      body: { conversion_value: 100, anonymous_id: 'anon-123', currency: 'USD', order_id: 'order-123' },
      headers: { 'user-agent': 'Mozilla' }
    }
    let statusVal = null
    let jsonVal = null
    const res = {
      status: (code) => {
        statusVal = code
        return { json: (obj) => { jsonVal = obj } }
      }
    }

    await conversionOffline(req, res)
    assert.strictEqual(statusVal, 402)
    assert.strictEqual(jsonVal.success, false)
    assert.strictEqual(jsonVal.error, 'Conversion limit reached for your plan')
  })

  await t.test('shopify webhook route returns 200 ignored when limit reached', async () => {
    mockRpcResult = [{ allowed: false, current_count: 30 }]

    const { encryptSecret } = await import('../lib/utils.js')
    const rawSecret = 'decrypted-secret-key-123'
    const encryptedSecret = encryptSecret(rawSecret)

    // Override the mock client.from to return the encrypted secret
    const originalFrom = client.from
    client.from = (table) => {
      if (table === 'sites') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_shopify_shared_secret: encryptedSecret },
                error: null
              }),
              maybeSingle: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_shopify_shared_secret: encryptedSecret },
                error: null
              })
            })
          })
        }
      }
      return originalFrom(table)
    }

    const payloadObj = { id: 123456, total_price: '0.00' }
    const payloadStr = JSON.stringify(payloadObj)
    const crypto = await import('crypto')
    const hmac = crypto.createHmac('sha256', rawSecret).update(Buffer.from(payloadStr)).digest('base64')

    const req = {
      method: 'POST',
      url: '/sk-123',
      params: { site_key: 'sk-123' },
      headers: {
        'x-shopify-hmac-sha256': hmac,
        'x-shopify-topic': 'orders/paid'
      },
      body: Buffer.from(payloadStr)
    }

    let statusVal = null
    let jsonVal = null
    let nextError = null

    let resolvePromise
    const responsePromise = new Promise(r => { resolvePromise = r })

    const res = {
      status: (code) => {
        statusVal = code
        return {
          json: (obj) => {
            jsonVal = obj
            resolvePromise()
          }
        }
      }
    }

    try {
      await shopifyWebhookRouter(req, res, (err) => {
        nextError = err
        resolvePromise()
      })
      await responsePromise

      if (nextError) {
        console.error('SHOPIFY ROUTE ERROR:', nextError)
      }
      assert.strictEqual(statusVal, 200)
      assert.strictEqual(jsonVal.success, false)
      assert.strictEqual(jsonVal.ignored, true)
      assert.strictEqual(jsonVal.error, 'Conversion limit reached for your plan')
      assert.strictEqual(captureCalled, false)
    } finally {
      client.from = originalFrom
    }
  })

  await t.test('stripe webhook route returns 200 ignored when limit reached', async () => {
    mockRpcResult = [{ allowed: false, current_count: 30 }]

    const { stripeWebhookRouter } = await import('../routes/stripe-webhook.js')
    const { encryptSecret } = await import('../lib/utils.js')
    const rawSecret = 'decrypted-stripe-secret-key-123'
    const encryptedSecret = encryptSecret(rawSecret)

    // Override the mock client.from to return the encrypted secret
    const originalFrom = client.from
    client.from = (table) => {
      if (table === 'sites') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_stripe_webhook_secret: encryptedSecret },
                error: null
              }),
              maybeSingle: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_stripe_webhook_secret: encryptedSecret },
                error: null
              })
            })
          })
        }
      }
      return originalFrom(table)
    }

    const req = {
      method: 'POST',
      url: '/sk-123',
      params: { site_key: 'sk-123' },
      headers: {
        'stripe-signature': 't=123,v1=fake-sig'
      },
      body: Buffer.from('{}')
    }

    let statusVal = null
    let jsonVal = null
    let nextError = null

    let resolvePromise
    const responsePromise = new Promise(r => { resolvePromise = r })

    const res = {
      status: (code) => {
        statusVal = code
        return {
          json: (obj) => {
            jsonVal = obj
            resolvePromise()
          }
        }
      }
    }

    try {
      await stripeWebhookRouter(req, res, (err) => {
        nextError = err
        resolvePromise()
      })
      await responsePromise

      if (nextError) {
        console.error('STRIPE ROUTE ERROR:', nextError)
      }
      assert.strictEqual(statusVal, 200)
      assert.strictEqual(jsonVal.success, false)
      assert.strictEqual(jsonVal.ignored, true)
      assert.strictEqual(jsonVal.error, 'Conversion limit reached for your plan')
      assert.strictEqual(captureCalled, false)
    } finally {
      client.from = originalFrom
    }
  })

  await t.test('proxy route skips capture when limit reached', async () => {
    mockRpcResult = [{ allowed: false, current_count: 30 }]
    const req = {
      method: 'POST',
      url: '/c',
      headers: { 'user-agent': 'Mozilla' },
      body: { site_key: 'sk-123', anonymous_id: 'anon-123' }
    }
    let jsonVal = null
    const res = {
      json: (obj) => { jsonVal = obj }
    }

    const layer = proxyRouter.stack.find(s => s.route?.path === '/c' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle
    await handler(req, res)
    assert.strictEqual(jsonVal.ok, true)

    // Wait a tiny bit since proxy executes in the background
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.strictEqual(captureCalled, false)
    assert.strictEqual(rpcCallCount, 1)
  })

  await t.test('excluded path conversion does not call RPC or consume quota', async () => {
    mockRpcResult = [{ allowed: true, current_count: 10 }]
    const req = {
      site: { id: 'site-123', plan: 'free', site_key: 'sk-123', excluded_paths: ['/thank-you-excluded'] },
      body: { anonymous_id: 'anon-123', conversion_type: 'purchase', page_url: 'https://example.com/thank-you-excluded' },
      headers: { 'user-agent': 'Mozilla' }
    }
    let statusVal = null
    let jsonVal = null
    const res = {
      status: (code) => {
        statusVal = code
        return { json: (obj) => { jsonVal = obj } }
      }
    }

    await conversion(req, res)
    assert.strictEqual(statusVal, 200)
    assert.strictEqual(jsonVal.success, true)
    assert.strictEqual(jsonVal.data.filtered, 'excluded_path')
    assert.strictEqual(rpcCallCount, 0)
  })

  await t.test('duplicate/idempotent conversion retry does not call RPC or consume quota', async () => {
    mockRpcResult = [{ allowed: true, current_count: 10 }]
    mockIdempotencyResult = false // claimIdempotencyKeys returns false -> duplicate: true

    const req = {
      site: { id: 'site-123', plan: 'free', site_key: 'sk-123' },
      body: { anonymous_id: 'anon-123', conversion_type: 'purchase', order_id: 'order-dup-123' },
      headers: { 'user-agent': 'Mozilla' }
    }
    let statusVal = null
    let jsonVal = null
    const res = {
      status: (code) => {
        statusVal = code
        return { json: (obj) => { jsonVal = obj } }
      }
    }

    await conversion(req, res)
    assert.strictEqual(statusVal, 200)
    assert.strictEqual(jsonVal.success, true)
    assert.strictEqual(jsonVal.data.dedup_skipped, true)
    assert.strictEqual(rpcCallCount, 0)
  })

  await t.test('invalid offline payload does not call RPC or consume quota', async () => {
    const req = {
      site: { id: 'site-123', plan: 'free', site_key: 'sk-123' },
      body: { conversion_value: -50 }
    }
    let statusVal = null
    let jsonVal = null
    const res = {
      status: (code) => {
        statusVal = code
        return { json: (obj) => { jsonVal = obj } }
      }
    }

    await conversionOffline(req, res)
    assert.strictEqual(statusVal, 400)
    assert.strictEqual(jsonVal.success, false)
    assert.strictEqual(jsonVal.error, 'conversion_value must be greater than or equal to 0')
    assert.strictEqual(rpcCallCount, 0)
  })

  await t.test('unsupported Stripe event type does not call RPC or consume quota', async () => {
    const { stripeWebhookRouter } = await import('../routes/stripe-webhook.js')
    const { encryptSecret } = await import('../lib/utils.js')
    const rawSecret = 'decrypted-stripe-secret-key-123'
    const encryptedSecret = encryptSecret(rawSecret)

    const originalFrom = client.from
    client.from = (table) => {
      if (table === 'sites') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_stripe_webhook_secret: encryptedSecret },
                error: null
              }),
              maybeSingle: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_stripe_webhook_secret: encryptedSecret },
                error: null
              })
            })
          })
        }
      }
      return originalFrom.call(client, table)
    }

    const Stripe = (await import('stripe')).default
    const originalWebhooks = Stripe.prototype.webhooks
    Object.defineProperty(Stripe.prototype, 'webhooks', {
      get() {
        return {
          constructEvent: () => {
            return { id: 'evt-123', type: 'customer.subscription.updated', data: { object: {} } }
          }
        }
      },
      configurable: true
    })

    const req = {
      method: 'POST',
      url: '/sk-123',
      params: { site_key: 'sk-123' },
      headers: {
        'stripe-signature': 't=123,v1=fake-sig'
      },
      body: Buffer.from('{}')
    }

    let statusVal = null
    let jsonVal = null
    let nextError = null

    let resolvePromise
    const responsePromise = new Promise(r => { resolvePromise = r })

    const res = {
      status: (code) => {
        statusVal = code
        return {
          json: (obj) => {
            jsonVal = obj
            resolvePromise()
          }
        }
      }
    }

    try {
      await stripeWebhookRouter(req, res, (err) => {
        nextError = err
        resolvePromise()
      })
      await responsePromise

      assert.strictEqual(statusVal, 200)
      assert.strictEqual(jsonVal.ignored, true)
      assert.strictEqual(jsonVal.reason, 'Event type customer.subscription.updated ignored')
      assert.strictEqual(rpcCallCount, 0)
    } finally {
      client.from = originalFrom
      Object.defineProperty(Stripe.prototype, 'webhooks', {
        value: originalWebhooks,
        configurable: true,
        writable: true
      })
    }
  })

  await t.test('unsupported Shopify topic does not call RPC or consume quota', async () => {
    const { encryptSecret } = await import('../lib/utils.js')
    const rawSecret = 'decrypted-secret-key-123'
    const encryptedSecret = encryptSecret(rawSecret)

    const originalFrom = client.from
    client.from = (table) => {
      if (table === 'sites') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_shopify_shared_secret: encryptedSecret },
                error: null
              }),
              maybeSingle: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_shopify_shared_secret: encryptedSecret },
                error: null
              })
            })
          })
        }
      }
      return originalFrom.call(client, table)
    }

    const crypto = await import('crypto')
    const hmac = crypto.createHmac('sha256', rawSecret).update(Buffer.from('{}')).digest('base64')

    const req = {
      method: 'POST',
      url: '/sk-123',
      params: { site_key: 'sk-123' },
      headers: {
        'x-shopify-hmac-sha256': hmac,
        'x-shopify-topic': 'orders/cancelled'
      },
      body: Buffer.from('{}')
    }

    let statusVal = null
    let jsonVal = null
    let nextError = null

    let resolvePromise
    const responsePromise = new Promise(r => { resolvePromise = r })

    const res = {
      status: (code) => {
        statusVal = code
        return {
          json: (obj) => {
            jsonVal = obj
            resolvePromise()
          }
        }
      }
    }

    try {
      await shopifyWebhookRouter(req, res, (err) => {
        nextError = err
        resolvePromise()
      })
      await responsePromise

      assert.strictEqual(statusVal, 200)
      assert.strictEqual(jsonVal.ignored, true)
      assert.strictEqual(jsonVal.reason, 'Topic orders/cancelled ignored')
      assert.strictEqual(rpcCallCount, 0)
    } finally {
      client.from = originalFrom
    }
  })

  await t.test('pageview routes checkTierLimit does not call conversion RPC', async () => {
    const req = {
      site: { id: 'site-123', plan: 'free', site_key: 'sk-123' }
    }
    const next = () => {}

    await checkTierLimit(req, {}, next)
    assert.strictEqual(rpcCallCount, 0)
  })

  await t.test('invalid Shopify payload does not call RPC or consume quota', async () => {
    const { encryptSecret } = await import('../lib/utils.js')
    const rawSecret = 'decrypted-secret-key-123'
    const encryptedSecret = encryptSecret(rawSecret)

    const originalFrom = client.from
    client.from = (table) => {
      if (table === 'sites') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_shopify_shared_secret: encryptedSecret },
                error: null
              }),
              maybeSingle: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_shopify_shared_secret: encryptedSecret },
                error: null
              })
            })
          })
        }
      }
      return originalFrom(table)
    }

    const crypto = await import('crypto')
    const hmac = crypto.createHmac('sha256', rawSecret).update(Buffer.from('{}')).digest('base64')

    const req = {
      method: 'POST',
      url: '/sk-123',
      params: { site_key: 'sk-123' },
      headers: {
        'x-shopify-hmac-sha256': hmac,
        'x-shopify-topic': 'orders/paid'
      },
      body: Buffer.from('{}')
    }

    let statusVal = null
    let jsonVal = null
    let nextError = null

    let resolvePromise
    const responsePromise = new Promise(r => { resolvePromise = r })

    const res = {
      status: (code) => {
        statusVal = code
        return {
          json: (obj) => {
            jsonVal = obj
            resolvePromise()
          }
        }
      }
    }

    try {
      await shopifyWebhookRouter(req, res, (err) => {
        nextError = err
        resolvePromise()
      })
      await responsePromise

      assert.strictEqual(statusVal, 400)
      assert.strictEqual(jsonVal.error, 'Missing Shopify order id')
      assert.strictEqual(rpcCallCount, 0)
    } finally {
      client.from = originalFrom
    }
  })

  await t.test('invalid Stripe signature does not call RPC or consume quota', async () => {
    const { stripeWebhookRouter } = await import('../routes/stripe-webhook.js')
    const { encryptSecret } = await import('../lib/utils.js')
    const rawSecret = 'decrypted-stripe-secret-key-123'
    const encryptedSecret = encryptSecret(rawSecret)

    const originalFrom = client.from
    client.from = (table) => {
      if (table === 'sites') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_stripe_webhook_secret: encryptedSecret },
                error: null
              }),
              maybeSingle: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site', encrypted_stripe_webhook_secret: encryptedSecret },
                error: null
              })
            })
          })
        }
      }
      return originalFrom(table)
    }

    const Stripe = (await import('stripe')).default
    const originalWebhooks = Stripe.prototype.webhooks
    Object.defineProperty(Stripe.prototype, 'webhooks', {
      get() {
        return {
          constructEvent: () => {
            throw new Error('Invalid signature')
          }
        }
      },
      configurable: true
    })

    const req = {
      method: 'POST',
      url: '/sk-123',
      params: { site_key: 'sk-123' },
      headers: {
        'stripe-signature': 'invalid-sig'
      },
      body: Buffer.from('{}')
    }

    let statusVal = null
    let jsonVal = null
    let nextError = null

    let resolvePromise
    const responsePromise = new Promise(r => { resolvePromise = r })

    const res = {
      status: (code) => {
        statusVal = code
        return {
          json: (obj) => {
            jsonVal = obj
            resolvePromise()
          }
        }
      }
    }

    try {
      await stripeWebhookRouter(req, res, (err) => {
        nextError = err
        resolvePromise()
      })
      await responsePromise

      assert.strictEqual(statusVal, 400)
      assert.ok(jsonVal.error.includes('Invalid webhook signature'))
      assert.strictEqual(rpcCallCount, 0)
    } finally {
      client.from = originalFrom
      Object.defineProperty(Stripe.prototype, 'webhooks', {
        value: originalWebhooks,
        configurable: true,
        writable: true
      })
    }
  })

  await t.test('generic incoming webhook route returns 402 when limit reached', async () => {
    mockRpcResult = [{ allowed: false, current_count: 30 }]

    const req = {
      method: 'POST',
      url: '/api-key-123',
      params: { api_key: 'api-key-123' },
      headers: { 'user-agent': 'n8n' },
      body: { value: 100, email: 'test@example.com', order_id: 'ord-123' }
    }

    let statusVal = null
    let jsonVal = null
    let nextError = null

    let resolvePromise
    const responsePromise = new Promise(r => { resolvePromise = r })

    const res = {
      status: (code) => {
        statusVal = code
        return {
          json: (obj) => {
            jsonVal = obj
            resolvePromise()
          }
        }
      }
    }

    await webhookIncomingRouter(req, res, (err) => {
      nextError = err
      resolvePromise()
    })
    await responsePromise

    if (nextError) {
      console.error('WEBHOOK INCOMING ROUTE ERROR:', nextError)
    }
    assert.strictEqual(statusVal, 402)
    assert.strictEqual(jsonVal.success, false)
    assert.strictEqual(jsonVal.error, 'Conversion limit reached for your plan')
    assert.strictEqual(captureCalled, false)
    assert.strictEqual(rpcCallCount, 1)
  })

  await t.test('direct /api/conversion over-limit idempotency and cache poison regression', async (t) => {
    // 1. First request has order_id, is over limit (returns 402)
    mockRpcResult = [{ allowed: false, current_count: 30 }]
    mockIdempotencyResult = true

    let deleteCalled = false
    let deleteTable = null
    let eqFilters = {}

    const originalFrom = client.from
    client.from = (table) => {
      if (table === 'sites') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site' },
                error: null
              }),
              maybeSingle: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site' },
                error: null
              })
            })
          })
        }
      }
      if (table === 'revenue_idempotency_keys') {
        return {
          delete: () => {
            deleteCalled = true
            deleteTable = table
            const chain = {
              eq: (col, val) => {
                eqFilters[col] = val
                return chain
              }
            }
            return chain
          }
        }
      }
      return makeMockChain()
    }

    const req = {
      site: { id: 'site-123', plan: 'free', site_key: 'sk-123' },
      body: { anonymous_id: 'anon-123', conversion_type: 'purchase', order_id: 'order-poison-123' },
      headers: { 'user-agent': 'Mozilla' }
    }

    let statusVal = null
    let jsonVal = null
    const res = {
      status: (code) => {
        statusVal = code
        return { json: (obj) => { jsonVal = obj } }
      }
    }

    await conversion(req, res)

    assert.strictEqual(statusVal, 402)
    assert.strictEqual(jsonVal.success, false)
    assert.strictEqual(captureCalled, false)
    assert.strictEqual(deleteCalled, true, 'Rollback should be called on over-limit block')
    assert.strictEqual(eqFilters.site_key, 'sk-123')
    assert.strictEqual(eqFilters.provider, 'browser_conversion')
    assert.strictEqual(eqFilters.key_type, 'order_event')
    assert.strictEqual(eqFilters.key_value, 'site-123:order-poison-123:purchase')

    // 2. Second request with same order_id: now limit is lifted (allowed: true)
    mockRpcResult = [{ allowed: true, current_count: 10 }]
    mockIdempotencyResult = true
    captureCalled = false
    statusVal = null
    jsonVal = null

    client.from = originalFrom

    await conversion(req, res)

    assert.strictEqual(statusVal, 200)
    assert.strictEqual(jsonVal.success, true)
    assert.strictEqual(captureCalled, true, 'Retry should capture successfully after limit is lifted')
  })

  await t.test('rollback DB error does not swallow 402 or trigger capture', async () => {
    // Simulate: over-limit + Supabase delete() returns { error } instead of throwing
    mockRpcResult = [{ allowed: false, current_count: 30 }]
    mockIdempotencyResult = true

    const originalFrom = client.from
    client.from = (table) => {
      if (table === 'sites') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site' },
                error: null
              }),
              maybeSingle: async () => ({
                data: { id: 'site-123', plan: 'free', site_key: 'sk-123', name: 'Test Site' },
                error: null
              })
            })
          })
        }
      }
      if (table === 'revenue_idempotency_keys') {
        // Supabase delete returns { error } instead of throwing
        return {
          delete: () => {
            const chain = {
              eq: () => chain
            }
            // Override the last eq in the chain to return { error }
            let eqCount = 0
            chain.eq = (col, val) => {
              eqCount++
              if (eqCount === 4) {
                // Return a thenable so await resolves to { error }
                return {
                  then: (resolve) => resolve({ error: { message: 'delete failed' } }),
                  eq: () => chain
                }
              }
              return chain
            }
            return chain
          }
        }
      }
      return makeMockChain()
    }

    const req = {
      site: { id: 'site-123', plan: 'free', site_key: 'sk-123' },
      body: { anonymous_id: 'anon-999', conversion_type: 'purchase', order_id: 'order-rollback-err-123' },
      headers: { 'user-agent': 'Mozilla' }
    }

    let statusVal = null
    let jsonVal = null
    const res = {
      status: (code) => {
        statusVal = code
        return { json: (obj) => { jsonVal = obj } }
      }
    }

    try {
      await conversion(req, res)

      // Route must still return 402 even though the DB rollback failed
      assert.strictEqual(statusVal, 402)
      assert.strictEqual(jsonVal.success, false)
      assert.strictEqual(jsonVal.error, 'Conversion limit reached for your plan')
      // No PostHog capture should have occurred
      assert.strictEqual(captureCalled, false)
    } finally {
      client.from = originalFrom
    }
  })
})

test('claimPageviewUsage — pageview limit enforcement helper (140G-4)', async (t) => {
  const { claimPageviewUsage } = await import('../lib/pageview-limits.js')
  const client = getSupabase()

  const originalRpc = client.rpc
  let mockRpcResult = null
  let mockRpcError = null
  let mockRpcFn = null
  let rpcCallCount = 0
  let lastRpcArgs = {}

  client.rpc = async (fn, args) => {
    if (fn === 'claim_site_pageview_usage') {
      rpcCallCount++
      lastRpcArgs = args
      if (mockRpcFn) return mockRpcFn(args)
      if (mockRpcError) return { data: null, error: mockRpcError }
      return { data: mockRpcResult, error: null }
    }
    return originalRpc ? originalRpc.call(client, fn, args) : { data: null, error: null }
  }

  t.afterEach(() => {
    mockRpcResult = null
    mockRpcError = null
    mockRpcFn = null
    rpcCallCount = 0
    lastRpcArgs = {}
  })

  t.after(() => {
    client.rpc = originalRpc
  })

  await t.test('free plan below limit: allowed true, counter increments', async () => {
    mockRpcResult = [{ allowed: true, current_count: 42 }]
    const result = await claimPageviewUsage({ id: 'site-123', plan: 'free' })
    assert.strictEqual(result.allowed, true)
    assert.strictEqual(result.count, 42)
    assert.strictEqual(result.limit, 5000) // PLAN_DEFAULT_PV_LIMIT.free
    assert.strictEqual(lastRpcArgs.p_site_id, 'site-123')
    assert.strictEqual(lastRpcArgs.p_limit, 5000)
    assert.ok(lastRpcArgs.p_month.match(/^[0-9]{4}-[0-9]{2}$/), 'month must be YYYY-MM format')
    assert.strictEqual(rpcCallCount, 1)
  })

  await t.test('free plan at limit: allowed false, does not increment', async () => {
    mockRpcResult = [{ allowed: false, current_count: 5000 }]
    const result = await claimPageviewUsage({ id: 'site-123', plan: 'free' })
    assert.strictEqual(result.allowed, false)
    assert.strictEqual(result.count, 5000)
    assert.strictEqual(result.limit, 5000)
    assert.strictEqual(rpcCallCount, 1)
  })

  await t.test('per-site pv_limit override is used over plan default', async () => {
    mockRpcResult = [{ allowed: true, current_count: 1 }]
    // starter plan default is 50000, but pv_limit override is 10000
    const result = await claimPageviewUsage({ id: 'site-123', plan: 'starter', pv_limit: 10000 })
    assert.strictEqual(result.limit, 10000)
    assert.strictEqual(lastRpcArgs.p_limit, 10000)
  })

  await t.test('sequential claims reach then block at limit', async () => {
    let mockCount = 4999
    mockRpcFn = (args) => {
      if (mockCount < args.p_limit) {
        mockCount++
        return { data: [{ allowed: true, current_count: mockCount }], error: null }
      }
      return { data: [{ allowed: false, current_count: mockCount }], error: null }
    }

    // Call 1: allowed (4999 -> 5000)
    const res1 = await claimPageviewUsage({ id: 'site-123', plan: 'free' })
    assert.strictEqual(res1.allowed, true)
    assert.strictEqual(res1.count, 5000)

    // Call 2: blocked (at 5000)
    const res2 = await claimPageviewUsage({ id: 'site-123', plan: 'free' })
    assert.strictEqual(res2.allowed, false)
    assert.strictEqual(res2.count, 5000)
    assert.strictEqual(rpcCallCount, 2)
  })

  await t.test('inactive plan (pv_limit=0): blocked without RPC call', async () => {
    const result = await claimPageviewUsage({ id: 'site-123', plan: 'inactive' })
    assert.strictEqual(result.allowed, false)
    assert.strictEqual(result.limit, 0)
    assert.strictEqual(rpcCallCount, 0, 'inactive plan must not call RPC')
  })

  await t.test('archived plan (pv_limit=0): blocked without RPC call', async () => {
    const result = await claimPageviewUsage({ id: 'site-123', plan: 'archived' })
    assert.strictEqual(result.allowed, false)
    assert.strictEqual(result.limit, 0)
    assert.strictEqual(rpcCallCount, 0, 'archived plan must not call RPC')
  })

  await t.test('site_id scoping: different site_ids use independent counters', async () => {
    mockRpcResult = [{ allowed: true, current_count: 1 }]
    await claimPageviewUsage({ id: 'site-aaa', plan: 'free' })
    await claimPageviewUsage({ id: 'site-bbb', plan: 'free' })
    assert.strictEqual(rpcCallCount, 2)
    // Each call sends the correct site_id
    assert.ok(lastRpcArgs.p_site_id === 'site-bbb')
  })

  await t.test('UTC month format is YYYY-MM', async () => {
    mockRpcResult = [{ allowed: true, current_count: 1 }]
    await claimPageviewUsage({ id: 'site-123', plan: 'free' })
    const month = lastRpcArgs.p_month
    assert.ok(typeof month === 'string' && /^[0-9]{4}-[0-9]{2}$/.test(month), `month "${month}" must be YYYY-MM`)
  })

  await t.test('RPC/DB error throws (caller is responsible for fail-open)', async () => {
    mockRpcError = new Error('RPC pageview claim failed')
    await assert.rejects(
      async () => { await claimPageviewUsage({ id: 'site-123', plan: 'free' }) },
      /RPC pageview claim failed/
    )
  })

  await t.test('missing site.id throws immediately', async () => {
    await assert.rejects(
      async () => { await claimPageviewUsage({ plan: 'free' }) },
      /id is required/
    )
    assert.strictEqual(rpcCallCount, 0)
  })

  await t.test('unlimited plan bypasses RPC and returns allowed true', async () => {
    const result = await claimPageviewUsage({ id: 'site-123', plan: 'scale', pv_limit: Infinity })
    assert.strictEqual(result.allowed, true)
    assert.strictEqual(result.limit, Infinity)
    assert.strictEqual(rpcCallCount, 0, 'unlimited plan must bypass database RPC')
  })
})

test('track.js handler — pageview quota integration (140G-4)', async (t) => {
  const { track } = await import('../routes/track.js')
  const { ph } = await import('../lib/posthog.js')
  const client = getSupabase()

  const originalCapture = ph.capture
  let captureCalled = false
  let lastCaptureArgs = null
  ph.capture = (args) => { captureCalled = true; lastCaptureArgs = args }

  const originalRpc = client.rpc
  let mockRpcResult = null
  let mockRpcError = null
  client.rpc = async (fn, args) => {
    if (fn === 'claim_site_pageview_usage') {
      if (mockRpcError) return { data: null, error: mockRpcError }
      return { data: mockRpcResult, error: null }
    }
    return originalRpc ? originalRpc.call(client, fn, args) : { data: null, error: null }
  }

  // Mock supabase from() for sites (used by updateTelemetryMetadata)
  const originalFrom = client.from
  client.from = (table) => {
    if (table === 'sites') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) })
      }
    }
    return originalFrom ? originalFrom.call(client, table) : {}
  }

  t.afterEach(() => {
    captureCalled = false
    lastCaptureArgs = null
    mockRpcResult = null
    mockRpcError = null
  })

  t.after(() => {
    ph.capture = originalCapture
    client.rpc = originalRpc
    client.from = originalFrom
  })

  function makeReq(event = '$pageview', overrides = {}) {
    return {
      body: { site_key: 'sk-test', event, anonymous_id: 'anon-1', page_url: 'https://example.com/page', ...overrides },
      site: { id: 'site-123', plan: 'free', pv_limit: 5000, excluded_paths: [], custom_url_params: [] },
      headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      ...overrides._req
    }
  }

  function makeRes() {
    let statusCode = null
    let jsonBody = null
    return {
      get statusCode() { return statusCode },
      get json_body() { return jsonBody },
      status: (code) => { statusCode = code; return { json: (b) => { jsonBody = b } } },
      json: (b) => { jsonBody = b; return {} }
    }
  }

  await t.test('$pageview below limit: captured and quota claimed', async () => {
    mockRpcResult = [{ allowed: true, current_count: 100 }]
    const req = makeReq('$pageview')
    const res = makeRes()
    await track(req, res)
    assert.strictEqual(captureCalled, true, '$pageview should call ph.capture')
  })

  await t.test('$pageview at limit: 402 returned, ph.capture NOT called', async () => {
    mockRpcResult = [{ allowed: false, current_count: 5000 }]
    const req = makeReq('$pageview')
    const res = makeRes()
    await track(req, res)
    assert.strictEqual(res.statusCode, 402, 'must return 402 when limit reached')
    assert.strictEqual(captureCalled, false, 'ph.capture must NOT be called when limit reached')
    assert.strictEqual(res.json_body.error, 'Monthly pageview limit reached')
    assert.strictEqual(res.json_body.data.limit_reached, true)
  })

  await t.test('custom event (not $pageview): does not call RPC, capture proceeds', async () => {
    let pvRpcCalled = false
    const savedRpc = client.rpc
    client.rpc = async (fn, args) => {
      if (fn === 'claim_site_pageview_usage') pvRpcCalled = true
      return { data: [{ allowed: true, current_count: 1 }], error: null }
    }
    const req = makeReq('button_clicked')
    const res = makeRes()
    await track(req, res)
    assert.strictEqual(pvRpcCalled, false, 'custom event must NOT claim pageview quota')
    assert.strictEqual(captureCalled, true, 'custom event must still be captured')
    client.rpc = savedRpc
  })

  await t.test('bot UA: filtered before quota claim, no capture', async () => {
    let pvRpcCalled = false
    const savedRpc = client.rpc
    client.rpc = async (fn, args) => {
      if (fn === 'claim_site_pageview_usage') pvRpcCalled = true
      return { data: [{ allowed: true, current_count: 1 }], error: null }
    }
    const req = makeReq('$pageview', { _req: { headers: { 'user-agent': 'Googlebot/2.1' } } })
    req.headers = { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' }
    const res = makeRes()
    await track(req, res)
    assert.strictEqual(pvRpcCalled, false, 'bot must not claim quota')
    assert.strictEqual(captureCalled, false, 'bot must not be captured')
    client.rpc = savedRpc
  })

  await t.test('excluded path: filtered before quota claim, no capture', async () => {
    let pvRpcCalled = false
    const savedRpc = client.rpc
    client.rpc = async (fn, args) => {
      if (fn === 'claim_site_pageview_usage') pvRpcCalled = true
      return { data: [{ allowed: true, current_count: 1 }], error: null }
    }
    const req = makeReq('$pageview')
    req.site.excluded_paths = ['/admin/*']
    req.body.page_url = 'https://example.com/admin/settings'
    const res = makeRes()
    await track(req, res)
    assert.strictEqual(pvRpcCalled, false, 'excluded path must not claim quota')
    assert.strictEqual(captureCalled, false, 'excluded path must not be captured')
    client.rpc = savedRpc
  })

  await t.test('RPC failure on $pageview: fail-open (capture still proceeds)', async () => {
    mockRpcError = new Error('DB connection failed')
    const req = makeReq('$pageview')
    const res = makeRes()
    await track(req, res)
    // Fail open: despite RPC error, capture must still proceed
    assert.strictEqual(captureCalled, true, 'fail-open: ph.capture must proceed on RPC error')
    assert.notStrictEqual(res.statusCode, 402, 'fail-open: must not return 402 on RPC error')
  })
})

test('Proxy and Legacy Ingestion Quota & Status Enforcement Tests (140G-4)', async (t) => {
  const { default: proxyRouter } = await import('../routes/proxy.js')
  const { default: analyticsRouter } = await import('../routes/analytics.js')
  const { ph } = await import('../lib/posthog.js')
  const client = getSupabase()

  // Mock PostHog capture
  const originalCapture = ph.capture
  let captureCalled = false
  let lastCaptureArgs = null
  ph.capture = (args) => { captureCalled = true; lastCaptureArgs = args }

  // Mock Supabase client
  const originalRpc = client.rpc
  const originalFrom = client.from
  let mockRpcResult = null
  let mockRpcError = null
  let rpcCalls = []
  client.rpc = async (fn, args) => {
    if (fn === 'claim_site_pageview_usage' || fn === 'claim_site_conversion_usage') {
      rpcCalls.push({ fn, args })
      if (mockRpcError) return { data: null, error: mockRpcError }
      return { data: mockRpcResult, error: null }
    }
    return originalRpc ? originalRpc.call(client, fn, args) : { data: null, error: null }
  }

  let mockSitesData = null
  let mockSitesError = null
  let insertedPageviews = []
  let insertedCustomEvents = []

  client.from = (table) => {
    if (table === 'sites') {
      return {
        select: (fields) => ({
          eq: (col, val) => ({
            single: async () => {
              if (mockSitesError) return { data: null, error: mockSitesError }
              return { data: mockSitesData, error: null }
            }
          })
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) })
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
    return originalFrom ? originalFrom.call(client, table) : {}
  }

  t.afterEach(() => {
    captureCalled = false
    lastCaptureArgs = null
    mockRpcResult = null
    mockRpcError = null
    rpcCalls = []
    mockSitesData = null
    mockSitesError = null
    insertedPageviews = []
    insertedCustomEvents = []
  })

  t.after(() => {
    ph.capture = originalCapture
    client.rpc = originalRpc
    client.from = originalFrom
  })

  function makeMockRes() {
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

  await t.test('proxy /sp/e $pageview: over limit skips ph.capture', async () => {
    mockSitesData = { id: 'site-123', plan: 'free', pv_limit: 5000, trial_ends_at: null }
    mockRpcResult = [{ allowed: false, current_count: 5000 }] // Over limit

    const req = {
      body: { site_key: 'sk-test', event: '$pageview', anonymous_id: 'anon-1' },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()

    // Find the handler for POST /e in proxyRouter
    const layer = proxyRouter.stack.find(s => s.route?.path === '/e' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'over limit proxy pageview must skip PostHog capture')
    assert.strictEqual(rpcCalls.length, 1, 'must attempt to claim quota')
    assert.strictEqual(rpcCalls[0].fn, 'claim_site_pageview_usage')
  })

  await t.test('proxy /sp/e non-pageview: does not call claim_site_pageview_usage', async () => {
    mockSitesData = { id: 'site-123', plan: 'free', pv_limit: 5000, trial_ends_at: null }

    const req = {
      body: { site_key: 'sk-test', event: 'custom_event', anonymous_id: 'anon-1' },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()

    const layer = proxyRouter.stack.find(s => s.route?.path === '/e' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle
    await handler(req, res)

    assert.strictEqual(captureCalled, true, 'non-pageview event should be captured')
    assert.strictEqual(rpcCalls.length, 0, 'must not call pageview quota RPC')
  })

  await t.test('proxy /sp/e: expired trial skips ph.capture safely', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    mockSitesData = { id: 'site-123', plan: 'trial', pv_limit: 10000, trial_ends_at: pastDate }

    const req = {
      body: { site_key: 'sk-test', event: '$pageview', anonymous_id: 'anon-1' },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()

    const layer = proxyRouter.stack.find(s => s.route?.path === '/e' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'expired trial site must skip capture')
    assert.strictEqual(rpcCalls.length, 0, 'expired trial site must not write to counter DB')
  })

  await t.test('proxy /sp/pixel.gif: over limit skips ph.capture', async () => {
    mockSitesData = { id: 'site-123', plan: 'free', pv_limit: 5000, trial_ends_at: null }
    mockRpcResult = [{ allowed: false, current_count: 5000 }] // Over limit

    const req = {
      query: { site_key: 'sk-test', uid: 'anon-1' },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()

    const layer = proxyRouter.stack.find(s => s.route?.path === '/pixel.gif' && s.route?.methods.get)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle
    await handler(req, res)

    assert.strictEqual(res.ended, true)
    assert.strictEqual(captureCalled, false, 'over limit pixel must skip capture')
    assert.strictEqual(rpcCalls.length, 1)
    assert.strictEqual(rpcCalls[0].fn, 'claim_site_pageview_usage')
  })

  await t.test('proxy /sp/pixel.gif: expired trial skips ph.capture safely', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    mockSitesData = { id: 'site-123', plan: 'trial', pv_limit: 10000, trial_ends_at: pastDate }

    const req = {
      query: { site_key: 'sk-test', uid: 'anon-1' },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()

    const layer = proxyRouter.stack.find(s => s.route?.path === '/pixel.gif' && s.route?.methods.get)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle
    await handler(req, res)

    assert.strictEqual(captureCalled, false, 'expired trial pixel must skip capture')
    assert.strictEqual(rpcCalls.length, 0)
  })

  await t.test('legacy /api/analytics/collect pageview: over limit does not insert', async () => {
    mockSitesData = { id: 'site-123', plan: 'free', pv_limit: 5000, trial_ends_at: null }
    mockRpcResult = [{ allowed: false, current_count: 5000 }] // Over limit

    const req = {
      body: { site_key: 'sk-test', url: 'https://example.com' },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()

    const layer = analyticsRouter.stack.find(s => s.route?.path === '/collect' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle
    await handler(req, res)

    assert.strictEqual(res.statusCode, 402, 'must return 402')
    assert.strictEqual(insertedPageviews.length, 0, 'must not insert pageview row')
    assert.strictEqual(rpcCalls.length, 1)
  })

  await t.test('legacy /api/analytics/collect custom/outbound: does not call claim_site_pageview_usage', async () => {
    mockSitesData = { id: 'site-123', plan: 'free', pv_limit: 5000, trial_ends_at: null }

    const req = {
      body: { site_key: 'sk-test', url: 'https://example.com', event_type: 'custom', event_name: 'click' },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()

    const layer = analyticsRouter.stack.find(s => s.route?.path === '/collect' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle
    await handler(req, res)

    assert.strictEqual(insertedCustomEvents.length, 1, 'must insert custom event row')
    assert.strictEqual(rpcCalls.length, 0, 'custom/outbound events must not consume pageview quota')
  })

  await t.test('legacy /api/analytics/collect: RPC failure fails open and inserts', async () => {
    mockSitesData = { id: 'site-123', plan: 'free', pv_limit: 5000, trial_ends_at: null }
    mockRpcError = new Error('Database connection failed')

    const req = {
      body: { site_key: 'sk-test', url: 'https://example.com' },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()

    const layer = analyticsRouter.stack.find(s => s.route?.path === '/collect' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle
    await handler(req, res)

    assert.strictEqual(res.statusCode, 200, 'must return 200 on fail open')
    assert.strictEqual(insertedPageviews.length, 1, 'must insert pageview row')
    assert.strictEqual(rpcCalls.length, 1)
  })

  await t.test('legacy /api/analytics/collect: expired trial returns clean 402', async () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    mockSitesData = { id: 'site-123', plan: 'trial', pv_limit: 10000, trial_ends_at: pastDate }

    const req = {
      body: { site_key: 'sk-test', url: 'https://example.com' },
      headers: { 'user-agent': 'Mozilla/5.0' }
    }
    const res = makeMockRes()

    const layer = analyticsRouter.stack.find(s => s.route?.path === '/collect' && s.route?.methods.post)
    const handler = layer.route.stack[layer.route.stack.length - 1].handle
    await handler(req, res)

    assert.strictEqual(res.statusCode, 402, 'expired trial must return 402')
    assert.strictEqual(res.json_body.error, 'Your 14-day trial has ended. Upgrade to continue tracking.')
    assert.strictEqual(insertedPageviews.length, 0, 'must not insert pageview row')
    assert.strictEqual(rpcCalls.length, 0, 'must not call RPC')
  })
})

test('Stripe Webhook Rate Limiter Tests (Session 140G-15)', async (t) => {
  const { createStripeWebhookLimit } = await import('../middleware/rate-limit.js')

  const runLimiter = (limiter, req) => {
    const fullReq = {
      ip: req.ip || '127.0.0.1',
      app: { get: (name) => name === 'trust proxy' ? 'loopback' : undefined },
      headers: req.headers || {},
      method: req.method || 'GET',
      url: req.url || '/',
      body: req.body,
      ...req
    }
    return new Promise((resolve, reject) => {
      let nextCalled = false
      let statusVal = null
      let jsonVal = null

      const res = {
        status: (code) => {
          statusVal = code
          return {
            json: (obj) => {
              jsonVal = obj
              resolve({ nextCalled: false, statusVal, jsonVal })
            }
          }
        },
        setHeader: () => {}
      }

      const next = (err) => {
        if (err) {
          reject(err)
        } else {
          nextCalled = true
          resolve({ nextCalled: true, statusVal, jsonVal })
        }
      }

      limiter(fullReq, res, next)
    })
  }

  await t.test('Normal webhook path passes through when under limit', async () => {
    const limit = createStripeWebhookLimit({ windowMs: 60000, max: 2 })
    const req = {
      method: 'POST',
      url: '/api/webhooks/stripe/sk-123',
      headers: {
        'x-forwarded-for': '1.2.3.4'
      },
      ip: '1.2.3.4'
    }

    const result = await runLimiter(limit, req)
    assert.strictEqual(result.nextCalled, true, 'next() should be called')
  })

  await t.test('Excess requests return 429 and small safe JSON response', async () => {
    const limit = createStripeWebhookLimit({ windowMs: 60000, max: 2 })
    const req = {
      method: 'POST',
      url: '/api/webhooks/stripe/sk-123',
      headers: {
        'x-forwarded-for': '2.3.4.5'
      },
      ip: '2.3.4.5'
    }

    const originalWarn = console.warn
    console.warn = () => {}

    try {
      // First request
      const r1 = await runLimiter(limit, req)
      assert.strictEqual(r1.nextCalled, true)
      assert.strictEqual(r1.statusVal, null)

      // Second request
      const r2 = await runLimiter(limit, req)
      assert.strictEqual(r2.nextCalled, true)
      assert.strictEqual(r2.statusVal, null)

      // Third request (should be rate-limited)
      const r3 = await runLimiter(limit, req)
      assert.strictEqual(r3.nextCalled, false, 'next() should not be called for the third request')
      assert.strictEqual(r3.statusVal, 429)
      assert.deepStrictEqual(r3.jsonVal, {
        success: false,
        data: null,
        error: 'Too many requests',
        message: 'Rate limit exceeded (stripe-webhook limit)'
      })
    } finally {
      console.warn = originalWarn
    }
  })

  await t.test('Limiter does not require auth or mutate req.body', async () => {
    const limit = createStripeWebhookLimit({ windowMs: 60000, max: 10 })
    const bodyBuffer = Buffer.from('{"id": "evt_123"}')
    const req = {
      method: 'POST',
      url: '/api/webhooks/stripe/sk-123',
      headers: {
        'x-forwarded-for': '3.4.5.6'
      },
      body: bodyBuffer
    }

    const result = await runLimiter(limit, req)
    assert.strictEqual(result.nextCalled, true)
    assert.strictEqual(req.headers.authorization, undefined)
    assert.strictEqual(req.body, bodyBuffer, 'body buffer must not be mutated or consumed')
  })
})

test('Public Dashboard Rate Limiter Tests (Session 140G-18)', async (t) => {
  const {
    publicDashboardLimit,
    createPublicDashboardLimit,
    trackVisitorLimit,
    trackIpLimit,
    trackSiteLimit,
    trackGlobalIpLimit,
    conversionVisitorLimit,
    conversionIpLimit,
    conversionSiteLimit,
    conversionGlobalIpLimit
  } = await import('../middleware/rate-limit.js')
  const { default: proxyRouter } = await import('../routes/proxy.js')
  const { publicDashboardRouter } = await import('../routes/public-dashboard.js')

  const runLimiter = (limiter, req) => {
    const fullReq = {
      ip: req.ip || '127.0.0.1',
      app: { get: (name) => name === 'trust proxy' ? 'loopback' : undefined },
      headers: req.headers || {},
      method: req.method || 'GET',
      url: req.url || '/',
      body: req.body,
      ...req
    }
    return new Promise((resolve, reject) => {
      let nextCalled = false
      let statusVal = null
      let jsonVal = null

      const res = {
        status: (code) => {
          statusVal = code
          return {
            json: (obj) => {
              jsonVal = obj
              resolve({ nextCalled: false, statusVal, jsonVal })
            }
          }
        },
        setHeader: () => {}
      }

      const next = (err) => {
        if (err) {
          reject(err)
        } else {
          nextCalled = true
          resolve({ nextCalled: true, statusVal, jsonVal })
        }
      }

      limiter(fullReq, res, next)
    })
  }

  await t.test('Normal public dashboard request passes when under limit', async () => {
    const req = {
      method: 'GET',
      url: '/api/public/token123',
      headers: {
        'x-forwarded-for': '9.8.7.6'
      },
      ip: '9.8.7.6'
    }

    const result = await runLimiter(publicDashboardLimit, req)
    assert.strictEqual(result.nextCalled, true, 'next() should be called')
  })

  await t.test('Public dashboard over limit returns 429 safe JSON', async () => {
    const limit = createPublicDashboardLimit({ windowMs: 60000, max: 1 })
    const req = {
      method: 'GET',
      url: '/api/public/token123',
      headers: {
        'x-forwarded-for': '9.8.7.8'
      },
      ip: '9.8.7.8'
    }

    const r1 = await runLimiter(limit, req)
    assert.strictEqual(r1.nextCalled, true)

    const r2 = await runLimiter(limit, req)
    assert.strictEqual(r2.nextCalled, false)
    assert.strictEqual(r2.statusVal, 429)
    assert.deepStrictEqual(r2.jsonVal, {
      success: false,
      data: null,
      error: 'Too many requests'
    })
  })

  await t.test('Limiter does not require auth or mutate request body', async () => {
    const limit = createPublicDashboardLimit({ windowMs: 60000, max: 10 })
    const bodyObj = { some: 'data' }
    const req = {
      method: 'GET',
      url: '/api/public/token123',
      headers: {
        'x-forwarded-for': '9.8.7.9'
      },
      body: bodyObj
    }

    const result = await runLimiter(limit, req)
    assert.strictEqual(result.nextCalled, true)
    assert.strictEqual(req.headers.authorization, undefined)
    assert.strictEqual(req.body, bodyObj, 'body must not be mutated')
  })

  await t.test('Route stacks include correct rate limiters', async () => {
    // 1. /sp/e route stack
    const layerE = proxyRouter.stack.find(s => s.route?.path === '/e' && s.route?.methods.post)
    assert.ok(layerE, 'POST /sp/e route should exist')
    const handlersE = layerE.route.stack.map(s => s.handle)
    assert.ok(handlersE.includes(trackVisitorLimit), 'POST /sp/e must include trackVisitorLimit')
    assert.ok(handlersE.includes(trackIpLimit), 'POST /sp/e must include trackIpLimit')
    assert.ok(handlersE.includes(trackSiteLimit), 'POST /sp/e must include trackSiteLimit')
    assert.ok(handlersE.includes(trackGlobalIpLimit), 'POST /sp/e must include trackGlobalIpLimit')

    // 2. /sp/c route stack
    const layerC = proxyRouter.stack.find(s => s.route?.path === '/c' && s.route?.methods.post)
    assert.ok(layerC, 'POST /sp/c route should exist')
    const handlersC = layerC.route.stack.map(s => s.handle)
    assert.ok(handlersC.includes(conversionVisitorLimit), 'POST /sp/c must include conversionVisitorLimit')
    assert.ok(handlersC.includes(conversionIpLimit), 'POST /sp/c must include conversionIpLimit')
    assert.ok(handlersC.includes(conversionSiteLimit), 'POST /sp/c must include conversionSiteLimit')
    assert.ok(handlersC.includes(conversionGlobalIpLimit), 'POST /sp/c must include conversionGlobalIpLimit')

    // 3. /sp/pixel.gif route stack
    const layerPixel = proxyRouter.stack.find(s => s.route?.path === '/pixel.gif' && s.route?.methods.get)
    assert.ok(layerPixel, 'GET /sp/pixel.gif route should exist')
    const handlersPixel = layerPixel.route.stack.map(s => s.handle)
    assert.ok(handlersPixel.includes(trackVisitorLimit), 'GET /sp/pixel.gif must include trackVisitorLimit')
    assert.ok(handlersPixel.includes(trackIpLimit), 'GET /sp/pixel.gif must include trackIpLimit')
    assert.ok(handlersPixel.includes(trackSiteLimit), 'GET /sp/pixel.gif must include trackSiteLimit')
    assert.ok(handlersPixel.includes(trackGlobalIpLimit), 'GET /sp/pixel.gif must include trackGlobalIpLimit')

    // 4. GET /api/public/:token route stack
    const layerPublic = publicDashboardRouter.stack.find(s => s.route?.path === '/:token' && s.route?.methods.get)
    assert.ok(layerPublic, 'GET /api/public/:token route should exist')
    const handlersPublic = layerPublic.route.stack.map(s => s.handle)
    assert.ok(handlersPublic.includes(publicDashboardLimit), 'GET /api/public/:token must include publicDashboardLimit')
  })
})

test('Default Ingestion Rate Limiter Skip Tests (Session 140G-18)', async (t) => {
  const { isIngestionPath } = await import('../middleware/rate-limit.js')

  await t.test('skips /sp/e, /sp/c, /sp/pixel.gif, /api/pixel, /api/conversion/offline', async () => {
    assert.strictEqual(isIngestionPath('/sp/e'), true)
    assert.strictEqual(isIngestionPath('/sp/c'), true)
    assert.strictEqual(isIngestionPath('/sp/pixel.gif'), true)
    assert.strictEqual(isIngestionPath('/api/pixel'), true)
    assert.strictEqual(isIngestionPath('/api/conversion/offline'), true)
    assert.strictEqual(isIngestionPath('/api/track'), true)
    assert.strictEqual(isIngestionPath('/track'), true)
  })

  await t.test('does not skip normal api paths', async () => {
    assert.strictEqual(isIngestionPath('/api/attribution'), false)
    assert.strictEqual(isIngestionPath('/api/sessions'), false)
  })
})

// ── Early Bird Annual checkout plan resolution (Session 140Z-E) ───────────────

test('resolveCheckoutPrice — plan key validation', async (t) => {
  const saved = {
    STRIPE_PRICE_ID_STARTER:           process.env.STRIPE_PRICE_ID_STARTER,
    STRIPE_PRICE_ID_GROWTH:            process.env.STRIPE_PRICE_ID_GROWTH,
    STRIPE_PRICE_ID_SCALE:             process.env.STRIPE_PRICE_ID_SCALE,
    STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID: process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID,
    STRIPE_PRICE_ID:                   process.env.STRIPE_PRICE_ID,
  }

  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  await t.test('invalid plan key is rejected with 400', () => {
    const result = resolveCheckoutPrice('free')
    assert.strictEqual(result.status, 400)
    assert.ok(result.error.includes('Invalid plan'))
    assert.strictEqual(result.priceId, null)
  })

  await t.test('unknown plan key is rejected with 400', () => {
    const result = resolveCheckoutPrice('hacker_plan')
    assert.strictEqual(result.status, 400)
    assert.ok(result.error.includes('Invalid plan'))
  })

  await t.test('null / empty plan key is rejected with 400', () => {
    assert.strictEqual(resolveCheckoutPrice(null).status, 400)
    assert.strictEqual(resolveCheckoutPrice('').status, 400)
    assert.strictEqual(resolveCheckoutPrice(undefined).status, 400)
  })

  await t.test('early_bird_annual with price ID configured resolves priceId', () => {
    process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID = 'price_test_early_bird_annual_123'
    const result = resolveCheckoutPrice('early_bird_annual')
    assert.strictEqual(result.error, null)
    assert.strictEqual(result.priceId, 'price_test_early_bird_annual_123')
    assert.strictEqual(result.plan, 'early_bird_annual')
    assert.strictEqual(result.status, null)
  })

  await t.test('early_bird_annual without price ID returns 500 with safe error (no silent fallback)', () => {
    delete process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID
    // Even if legacy STRIPE_PRICE_ID is set, early_bird_annual must NOT use it
    process.env.STRIPE_PRICE_ID = 'price_legacy_growth_123'
    const result = resolveCheckoutPrice('early_bird_annual')
    assert.strictEqual(result.status, 500)
    assert.ok(result.error.includes('not yet configured'))
    assert.strictEqual(result.priceId, null)
    // Confirm it did NOT return the legacy price
    assert.notStrictEqual(result.priceId, 'price_legacy_growth_123')
  })

  await t.test('starter resolves to STRIPE_PRICE_ID_STARTER', () => {
    process.env.STRIPE_PRICE_ID_STARTER = 'price_test_starter_456'
    const result = resolveCheckoutPrice('starter')
    assert.strictEqual(result.error, null)
    assert.strictEqual(result.priceId, 'price_test_starter_456')
    assert.strictEqual(result.plan, 'starter')
  })

  await t.test('growth resolves to STRIPE_PRICE_ID_GROWTH', () => {
    process.env.STRIPE_PRICE_ID_GROWTH = 'price_test_growth_789'
    const result = resolveCheckoutPrice('growth')
    assert.strictEqual(result.error, null)
    assert.strictEqual(result.priceId, 'price_test_growth_789')
  })

  await t.test('pro (legacy alias) resolves to Growth price and returns plan growth', () => {
    process.env.STRIPE_PRICE_ID_GROWTH = 'price_test_growth_789'
    const result = resolveCheckoutPrice('pro')
    assert.strictEqual(result.error, null)
    assert.strictEqual(result.plan, 'growth')
    assert.strictEqual(result.priceId, 'price_test_growth_789')
  })

  await t.test('business (legacy alias) resolves to Scale price and returns plan scale', () => {
    process.env.STRIPE_PRICE_ID_SCALE = 'price_test_scale_abc'
    const result = resolveCheckoutPrice('business')
    assert.strictEqual(result.error, null)
    assert.strictEqual(result.plan, 'scale')
    assert.strictEqual(result.priceId, 'price_test_scale_abc')
  })

  await t.test('agency (legacy alias) resolves to Scale price and returns plan scale', () => {
    process.env.STRIPE_PRICE_ID_SCALE = 'price_test_scale_abc'
    const result = resolveCheckoutPrice('agency')
    assert.strictEqual(result.error, null)
    assert.strictEqual(result.plan, 'scale')
    assert.strictEqual(result.priceId, 'price_test_scale_abc')
  })
})

test('getPriceMap — early bird annual price ID maps to growth entitlements', async (t) => {
  const savedEarlyBird = process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID

  t.after(() => {
    if (savedEarlyBird === undefined) delete process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID
    else process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID = savedEarlyBird
  })

  await t.test('early_bird price ID present in map and maps to growth', () => {
    process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID = 'price_test_early_bird_abc'
    const map = getPriceMap()
    assert.strictEqual(map['price_test_early_bird_abc'], 'growth',
      'Founder (Early Bird annual) price ID must map to growth entitlements in webhook handler')
  })

  await t.test('early_bird price ID absent — not in map, does not default to growth', () => {
    delete process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID
    const map = getPriceMap()
    assert.strictEqual(map['price_test_early_bird_abc'], undefined,
      'Deleted early_bird price ID must not appear in map')
    // Confirm the map does not accidentally resolve it to growth
    assert.notStrictEqual(map['price_test_early_bird_abc'], 'growth')
  })
})

test('getCurrentMonthUsage — reads site_usage_monthly via service role (140G billing meter)', async (t) => {
  const client = getSupabase()
  const originalFrom = client.from

  // Capture the query the helper builds so we can assert table + filters.
  let captured = null
  function mockFrom(rowResult) {
    return (table) => {
      captured = { table, eqs: [] }
      const builder = {
        select: (cols) => { captured.cols = cols; return builder },
        eq: (col, val) => { captured.eqs.push([col, val]); return builder },
        maybeSingle: async () => rowResult
      }
      return builder
    }
  }

  // Expected UTC month key — identical formula to api/lib/pageview-limits.js
  const now = new Date()
  const expectedMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

  await t.test('defaults to 0/0 when no usage row exists for the month', async () => {
    client.from = mockFrom({ data: null, error: null })
    const usage = await getCurrentMonthUsage('site-abc')
    assert.strictEqual(captured.table, 'site_usage_monthly')
    assert.deepStrictEqual(captured.eqs[0], ['site_id', 'site-abc'])
    assert.deepStrictEqual(captured.eqs[1], ['month', expectedMonth])
    assert.deepStrictEqual(usage, { month: expectedMonth, pageview_count: 0, conversion_count: 0 })
  })

  await t.test('returns real counts when a row exists', async () => {
    client.from = mockFrom({ data: { pageview_count: 4213, conversion_count: 27 }, error: null })
    const usage = await getCurrentMonthUsage('site-abc')
    assert.deepStrictEqual(usage, { month: expectedMonth, pageview_count: 4213, conversion_count: 27 })
  })

  await t.test('throws on DB error (caller maps to 500)', async () => {
    client.from = mockFrom({ data: null, error: { message: 'boom' } })
    await assert.rejects(() => getCurrentMonthUsage('site-abc'))
  })

  client.from = originalFrom
})

// ─── Stripe billing webhook: persistence + idempotency recovery (Bugs A + B) ──
test('billingWebhookHandler — Founder checkout persists growth + retry recovers', async (t) => {
  const client = getSupabase()
  const originalFrom = client.from

  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  const savedEarlyBird = process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID
  process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID = 'price_founder_test'

  let lastUpdate = null   // payload of the last sites.update()
  let updateError = false // toggle to simulate a transient DB write failure
  let updateCalls = 0

  client.from = (table) => {
    if (table === 'sites') {
      return {
        update: (payload) => ({
          eq: async () => {
            updateCalls++
            if (updateError) return { error: { message: 'transient db error' } }
            lastUpdate = payload
            return { error: null }
          }
        }),
        // invalidateCacheBySiteId(): sites.select().eq().maybeSingle()
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'site-1', site_key: 'sk-1', domain: 'x.com' }, error: null }) }) })
      }
    }
    return originalFrom.call(client, table)
  }

  const evt = {
    id: 'evt-founder-recover-1',
    type: 'checkout.session.completed',
    data: { object: { client_reference_id: 'site-1', customer: 'cus_1', subscription: 'sub_1' } }
  }
  // Stub the exact Stripe client instance the handler uses (own-property shadow).
  const origConstructEvent = billingStripe.webhooks.constructEvent
  const origRetrieve = billingStripe.subscriptions.retrieve
  billingStripe.webhooks.constructEvent = () => evt
  billingStripe.subscriptions.retrieve = async () => ({ items: { data: [{ price: { id: 'price_founder_test' } }] } })

  t.after(() => {
    client.from = originalFrom
    billingStripe.webhooks.constructEvent = origConstructEvent
    billingStripe.subscriptions.retrieve = origRetrieve
    if (savedEarlyBird === undefined) delete process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID
    else process.env.STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID = savedEarlyBird
  })

  function mockReqRes() {
    const req = { headers: { 'stripe-signature': 'sig' }, body: Buffer.from('{}') }
    const out = { statusCode: 200, body: null }
    const res = {
      status(c) { out.statusCode = c; return this },
      json(b) { out.body = b; return this }
    }
    return { req, res, out }
  }

  // Bug B: transient DB failure → 500, and the event is NOT claimed as processed.
  await t.test('transient DB failure returns 500 without poisoning idempotency', async () => {
    updateError = true
    const m = mockReqRes()
    await billingWebhookHandler(m.req, m.res)
    assert.strictEqual(m.out.statusCode, 500, 'failed write must surface as 500')
  })

  // Bug A + B: Stripe retries the SAME event.id; it must re-process and persist
  // plan='growth', pv_limit=150000, stripe_customer_id, stripe_subscription_id.
  await t.test('retry of the same event recovers and writes full billing state', async () => {
    updateError = false
    const m = mockReqRes()
    await billingWebhookHandler(m.req, m.res)
    assert.strictEqual(m.out.statusCode, 200, 'retry should succeed, not be skipped as duplicate')
    assert.ok(lastUpdate, 'sites.update() must have been called on retry')
    assert.strictEqual(lastUpdate.plan, 'growth')
    assert.strictEqual(lastUpdate.pv_limit, 150000)
    assert.strictEqual(lastUpdate.stripe_customer_id, 'cus_1')
    assert.strictEqual(lastUpdate.stripe_subscription_id, 'sub_1')
  })

  // A genuine duplicate (same event already processed successfully) is skipped.
  await t.test('true duplicate after success is skipped without re-writing', async () => {
    const callsBefore = updateCalls
    const m = mockReqRes()
    await billingWebhookHandler(m.req, m.res)
    assert.strictEqual(m.out.statusCode, 200)
    assert.strictEqual(m.out.body?.duplicate, true)
    assert.strictEqual(updateCalls, callsBefore, 'duplicate must not trigger another DB write')
  })
})
