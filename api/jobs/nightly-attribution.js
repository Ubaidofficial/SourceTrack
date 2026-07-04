import dotenv from 'dotenv'
dotenv.config()

import { getSupabase } from '../lib/supabase.js'
import { esc } from '../lib/utils.js'
import { clampDays, classifyJourney, applyBackfill } from '../lib/backfill.js'
import { purgeSiteRetention } from '../lib/retention-purge.js'
import { runGscDailySync } from '../lib/gsc-daily-sync.js'
import { refreshAccessToken, fetchGscPerformance } from '../lib/google-search-console.js'
import { normalizePath } from '../lib/url-normalization.js'

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
// Shared attribution allocation model — single source of truth with the live read path
import { calculateAttribution } from '../lib/attribution-model.js'
import { buildSubscriptionIdentitySeed, isSubscriptionCheckoutCarrier } from '../lib/stripe-subscription.js'

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

    // GSC daily auto-sync (piggybacks this cron — option (a); no new Railway
    // service). Fully isolated: its own job_runs row + try/catch so a GSC failure
    // can NEVER mark the attribution run failed. Per-connection isolation lives
    // inside runGscDailySync.
    try {
      const gscStart = Date.now()
      const gsc = await runGscDailySync({
        supabase, refreshAccessToken, fetchGscPerformance, normalizePath, sleep, log
      })
      await supabase.from('job_runs').insert({
        job_name: 'gsc-daily-sync',
        status: 'success',
        conversions_processed: gsc.records_synced,
        error_message: gsc.failed > 0 ? `${gsc.failed}/${gsc.eligible} connections failed` : null,
        duration_ms: Date.now() - gscStart,
        ran_at: new Date().toISOString()
      })
    } catch (gscErr) {
      logWarn(`GSC daily sync failed (non-fatal): ${gscErr.message}`)
      try {
        await supabase.from('job_runs').insert({
          job_name: 'gsc-daily-sync',
          status: 'failed',
          conversions_processed: 0,
          error_message: gscErr.message,
          duration_ms: 0,
          ran_at: new Date().toISOString()
        })
      } catch (_) { /* best-effort logging only */ }
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
    SELECT uuid, distinct_id, timestamp, properties.conversion_type, properties.conversion_value, properties.external_event_id, properties.webhook_customer_id, properties.stripe_subscription_id, properties.stripe_invoice_id, properties.currency, properties.provider_event_id, properties.occurred_at, properties.stripe_event_type, properties.provider
    FROM events
    WHERE event = '$conversion'
      AND properties.site_id = '${esc(site.id)}'
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
      conversion_type: row[3], conversion_value: row[4], external_event_id: row[5] || null,
      webhook_customer_id: row[6] || null, stripe_subscription_id: row[7] || null,
      stripe_invoice_id: row[8] || null, currency: row[9] || null,
      provider_event_id: row[10] || null, occurred_at: row[11] || null,
      stripe_event_type: row[12] || null, provider: row[13] || null
    }
    if (!conversion.uuid || !conversion.distinct_id || !conversion.timestamp) {
      logWarn(`Skipping invalid conversion ${conversion.uuid}`)
      continue
    }
    const record = await processConversion(site, conversion)
    if (isSubscriptionCheckoutCarrier(conversion)) {
      log(`Skipping backfill record for subscription-checkout $0 carrier ${conversion.uuid}`)
    } else {
      records.push(record)
      journey[classifyJourney(record, conversion.timestamp, attrWindowDays)]++
    }
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
    suffixFilterClause = `AND distinct_id LIKE '%${esc(reprocessSuffixFilter)}'`
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
      properties.external_event_id,
      properties.webhook_customer_id,
      properties.stripe_subscription_id,
      properties.stripe_invoice_id,
      properties.currency,
      properties.provider_event_id,
      properties.occurred_at,
      properties.stripe_event_type,
      properties.provider
    FROM events
    WHERE event = '$conversion'
      AND properties.site_id = '${esc(site.id)}'
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
        external_event_id: row[5] || null,
        webhook_customer_id: row[6] || null,
        stripe_subscription_id: row[7] || null,
        stripe_invoice_id: row[8] || null,
        currency: row[9] || null,
        provider_event_id: row[10] || null,
        occurred_at: row[11] || null,
        stripe_event_type: row[12] || null,
        provider: row[13] || null
      }

      // processConversion() ALWAYS runs in full — the subscription_identity seed
      // (and, when gated, subscription_revenue insert) must still happen off this
      // exact event, since the checkout carrier is the only one with the
      // client_reference_id stitch. Only the attributed_conversions write below is
      // conditionally skipped — this is a COUNT-only exclusion (Phase 7), not a
      // change to the money-rail write path.
      const record = await processConversion(site, conversion)
      const isCarrier = isSubscriptionCheckoutCarrier(conversion)
      if (isCarrier) {
        log(`Skipping attributed_conversions write for subscription-checkout $0 carrier ${conversion.uuid} (site ${site.site_key})`)
      } else if (isReprocess) {
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

  // Step 3: source backfill sweep — flip subscription_revenue rows from
  // 'unknown'→resolved when the matching subscription_identity is now 'resolved'.
  await backfillSubscriptionRevenueSource(site)

  log(`Site ${site.site_key}: ${processed} processed, ${failed} failed`)
  return { processed, failed }
}

