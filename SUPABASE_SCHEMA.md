# Supabase Schema Notes

This file documents the current expected Supabase schema and migration state.

`supabase/schema.sql` may be stale. Verify live schema using Supabase SQL Editor before making schema assumptions.

## Purpose

Use this file to quickly answer:

- Which Supabase tables should exist?
- Which migrations matter?
- Which tables are accessed directly by app code?
- Which RLS policies are expected?
- How do we verify the live DB?

## Important migrations

Current important migration files:

- `supabase/migration_session_68_schema_alignment.sql`
- `supabase/migration_workspaces.sql`
- `supabase/migration_saved_reports.sql`
- `supabase/migration_onboarding.sql`
- `supabase/migration_admin_phase2.sql`

## Main schema alignment migration

File:

- `supabase/migration_session_68_schema_alignment.sql`

Purpose:

- Add/repair expected tables and columns.
- Preserve legacy `site_key = '1'`.
- Convert `site_key` to text.
- Create missing shell tables.
- Add columns idempotently.
- Avoid destructive SQL.

Safety requirements:

- No `DROP TABLE`
- No `DELETE FROM`
- No `TRUNCATE`
- No `CASCADE`
- Additive only

## Expected tables

Live DB should include:

- `sites`
- `companies`
- `company_members`
- `saved_reports`
- `dashboard_widgets`
- `admin_audit_log`
- `qa_notes`

## `sites`

Important expected columns:

- `id`
- `site_key`
- `owner_id`
- `company_id`
- `plan`
- `stripe_customer_id`
- `onboarding_completed`
- `onboarding_state`
- `created_at`

Notes:

- Legacy local `site_key` can be `'1'`.
- `site_key` is text after migration.
- `company_id` links a site to a workspace/company.
- `owner_id` remains useful for legacy fallback and ownership checks.

## Workspaces

Tables:

- `companies`
- `company_members`

Expected use:

- `companies`: workspace/company records.
- `company_members`: user membership and role mapping.
- `sites.company_id`: links site to workspace.

Auth code expects:

- `sites.company_id`
- `sites.owner_id`
- `company_members.company_id`
- `company_members.user_id`
- `company_members.role`

## Saved reports

Table:

- `saved_reports`

Expected columns:

- `id`
- `user_id`
- `site_id`
- `name`
- `config`
- `created_at`
- `updated_at`

Saved reports are backend-persisted and scoped by user/site.

Expected policy:

- `Owner access`

## Dashboard widgets

Table:

- `dashboard_widgets`

Expected columns include:

- `id`
- `owner_id`
- `widget_type`
- `config`
- `position`
- `created_at`

Current status:

- Table exists.
- Policy may be absent.
- Not critical until dashboard widget persistence becomes active work.

## Admin

Tables:

- `admin_audit_log`
- `qa_notes`

Expected access pattern:

- Backend service-role routes access these tables.
- Normal frontend users should not directly read/write them.

Expected policies:

- `admin_audit_log`: Service key access only
- `qa_notes`: Service key access only

## RLS/policies verified

Current expected policies:

- `admin_audit_log` -> Service key access only
- `companies` -> users can read their companies
- `company_members` -> users can read own memberships
- `qa_notes` -> Service key access only
- `saved_reports` -> Owner access
- `sites` -> users can read own sites

`dashboard_widgets` may not have a policy yet. This is okay until dashboard widget persistence becomes active work.

## Verification queries

Run in Supabase SQL Editor.

Tables:

    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'sites',
        'companies',
        'company_members',
        'saved_reports',
        'dashboard_widgets',
        'admin_audit_log',
        'qa_notes'
      )
    order by table_name;

Columns:

    select table_name, column_name, data_type
    from information_schema.columns
    where table_schema = 'public'
      and (
        table_name in ('companies', 'company_members', 'saved_reports', 'admin_audit_log', 'qa_notes')
        or (table_name = 'sites' and column_name in (
          'id',
          'site_key',
          'owner_id',
          'company_id',
          'plan',
          'stripe_customer_id',
          'onboarding_completed',
          'onboarding_state',
          'created_at'
        ))
      )
    order by table_name, ordinal_position;

Policies:

    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'companies',
        'company_members',
        'saved_reports',
        'admin_audit_log',
        'qa_notes',
        'dashboard_widgets',
        'sites'
      )
    order by tablename, policyname;

## Migration safety check

Run locally before applying schema migrations:

    cd "$HOME/Desktop/trackiq"

    grep -nEi "^\s*(DROP TABLE|DELETE FROM|TRUNCATE|ALTER TABLE .* DROP|CASCADE)" \
      supabase/migration_session_68_schema_alignment.sql \
      supabase/migration_workspaces.sql \
      supabase/migration_saved_reports.sql \
      supabase/migration_onboarding.sql \
      supabase/migration_admin_phase2.sql || true

Expected:

- No active destructive SQL.

## Known schema issue

`supabase/schema.sql` is stale and should eventually be updated to match the real migrated schema.

Until then:

- Treat migrations and live Supabase verification as source of truth.
- Do not rely on `schema.sql` alone for current schema.
