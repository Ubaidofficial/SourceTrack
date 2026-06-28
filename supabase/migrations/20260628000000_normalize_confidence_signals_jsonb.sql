-- Migration: normalize attributed_conversions.confidence_signals to real jsonb.
--
-- Root cause: the write path in api/jobs/nightly-attribution.js JSON.stringify'd
-- the signals object before upsert, so Postgres stored it as a jsonb STRING
-- scalar (jsonb_typeof = 'string') instead of a jsonb object. Bare
-- `confidence_signals->>'key'` then reads NULL on every such row.
--
-- The write path is fixed in this same PR (stores a plain object → 'object').
-- This backfill normalizes the EXISTING string-scalar rows in place.
--
-- Idempotent + scoped: only rows where jsonb_typeof = 'string' are touched, so
-- re-running is a no-op (already-'object' rows are skipped) and NULL rows are
-- correctly excluded (jsonb_typeof(NULL) is NULL, not 'string').
--
-- CC writes this file only; the orchestrator reviews and hand-applies it
-- (staging -> prod) per CLAUDE.md §8. Not applied by code.

UPDATE public.attributed_conversions
   SET confidence_signals = (confidence_signals #>> '{}')::jsonb
 WHERE jsonb_typeof(confidence_signals) = 'string';

-- Verification (run after apply): expect 0 rows still stored as 'string'.
--   SELECT count(*) AS string_rows
--     FROM public.attributed_conversions
--    WHERE jsonb_typeof(confidence_signals) = 'string';
--   -- expect: 0
