import dotenv from 'dotenv'
dotenv.config()

// Scheduled refresh of vendor-published crawler IP ranges.
//
// Schedule: daily. Vendors rotate ranges on the order of weeks, so daily is
// ample and keeps us far inside every published rate limit.
//
// WHY THIS JOB MATTERS MORE THAN ITS SIZE SUGGESTS: 8 of the 16 registry
// crawlers are IP-verifiable, and verification is the difference between
// `ip_verified` and `ua_only` on every crawler_hits row. Stale ranges do not
// error — they silently downgrade the whole feature's trustworthiness. That
// failure is invisible unless this job is observable, hence the job_runs
// contract below.
//
// ── KI-46 (a job that dies with no job_runs row is invisible by construction) ──
// This job writes EXACTLY ONE job_runs row on EVERY terminal path:
//   success  — every refreshable bot updated
//   warning  — some bots failed; their last-known-good ranges were retained
//   failed   — every bot failed, or the job threw before finishing
// The top-level catch writes the row BEFORE exiting non-zero, so even a crash
// leaves a trace. This feature has no users yet, so nothing else would notice a
// dead refresh job for a long time — the row is the only alarm.

import { getSupabase } from '../lib/supabase.js'
import { writeJobRun } from '../lib/job-runs.js'
import { refreshAllRanges } from '../lib/ai-crawler-ranges.js'

const JOB_NAME = 'ai-crawler-range-refresh'

export async function run({ supabase = getSupabase(), fetchImpl = fetch } = {}) {
  const startedAt = Date.now()

  try {
    const { attempted, updated, failed } = await refreshAllRanges({ supabase, fetchImpl })

    // No refreshable bots at all would mean the registry lost every VENDOR_JSON
    // entry — a real regression, not a quiet no-op.
    let status
    if (attempted === 0) {
      status = 'failed'
    } else if (failed.length === 0) {
      status = 'success'
    } else if (updated.length === 0) {
      // Total failure. Every bot kept its previous ranges (fail-open), so
      // detection still works — but nothing was refreshed and that needs eyes.
      status = 'failed'
    } else {
      status = 'warning'
    }

    const totalCidrs = updated.reduce((sum, u) => sum + u.count, 0)
    // job_runs has no `details` column (see api/lib/job-runs.js) — the summary
    // goes in error_message, which is how every sibling job reports too.
    const summary = failed.length === 0
      ? `Refreshed ${updated.length}/${attempted} bots, ${totalCidrs} CIDRs`
      : `Refreshed ${updated.length}/${attempted} bots, ${totalCidrs} CIDRs; kept last-known-good for ${failed.length}: ${failed.map(f => `${f.token} (${f.error})`).join('; ')}`

    await writeJobRun(supabase, {
      job_name: JOB_NAME,
      status,
      conversions_processed: updated.length,
      error_message: summary.slice(0, 1000),
      duration_ms: Date.now() - startedAt,
      ran_at: new Date().toISOString()
    })

    console.log(`[${JOB_NAME}] ${status}: ${summary}`)
    return { status, updated, failed }
  } catch (err) {
    // Terminal failure still gets a row — this is the KI-46 case verbatim.
    const message = String(err?.message || err).slice(0, 1000)
    await writeJobRun(supabase, {
      job_name: JOB_NAME,
      status: 'failed',
      conversions_processed: 0,
      error_message: message,
      duration_ms: Date.now() - startedAt,
      ran_at: new Date().toISOString()
    }).catch(() => { /* writeJobRun already logs loudly; never mask the original error */ })

    console.error(`[${JOB_NAME}] Fatal: ${message}`)
    throw err
  }
}

// Direct-invocation entrypoint (node api/jobs/ai-crawler-range-refresh.js).
// Guarded so importing this module in tests does not execute the job.
const isDirectRun = process.argv[1] && process.argv[1].endsWith('ai-crawler-range-refresh.js')
if (isDirectRun) {
  run()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
}
