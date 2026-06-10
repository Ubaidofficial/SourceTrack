# SourceTrack

Privacy-first marketing attribution + cookieless web analytics for SaaS, ecommerce, and AI-native businesses.

- **Cookieless** — no `document.cookie`, no fingerprinting, no IP storage
- **Honors DNT / Global Privacy Control** — aborts before any storage or network
- **Multi-touch attribution** — first-touch, last-touch, linear, U-shaped, time-decay, W-shaped models
- **Click-ID detection** — `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `twclid`
- **AI traffic attribution** — ChatGPT, Claude, Perplexity, Gemini, Grok, Copilot, DeepSeek + ~10 more
- **Conversion forwarding** — outbound conversion events to configured ad platforms (Meta, Google Ads, Microsoft, LinkedIn, TikTok) where customer credentials are provided; hashed PII and event-id deduplication
- **Cookieless web analytics** — Plausible-style page-view dashboard (separate tracker)

---

## Quick start

### 1. Install

```bash
git clone https://github.com/Ubaidofficial/SourceTrack.git trackiq
cd trackiq
npm install
cd dashboard && npm install && cd ..
```

### 2. Configure

```bash
cp .env.example .env
# Fill in Supabase, PostHog, Stripe, and optional AI keys
```

See [Environment variables](#environment-variables) below for the full list.

### 3. Run

```bash
# API + dashboard
npm start                  # API only
cd dashboard && npm run dev # frontend dev server
```

Production deploys on Railway — see [`AUDIT_PROD_READINESS_V2.md`](./AUDIT_PROD_READINESS_V2.md) for the cron config that needs to be set in the Railway dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Customer site                                                    │
│   <script async src=".../tracker.min.js" ...>                    │
│      │ pageview + first-touch + click-IDs + AI-source            │
│      ▼                                                            │
│ /api/track ──► PostHog (events) ──► nightly attribution job      │
│                                                                  │
│   sourcetrack.conversion({ value, type, order_id, email })       │
│      │                                                            │
│      ▼                                                            │
│ /api/conversion ──► PostHog ($conversion event)                  │
│                ──► CAPI: Meta, Google, Microsoft, LinkedIn, TikTok│
│                       (async, hashed email, event-id dedup)      │
│                                                                  │
│ /api/identify ──► ph.identify + ph.alias                         │
│                       (stitches anonymous_id → user_id for LTV)  │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ▼
              ┌─────────────────────┐
              │ Nightly cron (02:00) │
              │  - Queries PostHog   │
              │  - Computes models   │
              │  - Writes Supabase   │
              │    attributed_       │
              │    conversions       │
              └─────────────────────┘
                       │
                       ▼
              Dashboard (React)
              reads attributed_conversions for
              fast (< 1s) attribution reports
```

### Two trackers

- **`tracker/tracker.min.js`** — attribution tracker. Sends events to `/api/track`, captures click-IDs, first-touch, AI source.
- **`tracker/analytics.js`** — web analytics tracker (separate). Sends to `/api/analytics/collect` for Plausible-style page-view dashboards.

Customers install **only** the attribution tracker on their site. The analytics tracker is bundled into the SourceTrack dashboard for our own internal page-view analytics.

### Data flow

1. **Pageview** → tracker.js → `/api/track` → PostHog (event-time enrichment: country via GeoIP, browser/OS via UAParser, AI source detection)
2. **Conversion** → `sourcetrack.conversion(...)` → `/api/conversion` → PostHog `$conversion` + async CAPI to all 5 ad platforms
3. **Nightly job** (Railway cron 02:00 UTC) → queries PostHog for the last N days of $conversion events → fetches each visitor's touchpoint history → computes 4 attribution models + confidence score → upserts to `attributed_conversions` in Supabase
4. **Dashboard** → reads pre-aggregated `attributed_conversions` for sub-second queries

See [`ATTRIBUTION.md`](./ATTRIBUTION.md) for the attribution algorithm details and [`AUDIT_PROD_READINESS_V2.md`](./AUDIT_PROD_READINESS_V2.md) for the production readiness audit results.

---

## Environment variables

