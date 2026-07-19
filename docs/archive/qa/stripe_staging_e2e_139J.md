# Stripe Staging E2E QA Report — Session 139J

> Date: 2026-06-11
> Session: 139J — Stripe Test Catalog Correction + Stripe E2E on Staging Only
> Branch: main (no commits made)
> Build: ✅ PASSING

---

## 1. Verdict

**PASS WITH LIMITS — Stripe API/webhook E2E verified on staging; browser billing UI and billing status endpoint remain pending.**

All Stripe checkout creation, redirection, webhook signature validation, database updates, and event deduplication flows have been successfully verified against the live staging environment. The Stripe test catalog has been updated with corrected prices matching the public pricing. Browser billing UI is BLOCKED — not verified. The billing status endpoint returns `subscription: null` due to a DB field selection omission in the validateSiteKey middleware.

---

## 2. Safety Confirmations

- **No Production Stripe Touch:** Verified that only test-mode Stripe keys (`sk_test_...` and webhook secret `whsec_...`) and the Stripe test account `acct_...ZEmw` were used.
- **No Production Supabase Touch:** Verified that all database queries and migrations were executed exclusively on the staging Supabase project (ref `nrsvpwzekfrdrzkoecfk`).
- **No Production Railway Touch:** Verified that environment variables were inspected and updated only in the staging environment (`74a58dbc-8a14-4c18-a9c8-2dda1a5b9ee9`) of the Railway project.
- **No secrets are included in this committed report.**

---

## 3. Files/Routes Inspected

- **Files Inspected:**
  - `api/routes/billing.js` (Checkout creation, status, and webhook)
  - `api/routes/stripe-webhook.js` (Conversion webhook)
  - `dashboard/src/components/PricingCards.jsx` (Frontend expected plans)
  - `dashboard/src/pages/Pricing.jsx` (Frontend pricing expected limits)
- **Routes Tested:**
  - `POST /api/billing/create-checkout` (Checkout session creation)
  - `POST /api/billing/webhook` (Billing subscription lifecycle events webhook)
  - `POST /api/webhooks/stripe/:site_key` (Conversion value webhook)
  - `GET /api/billing/status` (Workspace billing status)

---

## 4. Public Pricing Expected Values

According to the frontend pricing matrix and cards, the expected prices are:

| Plan | Price (Yearly Rate) | Price (Monthly Rate) | Tracked Pageviews / mo | Attributed Conversions / mo |
|---|---|---|---|---|
| **Free** | $0 | $0 | 5,000 | 30 |
| **Starter** | $19/mo | $29/mo | 50,000 | 150 |
| **Growth** | $49/mo | $79/mo | 150,000 | 750 |
| **Scale** | — | From $149/mo | 500,000+ | 2,500+ |

---

## 5. Stripe Test Catalog Audit

### Stale Test Catalog (Old)
- **Starter:** $49/mo
- **Growth/Pro:** $99/mo
- **Scale/Agency:** $199/mo

### Corrected Test Catalog (Created in Stripe Test Mode)
The corrected products and monthly prices were successfully created in the Stripe test mode account:

| Product | Price Nickname | Amount | Interval | Price ID | Expected? |
|---|---|---|---|---|---|
| SourceTrack Starter (Corrected) | Starter Monthly (Corrected) | $29.00 | Month | `price_1ThFC0LZY0IPZEmwidiogJcP` | Yes (matches monthly rate) |
| SourceTrack Growth (Corrected) | Growth Monthly (Corrected) | $79.00 | Month | `price_1ThFC1LZY0IPZEmw1W7ov7fB` | Yes (matches monthly rate) |
| SourceTrack Scale (Corrected) | Scale Monthly (Corrected) | $149.00 | Month | `price_1ThFC1LZY0IPZEmwifyZL3dy` | Yes (matches monthly rate) |

*Note: All corrected prices include `pv_limit` metadata (e.g. `pv_limit: "150000"` for Growth) as required.*

---

## 6. Railway Staging Env Var Audit (Names Only)

