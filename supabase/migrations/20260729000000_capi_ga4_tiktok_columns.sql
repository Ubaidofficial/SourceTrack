-- CAPI breadth: GA4 (Measurement Protocol) + TikTok (Events API) config columns.
--
-- Adds the per-site credential columns the two new senders read, and widens the
-- capi_deliveries.platform CHECK to admit 'ga4'. 'tiktok' is ALREADY permitted by
-- the existing constraint (verified read-only on prod 2026-07-29: the whitelist is
-- meta, google, microsoft, linkedin, tiktok) — it is re-stated below only because a
-- CHECK cannot be extended in place; it must be dropped and re-added whole.
--
-- ⚠️ COLUMN-NAME DEVIATION — READ BEFORE APPLYING (see PR body):
--   The build brief named the TikTok id column `tiktok_advertiser_id`. That is the
--   WRONG identifier for this API. TikTok's Events API v1.3 /event/track/ requires
--   `event_source_id` = the **Pixel Code**; the advertiser ID belongs to the
--   Marketing (reporting) API and is rejected here. Shipping `tiktok_advertiser_id`
--   would reproduce exactly the class of stillborn sender this work exists to fix,
--   so the column is named `tiktok_pixel_code`. It deliberately avoids the string
--   `tiktok_pixel_id`, which the capi-select-columns guard still FORBIDs as a
--   phantom column from the earlier abandoned attempt.
--   This migration is UNAPPLIED — renaming now is free; renaming after apply costs
--   a second migration. Reject this file if you want the original name instead.
--
-- Secrets: ga4_api_secret and tiktok_capi_token hold AES-256-GCM ciphertext written
-- by encryptCapiToken() (api/lib/conversion-sync.js). Never plaintext, never read
-- back by any endpoint. ga4_measurement_id and tiktok_pixel_code are non-secret
-- identifiers and ARE echoed in GET /api/integrations/capi/status.
--
-- RLS: these columns are added to the EXISTING public.sites table and inherit its
-- row-level security unchanged. `sites` has no UPDATE policy for the authenticated
-- role, so a client-side write to these columns silently no-ops. The ONLY supported
-- write path is the service-role route POST /api/integrations/capi/:platform —
-- identical to every existing CAPI column. No new policy is granted here on purpose.
--
-- GDPR (§6.5): no new PII store. These are tenant credentials on `sites`, removed
-- with the workspace by the account-deletion path; capi_deliveries already carries
-- site_id -> sites(id) ON DELETE CASCADE (verified on prod). No new erasure path.
--
-- §8: idempotent guards throughout; forward-only; CC does NOT apply this file.

-- ── sites: GA4 Measurement Protocol ──────────────────────────────────────────
alter table public.sites add column if not exists ga4_measurement_id text;
alter table public.sites add column if not exists ga4_api_secret     text;

comment on column public.sites.ga4_measurement_id is
  'GA4 Measurement Protocol measurement_id (non-secret, e.g. G-XXXXXXX). Set via POST /api/integrations/capi/ga4.';
comment on column public.sites.ga4_api_secret is
  'GA4 Measurement Protocol api_secret, AES-256-GCM encrypted at rest via encryptCapiToken(). Never returned by any endpoint.';

-- ── sites: TikTok Events API ─────────────────────────────────────────────────
alter table public.sites add column if not exists tiktok_pixel_code text;
alter table public.sites add column if not exists tiktok_capi_token text;

comment on column public.sites.tiktok_pixel_code is
  'TikTok Pixel Code, sent as event_source_id on Events API v1.3 /event/track/ (non-secret). NOT the advertiser id — that belongs to the Marketing API and is rejected here.';
comment on column public.sites.tiktok_capi_token is
  'TikTok Events API access token, AES-256-GCM encrypted at rest via encryptCapiToken(). Sent as the Access-Token header. Never returned by any endpoint.';

-- ── capi_deliveries.platform: admit 'ga4' ────────────────────────────────────
-- Drop/re-add is the only way to widen a CHECK. The re-add revalidates every
-- existing row; the new set is a strict superset of the old one, so no existing
-- row can violate it (capi_deliveries also had 0 rows on prod at authoring time).
--
-- Why this matters beyond the constraint: logCapiDelivery() swallows insert errors
-- into a console.error (api/lib/capi-deliveries.js). A platform missing from this
-- whitelist would therefore FORWARD the conversion successfully and then vanish
-- from the delivery log with no surfaced error — a silent observability hole, not
-- a loud failure. Any future platform must be added here in the same PR.
alter table public.capi_deliveries drop constraint if exists capi_deliveries_platform_check;
alter table public.capi_deliveries add constraint capi_deliveries_platform_check
  check (platform = any (array['meta', 'google', 'microsoft', 'linkedin', 'tiktok', 'ga4']));
