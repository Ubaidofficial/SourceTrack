# Session Log

Running log of every session from Session 75 onward.  
For detailed session history before Session 75, see `PROGRESS.md`.

| Session | Date | Branch | Summary | QA Status | Merged |
|---|---|---|---|---|---|
| 75 | — | — | Saved reports backend persistence + fetchApi JSON body fix | Pending | — |
| 76 | — | — | Stabilize saved report API requests | Pending | — |
| 77 | — | `session-77-channel-taxonomy` | Channel taxonomy v1, AI→AI Search rename, Revenue/Conversions by Channel presets, session channel grouping fix | Pending | No |
| 78 | 2026-05-13 | `session-78-utm-param-verification` | UTM/ref/source/via end-to-end code verification and surgical fixes. Conversion parity fix (ref/source/via). Event detail cards. Snippet copy update. | Pending | No |
| 79 | 2026-05-13 | `session-79-report-builder-filter-ux` | Channel filter wiring, quick channel buttons, source quick-select pills, helper copy, export CSV filter_channel | Pending | No |
| 80 | 2026-05-13 | `session-80-saved-report-management-ux` | Saved report metadata cards, New report reset, Save/Update distinction, DELETE site-scoping | Pending | No |
| 81 | 2026-05-13 | `session-81-figma-design-context` | Docs audit (20 files classified), DOCS_INDEX.md, PROJECT_CONTEXT_COMPACT.md created, FIGMA_DESIGN_SYSTEM_UPDATED→FIGMA_DESIGN_SYSTEM, DASHBOARD_FEATURE_GAP_UPDATED→DASHBOARD_FEATURE_GAP renamed | N/A | No |
| 82.1 | 2026-05-13 | `session-80-saved-report-management-ux` (bootstrap) | Project tracking files bootstrap: AI_SESSION_PLAN, SESSION_STATE, SESSION_LOG, IMPLEMENTATION_GAP_LIST, BUG_REVIEW_LOG, AGENTS, COMMANDCODE_RUNBOOK. DOCS_INDEX and SESSION_HANDOFF updated. | N/A | No |
| 84.2 | 2026-05-13 | `session-84-dashboard-shell` | **Complete — table replacement.** Replaced 5 raw tables in Dashboard.jsx with DashboardTable primitive: Recent Leads, AI Sources Performance, Revenue Source Attribution, Landing Page Performance, Campaign Performance. All values, formatting, status badges, empty messages preserved. `npm run build` passes. `git diff --check` clean. | N/A | No |
| 84.3 | 2026-05-13 | `session-84-dashboard-shell` | **Complete — wrapper + empty states.** Added `.st-container` to Dashboard root wrapper. Replaced Revenue Trend "No data yet" inline empty state and AI Sources custom empty state with `<EmptyState>` component. `npm run build` passes. `git diff --check` clean. | N/A | No |
| 84.4 | 2026-05-13 | `session-84-dashboard-shell` | **Complete — token color alignment.** 5 safe st-token replacements: sidebar nav active (`bg-st-lime/10 text-st-black`), admin link active (`bg-st-lime/20 text-st-black`), Live badge (`bg-st-lime/20 text-st-black`), 2 Create Report CTAs (`bg-st-black hover:bg-st-black/90`). Chart color, text hierarchy, data-viz fills skipped. `npm run build` passes. | N/A | No |
| 84.5 | 2026-05-13 | `session-84-dashboard-shell` | **Complete — FilterBar integration.** Replaced time range pill group + export button with `<FilterBar>`. TIME_RANGES, timeRange state, setTimeRange, handleExport unchanged. `npm run build` passes. | N/A | No |
| 84.6 | 2026-05-13 | `session-84-dashboard-shell` | **Complete — stabilization and handoff.** Final static review: all primitives confirmed wired (DashboardTable, st-container, EmptyState, st tokens, FilterBar), no data/logic changes, tracking docs reconciled. `npm run build` passes. Session 84 complete, ready for Session 85. | N/A | No |
| 85.1 | 2026-05-13 | `session-85-onboarding-figma` | **Complete — audit.** Audited Onboarding.jsx, OnboardingCard.jsx, OnboardingProgress.jsx, and backend API against ONBOARDING_FLOW_SPEC.md. Classified 20+ gaps: all business logic intact, color tokens are the only code-level gap. 5-vs-6 step stepper decision deferred. | N/A | No |
| 85.2 | 2026-05-13 | `session-85-onboarding-figma` | **Complete — token color migration.** 29 hex-color replacements across Onboarding.jsx, OnboardingCard.jsx, OnboardingProgress.jsx: `#D7F550` → st-lime, `#F9FDEA` → st-lime/10, `#1F2323` → st-black, `#6F7070` → st-gray, `text-indigo-600` → text-st-black. Removed inline `fontWeight` styles. `npm run build` passes. | N/A | No |
| 85.3 | 2026-05-13 | `session-85-onboarding-figma` | **Complete — stepper audit, no code changed.** Audited 6-step code vs 5-step Figma spec. Found zero safe cosmetic changes: any stepper alignment requires backend MAX_STEP change + state machine refactor. 5-vs-6 is a product/design decision, not a bug. Recommendation: ship 6-step as-is. | N/A | No |
| 85.4 | 2026-05-13 | `session-85-onboarding-figma` | **Complete — stabilization and handoff.** Final static review: all tokens migrated (29 st-lime/black/gray), no hardcoded hex remain, inline font styles removed, step count/flow logic/API calls preserved. `npm run build` passes. Session 85 complete, ready for Session 86. | N/A | No |

