import 'dotenv/config'

import { verifySafeEnvironment } from './qa-guard.js'
verifySafeEnvironment()

import { getSupabase } from '../api/lib/supabase.js'
import { createClient } from '@supabase/supabase-js'
import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ALLOWED_GROUPS } from '../api/lib/report-config-validation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCETRACK_API_URL = process.env.SOURCETRACK_API_URL || 'http://localhost:3000'

console.log('==================================================')
console.log('    Revenue Provider & Stitching Reporting QA')
console.log('==================================================\n')

function normalizeProvider(rawProvider, ingestionMethod) {
  if (rawProvider && rawProvider.trim() !== '') return rawProvider
  if (ingestionMethod === 'server_routed') return 'browser'
  if (ingestionMethod === 'offline') return 'payments_api'
  return 'unknown'
}

function normalizeAttributionStatus(rawStatus, ingestionMethod, rawStitchMethod) {
  if (rawStatus && rawStatus.trim() !== '') return rawStatus
  if (ingestionMethod === 'server_routed') return 'attributed'
  if (rawStitchMethod && rawStitchMethod.trim() !== '' && rawStitchMethod !== 'none') return 'attributed'
  if (rawStitchMethod === 'none') return 'unattributed'
  return 'unknown'
}

function normalizeStitchingMethod(rawStitch, ingestionMethod) {
  if (rawStitch && rawStitch.trim() !== '') return rawStitch
  if (ingestionMethod === 'server_routed') return 'browser'
  return 'unknown'
}

