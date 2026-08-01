// Internal job endpoints — work that a cron must TRIGGER but only the API may PERFORM.
//
// ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────
// The erasure re-sweep deletes from Tinybird, which needs TINYBIRD_ADMIN_TOKEN. Verified on
// production 2026-08-01 (Railway variable NAMES only — values are never read):
//   SourceTrack-Api      TINYBIRD_ADMIN_TOKEN  present
//   sourcetrack-health   absent (read token only)
//   nightly-attribution  absent (read token only)
// So no cron can run the delete today. The alternative — granting the health monitor an admin
// token — would turn a read-only observer into something that can delete from the event store.
// Given §0 exists because an agent once escalated its own access, expanding a monitor's blast
// radius is the wrong direction. The cron SCHEDULES; the API, which already holds the token,
// EXECUTES. Blast radius unchanged.
//
// ── AUTH ─────────────────────────────────────────────────────────────────────
// There was no internal-auth mechanism in this codebase (health-agent calls /health
// unauthenticated), so this introduces one: a shared secret in ST_INTERNAL_JOB_SECRET, compared
// in constant time.
//
// FAILS CLOSED IN BOTH DIRECTIONS, which is the part worth reviewing:
//   * secret NOT configured on the API  -> 503, never an open endpoint. A misconfiguration must
//     not silently publish a delete trigger.
//   * secret configured but not matched -> 401.
// A caller that cannot authenticate gets an error, never a quiet success — otherwise the health
// check would go green while the sweep never ran, which is precisely the silent-success class
// this whole arc exists to remove.

import { Router } from 'express'
import { timingSafeEqual } from 'crypto'
import { getSupabase } from '../lib/supabase.js'
import { runErasureResweep } from '../lib/erasure-resweep.js'

export const internalJobsRouter = Router()

// Constant-time compare that tolerates length mismatch without leaking it through timing.
function secretMatches (provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try { return timingSafeEqual(a, b) } catch (_) { return false }
}

export function requireInternalJobSecret (req, res, next) {
  const expected = process.env.ST_INTERNAL_JOB_SECRET
  if (!expected) {
    // NOT a 401: the caller did nothing wrong and retrying will not help. 503 says "this endpoint
    // is not configured", which is the true state and is what the health check should escalate on.
    return res.status(503).json({ success: false, error: 'Internal job endpoint is not configured' })
  }
  if (!secretMatches(req.get('x-internal-job-secret'), expected)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }
  return next()
}

// POST /api/internal/jobs/erasure-resweep
// Runs the delayed second Tinybird delete for every erasure past its eligibility window.
// Idempotent: the underlying erase is a delete-by-condition, so a duplicate call is a no-op.
internalJobsRouter.post('/erasure-resweep', requireInternalJobSecret, async (req, res) => {
  try {
    const summary = await runErasureResweep(getSupabase(), {
      host: process.env.TINYBIRD_HOST,
      adminToken: process.env.TINYBIRD_ADMIN_TOKEN,
      readToken: process.env.TINYBIRD_READ_TOKEN
    })

    // A read failure or a missing admin token is a 500, not a 200 with a sad payload. The caller
    // is a monitor: it must be able to tell "nothing to do" from "could not tell".
    if (summary.readFailed) {
      return res.status(500).json({ success: false, error: summary.errors[0] || 'resweep read failed', data: summary })
    }
    return res.json({ success: true, data: summary, error: null })
  } catch (err) {
    console.error('[internal-jobs] erasure-resweep threw:', err?.message || err)
    return res.status(500).json({ success: false, error: 'Erasure re-sweep failed' })
  }
})