## Session numbering note

Session 82.1 is a bootstrap sub-session for creating project tracking infrastructure.  
Session 82 proper will be the manual QA closeout session.
| 94 | 2026-05-15 | `main` | Remove _st cross-domain redundancy, data-quality-check.js created, GTM default→standard, Mark as Qualified wired to API, journey modal navigate()→modal overlay, event logger NodeCache caching | Partial QA | No |
| 95 | 2026-05-16 | `main` | CRITICAL BUG FIX: journey touchpoints now include all channels (organic/direct/referral/AI), channel classifier + channel/channel_30d columns in batch job, manual campaign spend→ROAS+CPL in campaigns route | Partial QA | No |
| 96 | 2026-05-16 | `main` | Conversion status progression (lead/mql/sql/customer/rejected), lead_qualifications table, SQL% in dashboard API, business_type column + onboarding saves it + auth middleware + dashboard returns it | Partial QA | No |
| 96.3 | 2026-05-16 | `main` | Outbound link auto-tracking in tracker.js, bounce rate HogQL query + dashboard response | Partial QA | — |
| 96.4 | 2026-05-16 | `main` | Public dashboard share link — /api/public/:token, public_share_token + public_share_enabled on sites, returns top sources/campaigns/channels | QA passed | — |
| 97 | T3.4 | Business-type KPI frontend switching | getKpiConfig + enrichKpis helpers, kpiConfig.map KPI strip in Dashboard.jsx | ✅ |
| 98 | 2026-05-23 | `main` | **Beta QA: Auth → Onboarding → Tracker → Dashboard Flow** (see below) | QA in progress | No |
| 101.1 | 2026-06-03 | `main` | Fix frontend API bypasses (Billing, Settings, DataQuality pages) via fetchApi helper | ✅ | No |
| 101.2 | 2026-06-03 | `main` | Stabilize onboarding back-step saving and resume snippet generation | ✅ | No |
| 101.3 | 2026-06-03 | `main` | Clean tracker build pipeline and replace stale api.sourcetrack.ai domain references | ✅ | No |
| 101.4A | 2026-06-03 | `main` | Fix tracker conversion payload parity (ref_param, source_param, via_param) | ✅ | No |
| 101.4B | 2026-06-03 | `main` | Fix legacy attribution date-range touchpoint truncation | ✅ | No |
| 101.5 | 2026-06-03 | `main` | Clean up sitemap, robots, auth indexability, and footer use-case links | ✅ | No |
| 101.6 | 2026-06-03 | `main` | Polished dashboard optional data endpoints (GET /api/dashboard/cac, GET /api/campaign-costs) and Dashboard.jsx page to fail gracefully | ✅ | No |
| 102.1 | 2026-06-03 | `main` | Replaced PostHog onboarding verification with direct SourceTrack ingestion check | ✅ | No |
| 102.2 | 2026-06-03 | `main` | Implemented backend-side query parameter PII redaction for URL/referrer fields | ✅ | No |
| 102.3 | 2026-06-04 | `main` | Implemented SourceTrack Doctor (Phase 1) dynamic health checks endpoint and dashboard card | ✅ | No |
| 102.4 | 2026-06-04 | `main` | Implemented safe Conversion Deduplication tracking and UI visibility on the Event Debugger page | ✅ | No |
| 102.5 | 2026-06-04 | `main` | Hardened CSV exports and public dashboard token route scoping and authentication | ✅ | No |
| 102.6 | 2026-06-04 | `main` | Implemented Layout-Level Client/Site Switcher Dropdown and explicit activeSite context | ✅ | No |
| 102.7 | 2026-06-04 | `main` | Implemented Server-Side Plan Feature Gate Middleware for advanced attribution, AI models, chat, reports, and spend writes | ✅ | No |
| 102.8 | 2026-06-04 | `main` | Public Docs & Ingest Domain Cleanup — Fixed broken trackiq branding, removed unimplemented feature docs, removed PostHog leaks, softened compliance claims, documented CAPI follow-up | ✅ | No |
| 102.9 | 2026-06-04 | `main` | Solution Pages CAPI Claims Cleanup — Audited and softened unverified CAPI, Shopify app, CRM, and ad platform sync claims from marketing pages | ✅ | No |
| 103.1 | 2026-06-04 | `main` | QA and Validation Before Public Launch — Ran syntax, build, grep, and mount validations (static QA passed, ready for manual browser QA), and softened minor remaining CAPI references | ✅ | No |
| 103.2 | 2026-06-04 | `main` | Martech Engineer Static QA Review — Audited codebase setup, ingestion parameters, identity patterns, gates, switcher logic, and resolved the final PostHog subtitle in Admin.jsx | ✅ | No |
| 104.0 | 2026-06-04 | `main` | Expose browser/OS properties in Event Debugger details sidebar and verify country/device type | ✅ | No |
| 104.1 | 2026-06-04 | `main` | Runtime Smoke + Manual Browser QA validation checks passed | ✅ | No |
| 104.2 | 2026-06-04 | `main` | Hide broken multi-touch models (Linear, U-Shaped, Time Decay, W-Shaped) from UI and API until HogQL is fixed | ✅ | No |
| 105   | 2026-06-04 | `main` | Fully fix multi-touch attribution models (Linear, Time Decay, U-Shaped, W-Shaped) via safe JS-based query engine | ✅ | No |

