# SYSTEM.md — SourceTrack

Backend system contract. Verified by grep against the code on `main` (2026-07-20). Where this doc and the code disagree, **the code wins** — re-verify before trusting a load-bearing line.

## Product
SourceTrack is a multi-tenant marketing-attribution SaaS. It tracks first-touch, last-touch, first-touch-non-direct, last-touch-non-direct, linear, u-shaped, time-decay, w-shaped, and AI-platform attribution (which AI tools — ChatGPT, Claude, Perplexity, Gemini, Copilot, DeepSeek, Grok, … — send traffic that converts). Attribution models are defined in `api/lib/attribution-engine.js` (9 keys).

## Stack
- **Backend:** Node.js ESM + Express → Railway. `import`/`export` only, never `require()`.
- **Analytics read/write layer:** Tinybird (ClickHouse), served by deployed pipes in `tinybird/pipes/*.pipe`. Reads go through `api/lib/tinybird-read.js` (`queryTinybirdPipe`). *(PostHog was the event store until it was decommissioned 2026-07-19 — project 416017 deleted, the PostHog client library removed. It is gone; there is no fallback to it.)*
- **Source of truth (Postgres):** Supabase — attribution, conversions, revenue, billing/entitlements, site metadata, user accounts, RLS. The `pageviews` table is **empty by design** (analytics reads come from Tinybird).
- **Frontend:** React + Vite → Railway.
- **Billing:** Stripe. **Two separate webhooks — never conflate** (see below).
- **AI chat / AI analytics:** **cut** (not in the app). `api/lib/ai-client.js` still exists → audit candidate.

## Global guardrails
- async/await only. No `.then()` chains, no callbacks. Every async function uses try/catch.
- Never `console.log`. Use `console.error` only for caught errors.
- Never hardcode secrets. Always `process.env.*`. `getSupabase()` from `api/lib/supabase.js` — never `createClient()` directly in routes.
- Do not invent APIs, SDK options, env vars, or table names not in this file or the code.
- If unsure, leave `TODO: confirm` instead of guessing.
- Do not reorder middleware unless explicitly instructed.

## API response format
`{ success: boolean, data: any, error: string | null }`

## HTTP codes
- 200 ok
- 400 bad input
- 401 invalid/missing `site_key`
- 402 trial expired or inactive subscription
- **422 valid request, backing data path unavailable** (a gated/dead-store shape — the server denies rather than return fake zeros; §6 data-truth)
- 429 rate limited
- 500 server error

## Client IP rule
`req.headers['x-forwarded-for']?.split(',')[0]` — never `req.ip` (Railway proxies break geoip accuracy). `enrich()` must never store raw IP.

## UUID rule
`import { v4 as uuidv4 } from 'uuid'`

