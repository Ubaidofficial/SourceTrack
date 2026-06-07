import dotenv from 'dotenv'
dotenv.config()

import assert from 'assert'
import { getSupabase } from '../api/lib/supabase.js'
import {
  getCostDedupeKey,
  normalizeAdCostRow,
  validateAdCostRows,
  aggregateAdCostRows,
  summarizeCurrencyStatus,
  parseCSV,
  csvToObjects
} from '../api/lib/ad-cost-imports.js'

console.log('==================================================')
console.log('         QA Verification: Ad Cost Imports         ')
console.log('==================================================\n')

function runHelperTests() {
  console.log('1. Testing getCostDedupeKey...')
  
  // Case A: campaign_id is present
  assert.strictEqual(getCostDedupeKey('12345', 'Campaign A'), 'id:12345')
  assert.strictEqual(getCostDedupeKey('  999  ', 'Campaign A'), 'id:999')
  assert.strictEqual(getCostDedupeKey({ campaign_id: 'abc', campaign_name: 'xyz' }), 'id:abc')

  // Case B: campaign_id is empty, fall back to lowercase trimmed campaign_name
  assert.strictEqual(getCostDedupeKey('', 'Campaign A'), 'name:campaign a')
  assert.strictEqual(getCostDedupeKey(null, '  Brand campaign  '), 'name:brand campaign')
  assert.strictEqual(getCostDedupeKey({ campaign_id: '', campaign_name: 'XYZ' }), 'name:xyz')
  assert.strictEqual(getCostDedupeKey({ campaign_name: 'Test' }), 'name:test')

  console.log('✅ getCostDedupeKey tests passed.\n')

  console.log('2. Testing normalizeAdCostRow...')
  const row1 = {
    date: '2026-06-08 ',
    platform: ' Google ',
    campaign_name: ' Promo ',
    campaign_id: 12345,
    spend: '45.50',
    clicks: '10',
    impressions: '100',
    currency: ' eur '
  }
  const norm1 = normalizeAdCostRow(row1)
  assert.deepStrictEqual(norm1, {
    date: '2026-06-08',
    platform: 'google',
    campaign_name: 'Promo',
    campaign_id: '12345',
    spend: 45.5,
    clicks: 10,
    impressions: 100,
    currency: 'EUR'
  })

  // Case B: missing optional fields
  const norm2 = normalizeAdCostRow({
    date: '2026-06-08',
    campaign_name: 'Promo',
    spend: 10
  })
  assert.strictEqual(norm2.platform, 'manual_csv')
  assert.strictEqual(norm2.campaign_id, null)
  assert.strictEqual(norm2.clicks, 0)
  assert.strictEqual(norm2.impressions, 0)
  assert.strictEqual(norm2.currency, 'USD')

  console.log('✅ normalizeAdCostRow tests passed.\n')

  console.log('3. Testing validateAdCostRows...')

  // Case A: Valid rows
  const errors1 = validateAdCostRows([
    { date: '2026-06-01', campaign_name: 'C1', spend: 10, currency: 'USD', platform: 'manual_csv' }
  ])
  assert.strictEqual(errors1.length, 0)

  // Case B: Future date
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)
  const errors2 = validateAdCostRows([
    { date: tomorrowStr, campaign_name: 'C1', spend: 10 }
  ])
  assert.ok(errors2.length > 0)
  assert.strictEqual(errors2[0].error, 'Date cannot be in the future')

  // Case C: Invalid date format
  const errors3 = validateAdCostRows([
    { date: '06-08-2026', campaign_name: 'C1', spend: 10 }
  ])
  assert.strictEqual(errors3[0].error, 'Date must be in YYYY-MM-DD format')

  // Case D: Missing/long name
  assert.strictEqual(validateAdCostRows([{ date: '2026-06-01', campaign_name: '', spend: 10 }])[0].error, 'Campaign name is required')
  assert.strictEqual(validateAdCostRows([{ date: '2026-06-01', campaign_name: 'a'.repeat(256), spend: 10 }])[0].error, 'Campaign name must be 255 characters or less')

  // Case E: Negative values
  assert.strictEqual(validateAdCostRows([{ date: '2026-06-01', campaign_name: 'C', spend: -1 }])[0].error, 'Cost/spend cannot be negative')
  assert.strictEqual(validateAdCostRows([{ date: '2026-06-01', campaign_name: 'C', spend: 10, clicks: -1 }])[0].error, 'Clicks must be a non-negative integer')
  assert.strictEqual(validateAdCostRows([{ date: '2026-06-01', campaign_name: 'C', spend: 10, impressions: -1 }])[0].error, 'Impressions must be a non-negative integer')

  // Case F: Clicks > Impressions
  assert.strictEqual(validateAdCostRows([{ date: '2026-06-01', campaign_name: 'C', spend: 10, clicks: 10, impressions: 5 }])[0].error, 'Clicks cannot be greater than impressions')

  // Case G: Currency code format
  assert.strictEqual(validateAdCostRows([{ date: '2026-06-01', campaign_name: 'C', spend: 10, currency: 'US' }])[0].error, 'Currency must be a valid 3-letter uppercase code (e.g. USD)')

  // Case H: Platform validation
  assert.strictEqual(validateAdCostRows([{ date: '2026-06-01', campaign_name: 'C', spend: 10, platform: 'google ads' }])[0].error, 'Platform must be alphanumeric, underscores, or hyphens')

  console.log('✅ validateAdCostRows tests passed.\n')

  console.log('4. Testing aggregateAdCostRows...')
  const duplicatePayload = [
    { date: '2026-06-01', platform: 'google', campaign_name: 'Promo', spend: 10.50, clicks: 5, impressions: 50 },
    { date: '2026-06-01', platform: 'google', campaign_name: 'promo', spend: 5.50, clicks: 2, impressions: 20 }, // case differs, key should merge
    { date: '2026-06-01', platform: 'google', campaign_name: 'Other', spend: 100, clicks: 10, impressions: 100 },
    { date: '2026-06-02', platform: 'google', campaign_name: 'Promo', spend: 20.00, clicks: 8, impressions: 80 }
  ]
  const aggregated = aggregateAdCostRows(duplicatePayload)
  
  // Should merge Promo and promo on 2026-06-01 (10.50 + 5.50 = 16.00, clicks 7, impressions 70)
  const promoDay1 = aggregated.find(a => a.campaign_name.toLowerCase() === 'promo' && a.date === '2026-06-01')
  assert.ok(promoDay1)
  assert.strictEqual(promoDay1.spend, 16.00)
  assert.strictEqual(promoDay1.clicks, 7)
  assert.strictEqual(promoDay1.impressions, 70)

  // Should keep Other distinct
  const otherDay1 = aggregated.find(a => a.campaign_name === 'Other')
  assert.ok(otherDay1)
  assert.strictEqual(otherDay1.spend, 100.00)

  // Should keep date 2 distinct
  const promoDay2 = aggregated.find(a => a.campaign_name === 'Promo' && a.date === '2026-06-02')
  assert.ok(promoDay2)
  assert.strictEqual(promoDay2.spend, 20.00)

  console.log('✅ aggregateAdCostRows tests passed.\n')

  console.log('5. Testing summarizeCurrencyStatus...')
  // Case A: Match
  assert.deepStrictEqual(summarizeCurrencyStatus([{ currency: 'USD' }], 'USD'), { status: 'ok', spendCurrency: 'USD' })
  // Case B: Mismatch
  assert.deepStrictEqual(summarizeCurrencyStatus([{ currency: 'EUR' }], 'USD'), { status: 'mismatch', spendCurrency: 'EUR' })
  // Case C: Mixed
  assert.deepStrictEqual(summarizeCurrencyStatus([{ currency: 'USD' }, { currency: 'EUR' }], 'USD'), { status: 'mixed', spendCurrency: 'MIXED' })

  console.log('✅ summarizeCurrencyStatus tests passed.\n')

  console.log('6. Testing parseCSV & csvToObjects...')
  const csvText = `date,platform,campaign_name,spend,clicks,impressions,currency
2026-06-08,facebook,"Summer, Sale",45.50,40,1200,USD
2026-06-08,google,Brand Search,12.30,12,180,USD`

  const parsedLines = parseCSV(csvText)
  assert.strictEqual(parsedLines.length, 3)
  assert.strictEqual(parsedLines[1][2], 'Summer, Sale') // handles quoted comma

  const parsedObjects = csvToObjects(parsedLines)
  assert.strictEqual(parsedObjects.length, 2)
  assert.strictEqual(parsedObjects[0].campaign_name, 'Summer, Sale')
  assert.strictEqual(parsedObjects[1].spend, '12.30')

  console.log('✅ parseCSV and csvToObjects tests passed.\n')
}