---

## Session 105 — Fully Fix Advanced Attribution Models

**Date:** 2026-06-04
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. JavaScript-Based Live Multi-Touch Attribution Engine
- Built a safe, HogQL-compliant live pipeline in JavaScript (`getMultiTouchAttributionLive` in `api/lib/attribution-engine.js`).
- Rather than executing complex, correlated SELECT subqueries on ClickHouse which crash due to `Unable to resolve field: ce`, the engine fetches conversions and pageviews separately, then maps and distributes shares in memory.
- Integrated the safe pipeline for `linear`, `time_decay`, `u_shaped`, and `w_shaped` models inside `getFlexibleReport` and `getAttribution` live query handlers.

### 2. Explain Endpoint Interception
- Intercepted `/api/attribution/explain` requests for advanced models (`linear`, `time_decay`, `u_shaped`, `w_shaped`) to return a clean explanation payload indicating that step-by-step journeys are single-touch only and advanced models are aggregate.
- Updated the frontend `ConversionExplanationModal` component to map the new models and display description cards explaining how they work.

### 3. Report Builder UI Adjustments
- Hid the "Show Explanation" toolbar button and the table's "Why" explanation column in `ReportBuilder.jsx` whenever a multi-touch model is selected, preventing misleading UI indications.

### 4. Deterministic and Integration Testing
- Implemented `scripts/qa-attribution-harness.mjs` to deterministic-test mock user conversion journeys offline.
- Created `scripts/qa-attribution-integration.mjs` to run end-to-end API integration tests. It creates a temp auth user, temporarily extends the site's billing trial, ingests pageviews with unique UTM parameters followed by a conversion, queries the `/api/attribution` API endpoints, verifies correct revenue reconciliation and source allocation, and cleans up all database updates and test user accounts.
- Wired both tests to run sequentially under `npm run qa:attribution`.

