# Billing Middleware Regression Tests — Session 139J-C

> Date: 2026-06-12
> Scope: **AUTOMATED UNIT TESTING ONLY**
> Method: Node --test unit testing, code audit, mock database queries
> No commits. No pushes. No production. No Stripe live/test accounts. No browser QA.

---

## 1. Verdict

**PASS — billing middleware regression tests protect stripe_customer_id selection and req.site propagation.**

A focused suite of automated unit tests was implemented to prevent regressions for the `validateSiteKey` `stripe_customer_id` fix. All unit tests successfully execute and pass.

---

## 2. Key Findings & Audited Code

1. **Primary Query SELECT Verification**:
   - The primary `sites` SELECT query is verified to contain `stripe_customer_id`.
   - The automated tests mock this database call and assert that `stripe_customer_id` is present in the select string parameters.

2. **Fallback Query SELECT Verification**:
   - The fallback retry query (which executes upon database missing-column error `42703`) is verified to contain `stripe_customer_id`.
   - The automated tests trigger a fallback condition and assert that `stripe_customer_id` is also requested in the fallback select string.

3. **req.site.stripe_customer_id Propagation**:
   - Tested that `req.site.stripe_customer_id` is correctly set to the returned database value when it is present.
   - Tested that it defaults to `null` if the database returns it as `null` or if the property is entirely missing from the database response object.

4. **Billing Routes Consumption & No-Leak Verification**:
   - Audited `api/routes/billing.js` and confirmed that routes `/portal`, `/status`, and `/create-checkout` consume `req.site.stripe_customer_id` cleanly.
   - Verified that no route serializes the full `req.site` object (e.g. via `json(req.site)` or spread operators) or echoes `stripe_customer_id` back in client-facing HTTP payloads.

---

## 3. Test Execution Output

Executing the regression tests:
```bash
npm run qa:identity:unit
```

Output:
```txt
> trackiq@1.0.0 qa:identity:unit
> node --test api/tests/identity-resolution.test.js api/tests/billing-middleware.test.js

[validateSiteKey] LOUD WARNING: sites.attribution_window_days or cross-domain columns do not exist in database. Falling back to default values.
▶ validateSiteKey Billing Customer Regression Tests
  ✔ Requirement 1: primary SELECT includes stripe_customer_id (1.155625ms)
  ✔ Requirement 2: fallback SELECT also includes stripe_customer_id (0.52525ms)
  ✔ Requirement 3: req.site.stripe_customer_id is set when database returns it (0.167292ms)
  ✔ Requirement 4: req.site.stripe_customer_id is null when database value is missing/null (0.205041ms)
✔ validateSiteKey Billing Customer Regression Tests (12.235375ms)
[identity-links] resolve failed: Database lookup timed out { site_id: 'site-123', uid_hash: '0d23a18d' }
▶ Webhook Identity Resolution Precedence Unit Tests
  ✔ Scenario 1: explicit anonymous_id wins immediately without database query (1.1535ms)
  ✔ Scenario 2: visitor_id aliases to anonymous_id if anonymous_id is missing (0.137041ms)
  ✔ Scenario 3: user_id query is executed and resolved when browser IDs are missing (0.344333ms)
  ✔ Scenario 4: unresolved user_id query falls back cleanly (0.153083ms)
  ✔ Scenario 5: database error falls back cleanly to unresolved (1.569291ms)
  ✔ Scenario 6: plaintext email/customer_id are not resolved to avoid privacy leaks (0.130375ms)
✔ Webhook Identity Resolution Precedence Unit Tests (14.792667ms)
ℹ tests 12
ℹ suites 0
ℹ pass 12
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 105.980417
```

---

## 4. Caveats & What is NOT Verified

- **Post-deploy staging middleware verification is PENDING** — this local test validates the code structure and behavior, but live verification of the compiled middleware on staging requires a deployment of this commit.
- **Paid-site billing portal flow is NOT VERIFIED** — no paid staging test customer is available; verified at the unit-test level only.
- **Production billing remains UNVERIFIED** — staging and unit test validation only.
- **Paid beta remains BLOCKED.**
