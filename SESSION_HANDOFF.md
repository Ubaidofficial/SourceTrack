# Session Handoff

Update this file at the end of every session.

This file is intentionally short. It tells the next agent exactly where to continue.

## Current branch

`session-90-backend-tracker` (created from session-86-report-builder-figma)

## Next recommended session

**Session 90.13:** Backend/tracker phase verification and docs closure. Branch: `session-90-backend-tracker` (continue). Verify all 90.x implementations, update tracking docs, close backend/tracker phase.

**Deferred (later):** 86.3–86.6 Report Builder polish / verification / QA / commit. 87–89 frontend alignment. All postponed — not cancelled.

## Sessions 91.1–91.4 summary

### 91.1: Leads event type badges and attribution model filter

- Added `CONVERSION_TYPE_BADGE` config object with styled color/icon/cta mappings for 9 conversion types
- Added Event Type column with colored badges in leads table
- Added attribution model dropdown (First Touch / Last Touch) to Leads page
- Backend `leads-server.js` accepts `attribution_model` query param
- `node --check api/routes/leads-server.js` passes

### 91.2: Journey modal overlay on All Leads

- Added `JourneyModal` component (`dashboard/src/components/JourneyModal.jsx`)
- Clicking a visitor ID in leads table opens JourneyModal overlay
- Modal shows: All Activity timeline, Sync To CRM button, Mark as Qualified button
- Mark as Qualified is UI-only — no backend wiring yet
- JourneyModal uses `getJourney` from `../lib/api.js`

### 91.3: Report Builder KPI chart type

- Added `{ key: 'kpi', label: 'KPI' }` to CHART_TYPES
- Added `getPriorPeriod` helper computing same-duration prior period
- Added `priorReportData` state, prior period `useQuery` (enabled only for kpi)
- Added KPI helpers: `getKpiValue`, `formatKpiValue`, `formatKpiDelta`
- KPI card: large metric value, green/red delta vs prior period, "vs previous period" caption
- Formatted by metric type (currency/percent/compact)
- Save/load works naturally — chartType persisted in config

### 91.4: Rolling vs fixed date toggle

- Added Rolling/Fixed toggle in ReportBuilder date section
- Added `getRollingDateRange` helpers in both ReportBuilder and Dashboard
- `effectiveDateFrom`/`effectiveDateTo` derived from rolling or fixed mode
- All API queries, prior period, KPI prior, export CSV use effective dates
- Save config includes `isRolling` and `rollingDays`
- Dashboard `reportQueries` recomputes rolling dates dynamically
- Dashboard saved report cards show "Rolling — last N days" indicator
- Old saved reports without `isRolling` default to fixed mode

### 91.5: Feature verification and docs update

- Static verification greps confirmed for all 91.1–91.4 features
- `node --check api/routes/leads-server.js` passed
- `npm run build` passed (2.36s, 0 errors)
- Docs updated: AI_SESSION_PLAN.md, SESSION_STATE.md, SESSION_HANDOFF.md, BUG_REVIEW_LOG.md

## Remaining caveats

- Manual/browser QA required for all 91.x features.
- B7 runtime HogQL QA still required.
- Mark as Qualified UI action is not fully wired — UI-only.
- Stripe, manual campaign costs, and Calendly native integration remain deferred.

**Bug-fix queue complete (B1–B8 + B2.1):**

| Bug | Fix |
|---|---|
| B1 | Removed `await ph.shutdown()` from 4 route files |
| B2 | Removed public POST /api/events aliases; added /api/collect + OPTIONS |
| B2.1 | Tracker now POSTs non-conversion events to /api/collect |
| B3 | Fixed cross-domain first-touch key serialization (abbreviated → full) |
| B4 | Fixed `getSessionReport()` ORDER BY undefined alias `e` |
| B5 | Added `company_members` site-loading fallback for 4 dashboard pages |
| B6 | Leads metric now counts `$conversion` instead of `$identify` |
| B7 | Corrected attribution window from date expansion to touchpoint-window JOIN |
| B8 | Added 50K-row truncation detection + ReportBuilder warning banner |

**Validation:** All backend `node --check` pass. `npm run build:tracker` pass. Dashboard `npm run build` pass. 14 files, 199 insertions, 145 deletions.

**Remaining caveats:**
- B6: `leads` and `conversions` both count `$conversion` — identical numbers until leads is refined.
- B7: Windowed self-join SQL needs runtime QA against PostHog HogQL.
- B2/B2.1: Public ingestion is now `/api/collect`; `/api/events` is authenticated Event Debugger only.

