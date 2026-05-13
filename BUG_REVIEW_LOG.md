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

- `ATTRIBUTION.md` Part 2 (P2 — Model parity on totals) states totals must match across models. This is claimed as "architecturally guaranteed by LEFT JOIN semantics" in PROGRESS.md. Runtime verification needed.
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

### Session 83.2 update

**Date:** 2026-05-13  
**Review type:** Static implementation audit + build validation.  
**Build:** `npm run build` passed (2000 modules).  
**`git diff --check`:** Passed.  
**Confirmed issues:** None.  

**Risk notes:**
- Inter is loaded via Google Fonts CDN. Acceptable for development; external font dependency should be reviewed before production if strict self-hosting is required.
- New primitives (`DashboardTable`, `FilterBar`, `EmptyState`) are previewed in `/design-system`. `DashboardTable` and `EmptyState` are now integrated into `Dashboard.jsx` (Sessions 84.2–84.3). `FilterBar` is not yet integrated. No regression risk.
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

### Session 84.3 update

**Date:** 2026-05-13
**Review type:** Dashboard wrapper + EmptyState integration.
**Files changed:** `dashboard/src/pages/Dashboard.jsx` — imported `EmptyState`, added `.st-container` wrapper, replaced Revenue Trend and AI Sources inline empty states with `<EmptyState>`.
**Build:** `npm run build` passed.
**Confirmed issues:** None.

### Next review

After Session 82 manual QA, update this log with any runtime bugs found.
