-- Volunteered visitor identity (V1 Named Contacts).
--
-- Stores name/email ONLY when a visitor VOLUNTARILY submitted it via the
-- first-party identify() channel (contact form, signup, trial). SourceTrack
-- NEVER enriches, reverse-looks-up, IP-resolves, or de-anonymizes — the client
-- is the data controller who collected consent on their own form; we are the
-- processor passing volunteered data through (CLAUDE.md §6, §6.5).
--
-- KEY: distinct_id is the subject key (per #371 — every id the product surfaces
-- is a distinct_id; the tracker sends the SAME AID as anonymous_id on identify()
-- and as the value stored as distinct_id by track.js:352 / conversion.js:425).
-- So (site_id, distinct_id) joins directly to attributed_conversions.distinct_id
-- and the leads-server stitch.
--
-- WHY A TABLE, not a column on attributed_conversions: that table only has rows
-- for CONVERTERS, but identify() routinely fires BEFORE conversion (trial
-- signup, gated content). A table keyed on distinct_id captures the
-- not-yet-converted lead too, and gives GDPR erasure a clean per-visitor target.
--
-- `source` is retained for the follow-up that will add webhook-volunteered
-- identity (Stripe checkout email, Shopify order name/email) — out of THIS PR.
--
-- NOT APPLIED by the agent. Founder reviews + hand-applies staging -> prod (§8).
-- Idempotent: guarded so it is safe to run across environments.

create table if not exists public.volunteered_identity (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null,
  distinct_id   text not null,                     -- the subject key (== events.distinct_id)
  email         text,                              -- validated (RFC-ish regex) at write time
  name          text,                              -- length-capped at write time
  source        text not null default 'identify', -- 'identify' | 'stripe_checkout' | 'shopify_order'
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (site_id, distinct_id)                    -- one row per visitor; identify() upserts
);

-- Erasure + Leads-stitch lookups are (site_id, distinct_id); the unique index
-- above already serves them. Add a plain distinct_id index for the GDPR
-- .in('distinct_id', subjectIds) erasure/access path.
create index if not exists volunteered_identity_distinct_idx
  on public.volunteered_identity (site_id, distinct_id);

-- Tenant PII → RLS ON, DEFAULT-DENY (no policies). Only the service role (which
-- bypasses RLS) writes this from api/routes/identify.js and reads it from
-- leads-server.js + gdpr.js; the anon and authenticated roles get NOTHING.
-- Per CLAUDE.md §6.5: never expose a table to anon/authenticated without an
-- explicit policy; default-deny.
alter table public.volunteered_identity enable row level security;

comment on table public.volunteered_identity is
  'Volunteered visitor identity (name/email) captured ONLY from the first-party identify() channel. Never enriched/de-anonymized. Keyed by distinct_id. Service-role only; RLS default-deny. Erased by api/routes/gdpr.js /visitor + disclosed by /subject.';
