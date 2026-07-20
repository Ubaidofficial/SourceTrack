# Production Readiness Audit v2

**Date:** 2026-05-20
**Outcome:** READY for controlled beta. Public-launch & scale prerequisites tracked below.

This document is the historical record of the v2 audit (the previous one being
`AUDIT_S97.md` covering Session 97 frontend parity). Two rounds of audit-driven
fixes are recorded here.

---

## Scope

11-part audit covering attribution accuracy, server-side tracking, CAPI,
privacy/GDPR, security, database, scaling, background jobs, frontend security,
end-to-end data flow, and final commit/verification.

See the original prompt in the session transcript for the full check list.

---

## Round 1 fixes — commit 8fc8809 (2026-05-20 17:35 UTC)

Targeting critical "block before launch" gaps.

| Finding | File | Severity | Fix |
|---|---|---|---|
| `/api/track` had no crawler filter — inflates PostHog event counts | `api/routes/track.js` | FAIL | Added `BOT_UA_PATTERN` (same regex as `/api/analytics/collect`); silent drop returns 200 |
| Tracker ignored `navigator.doNotTrack` and Global Privacy Control | `tracker/tracker.js`, `tracker/analytics.js` | WARN | Abort at top of IIFE before any storage/network if DNT or GPC is set; re-minified |
| Stripe webhook would re-process duplicate events on retry | `api/routes/billing.js` | WARN | NodeCache on `event.id`, 24h TTL — replies `received: true, duplicate: true` |
| Nightly job could run twice concurrently on Railway | `api/jobs/nightly-attribution.js` | WARN | Read latest `job_runs.status='running'` row before starting; abort if <6h old. Write `status='running'` at start. |
| PostHog API calls had no 429/5xx retry | `api/jobs/nightly-attribution.js` | WARN | `queryPostHog` now retries up to 3 times with exponential backoff (or `Retry-After`) |
| No SIGTERM handler — Railway deploys dropped in-flight requests | `api/index.js` | WARN | Capture SIGTERM/SIGINT, call `server.close()`, hard-exit at 10s |
| Env vars not validated at startup — silent 500s if missing | `api/index.js` | WARN | Fail fast on missing `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `POSTHOG_HOST` / `POSTHOG_API_KEY` |
| Performance indexes missing on `attributed_conversions` / `pageviews` | `supabase/migrations/20260520000001_attribution_performance_indexes.sql` | WARN | 7 indexes (site_id+date, channel, source, status, distinct_id, pageviews ts+session); `CREATE INDEX CONCURRENTLY IF NOT EXISTS` |

**Round 1 verification (in Supabase):** all 7 indexes report `is_valid=true, is_ready=true`. `ANALYZE attributed_conversions; ANALYZE pageviews;` run.

---

## Round 2 fixes — this commit (2026-05-20)

Targeting scale-readiness and developer-quality-of-life gaps GPT flagged after
seeing the Round 1 report.

### Performance

| Finding | File | Fix |
|---|---|---|
| 35 separate `createClient()` calls — one per route, fresh WebSocket per request | `api/lib/supabase.js` (new) + 32 callers | Singleton lazily constructed; mechanical refactor across 28 files via brace-counting AST rewrite; 4 special cases (`getCapiSupabase`, `getSupabaseAdmin`, dynamic `await import()` in `attribution-engine.js`) handled by hand |
| `tracker.min.js` re-downloaded on every customer pageview | `api/index.js` | `Cache-Control: public, max-age=86400, stale-while-revalidate=604800, immutable` |
| Nightly job processes sites sequentially → 17min at 100 sites | `api/jobs/nightly-attribution.js` | Bounded-concurrency worker pool, default 4, env `NIGHTLY_CONCURRENCY` (1–8); 100–300ms jitter between site claims |

### Reliability

| Finding | File | Fix |
|---|---|---|
| CAPI providers had no retry on transient failures | `api/lib/conversion-sync.js` | New `fetchWithRetry()` wrapper: 3 attempts, exponential backoff (500ms→1s→2s), honours `Retry-After`. Applied to Meta, Google, Microsoft, LinkedIn, TikTok. 4xx fails fast. |

### Observability

| Finding | File | Fix |
|---|---|---|
| `UAParser` instantiated but `browser` and `os` discarded | `api/routes/track.js`, `api/routes/conversion.js` | Now writes `browser_name`, `browser_version`, `os_name`, `os_version` on every PostHog event |

### Reporting

| Finding | File | Fix |
|---|---|---|
| Affiliate medium fell through to "Other Campaign" | `api/lib/channel-classifier.js` | New rule: `utm_medium` in `['affiliate','affiliates','partner','cpa','cps']` → `Affiliate` |

### Compliance

| Finding | File | Fix |
|---|---|---|
| Install flow didn't tell customers to update their privacy policy | `dashboard/src/pages/Snippet.jsx` | Amber callout above "Verify Installation" listing collected data, citing GDPR/CCPA/UK PECR, noting that DNT/GPC are honoured automatically |

---

## What still needs to be done outside the codebase

### Railway (UI — cannot be done from the repo)

Add four cron services in the Railway dashboard pointing at this repo:

| Job | Schedule (UTC) | Command |
|---|---|---|
| `nightly-attribution` | `0 2 * * *` (02:00 daily) | `node api/jobs/nightly-attribution.js` |
| `data-quality-check` | `0 3 * * *` (03:00 daily) | `node api/jobs/data-quality-check.js` |
| `health-agent` | `*/30 * * * *` (every 30 min) | `node api/jobs/health-agent.js` |
| `email-reports` | `0 8 * * 1` (Monday 08:00) | `node api/jobs/email-reports.js` |

Optional env override:
- `NIGHTLY_CONCURRENCY=4` (default; raise to 6–8 only after PostHog rate-limit monitoring confirms headroom)

### Supabase (already done by user)

- ✅ Round 1 perf-indexes migration applied; all 7 indexes valid.
- ✅ `ANALYZE attributed_conversions; ANALYZE pageviews;` run.

No new database migration in Round 2.

---

## Audit scoreboard

| Part | Before | After Round 1 | After Round 2 |
|---|---|---|---|
| 1. Attribution Accuracy | 10/10 | 10/10 | 10/10 |
| 2. Server-Side Tracking | 6/7 (bot filter missing) | 7/7 | 7/7 |
| 3. CAPI | 8/9 (no retries) | 8/9 | **9/9** |
| 4. Privacy / GDPR | 8/11 (no DNT, no privacy notice) | 9/11 | **10/11** |
| 5. Security | 13/16 (no Stripe idempotency, no token expiry, no CSP) | 14/16 | 14/16 |
| 6. Database / Warehouse | 4/9 (missing indexes, per-request client, sequential jobs) | 5/9 | **8/9** |
| 7. Scaling / Infrastructure | 4/8 (no SIGTERM, no env-validation, no lock, no cache hdr) | 7/8 | **8/8** |
| 8. Background Jobs | 4/5 | 4/5 (cron still UI-only) | 4/5 |
| 9. Frontend Security | 5/5 | 5/5 | 5/5 |
| 10. End-to-End Flow | 20/20 | 20/20 | 20/20 |
| **Total** | **82/100** | **89/100** | **95/100** |

---

## What's still open after Round 2

| Item | Severity | Plan |
|---|---|---|
| Public-share tokens never expire | MEDIUM | Add `public_share_expires_at` column + check in `public-dashboard.js` |
| Helmet CSP not explicitly configured | MEDIUM | Add `contentSecurityPolicy` block with allowed sources |
| Frontend bundle 1.4 MB / 385 KB gzipped — no code splitting | MEDIUM | `React.lazy` heavy pages (ReportBuilder, Admin, Analytics) |
| 30-min session inactivity refresh in tracker | LOW | Currently per-tab only; not critical |
| Partition `pageviews` by month | LOW | Wait until > 50M rows; current scale doesn't need it |

---

## Launch posture

- **Controlled beta:** READY (commit covers everything blocking first paying customer)
- **Public launch:** READY after Railway cron jobs are configured in the dashboard
- **Scale (>50 customers):** READY — singleton + parallel job + CAPI retry + perf indexes are all in place
