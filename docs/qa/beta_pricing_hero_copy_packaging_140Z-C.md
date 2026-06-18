# Beta Pricing + Hero Copy Packaging Lock — Session 140Z-C

**Status:** Plan locked. No code changes made. No commit. No push.
**Date:** 2026-06-18
**Session:** 140Z-C

---

## 1. Final Hero Copy

### Headline (h1 + h1Gradient split)

```
Know which sources actually make you money.
```

> Implementation note: split as `h1: "Know which sources actually"` + `h1Gradient: "make you money."` — matches the existing HeroSection component's two-part heading pattern.

### Sub-copy (p tag under h1)

```
SourceTrack connects leads and revenue back to campaigns, AI referrals, SEO pages,
search queries, forms, bookings, and customer journeys — so you can stop guessing
and scale the right channels.
```

### Current live copy (for diff reference)

| Part | Current | New |
|---|---|---|
| h1 | "Know which sources actually" | "Know which sources actually" (unchanged) |
| h1Gradient | "create revenue." | "make you money." |
| sub | "SourceTrack is simple revenue attribution software for founders, marketers, ecommerce stores, agencies, and lead-gen teams. See which campaigns, AI referrals, search terms, forms, bookings, and customer journeys turn into leads and revenue — without a heavy analytics stack." | New sub above |
| primaryCta | "Start tracking free" | "Find my best sources" |
| secondaryCta | "View product" | "See where to spend next" |

---

## 2. Final CTA Copy

| Element | Copy |
|---|---|
| Primary CTA (button, green) | **Find my best sources** |
| Secondary CTA (button, dark) | **See where to spend next** |
| Hero proof strips | "Install with one script or GTM" · "First month free — beta pricing" · "Built for founders and marketers" |

> The proof strip copy changes: remove "Track 30 attributed conversions free" (tied to old free-plan framing) and replace with "First month free — beta pricing" to signal the founding offer.

---

## 3. Beta Pricing Table

| Plan | Post-Beta Price (anchor) | Beta Price | Public metric |
|---|---|---|---|
| Starter | ~~$29/mo~~ | **$9/mo** | 25,000 tracked visits/mo |
| Growth | ~~$49/mo~~ | **$19/mo** | 100,000 tracked visits/mo |
| Scale | ~~$99/mo~~ | **$49/mo** | 500,000 tracked visits/mo |

**Strikethrough framing rule:** Anchors ($29/$49/$99) must be labelled "after beta" or "normal price" — never shown naked as a crossed-out inflated price with no explanation. Example:
```
$9/mo
~~$29/mo~~ normal price · limited beta offer
```

### Current live marketing prices vs. beta target

| Plan | Current PricingCards.jsx | Current Billing.jsx (Stripe-aligned) | Beta target |
|---|---|---|---|
| Starter | $19/mo (annual headline), $29/mo monthly | $29/mo | $9/mo |
| Growth | $49/mo (annual headline), $79/mo monthly | $79/mo | $19/mo |
| Scale | From $149/mo | From $149/mo | $49/mo |

**Key gap:** The current Stripe catalog prices ($29/$79/$149) are higher than the proposed post-beta anchors ($29/$49/$99). This means the post-beta anchor for Growth ($49) is lower than the current Stripe Growth price ($79). The implementation session (140Z-D) must handle this without creating a truth gap: **do not display a strikethrough anchor that contradicts the live Stripe price until Stripe prices are explicitly updated.**

Safe interim approach for 140Z-D:
- Show beta prices ($9/$19/$49) clearly marked as "beta pricing"
- Do NOT show strikethrough anchors in the billing UI until Stripe prices are updated to match
- On the marketing/pricing page (no direct checkout), strikethrough anchors are acceptable with "after beta" label

---

## 4. Founding Beta Offer

```
Founding Beta Deal

First month free.
Then Starter beta is $9/month.
Or lock your first year for $99.

Limited to the first 100 beta customers.
```

**Display rules:**
- Frame as a dedicated section or banner, not buried in a pricing card
- "First 100 beta customers" is the primary scarcity signal
- A real spots counter (backed by Supabase count of beta-flagged signups) may be added later
- A real deadline (manually set, operator-controlled) may be added later
- The $99/year offer requires a Stripe annual price ID — do not ship a Stripe checkout for it until that price ID exists

**What the founding offer covers:**
- Month 1: free (trial)
- Month 2+: $9/mo Starter beta
- Annual option: $99 first year (= ~$8.25/mo, saves $9 vs. 11 months of $9/mo)

---

## 5. "Tracked Visits/Month" in Public Copy vs. "Events" Internal

**Public copy:** use **tracked visits/month** (or tracked pageviews/month as fallback).

