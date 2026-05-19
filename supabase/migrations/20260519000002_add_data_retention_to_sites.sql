-- Add data_retention_days to sites table for GDPR compliance
-- NULL = keep forever (default); any positive integer = auto-purge after N days
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS data_retention_days integer DEFAULT NULL;

COMMENT ON COLUMN sites.data_retention_days IS
  'Number of days to retain attributed_conversions data. NULL means keep forever. Set by owner via Settings → Privacy. Enforced nightly by the auto-purge job.';

-- Add anonymous_id to attributed_conversions so we can scope visitor-level deletes
-- (some rows may pre-date this column — they will have NULL and won't be visitor-deletable)
ALTER TABLE attributed_conversions
  ADD COLUMN IF NOT EXISTS anonymous_id text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS attributed_conversions_anonymous_id_idx
  ON attributed_conversions (site_id, anonymous_id)
  WHERE anonymous_id IS NOT NULL;
