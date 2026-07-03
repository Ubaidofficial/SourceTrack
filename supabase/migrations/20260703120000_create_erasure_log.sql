-- GDPR erasure audit log (SCOPE_v3 §10, Phase 7).
--
-- Durable record of every Tinybird erasure attempt so a FAILED delete is
-- retryable and provable rather than silently swallowed (contrast: the PostHog
-- Persons leg is best-effort with no record). Written service-role-only from
-- api/routes/gdpr.js after the Tinybird erase step runs.
--
-- NOT APPLIED by the agent. Founder reviews + hand-applies staging -> prod (§8).
-- Idempotent: guarded so it is safe to run across environments.

create table if not exists public.erasure_log (
  id            uuid primary key default gen_random_uuid(),
  subject_id    text not null,                     -- anonymous_id / distinct_id erased
  site_id       uuid,                              -- internal site id (null for account-level)
  datasources   text[] not null default '{}',      -- e.g. {events, events_by_visitor}
  requested_at  timestamptz not null default now(),
  executed_at   timestamptz,                       -- null until a real delete ran
  status        text not null,                     -- dry_run | skipped_no_admin_token
                                                    -- | skipped_not_configured | executed | failed
  row_counts    jsonb,                             -- { events: N, events_by_visitor: M }
  detail        jsonb                              -- per-datasource job ids / errors / condition
);

-- Retry/triage lookups: recent rows, and failures needing a re-run.
create index if not exists erasure_log_status_requested_idx
  on public.erasure_log (status, requested_at desc);
create index if not exists erasure_log_subject_idx
  on public.erasure_log (subject_id);

-- Tenant-scoped operational data → RLS ON, DEFAULT-DENY (no policies).
-- Only the service role (which bypasses RLS) writes/reads this table; the anon
-- and authenticated roles get NOTHING. Per CLAUDE.md §6.5: never expose a table
-- to anon/authenticated without an explicit policy; default-deny.
alter table public.erasure_log enable row level security;

comment on table public.erasure_log is
  'GDPR erasure audit trail (Tinybird leg). Service-role only; RLS default-deny. See api/routes/gdpr.js + tinybird/adapter/erase.js.';