## The Tinybird read contract (verified against `api/lib/tinybird-read.js`)
- `queryTinybirdPipe(pipeName, params)` is gated by `TINYBIRD_READ_ENABLED` + the `TINYBIRD_READ_PIPES` allowlist (`isPipeReadAllowed` → `null` if disallowed).
- Retries **transient** failures — HTTP 429, HTTP ≥ 500, or a network throw/timeout — up to **3 attempts total** (`MAX_ATTEMPTS = 3`), 15s per-attempt timeout, backoff `Retry-After` or `min(60s, 2000·2^attempt)`.
- Returns **`null` on exhaustion**, **`[]` for a served-empty** result, and **never throws** to the caller.
- **`null` ≠ `[]`:** `[]` = "store answered, no data"; `null` = "store did not answer."
- **`null` fails CLOSED — there is NO fallback path** (`queryPostHog` was deleted in #311):
  - `readTb` (`api/routes/dashboard.js:35`) **throws** on null.
  - engine `_pipeNull` (`api/lib/attribution-engine.js:50`) **throws** on null.
  - the nightly (`api/jobs/nightly-attribution.js`) **aborts** its write on null.
- **Never substitute zeros. Never fall back to another store.**
- **Known violation** (`KNOWN_ISSUES.md §14`): `/admin` + `/leads/count` swallow the throw and return **200 with zeroed KPIs** — that is a **bug**, not the pattern.

## Pipe conventions (verified against shipped `.pipe` files; deploys are founder-gated)
- `site_id` is a **required** template param, never string-interpolated.
- Required dates: `{{DateTime(p, required=True)}}` with **no** `toDateTime()` wrapper.
- Optional dates default: `{{DateTime(p,'1970-01-01 00:00:00')}}`.
- Timezones: `{{String(tz,'UTC')}}` — never `required=True` (breaks `toTimeZone()` under `--check`).
- Array params as repeated query keys.
- `JSONExtractString` returns `''` not `NULL` — wrap `nullIf(...,'')` where NULL semantics matter.
- **`tb --cloud deploy --check` against prod is the mandatory pre-deploy gate.** Typed-column reference: `tinybird/SCOPE_v3.md` §2.6 (a field absent from that table lives in the JSON bag — read via `JSONExtractString`). `SCOPE_v3.md` is **not** archived — it stays in place.

## The two Stripe webhooks — NEVER conflate
1. **`api/routes/billing.js` → `billingWebhookHandler`** — SourceTrack's **own** billing/entitlements. Sets plan state on sites. Dedupe via in-memory NodeCache. **Records no revenue.** Must be registered with `express.raw({ type: 'application/json' })` **before** `express.json()` in `api/index.js`, or signature verification breaks.
2. **`api/routes/stripe-webhook.js` → `POST /:site_key`** — **customers' buyers'** purchases, ingested as `$conversion` for attribution. Idempotency via DB tables `revenue_idempotency_keys` / `claim_revenue_idempotency_keys` — claim the key **after** the write succeeds.

## Cron jobs (`restartPolicy: NEVER`)
All production cron services are `restartPolicyType: NEVER` — a crashed run is **not retried until the next fire**. For `nightly-attribution` that is a ~24h money-rail gap with no automatic recovery (contrast: `api/railway.json` sets `ON_FAILURE` + 10 retries for the API service; crons do not inherit it). Full schedule table + the `sourcetrack-email` misconfiguration are in `ARCHITECTURE.md`.

## CRM stage values (`POST /api/conversion/offline`)
`conversion_type` pipeline stages: `lead_created` · `qualified` · `opportunity` · `closed_won`. Ingested as `$conversion` with `ingestion_method: 'offline'`. API-driven only — no automatic CRM sync.

## Cookie / storage spec (verified against `tracker/tracker.js`)
**Cookieless by default.** Visitor/attribution IDs live in first-party `localStorage`; no fingerprinting, no raw-IP storage; DNT / Global Privacy Control honored (aborts before any storage/network).

A first-party **cookie is written ONLY** when the customer opts in via the `data-cookie-domain` script attribute (a validated leading-dot domain, ≥2 labels, not on the unsafe-suffix list — `tracker.js:99-112`). When written, attributes are `path=/; SameSite=Lax; max-age=31536000` (`tracker.js:67`) — **not** `SameSite=None`, and **not** the legacy `__ti_id_/__ti_ft_/__ti_lt_` names (those do not exist).

The tracker also **reads** the merchant's own `_fbp` / `_fbc` cookies (`tracker.js:408-409`) to forward to Meta CAPI — **read-only, never set by us.** A strictly-cookieless build (`tracker/tracker.cookieless.js`) exists but is **not served**.

## AI-platform detection
`api/lib/channel-classifier.js` is the **single source of truth** — `ORGANIC_SEARCH_ENGINE_HOSTS` / `ORGANIC_SEARCH_SOURCES` plus the AI-domain set (22 domains), shared between the pipe SQL and `channelFromEvent`. Do not hardcode a divergent inline copy. *(Known: `KNOWN_ISSUES.md §13` — 3 pipes carry a stale divergent classifier causing live mis-classification; a dedicated PR must copy the corrected SQL over.)*

## Supabase rule
- Server-side only: `SUPABASE_SERVICE_KEY` (via `getSupabase()`).
- Frontend only: `SUPABASE_ANON_KEY`.
- Boot requires **only** `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` (`api/index.js:85` `REQUIRED_ENV`); missing → `process.exit(1)`.

## geoip-lite deploy note
GeoIP uses the bundled database shipped with `geoip-lite`; no auto-update at build/runtime (the `postinstall` `startWatchingDataUpdate()` was removed — it caused Railway `npm ci` timeouts). Freshness depends on the published package.