### 5. Documentation and Safety Checks
- Documented the explanation modal limitation in `KNOWN_ISSUES.md`.
- Verified all database trial changes were reverted and all test users were cleaned up.

---

## Session 104.2 — Hide advanced attribution models until Linear HogQL is fixed

**Date:** 2026-06-04
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. Hide Models in Frontend Selector Dropdowns
- Filtered out `linear`, `time_decay`, `u_shaped`, and `w_shaped` from the selection dropdown in `ReportBuilder.jsx`.
- Filtered out blocked models from rendering in `modelRevenues` on the main `Dashboard.jsx` attribution comparison cards.

### 2. API Gating & Safety Checks
- Added a block check in `api/routes/attribution.js` for both `/attribution` and `/attribution/explain` routes. If these routes receive a blocked model, they return a 400 Bad Request response with a database compatibility explanation, preventing ClickHouse query compilation errors.
- Left the underlying engine functions intact to avoid permanent code removal, documenting the gating with explanatory internal code comments in `api/lib/attribution-engine.js`.

### 3. Documentation Updates
- Updated `KNOWN_ISSUES.md` item 8 to state that the HogQL linear attribution error is a known issue but is no longer a release blocker for paid beta, as these models are now successfully hidden and gated.

---

## Session 104.1 — Runtime Smoke + Manual Browser QA

**Date:** 2026-06-04
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. Programmatic QA Testing
- Executed `npm run qa:smoke` and verified passing results for basic track, online conversions, deduplication skipping, and offline conversions.
- Executed `npm run qa:edge` and verified passing results for missing keys, PII redaction URL filters, malformed parameters, public dashboard share scoping, and billing plan gates.

### 2. Manual Browser QA Checklist
- Walked through the manual browser QA checklist, confirming onboarding, script copy, outbound link tracking, Site Switcher, and export metrics passed tested checklist items.

---

## Session 104.0 — Geo / Device / Browser Dimensions

**Date:** 2026-06-04
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. Backend Ingestion Properties Exposure
- Added `properties.browser_name`, `properties.browser_version`, `properties.os_name`, and `properties.os_version` to the SELECT query in `api/routes/events.js` `/latest` endpoint.
- Mapped these database properties to top-level fields: `browser_name`, `browser_version`, `os_name`, and `os_version` inside the `events` payload array returned to frontend clients.

### 2. Event Debugger Detail Sidebar Clean Rows
- Added clean display rows for "Browser" and "OS" in the sidebar details panel in `dashboard/src/pages/EventDebugger.jsx` using `selectedEvent.browser_name` and `selectedEvent.os_name`.

### 3. Verify Country and Device Type Display
- Confirmed that `Country` and `Device Type` are already cleanly displayed as detail rows in the sidebar (using `selectedEvent.country` and `selectedEvent.device_type` respectively) and table, leaving them as Done.

---

## Session 101.6 — Dashboard Optional Data Fallback Polish

