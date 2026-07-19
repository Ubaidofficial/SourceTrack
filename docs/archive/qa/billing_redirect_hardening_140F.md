# Billing Redirect Hardening QA Report — Session 140F

> Date: 2026-06-12
> Scope: **BILLING REDIRECT SECURITY HARDENING**
> Method: Code audit, security review, automated unit tests, static checks
> No commits. No pushes. No production. No Stripe live/test accounts. No browser QA.

---

## 1. Verdict

**PASS — billing redirect behavior is hardened; redirect targets are strictly validated against allowlisted dashboard/frontend origins; all unit tests pass.**

---

## 2. Brutal Audit Finding

**UNSAFE (originally)**:
* `POST /api/billing/create-checkout` accepted user-controlled `successUrl` and `cancelUrl` payloads without any verification, passing them directly to Stripe.
* `POST /api/billing/portal` fell back to `req.body.returnUrl` or `req.headers.origin` directly without checking if they pointed to safe, trusted domains.
* If a malicious client passed an external URL (e.g. `https://evil.com`), Stripe would redirect users to that target after payment or session exit, exposing the platform to Open Redirect vulnerabilities and potential phishing/session-hijack attacks.

**FIXED**:
* Introduced origin allowlist validation (`getRedirectAllowlist` and `isValidRedirectUrl`) to verify that all redirect destinations belong to legitimate dashboard/frontend domains.
* Allowlisted origins are derived from:
  1. Hardcoded canonical domains (`https://www.sourcetrack.ai`, `https://sourcetrack.ai`, `https://app.sourcetrack.ai`, `http://localhost:5173`, `http://localhost:8080`).
  2. Dynamically configured environment variables (`process.env.ALLOWED_ORIGINS`, `process.env.FRONTEND_URL`, `process.env.DASHBOARD_URL`).
* Hostnames without protocol default-allow both `http` and `https` origins for resilient environment support.
* Path segments, query parameters, trailing slashes, and protocol-relative prefixes in environment variables are dynamically normalized and stripped back to clean lowercased origins during validation to prevent false negatives.
* Invalid `successUrl` and `cancelUrl` inputs in `create-checkout` are rejected with `400 Bad Request`.
* Invalid `returnUrl` inputs in `portal` fallback to a safe, server-derived dashboard billing target (`${dashboardBaseUrl}/billing`) to ignore unsafe inputs.

---

## 3. Exact Files Changed

* api/routes/billing.js — Implemented redirect validation and helper exports
* api/tests/billing-middleware.test.js — Added unit test coverage for allowed vs disallowed redirect URLs

---

## 4. Test Execution Output

All 20 unit tests under `npm run qa:identity:unit` pass successfully:

```txt
> trackiq@1.0.0 qa:identity:unit
> node --test api/tests/identity-resolution.test.js api/tests/billing-middleware.test.js

[validateSiteKey] LOUD WARNING: sites.attribution_window_days or cross-domain columns do not exist in database. Falling back to default values.
▶ validateSiteKey Billing Customer Regression Tests
  ✔ Requirement 1: primary SELECT includes stripe_customer_id (1.062291ms)
  ✔ Requirement 2: fallback SELECT also includes stripe_customer_id (0.533ms)
  ✔ Requirement 3: req.site.stripe_customer_id is set when database returns it (0.150833ms)
  ✔ Requirement 4: req.site.stripe_customer_id is null when database value is missing/null (0.197667ms)
✔ validateSiteKey Billing Customer Regression Tests (4.452083ms)
▶ Billing Redirection Allowlist and Validation Tests
  ✔ returns correct default allowlist when no env vars are defined (0.245667ms)
  ✔ correctly incorporates ALLOWED_ORIGINS, FRONTEND_URL, and DASHBOARD_URL (0.109666ms)
  ✔ hostname-only ALLOWED_ORIGINS defaults to HTTPS only (0.098417ms)
  ✔ explicit http://localhost / http://127.0.0.1 remains allowed (1.089417ms)
  ✔ arbitrary hostname-only config does not auto-allow HTTP (0.10225ms)
  ✔ getDefaultBillingReturnUrl() validation and fallbacks (0.139042ms)
  ✔ isValidRedirectUrl identifies allowed vs disallowed targets (0.166167ms)
✔ Billing Redirection Allowlist and Validation Tests (2.531125ms)
[identity-links] resolve failed: Database lookup timed out { site_id: 'site-123', uid_hash: '0d23a18d' }
▶ Webhook Identity Resolution Precedence Unit Tests
  ✔ Scenario 1: explicit anonymous_id wins immediately without database query (1.716708ms)
  ✔ Scenario 2: visitor_id aliases to anonymous_id if anonymous_id is missing (0.166666ms)
  ✔ Scenario 3: user_id query is executed and resolved when browser IDs are missing (0.327666ms)
  ✔ Scenario 4: unresolved user_id query falls back cleanly (0.130167ms)
  ✔ Scenario 5: database error falls back cleanly to unresolved (1.458791ms)
  ✔ Scenario 6: plaintext email/customer_id are not resolved to avoid privacy leaks (0.131625ms)
✔ Webhook Identity Resolution Precedence Unit Tests (16.002125ms)
ℹ tests 20
ℹ suites 0
ℹ pass 20
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 152.2915
```

---

## 5. What is and is Not Verified

### Verified:
* Codebase security audit of `res.redirect` and URL construction (all callbacks verify safe env-driven redirect targets).
* Rejection of external/untrusted checkout redirect URLs (`successUrl` / `cancelUrl`).
* Ignore/fallback behavior of customer portal return URLs (`returnUrl` / `origin` header).
* Custom hostname support (allowing both protocols) and full URL origins.
* Environment variable configuration support for `DASHBOARD_URL`, `FRONTEND_URL`, and `ALLOWED_ORIGINS`.
* Security & Credential Grep: Scanned workspace for live-key/JWT/local-path patterns. Hits, if any, were limited to known placeholders, masked webhook-secret examples, generated webhook-secret prefixes, and historical docs references; no real secrets or local file paths were introduced by 140F.

### Not Verified:
* **Browser/live Stripe redirect behavior remains unverified** — browser E2E tests were paused.
* **Paid-site portal browser flow remains unverified** — requires staging paid customer.
* **Production billing remains unverified** — staging and unit test validation only.
* **Paid beta remains blocked.**

### Caveats:
* Operational caveat: for non-canonical staging or production dashboard domains, ALLOWED_ORIGINS must include the deployed dashboard origin. FRONTEND_URL or DASHBOARD_URL can supply the fallback return target, but that target is only used if its origin is also allowlisted or is one of the canonical defaults. Browser/live Stripe redirect behavior remains unverified while browser QA is paused.

---

## 6. Remaining Blockers

All other checklist-gate P0/P1 items remain open (e.g., Staging Schema Bootstrap, Staging Service-Role Access, Supabase Backup Restore Drill, Production Secrets).