async function request(pathStr, token, options = {}) {
  const url = `${SOURCETRACK_API_URL.replace(/\/+$/, '')}${pathStr}`
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
  // ─── CHECK 1: Deterministic JS normalization logic assertions ───────────────
  console.log('Test 1: Deterministic JS normalization helper checks...')
  
  // provider logic
  assert.strictEqual(normalizeProvider('stripe', 'offline'), 'stripe')
  assert.strictEqual(normalizeProvider('paddle_test', 'offline'), 'paddle_test')
  assert.strictEqual(normalizeProvider('', 'server_routed'), 'browser')
  assert.strictEqual(normalizeProvider(null, 'offline'), 'payments_api')
  assert.strictEqual(normalizeProvider(undefined, null), 'unknown')

  // attribution status logic
  assert.strictEqual(normalizeAttributionStatus('unattributed', 'offline', 'none'), 'unattributed')
  assert.strictEqual(normalizeAttributionStatus('', 'server_routed', ''), 'attributed')
  assert.strictEqual(normalizeAttributionStatus(null, 'offline', 'anonymous_id'), 'attributed')
  assert.strictEqual(normalizeAttributionStatus(null, 'offline', 'none'), 'unattributed')
  assert.strictEqual(normalizeAttributionStatus(undefined, null, undefined), 'unknown')

  // stitching method logic
  assert.strictEqual(normalizeStitchingMethod('client_reference_id', 'offline'), 'client_reference_id')
  assert.strictEqual(normalizeStitchingMethod('', 'server_routed'), 'browser')
  assert.strictEqual(normalizeStitchingMethod(null, 'offline'), 'unknown')
  
  console.log('✅ Test 1 Passed: Deterministic JS normalization helpers matched requirements.\n')

  // ─── CHECK 2: Static validation checks ──────────────────────────────────────
  console.log('Test 2: Static report-config-validation configuration checks...')
  assert.ok(ALLOWED_GROUPS.has('provider'), "ALLOWED_GROUPS is missing 'provider'")
  assert.ok(ALLOWED_GROUPS.has('attribution_status'), "ALLOWED_GROUPS is missing 'attribution_status'")
  assert.ok(ALLOWED_GROUPS.has('stitching_method'), "ALLOWED_GROUPS is missing 'stitching_method'")
  assert.ok(!ALLOWED_GROUPS.has('fake_dimension'), "ALLOWED_GROUPS should not contain 'fake_dimension'")
  console.log('✅ Test 2 Passed: ALLOWED_GROUPS configured correctly.\n')

  // ─── CHECK 3: Pre-aggregated bypass checks ──────────────────────────────────
  console.log('Test 3: Pre-aggregated database query bypass check in route layer...')
  const routePath = path.join(__dirname, '../api/routes/attribution.js')
  const routeContent = fs.readFileSync(routePath, 'utf8')
  
  assert.ok(routeContent.includes('group_by !== "provider"'), "Bypass rule for 'provider' is missing in attribution.js")
  assert.ok(routeContent.includes('group_by !== "attribution_status"'), "Bypass rule for 'attribution_status' is missing in attribution.js")
  assert.ok(routeContent.includes('group_by !== "stitching_method"'), "Bypass rule for 'stitching_method' is missing in attribution.js")
  console.log('✅ Test 3 Passed: Bypass rules confirmed in api/routes/attribution.js.\n')

  // Initialize Supabase clients for integration test blocks
  const supabase = getSupabase()
  const authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const uniqueId = Date.now().toString().slice(-6)

  const testEmail = `qa_revenue_${uniqueId}@example.com`
  const testPassword = `TempPassword123!_${uniqueId}`

  let tempUserId = null
  let tempMemberCreated = false
  let createdReportIds = []
  let originalTrialEndsAt = null
  let originalPlan = null
  let siteFetched = false
  let siteKey = null
  let siteId = null

  try {
    // Resolve site details for API testing
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

    console.log('Temporary user authenticated. Running live API checks...\n')

    // ─── CHECK 4: Saved report configs ──────────────────────────────────────────
    console.log('Test 4: Saved report configurations...')
    const dims = ['provider', 'attribution_status', 'stitching_method']
    for (const dim of dims) {
      const savedReportPayload = {
        name: `QA ${dim} Report`,
        config: {
          model: 'first_touch',
          groupBy: dim,
          metric: 'revenue',
          dateFrom: '2026-06-01',
          dateTo: '2026-06-30'
        }
      }
      const res = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
        method: 'POST',
        body: JSON.stringify(savedReportPayload)
      })
      assert.strictEqual(res.status, 200, `Expected 200 OK for ${dim}, got ${res.status}`)
      const report = res.body.data
      createdReportIds.push(report.id)
      assert.strictEqual(report.config.groupBy, dim)
      console.log(`  ✅ Config accepted: groupBy = ${dim}`)
    }

    // Invalid dimension rejection
    const invalidReportPayload = {
      name: 'Invalid Dimension Report',
      config: {
        model: 'first_touch',
        groupBy: 'invalid_dimension_xyz',
        metric: 'revenue'
      }
    }
    const resInvalid = await request(`/api/reports/saved?site_key=${siteKey}`, token, {
      method: 'POST',
      body: JSON.stringify(invalidReportPayload)
    })
    assert.strictEqual(resInvalid.status, 400, `Expected 400 Bad Request, got ${resInvalid.status}`)
    assert.ok(String(resInvalid.body.error).includes('Invalid groupBy dimension'), `Expected invalid groupBy error, got: ${resInvalid.body.error}`)
    console.log('  ✅ Rejected invalid dimension configuration.')
    console.log('Test 4 Passed: Saved report acceptance validation verified successfully.\n')

    // ─── CHECK 5: Attribution API smoke ─────────────────────────────────────────
    console.log('Test 5: Running attribution API smoke tests...')
    const dateFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const dateTo = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    
    for (const dim of dims) {
      const res = await request(`/api/attribution?site_key=${siteKey}&model=last_touch&date_from=${dateFrom}&date_to=${dateTo}&group_by=${dim}&metric=revenue`, token)
      assert.strictEqual(res.status, 200, `Expected 200 OK for attribution query group_by=${dim}, got ${res.status}`)
      assert.ok(res.body.success, `Expected success field in attribution query response for ${dim}`)
      console.log(`  ✅ Attribution query success: group_by = ${dim}`)
    }
    console.log('Test 5 Passed: Attribution API successfully served all three metadata dimensions.\n')

    // ─── CHECK 6: Export API smoke ─────────────────────────────────────────────
    console.log('Test 6: Running CSV export API smoke tests...')
    for (const dim of dims) {
      const res = await request(`/api/export/report?site_key=${siteKey}&model=last_touch&date_from=${dateFrom}&date_to=${dateTo}&group_by=${dim}&metric=revenue`, token)
      assert.strictEqual(res.status, 200, `Expected 200 OK for export query group_by=${dim}, got ${res.status}`)
      assert.strictEqual(res.headers.get('content-type').split(';')[0], 'text/csv', `Expected text/csv content type for ${dim}`)
      console.log(`  ✅ CSV export query success: group_by = ${dim}`)
    }
    console.log('Test 6 Passed: Export API successfully exported CSVs for all three dimensions.\n')

  } catch (err) {
    console.error('✖ Test Failed:', err)
    process.exit(1)
  } finally {
    console.log('Cleaning up temporary test artifacts...')
    for (const id of createdReportIds) {
      await supabase.from('saved_reports').delete().eq('id', id)
    }
    console.log('✅ Temporary reports cleaned up.')

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

  console.log('\n🎉 ALL REVENUE PROVIDER REPORTING QA CHECKS PASSED SUCCESSFULLY.')
  process.exit(0)
}

run().catch(err => {
  console.error('Unexpected check error:', err)
  process.exit(1)
})
