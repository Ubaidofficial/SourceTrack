import test from 'node:test'
import assert from 'node:assert'

// Set mock environment variables so getSupabase() doesn't throw
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

import { getSupabase } from '../lib/supabase.js'
import { resolveWebhookAnonymousId } from '../lib/identity-links.js'

test('Webhook Identity Resolution Precedence Unit Tests', async (t) => {
  const client = getSupabase()
  let mockData = null
  let mockError = null
  let queryCount = 0

  // Mutate singleton client's from method to intercept queries without hitting live database
  client.from = (table) => {
    assert.strictEqual(table, 'site_identity_links')
    return {
      select: (fields) => {
        assert.strictEqual(fields, 'anonymous_id')
        return {
          eq: (col1, val1) => {
            assert.strictEqual(col1, 'site_id')
            return {
              eq: (col2, val2) => {
                assert.strictEqual(col2, 'user_id')
                return {
                  order: (col3, opts3) => {
                    assert.strictEqual(col3, 'last_seen_at')
                    return {
                      order: (col4, opts4) => {
                        assert.strictEqual(col4, 'created_at')
                        return {
                          limit: (lim) => {
                            assert.strictEqual(lim, 1)
                            return {
                              maybeSingle: async () => {
                                queryCount++
                                return { data: mockData, error: mockError }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  t.afterEach(() => {
    mockData = null
    mockError = null
    queryCount = 0
  })

  await t.test('Scenario 1: explicit anonymous_id wins immediately without database query', async () => {
    const res = await resolveWebhookAnonymousId({
      siteId: 'site-123',
      anonymousId: 'st_aid_browser_explicit',
      visitorId: 'st_vid_cookieless',
      userId: 'user_999'
    })
    assert.deepStrictEqual(res, {
      anonymousId: 'st_aid_browser_explicit',
      source: 'anonymous_id',
      fallback: false
    })
    assert.strictEqual(queryCount, 0)
  })

  await t.test('Scenario 2: visitor_id aliases to anonymous_id if anonymous_id is missing', async () => {
    const res = await resolveWebhookAnonymousId({
      siteId: 'site-123',
      visitorId: 'st_vid_cookieless',
      userId: 'user_999'
    })
    assert.deepStrictEqual(res, {
      anonymousId: 'st_vid_cookieless',
      source: 'visitor_id',
      fallback: false
    })
    assert.strictEqual(queryCount, 0)
  })

  await t.test('Scenario 3: user_id query is executed and resolved when browser IDs are missing', async () => {
    mockData = { anonymous_id: 'st_aid_resolved_from_links' }
    const res = await resolveWebhookAnonymousId({
      siteId: 'site-123',
      userId: 'user_999'
    })
    assert.deepStrictEqual(res, {
      anonymousId: 'st_aid_resolved_from_links',
      source: 'user_id_resolved',
      fallback: false
    })
    assert.strictEqual(queryCount, 1)
  })

  await t.test('Scenario 4: unresolved user_id query falls back cleanly', async () => {
    mockData = null
    const res = await resolveWebhookAnonymousId({
      siteId: 'site-123',
      userId: 'user_unregistered'
    })
    assert.deepStrictEqual(res, {
      anonymousId: null,
      source: 'none',
      fallback: true
    })
    assert.strictEqual(queryCount, 1)
  })

  await t.test('Scenario 5: database error falls back cleanly to unresolved', async () => {
    mockData = null
    mockError = new Error('Database lookup timed out')
    const res = await resolveWebhookAnonymousId({
      siteId: 'site-123',
      userId: 'user_unregistered'
    })
    assert.deepStrictEqual(res, {
      anonymousId: null,
      source: 'none',
      fallback: true
    })
    assert.strictEqual(queryCount, 1)
  })

  await t.test('Scenario 6: plaintext email/customer_id are not resolved to avoid privacy leaks', async () => {
    const res = await resolveWebhookAnonymousId({
      siteId: 'site-123',
      email: 'customer@example.com',
      customerId: 'cus_12345'
    })
    assert.deepStrictEqual(res, {
      anonymousId: null,
      source: 'none',
      fallback: true
    })
    assert.strictEqual(queryCount, 0)
  })
})
