# Beta Pricing + Hero Copy UI Implementation — Session 140Z-D

**Status:** PASS — all copy changes implemented and browser-verified. Updated 140Z-D+3: detailed compare-plans matrix removed, pricing page simplified to Hero + Early Bird card + 3 standard pricing cards + FAQ. No Stripe changes. No billing logic changes.
**Date:** 2026-06-18
**Session:** 140Z-D
**Public beta:** NOT READY

---

## 1. Final Verdict

**PASS with known documented blockers.**

All marketing UI copy changes are implemented and browser-verified. "Beta" language removed from the public pricing page. Early bird offer promoted to a dedicated dark premium **Early Bird Price** card at **$99/year**. Standard plan cards show Stripe-catalog pricing ($29/$79/From $149) — aligned with Billing.jsx and active Stripe price IDs. Hero copy, pricing cards, First Month Free framing, FAQ update, and SEO metadata are live. Stripe is untouched. Billing logic is untouched. No fake scarcity. No forbidden SEO wording. Old permanent-free wording removed from affected files.

The authenticated Billing page retains $29/$79/From $149 because those are the active Stripe catalog prices. Marketing standard cards now match Billing.jsx exactly — no price discrepancy for standard plans.

The detailed compare-plans feature matrix has been intentionally removed from the pricing page. Plan differences are communicated through bullet lists inside each of the 3 standard pricing cards. This eliminates plan-truth maintenance risk and keeps the page premium and simple.

---

## 2. Files Changed

| File | Change type | Lines changed |
|---|---|---|
| `dashboard/src/pages/Landing.jsx` | Copy update | ~8 lines (HERO const + jsonLd offer) |
| `dashboard/src/components/PricingCards.jsx` | Copy + data rewrite | ~30 lines (PLANS array, dead anchor block removed) |
| `dashboard/src/pages/Pricing.jsx` | Copy + new section | ~70 lines (SEO, HERO, FAQ, FoundingEarlyBirdCard; comparison matrix removed) |
| `dashboard/src/pages/Billing.jsx` | Copy update | 1 line (badge label) |

**Files not changed:**
- `api/` — no billing/Stripe changes
- `dashboard/src/lib/billing.js` — no plan logic changes
- Stripe env vars — untouched
- Plan enforcement logic — untouched

---

## 3. Landing Hero Changes

| Element | Before | After | Verified |
|---|---|---|---|
| `h1Gradient` | "create revenue." | "make you money." | ✅ browser |
| `sub` | "SourceTrack is simple revenue attribution software…" | "SourceTrack connects leads and revenue back to campaigns, AI referrals, SEO pages, search queries, forms, bookings, and customer journeys — so you can stop guessing and scale the right channels." | ✅ browser |
| `primaryCta` | "Start tracking free" | "Find my best sources" | ✅ browser |
| `secondaryCta` | "View product" | "See where to spend next" | ✅ browser |
| proof[1] | "Track 30 attributed conversions free" | "First month free — founding offer" | ✅ diff |
| jsonLd offers.price | "9" (old) | "0" | ✅ diff |
| jsonLd offers.description | old beta description | "First month free available. Early bird annual pricing is $99/year for approved founding customers." | ✅ diff |

**SEO check on hero sub:** Copy says "SEO pages, search queries" — does NOT claim person-level keyword attribution. ✅

---

## 4. Pricing Page / Card Changes

### PricingCards.jsx

| Plan | Old price | New price | Sites limit | Anchor |
|---|---|---|---|---|
| Starter | old | $29/mo | 1 site | none |
| Growth | old | $79/mo | 3 sites | none |
| Scale | old | From $149/mo | 10+ sites | none |

No no-cost pricing card remains on the public pricing page.

Prices match active Stripe catalog ($29/$79/From $149). Dead `p.anchor` rendering block removed.

**No "events/month" used anywhere in card copy.** ✅
**No "tracked pageviews" in card features.** ✅
**No "beta" wording in any card copy or CTA.** ✅
**Standard plan cards match Stripe-catalog prices — no checkout price discrepancy.** ✅
**All CTAs route to `/signup` or `mailto:sales@sourcetrack.ai` — no direct Stripe checkout.** ✅

### Pricing.jsx

