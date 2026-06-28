import dotenv from 'dotenv'
dotenv.config()

// Anomaly Watcher — nightly job. Scans each active site's attributed_conversions
// for three operational anomalies and writes human-readable rows to site_alerts
// (surfaced in the dashboard bell/drawer). Deterministic only: no LLM, no
// inference, no recommendations beyond the fixed message templates.
//
// Schedule: run nightly (same cadence as nightly-attribution). There is no
// in-repo scheduler — jobs are standalone CLI scripts invoked by Railway cron:
//   node api/jobs/anomaly-watcher.js
// Registering the cron is a Railway dashboard action (human-gated; CC has no
// Railway access). This file only provides the runnable job.
//
// Reuses ONLY columns confirmed on prod: attributed_conversions.linear_attribution
// (jsonb array; elements carry `channel`), last_touch_source, last_touch_channel,
// conversion_timestamp.

import { getSupabase } from '../lib/supabase.js'

const _supabase = getSupabase()
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

const DAY_MS = 24 * 60 * 60 * 1000

let _alertsCreated = 0
const _t0 = Date.now()

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}
function logWarn(message) {
  console.warn(`[${new Date().toISOString()}] WARN: ${message}`)
}
function logError(message, error) {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error)
}

async function _slackAlert(emoji, heading, detail) {
  if (!SLACK_WEBHOOK_URL) return console.log(`[ALERT] ${emoji} ${heading}: ${detail}`)
  await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `${emoji} *${heading}*\n${detail}` })
  })
}

async function _writeJobRun({ status, conversions_processed, error_message, duration_ms }) {
  await _supabase.from('job_runs').insert({
    job_name: 'anomaly-watcher',
    status,
    conversions_processed: conversions_processed ?? 0, // reused as alerts-created counter
    error_message: error_message ?? null,
    duration_ms: duration_ms ?? 0,
    ran_at: new Date().toISOString()
  })
}

// Dedup + insert: skip when an UNRESOLVED alert of the same type+site already
// exists from the last 24h. Returns true if a row was inserted.
async function insertAlert(siteId, type, message, dataJson) {
  const since = new Date(Date.now() - DAY_MS).toISOString()
  const { data: existing, error: existErr } = await _supabase
    .from('site_alerts')
    .select('id')
    .eq('site_id', siteId)
    .eq('type', type)
    .is('dismissed_at', null)
    .gte('created_at', since)
    .limit(1)
  if (existErr) throw existErr
  if (existing && existing.length > 0) return false

  const { error: insErr } = await _supabase
    .from('site_alerts')
    .insert({ site_id: siteId, type, message, data_json: dataJson })
  if (insErr) throw insErr
  _alertsCreated++
  return true
}

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0)

// ── WATCH 1: Direct traffic spike ────────────────────────────────────────────
// Compares Direct share of linear_attribution touchpoints in the last 24h vs the
// prior-6-day rolling average. Touchpoints are filtered by their OWN timestamp.
async function watchDirectSpike(siteId, rows) {
  const now = Date.now()
  let todayTotal = 0, todayDirect = 0, priorTotal = 0, priorDirect = 0
  for (const row of rows) {
    const tps = Array.isArray(row.linear_attribution) ? row.linear_attribution : []
    for (const tp of tps) {
      const t = tp?.timestamp ? new Date(tp.timestamp).getTime() : NaN
      if (Number.isNaN(t)) continue
      const isDirect = tp.channel === 'Direct'
      if (t >= now - DAY_MS) {
        todayTotal++; if (isDirect) todayDirect++
      } else if (t >= now - 7 * DAY_MS) {
        priorTotal++; if (isDirect) priorDirect++
      }
    }
  }
  const today_pct = pct(todayDirect, todayTotal)
  const avg_pct = pct(priorDirect, priorTotal)
  const threshold = avg_pct + 20
  if (today_pct > threshold && todayTotal >= 10) {
    await insertAlert(
      siteId,
      'direct_spike',
      `Direct traffic jumped to ${today_pct}% today (your 7-day average is ${avg_pct}%). This usually means a tracking script stopped loading on a page.`,
      { today_pct, avg_pct, today_count: todayTotal, threshold }
    )
  }
}

