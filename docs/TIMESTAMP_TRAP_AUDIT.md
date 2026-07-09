# Timestamp-Format Trap Audit (W1 parity-trap class)

**Status:** analysis only — NO consumer edits in this doc. The founder picks **central vs point** (§5); a follow-up task lands the fix.
**Anchor:** `origin/main` @ `e5423be` (after #153 merged — `normalizePipeTimestamp` helper present at `api/lib/tinybird-read.js:51`).
**Scope:** the **FORMAT** trap only. The `sent_at` **SEMANTIC** divergence is separate and already decided — see §7.

---

## 1. TL;DR

Tinybird/ClickHouse pipe rows return timestamps as `YYYY-MM-DD HH:MM:SS[.sss]` — **space separator, no `T`, no `Z`**. PostHog/HogQL returns ISO `…T…Z`. Two failure modes when a raw pipe timestamp reaches JS date logic:

- **Local-parse:** `new Date('2026-07-01 20:29:28')` is parsed as **local time** (per V8; the form is not spec-ISO) → its epoch is off by the server's UTC offset → any duration / "N ago" / bucket-by-instant comparison against `Date.now()` or an ISO value is wrong. **Timezone-dependent** (silent on a UTC deploy, wrong elsewhere).
- **Split/slice bucket:** `'2026-07-01 20:29:28'.split('T')[0]` returns the **whole string** (no `T`) instead of `'2026-07-01'` → daily/monthly buckets fracture (one bucket per timestamp). **Timezone-independent** — breaks everywhere.

`sessions.js` was fixed in #153 by applying the shared, idempotent `normalizePipeTimestamp()` in its `readTb` mapRows. **The pattern has already recurred three times** (sessions, events-health, ai-platform live) — this audit finds every current + latent instance so it is not re-discovered per-read at flip time.

**Live breakers today:** `events.js /health` (`events_health_last`) and `attribution-engine.js getAiPlatformAttributionLive` (`aiplatform_conversions_by_site` + `pageviews_by_visitors`). Both are dispatch-wired and consume raw pipe `timestamp` without normalizing; they serve only when `TINYBIRD_READ_ENABLED` (+ any `TINYBIRD_READ_PIPES` allowlist) is on.

---

## 2. Audit table

`Source`: where the consumed timestamp originates. `Breaks`: does a raw pipe (space-form) value reach `new Date()`/`.split('T')`/`.slice(0,10)`. `Serving`: whether the pipe read is dispatch-wired in code (actual prod serving is gated by `TINYBIRD_READ_ENABLED` + `TINYBIRD_READ_PIPES` — not readable from here).

| File:line | Function | Timestamp source | Breaks? | Serving (code) | Batch / when |
|---|---|---|---|---|---|
| `api/routes/events.js:300,307` | `GET /health` | pipe **`events_health_last`** → `new Date(lastEvent)` vs `Date.now()` | **YES** (tz-dependent: wrong `is_active`/`status`) | **WIRED** | events-health (already dispatch-wired) |
| `api/lib/attribution-engine.js:389,393,398` | `selectAiTouchForConversion` ← `getAiPlatformAttributionLive` | pipes **`aiplatform_conversions_by_site`** (map :490) + **`pageviews_by_visitors`** (map :587) → `new Date(x.timestamp).getTime()` | **YES** (tz-dependent) | WIRED, flag+allowlist-gated | AI-platform / touch-model (Batch-B) |
| `api/lib/attribution-engine.js:770,795` | `getAiPlatformAttributionLive` | same two pipes → `refDate = new Date(conv/pv.timestamp)` then `.slice(0,7)/(0,10)` bucket | **YES** (tz + bucket) | WIRED, flag+allowlist-gated | AI-platform / touch-model (Batch-B) |
| `api/routes/events.js:190` | `GET /latest` | **HogQL** `events_latest` (money-rail, **NOT wired** — held on HogQL); raw `timestamp` passthrough to client | not now; **LATENT** | not wired | when events_latest money-rail flips |
| `api/lib/setup-doctor.js:103` | `runSetupDoctor` | **HogQL** `doctor_last_conversion` (money-rail, NOT wired); `timestamp` returned, not date-math'd server-side | not now; **LATENT** (client parse) | not wired | when doctor money-rail flips |
| `api/routes/alerts.js:136` | `GET /` | pipe **`alert_recent`** emits `last_ts`, but only `cnt` is read — `last_ts` is **mapped-but-unused** | **NO** (latent if a consumer reads `[1]`) | WIRED | — |
| `api/lib/attribution-engine.js:1069,1089,1106` | `getSessionReport` | **HogQL** `session_report_pageviews`/`_conversions` → `deriveSessions` → `started_at.split('T')` | **NO** (HogQL is ISO) | not wired (HogQL) | latent only if piped |
| `api/lib/attribution-engine.js:1256,1309,1333` | `getAttributionExplanation` | **HogQL** `attribution_explain_journey`/`_conversion` | **NO** | not wired (HogQL) | — |
| `api/lib/attribution-engine.js:1765,1768,1816` | `getMultiTouchAttributionLive` | **HogQL** `multitouch_conversions_live`/`_pageviews_live` (the `*_by_site` pipe is **not** wired here) | **NO** | not wired (HogQL) | — |
| `api/lib/attribution-engine.js:3202,3208` | `calculateAttribution` | **HogQL** (via getMultiTouchAttributionLive); already `isNaN`/`hasInvalid`-guarded | **NO** | not wired (HogQL) | — |
| `api/routes/hygiene.js:118` | `GET /utms` | pipe `integ_low_activity` → `day` is **pre-bucketed in SQL** (`formatDateTime(...,'%Y-%m-%d')`), not a raw ts | **NO** | WIRED | — |
| `api/routes/live.js:43` | `GET /` | pipe `live_visitors_bag` → integer `live_visitors`; 5-min window fixed in-pipe | **NO** | WIRED | — |
| `api/routes/sessions.js:95,120` | `sessionsOverview` | pipes `sessions_pageviews`/`sessions_conversions` — **normalized (#153)** | **NO** (fixed) | WIRED | ✅ fixed |
| `api/routes/journey.js:136` | `GET journey` | **HogQL** + Supabase `attributed_conversions` → `deriveSessions` | **NO** | not wired (HogQL) | latent only if piped |

### Shared libs (contract note)
- **`api/lib/sessionization.js:45,52,111,112`** (`new Date(ev.timestamp)`): SAFE **by caller contract**. Callers = `sessions.js` (normalizes ✅), `journey.js` (HogQL/Supabase ISO), `attribution-engine.js getSessionReport` (HogQL). It never normalizes internally — whoever feeds it pipe rows MUST normalize first. If a central fix (§5) lands, this contract is satisfied automatically.

---

## 3. SAFE inventory (confirmed — no raw pipe timestamp reaches date logic)

- `api/jobs/nightly-attribution.js:736` — `new Date(conversion.timestamp).toISOString().split('T')[0]`; `.split` runs on the **`.toISOString()` output** (guaranteed ISO). Input `conversion.timestamp` is Supabase-sourced. SAFE.
- `api/lib/google-search-console.js:279` — `d.toISOString().split('T')[0]` where `d` is a `Date` iterator, not a pipe row. SAFE (GSC/Search Console API, not a Tinybird consumer).
- `api/lib/health-agent.js`, `api/lib/ad-platforms.js` — **not** Tinybird-pipe consumers (absent from the `queryTinybirdPipe`/`readTb`/`__set*ReadDeps` set); their timestamps come from Supabase / Stripe / HogQL (ISO). SAFE.
- The four aggregate touch-model pipes (`first_touch_by_site`, `last_touch_by_site_agg`, `first_touch_non_direct_by_site`, `last_touch_non_direct_by_site`) return **pre-summed rows with no per-row timestamp** → feed none of the date-math lines. SAFE.

**SAFE pattern to standardize on:** `new Date(x).toISOString().slice/split(...)` (bucket the ISO *output*), and never `String.split('T')`/`.slice(0,10)` on a raw pipe value.

> Verify-before-trust note: the task brief expected `attribution-engine.js:1089/1106` to "break when `multitouch_conversions` is wired." The actual code path (`getSessionReport`, and separately `getMultiTouchAttributionLive`) is **HogQL-fed today**; the `multitouch_conversions_by_site` pipe is not wired into it. Those lines are SAFE now and only latent — corrected here against the real path.

---

## 4. Currently-wired reads that are safe by construction

`hygiene integ_low_activity` (SQL-bucketed `day`), `live live_visitors_bag` (count), `events_health_hour`/`_day` (counts), `alert_traffic`/`alert_conversions` (SQL-side week/day counts), `doctor_pageviews_30d`/`doctor_token_verify` (count/existence). These emit **no per-row timestamp to JS**, so they are immune regardless of the fix chosen.

---

## 5. Recommendation — CENTRAL, with the point-fix as the immediate stopgap

The helper already exists (#153), is **idempotent** (no-op on ISO), **null/''-safe**, and **passthrough on non-strings** — so a broad rollout is cheap and low-risk. The trap has already recurred 3× and every *new* pipe read is a fresh landmine. That argues for killing the class centrally.

**CENTRAL (recommended): normalize known timestamp-named fields inside `queryTinybirdPipe`.**
After a pipe returns `body.data`, walk each row and apply `normalizePipeTimestamp` to values whose key is in a recognized timestamp-key set (`timestamp`, `started_at`, `last_ts`, `first_seen`, `last_seen`, `occurred_at`, `server_timestamp`, `min_ts`, `max_ts`, …). No consumer ever sees a raw ClickHouse timestamp again — current and future.
- **Pros:** kills the whole class in one place; new pipe reads are safe by default; the `sessionization.js` caller-contract is satisfied automatically; idempotent so it can't double-apply.
- **Cons/risk:** depends on a **key-name allowlist** (a timestamp under an unrecognized key is missed — but that is exactly the point-fix's blind spot too); a non-timestamp string under a listed key would be mangled (mitigated: the set is specific, and `normalizePipeTimestamp` only appends `Z`/swaps a leading space, so a non-datetime string like `'active'` is returned unchanged since it has no space-before-time / matches no tz rule). Ship with a unit test asserting the recognized set + that already-bucketed date strings (`'2026-07-01'`) pass through unchanged.

**Alternative central: a mandatory `mapRows` wrapper** in `tinybird-read.js` that every `readTb` must route through. Cleaner typing, but each route defines its own `readTb`/`mapRows`, so "mandatory" isn't enforceable without refactoring all of them — higher blast radius than the client-side normalize. Not recommended as the primary.

**POINT (fallback): normalize at each consumer.** Today that is exactly 3 edits — `events.js:294` (`normalizePipeTimestamp(lastEvent)` before `new Date`), and the two mapRows in `getAiPlatformAttributionLive` (`:490`, `:587`) — plus the latent ones at flip time.
- **Pros:** minimal blast radius; each change is obvious and locally testable.
- **Cons:** does not prevent recurrence — the *next* wired pipe re-introduces the trap; relies on every future author remembering.

**My pick:** **CENTRAL** (client-side key-name normalize in `queryTinybirdPipe`) as the durable class-killer, **and** land the 3 point-fixes immediately in the same task as belt-and-suspenders for the reads that serve today, keeping `sessions.js`'s explicit normalize as living documentation. Founder decides central-vs-point before any fix lands.

---

## 6. W1 parity-trap / divergence list — add this entry

> **Trap: ClickHouse timestamp FORMAT (`YYYY-MM-DD HH:MM:SS`, space/no-`Z`) vs PostHog ISO (`…T…Z`).**
> Any pipe-sourced timestamp that reaches `new Date()` (local-parse skew) or `.split('T')`/`.slice(0,10)` (whole-string bucket) diverges from the HogQL leg. Detection: the route-handler A/B harness (`tinybird/tools/route_ab_diff.mjs`) — it caught this as a daily-bucket + duration divergence. Mitigation: `normalizePipeTimestamp()` (`api/lib/tinybird-read.js`), applied per §5. Gate every pipe read that emits a per-row timestamp through the harness before flip.

---

## 7. Out of scope — `sent_at` SEMANTIC divergence (already decided)

Separate from this FORMAT trap. PostHog applies a `sent_at` clock-correction that shifts some events' `timestamp` (~15 min for one observed visitor); Tinybird stores the raw client `timestamp`. Decision already made: **accept raw; `server_timestamp` is the V1.1 canonical axis.** Do **not** attempt to replicate `sent_at` here, and do not conflate a `sent_at` value-shift (semantics) with the format normalization (this audit). The A/B harness should treat a `sent_at`-class per-row shift as an expected, separately-tracked divergence, not a format failure.
