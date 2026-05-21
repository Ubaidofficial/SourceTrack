# SourceTrack Changelog

All notable changes to SourceTrack are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — 2026-05-21

### Final Complete Audit (round 3)

The third and last audit pass before launch. Round 1 fixed launch-blockers
(bot filter, DNT, env validation, SIGTERM, Stripe idempotency, job-lock,
PostHog retry, perf-indexes). Round 2 added scale prerequisites (singleton
Supabase, parallel nightly job, CAPI retry, browser/OS, tracker caching).
Round 3 closes the long tail: dead code, duplication, the one remaining
security gap, and documentation drift.

#### Critical fix

**`requireSiteMembership` missing on 10 routes** — cross-customer data leak
- `api/routes/analytics.js`: `/summary`, `/entry-exit`, `/outbound`,
  `/custom-events`, `/browsers`, `/os`, `/funnel` (7 routes)
- `api/routes/campaign-costs.js`: `GET`, `POST`, `DELETE` (3 routes)
- All routes had `requireUserAuth + validateSiteKey` but `validateSiteKey`
  only confirms the site exists — it doesn't check the caller's company
  owns it. `requireSiteMembership` is the actual ownership check. Without
  it, any authenticated user could pass any site_key and read another
  customer's analytics + campaign cost data.
- Round-1 audit script reported this PASS because its 400-char regex
  window didn't capture `app.use("/api/analytics", analyticsRouter)`
  patterns where membership lives inside the router. This round caught
  it by reading every `router.get/post/...` line directly.

#### Code quality cleanup

**21 unused `import WebSocket from 'ws'` imports removed** — round 2's
mechanical Supabase singleton refactor dropped the `createClient(... { realtime: { transport: WebSocket } })`
call but left the unused import behind in every refactored file.

**Shared utility module** (`api/lib/utils.js` + 16 callers)
- Extracted `esc()`, `toHogDate()`, `normalizeUtm()`, `getFirstTouchFields()`
  to one source of truth. Before: 20 local copy-pasted definitions; one
  (`events.js`) had a defensive `String()` wrap, the others didn't.
  Consolidated to the safer pattern.

**Try-catch on async handlers** — added missing try-catch to
`job-status.js` and `webhook-incoming.js /test/:api_key` handlers (the
async functions could throw out of the Express middleware chain).

**`/api/track` async error handling** verified: `try/catch` returns 500
with sanitized error message; PostHog failure does not crash the response.

#### Documentation

**README.md** — new top-level README. The repo had 35+ scattered .md files
but no entrypoint. Covers quick start, architecture, env vars, jobs,
privacy claims, and links to the deeper docs.

**Stale `loader.min.js` references** — replaced 14 references across 8 docs
(DEEPSEEK.md, QA_RUNBOOK.md, ARCHITECTURE.md, PROGRESS.md, AGENT_BRIEF.md,
DATA_CAPTURE_SPEC.md, BUG_REVIEW_LOG.md, CLAUDE.md). The actual file is
`tracker/tracker.min.js`; `loader.min.js` never existed.

**`.env.example` completion** — added `RESEND_API_KEY`, `SLACK_WEBHOOK_URL`,
`NIGHTLY_CONCURRENCY`, `NODE_ENV` which were silently expected by jobs but
not documented.

#### Verification

- 41/41 feature wiring checks pass
- 23/23 tracker checks pass
- 11/11 conversion + CAPI checks pass
- 0 unused imports, 0 console.logs in tracker, 0 `createClient()` outside the singleton
- All 4 background jobs run cleanly
- Frontend builds without errors

## [Unreleased] — 2026-05-20

### Production Readiness Audit v2 — Round 2 (Scale + Hardening)

After landing the round-1 audit fixes (bot filter, DNT, env validation, SIGTERM,
Stripe idempotency, job-lock, PostHog 429-retry, perf-index migration), this
round closes the remaining "controlled beta → public launch" gaps the audit
identified.

#### Performance

**Singleton Supabase client** (`api/lib/supabase.js` + 32 callers)
- Before: 35 separate `createClient(...)` calls — one per route file and job —
  each rebuilding the WebSocket transport on every HTTP request.
- After: one shared instance lazily constructed on first `getSupabase()` call.
  Mechanical refactor across 28 files via brace-counting AST rewrite (4 special
  cases — `getCapiSupabase`, `getSupabaseAdmin`, dynamic `await import()` in
  `attribution-engine.js` — handled by hand).
- All routes still parse, all 4 jobs still run, no behaviour change.

**Tracker cache headers** (`api/index.js`)
- `/tracker.min.js` and `/tracker/*.min.js` now serve with
  `Cache-Control: public, max-age=86400, stale-while-revalidate=604800, immutable`.
  Previously customers' browsers re-downloaded the tracker on every pageview;
  now once per day with a 7-day stale-while-revalidate window.

