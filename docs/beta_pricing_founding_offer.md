# SourceTrack Early Bird Price Offer

**Status:** Backend wired — checkout route, webhook mapping, and Billing UI all support `early_bird_annual`. Stripe annual price ID not yet created.
**Last updated:** 2026-06-18 (Session 140Z-E)

---

## Offer Summary

```
Early Bird Price — Founding Member Offer

Lock in the lowest price we'll ever offer.

First Month Free.
Then $99/year.

Lock your first year for $99 before standard Starter pricing applies.
```

**Scarcity truth gate:**
- Public pricing page advertises **10 public early-bird seats** ("Only 10 public early-bird seats available.")
- Backend/operator allowance may support up to **25 approved accounts** for reserved/manual/invite-only customers.
- Do NOT describe this publicly as "only 10 total accounts ever" unless backend AND operator policy are both hard-capped at 10.
- The distinction: 10 seats are openly available; up to 15 additional seats may be reserved for manually approved or invited founders.

---

## Pricing Page Structure

The public pricing page (Pricing.jsx) is intentionally kept lightweight:
1. Hero
2. Early Bird Price card
3. Three standard pricing cards (Starter, Growth, Scale)
4. Short FAQ

The detailed compare-plans feature matrix was removed. Plan differences are communicated through the bullet lists inside each pricing card only. This avoids plan-truth maintenance risk and keeps the page premium and fast.

---

## Stripe-Catalog Pricing (current configured prices)

These are the prices wired to active Stripe price IDs. The public marketing cards and Billing.jsx must agree on these numbers.

| Plan | Stripe catalog price | Tracked visits/mo | Sites |
|---|---|---|---|
| Starter | $29/mo | 25,000 | 1 site |
| Growth | $79/mo | 100,000 | 3 sites |
| Scale | From $149/mo | 500,000+ | 10+ sites |

The Early Bird Price offer ($99/year) requires a new Stripe annual price ID to be created in the Stripe dashboard before automatic checkout can process payments. Until `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID` is set in the Railway environment, clicking "Claim founding price" in the Billing page shows a manual contact fallback instead of a Stripe checkout redirect.

The CTA on the public pricing page routes to `/signup?plan=early_bird_annual` with label "Start signup to claim early bird". The query param signals Early Bird intent but Signup does not yet auto-launch checkout. After completing signup, the user claims Early Bird from the Billing page. If `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID` is configured, Billing shows the checkout button; otherwise Billing shows the manual email fallback. Direct post-signup checkout auto-launch is out of scope for 140Z-E.

---

## What the Early Bird Offer Includes

- **Month 1:** First month free — basic analytics and lead source tracking, AI referral detection, and basic conversions. No journey timeline, no exports, no alerts.
- **Year 1:** Early bird annual price of $99/year (~$8.25/mo) — includes everything in Starter: leads + journey timeline, revenue attribution, CSV export, saved reports, 1 site, 25,000 tracked visits/mo.
- **Internal plan mapping:** After checkout completes, the Stripe webhook maps the early_bird_annual price ID to `'starter'` in the database (`sites.plan = 'starter'`). No separate internal plan type exists — the user receives Starter-level entitlements at annual billing cadence.
- **Annual checkout:** Requires `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID` to be set. If missing, checkout fails with a safe public error — no silent fallback to the legacy monthly price.

---

## Scarcity Rules

- **Allowed:** "Only 10 public early-bird seats available." — public copy advertises 10 seats; backend may support up to 25 approved accounts for reserved/manual/invite-only customers.
- **Allowed:** Real spots counter backed by Supabase count of early-bird-flagged accounts.
- **Allowed:** Real manually-set deadline once one exists.
- **Not allowed:** Countdown timers that reset per visitor, fake "only N spots left" without real inventory, auto-resetting urgency of any kind.

---

## Current Stripe State (as of 140Z-E)

Standard catalog prices ($29/$79/From $149) are displayed on both the public marketing pricing cards and the authenticated Billing page — aligned with active Stripe price IDs.

The Early Bird Price card shows $99/year on the public pricing page. The CTA routes to `/signup?plan=early_bird_annual`. The backend checkout route and webhook mapping are now wired and tested. The Billing page shows the Early Bird offer when `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID` is set; otherwise shows a manual email fallback.

**No Stripe annual price ID exists yet** — checkout redirects are not live.

### Required Stripe work (next session)

1. Create Stripe annual price: $99.00/year for Early Bird offer
   - Set `pv_limit` metadata = `"25000"` on the price
   - Use `interval: year` with `interval_count: 1`
2. Set `STRIPE_EARLY_BIRD_ANNUAL_PRICE_ID=price_XXXX` in Railway (test-mode first)
3. Verify checkout → webhook → `plan = 'starter'` DB update in staging
4. Browser-verify Billing page shows "Claim founding price" button (not fallback text)
5. E2E verify: complete checkout → confirm `sites.plan = 'starter'`, `pv_limit = 25000`

---

## SEO / Attribution Wording Rules

Allowed in all public copy about search:
- "SEO pages associated with leads and revenue"
- "Search queries linked to conversions"
- "Organic search terms that drive signups"

Not allowed — implies person-level keyword tracking that SourceTrack does not perform:
- Any claim of exact keyword-level revenue attribution per visitor
- Any claim of keyword-to-revenue mapping at the individual session level
- Any phrase implying SourceTrack resolves the exact search query that caused a specific conversion

---

## "Tracked Visits" vs "Events"

Public copy uses **tracked visits/month**. This is the visitor-friendly label — one visit = one counted unit.

Internal systems (PostHog quotas, nightly-attribution.js, Stripe `pv_limit` metadata) continue to operate on pageview event counts. The label change is copy only; no quota logic was changed.
