-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: custom_properties + annotations + attribution_window
-- Safe to re-run (fully idempotent).
-- ─────────────────────────────────────────────────────────────────────────────

-- Feature 1: Custom event properties on conversions
ALTER TABLE attributed_conversions
  ADD COLUMN IF NOT EXISTS custom_properties jsonb;

-- Feature 2: Chart annotations table
CREATE TABLE IF NOT EXISTS annotations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     uuid        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  date        date        NOT NULL,
  note        text        NOT NULL,
  type        text        NOT NULL DEFAULT 'note'
              CHECK (type IN ('note', 'deploy', 'campaign', 'alert')),
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS annotations_site_date
  ON annotations (site_id, date DESC);

-- RLS: enable (safe to run if already enabled)
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;

-- Policy: drop first so re-runs don't fail with "already exists"
DROP POLICY IF EXISTS "site members can manage annotations" ON annotations;

CREATE POLICY "site members can manage annotations"
  ON annotations FOR ALL
  USING (
    site_id IN (
      SELECT s.id FROM sites s
      LEFT JOIN company_members cm ON cm.company_id = s.company_id
      WHERE s.owner_id = auth.uid() OR cm.user_id = auth.uid()
    )
  );

-- Feature 3: Per-site attribution window (default 30 days)
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS attribution_window_days int NOT NULL DEFAULT 30;

-- NOTE: No user_id index — attributed_conversions uses distinct_id, not user_id.
-- The user identity stitching column does not exist in the current schema.
