-- Session 57: Backend-persisted saved reports
-- Replaces localStorage-only report storage (Session 14)
-- These are NOT widgets — they are saved Report Builder configurations.
-- No drag-and-drop, no resize, no multi-dashboard implied.

CREATE TABLE IF NOT EXISTS saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  site_id uuid REFERENCES sites(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner access" ON saved_reports
  FOR ALL
  USING (auth.uid() = user_id);

-- Index for per-site lookup
CREATE INDEX IF NOT EXISTS idx_saved_reports_user_site
  ON saved_reports (user_id, site_id);
