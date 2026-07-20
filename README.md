# SourceTrack

Privacy-first marketing attribution + cookieless-by-default web analytics for SaaS, ecommerce, and AI-native businesses.

- **Cookieless by default** — visitor IDs in first-party `localStorage`; no fingerprinting; IP used for GeoIP at request time and never stored. A first-party cookie is written **only** when the customer opts in via the `data-cookie-domain` script attribute (see [Privacy](#privacy)).
- **Honors DNT / Global Privacy Control** — aborts before any storage or network.
- **Multi-touch attribution** — 9 models: first-touch, last-touch, first/last-touch-non-direct, linear, U-shaped, time-decay, W-shaped, AI-platforms.
- **Click-ID detection** — 13: `gclid`, `gbraid`, `wbraid`, `dclid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `twclid`, `snapclid`, `pclid`, `sccid`, `ko_click_id`.
- **AI traffic attribution** — ChatGPT, Claude, Perplexity, Gemini, Grok, Copilot, DeepSeek + more (22 domains).
- **Conversion forwarding (CAPI)** — outbound conversions to Meta and Google Ads where the customer provides credentials; hashed PII, event-id dedup.

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
# Fill in Supabase, Tinybird, and Stripe (+ optional keys). See Environment variables below.
```

### 3. Run

```bash
npm start                    # API
cd dashboard && npm run dev  # frontend dev server
```

Production deploys on Railway (see [Background jobs](#background-jobs) for the cron config, which is set in the Railway UI, not this repo).

---

## Architecture

```
Customer site
  <script async src=".../tracker.min.js" data-site-key="...">
      │  pageview + first-touch + click-IDs + AI-source
      ▼
  /api/track ───► dual-write: Tinybird events datasource + Supabase (attribution)
  /api/conversion ($conversion) ───► Tinybird  +  async CAPI (Meta, Google Ads)

  Nightly cron (02:00 UTC)  api/jobs/nightly-attribution.js
    - reads conversions + touchpoints from Tinybird pipes
    - computes the attribution models + confidence
    - writes attributed_conversions in Supabase   (fails CLOSED on a null read — no fallback)
      ▼
  Dashboard (React) reads pre-aggregated attributed_conversions for sub-second reports
```

> PostHog was the event store until it was **decommissioned 2026-07-19** (project 416017 deleted). Analytics now read from **Tinybird (ClickHouse)** via deployed pipes (`tinybird/pipes/*.pipe`) through `api/lib/tinybird-read.js`; there is no fallback to PostHog. Details: [`SYSTEM.md`](./SYSTEM.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md).

### Two trackers
- **`tracker/tracker.min.js`** — the attribution tracker customers install. Sends to `/api/track`; captures click-IDs, first-touch, AI source.
- **`tracker/analytics.js`** — a separate Plausible-style page-view tracker, **bundled into the SourceTrack dashboard** for our own internal analytics. Not customer-installed. (A strictly-cookieless build `tracker/tracker.cookieless.js` exists but is **not served**.)

---

## Environment variables

Boot fails fast on missing vars — but **only `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are required to boot** (the boot-required set in `api/index.js`). Everything else is feature-scoped.

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | **boot** | Supabase project URL (source of truth: attribution, conversions, revenue, billing). |
| `SUPABASE_SERVICE_KEY` | **boot** | Service-role key, backend only — never bundle. (The Supabase UI calls it the service_role key.) |
| `TINYBIRD_HOST` | analytics | Always `https://api.tinybird.co` — a router, **not** a region slug (the slug form has broken deploys). |
| `TINYBIRD_READ_TOKEN` | analytics | Read token for pipe queries. |
| `TINYBIRD_READ_ENABLED` | analytics | Turns the read layer on. |
| `TINYBIRD_READ_PIPES` | analytics | Allowlist of pipes permitted to serve. Without a read token + this flag, **no analytics read works.** |
| `TINYBIRD_APPEND_TOKEN` | ingestion | Write/dual-write token for the events datasource. |
| `ENCRYPTION_KEY` | prod | 64-char hex; encrypts customer Stripe/Shopify secrets. Must stay stable per env (see below). |
| `STRIPE_SECRET_KEY` | billing | Stripe live/test secret. |
| `STRIPE_WEBHOOK_SECRET` | billing | Stripe webhook signing secret. |
| `STRIPE_PRICE_ID_STARTER` | billing | Per-plan recurring price IDs (also for GROWTH and SCALE; legacy BUSINESS / PRO / AGENCY read as fallbacks). Each price may carry a `pv_limit` metadata key. |
| `ALLOWED_ORIGINS` | prod | Comma-separated dashboard origins for CORS. |
| `TRACKER_SALT` | prod | Salt for cookieless visitor IDs. |
| `ST_MANAGED_PROXY_TARGET` | prod | CNAME target for the managed-proxy edge (boot fails without it in prod). |
| `RESEND_API_KEY` | optional | Email reports (Resend REST). |
| `DEEPSEEK_API_KEY` | optional | AI provider key. *(The AI chat / AI analytics features were cut; the key/`ai-client.js` remain as an audit candidate.)* |
| `SLACK_WEBHOOK_URL` | optional | Job alert webhook. |
| `NIGHTLY_CONCURRENCY` | optional | Nightly worker pool (default 4, range 1–8). |
| `META_TEST_EVENT_CODE` | dev | Meta CAPI test events — omit in production. |
| `GOOGLE_ADS_ACCESS_TOKEN` | optional | OAuth2 token for Google Ads CAPI. |
| `BUNNY_API_KEY` | optional | Managed-proxy edge (BunnyCDN); server-side only. |

The dashboard build reads `VITE_`-prefixed vars via `import.meta.env` (not `process.env`) — see the `VITE_`-prefixed block in `.env.example`. JWT_SECRET is **not** used (Supabase validates tokens via `supabase.auth.getUser()`).

> Generate the encryption key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Do not commit it. If changed, existing encrypted webhook secrets no longer decrypt and customers must re-enter integrations.

---

## Data residency

- **Tinybird** (analytics events) — `gcp/europe-west3` (Frankfurt). `TINYBIRD_HOST` is always the router `https://api.tinybird.co`; the region is fixed at the workspace, not in the host string.
- **Supabase** (source of truth) — EU (Ireland).
- **Railway** (compute) — `europe-west4`; prod services carry `multiRegionConfig: europe-west4-drams3a`.

No "GDPR compliant" badge is claimed — EU data residency is a fact, not a certification.

---

## Background jobs

Configured as Railway cron services (in the Railway UI — not in this repo). **All production crons are `restartPolicyType: NEVER`** — a crashed run is not retried until the next fire (contrast: `api/railway.json` gives the API service ON_FAILURE + retries; crons don't inherit it).

| Job | Schedule (UTC) | Command | Notes |
|---|---|---|---|
| Nightly attribution | `0 2 * * *` | `node api/jobs/nightly-attribution.js` | NEVER → a failure is a ~24h money-rail gap, no retry. Retries **Tinybird** transient failures (429/5xx/network, ≤3) within a run; concurrency lock via `job_runs`. |
| Data quality check | `0 0 * * *` | `node api/jobs/data-quality-check.js` | (An older README said `0 3` — that was wrong.) |
| Health agent | `*/30 * * * *` | `node api/jobs/health-agent.js` | |
| Email reports | `0 8 * * 1` | `node api/jobs/email-reports.js` | ⚠️ **MISCONFIGURED — has never sent an email.** The job is in the service's `buildCommand` (runs at build time) with a null `startCommand`, so the cron boots `bootstrap.js` and crashes. |

- `api/jobs/anomaly-watcher.js` — runs on **staging** (`0 3 * * *`), **unscheduled in production** (never run in prod).
- `api/jobs/usage-threshold-emails.js` — scheduled **nowhere**. (An older README listed `0 14 * * *` — that schedule was fabricated; it does not exist.)

> `scripts/` is largely unexercised: **40** `scripts/qa-*` files exist, but only ~6 are wired into `package.json` and ~11 are referenced in CI — most are not run by any gate.

---

## Privacy

Designed to be deployable without a cookie-consent banner in most jurisdictions, but **not "no cookies":**

- **Cookieless by default** — anonymous IDs in first-party `localStorage`, per-origin, never cross-customer.
- **A first-party cookie is written only on opt-in** — when the customer sets a validated `data-cookie-domain` on the script tag (`tracker/tracker.js`); attributes are `path=/; SameSite=Lax; max-age=31536000`.
- **Reads (never sets) merchant `_fbp`/`_fbc`** — the merchant's own Meta cookies, read only to forward to Meta CAPI.
- No fingerprinting (no canvas, AudioContext, WebGL, plugin enumeration).
- IP used for GeoIP at request time and **not stored**.
- `navigator.doNotTrack === '1'` and `navigator.globalPrivacyControl === true` are honored before any storage or network.
- **Right-to-erasure** — `/api/gdpr/*` erases DB attribution + stitched identity and erases the subject's events from **Tinybird** (`eraseSubjectFromTinybird`; PostHog is a dead store, not touched). ⚠️ **Known gap** (`KNOWN_ISSUES.md`): the erasure path is admin-token-gated, yet the `sites` row is hard-deleted regardless — a real inconsistency to close.
- Per-site `data_retention_days` configurable; nightly job purges older rows.

You still must disclose data collection in your privacy policy — the dashboard's Install page shows a reminder.

---

## Continuous Integration

CI runs on every PR and push to `main` (`.github/workflows/ci.yml`): Node 20, `npm ci` at root + `dashboard`, `node --check` syntax, whitespace scan, `npm run qa:static`, and the dashboard production build, plus a `schema-drift` check. **No DB/API mutation or live-service checks in CI** — staging verification is a separate, mandatory gate.

---

## Documentation

Start with [`DOCS_INDEX.md`](./DOCS_INDEX.md) — it assigns a trust tier to every doc and marks `KNOWN_ISSUES.md` as authoritative.

| File | Purpose |
|---|---|
| [`KNOWN_ISSUES.md`](./KNOWN_ISSUES.md) | **Authoritative** — verified bugs/gaps; outranks other docs. |
| [`SYSTEM.md`](./SYSTEM.md) | Backend contract — read layer, pipe conventions, Stripe webhooks, cookie spec. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Codebase map — routes, jobs, data stores, pages. |
| [`FEATURE_MAP.md`](./FEATURE_MAP.md) | What actually ships (verify against code — it can drift). |
| [`ATTRIBUTION.md`](./ATTRIBUTION.md) | Attribution truthfulness contract. |
| [`SUPABASE_SCHEMA.md`](./SUPABASE_SCHEMA.md) | Schema reference. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Release notes. |
| [`AUDIT_PROD_READINESS_V2.md`](./AUDIT_PROD_READINESS_V2.md) | **Historical** — May 2026 point-in-time audit. |

---

## License

Proprietary. All rights reserved.
