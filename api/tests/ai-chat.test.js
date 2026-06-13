// Set mock environment variables so posthog and getSupabase() don't throw on import
process.env.POSTHOG_API_KEY = 'mock-posthog-api-key'
process.env.POSTHOG_HOST = 'https://mock.posthog.com'
process.env.SUPABASE_URL = 'https://mock-proj.supabase.co'
process.env.SUPABASE_SERVICE_KEY = 'mock-service-role-key-value'

import test from 'node:test'
import assert from 'node:assert'

test('AI Chat HogQL Validation Tenant Isolation Tests', async (t) => {
  // Use dynamic import so that mock environment variables are set before posthog client evaluates
  const { validateHogQL } = await import('../routes/ai-chat.js')
  const siteId = 'correct-site-123'

  await t.test('Valid test case with correct site ID equality', () => {
    const query = `SELECT event, count() FROM events WHERE properties.site_id = '${siteId}' AND timestamp >= now() - INTERVAL 7 DAY GROUP BY event LIMIT 10`
    assert.strictEqual(validateHogQL(query, siteId), true)
  })

  await t.test('Valid test case with double quotes and whitespace variations', () => {
    const query = `select event, count() from events where properties.site_id   =   "${siteId}" AND timestamp >= now() - INTERVAL 7 DAY GROUP BY event`
    assert.strictEqual(validateHogQL(query, siteId), true)
  })

  await t.test('Valid test case with trailing semicolon', () => {
    const query = `SELECT * FROM events WHERE properties.site_id = '${siteId}';`
    assert.strictEqual(validateHogQL(query, siteId), true)
  })

  await t.test('Bypass test case: OR condition in WHERE clause', () => {
    const query = `SELECT * FROM events WHERE properties.site_id = '${siteId}' OR properties.site_id = 'other'`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })

  await t.test('Bypass test case: Semicolon statement chaining', () => {
    const query = `SELECT * FROM events WHERE properties.site_id = '${siteId}'; SELECT * FROM events`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })

  await t.test('Bypass test case: IN condition instead of strict equality', () => {
    const query = `SELECT * FROM events WHERE properties.site_id IN ('${siteId}','other')`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })

  await t.test('Bypass test case: Inequality check (!=)', () => {
    const query = `SELECT * FROM events WHERE properties.site_id != 'other'`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })

  await t.test('Bypass test case: UNION statement', () => {
    const query = `SELECT * FROM events WHERE properties.site_id = '${siteId}' UNION SELECT * FROM events`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })

  await t.test('Bypass test case: WITH statement', () => {
    const query = `WITH x AS (SELECT * FROM events) SELECT * FROM x WHERE properties.site_id = '${siteId}'`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })

  await t.test('Bypass test case: Querying other table than events', () => {
    const query = `SELECT * FROM persons WHERE properties.site_id = '${siteId}'`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })

  await t.test('Bypass test case: Comments present (--)', () => {
    const query = `SELECT * FROM events WHERE properties.site_id = '${siteId}' -- comment`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })

  await t.test('Bypass test case: Comments present (/* */)', () => {
    const query = `SELECT * FROM events WHERE properties.site_id = '${siteId}' /* comment */`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })

  await t.test('Bypass test case: Wrong site ID value', () => {
    const query = `SELECT * FROM events WHERE properties.site_id = 'wrong-site-456'`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })

  await t.test('Bypass test case: No site ID check at all', () => {
    const query = `SELECT * FROM events`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })


  await t.test('Bypass test case: site ID equality only in SELECT projection, not WHERE filter', () => {
    const query = `SELECT properties.site_id = '${siteId}' FROM events LIMIT 10`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })

  await t.test('Bypass test case: site ID equality outside WHERE while WHERE is unscoped', () => {
    const query = `SELECT event FROM events WHERE event = '$pageview' GROUP BY properties.site_id = '${siteId}'`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })
  await t.test('Bypass test case: Multiple properties.site_id with one invalid', () => {
    const query = `SELECT * FROM events WHERE properties.site_id = '${siteId}' AND properties.site_id != '${siteId}'`
    assert.strictEqual(validateHogQL(query, siteId), false)
  })
})