Staging environment variables on `SourceTrack-Api` were audited and confirmed to point to test mode keys and corrected price IDs:

| Service | Env Var | Present? | Test/Prod/Unknown | Notes |
|---|---|---|---|---|
| SourceTrack-Api | `STRIPE_SECRET_KEY` | Present | Test | Starts with `sk_test_` |
| SourceTrack-Api | `STRIPE_WEBHOOK_SECRET` | Present | Test | Starts with `whsec_` |
| SourceTrack-Api | `STRIPE_PRICE_ID_STARTER` | Present | Test | Matches `price_1ThFC0LZY0IPZEmwidiogJcP` |
| SourceTrack-Api | `STRIPE_PRICE_ID_GROWTH` | Present | Test | Matches `price_1ThFC1LZY0IPZEmw1W7ov7fB` |
| SourceTrack-Api | `STRIPE_PRICE_ID_SCALE` | Present | Test | Matches `price_1ThFC1LZY0IPZEmwifyZL3dy` |
| SourceTrack-Api | `DASHBOARD_URL` | Present | Test | Points to staging dashboard host |
| SourceTrack-Api | `SUPABASE_URL` | Present | Test | Points to staging Supabase reference |

---

## 7. Checkout E2E Result

We successfully authenticated via GoTrue using the staging test user credentials and hit `POST /api/billing/create-checkout`.

- **Checkout Session Created:** Created Stripe session ID `cs_test_b1FTmwQ...` in test mode.
- **Redirection Validation:** Verified that `success_url` and `cancel_url` point to:
  - Success: `https://sourcetrack-dashboard-staging.up.railway.app/billing?success=true`
  - Cancel: `https://sourcetrack-dashboard-staging.up.railway.app/billing?cancel=true`
- **Price Match:** Verified the Stripe checkout session uses price `price_1ThFC1LZY0IPZEmw1W7ov7fB` (Growth plan, amount $79.00, `pv_limit: 150000`).

---

## 8. Webhook Result

A mock `checkout.session.completed` webhook payload was signed with the staging webhook secret and sent to the staging API endpoints.

- **Billing Webhook (`/api/billing/webhook`):** Returned `200 OK` with `{"received":true}`.
- **Deduplication:** A second submission of the identical event ID returned `200 OK` with `{"received":true,"duplicate":true}`. This confirms the in-memory deduplication cache is active.
- **Conversion Webhook (`/api/webhooks/stripe/:site_key`):** Responded with `200 OK`. Verified that duplicate requests were correctly logged in the database as `"duplicate"`.

---

## 9. Supabase Staging DB Verification

### Sites Table Update (`sites`)

Verified site row update before/after values:

| Field | Before | After | Status |
|---|---|---|---|
| **plan** | `'free'` | `'growth'` | ✅ Plan upgraded |
| **pv_limit** | `5000` | `150000` | ✅ Limit increased |
| **stripe_customer_id** | `null` | `cus_UgdRO...` (Redacted) | ✅ Customer mapped |
| **stripe_subscription_id** | `null` | `sub_1ThGA...` (Redacted) | ✅ Subscription mapped |

### Revenue Ingestion Events (`revenue_ingestion_events`)

Verified that the conversion webhook successfully wrote audit logs in the staging database:

1. **First Attempt (Success):**
   - Event ID: `evt_test_conversion_webhook_dedupe_139J`
   - Order ID: `cs_test_conversion_session_139J`
   - Status: `'success'`
   - Value: `79`
   - Currency: `'USD'`
2. **Second Attempt (Duplicate):**
   - Event ID: `evt_test_conversion_webhook_dedupe_139J`
   - Order ID: `cs_test_conversion_session_139J`
   - Status: `'duplicate'`

---

## 10. Billing UI Result

`BLOCKED — browser UI not verified`

Browser-level UI verification remains pending because Chrome DevTools MCP or similar browser automation was not available for interactive browser sessions. The API and DB states are fully verified.

---

## 11. Product/UX/DataFast-parity Notes

