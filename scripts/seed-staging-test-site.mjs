import 'dotenv/config'

const dbUrl = process.env.SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_KEY || ''

const STAGING_REF = 'nrsvpwzekfrdrzkoecfk'
const PROD_REF = 'zxjjjsipafojhzkkumvh'

// 1. Refuse to run unless URL includes staging ref
if (!dbUrl.includes(STAGING_REF)) {
  console.error(`❌ ERROR: SUPABASE_URL must target the staging project reference: ${STAGING_REF}`)
  process.exit(1)
}

// 2. Refuse to run if URL includes production ref
if (dbUrl.includes(PROD_REF)) {
  console.error(`❌ ERROR: Refusing to run: SUPABASE_URL targets the PRODUCTION database reference: ${PROD_REF}`)
  process.exit(1)
}

// 3. Require SUPABASE_SERVICE_KEY
if (!serviceKey) {
  console.error('❌ ERROR: SUPABASE_SERVICE_KEY environment variable is required')
  process.exit(1)
}

// 4. Refuse placeholder service keys
const isPlaceholderKey =
  serviceKey === 'sb_secret_staging_placeholder_replace_me' ||
  serviceKey === 'mock-service-role-key-value' ||
  serviceKey.includes('placeholder') ||
  serviceKey.length < 50

if (isPlaceholderKey) {
  console.log('--------------------------------------------------------------------------------')
  console.log('ℹ️ DRY RUN / BLOCKED STAGING SEED RUN')
  console.log('--------------------------------------------------------------------------------')
  console.log('Staging test-site seed tooling is implemented and locally dry-run/safety verified;')
  console.log('actual staging seed execution and Stripe E2E remain blocked pending staging service-role credentials.')
  console.log('\nTo run the actual seed script, you must replace the placeholder key in your .env file with a valid staging service-role key.')
  console.log('--------------------------------------------------------------------------------')
  process.exit(0)
}

const STABLE_TEST_SITE_KEY = 'c0ffee11-babe-41d4-a716-446655440000'

console.log('==================================================')
console.log('      Staging Test Site Seed Tooling')
console.log('==================================================\n')
console.log(`Target database URL: ${dbUrl}`)
console.log(`Stable Test Site Key: ${STABLE_TEST_SITE_KEY}`)

const dryRunPlan = `
Dry-Run Plan:
1. Query the 'sites' table for site_key = '${STABLE_TEST_SITE_KEY}'
2. If the site does not exist, insert:
   - site_key: '${STABLE_TEST_SITE_KEY}'
   - name: 'SourceTrack Stripe QA Seed'
   - domain: 'qa-stripe-test.local'
   - plan: 'growth'
   - pv_limit: 100000
   - encrypted_stripe_webhook_secret: null
3. If the site exists but has incorrect fields, update it.
`

console.log(dryRunPlan)

const allowMutation = process.env.ALLOW_STAGING_SEED_MUTATION === 'true'

if (!allowMutation) {
  console.log('⚠️ ALLOW_STAGING_SEED_MUTATION is not set to "true". Skipping database write (DRY RUN ONLY).')
  console.log('To execute the seed writes, run with ALLOW_STAGING_SEED_MUTATION=true.')
  process.exit(0)
}

// Proceed with actual mutation using getSupabase()
import { getSupabase } from '../api/lib/supabase.js'
const supabase = getSupabase()

try {
  console.log('Checking if staging test site already exists...')
  const { data: existingSite, error: queryError } = await supabase
    .from('sites')
    .select('*')
    .eq('site_key', STABLE_TEST_SITE_KEY)
    .maybeSingle()

  if (queryError) {
    console.error('❌ Database query failed. Schema check failed.')
    console.error('Error Details:', queryError.message)
    process.exit(1)
  }

  const newSite = {
    site_key: STABLE_TEST_SITE_KEY,
    name: 'SourceTrack Stripe QA Seed',
    domain: 'qa-stripe-test.local',
    plan: 'growth',
    pv_limit: 100000,
    encrypted_stripe_webhook_secret: null
  }

  if (existingSite) {
    console.log(`Site exists: id=${existingSite.id}, site_key=${existingSite.site_key}, plan=${existingSite.plan}`)
    // Check if fields match
    const needsUpdate =
      existingSite.name !== newSite.name ||
      existingSite.domain !== newSite.domain ||
      existingSite.plan !== newSite.plan ||
      existingSite.pv_limit !== newSite.pv_limit

    if (needsUpdate) {
      console.log('Fields mismatch, updating site...')
      const { error: updateError } = await supabase
        .from('sites')
        .update({
          name: newSite.name,
          domain: newSite.domain,
          plan: newSite.plan,
          pv_limit: newSite.pv_limit
        })
        .eq('site_key', STABLE_TEST_SITE_KEY)

      if (updateError) {
        console.error('❌ Failed to update staging test site:', updateError.message)
        process.exit(1)
      }
      console.log('✅ Staging test site updated successfully!')
    } else {
      console.log('✅ Staging test site is already seeded and up-to-date.')
    }
  } else {
    console.log('Site does not exist. Inserting new staging test site...')
    const { data: insertedData, error: insertError } = await supabase
      .from('sites')
      .insert([newSite])
      .select()

    if (insertError) {
      console.error('❌ Failed to insert staging test site.')
      console.error('Error Details:', insertError.message)
      // Check if columns differ
      if (insertError.code === '42703') {
        console.error('\n🔍 SCHEMA MISMATCH ERROR: One or more fields do not exist in the database schema.')
        console.error('Please verify the schema definition for the sites table in your migrations.')
      }
      process.exit(1)
    }
    console.log('✅ Staging test site inserted successfully!', insertedData)
  }

} catch (err) {
  console.error('❌ Unexpected exception:', err.message)
  process.exit(1)
}
