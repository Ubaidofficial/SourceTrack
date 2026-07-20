# Bug Review Log

Log of potential issues, regressions, and risks found during code review.  
Update before every handoff. Only include items from code inspection — not speculative concerns.

## Review: Sessions 78–80

**Review date:** 2026-05-13  
**Reviewer:** Code inspection (static)  
**Files reviewed:** conversion.js, events.js, EventDebugger.jsx, ReportBuilder.jsx, attribution.js, saved-reports.js

### Confirmed issues

None confirmed at runtime.

### Potential issues (needs manual QA to confirm)

| # | File | Issue | Risk | Verified? |
|---|---|---|---|---|
| 1 | `api/routes/events.js` | 5 new SQL columns added to SELECT. Destructuring order must exactly match HogQL column output order. If PostHog/HogQL reorders columns, mapping breaks silently and wrong data appears in detail cards. | Medium | Unverified |
| 2 | `dashboard/src/pages/ReportBuilder.jsx` | Quick channel "AI" button sets `has_ai_source: 'true'` then clicking another channel calls `applyFilter('has_ai_source', undefined)`. If user manually set `has_ai_source` before clicking AI, then switches channel, their manual setting is lost. | Low | Unverified |
| 3 | `dashboard/src/pages/ReportBuilder.jsx` | `resetReport()` clears all state including `editingId`. If called mid-save (e.g., double-click on New report), save might complete with stale editingId state. | Low | Unverified |
| 4 | `dashboard/src/pages/ReportBuilder.jsx` | `getSavedReportMeta()` reads `cfg.datePreset` which is not saved in the config object by `handleSave()`. Saved reports always show dateLabel as the explicit `dateFrom → dateTo` range, which is actually correct behavior. | None | Verified correct |
| 5 | `api/routes/saved-reports.js` | DELETE scoped lookup uses `eq('id', id).eq('user_id', req.user.id).eq('site_id', req.site.id)`. If Supabase returns `null` for any condition mismatch, we return 404. The removed 403 check is unreachable — scoped lookup handles it. | None | Verified correct |
| 6 | `api/routes/conversion.js` | `ref_param`/`source_param`/`via_param` use fallback `req.body.ref_param \|\| req.body.ref`. If tracker sends only `ref_param` (current behavior), the fallback is unused. If tracker changes to not send `ref_param`, the `req.body.ref` fallback would need the tracker to send raw `ref` field — tracker currently sends it as `ref_param` only. | Low | Unverified |

### Design/architecture notes (not bugs)

- `ATTRIBUTION.md` Part 2 (P2 — Model parity on totals) states totals must match across models. This is claimed as "architecturally guaranteed by LEFT JOIN semantics" in docs/archive/PROGRESS.md. Runtime verification needed.
- `IDENTITY_DESIGN.md` contains 12+ unresolved `TODO: confirm` items about PostHog alias behavior, ignored referrers, and session_id. These are design questions, not bugs.
- `KNOWN_ISSUES.md` #3 (no ad click IDs) and #4 (no ad spend) remain valid. Not blocking for Sessions 82–90 since those are P4/deferred.

### Summary

| Total reviewed | 6 files |
|---|---|
| Confirmed bugs | 0 |
| Potential issues | 4 |
| Verified correct | 2 |
| Risk level | Low — all potential issues are edge cases, not core breakage |

### Session 82.2 update

