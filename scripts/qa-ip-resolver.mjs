import assert from 'assert'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { inspectClientIp, resolveClientIp, isPublicIp } from '../api/lib/ip-resolver.js'

console.log('==================================================')
const title = '          SourceTrack IP Resolver QA'
console.log(title)
console.log('==================================================\n')

const PORT_SECRET = 3007
const PORT_NO_SECRET = 3008
const TEST_SECRET = 'st-diagnostic-secret-12345'
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

// ── Part 1: Direct Unit Tests of Resolver Functions ─────────────────────────
function runUnitTests() {
  console.log('Part 1: Running unit tests on resolver helper functions...')

  // Test 1.1: Simple connection IP
  const req1 = {
    ip: '12.34.56.78',
    socket: { remoteAddress: '12.34.56.78' },
    headers: {}
  }
  const info1 = inspectClientIp(req1)
  assert.strictEqual(info1.selected_ip, '12.34.56.78', 'Should select req.ip')
  assert.strictEqual(info1.mode, 'connection', 'Mode should be connection')
  assert.deepStrictEqual(info1.warning_flags, [], 'Should have no warning flags')

  // Test 1.2: IPv6 mapping format normalization
  const req2 = {
    ip: '::ffff:192.168.1.1',
    socket: { remoteAddress: '::ffff:192.168.1.1' },
    headers: {}
  }
  const info2 = inspectClientIp(req2)
  assert.strictEqual(info2.selected_ip, '192.168.1.1', 'Should strip ::ffff:')
  assert.strictEqual(info2.normalized_req_ip, '192.168.1.1')
  assert.strictEqual(info2.normalized_socket_ip, '192.168.1.1')

  // Test 1.3: Presence of XFF header and mismatch detection
  const req3 = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-forwarded-for': '9.9.9.9, 10.10.10.10' }
  }
  const info3 = inspectClientIp(req3)
  assert.strictEqual(info3.selected_ip, '127.0.0.1', 'Should select socket/req.ip, not XFF')
  assert.ok(info3.warning_flags.includes('XFF_HEADER_PRESENT'), 'Should flag XFF header presence')
  assert.ok(info3.warning_flags.includes('XFF_CONNECTION_IP_MISMATCH'), 'Should flag IP mismatch')

  // Test 1.4: resolveClientIp basic resolve
  const resolved = resolveClientIp(req3)
  assert.strictEqual(resolved, '127.0.0.1', 'resolveClientIp should match connection IP')

  // Test 1.5: isPublicIp unit tests
  assert.strictEqual(isPublicIp('8.8.8.8'), true, '8.8.8.8 should be public')
  assert.strictEqual(isPublicIp('86.127.232.92'), true, '86.127.232.92 should be public')
  assert.strictEqual(isPublicIp('10.0.0.1'), false, '10.0.0.1 should be private')
  assert.strictEqual(isPublicIp('172.16.5.9'), false, '172.16.5.9 should be private')
  assert.strictEqual(isPublicIp('192.168.0.100'), false, '192.168.0.100 should be private')
  assert.strictEqual(isPublicIp('100.64.0.2'), false, '100.64.0.2 (CGNAT) should be private')
  assert.strictEqual(isPublicIp('100.127.255.255'), false, '100.127.255.255 (CGNAT edge) should be private')
  assert.strictEqual(isPublicIp('100.63.255.255'), true, '100.63.255.255 should be public')
  assert.strictEqual(isPublicIp('100.128.0.0'), true, '100.128.0.0 should be public')
  assert.strictEqual(isPublicIp('127.0.0.1'), false, '127.0.0.1 (loopback) should be private')
  assert.strictEqual(isPublicIp('169.254.1.1'), false, '169.254.1.1 (link-local) should be private')
  assert.strictEqual(isPublicIp('0.0.0.0'), false, '0.0.0.0 (current network) should be private')
  assert.strictEqual(isPublicIp('::1'), false, '::1 should be private')
  assert.strictEqual(isPublicIp('fe80::1'), false, 'fe80::1 should be private')
  assert.strictEqual(isPublicIp('fc00::1'), false, 'fc00::1 should be private')
  assert.strictEqual(isPublicIp('2001:db8::1'), true, '2001:db8::1 should be public')
  assert.strictEqual(isPublicIp(null), false, 'null IP should be private')
  assert.strictEqual(isPublicIp(''), false, 'empty IP should be private')
  assert.strictEqual(isPublicIp(123), false, 'non-string IP should be private')

  // Test 1.6: inspectClientIp with ST_IP_RESOLVER_MODE=railway
  process.env.ST_IP_RESOLVER_MODE = 'railway'

  // 1.6.1: Valid public IP in XFF
  const reqRailway1 = {
    ip: '100.64.0.2',
    socket: { remoteAddress: '100.64.0.2' },
    headers: { 'x-forwarded-for': '86.127.232.92, 152.233.12.242' }
  }
  const infoRailway1 = inspectClientIp(reqRailway1)
  assert.strictEqual(infoRailway1.selected_ip, '86.127.232.92', 'Should select first public XFF IP')
  assert.strictEqual(infoRailway1.mode, 'railway')
  assert.deepStrictEqual(infoRailway1.warning_flags, ['XFF_HEADER_PRESENT', 'XFF_CONNECTION_IP_MISMATCH'])

  // 1.6.2: CGNAT/internal IPs in XFF before public IP
  const reqRailway2 = {
    ip: '100.64.0.2',
    socket: { remoteAddress: '100.64.0.2' },
    headers: { 'x-forwarded-for': '100.64.0.3, 86.127.232.92, 152.233.12.242' }
  }
  const infoRailway2 = inspectClientIp(reqRailway2)
  assert.strictEqual(infoRailway2.selected_ip, '86.127.232.92', 'Should skip private CGNAT IP and select public one')

  // 1.6.3: All private/internal IPs in XFF
  const reqRailway3 = {
    ip: '100.64.0.2',
    socket: { remoteAddress: '100.64.0.2' },
    headers: { 'x-forwarded-for': '100.64.0.3, 10.0.0.1' }
  }
  const infoRailway3 = inspectClientIp(reqRailway3)
  assert.strictEqual(infoRailway3.selected_ip, '100.64.0.2', 'Should fallback to connection IP')
  assert.ok(infoRailway3.warning_flags.includes('RAILWAY_NO_PUBLIC_XFF_IP'), 'Should flag no public XFF IP')

  // 1.6.4: Missing XFF header
  const reqRailway4 = {
    ip: '100.64.0.2',
    socket: { remoteAddress: '100.64.0.2' },
    headers: {}
  }
  const infoRailway4 = inspectClientIp(reqRailway4)
  assert.strictEqual(infoRailway4.selected_ip, '100.64.0.2', 'Should fallback to connection IP')
  assert.ok(infoRailway4.warning_flags.includes('RAILWAY_MISSING_XFF_HEADER'), 'Should flag missing XFF header')

  // Reset resolver mode to connection default
  process.env.ST_IP_RESOLVER_MODE = 'connection'

  console.log('✅ Part 1 Unit Tests Passed.\n')
}

