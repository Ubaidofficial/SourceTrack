/**
 * Environment Safety Guard
 *
 * Prevents non-production instances of the API server from connecting to the
 * production Supabase database.
 */

export function enforceEnvironmentSafety() {
  const nodeEnv = process.env.NODE_ENV
  const dbUrl = process.env.SUPABASE_URL || ''

  // Production Supabase project reference
  const prodProjectRef = 'zxjjjsipafojhzkkumvh'

  // If NODE_ENV is production, allow production Supabase database.
  if (nodeEnv === 'production') {
    return
  }

  // Non-production modes (development, test, undefined, etc.)
  if (dbUrl.includes(prodProjectRef)) {
    if (process.env.ALLOW_PRODUCTION_SUPABASE_IN_NON_PROD === 'true') {
      console.warn('\n================================================================================')
      console.warn('⚠️ WARNING: ALLOW_PRODUCTION_SUPABASE_IN_NON_PROD is enabled.')
      console.warn(`Connecting non-production API to PRODUCTION Supabase project: ${prodProjectRef}`)
      console.warn('================================================================================\n')
      return
    }

    console.error('\n================================================================================')
    console.error('❌ FATAL ERROR: Environment safety guard triggered!')
    console.error(`Refusing to start non-production API with production Supabase project ref ${prodProjectRef}. Point local/staging env to staging project nrsvpwzekfrdrzkoecfk.`)
    console.error('================================================================================\n')
    process.exit(1)
  }
}
