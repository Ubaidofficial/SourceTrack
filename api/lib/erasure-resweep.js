// Delayed re-sweep of Tinybird erasures — the durable half of erasure suppression.
//
// ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────
// An event accepted BEFORE an erasure completed can be delivered AFTER it. tinybird/adapter/
// batch.js re-queues a failed batch with `buffer.unshift(...batch)`, and a re-queued batch drains
// straight to the transport — it never re-enters dualWriteEvent(), so no ingest-time check can
// see it. The window is bounded (flush 10s × maxRequeue 2 ≈ 20s) but real: inside it, an erased
// subject's events land moments after their erasure reported success.
//
// ── WHY NOT A CHECK AT THE FLUSH BOUNDARY ────────────────────────────────────
// It was built and measured, and it is the wrong trade: a suppression lookup there puts a Supabase
// round-trip on the flush path of the highest-volume ingestion route. See KNOWN_ISSUES.md
// "Erasure suppression: the per-flush check was measured and rejected". DO NOT reattempt it.
//
// ── THE SHAPE ────────────────────────────────────────────────────────────────
// Pay once per erasure (rare) instead of on every batch (constant). erasure_log is the ledger —
// already written on every erasure, already carrying a status, and WRITE-ONLY until now. The
// health cron schedules; this module does the work; the API is the only service holding
// TINYBIRD_ADMIN_TOKEN, so the delete stays there rather than granting a monitor delete rights.
//
// IDEMPOTENT BY CONSTRUCTION: the Tinybird erase is a delete-by-condition (site_id AND
// (distinct_id = X OR visitor_id = X)). Running it a second time removes whatever arrived late and
// is a no-op if nothing did — so this never needs to know whether the first delete finished.

import { eraseSubjectFromTinybird } from '../../tinybird/adapter/erase.js'

// How long after the erasure ran before a re-sweep is eligible.
//
// NOT a derived safety margin — the health cron's */30 cadence dominates the real delay (a sweep
// lands 5–35 min after the erasure whatever this is). Its actual job is ANTI-COLLISION: Tinybird
// caps active delete jobs per workspace, so firing the second delete too close to the first gets
// it rejected. Five minutes is comfortably past the ~20s requeue window and gives the original
// job room to clear.
export const RESWEEP_ELIGIBLE_AFTER_MS = 5 * 60 * 1000

// Failed attempts before the health check goes CRITICAL. At */30 that is ~90 minutes — long
// enough that an expected active-job collision self-resolves without paging, short enough that a
// genuinely stuck erasure surfaces the same working day.
export const RESWEEP_ALERT_AFTER_ATTEMPTS = 3

// Only statuses where a delete was actually ATTEMPTED can be re-swept.
//   'executed' — the job ran; sweep for anything that landed late.
//   'failed'   — the job did not run or errored; this retries the erasure itself.
// 'skipped_*' and 'dry_run' attempted nothing, so there is nothing to finish.
const RESWEEPABLE_STATUSES = ['executed', 'failed']

let _eraseSubject = eraseSubjectFromTinybird
export function __setResweepEraseFn (fn) { _eraseSubject = fn || eraseSubjectFromTinybird }
export function __resetResweepEraseFn () { _eraseSubject = eraseSubjectFromTinybird }

/**
 * Rows whose erasure still needs its second delete.
 *
 * @returns {Promise<{rows: object[]|null, error: string|null}>} rows === null means the READ
 *   failed — the caller must surface that rather than reporting "0 pending", which is the same
 *   silent-zero the money rail already learned not to accept.
 */
export async function findPendingResweeps (supabase, { now = Date.now(), limit = 100 } = {}) {
  const cutoff = new Date(now - RESWEEP_ELIGIBLE_AFTER_MS).toISOString()
  const { data, error } = await supabase
    .from('erasure_log')
    .select('id, subject_id, site_id, status, executed_at, resweep_attempts')
    .in('status', RESWEEPABLE_STATUSES)
    .is('resweep_completed_at', null)
    .lt('executed_at', cutoff)
    .order('executed_at', { ascending: true })
    .limit(limit)
  if (error) return { rows: null, error: error.message }
  return { rows: data || [], error: null }
}

/**
 * Run the delayed re-sweep for every eligible erasure.
 *
 * Never throws — it is called from an HTTP handler and from a monitor, and a thrown error in
 * either place would be reported as something other than what it is.
 *
 * @returns {Promise<{swept, failed, pending, alerting, readFailed, errors}>}
 *   `alerting` counts rows at or past RESWEEP_ALERT_AFTER_ATTEMPTS — the signal the health check
 *   turns CRITICAL on.
 */
export async function runErasureResweep (supabase, { host, adminToken, readToken, now = Date.now() } = {}) {
  const summary = { swept: 0, failed: 0, pending: 0, alerting: 0, readFailed: false, errors: [] }

  const { rows, error } = await findPendingResweeps(supabase, { now })
  if (rows === null) {
    // A failed READ is not "nothing pending". Reporting 0 here would make an outage look healthy.
    summary.readFailed = true
    summary.errors.push(`erasure_log read failed: ${error}`)
    return summary
  }

  summary.pending = rows.length
  if (rows.length === 0) return summary

  // Without an admin token nothing can be deleted. Report it as a failure of the whole sweep
  // rather than marking rows attempted — they were not.
  if (!adminToken) {
    summary.readFailed = true
    summary.errors.push('TINYBIRD_ADMIN_TOKEN is not configured — re-sweep cannot delete')
    summary.alerting = rows.filter(r => (r.resweep_attempts || 0) >= RESWEEP_ALERT_AFTER_ATTEMPTS).length
    return summary
  }

  for (const row of rows) {
    let ok = false
    let reason = null
    try {
      // Same delete-by-condition the original erasure ran. Idempotent: removes whatever arrived
      // late, no-ops if nothing did.
      const result = await _eraseSubject({
        host, adminToken, readToken, siteId: row.site_id, subjectId: row.subject_id, confirm: true
      })
      ok = result?.status === 'executed'
      if (!ok) reason = `tinybird status=${result?.status}${result?.reason ? ` (${result.reason})` : ''}`
    } catch (e) {
      reason = e?.message || String(e)
    }

    if (ok) {
      const { error: upErr } = await supabase
        .from('erasure_log')
        .update({ resweep_completed_at: new Date(now).toISOString(), resweep_last_error: null })
        .eq('id', row.id)
      if (upErr) {
        // The delete SUCCEEDED but we could not record it. Reporting success would be a lie the
        // next run cannot detect; leaving it pending just re-runs an idempotent delete.
        summary.failed += 1
        summary.errors.push(`resweep ledger update failed for ${row.id}: ${upErr.message}`)
        continue
      }
      summary.swept += 1
      continue
    }

    const attempts = (row.resweep_attempts || 0) + 1
    summary.failed += 1
    summary.errors.push(`resweep failed for erasure ${row.id}: ${reason}`)
    if (attempts >= RESWEEP_ALERT_AFTER_ATTEMPTS) summary.alerting += 1
    // resweep_completed_at stays NULL on purpose: the row remains eligible and the next cron run
    // retries it. There is no give-up state — abandoning would leave the subject unprotected with
    // no record that anyone stopped.
    await supabase
      .from('erasure_log')
      .update({ resweep_attempts: attempts, resweep_last_error: String(reason).slice(0, 500) })
      .eq('id', row.id)
      .then(({ error: e }) => { if (e) summary.errors.push(`attempt bookkeeping failed for ${row.id}: ${e.message}`) })
  }

  return summary
}
