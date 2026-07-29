-- Marketing-site form submissions (contact form + blog newsletter).
--
-- Both forms previously pointed at action="#" and stored NOTHING. The contact
-- form silently discarded every message; the newsletter form's email input had
-- no `name` attribute at all, so the address was never even serialized — the
-- POST reloaded the page, the field cleared, and the visitor read that as
-- success. This table is the storage half of the real submission path.
--
-- ── WHY THIS TABLE HAS NO site_id, AND SITS OUTSIDE THE THREE GDPR PATHS ─────
-- This is genuine PII (a person volunteering their own email), but it is NOT
-- TENANT PII. Every existing PII table (volunteered_identity, lead_qualifications,
-- site_identity_links, subscription_identity, attributed_conversions) belongs to
-- a CUSTOMER's site and is keyed by site_id — SourceTrack is the processor and
-- the customer is the controller. Here the roles invert: the subject is a
-- prospect contacting SourceTrack, and SourceTrack itself is the CONTROLLER.
--
-- All three GDPR routes in api/routes/gdpr.js are site-scoped and cannot serve
-- this data, by construction:
--   /gdpr/visitor  — erases one visitor WITHIN a site (site_id + distinct_id).
--   /gdpr/subject  — Art. 15 access for a tenant's visitors, filtered by site_id.
--   /gdpr/account  — deletes a workspace and cascade-purges ITS tenant rows.
-- A prospect who emailed SourceTrack has no site_id and no distinct_id, and must
-- NOT be deleted when some unrelated customer closes their workspace. Adding a
-- site_id here to satisfy the §6.5 checklist would be inventing a tenant link
-- that does not exist and would wire this table to the wrong lifecycle.
--
-- So this table is DELIBERATELY outside all three paths, and there is therefore
-- NO FK to sites and NO cascade. The erasure obligation is real but is a
-- DIRECT-TO-CONTROLLER request handled operationally via support@sourcetrack.ai
-- against this table. Flagged in the PR body, not silently omitted. If a
-- self-serve erasure surface is wanted later it needs its own route — it does
-- not belong on the tenant paths.
--
-- Retention: none enforced here. Left as an explicit operational decision rather
-- than a guessed TTL baked into DDL.
--
-- NOT APPLIED by the agent. Founder reviews + hand-applies staging -> prod (§8).
-- Idempotent: safe to run across environments.

create table if not exists public.marketing_submissions (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('contact', 'newsletter')),
  email      text not null,                 -- validated + lowercased at write time
  name       text,                          -- contact form only; length-capped at write time
  phone      text,                          -- contact form only, optional
  subject    text,                          -- contact form only, optional
  message    text,                          -- contact form only
  created_at timestamptz not null default now()
);

-- The only read pattern is "newest submissions, optionally by kind".
create index if not exists marketing_submissions_created_idx
  on public.marketing_submissions (created_at desc);
create index if not exists marketing_submissions_kind_created_idx
  on public.marketing_submissions (kind, created_at desc);

-- PII → RLS ON, DEFAULT-DENY (no policies), same posture as volunteered_identity.
-- Only the service role (which bypasses RLS) writes this, from the public route
-- api/routes/marketing.js. The anon and authenticated roles get NOTHING — note
-- that the WRITE path is a public unauthenticated endpoint, which makes
-- default-deny on the table itself load-bearing: without it, `anon` could read
-- back every prospect's email. Per CLAUDE.md §6.5.
alter table public.marketing_submissions enable row level security;

comment on table public.marketing_submissions is
  'Marketing-site contact + newsletter submissions. SourceTrack is the CONTROLLER here (not the processor), so this table has no site_id and is deliberately OUTSIDE the three tenant GDPR paths in api/routes/gdpr.js; erasure is a direct-to-controller request handled via support@sourcetrack.ai. Service-role only; RLS default-deny. Written by api/routes/marketing.js.';
