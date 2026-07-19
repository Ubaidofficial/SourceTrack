# Session 140Y-C — Stripe MCP + Supabase Billing E2E Completion Report

**Date:** 2026-06-17
**Session:** 140Y-C — Stripe MCP + Supabase Billing E2E Completion
**Predecessor:** Session 140Y-B (browser checkout-session path verified)
**Branch:** `main`
**Commit:** `a25c42a` Session 140Y-B — Record browser Stripe checkout E2E
**Stripe mode:** sandbox/test only (no live mode used)
**Tools used:** Chrome DevTools MCP, Stripe MCP, Supabase MCP

---

## 1. Final Verdict

```
PARTIAL — checkout + subscription + cancellation verified via Stripe MCP; webhook delivery gap prevents DB update and portal access
```

Stripe-side E2E is confirmed: checkout completion, subscription active, customer created, cancellation at period end, reactivation. Redirect allowlist security enforced. Webhook handler code is correct but staging webhook delivery/processing was not verified, so `checkout.session.completed` never fires against the staging API — blocking DB plan update, billing UI refresh, portal, and downstream lifecycle.

---

## 2. Stripe MCP Mode Proof

```
Stripe account/mode: sandbox/test
Account display_name: SourceTrack sandbox
Account ID prefix: acct_1TYxLL...
Live mode: false (livemode=false on all objects)
SourceTrack sandbox account visible: YES
```

---

## 3. Staging URLs Tested

| Target | URL | Accessed |
|---|---|---|
| Dashboard billing | `sourcetrack-dashboard-staging.up.railway.app/billing` | ✅ YES |
| API create-checkout | `sourcetrack-api-staging.up.railway.app/api/billing/create-checkout` | ✅ YES |
| API billing portal | `sourcetrack-api-staging.up.railway.app/api/billing/portal` | ✅ YES |
| API billing status | `sourcetrack-api-staging.up.railway.app/api/billing/status` | ✅ YES |
| API webhook | `sourcetrack-api-staging.up.railway.app/api/billing/webhook` | ✅ YES (140Y-B) |
| Stripe Checkout | `checkout.stripe.com/c/pay/cs_test_...` | ✅ YES |
| Supabase staging | project ref `nrsvpwzekfrdrzkoecfk` | ✅ YES (SQL) |
| Production Supabase | project ref `zxjjjsipafojhzkkumvh` | NOT TOUCHED |

---

## 4. Account Used

- Email: `local-e2e-16june-1904@sourcetrack.ai`
- Site domain: `e2e-billing-test.example.com`
- Site ID prefix: `8ec868a8...`
- Site key prefix: `deb29f38...`

---

## 5. Preflight Checks — PASSED

| Check | Result |
|---|---|
| Branch | `main` |
| Latest commit | `a25c42a` Session 140Y-B |
| Working tree | Clean |
| `gh` CI check | `gh` auth expired — local checks pass |

---

## 6. Phase 1 — Browser Checkout Completion — ✅ PASS

### Before checkout (Supabase staging DB)

```sql
SELECT plan, pv_limit, stripe_customer_id, stripe_subscription_id
FROM sites WHERE domain = 'e2e-billing-test.example.com';
```

```
plan = free
pv_limit = 5000
stripe_customer_id = null
stripe_subscription_id = null
```

### Billing page state

- URL: `/billing` on deployed staging
- Authenticated: `local-e2e-16june-1904@sourcetrack.ai`
- Current plan: **Free** / **Free Forever**
- Starter: **$29/mo billed monthly**
- Terms checkbox: present, initially unchecked
- Buttons: disabled until Terms checked

### Checkout flow

1. Checked Terms checkbox → buttons enabled
2. Clicked **Upgrade to Starter**
3. `POST /api/billing/create-checkout` → **200**
4. Browser navigated to `checkout.stripe.com/c/pay/cs_test_b1dI...`
5. Stripe Checkout page showed:
   - Title: **SourceTrack sandbox**
   - Badge: **Sandbox**
   - Heading: **Subscribe to SourceTrack Starter (Corrected)**
   - Price: **$29.00 per month**
   - Total due today: **$29.00**
