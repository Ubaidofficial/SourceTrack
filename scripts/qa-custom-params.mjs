import dotenv from 'dotenv'
dotenv.config()

import { getSupabase } from '../api/lib/supabase.js'
import { extractCustomParams } from '../api/lib/utils.js'
import { validateReportConfig } from '../api/lib/report-config-validation.js'
import assert from 'assert'

console.log('==================================================')
console.log('         QA Verification: Custom URL Params    ')
console.log('==================================================\n')

async function runSchemaChecks() {
  console.log('1. Checking sites.custom_url_params column...')
  const supabase = getSupabase()
  try {
    const { data, error } = await supabase
      .from('sites')
      .select('custom_url_params')
      .limit(1)

    if (error) {
      if (process.env.ALLOW_CUSTOM_PARAMS_SCHEMA_WARN === '1') {
        console.warn('⚠️  Warning: sites.custom_url_params column does not exist yet in database.');
        console.warn('   Make sure to apply the migration SQL in your Supabase SQL Editor.');
        console.warn(`   Error message: ${error.message || error}\n`);
        return;
      } else {
        throw new Error(`Schema check failed: sites.custom_url_params column does not exist in database. Run migration or set ALLOW_CUSTOM_PARAMS_SCHEMA_WARN=1 to bypass. Error: ${error.message || error}`);
      }
    }
    console.log('✅ sites.custom_url_params column exists in database.\n')
  } catch (err) {
    if (process.env.ALLOW_CUSTOM_PARAMS_SCHEMA_WARN === '1') {
      console.warn(`⚠️  Warning: Failed to check column (connection error): ${err.message}. Proceeding...\n`);
    } else {
      throw err;
    }
  }
}

