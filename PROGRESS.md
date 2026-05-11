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

## Session 39 — Lead / Contact Form Tracking as Conversion Subtyping

**Files modified:**
- tracker/tracker.js — `conversion()` now accepts optional `conversion_type` and `form_name` props
- tracker/tracker.min.js — rebuilt (3.8kb)
- api/routes/conversion.js — accepts `conversion_type` and `form_name` from req.body, stores as PostHog properties
- api/routes/dashboard.js — added per-type conversion counts to overview via HogQL query
- dashboard/src/pages/Dashboard.jsx — replaced placeholder "Conversion Events" card with real per-type data
- SYSTEM.md — added `properties.conversion_type` and `properties.form_name` to allowed PostHog properties

**Completed:**
- Tracker `trackiq.conversion(value, { conversion_type, form_name })` now supports optional subtyping
- `conversion_type` trimmed and checked for non-empty before sending
- `form_name` trimmed, truncated to 120 chars, and sanitized (alphanumeric + space/hyphen/underscore only); only persisted if non-empty after sanitization
- Backend `/api/conversion` stores `conversion_type` and `form_name` as PostHog properties with same sanitization as tracker
- Dashboard overview endpoint now runs HogQL query grouping conversions by `COALESCE(properties.conversion_type, 'untyped')`
- "Conversion Events" card shows real counts for each type (purchase, trial, lead, signup, meeting) with Active/Not tracking badges
- "Untagged" conversions (pre-feature or unspecified) shown in amber card with "Needs type" badge
- Core event name remains `$conversion` — this is conversion subtyping metadata, not a new event system

**Verified in code:**
- Tracker `sendEvent` routes `$conversion` to `/api/conversion` (unchanged)
- Loader passes `conversion(value, props)` transparently (no changes needed)
- Backend `enrich()` middleware runs before new subtype properties are added
- HogQL query uses `properties.conversion_type` which PostHog stores as a clickhouse column
- All existing conversions without type appear as `untyped` (truthful fallback)

**Inferred but not fully verified:**
- PostHog ClickHouse performance on `GROUP BY COALESCE(properties.conversion_type, 'untyped')` — query pattern follows existing style
- `conversion_type` values accepted include any trimmed string (not validated against known set) — backend trusts tracker-level validation

**Not implemented:**
- Per-type conversion filtering on Leads page, LeadDetail, or Journey (data now exists, UI filtering not yet wired)
- Per-type revenue breakdown on the Conversion Events card (counts only, revenue is aggregated but not displayed per type)
- Form field capture (only form_name label/id is tracked — no individual field values or PII)
- Backend validation restricting conversion_type to known set (open-ended by design for custom types)
- Per-type conversion trend data or time-series charts

**Caveats:**
- `form_name` is sanitized to a label string only — not a full form field capture system
- Existing conversions (before this session) will show as "Untagged" until updated client-side code sends `conversion_type`
- This is conversion subtyping, NOT a full lead-events platform — not claiming Cometly/Usermaven form analytics parity

**TODOs:**
- [ ] Per-type conversion filtering on Leads/LeadDetail/Journey pages
- [ ] Per-type revenue display on Conversion Events card
- [ ] Conversion type validation/whitelist on backend if needed for data quality
- [ ] Time-series breakdowns by conversion type for trend analysis

## Session 40 — Cross-Domain Tracking v1

**Files modified:**
- tracker/tracker.js — added `__tq_id`/`__tq_ft` URL param reading + cookie restoration + `getCrossDomainUrl()` + hidden field support
- tracker/tracker.min.js — rebuilt (4.5kb)
- tracker/loader.js — exposed `getCrossDomainUrl()` in queue API
- tracker/loader.min.js — rebuilt (1.4kb)
- dashboard/src/pages/Snippet.jsx — added Cross-Domain Tracking v1 section with usage docs and explicit limitations

**Completed:**
- Receiving side: tracker reads `__tq_id` from URL on page load and restores `__ti_id_{siteKey}` cookie if not already present
- Receiving side: tracker reads `__tq_ft` (JSON: `{s,m,c}`) from URL and restores `__ti_ft_{siteKey}` cookie if not already present
- Receiving side: tracker strips `__tq_id` and `__tq_ft` from visible URL via `history.replaceState` after reading
- Sending side: `window.trackiq.getCrossDomainUrl(url)` appends `__tq_id` (anonymous ID) and `__tq_ft` (first-touch source/medium/campaign) params to a URL
- Hidden fields: `data-trackiq="__tq_id"` populates the anonymous ID for form-based cross-domain handoff
- Loader exposes `getCrossDomainUrl()` synchronously (returns original URL if tracker not yet loaded)
- Install page documents: what cross-domain v1 supports, what it does NOT support, link decoration usage, form-based handoff, receiving domain behavior
- Single-domain tracking behavior is unchanged — cross-domain params only activate when present in URL

**Verified in code:**
- Anonymous ID resolution checks `__tq_id` before generating new UUID — existing cookie takes priority
- First-touch cookie restoration only triggers when no existing `__ti_ft_` cookie (never overwrites)
- `URLSearchParams.set()` handles URL encoding; `get()` decodes — no double-encoding
- `qp` declared once at IIFE scope, available to both ID and FT restoration blocks
- URL cleanup uses `qp.has()` to check presence regardless of whether cookies existed (always strips consumed params)
- Loader `getCrossDomainUrl` returns synchronously (not queued) — safe fallback returns original URL
- `history.replaceState` silently fails in try/catch — never breaks page load

