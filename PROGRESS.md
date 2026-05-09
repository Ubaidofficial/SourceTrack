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