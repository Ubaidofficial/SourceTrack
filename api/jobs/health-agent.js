import 'dotenv/config'
import WebSocket from 'ws'
import { getSupabase } from '../lib/supabase.js'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'
import { fetchQuarantineSummary, classifyQuarantine } from '../lib/quarantine-alarm.js'

const SLACK = process.env.SLACK_WEBHOOK_URL
const API_URL = process.env.API_URL || 'http://localhost:3000'

// ═══ ⚠️ THIS MONITOR'S OWN LIVENESS IS UNMONITORABLE. Recorded 2026-08-06. ═══
//
// It WRITES NOTHING, ANYWHERE. Every database call here is a .select() — sites (:49,
// :176), job_runs (:220), sites count (:232), attributed_conversions count (:249). There
// is no effect table, so there is no way to ask the database whether this job has ever
// run. Its zero row-count in job_runs is not evidence of anything.
//
// Its only outputs are console.log and a Slack webhook, and the webhook stays SILENT
// unless SLACK_WEBHOOK_URL is configured AND severity is already non-ok (:311). A healthy
// run is indistinguishable from a run that never happened.
//
// That is a monitor whose purpose is catching silent failure, failing silently.
//
// ⚠️ AND ITS COVERAGE IS INCOMPLETE BY THE SAME MECHANISM IT EXISTS TO CATCH. The
// liveness check at :113 ("No job runs found in job_runs table") judges the system by
// READING job_runs — but three jobs never write there: this one, proxy-domain-recheck,
// and data-quality-check. So this monitor cannot see the silent failure of a job that is
// invisible to its only data source. See api/lib/job-runs.js for the full list and for
// how a substring grep got that wrong once already.
//
// NOT FIXED HERE — giving this job an observable output is its own change, deliberately
// not bundled with the proxy-verification work. The open question a fix must answer is
// what makes an output prove the RUN happened rather than merely that the PROCESS
// STARTED: a row written at entry proves boot, not completion, and a row written only on
// failure reproduces the current silence.
//
// Checks that failing immediately classify the whole system as critical.
// Everything else is warning-level. The money-rail business-logic checks
// (nightly_job, conversions) are CRITICAL: a job that "succeeds" while processing
// nothing must be able to turn this monitor red.
// `posthog` was RETIRED (D2): it probed the PostHog query API. PostHog is now fully
// decommissioned (D5 done — POSTHOG_* stripped from Railway, project deleted), so a
// posthog check would alarm 🔴 on every run forever with nothing to reach. Exported so
// a test can assert `posthog` is no longer a critical check.
// `erasure_resweep` is CRITICAL by decision, not by default: a stuck re-sweep means a subject who
// exercised Art. 17 is still unprotected, which is the exact state the suppression work exists to
// close. Same tier as the money-rail checks — a compliance failure is not a warning.
export const CRITICAL_CHECKS = new Set(['supabase', 'nightly_job', 'conversions', 'tinybird_quarantine', 'erasure_resweep'])

// Required env for the monitor to function. POSTHOG_* were removed (D2): no check reads
// them anymore (the posthog liveness check is deleted and data_flow reads Tinybird).
// Exported so a test can assert POSTHOG_* is no longer required.
export const REQUIRED_ENV_VARS = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']

// Sum recent $conversion rows across the monitored sites via the SAME pipe + token the
// nightly reads (nightly_conversions_by_site) — so the monitor can NEVER measure a
// different store than the thing it monitors. Returns a number, or null when NOT ONE
// site was pipe-served (store unreachable → "unknown"; the evaluators do not assert the
// silent-zero rule on null, and the `supabase`/`data_flow` checks cover reachability).
// Exported + dependency-injected so a test can assert it hits nightly_conversions_by_site.
export async function sumStoreConversions({ sites, queryPipe, date_from, date_to }) {
  let total = 0
  let served = 0
  for (const s of sites) {
    const rows = await queryPipe('nightly_conversions_by_site', { site_id: String(s.id), date_from, date_to })
    if (rows) { served++; total += rows.length }
  }
  return served === 0 ? null : total
}

