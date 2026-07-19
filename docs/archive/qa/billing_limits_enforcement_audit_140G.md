# Billing and Plan Limits Enforcement Audit Report

**Session:** 140G — Billing/Limits Enforcement Code Audit
**Date:** 2026-06-12
**Brutal Verdict:** PARTIALLY ENFORCED / NOT ENFORCED (Volume-based limits bypassed; status-based gating active)

---

## 1. Executive Summary

A comprehensive code-level audit was conducted to verify whether billing plan limits (pageviews, conversions, active sites, team user seats, and webhook dispatches) are consistently enforced across ingestion, query-time, and background workflows.

While **subscription status gates** (blocking inactive/archived accounts in `api/middleware/auth.js`) and **feature gates** (blocking advanced segments, ad platforms, and CSV exports in their respective routes) are active and correct, **volume-based plan limits are effectively unenforced** or bypassed on the primary tracking paths.

---

## 2. Audited Code Paths

The following files and paths were audited:
*   **Ingestion Handlers**:
    *   `api/routes/track.js` (`POST /api/track` and `POST /track`)
    *   `api/routes/conversion.js` (`POST /api/conversion`)
    *   `api/routes/analytics.js` (`POST /api/analytics/collect`)
*   **Ingestion & Auth Middlewares**:
    *   `api/middleware/auth.js` (`validateSiteKey`)
    *   `api/middleware/tier-check.js` (`checkTierLimit`)
*   **Billing & Plan Helpers**:
    *   `api/lib/plan-features.js` (plan limits and feature matrices)
    *   `dashboard/src/lib/planFeatures.js` (frontend plan limits mirror)
    *   `api/routes/billing.js` (`POST /create-checkout`, `POST /portal`, `GET /status`, and webhook handlers)
*   **Outbound Webhooks**:
    *   `api/routes/webhooks.js` (webhook creation and updates)
    *   `api/lib/webhook.js` (background webhook dispatching)
*   **Onboarding & Site Creation**:
    *   `api/routes/onboarding.js` (`POST /api/onboarding/site`)
*   **Data Retention & Cleanup**:
    *   `api/jobs/nightly-attribution.js` (`runRetentionPurge`, `runFreeTierPageviewPurge`, and `runFreeTierAutoArchive`)

---

## 3. Detailed Audit Findings & Gaps

### A. Pageview Limits Bypassed on standard tracking routes
*   **Mechanism:** Standard tracking routes (`api/routes/track.js` and `api/routes/conversion.js`) process and capture pageview/conversion events strictly to PostHog (`ph.capture`). They perform no database inserts into the Supabase `pageviews` table.
*   **Limit Check:** The ingestion-time limit middleware `checkTierLimit` (`api/middleware/tier-check.js`) counts monthly pageviews using the Supabase RPC `count_monthly_pageviews`, which queries the Supabase `pageviews` table.
*   **Gap:** Because the `pageviews` table remains empty for standard tracking users, the RPC query returns `0` usage. As a result, pageview limits are never metered or blocked on standard tracking routes, failing open indefinitely.
*   **Alerts Impact:** The daily `usage-threshold-emails.js` job also checks usage via the same RPC, meaning users on standard tracking will never receive warning emails when crossing 50%, 80%, or 100% of their limit.

### B. Legacy Ingestion Lacks `checkTierLimit` Middleware
*   **Mechanism:** The legacy collection route `POST /api/analytics/collect` (`api/routes/analytics.js`) inserts pageviews directly into the Supabase `pageviews` table.
*   **Gap:** However, this endpoint does not register the `checkTierLimit` middleware, allowing legacy tracking clients to ingest events without volume gating even if the Supabase pageview counter is accurate and exceeds limits.

### C. Outbound Webhook Downgrade Leak
*   **Mechanism:** Outbound webhook creation and updates are gated on the backend by the `webhook_outbound` plan feature in `api/routes/webhooks.js`.
*   **Gap:** The background worker `dispatchWebhook` (`api/lib/webhook.js`) queries active destinations from the `webhook_destinations` table, checking only if the destination is marked `active: true`. It does not verify the owner site's current plan status.
*   **Downgrade Leak:** If a user downgrades from Growth/Scale (webhooks allowed) to the Free plan (webhooks blocked), the active webhook remains in the database and the background dispatcher continues to successfully forward conversion payloads.

### D. Unenforced Active Site Limits
*   **Mechanism:** Plan limits restrict the number of active sites (`free: 1`, `starter: 1`, `growth: 3`).
*   **Gap:** The endpoint `POST /api/onboarding/site` (`api/routes/onboarding.js`) only checks for domain name duplicates, but never validates the user's total active sites against their plan's structural limits before inserting a new site.

### E. Missing Team Seats Enforcement
*   **Mechanism:** Plan limits restrict the number of team seats (`free: 1`, `growth: 3`).
*   **Gap:** The entire team member invitation and management feature is missing from the API and frontend dashboard. Because the capability is not implemented, the limit itself is unenforced on the backend.

### F. Unenforced Conversion Caps
*   **Mechanism:** Plans specify monthly conversion caps (e.g. `free: 30`, `starter: 150`).
*   **Gap:** `POST /api/conversion` captures and logs conversions directly to PostHog without checking monthly counts or capping.

### G. PostHog Data Retention Purges Missing
*   **Mechanism:** The nightly job (`api/jobs/nightly-attribution.js`) purges old records from Supabase (`attributed_conversions` and legacy `pageviews`) based on data retention settings.
*   **Gap:** The purge job does not delete events from PostHog. Because the dashboard queries PostHog for raw analytics, widgets like Top Pages and Stages will display data beyond the retention window.

---

## 4. Recommended Minimal Fixes

To resolve these gating gaps securely with minimal changes:

1.  **Enforce Webhook Downgrades:** Update the `webhook_destinations` lookup in `api/lib/webhook.js` to perform an inner join on the `sites` table and verify that the site's current plan still allows the `webhook_outbound` feature before dispatching.
2.  **Enforce Site Limits on Creation:** Update `POST /api/onboarding/site` to query the user's current site count and block creation if it exceeds the limit in `getStructuralLimits(plan)`.
3.  **Fix Pageview Limit Checking:** Modify `checkTierLimit` to query PostHog (via HogQL or the API) for the monthly event count, or increment a cached database counter in the background.

---

## 5. Automated Tests Added

Added focused unit tests covering `checkTierLimit` middleware validation states in `api/tests/billing-middleware.test.js`:
*   *calls next() if plan has no pageview limit*
*   *calls next() if plan is active and usage is below limit*
*   *returns 402 if monthly pageview limit is reached*
*   *returns 402 if trial is expired*
*   *returns 402 if subscription is inactive or archived*
*   *fails open (calls next()) if RPC returns an error*

*Note: These tests validate middleware routing and validation logic via a mocked Supabase RPC, but do not validate E2E plan limit enforcement across PostHog ingestion.*
