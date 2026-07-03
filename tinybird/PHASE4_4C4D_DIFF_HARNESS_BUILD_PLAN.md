# Phase 4c/4d — last_touch + ai_platforms DIFF HARNESS BUILD PLAN — PLAN ONLY, DO NOT BUILD

> **Status:** DRAFT for founder + orchestrator review. Uncommitted. No harness code, no `.pipe` files, no ingest, no HTTP fired under this doc (all checks below were read-only queries).
> **Authored against ref:** branch `claude/tinybird-phase1-events-schema` @ HEAD `6b017f9` (`git log -1` run this session — not inherited from a prior doc).
> **Companions:** `PHASE4_4C_PLAN.md` §5 (exact-tier picked-touch diff) and `PHASE4_4D_PLAN.md` §3 (exact-tier credited-platform diff) — the METHODS. `GATE3_RECONCILIATION_CONTRACT.md` :59-62 (compare intervals, never absolute cross-store timestamps). This doc plans only the HARNESS CODE that executes those methods; it does not re-derive them.

## 0. What this closes

`run_phase4_diff.mjs:12-13` states plainly: **no diff harness exists** for `last_touch` (Pattern A) or `ai_platforms` (Pattern C). They are the only two Phase-4-gating models with zero execution record (the 4 Pattern-B models have a founder-run PASS, `SESSION_HANDOFF.md:16-20`). This plan extends the existing Pattern-B harness to cover both, so a single founder run can produce 6/6 row-level execution records.

---

## 1. Facts verified THIS session (live, read-only — not assumed, not inherited)

| # | Fact | How verified |
|---|---|---|
| F1 | `last_touch_by_site` and `pageviews_by_visitors` are **deployed and answering** on the Tinybird workspace the connected MCP reads | live `list_endpoints` this session (both names present, alongside the 3 other Phase-4 pipes) |
| F2 | **`cc-4c` fixtures exist in BOTH stores**: 3 `$conversion` / 8 `$pageview`, site `de200000-…441111`, span 2026-06-27 21:14–21:29 UTC | Tinybird SQL + PostHog 469905 HogQL, counts identical |
| F3 | **`cc-4d` fixtures exist in BOTH stores**: 4 `$conversion` / 9 `$pageview`, same site, span 2026-06-27 21:35–22:00 UTC | same paired queries |
| F4 | Field-level shape **matches the 4C §3/§4 and 4D §4 plan tables row-for-row** (X google→newsletter→conv→Perplexity-bait; Y facebook→direct→ChatGPT→conv; P/Q/R/S per the 4d table incl. the no-AI-signal visitorS) | full row dump from Tinybird, spot-checked against both plan tables |
| F5 | **The visitorZ tie pair is a REAL exact tie in BOTH stores** — two pageviews at `21:24:49.002` (Tinybird) and both at `21:24:49.326000Z` (PostHog). The uniform per-batch ingestion offset preserved the tie | paired per-row queries this session |
| F6 | Cross-store offsets are uniform per fixture batch: **+324ms (cc-4c), +330ms (cc-4d)**, vs +339ms (cc-4a) — all inside the existing `TS_TOLERANCE_MS = 500` | min/max timestamp comparison per prefix |
| F7 | `selectAiTouchForConversion` **is exported** (`attribution-engine.js:312`); `detectAiPlatformFromEvent` **is exported** (`channel-classifier.js:103`) — the 4d harness can import the REAL selection logic, no literal copy needed for that layer | grep |
| F8 | The deployed `last_touch_by_site.pipe` **diverged from the 4C §2.2 sketch**: A-2 was rejected live ("Unsupported JOIN ON conditions"), and it ships as **4 INDEPENDENT per-field `ASOF LEFT JOIN`s on `distinct_id`** (utm_source / utm_medium / utm_campaign / ai_source, each `IS NOT NULL`-filtered), returning per-conversion picks keyed `conversion_event_id` | pipe file read (`last_touch_by_site.pipe:46-88` + header) |
| F9 | Module-import safety for a tool that imports `attribution-engine.js`: `supabase.js` is a **lazy accessor** (no client at module load); `posthog.js`'s module-load capture-client crash is already solved by the runner's stub (`run_phase4_diff.mjs`, commit `78ec6b1`) | file reads |
| F10 | The runner's existing window (`2026-06-26 .. 2026-06-30`, exclusive end 07-01) **already contains both new fixture sets** (fired 06-27) and the 30d lookback covers all their pageviews | F2/F3 spans vs `run_phase4_diff.mjs:64-76` |

