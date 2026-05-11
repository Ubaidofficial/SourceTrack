# PROGRESS.md — TrackIQ

## Session 1 — Tracking Core
- [x] package.json with all deps and scripts
- [x] .gitignore, .env.example, railway.json
- [x] api/index.js: correct middleware order
- [x] api/middleware/rate-limit.js
- [x] api/middleware/auth.js
- [x] api/middleware/ai-platform.js
- [x] tracker/tracker.js complete
- [x] tracker/tracker.min.js built
- [x] POST /api/track works
- [x] POST /api/identify works
- [x] POST /api/conversion works
- [x] Supabase schema: sites table created with RLS
- [x] curl /health returns 200
- [ ] pageview visible in PostHog UI

## Session 2 — Attribution + Dashboard
- [x] api/lib/posthog.js
- [x] queryHogQL verified
- [x] attribution-engine.js complete
- [x] GET /api/attribution works
- [x] GET /api/journey/:visitorId works
- [x] Dashboard scaffolded
- [x] Supabase auth + protected routes
- [x] Dashboard KPIs + charts
- [x] Report builder
- [x] Journey page
- [x] Snippet page
## Segmentation, Cohorts + Alerts
- [x] Backend segment filters — filter_source, filter_medium, filter_campaign, filter_ai_source, filter_country, filter_device_type, filter_is_conversion
- [x] api/lib/attribution-engine.js — getFlexibleReport accepts optional filters object, adds WHERE clauses
- [x] api/routes/cohorts.js — GET /weekly (first-seen cohorts) + GET /ai-source (AI traffic by cohort)
- [x] api/routes/alerts.js — GET /alerts with 4 threshold checks (traffic drop, conversion drop, AI traffic low, install silent)
- [x] Dashboard — alerts section with severity labels, comparison periods, suggested actions
- [x] Report Builder — segment filter UI with 7 filter inputs, toggle show/hide, clear all
- [x] Segment filters flow into report builder queries via query params
## Data Hygiene + Integrations
- [x] UTM normalization — trim + lowercase on all UTM fields in track/conversion routes
- [x] api/routes/hygiene.js — GET /utms checks missing UTM source, campaign inconsistencies, unknown referrers, missing conversion values, low activity
- [x] api/routes/export.js — GET /export/report CSV export with proper escaping, filters support
- [x] Event Debugger — Data Quality panel showing hygiene issues with severity badges
- [x] Report Builder — CSV export button (Download icon next to Save)
- [x] Settings — Ignored referrers placeholder with hardcoded defaults (TODO: confirm persistence)
## Report Builder v2 (Cometly-style)
- [x] Guided 7-step flow: Name → Date → Metric → Group By → Model → Chart → Filters
- [x] Searchable metric selector with dropdown
- [x] Date presets: Last 7d, 30d, 90d, This month, Custom
- [x] Time granularity selector (Daily only; week/month — TODO: confirm HogQL support)
- [x] Chart types: Bar, Line, Pie, Table Only
- [x] 6 presets: AI Sources, Lead Sources, Campaign Revenue, Landing Pages, Conversion Trend, AI Revenue
- [x] Save / Edit / Duplicate / Delete saved reports (localStorage)
- [x] Add to Dashboard button (localStorage widgets)
- [x] CSV export with current filters
- [x] Live preview with empty state guidance
- [x] Pie chart support (ArcElement registration)
## Dashboard Customization + Rename
- [x] Renamed TrackIQ → SourceTrack in user-facing text (HTML title, Layout brand, Login/Signup headers)
- [x] Multi-dashboard system — create, rename, delete, duplicate dashboards (localStorage)
- [x] Dashboard selector dropdown in header with switch, rename inline, delete/duplicate
- [x] Report widgets on dashboard — cards with metric total + top 5 rows + actions menu
- [x] Widget actions: Edit (navigates to report builder), Duplicate, Remove from dashboard
- [x] Empty dashboard state with "Add Report" call-to-action
- [x] Edit from dashboard — navigates to report builder with settings prefilled via ?edit= param
- [x] Widget position ordering — move up/down arrows on each card
## Custom Metrics + Advanced Filters
- [x] Backend — ai_conversions, ai_revenue, ai_conversion_share, ai_revenue_share metrics
- [x] Backend — has_ai_source filter, min_conversions HAVING clause
- [x] Metrics grouped into 3 categories: Core, Conversion, AI
- [x] Metric selector — searchable dropdown with group headers and descriptions
- [x] AI Source filter upgraded to dropdown (ChatGPT, Claude, etc.)
- [x] Has AI Source filter (Yes/No)
- [x] Min Conversions filter (hides rows below threshold)
- [x] Active filter pills displayed when filters collapsed
- [x] 6 updated presets using new metrics + filters
## Session 13.1 — Audit Fixes
- [x] api/routes/attribution.js — forwards filter_has_ai_source + filter_min_conversions to engine
- [x] Dashboard.jsx getFlexibleReport — forwards has_ai_source + min_conversions filters
- [x] Dashboard.jsx — added "group" class to selector div (unhides rename/duplicate/delete icons)
- [x] Dashboard.jsx — added ai_conversions, ai_revenue, ai_conversion_share, ai_revenue_share to METRIC_LABELS + METRIC_FORMATS
- [x] ReportBuilder.jsx — granularity restricted to "day" only (Option B, week/month need HogQL support)
## Session 13.2 — Audit Fixes Round 2
- [x] PROGRESS.md — granularity updated to "Daily only" (no more day/week/month claim)
- [x] Per-dashboard widgets — each dashboard has its own widget pool (sourcetrack_widgets_{id})
- [x] Legacy migration — shared widgets auto-migrated to default dashboard on first load
- [x] ReportBuilder → Dashboard staging — uses sourcetrack_dashboard_widgets_staging intermediate key
- [x] Edit-from-dashboard — uses sessionStorage instead of cross-key lookup
- [x] AI metric labels/formats confirmed consistent across ReportBuilder + Dashboard (no changes needed)
- [x] dashboard build passes

