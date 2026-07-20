# SourceTrack Self-Serve Paid Beta Audit

## Executive Verdict

**Almost Ready.**

SourceTrack / TrackIQ is in an exceptionally strong state. Its core tracking and ingestion pipelines—including pageviews, cookie/cookieless identity tracking, and browser conversions—are robust, fast, and feature-rich. Stripe and Shopify webhook integrations are fully verified with signature checking, raw-body processing, timing-safe equality, and order deduplication. The Event Debugger UI is highly polished, including suggestions, edge-case tracking, and deduplication telemetry. However, the product is **not fully ready for self-serve paid beta** due to a single critical developer experience gap: there is no UI inside Settings or the Developer portal to generate, view, or revoke the private server API tokens (`api_keys` table) required by the `POST /api/server/event` endpoint. Once this API Key management UI is built, and route-based lazy loading is added to optimize the 1.7MB frontend bundle, the product will be 100% ready for paid beta launch.

## Scores

Public marketing readiness: 95/100
Docs readiness: 90/100
Onboarding readiness: 92/100
Integration readiness: 95/100
Attribution trust readiness: 92/100
Dashboard/report UX readiness: 90/100
Developer readiness: 75/100
Billing/self-serve readiness: 92/100
Performance readiness: 70/100
Overall self-serve paid beta readiness: 88/100

## P0 Blockers

*None detected.* Ingestion, onboarding flow, Stripe checkout/billing portal redirects, and core attribution models are fully operational without runtime crashes.

## P1 Must Fix Before Self-Serve Paid Beta

### 1. Private API Key Management UI
- **Issue**: There is no UI in Settings or Developer settings for users to generate, view, copy, or revoke private Server API tokens (`api_keys` table).
- **Evidence**: Database migrations define an `api_keys` table, and `api/routes/server-events.js` expects a Bearer token hashed using SHA-256 for `POST /api/server/event`. However, no matching UI elements or dashboard routes exist to manage these keys.
- **File/route**: [Settings.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Settings.jsx), [DevelopersHome.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/developers/DevelopersHome.jsx).
- **User impact**: Developers wanting to integrate server-side tracking (documented in the Dev portal) have no self-serve way to obtain a token. They must request manual database injection.
- **Recommended fix**: Add an "API Keys" section inside `Settings.jsx` or a developer-facing tool page that exposes a list of active keys (prefix, name, created_at, last_used_at) and a "Generate Key" button. When generated, show the raw token once (e.g. `st_live_...`), hash it using SHA-256, and store it in the `api_keys` table.

