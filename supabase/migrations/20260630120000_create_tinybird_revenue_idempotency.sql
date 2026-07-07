-- Tinybird events-plane revenue idempotency (Phase 2b).
--
-- A NEW, parallel dedup keyed on (site_id, event_id) — NO provider in the key
-- (deliberate: a shared deterministic event_id, e.g. offline<->browser
-- external_event_id, cross-dedups producers the provider-scoped
-- revenue_idempotency_keys cannot). Runs ALONGSIDE the existing
-- revenue_idempotency_keys (revenue_foundation.sql), it does not replace it.
--
-- FILE ONLY — not applied by CC. Orchestrator reviews + hand-applies staging->prod.
-- Forward-only, idempotent guards (safe to re-run / across environments).
--
-- site_id is `text` to mirror the Tinybird events plane (events.datasource
-- `site_id String`) — the opaque tenant string, NOT the uuid sites.id. No FK to
-- sites for that reason (unlike revenue_idempotency_keys.site_key -> sites.site_key);
-- stale keys are tiny dedup markers and are reclaimable by app-side retention.

CREATE TABLE IF NOT EXISTS public.tinybird_revenue_idempotency_keys (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     text         NOT NULL CHECK (site_id <> ''),
  event_id    text         NOT NULL CHECK (event_id <> ''),
  created_at  timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT unique_tinybird_site_event UNIQUE (site_id, event_id)
);

-- The UNIQUE constraint's implicit index already covers (site_id, event_id)
-- lookups; no additional index needed.

-- RLS: default-deny. This table is written ONLY server-side via the service-role
-- client (which bypasses RLS); no anon/authenticated/UI path reads these internal
-- dedup markers. Enabling RLS with NO permissive policy = default-deny (§6.5:
-- never expose a tenant table to anon/authenticated without an explicit policy).
ALTER TABLE public.tinybird_revenue_idempotency_keys ENABLE ROW LEVEL SECURITY;
