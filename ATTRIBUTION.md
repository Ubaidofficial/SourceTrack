Scope: This file governs SourceTrack’s attribution, identity, revenue credit, reporting, and measurement-truthfulness rules for engineers, analysts, and AI agents working on tracker, backend, reporting, and documentation surfaces.

This file defines the canonical rules, principles, and standards for all attribution logic in SourceTrack.
Every session that touches attribution, metrics, identity, LTV, events, reporting, dashboards, report building, AI analytics, or product claims about measurement must read this file before making any changes.

This file is the source of truth for attribution behavior.
If code conflicts with these rules, the code is wrong and must be surfaced and fixed.
If docs or UI conflict with these rules, the docs or UI are wrong and must be corrected.
If a future roadmap item changes a rule, this file must be updated first.

How to use this file
Use this file as a requirements and truthfulness contract, not as optional documentation.

Read this file before changing attribution logic, identity logic, revenue reporting, dashboard metrics, report-builder metrics, AI analytics, event ingestion, enrichment, lookback handling, or product copy that describes measurement capabilities.

If you add a new metric, report, model, route, or UI surface, verify that it does not violate Parts 1–13 before shipping.

If implementation behavior changes, update this file first, then update code, then update docs/UI.

If a feature is only partially implemented, label it honestly in code comments, docs, session notes, and UI.

If a feature is listed here as roadmap only, do not imply that it is live anywhere in the product.

If a report cannot compute a metric correctly, show “—” or remove the metric rather than returning misleading zeroes.

If an audit finds behavior that conflicts with this file, treat it as a correctness issue, not a wording preference.

Use this file together with RULES.md, system.md, progress.md, and deepseek.md; this file governs attribution-specific logic, while the others govern broader engineering and session behavior.

Part 1 — Core attribution principles
These principles apply regardless of which features are implemented.
They define what correct attribution software must always enforce.

P1 — No double counting
A single conversion must never be counted more than once in any single report,
regardless of attribution model, dimension, or filter.
In multi-touch models (future), fractional credit must sum to exactly 1.0 per conversion.
In single-touch models, exactly one source receives 100% credit per conversion.

P2 — Model parity on totals
Running the same report with different attribution models must produce:

the same total conversion count

the same total revenue
Only the source or channel credit distribution may change.
If totals diverge between models on the same date range and filters, the implementation is broken.

P3 — Consistent session definition
A session is a continuous visit period for a given identity, separated by 30 minutes of inactivity
or a new browser context where no identity can be recovered.
This definition must be applied identically across all reports, dimensions,
granularities, and API routes.
Mixing session definitions within the same product is a correctness failure.

P4 — Deterministic before probabilistic
Attribution must prefer deterministic identity matching over probabilistic matching at every step.
Probabilistic matching may only be introduced as an explicitly labeled fallback,
never silently substituting for deterministic resolution.

P5 — Lookback window consistency
The lookback window must mean the same thing in every report and endpoint that uses it.
A 30-day lookback applied to first_touch must apply the same boundary as when applied to last_touch.
Custom lookback windows must be validated and honored consistently.

P6 — Enrichment at ingestion, not at query time
All server-side enrichment such as geo, device, UTM normalization, and AI detection must happen at event ingestion time.
Events must not be enriched differently based on when they are queried.
Enrichment applied inconsistently across routes is a correctness failure.

P7 — Metric availability over silent zeroes
If a metric cannot be reliably computed for a given report configuration,
the UI must show “—” or remove the column entirely.
Silently displaying 0 when data is unavailable, unsupported, or not computable is forbidden.

P8 — Truthful product claims
No feature may be described in UI copy, docs, prompts, or marketing language as implemented
unless it is verified working end to end in the current production codebase.

P9 — Explicit current-vs-roadmap labeling
Every attribution-related capability must be clearly labeled as one of:

implemented

partially implemented

roadmap / not yet implemented
The product must never blur these categories.

Part 2 — Attribution models
Currently implemented
first_touch: 100% credit to the first tracked source for this identity within the lookback window

last_touch: 100% credit to the most recent source before conversion within the lookback window

first_touch_non_direct: 100% credit to the first qualifying non-direct touchpoint for the identity.
Fallback: if no non-direct touchpoint exists, credit the first available touchpoint (including direct).
Implemented Session 54. Uses argMin over pageviews with non-empty, non-'direct' UTM source.

