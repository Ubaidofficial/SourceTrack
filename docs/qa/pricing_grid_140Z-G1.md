# QA Report — PricingCards Grid Bug Fix
**Session:** 140Z-G1
**Date:** 2026-06-18
**Branch:** main
**Commit at time of fix:** 225c040 (Session 140Z-G — Audit simplicity and DataFast parity)
**Status:** FIX VERIFIED — paid beta remains NOT READY (other blockers open)

---

## Issue

`dashboard/src/components/PricingCards.jsx` line 26 declared a `lg:grid-cols-4` Tailwind class on the pricing plan grid. The `PLANS` array contains exactly 3 plan objects (Starter, Growth, Scale). At the `lg:` breakpoint (≥1024px) this produced a 4-column grid with an empty fourth column on every desktop viewport — visible to every prospect who visits `/pricing`.

**Bug class:** Visual / layout
**Severity:** High — visible to 100% of desktop visitors on the pricing page
**Effort:** XS (one token changed)

---

## File Changed

| File | Line | Before | After |
|------|------|--------|-------|
| `dashboard/src/components/PricingCards.jsx` | 26 | `lg:grid-cols-4` | `lg:grid-cols-3` |

No other files modified. No plan data, copy, Early Bird card, Stripe logic, billing backend, env vars, or checkout flow touched.

---

## Usages Audited

`PricingCards` is imported and rendered in exactly one place:

- `dashboard/src/pages/Pricing.jsx:99` — `<PricingCards />` inside a `max-w-[1320px]` container

No other consumers. The grid wrapper is self-contained within `PricingCards.jsx`.

---

## Before / After Behavior

| Breakpoint | Before | After |
|-----------|--------|-------|
| `grid-cols-1` (mobile, <640px) | 1 column — correct | 1 column — unchanged |
| `sm:grid-cols-2` (≥640px) | 2 columns — correct | 2 columns — unchanged |
| `lg:grid-cols-4` → `lg:grid-cols-3` (≥1024px) | **4 columns, 3 cards, 1 empty column** | **3 columns, 3 cards, no empty column** |

**Computed grid at 1280px viewport (browser-verified):**
- Before: `gridTemplateColumns` would produce 4 equal columns, one always empty
- After: `394.664px 394.664px 394.664px` — 3 equal columns for 3 cards

---

## Validation

### git diff
```diff
diff --git a/dashboard/src/components/PricingCards.jsx b/dashboard/src/components/PricingCards.jsx
index 9e98836..7679aea 100644
--- a/dashboard/src/components/PricingCards.jsx
+++ b/dashboard/src/components/PricingCards.jsx
@@ -23,7 +23,7 @@ const PLANS = [

 export default function PricingCards() {
   return (
-    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
+    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
       {PLANS.map((p, i) => (
```

### git diff --check
```
(no output — no whitespace violations)
```

### npm run qa:static (root)
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

### npm run build (dashboard/)
```
✓ 2080 modules transformed.
✓ built in 3.27s
(chunk size warning is pre-existing, unrelated to this change)
```

### Browser verification (localhost:5173/pricing, 1280×900 viewport)
- Grid computed style: `gridTemplateColumns: 394.664px 394.664px 394.664px`
- Children count: 3
- Visual: Starter | Growth (elevated, featured) | Scale — no empty column
- Console errors: none

### git status
```
 M dashboard/src/components/PricingCards.jsx
```

---

## Paid Beta Status

**NOT READY.** This fix resolves one of the 10 must-fix blockers identified in Session 140Z-G. Nine blockers remain open. See `docs/qa/sourcetrack_datafast_piqo_simplicity_parity_140Z-G.md` §11 for the full list.

---

*No commit. No push. Awaiting explicit instruction.*
