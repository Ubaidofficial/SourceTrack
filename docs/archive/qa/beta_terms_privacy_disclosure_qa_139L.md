# QA Report: Beta Terms and Privacy Disclosure Flow Before Payment

## 1. Existing Audit Findings
*   Checked for pages in the application referencing `terms` or `privacy`. Found existing `/terms` page (`dashboard/src/pages/Terms.jsx`) and `/privacy` page (`dashboard/src/pages/Privacy.jsx`).
*   Audited all files under `dashboard/src` and `api/routes` for checkout routes.
*   Verified that Stripe Checkout creation is handled exclusively via `POST /api/billing/create-checkout`.
*   Verified that the Stripe Customer Portal is initiated via `POST /api/billing/portal` (does not initiate a new paid checkout, hence is not gated).

## 2. Exact Payment Entry Points Found
*   **Public Pricing Page** (`dashboard/src/pages/Pricing.jsx` / `PricingCards.jsx`): All call-to-actions (CTAs) redirect to `/signup`.
*   **Sign Up Flow** (`dashboard/src/pages/Signup.jsx`): Redirects directly to `/onboarding` upon completion.
*   **In-App Billing Page** (`dashboard/src/pages/Billing.jsx`): The upgrade buttons ("Upgrade to Starter", "Upgrade to Growth", "Upgrade to Scale") under the "Available Plans" section trigger a POST request to `/api/billing/create-checkout`. This is the single, direct in-app upgrade path to paid checkouts.

## 3. Files Changed
*   `dashboard/src/lib/api.js`: Modified `createCheckout()` to accept an `acceptedTerms` flag and forward it in the JSON payload as `accepted_terms`.
*   `dashboard/src/pages/Billing.jsx`:
    *   Imported React Router `Link` to route locally to `/terms` and `/privacy`.
    *   Added `acceptedTerms` state variable.
    *   Rendered a terms agreement checkbox container directly above the available plans card grid.
    *   Added disabled attribute gates to upgrade buttons checking `!acceptedTerms`.
    *   Passed `acceptedTerms` to `createCheckout()`.
*   `api/routes/billing.js`:
    *   Extracted `accepted_terms` from the request body in `/create-checkout`.
    *   Enforced terms check: rejected requests where `accepted_terms !== true` with a `400 Bad Request` status code and standard error format.

## 4. UI Behavior
*   When a user views the Billing page and they are eligible for upgrading (on trial or free plans), they see the terms disclosure checkbox directly above the "Available Plans" card grid.
*   The checkout buttons are disabled by default. The text reads:
    `I have read and agree to the SourceTrack Terms and Privacy Policy.`
    with `Terms` and `Privacy Policy` linked relatively via React Router to `/terms` and `/privacy` respectively, configured to open in a new tab.
*   Checking the checkbox enables the upgrade buttons instantly. Unchecking disables them.

## 5. Backend Behavior
*   The `POST /api/billing/create-checkout` endpoint inspects `req.body.accepted_terms`.
*   If missing, or if it is false (or not exactly `true`), the server stops execution immediately and returns `400 Bad Request`.
*   If `true`, the server proceeds past validation to resolve the customer/site and fetch Stripe price information.

## 6. API Negative Test
Tested programmatically using sandbox verification script `test_checkout_enforcement.js`:
*   **Scenario A: Request payload does not include `accepted_terms`**
    *   *Result:* Status `400`
    *   *Payload response:*
        ```json
        {
          "success": false,
          "data": null,
          "error": "Terms and Privacy acknowledgement is required before checkout."
        }
        ```
*   **Scenario B: Request payload includes `accepted_terms: false`**
    *   *Result:* Status `400`
    *   *Payload response:*
        ```json
        {
          "success": false,
          "data": null,
          "error": "Terms and Privacy acknowledgement is required before checkout."
        }
        ```

## 7. API Positive Test Shape
*   **Scenario C: Request payload includes `accepted_terms: true`**
    *   *Result:* Bypasses validation check and proceeds downstream.
    *   *Payload response (with mock environment configuration):*
        Downstream price mapping/stripe lookup is executed normally. On a test run with local/staging mock settings, it successfully reaches the next logic stage:
        ```json
        {
          "success": false,
          "data": null,
          "error": "No price configured for plan: growth"
        }
        ```

## 8. Browser/Manual Test Status
*   Verified compilation and static builds pass without errors.
*   Verified that clicking `/terms` and `/privacy` opens the correct React-routed pages in a new tab.
*   Verified that the checkbox controls button disabled status in the DOM.

## 9. Remaining Limitations
*   Validation check relies on checking if `accepted_terms === true` in request body. It does not record terms acceptance time/IP in the database since persistent storage of legal versions was excluded from this session's scope to keep the change lightweight and migration-free.

## 10. Verdict
**PARTIAL** *(implementation-session verdict — superseded by the Browser/Staging Verification Addendum below)* — UI controls and backend enforcement implemented and programmatically verified locally. Real browser QA and API validation on deployed staging remains pending.

> **UPDATE 2026-06-12 — real staging browser + API verification completed (deploy `cee2954`). Verdict: ✅ PASS. See the Browser/Staging Verification Addendum below.**

---
---

# Browser/Staging Verification Addendum — Real Claude-in-Chrome run (2026-06-12)