// ── WATCH 2: Source disappearance ────────────────────────────────────────────
// A non-direct, non-null last_touch_source with > 5 conversions in the prior 7
// days but 0 in the last 48h. Dedup keeps it to one source_silent alert/site/day.
async function watchSourceSilent(siteId, rows) {
  const now = Date.now()
  const stats = new Map() // source -> { week, last48, lastSeen }
  for (const row of rows) {
    const src = row.last_touch_source
    if (!src || row.last_touch_channel === 'Direct') continue
    const t = row.conversion_timestamp ? new Date(row.conversion_timestamp).getTime() : NaN
    if (Number.isNaN(t)) continue
    const s = stats.get(src) || { week: 0, last48: 0, lastSeen: 0 }
    s.week++
    if (t >= now - 2 * DAY_MS) s.last48++
    if (t > s.lastSeen) s.lastSeen = t
    stats.set(src, s)
  }
  // Most-active-first so the single deduped alert covers the biggest silent source.
  const candidates = [...stats.entries()]
    .filter(([, s]) => s.week > 5 && s.last48 === 0)
    .sort((a, b) => b[1].week - a[1].week)
  for (const [src, s] of candidates) {
    const inserted = await insertAlert(
      siteId,
      'source_silent',
      `${src} traffic has gone quiet for 48 hours (it averaged ${s.week} conversions/week recently). Was a campaign paused?`,
      { source: src, recent_avg: s.week, last_seen_at: new Date(s.lastSeen).toISOString() }
    )
    if (inserted) break // dedup also blocks the rest; stop after the first write
  }
}

// ── WATCH 3: Attribution coverage drop ───────────────────────────────────────
// Share of conversions with a non-direct, non-null last_touch_channel, today vs
// yesterday. Fires on a >15-point drop with >= 10 conversions today.
async function watchCoverageDrop(siteId, rows) {
  const now = Date.now()
  const covered = (r) => !!r.last_touch_channel && r.last_touch_channel !== 'Direct'
  let todayTotal = 0, todayCov = 0, yTotal = 0, yCov = 0
  for (const row of rows) {
    const t = row.conversion_timestamp ? new Date(row.conversion_timestamp).getTime() : NaN
    if (Number.isNaN(t)) continue
    if (t >= now - DAY_MS) {
      todayTotal++; if (covered(row)) todayCov++
    } else if (t >= now - 2 * DAY_MS) {
      yTotal++; if (covered(row)) yCov++
    }
  }
  const today_pct = pct(todayCov, todayTotal)
  const yesterday_pct = pct(yCov, yTotal)
  if (yesterday_pct - today_pct > 15 && todayTotal >= 10) {
    await insertAlert(
      siteId,
      'coverage_drop',
      `Attribution coverage dropped from ${yesterday_pct}% to ${today_pct}% today. Check your pixel install.`,
      { today_pct, yesterday_pct, today_count: todayTotal }
    )
  }
}

async function main() {
  log('Starting anomaly-watcher job')

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    logError('Missing required environment variables')
    throw new Error('Missing required environment variables')
  }

  // Same site scope as nightly-attribution: skip free/inactive/archived sites
  // (no attributed_conversions rows) and sites with no activity in 7 days.
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS).toISOString()
  const { data: sites, error: sitesError } = await _supabase
    .from('sites')
    .select('id, site_key')
    .not('plan', 'in', '(free,inactive,archived)')
    .or(`last_seen_at.gte.${sevenDaysAgo},last_seen_at.is.null`)

  if (sitesError) {
    logError('Failed to fetch sites', sitesError)
    throw new Error('Failed to fetch sites')
  }
  if (!sites || sites.length === 0) {
    log('No active sites to scan — nothing to do')
    return
  }

  log(`Scanning ${sites.length} site(s)`)
  for (const site of sites) {
    try {
      const { data: rows, error: rowsErr } = await _supabase
        .from('attributed_conversions')
        .select('linear_attribution, last_touch_source, last_touch_channel, conversion_timestamp')
        .eq('site_id', site.id)
        .gte('conversion_timestamp', sevenDaysAgo)
      if (rowsErr) throw rowsErr
      if (!rows || rows.length === 0) continue

      await watchDirectSpike(site.id, rows)
      await watchSourceSilent(site.id, rows)
      await watchCoverageDrop(site.id, rows)
    } catch (err) {
      logWarn(`Site ${site.site_key} scan failed: ${err.message}`)
    }
  }

  log(`Anomaly-watcher complete — ${_alertsCreated} alert(s) created`)
}

main()
  .then(() => {
    _writeJobRun({ status: 'success', conversions_processed: _alertsCreated, duration_ms: Date.now() - _t0 })
    _slackAlert('✅', 'Anomaly Watcher — SUCCESS', `Created ${_alertsCreated} alert(s) in ${Date.now() - _t0}ms`)
  })
  .catch(err => {
    _writeJobRun({ status: 'failed', conversions_processed: _alertsCreated, error_message: err.message, duration_ms: Date.now() - _t0 })
    _slackAlert('🔴', 'Anomaly Watcher — FAILED', err.message)
    process.exit(1)
  })
