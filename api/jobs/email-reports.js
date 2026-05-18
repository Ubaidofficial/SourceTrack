import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import dotenv from 'dotenv'
dotenv.config()

const isMonthly = process.argv.includes('--monthly')
const periodLabel = isMonthly ? 'Monthly' : 'Weekly'
const days = isMonthly ? 30 : 7
const jobName = isMonthly ? 'email-reports-monthly' : 'email-reports-weekly'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { realtime: { transport: WebSocket } }
  )
}

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

async function run() {
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
      const isActive = site.plan !== 'trial' ||
        (site.trial_ends_at && new Date(site.trial_ends_at) > new Date())

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

      const { data: conversions } = await supabase
        .from('attributed_conversions')
        .select('channel, conversion_value, first_touch_source, ai_source')
        .eq('site_id', site.id)
        .gte('conversion_date', from)
        .lte('conversion_date', to)

      const { data: prevConversions } = await supabase
        .from('attributed_conversions')
        .select('conversion_value')
        .eq('site_id', site.id)
        .gte('conversion_date', prev.from)
        .lte('conversion_date', prev.to)

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
        const ai = r.ai_source || r.first_touch_source
        if (ai && ['ChatGPT', 'Claude', 'Perplexity', 'Gemini', 'Grok', 'Copilot', 'DeepSeek', 'You.com', 'Phind', 'Kagi', 'Mistral', 'Meta AI', 'Poe'].includes(ai)) {
          aiMap[ai] = (aiMap[ai] || 0) + 1
        }
      }
      const sortedAI = Object.entries(aiMap).sort((a, b) => b[1] - a[1])
      const topAI = sortedAI[0]?.[0] || null
      const totalAILeads = sortedAI.reduce((s, [, cnt]) => s + cnt, 0)

      const domain = site.domain || 'your site'

      const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
        <tr>
          <td style="padding:32px 40px;border-bottom:1px solid #e5e7eb">
            <h2 style="margin:0;font-size:20px;color:#111827">Your ${periodLabel} Attribution Report</h2>
            <p style="margin:4px 0 0;font-size:13px;color:#6b7280">${domain} · ${from} to ${to}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 40px">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="25%" style="padding:0 8px 16px 0;vertical-align:top">
                  <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Total Revenue</p>
                  <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#111827">${formatCurrency(totalRevenue)}</p>
                </td>
                <td width="25%" style="padding:0 8px 16px 0;vertical-align:top">
                  <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Conversions</p>
                  <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#111827">${totalConversions}</p>
                </td>
                <td width="25%" style="padding:0 8px 16px 0;vertical-align:top">
                  <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Top Channel</p>
                  <p style="margin:4px 0 0;font-size:22px;font-weight:700;color:#111827">${topChannel}</p>
                </td>
                <td width="25%" style="padding:0 0 16px 0;vertical-align:top">
                  <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">vs Last ${periodLabel}</p>
                  <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#111827">
                    <span style="color:#374151">Rev:</span> ${pctChange(totalRevenue, prevRevenue)}<br/>
                    <span style="color:#374151">Conv:</span> ${pctChange(totalConversions, prevConvCount)}
                  </p>
                </td>
              </tr>
            </table>
            ${totalAILeads > 0 && topAI ? `
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px">
              <tr>
                <td style="padding:12px 16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
                  <p style="margin:0;font-size:13px;color:#166534">
                    🤖 <strong>${totalAILeads}</strong> lead${totalAILeads === 1 ? '' : 's'} from <strong>${topAI}</strong>${sortedAI.length > 1 ? ' and ' + (sortedAI.length - 1) + ' other AI platform' + (sortedAI.length - 1 === 1 ? '' : 's') : ''} this ${isMonthly ? 'month' : 'week'}
                  </p>
                </td>
              </tr>
            </table>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px 28px;text-align:center">
            <a href="https://app.sourcetrack.ai/dashboard" style="display:inline-block;padding:12px 32px;background:#111827;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px">View Full Dashboard</a>
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

  await getSupabase().from('job_runs').insert({
    job_name: jobName,
    status: errors > 0 ? 'warning' : 'success',
    details: `Sent ${sent}, skipped ${skipped}, errors ${errors}`,
    ran_at: now
  })

  console.log(`\n[email-reports] Done. Sent ${sent}, skipped ${skipped}, errors ${errors}`)
  process.exit(0)
}

run().catch(err => {
  console.error('[email-reports] Fatal:', err)
  process.exit(1)
})