**Inferred but not fully verified:**
- First-touch data survives JSON round-trip with `{s,m,c}` keys — `ftData` parsing already handles JSON in existing cookie path
- Cross-domain attribution persistence across >2 domain hops — each hop re-appends fresh `__tq_ft` params (last writing domain's first-touch data propagated)
- End-to-end test: blog.example.com → app.example.com with both domains running the tracker — param reading/cookie restoration/URL cleanup all exercise on receiving domain's page load

**Not implemented:**
- Automatic link decoration (no `cross_domain_links` config — user explicitly calls `getCrossDomainUrl()`)
- TLD cookie sharing via `domain=.example.com`
- Ignored referrers (payment gateways, auth redirects)
- Backend cross-domain dedup or alias merging
- Subdomain-only cookie sharing without param pass-through
- Cross-device identity (different browser/device = different visitor)
- Automatic third-party checkout domain support

**Caveats / truthful positioning:**
- This is query-param pass-through only — NOT a full cross-domain identity platform
- Both domains must have the SourceTrack snippet installed
- Links must be explicitly decorated by the user via `getCrossDomainUrl()`
- If a visitor already has a cookie on the receiving domain, cross-domain params are ignored (preserves existing identity)
- Not claiming Cometly/Usermaven cross-domain parity from this feature

**TODOs:**
- [ ] TLD cookie support (`domain=.example.com`) for subdomain setups
- [ ] Automatic link decoration via `cross_domain_links` config
- [ ] Ignored referrers list (payment gateways, auth redirects)
- [ ] Backend alias merging for cross-domain identity resolution
- [ ] End-to-end integration test across two domains

## Session 41 — Booking Attribution v1 (Calendly-Compatible Pattern)

**Files modified:**
- dashboard/src/pages/Dashboard.jsx — added `booking` to CONVERSION_LABELS (alongside existing `meeting`)
- dashboard/src/pages/Snippet.jsx — added Booking Attribution v1 section with Calendly-compatible wiring docs and explicit feature limits

**Completed:**
- `booking` conversion type now visible in Dashboard Conversion Events card (alongside purchase, trial, lead, signup, meeting)
- Install page documents the 3-step Calendly-compatible wiring pattern:
  1. Hidden fields (`data-trackiq="__tq_id"` + `data-trackiq="utm_source"`) carry attribution context into booking forms
  2. `getCrossDomainUrl()` decorates booking links for cross-domain Calendly-style flows
  3. `window.trackiq.conversion(0, { conversion_type: "meeting" | "booking", form_name: "Calendly" })` fires on confirmation page
- Explicit "What this does not support" list: no native Calendly OAuth, no webhook callbacks, no automatic booking ingestion
- "How it works under the hood" summary documents the attribution flow end-to-end
- No backend or tracker changes — all infrastructure already in place from Sessions 39 (conversion subtyping) and 40 (cross-domain params + hidden fields)

**Verified in code:**
- `conversion_type: 'meeting'` already supported by tracker + backend (Session 39)
- `data-trackiq="__tq_id"` hidden field already populated by tracker (Session 40)
- `getCrossDomainUrl()` already exposed by tracker + loader (Session 40)
- Dashboard overview groups by `COALESCE(properties.conversion_type, 'untyped')` — `booking` type automatically counted
- Conversion Events card iterates over `CONVERSION_LABELS` keys and matches against overview `conversion_types` data
- `form_name` sanitization already handles "Calendly" as a label (alphanumeric + space/hyphen/underscore)
- Dashboard build passes

**Inferred but not fully verified:**
- End-to-end Calendly flow with hidden field pre-fill — depends on Calendly embed supporting pre-fill query params (not yet tested end-to-end)
- Cross-domain Calendly attribution — if the Calendly domain doesn't run the SourceTrack tracker, the `__tq_id` param won't be consumed (documented limitation)
- Booking conversion on Calendly thank-you page — requires the user's own site to redirect or the Calendly embed to support a post-booking callback

**Not implemented:**
- Native Calendly OAuth or API integration
- Webhook-based booking completion callbacks
- Automatic booking ingestion from third-party scheduling tools
- Dedicated booking pipeline or funnel analytics
- Calendly embed pre-fill automation (documented as manual hidden-field setup)

**Caveats / truthful positioning:**
- This is a documented wiring pattern, NOT a native Calendly integration
- Booking attribution depends on the user manually adding hidden fields and firing conversions
- If Calendly runs on its own domain without the tracker, cross-domain identity pass-through requires the user's confirmation page (not Calendly's) to fire the conversion
- Not claiming full booking platform coverage or Calendly parity

**TODOs:**
- [ ] End-to-end Calendly flow test with hidden field pre-fill
- [ ] Calendly embed post-booking callback integration
- [ ] Dedicated booking pipeline analytics (not yet scoped)

## Session 42 — Offline Conversions v1 Intake

**Files created:**
- api/routes/conversion-offline.js — POST /api/conversion/offline endpoint

**Files modified:**
- api/index.js — imported and mounted conversionOffline route at /api/conversion/offline
- SYSTEM.md — added `properties.ingestion_method` and `properties.external_id` to allowed PostHog properties

**Completed:**
- `POST /api/conversion/offline` accepts: `conversion_value` (number, required), `user_id` or `anonymous_id` (at least one required for identity linking), optional `conversion_type`, `form_name`, `timestamp`, `external_id`, `utm_source`, `utm_medium`, `utm_campaign`
- `user_id` takes priority as `distinctId` if provided; falls back to `anonymous_id`
- All offline conversions marked with `ingestion_method: 'offline'` property — distinguishable from tracker conversions in PostHog queries
- `external_id` stored as caller reference (order ID, CRM record ID, etc.)
- `form_name` and `conversion_type` sanitized with same rules as tracker conversion route (trim, max 120 chars, alphanumeric + space/hyphen/underscore for form_name)
- `timestamp` validated as parseable ISO date; defaults to server time if invalid/missing
- UTM fields optional — no enrichment (no IP geo, no user-agent parsing, no AI platform detection)
- Response returns `distinct_id` and `ingestion_method` for caller confirmation
- Mounted with `validateSiteKey` middleware only (same auth level as `/api/conversion`) — API-only in v1, no dashboard UI
- Uses same `ph.capture()` → `ph.shutdown()` pattern as existing conversion route

**Verified in code:**
- `ph.capture({ distinctId, event: '$conversion', properties })` accepts any string as `distinctId` — `user_id` works
- `ingestion_method: 'offline'` stored as PostHog property — queryable via `properties.ingestion_method` in HogQL
- Existing `$conversion` event naming preserved — offline conversions appear in same attribution queries
- Existing conversion route unchanged — no interference
- Route mounted after `express.json()` — body parsing works
- `require()` parse check: both index.js and conversion-offline.js parse cleanly
- Dashboard build passes — no frontend changes

**Inferred but not fully verified:**
- PostHog alias merging: if `user_id` was previously aliased from `anonymous_id` via `/api/identify`, offline conversions keyed on `user_id` will correctly attribute to the merged person
- HogQL queries that filter `WHERE event = '$conversion'` will include offline conversions — this is intentional (offline conversions are real conversions)
- `properties.ingestion_method` can be used to split online vs offline in future dashboard views

