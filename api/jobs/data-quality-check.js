import dotenv from 'dotenv'
dotenv.config()
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
const SLACK = process.env.SLACK_WEBHOOK_URL

async function slackAlert(issues) {
  if (!SLACK) return console.error('[QUALITY] Issues found:', issues.join(' | '))
  await fetch(SLACK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `⚠️ *SourceTrack Data Quality*\n${issues.map(i => `• ${i}`).join('\n')}` })
  })
}

async function run() {
  const issues = []
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)

  const { count: zeroCount, error: e1 } = await supabase
    .from('attributed_conversions')
    .select('*', { count: 'exact', head: true })
    .eq('touchpoint_count', 0)
    .gte('conversion_date', yesterday)
  if (!e1 && zeroCount > 0) issues.push(`${zeroCount} conversions with 0 touchpoints yesterday`)

  const { data: lastRun } = await supabase
    .from('job_runs')
    .select('ran_at, status, conversions_processed')
    .eq('job_name', 'nightly-attribution')
    .order('ran_at', { ascending: false })
    .limit(1)
    .single()

  if (!lastRun) {
    issues.push('CRITICAL: No batch job runs found in job_runs table')
  } else {
    const hoursAgo = (Date.now() - new Date(lastRun.ran_at).getTime()) / 3_600_000
    if (hoursAgo > 26) issues.push(`Batch job not run in ${Math.round(hoursAgo)}h — last ran: ${lastRun.ran_at}`)
    if (lastRun.status === 'failed') issues.push('Last batch job FAILED')
    if (lastRun.status === 'success' && lastRun.conversions_processed === 0) issues.push('Batch ran but processed 0 conversions')
  }

  const { data: bigOnes } = await supabase
    .from('attributed_conversions')
    .select('id, conversion_value')
    .gt('conversion_value', 50000)
    .gte('conversion_date', yesterday)
  if (bigOnes?.length > 0) issues.push(`${bigOnes.length} conversions > $50k — verify not test data`)

  if (issues.length > 0) {
    await slackAlert(issues)
    process.exit(1)
  }

  console.log(`[QUALITY] All checks passed for ${yesterday}`)
}

run().catch(e => { console.error('[QUALITY] Fatal:', e.message); process.exit(1) })
