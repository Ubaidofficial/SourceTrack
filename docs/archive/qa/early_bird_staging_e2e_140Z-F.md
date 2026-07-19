# Early Bird Annual — Staging E2E Verification

**Status:** PASS (with known UI limitation — see §5)
**Date:** 2026-06-18
**Session:** 140Z-F
**Depends on:** 140Z-E (backend wired, CI green)

---

## 1. Final Verdict

**PASS.**

The full Early Bird annual checkout chain is verified on staging:
1. Stripe test-mode annual price created and configured ✅
2. Billing UI shows checkout button (not fallback text) ✅
3. Checkout session created with correct price, interval, and amount ✅
4. Webhook signature verified by staging API ✅
5. `checkout.session.completed` handler ran and updated DB correctly ✅
6. `sites.plan = 'starter'`, `pv_limit = 25000` confirmed post-webhook ✅
7. Staging baseline restored post-test ✅

**Known UI limitation:** `checkout.stripe.com` redirect was blocked by the Claude in Chrome extension, preventing browser-layer payment form completion. All other E2E steps verified. The checkout *session* (Stripe-side) was verified via Stripe API; the webhook E2E was verified by posting a properly HMAC-signed `checkout.session.completed` payload directly to the staging endpoint.

---

## 2. Scope

Session 140Z-F is infrastructure-only: no code changes. Work performed:

1. Create Stripe test-mode annual price ($99/year, `interval: year`, metadata `pv_limit=25000`)
2. Set `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID` in Railway staging env
3. Verify Railway redeployment pulled new env var
4. Browser E2E: Billing page shows checkout button, not fallback
5. Checkout session creation: verify Stripe test-mode, correct price and interval
6. Webhook E2E: signed payload → staging `/api/billing/webhook` → DB update
7. Restore staging baseline

**Code state:** All changes committed in `5911e20` (140Z-E) and `d1db976` (CI fix). Working tree clean at start and end of 140Z-F.

---

## 3. Stripe Test-Mode Price Setup

**Price created in Stripe test mode:**

| Field | Value |
|---|---|
| Price ID | `price_1TjfQuLZY0IPZEmw…` (truncated) |
| Product | SourceTrack Starter Corrected |
| Amount | $99.00 USD |
| Interval | `year` / `interval_count: 1` |
| `pv_limit` metadata | `25000` |
| `early_bird_annual` metadata | `true` |
| `livemode` | `False` |

**Railway staging env var set:**

```
STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID=price_1TjfQuLZY0IPZEmw…
```

Set via Railway MCP (`set_variables`) on service `SourceTrack-Api`, environment `staging`. Redeploy triggered automatically by Railway on env var change.

---

## 4. Staging API Verification

### 4.1 `/api/billing/status` confirms price ID exposed

After redeploy, staging status endpoint returned:

```json
{
  "prices": {
    "early_bird_annual": "price_1TjfQuLZY0IPZEmw…"
  }
}
```

Confirmed: `early_bird_annual` price ID is non-null — Billing UI will show checkout button, not fallback.

### 4.2 `/api/billing/create-checkout` — checkout session created

`POST /api/billing/create-checkout` with `plan: 'early_bird_annual'` returned a valid Stripe checkout session URL (`https://checkout.stripe.com/c/pay/cs_test_…`).

Stripe API verification of the checkout session:

| Field | Value |
|---|---|
| Object | `checkout.session` |
| `livemode` | `false` (test mode) |
| Mode | `subscription` |
| Payment status | `unpaid` (pre-payment) |
| Line item description | SourceTrack Starter Corrected |
| Unit amount | `9900` (= $99.00) |
| Currency | `usd` |
| Interval | `year` |
| Interval count | `1` |
| Price ID | `price_1TjfQuLZY0IPZEmw…` |

All fields match expected Early Bird annual offer. No monthly price was charged.

---

## 5. Browser E2E

### 5.1 Billing page — checkout button visible

Verified via staging dashboard: with `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID` set, the Billing page renders the "Claim founding price — $99/year" button instead of the manual email fallback. Terms checkbox present and required before button enables.

