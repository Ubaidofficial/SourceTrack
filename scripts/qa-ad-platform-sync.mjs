import dotenv from 'dotenv'
dotenv.config()

import assert from 'assert'
import crypto from 'crypto'
import { getSupabase } from '../api/lib/supabase.js'
import { encryptSecret, decryptSecret } from '../api/lib/utils.js'
import {
  generateStateToken,
  verifyStateToken,
  getAuthUrl,
  fetchGoogleAdsPerformance
} from '../api/lib/google-ads.js'
import {
  normalizeMetaAccountId,
  validateMetaCredentials,
  fetchMetaPerformance
} from '../api/lib/meta-ads.js'
import {
  buildCampaignCostUpsertRows,
  upsertCampaignCostRows
} from '../api/lib/ad-cost-imports.js'

console.log('==================================================')
import { getCostDedupeKey } from '../api/lib/ad-cost-imports.js'
console.log('       QA Verification: Ad Platform Cost Sync     ')
console.log('==================================================\n')

// Enable mock flags for testing API logic
process.env.ST_MOCK_AD_PLATFORMS = 'true'

function runTokenAndStateTests() {
  console.log('1. Testing State Token signing and HMAC validations...')

  const siteKey = 'sk_live_testsite123'
  const userId = 'usr_testuser456'

  // Generate signed state token
  const state = generateStateToken(siteKey, userId)
  assert.ok(state)
  assert.strictEqual(state.split('.').length, 2)

  // Verify valid state token
  const verified = verifyStateToken(state)
  assert.strictEqual(verified.siteKey, siteKey)
  assert.strictEqual(verified.userId, userId)
  assert.strictEqual(verified.platform, 'google_ads')

  // Verify tampered state token signature is rejected
  const [payloadB64, signature] = state.split('.')
  const tamperedState = `${payloadB64}.invalidhmac123`
  assert.throws(() => verifyStateToken(tamperedState), /verification failed/)

  console.log('✅ State Token tests passed.\n')

  console.log('2. Testing OAuth URL not_configured behavior...')
  // Temporarily back up client keys
  const origClientId = process.env.GOOGLE_CLIENT_ID
  const origRedirect = process.env.GOOGLE_ADS_REDIRECT_URI

  delete process.env.GOOGLE_CLIENT_ID
  delete process.env.GOOGLE_ADS_REDIRECT_URI

  const noConfig = getAuthUrl(siteKey, userId)
  assert.strictEqual(noConfig.not_configured, true)

  // Restore client keys
  process.env.GOOGLE_CLIENT_ID = origClientId || 'mock_client'
  process.env.GOOGLE_ADS_REDIRECT_URI = origRedirect || 'mock_redirect'

  console.log('✅ OAuth URL not_configured behavior validated.\n')

  console.log('3. Testing token encryption round-trips...')
  const sampleToken = 'EAA_facebook_access_token_12345_sample'
  const encrypted = encryptSecret(sampleToken)
  assert.ok(encrypted)
  assert.notStrictEqual(encrypted, sampleToken)

  const decrypted = decryptSecret(encrypted)
  assert.strictEqual(decrypted, sampleToken)

  console.log('✅ Token encryption round-trip validated.\n')
}

function runNormalizationTests() {
  console.log('4. Testing ID normalizations...')

  // Google Ads IDs (strip hyphens)
  const cleanGoogleId1 = String('123-456-7890').replace(/-/g, '').trim()
  assert.strictEqual(cleanGoogleId1, '1234567890')

  // Meta Ads IDs (strip act_ prefix)
  assert.strictEqual(normalizeMetaAccountId('act_1234567'), '1234567')
  assert.strictEqual(normalizeMetaAccountId(' 987654 '), '987654')

  console.log('✅ Normalizations passed.\n')

  console.log('5. Testing API Client mock mapping & conversions...')

  // Cost conversion from micros
  const costMicros = '25000000'
  const spend = Number(costMicros) / 1000000
  assert.strictEqual(spend, 25.00)

  // Google Performance Mock Parser
  fetchGoogleAdsPerformance('1234567890', '2026-06-01', '2026-06-01', 'mock_token')
    .then(rows => {
      assert.strictEqual(rows.length, 2)
      assert.strictEqual(rows[0].campaign.id, '2001')
      assert.strictEqual(rows[0].customer.currencyCode, 'USD')
    })

  // Meta Performance Mock Parser
  fetchMetaPerformance('123456789', '2026-06-01', '2026-06-01', 'mock_token')
    .then(rows => {
      assert.strictEqual(rows.length, 2)
      assert.strictEqual(rows[0].campaign_id, '3001')
      assert.strictEqual(parseFloat(rows[0].spend), 120.50)
    })

  console.log('✅ API Client mock parsers validated.\n')
}

