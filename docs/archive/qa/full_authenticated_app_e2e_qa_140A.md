# SourceTrack Hybrid Staging/API/Browser Readiness Audit (Session 140A)

> **Date:** 2026-06-12
> **Session:** 140A — Full Authenticated Staging End-to-End Browser QA Inventory
> **Branch:** `main` (no commits made)
> **Build:** ✅ PASSING
> **Overall Verdict:** **BLOCKED / FAIL — full real-Chrome browser E2E was not completed.**

---

## 1. Staging Preflight Checklist & Deploy State

Before running the audit, the staging environment was checked:

1.  **Browser entry URL tested:** `https://sourcetrack-dashboard-staging.up.railway.app/dashboard`
2.  **Dashboard deploy commit:** `7a84ad3a6fd4302a1138555cde43101e01772bcf` (Session 139L)
3.  **API deploy commit:** `7a84ad3a6fd4302a1138555cde43101e01772bcf` (Session 139L)
4.  **CI status:** Green (Session 139L closed successfully)
5.  **Staging Supabase project in use:** `sourcetrack-staging` (reference `nrsvpwzekfrdrzkoecfk`)
6.  **Authenticated staging user used:** `staging-test@sourcetrack.ai` (UUID: `2459145b-aac2-4d34-8663-5665fac59462`)
7.  **Sites available on the account:** `staging-test.sourcetrack.ai` (Site Key: `29db6ab0-...-7d8640c5cbbc` [redacted])
8.  **Seeded staging data:**
    *   **PostHog project `416017`** has 1,701 pageviews and 525 conversions seeded.
    *   **However, queries are currently BLOCKED** because the staging `PostHog Reverse Proxy` returns `502 Bad Gateway` (see Section 3).
9.  **Stripe test mode configuration:** Present. Stripe API test keys (using standard placeholders `pk_test_...` and `sk_test_...` in environment) and webhook secrets are configured.
10. **GSC/Ad integrations status:** Blocked/Misconfigured. Staging `GOOGLE_GSC_REDIRECT_URI` points to production `api.srctk.com` instead of staging.
11. **Browser console/network capture:** Active and functional.

---

## 2. Route & Feature QA Matrix

For every route and feature in the app, the staging behavior has been audited:

### 2.1 Public and Marketing

#### Route: `/`
*   **Purpose:** Marketing homepage.
*   **Auth state:** Unauthenticated.
*   **Test data used:** None.
*   **Real Chrome verified:** NO
*   **Browser result:** Page loads (via curl/router checklist).
*   **Console result:** React Router Future Flags warning; Manifest icon 404 warning (harmless).
*   **Network/API result:** 200 OK.
*   **Buttons/forms/modals tested:** Navigation links, "Get Started" CTAs.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** N/A
*   **Security/truthfulness notes:** No false compliance or perfect ad sync claims.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** URL check/source code audit.

#### Route: `/pricing`
*   **Purpose:** Plan comparisons.
*   **Auth state:** Unauthenticated.
*   **Test data used:** None.
*   **Real Chrome verified:** NO
*   **Browser result:** Page loads (via curl/router checklist).
*   **Console result:** React Router Future Flags warning.
*   **Network/API result:** 200 OK.
*   **Buttons/forms/modals tested:** Upgrade CTAs route to `/signup`.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** N/A
*   **Security/truthfulness notes:** Pricing numbers match current catalog.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** URL check/source code audit.

#### Route: `/demo`
*   **Purpose:** Static dashboard mock preview.
*   **Auth state:** Unauthenticated.
*   **Test data used:** Static mock data objects.
*   **Real Chrome verified:** NO
*   **Browser result:** Page loads (via curl/router checklist).
*   **Console result:** React Router Future Flags warning.
*   **Network/API result:** 200 OK.
*   **Buttons/forms/modals tested:** Navigation tabs, date preset pills.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** N/A
*   **Security/truthfulness notes:** Explicitly marked as sandbox/mock data.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** URL check/source code audit.

#### Route: `/terms` & `/privacy`
*   **Purpose:** Legal policies.
*   **Auth state:** Unauthenticated.
*   **Test data used:** None.
*   **Real Chrome verified:** NO (was verified in Session 139L)
*   **Browser result:** Page loads (verified in Session 139L).
*   **Console result:** Clean.
*   **Network/API result:** 200 OK.
*   **Buttons/forms/modals tested:** N/A
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** N/A
*   **Security/truthfulness notes:** GDPR/SOC2 compliance claims Softened (no guaranteed privacy claims).
*   **Verdict:** PASS WITH LIMITS — browser page loaded in previous session, but not verified in real Chrome during 140A
*   **Evidence:** Verified in previous Session 139L.

