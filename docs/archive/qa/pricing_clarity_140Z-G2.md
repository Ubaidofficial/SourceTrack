# QA Report — Pricing Page Clarity + Conversion Polish
**Session:** 140Z-G2
**Date:** 2026-06-18
**Branch:** main
**Base commit:** 6fccdb7 (Fix 140Z-G1 QA report whitespace)
**Status:** FIX VERIFIED — paid beta remains NOT READY (other blockers open)

---

## Audit Findings

### Files inspected before editing
- `dashboard/src/pages/Pricing.jsx` — main pricing page
- `dashboard/src/components/PricingCards.jsx` — plan card grid
- `dashboard/src/components/FAQSection.jsx` — shared FAQ renderer (grid layout, no logic)
- `api/routes/billing.js` — checkout, webhook handlers, cancellation
- `api/lib/plan-features.js` — limit enforcement, feature matrix

### Backend behavior verified before writing copy

| Claim | Verified source | Verdict |
|-------|----------------|---------|
| Limit enforcement = hard cutoff, no overage charges | `api/routes/track.js:268` — `claimPageviewUsage` skips events silently when limit reached; no overage billing logic | ✓ Safe to claim |
| Cancellation = access to end of billing period | `api/routes/billing.js` — `cancel_at_period_end` Stripe behavior; cancelled → plan `inactive` after period | ✓ Safe to claim |
| No automatic downgrade after Early Bird year one | `api/routes/billing.js` — renewal just fires `invoice.payment_succeeded`, no downgrade logic present | ✗ Cannot claim "$29/mo after year one" — removed |
| Attribution calculated nightly | `api/jobs/nightly-attribution.js` exists and confirmed in 140Z-G audit | ✓ Safe to claim |
| Cookieless daily-rotating hash | Confirmed in CLAUDE.md and codebase | ✓ Safe to claim |
| 22 AI referrer domains | Confirmed in 140Z-G audit and Landing.jsx | ✓ Safe to claim |
| Stripe = webhook recipe (not native OAuth app) | Confirmed — no Stripe Connect/OAuth flow in billing.js | ✓ Accurate labeling |
| Shopify = manual webhook recipe (not native app) | No Shopify app in codebase | ✓ Accurate labeling |

### Pre-edit scarcity count
"Only 10 early-bird seats" or equivalent appeared **5 times**:
1. Hero sub (`HERO.sub` line 82)
2. Hero proof pill (line 86)
3. Early Bird card section subtitle (line 20)
4. Early Bird card price meta (line 39: "first 10 public seats")
5. Early Bird card lime pill inside card (line 57)

### Pre-edit CTA inventory (inconsistent)
| Location | CTA text |
|----------|----------|
| Hero primary | "Get started" |
| Early Bird card | "Start signup to claim early bird" |
| Starter plan | "Get Starter" |
| Growth plan | "Get Growth" |
| Scale plan | "Talk to sales" |
| Nav bar | "Start free" |

---

## Changes Made

### `dashboard/src/pages/Pricing.jsx`

| # | Change | Before | After | Reason |
|---|--------|--------|-------|--------|
| 1 | Hero sub | "First month free. Early bird annual pricing is $99/year — only 10 public early-bird seats available. Cancel anytime." | "First month free, no card required. Early Bird annual access is $99 for your first year." | Removed scarcity from sub (proof pills carry it); clarified terms |
| 2 | Hero primary CTA | "Get started" | "Start free" | Consistent with nav bar CTA |
| 3 | Early Bird fine print: pricing line | "Then $99/year." | "Then $99 for your first year." | Clarifies this is a first-year price, not perpetual |
| 4 | Early Bird price meta | "Early bird annual price · first 10 public seats" | "Founding annual price" | Removed 4th scarcity mention; kept founding framing |
| 5 | Early Bird body copy | "Lock your first year for $99 before standard Starter pricing applies." | "Lock your first year for $99 before this founding price closes." | Removed unverified renewal claim ("standard Starter pricing applies" — not confirmed in Stripe config) |
| 6 | Removed lime scarcity pill | `<p class="text-st-lime ...">Only 10 public early-bird seats available.</p>` | (removed) | 5th scarcity mention — eliminated |
| 7 | Early Bird fine print: billing | "Annual billing configured during checkout. Standard price is $29/mo after this offer closes." | "Annual billing. Renewal terms are confirmed before you're charged." | Removed unverified "$29/mo after offer closes" renewal claim |
| 8 | Early Bird CTA | "Start signup to claim early bird" | "Claim early bird" | Shorter, cleaner, consistent with "Start free" pattern |
| 9 | FAQ | 6 questions | 10 questions (full replacement — see below) | Addresses purchase anxiety and plan-limit questions missing from original |