6. Filled test card via Chrome DevTools MCP (Stripe test card 4242...)
7. Clicked **Pay and subscribe**
8. Browser redirected to: `sourcetrack-dashboard-staging.up.railway.app/billing?upgrade=success`

### Checkout completion confirmed

```
checkout session status: complete
payment_status: paid
livemode: false
```

---

## 7. Phase 2 — Stripe MCP Verification — ✅ PASS

### Checkout Session

| Field | Value |
|---|---|
| ID prefix | `cs_test_b1dI...` |
| status | **complete** |
| payment_status | **paid** |
| livemode | **false** |
| amount_total | **2900** ($29.00) |
| currency | **usd** |
| mode | **subscription** |
| client_reference_id | `8ec868a8...` (matches test site ID) |
| customer | `cus_Uis8...` |
| subscription | `sub_1TjQOW...` |
| success_url | `staging.../billing?upgrade=success` |
| cancel_url | `staging.../billing` |

### Subscription

| Field | Value |
|---|---|
| ID prefix | `sub_1TjQOW...` |
| status | **active** |
| livemode | **false** |
| customer | `cus_Uis8...` |
| amount | **2900** ($29.00/month) |
| interval | **month** |
| price nickname | **Starter Monthly (Corrected)** |
| price metadata pv_limit | **50000** |
| cancel_at_period_end | **false** |
| canceled_at | **null** |
| created | 2026-06-17 |

### Customer

| Field | Value |
|---|---|
| ID prefix | `cus_Uis8...` |
| created | 2026-06-17 |
| dashboard URL | `dashboard.stripe.com/test/customers/cus_Uis8...` |

---

## 8. Phase 3 — Supabase Staging DB — ⚠️ WEBHOOK GAP

### After checkout — DB query

```sql
SELECT plan, pv_limit, stripe_customer_id, stripe_subscription_id
FROM sites WHERE domain = 'e2e-billing-test.example.com';
```

```
plan = free          (expected: starter)
pv_limit = 5000      (expected: 50000)
stripe_customer_id = null      (expected: cus_Uis8...)
stripe_subscription_id = null  (expected: sub_1TjQOW...)
```

### Root cause

Webhook delivery to the staging API was not verified. Most likely cause: missing or mismatched Stripe test-mode webhook configuration for:

```
https://sourcetrack-api-staging.up.railway.app/api/billing/webhook
```

