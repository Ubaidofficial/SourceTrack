import test from 'node:test'
import assert from 'node:assert'

// Set mock environment variables so getSupabase() doesn't throw or complain about env-safety
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

import { getSupabase } from '../lib/supabase.js'
import { validateSiteKey, siteCache } from '../middleware/auth.js'

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
