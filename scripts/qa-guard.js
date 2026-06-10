import 'dotenv/config'

export function verifySafeEnvironment() {
  const dbUrl = process.env.SUPABASE_URL || ''
  
  // Production Supabase project reference
  const prodProjectRef = 'zxjjjsipafojhzkkumvh'
  const isProdDb = dbUrl.includes(prodProjectRef)
  
  const isProductionNode = process.env.NODE_ENV === 'production'
  const isProductionApp = process.env.APP_ENV === 'production'
  const isProductionRailway = process.env.RAILWAY_ENVIRONMENT === 'production'

  const triggers = []
  if (isProdDb) triggers.push(`SUPABASE_URL contains production project reference (${prodProjectRef})`)
  if (isProductionNode) triggers.push("NODE_ENV is 'production'")
  if (isProductionApp) triggers.push("APP_ENV is 'production'")
  if (isProductionRailway) triggers.push("RAILWAY_ENVIRONMENT is 'production'")

  if (triggers.length > 0) {
    if (process.env.ALLOW_PRODUCTION_QA_MUTATION !== 'true') {
      console.error('\n================================================================================')
      console.error(`❌ FATAL: QA scripts are NOT allowed to run against the PRODUCTION database/env!`)
      console.error('--------------------------------------------------------------------------------')
      console.error('Triggered by:')
      triggers.forEach(t => console.error(`  - ${t}`))
      console.error('\nRISK WARNING:')
      console.error('Running QA scripts against a production environment will mutate customer data,')
      console.error('pollute attribution analytics, write artificial database records, and corrupt live metrics.')
      console.error('\nOVERRIDE:')
      console.error('If you absolutely must run this script against production, you must set:')
      console.error('  ALLOW_PRODUCTION_QA_MUTATION=true')
      console.error('================================================================================\n')
      process.exit(1)
    } else {
      console.warn('\n⚠️ WARNING: ALLOW_PRODUCTION_QA_MUTATION is enabled. Running mutating QA script against PRODUCTION database/env.')
      console.warn('Triggers detected:')
      triggers.forEach(t => console.warn(`  - ${t}`))
      console.warn('Proceeding with execution...\n')
    }
  }
}