## Session 14 — Multi-dimensional Group By + Attribution Controls
- [x] Backend: group_by2 param added to getFlexibleReport — supports all 8 dimensions for second group-by
- [x] Backend: GRANULARITY_MAP (day/week/month/quarter/year) using formatDateTime for time-based dimensions
- [x] Backend: attribution_window param with LTV (no-op) and fixed windows (1/7/14/30/60/90 days)
- [x] Backend: SQL updated to SELECT/WHERE/GROUP BY dim_value2 when group_by2 present
- [x] Backend: AI share and conversion_rate subqueries updated for dim_value2 support
- [x] Route: GET /api/attribution accepts group_by2, time_granularity, attribution_window with validation
- [x] Frontend: "+ Add another Group By" link reveals second dimension selector (progressive disclosure)
- [x] Frontend: Granularity controls (Day/Week/Month/Quarter/Year) shown only when Time is selected in either group-by
- [x] Frontend: Attribution Window dropdown in Attribution step (LTV + 6 fixed windows)
- [x] Frontend: Attribute By dropdown in Attribution step (Conversion Date only; future-proofed for First Seen Date, etc.)
- [x] Frontend: Chart labels flatten 2D results (dim_value / dim_value2)
- [x] Frontend: Table renders dim_value2 column when secondary grouping is active
- [x] Frontend: Save/edit/add-to-dashboard persist all new fields
- [x] Dashboard: getFlexibleReport forwards groupBy2, granularity, attributionWindow from widget state
- [x] Dashboard build: 1981 modules, passes

**Limitations:**
- Only 2 group-by levels supported (primary + secondary)
- attributeBy = conversion_date only; param is passed through as a no-op in backend
  - TODO: confirm — add First Seen Date, Original Source Date options when backend supports non-conversion-date attribution
- Attribution window only affects touch-event lookback; conversion date filtering unchanged
  - TODO: confirm — LTV window currently no-op; requires full touch-to-conversion time diff logic in a future session
- Week granularity uses %Y-W%V format; quarter uses %Y-Q
  - TODO: confirm — verify these HogQL format strings work on PostHog ClickHouse
- Only daily granularity is sent via param when not 'day'; day is default/pass-through

## Session 3 — AI Chat
- [x] api/lib/ai-client.js created
- [x] POST /api/ai-chat works
- [x] /ai-chat page wired
- [x] end-to-end AI query works

## Session 4 — Billing
- [x] dashboard_widgets table created
- [x] POST /api/billing/create-checkout
- [x] POST /api/billing/webhook
- [x] GET /api/billing/portal
- [x] Onboarding flow
- [ ] Stripe webhook registered (manual in Stripe dashboard)
- [x] Plan gating in auth middleware
- [ ] End-to-end billing flow works (requires Stripe keys)

## Install Flow
- [x] tracker/loader.js — validates site_key, loads tracker async, queues API calls, double-init guard
- [x] tracker/loader.min.js built (1.2kb)
- [x] tracker/tracker.js — install_verified event on first pageview, identify/page methods
- [x] api/routes/install.js — GET /api/install/status with HogQL check
- [x] api/index.js — express.static for tracker/ directory
- [x] dashboard Install page — status badge, snippet with copy, test install button
- [x] install snippet: single `<script async>` tag with data-site-key
- [x] dashboard build passes

## Event Debugger
- [x] api/routes/events.js — GET /latest (50 events), GET /health (status + counts), GET /edge-cases
- [x] dashboard Event Debugger page — latest events table, health chips, edge case cards, hints
- [x] Install page links to debugger for verified sites
- [x] Sidebar nav item: Debugger

## Report Builder v1
- [x] Extended /api/attribution — group_by (7 dimensions) + metric (5 metrics) support
- [x] api/lib/attribution-engine.js — getFlexibleReport with dynamic HogQL for all dim/metric combos
- [x] Dashboard Report Builder — model, dimension, metric, date range, chart type selectors
- [x] 5 presets: AI Sources, Top Lead Sources, Campaign ROI, Landing Pages, Countries
- [x] Saved reports — save/load/delete via localStorage
- [x] Chart (bar/line) + data table output
- [x] Total metric summary card

## Identity Stitching + Multi-Domain (Design)
- [x] IDENTITY_DESIGN.md created — full design document
- [x] Identity stitching: anonymous → identified via $identify + ph.alias()
- [x] Multi-domain: TLD cookies + __tq_id URL param pass-through
- [x] Ignored referrers list (PayPal, Stripe, Google auth, etc.)
- [x] Site config JSON shape (attribution windows, cookie domain, ignored referrers)
- [x] Conversion dedup strategy (site + anon_id + hour bucket)
- [x] 3-phase implementation plan (identity → multi-domain → config UI)
- [ ] Phase 1 implementation (tracker identify + backend alias) — pending confirmation
- [ ] Phase 2 implementation (cross-domain URL params + ignored referrers) — pending confirmation
## Revenue Attribution Views
- [x] Dashboard — revenue by attribution model (4-model comparison cards)
- [x] Dashboard — revenue over time chart (daily line chart)
- [x] Dashboard — revenue by source table with avg value column
- [x] Backend — avg_conversion_value metric in flexible report
- [x] Backend — date dimension grouping for time-series (formatDateTime)
- [x] Report Builder — avg_conversion_value metric option
- [x] Dashboard — account/company reporting placeholder with TODO: confirm markers
- [x] dashboard build passes
## Session 15 — UX & Preset Polish
**Files modified:**
- dashboard/src/pages/ReportBuilder.jsx — PRESETS now include explicit groupBy2, granularity, attributionWindow, attributeBy defaults; applyPreset resets all Session 14 fields; added helper text under Attribution Window, Attribute By, Has AI Source; improved AI metric descriptions

**Completed:**
- All 6 presets reset every field explicitly (groupBy2, granularity, attributionWindow, attributeBy) — no more stale state leaking from previous reports
- Each preset defines its defaults: no secondary group-by, daily granularity, all-time window, conversion_date attribute-by
- Helper text added: attribution model usage, attribution window behavior, attribute-by meaning, has_ai_source filter explanation
- AI metric descriptions rewritten for clarity (e.g., "Conversions from AI tools" instead of "Conversions with AI source")
- Dashboard widget names inherit preset/report name — no generic "Report [date]" for preset-based widgets
- Dashboard build: 1981 modules, passes

**TODOs:**
- No new TODOs. All changes are copy/UX only, no backend logic changed.
## Session 16 — AI Dashboard + Identity Phase 1
**Files modified:**
- dashboard/src/pages/Dashboard.jsx — added AI Sources Performance section (AI Revenue Share card, Top AI Sources table, AI Revenue Trend chart); replaced KPI cards to show Revenue/Conversions/Sessions/Leads with period-over-period deltas; added session/lead queries + previous-period comparison queries
- dashboard/src/pages/ReportBuilder.jsx — renamed Step 5 heading from "Attribution Model" to "Attribution" (it bundles model, window, attribute-by)
- api/index.js — added startup env validation (POSTHOG_API_KEY, POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID) with process.exit(1) on missing
- api/routes/identify.js — added ph.alias() for identity stitching (when user_id provided), added $set_once for first-touch properties

