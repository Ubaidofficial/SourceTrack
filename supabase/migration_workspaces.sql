-- Migration: workspaces + company membership + super admin support
-- Run this against the Supabase Postgres database.

-- 1. Companies / Workspaces
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- 2. Company members (roles: admin, user)
CREATE TABLE IF NOT EXISTS company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, user_id)
);

ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

-- 3. Add company_id to sites (nullable for backward compat)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;

-- 4. Super admin flag — stored as a raw_app_meta_data claim in Supabase auth
-- Set manually via Supabase dashboard → Authentication → Users → Edit → raw_app_meta_data:
-- { "role": "super_admin" }
-- Or via SQL:
-- UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data || '{"role":"super_admin"}'::jsonb WHERE id = '<user-uuid>';

-- 5. RLS policies — customers see only their own company's data
CREATE POLICY "Member access" ON company_members FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Member access" ON companies FOR SELECT
  USING (EXISTS (SELECT 1 FROM company_members WHERE company_id = companies.id AND user_id = auth.uid()));

-- Allow admins to manage members in their company
CREATE POLICY "Admin insert" ON company_members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM company_members WHERE company_id = NEW.company_id AND user_id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin delete" ON company_members FOR DELETE
  USING (EXISTS (SELECT 1 FROM company_members WHERE company_id = company_members.company_id AND user_id = auth.uid() AND role = 'admin'));

-- Sites: members of the company can see the company's sites
CREATE POLICY "Company member access" ON sites FOR SELECT
  USING (company_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM company_members WHERE company_id = sites.company_id AND user_id = auth.uid()
  ));

-- Service key bypasses all RLS — backend API routes use service key for unrestricted access.
-- Super admin checks happen in application code via raw_app_meta_data.
