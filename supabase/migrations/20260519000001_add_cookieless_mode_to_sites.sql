-- Add cookieless_mode flag to sites table
-- When true, the tracker serves tracker.cookieless.js instead of tracker.min.js
-- and the visitor_id is derived server-side (no localStorage / cookies used).
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS cookieless_mode boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN sites.cookieless_mode IS
  'When true, the site uses server-derived daily-rotating hash IDs instead of localStorage. No browser storage required — GDPR/ePrivacy compliant without a consent banner.';
