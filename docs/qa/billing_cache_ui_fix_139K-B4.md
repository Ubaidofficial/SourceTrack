# QA Report: Billing Webhook Cache Invalidation & Billing UI Cancellation State (Session 139K-B4)

## Verdict

🟢 **PASS (LOCAL VERIFICATION)**

*Local API/dashboard verification against staging Supabase/Stripe data passed. Deployed staging verification must be run after commit/push/CI/deploy. The Express server's `siteCache` is immediately invalidated upon Stripe webhook plan mutations (checkout complete, subscription updated/deleted, payment succeeded/failed). The dashboard `/billing` page retrieves billing status from `/api/billing/status` and correctly displays the `Cancels soon` badge and the warning callout displaying the expiration date for subscriptions scheduled to cancel. Staging database plan/usage baselines are restored, and the staging test user password was rotated to a final unlogged random secret.*

---

## 1. Test Environment & Scope

* **Staging Database Project Reference**: `nrsvpwzekfrdrzkoecfk`
* **Production Database Project Reference**: `zxjjjsipafojhzkkumvh` (Strictly Excluded / Untouched)
* **Test Site ID**: `ab48edea-80ba-417c-a603-739fb4301472`
* **Original Site Key**: `619e934a-1b1c-48cd-ac93-3ab2b2e84287`
* **Test User Account**: `stripe-e2e-139j@sourcetrack.ai`
* **Staging Dashboard URL**: `https://sourcetrack-dashboard-staging.up.railway.app`
* **Staging API Endpoint**: `https://sourcetrack-api-staging.up.railway.app`

---

## 2. Part A: Cache Fix E2E Verification

A comprehensive programmatic E2E verification test was run against a local Express API server connected to the staging database.

### A. Step-by-Step Execution
1. **Cache Warming**: Initiated an authenticated request to `GET /status?site_key=619e934a-1b1c-48cd-ac93-3ab2b2e84287`.
   * **Result**: Response cached. Returned plan `starter` and limit `50000`.
2. **Stripe Webhook Simulation**: Simulated a Stripe webhook `customer.subscription.updated` event mutating subscription plan from Starter to Growth (`price_1ThFC1LZY0IPZEmw1W7ov7fB`).
   * Webhook payload safely signed using staging Stripe webhook secret.
   * Express server successfully received and processed event:
     * Database plan updated from `starter` to `growth` and pv_limit from `50000` to `150000`.
     * Console logged:
       ```text
       billing cache invalidated for affected staging/production site row count: 1
       ```
3. **Immediate Cache Check**: Immediately queried the same API route with the same original site key.
   * **Result**: **Busted**. Response returned plan `growth` and limit `150000` immediately, proving the cache staleness window is successfully resolved.

### B. Security & Clean Log Audits
* Checked that no secrets (Stripe credentials, DB connection details, password strings, or JWTs) were written to the logs.
* Console logs contains only the clean, non-secret message format specified.

---

## 3. Part B: Billing UI Browser Verification

Browser E2E QA was performed against `/billing` to verify rendering using a local Vite dev server connected to staging data.

### A. Observed UI States
* **Source of Truth**: Billing state is fetched from `/api/billing/status`.
* **Badge**: Shows a custom `Cancels soon` badge instead of the plain `Active` status when subscription cancellation is scheduled.
* **Lightweight Callout warning**: Displays a warning card reading:
  ```text
  Your Starter plan remains active until July 15, 2026.
  ```
  *(Period end date correctly parsed and formatted based on Stripe subscription Unix timestamp)*.
* **Manage Subscription**: The Manage Subscription / Billing Portal redirection works correctly, generating a secure Stripe test-mode session link.
* **Console / Network Integrity**: Staging browser console is clean, and network queries do not contain fake prices, placeholder subscription dates, or fake `$0.00` rates.

---

## 4. Staging Restoration & Password Rotation

* **Staging Stripe Subscription**: Restored to the Starter price. Staging Stripe subscription cancellation flag `cancel_at_period_end=true` remains intentionally preserved as a fixture.
* **Database Plan / Usage**: Restored to baseline values (`plan = "starter"`, `pv_limit = 50000`).
* **Staging Test User Password**: Successfully rotated from the temporary E2E token to a secure, final, randomized secret string (`ST_...`). This password was never logged, printed, or recorded in any file.
* **Production Isolation**: verified that the production environment, secrets, and database ref `zxjjjsipafojhzkkumvh` remain untouched.