**Date:** 2026-05-13  
**Static validation passed:** 7 backend files `node --check` clean, dashboard `npm run build` passes.  
**Runtime QA:** Not performed (deferred to human). No confirmed runtime bugs because runtime QA was not performed.  
**Open items:** All 4 potential issues (#1–4) remain unverified and open for browser QA.

### Session 83.1 update

**Date:** 2026-05-13  
**Audit scope:** Tailwind config, CSS, 5 existing components, Layout.jsx, Dashboard.jsx  
**No new bugs found.** Audit was a design-gap inventory, not a bug hunt.  
**No implementation code changed.**

### Session 85.4 update

**Date:** 2026-05-13
**Review type:** Onboarding stabilization and handoff.
**Confirmed:** 29 st-token references across 3 files, 0 hardcoded hex colors, 0 inline fontWeight styles, step count/flow logic/API calls preserved. `npm run build` passes.
**Session 85 complete.** Ready for Session 86 (Report Builder).

### Session 83.2 update

**Date:** 2026-05-13  
**Review type:** Static implementation audit + build validation.  
**Build:** `npm run build` passed (2000 modules).  
**`git diff --check`:** Passed.  
**Confirmed issues:** None.

### Session 84.6 update

**Date:** 2026-05-13
**Review type:** Stabilization and handoff — final static review of all Session 84 work.
**Confirmed:** All primitives wired (DashboardTable, st-container, EmptyState, st tokens, FilterBar). No data/logic changes. All builds pass.
**Known gaps deferred:** Chart color (#D7F550) per guard rule. Text hierarchy not migrated. Browser QA pending.
**Risk level:** Low — all changes are cosmetic/component swaps, no logic touched.

### Session 85.1 update

**Date:** 2026-05-13
**Review type:** Onboarding Figma alignment audit (read-only).
**Files audited:** `Onboarding.jsx`, `OnboardingCard.jsx`, `OnboardingProgress.jsx`, `api/routes/onboarding.js`, `docs/archive/ONBOARDING_FLOW_SPEC.md`.
**Confirmed issues:** None. Business logic intact. Only gaps: hex colors, inline styles, 5-vs-6 step stepper.
**No implementation code changed.**

### Session 85.2 update

**Date:** 2026-05-13
**Review type:** Onboarding token color migration.
**Files changed:** `Onboarding.jsx` (29 replacements), `OnboardingCard.jsx` (2 replacements), `OnboardingProgress.jsx` (3 replacements).
**Build:** `npm run build` passed.
**Confirmed issues:** None. All hex colors replaced with st tokens.

### Session 85.3 update

**Date:** 2026-05-13
**Review type:** Onboarding stepper alignment audit (read-only).
**Files audited:** `Onboarding.jsx`, `OnboardingProgress.jsx`, `docs/archive/ONBOARDING_FLOW_SPEC.md`.
**Finding:** 5-step Figma spec vs 6-step code. Zero safe cosmetic-only changes possible — any stepper alignment requires backend `MAX_STEP` change + state machine refactor. Not a bug; structural UX decision deferred.
**No implementation code changed.**

**Risk notes:**
- Inter is loaded via Google Fonts CDN. Acceptable for development; external font dependency should be reviewed before production if strict self-hosting is required.
- New primitives (`DashboardTable`, `FilterBar`, `EmptyState`) are now integrated into `Dashboard.jsx` (Sessions 84.2–84.5). No regression risk.
- Design-system route (`/design-system`) is public (no auth wrapper). This is intentional for development but should be gated or removed before production.
- Manual visual QA deferred to `MANUAL_QA_BACKLOG.md`.

### Session 84.1 update

**Date:** 2026-05-13
**Review type:** Dashboard alignment audit (read-only).
**Files audited:** `Dashboard.jsx` (1084 lines), `Layout.jsx` (156 lines).
**Confirmed issues:** None — audit was gap analysis, not bug hunt.
**No implementation code changed.**
**Implementation plan ready for 84.2** — 4 phases: tables → wrapper/empty-states → sidebar/colors → FilterBar.

### Session 84.2 update

**Date:** 2026-05-13
**Review type:** Dashboard table replacement.
**Files changed:** `dashboard/src/pages/Dashboard.jsx` — 5 raw tables replaced with `<DashboardTable>`.
**Build:** `npm run build` passed.
**Confirmed issues:** None.

### Session 84.4 update

**Date:** 2026-05-13
**Review type:** Token color alignment (5 safe replacements).
**Files changed:** `dashboard/src/components/Layout.jsx` (sidebar nav active, admin link active, Live badge), `dashboard/src/pages/Dashboard.jsx` (2 Create Report CTAs).
**Build:** `npm run build` passed.
**Confirmed issues:** None.
**Skipped:** Chart color (#D7F550), text hierarchy, data-viz fills per guard rules.

### Session 84.5 update

**Date:** 2026-05-13
**Review type:** FilterBar integration.
**Files changed:** `dashboard/src/pages/Dashboard.jsx` — imported `FilterBar`, replaced time range pill group + export button with single `<FilterBar>` component.
**Build:** `npm run build` passed.
**Confirmed issues:** None.

### Session 84.3 update

**Date:** 2026-05-13
**Review type:** Dashboard wrapper + EmptyState integration.
**Files changed:** `dashboard/src/pages/Dashboard.jsx` — imported `EmptyState`, added `.st-container` wrapper, replaced Revenue Trend and AI Sources inline empty states with `<EmptyState>`.
**Build:** `npm run build` passed.
**Confirmed issues:** None.

### Next review

After Session 90.1 implementation, review for any new issues. B6 leads/conversions duplication will be addressed in Session 90.4.

### Session 91.5 update

**Date:** 2026-05-14
**Review type:** Feature verification — static validation only. No runtime QA.
**Sessions verified:** 91.1 (Leads event type badges + attribution model filter), 91.2 (Journey modal), 91.3 (KPI chart type), 91.4 (Rolling vs fixed date toggle).
**Checks passed:** All verification greps confirmed. `node --check api/routes/leads-server.js` passed. `npm run build` passed (2.36s).
**Confirmed issues:** None.
**Remaining caveats:** Manual/browser QA deferred. B7 HogQL runtime QA still needed. Mark as Qualified button in JourneyModal is UI-only.
**No implementation files were edited in this session.**

### Session 86.2 update

**Date:** 2026-05-14
**Review type:** Bug-fix queue verification (B1–B8 + B2.1). Static validation + rebuild only. No runtime QA.

**Fixed and verified:**

| Bug | Description | Files |
|---|---|---|
| B1 | Removed per-request `ph.shutdown()` from 4 route files | track.js, conversion.js, identify.js, conversion-offline.js |
| B2 | Removed public POST /api/events aliases; added /api/collect + OPTIONS | api/index.js |
| B2.1 | Tracker non-conversion events now POST to /api/collect | tracker/tracker.js, tracker.min.js, tracker.min.js |
| B3 | Fixed cross-domain first-touch key serialization (abbreviated → full) | tracker/tracker.js, tracker.min.js |
| B4 | Fixed `getSessionReport()` ORDER BY undefined alias `e` | attribution-engine.js |
| B5 | Added company_members site-loading fallback for 4 dashboard pages | Dashboard.jsx, Leads.jsx, Campaigns.jsx, Journey.jsx |
| B6 | Leads metric now counts `$conversion` instead of `$identify` | attribution-engine.js |
| B7 | Fixed attribution window from date-range expansion to touchpoint-window JOIN | attribution-engine.js |
| B8 | Added 50K-row truncation detection + ReportBuilder warning banner | attribution-engine.js, attribution.js, ReportBuilder.jsx |

**Validation:** All backend files pass `node --check`. `npm run build:tracker` passes. Dashboard `npm run build` passes. 14 files changed, 199 insertions, 145 deletions.

**Remaining caveats:**
- B6: `leads` and `conversions` both count `$conversion` — identical numbers until leads is refined by conversion_type.
- B7: Windowed self-join SQL needs runtime QA against PostHog HogQL to confirm correct temporal filtering.
- B2/B2.1: Public ingestion is now `/api/collect`; `/api/events` is authenticated Event Debugger only.

**Risk level:** Low — all changes are surgical bug fixes. No new features, no refactors, no scope creep.

### Session 98 update — Beta QA fixes

**Date:** 2026-05-23
**Review type:** Production beta QA — Auth → Onboarding → Tracker → Dashboard flow.

**Fixed:**

| # | Issue | Root cause | Fix |
|---|---|---|---|
| CORS-1 | OPTIONS /api/onboarding/complete returned 401 | Auth middleware ran before CORS preflight | Global OPTIONS middleware before all routes |
| OAUTH-1 | Google OAuth stuck on /auth/callback# | AuthCallback rendered spinner forever | Redirect authenticated → /dashboard, unauthenticated → /login |
| ONB-1 | /api/onboarding/complete returned 400 "business type or install method not set" | Earlier /onboarding/update blocked by CORS, state not persisted | Continue to Dashboard now calls /update then /complete |
| ONB-2 | /api/onboarding/complete blocked by PostHog verification | PostHog script detection was required to complete | Removed PostHog check; store verification_status in onboarding_state |
| INST-1 | /api/install/status returned 500 on PostHog failure | Uncaught queryHogQL error → 500 | Returns safe pending response (status:"pending", reason:"verification_unavailable") |
| AUTH-1 | validateSiteKey returned 500 on Supabase lookup failure | catch block returned 500 | Now returns 401 "Invalid site_key" |

**Build:** ✅ `node --check` all API files clean, `npm run build` passes.

**Remaining QA:** Manual browser verification of Continue to Dashboard flow, dashboard load, refresh redirect, and /api/onboarding/me response.

### Session 140G-4 update — Pageview Limit Enforcement

**Date:** 2026-06-13
**Review type:** Code inspection & unit test execution.

**Fixed:**

| # | Issue | Root cause | Fix |
|---|---|---|---|
| PV-1 | Standard pageview limit bypass | `checkTierLimit` counted from empty Supabase `pageviews` table while tracker writes to PostHog | Implemented real-time atomic pageview counting on `site_usage_monthly` via a new PostgreSQL RPC `claim_site_pageview_usage` and `claimPageviewUsage` helper |
| PV-2 | Legacy `/api/analytics/collect` bypassed limits | Route had no limits middleware | Added inline late-gated `claimPageviewUsage` check before Supabase table insert |
| PV-3 | Proxy `/sp/e` and `/sp/pixel.gif` bypassed limits | Routes had no limits middleware | Added late-gated `claimPageviewUsage` check before PostHog capture |
| PV-4 | `/api/conversion` double-counted pageview limits | Route had `checkTierLimit` middleware | Removed `checkTierLimit` from the conversion route stack |
| PV-5 | Trial expired / status bypass on proxy and legacy collect routes | Proxy and legacy routes did not check trial ends date or active status | Exposed `trial_ends_at` and checked `isSiteStatusBlocked(site)` on proxy/legacy routes |

**Build:** ✅ `node --check` all API files clean, `npm run build` passes. All 90 unit/integration tests in `billing-middleware.test.js` pass successfully.

**Remaining QA:** Staging E2E browser and live webhook billing verification (canceled/downgraded tiers). Paid portal verification.