All required at startup (`api/index.js` fails fast on missing vars):

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | yes | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | yes | Service-role key (backend only — never bundle this). Also known as `SUPABASE_SERVICE_ROLE_KEY` in Supabase UI. |
| `SUPABASE_ANON_KEY` | yes | Anon key for the dashboard |
| `POSTHOG_HOST` | yes | `https://app.posthog.com` or `https://eu.posthog.com` |
| `POSTHOG_API_KEY` | yes | Project API key (write) |
| `POSTHOG_PERSONAL_API_KEY` | yes | Personal API key (HogQL queries from nightly job) |
| `POSTHOG_PROJECT_ID` | yes | PostHog numeric project ID |
| `ENCRYPTION_KEY` | yes (prod) | Symmetric key used to encrypt customer Stripe/Shopify secrets. Use a 64-character hex string generated with the command below. Must be kept stable per environment. |
| `STRIPE_SECRET_KEY` | yes (billing) | Stripe live or test secret |
| `STRIPE_WEBHOOK_SECRET` | yes (billing) | Stripe webhook signing secret |
| `STRIPE_PRICE_ID_STARTER`, `_GROWTH`, `_SCALE` | yes (billing) | Per-plan recurring price IDs. Legacy `_BUSINESS` / `_PRO` / `_AGENCY` are still read as fallbacks. Each Stripe price may carry a `pv_limit` metadata key to override the plan's default monthly pageview cap. |
| `RESEND_API_KEY` | optional | Email reports (weekly/monthly recap) |
| `DEEPSEEK_API_KEY` | optional | AI chat + AI analytics features |
| `SLACK_WEBHOOK_URL` | optional | Nightly job alert webhook |
| `NIGHTLY_CONCURRENCY` | optional | Worker pool size for nightly attribution (default 4, range 1–8) |
| `ALLOWED_ORIGINS` | yes | Comma-separated dashboard origins for CORS |
| `META_TEST_EVENT_CODE` | dev only | Meta CAPI test events — omit in production |
| `GOOGLE_ADS_ACCESS_TOKEN` | optional | OAuth2 token for Google Ads CAPI |

> [!NOTE]
> - `SUPABASE_SERVICE_ROLE_KEY` in Supabase corresponds to `SUPABASE_SERVICE_KEY` in the Node.js API codebase.
> - `JWT_SECRET` is not used in the Node.js API backend (Supabase token validation is handled directly by the API calling `supabase.auth.getUser()`).

### Generating ENCRYPTION_KEY
To generate a secure 64-character hex key, run:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Do not commit this key. Set it in the production environment variables (e.g. Railway API service variables). Keep it stable per environment; if changed, existing encrypted webhook secrets will no longer decrypt and customers must re-enter them in the Integrations UI.

---

## Production Deployment Checklist

Before launching to production, complete the following steps:

### 1. Database Migrations (Supabase)
- Ensure all migrations in `supabase/migrations/` have been run against the production database, specifically:
  - `20260606180000_revenue_foundation.sql` (implements the idempotency keys table, ingestion audit logs, and `claim_revenue_idempotency_keys` RPC).
  - Performance indexes migration (`20260520000001_attribution_performance_indexes.sql`).
- Run `ANALYZE attributed_conversions; ANALYZE pageviews;` in the Supabase SQL editor to update query planner stats.

### 2. Environment Variables (Railway)
Ensure the following variables are set in the Railway API service settings:
- **Required Core**:
  - `SUPABASE_URL`: Production Supabase URL.
  - `SUPABASE_SERVICE_KEY`: Production Supabase `service_role` secret key. (Note: Do NOT use the `anon` key here).
  - `POSTHOG_HOST`: Usually `https://app.posthog.com` or `https://eu.posthog.com`.
  - `POSTHOG_API_KEY`: PostHog project write key.
  - `ENCRYPTION_KEY`: A cryptographically secure 64-character hex string generated using the command above. Keep this key stable!
- **Dashboard / Analytics Querying**:
  - `POSTHOG_PROJECT_ID`: Required for dashboards/attribution querying.
  - `POSTHOG_PERSONAL_API_KEY`: Required for querying PostHog events via HogQL.
  - `STRIPE_SECRET_KEY` & `STRIPE_WEBHOOK_SECRET`: Required for user subscription handling.
  - `STRIPE_PRICE_ID_STARTER`, `_GROWTH`, `_SCALE`: Stripe recurring price IDs. Legacy `_BUSINESS` / `_PRO` / `_AGENCY` are fallbacks.
  - `RESEND_API_KEY`: Required for daily/weekly recaptured email reports.
  - `ALLOWED_ORIGINS`: Comma-separated list of allowed frontend dashboard URLs (e.g. `https://app.sourcetrack.ai`).

