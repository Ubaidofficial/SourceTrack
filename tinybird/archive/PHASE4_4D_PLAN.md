# Phase 4d — `ai_platforms` (Pattern C) Build + Fixture Plan

> **Status: PLAN ONLY.** No `.pipe` files, no commits, no firing. Written for founder + orchestrator review before any build work.

---

## 1. The 4c lesson, applied: does Pattern C have the same null-skip risk?

Read `selectAiTouchForConversion` ([engine:310-347](../api/lib/attribution-engine.js#L310)) and `detectAiPlatformFromEvent` ([channel-classifier.js:103-134](../api/lib/channel-classifier.js#L103)) in full before answering.

**Answer: No — confirmed by reading the code, not assumed.** Pattern C's selection is **JS array iteration, not SQL `argMax`.** `selectAiTouchForConversion` sorts the in-window touchpoints ascending, then scans **backward** and returns the **first whole touchpoint object** (`{ touch: pv, type: 'journey_touchpoint', platform }`) where `detectAiPlatformFromEvent(pv)` matches. `detectAiPlatformFromEvent` itself reads `ai_source`, `utm_source`/`source`/`derived_source`, and `referrer`/`page_url` **all from that one passed-in object** — there is no per-column independent aggregation anywhere in this path, so there is no mechanism by which fields from two different touches could get fused together the way Pattern A's `argMax(column, timestamp)` did. **Whatever touch is picked, all of its fields come from that one real row.**

**Consequence for the build:** Pattern C is structurally closer to **Pattern B** than Pattern A — `selectAiTouchForConversion` is shared, unchanged JS that runs identically over whatever touchpoint array it's given, exactly like `calculateAttribution`. The migration's job is purely the **row-pull**: deliver the same IN-list-filtered pageview set Tinybird-side that HogQL's `pvSql` ([engine:471-503](../api/lib/attribution-engine.js#L471)) delivers today. If the row sets match, feeding them through the same unchanged function necessarily produces the same credited platform — no new selection-logic risk to port.

---

## 2. The Pattern-C pipe pair

### 2.1 Conversions pull — reuse, not rebuild

`ai_platforms`'s `convSql` ([engine:374-403](../api/lib/attribution-engine.js#L374)) selects a superset of Pattern B's conversion columns (adds `browser_name`, `browser`, `page_url`). **[`conversions_by_site.pipe`](pipes/conversions_by_site.pipe), already built in 4a, already includes `browser_name` and `page_url`** — confirmed by re-reading the committed file, not assumed. No new conversions pipe needed for 4d.

### 2.2 Pageviews pull — new, IN-list-filtered

HogQL's `pvSql` ([engine:471-503](../api/lib/attribution-engine.js#L471)) filters `distinct_id IN (<chunk of up to 100 converted visitors>)`, paginated 5000 rows/page, over the site's lookback window. New pipe `pageviews_by_visitors.pipe`, same column list as [`pageviews_windowed_by_site.pipe`](pipes/pageviews_windowed_by_site.pipe) (already exists from 4a — exact same `utm_*`/click-id/`referrer`/`ai_source`/`page_url`/`utm_term` set), sourced from `events_by_visitor` (visitor-sorted, matching an IN-list-by-visitor query shape) instead of `events`, filtered by `{{ Array(visitor_ids, 'String', required=True) }}` instead of a flat date range.

### 2.3 Does `{{Array(...)}}` replace the chunk-at-100/page-at-5000 workaround?

**Not assuming yes.** That workaround exists in the live HogQL path for reasons I can't fully attribute to PostHog's query-size limits vs. something else without testing — and per the 4c lesson, "should structurally work" isn't the same as "does work," demonstrated concretely by A-2 getting rejected outright. This needs the same build-time empirical check, not an assumption baked into the plan:
- Validate `{{Array(...)}}` accepts a representative IN-list size (the gating site's actual converted-visitor count for a realistic window — likely small, low tens, given it's a demo/test site, but should be tested at a size closer to production scale, e.g. a few hundred synthetic ids, before concluding the chunking is fully unnecessary).
- If Tinybird's templating or the Events/Query API imposes its own array-size or request-size cap, the chunking workaround may still be needed Tinybird-side — in which case it ports directly (same 100-visitor-chunk loop, just calling the pipe instead of `queryHogQL` per chunk).
- This is explicitly **not** resolved by the tier finding (Enterprise removes vCPU/req-rate concerns, not necessarily array-templating/request-size limits) — different category of limit, flagging separately rather than conflating the two findings.

---

## 3. Golden-diff method

Per conversion: `(conversion_event_id, distinct_id) → credited_platform` (binary: a platform name, or no-credit), diffed **exact-tier** between live HogQL (`getAiPlatformAttributionLive`) and the Tinybird pipe pair feeding the same unchanged `selectAiTouchForConversion`.

**Interval rule applies to any timestamp surfaced** (e.g. a diagnostic "gap between credited AI touch and conversion") — per `GATE3_RECONCILIATION_CONTRACT.md`, not an absolute-timestamp comparison.

**Secondary check, learned from 4c — verify, don't assume the JS-only framing is airtight:** even though §1 establishes no per-field fusion risk, the golden-diff should still confirm at the **row level** (not just the final credited-platform label) that the touchpoint *set* each leg hands to `selectAiTouchForConversion` is identical — same defense used in 4a/4b, cheap to do, and it's exactly the kind of "should be fine" assumption 4c proved worth checking empirically rather than trusting the structural argument alone.

---

## 4. Fixture — extends the `de200000` pattern, 4 visitors, pinning the specific behaviors that distinguish `ai_platforms` from plain `last_touch`

All backdated post-`af82218`, fired through `/api/track` + `/api/conversion` only (timestamp control), single-identity (`anonymous_id` only, no `visitor_id`/`user_id` override — see §5).

| Visitor | Touches | Conversion | What it pins |
|---|---|---|---|
| `cc-4d-visitorP` | T0(ChatGPT referrer), T0+10m(google/cpc, **chronologically last**) | T0+20m | **AI touch is NOT the last touch** — `last_touch` would credit `google`; `ai_platforms` must scan backward past the non-AI last touch and still credit `ChatGPT`. The headline behavioral difference this model exists for. |
| `cc-4d-visitorQ` | T0(facebook/paid_social), T0+10m(Perplexity referrer, **chronologically last**) | T0+20m | Baseline: AI touch *is* the last touch — simplest case, should agree with both models. |
| `cc-4d-visitorR` | T0(ChatGPT referrer), T0+10m(Perplexity referrer, **chronologically last AI touch**), T0+15m(direct, no signal) | T0+25m | **Two different AI platforms in one journey** — must credit the most-recent one scanned backward (Perplexity), not the first AI touch encountered (ChatGPT) and not get confused by the trailing non-AI touch. |
| `cc-4d-visitorS` | T0(google/cpc), T0+10m(direct, no utm, no referrer) | T0+20m | **No AI signal anywhere in the journey.** Must NOT appear in either store's `ai_platforms` result — confirms `selectAiTouchForConversion` correctly returns no match (and the conversion-fallback check also correctly finds nothing), rather than mis-crediting a non-AI touch. |

Order ids: `cc-4d-p-order-1`, `cc-4d-q-order-1`, `cc-4d-r-order-1`, `cc-4d-s-order-1`. `T0` anchored 3 days before actual firing time, same mechanism as 4a/4c (`sanitizeClientTimestamp`'s 90-day-past bound, all offsets ≤25 minutes, no future-bound risk).

---

## 5. Single-identity scope — stated again, not assumed inherited

Same limitation as 4c, restated explicitly per the standing instruction not to let a sign-off silently imply more than it covers: this fixture validates `distinct_id == visitor_id` only. The IN-list itself is built from converted `distinct_id`s in the live HogQL path ([engine:454](../api/lib/attribution-engine.js#L454), `conversions.map(c => c.distinct_id)`) — if the Tinybird pipe's IN-list parameter is instead built from `visitor_id`s (to match `events_by_visitor`'s sort key, mirroring 4c's reasoning), that's an additional `distinct_id`-vs-`visitor_id` substitution this fixture won't catch for merged identities, on top of the one already flagged in 4c. Recording it here rather than letting it ride silently into a second pipe.

---

## 6. DDL / seed check (STOP-and-ask gate)

**No DDL, no new datasource.** `pageviews_by_visitors.pipe` reads `events_by_visitor`, already deployed with every needed column. **A new pipe-scoped `READ` token is needed** (same routine category as the 4a/4b/4c tokens) — not a STOP. **Fixture firing is data on `de200000`**, same already-approved category. No blocker identified.

---

## 7. What this plan does not do

- Does not write or push any `.pipe` file.
- Does not fire any HTTP request.
- Does not resolve the `{{Array(...)}}` vs chunking question — explicit build-time empirical item (§2.3).
- Does not address the `visitor_id`-vs-`distinct_id` IN-list-construction question definitively — flagged in §5 for build-time decision, with the 4a `events.datasource` `visitor_id`/`distinct_id` mapping already documented as the relevant background.
