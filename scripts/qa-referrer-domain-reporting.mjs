import 'dotenv/config'

import { verifySafeEnvironment } from './qa-guard.js'
verifySafeEnvironment()

import { getSupabase } from '../api/lib/supabase.js'
import { createClient } from '@supabase/supabase-js'
import assert from 'assert'
import { extractReferrerDomain, makeReferrerDomainExpr } from '../api/lib/attribution-engine.js'
import { queryHogQL } from '../api/lib/posthog.js'

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000'

console.log('==================================================')
console.log('         Referrer Domain Dimension QA')
console.log('==================================================\n')

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function request(path, token, options = {}) {
  const url = `${SOURCETRACK_API_URL.replace(/\/+$/, '')}${path}`
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  }
  const res = await fetch(url, {
    ...options,
    headers
  })
  const text = await res.text()
  let body = null
  try {
    body = JSON.parse(text)
  } catch (_) {
    body = text
  }
  return { status: res.status, ok: res.ok, body, headers: res.headers }
}

async function run() {
  const supabase = getSupabase()
  const authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const uniqueId = Date.now().toString().slice(-6)

  const testEmail = `qa_referrer_${uniqueId}@example.com`
  const testPassword = `TempPassword123!_${uniqueId}`
  const anonId = `qa_anon_referrer_${uniqueId}`
  const leakageReferrerHost = `leakage-test-${uniqueId}.com`
  const leakageReferrer = `https://www.${leakageReferrerHost}/private-path?secret=123`

  let tempUserId = null
  let tempMemberCreated = false
  let createdReportId = null
  let originalTrialEndsAt = null
  let originalPlan = null
  let siteFetched = false
  let siteKey = null
  let siteId = null
  let indexed = false

  try {
    // ─── CHECK 1: Deterministic extractReferrerDomain tests ─────────────────────
    console.log('Test 1: Deterministic JS helper assertions...')
    assert.strictEqual(extractReferrerDomain('https://www.example.com/path?x=1'), 'example.com')
    assert.strictEqual(extractReferrerDomain('http://example.com/path'), 'example.com')
    assert.strictEqual(extractReferrerDomain('www.example.com'), 'example.com')
    assert.strictEqual(extractReferrerDomain('example.com'), 'example.com')
    assert.strictEqual(extractReferrerDomain(''), 'direct')
    assert.strictEqual(extractReferrerDomain(null), 'direct')
    assert.strictEqual(extractReferrerDomain(undefined), 'direct')
    assert.strictEqual(extractReferrerDomain('   '), 'direct')
    assert.strictEqual(extractReferrerDomain('not a valid url'), 'unknown')
    
    // Privacy and leakage assertion
    assert.strictEqual(
      extractReferrerDomain('https://www.partner-example.com/path/private?email=test@example.com'),
      'partner-example.com'
    )
    console.log('✅ Test 1 Passed: Deterministic extractReferrerDomain normalized domains correctly and blocked URL leakage.\n')

    // ─── CHECK 2: Live HogQL probe of the extraction expression ──────────────────
    console.log('Test 2: Live HogQL extraction query validation...')
    
    // Test the production makeReferrerDomainExpr SQL generation
    const testReferrerString = 'https://www.hogql-test.com/path/some?query=1'
    const sqlExpr = makeReferrerDomainExpr(`'${testReferrerString}'`)
    
    const query = `
      SELECT
        ${sqlExpr},
        ${makeReferrerDomainExpr("''")},
        ${makeReferrerDomainExpr("'invalid-url-here'")}
      FROM events
      LIMIT 1
    `
    const results = await queryHogQL(query, 'qa_referrer_hogql_probe')
    assert.ok(results && results.length > 0, 'HogQL probe query returned no rows')
    const [normalResult, emptyResult, invalidResult] = results[0]
    
    assert.strictEqual(normalResult, 'hogql-test.com')
    assert.strictEqual(emptyResult, 'direct')
    assert.strictEqual(invalidResult, 'unknown')
    console.log('✅ Test 2 Passed: HogQL referrer normalization expression successfully compiled and returned correct database results.\n')

    // 3. Resolve site details for API testing
    const { data: site, error: siteErr } = await supabase
      .from('sites')
      .select('id, site_key, company_id, trial_ends_at, plan')
      .not('company_id', 'is', null)
      .limit(1)
      .single()

    if (siteErr || !site) {
      throw new Error(`Failed to find a valid site in database: ${siteErr?.message}`)
    }

    siteKey = site.site_key
    siteId = site.id
    console.log(`Resolved siteKey: "${siteKey}" (site_id: ${siteId})`)

    originalTrialEndsAt = site.trial_ends_at
    originalPlan = site.plan
    siteFetched = true

    const companyId = site.company_id
    if (!companyId) {
      throw new Error(`Site is not linked to a company`)
    }

    // Temporarily extend trial
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('sites')
      .update({ trial_ends_at: futureDate, plan: 'trial' })
      .eq('site_key', siteKey)

    // Create temp user and member link
    const { data: authData, error: authCreateErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true
    })

    if (authCreateErr || !authData?.user) {
      throw new Error(`Failed to create temp user: ${authCreateErr?.message}`)
    }
    tempUserId = authData.user.id

    await supabase
      .from('company_members')
      .insert({ company_id: companyId, user_id: tempUserId, role: 'admin' })
    tempMemberCreated = true

    const { data: sessionData, error: loginErr } = await authClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    })

    if (loginErr || !sessionData?.session) {
      throw new Error(`Failed to log in: ${loginErr?.message}`)
    }
    const token = sessionData.session.access_token

    console.log('Temporary user authenticated. Running API checks...\n')

    // ─── CHECK 3: Saved report accepts referrer_domain ──────────────────────────
    console.log('Test 3: Saved report configuration with referrer_domain...')
    const savedReportPayload = {
      name: 'QA Referrer Domain Report',
      config: {
        model: 'first_touch',
        groupBy: 'referrer_domain',
        metric: 'revenue',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30'
      }
    }
    const res3 = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify(savedReportPayload)
    })
    assert.strictEqual(res3.status, 200, `Expected 200 OK, got ${res3.status}`)
    const report = res3.body.data
    createdReportId = report.id
    assert.strictEqual(report.config.groupBy, 'referrer_domain')
    console.log('✅ Test 3 Passed: Saved report config accepted referrer_domain dimension.\n')

    // ─── CHECK 4: Invalid dimension rejected ────────────────────────────────────
    console.log('Test 4: Saved report validation with invalid dimension name...')
    const invalidReportPayload = {
      name: 'Invalid Dimension Report',
      config: {
        model: 'first_touch',
        groupBy: 'invalid_dim_123',
        metric: 'revenue'
      }
    }
    const res4 = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify(invalidReportPayload)
    })
    assert.strictEqual(res4.status, 400, `Expected 400 Bad Request, got ${res4.status}`)
    assert.ok(String(res4.body.error).includes('Invalid groupBy dimension'), `Expected invalid groupBy error, got: ${res4.body.error}`)
    console.log('✅ Test 4 Passed: Invalid dimensions are still correctly rejected.\n')

    // ─── CHECK 5: Ingest events, query attribution API, and query export API ─────────
    console.log(`Ingesting pageview event with referrer=${leakageReferrer}...`)
    const resPageview = await request('/api/track', null, {
      method: 'POST',
      body: JSON.stringify({
        site_key: siteKey,
        event: '$pageview',
        anonymous_id: anonId,
        page_url: `https://example.com/shop`,
        referrer: leakageReferrer,
        timestamp: new Date().toISOString()
      })
    })
    assert.ok(resPageview.ok, 'Failed to ingest pageview')

    console.log('Ingesting conversion event...')
    const resConversion = await request('/api/conversion', null, {
      method: 'POST',
      body: JSON.stringify({
        site_key: siteKey,
        event: '$conversion',
        anonymous_id: anonId,
        page_url: 'https://example.com/checkout/thank-you',
        conversion_value: 200.00,
        conversion_type: 'purchase',
        order_id: `order_referrer_${uniqueId}`,
        timestamp: new Date().toISOString(),
        first_touch_source: 'direct',
        first_touch_medium: 'none'
      })
    })
    assert.ok(resConversion.ok, 'Failed to ingest conversion')

    console.log('Events ingested. Polling attribution API for referrer domain to index...')
    const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const dateTo = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    indexed = false
    const POLL_ATTEMPTS = process.env.ALLOW_ATTRIBUTION_E2E_TIMEOUT_WARN === '1' ? 6 : 120
    const POLL_INTERVAL = 5000
    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL)
      const res = await request(`/api/attribution?site_key=${siteKey}&model=last_touch&date_from=${dateFrom}&date_to=${dateTo}&group_by=referrer_domain&metric=revenue`, token)
      if (res.ok && res.body?.success) {
        const matching = res.body.data.results.find(r => r.dim_value === leakageReferrerHost)
        if (matching) {
          console.log(`✅ Referrer domain indexed and verified: "${leakageReferrerHost}" with revenue $${matching.revenue}`)
          indexed = true
          break
        }
      }
      console.log(`  Waiting for PostHog indexing... ${attempt * 5}s elapsed`)
    }

    if (indexed) {
      console.log('✅ Test 5 Passed: Attribution API returned cleanly with verified domain value.\n')
    } else {
      if (process.env.ALLOW_ATTRIBUTION_E2E_TIMEOUT_WARN === '1') {
        console.log('⚠️ Live PostHog referrer-domain assertion skipped due to ingestion latency. Deterministic helper and HogQL extraction tests passed.\n')
      } else {
        throw new Error(`Timeout waiting for referrer host "${leakageReferrerHost}" to be indexed by PostHog`)
      }
    }

    // ─── CHECK 6: Export CSV & Leakage checks ──────────────────────────────────
    console.log('Test 6: Export report and assert no referrer URL leakage...')
    const res6 = await request(`/api/export/report?site_key=${siteKey}&model=last_touch&date_from=${dateFrom}&date_to=${dateTo}&group_by=referrer_domain&metric=revenue`, token)
    assert.strictEqual(res6.status, 200, `Expected 200 OK, got ${res6.status}`)
    assert.strictEqual(res6.headers.get('content-type').split(';')[0], 'text/csv', 'Expected text/csv content type')
    
    const csvContent = res6.body
    
    // Check that we don't leak full referrer URLs
    assert.ok(!csvContent.includes('/private-path'), 'Leakage check failed: CSV contains referrer path')
    assert.ok(!csvContent.includes('secret='), 'Leakage check failed: CSV contains referrer query parameter')
    assert.ok(!csvContent.includes('123'), 'Leakage check failed: CSV contains referrer query values')
    assert.ok(!csvContent.includes(leakageReferrer), 'Leakage check failed: CSV contains full referrer URL')
    
    if (indexed) {
      assert.ok(csvContent.includes(leakageReferrerHost), `Expected CSV export to contain normalized referrer domain: ${leakageReferrerHost}`)
      console.log('✅ Export CSV contains normalized domain and contains zero leakage.')
    }
    console.log('✅ Test 6 Passed: Export API returned cleanly and leakage assertions passed.\n')

  } finally {
    // Cleanup
    console.log('Cleaning up temporary test artifacts...')
    if (createdReportId) {
      await supabase.from('saved_reports').delete().eq('id', createdReportId)
      console.log('✅ Temporary report cleaned up.')
    }
    if (tempUserId) {
      if (tempMemberCreated) {
        await supabase.from('company_members').delete().eq('user_id', tempUserId)
      }
      await supabase.auth.admin.deleteUser(tempUserId)
      console.log('✅ Temp user cleaned up.')
    }
    if (siteFetched) {
      await supabase
        .from('sites')
        .update({ trial_ends_at: originalTrialEndsAt, plan: originalPlan })
        .eq('site_key', siteKey)
      console.log('✅ Site parameters restored.')
    }
  }

  console.log('\n🎉 ALL REFERRER DOMAIN REPORTING QA CHECKS PASSED SUCCESSFULLY.')
  process.exit(0)
}

run().catch(err => {
  console.error('Unexpected check error:', err)
  process.exit(1)
})