### `dashboard/src/components/PricingCards.jsx`

#### G2 initial change

| # | Change | Before | After | Reason |
|---|--------|--------|-------|--------|
| 1 | Growth plan desc | "For teams actively spending on campaigns." | "For teams running campaigns, managing multiple sites, or needing alerts and cost tracking." | More specific; matches actual plan differentiators (3 sites, cost imports, alerts) |

#### G2 addendum — Plan card feature bullets (full rewrite)

Feature matrix verified from `api/lib/plan-features.js` before writing. All bullets checked against plan gates.

**Starter (8 bullets)**

| Before | After | Reason |
|--------|-------|--------|
| "Multi-touch attribution" | "Track visits, leads, and conversions by source" | Outcome-first; explains what attribution does |
| "AI source detection (ChatGPT, Claude, Gemini, Perplexity)" | "Detect AI referrals from ChatGPT, Claude, and Perplexity" | Tighter; same meaning |
| "Lead journey timeline" | "View lead and customer journeys" | Customer included; journey is a product feature |
| _(missing)_ | "Multi-touch attribution models" | `multi_touch_attribution: starter: true` — was in plan, missing from bullets |
| _(missing)_ | "Manual conversion and event tracking" | `manual_revenue_status: starter: true` — was in plan, missing from bullets |
| "Reports and CSV export" | "Saved reports and CSV export" | "Saved" clarifies it persists |
| "1 site · 25K visits/mo" (combined) | "1 site" + "25,000 tracked visits/mo" (separate) | Clearer as separate limit lines |
| **"Revenue attribution"** | _(removed)_ | `revenue_attribution: starter: false` — was FALSE in plan-features.js; bullet was misleading |

**Growth (8 bullets)**

| Before | After | Reason |
|--------|-------|--------|
| "Everything in Starter, plus:" | "Everything in Starter" | Cleaner; "plus:" implied |
| "Revenue attribution" | "Stripe revenue tracking (webhook recipe)" | Honest label; not a native OAuth app — `revenue_attribution: growth: true` verified |
| "Google Search Console" | "Google Search Console visibility" | "visibility" clarifies what it shows |
| "Campaign cost imports" | unchanged | Accurate |
| "Alerts" | "Alerts for source and conversion changes" | Specific about what triggers alerts |
| "Advanced reporting" | "Advanced report builder and dashboard widgets" | Product-accurate language |
| "3 sites · 3 users · 100K visits" | "3 sites · 3 users" + "100,000 tracked visits/mo" | Limit lines separated; exact number |
| "Best for" line added | "Best for teams scaling campaigns, SEO, and AI referrals." | Outcome-oriented; targets the persona |

**Scale (7 bullets)**

| Before | After | Reason |
|--------|-------|--------|
| "Everything in Growth, plus:" | "Everything in Growth" | Cleaner |
| "Unlimited sites" | "Unlimited sites and team members" | `scale.sites = null, scale.members = 99` — both covered |
| "White label" | "White-label reporting" | `white_label: scale: true` verified |
| "2-year retention" | "5-year data history" | `retention_days: 1825` = 5 years — was wrong before |
| _(missing)_ | "Higher conversion event limits" | 2,500 vs Growth's 750 — verified from PLAN_STRUCTURAL_LIMITS |
| "Priority support" | "Priority support and setup guidance" | "setup guidance" reflects actual scale onboarding |
| "500K+ visits" | "500,000+ tracked visits/mo" | Exact number; explicit "/mo" |
| "Best for" line added | "Best for agencies and high-volume teams needing more sites, volume, and support." | Targets agency persona |

**All "Best for" lines added** to replace generic "For…" plan descriptions (all three cards).

#### Final truth-safety pass (post-grep review)

