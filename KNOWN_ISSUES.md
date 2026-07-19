# Known Issues

This file should stay short. Only include verified issues or high-confidence risks.

Do not use this file as a backlog for every idea. Use it to prevent repeated mistakes.

## Current verified/high-confidence issues


### 1. `schema.sql` is stale

The live database schema has been repaired through migrations, but `supabase/schema.sql` does not fully reflect the current tables/columns/policies.

Relevant files:

- `SUPABASE_SCHEMA.md`
- `supabase/migration_session_68_schema_alignment.sql`

Current rule:

- Treat migrations and live Supabase verification as source of truth.
- Do not rely on `schema.sql` alone.

### 2. Dashboard widgets policy not verified

RLS policies are verified for:

- `companies`
- `company_members`
- `sites`
- `saved_reports`
- `admin_audit_log`
- `qa_notes`

`dashboard_widgets` policy may be missing. This is not blocking until dashboard widget persistence becomes active work.

Relevant future session:

- Session 81 dashboard saved-report widgets

### 3. ~~No paid ad click-ID capture~~ — ACTUALLY WORKING

**This issue was wrong. Click IDs ARE captured end-to-end:**

- Tracker captures: `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `twclid`
- `api/routes/track.js` stores all of them on the PostHog event
- `api/lib/channel-classifier.js` uses them for channel classification:
  - `gclid/gbraid/wbraid/msclkid` → Paid Search
  - `fbclid/ttclid` → Paid Social
- `api/jobs/nightly-attribution.js` reads click IDs from touchpoints and writes them to `attributed_conversions`
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

### 13. Stale click-ID-blind channel CASE classifier in 3 pipes

Three pipes (`session_report_pageviews`, `session_report_conversions`, and `seo_revenue_landing_pages`) contain a click-ID-blind channel classifier that disagrees with `channelFromEvent` in the JS engine and other pipes. This causes live mis-classification in session reports and SEO revenue. A dedicated PR is required to copy CC's corrected SQL over to these pipes.

### 14. admin and leads_count swallow Tinybird throws

The `/admin` endpoints (containing 6 inner catches) and the `/leads/count` endpoint swallow the Tinybird read error throws. Instead of propagating the error to trigger a proper 500 error, they catch the error internally and return an HTTP 200 response with zeroed KPIs. This means `TINYBIRD_FORCE_READ=true` cannot reach the handler-level catches. The inner try-catch blocks in these handlers need to be stripped.

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

Multiple tokens are queued for rotation:
- `deploy_token` (currently referenced in a shell env var).
- Pre-existing Tinybird tokens exposed in previous logs and session transcripts.

### 19. Nightly attribution: pipe-vs-HogQL parity was never empirically established (now unobtainable)

The nightly (`api/jobs/nightly-attribution.js`) writes the money rail (`attributed_conversions`). D2 moved its conversion + touchpoint reads from PostHog/HogQL onto Tinybird pipes. The B1 `--validate` byte-diff harness (`scripts` flags on the nightly, `api/tests/nightly-validate-harness.test.js`) **never compared a pipe-computed row against a HogQL-computed row for the same conversion** — and it structurally cannot:

- `$conversion` events were written **Tinybird-only** (`writeConversionDirect`, no `ph.capture` — `api/routes/stripe-webhook.js`), so they were **never dual-written**. No real conversion ever existed in both stores.
- Of 182 staging `attributed_conversions` rows, 179 were processed in the HogQL era; their source events live only in PostHog, so the pipe returns nothing for them → they land in `missing`. The 3 comparable rows were all processed post-cutover **by the pipe itself**, so their `--validate` diff is a **determinism** check (recompute-vs-stored off the same pipe), **not** parity.
- PostHog is decommissioned (D3); the corpus cannot be reconstructed. Phase 9 spec'd a Tinybird-vs-PostHog overlap reconciliation but it was never cleanly run for the money path (a non-recoverable `+339ms` PostHog ingestion timestamp shift, a prod-PostHog `403`, and a windowed-path OOM — see `tinybird/GATE3_RECONCILIATION_CONTRACT.md`, `tinybird/PHASE9_VALIDATION_HARNESS_SPEC.md`).

**This is a pre-existing gap D2 surfaced, not one it created.** Verified: no test or script has ever reconciled `attributed_conversions` against Stripe or any independent anchor (the first nightly validation harness in git history *is* D2 B1, #292). The pre-D2 HogQL path was itself an **unvalidated read writing the money rail**. D2 swapped one unvalidated read for another **while net-adding** assurance — B1's determinism harness and B0's fail-closed guard (#290).

What we rely on instead (and the standing gate for removing the HogQL fallback in B3):
- **Determinism** — `--validate` recompute-vs-stored across N rows (money fields exact; timestamps compared as instants).
- **Correctness-by-construction** — an adversarial fixture (deliberate same-timestamp tie + all 4 credit models + AI-influenced touch + $0 carrier) asserted against **hand-computed** expected values, never a recompute. The tie is the one divergence known to occur in production-shaped data (`realTies=1`) and the one thing `--validate` cannot test.
- **Stripe reconciliation** of real revenue — Tinybird `$conversion`s vs Stripe, the true source of truth for webhook-sourced conversions (HogQL never was). **Covers webhook-sourced revenue only** — tracker and manual conversions have no independent anchor and never did.

Status: pipe-vs-HogQL parity for the nightly write path is **UNVERIFIED and will remain so** — recorded here rather than implied by a green harness.


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

`api.sourcetrack.ai` (or similar) is served by the **api** Railway service:
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
3. **`api/jobs/health-agent.js:213`** requires four `POSTHOG_*` vars, and its `:137`/`:182` checks fetch PostHog directly. **Still open** (see below).

**Net ordering constraint: D5 cannot run until D2·B3 (nightly) and the health-agent decision (D2·health-agent) are both resolved.** Only the boot-guard (item 1) is cleared.

### health-agent will report 🔴 unhealthy once PostHog is decommissioned (2026-07-19)
`api/jobs/health-agent.js` has two direct HogQL fetches — `:137` (`SELECT 1` liveness) and `:182` (`count()` of `$pageview` in the last 24h) — plus an env check at `:213` requiring `POSTHOG_API_KEY`/`POSTHOG_PERSONAL_API_KEY`/`POSTHOG_PROJECT_ID`/`POSTHOG_HOST`. On a PostHog error today the `check()` wrapper catches and reports that check as `status:'error'` (it does **not** skip or throw the job). Because `posthog` ∈ `CRITICAL_CHECKS`, that error escalates to an **overall critical → Slack 🔴**. So once PostHog is decommissioned (D5): the `posthog` check goes **critical/🔴 (a false alarm)**, and `data_flow` + `env_vars` go to non-critical `error`.

These checks are **not migrated or retired** — that is a design decision, deliberately left open (reported, not edited). Equivalent Tinybird pipes are **deployed but tenant-scoped (`site_id required`), not the global project-wide probe health-agent does today**: liveness ≈ `doctor_token_verify` (events in last 15 min) or `events_health_last` (last event ts); pageview volume ≈ `events_health_day` (any event, 24h) or `doctor_pageviews_30d` (pageviews, 30d). A faithful replacement needs either a new global health pipe or a per-site fan-out. **Migrate or retire the two checks + drop the four `POSTHOG_*` from the `:213` env list before D5, or health-agent alarms 🔴 the moment PostHog goes dark.**
