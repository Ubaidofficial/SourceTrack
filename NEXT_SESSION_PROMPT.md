# Next Session — Status as of 2026-07-30, head `5c03200` (post-#515)

**Read `docs/SESSION_HANDOFF.md` first** — it is the current-state doc and holds the evidence behind
everything below. `FEATURE_MAP.md` §28 is tonight's per-PR delta; §29 is the new Shopify-app repo.

**Tonight in one line:** 20 PRs merged (#475, #496–#511, #513–#515; **#512 closed and correctly
reversed**), a new repo created (`sourcetrack-shpfy-app`, native Shopify app, 2 PRs merged), and the
docs migration got halfway.

> **Standing verification bar, unchanged:** verify against the fetched remote ref, not a local tree.
> Only GREEN, prod-verified, with-real-data is "done". Raw evidence (diff, query result, screenshot)
> beats description. Test/QA/seed data is not proof.
>
> **Note:** `SESSION_STATE.md`'s retirement banner points at "NEXT_SESSION_PROMPT.md §0.5" as the
> single entry point. **There is no §0.5 in this file** — it was rewritten since. The entry point is
> `docs/SESSION_HANDOFF.md`, then this file.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## TONIGHT'S PRIORITY LIST (2026-07-30) — do these in this order
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 1. 🔴 Verify the Shopify test order end-to-end — highest value open item

The one thing tonight built and could not prove. Everything else here is smaller.

