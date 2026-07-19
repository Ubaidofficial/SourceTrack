# Phase 9 — Validation Harness BUILD PLAN (REDUCED bar) — PLAN ONLY, DO NOT BUILD

> **Status:** DRAFT for founder + orchestrator review. Uncommitted. No harness code, no app/DDL, no ingest written under this doc.
> **Authored against ref:** `origin/claude/tinybird-phase1-events-schema` @ HEAD `ceb8904`.
> **Companion:** `tinybird/PHASE9_VALIDATION_HARNESS_SPEC.md` (the six §14 checks, made concrete) — this doc is the *reduced-bar build plan* for actually standing the harness up.

## 0. Why "REDUCED bar" — a justified scoping call, NOT a spec clause

The Phase 9 bar is deliberately reduced. This is **not** a clause in SCOPE_v3.md permitting a lower bar — it is a **founder scoping decision** justified by three written facts:
- **SCOPE §0.2** — zero real customers on prod (`techrupt.pk` = test); no live revenue depends on the migration yet.
- **SCOPE §9:202** — MRR Steps 4/5 parked post-migration; the money-metric surface Phase 9 would otherwise gate is not built.
- **Founder's "§9 governs §14" decision** — validate only what the migration actually produces.

So: the reduced bar is a *risk-justified scope*, applied because the blast radius is currently zero. It must be re-raised before any real-customer cutover (Phase 10). Stated this way on purpose — do not cite it as "the spec allows reduced."

> ### ⚠️ KEY CAVEAT — what "reduced" actually COSTS (do not underestimate)
> **"Reduced" is NOT "mostly re-run things already proven."** Verified from code: the only Tinybird-vs-PostHog reconciliation tool, `phase4_touchpoint_diff.js`, self-declares **"NOT YET RUN … not yet executed end-to-end"** (`:27-29`), and **no repo artifact** (test, log, stored result) shows the 6 "signed-off" models' row-level diff was ever executed or passed. The Phase-4 "sign-offs" were authoring-time review + orchestrator MCP spot-checks (per handoff, not repo-verifiable) — **not** a run of this harness. So the reduced bar comprises **three net-new efforts, none of them a cheap regression re-run**:
> 1. **RUN the 6 models' row-level parity — possibly for the first time** (extend + actually execute `phase4_touchpoint_diff.js`; treat every result as a first-time diff, not a re-confirmation).
> 2. **BUILD the aggregate-layer diff from scratch** (genuinely unbuilt — §4 U3, HIGH).
> 3. **SOLVE two-store fixture ingestion** for #1/#2/#3 (founder-run; PostHog-shaped replay path unknown — §3 / U5).
>
> Detail retained as §4 unknown **U1**. Confidence the tool never ran: **HIGH**.

---

## 1. Reduced-bar scope — IN vs OUT (each tied to a spec section)