### 3. Background Cron Jobs (Railway)
Verify the background jobs are set up as cron services in the Railway dashboard:
- `node api/jobs/nightly-attribution.js` runs daily at `0 2 * * *`.
- `node api/jobs/data-quality-check.js` runs daily at `0 3 * * *`.
- `node api/jobs/health-agent.js` runs every 30 minutes (`*/30 * * * *`).
- `node api/jobs/email-reports.js` runs every Monday at `0 8 * * 1`.
- `node api/jobs/usage-threshold-emails.js` runs daily at `0 14 * * *`.

---

## Background jobs

Configured as Railway cron services (UI-only — not in this repo):

| Job | Schedule (UTC) | Command |
|---|---|---|
| Nightly attribution | `0 2 * * *` | `node api/jobs/nightly-attribution.js` |
| Data quality check | `0 3 * * *` | `node api/jobs/data-quality-check.js` |
| Health agent | `*/30 * * * *` | `node api/jobs/health-agent.js` |
| Email reports | `0 8 * * 1` | `node api/jobs/email-reports.js` |
| Usage threshold emails | `0 14 * * *` | `node api/jobs/usage-threshold-emails.js` |

The nightly job has a concurrency lock (`job_runs.status='running'`, 6h TTL) and retries PostHog 429s with exponential backoff.

---

## Privacy

SourceTrack is designed to be deployable without a cookie consent banner in most jurisdictions:

- No `document.cookie` usage anywhere in `tracker/tracker.js` or `tracker/analytics.js`
- No fingerprinting (no canvas, AudioContext, WebGL, navigator.plugins, etc.)
- IP addresses are used for GeoIP lookup at request time and **not stored** in any table
- Anonymous IDs live in `localStorage` (per-origin, never cross-customer)
- `navigator.doNotTrack === '1'` and `navigator.globalPrivacyControl === true` are honored before any storage or network
- `/api/gdpr/visitor` endpoint exists for right-to-erasure deletion (erases database attribution and stitched identity records, and triggers a best-effort PostHog person deletion)
- Per-site `data_retention_days` configurable; nightly job purges older rows

You still need to disclose data collection in your privacy policy — the dashboard's Install page shows a reminder.

---

## Continuous Integration (CI)

A lightweight CI regression pipeline runs automatically on every pull request and push to `main` via GitHub Actions (`.github/workflows/ci.yml`).

### Core Pipeline Design & Boundaries:
1. **Static & Build-Only:** The workflow executes checkout, sets up Node 20, runs separate installs (`npm ci` at root, `cd dashboard && npm ci`), checks JavaScript file syntax (`node --check`), scans git diff range for committed whitespace violations, runs static launch audits (`npm run qa:static`), and compiles the dashboard production build.
2. **No DB/API Mutation or Live Service Checks:** Under no circumstances are live-service database QA, PostHog integrations, Stripe webhook scripts, or runtime smoke/edge tests allowed in the CI environment.
3. **Staging is Mandatory:** CI only guards against obvious compilation and static syntax regressions. It does not replace staging database verification. Setting up full staging/production isolation remains a mandatory P0 launch blocker before paid beta release. Live-service QA tests must remain out of CI until a dedicated staging pipeline is established.

---

## Documentation

| File | Purpose |
|---|---|
| [`ATTRIBUTION.md`](./ATTRIBUTION.md) | Attribution model details (first-touch, last-touch, U-shaped math, channel classification) |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System architecture deep-dive |
| [`SUPABASE_SCHEMA.md`](./SUPABASE_SCHEMA.md) | Database schema reference |
| [`AUDIT_PROD_READINESS_V2.md`](./AUDIT_PROD_READINESS_V2.md) | Production-readiness audit + scoreboard + Railway config steps |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release notes |
| [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) | Tracked issues + their status |

---

## License

Proprietary. All rights reserved.
