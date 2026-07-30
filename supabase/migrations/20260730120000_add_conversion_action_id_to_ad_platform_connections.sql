-- Add conversion_action_id to ad_platform_connections.
--
-- WHY: CAPI's Google offline-conversion upload needs a Google Ads conversion
-- action to post against. That id previously lived on sites.google_ads_conversion_action_id,
-- alongside sites.google_ads_developer_token — a per-site developer token, which is a
-- credential Google issues ONCE to the software provider (SourceTrack), never to an
-- individual advertiser. That column can never be populated correctly, so the whole
-- sites-column credential set is being retired in favour of the OAuth connection that
-- api/routes/ad-platforms.js already establishes and stores here.
--
-- Ad-cost import (read direction) and CAPI offline-conversion upload (write direction)
-- need the SAME Google Ads OAuth grant. One connection row per (site_key, platform)
-- now serves both; conversion_action_id is the only CAPI-specific field it lacked.
--
-- NULLABLE ON PURPOSE. A row can legitimately be `connected` for ad-cost import with no
-- conversion action configured — that is the normal state for a site that imports cost
-- but does not upload conversions. It is also the intermediate state right after OAuth
-- completes and before the operator picks an action. Making it NOT NULL would break
-- ad-cost-only connections and would violate chk_google_credentials' notion of a
-- complete `connected` row.
--
-- DELIBERATELY NOT TOUCHED IN THIS MIGRATION (CLAUDE.md §8, forward-only):
--   * sites.google_ads_developer_token      — DEAD. Impossible per-site credential (above).
--   * sites.google_ads_customer_id          — DEAD. Superseded by ad_platform_connections.account_id.
--   * sites.google_ads_conversion_action_id — DEAD. Superseded by the column added here.
--   * sites.google_ads_access_token         — PHANTOM. Read by the old sender but present in
--     NO migration and NO SELECT list; verified absent from prod `sites`, which has exactly
--     three google_ads_* columns. Nothing to drop; recorded so the next reader does not
--     go looking for it.
-- Dropping the three real dead columns is a SEPARATE, LATER migration, gated on a
-- read-only prod check that zero rows reference them. As of 2026-07-30 that check already
-- reads zero on prod (0 sites with a developer token, customer id, or conversion action id;
-- 0 rows in ad_platform_connections) — but the drop still ships on its own, after this
-- lands, so a rollback of the code change never has to also roll back a column drop.
--
-- RLS: none needed here. ad_platform_connections already has RLS ENABLED with two
-- tenant-scoped policies (SELECT + ALL, both via sites.owner_id = auth.uid() OR
-- company_members.user_id = auth.uid()) from 20260608010000_add_ad_platform_connections.sql.
-- Verified live on prod: relrowsecurity = true, 2 policies. Adding a column inherits them;
-- re-declaring them here would be a second, divergent copy.

ALTER TABLE public.ad_platform_connections
  ADD COLUMN IF NOT EXISTS conversion_action_id text;

COMMENT ON COLUMN public.ad_platform_connections.conversion_action_id IS
  'Google Ads conversion action numeric id for CAPI offline-conversion upload. NULL is valid: an ad-cost-only connection, or a connection awaiting action selection. Unused for meta_ads.';

-- Notify PostgREST to reload schema cache (matches the table's creating migration).
NOTIFY pgrst, 'reload schema';