**Date:** 2026-06-03
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. Hardened API Failure Responses
- **Problem:** When the Supabase database is unreachable or table queries error, `/api/dashboard/cac` returned a hard 500 error, and `/api/campaign-costs` returned a hard 500. This could break rendering on the dashboard.
- **Fix:** Swapped try-catch blocks to return status 200 with standard fallback JSON structures. Specifically, `/cac` returns `{ success: true, data: { cac_unavailable: true, results: [] } }` and `/campaign-costs` returns `{ success: true, data: { campaign_costs_unavailable: true, results: [] } }`.

### 2. Frontend Graceful Fallback Handling
- **Fix:** Adjusted `Dashboard.jsx` to parse the object-shape error fallback using `Array.isArray(cacData) ? cacData : (cacData?.results || [])`.
- Added `cacUnavailable` conditional UI rendering for:
  - Avg CAC KPI Tile: Shows "Unavailable" badge.
  - Revenue Source Attribution Table: Shows "Unavailable" for CAC and Payback columns.
  - Insights Dashboard Banner: Displays a warning alert when analytics or spend data is unavailable.

---

## Session 101.5 — SEO, Sitemap, Robots, and Use-Cases Footer Cleanup

**Date:** 2026-06-03
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. Sitemap and Robots Updates
- **Problem:** `sitemap.xml` was missing key public marketing pages (such as Product, Pricing, GA4 comparison, Attribution). Additionally, the public-facing gate `/report-builder` (which serves a marketing view for logged-out visitors) was blocked in `robots.txt`.
- **Fix:** Rewrote `sitemap.xml` to include all 12 public marketing pages using canonical URLs and set priority values. Removed the `Disallow: /report-builder` rule from `robots.txt` so the marketing gate page is crawlable.

### 2. Auth Indexability and Footer Links
- **Problem:** Footer linked to old `/use-cases/*` redirected routes instead of canonical attribution page paths.
- **Fix:** Swapped footer link paths inside `MarketingFooter.jsx` to `/saas-attribution`, `/ecommerce-attribution`, `/lead-gen-attribution`, and `/agency-attribution` respectively. Verified that auth pages (`/login`, `/signup`, and `/auth/callback`) properly contain `noindex, nofollow` meta tags, and added them to the `robots.txt` disallows list for complete protection.

---

## Session 101.4B — Legacy Attribution Date-Range Touchpoint Truncation Fix

**Date:** 2026-06-03
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. Date-Range Truncation Bug Fixed
- **Problem:** Legacy attribution functions (`lastTouchAttribution`, `firstTouchNonDirectAttribution`, and `lastTouchNonDirectAttribution`) in `api/lib/attribution-engine.js` restricted pageview touchpoint queries to the report date range (using `timestamp >= fromDate`). This incorrectly attributed conversions to `direct / none` if the user's initial or non-direct pageview touchpoint occurred before the start of the report date range.
- **Fix:** Refactored the subqueries to look up pageviews without a lower-bound date restriction (removing `timestamp >= fromDate`). To prevent matching pageviews that occurred after the conversion, the queries were restructured to left-join pageview events on `pv.timestamp <= e_inner.timestamp` and group by the unique conversion event UUID (`conversion_uuid`).

---

## Session 101.4A — Tracker Conversion Payload Parity

**Date:** 2026-06-03
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. Tracker Conversion Event Parity
- **Problem:** Pageview events sent parameters `ref_param`, `source_param`, and `via_param` to `/api/track`, but conversion events did not include them when calling `/api/conversion`, even though the backend already supports and normalizes them.
- **Fix:** Appended `ref_param: p.ref || null`, `source_param: p.source || null`, and `via_param: p.via || null` to the Object.assign call in the `sourcetrack.conversion()` method in `tracker/tracker.js` and rebuilt the minified `tracker/tracker.min.js`.

---

## Session 101.3 — Tracker Build Pipeline and Documentation Domains

