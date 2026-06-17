# Stripe Test-Mode E2E Checklist — Session 140X

**Status:** READY TO RUN — staging prerequisites met
**Date:** 2026-06-17
**Session:** 140X
**Supersedes:** `billing_checkout_test_mode_qa.md` operator checklist section

---

## 0. Staging Prerequisites (Verify Before Starting)

All must be true before running the E2E:

| Prerequisite | Required value | Evidence status |
|---|---|---|
| Staging `STRIPE_SECRET_KEY` | Present, test mode (`sk_test_...`) | ✅ PASS — confirmed 140G-22 |
| Staging `STRIPE_WEBHOOK_SECRET` | Present, test mode (`whsec_...`) | ✅ PASS — confirmed 140G-22; rotated after 139J-R exposure |
| Staging Stripe price catalog | $29/$79/$149, `pv_limit` metadata present | ✅ PASS — confirmed 140G-22 |
| Staging env vars — canonical names | `STRIPE_PRICE_ID_GROWTH` / `_SCALE` missing but resolved via legacy fallback (`STRIPE_PRICE_ID_PRO` / `_AGENCY`) | ⚠️ Works, P2 hygiene |
| Test account on Free or Trial plan | Must not already have `stripe_customer_id` | Verify in Supabase staging before starting |
| Stripe CLI installed | For webhook forwarding | Must be installed locally before Step 3 |
| Staging API URL | `https://sourcetrack-api-staging.up.railway.app` | Confirm with `curl /health` |

---

## 1. Test Flow

Run all steps in order. Mark each step with the result and any relevant evidence (event IDs, DB values — do not paste secrets).

---

### Phase 1 — Billing UI Pre-Checkout

**Step 1.1 — Open `/billing` as a Free/Trial account**

- [ ] Navigate to `https://sourcetrack-dashboard-staging.up.railway.app/billing`
- [ ] Confirm plan cards are visible (shows "Available Plans" section)
- [ ] Confirm Starter shows `$29/mo billed monthly`
- [ ] Confirm Growth shows `$79/mo billed monthly`
- [ ] Confirm Scale shows `From $149/mo billed monthly`
- [ ] Confirm beta note is visible: "Plans are billed monthly during public beta..."
- [ ] Confirm Terms checkbox is unchecked
- [ ] Confirm all three Upgrade buttons are visually disabled (reduced opacity)

**Step 1.2 — Verify terms checkbox gates checkout**

- [ ] Click **Upgrade to Starter** WITHOUT checking the Terms box
- [ ] Confirm: no redirect, no network request to `/api/billing/create-checkout` (check Network tab)
- [ ] Check the Terms checkbox
- [ ] Confirm Upgrade buttons become enabled (full opacity / active appearance)

Expected behavior: `handleUpgrade` returns early when `acceptedTerms` is false. The button has `disabled` attribute. Clicking while unchecked should do nothing.

---

### Phase 2 — Checkout Session Creation

**Step 2.1 — Start Stripe CLI webhook forwarding**

> This must run BEFORE initiating checkout so the webhook is caught.

```bash
stripe listen --forward-to https://sourcetrack-api-staging.up.railway.app/api/billing/webhook
```

Copy the printed `whsec_...` signing secret. Set `STRIPE_WEBHOOK_SECRET` in the staging Railway env to this value (if it differs from the existing value). Redeploy or restart.

**Step 2.2 — Initiate Starter checkout**

- [ ] On the Billing page (Terms checked), click **Upgrade to Starter**
- [ ] Confirm `POST /api/billing/create-checkout` returns 200 with a checkout URL
- [ ] Confirm browser redirects to `checkout.stripe.com/...`
- [ ] Confirm the Stripe Checkout page shows:
  - Product name: **SourceTrack Starter**
  - Amount: **$29.00/month**
  - Mode: subscription
  - `livemode: false` (test mode)

OPERATOR-BLOCKED if Stripe CLI is not running: webhook will not be delivered and the DB will not update.

**Step 2.3 — Complete checkout with test card**

- [ ] Enter test card: `4242 4242 4242 4242`, any future expiry, any CVC
- [ ] Click **Subscribe**
- [ ] Confirm browser redirects to `https://sourcetrack-dashboard-staging.up.railway.app/billing?upgrade=success`

---

### Phase 3 — Webhook + DB Verification

**Step 3.1 — Confirm `checkout.session.completed` delivery**

