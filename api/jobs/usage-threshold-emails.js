// Daily job. For each site, computes current-month pageview count vs pv_limit
// and sends one email per crossing of 50% / 80% / 100% thresholds. Idempotent
// per (site, month, threshold) via the usage_email_log table.
//
// Schedule: daily at ~14:00 UTC. Runs cheap (single Supabase RPC per site +
// one Resend POST per threshold crossed).

import dotenv from 'dotenv'
dotenv.config()
import { getSupabase } from '../lib/supabase.js'
import { normalizePlan, getPvLimit } from '../lib/plan-features.js'

const THRESHOLDS = [50, 80, 100]
const RESEND_FROM = 'SourceTrack <usage@sourcetrack.ai>'

function currentMonth() {
  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function monthStartISO() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

function buildEmailHtml({ domain, threshold, used, limit, plan }) {
  const isAtCap = threshold === 100
  const headline = isAtCap
    ? `You've hit your monthly pageview limit`
    : `You're at ${threshold}% of your monthly pageview limit`
  const subhead = isAtCap
    ? `Tracking on ${domain} has paused until your limit resets next month — or you upgrade.`
    : `${domain} has used ${used.toLocaleString()} of ${limit.toLocaleString()} pageviews this month.`
  const dashboardUrl = (process.env.FRONTEND_URL || 'https://app.sourcetrack.ai').replace(/\/+$/, '')

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden">
  <tr><td style="padding:32px 40px;border-bottom:1px solid #e5e7eb">
    <h2 style="margin:0;font-size:20px;color:#111827">${headline}</h2>
    <p style="margin:8px 0 0;font-size:14px;color:#6b7280">${subhead}</p>
  </td></tr>
  <tr><td style="padding:24px 40px">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Used</td>
        <td style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;text-align:right">Limit</td>
      </tr>
      <tr>
        <td style="font-size:22px;font-weight:700;color:#111827;padding-top:4px">${used.toLocaleString()}</td>
        <td style="font-size:22px;font-weight:700;color:#111827;padding-top:4px;text-align:right">${limit.toLocaleString()}</td>
      </tr>
    </table>
    <div style="margin-top:14px;height:8px;background:#e5e7eb;border-radius:99px;overflow:hidden">
      <div style="height:100%;background:${isAtCap ? '#ef4444' : threshold >= 80 ? '#f59e0b' : '#84cc16'};width:${Math.min(100, threshold)}%"></div>
    </div>
    <p style="margin:18px 0 0;font-size:13px;color:#6b7280">Current plan: <strong style="color:#111827;text-transform:capitalize">${plan}</strong></p>
  </td></tr>
  <tr><td style="padding:8px 40px 28px;text-align:center">
    <a href="${dashboardUrl}/billing" style="display:inline-block;padding:12px 32px;background:#111827;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px">${isAtCap ? 'Upgrade now' : 'Upgrade your plan'}</a>
  </td></tr>
  <tr><td style="padding:14px 40px;background:#f9fafb;text-align:center">
    <p style="margin:0;font-size:11px;color:#9ca3af">SourceTrack usage alert · One email per threshold per month</p>
  </td></tr>
</table>
</td></tr></table></body></html>`
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[usage-threshold-emails] RESEND_API_KEY not set — would have emailed ${to}: ${subject}`)
    return { ok: true, skipped: true }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: RESEND_FROM, to: [to], subject, html })
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
  return { ok: true }
}

async function run() {
  const supabase = getSupabase()
  const month = currentMonth()

  // Only meter sites that have a finite pv_limit. Excludes archived/inactive
  // (limit=0) and any site with NULL pv_limit (treated as unlimited).
  const { data: sites } = await supabase
    .from('sites')
    .select('id, site_key, domain, name, owner_id, plan, pv_limit')
    .gt('pv_limit', 0)

  if (!sites?.length) {
    console.log('[usage-threshold-emails] No metered sites')
    process.exit(0)
  }

  let sent = 0
  let skipped = 0
  let errors = 0

  for (const site of sites) {
    try {
      const plan = normalizePlan(site.plan)
      if (plan === 'inactive' || plan === 'archived') { skipped++; continue }

      const limit = getPvLimit(plan, site.pv_limit)
      if (!limit || limit <= 0) { skipped++; continue }

      const { data: usageRow, error: countErr } = await supabase
        .from('site_usage_monthly')
        .select('pageview_count')
        .eq('site_id', site.id)
        .eq('month', month)
        .maybeSingle()
      if (countErr) {
        console.warn(`[usage-threshold-emails] count query failed for ${site.site_key}: ${countErr.message}`)
        skipped++
        continue
      }

      const used = usageRow?.pageview_count || 0
      const usagePct = (used / limit) * 100

      // Highest crossed threshold for this site
      const crossed = THRESHOLDS.filter(t => usagePct >= t)
      if (!crossed.length) { skipped++; continue }

      for (const threshold of crossed) {
        // Skip if we already sent this threshold this month (idempotency)
        const { data: existing } = await supabase
          .from('usage_email_log')
          .select('id')
          .eq('site_id', site.id)
          .eq('month', month)
          .eq('threshold', threshold)
          .maybeSingle()
        if (existing) continue

        // Get owner email
        const { data: userRec } = await supabase.auth.admin.getUserById(site.owner_id)
        const ownerEmail = userRec?.user?.email
        if (!ownerEmail) { skipped++; continue }

        const html = buildEmailHtml({
          domain: site.domain || site.name || 'your site',
          threshold,
          used,
          limit,
          plan
        })
        const subject = threshold === 100
          ? `[Action required] You hit your SourceTrack pageview limit`
          : `You're at ${threshold}% of your SourceTrack pageview limit`

        await sendEmail({ to: ownerEmail, subject, html })

        // Record sent so we don't repeat within the month
        await supabase.from('usage_email_log').insert({
          site_id: site.id, month, threshold
        })

        console.log(`[usage-threshold-emails] Sent ${threshold}% alert to ${ownerEmail} (${site.site_key})`)
        sent++
      }
    } catch (err) {
      console.error(`[usage-threshold-emails] Error for ${site.site_key}: ${err.message}`)
      errors++
    }
  }

  await supabase.from('job_runs').insert({
    job_name: 'usage-threshold-emails',
    status: errors > 0 ? 'warning' : 'success',
    details: `Sent ${sent}, skipped ${skipped}, errors ${errors}`,
    ran_at: new Date().toISOString()
  })

  console.log(`[usage-threshold-emails] Done. Sent ${sent}, skipped ${skipped}, errors ${errors}`)
  process.exit(0)
}

run().catch(err => {
  console.error('[usage-threshold-emails] Fatal:', err)
  process.exit(1)
})