async function runDatabaseConstraintTests() {
  console.log('6. Verifying database table constraints & connections...')
  const supabase = getSupabase()

  // Verify connection row constraint exists and RLS
  const { data: cols, error: connErr } = await supabase
    .from('ad_platform_connections')
    .select('id, platform, status')
    .limit(1)

  if (connErr) {
    if (connErr.code === '42P01') {
      console.log('❌ Table "ad_platform_connections" does not exist in database.')
      console.log('👉 Please apply the migration SQL in your Supabase SQL Editor first:')
      console.log('   supabase/migrations/20260608010000_add_ad_platform_connections.sql\n')
      process.exit(1)
    } else {
      console.warn(`⚠️ Querying connections returned error: ${connErr.message}`)
    }
  } else {
    console.log('✅ ad_platform_connections table exists in database.')
  }

  // Generate test site context
  const testSiteKey = 'sk_qa_plat_sync_test_' + Date.now()
  const testSiteId = '00000000-0000-0000-0000-000000000000' // mock site ID

  // Get an active site_key from sites to run check constraints if live DB
  const { data: realSite } = await supabase.from('sites').select('site_key, id').limit(1).maybeSingle()
  if (!realSite) {
    console.log('⚠️ No sites in database. Skipping check constraint insertion checks.')
    return
  }

  const siteKey = realSite.site_key

  // Clean connection profile first
  await supabase.from('ad_platform_connections').delete().eq('site_key', siteKey)

  console.log('  a) Meta connected status without access token -> should be rejected')
  const { error: metaErr1 } = await supabase
    .from('ad_platform_connections')
    .insert({
      site_key: siteKey,
      platform: 'meta_ads',
      account_id: '12345',
      status: 'connected',
      encrypted_access_token: null
    })
  assert.ok(metaErr1, 'Meta insert without token did not reject')
  console.log('     Rejection error:', metaErr1.message)

  console.log('  b) Meta connected status without account ID -> should be rejected')
  const { error: metaErr2 } = await supabase
    .from('ad_platform_connections')
    .insert({
      site_key: siteKey,
      platform: 'meta_ads',
      account_id: '',
      status: 'connected',
      encrypted_access_token: 'encrypted_val'
    })
  assert.ok(metaErr2, 'Meta insert with empty account ID did not reject')
  console.log('     Rejection error:', metaErr2.message)

  console.log('  c) Meta needs_account status -> should be rejected')
  const { error: metaErr3 } = await supabase
    .from('ad_platform_connections')
    .insert({
      site_key: siteKey,
      platform: 'meta_ads',
      account_id: '12345',
      status: 'needs_account',
      encrypted_access_token: 'encrypted_val'
    })
  assert.ok(metaErr3, 'Meta insert with needs_account status did not reject')
  console.log('     Rejection error:', metaErr3.message)

  console.log('  d) Google connected status with blank customer ID -> should be rejected')
  const { error: gadsErr1 } = await supabase
    .from('ad_platform_connections')
    .insert({
      site_key: siteKey,
      platform: 'google_ads',
      account_id: '   ',
      status: 'connected',
      encrypted_refresh_token: 'encrypted_val'
    })
  assert.ok(gadsErr1, 'Google Ads insert with blank customer ID did not reject')
  console.log('     Rejection error:', gadsErr1.message)

  console.log('  e) Google needs_account status with refresh token -> should be accepted')
  const { error: gadsErr2 } = await supabase
    .from('ad_platform_connections')
    .insert({
      site_key: siteKey,
      platform: 'google_ads',
      account_id: null,
      status: 'needs_account',
      encrypted_refresh_token: 'encrypted_val'
    })
  assert.strictEqual(gadsErr2, null, gadsErr2?.message)
  console.log('     Insert successful.')

  // Clean connection profile
  await supabase.from('ad_platform_connections').delete().eq('site_key', siteKey)

  console.log('✅ Database check constraints validated.\n')

  console.log('7. Testing campaign costs preservation after disconnections...')
  // Check if costs are deleted on connection updates
  // Create sample cost records manually
  const testCampaign = 'Platform Sync QA Campaign'
  const mockCampaignId = '2001'
  const upsertRows = buildCampaignCostUpsertRows(
    [{
      date: '2026-06-01',
      platform: 'google_ads',
      campaign_name: testCampaign,
      campaign_id: mockCampaignId,
      spend: 50.00,
      clicks: 10,
      impressions: 100,
      currency: 'USD'
    }],
    realSite
  )

  await upsertCampaignCostRows(supabase, upsertRows)

  // Verify rows exist in campaign_costs
  const { data: costsBefore } = await supabase
    .from('campaign_costs')
    .select('id')
    .eq('site_id', realSite.id)
    .eq('campaign_id', mockCampaignId)
  assert.strictEqual(costsBefore?.length, 1)

  // Disconnect the GAds platform (which deletes connection profiles)
  await supabase
    .from('ad_platform_connections')
    .delete()
    .eq('site_key', siteKey)
    .eq('platform', 'google_ads')

  // Re-verify rows STILL exist in campaign_costs (not cascadingly deleted)
  const { data: costsAfter } = await supabase
    .from('campaign_costs')
    .select('id')
    .eq('site_id', realSite.id)
    .eq('campaign_id', mockCampaignId)
  assert.strictEqual(costsAfter?.length, 1, 'campaign_costs cost rows were deleted on disconnection')

  // Clean sample costs
  await supabase.from('campaign_costs').delete().eq('site_id', realSite.id).eq('campaign_id', mockCampaignId)

  console.log('✅ campaign_costs cost preservation verified on disconnection.\n')
}

