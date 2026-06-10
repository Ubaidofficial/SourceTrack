import dotenv from 'dotenv'
dotenv.config()

import { verifySafeEnvironment } from './qa-guard.js'
verifySafeEnvironment()

import assert from 'assert'
import http from 'http'
import { spawn } from 'child_process'
import { createClient } from '@supabase/supabase-js'
import { getSupabase } from '../api/lib/supabase.js'

console.log('==================================================')
console.log('      SourceTrack Managed Proxy E2E QA Test')
console.log('==================================================\n')

const PORT = 3015
const API_URL = `http://localhost:${PORT}`
let serverProcess = null

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = http.createServer()
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(true)
      else resolve(false)
    })
    server.once('listening', () => {
      server.close()
      resolve(false)
    })
    server.listen(port)
  })
}

// Spawns the local API server with customized test environment overrides
async function startTestServer(extraEnv = {}) {
  const inUse = await isPortInUse(PORT)
  if (inUse) {
    throw new Error(`Port ${PORT} is already in use. Cannot start test API server.`)
  }

  serverProcess = spawn('node', ['api/index.js'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT,
      NODE_ENV: 'test',
      ST_MOCK_DNS_RESOLVE: 'true',
      ST_MANAGED_PROXY_TARGET: 'proxy.sourcetrack.io',
      ST_PLATFORM_HOSTS: 'api.sourcetrack.io,localhost,127.0.0.1',
      ...extraEnv
    }
  })

  // Wait for server to boot
  for (let i = 0; i < 30; i++) {
    await sleep(200)
    const active = await isPortInUse(PORT)
    if (active) {
      console.log(`✅ Test API server started on port ${PORT}.`)
      return
    }
  }
  throw new Error('API server failed to start in time.')
}

function stopTestServer() {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
    console.log('Test API server stopped.')
  }
}

// HTTP request helper
async function makeRequest({ method = 'GET', path, host = 'localhost', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Host': host,
        'Content-Type': 'application/json',
        ...headers
      }
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        let parsed = null
        try {
          parsed = data ? JSON.parse(data) : null
        } catch (_) {
          parsed = data
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed
        })
      })
    })

    req.on('error', reject)
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body))
    }
    req.end()
  })
}

