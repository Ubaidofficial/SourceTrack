# Known Issues

This file should stay short. Only include verified issues or high-confidence risks.

Do not use this file as a backlog for every idea. Use it to prevent repeated mistakes.

## Current verified/high-confidence issues


### 1. `schema.sql` is stale

The live database schema has been repaired through migrations, but `supabase/schema.sql` does not fully reflect the current tables/columns/policies.

Relevant files:

- `SUPABASE_SCHEMA.md`
- `supabase/migration_session_68_schema_alignment.sql`

Current rule:

- Treat migrations and live Supabase verification as source of truth.
- Do not rely on `schema.sql` alone.

### 2. Dashboard widgets policy not verified

RLS policies are verified for:

- `companies`
- `company_members`
- `sites`
- `saved_reports`
- `admin_audit_log`
- `qa_notes`

`dashboard_widgets` policy may be missing. This is not blocking until dashboard widget persistence becomes active work.

Relevant future session:

- Session 81 dashboard saved-report widgets

### 3. ~~No paid ad click-ID capture~~ — ACTUALLY WORKING

**This issue was wrong. Click IDs ARE captured end-to-end:**

- Tracker captures: `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `twclid`
- `api/routes/track.js` stores all of them on the PostHog event
- `api/lib/channel-classifier.js` uses them for channel classification:
  - `gclid/gbraid/wbraid/msclkid` → Paid Search
  - `fbclid/ttclid` → Paid Social
- `api/jobs/nightly-attribution.js` reads click IDs from touchpoints and writes them to `attributed_conversions`
- Confidence scoring adds +20 points when a click ID is present on the first/last touch

**What is still missing (truly):**
- `ad_id`, `campaign_id`, `adset_id`, `creative_id` — granular ad-level breakdown (requires ad platform API or manual UTM tagging)
- These are not captured because they require platform-specific integrations, not just URL params

### 4. No ad spend ingestion yet

Do not claim:

- ad spend import
- ROAS
- ad account reporting
- ad set reporting
- ad ID reporting
- creative reporting

unless new code proves it.

### 5. AI referrer detection can undercount

AI source detection depends on referrer. Some AI tools strip referrers.

Safe claim:

    SourceTrack detects AI referrals when the platform sends a detectable referrer.

Unsafe claim:

    SourceTrack has universal AI traffic detection.

AI-search attribution depends on a referrer being present (client `document.referrer` or server `Referer` header). If a source strips the referrer, the visit lands as "direct" and no COALESCE/detection can recover it. This is a real limit of the approach, not a bug.

Note: The server-fallback path (bare referrer -> middleware -> `properties.ai_source`) is verified by code-trace, not yet by a live referrer-only event. A referrer-only live test would close this verification gap.

### 6. HogQL gotchas

Avoid:

- `toFloat64OrZero`
- `COUNT(CASE WHEN...)`
- ambiguous `distinct_id` in joins

Prefer:

- `toFloatOrZero`
- `countIf()`
- qualified aliases

### 7. Backup files can confuse audits

Old `.bak` files may exist from prior sessions.

Before production readiness or broad audits, check:

    find api dashboard/src tracker -name "*.bak*" -print

### 8. Keyless conversions bypass deduplication

Deduplication requires an `order_id` / `external_event_id` to be present. Keyless conversions (no `order_id` supplied) are counted as-fired by design to avoid silently merging genuine distinct conversions from the same user.

## Recently fixed

### Safe JS-based Multi-Touch Attribution Engine (Session 105)
- **Linear/Advanced Attribution HogQL error** `Unable to resolve field: ce` — RESOLVED.
  - Rewrote the multi-touch live calculation pipeline to run fully in JavaScript.
  - The engine now fetches conversions and visitor touchpoints separately using simple, highly indexable ClickHouse queries, completely avoiding slow and buggy correlated subqueries that fail in HogQL.
  - Verified all 8 models (first_touch, last_touch, first_touch_non_direct, last_touch_non_direct, linear, time_decay, u_shaped, w_shaped) using both a deterministic QA harness and a controlled live API integration test against real PostHog ClickHouse data.
  - Live integration test confirmed exact $120.00 revenue reconciliation per model after PostHog cloud indexing (~295 s ingestion latency, within expected 2–5 min window).
  - PostHog cloud ClickHouse ingestion latency is non-trivial; integration test polling window is 10 minutes. This is expected infrastructure behaviour, not a code bug.

### Final Complete Audit — Round 3 (2026-05-21)

- **Cross-customer data leak in /api/analytics/* and /api/campaign-costs**
  (10 routes) — RESOLVED. Routes had `requireUserAuth + validateSiteKey`
  but not `requireSiteMembership`, so any authenticated user with any
  valid site_key could read another customer's data. Added the membership
  check to all 10 routes.
- **21 unused `import WebSocket from 'ws'` imports** — RESOLVED. Round 2
  refactor missed the cleanup.
- **20 duplicated helper functions across 16 files** — RESOLVED. Extracted
  to `api/lib/utils.js` (esc, toHogDate, normalizeUtm, getFirstTouchFields).
- **`loader.min.js` references in 8 docs** — RESOLVED. File never existed;
  customers reading these docs would have copied a 404-ing URL.
- **README.md missing** — RESOLVED. Created top-level entrypoint.
- **`.env.example` missing RESEND_API_KEY, SLACK_WEBHOOK_URL,
  NIGHTLY_CONCURRENCY, NODE_ENV** — RESOLVED.

### Production Readiness Audit v2 — Round 1 + 2 (2026-05-20)

Audit-driven fixes covering attribution, CAPI, security, scaling, and ops.

**Round 1** (commit 8fc8809):
- Bot filter on `/api/track` — keeps PostHog clean of crawler events
- DNT / Global Privacy Control honoured in `tracker.js` and `analytics.js`
- Stripe webhook idempotency (event.id dedup in NodeCache, 24h TTL)
- Concurrency lock on nightly-attribution via `job_runs.status='running'`
- PostHog 429 / 5xx retry with exponential backoff and `Retry-After`
- Graceful SIGTERM/SIGINT shutdown — drains in-flight requests on deploy
- Fail-fast env validation at startup (SUPABASE_URL / SERVICE_KEY / POSTHOG_*)
- Performance index migration `20260520000001_attribution_performance_indexes.sql`
  (7 indexes — applied & validated in Supabase)

**Round 2** (this commit):
- Singleton Supabase client (`api/lib/supabase.js`) — replaced 35 `createClient()`
  calls across 32 files
- Tracker cache headers: `public, max-age=86400, stale-while-revalidate=604800, immutable`
- Parallel nightly attribution — bounded concurrency 4 (env `NIGHTLY_CONCURRENCY`)
- CAPI retry on 429/5xx/network (Meta, Google, Microsoft, LinkedIn, TikTok)
- Browser/OS enrichment in /api/track and /api/conversion
- Affiliate channel classification
- Privacy policy reminder in Snippet.jsx install flow

### Conversion ref/source/via parity (Session 78)

`api/routes/conversion.js` now persists `ref_param`, `source_param`, and `via_param` on conversion events, matching `api/routes/track.js`.

### Saved report request body bug

Fixed by centralizing JSON body normalization in:

- `dashboard/src/lib/api.js`

### Channel taxonomy

Fixed/added:

- `AI Search` channel label
- `Revenue by Channel` preset
- `Conversions by Channel` preset
- session report channel grouping bug

### Saved reports backend persistence

Saved reports now use the backend route and `saved_reports` table.

## Not bugs / expected behavior

### Vite chunk-size warning

Dashboard build may show chunk-size warning. This is not currently a build failure.

### Chrome devtools well-known 404

Chrome may request:

    /.well-known/appspecific/com.chrome.devtools.json

404 is harmless.

### Dashboard no-data state

A channel report can show no rows if the local site has no conversions in the selected date range.

### API 401 for curl without auth

Authenticated dashboard/report endpoints require a Bearer token. A curl request without Authorization can return:

    Missing or invalid Authorization header

This is expected for protected API routes.

### 9. /api/collect missing CORS headers (Fixed in Session 92)
POST /api/collect, /api/conversion, /api/identify were blocked by CORS 
when called from tracker on a different origin (localhost:8080, customer websites).
Fixed by adding /api/collect, /api/conversion, /api/identify to isPixelRoute 
check in both middleware blocks + explicit CORS headers on /api/collect route.
### 4. Journey touchpoints previously excluded organic/direct/AI (FIXED Session 95)
The nightly-attribution.js touchpoints query had `utm_source IS NOT NULL` filter — organic search, direct, referral and AI referral visits were invisible in every user's journey. Fixed in Session 95 by removing the filter and adding referrer + ai_source + derived_source to the query.

### 5. channel column in attributed_conversions was missing (FIXED Session 95)
group_by=channel in attribution API was silently broken — no channel column existed. Fixed in Session 95: added channel + channel_30d columns, channelFromEvent() enhanced with click ID detection, batch job writes channel on every conversion.

### 6. data-quality-check.js was missing (FIXED Session 94)
Crontab ran this file at 3 AM every night — file didn't exist, silently crashing. Fixed in Session 94.

### 7. _st cross-domain system was redundant (FIXED Session 94)
Two conflicting cross-domain systems existed. _st system built in error — removed. __tq_id/__tq_ft system is the correct one, carries full attribution data.

### 8. Meta CAPI sent wrong event names (FIXED Session 97–98)
All conversion types were firing as `Purchase`. META_EVENT_MAP with 16 type mappings added to conversion-sync.js.

### 9. Google Ads CAPI always 401 (FIXED Session 97–98)
Developer token was passed as Bearer token. Fixed: OAuth2 access token read from `google_ads_access_token` site column or `GOOGLE_ADS_ACCESS_TOKEN` env var.

### 10. Nightly attribution models returned silent empty results (FIXED Session 97–98)
U-shaped / W-shaped / Time Decay / Linear models showed blank charts with no explanation. Fixed: `_notice` field returned when empty; UI amber banner explains nightly job timing.

### 11. Duplicate channelFromEvent — AI domains diverged (FIXED Session 97–98)
attribution-engine.js had 14 AI domains; nightly job had 8. Canonical `api/lib/channel-classifier.js` created with 21 domains; both consumers import from it.


## New Known Gaps (Session 128D-B.1, not yet fixed)

### Deferred filter support in Report Builder
The following dimensions are supported as group-by targets in the Report Builder but are deferred as direct filters:
- Browser filter
- Referrer Domain filter
- Landing Page / URL filter
- Custom URL Parameter filter

### Schema-valid source filters vs attribution accuracy
Source shortcut filters are schema-valid and safe, but source/channel value accuracy still depends on backend normalization and real customer data.

## New Known Gaps (Session 98–99, not yet fixed)


### Deployment architecture — two separate Railway services

`sourcetrack.ai` is served by the **dashboard** Railway service:
- Builder: RAILPACK
- Build: `npm run build` (Vite → `dashboard/dist/`)
- Start: `npm run start` = `serve -s dist -l $PORT`
- The `serve` package must be in `dependencies` (not devDependencies) — fixed in this session

`api.sourcetrack.ai` (or similar) is served by the **api** Railway service:
- Builder: NIXPACKS
- Start: `node api/index.js`

The Express API server does **not** serve the dashboard frontend. They are independent deployments.

---

### GSC sitemap "General HTTP error" — root cause: SSL cert

Google Search Console shows "Sitemap could not be read — General HTTP error" for `https://sourcetrack.ai/sitemap.xml`.