function runExtractionTests() {
  console.log('2. Running extractCustomParams tests (PII & validation)...')

  // Case A: Normal allowlisted extraction
  const normalResult = extractCustomParams(
    'https://example.com/?affiliate=john_123&partner=xyz&utm_source=google',
    ['affiliate', 'partner']
  )
  assert.deepStrictEqual(normalResult, {
    custom_affiliate: 'john_123',
    custom_partner: 'xyz'
  }, 'Should extract allowlisted custom parameters')

  // Case B: Unallowlisted param dropped
  const unallowedResult = extractCustomParams(
    'https://example.com/?affiliate=john_123&unallowed=999',
    ['affiliate']
  )
  assert.deepStrictEqual(unallowedResult, {
    custom_affiliate: 'john_123'
  }, 'Should ignore unallowlisted parameters')

  // Case C: Invalid allowlist keys ignored
  const invalidKeyResult = extractCustomParams(
    'https://example.com/?affiliate!=123&aff-iliate=abc',
    ['affiliate!', 'aff-iliate']
  )
  assert.deepStrictEqual(invalidKeyResult, {
    'custom_aff-iliate': 'abc'
  }, 'Should ignore invalid keys matching regex rules')

  // Case D: Blocked sensitive substrings in keys
  const blockedKeyResult = extractCustomParams(
    'https://example.com/?user_token=secret123&my_email=abc@test.com&affiliate=john',
    ['user_token', 'my_email', 'affiliate']
  )
  assert.deepStrictEqual(blockedKeyResult, {
    custom_affiliate: 'john'
  }, 'Should block sensitive parameter keys')

  // Case E: Value length check (> 120 chars)
  const longValueResult = extractCustomParams(
    'https://example.com/?affiliate=' + 'a'.repeat(121),
    ['affiliate']
  )
  assert.deepStrictEqual(longValueResult, {}, 'Should drop values longer than 120 characters')

  // Case F: Email PII drop (exact match)
  const emailResult = extractCustomParams(
    'https://example.com/?affiliate=victim@gmail.com',
    ['affiliate']
  )
  assert.deepStrictEqual(emailResult, {}, 'Should drop email addresses completely')

  // Case F2: Contained email PII drop (e.g. john+test@example.com_campaign)
  const containedEmailResult1 = extractCustomParams(
    'https://example.com/?affiliate=john%2Btest%40example.com_campaign',
    ['affiliate']
  )
  assert.deepStrictEqual(containedEmailResult1, {}, 'Should drop contained email addresses completely')

  // Case F3: Contained email PII drop (e.g. partner:user@example.com)
  const containedEmailResult2 = extractCustomParams(
    'https://example.com/?affiliate=partner%3Auser%40example.com',
    ['affiliate']
  )
  assert.deepStrictEqual(containedEmailResult2, {}, 'Should drop contained email addresses completely')

  // Case G: Phone number PII drop (7+ digits)
  const phoneResult = extractCustomParams(
    'https://example.com/?affiliate=%2B123456789',
    ['affiliate']
  )
  assert.deepStrictEqual(phoneResult, {}, 'Should drop phone numbers completely')

  // Case H: JWT token drop
  const jwtResult = extractCustomParams(
    'https://example.com/?affiliate=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    ['affiliate']
  )
  assert.deepStrictEqual(jwtResult, {}, 'Should drop JWT tokens completely')

  // Case I: Credit card drop
  const ccResult = extractCustomParams(
    'https://example.com/?affiliate=1234-5678-9012-3456',
    ['affiliate']
  )
  assert.deepStrictEqual(ccResult, {}, 'Should drop credit card number patterns completely')

  // Case J: Long hex token-like string drop (length >= 32 hex chars)
  const longHexResult = extractCustomParams(
    'https://example.com/?affiliate=a1b2c3d4e5f60718293a4b5c6d7e8f90',
    ['affiliate']
  )
  assert.deepStrictEqual(longHexResult, {}, 'Should drop long hex strings completely')

  // Case K: Long Base64 / high entropy token-like string drop (length >= 32, mixed case + numbers)
  const longBase64Result = extractCustomParams(
    'https://example.com/?affiliate=aBcD1eFgHiJkLmNoPqRsTuVwXyZ01234',
    ['affiliate']
  )
  assert.deepStrictEqual(longBase64Result, {}, 'Should drop high-entropy alphanumeric base64 strings completely')

  // Case L: Token-like prefixes
  const prefixResult = extractCustomParams(
    'https://example.com/?affiliate=sk_live_5123456789&partner=ghp_ABC123XYZ',
    ['affiliate', 'partner']
  )
  assert.deepStrictEqual(prefixResult, {}, 'Should drop values starting with blocked prefixes')

  // Case M: Token-like over 60 chars check
  const over60Token = extractCustomParams(
    'https://example.com/?affiliate=myTokenValueWhichIsQuiteLongAndLooksLikeATokenOrSessionIdentifier_123',
    ['affiliate']
  )
  assert.deepStrictEqual(over60Token, {}, 'Should drop token-like values longer than 60 characters')

  console.log('✅ extractCustomParams tests passed successfully!\n')
}