**State:** `Ubaidofficial/sourcetrack-shpfy-app` — **PUBLIC** repo, separate deployable, **local dev
only** (no deploy config beyond a `Dockerfile`). PR #1 reports `orders/paid` → `$conversion`; PR #2
encrypts the stored site key (AES-256-GCM under `SOURCETRACK_CONFIG_ENCRYPTION_KEY`, deliberately
distinct from the API's `ENCRYPTION_KEY`). Its own CI is green. **No real Shopify order has ever been
observed landing as a `$conversion`.**

**What blocked it:** Cloudflare's `trycloudflare.com` quick-tunnel failed DNS resolution across
**three separate fresh tunnel hostnames in a row**. Confirmed external infrastructure, **not a code
problem** — do not start by hunting a bug in the app.

**Retry in this order:**
1. Get a public HTTPS tunnel to local dev. If `trycloudflare.com` still fails, switch **provider**
   (named Cloudflare tunnel with a real hostname, `ngrok`, Tailscale Funnel) — do not retry the same
   quick-tunnel a fourth time.
2. Place a real test order on a dev store; confirm `orders/paid` fires and the app returns 2xx.
3. **Confirm the conversion landed** — not merely that the webhook returned 200. Check the Supabase
   conversion/attribution rows **and** the Tinybird `events` row.
4. **Then test the dedupe guard against a real duplicate.** Most likely step to be skipped, and the
   entire reason the app reuses `provider = 'shopify'`. Redeliver the same webhook from the Shopify
   admin and prove it records as `duplicate`, **not** a second conversion. The app and
   `api/routes/shopify-webhook.js` are kept from double-counting **only** by the byte-identical
   `provider` string and the shared `(site_key, provider, key_type, key_value)` namespace — and **no
   test spans both repos**, so this is the only place that guarantee is ever checked.

**While you are there:** the manual Shopify rail has *also* never processed a real refund (FEATURE_MAP
§12, still 🧪).

### 2. Docs migration batches 3 and 4 — the pattern is established, follow it

Read the #513 and #515 PR bodies first; the deliberate-differences lists are the useful part.

**Batch 3 — `/developers/*`, 9 pages, ZERO URL mapping.** Verified: `marketing/src/pages/developers/`
holds 9 `.astro` files — 8 stubs at 628–800 B (`api`, `campaign-costs`, `conversions`, `identify`,
`offline-conversions`, `security`, `tracker`, `webhooks`) plus a real 3,969 B `index.astro` hub — and
`dashboard/src/App.jsx:415-423` has exactly 9 routes on **identical paths**. Pure content port: no
redirects, no canonical repointing, no slug decisions. This is batch 1's job, not batch 2's.

Recurring traps, all hit in batch 2:
- Code containing braces or a literal `<script>` **must** live in an `.astro` frontmatter const —
  inline, Astro evaluates the braces and compiles the `<script>` into a real page script.
  `/developers/*` is API docs, so it is dense with both.
- `class`, never `className`.
- In-app routes with no marketing equivalent get the app domain (`https://app.sourcetrack.ai/...`).
- Verify in **built HTML**, not source; whitespace-collapse before phrase-matching (Astro preserves
  source line wrapping, which makes correct pages look broken).

**Batch 4 — final redirect/canonical sweep.** Retire the in-app `/docs/platforms/*` routes and repoint
the in-app links (`Setup.jsx`, `installNudge.js`, `docsManifest.js`, `Onboarding.jsx`), plus whatever
`/developers/*` needs after batch 3. **Do not skip the three grep classes an import search cannot
see** (CLAUDE.md §10): hardcoded file manifests (`scripts/qa-static-launch-check.mjs` lists backend
files by path), Postgres triggers, and path-string route/title maps (`Layout.jsx`'s `PAGE_TITLES`).

### 3. MCP hosting — Phase 0 FIRST, and the plan is not in the repo

**Correction up front: there is no MCP hosting-plan document in this repo.** Searched at `5c03200` —
nothing under `docs/` describes it. Phase 0 is therefore not "fill a gap in the plan", it is "write
the first durable artifact".

**Current MCP state, verified:** `mcp/server.js` + `mcp/lib/tools.js`, **stdio transport only**
(`process.stdin`, `:273`). No HTTP/remote transport, no MCP SDK dependency. Tools sit behind
`read:analytics` (#503 — the first enforcement of that scope anywhere) plus the volume-only
leads/campaign tools (#506). The **entire** API-key scope vocabulary is three values —
`write:events`, `write:crawler_hits`, `read:analytics` (`api/lib/api-key-scopes.js`, pinned by a test).

**Phase 0, before any transport or deployment code:**

1. **Write the tool policy down.** The rule already followed in code but recorded nowhere: **no
   revenue, no attribution-model-dependent numbers, no cost-derived metrics — ever, in any future MCP
   tool.** #506 is literally titled "volume-only … (counts, no revenue)", so the policy exists as
   practice and is one careless PR from being lost. Write it with its rationale (§6: an agent cannot be
   trusted to carry the truth labels that make revenue/ROAS/attribution numbers honest, so those
   numbers must not leave the product through a tool surface at all).
2. **Decide the scope-granularity model.** `read:analytics` is today one coarse read scope. Remote
   hosting turns that into a real boundary: decide whether MCP gets its own scope(s), per-tool vs
   per-domain, and how a scope maps to a tenant. **Precedent to reuse:** `write:crawler_hits` was
   deliberately kept out of any implied set so a leaked edge credential cannot reach the revenue rail
   (`api-key-scopes.js:17-45`).

Only after both are settled: transport, auth, deployment.

### 4. Small backlog — **two of the six do not survive verification**

Each checked at `5c03200`. Read the notes before starting; two are not what the shorthand says.

| Item | Verified state | Action |
|---|---|---|
| `/docs/google-ads` orphan | **CONFIRMED.** The `/docs` hub ships 9 cards (`quickstart`, `install`, `shopify`, `wordpress`, `webflow`, `gtm`, `framer`, `stripe`, `troubleshooting`); `google-ads` is not one. In the sitemap, so reachable but unlinked. | One-line card in `marketing/src/pages/docs/index.astro`. Smallest win here. |
| Dashboard-footer `/roadmap` gap | **CONFIRMED.** `dashboard/src/components/MarketingFooter.jsx` exists; **zero** `/roadmap` references anywhere in `dashboard/src/`. Marketing does link it (`marketing/src/config/menu.json:80`), so the two footers disagree. | Add it, or decide the app-domain footer deliberately omits it. |
| Dual-write `browser_name` divergence | **CONFIRMED, precisely located.** `api/routes/pixel.js` emits `browser`/`os`/`value`; canonical is `browser_name`/`os_name`/`conversion_value`. Bridged by `PIXEL_RENAME` (`tinybird/adapter/normalize.js:101`). The read side hedges across **both** names — `COALESCE(NULLIF(properties.browser_name,''), NULLIF(properties.browser,''), 'unknown')` in all six attribution models (`attribution-engine.js:1262-1267`), plus `browserName \|\| browser \|\| 'unknown'` at `:344`. | Decide: normalise at the producer and drop the hedge, or document the hedge as permanent. Both exist today and neither is authoritative. |
| Retry transport at boot (429/5xx) | 🟢 **ALREADY DONE — take it off the backlog.** `withRetry` is wired in `tinybird/adapter/boot.js`, wrapping the *same* transport so `onResult` quarantine observability survives, with `maxRetries=4`, exponential backoff + jitter, `Retry-After` capped (`transport.js:110-124`), retrying only `err.retryable === true`. The file states the reason: Tinybird is the sole writer, so a rate-limit burst without retry is silent permanent event loss. | Nothing. Confirm and close. |
| `README:114` wrong-host | ⚠️ **DOES NOT REPRODUCE.** README is 173 lines; line 114 is inside *Background jobs*. The README names **no SourceTrack host at all** — its only URLs are the git clone URL (`:19`) and `https://api.tinybird.co` (`:77`, `:105`), and that value is **deliberate and documented**: "a router, **not** a region slug (the slug form has broken deploys)", consistent with Frankfurt being fixed at the workspace. | **Needs re-pointing by whoever filed it** — either already fixed, or the line number drifted and it means something else. Do not invent a match. |
| Migration-history desync | **CONFIRMED, and materially worse than "desync" suggests.** Repo has **62** migration files. Prod `schema_migrations` has **16** rows; staging **28**. Almost no versions match repo filenames (repo `20260729000000_capi_ga4_tiktok_columns.sql` is recorded as prod `20260729174321`) — consistent with hand-apply at a fresh timestamp (§8). Prod has **two duplicated pairs** (`add_site_usage_monthly`, `add_pageview_count_to_usage`) and one row with **no repo file at all** (`create_site_annotations`). Staging has rows whose `name` is a full filename including its own version prefix (`20260522000002_free_tier_abuse_guards`). Each env has migrations the other lacks — prod: `create_site_annotations`; staging: `add_os_to_pageviews`, `add_data_quality_alerts_and_job_runs`, `create_tinybird_revenue_idempotency`. | **Founder decision: repair vs accept.** *Repair* = `supabase migration repair` per version per environment — dozens of entries, in the env where prod is tighter than staging, for zero runtime benefit. *Accept* = declare the history table non-authoritative, document that schema truth is verified directly against the live DB (already the working practice per §8/§10), and stop treating `supabase db diff` as meaningful. **Recommend ACCEPT and write it down**, unless someone wants CLI-driven migrations to work. Either way it must be documented — today it is an undocumented trap. |

### 5. Microsoft CAPI — deliberately backlogged, do NOT do proactively

Revisit **only on real customer demand**, per tonight's Reddit/Snapchat precedent. Not a defect, not
forgotten; `KNOWN_ISSUES.md` holds the full corrected diagnosis.

Short version: the sender exists and reaches all four CAPI touchpoints, but POSTs to the UET
*tracking* endpoint (`https://bat.bing.com/bat.svc/c`) with `Content-Type` as its only header, and
**reads its token solely to check it is decryptable, then never sends it**. Finishing it is an OAuth2
rewrite against the Microsoft Advertising Campaign Management API (developer token + customer ID +
account ID + refresh/access token) plus new columns — a different credential *shape*, not a config-map
entry. A config card before that rewrite would save a credential that is never transmitted, which is
exactly what the `CAPI_PLATFORMS` membership rule forbids.

### Two stale in-code claims found while verifying this handoff — not fixed (this was a docs pass)

1. **`api/lib/tinybird-read.js:143`** warns `"…falling back to HogQL."` **There is no HogQL fallback**
   — PostHog is decommissioned and a `null` read fails **closed** (CLAUDE.md §5). Worst possible
   placement: it prints during a read failure, i.e. mid-incident.
2. **`tinybird/pipes/crawler_agents.pipe:16` and `crawler_pages.pipe:19`** still say
   `NOT YET DEPLOYED`. If the founder-reported ST_Staging deploy (#27) happened, both are wrong — but
   the accurate replacement is "deployed to ST_Staging, **absent from prod**", and the staging half
   could not be verified this session (the only Tinybird credential available is bound to **prod**,
   proven by resolving 2 of its 3 `site_id`s in prod Supabase and 0 in staging). **Fix both the moment
   someone reads ST_Staging directly** — and confirm `crawler_hits` is genuinely there, because prod
   definitively does not have it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## CARRIED-FORWARD BACKLOG (from 2026-07-27, head `735a3ae`) — still live
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

> Preserved deliberately. Only the items tonight actually changed are re-marked; everything else is
> untouched and still open. The two "do not re-attempt" findings below are load-bearing — they record
> work already done and measured, so re-opening them wastes a session.

### 🟢 Resolved since 2026-07-27

- **P0 #1 — Conversion Funnels backend fix — DONE.** `api/routes/analytics.js` `/funnel` (`:1146`) no
  longer reads the empty `pageviews` table; it makes **one** `dispatchPageviews` read (Tinybird
  `summary` pipe) and evaluates every step in memory, replacing the old
  `1 + ceil(prev/300)` Supabase round-trips per step that returned an all-zero funnel for every site.
  **#502 then added §6 truncation detection on top:** `truncated = rows.length >= FUNNEL_ROW_CAP`,
  deliberately `>=` not `>` because a result landing exactly on the cap is indistinguishable from a
  clipped one.
  🔻 **Narrower successor item, still open:** the cap is **detected, not raised**. The real fix — push
  the step math into ClickHouse — changes funnel semantics and needs its own verified change.

### P0 — Must do before launch

> The former P0 #1 ("Collapse `qa:*` into `qa:all` in ci.yml") is GONE on purpose — done, measured,
> **refuted**. See "CI collapse" below. Do not re-open it as a P0.

1. **`tracker/analytics.js` dead-code decision** — unbuilt file, no `.min.js` artifact, no verified
   consumer. Determine whether any live site loads it. If none: **DELETE** it, and confirm the legacy
   `/api/analytics/collect` route's remaining consumers before touching that. If a consumer is found:
   fix via the keepalive transport, **not** `sendBeacon`. (A branch exists — `chore/delete-dead-tracker-analytics` — unmerged.)
2. **Tinybird migration — overarching priority (paused)** — 49+ uncommitted `.pipe` files still in the
   working tree on `claude/tinybird-phase1-events-schema`; XFF cherry-pick working-directory state
   unresolved; Phase 7/9/10 incomplete. **Commit checkpoint urgently needed** before anything else on
   that branch.

### P1 — Next milestone

3. **Saved Segments** — localStorage persistence, same pattern as #435 (time range). No backend for V1.
4. **Scroll tracking** — tracker has no scroll event; DataFast uses a data-attributes pattern. Needs a
   `tracker.js` change — own session.
5. **Goals test coverage (issue #447)** — no unit test for `/api/analytics/goals`. Uses the
   `_queryTinybirdPipe` seam, testable like `live-visitors-degraded.test.js`. Should cover refund
   exclusion, null-read throw, client-side rate calculation.
6. **Admin drift comparison index bug** — `admin.js` arrays don't align (17 probe entries, 18
   `prevFeatures`); 11/17 features report the wrong previous status. Fix: key by name, not index. One
   PR, `admin.js` only.
7. **Supabase direct-write grep** — grep `dashboard/src` for any remaining direct
   `supabase.from(...).update(` on pages **other than** `Settings.jsx`. Pattern confirmed dangerous
   (#410, #411) and compounded by the standing finding that **`sites` has no RLS UPDATE policy**, so
   client-side `sites` writes silently no-op and report success. Must close before launch.

### P2 — Pre-cutover / Tinybird migration

8. **Tinybird token rotation** (4 tokens exposed in chat) — `st_endpoint_read`, `dual_write_append`,
   workspace admin token, MCP connector token. ⚠️ **Still unrotated as far as this session can tell**,
   and now more urgent than when filed: the MCP connector token has since **switched workspace to
   prod** (verified this session), so its blast radius is live customer data, not staging.
9. **`flexible_report:2457` parity diff** — BLOCKED, founder investigation.
10. **Merged-identity coverage** — `visitor_id ≠ distinct_id`, no fixture.
11. **Phase 9 harness** — 5 models still need completion.
12. **IF CI time ever becomes a real priority: profile INSIDE the two slow suites** (backlog, NOT
    urgent — nothing depends on it). The one useful output of the refuted #455: unit steps are ~120s of
    a ~168s job, dominated by Tracker 44s, Tinybird dual-write 43s, Identity 30s, Attribution 3s. The
    target is what is **slow inside** Tracker and Tinybird — **not** how many times `node --test` is
    invoked. That question is settled and measured; do not re-litigate invocation count. Measure before
    and after on real CI — a laptop number is not evidence.

### ⛔ Do not re-attempt — investigated, measured, refuted

- **CI collapse (#455, closed unmerged)** — "collapse 4 `qa:*` invocations into one `qa:all`, saves
  ~30% CI time" was built and measured on real CI. **It saves nothing.** Before: unit-test steps 118,
  120, 120, 121, 122s (mean ~120s), job total 166–173s. After (one `qa:all`, run 30291793144, green):
  unit-test step **121s**, job total **174s** — inside the baseline band, at the top of its range. The
  ~30% figure came from a laptop (31s → 22s) and did not survive a GitHub runner. Mechanism (a
  hypothesis, unlike the measured 121s): `node --test` already spawns a child process **per file**, so
  collapsing four invocations saves ~4 node/npm startups. It also had a real cost — one step instead of
  four removes per-suite failure locality in the CI UI. `qa:all` **stays** in `package.json` (#449) as a
  local one-shot.
- **CI cost reduction — `supabase start -x`** — SHIPPED #452 (139s → 90s measured on real runners,
  4 → 3 billed min per schema-drift run). Done.

### Carry-forward from earlier sessions (still open)

- `date` for pre-agg — **still no backend** (first/last-touch × date needs 2 new params; multi-touch ×
  date is structural, needs a write-path schema change)
- tz-aware date bucketing — **deferred 3 times**
- MRR-by-source + trial→paid — **not built** (and CLAUDE.md §7 says do not assume they exist)
- `tracker/analytics.js` dead-code decision (P0 #1 above)
- Domain verification question (can someone claim a domain they don't own?) — orthogonal, not urgent
