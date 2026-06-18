# Alerts Backend Plan Gate — Session 140Z-A

**Date:** 2026-06-18
**Branch:** main (`c5294a0` base)
**Verdict:** PASS

---

## 1. What Was Broken

`GET /api/alerts` had no backend plan feature gate. The feature matrix in `api/lib/plan-features.js` declares:

```js
alerts: { free: false, trial: false, starter: false, growth: true, scale: true }
```

But `api/routes/alerts.js` imported no plan-features module and applied no `requireFeature` check. Any authenticated user on any plan (free, trial, starter) could call the endpoint and receive full traffic-drop, conversion-drop, AI traffic, and install-health alert data.

The route was correctly protected by `requireUserAuth + validateSiteKey + requireSiteMembership` at the app.use() mount (`api/index.js:432`), so unauthenticated or cross-site access was already blocked. Only the plan-level gate was missing.

---

## 2. What Changed

**`api/routes/alerts.js`** — added `requireFeature` import and a named `requireAlertsFeature` middleware placed in the route-level chain after `validateSiteKey`. Uses `block.status ?? 402` as a safe fallback: `requireFeature` does not currently return a `.status` field, so the `?? 402` fires in practice, but the pattern is future-proof if the helper gains the field later.

```diff
+import { requireFeature } from '../lib/plan-features.js'
 
 const router = Router()
 
+const requireAlertsFeature = (req, res, next) => {
+  const block = requireFeature(req.site?.plan, 'alerts', 'Alerts')
+  if (block) return res.status(block.status ?? 402).json(block)
+  return next()
+}
+
-router.get('/', validateSiteKey, async (req, res) => {
+router.get('/', validateSiteKey, requireAlertsFeature, async (req, res) => {
```

`requireAlertsFeature` runs after `validateSiteKey` in the route chain, so `req.site` is always set by the time the plan check runs. This is more robust than `router.use()` before the route-level `validateSiteKey`.

`api/lib/plan-features.js` was **not changed** — the feature matrix was already correct and the shared helper contract is preserved.

**`api/tests/alerts-plan-gate.test.js`** — new unit test file (17 subtests) exercising `requireFeature` and `hasFeature` for the `'alerts'` key across all plan states. No Express, PostHog, or Supabase required.

> **Coverage note:** These tests are pure unit tests against `api/lib/plan-features.js`. The `requireAlertsFeature` route-level middleware is NOT integration-tested — there is no Express test harness wiring `validateSiteKey → requireAlertsFeature` in this session. Middleware wiring relies on code review.

---

## 3. Exact Files / Lines Touched

| File | Change |
|---|---|
| `api/routes/alerts.js:5` | Added `import { requireFeature } from '../lib/plan-features.js'` |
| `api/routes/alerts.js:9–13` | Added `requireAlertsFeature` named middleware |
| `api/routes/alerts.js:15` | Route chain changed to `validateSiteKey, requireAlertsFeature, async …` |
| `api/tests/alerts-plan-gate.test.js` | New — 17 unit subtests |

No changes to `api/lib/plan-features.js`, `dashboard/src/lib/planFeatures.js`, `api/index.js`, auth middleware, or any other file.

---

## 4. Plan Behavior After Fix

| Plan | Result | HTTP status |
|---|---|---|
| `free` | ❌ blocked | 402 |
| `trial` | ❌ blocked | 402 |
| `starter` | ❌ blocked | 402 |
| `growth` | ✅ allowed | 200 |
| `scale` | ✅ allowed | 200 |
| `inactive` | ❌ blocked (by validateSiteKey, before requireAlertsFeature) | 402 |
| `archived` | ❌ blocked (by validateSiteKey, before requireAlertsFeature) | 402 |
| `pro` (legacy alias → growth) | ✅ allowed | 200 |
| `agency` (legacy alias → scale) | ✅ allowed | 200 |
| `null` / `undefined` (defaults to free) | ❌ blocked | 402 |

The 402 response payload for blocked plans is the standard `requireFeature` shape (unchanged from shared helper):

```json
{
  "success": false,
  "data": null,
  "error": "Feature not available on your plan",
  "upgrade": {
    "current_plan": "starter",
    "required_feature": "alerts",
    "message": "Alerts is not available on the starter plan. Upgrade to unlock.",
    "upgrade_url": "/billing"
  }
}
```

---

## 5. Test Coverage Added

**File:** `api/tests/alerts-plan-gate.test.js`
**Runner:** `node:test` (same as all project unit tests)

Test suite 1 — `hasFeature` matrix:
- free blocked ✅
- trial blocked ✅
- starter blocked ✅
- growth allowed ✅
- scale allowed ✅
- inactive blocked ✅
- archived blocked ✅
- legacy alias `pro` → growth allowed ✅
- legacy alias `agency` → scale allowed ✅

Test suite 2 — `requireFeature` payload:
- free returns payload with correct `current_plan` and `required_feature` ✅
- trial returns block payload ✅
- starter returns block payload ✅
- growth returns null (allowed) ✅
- scale returns null (allowed) ✅
- null/undefined plan defaults to free and is blocked ✅

Total: **17 subtests, 17 pass, 0 fail**

These tests are pure unit tests against `api/lib/plan-features.js`. No mocking of Express, PostHog, Supabase, or network required.

> **Coverage note:** The `requireAlertsFeature` route-level middleware is NOT integration-tested. No Express test harness wires `validateSiteKey → requireAlertsFeature` in this session. The unit tests verify plan-features logic; middleware wiring relies on code review.

---

## 6. Validation Output

```
git diff --check:            clean
npm run qa:secrets:          PASS
npm run qa:env-safety:       PASS
npm run qa:static:           PASS
npm run qa:identity:unit:    131 pass, 0 fail
npm run qa:attribution:unit: 16 pass, 0 fail
npm run qa:tracker:unit:     217 pass, 0 fail
alerts-plan-gate.test.js:    17 pass, 0 fail
```

---

## 7. Raw Diff

```diff
diff --git a/api/routes/alerts.js b/api/routes/alerts.js
--- a/api/routes/alerts.js
+++ b/api/routes/alerts.js
@@ -2,10 +2,17 @@ import { Router } from 'express'
 import { validateSiteKey } from '../middleware/auth.js'
 import { queryHogQL } from '../lib/posthog.js'
 import { esc } from '../lib/utils.js'
+import { requireFeature } from '../lib/plan-features.js'
 
 const router = Router()
 
-router.get('/', validateSiteKey, async (req, res) => {
+const requireAlertsFeature = (req, res, next) => {
+  const block = requireFeature(req.site?.plan, 'alerts', 'Alerts')
+  if (block) return res.status(block.status ?? 402).json(block)
+  return next()
+}
+
+router.get('/', validateSiteKey, requireAlertsFeature, async (req, res) => {
```

`api/lib/plan-features.js` is unchanged. New file: `api/tests/alerts-plan-gate.test.js` (89 lines — see §5 above).

---

## 8. Git Status

```
 M api/routes/alerts.js
?? api/tests/alerts-plan-gate.test.js
?? docs/qa/alerts_backend_plan_gate_140Z-A.md
```

Not committed. Not pushed.

---

## 9. Remaining Blockers

This P0 fix is complete. Public beta remains **NOT READY**.

Outstanding items from Session 140Z:

| Item | Status |
|---|---|
| P0 alerts backend gate | ✅ Fixed this session |
| P1 Leads/Journey gating | ⏳ Product-packaging decision required before any backend change |
| Other release checklist blockers | ⏳ See main release checklist |
