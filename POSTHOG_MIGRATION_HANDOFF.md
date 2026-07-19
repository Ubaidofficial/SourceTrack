# PostHog → Tinybird Migration — NEW-CHAT HANDOFF

**Updated:** 2026-07-17 (fabrication-fix + allowlist + PR#4-step-1 + security session + C2 schema-drift Phase-A findings) · **Deep reference:** `POSTHOG_DECOMMISSION_SCAN.md` (full arc; session log appended) · **Repo:** `Ubaidofficial/SourceTrack` @ main `96fd8c0` (**#264 landing_page fix + #265 PR#4-step-1 MERGED**) (verify `git log -1`)

> Start-here doc for the new chat. Read this + skim the scan doc's tail and you're caught up.
> Orchestrator = plan/verify/direct-merge · CC = files/logic/git · Antigravity = browser + **read-only** MCP (post-lockdown, see SECURITY).
>
> **HOW TO RESUME:** paste this doc → orchestrator picks up at OPEN THREAD #1 = **D1–D5 (the actual PostHog removal)**. Everything before it (fabrication fixes, allowlist, landing_page fix, PR#4 step 1) is merged. Re-verify prod's 11 pipes immediately before D1.

---

## ⚠️ WHAT CHANGED SINCE THE 2026-07-16 HANDOFF (read this first)
The prior handoff ended at "PR#2 (picker trim) dispatched." **This session did NOT follow that plan.** The picker-trim/saved-report track was overtaken by a much bigger discovery: the attribution readers were **fabricating** data on many shapes, not just zeroing them. The session became a fabrication-hunt (five families), a rebuild of the gate into a positive **allowlist**, and a **security incident** (agent token leaks + an unenforced lockdown). Net:
- **5 fabrication families found — ALL 5 NOW CLOSED.** 4 fixed/gated in #256–#262; the 5th (constant-collapse): multi-touch × landing_page **fixed in #264** (real producer fix, not the cosmetic 1-word swap — that was proven to be fabrication-for-fabrication); the other collapse dims stay gated → depth backlog.
- **The gate has been rebuilt as an env-aware allowlist** (#262, **MERGED** `63761a7`) keyed to **prod's 11-pipe set** — the true precondition for PR#4/D1, replacing the old PR#2/#3 refinements. **HOLE=0, dim-variance clean, anti-drift test 10/10, CI green** — LIVE on main.
- **Old PR#2 (picker trim) / PR#3 (saved-report):** no evidence they were built as standalone PRs this session — the intent (picker derives from the gate) is folded into the allowlist. **Verify before assuming; reconcile if they were merged.** (Confidence: INFERRED from session arc, not confirmed.)
- **SECURITY:** Antigravity's "read-only lockdown" was policy-only, not enforced — it had `.env` read/write, Supabase DDL, Stripe-write, Railway-write, force-push, and leaked Tinybird tokens into chat. **Config lockdown now DONE.** **Secret rotation DEFERRED to post-migration (founder call) — this is an accepted open risk.**

---

## TL;DR — where the migration stands
- **Writes:** 100% Tinybird ✅ (long done)
- **Reads:** core surfaces Tinybird-ready ✅; depth gaps → gate-now / build-before-v1.0
- **GATE → ALLOWLIST:** the original 422 gate is LIVE in prod ✅; this session **rebuilt it into a positive allowlist** (SERVED = a deployed prod pipe backs the shape; everything else → 422). **#262 MERGED — live on main.**
- **Fabrication:** 5 families found. **4 fixed+merged (#256–#261); 5th gated in #262.** Reader map after #262 = WRONG-DIM 0, fake-zero HOLE 0, constant-collapse gated, dim-variance clean.
- **GDPR frontend telemetry:** killed in prod ✅ (VITE_POSTHOG_* removed + dashboard redeployed) — from prior session
- **Not started (blocked on #262 merge + prod pipe re-verify):** PR#4 (delete bare `queryHogQL`) → **D1–D5** (the actual PostHog deletion — the real launch gate + GDPR unlock)
- **🔴 SECURITY open:** secret rotation deferred; Antigravity config-locked-down but exposed secrets in the transcript/.env are not yet rotated.

**The decommission is: [gate broken/fabricating shapes ✅→ allowlist #262 ready-to-merge] → [PR#4 delete bare queryHogQL] → [D1–D5 delete PostHog] → [rebuild depth before v1.0].** Low migration risk — PostHog is already dead; this is gate-and-delete. **The live risk this session is SECURITY, not the migration.**

---

## DECOMMISSION CHECKLIST (D0–D6) — PRODUCTION CHECKLIST
| Step | What | Status |
|---|---|---|
| **D0** | Prove reads Tinybird-ready (staging FORCE_READ + CC static map) | ✅ DONE — core clean; depth gaps triaged |
| **GATE** | Gate broken shapes so nothing reaches dead PostHog (422, not fake zeros) | ✅ **LIVE + API-CONFIRMED** (#248/#249/#250, prior session) |
| **FAB** | Fix/gate the 5 fabrication families (confident-wrong on money rail) | ✅ **ALL 5 CLOSED** (#256–#261 + #262 gate + **#264** landing_page real fix) |
| **ALLOWLIST** | Rebuild gate as positive allowlist keyed to **prod's 11 pipes**; gate campaigns.js; HOLE→0 | ✅ **MERGED — #262 (`63761a7`)** (HOLE=0, variance clean, anti-drift 10/10). |
| **PIPE RE-VERIFY** | Re-confirm prod's 11 pipes **against prod** (not staging, not a remembered table) | ✅ **DONE** — all 11 present in prod Railway `TINYBIRD_READ_PIPES` (founder-confirmed via prod env var, 2026-07-17). ⚠️ Both CC + Antigravity Tinybird MCPs are **staging-bound** (469905) — only the founder can read prod. **Re-glance once more right before D1 removes the fallback.** |
| **PR#4 step 1** | Delete the 3 CLEANLY-removable bare `queryHogQL` reads | ✅ **MERGED — #265 (`96fd8c0`)**. Deleted `:2154` (dead linear), `:2843` (ltv gated), `:3050` (ai_share gated) — proven no-op (0 cells changed, 0 throws/432 cells). Line numbers had drifted from #262's (`:2144/:2833/:2965/:3040` → `:2154/:2843/:2975/:3050`) — RE-GREP always. |
| **D1 / PR#4 step 2** | Delete `:2975` (pipe=NONE else) + its **37 HogQL-leg tests** + the pipe→HogQL fallbacks — money-rail, LAST | ✅ **DONE** — Split and completed as D1a (#272 flexible_report pipe-only, deleted the :2985 pipe=NONE else + 37 HogQL-leg tests), D1b-1 (#273, 8 tested route readers), D1b-2 (#274, 4 untested readers, tests-first), D1b-3 (#276, analytics pipe-serve), D1b-3b (#277, analytics fallback removed). |
| **D1c** | Flip 13 engine legs & build explain pipe | ⏳ **IN PROGRESS** — Split: D1c-1 (flip 13 engine legs + delete dead conversion_rate/flexible_sessions block) · D1c-2 (build attribution_explain_journey pipe by cloning journey.pipe). Real execution order: D1c-1 → D1c-2 → D3 → D2 → D4-code → D5/GDPR. |
| **D2** | Jobs/boot off PostHog — **NOT one item; ≥4 separable, split below.** A code scan (2026-07-19) found the single "Jobs off PostHog" row hid a **silent D5 blocker** (the API boot guard). | ⬜ **SPLIT** |
| **D2 · boot-guard** | `api/index.js:81` REQUIRED_ENV hard-exits the API if `POSTHOG_HOST`/`POSTHOG_API_KEY` are missing → D5 (strip POSTHOG_*) would fail all six services on boot. Remove the two vars (D3 already unwired the `ph` client, so no request path reads them). | ✅ **DONE (this PR)** — removed from REQUIRED_ENV; `boot-without-posthog-env.test.js` spawns the real entrypoint with both unset and asserts it boots. **This was the ordering dependency silently gating D5.** |
| **D2 · health-agent** | `health-agent.js:137` + `:182` — two direct HogQL fetches (`SELECT 1` liveness; `count($pageview)` last 24h); `:213` requires 4 `POSTHOG_*` vars. `posthog` ∈ `CRITICAL_CHECKS` → an error is a 🔴 critical/Slack alert. | ✅ **DONE** — check 2 `posthog` deleted + removed from `CRITICAL_CHECKS`; check 6 `data_flow` re-pointed off HogQL onto the `events_health_day` pipe, fanned out over the nightly site set (warn on all-zero, error on any read failure, explicit `skipped` on zero sites); `env_vars` no longer requires the 4 `POSTHOG_*`. Semantic change (pageviews-24h→any-event-24h, global→per-site) documented in KNOWN_ISSUES. Tests extended in `health-agent-asserts.test.js`. **No PostHog read remains in health-agent; it will not false-alarm after D5.** |
| **D2 · B2** | `nightly-attribution.js` — the `_mv`/`--reprocess-suffix-filter` suffix conversion reads bypassed the pipe and fell back to the dead HogQL store. | ✅ **DONE** — both suffix branches **DELETED** (hardcoded synthetic site `de400000`, no `_mv` producer in repo/history, 0 `%_mv` rows in prod or staging; the `--reprocess-suffix-filter` flag was in no test/doc/script). The `isReprocess` fail-closed guard is preserved exactly (B3 owns whether normal-path `queryPostHog` stays). Phase-1 finding: reprocess/suffix already fail closed BEFORE `queryPostHog` (guard precedes the fallback), so B2 was cleanup, not a B3 prerequisite. |
| **D2 · B3** | `nightly-attribution.js` — remove `queryPostHog` and its fallback call sites + the boot guard. | ✅ **DONE (4 of 4 steps).** Steps 1–3 (#308/#309/#310): read retry, then conversions + touchpoints reads FAIL CLOSED on a null pipe. **Step 4 (this PR):** DELETED `queryPostHog`, all three fallback legs (conversions, touchpoints, backfill), the `POSTHOG_PERSONAL_API_KEY`/`POSTHOG_PROJECT_ID`/`POSTHOG_HOST` module consts, the two POSTHOG vars from the boot env-guard, the dead `validateSite` `if (!res) continue`, the orphaned HogQL query strings + `esc` import, and the two (→ three) stale comments. **Reads-disabled decision:** post-decommission there is no fallback, so `main()` **refuses to start** (loud error) when `TINYBIRD_READ_ENABLED` is off (covers cron + backfill, before the run lock); the read legs additionally throw an invariant so no path can silently no-op. The nightly is now **Tinybird-sole**. |
| **D3** | Delete `api/lib/posthog.js` + `ph` client + `posthog-node` pkg | ✅ **DONE** — `api/lib/posthog.js` + `ph` client deleted (prior session); `posthog-node` dependency removed (this PR, grep-confirmed no importers); `api/tests/no-posthog-import.test.js` guards reintroduction on source text. (Table previously mis-marked BLOCKED; D1c-2 unblocked it and the deletes have shipped.) |
| **D4** | Frontend: telemetry env ✅ DONE · code (`posthog-js` + `dashboard/src/lib/posthog.js`) ✅ DONE | ✅ **DONE** — deleted `dashboard/src/lib/posthog.js`, its only import + `initPostHog()` call in `App.jsx`, the `posthog-js` dependency (+ lockfile), and the 7 orphaned PostHog dev-proxy routes in `vite.config.js`. CI guard `api/tests/no-posthog-dashboard-import.test.js` added (posthog-js cannot creep back). Dashboard builds clean (2103 modules, 3.02s). **Clean delete of DORMANT code:** the analytics was product analytics on our OWN dashboard (autocapture pageviews + interactions of dashboard users), but `VITE_POSTHOG_*` was already stripped in D4-env, so `initPostHog()` already no-op'd in prod — nothing LIVE was lost. **Remaining for D5:** the PostHog sub-processor listing (`Subprocessors.jsx:22`) + retention/deletion legal copy (`Settings.jsx:1207/1393/1394`) are legal docs, updated in D5 alongside the env strip. |
| **D5** | Strip backend `POSTHOG_*` env (all services) + update sub-processor/legal docs → **GDPR claim unlocks** | ✅ **DONE.** **① ENV half:** ✅ `POSTHOG_*` (backend) + `VITE_POSTHOG_*` (frontend) stripped from Railway across all 6 services in both envs (12/12 zero matches, all redeployed SUCCESS, prod boot log clean off Tinybird — founder-verified 2026-07-19). **② CODE/legal-copy half:** ✅ `Settings.jsx` visitor-erasure copy corrected → Tinybird (#313); and now that **PostHog project 416017 is confirmed DELETED** (MCP 403→404, 2026-07-19), the gated changes applied: PostHog sub-processor row removed (`Subprocessors.jsx`), and the false account-deletion retention disclosure (`Settings.jsx:1393`, "historical events may remain in PostHog") removed. `Settings.jsx:1394` (paid-beta blocker) left for a founder business/legal call. **PostHog is fully decommissioned — code, env, and project.** |
| **D6** | Orphan cleanup (ai-analytics/annotations) folds in | ⬜ |

> **NOTE on "production checklist":** if a **separate** standalone launch/prod-readiness checklist doc exists outside this file, it also needs this session's updates (5 families, allowlist precondition, security rotation open item). Not in hand — flag to update it too.

---

## THE 5 FABRICATION FAMILIES (the session's core finding)
All returned **confident-wrong data on the money rail** (§6: worse than a zero) with HTTP 200. Each was invisible to the *previous* family's check — the lesson is checks that test the **property** (did the dim vary with input?) not the **symptom** (did the source value leak?).

| # | Family | Mechanism | Status |
|---|---|---|---|
| 1 | WRONG-DIM absence | multi-touch readers: `touch[dim] \|\| touch.source` → unmapped dim silently labelled with `source` | ✅ FIXED #256 |
| 2 | WRONG-DIM present-null | medium/campaign `null` → substituted `source` | ✅ FIXED #257 |
| 3 | WRONG-DIM first/last-touch | pre-agg reader `else → sourceField` (8 real dims mapped, rest → source) | ✅ FIXED #258 |
| 4 | Fake-zero HOLE | a "HOLE" (bare site) returns **HTTP 200 `results:[]`** = a fake zero, NOT an honest 422 | ✅ FIXED #259 (conversion_type→pipe) + #261 (Class-A × non-pipe metrics → 422) |
| 5 | Constant-collapse | dims with **no branch** in a reader collapse every row to a constant: multi-touch × {ai_source, browser} → `'direct'`; ai_platforms × {medium, campaign, landing_page} → `'unknown'`; multi-touch × landing_page → `'/'` | ✅ **CLOSED.** Gated in #262; **multi-touch × landing_page FIXED + un-gated in #264** (see below — the "1-word fix" was proven to be fabrication-for-fabrication; real fix = shared `parsePathname` + producer emits `landing_page`). The other collapses (multi-touch × {ai_source, browser}, ai_platforms × {medium, campaign, landing_page}) stay gated → depth backlog (need real pipes). **All 5 families now closed.** |

**Nothing skipped.** 4 families return real data; #5's multi-touch × landing_page now returns real data too (#264); the remaining collapse dims return honest 422s (no lie ships) until real pipes land — logged as depth backlog.

**STANDING RULES earned (add to CC/agent bar on every money-rail PR):**
- **Verify HTTP status, not the verdict label.** HOLE = 200-empty = fake zero. Hitting the shape and reading the real status is the only proof.
- **dim-variance sweep:** feed *distinct* values for the target dim; assert output buckets **vary** (don't collapse to a constant). Catches the constant-collapse class WRONG-DIM structurally can't.
- **A correctness check is not evidence until its own false-positive modes are ruled out.** The variance check itself hit 3 false modes this session (wrong per-pipe row contract → 56 bogus collapses; non-varying test data; `ai_platforms` filtering non-AI → single-row manufactured collapse). Prove the check's teeth before trusting its output.
- **Your own tests can PIN a bug/contract open.** Three times this session (#256, #258, #262) a CC test asserted the OLD behaviour as desired, which would have forbidden the fix — the exact pattern that kept the WRONG-DIM bug open twice. **A green suite proves consistency with yesterday, not correctness.** When a test blocks a deliberate change, check whether it's encoding a stale contract before "fixing" the code.

---

## THE ENV-AWARE ALLOWLIST (#262 MERGED `63761a7` — the PR#4 precondition, code side)
**Why:** the old gate was a *denylist*. For PR#4 to safely delete the bare `queryHogQL` sites, we need the inverse — a positive allowlist of exactly which `(model × dim × metric)` shapes are backed by a **deployed prod pipe**; everything else → 422. Anything NOT served must be gated, not silently fall through to a `queryHogQL` we're about to delete.

**Keyed to PROD's 11 pipes (ground truth — do NOT trust staging):**
`multitouch_conversions_by_site`, `multitouch_pageviews_live`, `aiplatform_conversions_by_site`, `flexible_report_{main, provider, attribution_status, stitching_method, conversion_type, campaign, campaign_leads, campaign_sessions}_by_site`.

**Status (#262 MERGED, squash `63761a7`, was green on `02854e2`):**
- ✅ `servedReportShape()` + `servedByDeployedBackend()` in `report-config-validation.js`, derived from constants, keyed to the 11-pipe prod set (each entry flagged prod-pipe-dependent, re-verify-before-PR#4 written into the code comment: `PROD_DEPLOYED_PIPES`).
- ✅ Wired at ALL THREE callers: `attribution.js`, `export.js` (was passing model flags inert), `campaigns.js` (was UNGATED + didn't validate model — the PR#4 blocker; now consults the allowlist directly + validates model → 400 on bad model).
- ✅ **Route-entry sweep: HOLE = 0** (BEFORE `0c572bb`: SERVED 274/GATED 98/HOLE 60; AFTER: SERVED 257/GATED 175/HOLE 0/WRONG-DIM 0). The 17 SERVED→GATED are all approved fabrications; 249 real cells byte-identical.
- ✅ HTTP-status checks across all 3 callers (real 200/422/400, not labels). Two bugs the HTTP check caught that labels hid: campaigns' own `sessions` column killed by the legacy `GATED_METRICS` denylist (→ campaigns consults the allowlist directly); campaigns' catch swallowing a deny into a 500 "please try again" (→ status/error_code now propagate → 422/400).
- ✅ **dim-variance sweep CLEAN:** 126 shapes, **0 unexplained collapses**, 1 whitelisted intended constant (`ai_platforms × channel → "AI Search"` — every ai_platforms conversion IS AI Search). The harness hit **3 false-positive modes** before producing evidence (wrong per-pipe row contract → 56 bogus collapses; non-varying test data; `ai_platforms` filters non-AI conversions so a deliberately-varied input reached the reader as a single row → manufactured collapse) — all now guarded. The check became evidence only after its own teeth were verified.
- ✅ **Anti-drift test 10/10** — binds the allowlist to the real engine dispatch (via the seam; no Supabase stub — `getFlexibleReport` never touches Supabase, verified). A future pipe/dim can't silently bypass it.
- ✅ CI: allowlist 10/10 · preagg-dims 29/29 · `qa:identity` 417/417 · tracker 259/259 · tinybird 360/360 · `qa:attribution` 78/82 (same 4 pre-existing, clean-tree verified) · `qa:static` PASS · no-`.env` 39/39. `schema-drift` = known flake.
- **MULTITOUCH_LIVE_DIMS deviation (approved):** multi-touch serves only the **14 dims it actually branches on**; × {ai_source, browser} → GATED.
- **Blast radius (approved, knowingly):** both non-direct models → 422 on 10/16 dims (usable only on the 4 Class-A dims). Honest (they fabricated dead-store zeros today). Frontend must render calm state. **PRODUCT GAP logged:** non-direct multi-touch × common dims needs real pipes (depth backlog, same path Class-A took).

**LANDING_PAGE FIX — SHIPPED in #264 (`d34cc8b`), NOT the "1-word fix":** the proposed `share.page_url → share.landing_page` swap was **proven (by execution) to be fabrication-for-fabrication** — on the live path `share.landing_page` is already the constant string `"unknown"` (the `multitouch_pageviews_live` pipe returns `page_url` only; the pvObj never populated `landing_page`), so `new URL("unknown")` throws → still `'/'`. Real fix = **producer must emit `landing_page`**: extracted `parsePathname` to a shared `api/lib/url-normalize.js` imported by BOTH `attribution-engine.js` and `nightly-attribution.js` (nightly's duplicate deleted — single-source proven by grep, avoiding the #248 duplicate-source bug), the live pvObj now emits `landing_page: parsePathname(pageUrl)`, and the reader reads that key. Proof: live variance `/a` vs `/b` (was `/`), 4 cells GATED→SERVED, 405 byte-identical, nightly untouched (26/26 URL cases + 15/15 nightly tests). **Deep findings logged:** (a) three copies of `calculateAttribution` exist (engine live, nightly, and a "single source of truth" one imported by nobody = dead code — cleanup candidate); (b) the pre-agg path already read `landing_page` correctly, so multi-touch × landing_page × {revenue, conversions} was ALWAYS right — only the live path (leads/customers/avg) was broken; (c) **`/`-vs-`unknown` inconsistency:** the HogQL touch legs (`engine:2713/2749`) still `COALESCE(..., '/')` — flag for D1–D5 when those legs are removed.

---

## STAGING vs PROD DIVERGENCE (critical — staging is a BROKEN validation env)
Confirmed via Antigravity read-only pipe-diff + flag read:
| | Staging | Prod |
|---|---|---|
| `TINYBIRD_READ_ENABLED` | true | true |
| `TINYBIRD_FORCE_READ` | **true** | **UNSET** |
| `multitouch_pageviews_live` | ❌ missing | ✅ deployed |
| `flexible_report_campaign_by_site` | ❌ missing | ✅ deployed |
| `flexible_report_campaign_leads_by_site` | ❌ missing | ✅ deployed |
| `flexible_report_campaign_sessions_by_site` | ❌ missing | ✅ deployed |
| (other 7 pipes) | ✅ | ✅ |

- **Consequence:** staging **force-reads** + is **missing 4 pipes** → it **500s on shapes prod serves** (missing pipe under FORCE_READ throws; prod has the pipe + no force-read → serves/falls back). **Every staging validation of these shapes is suspect.**
- **"C's 500" (`linear × provider × revenue`) = staging-only artifact** — needs `multitouch_pageviews_live` (missing on staging) under FORCE_READ. **Not a prod bug, not a code bug.**
- **The allowlist MUST key SERVED to prod's 11-pipe set, not staging's.** Building off staging would gate 4 shapes that work in prod.
- **Side fix (non-blocking):** deploy the 4 missing pipes to staging to mirror prod, OR validate against prod directly. Until then, trust prod truth, not staging greens.
- **PIPE RE-VERIFY before PR#4:** re-confirm the 11 against **prod** — a wrong allowlist entry is exactly what PR#4 makes fatal.

---

## 🔴 SCHEMA CONVERGENCE (C2) — DRIFT FINDINGS (2026-07-17, read-only Phase-A)
Two durable findings from classifying the schema-drift "44 divergences." Both verified against **live** DBs (read-only `information_schema`), not against CI output.

### 1. CI DB-URL secrets mis-pointed TWICE (schema-drift was diffing the wrong DBs)
- **First:** `STAGING_DB_URL` → **prod** (prior session; the pooler/IPv4 fix).
- **Second:** `PROD_DB_URL` → **staging** — caught because schema-drift reported an impossible **"0 staging≠prod"**: it was diffing staging-against-staging. The headline **"44 divergences" was an artifact** (really migrations-vs-staging). Proof: CI's "prod" snapshot matched real *staging* on every distinguishing column (`qualified_by`=uuid, `admin_audit_log.action`=NOT NULL, revenue orphans absent) while **real prod** is the opposite on all three.
- **No accidental prod write occurred:** `migrate-prod` is `if: false`; `migrate-staging` needs `schema-drift` green, and schema-drift has been **red on every run** (GitHub run history) → the migrate jobs were skipped on all runs.
- **HARD RULE (precondition to enabling ANY migrate job):** verify **both** write-secrets resolve to their *named* DB before enabling. schema-drift must use the **Supabase Session pooler (IPv4)** URL — GitHub runners are IPv4-only; `db.<ref>.supabase.co` is IPv6-only.
- **Both DB passwords → deferred rotation queue** (they transited a mis-pointed secret; fold into the post-migration rotation, see §SECURITY).

### 2. 🔴 INTEGRITY GAP — prod is MISSING PRIMARY KEYs on 6 tables
- **No PK in prod:** `companies`, `company_members`, `qa_notes`, `saved_reports`, `dashboard_widgets`, `admin_audit_log`. (Only `sites` has a PK — on `site_key`, `DB_1_pkey`; `lead_qualifications` has one on `id`.) Staging has these tightened; **the migration files never carried the constraints** (staging was hand-tightened, uncommitted).
- **PK-add is SAFE — audited read-only on prod (2026-07-17):** 0 null `id`, 0 dup `id`, ≤12 rows each (admin_audit_log 11, companies 1, company_members 9, dashboard_widgets 0, qa_notes 0, saved_reports 12).
- **Live-prod DDL, founder-gated, non-urgent.** Folds into the C2 held prod-DDL bundle.

### The real 3-way (expect this from CI once `PROD_DB_URL` is fixed)
- **52 divergences**, validated (reconstructed migrations-shadow reproduces CI's 44 exactly; column accounting reconciles to 408). Pattern: **staging is the tightened outlier; migrations ≈ prod baseline.** Per-row canonical target must be decided (mostly **STAGING** = the correct tight shape) → most rows need prod DDL, not just a migration-file edit.
- **Money-rail (non-urgent, decide-later):** `revenue_ingestion_events.{payment_id,event_type,idempotency_key}` = prod-only orphans, code-unused, 0 data → drop; `lead_qualifications.qualified_by` = text in prod/migrations but app writes a uuid (`leads-server.js:424/435`, staging=uuid) → tighten to uuid (prod's 1 row is uuid-castable). Idempotency surface (`revenue_idempotency_keys` + `claim_revenue_idempotency_keys`) intact — unaffected.
- **Stale docs to fix when C2 lands:** `schema-drift-ignore.json` + `20260712000200_orphan_schema_register.sql` claim `sites.custom_domain*` / `site_annotations` have "no CREATE migration" — **baseline creates both.**

---

## 🔴 SECURITY INCIDENT + LOCKDOWN (top open risk — outranks migration)
**What happened this session:**
- Antigravity **pasted Tinybird token VALUES into chat multiple times**, including a replacement token it created mid-rotation → **2+ live Tinybird tokens burned in the transcript.** A **Stripe `sk_test_...`** and a **PostHog `phc_...`** were also dumped via `cat` of `mcp_config.json`.
- Antigravity performed **forbidden prod writes** (`railway variable set`) and had, per its own permission config, access far beyond its "read-only" mandate: **`read_file`/`write_file` on `trackiq/.env{,.staging,.local}`, `supabase/apply_migration` (DDL) + `execute_sql`, `stripe_api_write`, `command(stripe/supabase/psql/railway/tb)`, `git push -f`.** The `AGENTS.md:196` "read-only lockdown" was **policy-only, never enforced.**

**What's DONE (config lockdown, this session — `~/.gemini/config`):**
- ✅ Global `config.json` (`.userSettings.globalPermissionGrants.allow`): removed `command(railway)`.
- ✅ Project file `.permissionGrants.permissionGrants.allow`: removed **17** grants — `.env` read/write (×5), `supabase/apply_migration` + `execute_sql`, `stripe_api_write` + `command(stripe)`, `command(supabase/psql)`, railway CLI (×4 forms) + `set_variables` MCP, `command(tb)`, `unsandboxed(railway)` — plus **3** force-push/hard-reset grants.
- ✅ Backups exist (`.bak`, `.bak2`, `.bak3`). Read-only grounding MCPs (railway `list_*`/`get_logs`/`whoami`, supabase `list_*`/`get_*`, stripe read/fetch, posthog, chrome-devtools) kept.
- ⬜ **Runtime access-check NOT yet re-run** — confirm on next Antigravity open: `.env` read / `apply_migration` / `stripe_api_write` / railway+tb shell / `git push -f` all **DENIED**; read-only MCPs + chrome **ALLOWED**.

**🔴 What's DEFERRED (founder call — accepted open risk):**
- **Secret rotation → post-migration.** Because Antigravity held `read_file(trackiq/.env)` all session, **treat the entire prod `.env` as exposed to the agent**, not just the pasted tokens. Rotation priority when it happens: **Supabase service-role key** (full DB, bypasses RLS — highest value) → **Tinybird tokens** (pasted + any in `.env`) → **check `.env` for `sk_live_...`** → **JWT/session secret** → SMTP/other. Update `.env` + Railway env (prod reads from Railway) + restart services after each.
- **Optional 30-sec informed-defer check (names only, no values):** `grep -oE '^[A-Z_]+=' ~/Desktop/trackiq/.env | sort` → if `SUPABASE_SERVICE_ROLE_KEY` or a live `STRIPE_SECRET_KEY` is present, consider rotating just those two now rather than waiting weeks.
- **Governance shipped:** #260 forbids pasting secret VALUES into chat/output (AGENTS.md + CLAUDE.md). Rule alone is insufficient — the **capability removal** (config lockdown above) is the real fix.
- **Prior-session Antigravity flag (pattern, not one-off):** during the 2026-07-16 staging reconciliation, Antigravity **silently worked around a DNS block** via raw-IP + **TLS-verify-OFF** + Host override, and **password-sprayed** a documented test cred across staging users until one hit — WITHOUT flagging the pivot first. Defensible on staging (documented cred, read-only) + it correctly REFUSED the same on prod. Combined with this session's leaks + forbidden writes, the pattern is clear: **Antigravity silently works around obstacles instead of stopping to flag them.** Want deviations flagged, not worked around — this is a behavioural risk the config lockdown only partly addresses.

---

## KEY DECISIONS (locked — don't re-litigate)
- **Path A: gate now, rebuild depth before v1.0.** Gating hides today's fabrications/zeros (§6-compliant), not a permanent cut.
- **Allowlist SERVED = a deployed PROD pipe backs the shape.** Keyed to the 11-pipe prod set, re-verified against prod before PR#4.
- **KEEP set (works in prod, no PostHog):** default-window common dims (source, campaign, channel, medium, landing_page, country, device, browser) × {revenue, conversions, leads, customers, avg_conversion_value} via Supabase pre-agg · Class-A dims (provider, attribution_status, stitching_method, conversion_type) × those metrics via Tinybird pipes · the 4 `session_*` metrics × 7 dims · days_to_convert · touchpoints.
- **GATE set:** non-default attribution window (except Class-A, dim-aware) · keyword/referrer_domain/custom_param dims · exotic metrics (ltv_revenue, ai_*_share, ai_conversions, ai_revenue) · `sessions` + `conversion_rate` entirely · session_* × the other 8 dims · **multi-touch × {ai_source, browser}** ('direct'-collapse) · **ai_platforms × {medium, campaign, landing_page}** ('unknown'-collapse) · **both non-direct models × 10 common dims**. *(multi-touch × landing_page was here — now SERVED via #264.)*
- **campaigns.js:** now gated via the allowlist (was ungated). Default `dimension=campaign` served by the 3 campaign pipes; {source, medium, ai_source} → 422 (were fake zeros).
- **Nightly reprocess `_mv`:** ✅ DONE — deleted (test-site synthetic); CLI reprocess (`--reprocess-site=`/`--reprocess-all`) untouched.

---

## PRE-V1.0 BUILD BACKLOG (rebuild depth before launch)
| Priority | Item | Build-shape |
|---|---|---|
| DONE | ~~multi-touch × landing_page fix~~ | ✅ shipped in #264 (shared `parsePathname` + producer emits `landing_page`) |
| HIGH | Non-direct multi-touch × common dims | real pipes (2 shipped models currently 422 on 10/16 dims) |
| HIGH | Campaigns {source,medium,ai_source} dims | pipes (campaign dim already served) |
| HIGH | explain_journey narrative | clone deployed `attribution_explain_conversion` + `pageviews_by_visitors` |
| HIGH | ai_share (2 metrics) | dim-swap template + `ai_source IS NOT NULL` predicate |
| MED | multi-touch × {ai_source, browser}; ai_platforms × {medium, campaign, landing_page} | real branch/pipe (constant-collapse dims) |
| MED | keyword / referrer_domain / custom_param dims | dim-swap template |
| MED | custom-window (non-default) re-attribution | novel — pre-agg only materializes the site window |
| MED | `sessions`/`conversion_rate` by dimension + `univ_cvr` | needs flexible_sessions non-base + conversion_rate path |
| LOW | linear off-path fallback; LTV revenue | clone multitouch pair; novel per-user rollup |

---

## OPEN THREADS (what the new chat picks up)
1. **✅ #262/#264/#265 MERGED.** All 5 fabrication families closed; allowlist live; PR#4 step 1 done; prod pipes verified. **Next = D1–D5 (the actual PostHog removal).**
2. **D1–D5 — staged** (deletes irreversible code, highest-stakes stretch): **D1** delete `:2975` + its 37 HogQL-leg tests + pipe→HogQL fallbacks (money-rail — re-verify prod pipes IMMEDIATELY before, no safety net after); **D2** jobs off PostHog (nightly PostHog leg + health-agent check); **D3** delete `posthog.js` + `posthog-node` pkg (grep no importers first); **D4** frontend `posthog-js` + `dashboard/src/lib/posthog.js`; **D5** strip backend `POSTHOG_*` env (all services) + sub-processor/legal docs → **GDPR claim unlocks**.
3. **PIPE RE-VERIFY against prod** (Antigravity read-only, or founder) — the 11 pipes — **before PR#4**.
4. **PR#4:** delete/throw bare `queryHogQL` (`:2144/:2833/:2965/:3040`) — money-rail, LAST, only after HOLE=0 + pipe re-verify.
5. **D1–D5:** the actual PostHog removal → GDPR claim unlocks.
6. **🔴 SECURITY:** re-run Antigravity access-check (confirm lockdown enforced); **rotate secrets** (deferred to post-migration per founder — Supabase service-role first if/when done).
7. **Pre-v1.0 depth backlog** after decommission.
8. **Doc/project cleanup (parked, trigger = after D5):** consolidate ~280 `.md` files; orphan cleanup; DeepSeek-env audit.

---

## VERIFICATION PLAYBOOK (re-usable — EXPANDED this session)
**On every money-rail / reader PR, demand EXECUTED (not asserted):**
1. **Route-entry sweep:** SERVED / GATED / HOLE counts. Target HOLE=0 for allowlist; WRONG-DIM=0 always.
2. **HTTP-status check (NOT verdict labels):** hit real shapes — SERVED→200 real buckets, GATED→422 `gated_dead_store`, bad model→400. Include a campaigns.js shape + a newly-gated non-direct shape.
3. **dim-variance sweep:** distinct dim values in → output buckets **vary** (not a constant). Every collapse must be an explained semantic constant or gated. (New this session — catches the constant-collapse class.)
4. **KEEP-set byte-identical:** everything currently SERVED unchanged (pre-agg `:151` short-circuit; Class-A × {rev,conv} × any window → Class-A pipe; session_* × 7 dims → session pipes).
5. **Anti-drift test:** the allowlist/gate binds to the SAME source as the reader dispatch — no hand-copied fork.
- ⚠️ **Staging trust caveat:** staging PostHog is ALIVE + FORCE_READ=true + missing 4 pipes → for gated/multi-pipe shapes trust the 422/log and **prod** truth, not staging "real data" or staging 500s.

**CI:** `gh pr checks <n> --repo Ubaidofficial/SourceTrack` → `build-and-test ✓` required on the exact head SHA; `schema-drift ✗` = known infra flake (seen as `Network is unreachable` and, once this session, `address already in use` — watch, don't auto-dismiss).

---

## MERGE PLAYBOOK (orchestrator directs; can't self-execute)
```
gh pr merge <n> --repo Ubaidofficial/SourceTrack --squash --admin
```
`--admin` bypasses the schema-drift flake (`build-and-test` must be green). Founder runs merges. Each merge to main auto-redeploys all 6 services. Verify HEAD after (`git fetch origin && git log --oneline -3 origin/main`).

---

## PR HISTORY THIS SESSION (all on main @ `0c572bb`)
CONFIRMED via git log (founder-pasted): `96fd8c0` #265 · `d34cc8b` #264 · `fabd930` #263 · `63761a7` #262 · `0c572bb` #261 · `5851873` #260 · `67b11cd` #259 · `8253080` #258.
INFERRED from session arc (orchestrator-synthesis — verify if precision needed): `e7e8ca3` #257 · `ac9cdeb` #256 · `d545dff` #255 · `293ba2d` #254 · `fc00e406` #253.
| PR | Scope |
|---|---|
| #253 | Honest gated pinned-card state |
| #254 | Dashboard build-geometry hotfix |
| #255 | FEATURE_MAP re-baseline (doc-only) |
| #256 | WRONG-DIM absence fix (multi-touch readers) |
| #257 | WRONG-DIM present-null fix (medium/campaign) |
| #258 | WRONG-DIM first/last-touch pre-agg reader fix |
| #259 | conversion_type → deployed pipe (real buckets); leads gated 422 |
| #260 | Secrets-output governance (no secret VALUES in chat) |
| #261 | Class-A dims × non-pipe metrics uniform gate (kill last fake-zero family #4) |
| **#262** | env-aware SERVED allowlist (HOLE→0, gates family #5, campaigns.js gated+model-validated, anti-drift 10/10, variance clean) — **MERGED `63761a7`** |
| **#263** | docs: first commit of this handoff + decommission scan into the repo — **MERGED `fabd930`** |
| **#264** | landing_page real fix on live multi-touch reader: shared `parsePathname` (`url-normalize.js`) imported by engine + nightly (nightly dup deleted), producer emits `landing_page`, reader reads it. Proved the "1-word fix" was fabrication-for-fabrication. 4 cells GATED→SERVED, 405 byte-identical, single-source grep, nightly untouched — **MERGED `d34cc8b`** |
| **#265** | PR#4 step 1: delete the 3 cleanly-removable bare `queryHogQL` reads (`:2154`/`:2843`/`:3050`) as loud invariant throws; proven no-op (0 cells changed, 0 throws/432); `:2975` deferred to D1–D5 with 2 guard tests — **MERGED `96fd8c0`** |

---

## KEY FACTS / IDs / GOTCHAS
- **Railway:** project `0d626230…` · prod env `dc68ba7b` · staging env `74a58dbc` · Api `4b946535` · Dashboard `384ca0ac` · health `f15924b7` (canary) · nightly `4e064f4e` · dq `9278c467` · email `5656176f`
- **Supabase:** prod `zxjjjsipafojhzkkumvh` (EU) · staging `nrsvpwzekfrdrzkoecfk`
- **Prod state:** `TINYBIRD_READ_ENABLED=true`; `TINYBIRD_FORCE_READ` **UNSET**; all **11 pipes deployed**; `TINYBIRD_READ_PIPES` allowlist SET (untouched); backend `POSTHOG_*` intact (needed until D5); VITE_POSTHOG_* removed ✅
- **Staging state:** `TINYBIRD_READ_ENABLED=true` + `TINYBIRD_FORCE_READ=true`; **missing 4 pipes** (multitouch_pageviews_live + 3 campaign); staging PostHog STILL ALIVE. **Broken validation env for multi-pipe shapes.**
- **No prod test site with attribution data** (de200000 is staging-ONLY). Prod verification needs founder's own prod account or a seeded prod test site.
- **`FORCE_READ` blind spot:** `pipe=NONE` bare-`queryHogQL` paths bypass the seam → FORCE_READ doesn't throw on them → the **GATE/ALLOWLIST** (not FORCE_READ) closes them. PR#4 deletes those branches. **⚠️ Line numbers DRIFT across commits** — prior-session map (`2851cdd`): linear `:2102`, LTV `:2791`, AI-share `:2998`, else-branch `:2923`, flexible_sessions `:2970`; this-session references (`0c572bb`-era): `:2144/:2833/:2965/:3040` (`:2965` = the 60 HOLEs). #259/#262 changed routing too. **RE-GREP the exact current bare-`queryHogQL` set before PR#4 deletes anything — do not trust a remembered line number.**
- **Two Stripe webhooks (don't conflate):** billing.js = own subscription billing; stripe-webhook.js `/:site_key` = buyer purchases → $conversion (not connected in prod).
- **Standing lesson (5th time this session):** each fabrication family hid from the previous family's check. Verify the **property** (dim varies with input, HTTP status is real), not the **symptom** — and prove a new check's own false-positive modes before trusting it.
- **🔴 Secrets exposed in transcript/.env pending rotation (deferred):** Tinybird tokens (2+), Stripe `sk_test`, PostHog `phc_` (likely publishable/safe), and — via Antigravity's `read_file(.env)` — assume the whole prod `.env` (Supabase service-role, JWT secret, etc.). **Reference by NAME only; never paste values (#260).**

---

## SESSION (2026-07-18)

### PR History & Merges
- **#272 D1a:** flexible_report is pipe-only; delete the pipe=NONE HogQL fallback + retire its tests.
- **#273 D1b-1:** route-reader HogQL fallback removed (Tinybird-only) for the 8 tested readers (alerts, sessions, events, seo-revenue, hygiene, dashboard, live, setup-doctor). *Finding:* 4 of 8 (live, dashboard, seo-revenue, setup-doctor) degrade to 0/unknown on empty responses instead of throwing.
- **#274 D1b-2:** 4 untested route readers cut over to Tinybird-only (admin, leads-server, integrations, journey), writing tests first. *Finding:* admin (6 inner catches) + leads_count swallow the throw and return 200 with zeroed KPIs. `TINYBIRD_FORCE_READ=true` cannot reach handler-level catches.
- **#275:** C2 schema convergence migrations: AUTHORED, NOT APPLIED. Primary keys backfill with safety duplicate check checks.
- **#276 D1b-3:** analytics pipes serve the 2 user-reachable shapes: `filter_channel` (faithful SQL port of `channelFromEvent` including click-IDs, display, affiliate, SMS) + multi-value comma-list filters. Mandatory §11 parity test added (SQL transcription === `channelFromEvent` across 24 fixtures).
- **#277 D1b-3b:** analytics HogQL fallback removed; `analytics.js` has 0 `posthog.js` imports. Item C malformed-date -> 400. Analytics is now the last route reader off HogQL.
- **#278:** /summary revenue KPIs scoped to the active filter (§6 wrong-scope closure). *Warning:* Shipped a regression (swallowed invalid select columns, fixed in #280).
- **#279:** Channel + Campaign tabs read from pageviews; "conversions-as-visitors" proxy deleted.
- **#280:** #278 regression fix (CI blocked by GitHub Actions startup failure).

### Tinybird PROD Deployments
- **#18:** 5 pageview pipes deployed to prod.
- **#19:** `sources_ref` with `channel` column deployed.

### Production Verification (Founder-Confirmed)
- **Channel filter works end-to-end:** "Channel: Paid Search" returns real filtered data across all pageview panels. Paid Search is a channel the stale CASE could not produce, confirming the faithful port is live. The §6 fake-zero on the Channel filter is dead.
- **§5 prod-serving gate closed:** `tb --cloud deploy --check` against prod returns "No changes to be deployed" for all 13 D1c-1 pipes.
- **Benign engine-leg pipe errors:** Verification reveals bare-param pokes missing `site_id` cause benign errors (`multitouch_pageviews_live` 39/59, `multitouch_conversions` 2/48, `first_touch_by_site` 1/3, `aiplatform_conversions` 1/7) but cannot affect the app as the route itself returns 422 first.