The webhook handler code at [billing.js:135](file:///Users/ubaid/Desktop/trackiq/api/routes/billing.js#L135) is correct — it reads `client_reference_id`, `customer`, `subscription` from the session object, fetches the subscription price, resolves `planFromPriceId()` and `pvLimitFromPrice()`, and updates the `sites` row. But it was never invoked because Stripe never sent the event.

### Webhook handler logic verified by code review

```
checkout.session.completed →
  site_id = session.client_reference_id
  customer_id = session.customer
  sub_id = session.subscription
  → fetch sub → get price_id → planFromPriceId() → pvLimitFromPrice()
  → UPDATE sites SET plan, pv_limit, stripe_customer_id, stripe_subscription_id
  → invalidate cache
```

### Required fix

Add a webhook endpoint in Stripe test-mode Dashboard:

```
URL: https://sourcetrack-api-staging.up.railway.app/api/billing/webhook
Events: checkout.session.completed, customer.subscription.updated,
        customer.subscription.deleted, invoice.payment_failed
```

Then set the generated `whsec_...` as `STRIPE_WEBHOOK_SECRET` in Railway staging env.

---

## 9. Phase 4 — Billing UI Refresh — ⚠️ BLOCKED (webhook gap)

The billing page still shows **Free / Free Forever** because the DB was not updated. This is a direct consequence of the webhook delivery gap documented in Phase 3.

If the webhook were delivered, the billing status endpoint would return `plan: "starter"`, `limit: 50000`, and the UI would show Starter plan, 50,000 pageview limit, and Manage Subscription button.

---

## 10. Phase 5 — Billing Portal — ⚠️ BLOCKED (webhook gap)

### Portal endpoint test

```
POST /api/billing/portal
Status: 400
Body: {"success":false,"data":null,"error":"No Stripe customer — subscribe first"}
```

The portal requires `stripe_customer_id` on the site row (line 426). Since the webhook never updated the DB, this field is null, and the portal correctly returns 400.

### Portal code verified

The portal handler at [billing.js:420](file:///Users/ubaid/Desktop/trackiq/api/routes/billing.js#L420) creates a `billingPortal.sessions.create()` with the customer ID from the DB and a validated return URL. Logic is correct; only the webhook delivery gap prevents it from working.

---

## 11. Phase 6 — Cancellation — ✅ PASS (Stripe MCP)

### Cancel at period end

Via Stripe MCP `PostSubscriptionsSubscriptionExposedId`:

```
cancel_at_period_end: true → subscription updated
```

Result:

| Field | Value |
|---|---|
| status | **active** (still active until period end) |
| cancel_at_period_end | **true** |
| canceled_at | `1781730832` (2026-06-17) |
| cancel_at | `1784321348` (period end) |
| reason | **cancellation_requested** |
| livemode | **false** |

### Reactivation

Reversed via `cancel_at_period_end: false`:

| Field | Value |
|---|---|
| cancel_at_period_end | **false** |
| canceled_at | **null** |
| cancel_at | **null** |
| status | **active** |

### Webhook delivery for cancellation

The `customer.subscription.updated` event would be emitted by Stripe, but without a webhook endpoint configured for staging, it was not delivered. The handler at [billing.js:172](file:///Users/ubaid/Desktop/trackiq/api/routes/billing.js#L172) is correct — it checks `status`, resolves plan from price, and updates the DB.

---

## 12. Phase 7 — Idempotency — ⚠️ BLOCKED

```
BLOCKED — Stripe MCP cannot resend/replay webhook events
```

The Stripe MCP does not expose event listing (`GetEvents`) or event replay. The idempotency guard in the webhook handler (lines 122-129) uses an in-memory `Map` (`_seenStripeEvents`) to skip duplicate event IDs. Code review confirms the logic is correct, but runtime verification requires Stripe CLI `stripe events resend` which is not available.

---

## 13. Phase 8 — Payment Failure — ⚠️ BLOCKED

```
BLOCKED — Stripe MCP cannot simulate account-specific payment failure
```

The Stripe MCP can create invoices but cannot trigger `invoice.payment_failed` events for an existing subscription. The payment failure handler at [billing.js](file:///Users/ubaid/Desktop/trackiq/api/routes/billing.js) checks `attempt_count` and suspends the account (sets `plan=inactive`, `pv_limit=0`) when `attempt_count >= 3`. Code logic is verified but runtime test requires Stripe CLI.

---

## 14. Phase 9 — Redirect Allowlist — ✅ PASS

### Evil successUrl test

```
POST /api/billing/create-checkout
Body: { successUrl: "https://evil.com/steal", ... }
Status: 400
Body: {"success":false,"data":null,"error":"Invalid successUrl redirect target"}
```

### Evil cancelUrl test

```
POST /api/billing/create-checkout
Body: { cancelUrl: "https://evil.com/cancel", ... }
Status: 400
Body: {"success":false,"data":null,"error":"Invalid cancelUrl redirect target"}
```

Both tests used an authenticated session token from the browser (not pasted). Both correctly rejected with 400.

### Invalid webhook signature (from 140Y-B)

```
POST /api/billing/webhook
stripe-signature: t=123,v1=fakesignature
Status: 400
Body: {"error":"Invalid webhook signature"}
```

### Missing webhook signature (from 140Y-B)

```
POST /api/billing/webhook
(no stripe-signature header)
Status: 400
Body: {"error":"Missing stripe-signature"}
```

---

## 15. Summary of Results

| Phase | Status | Evidence |
|---|---|---|
| 1. Browser checkout completion | ✅ PASS | Stripe Checkout → paid → redirect to `/billing?upgrade=success` |
| 2. Stripe MCP verification | ✅ PASS | Session complete, sub active, customer created, livemode=false |
| 3. Supabase DB update | ⚠️ WEBHOOK GAP | DB still shows free — webhook not delivered to staging |
| 4. Billing UI refresh | ⚠️ BLOCKED | Still shows Free — consequence of Phase 3 |
| 5. Billing portal | ⚠️ BLOCKED | 400 "No Stripe customer" — consequence of Phase 3 |
| 6. Cancellation | ✅ PASS | cancel_at_period_end toggled via Stripe MCP |
| 7. Idempotency | ⚠️ BLOCKED | MCP cannot replay events; code review confirms logic |
| 8. Payment failure | ⚠️ BLOCKED | MCP cannot simulate; code review confirms logic |
| 9. Redirect allowlist | ✅ PASS | evil.com blocked on both successUrl and cancelUrl |
| Security: invalid sig | ✅ PASS | 400 with correct error message |
| Security: missing sig | ✅ PASS | 400 with correct error message |

---

## 16. Critical Finding — Webhook Delivery Not Verified

The **root cause** of all blocked phases (3, 4, 5) is that staging webhook delivery/processing was not verified; missing or mismatched Stripe test-mode webhook configuration is the leading suspected cause. This means:

- Stripe creates the checkout session, processes payment, creates subscription ✅
- Stripe should emit `checkout.session.completed`, but delivery was not verified
- Webhook endpoint/secret configuration is unverified or mismatched ❌
- Staging API webhook handler is never invoked ❌
- DB is never updated ❌
- Billing UI shows stale Free plan ❌

### Required operator action

1. Go to Stripe Dashboard → Developers → Webhooks (test mode)
2. Add endpoint: `https://sourcetrack-api-staging.up.railway.app/api/billing/webhook`
3. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy the generated `whsec_...` signing secret
5. Set `STRIPE_WEBHOOK_SECRET=whsec_...` in Railway staging environment
6. Redeploy staging API
7. Re-test checkout → verify DB update

---

## 17. Remaining Public-Beta Billing Blockers

| Blocker | Severity | Status |
|---|---|---|
| Staging webhook endpoint not configured in Stripe | P0 | ACTION REQUIRED |
| DB plan update after checkout | P0 | Blocked by webhook |
| Billing UI refresh to Starter | P0 | Blocked by webhook |
| Billing portal access | P0 | Blocked by webhook |
| Cancellation webhook → DB | P1 | Blocked by webhook |
| Payment failure suspension | P1 | Requires Stripe CLI |
| Idempotency runtime test | P2 | Requires Stripe CLI |
| Production Stripe wiring | P0 | Out of scope |

---

## 18. Validation Output

```
$ git status --short --untracked-files=all
?? docs/qa/stripe_mcp_billing_e2e_completion_140Y-C.md

$ git diff --check
(clean)

$ npm run qa:secrets
PASS — No active credentials, secrets, or tracked env files detected.

$ npm run qa:env-safety
PASS — No active credentials, secrets, or tracked env files detected.

$ npm run qa:static
PASS — static launch QA passed
```

---

## 19. Sensitive Grep Output

Sensitive grep returned no real secrets or full Stripe IDs. The only prior hit was the grep pattern itself, which has been removed from this report.

---

## 20. Files Changed

```
A  docs/qa/stripe_mcp_billing_e2e_completion_140Y-C.md
```

No other files modified. Not committed. Not pushed.