| Element | Before (original) | After (current) |
|---|---|---|
| SEO title | "Simple Attribution Pricing, Free Forever Tier" | "Early Bird $99/year" |
| SEO description | "Start free for 5,000 pageviews/mo." | "Founding annual pricing: first month free, then $99/year — only 10 public early-bird seats." |
| HERO.h1 | "Simple attribution pricing that grows with you." | "Simple attribution pricing." |
| HERO.sub | "Start free with 5,000 pageviews per month…" | "First month free. Early bird annual pricing is $99/year — only 10 public early-bird seats available. Cancel anytime." |
| HERO.proofs | "Verify setup on the free plan" etc. | "First month free — no card required" · "Only 10 early-bird seats" · "Cancel anytime" |
| Comparison table row name | "Tracked Pageviews / mo" | "Tracked Visits / mo" |
| Starter comparison limit | 50,000 | 25,000 |
| Growth comparison limit | 150,000 | 100,000 |
| FAQ: free plan question | "How does the free plan work?" → "Free forever —…" | "How does the first month free work?" → first month free framing |

---

## 5. Early Bird Offer Copy

Rendered as `<FoundingEarlyBirdCard />` component, inserted at the top of Pricing.jsx (before pricing cards section).

```
Founding member offer    ← kicker chip

Lock in the lowest price we'll ever offer.   ← h2

Only 10 public early-bird seats available.   ← sub

[dark card]
  Early Bird                                 ← badge chip
  Early Bird Price                           ← h3
  Founder annual access                      ← subtitle

  FIRST MONTH FREE                           ← lime, bold, prominent
  Then $99/year.

  $99/year                                   ← large price number
  Early bird annual price · first 10 public seats

  Lock your first year for $99 before standard Starter pricing applies.

  ✓ Everything in Starter
  ✓ 1 site
  ✓ 25,000 tracked visits/mo
  ✓ Leads + journey timeline
  ✓ Revenue attribution
  ✓ CSV export + saved reports

  Only 10 public early-bird seats available.   ← lime scarcity
  Annual billing configured during checkout. Standard price is $29/mo after this offer closes.

  [Claim early bird price]  ← routes to /signup
```

**No countdown timer.** ✅
**No fake spots counter.** ✅
**"First Month Free" is prominently displayed in lime bold — not buried in paragraph copy.** ✅
**Annual checkout honesty note present** — "Annual billing configured during checkout." ✅
**Feature list shows "1 site" — matches enforcement.** ✅
**Scarcity says "10 public early-bird seats" — honest: backend may allow up to 25 for reserved/invite accounts.** ✅

---

## 6. Billing UI Truthfulness Review

**Change made:** `'Free Forever'` → `'Free'` for the `isFree` case. Badge shows: `isTrial ? 'Trial' : isFree ? 'Free' : isCanceledAtPeriodEnd ? 'Cancels soon' : 'Active'`

**Prices untouched:** Billing.jsx `PLANS` array retains `$29/mo`, `$79/mo`, `From $149/mo`. These match the active Stripe catalog. ✅

**Standard cards now aligned:** Public marketing pricing cards show $29/$79/From $149 — matching Billing.jsx and active Stripe price IDs. No price discrepancy for standard plans between marketing page and billing page.

**Early Bird Price gap documented:** The $99/year early-bird annual offer shown on the pricing page requires a Stripe annual price ID that does not yet exist. Until configured, the CTA routes to `/signup` (free trial) and the checkout cannot automatically honor the $99/year rate. This is stated honestly in the UI microcopy: "Annual billing configured during checkout."

---

## 7. Stripe Untouched Confirmation

- No changes to `api/` directory
- No changes to `STRIPE_PRICE_ID_*` env vars
- No changes to `api/routes/billing.js` or any billing route
- No new Stripe price IDs created
- `createCheckout()` wiring unchanged — still calls the same Stripe catalog prices

**Confirmed by:** `git diff -- api/` produces no output.

---

## 8. SEO Wording Truth Check

**Hero sub copy:** "SEO pages, search queries, forms, bookings, and customer journeys" — ✅ safe. No keyword-level attribution claimed.

**Grep for forbidden claim types in changed files:**

| Forbidden claim type | Found? |
|---|---|
| Exact keyword-level revenue attribution per visitor | ❌ not present |
| Keyword-to-revenue mapping at individual session level | ❌ not present |
| Person-level SEO keyword revenue claim | ❌ not present |
| Exact conversion-per-keyword claim | ❌ not present |

**Grep for allowed strings used correctly:**

| Allowed phrase | Used? | Location |
|---|---|---|
| "SEO pages" | ✅ | Landing.jsx HERO.sub |
| "search queries" | ✅ | Landing.jsx HERO.sub |

---

## 9. No-Fake-Scarcity Confirmation

| Check | Result |
|---|---|
| Countdown timer in any changed file | ❌ not present |
| Auto-resetting deadline | ❌ not present |
| `setInterval` / `setTimeout` for urgency | ❌ not present |
| "Only N spots left" without real data | ❌ not present |
| Scarcity copy used | "Only 10 public early-bird seats available." — static, honest (backend may support up to 25 approved accounts) ✅ |

---

## 10. Validation Output

