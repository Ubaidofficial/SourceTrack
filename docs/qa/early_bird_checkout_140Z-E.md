# Early Bird Annual Checkout — Session 140Z-E

**Status:** PASS (with known blocker — Stripe price ID not yet created)
**Date:** 2026-06-18
**Session:** 140Z-E
**Public beta:** NOT READY

---

## 1. Final Verdict

**PASS with one required operator action.**

All checkout-path code is implemented, tested, and validated. The backend correctly handles `early_bird_annual` plan key, fails safely when the price ID is missing, and maps the early_bird price to `'starter'` entitlements via webhook. The Billing UI shows the Early Bird offer when the price is configured and a manual email fallback when it is not. Stripe and billing logic are otherwise untouched.

**Blocker before Early Bird checkout goes live:** Create the Stripe annual price and set `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID` in Railway.

---

## 2. Audit Findings

### 2.1 Pre-140Z-E state — what was broken

| Issue | Severity | Detail |
|---|---|---|
| Pricing page CTA `to="/signup"` — no plan intent | Medium | No plan query param; Billing page had no Early Bird option |
| `early_bird_annual` not in checkout PRICE_MAP | Critical | Plan key fell through to `|| process.env.STRIPE_PRICE_ID` — silent wrong-price charge |
| `early_bird_annual` not in webhook `getPriceMap()` | Critical | If checkout somehow ran, webhook defaulted to `'growth'` entitlements — wrong |
| No `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID` env var | High | No documented home for the new price ID |
| `/status` API not exposing `early_bird_annual` | Medium | Billing UI couldn't conditionally show offer |
| No plan key allowlist | Medium | Unknown plan keys fell back silently to legacy price |

### 2.2 Checkout truth (pre-fix)

`$99/year` automatic checkout did NOT work:
- If user sent `plan: 'early_bird_annual'` → fell back to `STRIPE_PRICE_ID` (monthly growth price) or 500
- Webhook would have set `plan = 'growth'` (wrong entitlements)
- CTA carried no plan intent anyway

---

## 3. Files Changed

| File | Change type |
|---|---|
| `.env.example` | Added `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID=` with comment |
| `api/routes/billing.js` | Export `getPriceMap` + `resolveCheckoutPrice`; early_bird_annual in webhook map + checkout PRICE_MAP; explicit plan allowlist; safe error for missing price; `/status` prices |
| `api/tests/billing-middleware.test.js` | 11 new tests for `resolveCheckoutPrice` and `getPriceMap` |
| `dashboard/src/pages/Pricing.jsx` | CTA: `/signup?plan=early_bird_annual`; label: "Start signup to claim early bird" |
| `dashboard/src/pages/Billing.jsx` | `earlyBirdPriceId` computed var; Early Bird offer section; billing note conditional on price ID |
| `dashboard/src/lib/api.js` | `createCheckout` default `planKey = 'pro'` → `'growth'` (backend still accepts `pro` as legacy alias) |
| `docs/beta_pricing_founding_offer.md` | Updated status, implementation details, required Stripe work |

**Files NOT changed:**
- `api/lib/plan-features.js` — no new internal plan type; early_bird maps to 'starter' via webhook
- Stripe env vars — untouched
- Plan enforcement middleware — untouched
- Any route beyond billing checkout and status

---

## 4. Implementation Details

### Backend: `resolveCheckoutPrice(rawPlan)`

New exported helper. Called by the checkout route before terms/auth checks.

| Input | Output |
|---|---|
| `'free'` | `{ status: 400, error: 'Invalid plan: free' }` |
| `'hacker_plan'` | `{ status: 400, error: 'Invalid plan: hacker_plan' }` |
| `'early_bird_annual'` + env not set | `{ status: 500, error: '…not yet configured. Email…' }` |
| `'early_bird_annual'` + env set | `{ priceId: 'price_xxxx', plan: 'early_bird_annual', error: null }` |
| `'starter'` + env set | `{ priceId: 'price_xxxx', plan: 'starter', error: null }` |

**Critical safety rule:** `early_bird_annual` never falls back to legacy `STRIPE_PRICE_ID`. Charging the wrong (monthly) price is worse than a clear failure.

**Legacy alias support (140Z-E fix):** `VALID_PLAN_KEYS` includes `pro`, `business`, `agency`. These are normalized via `normalizePlan` (`pro → growth`, `business → scale`, `agency → scale`) before price lookup. The `early_bird_annual` no-fallback rule is unaffected — legacy aliases are canonical plan aliases, not the early bird path.

### Backend: `getPriceMap()` (now exported)

```
STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID → 'starter'
```

The webhook `checkout.session.completed` handler calls `planFromPriceId(price.id)` which calls `getPriceMap()`. When the early_bird price ID is configured, the webhook sets `sites.plan = 'starter'` in Supabase — correct Starter entitlements, no new internal plan type needed.

