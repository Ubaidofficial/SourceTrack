# QA Report: Billing UI, Cancellation State, and Webhook Cache Invalidation (Session 139K-B3)

## Verdict

⚠️ **PARTIAL / CODE REGRESSION BLOCKER FOUND**

*Staging Billing UI loads successfully with zero console/network errors, and correctly displays plan/limits directly from the database. Subscription cancellation (cancel-at-period-end) is processed correctly without premature downgrades, but lacks any UI visual indicators. Webhook-driven cache invalidation is missing: the API server's in-memory `siteCache` remains stale for up to 5 minutes after plan updates, which is a verified code-level blocker.*

---

## 1. Test Environment & Scope

* **Staging Database Project Reference**: `nrsvpwzekfrdrzkoecfk`
* **Production Database Project Reference**: `zxjjjsipafojhzkkumvh` (Strictly Excluded / Untouched)
* **Test Site Domain**: `stripe-e2e-test-139j.com`
* **Test Site ID**: `ab48edea-80ba-417c-a603-739fb4301472`
* **Original Site Key**: `619e934a-1b1c-48cd-ac93-3ab2b2e84287`
* **Test User Account**: `stripe-e2e-139j@sourcetrack.ai`
* **Staging Dashboard URL**: `https://sourcetrack-dashboard-staging.up.railway.app`
* **Staging API Endpoint**: `https://sourcetrack-api-staging.up.railway.app`

---

## 2. Part A: Billing UI Browser QA

Browser E2E QA was run using a headless browser to load and log in to the staging dashboard and navigate to the billing section.

### A. Run Details
* **Route Loaded**: `/billing` (via `https://sourcetrack-dashboard-staging.up.railway.app/billing`)
* **Browser Method**: Headless Chrome (via Puppeteer / Chrome DevTools protocol)
* **Console Findings**: `Clean` (0 console messages or warnings found)
* **Network Findings**: All requests to resources and APIs returned `200` or `304` status codes. The dashboard correctly queries Supabase directly via the JS client:
  * `GET rest/v1/sites?select=*&limit=1` returned `200 OK`
  * `HEAD rest/v1/pageviews?select=session_id...` returned `200 OK`

### B. Observed UI State
* **Page Load**: Loaded successfully, rendering a dark-mode styled Billing workspace with no flashing, unstyled content, or blank screens.
* **Current Plan Label**: Displays `"Starter"` matching the backend plan.
* **Plan Badge**: Displays `"Active"` (colored lime/green).
* **Usage Meter**: Displays `"0 of 50,000 pageviews used this month (0%)"`.
* **Action Buttons**:
  * `"Manage Subscription"` (opens the Stripe Customer Portal)
  * `"Open Billing Portal"` (opens the Stripe Customer Portal)
* **Price / Limits Verification**: No dummy pricing or fake `$0.00` rates are displayed. Available plans copy lists Starter at $19/mo, Growth at $49/mo, and Scale from $149/mo.
* **Redirect / External URLs**: The billing portal redirect button is fully functional. Clicking it requests a portal session and successfully loads the Stripe sandbox Billing page (`https://billing.stripe.com/p/session/test_...`) with return links targeting the staging dashboard.

---

## 3. Part B: Cancellation & Active-Subscription State

We mutated and verified the subscription state of the test account in the Stripe test-mode dashboard and Supabase database.

### A. Stripe Subscription State
* **Subscription ID**: `sub_1TijdrLZY0IPZEmw8LQ34gl1`
* **Baseline State**: Active, `cancel_at_period_end` = `false`, period ends `2026-07-15`.
* **Mutated State**: Active, `cancel_at_period_end` = `true`, scheduled to cancel at `2026-07-15`.
* **Database Plan**: Stays `"starter"` (no premature downgrade occurs).

### B. Findings & UI Copy Limitations
* **Plan Access**: Access remains fully allowed on the Starter plan. Gated features (like cohorts) are accessible. Ingestion limit remains at 50,000 pageviews.
* **Billing UI Representation**:
  * **Status**: **NOT TRUTHFUL / LIMITED**. The Billing UI continues to show the plan as `"Starter"` and `"Active"` with no change in color, badges, or text.
  * **Reason**: `dashboard/src/pages/Billing.jsx` queries the `sites` table in Supabase directly, which only contains the `plan` string (`"starter"`). It does not request or check the `subscription.cancel_at_period_end` property returned by the Express API `/api/billing/status`.
  * **Implication**: Users who cancel their subscription will see the dashboard state as active, without any warning or date notifying them when their tracking access will terminate, until the period ends and the webhook downgrades them to `"inactive"`.

