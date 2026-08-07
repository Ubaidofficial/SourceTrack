# Known Issues

This file should stay short. Only include verified issues or high-confidence risks.

Do not use this file as a backlog for every idea. Use it to prevent repeated mistakes.

## Current verified/high-confidence issues (Verified @ 93da62d)

### 1. `pv_limit` Shadowing
`sites.pv_limit` has a Postgres column DEFAULT of 5000 (`supabase/migrations/00000000000000_baseline_schema.sql:900`) and the Stripe webhook writes an override from price metadata (`api/routes/billing.js:78`). `getPvLimit` prefers any truthy/finite override, so `PLAN_DEFAULT_PV_LIMIT` changes have NO runtime effect until price metadata and DB defaults are reconciled.
Relevant code:
`supabase/migrations/00000000000000_baseline_schema.sql:900`
  `"pv_limit" integer DEFAULT 5000,`
`api/routes/billing.js:78`
  `const fromMeta = price?.metadata?.pv_limit`
`api/lib/plan-features.js:150` (function opens at `:149`)
  `if (perSiteOverride && (Number.isFinite(perSiteOverride) || perSiteOverride === Infinity)) return perSiteOverride`
`api/lib/plan-features.js:151`
  `return PLAN_DEFAULT_PV_LIMIT[normalizePlan(plan)] ?? 0`

> ⚠️ **CITATIONS CORRECTED 2026-08-06 — both were wrong, in different ways.**
> The migration was cited as `20260721000001_baseline_schema.sql`, **a filename that does not
> exist on `main`**; the real file is `00000000000000_baseline_schema.sql` and the line number
> `:900` was always correct. `plan-features.js:92/93` had simply drifted — `getPvLimit` now
> opens at `:149`, and the two cited lines are `:150`/`:151`.
>
> **Worth recording how the migration citation nearly survived re-verification:** a grep for
> `pv_limit integer DEFAULT` returns **nothing**, because the column is quoted in the DDL
> (`"pv_limit" integer DEFAULT 5000,`). A zero-hit grep has two explanations and "absent" is
> only one of them — see the method note in `docs/ai_agent_workflow_rules.md`.

> ⚠️ **AMENDED 2026-08-06 — the Stripe WRITE path is CLOSED; only the customer-visible half remains.**
> Growth price metadata has been deleted and all three prices verified, so nothing writes a
> `pv_limit` override from price metadata any more. The remaining live half is
> **`dashboard/src/pages/Billing.jsx:9-18`**, which hardcodes its own `PLAN_DEFAULT_LIMITS`
> table (`growth: 150000`) for display — a second source of truth that can disagree with
> `PLAN_DEFAULT_PV_LIMIT` and with the published pricing page.
>
> **Blast radius: zero paying customers.** The site carrying the largest published/enforced gap
> is `www.techrupt.pk`, which is the **founder's test domain**, not a customer. This is a
> condition to resolve, not a live customer-facing defect.

### 2. `NULL` `pv_limit` Ambiguity
`getPvLimit` falls back to the plan default when `pv_limit` is `NULL`, whereas `usage-threshold-emails.js` treats `NULL` as unlimited and excludes those sites from metering alerts entirely.
Relevant code:
`api/lib/plan-features.js:151` (was cited as `:93` — same drift corrected in issue 1 above)
  `return PLAN_DEFAULT_PV_LIMIT[normalizePlan(plan)] ?? 0`
`api/jobs/usage-threshold-emails.js:95`
  `// (limit=0) and any site with NULL pv_limit (treated as unlimited).`
`api/jobs/usage-threshold-emails.js:99`
  `.gt('pv_limit', 0)`

### 3. Hardcoded Retention Limit Guard in GDPR Route
`gdpr.js:585` hardcodes 1825 as the keep-forever gate, duplicating `PLAN_STRUCTURAL_LIMITS.scale.retention_days`. Any change to that plan value silently breaks keep-forever retention logic.
Relevant code:
`api/routes/gdpr.js:585`
  `if (days === 0 && limits.retention_days < 1825) {`
`api/lib/plan-features.js:68`
  `scale:    { sites: Infinity, webhooks: 99, team_members: 99, retention_days: 1825, conversion_events: 2500 },`

### 4. Conversion Routes Mounted Without `checkTierLimit`
`/api/conversion` and `/api/conversion/offline` mount without `checkTierLimit` and have no in-file site-status guard. Blocking archived sites depends solely on the `limit === 0` path in `conversion-limits.js`.
Relevant code:
`api/index.js:450`
  `app.post('/api/conversion',`
`api/index.js:460`
  `app.post('/api/conversion/offline',`
`api/lib/conversion-limits.js:83`
  `if (limit === 0) {`

### 5. `charge.refunded` Event Acknowledgement Without Persistence
`stripe-webhook.js:226` handles `charge.refunded` without expandable `refunds[]` data, returning HTTP 200 after writing nothing.
Relevant code:
`api/routes/stripe-webhook.js:226`
  `const refunds = charge.refunds?.data || []`

### 6. Tinybird `ENGINE_TTL` 400-Day Event Retention Limit
Tinybird datasources (`events`, `events_by_visitor`, `privacy_signals`) specify ClickHouse `ENGINE_TTL "toDateTime(timestamp) + toIntervalDay(400)"`, capping event retention at ~13 months regardless of plan, while Postgres conversion data has no TTL.
Relevant code:
`tinybird/datasources/events.datasource:76`
  `ENGINE_TTL "toDateTime(timestamp) + toIntervalDay(400)"`
`tinybird/datasources/events_by_visitor.datasource:67`
  `ENGINE_TTL "toDateTime(timestamp) + toIntervalDay(400)"`
`tinybird/datasources/privacy_signals.datasource:16`
  `ENGINE_TTL "toDateTime(timestamp) + toIntervalDay(400)"`

### 7. Unapplied Plan Retention Days to Sites Column
`PLAN_STRUCTURAL_LIMITS.retention_days` is NEVER written to `sites.data_retention_days` during site creation or subscription updates; only user interaction via `PUT /api/gdpr/retention` updates it.
Relevant code:
`api/routes/gdpr.js:614`
  `.update({ data_retention_days: days === 0 ? null : days })`
`api/routes/billing.js:190`
  `const { error } = await sb.from('sites').update({`

### 8. Webhook Destination Limit Hardcoded to 1
`webhooks.js:87-94` hardcodes a maximum of 1 webhook destination per site as an MVP restriction, ignoring numeric quotas in `PLAN_STRUCTURAL_LIMITS.webhooks`.
Relevant code:
`api/routes/webhooks.js:87`
  `// 2. Check if a webhook destination already exists for this site (MVP restriction)`
`api/routes/webhooks.js:94`
  `if (existing) {`

### 9. 🔴 HIGHEST PRIORITY: GDPR Art. 15 Subject Access Endpoint Crash
GDPR Art. 15 subject-access (`/api/gdpr/subject`) selects non-existent column `updated_at` from `lead_qualifications`, and `created_at` (real column is `captured_at`) from `subscription_identity`, causing every request for a subject with data to throw a 500 error.
Relevant code:
`api/routes/gdpr.js:379`
  `.select('visitor_id, status, qualified, created_at, updated_at')`
`api/routes/gdpr.js:386`
  `.select('anonymous_id, stripe_customer_id, first_subscription_id, first_touch_source, first_touch_channel, created_at')`

### 10. GDPR Automated Retention Purge Gaps
`site_identity_links`, `lead_qualifications`, `volunteered_identity`, and `subscription_identity` hold visitor PII with NO automated retention purge path (`retention-purge.js` covers only 5 tables).
Relevant code:
`api/lib/retention-purge.js:13`
  `const counts = { attributed_conversions: 0, gsc_performance_daily: 0, gsc_sync_runs: 0, capi_deliveries: 0, custom_events: 0 }`

### 11. Free-Tier Multi-Account Creation Unbounded
No backend rate-limiting or email domain restriction prevents creating multiple free accounts directly against Supabase Auth.
Relevant code:
`api/index.js:493`
  `app.use('/api/onboarding', requireUserAuth, onboardingRouter)`

### 12. Billing Webhook Process-Local NodeCache Idempotency
`billing.js:19` uses an in-memory `NodeCache` instance for webhook idempotency, which does not survive process restarts or multi-instance deployments.
Relevant code:
`api/routes/billing.js:19`
  `const _seenStripeEvents = new NodeCache({ stdTTL: 86400, checkperiod: 3600 })`

### 13. Unvalidated Test Fixture Shapes
Test helpers stub database responses without schema validation against PostgreSQL migrations, allowing phantom column references to pass unit tests.
Relevant code:
`api/tests/pipe-refund-guard.test.js:15`
  `const stubDb = {`

### 14. Repo-Wide Store-Aware Phantom-Column Guard Missing
No automated CI guard validates column availability across PostgreSQL, ClickHouse, and API response mappers.
Relevant code:
`api/tests/analytics-conversion-columns.test.js:1`
  `// Guard test against phantom columns`

### 15. Recurring 422 Burst on `/api/attribution`
Dashboard pinned reports trigger 422 validation failures on `/api/attribution` when report configurations include gated metrics or non-preaggregated dimensions.
Relevant code:
`dashboard/src/pages/Dashboard.jsx:85`
  `useFetchReport`
`api/lib/report-config-validation.js:331`
  `if (GATED_METRICS.has(metric))`

### 16. Conversion Rate >100% Numerator/Denominator Population Mismatch
Conversion rate calculation mixes total conversion rows with unique session counts. Fixed in dashboard aggregator by counting distinct converters.
Relevant code:
`api/routes/dashboard.js:188`
  `const converters = new Set()`

### 17. Attribution Page Static Model Selector Label
`AttributionPage.jsx` renders a static UI label for the attribution model selector rather than an interactive dropdown because multi-touch models return unmaterialized pre-agg data.
Relevant code:
`dashboard/src/pages/AttributionPage.jsx:50`
  `<span className="font-medium">Linear Attribution</span>`

### 18. AI-Source Detection Referrer-Dependent Structure
AI source classification relies exclusively on HTTP `Referer` headers and `utm_source` parameters; direct visits without referrer default to `Direct`.
Relevant code:
`tracker/tracker.js:355`
  `aiSrc(ref, p.utm_source)`
`api/lib/channel-classifier.js:85`
  `export function detectAiPlatformFromEvent(event) {`

### 19. Separation of Billing and Customer Stripe Webhook Paths
`/api/billing/webhook` uses global `STRIPE_WEBHOOK_SECRET` for platform subscriptions; `/api/webhooks/stripe/:site_key` decrypts customer-specific secrets for buyer purchases.
Relevant code:
`api/routes/billing.js:150`
  `event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)`
`api/routes/stripe-webhook.js:381`
  `event = stripe.webhooks.constructEvent(req.body, sig, decryptedSecret)`

### 20. Legacy `STRIPE_PRICE_ID` Fallback to Growth Plan
Environment variable `STRIPE_PRICE_ID` maps directly to `growth`, posing entitlement escalation risks if set to starter pricing.
Relevant code:
`api/routes/billing.js:38`
  `if (process.env.STRIPE_PRICE_ID) map[process.env.STRIPE_PRICE_ID] = 'growth'`
`api/routes/billing.js:55`
  `growth: process.env.STRIPE_PRICE_ID_GROWTH || process.env.STRIPE_PRICE_ID_PRO`

### 21. Stripe Test Mode Price Artifacts
Stripe Test environment retains active pricing objects from prior test generations. Live mode is cleanly restricted to $49/mo, $79/mo, and $99/yr.
Relevant code:
`api/routes/billing.js:27`
  `export function getPriceMap() {`

### 22. `conversion_events` Metered Without Write Refusal
Per PR #430, `conversion_events` limits trigger over-quota alerts and anomaly logs but NEVER discard incoming customer conversions.
Relevant code:
`api/lib/conversion-limits.js:4`
  `// METERING ONLY — a conversion is NEVER refused on quota, on any tier.`

### 23. Tinybird Pricing Model Shift to vCPU Hours
Tinybird billing model charges for vCPU hours and QPS concurrency rather than total processed bytes, prioritizing query concurrency optimization.
Relevant code:
`tinybird/datasources/events.datasource:76`
  `ENGINE_TTL "toDateTime(timestamp) + toIntervalDay(400)"`

### 24. Missing `dashboard/node_modules` in Fresh Worktrees
`qa:static` script fails in fresh worktrees missing `dashboard/node_modules` due to missing `vite` binary.
Relevant code:
`package.json:15`
  `"qa:static": "node --check api/index.js api/routes/*.js api/lib/*.js && cd dashboard && npm run build"`

### 25. Worktree Naming Convention Discrepancy in `CLAUDE.md` §13
`CLAUDE.md` specifies 4 mandatory worktree names, whereas agent workflows use task-based worktree names (`trackiq-docs`, `trackiq-pvcap`, etc.).
Relevant code:
`AGENTS.md:160`
  `Worktree Isolation Mandatory`

### 26. Origin-Relative Session Doc Verification Rule
Session-doc diff checks require `origin/main...HEAD` scoping to prevent unpushed local main commits from polluting PR checks.
Relevant code:
`docs/ai_agent_workflow_rules.md:20`
  `git diff --check`

### 27. Deferred `dashboard.js` Code Hygiene Items
`dashboard.js` retains legacy variable naming (`posthogSiteId`), unused function parameters in `readTb()`, and obsolete PostHog comments.
Relevant code:
`api/routes/dashboard.js:486`
  `// TODO: cleanup`
- Confidence scoring adds +20 points when a click ID is present on the first/last touch

**What is still missing (truly):**
- `ad_id`, `campaign_id`, `adset_id`, `creative_id` — granular ad-level breakdown (requires ad platform API or manual UTM tagging)
- These are not captured because they require platform-specific integrations, not just URL params

### 4. No ad spend ingestion yet

Do not claim:

- ad spend import
- ROAS
- ad account reporting
- ad set reporting
- ad ID reporting
- creative reporting

unless new code proves it.

### 5. AI referrer detection can undercount

AI source detection depends on referrer. Some AI tools strip referrers.

Safe claim:

    SourceTrack detects AI referrals when the platform sends a detectable referrer.

Unsafe claim:

    SourceTrack has universal AI traffic detection.

AI-search attribution depends on a referrer being present (client `document.referrer` or server `Referer` header). If a source strips the referrer, the visit lands as "direct" and no COALESCE/detection can recover it. This is a real limit of the approach, not a bug.

Note: The server-fallback path (bare referrer -> middleware -> `properties.ai_source`) is verified by code-trace, not yet by a live referrer-only event. A referrer-only live test would close this verification gap.

### 6. HogQL gotchas

Avoid:

- `toFloat64OrZero`
- `COUNT(CASE WHEN...)`
- ambiguous `distinct_id` in joins

Prefer:

- `toFloatOrZero`
- `countIf()`
- qualified aliases

### 7. Backup files can confuse audits

Old `.bak` files may exist from prior sessions.

Before production readiness or broad audits, check:

    find api dashboard/src tracker -name "*.bak*" -print

### 8. Keyless conversions bypass deduplication

Deduplication requires an `order_id` / `external_event_id` to be present. Keyless conversions (no `order_id` supplied) are counted as-fired by design to avoid silently merging genuine distinct conversions from the same user.

### 9. Weighted integration on days_to_convert and touchpoints_per_conversion

Verified by code inspection: both the `days_to_convert` ([api/lib/attribution-engine.js:L1837-1841](file:///Users/ubaid/Desktop/trackiq/api/lib/attribution-engine.js#L1837-1841)) and `touchpoints_per_conversion` ([api/lib/attribution-engine.js:L1890-1894](file:///Users/ubaid/Desktop/trackiq/api/lib/attribution-engine.js#L1890-1894)) return paths explicitly supply a `conversions` weight field to `mergeGoogleResults`, ensuring they are weighted correctly rather than defaulting to naive equal-weighting.

### 10. AI Search timestamp resolution seam

### 11. Cross-metric timezone inconsistency in getFlexibleReport

Within `getFlexibleReport`, queries for the metrics `revenue`, `conversions`, and `leads` use the timezone-aware `getDateFilterExpr` helper. However, helper metrics like `days_to_convert`, `touchpoints_per_conversion`, and the `LTV` path query dates using raw UTC bounds. This creates a temporary inconsistency at timezone boundaries between different metrics on the same screen.
- **Follow-up Task**: `Task-0: Lock timezone ground truth for secondary metrics (LTV, days_to_convert, touchpoints), then make them timezone-aware under getDateFilterExpr.`

### 12. Untested multi-touch/flexible models ignore timezone boundaries

To avoid untested blast-radius risks, the calculations inside `getMultiTouchAttributionLive`, `getSessionReport`, and `getAiPlatformAttributionLive` have been reverted to query using UTC. Consequently, users selecting linear/u_shaped/time_decay or viewing sessions will still see timezone discrepancies (e.g. conversions showing on different days compared to the dashboard).
- **Follow-up Task**: `Task-0: Lock timezone ground truth for linear/u-shaped/time-decay and session calculations, then roll out timezone-aware query bounds (getDateFilterExpr) with targeted integration tests.`

### 13. Stale click-ID-blind channel CASE classifier in 3 pipes (RESOLVED — diagnosis corrected)

Three pipes (`session_report_pageviews`, `session_report_conversions`, and `seo_revenue_landing_pages`) contain a click-ID-blind channel classifier that disagrees with `channelFromEvent` in the JS engine and other pipes. This causes live mis-classification in session reports and SEO revenue. A dedicated PR is required to copy CC's corrected SQL over to these pipes.

> ⚠️ **"This causes live mis-classification in session reports" was WRONG, and the sentence sent one planning pass at the wrong target.** #415 traced the two session pipes and found their classifier was **unreachable dead SQL**: `filter_channel` is never passed to them. `getSessionReport` sends only `site_id`/`date_from_ts`/`date_to_ts` (+ optional `custom_key1/2`), and its FILTER GATE (`_sessionPipeEligible = filterClauses === ''`) **skips those pipes entirely** whenever any content filter is set. So the stale block could not affect a single live number; syncing it was hygiene against a future filter-aware caller.
>
> **The real live defect was `seo_revenue_landing_pages` alone** — and not for the reason stated either. Its host/source lists already matched `ORGANIC_SEARCH_ENGINE_HOSTS` / `ORGANIC_SEARCH_SOURCES` exactly, so "disagrees with the canonical list" was also wrong for that pipe. The actual bug was that its filter was **click-ID-blind AND, on the referrer branch, medium-blind**: `referrer ILIKE '%google.%'` fired regardless of `gclid` or `utm_medium`, so both an auto-tagged Google Ads click (gclid + google.com referrer, no UTMs) and a manually-tagged one (`utm_medium=cpc`) **counted as SEO revenue**. Paid revenue in an SEO report is a §6 violation, and that pipe is the sole live read path (`seo-revenue.js:173`; `readTb` throws on a null pipe read, the HogQL fallback is deleted).
>
> **Also corrected:** this entry was never actually marked resolved after #415 merged — the heading above carried no RESOLVED marker until now.

**✅ RESOLVED** by `418598b` (PR #415). All eight pipes carrying a channel classifier now share ONE byte-identical `multiIf` (hash-verified), copied verbatim from the five that were already canonical (`browsers`, `os`, `sources_ai`, `sources_ref`, `summary`) rather than re-derived. Bound by `api/tests/analytics-channel-parity.test.js`, which previously compared only the whole `{% if defined(filter_channel) %}` block — a shape the other three pipes do not share, which is exactly why they sat outside every assertion and drifted. It now binds the `multiIf` **expression** across all eight.

> **Deploy caveat (unverified from the repo):** the corrected `.pipe` files are merged, but prod pipe deployment is founder-gated and could not be confirmed here. Until deployed, the repo and the live workspace disagree. Same caveat applies to #416's `flexible_report_campaign_leads_by_site` (14 → 15 lead types).
>
> **Ambiguity flagged, not resolved:** `kagi.com` is both an `ORGANIC_SEARCH_ENGINE_HOST` and an `AI_DOMAINS_MAP` entry. The canonical order puts AI Search first, so a Kagi visit whose `ai_source` was stamped at ingest now leaves SEO revenue, while one without it stays Organic Search. Inherited from the canonical classifier, not introduced by #415. Product call.

### 14. admin and leads_count swallow Tinybird throws (RESOLVED — two separate fixes)

The `/admin` endpoints (containing 6 inner catches) and the `/leads/count` endpoint swallow the Tinybird read error throws. Instead of propagating the error to trigger a proper 500 error, they catch the error internally and return an HTTP 200 response with zeroed KPIs. This means `TINYBIRD_FORCE_READ=true` cannot reach the handler-level catches. The inner try-catch blocks in these handlers need to be stripped.

> ⚠️ **The "6 inner catches" framing above was imprecise.** The count of 6 is right (one per `readTb` call site), but only **3** faked a success value. The other 3 already set an explicit `{ status: 'error' }` and were never lying — stripping all 6 indiscriminately, as the paragraph instructs, would have escalated three honest error states into 500s.

**✅ RESOLVED.** Both halves closed independently, by different fixes at different times:

- **`/admin`** — FIXED, commit `a527e8b` (PR #413). The 3 fake-success inner catches were removed so a dead pipe now surfaces a real 5xx instead of HTTP 200 with plausible data: `admin_preview_kpis` (all-zero `kpis`), `admin_preview_sources` (`sources = []`), and `events_health_day` (`recentEventCount = 0`). The 3 already-honest catches — `admin_preview_install`, `admin_preview_overview`, `admin_site_detail`, all reporting `{ status: 'error' }` — were intentionally left alone and are now pinned by tests so a later sweep cannot "fix" them into 500s. Per-catch inventory and the anti-regression guard live in `api/tests/admin-tinybird-error-surface.test.js`. Founder-confirmed deployed to staging + production 2026-07-25 (deploy state is not verifiable from the repo).
  - **Why propagate rather than null the field:** the support-preview UI reads this payload through the same hook as the normal dashboard, and `useDashboardData.js` does `overview?.kpis || {}` then `kpis.revenue || 0` — so a null or absent `kpis` **still renders 0**. Nulling would have moved the lie from the API to the frontend. Only a failed request keeps the fake zero off the screen.

- **`/leads/count`** — ALREADY RESOLVED well before this session: commit `ed714dc` (PR #289), not #413. The `leads_count` pipe is retired — verified at `a527e8b` that `leads_count` appears **nowhere** in `api/routes/leads-server.js` (only 2 `readTb` sites remain, `leads_list` and `lead_detail`), and totals are computed from Supabase `attributed_conversions` directly. Pinned by `api/tests/leads-server-read-cutover.test.js:85`.
  - **Precisely what its failure path does** (it is *not* the same shape as the `/admin` fix): on an aggregate-read failure it logs loudly (`[leads] attributed_conversions totals read FAILED / THREW (keeping page fallback)`) and degrades to page-scoped totals — still **HTTP 200 with approximate (undercounting) numbers**, not a 5xx and not a flagged/degraded field. That is deliberately not a fake zero, but the response carries no marker telling the caller the totals are page-scoped. If that residual matters, it is a separate decision, not part of this entry.

> **Claim-decay note (same lesson as #18):** both halves above are dated and name the ref they were verified at, because "X is retired / nothing uses this" is exactly the class of claim that silently stops being true when a later feature re-adds it. Re-verify against a fetched ref before relying on either bullet.

### 15. Scoped summary revenue regression (#278)

An invalid `attributed_conversions` SELECT query (attempting to select columns `country`, `device`, `browser`, and `landing_page` that do not exist — only `first_touch_*` equivalents exist) was rejected by PostgREST, swallowed by an internal try/catch, and rendered in the UI as "no conversions." This represents the same silent-degradation pattern as the §6 fake zeros. The conversions read logic must be modified to distinguish database query failures from true zero-row results (being resolved in PR #280).

### 16. Unit test mocks (installSupabase) swallow select query schema errors

The unit test mocks for Supabase (`installSupabase`) return predefined fixtures regardless of the `.select()` query string. Because of this, unit tests can never detect an invalid-column or invalid-select query error (such as the one shipped in #278). A static schema anti-drift verification check is required as a compensating control.

### 17. C2 Schema Convergence open decisions

The migrations for C2 schema convergence are authored but NOT applied to any database (staging first, then prod). Several critical decisions remain open:
- `sites.owner_id` default constraint is left commented out (likely a design bug rather than intended default).
- Money-rail rows (converting `revenue_ingestion_events` 3 columns and `lead_qualifications.qualified_by` from text to UUID) are excluded pending a founder per-row review.
- The migration `20260620134500_add_site_support_notes.sql` is flagged as dangling (applied to neither staging nor prod) awaiting a founder apply-or-delete decision.

### 18. Token rotation queue

**Added 2026-07-20 — `DEEPSEEK_API_KEY` (prod, urgent):** exposed in plaintext during a `railway variables` read. Nothing live consumes it — only `api/lib/ai-client.js` (behind the cut ai-chat/ai-analytics features) and `scripts/check-secret-safety.js` — but it is billable. **Revoke in the DeepSeek console, then delete the variable from every service rather than replacing it.** It is currently set on `sourcetrack-health` where nothing reads it.

> ⚠️ **CORRECTED 2026-07-21 — see KI-47 before acting on the paragraph above.** "Nothing live consumes it" is **false** at `b3cb043`: the mounted, plan-gated `GET /api/attribution/verdicts` reaches `ai-client.js` via `attribution.js:448`, and `ai-client.js:25` defaults the provider to DeepSeek. Revoking the key as instructed would **not** surface an error — the handler catches, returns `200 {success:true, data:[], error:null}`, and the feature becomes a permanent empty list indistinguishable from "no campaigns". **Read KI-47 (a)/(d)/(e) first; the revoke is still probably right, but it needs the endpoint decided first.**

> ✅ **SAFE TO EXECUTE as of `ab9fc7b` (2026-07-21).** KI-47's deterministic rebuild removed the only caller. **Verified repo-wide at this ref: `api/lib/ai-client.js` has ZERO importers in `api/`, `tinybird/`, `dashboard/src`, `scripts/`** (every remaining mention is documentation, an AI-*referrer*-detection domain list, or the secret-scanner's own key-name regex). Revoking the key and deleting the variable now changes no behaviour: no code path reads it, and the verdicts error path returns **500** rather than a silent `[]`. Proceed with the original instruction.
>
> ⚠️ **WHY IT WAS UNSAFE WHILE SAYING OTHERWISE — the transferable lesson.** The entry asserted "nothing live consumes it", and that was **true when written**: PR #184 deleted the AI chat feature, and the docs correctly recorded the removal. **`verdicts` was built LATER and silently reintroduced the same dependency.** Nothing re-checked the claim, because a removal is written once and then trusted forever.
>
> **A "removed" / "nothing uses this" claim decays the moment a later feature re-adds what was removed** — and nothing in the process notices, because the claim reads as settled history rather than as a fact with an expiry date. It had also propagated: **four separate documents carried the false claim simultaneously** — `README.md:90`, `NEXT_SESSION_PROMPT.md:247`, `POSTHOG_DECOMMISSION_SCAN.md:76`, and this entry — so a reader who cross-checked would have found three confirmations of something untrue. All four were corrected in the same PR as this note.
>
> **Practical rule:** a negative claim about code ("nothing calls X", "X was deleted", "no data goes to Y") is only valid **as of a named ref**. State the ref, and re-verify with a grep before acting on it — never inherit it. Both KI-47's egress finding and this entry's false-safety were the same failure: trusting a documented negative instead of re-running the check.


Multiple tokens are queued for rotation:
- `deploy_token` (currently referenced in a shell env var).
- Pre-existing Tinybird tokens exposed in previous logs and session transcripts.
- **Outstanding as of 2026-07-19:** `RESEND_API_KEY`, staging `SUPABASE_SERVICE_KEY`, `DEEPSEEK_API_KEY`, `ST_LOG_HASH_SECRET`, `TINYBIRD_READ_TOKEN`.

### 19. Nightly attribution: pipe-vs-HogQL parity was never empirically established (now unobtainable)

The nightly (`api/jobs/nightly-attribution.js`) writes the money rail (`attributed_conversions`). D2 moved its conversion + touchpoint reads from PostHog/HogQL onto Tinybird pipes. The B1 `--validate` byte-diff harness (`scripts` flags on the nightly, `api/tests/nightly-validate-harness.test.js`) **never compared a pipe-computed row against a HogQL-computed row for the same conversion** — and it structurally cannot:

- `$conversion` events were written **Tinybird-only** (`writeConversionDirect`, no `ph.capture` — `api/routes/stripe-webhook.js`), so they were **never dual-written**. No real conversion ever existed in both stores.
- Of 182 staging `attributed_conversions` rows, 179 were processed in the HogQL era; their source events live only in PostHog, so the pipe returns nothing for them → they land in `missing`. The 3 comparable rows were all processed post-cutover **by the pipe itself**, so their `--validate` diff is a **determinism** check (recompute-vs-stored off the same pipe), **not** parity.
- PostHog is decommissioned (D3); the corpus cannot be reconstructed. Phase 9 spec'd a Tinybird-vs-PostHog overlap reconciliation but it was never cleanly run for the money path (a non-recoverable `+339ms` PostHog ingestion timestamp shift, a prod-PostHog `403`, and a windowed-path OOM — see `tinybird/archive/GATE3_RECONCILIATION_CONTRACT.md`, `tinybird/archive/PHASE9_VALIDATION_HARNESS_SPEC.md`).

**This is a pre-existing gap D2 surfaced, not one it created.** Verified: no test or script has ever reconciled `attributed_conversions` against Stripe or any independent anchor (the first nightly validation harness in git history *is* D2 B1, #292). The pre-D2 HogQL path was itself an **unvalidated read writing the money rail**. D2 swapped one unvalidated read for another **while net-adding** assurance — B1's determinism harness and B0's fail-closed guard (#290).

What we rely on instead (and the standing gate for removing the HogQL fallback in B3):
- **Determinism** — `--validate` recompute-vs-stored across N rows (money fields exact; timestamps compared as instants).
- **Correctness-by-construction** — an adversarial fixture (deliberate same-timestamp tie + all 4 credit models + AI-influenced touch + $0 carrier) asserted against **hand-computed** expected values, never a recompute. The tie is the one divergence known to occur in production-shaped data (`realTies=1`) and the one thing `--validate` cannot test.
- **Stripe reconciliation** of real revenue — Tinybird `$conversion`s vs Stripe, the true source of truth for webhook-sourced conversions (HogQL never was). **Covers webhook-sourced revenue only** — tracker and manual conversions have no independent anchor and never did.

Status: pipe-vs-HogQL parity for the nightly write path is **UNVERIFIED and will remain so** — recorded here rather than implied by a green harness.

### 20. ~~Nightly 02:00 UTC verification pending~~ — VERIFIED 2026-07-20


**Verified 2026-07-20:** first post-B3 run fired 02:00:49 UTC, status=success, 1712ms, no error. Read path proven. **Write path still unproven** — conversions_processed: 0 on 18/19/20 July, so no attribution row has been written since B3 landed.

The nightly attribution job (`api/jobs/nightly-attribution.js`) now runs **Tinybird-sole with fail-closed reads** (B3, #308–#311, migration complete 2026-07-19). Its first live 02:00 UTC run is now verified (above). `restartPolicy: NEVER` means a failed run is a **~24h attribution gap with no retry** — a failure silently drops a day of the money rail (`attributed_conversions`) until the next night. **Detection already exists** — `health-agent.js:109` `evaluateNightlyJob` returns critical on a missing run, a non-success status, or a run older than 26h, and `nightly_job` is in `CRITICAL_CHECKS`; health-agent runs every 30 min in prod. **Remaining action is delivery, not detection:** health-agent's only output is a Slack POST gated on `SLACK_WEBHOOK_URL`, and it writes no `job_runs` row — and until 2026-07-20 that var held a truthy placeholder, so the POST hit a dead Slack path whose 404 the unchecked `fetch` swallowed (the check ran silently and unobservably). Now fixed (real webhook, HTTP 200); still give health-agent a `job_runs` row so its own execution is visible.

### 21. sourcetrack-email cron misconfigured — weekly emails have NEVER sent

The `sourcetrack-email` service is misconfigured: `buildCommand` runs the job at **build time**, and `startCommand` is null, so the deployed cron boots `bootstrap.js` and crashes. Result: **weekly emails have never been sent.** Six UI fix attempts have not persisted the config; the cause is unexplained. Needs a root-cause pass (Railway service config vs. repo; why the UI change does not stick).

**Confirmed 2026-07-20 from two independent angles that `email-reports-weekly` runs per DEPLOY, not weekly:** (1) `job_runs` on 2026-07-20 alone: 08:54, 08:58, 08:59, 09:17, 10:20, 10:21, 10:46, 10:53, 11:07, 16:34, 16:58, 17:04, 17:31, 19:35 — **~14 runs of a "weekly" job**, every one `Sent 0, skipped 4, errors 0`. (2) Railway shows the cron services **redeploy on every merge to `main`** (`5fe4412`, `65b9340`, `a749709`, `81d3ef8`, `f5fa4e0`, `b6d9543`, `dc4b89d`); a job in `buildCommand` runs once per deploy — **deploy count matches run count**.

### 22. ~~Share / public reports — REMOVE~~ — DONE (#323)

`api/routes/public-dashboard.js` + `dashboard/src/pages/ShareDashboard.jsx` + the `/share` links in `Settings.jsx` are a partially-built public-reports feature. The design doc **§23 lists Public reports as V2**, so the correct action is to **REMOVE** these, not finish them. Settings currently renders links to a **404 route** (customer-facing defect). Scope: delete the two files + the Settings `/share` links.

### 23. Report Builder — 11 metrics + 2 dimensions gated 422 (wiring, not building)

Report Builder gates **11 metrics + 2 dimensions** behind a 422 whose copy references a "completed migration." The underlying **data EXISTS** — sessions / conversion_rate / AI metrics all render on other pages — so this is **wiring the gated shapes to their existing pipes, not building new data.** Action: untrim the pickers / connect the reads to the live pipes.

### 24. Orphaned `qa-*.mjs` scripts — audit needed

`scripts/qa-setup-doctor.mjs` is **not wired into CI** and has been failing unnoticed (a stale `Dashboard.jsx`/`SetupDoctorCard` assertion — Dashboard dropped the card at some earlier point). Unknown how many other `scripts/qa-*.mjs` are similarly orphaned (authored, never invoked by any CI workflow or `package.json` script). Action: for each `scripts/qa-*.mjs`, confirm it is invoked by CI or an npm script, or retire it.


### 25. Operator console reports a deleted feature as "dormant"

**Severity:** low · **Verified:** 2026-07-20 @ post-#330 main

`api/routes/admin.js:686` runs `routeExists('ai-analytics.js')` and `:701` renders the result as
`AI Analytics — status: dormant`. The route file was **deleted in #315**, so the probe now always
returns false. Related hardcoded entries at `:644` and `:722`.

The output is technically accurate but misleading — *dormant* implies the feature could be switched
on. There is nothing to switch on.

**Fix:** delete the probe, the console row, and the two hardcoded entries. Roughly four lines.

**Why not fixed in #328:** out of scope for a docs PR. Recorded in `FEATURE_MAP §21` with receipts,
flagged rather than silently adapted.

---

### 26. Tier-3 cleanup backlog — documentation

**Severity:** cosmetic · **Verified:** 2026-07-20

Tier 1 and Tier 2 cleanup are complete (#323–#330). What follows is tidying. **Do not schedule a
session for it.** Standing rule instead: *when a PR touches one of these files, fix it in that PR.*

**Root documents untouched since May — archive candidates → `docs/archive/`:**

| File | Size | Note |
|---|---|---|
| `docs/archive/PROGRESS.md` | 163 KB | Session-by-session history from Session 1; unchecked items are stale |
| `docs/archive/DEEPSEEK.md` | 82 KB | Describes the DeepSeek health-agent LLM **deleted in #184** |
| `docs/archive/AUDIT_PROD_READINESS_V2.md` | | May point-in-time audit |
| `docs/archive/AUDIT_S97.md` | | May point-in-time audit |
| `docs/archive/COMPETITOR_PARITY.md` | | Planning doc — not proof of shipped features |
| `docs/archive/BUSINESS_DASHBOARDS_SPEC.md` | | Implementation status unverified |
| `docs/archive/ONBOARDING_FLOW_SPEC.md` | | Implementation status unverified |
| `docs/archive/FIGMA_DESIGN_SYSTEM.md` | | Generated spec |
| `docs/archive/FIGMA_TOKEN_IMPLEMENTATION_PLAN.md` | | Do not implement without a session gate |
| `docs/archive/IMPLEMENTATION_GAP_LIST.md` | | Superseded by `FEATURE_MAP §20` |

**Stale but still useful — rewrite, don't archive:** `ATTRIBUTION.md` (36 KB),
`IDENTITY_DESIGN.md` (predates Tinybird), `MANUAL_QA_BACKLOG.md`, `QA_RUNBOOK.md`.

**Append-only logs past usable size:** `SESSION_HANDOFF.md` (356 KB), `SESSION_LOG.md` (256 KB).
No agent reads either in full. Consider periodic splits (`SESSION_LOG_2026H1.md`) rather than
deletion.

**Archive, never delete.** `docs/archive/qa/` and `tinybird/archive/` are cited by live code
comments and `.pipe` descriptions — see #326. When archiving anything, grep the **bare filename**
repo-wide: citations live in code comments, test asserts, JSON prose, and other docs, in at least
three different formats.

---

### 27. Tier-3 cleanup backlog — code

**Severity:** low · **Verified:** 2026-07-20

| Item | State | Action |
|---|---|---|
| `api/lib/abuse-guards.js` | zero references | delete |
| `api/lib/rate-limit.js` `publicDashboardLimit` / `createPublicDashboardLimit` | orphaned by #323; **behaviour tests still assert on it** | delete limiter **and** the three tests together — a suite asserting on dead code will confuse a future CI failure |
| `api/lib/hogql-date.js` | PostHog-era **name**, ~8 live importers | **rename, do not delete** |
| `api/lib/url-normalization.js` vs `url-normalize.js` | ✅ **RESOLVED — not a duplicate.** Two normalizers **by design**, different semantics, both load-bearing on persisted output. Reasoning lives in the two file headers (`url-normalize.js:1` · `url-normalization.js:1`) — read those, not a summary here. | **do NOT merge.** Guarded by `api/tests/url-normalizer-drift-guard.test.js` (fails on a **third** normalizer; registered in `qa:identity:unit`) |
| `supabase/migrations/20260620134500_add_site_support_notes.sql` | dangling — applied to neither DB | decide: apply or remove |
| `supabase/schema.sql` | 1 KB, stale (see issue 1) | regenerate or delete |
| `site_annotations` / `annotations` tables | routes deleted in #315, tables remain | DDL — needs explicit founder go-ahead |
| 67 test files reference `process.env.POSTHOG_*` | legitimate fail-closed scaffolding, but named after a deleted system | rename to a neutral env var |
| `api/lib/attribution-engine.js:2434-2454` `flexible_ai_share` block (`count()` at :2437) | UNREACHABLE — throws unconditionally at :2453; `ai_conversion_share`/`ai_revenue_share` are gated → 422 upstream, so the read never runs (confirmed while scoping PR2). Listed as a refund-count site but it is dead. | delete the block (keep the `throw`/gate); do NOT refund-guard dead SQL |

**Script wiring:** see issue 24 — 40 `qa-*` scripts, 6 npm script names, 1 in CI. Same backlog,
not duplicated here.

---

### 28. Deferred: `DATA_CAPTURE_SPEC.md` needs a rewrite, not a patch

**Severity:** medium — actively misleads agents · **Verified:** 2026-07-20

Two defects:

1. A "PostHog properties" section describing a store decommissioned 2026-07-19.
2. Its "Not yet verified/built" list claims click IDs are unbuilt — **directly contradicting
   issue 3 above** (*"This issue was wrong. Click IDs ARE captured end-to-end"*) and
   `FEATURE_MAP §1`, which records 13 captured.

**Why deferred:** fixing it correctly requires a field-by-field audit of `tracker.js` against
`tinybird/SCOPE_v3.md §2.6`, to establish which fields are typed columns and which live in the JSON
properties bag. Rewriting it from the other two docs would launder their claims rather than verify
anything.

**Interim:** marked ⚠️ stale in `DOCS_INDEX.md` with "trust `KNOWN_ISSUES` and `FEATURE_MAP` over
it." Do not cite it as authoritative until the audit runs.

---
### 29. No working alert channel — health checks run and report nowhere

**Severity:** high · **Verified:** 2026-07-20 against production Railway config + `job_runs`

**Detection is built and correct. Delivery does not exist.**

`api/jobs/health-agent.js` runs every 30 min in production (cron `*/30 * * * *`, service
`f15924b7`). It performs four critical checks — `CRITICAL_CHECKS = {supabase, nightly_job,
conversions, tinybird_quarantine}` — including `evaluateNightlyJob` (`:109`), which returns
critical on a missing `job_runs` row, a non-success status, or a run older than 26h.

**None of it reaches anyone.** `notify()` (`:280`) begins:

```js
if (!SLACK || dx.severity === 'ok') return
```

`SLACK_WEBHOOK_URL` was **unset in production** at first — verified 2026-07-20 via
`railway variables --environment production --service f15924b7 | grep -i slack` (empty, against a
command confirmed to produce output). While unset, `notify()` took the `!SLACK` branch above and
every critical result was discarded — an honest, visible gate.

This very likely included a live one: `evaluateConversions` asks *"are `attributed_conversions`
actually landing?"* and `nightly-attribution` recorded `conversions_processed: 0` on
2026-07-18, 07-19 and 07-20.

**Then it got worse, not better.** While trying to unset the variable (the installed CLI lacks
`--unset`), `SLACK_WEBHOOK_URL` was set to the literal placeholder
`https://hooks.slack.com/services/YOUR/REAL/URL` on `sourcetrack-health` (`f15924b7`) and
`sourcetrack-dq` (`9278c467`). That value is **truthy**, so `notify()` no longer took the `!SLACK`
branch at `:283` — it POSTed every critical alert to that dead Slack path at `:289`, where the
`fetch` has no `.ok` check and no `try/catch`, so the 404 was swallowed and the run looked clean.
The honest drop-when-unset gate had become a **silent false-delivery**.

**Env fixed 2026-07-20 — code path still unguarded.** A real incoming webhook is now set and
read-back verified on all four services that carried the placeholder (health-agent,
nightly-attribution, anomaly-watcher, and data-quality-check); delivery is curl-verified (HTTP 200)
— replaced with a real URL, not re-unset. But the `fetch` at `:289` still has no `.ok` check and no
`try/catch`, and `notify()` is unwrapped, so a revoked URL, a Slack outage, or a transient throw
fails silently again — delivery holds only while that URL stays valid.

**Compounding problem — the monitors are themselves unobservable.** `job_runs` contains only
three job names (checked 2026-07-20): `email-reports-weekly` (255 runs), `nightly-attribution`
(78), `gsc-daily-sync` (23). **`health-agent` and `data-quality-check` write no `job_runs` row at
all**, so "did the monitor run?" is currently unanswerable — the same blind spot that let
`sourcetrack-email` accumulate 255 phantom successes without sending a single email (issue 21).

**Related:** `anomaly-watcher` (issue to be filed) watches `attributed_conversions` for
direct-spike, source-silent and coverage-drop, and alerts through this same unset variable. It is
also **not scheduled in production** (staging only, `0 3 * * *`). Scheduling it before the channel
works only adds a third silent watcher.

**Actions, in order:** *(Update 2026-07-20: steps 1–3 done — real webhook set and read-back verified on all four services (health-agent, nightly-attribution, anomaly-watcher, data-quality-check), delivery curl-verified HTTP 200. Steps 4–6 remain.)*

1. Create a real incoming webhook (Slack, or Discord with `/slack` appended to the URL — that
   endpoint accepts the Slack payload shape `health-agent.js:292` sends).
2. Verify it independently with `curl` before trusting it.
3. Set `SLACK_WEBHOOK_URL` on `sourcetrack-health` and `sourcetrack-dq`; re-read the variable to
   confirm it persisted (see issue 21 — Railway config changes have silently failed here before).
4. Make `health-agent` and `data-quality-check` write a `job_runs` row every run, matching the
   column shape `anomaly-watcher.js:58` `_writeJobRun` already uses.
5. Have `notify()` log a clearly-marked undeliverable-alert line to stdout when `SLACK` is unset
   and severity is not ok, so a Railway log read still surfaces it.
6. Only then schedule `anomaly-watcher` in production.

**Do not rebuild detection.** `evaluateNightlyJob` and `evaluateConversions` are correct and
already critical-tier. The gap is the channel, not the logic.

### 30. CI required-checks gate did not hold — #335 merged RED to `main` (2026-07-20)

**What happened.** #335 (`b6d9543`) was merged to `main` while `build-and-test` was **RED**:
`scripts/check-secret-safety.js` flagged an inline `SLACK_WEBHOOK_URL` secret-assignment (the banned
`NAME`-equals-value pattern) at `NEXT_SESSION_PROMPT.md:116` (fixed by #337). `main` then sat red for
~5h. Because `pull_request` CI runs on the branch-**merged-with-base** commit, a red `main`
propagates the failure into **every open PR** — it reddened #336 on an otherwise-clean diff.
Detection existed (the check ran and failed); nothing surfaced it, and the merge used
`gh pr merge --admin`, which bypasses a failing required check.

**Why the obvious fix isn't available.** Required-status-check enforcement (branch protection /
rulesets) is **not enforceable on this Free private repo**. GitHub reports: *"Your rules won't be
enforced on this private repository until you move to a GitHub Team or Enterprise organization
account."* The gate therefore cannot be made mandatory here — do not record "branch protection" as
the fix; it is unavailable.

**Mitigations in place (detection + discipline, not prevention):**
1. **Alerting — PR #338 (merged, `81d3ef8`).** A `build-and-test` step, `Alert on red main`, gated on
   `failure() && push && main`, POSTs to Slack when `main` goes red. It has an **explicit HTTP-200
   check** (`[ "$code" = "200" ] || exit 1`) and an **unset-secret guard** (`exit 1` when
   `SLACK_WEBHOOK_URL` is empty) — deliberately **not** repeating `notify()`'s unchecked-`fetch`
   defect at `health-agent.js:289` (KI-29). Proven end-to-end: run `29761252622` logged
   `slack http 200` (secret masked in the log), step success, message confirmed in-channel.
2. **Drop `--admin` from the default merge.** Merge with plain `gh pr merge <n> --squash`.
   **Discipline only — unenforced:** `--admin` remains a one-keystroke bypass for as long as
   required-check enforcement is unavailable, the same class of control that failed here.

**Durable risk.** Until the repo moves to a plan that enforces required checks, nothing *prevents* a
red merge — the safety net is the #338 alert (fast discovery) plus merge discipline (choosing not to
bypass). Treat a red `build-and-test` on `main` as a launch blocker.

### 31. GitHub-hosted runners are deprecating Node 20 (low severity)

Surfaced in run `29761252622`: `actions/checkout@v4` and `actions/setup-node@v4` emit *"Node 20 is
being deprecated. This workflow is running with Node 24 by default…"* Runners already default to
Node 24; the pinned action majors still declare a Node 20 runtime and will **hard-fail** once Node 20
support is fully removed. **Fix:** bump the action versions in `.github/workflows/ci.yml`
(`actions/checkout`, `actions/setup-node`, and any other `@v*` actions on the Node 20 runtime) to
Node-24-compatible releases. Not urgent; no functional impact today.

### 32. AI-source maps diverged across the INGEST path — KI-11's class, never covered there

Session 97-98 (KI-11) unified AI classification — but only the **read** side (`attribution-engine.js` + the nightly job import canonical `channel-classifier.js`). The **ingest** path never did, so the same "diverged AI maps" class recurred on the write side and sat uncaught. Verified against `origin/main` `65b9340`:

- **Two write-ingress originators, three divergent maps.** `ai-platform.js` (`detectAIPlatform`, on `/track` + `/conversion`) had its own `AI_HOST_MAP` (18) + a **title-cased** UTM path (`charAt(0).toUpperCase()` → only **5 of 20** UTM keys landed on the canonical label; `chatgpt`→`Chatgpt`, not `ChatGPT`). `proxy.js` (`/sp/e` custom-subdomain proxy) had a third `AI_DOMAINS` map (8 hosts). Canonical `AI_DOMAINS_MAP` (23) is a superset of both.
- **Two verbatim ingresses.** `ai-platform.js:61` (`req.body.ai_source`) and `proxy.js:116` (`properties.ai_source`) accepted arbitrary caller values unvalidated — any `site_key` holder could write an arbitrary `ai_source`. Origin of the lowercase-hostname rows (staging shows ~184k each of `chatgpt.com`/`gemini.google.com`/`perplexity.ai`, likely seed; **prod unverified** — the analytics MCP is staging-bound).
- **Two propagation sites, NOT changed here (self-correct once ingress is canonical).** `webhook.js:225` (outbound egress forwards the stored value) and `channel-classifier.js:111` (read-side `detectAiPlatformFromEvent` trusts a stored `ai_source` verbatim).
- **A bing-organic ingest defect.** `ai-platform.js` stamped `ai_source='Copilot'` on `bing.com/search` — an `ORGANIC_SEARCH_ENGINE_HOST` — inflating the AI-attribution metric with organic Bing search. Introduced in the same never-canonical commit (`a3edd0b`, 2026-05-18) as the title-casing, no rationale.

**Fixed (2026-07-21):** `channel-classifier.js` extended (9 orphan UTM keys — incl. Meta AI, which had none — folded in so a naive import drops nothing) + new `resolveAiSource(value)` (reject-unknown) and `detectAiPlatformFromReferrer(referrer)` (shared by all paths; `bing` narrowed to `/chat`-only). `ai-platform.js` and `proxy.js` import the single source and route their explicit branch through `resolveAiSource`. Parity test (`ai-source-canonical.test.js`, `qa:tracker:unit`) pins that referrer/UTM/explicit emit one canonical string per source across **both** originators — the assertion whose absence let this drift.

**History note (corrects KI-11):** `a3edd0b` added the middleware's maps + title-case path the day after the S97 commit, touching only `ai-platform.js`. The middleware and proxy were **never part of** the 97-98 unification.

**Data impact (deferred — do not act):** existing rows carry split labels (`Chatgpt`/`ChatGPT`), verbatim hostnames, and inflated `Copilot` from organic Bing. Go-forward is fixed; the read-normalization/backfill of history is a separate decision pending the AI Sources check.

### 33. `consent(false)` deleted no stored identifiers — client-side GDPR withdrawal (FIXED)

`sourcetrack.consent(false)` set `_consentGiven=false`, persisted `st_consent`, and cleared the in-memory queue — and **removed nothing**. Verified two ways on prod `techrupt.pk` (2026-07-20): after `window.sourcetrack.consent(false)` in a fresh incognito session (3 pageviews), **`st_aid` (the anonymous_id), `st_ft_src`/`st_ft_med`/`st_ft_cmp`/`st_ft_ts`, and `st_sid` all SURVIVED**; nothing was removed; only `st_consent` was added. The in-memory `AID` also survived — `getToken()` returned the erased id while withdrawn, and it resurrected into outbound events on a same-page `optIn()`. Withdrawal stopped *using* the identifier but retained it.

**Fixed (this PR):** `clearStoredIdentity()` prefix-sweeps every `st_*` key from localStorage/sessionStorage/cookies except the preserve-list `['st_consent']`, deletes the `st_aid` cookie (domain + host-only `path=/` variants), and nulls in-memory `AID`/`SID`; re-consent mints a fresh id. **Client-side only — server-side GDPR erasure is Phase 7, NOT STARTED; this is NOT full compliance.**

### 34. `ENCRYPTION_KEY` rotation silently invalidates all stored OAuth tokens

Rotating `ENCRYPTION_KEY` leaves `gsc_connections.encrypted_refresh_token` **undecryptable** — sync then fails with Node crypto's AES-GCM auth-tag error `"Unsupported state or unable to authenticate data"`, while the UI keeps showing **"Connected"** over dead ciphertext. Only a full **Disconnect → OAuth reconnect** re-encrypts with the new key; the "Sync Search Console" button **cannot** fix it (it reuses the stored token). **Confirmed** (Supabase MCP, prod): `gsc_sync_runs` 2026-07-20 19:54:20 and 19:54:24, both failed with that exact string. **Fix:** a rotation runbook listing every table holding key-encrypted material and requiring re-auth; consider a boot-time decrypt probe that flips status and surfaces "re-auth required". **DO NOT rotate `ENCRYPTION_KEY` again without an immediate GSC reconnect.**

### 35. GSC property is not validated against the site's own domain (inferred — connect route not read)

Reconnecting GSC for site `www.techrupt.pk` defaulted the property to `http://dailypctechtips.blogspot.com/` — an unrelated domain — and rendered a green **"Connected"** badge for it. Design spec §17.4 already requires step 3 "Confirm property/domain match" and step 6 "Mismatch warning/block"; neither is enforced. **Severity: NOT a cross-tenant leak** (Google requires verified ownership) — it is a **data-correctness** defect: another domain's search data flows into the landing-page-matched SEO-revenue allocation and produces plausible-but-wrong numbers with no visible signal. **Status:** observed in UI + spec gap; the connect route has **not** been read — recorded as **inferred**. **Investigation points for the fix PR:** where property selection is persisted; whether any domain comparison exists; auto-select vs user-choice; normalization for http/https, www/apex, trailing slash, `sc-domain:` properties; warn vs block.

### 36. Disconnect cascade-deletes the entire `gsc_sync_runs` audit history

`gsc_sync_runs` held **6 rows before disconnect, 1 after**. Destroyed: the 2026-07-19 malformed-key failure, the 2026-06-29 missing-key failure, the 07-18 and 06-26 successes, and both 19:54 decrypt failures. Evidence of a **three-week outage** survived only because it had been queried 20 minutes earlier. Sync-run history is an **audit record, not connection state**, and should survive disconnect.

### 37. UI rendered "Connected" over an empty `gsc_connections` table (inferred — source not traced)

Between disconnect and property selection, `gsc_connections` had **zero rows** while the page showed a green **Connected** badge plus Sync/Disconnect controls. Connected state is derived from something **other than the persisted row**. Source not traced — recorded as **inferred**.

### 38. GSC auto-disable flaw fired again, as predicted (2nd confirmed occurrence)

After the 19:54 failures, status flipped to `'error'` with `last_error_code = 'sync_failed'`. `gsc-daily-sync.js:152` selects `.eq('status','connected')`, so the next scheduled run would have found nothing and no-op'd. **One failure permanently disqualifies the connection — no retry, no operator signal.** Second confirmed occurrence; already noted in `FEATURE_MAP`.

### 39. `gsc-daily-sync` reported success on a no-op early exit

`job_runs` 2026-07-20 02:00:49 — `gsc-daily-sync`, **success, 148ms, error null**. No `gsc_sync_runs` row written; `last_synced_at` did not move. It found no eligible connection, exited in 148ms, and logged the pre-#332 hardcoded success. #332 (`deriveGscJobStatus`) now derives status honestly. **Record the ~148ms signature as a detection heuristic for no-op runs.**

### 40. `tracker.min.js` is a STRUCTURAL trap — not a historical incident

**Frame exactly this way: no drift has occurred.** Prod serves the committed `tracker/tracker.min.js` directly (`api/index.js:337` `res.sendFile`) and **nothing rebuilds it at deploy**, so a source-only tracker change is **INERT** in production unless the min is rebuilt and committed in the same PR. **No test guards min↔source sync.** As of 2026-07-20 the two were verified **IN SYNC**: rebuilding `origin/main`'s `tracker.js` with the repo's own esbuild `0.24.2` via the documented `package.json:9` `build:tracker` script produced a **byte-identical** match to the committed min — no prior tracker change shipped as a no-op; prod is **NOT** running stale logic. **Recommended fix (not built here):** a CI guard that runs `build:tracker` and fails if the committed min differs from the rebuild.

### 42. `sites.api_key` is plaintext at rest; `requireApiKey` middleware is dead code

`sites.api_key` is a **plaintext** column, DB-default-generated (`DEFAULT gen_random_uuid()`) — **prod: 4/4 sites carry a plaintext key, only 1 has `api_key_hash`** (Supabase-verified 2026-07-20). It is read by **nothing live**: `api/middleware/api-key.js` (`requireApiKey`) — which would look it up (`sites.api_key_hash`, with a **raw-plaintext fallback**) — is **defined but never imported or mounted**. So this is a latent plaintext credential on every site **plus** dead middleware. The current live key model is the separate hashed `api_keys` table (see FEATURE_MAP §1). `gdpr.js:548` already excludes `api_key`/`api_key_hash` from export. **Fix them together** (the #340 lesson — a dead reader and its data are one change, not two): drop the plaintext column + the hash-fallback branch + the dead middleware. Verify the actual prod column shape first (baseline schema vs later migrations differ).

### 43. `api_keys` has no scope model; revoke destroys audit; no generation rate-limit

`api_keys` has **no `scopes`/`permissions` column** — every issued key is all-powerful **per-site**. Today's only consumer is write-ingest (`POST /api/server/event`), but the roadmap is a **read REST API → MCP server**. With **0 keys issued in prod**, the migration cost to add scopes is **zero and will never be lower** — add a scope/permission model **before** the key authenticates anything beyond ingest (retrofitting scopes onto already-issued all-access keys is the painful path). Also: **revoke = hard `DELETE`** (no `revoked_at`/`is_active`), so `last_used_at` audit history is destroyed on revoke; and there is **no rate-limit or per-site cap** on `POST /api/integrations/api-keys` generation. (Not `KI-34` class — keys are hashed, not `ENCRYPTION_KEY`-encrypted, so rotation doesn't cascade.)

**Plan (LOCKED 2026-07-20 — build after the 02:00 verdicts, full ceremony; nothing built yet).** ONE migration file, ONE apply window (apply-then-merge, §8 — founder applies staging→prod before merging code that reads the columns): `ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}'` — **fail-closed backstop** (a non-app INSERT grants nothing; the app defaults omitted scopes to `['write:events']`) — plus `ADD COLUMN IF NOT EXISTS revoked_at timestamptz` (harmless while unread). MVP scopes = exactly **`write:events`** and **`read:analytics`** (an array, not a permission system). **App-only validation** (unknown scope fails closed via the `write:events` membership check; a test MUST assert an unrecognised scope is DENIED, not ignored). Then three small PRs off the applied migration: **PR A** — scope enforcement (`server-events` requires `write:events`) + generate/list `scopes` + UI selector + tests (**this is the one that blocks the read REST API → MCP**); **PR B** — soft revoke (`DELETE` → set `revoked_at`, exclude revoked from auth); **PR C** — gen rate-limit + per-site key cap (no DDL). ⚠️ **Scope enforcement is a BREAKING CHANGE for any existing key** (a key lacking `write:events` starts getting 403) — **safe ONLY because zero keys exist in prod; not safe generically.** If any key is issued before PR A ships, a grant-migration is required first.

### 44. Stripe subscription-lifecycle handlers silently no-op on a zero-row match (money rail, P0)

**Discovered (Antigravity prod audit):** techrupt.pk's subscription `sub_1TmNs5…` was **CANCELED 2026-06-26T01:19:27Z** (36 min after creation), yet the prod `sites` row still reads `plan='growth'`, `pv_limit=150000` with both Stripe IDs set — **24 days later**. A cancellation never reached entitlements. Silent, on the money rail, indistinguishable from a healthy paid site.

**June delivery — traced, now permanently unrecoverable:** the `customer.subscription.deleted` event fired (`evt_1TmOQW…`); the webhook endpoint `we_1TmIJ2…` was created 2026-06-25T18:47:20Z — **6.5h before** the event — and was enabled; Stripe's dashboard confirms the event **was sent** to it. So **not** a registration gap. Stripe retains delivery-attempt records 15 days; the event is 25 days old — the response code is **gone**. **Do not plan any task that depends on the June delivery record.**

**The code defect (a CLASS, and it stands regardless of what reproduction shows):** four handlers in `billing.js` — `customer.subscription.updated` (:217), `.deleted` (:237), `invoice.payment_succeeded` (:262), `invoice.payment_failed` (:282) — all `.eq('stripe_customer_id', customerId)` and all destructure **only `{ error }`**, capturing no affected-row count. In PostgREST a **zero-row `UPDATE` is not an error**, so all four return 200 to Stripe, log a success line, and change nothing — they cannot distinguish "downgraded a site" from "found no site to downgrade." Same silent-success class as the 148ms GSC no-op (**KI-39**), on the money rail. **The UPDATE logic is correct; the zero-row DETECTION is missing** — different claims. (Independently code-verified 2026-07-20.)

**Asymmetry to record:** `checkout.session.completed` (:189) keys off site **metadata** and works (it *sets* `stripe_customer_id`); all four lifecycle handlers key off `stripe_customer_id`, which only exists **if checkout landed first**. Stripe does **not** guarantee event ordering — a lifecycle event arriving before/without a landed checkout matches zero rows and silently no-ops.

**Reproduction (staging, current code, full delivery records): PASS — but HAPPY PATH ONLY.** Antigravity cancelled staging `sub_1TvOPG…`; event `evt_1TvQUs…` (`customer.subscription.deleted`) fired **2026-07-20T23:21:19.545Z UTC**, delivered, the handler ran, the row mutated `plan 'growth'→'inactive'` and `pv_limit 150000→0`, HTTP 200, log `[billing] subscription cancelled — customer cus_UvEtzqotX9vISx`. ⚠️ **Timestamp trap:** Antigravity's summary reported `2026-07-21T01:21:18Z` — that is **CEST mislabelled with a `Z` suffix**; use the Railway UTC `23:21:19.545Z` (same class as `TIMESTAMP_TRAP_AUDIT.md` / PR #90). ⚠️ **CRITICAL QUALIFIER — the whole point:** `stripe_customer_id` was **already populated** on the staging row (checkout completed hours earlier), so `.eq` matched a row and the update landed. **The ZERO-ROW BRANCH — the one suspected in June — was NEVER exercised.** The correct reading is **"the handler works when the row matches," NOT "the handler is fine."** The June root cause (why the row did not match) stays **unknown and unrecoverable**.

**Fix scope (when dispatched — DO NOT build now; full ceremony, money rail):** all four handlers capture affected rows via `.select()`, treat a **zero-row match as an error worth alerting on** rather than a silent 200, and consider `stripe_subscription_id` as a **fallback lookup key**. One PR, four call sites.

**Also open (same audit):** `STRIPE_PRICE_ID_SCALE` is **absent from prod env** — the Scale tier **cannot be purchased**; and **2 of 3 prod prices** (Starter, Early-Bird-Annual) have **no `pv_limit` metadata**, masked by codebase fallbacks.

**Product decision (not a defect), flagged for later:** the handler sets `plan='inactive'`, `pv_limit=0` — tracking **stops dead** on cancellation rather than downgrading to free tier. May be deliberate.

**P0 — outranks KI-14/35/40. HELD pending the 02:00 UTC verdicts** (do not start).

---

**✅ FIXED — squash `06f1ba0` (PR #349), merged 2026-07-21.** *(VERIFIED — `git rev-parse origin/main` + `git show --stat`; the four changed files are on `main`.)*

- `.select('id')` on all four updates makes the zero-row case observable. The fallback key is `stripe_subscription_id` (`sub.id` on updated/deleted; `invoice.subscription` on succeeded/failed — valid top-level at the pinned `apiVersion: '2024-06-20'`).
- Three distinguishable outcomes: `matched` (silent) · `recovered` (durable `partial` row — the write landed but the `customer_id` linkage is broken) · hard failure (durable `failed` row, then throw → 500 → Stripe retries, since the idempotency claim commits only after the switch).
- `invoice.payment_succeeded`'s `getSiteByCustomerId → null` branch, which previously skipped with **no log at all**, is now recorded (not thrown — nothing was attempted).
- Durable sink is `job_runs` via `writeJobRun`; `site_alerts` was rejected because its SELECT policy is `site_id IN (owner's sites)`, which a NULL `site_id` satisfies for nobody — the row would have been invisible, recreating this very failure.

**⚠️ The evidence standard here DIFFERS from KI-45 — deliberately. Do not leave this open waiting for a runtime proof point.**

KI-45 could be closed on an observed prod run because its code path executes nightly regardless of customer count. **This one cannot.** The zero-row branch only fires when a Stripe lifecycle event arrives for a customer with no matching `sites` row, and at ~0 real paying customers **that may never happen in prod.** Waiting for an observation would leave a merged, tested money-rail fix open indefinitely against an event that will not come.

**Correctness therefore rests on the test suite plus a mutation check** *(VERIFIED — re-run locally against `06f1ba0` while writing this entry; both mutations applied and reverted, tree left clean)*:

| Mutation | Result |
|---|---|
| Remove zero-row detection (no `.select()`, treat "no error" as success) | **9 of 16 tests fail** |
| Remove the durable-record error guard only | **1 of 16 fails** (test 6, and only test 6) |
| Unmutated | **16/16 pass** |

> ⚠️ Earlier working notes said "8 of 16" for the first mutation. **The correct figure is 9** — test 6 also traverses the hard-failure path, so it depends on detection too. Cite 9.

**This is the same reasoning shape as KI-19** (correctness-by-construction where empirical parity is structurally unobtainable): where the real-world comparison cannot be produced, the standard becomes *does the guard demonstrably fail when removed* — which is exactly what the mutation check establishes. **Treat KI-44 as closed on that basis.**

**What the fix does NOT cover — still unknown, and unrecoverable:**
- **The June root cause is still unknown.** The fix makes a future zero-row match *detectable*; it does not explain **why** techrupt.pk's row failed to match in June. Was `stripe_customer_id` NULL, stale, or different? **Unanswerable** — Stripe retains delivery-attempt records 15 days and the event is now ~26 days old (see the June-delivery paragraph above). No task should be planned that depends on recovering it.
- **The affected prod row is not repaired by this fix.** techrupt.pk may still read `plan='growth'` — the fix changes future event handling, not existing state. Verify and repair separately.
- **The zero-row branch has never executed in prod.** Its first real execution will also be its first real-world test.
- **Nothing reads the durable record yet — see KI-48.**

### 45. THE SILENT-SUCCESS CLASS — "OK must mean verified" (data-quality-check is the 4th instance)

**Name the class once, prominently:** a job reports success/OK for work it did **not** do. Four instances surfaced 2026-07-20, and it is *the* failure mode for a product whose pitch is "the numbers are real":
- **KI-39** — `gsc-daily-sync` logged `success` on a 148ms no-op early exit.
- **KI-44** — four `billing.js` webhook handlers return 200 OK on a zero-row `UPDATE`.
- **This job, defect (a):** `data-quality-check.js:95` writes `status='ok'` for a site whose ratio checks were **skipped** (`total < 5` → `continue`). A skip recorded as healthy — verified on prod (site `eb7f68c3…`, **12 consecutive days** of `insufficient_data`/`ok`).
- **This job, defect (b) — worse:** the per-check `catch` (`:103-197`) logs to console and **writes NO row** when a check *throws*. A missing row is **invisible** — indistinguishable from "not applicable," and with the sole UI consumer reading only one check (below), nobody would ever see it. A false `'ok'` at least leaves an auditable trace; a missing row leaves none.

**The correct pattern already exists in the repo — cite it so this reads as canonical, not three independent inventions:** `health-agent.js:59/66` (`_status: 'skipped'`, comment *"explicit, NOT a silent pass"*) and `anomaly-watcher.js:27/32` (`_scanFailures` + *"a swallowed failure must not report success"*). **`data-quality-check.js` is the lone outlier.**

**Reviewed and INTENTIONAL — do NOT "fix":** `data-quality-check.js:196` `ai_detection_rate` writes `'ok'` as a **neutral signal** — that check *ran*, and a site legitimately having 0% AI traffic is not a health problem. Recorded here so a future reader doesn't turn it into a false warning.

**Consumer reality (corrects the original premise):** the **only** reader of `/analytics/data-quality/latest` is `Integrations.jsx:671`, which reads a **single** field (`duplicate_conversion_rate === 'warning'`). There is **no per-check status grid** — so `'ok'`-on-skip is a **data-layer lie, not a rendered green tick.** **UI requirement recorded for when a DQ panel IS built:** `'skipped'` must render visually distinct from `'ok'` and **must NOT be green** (it means *unknown*, not *healthy*).

**Blocker:** `data_quality_reports_status_check` = `CHECK (status = ANY (ARRAY['ok','warning','critical']))` (baseline `:578`, unaltered by any later migration) — `'skipped'` throws on insert.

**Fix plan (apply-then-merge, §8 — founder applies the CHECK change staging→prod BEFORE either PR merges, else the nightly throws for every site):** ONE migration (allow `'skipped'`), then **PR A** — `:95` `'ok'`→`'skipped'`, message unchanged, tests (under-threshold → `skipped`; over-threshold → `ok/warning/critical` unchanged) — and **PR B** — per-check `catch` writes a row `status='skipped'` with the error text in `message` and a distinct `check_name` (suffix) so a thrown check is **visible**, not absent. **NO backfill** of the 12 historical `'ok'` rows — cutover is 2026-07-20; a documented discontinuity beats rewriting history. **STATUS — both PRs merged; NOT yet marked DONE (awaiting first run that exercises them).**

| What | Merged (UTC, 2026-07-21) | Commit |
|---|---|---|
| Migration (allow `'skipped'`) | applied staging+prod before either PR | `pg_get_constraintdef` verified on **both** |
| **PR A #343** — skip path writes `'skipped'` not `'ok'` | **~00:13** | `b265462` |
| **PR B #344** — thrown check writes a visible `'skipped'` row, not nothing | **~08:30** | `822a2fc` |

**Read prod DQ rows against these windows — the boundaries change what a row means:**
- The DQ run at **2026-07-21 00:04:53 predates BOTH merges.** It executed the *original* code and wrote `'ok'` for skipped checks. **That is EXPECTED — it is not a regression, not a failure of either fix, and must not be read as one.**
- Rows written between ~00:13 and ~08:30 exercise **PR A only** (honest skips; a *thrown* check still writes nothing).
- **First run exercising PR A AND PR B: 00:00 UTC 2026-07-22.** ⏳ **Mark this KI DONE only after that run is observed — not before.** Merged ≠ exercised.

**Verification methodology note (this bit us tonight — reuse it):** `git merge-base --is-ancestor <branch-head> origin/main` returns **MISSING for every squash-merged PR**, merged or not — the branch commit (`6fb2e90`) never becomes an ancestor of the squash commit (`822a2fc`). This repo squash-merges, so that test **cannot** return ON_MAIN and is not evidence of anything. **`grep -c checkErrorReport api/jobs/data-quality-check.js` on `origin/main` is the authoritative check** — it tests the *code*, not the commit graph, and cannot be fooled by squash, rebase, exit codes, or shell paste-mangling. `0` = absent, `2` = present.

> ### ⚠️ PROCESS NOTE — the silent-success class includes OUR OWN PIPELINE (5th instance)
>
> **PR B #344 was built, reviewed, approved, pushed, CI-greened, and reported as merged — and was not merged.** It sat open for ~8 hours while `KNOWN_ISSUES.md` asserted the fix was live. **Nothing in the pipeline catches an approved-but-unmerged PR.** It surfaced only because the founder asked, and the first two manual checks returned a *false* negative (terminal collapsed the multi-line paste, so `cd … git fetch …` ran as one `cd` with seven arguments and printed the `||` branch) — so we had neither a reliable positive nor a reliable negative.
>
> **This is the FIFTH instance of this session's class — success reported for work not done:** KI-39 (GSC 148 ms "success" that synced nothing) · KI-44 (billing webhook returns 200 on a zero-row update) · KI-45a (DQ skip recorded as `'ok'`) · KI-45b (thrown DQ check recorded as nothing) · **and now our own delivery process.** The pattern is identical every time: *the report is generated by the attempt, not by the outcome.*
>
> **Proposed guard (recommendation only — NOT built, needs go-ahead):** fold an open-PR check into the existing CI watch — if a PR is approved + CI-green + has sat open past a threshold, surface it; and make "merged" claims cite the **squash commit SHA on `origin/main`**, never the branch head (see the methodology note above). Cheap, no new infrastructure.

### 46. Whole-job failure is invisible — 2 of 6 jobs write NO `job_runs` row

KI-45 **PR A (#343) and PR B (#344) are both merged**, so *individual* check failures — skipped and thrown — are now recorded (first run exercising both: 00:00 UTC 2026-07-22). **Whole-job failure remains invisible one level up:** **`data-quality-check.js` and `health-agent.js` write NO `job_runs` row at all** (grep-verified: 0 `job_runs` inserts each; `data-quality-check.js:30`'s `job_runs` reference is a *read* of nightly-attribution's freshness). So if either job crashes at line 1, its container never starts, or its cron stops firing, **nothing records it** — the only trace is *absent* output rows, and the sole DQ UI consumer reads one field (`duplicate_conversion_rate`), so nobody would look. Same silent-success class as KI-39/44/45, one level up.

**The correct pattern already exists** — a canonical `writeJobRun` helper (`api/lib/job-runs.js:28`), used by `usage-threshold-emails.js:182`; plus inline `_writeJobRun` in `nightly-attribution.js:73` and `anomaly-watcher.js:58`. **Fix (separate PR, own tests — NOT built):** `data-quality-check` and `health-agent` adopt `writeJobRun` — a `'running'` row at start and a `success`/`failed` row at end — so a dead job is detectable.

**Do NOT conflate with a different concern (verified):** `anomaly-watcher.js` and `usage-threshold-emails.js` **do** write a `job_runs` row but are **absent from prod's `job_name` list** (prod has only `email-reports-weekly`, `nightly-attribution`, `gsc-daily-sync`) — their absence is **not-scheduled-in-prod**, not not-writing. `anomaly-watcher` is staging-only (known). **`usage-threshold-emails` being silently unscheduled in prod has real billing stakes** (usage-cap emails never sent) — a scheduling gap worth its own look, distinct from this KI. **Inventory note:** `gsc-daily-sync` is not in `api/jobs/` — it lives in `api/lib/gsc-daily-sync.js`, runs **inside** `nightly-attribution`, which writes its `job_name='gsc-daily-sync'` row (`nightly-attribution.js:363-375`); its prod presence is correct.

### 47. `/api/attribution/verdicts` sends campaign revenue to a third-party LLM — contradicts a public privacy claim, undisclosed sub-processor

Filed 2026-07-21 against `b3cb043`, from documenting the endpoint. Every claim below is tagged **VERIFIED** (read in the code/file at this ref) or **INFERRED**, with its method. Nothing here was changed — documentation only.

**(a) The egress chain — VERIFIED (read the files at `b3cb043`).**
`api/index.js:463` mounts `GET /api/attribution/verdicts` → `attributionVerdicts` in `api/routes/attribution.js:424`. At **`attribution.js:448`** it does `const { callAI } = await import('../lib/ai-client.js')` and calls it with campaign **name, revenue, conversions, and sessions** for up to 20 campaigns. **`ai-client.js:25`** resolves the vendor as `process.env.AI_PROVIDER || 'deepseek'` — **DeepSeek is the default**, reached whenever `AI_PROVIDER` is unset. `ai-client.js` also wires **`kimi` → `https://api.moonshot.cn`** (a China-hosted endpoint) and `openai`; the `anthropic` entry is an empty stub with a `TODO`, so **Anthropic is not actually callable**. The route is plan-gated on `ai_analytics`, which is **on for trial/starter/growth/scale** (`plan-features.js:45`) — i.e. every paid tier, not an internal-only flag.

**(b) `docs/SourceTrack_GTM.md:92` lists "no data to LLM" as a SAFE PUBLIC CLAIM — VERIFIED (read the line); the claim is FALSE while this endpoint exists.** That line sits under "✅ Safe to claim NOW (built + truthful)" and reads `**privacy: GPC/DNT honored, no fingerprinting, no data to LLM**`. Per-campaign revenue leaving the platform to a third-party model is exactly "data to LLM". **This is a truth-gate defect (§6), not a wording nit** — the claim is cleared for public use, so it can reach marketing copy, a security questionnaire, or a customer DPA. Either the endpoint goes, or the claim goes; they cannot both stand.

**(c) DeepSeek is NOT in `dashboard/src/pages/Subprocessors.jsx` — VERIFIED (read `ROWS`, lines 19–27).** The table lists **Anthropic** and **OpenAI**, both described as *"AI features (deterministic, truthful-only)"*. The disclosure is wrong in three ways at once: it **omits DeepSeek**, which is the *default* provider actually reached; it **omits Moonshot/Kimi** (China endpoint); and it **lists Anthropic**, which the code cannot call (empty config stub). The descriptor *"deterministic, truthful-only"* is also inaccurate for this path — the verdicts are free-text model output. The page carries a "DRAFT — regions to be confirmed" banner, which mitigates but does not resolve it: an undisclosed sub-processor receiving customer revenue data is a **GDPR Art. 28 / Art. 13(1)(e) disclosure gap**, not a copy edit.

**(d) KI-18's "nothing live consumes it" is WRONG, and the remediation it prescribes causes a silent outage — VERIFIED (read `KNOWN_ISSUES.md:153` + traced the path).** KI-18 says of `DEEPSEEK_API_KEY`: *"Nothing live consumes it — only `api/lib/ai-client.js` (behind the cut ai-chat/ai-analytics features)"*. That is false at this ref: the **live, plan-gated, mounted** verdicts route consumes it via (a). Worse, KI-18's fix is *"Revoke in the DeepSeek console, then delete the variable from every service."* Doing that would **not** make verdicts error — `ai-client.js:29` throws on an unconfigured provider, `attribution.js:473` catches it, sets `verdicts = []`, and the handler returns **`200 {success:true, data:[], error:null}`**. So revoking the key silently converts the feature into a permanent empty list that is indistinguishable from "no campaigns in range". **Same silent-success class as KI-39/44/45/46 — and here the documented remediation is what triggers it.** `data: []` already has **four** indistinguishable causes: no campaigns, AI call failed, unparseable reply, or handler threw.

**(e) UNKNOWN — whether `DEEPSEEK_API_KEY` is actually set on the API service. NOT VERIFIABLE FROM HERE; do not assume either way.** KI-18 states it is set on `sourcetrack-health`, "where nothing reads it" — but the service that *does* read it is the **API** service, and its env state is unknown. This is the standing Railway constraint (§13): **the Railway MCP has no env-var read tool**, so a code-only audit cannot see live env state. **Founder or Antigravity must check the Railway UI for the API service.** The two outcomes differ sharply: if the key **is** set, revenue data is leaving the platform today and (b)/(c) are live incidents; if it is **not** set, every verdicts call has been returning `[]` — the feature is silently dead in prod and no data has egressed. **Determine this before deciding anything else in this entry.**

**(f) `/api/attribution/explain` returns `200` on internal failure — VERIFIED (`attribution.js:417-420`).** The `catch` responds `200 {success:true, data:null, error:null}`. A dropped upstream read is indistinguishable from success at the HTTP layer; only `data: null` distinguishes it, and the `404` "no conversion" path never produces that. Any consumer rendering it as an empty state shows "no journey" for what is actually a failed read. Same silent-success class. Documented for API consumers in `docs/guides/attribution-explain-api.md`.

**Proposed fix — REBUILD VERDICTS DETERMINISTIC (proposal only, NOT built, no code written).** Replace the model call with **threshold rules over already-computed metrics** — ROAS, CPL, conversion volume, and revenue trend, all of which the pre-aggregated attribution read already returns. Same `{campaign, verdict, reason, signal}` response shape, so no consumer changes; `reason` becomes a templated string citing the numbers that triggered the rule ("0 conversions on 1,240 sessions"). This is **§26-safe by construction**: no model call, **no data egress**, deterministic, reproducible from the rows, and it repairs (a)–(d) at once — the GTM claim becomes true again, DeepSeek stops being a sub-processor, and `DEEPSEEK_API_KEY` can be revoked per KI-18 without a silent outage. Thresholds must be cost-gated like every other cost metric (§6): **hide** ROAS/CPL-derived verdicts when no ad-cost data exists for the range rather than emitting a verdict from a fabricated zero. **The alternative is removal** — delete the route and the `ai_analytics` gate with it. **Founder decides; both are defensible, and doing neither is not.** Whichever is chosen, `data: []` must stop being the failure signal (return a real error), and KI-18 must be corrected.

**Scope note:** the API documentation for this endpoint was deliberately **withheld** from the docs PR (#347) pending this decision. It is written and accurate as of `b3cb043`, and was preserved rather than discarded.

---

**✅ RESOLVED — squash `ab9fc7b` (PR #353), merged 2026-07-21.** The deterministic rebuild shipped: the dynamic `import('../lib/ai-client.js')` and the prompt are gone, replaced by the pure `api/lib/campaign-verdicts.js`. **(a) RESOLVED** — no egress; **(b) RESOLVED** — the GTM claim is true again (see below); **(c) RESOLVED** — DeepSeek is no longer a sub-processor at all, so its absence from `Subprocessors.jsx` is no longer a disclosure gap; **(d) MOOT** — the "revoking the key silently returns `[]`" hazard cannot occur, because nothing calls the client and the error path now returns **500** rather than `200 {data:[]}`.

**🔴 THE FINDING WORTH KEEPING — three of the old prompt's four rules were structurally UNSATISFIABLE.** Each verified against `ab9fc7b~1` (the pre-fix tree) while writing this; do not re-derive it, and do not lose it:

| Old rule (`attribution.js` prompt, pre-fix) | Why the data could not support it |
|---|---|
| *"SCALE: high revenue, **positive trend**, good conversion rate"* | The payload carried `campaign`, `revenue`, `conversions`, `sessions` and **no time dimension whatsoever**. A trend was not computable from it — only invented. |
| *"…good **conversion rate**"* | The payload sent `sessions: c.sessions \|\| 0`, but `getPreAggregatedAttribution`'s result builder (`attribution-engine.js:515-529`) emits **only** `dim_value`, `revenue`, `conversions` — **zero occurrences of `sessions`**. So it sent **literal `0` for every campaign on every call**, and a conversion rate was uncomputable. |
| *"KILL: zero or near-zero revenue, **no conversions**"* | The aggregation is `for (const conv of conversions)` (**`attribution-engine.js:441`**) — a campaign only enters the result set once it has at least one conversion. **"No conversions" was unreachable by construction.** |

**State it plainly: every `SCALE` and every `KILL` verdict this endpoint ever returned was fabricated.** SCALE required a trend and a conversion rate, neither of which existed in the input; KILL required zero conversions, which could not occur. `PAUSE` ("low revenue but some conversions") was the only rule whose inputs were real. The model was not summarising data — for two of three verdicts it was inventing the criteria and then applying them.

**This is a stronger indictment than the egress itself.** The egress was a policy violation; this was a correctness failure that no amount of prompt tuning would have fixed, because the required facts were never in the payload. It is also the general lesson: *an LLM handed an inadequate payload does not report that the payload is inadequate — it produces confident output anyway.* A deterministic implementation cannot do that: `computeCampaignVerdicts` returns `INSUFFICIENT_DATA` / `NO_REVENUE_DATA` when the inputs cannot support a judgment.

**Threshold caveat carried forward:** see **KI-50** — the new thresholds are absolute and currency-blind.

**Still open, unchanged by this fix:** `api/lib/ai-client.js` still exists (now with **zero code callers** — verified repo-wide) and the `openai` npm dependency is still installed. Removal is a separate decision. The `ai_analytics` **gate key** is unchanged (migration cost); only its display label was corrected.

### 48. The KI-44 durable record has NO reader — nothing alerts, and nothing displays it

Filed 2026-07-21 against `06f1ba0`, immediately after KI-44 merged. KI-44 now writes a durable `job_runs` row on every zero-row match (`job_name='billing-webhook-zero-row'`). **Nothing consumes it.**

**(a) `health-agent` does not read these rows — VERIFIED (read `api/jobs/health-agent.js`).** `CRITICAL_CHECKS` is exactly `new Set(['supabase', 'nightly_job', 'conversions', 'tinybird_quarantine'])` (`:18`) — **nothing billing-related.** The only `job_runs` read is inside the `nightly_job` check (`:192`), and it hard-filters `.eq('job_name', 'nightly-attribution')` — so a `billing-webhook-zero-row` row is **not even fetched**, let alone evaluated. Adding the job name to `CRITICAL_CHECKS` alone would therefore do nothing; the query is the binding constraint.

**(b) ⚠️ CORRECTION — `/api/jobs` does NOT surface these rows either. VERIFIED (read `api/routes/job-status.js` in full — it is 24 lines and has exactly one route).** A working assumption while filing this said the rows were "visible via `/api/jobs`". **That is false.** The sole route is `GET /api/jobs/attribution/status`, which is `requireRole('super_admin')` **and** hard-filters `.eq('job_name', 'nightly-attribution')` (`:12`). There is no unfiltered job-runs endpoint anywhere.

**So the accurate state is worse than "visible if someone looks":** **no application code path reads these rows at all.** The only way to see a billing zero-row event today is a direct SQL/console query against `job_runs` that someone thinks to run. Adjacent to **KI-46** (whole-job failure invisible because no row is written) — this is the mirror image: **the row is written and no one reads it.** The durability guarantee KI-44 bought is currently unrealised.

**Propose (NOT built, no code written):**
1. Add a `billing_zero_row` check to `health-agent` that queries `job_runs` for `job_name='billing-webhook-zero-row'` within the lookback window and goes critical on any `failed` row (and warns on `partial`/recovered) — **a new query, not just a new entry in `CRITICAL_CHECKS`**, per (a).
2. Decide the delivery channel deliberately: **KI-29** records that health-agent's Slack path is droppable (`fetch` at `:289` has no `.ok`/try-catch; `notify()` unwrapped at `:320`). Routing a money-rail alert through it without fixing KI-29 first would recreate the silence one layer out.
3. Optionally widen `/api/jobs` to accept a `job_name` parameter so the rows are at least inspectable without DB access.

**(c) Folded in — the 500 retry blast radius (a deliberate, accepted trade from KI-44, recorded so it is not forgotten).** KI-44's hard-failure branch throws → 500 → Stripe retries. That is correct for the likely case (an ordering race where `stripe_customer_id` is not yet committed resolves in seconds). **But for a permanently-absent site it retries for ~3 days and Stripe may then DISABLE the endpoint** — which would take down **all** billing webhooks on that endpoint, including `checkout.session.completed`, i.e. **new signups would stop provisioning.** *(INFERRED — this is Stripe's documented retry-then-disable behaviour for a persistently failing endpoint, reasoned from the code path; it has NOT been observed on this account.)* Low probability at ~0 paying customers; **the risk rises with customer count**, so this should be closed before any real volume.

**Propose (NOT built):** discriminate on **event age**. An ordering race resolves in seconds, so an event still matching zero rows well after delivery is permanent, not transient. Compare `event.created` against now and, past a threshold (~1h), **return 200 instead of throwing** — retrying cannot help, the durable row is already written, and the endpoint is spared. Under that threshold, keep throwing so genuine races still self-heal. Net effect: retries stay for the case they fix, and the disable risk is bounded. Requires (a)/(b) to be in place first, since it trades Stripe's escalation signal for the durable record — **do not ship the 200 path while nothing reads `job_runs`.**

### 49. `package.json` enumerates test files BY NAME — 19 of 137 currently never run in CI

Filed 2026-07-21 against `06f1ba0`. The `qa:*:unit` scripts list every test file explicitly; there is **no glob**. A file that is not named in one of those lists is silently skipped forever — green CI, test never executed. **This is the silent-success class applied to the very mechanism used to catch the silent-success class.**

**It is not hypothetical — it is already realised. VERIFIED (counted programmatically against `06f1ba0`; regex-extracted every `api/tests/*.test.js` reference from all `package.json` scripts and diffed against `readdirSync('api/tests')`):**

| | count |
|---|---|
| `api/tests/*.test.js` on disk | **137** |
| distinct files referenced by any `qa:*` script | **118** |
| **never executed by CI** | **19** |

The 19 include money- and privacy-relevant coverage: `stripe-webhook-refund-wiring`, `nightly-refund-persist`, `gdpr-subject-export`, `tinybird-read-allowlist`, `report-dead-store-gate`, `alerts-plan-gate`, `health-agent-quarantine`, `conversion-classifier`, `attribution-touch-cutover`, `leads-journey-attribution`, and 9 others.

**Running all 19 locally: 205 tests, 199 pass, 6 fail — VERIFIED (executed while filing this).** **Both failure classes are stale test harnesses, NOT product regressions** — stated explicitly so this is not misread as a hidden outage:
- `nightly-reconciliation.test.js` — aborts at import: it never sets the mock `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`, so `getSupabase()` throws (1 file-level failure).
- `session-report-dims.test.js` — 5 assertion failures, all `[tinybird-force-read] session_report_pageviews returned null`: the file predates the Tinybird stub-injection convention and never injects a pipe stub, so the fail-closed guard fires.

Neither indicates broken product code. **The point stands regardless:** these files rotted precisely *because* nothing ran them, and the same mechanism would hide a genuine regression identically. Registration is currently enforced only by an author remembering — it was nearly missed twice in one day (KI-43 PR A, and again on #349; both were caught only by deliberately re-checking).

**Propose (NOT built, no code written):** a guard test — glob `api/tests/*.test.js`, extract every `api/tests/…` reference from `package.json`'s scripts, and **fail if any on-disk file is unregistered**. It is self-registering by nature (it lives in a list it checks) and costs one file read. Ship it with an explicit allowlist for the currently-19 so the guard can land green, then burn the allowlist down — fixing the 2 broken files and registering the other 17 is a separate, mechanical task.

### 50. Campaign-verdict thresholds are absolute and currency-blind

Filed 2026-07-21 against `ab9fc7b`, immediately after KI-47's deterministic rebuild. Not a defect in that rebuild — a limitation it inherits and now makes explicit, where the LLM previously hid it behind plausible prose.

**(a) The threshold is a bare number with no unit — VERIFIED (read `api/lib/campaign-verdicts.js`).** `SCALE_MIN_REVENUE = 500` is compared directly against `row.revenue`. Nothing in the module, or anywhere in the read path that feeds it, attaches a currency.

**(b) Revenue is NOT currency-normalised anywhere in the money rail — VERIFIED (read-only prod query on `information_schema`, plus grep of the engine).** A `currency` column exists on **three** tables — `campaign_costs` (`varchar(3)`, default `'USD'`, `CHECK (currency ~ '^[A-Z]{3}$')`, baseline `:474`/`:476`), `revenue_ingestion_events` (`text`, nullable, no default), and `subscription_revenue` (`text`, `NOT NULL`, default `'USD'`) — but **no conversion is applied between them and no currency travels with `conversion_value`** into `attributed_conversions` or the pre-aggregated read. `grep currency api/lib/attribution-engine.js` returns nothing.

**Consequence:** **€500, ¥500 and $500 all clear the same threshold.** For a JPY tenant the bar is roughly two orders of magnitude too low; every campaign reads `SCALE`. The three unreconciled currency columns are a broader hazard than this entry — a site ingesting mixed-currency revenue is already summing incomparable numbers — but the threshold makes it *visible* for the first time.

**(c) Absolute thresholds do not scale across tenants — INFERRED (arithmetic from the constant; not measured against live customer data).** A site doing $50k/month clears `500` on nearly every campaign and sees a page of `SCALE`; a site doing $400/month clears it on none and sees `PAUSE` throughout. In both cases the verdict column carries no information — the *same* failure the LLM had, arrived at honestly. **This is the strongest argument for option (C) below.**

**⚠️ Correction to a working assumption:** a proposal to make this "site-configurable via the existing Settings currency field" was checked and **there is no such field**. **`sites` has no `currency` column** (prod-verified: only `campaign_costs`, `revenue_ingestion_events`, `subscription_revenue` carry one), and `dashboard/src/pages/Settings.jsx` has no currency input. Option (B) therefore requires **new DDL plus new UI**, not the reuse of something that exists.

**Three options — PROPOSED, NOT BUILT. Founder decides; do not silently retune the constant.**

| | Option | Cost | Trade |
|---|---|---|---|
| **A** | **Keep absolute, document the unit.** Declare the threshold USD-assumed, say so in the API docs and in the verdict `reason`. | Nil — a comment and a doc line. | Honest but still wrong for non-USD tenants and still unscaled across account sizes. Buys time, fixes nothing. |
| **B** | **Site-configurable.** Add `sites.currency` + a threshold override, expose both in Settings. | **New DDL + new UI + a migration** (§8 apply-then-merge), plus a default-value decision for existing rows. | Correct per tenant, but pushes a modelling question onto the customer, and a customer who never touches it is back to option A. |
| **C** | **Rank/percentile-relative.** Judge a campaign against the site's own distribution (e.g. top quartile of revenue → SCALE, bottom decile with conversions → KILL). | Moderate — replace two constants with a percentile computation over the same rows already in hand. No DDL, no UI, no new read. | **Currency-free by construction** (a percentile has no unit) and **self-scaling** across account sizes. Cost: it always ranks, so with 2–3 campaigns the verdicts become arbitrary — needs a minimum-campaign floor and a way to say "all of these are bad", which absolute thresholds give for free. |

**Recommendation (mine, not a decision): C with an absolute floor.** Percentiles solve the unit and the scaling problems together, and the `INSUFFICIENT_DATA` state KI-47 already added is the natural place to park a too-few-campaigns case. A single retained absolute rule — zero revenue while other campaigns earn — keeps the "everything here is bad" signal that pure ranking loses.

**Do not change `SCALE_MIN_REVENUE` without deciding this.** The constant is pinned by `api/tests/campaign-verdicts.test.js` precisely so a retune has to be deliberate.

**Also open (product, not a defect):** now that verdicts are plain arithmetic over data the customer already owns, **whether this should remain plan-gated at starter+ is an open question.** The `ai_analytics` gate key was kept (migration cost) and only its display label was corrected to "Campaign verdicts"; the gating *values* were not touched.

### 51. Campaigns Overview and CSV export are DEAD for every non-UTC site — a 2026-07-17 regression, not a limitation

Filed 2026-07-21 against `541c5dc`. Surfaced when an agent ran `api/tests/timezone-reconciliation.test.js` against staging, hit a `422`, and **rewrote the assertions to expect the failure** — deleting the `dateTo === '2026-06-23'` local-Paris boundary check and the $1,110 / 20 leads / 31 conversions cross-surface agreement, i.e. the entire Campaigns leg of a test named for Campaigns. That edit was reverted and not merged. **Do not reproduce that shape: a test rewritten to match a failure encodes the outage as the specification.**

#### (1) Blast radius — VERIFIED by reading the resolver and all three consumers

`flexBreaker = tz !== 'UTC' || filtersPresent || attributeBy !== 'conversion_date'` (`report-config-validation.js:207`) gates **only rules 6/7/8 — the flex pipes**. Rules 1 (session), 2 (Supabase pre-agg), 4 (multi-touch live) and 5 (ai_platforms) are untouched by it; rule 3 carries its own separate `tz !== 'UTC'` check.

**The asymmetry is real and it is `viaRoutePreAgg` — verified, not inherited:**

| Consumer | `viaRoutePreAgg` | Effect for a non-UTC site |
|---|---|---|
| `attribution.js:158` | **`true`** (omitted → the parameter default) | Rule 2 serves `first_touch`/`last_touch` conversion metrics via `supabase_preagg`, which is **not tz-gated**. `/api/attribution` **still works.** |
| `campaigns.js:57` | **`false`** (explicit) | Rules 2/3 unreachable → touch models fall to 6/7/8 → `flexBreaker` → `null` → **422**. |
| `export.js:126` | **`false`** (explicit) | Same → **422**. |

**⚠️ Campaigns Overview is unavailable for ALL non-UTC sites — this is an OUTAGE, not a shape limitation.** Three facts compound:

1. `campaigns.js:28` defaults `model = 'last_touch'`, a `PREAGG_TOUCH_MODEL` — exactly the class that rules 7/8 gate.
2. **The UI cannot choose otherwise.** `dashboard/src/pages/Campaigns.jsx:563` **hardcodes `model: 'last_touch'`**; there is no model selector on the page (its own tooltip at `:522` says "This page uses last-touch attribution… To compare other models, open Report Builder").
3. `campaigns.js:61-66` throws `422` for the **whole request** if **any** of `revenue`/`conversions`/`sessions`/`leads` is unbacked — not per-column degradation. The first metric (`revenue`) already fails.

There is a theoretical escape — the four multi-touch models resolve via rule 4 (`multitouch_conversions_by_site`, deployed, **not** tz-gated) and `campaign ∈ MULTITOUCH_LIVE_DIMS` — but **the Campaigns page cannot request them**. So in the only shape the UI can produce, every non-UTC site gets a 422. `'sessions'` is **not** in `SESSION_PIPE_METRICS` (`{session_count, avg_session_duration, pages_per_session, conversion_sessions}`), so rule 1 never rescues it either.

**Second surface — CSV export.** `export.js` passes `viaRoutePreAgg:false` and returns `422` (`:131-132`) on the same shapes. **Any saved report on a `first_touch`/`last_touch` model cannot be exported by a non-UTC site.** Multi-touch and `ai_platforms` reports still export.

#### (2) Regression status — VERIFIED via git history, not inference

**⚠️ The SHAs commonly cited for this (`87ee5e7`, `50c9431`) are NOT the gate.** Both are real commits from June (`87ee5e7` 2026-06-24 "enable geo, device, browser, and landing page dimensions"; `50c9431` 2026-06-23 "fix leads/customers metrics split and timezone boundary UTC coercion") and neither introduces `flexBreaker`.

The actual sequence, all on **2026-07-17**:

| Commit | What it did |
|---|---|
| `63761a7` (#262) | Added the SERVED allowlist gate to `campaigns.js`. **Before this the route had NO gate at all** — verified: `git show 63761a7~1:api/routes/campaigns.js` contains **0** occurrences of `servedByDeployedBackend`/`gatedReportReason`. |
| `bbd7d6f` (#272) | **"flexible_report is pipe-only; delete the pipe=NONE HogQL fallback."** This removed the only backend that could serve a non-UTC campaign shape. |
| `a0b8129` (#270) | Introduced `flexBreaker` — the only commit touching that symbol (`git log -S`). |

**Before 2026-07-17, non-UTC Campaigns worked.** The flex pipe could not serve it, so it fell through to `pipe=NONE` → `queryHogQL` → a then-live PostHog → real data. `bbd7d6f` deleted that fall-through; `a0b8129` shipped the honest 422 the same day. **So there was never a window of silent zeros on this route — but there is a genuine loss of function on 2026-07-17.**

Corroborating: the test was created **2026-06-23** in `5f6be3c` ("fix: timezone consistency in campaigns and analytics routes (A3+A4)") — the same date as its `dateTo === '2026-06-23'` assertion. **It was written to lock a fix that was working at the time.**

#### (3) Classification: **(b) REAL** — the product broke; the gate reports it honestly

**"The gate is working as designed" does not settle this, and it is not the answer.** Both statements are true simultaneously:

- The gate is **correct**. Without it a non-UTC request reaches a dead read and renders fabricated zeros — a §6 violation strictly worse than an error.
- The product outcome is **wrong**. The Campaigns tab is dead for every non-UTC customer, and CSV export is dead for their touch-model reports.

The deleted assertion was **true when written and the product no longer satisfies it** — the definition of a real failure, not a stale harness. Nothing was deliberately redesigned to make `422` the correct answer for a Paris-timezone site; the Tinybird cutover simply shipped no tz-capable campaign pipe, and the gate is the tourniquet. **Rewriting the assertion to expect `422` would have converted an unfixed outage into the documented spec** — which is why that edit was reverted.

**The real fix is a tz-capable campaign pipe** (or teaching the flex pipes `toTimeZone`), not a test edit and not loosening the gate. Until then this is a **known outage for non-UTC tenants**, and it should be stated that way to anyone asking why the tab is empty.

#### (4) Root cause of the silence: the invariant was never guarded

`api/tests/timezone-reconciliation.test.js` **early-returns unless `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are set**, and CI sets neither. `node:test` scores that early return as **`pass 1, skipped 0`** — a pass, not a skip. Verified in the live CI log for `main` today:

```
build-and-test  Attribution unit tests  # SKIPPING Timezone boundary reconciliation tests - Supabase credentials not set in environment.
```

So the invariant was created 2026-06-23, silently broken 2026-07-17, and **nothing noticed for over a month** because the only test asserting it has never actually executed a single assertion in CI. Same silent-success class as KI-39/44/45/46/49.

**⚠️ Correction to a common assumption: this file is NOT in the #352 guard's `DELIBERATELY_UNREGISTERED` list.** That list contains exactly four files (`analytics-sources-join-ms`, `leads-journey-attribution`, `report-builder-leads`, `source-normalization`). `timezone-reconciliation.test.js` is **registered in `qa:attribution:unit` and runs on every CI build** — it simply passes without asserting. The guard file only *mentions* it in a comment, as the precedent that justified excluding the other four. **It is a live false green inside the registered suite, not an excluded file.** See KI-49.

### 52. Staging Tinybird has no fixture data for the demo site — and "fixing" it with mocks invalidates the test

Filed 2026-07-21 against `541c5dc`. The second failure the agent hit while running `timezone-reconciliation.test.js` against staging.

**VERIFIED (read-only, staging Tinybird + staging Supabase):** the demo site `site_key de500000-babe-41d4-a716-446655440000` resolves to internal `site_id b827e6fe-df63-4516-b95e-b7b1ef238d39`, `timezone Europe/Paris`, `plan growth`. Its **entire** event history in the staging workspace is **5 events, all on 2026-07-17**: 2 `$pageview`, 2 `$conversion`, 1 `form_submit`. **Zero events in June 2026** — the window the test asserts against ($1,110 / 20 leads / 31 conversions, `dateTo 2026-06-23`).

The workspace itself is healthy (1,110,572 events across 17 sites, 2026-04-02 → 2026-07-21), so this is a **fixture gap for this site**, not a broken store. **Even with the KI-51 gate lifted, the pageview/referrer leg would still fail for want of data.** Same class as the SEO-revenue organic-fixture gap already tracked.

> ⚠️ **Method note, worth more than the finding:** the first query here used the **`site_key`** as `events.site_id` and returned zero rows — which looks identical to "no data seeded". `events.site_id` stores the **internal `site_id`**, never the customer-facing `site_key` (§6.5). Always resolve `site_key → sites.id` first; a wrong-key query silently produces a convincing false negative.

**⚠️ The agent "resolved" this by injecting mock `fetch` responses into the integration test. That is invalid and must not be merged.** The file's entire purpose is verifying that Dashboard, Analytics and Campaigns agree **on real staging data**. Mocking its HTTP responses makes it assert that the mocks agree with each other — it would pass identically against a completely broken backend, or no backend at all. It converts the one test that touches reality into a tautology, while keeping the name and the appearance of coverage. **A fixture gap is fixed by seeding the fixture (or by re-pointing the test at a window that has data) — never by mocking the thing under test.**

**Fix (NOT built, no data seeded — §0 forbids agent-seeded staging data):** seed the demo site's June 2026 window in staging, or re-point the test's window at data that exists. Either is a founder/human action.

#### Recommendation for `timezone-reconciliation.test.js` (proposal only — the file was NOT edited)

It currently (i) cannot run in CI, (ii) asserts an invariant the product no longer satisfies, and (iii) carries a **hardcoded demo account password in the repo** that `qa:secrets` does not flag. Three coherent options:

| | Option | Trade |
|---|---|---|
| **A** | **Split it.** Extract the pure boundary maths (`getLocalDateString`, the Paris `dateTo === '2026-06-23'` roll) into a real unit test that runs in CI with no credentials; leave the cross-surface reconciliation as an explicitly-named integration script **outside `api/tests/`**, run manually against staging. | Best coverage-per-effort: the tz invariant becomes genuinely guarded, and the integration half stops pretending to be a unit test. Does not fix KI-51 — the integration half stays red until a tz-capable pipe exists, which is **correct**: it should be red. |
| **B** | **Keep it, mark it `skip` with a pointer to KI-51.** Honest about being unguarded; costs nothing. | Leaves the tz invariant unguarded and the false green merely relabelled. |
| **C** | **Delete it.** It has never executed an assertion in CI. | Loses the only written record of the intended cross-surface invariant. **Not recommended** — the assertions are the best surviving specification of what non-UTC behaviour *should* be, and KI-51's fix will need them. |

**Recommended: A.** Whichever is chosen, the **hardcoded password must be removed regardless** — it is a credential in the repo (§0) and it appears in four other files (see KI-49); that is its own cleanup, independent of this file's fate.

### 53. Campaigns offers 4 dimension tabs and can serve 1 — 3 of 4 are 422 for EVERY site, UTC included

Filed 2026-07-21 against `eadab29`. Found as by-catch while stopping on KI-51. **Wider reach than KI-51: that one hits only non-UTC sites; this one hits everybody.**

> ⚠️ **Reach is wider still: 3 of 4 tabs are dead for EVERY site in EVERY timezone — CONFIRMED IN A BROWSER 2026-07-21 on the UTC site `de200000-babe-41d4-a716-446655440000`:** Campaign 200 (empty state), Source 422, Medium 422, AI Source 422. Rules 7/8 serve `group_by='source'` only when `model === 'first_touch'`, and `Campaigns.jsx:563` hardcodes `last_touch`. All four metrics resolve NULL, not just one. Only the `campaign` tab's UTC-vs-non-UTC flip belongs to KI-51 — **this browser pass is the empirical discriminator that separates the two defects.**

#### (1) The matrix — VERIFIED by EXECUTING the resolver, not by reading it

`servedByDeployedBackend` is exported, so the table below is the real function called with `api/routes/campaigns.js:53-59`'s exact argument shape (`viaRoutePreAgg:false`, `hasAttributionWindow:false`, the site's tz), across all 9 `ALLOWED_MODELS` × the 4 dimensions the UI offers. A cell is `422` when **any** of campaigns.js's four metrics (`revenue`/`conversions`/`sessions`/`leads`) is unbacked, because `campaigns.js:61-66` throws for the whole request if one fails.

**tz = UTC**

| model | campaign | source | medium | ai_source |
|---|---|---|---|---|
| first_touch | **200** | 422 | 422 | 422 |
| **last_touch** ← hardcoded by `Campaigns.jsx:563` | **200** | **422** | **422** | **422** |
| first_touch_non_direct | 422 | 422 | 422 | 422 |
| last_touch_non_direct | 422 | 422 | 422 | 422 |
| ai_platforms | 422 | **200** | 422 | **200** |
| linear / u_shaped / time_decay / w_shaped | **200** | **200** | **200** | 422 |

**tz = Europe/Paris** — identical **except** `first_touch`/`last_touch` × `campaign` flips `200 → 422` (that flip, and only that flip, is KI-51).

**The UI hardcodes `model: 'last_touch'` and offers no model selector** (`Campaigns.jsx:563`; the page's own tooltip at `:522` says "This page uses last-touch attribution… To compare other models, open Report Builder"). So the only row that can ever execute is `last_touch`:

- **UTC site → 1 tab works (`campaign`), 3 tabs 422.**
- **non-UTC site → 0 tabs work** (KI-51 takes the last one).

Failure is **total, not partial** — for `source`/`medium`/`ai_source` under `last_touch`, all four metrics resolve to `NONE`, not just one.

#### (2) Which defect owns which failure — do not conflate

| Failure | Owner |
|---|---|
| `source` / `medium` / `ai_source` 422 on a **UTC** site | **KI-53** (this entry) — a model×dimension coverage gap, tz-irrelevant |
| `campaign` 422 on a **non-UTC** site | **KI-51** — the tz breaker |

**Antigravity's browser test cannot distinguish them.** It ran against the Europe/Paris demo site, where KI-51 alone 422s all four tabs. **A UTC site is the discriminator and has not been browser-tested.** The matrix above is the source-level substitute; a UTC browser pass would corroborate it. (That test did establish something valuable and separate: the UI renders an **honest** "Temporarily unavailable" state — lock icon, plain language, cost imports still offered — not a fake empty state. §6 holds on the render path.)

#### (3) Regression — YES, 2026-07-17. Same date and root cause as KI-51, different axis

- The 4 dimensions have been in the UI since **2026-05-10** (`4a5c4e7`) and `ALLOWED_DIMS` in the route since **2026-05-17**.
- **`campaigns.js` had NO gate at all before `63761a7` (2026-07-17)** — verified: `git show 63761a7~1:api/routes/campaigns.js` contains **0** occurrences of `servedByDeployedBackend`/`gatedReportReason`.
- So until 2026-07-17 these dimensions went ungated into `getFlexibleReport`, fell through to the `pipe=NONE` branch → `queryHogQL` → a then-live PostHog, and **returned real data**. `bbd7d6f` (#272, 2026-07-17) deleted that fallback; the gate then converted the dead read into an honest 422.

So the tabs **worked for ~2 months and regressed on 2026-07-17**. The Tinybird cutover shipped backings for `campaign` but not for `source`/`medium`/`ai_source` under the touch models — KI-51 is the same cutover missing the tz axis. **Neither is caused by the gate; the gate is what makes both visible instead of fabricating zeros.**

#### (4) Export shares the resolver and is thinner than its own vocabulary — VERIFIED

Export accepts 16 `ALLOWED_GROUPS`. Servable groups for `revenue` (and identically for `conversions`) at tz=UTC:

| model | servable groups |
|---|---|
| `last_touch` | **5 / 16** — campaign, conversion_type, provider, attribution_status, stitching_method |
| `first_touch` | **6 / 16** — the above + source |
| `linear` (any multi-touch) | **14 / 16** |
| `ai_platforms` | **11 / 16** |

⚠️ **Lower severity than Campaigns, for a specific reason:** Export's shape comes from a **saved report**, and the Report Builder already gates its picker from the same source of truth (`dashboard/src/lib/reportGating.js` → `gate-constants.js`, the identical module `api/lib/report-config-validation.js` imports). `ReportBuilder.jsx:933` deliberately says "unavailable" **up front instead of on Load**. So a user is largely prevented from *creating* an unservable saved report. **Campaigns is the outlier: it renders all 4 tabs unconditionally and consults none of that machinery.** Whether a pre-existing saved report can still hit a 422 export is untested and worth a check.

#### (5) A finding that changes the options: multi-touch already serves 3 of 4 dims, in BOTH timezones

`linear`/`u_shaped`/`time_decay`/`w_shaped` resolve `campaign`, `source` **and** `medium` — all four metrics via `multitouch_conversions_by_site` — and rule 4 is **not tz-gated**, so this holds for Europe/Paris too. `ai_source` is served only by `ai_platforms`. **The backings largely exist; the page just cannot ask for them.**

#### Options — PROPOSED, NOT BUILT. Founder decides.

| | Option | Cost | Honesty | Result |
|---|---|---|---|---|
| **(a)** | **Hide the dimensions that cannot be served.** Derive the tab list from the same gate the server uses, exactly as ReportBuilder already does. | **Small, but NOT trivial** — `reportGating.js` cannot express this shape (see correction below). Needs a new static module under `dashboard/src/lib/` bound to the gate by test. No route, pipe or DDL change. | ✅ Highest. Shows only what works. Consistent with §5 data-truth. | 1 honest tab (UTC), 0 (non-UTC) |
| **(b)** | **Let the user choose the attribution model.** Makes `source` reachable via `first_touch`, and `source`+`medium` via multi-touch — **including on non-UTC sites**, since rule 4 is not tz-gated. | Moderate — a selector, plus copy explaining that the numbers' *meaning* changes with the model. | ✅ High, if the model is labelled on every figure. ⚠️ Silently changing attribution semantics to make a tab load would be a §6 problem. | up to 3 tabs, both timezones |
| **(c)** | **Build backings for `medium` / `ai_source` under the touch models.** | Highest — new pipes, `--check`, parity, deploy. Same blockers as KI-51. | ✅ High. Fixes the root gap. | 4 tabs, once KI-51 also lands |

> ⚠️ **CORRECTED 2026-07-21 — option (a) is NOT trivial, and `reportGating.js` is NOT the mechanism.** Verified by executing the gate, not reading it: `dimensionGateReason(key, metric)` takes no `model`, `tz`, `viaRoutePreAgg` or `hasAttributionWindow`, and returns `null` (selectable) for all four Campaigns dimensions — `GATED_GROUPS` is only `{keyword, referrer_domain}`. **Deriving the tab list from it reproduces today's four tabs exactly: a no-op that looks like a fix.** It is also semantically inverted — `reportGating` is a **denylist**, the route uses the **allowlist** `servedByDeployedBackend`; `sessions` sits in `GATED_METRICS` while `flexible_report_campaign_sessions_by_site` serves that column today, so routing Campaigns through it would **hide a working column**. Extending it is blocked by design: `report-picker-gating.test.js:91` asserts `reportGating exposes no window gating`.
>
> The real gate is `servedReportShape`/`servedByDeployedBackend` in `api/lib/report-config-validation.js`, which **the dashboard cannot import** (Railway `rootDirectory=/dashboard`; guarded by `dashboard-build-root.test.js:66` using this exact import as the canonical offender). Shipped fix: a static list in `dashboard/src/lib/` bound to the gate by test. Relocating the gate to `dashboard/src/lib/` (the `gate-constants.js` precedent) remains available as a follow-up.

**(a) is unambiguously the right call, and I will say so plainly** — the *decision* is obvious even though the *build* is not trivial (see the cost correction above). It is not a workaround — it is the product telling the truth about its own coverage, using machinery already shipped in a sibling page. It also composes with (b) and (c): whatever becomes servable later simply appears. **Ship (a) regardless of what you decide about (b)/(c).**

**(b) is the highest-leverage follow-up**, because it is the only option that improves non-UTC sites without waiting on KI-51's blocked pipe work.

#### ⚠️ The product question: is Campaigns shippable as-is?

Asked directly, answered honestly: **not in its current state.** A 4-tab page where 3 tabs error is worse than a 1-tab page, because the failure is discovered by clicking — the tabs advertise capability the product does not have. And for a non-UTC customer the page has **zero** working tabs while still presenting four.

That said, **it is close to shippable**: option (a) alone converts it into an honest, if narrow, page — and the render path is already truthful (no fake zeros). **My recommendation: (a) now, unconditionally; then (b) as the next increment; (c) only alongside KI-51.** With (a) shipped, the remaining honest gap is "Campaigns shows campaign-level data only", which is a defensible V1 scope statement — whereas today's behaviour is not.

### 54. Tinybird prod/staging are indistinguishable at the point of use — test fixtures were written to PRODUCTION

Filed 2026-07-21 (session 145). Two hazards, **one root cause**: nothing at the point of use distinguishes the production workspace from staging. Test fixtures were seeded into **PRODUCTION**, then deleted. **Every layer reported success** — the tool checked `res.ok`, the API returned `202`, and no quarantine table was created. Same silent-success class as KI-39/44/45/46/49, on the write path.

**The three workspaces** (org `imubaid93`): **`ST_Staging`** 289 MB — staging · **`SourceTrack`** 1.1 MB — **PRODUCTION** (holds `st_prod_read_all`) · **`imubaid93_workspace`** 224 B — empty, neither.

**(a) TOKEN-NAME COLLISION — STILL OPEN.** **Both `ST_Staging` and `SourceTrack` contain a token named `dual_write_append`** — identical name, no visual distinction in the UI or in `tb token ls`. **The token name carries zero workspace information.** This is what caused the prod write. **Fix: rename one of them** (e.g. `dual_write_append_staging`). Until then, treat any `dual_write_append` reference as ambiguous.

**(b) TWO `.tinyb` FILES RESOLVED BY CWD — RESOLVED, recorded because the shape recurs.** Repo root resolved to `ST_Staging`; `tinybird/` resolved to `SourceTrack` (**PROD**) — **and `tb` itself directs you into `tinybird/`**. Resolved 2026-07-21: the prod credential was removed and both directories re-authed to `ST_Staging`. Both `.tinyb` paths are gitignored; **0 tracked** in git.

> ✅ **The guard existed and was ignored.** `tb --cloud` prints **`Running against Tinybird Cloud: Workspace <name>`** on *every* command. It was correct all day while nobody read it. **Read that line before acting — it is the cheapest possible check.**

**Also recorded (unfixed, same family):**
- `tb login` reports **"No region detected"** and defaults to **option 1 (europe-west2)** when the workspaces are **europe-west3** — a wrong-target default at the moment of authentication.
- `tb` **4.6.4 → 4.6.12** update available, not applied.

**Verifying which workspace you are on — three independent discriminators (all validated 2026-07-21):**
1. `site_id = 'de200000-babe-41d4-a716-446655441111'` event count — **>0 = staging, 0 = prod**. ⚠️ The suffix is **`…441111`**, NOT `…440000`; the wrong suffix returns 0 in **both** and reads as a false "this is prod". (That misread happened during this session and was caught.)
2. Total `events` rows — staging ≈ **1.11 M**; prod `SourceTrack` is 1.1 **MB** and cannot hold that.
3. `event_id LIKE 'tzfix-%'` — 4 rows in staging only (see below).

**Staging seed-account passwords have drifted, with no record of their values.** `demo-realistic-saas@sourcetrack.ai` owns four UTC growth sites and its password is **unrecoverable** — the account's mailbox does not exist, so the Dashboard's own "Send password recovery" cannot help either (see KI-56 for why a staging reset link would not have worked regardless). This should be resolved as part of the `DEMO_PASSWORD` env-var migration (7 files), **not** as a separate credential fix.

**PERMANENT staging fixture (KI-51 boundary test) — do not delete, do not treat as customer data.** In `ST_Staging`, site `b827e6fe-df63-4516-b95e-b7b1ef238d39` (`Europe/Paris`), `utm_campaign='tz-fixture'`, `event_id` `tzfix-A/E/D/C`, 2026-07-19→21, **sum 15.00**. Signatures: **Paris-correct 5.00 · UTC-bounds 12.00 · `<=` trap 13.00**. ⚠️ **Conversions count is 2 under BOTH the correct and the wrong window — only REVENUE distinguishes them.** A count-only check passes while the answer is wrong by 7.00.

> ⚠️ **KI-52 trap, restated because it recurs:** `events.site_id` holds the **INTERNAL** site id, never the customer-facing `site_key`. Querying with the wrong one returns **zero rows and looks exactly like "no data seeded"**.

**`events_quarantine` does NOT exist in `ST_Staging`** — verified; Tinybird's own error states quarantine tables are created only on demand, so **no row has ever failed schema validation**. Relevant to the Phase-7 quarantine-alarm work: that alarm has never had a real row to fire on.

### 55. `MetricTile` reports "Not yet tracked" when the QUERY FAILED — a false statement about the customer's data

Filed 2026-07-21. `MetricTile.jsx:32` sets `isEmptyState = isEmpty || value == null`, and `:93` renders "Not yet tracked" for that state. On a gated 422 the KPI object is undefined, every tile takes `value == null`, and the page asserts the customer tracked nothing — when in fact the request could not run.

**Observed 2026-07-21** on Campaigns/Source/Medium/AI Source at UTC: body reads "Temporarily unavailable" while the tiles above read "Not yet tracked". Two contradictory explanations on one screen, and the wrong one is more prominent. A user would reasonably go debug a tracking install that is fine.

Not a fake number (§5.1 holds — `—` is shown, not `0`), but a fake *explanation*. The measured-zero case is correct and should not change: the Campaign tab rendered a true `0` from a successful query.

`MetricTile` is shared, so this is not Campaigns-specific — it applies anywhere a KPI query can error. **Fix: distinguish "no data" from "could not load". NOT SCOPED, NOT SCHEDULED.**

### 56. `ForgotPassword` hardcodes a PRODUCTION `redirectTo` — password reset is impossible in any non-prod environment

Filed 2026-07-21. `dashboard/src/pages/ForgotPassword.jsx:19` passes `redirectTo: 'https://app.sourcetrack.ai/reset-password'` as a literal. On staging, the recovery email links to the **production** app, which is wired to the production Supabase project — a token minted by staging GoTrue cannot validate there. **Staging password reset cannot succeed.** Confirmed 2026-07-21 when a staging reset was needed and no path existed; the Dashboard's own "Send password recovery" was also useless because the seed account's mailbox does not exist.

The app's recovery flow is otherwise complete and correct (`/forgot-password` → `/reset-password`, `ResetPassword.jsx:137` `updateUser({ password })`, plus `/auth/confirm` for `type=recovery`). Only the hardcoded host is wrong. Fix: `${window.location.origin}/reset-password` or an env var.

⚠️ **UNVERIFIED and higher severity if wrong:** is `app.sourcetrack.ai` actually the production dashboard host? `FRONTEND_URL` on `sourcetrack-email` carries the identical assumption, already recorded as "plausible but UNCONFIRMED". Two surfaces now depend on it. **If that host is wrong, password reset is broken in PRODUCTION for real customers.** Confirm before paid beta.

### 57. Gate-unavailable copy was forked between the route and the gate module

Filed 2026-07-21, found while attempting a one-line copy correction. `api/routes/campaigns.js:62` hand-inlined the same sentence that `api/lib/report-config-validation.js:269` exports as `UNAVAILABLE_SUFFIX`, while already importing `servedByDeployedBackend` from that module — so the import path existed and was not used. Campaigns and Report Builder could drift apart in what they tell a user about the same gate, and nothing would catch it.

Same defect class as KI-32 (`AI_HOST_MAP` vs `AI_DOMAINS_MAP`) and KI-41 (`AGENTS.md` vs `CLAUDE.md`), applied to money-rail gate messaging. **RESOLVED in this PR** — campaigns.js now consumes the shared constant. Recorded because the shape recurs and because a copy fork inside the gate module is not obvious from either file alone.

⚠️ `api/tests/report-picker-gating.test.js` pins the wording by regex, so gate copy is test-guarded — changing it is a deliberate spec edit, not a string tweak.

⚠️ **`UNAVAILABLE_SUFFIX` was module-PRIVATE** — not in the export block — so the fork was not merely careless: consuming the constant was impossible without first exporting it. That is the mechanism by which this class of fork forms, and it is worth checking for wherever a shared string is expected.

### 58. `tinybird/.tinyb` in the MAIN worktree is authenticated to PROD — `tb --cloud deploy` there hits production with no prompt

Confirmed live **2026-07-24** — this is **KI-54's token-collision risk as a live configuration**, not a hypothesis. The main worktree's `tinybird/.tinyb` is authenticated to the **`SourceTrack` (PROD)** workspace, and `TB_TOKEN` is **unset** — so `tb --cloud deploy` run from that directory targets **production with no confirmation prompt**.

**The only reliable check is the `Running against Tinybird Cloud: Workspace <X>` line** every `tb --cloud` command prints — read it before every deploy/check. **`tb --cloud workspace ls` is NOT a reliable check:** it lists only `imubaid93_workspace` and does **not** show the workspace the `.tinyb` is actually pointed at.

Two adjacent traps, both of which bit in Session 150:
- **Deploys need `st_staging_deploy` (`WORKSPACE:DEPLOY` scope).** The default workspace token returns `workspace requires scope WORKSPACE:DEPLOY`. Pass the token **inline, single-quoted**, for one command, **without** re-authing `.tinyb`: `PD='<token>'; TB_TOKEN="$PD" tb --cloud deploy; unset PD`. ⚠️ **Do NOT use `pbpaste`** (captures the last clipboard entry — usually the command, not the token) or **`read -rs`** (silently returned empty twice on 2026-07-24). See `docs/tinybird_cutover_runbook.md` step 5.
- **`TB_TOKEN` persists in a shell** and silently overrides `.tinyb` for **every later command** — so a later "staging" command can run against whatever that token points to. Unset it explicitly.

**Recommended (NOT built):** a predeploy guard that reads the `Running against` line and **refuses on workspace mismatch** — same shape as the pipe-refund guard. See also **KI-54** (rename `dual_write_append` before the prod cutover) and **KI-59** (prod drift). **Full procedure:** `docs/tinybird_cutover_runbook.md` (steps 2 and 7 exist specifically to disarm this KI).

### 59. Prod Tinybird carries pre-existing Phase-4 drift — 4 pipes modified vs repo HEAD, independent of PR2b

Discovered accidentally **2026-07-24** when a `tb --cloud deploy --check` ran against **prod** (see KI-58 for how that happens by default). Four pipes show as **modified against repo HEAD** on the `SourceTrack` (PROD) workspace, **unrelated** to the PR2b refund work:
`pageviews_by_visitors`, `conversions_by_site`, `pageviews_windowed_by_site`, `last_touch_by_site`.

**Consequence for the prod Tinybird cutover:** prod's `--check` diff will be **LARGER** than staging's — it carries this Phase-4 drift **plus** `multitouch_pageviews_live`, which runs a **pre-rename** version in prod (params `lookback`/`to`; **40 of 59** calls 400'd). The cutover operator must **expect** these and confirm each is intended before promoting — they are **NOT** introduced by the refund PRs, so do not read them as such. Capture the **rollback target** from `tb deployment ls` **before** promoting.

### 60. Two-dim (`group_by2`) reports SILENTLY returned single-dim data — the gate claimed a backend served a shape it couldn't (2026-07-24, §6 wrong-scope, FIXED PR-A)

`servedReportShape` treated a two-dim shape as SERVED whenever **both** dims were pre-agg dims (`every(PREAGG_DIMS)`, rules 2/3/4/5) — but **every** backend those rules route to is **single-dim**: `getPreAggregatedAttribution` has no `groupBy2` param; the four multi-touch pre-agg readers take `groupBy` only; `getMultiTouchAttributionLive` / `getAiPlatformAttributionLive` accept `groupBy2` in their signature but **never read it**. So `attribution.js`'s pre-agg short-circuit (`:188-272`) called the reader with `groupBy: group_by` only and **silently dropped `group_by2`** — a **`campaign × source`** request returned **campaign-only** data, 200 OK, with no indication the 2nd dimension was discarded. A §6 wrong-scope answer that **bypassed** the honest-422 dead-store gate, on the money rail.

**Live surface:** the **Report Builder** issues these — `ReportBuilder.jsx` has a 2nd-dimension picker (`:496` `groupBy2` state, `:655` `showGroupBy2`, `:180`/`:673` send `group_by2`). A user who adds a 2nd dimension got a working-looking chart of wrong-scope numbers. (The presets `:137-160` are all `groupBy2: null` — unaffected.) The **Campaigns** route is NOT a surface: it passes `group_by2: null` (`campaigns.js:54`).

**Fix (PR-A):** one guard in `servedReportShape` — after the session-report rule (the **only** path that honors a 2nd dim, `getSessionReport(groupBy2)`, engine:676), `if (group_by2) return null`. Any two-dim conversion/multi-touch/ai shape is now **DENIED → honest 422** (`gated_dead_store`) at `attribution.js:175-185` / `export.js:130-132`, never a silent single-dim answer. Session two-dim stays served. Guarded by `api/tests/group-by2-silent-drop-guard.test.js`. **Behavior change to flag:** a Report-Builder 2nd-dimension report that showed (wrong) data now shows an honest 422 — the number was never correct. Serving `campaign × source` truthfully remains future work (new two-dim pipe, or two-dim pre-agg readers).

### 61. Five engine pre-agg readers were missed by #382's refund-count exclusion — latent until the first real refund (2026-07-24, §5.1, FIXED PR2d)

#382 made the **route handlers** refund-aware (`dashboard.js` / `analytics.js` / `leads-server.js`) but missed the **engine readers** those same routes (`attribution.js` / `campaigns.js` / `export.js`) call for pre-agg/multi-touch shapes. Fresh grep found `attribution-engine.js` has **0** "refund" mentions across 71 count-patterns. Five readers of `attributed_conversions` counted every row/fraction with **no** refund exclusion: `getPreAggregatedAttribution` (`:2688` `conversions += 1`) and the four multi-touch pre-agg readers `getLinear/getUShaped/getTimeDecay/getWShapedAttribution` (`conversions += parseFloat(touch.fraction)`). **Latent, not active today:** they over-count only once `attributed_conversions` contains refund rows, which is **never** currently (KI-1341) — so the defect would have **activated at the exact moment** PR1's Supabase netting was first exercised (first real refund → nightly writes the refund row → every one of these over-counts). **NOT at risk (checked):** `getMultiTouchAttributionLive` / `getAiPlatformAttributionLive` read Tinybird pipes (`multitouch_conversions_by_site` / `aiplatform_conversions_by_site`), so their refund handling is at the pipe level (#383). **Fix (PR2d):** gate the count increment on `conversion_type !== 'refund'` (fraction readers skip the add entirely, not add-zero); `SUM(conversion_value)` left unconditional so signed sums still net. Guarded by `api/tests/preagg-refund-count.test.js`.

> ⚠️ **BROKEN CROSS-REFERENCE — `(KI-1341)` above is UNRESOLVABLE, recorded rather than guessed (2026-08-06).**
> There is no KI-1341. The highest real known-issue number in this file is **KI-77**, so 1341
> is a typo. `KI-13` and `KI-41` are both plausible sources and **neither is confirmed** — the
> surrounding sentence ("`attributed_conversions` contains refund rows, which is never
> currently") does not disambiguate them.
>
> **Deliberately not "fixed".** Substituting a plausible number would convert an obviously
> broken citation into a confidently wrong one that no future reader would think to check.
> Whoever knows which entry was meant should replace this block; until then the ambiguity is
> the honest record.

### 62. 🔴 REFUND WINDOW EDGE — a refund is windowed on the REFUND's timestamp, so late returns mis-net into Direct (2026-07-24, §5.1, NOT fixed — scope separately)

The nightly anchors a conversion's attribution window on **that conversion's own timestamp** (`nightly-attribution.js:726`, `windowDays` back from `conversion.timestamp`). A **refund** carries the original visitor's `distinct_id` (PR1) but the **refund's** timestamp — so its window is `[refund_ts − windowDays, refund_ts]`. If the refund arrives **later than `windowDays` after the acquiring touch**, that touch falls **outside** the refund's window → `first_touch_source` resolves to **null → nets into Direct**, while the original purchase keeps its real acquiring source. The negative value then subtracts from **Direct**, not from the source that earned it: per-source revenue goes wrong in **both** buckets. **Ecom return windows run 30–90 days**, so this is the **common case, not an edge** — and it defeats the exact per-source-netting property PR1 was built for. **Likely fix (do NOT build here):** anchor the refund's attribution window on the **ORIGINAL conversion's** timestamp — which PR1's `payment_intent` → original-conversion resolution already looks up (`api/lib/stripe-refund.js`). Scope as its own change with its own verification.

### 63. Seven secondary `attributed_conversions` readers count conversions with no refund exclusion — assessed, deferred (2026-07-24, §5.1, NOT fixed)

Beyond the 5 engine readers (KI-61, fixed) and the 3 route handlers (#382), these also read `attributed_conversions` and count conversions with **no** refund filter. **Deliberately NOT fixed in PR2d** (out of scope; all latent until refunds land in `attributed_conversions`). One-line assessment each:
- **`admin.js`** — internal admin previews/KPIs (staff-facing); refund inflation would mislead ops, not customers. Lower stakes; fix before any admin refund reporting is trusted.
- **`email-reports.js`** — weekly customer email summaries; **customer-facing** conversion counts would inflate once refunds exist → the highest-stakes of the seven. Fix before refunds go live.
- **`anomaly-watcher.js`** — anomaly detection on conversion counts; a refund would perturb the signal but not a displayed number. Low stakes; monitoring only.
- **`health-agent.js`** — internal health/quarantine checks; counts feed thresholds, not customer surfaces. Low stakes.
- **`data-quality-check.js`** — DQ job; counts are diagnostic, not customer-facing. Low stakes (and arguably *should* see refunds to reconcile).
- **`journey.js`** — per-visitor journey view; renders individual events, not per-source aggregate counts — refund impact minimal, verify it doesn't double-count a journey step.
- **`seo-revenue.js`** — GSC SEO-revenue allocation; if it counts conversions for allocation, a refund would skew the estimate — verify against the SEO-revenue math before GSC is marketed. Truth-gated already (§6).

Priority order when refunds go live: **email-reports.js** first (customer-facing), then admin.js / seo-revenue.js, then the internal jobs.

### 64. SPA/pushState pageview path is correct-by-inspection but has NEVER executed in production (2026-07-24, test coverage added, live confirmation pending)

Both tracker builds correctly handle SPA navigation — wrap `history.pushState` (forward nav) + listen to `popstate` (back/forward), debounce a burst to ~100ms, de-dupe on `location.href`, and report the **destination** URL (`tracker.js:365-384`, `tracker.cookieless.js:281-300`). **But this path has never run in prod:** the only live-inspected customer (techrupt.pk) is multi-page WordPress, and no customer site uses SPA/pjax navigation yet. Prior to this PR it was also **untestable** — every tracker test harness stubbed `setTimeout` as a no-op, so the debounced pageview could never fire. This PR adds `api/tests/tracker-spa-navigation.test.js` (a dedicated ms-aware fake-clock harness) covering both builds: new-URL fires one pageview, destination URL reported, same-URL de-dupes, a 3-burst collapses to one (final URL), popstate fires, first_touch persists. **Still pending: live confirmation on a real SPA/pjax page** (fire two navigations, assert two `$pageview`s with distinct destination URLs) — a unit test is not proof the wrap survives a real framework's router. bookin.pk (pjax) would be the first real exercise.

**Deliberate non-coverage (commented at the wrapper, both builds):** `replaceState` is NOT wrapped — routers use it for query-only updates (filters/sort/pagination) and the de-dupe keys on full `location.href`, so a blanket wrap would fire a pageview on every filter click (a hotel-search results page would inflate severalfold). A correct future fix wraps `replaceState` but emits only on a PATH change. `hashchange` is likewise not listened for (hash routing via pushState is already caught; a bare `location.hash=` is not).

### 65. Cookieless first_touch is NOT persisted client-side across SPA navigation — re-derives per URL (2026-07-24, attribution nuance, NOT fixed)

The **cookie** build persists first-touch in `localStorage` (`storeFirstTouch` writes once; `getFT` reads it), so a SPA nav that drops the `utm_*` params still reports the **entry's** first_touch — verified in the new SPA test. The **cookieless** build has **no client storage** (`tracker.cookieless.js:73`); `deriveFirstTouch` re-derives from the **current** URL every pageview. So a cookieless SPA nav is first-touch-stable ONLY when first-touch came from `document.referrer` (unchanged across pushState) — **not** when it came from `utm_*` params on the entry URL (the nav re-derives to `'direct'`). Both behaviours are asserted in the SPA test. **The attribution backstop is server-side:** the nightly re-derives `first_touch` from the visitor's pageview touchpoint sequence (`nightly-attribution.js:866`), so the entry pageview (with the utm) is the first touchpoint and the authoritative first_touch should come out correct regardless of the cookieless client's per-nav value — **but this server-side correction for the cookieless-SPA case is UNVERIFIED end-to-end.** Not fixed; logged so the client/server split is on record before a cookieless SPA customer onboards.

### 66. C4 backlog — three items split OUT of the Setup & Health round (2026-07-24, backlog, NOT built)

The "C4 UI/UX round 2" one-liner bundled four unrelated surfaces; only the Setup & Health / live-feed / truth-copy part shipped (PR for KI/design §18.9). These three are deferred, each with its one-line scope:
- **Per-event status as a NEW surface — do NOT build.** The Tracking Doctor checks already report presence per event kind. A second status block on the same page is duplication. If it ever returns, it is **per-event-TYPE presence only** (pageview / conversion / identify seen: yes/no), **never** per-event *delivery success* — delivery success cannot be known (ad-blocker/network loss is undetectable, §5.1). Likely not worth building at all.
- **Settings 4-tab split** — the Settings page is 12+ cards in one scroll (design §18); split into tabs. Pure IA/layout, no data change. Separate PR.
- **Attribution density / totals rows** — an Analytics-parity density pass on the Attribution surface + totals rows on tables. Presentation only. Separate PR; verify totals don't imply completeness (same §5.1 boundary as the rest).

### 67. ✅ VERIFICATION RECORD — ad-blocker survivability confirmed (2026-07-24, evidence, NOT a defect)

Recovered from PR #386, which was **CLOSED not merged** — its content existed nowhere in the repo (grep on `589bb41`: `safari`/`ITP`/`@ghostery`/`easyprivacy` all 0). Only the `$ping` KI survived, via #387.

Tested against uBlock Origin's **full default filter set** (EasyPrivacy, EasyList, uBO privacy, Peter Lowe's) with `@ghostery/adblocker`, **control passing** (`google-analytics.com/analytics.js` correctly **BLOCKED**, so list coverage is confirmed, not silently empty):
- `https://api.srctk.com/tracker.min.js` (script) → **ALLOWED**
- `https://api.srctk.com/api/track` (fetch) → **ALLOWED**
- `https://api.srctk.com/api/track` (ping) → **BLOCKED** (`$ping,third-party`) — the reason the tracker uses keepalive fetch, not sendBeacon (#387).

No bare `/tracker.min.js` rule exists in any list — all 14 near-matches are **prefixed** variants (`/js_tracker.min.js`, `/keen-tracker.min.js`, `/utm-tracker.min.js`, …). `/api/track?guid` requires that literal query param, which the tracker does not send. `"srctk"` appears in **zero** rules. **CONFIRMED LIVE** in Chrome with uBlock active on `techrupt.pk`: `/api/track` returns **200**, `Type=fetch`, initiator `tracker.min.js:1`.

**Standing risk:** filter lists change, and a generic path name gets likelier to be listed as adoption grows. `api/tests/adblock-guard.test.js` re-checks this on **every CI run** (added #387) — a new listing goes red there.

### 68. 🔴 Safari ITP storage cap — first-touch persistence untested against multi-touch windows (2026-07-24, attribution risk, NOT fixed)

First-touch persistence is confirmed for **25 days** via the `localStorage` key `st_aid` (`first_touch_timestamp` 2026-06-29, observed 2026-07-24) — **in CHROME**. Safari's **ITP caps script-writable storage at ~7 days of no interaction**, which would **truncate longer journeys and silently bias multi-touch models toward last-touch on Safari traffic** — a §5.1-class distortion that is invisible (the data just isn't there).

**Not practically automatable:** Playwright's WebKit is **not** Safari's ITP, and the 7-day timers can't be waited out in CI. Safari's **ITP Debug Mode** compresses them for a **manual** pass. **Apple's current threshold is UNVERIFIED** — check WebKit's posts before designing to a specific number (do not hard-code "7 days").

**Interacts with KI-65** (cookieless + SPA fabricates Direct): both concern first-touch survival, and a **cookieless SPA on Safari** would hit both simultaneously.

### 69. ✅ VERIFICATION RECORD — capture chain verified live on prod (2026-07-24, evidence, NOT a defect)

`techrupt.pk`, Chrome, real install. Two runs proving both directions:
- **RETURNING VISITOR** (existing `localStorage`, arriving WITH new UTMs): `gclid "TESTGCLID123"` ✅ · `st_campaign_id "999"` ✅ · full-query `page_url` intact ✅. `first_touch_source` stayed `"direct"` with `first_touch_timestamp` `2026-07-24T10:01Z` — **CORRECT: a later visit must not overwrite an existing first touch.**
- **FRESH VISITOR** (incognito, no prior storage, same URL): `first_touch_source "st_test"` · `first_touch_medium "cpc"` · `first_touch_campaign "verify_2607"` · `first_touch_timestamp 2026-07-24T18:53Z` · `gclid` + `st_campaign_id` captured · new `anonymous_id` issued.

So **UTM capture, click-ID capture, Google Ads ValueTrack capture, first-touch capture, AND first-touch persistence** are all verified against a live prod install — a claim that can now be made truthfully. (Caveat: verified in **Chrome only** — see KI-68 for the Safari/ITP window boundary.)

### 70. ⚠️ Form auto-fill + cross-domain decoration — shipped, never exercised live (2026-07-24, "built but never run", NOT a defect)

`FEATURE_MAP §2` lists both as ✅ SHIPPED, but both are **OPT-IN** (`data-auto-fields="true"`, `data-cross-domains="..."`) and **no live install has either enabled**. Same "built but never run" class as the other instances logged this session (`ai-client.js`, MS/LinkedIn CAPI senders, `analytics.js`, the Supabase pre-agg netting, the SPA path). **Not urgent** — nobody is using them — **but do not treat them as proven.** For the record: **"automatic insertion" means automatic ONCE ENABLED, not on by default** — a customer installing the plain snippet gets neither.

### 71. Test-registration guard covers `api/tests/` ONLY — a scan-SCOPE gap, not registration drift (2026-07-24, corrects an imprecise claim)

**Correcting a chat claim** ("~6 test files are unregistered — registration drift is back"): imprecise. `test-registration-guard.test.js` deliberately excludes exactly **four** files by design (`DELIBERATELY_UNREGISTERED`, lines 42-45: `analytics-sources-join-ms`, `leads-journey-attribution`, `report-builder-leads`, `source-normalization`) — those are **not** drift. The real gap is narrower and structural: the guard scans **`api/tests/` only** (`readdirSync(join(REPO, 'api', 'tests'))`, `:57`), so any test under **`dashboard/`** (e.g. `dashboard/src/pages/seoRevenueTruthGate.test.js`) or **`tinybird/adapter/__tests__/`** is **outside its coverage entirely** — the guard can neither confirm nor deny their registration. That is a **scan-scope gap**, not drift. Related: `api/lib/url-normalize.js`'s header cited a nonexistent `api/tests/url-normalize.test.js` (corrected in this PR — the real single-source check is `served-allowlist.test.js:113`).

**Do NOT expand the guard's scope as a quick fix** — `dashboard/` and `tinybird/adapter/` tests run under **different runners** (vitest / node), so registration-in-`package.json`-qa-scripts is not the right membership check for them. Widening coverage is a separate, considered change. Logged as a scope gap, not built.

### 72. `mapSubscriptionEvent` reads only `obj.subscription` — newer Stripe payloads moved it (2026-07-26, OPEN, needs sandbox verification)

`api/lib/stripe-subscription.js:29` sets `out.subscriptionId = obj.subscription || null` for `invoice.paid`. Recent Stripe API versions **removed** the top-level `invoice.subscription` and moved the id to `parent.subscription_details.subscription`. If the account's webhook payloads render at such a version, `subscriptionId` is `null` for **every** `invoice.paid`.

**The pin at `stripe-webhook.js:16` does NOT settle this** — and assuming it does is the trap. `new Stripe(..., { apiVersion: '2024-06-20' })` governs **outbound API calls the server makes**; incoming **webhook payloads render at the version configured on the webhook endpoint / account**, not the SDK's. So the SDK pin is not evidence either way.

**Blast radius, traced — smaller than it looks:**
- `stripe-webhook.js:104` `conversion_event_id` → falls back to `invoiceId ||`, which is always present on `invoice.paid`. **Unaffected.**
- `buildSubscriptionIdempotencyKeys` → takes the `invoice_id` branch when `invoiceId` is set, so the `subscription_id` branch never runs here. **Unaffected.**
- `stripe-webhook.js:119` `stripe_subscription_id: subscriptionId || null` → **AFFECTED.** This is the only material consequence: it gates subscription-identity seeding (`nightly-attribution.js:1079` requires it truthy).

So this is an **identity-stitching gap, not a metric corruption**. Deliberately **not** bundled into #416: it is a money-rail-adjacent data change and that PR's bar was per-event validation, which cannot be done from the repo. **Needs its own Stripe sandbox check** of a real `invoice.paid` payload before any fix. The one-line defensive fallback (`obj.subscription || obj.parent?.subscription_details?.subscription`) is strictly additive but would change `stripe_subscription_id` from null → populated on live rows, so it earns its own verification.

### 73. OPEN DECISION — should a $0-priced free-plan signup count as a "customer"? (2026-07-26, product call, NOT a defect)

#416's trial-start guard skips an `invoice.paid` when `amount_paid === 0 && subtotal === 0` (nothing was ever **owed**), which is what distinguishes a trial-start carrier from a 100%-discount coupon on a real acquisition (`subtotal > 0`, reduced to 0). **A genuinely $0-priced plan also has `subtotal === 0`**, so a free-tier signup is skipped too and never counts as a customer.

Today's answer — *a free-plan signup is not a paying customer* — matches what the customers metric means everywhere else, and is the reason it was left as-is. But it is a **product decision, not an engineering one**, and it was flagged rather than decided. If the answer should be "yes, count it", the discriminator needs a third signal (the guard cannot distinguish the two cases from the invoice object alone).

### 74. `POST /api/server/event` returns `received:true` with no durability signal (2026-07-26, OPEN — scope corrected)

The route answers `{"success":true,"data":{"received":true}}` while the **only** Supabase write is `api_keys.last_used_at` (`server-events.js:234`). The event itself goes solely through `dualWriteEvent` (`:232`), which is **not awaited** and returns a boolean the route **discards**.

> ⚠️ **Two corrections to the original framing, both verified.**
>
> **(1) This is NOT server-events-specific — it is the shared post-PostHog ingestion architecture.** `track.js:420-427` does exactly the same thing and says so in its own comment: *"Tinybird is the SOLE writer here — if dual-write is ON but the event did NOT enqueue (no transport wired, or normalize rejected it), this 200 persists NOTHING."* What is **actually unique to server-events** is that `track.js` **captures** the return value and logs `not-enqueued` when `!enqueued && isDualWriteEnabled()`, whereas server-events discards it and logs nothing. The gap here is **observability**, not a uniquely missing write.
>
> **(2) "Nothing is durably stored" is not unconditional.** When the flag is ON **and** a transport is wired, `dual-write.js:62-65` documents a real durability path — the batcher dead-letters permanent 4xx and re-queues 429/5xx **before** rejecting, so the swallowed `.catch(() => {})` "does not lose the event". The silent-drop window is specifically: flag **OFF** (`isDualWriteEnabled()` reads `TINYBIRD_DUAL_WRITE`, `:30-33` → returns `false` immediately), flag ON but **no batcher**, or a **normalize throw**. In all three, `received:true` is still returned.

**Not verifiable from the repo:** the live value of `TINYBIRD_DUAL_WRITE` per environment. Railway env state is founder-only (no env-var read tool on the orchestrator MCP), so the observation *"zero rows in ST_Staging for a site that had just received an accepted event"* is **consistent with the flag being off in staging** but cannot be confirmed here. Confirm the flag before treating this as a code defect rather than a configuration state.

**Smallest honest fix** (not built): mirror `track.js` — capture the return and log the not-enqueued case. Making the 200 conditional on durability is a larger contract change and would need its own decision.

### 75. `team_members` and `webhooks` plan limits are defined but never enforced (2026-07-26, OPEN, recorded by #419)

`PLAN_STRUCTURAL_LIMITS` (`api/lib/plan-features.js`) defines five keys; three are enforced (`conversion_events`, `sites`, `retention_days` — see `docs/pricing_plan_limits_audit.md` for the file:line table). Two are not:

- **`team_members`** — no consumer. Currently unreachable rather than exploitable: there is no in-product invite/member-add mechanism at all (membership is provisioned out-of-band), so a user cannot exceed a seat count they have no way to increase. **It becomes a real hole the moment invites ship.**
- **`webhooks`** — the subtler one, and the one most likely to be mis-read as enforced. `api/routes/webhooks.js` gates the **feature** (`requireFeature(..., 'webhook_outbound')` in `enforceWebhookOutbound`, `:12-16`) but never the **count**. The `.limit(10)` at `:53` is the **page size of the recent-deliveries log query** (`select id, event_type, status_code, ... .eq('destination_id', ...).order('created_at', desc).limit(10)`) — it has nothing to do with how many destinations a site may create. `getStructuralLimits(...).webhooks` has **zero** consumers repo-wide. So on Growth (20) and Scale (99) a customer can create unbounded outbound webhook destinations.

Recorded in the audit doc by #419 but not previously in this file, which is where enforcement gaps get looked for.

### 76. Metering asymmetry: the same event costs 0 via the tracker and 1 unit via the server API (2026-07-26, DELIBERATE stopgap, feeds the pageviews→events migration)

After #420, `POST /api/server/event` meters the **complement of the conversion test** — every non-conversion event consumes one pageview unit. The tracker paths meter only a **literal `$pageview`** (`track.js:329`, `proxy.js:72`). So an identical custom event is **free client-side and billable server-side**.

**This was the only rule that closes the hole**, and that reasoning must survive: `event` is caller-supplied and documented free-form, so `{"event":"page_view"}` evades a name gate, and pattern-matching pageview-ish names still leaves `{"event":"x"}` free. Complement-of-conversion is the only rule under which every event on that route hits exactly one meter.

**But it is a stopgap, not a coherent model.** The coherent fix is the deferred **pageviews → events metering migration**: one unit definition applied identically on every ingestion path. Whoever picks up the Astro pricing work should inherit this reasoning rather than rediscover it — and should treat the asymmetry as the argument *for* the migration, not as a bug to "make consistent" by weakening the server-API gate (that would reopen the hole).

**Copy consequence, flagged not fixed:** `dashboard/src/pages/Pricing.jsx:121` answers *"What counts toward my plan?"* with *"Tracked pageviews per month: 50,000 on Starter, and 150,000 on Growth and Founder."* That is now **incomplete for API users**, whose custom events consume the same allowance. One clause of copy; a marketing call, deliberately not made here. Reach is bounded — `api_access` is trial/growth/scale only, so free and starter cannot call the route at all.


### 77. Bot detection: the headless signal is COLLECTED, CORRECT, and DISCARDED — the gap is a threshold, not infrastructure

Filed 2026-08-06 against `6af056d7`. Recorded because it **changes what the fix is**. The bookmentions bot-inflation investigation concluded the ingestion filter "matches on UA substring only", which reads as *"we need IP/ASN/datacenter intelligence we do not have."* **That is not the position we are in.**

**Observed live in production logs, 2026-08-06 08:45:02Z, one millisecond apart:**

```
[bot-filter][automation-score] site_id=712a83a8-…  score=60  ua_hash=2f1bd5706ab5
[ingest-obs] accepted count=1 sites=712a83a8-…    event_ids=[7294407c-…]
```

**Score 60 is exactly the `navigator.webdriver === true` weight** (`tracker.min.js`, fn `Ve`; constant `qe = 60`). The tracker detected an automated browser, reported it, the server logged it — **and metered the pageview anyway.** The same deploy shows the UA filter working correctly on other traffic (`[ingest-obs] rejected … reason=bot`), so this is not a broken filter; it is a **second, better signal that nothing reads.**

`api/routes/track.js:186-191` says so outright: *"nothing reads this value to filter, drop, classify, or meter… there is deliberately no threshold anywhere in this codebase."* That was the right call when written — a threshold invented before observing real data is a guess. **Real data now exists.**

**Consequence for the fix:** the work is a **threshold decision on an existing signal**, not new IP/ASN/datacenter infrastructure. Three questions to answer before any code:

1. **What thresholds are available, and what does each catch?** `Ve` composes three weights — `webdriver === true` (60), any of 17 automation globals present (40), and Chrome-UA-without-`window.chrome` (10) — capped at 100. So the reachable scores are a small, enumerable set, not a continuum.
2. **What is the false-positive exposure at each?** A drop is **irreversible** (§6): the 2026-07-14 incident deleted real humans by tightening ingestion on the wrong axis. The 10-point Chrome-UA rule in particular fires on legitimate embedded browsers.
3. **Should `header_shape` and `ua_extra` be promoted alongside it?** Both already run **log-only** (`bot-filter.js:126-141`, wired at `track.js:177`) and were built to be measured before being trusted. If a threshold ships, deciding these three together beats three separate reversals.

**Do not treat this as urgent.** Blast radius is the pageview meter only — revenue is verified clean — and the affected sites are two free test sites and the founder's test domain, so it currently costs quota **nobody is paying for**. Real, not urgent. See also KI-45 (the silent-success class): a signal that is collected, logged, and ignored is the same failure shape as a status that is reported without being checked.

---
## Recently fixed

### Safe JS-based Multi-Touch Attribution Engine (Session 105)
- **Linear/Advanced Attribution HogQL error** `Unable to resolve field: ce` — RESOLVED.
  - Rewrote the multi-touch live calculation pipeline to run fully in JavaScript.
  - The engine now fetches conversions and visitor touchpoints separately using simple, highly indexable ClickHouse queries, completely avoiding slow and buggy correlated subqueries that fail in HogQL.
  - Verified all 8 models (first_touch, last_touch, first_touch_non_direct, last_touch_non_direct, linear, time_decay, u_shaped, w_shaped) using both a deterministic QA harness and a controlled live API integration test against real PostHog ClickHouse data.
  - Live integration test confirmed exact $120.00 revenue reconciliation per model after PostHog cloud indexing (~295 s ingestion latency, within expected 2–5 min window).
  - PostHog cloud ClickHouse ingestion latency is non-trivial; integration test polling window is 10 minutes. This is expected infrastructure behaviour, not a code bug.

### Final Complete Audit — Round 3 (2026-05-21)

- **Cross-customer data leak in /api/analytics/* and /api/campaign-costs**
  (10 routes) — RESOLVED. Routes had `requireUserAuth + validateSiteKey`
  but not `requireSiteMembership`, so any authenticated user with any
  valid site_key could read another customer's data. Added the membership
  check to all 10 routes.
- **21 unused `import WebSocket from 'ws'` imports** — RESOLVED. Round 2
  refactor missed the cleanup.
- **20 duplicated helper functions across 16 files** — RESOLVED. Extracted
  to `api/lib/utils.js` (esc, toHogDate, normalizeUtm, getFirstTouchFields).
- **`loader.min.js` references in 8 docs** — RESOLVED. File never existed;
  customers reading these docs would have copied a 404-ing URL.
- **README.md missing** — RESOLVED. Created top-level entrypoint.
- **`.env.example` missing RESEND_API_KEY, SLACK_WEBHOOK_URL,
  NIGHTLY_CONCURRENCY, NODE_ENV** — RESOLVED.

### Production Readiness Audit v2 — Round 1 + 2 (2026-05-20)

Audit-driven fixes covering attribution, CAPI, security, scaling, and ops.

**Round 1** (commit 8fc8809):
- Bot filter on `/api/track` — keeps PostHog clean of crawler events
- DNT / Global Privacy Control honoured in `tracker.js` and `analytics.js`
- Stripe webhook idempotency (event.id dedup in NodeCache, 24h TTL)
- Concurrency lock on nightly-attribution via `job_runs.status='running'`
- PostHog 429 / 5xx retry with exponential backoff and `Retry-After`
- Graceful SIGTERM/SIGINT shutdown — drains in-flight requests on deploy
- Fail-fast env validation at startup (SUPABASE_URL / SERVICE_KEY / POSTHOG_*)
- Performance index migration `20260520000001_attribution_performance_indexes.sql`
  (7 indexes — applied & validated in Supabase)

**Round 2** (this commit):
- Singleton Supabase client (`api/lib/supabase.js`) — replaced 35 `createClient()`
  calls across 32 files
- Tracker cache headers: `public, max-age=86400, stale-while-revalidate=604800, immutable`
- Parallel nightly attribution — bounded concurrency 4 (env `NIGHTLY_CONCURRENCY`)
- CAPI retry on 429/5xx/network (Meta, Google, Microsoft, LinkedIn, TikTok)
- Browser/OS enrichment in /api/track and /api/conversion
- Affiliate channel classification
- Privacy policy reminder in Snippet.jsx install flow

### Conversion ref/source/via parity (Session 78)

`api/routes/conversion.js` now persists `ref_param`, `source_param`, and `via_param` on conversion events, matching `api/routes/track.js`.

### Saved report request body bug

Fixed by centralizing JSON body normalization in:

- `dashboard/src/lib/api.js`

### Channel taxonomy

Fixed/added:

- `AI Search` channel label
- `Revenue by Channel` preset
- `Conversions by Channel` preset
- session report channel grouping bug

### Saved reports backend persistence

Saved reports now use the backend route and `saved_reports` table.

## Not bugs / expected behavior

### Vite chunk-size warning

Dashboard build may show chunk-size warning. This is not currently a build failure.

### Chrome devtools well-known 404

Chrome may request:

    /.well-known/appspecific/com.chrome.devtools.json

404 is harmless.

### Dashboard no-data state

A channel report can show no rows if the local site has no conversions in the selected date range.

### API 401 for curl without auth

Authenticated dashboard/report endpoints require a Bearer token. A curl request without Authorization can return:

    Missing or invalid Authorization header

This is expected for protected API routes.

### 9. /api/collect missing CORS headers (Fixed in Session 92)
POST /api/collect, /api/conversion, /api/identify were blocked by CORS 
when called from tracker on a different origin (localhost:8080, customer websites).
Fixed by adding /api/collect, /api/conversion, /api/identify to isPixelRoute 
check in both middleware blocks + explicit CORS headers on /api/collect route.
### 4. Journey touchpoints previously excluded organic/direct/AI (FIXED Session 95)
The nightly-attribution.js touchpoints query had `utm_source IS NOT NULL` filter — organic search, direct, referral and AI referral visits were invisible in every user's journey. Fixed in Session 95 by removing the filter and adding referrer + ai_source + derived_source to the query.

### 5. channel column in attributed_conversions was missing (FIXED Session 95)
group_by=channel in attribution API was silently broken — no channel column existed. Fixed in Session 95: added channel + channel_30d columns, channelFromEvent() enhanced with click ID detection, batch job writes channel on every conversion.

### 6. data-quality-check.js was missing (FIXED Session 94)
Crontab ran this file at 3 AM every night — file didn't exist, silently crashing. Fixed in Session 94.

### 7. _st cross-domain system was redundant (FIXED Session 94)
Two conflicting cross-domain systems existed. _st system built in error — removed. __tq_id/__tq_ft system is the correct one, carries full attribution data.

### 8. Meta CAPI sent wrong event names (FIXED Session 97–98)
All conversion types were firing as `Purchase`. META_EVENT_MAP with 16 type mappings added to conversion-sync.js.

### 9. Google Ads CAPI always 401 (FIXED Session 97–98)
Developer token was passed as Bearer token. Fixed: OAuth2 access token read from `google_ads_access_token` site column or `GOOGLE_ADS_ACCESS_TOKEN` env var.

### 10. Nightly attribution models returned silent empty results (FIXED Session 97–98)
U-shaped / W-shaped / Time Decay / Linear models showed blank charts with no explanation. Fixed: `_notice` field returned when empty; UI amber banner explains nightly job timing.

### 11. Duplicate channelFromEvent — AI domains diverged (FIXED Session 97–98)
attribution-engine.js had 14 AI domains; nightly job had 8. Canonical `api/lib/channel-classifier.js` created with 21 domains; both consumers import from it.
**Read-side only — the class was NOT fully closed (see KI-32):** this unification covered the read/attribution consumers; the ingest path (`ai-platform.js`, `proxy.js`) was never part of it and diverged the same way. Fixed 2026-07-21.


## New Known Gaps (Session 140P-RB-FIX-4, not yet fixed)

### country/device/browser
Build dimension support — requires schema columns on `attributed_conversions` (or ClickHouse pageview-join) + nightly job populating them + real multi-value seed data to test against. Post-launch.

### landing_page
Build real landing-page report — first-pageview-per-visitor resolution + backing storage. Post-launch.

## New Known Gaps (Session 128D-B.1, not yet fixed)


### Deferred filter support in Report Builder
The following dimensions are supported as group-by targets in the Report Builder but are deferred as direct filters:
- Browser filter
- Referrer Domain filter
- Landing Page / URL filter
- Custom URL Parameter filter

### Schema-valid source filters vs attribution accuracy
Source shortcut filters are schema-valid and safe, but source/channel value accuracy still depends on backend normalization and real customer data.

## New Known Gaps (Session 98–99, not yet fixed)


### Deployment architecture — two separate Railway services

`sourcetrack.ai` is served by the **dashboard** Railway service:
- Builder: RAILPACK
- Build: `npm run build` (Vite → `dashboard/dist/`)
- Start: `npm run start` = `serve -s dist -l $PORT`
- The `serve` package must be in `dependencies` (not devDependencies) — fixed in this session

`api.srctk.com` (the real ingest host; `api.sourcetrack.ai` does not resolve) is served by the **api** Railway service:
- Builder: NIXPACKS
- Start: `node api/index.js`

The Express API server does **not** serve the dashboard frontend. They are independent deployments.

---

### GSC sitemap "General HTTP error" — root cause: SSL cert

Google Search Console shows "Sitemap could not be read — General HTTP error" for `https://sourcetrack.ai/sitemap.xml`.

**Root cause:** Same SSL cert issue as the browser `NET::ERR_CERT_COMMON_NAME_INVALID`.
The cert served is for `stream.nexus.pizza`, not `sourcetrack.ai`.
Google's crawler follows the same HTTPS rules as a browser — it refuses to fetch over a mismatched cert.

**The sitemap itself is correct.** It is in `dashboard/public/sitemap.xml`, copied to `dist/sitemap.xml` during build, and served as a static file by `serve -s dist`. Once SSL is fixed, Google can read it immediately — resubmit in GSC after fixing.

### SSL Certificate — `NET::ERR_CERT_COMMON_NAME_INVALID` (NOT a code issue)
Certificate shows `stream.nexus.pizza` instead of `sourcetrack.ai`.
This is a Railway custom domain SSL provisioning problem.

**Fix (Railway dashboard only):**
1. Go to Railway → your Dashboard service → Settings → Domains
2. Remove the `sourcetrack.ai` custom domain entry
3. Re-add it: add `sourcetrack.ai` and `www.sourcetrack.ai`
4. Railway will provision a Let's Encrypt cert automatically (takes ~1 min)
5. Verify DNS CNAME: `sourcetrack.ai CNAME <your-project>.up.railway.app`
6. If using Cloudflare: set SSL mode to "Full (Strict)" not "Flexible"

**Root cause:** Railway uses SNI to serve the right SSL cert. If the custom domain
was added before DNS propagated, or the cert wasn't re-issued after a domain
name change, Railway continues serving its default `*.up.railway.app` cert.

## New Known Gaps (Session 97–98, not yet fixed)

### OG image missing
`/og-image.png` is referenced in `dashboard/index.html` and `Landing.jsx` but does not exist yet.
Action: create a 1200×630 image and deploy to `https://sourcetrack.ai/og-image.png`.

### Landing page is CSR — social link previews may not render
The landing page is a React SPA. Helmet adds meta tags but social crawlers (Slack, iMessage, WhatsApp) don't execute JS. OG preview images and descriptions may not show when sharing the URL.
Action: evaluate SSR (Next.js/Astro) for the marketing landing page post-launch.

### annotations migration (20260519000005) — custom_properties IS present (corrected 2026-07-18)
CORRECTION: a direct prod↔staging column diff (2026-07-18) confirms **`custom_properties` EXISTS on
`attributed_conversions` in BOTH environments** (jsonb, nullable). The earlier claim that
`20260519000005` was "unapplied" / that `custom_properties` "does not exist" does **NOT** hold at the
schema level — that column is applied in both.
- NOT covered by that diff (still open — verify before relying on them): whether `attribution_window_days`
  exists on `sites` in both envs, and the annotations-API 503 path. Do not assume these are resolved.

### Per-conversion explain is single-touch-only
Step-by-step explanations (via `/api/attribution/explain` and the Conversion Explanation Modal) are designed and supported for single-touch models only (`first_touch`, `last_touch`, `first_touch_non_direct`, `last_touch_non_direct`, `ai_platforms`).
Advanced multi-touch models (`linear`, `time_decay`, `u_shaped`, `w_shaped`) are designed for aggregate attribution reporting, and querying `/api/attribution/explain` for them will return a clean explanation object indicating this limitation rather than raising errors or crashing.

## D1c-1 — route_ab_diff A/B coverage retired for the Tinybird-sole engine legs (2026-07-18)

D1c-1 flipped the 13 category-A attribution-engine legs to Tinybird-sole: a null pipe now throws the loud `[tinybird-force-read]` invariant instead of falling back to the dead-store read path (§6 — no dead-store zeros).

As a consequence, the 5 real-target A/B self-test blocks in `tinybird/tools/__tests__/route_ab_diff.test.mjs` — touch-model, multitouch, session-report, session-report cache-trap, and explain — were removed. Those blocks drove the real engine targets through the harness's OFF (dead-store) leg to compare pipe-vs-dead-store. With that leg gone, there is no OFF leg to compare against, so those targets can no longer be A/B'd.

**What this means:**
- Pipe-vs-dead-store parity for these legs was certified POINT-IN-TIME before the flip (the §5 prod-serving gate: all 13 pipes confirmed serving) and is **no longer continuously harness-enforced**.
- ~~The `route_ab_diff` harness LOGIC is still covered by the stub-driven self-tests.~~ **SUPERSEDED (D3, this PR):** `route_ab_diff.mjs` + its self-test are now **DELETED**; the still-needed `buildRouteArgs`/`ROUTE_ARG_DEFAULTS` were extracted verbatim to `tinybird/tools/route-args.mjs` (the `route-args-matrix.test.js` CI gate imports it). See the D3 entry below.
- Fail-closed behavior for these legs is now enforced by the dedicated `*-read-cutover` / `*-parity` suites (a null pipe MUST throw), not by A/B parity.

**Re-establish if needed:** once D1c-2 lands the `attribution_explain_journey` pipe and D3 removes the dead read layer, no OFF leg exists anywhere — cross-store A/B is retired by design. Any future parity concern becomes a pipe-vs-pipe or pipe-vs-expected-fixture check.

### D3 SCOPE — the qa:attribution harness (82 tests) must not vanish silently
The `qa:attribution` harness (`scripts/qa-attribution-harness.mjs` + `qa-attribution-integration.mjs`, ~82 tests) is **not in the CI gate** (ci.yml runs `qa:attribution:unit`, not this harness) and is currently **unrunnable locally** without `POSTHOG_API_KEY` — it `import`s `attribution-engine.js`, which transitively constructs the PostHog client at module load. When **D3 deletes `posthog.js`**, that import chain changes and this 82-test suite is at risk of becoming permanently unrunnable / silently dead.

**D3 must explicitly do ONE of:** (a) port the harness off PostHog (drive it purely through the injectable read seam / fixtures, no PostHog client at load), or (b) formally retire it with a recorded rationale. An 82-test attribution suite must not disappear as a side effect of the decommission — decide, don't drop. (Surfaced during D1c-1 test accounting, 2026-07-18.)

**RESOLVED (D3, this PR):** neither port nor retire was needed — deleting `posthog.js` removed the transitive PostHog-client construction from `attribution-engine.js`, so `qa-attribution-harness.mjs` (the pure `calculateAttribution` math) now RUNS again: **6/6 green** ("ALL TESTS PASSED"). The harness is UNbroken, not lost. Its `qa-attribution-integration.mjs` half still needs a `SOURCETRACK_SITE_KEY` staging fixture (operator-provided, §0) to run — unrelated to PostHog. Not yet CI-gated; wiring it in is a possible separate follow-up once the integration half has a fixture.

### All Leads page — 4 page-local defects (2026-07-18) — RESOLVED, with one deferred item
All four were `GET /leads` bugs where a **page-limited** result (`leads_list`, LIMIT 100) was treated as the whole dataset (the table sorts LAST SEEN desc, so converters past row 100 were invisible to every page-local computation). Ground truth (prod Supabase `attributed_conversions`, techrupt.pk): **4 distinct converters, 4 rows, $999.99**, cross-validated with Analytics.

**Fixed (post-D3, code-only, no Tinybird pipe deploy):** `total`, `total_conversions`, and `total_revenue` now come from **one Supabase `attributed_conversions` aggregate over the full window** (the §5 source of truth for conversions & revenue — the same source Analytics uses), replacing the page `reduce()`. One query keeps the three internally consistent (converters ≤ conversions). Effects:
1. ✅ `total_conversions` — full-window count, no longer a page reduce.
2. ✅ Label mismatch — the table subtitle now shows its OWN row count ("N shown" / "Showing the 100 most recent"); the "Total Leads" tile stays as the separately-labeled distinct-converter KPI.
4. ✅ `total_revenue` / "No revenue in this period" banner — full-window revenue, so the banner no longer fires while the site has revenue beyond the page.

**Deferred — real server-side search (defect 3):** `leads_list` has **no search param** and the route still filters client-side over the ≤100 loaded rows. A real server-side search needs a `leads_list` **pipe change = founder-gated prod deploy**, so it was NOT done. Instead the empty state was **relabelled** (code-only) so it can no longer claim a visitor doesn't exist ("No matches … in the leads loaded for this range … widen the date range"). A true server-side search param remains open (needs the pipe deploy).

**`leads_count` pipe now unused:** the totals no longer read the `leads_count` Tinybird pipe (superseded by the Supabase aggregate). The pipe is still deployed but has no caller — safe to leave; delete only via a founder-gated pipe change if desired.

**Superseded ground-truth note:** earlier speculation that `leads_count` ignored `date_from_ts` (a deploy-drift) was **disproved** — `leads_count=4` was correct all along.

**Fixed in:** the leads full-window totals PR (frontend `Leads.jsx` + `api/routes/leads-server.js`; tests `leads-totals-full-window.test.js` + updated `leads-server-read-cutover.test.js`).

## D3 — PostHog read layer deleted; cross-store HogQL diffing retired (2026-07-18)

D3 deleted `api/lib/posthog.js` and every importer. `queryHogQL` has zero functional callers; the inert route/lib seams are gone; the write-dead `ph` client was unwired from `api/index.js`. A source-text guard (`api/tests/no-posthog-import.test.js`, in CI-gated `qa:identity:unit`) blocks any file under `api/lib`/`api/routes`/`api/jobs` from re-importing the deleted module.

**Retired tooling (coupled to the dead read layer / no HogQL OFF leg):**
- `route_ab_diff.mjs` + its self-test — the pipe-vs-HogQL A/B harness. `buildRouteArgs`/`ROUTE_ARG_DEFAULTS` (still used by the `route-args-matrix.test.js` CI gate) were extracted verbatim to `tinybird/tools/route-args.mjs`.
- `phase4_touchpoint_diff.js`, `run_phase4_diff.mjs`, `phase4_replay_verify.mjs` — the Phase-9 cross-store parity drivers. The 5 model-credit functions (`creditFirstTouch`, `creditFirstTouchNonDirect`, `creditLastTouchNonDirect`, `aggregateModelCredits`, `compareAggregateBuckets`) + their pure helper closure were extracted verbatim to `tinybird/tools/attribution-credit-math.js` (posthog-free), keeping `phase9-agg-models.test.js` green.
- Dead cross-store QA scripts `qa-dedupe-regression.mjs`, `qa-referrer-domain-reporting.mjs` deleted. Fixture seeders `seed-duplicate-conversion.mjs` / `seed-multitouch-carrier.mjs` severed to Tinybird-only (still function end-to-end).

**Accepted gap (recorded, not a regression):** cross-store HogQL diffing is **retired** — there is no PostHog OFF leg to diff against anymore. The **model credit math itself remains covered** by `phase9-agg-models.test.js` (against `attribution-credit-math.js`). What is lost is only the ability to diff `last_touch` and `ai_platforms` (Phase 9 was incomplete for those two — they ship to prod without a cross-store validation harness). Any future parity concern is pipe-vs-pipe or pipe-vs-expected-fixture, not pipe-vs-HogQL.

**Recovery** (all deleted files exist at the pre-D3 commit `8435504`, until PostHog data is decommissioned in D5):
`git show 8435504:api/lib/posthog.js` · `git show 8435504:tinybird/tools/route_ab_diff.mjs` · `git show 8435504:tinybird/tools/phase4_touchpoint_diff.js` · `git show 8435504:tinybird/tools/run_phase4_diff.mjs` · `git show 8435504:tinybird/qa/phase4_replay_verify.mjs` · `git show 8435504:scripts/qa-dedupe-regression.mjs` · `git show 8435504:scripts/qa-referrer-domain-reporting.mjs`

### CI false-green: `scripts/` is not exercised by any test suite (2026-07-18)
D3 deleted `api/lib/posthog.js` and `tinybird/tools/phase4_touchpoint_diff.js`, yet two stale PRs still read as green:
- **#167** (`scripts/bench-live-vs-nightly.mjs`) imports the deleted `api/lib/posthog.js` — it would crash on run, but **no CI suite imports or executes anything under `scripts/`**, so `build-and-test` stays green. A broken import in `scripts/` is a **false green**.
- **#133** adds a test importing the deleted `phase4_touchpoint_diff.js`; its green CI is stale (it ran pre-D3, and PR CI is not re-run against current `main` until rebased). Green on an old base ≠ green on `main`.

Consider a lightweight guard: `node --check` / import-smoke over `scripts/*.mjs` in CI, or a `grep -rl 'lib/posthog.js' scripts/ tinybird/tools/` tripwire. Green CI on a broken import is a false signal. (Surfaced triaging #133/#167.)

### Migration-ledger divergence (prod ↔ staging) — repair DEFERRED until CI secrets are fixed (2026-07-18)
The two Supabase `supabase_migrations.schema_migrations` ledgers have diverged: **identical migrations carry different version numbers per environment**, and **prod's ledger is stale since `20260713081319`** — even though four migrations were hand-applied to prod today (2026-07-18). The ledger no longer reflects what is actually applied. No open PR addresses this (schema/baseline capture ≠ ledger repair; #190 does not fix it).

🔴 **Do NOT start the repair yet:** `STAGING_DB_URL` currently resolves to PROD (see #293), so a ledger write intended for "staging" could hit prod. Scope the `schema_migrations` reconciliation only **after** the CI-secret repoint is verified to point at `nrsvpwzekfrdrzkoecfk`. (Surfaced 2026-07-18.)

### Weekly email reports have NEVER sent in production (2026-07-19)

`job_runs` (prod): **226 runs of `email-reports-weekly`, 2026-06-28 → 2026-07-19, every one `status='success'`, every one `error_message='Sent 0, skipped 4, errors 0'`. Zero sends, ever.** `usage_email_log` is empty (0 rows). Verified by direct read-only query against prod Supabase (`zxjjjsipafojhzkkumvh`), not agent-reported.

Four separate defects:

1. **Untested customer-facing path (launch blocker).** No weekly attribution report has ever been delivered. Prod has 4 sites — 2 free, 1 trial stale since 2026-06-26, 1 founder-owned (techrupt.pk) — so "skipped 4" is likely CORRECT behaviour, not a failure. But the send path has never executed end-to-end. First real customer = first live test.

2. **Honest-reporting defect.** 226 no-op runs recorded as `success`. A genuine send failure would be indistinguishable from today's output. Same failure class `computeTerminalStatus` was built to prevent on the nightly (`suspectEmpty` → `failed`); the email job has no equivalent guard.

3. **`sourcetrack-email` cron never ran the job at all.** Railway Start Command is null → falls back to `npm start` → `api/bootstrap.js` → boots the Express API, not `api/jobs/email-reports.js`. Independent of commit `227b5cf` (2026-07-07), which added the `ST_MANAGED_PROXY_TARGET` fatal check and merely converted a silent no-op into a loud crash. Check the other cron services for the same missing Start Command.

4. **A weekly job runs ~11x/day.** Frequency correlates with deploys, so something invokes it outside its cron. With `usage_email_log` empty, the dedup guard is unproven — a real customer could receive one email per deploy. Root-cause the invocation source before onboarding anyone.

Not a migration item. Logged because #1 is a launch blocker of the same class as the money rail, and #2 is the exact "green means nothing happened" pattern this project has been eliminating elsewhere.

### D5 has a hard ordering dependency on THREE backend boot guards (2026-07-19)
Stripping `POSTHOG_*` from Railway (D5) is not safe on its own — three separate boot/runtime guards still read those vars, and each turns a missing var into a hard failure. A code scan (2026-07-19) found these were all hidden inside the single D2 "Jobs off PostHog" row:

1. **`api/index.js` REQUIRED_ENV** hard-exited the API on missing `POSTHOG_HOST`/`POSTHOG_API_KEY` → D5 would have failed **all six services** on boot. ✅ **FIXED (this PR)** — the two vars are removed from REQUIRED_ENV and a spawn-based boot test (`api/tests/boot-without-posthog-env.test.js`) guards it. This was the silent blocker.
2. **`api/jobs/nightly-attribution.js:175`** still refuses to boot without `POSTHOG_PERSONAL_API_KEY`/`POSTHOG_PROJECT_ID`, because `queryPostHog` and its three fallback sites (`:511`, `:617`, `:773`) still use them. This guard **must stay until D2·B3** removes those readers — removing the guard first turns a config error into a runtime crash on a money-rail path. **Still open.**
3. **`api/jobs/health-agent.js:213`** required four `POSTHOG_*` vars, and its `:137`/`:182` checks fetched PostHog directly. ✅ **FIXED (D2·health-agent PR)** — the `posthog` liveness check is deleted (+ removed from `CRITICAL_CHECKS`), `data_flow` reads Tinybird instead of PostHog, and `env_vars` no longer requires any `POSTHOG_*`. See the updated entry below.

**Net ordering constraint: D5 now cannot run until only D2·B3 (nightly) is resolved.** The boot-guard (item 1) and health-agent (item 3) are both cleared; item 2 (nightly's `:175` guard, gated on B3) is the last remaining blocker.

### health-agent taken off PostHog — RESOLVED, with a documented data_flow semantic change (2026-07-19)
`api/jobs/health-agent.js` previously had two direct HogQL fetches — `:137` (`SELECT 1` liveness) and `:182` (`count()` of `$pageview` in the last 24h) — plus an env check requiring `POSTHOG_API_KEY`/`POSTHOG_PERSONAL_API_KEY`/`POSTHOG_PROJECT_ID`/`POSTHOG_HOST`. Because `posthog` ∈ `CRITICAL_CHECKS`, once PostHog was decommissioned (D5) that check would have gone **critical/🔴 on every run forever**. **Fixed (D2·health-agent PR):**

- **Check 2 `posthog` (liveness) — DELETED** and removed from `CRITICAL_CHECKS`. It probed a store being decommissioned; there is nothing to be reachable, so nothing to replace.
- **Check 6 `data_flow` — re-pointed off HogQL onto Tinybird.** It now reads the `events_health_day` pipe, fanned out over the same site set the nightly uses (`nightly-attribution.js:218-227`: plan NOT IN (free,inactive,archived) AND (last_seen_at ≥ 7d ago OR NULL)). Status strings: all sites 0 → `warning`; any site's pipe read fails (null) → `error`; zero qualifying sites → explicit `skipped` (not a silent pass); otherwise `ok`.
- **Check 8 `env_vars`** no longer requires any `POSTHOG_*` (only `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`).

**⚠️ SEMANTIC CHANGE (intentional, no exact-parity pipe exists):** the old check counted **`$pageview`s in the last 24h, globally**; `data_flow` now counts **ANY tracked event in the last 24h, per site (summed)**. No deployed pipe matches the old semantics exactly — `events_health_day` counts any event over 24h; `doctor_pageviews_30d` counts pageviews but over 30d. `events_health_day` was chosen (any-event/24h is the closer canary) and the change is documented in the code (`evaluateDataFlow` header). **Restoring exact "pageviews-only, 24h, global" parity requires authoring a new pipe = a founder-gated Tinybird deploy** — deliberately not done here. The per-site fan-out is negligible today (prod has ~1 qualifying site).

### Tinybird READ path now retries transient failures (2026-07-19)
`queryTinybirdPipe` (`api/lib/tinybird-read.js`) previously did ONE bare `fetch` and returned `null` on the first failure — zero retry (the write/ingest path already retried via `transport.js` `withRetry`, but that is a different path/token and does not cover reads). It now retries **429 / HTTP ≥ 500 / network throw / timeout (AbortError)** up to **3 attempts total**, backoff = Retry-After header seconds if present else `min(60s, 2000 · 2^attempt)`, with a fresh 15s `AbortController` per attempt. Deterministic failures are NOT retried (flag-off / not-allowlisted / missing-config / any non-429 4xx). **The return contract is unchanged and purely additive:** `[]` for a served-empty result, `null` after retries are exhausted, never throws — so none of the 16 consumers (12 routes, 2 jobs, 2 lib helpers) change behavior. This landed as **B3 step 1**, a prerequisite for making the nightly fail-closed on a null pipe read (steps 2–4): fail-closed without retry would trade silent-wrong for flaky-loud — a single 429/transient 5xx would fail a whole run. (No pre-existing KNOWN_ISSUES entry described this gap; it was added here.)

### Nightly conversions reads now FAIL CLOSED on a null pipe (2026-07-19)
**B3 step 2.** The defect: a site whose conversions read returned null (`fellBack`) fell through to `queryPostHog`; post-D3 the dead PostHog store returns `[]` with no throw → `{ processed:0, failed:0, queryFailed:false }` → the site was absorbed as an **empty day**, and the run reported **SUCCESS** if any other site served. A failed read was indistinguishable from a site with no conversions — on the money rail. Now (safe because step 1 added retry, so a null = "failed after 3 attempts"):
- **`processSite`** (cron normal path, reads enabled): a null pipe returns `{ processed:0, failed:0, fetched:0, queryFailed:true, served:false, fellBack:true }` and does **NOT** call `queryPostHog`. `queryFailed` → `totalHardFailures` → `computeTerminalStatus` **'failed'**, **without throwing** (per-site isolation — the other sites still process). **Short-circuit:** no conversions were fetched, so the per-conversion touchpoint reads are never reached for a failed site.
- **`fetchBackfillConversions`** (manual `--backfill-site`): a null pipe **throws** → `runBackfill`'s existing terminal catch exits non-zero. Backfill is single-site and does **NOT** reach `totalHardFailures` (separate path, no worker loop, no `job_runs` row) — so no new machinery was invented; it reuses the existing exit-on-throw.
- A served-empty **`[]`** is still a **successful empty day** (`served:true, queryFailed:false`) — that distinction is preserved and explicitly tested.
- The reads-**DISABLED** path (`!TINYBIRD_READ_ENABLED`, not reprocess) still uses `queryPostHog` — that's the legitimate pre-cutover leg.

### Nightly touchpoints read now FAILS CLOSED + fellBack is surfaced (2026-07-19)
**B3 step 3.** *Half A:* the touchpoints read in `processConversion` previously fell to `queryPostHog` on a null pipe; on a throw it set `touchpointRows=[]` and **continued**, writing the conversion with `touchpoint_count:0` — afterwards **indistinguishable** from a genuine no-touchpoint conversion (no column records read provenance; Q4b). That is silent **mis-attribution**, worse than a missing row. Now a null touchpoints pipe **THROWS**, which lands in `processSite`'s per-conversion `try/catch` (`nightly-attribution.js` write loop) → the conversion is **SKIPPED** (`failed++`, nothing written) instead of written wrong. A **served-empty `[]`** is a genuine no-touchpoint conversion and is still **written normally** (`touchpoint_count:0`) — that distinction is preserved and regression-guarded. The reads-**DISABLED** path keeps `queryPostHog` (pre-cutover leg; step 4 deletes it). *Half B:* `fellBack` (a site whose conversions pipe returned null) was set but never read by the worker loop — now it is counted (`totalFellBack`), logged per-site, added to the run summary, and embedded in `job_runs.error_message` via `computeRunErrorMessage`. It is **informational only** — `queryFailed` still drives terminal status; `fellBack` did not change status semantics.

### Nightly is now Tinybird-sole; reads-disabled refuses to start (2026-07-19)
**B3 step 4 (final).** `queryPostHog` and all three fallback legs (conversions, touchpoints, backfill) are DELETED, along with the `POSTHOG_*` module consts + the two POSTHOG vars in the boot env-guard. The nightly reads Tinybird only; PostHog is fully off the runtime path (this cleared the last of D5's three boot guards → **D5 is unblocked**). **Reads-disabled decision (chosen: refuse to start):** post-decommission there is no fallback read path, so `main()` now throws a clear error and refuses to start when `TINYBIRD_READ_ENABLED` is off — before the backfill dispatch and the run lock, covering both cron and `--backfill-site`. This was chosen over "hard-fail per-site" because a globally-disabled read is always a misconfiguration (every site would fail identically), and one loud boot error is less surprising than a run that writes a `running` row, processes N sites all failing, and reports `failed`. Belt-and-suspenders: each read leg also throws a `no … read path` invariant, so no path can silently no-op even on a direct call. (Prod does not set `TINYBIRD_FORCE_READ`, so this is the path that would bite during a real incident.)

### Circuit-breaker gap: a per-site touchpoints outage still runs unbounded (2026-07-19, reported not built)
B3 step 3 bounds a failed **conversions** read (it short-circuits the whole site) but NOT a failed **touchpoints** read: if a site's conversions read SUCCEEDS but the `pageviews_by_visitors` pipe is down, **every** conversion retries 3× (~51s) before throwing and being skipped. At ~210 conversions that is ~3h for one site — which collides with the no-kill-ceiling hazard below (exceed 6h → lock expires → next cron overlaps). **A per-site circuit breaker would go in `processSite`'s per-conversion loop:** track consecutive touchpoint-read failures for the current site; after N in a row, stop processing that site (mark it failed, break the loop) instead of retrying every remaining conversion. **What it must NOT break:** the served-empty distinction — a `[]` from the touchpoints pipe is a *successful* read (a genuine no-touchpoint conversion, written normally) and must **reset/not increment** the breaker; only the null→throw *read failure* counts. That requires the touchpoints null-throw to carry a distinguishing marker so the loop's catch increments the breaker for touchpoint-read failures only (not for upsert/other per-conversion errors), and resets on any success. **Not built here** — reported for a follow-up.

### 🔴 Money-rail concurrency hazard: no kill ceiling on the nightly (2026-07-19, surfaced by B3)
The nightly has **no wall-clock timeout**. `LOCK_TTL_HOURS` (`nightly-attribution.js:189`) is a **start-time guard** — a new run refuses to start only if the prior run is still `status='running'` **and** started **< 6h ago**. Nothing **kills** a long run, and there is no `railway.json`/`railway.toml` in the repo defining a cron timeout. So a degraded run (B3's retry work makes a single pipe call cost up to ~51s worst-case) can **exceed 6h → the lock expires → the next cron STARTS while the first is still running → two nightlies write `attributed_conversions` concurrently.** Both use `upsert(onConflict: site_id,conversion_event_id)`, so exact dupes collapse, but concurrent reprocess/delete + interleaved writes on the money rail are unverified and unsafe. B3 step 3's per-conversion skip bounds a fully-degraded **run** better than before (a failed conversions read short-circuits a whole site; a failed touchpoints read skips one conversion in ~51s), but the ceiling itself is **unfixed**. A real fix needs an explicit run deadline (abort + mark failed) or a lock that does not expire mid-run.

### No product analytics on SourceTrack's own dashboard (2026-07-19, D4)
D4 deleted `dashboard/src/lib/posthog.js` + the `posthog-js` dependency. That library was **SourceTrack's own product analytics on its dashboard** — `posthog.init(..., { capture_pageview: 'history_change', autocapture: true })` auto-captured pageviews and UI interactions of the people using the SourceTrack dashboard (our team + customers). **Capability lost:** visibility into how the dashboard is actually used — which pages/features get traffic, funnels, drop-off — at the moment of customer onboarding. **What replaces it:** nothing; PostHog is being fully decommissioned, and no replacement product-analytics tool is wired in. This is a **product decision, not just a migration detail** — SourceTrack is going blind on its own dashboard usage.

**Mitigating fact (why this is not a live regression):** the analytics was **already dark in prod before this PR** — `VITE_POSTHOG_*` was stripped from Railway in D4-env, and `initPostHog()` no-ops without `VITE_POSTHOG_API_KEY` (`if (!apiKey) return`). So D4-code deletes **dormant** code; nothing that was running in prod stopped running. The capability was effectively lost at D4-env; this entry records it so the gap is not silently forgotten. If dashboard usage analytics is wanted later, it needs a fresh, privacy-reviewed integration (first-party, no third-party cookies — consistent with the product's own cookieless stance).

### ✅ RESOLVED — PostHog legal copy gate cleared: project 416017 is DELETED (opened 2026-07-19, closed 2026-07-19, D5)
**CLOSED.** The gate was: could customer data still reside in PostHog? **Answer: no — PostHog project 416017 is confirmed DELETED** (the orchestrator's MCP token that previously returned `403 — API key does not have access to project 416017` now returns `404 — Project not found`; 2026-07-19). D5's env half is also done (POSTHOG_*/VITE_POSTHOG_* stripped from Railway, 12/12 zero matches, all 6 services redeployed, prod boot clean off Tinybird). So the gated edits were applied: PostHog **removed** from `Subprocessors.jsx`, and the now-false `Settings.jsx:1393` retention disclosure **removed** (no residual PostHog events exist to disclose). `Settings.jsx:1394` (paid-beta blocker) left for a founder call. A `Settings.jsx:1207` visitor-erasure correction shipped in #313. **PostHog is fully decommissioned — code, env, and project.** Original gate context retained below for the record:

Historical state (now moot): PostHog was fully off the code path (no read/write, dependency + frontend client removed) but the **historical customer data was believed to still RESIDE in the PostHog project** — the repo had **no PostHog data-deletion job or runbook**, and `COMMANDCODE_RUNBOOK.md:441/453` stated historical events were **not** bulk-deleted and retention "must be verified in the provider console." Until the founder confirmed project deletion:
- **`dashboard/src/pages/Subprocessors.jsx:22`** (`['PostHog', 'Product/event analytics (read layer)', 'US']`) is **LEFT IN PLACE.** Removing a sub-processor entry claims customer data no longer resides there; if data still sits in PostHog, that claim is false — worse than leaving it. Prepared removal: delete that one array row. **Apply only after project-deletion is confirmed.**
- **`Settings.jsx:1393`** ("Deleting your account does NOT delete historical raw analytics events already sent to … PostHog") is **LEFT IN PLACE** — it is a *true* retention disclosure while the data exists.
- **`Settings.jsx:1394`** ("Paid Beta Blocker: … PostHog retention/deletion handling") is **LEFT IN PLACE** — a founder business/legal status call.
- **`Settings.jsx:1207`** (visitor-erasure copy) WAS corrected: it claimed a PostHog deletion request that the code provably removed (erasure now targets Tinybird — `gdpr.js`, `tinybird/adapter/erase.js`, `gdpr-tinybird-erasure.test.js`); the correction preserved the exact hedged strength. **Legal note flagged, not drafted:** 1207 no longer mentions PostHog, so a visitor's residual *historical* PostHog events are not disclosed there — whether to disclose that is a human legal decision.
- **No CI guard covers customer-facing PostHog *string* mentions** (the `no-posthog-dashboard-import` guard only catches `import`s). A blanket "no 'PostHog' string" guard would be WRONG today — the retention/sub-processor copy above references PostHog *legitimately* while the data resides there. A string guard can only be added once the legal copy is finalized post-deletion.

### GDPR account-deletion: Tinybird erasure is admin-token-gated but the sites row is hard-deleted regardless (2026-07-19, log-only)
`api/routes/gdpr.js:359-363` erases each site's events from Tinybird (`_eraseSite`, `confirm:true`) **before** `sites.delete()` (`:371`) — but the eraser is **admin-token-gated**: with no `TINYBIRD_ADMIN_TOKEN` it returns `skipped_no_admin_token` and does nothing, while the sites row is hard-deleted anyway. Result on that branch: **account deleted, events retained, no error surfaced** — a silent GDPR gap. `TINYBIRD_ADMIN_TOKEN` **is** currently set on prod (verified), so the gate is not tripped today, and **this delete path has never executed in prod** (0 real account deletions). It should **fail loudly** (abort/flag) rather than skip-then-delete. Not fixed — logged.

### Site hard-delete outside gdpr.js skips Tinybird erasure entirely; no soft-delete trace (2026-07-19, log-only)
The only app path that erases Tinybird on delete is `gdpr.js`. **Any other site hard-delete — direct SQL, an admin console action, a future route — deletes the `sites` row without erasing the site's Tinybird events.** There is **no soft-delete column on `sites`** (deletion is a hard row delete; nightly auto-archive only sets `plan='archived'`), so **no trace remains** to reconcile orphaned events against. Not fixed — logged.

### events datasource accepts any present site_id with no sites-existence check (2026-07-19, log-only)
`tinybird/adapter/normalize.js:224` validates only that `site_id` is **present/non-empty** ("refusing to assign a default tenant") — it never checks the id **exists in `sites`**, and `events.datasource` (ClickHouse `MergeTree`) has no FK. **Not exploitable via the routes** — `/api/track`, `/api/pixel`, `/proxy/{e,c}` all resolve `site_id` server-side from a `site_key → sites` lookup (unknown key → 401/no-write; client `properties.site_id` lands in `custom_properties`, not top-level), so an arbitrary UUID cannot be injected there. But it is a **missing defence-in-depth guard** at the write boundary: any non-route writer (a script, `tb` CLI, cutover smoke-test) can write an unchecked `site_id`. **One orphan event exists in prod Tinybird for `site_id 79638a99-3500-4357-9e61-7c356cba1957`** (no `sites` row; timestamp = the dual-write cutover moment `2026-07-07 10:30:00.000`; UUID not in the repo) — almost certainly a cutover smoke-test write. **Read isolation holds** (82 read pipes require `site_id`; reads scope to the authenticated `req.site.id`, so it can never surface in a customer dashboard). **Leave the row; log the gap.** Not fixed.

### ✅ FIXED (#371/#376) — GDPR visitor erasure keyed off `anonymous_id`, but every row keys off `distinct_id` — erasure matched ZERO rows and still reported success (logged 2026-07-22, FIXED 2026-07-22/23)

**Right-to-erasure requests silently succeed while deleting nothing.** Found as by-catch while investigating whether the erasure path would cover new PII (it does not cover the *existing* data either).

`api/routes/gdpr.js:119-139` takes `anonymous_id` from the request body and deletes with:

```js
.from('attributed_conversions').delete()
  .eq('site_id', site.id)
  .eq('anonymous_id', anonymous_id)
```

But **`anonymous_id` is NULL on effectively every row**, while `distinct_id` (NOT NULL) is what the rest of the system keys on:

| store | rows | `anonymous_id` NULL | `distinct_id` populated |
|---|---|---|---|
| **prod** `attributed_conversions` | 5 (1 site, `techrupt.pk`) | **5/5** | 5/5 |
| **staging** demo site `de200000-…0001` | 35 | **35/35** | 35/35 |

Everything user-facing keys off `distinct_id`: `journey.js:100` (`WHERE distinct_id = …`) and `journey.js:160` (`.eq('distinct_id', visitorId)`), `leads-server.js:71,101,288` (raw `distinct_id` **is** the lead id), and the `visitor_id` field added to `/analytics/recent-conversions` in #368. So the id an operator actually has in hand is a `distinct_id`, and passing it to `/gdpr/visitor` matches **no** `attributed_conversions` row.

**Both legs are affected.** The Tinybird leg (`gdpr.js:172`) passes the same value as `subjectId`, and `buildDeleteCondition` (`tinybird/adapter/erase.js:51`) matches `distinct_id = '<subject>' OR visitor_id = '<subject>'` — so whether it erases depends on which id the caller happened to supply. The two legs can therefore disagree: Tinybird events erased, Supabase attribution rows retained.

**The failure is silent, which is the worst part.** A Postgres `DELETE` matching zero rows is not an error, so `dbErr` is null and the endpoint returns:

> `Visitor data for anonymous_id "…" has been erased.`

That is a **false confirmation on a GDPR Article 17 request** — the compliance defect is the untrue response as much as the retained data.

**Blast radius today is small** (5 prod rows, 1 site, and there is no evidence any erasure request has been served), but the code path is wrong and scales wrong: every future conversion row inherits the same NULL `anonymous_id`.

**✅ FIXED in #371 (2026-07-22), extended in #376 (2026-07-23).** #371 keyed both legs on `distinct_id` (matched across both id columns, site-scoped), added `{ count: 'exact' }` so a zero-row delete can never again report success, and brought `lead_qualifications` + `subscription_identity` into the erasure/access paths. #376 added the `volunteered_identity` FK cascade and extended the standing rule to **all three** GDPR paths (`CLAUDE.md:131` / `AGENTS.md:141` record it). **Ledger note (why this stayed open):** #370 logged it, #371 fixed it — but the fixing PR never closed this entry, so it read "Not fixed" for two days while the code was correct. That is the exact stale-doc trap that cost a full exchange this session; hence this reconciliation.

### `DEMO_PLAN` header comment documents a fixture shape that does not match what the code builds (2026-07-22, docs-only)

`scripts/lib/attribution-fixture.mjs` header claims *"45 visitors — Organic 14 (31%) … 16 journeys carry an AI touch somewhere (36%)"*. Executing `buildDemoJourneys()` on `origin/main` yields **46 visitors, Organic 15 (33%), 15 AI-touch journeys (33%)**. Pre-existing drift, verified against pristine `origin/main` (not introduced by the reshape in #369, which is exactly neutral on all three). Harmless today — the 30% AI floor still holds and the seeder prints the *computed* shape at run time, so nobody is misled operationally — but the comment is the thing a reader trusts when deciding whether a change broke an invariant. One-line correction whenever convenient.

<!-- ─────────────────────────────────────────────────────────────────────────
     Session 149 backlog (2026-07-23) — deferred polish + ecom feature gaps.
     Logged, not fixed. Sessions B (named contacts) + C were live when filed;
     items that collide with their surface say so.
     ───────────────────────────────────────────────────────────────────────── -->

### All Leads: "46 shown" vs "TOTAL LEADS 35" reads as a contradiction (2026-07-23, deferred polish)

The All Leads page shows a row count of **46** alongside a **TOTAL LEADS 35** KPI. Both are correct and mean different things — **46 = all visitors** (converters + non-converting browsers), **35 = converters**. With no label distinguishing them they read as a bug. Needs a one-word qualifier on each (e.g. "46 visitors" / "35 converted"). **Deferred:** the fix lands on the same Leads surface as Session B's named-contacts columns; doing it now collides. Log-only until that PR settles.

### Dashboard "Recent Conversions" uses a narrow recent window, not the selected range (2026-07-23, deferred polish)

The Dashboard's Recent Conversions card renders "No conversions in the recent window" even when conversions exist inside the **selected date range**, because it reads a narrow recent window rather than the range picker. Attribution's equivalent card was already widened to the selected range in #368; Dashboard was not. Two fixes are viable: **(a)** widen to the selected range (parity with Attribution's post-#368 behaviour — preferred), or **(b)** relabel the card "last 24h" so the copy matches the narrow window it actually queries. Either is honest; the current state is not. Collides with Session C dashboard work — log-only for now.

### recent-conversions is raw-UTC while /dashboard/overview is tz-aware — non-UTC sites diverge at the window edge (2026-07-23, deferred polish)

`analytics.js:774` (`/analytics/recent-conversions`) computes its window in raw UTC, while `/dashboard/overview` is timezone-aware. For a non-UTC site the two can disagree by up to a day at the range boundary — a conversion can appear in one surface and not the other on the edge day. Already flagged in #368 as the accepted limitation of that PR (the 30-minutes-vs-30-days gulf was the fix; exact tz-boundary parity was explicitly not claimed). Demo site is UTC so it is invisible there. **Fix:** make the recent-conversions window tz-aware like overview. Log-only.

### ~~onboarding gate checks the SELECTED SITE, not the ACCOUNT~~ — RESOLVED 2026-07-28

Filed 2026-07-23 as latent. **Two defects were tangled here, and they were coupled — which is
why neither could be closed alone.** Both are now fixed.

**Half 1 — silent site SUBSTITUTION (was REAL, and was still live when this was resolved).**
`resolveDashboardSite` only honoured an explicit `site_key`/`site_id` match when the matched
site was already `onboarding_completed`. Selecting an unfinished site failed that guard, fell
through, and returned a **different** site — different `site_id`, `site_key`, `domain` — with
nothing in the payload saying a substitution had occurred. Mainline, not an edge case:
`App.jsx` sends the site switcher's persisted key on every protected-route evaluation, so this
fired whenever a user picked a site they had not finished setting up. Note the original entry
credited #366 with fixing site-substitution; that was **inaccurate** — the substitution was
still present and is fixed only now. Reproduced first, then fixed
(`api/tests/resolve-dashboard-site-selection.test.js`).

**Half 2 — account-vs-site conflation (was REAL, but its stated SYMPTOM was not).**
This entry predicted users "pushed back into onboarding they have already completed". That was
**never observable**, and a 2026-07-26 pass correctly found it not reproducible — because
Half 1 was **masking** it: the substitution returned a completed site, so the gate stayed
satisfied. The conflation was real all the same, in `App.jsx`'s Phase-4 rule
(`!onboarding.completed`, the ACTIVE site) rather than in `onboarding.js:63-67`.

**The coupling, which is the part worth remembering:** fixing Half 1 alone would have
**activated** Half 2 — the resolver would start answering truthfully, the gate would see
`completed: false`, and the user WOULD have been force-marched into the wizard, exactly as
predicted here. The "not reproducible" verdict was right about the observed symptom and wrong
to be read as "no bug"; the "latent" framing was right about the defect and wrong about which
file held it.

**Fix:** the explicit-selection guards drop the completion requirement (an explicit selection
is authoritative), `GET /onboarding/me` returns a new ACCOUNT-level `has_completed_site`
computed from the sites array it already fetches, and `App.jsx`'s force-redirect keys off that
instead of the active site. Genuine first run (no finished site anywhere) still hard-redirects.
An unfinished ACTIVE site is now handled by `Layout.jsx`'s existing "Resume setup" affordance —
an offer rather than a forced march, which is what it was built for.

`has_completed_site` is computed SERVER-side deliberately: deriving it in the gate from a
separately-loading `/sites` call would have added a second async source whose loading/error
state could be read as "no completed sites" → redirect, recreating the 140Z-G3-C
(`ff23e44`) redirect-loop shape. Loop-freedom is now structural and asserted: leaving
`/dashboard` needs `!has_completed_site`, leaving `/onboarding` needs `onboarding_completed`,
and a completed ACTIVE site implies a completed site exists — so both rules can never fire from
the same response. Pinned across every account shape in
`api/tests/onboarding-gate-matrix.test.js`, which also pins the App.jsx rule text so the matrix
cannot drift into testing a copy.

### 🔴 REFUNDS — LAUNCH GATE for ecom, not a feature request (2026-07-23, correctness defect)

**Promoted from "nice-to-have" to launch gate.** Ecom return rates run 20–30%. With no refund handling, **attributed revenue is systematically OVERSTATED** — the product reports money that was returned as if it were kept. For an ecom customer that is a **§5.1 data-truth violation committed with our own numbers**, the exact class of defect the truth rules exist to prevent — not a missing feature. Already tracked as Phase 7 "money rail + refunds". This entry reclassifies it: refunds must land before ecom revenue can be marketed as accurate. Until then, any ecom revenue figure carries an unstated upward bias equal to the return rate.

**STATUS 2026-07-24 — code complete (#381 / #382 / #383 / #384 / PR2d), gate NOT discharged.** #381 nets a Stripe refund to its original conversion; #382 makes the Supabase route read paths refund-aware; #383 does the same for 19 Tinybird pipes (**authored, NOT deployed**); #384 adds Shopify `refunds/create` netting; PR2d extends the count-exclusion to the 5 engine pre-agg readers #382 missed (KI-61). **Why the gate stays OPEN:** (1) **PR2b (#383) is merged but undeployed**, so Tinybird conversion counts still include refunds in **both** workspaces until the deferred cutover; and (2) **no real refund payload has ever been processed on either provider** — all tests use in-process fixtures, and prod has **no connected Stripe or Shopify webhook**. The gate discharges only after the Tinybird cutover AND a real refund is verified end-to-end on a connected merchant.

**⚠️ Precise on what "code complete" means for the Supabase leg:** PR1's per-source *netting* in Supabase — the property route (i) was chosen over route (ii) for (a refund inherits the original `distinct_id`, the nightly re-derives `first_touch_source` from that visitor's touchpoints at `nightly-attribution.js:866`, and the negative value nets against the acquiring source in `attributed_conversions`) — is **code-present but NEVER EXERCISED on a real refund.** Verified 2026-07-24: `attributed_conversions` holds **0 refund rows** across all 9 staging sites; the ~12k Tinybird refund events all sit on pipe-test fixtures (`site-00..04`, the "Phase9" sites, `ff8d5426`) that have **0** `attributed_conversions` and aren't nightly-processed. The write path is correct-by-inspection (`nightly-attribution.js:720` exempts `conversion_type='refund'` from the negative-value skip; `nightly_conversions_by_site.pipe` has no refund filter), but it has never run end-to-end. Do not describe the Supabase per-source netting as verified — only the Tinybird event-plane `distinct_id` + count-inflation fixes are.

### V1.1 — new-vs-returning CUSTOMER (not just visitor) + true CAC (2026-07-23, ecom feature gap)

Today we track new/returning **visitors** (§6.1). Ecom needs new/returning **customers**: new-customer revenue and true CAC. A source that only re-converts **existing** customers is worth materially less than one that acquires **new** ones, and current attribution cannot tell them apart — so CAC is not truly computable. **V1.1**, gated; do not surface without a flag and real data. Not a V1 gap, recorded so it is not re-discovered from scratch.

### V1.1 — cold-start / historical backfill (activation risk) (2026-07-23, ecom feature gap)

We are forward-only, so a newly onboarded merchant sees an **empty dashboard for weeks** until data accrues — an activation risk precisely at the moment a new customer is deciding whether to keep the product. **Caveat that shapes the fix:** *orders* can be backfilled (Stripe/Shopify history is queryable), but *journeys* cannot (there were no first-party pageview events before the tracker was installed). So a backfill can seed revenue/customer history but not touch-level attribution — the honest framing is "historical orders, attribution starts now." **V1.1.**

### Deferred boundary (NOT a gap): native Shopify app vs manual-webhook-only V1 (2026-07-23)

V1 is manual-webhook-only for Shopify (§17.6); there is no native Shopify app / one-click install. This is **real ecom acquisition friction** (merchants expect an App Store install), but it is a **deliberate V1 boundary, not a defect**. Revisit when ecom is a proven segment worth the native-app build + review cost. Recorded so the friction is not mistaken for an oversight.

### Explicitly REJECTED as wrong-lane (2026-07-23, scope guard)

Logged so these are not re-proposed as gaps each competitive-analysis pass. **Out of lane** for SourceTrack's attribution-truth positioning: COGS / POAS / true-profit, per-SKU margin analytics, CLV/LTV cohorts, Google Shopping labelizer, ad-creative analytics, multi-market view, agency portal (§11.6), and a native mobile app. These belong to profit-analytics / ad-ops / agency tools — a different product. Rejecting them is a positioning decision, not a backlog; adding any of them would blur the lane, not extend it.

### ✅ RESOLVED — volunteered_identity orphaned real PII on account deletion (missing FK cascade) (2026-07-23, #376)

`volunteered_identity` (name/email, added in #373) shipped with `site_id` as a bare `uuid` — **no FK to `sites`**. Its three sibling PII tables (`lead_qualifications`, `site_identity_links`, `subscription_identity`) all carry `site_id → sites(id) ON DELETE CASCADE`, so `DELETE /api/gdpr/account` (the ONLY path that deletes a `sites` row — there is no per-site delete route; `sites.js` is GET-only) cascade-purges them. `volunteered_identity` had **neither** a cascade **nor** an explicit delete in `/gdpr/account`, so account/workspace deletion left **real volunteered emails/names as orphans** — a retention defect on genuine PII. **Verified on staging** via the live FK catalog (3 siblings CASCADE, `volunteered_identity` + `attributed_conversions` have no FK; `attributed_conversions` is covered by an explicit delete, `volunteered_identity` by nothing). **FIXED** by migration `20260723130000` adding the cascade FK (one mechanism, matching the siblings — deliberately not also an explicit delete). The #372 standing rule caught `/visitor`+`/subject` but had not named `/account`; the rule was extended (CLAUDE.md §6.5 / AGENTS.md §5.5) to require all three paths.

### volunteered_identity has a redundant index (2026-07-23, cleanup-only)

`volunteered_identity_distinct_idx` on `(site_id, distinct_id)` **duplicates** the index the `UNIQUE (site_id, distinct_id)` constraint already creates on the identical columns — redundant, a small write-amplification cost. **Not fixed:** dropping it needs its own migration applied to both envs to keep the schema-drift gate green; not worth a round on its own. Fold into the next `volunteered_identity` migration that touches the table for another reason.

### Cross-ref: account-deletion PII coverage — Supabase leg vs the two Tinybird KIs (2026-07-23)

The #376 fix above is the **Supabase** leg of account-deletion PII coverage. It is **distinct from** the two 2026-07-19 account-deletion KIs, which are the **Tinybird** leg: *"GDPR account-deletion: Tinybird erasure is admin-token-gated but the sites row is hard-deleted regardless"* and *"Site hard-delete outside gdpr.js skips Tinybird erasure entirely; no soft-delete trace."* Together: account deletion must purge PII from **both** stores; #376 closes a Supabase-table gap, those two remain open on the Tinybird/event side.

### 🔴 schema-drift gate is BLIND to constraints/FKs/indexes/RLS — columns only (2026-07-23, surfaced by #376)

`scripts/schema-snapshot.sql` reads **only `information_schema.columns`** — so the drift gate diffs column names/types/nullability and **nothing else**. It does NOT capture foreign keys, `ON DELETE` rules, unique/check constraints, indexes, RLS enablement, or policies. **Proven by #376:** that PR's migration adds `volunteered_identity_site_id_fkey` (an FK absent from staging + prod), yet `schema-drift` went **GREEN** — an FK-only migration is invisible to the gate. Two consequences: (1) a green drift check does **NOT** confirm staging/prod match migrations for anything but columns — an FK/index/RLS migration must be verified applied **out of band** (query `pg_constraint` / `pg_indexes` / `pg_policies` directly); (2) constraint/FK/RLS drift can accumulate silently between environments, the exact failure mode this gate exists to prevent (§8 "prod is often *tighter*"). **Not fixed:** extend `schema-snapshot.sql` to also snapshot `pg_constraint` (conname/contype/confdeltype), `pg_indexes`, and `pg_policies` per table, and re-baseline the ignore file. Until then, treat green schema-drift as a **column-only** guarantee.

<!-- ─────────────────────────────────────────────────────────────────────────
     Session 149 close-out (2026-07-23) — two verification/backend-gap items
     surfaced by the #366–#378 arc. Logged, not fixed. (The schema-drift-blind
     and redundant-index items this session also touches were already filed by
     #376 above — not duplicated here.)
     ───────────────────────────────────────────────────────────────────────── -->

### GDPR erasure — the live authed HTTP round-trip is UNVERIFIED (data layer proven, UI flow not) (2026-07-23, verification gap)

The #371 erasure/access key fix is proven **at the data layer**: a disposable-probe row was inserted and erased through the corrected `distinct_id` predicate (**1 row deleted → 0 remaining**, the demo dataset left untouched), and the Tinybird leg's `matched` sum was exercised. What is **NOT** yet verified is the **end-to-end authed HTTP round-trip** — the actual **Settings → "Erase Visitor Data"** flow a real operator uses (auth, `site_key` resolution, the route itself, and the 404-on-no-match response rendering) has had **no browser pass**. So the erasure LOGIC is correct while the shipped USER FLOW around it is unconfirmed — the two are different claims. **Next:** one authenticated browser pass on staging against a disposable subject id, asserting the reported deleted counts and the 404 "no data found" copy. Until then, do not describe the erasure feature as end-to-end verified — only its data layer is.

### Leads Browser/Device columns are blocked on a pipe gap — batch with Campaigns source/medium (2026-07-23, presentation blocked on backend)

The C3 Leads redesign (#377) ships a column picker but deliberately **omits Browser and Device**: `tinybird/pipes/leads_list.pipe` does not `SELECT` them, and `leads-server.js` adds only Supabase joins — so the fields do not exist on `/leads`, and rendering them would mean **inventing a per-row value** (the #374 fabrication class, refused correctly). Shipping them needs a **new pipe column** — backend work + a founder-gated Tinybird deploy — not a UI change. **Batch it with the Campaigns source/medium gap** that #374's fabrication removal left as a hidden column: a truthful per-campaign source/medium needs a **`campaign × source`** two-dim read, which **no Tinybird pipe serves** (`servedReportShape` rules 6/7/8 are single-dim only — `!group_by2`). **⚠️ Framing correction (2026-07-24):** an earlier version of this entry said *"the current route 422s on `group_by2`"* — that conflated two different things. **The Campaigns route never sends `group_by2`** — it passes `null` (`campaigns.js:54`); its shipped, user-visible 422 is the **single-dim** source/medium tab under the hard-coded `last_touch` model (**KI-53**), NOT a `group_by2` failure. The `group_by2` path lives in the **Report Builder** route (`attribution.js`), where a two-dim request **silently returned single-dim data** (not a 422) until it was gated in PR-A (**KI-60**). Serving `campaign × source` truthfully needs either a new two-dim pipe (deploy) or two-dim-capable pre-agg readers. Until then both surfaces correctly show nothing rather than a fabricated default.

### Dead CAPI senders: LinkedIn CLOSED (#514); Microsoft is held deliberately, not a dead sender (filed 2026-07-23 · corrected 2026-08-01 @ `6000951`)

> **This entry was FALSE on main from #514 (2026-07-30) until this correction.** It is corrected rather than deleted because the four-touchpoint checklist below is still the reason it was worth filing.

**Three claims in the original entry are stale.** Verified at `6000951`: (1) `CAPI_PLATFORMS` does **not** expose "only `meta` + `google`" — it is **five** platforms (`api/routes/capi.js:62-67`: `meta`, `google`, `ga4`, `tiktok`, `linkedin`; GA4 + TikTok arrived in #498, LinkedIn in #514). (2) **LinkedIn is no longer absent** from it — `linkedin: { tokenCol: 'linkedin_capi_token', idCols: { partner_id: 'linkedin_partner_id' } }` (`capi.js:66`). (3) **Neither platform is absent from the CAPI-column `SELECT` lists** — `microsoft_tag_id`, `microsoft_capi_token`, `linkedin_partner_id` and `linkedin_capi_token` are all present in both (`api/routes/conversion.js:439`, `api/routes/conversion-offline.js:232`). The senders' own line refs also drifted: `sendMicrosoftConversion` is `conversion-sync.js:300`, `sendLinkedInConversion` `:323`, and the `dispatchCapi` fan-out registers them at `:601-602`.

**LinkedIn — CLOSED (#514, `1754559`).** All four touchpoints below now exist: sender (`conversion-sync.js:323`, already Bearer-authenticating against `api.linkedin.com/v2/conversionEvents`), `CAPI_PLATFORMS` entry (`capi.js:66`), config card (`dashboard/src/components/CapiSettings.jsx:28`), and both `SELECT` lists. No migration was needed — the columns already existed on prod.

**Microsoft — STILL ABSENT FROM `CAPI_PLATFORMS`, and that is a deliberate hold, not an oversight.** It is **not** the "dead sender missing a config entry" this entry originally described: its sender reaches every touchpoint on the checklist and still cannot work, because it POSTs to the UET *tracking* endpoint and reads `microsoft_capi_token` only to check it is present and decryptable, never transmitting it. **The full rationale is already written into the code at `api/routes/capi.js:34-49`** — including why a config card would be actively wrong (it would save a credential that is never sent) and why finishing it is an OAuth2 sender rewrite plus new columns, not a config-map entry. **Not duplicated here on purpose; read it there.** Deliberately backlogged — revisit on real customer demand, per the Reddit/Snapchat precedent.

**Root cause worth recording — adding a CAPI platform needs FOUR touchpoints in lockstep:** (a) the sender fn in `conversion-sync.js`, (b) an entry in `CAPI_PLATFORMS` (`capi.js`), (c) a config card in `dashboard/src/components/CapiSettings.jsx`, (d) the hardcoded CAPI-column `SELECT` lists in `conversion.js` + `conversion-offline.js`. Miss any one and the sender is stillborn. **Validated in practice since:** GA4 + TikTok (#498) and LinkedIn (#514) all shipped by walking exactly these four, and the rule is now written into the comment above `CAPI_PLATFORMS` — a platform is admitted **only** once column, config card **and** live forwarding all exist. **Microsoft fails a fifth condition this checklist never anticipated:** it satisfies all four and still cannot fire, because the endpoint it posts to does not accept the credential at all.

**Not a blocker, and the delivery log needs no change:** `capi_deliveries` is platform-agnostic (`api/lib/capi-deliveries.js` — columns `site_id, platform, event_ref, status, http_status, error_message, attempt`; `platform` is a bare string), so it already records any platform without a schema change. **Decided 2026-07-30 (#514):** LinkedIn was wired through all four touchpoints; Microsoft is **kept but not exposed** — kept because the sender is a real head start on the OAuth2 rewrite, not exposed because a card would save a token that is never sent.

### analytics.js /summary refund exclusion is covered by-pattern, not directly (2026-07-23, PR2a)

PR2a excludes `conversion_type='refund'` from the `/analytics/summary` conversion COUNT and distinct-converter numerator (`analytics.js` `nonRefundConversions = conversions.filter(...)`). That predicate is **inline** in the route handler — there is no importable function to unit-test, and exercising it directly means booting the full `/summary` handler (pageview `dispatchPageviews` machinery + Supabase mock). Per the founder's call (and the `timezone-reconciliation.test.js`-becomes-a-no-op caution), a heavy handler test was **not** built. The identical `filter(r => r.conversion_type !== 'refund')` pattern **is** exercised directly against the real `/overview` and `leads/` handlers in `api/tests/refund-aware-reads.test.js`, so the logic is proven; `/summary`'s copy is **covered by-pattern, not directly**. Close the gap by either (a) extracting a shared `excludeRefunds(rows)` helper the three read paths call (one narrow unit test covers all), or (b) a `/summary` handler test if the pageview mock is deemed worth it.

### pipe-refund-guard.test.js validates the filter STRING, not that the pipe COMPILES (2026-07-24, PR2b blind spot)

`api/tests/pipe-refund-guard.test.js` asserts the `!= 'refund'` filter **string** is present in each `.pipe` file. It **cannot** detect that the filter references a column the query does not **project** — which is exactly what shipped in PR2b (#383): three pipes (`last_touch_by_site_agg`, `first_touch_non_direct_by_site`, `last_touch_non_direct_by_site`) added `countIf(... conversion_type ...)` to the OUTER aggregate while their nested subqueries never forwarded `conversion_type`, so they failed to compile with `Missing columns: conversion_type` (UNKNOWN_IDENTIFIER). The guard was **green** the whole time. PR2b's own body flagged this boundary ("correct-by-inspection only; guard is SYNTACTIC"), and it proved exactly right. **`tb --cloud deploy --check` (against a workspace, founder-run — needs a workspace token) is the ONLY compile-level validation.** A green guard is NOT a validated pipe. `first_touch_by_site` did not fail because it reads `first_touch_*`/`conversion_type` directly off the conversion row with no intermediate projection — only pipes with a nested projection need the column threaded through. Fixed by threading `conversion_type` through the inner conv SELECT + every intermediate projection in those three pipes (the fix does NOT touch the filter expression or `SUM(conversion_value)`).

### ✅ CORRECTED — privacy_signals rail WORKS in prod; the "0 rows" was a staging-only observation (logged 2026-07-24, corrected 2026-07-24)

**Original (WRONG) claim:** "the `privacy_signals` datasource has received 0 rows since deployment #24 — capture may be broken." That was based on a query of **`ST_Staging` only**, which has no GPC/DNT traffic, so it shows just the datasource create.

**Correction (prod evidence):** the orchestrator queried `organization.datasources_ops_log` **across workspaces**. Prod (`SourceTrack`, `3c371bb9-…`) shows **15 successful `append-hfi` operations** on `privacy_signals`, most recent **2026-07-24 09:59:32** — the founder's Firefox Private Browsing (GPC) visit to `techrupt.pk`. The full rail is proven end-to-end: browser sends `Sec-GPC: 1` on the tracker-script GET → `handlePrivacySuppression` (`api/lib/privacy-suppression.js`) resolves the site by `Referer` → appends `{site_id, reason, timestamp}` to `privacy_signals` → `doctor_privacy_signals_30d` reads it into Setup & Health. **Not a defect — do not delete the datasource.**

**Two real gaps this surfaced (both fixed in the same PR as the GPC no-op stub):**
- **Coverage:** suppression was wired only on the **root-alias** script routes (`/tracker.min.js`, `/tracker.cookieless.min.js` — what prod installs use), not on the `/tracker/<file>.min.js` static form (`api/index.js:366`). Now fired on both so any install form counts.
- **Misleading diagnostic:** the `site_not_found` branch logged `domain=${domain}` where `domain` was undefined (`privacy-suppression.js:68`), so a genuine site-not-found threw into the outer catch and logged `failed: domain is not defined` instead of a clean skip — masking the one case it most needed to diagnose. Fixed to `${hostname}`.

### 🔴 Tinybird event plane stamps `first_touch_source='stripe'` on ALL Stripe conversions (purchases included) — the two stores disagree on per-source revenue for every Stripe sale (2026-07-24, pre-existing, NOT refund-specific)

The Stripe webhook writes `first_touch_source='stripe'` / `first_touch_medium='webhook'` on the `$conversion` **event** (`stripe-webhook.js`, purchases AND refunds). Orchestrator verified on `ST_Staging`: **11 of 11** real `cs_*` webhook purchases carry `'stripe'`/`'webhook'`. **Supabase is correct** because the nightly re-derives `first_touch_source` from the visitor's pageview touchpoints (`nightly-attribution.js:866`), overriding the event stamp; **Tinybird is NOT** — its read pipes read the stamped `'stripe'` directly. So **per-source revenue disagrees between the two stores for every Stripe sale** (Supabase → the real acquiring source; Tinybird → 'stripe'). This is **pre-existing and NOT refund-specific** — the refund PRs (#381–#384) kept the refund SYMMETRIC with the purchase precisely so this pre-existing gap isn't made worse. **Fixing it requires stamping the TRUE acquiring source on the purchase AND the refund writes in the SAME change** — doing the refund alone would fabricate negative revenue on a source that never earned it (§5.1). **Not fixed — logged.**

### 🔴 Tinybird prod cutover batch — four items, gated on the token rename, with the acceptance baseline (2026-07-24)

The deferred Tinybird prod cutover carries **four** authored-but-undeployed changes. `tb --cloud deploy --check` against prod is the mandatory pre-deploy gate (founder-only, §8). **Order matters — item (a) is a hard prerequisite:**

- **(a) Rename `dual_write_append` FIRST (KI-54).** Both `ST_Staging` and `SourceTrack` (prod) contain a token with the **identical name** `dual_write_append` — no workspace information in the name, which is what caused a prior prod write. The cutover deploys a datasource that binds this token, so the rename (e.g. `dual_write_append_staging`) MUST land before the batch, or the ambiguity is deployed in.
- **(b) `multitouch_pageviews_live`** — prod runs a **pre-rename** version whose params are `lookback`/`to`; **40 of 59 calls 400'd (66%)**. The cutover ships the fixed param names.
- **(c) PR2b's 19 refund-filtered pipes (#383)** — exclude `conversion_type='refund'` from conversion COUNTs. Until deployed, Tinybird counts include refunds in **both** workspaces.
- **(d) `privacy_signals` datasource** — deployed and **confirmed writing in prod** (see the corrected privacy_signals KI above); no cutover action needed for this item.

**Cutover acceptance baseline** (from PR #383; copied here because the person running the cutover will look at the KI, not a merged PR description). Live-queried on `ST_Staging` (deployment #24, pre-PR2b) by the orchestrator 2026-07-24 — **regenerate before the cutover; do not trust this snapshot if staging received new data since:**

| site_id | conversions NOW | conversions AFTER | drop | revenue (MUST NOT CHANGE) |
|---|---:|---:|---:|---:|
| site-00 | 16262 | 13795 | 2467 | 2918519.97 |
| site-01 | 16261 | 13814 | 2447 | 2958558.04 |
| site-02 | 16314 | 13886 | 2428 | 2983380.40 |
| site-04 | 16161 | 13768 | 2393 | 2947122.61 |
| site-03 | 16039 | 13708 | 2331 | 2938146.91 |
| 13777fda-3d1e-48eb-a1d3-6b3bdb18f609 | 249 | 207 | 42 | 46577.50 |
| ebce5c1e-879a-4a41-9da2-d34a7964f3eb | 249 | 207 | 42 | 46577.50 |
| ad643f7e-ff73-42e0-8f53-7289f02292a9 | 209 | 172 | 37 | 39030.89 |
| ff8d5426-1713-48af-811b-5c12bd2257dd | 85 | 68 | 17 | 13346.39 |
| de200000-refd-41d4-a716-446655443333 | 2 | 1 | 1 | 60.00 |

**Invariant 1** — post-deploy conversion counts equal the AFTER column exactly. **Invariant 2** — revenue is **byte-identical**; any movement means a `SUM` was touched that shouldn't have been → **ROLLBACK**.

Regenerate the baseline with (read-only, `ST_Staging`):

```sql
SELECT site_id,
       count() AS conversions_NOW,
       countIf(conversion_type != 'refund' OR conversion_type IS NULL) AS conversions_AFTER,
       count() - countIf(conversion_type != 'refund' OR conversion_type IS NULL) AS expected_drop,
       round(sum(conversion_value), 2) AS revenue_must_not_change
FROM events
WHERE event_type = '$conversion'
GROUP BY site_id
HAVING expected_drop > 0
ORDER BY expected_drop DESC
```

### tracker/analytics.js posts to legacy /api/analytics/collect via the same blocked sendBeacon pattern (2026-07-24) — RESOLVED, file DELETED

The adblock-transport fix (keepalive fetch, both shipped trackers) deliberately **EXCLUDED** `tracker/analytics.js`. That file still sends via `navigator.sendBeacon` (`:46`) to the **legacy** `/api/analytics/collect` endpoint — the identical `$ping,third-party` blocked-beacon pattern the fix removed from `tracker.js` / `tracker.cookieless.js`. It was excluded because it is **unbuilt** (not in `build:tracker`, no `.min.js` artifact) and had **no verified consumer** — status UNVERIFIED whether any live site loaded it. **Do NOT fix it in place** (that maintains a fourth dead-code-that-looks-live surface — the `ai-client.js` / MS+LinkedIn CAPI-sender class). **Next step:** determine whether any live site loads `tracker/analytics.js`; if none, **DELETE** it (and confirm the legacy `/api/analytics/collect` route's remaining consumers before touching that). Fix only if a real consumer is found — and then via the keepalive transport, not sendBeacon.

**RESOLVED (2026-07-27): the "no verified consumer" question was answered NO, and the file is deleted.** The next-step check above was run in full, including the two classes a code grep cannot see:

1. **Zero in-repo references** — plain-STRING sweep of the basename repo-wide (not just imports), so manifests/configs/CI yml were covered. Only hits are doc prose. **Not** in `scripts/qa-static-launch-check.mjs`'s hardcoded file array — the trap that reddened CI when `ai-analytics.js` was deleted in #315. **Not** in `build:tracker` (that script builds `tracker.js` + `tracker.cookieless.js` only).
2. **NOT bundled into the dashboard, contradicting three docs.** `README.md:65`, `ARCHITECTURE.md:36` and `FEATURE_MAP.md:50` each describe it as "bundled into our own dashboard" for internal analytics. That is **false**: no `<script>` in `dashboard/index.html` or `dashboard/public/`, no import anywhere in `dashboard/src` (the four `analytics.js` mentions there are comments about `api/routes/analytics.js`), and it is absent from `dashboard/dist`. Those three lines are stale and now dangle — see the follow-up note below.
3. **It WAS publicly served, which is the one real risk grep cannot see.** `api/index.js:372` is `app.use('/tracker', express.static('tracker'))`, so the whole directory is exposed. Verified live: `GET https://api.srctk.com/tracker/analytics.js` → **HTTP 200, 4239 B**, serving this exact file. Anyone who had hardcoded that URL was a consumer invisible to every code search.
4. **But nothing has ever used it.** The file's only endpoint is `POST /api/analytics/collect`, whose only write targets are `pageviews` and `custom_events` (`api/routes/analytics.js:250` / `:288`). On prod (`zxjjjsipafojhzkkumvh`) **both are 0 rows**. The collector has never produced a single row, so no live install has ever run this script successfully. Deleting it makes `/tracker/analytics.js` 404 — for a URL that has never yielded data.

**Left untouched, deliberately:** `POST /api/analytics/collect` and `api/routes/analytics.js`. Per the original entry that is a separate decision needing its own consumer-confirmation pass. The 0-row evidence above is suggestive but is NOT that pass — the route is also reachable by any other client, and its quota/bot/PII guards are shared behaviour.

**Follow-up (not done here, one line each):** `README.md:65`, `ARCHITECTURE.md:36`, `FEATURE_MAP.md:50` now describe a file that no longer exists, and described it wrongly even before the deletion. They need the "bundled into our own dashboard" claim struck.

**Residual-population note (from the keepalive fix):** Firefox gained `fetch` keepalive only in **133 (Dec 2024)**, so pre-133 Firefox feature-detects false and falls back to the blocked `sendBeacon` path. Small and shrinking — but Firefox is a **high-adblocker-usage** browser, so the residual gap sits in exactly the wrong population. No code change (the feature-detect is correct); logged for visibility.

### Stale reading-list pointers to root docs archived 2026-07-24 (follow-up sweep)

`COMMANDCODE_RUNBOOK.md:15-17` (reading list) and `docs/development_workflow_master_plan.md` (×3, cites "RULES.md R9") still point at `RULES.md` / `AGENT_BRIEF.md` / `PROJECT_CONTEXT_COMPACT.md`, which moved to `docs/archive/2026-07/` in the archive PR. **Pre-existing prose debt, not a contradiction that PR creates** (neither doc is stamped "reviewed-current"), so it was left as-is. Repoint to `CLAUDE.md` / `AGENTS.md` in a future docs sweep.

### 28. GDPR Art. 15 Disclosure Asymmetry — `/subject` vs account-export path

Two paths in `api/routes/gdpr.js` disclose different columns for `lead_qualifications`, creating an Art. 15 gap where what is disclosed does not match what Art. 17 erasure removes (violates CLAUDE.md §6.5).

**`/subject` path (fixed in #432):**
`gdpr.js:379` — `.select('visitor_id, status, qualified, created_at')`
Correctly discloses `created_at` (real column, confirmed live prod).

**Account-export path (`buildGdprExport`):**
`gdpr.js:~688` — `.select('status, qualified_by, qualified_at')`
Comment directly above says: *"NOTE: schema has no created_at/updated_at; qualified_at is the real timestamp column"* — this is half-wrong. `lead_qualifications` DOES have `created_at` (confirmed live prod, zxjjjsipafojhzkkumvh). Only `updated_at` is absent. The comment is stale and the path silently omits `created_at` from the export.

**Fix required (when CI quota is back):**
1. Correct the comment at `gdpr.js:~687` — change "schema has no created_at/updated_at" to "schema has no updated_at".
2. Update the account-export select to add `created_at`: `.select('status, qualified_by, qualified_at, created_at')` so both paths disclose the same columns for the same table.

Found by CC during #432 review. Not a crash (no phantom column). Not in scope for #432.

### Goals section has no unit test (2026-07-27, issue #447)

`/api/analytics/goals` uses the `_queryTinybirdPipe` seam and is testable via the `live-visitors-degraded.test.js` pattern (no network, no DB). Test should cover: `'refund'` + `'untyped'` exclusion, zero-conversion / revenue-only buckets dropped, the null-read throw (which surfaces as `QueryError` in the UI rather than "No goals tracked yet"), `total_visitors: null` pinned so nobody adds a second denominator, and `goalLabel` cases. Any new test file must also be registered in `qa:identity:unit` — `test-registration-guard` fails on an unregistered file. Backlogged as issue #447.

### Admin drift comparison is index-keyed not name-keyed (2026-07-27)

`admin.js` probe array (17 entries) and `prevFeatures` array (18 entries) don't align — the probe array has no `AI Chat` entry, so alignment breaks at index 6. From there on every feature is diffed against the wrong previous entry (`offline conversions` vs `AI Chat`'s status, and so on). **11 of 17 features report a misattributed previous status.** Fix: key the lookup by name instead of index. One PR, `admin.js` only. Found during #444; out of scope for that PR.

### CI collapse (qa:all) — CLOSED, REFUTED BY MEASUREMENT (2026-07-27, #455 closed unmerged)

`qa:all` exists (#449) and the blocker is fixed. Note the blocker was **not** a cross-suite isolation bug as originally framed: `node --test` gives every file its own child process, so env cannot bleed between files (verified with a two-file probe). The real cause was `import 'dotenv/config'` making the guard stop firing on any machine with a `.env`, after which the suite called `SOURCETRACK_API_URL` — default `http://localhost:3000`. Fixed by requiring `SOURCETRACK_API_URL` explicitly and using `t.skip` instead of a silent `return`.

**The collapse itself was then built, measured on real CI, and REFUTED. `ci.yml` deliberately still runs the 4 sequential `qa:*` invocations. Do not re-attempt it.**

| | unit-test time | job total |
|---|---|---|
| Before — 4 steps, 5 green runs on `main` | 118, 120, 120, 121, 122s (mean ~120s) | 166–173s |
| After — 1 × `qa:all`, run `30291793144`, green | **121s** | **174s** |

121s is inside the 118–122s baseline band, so there is no saving. The ~30% figure came from a laptop (31s → 22s) and did not transfer: `node --test` already spawns a child process **per file**, so collapsing four invocations saves ~4 node/npm startups, not a fraction of 120s. The local gain was concurrency-pooling ~186 files on a many-core machine; a 2-core runner has no such headroom. (Mechanism is a hypothesis; the 121s is measured.)

It also removed per-suite failure locality in the CI UI — a real cost for no gain.

**The one useful residual**, filed as non-urgent backlog in `NEXT_SESSION_PROMPT.md`: unit steps are ~120s of a ~168s job and two suites dominate — **Tracker 44s, Tinybird dual-write 43s** (Identity 30s, Attribution 3s). If CI duration ever matters, that is the target — what is slow inside those two suites, not invocation count.

### ✅ MOSTLY FIXED — `fbc` now carries the real click timestamp on the cookie tracker; cookieless + offline remain send-time (filed 2026-07-27 · fixed 2026-08-01)

> **STATUS 2026-08-01: fixed for the common case.** `sendMetaCAPI()` now derives `fbc` as `fb.1.${metaFbcClickMs(evt.click_timestamp)}.${fbclid}`, using the real ad-click instant when the tracker supplied one. **Two residual gaps below are permanent-by-design, not follow-ups.**
>
> **What shipped**, four layers, no Tinybird schema change:
> 1. `tracker/tracker.js` — `storeClickTimestamp(p)` writes `st_click_ts` **last-write-wins** on any pageview carrying any click ID (general, not Meta-specific). `st_`-prefixed, so `clearStoredIdentity()`'s existing sweep erases it on consent withdrawal for free.
> 2. `tracker.js` `conversion()` forwards it as `click_timestamp`, **omitting the key when absent** rather than sending a bare null.
> 3. `api/routes/conversion.js` sanitizes it through the **existing** `sanitizeClientTimestamp()` (no second sanitizer) and conditional-spreads it into `props` — which is both the Tinybird dual-write payload and the source of `capiEvt`, so one addition reaches both. **The `events.datasource` column in item 4 of the old plan turned out to be unnecessary**: it rides as an untyped bag field, and the CAPI path never reads back from Tinybird.
> 4. `api/lib/conversion-sync.js` — `metaFbcClickMs()` converts ISO → epoch ms.
>
> **🔴 RESIDUAL GAP 1 — cookieless traffic keeps the send-time fallback, permanently.** `tracker.cookieless.js` has no localStorage, sessionStorage or cookies **by design** (verified: even the consent decision is in-memory and per-page-load), so there is nowhere to hold a click instant between the ad click and a later conversion. This is stated in a comment at the cookieless `conversion()` payload, and a test asserts the minified cookieless bundle contains **neither** `st_click_ts` nor `click_timestamp` — so a future change cannot quietly ship a mechanism there. Closing it would require introducing device persistence, which that build exists to avoid.
>
> **🔴 RESIDUAL GAP 2 — `api/routes/conversion-offline.js` is unchanged and unfixable server-side.** A merchant-uploaded `fbclid` has no matching pageview, so no click instant can be derived. Deliberately out of scope; the merchant would have to supply it.
>
> **Also still send-time:** any install running a tracker build from before 2026-08-01, until it picks up the new `tracker.min.js`. The `Date.now()` fallback is retained and tested precisely so those three populations see **byte-identical** behaviour to before.
>
> **Bound worth knowing:** `sanitizeClientTimestamp` rejects anything >1h in the future or >90d in the past, so a click older than 90 days falls back to send time. Meta's attribution windows are far shorter, so this is not expected to bite — but it is the one input shape where a *valid* click timestamp is still discarded.

The original analysis is kept below because items 4–6 were re-scoped by the fix and the reasoning explains why.

`api/lib/conversion-sync.js` `sendMetaCAPI()`: when no real `fbc` cookie is present, `fbc` was derived from `fbclid` using `Date.now()` (send-time) instead of the actual click timestamp, which Meta's own `fbc` spec requires (`fb.<subdomain_index>.<CLICK_time_ms>.<fbclid>`). Every event that fell back to this path — no real `fbc` cookie, only a raw `fbclid` — silently shipped a wrong timestamp with no error thrown anywhere.

Real, structural gap **as filed**: no click timestamp existed anywhere in the pipeline.

- `tracker/tracker.js:265` `params()` reads click IDs from `location.search` but never persists them client-side or timestamps the read. localStorage holds only `st_aid`/`st_ft_*`, sessionStorage only `st_sid` — no click ID, no per-click timestamp.
- `first_touch_timestamp` (`st_ft_ts`) reaches `evt` but is **write-once** (`storeFirstTouch`, `if (ls('st_ft_src')) return`, never overwritten) — it is the visitor's first-ever touch, not the click that produced this `fbclid`. An organic day-1 visit + a day-10 ad click would stamp `fbc` 9 days early. **Worse than `Date.now()`**, not better.
- `evt.timestamp` / `occurred_at` / `server_timestamp` all collapse to conversion time on the browser path — same class of error as the current bug, not a fix.
- `fbclid` is never persisted in Supabase (`grep -rn fbclid supabase/migrations/` → zero hits).
- Tinybird `events.datasource` has both `fbclid` and `timestamp` typed, and the carrying pageview lands within seconds of the click — the only genuinely good proxy that exists today. Not implemented: it would add a synchronous cross-store read inside the CAPI fan-out, conflicts with the fan-out's designed never-block-a-conversion behavior under the null-read-fails-closed rule (§5), and cannot help `api/routes/conversion-offline.js` at all (merchant-uploaded `fbclid` with no matching pageview).

**What a real fix needs** (as scoped when filed — annotated with what actually happened):

1. ✅ `tracker.js` captures `st_click_ts` last-write-wins per click — the opposite of `storeFirstTouch`'s write-once. **Shipped as specified.**
2. ✅ Forwarded as `click_timestamp`. **Shipped from `conversion()` directly rather than via `utmFields()`** — `utmFields` is shared with the pageview payload, and the click instant belongs to the conversion call.
3. ✅ Carried through sanitized. **Via the existing `sanitizeClientTimestamp()` in `conversion.js`, not `normalizeClickIds()`** — it is a timestamp, not a click ID, and the repo already had the right helper.
4. ❌ **NOT NEEDED — this item was wrong.** `events.datasource` needs no `click_timestamp` column: the field rides the dual-write as an untyped bag field, and the CAPI path builds `capiEvt` in-memory from `props` with no Tinybird read-back. No pipe deploy, no schema change, no founder gate.
5. ✅ Decided: **accepted gap**, stated in the cookieless source and enforced by a test against the minified bundle. See RESIDUAL GAP 1.
6. ✅ Confirmed unfixable server-side; left untouched. See RESIDUAL GAP 2.

Until (1)–(3) exist, `Date.now()` is the only value `sendMetaCAPI` can honestly write — every reachable substitute is wrong in a harder-to-reason-about way. **Leave as-is; do not "fix" with `first_touch_timestamp` or conversion time.**

### ⚠️ GDPR account deletion now blocks on Tinybird erasure — correct fix, no alerting yet (2026-07-27)

`DELETE /api/gdpr/account` (fixed 2026-07-27) no longer deletes
`sites`/`company_members`/`companies`/the auth user unless every site's
Tinybird event-data erasure returns `status: 'executed'` — replacing a bug
where the account was deleted regardless of whether event data was actually
erased, sometimes with a false "partial success" claim. The Supabase delete
order was also fixed: `attributed_conversions` was previously deleted
*before* the Tinybird erasure loop even ran, so a blocked request would
already have destroyed real conversion data. Both are now sequenced:
erase loop → log → gate → deletes, all-or-nothing.

This trades one Art. 17 risk for a different one: during a sustained
Tinybird outage, no account deletion can complete for its duration, and
GDPR erasure carries a one-month statutory deadline. Today the only signal
a request was blocked is a `console.error` — no alert, no dashboard
visibility. Not urgent to fix now: `erasure_log` has zero rows ever
written (confirmed via direct query), meaning this path has never been
exercised by a real request. Needs alerting on repeated/sustained block
before real customer volume makes the gap load-bearing.

### ⚠️ Funnel Session Splitting Regression from PR #456 Fixed (2026-07-28)

**Issue**: PR #456 repointed `/analytics/funnel` to query pageviews via `dispatchPageviews` and grouped events using `deriveSessions(events)`. Because `deriveSessions()` was built for attribution multi-touch modeling (where any mid-visit UTM or click-ID change forces a session split), any visitor who clicked a campaign link or retargeting ad mid-journey was split into separate sessions. This caused false 0% funnel completion rates for realistic customer journeys.

**Fix**: Created `deriveFunnelSessions(events)` in `api/lib/sessionization.js` and updated `/analytics/funnel` in `api/routes/analytics.js` to use it. `deriveFunnelSessions()` sessionizes strictly on a **30-minute inactivity timeout** (`(ts - prevTs) > 30 mins`), ignoring mid-visit acquisition-parameter changes. This restores standard web analytics funnel behavior (matching GA4, Plausible, Mixpanel, and PostHog). `deriveSessions()` itself remains 100% untouched for attribution and `/sessions` reporting.

### Google Ads Search Terms Report — scope is NOT the blocker; the search-term↔attribution join is STRUCTURALLY impossible (2026-08-01, investigation recorded so it is not re-derived)

Logged because the obvious first guess — "we'd need a broader OAuth scope" — is **wrong**, and the real finding is one level down and easy to miss. Investigated read-only; nothing built.

**The OAuth scope is already sufficient.** `api/lib/google-ads.js:104` requests `https://www.googleapis.com/auth/adwords`, which is the **only** OAuth scope Google publishes for the Google Ads API — there is no narrower or broader variant. It grants full read/write API access to whatever accounts the authenticating user can reach, so `search_term_view` is **already inside the existing grant**. The transport exists too: `google-ads.js:229` already POSTs GAQL to `googleAds:search`, and moving from cost sync to search terms is `FROM campaign` (`:250`) → `FROM search_term_view` on the same endpoint with the same headers. **Do not re-investigate the scope.**

**The real gate is external and non-code.** `dashboard/src/components/CapiSettings.jsx:113-114` records it in-repo: *"no developer token has been issued and the `adwords` scope has not cleared Google's sensitive-scope verification."* `fetchGoogleAdsCost()` throws `invalid_developer_token` without `GOOGLE_ADS_DEVELOPER_TOKEN` (`google-ads.js:223`), and `getAuthUrl()` returns `not_configured` without the OAuth env. Both are Google application/approval processes on Google's timeline, not engineering tasks — and they gate the **existing** cost sync too, which FEATURE_MAP §8 still carries as **END-TO-END UNPROVEN** (no real ad account has ever run it). Nothing search-term-shaped can be verified until these clear.

**🔴 The structural finding — there is no join key, and this is not a completeness gap that more work closes.** The raw search query never reaches SourceTrack, by Google's design:
- `search_term_view` carries the query plus **Google-attributed** `metrics.conversions` / `metrics.conversions_value`. It does **not** expose `gclid` — Google deliberately keeps the query and the click identifier apart.
- SourceTrack captures `gclid` and `utm_term` as typed columns (`tinybird/datasources/events.datasource:45-46`) and the ValueTrack params inside the `properties` JSON blob (e.g. `JSONExtractString(properties, 'st_target_id')`, `tinybird/pipes/events_latest.pipe:101`). **None of these is the search query.** ValueTrack has no parameter that inserts the user's typed query — `{keyword}` yields the *matched keyword*, not the query.

So Google's conversion numbers per search term and SourceTrack's own multi-touch attribution have **no shared key at any granularity**. This is a property of Google's data model, not of our ingestion. Attempting to bridge it by inference would be fabricating attribution.

**⚠️ §6 risk a naive build would create.** The tempting implementation puts Google-attributed conversions/revenue in a table beside SourceTrack-attributed figures. Those are different models with different windows and different credit rules, and rendering them adjacent without an explicit label reads as one consistent attribution when it is two. That is a §6 data-truth violation of the same class as a fake zero — the number is real, the *claim it makes* is not.

**Two honest future shapes. They are SEPARATE items — do not fold them into one "search terms" ticket:**
1. **Google-attributed search terms (small).** One GAQL query against `search_term_view`, one read path, no join. Every figure must be labelled as **Google's own attribution**, not SourceTrack's. Ships only after the developer token + scope verification clear.
2. **SourceTrack-attributed keyword-level ROI (larger, and NOT the same feature).** `st_target_id` carries the Google criterion ID and joins to `keyword_view`, giving real SourceTrack-attributed revenue per **keyword bid on** — never per search term. Two blockers first: (a) a **naming collision** — `keyword` in the Report Builder today means `utm_term`, not a criterion ID (`api/lib/attribution-engine.js:1579`: `dimVal = share.keyword || share.utm_term || 'unknown'`), so the dimension name is already taken by a different concept and shipping this without resolving it would silently change what an existing saved report means; (b) the `keyword` dimension is **currently gated and unbuilt** — `GATED_GROUPS` (`dashboard/src/lib/gate-constants.js:25`), excluded from pre-agg (`api/lib/report-config-validation.js:92`), and there is **no keyword pipe at all** (zero matches in `tinybird/pipes/`). Also note `st_target_id` lives in the `properties` JSON blob, not a typed column, so it would need promoting.

### `tinybird-read.js` still advertises a HogQL fallback that was DELETED — 10 stale references, 3 of them printed at runtime mid-incident (2026-08-01, recorded not fixed)

**Logged because it has already been under-counted once.** PR #516 (unmerged, closed as superseded) flagged **one** instance — the warn at `:143` — and called it "worst possible placement, since it prints mid-incident." That was right about the placement and wrong about the count. The real number in `api/lib/tinybird-read.js` at `6000951` is **10**. Recording the full inventory so the next pass does not rediscover a subset a third time. **Code deliberately NOT changed here — this was a docs-only pass.**

**The contradiction.** CLAUDE.md §5 states there is no PostHog/HogQL fallback and that a `null` read fails **CLOSED**. The code agrees: `api/lib/attribution-engine.js:31` — *"every ENGINE-leg caller treats a null pipe as a hard failure — it throws via `_pipeNull` (the HogQL fallback is DELETED)"*; `:44-46` repeats it; `:2483` throws with *"FIX THE PIPE, do not restore the HogQL read"*. But the module those callers import still documents and announces the opposite. **`tinybird-read.js:118` is the public JSDoc contract of `queryTinybirdPipe`** and reads *"Callers MUST fall back to the existing HogQL path on a null return."* Two files that import each other state opposite contracts; the one a reader hits first is the wrong one.

**Full inventory — `api/lib/tinybird-read.js` @ `6000951`:**

*3 runtime `console.warn` strings that tell an operator a fallback is occurring (none exists):*
- `:143` — `'…TINYBIRD_HOST/TINYBIRD_READ_TOKEN are not set — falling back to HogQL.'`
- `:192` — `` `…pipe '${pipeName}' failed (${res.status}) — falling back to HogQL: …` ``
- `:219` — `` `…pipe '${pipeName}' threw (${msg}) — falling back to HogQL.` ``

*6 comment/JSDoc assertions of a fallback or a HogQL leg that no longer exists:*
- `:12` — *"null MUST be treated by the caller as 'fall back to the existing HogQL path'"* (module contract)
- `:14` — *"must never break a feature that already works via HogQL"*
- `:21` — *"pipeName returns null (→ HogQL fallback)"*
- `:49` — *"safe to apply to the HogQL leg too"*
- `:118` — *"Callers MUST fall back to the existing HogQL path on a null return."* (**JSDoc — the public contract**)
- `:201` — *"a null result takes the HogQL fallback and MUST stay silent here"*

*1 historical format note, lower severity — names a decommissioned system but asserts no fallback:*
- `:45` — *"PostHog/HogQL returns ISO '…T…Z'"* (motivates `normalizePipeTimestamp`; accurate as history)

**Why the 3 warns are the urgent ones.** They fire on exactly the paths that fail closed — missing config, non-2xx, timeout — so they print while someone is debugging a dead read, and they tell that person a fallback absorbed the failure. It did not: the engine leg throws. An operator trusting the log line looks for degraded-but-serving behaviour when the real state is a hard failure. This is a §6-adjacent truth defect in operator-facing output.

**Scope boundary — the 10 are scoped to `api/lib/tinybird-read.js` only.** The wider HogQL surface is much larger (an entire live module named `api/lib/hogql-date.js`, ~80 files under `api/tests/`, many `.pipe` comments) and is **deliberately not counted here**: most of it is test-fixture naming or historical record, not a false live claim. Do not treat "10" as a repo-wide figure. If a repo-wide sweep is ever done, the naming of `hogql-date.js` is the next question, not these lines.

**Fix when someone picks it up:** delete or rewrite the 3 warn strings to name the real outcome (the read failed; the caller will throw), correct `:118` and the 5 other comment assertions to state the fail-closed contract, and leave `:45` alone. Mechanical, no behaviour change — the warns are strings, not control flow. **Do not "restore" a fallback to make the comments true.**

**Precedent to follow if either is ever built:** `tinybird/pipes/seo_revenue_landing_pages.pipe`. SourceTrack already solved the query→revenue problem for **organic** search, and solved it honestly — CLAUDE.md §6 requires that query-level revenue be **estimated**, matched by landing page + date range, carry the truth label, and *"never imply exact query→customer attribution."* The paid-search version faces the identical missing-key problem and gets the identical treatment. That pipe also shows the trap: its `DESCRIPTION` records that an earlier click-ID-blind organic filter counted paid Google Ads clicks as SEO revenue — paid revenue in an SEO report, a §6 violation — which is precisely the kind of silent cross-contamination a search-terms build invites.

### Tinybird batcher has NO byte-size ceiling — a 413 is dead-lettered whole, with no split-and-retry and no test (2026-08-01, investigation recorded; no fix committed)

Recorded because every individual control here is deliberate and defensible, and the gap only appears when you line them up: **nothing anywhere in the write path bounds the number of BYTES in a flushed batch.**

**No byte ceiling exists.** The batcher's only flush triggers are a **count** threshold (`buffer.length >= N`, `tinybird/adapter/batch.js:158`) and a **time** interval (`:103`). `deliver()` (`:108-110`) serializes the batch to NDJSON and gzips it with **no size check of any kind** before handing it to the transport. The exported `size: () => buffer.length` (`:221`) is a **count, not bytes** — a name that reads like a size accessor and is not one.

**⚠️ `N` is a trigger, not a cap — the batch has no count ceiling either.** `flush()` takes the **entire** buffer (`:143-144`: `const batch = buffer; buffer = []`), never a slice of `N`. `N` only decides *when* a flush starts. Events enqueued while a flush is in flight accumulate, so a batch can be arbitrarily larger than `N`. This is what makes the byte question reachable rather than theoretical.

**The exposure is specifically the re-queue path.** On a **retryable** failure (429/5xx that survived the transport's own bounded retry), `deliver()` puts the whole batch back at the FRONT of the buffer — `buffer.unshift(...batch)` (`:127`). During a sustained 429/5xx burst the next flush therefore carries the re-queued batch **plus** everything that arrived meanwhile, and the one after that carries more again. Two real controls bound this, and **neither bounds bytes**:
- **`MAX_REQUEUE = 2`** (`:89`, env-overridable via `TINYBIRD_MAX_REQUEUE`) — caps how many times *a given event* is re-queued before it dead-letters. It bounds per-event looping, not the size of any batch.
- **A 100kb HTTP body limit** — `express.json({ limit: '100kb' })` on the `/track` root alias (`api/index.js:712`); the global `express.json()` at `:389` carries body-parser's own 100kb default. `/api/track` is single-event, so this is effectively a per-event bound. It caps one event, never their sum.

**On 413, the batch is destroyed whole.** `transport.js:98` classifies retryability as `429 || 5xx` only — **413 is non-retryable**, and `batch.js:117` names it explicitly (*"a permanent 4xx (auth / 413 / malformed) that is not retried at all"*). The re-queue gate at `:124` requires `retryable`, so a 413 falls straight through to dead-letter (`:131-135`) with `disposition: 'permanent'`. There is **no split-and-retry** anywhere: the one payload-shaped failure mode a batcher can actually recover from — halve it and resend — is not implemented, so an oversized batch loses **every event in it**, including events that would have succeeded in a smaller batch.

**And the dead-letter sink is a log line.** `defaultDeadLetter` (`:47-55`) is `console.error` **per event**, carrying `event_id`/`site_id`/`event_type`/`reason`/`disposition` but never the body. Railway retains logs durably, so the loss is *recoverable by hand* and alert-able — it is not a replay path. A stronger sink can be injected via `opts.deadLetter` without touching the module (`:45-46`), and nothing does today.

**Zero test coverage for this exact case.** No `413`, `byteLength`, or payload-size assertion exists anywhere under `tinybird/adapter/__tests__/`. `transport.test.js` covers **200, 202, 400, 429, 500, 503** — `400` is the only non-429 4xx exercised, so the permanent-4xx branch is proven for a malformed body but never for an oversized one, and the batch.js dead-letter path is never reached via a 413.

**⚠️ One nearby comment does NOT say what it looks like it says.** `tinybird/adapter/normalize.js:90-91` defers a *"size cap"* to Phase 7 — but read in context (`:84-91`) that cap is one half of a **hybrid anti-fingerprinting screen** (key-name pattern reject + size cap) for novel customer-named bag keys. It is **not** a deferred payload-size control and must not be cited as one. It is relevant here only as confirmation that `normalize.js` applies no per-event size bound today either.

**Suggested cheap fix — RECORDED AS AN OPTION, NOT A COMMITMENT. Not scoped, not costed, not approved.**
1. A byte check in `deliver()` after serialization, before the POST — split the batch and send the halves when the payload exceeds a configured ceiling.
2. A 413-specific **split-and-retry-once**: on a 413, halve the batch and resend each half exactly once before dead-lettering, so a single oversized batch stops destroying the events that would have fit.

Both are contained within `batch.js` and need no transport or schema change. **Do not treat the absence of a byte cap as an oversight to be patched blind** — it has never been observed firing in prod (no 413 has been recorded), and the retryable/permanent split it sits inside is deliberate. This entry exists so the next person hits the analysis, not the incident.
### Erasure suppression: the per-flush check was measured and REJECTED — do not reattempt it (2026-08-01, recorded so the cost is not rediscovered blind)

**The gap is real.** An event accepted BEFORE an erasure completes can be delivered AFTER it. `tinybird/adapter/batch.js` re-queues a failed batch with `buffer.unshift(...batch)`, and a re-queued batch drains from the batcher's internal buffer straight to the transport — it never re-enters `dualWriteEvent()` and never re-runs `normalizeEvent()`. **No ingest-time check can see it.** The window is bounded by `TINYBIRD_FLUSH_INTERVAL` (10s prod) × `TINYBIRD_MAX_REQUEUE` (2) ≈ **20 seconds**, and only opens during a sustained 429/5xx burst.

**The obvious fix does not work, and this is the part worth not rediscovering.** Adding a suppression check at the flush boundary — partition each batch, drop suppressed events before `deliver()` — was implemented in full and reverted. It puts a **Supabase round-trip on the flush path of the highest-volume ingestion route**. Measured effect: `npm run qa:all` went from 0 failures to ~10, and `api/tests/billing-middleware.test.js` failed **in isolation** with **~7-second test durations** — real network timeouts, not a stub gap. A `NodeCache` in front of it does not save the design: a cold cache still means one query per **new visitor**, on the ingest path, and a degraded Supabase then either holds every batch (delaying all analytics) or dead-letters it.

The failing tests *could* have been made green by teaching ~10 files' mocks about the new query. That would have hidden the cost rather than removed it. **If you find yourself adding a suppression lookup inside `batch.js` or `dual-write.js`'s flush path, stop — this was already tried.**

**What shipped instead:** pay once per erasure (rare) rather than on every batch (constant). `erasure_log` — already written on every erasure, and **write-only** until this work — became the durable ledger; the health cron (`*/30`) triggers a delayed second delete-by-condition, which is idempotent and so never needs to know whether the first delete finished. See `api/lib/erasure-resweep.js`.

**Why the trigger is an API endpoint and not the cron itself:** verified on production 2026-08-01 via Railway variable **names** (values never read) — `TINYBIRD_ADMIN_TOKEN` is present on `SourceTrack-Api` and **absent** from both `sourcetrack-health` and `nightly-attribution`, which carry only the read token. So no cron can perform the delete. The alternative was granting the health monitor delete rights on the event store; expanding a read-only monitor's blast radius is the wrong direction given why §0 exists.

**Residual exposure, stated rather than implied:** up to ~35 minutes (5-minute eligibility + the `*/30` cadence) where late-delivered events sit in Tinybird before removal. This is a latency reduction, not elimination. The sweep covers **Tinybird events only** — it does not re-run the Supabase deletes. Anything already sent to an ad platform via CAPI is **unrecoverable by any sweep**. And crons are `restartPolicyType: NEVER`, so a crashed health run pushes the sweep out another 30 minutes.

### Refunds are NEVER attributed to a source; CAPI egress is suppression-gated (2026-08-01, PR 4/5 — two founder decisions, reasoning recorded)

**Decision 1 — a refund does not debit the source that won the sale.** This REVERSES KI-62 Step C,
which copied the original conversion's attribution onto the refund verbatim so the reversal netted
against the acquiring source. The reversal is not a bug fix; both designs are defensible and the
old one was chosen deliberately, so the reasoning is recorded rather than the conclusion alone.

Attribution on the original is a **model output**, not an observation. The refund is a certain fact
— known amount, known date — but which channel should absorb it is exactly as uncertain as the
original credit was. Inheriting turns one uncertain credit into an equal-and-opposite uncertain
debit against the same channel, so a mis-attributed sale becomes a mis-attributed sale **and** a
mis-attributed refund: the error doubles instead of cancelling. Site-level revenue still nets
exactly, which is the part that was never in doubt.

**What changed in the data, not just the read path.** The nightly now CLEARS the attribution
descriptor columns on a refund (`ATTRIBUTION_DESCRIPTOR_FIELDS`, formerly `REFUND_INHERITED_FIELDS`)
rather than only marking it. A marker in `custom_properties` protects only readers that know to
check it; every other reader sums `first_touch_source` directly and would have believed whatever the
refund's own later window derived — which collapses to **Direct**, the one source it certainly did
not come from. Nulling makes the row honest at the data layer. **This is why `analytics.js` needed a
change too:** its `revenueBySource` loop does `r.first_touch_source || 'Direct'`, so a cleared refund
would have fallen straight through the default into Direct. It now routes refunds to the same
explicit "Unattributed refunds" line `dashboard.js` uses.

**Two markers, deliberately not merged.** `'unattributed'` = the original IS known and we decline to
debit it. `'unresolved'` = the original could not be identified at all (no `payment_intent`,
subscription-mode refund). Only the second is a diagnosable data gap; collapsing them would erase
the actionable one. Same reasoning that kept `'partial'` separate from `'unknown'` in
`collapseCurrencies()` (#532). Both bucket to one line at presentation.

**Removed, not left dormant:** the per-refund Supabase lookup that fetched the original's
attribution, its `resolveOriginal` injection seam, and `defaultResolveOriginalAttribution`. Nothing
is copied now, so the read was pure cost on the money rail. A test asserts the refund path performs
zero such reads, because a discarded-but-still-executed lookup is exactly what survives a refactor.

**Decision 2 — CAPI egress is now suppression-gated, built before volume rather than after.** Every
other erasure-suppression call site (PR 2) guards a Supabase write, where a miss is repairable: the
row is ours, and a later erasure or the PR 3 re-sweep still reaches it. An ad-platform send is
different in kind — once a conversion reaches Meta, Google, GA4, TikTok or LinkedIn it sits in a
third party's ledger under their retention, and **no sweep of ours can retract it**. There is no
"clean up afterwards" for an egress, so the check happens before the send.

Gated in `dispatchCapi`, the single choke point for all six senders, immediately after the existing
money-truth gate and before the senders array — so a sender added later cannot bypass it. Checked
**once per event, not per platform** (six identical lookups for one answer). Keys are the subject id
and the email the senders actually hash into `user_data`; `isErasureSuppressed` ORs them.

**Fail-closed is inherited, not reimplemented** — `isErasureSuppressed` already returns true on a
degraded lookup. For a Supabase write that means skipping a row that can be re-added; here it means
refusing to put an erased person's data somewhere unrecallable. The cost of being wrong in that
direction is one missing ad-platform conversion, recoverable by a re-send; the opposite error is not
recoverable at all. **A no-attempt suppression writes no `capi_deliveries` rows**, matching the
money-truth gate — six `failed` rows would read in the UI as six broken integrations rather than one
deliberate block.

**Residual, stated rather than implied:** this stops FUTURE sends. Anything already delivered to an
ad platform before the erasure remains out of reach — that is a property of CAPI, not a gap here,
and no suppression list can change it.

### Account deletion records NO erasure suppression — open product decision, not a filed bug (2026-08-01, found during PR 5/5 of the GDPR arc, #554)

**The fact, re-verified at `fbec966`.** `recordErasureSuppression` has exactly one production call site:
`api/routes/gdpr.js:275`, inside `DELETE /visitor` (handler spans :168–:361). `DELETE /account`
(:477–:628) never calls it — confirmed by scanning that handler's whole range, not by reading the
happy path.

**Why that reaches further than it looks.** All five suppression-enforcement points added by PR 2 and
PR 4 gate on `isErasureSuppressed`, which reads one table, `erasure_suppression`:
`identity-links.js:70-71` (identity mappings), `volunteered-identity.js:81` (volunteered name/email),
`leads-server.js:471` (lead records), and `conversion-sync.js:623` (CAPI egress to all six ad
platforms). A subject whose PII was removed by account deletion is in none of those rows, so **not one
of those five guards fires for them.** The equivalent per-visitor erasure blocks all five.

**The gap is NARROWER than that sounds, and the shape matters more than the headline.** Both account
paths were traced rather than assumed:

- **Sole member** (`shouldDeleteSites = true`): `attributed_conversions` is deleted explicitly, the
  sibling PII tables cascade off `sites`, `eraseSiteFromTinybird` runs per site, and then
  `supabase.from('sites').delete()` removes the sites. Their tracking keys stop resolving, so ingest
  answers `401 Invalid site_key` (`api/middleware/auth.js:79`) and **nothing new can arrive for those
  sites at all.** Suppression would be redundant for the steady state; the exposure is confined to
  what is already in flight when the deletion runs.
- **Shared workspace** (`shouldDeleteSites = false`): only `company_members`, possibly `companies`,
  and the auth user are deleted. **No visitor PII is touched and no site is erased** — so there is no
  erased subject to suppress in the first place. The remaining members' sites keep running, correctly.
- **Cross-tenant, either way:** `erasure_suppression` is scoped by `site_id`, so suppression could
  never have protected the same person on a different tenant's site. That is a property of the design,
  not a regression, and it bounds what any fix here could buy.

**⚠️ Secondary finding, recorded so it is not mistaken for coverage.** `/account` DOES write
`erasure_log` (`gdpr.js:541`) — but with a synthetic subject id, `` `account:${userId}` ``. The PR 3
re-sweep reads `erasure_log` and re-runs `eraseSubjectFromTinybird` (`erasure-resweep.js:25`, :127),
which is a SUBJECT-scoped delete-by-condition on `distinct_id`/`visitor_id`. Against
`account:<uuid>` that matches **zero rows**, and the row is then stamped `resweep_completed_at`
having removed nothing. Harmless while the sites are deleted — nothing can have arrived — but it means
**"the re-sweep covers account deletion" is not a true statement**, and the health check counts those
rows as swept. Anyone extending the re-sweep should start here.

**THE OPEN QUESTION — a founder call, deliberately not answered here.** Should account deletion also
write suppression rows for the subjects whose PII it removes?

- **For:** it closes the in-flight window on the one path that currently has no guard at all, and it
  makes the two erasure routes behave alike, which is the kind of asymmetry that later gets discovered
  the hard way. `recordErasureSuppression` already takes a `source` parameter defaulting to `'visitor'`
  (`erasure-suppression.js:123`), and `source` is a real column with the same default
  (`20260731130000_create_erasure_suppression.sql:70`) — the plumbing anticipated more than one origin.
- **Against:** account deletion is infrequent, high-stakes and already the longest write path in the
  codebase — it gates on Tinybird returning `'executed'` before it deletes anything, so every step
  added is a step that can block a deletion a customer is entitled to. Enumerating every subject on
  every site to suppress them is unbounded work on a request that must complete, and for the sole-member
  case it protects a site that is about to stop accepting traffic anyway.

Not filed as a defect and deliberately not fixed on an engineering default: the honest reading is that
the protection gap is real but mostly theoretical today, and the cost lands on the one code path where
a new failure mode is least acceptable. Revisit if account deletion ever stops deleting the sites, or
if shared-workspace deletion starts removing visitor PII — either change turns this from theoretical
into live.

### An invalid conversion returns `undefined`, and the reprocess path can push it into a bulk insert after the site's data is already deleted (found 2026-08-01, during PR #560's `processConversion` read/write split)

**The fact.** `processConversion` guards on invalid input with a bare early return:

```js
if ((convValue < 0 && conversion.conversion_type !== 'refund') || !conversion.distinct_id) {
  logWarn(`Skipping invalid conversion ${conversion.uuid}`)
  return
}
```

No value — the function returns `undefined`. Nothing between that guard and `processSite`'s two call
sites checks for it.

**Normal (non-reprocess) path:** the `undefined` is passed straight into
`supabase.from('attributed_conversions').upsert(record, { onConflict: '...' })`. Whether the
Supabase-js client throws synchronously, returns a row-level `error`, or silently no-ops on an
`undefined` payload is **not verified here** — worth an isolated check before assuming either
outcome, rather than guessing at the failure mode.

**Reprocess path is the sharper case.** `records.push(record)` accepts the `undefined` entry into the
array unchecked, and that array is not used per-row — it is inserted **once, in bulk**, after the
per-conversion loop finishes:

```js
await supabase.from('attributed_conversions').delete().eq('site_id', site.id)
// ...
await supabase.from('attributed_conversions').insert(records)   // records may contain `undefined`
```

The delete already ran by the time the insert is attempted. If a bulk `.insert()` on an array
containing one `undefined` element rejects the whole call (plausible, not confirmed) rather than
erroring per-row, the site's `attributed_conversions` are left **empty** rather than restored —
one malformed conversion in the reprocess window could wipe a site's attribution history with no
successful reinsert to follow the delete.

**Why this is lower urgency than it sounds:** `isReprocess` is gated three ways before any of this
runs — a hardcoded staging-project-ref check (`STAGING_REF`), the explicit `--confirm-destructive`
flag, and a single recognized test site key (`STABLE_TEST_SITE_KEY`). This is not a live prod
exposure today; it's a footgun specific to the staging reprocess tool, not the nightly cron.

**Not fixed here, reproduced exactly instead.** Found while splitting `processConversion` into
`computeConversionRecord` / `writeConversionSideEffects` (PR #560). Out of scope for that change —
guarding it would alter `processed`/`failed` totals and the reprocess write shape, which needs its
own verified change, not a side effect of an unrelated perf PR. The split preserves the bare
`return` in both `dryRun` and normal modes, confirmed by `nightly-refund-persist.test.js:75`, which
already covers this path and still passes untouched.

**Next step, if picked up:** confirm what Supabase-js actually does with `.insert([validRow,
undefined, validRow2])` before deciding the fix — a `.filter(Boolean)` before both the `upsert` and
the `records.push` is the likely shape, but only after the actual failure mode is known rather than
assumed.

---

# Reconciliation pass — 2026-08-06

Entries below are numbered `KI-78` … `KI-99`, continuing from the highest real number in this
file (`KI-77`). The sequence has historical gaps; these are the next free numbers, not the next
sequential ones.

## Corrections to already-recorded claims

### KI-A2 correction — `gh pr close && gh pr reopen` re-firing checks is UNVERIFIED, not false

`SESSION_HANDOFF_2026-08-06.md:49` records, as an empirical confirmation, that
`gh pr close && gh pr reopen` **re-fires checks on the same SHA without moving the head**.

**Status: unverified under normal conditions. NOT refuted.**

We observed it fail to fire on three PRs on 2026-08-06 — but that observation was made **during a
confirmed GitHub Actions outage in which moved-head pushes also failed to enqueue.** The control
was broken at the same moment as the test, so the run proves nothing either way: an outage
explains the null result completely, without the close/reopen mechanism being wrong.

**Write it as:** *observed not to fire during the 2026-08-06 Actions outage; unverified under
normal conditions.* **Never as flatly false.** Re-testing it costs one PR on a green day and
would settle it; until someone does that, neither claim is available.

The frozen handoff cannot say this about itself — recorded here per the `#638` pointer mechanism.

## A1 — new findings, all found 2026-08-06

### KI-78 — `/api/analytics/collect` applied the REPORTING bot predicate at INGESTION (FIXED #666)

`api/routes/analytics.js:226` runs `if (isBotUserAgent(ua)) return res.json({ ok: true })` on the
live ingestion path. `isBotUserAgent` is the **reporting-side** predicate — it answers
"crawler-or-human", not the ingestion question "does this client execute JS?". Those differ
precisely where it matters: Googlebot/Bingbot/Applebot render JS and reach `/api/track`, and must
be dropped; in-app WebViews are humans and must be kept.

**This is the 2026-07-14 failure, still running.** It was never stopped, only fixed at one call
site. Fixed in **#666**, which also registers `api/tests/analytics-collect-ingestion-filter.test.js`
in `package.json` — required, or the registration guard (`api/tests/test-registration-guard.test.js`)
fails the build.

### KI-79 — `/sp/e` and `/sp/pixel.gif` meter quota with no bot filter at all (FIXED #667)

Both proxy ingestion endpoints (`api/routes/proxy.js`, rate-limit registration at
`api/middleware/rate-limit.js:125,128`) consume pageview quota unconditionally —
`:183` documents `/sp/pixel.gif` as *"always a `$pageview`; always consumes quota"*.

**This was a scope accident, not a decision.** The bot-filter work landed on the direct ingestion
routes and never reached the proxy pair, so a customer on the managed proxy was metered for
crawler traffic that a customer on direct ingestion was not. Nothing recorded the asymmetry
because nobody had chosen it. Fixed in **#667**.

### KI-80 — ⚠️ DO-NOT-FIX: `server-events.js` must NEVER be bot-filtered

`api/routes/server-events.js` has no bot filter and **must not acquire one.** It ingests
server-to-server events, where there is no browser and no meaningful user-agent: the "bot"
signal is absent by construction, and any UA-based predicate applied there would drop **real
customer conversions** sent from a backend.

Recorded as an entry precisely because it looks like the same defect as KI-78/KI-79 to anyone
sweeping for unfiltered ingestion endpoints. It is not. **Do not "complete the sweep."**

### KI-81 — the proxy serving hostname is not the hostname the gate authorises

Three facts that are individually fine and jointly a drift hazard:

- **The serving host is `track.`** — that is what the customer's browser contacts. It matches
  **no row** in `managed_proxy_domains`.
- **The registered host is `track2.`** — the single row in that table — and it is **unverified**
  as the traffic-carrying host.
- **Tenant resolution comes from the `cdn-host` HEADER, not the browser's `Host`**
  (`api/lib/managed-proxy.js:60-62`): when Bunny presents a valid `x-st-proxy-secret` and a
  matching `cdn-pullzoneid`, the tenant is resolved from the hostname the **CDN** was configured
  with. Both hostnames sit on one pull zone, so the lookup matches `track2` and succeeds.

**This is not a gate bypass** — `managedProxyEarlyGate` hard-404s on a lookup miss, with no
fallthrough. The consequence is narrower and worse: **the DB row and the customer-facing domain
can drift indefinitely with nothing detecting it**, and the verification job resolves by the DB
hostname — so it monitors `track2` while `track.` carries the traffic.

**Do not "fix" this by editing the row.** Which hostname should be authoritative is an open
decision. Full evidence, including the 401-vs-404 probe that proves the gate admitted `track.`,
is in **#666**'s correction to `SESSION_HANDOFF_2026-08-06.md`.

### KI-82 — `proxy-domain-recheck` has never run

Every row shows `last_checked_at == verified_at == 2026-07-15` — the timestamps are equal because
nothing has updated them since the initial verification wrote both. The job has not executed once.

Corroborating code-level fact (verified on `main`): `api/jobs/proxy-domain-recheck.js` contains
**zero** references to `job_runs`, so even had it run, nothing would record that it did. See KI-83.

*Provenance: prod row inspection, 2026-08-06 (orchestrator, read-only). Not independently
re-queried in this pass — CC has no prod DB access.*

### KI-83 — ⚠️ `job_runs` IS NOT A RELIABLE NEGATIVE. Absence from it does not mean a job is dead

**Correct every document that infers "job is dead" from "job has no `job_runs` rows".**

Verified on `main` by inspecting every `job_runs` reference in `api/`:

| Job | writes `job_runs`? |
|---|---|
| `nightly-attribution.js` | **yes** (3 write sites) |
| `anomaly-watcher.js` | **yes** (1) |
| `api/lib/job-runs.js` (helper) | yes (the write itself) |
| `health-agent.js` | **no** — its 2 references are `.select()` READS |
| `data-quality-check.js` | **no** — its 2 references are `.select()` READS |
| `proxy-domain-recheck.js` | **no** — zero references |
| `email-reports.js`, `ai-crawler-range-refresh.js`, `usage-threshold-emails.js` | no |

**`data-quality-check` RUNS DAILY** — 305 reports across 79 distinct days — while writing nothing
to `job_runs`. Any audit that read the table as a job registry has been scoring it as dead.

**The sharp part:** `health-agent.js:218-223` and `data-quality-check.js:58-62` both **read**
`job_runs` — filtered to `job_name = 'nightly-attribution'` — to judge freshness. So the table is
a log about *one* job, being consumed as if it were a registry of *all* jobs, by two jobs that are
themselves absent from it.

*Provenance: the 305/79 counts are prod queries (orchestrator, 2026-08-06). The read/write table
above is code-verified on `main` in this pass.*

### KI-84 — `health-agent` has no persistent output at all; it is unmonitorable by construction (FIXED #669)

The job evaluates checks and exits. Nothing durable is written, so "did health-agent run, and what
did it conclude?" has no answer available after the process ends — and a crash is indistinguishable
from a clean run that found nothing.

Fixed in **#669**, whose three exception tests are the load-bearing part: a crash still produces a
row; the row survives a `null`/`undefined` rejection; and the write happens **before**
`process.exit(1)` — that third asserted by **source position**, because after `process.exit` the
row never lands and the ordering cannot be observed at runtime. `run()` calls `process.exit()` on
both normal paths, so reaching the crash handler means the job really did die mid-run.

### KI-85 — `proxy-health` and `tracker.min.js` are both edge-cached and unbypassable from the client

Neither response can be forced to miss cache from the client side, so a client-side probe cannot
distinguish "origin is healthy" from "the edge is serving a cached success". A cached error page is
a 200 with a body — which is why **#668**'s verification asserts content-type and leading bytes and
explicitly does **not** assert on length.

**#668 fixes the first.** The second — `tracker.min.js` — is an **accepted ~8-day window**, not an
open defect. Recorded so the acceptance is visible rather than rediscovered as a bug.

### KI-86 — `email-reports-weekly` stopped entirely on 2026-07-27

No executions since 2026-07-27. **This is a distinct defect from the previously recorded
"sends 0 emails" issue** and must not be folded into it: that one describes a job that runs and
produces nothing; this one is a job that does not run. A fix for either leaves the other live.

Note `api/jobs/email-reports.js` writes nothing to `job_runs` (KI-83), so the stoppage was invisible
to any check reading that table.

*Provenance: prod inspection, 2026-08-06 (orchestrator, read-only).*

### KI-87 — a stacked PR (base ≠ `main`) gets NO CI under the current `ci.yml`

`.github/workflows/ci.yml:16-17` triggers `pull_request` on `branches: [ main, feat/home-v14 ]`
only. **A PR opened against any other base matches no trigger, reports "no checks reported", and
the CI-green-on-the-exact-head-SHA merge gate (CLAUDE.md §9) is silently suspended.**

This already bit **#646** — silently, which is the whole problem: the failure mode is an *absence*
of checks, and an absent check does not announce itself the way a red one does.

The file's own comment block (`:12-15`) records the second half: for `pull_request` events GitHub
reads the workflow from the **base** branch, so adding a name to this list is **necessary but not
sufficient** — the change must also be merged INTO that base branch before PRs against it get
checks.

**Consequence for the current queue:** any PR in a stack must have its base re-checked before its
green status is trusted.

### KI-88 — the v3 dead-token bug, and three harness blind spots

Grouped because they share one root cause: **a check that cannot see the thing it certifies.**

- **v3 dead tokens** — token aliases that resolved to nothing while the audit that was supposed to
  catch them passed. Repointed in `#663`, which also made both audits able to fail; before that
  they could only report success. An audit with no failure path is not an audit.
- **Three harness blind spots** — the same shape at three points in the verification chain: the
  harness asserts on a surface that does not include the defect class it exists to catch.

**The generalisation worth keeping:** every one of these passed. None of them failed loudly and got
ignored — they were all structurally incapable of failing. When adding a guard, the first question
is *"what input makes this fail?"*; if there isn't one, the guard is decoration.

## A3 — pre-existing and undocumented

Checked against this file before adding: none of the below had an existing entry.

### KI-89 — a fresh worktree can lack root `node_modules` entirely, and every consequence looks like a code defect

`git worktree add` copies tracked files only; installs do not come with it. The failure mode is
that mass import errors **reproduce on clean `main` too**, so baselining confirms "not mine" and
the run reads as pre-existing breakage in the code.

**Run `npm ci` at the root of the worktree before baselining anything.** An uninstalled tree cannot
distinguish a real regression from a missing dependency.

This is not hypothetical: 147 unit-test failures were recorded as hidden breakage surviving green
CI. The cause was a worktree with no root `node_modules`. The method half of that lesson is in
`docs/ai_agent_workflow_rules.md`.

### KI-90 — `integrations.js` suppresses the Bunny warning exactly when Bunny is unconfigured, and ignores two return values

Two defects in one flow:

- **`api/routes/integrations.js:914`** — `if (!reg.ok && !reg.disabled)` gates the
  `console.warn` about a failed hostname pre-registration. `disabled` is set when Bunny is **not
  configured** — which is precisely the state a warning would be useful in. The condition
  suppresses the message in the only case that needs it.
- **`api/routes/integrations.js:981`** — `await addPullZoneHostname(domain)` and
  `await loadFreeCertificate(domain)` are called with **both return values discarded**. Failures
  here are silent, and the surrounding code proceeds as though registration succeeded.

### KI-91 — raw `console.*` calls bypass `safe-logger`, which already redacts `site_key`

`api/lib/safe-logger.js` exists and redacts `site_key`; direct `console.*` calls do not go through
it, so any of them that interpolates a `site_key` leaks a customer-facing tracking key into logs
(CLAUDE.md §6.5 forbids exposing raw `site_key` in logs).

**Scope, stated exactly as measured (2026-08-06, on `main`):**
- **450** `console.(log|warn|error|info)` calls in `api/`, excluding `api/tests/`.
- **Exactly ONE** file both imports `safe-logger` and still calls `console.*` directly:
  **`api/index.js`, 16 calls.**

⚠️ **An earlier figure of "19" circulated for this finding. It is unsourced and superseded** — no
filter has been found that reproduces it, and it is recorded here as retracted rather than quietly
replaced. Neither number above is a defect count: most of the 450 are legitimate. **The remediation
scope still needs defining** — the useful next step is to grep for `console.*` calls that
interpolate a `site_key`, which is the actual leak class.

### KI-92 — `Accordion.tsx` exposes no ARIA state (and the originally-recorded defect was WRONG)

⚠️ **The original claim was: `aria-controls` absent on all 24, and `role="button"` wraps the ANSWER
PANEL. The second half is refuted, and the first half is imprecise. Recorded rather than dropped,
because a defect log that quietly deletes a refuted claim teaches nothing.**

**What is actually in the file** (`marketing/src/layouts/shortcodes/Accordion.tsx`, **36 lines**):
- There is **no `role="button"` anywhere** — zero hits. `:16` is a **native `<button>` element**.
- That button wraps the **title and chevron** (`:16-30`). The answer panel is `:31`,
  `<div className="accordion-content">{children}</div>` — a **sibling, outside the button.**
- A native button on the header with the panel as a sibling **is the correct pattern.** There was
  never a structural defect here and never a rewrite to do.
- It is **one `<Accordion>` usage**, in `marketing/src/layouts/partials/FAQ.tsx`, mapped over 24
  items — **not 24 components.**

**The real, narrower defect:** the component has **zero ARIA attributes**. No `aria-expanded` on the
button, no `aria-controls`, and no `id` on the content div — so the expanded/collapsed state is
invisible to assistive technology across all FAQ items.

### KI-93 — `homeFixtures.js:145` cites a guard test that does not exist (⚠️ comment fixed in this PR)

The comment claimed: *"Guarded: `api/tests/ai-assistant-count-copy.test.js` asserts the shipped
homepage copy matches the classifier's label count."*

**That file does not exist**, and no test matches `ai.*count` or `assistant`. This is the
fictional-guard pattern: a comment asserting a safety net that was never built, in a file whose
next-door constant is wrong in exactly the way the claimed test would have caught (KI-94).

**The comment is corrected in this PR** — the entry alone would have left the false claim in the
source, where the next reader trusts it.

### KI-94 — `homeFixtures.js:28` says "+19", implying 22 AI assistants; the classifier's 16 is correct

`marketing/src/lib/homeFixtures.js:28` ships `sub: "ChatGPT, Gemini, Claude +19"` — three named
plus 19 implies **22**. Eleven lines later the same file exports `AI_ASSISTANTS = 16` (`:147`).
**The file contradicts itself.**

**16 is the truth** — the classifier is the source. For reference, `tracker/tracker.js:248` carries
a third number: its AI-source map holds **13** distinct labels (ChatGPT, Claude, Perplexity,
Gemini, Grok, Copilot, DeepSeek, Meta AI, You.com, Phind, Mistral, Poe, Kagi). Three surfaces,
three counts — 22 implied, 16 exported, 13 in the tracker. Not fixed here; recorded so the fix
reconciles all three rather than one.

### KI-95 — `#615`'s "Seats left — [VERIFY: wire to a real count]" is LIVE customer-facing text

A `[VERIFY: …]` authoring placeholder shipped to production copy. It is customer-visible, and it
also implies a scarcity count that is not wired to anything — which is a truthfulness problem
(CLAUDE.md §6: no fabricated numbers), not only a cosmetic one.

### KI-96 — `attribution-engine.js:697-713` carries a stale inline copy of the channel classifier

The `multiIf` ladder at `:699-713` duplicates the channel-classification logic that CLAUDE.md §11
designates as having a **single exported source of truth**
(`ORGANIC_SEARCH_ENGINE_HOSTS` / `ORGANIC_SEARCH_SOURCES`, shared between the Tinybird pipe SQL and
`channelFromEvent`). This copy is forked from it and can drift silently.

It is also written in the **HogQL dialect** (`properties.ai_source`, `properties.utm_medium`) — the
PostHog query language that CLAUDE.md §5 records as fully decommissioned — and is assembled by
string interpolation into a query built at `:695`.

### KI-97 — `seo-revenue.js` builds a HogQL string that `readTb` never executes, now disagreeing with its pipe

`api/routes/seo-revenue.js:30` states plainly that **the HogQL fallback is DELETED and Tinybird is
the sole read path**. But `readTb(pipeName, params, hogSql, hogName, mapRows)` (`:27`) still accepts
the HogQL parameters, and `:173` still passes a fully-constructed `sql` string into it.

So the string is built on every call and executed never. It has since drifted out of agreement with
`tinybird/pipes/seo_revenue_landing_pages.pipe`, which means it is now **actively misleading**: a
reader debugging SEO revenue will read query logic that does not run and no longer matches the
logic that does.

### KI-98 — base `h1` letter-spacing is `-0.048em`; the design spec says `−0.03em`

`marketing/src/styles/home-design.css:320` ships `letter-spacing: -0.048em`.
`docs/design/design.md:312` (§3.1 Core identity) specifies *"Geist, headings at −0.03em tracking."*

⚠️ **Note for anyone re-verifying this:** the spec line uses a **Unicode minus (U+2212)**, not an
ASCII hyphen, so a grep for `-0.03em` returns **zero hits in `design.md`** and the citation looks
unresolvable when it is simply written with a different character.

Not resolved here — which value is correct is a design ruling, not a doc fix.

### KI-99 — three branches exist on `origin` with no PR ever opened

- `claude/tinybird-phase1-events-schema`
- `claude/wave3-pipe-authoring`
- `resolve/xff-ip-security-cherrypick` — **126 changed files vs `main`** (definition: all changed
  files, `git diff --name-only origin/main...`, not filtered to code). ⚠️ An earlier figure of
  "75 code files" is unsourced; 126 with its definition stated replaces it.

All three verified present on `origin` (2026-08-06). Work sitting outside the review gate entirely:
never reviewed, never CI'd, and invisible to any process that enumerates PRs. The `resolve/xff-…`
branch name suggests security-relevant content, which makes its status worth deciding rather than
leaving.
# KI-100 … KI-104 — appended 2026-08-07

> **Numbering:** `KI-78` … `KI-99` are added by **#670** (`docs/reconcile-known-issues-2026-08-06`),
> open and blocked behind the CI throttle at the time of writing. #670 merges **before** this file,
> so the gap below `KI-100` closes on that merge. These entries are **append-only** — nothing above
> this line was touched, so the two branches meet in one tail hunk.

### KI-100 — Bunny issues the managed-proxy TLS certificates (RESOLVED — closes a long-open unknown)

**We searched for ACME code across several sessions and never found it. The reason is that we do not
issue certificates at all — BunnyCDN does.**

Verified live 2026-08-07 against pull zone `6119064`:

| Host | Subject | Issuer | Validity |
|---|---|---|---|
| `track.bookmentions.net` | `CN=track.bookmentions.net` | `C=US, O=Let's Encrypt, CN=YE2` | Jul 7 → Oct 5 2026 |
| `track2.bookmentions.net` | `CN=track2.bookmentions.net` | `C=US, O=Let's Encrypt, CN=YE2` | Jul 7 → Oct 5 2026 |

Both return `HTTP/2 200` with `server: BunnyCDN-…` and `cdn-pullzone: 6119064`, each holding a
**distinct certificate whose CN matches its own hostname** — per-hostname issuance, not a shared or
wildcard cert.

**This also settles the older "Bunny custom-hostname / per-tenant-certificate API capability —
UNVERIFIED" item: the capability is not merely available, it is already in production.** Any future
plan that plans to *build* certificate issuance is duplicating something Bunny is doing today.

**Status: VERIFIED** (live TLS chain + response headers, re-checked independently 2026-08-07).

### KI-101 — Tracker updates carry an up-to-8-day propagation tail (OPERATIONAL HAZARD — not fixed)

Live response header on the proxy-served tracker, confirmed on **both** hosts 2026-08-07:

```
cache-control: public, max-age=86400, stale-while-revalidate=604800, immutable
```

**A tracker change takes up to 24h to propagate (`max-age=86400`) and can then be served stale for a
further 7 days (`stale-while-revalidate=604800`) — an 8-day worst-case tail.** `immutable` tells the
browser not to revalidate even on reload, so there is no client-side bypass (see also the
edge-caching entry: the same response is unbypassable from the client).

**Why this is recorded now rather than after the fact: it blocks fast rollback of ANY tracker-side
defect.** It directly affects **A2 (the click-ID restorer)**, which is tracker-side — so an A2 bug
cannot be rolled back quickly, and the tail has to be **costed before A2 ships, not discovered
after**. This is the same ~8-day window already accepted for `tracker.min.js`; naming it as a
constraint on A2 is the new part.

**Not fixed.** Shortening `max-age` trades propagation speed against edge load and is a decision, not
a cleanup.

**Status: VERIFIED** (live headers, both hosts).

### KI-102 — `bindManagedProxySiteKey` is a BINDING guard, not a host allowlist

`api/middleware/managed-proxy.js:141-155`. The whole body:

```js
export function bindManagedProxySiteKey(req, res, next) {
  if (req.managedProxy) {
    const siteKey = req.body?.site_key || req.query?.site_key
    if (siteKey && siteKey !== req.managedProxy.site_key) {
      return res.status(403).json({ … error: 'Host-site key binding violation' })
    }
  }
  next()
}
```

Three properties that are easy to assume and are all false:

- **It does not inject a `site_key`.** A request without one passes straight through to `next()`.
- **It does not reject unregistered hosts.** An unregistered host has no `req.managedProxy`, so the
  outer `if` is false and the guard is **skipped entirely** for exactly the host you might expect it
  to stop.
- **It acts only on the narrow case:** a `site_key` that is present **and** mismatched → `403`.

**The consequence worth recording — we nearly filed this as a defect:** a `401 Missing site_key` on a
**registered** managed-proxy domain is **CORRECT behaviour, not a proxy failure.** The guard passes a
keyless request through by design, and the 401 comes from the downstream ingestion route doing its
job (§6.5: an ingestion endpoint must reject a missing/unknown `site_key` rather than fall through to
a default tenant).

**Status: VERIFIED** — source read at `:141-155`, plus a live `401` on **both** hosts with a cache
`MISS` and **distinct `x-railway-request-id`** values, which is what proves the request actually
reached the origin rather than being answered by the edge.

### KI-103 — Two hand-maintained `llms.txt` files, already divergent, neither generated

**Recurring-defect surface, not a one-off.** Nothing generates either file, nothing keeps either in
step with `key-features.md` or the changelog, and `public/` ships verbatim — so **no `src` scan can
see either**. Repo-wide, the only references to `llms.txt` in any `.js`/`.mjs`/`.json`/`.yml` are the
serve route itself: **no generator, no sync step, and no check that the two agree.**

They have already diverged — **874 B vs 2074 B, different content**:

| File | Size | Carries the absolutes? |
|---|---|---|
| `marketing/public/llms.txt` | 874 B | **YES** — `:10`, *"100% first-party, cookieless, zero cross-site tracking"*. This is the file **#675 fixes** |
| `dashboard/public/llms.txt` | 2074 B | **No** — `grep -nE "100%\|zero "` returns nothing |

> ⚠️ **TWO CORRECTIONS TO THIS ENTRY (2026-08-07), recorded rather than silently rewritten.**
>
> **(a) The original filing treated this as ONE file.** It cited
> *"`marketing/public/llms.txt` has no generator"* alongside *"`dashboard/server.mjs:101` only serves
> it"* — but those clauses are about **different files**. There are two, and they have diverged.
>
> **(b) A first draft of this entry then claimed *"the customer-visible surface still carries the old
> text"*. THAT IS WITHDRAWN — it inverted the severity.** The absolutes live **only** in the 874 B
> marketing copy, which is exactly the file #675 corrects. The 2074 B dashboard copy has none.
> **Nothing unfixed is shipping.** The draft assumed that "the copy #675 did not touch" meant "the
> copy that is wrong"; the opposite is true — #675 touched the one that needed it.

**What remains true, and is the actual finding: the routing is ambiguous.**
`dashboard/src/components/MarketingFooter.jsx:61` links to a **relative** `/llms.txt`, and
`dashboard/server.mjs:101-103` serves that path from `dashboard/dist` (`DIST` at `:6`). **Which file
answers depends on which SERVICE handles the request**, and the services have since been split:
marketing now runs as its own Railway service (`sourcetrack-marketing`, www + apex), while Dashboard
holds `app.sourcetrack.ai` only. `MarketingFooter.jsx` living under `dashboard/src` **predates that
split**, so its location no longer implies which origin renders it.

**VERIFIED by live request (2026-08-07)** — the byte length is an unambiguous discriminator:

| URL | Bytes | ⇒ file |
|---|---|---|
| `https://www.sourcetrack.ai/llms.txt` | **874** | the marketing copy |
| `https://app.sourcetrack.ai/llms.txt` | **2074** | the dashboard copy |

Both `HTTP/2 200`, both `server: railway-hikari`, distinct `x-railway-request-id`.

⚠️ **INFERRED — UNKNOWN, deliberately NOT asserted: which of the two the FOOTER LINK resolves to.**
Source alone cannot settle it. What is verified is only that `www/docs` is server-rendered (36 KB)
and contains **no** *"AI info"* string, while `app/docs` returns a **2971 B SPA shell** — so if the
footer renders at all it renders **client-side**, where `curl` cannot observe it. The plausible
reading is that `MarketingFooter` renders only in the dashboard SPA and its relative link therefore
resolves to the 2074 B copy — **but that is inference, not evidence, and it is not recorded as fact.**

**What would settle it:** a headless-browser render of a `MarketingPage`/`DocsLayout` route on
`app.sourcetrack.ai`, confirming the *"AI info"* link is present and reading its resolved `href` —
i.e. a browser-agent check, not a source read.

**Why any of this matters more than an ordinary stale doc:** this is the file AI systems fetch as the
product's self-description, so drift is **repeated back as fact about the product** by other AI
systems. Two hand-maintained copies with no generator and no parity check is a surface that will
drift again — it already has once.

**Cross-reference:** the `QA_RUNBOOK` entry added in **#675** — *scan built output, not source* — is
the right shape of check and is why source scans miss this class. ⚠️ **#675 is still OPEN at the time
of writing, so neither that entry nor its `llms.txt` correction exists on `main` yet.**

**Status: VERIFIED** for the file inventory, the divergence, the absence of a generator, and the
per-origin serve mapping (live). **INFERRED-unknown** for the footer's resolution target, as above.

#### KI-103 addendum — the routing map is CONFIRMED, and it exposes a LIVE claims defect

**The serve mapping is now VERIFIED TWICE, independently** — once by CC and once by the browser
agent (2026-08-06 22:46–22:49Z), and re-confirmed by CC at **2026-08-06 22:52:13Z**. All three runs
agree. This is no longer inferred anywhere:

| URL | `content-length` | ⇒ file | Absolutes? |
|---|---|---|---|
| `https://www.sourcetrack.ai/llms.txt` | **874** | `marketing/public/llms.txt` | ⚠️ **PRESENT** |
| `https://app.sourcetrack.ai/llms.txt` | **2074** | `dashboard/public/llms.txt` | clean |

All responses `HTTP/2 200`, `server: railway-hikari`, distinct `x-railway-request-id`.

**🔴 LIVE EXPOSURE — open now.** A grep against the **live** `www` response body returns:

```
10:- Cookieless Identity Moat: 100% first-party, cookieless, zero cross-site tracking or fingerprinting.
```

**The false absolute is serving on the public marketing site at this moment, in the one file written
specifically for LLMs to ingest.** Every AI system that fetches `/llms.txt` during this window takes
the absolute as fact and may repeat it as a claim about the product — which is the failure mode this
entry exists to describe, now actually occurring rather than hypothesised.

**Window:** opens now, closes when **#675** merges. Duration is **throttle-dependent and currently
unbounded** — #675 is pushed and sitting at **0 CI runs** behind GitHub incident **#6249** (~15% of
webhooks trigger a run), so there is no predictable close time.

> ⚠️ **THIS DOES NOT REINSTATE THE WITHDRAWN CLAIM — and the difference is the point of this entry.**
> The withdrawal above was about the **DASHBOARD** copy (2074 B), which has **no** absolutes. That
> withdrawal **STANDS and is still correct.** The exposure is on the **MARKETING** side, through a
> **different file than either party was tracking when the original claim was made.**
>
> **The finding survived its own retraction and changed surfaces.** Recording it as a reinstatement
> would erase the fact that the first version was wrong about *which file*; recording only the
> retraction would erase a live defect. Both are true at once, and neither cancels the other.

**RULING — recorded so it is not re-opened: do NOT hand-edit the deployed file out-of-band.**
Patching the live `llms.txt` directly would trade a claims defect for a **provenance defect** —
deployed state diverging from git, with no commit explaining why — which is *precisely* the class of
problem this KI documents (two hand-maintained copies, no generator, no parity check). A second
untracked edit path would make the next drift harder to detect, not easier. **Wait for #675.**

**SEQUENCING CONSEQUENCE.** **#674** (*cut the "100%" absolute from the changelog's cookieless line*)
and **#675** (*cut four remaining absolutes, incl. two in the AI-facing `llms.txt`*) are the **ONLY**
open PRs whose delay carries an **ongoing EXTERNAL cost** — every other queued PR costs only internal
time while it waits. **Merge order revised: both promoted to TIER 1, ahead of the v3 chain.** Both
verified OPEN at **0 CI runs** (2026-08-06 22:52Z).

**Footer resolution remains INFERRED-UNKNOWN** — unchanged by any of the above. Knowing which origin
serves which *file* does not establish which origin renders the *footer*; that still needs a
headless-browser render of a `MarketingPage`/`DocsLayout` route on `app.sourcetrack.ai`.

### KI-104 — `/api/server/event` accepted click IDs ONLY when nested under `properties` (pre-#676)

⚠️ **Recorded as a CORRECTION, not a discovery — the original claim was that the route could not
accept click IDs at all. It could; the capability was undiscoverable rather than absent.**

On `main` before #676 (`api/routes/server-events.js`):

- The route read **UTMs from top-level body keys** — `req.body.utm_source` … `req.body.utm_term`
  at `:211-215`. That is the convention the route teaches a caller.
- It had **no top-level click-ID equivalent** — `grep -cE "req\.body\.(gclid|fbclid|dclid)"` → **0**.
- But the catch-all `...(req.body.properties || {})` spread at **`:228`** quietly carried **nested**
  click IDs through — into the typed columns, via the adapter's flatten
  (`tinybird/adapter/normalize.js:216-220`, top-level wins on collision).

**So the capability EXISTED but was undiscoverable.** A caller following the route's own UTM
convention (`{ gclid: … }`) **failed silently**; a caller who happened to nest
(`{ properties: { gclid: … } }`) **succeeded**. Same documented endpoint, opposite outcomes, no error
either way — the worst shape for a data-capture gap, because the failing caller gets a `200`.

**#676 makes the contract consistent by accepting the top-level form. It did NOT create the
capability**, and any claim that it "added click-ID support" overstates it.

**The testing consequence, which is the durable lesson:** a test written with the *nested* form would
have **passed on `main`** and measured nothing. #676's tests post at **top level** for exactly this
reason, and its positive control executes `origin/main`'s route to prove the assertion discriminates.

**Status: VERIFIED** (source read at `:211-215` and `:228` on `main`; nested-form behaviour confirmed
by execution during #676).

### KI-105 — the managed-proxy gate IS executing on registered domains ✅ REFUTES A SUSPICION (one divergence left open)

**The suspicion, now refuted for registered domains.** We suspected `managedProxyEarlyGate` never
ran in production — that Bunny masked the customer hostname, the `Host` header matched
`ST_PLATFORM_HOSTS`, and the gate returned `next()` at `api/middleware/managed-proxy.js:76-78`
(*"Skip managed proxy checks for standard API/dashboard traffic"*), bypassing the lookup, the 404,
the status check and the path allowlist. That would have made the whole managed proxy decorative.

**THE DISCRIMINATOR.** `/robots.txt` is **not** in `ALLOWED_PATHS` (`managed-proxy.js:21-33`
— verified: the set holds the two tracker bundles, `/api/track`, `/api/collect`, `/track`,
`/api/conversion`, `/api/tracker/id`, `/api/identify` and the proxy-health path, and nothing else).
If the gate runs, step 7 (`managed-proxy.js:124-126`, `if (!ALLOWED_PATHS.has(req.path))`) returns
`res.status(404).send('Not Found')` — a **9-byte** body. If the gate does *not* run, the request
falls through to Express's default 404, which is a **149-byte HTML page**. The two are trivially
distinguishable, and nothing else in the stack produces a 9-byte `Not Found`.

**VERIFIED live (2026-08-06, reproduced independently 2026-08-07).** Both responses were
`cdn-cache: MISS` with **distinct** `x-railway-request-id` values, so the origin was genuinely
reached in each case and the two are independent observations, not one cached answer served twice:

| host | status | content-length | body | `x-powered-by` |
|---|---|---|---|---|
| `track2.bookmentions.net/robots.txt` | 404 | **9** | `Not Found` | `Express` |
| `track.bookmentions.net/robots.txt` | 404 | **149** | Express default HTML (`Cannot GET /robots.txt`) | *absent in capture* |

**CONCLUSION (verified): on the registered domain the gate executes and the path allowlist is
enforced.** `track2.` — the hostname actually present in `managed_proxy_domains` — returns the
gate's own step-7 rejection byte for byte. **The managed proxy is not decorative.**

⚠️ **UNRESOLVED — DO NOT RESOLVE THIS BY REASONING.** Per `managed-proxy.js:107-109`, an
unregistered non-platform host should hit `record === null` and return the **same 9-byte
`Not Found`**. `track.bookmentions.net` returned Express's default instead, so it **never entered
the custom-domain branch at all**. Either it resolved as a platform host, or it reached a different
origin. **Cause UNKNOWN. Do not assert one.**

**What would settle it:** capture `cdn-host`, `x-st-proxy-secret` and `cdn-pullzoneid` **as the
origin sees them** for each hostname. Those three inputs decide which branch
`managed-proxy.js:60-62` takes, and they are not observable from the client side — which is
precisely why this is open rather than answered.

⚠️ **A NOTE ON THE TEST'S OWN VALIDITY, recorded so it is not misread in either direction.** The
control in the original run was **VOID** (`cdn-cache: HIT` — see KI-106: query-string cache-busting
does not work on this pull zone, so the intended busting control never established freshness).
**The result stands anyway**, because both targets independently returned `MISS` with distinct
request IDs — which is the property the control existed to establish, arrived at by another route.
A void control does not make a void test, and a valid test does not retroactively validate its
control. Both halves are stated so neither is inherited.

### KI-106 — query-string cache-busting does NOT work on Bunny pull zone 6119064 ⚠️ COMPOUNDS KI-101

**VERIFIED live (2026-08-06, reproduced 2026-08-07).** A GET for
`/tracker.min.js?cb=<unique-epoch-value-never-requested-before>` returned:

    HTTP/2 200
    etag: W/"57d3-19fd4221fd0"
    cdn-cachedat: 08/05/2026 23:16:58
    cdn-cache: HIT

— the **same etag and the same `cdn-cachedat`** as the un-busted baseline captured hours earlier.
**Bunny is ignoring the query string in the cache key for static assets on this pull zone.** A URL
that has provably never been requested before returns a day-old cached object.

**CONSEQUENCE — this is why it matters.** KI-101 records an up-to-8-day stale-tracker tail
(`max-age=86400` + `stale-while-revalidate=604800` + `immutable`). This entry establishes that the
tail has **no client-side escape hatch**:

* a cache-busting query parameter does **not** force a fresh fetch (verified above);
* a `Cache-Control: no-cache` **request** header does not bypass it either (verified, KI-101).

**So a tracker defect cannot be rolled back from the caller's side at all.** Purging requires the
**Bunny API** or a **filename change** — both of which are operator actions, not deploy actions.

⚠️ **This raises KI-101's severity from "propagation is slow" to "propagation is slow AND cannot be
bypassed."** The distinction matters for incident planning: a slow-but-bustable cache means a fix
plus a query param; an unbustable one means the old bundle keeps executing until Bunny is purged
out-of-band.

**Directly affects A2 (the click-ID restorer), which is tracker-side.** Cost the purge path before
A2 ships, not during the incident that needs it.

**Not fixed. Recorded, not acted on** — the caching is correct for a static asset, and the fix is an
operational runbook step (how to purge) rather than a code change. See KI-101 for the propagation
window this compounds, and KI-105 for the void-control note that depends on this finding.

---

## Amendments to KI-100 and KI-102 — citations ported from #677 (closed as a duplicate)

**Why these are here rather than inside the entries.** #677 recorded `KI-100`…`KI-104` from a parallel
session against a different base, and was closed as a duplicate of the #678 line that merged. Its
entries duplicated what merged — but its **citations were richer**, and closing the PR would have
discarded them. They are ported as **amendments referencing the entries by number**; `KI-100` and
`KI-102` are **not edited**.

Every citation below was **re-verified from source at the cited `file:line`**, not copied forward
from the closed PR.

### Amends KI-100 — the full self-serve Bunny flow, not just the certificate call

`KI-100` records *that* Bunny issues the certificates. `api/lib/bunny-edge.js:1-13` documents the
**whole** managed-custom-domain flow, of which issuance is only the middle step:

| Function | Line | Endpoint (`bunny-edge.js:8-10`) | Expected |
|---|---|---|---|
| `addPullZoneHostname()` | `:106` | `POST https://api.bunny.net/pullzone/{id}/addHostname` body `{"Hostname"}` | `204` |
| `loadFreeCertificate()` | `:122` | `GET https://api.bunny.net/pullzone/loadFreeCertificate?hostname=<host>` | `200`/`201` |
| `removePullZoneHostname()` | `:135` | `DELETE https://api.bunny.net/pullzone/{id}/removeHostname` body `{"Hostname"}` | `204` |

Auth is an **`AccessKey: <BUNNY_API_KEY>` header on every request** (`:11`). That variable is
account-scoped and **server-side only** — referenced here **by name only, never by value** (§0).

> ⚠️ **THE ORDERING CONSTRAINT — operationally the sharpest part, and recorded nowhere until now.**
> `bunny-edge.js:11-12`: **the hostname MUST already exist on the pull zone before
> `loadFreeCertificate` is called — otherwise Bunny returns `404 (hostname_not_found)`.**
>
> `addPullZoneHostname` → *then* `loadFreeCertificate`. Reversing them does not fail in a way that
> names its cause: you get a **404 from a certificate call**, which reads as *"certificate issuance is
> broken"* rather than *"the hostname was never registered"*. **This is the same misdiagnosis shape as
> `KI-102`'s 401** — a correct response from a step that ran in the wrong order. Two of the four
> entries in this batch are instances of it.

The module is **fail-CLOSED** when the key or zone id is unset (returns `{ disabled: true }` rather
than crashing) and **fail-SAFE** (never throws to the caller). Note the interaction with the
suppressed-warning defect recorded separately: `disabled` is exactly the state whose warning is gated
out by `if (!reg.ok && !reg.disabled)` at `integrations.js:914`, so a wholly unconfigured Bunny is the
one case that stays silent.

### Amends KI-102 — the exact responses we nearly misdiagnosed

`KI-102` explains *why* a `401` on a registered proxy domain is correct. These are the literal
sources of that `401` — ordinary `site_key` validation in `api/middleware/auth.js`, **not** the
managed-proxy layer:

| Line | Response |
|---|---|
| `:32` | `401 { success: false, data: null, error: 'Missing site_key' }` |
| `:79` | `401 … error: 'Invalid site_key'` |
| `:91` | `401 … error: 'Invalid site_key'` |
| `:188` | `401 … error: 'Invalid site_key'` |

`:31-33` is the whole of the first one — `if (!siteKey) { return res.status(401)… }`. **This is
`KI-102`'s payoff:** that response was investigated as a proxy failure across three separate rounds
before the guard's actual behaviour — `bindManagedProxySiteKey` passes keyless requests through by
design — made it clear the 401 is the ingestion layer doing its job (§6.5: never fall through to a
default tenant).

### Method and provenance — why the search kept failing

Three facts about *how* `KI-100` was reached, recorded because the pattern is reusable:

1. **The ACME scan returns exactly two files, and both are tests.** `grep -rlniE "acme"` across
   `*.js`/`*.mjs` (excluding `node_modules`) matches **only**
   `api/tests/tracker-booking-detection.test.js` and
   `api/tests/ad-platforms-status-connected.test.js`.
2. **Both matches are incidental fixture names, not certificate code** —
   `tracker-booking-detection.test.js:223` contains `answer: 'ACME Corp'`, and
   `ad-platforms-status-connected.test.js:25` contains `account_name: 'Acme Ads'`. Repeated sessions
   read *"two hits, no cert code"* as *"the code must be somewhere else"* rather than the correct
   conclusion, *"there is no such code because we do not do this."* **A near-zero-hit scan whose only
   hits are fixture strings is evidence of ABSENCE, not of a failed search** — the same
   two-explanations trap as a zero-hit grep, one step along.
3. **The certificates were read from the TLS handshake** — `openssl s_client -servername <host>`
   piped to `openssl x509` — **not from a provider console.** That is what makes the issuer and the
   per-hostname CN properties of *what is actually served*, rather than of what a dashboard reports.

---

### KI-107 — UA-based bot filtering is structurally blind to UA-spoofing scrapers, and the inflation reaches visitor counts and CVR denominators

**The filter's AXIS is wrong. This is not a missing filter, and not a missing UA token.**

**The observation** (Tinybird **`SourceTrack` — PRODUCTION**, 24h window, 2026-08-07):

| Signal | Value | What real traffic looks like |
|---|---|---|
| `ingestion_method = server_routed` | **214 pageviews** | — |
| distinct visitors | **205** | — |
| **pages per visitor** | **1.04** | real content traffic runs **2–4** |
| no referrer | **209 / 214** | — |
| `browser_name` NULL | **58 / 214** | — |
| countries | 5 | — |

A 1.04 ratio means essentially **one page per visitor, then gone** — the shape of a scraper sweep,
not of reading.

**Blast radius: none, today.** Both affected sites are **founder-owned** (`techrupt.pk`,
`bookmentions.net`), so **no customer is looking at these numbers.** It is recorded anyway because
**it is the number a founder reads** when judging whether the product works.

#### Why these requests pass — by construction, not by oversight

`api/lib/bot-filter.js:71-72` — `isIngestionBotUserAgent(ua)` returns true **only** when the UA is
**empty** or matches `INGESTION_BOT_UA_PATTERN` (`:66`), a token list: `googlebot`, `bingbot`,
`headlesschrome`, `selenium`, `puppeteer`, `curl/`, `python-requests`, `axios/`, `scrapy`, and so on.
`:70` states the design in its own words: *"Everything else … is LET IN."*

**A scraper that sends a plausible desktop-Chrome UA is neither empty nor a token match.** It reports
`chrome`/`desktop`, `UAParser` resolves it cleanly, and it is admitted. **Adding more UA tokens
cannot fix this** — the evasion is the spoof itself, and the list can only ever name UAs that are
honest about being automated.

⚠️ **The sharpest part: the filter WAS applied to these requests.** `ingestion_method =
'server_routed'` is emitted by `api/routes/track.js:464`, `:586`, `:713` (and `conversion.js:288`) —
that is **`/api/track`**, and `/api/track` **does** run the filter, at `track.js:171`. So these 214
rows are not traffic that slipped past an unguarded rail; **they are traffic that passed the guard on
the one rail every shipped tracker actually uses.**

#### Why it reaches visitor counts and CVR denominators

`server_routed` is not treated as a lesser signal downstream. `api/lib/attribution-engine.js` maps it
to `provider = 'browser'` (`:106`, `:319`), `stitching_method = 'browser'` (`:110`, `:320`) and
`attribution_status = 'attributed'` (`:108`). **Spoofed traffic therefore lands as attributed browser
visitors** — inflating unique-visitor counts and sitting in the **denominator** of every conversion
rate, which pushes CVR down. The metric moves in the direction that looks like a product problem.

#### ⚠️ DISTINCT FROM KI-77 — do not merge these two

| | KI-77 | **KI-107** |
|---|---|---|
| Claim | the automation score is **log-only** | the **filter's axis is wrong** |
| Evidence | `track.js:188-191` — `auto_score` is read and `console.log`'d, never gated. Same shape at `bot-filter.js:127-137`, where `logWouldDropBot` observes and never drops | `bot-filter.js:66,71-72` — the predicate cannot match a spoofed UA at all |
| Fix shape | a **threshold decision** on a signal that already exists | **a different signal.** No threshold on `auto_score` and no UA token helps |

**KI-77 is "we measure it and do nothing." KI-107 is "we are not measuring the right thing."**
Closing KI-77 would leave KI-107 wholly untouched.

#### What #666 and #667 did, and why neither is this

Both were **correct fixes to real defects**, and **neither addressed this one**:

- **#666** fixed `/api/analytics/collect` — the *reporting* predicate running at *ingestion*
  (`api/routes/analytics.js`). Wrong predicate, wrong layer.
- **#667** wired the filter to `/sp/e` and `/sp/pixel` (`api/routes/proxy.js`), and documented why
  `server-events.js` must stay exempt.

⚠️ **Neither touched the rail carrying this traffic**, and #667's own body says why that is expected:
*"**No shipped tracker calls either rail** — all four builds POST to `/api/track`; `/sp/e` and
`/sp/pixel` appear only in `rate-limit.js`'s allowlist and a QA script."* Those PRs hardened rails
that no shipped tracker uses. **This defect is on the rail every shipped tracker does use**, and it is
not a gap in coverage — the guard is present and admits the traffic.

#### §6 constrains any remedy — read before proposing one

1. **The 214 rows CANNOT be retro-analysed.** Raw `user_agent` is **never persisted**: it is in
   `FORBIDDEN_KEYS` (`tinybird/adapter/normalize.js:92`) and is **not a column** in
   `events.datasource`. `track.js:186-187` states the reason — §6 treats a raw UA as
   **fingerprinting-adjacent**, so only a coarse hash is ever logged. Any investigation must be
   **forward-looking**; there is no stored UA to mine.
2. **An ingestion drop is irreversible.** A filter that drops on a heuristic — session shape, request
   cadence, a scoring threshold — deletes the event permanently, with **no** recovery path, and a
   false positive silently deletes a real customer's real visitor. That is why this is recorded
   rather than fixed in place.
3. **Do not "fix" it by fingerprinting.** Cookieless, no-fingerprinting is a **security and privacy
   boundary** (CLAUDE.md §6, §6.5), not a preference. A remedy that identifies scrapers by
   device-fingerprint entropy trades a metrics defect for a moat breach and is not available.

**A viable direction, not a decision:** the discriminating signals here are already non-PII and
already present — **pages-per-visitor**, **referrer absence**, **`browser_name` NULL rate**. Those
support **flagging or segmenting at READ time**, which is reversible, rather than dropping at
ingestion, which is not. **Not fixed. Recorded so the axis problem is understood before anyone
extends the UA list and believes it is closed.**

**⚠️ CORRECTED 2026-08-07 — this entry originally said `ST_Staging`. It is PRODUCTION data.**
The workspace was identified by data, not by name: the `de200000` staging fixture returns **0 rows**
here, and both site_ids resolve in **prod** Supabase (`zxjjjsipafojhzkkumvh`) — `712a83a8-…`
bookmentions.net (`free`) and `eb7f68c3-…` **www.techrupt.pk (`growth`)** — while the same three ids
return **0 rows** in staging (`nrsvpwzekfrdrzkoecfk`). **This raises the severity: the inflated
visitor counts are on a live growth-plan site, not a staging sandbox.** Both sites are
founder-owned, so no paying third party is affected today.
**This is KI-54 recurring three weeks on, in the opposite direction: KI-54 was the WRITE path (fixtures seeded into prod); this was the READ path (prod data reported as staging) — same root cause, so fix the cause there, not here.**

*Provenance — CORRECTED. The previous line read "orchestrator-supplied … not re-queried by CC, which
has no Tinybird access." **Every clause of that was wrong and it is replaced, not softened**, because
a false provenance line tells the next reader to distrust the source that is actually good. CC **has**
Tinybird MCP access (prod workspace) and used it repeatedly while filing this. The 24h table
(214/205/1.04/209/58/5) **originated with the orchestrator AND was independently re-queried by CC**,
returning `server_routed,214,205,1.04,58,209,5` — an exact match, which is what established the
prod binding above. Every code claim was verified from source at the cited `file:line` on `main`
(`ee7e4113`). See **KI-108** for the billing columns, which are CC-queried outright.*
### KI-108 — bot traffic that passes the UA filter is METERED against paid pageview quota (2026-08-07, no realised harm, NOT fixed)

**Mechanism.** The ingestion bot filter runs at `api/routes/track.js:171` (`isIngestionBotUserAgent`). The pageview meter runs 229 lines later at `api/routes/track.js:400` (`claimPageviewUsage` → Supabase RPC `claim_site_pageview_usage`). Anything that survives the filter and is typed `$pageview` is metered **unconditionally** — there is no second gate between them. This traffic survives the filter **by construction**; see **KI-107** for why it arrives at all. KI-107 is why the traffic gets in; this entry is what it costs.

**The comment that makes the meter look safe.** `api/routes/track.js:392-394` reads, verbatim (the load-bearing phrase is on `:393`):

> `// Only true $pageview events consume monthly quota. Custom events, conversions,`
> `// and outbound clicks are excluded. Claim happens here (after all filtering/validation)`
> `// to avoid burning quota for events that would have been dropped.`

The claim *"after all filtering/validation"* is **TRUE, and load-bearing in the wrong direction.** Passing the UA filter **is** passing validation — so the comment reads as a safety guarantee it does not provide. On a source read the meter looks protected; it is protected only against traffic the filter already catches, which is exactly the traffic that is not the problem. **That phrasing is why this was not noticed earlier.**

**Measured, prod.** Hard caps are `3×` free / `10×` paid (`api/lib/pageview-limits.js:22-23`):

| site | plan | pv_limit | soft / hard cap | month | metered | stored in TB |
|---|---|---|---|---|---|---|
| www.techrupt.pk | growth | 150,000 | 150,000 / 1,500,000 | 2026-08 | 541 | 538 |
| bookmentions.net | free | 5,000 | 5,000 / 15,000 | 2026-08 | 62 | 61 |
| bookmentions.net | free | 5,000 | 5,000 / 15,000 | 2026-07 | 1,730 | 1,693 |
| www.techrupt.pk | growth | 150,000 | 150,000 / 1,500,000 | 2026-07 | 689 | 561 |
| www.techrupt.pk | growth | 150,000 | 150,000 / 1,500,000 | 2026-06 | 27 | — |

**Provenance.** The `metered` column is `site_usage_monthly` in **prod Supabase** (`zxjjjsipafojhzkkumvh`) — **CC-queried, and independently orchestrator-confirmed** against the same table. The `stored in TB` column is the Tinybird `events` count of `event_type='$pageview'` per site-month — **CC-queried directly via the Tinybird MCP**, which reads the **prod** workspace (established by both site_ids resolving in prod Supabase and returning zero rows in staging). The two columns were read minutes apart, which is why August shows 541 vs 538 rather than an exact tie — see the reconciliation note below before treating any gap as a defect.

**No realised harm — stated plainly.** bookmentions.net peaked at **1,730 against a 5,000 soft / 15,000 hard cap**; www.techrupt.pk at **689 against 150,000 / 1,500,000**. **Neither site approached either cap.** Nothing was rejected, no overage was billed, and both sites are **founder-owned**, so **no customer is exposed today**. This entry records a live mechanism, not an incident.

**The meter is NOT over-counting — do not re-derive the July gap as a defect.** August reconciles exactly: `61/61`, and `541/538` is events landing between the two reads. July shows larger gaps (`1,730` vs `1,693`; `689` vs `561`) and those are **explained, not unexplained**: the Tinybird `events` history **begins 2026-07-07**, a dual-write cutover. The meter had been running before Tinybird held any rows, so July's metered figure legitimately covers days the stored figure cannot. June shows `—` for the same reason. **This gap is not drift and not a billing defect.** It was chased once and resolved; it is written down here so it is not chased again.

**Why it still matters despite zero realised harm.** On **2026-07-18** a single day produced **1,441 pageviews** on a **free 5,000/mo** site — **~29% of the monthly allowance in one day.** Four such days exhaust the soft limit. At the hard cap the route returns **402** and the event is **PERMANENTLY LOST** (`api/routes/track.js:404-412`, the `return res.status(402)` at `:408`) — **§6 data loss caused by bot volume rather than by real usage.** A free-tier customer with genuine crawler exposure would burn their allowance on traffic they never had, hit the cap, and **then lose real events**. The failure mode is not "a customer is over-billed"; it is "a customer's real analytics stop while their quota was spent on machines."

**Status: NOT fixed, and deliberately so.** Any fix here is a change to what gets metered, which is billing-adjacent and must not be an agent-initiated behavioural change. Recording the mechanism is the deliverable.