| File | Line | Before | After | Reason |
|------|------|--------|-------|--------|
| `dashboard/src/pages/Pricing.jsx` | 49 | `'Revenue attribution'` | `'Lead source and conversion tracking'` | Early Bird maps to Starter entitlements; `revenue_attribution: starter: false` — bullet was incorrect |
| `dashboard/src/components/PricingCards.jsx` | 39 | `'Unlimited sites and team members'` | `'Unlimited sites · up to 99 team members'` | `PLAN_STRUCTURAL_LIMITS.scale.members = 99` — members are not unlimited |

### Scarcity count after changes: **2** (section subtitle + hero proof pill)

### CTA inventory after changes
| Location | CTA text |
|----------|----------|
| Hero primary | "Start free" ✓ |
| Early Bird card | "Claim early bird" ✓ |
| Starter plan | "Get Starter" (plan-specific, intentional) |
| Growth plan | "Get Growth" (plan-specific, intentional) |
| Scale plan | "Talk to sales" ✓ |
| Nav bar | "Start free" ✓ |

### FAQ before vs after

| Before (6 questions) | After (10 questions) |
|---------------------|---------------------|
| How do I install SourceTrack? | **What counts as a tracked visit?** (new) |
| Does SourceTrack track AI referrals? | **What happens if I reach my plan limit?** (new) |
| Do I need a data analyst? | How do I install SourceTrack? |
| How does the first month free work? | Does SourceTrack track AI referrals? |
| What attribution models are supported? | How does the first month free work? |
| Can I cancel anytime? | **What happens after the Early Bird first year?** (new) |
| — | **Does SourceTrack connect to Shopify or Stripe?** (new) |
| — | **Do I need a developer?** (renamed + honest) |
| — | **How accurate is SourceTrack attribution?** (new) |
| — | Can I cancel anytime? (improved with specific instructions) |

Dropped: "What attribution models does SourceTrack support?" and "Do I need a data analyst?" (merged into "Do I need a developer?" with more honest answer about webhook setup requirements).

---

## Truth/Safety Checks

| Claim in new copy | Status |
|------------------|--------|
| "No overage charges — tracking simply pauses" | ✓ Verified: hard cutoff in track.js, no billing for overages |
| "Setup takes about 5 minutes" | ✓ Reasonable estimate; onboarding QA confirmed in 139I-D |
| "22 AI domains" | ✓ Verified in 140Z-G audit |
| "Attribution results are calculated nightly" | ✓ Verified: nightly-attribution.js |
| "Renewal terms are confirmed before you're charged" | ✓ Safe — delegates to Stripe checkout disclosure |
| "Both require a short developer setup — about 20–30 minutes" | ✓ Honest: webhook recipes require dev access |
| "Cookieless daily-rotating hash" | ✓ Confirmed in CLAUDE.md and codebase |
| "Cancel from Settings → Billing at any time. No cancellation fee." | ✓ Stripe cancellation confirmed; no fee in billing logic |
| "Your access continues until the end of your current billing period." | ✓ Stripe cancel_at_period_end behavior |
| Removed: "Standard price is $29/mo after this offer closes" | ✓ Correct removal — not verified in Stripe config |
| Removed: "standard Starter pricing applies" | ✓ Correct removal — no auto-downgrade logic in billing.js |
| No fake testimonials, logos, review ratings, or aggregateRating | ✓ No social proof elements added |
| No native app claims (Shopify/Stripe) | ✓ Copy uses "webhook recipe" language throughout |
| No accuracy overclaims | ✓ "Works well for the majority of traffic" — appropriately hedged |
| Removed "Revenue attribution" from Starter card | ✓ `revenue_attribution: starter: false` in plan-features.js — was an incorrect bullet |
| "Stripe revenue tracking (webhook recipe)" on Growth | ✓ Accurate — Growth has `revenue_attribution: true`; labeled as webhook recipe, not native app |
| "White-label reporting" on Scale only | ✓ `white_label: { scale: true }` — correctly gated |
| "5-year data history" on Scale | ✓ `PLAN_STRUCTURAL_LIMITS.scale.retention_days = 1825` = exactly 5 years |
| "Higher conversion event limits" on Scale | ✓ Scale = 2,500 vs Growth = 750 events |
| "Multi-touch attribution models" on Starter | ✓ `multi_touch_attribution: { starter: true }` |
| "Lead source and conversion tracking" in Early Bird card | ✓ Replaces pre-existing "Revenue attribution" bullet — Early Bird maps to Starter entitlements (`early_bird_annual` → starter in billing.js); `revenue_attribution: starter: false`; corrected in final truth-safety pass |
| "Unlimited sites · up to 99 team members" on Scale | ✓ Sites are truly unlimited (`scale.sites = null`); members capped at 99 (`PLAN_STRUCTURAL_LIMITS.scale.members = 99`); "unlimited team members" removed as inaccurate |