// ── Part 2: Source Code Ingestion Route Verification Checks ─────────────────
function runSourceChecks() {
  console.log('Part 2: Verifying source code for ingestion routes...')
  const files = [
    'api/routes/track.js',
    'api/routes/conversion.js',
    'api/routes/tracker-id.js'
  ]

  for (const file of files) {
    const filePath = path.resolve(file)
    const content = fs.readFileSync(filePath, 'utf8')

    // Check for manual x-forwarded-for string parsing pattern
    if (content.includes("headers['x-forwarded-for']") || content.includes('headers["x-forwarded-for"]')) {
      throw new Error(`File ${file} still contains manual x-forwarded-for headers check.`)
    }

    // Check for getClientIp
    if (content.includes('function getClientIp') || content.includes('getClientIp(')) {
      throw new Error(`File ${file} still contains local getClientIp helper or call.`)
    }

    // Ensure resolveClientIp is imported and used
    if (!content.includes('resolveClientIp')) {
      throw new Error(`File ${file} should import/use resolveClientIp.`)
    }
  }
  console.log('✅ Part 2 Source Code Checks Passed.\n')
}

// Helper to make request
async function makeRequest(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: '/api/diag/ip',
      method: 'GET',
      headers: headers
    }

    const req = http.request(options, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        })
      })
    })

    req.on('error', reject)
    req.end()
  })
}

