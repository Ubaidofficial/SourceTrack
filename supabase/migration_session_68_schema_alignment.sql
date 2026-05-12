-- Session 68 (hardened Session 69A): Schema alignment
-- Restores expected columns and tables to match codebase expectations
-- without breaking legacy public site_key=1.
--
-- SAFETY RULES:
--   * Additive only — no DROP TABLE, no CASCADE, no DELETE
--   * Legacy site_key=1 preserved (integer → text conversion preserves value as '1')
--   * Empty shell tables repaired via ALTER TABLE ADD COLUMN IF NOT EXISTS (no drops)
--   * sites row data preserved — only columns added or types safely converted
--   * Idempotent: uses IF NOT EXISTS / IF EXISTS / safe backfill patterns
--
-- WHY site_key becomes text:
--   * Onboarding generates UUID strings via crypto.randomUUID()
--   * Frontend sends site_key as strings in URL query params
--   * Tracker loader reads data-site-key as string from HTML attribute
--   * PostgREST eq('site_key', '1') works on both int and text, but inserts fail for UUID strings on int columns
--   * Converting int(1) → text('1') preserves the legacy value
--   * DEFAULT gen_random_uuid()::text handles future inserts that omit site_key (e.g., Settings.jsx)
--
-- EXPECTED RUNTIME ORDER:
--   1. Enable pgcrypto extension
--   2. Convert site_key type (integer → text)
--   3. Add missing sites columns
--   4. Backfill sites.id, plan, created_at
--   5. Repair empty shell tables (ALTER ADD COLUMN, no drops)
--   6. Create company + membership for legacy owner

BEGIN;

-- ============================================================
-- 1. Enable pgcrypto for gen_random_uuid()
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 2. Convert site_key from integer to text (backward-compatible)
--    Legacy value 1 becomes '1', new UUID strings become text
-- ============================================================
ALTER TABLE sites ALTER COLUMN site_key TYPE text USING site_key::text;

-- Set default for future rows that don't explicitly provide site_key
ALTER TABLE sites ALTER COLUMN site_key SET DEFAULT gen_random_uuid()::text;

-- ============================================================
-- 3. Add missing columns to sites (additive, no data loss)
-- ============================================================

-- Internal primary key — used for PostHog properties.site_id and all analytics queries
ALTER TABLE sites ADD COLUMN IF NOT EXISTS id uuid;

-- Plan gating — validateSiteKey checks plan for trial/inactive status
ALTER TABLE sites ADD COLUMN IF NOT EXISTS plan text DEFAULT 'trial';

-- Trial period calculation — validateSiteKey checks 14-day window
ALTER TABLE sites ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Company membership — requireSiteMembership uses this
ALTER TABLE sites ADD COLUMN IF NOT EXISTS company_id uuid;

-- Billing — Stripe checkout uses this for customer portal
ALTER TABLE sites ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Onboarding — Session 16
ALTER TABLE sites ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT FALSE;

-- Onboarding — Session 16
ALTER TABLE sites ADD COLUMN IF NOT EXISTS onboarding_state jsonb DEFAULT '{}';

-- ============================================================
-- 4. Backfill existing rows with safe defaults
-- ============================================================

-- Backfill id for the one existing row (site_key='1')
-- Only updates rows where id is still NULL (idempotent)
UPDATE sites SET id = gen_random_uuid() WHERE id IS NULL;

-- Backfill plan for any rows with NULL plan
UPDATE sites SET plan = 'trial' WHERE plan IS NULL;

-- Backfill created_at for any rows with NULL created_at
UPDATE sites SET created_at = now() WHERE created_at IS NULL;

-- ============================================================
-- 5. Repair empty shell tables — add columns (no drops, no CASCADE)
--    These tables exist as empty shells with zero columns.
--    ALTER TABLE ADD COLUMN IF NOT EXISTS is idempotent and safe.
-- ============================================================

-- companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE companies ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- company_members
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS company_id uuid;
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS role text DEFAULT 'user';
ALTER TABLE company_members ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- saved_reports
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS site_id uuid;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- dashboard_widgets
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS widget_type text;
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS config jsonb DEFAULT '{}'::jsonb;
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS position int DEFAULT 0;
ALTER TABLE dashboard_widgets ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- admin_audit_log
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS admin_user_id uuid;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS target_id text;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- qa_notes
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS id uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS feature_key text;
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS note_type text;
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS note_text text;
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE qa_notes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ============================================================
-- 6. Company membership — create default company + member for legacy owner
-- ============================================================

-- Create a default company for the legacy site owner (if not already exists)
INSERT INTO companies (id, name, created_at)
  SELECT gen_random_uuid(), 'Default Workspace', now()
  WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = 'Default Workspace');

-- Add the legacy site owner as admin member of the first company
-- Only if a company now exists and the user is not already a member
INSERT INTO company_members (company_id, user_id, role, created_at)
  SELECT c.id, s.owner_id, 'admin', now()
  FROM companies c, sites s
  WHERE s.site_key = '1'
    AND NOT EXISTS (
      SELECT 1 FROM company_members cm
      WHERE cm.company_id = c.id AND cm.user_id = s.owner_id
    )
  LIMIT 1;

-- Assign company_id to the legacy site
UPDATE sites
  SET company_id = (
    SELECT cm.company_id FROM company_members cm
    WHERE cm.user_id = sites.owner_id
    LIMIT 1
  )
  WHERE site_key = '1' AND company_id IS NULL;

-- ============================================================
-- 7. Post-migration verification comments
-- ============================================================
-- After running, verify:
--   SELECT site_key, pg_typeof(site_key) FROM sites;         -- should show '1' :: text
--   SELECT id, plan, created_at, company_id FROM sites;      -- should be populated
--   SELECT * FROM companies;                                  -- at least 1 row
--   SELECT * FROM company_members;                            -- legacy owner as admin
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name IN ('companies','company_members','saved_reports','dashboard_widgets','admin_audit_log','qa_notes')
--     ORDER BY table_name;                                    -- all expected columns present

COMMIT;
