-- AI crawler published IP ranges — storage for the refresh job.
--
-- WHY THIS TABLE EXISTS: api/lib/ai-crawler-detect.js takes `ranges` as a
-- caller-supplied Map and deliberately does no I/O. Until now nothing built that
-- Map, so every VENDOR_JSON crawler resolved to `ua_only` — the 8 IP-verifiable
-- bots were verifiable in principle and unverified in practice. This is where the
-- fetched CIDR lists live so a verdict of `ip_verified` can be earned.
--
-- NOT TENANT DATA. These are public, vendor-published CIDR lists — identical for
-- every customer. There is no site_id and there must never be one: a per-tenant
-- copy of a global fact would drift. Consequently this table is NOT part of the
-- three GDPR paths (§6.5) — it holds no PII and nothing subject-linkable, exactly
-- like the crawler_hits datasource it serves.
--
-- RLS: enabled with NO policies = default-deny for `anon` and `authenticated`
-- (§6.5 "Never expose a table to the anon or authenticated role without an
-- explicit policy"). The refresh job and the API read it with the service role,
-- which bypasses RLS. Do not add a permissive policy to "make it readable" — if a
-- client ever needs these ranges, serve them through an API route, not the table.
--
-- FAIL-OPEN CONTRACT (enforced in api/lib/ai-crawler-ranges.js, not here): rows
-- are UPSERTed per bot only on a successful fetch+parse. A vendor endpoint being
-- down leaves the previous row untouched — last-known-good is retained rather
-- than blanked. `fetched_at` is therefore the honest freshness signal: a stale
-- fetched_at means "these ranges are old", never "these ranges are gone".

create table if not exists public.ai_crawler_ranges (
  -- Matches AI_CRAWLERS[].token in api/lib/ai-crawler-detect.js verbatim. That
  -- registry is the source of truth for which tokens are legal here; this table
  -- deliberately has no FK to it because the registry lives in code, not the DB.
  bot_token      text primary key,

  -- Array of CIDR strings, IPv4 and IPv6 mixed, exactly as published by the
  -- vendor and validated by isValidCidr() before write. Never null, never
  -- written empty — an empty parse is treated as a failed refresh (fail-open).
  cidrs          jsonb       not null default '[]'::jsonb,

  -- The URL this list came from (AI_CRAWLERS[].rangeUrl at time of fetch), kept
  -- so a range that turns out to be wrong can be traced to its source.
  source_url     text,

  -- Last SUCCESSFUL fetch. Not touched by a failed refresh — that is the whole
  -- point: it distinguishes "refreshed and unchanged" from "could not refresh".
  fetched_at     timestamptz not null default now(),

  -- Row count from the last successful parse, for cheap observability without
  -- deserialising the jsonb.
  cidr_count     integer     not null default 0,

  updated_at     timestamptz not null default now()
);

comment on table public.ai_crawler_ranges is
  'Vendor-published crawler IP ranges (global, not tenant-scoped). Refreshed by api/jobs/ai-crawler-range-refresh.js; read by ai-crawler-ranges.js to build the Map that api/lib/ai-crawler-detect.js verifies against. Fail-open: a failed refresh retains the prior row.';

comment on column public.ai_crawler_ranges.fetched_at is
  'Last SUCCESSFUL fetch. A failed refresh leaves this untouched, so staleness is visible rather than silently overwritten.';

-- Idempotent guard (§8): safe to re-run across environments.
do $$
begin
  if not exists (
    select 1 from pg_class where relname = 'ai_crawler_ranges_fetched_at_idx'
  ) then
    create index ai_crawler_ranges_fetched_at_idx
      on public.ai_crawler_ranges (fetched_at desc);
  end if;
end $$;

-- Default-deny. Enabling RLS with no policy denies anon + authenticated outright;
-- the service role (job + API) bypasses RLS and is the only intended reader.
alter table public.ai_crawler_ranges enable row level security;