**Safe next steps (86.3):** Report Builder polish — st token color replacements + 3 EmptyState replacements. No DashboardTable, FilterBar, text hierarchy, or layout changes. No browser QA.

## Last completed product work

Session 83.2 (current):

- Implemented Figma token layer. Inter font via Google Fonts (Switzer unavailable). `st` color namespace in Tailwind config. `.st-container` 1320px wrapper. Three new components: DashboardTable, FilterBar, EmptyState. Visual test page at `/design-system`. `npm run build` passes. No pages restyled.

Session 83.1:

- Figma tokens / shared UI primitives repo audit. Created `FIGMA_TOKEN_IMPLEMENTATION_PLAN.md`.

Session 82.2:

- Static validation/regression audit only. All 7 backend files pass `node --check`. Dashboard `npm run build` passes.
- BUG_REVIEW_LOG reviewed: 0 confirmed runtime bugs, 4 potential issues remain open.
- No implementation code changed. Runtime browser QA deferred to `MANUAL_QA_BACKLOG.md`.
- Session tracking files updated: SESSION_STATE, SESSION_LOG, AI_SESSION_PLAN, BUG_REVIEW_LOG, SESSION_HANDOFF.

Session 82.1:

- Bootstrap: created `AI_SESSION_PLAN.md`, `SESSION_STATE.md`, `SESSION_LOG.md`, `IMPLEMENTATION_GAP_LIST.md`, `BUG_REVIEW_LOG.md`, `AGENTS.md`, `COMMANDCODE_RUNBOOK.md`.
- Updated `DOCS_INDEX.md` with all tracking files.

Session 81:

- Markdown docs audit (20 files classified). Created `DOCS_INDEX.md`, `PROJECT_CONTEXT_COMPACT.md`.
- Renamed `FIGMA_DESIGN_SYSTEM_UPDATED.md` → `FIGMA_DESIGN_SYSTEM.md`, `DASHBOARD_FEATURE_GAP_UPDATED.md` → `DASHBOARD_FEATURE_GAP.md`.

Session 80:

- Saved report management UX: metadata cards, New report reset, Save/Update distinction, DELETE site-scoping.

## Files changed in this session

Session 85.4:
- No implementation code changed.
- `SESSION_HANDOFF.md`, `SESSION_LOG.md`, `AI_SESSION_PLAN.md`, `SESSION_STATE.md`, `BUG_REVIEW_LOG.md` — updated

Session 85.3:
- No implementation code changed.
- `SESSION_HANDOFF.md`, `SESSION_LOG.md`, `AI_SESSION_PLAN.md`, `SESSION_STATE.md`, `IMPLEMENTATION_GAP_LIST.md`, `BUG_REVIEW_LOG.md` — updated

Session 85.2:
- `dashboard/src/pages/Onboarding.jsx` — 29 st-token color replacements (hex → st-lime/st-black/st-gray), top bar logo `text-indigo-600` → `text-st-black`
- `dashboard/src/components/OnboardingCard.jsx` — removed inline `fontWeight` styles, `text-[#6F7070]` → `text-st-gray`
- `dashboard/src/components/OnboardingProgress.jsx` — `#D7F550` → `st-lime`, `bg-black` → `bg-st-black`
- `SESSION_HANDOFF.md`, `SESSION_LOG.md`, `AI_SESSION_PLAN.md`, `SESSION_STATE.md`, `IMPLEMENTATION_GAP_LIST.md`, `BUG_REVIEW_LOG.md` — updated

Session 84.5:
- `dashboard/src/pages/Dashboard.jsx` — replaced time range pill group + export button with `<FilterBar>`
- `SESSION_HANDOFF.md`, `SESSION_LOG.md`, `AI_SESSION_PLAN.md`, `SESSION_STATE.md`, `IMPLEMENTATION_GAP_LIST.md`, `BUG_REVIEW_LOG.md` — updated

Session 84.4:
- `dashboard/src/components/Layout.jsx` — sidebar nav active (`bg-st-lime/10 text-st-black`), admin link active (`bg-st-lime/20 text-st-black`), Live badge (`bg-st-lime/20 text-st-black`)
- `dashboard/src/pages/Dashboard.jsx` — 2 Create Report CTAs (`bg-st-black hover:bg-st-black/90`)
- `SESSION_HANDOFF.md`, `SESSION_LOG.md`, `AI_SESSION_PLAN.md`, `SESSION_STATE.md`, `IMPLEMENTATION_GAP_LIST.md`, `BUG_REVIEW_LOG.md` — updated

