-- volunteered_identity: add the missing FK so account/workspace deletion
-- CASCADE-purges it, matching the three sibling PII tables.
--
-- DEFECT: the create migration (20260723000000) keyed site_id as a bare
-- `uuid not null` with no FK. Its siblings lead_qualifications,
-- site_identity_links and subscription_identity all carry
-- `site_id -> sites(id) ON DELETE CASCADE`, so DELETE /api/gdpr/account
-- (the only path that deletes a `sites` row — there is no per-site delete route)
-- cascade-purges them. volunteered_identity had NEITHER a cascade NOR an explicit
-- delete in /gdpr/account, so account deletion left real volunteered emails/names
-- as orphans — a retention defect on genuine PII.
--
-- FIX = one mechanism, matching the siblings: FK CASCADE. Deliberately NOT also an
-- explicit delete in /gdpr/account — two overlapping mechanisms diverge over time.
--
-- §8 ORDERING: an ON DELETE CASCADE FK add FAILS if violating (orphan) rows exist,
-- so delete orphans FIRST. Verified pre-apply: staging = 35 rows all -> de200000
-- (exists), prod = 0 rows -> no orphans in either environment. The delete is a
-- no-op there, kept for safety/idempotency across environments.
--
-- The redundant index volunteered_identity_distinct_idx (it duplicates the UNIQUE
-- (site_id, distinct_id) constraint's index on identical columns) is NOT dropped
-- here — cleanup-only, logged in KNOWN_ISSUES; dropping it now would need its own
-- apply-to-both-envs round to keep the drift gate green.
--
-- NOT APPLIED by the agent. Founder hand-applies staging -> prod (§8). Idempotent.

delete from public.volunteered_identity vi
where not exists (select 1 from public.sites s where s.id = vi.site_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'volunteered_identity_site_id_fkey'
      and conrelid = 'public.volunteered_identity'::regclass
  ) then
    alter table public.volunteered_identity
      add constraint volunteered_identity_site_id_fkey
      foreign key (site_id) references public.sites(id) on delete cascade;
  end if;
end $$;
