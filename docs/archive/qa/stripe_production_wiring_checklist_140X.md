# Stripe Production Wiring Checklist — Session 140X

**Status:** OPERATOR-BLOCKED — no production Stripe credentials set
**Date:** 2026-06-17
**Session:** 140X
**Supersedes:** Parts of `stripe_public_beta_pricing_truth_140W.md` (kept for history)

---

## 0. Context

As of Session 140G-20 (verified), the Railway production service `SourceTrack-Api` has **no Stripe credentials**. All five required Stripe env vars are missing. No live checkout, no live webhook processing, no live portal is possible until the steps below are completed by the operator.

Staging (`SourceTrack-Api` staging env) has test-mode keys and a Stripe test catalog confirmed correct ($29/$79/$149 with `pv_limit` metadata) as of Session 140G-22.

---

## 1. Production Service Identity

| Field | Value |
|---|---|
| Railway project | `SourceTrack` |
| Railway service name | `SourceTrack-Api` |
| Railway environment | **production** |
| Production API domain | `https://api.srctk.com` |
| Billing webhook endpoint | `https://api.srctk.com/api/billing/webhook` |

Set all env vars below in Railway → `SourceTrack-Api` → **production** environment.

---

## 2. Required Production Env Vars

| Env var | Required value | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` | Live mode secret key. Never `sk_test_*` in production. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Signing secret from Stripe Dashboard → Webhooks → reveal. Get this after Step 3. |
| `STRIPE_PRICE_ID_STARTER` | Live price ID for $29/mo Starter | Must have `pv_limit` metadata set to `"50000"`. |
| `STRIPE_PRICE_ID_GROWTH` | Live price ID for $79/mo Growth | Must have `pv_limit` metadata set to `"150000"`. |
| `STRIPE_PRICE_ID_SCALE` | Live price ID for $149/mo Scale | Must have `pv_limit` metadata set to `"500000"`. |

Optional but recommended:

| Env var | Value |
|---|---|
| `STRIPE_PUBLISHABLE_KEY` | `pk_live_...` — only required if client-side Stripe.js is ever added |

**Do not use legacy var names** (`STRIPE_PRICE_ID_PRO`, `STRIPE_PRICE_ID_AGENCY`, `STRIPE_PRICE_ID`) for production. The billing route supports them as fallback but canonical names are required for production wiring.

---

## 3. Current Plan Prices (What Must Match Stripe)

These prices are what the Billing UI shows after Session 140W. The live Stripe products and prices must match exactly.

| Plan | Monthly price | Billing interval | PV limit | Metadata key |
|---|---|---|---|---|
| Starter | $29.00 USD | month | 50,000 | `pv_limit = "50000"` |
| Growth | $79.00 USD | month | 150,000 | `pv_limit = "150000"` |
| Scale | $149.00 USD | month | 500,000 | `pv_limit = "500000"` |

---

## 4. Operator Steps — In Order

### Step 1 — Create live Stripe products and prices

In the Stripe Dashboard → **live mode** (toggle at top of dashboard):

1. Create or verify three subscription products:
   - **SourceTrack Starter**
   - **SourceTrack Growth**
   - **SourceTrack Scale**
2. For each, create a monthly recurring price:
   - Starter: **$29.00 USD/month**
   - Growth: **$79.00 USD/month**
   - Scale: **$149.00 USD/month**
3. On each price object, add metadata:
   - Key: `pv_limit`
   - Values: `"50000"` / `"150000"` / `"500000"` respectively
4. Copy each live-mode price ID (`price_...`). You will need all three.

### Step 2 — Set Railway production env vars

In the Railway console → `SourceTrack-Api` → production:

1. Set `STRIPE_SECRET_KEY` to the live secret key (`sk_live_...`).
2. Set `STRIPE_PRICE_ID_STARTER` to the Starter live price ID from Step 1.
3. Set `STRIPE_PRICE_ID_GROWTH` to the Growth live price ID from Step 1.
4. Set `STRIPE_PRICE_ID_SCALE` to the Scale live price ID from Step 1.
5. Do **not** set `STRIPE_WEBHOOK_SECRET` yet — retrieve it from Step 3.

### Step 3 — Configure live Stripe webhook endpoint

In the Stripe Dashboard → Developers → Webhooks → **live mode**:

1. Add endpoint: `https://api.srctk.com/api/billing/webhook`
2. Select **exactly** these events (no more, no less):
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

   > **Note:** Do NOT add `customer.subscription.created`. The billing handler does not process it — initial subscription activation is handled entirely via `checkout.session.completed`. Registering the event is harmless but unnecessary.

3. After saving the endpoint, reveal and copy the **signing secret** (`whsec_...`).
4. Set `STRIPE_WEBHOOK_SECRET` in Railway production to this value.
5. Redeploy (or the env var change triggers a restart automatically).

### Step 4 — Verify live mode billing status

After deploying with the new env vars:

1. Confirm `GET https://api.srctk.com/api/billing/status` (with valid auth) returns without 500.
2. Confirm the `prices` field in the response returns non-null IDs for `starter`, `growth`, `scale`.

