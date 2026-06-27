-- Migration: clean up orphaned public.company_members rows and actualize the
-- drifted user_id -> auth.users(id) ON DELETE CASCADE foreign key.
-- The FK was declared in the non-timestamped supabase/migration_workspaces.sql
-- but was NEVER applied to prod (schema drift) — this timestamped migration is
-- the forward source of truth. The old file is intentionally left untouched.
-- Order matters: orphans (user_id with no matching auth.users row) MUST be
-- deleted BEFORE adding the FK, otherwise the ADD CONSTRAINT fails on the
-- violating rows. The FK add is guarded for idempotency / cross-env safety.

begin;

-- 1. Remove orphaned membership rows (no corresponding auth.users)
delete from public.company_members cm
where not exists (
  select 1 from auth.users u where u.id = cm.user_id
);

-- 2. Add the FK with ON DELETE CASCADE (idempotent guard for cross-env safety)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_members_user_id_fkey'
  ) then
    alter table public.company_members
      add constraint company_members_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

commit;
