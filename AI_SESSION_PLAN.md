# AI Session Plan

This file contains the prioritized implementation plan for upcoming sessions.  
Update at the end of each session to reflect completed work and revised priorities.

## Priority Framework

- **P0** = Correctness, security/scope, broken UX, manual QA blockers
- **P1** = Design foundation and shared UI system
- **P2** = Core Figma dashboard/product UX alignment
- **P3** = Business-specific dashboard expansion
- **P4** = Deeper competitor-parity analytics expansion

## Session Plan

### Session 82.1: Bootstrap tracking files

- **Branch:** `session-80-saved-report-management-ux` (bootstrap)
- **Status:** Complete
- **Objective:** Create project tracking infrastructure before starting Session 82.
- **Deliverables:**
  - `AI_SESSION_PLAN.md`, `SESSION_STATE.md`, `SESSION_LOG.md`
  - `IMPLEMENTATION_GAP_LIST.md`, `BUG_REVIEW_LOG.md`
  - `AGENTS.md`, `COMMANDCODE_RUNBOOK.md`
  - Updated `DOCS_INDEX.md`, `SESSION_HANDOFF.md`
- **Risk level:** N/A

### Session 82.2: Static validation + regression audit

- **Branch:** `session-81-figma-design-context`
- **Status:** Complete — static validation passed; browser QA deferred
- **Objective:** Run static checks, review BUG_REVIEW_LOG, defer browser QA.
- **Completed:**
  - All 7 backend files pass `node --check`
  - Dashboard `npm run build` passes
  - BUG_REVIEW_LOG reviewed — 0 confirmed runtime bugs, 4 potential issues remain open
- **Deferred:** Browser-based manual QA (Sessions 75–80 checklists in `MANUAL_QA_BACKLOG.md`)
- **Implementation code:** Not touched
- **Risk level:** Low

### Session 83.1: Figma tokens / shared UI primitives repo audit

- **Branch:** `session-83-figma-tokens`
- **Status:** Complete
- **Risk level:** Low

### Session 83.2: Implement token layer

- **Branch:** `session-83-figma-tokens`
- **Status:** Complete
- **Deliverables:**
  - Inter font via Google Fonts (Switzer unavailable)
  - `st` color namespace in Tailwind config
  - `.st-container` 1320px max-width wrapper
  - New components: `DashboardTable`, `FilterBar`, `EmptyState` (83.3 done early)
  - Visual test page at `/design-system` (83.4 done early)
- **Not changed:** No existing app pages restyled
- **Risk level:** Low

### Session 83.5: Session 83 stabilization, bug review, and handoff

- **Branch:** `session-83-figma-tokens`
- **Status:** Complete — 2 minor fixes; build passes; ready for Session 84
- **Fixes applied:**
  - DashboardTable.jsx: added keyboard accessibility to clickable rows (tabIndex, role, onKeyDown)
  - DesignSystem.jsx: added OnboardingCard demo (was imported but unused)
- **Risk level:** Low

### Session 84.1: Dashboard shell/card/table visual alignment repo audit

- **Branch:** `session-84-dashboard-shell`
- **Status:** Complete — audit done; implementation plan ready
- **Findings:** 5 raw tables, 6+ inline empty states, no st-container wrapper, sidebar/time range/CTA colors outdated
- **Risk level:** Low (audit only)

### Session 84.2: Dashboard shell/card/table visual alignment implementation

- **Branch:** `session-84-dashboard-shell`
- **Status:** Complete — 5 raw tables replaced with DashboardTable
- **Objective:** Apply P1 primitives to existing dashboard page.
- **Scope:**
  - Restyle `Dashboard.jsx` tables with DashboardTable primitive
- **Completed:**
  - Replaced 5 raw tables: Recent Leads, AI Sources, Revenue Source Attribution, Landing Pages, Campaigns
  - All values, formatting, status badges, empty messages preserved
  - `npm run build` passes
- **Risk level:** Medium

### Session 84.3: Dashboard wrapper + EmptyState integration

- **Branch:** `session-84-dashboard-shell`
- **Status:** Complete
- **Objective:** Add `.st-container` wrapper and replace inline empty states with `<EmptyState>`.
- **Completed:**
  - Added `.st-container` to Dashboard root wrapper
  - Replaced Revenue Trend "No data yet" inline empty state with `<EmptyState>` (TrendingUp icon)
  - Replaced AI Sources custom empty state with `<EmptyState>` (Sparkles icon + "Set up tracking" action)
  - `npm run build` passes, `git diff --check` clean
- **Risk level:** Low

### Session 84.4: Dashboard/Layout token color alignment

