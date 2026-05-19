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

function classify(value, ok, warn) {
  if (value >= ok) return 'ok'
  if (value >= warn) return 'warning'
  return 'critical'
}

function classifyMax(value, ok, warn) {
  if (value <= ok) return 'ok'
  if (value <= warn) return 'warning'
  return 'critical'
}

async function run() {
  console.log('[data-quality-check] Starting...')
  const supabase = getSupabase()
  const ms = monthStart()
  const now = new Date().toISOString()

  const { data: sites } = await supabase.from('sites').select('id, site_key, domain, plan')
  if (!sites?.length) {
    console.log('[data-quality-check] No sites found')
    process.exit(0)
  }

  console.log(`[data-quality-check] Processing ${sites.length} sites`)

  for (const site of sites) {
    console.log(`\n--- Site: ${site.site_key} (${site.domain || 'no domain'}) ---`)

    // ── CHECK 1: attribution_coverage ──────────────────────────────────
    try {
      const { count: attrCount } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('conversion_date', ms.split('T')[0])
      const { count: convCount } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('conversion_date', ms.split('T')[0])

      const aCount = attrCount ?? 0
      const cCount = convCount ?? 0
      const ratio = cCount > 0 ? aCount / cCount : 1
      const status = classify(ratio, 0.8, 0.5)
      const msg = `${Math.round(ratio * 100)}% of conversions attributed this month`
      await insert(supabase, 'attribution_coverage', status, ratio, 0.8, msg, site.id)
    } catch (e) { console.error('  CHECK 1 failed:', e.message) }

    // ── CHECK 2: utm_coverage ──────────────────────────────────────────
    try {
      const { count: totalSessions } = await supabase
        .from('pageviews')
        .select('session_id', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('timestamp', ms)
        .not('session_id', 'is', null)

      const { data: utmSessionRows } = await supabase
        .from('pageviews')
        .select('session_id')
        .eq('site_id', site.id)
        .gte('timestamp', ms)
        .not('utm_source', 'is', null)
        .neq('utm_source', '')
        .limit(100000)

      const utmSessions = new Set((utmSessionRows || []).map(r => r.session_id)).size
      const total = totalSessions ?? 1
      const ratio = total > 0 ? utmSessions / total : 0
      const status = classify(ratio, 0.4, 0.2)
      const msg = `${Math.round(ratio * 100)}% of sessions have UTM tracking`
      await insert(supabase, 'utm_coverage', status, ratio, 0.4, msg, site.id)
    } catch (e) { console.error('  CHECK 2 failed:', e.message) }

    // ── CHECK 3: direct_traffic_rate ───────────────────────────────────
    try {
      const { count: totalAttr } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('conversion_date', ms.split('T')[0])
      const { count: directAttr } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .eq('channel', 'Direct')
        .gte('conversion_date', ms.split('T')[0])

      const tTotal = totalAttr ?? 1
      const dCount = directAttr ?? 0
      const ratio = tTotal > 0 ? dCount / tTotal : 0
      const status = classifyMax(ratio, 0.3, 0.5)
      const msg = `${Math.round(ratio * 100)}% of conversions from Direct (high = missing UTMs or broken tracking)`
      await insert(supabase, 'direct_traffic_rate', status, ratio, 0.3, msg, site.id)
    } catch (e) { console.error('  CHECK 3 failed:', e.message) }

    // ── CHECK 4: conversion_value_coverage ─────────────────────────────
    try {
      const { count: totalConv } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('conversion_date', ms.split('T')[0])
      const { count: valuedConv } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gt('conversion_value', 0)
        .gte('conversion_date', ms.split('T')[0])

      const tTotal = totalConv ?? 1
      const vCount = valuedConv ?? 0
      const ratio = tTotal > 0 ? vCount / tTotal : 0
      const status = classify(ratio, 0.7, 0.4)
      const msg = `${Math.round(ratio * 100)}% of conversions have revenue values`
      await insert(supabase, 'conversion_value_coverage', status, ratio, 0.7, msg, site.id)
    } catch (e) { console.error('  CHECK 4 failed:', e.message) }

    // ── CHECK 5: nightly_job_freshness ─────────────────────────────────
    try {
      const { data: run } = await supabase
        .from('job_runs')
        .select('ran_at')
        .eq('job_name', 'nightly-attribution')
        .order('ran_at', { ascending: false })
        .limit(1)
        .single()

      let hoursAgo = 999
      if (run?.ran_at) {
        hoursAgo = Math.round((Date.now() - new Date(run.ran_at).getTime()) / 3600000)
      }
      const status = hoursAgo <= 25 ? 'ok' : hoursAgo <= 48 ? 'warning' : 'critical'
      const msg = `Last attribution job ran ${hoursAgo} hours ago`
      await insert(supabase, 'nightly_job_freshness', status, hoursAgo, 25, msg, site.id)
    } catch (e) { console.error('  CHECK 5 failed:', e.message) }

    // ── CHECK 6: session_id_coverage ───────────────────────────────────
    try {
      const { count: totalPv } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('timestamp', ms)
      const { count: withSession } = await supabase
        .from('pageviews')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('timestamp', ms)
        .not('session_id', 'is', null)

      const tTotal = totalPv ?? 1
      const sCount = withSession ?? 0
      const ratio = tTotal > 0 ? sCount / tTotal : 0
      const status = classify(ratio, 0.95, 0.85)
      const msg = `${Math.round(ratio * 100)}% of pageviews have session IDs`
      await insert(supabase, 'session_id_coverage', status, ratio, 0.95, msg, site.id)
    } catch (e) { console.error('  CHECK 6 failed:', e.message) }

    // ── CHECK 7: ai_detection_rate ─────────────────────────────────────
    try {
      const { count: totalAttr } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('conversion_date', ms.split('T')[0])
      const { count: aiAttr } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gte('conversion_date', ms.split('T')[0])
        .or('first_touch_source.ilike.%ChatGPT%,first_touch_source.ilike.%Claude%,first_touch_source.ilike.%Perplexity%,first_touch_source.ilike.%Gemini%,first_touch_source.ilike.%Grok%,first_touch_source.ilike.%Copilot%,first_touch_source.ilike.%DeepSeek%')

      const tTotal = totalAttr ?? 1
      const aCount = aiAttr ?? 0
      const ratio = tTotal > 0 ? aCount / tTotal : 0
      const msg = `${Math.round(ratio * 100)}% of conversions detected from AI sources`
      await insert(supabase, 'ai_detection_rate', 'ok', ratio, null, msg, site.id)
    } catch (e) { console.error('  CHECK 7 failed:', e.message) }

    // ── CHECK 8: duplicate_conversion_rate ─────────────────────────────
    try {
      const { count: totalDedup } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .not('external_event_id', 'is', null)
      const { count: dupCount } = await supabase
        .from('attributed_conversions')
        .select('*', { count: 'exact', head: true })
        .eq('site_id', site.id)
        .gt('dedup_count', 0)

      const tTotal = totalDedup ?? 1
      const dCount = dupCount ?? 0
      const ratio = tTotal > 0 ? dCount / tTotal : 0
      const status = classifyMax(ratio, 0.02, 0.1)
      const msg = `${Math.round(ratio * 100)}% duplicate conversion rate`
      await insert(supabase, 'duplicate_conversion_rate', status, ratio, 0.02, msg, site.id)
    } catch (e) { console.error('  CHECK 8 failed:', e.message) }
  }

  console.log('\n[data-quality-check] Done.')
  process.exit(0)
}

async function insert(supabase, checkName, status, value, threshold, message, siteId) {
  const now = new Date().toISOString()
  const icon = status === 'ok' ? '✅' : status === 'warning' ? '⚠️' : '❌'
  console.log(`  ${icon} ${checkName}: ${status.toUpperCase()} — ${message}`)

  try {
    const { error: reportErr } = await supabase.from('data_quality_reports').insert({
      check_name: checkName,
      status,
      value: parseFloat(Number(value).toFixed(4)),
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

run().catch(err => {
  console.error('[data-quality-check] Fatal:', err)
  process.exit(1)
})