### 5.2 `checkout.stripe.com` limitation

The Claude in Chrome extension blocked the `checkout.stripe.com` redirect for safety reasons. The Stripe checkout UI could not be loaded in the instrumented browser.

**Mitigation:** The checkout session itself (Stripe-side) was verified via Stripe API call to `GET /v1/checkout/sessions/{id}` — line items, amount, interval, and price ID all confirmed correct (see §4.2).

**Payment form completion in test mode** was not achievable in this session. This is a tooling constraint, not a product defect. Manual verification in a standard browser (no extension) would show the Stripe test-mode checkout form with card number `4242 4242 4242 4242`.

---

## 6. Webhook E2E

### 6.1 Method

With `checkout.stripe.com` blocked, a real Stripe subscription was created in test mode via Stripe API to obtain a valid subscription ID. A `checkout.session.completed` payload was then crafted with the correct `client_reference_id` (staging site UUID) and `subscription` ID, HMAC-signed with the full staging `STRIPE_WEBHOOK_SECRET` (no prefix stripping), and POSTed directly to:

```
POST https://sourcetrack-api-staging.up.railway.app/api/billing/webhook
stripe-signature: t=<timestamp>,v1=<hmac>
```

### 6.2 Signing note

stripe-node v16 (`NodeCryptoProvider.computeHMACSignature`) passes the full `whsec_xxx` secret string verbatim to `crypto.createHmac('sha256', secret)`. No base64 decoding. No prefix stripping. Earlier attempts with prefix-stripped key produced HTTP 400 "Invalid webhook signature" — confirming the API validates signatures correctly.

### 6.3 Webhook response

```
HTTP 200 {"received":true}
```

### 6.4 Railway log confirmation

```
[2026-06-18T13:07:12.377103570Z] [billing] checkout complete — site 1abf1c9e-…-0d957ef → plan starter
```

Full chain confirmed:
- Webhook signature verified ✅
- `checkout.session.completed` handler fired ✅
- `stripe.subscriptions.retrieve(sub_1Tjfbv…)` called ✅
- `planFromPriceId('price_1TjfQuLZY0IPZEmw…')` → `'starter'` via `getPriceMap()` ✅
- `sites.update({ plan: 'starter', pv_limit: 25000, stripe_customer_id: 'cus_…', stripe_subscription_id: 'sub_…' })` ✅

### 6.5 Post-webhook DB state

Supabase `sites` row for test site immediately after webhook:

| Field | Value |
|---|---|
| `plan` | `starter` |
| `pv_limit` | `25000` |
| `stripe_customer_id` | `cus_Uj7r…` |
| `stripe_subscription_id` | `sub_1TjfbvLZY0IPZEmw…` |

---

## 7. Baseline Restore

After E2E complete, staging test site reset to:

```json
{ "plan": "free", "pv_limit": 5000, "stripe_customer_id": null, "stripe_subscription_id": null }
```

HTTP 204 — confirmed.

---

## 8. Validation Suite

All run against committed codebase (`d1db976`). No code changes in 140Z-F.

```
$ git diff --check           ✅ CLEAN
$ npm run qa:secrets         ✅ PASS
$ npm run qa:env-safety      ✅ PASS
$ npm run qa:static          ✅ PASS
$ npm run qa:identity:unit   ✅ 145 tests, 0 fail, 0 cancelled
```

---

## 9. Remaining Blockers

| Blocker | Priority |
|---|---|
| Production Stripe wiring (`STRIPE_SECRET_KEY`, price IDs, `STRIPE_WEBHOOK_SECRET`) | Critical |
| All open items from paid-beta go/no-go master audit (`stripe_production_wiring_checklist_140X.md`) | High |
| `checkout.stripe.com` browser test with real payment card in non-instrumented browser | Medium — hosted payment-form completion still needs manual non-instrumented browser verification before public launch |
| Signup → auto-launch checkout (direct post-signup Early Bird claim, skipping Billing page visit) | Out of scope 140Z-E; future session |
