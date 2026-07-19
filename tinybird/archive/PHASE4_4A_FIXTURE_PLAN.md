# Phase 4a — Multi-Touch Fixture Plan (time_decay parity, live-HogQL-vs-Tinybird-pipe)

> **Status: PLAN ONLY. No events fired, no diff run.** Written for founder + orchestrator review before any firing, per the dispatch gate. This is seed data on the gating site (`de200000-babe-41d4-a716-446655441111`) and is treated with the same care as the §5 pageview verification — explicit go-ahead required before execution.

---

## 0. Routing decision — why every event in this fixture goes through `/api/track` + `/api/conversion`, not the proxy routes

The §5 pageview verification already proved all 3 wired routes (`/api/track`, `/sp/e`, `/sp/pixel.gif`) dual-write correctly with matching `distinct_id`s — route-wiring diversity is not what this fixture needs to re-prove. What it needs is **precise, deterministic control over each event's stored `timestamp`**, because:

- `time_decay`'s weight is `0.5^(daysBack/7)` computed from the gap between each touchpoint and the chronologically-**last** touchpoint ([attribution-engine.js:2965](../api/lib/attribution-engine.js#L2965) — note this anchors on `lastTouchpoint.timestamp`, not the conversion's own timestamp; documented in [PHASE4_BUILD_PLAN.md §2.1](PHASE4_BUILD_PLAN.md)). To exercise non-trivial, differentiated decay weights, touches must be genuinely spread out in **stored** time, not just fired a few seconds apart in wall-clock time.
- Checked both routes' source: [track.js:181](../api/routes/track.js#L181) (`const clientTimestamp = req.body?.timestamp ? sanitizeClientTimestamp(req.body.timestamp) : null`) and [conversion.js:385](../api/routes/conversion.js#L385) (identical pattern) both accept a client-supplied `timestamp`, validated by [sanitizeClientTimestamp](../api/lib/utils.js#L169): **must be within 90 days in the past, and no more than 1 hour in the future**. This timestamp flows into both `ph.capture`'s `timestamp` and `dualWriteEvent`'s `timestamp` identically — confirmed by reading both call sites, not assumed.
- Checked `proxy.js`'s `/sp/e` and `/sp/pixel.gif`: **neither accepts a client-supplied timestamp at all** — every event through those routes is stamped at actual server-receive time. Using them would force the entire fixture into a few-second window, defeating the deliberate multi-hour/multi-day spread this fixture needs.

So: **all touches → `POST /api/track`**, **all conversions → `POST /api/conversion`**, each with an explicit `timestamp` field. Both already support `validateSiteKey` (site_key in body) and are unrelated to the routes wired in the prior task — no new code, no new wiring, this is pure fixture *data* design.

`{SITE_KEY}` below = the `de200000-...441111` site's key, resolved read-only via the same Supabase lookup used for §5 (`SELECT site_key FROM sites WHERE id = '...'`, staging project `nrsvpwzekfrdrzkoecfk`) — not reprinted here per the site_key redaction rule ([CLAUDE.md §6.5](../CLAUDE.md)).

---

## 1. Post-deploy constraint (requirement 1)

Every identifier below is **new** — none reuses the `cc-verify-*` distinct_ids from §5 or any prior session. All events are fired **after** `af82218` (the pageview dual-write deploy), through the now-wired routes, so both `ph.capture` and `dualWriteEvent` fire for every touch and every conversion, on both rails, guaranteed by the code already verified live in §5.

---

## 2. The three journeys

All timestamps are expressed as **offsets from `T0`**, where `T0` = the UTC timestamp of the *first* HTTP request actually sent when this plan is executed (captured and recorded by whoever fires it — not fixed now, since firing requires separate founder approval). All offsets computed in UTC; all `timestamp` values sent as ISO-8601 with milliseconds (e.g. `T0 + "1d2h" → "2026-07-02T22:30:00.000Z"` style), each individually validated to fall within `sanitizeClientTimestamp`'s 90-day-past / 1-hour-future bound (trivially true — every offset below is small and in the past relative to firing time).

### Journey 1 — 3 touches, same-session, immediate conversion (`cc-4a-j1-visitor`)

Pins `w_shaped`'s `touchpoints.length === 3` special-case branch ([engine:3010-3016](../api/lib/attribution-engine.js#L3010): all three touches get fraction `0.333`, no middle-anchor math).

