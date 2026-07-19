# Billing / Limits Enforcement Audit — Session 140Z

**Date:** 2026-06-18
**Branch:** main (`0715a74`)
**Verdict:** PARTIAL — public beta NOT READY until the P0 alerts gate is fixed and the P1 Leads/Journey packaging decision is resolved

---

## 1. Executive Summary

This audit inspected all billing plan states (free, trial, starter, growth, scale, inactive, archived) across every enforcement dimension: ingestion quotas, authenticated route access, feature gating, UI/backend alignment, and billing recovery routes.

**Core infrastructure is sound:** pageview and conversion quotas are enforced atomically via DB RPCs. Inactive/archived/expired-trial accounts are blocked at `validateSiteKey`. Billing recovery routes (`/api/billing/status`, `/api/billing/create-checkout`, `/api/billing/portal`) correctly bypass the inactive block. The Stripe webhook flow sets correct plan/pv_limit on all subscription lifecycle events.

**One backend feature-gate gap is a clear fix (P0). One requires a product-packaging decision before any code change (P1):**

- **P0:** The `/api/alerts` route returns paid data (growth/scale only) to any authenticated user regardless of plan — no `requireFeature` call in the route handler. Fix is straightforward.
- **P1:** The `/api/leads` list and detail routes, and the `/api/journey/:visitorId` route, have no backend plan gate. Whether and how to gate them is a **product-packaging decision** — Leads/Journeys may be core product surfaces rather than "advanced multi-touch only" features. Do not fix blindly.

Frontend/backend feature matrix is in sync between `api/lib/plan-features.js` and `dashboard/src/lib/planFeatures.js`.

---

## 2. Plan / Feature Enforcement Matrix

Key:
- ✅ PASS — backend + UI both enforced and aligned
- ⚠️ PARTIAL — missing backend enforcement (UI gate exists but backend allows)
- ❌ FAIL — paid feature accessible without enforcement (no backend gate)
- 🔒 N/A — structural limit enforced differently (count-based, DB quota)

| Feature / Route | Free | Trial | Starter | Growth | Scale | Inactive | Archived | Backend Enforced? | Risk |
|---|---|---|---|---|---|---|---|---|---|
| Pageview ingestion quota | 5K/mo | 10K/mo | 50K/mo | 150K/mo | 500K/mo | 0 | 0 | ✅ RPC | PASS |
| Conversion ingestion quota | 30/mo | 99/mo | 150/mo | 750/mo | 2500/mo | 0 | 0 | ✅ RPC | PASS |
| Inactive site blocking | — | — | — | — | — | ✅ 402 | ✅ 402 | ✅ validateSiteKey | PASS |
| Archived site blocking | — | — | — | — | — | — | ✅ 402 | ✅ validateSiteKey | PASS |
| Trial expiry blocking | — | ✅ 14d | — | — | — | — | — | ✅ validateSiteKey | PASS |
| Free email verification | ✅ gate | — | — | — | — | — | — | ✅ validateSiteKey | PASS |
| Billing recovery routes | ✅ open | ✅ open | ✅ open | ✅ open | ✅ open | ✅ open | — | ✅ bypass | PASS |
| Multi-touch attribution API | ✗ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ attribution.js | PASS |
| Analytics summary/sources | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ basic analytics = free | PASS |
| Funnels (/api/analytics/funnel) | ✗ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ requireFeature | PASS |
| Over-reporting detection | ✗ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ requireFeature | PASS |
| CSV export | ✗ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ requireFeature | PASS |
| AI analytics | ✗ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ requireFeature | PASS |
| AI chat | ✗ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ requireFeature | PASS |
| Saved reports | ✗ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ router-level requireFeature | PASS |
| Dashboard widgets | ✗ | ✓ | ✗ | ✓ | ✓ | — | — | ✅ requireFeature on PATCH | PASS |
| Manual spend (campaign costs) | ✗ | ✓ | ✗ | ✓ | ✓ | — | — | ✅ requireFeature all endpoints | PASS |
| Manual revenue status (leads qualify) | ✗ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ requireFeature in PATCH | PASS |
| Webhooks (create/update/delete) | ✗ | ✓ | ✗ | ✓ | ✓ | — | — | ✅ enforceWebhookOutbound | PASS |
| Webhooks (GET list) | ✗ | ✓ | ✗ | ✓ | ✓ | — | — | ⚠️ no gate on GET | LOW |
| API keys (create) | ✗ | ✓ | ✗ | ✓ | ✓ | — | — | ✅ requireFeature on POST | PASS |
| API keys (GET/DELETE) | ✗ | ✓ | ✗ | ✓ | ✓ | — | — | ⚠️ no gate on GET/DELETE | LOW |
| Google Search Console | ✗ | ✗ | ✗ | ✓ | ✓ | — | — | ✅ router-level requireFeature | PASS |
| Ad cost sync | ✗ | ✗ | ✗ | ✓ | ✓ | — | — | ✅ router-level requireFeature | PASS |
| Cohorts | ✗ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ router-level requireFeature | PASS |
| **Alerts** | **✗** | **✗** | **✗** | **✓** | **✓** | **—** | **—** | **❌ NO gate** | **P0** |
| **Leads list + detail** | **?** | **?** | **?** | **✓** | **✓** | **—** | **—** | **⚠️ NO gate — packaging TBD** | **P1 product decision** |
| **Journey timeline** | **?** | **?** | **?** | **✓** | **✓** | **—** | **—** | **⚠️ NO gate — packaging TBD** | **P1 product decision** |
| CAPI server-side sync | ✗ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ hasFeature check in conversion.js | PASS |
| Attribution (explain/verdicts) | ✗ | ✓ | ✓ | ✓ | ✓ | — | — | ✅ requireFeature in attribution.js | PASS |

