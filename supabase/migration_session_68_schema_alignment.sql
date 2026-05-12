-- Session 68/69B: Schema alignment
-- Restores expected columns and tables to match codebase expectations
-- without breaking legacy public site_key=1.
--
-- SAFETY RULES:
--   * Additive only — no DROP TABLE, no CASCADE, no DELETE
--   * Legacy site_key=1 preserved (integer -> text conversion preserves value as '1')
--   * Empty shell tables repaired via CREATE TABLE IF NOT EXISTS + ALTER ADD COLUMN
--   * sites row data preserved — only columns added or types safely converted
--   * Idempotent: uses IF NOT EXISTS / safe backfill patterns
--
-- WHY site_key becomes text:
--   * Onboarding generates UUID strings via crypto.randomUUID()
--   * Frontend sends site_key as strings in URL query params
--   * Tracker loader reads data-site-key as string from HTML attribute
--   * Converting int(1) -> text('1') preserves the legacy value
--   * DEFAULT gen_random_uuid()::text handles future inserts that omit site_key

BEGIN;

-- ============================================================
-- 1. Enable pgcrypto for gen_random_uuid()
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 2. Convert site_key from integer to text
--    Legacy value 1 becomes '1'
-- ============================================================
ALTER TABLE sites
  ALTER COLUMN site_key TYPE text USING site_key::text;

ALTER TABLE sites
  ALTER COLUMN site_key SET DEFAULT gen_random_uuid()::text;

-- ============================================================
-- 3. Add missing columns to sites
-- ============================================================
ALTER TABLE sites ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS plan text DEFAULT 'trial';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE sites ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS onboarding_state jsonb DEFAULT '{}'::jsonb;

-- Backfill sites
UPDATE sites SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE sites SET plan = 'trial' WHERE plan IS NULL;
UPDATE sites SET created_at = now() WHERE created_at IS NULL;
UPDATE sites SET onboarding_completed = false WHERE onboarding_completed IS NULL;
UPDATE sites SET onboarding_state = '{}'::jsonb WHERE onboarding_state IS NULL;

-- Safe index for internal site id. Not a primary key to avoid brittle legacy-table failures.
CREATE UNIQUE INDEX IF NOT EXISTS sites_id_uidx ON sites(id);

-- ============================================================
-- 4. Ensure expected tables exist
--    These CREATE statements are non-destructive.
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id uuid DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS company_members (
  id uuid DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS saved_reports (
  id uuid DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id uuid DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid DEFAULT gen_random_uuid()
);

CREATE TABLE IF NOT EXISTS qa_notes (
  id uuid DEFAULT gen_random_uuid()
);

-- ============================================================
-- 5. Repair companies
-- ============================================================
ALTER TABLE companies ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE companies ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE companies ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE companies SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE companies SET created_at = now() WHERE created_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_id_uidx ON companies(id);

-- ============================================================
-- 6. Repair company_members
-- ============================================================
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE company_members ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE company_members SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE company_members SET role = 'user' WHERE role IS NULL;
UPDATE company_members SET created_at = now() WHERE created_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS company_members_id_uidx ON company_members(id);

-- ============================================================
-- 7. Repair saved_reports
-- ============================================================
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE saved_reports ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS site_id uuid;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE saved_reports SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE saved_reports SET config = '{}'::jsonb WHERE config IS NULL;
UPDATE saved_reports SET created_at = now() WHERE created_at IS NULL;
UPDATE saved_reports SET updated_at = now() WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS saved_reports_id_uidx ON saved_reports(id);

-- ============================================================
-- 8. Repair dashboard_widgets
-- ============================================================
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE dashboard_widgets ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS widget_type text;
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS position int DEFAULT 0;
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE dashboard_widgets SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE dashboard_widgets SET config = '{}'::jsonb WHERE config IS NULL;
UPDATE dashboard_widgets SET position = 0 WHERE position IS NULL;
UPDATE dashboard_widgets SET created_at = now() WHERE created_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_widgets_id_uidx ON dashboard_widgets(id);

-- ============================================================
-- 9. Repair admin_audit_log
-- ============================================================
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE admin_audit_log ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS admin_user_id uuid;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS target_id text;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

UPDATE admin_audit_log SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE admin_audit_log SET metadata = '{}'::jsonb WHERE metadata IS NULL;
UPDATE admin_audit_log SET created_at = now() WHERE created_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS admin_audit_log_id_uidx ON admin_audit_log(id);

-- ============================================================
-- 10. Repair qa_notes
-- ============================================================
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE qa_notes ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS feature_key text;
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS note_type text;
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS note_text text;
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE qa_notes SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE qa_notes SET created_at = now() WHERE created_at IS NULL;
UPDATE qa_notes SET updated_at = now() WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS qa_notes_id_uidx ON qa_notes(id);

-- ============================================================
-- 11. Company membership — create default company + member for legacy owner
-- ============================================================

-- Create default company if none exists.
INSERT INTO companies (id, name, created_at)
SELECT gen_random_uuid(), 'Default Workspace', now()
WHERE NOT EXISTS (
  SELECT 1 FROM companies WHERE name = 'Default Workspace'
);

-- Add legacy site owner as admin member.
INSERT INTO company_members (id, company_id, user_id, role, created_at)
SELECT gen_random_uuid(), c.id, s.owner_id, 'admin', now()
FROM companies c
CROSS JOIN sites s
WHERE s.site_key = '1'
  AND s.owner_id IS NOT NULL
  AND c.name = 'Default Workspace'
  AND NOT EXISTS (
    SELECT 1
    FROM company_members cm
    WHERE cm.company_id = c.id
      AND cm.user_id = s.owner_id
  )
LIMIT 1;

-- Assign company_id to legacy site.
UPDATE sites
SET company_id = (
  SELECT cm.company_id
  FROM company_members cm
  WHERE cm.user_id = sites.owner_id
  LIMIT 1
)
WHERE site_key = '1'
  AND company_id IS NULL
  AND owner_id IS NOT NULL;

COMMIT;

-- ============================================================
-- Verification queries to run after migration
-- ============================================================
-- SELECT site_key, pg_typeof(site_key), id, plan, created_at, company_id FROM sites;
--
-- SELECT table_name, column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name IN (
--   'sites',
--   'companies',
--   'company_members',
--   'saved_reports',
--   'dashboard_widgets',
--   'admin_audit_log',
--   'qa_notes'
-- )
-- ORDER BY table_name, ordinal_position;