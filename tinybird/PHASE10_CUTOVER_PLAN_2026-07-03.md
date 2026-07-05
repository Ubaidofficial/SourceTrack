# Phase 10 — Read Cutover Plan (PostHog/HogQL → Tinybird)

> **Derived at HEAD `4b89f1e`** (`claude/tinybird-phase1-events-schema`, post-#99), 2026-07-03. **READ-ONLY plan — no cutover, no code, no flag changes.** Builds on `tinybird/POST_MIGRATION_AUDIT_2026-07-03.md`, re-derived this session.
> **Tags:** `VERIFIED` = grep/read this session · `INFERRED` = name-mapping / reasoning.
> **Surface tags:** `READY-TO-SCOPE` · `BLOCKED-ON-X` · `NEEDS-PIPE-BUILT`.

---

## 0. Headline findings (read these first)

1. **Cutover is CODE, not config, for 75 of 76 sites. VERIFIED.** Only `attribution-engine.js` imports `queryTinybirdPipe` (grep: `queryTinybirdPipe`/`tinybird-read` → only `attribution-engine.js` + `tinybird-read.js` itself). The global flag `TINYBIRD_READ_ENABLED` flips exactly **one** read (`attribution-engine.js:539`, ai_platforms rail). Every other call site calls `queryHogQL` directly with **no Tinybird branch** — flipping the flag does nothing for them. Each needs code: call pipe → map params → null-fallback → map row shape.
2. **76 live HogQL app call sites / 15 files. VERIFIED** (re-counted: `grep -rn queryHogQL( api/ | grep -v posthog.js | wc -l` = 76).
   - **75-vs-76 bridge:** 76 HogQL app call sites total; exactly 1 (`attribution-engine.js:539`) already carries the Tinybird branch, so **75 still require code**. "75" and "76" throughout this doc refer to this split.
3. **Pipes are deployed for most surfaces but WIRED for none** (except the one rail). "Authored-but-unwired" is the norm.
4. **Parity has never run live end-to-end** (founder tokens) — it is the gate BEFORE any surface flips.
5. **Attribution models + Report Builder (`flexible_report`) have NO pipes** — the largest NEEDS-PIPE-BUILT block, and the two hardest surfaces.

---

## 1. CALL-SITE MIGRATION MAP (76 sites / 15 files)

Legend — **Pipe?**: ✅ exists / ❌ none · **Wired?**: 🔌 wired / ⭕ authored-unwired / — n/a.

### `api/lib/attribution-engine.js` — 19 sites (attribution + Report Builder + AI + sessions engine)
| file:line | queryName | reads | Pipe? | Wired? | Note |
|---|---|---|---|---|---|
| :95 | first_touch_attribution | first-touch model rollup | ❌ | — | NEEDS-PIPE-BUILT |
| :157 | last_touch_attribution | last-touch model rollup | 🟡 `last_touch_by_site` (diff shape) | ⭕ | partial only |
| :224 | first_touch_non_direct_attribution | model rollup | ❌ | — | two-store-blocked model |
| :283 | last_touch_non_direct_attribution | model rollup | ❌ | — | two-store-blocked model |
| :406 | aiplatform_conversions_live | AI-source conversions | 🟡 (ai rail) | 🔌 partial | rail-adjacent |
| :622 | aiplatform_pageviews_live_batch | AI-source pageviews (batch) | ✅ `pageviews_by_visitors` | 🔌 `:539` | **the one wired read**; :622 is its HogQL fallback |
| :924 | session_report_pageviews | session report PVs | ✅ `sessions_pageviews` | ⭕ | |
| :940 | session_report_conversions | session report convs | ✅ `sessions_conversions` | ⭕ | |
| :1116 | attribution_explain_conversion | explain one conversion | ❌ | — | NEEDS-PIPE-BUILT |
| :1149 | attribution_explain_journey | explain journey | 🟡 `journey` (diff shape) | ⭕ | partial |
| :1524 | multitouch_conversions_live | multi-touch convs | ❌ | — | NEEDS-PIPE-BUILT |
| :1611 | multitouch_pageviews_live | multi-touch PVs | 🟡 `pageviews_by_visitors` | ⭕ | partial |
| :1916 | flexible_report_linear | Report Builder | ❌ | — | **flexible_report BLOCKED** |
| :1975 | flexible_report_days_to_convert | Report Builder | ❌ | — | BLOCKED |
| :2034 | flexible_report_touchpoints_per_conversion | Report Builder | ❌ | — | BLOCKED |
| :2582 | flexible_report_ltv | Report Builder LTV | ❌ | — | BLOCKED |
| :2618 | flexible_report | Report Builder core | ❌ | — | BLOCKED |
| :2654 | flexible_sessions | Report Builder sessions | ❌ | — | BLOCKED |
| :2682 | flexible_ai_share | Report Builder AI share | ❌ | — | BLOCKED |

**VERIFIED** the only attribution/report pipe in `tinybird/pipes/` is `last_touch_by_site.pipe` — there is **no** `first_touch_*`, `*_non_direct`, `multitouch`, or `flexible_report*` pipe. → **12 of 19 sites are NEEDS-PIPE-BUILT (5 no-pipe + 7 flexible_report).**

### `api/routes/integrations.js` — 11 sites · **all pipes exist** ✅⭕
`:137 integ_install · :138 integ_missing_source · :139 integ_campaigns · :140 integ_referrers · :141 integ_missing_conv · :142 integ_low_activity · :143 integ_traffic · :144 integ_conversions · :145 integ_ai · :146 integ_recent · :295 google_ads_checklist` → 11 matching pipes (`integ_*` ×10 + `google_ads_checklist`). **VERIFIED** (name match to pipe list). Authored-unwired.

### `api/routes/events.js` — 7 sites · **all pipes exist** ✅⭕
`:142 events_latest · :255 events_health_last · :256 events_health_hour · :257 events_health_day · :332 edge_domains · :333 edge_ai_no_utm · :334 edge_utm_no_ai` → 7 matching pipes. **VERIFIED.**

### `api/routes/dashboard.js` — 7 sites · **7/7 covered by existing pipes** (VERIFIED)
queryNames VERIFIED at HEAD: `:62 dash_install`, `:69 dash_alerts`, `:80 dash_stages`, `:98 dash_top_pages`, `:312 bounce_rate → dashboard_bounce_rate ✅`, `:526 live_visitors → dashboard_live_visitors ✅`, `:652 recent_activity_events → dashboard_recent_activity_events ✅`. `dash_alerts`/`dash_stages`/`dash_top_pages` pipes exist ✅.
- **`dash_install` (:61–68) — REUSE, not a new build.** No `dash_install.pipe` exists, but it is an exact match (modulo §2.6 typed translation) to the deployed **`integ_install`** pipe: no `event_type` filter, `LIMIT 1`, no time-window, `SELECT event_type, timestamp, page_url`, no grouping. **Cutover = queryName remap at `dashboard.js:62` to the `integ_install` pipe + response-field mapping.** Target is **`integ_install`, NOT `admin_preview_install`** — the latter omits `page_url`, which this caller selects. VERIFIED (raw SQL diffed).
- Authored-unwired. Net: **0 net-new pipes for Dashboard.**

### `api/routes/admin.js` — 6 sites · **6/6 covered by existing pipes** (VERIFIED)
queryNames VERIFIED at HEAD: `:210 admin_preview_install ✅`, `:237 admin_preview_recent`, `:303 admin_preview_kpis ✅`, `:327 admin_preview_sources ✅`, `:350 admin_preview_overview ✅`, `:428 admin_site_detail ✅` (5 `admin_*` pipes exist).
- **`admin_preview_recent` (:237–243) — REUSE, not a new build.** No `admin_preview_recent.pipe` exists, but it is a **superset match** to the deployed **`alert_recent`** pipe (equivalently `integ_recent`; byte-identical to each other): both have no `event_type` filter, no `LIMIT`, `timestamp >= now() - INTERVAL 24 HOUR`, and aggregate `count()`. The candidate returns `count() AS cnt, MAX(timestamp) AS last_ts`; this caller consumes **only the count and ignores `last_ts`** — the same accepted superset pattern as `conversions_by_site`. **Cutover = queryName remap + read the `cnt` field from the response.** VERIFIED (raw SQL diffed).
- Authored-unwired. Net: **0 net-new pipes for Admin.**

> **Net correction to the earlier "2 additional NEEDS-PIPE-BUILT reads" (`dash_install`, `admin_preview_recent`): revised to 0 net-new pipes.** Both are REUSE remaps of already-deployed pipes. Dashboard = **7/7** and Admin = **6/6** covered by existing pipes.

### `api/lib/setup-doctor.js` — 5 sites · **all pipes exist** ✅⭕
`:59 doctor_pageviews_30d · :70 doctor_last_conversion · :83 doctor_last_click_id · :111 doctor_paid_params_count · :145 doctor_token_verify` → 5 matching deployed pipes. **VERIFIED 1:1** (queryNames resolved at HEAD this session; all 5 pipes deployed).

### `api/routes/hygiene.js` — 5 sites · **NO PIPE** ❌ (CONFIRMED absent)
`:79 hygiene_missing_source · :80 hygiene_campaigns · :81 hygiene_referrers · :82 hygiene_missing_conv · :83 hygiene_low_activity`. **VERIFIED: no `hygiene_*` pipe exists.** The `integ_*` pipes are near-equivalent queries but are not named/scoped for hygiene → NEEDS-PIPE-BUILT (or explicit reuse of `integ_*`).

### `api/routes/alerts.js` — 4 sites · **all pipes exist** ✅⭕
`:30 alert_traffic · :54 alert_conversions · :81 alert_ai · :102 alert_recent` → 4 matching pipes. **VERIFIED.**

### `api/routes/sessions.js` — 3 sites · **all pipes exist** ✅⭕
`:45 sessions_pageviews · :61 sessions_conversions · :166 visitor_sessions` → 3 pipes (faithful raw-row ports; 30-min sessionization applied in JS downstream — no divergence, per N11 audit). **VERIFIED.**

### `api/routes/leads-server.js` — 3 sites · pipes exist · **BLOCKED**
`:65 leads_list · :186 (count, inline) → leads_count · :247 lead_detail`. Pipes exist but **BLOCKED** (see §4: no offset param + `first_touch_campaign` NULL-vs-`''` divergence). **VERIFIED.**

### `api/routes/cohorts.js` — 2 sites · **pipes exist** ✅⭕
`:41 cohorts_weekly · :87 cohorts_ai` → 2 pipes. **VERIFIED.**

### Singletons — pipes exist ✅⭕ except ai-chat
- `api/routes/journey.js:85 journey` → `journey` pipe ✅
- `api/routes/live.js:22 live_visitors` → `live_visitors_bag` / `dashboard_live_visitors` ✅
- `api/routes/seo-revenue.js:135 seo-revenue-landing-pages` → `seo_revenue_landing_pages` ✅ (estimated-revenue truth-gate must be preserved)
- `api/routes/ai-chat.js:158 ai_chat` → **❌ NO PIPE. VERIFIED.** Runs arbitrary LLM-generated HogQL; not portable to a fixed pipe. NEEDS-PIPE-BUILT or excluded from cutover.

### Non-HogQL note
`api/lib/posthog.js:25` (definition) + `:140` (internal `fetchPageviews` wrapper) — not app call sites. `api/jobs/nightly-attribution.js` uses its own `queryPostHog` helper (`:295/:395/:597`) — the **write-side money rail**, coupled to the Phase-7 N+1 decision, **out of Phase-10 read-cutover scope**. **VERIFIED.**

---

## 2. GROUPED BY SURFACE (sequencing view)

| Surface | Call sites | Pipes ready | Status | Blocker |
|---|---:|---|---|---|
| **Integrations** | 11 | 11/11 | READY-TO-SCOPE | parity gate only |
| **Events / edge health** | 7 | 7/7 | READY-TO-SCOPE | parity gate only |
| **Alerts** | 4 | 4/4 | READY-TO-SCOPE | parity gate only |
| **Cohorts** | 2 | 2/2 | READY-TO-SCOPE | parity gate only |
| **Sessions** | 3 | 3/3 | READY-TO-SCOPE | parity gate; sessionization proven divergence-free (N11) |
| **Setup / Health (doctor)** | 5 | 5/5 (VERIFIED) | READY-TO-SCOPE | parity gate only |
| **Dashboard** | 7 | 7/7 (VERIFIED; `dash_install`→REUSE `integ_install`) | READY-TO-SCOPE | browser_name dim (B10) |
| **Admin / Ops console** | 6 | 6/6 (VERIFIED; `admin_preview_recent`→REUSE `alert_recent`) | READY-TO-SCOPE | — |
| **Journey / Live / SEO** | 3 | 3/3 | READY-TO-SCOPE | SEO: preserve estimated truth-gate |
| **Leads** | 3 | 3 exist | **BLOCKED-ON-PAGINATION** | `leads_list` no offset + campaign NULL divergence |
| **AI-sources (attribution rail)** | 2 (of attr-engine) | 1 wired + partial | PARTIAL (only wired surface) | 3 models two-store-blocked |
| **Attribution models** | 4 (attr-engine) | 0–1 | **NEEDS-PIPE-BUILT** | + models 7–9 two-store-blocked |
| **Attribution explain / multitouch** | 4 (attr-engine) | 1 partial | **NEEDS-PIPE-BUILT** | |
| **Report Builder (flexible_report)** | 7 (attr-engine) | 0/7 | **BLOCKED + NEEDS-PIPE-BUILT** | flexible_report parity founder-investigation |
| **Hygiene** | 5 | 0/5 | **NEEDS-PIPE-BUILT** | no `hygiene_*` pipe (integ_* reusable?) |
| **AI-chat** | 1 | 0/1 | **NEEDS-PIPE-BUILT / exclude** | arbitrary generated HogQL |


---

## 3. CUTOVER MECHANISM (config vs code)

**VERIFIED** from `api/lib/tinybird-read.js`:
- **Single GLOBAL flag** `TINYBIRD_READ_ENABLED` (`isTinybirdReadEnabled()`, `:33`). No per-read or per-surface flags exist.
- `queryTinybirdPipe(pipe, params)` returns **`null` on flag-off / missing config / any failure — never throws**; caller MUST fall back to HogQL on null (`:47–60`).
- **The machinery exists but is invoked at exactly ONE site.** For the other 75, there is no `const rows = (await queryTinybirdPipe(...)) ?? (await queryHogQL(...))` wrapper — they call `queryHogQL` unconditionally.

**→ Conclusion: cutting over a surface is a CODE change per call site** (add the pipe call, param mapping, null-fallback, and row-shape adaptation — Tinybird returns named objects; HogQL returns positional arrays, so every consumer's destructuring must be adapted). The global flag is a kill-switch, **not** a surface selector. A future refactor could add per-surface flags, but today none exist. **This is the single biggest scope driver: 75 code sites, not a config toggle.**

---

## 4. PER-SURFACE BLOCKERS

1. **Leads — BLOCKED (prerequisite: add offset pagination).** `leads_list.pipe:103` = `LIMIT {{ Int32(limit_val, 50) }}` — **no OFFSET param. VERIFIED.** Orchestrator VERIFIED via MCP: caps at `limit_val`; a site with 11,997 leads truncates. Cutover of leads is blocked until offset pagination is added to the pipe (and the count path reconciled). **Prerequisite task.**
2. **Leads — known parity divergence.** `leads_list.pipe:25–46` documents an **UNRESOLVED RESIDUAL DIVERGENCE**: `argMin(first_touch_campaign)` returns `''` where live HogQL returns `NULL` for pre-attribution-backfill rows (typed column `DEFAULT ''` doesn't null-skip). A `nullIf` fix made another population wrong. **Must be resolved or explicitly accepted before leads flips. VERIFIED (pipe comment).**
3. **Report Builder — BLOCKED.** `flexible_report` parity is founder-investigation; **0 of 7 flexible_report* sites have a pipe. VERIFIED.** Both pipe-build AND parity are prerequisites.
4. **Attribution models 7–9 — two-store-blocked.** `first_touch`, `first_touch_non_direct`, `last_touch_non_direct` have **no parity harness** and synthetic fixtures exist **only in Tinybird** (no PostHog-shaped ingestion). Cannot parity-prove until the founder decides the two-store fixture mechanism. **VERIFIED (audit §C/§9, RELAYED inventory).**
5. **browser_name webkit-vs-None (B10) — dimension parity gap.** `browser_name` appears in `browsers`, `os`, `summary`, `journey`, `conversions_by_site`, `events_latest`, `sources_ai`, `sources_ref` pipes. **VERIFIED (grep).** → touches **Dashboard (summary), Device (browsers/os), Journey, Events, AI/Sources**. Any surface consuming these must confirm the webkit↔None normalization matches HogQL before flipping. **INFERRED impact scope; the divergence itself needs a targeted read.**

---

## 5. PARITY GATE DEPENDENCY (the flip precondition)

**No surface flips until Section-A parity passes for that surface's metrics.**
- The replay harness covers **6 of 9** targets (Pattern-B 4 + last_touch + ai_platforms), reproducible offline. **Live parity has NEVER executed end-to-end** — the extended live path needs founder-held tokens. **VERIFIED (audit §A).**
- **Sequencing rule:** for each surface, (a) pipes exist + wired-in-code behind fallback, (b) **live parity run for that surface's pipes vs current HogQL on real tenant data passes within tolerance**, THEN (c) flip. The plan sequences *after* parity; it does **not** assume parity.
- **Owner of the gating live run:** founder / orchestrator-Tinybird-MCP (tokens). This is the critical-path external dependency.

---

## 6. ROLLBACK / REVERT SAFETY

- **Dual-write to PostHog MUST CONTINUE through the entire cutover + revert window. VERIFIED:** dual-write is flag-gated (`TINYBIRD_DUAL_WRITE`) and **additive** — PostHog `ph.capture` always runs; `dualWriteEvent` is a parallel best-effort write (e.g. `track.js:402` capture, `:411` dual-write). Reads can revert to HogQL at any time **only because PostHog keeps receiving writes.**
- **Stopping PostHog writes is NOT in the cutover path, and must NOT be until a separate, later decommission gate.** **VERIFIED:** no code path disables `ph.capture`; `TINYBIRD_READ_ENABLED` governs reads only, `TINYBIRD_DUAL_WRITE` governs the additive write. Decommissioning PostHog writes is out of Phase-10 scope.
- **Revert primitive:** because each cutover site keeps the HogQL branch as the null-fallback, revert = flip `TINYBIRD_READ_ENABLED` off (kill-switch) OR ship the code with fallback intact. **VERIFIED** the fallback contract exists (`tinybird-read.js` never throws, returns null).

---

## 7. RECOMMENDED SEQUENCE

Ordered by (pipes-ready × no-blocker × parity-achievable). Each wave = wire-in-code-behind-fallback → live parity → flip.

**Wave 1 — READY-TO-SCOPE (pipes exist, low-risk, parity-achievable):**
- Events/edge health (7), Alerts (4), Cohorts (2), Sessions (3), Setup/Doctor (5, VERIFIED 1:1).
- Rationale: 1:1 queryName→pipe, read-only diagnostics, sessions proven divergence-free (N11). Smallest blast radius; good parity-harness pilots.

**Wave 2 — READY-TO-SCOPE after inline-map + dim confirm:**
- Integrations (11), Dashboard (7), Admin/Ops (6), Journey/Live/SEO (3).
- Gate: confirm the 4 dashboard + 6 admin + doctor inline queries map 1:1; resolve **browser_name webkit-vs-None** for summary/journey/sources; preserve SEO estimated truth-gate.

**Wave 3 — BLOCKED, unblock first:**
- **Leads (3)** — after offset pagination added to `leads_list.pipe` AND `first_touch_campaign` NULL divergence resolved/accepted.
- **AI-sources rail** — extend the one wired read; then **models 7–9** only after two-store fixtures decided.

**Wave 4 — NEEDS-PIPE-BUILT / hardest, last:**
- **Hygiene (5)** — build `hygiene_*` pipes (or formally reuse `integ_*`).
- **Attribution models (4) + explain/multitouch (4)** — build per-model pipes; parity vs in-engine HogQL.
- **Report Builder / flexible_report (7)** — build the flexible_report pipe family AFTER founder unblocks flexible_report parity. Largest single risk.
- **AI-chat (1)** — decide: build a constrained pipe or **exclude from cutover** (arbitrary generated HogQL isn't pipe-portable). Recommend **exclude** and leave on HogQL, documented.

**Terminal gate (out of Phase-10 scope):** per-tenant read tokens (currently one `WORKSPACE:READ_ALL`), then — only after all surfaces flipped + soak — a separate decommission gate to stop PostHog dual-write.

---

### Scope totals
- **76 sites / 15 files.** Buckets recomputed to close exactly: **READY 55 + BLOCKED 3 + NEEDS-PIPE-BUILT 18 = 76.**
- **Non-attribution-engine files (57 sites):** READY 48 (integrations 11 · events 7 · dashboard 7 · admin 6 · doctor 5 · alerts 4 · sessions 3 · cohorts 2 · journey/live/seo 3) + BLOCKED 3 (leads) + NEEDS-PIPE-BUILT 6 (hygiene 5 · ai-chat 1) = **57**.
- **`attribution-engine.js` (19 sites, straddles buckets):** READY 7 (2 sessions authored-unwired `:924/:940` · 2 AI-rail partial `:406/:622` · 3 diff-shape partial `:157 last_touch_by_site`/`:1149 journey`/`:1611 pageviews_by_visitors`) + NEEDS-PIPE-BUILT 12 (5 no-pipe `:95/:224/:283/:1116/:1524` · 7 flexible_report `:1916/:1975/:2034/:2582/:2618/:2654/:2682`, the 7 also founder-BLOCKED) = **19**.
- **Bucket rollup:** READY 48 + 7 = **55** · BLOCKED **3** (leads) · NEEDS-PIPE-BUILT 6 + 12 = **18**. **55 + 3 + 18 = 76.** ✓ (Caveat: 5 of the 55 READY are attribution-engine partials needing shape/parity reconciliation, not clean 1:1 remaps; the 7 flexible_report inside NEEDS-PIPE-BUILT are also founder-BLOCKED on parity.)
- **Critical path:** live parity run (founder tokens) → then waves. **Cutover is 75 code changes** (76 HogQL sites − 1 already-wired `attribution-engine.js:539`), **gated per-surface by parity — not a config flip.**
