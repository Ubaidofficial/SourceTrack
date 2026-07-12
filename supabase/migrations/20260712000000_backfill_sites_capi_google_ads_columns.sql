-- BACKFILL: sites' CAPI-token + Google-Ads columns. These exist in PROD but were
-- HAND-APPLIED and NEVER committed as migrations — which is why staging lacked all of
-- them and CAPI + Google Ads offline-conversion upload was UNTESTABLE on staging (the
-- SELECTs below hit non-existent columns and threw).
--
-- CODE-REQUIRED (load-bearing): read by
--   api/routes/conversion.js:441, api/routes/conversion-offline.js:248 (SELECT bag),
--   api/lib/conversion-sync.js:183-211, api/routes/capi.js:28.
-- Column NAMES are exact (from those SELECTs). TYPES are `text` (ids/tokens; some tokens
-- are stored encrypted — still text). ⚠️ Verify types against prod's information_schema;
-- the schema-drift check surfaces any mismatch on first run.
--
-- ADD COLUMN IF NOT EXISTS ⇒ no-op on prod (columns exist) and on already-converged
-- staging; only materializes on a fresh DB. FILE ONLY — orchestrator hand-applies.

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS meta_pixel_id                    text,
  ADD COLUMN IF NOT EXISTS meta_capi_token                  text,
  ADD COLUMN IF NOT EXISTS google_ads_customer_id           text,
  ADD COLUMN IF NOT EXISTS google_ads_conversion_action_id  text,
  ADD COLUMN IF NOT EXISTS google_ads_developer_token       text,
  ADD COLUMN IF NOT EXISTS microsoft_tag_id                 text,
  ADD COLUMN IF NOT EXISTS microsoft_capi_token             text,
  ADD COLUMN IF NOT EXISTS linkedin_partner_id              text,
  ADD COLUMN IF NOT EXISTS linkedin_capi_token              text;