**Completed:**
- AI Sources Performance section: revenue share percentage, top 5 AI sources table (revenue + conversions), 30-day AI revenue trend line chart
- KPI deltas: each card (Revenue, Conversions, Sessions, Leads) shows % change vs previous 30 days in green/red
- Step 5 heading now reads "Attribution" matching the actual content (model + window + attribute-by)
- API startup validates critical PostHog env vars before boot
- Identify route supports aliasing (anonymous ↔ identified) and first-touch $set_once
- Dashboard build: 1981 modules, passes
- Tracker does NOT send first_touch_* props in identify calls — TODO confirm added for tracker update

**TODOs:**
- [x] Tracker first_touch_* props on identify calls — completed Session 30
- TODO confirm — user_id must be passed from frontend/auth layer to trigger ph.alias()
## Session 17 — Onboarding Flow
**Files created:**
- api/routes/onboarding.js — status, update, complete endpoints for onboarding progress tracking
- dashboard/src/pages/Onboarding.jsx — 6-step guided onboarding wizard
- dashboard/src/components/OnboardingProgress.jsx — step progress bar (completed/current/future states)
- dashboard/src/components/OnboardingCard.jsx — reusable step card wrapper
- supabase/migration_onboarding.sql — adds onboarding_completed + onboarding_state columns to sites table

**Files modified:**
- api/routes/install.js — added GET /snippet endpoint for dynamic tracking script generation
- api/index.js — mounted onboarding router at /api/onboarding
- dashboard/src/pages/Login.jsx — post-signin redirect to /onboarding or /dashboard based on onboarding_completed
- dashboard/src/pages/Signup.jsx — post-signup redirect to /onboarding or /dashboard based on onboarding_completed
- dashboard/src/components/Layout.jsx — hides sidebar/header on /onboarding route

**Completed:**
- 6-step onboarding: Connect Domain → Select Business Type → Install Script → Installation Instructions → Customize Conversions → Verify
- Domain validation (format, no duplicates, no localhost/staging)
- Business type selection (eCommerce/SaaS/LeadGen) with conversion defaults
- Install method branching (GTM vs Standard) with full instructions and copy/paste snippet
- Conversion selection with 6 predefined options and business-type-aware defaults
- Verification with polling (/api/install/status every 5s, max 6 attempts, success/fail/waiting states)
- Onboarding state persistence via /api/onboarding endpoints (current_step, business_type, install_method, selected_conversions)
- Post-signup/login redirect to /onboarding unless onboarding_completed
- Post-completion redirect to /dashboard with toast message
- Layout hides sidebar/header during onboarding
- Dashboard build: 1983 modules, passes

**TODOs:**
- [x] Tracker first_touch_* props on identify calls — completed Session 30
- [ ] Custom conversion creation UI (custom option disabled)
- [ ] Watch Video modal content (placeholder only)
- [x] Seed default dashboard widgets by business type — completed Session 31 (seeded as Report Builder reports)
- [ ] Multi-site onboarding flow (currently one site per user)
- [ ] Agency/client mode
## Session 18 — Dashboard Screen Design Pass
**Files created:**
- dashboard/src/components/DashboardCard.jsx — reusable card with title, subtitle, action slot, overflow menu
- dashboard/src/components/MetricTile.jsx — KPI tile with icon, value, delta indicator
- dashboard/src/components/StatusBadge.jsx — status pill with preset styles (success/warning/error/verified/pending/active/inactive)
- dashboard/src/pages/Leads.jsx — leads list with search, AI/non-AI filter, source table with journey CTA
- dashboard/src/pages/Campaigns.jsx — attribution page with dimension switcher, bar chart, performance table
- dashboard/src/pages/Integrations.jsx — install verification + data health dashboard card

**Files modified:**
- dashboard/src/pages/Dashboard.jsx — complete redesign: header toolbar with time-range controls + Export, 5-KPI strip, 7 structured card sections (Recent Leads, Revenue Trend, AI Sources, Source Attribution, Conversion Events, Landing Pages, Campaign Performance, Tracking Health, Model Attribution)
- dashboard/src/components/Layout.jsx — added proper top header bar with page titles, "Live" badge, expanded nav with Leads/Campaigns/Integrations/Bot icon items
- dashboard/src/App.jsx — added routes for /leads, /campaigns, /integrations

**Completed:**
- Cohesive visual system: white cards on #F9FAFB background, 12px radius, soft shadows, consistent padding
- MetricTile with TrendingUp/TrendingDown delta icons, StatusBadge with 8 preset styles
- Dashboard shell: narrow sidebar, top header bar with breadcrumb title, time-range pills, Export button
- KPI strip: Revenue, Leads, AI Revenue, Conversion Rate, Avg Value — all with live data and deltas
- SourceTrack-native content: AI Sources table with inline sparkline, source attribution with share %, landing page performance, tracking health
- All cards handle loading, empty, and data states with clean messaging
- Onboarding mode preserved in Layout (no sidebar/header override)
- 3 supporting pages: Leads (filterable table), Campaigns (dimension-switching chart+table), Integrations (install status + data health)
- Dashboard build: 1989 modules, passes

**TODOs:**
- [ ] Per-type conversion counts not available from current aggregation (shown as — with TODO)
- [ ] AI revenue previous period not separately queried (delta shows as absent) — TODO confirm
- [ ] Campaigns page chart uses Bar from chart.js (fine for now, could be horizontals)
## Session 19 — SourceTrack Visual Unification
**Files modified:**
- dashboard/src/pages/Settings.jsx — replaced indigo-600 buttons/rings with gray-900, updated plan badge to gray
- dashboard/src/pages/Snippet.jsx — replaced indigo buttons/rings/focus with gray-900, fixed "TrackIQ" → "SourceTrack" text
- dashboard/src/pages/EventDebugger.jsx — replaced indigo accent with gray-700 for UI chrome
- dashboard/src/pages/AIChat.jsx — replaced indigo button/bot/ring colors with gray-900/gray-700
- dashboard/src/pages/Journey.jsx — replaced indigo buttons/rings/timeline with gray-900/gray-200
- dashboard/src/pages/Login.jsx — replaced indigo-600 button/focus with gray-900 (brand logo text retained)
- dashboard/src/pages/Signup.jsx — replaced indigo-600 button/focus with gray-900 (brand logo text retained)
- dashboard/src/pages/ReportBuilder.jsx — replaced indigo accent with black/lime: step badges now lime-100/lime-800, primary buttons gray-900, focus rings gray-900, active pills lime, hover states gray (logic completely preserved)
- dashboard/src/pages/Dashboard.jsx — fixed remaining hover:bg-indigo-100 reference
- dashboard/src/pages/Leads.jsx — replaced indigo links/rings with gray-900
- dashboard/src/pages/Campaigns.jsx — replaced indigo button/ring with gray-900
- dashboard/src/pages/Integrations.jsx — replaced indigo links/buttons with gray-900
- dashboard/src/pages/Onboarding.jsx — replaced indigo debugger link with gray-900
- dashboard/src/components/Layout.jsx — replaced indigo accents with gray-900
- dashboard/src/App.jsx — replaced indigo spinner with gray-900

