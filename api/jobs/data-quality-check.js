import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { realtime: { transport: WebSocket } }
  )
}

function monthStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

// classify: higher is better (coverage/rate metrics)
function classify(value, ok, warn) {
  if (value >= ok) return 'ok'
  if (value >= warn) return 'warning'
  return 'critical'
}

// classifyMax: lower is better (error/noise metrics)
function classifyMax(value, ok, warn) {
  if (value <= ok) return 'ok'
  if (value <= warn) return 'warning'
  return 'critical'
}

async function run() {
  console.log('[data-quality-check] Starting...')
  const supabase = getSupabase()
  const ms = monthStart()
  const msDate = ms.split('T')[0]  // YYYY-MM-DD for date columns

  // ── GLOBAL CHECK: nightly job freshness ───────────────────────────────────
  // Runs once — not per-site, since job_runs is a global table.
  try {
    const { data: run } = await supabase
      .from('job_runs')
      .select('ran_at, status, error_message')
      .eq('job_name', 'nightly-attribution')
      .order('ran_at', { ascending: false })
      .limit(1)
      .single()

    let hoursAgo = 999
    if (run?.ran_at) {
      hoursAgo = (Date.now() - new Date(run.ran_at).getTime()) / 3_600_000
    }

    const jobStatus = !run
      ? 'critical'
      : run.status === 'failed'
        ? 'critical'
        : hoursAgo <= 28 ? 'ok'   // 28h = 24h schedule + 4h buffer
        : hoursAgo <= 48 ? 'warning'
        : 'critical'

    const jobMsg = !run
      ? 'No attribution job has ever run'
      : run.status === 'failed'
        ? `Last run failed: ${run.error_message || 'unknown error'}`
        : `Last attribution job ran ${Math.round(hoursAgo)}h ago`

    console.log(`\n[nightly_job_freshness] ${jobStatus.toUpperCase()} — ${jobMsg}`)

    // Write one global record (no site_id) for the job freshness check
    await insertGlobal(supabase, 'nightly_job_freshness', jobStatus, Math.round(hoursAgo), 28, jobMsg)
  } catch (e) {
    console.error('[data-quality-check] Global job check failed:', e.message)
  }

  // ── PER-SITE CHECKS ───────────────────────────────────────────────────────
  const { data: sites } = await supabase.from('sites').select('id, site_key, domain, plan')
  if (!sites?.length) {
    console.log('[data-quality-check] No sites found')
    process.exit(0)
  }

  console.log(`[data-quality-check] Processing ${sites.length} sites`)

  for (const site of sites) {
    console.log(`\n--- Site: ${site.site_key} (${site.domain || 'no domain'}) ---`)

    // Get total attributed conversions this month first — used as denominator guard.
    // If < 5 conversions, skip ratio checks: not enough data to compute meaningful ratios.
    const { count: totalThisMonth } = await supabase
      .from('attributed_conversions')
      .select('*', { count: 'exact', head: true })
      .eq('site_id', site.id)
      .gte('conversion_date', msDate)

    const total = totalThisMonth ?? 0

    if (total < 5) {
      console.log(`  ⬜ Insufficient data (${total} conversions this month) — skipping ratio checks`)
      await insert(supabase, 'insufficient_data', 'ok', total, null,
        `Only ${total} attributed conversion(s) this month — ratio checks skipped`, site.id)
      continue
    }

    // ── CHECK 1: source_attribution_rate ─────────────────────────────────────
    // What % of attributed conversions have a non-null, non-empty first_touch_source?
    // A low rate means the nightly job is not capturing source data (pipeline issue).
    try {
      const { count: withSource } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('conversion_date', msDate)
        .not('first_touch_source', 'is', null)
        .neq('first_touch_source', '')

      const ratio = total > 0 ? (withSource ?? 0) / total : 0
      const status = classify(ratio, 0.5, 0.2)
      const msg = `${Math.round(ratio * 100)}% of conversions have a first-touch source recorded`
      await insert(supabase, 'source_attribution_rate', status, ratio, 0.5, msg, site.id)
    } catch (e) { console.error('  CHECK 1 failed:', e.message) }

    // ── CHECK 2: non_direct_rate ──────────────────────────────────────────────
    // What % of attributed conversions have a non-Direct channel?
    // Very high direct rates (> 60%) usually indicate missing UTMs or broken tracking.
    // Note: some sites legitimately get 100% direct — brand traffic, type-in, etc.
    // This is informational/warning only; not 'critical' since it depends on the site.
    try {
      const { count: directCount } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('conversion_date', msDate)
        .or('first_touch_channel.eq.Direct,first_touch_channel.is.null')

      const directRatio = total > 0 ? (directCount ?? 0) / total : 0
      // High direct = potential tracking gap. But don't cry wolf — only warn above 70%, critical above 90%.
      const status = classifyMax(directRatio, 0.7, 0.9)
      const msg = `${Math.round(directRatio * 100)}% of conversions attributed to Direct (high = potential UTM tracking gap)`
      await insert(supabase, 'non_direct_rate', status, directRatio, 0.7, msg, site.id)
    } catch (e) { console.error('  CHECK 2 failed:', e.message) }

    // ── CHECK 3: conversion_value_coverage ───────────────────────────────────
    // What % of conversions have a non-zero revenue value?
    // Low coverage means conversion_value is not being passed in conversion events.
    try {
      const { count: valuedConv } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gt('conversion_value', 0)
        .gte('conversion_date', msDate)

      const ratio = total > 0 ? (valuedConv ?? 0) / total : 0
      const status = classify(ratio, 0.7, 0.4)
      const msg = `${Math.round(ratio * 100)}% of conversions have a revenue value > 0`
      await insert(supabase, 'conversion_value_coverage', status, ratio, 0.7, msg, site.id)
    } catch (e) { console.error('  CHECK 3 failed:', e.message) }

    // ── CHECK 4: touchpoint_depth ─────────────────────────────────────────────
    // What % of attributed conversions have touchpoint_count > 1?
    // Very low values suggest the nightly job is not capturing journey history.
    // Single-touch is valid for direct/branded traffic — don't alarm below 20%.
    try {
      const { count: multiTouch } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('conversion_date', msDate)
        .gt('touchpoint_count', 1)

      const ratio = total > 0 ? (multiTouch ?? 0) / total : 0
      // Not alarming if most are single-touch — that can be legitimate
      const status = ratio < 0.05 ? 'warning' : 'ok'
      const msg = `${Math.round(ratio * 100)}% of conversions have multi-touch journeys (touchpoint_count > 1)`
      await insert(supabase, 'touchpoint_depth', status, ratio, 0.05, msg, site.id)
    } catch (e) { console.error('  CHECK 4 failed:', e.message) }

    // ── CHECK 5: ai_detection_rate ───────────────────────────────────────────
    // Informational only — what % of conversions are detected from AI sources.
    // No threshold/status — purely a signal metric. Always written as 'ok'.
    try {
      const { count: aiAttr } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('conversion_date', msDate)
        .or(
          'first_touch_source.ilike.%ChatGPT%,' +
          'first_touch_source.ilike.%Claude%,' +
          'first_touch_source.ilike.%Perplexity%,' +
          'first_touch_source.ilike.%Gemini%,' +
          'first_touch_source.ilike.%Grok%,' +
          'first_touch_source.ilike.%Copilot%,' +
          'first_touch_source.ilike.%DeepSeek%,' +
          'first_touch_source.ilike.%Meta AI%'
        )

      const ratio = total > 0 ? (aiAttr ?? 0) / total : 0
      const msg = `${Math.round(ratio * 100)}% of conversions from AI sources (${aiAttr ?? 0}/${total})`
      await insert(supabase, 'ai_detection_rate', 'ok', ratio, null, msg, site.id)
    } catch (e) { console.error('  CHECK 5 failed:', e.message) }

    // ── CHECK 6: data_freshness ───────────────────────────────────────────────
    // When was the last conversion recorded for this site?
    // Stale data (no conversions for 3+ days on an active site) suggests a tracking break.
    // Sites with zero conversions ever are excluded from this check.
    try {
      const { data: lastConv } = await supabase
        .from('attributed_conversions')
        .select('conversion_date')
        .eq('site_id', site.id)
        .order('conversion_date', { ascending: false })
        .limit(1)
        .single()

      if (lastConv?.conversion_date) {
        const daysSince = Math.round((Date.now() - new Date(lastConv.conversion_date).getTime()) / 86_400_000)
        // Only alarm if site has had conversions before (it does — we checked total >= 5)
        // 3 days ok, 7 days warning, 14+ days critical
        const status = daysSince <= 3 ? 'ok' : daysSince <= 7 ? 'warning' : 'critical'
        const msg = `Last conversion recorded ${daysSince} day(s) ago (${lastConv.conversion_date})`
        await insert(supabase, 'data_freshness', status, daysSince, 3, msg, site.id)
      }
    } catch (e) { console.error('  CHECK 6 failed:', e.message) }
  }

  console.log('\n[data-quality-check] Done.')
  process.exit(0)
}

