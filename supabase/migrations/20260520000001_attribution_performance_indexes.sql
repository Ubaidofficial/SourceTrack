-- Performance indexes for attributed_conversions and pageviews.
-- These match the access patterns used by the dashboard and attribution APIs:
--   (site_id, conversion_date DESC)  — time-range filters
--   (site_id, first_touch_channel)   — channel group-bys
--   (site_id, first_touch_source)    — source group-bys
--   (site_id, status)                — qualified-lead filters
--   (site_id, distinct_id)           — per-visitor journey lookups
--   (site_id, timestamp DESC)        — pageviews time-range
--   (session_id)                     — session continuity
--
-- CONCURRENTLY avoids locking the table on creation. IF NOT EXISTS makes
-- the migration safe to re-run.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ac_site_date
  ON attributed_conversions(site_id, conversion_date DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ac_site_channel
  ON attributed_conversions(site_id, first_touch_channel);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ac_site_source
  ON attributed_conversions(site_id, first_touch_source);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ac_site_status
  ON attributed_conversions(site_id, status) WHERE status IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ac_site_distinct
  ON attributed_conversions(site_id, distinct_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pageviews_site_ts
  ON pageviews(site_id, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pageviews_session
  ON pageviews(session_id) WHERE session_id IS NOT NULL;