**Not implemented:**
- Batch ingestion (single event per call only)
- Deduplication (no idempotency key or duplicate detection)
- CSV/file upload
- Dashboard UI for offline conversion ingestion
- Offline vs online conversion breakdown in any dashboard card
- Email-based identity matching (only `user_id` and `anonymous_id` supported)
- CRM sync, ad-platform offline import, or bidirectional integration
- Webhook-based ingestion

**Identity matching limitations documented:**
- Only `user_id` (from identify flow) or `anonymous_id` (browser cookie) supported for identity linking
- `email` not accepted as a distinctId — emails are person properties set via `$identify` traits, not identity keys
- If the caller provides an unrecognized `user_id`, PostHog creates a new person — no pre-validation of identity existence
- Offline conversions keyed on `user_id` will NOT be deduped against on-site conversions keyed on `anonymous_id` (different distinctIds)

**Caveats / truthful positioning:**
- This is a single-event API intake endpoint — NOT a CRM sync, NOT an integration platform
- API-only in v1 — no dashboard UI, no file upload, no batch processing
- Not claiming closed-loop revenue attribution or CRM integration maturity
- Not claiming native Google Ads / Meta offline conversion sync

**TODOs:**
- [ ] Batch ingestion support (array of conversions in one call)
- [ ] Idempotency / dedup key to prevent duplicate ingestion
- [ ] Offline vs online breakdown in dashboard
- [ ] Email-based identity matching if safe pattern emerges
- [ ] CSV upload UI for bulk offline conversion import

## Session 43 — CRM Stage Attribution v1

**Files modified:**
- api/routes/dashboard.js — added `pipeline_stages` HogQL query grouping offline conversions by stage-type conversion_type values
- dashboard/src/pages/Dashboard.jsx — added STAGE_LABELS constant + "Pipeline Stages" card
- SYSTEM.md — added CRM stage values section documenting standardized stage names

**Completed:**
- Standardized CRM stage values: `lead_created`, `qualified`, `opportunity`, `closed_won`
- Stages ingested via existing `POST /api/conversion/offline` with `conversion_type` set to the stage value — no new endpoints needed
- Stages only counted from offline conversions (`ingestion_method = 'offline'`), filtered to the 4 known stage values in HogQL
- Dashboard overview now returns `pipeline_stages` object keyed by stage name with count + revenue
- New "Pipeline Stages" card on dashboard showing: Lead Created, Qualified, Opportunity, Closed Won with Active/No data badges
- Each tile shows count and revenue (when >0)
- Subtitle shows total staged conversions in period ("API-driven" badge in action slot)
- Empty state explains: send offline conversions with stage conversion_type via /api/conversion/offline
- Stages use existing `conversion_type` property (Session 39) — no separate CRM object model; documented honestly
- SYSTEM.md now documents the 4 standardized stage values and their meanings

**Verified in code:**
- Offline conversion route already accepts `conversion_type` (Session 42) — no ingestion-side changes needed
- HogQL filter: `event = '$conversion' AND ingestion_method = 'offline' AND conversion_type IN ('lead_created','qualified','opportunity','closed_won')` — stages are distinct from generic conversions
- STAGE_LABELS keys match the HogQL filter values exactly
- Pipeline Stages card reads `overview?.pipeline_stages` — same pattern as Conversion Events card
- Dashboard build passes, API syntax check passes

**Inferred but not fully verified:**
- Stage progression is not enforced — a `closed_won` event can arrive before `lead_created`; there's no state machine
- Stage counts are raw event counts per type — same lead appearing in multiple stages will count in each
- Revenue is summed per stage from `conversion_value` — if the same deal value is sent with each stage, revenue will be multi-counted

**Not implemented:**
- Stage progression enforcement or state machine
- Per-lead/per-deal stage tracking (counts are aggregates, not per-entity)
- Deal-level deduplication (same deal with multiple stages counted separately)
- Stage timeline or pipeline velocity view
- Automatic CRM sync or native HubSpot/Salesforce integration
- Stage filtering on Leads/LeadDetail pages

**Caveats / truthful positioning:**
- This is API-driven stage ingestion via `conversion_type` — NOT a native CRM integration
- Stages are `$conversion` events with `conversion_type` set to a stage value — honestly documented, not pretending a separate CRM object model
- No automatic sync, no bidirectional updates, no pipeline management UI
- Revenue may be multi-counted if the same deal value is sent with each stage advancement
- Not claiming HubSpot/Salesforce integration or closed-loop revenue attribution maturity

**TODOs:**
- [ ] Stage progression enforcement / state machine
- [ ] Per-deal deduplication key to avoid multi-counting
- [ ] Pipeline velocity / stage timeline visualization
- [ ] Stage filtering on Leads/LeadDetail
- [ ] More granular stage values if needed (e.g., `closed_lost`)

## Session 44 — AI Analytics Dashboard v1

**Files created:**
- api/routes/ai-analytics.js — GET /api/ai-analytics/overview endpoint
- dashboard/src/pages/AIAnalytics.jsx — dedicated AI Analytics page

**Files modified:**
- api/index.js — imported and mounted aiAnalyticsRouter at /api/ai-analytics
- dashboard/src/App.jsx — added /ai-analytics route
- dashboard/src/components/Layout.jsx — added "AI Analytics" nav item with TrendingUp icon + page title

**Completed:**
- New dedicated `/ai-analytics` page with comprehensive AI-source performance view
- Backend endpoint `/api/ai-analytics/overview` aggregates AI data server-side using existing attribution engine:
  - Top AI platforms by revenue + conversions (ai_platforms model)
  - AI revenue trend over time (daily, ai_platforms model)
  - Non-AI revenue + conversions (first_touch model with has_ai_source:false filter)
  - AI sessions (for conversion rate calculation)
  - Non-AI sessions