**Completed:**
- Full app-wide color unification: primary buttons use gray-900 (black), focus rings use gray-900, active states use lime accent (lime-100/lime-800), hover states use gray-50/gray-100
- Brand logo text (indigo-600) retained on Login, Signup, and Onboarding headers — intentional brand identity preservation
- Report Builder step badges now use lime accent (lime-100/lime-800) instead of indigo
- Filter active pills in Report Builder use lime styling
- All links, spinners, and timeline borders unified to gray
- "TrackIQ" reference in Snippet page updated to "SourceTrack"
- Report Builder functionally unchanged — only visual classes modified
- Sidebar already included Report Builder (as "Reports")
- Dashboard build: 1989 modules, passes

**TODOs:**
- [ ] None — all indigo references eliminated except intentional brand identity in Login/Signup/Onboarding logos
## Session 20 — Dashboard Backend Consolidation
**Files created:**
- api/routes/dashboard.js — GET /overview endpoint that aggregates all dashboard data server-side

**Files modified:**
- api/index.js — mounted dashboardRouter at /api/dashboard
- dashboard/src/pages/Dashboard.jsx — replaced 15+ individual useQueries with single useQuery calling /api/dashboard/overview

**Completed:**
- Single `/api/dashboard/overview?site_key=X&days=30` endpoint returns structured payload with: kpis (revenue, leads, sessions, conversions, ai_revenue, ai_revenue_share, conversion_rate, avg_value + prev-period comparisons), models (first_touch, last_touch, linear, ai_platforms), ai_sources (top 5), ai_trend (time series), sources (top 10), landing_pages (top 5), campaigns (top 5), revenue_trend (time series), install status, health snapshot, alerts
- All data computed server-side using existing getFlexibleReport and getAttribution from attribution-engine
- Frontend now makes 1 API call instead of 15+ for the dashboard page
- Install status and health computed via direct HogQL queries within the overview endpoint
- Preserves all visual components, card layout, and chart rendering unchanged
- Dashboard build: 1989 modules, passes
- API syntax check passes

**TODOs:**
- [ ] Per-type conversion counts still not available (shown as —)
- [ ] AI revenue previous period not separately queried (delta shows absent)
## Session 21 — Leads Backend for List/Detail/Journey Flow
**Files created:**
- api/routes/leads-server.js — GET / returns distinct visitors with aggregated stats, GET /:leadId returns lead overview

**Files modified:**
- api/index.js — mounted leadsRouter at /api/leads
- dashboard/src/pages/Leads.jsx — replaced source-level aggregation with individual lead rows from /api/leads; added KPI summary tiles; search filters by visitor ID/source/campaign; debounced search; linked journey button
- dashboard/src/pages/Journey.jsx — added useSearchParams to auto-populate visitor ID from URL query param (?visitorId=xxx)

**Completed:**
- `/api/leads?site_key=X&date_from=X&date_to=X&search=X&ai=X&limit=100` returns distinct visitors from events with: id, first_seen, last_seen, pageviews, conversions, revenue, source, medium, campaign, ai_source, country, first_page_url
- Leads page now shows individual visitors (by distinct_id) instead of aggregated source-level data
- Each lead row shows: truncated visitor ID, source with AI badge, conversion count, revenue, last seen date, country, Journey button
- Journey button navigates to `/journey?visitorId=xxx` and Journey page auto-populates the search
- KPI tiles at top show Total Leads, Total Conversions, Total Revenue
- Debounced search (300ms) searches across visitor ID, source, and campaign
- AI/non-AI filter works on individual lead level (checks ai_source field)
- Dashboard build: 1989 modules, passes
- API syntax check passes

**TODOs:**
- [ ] Person identity (email/name) not available from current data — visitor ID shown as truncated UUID
- [ ] Lead detail page not yet implemented (API endpoint exists, frontend page TBD)
## Session 22 — Campaigns Design-Only Refinement
**Files modified:**
- dashboard/src/pages/Campaigns.jsx — visual overhaul with new filter bar, KPI tiles, enhanced table, status pills, trend column

**Completed:**
- Top filter bar with search input, date-range pills (7/30/90 days), status filter dropdown (Active/Low Volume/No Activity), result count
- Dimension tabs restyled with dark active state
- KPI tiles expanded to 5: Total Revenue, Conversions, Active Channels, Avg Value, Date Range
- Campaign table now has 7 columns: Name (with sub-label for campaign), Status (Active/Low Volume/No Activity computed from conversion count), Revenue, Conversions, Avg Value, ROAS (placeholder — with TODO), Trend (icon-based)
- Revenue Breakdown bar chart moved to right sidebar column
- Status pills: Active (green, ≥10 conversions), Low Volume (gray, 1-9), No Activity (red, 0)
- Search filters by the active dimension name
- Data note banner at bottom clarifying this is UI-first with backend support planned
- Dashboard build: 1989 modules, passes

**TODOs:**
- [ ] Spend/ad-spend data not available — ROAS column shows placeholder
- [ ] Trend data from previous periods not available — trend icons are position-based (not real)
- [ ] Campaign detail screens not yet implemented
- [ ] Real backend aggregation for campaign-level metrics planned for future session
## Session 23 — Integrations Design-Only Refinement
**Files modified:**
- dashboard/src/pages/Integrations.jsx — complete visual overhaul with status overview tiles, installation card, data health panel, available integrations grid, tracking method section

