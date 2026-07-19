# QA Report: Billing Limits and Plan Enforcement Staging QA (Session 139K-B)

## Verdict

⚠️ **BLOCKED / ABORTED**
*Railway restart hang and exposed staging JWT disrupted clean billing enforcement QA. Staging restore has been verified. Billing enforcement QA must be rerun cleanly with no tokens in command output.*

---

## 1. Test Environment & Scope
* **Staging Database Project Reference**: `nrsvpwzekfrdrzkoecfk`
* **Production Database Project Reference**: `zxjjjsipafojhzkkumvh` (Strictly Excluded / Untouched)
* **Test Site Domain**: `stripe-e2e-test-139j.com`
* **Test Site ID**: `ab48edea-80ba-417c-a603-739fb4301472`
* **Test Site Key**: `619e934a-1b1c-48cd-ac93-3ab2b2e84287`
* **Test User Account**: `stripe-e2e-139j@sourcetrack.ai`
* **Staging API Endpoint**: `https://sourcetrack-api-staging.up.railway.app`
* **Staging Dashboard URL**: `https://sourcetrack-dashboard-staging.up.railway.app`

---

## 2. Recovery & Restore State Verification (Staging Only)

Following the aborted E2E run, the database state was audited to ensure no inconsistent values were left behind. The test site has been verified in its restored, clean baseline state:

* **Site Table Reads**:
  * `sites.plan` = `'starter'`
  * `sites.pv_limit` = `50000`
  * `sites.stripe_customer_id` = `'cus_Ui9xTUQNUUEcaL'`
  * `sites.stripe_subscription_id` = `'sub_1TijdrLZY0IPZEmw8LQ34gl1'`
* **Usage Table Reads**:
  * `site_usage_monthly` rows exist but have `pageview_count = 0` and `conversion_count = 0`.

No production databases or production Railway environments were accessed, mutated, or touched.

---

## 3. Staging JWT Token Exposure Containment
* **Token Exposure**: A temporary staging user session token (`eyJhbGciOi...`) was printed in command output during the run.
* **Containment Action**:
  * Logged out the browser tab and executed a script clearing the local storage namespace (`localStorage.clear()`).
  * Navigated the browser page back to `https://sourcetrack-dashboard-staging.up.railway.app/login`.
  * Ran a curl request using the exposed token against `/api/billing/status` and confirmed it returns `401 Unauthorized` with the message: `{"success":false,"data":null,"error":"Invalid or expired token"}` (validating that the token has expired).
  * Audited tracked and untracked repository files. No exposed JWT was found in tracked files or the new QA report. Local gitignored `.env` still contains staging secrets and is intentionally not committed; the local staging Supabase service key was exposed in tool output and must be rotated/replaced before paid beta or further sensitive staging mutation tests.

---

## 4. Run Execution Summary & Results Matrix

### A. Free Plan Enforcement
* **Billing Status Check**: `GET /api/billing/status` returned `plan: "free"` and `limit: 5000`. (**PASS**)
* **Feature Gating**: `GET /api/cohorts/weekly` returned `402 Payment Required` with upgrade payload. (**PASS**)
* **Pageview Over-Limit Check**: With simulated usage of `5000 / 5000`, `POST /api/track` returned `402 Payment Required` with error `Monthly pageview limit reached`. (**PASS**)
* **Pageview Under-Limit Check**: With simulated usage of `4999 / 5000`, `POST /api/track` returned `200 OK` (successfully claimed usage). (**PASS**)
* **Conversion Over-Limit Check**: With simulated usage of `30 / 30`, `POST /api/conversion` returned `402 Payment Required` with error `Conversion limit reached for your plan`. (**PASS**)
* **Conversion Under-Limit Check**: With simulated usage of `29 / 30`, `POST /api/conversion` returned `200 OK` (successfully claimed usage). (**PASS**)

### B. Starter Plan Enforcement
* **Billing Status Check**: Updated DB state to Starter plan, but the validation of feature-gates and pageview over-limits was interrupted by a stuck Railway restart command. (**NOT VERIFIED / BLOCKED**)

---

## 5. Bugs & Blockers Found
* **Railway Restart Hang**: Executing `npx railway restart` inside `execSync` inside a background task blocked the execution context. Resolved by killing the task and executing check/restore operations directly.
* **JWT Exposure**: Staging test-user token leaked in command logs. Token has been verified as expired, and local storage cleared.