// ── Part 3: Route Diagnostic Integration Tests (Gated vs Ungated & Modes) ───
async function runIntegrationTests() {
  console.log('Part 3: Running integration tests via spawned server...')

  // Step 3.1: Spawn server WITH secret AND ST_IP_RESOLVER_MODE=railway on PORT_SECRET
  console.log(`Starting API server on port ${PORT_SECRET} in railway mode...`)
  const apiProcessSecret = spawn('node', ['api/index.js'], {
    env: {
      ...process.env,
      PORT: PORT_SECRET,
      ST_IP_DIAGNOSTIC_SECRET: TEST_SECRET,
      ST_IP_RESOLVER_MODE: 'railway',
      NODE_ENV: 'test'
    },
    stdio: 'inherit'
  })

  // Wait for server to boot
  let serverStarted = false
  for (let i = 0; i < 20; i++) {
    await sleep(200)
    if (await isPortInUse(PORT_SECRET)) {
      serverStarted = true
      break
    }
  }
  if (!serverStarted) {
    throw new Error('API server with secret failed to start.')
  }

  // Request 3.1.1: Missing secret header
  console.log('Requesting without diagnostic secret...')
  const resNoSecret = await makeRequest(PORT_SECRET)
  assert.strictEqual(resNoSecret.statusCode, 401, 'Should fail with 401 on missing secret')
  assert.ok(JSON.parse(resNoSecret.body).error, 'Should return error message')

  // Request 3.1.2: Incorrect secret header
  console.log('Requesting with invalid diagnostic secret...')
  const resBadSecret = await makeRequest(PORT_SECRET, { 'x-diagnostic-secret': 'wrong-key-value' })
  assert.strictEqual(resBadSecret.statusCode, 401, 'Should fail with 401 on invalid secret')

  // Request 3.1.3: Valid secret header (No XFF header)
  console.log('Requesting with valid diagnostic secret but no XFF...')
  const resValid = await makeRequest(PORT_SECRET, { 'x-diagnostic-secret': TEST_SECRET })
  assert.strictEqual(resValid.statusCode, 200, 'Should succeed with 200')
  assert.strictEqual(resValid.headers['cache-control'], 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Cache-control must be no-store')
  
  const jsonValid = JSON.parse(resValid.body)
  assert.ok(jsonValid.selected_ip, 'Should return selected_ip')
  assert.strictEqual(jsonValid.mode, 'railway', 'Should use railway mode')
  assert.ok(jsonValid.warning_flags.includes('RAILWAY_MISSING_XFF_HEADER'), 'Should flag missing XFF header')
  assert.ok(!jsonValid.headers, 'Should not leak raw headers in response body')

  // Request 3.1.4: Valid secret header (With public XFF)
  console.log('Requesting with valid secret and public X-Forwarded-For: 86.127.232.92...')
  const resPublicXff = await makeRequest(PORT_SECRET, {
    'x-diagnostic-secret': TEST_SECRET,
    'X-Forwarded-For': '86.127.232.92'
  })
  assert.strictEqual(resPublicXff.statusCode, 200)
  const jsonPublicXff = JSON.parse(resPublicXff.body)
  assert.strictEqual(jsonPublicXff.selected_ip, '86.127.232.92', 'Should select public IP')
  assert.strictEqual(jsonPublicXff.raw_x_forwarded_for, '86.127.232.92')
  assert.ok(jsonPublicXff.warning_flags.includes('XFF_HEADER_PRESENT'))

  // Request 3.1.5: Valid secret header (With private/CGNAT + public XFF chain)
  console.log('Requesting with valid secret and chain: 100.64.0.3, 86.127.232.92...')
  const resChainXff = await makeRequest(PORT_SECRET, {
    'x-diagnostic-secret': TEST_SECRET,
    'X-Forwarded-For': '100.64.0.3, 86.127.232.92'
  })
  assert.strictEqual(resChainXff.statusCode, 200)
  const jsonChainXff = JSON.parse(resChainXff.body)
  assert.strictEqual(jsonChainXff.selected_ip, '86.127.232.92', 'Should skip private IP and select public IP')

  // Request 3.1.6: Valid secret header (With only private XFF)
  console.log('Requesting with valid secret and private only X-Forwarded-For: 100.64.0.3...')
  const resPrivateXff = await makeRequest(PORT_SECRET, {
    'x-diagnostic-secret': TEST_SECRET,
    'X-Forwarded-For': '100.64.0.3'
  })
  assert.strictEqual(resPrivateXff.statusCode, 200)
  const jsonPrivateXff = JSON.parse(resPrivateXff.body)
  assert.strictEqual(jsonPrivateXff.selected_ip, '127.0.0.1', 'Should fallback to connection IP (loopback)')
  assert.ok(jsonPrivateXff.warning_flags.includes('RAILWAY_NO_PUBLIC_XFF_IP'), 'Should flag no public XFF IP')

  // Kill server with secret
  apiProcessSecret.kill()
  await sleep(500)
  console.log('Terminated server in railway mode.')

  // Step 3.2: Spawn server WITHOUT secret on PORT_NO_SECRET
  const envWithoutSecret = { ...process.env }
  delete envWithoutSecret.ST_IP_DIAGNOSTIC_SECRET

  console.log(`\nStarting API server on port ${PORT_NO_SECRET} WITHOUT ST_IP_DIAGNOSTIC_SECRET set...`)
  const apiProcessNoSecret = spawn('node', ['api/index.js'], {
    env: {
      ...envWithoutSecret,
      PORT: PORT_NO_SECRET,
      NODE_ENV: 'test'
    },
    stdio: 'inherit'
  })

  // Wait for server to boot
  serverStarted = false
  for (let i = 0; i < 20; i++) {
    await sleep(200)
    if (await isPortInUse(PORT_NO_SECRET)) {
      serverStarted = true
      break
    }
  }
  if (!serverStarted) {
    throw new Error('API server without secret failed to start.')
  }

  // Request 3.2.1: Request route (expect 404 since it should not be registered)
  console.log('Requesting diagnostic route on ungated server...')
  const resUngated = await makeRequest(PORT_NO_SECRET, { 'x-diagnostic-secret': TEST_SECRET })
  assert.strictEqual(resUngated.statusCode, 404, 'Diagnostic route should return 404 when env var is absent')

  // Kill server without secret
  apiProcessNoSecret.kill()
  await sleep(500)
  console.log('Terminated server without secret.')

  console.log('\n✅ Part 3 Integration Tests Passed.')
}

async function main() {
  try {
    runUnitTests()
    runSourceChecks()
    await runIntegrationTests()
    console.log('\n🎉 ALL QA IP RESOLVER TESTS PASSED!')
    process.exit(0)
  } catch (err) {
    console.error('\n❌ QA Test failed:', err.message)
    process.exit(1)
  }
}

main()