**Direct answer to "do the fixtures need firing first": NO. Both `cc-4c` and `cc-4d` are already present, complete, and field-correct in both stores. Zero ingestion is required for this harness.** (Field integrity was spot-verified at the level the diff consumes — utm/ai_source/referrer/timestamps — not every reserved column.)

---

## 2. Reuse vs. genuinely new

### 2.1 Reused as-is from the Pattern-B harness (`phase4_touchpoint_diff.js` + `run_phase4_diff.mjs`)

- `tsMs()` UTC-safe parse + `TS_TOLERANCE_MS = 500` (F6 confirms both new batches sit inside it).
- `fetchTinybirdRows()` — generic pipe HTTP GET with per-pipe READ token.
- The `conversionMatches` cross-store join rule: **(distinct_id, timestamp ±500ms)** — load-bearing here, because the two stores' conversion IDs live in different ID spaces (PostHog `uuid` vs Tinybird `deriveEventId`-derived `event_id`); IDs must NOT be used as the join key.
- `serializeHogQLDateRange` / `toTinybirdDateTime` param formatting (TYPE_MISMATCH fix, `7cd3140` lineage).
- `fixturePrefix` client-side isolation (runs will use `cc-4c-` / `cc-4d-`).
- Runner scaffolding wholesale: required-env guard, the `POSTHOG_PROJECT_ID === '469905'` refusal, the `POSTHOG_API_KEY` stub, and the **false-green guard** (0 matched conversions = FAIL, never PASS).
- For 4d additionally: `fetchHogqlConversions`, the `conversions_by_site` pipe fetch, `resolveLookback`, `windowPageviewsForConversion`, `tpFieldsKey`/`diffTuple`, `groupByVisitor`.

### 2.2 New for `last_touch` (4c-diff) — comparator + one HogQL fetch

1. **`fetchHogqlLastTouchPicks(siteId, fromDate, toDate)`** — a literal copy of the INNER subquery of `lastTouchAttribution` (`attribution-engine.js:121-146`): per-conversion `argMax(pv.utm_source/utm_medium/utm_campaign/ai_source, pv.timestamp)` grouped by `conversion_uuid`, extended to also select the conversion's `distinct_id` + `timestamp` (needed for the cross-store join). The outer `GROUP BY source/medium/campaign` aggregate wrapper is deliberately NOT copied — 4C §5's golden diff is per-conversion, pre-aggregation.
   - Note: the live query has **no attribution-window bound on the pageview side** (only `pv.timestamp <= conversion.timestamp`), and the deployed pipe mirrors that (no lookback param). The 4c comparator therefore takes no `windowDays` — do not "helpfully" add one.