// Guarded source backfill for subscription_revenue: the ONLY path that can
// change a revenue row's source after insert. Updates rows that are currently
// attribution_status='unknown' to the now-resolved subscription_identity source;
// the .eq('attribution_status','unknown') filter preserves acquisition-lock by
// never touching already-resolved rows. Non-fatal.
//
// TODO(perf, follow-up): this re-scans EVERY permanently-unknown row every night
// — customers whose acquisition never resolves stay in the unknown set forever,
// so the per-night cost grows unbounded with churned/unattributable subscriptions.
// Fine at current volume (~0 subscriptions). Intended bound: only sweep identities
// that became 'resolved' since the last run (e.g. filter subscription_identity by
// source_locked_at > last_run_at), so the work is proportional to NEW resolutions,
// not the cumulative unknown backlog.
async function backfillSubscriptionRevenueSource(site) {
  try {
    const { data: unknownRows, error: selErr } = await supabase
      .from('subscription_revenue')
      .select('stripe_customer_id')
      .eq('site_id', site.id)
      .eq('attribution_status', 'unknown')
    if (selErr) { logWarn(`subscription_revenue backfill select failed for site ${site.site_key}: ${selErr.message}`); return }
    if (!unknownRows?.length) return

    const customerIds = [...new Set(unknownRows.map(r => r.stripe_customer_id).filter(Boolean))]
    for (const customerId of customerIds) {
      const { data: identity } = await supabase
        .from('subscription_identity')
        .select('first_touch_source, first_touch_channel, attribution_status')
        .eq('site_id', site.id)
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      if (identity?.attribution_status !== 'resolved') continue
      const { error: updErr } = await supabase
        .from('subscription_revenue')
        .update({
          first_touch_source:  identity.first_touch_source,
          first_touch_channel: identity.first_touch_channel,
          attribution_status:  'resolved'
        })
        .eq('site_id', site.id)
        .eq('stripe_customer_id', customerId)
        .eq('attribution_status', 'unknown')   // acquisition-lock: never overwrite resolved rows
      if (updErr) logWarn(`subscription_revenue backfill update failed for site ${site.site_key}: ${updErr.message}`)
    }
  } catch (err) {
    logWarn(`subscription_revenue backfill threw for site ${site.site_key}: ${err.message}`)
  }
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
      AND distinct_id = '${esc(conversion.distinct_id)}'
      AND properties.site_id = '${esc(site.id)}'
      AND timestamp <= toDateTime('${esc(conversion.timestamp)}')
      AND timestamp >= toDateTime('${esc(conversion.timestamp)}') - INTERVAL ${windowDays} DAY
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

  // Dark-traffic stitching (Feature 1): when the converting (last) touch is
  // Direct but the journey contains a prior AI Search touchpoint, surface that
  // AI session deterministically — never inferred, never LLM. Source preference:
  // the first-touch source when first touch was AI Search (it carries the real
  // domain, e.g. 'chat.openai.com'); otherwise the AI touchpoint's own source,
  // falling back to the channel name 'AI Search' (the JSONB touchpoint stores
  // channel='AI Search' but source=null, so the fallback is the common case).
  const firstTouchSource = attribution.first_touch?.source || attribution.first_touch?.derived_source || null
  let aiInfluencedSource = null
  let aiInfluencedSessionAt = null
  if (lastTouchChannel === 'Direct') {
    const aiTouch = (attribution.linear || []).find(tp => tp.channel === 'AI Search')
    if (aiTouch && aiTouch.timestamp) {
      aiInfluencedSource = (firstTouchChannel === 'AI Search' && firstTouchSource)
        ? firstTouchSource
        : (aiTouch.source || 'AI Search')
      aiInfluencedSessionAt = aiTouch.timestamp
    }
  }

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

    first_touch_source: firstTouchSource,
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
    ai_influenced_source:     aiInfluencedSource,
    ai_influenced_session_at: aiInfluencedSessionAt,
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

  // Step 2: acquisition-locked subscription→source link. Phase 5c: SEED on stripe
  // customer_id ALONE, so a subscription-mode checkout ($0 carrier — customer_id +
  // client_reference_id stitch) seeds and lets the surviving invoice.paid
  // self-resolve via the backfill. As of Phase 7 the carrier also carries its own
  // stripe_subscription_id (forwarded from Stripe's session.subscription — see
  // isSubscriptionCheckoutCarrier), so first_subscription_id is populated at seed
  // time instead of null; that's a write-once, never-read-back field (see
  // isSubscriptionCheckoutCarrier's doc comment), so it changes nothing here.
  // STITCHED-ONLY (no-downgrade): the helper returns null for an unstitched
  // conversion, so it never locks an 'unknown' row that would block a later
  // self-stitching invoice.paid. Write-once: the chronologically-first
  // (ORDER BY timestamp ASC) stitched event wins via the ignoreDuplicates upsert.
  const seedRow = buildSubscriptionIdentitySeed({ conversion, touchpoints, record })
  if (seedRow) {
    await upsertSubscriptionIdentity(site, seedRow)
  }

  // Step 3: write the lifecycle/revenue row — gated on a subscription id PLUS an
  // explicit carrier exclusion. Before Phase 7, "no stripe_subscription_id" was
  // enough to exclude the checkout event on its own (the checkout handler never
  // set that field). Phase 7 forwards Stripe's session.subscription onto the
  // carrier too (see isSubscriptionCheckoutCarrier), so the carrier now HAS a
  // stripe_subscription_id — without the explicit exclusion below, this gate
  // would also fire for the checkout event, attempting to insert
  // event_type: 'purchase' into subscription_revenue, which is schema-constrained
  // to ('subscription','renewal','trial_start','trial_converted','churn') and
  // would fail the DB CHECK constraint on every subscription signup (caught
  // non-fatally by insertSubscriptionRevenue's own error handling, but never
  // intended to fire at all). isSubscriptionCheckoutCarrier is the same
  // discriminator used by Path A/B's count-exclusion fixes — DO NOT remove this
  // exclusion or swap it for a stripe_invoice_id check: trial_start/
  // trial_converted/churn funnel events legitimately have stripe_subscription_id
  // but no stripe_invoice_id, and must still reach this insert.
  if (conversion.webhook_customer_id && conversion.stripe_subscription_id && !isSubscriptionCheckoutCarrier(conversion)) {
    await insertSubscriptionRevenue(site, conversion)
  }

  return record
}

