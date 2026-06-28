import dotenv from 'dotenv'
dotenv.config()

import { getSupabase } from '../lib/supabase.js'
import { clampDays, classifyJourney, applyBackfill } from '../lib/backfill.js'
import { purgeSiteRetention } from '../lib/retention-purge.js'

const isReprocess = process.argv.includes('--reprocess-all') || process.argv.some(arg => arg.startsWith('--reprocess-site='));
const confirmDestructive = process.argv.includes('--confirm-destructive');
const reprocessSiteKey = process.argv.find(arg => arg.startsWith('--reprocess-site='))?.split('=')[1];
const reprocessSuffixFilter = process.argv.find(arg => arg.startsWith('--reprocess-suffix-filter='))?.split('=')[1];

// ── Per-site historical backfill (NEW; separate from --reprocess-site) ────────
// Uses the SAME per-row upsert as nightly (onConflict site_id,conversion_event_id),
// NOT the staging-locked destructive delete+insert reprocess path. Works on prod
// but requires --confirm to write; defaults to dry-run.
const backfillSiteId = process.argv.find(arg => arg.startsWith('--backfill-site='))?.split('=')[1];
const isBackfill = !!backfillSiteId;
const backfillDays = process.argv.find(arg => arg.startsWith('--days='))?.split('=')[1];
const backfillDryRun = process.argv.includes('--dry-run');
const backfillConfirm = process.argv.includes('--confirm');

if (isReprocess) {
  const dbUrl = process.env.SUPABASE_URL || '';
  const STAGING_REF = 'nrsvpwzekfrdrzkoecfk';

  // 1. Staging project ref allowlist check
  if (!dbUrl.includes(STAGING_REF)) {
    console.error(`❌ ERROR: Reprocessing is ONLY allowed on the staging database reference: ${STAGING_REF}`);
    process.exit(1);
  }

  // 2. Explicit confirm flag check
  if (!confirmDestructive) {
    console.error('❌ ERROR: Reprocessing is a destructive operation. You must pass the --confirm-destructive flag to proceed.');
    process.exit(1);
  }

  // 3. Recognized test site key check
  const STABLE_TEST_SITE_KEY = 'de500000-babe-41d4-a716-446655440000';
  if (reprocessSiteKey !== STABLE_TEST_SITE_KEY) {
    console.error(`❌ ERROR: Reprocessing is ONLY allowed for the recognized staging test site key: ${STABLE_TEST_SITE_KEY}`);
    process.exit(1);
  }
}

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