last_touch_non_direct: 100% credit to the last qualifying non-direct touchpoint before conversion.
Fallback: if no non-direct touchpoint exists, credit the last available touchpoint (including direct).
Implemented Session 54. Uses argMax over pageviews with non-empty, non-'direct' UTM source.

Direct classification: a touchpoint is direct when utm_source is empty/null or equals 'direct' (after trim+lowercase normalization). All other UTM-bearing touchpoints qualify as non-direct.

These are single-touch models, not multi-touch. They share conversion and revenue totals with first_touch / last_touch — only credit distribution changes.

Roadmap — not yet implemented
The following are defined here so future sessions implement them correctly when scheduled.

linear: equal credit distributed across all touchpoints in the conversion path

rule: credit per touchpoint = 1.0 / total touchpoints in path

requirement: full touchpoint path must be available for the identity

time_decay: more credit to touchpoints closer to conversion

rule: exponential decay function with configurable half-life, default 7 days

requirement: timestamps of all touchpoints required

position_based (U-shaped): 40% first touch, 40% last touch, 20% distributed across middle touches

requirement: at least 3 touchpoints for meaningful distribution

data_driven (algorithmic): model-derived weights based on observed contribution to conversion

requirement: minimum stable conversion volume before exposure in product

must be labeled clearly as modeled or estimated, not rule-based truth

Multi-touch implementation rules
These rules apply only when multi-touch models are actually implemented.

fractional credit per conversion must always sum to exactly 1.0

each model must use the same conversion event set; totals must remain identical across models

touchpoints outside the lookback window must not receive credit

anonymous touchpoints before identity stitching must be included if deterministic stitching occurred

path order must be timestamp-based and deterministic

duplicate touchpoints must be deduplicated consistently before credit assignment

Part 3 — Identity resolution
Priority order — deterministic only
Identity resolution must follow this precedence order unless this file is explicitly updated.

Cookie (__ti_id) — highest priority if present

Cross-domain parameter (__tq_id) — second priority

localStorage backup — same identifier, same-domain fallback only

New UUID — only when all above are absent

Anonymous vs identified
Anonymous: has UUID but no linked email or external_id

Identified: UUID linked to email or external_id via identify flow

Stitching rule
When an anonymous UUID is later linked to an email or external_id:

all prior events for that UUID must become attributable to that identified lead

stitching must be deterministic and explainable

pre-stitch and post-stitch events must share the same attribution credit eligibility

stitching behavior must not create duplicate leads or duplicate revenue

LTV identity rule
LTV must be computed at the identity level.

use email or external_id where available

use UUID only for still-unidentified anonymous visitors

never aggregate LTV at session level or cookie level without checking for identity linkage first

Identity correctness guardrails
never merge two identities without a deterministic signal such as email, external_id, or explicit alias

never assume two anonymous UUIDs belong to the same person

never claim cross-device matching unless it is explicitly implemented and labeled

never use heuristic identity expansion silently

Roadmap — not yet implemented
cross-device identity resolution

probabilistic or modeled identity matching

fingerprinting of any kind

automatic cross-domain stitching beyond explicit parameter handoff

identity graph with confidence scoring

server-assisted identity restore beyond same-domain storage recovery

Part 4 — Event model and schema
Core event types
Event	Definition
pageview	Browser visit to a tracked page
conversion	Any defined business conversion captured on-site
offline_conversion	Conversion ingested via offline conversion route
identify	Links an anonymous UUID to a known identity
custom	Any other named event tracked via tracker API
ingestion_method values
Value	Meaning
server_routed	On-site event routed through SourceTrack backend before analytics destination
offline	Conversion ingested via offline API
Required properties on every event
anonymous_id or distinct_id

timestamp in ISO 8601 format

site_key

ingestion_method

event name or event type

Required properties on every conversion
revenue as numeric value, may be 0.0

currency in ISO 4217 where currency exists

conversion_type or event name

ingestion_method

timestamp

Required properties on every attribution-bearing event
utm_source when available

utm_medium when available

utm_campaign when available

referrer, normalized when present

AI source classification flag

country from ingestion-time geo enrichment when available

Schema correctness rules
property names must remain consistent across routes and versions

property types must not change silently

missing required properties must be flagged at ingestion time or rejected explicitly

