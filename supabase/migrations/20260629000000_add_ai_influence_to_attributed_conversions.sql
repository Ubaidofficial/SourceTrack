-- Migration: add dark-traffic AI-influence columns to attributed_conversions.
--
-- Dark Traffic Stitching (Feature 1): surface a prior AI session when a
-- conversion arrives as Direct traffic. Two nullable columns hold the
-- deterministic stitch result (never inferred, never LLM):
--   ai_influenced_source     — the AI source domain (e.g. 'chat.openai.com')
--                              or the channel name 'AI Search' when the
--                              domain is not recoverable.
--   ai_influenced_session_at — timestamp of the first AI Search touchpoint.
--
-- LEDGER SYNC: these columns are ALREADY APPLIED on prod. This file records
-- the schema change in the migration ledger so repo state matches live.
-- Idempotent (ADD COLUMN IF NOT EXISTS) so re-applying is a no-op.
--
-- CC writes this file only; the orchestrator reviews and hand-applies it
-- (staging -> prod) per CLAUDE.md §8. Not applied by code.

ALTER TABLE public.attributed_conversions
  ADD COLUMN IF NOT EXISTS ai_influenced_source text,
  ADD COLUMN IF NOT EXISTS ai_influenced_session_at timestamptz;