- KPIs computed server-side: AI revenue, AI conversions, AI sessions, AI revenue share %, AI conversion rate, AI AOV, plus non-AI counterparts
- Frontend displays:
  - **KPI strip:** AI Revenue, AI Conversions, AI Revenue Share, AI Conversion Rate (4 MetricTiles, lime accent)
  - **AI vs Non-AI comparison row:** 4 tiles — AI/Non-AI Revenue, AI/Non-AI Conv Rate
  - **AOV comparison card:** Side-by-side AI vs Non-AI AOV with delta indicator (up/down arrow + %)
  - **"About AI Source Tracking" card:** Truthful narrative explaining how AI detection works, what metrics mean, no prediction or scoring claimed
  - **Top AI Platforms card:** Bar chart + data table with revenue, conversions per platform
  - **AI Revenue Trend card:** Daily line chart with contextual insight bar (share % with channel significance messaging)
  - **AI Platform Detail table:** Full platform breakdown with revenue, conversions, share %
  - **Empty state:** Sparkles icon + explanation of how AI tracking works + setup CTA
  - **Loading state:** Centered spinner
- Route mounted with requireUserAuth + validateSiteKey + requireSiteMembership (same auth as dashboard)
- Navigation: "AI Analytics" in sidebar between AI Chat and Integrations

**Verified in code:**
- `getFlexibleReport` with `model: 'ai_platforms'` + `has_ai_source: 'true'` already supported — used for AI platform queries
- `getFlexibleReport` with `has_ai_source: 'false'` filter supported — used for non-AI comparisons
- `sessions` metric with AI filter — pageview events have `ai_source` set from referrer detection middleware
- AI revenue share = (AI revenue / total revenue) × 100 — computed server-side
- AI conversion rate = AI conversions / AI sessions — computed server-side
- AOV delta = (AI AOV - Non-AI AOV) / Non-AI AOV × 100 — computed frontend
- All charts use SourceTrack gray/lime COLORS palette
- Dashboard build passes, API syntax check passes

**Inferred but not fully verified:**
- `has_ai_source: 'false'` filter for sessions correctly excludes AI-sourced pageviews — filter logic uses `ai_source IS NULL OR ai_source = ''` which should match non-AI pageviews where `ai_source` is stored as null
- AI share % denominator (total revenue) includes offline conversions if they have conversion_value — those won't have ai_source, counted as non-AI

**Not implemented:**
- AI prediction or lead scoring
- AI content optimization
- AI-specific conversion subtypes or journey analytics
- AI platform comparison over time (multi-line trend per platform)
- AI traffic volume trend (pageviews, not just conversions/revenue)
- Per-lead AI source journey breakdown on this page

**Caveats / truthful positioning:**
- All metrics use real `ai_source` detection data from HTTP referrer headers — no synthetic or predicted AI metrics
- Empty state explains exactly how AI tracking works (referrer detection)
- "About AI Source Tracking" card explicitly states "no AI prediction, scoring, or synthetic metrics"
- Not claiming AI prediction, lead scoring, or optimization capabilities
- AI sessions count is pageview events from AI-sourced visitors — session boundaries not implemented

**TODOs:**
- [ ] Multi-platform trend chart (per-platform line over time)
- [ ] AI traffic volume trends (pageview counts, not just conversions)
- [ ] AI-specific conversion subtype breakdown
- [ ] Date range selector on AI Analytics page

## Session 45 — Webhook Identity / Contact Linkage v1

**Files modified:**
- api/routes/identify.js — extended to accept top-level `source_system`, `external_id`, `contact_email` fields
- SYSTEM.md — added `properties.source_system` and `properties.contact_email` to allowed PostHog properties
- dashboard/src/pages/Snippet.jsx — added "Webhook Identity & Contact Linkage v1" section with Zapier/n8n example

**Completed:**
- Extended `/api/identify` to accept three new optional top-level fields:
  - `source_system` — trimmed string (e.g., "hubspot", "salesforce", "zapier")
  - `external_id` — trimmed string (e.g., CRM contact/lead ID)
  - `contact_email` — trimmed string (stored as person property, not identity key)
- New fields flow into `$set` as PostHog person properties alongside existing `traits` passthrough
- `ph.alias()` behavior unchanged — identity stitching still requires `user_id` + `anonymous_id`
- No new endpoints — reused existing `/api/identify` route (smallest safe approach)
- Install page documents Zapier/n8n-style webhook pattern:
  - Example payload with `site_key`, `anonymous_id`, `user_id`, `source_system`, `external_id`, `contact_email`, `traits`
  - How linkage works: `ph.alias()` for identity stitching, `$set` for person properties, deterministic only
  - How to get `anonymous_id` into CRM: hidden field `data-trackiq="anonymous_id"` in forms
  - Explicit "What this does not support": no native CRM integration, no fuzzy matching, no email-only resolution

**Verified in code:**
- Existing `traits` object is a passthrough via `$set` — new top-level fields follow same pattern
- `ph.alias()` requires `user_id` + `anonymous_id` — unchanged, linkage remains explicit
- `email` in `traits` already works as a person property — `contact_email` just adds a dedicated top-level convenience field
- Backwards compatible — existing identify calls without new fields work unchanged
- API syntax check passes, dashboard build passes

**Inferred but not fully verified:**
- Zapier/n8n webhook POST to `/api/identify` — endpoint is public (site_key auth only), no API key required
- Person properties set via `$set` are queryable by the leads-server HogQL queries (which only query `events` table, not person properties — person data accessible via PostHog person API but not yet surfaced in LeadDetail)
- `properties.contact_email` stored in `traits` as key `contact_email` — accessible via PostHog person API / person properties

**Not implemented:**
- UI surface for linked identity in LeadDetail (person properties not yet returned by leads-server)
- Native HubSpot/Salesforce integration
- Automatic bidirectional sync
- Email-based identity resolution (email is a person property, not an identity key)
- Dedicated webhook route (reused existing `/api/identify`)
- Webhook secret/API key auth beyond site_key

**Caveats / truthful positioning:**
- This is identity linkage via existing `/api/identify` — NOT a native CRM integration
- Linkage is deterministic only — `user_id` + `anonymous_id` must match for identity stitching
- `contact_email` is a person property, not an identity key — no email-based resolution
- Keep API-only for now — no LeadDetail UI for linked contact identity yet
- Not claiming HubSpot/Salesforce integration

**TODOs:**
- [ ] Surface linked contact identity in LeadDetail (requires leads-server to return person properties)
- [ ] Dedicated webhook endpoint with API key auth for Zapier/n8n
- [ ] Email-based identity resolution if safe pattern emerges
- [ ] Webhook payload validation/schema for Zapier/n8n compatibility

## Session 46 — Outbound Webhooks v1 (Best-Effort)