- **Branch:** `session-84-dashboard-shell`
- **Status:** Complete
- **Objective:** Safe st-token replacements for sidebar active, CTA buttons, and Live badge.
- **Completed:**
  - Layout.jsx: sidebar nav active `bg-gray-100 text-gray-900` → `bg-st-lime/10 text-st-black`
  - Layout.jsx: admin link active `bg-lime-100 text-lime-800` → `bg-st-lime/20 text-st-black`
  - Layout.jsx: Live badge `bg-lime-100 text-lime-800` → `bg-st-lime/20 text-st-black`
  - Dashboard.jsx: 2 Create Report CTAs `bg-gray-900 hover:bg-gray-800` → `bg-st-black hover:bg-st-black/90`
- **Skipped:** Chart color (#D7F550), text hierarchy, data-viz fills
- **Risk level:** Low

### Session 84.5: Dashboard FilterBar integration

- **Branch:** `session-84-dashboard-shell`
- **Status:** Complete
- **Objective:** Replace Dashboard time range pill group + export button with `<FilterBar>`.
- **Completed:**
  - Imported `FilterBar` from `../components/FilterBar`
  - Replaced time range pills (352-363) + export button (365-368) with single `<FilterBar>`
  - `dateButtons` mapped from `TIME_RANGES` (days → key)
  - `activeDate={timeRange}`, `onDateChange={setTimeRange}`, `onExport={handleExport}`
  - `npm run build` passes
- **Risk level:** Low

### Session 84.6: Dashboard stabilization and handoff

- **Branch:** `session-84-dashboard-shell`
- **Status:** Complete
- **Objective:** Final static review/build/docs pass for all Session 84 work.
- **Confirmed:**
  - All primitives wired: DashboardTable, st-container, EmptyState, st tokens, FilterBar
  - No data-fetching or query logic changed
  - Tracking docs reconciled (stale references fixed)
  - `npm run build` passes
  - Session 84 complete; ready for Session 85 (Onboarding)
- **Remaining gaps:** Chart color (#D7F550) deferred per guard rule. Text hierarchy not migrated.
- **Risk level:** None

### Session 85: Onboarding Figma alignment

- **Branch:** `session-85-onboarding-figma`
- **Status:** Complete
- **Objective:** Align onboarding with `ONBOARDING_FLOW_SPEC.md`.
- **Completed:**
  - 85.1: Full audit — onboarding flow, API, persistence all verified.
  - 85.2: Token color migration — 29 hex replacements across 3 files.
  - 85.3: Stepper audit — classified 5-vs-6 as product decision.
  - 85.4: Stabilization and handoff — all tokens verified, build passes.
- **Remaining:** Watch Video modal content placeholder. 5-vs-6 stepper decision deferred to product/design.
- **Risk level:** Low

### Session 86: Report Builder Figma-style polish

- **Branch:** `session-86-report-builder-figma`
- **Status:** Planned
- **Objective:** Apply P1 primitives to Report Builder without changing functionality.
- **Scope:** Restyle 7-step sidebar, presets, filters, save panel, preview area
- **Out of scope:** New presets, new metrics, new chart types
- **Risk level:** Low

### Session 87: Leads + Journey Figma alignment

- **Branch:** `session-87-leads-journey-figma`
- **Status:** Planned
- **Objective:** Restyle Leads page, build Journey modal per Figma.
- **Scope:** Leads table, Journey modal with lead summary card and activity timeline
- **Out of scope:** CRM integration, lead qualification backend
- **Risk level:** Medium

### Session 88: Campaigns Figma alignment + data model planning

- **Branch:** `session-88-campaigns-figma`
- **Status:** Planned
- **Objective:** Restyle Campaigns page, create dashboard implementation plan.
- **Scope:** Campaigns KPI row, table, filters, `DASHBOARD_IMPLEMENTATION_PLAN.md`
- **Out of scope:** Ad spend ingestion
- **Risk level:** Low

### Session 89: Revenue/General business dashboard

- **Branch:** `session-89-revenue-dashboard`
- **Status:** Planned
- **Objective:** Implement first business dashboard variant.
- **Scope:** Revenue dashboard with real-data widgets, empty-state placeholders for unsupported metrics
- **Out of scope:** Other variants, widget drag-and-drop
- **Risk level:** High

### Session 90: E-commerce + Lead Gen + SaaS dashboards

- **Branch:** `session-90-business-dashboards`
- **Status:** Planned
- **Objective:** Implement remaining 3 dashboard variants.
- **Scope:** E-commerce, Lead Gen, SaaS dashboards following same pattern as Revenue
- **Out of scope:** Ad spend, MRR pipeline, CRM sync
- **Risk level:** High

## Integration Strategy

- Each session uses its own branch off main
- After each session: `node --check` + `npm run build` + manual QA → merge to main
- No long-running integration branches
- Manual QA gates must pass before merge