---

## 3. Backend Route Enforcement Findings

### 3.1 Ingestion routes

| Route | Auth | Tier check | Quota |
|---|---|---|---|
| `POST /api/track` | validateSiteKey | checkTierLimit ✅ | claimPageviewUsage ✅ |
| `POST /api/collect` | validateSiteKey | checkTierLimit ✅ | claimPageviewUsage ✅ |
| `POST /api/conversion` | validateSiteKey | **no checkTierLimit** | claimConversionUsage ✅ |
| `POST /api/conversion/offline` | validateSiteKey | **no checkTierLimit** | (offline) |

`/api/conversion` missing `checkTierLimit` is defense-in-depth only — `validateSiteKey` already blocks inactive/archived/expired-trial before the handler runs. Not a bypass risk; P2 cosmetic.

### 3.2 Dashboard / analytics routes

All dashboard routes use `requireUserAuth + validateSiteKey + requireSiteMembership` at app.use() level ✅.

Analytics basic endpoints (`/summary`, `/sources`, `/entry-exit`, `/outbound`, `/custom-events`, `/browsers`, `/os`, `/recent-conversions`) have no plan feature gate. This is intentional: `last_touch_attribution: { free: true }` permits basic analytics for free accounts. Revenue fields in `/summary` return near-zero for free accounts due to the 30 conversion/month cap.

### 3.3 Leads routes — P1 gap

```
app.use('/api/leads', requireUserAuth, validateSiteKey, requireSiteMembership, leadsRouter)
```

App-level chain enforces: user auth ✅, site ownership ✅, inactive/archived/trial-expiry ✅.

But inside `leads-server.js`:
- `GET /` — **no `requireFeature`** call
- `GET /:leadId` — **no `requireFeature`** call
- `PATCH /:leadId/qualify` — ✅ has `requireFeature('manual_revenue_status', ...)`

A free plan user can hit `GET /api/leads?site_key=...` and get lead data from PostHog. The feature matrix declares `multi_touch_attribution: { free: false }` which governs leads conceptually but is not wired here.

**Do not fix blindly.** Leads may be a core product surface rather than an advanced-only feature. The packaging question must be resolved first: Should Free see no leads at all? Should Free see basic leads but not full journeys? Should Starter include leads/journeys? Once packaging is decided, enforce the chosen boundary in both backend and frontend. Do not add `requireFeature('multi_touch_attribution')` here without that decision.

### 3.4 Journey route — P1 (product-packaging decision required)

```
app.get('/api/journey/:visitorId', requireUserAuth, validateSiteKey, requireSiteMembership, defaultLimit, journey)
```

Journey is a per-visitor session timeline. No `requireFeature` in `journey.js`. A free plan user with a valid site_key can call this endpoint.

**Do not fix blindly.** Same packaging decision as Leads applies — Journey may be a core visibility surface rather than an "advanced multi-touch only" feature. Decide the plan boundary first, then enforce consistently in backend and UI.

### 3.5 Alerts route — P0 gap

```
app.use('/api/alerts', requireUserAuth, validateSiteKey, requireSiteMembership, alertsRouter)
```

Feature matrix: `alerts: { free: false, trial: false, starter: false, growth: true, scale: true }`.