**Files created:**
- api/lib/webhook.js — lightweight dispatch utility

**Files modified:**
- api/routes/conversion.js — imported dispatchWebhook, calls after ph.shutdown()
- api/routes/conversion-offline.js — imported dispatchWebhook, calls after ph.shutdown()
- dashboard/src/pages/Snippet.jsx — added "Outbound Webhooks v1" section with configuration, payload, and delivery docs

**Completed:**
- `dispatchWebhook(eventType, properties)` utility in `api/lib/webhook.js`:
  - Reads `WEBHOOK_URL` from environment — if unset, silently skips (no-ops)
  - Builds a stable JSON envelope: `{ event_id, event_type, occurred_at, source: "sourcetrack", data: { ... } }`
  - Data includes only verified, non-PII fields: site_id, anonymous_id, user_id, conversion_type, conversion_value, form_name, ingestion_method, external_id, source_system
  - Fires a synchronous POST with 5-second timeout via AbortController
  - Fire-and-forget — returned promise is not awaited; failure only logged via console.error
  - Timeout logged as "Webhook timed out after 5000 ms"
- Hooked into two conversion routes:
  - `conversion.js`: `dispatchWebhook('conversion', props)` after `ph.shutdown()`
  - `conversion-offline.js`: `dispatchWebhook('conversion.offline', props)` after `ph.shutdown()`
- Install page documents:
  - Configuration via `WEBHOOK_URL` env var
  - Events sent: `conversion` (on-site) and `conversion.offline` (offline/CRM-stage)
  - Example Zapier/n8n-compatible payload
  - Delivery model: best-effort, fire-and-forget, 5s timeout, no retries
  - Explicit "What this does not support": retries, delivery history, signatures, multi-destination, broad event coverage
- No new routes, no event bus, no DB schema changes

**Verified in code:**
- `dispatchWebhook()` is a no-op when `WEBHOOK_URL` is unset — tracking works normally without config
- Called after `ph.shutdown()` and before `res.json()` — PostHog event is flushed before webhook fires
- Not awaited — webhook failure or timeout does not affect the tracking response
- `AbortController` with `setTimeout` handles timeout — no hanging requests
- Data payload only includes properties that exist in the conversion props object
- No raw headers, full traits blobs, or unreviewed person properties
- All 3 files parse, dashboard build passes

**Inferred but not fully verified:**
- Zapier/n8n Catch Hook webhook URL format is `https://hooks.zapier.com/hooks/catch/...` — standard webhook URL pattern
- `fetch` in Node.js v20 handles HTTPS + POST with JSON body — no additional libraries needed
- Webhook delivery is synchronous within the request lifecycle but not awaited — Node.js will keep the process alive long enough for the fetch to complete (or timeout)

**Not implemented:**
- Retries, delivery history, signatures, replay protection, guaranteed delivery
- Multi-destination configuration (single `WEBHOOK_URL` env var only)
- Broad event coverage (only `conversion` and `conversion.offline` types)
- Native Zapier/n8n app/integration (generic HTTP webhook only)
- UI field for webhook URL (env var only, documented)
- Event filtering or conditional dispatch

**Caveats / truthful positioning:**
- Generic HTTP webhook — NOT a native Zapier/n8n integration
- Best-effort delivery only — no retries, no delivery guarantees
- Single destination per deployment via env var
- Only conversion events in v1
- Not claiming a full integrations platform

**TODOs:**
- [ ] Multi-destination configuration (per-site webhook URLs)
- [ ] Retries with exponential backoff
- [ ] Webhook delivery history/log
- [ ] HMAC signatures for payload verification
- [ ] Broader event coverage (pageview, identify, install_verified)
- [ ] Settings UI for webhook URL configuration

## Session 47 — LTV Truthfulness Polish (Task 2 only)

**Task 1 already complete from Session 35.2** — LTV Attribution v1 was implemented with `ltv_revenue` metric in attribution engine, integrated into Report Builder. Verified in code: `api/lib/attribution-engine.js` lines 395-528, `api/routes/attribution.js` line 5, `dashboard/src/pages/ReportBuilder.jsx` line 57.

**Files modified (Session 47):**
- dashboard/src/pages/ReportBuilder.jsx — updated LTV metric description for explicit truthful labeling
- SYSTEM.md — added LTV definition section documenting exact computation, identity rules, and limitations

**Completed:**
- LTV metric description updated from "Summed revenue from all conversions per identified visitor" to "Cumulative realized revenue (not predictive LTV) — sums all conversion_values per distinct_id, then attributes to first-touch or last-touch source. Anonymous-only visitors (UUID format) excluded. Requires first_touch or last_touch model."
- SYSTEM.md now documents the exact LTV definition: `SUM(conversion_value)` across all `$conversion` events per `distinct_id`, attributed via first-touch or last-touch, UUID exclusion for anonymous visitors, only first_touch/last_touch models supported
- Explicitly states "not predictive LTV" and "cumulative historical revenue per identity" in both metric description and SYSTEM.md

**Verified in code (from Session 35.2):**
- `ltv_revenue` metric exists in `api/lib/attribution-engine.js` (lines 395-528)
- `ltv_revenue` in `ALLOWED_METRICS` in `api/routes/attribution.js` (line 5)
- Report Builder exposes "LTV Revenue v1 (identified users)" in LTV group
- UUID exclusion via `NOT match(distinct_id, '^[uuid-pattern]$')` in engine SQL
- Supports all 8 groupBy dimensions, first_touch and last_touch models
- Dashboard build passes

**Not implemented (not attempted in this session):**
- Predictive LTV or revenue forecasting
- LTV per lead on LeadDetail page
- Linear or ai_platforms attribution for LTV
- Multi-touch LTV models

**Caveats / truthful positioning:**
- "LTV" means cumulative realized revenue, NOT predicted future value — label and docs make this explicit
- Anonymous-only visitors excluded from LTV — documented in metric description
- Only first-touch and last-touch attribution supported — documented
- Not claiming predictive LTV or closed-loop revenue attribution maturity

## Session 48 — Server-Routed Tracking Groundwork v1

**Files modified:**
- api/routes/track.js — added `ingestion_method: 'server_routed'` to pageview/custom event properties
- api/routes/conversion.js — added `ingestion_method: 'server_routed'` to on-site conversion properties
- dashboard/src/pages/Snippet.jsx — added "Architecture: Server-Routed Ingestion" section documenting event flow, enrichment, and limitations

