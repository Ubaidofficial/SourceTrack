import dotenv from 'dotenv'
dotenv.config()

import { getSupabase } from '../lib/supabase.js'

// Shared channel classifier — single source of truth with the live attribution engine
import { channelFromEvent } from '../lib/channel-classifier.js'

const _supabase = getSupabase()
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

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
    job_name: 'nightly-attribution',
    status,
    conversions_processed: conversions_processed ?? 0,
    error_message: error_message ?? null,
    duration_ms: duration_ms ?? 0,
    ran_at: new Date().toISOString()
  })
}

let _processed = 0
const _t0 = Date.now()

const supabase = _supabase

const POSTHOG_PERSONAL_API_KEY = process.env.POSTHOG_PERSONAL_API_KEY
const POSTHOG_PROJECT_ID = process.env.POSTHOG_PROJECT_ID
const POSTHOG_HOST = process.env.POSTHOG_HOST

async function main() {
  const startTime = Date.now()
  log('Starting nightly attribution job')

  if (!POSTHOG_PERSONAL_API_KEY || !POSTHOG_PROJECT_ID || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    logError('Missing required environment variables')
    throw new Error("Missing required environment variables")
  }

  // Concurrency lock — if a previous run is still in-flight (no terminal row
  // logged in the last LOCK_TTL_HOURS), refuse to start. Prevents Railway
  // crons from doubling up upserts and inflating attribution counts.
  const LOCK_TTL_HOURS = 6
  try {
    const { data: lastRun } = await _supabase
      .from('job_runs')
      .select('status, ran_at')
      .eq('job_name', 'nightly-attribution')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastRun?.status === 'running' &&
        Date.now() - new Date(lastRun.ran_at).getTime() < LOCK_TTL_HOURS * 3600 * 1000) {
      log(`Another nightly-attribution run is in progress (started ${lastRun.ran_at}) — aborting`)
      return
    }
  } catch (lockErr) {
    logWarn(`Lock check failed (continuing anyway): ${lockErr.message}`)
  }

  // Mark this run as in-flight. Updated to success/failed below.
  await _writeJobRun({ status: 'running', conversions_processed: 0, duration_ms: 0 })

  try {
    // Skip free-plan, inactive, and archived sites entirely — multi-touch
    // attribution is a paid feature. Also skip sites with no activity in the
    // last 7 days to save compute (no new conversions to attribute).
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: sites, error: sitesError } = await supabase
      .from('sites')
      .select('id, site_key, plan, attribution_window_days, last_seen_at')
      .not('plan', 'in', '(free,inactive,archived)')
      .or(`last_seen_at.gte.${sevenDaysAgo},last_seen_at.is.null`)

    if (sitesError) {
      logError('Failed to fetch sites', sitesError)
      throw new Error("Failed to fetch sites")
    }

    if (!sites || sites.length === 0) {
      log('No paid sites with recent activity — nothing to process')
      return
    }

    log(`Found ${sites.length} paid sites with recent activity to process`)

    // Bounded-concurrency runner. Sequential processing (the old loop) bottlenecks
    // on per-site PostHog round-trips — at 100 sites with ~1s/site that's ~17min.
    // Concurrency 4 keeps us well under PostHog's per-IP rate ceiling while
    // cutting wall-clock time roughly to (sites / 4). Tune via env if needed.
    const CONCURRENCY = Math.max(1, Math.min(8, parseInt(process.env.NIGHTLY_CONCURRENCY || '4', 10)))
    let totalProcessed = 0
    let totalFailed = 0
    let cursor = 0

    async function worker() {
      while (cursor < sites.length) {
        const site = sites[cursor++]
        try {
          const result = await processSite(site)
          totalProcessed += result.processed
          totalFailed += result.failed
        } catch (error) {
          logWarn(`Site ${site.site_key} failed: ${error.message}`)
          totalFailed++
        }
        // Small jitter prevents all workers from hammering PostHog at the same
        // moment when one site finishes — spreads load across the rate window.
        await sleep(100 + Math.floor(Math.random() * 200))
      }
    }

    const workerCount = Math.min(CONCURRENCY, sites.length)
    log(`Running ${workerCount} workers (NIGHTLY_CONCURRENCY=${CONCURRENCY})`)
    await Promise.all(Array.from({ length: workerCount }, worker))

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    log(`Completed: ${totalProcessed} conversions processed, ${totalFailed} failed, ${duration}s`)
    _processed = totalProcessed

    // GDPR retention auto-purge (best-effort — never fail the whole job)
    try {
      await runRetentionPurge(sites)
    } catch (purgeErr) {
      logWarn(`Retention purge failed (non-fatal): ${purgeErr.message}`)
    }

    // Free-tier-specific purge: drop pageviews > 30 days old. The general
    // retention purge above only touches attributed_conversions; for free
    // sites we also enforce a hard 30-day cap on the raw pageview table to
    // keep Supabase storage bounded.
    try {
      await runFreeTierPageviewPurge()
    } catch (freePurgeErr) {
      logWarn(`Free-tier purge failed (non-fatal): ${freePurgeErr.message}`)
    }

    // Auto-archive free-tier sites inactive for 60+ days
    try {
      await runFreeTierAutoArchive()
    } catch (archErr) {
      logWarn(`Free-tier auto-archive failed (non-fatal): ${archErr.message}`)
    }

    return

  } catch (error) {
    logError('Critical failure', error)
    throw error
  }
}

