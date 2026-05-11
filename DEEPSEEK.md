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

### Session 32 — Auth Hardening + Google OAuth
**Files modified:**
- api/index.js — added requireUserAuth + requireSiteMembership chain to all customer analytics routes
- api/middleware/auth.js — validateSiteKey expanded; requireSiteMembership middleware added
- api/routes/onboarding.js — ownership verification added to all handlers
- api/routes/install.js — ownership verification added to snippet handler
- dashboard/src/lib/api.js — fetchApi auto-attaches Supabase JWT
- dashboard/src/pages/Login.jsx — Google OAuth + unscoped query fix
- dashboard/src/pages/Signup.jsx — Google OAuth + unscoped query fix

**Completed:**
- All customer analytics routes now require JWT auth + site membership (dashboard, leads, attribution, journey, export, debugger, cohorts, alerts, hygiene, ai-chat)
- Previously unprotected routes (onboarding, install, campaigns, integrations) now require JWT + ownership
- requireSiteMembership middleware: checks company_id match, legacy owner_id fallback, super_admin bypass
- Google OAuth flow: signInWithOAuth on Login ("Continue with Google") and Signup ("Sign up with Google")
- fetchApi auto-sends JWT on every API call
- Login/Signup sites queries scoped to the authenticated user
- Dashboard build: 1993 modules, passes

**Remaining gaps:**
- HogQL mismatch: attribution/journey/export pass raw site_key string to HogQL but tracker stores UUID — queries may fail for some sites
- Frontend pages still use owner_id queries (works via RLS but should migrate to company_id lookups)
- No company creation/management UI yet
- Google OAuth post-auth goes to /dashboard — should check onboarding_completed

**Manual setup for Google OAuth:**
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application)
2. Add redirect URI from Supabase Authentication (format: `https://<project>.supabase.co/auth/v1/callback`)
3. Supabase Dashboard → Authentication → Providers → Google → enable + paste client ID/secret
4. Supabase Dashboard → Authentication → URL Configuration → add frontend URL to redirect allowlist

### Session 33 — Lead Detail Polish + AI Storytelling + UX Refinements
**Files modified:**
- dashboard/src/pages/LeadDetail.jsx — AI insight card, identity card, lime CTA
- dashboard/src/pages/Dashboard.jsx — AI empty state, revenue share callout, Sparkles
- dashboard/src/pages/ReportBuilder.jsx — preset names + descriptions
- dashboard/src/lib/seedReports.js — descriptions on all 15 seeds

**Completed:**
- Lead Detail: platform-specific AI insights for ChatGPT/Claude/Perplexity, anonymous vs identified identity summary
- Dashboard AI section: dynamic share % in subtitle, contextual callout box based on share size
- AI empty state: Sparkles icon + setup CTA instead of bare text
- Presets renamed: "AI Revenue by Source", "Best Lead Sources", "AI Platform Share", etc.
- All presets and seeds have inline descriptions for better discoverability
- Dashboard build: 1993 modules, passes

**Remaining gaps:**
- AI insights only have copy for ChatGPT/Claude/Perplexity — Grok/Copilot/DeepSeek get generic messaging
- Frontend still uses owner_id for site queries
- No company-aware site selection UX yet

### Session 34 — Recent Activity Preview on Lead Detail
**Files modified:**
- api/routes/journey.js — added optional `?limit=N` query param (1-500)
- dashboard/src/pages/LeadDetail.jsx — compact timeline with last 10 events

**Completed:**
- Journey endpoint supports `?limit=N` for fetching subsets (used for Lead Detail preview)
- Lead Detail: "Recent Activity" timeline shows last 10 events with event type icons (pageview eye, conversion cart), AI source pills, conversion values, page URL paths, timestamps
- Full "Open Full Journey" link unchanged
- Dashboard build: 1993 modules, passes

**Remaining gaps:**
- Timeline is static (10 events max) — no lazy loading
- AI insights only cover ChatGPT/Claude/Perplexity

### Session 35 — attributeBy Expansion (First Seen Date + Original Source Date)
**Files modified:**
- api/lib/attribution-engine.js — JOIN subquery for first_seen_date and original_source_date
- api/routes/attribution.js — attribute_by validation
- dashboard/src/pages/ReportBuilder.jsx — Attribute By dropdown with 3 options

