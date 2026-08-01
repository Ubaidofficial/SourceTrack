import dotenv from 'dotenv'
dotenv.config()

import { getSupabase } from '../lib/supabase.js'
import { parsePathname } from '../lib/url-normalize.js'
import { queryTinybirdPipe, isTinybirdReadEnabled, isPipeReadAllowed } from '../lib/tinybird-read.js'
import { clampDays, classifyJourney, applyBackfill } from '../lib/backfill.js'
import { purgeSiteRetention } from '../lib/retention-purge.js'
import { runGscDailySync } from '../lib/gsc-daily-sync.js'
import { refreshAccessToken, fetchGscPerformance } from '../lib/google-search-console.js'
import { normalizePath } from '../lib/url-normalization.js'
import { normalizeCurrencyCode } from '../lib/currency.js'

const isReprocess = process.argv.includes('--reprocess-all') || process.argv.some(arg => arg.startsWith('--reprocess-site='));
const confirmDestructive = process.argv.includes('--confirm-destructive');
const reprocessSiteKey = process.argv.find(arg => arg.startsWith('--reprocess-site='))?.split('=')[1];

// ── Per-site historical backfill (NEW; separate from --reprocess-site) ────────
// Uses the SAME per-row upsert as nightly (onConflict site_id,conversion_event_id),
// NOT the staging-locked destructive delete+insert reprocess path. Works on prod
// but requires --confirm to write; defaults to dry-run.
const backfillSiteId = process.argv.find(arg => arg.startsWith('--backfill-site='))?.split('=')[1];
const isBackfill = !!backfillSiteId;
const backfillDays = process.argv.find(arg => arg.startsWith('--days='))?.split('=')[1];
const backfillDryRun = process.argv.includes('--dry-run');
const backfillConfirm = process.argv.includes('--confirm');

// ── D2 B1 — write-path validation (--validate-site=<key> [--validate-days=N]) ────
// Recompute attributed_conversions from the Tinybird pipe (dry-run, NO writes) and byte-diff against
// the stored rows. Read-only; never mutates any store. See runValidation / validateSite below.
const validateSiteKey = process.argv.find(arg => arg.startsWith('--validate-site='))?.split('=')[1];
const validateDays = Number(process.argv.find(arg => arg.startsWith('--validate-days='))?.split('=')[1]) || 1;

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
let _fetched = 0        // event-store rows returned across all sites
let _hardFailures = 0   // sites whose query threw (or that threw) — a real failure, not a no-op
let _fellBack = 0       // sites whose conversions read fell back (pipe returned null) — INFORMATIONAL, not policy
let _suspectEmpty = false // reads enabled but NO site pipe-served → a fetched=0 is a suspect dead read, not an empty day
let _lockAborted = false // another run held the lock: this run wrote nothing, must not claim a terminal row
const _t0 = Date.now()

const supabase = _supabase

// ── Tinybird read seam (swappable for tests) ─────────────────────────────────
// The conversion + touchpoint reads are cut over to Tinybird (all producers write
// there only, post-Wave-1/2 cutover). Both fall back to the existing HogQL path on a
// null pipe return, exactly like every other read cutover — fail-safe to the old path
// when TINYBIRD_READ_ENABLED is off. Verification is the POSITIVE served-pipe signal
// (queryTinybirdPipe logs `served pipe … rows=N`), never the absence of a fallback warning.
let _queryPipe = queryTinybirdPipe
let _tbReadEnabled = isTinybirdReadEnabled
export function __setNightlyReadDeps ({ queryPipe, tbReadEnabled } = {}) {
  if (queryPipe) _queryPipe = queryPipe
  if (tbReadEnabled) _tbReadEnabled = tbReadEnabled
}
export function __resetNightlyReadDeps () {
  _queryPipe = queryTinybirdPipe
  _tbReadEnabled = isTinybirdReadEnabled
}

// Map a nightly_conversions_by_site pipe row (named) to the EXACT positional array the
// processSite loop consumes (row[0..14]) — so the downstream mapping is byte-identical
// whether the rows came from the pipe or the HogQL fallback. row[14] is the KI-62
// original_conversion_event_id pointer, appended LAST by the pipe (purely additive).
export function mapConversionPipeRow (r) {
  return [
    r.uuid, r.distinct_id, r.timestamp, r.conversion_type, r.conversion_value,
    r.external_event_id, r.webhook_customer_id, r.stripe_subscription_id,
    r.stripe_invoice_id, r.currency, r.provider_event_id, r.occurred_at,
    r.stripe_event_type, r.provider, r.original_conversion_event_id
  ]
}

// SINGLE SOURCE OF TRUTH for the conversion row[0..14] → object mapping — shared by processSite,
// the backfill loop, and the B1 --validate harness, so they can NEVER drift. Positional order
// matches mapConversionPipeRow and the HogQL conversion SELECT exactly. original_conversion_event_id
// (row[14]) is the KI-62 refund→original pointer; '' (empty JSONExtractString) collapses to null.
export function conversionRowToObject (row) {
  return {
    uuid: row[0], distinct_id: row[1], timestamp: row[2],
    conversion_type: row[3], conversion_value: row[4], external_event_id: row[5] || null,
    webhook_customer_id: row[6] || null, stripe_subscription_id: row[7] || null,
    stripe_invoice_id: row[8] || null, currency: row[9] || null,
    provider_event_id: row[10] || null, occurred_at: row[11] || null,
    stripe_event_type: row[12] || null, provider: row[13] || null,
    original_conversion_event_id: row[14] || null
  }
}

// Map a pageviews_by_visitors pipe row (named) to the EXACT positional array the
// touchpoint mapping consumes (row[0..23]). utm_term (pipe col) is intentionally not
// in the nightly's touchpoint shape and is dropped.
export function mapTouchpointPipeRow (r) {
  return [
    r.timestamp, r.utm_source, r.utm_medium, r.utm_campaign, r.referrer, r.ai_source,
    r.gclid, r.gbraid, r.wbraid, r.fbclid, r.msclkid, r.ttclid, r.li_fat_id, r.li_fatid,
    r.twclid, r.dclid, r.snapclid, r.pclid, r.sccid, r.ko_click_id, r.page_url,
    r.country, r.device_type, r.browser_name
  ]
}

