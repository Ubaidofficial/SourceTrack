> For future sessions, start with [DEVELOPER_CONTEXT.md](DEVELOPER_CONTEXT.md) and [NEXT_SESSION_PROMPT.md](NEXT_SESSION_PROMPT.md).
>
> **Handoff:** Session 128D-B.1 — Report Builder UI Polish. Replaced all native HTML select dropdowns with dark-theme consistent React CustomSelects, added custom N-days input to rolling date selection, renamed AI Platforms model to AI-assisted with helper text, and refined traffic source category filter presets. Documented deferred filter support, noted schema-valid attribution accuracy risks, and confirmed that the duplicate saved reports feature was not added.
>
> **Next Task:** Visual local QA and validation of /report-builder.
>
> ⚠️ **IMPORTANT OPERATIONAL NOTE:** Before deploying Session 124B/C to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.

## Session 128D-B.1 — Report Builder UI Polish
**Date:** 2026-06-08 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Custom styled dropdowns**: Added CustomSelect React helper component and replaced all native select dropdowns (Metric, Group By, Group By 2, Date presets, Attribution Model, and all advanced filters).
2. **Custom rolling days input**: Implemented custom N-days numeric input support for rolling range selections that falls back to Custom and binds integer values.
3. **AI-assisted renaming**: Renamed "AI Platforms" model to "AI-assisted" and added description helper text explaining it.
4. **Enhanced Sources filter presets**: Refined the traffic sources selector panel in Advanced Settings to provide 10 distinct groups (Organic Search, Paid Search, Paid Social, Organic Social, AI, Referral, Review Sites, Email, SMS, Direct/None) and wired them to allowed filters.
5. **Delete Confirmation safety**: Added native `window.confirm` blocker to the saved reports delete button action in the drawer.
6. **Deferred Filter Dimensions**: Documented that Browser, Referrer Domain, Landing Page / URL, and Custom URL Parameter filters are deferred from the direct filter scope (currently supported only as group-by targets).
7. **Attribution Accuracy Risk**: Noted that source shortcut filters are schema-valid but value accuracy depends on backend normalization and customer data.
8. **Duplicate Saved Reports**: Confirmed that the "Duplicate Saved Report" feature was not added to the drawer, keeping the scope clean and preventing accidental shipping of duplicates.

### Files changed
- `dashboard/src/pages/ReportBuilder.jsx`
- `KNOWN_ISSUES.md`


---


## Session 128D-B — Report Builder Two-Panel UI
**Date:** 2026-06-08 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Two-Panel Layout**: Redesigned `/report-builder` using a clean two-panel layout (left card for configuration, right card for preview) using CSS grid.
2. **Compact Presets Row**: Replaced preset cards with a compact horizontal list of business question presets below the main header.
3. **Unified Config Panel**: Combined Report Name, Metric, Group By, Primary Dimension, and Date Range into a single left Configure card.
4. **Collapsible Accordion**: Moved Attribution Model, Attribution Window, Attribute By, and custom Filter segments into a collapsible Advanced Settings block (collapsed by default).
5. **Preview Panel**: Integrated a stateful Preview card displaying report metadata, summary metrics, charting/table visualizations, and actions, or a helpful empty state when configuration is incomplete.
6. **Saved Reports Drawer**: Created a side-over drawer layout to view, load, delete, and pin saved reports without cluttering the main screen.

### Files changed
- `dashboard/src/pages/ReportBuilder.jsx`

---


## Session 128D-A — Core Report Builder & AI Sources Tab
**Date:** 2026-06-08 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Sidebar Navigation Update:** Removed AI Analytics from the primary sidebar navigation menu in `Layout.jsx` while keeping the `/ai-analytics` route active in `App.jsx` for direct or backwards-compatible access.
2. **AI Sources Analytics Tab:** Added a lightweight AI Sources tab to the Traffic Sources panel on the Analytics page, rendering a clean custom empty-state educating users about AI referrals (pointing to the external documentation rather than `/snippet`), and querying the new backend helper `/sources?tab=ai_source`.
3. **Attribution Engine Dimensions & Filters:**
   - Added support for the `browser` dimension mapping, querying ClickHouse's `properties.browser_name` to prevent returning `'unknown'` due to schema differences across ingestion paths.
   - Fixed the `conversion_type` filter mismatch by adding it to allowed filters validation and parsing/passing it down to the single-touch and multi-touch engines.
4. **Report Builder AI Templates:** Added four AI templates (AI Traffic Sources, AI Revenue by Source, AI Landing Pages, and AI-assisted Conversions) to the Report Builder quick presets.

### Files changed
- `api/lib/attribution-engine.js`
- `api/lib/report-config-validation.js`
- `api/routes/analytics.js`
- `api/routes/attribution.js`
- `dashboard/src/components/Layout.jsx`
- `dashboard/src/pages/Analytics.jsx`
- `dashboard/src/pages/ReportBuilder.jsx`

## Session 128A — Manual Ad Cost Imports + Campaign ROI
**Date:** 2026-06-08 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Database Schema:** Created migration `supabase/migrations/20260608000000_add_ad_cost_imports.sql` adding platform, clicks, impressions, currency, and cost_dedupe_key columns to `campaign_costs`, performing preflight deduplication merging of existing rows to prevent unique index violation failures, creating a unique index on `site_id + platform + cost_dedupe_key + period_start`, and establishing the `ad_sync_runs` table with Row-Level Security for logging sync logs history.
2. **Shared Imports Library:** Created `api/lib/ad-cost-imports.js` containing deduplication key hashing, row normalization, validation guards (future dates, clicks vs impressions, batch limit of 1000), upload payload aggregation, currency status evaluation (comparing spend currencies with tracked revenue currency), and a RFC 4180-compliant quoted CSV parser and header mapper.
3. **Backend API Endpoints:**
   - Modified `api/routes/campaign-costs.js` to return new columns on `GET /`, support the new unique index on legacy inline manual `POST /` (preserving range spend), implement `POST /import` for bulk uploads (strictly deriving `site_id` from authenticated site context, never trusting client payload site parameters, merging payload duplicates first, and logging imports history), and implement `GET /import-history`.
   - Modified `api/routes/campaigns.js` to retrieve active checkout currencies from `revenue_ingestion_events`, aggregate spend/clicks/impressions, calculate CPA/ROAS/CPC/CTR metrics, suppress ROAS/CPA calculations if mixed or mismatched currencies are found, and expose `platforms` in campaign row payloads.
4. **Campaigns UI Dashboard:** Updated `dashboard/src/pages/Campaigns.jsx` to render upgraded columns (Clicks, Impressions, CTR, CPC, CPA, ROAS), display platform badges, show warn icons with hover tooltips on suppressed/mismatched currencies, trigger main report refetches when spend is saved, and added an **Import Costs Modal** (featuring drag-and-drop CSV box, paste textarea, live validation preview highlighting error rows, currency alerts, downloadable template, and the **Import History** log view tab).
5. **Help Center Docs:** Added "Ad Spend Integration" guide to `dashboard/src/pages/Docs.jsx` describing setup rules, CSV formats, currency warnings, unique constraints, and REST API specification, adhering to strict product wording guidelines.
6. **QA Test Harness:** Created `scripts/qa-ad-cost-imports.mjs` verifying E2E CSV parser formats, validation rules, deduplication merging, currency status logic, and database schema/RLS setup.

### Files changed
- `supabase/migrations/20260608000000_add_ad_cost_imports.sql` [NEW]
- `api/lib/ad-cost-imports.js` [NEW]
- `scripts/qa-ad-cost-imports.mjs` [NEW]
- `api/routes/campaign-costs.js`
- `api/routes/campaigns.js`
- `dashboard/src/pages/Campaigns.jsx`
- `dashboard/src/pages/Docs.jsx`

## Session 127B — Owner Billing and Trial Fix
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Shared Billing Helper:** Created `dashboard/src/lib/billing.js` to centralize plan labeling, trial calculation, and paid tier matching.
2. **Backend Sites Selection:** Updated the `/sites` API query in `api/routes/sites.js` to retrieve `trial_started_at` and `trial_ends_at`.
3. **Frontend Integration:** Refactored `dashboard/src/components/Layout.jsx` and `dashboard/src/pages/Settings.jsx` to consume the shared helper functions.
4. **Super Admin Guard:** Hardened layout state to clear any stale trial banner when super admins are logged in.
5. **QA Test Harness:** Created `scripts/qa-billing-helper.mjs` verifying all calculations, fallbacks, and labels.

### Files changed
- `api/routes/sites.js`
- `dashboard/src/components/Layout.jsx`
- `dashboard/src/pages/Settings.jsx`
- `dashboard/src/lib/billing.js` [NEW]
- `scripts/qa-billing-helper.mjs` [NEW]

## Session 127A — Cross-Domain Tracking
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Database Schema:** Created migration `supabase/migrations/20260607231500_add_cross_domain_settings.sql` adding `cross_domain_domains` and `cross_domain_cookie_domain` columns to the `sites` table.
2. **Auth Middleware:** Updated `api/middleware/auth.js` `validateSiteKey` select queries to load cross-domain settings (with resilient fallback to safe defaults if columns are missing).
3. **Backend API settings:** Implemented `GET /api/integrations/settings` and updated `PATCH /api/integrations/settings` in `api/routes/integrations.js` to validate domains (max 20, format restrictions, localhost in prod) and cookie domains (must start with `.`, match site domain parent scope, no unsafe public suffixes like `.com`).
4. **Standard Tracker (`tracker.js`):** Implemented TLD cookie read/write fallback, restoration precedence rules (no identity override, no first-touch override), Base64url parameter parsing and sanitization, parameter cleanup from history state, and early link decoration (on `mousedown`/`touchstart`) matching the allowlist while preserving normal browser default click behaviors (cmd/ctrl clicks, middle clicks, target="_blank", downloads).
5. **Cookieless Tracker (`tracker.cookieless.js`):** Exposed `window.sourcetrack.decorateUrl(url)` with async server ID without writing or reading to browser storage/cookies.
6. **UI & Snippet Settings:** Updated `Settings.jsx` to load and save cross-domain settings, and added inputs. Updated `Snippet.jsx` to select columns and print snippet script attributes conditionally.
7. **Docs Guide:** Updated `Docs.jsx` with cross-domain instructions, manual/auto-decoration rules, and cookieless warning indicators.
8. **Tracker minification:** Minified standard and cookieless script bundles.
9. **E2E QA Verification:** Created `scripts/qa-cross-domain.mjs` verifying E2E settings validation, identity precedence rules, auto-decoration click events, and minified code compliance.

### Files changed
- `supabase/migrations/20260607231500_add_cross_domain_settings.sql` [NEW]
- `scripts/qa-cross-domain.mjs` [NEW]
- `api/middleware/auth.js`
- `api/routes/integrations.js`
- `tracker/tracker.js`
- `tracker/tracker.cookieless.js`
- `tracker/tracker.min.js`
- `tracker/tracker.cookieless.min.js`
- `dashboard/src/pages/Settings.jsx`
- `dashboard/src/pages/Snippet.jsx`
- `dashboard/src/pages/Docs.jsx`