---

## Validation

### `git diff --check`
```
(no output — no whitespace violations)
```

### `npm run qa:static`
```
✅ All offline environment safety tests passed successfully.
✅ No active credentials, secrets, or tracked env files detected.
✅ All blockers open and correctly flagged (release NOT READY).
✅ All backend files syntax passed.
✅ Frontend build succeeded.
✅ No whitespace violations.
✅ No forbidden strings in user-facing code.
✅ Route mount checks passed.
✅ Security & plan scoping checks passed.

PASS — static launch QA passed
```

### `cd dashboard && npm run build`
```
✓ 2080 modules transformed.
✓ built in 2.76s
(pre-existing chunk size warning — unrelated to this change)
```

### `git status --short --untracked-files=all`
```
 M dashboard/src/components/PricingCards.jsx
 M dashboard/src/pages/Pricing.jsx
?? docs/qa/pricing_clarity_140Z-G2.md
```

*(Status after G2 + bullet addendum — QA report itself shows as untracked until commit)*

---

## Browser QA Notes

### Desktop (1280×900)

| Section | Result |
|---------|--------|
| Hero sub-headline | "First month free, no card required. Early Bird annual access is $99 for your first year." — 2 lines, clean |
| Hero CTA | "Start free" (lime) + "Talk to sales" (dark) — consistent with nav |
| Hero proof pills | "First month free — no card required · Only 10 early-bird seats · Cancel anytime" |
| Early Bird section | "Only 10 public early-bird seats available." (1 mention, in section subtitle) |
| Early Bird card | "Founding annual price" label · "Then $99 for your first year." · "Lock your first year for $99 before this founding price closes." · No lime scarcity pill · Fine print: "Annual billing. Renewal terms are confirmed before you're charged." |
| Early Bird CTA | "Claim early bird" |
| Plan cards | 3-column grid (140Z-G1 fix) · Growth desc updated |
| FAQ | 10 questions in 2-column grid — all 5 rows visible, no layout issues |
| Console errors | None |

### Mobile (375×812)

| Section | Result |
|---------|--------|
| Hero sub-headline | 3 lines — within ≤4 line target for mobile |
| Hero CTAs | "Start free" + "Talk to sales" — both visible and tappable |
| Proof pills | All 3 visible |
| No horizontal overflow | ✓ |
| Plan cards (addendum) | Single-column stacked layout — Starter card fully visible with all 8 bullets, longer bullets wrap naturally (e.g. "Detect AI referrals from ChatGPT, Claude, and Perplexity" wraps to 2 lines), no overflow, "Best for" desc renders cleanly, "Get Starter" CTA full-width |
| Growth card (addendum) | "Most popular" badge and $79 price visible on scroll — layout intact |

---

## Paid Beta Status

**NOT READY.** This session resolves pricing page copy/trust gaps identified in 140Z-G §11 items 7, 9 (partial), and 10 (partial), and §12 item 4. The following §11 blockers remain open:

1. ~~PricingCards grid~~ — fixed in 140Z-G1
2. Fix "View Journey" to link to specific journey — open
3. Dashboard tab navigation to true in-page tabs — open
4. Rename Onboarding Step 3 title — open
5. Add "Takes about 5 minutes" to Onboarding Step 1 — open
6. Simplify attribution model dropdown — open
7. ~~"What counts as a tracked visit" FAQ~~ — resolved in this session
8. Remove/simplify Measurement Flow section from homepage — open
9. Add product-proof / truthful social proof to homepage — open
10. Rename integration cards to honest plain language on homepage — open

---

*No commit. No push. Awaiting explicit instruction.*