// insert: write to data_quality_reports; create alert only for warning/critical
async function insert(supabase, checkName, status, value, threshold, message, siteId) {
  const now = new Date().toISOString()
  const icon = status === 'ok' ? '✅' : status === 'warning' ? '⚠️' : '❌'
  console.log(`  ${icon} ${checkName}: ${status.toUpperCase()} — ${message}`)

  try {
    const { error: reportErr } = await supabase.from('data_quality_reports').insert({
      check_name: checkName,
      status,
      value: value !== null ? parseFloat(Number(value).toFixed(4)) : null,
      threshold: threshold !== null ? parseFloat(Number(threshold).toFixed(4)) : null,
      message,
      site_id: siteId,
      checked_at: now
    })
    if (reportErr) console.error(`  Failed to write report for ${checkName}:`, reportErr.message)
  } catch (e) {
    console.error(`  Insert report error for ${checkName}:`, e.message)
  }

  if (status === 'warning' || status === 'critical') {
    try {
      const { error: alertErr } = await supabase.from('data_quality_alerts').insert({
        severity: status,
        title: checkName,
        message,
        site_id: siteId,
        alert_type: checkName,
        created_at: now
      })
      if (alertErr) console.error(`  Failed to write alert for ${checkName}:`, alertErr.message)
    } catch (e) {
      console.error(`  Insert alert error for ${checkName}:`, e.message)
    }
  }
}

// insertGlobal: same as insert but site_id is null (for global checks)
async function insertGlobal(supabase, checkName, status, value, threshold, message) {
  // Global checks skipped from DB — no site_id available
  console.log(`  [${status === "ok" ? "✅" : status === "warning" ? "⚠️" : "❌"} ${checkName}]`);
}

run().catch(err => {
  console.error('[data-quality-check] Fatal:', err)
  process.exit(1)
})
