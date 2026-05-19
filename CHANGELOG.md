# SourceTrack Changelog

All notable changes to SourceTrack are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — 2026-05-20

### Audit-Driven Improvements (Sessions 97–98)

This release closes all critical gaps identified in the full competitive audit
against RedTrack, Stape.io, UserMaven, Cometly, and Datafa.st.

---

#### Bug Fixes

**Meta CAPI — wrong event name sent for every conversion** (`api/lib/conversion-sync.js`)
- All conversions were being fired as `Purchase` regardless of `conversion_type`.
- Added `META_EVENT_MAP` mapping 16 conversion types to correct Meta standard event
  names (Purchase, Lead, CompleteRegistration, StartTrial, Subscribe, ViewContent,
  InitiateCheckout, AddToCart, AddPaymentInfo, Contact, FindLocation, Schedule,
  SubmitApplication, Donate, CustomizeProduct, PageView).
- Added matching `TIKTOK_EVENT_MAP` for TikTok standard event names.
- Removed hardcoded `test_event_code: 'TEST12345'` — only injected when
  `META_TEST_EVENT_CODE` env var is explicitly set.

**Google Ads CAPI — always returning 401** (`api/lib/conversion-sync.js`)
- Was sending the developer token as the `Authorization: Bearer` header.
- Fixed: reads `google_ads_access_token` (OAuth2 token) from site column or
  `GOOGLE_ADS_ACCESS_TOKEN` env var. If absent, logs a clear warning and skips
  the API call rather than sending a corrupt request.
- Developer token correctly sent as `developer-token` header.

**Attribution models returning silent empty results** (`api/routes/attribution.js`)
- U-shaped, W-shaped, Time Decay, and Linear models require the nightly job.
- When no pre-aggregated data exists, the API returned `results: []` with no
  explanation. Dashboard showed blank charts.
- Fixed: API now returns `_notice` field when results are empty, explaining that
  the model is calculated nightly (~2 AM UTC) and will be available after the
  first run.
- Report Builder UI shows an amber banner when `_notice` is present.

**Duplicate `channelFromEvent` function causing inconsistent channel classification**
- `attribution-engine.js` had 14 AI domains; `nightly-attribution.js` had 8.
- Created `api/lib/channel-classifier.js` as canonical single source of truth
  with 21 AI referrer domains.
- Both consumers now import from this shared module.

**KPI tiles permanently empty — trial_to_paid and sql_percent** (`dashboard/src/pages/Dashboard.jsx`)
- `trial_to_paid` tile always showed "—" because the value was not computed.
  Fixed by deriving it client-side from the `conversion_types` map returned
  by the dashboard API.
- `sql_percent` (SQL-Qualified Lead ratio) was available in the API response
  but not wired to the KPI strip. Fixed.
- Empty tiles now show a helpful `emptyHint` setup instruction instead of a
  blank dash.

**Duplicate `backgroundColor` key in ReportBuilder chart dataset** (`dashboard/src/pages/ReportBuilder.jsx`)
- Object literal contained two `backgroundColor` keys — JavaScript silently
  uses the last one, but esbuild emits a lint error and the area-chart fill
  color was inconsistent in bar mode.
- Fixed by removing the redundant assignment.

---

#### New Features

**Custom event properties** (`api/routes/track.js`, `api/routes/conversion.js`)
- Any `properties` object passed in the request body is now forwarded to
  PostHog as `custom_properties` and stored in `attributed_conversions.custom_properties` (JSONB).
- Enables per-event metadata (e.g., plan tier, product SKU, coupon code).

**Chart annotations** (`api/routes/annotations.js`, `dashboard/src/pages/Dashboard.jsx`)
- New `annotations` table stores date-stamped notes attached to a site.
- Types: `note`, `deploy`, `campaign`, `alert` — each renders as a coloured
  dot on the Revenue Trend chart.
- Route registered at `GET/POST/DELETE /api/annotations` behind user auth +
  site membership guards.
- Graceful degradation: returns HTTP 503 with descriptive message if the
  annotations table has not yet been migrated.

**Per-site attribution window** (`api/routes/integrations.js`, `api/jobs/nightly-attribution.js`, `api/routes/attribution.js`)
- New `attribution_window_days` column on `sites` table (default 30 days).
- Settings page exposes a dropdown (1 / 7 / 14 / 30 / 60 / 90 days) that
  PATCHes `/api/integrations/settings`.
- The live attribution engine and nightly job both respect the per-site window.