**Date:** 2026-06-03
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. Tracker Build Script Cleaned
- **Problem:** `npm run build:tracker` referenced the missing `tracker/loader.js` script, causing it to fail.
- **Fix:** Removed the `esbuild tracker/loader.js` compilation step from the root `package.json` and rebuilt the minified `tracker/tracker.min.js`.

### 2. Stale Domain References Replaced
- **Problem:** Code snippets and examples in solution pages and documentation still referenced the stale domain `https://api.sourcetrack.ai`.
- **Fix:** Swapped `https://api.sourcetrack.ai` with the correct ingestion and tracker domain `https://api.srctk.com` across `SolutionSaaS.jsx`, `SolutionEcommerce.jsx`, `SolutionAgency.jsx`, `SolutionLeadGen.jsx`, `Docs.jsx`, and a comment in `api/routes/proxy.js`.

---

## Session 101.2 — Onboarding Back-Step Saving & Resume Snippet Stabilization

**Date:** 2026-06-03
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. Onboarding Back-Step saving fixed
- **Problem:** When users navigate back to modify previous steps (e.g. from step 6 to step 3), the backend API `/api/onboarding/update` threw a 400 Bad Request error on attempts to save step 4 forward again. Additionally, any back-step update deleted user selections for business type and install methods.
- **Fix:** Relaxed backend updates to accept any `targetStep <= currentStep`. Removed the deletion logic of selections to prevent data loss.

### 2. Stepper progress preserved
- **Problem:** If database `current_step` is set back to 4, completed steps (5 and 6) became unclickable and dimmed in the UI.
- **Fix:** Tracked `current_step` in database using `Math.max(targetStep, currentStep)`, preserving the furthest reached progress so completed steps remain clickable.

### 3. On-mount snippet resume fixed
- **Problem:** Resuming onboarding on step 4 or later left `snippet` empty, showing a frozen "Loading script..." state unless the user navigated back to step 3 to reselect the method.
- **Fix:** Configured `loadOnboardingStatus()` to fetch snippet on mount when step is >= 4.

---

## Session 101.1 — Fix frontend API bypasses

**Date:** 2026-06-03
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. Stripe Billing / Checkout Bypasses
- **Problem:** `Billing.jsx` made relative fetches directly to `/api/billing/create-checkout` and `/api/billing/portal`. In split-domain production, these requests hit the SPA client host and returned `index.html` (HTML).
- **Fix:** Swapped raw fetches for the centralized `createCheckout` and `getBillingPortal` API helpers.
- **Helpers update:** Fixed `createCheckout` and `getBillingPortal` in `lib/api.js` to execute POST requests and pass correct plan and return URL body parameters matching the Express API expectations.

### 2. GDPR / Settings Bypasses
- **Problem:** GDPR actions in `Settings.jsx` bypassed `fetchApi` using raw relative fetch requests to `/api/gdpr/retention`, `/api/gdpr/visitor`, and `/api/gdpr/account`.
- **Fix:** Rewrote settings functions to use `fetchApi` (auth header injection is handled automatically).
- **fetchApi refinement:** Enhanced `fetchApi` return statement to support flat responses without nested `data` envelopes (such as those returned by the GDPR routes).

### 3. Data Quality Audit Trigger Bypass
- **Problem:** Manual quality checks triggered via relative `/api/jobs/data-quality-check` POST requests failed in production.
- **Fix:** Re-routed the trigger request through `fetchApi`.

---

## Session 98 — Beta QA: Auth → Onboarding → Tracker → Dashboard Flow

**Date:** 2026-05-23
**Branch:** `main`
**Build:** ✅ both `node --check` (all API files) and `npm run build` (dashboard) pass

### 1. OAuth callback
- **Problem:** Google OAuth stuck on `/auth/callback#...` — spinner rendered forever.
- **Fix:** AuthCallback now redirects authenticated users to `/dashboard`; unauthenticated users to `/login`.
- **File:** `dashboard/src/pages/AuthCallback.jsx`