// Write one subscription_revenue row per subscription lifecycle event, with the
// acquisition source denormalized from subscription_identity. ON CONFLICT
// (site_id, dedup_key) DO NOTHING — amount is write-once; the backfill sweep is
// the only path that later changes a row. Non-fatal (must not break attribution).
async function insertSubscriptionRevenue(site, conversion) {
  try {
    // Denormalize the acquisition source from subscription_identity (just upserted
    // for the acquisition event, or pre-existing for renewals). DO NOTHING insert
    // wins on conflict so amount is write-once; the source-only backfill sweep is
    // the only path that can later change a row.
    const { data: identity } = await supabase
      .from('subscription_identity')
      .select('first_touch_source, first_touch_channel, attribution_status')
      .eq('site_id', site.id)
      .eq('stripe_customer_id', conversion.webhook_customer_id)
      .maybeSingle()

    const eventType = conversion.conversion_type
    // dedup_key mirrors stripe-subscription.js buildSubscriptionIdempotencyKeys:
    // invoice_id for revenue events; subscription_id:type for funnel events.
    const dedupKey = conversion.stripe_invoice_id
      ? conversion.stripe_invoice_id
      : `${conversion.stripe_subscription_id}:${eventType}`

    const { error } = await supabase
      .from('subscription_revenue')
      .upsert({
        site_id:                site.id,
        stripe_customer_id:     conversion.webhook_customer_id,
        stripe_subscription_id: conversion.stripe_subscription_id,
        invoice_id:             conversion.stripe_invoice_id || null,
        event_type:             eventType,
        amount:                 Number(conversion.conversion_value) || 0,
        currency:               conversion.currency || 'USD',
        first_touch_source:     identity?.attribution_status === 'resolved' ? identity.first_touch_source : null,
        first_touch_channel:    identity?.attribution_status === 'resolved' ? identity.first_touch_channel : null,
        attribution_status:     identity?.attribution_status === 'resolved' ? 'resolved' : 'unknown',
        provider_event_id:      conversion.provider_event_id || null,
        source_conversion_id:   conversion.uuid || null,
        occurred_at:            conversion.occurred_at || conversion.timestamp,
        dedup_key:              dedupKey
      }, { onConflict: 'site_id,dedup_key', ignoreDuplicates: true })
    if (error) logWarn(`subscription_revenue insert failed for site ${site.site_key}: ${error.message}`)
  } catch (err) {
    logWarn(`subscription_revenue insert threw for site ${site.site_key}: ${err.message}`)
  }
}

