-- KI-45 (silent-success class): allow 'skipped' in data_quality_reports.status so a check that
-- did NOT execute — insufficient data (data-quality-check.js:95), or a thrown per-check catch —
-- is recorded honestly rather than as a false 'ok' or an absent row. ok/warning/critical unchanged.
--
-- apply-then-merge (§8): apply this staging -> prod BEFORE merging the code that writes 'skipped',
-- otherwise the nightly job throws on every insert. Idempotent + forward-only.

ALTER TABLE public.data_quality_reports
  DROP CONSTRAINT IF EXISTS data_quality_reports_status_check;

ALTER TABLE public.data_quality_reports
  ADD CONSTRAINT data_quality_reports_status_check
  CHECK (status = ANY (ARRAY['ok'::text, 'warning'::text, 'critical'::text, 'skipped'::text]));