**Root cause:** Same SSL cert issue as the browser `NET::ERR_CERT_COMMON_NAME_INVALID`.
The cert served is for `stream.nexus.pizza`, not `sourcetrack.ai`.
Google's crawler follows the same HTTPS rules as a browser — it refuses to fetch over a mismatched cert.

**The sitemap itself is correct.** It is in `dashboard/public/sitemap.xml`, copied to `dist/sitemap.xml` during build, and served as a static file by `serve -s dist`. Once SSL is fixed, Google can read it immediately — resubmit in GSC after fixing.

### SSL Certificate — `NET::ERR_CERT_COMMON_NAME_INVALID` (NOT a code issue)
Certificate shows `stream.nexus.pizza` instead of `sourcetrack.ai`.
This is a Railway custom domain SSL provisioning problem.

**Fix (Railway dashboard only):**
1. Go to Railway → your Dashboard service → Settings → Domains
2. Remove the `sourcetrack.ai` custom domain entry
3. Re-add it: add `sourcetrack.ai` and `www.sourcetrack.ai`
4. Railway will provision a Let's Encrypt cert automatically (takes ~1 min)
5. Verify DNS CNAME: `sourcetrack.ai CNAME <your-project>.up.railway.app`
6. If using Cloudflare: set SSL mode to "Full (Strict)" not "Flexible"

