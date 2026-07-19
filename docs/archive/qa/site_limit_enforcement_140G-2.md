# QA Report: Site Limit Enforcement (Session 140G-2)

This report documents the verification and testing of the plan-based active site limit enforcement on backend site creation.

## Objectives & Gaps Addressed

- **Site Limit Enforcement**: The site limit gap is now fixed at the backend site creation layer (`POST /api/onboarding/site`).
- **Billing Model**: The implementation matches the current site-scoped billing model where plan information resides on individual site records (`sites.plan`).
- **Account/Company Level Plan Status**: A global account-level or company-level billing source of truth is still not verified (no such columns exist in the DB schema). In the absence of an account-level plan, the limit check uses a conservative fallback strategy:
  1. A user/company with `0` active sites is treated as a new user and is allowed to create their first site under the `'free'` plan limit (`1` site).
  2. A user/company with existing active sites is checked against the maximum allowed limit derived from the highest structural `sites` limit among all their current active/non-archived sites.
  3. The scope for the count query is resolved from the request context: company-scoped if `req.user.company_id` exists, falling back to owner-scoped (`owner_id = req.user.id`) if not.
  4. Active/current sites are defined by checking `plan != 'archived'`. No other archived or status columns exist on the `sites` schema.
- **Fail-Closed Design**: If the count query fails, the endpoint logs the error and rejects site creation with a clean `500 Internal Server Error` without leaking database details.
- **Paid Beta Status**: Paid beta remains **blocked** because pageview limits, conversion caps, and PostHog retention remain unresolved.

## Files Modified

- `api/lib/site-limits.js` [NEW] — Small, testable helper resolving active site count and checking the plan limit.
- `api/routes/onboarding.js` [MODIFY] — Integrates the site limit check into `POST /site` onboarding route before inserting a new site.
- `api/tests/billing-middleware.test.js` [MODIFY] — Appended 9 focused unit tests verifying correct enforcement, scope resolution, exclusions, and fail-closed logic.

## Automated Verification Results

Command:
```bash
npm run qa:identity:unit
```

Output:
```
> trackiq@1.0.0 qa:identity:unit
> node --test api/tests/identity-resolution.test.js api/tests/billing-middleware.test.js

[validateSiteKey] LOUD WARNING: sites.attribution_window_days or cross-domain columns do not exist in database. Falling back to default values.
▶ validateSiteKey Billing Customer Regression Tests
  ✔ Requirement 1: primary SELECT includes stripe_customer_id (1.089792ms)
  ✔ Requirement 2: fallback SELECT also includes stripe_customer_id (0.515417ms)
  ✔ Requirement 3: req.site.stripe_customer_id is set when database returns it (0.151ms)
  ✔ Requirement 4: req.site.stripe_customer_id is null when database value is missing/null (0.195833ms)
...
▶ checkSiteCreationLimit - plan site limit enforcement helper
  ✔ free/new user with 0 active sites can create first site (0.492166ms)
  ✔ free user with 1 active site is blocked (0.152792ms)
  ✔ growth plan allows below limit (0.12925ms)
  ✔ growth plan blocks at limit (0.099708ms)
  ✔ scale/unlimited plan is not blocked (0.102ms)
  ✔ archived-plan sites are excluded if using plan != archived (0.096125ms)
  ✔ company scope is preferred over owner scope (0.094958ms)
  ✔ owner scope works when company_id is missing (0.110125ms)
  ✔ DB query error fails closed (0.512125ms)
✔ checkSiteCreationLimit - plan site limit enforcement helper (2.67325ms)
...
ℹ tests 42
ℹ suites 0
ℹ pass 42
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 373.94625
```

## Static Launch & Security Audits

All syntax and build checks successfully passed:
- `npm run qa:tracker:unit` — PASS
- `npm run qa:attribution:unit` — PASS
- `npm run qa:env-safety` — PASS
- `npm run qa:static` — PASS (includes production Vite build)
