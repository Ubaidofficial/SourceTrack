# Architecture

This file maps the SourceTrack app so agents can find the correct files quickly.

## High-level flow

    Browser visitor
      -> tracker/loader.js
      -> tracker/tracker.js
      -> Express API
      -> PostHog events
      -> HogQL reports
      -> React dashboard

Supabase stores:

- auth/users
- sites
- companies/workspaces
- saved reports
- admin audit/QA notes
- dashboard widget config

PostHog stores:

- pageviews
- conversions
- identify events
- custom events
- event properties used for attribution

## Main directories

- `/api` - Express API
- `/dashboard` - Vite React dashboard
- `/tracker` - browser pixel and loader
- `/supabase` - schema and migrations

## Tracker

Files:

- `tracker/loader.js`
- `tracker/tracker.js`
- `tracker/loader.min.js`
- `tracker/tracker.min.js`

Responsibilities:

- Read site key from script tag.
- Create/load anonymous visitor ID.
- Capture URL params.
- Store first-touch attribution.
- Send pageviews/events/conversions.
- Expose `trackiq` browser API.
- Support cross-domain ID URL decoration.
- Populate hidden fields with `data-trackiq` attributes.

If tracker source changes, run:

    npm run build:tracker

## Backend route mounting

Main file:

- `api/index.js`

Core route files:

- `api/routes/track.js`
- `api/routes/conversion.js`
- `api/routes/conversion-offline.js`
- `api/routes/identify.js`
- `api/routes/attribution.js`
- `api/routes/events.js`
- `api/routes/saved-reports.js`
- `api/routes/dashboard.js`
- `api/routes/ai-analytics.js`
- `api/routes/journey.js`
- `api/routes/leads-server.js`
- `api/routes/campaigns.js`
- `api/routes/sessions.js`
- `api/routes/export.js`
- `api/routes/install.js`
- `api/routes/onboarding.js`
- `api/routes/admin.js`
- `api/routes/hygiene.js`
- `api/routes/integrations.js`
- `api/routes/billing.js`
- `api/routes/ai-chat.js`
- `api/routes/alerts.js`

## Middleware

Important middleware:

- `api/middleware/auth.js`
- `api/middleware/user-auth.js`
- `api/middleware/rate-limit.js`
- `api/middleware/ai-platform.js`

Common chain for authenticated site-scoped routes:

    requireUserAuth
    validateSiteKey
    requireSiteMembership
    route handler

Tracking/conversion routes validate site key but do not require user Bearer auth because they receive events from public websites.

## Data stores

Supabase is the source of truth for:

- users/auth
- sites
- workspace/company membership
- saved reports
- admin audit log
- QA notes
- dashboard widget configuration

PostHog is the source of truth for:

- `$pageview`
- `$conversion`
- custom events
- event properties
- attribution/reporting data

## Attribution

Core files:

- `api/lib/attribution-engine.js`
- `api/routes/attribution.js`
- `api/lib/sessionization.js`
- `api/lib/posthog.js`

Supported attribution models:

- `first_touch`
- `last_touch`
- `first_touch_non_direct`
- `last_touch_non_direct`
- `ai_platforms`

Supported Report Builder dimensions include:

- `channel`
- `source`
- `medium`
- `campaign`
- `ai_source`
- `landing_page`
- `country`
- `device`
- `conversion_type`
- `date`

Current channel taxonomy:

- Direct
- Organic Search
- Paid Search
- Organic Social
- Paid Social
- Email
- AI Search
- Referral
- Other

## Frontend pages

Key pages:

- `dashboard/src/pages/Dashboard.jsx`
- `dashboard/src/pages/ReportBuilder.jsx`
- `dashboard/src/pages/EventDebugger.jsx`
- `dashboard/src/pages/Snippet.jsx`
- `dashboard/src/pages/Onboarding.jsx`
- `dashboard/src/pages/AIAnalytics.jsx`
- `dashboard/src/pages/Leads.jsx`
- `dashboard/src/pages/LeadDetail.jsx`
- `dashboard/src/pages/Journey.jsx`
- `dashboard/src/pages/Campaigns.jsx`
- `dashboard/src/pages/Integrations.jsx`
- `dashboard/src/pages/Admin.jsx`
- `dashboard/src/pages/Settings.jsx`

Shared frontend helpers:

- `dashboard/src/lib/api.js`
- `dashboard/src/lib/supabase.js`
- `dashboard/src/lib/seedReports.js`
- `dashboard/src/contexts/AuthContext.jsx`

## Report Builder

Main files:

- `dashboard/src/pages/ReportBuilder.jsx`
- `api/routes/attribution.js`
- `api/lib/attribution-engine.js`
- `api/routes/saved-reports.js`
- `dashboard/src/lib/api.js`

Features:

- preview report
- save report
- load report
- update report
- duplicate report
- delete report
- filter report
- group by source/channel/medium/campaign/etc.

Important presets:

- Revenue by Channel
- Conversions by Channel
- AI Revenue by Source
- Campaign Revenue
- Top Landing Pages
- Conversion Trend

## Event Logger

Main files:

- `dashboard/src/pages/EventDebugger.jsx`
- `api/routes/events.js`
- `api/routes/hygiene.js`

Purpose:

- debug incoming events
- inspect raw properties
- verify UTMs/ref/source/via
- verify first-touch fields
- verify conversions
- verify AI source detection
- monitor data quality issues

## Saved reports

Backend persisted through:

- `api/routes/saved-reports.js`
- `saved_reports` table in Supabase

Frontend uses:

- `dashboard/src/pages/ReportBuilder.jsx`
- `dashboard/src/pages/Dashboard.jsx`

Saved reports are user/site scoped.

## AI analytics

AI source detection:

- `api/middleware/ai-platform.js`

AI reporting:

- `api/routes/ai-analytics.js`
- `dashboard/src/pages/AIAnalytics.jsx`

Safe claim:

    SourceTrack detects AI referrals when the platform sends a detectable referrer.

Do not claim universal AI traffic detection.

## Leads and journeys

Leads:

- `api/routes/leads-server.js`
- `dashboard/src/pages/Leads.jsx`
- `dashboard/src/pages/LeadDetail.jsx`

Journey:

- `api/routes/journey.js`
- `dashboard/src/pages/Journey.jsx`

## Campaigns

Campaign reporting files:

- `api/routes/campaigns.js`
- `dashboard/src/pages/Campaigns.jsx`

Current status:

- Campaigns use attribution/event data.
- Do not claim ad spend ingestion or ad-account/ad-set/ad-ID reporting.

## Integrations

Files:

- `api/routes/integrations.js`
- `dashboard/src/pages/Integrations.jsx`

Current stance:

- Integration UI exists.
- Many integrations are future-facing.
- Do not claim live ad platform integrations unless code proves ingestion.

## Important constraints

- Supabase schema is migration-driven; `schema.sql` may be stale.
- PostHog is source of truth for event analytics.
- Supabase is source of truth for user/site/config data.
- Tracker minified files must be rebuilt after tracker source changes.
- `PROGRESS.md` is history/navigation, not proof.