2. **Tinybird leg** — `fetchTinybirdRows('last_touch_by_site', token, { site_id, date_from, date_to })` (params per F8). Zero new transport code.
3. **Comparator `diffLastTouchPicks`** — join per conversion on (distinct_id, ts±500ms); compare the **4-tuple of per-field picks** (utm_source, utm_medium, utm_campaign, ai_source), exact-tier. Per-field comparison is the correct shape because BOTH sides pick each field independently (HogQL `argMax` skips NULLs per column; the pipe's per-field `IS NOT NULL` ASOF legs were built to mirror exactly that — F8). Optionally also compare the app-level `COALESCE(NULLIF(source,''), NULLIF(ai_source,''), 'direct')` label as a secondary, derived check (`engine:110-114`).
4. **Tie-row handling (per 4C §4/§5, pre-committed — not improvised at run time):** the visitorZ conversion is matched and reported **separately**. Agreement on which of the two tied sources was picked = bonus confirmation. Disagreement = a *documented ambiguity* with the proposed deterministic tiebreaker (`argMax(value, (timestamp, event_id))` both sides), exit code still distinguishing it from a real parity failure on X/Y rows.

### 2.3 New for `ai_platforms` (4d-diff) — comparator + one HogQL fetch + real-selection reuse

1. **`fetchHogqlAiPageviews(siteId, distinctIds, lookbackStr, toDate)`** — literal copy of the live IN-list `pvSql` (`attribution-engine.js:471-503`), chunked like the live path. At fixture scale (4 visitors, 9 pageviews) one chunk/one page suffices — but keep the loop shape so the tool doesn't lie at larger scale.
2. **Tinybird leg** — the deployed `pageviews_by_visitors` pipe with `visitor_ids` as repeated query params + `page_size`/`page_offset`. The repeated-param Array encoding is already proven against the live deployed pipe by the engine's own Phase-6 read path (`tinybird-read.js:20`, `engine:539`, commit `7cd3140` verified a real call). Implementation choice (flagged for review, recommendation first): **extend `fetchTinybirdRows` with repeated-param support and use the per-pipe `phase4_pageviews_by_visitors_read` token** — keeps the harness's least-privilege token convention — rather than importing `queryTinybirdPipe`, which requires `TINYBIRD_READ_ENABLED` + the broad `TINYBIRD_READ_TOKEN` and is fail-safe-to-null (wrong failure mode for a harness: it must throw loudly, not silently fall back).
3. **Selection layer: import the REAL functions** (F7) — run BOTH legs' row sets through the exported `selectAiTouchForConversion` + `detectAiPlatformFromEvent`. No copy = a whole class of U7-style drift eliminated for this layer (the drift risk remains only in the copied `pvSql`, §5).
4. **Comparator `diffAiPlatformCredits`** — per conversion, exact-tier `credited_platform` (or explicit `no-credit`), joined cross-store on (distinct_id, ts±500ms). Plus 4D §3's **secondary row-level check**: the touchpoint SET each leg hands to the selector must be identical (reuse `tpFieldsKey` + tolerance matching — the Pattern-B machinery verbatim).
5. **Negative-case guard (visitorS):** assert S's conversion IS present on both legs AND credited `no-credit` on both. Without the presence assertion, a bug that drops S entirely would false-green the no-credit expectation.
6. Expected picks the run must reproduce, straight from the fixture rows (F4): P→ChatGPT (AI touch is NOT last touch — the headline case), Q→Perplexity, R→Perplexity (most-recent AI, not first, despite trailing direct touch), S→no-credit.

### 2.4 Diagnostics (both models)

Any reported "gap between picked/credited touch and conversion" is computed **within each store independently** (interval rule, `GATE3:62`) — never as a cross-store absolute-timestamp subtraction.

---

## 3. Shape: extend, not a new harness

**Recommendation: extend the two existing files.** Two new exported comparators in `phase4_touchpoint_diff.js` (they share `tsMs`, tolerance, transport, join-rule, and fixture-filter utilities — a sibling file would re-import or copy all of it), plus a model selector in `run_phase4_diff.mjs` (e.g. `RUN_MODELS=pattern_b,last_touch,ai_platforms`, default all) with a per-model PASS/FAIL summary and an exit code that fails if ANY selected model fails. The runner's honest-coverage header and final log line must be updated in the same change — after this ships they'd otherwise still claim "NO diff harness exists," repeating the stale-header problem `phase4_touchpoint_diff.js:27-29` already exhibits (it still says "NOT YET RUN" after the recorded PASS).

**Scope estimate (task asks for a real confidence, so):** roughly **120–180 new lines** in `phase4_touchpoint_diff.js` (two fetchers, two comparators, tie/negative-case handling) and **40–60 lines** in the runner. This is **"extend one file (plus its runner)," not "build two new harnesses."**
- Confidence for 4c-diff: **HIGH** — every input was verified live this session (pipe deployed F1, fixtures present and field-correct F2/F4, tie intact F5, offsets inside tolerance F6, join key decided, HogQL source lines identified).
- Confidence for 4d-diff: **MEDIUM-HIGH** — same fixture/pipe verification holds (F1/F3/F4), Array wire-format proven (F9-adjacent, `7cd3140`), import side effects checked (F9); residual risks are the two named build-time items: the copied `pvSql` staying faithful (§5 drift), and `attribution-engine.js`'s import graph behaving in the tool context (checked lazy, but only build-time execution proves it).
- What would move 4d to HIGH: nothing plan-side — it's a build-and-run question.

---

## 4. Runtime requirements (founder-run — agents do NOT execute)

Existing six env vars from `run_phase4_diff.mjs:40-43`, plus two new per-pipe token values (auto-created at deploy per the token-model note, `SESSION_HANDOFF.md:123`):
- `PHASE4_LAST_TOUCH_READ_TOKEN` (backing `phase4_last_touch_read`)
- `PHASE4_PAGEVIEWS_BY_VISITORS_READ_TOKEN` (backing `phase4_pageviews_by_visitors_read`)

**Token-rotation interaction (orthogonal, not a blocker):** `SESSION_HANDOFF.md` §4 records 3+ exposed tokens pending rotation. The two per-pipe Phase-4 tokens above were not among the named exposures, but if the founder rotates workspace-wide, they simply supply the fresh values at run time — the harness reads them from env and never persists them, per the standing secrets rule.

---

## 5. STOP-gate check (per the established Phase-4 dispatch gate)

**No blocker requiring a STOP was identified.** Explicitly walked:
- **No DDL, no new datasource, no new `.pipe`** — both pipes are already deployed (F1).
- **No fixture firing, no writes to either store** — fixtures already exist in both (F2–F5). This plan's verification itself was read-only.
- **Execution is founder-run** — tokens/keys are founder-supplied secrets; same posture as every prior Phase-4/9 run.
- **Flagged, non-blocking:** (a) the tie-row ambiguity is pre-handled by 4C §4/§5's own rule (§2.2.4 above), so a disagreement there does not stall the run; (b) the two NEW literal SQL copies (last_touch inner subquery, ai `pvSql`) inherit the known U7 drift risk — same standing recommendation applies (extract shared SQL builders later; NOT done in this change, matching how the Pattern-B harness shipped); (c) **plan-vs-built divergence to keep in view:** the harness must target the DEPLOYED pipe semantics (per-field ASOF on `distinct_id`, F8), not the 4C §2.2 sketch (whole-row ASOF on `visitor_id`) — anyone reviewing against the 4C plan text alone would design the wrong comparator.

---

## 6. Build sequence (once approved)

1. Extend `fetchTinybirdRows` with repeated-param Array support (4d leg) — smallest, testable first.
2. 4c-diff: `fetchHogqlLastTouchPicks` + `diffLastTouchPicks` + tie-row handling.
3. 4d-diff: `fetchHogqlAiPageviews` + `diffAiPlatformCredits` + visitorS presence/no-credit guard, importing the real selector functions.
4. Runner: model selector, two new env vars in the guard, per-model summary, updated honest-coverage header/log lines (both files).
5. Founder runs; each model's output recorded (and this time, ideally, a raw output artifact committed or attached — the Pattern-B PASS exists only as a handoff-log quotation, which the orchestrator has already flagged as a weak evidence class).

## 7. What this plan does not do

- Does not write or modify any code, `.pipe`, or test file.
- Does not fire any HTTP request or ingest anything (all session checks were read-only reads of existing data).
- Does not cover the aggregate-layer diff (PHASE9 §4 U3 — still unbuilt, still separate), cross-store idempotency, or the `phase9-fixtures-v1` two-store ingestion question (U5).
- Does not resolve the U7 SQL-builder extraction — explicitly deferred again, consistent with how the Pattern-B harness shipped.

## 8. Open questions for founder + orchestrator

1. Approve **extend-in-place** (§3) over a sibling tool file?
2. Approve the **per-pipe-token** transport choice for the 4d leg (§2.3.2) over reusing the app's `queryTinybirdPipe`?
3. Should the founder run commit a raw output artifact this time (§6.5), given the Pattern-B PASS's evidence-class critique?
4. Token rotation (handoff §4) before or after this run — founder's sequencing call; the harness is indifferent (§4).