**Completed:**
- Status overview row: 4 MetricTiles showing Install Status (Verified/Pending), Site domain, Active Alerts count, Hygiene status
- Installation card (2/3 width): site info with verified badge, last event + event type, tracking script with copy button, installation warning banner for unverified sites
- Data Health card (1/3 width): real-time monitoring with empty-state success message or issue list with severity badges
- Available Integrations grid: 6 future integration cards (Google Ads, Facebook Ads, Shopify, Google Analytics, HubSpot, Custom Webhook) shown as grayed-out placeholders with "Coming soon" labels
- Tracking Method section: shows current JavaScript snippet method with Active/Not Detected badge and domain
- Clear inline TODO confirm comment for integration connector logic
- Page subtitle states backend consolidation planned for later sessions
- All existing backend queries preserved (install status, hygiene, alerts)
- Dashboard build: 1989 modules, passes

**TODOs:**
- [ ] Integration connector logic (OAuth, API keys, sync scheduling) not yet implemented
- [ ] All 6 integration cards are visual placeholders — no backend sync exists
- [ ] Backend consolidation for integrations planned in a later session
## Session 24 — Onboarding Hardening
**Files modified:**
- api/routes/onboarding.js — added step validation (1-6 range, sequential progression), step-data validation (business_type, install_method, selected_conversions), completion guards (must reach step 6, must have business_type + install_method, prevents duplicate completion)
- dashboard/src/pages/Onboarding.jsx — fixed step transition saving so backend state reaches step 6 before completion call; step 4→5 transition now correctly saves step 5

**Completed:**
- Step validation: `/update` rejects invalid step numbers, disallows backward progression, enforces sequential advancement
- Step-data validation: step 2 requires valid business_type (ecommerce/saas/leadgen), step 3 requires valid install_method (gtm/standard), step 5 requires valid conversion keys
- Completion guards: `/complete` rejects if current_step < 6, requires business_type and install_method to be set, safely handles already-completed state
- Duplicate completion prevented: returns 200 with "Already completed" message instead of errors
- Frontend step saving fixed: sequence now correctly saves step 2→3→4→5→6, ensuring backend state reaches step 6 before completion call
- Dashboard build: 1989 modules, passes
- API syntax check passes

**TODOs:**
- [ ] Verification success is still checked client-side only (frontend calls `/complete` after `/api/install/status` confirms verified)
- [ ] No server-side verification of install status at completion time
## Session 25 — Report Builder Visual Alignment
**Files modified:**
- dashboard/src/pages/ReportBuilder.jsx — refined chart palette, polished Quick Start presets and saved reports sections

**Completed:**
- Chart data COLORS array updated from vibrant indigo/blue palette to SourceTrack gray/lime palette (gray-900, lime, gray-500, gray-700, gray-300, gray-800, lime-dark, gray-400)
- Line chart borderColor changed from indigo blue to gray-900 for visual consistency
- Quick Start preset buttons restyled with bg-gray-50 base color, 1px border, hover:bg-gray-100, hover:border-gray-200 — more tactile card-like feel
- Saved Reports section polished: row hover backgrounds, duplicate/delete buttons restyled with proper hover states (dup: gray, delete: red-50/red-500), larger icon sizes
- All existing functionality preserved: presets, groupBy2, granularity, attributionWindow, attributeBy, filters, save/edit/duplicate/delete, add-to-dashboard, CSV export, edit-from-dashboard
- Dashboard build: 1989 modules, passes

**TODOs:**
- None — visual alignment complete
## Session 26 — Campaigns Backend
**Files created:**
- api/routes/campaigns.js — GET /overview endpoint using existing attribution engine

**Files modified:**
- api/index.js — mounted campaignsRouter at /api/campaigns
- dashboard/src/pages/Campaigns.jsx — rewired to new endpoint, real trend data, removed fake UI-only elements

**Completed:**
- `GET /api/campaigns/overview?site_key=X&dimension=source&days=30&search=X&status=X` returns structured campaign data
- Supports 4 dimensions (source, medium, campaign, ai_source) — all backed by real attribution engine
- Backend uses getFlexibleReport for revenue + conversions per dimension, plus previous-period comparison for trend
- KPIs computed server-side: total_revenue, total_conversions, active_channels (≥10 conversions), avg_value
- Each row includes: name, revenue, conversions, avg_value, trend (% change vs previous period), status (active/low/none)
- Search and status filtering handled server-side
- Trend column now shows real % change data vs previous period (was hardcoded position-based icons)
- ROAS column removed — spend data not available from current tracked properties
- "UI-First" amber banner removed
- Page subtitle updated to reflect real backend support
- Chart COLORS updated to SourceTrack gray/lime palette
- Dashboard build: 1989 modules, passes
- API syntax check passes

**TODOs:**
- [ ] Spend/ad-spend data not tracked — ROAS cannot be shown
- [ ] Trend uses simple revenue change % — could be enhanced to show conversion trend separately
## Session 27 — Integrations Backend
**Files created:**
- api/routes/integrations.js — GET /overview endpoint aggregating install status, hygiene, and alerts

**Files modified:**
- api/index.js — mounted integrationsRouter at /api/integrations
- dashboard/src/pages/Integrations.jsx — rewired to single endpoint, each hygiene issue now shown individually

**Completed:**
- `GET /api/integrations/overview?site_key=X` returns all integration health data in one call
- Runs 10 parallel HogQL queries: install status, 5 hygiene checks (missing UTM source, campaign naming, unknown referrers, missing conversion values, low activity), 4 alert checks (traffic drop, conversion drop, AI traffic low, install silent)
- Response shape: `{ install: { status, last_event, last_event_type, domain }, hygiene: { total_issues, issues: [...] }, alerts: { count, alerts: [...] } }`
- Frontend now makes 1 API call instead of 3 (`/install/status`, `/utms`, `/alerts`)
- Visual design preserved: MetricTiles, Installation card, Data Health card, Available Integrations grid, Tracking Method section
- Hygiene issues now shown individually with proper type labels instead of generic "Data Quality" message
- Page subtitle updated — removed "backend consolidation planned" language
- Dashboard build: 1989 modules, passes
- API syntax check passes

**TODOs:**
- [ ] Integration connector logic (OAuth, API keys, sync) not yet implemented
- [ ] All 6 integration cards remain visual placeholders
## Session 28 — QA & Consistency Pass
**Files modified:**
- dashboard/src/pages/Dashboard.jsx — updated chart COLORS array to SourceTrack gray/lime palette
- dashboard/src/pages/Settings.jsx — updated tracking snippet to match modern loader-based format