| # | Item | IN/OUT | Spec tie | Justification / state |
|---|---|:--:|---|---|
| 1 | **Tolerance reconciliation** (per-column-class), for models with fixtures | **IN** | §14 + §2.4/§2.6 | Core of the harness; rules in §2 below. |
| 2 | **Golden tests — 6 Phase-4 models** (`last_touch`, `ai_platforms`, `linear`, `u_shaped`, `w_shaped`, `time_decay`) | **IN** | §14 "all 9" (reduced to the 6 with fixtures) | Fixtures + expected values exist in 469905 and the logic was reviewed / "signed off" at **authoring** time — **but the row-level diff tool (`phase4_touchpoint_diff.js`) has NOT been executed** (its own header: *"NOT YET RUN … not yet executed end-to-end"*, `:27-29`). No repo artifact shows the diff ever ran or passed. Phase 9 must **RUN** their parity — **possibly for the first time** — not "re-run a passing regression." |
| 3 | **3 disk fixtures** (#1 `first_touch`, #2 `first_touch_non_direct`, #3 `last_touch_non_direct`) | **IN — but SKIP-LOUD until ingested** | Spec §3 recorded fixtures | Deterministic (seed `phase9-fixtures-v1`), disk-only today. Founder ingestion checklist §3 below; harness stays SKIP-LOUD until they land in BOTH stores. |
| 4 | **Aggregate-layer diff** (`groupBy`-aggregated API response) | **IN — new build** | §2 caveat | **Confirmed unbuilt** — the only reconciliation tool (`phase4_touchpoint_diff.js`) is row-level only and "NOT YET RUN" (see §4 confidence). Phase 4 proved row-level parity; aggregate never diffed. |
| 5 | **Cross-store idempotency test** | **IN** | §14 | Dual-write dedup: same `deriveEventId` → one row per store; retry stays one. |
| — | | | | |
| 6 | **MRR round-trip** | **OUT** | §9:202 | MRR Steps 4/5 parked post-migration; no MRR aggregation exists in code (verified prior). Not a Phase 9 gate. |
| 7 | **Refund signed-test** | **OUT (SKIP-LOUD / no-op contract only)** | §13 row 7 | Phase 7 refund handler not built; test asserts today's no-op, flips when the handler ships. |
| 8 | **#4 subscription_revenue write-parity** | **OUT (scheduled later)** | §4 (re-scoped) | Founder-gated Supabase build (staging writes, no read-only path). Plan exists; not this harness. |
| 9 | **#6 merged-identity** | **OUT (resolved inert)** | §3 resolution (committed `ceb8904`) | Server-side merge yields `visitor_id == distinct_id`; read pipes key on `distinct_id`. No fixture. |
| 10 | **Token-level tenant isolation** (literal §14 "site-A TOKEN never returns site-B rows") | **OUT (Phase 10)** | §6 / §14 | See §1a below — the achievable PARAM-version passed; the literal TOKEN-version is Phase 10. |

### 1a. The §14 tenant-isolation wording vs. what's achievable now (explicit distinction)
§14 literally says *"Tenant-isolation test (site-A **token** never returns site-B rows)."* That literal test requires **per-tenant read tokens** — which do not exist yet: the staging read token is `st_endpoint_read` = `WORKSPACE:READ_ALL` (spec §6, "Token-scope isolation ⏳ Phase 10, untested"). Per-tenant JWTs are deferred to Phase 10.
- **What Phase 8 verified (achievable now):** the **PARAM-prune** version — one `WORKSPACE:READ_ALL` token, two different `site_id` params, disjoint result sets. Static audit CLOSED + a 2-pipe runtime disjoint check (founder-verified, spec §6).
- **What §14's literal wording requires (Phase 10):** the **TOKEN-scope** version — a per-tenant token that *cannot* read another tenant regardless of param.
- **Plan stance:** Phase 9 records tenant-isolation as **PARAM-version PASSED (Phase 8); TOKEN-version deferred to Phase 10.** The harness does not attempt the token-version — it's unbuildable until per-tenant JWTs exist.

---

## 2. Reconciliation mechanics (from SCOPE §3/§5/§14)

### 2a. Reference store + HARD window constraint
- **Reference store: PostHog `469905` (staging).** Verified this session via `project-get {}` (id 469905, "SourceTrack Staging"). Spec §7 resolves the reconciliation target to 469905 on the 140G-24B evidence.
- **HARD CONSTRAINT — the window is a HISTORICAL fixture span, not "now."** CC's read of 469905: **~3,059 events**, span **2026-05-18 → 2026-06-30**; gating site `de200000-…441111` present (459 events); Phase-4 fixtures `cc-4a/4c/4d` present, fired **2026-06-27**. Recent (last-day) traffic is **zero**. → **The harness MUST target the late-June fixture span (≈2026-06-20 → 2026-06-30), never `now() - INTERVAL …`.** A "now"-anchored window diffs against empty and false-greens. This constraint is load-bearing; bake the explicit date range into every query.

### 2b. Tolerance rules per column class (§2.6 / §2.4 / §14)
| Class | Rule | Pass |
|---|---|---|
| Typed col w/ fixed DEFAULT (`first_touch_source`→`'direct'`, `first_touch_medium`→`'none'`, `first_touch_campaign`→`''`, `conversion_type`→`'untyped'`) | Coalesce BOTH sides through the same app read-layer COALESCE before compare (adapter maps `null`→DEFAULT at ingest). | Exact equality after coalescing. |
| Typed numeric (`conversion_value` Float64) | Direct numeric compare. | Exact to the cent. |
| Bag / NULLIF-affected (`anonymous_id` = `nullIf(JSONExtract…,'')`) | Apply identical `NULLIF(x,'')` on both sides. | Exact after NULLIF. |
| Approximate distinct (`count(DISTINCT …)`, `uniq(…)`) | ClickHouse `uniq` is HLL-approximate (§5/§14). | `|tb − ph| / ph ≤ 0.005` (±0.5%). |
| Timestamps | Compare within-journey INTERVALS, not absolutes (PostHog +339ms ingestion offset cancels out of deltas). | Interval deltas within ≤ a few ms; absolute offset ignored. |

### 2c. How the harness diffs Tinybird vs PostHog
- **Tinybird side:** call the **deployed read pipes** over HTTP (`conversions_by_site`, `pageviews_windowed_by_site`, `last_touch_by_site`, `pageviews_by_visitors`, plus the aggregate endpoints) with the fixed late-June window + `site_id`, using the per-pipe READ tokens (`phase4_*_read`) / `st_endpoint_read`.
- **PostHog reference side:** run the **live HogQL** query the app path uses (`getMultiTouchAttributionLive` etc.) against **469905**. The existing `phase4_touchpoint_diff.js` already implements the Pattern-B row-level version (but literal-copies the live SQL — drift risk flagged in its own header; recommend extracting `buildMultiTouch*Sql` as shared exports before relying on it).
- **⚠️ STALE-ROUTING FLAG (correct on next doc touch):** the committed spec §7/§11 says *"orchestrator's PostHog MCP is scoped to prod `416017`; 469905 runs route through CC/founder."* **This session's CC PostHog MCP is verified scoped to `469905`** (`project-get`), which contradicts the "CC can't read 469905" implication. Whether the *orchestrator's* MCP is 416017 or 469905 is **not verifiable from code** (MCP config, not repo). **Action:** on the next authorized spec touch, correct §7/§11 to reflect that a 469905-scoped read IS available this session; do not carry the "416017-only" routing assumption forward as fact.

---

## 3. Fixture-ingestion checklist (FOUNDER-RUN — agents do NOT ingest)

For #1/#2/#3 to run, the SAME logical fixture must exist in **both** stores, over the harness window. **This likely needs TWO ingestion paths** (flagged, needs verification):
1. **Tinybird staging** ← the disk NDJSON (`generate_events.js --seed phase9-fixtures-v1 --visitors 400 --sites 3 --days 30 --conversion-rate 0.5`) via the Tinybird **Events API** (founder-run, needs an ingest token). The NDJSON is already Tinybird-`events.datasource`-shaped (`json:$` flat).
2. **PostHog `469905`** ← the matching REFERENCE events. **Open question (needs verification):** the disk NDJSON is Tinybird-shaped (flat typed columns); PostHog needs `ph.capture`-shaped events (nested `properties`). The generator README states the intent is "deterministic replay into both PostHog and Tinybird," but **whether a PostHog-shaped emitter/replay exists is NOT verifiable from code** — I found only the Tinybird-NDJSON generator. So either (a) a replay tool reshapes the same seed for PostHog capture, or (b) a second ingestion mechanism is needed. **Founder must confirm which.**

**Every write above is founder-execution-required.** Contrast: the Phase-4 `cc-4a/4c/4d` fixtures are ALREADY in 469905 (fired through the app dual-write, 2026-06-27) — those 6 models can run without new ingestion; only #1/#2/#3 (`phase9-fixtures-v1`) need the two-store ingest.

Also required for the harness to hit deployed Tinybird pipes at all: the pipes must be **deployed to staging** (Deployment #4 covered 56 pipes per spec; confirm the specific pipes the harness calls are live — see §4 unknowns).

---

## 4. Build sequence + unknowns

### Proposed build order
1. **Runner skeleton** — config (fixed late-June window, site_id list, token wiring), per-column tolerance comparators (§2b), SKIP-LOUD/report scaffold (anti-false-green rule).
2. **6-model row-level diff** — extend/reuse `phase4_touchpoint_diff.js` (after extracting shared SQL builders) for `last_touch`/`ai_platforms`/`linear`/`u_shaped`/`w_shaped`/`time_decay` against the existing 469905 `cc-*` fixtures.
3. **Aggregate-layer diff** — NEW: diff the `groupBy`-aggregated API response (Tinybird pipes vs live HogQL), the §2 caveat gap.
4. **Cross-store idempotency test** — assert one-row-per-store on a duplicated `deriveEventId`, retry stays one.
5. **(Founder) ingest 3 fixtures** — §3 checklist, both stores.
6. **Run 7/8/9** (`first_touch`, `first_touch_non_direct`, `last_touch_non_direct`) once ingested; until then SKIP-LOUD.

### Unknowns — "needs verification before/during build," NOT facts
- **U1 — Do the 6 "signed-off" models actually pass? (see KEY CAVEAT in §0)** **Cannot determine from the repo whether the diff was ever executed** — `phase4_touchpoint_diff.js` self-declares "NOT YET RUN … not yet executed end-to-end" (`:27-29`), and there is **no** stored result / log / test assertion for it anywhere in the repo (grep confirmed; the only unrelated matches are `timezone-reconciliation.test.js` and `tracker-privacy-parity.test.js`). The prior "sign-offs" were authoring-time review + (per handoff, not repo-verifiable) orchestrator MCP spot-checks — **not** runs of this tool. **Treat the 6 models as unproven-by-execution; RUN their parity, don't assume it re-passes.** Confidence the tool never ran: **HIGH**. Confidence they'll pass when run: **cannot determine from repo.**
- **U2 — Are the 469905 `cc-4a/4c/4d` fixtures intact + complete?** CC confirmed their presence + conversion counts, but not full field integrity vs the Phase-4 expected tuples. **Verify field-level before trusting.** Confidence: MEDIUM.
- **U3 — Is the aggregate diff truly unbuilt?** **Verified: yes** — only `phase4_touchpoint_diff.js` (row-level) exists; no aggregate/groupBy reconciliation code. Confidence: HIGH.
- **U4 — Are the specific read pipes the harness calls deployed to staging + answering?** Spec says Deployment #4 = 56 pipes live and a wire-format check passed, but that's prior-session; **confirm the exact pipes + tokens respond before building the diff.** Confidence: not verifiable from here.
- **U5 — Can `phase9-fixtures-v1` feed PostHog 469905?** §3 open question — no PostHog-shaped emitter found in code. **Founder/replay-tool confirmation needed.** Confidence: LOW (mechanism unknown).
- **U6 — Orchestrator PostHog MCP scope (416017 vs 469905)?** Not verifiable from code; spec framing may be stale (§2c flag). **Confirm before relying on any routing assumption.**
- **U7 — SQL-drift in `phase4_touchpoint_diff.js`** — it literal-copies live queries; if `attribution-engine.js` changed since Phase 4, the harness is silently stale. **Extract shared SQL builders first** (the tool's own recommendation).

### What is genuinely settled (facts, code-verified)
- Aggregate diff is unbuilt (U3, HIGH).
- Reference store = 469905; window = late-June historical span (HIGH).
- 6 models have fixtures in 469905; #1/#2/#3 do not yet (HIGH).
- Token-isolation literal-version is Phase 10; param-version passed Phase 8 (HIGH).
- #4/#6/MRR/refund are correctly OUT per their spec ties (HIGH).

---

## 5. Open questions for founder + orchestrator
1. Confirm the two-store ingestion mechanism for `phase9-fixtures-v1` (U5) — replay tool vs second path?
2. Confirm the harness read pipes are deployed + answering on staging (U4).
3. Approve extracting `buildMultiTouch*Sql` as shared exports (U7) before building on `phase4_touchpoint_diff.js`.
4. Confirm/correct the §7/§11 routing framing (orchestrator MCP scope) on next spec touch.
5. Re-affirm the reduced bar is acceptable given zero real customers, and note the re-raise gate at Phase 10.