// Acquisition-locked upsert into subscription_identity. ignoreDuplicates →
// INSERT … ON CONFLICT (site_id, stripe_customer_id) DO NOTHING, so the first
// write (the acquisition event) wins and renewals never clobber it. Non-fatal:
// a failure here must not break attribution of the conversion itself.
async function upsertSubscriptionIdentity(site, row) {
  try {
    const { error } = await supabase
      .from('subscription_identity')
      .upsert(
        { site_id: site.id, source_locked_at: new Date().toISOString(), ...row },
        { onConflict: 'site_id,stripe_customer_id', ignoreDuplicates: true }
      )
    if (error) logWarn(`subscription_identity upsert failed for site ${site.site_key}: ${error.message}`)
  } catch (err) {
    logWarn(`subscription_identity upsert threw for site ${site.site_key}: ${err.message}`)
  }
}

// calculateAttribution moved to ../lib/attribution-model.js (single source of truth,
// shared with the live read path). Imported at the top of this file. The prior local
// copy (with the Level-1+ reconciliation + time_decay NaN-guard) is now the shared one.

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
      const siteTotal = counts.attributed_conversions + counts.gsc_performance_daily + counts.gsc_sync_runs + (counts.capi_deliveries || 0) + (counts.custom_events || 0)

      if (siteTotal > 0) {
        log(`Retention purge: site ${site.site_key} — conversions:${counts.attributed_conversions} gsc_perf:${counts.gsc_performance_daily} gsc_runs:${counts.gsc_sync_runs} capi:${counts.capi_deliveries || 0} custom:${counts.custom_events || 0} (>${site.data_retention_days}d old)`)
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
