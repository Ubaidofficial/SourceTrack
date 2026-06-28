-- Migration: one-time backfill of AI-influence on existing conversions.
--
-- Dark Traffic Stitching (Feature 1) — retroactive pass for Case A only:
-- AI Search was the FIRST touch and Direct was the LAST touch. This is the
-- safe, deterministic subset that needs no JSONB scanning — first_touch_source
-- already carries the AI domain and first_touch_timestamp its session time.
--
-- The forward write path (api/jobs/nightly-attribution.js, same PR) also
-- catches AI touchpoints that appear mid-journey via a linear_attribution scan;
-- this backfill intentionally covers only the first-touch case to stay simple
-- and avoid touching JSONB. Newer/reprocessed rows get the full treatment.
--
-- Idempotent: the `ai_influenced_source IS NULL` guard means re-running is a
-- no-op for already-stitched rows.
--
-- CC writes this file only; it does NOT execute it. The orchestrator reviews
-- and hand-applies it (staging -> prod) per CLAUDE.md §0/§8. The "rows updated"
-- count is observed at apply time, not by CC.

UPDATE public.attributed_conversions
   SET ai_influenced_source     = first_touch_source,
       ai_influenced_session_at = first_touch_timestamp
 WHERE last_touch_channel  = 'Direct'
   AND first_touch_channel = 'AI Search'
   AND ai_influenced_source IS NULL;