async function processSite(site) {
  log(`Processing site: ${site.site_key}`)
  
  const conversionsQuery = `
    SELECT 
      uuid,
      distinct_id,
      timestamp,
      properties.conversion_type,
      properties.conversion_value
    FROM events
    WHERE event = '$conversion'
      AND properties.site_id = '${site.id}'
      AND timestamp >= now() - INTERVAL 24 HOUR
    ORDER BY timestamp DESC
    LIMIT 1000
  `
  
  let rows
  try {
    rows = await queryPostHog(conversionsQuery)
  } catch (error) {
    logWarn(`PostHog query failed for site ${site.site_key}: ${error.message}`)
    return { processed: 0, failed: 0 }
  }
  
  if (!rows || rows.length === 0) {
    log(`No conversions found for site ${site.site_key}`)
    return { processed: 0, failed: 0 }
  }
  
  let processed = 0
  let failed = 0
  
  for (const row of rows) {
    try {
      const conversion = {
        uuid: row[0],
        distinct_id: row[1],
        timestamp: row[2],
        conversion_type: row[3],
        conversion_value: row[4]
      }
      
      await processConversion(site, conversion)
      processed++
      await sleep(200)
      
    } catch (error) {
      logWarn(`Failed to process conversion ${row[0]}: ${error.message}`)
      failed++
    }
  }
  
  log(`Site ${site.site_key}: ${processed} processed, ${failed} failed`)
  return { processed, failed }
}

function calculateConfidence(touchpoints, channel) {
  let score = 30
  if (touchpoints.length > 0) score += 20
  const ft = touchpoints[0]
  if (ft?.utm_source)  score += 15
  if (ft?.utm_medium)  score += 5
  if (ft?.utm_campaign) score += 5
  if (ft?.gclid || ft?.fbclid || ft?.msclkid || ft?.ttclid) score += 20
  if (ft?.ai_source)   score += 10
  if (touchpoints.length >= 3) score += 5
  if (channel === 'Direct') score -= 15
  return Math.min(100, Math.max(0, score))
}

