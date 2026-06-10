import dotenv from 'dotenv'
dotenv.config()

import { verifySafeEnvironment } from './qa-guard.js'
verifySafeEnvironment()

import { getSupabase } from '../api/lib/supabase.js'
import { createClient } from '@supabase/supabase-js'
import assert from 'assert'

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000'

console.log('==================================================')
console.log('         Report Builder Security & Scoping QA')
console.log('==================================================\n')

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

  const testEmail = `qa_security_${uniqueId}@example.com`
  const testPassword = `TempPassword123!_${uniqueId}`

  let tempUserId = null
  let tempMemberCreated = false
  let tempUserIdB = null
  let tempMemberCreatedB = false
  let createdReportId = null
  let originalTrialEndsAt = null
  let originalPlan = null
  let siteFetched = false
  let siteKey = null
  let dummyReport = null

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
    console.log(`Dynamically resolved siteKey: "${siteKey}" (site_id: ${site.id})`)

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

    console.log('✅ Temporary user authenticated. Running checks...\n')

    // ─── CHECK 1: Configuration Tampering (Invalid fields) ──────────────────────
    console.log('Test 1: Saved report config tampering with invalid fields...')
    const invalidConfigPayload = {
      name: 'Tamper Report 1',
      config: {
        model: 'invalid_model_name',
        groupBy: 'channel',
        metric: 'revenue'
      }
    }
    const res1 = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify(invalidConfigPayload)
    })
    assert.strictEqual(res1.status, 400, `Expected 400 Bad Request, got ${res1.status}`)
    assert.ok(String(res1.body.error).includes('Invalid attribution model'), `Expected validation error message, got: ${res1.body.error}`)
    console.log('✅ Test 1 Passed: Invalid model rejected.\n')

    // ─── CHECK 1B: Configuration Tampering (Invalid dates) ──────────────────────
    console.log('Test 1B: Saved report config tampering with invalid dates...')
    const invalidDatePayload = {
      name: 'Tamper Report 1B',
      config: {
        model: 'last_touch',
        groupBy: 'channel',
        metric: 'revenue',
        dateFrom: '2026-99-99'
      }
    }
    const res1B = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify(invalidDatePayload)
    })
    assert.strictEqual(res1B.status, 400, `Expected 400 Bad Request, got ${res1B.status}`)
    assert.ok(String(res1B.body.error).includes('Invalid dateFrom format/value'), `Expected date validation error, got: ${res1B.body.error}`)
    console.log('✅ Test 1B Passed: Invalid date value rejected.\n')

    // ─── CHECK 1C: Configuration Tampering (Empty selectedMetrics) ────────────────
    console.log('Test 1C: Saved report config tampering with empty selectedMetrics...')
    const emptyMetricsPayload = {
      name: 'Tamper Report 1C',
      config: {
        model: 'last_touch',
        groupBy: 'channel',
        selectedMetrics: []
      }
    }
    const res1C = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify(emptyMetricsPayload)
    })
    assert.strictEqual(res1C.status, 400, `Expected 400 Bad Request, got ${res1C.status}`)
    assert.ok(String(res1C.body.error).includes('selectedMetrics must not be empty'), `Expected empty selectedMetrics error message, got: ${res1C.body.error}`)
    console.log('✅ Test 1C Passed: Empty selectedMetrics array rejected.\n')

    // ─── CHECK 2: Configuration Tampering (Forbidden override keys) ──────────────
    console.log('Test 2: Saved report config tampering with override keys...')
    const overrideConfigPayload = {
      name: 'Tamper Report 2',
      config: {
        model: 'last_touch',
        groupBy: 'channel',
        metric: 'revenue',
        site_id: 'some-site-id'
      }
    }
    const res2 = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify(overrideConfigPayload)
    })
    assert.strictEqual(res2.status, 400, `Expected 400 Bad Request, got ${res2.status}`)
    assert.ok(String(res2.body.error).includes('Invalid report config key') || String(res2.body.error).includes('Unauthorized override key'), `Expected override error, got: ${res2.body.error}`)
    console.log('✅ Test 2 Passed: Override keys rejected.\n')

    // ─── CHECK 3: Configuration Tampering (SQL/HogQL injection) ──────────────────
    console.log('Test 3: Saved report config tampering with SQL injection in filters...')
    const sqlConfigPayload = {
      name: 'Tamper Report 3',
      config: {
        model: 'last_touch',
        groupBy: 'channel',
        metric: 'revenue',
        filters: {
          campaign: "google' UNION SELECT * FROM sites;--"
        }
      }
    }
    const res3 = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify(sqlConfigPayload)
    })
    assert.strictEqual(res3.status, 400, `Expected 400 Bad Request, got ${res3.status}`)
    assert.ok(String(res3.body.error).includes('SQL/HogQL injection'), `Expected injection error, got: ${res3.body.error}`)
    console.log('✅ Test 3 Passed: Injection signature rejected.\n')

    // ─── CHECK 4: Cross-site scoping read/write isolation ─────────────────────────
    console.log('Test 4: Saved report cross-site scoping isolation...')
    // Get another site where user is NOT a member
    const { data: otherSite } = await supabase
      .from('sites')
      .select('id, site_key')
      .neq('company_id', companyId)
      .limit(1)
      .maybeSingle()

    if (otherSite) {
      console.log(`Found another site: ${otherSite.site_key}. Attempting unauthorized create...`)
      const crossSiteRes = await request(`/api/reports/saved?site_key=${otherSite.site_key}`, token, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Unauthorized Cross-Site Report',
          config: { model: 'last_touch', groupBy: 'channel', metric: 'revenue' }
        })
      })
      assert.strictEqual(crossSiteRes.status, 403, `Expected 403 Forbidden, got ${crossSiteRes.status}`)
      console.log('✅ Test 4a Passed: Cross-site create successfully blocked (403).')

      // Insert directly in database a saved report belonging to otherSite
      console.log('Inserting a dummy report belonging to the other site directly in Supabase...')
      const { data: dummyData, error: dummyErr } = await supabase
        .from('saved_reports')
        .insert({
          user_id: tempUserId,
          site_id: otherSite.id,
          name: 'Cross Site Dummy Report',
          config: { model: 'last_touch', groupBy: 'channel', metric: 'revenue' }
        })
        .select()
        .single()

      if (dummyErr) {
        throw new Error(`Failed to create dummy cross-site report: ${dummyErr.message}`)
      }
      dummyReport = dummyData

      // Attempt to update this report using our token and siteKey (which is the first site)
      console.log(`Attempting unauthorized update of report ${dummyReport.id} on site ${siteKey}...`)
      const crossUpdateRes = await request(`/api/reports/saved/${dummyReport.id}?site_key=${siteKey}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Updated Cross-Site Dummy Report',
          config: { model: 'last_touch', groupBy: 'channel', metric: 'revenue' }
        })
      })
      assert.strictEqual(crossUpdateRes.status, 404, `Expected 404 Not Found for cross-site update, got ${crossUpdateRes.status}`)
      console.log('✅ Test 4b Passed: Cross-site update successfully blocked (404).')

      // Attempt to delete this report using our token and siteKey
      console.log(`Attempting unauthorized delete of report ${dummyReport.id} on site ${siteKey}...`)
      const crossDeleteRes = await request(`/api/reports/saved/${dummyReport.id}?site_key=${siteKey}`, token, {
        method: 'DELETE'
      })
      assert.strictEqual(crossDeleteRes.status, 404, `Expected 404 Not Found for cross-site delete, got ${crossDeleteRes.status}`)
      console.log('✅ Test 4c Passed: Cross-site delete successfully blocked (404).')

    } else {
      console.log('⚠️ Skipping other site test: no other site found in DB.')
    }

    // ─── CHECK 4D: Cross-user scoping isolation on same site ──────────────────────
    console.log('Test 4D: Saved report cross-user scoping isolation (same site)...')
    // 1. Create a saved report owned by User A (our tempUserId)
    const createARes = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify({
        name: 'User A Report',
        config: { model: 'last_touch', groupBy: 'channel', metric: 'revenue' }
      })
    })
    assert.strictEqual(createARes.status, 200, `Expected 200 OK for report creation, got ${createARes.status}`)
    const reportA = createARes.body.data
    createdReportId = reportA.id
    console.log(`Created report ${createdReportId} owned by User A.`)

    // 2. Create User B in Supabase
    const testEmailB = `qa_security_b_${uniqueId}@example.com`
    const testPasswordB = `TempPassword123!_${uniqueId}`
    console.log(`Creating temp auth user B: ${testEmailB}...`)
    const { data: authDataB, error: authCreateErrB } = await supabase.auth.admin.createUser({
      email: testEmailB,
      password: testPasswordB,
      email_confirm: true
    })
    if (authCreateErrB || !authDataB?.user) {
      throw new Error(`Failed to create temp user B: ${authCreateErrB?.message}`)
    }
    tempUserIdB = authDataB.user.id

    // 3. Link User B to the same company, so they are a member of the site
    console.log(`Linking User B to company ${companyId}...`)
    const { error: memberErrB } = await supabase
      .from('company_members')
      .insert({
        company_id: companyId,
        user_id: tempUserIdB,
        role: 'admin'
      })
    if (memberErrB) {
      throw new Error(`Failed to link user B to company: ${memberErrB.message}`)
    }
    tempMemberCreatedB = true

    // 4. Log in as User B to get User B's JWT token
    console.log('Logging in as User B to obtain JWT B...')
    const { data: sessionDataB, error: loginErrB } = await authClient.auth.signInWithPassword({
      email: testEmailB,
      password: testPasswordB
    })
    if (loginErrB || !sessionDataB?.session) {
      throw new Error(`Failed to log in as User B: ${loginErrB?.message}`)
    }
    const tokenB = sessionDataB.session.access_token
    console.log('JWT B obtained successfully.')

    // 5. Attempt to update User A's report using User B's token (should be blocked with 403)
    console.log(`Attempting unauthorized update of report ${createdReportId} using User B's token...`)
    const crossUserUpdateRes = await request(`/api/reports/saved/${createdReportId}?site_key=${siteKey}`, tokenB, {
      method: 'PUT',
      body: JSON.stringify({
        name: 'Tampered Report Name',
        config: { model: 'last_touch', groupBy: 'channel', metric: 'revenue' }
      })
    })
    assert.strictEqual(crossUserUpdateRes.status, 403, `Expected 403 Forbidden for cross-user update, got ${crossUserUpdateRes.status}`)
    console.log('✅ Test 4d Passed: Cross-user update successfully blocked (403).')

    // 6. Attempt to delete User A's report using User B's token (should be blocked with 403)
    console.log(`Attempting unauthorized delete of report ${createdReportId} using User B's token...`)
    const crossUserDeleteRes = await request(`/api/reports/saved/${createdReportId}?site_key=${siteKey}`, tokenB, {
      method: 'DELETE'
    })
    assert.strictEqual(crossUserDeleteRes.status, 403, `Expected 403 Forbidden for cross-user delete, got ${crossUserDeleteRes.status}`)
    console.log('✅ Test 4e Passed: Cross-user delete successfully blocked (403).')
    console.log()

    // ─── CHECK 5: Export route invalid parameter validations ────────────────────
    console.log('Test 5: Export report invalid parameters checking...')
    const exportRes1 = await request(`/api/export/report?site_key=${siteKey}&model=invalid_model&group_by=channel&metric=revenue&date_from=2026-05-01&date_to=2026-05-30`, token)
    assert.strictEqual(exportRes1.status, 400, `Expected 400 Bad Request, got ${exportRes1.status}`)
    assert.ok(String(exportRes1.body.error).includes('Invalid model'), `Expected invalid model error, got: ${exportRes1.body.error}`)
    console.log('✅ Test 5 Passed: Invalid export parameters successfully rejected.\n')

    // ─── CHECK 6: Export CSV Database ID Cleansing ────────────────────────────────
    console.log('Test 6: Export CSV database IDs cleansing checks...')
    const exportRes2 = await request(`/api/export/report?site_key=${siteKey}&model=last_touch&group_by=channel&metric=revenue&date_from=2026-05-01&date_to=2026-05-30`, token)
    assert.strictEqual(exportRes2.status, 200, `Expected 200 OK, got ${exportRes2.status}`)
    
    const csvContent = exportRes2.body
    const lines = csvContent.split('\n')
    const headers = lines[0].split(',')

    console.log('Export CSV Headers:', headers)
    
    // Ensure database identifier columns are absent
    const forbiddenColumns = ['id', 'site_id', 'site_key', 'user_id', 'company_id', 'distinct_id', 'person_id']
    for (const col of forbiddenColumns) {
      assert.ok(!headers.includes(col), `Security Leak: CSV header contains internal column '${col}'`)
    }
    console.log('✅ Test 6 Passed: Internal database identifiers stripped successfully.')

  } finally {
    // Cleanup
    console.log('\nCleaning up temporary test artifacts...')
    if (createdReportId) {
      await supabase.from('saved_reports').delete().eq('id', createdReportId)
      console.log('✅ Temporary User A report cleaned up.')
    }
    if (dummyReport && dummyReport.id) {
      await supabase.from('saved_reports').delete().eq('id', dummyReport.id)
      console.log('✅ Temporary cross-site dummy report cleaned up.')
    }
    if (tempUserId) {
      if (tempMemberCreated) {
        await supabase
          .from('company_members')
          .delete()
          .eq('user_id', tempUserId)
      }
      await supabase.auth.admin.deleteUser(tempUserId)
      console.log('✅ Auth user A cleaned up.')
    }
    if (tempUserIdB) {
      if (tempMemberCreatedB) {
        await supabase
          .from('company_members')
          .delete()
          .eq('user_id', tempUserIdB)
      }
      await supabase.auth.admin.deleteUser(tempUserIdB)
      console.log('✅ Auth user B cleaned up.')
    }
    if (siteFetched) {
      await supabase
        .from('sites')
        .update({ trial_ends_at: originalTrialEndsAt, plan: originalPlan })
        .eq('site_key', siteKey)
      console.log('✅ Site parameters restored.')
    }
  }

  console.log('\n🎉 ALL SECURITY & SCOPING QA CHECKS PASSED.')
  process.exit(0)
}

run().catch(err => {
  console.error('Unexpected check error:', err)
  process.exit(1)
})