// Terminal status for the money rail. A job that materializes the money rail must NOT
// report success on a structural no-op. Rules:
//   - any hard failure (thrown event-store query / thrown site)     -> 'failed'
//   - processed 0 while the store returned rows (fetched > 0)        -> 'failed'
//   - processed 0, store returned 0, but the read SILENTLY FELL BACK to HogQL for every
//     site (suspectEmpty) -> 'failed'. Against a dead/empty store a fetched=0 is
//     INDISTINGUISHABLE from a real empty day (the #184 blind spot); the positive
//     served-pipe signal is the tell — if NO site was pipe-served while reads are
//     enabled, a 0 is SUSPECT, not an empty day.
//   - processed 0, store returned 0, and at least one site WAS pipe-served (or reads are
//     off by design) -> 'success' (a real empty day is legitimate)
//   - processed > 0                                                  -> 'success'
export function computeTerminalStatus({ processed = 0, fetched = 0, hardFailures = 0, suspectEmpty = false } = {}) {
  if (hardFailures > 0) return 'failed'
  if (processed === 0 && fetched > 0) return 'failed'
  if (processed === 0 && fetched === 0 && suspectEmpty) return 'failed'
  return 'success'
}

// Deterministic run error_message from the aggregates — exported for tests. Mirrors the branches
// computeTerminalStatus keys on, then appends the INFORMATIONAL fellBack count when non-zero, so
// job_runs records how many sites' conversions pipe returned null. `null` on a non-failed status.
// fellBack does NOT drive status (queryFailed does — computeTerminalStatus); this is visibility only.
export function computeRunErrorMessage({ status, hardFailures = 0, suspectEmpty = false, fetched = 0, fellBack = 0 } = {}) {
  const base = status !== 'failed' ? null
    : hardFailures > 0
      ? `${hardFailures} site event-store query(ies) failed — a real failure, not an empty day`
      : suspectEmpty
        ? 'Conversion read fell back to HogQL for EVERY site (Tinybird pipe never served) and returned 0 — SUSPECT dead read, not an empty day'
        : `Processed 0 conversions while the event store returned ${fetched} row(s) — nothing was written`
  return base && fellBack > 0 ? `${base} [${fellBack} site(s) fell back: conversions pipe returned null]` : base
}

// Derive the gsc-daily-sync job_runs status + error_message from the run summary and how
// many connections are stuck in 'error'/'needs_reconnect'. The old code hardcoded
// status:'success', so a fully-failed or fully-disqualified batch reported a clean success
// (prod: ~3 weeks of "success" while gsc_performance_daily was frozen). Pure — the caller
// supplies brokenCount. 'partial' IS an allowed job_runs status (job_runs_status_check).
export function deriveGscJobStatus ({ eligible = 0, failed = 0, records_synced = 0 } = {}, brokenCount = 0) {
  if (failed > 0 && records_synced === 0) {
    return { status: 'failed', error_message: `${failed}/${eligible} connection(s) failed, 0 records synced` }
  }
  if (failed > 0) {
    return { status: 'partial', error_message: `${failed}/${eligible} connection(s) failed` }
  }
  if (eligible === 0) {
    return brokenCount > 0
      ? { status: 'failed', error_message: `0 eligible; ${brokenCount} connection(s) in error/needs_reconnect` }
      : { status: 'success', error_message: 'no eligible GSC connections' }
  }
  return { status: 'success', error_message: null }
}



