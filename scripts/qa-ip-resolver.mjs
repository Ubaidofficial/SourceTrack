import assert from 'assert'
import http from 'http'
import { spawn } from 'child_process'
import { inspectClientIp, resolveClientIp } from '../api/lib/ip-resolver.js'

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

  console.log('✅ Part 1 Unit Tests Passed.\n')
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

// ── Part 2: Route Diagnostic Integration Tests (Gated vs Ungated) ───────────
async function runIntegrationTests() {
  console.log('Part 2: Running integration tests via spawned server...')

  // Step 2.1: Spawn server WITH secret on PORT_SECRET
  console.log(`Starting API server on port ${PORT_SECRET} with ST_IP_DIAGNOSTIC_SECRET set...`)
  const apiProcessSecret = spawn('node', ['api/index.js'], {
    env: {
      ...process.env,
      PORT: PORT_SECRET,
      ST_IP_DIAGNOSTIC_SECRET: TEST_SECRET,
      NODE_ENV: 'test'
    }
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

  // Request 2.1.1: Missing secret header
  console.log('Requesting without diagnostic secret...')
  const resNoSecret = await makeRequest(PORT_SECRET)
  assert.strictEqual(resNoSecret.statusCode, 401, 'Should fail with 401 on missing secret')
  assert.ok(JSON.parse(resNoSecret.body).error, 'Should return error message')

  // Request 2.1.2: Incorrect secret header
  console.log('Requesting with invalid diagnostic secret...')
  const resBadSecret = await makeRequest(PORT_SECRET, { 'x-diagnostic-secret': 'wrong-key-value' })
  assert.strictEqual(resBadSecret.statusCode, 401, 'Should fail with 401 on invalid secret')

  // Request 2.1.3: Valid secret header (No spoofing)
  console.log('Requesting with valid diagnostic secret...')
  const resValid = await makeRequest(PORT_SECRET, { 'x-diagnostic-secret': TEST_SECRET })
  assert.strictEqual(resValid.statusCode, 200, 'Should succeed with 200')
  assert.strictEqual(resValid.headers['cache-control'], 'no-store, no-cache, must-revalidate, proxy-revalidate', 'Cache-control must be no-store')
  
  const jsonValid = JSON.parse(resValid.body)
  assert.ok(jsonValid.selected_ip, 'Should return selected_ip')
  assert.strictEqual(jsonValid.mode, 'connection', 'Should use connection mode')
  assert.strictEqual(jsonValid.normalized_req_ip, '127.0.0.1', 'normalized_req_ip should be loopback')
  assert.ok(!jsonValid.headers, 'Should not leak raw headers in response body')

  // Request 2.1.4: Valid secret header (With spoofed XFF)
  console.log('Requesting with valid secret and spoofed X-Forwarded-For: 9.9.9.9...')
  const resSpoofed = await makeRequest(PORT_SECRET, {
    'x-diagnostic-secret': TEST_SECRET,
    'X-Forwarded-For': '9.9.9.9'
  })
  assert.strictEqual(resSpoofed.statusCode, 200, 'Should succeed with 200')
  
  const jsonSpoofed = JSON.parse(resSpoofed.body)
  // Selected IP must remain loopback / socket-based connection IP, not spoofed XFF
  assert.strictEqual(jsonSpoofed.selected_ip, '127.0.0.1', 'Must ignore spoofed XFF in selection')
  assert.strictEqual(jsonSpoofed.raw_x_forwarded_for, '9.9.9.9', 'Should report raw XFF value')
  assert.ok(jsonSpoofed.warning_flags.includes('XFF_HEADER_PRESENT'), 'Should flag XFF header presence')
  assert.ok(jsonSpoofed.warning_flags.includes('XFF_CONNECTION_IP_MISMATCH'), 'Should flag mismatch')

  // Kill server with secret
  apiProcessSecret.kill()
  await sleep(500)
  console.log('Terminated server with secret.')

  // Step 2.2: Spawn server WITHOUT secret on PORT_NO_SECRET
  const envWithoutSecret = { ...process.env }
  delete envWithoutSecret.ST_IP_DIAGNOSTIC_SECRET

  console.log(`\nStarting API server on port ${PORT_NO_SECRET} WITHOUT ST_IP_DIAGNOSTIC_SECRET set...`)
  const apiProcessNoSecret = spawn('node', ['api/index.js'], {
    env: {
      ...envWithoutSecret,
      PORT: PORT_NO_SECRET,
      NODE_ENV: 'test'
    }
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

  // Request 2.2.1: Request route (expect 404 since it should not be registered)
  console.log('Requesting diagnostic route on ungated server...')
  const resUngated = await makeRequest(PORT_NO_SECRET, { 'x-diagnostic-secret': TEST_SECRET })
  assert.strictEqual(resUngated.statusCode, 404, 'Diagnostic route should return 404 when env var is absent')

  // Kill server without secret
  apiProcessNoSecret.kill()
  await sleep(500)
  console.log('Terminated server without secret.')

  console.log('\n✅ Part 2 Integration Tests Passed.')
}

async function main() {
  try {
    runUnitTests()
    await runIntegrationTests()
    console.log('\n🎉 ALL QA IP RESOLVER TESTS PASSED!')
    process.exit(0)
  } catch (err) {
    console.error('\n❌ QA Test failed:', err.message)
    process.exit(1)
  }
}

main()