### Step 5 — Live checkout smoke test

With a controlled operator test account:

1. Navigate to `/billing`.
2. Confirm plan cards show: Starter `$29/mo billed monthly`, Growth `$79/mo billed monthly`, Scale `From $149/mo billed monthly`.
3. Confirm beta billing note is visible below "Available Plans".
4. Check the Terms checkbox to enable the Upgrade buttons.
5. Click **Upgrade to Starter**.
6. Confirm redirect to `checkout.stripe.com` (not `checkout.stripe.com/test`).
7. Confirm the Stripe checkout page shows **$29.00/month** (not $19, $49, or any other amount).
8. Complete checkout with a **real card** (or a Stripe-issued test card on a live test account — but NOT `sk_test_*` in production).
9. Confirm redirect to `/billing?upgrade=success`.
10. Confirm the `sites` row now has `plan=starter`, `pv_limit=50000`, `stripe_customer_id` populated.
11. Confirm `GET /api/billing/status` returns `plan: starter`.
12. Confirm the Billing page no longer shows plan cards (switches to Current Plan view with portal button).

### Step 6 — Verify portal

From the Billing page on the upgraded account:

1. Click **Manage Subscription**.
2. Confirm redirect to `https://billing.stripe.com/...` (live portal, not test portal).
3. Confirm the portal shows the correct Starter plan and price.
4. From the portal, cancel or set cancel at period end.
5. Confirm `customer.subscription.updated` (with `cancel_at_period_end=true`) or `customer.subscription.deleted` is delivered to the webhook.
6. Confirm Billing page shows the cancellation warning banner with the period-end date.

---

## 5. Proof Required from Operator

Before claiming production billing is live, record the following (without pasting secrets):

- [ ] Railway `SourceTrack-Api` production env: var names present (values not pasted)
- [ ] Live Stripe price IDs created — mode confirmed live, amounts confirmed ($29/$79/$149)
- [ ] `pv_limit` metadata present on all three prices
- [ ] Webhook endpoint configured at `https://api.srctk.com/api/billing/webhook`
- [ ] Webhook signing secret set in Railway (value not pasted)
- [ ] Billing status endpoint returns non-null price IDs
- [ ] Live checkout shows `$29.00/month` at Stripe checkout page (screenshot, card numbers redacted)
- [ ] `checkout.session.completed` webhook delivered (event ID noted, not pasted in full)
- [ ] `sites` row updated: `plan=starter`, `pv_limit=50000`, `stripe_customer_id` populated
- [ ] Portal redirect lands on `billing.stripe.com` (not test portal)
- [ ] No Stripe secrets printed in any log, chat, doc, or CI output

---

## 6. Two Separate Webhook Routes — Do Not Confuse

| Route | Purpose | Stripe account |
|---|---|---|
| `/api/billing/webhook` | SourceTrack platform subscription billing | SourceTrack's own Stripe account |
| `/api/webhooks/stripe/:site_key` | Per-tenant conversion attribution | Customer merchants' own Stripe accounts |

Registering the wrong events on the wrong endpoint will silently drop webhook deliveries.

---

## 7. Security Warnings

- **Never use `sk_test_*` in production.** Test keys simulate charges; live keys charge real cards.
- **Never mix test price IDs with live keys.** Stripe rejects the session or creates a mismatched checkout.
- **Never log, print, or paste `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`** in chat, docs, CI logs, or error messages.
- **Never commit Stripe secrets to git.** `.env.example` has empty placeholders; values belong in Railway env only.
- **Rotate immediately** if a secret is accidentally printed. Rotate in Stripe Dashboard → regenerate → update Railway env → redeploy.

---

## 8. Remaining Blockers (as of 140X)

| Blocker | Severity | Status |
|---|---|---|
| Production `STRIPE_SECRET_KEY` not set | P0 | OPERATOR-BLOCKED |
| Production `STRIPE_WEBHOOK_SECRET` not set | P0 | OPERATOR-BLOCKED — must be set after webhook endpoint created |
| Live Stripe products + prices not created | P0 | OPERATOR-BLOCKED |
| Live checkout E2E not run | P0 | OPERATOR-BLOCKED |
| Live portal cancel/downgrade not verified | P1 | OPERATOR-BLOCKED |
| Staging canonical env var names (GROWTH/SCALE) missing — legacy PRO/AGENCY used | P2 | Works via fallback; update when convenient |
| Terms/Privacy are beta-only notices, not lawyer-reviewed | P0 | Legal/policy gate still open |
| Sites/team-member limit backend enforcement (UI-only gates) | P1 | Code work required before self-serve public |
| In-memory webhook idempotency (doesn't survive restarts) | P2 | Low risk for beta; migrate to DB before scaling |
| Marketing pricing pages (`PricingCards.jsx` etc.) still show $19/$49 | P1 | Not connected to checkout; fix before public marketing launch |

---

*Generated by Session 140X. Do not write Stripe secret values into this file.*
