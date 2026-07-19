# Phase 4c — `last_touch` (Pattern A Correlated Join) Build + Fixture Plan

> **Status: PLAN ONLY.** No `.pipe` files, no commits, no firing. Written for founder + orchestrator review before any build work, per the dispatch gate.

---

## 1. Tier check (read-only, done first)

```
tb --cloud workspace current
```
```
name: ST_Staging        plan: Enterprise   current: True
name: SourceTrack        plan: Enterprise   (prod)
name: imubaid93_workspace plan: Enterprise
```

**Confirmed: Enterprise, not Free**, on both `ST_Staging` and prod `SourceTrack`.

**Implication:** [PHASE4_BUILD_PLAN.md §2.5](PHASE4_BUILD_PLAN.md) hedged approach (a) (correlated join) against "Free-tier scan limits," with approach (b) (app-side two-pass) as the fallback if (a) "trips the deploy-time guardrail or scans poorly on Free tier." That hedge is moot — there is no Free-tier vCPU/req-limit ceiling to scan poorly against. **Approach (a) is the clear, unhedged choice.** I'm not deleting the two-pass fallback from the record (it's a legitimate fallback for a *different* reason — if the correlated-join SQL itself trips Tinybird's deploy-time guardrail on structural grounds, independent of plan tier — but it's no longer the tier-driven hedge it was written as.

**Separately flagged, not fixed here:** `SCOPE_v3.md` §0.3 ("Plan reality (org-wide Free)") is now factually stale — it asserts `imubaid93` org = Free with 1k req/day / 10GB / 0.25 vCPU limits, contradicted by this read. Per [CLAUDE.md §12](../CLAUDE.md) authority order, I'm surfacing this conflict rather than silently editing the doc — that's a separate, explicit correction for the founder/orchestrator to make.

---

## 2. The correlated-join pipe design

### 2.1 What it replaces