event names must follow a consistent naming convention

route-specific schema forks must be avoided unless documented here first

Roadmap — not yet in schema
touchpoint_position, required for mature multi-touch models

days_since_first_touch, required for some decay and journey analyses

explicit session_id for first-class session reporting

event_id for robust deduplication and ad-platform forwarding

consent_state snapshot on every tracked event

Part 5 — Server-side tracking and enrichment
What is currently true
All on-site events flow through the SourceTrack backend before analytics storage.

Typical flow:
tracker → /api/track or /api/conversion → backend enrichment → analytics destination

Ingestion-time enrichment rules
Where implemented, enrichment must happen at ingestion and be consistent across routes.

Examples include:

IP-based country detection

device type parsing

UTM normalization

AI referrer classification

ingestion_method labeling

What server-routed tracking is not
Current server-routed tracking must not be described as any of the following unless actually implemented:

cookieless tracking

first-party subdomain or custom CNAME collection

ad-blocker resistant delivery

browser-free event collection

automatic ad-platform server-to-server forwarding

First-party tracking roadmap — not yet implemented
custom subdomain or CNAME routing for collection

consent propagation through server pipeline

ad platform event forwarding such as Meta CAPI or Google Enhanced Conversions

IP-only or cookieless identity fallback

Server-side correctness rules
the same input must produce the same enrichment output regardless of route or query timing

AI detection logic must match across all relevant ingestion routes

ingestion_method must be set intentionally at route level, not guessed later

offline conversions must carry the same normalized fields where available

route-specific enrichment gaps must be treated as correctness issues

Part 6 — LTV and revenue attribution
Current LTV definition
LTV in SourceTrack means historical attributed revenue summed for a given identity
within the selected report configuration and selected attribution model.

LTV model support
LTV is supported for all single-touch models: first_touch, last_touch, first_touch_non_direct, last_touch_non_direct (added Session 61)

first_touch_non_direct LTV: finds the earliest non-direct pageview per identity; if none exists, falls back to the first_touch cookie value; sums all conversion values for that identity and attributes to the resolved source

last_touch_non_direct LTV: finds the latest non-direct pageview per identity; if none exists, falls back to the conversion page UTM; sums all conversion values for that identity and attributes to the resolved source

LTV correctness rules
LTV must be grouped by identity, not by session

email or external_id should be the primary identity key where available

anonymous UUIDs may be included only when still unidentified and must be labeled honestly

LTV totals must reconcile with revenue totals for the same filters and model

the same conversion must not be counted across multiple identity aliases

LTV UI labeling rules
Allowed:

Total attributed revenue per lead

Historical LTV by source

Cumulative attributed revenue

Not allowed unless explicitly implemented:

Predicted LTV

Forecast LTV

Customer Lifetime Value without historical clarification when ambiguity exists

Roadmap — not yet implemented
predictive LTV

CRM-stage weighted LTV

cross-device LTV aggregation

modeled future value scoring

Part 7 — Attribution date modes
Currently supported
conversion_date: bucket each conversion by the date the conversion occurred

first_seen_date: bucket by the date the identity first appeared in the system (implemented Session 35)

original_source_date: bucket by the first qualifying source touchpoint date; visitors without UTM source are excluded (implemented Session 35)

Roadmap — defined for future correct implementation
identified_date: bucket by the date an anonymous lead became identified

Bucketing correctness rules
the same date mode must apply to all dimensions in a single report

week buckets must use ISO week boundaries

quarter buckets must map Q1 Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep, Q4 Oct–Dec

all granularities must produce consistent boundaries across dashboard, API, and exports

Part 8 — Lookback windows
Default lookback
default = 30 days from conversion date

configurable where supported in product

Lookback correctness rules
all touchpoints credited to a conversion must fall within the selected lookback window

touchpoints outside the window must not receive credit

the same boundary logic must apply across first_touch and last_touch

longer-cycle businesses may require longer defaults, but the rule must remain explicit

lookback behavior must be documented in UI where attribution results are shown

Roadmap
per-report configurable lookback options such as 7, 14, 30, 60, and 90 days

sales-cycle-aware default lookback recommendations

explicit lookback metadata in exports and APIs

Part 9 — AI source detection and AI analytics
Detection rules
AI classification must be applied at ingestion time where the feature exists