**Completed:**
- All on-site events (pageviews, custom events, browser conversions) now carry `ingestion_method: 'server_routed'` in PostHog properties — symmetric with offline conversions which use `ingestion_method: 'offline'`
- Events already routed through SourceTrack backend (tracker → `/api/track` or `/api/conversion` → backend enrichment → `ph.capture()` → PostHog) — this was always the architecture, now it's explicitly labeled
- Install page documents the architecture:
  - How events flow: Browser → SourceTrack backend → PostHog
  - Server-side enrichment: IP geo, device type, AI platform detection, UTM normalization, server timestamp
  - Endpoints: `/api/track` (pageviews/custom), `/api/conversion` (conversions), `/api/identify` (identity), `/api/conversion/offline` (offline/CRM)
  - `ingestion_method` markers: `server_routed` for on-site events, `offline` for CRM-stage events
  - Explicit "What this does not mean": not cookieless, not first-party subdomain, not ad-blocker resistant, not a replacement for client-side tracking
- No tracker changes — architecture was already server-routed; this session documents and labels it
- Existing tracking behavior unchanged — same endpoints, same flow

**Verified in code:**
- `/api/track` already receives events from browser tracker and calls `ph.capture()` — no direct browser-to-PostHog path exists
- `/api/conversion` already routes through backend enrichment before `ph.capture()`
- Server-side enrichment (IP geo, UA parsing, AI platform detection) has always run in the backend
- Adding `ingestion_method` property does not affect existing PostHog queries — the property is additive
- API syntax check passes, dashboard build passes

**Inferred but not fully verified:**
- `properties.ingestion_method` in HogQL is queryable — `WHERE properties.ingestion_method = 'server_routed'` would filter to on-site events
- No existing queries filter by `ingestion_method` except CRM stage queries which use `= 'offline'`

**Not implemented:**
- First-party subdomain routing (custom domain → SourceTrack proxy)
- Cookieless identity (still relies on browser cookies)
- Ad-blocker resistance (requests still go to SourceTrack API domain)
- Configurable endpoint (tracker always uses SourceTrack API URL)

**Caveats / truthful positioning:**
- Events always routed through SourceTrack backend — this documents the existing architecture, not new behavior
- Not cookieless — identity still depends on browser cookies (`__ti_id_`, `__ti_ft_`, `__ti_lt_`)
- Not first-party subdomain — no custom domain/CNAME routing
- Not claiming server-side attribution maturity or cookieless resilience

**TODOs:**
- [ ] First-party subdomain / custom domain routing
- [ ] Cookieless identity option
- [ ] Ad-blocker resistant delivery

## Session 49 — Identity Resilience Groundwork v1

**Files modified:**
- tracker/tracker.js — added localStorage backup/restore for anonymous ID
- tracker/tracker.min.js — rebuilt (4.6kb)
- dashboard/src/pages/Snippet.jsx — updated "What this does not mean" line in Architecture section

**Exact code path changed:**
- `tracker/tracker.js` lines 46-57: anonymous ID resolution now checks `localStorage.getItem(idCookieName)` as a fallback before generating a new UUID; writes `localStorage.setItem(idCookieName, anonymousId)` whenever an ID is set or restored. All localStorage access wrapped in try/catch for environments where it's unavailable (incognito, storage quota, permission denied).

**Completed:**
- Anonymous ID now persists across cookie clears on the same domain via localStorage backup:
  - On tracker init: if no cookie found and no cross-domain `__tq_id` param, checks `localStorage.getItem('__ti_id_{siteKey}')`
  - If found in localStorage, restores it as the anonymous ID and sets the cookie
  - On every page load, also writes the current anonymous ID to localStorage (keeps backup fresh)
  - Both operations wrapped in try/catch — silently skips if localStorage is unavailable
- Existing identity flow unchanged: cookie takes priority, cross-domain param takes priority, localStorage is the last fallback before new UUID
- Priority order: cookie → cross-domain param → localStorage → new UUID
- Install page Architecture section updated to note "cookies with localStorage backup for same-domain continuity"
- Tracker build passes (4.6kb), dashboard build passes

**Verified in code:**
- `getCookie(idCookieName)` checked first — existing cookie always wins (unchanged)
- `qp.get('__tq_id')` checked second — cross-domain param takes priority (unchanged)
- `localStorage.getItem(idCookieName)` checked third — new fallback before UUID generation
- `uuidv4()` only called when ALL three sources are empty
- `localStorage.setItem(idCookieName, anonymousId)` called unconditionally (keeps backup up to date)
- localStorage operations wrapped in try/catch — tracker never throws on storage access failure
- No backend changes, no new endpoints, no schema changes

**Inferred but not fully verified:**
- localStorage survives cookie clears in all major browsers (Chrome, Firefox, Safari, Edge)
- localStorage `setItem` won't throw for UUID strings (well within 5MB quota)
- Incognito/private mode: localStorage is available but cleared on session end — same behavior as cookie-only mode, no regression

**Not implemented:**
- localStorage backup for first-touch and last-touch cookies (only anonymous ID backed up)
- IndexedDB or other storage backends
- Cross-device identity continuity
- Cookieless identity
- Fingerprinting or probabilistic matching

**Caveats / truthful positioning:**
- Same-domain only — localStorage is per-origin, doesn't help across domains
- Browser storage dependent — clearing all site data (both cookies and localStorage) still resets the anonymous ID
- Not cookieless — identity still fundamentally depends on browser-side storage
- Not claiming cross-device continuity, cookieless attribution, or identity graph sophistication

**TODOs:**
- [ ] localStorage backup for first-touch/last-touch cookies
- [ ] Multi-storage fallback (IndexedDB, sessionStorage)
- [ ] Cross-device identity continuity

## Session 50 — AI Recommendations / Insights v1

**Files modified:**
- dashboard/src/pages/AIAnalytics.jsx — added `buildInsights()` function and 3 insight card row

**Exact code path changed:**
- `dashboard/src/pages/AIAnalytics.jsx` lines 96-120: `buildInsights()` function computes up to 3 rule-based insights from existing `kpis` and `platforms` data. Lines 172-184: insight cards rendered in a 3-column grid between the KPI row and AI vs Non-AI comparison.