**Reason:**
- "Events" is PostHog's internal storage unit. One visitor session generates multiple events: `$pageview`, `$autocapture`, custom conversion events, etc.
- Advertising "50,000 events/mo" would mislead users into thinking they get far fewer visits than they actually do.
- "Tracked visits" maps directly to the end-user mental model: one visit = one counted unit.
- Existing billing UI and pricing cards already use "tracked pageviews/mo" — the new beta copy updates this to "tracked visits/mo" to remove the word "pageviews" which can confuse SPA users.

**Internal systems:** PostHog usage, plan quota checks, and nightly-attribution.js continue to operate on pageview event counts. The label change is copy only — no quota logic changes.

**Mapping for 140Z-D:**
| Plan | Internal limit (pageviews) | Public label |
|---|---|---|
| Starter beta | 25,000 | 25,000 tracked visits/mo |
| Growth beta | 100,000 | 100,000 tracked visits/mo |
| Scale beta | 500,000 | 500,000 tracked visits/mo |

> Note: The user-specified public limits (25K/100K/500K) differ from current Billing.jsx and Stripe metadata limits (50K/150K/500K). The implementation session must reconcile which limit is live before updating public copy. **Do not advertise 25,000 tracked visits if the enforced Stripe limit is 50,000** — this would be a truth gap in the user's favour (they get more than advertised), which is acceptable, but should be documented. If operators want to lower the enforced limit to 25K, that requires a Stripe price metadata update.

---

## 6. Truth Rules for SEO / Search-Query Wording

**Allowed:**
- "SEO pages associated with leads and revenue"
- "Search queries linked to conversions"
- "Organic search terms that drive signups"
- "See which landing pages from organic search convert"
- "Track which search terms bring qualified traffic"

**Not allowed:**
- "Know exactly which SEO keywords generated revenue" — implies person-level query tracking
- "See which keywords your customers searched before buying" — same
- "Keyword-to-customer attribution" — implies deterministic, person-level path
- "Track SEO revenue per keyword" — implies individual keyword → revenue link

**Why:** SourceTrack tracks the referring page and infers the search term from Google Search Console data (GSC integration). This is aggregate/session-level, not per-visitor. Person-level query tracking would require cookies or fingerprinting, which violates SourceTrack's cookieless/no-fingerprint privacy claims.

**Hero sub copy check:** The approved sub copy says "SEO pages, search queries" — ✅ this is safe. It does not claim keyword-to-revenue attribution.

---

## 7. No-Fake-Scarcity Policy

**Allowed scarcity mechanisms:**
| Type | Allowed | Condition |
|---|---|---|
| "First 100 beta customers" | ✅ | Must actually limit at 100; no silent cap removal |
| Real spots counter | ✅ | Must be backed by Supabase count of beta-flagged users |
| Real deadline | ✅ | Must be a manually set date, not auto-reset per visitor |
| "Limited beta pricing" | ✅ | Beta pricing is real and time-limited |

**Not allowed:**
| Type | Prohibited |
|---|---|
| 12-hour countdown that resets per visitor | ❌ |
| "Only 3 spots left" without real inventory | ❌ |
| Fake urgency timers of any kind | ❌ |
| "Offer expires tonight" without an actual expiry | ❌ |

**Rationale:** Fake scarcity violates FTC guidelines and user trust. SourceTrack's brand positioning is transparency and honesty (cookieless, no fingerprinting, truthful attribution). Fake urgency contradicts that positioning.

---

## 8. Marketing Site Implications

Files requiring changes in Session 140Z-D:

| File | Change required |
|---|---|
| `dashboard/src/pages/Landing.jsx` | Update `HERO.h1Gradient` from "create revenue." → "make you money." · Update `HERO.sub` · Update `HERO.primaryCta` → "Find my best sources" · Update `HERO.secondaryCta` → "See where to spend next" · Update `HERO.proofs` |
| `dashboard/src/pages/Landing.jsx` SEO | Update `jsonLd` SoftwareApplication offers price from "0" to reflect beta pricing; remove "Free plan available" description |
| `dashboard/src/components/PricingCards.jsx` | Replace plan prices with beta prices ($9/$19/$49) · Add strikethrough anchors labelled "after beta" · Update feature limits to use "tracked visits/mo" · Remove Free plan card or reframe as "Free Trial" · Add founding beta offer card or callout |
| `dashboard/src/pages/Pricing.jsx` | Update `SEO.title` — remove "Free Forever Tier" · Update `SEO.description` · Update `HERO.sub` · Update FAQ: replace "Free forever —" with trial-framing · Update `COMPARISON_FEATURES` limits to "Tracked Visits / mo" row labels |
| `dashboard/src/pages/Pricing.jsx` | Add founding beta offer section above pricing cards |

