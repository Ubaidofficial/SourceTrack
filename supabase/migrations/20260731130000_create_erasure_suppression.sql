-- Erasure suppression — the durable record that an Art. 17 erasure was honoured, so the same
-- subject's PII cannot be silently written back afterwards.
--
-- ⚠️ PENDING LEGAL REVIEW — STATED AS UNSETTLED, NOT AS SETTLED.
-- The decision to BUILD this is made (orchestrator + founder). The retention question behind it
-- is NOT confirmed. The argument: a record kept SPECIFICALLY to enforce a subject's own erasure
-- request is a different retention question from ordinary data retention — the same logic that
-- underpins marketing-suppression / unsubscribe lists — with a GDPR accountability-principle
-- (Art. 5(2)) case behind it. That is a real argument, not a lawyer's confirmation. Nothing here
-- should be read as legal sign-off, and the existence of this table must not be taken as
-- evidence the question was answered.
--
-- WHY A NEW TABLE AND NOT erasure_log:
-- erasure_log records ATTEMPTS. Verified on prod: executed_at is NULLABLE and status is a
-- NOT NULL enum, so it holds dry-runs and failures alongside successes. Suppressing off it would
-- suppress people who were never actually erased. This table is written ONLY at the moment PII
-- was genuinely removed — gdpr.js's no-match branch (nothing deleted in either store)
-- deliberately does not write here.
--
-- TWO KEY TYPES, both required:
--   subject_ids  — every id the subject was known by (resolveSubjectIds expands the requested
--                  anonymous_id through site_identity_links, so a subject supplied as either id
--                  shape is fully covered).
--   email_hashes — sha256 of the normalised email. distinct_id ALONE misses the case this
--                  mechanism most needs to catch: an erased person returning on a new device
--                  arrives with a brand-new anonymous_id and calls identify() with the same
--                  email. No id matches; only the email does.
--
-- HASHED, NEVER PLAINTEXT. A record whose purpose is minimising what is retained about an erased
-- person must not itself become a store of their address. The hash is taken over the SAME
-- normalisation identify() applies (normalizeVolunteeredEmail: trim + lowercase + shape check),
-- so an incoming identify() hashes to the same value or the check silently never matches.
--
-- ── §6.5 "new PII store => all THREE GDPR paths" — NOT silently skipped ──────────────────────
-- This table is subject-scoped, so the rule is engaged. Its answer is deliberately not uniform,
-- because the table's whole purpose is to OUTLIVE an erasure:
--
--   /gdpr/account  — COVERED, by the documented FK-cascade mechanism (site_id -> sites(id)
--                    ON DELETE CASCADE), exactly as volunteered_identity does since #376. When
--                    the site is deleted the suppression record has no referent and goes with
--                    it. Stated explicitly per the rule's "the PR MUST state which" clause;
--                    there is no second, overlapping delete in the handler.
--   /gdpr/visitor  — DELIBERATELY NOT COVERED. Deleting this row on an Art. 17 request would
--                    delete the very record that enforces that request, restoring the gap this
--                    exists to close. This is the one intentional exception to §6.5, recorded
--                    here rather than left for a reviewer to discover. It is also precisely the
--                    part the pending legal review must confirm.
--   /gdpr/subject  — OPEN QUESTION, not resolved either way. #538 established that Art. 15
--                    access must disclose exactly what Art. 17 removes; a durable suppression
--                    record is new persistent state about the subject that endpoint does not
--                    currently know exists. A TODO marking this sits on the handler in
--                    api/routes/gdpr.js. Do not quietly resolve it by adding or omitting a
--                    select — it interacts with the legal review above.
--
-- RLS: ENABLED with ZERO policies — default-deny, service-role only. This matches erasure_log
-- and volunteered_identity, both verified on prod as relrowsecurity=true with 0 policies. Only
-- the service-role client (which bypasses RLS) reads or writes it; no anon/authenticated role
-- may reach it, which is the correct posture for a table about erased people.
--
-- NOT APPLIED BY THIS PR (CLAUDE.md §8). Must be applied staging -> prod BEFORE the code that
-- writes to it merges: api/routes/gdpr.js begins inserting here, and while the table is absent
-- every erasure logs a loud suppression-write failure (the erasure itself still succeeds — the
-- write is non-throwing by design — but the subject is erased and unprotected).

CREATE TABLE IF NOT EXISTS public.erasure_suppression (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  subject_ids    text[] NOT NULL,
  email_hashes   text[] NOT NULL DEFAULT '{}',
  source         text NOT NULL DEFAULT 'visitor',
  suppressed_at  timestamptz NOT NULL DEFAULT now()
);

-- A suppression record with no keys can never match anything, so it would be a silent no-op
-- pretending to be protection.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erasure_suppression_has_a_key') THEN
    ALTER TABLE public.erasure_suppression
      ADD CONSTRAINT erasure_suppression_has_a_key
      CHECK (array_length(subject_ids, 1) >= 1);
  END IF;
END $$;

-- GIN on both key arrays: the ingest check asks "does ANY record for this site contain this id
-- (or this email hash)?", which is a containment test on either column.
CREATE INDEX IF NOT EXISTS erasure_suppression_subject_ids_gin
  ON public.erasure_suppression USING gin (subject_ids);
CREATE INDEX IF NOT EXISTS erasure_suppression_email_hashes_gin
  ON public.erasure_suppression USING gin (email_hashes);
-- Every lookup is tenant-scoped first (§6.5), so site_id leads.
CREATE INDEX IF NOT EXISTS erasure_suppression_site_id_idx
  ON public.erasure_suppression (site_id);

-- DELIBERATELY NO UNIQUE CONSTRAINT. Re-erasing the same subject inserts a second row, which is
-- harmless: the check is an existence test, and erasure requests are rare and operator-initiated.
-- The rejected alternative — one row per email hash with UNIQUE(site_id, email_sha256) — cannot
-- work, because Postgres treats NULLs as distinct in a unique constraint, so every subject who
-- volunteered no email would insert an unconstrained NULL row that never dedupes.

ALTER TABLE public.erasure_suppression ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.erasure_suppression IS
  'Durable record that an Art. 17 erasure was honoured, so the subject''s PII cannot be silently re-entered. Written ONLY when PII was genuinely removed (never on a no-match). Survives /gdpr/visitor by design; removed by /gdpr/account via the site_id cascade. Retention basis PENDING LEGAL REVIEW.';
COMMENT ON COLUMN public.erasure_suppression.subject_ids IS
  'Every id the subject was known by at erasure time (resolveSubjectIds output), not just the requested one.';
COMMENT ON COLUMN public.erasure_suppression.email_hashes IS
  'sha256 of the normalised volunteered email(s), captured BEFORE the volunteered_identity delete. Never plaintext. Empty when the subject volunteered no email — the id keys still apply.';

NOTIFY pgrst, 'reload schema';