Session 84.3:
- `dashboard/src/pages/Dashboard.jsx` — added `EmptyState` import, `.st-container` wrapper, replaced Revenue Trend & AI Sources inline empty states with `<EmptyState>` component
- `SESSION_HANDOFF.md`, `SESSION_LOG.md`, `AI_SESSION_PLAN.md`, `SESSION_STATE.md`, `IMPLEMENTATION_GAP_LIST.md` — updated

Session 83.2:
- `dashboard/index.html` — added Inter font Google Fonts link
- `dashboard/tailwind.config.js` — added `st` color namespace + Inter font family
- `dashboard/src/index.css` — added `.st-container` utility class
- `dashboard/src/components/DashboardTable.jsx` — new component
- `dashboard/src/components/FilterBar.jsx` — new component
- `dashboard/src/components/EmptyState.jsx` — new component
- `dashboard/src/pages/DesignSystem.jsx` — new visual test page
- `dashboard/src/App.jsx` — added `/design-system` route
- `AI_SESSION_PLAN.md`, `SESSION_STATE.md`, `SESSION_LOG.md`, `IMPLEMENTATION_GAP_LIST.md`, `SESSION_HANDOFF.md` — updated

## Still needs manual QA

Manual QA items are tracked in `MANUAL_QA_BACKLOG.md`. All Sessions 75–80 items remain Pending.

**Static checks completed (Session 82.2):**
- [x] `node --check api/index.js` ✓
- [x] `node --check api/routes/track.js` ✓
- [x] `node --check api/routes/conversion.js` ✓
- [x] `node --check api/routes/attribution.js` ✓
- [x] `node --check api/routes/events.js` ✓
- [x] `node --check api/routes/saved-reports.js` ✓
- [x] `node --check api/lib/attribution-engine.js` ✓
- [x] `npm run build` (dashboard) ✓

**Browser QA deferred (requires human with running app):**
- Sessions 75–80 checklist items in `MANUAL_QA_BACKLOG.md`
- BUG_REVIEW_LOG items #1–4 (HogQL column ordering, AI filter edge case, resetReport race condition, ref_param fallback)
- Run test URLs: `http://localhost:8080/sourcetrack-test.html?utm_source=google&utm_medium=cpc&utm_campaign=session78` etc.

## Standard checks

Backend:

    cd "$HOME/Desktop/trackiq"
    node --check api/index.js
    node --check api/routes/track.js
    node --check api/routes/conversion.js
    node --check api/routes/attribution.js
    node --check api/lib/attribution-engine.js

Dashboard:

    cd "$HOME/Desktop/trackiq/dashboard"
    npm run build

Tracker, only if tracker source changed:

    cd "$HOME/Desktop/trackiq"
    npm run build:tracker

## Docs note

- `DOCS_INDEX.md` and `PROJECT_CONTEXT_COMPACT.md` now exist and should be read before future coding sessions.
- `FIGMA_DESIGN_SYSTEM.md` and `DASHBOARD_FEATURE_GAP.md` renamed (dropped `_UPDATED` suffix).
- `PROGRESS.md` and `DEEPSEEK.md` remain historical archives — do not treat as proof of current implementation.
- Figma-derived docs are design specs and must be verified against code before claiming live implementation.
- Session 82.1 tracking files created: `AI_SESSION_PLAN.md`, `SESSION_STATE.md`, `SESSION_LOG.md`, `IMPLEMENTATION_GAP_LIST.md`, `BUG_REVIEW_LOG.md`, `AGENTS.md`, `COMMANDCODE_RUNBOOK.md`.
- `DOCS_INDEX.md` updated with all new tracking files.

## Session 82.2 handoff

- **Checks passed:** All 7 backend files `node --check` clean. Dashboard `npm run build` passes.
- **No code changed:** Implementation files untouched.
- **Browser QA deferred:** Sessions 75–80 checklists remain Pending in `MANUAL_QA_BACKLOG.md`.
- **BUG_REVIEW_LOG:** 4 potential issues (#1–4) remain open for runtime verification.
- **Next recommended session:** 83.1 — Figma tokens / shared UI primitives repo audit. Branch: `session-83-figma-tokens`.

## Rules reminder

- Read `RULES.md`, `AGENT_BRIEF.md`, `PROJECT_CONTEXT_COMPACT.md`, `SESSION_HANDOFF.md`, and `KNOWN_ISSUES.md` at the start of every coding session.
- Use `DOCS_INDEX.md` to find task-specific docs.
- Treat `PROGRESS.md` as history, not proof.
- Verify behavior in code and QA before claiming fixed.
- Make surgical changes only.
- Do not overclaim Cometly/DataFast/Usermaven parity.
- If `tracker/tracker.js` changes, rebuild `tracker/tracker.min.js`.