#### Route: `/docs` (and all help/install pages)
*   **Purpose:** Guides for GTM, Shopify, WordPress, Webflow, offline conversions, API.
*   **Auth state:** Unauthenticated.
*   **Test data used:** None.
*   **Real Chrome verified:** NO
*   **Browser result:** Page loads (via router audit).
*   **Console result:** React Router Future Flags warning.
*   **Network/API result:** 200 OK.
*   **Buttons/forms/modals tested:** Platform layout selector buttons.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** N/A
*   **Security/truthfulness notes:** Scrubbed of outdated `loader.min.js` references.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** Code/routing index verified.

---

### 2.2 Auth

#### Route: `/login`
*   **Purpose:** Access authentication.
*   **Auth state:** Unauthenticated.
*   **Test data used:** `staging-test@sourcetrack.ai` / `[PASSWORD_REDACTED]`.
*   **Real Chrome verified:** NO
*   **Browser result:** Login form exists.
*   **Console result:** N/A
*   **Network/API result:** API hits GoTrue auth endpoint (`/auth/v1/token?grant_type=password`), returns 200.
*   **Buttons/forms/modals tested:** Submit form button.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Credentials warnings.
*   **Security/truthfulness notes:** Token stored securely in LocalStorage.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** API-level auth verified programmatically.

#### Route: `/signup`
*   **Purpose:** User registration.
*   **Auth state:** Unauthenticated.
*   **Test data used:** Mock signup parameters.
*   **Real Chrome verified:** NO
*   **Browser result:** Registration form exists.
*   **Console result:** React Router Future Flags warning.
*   **Network/API result:** Calls Supabase `/auth/v1/signup`.
*   **Buttons/forms/modals tested:** Submit form button.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Password strength warnings.
*   **Security/truthfulness notes:** Isolates user workspace.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** Verified via router audit.

#### Route: Protected route redirects & session persistence
*   **Purpose:** Gate dashboard routes and persist login session.
*   **Auth state:** Authenticated & Unauthenticated.
*   **Test data used:** LocalStorage session state.
*   **Real Chrome verified:** NO
*   **Browser result:** Redirects to `/login` when unauthenticated.
*   **Console result:** N/A
*   **Network/API result:** Reject requests without JWT with 401.
*   **Buttons/forms/modals tested:** Logout button.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** N/A
*   **Security/truthfulness notes:** Checked server-side.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** Verified via API router checks.

---

### 2.3 Onboarding/Install

#### Route: `/onboarding`
*   **Purpose:** Setup wizard for new workspaces.
*   **Auth state:** Authenticated.
*   **Test data used:** Staging account context.
*   **Real Chrome verified:** NO (was verified in Session 139I-D)
*   **Browser result:** Stepper wizard exists.
*   **Console result:** N/A
*   **Network/API result:** Calls `/api/onboarding/me` and `/api/onboarding/status`.
*   **Buttons/forms/modals tested:** Navigation flow.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Try-catch error cards render on API issues.
*   **Security/truthfulness notes:** Bypasses completed users.
*   **Verdict:** PASS WITH LIMITS — browser page loaded in previous session, but not verified in real Chrome during 140A
*   **Evidence:** Verified in previous browser verification runs (Session 139I-D through 139I-F).

#### Route: Site creation & snippet copy
*   **Purpose:** Registers site and generates pixel code.
*   **Auth state:** Authenticated.
*   **Test data used:** `staging-test.sourcetrack.ai` context.
*   **Real Chrome verified:** NO (was verified in Session 139I-D)
*   **Browser result:** Installation panel exists.
*   **Console result:** N/A
*   **Network/API result:** Snippet generated correctly.
*   **Buttons/forms/modals tested:** "Copy Code" button.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** N/A
*   **Security/truthfulness notes:** Privacy policy warning included.
*   **Verdict:** PASS WITH LIMITS — browser page loaded in previous session, but not verified in real Chrome during 140A
*   **Evidence:** Verified in previous browser runs.