async function runTests() {
  const supabase = getSupabase()
  const authClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  // Resolve active site context dynamically
  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('id, site_key, company_id')
    .not('company_id', 'is', null)
    .limit(1)
    .single()

  if (siteErr || !site) {
    throw new Error(`Failed to find site context: ${siteErr?.message}`)
  }

  const siteKey = site.site_key
  const companyId = site.company_id
  const uniqueId = Date.now().toString().slice(-6)

  const testEmail = `qa_proxy_${uniqueId}@example.com`
  const testPassword = `TempPassword123!_${uniqueId}`

  let tempUserId = null
  let tempMemberCreated = false
  let dbProxyCreated = false

  try {
    // 1. Create temporary authenticated workspace user
    const { data: authData, error: authCreateErr } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true
    })

    if (authCreateErr || !authData?.user) {
      throw new Error(`Failed to create temp user: ${authCreateErr?.message}`)
    }
    tempUserId = authData.user.id

    // Link user to site company
    await supabase.from('company_members').insert({
      company_id: companyId,
      user_id: tempUserId,
      role: 'admin'
    })
    tempMemberCreated = true

    // Log in
    const { data: sessionData, error: loginErr } = await authClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    })
    if (loginErr || !sessionData?.session) {
      throw new Error(`Failed to log in as test user: ${loginErr?.message}`)
    }
    const token = sessionData.session.access_token

    // Start API server
    await startTestServer()

    // 2. Test settings API validation & domain normalization
    console.log('\nScenario 1: Configure custom domain with bad formats...')
    
    // Test 1a: Reject protocol prefix
    const resBad1 = await makeRequest({
      method: 'POST',
      path: `/api/integrations/proxy-domain?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` },
      body: { domain: 'https://track.customer.com' }
    })
    assert.strictEqual(resBad1.statusCode, 400)
    assert.match(resBad1.body.error, /Enter domain only/i)

    // Test 1b: Reject wildcards/paths
    const resBad2 = await makeRequest({
      method: 'POST',
      path: `/api/integrations/proxy-domain?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` },
      body: { domain: 'track.customer.com/api' }
    })
    assert.strictEqual(resBad2.statusCode, 400)
    assert.match(resBad2.body.error, /Invalid domain format/i)

    // Test 1c: Reject localhost / IP
    const resBad3 = await makeRequest({
      method: 'POST',
      path: `/api/integrations/proxy-domain?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` },
      body: { domain: '127.0.0.1' }
    })
    assert.strictEqual(resBad3.statusCode, 400)
    assert.match(resBad3.body.error, /Localhost and IP addresses/i)

    console.log('✅ Scenario 1 Passed.')

    // 3. Test successful domain settings configuration
    console.log('\nScenario 2: Create valid custom domain settings...')
    const testDomain = 'track.testcustomer.com'
    const resSave = await makeRequest({
      method: 'POST',
      path: `/api/integrations/proxy-domain?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` },
      body: { domain: `  ${testDomain.toUpperCase()}  ` } // Verify normalization works
    })
    assert.strictEqual(resSave.statusCode, 200)
    assert.strictEqual(resSave.body.data.domain, testDomain)
    assert.strictEqual(resSave.body.data.status, 'pending_dns')
    dbProxyCreated = true
    console.log('✅ Scenario 2 Passed.')

    // 4. Test GET proxy settings
    console.log('\nScenario 3: Get custom domain settings...')
    const resGet = await makeRequest({
      method: 'GET',
      path: `/api/integrations/proxy-domain?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` }
    })
    assert.strictEqual(resGet.statusCode, 200)
    assert.strictEqual(resGet.body.data.domain, testDomain)
    console.log('✅ Scenario 3 Passed.')

    // 5. Test Stage 1 Early Gate - Pending DNS blocks
    console.log('\nScenario 4: Verify pending domain is blocked...')
    const resPending = await makeRequest({
      method: 'GET',
      path: '/tracker.min.js',
      host: testDomain
    })
    assert.strictEqual(resPending.statusCode, 403)
    assert.match(resPending.body || '', /domain inactive or pending/i)
    console.log('✅ Scenario 4 Passed.')

    // 6. Test health path is open for pending domains
    console.log('\nScenario 5: Verify health check path resolves on pending domain...')
    const resHealthPending = await makeRequest({
      method: 'GET',
      path: '/.well-known/sourcetrack/proxy-health',
      host: testDomain
    })
    assert.strictEqual(resHealthPending.statusCode, 200)
    assert.strictEqual(resHealthPending.body.status, 'ok')
    assert.strictEqual(resHealthPending.body.service, 'sourcetrack-managed-proxy')
    console.log('✅ Scenario 5 Passed.')

    // 7. Verify CNAME check and SSL Self check transition
    console.log('\nScenario 6: Verify CNAME DNS verification states...')
    
    // Test 6a: Test DNS resolution failure
    // Save a DNS fail domain
    await makeRequest({
      method: 'POST',
      path: `/api/integrations/proxy-domain?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` },
      body: { domain: 'dns-fail.testcustomer.com' }
    })
    const resVerifyFail = await makeRequest({
      method: 'POST',
      path: `/api/integrations/proxy-domain/verify?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` }
    })
    assert.strictEqual(resVerifyFail.statusCode, 200)
    assert.strictEqual(resVerifyFail.body.data.status, 'error')
    assert.strictEqual(resVerifyFail.body.data.error_code, 'ENOTFOUND')

    // Test 6b: Test SSL routing failure state
    await makeRequest({
      method: 'POST',
      path: `/api/integrations/proxy-domain?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` },
      body: { domain: 'ssl-fail.testcustomer.com' }
    })
    const resVerifySslPending = await makeRequest({
      method: 'POST',
      path: `/api/integrations/proxy-domain/verify?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` }
    })
    assert.strictEqual(resVerifySslPending.statusCode, 200)
    assert.strictEqual(resVerifySslPending.body.data.status, 'pending_ssl_or_routing')
    assert.strictEqual(resVerifySslPending.body.data.error_code, 'SSL_ROUTING_PENDING')

    // Test 6c: Test full activation success
    await makeRequest({
      method: 'POST',
      path: `/api/integrations/proxy-domain?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` },
      body: { domain: testDomain }
    })
    const resVerifySuccess = await makeRequest({
      method: 'POST',
      path: `/api/integrations/proxy-domain/verify?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` }
    })
    assert.strictEqual(resVerifySuccess.statusCode, 200)
    assert.strictEqual(resVerifySuccess.body.data.status, 'active')
    assert.strictEqual(resVerifySuccess.body.data.error_code, null)
    console.log('✅ Scenario 6 Passed.')

    // 8. Verify Stage 1 Early Gate - Active domain path checks
    console.log('\nScenario 7: Verify active domain allows tracker scripts & ingestion but blocks admin paths...')
    
    // Test 7a: Load tracker.min.js
    const resScript1 = await makeRequest({
      method: 'GET',
      path: '/tracker.min.js',
      host: testDomain
    })
    assert.strictEqual(resScript1.statusCode, 200)
    assert.ok(String(resScript1.headers['content-type']).includes('javascript'))

    // Test 7b: Block admin path
    const resAdmin = await makeRequest({
      method: 'GET',
      path: `/api/integrations/proxy-domain?site_key=${siteKey}`,
      host: testDomain
    })
    assert.strictEqual(resAdmin.statusCode, 404) // Blocked early by Stage 1

    console.log('✅ Scenario 7 Passed.')

    // 9. Verify Stage 2 Site Key Binding check
    console.log('\nScenario 8: Verify Stage 2 site_key binding check rejects spoofed site keys...')
    
    // Test 8a: Correct site key works (returns standard endpoint response, e.g. 402/200 depending on subscription)
    const resIngest1 = await makeRequest({
      method: 'POST',
      path: '/api/track',
      host: testDomain,
      body: {
        site_key: siteKey,
        event: 'test_event',
        properties: {}
      }
    })
    // Expect validation success (either 200 ok, or standard 401/402 since site is in trial/active)
    // The key point is it does not return 403 Host-site key mismatch!
    assert.notStrictEqual(resIngest1.statusCode, 403, 'Correct site key must not return 403 Host mismatch')

    // Test 8b: Incorrect site key returns 403
    const resIngest2 = await makeRequest({
      method: 'POST',
      path: '/api/track',
      host: testDomain,
      body: {
        site_key: 'sk_malicious_spoof',
        event: 'test_event',
        properties: {}
      }
    })
    assert.strictEqual(resIngest2.statusCode, 403)
    assert.match(resIngest2.body.error, /Host-site key binding violation/i)

    console.log('✅ Scenario 8 Passed.')

    // 10. Verify platform host pass-through
    console.log('\nScenario 9: Verify platform hosts skip managed proxy checks...')
    const resPlatform = await makeRequest({
      method: 'GET',
      path: '/health',
      host: 'localhost'
    })
    assert.strictEqual(resPlatform.statusCode, 200)
    assert.strictEqual(resPlatform.body.status, 'ok')
    console.log('✅ Scenario 9 Passed.')

    // 11. Verify cache invalidation on delete
    console.log('\nScenario 10: Verify cache invalidation on delete works instantly...')
    const resDelete = await makeRequest({
      method: 'DELETE',
      path: `/api/integrations/proxy-domain?site_key=${siteKey}`,
      headers: { 'Authorization': `Bearer ${token}` }
    })
    assert.strictEqual(resDelete.statusCode, 200)

    // Request on custom host should now 404 immediately
    const resGetAfterDelete = await makeRequest({
      method: 'GET',
      path: '/tracker.min.js',
      host: testDomain
    })
    assert.strictEqual(resGetAfterDelete.statusCode, 404)
    console.log('✅ Scenario 10 Passed.')

    // Stop server
    stopTestServer()

    // 12. Verify Production fail-closed gate
    console.log('\nScenario 11: Verify fail-closed checks on startup in production mode...')
    const prodProc = spawn('node', ['api/index.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ST_MANAGED_PROXY_TARGET: '', // missing target
        ST_PLATFORM_HOSTS: 'api.sourcetrack.io'
      }
    })

    const prodExitCode = await new Promise((resolve) => {
      prodProc.on('exit', (code) => resolve(code))
      setTimeout(() => {
        prodProc.kill()
        resolve(-99)
      }, 3000)
    })
    assert.ok(prodExitCode !== 0 && prodExitCode !== -99, 'Production server must fail-fast on missing ST_MANAGED_PROXY_TARGET')
    console.log('✅ Scenario 11 Passed.')

  } finally {
    stopTestServer()

    console.log('\nCleaning up database assets...')
    const supabase = getSupabase()
    if (dbProxyCreated) {
      await supabase.from('managed_proxy_domains').delete().eq('site_key', siteKey)
    }
    if (tempUserId) {
      if (tempMemberCreated) {
        await supabase.from('company_members').delete().eq('user_id', tempUserId)
      }
      await supabase.auth.admin.deleteUser(tempUserId)
    }
    console.log('✅ Database assets cleaned up.')
  }
}

async function main() {
  try {
    await runTests()
    console.log('\n🎉 ALL MANAGED PROXY QA CHECKS PASSED!')
    process.exit(0)
  } catch (err) {
    console.error('\n❌ QA Test failed:', err.stack || err.message)
    process.exit(1)
  }
}

main()