| # | Offset | Route | Fields |
|---|---|---|---|
| Touch 1 | `T0` | `POST /api/track` | `utm_source=google, utm_medium=cpc, utm_campaign=brand` |
| Touch 2 | `T0 + 5m` | `POST /api/track` | **direct** — no utm fields, no referrer |
| Touch 3 | `T0 + 10m` | `POST /api/track` | `utm_source=newsletter, utm_medium=email` |
| Conversion | `T0 + 15m` | `POST /api/conversion` | `order_id=cc-4a-j1-order-1, conversion_value=49.00, conversion_type=purchase` |

### Journey 2 — 4 touches, includes an AI-source touch, immediate conversion (`cc-4a-j2-visitor`)

Pins `w_shaped`'s general-branch middle anchor at `middleIdx = floor((4-1)/2) = 1` ([engine:3017](../api/lib/attribution-engine.js#L3017)) — **the AI-source touch (index 1) is deliberately the middle anchor**, so the fixture also exercises whether AI-sourced touchpoints survive correctly through the anchor-credit path, not just a generic mid-journey touch.

| # | Offset | Route | Fields |
|---|---|---|---|
| Touch 1 | `T0` | `POST /api/track` | `utm_source=facebook, utm_medium=paid_social` |
| Touch 2 | `T0 + 10m` | `POST /api/track` | **AI-source**: HTTP `Referer: https://chatgpt.com/` + body `referrer: https://chatgpt.com/`, no utm → `ai_source=ChatGPT` ([ai-platform.js AI_HOST_MAP](../api/middleware/ai-platform.js)) |
| Touch 3 | `T0 + 20m` | `POST /api/track` | **direct** — no utm, no referrer |
| Touch 4 | `T0 + 30m` | `POST /api/track` | `utm_source=google, utm_medium=cpc, utm_campaign=retarget` |
| Conversion | `T0 + 40m` | `POST /api/conversion` | `order_id=cc-4a-j2-order-1, conversion_value=89.00, conversion_type=purchase` |

### Journey 3 — 5 touches, LATE-ARRIVING conversion, spread over ~2 real days (`cc-4a-j3-visitor`)