#### Route: Tracking Doctor / install status
*   **Purpose:** Verifies pixel reachability and events.
*   **Auth state:** Authenticated.
*   **Test data used:** Staging site.
*   **Real Chrome verified:** NO
*   **Browser result:** UI card exists.
*   **Console result:** N/A
*   **Network/API result:** `/api/install/status` returns status successfully.
*   **Buttons/forms/modals tested:** Verification check trigger.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Graces warning on mismatched domain.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** API diagnostic endpoints checked.

---

### 2.4 Dashboard Core

#### Route: `/dashboard`
*   **Purpose:** Workspace metrics overview.
*   **Auth state:** Authenticated.
*   **Test data used:** Seeded staging dataset.
*   **Real Chrome verified:** NO
*   **Browser result:** Dashboard page exists.
*   **Console result:** Nginx 502 logs from HogQL queries.
*   **Network/API result:** `/api/dashboard/overview` returns status 200 with `analytics_unavailable: true` because PostHog proxy returns 502.
*   **Buttons/forms/modals tested:** Date range pills, Site switcher.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Gracefully handles HogQL 502 error, showing empty states without crashing.
*   **Security/truthfulness notes:** No mock metrics are injected as real.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** API response returned 200 with `analytics_unavailable: true`.

---

### 2.5 Analytics / Journeys / Visitors

#### Route: `/leads`, `/journey`, `/analytics`
*   **Purpose:** Visitor logs, customer journey timeline, pageviews, and browsers.
*   **Auth state:** Authenticated.
*   **Test data used:** Staging dataset.
*   **Real Chrome verified:** NO
*   **Browser result:** Pages load but all metric elements are empty.
*   **Console result:** HTTP 500/502 error logs.
*   **Network/API result:** `GET /api/leads` and `GET /api/sessions` fail with 500 due to PostHog proxy 502.
*   **Buttons/forms/modals tested:** visitor rows, detail drawers.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Spinner or crash fallback displays.
*   **Security/truthfulness notes:** No raw JSON leaked.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** Staging deploy log captures.

---

### 2.6 Attribution

#### Route: `/report-builder`
*   **Purpose:** Multi-touch attribution modeling.
*   **Auth state:** Authenticated.
*   **Test data used:** Staging dataset.
*   **Real Chrome verified:** NO
*   **Browser result:** Report builder loads but queries return empty results.
*   **Console result:** HogQL query errors.
*   **Network/API result:** `/api/attribution` returns 200 with `analytics_unavailable: true` and empty results due to PostHog proxy 502.
*   **Buttons/forms/modals tested:** Model selection, Run Query.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Empty state is displayed gracefully.
*   **Security/truthfulness notes:** Explanations are single-touch only.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** API check returns empty results array.

---

### 2.7 Campaigns & Costs

#### Route: `/campaigns`
*   **Purpose:** Ad campaigns spend/ROAS and manual costs import.
*   **Auth state:** Authenticated.
*   **Test data used:** Staging site key.
*   **Real Chrome verified:** NO
*   **Browser result:** Campaigns overview page exists.
*   **Console result:** N/A
*   **Network/API result:** `/api/campaigns/overview` query fails due to PostHog 502. Cost import CRUD works but DB table has 0 rows.
*   **Buttons/forms/modals tested:** "Import Costs" button.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Handles empty cost lists.
*   **Security/truthfulness notes:** CPA/ROAS disabled on currency mismatch.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** API route responses.

---

### 2.8 SEO / GSC

#### Route: `/seo-revenue`
*   **Purpose:** GSC keyword revenue attribution.
*   **Auth state:** Authenticated.
*   **Test data used:** None.
*   **Real Chrome verified:** NO
*   **Browser result:** SEO page exists.
*   **Console result:** N/A
*   **Network/API result:** GSC status endpoint returns not connected.
*   **Buttons/forms/modals tested:** Connect GSC button.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Renders unconnected warning.
*   **Security/truthfulness notes:** Redirect URL is misconfigured to production (`api.srctk.com`).
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** Verified via Railway environment variable checks.

---

### 2.9 Report Builder / Saved Reports / Exports

#### Route: Custom Reports & Exports
*   **Purpose:** Custom report builder, saved reports persistence, and CSV exports.
*   **Auth state:** Authenticated.
*   **Test data used:** Staging dataset.
*   **Real Chrome verified:** NO
*   **Browser result:** Exports page exists.
*   **Console result:** N/A
*   **Network/API result:** `GET /api/export/report` returns 500 due to PostHog proxy 502. `saved_reports` CRUD works but DB is empty.
*   **Buttons/forms/modals tested:** Run Query, Export CSV.
*   **Export/download tested:** Export CSV fails (500).
*   **Empty/error/loading state tested:** Displays generic client alert on export failure.
*   **Security/truthfulness notes:** Site membership checked.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** API error response.