`alerts.js` has a single `GET /` handler with no `requireFeature` call. Free, trial, and starter users can access the alerts endpoint and receive full traffic/conversion drop intelligence.

**Fix required:** Add `requireFeature(req.site?.plan, 'alerts', 'Alerts')` at the router level or inside the handler.

---

## 4. Frontend / UI Gate Findings

Frontend `dashboard/src/lib/planFeatures.js` matches backend `api/lib/plan-features.js` exactly — both FEATURE_MATRIX objects are in sync. Plan aliases (pro→growth, agency→scale, business→scale) are identical on both sides.

UI gates exist for all features via the `hasFeature()` helper. These conditionally hide or lock UI elements (upgrade prompts, disabled buttons). However, UI gates alone do not prevent API access — the P0/P1 gaps above are exploitable directly via API regardless of UI.

BLOCKED: full UI rendering and upgrade prompt messaging require browser verification; not tested in this session.

---

## 5. Ingestion Quota Findings

### Pageview quota

- **Implementation:** `claimPageviewUsage(site)` in `api/lib/pageview-limits.js`
- **Called in:** `api/routes/track.js` (POST /api/track) and `api/routes/analytics.js` (POST /api/analytics/collect)
- **Timing:** After bot filtering, path exclusion, and PII redaction — only true `$pageview` events consume quota
- **Fail behavior:** Fail-open on DB/RPC error (logged clearly; tracking never blocked by counter failure)
- **Inactive/archived:** `getPvLimit` returns 0 → blocked without DB write
- **Result:** PASS

### Conversion quota

- **Implementation:** `claimConversionUsage(site)` in `api/lib/conversion-limits.js`
- **Called in:** `api/routes/conversion.js`
- **Limits:** free=30, trial=99, starter=150, growth=750, scale=2500 per month
- **Rollback:** idempotency key rolled back if conversion limit blocks the event
- **Fail behavior:** Fail-open on DB/RPC error
- **Result:** PASS

---

## 6. Inactive / Archived Behavior Findings

`validateSiteKey` (`api/middleware/auth.js`) handles all status checks on every request:

| Plan state | Behavior on ingestion | Behavior on dashboard routes |
|---|---|---|
| `inactive` | 402 Subscription inactive | 402 (unless billing recovery route) |
| `archived` | 402 Site archived | 402 |
| `trial` (expired) | 402 Trial expired | 402 |
| `free` (unverified email) | 402 Email not verified | allowed for authenticated users |

Cache (5-min TTL): the siteCache correctly re-checks trial expiry on cache hits and busts cache on expiry. Inactive check on cache hits also present. Archived check on cache hits is **absent** — archived sites could slip through within the 5-minute cache window if the plan was changed out-of-band (e.g., admin DB update without cache invalidation). Billing webhook events DO call `clearSiteCache`/`clearSiteCacheForKeys` on all lifecycle events. Practical risk is very low; edge case noted.

---

## 7. Billing Recovery Route Findings

`isInactiveBillingRecoveryRoute()` in `api/middleware/auth.js` allowlists:
- `/api/billing/status`
- `/api/billing/create-checkout`
- `/api/billing/portal`

Both cache-hit and cache-miss code paths check this allowlist before returning 402 for inactive accounts. These three routes also carry `requireUserAuth + validateSiteKey + requireSiteMembership` middleware from the billing router itself. Inactive users can reach all three. ✅

---

## 8. UI-Only Gate Risks

The following features are gated in the frontend `planFeatures.js` but have **no backend enforcement** found in this audit:

| Feature | Frontend gate | Backend gate |
|---|---|---|
| `alerts` | ✅ `hasFeature('alerts')` | ❌ none |
| `multi_touch_attribution` (leads/journey) | ✅ `hasFeature(...)` | ⚠️ attribution.js only; leads/journey miss it |

Risk: Any user who discovers the API route and has a valid site_key + auth token can bypass these gates.

---

## 9. Files Inspected