## Session 126A — Google Search Console & SEO Revenue
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Database Schema:** Created idempotent migration `supabase/migrations/20260607212000_add_google_search_console.sql` setting up `gsc_connections`, `gsc_performance_daily`, and `gsc_sync_runs` tables with appropriate indexes, CHECK constraints, and RLS policies.
2. **Secure OAuth callback flow:** Hardened state token validation and signature check, verified user site membership in OAuth callback, removed raw site key from redirects, mapped browser errors, and enforced callback safety.
3. **Synchronizer Client Library:** Implemented `google-search-console.js` client with offline access consent request, GSC property verifications, pagination logic up to 25k rows per sync run, bounded date ranges (skipping unfinalized today), and memory + database concurrency locks.
4. **Estimated Allocation Logic Report:** Implemented `seo-revenue.js` report resolver joining organic conversions from `attributed_conversions` with GSC cached daily performance click-shares. Resolved landing page paths via ClickHouse (PostHog) earliest pageviews (capped at 1k converter IDs, 10s AbortController timeout).
5. **Dashboard Integrations Card:** Added Google Search Console integration card in `Integrations.jsx` allowing account OAuth connection, property URL verification & selection, manual sync dispatch, and status feedbacks.
6. **SEO Revenue Attribution Report Page:** Created `SEORevenue.jsx` reporting page displaying Organic Search Conversions/Revenue, GSC clicks, Top Landing Pages primary table, and Associated Search Queries secondary context, including the required aggregate data notice.
7. **Sidebar & App Routing:** Registered `/seo-revenue` under Attribution nav section in `Layout.jsx` and added its ProtectedRoute mapping in `App.jsx`.
8. **Help Center Documentation:** Added GSC setup instructions, path-normalization logic, click-share allocation details, limits, and disclaimers in `Docs.jsx`.
9. **E2E Integration Test Suite:** Added `scripts/qa-gsc-integration.mjs` verifying OAuth state signatures, shape validation, path normalization, CTR/position math, and copy-phrase restrictions.

### Files changed
- `api/lib/google-search-console.js` [NEW]
- `api/lib/url-normalization.js` [NEW]
- `api/routes/google-search-console.js` [NEW]
- `api/routes/seo-revenue.js` [NEW]
- `api/index.js`
- `dashboard/src/App.jsx`
- `dashboard/src/components/Layout.jsx`
- `dashboard/src/pages/Docs.jsx`
- `dashboard/src/pages/Integrations.jsx`
- `dashboard/src/pages/SEORevenue.jsx` [NEW]
- `supabase/migrations/20260607212000_add_google_search_console.sql` [NEW]
- `scripts/qa-gsc-integration.mjs` [NEW]

### Verification commands
```bash
node scripts/qa-gsc-integration.mjs
node --check api/index.js api/lib/google-search-console.js api/lib/url-normalization.js api/routes/google-search-console.js api/routes/seo-revenue.js scripts/qa-gsc-integration.mjs
cd dashboard && npm run build
```

## Session 125A — Managed First-Party Proxy
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Database Migration:** Created additive, safe schema migration file `supabase/migrations/20260607184000_add_managed_proxy_domains.sql` setting up `managed_proxy_domains` with company member RLS policies.
2. **DNS/SSL Verification Utility:** Implemented recursive CNAME validation and HTTPS health checks to `/.well-known/sourcetrack/proxy-health` to confirm secure proxy routing. Supported mock resolution under `ST_MOCK_DNS_RESOLVE=true`.
3. **Two-Stage Middleware:**
   - **Stage 1 (Early Gate):** Mounts at the very top of `api/index.js` to validate the `Host` header, normalization, strip port, check platform-host pass-throughs, verify active status in database, and enforce path allowlists.
   - **Stage 2 (Site Key Binding):** Mounts inside ingestion routes after body-parsing to enforce that any incoming `site_key` matches the bound host site key.
4. **Settings UI:** Added custom tracking domain configuration card in `Settings.jsx` showing DNS instructions, CNAME copy action, verification button with statuses (Not configured / Waiting for DNS / Securing domain / Active / Needs attention), deletion flows, and the customized snippet.
5. **Dynamic Snippet Generation:** Updated `Snippet.jsx` to dynamically load scripts from the verified active custom subdomain if configured.
6. **Troubleshooting Docs:** Added setup instructions, comparison tables, CSP/DNS troubleshooting steps, and API warnings in `Docs.jsx`.
7. **E2E Integration Test Suite:** Added `scripts/qa-managed-proxy.mjs` verifying all routes, gates, platform-host pass-throughs, cache invalidations, and production fail-closed behaviors.

### Files changed
- `api/lib/dns-resolver.js` [NEW]
- `api/middleware/managed-proxy.js` [NEW]
- `api/index.js`
- `api/routes/integrations.js`
- `dashboard/src/pages/Docs.jsx`
- `dashboard/src/pages/Settings.jsx`
- `dashboard/src/pages/Snippet.jsx`
- `supabase/migrations/20260607184000_add_managed_proxy_domains.sql` [NEW]
- `scripts/qa-managed-proxy.mjs` [NEW]

### Verification commands
```bash
node scripts/qa-managed-proxy.mjs
node scripts/qa-rate-limits.mjs
node scripts/qa-ip-resolver.mjs
node scripts/diagnostic-trust-proxy.mjs
node scripts/qa-proxy-validation.mjs
node --check api/index.js api/routes/integrations.js api/middleware/managed-proxy.js api/lib/dns-resolver.js scripts/qa-managed-proxy.mjs
cd dashboard && npm run build
```

## Session 124C — Layered Rate-Limit Implementation
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Layered Rate Limiters:** Implemented multi-layered rate-limiting systems (Visitor, IP, Site, Global IP) for approved ingestion routes: `/api/track`, `/api/collect`, `/track`, `/api/conversion`, `/api/tracker/id`, `/api/identify`.
2. **Safe Hashing & Bounding:** Added `hashKeyPart` using SHA-256 slice (16 chars) to hash and bound user-controlled parameters (`site_key`, `anonymous_id`, `visitor_id`, `user_id`, `order_id`, and `resolved IP`), preventing memory bloat and leaks.
3. **Safe Hashed Logging:** Standardized logging using `[rate-limit]` prefix, tracking hashes (`site_key_hash`, `ip_hash`, `limiter_key_hash`, `resolver_mode`, `route`, `layer`, `status=429`) instead of raw/cleartext IPs or keys. Log hashes are generated using HMAC-SHA256 with the environment's `ST_LOG_HASH_SECRET` or `TRACKER_SALT` (both bounded to 500 characters, validated on startup in production, and falling back only in dev/test).
4. **Skip Boundaries:** Configured `defaultLimit` to skip the six ingestion paths (and global OPTIONS requests). Trailing slash normalization in the skip rule is implemented for Express consistency, and logged as normalized routes.
5. **Exact Log & Key Mapping:** Captured the exact rate limiter key generated inside each keyGenerator under `req.rateLimitKey` to ensure `limiter_key_hash` is 100% cryptographically accurate. Resolved routes in logs dynamically to stable normalized paths via `getSafeRouteLabel`.
6. **QA Test Harness:** Created `scripts/qa-rate-limits.mjs` verifying visitor cap, IP cap, site cap, global IP cap, OPTIONS bypass, oversized ID hashing, skip boundaries, CORS 429 headers, malformed site_key formats, trailing slash normalization, and cryptographic verification of hashed logs.
7. **No Side Effects:** Confirmed that `/sp` routes, `/api/pixel` route, tracker assets, `trust proxy`, and database schemas are completely untouched.

### Files changed
- `api/middleware/rate-limit.js`
- `api/index.js`
- `api/routes/tracker-id.js`
- `scripts/qa-rate-limits.mjs` [NEW]
- `SESSION_STATE.md`
- `SESSION_LOG.md`
- `SESSION_HANDOFF.md`

### Verification commands
```bash
node scripts/qa-rate-limits.mjs
node scripts/qa-ip-resolver.mjs
node scripts/diagnostic-trust-proxy.mjs
node scripts/qa-proxy-validation.mjs
node --check api/index.js api/middleware/rate-limit.js api/routes/tracker-id.js scripts/qa-rate-limits.mjs
cd dashboard && npm run build
```

## Session 124B — Railway-Aware IP Resolver Route Migration
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Centralized IP Resolution Mode:** Configured central resolver in `api/lib/ip-resolver.js` to support environment-controlled mode `ST_IP_RESOLVER_MODE=railway`. In `railway` mode, it parses the `X-Forwarded-For` chain, validates each IP against public IP parameters, and selects the first valid public IP, falling back to connection IP.
2. **Ingestion Routes Migration:**
   - Modified `api/routes/track.js` to replace manual `x-forwarded-for` parsing inside `enrich(req)` with `resolveClientIp(req)`.
   - Modified `api/routes/conversion.js` to use `resolveClientIp(req)` inside `enrich(req)` and for outbound Meta CAPI and TikTok CAPI IP dispatches.
   - Modified `api/routes/tracker-id.js` to delete its local `getClientIp(req)` helper and use `resolveClientIp(req)` to generate visitor and session hashes.
3. **Rigorous QA Verification:**
   - Updated `scripts/qa-ip-resolver.mjs` to add unit tests for `isPublicIp(ip)` and `inspectClientIp(req)` under `ST_IP_RESOLVER_MODE=railway` (covering public, private, CGNAT, link-local, loopback, and malformed IPs).
   - Added integration tests verifying spawned server behavior under `ST_IP_RESOLVER_MODE=railway` with multi-hop XFF chains and private-only fallbacks.
   - Added automated static checks verifying that migrated ingestion files contain no manual `x-forwarded-for` checks or `getClientIp` helpers.
4. **No Side Effects:** Preserved `trust proxy` configuration (remains disabled in production) and rate limiter connection-based settings.

### Files changed
- `api/lib/ip-resolver.js`
- `api/routes/track.js`
- `api/routes/conversion.js`
- `api/routes/tracker-id.js`
- `scripts/qa-ip-resolver.mjs`

### Verification commands
```bash
node scripts/qa-ip-resolver.mjs
node scripts/diagnostic-trust-proxy.mjs
node scripts/qa-proxy-validation.mjs
node --check api/index.js api/routes/*.js api/lib/*.js
cd dashboard && npm run build
```

## Session 124A — IP Resolver Hardening Audit + Safe Diagnostic Mode
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Central IP Resolver:** Created `api/lib/ip-resolver.js` exposing `inspectClientIp(req)` and `resolveClientIp(req)`. It resolves connection IP safely (stripped of `::ffff:`) and labels it as connection/socket IP, not true visitor IP. It flags raw `X-Forwarded-For` headers as `XFF_HEADER_PRESENT` and checks for mismatch.
2. **Gated Diagnostic Route:** Mounted `GET /api/diag/ip` in `api/index.js`, mounted only when `ST_IP_DIAGNOSTIC_SECRET` is present. Implements header-only auth, adds `Cache-Control: no-store`, and outputs only clean diagnostic fields (no cookie/auth headers returned).
3. **QA Verification Script:** Created `scripts/qa-ip-resolver.mjs` verifying mock unit resolutions, gated access return codes (401/404), cache control headers, and spoofed XFF rejection.
4. **No Production Ingestion Alterations:** Confirmed that no production tracking, conversion, tracker-id, analytics, pixel, or server-events routes were changed. Verified no rate-limiters were altered, and `trust proxy` remains disabled.

> [!WARNING]
> After Railway IP diagnostics are complete, remove ST_IP_DIAGNOSTIC_SECRET from the deployed environment to disable /api/diag/ip.

### Files changed
- `api/index.js`
- `api/lib/ip-resolver.js` [NEW]
- `scripts/qa-ip-resolver.mjs` [NEW]

### Verification commands
```bash
node scripts/qa-ip-resolver.mjs
node scripts/diagnostic-trust-proxy.mjs
node scripts/qa-proxy-validation.mjs
node --check api/index.js
node --check api/lib/ip-resolver.js
node --check scripts/qa-ip-resolver.mjs
git diff --check
cd dashboard && npm run build
cd ..
git status --short
```


