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
import { isValidRedirectUrl, getRedirectAllowlist, getDefaultBillingReturnUrl } from '../routes/billing.js'
import { checkTierLimit, bustTierCache } from '../middleware/tier-check.js'
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

    await proxyRouter(req, res, () => {})
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