### Staging Database Schema Drift Resolution
The staging DB was manually aligned using repo migrations (`20260606180000_revenue_foundation.sql`, `20260606114100_add_site_settings.sql`, `20260607231500_add_cross_domain_settings.sql`, etc.) and setting/trial columns. It must remain reconciled with source-of-truth migrations.

---

## 12. Blockers & Remaining Issues

1. **Discovered Status Endpoint Bug:** 🛠️ **FIX WRITTEN in Session 139J-B (local); post-deploy verification PENDING.**
   We observed that `/api/billing/status` returned `"subscription": null` even when the customer has an active subscription in Stripe test mode.
   - **Root Cause:** The `validateSiteKey` middleware does not select `stripe_customer_id` from the database or copy it to the `req.site` context. When the `/status` route handler checks `if (site.stripe_customer_id)`, it evaluates to `undefined`, skipping the Stripe subscription query. (Same omission also broke `/portal` and the customer-reuse path in `/create-checkout`.)
   - **Fix (139J-B, local):** `api/middleware/auth.js` now selects `stripe_customer_id` (both SELECTs) and exposes it on `req.site`. Validated by audit + automated QA suite. **Live-on-staging verification is PENDING until this commit is pushed/deployed** (the browser test ran against the pre-fix deployed build). See `docs/qa/billing_status_fix_and_ui_139J-B.md`.
2. **Browser Billing UI:** 🟢 **Free-plan staging UI browser-verified (on the currently deployed build) in Session 139J-B; portal flow NOT verified.**
   - **Status:** Free-plan staging Billing UI browser-verified PASS on the currently deployed staging build (page load, plan/usage display, free/no-customer state, Terms/Privacy gate, upgrade→Stripe test checkout). This does NOT prove the new middleware is live. Paid-site billing **portal** flow is NOT verified (requires a paid staging site/customer). Production billing is UNVERIFIED. Paid beta is BLOCKED. See `docs/qa/billing_status_fix_and_ui_139J-B.md`.

---

## 13. Fixes Made

- Applied migrations adding `trial_started_at`, `trial_ends_at`, `excluded_paths`, `timezone`, `attribution_window_days`, `custom_url_params`, `cross_domain_domains`, `cross_domain_cookie_domain`, and `encrypted_stripe_webhook_secret` columns to `sites` in the staging DB.
- Applied migrations creating the `revenue_idempotency_keys` and `revenue_ingestion_events` tables and plpgsql function in the staging DB.
- Configured the staging variables on Railway with the corrected price IDs and Stripe test keys.
- Saved the encrypted webhook secret in the database for the test site so the signature check passes.

---

## 14. Raw Validation Output

```
Running offline environment safety guard tests...
✅ All offline environment safety tests passed successfully.
==================================================
      SourceTrack Release Readiness Audit
==================================================

✅ Declared status: NOT READY (correctly blocked).
✅ Blocker "Staging Schema Bootstrap" is correctly flagged as OPEN and contains BLOCKED/PENDING wording.
...
==================================================
PASS — Release readiness checklist verified (all blockers open).
==================================================
         SourceTrack Static Launch QA
==================================================

--- A. Git Cleanliness & Log ---
?? docs/qa/browser_onboarding_ui_qa_139I-C.md

b90f941 Session 139I-C — Verify staging onboarding API
...
--- B. Backend Syntax Checks ---
✅ All backend files syntax passed.

--- C. Frontend Build ---
Running frontend production build...
✅ Frontend build succeeded.

--- D. Whitespace Check ---
✅ No whitespace violations.

--- E. Forbidden Copy/API Grep Checks ---
✅ Forbidden copy/API grep checks passed (no forbidden strings in user-facing code).

--- F. Route Mount Checks ---
✅ Route mount checks passed.

--- G. Security & Plan Scoping Checks ---
✅ Security & plan scoping checks passed.

==================================================
PASS — static launch QA passed
```

---

## 15. Git Status

```
?? docs/qa/browser_onboarding_ui_qa_139I-C.md
?? docs/qa/stripe_staging_e2e_139J.md
```
