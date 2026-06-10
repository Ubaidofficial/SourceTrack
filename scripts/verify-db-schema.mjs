import dotenv from 'dotenv'
dotenv.config()

import { verifySafeEnvironment } from './qa-guard.js'
verifySafeEnvironment()

import { getSupabase } from '../api/lib/supabase.js'

async function check() {
  const supabase = getSupabase()
  console.log('Checking GSC tables existence via Supabase Client...')

  const tables = ['gsc_connections', 'gsc_performance_daily', 'gsc_sync_runs']
  for (const table of tables) {
    const { error } = await supabase.from(table).select('*').limit(1)
    if (error) {
      if (error.code === '42P01') {
        console.log(`❌ Table "${table}" DOES NOT EXIST in the database (Migration not applied yet).`)
      } else {
        console.log(`⚠️ Table "${table}" returned error code ${error.code}: ${error.message}`)
      }
    } else {
      console.log(`✅ Table "${table}" EXISTS in the database.`)
    }
  }
}

check().catch(err => {
  console.error('Failed to run schema verification:', err)
})