### 2. GSC / CSV Ingestion Failure UX Polishing
- **Issue**: Google Search Console or CSV campaign spend sync returns generic 500/400 errors under edge cases (e.g. database column access failure or sync lock failure).
- **Evidence**: `api/routes/google-search-console.js` and `api/routes/campaign-costs.js` log failures internally but return generic envelopes without clear recovery guidance.
- **File/route**: [google-search-console.js](file:///Users/ubaid/Desktop/trackiq/api/routes/google-search-console.js), [campaign-costs.js](file:///Users/ubaid/Desktop/trackiq/api/routes/campaign-costs.js).
- **User impact**: Users setting up GSC or CSV spent sync may encounter silent or generic errors if properties aren't accessible or file formats are mismatched.
- **Recommended fix**: Capture specific errors (e.g. invalid scopes, sync locks, file size limits) and return descriptive messages to the dashboard.

## P2 Important Polish

### 1. Frontend Code-Splitting (Route-Level Lazy Loading)
- **Issue**: The main Vite build bundles all pages (marketing, docs, dashboard, admin, charts) into a single 1.7 MB javascript file.
- **Evidence**: Build output shows `dist/assets/index-DB6d7Vze.js` is 1,717.19 kB and prints a large bundle size warning.
- **File/route**: [App.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/App.jsx).
- **User impact**: High initial load time for public marketing site visitors, who have to load the entire dashboard client-state before viewing landing pages.
- **Recommended fix**: Implement React lazy-loading (`React.lazy` and `Suspense`) for the heavier routes (dashboard, report builder, campaigns, admin, developer docs).

### 2. AI Provider Config Fail-Safe
- **Issue**: AI Chat throws unhandled errors if `AI_PROVIDER` is set to `anthropic` due to a TODO placeholder.
- **Evidence**: `api/lib/ai-client.js:20` has `// TODO: confirm anthropic-compatible endpoint before enabling` and leaves the `anthropic` configuration empty.
- **File/route**: [ai-client.js](file:///Users/ubaid/Desktop/trackiq/api/lib/ai-client.js).
- **User impact**: Developers or admins configuring the app to use Anthropic will crash the server on chat routing.
- **Recommended fix**: Implement the Anthropic SDK client properly using `@anthropic-ai/sdk` (already in `package.json`).

## P3 Later

### 1. Advanced Webhook Test Tool & Mock Playground
- **Issue**: Webhook testing uses static mock payloads.
- **Evidence**: `api/lib/webhook.js:29` uses `const mockPayload = { ... }`.
- **File/route**: [webhook.js](file:///Users/ubaid/Desktop/trackiq/api/lib/webhook.js).
- **Recommended fix**: Build a full webhook tester dashboard tool where developers can select specific event types, edit payloads, and view webhook delivery history/logs.

---

## Public Site Audit

### Routes checked
All public routes mapped in [App.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/App.jsx) were audited:
- `/` (Landing)
- `/product` (Product Overview)
- `/attribution` (Attribution Overview)
- `/ai-referral-tracking` (AI Referrals)
- `/pricing` (Pricing Cards)
- `/compare/ga4` (Comparison)
- `/privacy` & `/terms` (Legal)
- `/use-cases/saas`, `/use-cases/ecommerce`, `/use-cases/lead-generation`, `/use-cases/agencies`

### Issues found
No blank pages or broken routes detected. Core marketing pages render cleanly. Redirects for legacy routes (`/compare-ga4` -> `/compare/ga4`, `/saas-attribution` -> `/use-cases/saas`, etc.) are actively configured in [App.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/App.jsx).

---

## Docs Audit

### Readability & Structure
Docs are split cleanly into two centers: **User Docs** (under `/docs`) and **Developer Docs** (under `/developers`).
- No leaks of authenticated state or internal APIs (e.g. `useAuth`, `supabase`, `axios`) exist in docs files.
- The standard ingestion domain `api.srctk.com` and app domain `app.sourcetrack.ai` are used consistently.

### Stale Endpoint Names
- All references to the old `/api/collect` in frontend files have been cleaned up and replaced with `/api/track`.
- Backend endpoints in `api/index.js` still support `/api/collect` as a backwards-compatible alias to the `track` route handler, preventing older script installations from breaking.

---

## Onboarding Audit

### Install Flow
The 6-step onboarding flow in [Onboarding.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/Onboarding.jsx) is extremely developer/marketer friendly:
1. Connect Domain
2. Select Business Type (eCommerce, SaaS, Lead Gen)
3. Select Install Method (Standard script vs Google Tag Manager)
4. Copy/Install unique tracking script
5. Customize conversions
6. Run Verification polling

### Verification Polling
- Polling is driven by `/api/install/status`, which queries the `sites.last_seen_at` and `onboarding_state` columns instead of making slow, expensive DB queries.
- If verification fails, a "Continue to Dashboard" button appears, allowing users to fail open and proceed to the dashboard rather than getting stuck.

---

## Integrations Audit

### Stripe Webhook Ingestion
- Configured in [stripe-webhook.js](file:///Users/ubaid/Desktop/trackiq/api/routes/stripe-webhook.js).
- Properly requests raw body, TimingSafe HMAC checks against decrypted signing secrets.
- Filters out non-checkout events cleanly, uses idempotency key deduping on `provider_event_id`, `order_id`, and `payment_id`.
- Stitches identity using `client_reference_id` or metadata traits (`anonymous_id`, `visitor_id`, etc.) and strips PII.

### Shopify Webhook Ingestion
- Configured in [shopify-webhook.js](file:///Users/ubaid/Desktop/trackiq/api/routes/shopify-webhook.js).
- Properly timing-safe HMAC checks, order deduping.
- Stitches identity via Shopify `note_attributes` or `attributes` for `_st_aid`/`st_aid`.

### Google Search Console (GSC)
- Configured in [google-search-console.js](file:///Users/ubaid/Desktop/trackiq/api/routes/google-search-console.js).
- Uses Google OAuth callback routes, decrypts credentials, fetches verified properties, and executes manual sync using concurrency sync locks.

### CSV Campaign Spend
- Configured in [campaign-costs.js](file:///Users/ubaid/Desktop/trackiq/api/routes/campaign-costs.js) and [ad-cost-imports.js](file:///Users/ubaid/Desktop/trackiq/api/lib/ad-cost-imports.js).
- Validates YYYY-MM-DD dates, finite spend/clicks/impressions.
- Groups and aggregates uploaded rows. Derives `site_id` from auth context to prevent cross-site spend injection.

---

## Attribution Accuracy Audit

- **Classification**: Configured in [channel-classifier.js](file:///Users/ubaid/Desktop/trackiq/api/lib/channel-classifier.js), classifying traffic into AI Search, Paid/Organic Search, Paid/Organic Social, Email/SMS, display, affiliate, referral, and direct.
- **Sessionization**: Derived dynamically on read in [sessionization.js](file:///Users/ubaid/Desktop/trackiq/api/lib/sessionization.js) (30 minutes inactivity timeout).
- **Multi-Touch Models**: Live JS aggregation pipelines (`getLinearAttribution`, `getUShapedAttribution`, `getWShapedAttribution`, `getTimeDecayAttribution` in `attribution-engine.js`) run live query aggregation on pageviews and conversions, bypassing HogQL limits.

---

## Dashboard and Reports Audit

- The main dashboard, journeys, report builder, campaigns, and billing pages are visually clean.
- The Event Debugger ([EventDebugger.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/EventDebugger.jsx)) is fully featured: displays live events, suggestions based on health status, edge cases, data quality warnings, and blocked duplicate count details.

---

## Developer Experience Audit

- Ingestion API specifications (CURL examples, error tables, security notes) are highly accurate.
- Missing: Key generation UI to generate private bearer tokens for the `/api/server/event` route.

---

## Performance Audit

- **Build Size**: Frontend bundle size is 1,717.19 kB for JS.
- **Concern**: All pages and documentation are statically bundled. Visiting the marketing page requires downloading all charts and dependencies.
- **Mitigation**: Implement React route-level lazy loading (dynamic `import()`).

---

## Validation Results

### Git Status
```bash
git status --short
(clean)
```

### Static QA Launch Check
```bash
npm run qa:static
✅ All backend files syntax passed.
✅ Frontend build succeeded.
✅ No whitespace violations.
✅ Forbidden copy/API grep checks passed.
✅ Route mount checks passed.
✅ Security & plan scoping checks passed.
PASS — static launch QA passed
```

### Frontend Production Build
```bash
cd dashboard && npm run build
vite v5.4.21 building for production...
✓ 2075 modules transformed.
dist/index.html                     2.72 kB │ gzip:   1.00 kB
dist/assets/index-Brk3oxuM.css    101.65 kB │ gzip:  16.14 kB
dist/assets/index-DB6d7Vze.js   1,717.19 kB │ gzip: 449.21 kB
(!) Some chunks are larger than 500 kB after minification.
```

---

## Recommended Implementation Plan

### Session 129: API Key Management UI
- Create database-interacting endpoints (`GET /api/settings/keys`, `POST /api/settings/keys`, `DELETE /api/settings/keys/:id`) to list, generate, and revoke server API keys.
- Build the "API Keys" section UI in `Settings.jsx` to allow users to generate, name, copy (show once), and revoke keys.

### Session 130: UX Hardening & Error Handling
- Enhance error notifications in Google Search Console and CSV spend import endpoints.
- Return explicit validation warnings to the frontend for better troubleshooting.

### Session 131: Bundle Size Optimization & Code Splitting
- Split App routing in `App.jsx` using `React.lazy()` and `Suspense` for heavy dashboard/admin/reports views, reducing the initial bundle size for public visitors.

### Session 132: Ingestion Verification & Edge Cases
- Verify offline conversions and ad sync jobs under high load and test timezone discrepancies.

### Session 133: Final Verification & Sign-off
- Perform manual QA on local staging, complete checklist validation, and release self-serve paid beta.

---

## Final Recommendation

### Should we enter self-serve paid beta now?
**No, but we are extremely close (90% ready).**

### What exact issues block it?
1. **Missing API Key UI**: Developers cannot configure server-side events or offline sync flows without custom database administration support.
2. **Monolithic Bundle (1.7MB)**: Marketing landing pages load too slowly due to bundling the entire dashboard codebase, charts, and documentation. Code-splitting must be implemented first.