async function processConversion(site, conversion) {
  const convValue = parseFloat(conversion.conversion_value || 0)

  if (convValue < 0 || !conversion.distinct_id) {
    logWarn(`Skipping invalid conversion ${conversion.uuid}`)
    return
  }

  // Per-site attribution window — default 30d if not configured, max 90d
  const windowDays = Math.min(90, Math.max(1, site.attribution_window_days || 30))

  const touchpointsQuery = `
    SELECT
      timestamp,
      properties.utm_source,
      properties.utm_medium,
      properties.utm_campaign,
      properties.referrer,
      properties.ai_source,
      properties.gclid,
      properties.gbraid,
      properties.wbraid,
      properties.fbclid,
      properties.msclkid,
      properties.ttclid,
      properties.li_fat_id,
      properties.li_fatid,
      properties.twclid,
      properties.dclid,
      properties.snapclid,
      properties.pclid,
      properties.page_url
    FROM events
    WHERE event = '$pageview'
      AND distinct_id = '${conversion.distinct_id}'
      AND properties.site_id = '${site.id}'
      AND timestamp <= toDateTime('${conversion.timestamp}')
      AND timestamp >= toDateTime('${conversion.timestamp}') - INTERVAL ${windowDays} DAY
    ORDER BY timestamp ASC
    LIMIT 500
  `

  let touchpointRows
  try {
    touchpointRows = await queryPostHog(touchpointsQuery)
  } catch (error) {
    logWarn(`Failed to fetch touchpoints for ${conversion.uuid}: ${error.message}`)
    touchpointRows = []
  }

  const touchpoints = (touchpointRows || []).map(row => ({
    timestamp: row[0],
    utm_source: row[1] || null,
    utm_medium: row[2] || null,
    utm_campaign: row[3] || null,
    referrer: row[4] || null,
    ai_source: row[5] || null,
    gclid:     row[6]  || null,
    gbraid:    row[7]  || null,
    wbraid:    row[8]  || null,
    fbclid:    row[9]  || null,
    msclkid:   row[10] || null,
    ttclid:    row[11] || null,
    li_fat_id: row[12] || null,
    li_fatid:  row[13] || null,
    twclid:    row[14] || null,
    dclid:     row[15] || null,
    snapclid:  row[16] || null,
    pclid:     row[17] || null,
    page_url:  row[18] || null,
    derived_source: row[1] || row[6] || (row[4] ? (() => { try { return new URL(row[4]).hostname.replace('www.', '') } catch (_e) { return null } })() : null) || 'direct'
  }))
  
  const attribution = calculateAttribution(touchpoints, convValue)

  const firstTp = touchpoints[0] || {}
  const lastTp  = touchpoints[touchpoints.length - 1] || {}

  const firstTouchChannel = channelFromEvent({
    utm_source:     firstTp.utm_source,
    utm_medium:     firstTp.utm_medium,
    referrer:       firstTp.referrer,
    page_url:       firstTp.page_url,
    ai_source:      firstTp.ai_source,
    derived_source: firstTp.derived_source,
    gclid:          firstTp.gclid,
    gbraid:         firstTp.gbraid,
    wbraid:         firstTp.wbraid,
    fbclid:         firstTp.fbclid,
    msclkid:        firstTp.msclkid,
    ttclid:         firstTp.ttclid,
    li_fat_id:      firstTp.li_fat_id,
    li_fatid:       firstTp.li_fatid,
    twclid:         firstTp.twclid,
    dclid:          firstTp.dclid,
    snapclid:       firstTp.snapclid,
    pclid:          firstTp.pclid
  })
  const lastTouchChannel = channelFromEvent({
    utm_source:     lastTp.utm_source,
    utm_medium:     lastTp.utm_medium,
    referrer:       lastTp.referrer,
    page_url:       lastTp.page_url,
    ai_source:      lastTp.ai_source,
    derived_source: lastTp.derived_source,
    gclid:          lastTp.gclid,
    gbraid:         lastTp.gbraid,
    wbraid:         lastTp.wbraid,
    fbclid:         lastTp.fbclid,
    msclkid:        lastTp.msclkid,
    ttclid:         lastTp.ttclid,
    li_fat_id:      lastTp.li_fat_id,
    li_fatid:       lastTp.li_fatid,
    twclid:         lastTp.twclid,
    dclid:          lastTp.dclid,
    snapclid:       lastTp.snapclid,
    pclid:          lastTp.pclid
  })

  const confidence = calculateConfidence(touchpoints, firstTouchChannel)

  const tp30 = touchpoints.filter(tp => new Date(tp.timestamp) >= new Date(new Date(conversion.timestamp) - 30 * 86400000))
  const first30 = tp30[0]
  const channel30d = first30 ? channelFromEvent({
    utm_source:     first30.utm_source,
    utm_medium:     first30.utm_medium,
    referrer:       first30.referrer,
    page_url:       first30.page_url,
    ai_source:      first30.ai_source,
    derived_source: first30.derived_source,
    gclid:          first30.gclid,
    gbraid:         first30.gbraid,
    wbraid:         first30.wbraid,
    fbclid:         first30.fbclid,
    msclkid:        first30.msclkid,
    ttclid:         first30.ttclid,
    li_fat_id:      first30.li_fat_id,
    li_fatid:       first30.li_fatid,
    twclid:         first30.twclid,
    dclid:          first30.dclid,
    snapclid:       first30.snapclid,
    pclid:          first30.pclid
  }) : null

  const record = {
    site_id: site.id,
    conversion_event_id: conversion.uuid,
    distinct_id: conversion.distinct_id,
    conversion_date: new Date(conversion.timestamp).toISOString().split('T')[0],
    conversion_timestamp: conversion.timestamp,
    conversion_type: conversion.conversion_type || null,
    conversion_value: convValue,

    first_touch_source: attribution.first_touch?.source || attribution.first_touch?.derived_source || null,
    first_touch_medium: attribution.first_touch?.medium || null,
    first_touch_campaign: attribution.first_touch?.campaign || null,
    first_touch_timestamp: attribution.first_touch?.timestamp || null,

    last_touch_source: attribution.last_touch?.source || attribution.last_touch?.derived_source || null,
    last_touch_medium: attribution.last_touch?.medium || null,
    last_touch_campaign: attribution.last_touch?.campaign || null,
    last_touch_timestamp: attribution.last_touch?.timestamp || null,

    linear_attribution:     attribution.linear,
    u_shaped_attribution:   attribution.u_shaped?.length    ? attribution.u_shaped    : null,
    time_decay_attribution: attribution.time_decay?.length  ? attribution.time_decay  : null,
    w_shaped_attribution:   attribution.w_shaped?.length    ? attribution.w_shaped    : null,
    touchpoint_count: touchpoints.length,

    processing_version: '1.0',
    first_touch_channel: firstTouchChannel,
    last_touch_channel:  lastTouchChannel,
    channel:             firstTouchChannel,
    attribution_confidence: confidence,
    confidence_signals: JSON.stringify({
      has_utm:          !!(firstTp.utm_source),
      has_click_id:     !!(firstTp.gclid || firstTp.fbclid),
      has_ai_source:    !!(firstTp.ai_source),
      touchpoint_count: touchpoints.length
    }),
    channel_30d: channel30d
  }

  const { error } = await supabase
    .from('attributed_conversions')
    .upsert(record, { onConflict: 'site_id,conversion_event_id' })
  
  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`)
  }
}

function calculateAttribution(touchpoints, conversionValue) {
  if (!touchpoints || touchpoints.length === 0) {
    return {
      first_touch: null,
      last_touch: null,
      linear: [],
      u_shaped: [],
      time_decay: [],
      w_shaped: []
    }
  }

  const firstTouchpoint = touchpoints[0]
  const lastTouchpoint = touchpoints[touchpoints.length - 1]

  const tpCh = (tp) => channelFromEvent({
    utm_source: tp.utm_source, utm_medium: tp.utm_medium,
    ai_source: tp.ai_source, gclid: tp.gclid, gbraid: tp.gbraid, wbraid: tp.wbraid,
    fbclid: tp.fbclid, msclkid: tp.msclkid, ttclid: tp.ttclid,
    li_fat_id: tp.li_fat_id, li_fatid: tp.li_fatid, twclid: tp.twclid,
    dclid: tp.dclid, snapclid: tp.snapclid, pclid: tp.pclid,
    referrer: tp.referrer, page_url: tp.page_url
  })
  const tpBase = (tp) => ({
    source: tp.utm_source || null,
    medium: tp.utm_medium || null,
    campaign: tp.utm_campaign || null,
    channel: tpCh(tp),
    timestamp: tp.timestamp
  })

  // ── Linear ──────────────────────────────────────────────────────────────────
  const fraction = 1.0 / touchpoints.length
  const linearValue = conversionValue * fraction
  const linear = touchpoints.map(tp => ({
    ...tpBase(tp),
    fraction: parseFloat(fraction.toFixed(4)),
    attributed_value: parseFloat(linearValue.toFixed(2))
  }))

  // ── U-Shaped (40/20/40) ──────────────────────────────────────────────────────
  const u_shaped = (() => {
    if (touchpoints.length === 1) {
      return [{ ...tpBase(firstTouchpoint), fraction: 1.0, attributed_value: parseFloat(conversionValue.toFixed(2)) }]
    }
    if (touchpoints.length === 2) {
      return [
        { ...tpBase(firstTouchpoint), fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) },
        { ...tpBase(lastTouchpoint),  fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) }
      ]
    }
    const middleCount = touchpoints.length - 2
    const middleFraction = parseFloat((0.2 / middleCount).toFixed(4))
    const middleValue = parseFloat((conversionValue * 0.2 / middleCount).toFixed(2))
    return touchpoints.map((tp, i) => {
      if (i === 0) return { ...tpBase(tp), fraction: 0.4, attributed_value: parseFloat((conversionValue * 0.4).toFixed(2)) }
      if (i === touchpoints.length - 1) return { ...tpBase(tp), fraction: 0.4, attributed_value: parseFloat((conversionValue * 0.4).toFixed(2)) }
      return { ...tpBase(tp), fraction: middleFraction, attributed_value: middleValue }
    })
  })()

  // ── Time Decay (7-day half-life) ─────────────────────────────────────────────
  // Gives progressively more credit to touchpoints closer to the conversion.
  const time_decay = (() => {
    const conversionTime = new Date(lastTouchpoint.timestamp).getTime()
    const halfLifeDays = 7
    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000
    const rawWeights = touchpoints.map(tp => {
      const tpTime = new Date(tp.timestamp).getTime()
      const daysBack = Math.max(0, (conversionTime - tpTime) / halfLifeMs)
      return Math.pow(0.5, daysBack) // 0.5^(days/halfLife)
    })
    const totalWeight = rawWeights.reduce((s, w) => s + w, 0) || 1
    return touchpoints.map((tp, i) => {
      const frac = parseFloat((rawWeights[i] / totalWeight).toFixed(4))
      return {
        ...tpBase(tp),
        fraction: frac,
        attributed_value: parseFloat((conversionValue * frac).toFixed(2))
      }
    })
  })()

  // ── W-Shaped (30/30/30/10) ───────────────────────────────────────────────────
  // 30% first touch, 30% lead creation (middle), 30% last touch, 10% spread across rest.
  const w_shaped = (() => {
    if (touchpoints.length === 1) {
      return [{ ...tpBase(firstTouchpoint), fraction: 1.0, attributed_value: parseFloat(conversionValue.toFixed(2)) }]
    }
    if (touchpoints.length === 2) {
      return [
        { ...tpBase(firstTouchpoint), fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) },
        { ...tpBase(lastTouchpoint),  fraction: 0.5, attributed_value: parseFloat((conversionValue * 0.5).toFixed(2)) }
      ]
    }
    if (touchpoints.length === 3) {
      return touchpoints.map((tp, i) => ({
        ...tpBase(tp),
        fraction: 0.333,
        attributed_value: parseFloat((conversionValue / 3).toFixed(2))
      }))
    }
    // 4+ touchpoints: anchor 30% to first, middle, and last; 10% spread across the rest
    const middleIdx = Math.floor((touchpoints.length - 1) / 2)
    const anchorIndices = new Set([0, middleIdx, touchpoints.length - 1])
    const otherCount = touchpoints.length - anchorIndices.size
    const otherFrac = otherCount > 0 ? parseFloat((0.1 / otherCount).toFixed(4)) : 0
    const otherValue = otherCount > 0 ? parseFloat((conversionValue * 0.1 / otherCount).toFixed(2)) : 0
    return touchpoints.map((tp, i) => {
      if (anchorIndices.has(i)) {
        return { ...tpBase(tp), fraction: 0.3, attributed_value: parseFloat((conversionValue * 0.3).toFixed(2)) }
      }
      return { ...tpBase(tp), fraction: otherFrac, attributed_value: otherValue }
    })
  })()

  return {
    first_touch: {
      source: firstTouchpoint.utm_source || null,
      medium: firstTouchpoint.utm_medium || null,
      campaign: firstTouchpoint.utm_campaign || null,
      timestamp: firstTouchpoint.timestamp,
      derived_source: firstTouchpoint.derived_source || null
    },
    last_touch: {
      source: lastTouchpoint.utm_source || null,
      medium: lastTouchpoint.utm_medium || null,
      campaign: lastTouchpoint.utm_campaign || null,
      timestamp: lastTouchpoint.timestamp,
      derived_source: lastTouchpoint.derived_source || null
    },
    linear,
    u_shaped,
    time_decay,
    w_shaped
  }
}

// ─── GDPR Retention Auto-Purge ────────────────────────────────────────────────
// Deletes attributed_conversions older than data_retention_days for each site
// that has a retention policy set. Runs after attribution processing each night.
async function runRetentionPurge(sites) {
  if (!sites?.length) return

  // Re-fetch sites with data_retention_days field
  const { data: sitesWithRetention, error } = await supabase
    .from('sites')
    .select('id, site_key, data_retention_days')
    .not('data_retention_days', 'is', null)
    .gt('data_retention_days', 0)

  if (error || !sitesWithRetention?.length) return

  let totalPurged = 0
  for (const site of sitesWithRetention) {
    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - site.data_retention_days)
      const cutoffStr = cutoff.toISOString().slice(0, 10)

      const { count, error: delErr } = await supabase
        .from('attributed_conversions')
        .delete({ count: 'exact' })
        .eq('site_id', site.id)
        .lt('conversion_date', cutoffStr)

      if (delErr) {
        logWarn(`Retention purge for site ${site.site_key} failed: ${delErr.message}`)
      } else if (count > 0) {
        log(`Retention purge: deleted ${count} rows from site ${site.site_key} (>${site.data_retention_days}d old)`)
        totalPurged += count
      }
    } catch (siteErr) {
      logWarn(`Retention purge site ${site.site_key} threw: ${siteErr.message}`)
    }
  }

  if (totalPurged > 0) {
    log(`Retention purge complete: ${totalPurged} total rows deleted`)
  }
}

// ─── Free-tier raw pageview purge ─────────────────────────────────────────────
// Deletes pageviews older than 30 days for every site on the free plan. The
// general data_retention_days purge above scopes to attributed_conversions
// only; this enforces the additional storage cap that makes the free tier
// economically viable.
async function runFreeTierPageviewPurge() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffISO = cutoff.toISOString()

  const { data: freeSites, error } = await supabase
    .from('sites')
    .select('id, site_key')
    .eq('plan', 'free')

  if (error || !freeSites?.length) return

  let totalPurged = 0
  for (const site of freeSites) {
    const { count, error: delErr } = await supabase
      .from('pageviews')
      .delete({ count: 'exact' })
      .eq('site_id', site.id)
      .lt('timestamp', cutoffISO)

    if (delErr) {
      logWarn(`Free-tier pageview purge for site ${site.site_key} failed: ${delErr.message}`)
    } else if (count > 0) {
      totalPurged += count
    }
  }

  if (totalPurged > 0) {
    log(`Free-tier pageview purge: ${totalPurged} rows deleted (>30d) across ${freeSites.length} free sites`)
  }
}

// ─── Free-tier inactive auto-archive ──────────────────────────────────────────
// Sets plan='archived' for free-plan sites with no pageview activity in 60+
// days. Tracker auth rejects archived plans so this both stops cost and
// frees the site_key for the user to reactivate via dashboard.
async function runFreeTierAutoArchive() {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 60)
  const cutoffISO = cutoff.toISOString()

  const { data: stale, error } = await supabase
    .from('sites')
    .select('id, site_key, last_seen_at')
    .eq('plan', 'free')
    .or(`last_seen_at.lt.${cutoffISO},last_seen_at.is.null`)

  if (error || !stale?.length) return

  // Guard: don't archive sites that were created less than 60 days ago and
  // happen to have last_seen_at=null (never tracked anything yet) unless
  // they're truly old. Re-query with a created_at filter.
  const { data: toArchive } = await supabase
    .from('sites')
    .select('id, site_key')
    .eq('plan', 'free')
    .or(`last_seen_at.lt.${cutoffISO},and(last_seen_at.is.null,created_at.lt.${cutoffISO})`)

  if (!toArchive?.length) return

  const ids = toArchive.map(s => s.id)
  const { error: updErr } = await supabase
    .from('sites')
    .update({ plan: 'archived' })
    .in('id', ids)

  if (updErr) {
    logWarn(`Free-tier auto-archive update failed: ${updErr.message}`)
    return
  }
  log(`Free-tier auto-archive: archived ${toArchive.length} inactive sites`)
}

async function queryPostHog(query, attempt = 0) {
  const host = POSTHOG_HOST.replace(/\/$/, '')
  const url = `${host}/api/projects/${POSTHOG_PROJECT_ID}/query/`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${POSTHOG_PERSONAL_API_KEY}`
    },
    body: JSON.stringify({
      query: { kind: 'HogQLQuery', query: query }
    })
  })

  // Retry on rate limit (429) and transient 5xx with exponential backoff.
  // PostHog returns Retry-After in seconds when it knows the wait.
  if ((response.status === 429 || response.status >= 500) && attempt < 3) {
    const retryAfterHdr = parseInt(response.headers.get('retry-after') || '0', 10)
    const backoffMs = retryAfterHdr > 0 ? retryAfterHdr * 1000 : Math.min(60_000, 2000 * Math.pow(2, attempt))
    logWarn(`PostHog ${response.status} — retrying in ${backoffMs}ms (attempt ${attempt + 1}/3)`)
    await sleep(backoffMs)
    return queryPostHog(query, attempt + 1)
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`PostHog API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  return data.results || []
}

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`)
}

function logWarn(message) {
  console.warn(`[${new Date().toISOString()}] WARN: ${message}`)
}

function logError(message, error) {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, error)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

main()
  .then(() => {
    _writeJobRun({ status: 'success', conversions_processed: _processed, duration_ms: Date.now() - _t0 })
    _slackAlert('✅', 'Attribution Job — SUCCESS', `Processed ${_processed} conversions in ${Date.now() - _t0}ms`)
  })
  .catch(err => {
    _writeJobRun({ status: 'failed', conversions_processed: _processed, error_message: err.message, duration_ms: Date.now() - _t0 })
    _slackAlert('🔴', 'Attribution Job — FAILED', err.message)
    process.exit(1)
  })