- [ ] In the Stripe CLI terminal, confirm `checkout.session.completed` event received
- [ ] Note the event ID (do not paste the full ID in shared docs — first 12 chars is enough for reference)
- [ ] Confirm the staging API returned `200 OK` for the webhook

**Step 3.2 — Confirm DB update**

In the Supabase staging console, query the `sites` row for the test site:

```sql
SELECT id, plan, pv_limit, stripe_customer_id, stripe_subscription_id
FROM sites
WHERE site_key = '<test-site-key>';
```

- [ ] `plan` = `starter`
- [ ] `pv_limit` = `50000`
- [ ] `stripe_customer_id` populated (starts with `cus_`)
- [ ] `stripe_subscription_id` populated (starts with `sub_`)

**Step 3.3 — Confirm billing status endpoint**

```bash
curl -H "Authorization: Bearer <session-token>" \
  "https://sourcetrack-api-staging.up.railway.app/api/billing/status?site_key=<test-site-key>"
```

- [ ] `plan` = `starter`
- [ ] `limit` = `50000`
- [ ] `subscription.status` = `active` or `trialing`
- [ ] `subscription.cancel_at_period_end` = `false`

**Step 3.4 — Confirm Billing page shows paid plan**

- [ ] Reload `/billing`
- [ ] Confirm "Current Plan" section shows **Starter** with **Active** badge
- [ ] Confirm pageview usage meter shows limit of 50,000
- [ ] Confirm "Available Plans" section is no longer shown (only paid plan view)
- [ ] Confirm "Manage Subscription" button is visible

---

### Phase 4 — Growth and Scale Checkout (Optional, Recommended)

Repeat Steps 2.2–3.4 for Growth ($79/mo) and Scale ($149/mo) to confirm:

- [ ] Growth: `plan=growth`, `pv_limit=150000`
- [ ] Scale: `plan=scale`, `pv_limit=500000`

---

### Phase 5 — Billing Portal

**Step 5.1 — Open portal**

- [ ] Click **Manage Subscription** on the Billing page
- [ ] Confirm `POST /api/billing/portal` returns 200 with a portal URL
- [ ] Confirm browser redirects to `billing.stripe.com/...`
- [ ] Confirm portal shows: plan name, price, billing interval, next payment date

**Step 5.2 — Cancel subscription (set cancel at period end)**

- [ ] In the portal, cancel the subscription
- [ ] Confirm portal shows "Active until [date]" (not immediate cancellation)
- [ ] Click **Return** — confirm browser returns to `/billing`

**Step 5.3 — Confirm webhook + DB after cancellation**

In the Stripe CLI terminal:

- [ ] Confirm `customer.subscription.updated` received (with `cancel_at_period_end=true`)
- [ ] Staging API returns `200 OK`

In Supabase:

- [ ] Query `sites`: if Stripe sets `cancel_at_period_end`, plan may still show `starter` until period end
- [ ] Billing page shows the amber cancellation warning banner with the correct period-end date

**Step 5.4 — Confirm hard cancellation (optional)**

In the Stripe Dashboard (test mode), immediately cancel the subscription (bypass period end):

- [ ] Confirm `customer.subscription.deleted` received in Stripe CLI
- [ ] `sites.plan` updates to `inactive`, `pv_limit` = `0`
- [ ] Billing page shows the account is inactive / no active plan

---

### Phase 6 — Subscription Upgrade / Downgrade

With a Starter subscription active:

**Step 6.1 — Upgrade to Growth via portal**

- [ ] Open portal, change plan to Growth
- [ ] Confirm `customer.subscription.updated` received
- [ ] `sites.plan` = `growth`, `pv_limit` = `150000`
- [ ] Billing page reflects Growth

**Step 6.2 — Downgrade to Starter via portal**

- [ ] Open portal, change plan back to Starter
- [ ] Confirm `customer.subscription.updated` received
- [ ] `sites.plan` = `starter`, `pv_limit` = `50000`

---

### Phase 7 — Payment Failure Simulation

```bash
stripe trigger invoice.payment_failed
```

- [ ] Confirm `invoice.payment_failed` event delivered (Stripe CLI)
- [ ] If `attempt_count` < 3: confirm no DB change, API logs warning
- [ ] Simulate or trigger two more failures to reach `attempt_count` >= 3
- [ ] Confirm `sites.plan` = `inactive`, `pv_limit` = `0`
- [ ] Confirm `/api/collect` and `/api/conversion` return `402` (tier check enforced)

