-- Migration: c2_convergence_primary_keys
-- Purpose: Adds missing primary keys on id for 6 tables with proper idempotency, null-backfill, and duplicate abort checks.

-- 1. company_members (Processed first, with duplicate pre-check comment)
-- DEDUP PRE-CHECK: Ensure no null id values exist and raise an exception if duplicate id values exist before creating the primary key constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.company_members'::regclass and contype = 'p'
  ) then
    -- Backfill null ids if any exist
    update public.company_members set id = gen_random_uuid() where id is null;

    -- LOUD ABORT ON DUPLICATES: Prevent PK creation and abort transaction if duplicates exist
    if exists (
      select 1 from public.company_members
      group by id
      having count(*) > 1
    ) then
      raise exception 'C2: duplicate ids in company_members — resolve manually before PK add';
    end if;

    alter table public.company_members alter column id set not null;
    alter table public.company_members add primary key (id);
  end if;
end $$;


-- 2. companies
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.companies'::regclass and contype = 'p'
  ) then
    update public.companies set id = gen_random_uuid() where id is null;

    if exists (
      select 1 from public.companies
      group by id
      having count(*) > 1
    ) then
      raise exception 'C2: duplicate ids in companies — resolve manually before PK add';
    end if;

    alter table public.companies alter column id set not null;
    alter table public.companies add primary key (id);
  end if;
end $$;


-- 3. qa_notes
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.qa_notes'::regclass and contype = 'p'
  ) then
    update public.qa_notes set id = gen_random_uuid() where id is null;

    if exists (
      select 1 from public.qa_notes
      group by id
      having count(*) > 1
    ) then
      raise exception 'C2: duplicate ids in qa_notes — resolve manually before PK add';
    end if;

    alter table public.qa_notes alter column id set not null;
    alter table public.qa_notes add primary key (id);
  end if;
end $$;


-- 4. saved_reports
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.saved_reports'::regclass and contype = 'p'
  ) then
    update public.saved_reports set id = gen_random_uuid() where id is null;

    if exists (
      select 1 from public.saved_reports
      group by id
      having count(*) > 1
    ) then
      raise exception 'C2: duplicate ids in saved_reports — resolve manually before PK add';
    end if;

    alter table public.saved_reports alter column id set not null;
    alter table public.saved_reports add primary key (id);
  end if;
end $$;


-- 5. dashboard_widgets
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.dashboard_widgets'::regclass and contype = 'p'
  ) then
    update public.dashboard_widgets set id = gen_random_uuid() where id is null;

    if exists (
      select 1 from public.dashboard_widgets
      group by id
      having count(*) > 1
    ) then
      raise exception 'C2: duplicate ids in dashboard_widgets — resolve manually before PK add';
    end if;

    alter table public.dashboard_widgets alter column id set not null;
    alter table public.dashboard_widgets add primary key (id);
  end if;
end $$;


-- 6. admin_audit_log
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.admin_audit_log'::regclass and contype = 'p'
  ) then
    update public.admin_audit_log set id = gen_random_uuid() where id is null;

    if exists (
      select 1 from public.admin_audit_log
      group by id
      having count(*) > 1
    ) then
      raise exception 'C2: duplicate ids in admin_audit_log — resolve manually before PK add';
    end if;

    alter table public.admin_audit_log alter column id set not null;
    alter table public.admin_audit_log add primary key (id);
  end if;
end $$;
