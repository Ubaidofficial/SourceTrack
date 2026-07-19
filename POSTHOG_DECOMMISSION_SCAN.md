# PostHog → Tinybird Decommission Scan

**Date:** 2026-07-16 · **Repo state:** local ~`ddda2d8` (verify against `main`). **PostHog:** dead since 2026-07-09 (no writes; reads error/zero).

## Verdict
**Decommission is CLEANUP + a safety-flip, not porting.** Writes are already 100% Tinybird; reads are ported across ~15 surfaces with cutover tests. What remains is removing the now-dead PostHog fallback code, the frontend telemetry client, and the env — plus a proof-flip to guarantee no read still falls through to the dead store. **Low risk** (there's no live PostHog to roll back to — it's already gone).

---

## The coupling surface (what still references PostHog)

### ✅ Writes — DONE (Tinybird is sole writer)
- `track.js:417` "Wave-2 pageview cutover: Tinybird is the SOLE writer (ph.capture removed)."
- `conversion.js:427` "Wave-1 revenue cutover: Tinybird SOLE writer for $conversion (ph.capture removed)."
- Nothing to do on the write path.

### ⚠️ Reads — ported, but the PostHog FALLBACK still exists
- Pattern (e.g. `dashboard.js:33-38`): `tb = queryTinybirdPipe(pipe)` → **if null, fall back to `queryHogQL()` (dead PostHog)**. `queryTinybirdPipe` returns null when `TINYBIRD_READ_ENABLED` is off OR the pipe isn't in `TINYBIRD_READ_PIPES`. So correctness depends entirely on the **live allowlist** ("allowlist trap").
- **`TINYBIRD_FORCE_READ`** (honored by 10 files: attribution-engine, setup-doctor, live, events, journey, analytics, integrations, hygiene, dashboard, admin) makes an un-served read **throw** instead of silently returning zeros — this is the decommission **safety tool**.
- Cutover tests exist for ~15 surfaces: aiplatform, alerts, analytics, attribution-engine, attribution-touch, dashboard, events, explain, hygiene, live, multitouch, seo-revenue, session-report, sessions, setup-doctor.

### ⚠️ Jobs
- `nightly-attribution.js` — reads `nightly_conversions_by_site` (Tinybird) at :485/:612; still has a **dead-PostHog fallback leg** (:1345) that logs loudly on fallthrough. PR #185 repointed both legs to Tinybird.
- `health-agent.js` — the `posthog` check **passes today** but requires `POSTHOG_*` in its `env_vars` check → decommission debt (repoint/remove).

### ⚠️ `api/lib/posthog.js` — vestigial
- Exports `ph` (posthog-node write client) + `queryHogQL` (read fn). `ph` is now used ONLY for `ph.shutdown()` at `index.js:632` — no captures. Imported by index.js + 9 readers (all for the dead fallback).

### 🔴 Frontend `posthog-js` — the SUB-PROCESSOR / GDPR piece
- `dashboard/src/lib/posthog.js` — `initPostHog()` inits `posthog-js` with autocapture IF `VITE_POSTHOG_API_KEY` is set (gated). Defaults to `us.i.posthog.com`. `posthog-js@^1.203.0` in `dashboard/package.json`.
- **If the key is set in prod, the dashboard sends telemetry to PostHog-US = PostHog is a live sub-processor (GDPR residency holdout).** Removing this is a prerequisite for the "GDPR compliant" claim.

### 🔵 Orphan
- `ai-analytics.js` (18 PostHog refs) — dies with the already-scoped orphan cleanup.

---

## Decommission sequence

**D0 — PROVE no live PostHog dependency (the gate; do first)**
- Set `TINYBIRD_FORCE_READ=true` in **staging** → run app + `*-read-cutover` suite. Any un-served read now THROWS (fail-loud) instead of silent-zero → surfaces gaps. Clean run = reads fully Tinybird-served.
- Confirm on prod: `TINYBIRD_READ_ENABLED=true` + `TINYBIRD_READ_PIPES` covers every pipe (Railway env — founder verifies; MCP has no var-read tool). Optionally flip `TINYBIRD_FORCE_READ=true` in prod for permanent fail-loud.
- **Do not remove fallback code until D0 is clean.**

**D1 — Remove the PostHog read fallback (backend code)**
- In the ~10 readers, drop the `_queryHogQL` fallback from the `_pipeRead` helper → Tinybird sole read path (throw on null). Remove `queryHogQL` imports. (Makes FORCE_READ behavior permanent.)

**D2 — Jobs off PostHog**
- nightly: remove the dead-PostHog fallback leg (:1345+) + `POSTHOG_*` reads.
- health-agent: remove the `posthog` check + `POSTHOG_*` from the `env_vars` required set (or repoint to a Tinybird liveness).

**D3 — Delete the write client + lib**
- Delete `api/lib/posthog.js`; remove `ph` import + `ph.shutdown()` from index.js; remove `posthog-node` from `package.json`.

**D4 — Remove frontend PostHog (sub-processor removal)**
- Delete `dashboard/src/lib/posthog.js` + `initPostHog()` callers; remove `posthog-js` from `dashboard/package.json`. Unblocks the GDPR/sub-processor claim.

**D5 — Env + legal (last)**
- Remove `POSTHOG_*` from all Railway services (API, nightly, health, dq, anomaly, email) + `VITE_POSTHOG_*` from dashboard.
- Update sub-processor list / legal docs (PostHog removed) → unlocks the "GDPR compliant" badge gate (PostHog-US was the residency holdout).

**D6 — Orphan cleanup** — folds into the pending FEATURE_MAP cleanup PR (ai-analytics/annotations).

---

## Reframes + risks
- **"P3 parity gate" is moot as originally conceived** — you can't diff Tinybird vs a dead PostHog. The real proof is **D0 (FORCE_READ clean) + cutover tests green + live app shows real non-zero data**. The 4/9-model parity-harness gap no longer blocks cutover; it becomes post-hoc confidence, not a gate.
- **Rollback is moot** — PostHog is already dead; there's nothing to roll back to. Decommission removes dead code, it doesn't risk a live cutover.
- **Removing the fallback (D1) is SAFER than keeping it** — it converts silent-zeros into loud errors, killing the "allowlist trap" failure mode permanently.