classification must be based on deterministic referrer or source matching rules

the same classification logic must apply across all relevant ingestion routes

the same referrer must map to the same AI classification in every report

AI analytics metric rules
AI revenue = revenue from conversions whose attributed source is classified as AI

AI conversions = count of conversions whose attributed source is classified as AI

AI conversion rate = AI conversions divided by AI sessions, only when both values are valid

non-AI figures must use the same metric definitions with inverse filtering

AI vs non-AI comparisons must share the same date range, attribution model, and filters

AI insight rules
insights must be derived from surfaced metrics, not hidden heuristics

insight logic must be deterministic and explainable in plain language

thresholds must be inspectable in source code or config

insights must not imply prediction, optimization, or autonomous decision-making unless implemented

What AI analytics is not
Do not describe AI analytics as any of the following unless explicitly built:

predictive modeling

lead scoring

budget optimization

autonomous channel recommendations

automated experimentation decisions

Roadmap — not yet implemented
per-platform AI performance comparisons across more dimensions

trend-based AI insights beyond current deterministic summaries

configurable insight thresholds

negative or warning AI insight classes

Part 10 — Deduplication
On-site deduplication
The same conversion event must not be counted more than once within a single report,
even if it is received multiple times due to retries, tracker reloads, or user refresh behavior.

Offline deduplication
When combining on-site and offline conversions:

deduplicate using deterministic identifiers such as external_id, email, or event_id when available

a conversion present in both sources must be counted once

the precedence rule for duplicate resolution must be documented per integration path

Ad-platform deduplication — roadmap
When browser and server events are both sent to an ad platform in the future:

event_id must be present

event_id must match across browser and server copies of the same conversion

platform-specific deduplication windows must be respected

Deduplication correctness rules
deduplication logic must be deterministic

deduplication must happen before aggregation

deduplication rules must be identical across dashboard, API, and export surfaces

duplicate suppression must not hide genuinely distinct conversions

Part 11 — Consent and privacy
Current state — must be described honestly
If consent enforcement is not implemented, the product must say so clearly.
No docs, prompts, or UI copy may imply a consent-aware pipeline unless it exists.

Required behavior when consent is implemented
default must be no tracking before consent where legally required

analytics_storage denial must stop identity-bearing collection or strip identifiers

ad_user_data denial must prevent forwarding to ad platforms

consent state must propagate consistently through the server pipeline

consent status must be stored and respected across sessions where required

Privacy correctness rules
PII must not be stored in plain text in analytics event properties

email must be hashed before storage where analytics systems receive it

raw IP addresses must not be persisted beyond enrichment necessity

location precision beyond country should require explicit product and legal justification

privacy claims in docs must match actual implementation behavior

Roadmap — not yet implemented
Consent Mode or TCF-integrated pipeline behavior

consent-aware collection degradation

GDPR-compliant deletion and subject-rights workflows

regional data residency controls

Part 12 — Measurement maturity model
World-class measurement software operates across multiple layers.
SourceTrack must describe its current layer honestly and avoid implying higher maturity than the codebase supports.

Layer	What it answers	SourceTrack status expectations
Rule-based attribution	Which source gets credit	Safe to claim only if verified in code
Multi-touch attribution	How credit is split across touchpoints	Roadmap until fully correct and surfaced
LTV attribution	What total historical value came from each source or lead	Must be historical, not predictive, unless stated
AI-source attribution	How much value comes from AI-originated traffic	Valid only if source classification is deterministic and reconciled
Incrementality testing	Did the channel cause lift	Do not claim without testing framework
MMM	What long-term channel contribution exists at aggregate level	Do not claim without spend + time-series modeling
Predictive LTV	What a lead is likely to be worth in future	Do not claim without validated model
Automated optimization	Should spend be reallocated automatically	Do not claim without actual optimization system
Rules for advancing up the maturity model
each lower layer must be correct before building a higher layer on top of it

do not describe a roadmap layer as current functionality

multi-touch requires a trustworthy full touchpoint path

incrementality requires actual experimentation and statistical design

MMM requires aggregated spend data and proper time-series modeling

predictive LTV requires enough data volume and validation discipline

Part 13 — What SourceTrack does not implement unless explicitly changed here
Do not claim, imply, or market any of the following unless this file is updated and the code is verified.

Attribution models
linear multi-touch attribution