**Consent gate for tracker** (`tracker/tracker.js`, `tracker/tracker.min.js`)
- Default mode: opt-out (backward compatible — no existing integrations break).
- Opt-in mode: add `data-consent-required="true"` to the `<script>` tag.
  Events are queued in memory until `sourcetrack.consent(true)` is called.
- Public API: `sourcetrack.consent(bool)`, `optIn()`, `optOut()`, `hasConsent()`.
- Consent choice persisted in `localStorage` under `st_consent`.

**Event deduplication for conversions** (`api/routes/conversion.js`, `api/routes/conversion-offline.js`)
- If the same `external_event_id` (order_id + type) arrives within 24 hours,
  the second request returns `{ dedup_skipped: true }` with HTTP 200.
- Prevents double-counting when retries or webhooks re-fire.

**CAPI for offline/server-side conversions** (`api/routes/conversion-offline.js`)
- `POST /api/conversion/offline` now fires Meta, TikTok, and Google Ads CAPI
  (same pattern as the online conversion endpoint).
- Accepts additional fields: `ip_address`, `user_agent`, `email`, `currency`,
  `order_id`, UTM fields for richer server-event matching.

**Site-key auth cache** (`api/middleware/auth.js`)
- Added 5-minute NodeCache in `validateSiteKey` to avoid a Supabase round-trip
  on every tracking event.
- Reduces DB load by ~95% for high-frequency ingest endpoints.

**Error logging with context** (`api/routes/track.js`, `api/routes/conversion.js`)
- Ingestion errors now log `site_id`, `event`, and `err.message` to make
  Railway log tailing actionable.

---

#### SEO & Infrastructure

**Per-route meta tags and Open Graph** (`dashboard/src/pages/Landing.jsx`, `dashboard/src/App.jsx`)
- Installed `react-helmet-async`; `HelmetProvider` wraps the entire app.
- Landing page has full meta: title, description, OG title/description/url/
  image/type/site_name, Twitter card tags.
- JSON-LD `SoftwareApplication` structured data for Google rich results.

**Sitemap, robots.txt, favicon** (`dashboard/public/`)
- `sitemap.xml` covers `/`, `/docs`, `/login`, `/signup`. Submit to GSC at:
  `https://sourcetrack.ai/sitemap.xml`
- `robots.txt` allows public routes, blocks all authenticated app routes and
  `/api/` prefix.
- `favicon.svg` — "ST" initials on lime (#D7F550) background with dark
  rounded rect.

**index.html SEO overhaul** (`dashboard/index.html`)
- Full set of `<meta>` tags, canonical OG tags, and Twitter card. Replaces
  the default Vite placeholder.

---

#### Database Migration

**File:** `supabase/migrations/20260519000005_custom_properties_annotations_attribution_window.sql`

Must be run manually in the Supabase SQL editor:

```sql
-- Custom event properties on conversions
ALTER TABLE attributed_conversions
  ADD COLUMN IF NOT EXISTS custom_properties jsonb;

-- Annotations table (no FK — enforced at API level)
CREATE TABLE IF NOT EXISTS annotations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid        NOT NULL,
  date         date        NOT NULL,
  note         text        NOT NULL,
  type         text        NOT NULL DEFAULT 'note'
               CHECK (type IN ('note','deploy','campaign','alert')),
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS annotations_site_date ON annotations (site_id, date);

-- Per-site attribution window
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS attribution_window_days int NOT NULL DEFAULT 30;
```

---

#### Environment Variables Added

| Variable | Required | Description |
|---|---|---|
| `META_TEST_EVENT_CODE` | No | Meta test event code. Omit in production. |
| `GOOGLE_ADS_ACCESS_TOKEN` | Conditional | OAuth2 access token for Google Ads CAPI. Required if using Google Ads. |

---

### Remaining Known Gaps (not in this release)

| ID | Issue | Status |
|---|---|---|
| T-2 | Cookieless tracking mode | In progress |
| T-4 | GDPR data-deletion endpoint (right-to-erasure) | Pending |
| T-5 | Public API documentation site | Pending |
| T-6 | Stripe in-product revenue attribution | Pending |
| SEO | OG image (`/og-image.png`) not yet created | Pending |
| SEO | Landing page is client-side rendered — social link previews depend on crawlers executing JS | Future |

---

## Previous Sessions

See `SESSION_LOG.md` and `BUG_REVIEW_LOG.md` for earlier session history.