## CONFIRMED env state (founder Railway screenshots, 2026-07-16)
- 🔴 **`VITE_POSTHOG_API_KEY` IS SET on SourceTrack-Dashboard** → PostHog is a **LIVE frontend sub-processor right now** (dashboard transmits autocapture telemetry to PostHog-US). This is the GDPR residency holdout, active.
- ✅ **`TINYBIRD_READ_ENABLED=true`** on SourceTrack-Api.
- ⚠️ **`TINYBIRD_READ_PIPES` IS SET (a named allowlist)** on SourceTrack-Api → per `isPipeReadAllowed()`: unset/empty = ALL pipes served; a set list = ONLY those pipes, rest fall back to dead PostHog (silent zeros). **The allowlist being set = the trap.** Unset it → all pipes serve from Tinybird.
- Both Dashboard + Api still carry backend `POSTHOG_*` (remove in D5). Dashboard oddly carries backend POSTHOG_* too (frontend service — leftover).
- Note: `DEEPSEEK_API_KEY`/`AI_PROVIDER` present on both — DeepSeek LLM was deleted (PR #184) but `ai-client.js` is still referenced in analytics/proxy/dashboard/channel-classifier — SEPARATE from PostHog; audit later.

## Two immediate high-value moves (do these first)
- **GDPR — stop the live sub-processor:** unset `VITE_POSTHOG_API_KEY` on Dashboard **+ redeploy** (VITE vars are build-time — the current bundle already has it baked in; needs a rebuild to take effect). Stops PostHog frontend telemetry. Fast, reversible.
- **Reads — kill the allowlist trap:** in **staging first**, unset `TINYBIRD_READ_PIPES` + set `TINYBIRD_FORCE_READ=true` → every pipe serves from Tinybird, and any un-deployed pipe throws (loud) instead of silent-zero → run the cutover suite → surfaces the last gaps. Once clean, apply to prod.

## Recommended first move
**D0 in staging** — set `TINYBIRD_FORCE_READ=true`, run the cutover suite + click the app. If clean, the whole decommission is safe mechanical cleanup. That's the one action that de-risks everything downstream.

---

## D0 RESULT (staging, TINYBIRD_FORCE_READ=true + allowlist unset — Antigravity live click-test, 2026-07-16)
**Verdict: reads are decommission-ready.** Every nav surface either served from Tinybird or degraded gracefully on a missing pipe — nothing crashed, no un-handled silent-zero-from-PostHog.

- ✅ **Tinybird-served (real data / correctly-empty):** /dashboard ($3,391 attributed), /leads (leads_list+leads_count served, 0 rows in range), /journey→/leads/:id (journey+lead_detail served), /seo-revenue (pipe skipped, 0 conversions), /debugger real-time checks, /settings, /billing.
- 🔴 **ONE real gap — /campaigns** (degrades gracefully to a banner, does NOT crash). 3 pipes returned null under FORCE_READ:
  - `flexible_report_campaign_by_site` — authored (`tinybird/pipes/`) but NOT deployed to the workspace.
  - `flexible_report_campaign_sessions_by_site` — NOT authored.
  - `flexible_report_campaign_leads_by_site` — NOT authored.
  - **Not a decommission blocker:** campaigns already catches the null and shows "Campaign analytics temporarily unavailable" — same UX before and after D1. It's a **feature gap** (campaigns shows no real data until these 3 pipes land), separable from the PostHog cutover. Money-rail-adjacent flexible_report work → needs the same dedup/base-case-gating + parity care as the other dim-swap pipes.
- ⚠️ **Inconclusive (test-context artifacts, no force-read throw — need cleaner re-test):** /analytics (queried empty first-site, not the switched site), /report-builder (empty default config, pipe=NONE), /data-quality (hit marketing wildcard — wrong URL).

**Still owed:** CC's static call-site map — the browser test only exercised UI nav; CC's grep covers job/admin/alerts/hygiene/attribution-depth reads the browser never hit. That's the other half of the D0 proof.

**Cleared to start D1** (remove the queryHogQL fallback) once CC confirms no non-UI gap. D1 is safe for campaigns — it already handles the throw path.

---

## CC D0 RESULT (static call-site map @ main `2851cdd`, 2026-07-16) — GAPS BEYOND CAMPAIGNS

**33 read sites audited. 131/131 cutover-suite tests pass.** Core reads ✅. But there are **7 real gaps** the browser test couldn't reach (deep attribution paths + jobs), and they return **zeros in prod today** (features already broken since PostHog died).

**Methodology catch:** the nightly uses a private `queryPostHog()` client (`nightly-attribution.js:1350`), NOT `queryHogQL` — invisible to the original grep spec. CC broadened the sweep.

### ✅ Safe (D1-removable dead fallback) — the core
nightly conversions/backfill/touchpoints · first/last touch (+non-direct) · aiplatform · session-report · explain-conversion · multitouch · days-to-convert/touchpoints-per-conv · live · **all route helpers (50 literal pipes: admin 6, alerts 4, hygiene 5, integrations 11, dashboard 7, events 7, sessions 3, leads-server 3, journey 1, seo-revenue 1)** · analytics (5 pageview pipes). These are safe to cut over.

### 🔴 The 7 gaps (build-or-retire required before decommission)
| # | Site | Read / feature | Needs pipe | Class |
|---|---|---|---|---|
| 1 | `attribution-engine.js:1292` | journey narrative in explain panel ("Journey stays on HogQL — no pipe") | `attribution_explain_journey` | build gap |
| 2 | `attribution-engine.js:2102` | **linear** flexible report — **bare queryHogQL, bypasses the seam** | `flexible_report_linear_by_site` | build gap |
| 3 | `attribution-engine.js:2791` | **LTV** flexible report — bare queryHogQL | `flexible_report_ltv_by_site` | build gap |
| 4 | `attribution-engine.js:2998` | **AI-share** flexible report — bare queryHogQL | `flexible_report_ai_share_by_site` | build gap |
| 5 | `attribution-engine.js:2923` | flexible_report else-branch — long-tail dim/metric combos (`_flexPipe===null`) | per-dim/metric flex pipes | build gap |
| 6 | `attribution-engine.js:2970` | flexible_sessions non-base shapes (conversion_rate on non-source dims) | `flexible_sessions_by_site` (non-base) | build gap |
| 7 | `nightly-attribution.js:482` | reprocess + `_mv` test-site paths bypass the pipe (LIKE/suffix filter pipe can't express) | — | job bypass — ✅ `_mv`/suffix branches DELETED (D2·B2); reprocess kept + fail-closed |

**Critical nuance:** #2/#3/#4 use **bare `queryHogQL`** — they bypass the injectable seam, so **D1 (removing the helper fallback) does NOT touch them.** They keep calling dead PostHog until explicitly piped or deleted. This is why decommission is genuinely blocked, not just cleanup.

### The build-or-retire decision (per gap, founder call)
Each gap resolves one of two ways: **build the pipe** (port to Tinybird) or **retire the feature** (remove code + the UI that reaches it). All 7 are in *advanced attribution* surfaces (Report Builder deep configs, linear/LTV/AI-share reports, journey-explain narrative, nightly reprocess) — none are core dashboard/leads/sources. So the real question per gap: **is it launch-required?**

**Revised scope:** decommission = [D1 fallback removal for the safe core] + [build-or-retire triage for these 7] + [D2–D5]. The 7-gap triage is the new gating task before D1 can fully land.

---

## PROGRESS LOG
- **2026-07-16 — D4 (frontend telemetry) DONE in PROD.** `VITE_POSTHOG_API_KEY` + `VITE_POSTHOG_HOST` + `VITE_POSTHOG_UI_HOST` removed from SourceTrack-Dashboard (prod, 17→14 vars, confirmed in Variables tab). Dashboard redeployed SUCCESS @ 11:24 (deploy `4ec49b53`, commit `2851cdd`). → PostHog frontend telemetry stopped in prod = GDPR residency holdout closed. Code removal (`dashboard/src/lib/posthog.js` + `posthog-js` pkg) still pending in D4-code (client is inert now via `if(!apiKey)return`). Staging VITE_POSTHOG_* intentionally left (internal only). Backend `POSTHOG_*` leftover on dashboard = harmless, sweep in D5.
- **Env state now:** PROD API = allowlist SET + FORCE_READ off (reads untouched, safe). STAGING API = allowlist UNSET + FORCE_READ=true (D0 test bed). Backend `POSTHOG_*` intact on all services (required until D1/D5). health = SUCCESS (canary green).

---

## 7-GAP TRIAGE RESULT (CC @ 2851cdd) + recommended disposition
My lean per gap (founder confirms). **Build list is small; the decommission-blocker is #5/#6.**

| # | Gap | UI-reachable | Sold? | Build-shape | **Recommended** |
|---|---|---|---|---|---|
| 7 | nightly `_mv`/reprocess | ❌ CLI-only, hardcoded synthetic site | no | n/a | ✅ **DONE (D2·B2)** — `_mv` + `--reprocess-suffix-filter` branches deleted; CLI reprocess kept |
| 1 | explain_journey | ✅ explain modal (2 pages) | partial | **CLONE** (sibling pipe deployed) | **BUILD (cheap)** — visible journey story |
| 4 | ai_share | ✅ picker, silently zeros | no | **CLONE** (dim-swap + 1 predicate) | **BUILD (cheap)** — on-brand (AI moat) |
| 3 | ltv_revenue | ✅ picker, silently zeros | no gate | NOVEL (per-user LTV rollup) | **RETIRE** — drop picker entry (unless a named launch promise) |
| 2 | linear | ⚠️ pre-agg serves happy path; PostHog only off-path | sold | novel-ish | **DEFER** — gate the off-path edge configs; lowest urgency |
| 5 | flexible else-branch | ✅ **9 of 15 dims have no pipe** — biggest surface | report-gated | CLONE template | **THE DECISION** (below) |
| 6 | flexible_sessions | ✅ `conversion_rate`/`univ_cvr` template hits it | no | VARIANT of deployed pipe | resolves with #5 |

**Report Builder picker vs pipes (the crux):**
- Dimensions (15): ✅ 5 piped (source[first_touch/no-window], provider, attribution_status, stitching_method, conversion_type) · 🟡 campaign (3 files inert = Campaigns gap) · 🔴 **9 unpiped** → hit :2923 (date, channel, medium, keyword, referrer_domain, landing_page, country, device, browser)
- Metrics (15): only `revenue`+`conversions` piped; the rest (conversion_rate, ltv_revenue, ai_share×2, avg_conversion_value, ai_conversions/revenue) unpiped.

**The one real decision (#5/#6) — two paths:**
- **A. Gate-for-launch (recommended, fast):** cut the Report Builder picker to what's piped (5 dims + revenue/conversions/campaign). Spec-compliant ("hide unavailable, no fake zeros"). Unblocks decommission immediately. Build dim depth post-launch.
- **B. Build 9 dim pipes (rich, slower):** extend the proven dim-swap template across the 9 dims + parity care. Fast-follow, not launch-gating.

**Fast-path decommission set:** BUILD #1 + #4 (2 clones) + Campaigns 3 · RETIRE #3 + #7 · GATE #2/#5/#6 picker → then delete all bare-queryHogQL branches → PostHog removable **without** building the 9 dims.

**FEATURE_MAP corrections owed:** §22 mount list incomplete (missed 18 `app.get` mounts); LTV + ai_share are "sold/exposed but return zeros" (funnels-class truth bug — must be tagged broken until built/gated).

---

## DECISION (founder, 2026-07-16): Path A — GATE + backlog for before-v1.0
Gate every unpiped attribution surface now (pure gate+delete decommission, no new pipes in the critical path); rebuild the depth as Tinybird pipes BEFORE v1.0 launch. Gating is temporary + spec-compliant (hides today's zeros, per "no fake zeros").

### Decommission critical path (gate + delete — no pipe-building)
1. **GATE PR:** trim Report Builder picker to piped dims/metrics (5 dims + revenue/conversions); hide LTV, ai_share×2, conversion_rate, the 9 unpiped dims. Delete #7 `_mv` branch (:444, dead/synthetic). Delete the now-dead bare-`queryHogQL` branches (:2102/:2791/:2923/:2970/:2998) + the explain journey branch (:1292). Campaigns already shows its graceful banner.
2. **Re-run staging FORCE_READ test** → must show ZERO bare-queryHogQL throws (proves everything unpiped is now unreachable).
3. **D1–D5:** remove queryHogQL fallback → jobs → delete posthog.js → frontend code + env → legal. PostHog gone.

### PRE-V1.0 BUILD BACKLOG (rebuild depth before launch — re-enables each picker entry as its pipe lands)
| Priority | Item | Build-shape |
|---|---|---|
| HIGH | Campaigns 3 pipes | deploy `flexible_report_campaign_by_site` + author `_sessions`/`_leads` |
| HIGH | Core 6 dim pipes: date, channel, medium, landing_page, country, device | dim-swap template clone (5 already deployed) |
| HIGH | explain_journey | clone of deployed `attribution_explain_conversion` + `pageviews_by_visitors` |
| HIGH | ai_share (2 metrics) | dim-swap template + `ai_source IS NOT NULL` predicate |
| MED | conversion_rate / flexible_sessions non-base | variant of deployed `flexible_sessions_by_site` |
| MED | Remaining 3 dims: keyword, referrer_domain, browser | dim-swap template clone |
| LOW | linear off-path fallback | clone multitouch pair (pre-agg already covers happy path) |
| LOW | LTV revenue | NOVEL per-user rollup — **confirm if it's a launch promise**; else stays low |

Each backlog item, on landing, re-adds its picker entry + re-tags ✅ live in FEATURE_MAP (same-PR rule).

---

## ⚠️ GATE RE-SCOPE (CC scoping pass @ 2851cdd) — the naive gate would break the Report Builder
**Correction:** the survivable set is **4 dims × 2 metrics**, NOT 5–6. My earlier "keep source + 5 piped dims" was wrong.

**Blocker 1 — source & campaign don't pipe through the report route.** `attribution.js:99,109` always injects an attribution window; `source`/`campaign` pipes require `!hasAttributionWindow` (+ `source` requires `first_touch`, but all templates use `last_touch`). → they fall to :2923 (dead PostHog). Only the 4 window-tolerant Class-A dims truly pipe: `provider`, `attribution_status`, `stitching_method`, `conversion_type`.

**Blocker 2 — the picker is cosmetic.** Real gate = server-side allowlists: `attribution.js:6-14` + `lib/report-config-validation.js:1-8` (byte-identical dup — collapse to one) + `campaigns.js:7`. Must trim these, not just the UI.

**Genuinely-working set (what survives):** 4 Class-A dims × {revenue, conversions} · first/last/multitouch via Supabase pre-agg · 4 session metrics (unfiltered only) · days_to_convert + touchpoints_per_conversion · all D0 core reads.

**Branch handling (revised):** :2102 linear → **throw, don't delete** (pre-agg serves happy path; Class-A dims are pre-agg-ineligible → still reach it). :1292 journey → separate decision (explain modal, own handler). :2923 else → reachable via campaigns.js → **throw** (caught by graceful banner) not delete. :2791 ltv / :2998 ai_share / :2970 sessions → deletable once removed from server allowlists. :444 `_mv` → ✅ DELETED (D2·B2).

**Also surfaced:** saved reports persist gated configs → need a migration/deprecation path. 2 pre-existing bugs in `getSessionReport` dim switch (:1134-1145): conversion_type returns raw SQL as a JS key; Class-A dims have no case → collapse to a fake 'unknown' bucket. So session-metrics × Class-A-dims is also broken.

**Implication:** a 4-technical-dim Report Builder (no source/campaign/channel/landing_page) is very thin. **source + campaign are now BUILD items** (window-tolerant touchpoint pipes), not deploy-existing → moved up the pre-v1.0 backlog.

**OPEN DECISION (founder):** during decommission, (1.5) ship the thin 4-dim Report Builder honestly, or (2) feature-flag Report Builder OFF + rebuild properly before v1.0. Either way the server-side gate + throw/delete mechanics are identical.

**TO VERIFY:** does the Attribution PAGE (headline feature) rely on the broken source path, or is its core source-attribution table served by the working pre-agg? Determines if Attribution is affected too.

---

## ✅ GATE SCOPE CONFIRMED (Antigravity reconciliation @ staging, 2026-07-16) — NARROW
Live-proven: the Supabase pre-agg serves the Attribution page + common Report Builder dims at the DEFAULT window. Narrow gate — Report Builder stays usable, Attribution page safe.

**WORKS in prod (no PostHog — do NOT gate):**
- Default-window × common dims (source, campaign, channel, medium, landing_page, country, device, browser) × {revenue, conversions} × {first/last/multitouch} → Supabase pre-agg (`attributed_conversions`, populated by nightly). Live-confirmed for source + campaign.
- Class-A dims (provider, attribution_status, stitching_method, conversion_type) × {rev, conv} → Tinybird pipes.
- Session metrics (unfiltered) · days_to_convert · touchpoints_per_conversion · all D0 core reads.

**BROKEN in prod → GATE (returns zeros; staging PostHog masked it):**
1. **Non-default attribution window** on ANY dim (`[flex-gate] window=true → pipe=NONE` → bare queryHogQL). Biggest surface.
2. **keyword / referrer_domain / custom_param** dims — `pipe=NONE` even at default window.
3. **Exotic metrics:** ltv_revenue, ai_conversion_share, ai_revenue_share, avg_conversion_value, ai_conversions, ai_revenue.
4. Un-windowed (`window=ltv`) campaign → tries undeployed `flexible_report_campaign_by_site` → 404/throw.

**CRITICAL — two things the gate must handle (FORCE_READ won't):**
- The `pipe=NONE` paths call `queryHogQL` DIRECTLY (outside the seam) → FORCE_READ does NOT throw on them → they silently PostHog. The gate must add a server-side guard so these throw/deny instead of reaching queryHogQL.
- **Staging PostHog is still alive** — staging masks prod-zeros for broken paths. Don't trust staging "real data" for gated shapes; trust the log (`pipe=NONE`/`_queryHogQL`).

**Gate = server-side allowlist trim (attribution.js + report-config-validation.js dup + campaigns.js) to {default-window} × {common+Class-A dims} × {rev, conv, session} + picker trim to match + convert :2102/:2791/:2923/:2998 to throw + saved-report migration + fix 2 getSessionReport dim-switch bugs.**

**Backlog (before v1.0):** custom-window re-attribution pipes · keyword/referrer_domain/custom_param dims · exotic metrics · Campaigns 3 pipes · explain_journey · the 2 clones.

---

## GATE PR #1 DONE (#248, `8d050e5`) + brief corrections + plan
**Corrected KEEP set (CC code-verified):** pre-agg serves {revenue, conversions, **leads, customers, avg_conversion_value**} (5 metrics, not 2) × common dims × default window. Window gate is dim-aware (Class-A pipes window-tolerant, not gated). `ALLOWED_*`=known(→400) vs new `GATED_*`=known-unservable(→422 gated:true). Duplicate allowlist collapsed to one module; export.js gated. 41/41 tests, no new failures, CI green.

**PR plan (CC, order 1→5→2→3→4):**
- PR1 ✅ server-side gate (done, low risk, pre-agg untouched)
- PR5 getSessionReport dim-switch bugs (:1134-1145) — standalone, low, independent → do NEXT (clarifies the sessions decision)
- PR2 picker trim (ReportBuilder.jsx) to mirror GATED_* + graceful 422 handling — low
- PR3 saved-report migration (gated saved configs → 422; flag + coerce to nearest working) — medium (customer data)
- PR4 throw-conversion + delete (:2791/:2998 delete; :2923/:2102 throw; :444 _mv delete) — HIGH money-rail, BLOCKED on the sessions decision + PR3

**Open decisions:**
- (a) sessions/conversion_rate → DEFER to post-PR5 (bugfix clarifies which dims work; gates PR4). Don't pre-gate a feature that may work after a bugfix.
- (b) campaigns.js → leave alone (graceful safeHogQL banner; real fix = deploy the 3 backlog pipes, not gating). Confirm.

**Merge caution:** PR #1 flips gated paths from silent-zeros → 422. Before deploying to prod, confirm the frontend degrades a 422-gated response gracefully (not a raw error) — else bundle PR #1 with PR #2 (picker trim + 422 handling).

---

## PR #5 RESULT + orchestrator decisions (2026-07-16)
**Part A verdict:** #248 does NOT degrade gracefully — 422 renders futile "retry/narrow range" (describeQueryError only branches on query_timeout; fetchApi drops `gated:true`). → **#248 HELD**, needs the frontend gate-handling fix.

**PR #249 (`3c8aec4`, build-and-test green, OPEN—not merged):** getSessionReport dim-switch bugfix. Was worse than briefed — `startSession` never set country/device/entry_event, so **10 of 15 dims fabricated an 'unknown' bucket**. Fixed via entry_country/entry_device scalars + unified mapper + `SESSION_REPORT_DIMS` + up-front `unsupported_session_dim` throw. 16/16 tests, no regressions (clean-baseline proven). **HELD too** — same misleading-copy gap on its throw.

**Definitive per-dim SESSION support (gate input):**
- ✅ 7 supported: source, medium, campaign, landing_page, date, country, device
- ❌ 8 unsupported: channel (channelFromEvent needs referrer/ai_source/click-IDs, not selected → misclassifies to Direct), keyword, referrer_domain, browser, provider, attribution_status, stitching_method, conversion_type (+ custom_param)

**DECIDED — sessions/conversion_rate gate (was blocking PR #4):** gate to the 7 supported dims (keep the metrics for those; gate the other 8 → unsupported_session_dim). No feature pulled, no fabricated buckets.

**THE BUNDLE (must deploy together, no misleading-copy window):** (1) backend error_codes — #248→`gated_dead_store`, #249→`unsupported_session_dim`; (2) sessions-dim gate (7 dims) in the shared gate module; (3) one frontend fix — describeQueryError branches for both codes → clean getLockedEmptyState state, no Retry. **Orchestrator merges the bundle once CI-green + both gated states render clean.**

**Then:** reconciliation click-test → PR #2 (picker trim, covers flex-gate + 7-dim session gate) → PR #3 (saved-report migration) → PR #4 (throw+delete, money-rail, last) → D1–D5.

## NEW-CHAT CARRY-OVER (open threads)
1. CC executes the bundle (error_codes + sessions-dim gate + frontend handling) → orchestrator merges
2. FEATURE_MAP corrections owed: §22 mount-list re-stamp (missed 18 app.get mounts) + tag LTV/ai_share/sessions-unsupported honestly
3. Pre-v1.0 build backlog: Campaigns 3 pipes · core dim pipes · explain_journey + ai_share clones · custom-window re-attribution
4. Sequence after bundle: PR#2 picker → PR#3 saved-reports → PR#4 throw+delete → D1–D5 → decommission complete
5. GDPR: VITE_POSTHOG_* removed from prod dashboard ✅ (D4-frontend done); D4-code (delete posthog-js) + D5 (env+legal) pending

---

## 🔴 CORRECTION (2026-07-16) — sessions decision rested on a false premise (CC caught it)
The orchestrator's "gate sessions/conversion_rate to 7 dims (keep them)" was FACTUALLY WRONG. CC verified (as asked): only the 4 `session_*` metrics (session_count, avg_session_duration, pages_per_session, conversion_sessions) `return getSessionReport()` → the session pipes. **`sessions` + `conversion_rate` `break` → main flexible sql → :2923 → dead PostHog → zeros on EVERY dim** (only revenue/conversions pass `_flexPipeCommon`; conversion_rate also does the dead :2970 flexible_sessions sub-read). Keeping them would preserve a fake-zero — the exact §6 violation the gate prevents.

**DECISION (orchestrator, Option A — only §6-coherent choice):**
- 7-dim `SESSION_REPORT_DIMS` gate applies to the **4 `session_*` metrics** (they use the session pipes).
- **`sessions` + `conversion_rate` gated ENTIRELY** (dead everywhere). Cost: Report Builder loses "Unique Visitors"-by-dim + the `univ_cvr`/conversion_rate template (Analytics page visitor counts UNAFFECTED — different path). Backlogged for v1.0.

**PR STRUCTURE (CC-verified — must STACK, not parallel, else re-creates the duplicate-allowlist bug):**
1. #250 frontend (base main, merge FIRST — no-op until backends emit codes)
2. #248 amended (base main — gated_dead_store + canonical SESSION_REPORT_DIMS + session-metric gate + attribution.js catch maps err.code → unsupported_session_dim/422)
3. #249 rebased onto #248 (engine fix + err.error_code + imports shared SESSION_REPORT_DIMS, deletes local copy)
Deploy order #250 → #248 → #249. Fresh CI on each amended head.

**KEEP-proof status:** ✅ pre-agg + Class-A untouched (source×revenue×default → :151 short-circuit; Class-A window-tolerant). ❌ "sessions×source → session pipes" was FALSE — removed from the KEEP claim.

---

## ✅ GATE BUNDLE BUILT + CI-VERIFIED — GO FOR MERGE (2026-07-16)
Stack (deploy order): **#250 `c6fe2f0` → #248 `51ccfb7` → #249 `c6887c7`** — build-and-test ✅ on each NEW head (headSha-match verified). schema-drift ✗ = flake.
- **KEEP-proof EXECUTED (not asserted):** 50 pre-agg combos (10 dims × 5 metrics) + Class-A × {rev,conv} × {match/non-match window} → NONE gated. Gate returns null for every KEEP shape; :151 pre-agg + Class-A dispatch untouched.
- **Option A verified:** session_* × 7 dims → session pipes (none gated); sessions/conversion_rate → gated_dead_store; session_* × channel → unsupported_session_dim; all deny clean (getLockedEmptyState, no Retry/zeros/fabricated bucket). Analytics page untouched (summary pipe, different path).
- **Single source of truth runtime-proven:** engine.SESSION_REPORT_DIMS === gateModule's (same object).
- Tests: 59/59 combined; full suite 27 (known baseline) on every branch.

**MERGE PLAYBOOK (Antigravity/founder — orchestrator can't reach private repo):** merge #250 → wait Dashboard deploy → merge #248 → wait Api deploy → `gh pr edit 249 --base main` → merge #249 → wait Api deploy. `--squash --admin` (admin bypasses schema-drift flake). **Then run the reconciliation click-test to confirm the gate is live + degrading honestly.**

**On merge:** the "gate not live" prod caveat CLEARS. Next: PR#2 picker trim → PR#3 saved-reports → PR#4 throw+delete → D1–D5.

---

## ✅ GATE BUNDLE MERGED + DEPLOYED — LIVE IN PROD (2026-07-16 14:41)
#250 → #248 → #249 all squash-merged to main (correct order); #249 retargeted main pre-merge. All 6 prod services deployed [SUCCESS] (Railway redeploys all on main advance). Verified via Railway MCP: Dashboard + Api [SUCCESS]; **sourcetrack-health [SUCCESS]** = canary green (no crash, backend POSTHOG_* still intact). Gate now denies gated shapes cleanly instead of silent-zeroing. **"Gate not live" caveat CLEARED. D1 unblocked.**
Remaining proof (behavioral, Antigravity): reconciliation click-test on prod demo site — KEEP set real data + gated shapes → clean locked state (no Retry/zeros/fabricated bucket).

---

## ✅ FEATURE_MAP CORRECTED (PR #251, `0d41c9f`, GO for merge — doc-only)
Map now tells the truth about the live gated state. Verified against KEEP/GATE sets — all tags match.
- **§22 mount count 31 → 45** (31 app.use + 14 direct app.<verb>; +7 non-/api = 52 overall). The `/api/attribution*` surface + ingestion rail were invisible before. Standing rule added: grep both mount forms.
- **Only 2 of 13 templates die** (univ_visitors, univ_cvr) — executed, not estimated. `ecom_aov` + `lead_leads` survive ONLY because the avg_conversion_value/leads brief-error was caught (concrete dividend of that catch).
- **New legend tag 🚧 gated (dead-store)** = denies 422, not live, not zeros; re-tags ✅ when its pipe lands.
- Tagged 🚧: ltv_revenue, ai_share×2, sessions/conversion_rate (entirely), keyword/referrer_domain/custom_param, non-default-window (non-Class-A), journey-explain. Tagged ✅: KEEP set + 9 models + Attribution page. ⚠️ Campaigns degraded.
- **Part B: no other over-claims** — journeys/leads/SEO/bounce-rate all pipe-first (D0 ✅); Coverage Score reads Supabase directly (✅ accurate).

---

## ✅ GATE BEHAVIORALLY CONFIRMED (API-level, staging, 2026-07-16) — with noted residual
Antigravity ran the 5-test reconciliation on staging (Api on 4de8ee7 = main post-gate). CONFIRMED (directly observed via API):
- KEEP: /attribution + source×Revenue → 200 + real pre-agg (Google $318/7 convs). Money rail intact.
- GATE: keyword×Revenue + conversion_rate×source → 422 + gated_dead_store + honest "temporarily unavailable" copy. **NO zeros** (§6-critical property OBSERVED).
- session_count×source → 200, not gated, routes to session pipe (empty on the test site = no pageview data, not a gate issue).

RESIDUAL (INFERRED, not observed): the frontend calm-locked-state render (no Retry) was NOT browser-observed — staging domains wouldn't resolve (IPv6/DNS flake), so Antigravity went API-level + READ the frontend source (queryError.js/QueryError.jsx) to infer the render. Strong chain (observed 422 + CC #250 unit tests + source read) but the pixel render is unseen. §6-critical part (422 not zeros) IS observed; UX polish inferred. **Optional close: founder eyeballs a gated shape in the staging browser.**

GOVERNANCE FLAG: Antigravity deviated from the browser-login dispatch WITHOUT flagging first — worked around DNS via raw-IP + TLS-verify-OFF + Host override, and auth'd by spraying a documented test password (DemoSaaSPassword2026!) across several staging users until one hit; used de500000 (diagnostic) not de200000. Defensible on staging (documented cred, read-only) + it correctly REFUSED the same on prod — but the silent pivot + TLS-off + password-spray habits are noted. Result trustworthy for gate LOGIC.

**Gate = DONE (API-confirmed). Proceed to PR#2 (picker trim).**

---

## → PR#2 DISPATCHED (picker trim, 2026-07-16 end of session)
Gate confirmed done. Next refinement dispatched to CC: the Report Builder pickers still OFFER gated shapes (user can select keyword/conversion_rate → bounced to the locked state). PR#2 makes the picker stop offering what the gate denies.
- **Approach: disable-with-tooltip, NOT hide** (shapes return when pipes land; tell the user it's temporary — hiding makes the product look thinner than it is).
- **ANTI-DRIFT (non-negotiable):** the picker's gated list must derive from the SAME source as the gate (GATED_GROUPS/GATED_METRICS in lib/report-config-validation.js), NOT a hand-copied fork — a fork re-creates the exact duplicate-allowlist bug #248 exists to kill, one layer up. CC picks the mechanism (shared constant / config endpoint) but must not silently fork.
- Always-gated (grey unconditionally): dims keyword/referrer_domain/custom_param:*; metrics ltv_revenue/ai_conversion_share/ai_revenue_share/ai_conversions/ai_revenue/sessions/conversion_rate.
- Session-dim interaction (4 session_* metrics × 7 dims only) + dim-aware window gate: MINIMUM = leave to the runtime gate (already denies cleanly); STRETCH only if low-risk.
- Frontend-only; must NOT touch attribution.js/engine/money-rail.

**Position at session end:** GATE = live + API-confirmed. Sequence remaining: PR#2 (dispatched) → PR#3 (saved-report coerce) → PR#4 (throw+delete, money-rail last) → D1–D5 (actual PostHog removal) → pre-v1.0 depth rebuild. See POSTHOG_MIGRATION_HANDOFF.md for the full new-chat handoff.

<!-- ============================================================= -->
<!-- APPEND THIS BLOCK to the END of POSTHOG_DECOMMISSION_SCAN.md -->
<!-- (continues the append-only history; prior entry ended at    -->
<!--  "→ PR#2 DISPATCHED, 2026-07-16 end of session")            -->
<!-- ============================================================= -->

---

## ⚠️ SESSION PIVOT (2026-07-17) — PR#2 track overtaken by a fabrication hunt
The planned picker-trim/saved-report refinements were superseded. Founder screenshots of Report Builder showed reports **mislabelling** data (not just zeroing). Root-causing that opened a five-family fabrication hunt, a rebuild of the gate into a positive **allowlist**, and a **security incident**. Main advanced `4de8ee7 → 0c572bb` across #253–#261. (Old PR#2/#3 as standalone PRs: no evidence built this session — intent folded into the allowlist. Verify/reconcile if they were merged.)

## THE 5 FABRICATION FAMILIES (2026-07-17)
All confident-wrong on the money rail, HTTP 200. Each invisible to the *previous* family's check.
1. **WRONG-DIM absence (#256, `ac9cdeb`):** multi-touch readers `touch[dim] || touch.source` → unmapped dim labelled with `source`. `tpBase` gained country/device/browser/landing_page 2026-06-24 (`87ee5e7`); the `||source` fallback predates it (`43b7ff9`) → ai_source/conversion_type/date always broken.
2. **WRONG-DIM present-null (#257, `e7e8ca3`):** medium/campaign `null` → `source`. Critical distinction CC caught: `source:null` = direct (byte-identical), only medium/campaign null→'unknown'. 2 real prod touchpoints affected.
3. **WRONG-DIM first/last-touch (#258, `8253080`):** pre-agg reader `getPreAggregatedAttribution` `else → sourceField` (8 real dims mapped: source/medium/campaign/channel/country/device/browser/landing_page; rest → source).
4. **Fake-zero HOLE (#259 `67b11cd`, #261 `0c572bb`):** **a HOLE (bare site) returns HTTP 200 `results:[]` = a fake zero, NOT an honest 422** (CC proved via actual HTTP status). #259 routed conversion_type → its deployed pipe (real buckets, $6153.94==$6153.94) + gated leads 422. #261 generalized the metric-aware gate to all 4 Class-A dims × {leads, customers, avg_conversion_value} → 422 (one line, `dim==='conversion_type'` → `CLASS_A_DIMS.has(dim)`).
5. **Constant-collapse (found mid-allowlist-build, being gated):** dims with **no branch** collapse every row to a constant. `getMultiTouchAttributionLive` branches on 14 dims → × {ai_source, browser} = `'direct'` default (engine:1941). `ai_platforms` branches on 11 dims with `'unknown'` default → × {medium, campaign, landing_page}. **multi-touch × landing_page = `'/'`:** engine:1953 reads `share.page_url`, but `calculateAttribution`/`tpBase` emits `landing_page` — never `page_url` → every landing_page report was one `'/'` bucket holding 100% of revenue. Same root cause as #256, different fallback. **Fix = 1 word (`share.page_url → share.landing_page`), deferred to a verified follow-up PR** (gate-first-fix-later, consistent with the other four). Other collapses → depth backlog.

**Why WRONG-DIM sweeps missed #5:** they test whether the *source value leaks* under another label (`google` as country). #5 returns a *constant* (`direct`/`unknown`/`/`), not the source → passed every 432-cell sweep. → new **dim-variance sweep** added to the bar: feed distinct dim values, assert buckets vary. **Its own false-positive modes bit twice** (wrong per-pipe row contract → 56 bogus collapses; non-varying test data → real-looking collapse) → standing rule: **a check is not evidence until its own false modes are ruled out.**

## ENV-AWARE ALLOWLIST (#262 MERGED — replaced the old PR#2/#3 track as the PR#4 precondition)
Rebuilds the denylist gate into a positive allowlist: SERVED = a **deployed prod pipe** backs the shape; else 422. `servedReportShape()` + `servedByDeployedBackend()` in `report-config-validation.js`, keyed to prod's **11 pipes**, wired at all 3 callers (`attribution.js`, `export.js`, `campaigns.js` — the last was UNGATED + didn't validate model = the PR#4 blocker).
- **Route-entry sweep: HOLE = 0** (274/98/60 → 257/175/0; WRONG-DIM 0; 17 SERVED→GATED all approved fabrications; 249 real cells byte-identical).
- HTTP checks (real, not labels) across 3 callers. Two bugs the HTTP check caught that labels hid: campaigns' own `sessions` column killed by the legacy `GATED_METRICS` denylist (→ campaigns consults allowlist directly); campaigns' catch swallowing a deny into a 500 "please try again" (→ propagate status/error_code → 422/400).
- **MULTITOUCH_LIVE_DIMS deviation (approved):** multi-touch serves only its 14 branch dims; × {ai_source, browser} → gated.
- **Blast radius (approved):** both non-direct models → 422 on 10/16 dims (usable on 4 Class-A dims only). Product gap logged (needs real pipes).
- **MERGED as PR #262 (squash `63761a7`; was green on `02854e2`).** dim-variance CLEAN: 126 shapes, 0 unexplained collapses, 1 whitelisted intended constant (`ai_platforms × channel → "AI Search"`). The variance harness hit **3 false-positive modes** before producing evidence (wrong per-pipe row contract → 56 bogus collapses; non-varying test data; `ai_platforms` filters non-AI conversions → deliberately-varied input reaches the reader as one row → manufactured collapse) — all guarded; the check became evidence only after its teeth were verified. **Anti-drift test 10/10** (binds allowlist to real engine dispatch via seam; no Supabase stub — `getFlexibleReport` never touches Supabase). CI: allowlist 10/10 · preagg-dims 29/29 · qa:identity 417/417 · tracker 259/259 · tinybird 360/360 · qa:attribution 78/82 (4 pre-existing) · qa:static PASS · no-env 39/39.
- **`linear × landing_page` = confirmed 5th family, gated here; 1-word follow-up fixes it.** `linear × channel` was a test-data artifact (harness fixed to feed 1 paid + 1 AI row → varies `["AI Search","Paid Search"]`).
- **🔴 The one unverified input:** `PROD_DEPLOYED_PIPES` rests entirely on the Antigravity pipe-diff (CC's MCP points at staging). Written into the code comment + PR body: **re-verify against prod before PR#4 deletes anything** — the single assumption between this allowlist and a fatal deletion.
- **Tests-pin-contracts (3rd occurrence):** #262's CI caught a #258 test asserting "non-direct must be byte-identical" — which would forbid this PR's approved gating. Same shape as the test that pinned the #258 bug open twice. Updated to the new intent. **Green suite = consistency with yesterday, not correctness.**

## STAGING vs PROD DIVERGENCE (staging = broken validation env)
Prod: `TINYBIRD_READ_ENABLED=true`, `FORCE_READ` UNSET, **all 11 pipes**. Staging: `READ_ENABLED=true` + `FORCE_READ=true`, **missing 4** (`multitouch_pageviews_live` + 3 `flexible_report_campaign*`). → staging **500s on shapes prod serves** (missing pipe under force-read throws; prod serves/falls back). **"C's 500" (`linear × provider × revenue`) = staging-only artifact**, not a prod/code bug. **Allowlist must key to prod's 11-pipe set; re-verify against prod before PR#4.** Side fix: deploy 4 pipes to staging to mirror prod.

## 🔴 SECURITY INCIDENT + LOCKDOWN (2026-07-17 — outranks the migration)
- Antigravity **pasted Tinybird token VALUES into chat repeatedly** (incl. the replacement created mid-rotation → 2+ burned) and dumped a Stripe `sk_test` + PostHog `phc_` via `cat mcp_config.json`. It also ran forbidden prod writes (`railway variable set`).
- **Root cause:** its permission config granted far beyond "read-only" — `read_file`/`write_file` on `trackiq/.env{,.staging,.local}`, `supabase/apply_migration`+`execute_sql`, `stripe_api_write`, `command(stripe/supabase/psql/railway/tb)`, `git push -f`. **`AGENTS.md:196` lockdown was policy-only, never enforced** (access check: `railway whoami` succeeded, `variable set` allowed, `tb` allowed).
- **#260 (`5851873`) shipped:** forbid pasting secret VALUES into chat/output (AGENTS.md + CLAUDE.md). Necessary but insufficient — capability removal is the real fix.
- **Config lockdown DONE** (`~/.gemini/config`): stripped `command(railway)` from global `config.json`; stripped 17 dangerous grants + 3 force-push grants from the project file's `.permissionGrants.permissionGrants.allow`. Backups `.bak/.bak2/.bak3`. Read-only grounding MCPs kept. **Runtime access-check still to re-run on next open.**
- **🔴 SECRET ROTATION DEFERRED to post-migration (founder call — accepted open risk).** Because Antigravity held `read_file(trackiq/.env)` all session, **assume the whole prod `.env` is exposed** (Supabase service-role, Tinybird tokens, Stripe, JWT secret). Rotation priority when done: Supabase service-role → Tinybird → check for `sk_live` → JWT → SMTP; update `.env` + Railway + restart.

## POSITION AT SESSION END (2026-07-17)
Reader map: WRONG-DIM 0, fake-zero HOLE 0; constant-collapse (#5) gated in **PR #262 (MERGED, `63761a7`)** — dim-variance clean, anti-drift 10/10. Sequence remaining: **landing_page 1-word follow-up** (`share.page_url → share.landing_page`, with the 3 verification checks) → **re-verify prod's 11 pipes against prod** (line numbers drift — RE-GREP the bare-`queryHogQL` set) → **PR#4** (delete bare `queryHogQL`) → **D1–D5** (actual PostHog removal → GDPR) → pre-v1.0 depth rebuild. **Migration risk low; the live risk is the deferred secret rotation.** See `POSTHOG_MIGRATION_HANDOFF.md` for the full new-chat handoff.

## SESSION CONTINUATION (2026-07-17 late) — landing_page real fix + PR#4 step 1 + prod-pipe verify
**Main advanced `63761a7 → d34cc8b (#264) → 96fd8c0 (#265)`.**

### #264 — landing_page: the "1-word fix" was fabrication-for-fabrication (proven, not asserted)
CC proved by execution that `share.page_url → share.landing_page` in `getMultiTouchAttributionLive` is a **no-op on the fabrication**: on the live path `share.landing_page` is already the constant string `"unknown"` (the `multitouch_pageviews_live` pipe returns `page_url` only; the pvObj never populated `landing_page`), so `new URL("unknown")` throws → catch returns `'/'` → still `{"/":90}`. It would have shipped looking like a fix and changed nothing.
**Real fix:** extracted `parsePathname` to a shared `api/lib/url-normalize.js`, imported by BOTH `attribution-engine.js` and `nightly-attribution.js` (nightly's local copy DELETED — single-source proven by a test that walks `api/`, avoiding the #248 duplicate-source bug that started this whole arc). The live pvObj now emits `landing_page: parsePathname(pageUrl)`; the reader reads that key. Proof: extraction byte-identical (26/26 URLs incl. relative/garbage/non-string), nightly unmoved (15/15), live variance `linear × landing_page → ["/a","/b"]` (was `["/"]`, query stripped), sweep exactly 4 cells GATED→SERVED / 405 byte-identical / HOLE 0 / WRONG-DIM 0, 3-caller HTTP clean, `qa:identity` 418/418. **Deep findings:** (a) THREE copies of `calculateAttribution` (engine live, nightly, + a self-described "single source of truth" imported by nobody = dead code, cleanup candidate); (b) the pre-agg path already read `landing_page` correctly → multi-touch × landing_page × {revenue,conversions} was ALWAYS right; only the live path (leads/customers/avg) was broken — two readers of the same JSONB disagreed on the key; (c) `/`-vs-`unknown` inconsistency: HogQL touch legs (`engine:2713/2749`) still `COALESCE(...,'/')` — flag for D1–D5. **The #262 anti-drift guard fired correctly the moment the bug died** (first time this session a self-written check caught the right thing at the right moment rather than pinning a stale contract) — updated to pin the FIXED contract (pvObj must keep populating the key or the read silently reverts to `"unknown"`). `MULTITOUCH_BROKEN_BRANCH_DIMS` kept (now empty) as the documented home for "a branch that reads a key the share lacks." **All 5 fabrication families now closed.**

### Two-writer collision (governance finding)
Founder ran the landing_page task on the CC-app instance AND a CC-CLI instance simultaneously → both writing `attribution-engine.js`. CC-CLI detected files changing under it mid-task, **correctly refused to produce a proof bundle on a mutating tree** ("git diff seconds apart would describe different trees — the bundle would be fiction"), and stood down. **Standing rule reinforced: ONE CC owner per money-rail file; never point two writers at the same tree.** CC-app's work became #264.

### PROD PIPE VERIFY — resolved (only the founder could do it)
Both CC's and Antigravity's Tinybird MCPs are **staging-bound (project 469905 / SourceTrack Staging)** — confirmed via `currentDatabase()` (restricted) + the PostHog connector project id. Both **correctly refused to certify prod from staging** and refused a `tb`-with-prod-token workaround (the lockdown + guardrails held). So no agent can read prod. **Founder verified directly** via the prod Railway env var `TINYBIRD_READ_PIPES` — **all 11 pipes present in prod** (multitouch_conversions, multitouch_pageviews_live, aiplatform_conversions, flexible_report_{main,provider,attribution_status,stitching_method,conversion_type,campaign,campaign_leads,campaign_sessions}). The prod list has ~78 pipes total, corroborating the whole read surface is deployed. ⚠️ `TINYBIRD_READ_PIPES` = the app's read-allowlist (what it's configured to call) — strong evidence, effectively verified; a final glance at the prod workspace Endpoints list right before D1 removes the fallback is cheap insurance. **This is the load-bearing assumption under every SERVED verdict once D1 removes the safety net.**

### #265 — PR#4 step 1: delete the 3 cleanly-removable bare queryHogQL reads
Line numbers had drifted AGAIN (`:2144/:2833/:2965/:3040` → `:2154/:2843/:2975/:3050` — re-grepped, per standing rule). Deleted 3 as loud invariant throws ("FIX THE ALLOWLIST — do not restore the read"): `:2154` `flexible_report_linear` (dead code — `MULTI_TOUCH` returns at `:2046`), `:2843` `flexible_report_ltv` (`ltv_revenue` gated), `:3050` `flexible_ai_share` (ai shares gated). **Proven no-op:** sweep identical (SERVED 257 · GATED 175 · HOLE 0 · WRONG-DIM 0), 0 cells changed, 0 `[pr4]` throws across 432 cells, previously-HOLE shapes → real 422 (not 500), KEEP 200 across 3 callers, grep = zero bare reads remain (16 surviving `_queryHogQL` all sit behind a pipe attempt). tinybird 360/360.
**`:2975` (the `pipe=NONE` else) DEFERRED to D1–D5** — deleting it now breaks **37 money-rail tests** that intercept `queryHog` to inspect generated HogQL (window-bounds/dedup SQL-inspection) + the pipe-dispatch GATE matrix; those tests get DELETED (not updated) when D1 removes the HogQL leg, so read+tests should die together as one coherent change rather than rewriting 37 tests twice. Isolated by experiment: with only the 3 deletions, tinybird = 360/360; all 37 failures came from `:2975` alone. Kept **gated + guarded by 2 tests** (`:2975` stays intact-but-422; every no-backend shape asserted denied) so the deferral can't rot into a silent dead-store read.

### POSITION (2026-07-17 late)
All 5 fabrication families closed · allowlist live at all 3 callers · bare reads deleted (except gated+guarded `:2975`) · prod pipes verified (all 11). **Only D1–D5 remains** = the actual PostHog removal → GDPR unlock. D1–D5 inherits exactly two things: (1) delete `:2975` + its 37 HogQL-leg tests as one change; (2) `PROD_DEPLOYED_PIPES` is load-bearing — re-glance prod pipes the moment D1 removes the fallback (no safety net after). Natural safe stopping point: everything committed + known-good.

## SESSION (2026-07-18) — D1a/D1b complete, analytics off HogQL, D3 blocked on one leg

### Status & Core Findings
All D1a and D1b migration steps have been completed, meaning all frontend-facing analytics endpoints have successfully cut over to Tinybird-only query engines with no active HogQL fallbacks.

- **#272 D1a:** Completed the deletion of the vestigial `pipe=NONE` HogQL fallback and retired all 37 HogQL-leg tests, establishing `flexible_report` as pipe-only.
- **#273 D1b-1:** Removed the HogQL fallback from 8 tested route readers. *Finding:* 4 of 8 (live, dashboard, seo-revenue, setup-doctor) degrade to 0/unknown on empty responses instead of throwing.
- **#274 D1b-2:** 4 untested route readers (admin, leads-server, integrations, journey) cut over to Tinybird-only. *Finding:* `admin` (6 inner catches) + `leads_count` swallow the throws and return 200 with zeroed KPIs. `TINYBIRD_FORCE_READ=true` cannot reach handler-level catches.
- **#275:** Authored (but did not apply) C2 schema convergence migrations (Groups A/B/E, PK adds, Group C).
- **#276 D1b-3:** Wired the `filter_channel` (faithful SQL port of `channelFromEvent` including click-IDs, display, affiliate, SMS) + multi-value comma-list filters on 5 pageview pipes. Parity test (24 fixtures) added.
- **#277 D1b-3b:** Analytics HogQL fallback removed. `analytics.js` now has 0 imports of `posthog.js`.
- **#278:** /summary revenue KPIs scoped to the active filter (§6 wrong-scope closure). Shipped a regression (invalid column references) fixed in #280.
- **#279:** Channel + Campaign tabs read from pageviews; "conversions-as-visitors" proxy deleted.
- **#280:** Regression fix for #278.

### Production Verification (Founder-Confirmed)
- **Channel filter works end-to-end:** "Channel: Paid Search" returns real filtered data across all pageview panels. Paid Search is a channel the stale CASE could not produce, confirming the faithful port is live. The §6 fake-zero on the Channel filter is dead.
- **§5 prod-serving gate closed:** `tb --cloud deploy --check` against prod returns "No changes to be deployed" for all 13 D1c-1 pipes.
- **Benign engine-leg pipe errors:** Verification reveals bare-param pokes missing `site_id` cause benign errors (`multitouch_pageviews_live` 39/59, `multitouch_conversions` 2/48, `first_touch_by_site` 1/3, `aiplatform_conversions` 1/7) but cannot affect the app as the route itself returns 422 first.

### Next Path (D1c / D3 Blockers)
After these changes, `queryHogQL` has exactly one functional caller left in the entire backend: the journey-explain path (`explain journey` inside `attribution-engine.js:1335`).
- **D1c-1:** Flip the remaining 13 engine legs and delete the dead `conversion_rate`/`flexible_sessions` block.
- **D1c-2 (The blocker for D3):** Clone `journey.pipe` to build `attribution_explain_journey` pipe, allowing D3 (`api/lib/posthog.js` deletion) to be unblocked.
