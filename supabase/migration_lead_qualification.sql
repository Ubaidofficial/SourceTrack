-- Migration: lead qualification tracking
-- Safe: additive only, no DROP/DELETE/TRUNCATE

CREATE TABLE IF NOT EXISTS lead_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  qualified boolean NOT NULL DEFAULT true,
  qualified_by uuid REFERENCES auth.users(id),
  qualified_at timestamptz DEFAULT now(),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE(site_id, visitor_id)
);

ALTER TABLE lead_qualifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Site member access" ON lead_qualifications
  FOR ALL USING (
    site_id IN (
      SELECT s.id FROM sites s
      WHERE s.owner_id = auth.uid()
      UNION
      SELECT s.id FROM sites s
      INNER JOIN company_members cm ON cm.company_id = s.company_id
      WHERE cm.user_id = auth.uid()
    )
  );
