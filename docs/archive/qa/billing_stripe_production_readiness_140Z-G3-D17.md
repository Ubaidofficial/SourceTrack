# Billing/Stripe Production Readiness Audit

**Session:** 140Z-G3-D17
**Date:** 2026-06-20
**Status:** 🚨 PARTIAL PASS / BLOCKED

## 1. Final verdict
PARTIAL PASS / BLOCKED. The billing and Stripe implementation code paths are secure and behave deterministically, but the system is not yet production-ready for paid beta. Operator-side actions are required to configure live price IDs, live webhook endpoints, test-vs-live mode separation, and customer portal settings.

## 2. What was audited
- `api/routes/billing.js`
- `api/routes/stripe-webhook.js`
- `dashboard/src/pages/Billing.jsx`
- `dashboard/src/pages/Pricing.jsx`
- `scripts/qa-release-readiness.mjs`
- `docs/release_checklist_gate.md`
- `SESSION_STATE.md`, `SESSION_LOG.md`, `SESSION_HANDOFF.md`

## 3. Stripe env/config readiness
- **Findings:** The code securely resolves price IDs from environment variables (`STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_GROWTH`, `STRIPE_PRICE_ID_SCALE`, `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID`) without hardcoding `sk_test` or `sk_live` secrets.
- **Risk:** There is no code-level mechanism to prevent a test price from accidentally being used in production. Test-vs-live mode separation relies entirely on the operator correctly setting Railway production env vars.

## 4. Checkout readiness
- **Findings:** Backend enforces a strict `VALID_PLAN_KEYS` list. `early_bird_annual` maps gracefully to `starter` limits. Validation properly handles missing or unconfigured plan prices with clear user-facing error messages instead of falling back to wrong prices. Success/cancel redirects are strictly evaluated via `isValidRedirectUrl` against a server-owned `getRedirectAllowlist()`. Stripe customer creation properly uses `stripe_customer_id` and checks site ownership. Checkout requires authenticated ownership and terms acceptance.
- **Risk:** Clean.

## 5. Webhook readiness
- **Findings:** Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, and `invoice.payment_failed` safely. Event replay deduplication uses `_seenStripeEvents` (24h cache). `invoice.payment_failed` safely waits for 3 attempts before suspending the account. All webhook payload verification happens directly using `STRIPE_WEBHOOK_SECRET` with raw bodies. Logs are clean of customer PII.

## 6. Entitlements/plan mapping readiness
- **Findings:** Price maps internal plans (starter, growth, scale, early_bird_annual). Upgrades, downgrades, and cancellations properly update `sites.plan` and `sites.pv_limit`. Express cache invalidation via `invalidateCacheByCustomerId` and `invalidateCacheBySiteId` is integrated properly. Grace-period logic for invoice failure is solid (waits for attempt count >= 3).

## 7. Billing portal readiness
- **Findings:** `POST /api/billing/portal` strictly requires authenticated site membership. Returns to safe URL via `getDefaultBillingReturnUrl`. The portal gracefully fails if the site doesn't have a Stripe customer yet.
- **Risk:** No portal access across tenants possible. Cancellation states correctly communicate that access remains active until the end of the period.

## 8. Limits enforcement readiness
- **Findings:** Free (5000 PV), Starter (50000 PV), Growth (150000 PV), and Scale (500000 PV) default limits are clearly mapped. Current usage calculates via PostgreSQL count correctly. No fake production claims. Server-side limits take precedence.

## 9. UI/UX findings
- **Findings:** `Billing.jsx` matches the Piqo-inspired simplicity. Plain-English labels ("Starter", "Growth"). It clearly shows the usage meter and limits. Banners clearly indicate trial expiry or scheduled cancellation without aggressive upselling. `Pricing.jsx` appropriately emphasizes the $99/year early bird.
- **Risk:** No heavy enterprise tables inside the app.

## 10. Docs truth findings
- **Findings:** No overclaims in docs. Pricing matches reality. Wait, there is no setup instructions in the UI that expose the webhook secret, which is correct.

## 11. Security/PII/secrets findings
- **Findings:** No raw secrets logged. `api/routes/stripe-webhook.js` securely decrypts `encrypted_stripe_webhook_secret` (if set per site) and uses `process.env.STRIPE_WEBHOOK_SECRET` for the core billing app. Idempotency guarantees prevent replay abuse.
- **Risk:** Safety scans are clean.

## 12. Test/live mode separation findings
- **Findings:** Production environment vs test environment separation relies entirely on Stripe keys.
- **Risk:** Operator must explicitly supply production secrets and live price IDs. Test and live modes are not strongly differentiated in code.

## 13. Operator actions still required
To achieve full billing PASS, the operator must complete the following in the production Stripe dashboard:
- Create live price IDs for Starter, Growth, Scale, and Early Bird Annual.
- Configure a live webhook endpoint pointing to `https://api.srctk.com/api/billing/webhook`.
- Obtain the live webhook signing secret and `sk_live_` secret key.
- Update the Railway production environment with the live keys and price IDs.
- Configure the Stripe Customer Portal settings (allowing cancellations, update payment method, etc.).
- Ensure tax and invoice receipt settings are properly configured if needed.

## 14. Exact fixes made, if any
- No code or dependency fixes were needed for the audit itself. The backend codebase securely implements the necessary billing requirements. CI whitespace fix for `end_to_end_install_qa_140Z-G3-D16D.md` was not needed as CI was already green.

## 15. Validation output
See console output logs for validation run results.

## 16. Safety grep output with classifications
See console output for safety grep run results. All findings are verified as safe env var names or historical references without exposing values.

## 17. Git status
Clean.

## 18. Whether paid beta remains NOT READY
Paid beta remains **NOT READY** until operator configures Stripe live environments and closes remaining E2E blockers.