function parsePathname(urlStr) {
  if (!urlStr) return 'unknown'
  try {
    const url = urlStr.startsWith('/') ? new URL(urlStr, 'http://localhost') : new URL(urlStr)
    return url.pathname || 'unknown'
  } catch (_) {
    return 'unknown'
  }
}

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

  // Backfill mode short-circuits the nightly lock + all-sites loop: it targets one
  // explicit site via the per-row upsert path. It must NOT write a nightly job_run
  // (health checks read that), so the EOF handler is guarded by isBackfill too.
  if (isBackfill) {
    return runBackfill()
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
    let query = supabase
      .from('sites')
      .select('id, site_key, plan, attribution_window_days, last_seen_at')

    if (reprocessSiteKey) {
      query = query.eq('site_key', reprocessSiteKey)
    } else {
      query = query.not('plan', 'in', '(free,inactive,archived)')
        .or(`last_seen_at.gte.${sevenDaysAgo},last_seen_at.is.null`)
    }

    const { data: sites, error: sitesError } = await query

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

async function runBackfill() {
  const days = clampDays(backfillDays)
  const sbRef = (process.env.SUPABASE_URL || '').match(/https?:\/\/([^.]+)\./)?.[1] || 'unknown'

  const { data: site, error: siteErr } = await supabase
    .from('sites')
    .select('id, site_key, plan, attribution_window_days')
    .eq('id', backfillSiteId)
    .maybeSingle()
  if (siteErr) throw new Error(`Failed to fetch site ${backfillSiteId}: ${siteErr.message}`)
  if (!site) throw new Error(`Site ${backfillSiteId} not found`)

  const attrWindowDays = Math.min(90, Math.max(1, site.attribution_window_days || 30))
  const willWrite = backfillConfirm && !backfillDryRun

  // Log target + Supabase ref + window BEFORE any write.
  log(`BACKFILL target: site_id=${site.id} site_key=${site.site_key} plan=${site.plan} | supabase_ref=${sbRef} | conversion_window=${days}d | attribution_window=${attrWindowDays}d | mode=${willWrite ? 'WRITE (--confirm)' : 'DRY-RUN (no writes)'}`)
  if (!willWrite && !backfillDryRun) {
    logWarn('No --confirm flag → running DRY-RUN. Pass --confirm to persist writes.')
  }

  const conversionsQuery = `
    SELECT uuid, distinct_id, timestamp, properties.conversion_type, properties.conversion_value, properties.external_event_id
    FROM events
    WHERE event = '$conversion'
      AND properties.site_id = '${site.id}'
      AND timestamp >= now() - INTERVAL ${days} DAY
    ORDER BY timestamp ASC
    LIMIT 5000
  `
  const rows = await queryPostHog(conversionsQuery)
  log(`Found ${rows?.length || 0} $conversion event(s) in the ${days}d window`)

  const records = []
  const journey = { complete: 0, possibly_truncated: 0, no_journey: 0 }
  for (const row of (rows || [])) {
    const conversion = {
      uuid: row[0], distinct_id: row[1], timestamp: row[2],
      conversion_type: row[3], conversion_value: row[4], external_event_id: row[5] || null
    }
    if (!conversion.uuid || !conversion.distinct_id || !conversion.timestamp) {
      logWarn(`Skipping invalid conversion ${conversion.uuid}`)
      continue
    }
    const record = await processConversion(site, conversion)
    records.push(record)
    journey[classifyJourney(record, conversion.timestamp, attrWindowDays)]++
  }

  // Real upsert adapter — honors BOTH unique indexes:
  //   (site_id, conversion_event_id)            → existing row UPDATEs (idempotent re-run)
  //   partial (site_id, external_event_id) for a DIFFERENT conversion_event_id
  //                                             → unique violation 23505 → caught + skipped
  //                                               (a duplicate source $conversion event)
  const store = {
    async upsert(record) {
      const { error } = await supabase
        .from('attributed_conversions')
        .upsert(record, { onConflict: 'site_id,conversion_event_id' })
      if (error) {
        if (error.code === '23505') return 'skipped_duplicate'
        throw new Error(`Supabase upsert failed: ${error.message}`)
      }
      await sleep(100)
      return 'upserted'
    }
  }

  const result = await applyBackfill(records, { dryRun: !willWrite, store })
  _processed = result.upserted

  if (!willWrite) {
    log(`DRY-RUN: ${result.wouldWrite} conversion(s) WOULD be upserted (0 written).`)
  } else {
    log(`WROTE: ${result.upserted} upserted, ${result.skippedDuplicate} skipped (external_event_id duplicate).`)
  }
  if (journey.possibly_truncated > 0) {
    logWarn(`${journey.possibly_truncated} conversion(s) have POSSIBLY-TRUNCATED journeys — first touch sits at the ${attrWindowDays}d attribution-window boundary, so earlier touches are excluded. Do NOT present these as complete journeys.`)
  }
  log(`Journey completeness: complete=${journey.complete}, possibly_truncated=${journey.possibly_truncated}, no_journey=${journey.no_journey}`)
}

async function processSite(site) {
  log(`Processing site: ${site.site_key}`)

  const lookbackInterval = isReprocess ? '90 DAY' : '24 HOUR'

  let suffixFilterClause = ''
  if (reprocessSuffixFilter) {
    suffixFilterClause = `AND distinct_id LIKE '%${reprocessSuffixFilter}'`
  } else if (site.site_key === 'de400000-babe-41d4-a716-446655440000') {
    suffixFilterClause = "AND distinct_id LIKE '%_mv'"
  }

  const conversionsQuery = `
    SELECT 
      uuid,
      distinct_id,
      timestamp,
      properties.conversion_type,
      properties.conversion_value,
      properties.external_event_id
    FROM events
    WHERE event = '$conversion'
      AND properties.site_id = '${site.id}'
      AND timestamp >= now() - INTERVAL ${lookbackInterval}
      ${suffixFilterClause}
    ORDER BY timestamp ASC
    LIMIT 1000
  `

  log(`conversionsQuery: ${conversionsQuery}`)
  let rows
  try {
    rows = await queryPostHog(conversionsQuery)
    log(`conversionsQuery returned ${rows ? rows.length : 0} rows`)
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
  const records = []
  
  for (const row of rows) {
    try {
      const conversion = {
        uuid: row[0],
        distinct_id: row[1],
        timestamp: row[2],
        conversion_type: row[3],
        conversion_value: row[4],
        external_event_id: row[5] || null
      }
      
      const record = await processConversion(site, conversion)
      if (isReprocess) {
        records.push(record)
      } else {
        const { error } = await supabase
          .from('attributed_conversions')
          .upsert(record, { onConflict: 'site_id,conversion_event_id' })
        if (error) throw new Error(`Supabase upsert failed: ${error.message}`)
      }
      processed++
      await sleep(200)
      
    } catch (error) {
      logWarn(`Failed to process conversion ${row[0]}: ${error.message}`)
      failed++
    }
  }
  
  if (isReprocess && records.length > 0) {
    log(`Reprocessing: deleting existing conversions for site ${site.site_key}...`)
    const { error: deleteError } = await supabase
      .from('attributed_conversions')
      .delete()
      .eq('site_id', site.id)
    if (deleteError) {
      throw new Error(`Failed to delete existing conversions: ${deleteError.message}`)
    }

    log(`Reprocessing: inserting ${records.length} calculated conversions for site ${site.site_key}...`)
    const { error: insertError } = await supabase
      .from('attributed_conversions')
      .insert(records)
    if (insertError) {
      throw new Error(`Failed to insert reprocessed conversions: ${insertError.message}`)
    }
    log(`Reprocessing complete for site ${site.site_key}: successfully inserted ${records.length} rows.`)
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
      properties.sccid,
      properties.ko_click_id,
      properties.page_url,
      properties.country,
      properties.device_type,
      properties.browser_name
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

  const touchpoints = (touchpointRows || []).map(row => {
    const pageUrl = row[20] || null
    return {
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
      sccid:     row[18] || null,
      ko_click_id: row[19] || null,
      page_url:  pageUrl,
      derived_source: row[1] || row[6] || (row[4] ? (() => { try { return new URL(row[4]).hostname.replace('www.', '') } catch (_e) { return null } })() : null) || 'direct',
      country:   row[21] || 'unknown',
      device:    row[22] || 'unknown',
      browser:   row[23] || 'unknown',
      landing_page: parsePathname(pageUrl)
    }
  })
  
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
    pclid:          firstTp.pclid,
    sccid:          firstTp.sccid,
    ko_click_id:    firstTp.ko_click_id
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
    pclid:          lastTp.pclid,
    sccid:          lastTp.sccid,
    ko_click_id:    lastTp.ko_click_id
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
    pclid:          first30.pclid,
    sccid:          first30.sccid,
    ko_click_id:    first30.ko_click_id
  }) : null

  const record = {
    site_id: site.id,
    conversion_event_id: conversion.uuid,
    distinct_id: conversion.distinct_id,
    conversion_date: new Date(conversion.timestamp).toISOString().split('T')[0],
    conversion_timestamp: conversion.timestamp,
    conversion_type: conversion.conversion_type || null,
    conversion_value: convValue,
    external_event_id: conversion.external_event_id || null,

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
    // Store as a real jsonb object (supabase-js serializes the object into the
    // jsonb column). Previously JSON.stringify'd here, which Postgres stored as a
    // jsonb STRING scalar (jsonb_typeof='string'), so bare `->>'key'` read NULL.
    confidence_signals: {
      has_utm:          !!(firstTp.utm_source),
      has_click_id:     !!(firstTp.gclid || firstTp.fbclid),
      has_ai_source:    !!(firstTp.ai_source),
      touchpoint_count: touchpoints.length
    },
    channel_30d: channel30d,

    first_touch_country: firstTp.country || 'unknown',
    last_touch_country: lastTp.country || 'unknown',
    first_touch_device: firstTp.device || 'unknown',
    last_touch_device: lastTp.device || 'unknown',
    first_touch_browser: firstTp.browser || 'unknown',
    last_touch_browser: lastTp.browser || 'unknown',
    first_touch_landing_page: firstTp.landing_page || 'unknown',
    last_touch_landing_page: lastTp.landing_page || 'unknown'
  }

  return record
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
    sccid: tp.sccid, ko_click_id: tp.ko_click_id,
    referrer: tp.referrer, page_url: tp.page_url
  })
  const tpBase = (tp) => ({
    source: tp.utm_source || null,
    medium: tp.utm_medium || null,
    campaign: tp.utm_campaign || null,
    channel: tpCh(tp),
    timestamp: tp.timestamp,
    country: tp.country || 'unknown',
    device: tp.device || 'unknown',
    browser: tp.browser || 'unknown',
    landing_page: tp.landing_page || 'unknown'
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
// Deletes retention-governed rows older than data_retention_days for each site
// that has a retention policy set: attributed_conversions plus the GSC cache/log
// tables (gsc_performance_daily, gsc_sync_runs). Runs after attribution
// processing each night. Per-site scoped — see purgeSiteRetention.
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

      const counts = await purgeSiteRetention(supabase, site, cutoffStr)
      const siteTotal = counts.attributed_conversions + counts.gsc_performance_daily + counts.gsc_sync_runs

      if (siteTotal > 0) {
        log(`Retention purge: site ${site.site_key} — conversions:${counts.attributed_conversions} gsc_perf:${counts.gsc_performance_daily} gsc_runs:${counts.gsc_sync_runs} (>${site.data_retention_days}d old)`)
        totalPurged += siteTotal
      }
    } catch (siteErr) {
      logWarn(`Retention purge site ${site.site_key} failed: ${siteErr.message}`)
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
    // Backfill is a manual, single-site op — it must NOT write a nightly job_run
    // (health-agent/data-quality treat that as "nightly ran"). Log only.
    if (isBackfill) {
      log(`Backfill complete (${_processed} upserted)`)
      return
    }
    _writeJobRun({ status: 'success', conversions_processed: _processed, duration_ms: Date.now() - _t0 })
    _slackAlert('✅', 'Attribution Job — SUCCESS', `Processed ${_processed} conversions in ${Date.now() - _t0}ms`)
  })
  .catch(err => {
    if (isBackfill) {
      logError('Backfill failed', err)
      process.exit(1)
    }
    _writeJobRun({ status: 'failed', conversions_processed: _processed, error_message: err.message, duration_ms: Date.now() - _t0 })
    _slackAlert('🔴', 'Attribution Job — FAILED', err.message)
    process.exit(1)
  })
