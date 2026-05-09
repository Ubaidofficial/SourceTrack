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