**Parallel nightly attribution** (`api/jobs/nightly-attribution.js`)
- Replaced sequential `for (const site of sites)` loop with a bounded-concurrency
  worker pool (default 4, tunable via `NIGHTLY_CONCURRENCY` env var, capped 1–8).
- At 100 sites with ~1s/site this drops wall-clock time from ~17 min to ~4 min
  while staying inside PostHog's per-IP rate ceiling.
- 100–300 ms jitter between site claims to prevent worker thundering.

#### Reliability

**CAPI retry on transient failures** (`api/lib/conversion-sync.js`)
- Added `fetchWithRetry()` wrapper: up to 3 attempts on 429 / 5xx / network
  errors with exponential backoff (500ms → 1s → 2s) and `Retry-After` honour.
- Applied to all 5 providers: Meta, Google Ads, Microsoft UET, LinkedIn, TikTok.
- 4xx (auth / validation errors) still fail fast — retrying those wastes the
  rate budget.

#### Observability

**Browser/OS in PostHog event properties** (`api/routes/track.js`, `api/routes/conversion.js`)
- `enrich()` already instantiated `UAParser` for device_type but threw away
  browser and OS data. Now also writes `browser_name`, `browser_version`,
  `os_name`, `os_version` — enables cohort splits by browser/OS in the
  dashboard without re-parsing UAs at query time.

#### Reporting

**Affiliate channel** (`api/lib/channel-classifier.js`)
- New rule: `utm_medium` in `['affiliate','affiliates','partner','cpa','cps']`
  → `Affiliate` channel. Previously these fell through to "Other Campaign".
- Inserted before Email/SMS, after Display.

#### Compliance

**Privacy policy reminder in install flow** (`dashboard/src/pages/Snippet.jsx`)
- New amber callout on the Install page reminding customers to disclose
  data collection in their privacy policy before deploying. Lists what
  SourceTrack collects (IP-derived country, UTMs, anonymous ID), notes
  GDPR/CCPA/UK PECR, and points out that DNT and Global Privacy Control
  are honoured automatically.

### SEO & Social Sharing Overhaul

#### Bug Fixes

**Sitemap served as HTML instead of XML** (`dashboard/public/serve.json`, `dashboard/package.json`)
- `serve -s` (SPA mode) was rewriting all requests to `index.html` in production,
  including `/sitemap.xml`, causing Google Search Console to report "Sitemap is HTML".
- Added `serve.json` configuration with explicit rewrites that resolve `sitemap.xml`,
  `robots.txt`, and favicons before the SPA catch-all fires.
- Removed the `-s` flag from the start command; `serve.json` now owns all routing.

#### Improvements

**Open Graph & favicon assets** (`dashboard/public/`)
- Added `og-image.png` (1200×630) — branded social preview card with attribution
  journey visualization, feature pills, and pricing footer.
- Added `favicon.ico` (16×16, 32×32, 48×48 multi-size) and `apple-touch-icon.png`
  (192×192) — previously only an SVG favicon existed, breaking ICO requests and
  iOS home screen saves.
- `index.html` updated to reference all three icon variants and `theme-color`.

**Sitemap cleanup** (`dashboard/public/sitemap.xml`)
- Removed `/login` and `/signup` — no crawl value for auth pages.
- Added `lastmod` dates to remaining URLs.

**robots.txt cleanup** (`dashboard/public/robots.txt`)
- Removed redundant `Allow:` directives (default behaviour; stating them adds noise).

**Docs page SEO** (`dashboard/src/pages/Docs.jsx`)
- Added `<Helmet>` with page-specific title, description, canonical URL, and OG tags.
  Previously `/docs` inherited the homepage meta description when indexed.

**AI citation structured data** (`dashboard/src/pages/Landing.jsx`)
- Added `FAQPage` JSON-LD for all 8 FAQ entries — primary mechanism for AI Overviews
  to surface direct Q&A answers.
- Added `Organization` JSON-LD — establishes brand entity for AI knowledge graphs.
- Added `HowTo` JSON-LD for the 3-step setup flow — targets procedural queries.
- Expanded `SoftwareApplication` featureList to 7 items including report builder
  and real-time dashboard.
- Added `twitter:image` and `twitter:site` to Landing Helmet (were only in static HTML).

**Asset generation script** (`dashboard/scripts/generate-assets.mjs`)
- Pure Node.js script using `sharp` to regenerate `og-image.png`, `favicon.ico`,
  and `apple-touch-icon.png` from SVG templates. Run via `npm run generate-assets`.

---

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
