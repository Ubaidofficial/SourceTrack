import 'dotenv/config'
import WebSocket from 'ws'
import { getSupabase } from '../lib/supabase.js'
import { queryTinybirdPipe } from '../lib/tinybird-read.js'
import { fetchQuarantineSummary, classifyQuarantine } from '../lib/quarantine-alarm.js'

const SLACK = process.env.SLACK_WEBHOOK_URL
const API_URL = process.env.API_URL || 'http://localhost:3000'

// Checks that failing immediately classify the whole system as critical.
// Everything else is warning-level. The money-rail business-logic checks
// (nightly_job, conversions) are CRITICAL: a job that "succeeds" while processing
// nothing must be able to turn this monitor red.
const CRITICAL_CHECKS = new Set(['supabase', 'posthog', 'nightly_job', 'conversions', 'tinybird_quarantine'])

// Sum recent $conversion rows across the monitored sites via the SAME pipe + token the
// nightly reads (nightly_conversions_by_site) — so the monitor can NEVER measure a
// different store than the thing it monitors. Returns a number, or null when NOT ONE
// site was pipe-served (store unreachable → "unknown"; the evaluators do not assert the
// silent-zero rule on null, and the `posthog`/connectivity checks cover reachability).
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

// Count $conversion events the SAME Tinybird store the nightly reads received in the
// last 48h. Deterministic; no LLM; never throws.
async function storeConversionCount() {
  try {
    const supabase = getSupabase()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const { data: sites } = await supabase.from('sites')
      .select('id')
      .not('plan', 'in', '(free,inactive,archived)')
      .or(`last_seen_at.gte.${sevenDaysAgo},last_seen_at.is.null`)
    if (!sites || sites.length === 0) return 0
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

// Pure assertion: is the nightly attribution run healthy? CRITICAL on no run, a
// non-success status, staleness, or a silent zero (processed 0 while the store has
// recent conversions). Exported for tests.
export function evaluateNightlyJob({ run, storeConversions = null, now = Date.now(), maxAgeHours = 26 }) {
  if (!run) return { critical: true, reason: 'No job runs found in job_runs table' }
  if (run.status !== 'success') return { critical: true, reason: `Last run status='${run.status}': ${run.error_message || 'no detail'}` }
  const hoursAgo = (now - new Date(run.ran_at).getTime()) / 3_600_000
  if (hoursAgo > maxAgeHours) return { critical: true, reason: `Last run was ${Math.round(hoursAgo)}h ago (> ${maxAgeHours}h) — stale` }
  if ((run.conversions_processed ?? 0) === 0 && typeof storeConversions === 'number' && storeConversions > 0) {
    return { critical: true, reason: `Job processed 0 conversions but the event store has ${storeConversions} in the last 48h — silent failure` }
  }
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

    // 2. PostHog connectivity — CRITICAL
    check('posthog', async () => {
      const host = (process.env.POSTHOG_HOST || '').replace(/\/$/, '')
      if (!host) throw new Error('POSTHOG_HOST not set')
      const url = `${host}/api/projects/${process.env.POSTHOG_PROJECT_ID}/query/`
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: 'SELECT 1' } }),
        signal: AbortSignal.timeout(10000)
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return {}
    }),

    // 3. API health endpoint — warning only (may not be accessible from job runner)
    check('api_health', async () => {
      const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      return { status_reported: data.status }
    }),

    // 4. Nightly attribution job — CRITICAL assertion (not a passive observation).
    // Red on: no run, non-success status, staleness (>26h), or a silent zero
    // (0 processed while the event store has recent conversions).
    check('nightly_job', async () => {
      const { data: run } = await getSupabase()
        .from('job_runs')
        .select('ran_at, status, conversions_processed, error_message')
        .eq('job_name', 'nightly-attribution')
        .order('ran_at', { ascending: false })
        .limit(1).single()
      const storeConversions = await storeConversionCount()
      const verdict = evaluateNightlyJob({ run, storeConversions })
      if (verdict.critical) throw new Error(verdict.reason)
      return { last_run: run.ran_at, hours_ago: verdict.hoursAgo, conversions: run.conversions_processed, job_status: run.status, store_conversions_48h: storeConversions ?? 'unknown' }
    }),

    // 5. Active sites count
    check('sites_count', async () => {
      const { count } = await getSupabase().from('sites').select('*', { count: 'exact', head: true })
      return { total_sites: count ?? 0 }
    }),

    // 6. Recent pageviews — queries PostHog directly (events never go to Supabase)
    check('data_flow', async () => {
      const host = (process.env.POSTHOG_HOST || '').replace(/\/$/, '')
      if (!host) throw new Error('POSTHOG_HOST not set')
      const url = `${host}/api/projects/${process.env.POSTHOG_PROJECT_ID}/query/`
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { kind: 'HogQLQuery', query: "SELECT count() FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 24 HOUR" } }),
        signal: AbortSignal.timeout(15000)
      })
      if (!res.ok) throw new Error(`PostHog HTTP ${res.status}`)
      const data = await res.json()
      const count = Number(data.results?.[0]?.[0]) || 0
      // warn but don't error — could be a legitimate quiet period
      if (count === 0) return { _status: 'warning', pageviews_24h: 0, warning: 'Zero pageviews in last 24h — verify tracker is installed' }
      return { pageviews_24h: count }
    }),

    // 7. Recent conversions in attributed_conversions — CRITICAL assertion.
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

    // 8. Required env vars — CRITICAL
    check('env_vars', async () => {
      const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'POSTHOG_API_KEY',
        'POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'POSTHOG_HOST']
      const missing = required.filter(k => !process.env[k])
      if (missing.length > 0) throw new Error(`Missing: ${missing.join(', ')}`)
      return { all_present: true }
    }),

    // 9. Tinybird conversion-quarantine alarm — CRITICAL when a $conversion is
    // quarantined (silent revenue loss, SCOPE_v3 §11; see lib/quarantine-alarm.js).
    // An unreachable/misconfigured Tinybird warns (not critical) via runQuarantineCheck.
    check('tinybird_quarantine', () => runQuarantineCheck()),

    // 10. Health agent process memory — NOT the API server.
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
  await fetch(SLACK, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${icon} *SourceTrack Health — ${dx.severity.toUpperCase()}*\n*Summary:* ${dx.diagnosis}\n*Action:* ${dx.action || 'None'}\n${failList}`
    })
  })
}

async function run() {
  console.log('🔍 SourceTrack health check starting...\n')
  const snap = await collectSnapshot()

  for (const c of snap.checks) {
    const icon = c.status === 'ok' ? '✅' : c.status === 'warning' ? '⚠️' : '❌'
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