## Session 123D — Docs Correction + IP Spoofing Diagnostic
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + diagnostics pass)

### Completed
1. **Self-Hosted Proxy Docs Correction:** Refactored the proxy guide in `Docs.jsx` to warn against cookieless tracking setups on self-hosted proxies due to identity collapse risks, recommending standard tracking instead. Documented geo-location collapse and rate-limiting behaviors.
2. **Local Trust Proxy Diagnostic Tool:** Created `scripts/diagnostic-trust-proxy.mjs` to compare `trust proxy = false` vs `trust proxy = 1` using local HTTP instances and simulated spoofed IP request headers.
3. **No Production Code Alterations:** Confirmed that no production backend server configs (e.g. `api/index.js` or `trust proxy`), tracking routes, CAPI endpoints, rate limiters, database schemas, or tracking script assets were modified.

### Files changed
- `dashboard/src/pages/Docs.jsx`
- `scripts/diagnostic-trust-proxy.mjs` [NEW]

### Verification commands
```bash
node scripts/diagnostic-trust-proxy.mjs
node --check scripts/diagnostic-trust-proxy.mjs
git diff --check
cd dashboard && npm run build
cd ..
```

## Session 123B — First-Party Proxy Path Hardening + Self-Hosted Guide MVP
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed
1. **Ingestion Server Alias:** Registered root-level alias route `GET /tracker.cookieless.min.js` mirroring standard `/tracker.min.js` behavior with matching CORS, cache, and Content-Type headers.
2. **Self-Hosted Proxy Docs:** Integrated dedicated self-hosted proxy setup guide in `Docs.jsx` with clean first-party event delivery terminology (avoiding ad-blocker evasion or unblockable overclaims).
3. **Hardened Proxy Examples:** Documented path-allowlisted Cloudflare Worker and Next.js rewrite templates strictly forwarding the six canonical tracking paths (`/tracker.min.js`, `/tracker.cookieless.min.js`, `/api/track`, `/api/conversion`, `/api/tracker/id`, `/api/identify`) and returning 404 for all other routes.
4. **Verification QA Harness:** Created `scripts/qa-proxy-validation.mjs` verifying root aliases, local proxy routing, blocked paths, and open-proxy checks. Configured rate-limiter check to run as informational/deferred to Session 123C.
5. **No Scope Creep:** Confirmed that legacy `/sp` routes remain untouched, no global `trust proxy` setting changes were made, and no minified tracker files were modified.

### Files changed
- `api/index.js`
- `dashboard/src/pages/Docs.jsx`
- `scripts/qa-proxy-validation.mjs` [NEW]

### Verification commands
```bash
node scripts/qa-proxy-validation.mjs
node --check api/index.js
git diff --check
cd dashboard && npm run build
cd ..
```

## Session 122B — Public Docs + API Docs Coverage Audit
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check pass)

### Completed
1. **API Endpoints Documentation:** Added detailed API endpoints specifications and examples in `Docs.jsx` for Saved Reports CRUD (`POST/GET/PUT/DELETE /api/reports/saved`), Dashboard Widgets (`PATCH /api/reports/saved/:id/dashboard`), and CSV Report Export (`GET /api/export/report`).
2. **Production / Self-Hosting Reference:** Documented required production variables (`ENCRYPTION_KEY` format, stable secret storage warnings), Supabase schema database migrations, and the exactly 5 cron scripts (`nightly-attribution.js`, `data-quality-check.js`, `email-reports.js`, `health-agent.js`, `usage-threshold-emails.js`).
3. **Custom URL Parameters Specs:** Detailed parameter configuration validation rules (maximum 10, key format, sensitive blocklists, dropped unsafe values) and Report Builder group_by format (`custom_param:<key>`).
4. **UI Navigation Links:** Linked Stripe, Shopify, Payments API, and Outbound Webhooks setup cards in `Integrations.jsx` directly to their respective anchors in `Docs.jsx`. Added settings and documentation links to the custom parameter empty state card in `ReportBuilder.jsx`.
5. **Install / Snippet Cleanups:** Updated `Snippet.jsx` and `Docs.jsx` references to `tracker.cookieless.js` to target the correct compiled `tracker.cookieless.min.js` file.
6. **No Unshipped Features:** Confirmed that no unverified coming soon or queued roadmap features (such as First-Party Proxy, Managed Proxy, GSC, etc.) are present in the public docs.

### Files changed
- `dashboard/src/pages/Docs.jsx`
- `dashboard/src/pages/Integrations.jsx`
- `dashboard/src/pages/ReportBuilder.jsx`
- `dashboard/src/pages/Snippet.jsx`

### Verification commands
```bash
node --check api/index.js
node --check api/routes/saved-reports.js
node --check api/routes/export.js
git diff --check
cd dashboard && npm run build
```

## Session 121A — Add Report to Dashboard Workflow
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing (E2E QA pass)

### Completed
1. **Database Schema**: Created Supabase SQL migration (`20260607133300_add_dashboard_fields_to_saved_reports.sql`) adding `show_on_dashboard` (boolean), `dashboard_position` (integer), and `dashboard_size` (text check constraint) columns to `saved_reports`.
2. **Backend API Route**: Modified `GET /saved` endpoint to support `show_on_dashboard=true` filtering, limiting results to 9 widgets ordered by `dashboard_position` ASC and `updated_at` DESC. Added `PATCH /saved/:id/dashboard` visibility route with strict site/owner scoping and validation.
3. **Frontend Report Builder**: Mapped dashboard toggles to the save panel and saved list. Added `isDashboardToggling` block state to disable the toggle button and ignore concurrent/rapid clicks during unsaved report creation.
4. **Frontend Dashboard**: Replaced the legacy top slice placeholder with the new isolated `<DashboardWidgetCard />` component grid. Configured a strong React Query cache key including `report.updated_at` and `JSON.stringify(config)` to prevent stale card states.
5. **Help Docs & QA verification**: Documented widgets in `Docs.jsx`. Created `scripts/qa-dashboard-widgets.mjs` verifying schema, visibility toggles, 400 validations (missing fields, invalid position string "abc", non-boolean show_on_dashboard), limit of 9, position ASC sorting, and cross-user isolation.

### Files changed
- `api/routes/saved-reports.js`
- `dashboard/src/pages/Dashboard.jsx`
- `dashboard/src/pages/ReportBuilder.jsx`
- `dashboard/src/pages/Docs.jsx`
- `scripts/qa-dashboard-widgets.mjs` [NEW]
- `supabase/migrations/20260607133300_add_dashboard_fields_to_saved_reports.sql` [NEW]

### Verification commands
```bash
node scripts/qa-dashboard-widgets.mjs
node scripts/qa-schema-readiness.mjs
```

## Session 120B — Revenue Provider + Attribution Status Reporting
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Revenue Metadata Dimensions**: Added `'provider'`, `'attribution_status'`, and `'stitching_method'` to allowed groupBy groups inside `report-config-validation.js` and `api/routes/attribution.js`.
2. **Aggregation Intercepts**: Configured attribution router (`api/routes/attribution.js`) to bypass Supabase pre-aggregated/nightly helpers when grouping by these dimensions, routing queries live to PostHog.
3. **Attribution Engine Support**: Added dimension mappings in `GROUP_COLUMNS` inside `api/lib/attribution-engine.js` using robust fallback HogQL expressions:
   - `PROVIDER_SQL`: `COALESCE(NULLIF(properties.provider, ''), multiIf(properties.ingestion_method = 'server_routed', 'browser', properties.ingestion_method = 'offline', 'payments_api', 'unknown'))`
   - `ATTRIBUTION_STATUS_SQL`: `COALESCE(NULLIF(properties.attribution_status, ''), multiIf(properties.ingestion_method = 'server_routed', 'attributed', properties.stitching_method IS NOT NULL AND properties.stitching_method != '' AND properties.stitching_method != 'none', 'attributed', properties.stitching_method = 'none', 'unattributed', 'unknown'))`
   - `STITCHING_METHOD_SQL`: `COALESCE(NULLIF(properties.stitching_method, ''), multiIf(properties.ingestion_method = 'server_routed', 'browser', 'unknown'))`
   Added LTV grouping support under `ltvPersonDimExpr`.
4. **Live-Path Mapping**: Handled `getMultiTouchAttributionLive` by extracting these properties in conversion queries and mapping them to response rows.
5. **UI & Docs Card**: Integrated the dimensions into the Report Builder React frontend dimension lists and added Step 4 helper warnings explaining conversion-level grouping limitations and browser fallback semantics. Documented dimensions and behaviors in help center Docs (`Docs.jsx`).
6. **E2E QA Verification Suite**: Created E2E test script `scripts/qa-revenue-provider-reporting.mjs` verifying config validation, invalid dimensions rejection, and clean report API/export CSV download queries. Verified under `ALLOW_ATTRIBUTION_E2E_TIMEOUT_WARN=1`.

### Files changed
- `api/lib/report-config-validation.js`
- `api/routes/attribution.js`
- `api/lib/attribution-engine.js`
- `dashboard/src/pages/Docs.jsx`
- `dashboard/src/pages/ReportBuilder.jsx`
- `scripts/qa-revenue-provider-reporting.mjs` [NEW]

### Verification commands
```bash
ALLOW_ATTRIBUTION_E2E_TIMEOUT_WARN=1 node scripts/qa-revenue-provider-reporting.mjs
```

## Session 120A — Report Builder Referrer Domain Dimension
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Referrer Domain Reporting Dimension**: Added `'referrer_domain'` to allowed groupBy groups inside `report-config-validation.js` and `api/routes/attribution.js`.
2. **Live-Path Aggregation Intercepts**: Configured attribution router (`api/routes/attribution.js`) to bypass Supabase pre-aggregated/nightly helpers whenever `group_by === 'referrer_domain'` or `req.query.group_by2 === 'referrer_domain'`, routing queries to the live flexible Report path instead.
3. **Attribution Engine Support**: Added `referrer_domain` dimension mapping in `GROUP_COLUMNS` inside `api/lib/attribution-engine.js` using a robust regex-based HogQL extraction expression: `multiIf(properties.referrer IS NULL OR properties.referrer = '', 'direct', domain(properties.referrer) = '', 'unknown', replaceRegexpAll(domain(properties.referrer), '^www\\.', ''))`. Added LTV grouping support under `ltvPersonDimExpr`.
4. **Windowed Attribution Mapping**: Selected `_pv.properties.referrer` as `_w_referrer` inside the `windowJoin` subquery of `getFlexibleReport` and mapped `referrer_domain` grouping in windowed paths.
5. **Deterministic JS Helper**: Exported `extractReferrerDomain(referrer)` from `api/lib/attribution-engine.js` and integrated it into `calculateAttribution` (in-memory multi-touch) and `getMultiTouchAttributionLive` grouping loop.
6. **UI & Docs Card**: Added Referrer Domain dimension to the dashboard frontend. Added Step 4 helper banner explaining that Referrer Domain is based strictly on the browser-captured referrer (not an active backlink crawler or Search Console import). Documented behavior, direct/unknown fallbacks, privacy note, and scope limits in developer help center Docs (`Docs.jsx`).

### Files changed
- `api/lib/report-config-validation.js`
- `api/routes/attribution.js`
- `api/lib/attribution-engine.js`
- `dashboard/src/pages/Docs.jsx`
- `dashboard/src/pages/ReportBuilder.jsx`
- `scripts/qa-referrer-domain-reporting.mjs`

### Verification commands
```bash
ALLOW_ATTRIBUTION_E2E_TIMEOUT_WARN=1 node scripts/qa-referrer-domain-reporting.mjs
```

