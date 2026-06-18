# SourceTrack Early Bird Price Offer

**Status:** Locked — Early Bird Price offer ($99/year) live in UI. Stripe annual price ID not yet configured.
**Last updated:** 2026-06-18 (Session 140Z-D, updated 140Z-D+3)

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

The Early Bird Price offer ($99/year) requires a new Stripe annual price ID before automatic checkout can honor it. Until that ID is configured, the CTA routes to `/signup` (free trial).

---

## What the Early Bird Offer Includes

- **Month 1:** First month free — basic analytics and lead source tracking, AI referral detection, basic conversions. No journey timeline, no exports, no alerts.
- **Year 1:** Early bird annual price of $99/year (~$8.25/mo) — includes everything in Starter: leads + journey timeline, revenue attribution, CSV export, saved reports, 1 site, 25,000 tracked visits/mo.
- **Annual checkout:** Requires a Stripe annual price ID to be created before a working checkout button can be offered. The CTA routes to `/signup` (free trial); annual billing is configured during or after onboarding.

---

## Scarcity Rules

- **Allowed:** "Only 10 public early-bird seats available." — public copy advertises 10 seats; backend may support up to 25 approved accounts for reserved/manual/invite-only customers.
- **Allowed:** Real spots counter backed by Supabase count of early-bird-flagged accounts.
- **Allowed:** Real manually-set deadline once one exists.
- **Not allowed:** Countdown timers that reset per visitor, fake "only N spots left" without real inventory, auto-resetting urgency of any kind.

---

## Current Stripe State (as of 140Z-D+2)

Standard catalog prices ($29/$79/From $149) are displayed on both the public marketing pricing cards and the authenticated Billing page — these are aligned with active Stripe price IDs.

The Early Bird Price card shows $99/year as the headline price. The CTA routes to `/signup` (free trial), not a Stripe annual checkout. No Stripe annual price ID exists yet.

### Required Stripe work (future session)

1. Create Stripe annual price: $99.00/year for Early Bird offer
   - `pv_limit` metadata = `"25000"`
2. Update env with `STRIPE_PRICE_ID_STARTER_ANNUAL` (or equivalent) in Railway
3. Wire early-bird annual checkout CTA to the new annual price ID
4. Verify checkout → webhook → plan-update flow in staging
5. Update `Billing.jsx` PLANS array prices once Stripe catalog prices are confirmed in production

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