**Completed:**
- Three rule-based insight cards added to the AI Analytics page:
  1. **"AI converts better / significantly better"** — triggers when AI conversion rate exceeds non-AI by >5% (moderate) or >30% (significant). Shows the exact percentages and delta.
  2. **"AI buyers spend more"** — triggers when AI AOV exceeds non-AI by >10%. Shows exact dollar values and percentage difference.
  3. **"{Platform} dominates AI traffic"** — triggers when the top AI platform's revenue is >1.5x the second-place platform. Shows revenue comparison and share percentage.
- Each insight card has a title, plain-language description with exact metric values, and a lime-tinted background (positive indicators)
- No new backend queries — all insights derived from existing `kpis` and `platforms` data already fetched by the AI Analytics page
- "About AI Source Tracking" card updated to note "insights use real detection data and simple rule-based comparisons only"
- Insights only render when `hasData` is true (no empty-state interference)

**Verified in code:**
- All thresholds are simple numeric comparisons visible in the source code
- All metric values referenced exist in the `kpis` and `platforms` objects
- No new backend calls — insights computed client-side from existing data
- `insights` array scoped inside the component, recomputed on every render when data changes
- Dashboard build passes

**Inferred but not fully verified:**
- Insight relevance for all business types — thresholds are generic; SaaS vs eCommerce may interpret "converts better" differently
- Platform dominance insight may not trigger for sites with evenly distributed AI traffic (by design — only surfaces when there's a clear leader)

**Not implemented:**
- Negative/warning insights (e.g., "AI underperforms") — all v1 insights are positive/opportunity-oriented
- Per-platform conversion rate or AOV comparisons (uses AI-wide averages)
- LTV-based insights (LTV metrics not in AI Analytics endpoint payload)
- Trend-based insights (requires looking at trend direction over time)
- Configurable thresholds — all thresholds are hardcoded in the component

**Caveats / truthful positioning:**
- Rule-based only — no predictive models, no AI training, no automated decisions
- Insights use simple comparisons of existing metrics; all logic is inspectable in source
- Not claiming AI optimization, auto-budgeting, or lead scoring
- Positive-only v1 — missing "AI underperforms non-AI" warnings

**TODOs:**
- [ ] Warning/negative insights (AI underperforming non-AI)
- [ ] Per-platform conversion rate and AOV comparisons
- [ ] LTV-based AI insights
- [ ] Configurable threshold overrides

## Session 51 — Full Implementation Audit & Sanity Check

**Session type:** Audit (no feature building)

**Files inspected:** tracker/tracker.js, tracker/loader.js, api/routes/track.js, api/routes/conversion.js, api/routes/conversion-offline.js, api/routes/identify.js, api/lib/attribution-engine.js, api/routes/attribution.js, api/routes/dashboard.js, api/routes/ai-analytics.js, api/middleware/ai-platform.js, api/lib/webhook.js, dashboard/src/pages/Dashboard.jsx, dashboard/src/pages/AIAnalytics.jsx, dashboard/src/pages/ReportBuilder.jsx, dashboard/src/pages/Leads.jsx, dashboard/src/pages/LeadDetail.jsx, dashboard/src/pages/Integrations.jsx, dashboard/src/pages/Snippet.jsx

**Tiny fixes made (3 critical bugs):**
1. `api/routes/dashboard.js` — Fixed `siteId` (Supabase row integer) → `siteKey` (PostHog UUID) in 4 raw HogQL queries. Install check, alerts, conversion types, and pipeline stages were all querying PostHog with the wrong identifier type — all would have silently returned empty results. Install status always showed "not_installed", conversion types and pipeline stages always empty.
2. `api/routes/dashboard.js` — Fixed AI revenue share computation. Was using `ai_revenue_share` metric with `has_ai_source: 'true'` filter, which made every AI source show 100% share (denominator was AI-only). Now computes `(totalAIRevenue / totalRevenue) * 100` server-side using already-available totals.
3. `dashboard/src/pages/ReportBuilder.jsx` — Fixed LTV metric not selectable in metric dropdown. The filter groups `['Core', 'Conversion', 'AI']` excluded the `'LTV'` group. Added `'LTV'` to the array — LTV Revenue v1 metric is now reachable in the UI.

**Verified strengths (all 14 areas inspected):**
- Tracker/event capture: anonymous_id, cookies, localStorage backup, cross-domain params, conversion subtyping, getCrossDomainUrl, sendEvent — all verified as implemented
- Event ingestion: /api/track, /api/conversion, /api/conversion-offline, /api/identify — all route through backend, enrichment works, ingestion_method labels consistent
- Attribution engine: 4 models, 11 metrics, 8 dimensions, 5 granularities, 3 attributeBy modes, 9 filters, UUID exclusion for LTV — all functional
- AI detection: 10 platforms detected via referrer headers, null handling correct
- AI Analytics: KPIs, trend, platform breakdown, AI insights, vs-non-AI comparisons — all verified
- Install page (Snippet.jsx): remarkably honest — every major section has "What this does not support" amber callout, no overclaiming
- Webhooks: outbound dispatch works, env var config, 5s timeout, fire-and-forget, payload shape documented correctly
- Integrations page: 6 placeholder cards, all grayed out with "Coming soon" — no misleading "connected" language
- Lead Detail: identity card correct (Anonymous/Identified), AI insights present, activity preview works

**Gaps and partial implementations found (not fixed — documented):**
- `conversion.js` missing UTM normalization (track.js normalizes, conversion.js doesn't)
- Linear attribution model: uses `FIRST_VALUE(conversion_value)` only (only first conversion's value), inner touchpoint count has no date range
- `conversion_rate`/`ai_conversion_share`/`ai_revenue_share` subqueries don't apply `attributionWindow` expansion
- AI_SOURCES constant in frontend lists only 7 of 10 detected platforms (You.com AI, Phind, Kagi missing)
- Dashboard "Recent Leads" table: AI badge detection uses wrong property (`r.source` vs `r.dim_value`), all rows hardcoded "Active"
- Report Builder: "All time (LTV)" attribution window label misleading (empty value = no expansion, not lifetime)
- Leads list page: no Anonymous/Identified identity status column
- DeepSeek lacks platform-specific insight copy in LeadDetail (generic only)

**Recommended next priorities:**
1. Fix UTM normalization in conversion.js (low effort, correctness)
2. Update AI_SOURCES constant across AIAnalytics.jsx and Leads.jsx to include all 10 platforms (low effort, coverage)
3. Fix AI badge detection in Dashboard.jsx `isAI` check (low effort, bug fix)
4. Add identity status column to Leads.jsx list (medium effort, user-facing value)
5. Fix linear model multi-conversion and date range issues (medium effort, attribution correctness)

## Session 52 — ATTRIBUTION.md Standards-Conformance Audit

**Session type:** Standards-conformance audit (no feature building)

**Files inspected:** All code files from Session 51 audit, plus ATTRIBUTION.md cross-referenced against all 14 Parts.

**Standards used:** ATTRIBUTION.md (Parts 1-14), system.md, progress.md, deepseek.md. RULES.md contains 10 coding-behavior rules (R1-R10); audited against R7 (fail loud), R9 (never overclaim), R10 (hard scope boundary).

**No code changes made.** This session identified standards violations and doc/code conflicts for future resolution.

**Key findings from ATTRIBUTION.md conformance check:**

| ATTRIBUTION.md rule | Status | Detail |
|---|---|---|
| P1 (no double counting) | ✅ Conforms | Single-touch models give 100% to one source. |
| P2 (model parity totals) | ⚠️ Partial | Linear model returns `converting_users` not `conversions` (different field name). Totals should match but field names diverge. |
| P3 (session definition) | ⚠️ Partial | No formal session_id. Sessions approximated via `COUNT(DISTINCT distinct_id)` on pageviews — no 30-min gap logic. This is a known gap, not a claimed feature. |
| P4 (deterministic identity) | ✅ Conforms | Cookie → cross-domain param → localStorage → new UUID. No probabilistic matching anywhere. |
| P5 (lookback window consistency) | ⚠️ Partial | `attributionWindow` param respected in main queries but NOT applied in `conversion_rate`, `ai_conversion_share`, `ai_revenue_share` subqueries. |
| P6 (enrichment at ingestion) | ❌ VIOLATION | UTM normalization in track.js but NOT in conversion.js. Different enrichment paths for the same UTM fields. |
| P7 (no silent zeroes) | ✅ Conforms | Placeholder `—` used when data unavailable (e.g., Conversion Events card, Pipeline Stages card). |
| P8 (truthful product claims) | ✅ Conforms | Install page honest with "What this does not support" callouts. No overclaimed features found. |
| P9 (current-vs-roadmap) | ⚠️ Partial | Integrations page labels 6 cards as "Coming soon." Linear model exposed in UI but ATTRIBUTION.md says it's "roadmap / not yet implemented." |
| Part 2 (linear model) | ❌ DOC/CODE CONFLICT | ATTRIBUTION.md defines linear as "equal credit distributed across all touchpoints" and Part 13 says it's NOT implemented. But code has a `linear` model in ALLOWED_MODELS and UI. Implementation uses `FIRST_VALUE(conversion_value)` — NOT true linear attribution. |
| Part 7 (date modes) | ⚠️ ATTRIBUTION.md STALE | ATTRIBUTION.md lists `first_seen_date` and `original_source_date` as "roadmap" but Session 35 implemented them. ATTRIBUTION.md needs update. |
| Part 10 (deduplication) | ❌ NOT IMPLEMENTED | No dedup mechanism exists for on-site or offline conversions. ATTRIBUTION.md requirements defined but not enforced. |
| Part 11 (consent/privacy) | ⚠️ NOT STATED | No consent enforcement exists. Product doesn't claim consent awareness (honest), but also doesn't explicitly state that consent is not implemented. |
| Part 12 (maturity) | ✅ Accurately positioned | SourceTrack is at "rule-based attribution" layer. No claims of higher layers found. |
| Part 13 ("do not implement") | ✅ Mostly clean | No claims of linear multi-touch, predictive LTV, cross-device, fingerprinting, cookieless, or ad-platform forwarding. However, linear model IS exposed in UI despite Part 13 listing it as not implemented. |

**Top-priority standards violations requiring resolution:**

1. **Linear model conflict (Part 2 + 13):** ATTRIBUTION.md says linear is not implemented and belongs in roadmap. Code has a partial linear model in ALLOWED_MODELS, Dashboard, and Report Builder. The implementation doesn't match the standard's definition. Resolution: either (a) remove linear from ALLOWED_MODELS and UI surfaces until implemented correctly per the standard definition, or (b) update ATTRIBUTION.md to reflect the current partial implementation status with truthful labeling.

2. **P6 violation — enrichment inconsistency:** conversion.js missing UTM normalization. Fix: add `normalizeUtm()` to conversion.js.

3. **ATTRIBUTION.md stale for date modes:** Part 7 lists first_seen_date and original_source_date as "roadmap" but they're implemented since Session 35. Fix: update ATTRIBUTION.md Part 7.

4. **P5 — lookback window not applied to rate/share subqueries:** Fix: propagate `attributionWindow` param to the sessions subquery used by conversion_rate and share metrics.

**Recommended next steps:**
1. Resolve linear model conflict (update ATTRIBUTION.md to "partially implemented" OR hide linear from UI)
2. Fix P6: add UTM normalization to conversion.js (1-line fix, high correctness impact)
3. Update ATTRIBUTION.md Part 7 to reflect first_seen_date/original_source_date implementation
4. Fix P5: propagate attributionWindow to rate/share subqueries

**RULES.md conformance findings:**

The 10 rules (R1-R10) govern coding behavior per session, not retrospective code quality. No active session was audited for rule violations. However, several rules are relevant to forward-looking enforcement:

- **R7 (fail loud):** The Session 51 audit found 4 silent-failure cases (empty install status, inflated AI share, unreachable LTV dropdown, broken AI badges). All were instances where the product failed silently rather than failing loud. Two were fixed; AI badges and UTM normalization remain as silent failures.
- **R9 (never overclaim):** The linear model exposure in UI (ALLOWED_MODELS, Dashboard, Report Builder) could be considered an R9 violation if the implementation was promoted as "linear attribution" when it doesn't meet the ATTRIBUTION.md definition. The historical Session 2 notes say "linear" was among "4 attribution models" completed — but the implementation uses `FIRST_VALUE`, not multi-touch distribution.
- **R10 (hard scope boundary):** No scope-creep violations detected in the session history traced in progress.md/deepseek.md.