// The SAME site set the nightly attends to (nightly-attribution.js:218-227): paid plan,
// active in the last 7 days OR never-seen. Single source so the monitor and the nightly
// can never drift onto different site sets. Returns [] (never null).
async function getMonitoredSites(supabase) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data: sites } = await supabase.from('sites')
    .select('id')
    .not('plan', 'in', '(free,inactive,archived)')
    .or(`last_seen_at.gte.${sevenDaysAgo},last_seen_at.is.null`)
  return sites || []
}

// Data-flow canary ("is tracking working at all?"). Fans out the events_health_day pipe
// over the monitored sites and aggregates. SEMANTIC CHANGE (D2): the retired PostHog check
// counted `$pageview`s in the last 24h GLOBALLY; events_health_day counts ANY event in the
// last 24h PER SITE (no exact-parity pipe exists; authoring one is a founder-gated deploy).
// So this now reads "any tracked event", not "pageviews", and fans out instead of one global
// query — see KNOWN_ISSUES. Alarm semantics preserved from the old global count===0 check:
//   • zero qualifying sites            → { _status: 'skipped' }  (explicit, NOT a silent pass)
//   • ANY site's pipe read FAILS (null) → throw → check() reports status 'error'
//   • ALL qualifying sites 0 events    → { _status: 'warning' }  (analog of global count===0)
//   • otherwise                        → ok, with the aggregate event count
// Exported + dependency-injected (sites + queryPipe) so it is unit-testable, token-free.
export async function evaluateDataFlow({ sites, queryPipe }) {
  if (!sites || sites.length === 0) {
    return { _status: 'skipped', reason: 'no qualifying sites', sites_checked: 0 }
  }
  let total = 0
  for (const s of sites) {
    const rows = await queryPipe('events_health_day', { site_id: String(s.id) })
    if (rows === null) throw new Error(`events_health_day read failed for site ${s.id}`)
    total += Number(rows?.[0]?.cnt) || 0
  }
  if (total === 0) {
    return { _status: 'warning', events_24h: 0, sites_checked: sites.length, warning: 'Zero tracked events across all monitored sites in last 24h — verify tracker is installed' }
  }
  return { events_24h: total, sites_checked: sites.length }
}

// Count $conversion events the SAME Tinybird store the nightly reads received in the
// last 48h. Deterministic; no LLM; never throws.
async function storeConversionCount() {
  try {
    const sites = await getMonitoredSites(getSupabase())
    if (sites.length === 0) return 0
    const now = Date.now()
    const fmt = (m) => new Date(m).toISOString().slice(0, 19).replace('T', ' ')
    return await sumStoreConversions({
      sites, queryPipe: queryTinybirdPipe,
      date_from: fmt(now - 48 * 3600 * 1000), date_to: fmt(now + 3600 * 1000)
    })
  } catch {
    return null
  }
}

// Pure assertion: is the nightly attribution RUN healthy? CRITICAL on no run, a
// non-success status, or staleness. Exported for tests.
//
// Deliberately does NOT assert a "silent zero" (processed 0 while the store has recent
// conversions): that compared a PER-RUN count (run.conversions_processed) against a
// ROLLING 48h count (storeConversions), so a normal "nothing new to attribute" run went
// CRITICAL whenever the 48h window still held conversions an EARLIER run had already
// attributed — a false positive that crash-looped the health cron in prod (2026-07-16:
// nightly_job ❌ "processed 0 but store has 2" while conversions ✅ attributed=2/store=2).
// The real silent-failure signal is the OUTCOME, which evaluateConversions already
// asserts (attributed 0 while store > 0) and which is likewise a CRITICAL_CHECK.
// Separation of concerns: nightly_job = run health; conversions = outcome.
export function evaluateNightlyJob({ run, now = Date.now(), maxAgeHours = 26 }) {
  if (!run) return { critical: true, reason: 'No job runs found in job_runs table' }
  if (run.status !== 'success') return { critical: true, reason: `Last run status='${run.status}': ${run.error_message || 'no detail'}` }
  const hoursAgo = (now - new Date(run.ran_at).getTime()) / 3_600_000
  if (hoursAgo > maxAgeHours) return { critical: true, reason: `Last run was ${Math.round(hoursAgo)}h ago (> ${maxAgeHours}h) — stale` }
  return { critical: false, hoursAgo: Math.round(hoursAgo) }
}

