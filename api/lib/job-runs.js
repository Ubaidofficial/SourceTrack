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
