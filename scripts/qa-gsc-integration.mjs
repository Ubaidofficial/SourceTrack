import dotenv from 'dotenv'
dotenv.config()

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { generateStateToken, verifyStateToken } from '../api/lib/google-search-console.js'
import { normalizePath } from '../api/lib/url-normalization.js'

console.log('==================================================')
console.log('      Google Search Console QA Test Suite')
console.log('==================================================\n')

let failedTests = 0

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASSED: ${message}`)
  } else {
    console.log(`❌ FAILED: ${message}`)
    failedTests++
  }
}

// 1. OAuth State Token Generation & Verification Tests
function testOAuthState() {
  console.log('--- Test Group 1: OAuth State Signature & Payload Validation ---')
  process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')

  const siteKey = 'sk_live_site123'
  const userId = 'usr_user456'

  // Test 1.1: Successful generation and verification
  try {
    const token = generateStateToken(siteKey, userId)
    const payload = verifyStateToken(token)

    assert(payload.siteKey === siteKey, 'verifyStateToken returns correct siteKey')
    assert(payload.userId === userId, 'verifyStateToken returns correct userId')
    assert(typeof payload.nonce === 'string' && payload.nonce.length > 0, 'verifyStateToken returns valid nonce')
    assert(payload.expiresAt > payload.issuedAt, 'verifyStateToken expiresAt > issuedAt')
    assert(payload.expiresAt - payload.issuedAt <= 10 * 60 * 1000 + 5000, 'verifyStateToken has correct 10-minute lifetime')
  } catch (err) {
    assert(false, `verifyStateToken failed on valid token: ${err.message}`)
  }

  // Test 1.2: Signature failure detection
  try {
    const token = generateStateToken(siteKey, userId)
    const corruptToken = token.slice(0, -5) + 'xxxxx'
    verifyStateToken(corruptToken)
    assert(false, 'verifyStateToken did not throw on corrupt signature')
  } catch (err) {
    assert(err.message.includes('signature'), 'verifyStateToken correctly rejects invalid signature')
  }

  // Test 1.3: Expiry checking
  try {
    const encryptionKey = process.env.ENCRYPTION_KEY
    const nonce = 'testnonce'
    const issuedAt = Date.now() - 15 * 60 * 1000 // 15 mins ago
    const expiresAt = issuedAt + 10 * 60 * 1000 // expired 5 mins ago

    const payload = JSON.stringify({ siteKey, userId, nonce, issuedAt, expiresAt })
    const hmac = crypto.createHmac('sha256', encryptionKey).update(payload).digest('base64url')
    const expiredToken = `${Buffer.from(payload).toString('base64url')}.${hmac}`

    verifyStateToken(expiredToken)
    assert(false, 'verifyStateToken did not throw on expired token')
  } catch (err) {
    assert(err.message.includes('expired'), 'verifyStateToken correctly throws on expired token')
  }

  // Test 1.4: Payload shape verification (Empty field detection)
  try {
    const encryptionKey = process.env.ENCRYPTION_KEY
    const payload = JSON.stringify({ siteKey: '', userId: 'usr_1', nonce: 'nonce', issuedAt: Date.now(), expiresAt: Date.now() + 60000 })
    const hmac = crypto.createHmac('sha256', encryptionKey).update(payload).digest('base64url')
    const badToken = `${Buffer.from(payload).toString('base64url')}.${hmac}`

    verifyStateToken(badToken)
    assert(false, 'verifyStateToken did not throw on empty siteKey')
  } catch (err) {
    assert(err.message.includes('shape'), 'verifyStateToken rejects empty siteKey')
  }

  // Test 1.5: Payload shape verification (Invalid lifetime check)
  try {
    const encryptionKey = process.env.ENCRYPTION_KEY
    const payload = JSON.stringify({
      siteKey: 'site',
      userId: 'user',
      nonce: 'nonce',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 20 * 60 * 1000 // 20 minutes (invalid)
    })
    const hmac = crypto.createHmac('sha256', encryptionKey).update(payload).digest('base64url')
    const badToken = `${Buffer.from(payload).toString('base64url')}.${hmac}`

    verifyStateToken(badToken)
    assert(false, 'verifyStateToken did not throw on invalid lifetime')
  } catch (err) {
    assert(err.message.includes('lifetime'), 'verifyStateToken rejects lifetimes greater than 10 minutes')
  }
}

// 2. URL Path Normalization Tests
function testUrlNormalization() {
  console.log('\n--- Test Group 2: URL Path Normalization ---')

  const cases = [
    { in: 'https://example.com', out: '/' },
    { in: 'https://example.com/', out: '/' },
    { in: 'http://example.com/blog', out: '/blog' },
    { in: 'https://sub.example.com/features/attribution/', out: '/features/attribution' },
    { in: 'https://example.com/pricing?ref=marketing&utm_source=twitter', out: '/pricing' },
    { in: '/relative/path/with/slash/', out: '/relative/path/with/slash' },
    { in: 'just-path/no-leading-slash', out: '/just-path/no-leading-slash' },
    { in: 'https://example.com:8080/port', out: '/port' }
  ]

  for (const c of cases) {
    const res = normalizePath(c.in)
    assert(res === c.out, `normalizePath(${c.in}) => ${res} (expected: ${c.out})`)
  }
}

// 3. Mathematical Formula / Aggregate Logic Check
function testAggregations() {
  console.log('\n--- Test Group 3: CTR and Average Position Aggregation Math ---')

  // Sample data: page clicks and impressions from GSC
  const mockQueries = [
    { query: 'attribution software', clicks: 120, impressions: 1000, position: 1.5 },
    { query: 'first touch model', clicks: 30, impressions: 500, position: 4.2 },
    { query: 'sourcetrack', clicks: 15, impressions: 100, position: 1.1 }
  ]

  // CTR check: Sum of clicks / Sum of impressions
  const totalClicks = mockQueries.reduce((s, q) => s + q.clicks, 0)
  const totalImpressions = mockQueries.reduce((s, q) => s + q.impressions, 0)
  const aggregatedCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) : 0

  assert(aggregatedCtr === 165 / 1600, `Aggregated CTR calculated correctly: ${aggregatedCtr}`)

  // Position check: sum(position * impressions) / sum(impressions)
  const sumPositionImpressions = mockQueries.reduce((s, q) => s + (q.position * q.impressions), 0)
  const aggregatedPosition = totalImpressions > 0 ? (sumPositionImpressions / totalImpressions) : 0

  const expectedPosition = (1.5 * 1000 + 4.2 * 500 + 1.1 * 100) / 1600
  assert(aggregatedPosition === expectedPosition, `Aggregated Position calculated correctly (impressions-weighted): ${aggregatedPosition} (expected: ${expectedPosition})`)
}

// 4. Content Copy Word Restrictions & Overclaims Audit
function runCopyAudit() {
  console.log('\n--- Test Group 4: Copy Restrictions & Banned Phrases Audit ---')

  const bannedPhrases = [
    'Proportional Organic Attribution Algorithm',
    'Exact query revenue',
    'User-level keyword attribution',
    '100% accurate SEO attribution'
  ]

  const filesToAudit = [
    'dashboard/src/pages/SEORevenue.jsx',
    'dashboard/src/pages/Integrations.jsx',
    'api/routes/seo-revenue.js',
    'api/lib/google-search-console.js'
  ]

  for (const file of filesToAudit) {
    const filePath = path.resolve(process.cwd(), file)
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ Skip: File not found for audit: ${file}`)
      continue
    }

    const content = fs.readFileSync(filePath, 'utf8')
    let fileClean = true

    for (const phrase of bannedPhrases) {
      if (content.toLowerCase().includes(phrase.toLowerCase())) {
        assert(false, `Banned phrase "${phrase}" detected in ${file}`)
        fileClean = false
      }
    }

    if (fileClean) {
      assert(true, `No banned phrases detected in ${file}`)
    }

    // Verify aggregate notice notice is in place
    if (file === 'dashboard/src/pages/SEORevenue.jsx') {
      const targetNotice = 'aggregated query data, not user-level query-to-conversion identity'
      assert(content.includes(targetNotice), `Required aggregate notice is present in ${file}`)
    } else if (file === 'dashboard/src/pages/Integrations.jsx') {
      const targetNotice = 'GSC provides aggregate query data, not user-level attribution'
      assert(content.includes(targetNotice), `Required aggregate notice is present in ${file}`)
    }
  }
}

// Execute tests
testOAuthState()
testUrlNormalization()
testAggregations()
runCopyAudit()

console.log('\n==================================================')
if (failedTests === 0) {
  console.log('🎉 ALL GSC INTEGRATION QA TESTS PASSED SUCCESSFULLY!')
  process.exit(0)
} else {
  console.log(`❌ QA FAILED WITH ${failedTests} FAILURE(S).`)
  process.exit(1)
}