### Caveats & Limitations
- Live known-referrer PostHog assertion may be skipped under indexing latency. Deterministic helper tests, live HogQL extraction probe, API/export smoke, and CSV leakage checks passed.
- Referrer Domain is based only on captured browser referrer/document.referrer. It is not a backlink crawler, SEO crawler, or Search Console import.


### Completed
1. **Keyword / Term Reporting Dimension**: Added `'keyword'` to allowed groupBy groups inside `report-config-validation.js` and `api/routes/attribution.js`.
2. **Live-Path Aggregation Intercepts**: Configured attribution router (`api/routes/attribution.js`) to bypass Supabase pre-aggregated/nightly helpers whenever `group_by === 'keyword'` or `group_by2 === 'keyword'`, routing queries live to PostHog.
3. **Attribution Engine Support**: Added `keyword` dimension mapping in `GROUP_COLUMNS` inside `api/lib/attribution-engine.js` mapping to `properties.utm_term`. Extracted `properties.utm_term` in pageview and conversion live queries in `getMultiTouchAttributionLive`, preserving in `tpBase`.
4. **Windowed Attribution Mapping**: Selected `_pv.properties.utm_term` as `_w_term` inside the `windowJoin` subquery of `getFlexibleReport` to resolve the keyword from the credited pageview touchpoint when an attribution window is active.
5. **UI & Docs Updates**: Added `Keyword / Term` option to Report Builder dimension selection. Integrated helper info banner under Step 4 warning that keyword reporting is parameter-based only (uses `utm_term`). Added dedicated Keyword / Term Reporting section to developer help center documentation (`Docs.jsx`).
6. **E2E QA Verification Suite**: Created E2E test script `scripts/qa-keyword-reporting.mjs` verifying config validation, invalid dimensions rejection, and clean report API/export CSV download queries. Verified under `ALLOW_ATTRIBUTION_E2E_TIMEOUT_WARN=1` to bypass slow PostHog ingestion queues.

## Session 119D — Report Builder Security & Production Readiness
**Date:** 2026-06-07 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Hardened Scoping & Ownership Validation**: Updated saved-reports routes (`saved-reports.js`) so that `DELETE` queries retrieve the report by ID and site ID first and verify ownership explicitly, returning `403 Forbidden` rather than a silent `404` for cross-user same-site requests.
2. **Report Configuration Tampering Protections**: Implemented a comprehensive config validator in `report-config-validation.js` which verifies allowed keys, chart types, metrics, dimensions, attribution models, and restricts override keys (`site_id`, `user_id`, etc.) and SQL/HogQL injection keywords or characters in filters.
3. **Internal Database Column Cleansing**: Updated `export.js` to strip internal database identifiers (`id`, `site_id`, `site_key`, `user_id`, etc.) case-insensitively before serving CSV outputs.
4. **Graceful DB Column Fallback**: Updated `auth.js` to catch database queries failing on missing columns (`sites.attribution_window_days`), logging a loud warning and falling back to 30.
5. **E2E QA Verification Suite**: Created `scripts/qa-schema-readiness.mjs` verifying schema migrations. Added cross-user same-site update/delete `403` checks and CSV data cleansing tests to `scripts/qa-report-security.mjs`. Enabled fast execution of `qa-attribution-integration.mjs` using `ALLOW_ATTRIBUTION_E2E_TIMEOUT_WARN=1`.

## Session 119B — Launch Audit Fixes
**Date:** 2026-06-06 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Encryption Key Documentation**: Added `ENCRYPTION_KEY=` to `.env.example` with clear instructions on generating it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and a warning to keep it stable per environment.
2. **Payments API IP Leak Fix**: Removed `ip_address` from the PostHog event properties dispatch in `api/routes/conversion-offline.js` to ensure alignment with the privacy policy stating IP addresses are not stored or forwarded.
3. **Honest CAPI Claims**: Softened the CAPI claim in the `README.md` to truthfully reflect the product as outbound conversion forwarding infrastructure rather than verified one-click sync for all listed platforms.
4. **E2E verification tests**: Successfully executed the entire E2E verification suite (`qa-revenue-load`, `qa-shopify-webhook`, `qa-payments-api`, `qa-stripe-webhook`, and `qa-revenue-foundation`), passing 100% of all checks.

## Session 118E — Shopify Order Webhook Sync
**Date:** 2026-06-06 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Shopify Webhook Receiver Endpoint**: Implemented `POST /api/webhooks/shopify/:site_key` mounted before Express JSON parser, verifying HMAC signatures timing-safely and parsing JSON payloads only after verification.
2. **Paid Order Support & Filtering**: Supported `orders/paid` event topic immediately, and `orders/create` topic only when `financial_status === 'paid'`. Ignored other topics with a safe 200 ignored response.
3. **Idempotency Claims & DB Logging**: Enforced database-backed revenue idempotency using `claimIdempotencyKeys(siteKey, 'shopify', keys)` with the order ID and webhook ID. Logged all event metrics directly to `revenue_ingestion_events`.
4. **Privacy-Safe Normalization**: Normalised amounts, currency, order numbers, and event types without storing raw payload bytes or customer PII details (customer object, email, phone, names, billing, or shipping address).
5. **Visitor Journey Stitching**: Scanned cart note/attributes for storefront identifiers (`_st_aid`, `st_aid`, `anonymous_id`, `visitor_id`, `sourcetrack_user_id`, `site_user_id`), falling back to unattributed Shopify revenue if none are found.
6. **Integrations Settings Routes**: Added `GET` and `POST` `/api/integrations/shopify` endpoints in integrations router to configure site secrets and reset caches securely.
7. **Integrations & Docs UI**: Added the copyable listener URL, signing secret inputs, disconnect form, and setup guide instructions card to the Integrations dashboard. Documented setup, stitching scripts, and constraints in Help Docs.
8. **E2E verification tests**: Created `scripts/qa-shopify-webhook.mjs` verifying signature checks, unpaid filters, validation, corrected resubmissions, and duplicate skips.


## Session 118D — Payments API Hardening + Docs
**Date:** 2026-06-06 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Hardened Backend Route:** Modified `/api/conversion/offline` route with numeric conversion value validation, 3-letter currency code validation, and provider name checks (lowercase, trim, max 50 chars, allowed characters `/^[a-z0-9_-]+$/`).
2. **Unattributed Ingestion Support:** Enabled payment ingestion without user identity (`user_id` / `anonymous_id`) when a stable dedupe key is provided, recording it under `attribution_status: 'unattributed'` and `stitching_method: 'none'`.
3. **Database Idempotency Integration:** Wired `claimIdempotencyKeys(siteKey, provider, keys)` using `site_key` context and logged all ingestion events to `revenue_ingestion_events`.
4. **Custom Property Sanitization:** Passed metadata/properties custom objects to `redactPiiFromObject` before sending to PostHog, keeping client parameter leaks secure while retaining explicit IDs. Disabled raw payload storage.
5. **Dashboard Integrations Card:** Designed and added the copyable Payments API card on the Integrations page showing cURL template, endpoint definitions, and deduplication alerts.
6. **Developer Docs:** Added the Payments API section in Docs page layout and navigation.
7. **E2E verification tests:** Created test script `scripts/qa-payments-api.mjs` verifying all edge cases and validation.

---

## Session 118C — Stripe Webhook Sync
**Date:** 2026-06-06 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Raw Body Verification:** Wired Stripe incoming webhook verification using the raw body buffer and `stripe-signature` header.
2. **Secret Decryption:** Configured Stripe webhook secret decryption using GCM helpers.
3. **DB Idempotency:** Claimed event/session/payment transaction keys atomically in database to block duplicate webhooks.
4. **PostHog Ingestion:** Ingested successful checkouts into PostHog with user stitching.
5. **UI & Docs:** Added Stripe Webhook Sync card to Integrations dashboard and documented instructions in Docs page.

---

## Session 118B — Revenue Ingestion Foundation / Durable Idempotency + Secret Handling
**Date:** 2026-06-06 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Durable DB-Backed Idempotency Migration:** Created migration `20260606180000_revenue_foundation.sql` adding `revenue_idempotency_keys` table with indexes, RLS policies, and non-empty checks for `provider`, `key_type`, and `key_value`. Created `revenue_ingestion_events` table for transaction history. Added `claim_revenue_idempotency_keys` Postgres RPC function executing in a single atomic transaction block. Added encrypted webhook secret and API key columns to `sites`, with a SHA-256 backfill for existing API keys.
2. **Symmetric GCM Encryption Helpers:** Implemented `encryptSecret` and `decryptSecret` in `api/lib/utils.js` using `aes-256-gcm`. They validate the `ENCRYPTION_KEY` on usage and throw errors if it is missing or invalid.
3. **Database-Backed Idempotency Helper:** Implemented `claimIdempotencyKeys` and `logIngestionEvent` in `api/lib/idempotency.js`. The JS helper translates the RPC's `false` return value into `{ success: false, duplicate: true }`.
4. **Secret API Key Hashing:** Refactored `api/middleware/api-key.js` and `api/routes/webhook-incoming.js` to hash incoming API keys using SHA-256 and query the `api_key_hash` column first, falling back to plaintext `api_key` for backward compatibility.
5. **Startup GCM Key Check:** Added fail-fast validation in `api/index.js` to crash the server on startup in production if `ENCRYPTION_KEY` is missing or invalid.
6. **Automated Verification:** Implemented `scripts/qa-revenue-foundation.mjs` testing encryption/decryption round-trips, validation throwing behavior, and RPC/database idempotency and rollback atomicity.