time-decay attribution

position-based attribution

data-driven attribution

Identity
cross-device resolution

probabilistic identity matching

fingerprinting

automatic cross-domain identity graphing

confidence-scored identity graph

Tracking infrastructure
cookieless tracking

first-party subdomain or custom CNAME routing

ad-blocker-resistant delivery

pure server-side collection without browser dependency

Ad-platform forwarding
Meta Conversions API

Google Enhanced Conversions

TikTok Events API

any other server-to-server ad platform forwarding

Advanced analytics
incrementality testing

Marketing Mix Modeling

predictive LTV

AI lead scoring

budget or bid optimization

reinforcement learning or bandit-based allocation

CRM and privacy
native CRM integrations unless verified in product

offline-to-online identity graph beyond deterministic linking

consent enforcement pipeline unless verified

data residency controls unless verified

Part 14 — Audit and implementation expectations
This file is intended to be auditable.
Any serious implementation or audit session touching attribution must verify actual code behavior against this file.

Required audit expectations
verify code paths, not just docs or UI

verify UI surfaces, not just backend support

verify docs truthfulness, not just implementation

verify session notes against actual repo state when claims were previously made

label uncertainty explicitly when something cannot be proven from code

Required implementation expectations
new attribution-related work must update this file before or alongside code changes

partial implementations must be labeled as partial in docs and session notes

unsupported roadmap features must not leak into copy, labels, empty buttons, or claims

when a metric is unreliable, fail loud rather than presenting false precision

Conflict rule
If another document, prompt, or UI text conflicts with this file on attribution behavior,
this file wins until it is intentionally updated.

### Part 15 — Saved Reports and Dashboard Rendering (Session 57)

Saved reports are backend-persisted via the `saved_reports` table with per-user, per-site scoping.

Schema:
- `id` (UUID, PK)
- `user_id` (FK → auth.users)
- `site_id` (FK → sites)
- `name` (text)
- `config` (JSONB — stores model, groupBy, metric, chartType, dateFrom, dateTo, granularity, groupBy2, attributionWindow, attributeBy, filters)
- `created_at`, `updated_at` (timestamptz)

API:
- `GET /api/reports/saved` — list saved reports for current user + site (auth required)
- `POST /api/reports/saved` — create a saved report (auth required, validates user owns the site)
- `DELETE /api/reports/saved/:id` — delete a saved report (auth required, validates ownership)

Dashboard rendering (Session 57, updated Session 64):
- Dashboard shows an empty state when no saved reports exist (no fixed analytics grid shown)
- When saved reports exist, renders up to 3 in a "Your Reports" section at the top of the dashboard
- Each shows: report name, primary metric total, mini bar chart of top results
- Click opens Report Builder with the saved config loaded
- Starter templates (Sources, Totals, Conversion Trend) create reports with one click from the empty state
- This is NOT a widget system — no drag-and-drop, no resize, no multi-dashboard
- Dashboard fixed analytics grid appears below saved reports as overview data
- Reports are scoped per site — users cannot see other sites' saved reports
- Seed reports created during onboarding are persisted via API (Session 64 fix from localStorage)

### Part 16 — Super Admin Support Preview (Session 58)

Super admins can view customer dashboards in a read-only support preview mode without impersonation.

Access:
- `POST /api/admin/preview` — initiates preview context (returns site metadata + install status + event counts)
- `GET /api/admin/preview/:siteKey` — returns aggregated dashboard-safe data (KPI summary, top sources, install status) using PostHog HogQL filtered by siteKey
- All routes require server-side `super_admin` role — enforced by `requireRole('super_admin')` middleware

How it works:
- Super admin clicks "Preview Dashboard" from the Site Inspector tab
- Preview context is stored in `sessionStorage` (not auth — no JWT, cookie, or identity switch)
- Dashboard detects the preview context, loads data from `GET /api/admin/preview/:siteKey` instead of the regular user dashboard endpoint
- SupportModeBanner is displayed (amber bar with "Support Preview Mode: [Site Name]" + "Read-only" badge + "Exit Preview" button)
- All write actions, navigation links, and interactive controls are disabled in preview mode
- Admin remains authenticated as super_admin throughout — no customer JWT is minted