// Pure assertion: are attributed_conversions actually landing? CRITICAL when zero in
// 48h while the store has recent conversions to attribute. Exported for tests.
export function evaluateConversions({ attributed48h = 0, storeConversions = null }) {
  if ((attributed48h ?? 0) === 0 && typeof storeConversions === 'number' && storeConversions > 0) {
    return { critical: true, reason: `0 attributed conversions in 48h but the event store has ${storeConversions} recent conversion(s)` }
  }
  return { critical: false }
}

// Tinybird conversion-quarantine alarm body (SCOPE_v3 §11). Exported + dependency-
// injected — like evaluateNightlyJob/evaluateConversions — so it is unit-testable
// without a live Tinybird (stub fetchSummary / classify; token-free, no network).
// Returns the same { _status?, ...rest } shape check() consumes, or throws on critical.
export async function runQuarantineCheck ({
  fetchSummary = fetchQuarantineSummary,
  classify = classifyQuarantine,
  env = process.env
} = {}) {
  let rows
  try {
    rows = await fetchSummary({
      host: env.TINYBIRD_HOST,
      token: env.TINYBIRD_READ_TOKEN,
      lookbackHours: env.QUARANTINE_LOOKBACK_HOURS
    })
  } catch (e) {
    // Unreachable/misconfigured Tinybird is NOT the same signal as a quarantined
    // conversion — warn, never critical (per the module's alert policy).
    return { _status: 'warning', warning: `quarantine check unavailable: ${e.message}` }
  }
  const c = classify(rows)
  if (c.level === 'critical') throw new Error(c.summary)   // → 'error' + in CRITICAL_CHECKS → overall critical → Slack 🔴
  if (c.level === 'warn') return { _status: 'warning', warning: c.summary }
  return { ok: true, summary: c.summary, conversionRows: c.conversionRows, totalRows: c.totalRows }
}

// check() wraps an async fn.
// Return { _status: 'warning', ...rest } from fn to report a warning without throwing.
// Throw to report an error.
export async function check(name, fn) {
  const t = Date.now()
  try {
    const result = await fn()
    const { _status, ...rest } = result || {}
    const status = _status || 'ok'
    return { name, status, ms: Date.now() - t, ...rest }
  } catch (e) {
    return { name, status: 'error', ms: Date.now() - t, error: e.message }
  }
}