### Billing UI — two states

**When `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID` is configured (`billingStatus.prices.early_bird_annual` is non-null):**
```
[Founding Offer badge]
Early Bird Annual
$99/year
Annual billing · first 10 public seats
First month free, then $99/year · Starter-level access
[Claim founding price — $99/year]   ← disabled until terms checked
```

**When price ID is not configured:**
```
[Founding Offer badge]
Early Bird Annual
$99/year
Annual billing · first 10 public seats
First month free, then $99/year · Starter-level access
Annual checkout is being configured. [Email support@sourcetrack.ai] to claim your $99/year founding price.
```

No broken checkout. No wrong price. No blank state.

### Billing UI — billing note conditional

The "Available Plans" section note below the heading is conditional on `earlyBirdPriceId`:
- **Price ID configured:** "Standard plans are billed monthly. Annual billing is available for the founding Early Bird offer."
- **Price ID missing:** "Standard plans are billed monthly. Early Bird annual checkout is being configured."

This prevents claiming annual billing is available when it is not yet wired up.

---

## 5. Test Results

```
$ npm run qa:identity:unit

ℹ tests 142   (was 131 — 11 new)
ℹ pass  142
ℹ fail  0

New tests:
✔ resolveCheckoutPrice — plan key validation
  ✔ invalid plan key is rejected with 400
  ✔ unknown plan key is rejected with 400
  ✔ null / empty plan key is rejected with 400
  ✔ early_bird_annual with price ID configured resolves priceId
  ✔ early_bird_annual without price ID returns 500 with safe error (no silent fallback)
  ✔ starter resolves to STRIPE_PRICE_ID_STARTER
  ✔ growth resolves to STRIPE_PRICE_ID_GROWTH

✔ getPriceMap — early bird annual price ID maps to starter entitlements
  ✔ early_bird price ID present in map and maps to starter
  ✔ early_bird price ID absent — not in map, does not default to growth

$ npm run qa:attribution:unit     ✅  16 pass, 0 fail
$ npm run qa:tracker:unit         ✅ 217 pass, 0 fail
$ npm run qa:secrets              ✅ PASS
$ npm run qa:env-safety           ✅ PASS
$ npm run qa:static               ✅ PASS
$ git diff --check                ✅ CLEAN (no whitespace issues)
```

**Validation grep** — zero forbidden strings in source files:
```
grep -RIn "Free Trial|Free Forever|Founding 10|..." dashboard/src api docs .env.example
→ All hits in historical QA docs only. None in dashboard/src or api/.
```

---

## 6. Checkout Truth — Post-140Z-E

| Scenario | Behavior |
|---|---|
| User clicks "Start signup to claim early bird" on pricing page | Routes to `/signup?plan=early_bird_annual` — creates free account; Signup does not auto-launch checkout; user claims Early Bird from Billing after signup |
| User on Billing page, price ID configured | Sees "Claim founding price — $99/year" button; requires terms checkbox |
| User on Billing page, price ID NOT configured | Sees fallback: "Annual checkout is being configured. Email support to claim." |
| `POST /api/billing/create-checkout` with `plan: 'early_bird_annual'` and price configured | Creates Stripe annual checkout session, returns URL |
| `POST /api/billing/create-checkout` with `plan: 'early_bird_annual'` and price missing | Returns 500: "Early bird annual checkout is not yet configured." |
| `POST /api/billing/create-checkout` with `plan: 'free'` or unknown | Returns 400: "Invalid plan: free" |
| `checkout.session.completed` webhook with early_bird price ID | Sets `sites.plan = 'starter'`, `pv_limit = 25000` |
| `customer.subscription.updated` with early_bird price ID | Same mapping via `planFromPriceId → 'starter'` |

---

## 7. Remaining Blockers

| Blocker | Priority | Notes |
|---|---|---|
| Create Stripe annual $99/year price ID | **Critical** | No checkout without it. See `docs/beta_pricing_founding_offer.md` for steps. |
| Set `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID` in Railway (test-mode) | **Critical** | Required for staging E2E |
| Staging E2E: checkout → webhook → `plan = 'starter'` | **High** | Must verify before any public announcement |
| Browser-verify Billing page shows checkout button (not fallback) | **High** | Requires price ID in staging env |
| Production Stripe wiring (`STRIPE_SECRET_KEY`, price IDs, `STRIPE_WEBHOOK_SECRET`) | **High** | All mandatory paid-beta blockers still open |

---

## 8. Public Beta Remains NOT READY

The Early Bird checkout path is fully wired at the code level. It cannot go live until the Stripe annual price ID is created and configured. Until then:
- The Billing page shows the manual fallback ("Email us to claim your founding price")
- The pricing page CTA routes to signup; users can reserve intent by signing up
- No real $99/year payments can be collected

**Public beta status: NOT READY**