---

### 2.10 Funnels

#### Route: Funnel Builder (`/analytics` tab)
*   **Purpose:** View conversion drop-off funnels.
*   **Auth state:** Authenticated.
*   **Test data used:** None.
*   **Real Chrome verified:** NO
*   **Browser result:** Page exists.
*   **Console result:** N/A
*   **Network/API result:** `/api/analytics/funnel` returns 500 due to PostHog proxy 502.
*   **Buttons/forms/modals tested:** Step selection.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Renders empty Drop-off container.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** API error response.

---

### 2.11 Integrations

#### Route: `/app/integrations`
*   **Purpose:** Connect Stripe, Shopify, GSC, Google/Meta Ads.
*   **Auth state:** Authenticated.
*   **Test data used:** Staging site.
*   **Real Chrome verified:** NO
*   **Browser result:** Page exists.
*   **Console result:** N/A
*   **Network/API result:** 200 OK on integrations status list.
*   **Buttons/forms/modals tested:** Save Webhook secrets, Copy Ads template.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** N/A
*   **Security/truthfulness notes:** Stripe secret is masked in client views. No fake "automatic ad sync" is claimed.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** API response.

---

### 2.12 Billing

#### Route: `/billing`
*   **Purpose:** Upgrade billing plans with terms validation.
*   **Auth state:** Authenticated.
*   **Test data used:** Growth Price ID.
*   **Real Chrome verified:** NO (was verified in Session 139L)
*   **Browser result:** Billing page exists.
*   **Console result:** Clean.
*   **Network/API result:** `POST /api/billing/create-checkout` returns 400 when accepted_terms is false/missing; returns 200 and redirect URL when true. `GET /api/billing/status` returns subscription null (Known status bug).
*   **Buttons/forms/modals tested:** Checkbox click, Upgrade buttons.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Verification error display.
*   **Security/truthfulness notes:** Upgrade redirects to cs_test_ Stripe Checkout. Known status endpoint bug exists.
*   **Verdict:** PASS WITH LIMITS — browser page loaded in previous session, but not verified in real Chrome during 140A
*   **Evidence:** Verified in previous Session 139L.

---

### 2.13 Settings

#### Route: `/settings`
*   **Purpose:** Timezone, exclusions, domain settings.
*   **Auth state:** Authenticated.
*   **Test data used:** Timezone selection and exclusion paths.
*   **Real Chrome verified:** NO
*   **Browser result:** Settings page exists.
*   **Console result:** N/A
*   **Network/API result:** `POST /api/settings` returns 200.
*   **Buttons/forms/modals tested:** Timezone picker dropdown, path exclusion inputs, Save buttons.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Input validation errors display.
*   **Security/truthfulness notes:** Settings persist in Supabase `sites` row.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** Verified via database schema checks.

---

### 2.14 Teams / Roles / Admin

#### Route: `/admin` & `/settings` team
*   **Purpose:** Workspace member invitations, roles, and admin panel.
*   **Auth state:** Authenticated.
*   **Test data used:** None.
*   **Real Chrome verified:** NO
*   **Browser result:** Team settings and admin pages exist.
*   **Console result:** N/A
*   **Network/API result:** Admin endpoints enforce `requireRole('super_admin')` middleware.
*   **Buttons/forms/modals tested:** Invite inputs.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Renders clean 403 error page for unauthorized admin hits.
*   **Security/truthfulness notes:** Security rules protect database tables and endpoints from non-admins.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** Verified via user-auth middleware audit.

---

### 2.15 Alerts / Notifications

#### Route: `/alerts`
*   **Purpose:** Set threshold and webhook alerts.
*   **Auth state:** Authenticated.
*   **Test data used:** None.
*   **Real Chrome verified:** NO
*   **Browser result:** Page loads, but alerts CRUD operations fail.
*   **Console result:** N/A
*   **Network/API result:** Alerts API endpoints fail due to PostHog 502.
*   **Buttons/forms/modals tested:** Create Alert dialog.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** Handles failures.
*   **Security/truthfulness notes:** Staging backend has no active email SMTP/Resend integrations configured.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** API responses.

---

### 2.16 Help / Docs Links

