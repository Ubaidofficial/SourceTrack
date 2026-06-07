import assert from 'assert'
import http from 'http'
import { spawn } from 'child_process'
import { createHmac } from 'crypto'
import { isIngestionPath, hashKeyPart, getSafeRouteLabel } from '../api/middleware/rate-limit.js'

console.log('==================================================')
console.log('         SourceTrack Rate Limits QA')
console.log('==================================================\n')

const PORT = 3014
const serverLogs = []
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

// HTTP request helper
async function makeRequest({ method = 'POST', path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path: path,
      method: method,
      headers: {
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
      req.write(JSON.stringify(body))
    }
    req.end()
  })
}

// Helper to compute stable HMAC log hashes exactly like the server
function getHmacHash(value, salt = 'test-qa-salt-124c-stable') {
  if (value === undefined || value === null || value === '') return 'missing'
  const clean = String(value).slice(0, 500)
  return createHmac('sha256', salt).update(clean).digest('hex').slice(0, 16)
}

async function runTests() {
  // Test 1: Static skip boundary tests for isIngestionPath
  console.log('Scenario 1: Testing exact isIngestionPath boundaries (including trailing slashes)...')
  assert.strictEqual(isIngestionPath('/api/track'), true)
  assert.strictEqual(isIngestionPath('/api/collect'), true)
  assert.strictEqual(isIngestionPath('/track'), true)
  assert.strictEqual(isIngestionPath('/api/conversion'), true)
  assert.strictEqual(isIngestionPath('/api/tracker/id'), true)
  assert.strictEqual(isIngestionPath('/api/identify'), true)
  
  // Boundary tests for trailing slashes
  assert.strictEqual(isIngestionPath('/api/track/'), true)
  assert.strictEqual(isIngestionPath('/api/collect/'), true)
  assert.strictEqual(isIngestionPath('/api/tracker/id/'), true)

  // Non-ingestion/deferred paths
  assert.strictEqual(isIngestionPath('/api/pixel'), false)
  assert.strictEqual(isIngestionPath('/api/conversion/offline'), false)
  assert.strictEqual(isIngestionPath('/api/reports/saved'), false)
  assert.strictEqual(isIngestionPath('/api/export/report'), false)
  console.log('✅ Scenario 1 Passed.\n')

  // Spawn API server in test mode with railway mode enabled for IP simulation
  console.log(`Starting API server on port ${PORT}...`)
  const apiProcess = spawn('node', ['api/index.js'], {
    env: {
      ...process.env,
      PORT: PORT,
      NODE_ENV: 'test',
      ST_IP_RESOLVER_MODE: 'railway',
      TRACKER_SALT: 'test-qa-salt-124c-stable'
    }
  })

  // Accumulate stdout/stderr to inspect logged content
  apiProcess.stdout.on('data', chunk => { serverLogs.push(chunk.toString()) })
  apiProcess.stderr.on('data', chunk => { serverLogs.push(chunk.toString()) })

  // Wait for server to boot
  let serverStarted = false
  for (let i = 0; i < 25; i++) {
    await sleep(200)
    if (await isPortInUse(PORT)) {
      serverStarted = true
      break
    }
  }
  if (!serverStarted) {
    throw new Error('API server failed to start.')
  }
  console.log('✅ API server running.\n')

  // Collect sensitive values to assert they are not leaked in logs
  const sensitiveValues = new Set([
    '86.127.232.92',
    '55.55.55.55',
    '12.34.56.78',
    'anon_visitor',
    'options_anon',
    'order_123',
    'trailing_anon',
    'collect_cors_anon',
    'cors-ua'
  ])

  // Track specific identifiers for logarithmic cryptographic validation
  const keysToValidate = {}

  try {
    // Scenario 2: Normal pageviews pass
    console.log('Scenario 2: Verifying normal traffic passes...')
    const siteKeyNormal = 'sk_normal_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeyNormal)
    for (let i = 0; i < 3; i++) {
      const res = await makeRequest({
        path: '/api/track',
        body: { site_key: siteKeyNormal, event: '$pageview', anonymous_id: 'anon_normal' }
      })
      assert.strictEqual(res.statusCode, 401, 'Should return 401 since site key is fake')
      assert.notStrictEqual(res.statusCode, 429, 'Should not be rate limited')
    }
    console.log('✅ Scenario 2 Passed.\n')

    // Scenario 3: Visitor rate limit cap (max = 5 in test mode)
    console.log('Scenario 3: Verifying visitor rate limit cap...')
    const siteKeyVisitor = 'sk_visitor_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeyVisitor)
    const visitorId = 'anon_visitor'
    for (let i = 1; i <= 6; i++) {
      const res = await makeRequest({
        path: '/api/track',
        body: { site_key: siteKeyVisitor, event: '$pageview', anonymous_id: visitorId }
      })
      if (i <= 5) {
        assert.strictEqual(res.statusCode, 401, `Request ${i} should get 401`)
      } else {
        assert.strictEqual(res.statusCode, 429, '6th request must get 429')
        assert.strictEqual(res.body.message, 'Rate limit exceeded (visitor limit)', 'Should report visitor limit error')
        
        // Save for Scenario 15 validation
        keysToValidate.visitor = {
          siteKey: siteKeyVisitor,
          visitorId: visitorId,
          expectedKey: `track:visitor:${hashKeyPart(siteKeyVisitor)}:${hashKeyPart(visitorId)}`
        }
      }
    }
    console.log('✅ Scenario 3 Passed.\n')

    // Scenario 4: IP rate limit cap (max = 10 in test mode)
    console.log('Scenario 4: Verifying IP rate limit cap under rotating anonymous IDs...')
    const siteKeyIp = 'sk_ip_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeyIp)
    const simulatedIp = '86.127.232.92'
    for (let i = 1; i <= 11; i++) {
      const anonId = `anon_ip_rot_${i}`
      sensitiveValues.add(anonId)
      const res = await makeRequest({
        path: '/api/track',
        headers: { 'X-Forwarded-For': simulatedIp },
        body: { site_key: siteKeyIp, event: '$pageview', anonymous_id: anonId }
      })
      if (i <= 10) {
        assert.strictEqual(res.statusCode, 401, `Request ${i} should get 401`)
      } else {
        assert.strictEqual(res.statusCode, 429, '11th request must get 429 (IP limit)')
        assert.strictEqual(res.body.message, 'Rate limit exceeded (ip limit)', 'Should report IP limit error')

        // Save for Scenario 15 validation
        keysToValidate.ip = {
          siteKey: siteKeyIp,
          ip: simulatedIp,
          expectedKey: `track:ip:${hashKeyPart(siteKeyIp)}:${hashKeyPart(simulatedIp)}`
        }
      }
    }
    console.log('✅ Scenario 4 Passed.\n')

    // Scenario 5: Site rate limit cap (max = 15 in test mode)
    console.log('Scenario 5: Verifying Site rate limit cap under rotating visitor and IP IDs...')
    const siteKeySite = 'sk_site_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeySite)
    for (let i = 1; i <= 16; i++) {
      const rotIp = `86.127.232.${i}`
      const anonId = `anon_site_rot_${i}`
      sensitiveValues.add(anonId)
      const res = await makeRequest({
        path: '/api/track',
        headers: { 'X-Forwarded-For': rotIp },
        body: { site_key: siteKeySite, event: '$pageview', anonymous_id: anonId }
      })
      if (i <= 15) {
        assert.strictEqual(res.statusCode, 401, `Request ${i} should get 401`)
      } else {
        assert.strictEqual(res.statusCode, 429, '16th request must get 429 (Site limit)')
        assert.strictEqual(res.body.message, 'Rate limit exceeded (site limit)', 'Should report Site limit error')

        // Save for Scenario 15 validation
        keysToValidate.site = {
          siteKey: siteKeySite,
          expectedKey: `track:site:${hashKeyPart(siteKeySite)}`
        }
      }
    }
    console.log('✅ Scenario 5 Passed.\n')

    // Scenario 6: Global IP rate limit cap (max = 20 in test mode)
    console.log('Scenario 6: Verifying Global IP rate limit cap under rotating site keys...')
    const globalIp = '55.55.55.55'
    for (let i = 1; i <= 21; i++) {
      const rotSiteKey = `sk_rot_global_${i}_` + Math.random().toString(36).slice(2)
      sensitiveValues.add(rotSiteKey)
      const res = await makeRequest({
        path: '/api/track',
        headers: { 'X-Forwarded-For': globalIp },
        body: { site_key: rotSiteKey, event: '$pageview', anonymous_id: 'global_anon' }
      })
      if (i <= 20) {
        assert.strictEqual(res.statusCode, 401, `Request ${i} should get 401`)
      } else {
        assert.strictEqual(res.statusCode, 429, '21st request must get 429 (Global IP limit)')
        assert.strictEqual(res.body.message, 'Rate limit exceeded (global-ip limit)', 'Should report Global IP limit error')

        // Save for Scenario 15 validation
        keysToValidate.globalIp = {
          ip: globalIp,
          expectedKey: `track:global-ip:${hashKeyPart(globalIp)}`
        }
      }
    }
    console.log('✅ Scenario 6 Passed.\n')

    // Scenario 7: OPTIONS requests bypass limits
    console.log('Scenario 7: Verifying OPTIONS requests do not consume rate limits...')
    const siteKeyOptions = 'sk_options_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeyOptions)
    // Send 10 OPTIONS requests
    for (let i = 0; i < 10; i++) {
      const res = await makeRequest({
        method: 'OPTIONS',
        path: '/api/track',
        headers: { Origin: 'https://example.com' }
      })
      assert.notStrictEqual(res.statusCode, 429, 'OPTIONS request should not get 429')
    }
    // Now make a POST request — it should succeed (be 401, not 429 visitor limit)
    const resPost = await makeRequest({
      path: '/api/track',
      body: { site_key: siteKeyOptions, event: '$pageview', anonymous_id: 'options_anon' }
    })
    assert.strictEqual(resPost.statusCode, 401, 'POST should get 401, showing OPTIONS did not exhaust visitor limit')
    console.log('✅ Scenario 7 Passed.\n')

    // Scenario 8: Oversized ID hashing
    console.log('Scenario 8: Verifying oversized ID hashing does not crash...')
    const siteKeyOversized = 'sk_oversized_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeyOversized)
    const hugeAnonId = 'a'.repeat(10000) // 10KB string
    const resHuge = await makeRequest({
      path: '/api/track',
      body: { site_key: siteKeyOversized, event: '$pageview', anonymous_id: hugeAnonId }
    })
    assert.strictEqual(resHuge.statusCode, 401, 'Should handle huge visitor ID gracefully and validate site key')
    console.log('✅ Scenario 8 Passed.\n')

    // Scenario 9: Conversion limiters (visitor cap = 3 in test mode)
    console.log('Scenario 9: Verifying conversion rate limiters...')
    const siteKeyConv = 'sk_conv_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeyConv)
    const testOrderId = 'order_123'
    for (let i = 1; i <= 4; i++) {
      const res = await makeRequest({
        path: '/api/conversion',
        body: { site_key: siteKeyConv, order_id: testOrderId }
      })
      if (i <= 3) {
        assert.strictEqual(res.statusCode, 401, `Request ${i} should get 401`)
      } else {
        assert.strictEqual(res.statusCode, 429, '4th request must get 429 (conversion visitor limit)')
        assert.strictEqual(res.body.message, 'Rate limit exceeded (visitor limit)', 'Should report conversion visitor limit error')

        // Save for Scenario 15 validation
        keysToValidate.conversion = {
          siteKey: siteKeyConv,
          orderId: testOrderId,
          expectedKey: `conversion:visitor:${hashKeyPart(siteKeyConv)}:${hashKeyPart(testOrderId)}`
        }
      }
    }
    console.log('✅ Scenario 9 Passed.\n')

    // Scenario 10: Tracker ID limiters (IP+UA cap = 5 in test mode)
    console.log('Scenario 10: Verifying tracker ID rate limiters...')
    const siteKeyTrackerId = 'sk_tracker_id_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeyTrackerId)
    const testIp = '12.34.56.78'
    const testUa = 'test-ua-string'
    for (let i = 1; i <= 6; i++) {
      const res = await makeRequest({
        method: 'GET',
        path: `/api/tracker/id?site_key=${siteKeyTrackerId}`,
        headers: { 'X-Forwarded-For': testIp, 'User-Agent': testUa }
      })
      if (i <= 5) {
        assert.strictEqual(res.statusCode, 200, `Request ${i} should get 200`)
      } else {
        assert.strictEqual(res.statusCode, 429, '6th request must get 429')
        assert.strictEqual(res.body.message, 'Rate limit exceeded (visitor limit)', 'Should report tracker ID visitor limit error')

        // Save for Scenario 15 validation
        keysToValidate.trackerId = {
          siteKey: siteKeyTrackerId,
          ip: testIp,
          ua: testUa,
          expectedKey: `trackerId:visitor:${hashKeyPart(siteKeyTrackerId)}:${hashKeyPart(testIp)}:${hashKeyPart(testUa)}`
        }
      }
    }
    console.log('✅ Scenario 10 Passed.\n')

    // Scenario 11: /api/pixel and /sp/e routes unchanged
    console.log('Scenario 11: Verifying `/api/pixel` is not skipped or rate-limited by visitor limits...')
    const pixelSiteKey = 'sk_pixel_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(pixelSiteKey)
    for (let i = 0; i < 8; i++) {
      const res = await makeRequest({
        method: 'GET',
        path: `/api/pixel?site_key=${pixelSiteKey}`
      })
      assert.notStrictEqual(res.statusCode, 429, 'Pixel route should not trigger 429 under visitor rate-limiting')
    }
    console.log('✅ Scenario 11 Passed.\n')

    // Scenario 12: CORS Headers on 429 Responses
    console.log('Scenario 12: Checking CORS headers presence on 429 responses...')
    // Triggers visitor cap for siteKeyCollect on /api/collect
    const siteKeyCollect = 'sk_collect_cors_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeyCollect)
    for (let i = 1; i <= 6; i++) {
      const res = await makeRequest({
        path: '/api/collect',
        headers: { Origin: 'https://customer-website.com' },
        body: { site_key: siteKeyCollect, event: '$pageview', anonymous_id: 'collect_cors_anon' }
      })
      if (i === 6) {
        assert.strictEqual(res.statusCode, 429, '6th collect request should return 429')
        assert.strictEqual(res.headers['access-control-allow-origin'], 'https://customer-website.com', 'CORS origin header must match request origin')
        assert.strictEqual(res.headers['access-control-allow-credentials'], 'true', 'CORS credentials header must be true')
      }
    }

    // Triggers visitor cap for siteKeyTrackerIdCors on /api/tracker/id
    const siteKeyTrackerIdCors = 'sk_tid_cors_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeyTrackerIdCors)
    for (let i = 1; i <= 6; i++) {
      const res = await makeRequest({
        method: 'GET',
        path: `/api/tracker/id?site_key=${siteKeyTrackerIdCors}`,
        headers: { Origin: 'https://customer-website.com', 'X-Forwarded-For': '12.34.56.78', 'User-Agent': 'cors-ua' }
      })
      if (i === 6) {
        assert.strictEqual(res.statusCode, 429, '6th tracker/id request should return 429')
        assert.strictEqual(res.headers['access-control-allow-origin'], 'https://customer-website.com', 'CORS origin header must match request origin')
      }
    }
    console.log('✅ Scenario 12 Passed.\n')

    // Scenario 13: Malformed site_key bodies/queries
    console.log('Scenario 13: Verifying malformed site_key object/array does not crash server...')
    const resObjectKey = await makeRequest({
      path: '/api/track',
      body: { site_key: { nested: 'danger' }, event: '$pageview', anonymous_id: 'malformed_anon' }
    })
    assert.strictEqual(resObjectKey.statusCode, 401, 'Should handle object site_key gracefully without crashing and fail authentication')

    const resArrayKey = await makeRequest({
      path: '/api/track',
      body: { site_key: ['danger1', 'danger2'], event: '$pageview', anonymous_id: 'malformed_anon' }
    })
    assert.strictEqual(resArrayKey.statusCode, 401, 'Should handle array site_key gracefully without crashing and fail authentication')
    console.log('✅ Scenario 13 Passed.\n')

    // Scenario 14: Boundary paths match correctly & trailing slash normalization is logged
    console.log('Scenario 14: Verifying trailing slash routes and offline conversion remain unaffected...')
    const siteKeyOffline = 'sk_offline_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeyOffline)
    // Make 10 requests to offline conversion
    for (let i = 0; i < 10; i++) {
      const res = await makeRequest({
        path: '/api/conversion/offline',
        body: { site_key: siteKeyOffline }
      })
      assert.strictEqual(res.statusCode, 401, `Request ${i} to offline conversion returned status ${res.statusCode} instead of 401`)
      assert.notStrictEqual(res.statusCode, 429, `Request ${i} to offline conversion was rate limited`)
    }

    // Trigger rate limit on a trailing-slash variant: /api/track/
    const siteKeyTrailing = 'sk_trailing_' + Math.random().toString(36).slice(2)
    sensitiveValues.add(siteKeyTrailing)
    const trailingVisitor = 'trailing_anon'
    sensitiveValues.add(trailingVisitor)
    const simulatedTrailingIp = '99.99.99.99'
    sensitiveValues.add(simulatedTrailingIp)
    for (let i = 1; i <= 6; i++) {
      const res = await makeRequest({
        path: '/api/track/', // trailing slash
        headers: { 'X-Forwarded-For': simulatedTrailingIp },
        body: { site_key: siteKeyTrailing, event: '$pageview', anonymous_id: trailingVisitor }
      })
      if (i <= 5) {
        assert.strictEqual(res.statusCode, 401)
      } else {
        assert.strictEqual(res.statusCode, 429)
        assert.strictEqual(res.body.message, 'Rate limit exceeded (visitor limit)')

        keysToValidate.trailing = {
          siteKey: siteKeyTrailing,
          visitorId: trailingVisitor,
          expectedKey: `track:visitor:${hashKeyPart(siteKeyTrailing)}:${hashKeyPart(trailingVisitor)}`
        }
      }
    }
    console.log('✅ Scenario 14 Passed.\n')

  } finally {
    // Terminate server
    apiProcess.kill()
    await sleep(500)
    console.log('API server stopped.\n')
  }

  // Scenario 15: Log privacy audit & cryptographic verification
  console.log('Scenario 15: Auditing server logs for raw/sensitive values leakage & verifying HMAC hash accuracy...')
  const logBlock = serverLogs.join('\n')
  
  // Find all [rate-limit] entries
  const rateLimitLines = logBlock.split('\n').filter(line => line.includes('[rate-limit]'))
  assert.ok(rateLimitLines.length > 0, 'Should have printed [rate-limit] warnings during rate limiting')

  const logRegex = /\[rate-limit\] route=(?<route>\S+) layer=(?<layer>\S+) status=429 site_key_hash=(?<site_key_hash>\S+) ip_hash=(?<ip_hash>\S+) limiter_key_hash=(?<limiter_key_hash>\S+) resolver_mode=(?<resolver_mode>\S+)/

  for (const line of rateLimitLines) {
    const match = line.match(logRegex)
    assert.ok(match, `Log line must match structured format: ${line}`)
    
    const { route, layer, site_key_hash, ip_hash, limiter_key_hash } = match.groups

    // Check that hashes are pseudonymous Hex strings of exactly 16 chars (or 8 chars for sliced site_key)
    assert.strictEqual(site_key_hash.length, 8, `site_key_hash must be sliced to 8 characters: ${line}`)
    assert.ok(/^[0-9a-f]{16}$/.test(ip_hash) || ip_hash === 'missing', `ip_hash must be a 16-character hex: ${line}`)
    assert.ok(/^[0-9a-f]{16}$/.test(limiter_key_hash) || limiter_key_hash === 'missing', `limiter_key_hash must be a 16-character hex: ${line}`)

    // Cryptographic validation of specific log entries we captured
    if (keysToValidate.visitor && layer === 'visitor' && route === '/api/track') {
      const expectedSiteHash = getHmacHash(keysToValidate.visitor.siteKey).slice(0, 8)
      if (site_key_hash === expectedSiteHash) {
        const expectedLimiterHash = getHmacHash(keysToValidate.visitor.expectedKey)
        assert.strictEqual(limiter_key_hash, expectedLimiterHash, 'Limiter key hash in logs must match the computed HMAC hash of the visitor key')
        console.log('  -> Verified visitor key hash cryptographic accuracy.')
      }
    }

    if (keysToValidate.ip && layer === 'ip' && route === '/api/track') {
      const expectedSiteHash = getHmacHash(keysToValidate.ip.siteKey).slice(0, 8)
      if (site_key_hash === expectedSiteHash) {
        const expectedLimiterHash = getHmacHash(keysToValidate.ip.expectedKey)
        assert.strictEqual(limiter_key_hash, expectedLimiterHash, 'Limiter key hash in logs must match the computed HMAC hash of the IP key')
        console.log('  -> Verified IP key hash cryptographic accuracy.')
      }
    }

    if (keysToValidate.site && layer === 'site' && route === '/api/track') {
      const expectedSiteHash = getHmacHash(keysToValidate.site.siteKey).slice(0, 8)
      if (site_key_hash === expectedSiteHash) {
        const expectedLimiterHash = getHmacHash(keysToValidate.site.expectedKey)
        assert.strictEqual(limiter_key_hash, expectedLimiterHash, 'Limiter key hash in logs must match the computed HMAC hash of the site key')
        console.log('  -> Verified site key hash cryptographic accuracy.')
      }
    }

    if (keysToValidate.globalIp && layer === 'global-ip' && route === '/api/track') {
      const expectedIpHash = getHmacHash(keysToValidate.globalIp.ip)
      if (ip_hash === expectedIpHash) {
        const expectedLimiterHash = getHmacHash(keysToValidate.globalIp.expectedKey)
        assert.strictEqual(limiter_key_hash, expectedLimiterHash, 'Limiter key hash in logs must match the computed HMAC hash of the global IP key')
        console.log('  -> Verified global IP key hash cryptographic accuracy.')
      }
    }

    if (keysToValidate.conversion && layer === 'visitor' && route === '/api/conversion') {
      const expectedSiteHash = getHmacHash(keysToValidate.conversion.siteKey).slice(0, 8)
      if (site_key_hash === expectedSiteHash) {
        const expectedLimiterHash = getHmacHash(keysToValidate.conversion.expectedKey)
        assert.strictEqual(limiter_key_hash, expectedLimiterHash, 'Limiter key hash in logs must match the computed HMAC hash of the conversion key')
        console.log('  -> Verified conversion key hash cryptographic accuracy.')
      }
    }

    if (keysToValidate.trackerId && layer === 'visitor' && route === '/api/tracker/id') {
      const expectedSiteHash = getHmacHash(keysToValidate.trackerId.siteKey).slice(0, 8)
      if (site_key_hash === expectedSiteHash) {
        const expectedLimiterHash = getHmacHash(keysToValidate.trackerId.expectedKey)
        assert.strictEqual(limiter_key_hash, expectedLimiterHash, 'Limiter key hash in logs must match the computed HMAC of the tracker ID visitor key')
        console.log('  -> Verified tracker ID key hash cryptographic accuracy.')
      }
    }

    if (keysToValidate.trailing && layer === 'visitor') {
      const expectedSiteHash = getHmacHash(keysToValidate.trailing.siteKey).slice(0, 8)
      if (site_key_hash === expectedSiteHash) {
        assert.strictEqual(route, '/api/track', 'Trailing slash route in log must be normalized to /api/track')
        const expectedLimiterHash = getHmacHash(keysToValidate.trailing.expectedKey)
        assert.strictEqual(limiter_key_hash, expectedLimiterHash, 'Limiter key hash in logs must match the computed HMAC of the trailing slash key')
        console.log('  -> Verified trailing-slash normalized route and key hash cryptographic accuracy.')
      }
    }

    // Assert NO raw sensitive identifiers are printed
    for (const val of sensitiveValues) {
      if (val && line.includes(val)) {
        throw new Error(`CRITICAL PRIVACY VIOLATION: Raw sensitive value "${val}" leaked in server logs: \n${line}`)
      }
    }
  }
  console.log('✅ Scenario 15 Passed.\n')
}

async function main() {
  try {
    await runTests()
    console.log('\n🎉 ALL QA RATE LIMITS TESTS PASSED!')
    process.exit(0)
  } catch (err) {
    console.error('\n❌ QA Test failed:', err.stack || err.message)
    console.error('\n--- SERVER LOGS DURING TEST ---')
    console.error(serverLogs.join(''))
    console.error('-------------------------------')
    process.exit(1)
  }
}

main()
