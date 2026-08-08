-- Enable RLS on the three abuse-guard / usage-log tables. Issue #641.
--
-- ⚠️ TARGET: STAGING (nrsvpwzekfrdrzkoecfk). PROD IS ALREADY CORRECT.
--   Verified read-only on both projects 2026-08-05:
--     prod    (zxjjjsipafojhzkkumvh) -> relrowsecurity = true  on all three
--     staging (nrsvpwzekfrdrzkoecfk) -> relrowsecurity = FALSE on all three
--   Staging alone drifted. The statements below are idempotent, so applying to prod
--   is a harmless no-op — but the change that is actually needed is staging's.
--
-- WHY THIS MATTERS. RLS-disabled is harmless only when nothing is granted. That is not
-- the case here: on staging, `anon` and `authenticated` hold Supabase's permissive
-- default grants — SELECT, INSERT, UPDATE, DELETE, TRUNCATE — and with RLS off there is
-- nothing to stop them. Anyone with the staging anon key (a publishable key, by design)
-- can TRUNCATE the two blocklists, which SILENTLY defeats enforce_free_tier_abuse_guards:
-- its checks are `IF EXISTS (SELECT 1 FROM disposable_email_domains WHERE ...)` and the
-- equivalent suffix lookup, and against an empty table those pass trivially. The trigger
-- keeps reporting healthy while enforcing nothing. usage_email_log is the idempotency log
-- for api/jobs/usage-threshold-emails.js; forged or deleted rows suppress or duplicate
-- threshold emails.
--
-- NO POLICIES ARE CREATED, DELIBERATELY. Default-deny is the complete and correct end
-- state, because every real reader bypasses RLS:
--   * paas_subdomain_blocklist, disposable_email_domains
--       read ONLY by the trigger function enforce_free_tier_abuse_guards(), declared
--       SECURITY DEFINER (20260522000002_free_tier_abuse_guards.sql:48-51; trigger
--       sites_free_tier_abuse_guards at :101-104). SECURITY DEFINER runs as the function
--       owner, so RLS does not apply. There is NO JS reader — free-tier abuse prevention
--       is enforced at the DB layer and api/lib/abuse-guards.js is vestigial.
--   * usage_email_log
--       read/written ONLY by api/jobs/usage-threshold-emails.js:147,174 via the
--       service-role client, which bypasses RLS.
--   Verified at 5e6864f5: ZERO references to any of the three in dashboard/src/ or
--   marketing/src/. Adding a policy here would re-open exactly what this closes.
--
-- IDEMPOTENT AND SAFE TO RE-RUN. `enable row level security` is a no-op when already
-- enabled; the to_regclass guard additionally makes the file safe in an environment where
-- one of the tables has not been created yet, rather than aborting the whole migration.
--
-- NOT APPLIED BY THE AUTHORING AGENT (CLAUDE.md §8). Founder reviews and hand-applies.

do $$
declare
  t text;
begin
  foreach t in array array[
    'public.paas_subdomain_blocklist',
    'public.disposable_email_domains',
    'public.usage_email_log'
  ]
  loop
    if to_regclass(t) is null then
      raise notice 'skipping % — table does not exist in this environment', t;
    else
      execute format('alter table %s enable row level security', t);
      raise notice 'RLS enabled on % (no-op if already enabled)', t;
    end if;
  end loop;
end
$$;

-- Post-apply verification. Expect relrowsecurity = true for all three rows.
--
--   select c.relname, c.relrowsecurity as rls_enabled
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public'
--     and c.relname in (
--       'paas_subdomain_blocklist',
--       'disposable_email_domains',
--       'usage_email_log'
--     )
--   order by c.relname;
--
-- And confirm the guard still fires after the change — RLS must not have broken the
-- SECURITY DEFINER read path. Insert a site with a disposable-domain owner email and
-- confirm it is still rejected by enforce_free_tier_abuse_guards, exactly as before.