---

### Phase 8 — Idempotency and Security

**Step 8.1 — Duplicate event replay**

```bash
stripe events resend <evt_id from Step 3.1>
```

- [ ] Staging API receives the replayed event
- [ ] Billing handler logs `duplicate Stripe event ... skipping`
- [ ] No double-apply to the `sites` row (plan/pv_limit unchanged)
- [ ] Returns `200 { received: true, duplicate: true }`

**Step 8.2 — Invalid signature rejection**

```bash
curl -X POST https://sourcetrack-api-staging.up.railway.app/api/billing/webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=123,v1=fakesignature" \
  -d '{"type":"checkout.session.completed","data":{"object":{}}}'
```

- [ ] Response: `400 { error: 'Invalid webhook signature' }`
- [ ] No DB mutation

**Step 8.3 — Missing signature header**

```bash
curl -X POST https://sourcetrack-api-staging.up.railway.app/api/billing/webhook \
  -H "Content-Type: application/json" \
  -d '{"type":"checkout.session.completed"}'
```

- [ ] Response: `400 { error: 'Missing stripe-signature' }`

**Step 8.4 — Redirect allowlist enforcement**

```bash
curl -X POST https://sourcetrack-api-staging.up.railway.app/api/billing/create-checkout \
  -H "Authorization: Bearer <session-token>" \
  -H "Content-Type: application/json" \
  -d '{"plan":"starter","successUrl":"https://evil.com/steal","cancelUrl":"https://app.sourcetrack.ai/billing","accepted_terms":true,"site_key":"<test-key>"}'
```

- [ ] Response: `400 { error: 'Invalid successUrl redirect target' }`
- [ ] No checkout session created

---

### Phase 9 — Final State Verification

- [ ] Call `GET /api/billing/status` — confirm final plan + limit is accurate
- [ ] Load `/billing` — confirm UI reflects the database state
- [ ] No secrets, tokens, full Stripe IDs, or card numbers printed in logs, docs, or chat
- [ ] No production database touched at any point (confirm by checking Supabase project ref — must be `nrsvpwzekfrdrzkoecfk`, not `zxjjjsipafojhzkkumvh`)

---

## 2. Evidence to Record

When all steps pass, record the following as the E2E closure evidence:

| Evidence item | Notes |
|---|---|
| `checkout.session.completed` event ID (partial) | First 10 chars only |
| Before/after `sites` row (plan, pv_limit, customer_id) | No full IDs |
| `GET /api/billing/status` response (plan, limit, subscription.status) | Full response body fine |
| Browser screenshot of Billing page on paid plan | No card numbers, no secrets |
| Browser screenshot of Stripe Checkout showing correct price | Crop card number area |
| Browser screenshot of Stripe portal return to `/billing` | |
| Cancellation warning banner screenshot | |
| Invalid signature → 400 response | |
| Duplicate replay → `duplicate: true` response | |

---

## 3. Known Gaps (Not Blocking E2E Closure)

| Gap | Severity | Notes |
|---|---|---|
| Staging uses legacy env var names (`STRIPE_PRICE_ID_PRO`/`_AGENCY`) not canonical (`GROWTH`/`SCALE`) | P2 | Billing.js fallback resolves correctly. Update when convenient. |
| In-memory idempotency cache (NodeCache) doesn't survive restarts | P2 | Stripe retries 4h+ after; practically harmless for single-instance staging. |
| Staging schema gaps (`claim_site_conversion_usage` may be missing) | P1 | Limits fail-open. Does not block billing E2E but blocks enforcement verification. |
| PostHog shared between staging and production | P2 | Analytics cross-contamination only. |

---

## 4. OPERATOR-BLOCKED Steps

The following steps require human operator access to Stripe Dashboard / Stripe CLI:

- Stripe CLI installation and webhook forwarding (Phase 2 Step 2.1)
- Stripe Dashboard test-mode cancel / immediate cancel (Phase 5 Step 5.4)
- Payment failure trigger via CLI (Phase 7)
- All DB verification steps in Supabase staging console (Phase 3 Step 3.2)
- Production equivalent of all above after production keys are set

---

*Generated by Session 140X. Do not paste Stripe signing secrets, secret keys, or full event IDs into this document.*