**Completed:**
- Dashboard chart COLORS updated from vibrant indigo/blue palette to SourceTrack gray/lime palette (gray-900, lime, gray-500, gray-700, gray-300, gray-800, lime-dark) — consistent with Report Builder and Campaigns
- Settings snippet updated from old `window.__trackiq_config` + `tracker.min.js` format to modern `loader.min.js` format matching the Install page
- Full audit confirmed these pages are consistent: Layout, App, Login, Signup, Onboarding, Leads, Campaigns, Integrations, Report Builder, Journey, AIChat, Snippet, Event Debugger
- No lingering "TrackIQ" text found in any user-facing frontend code
- Loading spinners unified (gray-900 border), empty states consistent (centered gray text), error handling consistent (red box), table styling consistent (gray borders/gray-50 headers/hover-gray-50 rows), button/pill styling consistent (gray-900 primary/lime accent), spacing consistent (space-y-6)
- Dashboard build: 1989 modules, passes

**TODOs:**
- None — QA pass complete
## Session 29 — Lead Detail Page
**Files created:**
- dashboard/src/pages/LeadDetail.jsx — full lead detail view with header, KPIs, attribution card, activity summary, journey CTA

**Files modified:**
- api/routes/leads-server.js — added first_touch_source and first_touch_medium to GET /:leadId response
- dashboard/src/App.jsx — added route /leads/:leadId → LeadDetail
- dashboard/src/pages/Leads.jsx — added "View" button per row linking to /leads/:leadId

**Completed:**
- Backend extended with `first_touch_source` and `first_touch_medium` via `argMin` on existing PostHog properties
- Lead Detail page sections: Header (truncated ID with copy button, AI badge, first_seen/last_seen, acquisition summary pills, Journey CTA), KPI row (Pageviews, Conversions, Revenue, Country, AI Source), Attribution card (first-touch source/medium/campaign, first page URL), Activity Summary card (first seen, last seen, pageviews, conversions, revenue, active days), Journey CTA card
- "View" button added to each Leads table row next to existing "Journey" button
- Loading state (centered spinner), error/404 state (back link + card message)
- No fabricated identity data: email, name, company fields omitted
- No new libraries added
- Dashboard build: 1990 modules, passes
- API syntax check passes

**TODOs:**
- [ ] No journey preview — CTA button used instead to avoid overreaching
## Session 30 — Identity Completion (Tracker + Identify)
**Files modified:**
- tracker/tracker.js — identify() now sends first-touch properties and supports user_id extraction
- api/routes/identify.js — removed stale TODO comment (tracker now sends first-touch properties)
- tracker/tracker.min.js — rebuilt (3.3kb)
- tracker/loader.min.js — unchanged (1.2kb)

**Completed:**
- Tracker `sendIdentify()` now includes `first_touch_source`, `first_touch_medium`, `first_touch_campaign` from existing `__ti_ft_` cookie data — these were already collected and sent on pageview/track calls but were missing from identify calls
- Tracker `identify()` API now extracts `user_id` from the traits object, passes it separately in the payload, and strips it from traits (so traits remain pure set-props for PostHog)
- Backend identify route unchanged (already handled `user_id` aliasing and `$set_once` for first-touch properties) — only the stale TODO comment removed
- When `user_id` is present and differs from `anonymous_id`, `ph.alias()` fires, merging the anonymous PostHog person record into the identified one
- Anonymous-only identify calls still work normally (no user_id → no alias)
- Loader compatibility preserved (queued identify calls still pass through correctly)
- Tracker build: 3.3kb minified, Loader: 1.2kb minified
- Dashboard build: 1990 modules, passes
- API syntax check passes

**TODOs:**
- [ ] user_id must be supplied by the integrating site (e.g., after login) — the tracker does not auto-detect it
## Session 32 — Auth Hardening + Google OAuth
**Files modified:**
- api/index.js — added requireUserAuth + requireSiteMembership to dashboard, leads, attribution, journey, export, events, cohorts, alerts, hygiene, ai-chat routes
- api/middleware/auth.js — validateSiteKey now selects company_id + owner_id; added requireSiteMembership middleware
- api/routes/onboarding.js — added ownership verification to status/update/complete handlers
- api/routes/install.js — added ownership verification to snippet handler
- dashboard/src/lib/api.js — fetchApi now auto-attaches Supabase JWT token
- dashboard/src/pages/Login.jsx — added Google OAuth sign-in button; fixed unscoped sites query
- dashboard/src/pages/Signup.jsx — added Google OAuth sign-up button; fixed unscoped sites query

**Completed:**
- All customer-facing analytics routes now require JWT auth + company membership (dashboard, leads, attribution, journey, export, debugger, cohorts, alerts, hygiene, ai-chat)
- Previously unprotected routes (onboarding, install/snippet, campaigns, integrations) now require JWT auth + site ownership
- Public tracker routes (track/identify/conversion) unchanged — remain site-key-only
- requireSiteMembership middleware enforces company membership on site-scoped routes with legacy owner_id fallback
- Super admins bypass all membership checks
- Google OAuth sign-in/sign-up added to Login and Signup pages using supabase.auth.signInWithOAuth
- fetchApi auto-attaches Supabase JWT to all API calls
- Login/Signup sites queries now scoped to the authenticated user's owner_id
- Dashboard build: 1993 modules, passes

**Manual setup required:**
- Supabase Dashboard → Authentication → Providers → enable Google, configure OAuth client ID/secret
- Supabase Dashboard → Authentication → URL Configuration → add frontend URL to redirect allowlist
- Google Cloud Console → create OAuth 2.0 credentials, add redirect URI from Supabase

**TODOs:**
- [ ] HogQL data mismatch: attribution/journey/export pass raw site_key string to HogQL `WHERE properties.site_id =` but tracker stores UUID — queries may return empty results
- [ ] Frontend pages still query sites with `.eq('owner_id', user.id)` — need migration to company_id lookups
- [ ] No company creation/management UI
- [ ] Google OAuth post-auth routing goes to /dashboard; should check onboarding_completed for proper redirect

## Session 33 — Lead Detail Polish + AI Storytelling + UX Refinements
**Files modified:**
- dashboard/src/pages/LeadDetail.jsx — added AI insight callout card, identity summary, lime-accented journey CTA
- dashboard/src/pages/Dashboard.jsx — improved AI empty state, revenue share callout, dynamic subtitle
- dashboard/src/pages/ReportBuilder.jsx — renamed presets, added desc fields
- dashboard/src/lib/seedReports.js — added desc to all 15 seeds

