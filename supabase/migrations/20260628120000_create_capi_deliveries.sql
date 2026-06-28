-- Migration: CAPI delivery log (server-side conversion forwarding observability).
-- Phase 1 foundation. One row per real send attempt to an ad platform
-- (success/failed). "skipped" is an allowed value for future use but the code
-- does NOT log skips (no-token = no attempt) to keep the table meaningful.
-- Safe to re-run (idempotent, additive only).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.capi_deliveries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  platform      text        NOT NULL CHECK (platform IN ('meta','google','microsoft','linkedin','tiktok')),
  event_ref     text,        -- external_event_id / order_id (nullable; dedup ref, not PII)
  status        text        NOT NULL CHECK (status IN ('success','failed','skipped')),
  http_status   integer,
  error_message text,
  attempt       integer     NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capi_deliveries_site_created
  ON public.capi_deliveries(site_id, created_at DESC);

-- RLS: site members can read their own delivery log (mirrors gsc_performance_daily
-- / webhook_destinations). Writes happen via the service role (server), which
-- bypasses RLS — no INSERT policy is granted to anon/authenticated.
ALTER TABLE public.capi_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site members can view capi deliveries" ON public.capi_deliveries;
CREATE POLICY "site members can view capi deliveries"
  ON public.capi_deliveries FOR SELECT
  USING (
    site_id IN (
      SELECT s.id FROM public.sites s
      LEFT JOIN public.company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );
