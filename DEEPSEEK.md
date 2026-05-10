# DEEPSEEK.md — TrackIQ

## Role
Use DeepSeek for Session 1 and Session 2.
Primary strengths: scaffold generation, backend boilerplate, dashboard implementation, SQL-heavy work.

## DeepSeek guardrails
- Output complete files. Never output partial code or “rest unchanged”.
- Do not add new libraries unless the session prompt explicitly requests them.
- Do not invent PostHog properties, SQL tables, or API endpoints.
- Do not refactor working code unless the prompt explicitly asks for refactoring.
- If uncertain, write `TODO: confirm` instead of guessing.
- Do not add billing logic.
- Do not add AI chat provider logic.

## Session memory
Update this file after each DeepSeek session with:
- Files created or modified
- What was completed
- Any known TODOs or unresolved issues

### Session 2 — Attribution + Dashboard
**Files created:**
- api/lib/posthog.js — added queryHogQL function
- api/lib/attribution-engine.js — 4 attribution models with caching
- api/routes/attribution.js — GET /api/attribution
- api/routes/journey.js — GET /api/journey/:visitorId
- dashboard/ — full Vite React app with all pages

**Files modified:**
- api/index.js — mounted attribution and journey routes

**Completed:**
- HogQL query function with 15s timeout via AbortController
- First-touch, last-touch, linear, AI platform attribution queries
- Attribution and journey API endpoints with validation
- Dashboard with Supabase auth, login/signup, protected routes
- KPI cards, attribution chart with model tabs, AI platform cards
- Report builder with date/model/chart type filters
- Visitor journey page with search and timeline
- Snippet page with copy-to-clipboard
- Settings page with site CRUD
- AI Chat placeholder page
- Dashboard build passes (638KB JS, 17KB CSS)

**TODOs:**
- pageview visible in PostHog UI (need valid site_key with data)
- POSTHOG_PERSONAL_API_KEY needed in .env for HogQL queries

### Install Flow
**Files created:**
- tracker/loader.js — hosted loader with validation, async loading, call queuing, double-init guard
- api/routes/install.js — GET /api/install/status endpoint

**Files modified:**
- tracker/tracker.js — added install_verified event, identify/page methods, __trackiq namespace
- api/index.js — added express.static('tracker') + mounted install route
- dashboard/src/pages/Snippet.jsx — rewritten as Install page with status badge, test button
- dashboard/src/components/Layout.jsx — sidebar label "Snippet" → "Install"
- package.json — build:tracker now builds loader.min.js too

**Completed:**
- Single-script install snippet: `<script async src=".../tracker/loader.min.js" data-site-key="KEY"></script>`
- Loader validates site_key, derives api_url from script src, loads tracker asynchronously
- Call queuing: window.trackiq.identify/event/conversion/page work before tracker loads
- Double-init guard via window.__trackiq_loaded
- install_verified custom event fires on first pageview
- Dashboard shows install status (not_installed/verified), last event time, domain
- Test Install button checks /api/install/status
- Loader: 1.2kb minified, Tracker: 3.0kb minified

### Revenue Attribution Views
**Files modified:**
- api/lib/attribution-engine.js — added avg_conversion_value metric, date dimension, ASC order for time-series
- api/routes/attribution.js — added avg_conversion_value + date to allowed sets
- dashboard/src/pages/Dashboard.jsx — rewritten with revenue-by-model, revenue-over-time chart, revenue table, account placeholder
- dashboard/src/pages/ReportBuilder.jsx — added avg_conversion_value to METRICS

**Completed:**
- Revenue-by-model comparison: 4 KPI cards showing total revenue per attribution model
- Revenue-over-time: daily line chart using flexible report with group_by=date
- Revenue-by-source table: source, conversions, revenue, avg conversion value columns
- Account/company reporting placeholder with TODO: confirm identity source markers
- avg_conversion_value metric available in Report Builder
- Backend: formatDateTime(timestamp, '%Y-%m-%d') for daily grouping
### Segmentation, Cohorts + Alerts
**Files created:**
- api/routes/cohorts.js — GET /weekly (first-seen by week) + GET /ai-source (AI source by cohort)
- api/routes/alerts.js — GET /alerts with 4 threshold-based alert rules

**Files modified:**
- api/lib/attribution-engine.js — getFlexibleReport accepts filters object, adds WHERE clauses to SQL + session subquery
- api/routes/attribution.js — accepts filter_source/medium/campaign/ai_source/country/device_type/is_conversion params
- api/index.js — mounted cohorts + alerts routers
- dashboard/src/pages/Dashboard.jsx — alerts section with severity badges, comparison, suggested actions
- dashboard/src/pages/ReportBuilder.jsx — segment filter UI with 7 inputs, toggle, clear, wired to backend

**Completed:**
- 7 segment filter dimensions: source, medium, campaign, ai_source, country, device_type, is_conversion
- Weekly cohorts: users first-seen by week with conversion rates
- AI source cohorts: AI traffic by first-seen week
- 4 alert types: traffic drop (50% WoW), conversion drop (70% DoD), AI traffic low, install silent (24h)
- Alerts show severity (high/medium), metric name, comparison period, suggested action
- Segment filters integrated with report builder — filters pass to backend as query params
- Dashboard build: 1981 modules, 880KB JS

### Data Hygiene + Integrations
**Files created:**
- api/routes/hygiene.js — GET /utms with 5 issue detectors
- api/routes/export.js — GET /export/report CSV export with escaping

**Files modified:**
- api/routes/track.js — normalizeUtm() trims + lowercases all UTM fields
- api/index.js — mounted hygiene + export routers
- dashboard/src/pages/EventDebugger.jsx — Data Quality panel with hygiene issues
- dashboard/src/pages/ReportBuilder.jsx — CSV export button with Download icon
- dashboard/src/pages/Settings.jsx — ignored referrers placeholder with TODO

**Completed:**
- UTM normalization: trim whitespace + lowercase on source, medium, campaign, content, term
- 5 hygiene checks: missing UTM source, campaign naming inconsistencies, unknown referrers, missing conversion values, low activity days
- CSV export: proper CSV escaping (quotes, commas, newlines), filters support, Content-Disposition header
- Data Quality panel in Event Debugger with amber/red severity styling
- Report Builder CSV export button next to Save, opens download in new tab
- Ignored referrers defaults shown in Settings with TODO: confirm for config persistence
- Dashboard build: 1981 modules, 884KB JS

### Session 14 — Multi-dimensional Group By + Attribution Controls
**Files modified:**
- api/lib/attribution-engine.js — added groupBy2, timeGranularity, attributionWindow params; GRANULARITY_MAP; dual-dim SQL/result handling
- api/routes/attribution.js — added group_by2, time_granularity, attribution_window validation and forwarding
- dashboard/src/pages/ReportBuilder.jsx — added state/controls for groupBy2, granularity pills (day/week/month/quarter/year), attribution window, attribute by; updated chart/table 2D rendering; updated save/persist
- dashboard/src/pages/Dashboard.jsx — updated getFlexibleReport to forward new params; updated widget query call
- PROGRESS.md — added Session 14 section

**Completed:**
- Multi-dimensional group-by (primary + secondary) with all 8 dimensions
- Time granularity re-enabled: day/week/month/quarter/year using formatDateTime
- Granularity controls shown only when Time is in either group-by position
- Attribution Window (LTV + 1/7/14/30/60/90 days) using interval-based lookback
- Attribute By dropdown (Conversion Date only; no-op pass-through in backend)
- Chart labels flatten 2D results (dim_value / dim_value2)
- Table renders dim_value2 column when secondary grouping active
- All new fields persisted in saved reports, dashboard widgets, edit-from-dashboard flow

**TODOs:**
- TODO: confirm — verify week (%Y-W%V) and quarter (%Y-Q) format strings on PostHog ClickHouse
- TODO: confirm — LTV attribution window currently no-op; needs touch-to-conversion time diff logic
- TODO: confirm — Attribute By only supports conversion_date; future: First Seen Date, Original Source Date
- attributeBy is wired end-to-end in UI → report state → API route → engine (no-op for conversion_date, accepts future values)

### Session 15 — UX & Preset Polish
**Files modified:**
- dashboard/src/pages/ReportBuilder.jsx — PRESETS expanded with explicit groupBy2, granularity, attributionWindow, attributeBy defaults; applyPreset now resets all fields; helper text added for attribution controls and AI filters; AI metric descriptions improved

**Completed:**
- Presets now fully reset all Session 14 fields on selection, eliminating stale-state bugs
- Attribution Window and Attribute By dropdowns now include plain-English helper text
- AI metric descriptions made clearer for non-technical users
- "Has AI Source" filter includes explanation of what it does
- Dashboard build passes (1981 modules)

**TODOs:**
- No new TODOs — all changes were copy/UX polish only

### Session 16 — AI Dashboard + Identity Phase 1
**Files modified:**
- dashboard/src/pages/Dashboard.jsx — added AI Sources Performance section with AI Revenue Share card, Top AI Sources table, AI Revenue Trend chart; added KPI deltas (Revenue, Conversions, Sessions, Leads) comparing current vs previous 30 days
- dashboard/src/pages/ReportBuilder.jsx — renamed Step 5 heading "Attribution Model" → "Attribution"
- api/index.js — added startup env validation for POSTHOG_API_KEY, POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID
- api/routes/identify.js — added ph.alias() support for identity stitching + $set_once for first-touch properties

**Completed:**
- AI Sources Performance: AI revenue share %, top 5 AI source table, 30-day trend chart
- KPI deltas: green/red % change indicators on all four main KPIs
- Step numbering now shows "Attribution" label (covers model + window + attribute-by)
- API fails fast on missing PostHog env vars
- Identify route now supports alias() for anonymous → identified user merging
- Dashboard build: 1981 modules, passes

**TODOs:**
- [x] Tracker first_touch_* on identify calls — completed Session 30
- TODO confirm — user_id must be provided from auth layer for alias() to activate

### Session 17 — Onboarding Flow
**Files created:**
- api/routes/onboarding.js — status, update, complete endpoints for onboarding state tracking
- dashboard/src/pages/Onboarding.jsx — 6-step guided onboarding wizard
- dashboard/src/components/OnboardingProgress.jsx — step progress bar component
- dashboard/src/components/OnboardingCard.jsx — reusable step card wrapper
- supabase/migration_onboarding.sql — sites table schema additions

**Files modified:**
- api/routes/install.js — added /snippet endpoint for dynamic script generation
- api/index.js — mounted onboarding router
- dashboard/src/pages/Login.jsx — post-signin redirect logic
- dashboard/src/pages/Signup.jsx — post-signup redirect logic
- dashboard/src/components/Layout.jsx — onboarding mode (no sidebar/header)

**Completed:**
- 6-step onboarding flow: Connect Domain → Business Type → Install Method → Instructions → Conversions → Verify
- Domain validation with duplicate/localhost checks
- Business-type-aware conversion defaults (eCommerce→Purchase, SaaS→Trial+Meeting, LeadGen→Lead)
- GTM and Standard installation paths with copy/paste snippet from /api/install/snippet
- Verification with 30-second polling, success/fail/waiting states, retry
- Onboarding state persisted to sites.onboarding_state JSONB
- Post-signup redirects to onboarding, post-completion to dashboard
- Dashboard build: 1983 modules, passes

**TODOs:**
- [x] Tracker first_touch props on identify — completed Session 30
- Custom conversion creation
- Watch Video modal content
- [x] Dashboard seeding by business type — completed Session 31
- Multi-site onboarding
- Agency/client mode
- Multi-site onboarding
- Agency/client mode

### Session 18 — Dashboard Screen Design Pass
**Files created:**
- dashboard/src/components/DashboardCard.jsx — reusable card wrapper
- dashboard/src/components/MetricTile.jsx — KPI metric display with delta
- dashboard/src/components/StatusBadge.jsx — status pill component
- dashboard/src/pages/Leads.jsx — leads list with search and AI filtering
- dashboard/src/pages/Campaigns.jsx — attribution page with dimension switcher
- dashboard/src/pages/Integrations.jsx — install health and verification overview

**Files modified:**
- dashboard/src/pages/Dashboard.jsx — completely redesigned with proper hierarchy: header toolbar, 5-KPI strip, 7 card sections in responsive grid
- dashboard/src/components/Layout.jsx — added top header bar, page titles, expanded navigation (Leads, Campaigns, Integrations, Bot icon)
- dashboard/src/App.jsx — added /leads, /campaigns, /integrations routes

**Completed:**
- Unified card system: DashboardCard (title/subtitle/actions/menu), MetricTile (icon/value/delta), StatusBadge (8 styles)
- Performance Overview dashboard with KPI strip and 9 content cards in responsive grid
- SourceTrack-specific content: AI sources with sparkline, source attribution with share %, conversion events, landing pages, tracking health
- All cards handle loading/empty/error states
- Leads page: searchable, filterable by AI/non-AI, journey CTA per row
- Campaigns page: dimension tabs (source/campaign/medium/AI source), bar chart + table
- Integrations page: install status, snippet with copy, data health summary with alerts
- Onboarding mode preserved in Layout
- Dashboard build: 1989 modules, passes

**TODOs:**
- Per-type conversion counts not available from current aggregation
- AI revenue previous period not separately queried for delta
- Campaigns chart uses Bar from chart.js (adequate for current scope)

### Session 19 — SourceTrack Visual Unification
**Files modified:**
- All page files (Settings, Snippet, EventDebugger, AIChat, Journey, Login, Signup, ReportBuilder, Dashboard, Leads, Campaigns, Integrations, Onboarding) + Layout.jsx + App.jsx — replaced indigo-600 color system with black/gray primary + lime accent throughout

**Completed:**
- Unified color system: primary buttons gray-900, focus rings gray-900, active states lime-100/lime-800, hover states gray-50
- Report Builder step badges now lime accent (logic unchanged)
- Brand logo text (indigo-600) intentionally preserved on Login/Signup/Onboarding headers
- All links, spinners, timeline borders unified to gray-900/gray-200
- Fixed "TrackIQ" → "SourceTrack" text in Snippet page
- Sidebar already includes Report Builder correctly
- Dashboard build: 1989 modules, passes

**TODOs:**
- None

### Session 29 — Lead Detail Page
**Files created:**
- dashboard/src/pages/LeadDetail.jsx — lead detail view

**Files modified:**
- api/routes/leads-server.js — added first_touch_source/medium fields
- dashboard/src/App.jsx — added /leads/:leadId route
- dashboard/src/pages/Leads.jsx — added View button per row

**Completed:**
- Lead Detail page with header, KPIs, attribution card, activity summary, journey CTA
- Backend returns first_touch_source and first_touch_medium for attribution display
- No fabricated identity data
- Dashboard build: 1990 modules, passes

**TODOs:**
- Journey preview not implemented — CTA button used instead

### Session 30 — Identity Completion (Tracker + Identify)
**Files modified:**
- tracker/tracker.js — identify now sends first-touch properties + user_id
- api/routes/identify.js — removed stale TODO comment

**Completed:**
- Tracker identify() sends first_touch_source/medium/campaign from existing __ti_ft_ cookie
- identify() extracts user_id from traits, sends it for aliasing
- Anonymous-only flow unchanged
- Tracker: 3.3kb minified, Loader: 1.2kb
- Dashboard build: 1990 modules, passes

**TODOs:**
- user_id must be supplied by the integrating site

### Session 31 — Dashboard Seeding by Business Type
**Files created:**
- dashboard/src/lib/seedReports.js — seed definitions + idempotent logic

**Files modified:**
- dashboard/src/pages/Onboarding.jsx — calls seed after completion

**Completed:**
- 5 starter reports per business type (eCommerce/SaaS/LeadGen) with business-appropriate metrics
- Reports use only existing metrics, dimensions, models, and filters
- Idempotent via `sourcetrack_seeded_v1` flag
- Dashboard build: 1991 modules, passes

**TODOs:**
- Reports seeded to Report Builder, not the fixed-layout Dashboard

### Session 26 — Campaigns Backend
**Files created:**
- api/routes/campaigns.js — GET /overview endpoint

**Files modified:**
- api/index.js — mounted campaignsRouter
- dashboard/src/pages/Campaigns.jsx — rewired to new endpoint

**Completed:**
- `/api/campaigns/overview` returns KPIs + rows with real revenue, conversions, trend data
- 4 dimensions supported: source, medium, campaign, ai_source
- Trend now real (revenue % change vs previous period) — was hardcoded position icons
- ROAS column removed — spend data not tracked
- Server-side search/status filtering
- Dashboard build: 1989 modules, passes

**TODOs:**
- Spend data not available for ROAS

### Session 27 — Integrations Backend
**Files created:**
- api/routes/integrations.js — GET /overview endpoint

**Files modified:**
- api/index.js — mounted integrationsRouter
- dashboard/src/pages/Integrations.jsx — rewired to single endpoint

**Completed:**
- `/api/integrations/overview` aggregates install status, hygiene issues, and alerts in one call
- 10 parallel HogQL queries replace 3 separate API calls from the frontend
- Each hygiene issue shown individually in Data Health panel
- Visual design preserved unchanged
- Dashboard build: 1989 modules, passes

**TODOs:**
- Integration connector logic (OAuth/API keys/sync) not implemented
- 6 integration cards remain placeholders

### Session 28 — QA & Consistency Pass
**Files modified:**
- dashboard/src/pages/Dashboard.jsx — chart COLORS aligned with SourceTrack palette
- dashboard/src/pages/Settings.jsx — snippet format modernized

**Completed:**
- Dashboard COLORS updated to gray/lime palette (was indigo/blue)
- Settings snippet updated to loader.min.js format (was old tracker.min.js)
- Full audit: all pages consistent in loading states, empty states, error states, tables, buttons, pills, spacing
- No TrackIQ text remains in frontend code
- Dashboard build: 1989 modules, passes

**TODOs:**
- None — visual unification complete for current pages

### Session 20 — Dashboard Backend Consolidation
**Files created:**
- api/routes/dashboard.js — GET /overview endpoint returning structured dashboard payload

