-- BACKFILL: create public.lead_qualifications — the table had NO CREATE migration in
-- EITHER environment (it was hand-created in prod and staging, differently: staging
-- carried an extra `created_at` the code never uses — gdpr.js:354 explicitly notes
-- "schema has no created_at/updated_at"). Without this, a fresh migrations replay fails
-- at 20260626130000_add_lead_qualifications_status.sql (which ALTERs this table) — so
-- this file is DELIBERATELY dated one minute BEFORE that ALTER so the replay order is
-- correct. CREATE ... IF NOT EXISTS ⇒ a pure no-op on prod/staging (the table already
-- exists); it only materializes on a fresh DB (the drift-check shadow + future provisioning).
--
-- Columns are the code-observed contract (leads-server.js:360 upsert +
-- gdpr.js:356 / leads-server.js:146,261 selects). NO `created_at` — the code does not
-- use it; staging's extra column is a hand-add to DROP, not to formalize here.
--
-- ⚠️ TYPES: derived from usage, not from a prod dump (CC has no prod DDL access). They
-- are the intended contract; the schema-drift check will surface any mismatch vs prod's
-- actual types on its first run — reconcile there (that is the check doing its job).
-- FILE ONLY — orchestrator hand-applies. Forward-only, idempotent.

CREATE TABLE IF NOT EXISTS public.lead_qualifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  visitor_id    text        NOT NULL,
  status        text,                                   -- 4-state vocab + CHECK added by 20260626130000
  qualified     boolean     NOT NULL DEFAULT false,
  qualified_by  uuid,                                   -- req.user.id, nullable
  qualified_at  timestamptz,
  notes         text        DEFAULT ''
);

-- Upsert conflict target used by leads-server.js (onConflict: 'site_id,visitor_id').
CREATE UNIQUE INDEX IF NOT EXISTS lead_qualifications_site_visitor_uidx
  ON public.lead_qualifications (site_id, visitor_id);
