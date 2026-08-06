// Safe writer for the job_runs observability table.
//
// Background: a job once inserted a `details` column that does not exist in the
// schema, and the insert error was never checked — so the row failed SILENTLY
// and that job never appeared in job_runs. This helper makes both failure modes
// impossible to repeat:
//   1. Unknown columns throw at call time (dev/test catch) — you cannot insert a
//      column that isn't in JOB_RUNS_COLUMNS.
//   2. A DB insert error is logged LOUDLY and returned — never swallowed.
//
// Real prod schema (verified read-only): id, job_name, status,
// conversions_processed, error_message, duration_ms, ran_at.
//
// ═══ ⚠️ job_runs DOES NOT COVER EVERY JOB. AN ABSENT ROW IS NOT AN ABSENT RUN. ═══
//
// THREE jobs never write here, so a zero row-count for them proves NOTHING:
//   • health-agent            — every DB call is a .select(); it writes nowhere at all
//   • proxy-domain-recheck    — its only trace is last_checked_at on the domain row
//   • data-quality-check      — writes data_quality_reports instead
//
// This was established the hard way on 2026-08-06. Four jobs showed zero rows and were
// reported as "never ran". data-quality-check was in that list and it runs DAILY — 305
// rows in data_quality_reports across 79 distinct days. The conclusion was wrong because
// the check behind it was wrong.
//
// ⚠️ HOW THE CHECK WAS WRONG, because the shape recurs: it grepped for the STRING
// `job_runs` in each job file and treated a match as "writes job_runs". But a COMMENT
// matches, and a READ matches. health-agent:220 and data-quality-check:59 both do
// `.from('job_runs').select(...)` to judge the nightly's freshness — they consume this
// table, they do not populate it. The load-bearing question was "which jobs WRITE", and
// a substring match cannot distinguish writing from reading from mentioning.
//
// THE RULE: to ask whether a job records here, look for an inline
// `.from('job_runs').insert(` or a call to writeJobRun() below — not for the table name.
//
// AND THE SECOND-ORDER CONSEQUENCE, which is worse: health-agent judges system liveness
// by READING this table (health-agent:113 — "No job runs found in job_runs table"). Since
// three jobs never write here, health-agent's own coverage is incomplete by exactly the
// mechanism it exists to catch — it cannot see the silent failure of a job that is
// invisible to its only data source. See api/jobs/health-agent.js.

export const JOB_RUNS_COLUMNS = [
  'job_name', 'status', 'conversions_processed', 'error_message', 'duration_ms', 'ran_at'
]

export async function writeJobRun(supabase, row) {
  if (!row || typeof row !== 'object') {
    throw new TypeError('writeJobRun: row object is required')
  }
  const unknown = Object.keys(row).filter(k => JOB_RUNS_COLUMNS.indexOf(k) === -1)
  if (unknown.length) {
    // Programmer error — fail loudly so it's caught in dev/CI, never in prod silently.
    throw new Error(`writeJobRun: unknown job_runs column(s): ${unknown.join(', ')}`)
  }

  const { error } = await supabase.from('job_runs').insert(row)
  if (error) {
    console.error(`[job_runs] insert FAILED for job_name="${row.job_name}": ${error.message}`)
  }
  return { error: error || null }
}