**Completed:**
- Lead Detail: platform-specific AI insights (ChatGPT/Claude/Perplexity context), anonymous vs identified identity card, lime CTA
- Dashboard: AI share % in subtitle + contextual callout (>20%=significant, >5%=growing, emerging)
- AI empty state: Sparkles icon + "Set up tracking" CTA button
- Presets renamed for actionability: "AI Revenue by Source", "Best Lead Sources", "Conversion Trend", "AI Platform Share"
- All presets and seeds now have inline descriptions
- Dashboard build: 1993 modules, passes

**TODOs:**
- [x] Compact timeline preview on LeadDetail — completed in Session 34
- [ ] Extend AI insights to Grok/Copilot/DeepSeek (currently ChatGPT/Claude/Perplexity only)

## Session 34 — Recent Activity Preview on Lead Detail
**Files modified:**
- api/routes/journey.js — added optional `?limit=N` query param (clamped 1-500, default 500)
- dashboard/src/pages/LeadDetail.jsx — added compact timeline section (last 10 events), second useQuery for journey data

**Completed:**
- Journey endpoint now supports `?limit=N` for fetching event subsets
- Lead Detail shows "Recent Activity" timeline with last 10 events: timestamp, event type badge, AI source pill, conversion value, page URL path
- Dashboard build: 1993 modules, passes

**TODOs:**
- [ ] Timeline events are static — no lazy loading (10 events per load is fine for current use)

## Session 35 — attributeBy Expansion (First Seen Date + Original Source Date)
**Files modified:**
- api/lib/attribution-engine.js — added JOIN subquery logic for first_seen_date and original_source_date attributeBy modes; refTs variable replaces timestamp in dimExpr/dim2Expr when using alternate attribution; JOIN applied to conversion_rate and AI share subqueries; cache key includes attributeBy
- api/routes/attribution.js — added ALLOWED_ATTRIBUTE_BY validation set + param validation
- dashboard/src/pages/ReportBuilder.jsx — updated Attribute By dropdown with all 3 options, contextual helper text per mode