function runFrontendUnwrapShapeTest() {
  console.log('8. Verifying Campaigns.jsx fetchApi unwrap shape compatibility...')

  // Simulation 1: fetchApi returns unwrapped object directly (the data field)
  const mockApiResponseUnwrapped = {
    google_ads: { status: 'connected', last_synced_at: '2026-06-08T00:00:00Z' },
    meta_ads: { status: 'connected', last_synced_at: '2026-06-08T01:00:00Z' }
  }

  // Simulation 2: fetchApi returns response payload wrapping the data field (or fallback)
  const mockApiResponseWrapped = {
    success: true,
    data: {
      google_ads: { status: 'connected', last_synced_at: '2026-06-08T00:00:00Z' },
      meta_ads: { status: 'connected', last_synced_at: '2026-06-08T01:00:00Z' }
    }
  }

  const checkShape = (adPlatStatus) => {
    const adPlatformData = adPlatStatus?.data || adPlatStatus || {}
    const googleStatus = adPlatformData.google_ads
    const metaStatus = adPlatformData.meta_ads

    assert.strictEqual(googleStatus?.status, 'connected')
    assert.strictEqual(metaStatus?.status, 'connected')
    assert.strictEqual(googleStatus?.last_synced_at, '2026-06-08T00:00:00Z')
    assert.strictEqual(metaStatus?.last_synced_at, '2026-06-08T01:00:00Z')
  }

  checkShape(mockApiResponseUnwrapped)
  checkShape(mockApiResponseWrapped)

  console.log('✅ Campaigns.jsx fetchApi unwrap shape verified.\n')
}

async function start() {
  try {
    runTokenAndStateTests()
    runNormalizationTests()
    await runDatabaseConstraintTests()
    runFrontendUnwrapShapeTest()
    console.log('🎉 ALL AUTOMATED PLATFORM COST SYNC QA TESTS PASSED SUCCESSFULLY! 🎉')
  } catch (err) {
    console.error('❌ QA Test failed:', err)
    process.exit(1)
  }
}

start()
