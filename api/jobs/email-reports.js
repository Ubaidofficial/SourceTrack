import 'dotenv/config'
import WebSocket from 'ws'
import { getSupabase } from '../lib/supabase.js'
import { writeJobRun } from '../lib/job-runs.js'
const isMonthly = process.argv.includes('--monthly')
const periodLabel = isMonthly ? 'Monthly' : 'Weekly'
const days = isMonthly ? 30 : 7
const jobName = isMonthly ? 'email-reports-monthly' : 'email-reports-weekly'

function dateRange() {
  const end = new Date()
  const start = new Date(end.getTime() - days * 86400000)
  return {
    to: end.toISOString().slice(0, 10),
    from: start.toISOString().slice(0, 10)
  }
}

function prevDateRange() {
  const end = new Date(Date.now() - days * 86400000)
  const start = new Date(end.getTime() - days * 86400000)
  return {
    to: end.toISOString().slice(0, 10),
    from: start.toISOString().slice(0, 10)
  }
}

function formatCurrency(n) {
  return '$' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function pctChange(current, previous) {
  if (!previous || previous === 0) return '—'
  const pct = ((current - previous) / previous) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

export async function run() {
  const supabase = getSupabase()
  const { from, to } = dateRange()
  const prev = prevDateRange()
  const now = new Date().toISOString()

  let sent = 0
  let skipped = 0
  let errors = 0

  const { data: sites } = await supabase
    .from('sites')
    .select('id, site_key, domain, name, owner_id, plan, trial_ends_at')

  if (!sites?.length) {
    console.log('[email-reports] No sites found')
    return
  }

  for (const site of sites) {
    try {
      // Conservative eligibility:
      // - Free, inactive, and archived sites must not receive scheduled reports.
      // - Explicitly allow only active trials and known paid tiers.
      const isPaidPlan = ['starter', 'growth', 'scale', 'business'].includes(site.plan)
      const isActiveTrial = site.plan === 'trial' && site.trial_ends_at && new Date(site.trial_ends_at) > new Date()
      const isActive = isPaidPlan || isActiveTrial

      if (!isActive) {
        console.log(`[email-reports] Skipping ${site.site_key}: trial expired or inactive`)
        skipped++
        continue
      }

      const { data: owner } = await supabase
        .from('company_members')
        .select('user_id')
        .eq('company_id', site.id)
        .maybeSingle()

      const userId = owner?.user_id || site.owner_id
      if (!userId) {
        console.log(`[email-reports] Skipping ${site.site_key}: no owner`)
        skipped++
        continue
      }

      const { data: userRec } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .maybeSingle()

      const ownerEmail = userRec?.email
      if (!ownerEmail) {
        console.log(`[email-reports] Skipping ${site.site_key}: no owner email`)
        skipped++
        continue
      }

      const { data: conversions, error: convError } = await supabase
        .from('attributed_conversions')
        .select('channel, conversion_value, first_touch_source, ai_influenced_source')
        .eq('site_id', site.id)
        .gte('conversion_date', from)
        .lte('conversion_date', to)

      const { data: prevConversions, error: prevConvError } = await supabase
        .from('attributed_conversions')
        .select('conversion_value')
        .eq('site_id', site.id)
        .gte('conversion_date', prev.from)
        .lte('conversion_date', prev.to)

      if (convError || prevConvError) {
        console.error(`[email-reports] Skipping ${site.site_key}: conversions read failed (${(convError || prevConvError).message})`)
        skipped++
        continue
      }

      const rows = conversions || []
      const prevRows = prevConversions || []

      const totalRevenue = rows.reduce((s, r) => s + (parseFloat(r.conversion_value) || 0), 0)
      const totalConversions = rows.length
      const prevRevenue = prevRows.reduce((s, r) => s + (parseFloat(r.conversion_value) || 0), 0)
      const prevConvCount = prevRows.length

      const channelMap = {}
      for (const r of rows) {
        const ch = r.channel || 'Direct'
        channelMap[ch] = (channelMap[ch] || 0) + (parseFloat(r.conversion_value) || 0)
      }
      const sortedChannels = Object.entries(channelMap).sort((a, b) => b[1] - a[1])
      const topChannel = sortedChannels[0]?.[0] || 'Direct'

      const aiMap = {}
      for (const r of rows) {
        const ai = r.ai_influenced_source || r.first_touch_source
        if (ai && ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok', 'Copilot', 'DeepSeek', 'You.com', 'Phind', 'Kagi', 'Mistral', 'Meta AI', 'Poe'].includes(ai)) {
          aiMap[ai] = (aiMap[ai] || 0) + 1
        }
      }
      const sortedAI = Object.entries(aiMap).sort((a, b) => b[1] - a[1])
      const topAI = sortedAI[0]?.[0] || null
      const totalAILeads = sortedAI.reduce((s, [, cnt]) => s + cnt, 0)
      const domain = site.domain || 'your site'
      const dashboardUrl = (process.env.FRONTEND_URL || 'https://app.sourcetrack.ai').replace(/\/+$/, '')

      const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0">
  <tr>
    <td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
        <tr>
          <td style="padding:32px 40px;border-bottom:1px solid #e5e7eb;text-align:center">
            <h1 style="margin:0;font-size:20px;font-weight:700;color:#111827">SourceTrack</h1>
            <p style="margin:4px 0 0;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">${periodLabel} Attribution Digest</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px">
            <p style="margin:0 0 16px;font-size:14px;color:#374151">
              Here is how <strong>${domain}</strong> performed over the last ${days} days:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">
              <tr>
                <td style="padding:16px;width:50%;border-right:1px solid #e5e7eb">
                  <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Attributed Revenue</span>
                  <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#111827">${formatCurrency(totalRevenue)}</p>
                </td>
                <td style="padding:16px;width:50%">
                  <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Attributed Conversions</span>
                  <p style="margin:4px 0 0;font-size:20px;font-weight:700;color:#111827">${totalConversions.toLocaleString()}</p>
                </td>
              </tr>
            </table>

            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px">
              <tr>
                <td style="padding:12px 0;border-bottom:1px solid #f3f4f6">
                  <p style="margin:0;font-size:13px;color:#6b7280">Top Channel</p>
                </td>
                <td style="padding:12px 0;border-bottom:1px solid #f3f4f6;text-align:right">
                  <p style="margin:0;font-size:13px;font-weight:600;color:#111827">${topChannel}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 0">
                  <p style="margin:0;font-size:13px;color:#6b7280">Performance vs Prior Period</p>
                </td>
                <td style="padding:12px 0;text-align:right">
                  <p style="margin:0;font-size:13px;font-weight:600;color:#111827">
                    <span style="color:#374151">Rev:</span> ${pctChange(totalRevenue, prevRevenue)}<br/>
                    <span style="color:#374151">Conv:</span> ${pctChange(totalConversions, prevConvCount)}
                  </p>
                </td>
              </tr>
            ${totalAILeads > 0 && topAI ? `
              <tr>
                <td colspan="2" style="padding:12px 16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
                  <p style="margin:0;font-size:13px;color:#166534">
                    🤖 <strong>${totalAILeads}</strong> lead${totalAILeads === 1 ? '' : 's'} from <strong>${topAI}</strong>${sortedAI.length > 1 ? ' and ' + (sortedAI.length - 1) + ' other AI platform' + (sortedAI.length - 1 === 1 ? '' : 's') : ''} this ${isMonthly ? 'month' : 'week'}
                  </p>
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 28px;text-align:center">
            <a href="${dashboardUrl}/dashboard" style="display:inline-block;padding:12px 32px;background:#111827;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px">View Full Dashboard</a>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 40px;background:#f9fafb;text-align:center">
            <p style="margin:0;font-size:11px;color:#9ca3af">SourceTrack · <a href="mailto:hello@sourcetrack.ai?subject=Unsubscribe" style="color:#9ca3af">Unsubscribe</a></p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'SourceTrack <reports@sourcetrack.ai>',
          to: [ownerEmail],
          subject: `Your ${periodLabel.toLowerCase()} attribution report — ${domain}`,
          html
        })
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Resend API error (${res.status}): ${errText}`)
      }

      console.log(`[email-reports] Sent to ${ownerEmail} (${site.site_key})`)
      sent++
    } catch (e) {
      console.error(`[email-reports] Error for ${site.site_key}:`, e.message)
      errors++
    }
  }

  // job_runs row — summary goes in error_message (the only free-text column;
  // there is no `details` column). writeJobRun rejects unknown columns and logs
  // a failed insert loudly instead of swallowing it.
  await writeJobRun(getSupabase(), {
    job_name: jobName,
    status: errors > 0 ? 'warning' : 'success',
    error_message: `Sent ${sent}, skipped ${skipped}, errors ${errors}`,
    ran_at: now
  })

  console.log(`\n[email-reports] Done. Sent ${sent}, skipped ${skipped}, errors ${errors}`)
  process.exit(0)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(err => {
    console.error('[email-reports] Fatal:', err)
    process.exit(1)
  })
}
