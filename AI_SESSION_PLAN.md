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

### Session 86: Report Builder Figma-style polish + bug-fix queue

- **Branch:** `session-86-report-builder-figma`
- **Status:** Bug-fix queue (B1–B8 + B2.1) complete and verified. Polish **deferred** — not started.
- **Deferred (86.3–86.6, postponed for later):**
  - 86.3: Report Builder safe Figma polish (st tokens + EmptyState)
  - 86.4: Static polish verification
  - 86.5: Manual/runtime QA
  - 86.6: Commit/handoff
- **Bug-fix queue — Complete:**
  - B1: Removed per-request `ph.shutdown()` from 4 route files
  - B2: Removed public POST /api/events aliases, added /api/collect
  - B2.1: Tracker non-conversion events now POST to /api/collect
  - B3: Fixed cross-domain first-touch serialization keys
  - B4: Fixed `getSessionReport()` ORDER BY undefined alias `e`
  - B5: Added `company_members` site-loading fallback for 4 dashboard pages
  - B6: Leads metric counts `$conversion` instead of `$identify`
  - B7: Fixed attribution window from date expansion to touchpoint-window JOIN
  - B8: Added 50K-row truncation detection + ReportBuilder warning banner
- **Validation:** All backend `node --check` passes. `npm run build:tracker` passes. Dashboard `npm run build` passes.
- **Caveats:** B6 leads/conversions duplication intentional (addressed in 90.4). B7 needs runtime HogQL QA. B2/B2.1 public endpoint is now /api/collect.
- **Risk level:** Low (bug fixes) / Medium (deferred polish)

### Session 90.1: Linear attribution model

- **Branch:** `session-90-backend-tracker` (created from `session-86-report-builder-figma` with verified B1–B8/B2.1 baseline). Do not recreate from main.
- **Status:** Planned
- **Objective:** Implement linear attribution model alongside existing single-touch models.
- **Type:** Backend only
- **Files:** `api/lib/attribution-engine.js`, `api/routes/attribution.js`
- **Risk level:** Medium

### Session 90.2: Days to Convert metric

- **Branch:** `session-90-backend-tracker`
- **Status:** Planned
- **Objective:** Add time-to-conversion metric to attribution engine.
- **Type:** Backend only
- **Files:** `api/lib/attribution-engine.js`, `api/routes/attribution.js`
- **Risk level:** Medium

### Session 90.3: Touchpoints per Conversion metric

- **Branch:** `session-90-backend-tracker`
- **Status:** Planned
- **Objective:** Count pageview touchpoints preceding each conversion.
- **Type:** Backend only
- **Files:** `api/lib/attribution-engine.js`, `api/routes/attribution.js`
- **Risk level:** Medium

### Session 90.4: Differentiate Leads from Conversions by conversion_type

- **Branch:** `session-90-backend-tracker`
- **Status:** Planned
- **Objective:** Filter leads metric by conversion_type (lead, signup, trial, etc.) so leads ≠ conversions.
- **Type:** Backend only
- **Files:** `api/lib/attribution-engine.js`
- **Risk level:** Low

### Session 90.5: Click ID capture

- **Branch:** `session-90-backend-tracker`
- **Status:** Planned
- **Objective:** Capture ad platform click IDs (gclid, fbclid, etc.) from URL parameters.
- **Type:** Tracker + API routes
- **Files:** `tracker/tracker.js`, `tracker/tracker.min.js`, `tracker/loader.min.js`, `api/routes/track.js`, `api/routes/conversion.js`
- **Risk level:** Medium

### Session 90.6: Cross-domain cookie domain config

- **Branch:** `session-90-backend-tracker`
- **Status:** Planned
- **Objective:** Add configurable cookie domain for cross-subdomain tracking.
- **Type:** Tracker only
- **Files:** `tracker/tracker.js`, `tracker/tracker.min.js`, `tracker/loader.min.js`
- **Risk level:** Medium

### Session 90.7: Cookieless fingerprint fallback

- **Branch:** `session-90-backend-tracker`
- **Status:** Planned
- **Objective:** Generate and persist anonymous visitor fingerprints when cookies are blocked.
- **Type:** Tracker only
- **Files:** `tracker/tracker.js`, `tracker/tracker.min.js`, `tracker/loader.min.js`
- **Risk level:** High

### Session 90.8: Server-side tracking API

- **Branch:** `session-90-backend-tracker`
- **Status:** Planned
- **Objective:** Add API-key-authenticated server-side event ingestion endpoint.
- **Type:** Backend + migration
- **Files:** `supabase/migration_server_api_keys.sql`, `api/routes/server-events.js`, `api/index.js`
- **Risk level:** Medium

### Session 90.9: Mark as Qualified backend

- **Branch:** `session-90-backend-tracker`
- **Status:** Planned
- **Objective:** Add lead qualification endpoint (PATCH visitor status).
- **Type:** Backend + migration
- **Files:** `supabase/migration_lead_qualification.sql`, `api/routes/leads-server.js`
- **Risk level:** Medium

### Session 90.10: Stripe revenue webhook

- **Branch:** `session-90-backend-tracker`
- **Status:** Deferred — not cancelled. Requires Stripe signing secret configuration not yet available.
- **Objective:** Ingest Stripe checkout.session.completed events as revenue conversions.
- **Type:** Backend + migration
- **Files:** `supabase/migration_revenue_events.sql`, `api/routes/stripe-revenue.js`, `api/index.js`
- **Risk level:** High