## Session 118A — Audit + Plan for Revenue Ingestion
**Date:** 2026-06-06 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Revenue Ingestion Audit:** Completed a detailed audit of standard conversions (`api/routes/conversion.js`), offline conversions (`api/routes/conversion-offline.js`), incoming webhooks (`api/routes/webhook-incoming.js`), outbound webhooks (`api/lib/webhook.js` and `api/routes/webhooks.js`), and pixel routes (`api/routes/pixel.js`).
2. **Detailed Plan Created:** Created [revenue_ingestion_audit.md](file:///Users/ubaid/.gemini/antigravity/brain/77b33e63-5989-4fc8-99ee-bcd620aa29e4/revenue_ingestion_audit.md) outlining data fields, deduplication mapping gaps, security/privacy risks, UI/documentation status, and exact implementation plans for Stripe sync, Payments API, and Shopify webhooks.
3. **Static Launch Verification:** Executed `npm run qa:static` checking backend file syntaxes, production frontend compilation, git status, and plan/scoping gates. All checks passed with zero errors.

## Session 117C — Page-Path Funnel Presets
**Date:** 2026-06-06 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Interactive Funnel Presets UI:** Added a row of 5 preset selector buttons ('Pricing → Signup', 'Landing → Pricing → Checkout', 'Blog → Product → Checkout', 'Features → Pricing → Demo', and 'Custom') in `Analytics.jsx` using keyword strings suitable for backend sequential LIKE-matching.
2. **Active Step Deletion Handles:** Added step pills to the active steps summary in the card, allowing users to inspect active filters and remove individual step keywords via an inline delete button, which automatically updates the query state.
3. **Card-Level Controls & Validation:** Added inline validation requiring at least 2 keywords before a funnel can be built, preventing invalid requests. Added helper copy clarifying matching behavior and session restrictions.
4. **Hardened Funnel Visualization:** Upgraded `FunnelChart.jsx` to support loading spinners, API query error messages, default empty states, and custom empty search results states detailing LIKE-match search constraints.
5. **Comprehensive Funnel Documentation:** Added a detailed "Page-Path Funnels" documentation section and navigation index in `Docs.jsx` explaining sequential page-path rules, keyword matching details, capabilities, plan restrictions, and limitations.

## Session 117B — Session Grouping in Journey
**Date:** 2026-06-06 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Unified Visitor Journey API:** Refactored `api/routes/journey.js` to return both flat chronological events (for backwards compatibility) and session-grouped events derived at query time using the 30-minute inactivity rule.
2. **Visitor Journey Session Timeline:** Rewrote `Journey.jsx` and `JourneyModal.jsx` to render collapsible session cards displaying session index, source labels, duration, page/event counts, conversion badges, and entry/exit pages.
3. **Mobile Rendering Fixes:** Handled URL/path truncation and break-all overflows to prevent horizontal scrolling on mobile viewports.
4. **Visitor Session Docs:** Documented sessionizations, inactivity rules, bounce behavior, and API payloads in `Docs.jsx`.

## Session 116D — Campaign Drilldown Polish
**Date:** 2026-06-06 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Unified Campaigns Backend API:** Refactored campaigns overview in `api/routes/campaigns.js` to query sessions (visits) and leads in parallel via `getFlexibleReport`. Case-insensitively merged and sorted rows, exposing traffic-only campaigns with zero conversions. Implemented `/api/campaigns/export` serving sanitised CSV data.
2. **Realigned Campaigns UI:** Expanded Campaign KPI cards in `Campaigns.jsx` to 6 items: Visits, Leads, Conversions, Revenue, Spend, and Manual ROAS. Aligned all `thead` and `tbody` columns, placing Visits, Leads, Spend, CPL, Manual ROAS, and Trend headers exactly above their cells. Added inline spend saving indicators.
3. **UTM & Cost Tracking Docs:** Added UTM & Cost Tracking section to `Docs.jsx` containing supported parameters, tagging guidelines, troubleshooting, and clarifying the manual nature of ROAS calculations.
4. **Integration Test Verification:** Polished authorization, header parsing safety, and output CSV header validation in `scripts/qa-campaigns-drilldown.mjs`. Verified all tests pass.

## Session 116C — Per-Site Timezone Reporting
**Date:** 2026-06-06 | **Branch:** `main` | **Build:** ✅ passing

### Completed
1. **Utility Helpers:** Created `isValidTimezone`, `getLocalDateString`, `getLocalMonthString`, `getLocalWeekString`, and `getPaddedUtcDateRange` in `api/lib/utils.js`.
2. **Dashboard Overview Routing:**
   - Selected `conversion_timestamp` from `attributed_conversions` inside `/overview` endpoint.
   - Padded Supabase queries by ±24h based on the site's local timezone.
   - Filtered returned database rows in-memory in Javascript using string local date buckets, trimming out-of-bounds rows.
   - Shifted HogQL queries (stages, top pages, bounce_rate) using exact UTC boundaries matching local day boundaries using `toTimeZone(timestamp, tz)`.
3. **Sites API Route:** Exposed `timezone` and `excluded_paths` field in `api/routes/sites.js` list endpoint.
4. **Dashboard & Settings UI:**
   - Appended site's timezone (e.g. `• America/New_York`) to "Revenue Trend" and "Leads Over Time" chart subtitles in `Dashboard.jsx`.
   - Updated the timezone setting description in `Settings.jsx` to state that timezone grouping applies only to dashboard overview trends, while custom reports and logs remain UTC.
5. **Documentation:** Added "Timezone Behavior" section under navigation and details in `Docs.jsx`.
6. **Automated Verification:** Added `scripts/qa-timezone.mjs` verifying validation, date, month, week, and padded date calculation logic.

## Session 116B — Path Exclusions
**Date:** 2026-06-06 | **Branch:** `main` | **Build:** ✅ passing
### Completed
1. **Database Migration Added:** Created migration `20260606114100_add_site_settings.sql` adding `excluded_paths` and `timezone` to `sites`.
2. **Server-Side Filtering:** Created `isPathExcluded` in `api/lib/utils.js` and enforced it in `api/routes/track.js` and `api/routes/conversion.js`.
3. **Site-Key Context Caching:** Updated `validateSiteKey` middleware in `api/middleware/auth.js` to select, parse, cache, and populate `excluded_paths` and `timezone` in `req.site`.
4. **Settings PATCH Update:** Updated the `/settings` endpoint in `api/routes/integrations.js` to allow updating both settings with validation.
5. **Tracker Gating:** Updated standard `tracker.js` and cookieless `tracker.cookieless.js` to parse `data-exclude`, store exclusion patterns, check exclusions dynamically, and hook history modifiers (SPA navigation) to re-evaluate exclusions. Minified builds completed.
6. **UI & Documentation:** Added site settings card to `Settings.jsx`, client-side helper snippet copy to `Snippet.jsx`, and detailed documentation section to `Docs.jsx`.
7. **Automated Verification:** Added `qa-path-exclusions.mjs` verifying server-side and client-side matching correctness.

## Session 115 — Repo Cleanup + Markdown Reconciliation + Security Review
**Date:** 2026-06-05 | **Branch:** `main` | **Build:** ✅ passing
### Completed
1. **Billing Gates Hardened:** Added `requireUserAuth`, `validateSiteKey`, and `requireSiteMembership` to checkout, portal, and status routes in `api/routes/billing.js`.
2. **Obsolete Scripts Cataloged:** Identified `test-debug.js`, `test-exact-sql.js`, `test-flexible.js`, `test-hogql.js`, `test-posthog-type.js`, and `touch .gitignore` as safe to delete.
3. **Markdown Audit:** Verified GDPR/CAPI/Shopify copy accuracy, cataloged stale docs (`docs/SESSION_HANDOFF.md` and root `implementation_plan.md`) for proposed deletion, and fixed a typo in `CLAUDE.md`.
4. **Validation:** Ensured all backend syntax tests pass, built the production dashboard, and verified zero QA static rule errors.

## Session 112 — Final Private Beta Launch QA
**Date:** 2026-06-05 | **Branch:** `main` | **Build:** ✅ passing
### Completed
1. **Static and Syntax checks:** Verified route mounts, plan feature gates, PII query parameter filters, and compiled frontend build cleanly.
2. **Smoke & Edge cases:** Ran local ingestion tests and stress-tests covering malformed requests, invalid site keys, and plan tier restrictions.
3. **Live Attribution validation:** Ingested simulated spaced user touchpoints and verified that the live engine maps and calculates Linear, Time Decay, U-Shaped, and W-Shaped fractional values.
4. **Outbound Webhooks E2E checks:** Confirmed URL validations, HMAC headers, online/offline triggers, duplicate blocking, and disabled status toggles using a local mock receiver.
5. **SEO & Legal assets:** Validated Privacy/Terms routes, sitemap path mappings, and Robots.txt exclusions.

---

## Session 110B — Fix Lead Journey Drilldown Bugs and Enrich Timeline
**Date:** 2026-06-05 | **Branch:** `main` | **Build:** ✅ passing
### Completed
1. **Array Destructuring Mismatch Fixed:** Added `argMaxIf(properties.conversion_type, timestamp, event = '$conversion') AS last_conversion_type` to `leads-server.js` query.
2. **Leads Page ReferenceError Fix:** Declared `CONVERSION_TYPE_BADGE` styling mapping constant in `Leads.jsx`.
3. **Journey Timeline Enrichment:** Exposed `order_id`, `destination_domain`, and `destination_url` in the query and API response of `journey.js`.
4. **Timeline UI Details & URL Redaction:** Integrated `normalizeUrl` utility to strip query parameters and hashes (redacting emails in the path) on both `JourneyModal.jsx` and `Journey.jsx`, and displayed the new order/outbound fields.

---

## Session 109 — Brutal Competitive Feature Parity Audit
**Date:** 2026-06-05 | **Branch:** `main` | **Build:** ✅ passing
### Completed
1. **Competitive Audit Report:** Created [competitive_feature_parity_audit.md](file:///Users/ubaid/.gemini/antigravity/brain/62433705-749b-4885-9b11-c799464b11c9/competitive_feature_parity_audit.md) detailing positioning, matrices, and launch scorecards.
2. **Segment Readiness Check:** Verified SaaS and Lead-Gen segments are ready for immediate onboarding; eCommerce merchants should be deferred until automated ad spend ingestion is live.
3. **Repository Sync:** Updated session log, plan state, and handoff files.

---

## Session 108 — Public Trust Cleanup
**Date:** 2026-06-05 | **Branch:** `main` | **Build:** ✅ passing
### Completed
1. **ToS & Privacy Pages:** Created [Terms.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Terms.jsx) and [Privacy.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Privacy.jsx) with clean legal copy.
2. **Footer Wiring:** Connected footer link pathways in [MarketingFooter.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/components/MarketingFooter.jsx).
3. **Dashboard Share indexability:** Injected `noindex` SEO headers in [ShareDashboard.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/ShareDashboard.jsx) to prevent indexing.

---

## Session 107 — Public Site Copy Polish
**Date:** 2026-06-05 | **Branch:** `main` | **Build:** ✅ passing
### Completed
1. **Button & Feature Aligner:** Standardized CTA buttons and pricing feature matrices in [PricingCards.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/components/PricingCards.jsx).
2. **Sitemap validation:** Aligned modified dates in public [sitemap.xml](file:///Users/ubaid/Desktop/trackiq/dashboard/public/sitemap.xml).

---

## Session 106 — Public Site SEO & Mobile UX Cleanup
**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing
### Completed
1. **SEO Headers:** Cleaned up HTML titles and description tags inside [index.html](file:///Users/ubaid/Desktop/trackiq/dashboard/index.html).
2. **Robots rules:** Whitelisted `/report-builder` in [robots.txt](file:///Users/ubaid/Desktop/trackiq/dashboard/public/robots.txt).
3. **Layout styles:** Hardened responsive container dimensions in [ComparisonTable.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/components/ComparisonTable.jsx).

---

## Session 105 — Fully Fix Advanced Attribution Models

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Safe JS-based Live Multi-Touch Attribution Engine** — Created `getMultiTouchAttributionLive` in `api/lib/attribution-engine.js`. It fetches conversion events and pageview touchpoints separately using simple, highly indexable queries on ClickHouse, then joins and computes fractional shares in JavaScript.
2. **Support All Advanced Models** — Integrated the live pipeline inside `getFlexibleReport` and `getAttribution` for `linear`, `u_shaped`, `time_decay`, and `w_shaped` models. This allows them to compute live on-the-fly for any combination of dimensions, granularity, dates, and filters.
3. **Deterministic Test Harness** — Created `scripts/qa-attribution-harness.mjs` and successfully verified the fractional allocations for all single-touch and multi-touch models against simulated user journeys.
4. **Re-enabled UI Dropdowns & Gating Removal** — Removed the temporary safety block and fallback logic from `api/routes/attribution.js`, `Dashboard.jsx`, and `ReportBuilder.jsx`, fully exposing the working models to paid beta users.
5. **Intercept Advanced Explanations** — Handled the explain endpoint (`/api/attribution/explain`) for advanced models by returning a clear aggregate explanation object instead of crashing with unknown model errors.
6. **Report Builder UI Adjustments** — Hid the explanation toolbar toggle button and the table's "Why" column for multi-touch models.
7. **Controlled API Integration Test** — Implemented `scripts/qa-attribution-integration.mjs` which programmatically boots a temp auth user, extends billing trial, ingests unique pageviews and a conversion, queries `/api/attribution` endpoints, verifies exact revenue reconciliation and source allocation, and cleans up all database updates.

### Files changed
- `api/lib/attribution-engine.js` — Live JS multi-touch pipeline and explain endpoint interception.
- `api/routes/attribution.js` — Remove API gating blocks.
- `dashboard/src/components/ConversionExplanationModal.jsx` — Support multi-touch models descriptions and logic tooltips.
- `dashboard/src/pages/Dashboard.jsx` — Re-enable cards and remove sanitization fallback.
- `dashboard/src/pages/ReportBuilder.jsx` — Restore standard selector options and hide explanation elements for multi-touch models.
- `package.json` — Update `qa:attribution` hook to run both tests.
- `KNOWN_ISSUES.md` — Log the linear error fix and explain endpoint limitation.
- `scripts/qa-attribution-harness.mjs` [NEW] — Deterministic QA test harness.
- `scripts/qa-attribution-integration.mjs` [NEW] — Controlled API integration test script.

---

## Session 104.1 — Runtime Smoke + Manual Browser QA

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Executed Smoke QA Script** — Configured test key `1` and generated a valid Supabase JWT bearer token for the super admin dev account. Executed `qa:smoke` and verified passing results for pageviews, online conversions, deduplication skipping, and offline ingestion.
2. **Executed Edge-Case QA Script** — Ran `qa:edge` checks verifying missing keys, PII redaction URL filters, malformed values, public dashboard share scoping, and billing plan gates.
3. **Manual Browser QA Checklist** — Re-verified the manual browser QA checklist to ensure onboarding, snippet installation, outbound link tracking, deduplication summaries, Site Switcher, and export metrics passed tested checklist items.

### Files changed
- `SESSION_STATE.md` — Reconcile session state.
- `SESSION_HANDOFF.md` — Reconcile handoff notes.
- `SESSION_LOG.md` — Log Session 104.1 summary.

---

## Session 104.0 — Geo / Device / Browser Dimensions

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Expose Browser and OS Properties** — Added `properties.browser_name`, `properties.browser_version`, `properties.os_name`, and `properties.os_version` to the SELECT query in `api/routes/events.js` `/latest` endpoint and mapped them to top-level fields for consistent frontend consumption.
2. **Event Debugger Clean Detail Rows** — Added clean visual rows for "Browser" and "OS" in the sidebar details panel in `dashboard/src/pages/EventDebugger.jsx`, displaying name and version properties correctly.
3. **Verify Country and Device Type Display** — Verified that `Country` and `Device Type` are already cleanly displayed in the details sidebar panel and table (left them as Done).
4. **Validation and QA Verification** — Executed `node --check` validation, built the production dashboard cleanly, and ran `npm run qa:static` checks successfully with zero failures or trailing whitespace warnings.

### Files changed
- `api/routes/events.js` — Expose browser and OS properties.
- `dashboard/src/pages/EventDebugger.jsx` — Render Browser and OS rows in the Event Debugger sidebar.
- `SESSION_STATE.md` — Reconcile session state.
- `SESSION_LOG.md` — Log Session 104.0 summary.
- `SESSION_HANDOFF.md` — Reconcile handoff notes.

---

## Session 103.2 — Martech Engineer Static QA Review

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Static Copy & Integration Review** — Audited auth callbacks, onboarding script blocks, and settings pages to ensure correct domains and API calls are specified.
2. **Telemetry Ingestion & Redaction Audit** — Audited tracker (`sourcetrack.track` and `sourcetrack.conversion`) properties and server-side routes to verify correct parameter handling and URL PII query parameter regex redaction logic.
3. **Plan Gates & Switcher Context Audits** — Confirmed that active site switcher changes client-scoped context variables, and that server-side gates correctly verify site plans on attribution and dashboard routes.
4. **Super Admin Cleanup** — Surgically updated the install verification card subtitle inside `Admin.jsx` to refer to database telemetry instead of PostHog.

### Files changed
- `dashboard/src/pages/Admin.jsx` — Cleaned final residual PostHog subtitle mention.
- `SESSION_STATE.md` — Updated session status to 103.2 and next task target.
- `SESSION_LOG.md` — Added Session 103.2 log entry.
- `SESSION_HANDOFF.md` — Documented static martech audits.

---

## Session 103.1 — QA and Validation Before Public Launch

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Syntax, Build, and Mount Verification** — Verified all API route and middleware scripts compile cleanly (`node --check`). Built the production dashboard successfully. Confirmed all endpoints (including `/api/conversion/offline` and `/api/events/dedupe-summary`) are mounted and properly gated.
2. **Auth & Scope Security Hardening** — Verified that active site keys and user memberships are strictly verified for all dashboard analytical, export, and campaign endpoints, preventing cross-customer data access.
3. **Tracking & PII Redaction Audit** — Verified that the PII parameter regex redactor sanitizes incoming URLs/referrers at the ingestion level while UTMs and ad click-IDs remain safe.
4. **Marketing Truthfulness Audit** — Softened residual "server-side conversion sync wording" claims in `Billing.jsx` and `Docs.jsx` meta tag descriptions to align with the current standard webhook pipeline and offline REST API capabilities.
5. **Install Verification & Doctor Health** — Confirmed that onboarding verification reads from Supabase metadata columns directly and doctor health statuses map safely under warning thresholds.

### Files changed
- `dashboard/src/pages/Billing.jsx` — Softened plan feature description.
- `dashboard/src/pages/Docs.jsx` — Softened meta tags.
- `SESSION_STATE.md` — Updated session status to 103.1 and next session task.
- `SESSION_LOG.md` — Added Session 103.1 log entry.
- `SESSION_HANDOFF.md` — Added QA verification details.

---

## Session 102.9 — Solution Pages CAPI Claims Cleanup

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **eCommerce Copy Softening** — Updated `SolutionEcommerce.jsx` to remove unverified Meta/Google CAPI sync and automated bidding optimization claims. Replaced them with descriptions of structured purchase conversion payloads ready for webhook routing, and removed all mentions of "Shopify app" or "WooCommerce integrations".
2. **Agency Copy Softening** — Updated `SolutionAgency.jsx` to remove references to per-client CAPI credentials, multi-platform ad sync (ad-platform sync), and the unverified "40% more conversions" claim. Replaced them with client data isolation details, structured client switcher, and client-scoped webhook pipeline info.
3. **SaaS Copy Softening** — Updated `SolutionSaaS.jsx` to remove B2B LinkedIn/Google CAPI sync claims, focusing instead on trial-to-paid signup event tracking and in-app visitor identification (`sourcetrack.identify`).
4. **Lead Gen Copy Softening** — Updated `SolutionLeadGen.jsx` to remove CAPI-sync and automated CRM deal-matching promises. Replaced them with clear descriptions of offline conversion ingestion via the `/api/conversion/offline` REST API.
5. **Grep and Build Validation** — Verified that no marketing pages contain unverified CAPI promises, compliance overclaims, or outdated tracker API examples, and verified that the dashboard compiles successfully.

### Files changed
- `dashboard/src/pages/SolutionEcommerce.jsx` — Softened eCommerce sync, Shopify app, and bidding promises.
- `dashboard/src/pages/SolutionAgency.jsx` — Softened CAPI sync per client, TikTok/LinkedIn/Microsoft sync, and 40% conversion claims.
- `dashboard/src/pages/SolutionSaaS.jsx` — Softened LinkedIn/Google CAPI sync claims.
- `dashboard/src/pages/SolutionLeadGen.jsx` — Softened Lead Gen CAPI sync and automatic CRM sync claims.

---

## Session 102.8 — Public Docs & Ingest Domain Cleanup

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Snippet Installation Cleanup** — Removed unimplemented feature sections ("Cross-Domain Tracking", "Booking Attribution", "Auto-identify toggle" / `data-user-id-selector` examples) from `Snippet.jsx`. Exchanged code examples with a short, copy-paste-safe neutral note explaining proper standard API alternatives (`sourcetrack.identify` and `sourcetrack.conversion`).
2. **Standardized JS API Reference** — Updated JavaScript API lists to solely reference valid production methods: `track`, `conversion`, `identify`, `consent`, `optOut`, `optIn`, `hasConsent`. Scrubbed `window.trackiq`, `trackiq.conversion`, and deprecated `.event()`/`.id()` signatures.
3. **Ingest Domain Consistency** — Corrected outdated domain variables and example endpoints, ensuring user-facing integration snippets refer to `https://api.srctk.com` and `https://app.sourcetrack.ai`.
4. **PostHog Branding Removal** — Cleared internal vendor names ("PostHog") from user-facing copy in `Docs.jsx`, `Settings.jsx`, and `Snippet.jsx`, replacing them with generic descriptors (e.g., "analytics events", "SourceTrack tracking pipeline").
5. **Soften Compliance Claims** — Softened over-reaching compliance assertions (e.g., "fully compliant", "GDPR-safe") in favor of privacy-friendly, low-risk descriptors ("privacy-conscious", "privacy-friendly", "no cookies, no fingerprinting").
6. **Solution Pages CAPI Audit** — Performed audit grepping for unverified Conversions API (CAPI) references on `SolutionEcommerce.jsx`, `SolutionAgency.jsx`, `SolutionSaaS.jsx`, and `SolutionLeadGen.jsx`.

### Follow-up Blockers (For Session 102.9)
- **Unverified CAPI Claims:** Marketing copy on the four main solution pages makes specific, detailed claims about unverified ad-platform conversion sync claims. These integrations are not yet active/verified in the current backend and must be corrected, softened, or completed.

### Files changed
- `dashboard/src/pages/Snippet.jsx` — Removed unimplemented sections, corrected API calls and domains.
- `dashboard/src/pages/Docs.jsx` — Removed PostHog vendor leaks, updated domains/URLs.
- `dashboard/src/pages/Settings.jsx` — Cleared vendor references, softened GDPR compliance wording.

---

## Session 102.7 — Server-Side Plan Feature Gate Middleware

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Synchronized Plan Matrices** — Updated `FEATURE_MATRIX` on both backend (`api/lib/plan-features.js`) and frontend (`dashboard/src/lib/planFeatures.js`) to support four new feature keys: `manual_spend`, `ai_analytics`, `ai_chat`, and `saved_reports` (all set to `free: false` and `true` for paid tiers). Added friendly labels for the upgrade prompt UI.
2. **Multi-touch Attribution Gating** — Enforced `multi_touch_attribution` checks in `/api/attribution` and `/api/attribution/explain` for configured multi-touch models (`linear`, `u_shaped`, `time_decay`, `w_shaped`), while keeping single-touch/core attribution models available according to existing behavior.
3. **AI Analytics & Chat Routing Protection** — Restricted AI overview, forecast, and anomaly routes `/api/ai-analytics/*` under `ai_analytics` gate. Bound the AI Chat endpoint `/api/ai-chat` under `ai_chat` gate. Restricted AI verdicts generator in `/api/attribution/verdicts` to paid plans.
4. **Saved Reports & Manual Spend Locking** — Gated the `/api/reports/saved` saved reports routes under `saved_reports` feature check. Locked down POST and DELETE endpoints in `/api/campaign-costs` to enforce `manual_spend` permissions, keeping the read GET route open.
5. **Frontend Performance & UI Polish** — Updated `Dashboard.jsx` and `ReportBuilder.jsx` queries to check plan permissions before querying saved reports, avoiding redundant network requests. Rendered an upgrade call-to-action lock card in `ReportBuilder.jsx` in place of the save form for free users.

### Files changed
- `api/lib/plan-features.js` — Synchronized matrix keys.
- `dashboard/src/lib/planFeatures.js` — Synchronized matrix keys and added UI labels.
- `api/routes/attribution.js` — Gated advanced models and verdicts.
- `api/routes/saved-reports.js` — Gated reports database routes.
- `api/routes/ai-analytics.js` — Gated AI analytics endpoints.
- `api/routes/ai-chat.js` — Gated AI query parsing route.
- `api/routes/campaign-costs.js` — Gated spend write and delete endpoints.
- `dashboard/src/pages/Dashboard.jsx` — Wrapped saved reports query with features gate check.
- `dashboard/src/pages/ReportBuilder.jsx` — Gated saved reports query and custom report save UI block.

### Next Session Plan
- **Session 102.8** — Public Docs & Ingest Domain Cleanup.

---

## Session 102.6 — Agency Layout Client/Site Switcher Dropdown

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Surgical Sites Listing API** — Created `GET /api/sites` endpoint in `api/routes/sites.js` and mounted it in `api/index.js` to securely list authorized sites for logged-in users, protecting user privacy and preventing cross-company info disclosure.
2. **Safe Explicit Site Context** — Created `SiteContext.jsx` implementing standard React context to query, cache, and select active site metadata. Active site key is persisted in localStorage via `sourcetrack_active_site_key`.
3. **Explicit Page Scoping** — Updated `Dashboard.jsx` and `Settings.jsx` to explicitly consume active site key/state from context, making all downstream analytical queries reactive without any monkey-patching or client-side interception.
4. **Layout Switcher UI** — Rendered a beautiful, responsive client switcher inside `Layout.jsx` sidebar, showing a static badge for single-site users, a styled dropdown for multi-site users, and onboarding link for zero-site users.

### Files changed
- `api/index.js` — Registered sitesRouter.
- `api/routes/sites.js` — Secure sites list API route.
- `dashboard/src/contexts/SiteContext.jsx` — Site Context state provider.
- `dashboard/src/App.jsx` — Wrap router with SiteProvider.
- `dashboard/src/components/Layout.jsx` — Sidebar client switcher UI panel and Chat siteKey update.
- `dashboard/src/pages/Dashboard.jsx` — Consumes activeSite.
- `dashboard/src/pages/Settings.jsx` — Consumes activeSite and updates loadSite.

### Next Session Plan
- **Session 102.7** — Server-Side Plan Feature Gate Middleware.

---

## Session 102.5 — Export & Share Scope Security Hardening

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Surgical Export Route Hardening** — Confirmed that the `/api/export` router is mounted with site membership authentication middleware (`requireUserAuth, validateSiteKey, requireSiteMembership`) in `api/index.js`. Integrated `getSupabaseAdmin` inside `api/routes/export.js` to query saved reports strictly filtered by both `id` (the client-provided `report_id`) and `site_id` (the backend-resolved `req.site.id`), ensuring that cross-site report lookups fail with a 404/403.
2. **Override Protections on Public Token Route** — Updated `GET /api/public/:token` inside `api/routes/public-dashboard.js` to check for and reject (`400 Bad Request`) any query or body scope override attempts (`site_key`, `site_id`, `siteKey`, `siteId`). This guarantees that only the site context matching the cryptographically verified token is queried.
3. **Sensitive Key Check in CSVs** — Confirmed that the `escapeCsv` builder in `api/routes/export.js` only exports aggregated metric columns returned by `getFlexibleReport` (sources, campaign dimensions, etc.), ensuring no raw identifiers (like order IDs, phone numbers, emails, tokens, or customer IDs) are included.

### Files changed
- `api/routes/export.js` — Secure middleware chain, `report_id` verification, parameter fallback mapping.
- `api/routes/public-dashboard.js` — Scope override checks on the public token GET handler.

### Next Session Plan
- **Session 102.6** — Agency Layout Client/Site Switcher Dropdown.

---

## Session 102.4 — Conversion Deduplication UI Visibility

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **In-Memory Deduplication Logging** — Declared a Map `dedupeEventsLog` and implemented the `getDedupeSummary(siteId)` metrics builder in `api/routes/conversion.js`. When a duplicate conversion is skipped (based on `order_id`), it logs the timestamp and key type (`order_id` or `derived`).
2. **Secure Summary Endpoint** — Added `GET /api/events/dedupe-summary` in `api/routes/events.js`. The route is secured with both `validateSiteKey` and `requireSiteMembership` to verify authenticated site access.
3. **Event Debugger Integration** — Updated `dashboard/src/pages/EventDebugger.jsx` to fetch deduplication metrics in parallel during the main data fetch. Added the Conversion Deduplication summary card rendering status metrics and warning parameters gracefully without exposing any raw customer identifiers.

### Files changed
- `api/routes/conversion.js` — Logged duplicate events and exported `getDedupeSummary`.
- `api/routes/events.js` — Implemented the secure `/dedupe-summary` endpoint route handler.
- `dashboard/src/pages/EventDebugger.jsx` — Fetched and displayed the Conversion Deduplication card.

### Next Session Plan
- **Session 102.5** — Export & Share Scope Security Hardening.

---

## Session 102.3 — SourceTrack Doctor (Phase 1)

**Date:** 2026-06-04 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Real-time Diagnostic Endpoint** — Implemented `GET /api/dashboard/tracking-health?site_key=...` in `api/routes/dashboard.js`. Queries the database directly to prevent cache lag, derives tracking health states (`healthy`, `warning`, `critical`, `pending`, `unknown`), and strips `www.` prefixes to normalize domains accurately.
2. **Dashboard Doctor Card** — Integrated `/tracking-health` with React Query and rendered the doctor panel card in `dashboard/src/pages/Dashboard.jsx`. Shows statuses, detailed checks, event metadata, and quick action links ("Try Again", "Event Logger", "View Snippet").
3. **Validation & Trailing Whitespace Cleanup** — Resolved all trailing whitespaces identified by `git diff --check`, verified full build compilation of frontend assets, and validated routes syntax.

### Files changed
- `api/routes/dashboard.js` — Added the tracking-health endpoint route handler.
- `dashboard/src/pages/Dashboard.jsx` — Fetched and rendered the tracking health Doctor card/panel.

### Next Session Plan
- **Session 102.4** — Conversion Deduplication UI Visibility.

---

## Session 102.2 — Ingest-Side PII URL/Referrer Redaction

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Shared Redaction Utilities** — Implemented and exported `redactPiiFromUrl` and `redactPiiFromObject` in `api/lib/utils.js`.
   - Sanitizes common sensitive query parameter values (emails, phones, passwords, auth tokens, invite codes) in URLs/referrers to `REDACTED` while keeping UTM tags and click-IDs fully intact.
   - Handles relative URLs gracefully and implements regex fallbacks for parsing safety.
   - Allows targeted key-based URL/referrer property redaction in custom payload objects without modifying regular traits/identifiers.
2. **Ingest Sanitize Interceptors** — Updated Express API controllers:
   - `api/routes/track.js` — Sanitizes `req.body.page_url`, `req.body.referrer`, and `req.body.properties` before they are sent to PostHog, written to webhook targets, or persisted to telemetry tables.
   - `api/routes/conversion.js` — Sanitizes `req.body.page_url`, `req.body.referrer`, and `req.body.properties` before PostHog dispatch, webhook broadcast, and external CAPI target fan-outs.
   - `api/routes/identify.js` — Sanitizes `req.body.traits` (redacting specific keys like `page_url`, `referrer`, `landing_page` if present, without altering identity tokens or identifiers).
3. **Manual Unit Verification** — Added a dedicated local validation script verifying all parameters behave correctly, relative paths parse safely, and invalid strings do not throw exceptions.

### Files changed
- `api/lib/utils.js` — Added `redactPiiFromUrl` and `redactPiiFromObject`.
- `api/routes/track.js` — Intercepted track and collect routes to redact parameters.
- `api/routes/conversion.js` — Intercepted conversion payloads to redact parameters.
- `api/routes/identify.js` — Sanitized specific URL fields inside traits.

### Next Session Plan
- **Session 102.3** — SourceTrack Doctor & Tracking Health Alerts.

---

## Session 102.1 — Snippet Installation Verification Assistant

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Direct Telemetry Metadata Update** — Added a throttled, non-blocking telemetry metadata update helper to `api/routes/track.js` and `api/routes/conversion.js`. This writes the `last_seen_at` and `onboarding_state` directly to the `sites` table upon successful event ingestion, eliminating the need to query the database repeatedly.
2. **Supabase Verification Endpoint** — Rewrote the `/api/install/status` endpoint in `api/routes/install.js` to directly read the lightweight telemetry data from the `sites` table instead of relying on slow/failing PostHog `queryHogQL` calls.
3. **Domain Validation & Enhanced UI** — The `/status` endpoint now correctly verifies if an event came from a different domain. Updated `dashboard/src/pages/Onboarding.jsx` to parse and render these specific verification states (`wrong_domain`, `wrong_site_key`, `api_failed`) directly in the UI.

### Files changed
- `api/middleware/auth.js` — Appended telemetry fields to the site cache layer.
- `api/routes/track.js` — Throttled metadata writes.
- `api/routes/conversion.js` — Throttled metadata writes.
- `api/routes/install.js` — Rewritten verification querying Supabase.
- `dashboard/src/pages/Onboarding.jsx` — Handled new states (`wrong_domain`, `wrong_site_key`, `api_failed`) and stopped polling efficiently.

### Next Session Plan
- **Session 102.2** — SourceTrack Doctor & Tracking Health Alerts.

---

## Session 101.6 — Dashboard Optional Data Fallback Polish

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Graceful Optional Data Fallbacks** — Hardened the error pathways of `/api/dashboard/cac` and `/api/campaign-costs` GET routes. Instead of crashing or returning a hard HTTP 500 error when Supabase queries fail (e.g., if database tables are temporarily offline or missing), the API endpoints now return a status 200 with custom fallback object shapes wrapping an empty results array and a clear `_unavailable` flag.
2. **Graceful Frontend Fallback Extraction** — Updated the `useQuery` parser for `cacData` inside `Dashboard.jsx` to recognize the nested fallback wrapper using:
   `const cacResults = Array.isArray(cacData) ? cacData : (cacData?.results || [])`
   `const cacUnavailable = cacData?.cac_unavailable || false`
3. **Graceful UI Rendering for Unavailable States** — Integrated the `cacUnavailable` status into the dashboard UI:
   - **Avg CAC Tile**: Renders an amber "Unavailable" text block with a "spend data unavailable" details hint when spend calculations fail.
   - **Attribution Table**: Renders "Unavailable" in place of numeric/missing strings under the CAC and Payback columns.
   - **Insights & Alerts Board**: Automatically appends warning cards if analytics or spend data is unavailable.

### Files changed
- `api/routes/dashboard.js` — Graceful catch block fallback inside the `/cac` endpoint.
- `api/routes/campaign-costs.js` — Graceful catch block fallback inside the GET `/` endpoint.
- `dashboard/src/pages/Dashboard.jsx` — Handled `cacUnavailable` conditional rendering in Avg CAC metric tile, sources table columns, and insights panel.

---

## Session 101.5 — SEO, Sitemap, Robots, and Use-Cases Footer Cleanup

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Sitemap and Robots Configuration** — Created a comprehensive `sitemap.xml` listing all 12 public marketing pages with their priorities. Removed the `/report-builder` path block from `robots.txt` since it serves a public marketing gate for anonymous users.
2. **Auth Indexability Protection** — Added `/login`, `/signup`, and `/auth/callback` to the disallow rules in `robots.txt` and verified that they have `<meta name="robots" content="noindex, nofollow" />` set inside their `<Helmet>` blocks.
3. **Footer Redirect Link Cleanup** — Updated links in the use cases column of the footer (`MarketingFooter.jsx`) to point directly to the canonical solution URLs rather than old redirected use case routes.

### Files changed
- `dashboard/public/sitemap.xml` — Included all 12 public marketing page URLs.
- `dashboard/public/robots.txt` — Removed `/report-builder` disallow; added `/login`, `/signup`, and `/auth/callback` disallows.
- `dashboard/src/components/MarketingFooter.jsx` — Updated use case links directly to canonical routes.

### Next Session Plan
- **Session 102.1** — Pending future directives from developer.

---

## Session 101.4B — Legacy Attribution Date-Range Touchpoint Truncation Fix

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Date-Range Truncation Bug Fixed** — Refactored legacy attribution functions (`lastTouchAttribution`, `firstTouchNonDirectAttribution`, and `lastTouchNonDirectAttribution`) in `api/lib/attribution-engine.js` to look up pageview touchpoints across all time (without a lower-bound date restriction) up to each conversion event's timestamp. This resolves the issue of misattributing historical touchpoints as `direct / none` when the pageview happened before the report window.

### Files changed
- `api/lib/attribution-engine.js` — Restructured subqueries to LEFT JOIN pageviews with `pv.timestamp <= e_inner.timestamp` and group by the unique conversion UUID `conversion_uuid` instead of `distinct_id`.


---

## Session 101.4A — Tracker Conversion Payload Parity

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Tracker Conversion Payload Parity** — Added `ref_param`, `source_param`, and `via_param` to the conversion payload in `tracker/tracker.js` so that they align with the fields sent by pageview events. Rebuilt `tracker/tracker.min.js`.

### Files changed
- `tracker/tracker.js` — Appended `ref_param`, `source_param`, and `via_param` properties to the conversion event payload.
- `tracker/tracker.min.js` — Rebuilt the minified tracker script.


---

## Session 101.3 — Tracker Build Pipeline and Documentation Domains

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Tracker Build Script Cleaned** — Removed `esbuild tracker/loader.js` step from `build:tracker` in `package.json` and successfully rebuilt `tracker/tracker.min.js`.
2. **Stale Domain References Replaced** — Replaced all instances of stale `https://api.sourcetrack.ai` domain with the correct ingestion and tracker domain `https://api.srctk.com` in:
   - `dashboard/src/pages/Docs.jsx`
   - `dashboard/src/pages/SolutionEcommerce.jsx`
   - `dashboard/src/pages/SolutionAgency.jsx`
   - `dashboard/src/pages/SolutionSaaS.jsx`
   - Comment in `api/routes/proxy.js`

### Files changed
- `package.json` — Cleaned `build:tracker` script by removing the missing `tracker/loader.js` reference.
- `tracker/tracker.min.js` — Rebuilt the minified tracker script.
- `dashboard/src/pages/Docs.jsx` — Updated code examples, URL base variables, and curl instructions to use the live domain.
- `dashboard/src/pages/SolutionEcommerce.jsx` — Fixed domain inside code block snippet.
- `dashboard/src/pages/SolutionAgency.jsx` — Fixed domain inside code block snippet.
- `dashboard/src/pages/SolutionSaaS.jsx` — Fixed domain inside code block snippet.
- `api/routes/proxy.js` — Updated domain reference in comments.


---

## Session 101.2 — Onboarding Back-Step Saving & Resume Snippet Stabilization

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Onboarding Back-Step saving fixed** — Adjusted step transition checks in backend `/api/onboarding/update` to permit saving previous steps (`targetStep <= currentStep`). Removed the deletion of user selections (`business_type`, `install_method`, `selected_conversions`) on back-steps to prevent onboarding data loss.
2. **Stepper progress preserved** — Configured database `current_step` tracking to store the maximum reached progress step, keeping completed steps clickable in the stepper even when users temporarily step backward to correct options.
3. **On-mount snippet resume fixed** — Updated the `loadOnboardingStatus()` mount logic in `Onboarding.jsx` to fetch the script snippet (or fallback to local template) when users resume onboarding at step 4 or later, eliminating the "Loading script..." freeze.

### Files changed
- `api/routes/onboarding.js` — Relaxed back-step saves, prevented data-loss deletion, and preserved maximum stepper progress.
- `dashboard/src/pages/Onboarding.jsx` — Added on-mount snippet fetching for resumed steps >= 4.


---

## Session 101.1 — Fix frontend API bypasses

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Stripe Billing / checkout bypasses fixed** — Modified `Billing.jsx` to use central `createCheckout` and `getBillingPortal` helpers from `lib/api.js` instead of raw fetches to relative `/api/billing/...` routes.
2. **GDPR / Settings bypasses fixed** — Replaced raw `fetch('/api/gdpr/...')` calls with `fetchApi` calls for retention policy updates, visitor erasure, and account deletion in `Settings.jsx`.
3. **Data Quality bypass fixed** — Replaced raw `/api/jobs/data-quality-check` POST with `fetchApi` in `DataQuality.jsx`.
4. **Stripe helpers alignment** — Standardized `createCheckout` and `getBillingPortal` in `lib/api.js` to execute correct POST requests with normalized body attributes (`plan` and `returnUrl`) matching the backend routes.

### Files changed
- `dashboard/src/lib/api.js` — Resolved body fields for Stripe helpers and enhanced `fetchApi` to handle flat JSON structures.
- `dashboard/src/pages/Billing.jsx` — Replaced raw checkout and portal calls with `createCheckout` and `getBillingPortal` helpers.
- `dashboard/src/pages/Settings.jsx` — Swapped raw GDPR endpoint calls with unified `fetchApi` helper.
- `dashboard/src/pages/DataQuality.jsx` — Configured manual check triggers via `fetchApi` helper.

### Next Session Plan
- **Session 101.2** — Stabilize Onboarding stepper progression (fix back-navigation 400 error and script snippet load on resuming).

---

## Session 98 — Beta QA: Auth → Onboarding → Tracker → Dashboard Flow

**Date:** 2026-05-23 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **OAuth callback** — AuthCallback redirects instead of spinner forever.
2. **Onboarding UX** — Removed Watch Video, added Log out, verification non-blocking, Continue to Dashboard with state persistence.
3. **API domain** — Dashboard reads `VITE_API_URL`/`VITE_TRACKER_BASE_URL`/`VITE_FRONTEND_URL` env vars.
4. **Tracker QA** — Confirmed pageview + conversion ingest, UTM/click-id capture, first-touch attribution.
5. **Onboarding completion** — No longer requires PostHog script detection. Requires site + business_type + install_method. Stores verification_status in onboarding_state.
6. **CORS fix** — Global OPTIONS middleware before auth. Hardcoded dashboard origins. OPTIONS returns 204.
7. **Install verification hardening** — /install/status returns safe pending response on PostHog failure. validateSiteKey returns 401 not 500.

### Files changed
- `api/index.js` — CORS preflight middleware, hardcoded origins
- `api/middleware/auth.js` — OPTIONS guard, catch returns 401 not 500
- `api/middleware/user-auth.js` — OPTIONS guard
- `api/routes/install.js` — PostHog failure returns safe pending response
- `api/routes/onboarding.js` — Removed PostHog verification block, store verification_status
- `dashboard/src/pages/Onboarding.jsx` — Non-blocking verification, Continue to Dashboard with state persistence
- `dashboard/src/pages/AuthCallback.jsx` — Redirect fix

### Remaining QA (manual browser verification needed)
- Continue to Dashboard after failed verification → should complete and navigate
- `/dashboard` loads
- Refresh `/dashboard` stays on dashboard (no redirect to onboarding)
- `/api/onboarding/me` returns `onboarding_completed: true`

### Deployment note
- Railway Dashboard deploy may fail with `##NOT-AUTHORIZED##`. Fix: reconnect GitHub repo access.

### Verification commands
```bash
curl -i -X OPTIONS "https://api.srctk.com/api/onboarding/complete" -H "Origin: https://www.sourcetrack.ai" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"
curl -i https://api.srctk.com/health
curl -i https://api.srctk.com/tracker/tracker.min.js
```

---

## Session 128B — Connected Ad Platform Sync

**Date:** 2026-06-08 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed

1. **Ad platform connection schema** — Added SQL migration `20260608010000_add_ad_platform_connections.sql` defining connections table, triggers, and indices.
2. **Google Ads OAuth setup** — Implemented signed state verification, token encryption, and campaign spend query parser.
3. **Meta Ads advanced manual token setup** — Implemented access token validation, credentials checking, and campaign insights mapping.
4. **Integrations UI Card** — Created "Ad Cost Sync" collapsible container with statuses, config setup, and sync logs in `Integrations.jsx`.
5. **Campaigns UI Sync** — Added "Sync connected accounts" button on Campaigns overview page.
6. **Double-unwrapping bug fixes** — Fixed `fetchApi` data extraction bugs in both `Integrations.jsx` and `Campaigns.jsx` preventing runtime crashes.

### Files changed
- `api/index.js`
- `api/lib/ad-cost-imports.js`
- `api/lib/google-ads.js`
- `api/lib/meta-ads.js`
- `api/routes/ad-platforms.js`
- `api/routes/campaign-costs.js`
- `dashboard/src/pages/Campaigns.jsx`
- `dashboard/src/pages/Docs.jsx`
- `dashboard/src/pages/Integrations.jsx`
- `scripts/qa-ad-platform-sync.mjs`
- `supabase/migrations/20260608010000_add_ad_platform_connections.sql`

### Remaining QA (manual browser verification needed)
- Navigate to `/integrations`, ensure "Ad Cost Sync" card shows Google Ads as "Not Configured" and Meta Ads setup is collapsed by default.
- Navigate to `/campaigns` and verify the "Sync connected accounts" button appears if connected, and "Import Costs" modal opens properly.

---

## Session 128C — Integrations UX Simplification

**Date:** 2026-06-08 | **Branch:** `main` | **Build:** ✅ passing (Vite + Node syntax check + QA pass)

### Completed

1. **Integrations Layout Refactoring** — Redesigned the `Integrations.jsx` page layout to prevent technical setup details from displaying by default. Renamed inner title developer options to "API & Webhook Tools" and corrected header text contrasts.
2. **Correct Install Guide Routing** — Updated the `View install guide` top callout and `Full setup guide` links on the Integrations page to navigate to `/docs#install-tracking`.
3. **Concise Docs Installation Guide** — Added a concise `#install-tracking` section in `Docs.jsx` with copy script widgets, paste instructions, simple platform setup summaries, and a link to advanced setups. Mounted a `useLocation`-based hash-change listener to scroll to sections automatically.
4. **Guided `/snippet` Install Page Redesign** — Simplified `/snippet` into a 3-step script copy and verification walkthrough, collapsing all advanced options (Identify, Stripe, Offline, Cross-Domain, CRM, Outbound, Key Events) under a single collapsed accordion. Turned the privacy warning into a calm, compact expandable row.
5. **Spend CSV Upload Workflow** — Linked the "Import CSV Costs" row directly to `/campaigns?import=true` and added a query parameter hook in `Campaigns.jsx` to intercept the parameter, open the import modal, and clear the address bar.

### Files changed
- `dashboard/src/pages/Campaigns.jsx`
- `dashboard/src/pages/Docs.jsx`
- `dashboard/src/pages/Integrations.jsx`
- `dashboard/src/pages/Snippet.jsx`

### Remaining QA (manual browser verification needed)
- Navigate to `/integrations`, click `View install guide` and check that it routes to `/docs#install-tracking` and scrolls to the new section.
- Click `Full setup guide` in the expanded snippet row, verifying it resolves to the same route.
- Open `/snippet` and verify it displays the simple 3-step install layout, that all advanced rows are collapsed under "Advanced setup", and that Stripe webhooks code and identify API references are hidden.
- Verify the privacy reminder is small and calm, only expanding details when "Read privacy notes" is clicked.
- Navigate to `/integrations` and click "Import CSV" to verify it redirects to `/campaigns`, opens the cost import modal, and clears the `?import=true` query param.