**Root cause:** Railway uses SNI to serve the right SSL cert. If the custom domain
was added before DNS propagated, or the cert wasn't re-issued after a domain
name change, Railway continues serving its default `*.up.railway.app` cert.

## New Known Gaps (Session 97–98, not yet fixed)

### OG image missing
`/og-image.png` is referenced in `dashboard/index.html` and `Landing.jsx` but does not exist yet.
Action: create a 1200×630 image and deploy to `https://sourcetrack.ai/og-image.png`.

### Landing page is CSR — social link previews may not render
The landing page is a React SPA. Helmet adds meta tags but social crawlers (Slack, iMessage, WhatsApp) don't execute JS. OG preview images and descriptions may not show when sharing the URL.
Action: evaluate SSR (Next.js/Astro) for the marketing landing page post-launch.

### annotations table migration not applied
`supabase/migrations/20260519000005_custom_properties_annotations_attribution_window.sql` must be run manually in Supabase SQL editor. Until then:
- Annotations API returns HTTP 503 (gracefully).
- `custom_properties` column does not exist on `attributed_conversions`.
- `attribution_window_days` column does not exist on `sites` (defaults to 30 in code).

### Per-conversion explain is single-touch-only
Step-by-step explanations (via `/api/attribution/explain` and the Conversion Explanation Modal) are designed and supported for single-touch models only (`first_touch`, `last_touch`, `first_touch_non_direct`, `last_touch_non_direct`, `ai_platforms`).
Advanced multi-touch models (`linear`, `time_decay`, `u_shaped`, `w_shaped`) are designed for aggregate attribution reporting, and querying `/api/attribution/explain` for them will return a clean explanation object indicating this limitation rather than raising errors or crashing.
