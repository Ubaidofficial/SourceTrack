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
**PARTIAL** — UI controls and backend enforcement implemented and programmatically verified locally. Real browser QA and API validation on deployed staging remains pending.
