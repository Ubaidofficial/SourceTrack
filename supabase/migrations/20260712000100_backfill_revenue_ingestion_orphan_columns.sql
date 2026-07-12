-- BACKFILL: revenue_ingestion_events' three PROD-only columns — payment_id, event_type,
-- idempotency_key. They exist in prod (hand-applied, never committed) but not staging.
--
-- 🟡 UNUSED / NOT load-bearing: no code writes or reads them. logIngestionEvent
-- (api/lib/idempotency.js:63-79) inserts ONLY site_key, provider, provider_event_id,
-- order_id, value, currency, status, error_message — never these three. Staging's
-- 10-column shape already matches both the code and the base migration
-- (20260606180000_revenue_foundation.sql). These columns are therefore prod ORPHANS.
--
-- Formalized here (rather than dropped) only to CONVERGE the two environments and make
-- the drift check green; if the product genuinely has no use for them, prefer a follow-up
-- migration that DROPs them from prod. They are added nullable with no default so the
-- add is a safe no-op on prod and harmless on a fresh DB.
--
-- ⚠️ TYPES inferred (text) — verify vs prod. FILE ONLY — orchestrator hand-applies.

ALTER TABLE public.revenue_ingestion_events
  ADD COLUMN IF NOT EXISTS payment_id      text,   -- UNUSED by code
  ADD COLUMN IF NOT EXISTS event_type      text,   -- UNUSED by code
  ADD COLUMN IF NOT EXISTS idempotency_key text;   -- UNUSED by code