What this is NOT:
- Not customer impersonation — admin identity never changes
- Not a customer JWT session — admin uses their own auth token
- Not write-access to customer data — dashboard is read-only
- Not tenant boundary bypass — data is fetched via dedicated admin endpoint, not via customer auth

### Part 17 — Super Admin Phase 2: Recheck, Provenance, Audit Log (Session 59)

Feature status provenance:
- `GET /api/admin/feature-status` returns `last_verified` timestamp and `verification_method` per feature
- `POST /api/admin/feature-status/recheck` runs server-side probes (route existence, module imports) and returns updated statuses + diffs
- Provenance fields: `last_verified` (ISO timestamp), `verification_method` (`code-audit` | `server-probe`)

Audit logging:
- Supabase table `admin_audit_log`: `id`, `admin_user_id`, `action`, `target_type`, `target_id`, `metadata` (JSONB), `created_at`
- Logged actions: `preview_dashboard`, `view_site_detail`, `view_feature_status`, `recheck_features`
- `GET /api/admin/audit-log` returns last 100 entries enriched with admin email

QA Notes:
- Supabase table `qa_notes`: `id`, `feature_key`, `note_type` (`safe_claim` | `watch` | `misleading`), `note_text`, `created_by`, `created_at`, `updated_at`
- `GET /api/admin/qa-notes` — list all notes
- `POST /api/admin/qa-notes` — create note (requires `feature_key`, `note_type`, `note_text`)
- `PUT /api/admin/qa-notes/:id` — update note text/type
- `DELETE /api/admin/qa-notes/:id` — delete note
- All operations require `super_admin` role

What this is NOT:
- Not automated CI/CD integration for status checks (manual recheck only)
- Not user-facing audit log (internal super admin only)
- Not detailed code diffing (only existence checks)
- Not alerting/notifications on status changes

### Part 18 — Attribution Explanation Layer (Session 60)

Attribution explanation: for any single-touch attribution result, show WHY credit was assigned.

Backend:
- `getAttributionExplanation(siteKey, model, distinctId)` in `api/lib/attribution-engine.js`
  - Queries the conversion event for the visitor
  - Queries all events (journey) for the visitor
  - Builds explanation object with:
    - `model`: attribution model used
    - `attributed_to`: { source, medium, campaign }
    - `reason`: human-readable explanation string
    - `fallback`: true if model fell back (e.g., no non-direct touchpoints found)
    - `touchpoint_count`: number of pageview events in journey
    - `journey_duration_days`: days between first and last touchpoint
    - `skipped_touches`: array of direct touches that were skipped (non-direct models only)
    - `all_touches`: chronological list of all pageviews with source/medium/campaign/page_url
- `GET /api/attribution/explain?site_key=X&model=Y&distinct_id=Z`
  - Requires `requireUserAuth`, `validateSiteKey`, `requireSiteMembership`
  - Returns full explanation object or 404 if no conversion found

Frontend:
- `ConversionExplanationModal` component — reusable modal showing:
  - Conversion details (value, date, attributed source, ingestion method)
  - Explanation card (green for normal, amber for fallback) with model name + reason
  - Journey summary tiles (touchpoints, duration, total events)
  - Journey timeline: all pageviews chronologically, attributed touch highlighted in green, skipped touches grayed/strikethrough
  - "Why this attribution?" section explaining the model logic
- Report Builder: "Show Explanation" toggle adds an Explain column to the table. Each row shows brief model-specific text (e.g., "First visit UTM", "Earliest non-direct"). Click opens modal in generic mode (model explanation without specific conversion).
- Dashboard: Attribution model cards in "Attribution Models" section are clickable. Click opens modal in generic mode for that model.

Model explanations:
- `first_touch`: "First Touch assigns 100% credit to the first UTM source this visitor ever encountered. The value is stored in a browser cookie at their initial visit and sent with every conversion event."
- `last_touch`: "Last Touch assigns 100% credit to the UTM source on the page at the time of conversion. If no UTM params are present, the conversion is attributed to 'direct'."
- `first_touch_non_direct`: "First Touch (Non-Direct) finds the earliest pageview with a non-empty, non-direct UTM source. Direct touches are skipped. If the visitor never had a non-direct pageview, it falls back to the first-touch cookie value."
- `last_touch_non_direct`: "Last Touch (Non-Direct) finds the latest pageview with a non-empty, non-direct UTM source. Direct touches are skipped. If the visitor never had a non-direct pageview, it falls back to the conversion page UTM."
- `ai_platforms`: "AI Platform attribution detects the referrer at conversion time and matches it against known AI platform domains."