The contract's highest-risk cell (Decision 4). Pins `w_shaped`'s middle anchor at `middleIdx = floor((5-1)/2) = 2` (the 3rd touch). Touches span `T0` → `T0 + 2d`, giving `time_decay` a genuine multi-day gap to differentiate weights on (`0.5^(daysBack/7)`, e.g. the first touch is ~2 days back from the last touchpoint → weight ≈ `0.5^(2/7) ≈ 0.82` relative to the last touch's ≈`1.0`, a real, non-trivial spread — unlike Journeys 1/2 where all gaps are minutes and weights are all ≈1.0). The conversion fires `1h` after the *last* touch and **~2 days after the first** — both the late-arrival-relative-to-touches angle (ingestion/staleness) and the decay-math angle are exercised by this one journey.

| # | Offset | Route | Fields |
|---|---|---|---|
| Touch 1 | `T0` | `POST /api/track` | `utm_source=google, utm_medium=cpc, utm_campaign=launch` |
| Touch 2 | `T0 + 1h` | `POST /api/track` | **direct** — no utm, no referrer |
| Touch 3 | `T0 + 1d` | `POST /api/track` | `utm_source=newsletter, utm_medium=email, utm_campaign=weekly` |
| Touch 4 | `T0 + 1d2h` | `POST /api/track` | **AI-source**: HTTP `Referer: https://www.perplexity.ai/` + body `referrer` same → `ai_source=Perplexity` (deliberately a *different* AI platform than Journey 2's ChatGPT, for ai_platforms diversity later) |
| Touch 5 | `T0 + 2d` | `POST /api/track` | `utm_source=google, utm_medium=cpc, utm_campaign=retarget` |
| Conversion | `T0 + 2d1h` | `POST /api/conversion` | `order_id=cc-4a-j3-order-1, conversion_value=149.00, conversion_type=purchase` |

**Window-exclusion check (not confounding the decay-weight test):** `attribution_window_days = 30` for this site (confirmed read-only via Supabase, §5 below — not `'ltv'`, so the `windowDays` quirk documented in [PHASE4_4A_FIELD_MAPPING.md §4](PHASE4_4A_FIELD_MAPPING.md) doesn't apply here). The full ~2-day spread is far inside the 30-day lookback, so no touch risks being filtered out by the per-conversion window check ([engine:1585-1588](../api/lib/attribution-engine.js#L1585)) — this fixture isolates decay-weight math parity, not window-boundary exclusion (a different, not-yet-planned fixture).

---

## 3. Channel/source coverage check (requirement 2)

- Mixed `utm_source`/`utm_medium`: google/cpc, newsletter/email, facebook/paid_social — across the three journeys.
- Direct (no-utm, no-referrer) touch: J1 touch 2, J2 touch 3.
- AI-source touch: J2 touch 2 (ChatGPT), J3 touch 4 (Perplexity) — two different platforms, exceeds "at least one," sets up future `ai_platforms` (4d) testing for free.

---

## 4. Determinism / re-runnability (requirement 4)

Every identifier above is fully specified: 3 visitor `distinct_id`s (`cc-4a-j1-visitor`, `cc-4a-j2-visitor`, `cc-4a-j3-visitor`), 14 touch events with exact route/source/offset, 3 conversions with exact `order_id`/`conversion_value`/`conversion_type`/offset.

**Re-run behavior, stated explicitly (not a flaw):** `order_id` feeds `deriveEventId`'s idempotency precedence ([normalize.js:144](../tinybird/adapter/normalize.js#L144)) and `/api/conversion`'s own persistent dedup claim ([conversion.js:316](../api/routes/conversion.js#L316)). Firing this exact plan a second time with the same `order_id`s will hit those guards and safely no-op the conversions (proving idempotency, not re-injecting duplicate revenue) — pageviews have no natural id and would append fresh rows each time (per [PHASE2C_PAGEVIEW_DUALWRITE_PLAN.md §4](PHASE2C_PAGEVIEW_DUALWRITE_PLAN.md)'s uuid-fallback finding), so a genuine clean re-run needs a suffix bump (e.g. `-r2` on every distinct_id and order_id), not a verbatim repeat.

---

## 5. Verification window (requirement 5)

- `attribution_window_days = 30`, `timezone = UTC` for site `de200000-...441111` — confirmed read-only: `SELECT id, attribution_window_days, timezone FROM sites WHERE id = 'de200000-babe-41d4-a716-446655441111'` (staging Supabase `nrsvpwzekfrdrzkoecfk`) → `{"attribution_window_days":30,"timezone":"UTC"}`.
- **`date_from = T0 - 10m`, `date_to = T0 + 3d`** — bounds all 3 conversions (latest at `T0 + 2d1h`) with a safety margin, since the conversions-pull filter is `timestamp >= date_from AND timestamp < date_to` ([engine:1419-1422](../api/lib/attribution-engine.js#L1419)).
- **Lookback replication (guardrail 4 — exact, not reimplemented):** the harness must compute `lookback_from` using the literal formula at [engine:1464-1467](../api/lib/attribution-engine.js#L1464) — `windowDays = (attributionWindow && attributionWindow !== 'ltv' && Number(attributionWindow) > 0) ? Number(attributionWindow) : 30`, then `lookback_from = date_from - windowDays days`. For this site, `attributionWindow` resolves to `'30'` (not `'ltv'`), so `windowDays = 30` unambiguously — but the harness must still call the formula, not hardcode `30`, so it stays correct if the site's config ever changes. With `date_from = T0 - 10m`, `lookback_from = T0 - 30d10m`, which comfortably contains every touch (earliest is exactly `T0`).
- This window is deliberately **not** the same as Phase 4a checkpoint's earlier smoke-test window (which only saw 3 conversions / 0 pageviews, pre-dating the pageview wiring) — it's scoped tightly around this fixture's own `T0` so it doesn't accidentally pick up unrelated historical rows on the gating site.

---

## 6. What this plan does NOT do

- Does not fire any HTTP request — this is the design only.
- Does not run the touchpoint-diff harness — that's the next gate, after firing + a flush wait (per §5's prior pattern: ingest + ~15s wait before querying either store).
- Does not touch `ai_platforms`/`last_touch` fixture design — this plan is scoped to the `time_decay`/Pattern-B parity cell only, per the dispatch.