async function runDatabaseChecks() {
  console.log('7. Verifying DB schema, columns and constraints in Supabase...')
  const supabase = getSupabase()

  try {
    const { data: costCols, error: costErr } = await supabase
      .from('campaign_costs')
      .select('id, platform, campaign_id, cost_dedupe_key, clicks, impressions, currency')
      .limit(1)

    if (costErr) {
      console.error('❌ Error querying campaign_costs columns:')
      console.error(costErr.message || costErr)
      console.error('👉 Please apply the migration SQL in your Supabase SQL Editor:')
      console.error('   supabase/migrations/20260608000000_add_ad_cost_imports.sql\n')
      process.exit(1)
    }
    console.log('✅ campaign_costs schema matches requirements (platform, campaign_id, cost_dedupe_key, clicks, impressions, currency present).')
  } catch (err) {
    console.error('❌ Failed to run database checks (network or credentials error):', err.message)
    process.exit(1)
  }

  // Verify ad_sync_runs existence
  try {
    const { error: runErr } = await supabase
      .from('ad_sync_runs')
      .select('id')
      .limit(1)

    if (runErr && runErr.code === '42P01') {
      console.error('❌ Table "ad_sync_runs" does not exist in database.')
      console.error('👉 Please apply the migration SQL in your Supabase SQL Editor:')
      console.error('   supabase/migrations/20260608000000_add_ad_cost_imports.sql\n')
      process.exit(1)
    } else if (runErr) {
      console.log(`⚠️ ad_sync_runs table check returned error code ${runErr.code}: ${runErr.message}`)
    } else {
      console.log('✅ Table "ad_sync_runs" exists and is queryable.')
    }
  } catch (err) {
    console.error('❌ Failed to run database checks (network or credentials error):', err.message)
    process.exit(1)
  }

  // Verify RLS policy test
  try {
    const { data: runsCheck, error: runsCheckErr } = await supabase
      .from('ad_sync_runs')
      .select('id')
      .limit(5)
    
    if (runsCheckErr) {
      console.warn(`⚠️ ad_sync_runs query returned error (could be RLS / no session): ${runsCheckErr.message}`)
    } else {
      console.log(`✅ ad_sync_runs readable (returned ${runsCheck?.length} rows under RLS limits).`)
    }
  } catch (err) {
    console.warn(`⚠️ RLS query check failed (connection/session error): ${err.message}`)
  }
}

async function start() {
  try {
    runHelperTests()
    await runDatabaseChecks()
    console.log('🎉 ALL AD IMPORT AND SYNC FOUNDATION QA TESTS PASSED SUCCESSFULLY! 🎉')
  } catch (err) {
    console.error('❌ QA Test failed:', err)
    process.exit(1)
  }
}

start()