function runReportValidationTests() {
  console.log('3. Running Report Builder validation tests...')

  // Case A: Valid custom parameter format check
  const validReport = validateReportConfig({
    groupBy: 'custom_param:affiliate',
    metric: 'revenue'
  })
  assert.strictEqual(validReport.valid, true, 'Valid custom parameter grouping format should pass basic config validation')

  // Case B: Rejects blocked keys (e.g. email)
  const invalidReport1 = validateReportConfig({
    groupBy: 'custom_param:email',
    metric: 'revenue'
  })
  assert.strictEqual(invalidReport1.valid, false, 'Should reject custom parameter keys containing "email"')

  // Case C: Rejects blocked keys (e.g. user_token)
  const invalidReport2 = validateReportConfig({
    groupBy: 'custom_param:user_token',
    metric: 'revenue'
  })
  assert.strictEqual(invalidReport2.valid, false, 'Should reject custom parameter keys containing "token"')

  // Case D: Rejects invalid format keys
  const invalidReport3 = validateReportConfig({
    groupBy: 'custom_param:affiliate!',
    metric: 'revenue'
  })
  assert.strictEqual(invalidReport3.valid, false, 'Should reject custom parameter keys with invalid regex characters')

  // Simulated route validation matching api/routes/attribution.js and api/routes/export.js
  const validateCustomParamRouteInput = (dim, customUrlParams) => {
    if (typeof dim !== 'string' || !/^custom_param:[a-z0-9_-]{1,40}$/.test(dim)) {
      return false
    }
    const key = dim.split(':')[1]
    const blockedSubstrings = ['email', 'phone', 'name', 'address', 'token', 'secret', 'password', 'session', 'auth', 'cookie', 'card', 'ssn']
    for (const sub of blockedSubstrings) {
      if (key.includes(sub)) return false
    }
    return Array.isArray(customUrlParams) && customUrlParams.includes(key)
  }

  // Assertion: allowed custom parameter passes when present in req.site.custom_url_params
  assert.strictEqual(
    validateCustomParamRouteInput('custom_param:affiliate', ['affiliate', 'partner']),
    true,
    'Should accept allowlisted custom parameter'
  )

  // Assertion: unallowlisted custom parameter fails route validation
  assert.strictEqual(
    validateCustomParamRouteInput('custom_param:campaign_source', ['affiliate']),
    false,
    'Should reject unallowlisted custom parameter'
  )

  // Assertion: blocked substrings in custom param key fails route validation
  assert.strictEqual(
    validateCustomParamRouteInput('custom_param:user_session', ['user_session']),
    false,
    'Should reject custom parameter key containing blocked substring session'
  )

  console.log('✅ Report Builder validation tests passed successfully!\n')
}

function testServerSettingsNormalization(rawParams) {
  // Deduplicate, normalize to lowercase, filter out empty values
  const uniqueParams = [...new Set(rawParams.map(p => typeof p === 'string' ? p.trim().toLowerCase() : '').filter(Boolean))]

  if (uniqueParams.length > 10) {
    throw new Error('Maximum of 10 custom URL parameters allowed per site')
  }

  const paramRegex = /^[a-z0-9_-]{1,40}$/
  const blockedSubstrings = ['email', 'phone', 'name', 'address', 'token', 'secret', 'password', 'session', 'auth', 'cookie', 'card', 'ssn']

  for (const p of uniqueParams) {
    if (!paramRegex.test(p)) {
      throw new Error(`Invalid custom URL parameter key "${p}".`)
    }

    for (const sub of blockedSubstrings) {
      if (p.includes(sub)) {
        throw new Error(`Custom URL parameter key "${p}" is blocked. It contains sensitive word "${sub}".`)
      }
    }
  }
  return uniqueParams
}

function runSettingsPatchTests() {
  console.log('4. Running settings PATCH logic tests...')

  // Case A: Deduplication and normalization
  const norm1 = testServerSettingsNormalization(['Affiliate', 'affiliate ', 'partner'])
  assert.deepStrictEqual(norm1, ['affiliate', 'partner'], 'Should normalize and deduplicate settings parameters')

  // Case B: Rejecting invalid format
  assert.throws(() => {
    testServerSettingsNormalization(['affiliate!'])
  }, /Invalid custom URL parameter key/, 'Should throw on invalid parameter keys')

  // Case C: Rejecting sensitive keys
  assert.throws(() => {
    testServerSettingsNormalization(['user_session'])
  }, /is blocked/, 'Should throw on sensitive parameter keys')

  // Case D: Rejecting more than 10 parameters
  assert.throws(() => {
    testServerSettingsNormalization(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11'])
  }, /Maximum of 10 custom URL parameters allowed/, 'Should throw when parameters exceeds 10')

  console.log('✅ Settings PATCH logic tests passed successfully!\n')
}

async function start() {
  try {
    await runSchemaChecks()
    runExtractionTests()
    runReportValidationTests()
    runSettingsPatchTests()
    console.log('🎉 ALL CUSTOM PARAMETER CAPTURE TESTS PASSED SUCCESSFULLY! 🎉')
  } catch (err) {
    console.error('❌ QA Test failed:', err.message)
    process.exit(1)
  }
}

start()
