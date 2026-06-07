import dotenv from 'dotenv'
dotenv.config()

import { getSupabase } from '../api/lib/supabase.js'

console.log('==================================================')
console.log('         Database Schema Readiness Check')
console.log('==================================================\n')

async function run() {
  const supabase = getSupabase()

  console.log('1. Checking sites.attribution_window_days column...')
  const { data: siteData, error: siteErr } = await supabase
    .from('sites')
    .select('attribution_window_days')
    .limit(1)

  if (siteErr) {
    console.error('❌ Error querying sites.attribution_window_days:')
    console.error(siteErr.message || siteErr)
    console.error('This suggests migration 20260519000005 has not run on the database.\n')
    process.exit(1)
  }
  console.log('✅ sites.attribution_window_days column exists.\n')

  console.log('2. Checking attributed_conversions.custom_properties column...')
  const { data: convData, error: convErr } = await supabase
    .from('attributed_conversions')
    .select('custom_properties')
    .limit(1)

  if (convErr) {
    console.error('❌ Error querying attributed_conversions.custom_properties:')
    console.error(convErr.message || convErr)
    console.error('This suggests migration 20260519000005 has not run on the database.\n')
    process.exit(1)
  }
  console.log('✅ attributed_conversions.custom_properties column exists.\n')

  console.log('3. Checking saved_reports dashboard widget columns...')
  const { data: reportData, error: reportErr } = await supabase
    .from('saved_reports')
    .select('show_on_dashboard, dashboard_position, dashboard_size')
    .limit(1)

  if (reportErr) {
    console.error('❌ Error querying saved_reports dashboard columns:')
    console.error(reportErr.message || reportErr)
    console.error('👉 Please apply the migration SQL in your Supabase SQL Editor:');
    console.error('   supabase/migrations/20260607133300_add_dashboard_fields_to_saved_reports.sql\n');
    process.exit(1)
  }
  console.log('✅ saved_reports dashboard columns exist.\n')

  console.log('🎉 SCHEMA READINESS CHECK PASSED.')
  process.exit(0)
}

run().catch(err => {
  console.error('Unexpected check error:', err)
  process.exit(1)
})