**Completed:**
- `conversion_date`: unchanged (conversion's own timestamp)
- `first_seen_date`: groups by visitor's first event timestamp (MIN per distinct_id)
- `original_source_date`: groups by first UTM-tagged event timestamp; excludes visitors without UTM source
- All 3 options in Report Builder dropdown with contextual helper text
- Day/week/month/quarter/year granularity works for all modes
- Cache key includes attributeBy
- Dashboard build: 1993 modules, passes

**Caveats:**
- original_source_date excludes visitors with no UTM source — truthful exclusion
- JOIN subquery overhead on large tables
- Non-date dimensions unchanged by attributeBy

### Session 35.1 — Granularity Verification + Daily Bug Fix
**Files modified:**
- api/lib/attribution-engine.js — dimExpr condition fixed, GROUP_COLUMNS.date entries cleared

**Bug fixed:** Daily granularity was using hardcoded `timestamp` from GROUP_COLUMNS.date, ignoring attributeBy. Fixed to always use `refTs` for date grouping.

**Verified:** All 15 combos work (3 attributeBy × 5 granularities). Week uses `%Y-W%V` (zero-padded ISO 8601). Quarter uses `concat(toYear,toQuarter)`. All labels sort correctly. groupBy2=date uses same expressions — no separate issues.

### Session 35.2 — Railway Build Fix + LTV Attribution v1

**Files modified:**
- `package.json` — removed `postinstall` script (was calling `geoip-lite.startWatchingDataUpdate()` and hanging Railway builds)
- `SYSTEM.md` — replaced `geoip-lite deploy rule` with `geoip-lite deploy note` (bundled data only, no auto-updates)
- `api/lib/attribution-engine.js` — added `ltv_revenue` metric with per-distinct_id SQL pattern
- `api/routes/attribution.js` — added `ltv_revenue` to ALLOWED_METRICS
- `dashboard/src/pages/ReportBuilder.jsx` — added LTV Revenue v1 metric in new "LTV" group

**Completed:**
- Railway build timeout fixed: postinstall removed, `npm install` completes in <1s
- GeoIP uses bundled database — no runtime auto-update, country lookups still work
- LTV v1: `SUM(conversion_value)` per identified `distinct_id`, attributed to first-touch or last-touch source dimensions
- First-touch LTV uses `any(properties.first_touch_source/medium/campaign)` (same value on every event)
- Last-touch LTV uses `argMax(properties.utm_source/medium/campaign, timestamp)` on conversion events only
- UUID exclusion via `NOT match(distinct_id, '^[uuid-pattern]$')` — same heuristic as LeadDetail.jsx
- Supports all 8 groupBy dimensions, groupBy2, filters, date range, attribution window, 5 granularities
- Report Builder exposes "LTV Revenue v1 (identified users)" with inline description

**Identity assumptions:**
- Identity key: `distinct_id` — PostHog resolves aliases via `ph.alias()` in `/api/identify`
- After aliasing, anonymous UUID events merge into identified user_id's person record
- `first_touch_source/medium/campaign` set via `$set_once` on identify (never overwritten per person)
- Anonymous-only visitors (UUID distinct_ids, never identified) excluded from LTV

**UUID exclusion rule (mandatory — must be documented wherever LTV is surfaced):**
- Anonymous-only visitors whose `distinct_id` remains a UUID and who never complete identification are excluded from LTV v1
- They must not be heuristically stitched, guessed, or included in identified-user LTV totals
- This is reflected in metric label ("identified users"), metric description, code comments, and this doc

**Caveats:**
- If an app uses UUIDs as user_ids (e.g., Supabase auth UUIDs), identified users would be incorrectly excluded
- Linear and ai_platforms models not supported for LTV v1 (would require per-person touchpoint splitting)
- Date grouping for LTV uses `MAX(timestamp)` per distinct_id (most recent conversion date)
- GeoIP uses bundled database — freshness depends on npm package publish date
- No predictive LTV, cohort LTV, CRM-grade unification, or revenue forecasting claimed

### Session 36 — Per-Lead AI Insights Expansion

**Files modified:**
- `dashboard/src/pages/LeadDetail.jsx` — added platform-specific AI insight copy for Grok, Copilot, Gemini

**Completed:**
- AI insight card now covers 6 of 7 detected platforms (ChatGPT, Claude, Perplexity, Grok, Copilot, Gemini)
- DeepSeek intentionally excluded — detection still works (StatusBadge rendered) but no platform-specific insight paragraph
- AI-origin classification unchanged (Session 33 `isAI` flag + StatusBadge)
- All UI states (loading, empty, error, non-AI lead) already handled via existing guard clauses

**Not implemented — blocked on data availability:**
- Per-lead AI vs non-AI revenue/conversion split: the `/leads/:leadId` endpoint returns aggregate stats per distinct_id without filtering by AI source. Adding a split would require backend changes to query AI-filtered sub-aggregates. Not added to avoid fake metrics.
- Journey timeline filtering by event type (Task 2 — not yet started)
- Simple path visualization (Task 3 — not yet started)

**Verified in code:**
- `ai_source` field returned by `/leads/:leadId` endpoint (Session 21, `argMin` on conversion events)
- `AI_SOURCES` array includes all 7 platforms (ChatGPT, Claude, Perplexity, Gemini, Grok, Copilot, DeepSeek)
- AI insight card renders for any `isAI` lead; platform-specific copy shown via conditional blocks

**Remaining gaps:**
- DeepSeek-specific insight copy pending
- Per-lead AI/non-AI split metrics not queryable from current endpoint shape
- Tasks 2 (journey filters) completed Session 37; Task 3 (path visualization) not yet started

### Session 37 — Journey Timeline Filtering

**Files modified:**
- `dashboard/src/pages/Journey.jsx` — added filter toggle bar (All Events, Conversions, AI Touchpoints)

**Completed:**
- Three filter pill buttons rendered as a toggle bar below the visitor header
- "Conversions Only" filters client-side to `event === '$conversion'`
- "AI Touchpoints Only" filters client-side to `ai_source IS NOT NULL AND ai_source != ''`
- Event count updates to show filtered vs total: "3 of 45 events (filtered)"
- Empty filter results show truthful message (e.g., "No conversion events found for this visitor.")
- No backend changes — all filtering is client-side on existing journey response data
- Filter pills use gray-900 active state (matching SourceTrack design system)
- Dashboard build: passes

**Verified in code:**
- Backend returns `ai_source` and `event` fields on every journey event (from `queryHogQL` in `api/routes/journey.js`)
- `ai_source` is non-null only for events where the AI platform detection middleware matched a referrer
- `event` is always a string — `$pageview`, `$conversion`, `$identify`, `install_verified`
- Client-side filtering on the `<500 event response array is efficient and safe

**Not implemented — blocked:**
- Session grouping: no `session_id` property exists in events. The tracker does not generate session IDs, and `IDENTITY_DESIGN.md §1.3` confirms this is not yet implemented. Cannot reliably derive session boundaries. If added later, the filter toggle bar can accept a fourth "Session Groups" option.
- Path visualization (Task 3 — not started)

**Remaining gaps:**
- Task 3 (simple path visualization v1) completed Session 38
- DeepSeek-specific AI insight copy (from Session 36)
- Channel-level path labels for path summary (currently page-path only)

### Session 39 — Lead / Contact Form Tracking as Conversion Subtyping

**Files modified:**
- `tracker/tracker.js` — `conversion()` accepts optional `conversion_type` and `form_name` props
- `tracker/tracker.min.js` — rebuilt (3.8kb)
- `api/routes/conversion.js` — accepts `conversion_type` and `form_name` from req.body, stores as PostHog properties
- `api/routes/dashboard.js` — per-type conversion counts query added to overview endpoint
- `dashboard/src/pages/Dashboard.jsx` — "Conversion Events" card shows real per-type data
- `SYSTEM.md` — added `properties.conversion_type` and `properties.form_name` to allowed PostHog properties

**Completed:**
- Tracker `trackiq.conversion(value, { conversion_type: 'lead', form_name: 'Contact Form' })` supports subtyping
- `conversion_type`: trimmed and checked for non-empty; `form_name`: trimmed, truncated to 120 chars, sanitized to alphanumeric + space/hyphen/underscore, only persisted if non-empty after sanitization
- Backend mirrors same sanitization; stores as PostHog properties on `$conversion` event
- Dashboard overview queries `GROUP BY COALESCE(properties.conversion_type, 'untyped')` for per-type counts
- "Conversion Events" card: real counts for purchase/trial/lead/signup/meeting with Active/Not tracking badges
- "Untagged" conversions shown in amber card with "Needs type" badge
- Core event name stays `$conversion` — this is conversion subtyping metadata, NOT a new event system

**Verified in code:**
- Tracker `sendEvent` routes `$conversion` to `/api/conversion` (unchanged)
- Loader passes `(value, props)` transparently through queue — no changes needed
- Backend `enrich()` runs before properties object is built — subtype props don't interfere
- `properties.conversion_type` queriable in HogQL via standard POST endpoint
- All existing conversions without type appear as `untyped` with honest "Needs type" badge

**Inferred but not fully verified:**
- PostHog ClickHouse performance on `COALESCE` grouping — query pattern follows existing styles in the codebase
- No backend validation restricting `conversion_type` values (open-ended by design)

**Not implemented:**
- Per-type conversion filtering on Leads/LeadDetail/Journey pages
- Per-type revenue breakdown on the Conversion Events card (counts only in card; revenue available in API payload)
- Form field value capture (only form_name label/id tracked)
- Backend conversion_type whitelist
- Per-type time-series or trend charts

**Caveats / truthful positioning:**
- This is conversion subtyping — NOT a full lead-events platform or form analytics system
- `form_name` is a non-PII label identifier (e.g., "Contact Form"), not raw field contents
- Pre-existing conversions show as "Untagged" until client code sends `conversion_type`
- Not claiming Cometly/Usermaven form analytics parity from this feature

**TODOs:**
- [ ] Per-type filtering on Leads/LeadDetail/Journey
- [ ] Per-type revenue display on Conversion Events card
- [ ] Conversion type validation on backend if needed
- [ ] Per-type time-series aggregation for trend analysis

### Session 40 — Cross-Domain Tracking v1

**Files modified:**
- `tracker/tracker.js` — `__tq_id`/`__tq_ft` URL param reading + cookie restoration + `getCrossDomainUrl()` + hidden field support
- `tracker/tracker.min.js` — rebuilt (4.5kb)
- `tracker/loader.js` — exposed `getCrossDomainUrl()` in queue API
- `tracker/loader.min.js` — rebuilt (1.4kb)
- `dashboard/src/pages/Snippet.jsx` — added Cross-Domain Tracking v1 section with docs and explicit limitations

**Completed:**
- **Receiving domain (automatic):** tracker reads `__tq_id` from URL and restores `__ti_id_{siteKey}` cookie if not already present. Reads `__tq_ft` (JSON `{s,m,c}`) and restores `__ti_ft_{siteKey}` cookie if not already present. Strips both params from visible URL via `history.replaceState`.
- **Sending domain (user-controlled):** `window.trackiq.getCrossDomainUrl(url)` appends `__tq_id` (anonymous ID) and `__tq_ft` (first-touch source/medium/campaign as JSON) params. User explicitly decorates links before navigation.
- **Form-based handoff:** `data-trackiq="__tq_id"` hidden input populated by tracker for cross-domain form submissions.
- **Loader:** `getCrossDomainUrl()` exposed synchronously — returns original URL if tracker not loaded.
- **Install docs:** new Cross-Domain Tracking v1 section with usage instructions and explicit "What this does not support" list.
- Single-domain behavior unchanged — params only activate when present in URL.

**Verified in code:**
- `qp` declared once at IIFE scope, reused for both ID and FT restoration — avoids redundant `URLSearchParams` construction
- Anonymous ID resolution: existing cookie takes priority; `__tq_id` only used when no cookie exists
- First-touch cookie: never overwritten if already present on receiving domain
- `URLSearchParams.set()` / `get()` handle encoding/decoding correctly — no double-encoding
- URL cleanup uses `qp.has()` (checks presence regardless of cookie state) — always strips consumed params
- `history.replaceState` in try/catch — never breaks page load
- Loader `getCrossDomainUrl` returns synchronously (not queued like event methods)

**Inferred but not fully verified:**
- Cross-domain flow across >2 hops — each hop appends fresh `__tq_ft` with current first-touch data
- JSON round-trip through `{s,m,c}` keys — `ftData` parsing already handles JSON in existing cookie path
- End-to-end: both domains running tracker, visitor follows decorated link, receiving domain restores cookies, pageview event sent with correct anonymous_id and first-touch context

**Not implemented:**
- Automatic link decoration (no `cross_domain_links` config) — user explicitly calls `getCrossDomainUrl()`
- TLD cookie sharing (`domain=.example.com`) for subdomain setups
- Ignored referrers (payment gateways, auth redirects)
- Backend cross-domain dedup or alias merging
- Subdomain-only cookie sharing without param pass-through
- Cross-device identity (explicitly excluded — different browser/device = different visitor)
- Automatic third-party checkout domain support

**Caveats / truthful positioning:**
- Query-param pass-through only — NOT a full cross-domain identity platform
- Both domains must have SourceTrack tracker installed
- User must explicitly call `getCrossDomainUrl()` on outgoing links
- Not claiming Cometly/Usermaven cross-domain parity

**TODOs:**
- [ ] TLD cookie support for subdomain setups
- [ ] Automatic link decoration via config
- [ ] Ignored referrers
- [ ] Backend alias merging for cross-domain identity
- [ ] End-to-end integration test

### Session 41 — Booking Attribution v1 (Calendly-Compatible Pattern)

**Files modified:**
- `dashboard/src/pages/Dashboard.jsx` — added `booking` to CONVERSION_LABELS
- `dashboard/src/pages/Snippet.jsx` — added Booking Attribution v1 section with Calendly-compatible wiring docs

**Completed:**
- `booking` conversion type now visible alongside `meeting` in Dashboard Conversion Events card
- Install page documents 3-step Calendly-compatible pattern:
  1. Hidden fields for attribution context carry-through into booking forms
  2. Link decoration via `getCrossDomainUrl()` for cross-domain booking flows
  3. Conversion fire on confirmation page with `conversion_type: "meeting" | "booking"`
- Explicit limitations documented: no native Calendly OAuth, no webhooks, no automatic booking ingestion
- "How it works under the hood" documents attribution flow per-step
- No tracker or backend changes — all infrastructure already present from Sessions 39 + 40

**Verified in code:**
- `conversion_type` subtyping already in tracker + backend (Session 39) — accepts any string including `booking`
- `data-trackiq="__tq_id"` hidden field already populated (Session 40)
- `getCrossDomainUrl()` already exposed (Session 40)
- Dashboard overview `GROUP BY COALESCE(properties.conversion_type, 'untyped')` — `booking` type auto-counted
- Conversion Events card iterates CONVERSION_LABELS keys and matches against `conversion_types` in overview payload
- `form_name` sanitization handles "Calendly" string safely (Session 39)
- Dashboard build passes

**Inferred but not fully verified:**
- Calendly embed pre-fill support for hidden fields — depends on Calendly's pre-fill query param API
- Cross-domain Calendly flow — if Calendly domain doesn't run tracker, `__tq_id` param is unused on that domain
- Post-booking callback — user must fire conversion on their own confirmation page, not Calendly's

**Not implemented:**
- Native Calendly OAuth or API integration
- Webhook-based booking completion callbacks
- Automatic booking ingestion from third-party tools
- Dedicated booking pipeline analytics
- Calendly embed pre-fill automation (manual wiring documented)

**Caveats / truthful positioning:**
- Documented wiring pattern — NOT a native Calendly integration
- User must manually add hidden fields and fire conversions
- Not claiming full booking platform coverage
- Not claiming Calendly parity or any scheduling tool integration

**TODOs:**
- [ ] End-to-end Calendly flow test
- [ ] Calendly embed post-booking callback
- [ ] Dedicated booking analytics pipeline

### Session 42 — Offline Conversions v1 Intake

**Files created:**
- `api/routes/conversion-offline.js` — POST /api/conversion/offline endpoint

**Files modified:**
- `api/index.js` — imported and mounted `conversionOffline` at `/api/conversion/offline`
- `SYSTEM.md` — added `properties.ingestion_method` and `properties.external_id` to allowed PostHog properties

**Completed:**
- `POST /api/conversion/offline` accepts: `conversion_value` (number, required), `user_id` or `anonymous_id` (at least one required), optional `conversion_type`, `form_name`, `timestamp`, `external_id`, `utm_source`, `utm_medium`, `utm_campaign`
- `user_id` takes priority as `distinctId` for `ph.capture()`; falls back to `anonymous_id`
- All offline conversions marked with `ingestion_method: 'offline'` — queryable via `properties.ingestion_method` in HogQL
- `external_id` stored as caller reference (order ID, CRM record ID)
- `form_name` and `conversion_type` sanitized same as tracker route
- `timestamp` validated as parseable ISO; defaults to server time if invalid
- UTM fields optional — no enrichment (no IP geo, no UA parsing, no AI detection)
- Response returns `distinct_id` + `ingestion_method` for caller confirmation
- Mounted with `validateSiteKey` only — API-only in v1, no dashboard UI
- Same `ph.capture()` → `ph.shutdown()` pattern as existing conversion route

**Verified in code:**
- `ph.capture({ distinctId, event: '$conversion', properties })` accepts any string as `distinctId` — `user_id` works
- `ingestion_method: 'offline'` stored as PostHog property — queryable via HogQL
- Existing `$conversion` event naming preserved — offline conversions appear in attribution queries
- Existing conversion route unchanged
- Route mounted after `express.json()` — body parsing works
- Syntax check: both files parse cleanly
- Dashboard build passes

**Inferred but not fully verified:**
- PostHog alias merging: offline conversions keyed on `user_id` properly attribute to already-merged persons
- HogQL `WHERE event = '$conversion'` correctly includes offline conversions
- `properties.ingestion_method` filterable for online vs offline breakdown

**Not implemented:**
- Batch ingestion (single event per call)
- Deduplication / idempotency
- CSV/file upload
- Dashboard UI for offline conversion ingestion
- Offline vs online breakdown in any dashboard view
- Email-based identity matching (only `user_id` + `anonymous_id`)
- CRM sync, ad-platform imports, bidirectional integration

**Identity matching limitations:**
- Only `user_id` (from identify flow) or `anonymous_id` (browser cookie) supported
- `email` not accepted as distinctId — emails are traits, not identity keys
- No pre-validation of identity existence — unrecognized `user_id` creates new PostHog person
- Offline conversions keyed on `user_id` won't dedup against on-site conversions keyed on `anonymous_id`

**Truthful positioning:**
- Single-event API intake endpoint — NOT CRM sync, NOT integration platform
- API-only in v1 — no dashboard UI, no file upload, no batch
- Not claiming closed-loop revenue attribution or CRM integration maturity

**TODOs:**
- [ ] Batch ingestion
- [ ] Idempotency/dedup key
- [ ] Offline vs online dashboard breakdown
- [ ] Email-based matching
- [ ] CSV upload

### Session 43 — CRM Stage Attribution v1

**Files modified:**
- `api/routes/dashboard.js` — `pipeline_stages` HogQL query grouping offline conversions by stage-type `conversion_type`
- `dashboard/src/pages/Dashboard.jsx` — `STAGE_LABELS` constant + "Pipeline Stages" card
- `SYSTEM.md` — CRM stage values section documenting standardized stage names

**Completed:**
- Standardized stage values: `lead_created`, `qualified`, `opportunity`, `closed_won`
- Stages ingested via existing `POST /api/conversion/offline` with `conversion_type` set to stage value — no new endpoints
- HogQL query filters to offline-only conversions with known stage values: `ingestion_method = 'offline'` + `conversion_type IN (...)`
- `pipeline_stages` object in dashboard overview payload — count + revenue per stage
- "Pipeline Stages" card on dashboard: 4 tiles (Lead Created, Qualified, Opportunity, Closed Won) with Active/No data badges
- Tile shows revenue when >0; subtitle sums total staged conversions; "API-driven" badge in action slot
- Empty state explains: send offline conversions with stage conversion_type via `/api/conversion/offline`
- Stages use `conversion_type` property — documented honestly, not pretending a separate CRM object model

**Verified in code:**
- Offline route already accepts `conversion_type` (Session 42) — no ingestion changes
- HogQL filter ensures stage-only counts: offline method + known stage values only
- `STAGE_LABELS` keys match HogQL IN clause values exactly
- Pipeline Stages card reads `overview?.pipeline_stages` — same pattern as Conversion Events card
- Dashboard build + API syntax check pass

**Inferred but not fully verified:**
- No stage progression enforcement — stages are raw event counts
- Same lead in multiple stages counted separately (aggregate, not per-entity)
- Revenue per stage from `conversion_value` — multi-counted if same value sent per stage

**Not implemented:**
- Stage progression / state machine
- Per-deal deduplication
- Pipeline velocity / stage timeline
- Stage filtering on Leads/LeadDetail
- Automatic CRM sync or native integrations

**Truthful positioning:**
- API-driven stage ingestion via `conversion_type` — NOT a native CRM integration
- Honest documentation: stages are `$conversion` events with known `conversion_type` values
- No automatic sync, no bidirectional updates, no pipeline management UI
- Not claiming HubSpot/Salesforce integration or closed-loop revenue attribution

**TODOs:**
- [ ] Stage progression enforcement
- [ ] Per-deal dedup key
- [ ] Pipeline velocity visualization
- [ ] Stage filtering on Leads/LeadDetail

### Session 44 — AI Analytics Dashboard v1

**Files created:**
- `api/routes/ai-analytics.js` — GET /api/ai-analytics/overview endpoint
- `dashboard/src/pages/AIAnalytics.jsx` — dedicated AI Analytics page

**Files modified:**
- `api/index.js` — imported and mounted `aiAnalyticsRouter` at `/api/ai-analytics`
- `dashboard/src/App.jsx` — added `/ai-analytics` route
- `dashboard/src/components/Layout.jsx` — added "AI Analytics" nav item (TrendingUp icon) + page title

**Completed:**
- New `/ai-analytics` page with comprehensive AI-source performance view
- Backend `/api/ai-analytics/overview` aggregates AI data server-side:
  - Top AI platforms by revenue + conversions (ai_platforms model)
  - AI revenue trend daily (ai_platforms model with date grouping)
  - Non-AI revenue + conversions (has_ai_source:false filter)
  - AI + non-AI sessions for conversion rate computation
- KPIs server-side: AI revenue, conversions, sessions, share %, conversion rate, AOV + non-AI counterparts
- Frontend sections: KPI strip, AI vs Non-AI comparison row, AOV comparison with delta, About AI tracking card, Top Platforms bar chart + table, Revenue Trend line chart, Platform Detail table
- Empty state explains AI tracking mechanics + setup CTA
- Route requires full auth chain (user auth + site membership)
- Navigation in sidebar between AI Chat and Integrations

**Verified in code:**
- `getFlexibleReport` with `ai_platforms` model + `has_ai_source` filter already supported
- `has_ai_source: 'false'` filter for non-AI comparisons — filter logic uses `ai_source IS NULL OR ai_source = ''`
- `sessions` metric with AI filter — pageview events carry `ai_source` from referrer detection middleware
- All AI metrics derived from real `ai_source` detection only — no synthetic data
- Dashboard build + API syntax pass

**Inferred but not fully verified:**
- `has_ai_source: 'false'` correctly excludes AI-sourced pageviews from non-AI session counts
- AI share % denominator includes all conversions including offline (which lack `ai_source`)

**Not implemented:**
- AI prediction, lead scoring, content optimization
- Multi-platform trend charts (per-platform line over time)
- AI traffic volume trends (pageview counts)
- AI-specific conversion subtype breakdown
- Date range selector on AI Analytics page

**Truthful positioning:**
- All metrics from real `ai_source` detection — no prediction or synthetic metrics
- "About AI Source Tracking" card explicitly disclaims prediction/scoring
- Not claiming AI prediction or optimization capabilities

**TODOs:**
- [ ] Multi-platform trend chart
- [ ] AI traffic volume trends
- [ ] AI conversion subtype breakdown
- [ ] Date range selector

### Session 45 — Webhook Identity / Contact Linkage v1

**Files modified:**
- `api/routes/identify.js` — extended with top-level `source_system`, `external_id`, `contact_email` fields
- `SYSTEM.md` — added `properties.source_system` and `properties.contact_email`
- `dashboard/src/pages/Snippet.jsx` — "Webhook Identity & Contact Linkage v1" section with Zapier/n8n docs

**Completed:**
- Extended `/api/identify` with three new optional top-level fields: `source_system`, `external_id`, `contact_email` — all trimmed and stored as PostHog person properties via `$set`
- Reused existing identify route — no new endpoints, smallest safe approach
- `ph.alias()` unchanged — identity stitching still requires `user_id` + `anonymous_id`
- Install page documents Zapier/n8n webhook pattern: example payload, linkage explanation, hidden field for `anonymous_id` capture, explicit limitations

**Verified in code:**
- Existing `traits` passthrough via `$set` — new fields follow same pattern
- `ph.alias()` requires both identifiers — linkage remains explicit and deterministic
- Backwards compatible — existing calls without new fields work unchanged
- API + dashboard build pass

**Inferred but not fully verified:**
- Zapier/n8n can POST to public `/api/identify` with site_key auth
- Person properties set via `$set` accessible via PostHog person API, not yet in leads-server HogQL queries

**Not implemented:**
- LeadDetail UI for linked contact identity
- Native CRM integration
- Email-based identity resolution
- Dedicated webhook endpoint with API key auth

**Truthful positioning:**
- Identity linkage via existing `/api/identify` — NOT native CRM integration
- Deterministic only — no fuzzy matching
- `contact_email` is a person property, not an identity key
- API-only — no LeadDetail UI yet

**TODOs:**
- [ ] Surface linked identity in LeadDetail
- [ ] Dedicated webhook endpoint
- [ ] Email-based resolution

### Session 46 — Outbound Webhooks v1 (Best-Effort)

**Files created:**
- `api/lib/webhook.js` — dispatch utility (fire-and-forget, 5s timeout, env var config)

**Files modified:**
- `api/routes/conversion.js` — calls `dispatchWebhook('conversion', props)` after `ph.shutdown()`
- `api/routes/conversion-offline.js` — calls `dispatchWebhook('conversion.offline', props)` after `ph.shutdown()`
- `dashboard/src/pages/Snippet.jsx` — "Outbound Webhooks v1" section with config, payload, delivery docs

**Completed:**
- `dispatchWebhook(eventType, properties)` — reads `WEBHOOK_URL` env var, builds stable JSON envelope, fires POST with 5s timeout, fire-and-forget
- Data includes only verified non-PII fields: site_id, anonymous_id, user_id, conversion_type, conversion_value, form_name, ingestion_method, external_id, source_system
- No-op when `WEBHOOK_URL` unset — tracking works normally
- Install page: config via env var, events sent (conversion + conversion.offline), example payload, delivery model, explicit limitations
- No new routes, no event bus, no DB changes

**Verified in code:**
- Webhook fires after `ph.shutdown()` — PostHog event flushed first
- Not awaited — failure doesn't affect tracking response
- `AbortController` handles timeout cleanly
- Only verified properties in payload
- All files parse, dashboard build passes

**Not implemented:**
- Retries, delivery history, signatures, multi-destination, broad event coverage
- UI config (env var only)
- Native Zapier/n8n integration

**Truthful positioning:**
- Generic HTTP webhook — NOT native integration
- Best-effort only — no delivery guarantees
- Single destination, conversion events only

**TODOs:**
- [ ] Multi-destination config
- [ ] Retries + history
- [ ] HMAC signatures
- [ ] Broader event coverage
- [ ] Settings UI

### Session 47 — LTV Truthfulness Polish (Task 2 only)

**Task 1 already complete from Session 35.2** — `ltv_revenue` metric in attribution engine, integrated into Report Builder.

**Files modified:**
- `dashboard/src/pages/ReportBuilder.jsx` — updated LTV metric description for explicit truthful labeling
- `SYSTEM.md` — added LTV definition section

**Completed:**
- Metric description now explicitly states "Cumulative realized revenue (not predictive LTV)", documents distinct_id grouping, UUID exclusion, and model limitations
- SYSTEM.md defines LTV as `SUM(conversion_value)` per `distinct_id`, first-touch or last-touch attribution, anonymous exclusion, no predictive value

**Verified from Session 35.2:**
- `ltv_revenue` in attribution engine, route validation, and Report Builder
- UUID exclusion regex, 8 groupBy dimensions, first_touch/last_touch support

**Truthful positioning:**
- "LTV" = cumulative historical revenue, not predictive
- Anonymous-only visitors excluded
- Only first_touch/last_touch models

### Session 48 — Server-Routed Tracking Groundwork v1

**Files modified:**
- `api/routes/track.js` — added `ingestion_method: 'server_routed'` to pageview/custom event properties
- `api/routes/conversion.js` — added `ingestion_method: 'server_routed'` to on-site conversion properties
- `dashboard/src/pages/Snippet.jsx` — "Architecture: Server-Routed Ingestion" section

**Completed:**
- On-site events now labeled with `ingestion_method: 'server_routed'` (symmetric with offline's `'offline'`)
- Architecture already server-routed — tracker sends to SourceTrack backend, which enriches and stores in PostHog
- Install page documents: event flow, enrichment steps, endpoints, limitations
- No behavior change — this labels and documents existing architecture

**Verified in code:**
- Events go through `/api/track` and `/api/conversion` on SourceTrack backend — no browser-to-PostHog path
- Server-side enrichment already active: IP geo, device, AI platform detection
- Added property is additive — doesn't break existing queries

**Truthful positioning:**
- Documents existing architecture — not new routing behavior
- Not cookieless, not first-party subdomain, not ad-blocker resistant

**TODOs:**
- [ ] First-party subdomain routing
- [ ] Cookieless identity

### Session 49 — Identity Resilience Groundwork v1

**Files modified:**
- `tracker/tracker.js` — localStorage backup/restore for anonymous ID
- `tracker/tracker.min.js` — rebuilt (4.6kb)
- `dashboard/src/pages/Snippet.jsx` — updated Architecture section line

**Exact code path:** `tracker/tracker.js` lines 46-57 — `localStorage.getItem(idCookieName)` fallback before `uuidv4()`, `localStorage.setItem(idCookieName, anonymousId)` on every init. Wrapped in try/catch.

**Completed:**
- Priority: cookie → cross-domain param → localStorage → new UUID
- localStorage always written to keep backup current
- Same-domain only, browser storage dependent

**Verified:** cookie priority preserved, localStorage fallback deterministic, wrapped in try/catch, builds pass.

**Truthful positioning:** Same-domain continuity only. Not cookieless. Clearing all site data still resets ID.

### Session 50 — AI Recommendations / Insights v1

**Files modified:**
- `dashboard/src/pages/AIAnalytics.jsx` — `buildInsights()` function + 3 insight card grid

**Exact code path:** `AIAnalytics.jsx` lines 96-120 (insight computation), lines 172-184 (insight card rendering).

**Completed:**
- 3 rule-based insight cards: AI conversion rate advantage (>5% or >30%), AI AOV advantage (>10%), dominant AI platform (1.5x second)
- All insights client-side from existing kpis/platforms data
- No new backend queries, no predictive models

**Truthful positioning:** Rule-based comparisons only — no AI prediction, scoring, or automation.

### Session 51 — Full Implementation Audit & Sanity Check

**Session type:** Audit — 14 feature areas inspected, 3 critical bugs fixed

**Tiny fixes made:**
1. `dashboard.js` — `siteId` (row ID) → `siteKey` (UUID) in 4 HogQL queries (install/conversion types/pipeline stages all returned empty data)
2. `dashboard.js` — AI revenue share now computed as `(totalAIRevenue / totalRevenue) * 100` instead of broken per-source share sum
3. `ReportBuilder.jsx` — Added `'LTV'` to metric dropdown filter groups (LTV was defined but unreachable in UI)

**Verified strengths:** Tracker/id/ingestion fully verified. Attribution engine functional across all 4 models/11 metrics/8 dimensions. AI detection detects 10 platforms correctly. Install page remarkably honest — all sections have "What this does not support" disclaimers. Webhooks/offline/stage ingestion verified end-to-end.

**Gaps documented (not fixed):** Linear model multi-conversion truncation, attributionWindow expansion missing in rate/share subqueries, AI_SOURCES only lists 7/10 platforms in frontend, conversion.js missing UTM normalization, Dashboard AI badges broken, Leads list missing identity status column, LTV "All time" label misleading.

**Recommended next:** Fix conversion.js UTM normalization, update AI_SOURCES to 10 platforms, fix Dashboard AI badge, add Leads identity status column.

### Session 52 — ATTRIBUTION.md Standards-Conformance Audit

**Session type:** Standards audit. Cross-referenced ATTRIBUTION.md Parts 1-14 and RULES.md (R1-R10) against code, UI, and docs. RULES.md exists (72 lines, 10 rules) — earlier "empty file" finding was a tool read error, corrected here.

**No code changes.** This session identified standards violations and doc/code conflicts.

**Key violations found:**
1. **P6 (enrichment consistency):** track.js normalizes UTM but conversion.js does not — same fields, different enrichment paths. Direct violation of Part 5 rule: "the same input must produce the same enrichment output regardless of route."
2. **Part 2 + 13 (linear model):** ATTRIBUTION.md defines linear as "equal credit distributed across all touchpoints" and Part 13 lists it as NOT implemented. But code has `linear` in ALLOWED_MODELS, Dashboard, and Report Builder. Implementation uses `FIRST_VALUE(conversion_value)` — not true linear. ATTRIBUTION.md wins per its own Part 14 conflict rule: "this file wins until it is intentionally updated."
3. **ATTRIBUTION.md stale:** Part 7 lists first_seen_date/original_source_date as "roadmap" but Session 35 implemented them. Opposite direction — code ahead of spec.

**Recommended:** Resolve linear model conflict first (either fix implementation or update ATTRIBUTION.md), then fix P6 UTM enrichment parity.

**RULES.md cross-check:** R7 (fail loud) applies to 4 silent-failure cases found in Session 51. R9 (never overclaim) applies to linear model exposure — implementation doesn't match ATTRIBUTION.md's definition. No R10 scope-creep found in session history.

**Files modified:**
- `dashboard/src/pages/AIAnalytics.jsx` — `buildInsights()` function + 3 insight card grid

**Exact code path:** `AIAnalytics.jsx` lines 96-120 (insight computation), lines 172-184 (insight card rendering).

**Completed:**
- 3 rule-based insight cards: AI conversion rate advantage (>5% or >30%), AI AOV advantage (>10%), dominant AI platform (1.5x second)
- All insights client-side from existing kpis/platforms data
- No new backend queries, no predictive models

**Truthful positioning:** Rule-based comparisons only — no AI prediction, scoring, or automation.

### Session 38 — Simple Path Visualization v1

**Files modified:**
- `dashboard/src/pages/Journey.jsx` — added `buildPathSummary()` function and path summary UI

**Completed:**
- Pre-conversion path summary displayed above journey timeline as horizontal pill row
- Rule: extracts pathname from `page_url`, deduplicates consecutive identical pages, stops at first conversion
- Falls back to `utm_source` for root/URL-less events, shows `'unknown'` when no label is available
- Conversion endpoint highlighted with lime background (matching SourceTrack design)
- Path hidden when <2 distinct touchpoints (insufficient data — truthful empty state)
- Helper text: "Consecutive duplicate pages merged. Based on ordered event data only — not full path analytics."
- Uses only existing journey endpoint data — no backend changes

**Verified in code:**
- `page_url` and `utm_source` from `api/routes/journey.js` HogQL query
- `event === '$conversion'` reliably identifies conversion events
- Events ordered by `timestamp ASC` — sequential extraction is safe
- Consecutive deduplication is documentable and truthful

**Inferred but not fully verified:**
- Performance impact negligible — array operations on ≤500 events per visitor

**Not implemented:**
- Channel-level path labels (e.g., "Google Ads → /pricing")
- Session-bounded path segmentation
- Drop-off analysis or multi-step conversion inference
- Backend path aggregation across multiple visitors