> Real navigation, checkbox toggling, a live "Upgrade" click, and authenticated API probes against staging on deploy `cee2954`. Operator-authenticated (`imubaid93@gmail.com`); no payment details entered, no secrets/tokens/full-site-keys exposed. No commits/pushes.

## A0. Verdict

**✅ PASS — staging UI + backend enforcement verified, and Terms/Privacy links work.**

## A1. Preflight / deploy commit IDs

| Service | Deployment | Status | Commit |
|---|---|---|---|
| `SourceTrack-Dashboard` | dc6d3bfb | SUCCESS @ 09:03:16 UTC | **`cee2954`** |
| `SourceTrack-Api` | f2e6e51d | SUCCESS @ 09:03:15 UTC | **`cee2954`** |

CI for `Session 139L — Add terms privacy checkout gate` = green. Both services on latest commit.

## A2. Exact staging routes tested

`/billing`, `/terms`, `/privacy`; APIs `POST /api/billing/create-checkout` and `POST /api/billing/portal`; Stripe-hosted `checkout.stripe.com` (test mode, observed only — no interaction).

## A3. Scenario results

| Scenario | Result | Evidence |
|---|---|---|
| **A — Billing page renders gate** | ✅ PASS | Acknowledgement checkbox renders **above** "Available Plans": *"I have read and agree to the SourceTrack Terms and Privacy Policy."* All three upgrade buttons (`Starter`/`Growth`/`Scale`) are `disabled` while unchecked. Links → `/terms` and `/privacy` (`target=_blank`, `rel=noopener noreferrer`). `ss_25061a69d` |
| **B — Links work, no false claims** | ✅ PASS | `/terms` (title "Terms of Service — SourceTrack", h "Terms of Service") and `/privacy` (title "Privacy Policy Overview — SourceTrack", h "Privacy & Data Handling") both load (no 404). Page-text scan for the disallowed over-claim phrases (GDPR‑/SOC2‑compliance assertions, "fully‑compliant", "guaranteed‑privacy") returned **none**. |
| **C — Checkbox toggles buttons** | ✅ PASS | Unchecked → buttons `[disabled,disabled,disabled]`; checked → `[enabled,enabled,enabled]`; unchecked again → `[disabled,disabled,disabled]`. `ss_2045gfvnd` |
| **D — Checkout with acknowledgement** | ✅ PASS | With the box checked, clicking **Upgrade to Growth** redirected to **`https://checkout.stripe.com/c/pay/cs_test_…`** (tab title "SourceTrack sandbox") — confirming the frontend sent `accepted_terms:true`, the gate passed, and **Stripe test mode** is used (`cs_test_` session). No payment details entered; page intentionally not interacted with. |
| **E — Backend negative (missing / false)** | ✅ PASS | `POST /api/billing/create-checkout` with **no** `accepted_terms` → **400** `{success:false, data:null, error:"Terms and Privacy acknowledgement is required before checkout."}`. With `accepted_terms:false` → identical **400**. |
| **F — Backend positive shape** | ✅ PASS | Same endpoint with `accepted_terms:true` (+ `site_key`/`successUrl`/`cancelUrl`) → **200, success:true**, returns a `checkout.stripe.com` URL (test mode). Passed the terms gate to the normal Stripe path — **not** the terms error. |
| **G — Portal unaffected** | ✅ PASS | `POST /api/billing/portal` → **400 "No Stripe customer — subscribe first"** (free-plan account). `is_terms_error:false`, no checkout created. Portal is not gated by the Terms/Privacy acknowledgement and remains billing-management only. (Code: `/portal` route has no `accepted_terms` check.) |

## A4. Network / API findings

- `create-checkout` (no/false `accepted_terms`) → **400** terms error (gate enforced server-side, before `successUrl`/Stripe logic).
- `create-checkout` (`accepted_terms:true`, full body) → **200** + test-mode `cs_test_` checkout URL.
- `portal` → **400** "No Stripe customer — subscribe first" (not terms-gated).
- App console clean; no app 5xx. Stripe Checkout session ids are test-mode (`cs_test_…`) and are redacted in this report.

## A5. Screenshots

`ss_25061a69d` (billing gate, unchecked, buttons disabled) · `ss_2045gfvnd` (checked, buttons enabled). Stripe Checkout redirect confirmed via tab URL (`cs_test_…`); the hosted payment page is a blocked/no-interaction surface, so no screenshot was taken there.

## A6. Limitations

- Terms acceptance is enforced as a request gate (`accepted_terms === true`); it is **not persisted** (no timestamp/IP/version record) — by design this session (noted in §9), a candidate future enhancement.
- Verified on the existing operator account (free plan, has a site); a brand-new pristine account was not separately exercised, but the gate is request-scoped and account-independent.
- A few **test-mode** Stripe Checkout sessions were created during D/F (no payment completed). No production Stripe touched.

## A7. Scope note

This closes the **Terms/Privacy payment-disclosure gate** only. It does **not** mark paid beta ready — other P0 conditions (Stripe browser billing UI, backups/PITR drill, prod env secrets) remain open per SESSION_STATE.

No commits. No pushes. No secrets, tokens, JWTs, cookies, Supabase/Stripe/webhook/service keys, Railway variable values, or full site keys exposed.
