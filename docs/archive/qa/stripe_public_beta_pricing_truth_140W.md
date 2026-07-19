# Stripe Public Beta Pricing Truth Fix — Session 140W

**Status:** Fix applied. Production Stripe wiring remains operator-blocked.
**Date:** 2026-06-17
**Session:** 140W

---

## 1. Mismatch Fixed

Prior to this session, `dashboard/src/pages/Billing.jsx` advertised annual prices as the headline
in the upgrade plan cards:

| Plan | UI displayed | Stripe catalog price | Gap |
|---|---|---|---|
| Starter | $19/mo (billed yearly) | $29/mo (monthly) | ❌ $10/mo discrepancy |
| Growth | $49/mo (billed yearly) | $79/mo (monthly) | ❌ $30/mo discrepancy |
| Scale | From $149/mo | From $149/mo | ✅ No gap |

A user clicking "Upgrade to Starter" from the billing page saw **$19/mo** in the app but
**$29/mo** at the Stripe checkout page. This was a pre-payment truth gap and a public-beta
trust blocker.

No annual Stripe price IDs exist in the catalog or in any configured env var. The annual prices
were aspirational placeholders with no backing checkout session.

---

## 2. Files Changed

| File | Change |
|---|---|
| `dashboard/src/pages/Billing.jsx` | Updated `PLANS` array to show monthly prices ($29, $79, $149). Removed "billed yearly" copy. Added beta billing truth note. |

### Files audited but NOT changed (out of scope)

| File | Reason not changed |
|---|---|
| `dashboard/src/components/PricingCards.jsx` | Marketing component — CTAs go to `/signup`, not to checkout. Advertises $19/$49 as annual headline with $29/$79 as subprice. See follow-up item. |
| `dashboard/src/pages/Pricing.jsx` | Marketing page — no direct checkout path. No changes required. |
| `dashboard/src/pages/SolutionEcommerce.jsx` | Meta description references `from $19/mo`. Marketing copy, not connected to checkout. |
| `dashboard/src/pages/SolutionSaaS.jsx` | Meta description references `From $49/mo`. Same. |
| `dashboard/src/pages/SolutionLeadGen.jsx` | Meta description references `From $49/mo`. Same. |

---

## 3. Current Plan Prices Shown in Billing UI (After Fix)

| Plan | Price | Billing period | PV limit |
|---|---|---|---|
| Starter | $29/mo | billed monthly | 50,000/mo |
| Growth | $79/mo | billed monthly | 150,000/mo |
| Scale | From $149/mo | billed monthly | 500,000+/mo |

Beta billing truth note added under "Available Plans" heading:

> Plans are billed monthly during public beta. Annual billing will be added after the beta billing flow is fully verified.

---

## 4. Required Production Env Vars

These must be set in the Railway `SourceTrack-Api` **production** service before any live
checkout attempt. As of Session 140G-20, all Stripe vars are **MISSING** from production.

| Env var | Required value | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Live mode: `sk_live_...` | Never use `sk_test_*` in production |
| `STRIPE_WEBHOOK_SECRET` | Live mode: `whsec_...` | From Stripe Dashboard → Webhooks → signing secret |
| `STRIPE_PRICE_ID_STARTER` | Live price ID for $29/mo Starter | Must have `pv_limit` metadata set to `"50000"` |
| `STRIPE_PRICE_ID_GROWTH` | Live price ID for $79/mo Growth | Must have `pv_limit` metadata set to `"150000"` |
| `STRIPE_PRICE_ID_SCALE` | Live price ID for $149/mo Scale | Must have `pv_limit` metadata set to `"500000"` |

Optional but recommended:

| Env var | Value |
|---|---|
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` — needed if client-side Stripe.js is ever added |

---

## 5. Operator Steps — Production Stripe Wiring

Complete these steps in order. Each is a manual operator action; they cannot be done by code changes alone.

### Step 1 — Create live Stripe products and prices

In the Stripe Dashboard (live mode):

1. Create or verify three subscription products: **SourceTrack Starter**, **SourceTrack Growth**, **SourceTrack Scale**.
2. For each, create a monthly recurring price at the correct amount:
   - Starter: $29.00 USD/month
   - Growth: $79.00 USD/month
   - Scale: $149.00 USD/month
3. On each price, add metadata key `pv_limit` with values `"50000"`, `"150000"`, `"500000"` respectively.
4. Copy each price ID (`price_...`).

### Step 2 — Set Railway production env vars

In the Railway console → `SourceTrack-Api` → production environment:

1. Set `STRIPE_SECRET_KEY` to the live secret key (`sk_live_...`).
2. Set `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_GROWTH`, `STRIPE_PRICE_ID_SCALE` to the live price IDs from Step 1.
3. Do **not** set `STRIPE_WEBHOOK_SECRET` yet — get it from Step 3.

### Step 3 — Configure Stripe webhook endpoint

In the Stripe Dashboard → Developers → Webhooks (live mode):

1. Add endpoint: `https://api.srctk.com/api/billing/webhook`
2. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

   Note: `customer.subscription.created` is **not** in this list. The billing handler does not process it — initial subscription activation is handled entirely via `checkout.session.completed`. Registering it is harmless but generates unnecessary webhook traffic.
3. After saving, reveal and copy the **signing secret** (`whsec_...`).
4. Set `STRIPE_WEBHOOK_SECRET` in Railway production to this value.

### Step 4 — Verify live mode smoke

After deploying:

1. Confirm `GET https://api.srctk.com/api/billing/status` returns `plan` and `prices` without 500.
2. With a controlled test account, initiate a checkout for Starter via the `/billing` page.
3. At the Stripe checkout page, confirm the price shown is **$29.00/month** (not $19, not $49).
4. Complete checkout with a real card (or Stripe test card in test mode first).
5. Confirm `checkout.session.completed` webhook is received and the `sites` row updates `plan=starter`, `pv_limit=50000`, `stripe_customer_id`.
6. Confirm the Billing page reflects the new plan immediately after redirect back.

### Step 5 — Verify portal

1. From the Billing page, click "Manage Subscription".
2. Confirm redirect to `https://billing.stripe.com/...`.
3. From the portal, cancel the test subscription.
4. Confirm `customer.subscription.deleted` (or `updated` with `cancel_at_period_end=true`) is received.
5. Confirm Billing page shows cancellation warning with the correct period-end date.

---

## 6. Security Warnings

- **Never use `sk_test_*` in production.** Test keys accept any card; charges are simulated. Live keys charge real cards.
- **Never mix test price IDs (`price_1ThFC0LZY0IPZ...`) with live keys.** Stripe will reject the request or create a mismatched session.
- **Never log, print, or paste `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET` in chat, docs, or CI output.** These grant full Stripe account access.
- **Never commit Stripe secrets to git.** `.env.example` has empty placeholders; actual values live in Railway env only.
- **Rotate the staging `STRIPE_WEBHOOK_SECRET`** if it has been printed to chat or local logs (see Session 139J-R rotation note).

---

## 7. Remaining Public Beta Billing Blockers

| Blocker | Severity | Status |
|---|---|---|
| Production `STRIPE_SECRET_KEY` missing | P0 | Operator-blocked — must be set in Railway |
| Production `STRIPE_WEBHOOK_SECRET` missing | P0 | Operator-blocked — must be set after webhook endpoint created |
| Production live Stripe price catalog not created | P0 | Operator-blocked |
| `sourcetrack-health` service uses test Stripe key in production | P2 | Config hygiene — fix during prod wiring |
| Full hosted checkout E2E on staging (with seeded test data) | P0 | Not yet completed with fresh browser/network evidence |
| Billing portal E2E on staging | P1 | Redirects to Stripe portal verified; cancel/downgrade path unverified |
| Marketing pricing pages (`PricingCards.jsx`, meta descriptions) still show $19/$49 | P1 follow-up | Not connected to checkout; fix before public marketing launch |
| Annual Stripe prices don't exist | P1 follow-up | UI no longer advertises them; create only when ready |
| In-memory billing webhook idempotency cache (doesn't survive restarts) | P2 | Low risk for single-instance beta; migrate to Supabase/Redis before scaling |
| Sites/team-member count limits not enforced at API layer | P1 | UI-only gates; backend enforcement needed before self-serve public |
| Terms/Privacy are beta-only notices, not lawyer-reviewed | P0 | Legal/policy readiness gate still open |
| Staging restore drill not completed | P0 | Supabase backup gate still open |

---

*Generated by Session 140W. Do not commit Stripe secrets to this file or any doc.*
