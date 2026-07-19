# QA Report: Deployed Staging Verification for Billing Cache & Cancellation UI (Session 139K-B4-R)

## Verdict

🟢 **PASS**

*Staging verification of the billing webhook cache invalidation and dashboard Billing UI on the deployed environment passed successfully. Immediate cache invalidation is verified E2E: after simulated Stripe subscription plan updates, the cache is immediately busted on the deployed staging API server, returning the correct plan and pageview limits. The dashboard `/billing` page renders the scheduled subscription cancellation state truthfully with the warning callout showing the correct period-end date and the "Cancels soon" badge. Staging database plan/usage baselines are restored, the test user's password is rotated back to a randomized secret, and production remains completely untouched.*

---

## 1. Test Environment & Scope

* **Staging Database Project**: `nrsvpwzekfrdrzkoecfk`
* **Production Database Project**: `zxjjjsipafojhzkkumvh` (Strictly Excluded / Untouched)
* **Test Site ID**: `ab48edea-80ba-417c-a603-739fb4301472`
* **Test Site Key**: `619e934a-1b1c-48cd-ac93-3ab2b2e84287`
* **Test User Account**: `stripe-e2e-139j@sourcetrack.ai`
* **Staging Dashboard URL**: `https://sourcetrack-dashboard-staging.up.railway.app`
* **Staging API Endpoint**: `https://sourcetrack-api-staging.up.railway.app`

---

## 2. Deployed Cache Invalidation E2E Test

A dedicated E2E validation script was run locally using Railway environment injection (`npx railway run --service SourceTrack-Api`) to authenticate and securely verify cache invalidation behavior on the live deployed staging server:

1. **Warming the Cache**: Made an authenticated request to `GET https://sourcetrack-api-staging.up.railway.app/api/billing/status?site_key=619e934a-1b1c-48cd-ac93-3ab2b2e84287`.
   * **Result**: Response cached. Returned plan `starter` and limit `50000`.
2. **Stripe Webhook Simulation**: Sent a simulated Stripe webhook `customer.subscription.updated` event to the deployed staging API `/api/billing/webhook`, mutating the subscription plan from Starter to Growth (`price_1ThFC1LZY0IPZEmw1W7ov7fB`).
   * Webhook payload was signed in memory using the active staging Stripe webhook secret (`STRIPE_WEBHOOK_SECRET` from Railway).
   * **Result**: `200 OK` (`{ received: true }`).
3. **Immediate Cache Check**: Querying the status endpoint immediately after the webhook completed.
   * **Result**: Returned plan `growth` and limit `150000` immediately, proving the cache was busted successfully.
4. **Plan Restoration**: Sent another webhook mutating the subscription back to the baseline price (`price_1ThFC0LZY0IPZEmwidiogJcP`).
   * **Result**: Returned plan `starter` and limit `50000` immediately, validating baseline database and cache restoration.

---

## 3. Billing UI Deployed Verification

Direct browser E2E QA was performed on the live deployed staging dashboard `/billing` route:

* **Cancels Soon Status**: The subscription card displays a custom `Cancels soon` badge next to the plan name.
* ** light callout Warning**: A callout warning banner is displayed at the top reading:
  ```text
  Your Starter plan remains active until July 16, 2026.
  ```
* **Pageview Usage**: The usage progress bar correctly reads `0 of 50,000 pageviews used this month` (0%).
* **Redirection Integrity**: Open Billing Portal correctly requests a secure Stripe test-mode billing portal session redirect link. The Stripe portal session URL was verified in browser/network tooling but is not recorded in this QA report because portal session URLs are temporary access links.
* **Console Integrity**: Staging browser console is clean, and network queries load cleanly without error.

---

## 4. Staging Restoration & Password Rotation

* **Staging Stripe Subscription**: Restored to the Starter price. Stripe subscription cancellation flag `cancel_at_period_end=true` remains intentionally preserved as a fixture.
* **Database Plan / Usage**: Restored to baseline values (`plan = "starter"`, `pv_limit = 50000`).
* **Staging Test User Password**: Successfully rotated to a secure, final, randomized test credential. The password value, prefix, suffix, and format were not logged, printed, or recorded in any file.
* **Production Isolation**: verified that the production environment, secrets, and database ref `zxjjjsipafojhzkkumvh` remain untouched.