async function main() {
  const startTime = Date.now()
  log('Starting nightly attribution job')

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    logError('Missing required environment variables')
    throw new Error("Missing required environment variables")
  }

  // B3 step 4 — reads-disabled decision. PostHog is DECOMMISSIONED (queryPostHog is deleted), so
  // there is NO fallback read path. If Tinybird reads are off, every conversion/touchpoint read has
  // no source. REFUSE TO START loudly (option a) rather than run and silently write nothing: prod does
  // NOT set TINYBIRD_FORCE_READ, so this is the path that bites during a real incident. This guard runs
  // before the backfill dispatch and the run lock, so both cron and --backfill-site fail fast here.
  if (!_tbReadEnabled()) {
    logError('TINYBIRD_READ_ENABLED is off — the nightly has no read path (PostHog is decommissioned). Refusing to run.')
    throw new Error('TINYBIRD_READ_ENABLED is off — no read path (PostHog decommissioned); set TINYBIRD_READ_ENABLED=true')
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
      _lockAborted = true
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
    let totalFetched = 0        // rows the event store actually returned (across sites)
    let totalHardFailures = 0   // sites whose query threw, or that threw outright
    let totalServed = 0         // sites whose conversion read was PIPE-SERVED (positive signal)
    let totalFellBack = 0       // sites whose conversion read fell back (pipe returned null) — visibility only
    let cursor = 0

    async function worker() {
      while (cursor < sites.length) {
        const site = sites[cursor++]
        try {
          const result = await processSite(site)
          totalProcessed += result.processed
          totalFailed += result.failed
          totalFetched += result.fetched || 0
          if (result.queryFailed) totalHardFailures++
          if (result.served) totalServed++
          if (result.fellBack) {
            totalFellBack++       // surface the fell-back count at the RUN level (was invisible before B3 step 3)
            logWarn(`Site ${site.site_key} conversions read FELL BACK — the Tinybird pipe returned null (fail-closed; counted in the run summary)`)
          }
        } catch (error) {
          logWarn(`Site ${site.site_key} failed: ${error.message}`)
          totalFailed++
          totalHardFailures++     // an unhandled site failure is a hard failure, not a no-op
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
    log(`Completed: ${totalProcessed} conversions processed, ${totalFailed} failed, ${totalFellBack} fell back, ${duration}s`)
    _processed = totalProcessed
    _fetched = totalFetched
    _hardFailures = totalHardFailures
    _fellBack = totalFellBack
    // Dead-store guard (item 5): reads are enabled and there ARE sites, but NOT ONE was
    // pipe-served → every conversion read silently fell back to HogQL (empty PostHog). A
    // 0 here is SUSPECT, not a real empty day. (Genuine empty day: the pipe SERVES [].)
    _suspectEmpty = _tbReadEnabled() && sites.length > 0 && totalServed === 0

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
      // eligible:0 must not silently read as a clean success — a connection stuck in
      // 'error'/'needs_reconnect' fails the .eq('connected') eligibility filter, so it
      // would otherwise stay invisible here forever. Only query in that case.
      let gscBrokenCount = 0
      if (gsc.eligible === 0) {
        const { data: broken } = await supabase.from('gsc_connections')
          .select('site_key')
          .in('status', ['error', 'needs_reconnect'])
        gscBrokenCount = broken?.length || 0
      }
      const gscOutcome = deriveGscJobStatus(gsc, gscBrokenCount)
      await supabase.from('job_runs').insert({
        job_name: 'gsc-daily-sync',
        status: gscOutcome.status,
        conversions_processed: gsc.records_synced,
        error_message: gscOutcome.error_message,
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

  // Read the SAME Tinybird store the cron reads, over the backfill's OWN --days=N window. This is the
  // ONLY path that can reach a conversion older than the 24h cron window (e.g. wave1_454a720e,
  // 2026-07-09). No HogQL fallback — PostHog is decommissioned (B3 step 4).
  const { rows, served, fellBack } = await fetchBackfillConversions({ site, days })
  if (served) log(`BACKFILL: nightly_conversions_by_site SERVED ${rows.length} rows (${days}d window)`)
  if (fellBack) logWarn(`BACKFILL: nightly_conversions_by_site returned null → fell back to HogQL/PostHog (a dead store would over-report "${rows.length} found"; require the served-pipe log line)`)
  log(`Found ${rows?.length || 0} $conversion event(s) in the ${days}d window`)

  const records = []
  const journey = { complete: 0, possibly_truncated: 0, no_journey: 0 }
  for (const row of (rows || [])) {
    const conversion = conversionRowToObject(row)
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

export async function processSite(site) {
  log(`Processing site: ${site.site_key}`)

  // CONVERSION READ → Tinybird only. PostHog is decommissioned (queryPostHog deleted, B3 step 4);
  // there is no HogQL fallback. `served`/`fellBack` feed the dead-store guard (computeTerminalStatus).
  let rows = null
  let served = false
  let fellBack = false
  const usePipe = _tbReadEnabled() && !isReprocess
  if (usePipe) {
    const { from, to } = conversionPipeWindow(1) // non-reprocess cron = 24h = 1 day (usePipe excludes reprocess)
    const pipeRows = await _queryPipe('nightly_conversions_by_site', { site_id: String(site.id), date_from: from, date_to: to })
    if (pipeRows) {                       // POSITIVE served signal (non-null array), even if empty
      served = true
      rows = pipeRows.map(mapConversionPipeRow)
    } else {
      // B3 step 2 — FAIL CLOSED per-site. Post-#308 the read retries 429/5xx/network up to 3
      // attempts, so a null here means the read FAILED, not a transient blip. Do NOT fall through
      // to queryPostHog: the dead PostHog store returns [] with no throw, so this site would be
      // absorbed as an empty day — silently under-writing the money rail (the exact defect). Mark
      // the site queryFailed (→ totalHardFailures → computeTerminalStatus 'failed') WITHOUT throwing,
      // so the OTHER sites in the run still process. SHORT-CIRCUIT: no conversions were fetched, so
      // there is nothing to loop over — the per-conversion touchpoint reads are never reached.
      fellBack = true
      logWarn(`Conversion pipe read returned null (failed after retries) for site ${site.site_key} — FAIL-CLOSED per-site, not reading the dead HogQL store`)
      return { processed: 0, failed: 0, fetched: 0, queryFailed: true, served: false, fellBack: true }
    }
  }
  // B0 (D2) — FAIL CLOSED before any WRITE, and BEFORE touching the dead store. The reprocess path
  // DELETEs all of a site's attributed_conversions then re-INSERTs. It bypasses the Tinybird pipe
  // (usePipe excludes reprocess), so its read would resolve to the HogQL fallback — which post-D3 is
  // the DEAD PostHog store. Deleting/writing the money rail off a dead read would silently wipe or
  // corrupt it. Until reprocess is migrated onto Tinybird, refuse to proceed unless the conversions
  // were POSITIVELY pipe-served (served === true). A non-pipe-served reprocess read is untrusted —
  // abort loudly (the caller counts this as a hard failure) rather than read HogQL and write off it.
  if (isReprocess && !served) {
    throw new Error(`[nightly] FAIL-CLOSED: reprocess write for site ${site.site_key} would run off a NON-pipe-served read (served=${served}, fellBack=${fellBack}) — the HogQL fallback is the dead PostHog store. Refusing to delete/write the money rail off an untrusted read; migrate this read onto Tinybird first.`)
  }
  // INVARIANT (B3 step 4): with reads ENABLED a null pipe already fail-closed above; with reads
  // DISABLED main() refuses to start (no fallback — PostHog is decommissioned). So rows===null here
  // is unreachable on the cron/backfill path — throw loudly rather than silently "find no conversions"
  // (a direct call with reads off would otherwise no-op). The worker catch counts this as a hard failure.
  if (rows === null) {
    throw new Error(`[nightly] no conversions read path for site ${site.site_key} — TINYBIRD_READ_ENABLED must be on (PostHog is decommissioned)`)
  }

  if (!rows || rows.length === 0) {
    log(`No conversions found for site ${site.site_key}`)
    return { processed: 0, failed: 0, fetched: 0, queryFailed: false, served, fellBack }
  }
  
  let processed = 0
  let failed = 0
  const records = []
  
  // ── TWO PHASES. The split exists for ONE reason: the per-conversion touchpoints fetch is a
  // Tinybird round-trip, and the old single loop made them strictly sequentially — a 200-conversion
  // site paid 200 serialized round-trips. Phase 1 parallelizes ONLY that read+compute work, which
  // writes nothing. Phase 2 keeps every write sequential and in ORIGINAL ROW ORDER.
  //
  // WHY PHASE 2 MUST NOT BE PARALLELIZED: writeConversionSideEffects' subscription_identity upsert
  // is ignoreDuplicates on (site_id, stripe_customer_id) — first write wins. The pipe returns rows
  // ORDER BY timestamp ASC and the intended semantics are "the chronologically-first stitched event
  // wins". Nothing but call order enforces that, so driving these writes off compute-COMPLETION
  // order would let network jitter hand the lock to a later conversion. See
  // api/tests/nightly-conversion-concurrency.test.js, which proves it with a delayed mock.

  // Phase 1 — bounded-concurrency read+compute. Same worker-pool shape main() already uses across
  // sites (shared cursor, N workers), so there is one concurrency idiom in this file, not two.
  const CONV_CONCURRENCY = Math.max(1, Math.min(8, parseInt(process.env.NIGHTLY_CONVERSION_CONCURRENCY || '4', 10)))
  // Results are written to a FIXED INDEX, never pushed — a worker pool completes out of order, and
  // Phase 2's ordering guarantee depends on this array matching `rows` positionally.
  const computed = new Array(rows.length)
  let convCursor = 0

  async function computeWorker () {
    while (convCursor < rows.length) {
      const i = convCursor++
      const row = rows[i]
      try {
        const conversion = conversionRowToObject(row)
        // undefined here = an INVALID conversion that computeConversionRecord skipped with a bare
        // return. That is NOT a failure today (the old code fell through to the carrier/upsert
        // logic below with record===undefined and still counted processed++), so it is carried
        // through as a success with record undefined. Phase 2 reproduces that exactly.
        const res = await computeConversionRecord(site, conversion)
        computed[i] = { ok: true, conversion, record: res?.record, touchpoints: res?.touchpoints, computedOk: !!res }
      } catch (error) {
        // Identical message and bookkeeping to the old single loop's catch.
        logWarn(`Failed to process conversion ${row[0]}: ${error.message}`)
        failed++
        computed[i] = { ok: false }
      }
      // Throttle carried over from the old loop's per-conversion sleep(200). It now lives HERE
      // because Phase 1 is the only phase that touches Tinybird — Phase 2 is Supabase-only. See the
      // PR body: the original sleep had no stated rationale and predates the Tinybird cutover.
      await sleep(200)
    }
  }

  const convWorkers = Math.min(CONV_CONCURRENCY, rows.length)
  await Promise.all(Array.from({ length: convWorkers }, computeWorker))

  // Phase 2 — STRICTLY SEQUENTIAL, STRICTLY IN ORIGINAL ROW ORDER. Do not parallelize.
  for (let i = 0; i < rows.length; i++) {
    const c = computed[i]
    if (!c || !c.ok) continue   // Phase-1 failure: already logged and counted, and it must not
                                // abort or skip any OTHER conversion in the batch.
    try {
      const { conversion, record, touchpoints, computedOk } = c

      // The side-effect writes ALWAYS run in full — the subscription_identity seed (and, when
      // gated, the subscription_revenue insert) must still happen off this exact event, since the
      // checkout carrier is the only one with the client_reference_id stitch. Only the
      // attributed_conversions write below is conditionally skipped — a COUNT-only exclusion
      // (Phase 7), not a change to the money-rail write path.
      // computedOk===false means the old code returned early BEFORE both write blocks, so they are
      // skipped here too.
      if (computedOk) await writeConversionSideEffects(site, conversion, record, touchpoints)

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

    } catch (error) {
      logWarn(`Failed to process conversion ${rows[i][0]}: ${error.message}`)
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
  return { processed, failed, fetched: rows.length, queryFailed: false, served, fellBack }
}

// ClickHouse DateTime window ('YYYY-MM-DD HH:MM:SS', UTC) for the conversion pipe,
// reproducing the HogQL `timestamp >= now() - INTERVAL <days> DAY` (up to now).
// `days` is the CALLER's window: 1 for the 24h cron, or the backfill's own --days=N —
// NOT hardcoded. The upper bound carries a +1h buffer so rows at "now" fall inside the
// pipe's `< date_to`.
export function conversionPipeWindow (days) {
  const nowMs = Date.now()
  const ms = Number(days) * 24 * 3600 * 1000
  const fmt = (m) => new Date(m).toISOString().slice(0, 19).replace('T', ' ')
  return { from: fmt(nowMs - ms), to: fmt(nowMs + 3600 * 1000) }
}

// The backfill conversion read (--backfill-site + --days=N). Backfill targets ONE site
// by id — no suffix/reprocess LIKE — so the Tinybird pipe fits, over the backfill's OWN
// --days=N window (NOT the cron lookback). Returns { rows: positional[], served, fellBack }.
// Tinybird-only — PostHog is decommissioned (B3 step 4); a null pipe FAILS CLOSED (throws),
// making a silent fallback to a dead store impossible.
export async function fetchBackfillConversions ({ site, days }) {
  let rows = null
  let served = false
  let fellBack = false
  if (_tbReadEnabled()) {
    const { from, to } = conversionPipeWindow(days)
    const pipeRows = await _queryPipe('nightly_conversions_by_site', { site_id: String(site.id), date_from: from, date_to: to })
    if (pipeRows) { served = true; rows = pipeRows.map(mapConversionPipeRow) }
    else { fellBack = true }
  }
  if (fellBack) {
    // B3 step 2 — FAIL CLOSED. Post-#308 a null pipe = the read FAILED after retries. Backfill is a
    // manual, single-site op with NO worker loop and it does NOT reach totalHardFailures; throw so
    // runBackfill's own terminal catch exits non-zero (its existing failure path — no new machinery).
    throw new Error(`[backfill] FAIL-CLOSED: conversions pipe returned null (read failed after retries) for site ${site.site_key} — refusing to backfill the money rail off the dead store`)
  }
  if (rows === null) {
    // reads DISABLED (the block above was skipped) — main() refuses to start reads-off, so this is an
    // unreachable invariant on the real path; throw rather than silently report "0 found".
    throw new Error(`[backfill] no conversions read path for site ${site.site_key} — TINYBIRD_READ_ENABLED must be on (PostHog is decommissioned)`)
  }
  return { rows, served, fellBack }
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

// KI-62 Step C — the attribution DESCRIPTOR columns a refund inherits VERBATIM from the
// conversion it reverses. Identity/value/type/timestamps/external_event_id are NOT here:
// the refund keeps its OWN id + negative value + refund date (revenue nets on the refund's
// date, against the ORIGINAL's source). This is the exact set of source-bearing columns in
// the record built below — keep the two in lockstep.
// The attribution DESCRIPTOR columns. Formerly REFUND_INHERITED_FIELDS — the set a refund copied
// from its original. Refunds no longer inherit (founder decision 2026-08-01, see processConversion),
// so the same set is now the set CLEARED on a refund: exactly the columns that would otherwise
// assert a source for a reversal we deliberately do not attribute.
export const ATTRIBUTION_DESCRIPTOR_FIELDS = [
  'first_touch_source', 'first_touch_medium', 'first_touch_campaign', 'first_touch_timestamp',
  'last_touch_source', 'last_touch_medium', 'last_touch_campaign', 'last_touch_timestamp',
  'linear_attribution', 'u_shaped_attribution', 'time_decay_attribution', 'w_shaped_attribution',
  'touchpoint_count', 'first_touch_channel', 'last_touch_channel', 'channel', 'channel_30d',
  'ai_influenced_source', 'ai_influenced_session_at', 'attribution_confidence', 'confidence_signals',
  'first_touch_country', 'last_touch_country', 'first_touch_device', 'last_touch_device',
  'first_touch_browser', 'last_touch_browser', 'first_touch_landing_page', 'last_touch_landing_page'
]

// READ + COMPUTE half of the old processConversion. ZERO writes: one Tinybird touchpoints
// round-trip, then pure computation (clamp/sort/slice, calculateAttribution, channel derivation,
// confidence, dark-traffic AI stitching, refund descriptor-clearing, record assembly).
//
// WHY IT IS SPLIT OUT: processSite runs this half with BOUNDED CONCURRENCY (the network round-trip
// is the bottleneck — a 200-conversion site made 200 sequential Tinybird calls). It is safe to
// parallelize *only* because it writes nothing: the write half below is ordering-sensitive and
// stays strictly sequential. Do NOT move a write into this function — see
// writeConversionSideEffects' header for exactly what that would break.
//
// Returns { record, touchpoints }, or undefined for an invalid conversion (the same bare `return`
// the old function used — processConversion's wrapper propagates it unchanged).
export async function computeConversionRecord(site, conversion) {
  const convValue = parseFloat(conversion.conversion_value || 0)

  // A refund is a LEGITIMATE negative $conversion (Phase 2): it MUST persist to
  // attributed_conversions with its negative value so the existing Supabase SUM nets
  // Dashboard/Attribution revenue (gross − refund). All OTHER negative values remain
  // skipped as invalid. Per-source exactness is handled by KI-62 Step C below: a
  // refund's own (later) window rarely reaches the acquiring touch, so re-derived
  // attribution collapses to Direct — instead we COPY the original's attribution
  // verbatim via the original_conversion_event_id pointer (see the refund block after
  // the record is built). Unresolvable refunds stay explicitly refund_unresolved.
  if ((convValue < 0 && conversion.conversion_type !== 'refund') || !conversion.distinct_id) {
    logWarn(`Skipping invalid conversion ${conversion.uuid}`)
    return
  }

  // Per-site attribution window — default 30d if not configured, max 90d
  const windowDays = Math.min(90, Math.max(1, site.attribution_window_days || 30))

  // TOUCHPOINT READ CUTOVER → Tinybird (pageviews are Tinybird-only post-Wave-2). The
  // pipe takes a SHARED lookback_from/date_to, which is NOT equivalent to the per-
  // conversion window — so we fetch a SUPERSET for this ONE visitor and re-apply the
  // EXACT window (<= conversion.timestamp AND >= conversion.timestamp - windowDays) in
  // JS. That reproduces the HogQL query's window regardless of the pipe's `< date_to`
  // boundary. Single-element visitor_ids → the array wire-format ambiguity is moot.
  let touchpointRows = null
  if (_tbReadEnabled()) {
    const convMs = new Date(conversion.timestamp).getTime()
    const windowMs = windowDays * 24 * 3600 * 1000
    const fmt = (m) => new Date(m).toISOString().slice(0, 19).replace('T', ' ')
    const pv = await _queryPipe('pageviews_by_visitors', {
      site_id: String(site.id),
      visitor_ids: [conversion.distinct_id],           // IDENTITY: Tinybird distinct_id == conversion distinct_id (both anonymous_id)
      lookback_from: fmt(convMs - windowMs),
      date_to: fmt(convMs + 24 * 3600 * 1000),         // +1d superset; the JS clamp below is the source of truth
      page_size: 500,
      page_offset: 0
    })
    if (pv) {
      touchpointRows = pv
        .filter(r => {
          const t = new Date(r.timestamp).getTime()
          return t <= convMs && t >= convMs - windowMs  // PRESERVE the exact per-conversion window
        })
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))  // ORDER BY timestamp ASC
        .slice(0, 500)                                                   // LIMIT 500
        .map(mapTouchpointPipeRow)
    } else {
      // B3 step 3 (Half A) — FAIL CLOSED. Post-#308 a null pipe = the touchpoints read FAILED after
      // retries, not a blip. Do NOT fall through to queryPostHog: the dead PostHog store returns []
      // with no throw, so we would write the conversion with touchpoint_count:0 — AFTERWARDS
      // indistinguishable from a genuine no-touchpoint conversion (no column records read provenance;
      // Q4b). That is silent MIS-attribution, worse than a missing row. THROW so processSite's
      // per-conversion catch SKIPS this conversion (failed++, nothing written) rather than writing it
      // wrong. A served-empty [] is handled above (pv=[] → touchpointRows=[] → written normally).
      throw new Error(`[nightly] FAIL-CLOSED: touchpoints pipe returned null (read failed after retries) for conversion ${conversion.uuid} (site ${site.site_key}) — skipping, refusing to attribute off the dead HogQL store`)
    }
  }
  // INVARIANT (B3 step 4): with reads ENABLED a null touchpoints pipe already fail-closed (threw)
  // above; with reads DISABLED main() refuses to start (no fallback — PostHog is decommissioned). So
  // touchpointRows===null here is unreachable on the real path — throw rather than silently attribute
  // off zero touchpoints. (A served-empty [] is real data, handled above → written normally.)
  if (touchpointRows === null) {
    throw new Error(`[nightly] no touchpoints read path for conversion ${conversion.uuid} (site ${site.site_key}) — TINYBIRD_READ_ENABLED must be on (PostHog is decommissioned)`)
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
    // Unit for conversion_value. The pipe already returns currency (nightly_conversions_by_site
    // selects it) and conversionRowToObject already parses it — it was simply never persisted, so
    // the dashboard had a value with no unit. Normalized, and anything that is not a well-formed
    // ISO 4217 code becomes NULL rather than being written through: attributed_conversions_currency_format
    // would otherwise reject the row and fail the whole conversion on the money rail. NULL means
    // "unit unknown" and readers suppress or label it — it is never defaulted to USD.
    currency: normalizeCurrencyCode(conversion.currency),
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

  // REFUNDS ARE NEVER ATTRIBUTED TO A SOURCE (founder decision, 2026-08-01). This REPLACES
  // KI-62 Step C's inheritance, which copied the original conversion's attribution onto the
  // refund so the reversal debited the source that earned the sale.
  //
  // WHY THE REVERSAL: attribution on the original is a MODEL OUTPUT, not an observation. The
  // refund itself is a certain fact — the money came back — but which channel should absorb it
  // is exactly as uncertain as the original attribution was. Inheriting compounds one uncertain
  // credit into an equal-and-opposite uncertain DEBIT against the same channel, so a
  // mis-attributed sale becomes a mis-attributed sale AND a mis-attributed refund, and the error
  // doubles instead of cancelling. Bucketing the refund on its own line keeps the certain part
  // (site revenue nets exactly) and stops asserting the uncertain part.
  //
  // The refund's own derived attribution is discarded rather than kept, for the reason Step C
  // originally identified and which still holds: the record above was derived from the REFUND's
  // (later) window, which rarely reaches the acquiring touch, so it collapses to Direct/null.
  // Keeping it would debit 'Direct' — a source that certainly did not earn the sale. Neither
  // inheriting nor deriving is honest here; not attributing is.
  //
  // 'unattributed' is a DISTINCT marker from 'unresolved', deliberately, and they must not be
  // merged: 'unresolved' means the original could not be identified (a real data gap worth
  // chasing — no payment_intent, a subscription-mode refund, a failed lookup), while
  // 'unattributed' means the original IS known and we are choosing not to attribute against it.
  // Collapsing them would erase the diagnosable case, the same reasoning that kept 'partial'
  // separate from 'unknown' in collapseCurrencies() (#532). Read paths bucket BOTH to the
  // "Unattributed refunds" line; only the marker differs.
  //
  // The original_conversion_event_id pointer is still stamped when present — it is the audit
  // trail linking a refund to what it reverses, and stays useful even though nothing is now
  // copied across it. No lookup is performed: the pointer rides in the event's own
  // custom_properties bag (Step B), so this branch does ZERO reads.
  // The descriptor columns are CLEARED, not merely ignored. A marker in custom_properties only
  // protects readers that know to check it; every other reader — analytics.js, the Report
  // Builder, exports — sums first_touch_source directly and would have believed whatever the
  // refund's own window derived. Nulling makes the row honest at the DATA layer, so a reader
  // that has never heard of refund_attribution cannot silently debit a source. The two readers
  // that DO break revenue down by source (dashboard.js, analytics.js) route these rows to an
  // explicit "Unattributed refunds" line rather than letting a null collapse to 'Direct'.
  if (conversion.conversion_type === 'refund') {
    const pointer = conversion.original_conversion_event_id || null
    for (const field of ATTRIBUTION_DESCRIPTOR_FIELDS) record[field] = null
    record.custom_properties = {
      ...(record.custom_properties || {}),
      refund_attribution: pointer ? 'unattributed' : 'unresolved',
      ...(pointer ? { original_conversion_event_id: pointer } : {})
    }
  }

  return { record, touchpoints }
}

// WRITE half of the old processConversion — exactly the two blocks that were gated on `if (!dryRun)`,
// in the same order, with the same conditions. Nothing else.
//
// ⚠️ THIS MUST STAY SEQUENTIAL AND IN ORIGINAL ROW ORDER. The subscription_identity upsert below is
// `ignoreDuplicates: true` on (site_id, stripe_customer_id), so the FIRST write for a given customer
// wins and every later one is silently discarded. nightly_conversions_by_site returns rows ORDER BY
// timestamp ASC, and the comment above the upsert states the intended semantics: "the
// chronologically-first (ORDER BY timestamp ASC) stitched event wins". That guarantee is enforced by
// NOTHING except call order — so if these writes were parallelized, or driven by compute-completion
// order instead of row order, network jitter alone would let a LATER conversion win the lock and
// silently mis-attribute the subscription. processSite calls this strictly in `rows` order.
async function writeConversionSideEffects (site, conversion, record, touchpoints) {
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
}

// UNCHANGED PUBLIC CONTRACT. This is now a thin wrapper over the two halves above, kept so
// runBackfill() and validateSite() (dryRun:true) keep working with ZERO changes to either.
//
// `dryRun` (D2 B1 --validate) computes and RETURNS the exact attributed_conversions `record` with
// ZERO side effects — it skips the subscription_identity / subscription_revenue writes. The record
// itself is unaffected (it is built purely from the conversion + touchpoints + attribution), so the
// byte-diff harness compares the true production record shape without mutating any store.
//
// dryRun ALSO returns the touchpoints it computed from, so the harness can tally real
// same-timestamp ties (the pipe (timestamp,event_id) vs HogQL (timestamp) order divergence). The
// normal path (dryRun=false) returns the bare record. An invalid conversion returns undefined from
// computeConversionRecord and that undefined is propagated verbatim — identical to the old bare
// `return`, in BOTH modes, since the old early-return also preceded every dryRun branch.
export async function processConversion(site, conversion, { dryRun = false } = {}) {
  const computed = await computeConversionRecord(site, conversion)
  if (!computed) return
  const { record, touchpoints } = computed
  if (!dryRun) await writeConversionSideEffects(site, conversion, record, touchpoints)
  return dryRun ? { record, touchpoints } : record
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

export function calculateAttribution(touchpoints, conversionValue) {
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
    const isConversionTimeValid = !isNaN(conversionTime)

    // Check if any touchpoint has an invalid timestamp
    let hasInvalid = !isConversionTimeValid
    const tpTimes = touchpoints.map(tp => {
      const t = new Date(tp.timestamp).getTime()
      if (isNaN(t)) hasInvalid = true
      return t
    })

    const halfLifeDays = 7
    const halfLifeMs = halfLifeDays * 24 * 60 * 60 * 1000

    const rawWeights = touchpoints.map((tp, i) => {
      if (hasInvalid) {
        // Fall back to equal decay weights when valid ordering/dates cannot be computed
        return 1.0
      }
      const daysBack = Math.max(0, (conversionTime - tpTimes[i]) / halfLifeMs)
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

  const adjustReconciliation = (shares) => {
    if (!shares || shares.length === 0) return shares
    const sumOthers = shares.slice(0, -1).reduce((s, x) => s + x.attributed_value, 0)
    shares[shares.length - 1].attributed_value = parseFloat((conversionValue - sumOthers).toFixed(2))
    const fracOthers = shares.slice(0, -1).reduce((s, x) => s + x.fraction, 0)
    shares[shares.length - 1].fraction = parseFloat((1.0 - fracOthers).toFixed(4))
    return shares
  }

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
    linear:     adjustReconciliation(linear),
    u_shaped:   adjustReconciliation(u_shaped),
    time_decay: adjustReconciliation(time_decay),
    w_shaped:   adjustReconciliation(w_shaped)
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

// Auto-run the nightly job ONLY when executed directly (node api/jobs/nightly-attribution.js /
// cron), NOT when imported (unit tests importing calculateAttribution). Standard ESM idiom; no
// change to production run behavior. Required so the reconciliation unit test can import this module.
// ── D2 B1 — byte-identical write-path validation (--validate-site) ──────────────────────────────
// Recompute each conversion's attributed_conversions record FROM THE TINYBIRD PIPE (dry-run, no
// writes) and diff it against the row currently STORED in Supabase (written historically by the HogQL
// path). Byte-identical bar: EXACT equality on the money rail — conversion_value + the four jsonb
// credit splits — with NO tolerance, and ORDER-SENSITIVE on the splits (a touchpoint reorder, e.g. the
// same-timestamp tie-break divergence where the pipe orders by (timestamp, event_id) but HogQL by
// timestamp only, IS a mismatch — the exact class an aggregate check can never catch).

const _JSONB_RECORD_FIELDS = new Set([
  'linear_attribution', 'u_shaped_attribution', 'time_decay_attribution', 'w_shaped_attribution', 'confidence_signals'
])

// Timestamp columns are compared as INSTANTS, never as serialized strings. Postgres timestamptz
// renders "…+00:00" while the freshly-computed value (JS toISOString) renders "…Z" — the SAME instant,
// different text. A string compare flags every row (proven: 3/3 --validate rows mismatched on exactly
// these fields, money/splits clean). ALL FOUR timestamp fields are included — ai_influenced_session_at
// was null in the sample but would false-mismatch on any AI-influenced row. This does NOT relax
// conversion_value or the jsonb credit splits (those stay exact — a real instant difference, including a
// same-timestamp tie surfacing via *_source, is still flagged).
const _TIMESTAMP_RECORD_FIELDS = new Set([
  'conversion_timestamp', 'first_touch_timestamp', 'last_touch_timestamp', 'ai_influenced_session_at'
])

// Recursively sort object keys (Postgres jsonb does NOT preserve object key order) but PRESERVE
// array order (the credit splits are ordered by touchpoint — order is semantic, not incidental).
function _normalizeJson (v) {
  if (Array.isArray(v)) return v.map(_normalizeJson)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = _normalizeJson(v[k])
    return out
  }
  return v
}
// Instant equality: null-safe, then epoch-ms compare so "+00:00" and "Z" (same instant) are equal.
// Falls back to raw compare if either value is unparseable (a genuinely malformed timestamp still diffs).
function _timestampInstantEqual (c, s) {
  if ((c ?? null) === null || (s ?? null) === null) return (c ?? null) === (s ?? null)
  const tc = new Date(c).getTime()
  const ts = new Date(s).getTime()
  if (Number.isNaN(tc) || Number.isNaN(ts)) return (c ?? null) === (s ?? null)
  return tc === ts
}
function _recordFieldEqual (key, c, s) {
  if (_JSONB_RECORD_FIELDS.has(key)) return JSON.stringify(_normalizeJson(c ?? null)) === JSON.stringify(_normalizeJson(s ?? null))
  if (_TIMESTAMP_RECORD_FIELDS.has(key)) return _timestampInstantEqual(c, s) // instant, not string (Z vs +00:00)
  if (key === 'conversion_value') return Number(c) === Number(s) // MONEY: exact, no tolerance
  return (c ?? null) === (s ?? null)
}

// Returns [{ field, computed, stored }] for every field of the freshly-computed record that differs
// from the stored row. Empty = byte-identical for the fields the nightly writes. DB-only columns
// (id/created_at/updated_at/…) are ignored — they are not keys of `computed`.
export function diffAttributedConversionRecord (computed, stored) {
  const mismatches = []
  for (const key of Object.keys(computed)) {
    if (key === 'processing_version') continue // build metadata, not attribution truth
    if (!_recordFieldEqual(key, computed[key], stored?.[key])) {
      mismatches.push({ field: key, computed: computed[key], stored: stored?.[key] ?? null })
    }
  }
  return mismatches
}

// Driver — PIPE-SERVED conversions only (fail closed; never validate off the dead HogQL store).
export async function validateSite (site, { days = 1 } = {}) {
  const { from, to } = conversionPipeWindow(days)
  const pipeRows = await _queryPipe('nightly_conversions_by_site', { site_id: String(site.id), date_from: from, date_to: to })
  if (pipeRows === null) {
    // A wrong site_id returns [] (0 rows), NOT null — so a null is a READ-LAYER condition, never the
    // site param. Name the exact cause so the operator fixes env, not chases a phantom param bug.
    const reason = !_tbReadEnabled()
      ? 'TINYBIRD_READ_ENABLED is off'
      : !isPipeReadAllowed('nightly_conversions_by_site')
        ? 'nightly_conversions_by_site is NOT in the TINYBIRD_READ_PIPES allowlist — unset TINYBIRD_READ_PIPES, or add this pipe (a direct MCP/SQL query bypasses this allowlist, which is why it works there but returns null here)'
        : 'the pipe fetch returned null — missing TINYBIRD_HOST/TINYBIRD_READ_TOKEN, a non-2xx from Tinybird, or a network error (see the [tinybird-read] warning above)'
    throw new Error(`[validate] conversions pipe returned null for site ${site.site_key} (site_id=${site.id}) — ${reason}. NOT a site_id/site_key param bug (a wrong id → [] , not null).`)
  }
  const out = { site: site.site_key, total: 0, matched: 0, missing: [], mismatched: [], realTies: 0 }
  for (const row of pipeRows) {
    const conversion = conversionRowToObject(mapConversionPipeRow(row))
    if (isSubscriptionCheckoutCarrier(conversion)) continue // $0 carrier is never written to attributed_conversions
    const res = await processConversion(site, conversion, { dryRun: true })
    const { record: computed, touchpoints } = res
    out.total++
    // Tally REAL same-timestamp ties: ≥2 touchpoints sharing a timestamp for this conversion. This is
    // the ONLY input shape where the pipe's (timestamp, event_id) order can diverge from HogQL's
    // timestamp-only order. realTies=0 across the run means the tie path is only synthetically covered.
    const tsList = touchpoints.map(t => t.timestamp)
    if (tsList.length !== new Set(tsList).size) out.realTies++
    const { data: stored, error } = await supabase
      .from('attributed_conversions').select('*')
      .eq('site_id', site.id).eq('conversion_event_id', conversion.uuid).maybeSingle()
    if (error) throw new Error(`[validate] stored-row read failed for ${conversion.uuid}: ${error.message}`)
    if (!stored) { out.missing.push(conversion.uuid); continue }
    const diffs = diffAttributedConversionRecord(computed, stored)
    if (diffs.length === 0) out.matched++
    else out.mismatched.push({ conversion_event_id: conversion.uuid, diffs })
  }
  return out
}

async function runValidation (idOrKey) {
  // Accept EITHER the site_key OR the Supabase site.id. The id is the natural identifier operators
  // have — it is what events.site_id / attributed_conversions.site_id carry — so resolving by key
  // first, then id, removes the "I pasted the site_id and got 'not found'" friction.
  let { data: site } = await supabase.from('sites').select('*').eq('site_key', idOrKey).maybeSingle()
  if (!site) { site = (await supabase.from('sites').select('*').eq('id', idOrKey).maybeSingle()).data }
  if (!site) { console.error(`[validate] site not found by site_key OR id: ${idOrKey}`); process.exit(2) }
  const r = await validateSite(site, { days: validateDays })
  console.log(`[validate] site=${r.site} total=${r.total} matched=${r.matched} mismatched=${r.mismatched.length} missing=${r.missing.length} realTies=${r.realTies}`)
  // `missing` = a pipe-served conversion (source event present) with NO attributed_conversions row —
  // the nightly hasn't written it (or the row was deleted). This is a "cannot compare", NOT a parity
  // failure: it is reported explicitly but does NOT flip pass/fail. Only `mismatched` (a real byte
  // divergence on a row that DOES exist) fails. realTies = conversions with ≥2 same-timestamp
  // touchpoints — the only shape where the pipe/HogQL read order can diverge; 0 = tie path is only
  // synthetically covered by nightly-validate-harness.test.js.
  for (const m of r.mismatched) {
    console.error(`  MISMATCH ${m.conversion_event_id}:`)
    for (const d of m.diffs) console.error(`    ${d.field}: computed=${JSON.stringify(d.computed)} stored=${JSON.stringify(d.stored)}`)
  }
  if (r.missing.length) console.log(`  (info) ${r.missing.length} pipe-served conversion(s) have no stored row — NOT a parity failure: ${r.missing.join(', ')}`)
  if (r.mismatched.length) { console.error(`[validate] FAILED — ${r.mismatched.length} row(s) NOT byte-identical`); process.exit(1) }
  console.log(`[validate] OK — byte-identical for all ${r.matched} compared row(s) (missing=${r.missing.length}, realTies=${r.realTies})`)
}

if (import.meta.url === `file://${process.argv[1]}` && validateSiteKey) {
  runValidation(validateSiteKey).catch(err => { console.error(`[validate] ${err.message}`); process.exit(1) })
} else if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => {
      // Backfill is a manual, single-site op — it must NOT write a nightly job_run
      // (health-agent/data-quality treat that as "nightly ran"). Log only.
      if (isBackfill) {
        log(`Backfill complete (${_processed} upserted)`)
        return
      }
      // Another run held the lock — this run did nothing and must NOT write a terminal
      // row (the in-flight run owns the outcome).
      if (_lockAborted) {
        log('Aborted: another nightly run in progress — no terminal job_run written')
        return
      }
      // Honest terminal status — a money-rail job cannot report success on a structural
      // no-op (a swallowed outage). See computeTerminalStatus.
      const status = computeTerminalStatus({ processed: _processed, fetched: _fetched, hardFailures: _hardFailures, suspectEmpty: _suspectEmpty })
      const dur = Date.now() - _t0
      const errMsg = computeRunErrorMessage({ status, hardFailures: _hardFailures, suspectEmpty: _suspectEmpty, fetched: _fetched, fellBack: _fellBack })
      _writeJobRun({ status, conversions_processed: _processed, error_message: errMsg, duration_ms: dur })
      if (status === 'success') {
        _slackAlert('✅', 'Attribution Job — SUCCESS', `Processed ${_processed} conversions in ${dur}ms`)
      } else {
        _slackAlert('🔴', 'Attribution Job — FAILED', errMsg)
      }
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
}