**"Free Forever" removal locations:**
| Location | Current string | Action |
|---|---|---|
| `Pricing.jsx` SEO title | "Free Forever Tier" | Remove — change to "Simple Beta Pricing" |
| `Pricing.jsx` HERO sub | "Start free with 5,000 pageviews" | Update to trial framing |
| `Pricing.jsx` FAQ | "Free forever — see where your next 30 conversions came from." | Update to: "Free trial — first month free on Starter. Includes basic analytics and lead attribution. No journey timeline, no exports." |
| `Billing.jsx` plan status badge | "Free Forever" (line 218) | Update to "Free Trial" |

---

## 9. Billing UI Implications

The in-app Billing page (`dashboard/src/pages/Billing.jsx`) shows prices that must match Stripe. Current Stripe prices are **$29/$79/$149**.

**For Session 140Z-D:**
- Do NOT change Billing.jsx prices to $9/$19/$49 until the Stripe beta price IDs are created and configured
- Add a beta pricing explanation note: *"Beta pricing of $9/$19/$49/mo is available for new signups. Existing accounts are grandfathered at their current plan price."*
- Keep the existing $29/$79/$149 display for any existing subscribers until Stripe is updated

**For a future Stripe session (separate from 140Z-D):**
- Create new Stripe beta price IDs: Starter $9/mo, Growth $19/mo, Scale $49/mo
- Update `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_GROWTH`, `STRIPE_PRICE_ID_SCALE` env vars
- Update `PLAN_DEFAULT_LIMITS` in Billing.jsx if visit limits change (25K/100K/500K vs current 50K/150K/500K)
- Update Stripe `pv_limit` metadata on new price IDs

**Plan keys:** No plan key renaming needed. `starter`, `growth`, `scale` remain unchanged.

---

## 10. Stripe Implications

**Do not touch in Session 140Z-D:**
- Existing Stripe price IDs
- `STRIPE_PRICE_ID_STARTER`, `STRIPE_PRICE_ID_GROWTH`, `STRIPE_PRICE_ID_SCALE` env vars
- Stripe webhooks
- Any billing route in `api/`

**Required Stripe work (separate future session, not 140Z-D):**
1. Create three new monthly subscription prices in Stripe dashboard:
   - Starter beta: $9.00/mo with `pv_limit` metadata = `"25000"` (or `"50000"` if keeping current enforcement limit)
   - Growth beta: $19.00/mo with `pv_limit` metadata = `"100000"` (or `"150000"`)
   - Scale beta: $49.00/mo with `pv_limit` metadata = `"500000"`
2. Update Railway env vars with new price IDs
3. Verify checkout → webhook → plan update flow with new prices in staging
4. Only then update Billing.jsx to show beta prices

**Annual price ($99/year for Starter):**
- Requires a separate Stripe annual price ID: $99.00/year recurring
- Do not advertise the $99/year offer with a working checkout button until this price ID exists
- May display as "coming soon" in Session 140Z-D

---

## 11. Docs Implications

| File | Change required |
|---|---|
| `docs/pricing_plan_limits_audit.md` | Update plan limits table to reflect beta prices and new tracked-visits labels |
| `docs/paid_beta_go_no_go_master_audit.md` | Add a note that beta pricing lock has been documented (Session 140Z-C) |
| Any docs mentioning "Free forever" | Search and update to trial framing |
| `README.md` | If it references plan prices, update |

**New doc to create in 140Z-D:**
- `docs/beta_pricing_founding_offer.md` — customer-facing description of beta pricing, founding offer terms, and how the $99/year option works once Stripe is updated

---

## 12. Required Next Implementation Session

### Session 140Z-D — Implement Beta Pricing + Hero Copy UI

**Scope:**
1. Update `dashboard/src/pages/Landing.jsx` hero: h1Gradient, sub, primaryCta, secondaryCta, proofs
2. Update `dashboard/src/components/PricingCards.jsx`: beta prices, tracked-visits labels, founding beta offer callout, remove/reframe Free Forever
3. Update `dashboard/src/pages/Pricing.jsx`: SEO title/desc, hero sub, FAQ free-plan answer, "Free Forever Tier" removal, add founding beta offer section
4. Update `Billing.jsx` line 218: "Free Forever" → "Free Trial"
5. Add beta pricing note to Billing.jsx available-plans section
6. Do NOT change Stripe price IDs or billing API
7. Do NOT add fake countdown timers
8. Do NOT claim exact SEO keyword revenue attribution
9. Verify with `npm run qa:static` passing, no whitespace errors in diff

