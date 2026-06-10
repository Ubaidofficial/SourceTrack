-- Migration: Site Identity Links
-- Purpose: Durable mapping between user_id and anonymous_id per site.
--          Enables server/offline conversions sent with user_id to resolve
--          the visitor's anonymous_id for attribution engine touchpoint joins.
-- Safe: additive only, no DROP/DELETE/TRUNCATE, idempotent

-- 1. Create site_identity_links table
CREATE TABLE IF NOT EXISTS site_identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id text NOT NULL
    CHECK (length(trim(user_id)) > 0 AND length(user_id) <= 256),
  anonymous_id text NOT NULL
    CHECK (length(trim(anonymous_id)) > 0 AND length(anonymous_id) <= 256),
  source text NOT NULL DEFAULT 'identify'
    CHECK (source IN ('identify', 'browser_conversion', 'offline_conversion', 'server_event')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_identity_links_no_self_link CHECK (user_id <> anonymous_id)
);

-- 2. Unique constraint: one mapping per (site_id, user_id, anonymous_id)
-- Enables ON CONFLICT upserts and prevents duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS site_identity_links_uniq
  ON site_identity_links(site_id, user_id, anonymous_id);

-- 3. Lookup index: given site_id + user_id → all anonymous_ids
-- Used by attribution resolution: getAnonymousIdsForUser(siteId, userId)
CREATE INDEX IF NOT EXISTS idx_site_identity_links_site_user
  ON site_identity_links(site_id, user_id);

-- 4. Reverse lookup index: given site_id + anonymous_id → all user_ids
-- Not used in v1 but supports future reverse resolution and GDPR deletion.
CREATE INDEX IF NOT EXISTS idx_site_identity_links_site_anon
  ON site_identity_links(site_id, anonymous_id);

-- 5. Enable RLS — no policies defined.
-- All access is via service role (server-side API routes only).
-- No dashboard/client code should query this table.
ALTER TABLE site_identity_links ENABLE ROW LEVEL SECURITY;