async function collectSnapshot() {
  const results = await Promise.allSettled([

    // 1. Supabase connectivity — CRITICAL
    check('supabase', async () => {
      const { data, error } = await getSupabase().from('sites').select('id').limit(1)
      if (error) throw new Error(error.message)
      return { rows: data?.length ?? 0 }
    }),

    // 2. API health endpoint — warning only (may not be accessible from job runner)
    check('api_health', async () => {
      const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return { status_reported: data.status }
    }),

    // 2b. Erasure re-sweep — CRITICAL. The cron SCHEDULES; the API EXECUTES, because only the API
    // holds TINYBIRD_ADMIN_TOKEN (verified on prod: this service has the read token only). Granting
    // a monitor delete rights on the event store was the alternative and was rejected.
    //
    // Every non-2xx is thrown, deliberately — including 503 "not configured". A missing
    // ST_INTERNAL_JOB_SECRET must turn this check RED rather than let it pass quietly, or the
    // monitor would report healthy while the sweep never ran once.
    check('erasure_resweep', async () => {
      const secret = process.env.ST_INTERNAL_JOB_SECRET
      if (!secret) throw new Error('ST_INTERNAL_JOB_SECRET is not set on this service — the re-sweep cannot be triggered')
      const res = await fetch(`${API_URL}/api/internal/jobs/erasure-resweep`, {
        method: 'POST',
        headers: { 'x-internal-job-secret': secret },
        signal: AbortSignal.timeout(30000)
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${body?.error || 'resweep failed'}`)
      const d = body?.data || {}
      // Rows that have failed RESWEEP_ALERT_AFTER_ATTEMPTS times or more. Retrying is normal
      // (Tinybird caps active delete jobs, so a single collision is expected); still failing after
      // ~90 minutes is not.
      if (d.alerting > 0) throw new Error(`${d.alerting} erasure(s) still un-swept after repeated attempts — subjects remain unprotected`)
      return { swept: d.swept ?? 0, failed: d.failed ?? 0, pending: d.pending ?? 0 }
    }),

    // 3. Nightly attribution job — CRITICAL assertion (not a passive observation).
    // Red on: no run, non-success status, or staleness (>26h). RUN HEALTH ONLY — the
    // outcome (are conversions actually landing?) is the `conversions` check below, which
    // still reports store_conversions_48h. No storeConversionCount() fanout here.
    check('nightly_job', async () => {
      const { data: run } = await getSupabase()
        .from('job_runs')
        .select('ran_at, status, conversions_processed, error_message')
        .eq('job_name', 'nightly-attribution')
        .order('ran_at', { ascending: false })
        .limit(1).single()
      const verdict = evaluateNightlyJob({ run })
      if (verdict.critical) throw new Error(verdict.reason)
      return { last_run: run.ran_at, hours_ago: verdict.hoursAgo, conversions: run.conversions_processed, job_status: run.status }
    }),

    // 4. Active sites count
    check('sites_count', async () => {
      const { count } = await getSupabase().from('sites').select('*', { count: 'exact', head: true })
      return { total_sites: count ?? 0 }
    }),

    // 5. Recent tracked events — canary that tracking is flowing. Reads Tinybird (the live
    // event store) via events_health_day, fanned out over the monitored sites. SEE the
    // evaluateDataFlow header for the pageviews-24h→any-event-24h + global→per-site semantic
    // change (D2). Warning on all-zero; error on any read failure; skipped on no sites.
    check('data_flow', async () => {
      const sites = await getMonitoredSites(getSupabase())
      return evaluateDataFlow({ sites, queryPipe: queryTinybirdPipe })
    }),

    // 6. Recent conversions in attributed_conversions — CRITICAL assertion.
    // Red when zero land in 48h while the event store has conversions to attribute.
    check('conversions', async () => {
      const since = new Date(Date.now() - 48 * 3_600_000).toISOString().split('T')[0]
      const { count } = await getSupabase().from('attributed_conversions')
        .select('*', { count: 'exact', head: true }).gte('conversion_date', since)
      const storeConversions = await storeConversionCount()
      const verdict = evaluateConversions({ attributed48h: count ?? 0, storeConversions })
      if (verdict.critical) throw new Error(verdict.reason)
      return { attributed_conversions_48h: count ?? 0, store_conversions_48h: storeConversions ?? 'unknown' }
    }),

    // 7. Required env vars — CRITICAL
    check('env_vars', async () => {
      const missing = REQUIRED_ENV_VARS.filter(k => !process.env[k])
      if (missing.length > 0) throw new Error(`Missing: ${missing.join(', ')}`)
      return { all_present: true }
    }),

    // 8. Tinybird conversion-quarantine alarm — CRITICAL when a $conversion is
    // quarantined (silent revenue loss, SCOPE_v3 §11; see lib/quarantine-alarm.js).
    // An unreachable/misconfigured Tinybird warns (not critical) via runQuarantineCheck.
    check('tinybird_quarantine', () => runQuarantineCheck()),

    // 9. Health agent process memory — NOT the API server.
    // Measures this script's own Node.js process. Values will always be low (~20-60MB).
    // Flag only extreme values that suggest a runaway script.
    check('agent_memory', async () => {
      const mem = process.memoryUsage()
      const heapMB = Math.round(mem.heapUsed / 1024 / 1024)
      if (heapMB > 200) return { _status: 'warning', heap_mb: heapMB, warning: 'Health agent heap unusually high' }
      return { heap_mb: heapMB, rss_mb: Math.round(mem.rss / 1024 / 1024) }
    })
  ])

  const checks = results.map(r => r.status === 'fulfilled' ? r.value : { name: 'unknown', status: 'error', error: r.reason?.message })
  const errors = checks.filter(c => c.status === 'error')
  const warnings = checks.filter(c => c.status === 'warning')
  const slow = checks.filter(c => c.status === 'ok' && c.ms > 2000)

  const criticalErrors = errors.filter(c => CRITICAL_CHECKS.has(c.name))
  const overall = criticalErrors.length > 0 ? 'critical'
    : (errors.length > 0 || warnings.length > 0) ? 'warning'
    : slow.length > 0 ? 'warning'
    : 'ok'

  return { ts: new Date().toISOString(), overall, checks, errors, warnings, slow }
}

// Deterministic summary from the snapshot. Severity is the computed snap.overall —
// NEVER an LLM verdict. (The removed DeepSeek "AI Diagnosis" narrated a freeform
// severity that OVERRODE snap.overall in notify(), so a hallucinated "ok" suppressed
// the Slack alert during a total outage. It also violated the product §26 guardrail:
// no LLM-narrated freeform status. A monitor asserts or says nothing — it never narrates.)
function summarize(snap) {
  const issues = snap.errors.length + snap.warnings.length
  return {
    severity: snap.overall,
    diagnosis: `${snap.errors.length} error(s), ${snap.warnings.length} warning(s)`,
    action: issues > 0 ? 'Check the failing checks above and the job/service logs' : null
  }
}

async function notify(dx, snap) {
  // Gate on the DETERMINISTIC severity (snap.overall via dx.severity) — never on a
  // narrated verdict. If overall is not ok, an alert MUST go out.
  if (!SLACK || dx.severity === 'ok') return
  const icon = dx.severity === 'critical' ? '🔴' : '⚠️'
  const failList = [
    ...snap.errors.map(e => `• \`${e.name}\` ERROR: ${e.error}`),
    ...snap.warnings.map(w => `• \`${w.name}\` WARN: ${w.warning || 'warning'}`)
  ].join('\n')
  // A failed ALERT must never become a failed CHECK. This fetch used to be bare, so a
  // revoked webhook or a Slack outage threw out of notify(), rejected run(), and skipped
  // `process.exit(snap.overall === 'critical' ? 1 : 0)` — the outer handler then exited 1
  // and printed "Health check crashed: <slack error>". Because notify() returns early when
  // severity is 'ok', the reachable case is a WARNING run reporting a false CRITICAL to
  // cron, with the real verdict replaced by the transport error. Log and continue; never
  // re-throw. The verdict is already on stdout and in the exit code before we get here.
  try {
    const res = await fetch(SLACK, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${icon} *SourceTrack Health — ${dx.severity.toUpperCase()}*\n*Summary:* ${dx.diagnosis}\n*Action:* ${dx.action || 'None'}\n${failList}`
      })
    })
    if (!res.ok) {
      console.error(`[health-agent] Slack notify failed: HTTP ${res.status}`)
    }
  } catch (err) {
    console.error('[health-agent] Slack notify threw:', err.message)
  }
}

async function run() {
  console.log('🔍 SourceTrack health check starting...\n')
  const snap = await collectSnapshot()

  for (const c of snap.checks) {
    const icon = c.status === 'ok' ? '✅' : c.status === 'warning' ? '⚠️' : c.status === 'skipped' ? '⏭️' : '❌'
    const slow = c.ms > 2000 ? ' SLOW' : ''
    const detail = c.error ? ` — ${c.error}` : c.warning ? ` — ${c.warning}` : c.ms ? ` (${c.ms}ms)` : ''
    const extras = Object.entries(c)
      .filter(([k]) => !['name','status','ms','error','warning','_status'].includes(k))
      .map(([k,v]) => `${k}=${v}`).join(' ')
    console.log(`${icon} ${c.name}${detail}${slow}${extras ? ' | ' + extras : ''}`)
  }

  console.log(`\n━━━ Overall: ${snap.overall.toUpperCase()} ━━━`)
  if (snap.errors.length > 0) console.log(`❌ ${snap.errors.length} failed: ${snap.errors.map(e => e.name).join(', ')}`)
  if (snap.warnings.length > 0) console.log(`⚠️  ${snap.warnings.length} warnings: ${snap.warnings.map(w => w.name).join(', ')}`)
  if (snap.slow.length > 0) console.log(`🐢 ${snap.slow.length} slow: ${snap.slow.map(s => `${s.name}(${s.ms}ms)`).join(', ')}`)

  const dx = summarize(snap)
  console.log(`\nSummary: ${dx.diagnosis}`)
  if (dx.action) console.log(`   Action: ${dx.action}`)

  await notify(dx, snap)

  process.exit(snap.overall === 'critical' ? 1 : 0)
}

// Auto-run ONLY when executed directly (cron), NOT when imported by tests — so the
// exported evaluators can be unit-tested without hitting the network.
if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch(e => { console.error('Health check crashed:', e.message); process.exit(1) })
}