`lastTouchAttribution` ([engine:103-163](../api/lib/attribution-engine.js#L103)): for each `$conversion`, a `LEFT JOIN` to a subquery doing `argMax(pv.utm_source/medium/campaign/ai_source, pv.timestamp) WHERE pv.timestamp <= conversion.timestamp GROUP BY conversion_uuid` — joined on `pv.distinct_id = e_inner.distinct_id`.

### 2.2 Two candidate ClickHouse constructs — both need build-time validation, not assumed

**Candidate A-1 (recommended primary): `ASOF LEFT JOIN`.** ClickHouse's purpose-built primitive for exactly this "closest match by timestamp, scoped by an equality key" pattern — `ON equi_cond AND closest_cond`, e.g. `ON conv.visitor_id = pv.visitor_id AND pv.timestamp <= conv.timestamp`. Two reasons this fits better than a literal HogQL port:
- ClickHouse's classic JOIN engines have historically restricted non-equality `ON` conditions (the HogQL nested-`argMax` shape works in PostHog's query layer because HogQL translates it under the hood — that translation isn't guaranteed to carry over unchanged to raw Tinybird/ClickHouse SQL).
- `ASOF JOIN` requires the right-hand table to be sorted by the `closest_cond` column within each equality group — `events_by_visitor`'s sort key (`site_id, visitor_id, timestamp`) is *already exactly that shape*. This isn't a coincidence to exploit after the fact; it's why that projection exists.

**Candidate A-2 (fallback): literal nested `LEFT JOIN` + `argMax`, structurally mirroring `lastTouchAttribution`'s own SQL.** Lower conceptual risk (it's a direct translation, easier to reason about why it *should* match), but carries the equality-condition-in-JOIN risk above, unverified for Tinybird specifically.

**Sketch (A-1, for design review — not yet validated against the live schema):**

```sql
NODE last_touch_by_site_node
SQL >
    %
    SELECT
        conv.event_id AS conversion_event_id,
        conv.distinct_id,
        conv.visitor_id,
        conv.timestamp AS conversion_timestamp,
        conv.conversion_value,
        pv.utm_source,
        pv.utm_medium,
        pv.utm_campaign,
        pv.ai_source,
        pv.timestamp AS last_touch_timestamp
    FROM
    (
        SELECT event_id, distinct_id, visitor_id, timestamp, conversion_value
        FROM events
        WHERE site_id = {{ String(site_id, required=True) }}
          AND event_type = '$conversion'
          AND timestamp >= {{ DateTime(date_from, required=True) }}
          AND timestamp < {{ DateTime(date_to, required=True) }}
    ) AS conv
    ASOF LEFT JOIN
    (
        SELECT visitor_id, timestamp, utm_source, utm_medium, utm_campaign, ai_source
        FROM events_by_visitor
        WHERE site_id = {{ String(site_id, required=True) }}
          AND event_type = '$pageview'
    ) AS pv
    ON conv.visitor_id = pv.visitor_id AND pv.timestamp <= conv.timestamp
    ORDER BY conv.timestamp DESC
```

**Decision rule for which candidate ships:** build both behind `tb sql --cloud` (read-only validation, no push), run the tie-break fixture (§4) against both, and ship whichever matches HogQL's actual empirical tie-break behavior — not whichever seems theoretically cleaner. This is an explicit "don't assume" gate, same posture as the rest of this dispatch.

### 2.3 Visitor-ordered sort key — why it's cheap, confirmed structurally not assumed

`events_by_visitor`'s `ENGINE_SORTING_KEY "site_id, visitor_id, timestamp"` ([events_by_visitor.datasource:65](datasources/events_by_visitor.datasource#L65)) means, for a fixed `(site_id, visitor_id)`, rows are physically timestamp-ordered on disk. Both candidate join shapes (`ASOF JOIN`'s requirement, and `argMax`'s effective per-group scan) want exactly that ordering to avoid a full unsorted scan per conversion. This is the entire reason this projection was built in Phase 3 ([events_by_visitor_mv.pipe](pipes/events_by_visitor_mv.pipe)) ahead of needing it here — confirmed, not assumed, by reading the projection's own sort key against what the join needs.

### 2.4 `distinct_id` vs `visitor_id` — a mapping risk flagged, not silently assumed away

HogQL's `lastTouchAttribution` joins on `distinct_id`. The sketch above joins on `visitor_id` (matching the sort key). Per `normalize.js`: `out.visitor_id = (src.visitor_id ?? src.anonymous_id) || distinctId` and `out.distinct_id = (src.distinct_id ?? src.distinctId ?? src.anonymous_id) || randomUUID()`. For this fixture's producers (`/api/track`, `/api/conversion`, only `anonymous_id` set, no separate `visitor_id`/`user_id` override), these two resolve to the **same value** — so this fixture will not surface a divergence even if one exists elsewhere in the system (e.g. `server-events.js`'s `POST /api/event`, which accepts `user_id` separately and could in principle produce a different `visitor_id` than `distinct_id` for an identified user). Flagging this as a **known scope limitation of 4c**, not closing it here — a future fixture exercising an identify/user_id-merged journey would be the right place, analogous to how 4a deferred cross-visitor-bleed to 4c.

---

## 3. Cross-visitor-bleed fixture (now load-bearing — closing the 4a deferral)

Two visitors, **fully interleaved** in wall-clock/stored time, each with their own conversion bracketed by the *other* visitor's touch — designed so a join that drops or mishandles the `visitor_id`/`distinct_id` equality condition produces a **wrong, detectable** answer, not a silently-correct one.

All times as offsets from a `T0` anchored in the past (same backdating mechanism as 4a — see §5).

| Time | Visitor | Event | Fields |
|---|---|---|---|
| `T0` | `cc-4c-visitorX` | touch1 | `utm_source=google, utm_medium=cpc` |
| `T0+1m` | `cc-4c-visitorY` | touch1 | `utm_source=facebook, utm_medium=paid_social` |
| `T0+2m` | `cc-4c-visitorX` | touch2 | `utm_source=newsletter, utm_medium=email` ← **X's true last touch** |
| `T0+3m` | `cc-4c-visitorY` | touch2 | `utm_source=` *(direct, no utm)* — **interleaved bleed bait for X**: chronologically between X's true last touch and X's conversion |
| `T0+4m` | `cc-4c-visitorX` | **conversion** (`cc-4c-x-order-1`) | A correctly-scoped join picks X's touch2 (newsletter, `T0+2m`). A bleed bug picks Y's touch2 (direct, `T0+3m`) instead — wrong visitor, wrong source, easy to catch. |
| `T0+5m` | `cc-4c-visitorY` | touch3 | **AI-source**: `Referer: https://chatgpt.com/` → `ai_source=ChatGPT` ← **Y's true last touch** |
| `T0+6m` | `cc-4c-visitorX` | touch3 | **AI-source**: `Referer: https://www.perplexity.ai/` → `ai_source=Perplexity` — **interleaved bleed bait for Y**: chronologically between Y's true last touch and Y's conversion |
| `T0+7m` | `cc-4c-visitorY` | **conversion** (`cc-4c-y-order-1`) | A correctly-scoped join picks Y's touch3 (ChatGPT, `T0+5m`). A bleed bug picks X's touch3 (Perplexity, `T0+6m`) instead. |

Both directions tested: X's conversion is bracketed by Y's data, Y's conversion is bracketed by X's data — a one-directional fixture would only catch a bug that happened to manifest one way.

---

## 4. Timestamp tie-break fixture

A genuine tie at `DateTime64(3)` precision requires **identical millisecond values**, not "1ms apart" — two events 1ms apart are distinguishable and unambiguous under ms-precision storage (the later one simply wins, no real ambiguity). I'm treating "within 1ms" as covering the **harder, actually-ambiguous case** (exact tie) rather than literally firing two events 1ms apart, which wouldn't test what the dispatch is actually after. Both `ClickHouse argMax` ("if there are multiple maximal values, returns the first encountered" — order-dependent, not value-deterministic) and `ASOF JOIN` on a tied boundary have the same category of unspecified tie-break behavior — neither primitive has a documented guarantee here, which is exactly why this needs an empirical fixture rather than a spec read.

| Time | Visitor | Event | Fields |
|---|---|---|---|
| `T0` (exact) | `cc-4c-visitorZ` | touch1 | `utm_source=google, utm_medium=cpc` |
| `T0` (**exact same timestamp**) | `cc-4c-visitorZ` | touch2 | `utm_source=facebook, utm_medium=paid_social` — the tie pair, distinguishable only by source |
| `T0+5m` | `cc-4c-visitorZ` | **conversion** (`cc-4c-z-order-1`) | Tests whether HogQL and the Tinybird pipe pick the *same* one of the two tied touches |

**If HogQL and Tinybird disagree on this specific row:** that is reported as a known-ambiguous case requiring an explicit deterministic tiebreaker (e.g. `argMax(value, (timestamp, event_id))` tuple ordering on both sides), not assumed to be a regression the way a mismatch on any non-tied row would be. The golden-diff method (§5) treats this row separately from the rest for that reason.

---

## 5. Golden-diff method

Per conversion, diff: `(conversion_event_id, distinct_id) → (picked_touch.utm_source, picked_touch.utm_medium, picked_touch.utm_campaign, picked_touch.ai_source)` between the live HogQL `lastTouchAttribution` subquery and the Tinybird pipe, **exact-tier** (binary: right touch picked or not — no fractional allocation math involved in `last_touch`, so no tolerance question there).

**Interval rule applied per `GATE3_RECONCILIATION_CONTRACT.md`:** the diff above doesn't require comparing absolute timestamps at all — touch *identity* (which row was picked) is established from content fields, not timestamps. If the harness additionally reports a diagnostic "gap between picked touch and conversion," that gap is computed as an interval (`conversion_timestamp − picked_touch_timestamp`) within each store independently, not as a cross-store absolute-timestamp comparison — consistent with the +339ms finding from 4a/4b.

**Tie-break row (§4) handled separately:** report which source each store picked; treat agreement as a bonus confirmation, treat disagreement as a documented ambiguity (with a proposed tuple-ordering fix) rather than a parity failure, per the reasoning in §4.

**Firing mechanism:** all events backdated post-`af82218` deploy, through `/api/track` + `/api/conversion` only (the two timestamp-accepting routes), same `T0`-anchored-in-the-past mechanism as 4a — `T0 = (actual firing time) − 3 days`, all offsets are small (≤10 minutes total span across all 3 fixtures), comfortably inside `sanitizeClientTimestamp`'s 90-day-past bound with no future-bound risk.

---

## 6. DDL / seed check (STOP-and-ask gate)

**No DDL or new datasource needed.** This pipe reads `events` and `events_by_visitor`, both already deployed with every column the join needs (`visitor_id`, `distinct_id`, `event_id`, `utm_*`, `ai_source`, `timestamp`) — confirmed against the committed schema, not assumed.

**A new pipe-scoped `READ` token is needed** (same category as `conversions_by_site.pipe`'s `phase4_conversions_read` token from 4a/4b) — this is normal pipe-creation hygiene, not the kind of credential/access escalation that needs a STOP. Flagging it for completeness, not blocking on it.

**Fixture firing is data on the existing gating site** (`de200000-...441111`), same category already approved for 4a — not re-requesting that approval, just noting it explicitly per the standing rule.

**No blocker identified that requires a STOP** beyond the two already-flagged, non-blocking items above (the §2.4 distinct_id/visitor_id scope limitation, and the §1 SCOPE_v3.md staleness) — both are recorded findings, not build blockers.

---

## 7. What this plan does not do

- Does not write or push any `.pipe` file.
- Does not fire any HTTP request.
- Does not decide between candidate A-1 and A-2 — that's an explicit empirical decision at build time (§2.2), not pre-committed here.
- Does not address `ai_platforms` (4d) or the deferred `$identify` dual-write / `normalize.js` reserved-bag / group-by aggregation-layer backlog items from the 4a/4b handoff entry.
