-- Re-sweep tracking on erasure_log — the durable ledger for the delayed second Tinybird delete.
--
-- WHY THIS EXISTS: an event accepted BEFORE an erasure completed can still be delivered AFTER it.
-- The batcher re-queues a failed batch with `buffer.unshift(...batch)` (tinybird/adapter/batch.js),
-- and a re-queued batch drains straight to the transport — it never re-enters dualWriteEvent(), so
-- no ingest-time check can see it. Worst case is bounded (TINYBIRD_FLUSH_INTERVAL 10s ×
-- TINYBIRD_MAX_REQUEUE 2 ≈ 20s), but inside that window an erased subject's events can land in
-- Tinybird moments after their erasure reported success.
--
-- WHY A DELAYED RE-SWEEP AND NOT A CHECK AT THE FLUSH BOUNDARY: see KNOWN_ISSUES.md
-- "Erasure suppression: the per-flush check was measured and rejected". Short version — a
-- suppression lookup on the flush path put a Supabase round-trip on the highest-volume ingestion
-- route. Do not reattempt it.
--
-- WHY erasure_log AND NOT A NEW TABLE: this ledger already exists, already records every erasure
-- attempt with a status, and tinybird/adapter/erase.js's own comment says failures are persisted
-- "so the caller can persist status='failed' for retry (never silent-swallow)". It was built to be
-- swept and has been WRITE-ONLY since it landed (one .insert() in gdpr.js, never SELECTed — the
-- same observation #538 made from the FEATURE_MAP side). This wires up the read it was designed for.
--
-- DURABILITY IS THE POINT. An in-process setTimeout would vanish on the next redeploy — routine
-- here, several in a single session — and the gap would silently reopen with nobody knowing. State
-- in Postgres survives restarts by construction: whatever is unswept is still unswept after a
-- deploy, and the next cron run picks it up.
--
-- RETRY IS UNBOUNDED, ESCALATION IS NOT. There is deliberately no "give up" state: abandoning a
-- re-sweep would leave a subject unprotected with no record that anyone stopped trying. Instead
-- resweep_attempts drives an alert — at 3 (~90 min at the health cron's */30 cadence) the check
-- goes CRITICAL. Three rather than one because Tinybird caps ACTIVE delete jobs per workspace
-- (Free 1 / Developer 3), so a single rejection is an expected collision, not an incident.
--
-- NOT APPLIED BY THIS PR (CLAUDE.md §8). Apply staging -> prod before merging the code that reads
-- these columns; until then the sweep query selects a column that does not exist and PostgREST
-- rejects the whole query.

ALTER TABLE public.erasure_log
  ADD COLUMN IF NOT EXISTS resweep_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS resweep_attempts     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resweep_last_error   text;

-- The sweep's eligibility query: rows that ran a delete, are old enough for the requeue window to
-- have drained, and have not yet been re-swept. Partial index so it stays small — a completed
-- re-sweep leaves the index forever after.
--
-- INDEXED ON requested_at, NOT executed_at. gdpr.js writes executed_at as NULL for every status
-- except 'executed', so an executed_at index cannot serve the half of the eligibility predicate
-- that finds FAILED erasures — which are precisely the rows most in need of a re-sweep. requested_at
-- is NOT NULL on every row and is written in the same insert, so it orders the whole set.
CREATE INDEX IF NOT EXISTS erasure_log_pending_resweep_idx
  ON public.erasure_log (requested_at)
  WHERE resweep_completed_at IS NULL;

COMMENT ON COLUMN public.erasure_log.resweep_completed_at IS
  'When the delayed second Tinybird delete succeeded. NULL = still pending; the sweep keeps retrying and escalates via resweep_attempts. Never set on a failed attempt.';
COMMENT ON COLUMN public.erasure_log.resweep_attempts IS
  'Failed re-sweep attempts. At 3 the health-agent check goes CRITICAL (Slack). Deliberately not a give-up counter — there is no state in which we stop trying to finish an erasure.';

NOTIFY pgrst, 'reload schema';