### Session 90.11: Campaign costs backend

- **Branch:** `session-90-backend-tracker`
- **Status:** Deferred — not cancelled. Manual ad spend entry is deferred; cost/conversion sync will be handled later through Google Ads, Meta Ads, Microsoft Ads, and LinkedIn Ads integrations.
- **Objective:** Add campaign cost tracking table and API for ROI calculations.
- **Type:** Backend + migration
- **Files:** `supabase/migration_campaign_costs.sql`, `api/routes/costs.js`, `api/index.js`
- **Risk level:** Medium

### Session 90.12: Calendly webhook connector

- **Branch:** `session-90-backend-tracker`
- **Status:** Deferred — not cancelled. Calendly should be designed later as a full native integration flow similar to Cometly, not implemented now as a simple webhook-only connector.
- **Objective:** Accept Calendly booking webhooks and create conversion events.
- **Type:** Backend + migration
- **Files:** `api/routes/calendly.js`, `api/index.js`, `supabase/migration_calendly.sql`
- **Risk level:** Medium

### Session 91.1: Leads event type badges and attribution model filter

- **Branch:** `session-90-backend-tracker`
- **Status:** Complete
- **Objective:** Add conversion type badges and attribution model filter to All Leads page.
- **Deliverables:** Event type column with styled badges, attribution model dropdown (First Touch / Last Touch), backend `attribution_model` param support in leads-server.
- **Files:** `dashboard/src/pages/Leads.jsx`, `api/routes/leads-server.js`
- **Risk level:** Low

### Session 91.2: Journey modal overlay on All Leads

- **Branch:** `session-90-backend-tracker`
- **Status:** Complete
- **Objective:** Add journey modal overlay triggered from All Leads page.
- **Deliverables:** `JourneyModal` component, click-to-open from leads table, `getJourney` API integration, All Activity display, Sync To CRM / Mark as Qualified buttons (UI-only).
- **Files:** `dashboard/src/components/JourneyModal.jsx`, `dashboard/src/pages/Leads.jsx`
- **Caveat:** Mark as Qualified button is UI-only — backend wiring not complete.
- **Risk level:** Low

### Session 91.3: Report Builder KPI chart type

- **Branch:** `session-90-backend-tracker`
- **Status:** Complete
- **Objective:** Add KPI chart type showing one large metric with percent delta vs prior period.
- **Deliverables:** KPI option in CHART_TYPES, `getPriorPeriod` helper, `priorReportData` state + `useQuery`, KPI card UI with formatted value and delta, helper functions (`getKpiValue`, `formatKpiValue`, `formatKpiDelta`).
- **Files:** `dashboard/src/pages/ReportBuilder.jsx`
- **Risk level:** Low

### Session 91.4: Rolling vs fixed date toggle

- **Branch:** `session-90-backend-tracker`
- **Status:** Complete
- **Objective:** Add rolling date support so saved reports use dynamic "Last N days" instead of fixed dates.
- **Deliverables:** Rolling/Fixed toggle in ReportBuilder date section, `getRollingDateRange` helpers in ReportBuilder + Dashboard, `effectiveDateFrom`/`effectiveDateTo` in all queries, `isRolling`/`rollingDays` in save/load config, Dashboard recomputes rolling dates dynamically, rolling indicator on Dashboard saved report cards.
- **Files:** `dashboard/src/pages/ReportBuilder.jsx`, `dashboard/src/pages/Dashboard.jsx`
- **Risk level:** Low

### Session 91.5: Feature verification and docs update

- **Branch:** `session-90-backend-tracker`
- **Status:** Complete
- **Objective:** Verify Sessions 91.1–91.4, update tracking docs.
- **Type:** Docs + verification only. No implementation files edited.
- **Verification:** All greps confirmed, `node --check api/routes/leads-server.js` passed, `npm run build` passed.
- **Risk level:** None

### Session 90.13: Backend/tracker phase verification and docs closure

- **Branch:** `session-90-backend-tracker`
- **Status:** Planned
- **Objective:** Verify all 90.x implementations (90.1–90.9), update tracking docs, close backend/tracker phase.
- **Type:** Docs + verification only
- **Risk level:** Low

> **Branch note:** All 90.x sessions continue on `session-90-backend-tracker`, created from `session-86-report-builder-figma` with the verified B1–B8 + B2.1 bug-fix baseline preserved. Do not recreate from main — main is at Session 85.4 without the bug fixes.

### Session 87–89: Frontend/UI alignment (deferred)

Sessions 87 (Leads + Journey), 88 (Campaigns), and 89 (Revenue dashboard) remain planned for frontend Figma alignment, but run after backend/tracker Sessions 90.1–90.9.

### Session 90: Business dashboards (was E-commerce/Lead Gen/SaaS, now renumbered)

- **Status:** Planned — runs after 90.x backend/tracker and 87–89 frontend alignment.
- **Scope:** E-commerce, Lead Gen, SaaS dashboard variants.
- **Risk level:** High
- **Risk level:** High

## Integration Strategy

- Each session uses its own branch off main
- After each session: `node --check` + `npm run build` + manual QA → merge to main
- No long-running integration branches
- Manual QA gates must pass before merge
ong-running integration branches
- Manual QA gates must pass before merge