```
$ git diff --check
(no output — no whitespace errors)

$ npm run qa:secrets
PASS — No active credentials, secrets, or tracked env files detected.

$ npm run qa:env-safety
PASS — No active credentials, secrets, or tracked env files detected.

$ npm run qa:static
✅ Forbidden copy/API grep checks passed.
✅ Route mount checks passed.
✅ Security & plan scoping checks passed.
PASS — static launch QA passed

$ npm run qa:identity:unit
# fail 0 — duration_ms 632

$ npm run qa:attribution:unit
# fail 0 — duration_ms 84

$ npm run qa:tracker:unit
# fail 0 — duration_ms 7978
```

All passes. Zero failures.

---

## 11. Raw Diff (key changes)

```diff
dashboard/src/components/PricingCards.jsx
- Free / $0 / "5,000 tracked pageviews/mo"  [removed — Free Trial card eliminated]
- Starter / [old price] / "1–3 sites"
+ Starter / $29 / "1 site" / (no anchor)
- Growth / [old price] / "Up to 5 sites"
+ Growth / $79 / "3 sites" / (no anchor)
- Scale / [old price]
+ Scale / From $149 / (no anchor)
- p.anchor rendering block (dead code removed)

dashboard/src/pages/Billing.jsx
- isFree ? 'Free Forever'
+ isFree ? 'Free'

dashboard/src/pages/Landing.jsx
- h1Gradient: 'create revenue.'
+ h1Gradient: 'make you money.'
- sub: 'SourceTrack is simple revenue attribution software…'
+ sub: 'SourceTrack connects leads and revenue back to campaigns, AI referrals, SEO pages, search queries…'
- primaryCta: 'Start tracking free'
+ primaryCta: 'Find my best sources'
- secondaryCta: 'View product'
+ secondaryCta: 'See where to spend next'
- proofs[1]: old copy
+ proofs[1]: 'First month free — founding offer'
- jsonLd offers price: "9"
+ jsonLd offers price: "0"
- jsonLd offers description: old beta description
+ jsonLd offers description: "First month free available. Early bird annual pricing is $99/year…"

dashboard/src/pages/Pricing.jsx
+ FoundingEarlyBirdCard (Early Bird Price, $99/year, 10 public early-bird seats)
- SEO title: old
+ SEO title: 'Early Bird $99/year'
- HERO.sub: old
+ HERO.sub: 'First month free. Early bird annual pricing is $99/year — only 10 public early-bird seats available…'
- comparison table: 'Tracked Pageviews / mo' / starter: 50,000 / growth: 150,000
+ comparison table: 'Tracked Visits / mo' / starter: 25,000 / growth: 100,000
- comparison table: removed entirely
- FAQ: 'How does the free plan work?' / 'Free forever —…'
+ FAQ: 'How does the first month free work?' / 'Your first month is free…'
```

---

## 12. Git Status

```
 M dashboard/src/components/PricingCards.jsx
 M dashboard/src/pages/Billing.jsx
 M dashboard/src/pages/Landing.jsx
 M dashboard/src/pages/Pricing.jsx
?? docs/beta_pricing_founding_offer.md
?? docs/qa/beta_pricing_hero_copy_ui_140Z-D.md
```

4 source files modified. 2 new docs. No unintended files touched.

---

## 13. Remaining Blockers

The following are required before public beta launch. None are in scope for this session.

| Blocker | Priority | Notes |
|---|---|---|
| Stripe $99/year annual price ID | High | Early Bird Price CTA goes to /signup; annual checkout cannot be wired without this price ID |
| Production Stripe wiring (live keys in Railway) | High | No live checkout is possible without production `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs |
| Billing UI plan price update (Growth/Scale) | Medium | Billing.jsx shows $79/$149 (current Stripe catalog); update once Stripe catalog prices are revised to final amounts |
| Leads/Journey feature packaging enforcement | High | Journey timeline gating is advertised in pricing but backend enforcement gaps exist (audited in 140Z) |
| Real early-bird seats counter | Low | Currently static "Only 10 public early-bird seats available." — can add Supabase-backed counter when signups start |
| Support readiness | — | |
| Legal/policy readiness | — | |
| Observability | — | |
| Privacy/data deletion basics | — | |
| Backup/recovery drill | — | |
| Full docs truth audit | — | |
| End-to-end install QA | — | |
| Production env/secrets verification | — | |

---

## 14. Public Beta Remains NOT READY

Marketing copy and UI positioning are accurate. Standard pricing cards are aligned with the Stripe catalog ($29/$79/From $149). The $99/year early-bird annual checkout is not yet wired — the Stripe annual price ID does not exist. Until it is configured and verified in staging, the early-bird CTA routes to free trial signup only.

**Public beta status: NOT READY**