**Files modified:**
- api/index.js — mounted dashboardRouter
- dashboard/src/pages/Dashboard.jsx — replaced 15+ individual queries with single useQuery

**Completed:**
- `/api/dashboard/overview` returns kpis, models, ai_sources, ai_trend, sources, landing_pages, campaigns, revenue_trend, install, health, alerts in one call
- Uses existing getFlexibleReport and getAttribution server-side
- Frontend reduced from 15+ queries to 1
- All visual components preserved unchanged
- Dashboard build: 1989 modules, passes

**TODOs:**
- Per-type conversion counts not available from current aggregation
- AI revenue previous period delta still absent

### Session 21 — Leads Backend for List/Detail/Journey Flow
**Files created:**
- api/routes/leads-server.js — GET / and GET /:leadId endpoints for individual lead data

**Files modified:**
- api/index.js — mounted leadsRouter
- dashboard/src/pages/Leads.jsx — rewritten to show individual lead rows with KPIs
- dashboard/src/pages/Journey.jsx — added visitorId query param auto-populate

**Completed:**
- `/api/leads` returns distinct visitors from events with aggregated stats (source, conversions, revenue, last seen, country)
- Leads page now shows individual visitors with AI badges, journey button, debounced search
- Journey page auto-populates from ?visitorId= URL param
- KPI tiles at top: Total Leads, Total Conversions, Total Revenue
- Dashboard build: 1989 modules, passes

**TODOs:**
- Person identity (email/name) not available from current event data
- Lead detail frontend page not yet built (API endpoint exists)

### Session 22 — Campaigns Design-Only Refinement
**Files modified:**
- dashboard/src/pages/Campaigns.jsx — complete visual overhaul with filter bar, enhanced table, status pills, trend column

**Completed:**
- New filter bar: search input, date-range pills (7/30/90d), status dropdown, result count
- 5 KPI tiles: Total Revenue, Conversions, Active Channels, Avg Value, Date Range
- Enhanced table: 7 columns (Name, Status, Revenue, Conversions, Avg Value, ROAS, Trend)
- Status pills computed from conversion count (Active ≥10, Low Volume 1-9, No Activity 0)
- ROAS column placeholder with TODO — spend data not yet available
- Trend column uses position-based icons (not real data) — TODO for future
- Revenue Breakdown chart in sidebar
- UI-first data note banner
- Dashboard build: 1989 modules, passes

**TODOs:**
- Spend/ad-spend data not available for ROAS
- Trend data from previous periods not available
- Campaign detail screens not implemented

### Session 23 — Integrations Design-Only Refinement
**Files modified:**
- dashboard/src/pages/Integrations.jsx — complete visual overhaul with status tiles, enhanced installation card, future integrations grid, tracking method section

**Completed:**
- 4 status overview tiles: Install Status, Site, Active Alerts, Hygiene
- Installation card with last event details, copy snippet, verification warning
- Data Health card with issue listing or all-clear state
- Future Integrations grid: 6 placeholder cards (Google Ads, Facebook, Shopify, GA, HubSpot, Webhook) — all grayed out with "Coming soon"
- Tracking Method section showing current installation type
- Page note: backend consolidation planned for later sessions
- Dashboard build: 1989 modules, passes

**TODOs:**
- Integration connector logic (OAuth/API keys/sync) not implemented
- All 6 integration cards are visual placeholders
- Backend consolidation planned for future session

### Session 24 — Onboarding Hardening
**Files modified:**
- api/routes/onboarding.js — added step validation, step-data validation, completion guards
- dashboard/src/pages/Onboarding.jsx — fixed step transition saving

**Completed:**
- Step validation: rejects invalid step numbers, backward progression, non-sequential jumps
- Step-data validation: valid business_type/install_method/conversion keys enforced
- Completion guards: must reach step 6, must have business_type+install_method, prevents duplicate completion
- Frontend step saving now correctly saves 2→3→4→5→6 sequence
- Dashboard build: 1989 modules, passes

**TODOs:**
- Verification is client-side only — backend trusts client for completion
- No server-side install status check at completion time

### Session 25 — Report Builder Visual Alignment
**Files modified:**
- dashboard/src/pages/ReportBuilder.jsx — chart palette refined, Quick Start and saved reports polished

**Completed:**
- Chart COLORS updated to SourceTrack gray/lime palette (was vibrant indigo/blue)
- Line chart borderColor changed from indigo to gray-900
- Quick Start presets restyled with bg-gray-50 + border on hover
- Saved Reports section polished with hover backgrounds and refined action buttons
- All functionality preserved unchanged
- Dashboard build: 1989 modules, passes

**TODOs:**
- None