### 2. Onboarding UX
- Removed unused "Watch Video" button from onboarding.
- Added "Log out" button on onboarding header.
- Made failed script verification non-blocking for beta — "Continue to Dashboard" available after verification fails.
- Added "Continue to Dashboard" path that persists latest onboarding selections before completing.
- **Files:** `dashboard/src/pages/Onboarding.jsx`, `api/routes/onboarding.js`

### 3. API/tracker domain
- Dashboard now uses env-driven API/tracker host:
  - `VITE_API_URL=https://api.srctk.com`
  - `VITE_TRACKER_BASE_URL=https://api.srctk.com`
  - `VITE_FRONTEND_URL=https://app.sourcetrack.ai`
- No more hardcoded `localhost` references in production.

### 4. Tracker QA
- Validated local QA page with `https://api.srctk.com/tracker/tracker.min.js` — loads and fires.
- Confirmed `/api/track` (POST) works — pageview events ingested.
- Confirmed `/api/conversion` works via beacon — conversion events ingested.
- Confirmed UTM/click-id capture: `utm_source=google`, `utm_medium=cpc`, `utm_campaign=qa_test`, `ref=partner`, `source=affiliate`, `via=newsletter`, `gclid=test123`.
- Confirmed first-touch attribution fields captured correctly.

### 5. Beta onboarding completion
- `/api/onboarding/complete` no longer requires successful PostHog script verification.
- Still requires: site exists, `business_type` set, `install_method` set, verification step reached.
- "Continue to Dashboard" now persists latest onboarding state via `/api/onboarding/update` before calling `/api/onboarding/complete`.
- Verification status stored as `verification_status: "pending"` in `onboarding_state` — can be verified later from Integrations.
- **Files:** `api/routes/onboarding.js`, `dashboard/src/pages/Onboarding.jsx`

### 6. CORS fix
- **Problem:** Browser CORS from `https://www.sourcetrack.ai` to `https://api.srctk.com` failed — OPTIONS preflight hit auth middleware and returned 401.
- **Fix:** Global OPTIONS middleware runs before any auth routes. Returns 204 with correct `Access-Control-Allow-Origin`.
- Hardcoded allowed origins: `https://www.sourcetrack.ai`, `https://sourcetrack.ai`, `https://app.sourcetrack.ai`, `http://localhost:5173`, `http://localhost:8080`.
- Added OPTIONS guard in `requireUserAuth` and `validateSiteKey` as defense-in-depth.
- Verified: `curl -X OPTIONS` returns 204 with correct CORS headers.
- **Files:** `api/index.js`, `api/middleware/user-auth.js`, `api/middleware/auth.js`

### 7. Install verification hardening
- `/api/install/status` no longer returns 500 when PostHog verification fails.
- PostHog failure now returns safe response: `{ installed: false, verified: false, status: "pending", reason: "verification_unavailable" }`.
- `validateSiteKey` catch block now returns 401 instead of 500 on Supabase lookup failures.
- Error logging uses prefixed `[install/status]` and `[validateSiteKey]` for server-side debugging.
- **Files:** `api/routes/install.js`, `api/middleware/auth.js`

### 8. Deployment note
- Railway Dashboard deploy may fail with `##NOT-AUTHORIZED## repository not authorized`.
- Fix: reconnect GitHub repo access for SourceTrack-Dashboard.

### Remaining QA checklist (to verify after latest deploy)
- Continue to Dashboard after failed verification → should complete onboarding and navigate to `/dashboard`.
- `/dashboard` loads correctly.
- Refresh `/dashboard` does not redirect to `/onboarding`.
- `/api/onboarding/me` returns `onboarding_completed: true`.

### Verification commands

```bash
# CORS preflight
curl -i -X OPTIONS "https://api.srctk.com/api/onboarding/complete" \
  -H "Origin: https://www.sourcetrack.ai" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"

# Health check
curl -i https://api.srctk.com/health

# Tracker asset
curl -i https://api.srctk.com/tracker/tracker.min.js
```