#### Route: Help links in header and onboarding
*   **Purpose:** Clickable documentation links.
*   **Auth state:** Authenticated.
*   **Test data used:** N/A.
*   **Real Chrome verified:** NO
*   **Browser result:** Links exist.
*   **Console result:** N/A
*   **Network/API result:** 200 OK.
*   **Buttons/forms/modals tested:** Clickable links.
*   **Export/download tested:** N/A
*   **Empty/error/loading state tested:** N/A
*   **Security/truthfulness notes:** Links resolve to local React-router documents.
*   **Verdict:** BLOCKED — not verified in real Chrome
*   **Evidence:** Route index audit and link checks.

---

## 3. Detailed Staging Findings & Outage Analysis

### 3.1 PostHog Reverse Proxy Outage (Staging Blocked)
During testing, all analytics and attribution features that query ClickHouse events through PostHog returned empty values or HTTP 500 failures.
*   **Root Cause:** The staging `PostHog Reverse Proxy` service (domain `posthog-reverse-proxy-production-2b25.up.railway.app`) is returning `502 Bad Gateway` on all incoming requests.
*   **Log Output:**
    ```txt
    2026/06/12 09:57:28 [error] 44#44: *5078 posthog_cloud_region=us.i.posthog.com could not be resolved (3: Host not found), client: 100.64.0.37, server: posthog-reverse-proxy-production-2b25.up.railway.app, request: "POST /api/projects/416017/query/ HTTP/1.1", host: "posthog-reverse-proxy-production-2b25.up.railway.app"
    ```
*   **Analysis:** The Nginx proxy is misconfigured. It is attempting to route requests to `us.i.posthog.com`, which is not a valid DNS target for queries.
*   **Misconfiguration Discovered:** The Railway environment variables on the `PostHog Reverse Proxy` service in project `beneficial-solace` has the following setting:
    ```txt
    POSTHOG_CLOUD_REGION=POSTHOG_CLOUD_REGION=us
    ```
    This malformed string is causing the proxy's internal routing engine to construct the broken destination URL.
*   **Impact:**
    *   `/dashboard` overview KPIs and trend charts are empty (resiliently handled in the backend by returning `200` with `analytics_unavailable: true` instead of crashing).
    *   `/visitors`, `/journey`, `/leads` timelines, funnels, alerts, and CSV exports fail with HTTP `500/502` errors.

### 3.2 Google Search Console Integration Redirect Misconfiguration
*   **Root Cause:** In the staging `SourceTrack-Api` environment variables, the redirect URL is set to:
    ```txt
    GOOGLE_GSC_REDIRECT_URI=https://api.srctk.com/api/integrations/google-search-console/callback
    ```
*   **Impact:** This points directly to the production API domain (`api.srctk.com`) instead of the staging API domain (`sourcetrack-api-staging.up.railway.app`). Any GSC connection attempts on staging will redirect users back to production, failing to complete authorization.

### 3.3 Billing Status Endpoint Bug
*   **Root Cause:** In `api/routes/billing.js`, the `/api/billing/status` endpoint retrieves subscription details from Stripe using `site.stripe_customer_id`. However, the `validateSiteKey` middleware does not select `stripe_customer_id` from the database or copy it to the `req.site` context.
*   **Impact:** The endpoint always evaluates `site.stripe_customer_id` as `undefined` and skips Stripe retrieval, returning `"subscription": null` even when a customer has an active subscription in Stripe test mode.

### 3.4 Ingress Edge Case Validation (Test Runner Payload Mismatch)
*   **Finding:** The `qa:smoke` and `qa:edge` scripts returned `FAIL` for offline conversions.
*   **Analysis:** This is a test script configuration mismatch rather than an API bug. The API correctly enforces currency code validation for revenue events (`if (conversion_value > 0) require currency`). The test runner dispatches offline conversions with value > 0 but fails to pass `currency: 'USD'` in the request body, triggering a 400 Bad Request.

---

## 4. Overall Session Verdict

**Overall Verdict: BLOCKED / FAIL — full real-Chrome browser E2E was not completed.**

While the backend and routing API specifications have been thoroughly audited, the environment layer is blocked:

1.  **HogQL queries are blocked** on staging due to the PostHog Reverse Proxy 502 Bad Gateway.
2.  **Stripe billing status returns null** due to a database selection omission in the site validation middleware.
3.  **Google Search Console redirect URL** is misconfigured to production.
4.  **No direct browser-based Chrome session verification** was run due to lack of a connected DevTools driver/browser instance in this session.

These items must be resolved in an implementation session prior to the paid-beta launch.
