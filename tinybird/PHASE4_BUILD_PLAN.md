# Phase 4 Build Plan — Row-Pull Rewrites (last_touch, linear, time_decay, u_shaped, w_shaped, ai_platforms)

> **Status: PLAN ONLY.** No `.pipe` files, no commits. Written to the working tree for founder + orchestrator review per the dispatch gate. Governing spec cited throughout is `tinybird/SCOPE_v3.md` (the `GATE3_RECONCILIATION_CONTRACT.md` referenced in the dispatch is still absent from the tree — flagged in Step 0, unchanged as of this plan).
>
> **Scope reminder:** Phase 4 swaps the **row-pull layer** (HogQL → Tinybird pipe) for these 6 models only. The allocation math (`calculateAttribution`, [attribution-engine.js:2886](../api/lib/attribution-engine.js#L2886)) is **not touched** — it is pure JS over a `touchpoints` array and is store-agnostic. Parity = "does the Tinybird pipe return the same touchpoint set the HogQL self-join/flat-pull did," not "does the math change." `first_touch` and the 2 `*_non_direct` variants are cutover-gate and **out of scope here** — not planned below.

---

## 0. Finding that reshapes the plan: these are 3 row-pull patterns, not 6

Before planning model-by-model, the actual current code does **not** have 6 distinct HogQL self-joins. Verified against the current tree:

| Pattern | Models served | Live function | Row-pull shape |
|---|---|---|---|
| **A — Correlated self-join** | `last_touch` | `lastTouchAttribution` ([engine:103-163](../api/lib/attribution-engine.js#L103)) | One HogQL query: `events e LEFT JOIN (per-conversion argMax(pv.* , pv.timestamp) WHERE pv.timestamp <= conversion.timestamp GROUP BY conversion_uuid) lt` — a true correlated subquery, computed server-side in SQL. |
| **B — Two flat windowed pulls + JS grouping** | `linear`, `u_shaped`, `time_decay`, `w_shaped` | `getMultiTouchAttributionLive` ([engine:1382](../api/lib/attribution-engine.js#L1382)) | (1) flat `$conversion` pull scoped to `site_id` + date range ([convSql, engine:1399](../api/lib/attribution-engine.js#L1399)); (2) flat `$pageview` pull scoped to `site_id` + lookback window, **not** filtered per-visitor ([pvSql, engine:1478](../api/lib/attribution-engine.js#L1478)). JS groups pageviews by `distinct_id`, windows them per conversion, calls `calculateAttribution` ([engine:2886](../api/lib/attribution-engine.js#L2886)), which only then branches into `linear` ([2934](../api/lib/attribution-engine.js#L2934)), `u_shaped` ([2943](../api/lib/attribution-engine.js#L2943)), `time_decay` ([2964](../api/lib/attribution-engine.js#L2964)), `w_shaped` ([3000](../api/lib/attribution-engine.js#L3000)) — **no SQL join difference between these 4 models, only JS math difference.** |
| **C — Two pulls, second is IN-list filtered + paginated** | `ai_platforms` | `getAiPlatformAttributionLive` ([engine:358](../api/lib/attribution-engine.js#L358)) | (1) flat `$conversion` pull ([convSql, engine:374](../api/lib/attribution-engine.js#L374)); (2) `$pageview` pull filtered to `distinct_id IN (<converted visitor batch>)` over the lookback window, chunked 100 visitors / paged 5000 rows ([engine:465-566](../api/lib/attribution-engine.js#L465)). JS does a single backward scan per conversion (`selectAiTouchForConversion`, [engine:310](../api/lib/attribution-engine.js#L310)). |

**Consequence for the build:** Phase 4 needs **3 Tinybird endpoint pipes**, not 6:
1. one correlated-join pipe for `last_touch`,
2. one shared conversions-pull + shared pageviews-pull pipe pair reused by `linear`/`u_shaped`/`time_decay`/`w_shaped` (model selection stays a JS-side parameter exactly as today — `getMultiTouchAttributionLive`'s `model` arg is unchanged),
3. one conversions-pull + IN-list-filtered pageviews-pull pipe pair for `ai_platforms`.

Per §6 of SCOPE_v3, all 3 are **`TYPE endpoint`** Tinybird pipes (backend-mediated, `site_id`-scoped, parameterized per-request) — **not** Tinybird's scheduled "Copy Pipe" primitive (which writes to a target datasource on a schedule and doesn't fit a live dashboard query). SCOPE_v3 §5 uses "Copy Pipe" loosely to mean "not an ingest-time MV"; the correct primitive here is the on-demand parameterized endpoint pipe, same family as the existing [bench_conversions_by_site.pipe](pipes/bench_conversions_by_site.pipe).

---

## 1. Risk ordering (as dispatched, justified — not reordered)

`time_decay → w_shaped → u_shaped → linear → last_touch → ai_platforms`

Row-pull risk for the 4 Pattern-B models is **identical** (same two pipes) — what actually differentiates their risk is **how sensitive each model's JS math is to small differences in the touchpoint set or timestamp precision** between PostHog's HogQL row format and Tinybird's typed `DateTime64(3)` columns:

- **`time_decay`** — continuous exponential weight (`0.5^(daysBack/7)`, [engine:2985](../api/lib/attribution-engine.js#L2985)). Any timestamp rounding/timezone handling difference between the two stores shows up directly as a fractional weight drift, not a discrete reclassification — hardest to get byte-exact. Highest risk, first.
- **`w_shaped`** — 3 positional anchors (first / middle / last, [engine:3017-3018](../api/lib/attribution-engine.js#L3017)). The "middle" index is `floor((len-1)/2)` — sensitive to touchpoint *count* AND *order*; if the pipe includes/excludes one boundary pageview differently than HogQL did, the middle anchor can shift to a different touch entirely.
- **`u_shaped`** — same boundary sensitivity as w_shaped but only 2 anchor positions (first/last), which are the most boundary-stable indices (first/last survive set-size-by-one differences; middle does not). Lower risk than w_shaped.
- **`linear`** — pure count-based equal split (`1/len`, [engine:2934](../api/lib/attribution-engine.js#L2934)), order-independent. A touchpoint-set mismatch shifts the fraction uniformly for all touches rather than reclassifying credit to a different touch — lowest sensitivity of the 4 Pattern-B models.
- **`last_touch`** — different pipe entirely (Pattern A, correlated join) so the *build* risk is concentrated in getting the join semantics right, not in allocation drift. Once the join is correct, it's a single deterministic "last pageview before this timestamp" pick — no fractional math to drift.
- **`ai_platforms`** — lowest risk. `selectAiTouchForConversion` ([engine:310](../api/lib/attribution-engine.js#L310)) already does its own explicit in-window backward scan; the failure mode is binary (right platform credited, or not) rather than continuous, and it's the only model with an existing IN-list/pagination precedent to mirror.

---

## 2. Per-model plan

### 2.1 `time_decay` (highest risk — build first)

1. **HogQL it replaces:** Not a self-join — Pattern B. Row-pull is `getMultiTouchAttributionLive` ([engine:1382](../api/lib/attribution-engine.js#L1382)): convSql ([engine:1399](../api/lib/attribution-engine.js#L1399)) + pvSql ([engine:1478](../api/lib/attribution-engine.js#L1478)). The `time_decay`-specific code is JS-only ([engine:2964-2997](../api/lib/attribution-engine.js#L2964)) and is **not rewritten** — it consumes whatever `touchpoints` array the row-pull produces, store-agnostic.
2. **Tinybird approach:** Build the **shared Pattern-B pipe pair** (this is the one model that forces the pair into existence; w_shaped/u_shaped/linear then reuse it for free):
   - `conversions_by_site` endpoint pipe: `SELECT event_id, distinct_id, timestamp, conversion_value, conversion_type, utm_source, utm_medium, utm_campaign, referrer, ai_source, country, device_type, utm_term, provider, attribution_status, stitching_method, ingestion_method FROM events WHERE site_id = {{String(site_id, required=True)}} AND event_type = '$conversion' AND timestamp >= {{DateTime(date_from, required=True)}} AND timestamp < {{DateTime(date_to, required=True)}} ORDER BY timestamp DESC LIMIT 10000` — direct map of convSql onto the typed `events` table (`properties.x` → `x`), same sort key (`site_id, timestamp`) the table is built on.
   - `pageviews_windowed_by_site` endpoint pipe: same shape as `pvSql` ([engine:1478](../api/lib/attribution-engine.js#L1478)) — `event_type = '$pageview'`, `timestamp >= {{DateTime(lookback_from)}}`, `timestamp < {{DateTime(date_to)}}`, `site_id` scoped. No visitor filter, matching today's behavior exactly (flat scan, not a join). `custom_param:*` SELECT columns become `JSONExtractString(properties, '<key>')` per §2.6's dynamic-custom-param note.
   - JS orchestration layer (groups pageviews by `distinct_id`, windows per conversion, calls `calculateAttribution`) is **unchanged** — only the two `queryHogQL(...)` calls are swapped for two pipe HTTP calls.
3. **Late-arriving conversion handling (required detail):** `time_decay`'s weight is computed from `conv.timestamp` ([engine:2965](../api/lib/attribution-engine.js#L2965), `lastTouchpoint.timestamp` is actually used as the decay anchor — note: it's the **last touchpoint's** timestamp, not the conversion's own timestamp; confirm this against PostHog behavior byte-for-byte in the golden test, since it's a subtle existing-code detail, not something Phase 4 should "fix"). Because this is an **on-demand windowed pipe call, not an ingest-time MV** (per SCOPE_v3 §5's explicit "do-not-MV" rule), a conversion that lands in Tinybird after its pageviews does **not** corrupt anything structurally — the pipe is queried fresh per request and will simply include the conversion once it's been ingested (Events API: queryable <4s, SCOPE_v3 §3.2). The actual risk is **query-time staleness**: if the dashboard is queried in the gap between "pageviews ingested" and "conversion ingested," the conversion (and its decay weights) will be momentarily absent from both stores — this is symmetric with PostHog's existing behavior today, not a regression. The golden test below must include a fixture where the conversion event is dual-written with a deliberate few-second delay after its pageviews, and the query is run only after both have landed (not mid-gap), to isolate "is the math right" from "was the query run too early."
4. **Golden-output test shape:**
   - *Fixture → expected allocation:* reuse the existing deterministic unit-test path (`calculateAttribution` is already covered by `api/tests/attribution.test.js`) — Phase 4 doesn't need new fixture-level math tests, since the math is unchanged. What Phase 4 needs is **touchpoint-set parity**: for the gating site `de200000-...441111`, pull the touchpoint set from (a) the live HogQL `pvSql`/`convSql` pair and (b) the new Tinybird pipe pair, for the **same model+window**, normalize both to `(distinct_id, timestamp, utm_source, utm_medium, utm_campaign, ai_source, referrer)` tuples, sort, and diff.
   - *Diff method:* row-set diff is **exact** tier (not the ~0.5% `uniq()` tier — these are row-level Copy/endpoint pipes returning typed exact rows, not `uniq()`-aggregated MVs; the 0.5% tolerance in SCOPE_v3 §5/§14 applies to approximate cardinality MVs, which Phase 4 does not build). If the touchpoint sets match exactly, feed both through the **same** `calculateAttribution` call and assert the output allocation arrays are byte-identical (this isolates "did the pipe pull the same rows" from "does the math agree," which it must, since it's literally the same function call).
5. **Blocker check:** none identified for the pipe build itself (schema already has every needed column per §2.6; dual-write is already flag-gated live on the gating site per the orchestrator's Step-0 confirmation). **STOP-and-ask if:** the late-arrival fixture above requires a *new* synthetic conversion beyond what's already flowing through the existing dual-write window — that's seed data and needs founder go-ahead, not something to self-generate.

### 2.2 `w_shaped`

1. **HogQL it replaces:** Same Pattern B row-pull as 2.1 (`getMultiTouchAttributionLive`). Model-specific JS: [engine:3000-3028](../api/lib/attribution-engine.js#L3000) (30/30/30/10 anchors).
2. **Tinybird approach:** **No new pipe** — reuses the `conversions_by_site` + `pageviews_windowed_by_site` pair built in 2.1. This entry exists to confirm there is nothing w_shaped-specific to build at the row-pull layer.
3. **Late-arriving conversion handling:** same mechanism as 2.1 (on-demand pipe, not MV — late conversion is absent until ingested, not corrupting). w_shaped doesn't do continuous decay, so it's less sensitive to *when* exactly the conversion timestamp lands, but it **is** sensitive to the touchpoint *count* changing the middle-anchor index — the golden test must specifically include touchpoint counts that straddle an odd/even boundary (3, 4, 5 touches) since `middleIdx = floor((len-1)/2)` changes discretely.
4. **Golden-output test shape:** identical method to 2.1 — touchpoint-set exact diff, then identical `calculateAttribution` call, assert byte-identical `w_shaped` array. Add explicit fixture cases at touchpoint counts {1, 2, 3, 4, 5} to pin the anchor-index boundary behavior ([engine:3001-3016](../api/lib/attribution-engine.js#L3001) has distinct code paths for length 1/2/3 vs ≥4).
5. **Blocker check:** none — depends only on 2.1's pipe pair existing.

### 2.3 `u_shaped`

1. **HogQL it replaces:** Same Pattern B row-pull. Model-specific JS: [engine:2943-2961](../api/lib/attribution-engine.js#L2943) (40/20/40 anchors).
2. **Tinybird approach:** **No new pipe** — reuses 2.1's pair.
3. **Late-arriving conversion handling:** same as 2.1/2.2. First/last anchors are more boundary-stable than w_shaped's middle anchor, but the golden test should still cover {1, 2, 3+} touchpoint counts since u_shaped also branches on length ([engine:2944-2952](../api/lib/attribution-engine.js#L2944)).
4. **Golden-output test shape:** same method as 2.1/2.2, fixture counts {1, 2, 3, 5}.
5. **Blocker check:** none — depends on 2.1's pair.

### 2.4 `linear`

1. **HogQL it replaces:** Same Pattern B row-pull. Model-specific JS: [engine:2934-2940](../api/lib/attribution-engine.js#L2934) (equal split).
2. **Tinybird approach:** **No new pipe** — reuses 2.1's pair. Lowest-risk of the 4 Pattern-B models because the math is order/position-independent — a touchpoint-set mismatch degrades gracefully (uniform fraction shift) rather than reclassifying credit.
3. **Late-arriving conversion handling:** same mechanism as above; linear's equal-split math means a late-arriving-conversion query-time gap produces the smallest possible distortion of the 4 (no anchor to misplace).
4. **Golden-output test shape:** same method, fixture counts {1, 2, 5} sufficient (no boundary-index logic to pin).
5. **Blocker check:** none.

### 2.5 `last_touch`

1. **HogQL it replaces:** Pattern A — the genuine correlated self-join, `lastTouchAttribution` ([engine:103-163](../api/lib/attribution-engine.js#L103)): for each `$conversion`, `LEFT JOIN` a subquery doing `argMax(pv.utm_source/medium/campaign/ai_source, pv.timestamp) WHERE pv.timestamp <= conversion.timestamp GROUP BY conversion_uuid`.
2. **Tinybird approach:** This is the one model that needs genuinely new join logic, not pipe reuse. Two viable shapes, pick at build time after a Free-tier scan-shape check (§0.3/§0.4 of SCOPE_v3):
   - **(a) Correlated join, ported as-is:** same `events e LEFT JOIN (per-uuid argMax subquery) lt ON e.event_id = lt.conversion_event_id` structure, run against `events_by_visitor` (sorted `site_id, visitor_id, timestamp`) for the inner pageview scan instead of raw `events` — the visitor-ordered sort key should make the `pv.timestamp <= conversion.timestamp` + `argMax` scan cheap per visitor, which the base `events` table (sorted `site_id, timestamp`) can't offer.
   - **(b) Two-pass app-side (fallback if (a) trips the deploy-time guardrail or scans poorly on Free tier):** pull conversions flat (Pattern-B style) + pull all pageviews for those visitors from `events_by_visitor` (IN-list, mirroring `ai_platforms`'s pattern), then do the `argMax`-equivalent ("last pageview at/before this conversion's timestamp") in JS — structurally identical to `selectAiTouchForConversion` but picking by recency instead of by AI-platform-match.
   - Recommend starting with (a) since it's a direct semantic port and `events_by_visitor` exists specifically for this; fall back to (b) only if Free-tier scan-shape validation (§0.3) shows it's too expensive — this is an empirical decision to make during build, not in this plan.
3. **Late-arriving conversion handling:** last_touch doesn't do continuous decay, so timestamp precision matters only at the boundary (`pv.timestamp <= conversion.timestamp` — an off-by-a-few-ms tie could pick a different "last" pageview if PostHog and Tinybird round timestamps differently). Confirm `DateTime64(3)` (millisecond) precision in `events`/`events_by_visitor` matches PostHog's stored timestamp precision for the gating site's dual-written rows — if PostHog truncates to seconds anywhere in its read path, ties could break differently between the two stores. Flag this as a specific golden-test assertion, not just a general note.
4. **Golden-output test shape:** same touchpoint-set-exact-diff method, but here the "touchpoint set" being diffed is the **single picked last-touchpoint per conversion** (not a full touchpoints array) — diff `(conversion_event_id → picked pageview's utm_source/medium/campaign/ai_source)` pairs between HogQL and the Tinybird pipe, exact tier. Include a tie-breaking fixture (two pageviews within 1ms of each other) to pin precision behavior explicitly.
5. **Blocker check:** none for schema/data. **Possible STOP-and-ask:** if approach (a)'s correlated join trips Tinybird Forward's deploy-time guardrail or the Free-tier scan-shape check is inconclusive without a higher tier, that's an empirical/plan-upgrade question (§0.3) for the founder, not something to route around by self-upgrading a Tinybird plan tier.

### 2.6 `ai_platforms` (lowest risk — build last)

1. **HogQL it replaces:** Pattern C, `getAiPlatformAttributionLive` ([engine:358](../api/lib/attribution-engine.js#L358)): convSql ([engine:374](../api/lib/attribution-engine.js#L374)) + chunked/paginated `distinct_id IN (...)` pvSql ([engine:471-503](../api/lib/attribution-engine.js#L471)). Model-specific JS: `selectAiTouchForConversion` ([engine:310-347](../api/lib/attribution-engine.js#L310)).
2. **Tinybird approach:** New pipe pair (distinct from 2.1's, because the pageview side is IN-list-filtered, not a flat date-range scan):
   - `conversions_by_site` — same as 2.1's (can literally be the same pipe; the SELECT column list differs slightly today — `browser_name`/`browser`/`page_url` are extra in `convSql` at [engine:393-395](../api/lib/attribution-engine.js#L393) — confirm at build time whether to widen 2.1's pipe to a superset column list or keep two thin pipes; lean toward one superset pipe to avoid duplication).
   - `pageviews_by_visitors` endpoint pipe: `SELECT ... FROM events_by_visitor WHERE site_id = {{String(site_id, required=True)}} AND event_type = '$pageview' AND timestamp >= {{DateTime(lookback_from, required=True)}} AND timestamp < {{DateTime(date_to, required=True)}} AND visitor_id IN {{Array(visitor_ids, 'String', required=True)}} ORDER BY timestamp ASC` — use `events_by_visitor` (sorted `site_id, visitor_id, timestamp`) rather than `events`, since the query is now visitor-keyed, not time-range-keyed; this is a strict win over today's HogQL version (no chunking/pagination needed — Tinybird's `{{Array(...)}}` param plus the visitor-sorted table should handle the full IN-list in one call, but confirm against the Free-tier req/sec and row-scan limits in §0.3/§15 before dropping the chunking entirely).
3. **Late-arriving conversion handling:** same on-demand-pipe reasoning as 2.1 — no MV, so no structural risk. `selectAiTouchForConversion`'s own explicit window math ([engine:315-318](../api/lib/attribution-engine.js#L315)) is unaffected by which store the rows came from.
4. **Golden-output test shape:** diff `(conversion_event_id → credited_platform)` pairs between HogQL and Tinybird-pipe outputs for the gating site, exact tier (binary credit, not fractional — easiest model to get a clean pass/fail on). Include a fixture with >100 converting visitors specifically to validate the IN-list approach replaces chunking/pagination correctly (today's code chunks at 100 visitors / pages at 5000 rows purely as a PostHog HogQL workaround — confirm the Tinybird version doesn't need the same workaround, or document why it still does).
5. **Blocker check:** none identified. Note for build time, not a blocker: confirm Tinybird Forward's `{{Array(...)}}` param has no practical size cap that would reintroduce a chunking need at the gating site's actual visitor volume.

---

## 3. Explicitly out of scope for Phase 4

- **`first_touch`** (cookie-vs-recompute fork) — cutover-gate per the dispatch, not planned here.
- **`first_touch_non_direct` / `last_touch_non_direct`** ([engine:173-289](../api/lib/attribution-engine.js#L173)) — cutover-gate, not planned here.
- **Nightly Supabase rollup** (`nightly-attribution.js`) — SCOPE_v3 §13's Phase-4 row literally says "last-touch, linear, time-decay, **nightly**," but the dispatch's gating golden is explicitly the **live HogQL path** on one site, not the nightly rollup. Flagging the discrepancy rather than silently resolving it: nightly-attribution row-pull rewrite is a separate decision the founder/orchestrator should make explicitly, not bundled into this gate.
- Building/deploying any `.pipe` file — this document is the plan only.

---

## 4. Summary: what actually gets built in Phase 4

3 endpoint pipes total (not 6):
1. `last_touch_pageview_join` (or equivalent) — Pattern A, new correlated-join logic.
2. `conversions_by_site` + `pageviews_windowed_by_site` — Pattern B, shared by `time_decay`/`w_shaped`/`u_shaped`/`linear`.
3. `conversions_by_site` (shared/superset with #2) + `pageviews_by_visitors` — Pattern C, for `ai_platforms`.

All JS allocation math (`calculateAttribution`, `selectAiTouchForConversion`) stays exactly as-is. The reconciliation harness diffs **touchpoint sets**, not allocation math, since the math is provably unchanged once the row-pull is proven to return the same rows.