**Completed:**
- `attributeBy=conversion_date`: preserved current behavior (conversion's own timestamp)
- `attributeBy=first_seen_date`: conversions grouped by visitor's MIN(timestamp) across all events (per distinct_id)
- `attributeBy=original_source_date`: conversions grouped by MIN(timestamp) of first UTM-tagged event per visitor; visitors with no UTM source are excluded (truthful exclusion)
- All 3 options validated in backend route, forwarded to engine, available in Report Builder dropdown
- Day/week/month/quarter/year granularity supported for all 3 modes (refTs uses same formatDateTime/quarter concat logic)
- Dashboard build: 1993 modules, passes

**Caveats / limitations:**
- `original_source_date` excludes visitors without any UTM source data — truthful exclusion, not a bug
- The JOIN subquery runs per request; performance may degrade on very large event tables
- Non-date dimensions (source, campaign, etc.) are unaffected by attributeBy — only date-based grouping changes

## Session 35.1 — Granularity Verification + Daily Bug Fix
**Files modified:**
- api/lib/attribution-engine.js — fixed dimExpr to always use refTs for date grouping (removed `&& granularity !== 'day'` bypass); cleared GROUP_COLUMNS.date entries to null (dead code after fix)

**Bug found and fixed:**
- Daily granularity (`day`) was using `GROUP_COLUMNS.date` which hardcoded `timestamp` — ignored `attributeBy` settings. `first_seen_date` and `original_source_date` with daily grouping would silently bucket by the conversion's own timestamp instead of the alternate date.
- Fixed by changing dimExpr condition from `groupBy === 'date' && granularity !== 'day'` to simply `groupBy === 'date'`, so ALL date granularities use `refTs`.

**Verified combinations (3 attributeBy × 5 granularities = 15):**
- Day: `formatDateTime(refTs, '%Y-%m-%d')` → e.g. `2025-01-15`
- Week: `formatDateTime(refTs, '%Y-W%V')` → e.g. `2025-W03` (ISO 8601, zero-padded 01-53)
- Month: `formatDateTime(refTs, '%Y-%m')` → e.g. `2025-01`
- Quarter: `concat(toString(toYear(refTs)), '-Q', toString(toQuarter(refTs)))` → e.g. `2025-Q1`
- Year: `formatDateTime(refTs, '%Y')` → e.g. `2025`
- All labels sort correctly alphabetically (zero-padded week numbers, single-digit quarters)
- `groupBy2=date` uses identical dim2Expr with refTs — no separate issues
- `GRANULARITY_MAP.quarter: "'%Y-Q'"` remains dead code (documented) — quarter always uses concat()

## Session 35.2 — Railway Build Fix + LTV Attribution v1

### Task A — Fix Railway Build Timeout
**Files modified:**
- `package.json` — removed `postinstall` script that called `geoip-lite.startWatchingDataUpdate()` during `npm ci`

**Files modified (docs):**
- `SYSTEM.md` — replaced `geoip-lite deploy rule` section with `geoip-lite deploy note`, documenting that GeoIP now uses bundled data only (no auto-updates)

**Completed:**
- Railway builds no longer hang on geoip-lite data download during postinstall
- `npm install` completes in <1s (was hanging until timeout)
- Runtime `geoip.lookup(ip)` still works using packaged database
- `startWatchingDataUpdate()` was never called at runtime — only in the removed postinstall script

**Caveats:**
- GeoIP freshness depends on how recently `geoip-lite` npm package was published
- Country lookups may become stale over months; manual `npm update geoip-lite` restores freshness

### Task B — LTV Attribution v1
**Files modified:**
- `api/lib/attribution-engine.js` — added `ltv_revenue` metric with per-distinct_id revenue aggregation; supports first_touch and last_touch models only; inner subquery groups by distinct_id, outer query groups by attribution dimension
- `api/routes/attribution.js` — added `ltv_revenue` to `ALLOWED_METRICS`
- `dashboard/src/pages/ReportBuilder.jsx` — added `ltv_revenue` metric in new "LTV" group: "LTV Revenue v1 (identified users)" with honest description and UUID exclusion note

**Completed:**
- LTV = `SUM(conversion_value)` across all conversions per identified `distinct_id`
- First-touch LTV: attributes all person revenue to `first_touch_source/medium/campaign`
- Last-touch LTV: attributes all person revenue to most recent conversion's UTM source/medium/campaign (via `argMax(..., timestamp)`)
- Anonymous-only visitors excluded via `NOT match(distinct_id, ...)` UUID regex
- Supports all 8 groupBy dimensions (source, medium, campaign, ai_source, landing_page, country, device, date)
- Supports groupBy2 (secondary dimension)
- Supports all existing filters, date range, attribution window
- Supports all 5 granularities for date grouping (uses `MAX(timestamp)` per distinct_id as person's attributed date)
- `ltv_revenue` metric validated in route whitelist
- Report Builder metric selector shows "LTV Revenue v1 (identified users)" in new "LTV" group
- Metric description explains anonymous exclusion and model support
- First-touch and last-touch produce materially different outputs when journeys differ ✓
- No double counting — `GROUP BY distinct_id` ensures each person counted once ✓
- Dashboard build: passes

**Identity assumptions documented:**
- Identity key: `distinct_id` (PostHog person ID, resolves aliases via `ph.alias()`)
- Anonymous-only visitors (UUID-format distinct_ids) excluded — cannot be stitched across sessions/devices
- If an app uses UUIDs as user_ids, those identified users would be incorrectly excluded
- No cross-domain or cross-device identity stitching beyond PostHog's built-in alias merging

**Explicit UUID exclusion rule:**
- `NOT match(distinct_id, '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')`
- Excludes all UUIDv4-format distinct_ids from LTV aggregation
- Documented in engine code comments, metric help text, and DEEPSEEK.md

**What is NOT claimed:**
- Predictive LTV or revenue forecasting
- Cohort-based LTV
- CRM-grade customer unification
- Cross-domain or cross-device identity stitching
- Full customer lifetime beyond `distinct_id` scope
- Support for linear or ai_platforms attribution models with LTV

**TODOs:**
- [ ] If user_id values are UUID-format, the exclusion regex would incorrectly reject identified users
- [ ] Linear attribution model not supported for LTV (would require per-touchpoint revenue splitting per person — scope exceeds v1)

## Session 36 — Per-Lead AI Insights Expansion

**Files modified:**
- `dashboard/src/pages/LeadDetail.jsx` — added platform-specific AI insight copy for Grok, Copilot, and Gemini

**Completed:**
- Lead Detail AI insight card now covers 6 platforms with platform-specific context:
  - ChatGPT: high-intent researchers ✓ (Session 33)
  - Claude: technical deep researchers ✓ (Session 33)
  - Perplexity: comparison shoppers ✓ (Session 33)
  - Grok: early adopters exploring emerging tools (new)
  - Copilot: professionals in Microsoft workflow (new)
  - Gemini: broad Google ecosystem audience (new)
- DeepSeek intentionally excluded — still shows generic AI insight card without platform-specific copy
- AI-origin vs non-AI-origin classification already present via `isAI` flag and StatusBadge
- Loading, empty, and error states already handled (Session 34)
- Dashboard build: passes

**Not implemented (hard stop — data not reliably queryable):**
- Per-lead AI vs non-AI revenue/conversion split: the `/leads/:leadId` endpoint aggregates all events per distinct_id without filtering by AI source. Adding this would require either a new backend subquery or splitting the lead response, both of which exceed v1 scope and risk fake data.

**TODOs:**
- [ ] DeepSeek-specific AI insight copy (excluded in this session)
- [x] Journey timeline filtering by event type (Task 2 — completed Session 37)
- [ ] Simple path visualization (Task 3 — not yet started)

## Session 37 — Journey Timeline Filtering

**Files modified:**
- `dashboard/src/pages/Journey.jsx` — added filter toggle bar with three views: All Events, Conversions Only, AI Touchpoints Only

**Completed:**
- Filter toggle pills (All Events / Conversions / AI Touchpoints) rendered when events exist
- `filteredEvents` computed client-side from the existing journey response (backend already returns up to 500 events with `ai_source` and `event` fields — no backend changes needed)
- "Conversions" filter shows only events where `event === '$conversion'`
- "AI Touchpoints" filter shows only events where `ai_source` is non-null and non-empty
- Event count display shows filtered count vs total: "3 of 45 events (filtered)"
- Empty filter results handled with truthful message: "No conversion events found for this visitor."
- No backend changes — all filtering is client-side on already-fetched data
- Dashboard build: passes

**Not implemented — blocked on data availability:**
- Session grouping: no `session_id` exists in event properties. The tracker does not generate session identifiers, and IDENTITY_DESIGN.md confirms `properties.session_id` is not implemented. Cannot derive session boundaries reliably from existing data. Blocked until session tracking is added to the tracker.
- Path visualization (Task 3 — not yet started)

**Caveats:**
- AI Touchpoints filter uses `ai_source` from event properties (same field used by AI platform detection middleware). Non-AI events with `ai_source = null` are excluded.
- Filtering is client-side on the response — always fetches all events. If a visitor has >500 events and the filtered subset is small, the API `?limit=N` can be increased by the user (manually or via URL param).

## Session 38 — Simple Path Visualization v1

**Files modified:**
- `dashboard/src/pages/Journey.jsx` — added pre-conversion path summary section above the timeline

**Completed:**
- `buildPathSummary(events)` function extracts a linear summary from ordered journey event data:
  - Finds the first `$conversion` event and takes all touchpoints up to and including it
  - If no conversion exists, summarizes all touchpoints
  - Extracts page pathname from `page_url` (falls back to `utm_source` or `'unknown'` for root/no-URL events)
  - Deduplicates consecutive identical pages (e.g., multiple reloads of `/pricing` → one segment)
  - Trailing slashes cleaned for consistency
- Path summary rendered as horizontal pill row with arrow separators (e.g., `/blog` → `/pricing` → `/signup`)
- Conversion step highlighted with lime accent (matching SourceTrack design system)
- Helper text: "Consecutive duplicate pages merged. Based on ordered event data only — not full path analytics."
- Summary hidden when fewer than 2 distinct touchpoints exist (truthful empty state)
- Only uses data already returned by the existing `/journey/:visitorId` endpoint — no backend changes
- Dashboard build: passes

**Verified in code:**
- `page_url` returned on every journey event (from `api/routes/journey.js` query)
- Events ordered by `timestamp ASC` — reliable for sequential path extraction
- `is_conversion` / `event === '$conversion'` flags conversion events
- `utm_source` available as fallback label when page_url is root or missing

**Limitations / caveats:**
- Path summarization is page-level, not channel-level — uses URL pathnames, not marketing channels
- Consecutive deduplication only — non-consecutive repeats of the same page will appear multiple times
- No session boundaries — all events for a visitor are treated as one continuous path
- If a visitor has >500 events and the first conversion is beyond the fetched limit, path may be incomplete
- Labeled as "simple summary" explicitly — not claiming full path analytics or drop-off analysis

**TODOs:**
- [ ] Channel-level path labels (e.g., "Google Ads → /pricing") — currently page-paths only
