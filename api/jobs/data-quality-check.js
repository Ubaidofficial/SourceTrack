import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { queryHogQL } from '../lib/posthog.js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

async function run() {
  console.log('[data-quality-check] Starting...')
  const issues = []

  // 1. Check for sites with no events in last 48h
  const { data: sites } = await supabase.from('sites').select('id, domain, site_key')
  for (const site of sites || []) {
    const sql = `
      SELECT count() AS cnt FROM events
      WHERE properties.site_id = '${site.id}'
        AND timestamp >= now() - INTERVAL 48 HOUR
    `
    const result = await queryHogQL(sql)
    const cnt = Number(result?.results?.[0]?.[0] ?? 0)
    if (cnt === 0) issues.push(`No events in 48h: ${site.domain} (${site.site_key})`)
  }

  // 2. Check for attributed_conversions with null first_touch_source
  const { count: nullCount } = await supabase
    .from('attributed_conversions')
    .select('*', { count: 'exact', head: true })
    .is('first_touch_source', null)
  if (nullCount > 0) issues.push(`${nullCount} attributed_conversions with null first_touch_source`)

  // Log to job_runs
  await supabase.from('job_runs').insert({
    job_name: 'data-quality-check',
    status: issues.length === 0 ? 'success' : 'warning',
    details: issues.length === 0 ? 'All checks passed' : issues.join(' | '),
    ran_at: new Date().toISOString()
  })

  console.log(`[data-quality-check] Done. Issues: ${issues.length}`)
  if (issues.length) issues.forEach(i => console.warn(' -', i))
  process.exit(0)
}

run().catch(err => {
  console.error('[data-quality-check] Fatal:', err)
  process.exit(1)
})