| File | Lines reviewed |
|---|---|
| `api/middleware/auth.js` | 1–227 |
| `api/middleware/tier-check.js` | 1–65 |
| `api/lib/plan-features.js` | 1–117 |
| `api/lib/pageview-limits.js` | 1–62 |
| `api/lib/conversion-limits.js` | 1–51 |
| `api/routes/billing.js` | 1–495 |
| `api/routes/track.js` | 1–365 |
| `api/routes/conversion.js` | 1–386 |
| `api/routes/analytics.js` | 1–776 |
| `api/routes/leads-server.js` | 1–226 |
| `api/routes/campaign-costs.js` | 1–201 |
| `api/routes/saved-reports.js` | 1–276 |
| `api/routes/export.js` | 1–131 |
| `api/routes/webhooks.js` | 1–323 |
| `api/routes/integrations.js` | 1–1049 |
| `api/routes/alerts.js` | head 20 |
| `api/routes/journey.js` | head 20 |
| `api/routes/ai-analytics.js` | grep |
| `api/routes/ai-chat.js` | grep |
| `api/routes/cohorts.js` | grep |
| `api/routes/attribution.js` | grep |
| `api/routes/google-search-console.js` | grep |
| `api/routes/ad-platforms.js` | grep |
| `api/index.js` | lines 350–470 + grep |
| `dashboard/src/lib/planFeatures.js` | 1–91 |

---

## 10. Fixes Made

**None.** This session is code-audit only. Fixes require a dedicated session with explicit scope per gap below.

---

## 11. Remaining Blockers (must fix before public beta)

### P0 — FAIL

**Gap:** `GET /api/alerts` has no `requireFeature` gate.
- Feature matrix: `alerts: { free: false, trial: false, starter: false, growth: true, scale: true }`
- File: `api/routes/alerts.js:8`
- Fix: Add router-level `requireFeature(req.site?.plan, 'alerts', 'Alerts')` guard

### P1 — PARTIAL (product-packaging decision required before any fix)

**Gap A:** `GET /api/leads/` and `GET /api/leads/:leadId` have no backend plan gate.
- Current state: `multi_touch_attribution: { free: false, ... }` in feature matrix — but Leads/Journeys may be core product surfaces rather than advanced-only features.
- Files: `api/routes/leads-server.js:11`, `api/routes/leads-server.js:118`
- Required action: **Decide packaging first.** Should Free see no leads at all? Should Free see basic leads but not full journeys? Should Starter include leads? Once the boundary is decided, enforce it in both backend and UI. Do not blindly wire `multi_touch_attribution` here.

**Gap B:** `GET /api/journey/:visitorId` has no backend plan gate.
- Current state: No `requireFeature` in `api/routes/journey.js`.
- Required action: **Same packaging decision as Gap A.** Journey may be a core CRM/visibility surface rather than an advanced-attribution gate. Decide the plan boundary first, then enforce consistently.

### P2 — Low risk / defense-in-depth

**Gap C:** `POST /api/conversion` and `POST /api/conversion/offline` lack `checkTierLimit` middleware.
- Risk: validateSiteKey already handles inactive/archived/expired-trial blocking. Defense-in-depth only.
- No fix required before public beta.

**Gap D:** `GET /api/webhooks/` has no `requireFeature('webhook_outbound')` on the read endpoint.
- Risk: Free/starter users can call GET but have no webhooks to list. Returns empty. Very low risk.
- No fix required before public beta.

**Gap E:** `GET /api/integrations/api-keys` and `DELETE /api/integrations/api-keys/:id` lack `requireFeature('api_access')`.
- Risk: Free/starter users cannot create keys (POST is gated). GET/DELETE on non-existent keys is harmless.
- No fix required before public beta.

---

## 12. Required Next Sessions

| Session | Scope |
|---|---|
| 140Z-A | Fix P0: Add requireFeature('alerts') gate to api/routes/alerts.js |
| Product decision | Decide leads/journey plan packaging (Free/Starter boundary) before backend enforcement |
| 140Z-B (post-decision) | Enforce leads/journey plan gate once packaging decision is made |
| Future | Verify UI upgrade prompts for alerts/leads/journey pages (browser-required) |
| Future | Enforce team member and site count structural limits at route level |

---

## 13. Validation Output

```
git status --short:
?? docs/qa/billing_limits_enforcement_audit_140Z.md

npm run qa:secrets:   PASS — No active credentials, secrets, or tracked env files detected.
npm run qa:env-safety: PASS — No active credentials, secrets, or tracked env files detected.
npm run qa:static:    PASS — static launch QA passed
npm run qa:identity:unit:    131 tests, 131 pass, 0 fail
npm run qa:attribution:unit:  16 tests,  16 pass, 0 fail
npm run qa:tracker:unit:     217 tests, 217 pass, 0 fail
```

---

## 14. Raw Diff

No code changes made this session. Diff is empty except for this document.

---

## 15. Git Status

```
working tree: clean
branch: main
HEAD: 0715a74 Fix 140Y-D2 QA report whitespace
new file: docs/qa/billing_limits_enforcement_audit_140Z.md
```