**Not in scope for 140Z-D:**
- Creating Stripe beta price IDs
- Changing Stripe env vars
- Changing plan enforcement logic in `api/`
- Lowering tracked-visit limits in Supabase/PostHog
- Building the real beta spots counter

---

## 13. Exact Files Inspected

| File | What was checked |
|---|---|
| `dashboard/src/pages/Landing.jsx` | Full file — current hero copy, SEO, structured data |
| `dashboard/src/components/HeroSection.jsx` | Full file — hero component structure |
| `dashboard/src/components/PricingCards.jsx` | Full file — PLANS array, prices, features, subprice labels |
| `dashboard/src/pages/Pricing.jsx` | Full file — SEO title, hero, comparison table, FAQ |
| `dashboard/src/pages/Billing.jsx` | Lines 1–80 — PLAN_DEFAULT_LIMITS, PLANS prices, plan status badge |
| `dashboard/src/lib/billing.js` | Full file — plan label map, isPaidPlan logic |
| `docs/qa/stripe_public_beta_pricing_truth_140W.md` | Lines 1–80 — Stripe price truth history, current Stripe prices |
| `dashboard/src/components/MarketingFooter.jsx` | via grep — footer revenue attribution tagline |
| `dashboard/src/pages/Onboarding.jsx` | via grep — Free Trial label reference |
| `dashboard/src/pages/Leads.jsx` | via grep — plan badge labels |
| `SESSION_HANDOFF.md` | via grep — history of copy decisions, SEO-2 hero change record |
| `docs/seo/marketing_site_copy_audit_2026-06-16.md` | via grep — SEO copy audit notes |
| `docs/paid_beta_go_no_go_master_audit.md` | via grep — conversion cap and limits context |
| `docs/qa/billing_status_fix_and_ui_139J-B.md` | via grep — "Free / Free Forever" badge reference |

**Grep patterns used:**
```
Know which|sources actually|make you money|create revenue|double down|where to spend next|
Free forever|Free Trial|Starter|Growth|Scale|\$9|\$19|\$29|\$49|\$79|\$99|\$149|
events/month|tracked visits|pageviews|AI referrals|SEO keywords|search queries
```

---

## 14. Validation Output

```
$ git diff --check
(no output — no whitespace errors)

$ npm run qa:secrets
PASS — No active credentials, secrets, or tracked env files detected.

$ npm run qa:env-safety
PASS — No active credentials, secrets, or tracked env files detected.

$ npm run qa:static
✅ Forbidden copy/API grep checks passed (no forbidden strings in user-facing code).
✅ Route mount checks passed.
✅ Security & plan scoping checks passed.
PASS — static launch QA passed

$ git status --short --untracked-files=all
?? docs/qa/beta_pricing_hero_copy_packaging_140Z-C.md
```

All checks pass. This file is the only untracked change.

---

## 15. Raw Diff

```diff
diff --git a/docs/qa/beta_pricing_hero_copy_packaging_140Z-C.md b/docs/qa/beta_pricing_hero_copy_packaging_140Z-C.md
new file mode 100644
index 0000000..{new}
--- /dev/null
+++ b/docs/qa/beta_pricing_hero_copy_packaging_140Z-C.md
@@ -0,0 +1,{N} @@
+# Beta Pricing + Hero Copy Packaging Lock — Session 140Z-C
... (this file)
```

No source files were modified.

---

## 16. Git Status

```
On branch main
Untracked files:
  (use "git add <file>..." to include in what will be committed)
        docs/qa/beta_pricing_hero_copy_packaging_140Z-C.md

nothing added to commit but untracked files present
```

---

## Summary

| Item | Decision |
|---|---|
| Hero h1Gradient | "make you money." |
| Hero sub | "SourceTrack connects leads and revenue back to campaigns, AI referrals, SEO pages, search queries, forms, bookings, and customer journeys — so you can stop guessing and scale the right channels." |
| Primary CTA | "Find my best sources" |
| Secondary CTA | "See where to spend next" |
| Starter beta | $9/mo (anchor: ~~$29/mo~~ after beta) |
| Growth beta | $19/mo (anchor: ~~$49/mo~~ after beta) |
| Scale beta | $49/mo (anchor: ~~$99/mo~~ after beta) |
| Founding offer | First month free, then $9/mo; or $99 first year; first 100 customers |
| Scarcity | First 100 customers only — no countdown timers |
| SEO wording | "SEO pages, search queries" — never "SEO keywords" or person-level keyword attribution |
| Public limit label | "tracked visits/month" — never "events/month" |
| Free Forever | Remove from public copy; replace with "Free trial" framing |
| Stripe prices | Do not change until a dedicated Stripe session explicitly approved |
| Next session | 140Z-D — Implement Beta Pricing + Hero Copy UI |
