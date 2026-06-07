import dotenv from 'dotenv'
dotenv.config()

import { getSupabase } from '../api/lib/supabase.js'
import { createClient } from '@supabase/supabase-js'
import assert from 'assert'

const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000'

console.log('==================================================')
console.log('       Dashboard Report Widgets QA Test')
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
  return { status: res.status, ok: res.ok, body }
}

async function run() {
  const supabase = getSupabase()
  const authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const uniqueId = Date.now().toString().slice(-6)

  const testEmail = `qa_widgets_${uniqueId}@example.com`
  const testPassword = `TempPassword123!_${uniqueId}`

  let tempUserId = null
  let tempMemberCreated = false
  let tempUserIdB = null
  let tempMemberCreatedB = false
  let createdReportIdA = null
  let createdReportIdB = null
  let bulkCreatedIds = []
  let dummyReport = null
  let originalTrialEndsAt = null
  let originalPlan = null
  let siteFetched = false
  let siteKey = null

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
    console.log(`Resolved siteKey: "${siteKey}" (site_id: ${site.id})`)

    originalTrialEndsAt = site.trial_ends_at
    originalPlan = site.plan
    siteFetched = true

    const companyId = site.company_id

    // Temporarily extend trial so the API does not reject requests with 402 "Trial expired"
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('sites')
      .update({ trial_ends_at: futureDate, plan: 'trial' })
      .eq('site_key', siteKey)

    // 2. Schema Column Verification
    console.log('\nTest 1: Schema columns exist check...')
    const { data: colsCheck, error: colsErr } = await supabase
      .from('saved_reports')
      .select('show_on_dashboard, dashboard_position, dashboard_size')
      .limit(1)

    if (colsErr) {
      console.error('❌ Schema columns check failed!')
      throw new Error(`Migration has not been run: ${colsErr.message}`)
    }
    console.log('✅ Test 1 Passed: show_on_dashboard, dashboard_position, and dashboard_size columns exist.')

    // 3. Create temporary auth user A
    const { data: authData, error: authCreateErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true
    })

    if (authCreateErr || !authData?.user) {
      throw new Error(`Failed to create temp user A: ${authCreateErr?.message}`)
    }
    tempUserId = authData.user.id

    // Link User A to company_members
    await supabase
      .from('company_members')
      .insert({
        company_id: companyId,
        user_id: tempUserId,
        role: 'admin'
      })
    tempMemberCreated = true

    // Sign in User A
    const { data: sessionData, error: loginErr } = await authClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    })

    if (loginErr || !sessionData?.session) {
      throw new Error(`Failed to log in as User A: ${loginErr?.message}`)
    }
    const tokenA = sessionData.session.access_token
    console.log('✅ Test User A authenticated.')

    // 4. Create Saved Report
    console.log('\nTest 2: Create saved report config...')
    const reportPayload = {
      name: 'User A Widget 1',
      config: {
        model: 'last_touch',
        groupBy: 'source',
        metric: 'revenue',
        chartType: 'bar'
      }
    }
    const resCreate = await request(`/api/reports/saved?site_key=${siteKey}`, tokenA, {
      method: 'POST',
      body: JSON.stringify(reportPayload)
    })
    assert.strictEqual(resCreate.status, 200, `Expected 200, got ${resCreate.status}`)
    createdReportIdA = resCreate.body.data.id
    console.log(`✅ Test 2 Passed: Created saved report (ID: ${createdReportIdA}).`)

    // 5. Toggle show_on_dashboard and test validations
    console.log('\nTest 3: PATCH visibility toggling and validation...')
    
    // Test 3a: Toggle dashboard visibility (Success)
    const patchRes1 = await request(`/api/reports/saved/${createdReportIdA}/dashboard?site_key=${siteKey}`, tokenA, {
      method: 'PATCH',
      body: JSON.stringify({
        show_on_dashboard: true,
        dashboard_position: 1,
        dashboard_size: 'large'
      })
    })
    assert.strictEqual(patchRes1.status, 200, `Expected 200, got ${patchRes1.status}`)
    assert.strictEqual(patchRes1.body.data.show_on_dashboard, true)
    assert.strictEqual(patchRes1.body.data.dashboard_position, 1)
    assert.strictEqual(patchRes1.body.data.dashboard_size, 'large')
    console.log('✅ Test 3a Passed: Successfully patched visibility, position, and size.')

    // Test 3b: Reject invalid dashboard_size
    const patchRes2 = await request(`/api/reports/saved/${createdReportIdA}/dashboard?site_key=${siteKey}`, tokenA, {
      method: 'PATCH',
      body: JSON.stringify({
        show_on_dashboard: true,
        dashboard_size: 'huge'
      })
    })
    assert.strictEqual(patchRes2.status, 400, `Expected 400, got ${patchRes2.status}`)
    console.log('✅ Test 3b Passed: Rejected invalid dashboard_size.')

    // Test 3c: Reject negative dashboard_position
    const patchRes3 = await request(`/api/reports/saved/${createdReportIdA}/dashboard?site_key=${siteKey}`, tokenA, {
      method: 'PATCH',
      body: JSON.stringify({
        show_on_dashboard: true,
        dashboard_position: -5
      })
    })
    assert.strictEqual(patchRes3.status, 400, `Expected 400, got ${patchRes3.status}`)
    console.log('✅ Test 3c Passed: Rejected negative dashboard_position.')

    // Test 3d: Reject non-integer dashboard_position
    const patchRes4 = await request(`/api/reports/saved/${createdReportIdA}/dashboard?site_key=${siteKey}`, tokenA, {
      method: 'PATCH',
      body: JSON.stringify({
        show_on_dashboard: true,
        dashboard_position: 2.5
      })
    })
    assert.strictEqual(patchRes4.status, 400, `Expected 400, got ${patchRes4.status}`)
    console.log('✅ Test 3d Passed: Rejected non-integer dashboard_position.')

    // Test 3e: Reject missing show_on_dashboard
    const patchRes5 = await request(`/api/reports/saved/${createdReportIdA}/dashboard?site_key=${siteKey}`, tokenA, {
      method: 'PATCH',
      body: JSON.stringify({
        dashboard_position: 1
      })
    })
    assert.strictEqual(patchRes5.status, 400, `Expected 400, got ${patchRes5.status}`)
    console.log('✅ Test 3e Passed: Rejected missing show_on_dashboard.')

    // Test 3f: Reject non-boolean show_on_dashboard (string "true")
    const patchRes6 = await request(`/api/reports/saved/${createdReportIdA}/dashboard?site_key=${siteKey}`, tokenA, {
      method: 'PATCH',
      body: JSON.stringify({
        show_on_dashboard: "true",
        dashboard_position: 1
      })
    })
    assert.strictEqual(patchRes6.status, 400, `Expected 400, got ${patchRes6.status}`)
    console.log('✅ Test 3f Passed: Rejected non-boolean string "true" for show_on_dashboard.')

    // Test 3g: Reject non-number string for dashboard_position ("abc")
    const patchRes7 = await request(`/api/reports/saved/${createdReportIdA}/dashboard?site_key=${siteKey}`, tokenA, {
      method: 'PATCH',
      body: JSON.stringify({
        show_on_dashboard: true,
        dashboard_position: "abc"
      })
    })
    assert.strictEqual(patchRes7.status, 400, `Expected 400, got ${patchRes7.status}`)
    console.log('✅ Test 3g Passed: Rejected non-number string "abc" for dashboard_position.')

    // 6. Test list endpoints (filter, exclusion, limit, sorting)
    console.log('\nTest 4: Get widgets / Pinned reports listing checks...')
    
    // Create a second report, but keep it unpinned
    const resCreateB = await request(`/api/reports/saved?site_key=${siteKey}`, tokenA, {
      method: 'POST',
      body: JSON.stringify({
        name: 'User A Unpinned Report',
        config: { model: 'last_touch', groupBy: 'source', metric: 'conversions' }
      })
    })
    assert.strictEqual(resCreateB.status, 200)
    createdReportIdB = resCreateB.body.data.id

    // Fetch dashboard widgets (show_on_dashboard=true)
    const listDash = await request(`/api/reports/saved?site_key=${siteKey}&show_on_dashboard=true`, tokenA)
    assert.strictEqual(listDash.status, 200)
    const pinnedReports = listDash.body.data
    assert.ok(pinnedReports.length >= 1)
    
    // Unpinned report must be excluded
    const hasUnpinned = pinnedReports.some(r => r.id === createdReportIdB)
    assert.ok(!hasUnpinned, 'Security failure: Dashboard widget list returns unpinned reports.')
    
    // Pinned report must be present
    const hasPinned = pinnedReports.some(r => r.id === createdReportIdA)
    assert.ok(hasPinned, 'Error: Dashboard widgets list is missing pinned report.')
    console.log('✅ Test 4 Passed: Dashboard list successfully filters widgets and excludes unpinned reports.')

    console.log('\nTest 4b: Max 9 pinned reports limit and dashboard_position ASC ordering checks...')
    // Create 10 more reports, and pin them with different dashboard_positions.
    const positions = [10, 5, 2, 8, 4, 3, 11, 9, 6, 7]
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i]
      const res = await request(`/api/reports/saved?site_key=${siteKey}`, tokenA, {
        method: 'POST',
        body: JSON.stringify({
          name: `Widget Pos ${pos}`,
          config: { model: 'last_touch', groupBy: 'source', metric: 'revenue' }
        })
      })
      assert.strictEqual(res.status, 200)
      const reportId = res.body.data.id
      bulkCreatedIds.push(reportId)

      const pinRes = await request(`/api/reports/saved/${reportId}/dashboard?site_key=${siteKey}`, tokenA, {
        method: 'PATCH',
        body: JSON.stringify({
          show_on_dashboard: true,
          dashboard_position: pos,
          dashboard_size: 'medium'
        })
      })
      assert.strictEqual(pinRes.status, 200)
    }

    // Fetch widgets (maximum 9 should be returned)
    const listDash2 = await request(`/api/reports/saved?site_key=${siteKey}&show_on_dashboard=true`, tokenA)
    assert.strictEqual(listDash2.status, 200)
    const pinnedReports2 = listDash2.body.data

    // Verify limit of 9
    assert.strictEqual(pinnedReports2.length, 9, `Expected maximum of 9 pinned reports, got ${pinnedReports2.length}`)
    console.log('✅ Test 4b Passed: Limit of 9 pinned reports verified.')

    // Verify dashboard_position ASC ordering
    for (let i = 0; i < pinnedReports2.length - 1; i++) {
      const posCurrent = pinnedReports2[i].dashboard_position
      const posNext = pinnedReports2[i + 1].dashboard_position
      assert.ok(posCurrent <= posNext, `Ordering violation: position ${posCurrent} came before ${posNext}`)
    }
    console.log('✅ Test 4c Passed: dashboard_position ASC ordering verified.')


    // 7. Security Isolation Checks (Cross-user, Cross-site)
    console.log('\nTest 5: Dashboard widgets security isolation...')
    
    // Create temporary User B
    const testEmailB = `qa_widgets_b_${uniqueId}@example.com`
    const testPasswordB = `TempPassword123!_${uniqueId}`
    const { data: authDataB, error: authCreateErrB } = await supabase.auth.admin.createUser({
      email: testEmailB,
      password: testPasswordB,
      email_confirm: true
    })
    if (authCreateErrB || !authDataB?.user) {
      throw new Error(`Failed to create temp user B: ${authCreateErrB?.message}`)
    }
    tempUserIdB = authDataB.user.id

    // Link User B to the same company
    await supabase
      .from('company_members')
      .insert({
        company_id: companyId,
        user_id: tempUserIdB,
        role: 'admin'
      })
    tempMemberCreatedB = true

    // Login as User B
    const { data: sessionDataB, error: loginErrB } = await authClient.auth.signInWithPassword({
      email: testEmailB,
      password: testPasswordB
    })
    if (loginErrB || !sessionDataB?.session) {
      throw new Error(`Failed to log in as User B: ${loginErrB?.message}`)
    }
    const tokenB = sessionDataB.session.access_token

    // Attempt to PATCH User A's report visibility using User B's token (should return 403)
    const patchCrossUser = await request(`/api/reports/saved/${createdReportIdA}/dashboard?site_key=${siteKey}`, tokenB, {
      method: 'PATCH',
      body: JSON.stringify({ show_on_dashboard: false })
    })
    assert.strictEqual(patchCrossUser.status, 403, `Expected 403 Forbidden for cross-user update, got ${patchCrossUser.status}`)
    console.log('✅ Test 5a Passed: Cross-user visibility toggle is correctly blocked (403).')

    // Test cross-site toggle security check if another site is present
    const { data: otherSite } = await supabase
      .from('sites')
      .select('id, site_key')
      .neq('company_id', companyId)
      .limit(1)
      .maybeSingle()

    if (otherSite) {
      console.log(`Found another site: ${otherSite.site_key}. Checking cross-site toggle isolation...`)
      
      // Insert directly in database a report belonging to otherSite
      const { data: dummyData, error: dummyErr } = await supabase
        .from('saved_reports')
        .insert({
          user_id: tempUserId,
          site_id: otherSite.id,
          name: 'Cross Site Dummy Widget',
          config: { model: 'last_touch', groupBy: 'channel', metric: 'revenue' }
        })
        .select()
        .single()

      if (dummyErr) throw dummyErr
      dummyReport = dummyData

      // Attempt to PATCH visibility on this cross-site report (should return 404)
      const patchCrossSite = await request(`/api/reports/saved/${dummyReport.id}/dashboard?site_key=${siteKey}`, tokenA, {
        method: 'PATCH',
        body: JSON.stringify({ show_on_dashboard: true })
      })
      assert.strictEqual(patchCrossSite.status, 404, `Expected 404 Not Found for cross-site toggle, got ${patchCrossSite.status}`)
      console.log('✅ Test 5b Passed: Cross-site visibility toggle is correctly blocked (404).')
    } else {
      console.log('⚠️ Skipping other site isolation test: no other site found in database.')
    }

  } finally {
    console.log('\nCleaning up QA artifacts...')
    if (createdReportIdA) {
      await supabase.from('saved_reports').delete().eq('id', createdReportIdA)
    }
    if (createdReportIdB) {
      await supabase.from('saved_reports').delete().eq('id', createdReportIdB)
    }
    if (bulkCreatedIds && bulkCreatedIds.length > 0) {
      for (const rId of bulkCreatedIds) {
        await supabase.from('saved_reports').delete().eq('id', rId)
      }
    }
    if (dummyReport && dummyReport.id) {
      await supabase.from('saved_reports').delete().eq('id', dummyReport.id)
    }
    if (tempUserId) {
      if (tempMemberCreated) {
        await supabase.from('company_members').delete().eq('user_id', tempUserId)
      }
      await supabase.auth.admin.deleteUser(tempUserId)
    }
    if (tempUserIdB) {
      if (tempMemberCreatedB) {
        await supabase.from('company_members').delete().eq('user_id', tempUserIdB)
      }
      await supabase.auth.admin.deleteUser(tempUserIdB)
    }
    if (siteFetched) {
      await supabase
        .from('sites')
        .update({ trial_ends_at: originalTrialEndsAt, plan: originalPlan })
        .eq('site_key', siteKey)
    }
    console.log('✅ Cleanup completed.')
  }

  console.log('\n🎉 ALL DASHBOARD WIDGET QA CHECKS PASSED.')
  process.exit(0)
}

run().catch(err => {
  console.error('Unexpected QA test script error:', err)
  process.exit(1)
})