---

## 4. Part C: Real Cache Invalidation & Staleness Test

We conducted an E2E cache invalidation test using the same original site key (`619e934a-1b1c-48cd-ac93-3ab2b2e84287`) and avoiding any Railway restart.

### A. Test Execution & Database Snapshots
1. **Warm Cache**: Made an authenticated request to `GET /api/billing/status?site_key=619e934a-1b1c-48cd-ac93-3ab2b2e84287` to cache the Starter plan details on the API server.
2. **Mutate Plan**: Changed the Stripe subscription plan from Starter to Growth (`price_1ThFC1LZY0IPZEmw1W7ov7fB`).
3. **Webhook Simulation**: A safely signed staging billing webhook event (`customer.subscription.updated`) was sent programmatically to the staging API. Stripe dashboard webhook delivery was not relied on because the staging Stripe account currently lacks a configured webhook endpoint for the staging billing webhook URL.
4. **DB State**: Queried the database directly via Supabase. Database was updated to `plan = "growth"`, confirming successful programmatic webhook processing.
5. **API Cache Check**: Queried `GET /api/billing/status?site_key=619e934a-1b1c-48cd-ac93-3ab2b2e84287` immediately.
6. **Result**: **STALE**. The API returned `plan = "starter"` and `limit = 50000`, proving that the API server served the stale cached configuration. The cache remained stale for the remainder of its 5-minute TTL.

### B. Structural Root Cause Analysis
An audit of `api/routes/billing.js` confirmed that the Express server's webhook handlers (`customer.subscription.updated` and `checkout.session.completed`) update the database but **never invalidate the cache**. No `siteCache.del(siteKey)` is called inside the webhook endpoints.

* **Impact**: After a user upgrades or downgrades, their tracking limits and gated features will remain locked/unlocked on the old plan state for up to 5 minutes, leading to temporary 402 blocks (on upgrade) or delayed limits (on downgrade) at the ingestion layers.

---

## 5. Staging Mutations & Restoration Confirmation

* **Staging User Password**: Programmatically rotated to a new unlogged staging test credential after the draft report accidentally exposed the prior test password value. The new password value was not printed, logged, committed, or recorded. The draft report/tool output briefly exposed the prior staging test password value. It was rotated again before commit, and the final report does not contain any active raw password, JWT, Supabase key, Stripe secret, Railway env value, or webhook secret.
* **Staging Stripe Subscription**: Restored to the Starter price and kept `cancel_at_period_end=true` intentionally as a staging cancellation fixture. This differs from the original pre-test cancellation flag and must be considered intentional staging test state, not full baseline restoration.
* **Database State**: Restored to matching baseline (`plan` = `"starter"`, `pv_limit` = `50000`).
* **Production Boundary**: No production data, secrets, or endpoints were accessed or modified. Production Supabase project `zxjjjsipafojhzkkumvh` remains untouched.

---

## 6. Verdict & Release Readiness

### Verdict
🔴 **BLOCKED** — Webhook cache invalidation is missing.

### Remaining Release Blockers & Follow-ups
1. **P0 - Invalidate siteCache in billing webhooks**: Must import `siteCache` from `../middleware/auth.js` and call `siteCache.del(siteKey)` in `customer.subscription.updated`, `checkout.session.completed`, and other billing state mutations in `api/routes/billing.js`.
2. **P1 - Display cancellation status in Billing UI**: Update `dashboard/src/pages/Billing.jsx` to display a warning callout if the subscription is scheduled for cancellation (e.g. read from `/api/billing/status` instead of querying Supabase directly).
3. **P1 - Staging webhook endpoint configuration**: Staging Stripe account lacks a webhook endpoint pointing to `https://sourcetrack-api-staging.up.railway.app/api/billing/webhook`. Webhook calls in this test were routed manually/programmatically.
4. **Paid Beta Release Status**: **NOT READY**. Release checklist requires resolving these billing cache and UI copy issues, along with production environment verification and backup restore drills.