What this is NOT:
- Not multi-touch credit distribution visualization (single-touch only)
- Not "what-if" model comparison (shows actual attribution only)
- Not journey editing or manual attribution override
- Not aggregate journey analytics (e.g., "most common paths")
- Not per-conversion journey drilldown for `ltv_revenue` (LTV is per-identity aggregation; the explanation modal shows model logic but not a specific conversion's journey)

### Part 19 — LTV Non-Direct Model Support (Session 61)

LTV revenue now supports all single-touch models including non-direct variants.

Backend changes:
- `getFlexibleReport` LTV branch removed the `first_touch`/`last_touch` only restriction
- `first_touch_non_direct` LTV: LEFT JOIN qualifying pageviews (earliest non-direct per distinct_id); dimension expressions fall back to `first_touch_*` cookie values when no qualifying pageview exists
- `last_touch_non_direct` LTV: LEFT JOIN qualifying pageviews (latest non-direct per distinct_id); dimension expressions fall back to conversion event UTM values when no qualifying pageview exists
- UUID exclusion applied to all LTV models (anonymous-only visitors excluded)
- `events` table remains unaliased in LTV SQL so existing `properties.` and `timestamp.` references in filter clauses work without modification

Frontend changes:
- Report Builder: LTV metric description updated to state support for all single-touch models including non-direct variants
- Dashboard: new "LTV by Model" card showing:
  - Total LTV for each of the four single-touch models (first_touch, last_touch, first_touch_non_direct, last_touch_non_direct)
  - Clickable model buttons to select which model's breakdown to view
  - Top 5 sources by LTV for the selected model, with horizontal bar visualization
  - Loading states for each model query

What this is NOT:
- Not predictive LTV (only historical sum)
- Not cohort-based LTV analysis
- Not LTV time-decay or weighting
- Not customer-level LTV drilldown (aggregate only)

### Part 20 — Sessionization Foundation (Session 62)

Sessionization is derived on read from pageview events using a 30-minute inactivity timeout.
Sessions are NOT materialized in a database table. Every session query computes sessions at request time.

Session definition:
- A session starts with the first event after 30+ minutes of inactivity, or the first event for a visitor
- A session ends at the last event before the next session starts, or at the last event overall
- Session duration = last event timestamp - first event timestamp (seconds)
- Entry source = UTM source of the first pageview in the session (or 'direct' if none)
- Entry medium = UTM medium of the first pageview in the session (or 'none' if none)
- Entry campaign = UTM campaign of the first pageview in the session (or null if none)
- Entry page = page_url of the first pageview in the session
- Exit page = page_url of the last pageview in the session
- Pageview count = count of $pageview events in the session
- Event count = count of all events ($pageview + $conversion) in the session
- Contains conversion = true if any $conversion event falls within the session's time bounds

Backend:
- `api/lib/sessionization.js` — `deriveSessions(events)` groups events into sessions
- `api/routes/sessions.js` — `GET /api/sessions/overview` for dashboard aggregates; `GET /api/sessions` for per-visitor session list
- `api/lib/attribution-engine.js` — `getSessionReport()` derives sessions from pageviews and aggregates by dimension for Report Builder
- `getFlexibleReport` delegates session metrics (`session_count`, `avg_session_duration`, `pages_per_session`, `conversion_sessions`) to `getSessionReport`
- Session queries are limited to 50,000 pageview events per query for performance

Frontend:
- Dashboard: "Session Analytics" card showing total sessions, avg duration, pages/session, conversion sessions, and sessions-over-time chart
- Report Builder: new "Session" metric group with `session_count`, `avg_session_duration`, `pages_per_session`, `conversion_sessions`
- Attribution Explanation Modal: toggle between "Event Timeline" and "Session Timeline"; session summary tiles (session count, converting session index, pages in converting session)
- The existing "Sessions" metric in Report Builder was renamed to "Unique Visitors" to fix the mislabel

What this is NOT:
- Not a persisted sessions table (no migration, no materialization)
- Not real-time session tracking
- Not session-level attribution (sessions are behavioral, not credit-assigning)
- Not cross-device session stitching
- Not session replay or heatmap data