# Architecture

Maps the SourceTrack app so agents find the right files fast. Verified by grep against `main` (2026-07-20). **Code wins** over this doc — re-verify a load-bearing line before trusting it.

## High-level flow

    Browser visitor
      -> tracker/tracker.js  (served as tracker.min.js)
      -> Express API (/api/track, /api/conversion, …)
      -> dual-write: Tinybird (ClickHouse) events datasource  +  Supabase (attribution/conversions/revenue)
      -> reads: Tinybird pipes (tinybird/pipes/*.pipe) via api/lib/tinybird-read.js
      -> React dashboard

*(PostHog was the event store until it was decommissioned 2026-07-19 — project 416017 deleted, the PostHog client library removed. It is gone; there is no fallback.)*

## Data stores

**Supabase (Postgres) — source of truth for:** users/auth, sites, workspace/company membership, attribution, conversions, revenue, billing/entitlements, saved reports, admin audit log, QA notes, dashboard widget config. RLS on every tenant table.

**Tinybird (ClickHouse) — analytics read/write layer:** `$pageview` / `$conversion` / custom events + the properties used for aggregation reporting, served by deployed pipes. Reads go through `api/lib/tinybird-read.js`.

> The Supabase `pageviews` table is **empty by design** — analytics reads come from Tinybird. Do not "repair" it or repoint reads at it.

## Main directories
- `/api` — Express API
- `/dashboard` — Vite React dashboard
- `/tracker` — browser tracker (source + minified builds)
- `/supabase` — schema and migrations
- `/tinybird` — pipes (`tinybird/pipes/`), typed-column reference `tinybird/SCOPE_v3.md`, archived planning docs `tinybird/archive/`

## Tracker

Files (all real, deduped):
- `tracker/tracker.js` — source; built to `tracker/tracker.min.js` (the **served** file)
- `tracker/tracker.cookieless.js` → `tracker/tracker.cookieless.min.js` — strictly-cookieless build, **exists but NOT served**
- `tracker/analytics.js` — Plausible-style internal pageview analytics **bundled into our own dashboard**, not customer-installed

Responsibilities (verified in `tracker/tracker.js`):
- Read site key from the script tag (`data-site-key`).
- Create/load a first-party visitor ID (cookieless — `localStorage` by default; cookie only on opt-in `data-cookie-domain`, see `SYSTEM.md`).
- Capture URL params, click IDs, referrer; store first-touch attribution.
- Send pageviews/events/conversions.
- Expose the **`window.sourcetrack`** browser API (e.g. `sourcetrack.getToken()`).
- Cross-domain link decoration (opt-in `data-cross-domains`).
- Populate pre-existing hidden form fields (opt-in `data-auto-fields="true"`).

After changing tracker source: `npm run build:tracker`.

## Backend route mounting

Main file: `api/index.js`. The authoritative mounted-route list is `grep -oE "routes/[a-z0-9-]+\.js" api/index.js` (**39 route files** as of 2026-07-20). Core route files (all mounted):

`api/routes/track.js` · `conversion.js` · `conversion-offline.js` · `identify.js` · `attribution.js` · `analytics.js` · `events.js` · `saved-reports.js` · `dashboard.js` · `journey.js` · `leads-server.js` · `campaigns.js` · `campaign-costs.js` · `sessions.js` · `export.js` · `install.js` · `onboarding.js` · `admin.js` · `hygiene.js` · `integrations.js` · `billing.js` · `stripe-webhook.js` · `shopify-webhook.js` · `webhooks.js` · `webhook-incoming.js` · `alerts.js` · `site-alerts.js` · `sites.js` · `seo-revenue.js` · `gdpr.js` · `google-search-console.js` · `ad-platforms.js` · `capi.js` · `server-events.js` · `pixel.js` · `proxy.js` · `tracker-id.js` · `job-status.js` · `live.js`

> Deleted (do not re-add): `ai-analytics.js` (#315), `ai-chat.js`, `annotations.js` (#315), `public-dashboard.js` (#323).

## Middleware
`api/middleware/`: `auth.js` · `user-auth.js` · `api-key.js` · `rate-limit.js` · `ai-platform.js` · `managed-proxy.js` · `request-id.js` · `tier-check.js`

Common chain for authenticated site-scoped routes:

    requireUserAuth  ->  validateSiteKey  ->  requireSiteMembership  ->  handler

Tracking/conversion routes validate `site_key` but do not require user Bearer auth (public events).

## The Tinybird read contract
Reads fail **closed**: `queryTinybirdPipe` returns `null` on exhaustion (never throws); `readTb` (`api/routes/dashboard.js`) and engine `_pipeNull` (`api/lib/attribution-engine.js`) throw on `null`; the nightly aborts its write. **No fallback store.** Full contract + pipe conventions are in `SYSTEM.md`.

## Attribution

Core files: `api/lib/attribution-engine.js` · `api/routes/attribution.js` · `api/lib/sessionization.js` · `api/lib/tinybird-read.js` · `api/lib/channel-classifier.js` · `api/jobs/nightly-attribution.js`.

Supported models (**9**, defined in `attribution-engine.js`): `first_touch` · `last_touch` · `first_touch_non_direct` · `last_touch_non_direct` · `linear` · `u_shaped` · `time_decay` · `w_shaped` · `ai_platforms`.

Channel taxonomy (single source of truth `api/lib/channel-classifier.js`): Direct · Organic Search · Paid Search · Organic Social · Paid Social · Email · AI Search · Referral · Other.

## Active-site resolution (#320)
Every dashboard page that queries site-scoped data resolves the active site through **`dashboard/src/hooks/useActiveSite.js`** — it reads the selector from `SiteContext`. Ten pages previously ran a mount-time `sites … limit(1)` that ignored the selector (a multi-site customer saw the wrong site); that pattern is banned — use the hook.

## Cron jobs (production — `restartPolicyType: NEVER`)

Read from Railway prod config (verified this session). A crashed run is **not** retried until the next fire.

| Service | Job | cron | note |
|---|---|---|---|
| nightly-attribution | `api/jobs/nightly-attribution.js` | `0 2 * * *` | NEVER → a failure is a ~24h money-rail gap, no retry |
| sourcetrack-dq | `api/jobs/data-quality-check.js` | `0 0 * * *` | (README previously said `0 3` — wrong) |
| sourcetrack-health | `api/jobs/health-agent.js` | `*/30 * * * *` | |
| sourcetrack-email | `api/jobs/email-reports.js` | `0 8 * * 1` | ⚠️ **MISCONFIGURED — has never sent an email.** The job is in `buildCommand` (runs at build time) and `startCommand` is null → the cron boots `bootstrap.js` and crashes. |

- `api/jobs/anomaly-watcher.js` — exists, runs on **staging** (`0 3 * * *`), **unscheduled in production** (has never run in prod).
- `api/jobs/usage-threshold-emails.js` — scheduled **nowhere** (not staging, not prod).

## Frontend pages
Key pages (`dashboard/src/pages/`): `Dashboard.jsx` · `Analytics.jsx` · `AttributionPage.jsx` · `ReportBuilder.jsx` · `Leads.jsx` · `LeadDetail.jsx` · `Campaigns.jsx` · `Integrations.jsx` · `SEORevenue.jsx` · `EventDebugger.jsx` · `Setup.jsx` · `Onboarding.jsx` · `Billing.jsx` · `Settings.jsx` · `Admin.jsx`.

> Deleted (do not re-add): `AIAnalytics.jsx` (#315), `Journey.jsx` (#317), `Snippet.jsx` (#319), `ShareDashboard.jsx` (#323). Live-events / event-debugging is `EventDebugger.jsx`, embedded in `Setup.jsx`.

Shared helpers: `dashboard/src/lib/api.js` · `dashboard/src/lib/supabase.js` · `dashboard/src/lib/seedReports.js` · `dashboard/src/contexts/AuthContext.jsx` · `dashboard/src/hooks/useActiveSite.js`.

## Report Builder
`dashboard/src/pages/ReportBuilder.jsx` + `api/routes/attribution.js` + `api/lib/attribution-engine.js` + `api/routes/saved-reports.js`. Preview / save / load / update / duplicate / delete / filter / group-by. Saved reports persist in the Supabase `saved_reports` table, user/site scoped (`api/routes/saved-reports.js`).

## Event Logger
`dashboard/src/pages/EventDebugger.jsx` + `api/routes/events.js` + `api/routes/hygiene.js`. Debug incoming events, inspect properties, verify UTMs/ref/source/via/first-touch/conversions/AI-source, monitor data-quality issues.

## Leads · Campaigns · Integrations
- Leads: `api/routes/leads-server.js` + `Leads.jsx` + `LeadDetail.jsx`.
- Campaigns: `api/routes/campaigns.js` + `Campaigns.jsx`. Uses attribution/event data. Do **not** claim ad-spend ingestion or ad-set/ad-ID reporting.
- Integrations: `api/routes/integrations.js` + `Integrations.jsx`. Do **not** claim live ad-platform ingestion unless code proves it.

## Known-stale artifacts (verified 2026-07-20)
- `supabase/schema.sql` — **stale** (migration-driven schema; `KNOWN_ISSUES.md §1`).
- `api/lib/hogql-date.js` — PostHog-era **name**, still imported by 8 files → **rename, don't delete** (it's live code).
- `api/lib/abuse-guards.js` — vestigial (free-tier abuse enforcement moved to a Postgres trigger `enforce_free_tier_abuse_guards`); JS has ~zero live refs.
- `api/lib/url-normalization.js` **and** `api/lib/url-normalize.js` both exist — possible duplicate, audit candidate.
- `dashboard/src/components/Layout.jsx` — `/debugger` title-map entry is dead (no route); removed in a separate PR.
- `supabase/migrations/20260620134500_add_site_support_notes.sql` — dangling migration (applied to neither env; founder apply-or-delete pending, `KNOWN_ISSUES.md §17`).
- `api/middleware/rate-limit.js` — `publicDashboardLimit` / `createPublicDashboardLimit` orphaned by #323 (no production caller; behaviour tests still exercise them).

## Important constraints
- Supabase schema is migration-driven; `schema.sql` may be stale — verify against the live DB.
- **Tinybird is the source of truth for event analytics; Supabase for attribution/conversions/revenue/billing + user/site/config.** (PostHog is gone.)
- Minified tracker files must be rebuilt after tracker source changes (`npm run build:tracker`).
- `docs/archive/PROGRESS.md` is history/navigation, not proof.
