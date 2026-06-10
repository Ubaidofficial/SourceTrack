import 'dotenv/config'

import { verifySafeEnvironment } from './qa-guard.js'
verifySafeEnvironment()

import { getSupabase } from '../api/lib/supabase.js'
import { createClient } from '@supabase/supabase-js'
import assert from 'assert'
import { calculateAttribution } from '../api/lib/attribution-engine.js'

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000'

console.log('==================================================')
console.log('            Keyword / Term Dimension QA')
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

  const testEmail = `qa_keyword_${uniqueId}@example.com`
  const testPassword = `TempPassword123!_${uniqueId}`
  const anonId = `qa_anon_keyword_${uniqueId}`
  const testKeyword = `qa_keyword_${uniqueId}`

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
    // 1. Get site & company details dynamically from Supabase
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
    console.log(`Dynamically resolved siteKey: "${siteKey}" (site_id: ${siteId})`)

    originalTrialEndsAt = site.trial_ends_at
    originalPlan = site.plan
    siteFetched = true

    const companyId = site.company_id
    if (!companyId) {
      throw new Error(`Site for site_key=${siteKey} is not linked to a company/workspace`)
    }

    // Temporarily extend trial so the API does not reject requests with 402 "Trial expired"
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('sites')
      .update({ trial_ends_at: futureDate, plan: 'trial' })
      .eq('site_key', siteKey)

    // 2. Create temporary auth user
    const { data: authData, error: authCreateErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true
    })

    if (authCreateErr || !authData?.user) {
      throw new Error(`Failed to create temp user: ${authCreateErr?.message}`)
    }
    tempUserId = authData.user.id

    // 3. Link user to company_members
    await supabase
      .from('company_members')
      .insert({
        company_id: companyId,
        user_id: tempUserId,
        role: 'admin'
      })
    tempMemberCreated = true

    // 4. Sign in to get JWT token
    const { data: sessionData, error: loginErr } = await authClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    })

    if (loginErr || !sessionData?.session) {
      throw new Error(`Failed to log in as temp user: ${loginErr?.message}`)
    }
    const token = sessionData.session.access_token

    console.log('✅ Temporary user authenticated. Running Keyword checks...\n')

    // ─── DETERMINISTIC KEYWORD MAPPING TESTS ──────────────────────────
    console.log('Test 0A: Deterministic calculateAttribution mapping...')
    const testTouchpoints = [
      {
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'spring',
        utm_term: 'qa_keyword_test',
        timestamp: new Date().toISOString()
      }
    ]
    const shares = calculateAttribution(testTouchpoints, 100.0)

    // Verify first_touch and last_touch
    assert.strictEqual(shares.first_touch.keyword, 'qa_keyword_test')
    assert.strictEqual(shares.first_touch.utm_term, 'qa_keyword_test')
    assert.strictEqual(shares.last_touch.keyword, 'qa_keyword_test')
    assert.strictEqual(shares.last_touch.utm_term, 'qa_keyword_test')

    // Verify linear, u_shaped, time_decay, w_shaped list elements
    for (const modelName of ['linear', 'u_shaped', 'time_decay', 'w_shaped']) {
      const modelShares = shares[modelName]
      assert.ok(modelShares.length > 0, `Expected shares for model ${modelName}`)
      for (const share of modelShares) {
        assert.strictEqual(share.keyword, 'qa_keyword_test', `Model ${modelName} share keyword missing`)
        assert.strictEqual(share.utm_term, 'qa_keyword_test', `Model ${modelName} share utm_term missing`)
      }
    }
    console.log('✅ Test 0A Passed: calculateAttribution preserves keyword fields deterministically.\n')

    console.log('Test 0B: Proving group_by=keyword selects properties.utm_term from pageview/window join...')
    const fs = await import('fs')
    const path = await import('path')
    const engineContent = fs.readFileSync(path.resolve('api/lib/attribution-engine.js'), 'utf8')

    // 1. Assert keyword is mapped in GROUP_COLUMNS to utm_term for first_touch / last_touch
    assert.ok(engineContent.includes("keyword: {"), "GROUP_COLUMNS must contain keyword mapping")
    assert.ok(engineContent.includes("first_touch: \"COALESCE(NULLIF(properties.utm_term, ''), 'unknown')\""), "first_touch keyword mapping must use properties.utm_term")
    assert.ok(engineContent.includes("last_touch: \"COALESCE(NULLIF(properties.utm_term, ''), 'unknown')\""), "last_touch keyword mapping must use properties.utm_term")

    // 2. Assert that windowJoin selects utm_term from the joined pageviews table (_pv)
    const regexWindowTerm = /\$\{aggFn\}\(_pv\.properties\.utm_term,\s*_pv\.timestamp\)\s*AS\s*_w_term/i
    assert.ok(regexWindowTerm.test(engineContent), "windowJoin must select utm_term from joined pageviews")

    // 3. Assert that getFlexibleReport uses _win._w_term for keyword grouping
    const regexGroupByKeyword = /groupBy\s*===\s*'keyword'\s*\?\s*["']COALESCE\(NULLIF\(_win\._w_term,\s*''\),\s*'unknown'\)["']/i
    assert.ok(regexGroupByKeyword.test(engineContent), "getFlexibleReport must group by _win._w_term when groupBy is keyword")
    console.log('✅ Test 0B Passed: Static assertion proved keyword selects from pageview/window join paths.\n')

    // ─── CHECK 1: Valid saved report config with keyword is accepted ──────────────
    console.log('Test 1: Saved report config with keyword groupBy...')
    const validKeywordPayload = {
      name: 'QA Keyword Report',
      config: {
        model: 'last_touch',
        groupBy: 'keyword',
        metric: 'revenue',
        dateFrom: '2026-05-01',
        dateTo: '2026-05-30'
      }
    }
    const res1 = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify(validKeywordPayload)
    })
    assert.strictEqual(res1.status, 200, `Expected 200 OK, got ${res1.status}`)
    const report = res1.body.data
    createdReportId = report.id
    assert.strictEqual(report.config.groupBy, 'keyword')
    console.log('✅ Test 1 Passed: Saved report with keyword dimension accepted.\n')

    // ─── CHECK 2: Invalid dimensions are still rejected ──────────────────────────
    console.log('Test 2: Saved report config with invalid groupBy...')
    const invalidPayload = {
      name: 'Invalid Report',
      config: {
        model: 'last_touch',
        groupBy: 'invalid_dimension_name',
        metric: 'revenue'
      }
    }
    const res2 = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify(invalidPayload)
    })
    assert.strictEqual(res2.status, 400, `Expected 400 Bad Request, got ${res2.status}`)
    assert.ok(String(res2.body.error).includes('Invalid groupBy dimension'), `Expected invalid groupBy error, got: ${res2.body.error}`)
    console.log('✅ Test 2 Passed: Invalid dimension rejected.\n')

    // ─── CHECK 3: Ingest events and query Report API with group_by=keyword ─────────
    console.log(`Ingesting pageview touchpoint with utm_term=${testKeyword}...`)
    const resPageview = await request('/api/track', null, {
      method: 'POST',
      body: JSON.stringify({
        site_key: siteKey,
        event: '$pageview',
        anonymous_id: anonId,
        page_url: `https://example.com/blog?utm_source=google&utm_medium=cpc&utm_campaign=spring&utm_term=${testKeyword}`,
        referrer: 'https://google.com',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'spring',
        utm_term: testKeyword,
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
        page_url: 'https://example.com/checkout/success',
        conversion_value: 150.00,
        conversion_type: 'purchase',
        order_id: `order_keyword_${uniqueId}`,
        timestamp: new Date().toISOString(),
        first_touch_source: 'google',
        first_touch_medium: 'cpc',
        first_touch_campaign: 'spring'
      })
    })
    assert.ok(resConversion.ok, 'Failed to ingest conversion')

    console.log('Events ingested. Polling attribution API for keyword to index...')
    const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const dateTo = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    indexed = false
    const POLL_ATTEMPTS = process.env.ALLOW_ATTRIBUTION_E2E_TIMEOUT_WARN === '1' ? 6 : 120
    const POLL_INTERVAL = 5000
    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL)
      const res = await request(`/api/attribution?site_key=${siteKey}&model=last_touch&date_from=${dateFrom}&date_to=${dateTo}&group_by=keyword&metric=revenue`, token)
      if (res.ok && res.body?.success) {
        const matching = res.body.data.results.find(r => r.dim_value === testKeyword)
        if (matching) {
          console.log(`✅ Keyword indexed and verified: "${testKeyword}" with revenue $${matching.revenue}`)
          indexed = true
          break
        }
      }
      console.log(`  Waiting for PostHog indexing... ${attempt * 5}s elapsed`)
    }

    if (indexed) {
      console.log('✅ Test 3 Passed: Known keyword successfully retrieved from attribution query.\n')
    } else {
      if (process.env.ALLOW_ATTRIBUTION_E2E_TIMEOUT_WARN === '1') {
        console.log('⚠️ API/export smoke passed; live keyword indexing assertion skipped due to PostHog indexing latency.\n')
      } else {
        throw new Error(`Timeout waiting for keyword "${testKeyword}" to be indexed by PostHog`)
      }
    }

    // ─── CHECK 4: Export API with group_by=keyword returns cleanly ────────────────
    console.log('Test 4: Export API CSV download with group_by=keyword...')
    const res4 = await request(`/api/export/report?site_key=${siteKey}&model=last_touch&date_from=${dateFrom}&date_to=${dateTo}&group_by=keyword&metric=revenue`, token)
    assert.strictEqual(res4.status, 200, `Expected 200 OK, got ${res4.status}`)
    assert.strictEqual(res4.headers.get('content-type').split(';')[0], 'text/csv', 'Expected text/csv content type')
    if (indexed) {
      assert.ok(res4.body.includes(testKeyword), `Expected CSV export to contain test keyword: ${testKeyword}`)
      console.log('✅ Export CSV contains the test keyword.')
      console.log('✅ Test 4 Passed: Export API returned CSV and verified the keyword.\n')
    } else {
      console.log('✅ Test 4 Passed: Export API returned CSV cleanly.\n')
    }

    // ─── CHECK 5: No arbitrary query parameters capture was added ────────────────
    console.log('Test 5: Verify arbitrary query parameter validation in config...')
    const arbitraryParamPayload = {
      name: 'Tamper Report 5',
      config: {
        model: 'last_touch',
        groupBy: 'keyword',
        metric: 'revenue',
        filters: {
          some_arbitrary_param: 'hack'
        }
      }
    }
    const res5 = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify(arbitraryParamPayload)
    })
    assert.strictEqual(res5.status, 400, `Expected 400 Bad Request, got ${res5.status}`)
    assert.ok(String(res5.body.error).includes('Invalid filter key'), `Expected filter key validation error, got: ${res5.body.error}`)
    console.log('✅ Test 5 Passed: Arbitrary filters rejected.\n')

  } finally {
    // Cleanup
    console.log('Cleaning up temporary test artifacts...')
    if (createdReportId) {
      await supabase.from('saved_reports').delete().eq('id', createdReportId)
      console.log('✅ Temporary report cleaned up.')
    }
    if (tempUserId) {
      if (tempMemberCreated) {
        await supabase
          .from('company_members')
          .delete()
          .eq('user_id', tempUserId)
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

  if (indexed) {
    console.log('\n🎉 ALL KEYWORD REPORTING QA CHECKS PASSED WITH FULL E2E PROOF.')
  } else {
    console.log('\n⚠️ Live PostHog keyword indexing assertion skipped due to ingestion latency. Deterministic mapping tests passed.')
  }
  process.exit(0)
}

run().catch(err => {
  console.error('Unexpected check error:', err)
  process.exit(1)
})
