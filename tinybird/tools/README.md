# Synthetic event generator (Phase 0)

`generate_events.js` produces **NDJSON** events that conform exactly to the
committed [`tinybird/datasources/events.datasource`](../datasources/events.datasource)
schema. One generator feeds two consumers:

1. the **Phase-1 sorting-key load test** (large volume), and
2. later **dual-write validation** (deterministic replay into both PostHog and
   Tinybird, then diff).

**This script writes to disk only — it never ingests to Tinybird.** See
[Ingesting (manual, not run here)](#ingesting-a-file-manual--not-run-here).

---

## Schema fidelity — how a line maps to the table

`events.datasource` declares 48 typed columns plus `` `properties` String `json:$` ``.
Because `properties` is `json:$` (the **whole row**), each NDJSON line is a single
flat object whose top-level keys are:

- the **typed columns** (extracted by Tinybird via their `json:$.<col>` paths), **and**
- the §2.6 **JSON-bag keys** (`order_id`, `stripe_*`, dynamic `cp_*`, …) — not
  typed columns, but captured into `properties` because `json:$` grabs the
  whole object.

There is **no nested `properties` object**; Tinybird builds the `properties`
column from the entire line.

Default mapping is exercised on purpose:

- `conversion_value` / `conversion_type` are **omitted** on non-conversions →
  Tinybird applies their column `DEFAULT` (`0` / `'untyped'`).
- Nullable optionals (`utm_*`, `country`, `device_type`) are emitted as explicit
  `null` on a fraction of events → exercises the read-side
  `COALESCE(NULLIF(x,''),'<default>')`.

Visitor ids are **UUIDv4-shaped** so the set also exercises the LTV
UUID-exclusion path in attribution.

### Edge-case flagging

Every line carries a **non-schema** `_synthetic` object (rides into `properties`
via `json:$`, queryable with `JSONExtract`) so validation can target edge cases:

| `_synthetic.edge` | meaning |
|---|---|
| `refund` | compensating `$conversion`, **negative** `conversion_value`, `event_id = "<orig>:refund"`, `refund_of = "<orig>"` (§9 signed-sum nets to zero) |
| `dup` | a second line with the **same `(site_id, event_id)`** as a conversion (dedup/idempotency target) |
| `null_fields` | optional `utm_*`/`country`/`device_type` nulled out |
| `custom_params` | dynamic/arbitrary keys present in the bag |

---

## Usage

```
node tinybird/tools/generate_events.js [flags]
```

| flag | default | meaning |
|---|---|---|
| `--visitors` | `200` | visitors (each = one multi-touch journey) |
| `--sites` | `3` | tenant count (`site-00`, `site-01`, …) |
| `--days` | `30` | journey-start spread back from `--end` |
| `--conversion-rate` | `0.3` | P(a journey converts) |
| `--seed` | `sourcetrack` | RNG seed — **same seed + flags ⇒ identical file** |
| `--end` | `2026-06-30` | fixed reference end-date (NOT `Date.now()`, for reproducibility) |
| `--out` | `tinybird/fixtures/events_sample.ndjson` | output NDJSON path |

A journey is: `N` pageviews (varied source/utm for multi-touch) → optional
`$identify` → optional `custom` → optional `$conversion` (→ optional refund / dup),
all sharing one `site_id` / `distinct_id` / `visitor_id`, timestamps monotonically
increasing.

### Small set (fit-check, ~1k events) — the committed `events_sample.ndjson`

```
node tinybird/tools/generate_events.js \
  --visitors 180 --sites 3 --days 30 --conversion-rate 0.35 \
  --seed demo --out tinybird/fixtures/events_sample.ndjson
```

### Large set (load test, ~several million events)

```
node tinybird/tools/generate_events.js \
  --visitors 1000000 --sites 50 --days 120 --conversion-rate 0.3 \
  --seed loadtest --out /tmp/events_loadtest.ndjson
```

(≈ 1M visitors × ~5 events ≈ 5M lines. Write to `/tmp` — do **not** commit large
fixtures. `--seed loadtest` makes the exact set reproducible for the dual-write diff.)

### Determinism

Seeded `mulberry32` RNG; no `Date.now()` / `Math.random()` in the data path.
Re-running with the same `--seed` + flags yields a byte-identical file (verified
via `md5`).

---

## Ingesting a file (manual — NOT run here)

The generator never ingests. A human ingests a generated file into `ST_Staging`
via the Events API. **Do not run this in an agent session; supply the token out
of band — never commit it.**

```
# gzip the NDJSON and POST to the Events API (events datasource).
# $TB_APPEND_TOKEN = a DATASOURCE:APPEND-scoped token for ST_Staging (NOT stored here).
# Host = the global API endpoint https://api.tinybird.co. The europe-west3/gcp region
# slug appears ONLY in the `ui:` (dashboard) URL, NOT the API host — the API host comes
# from the `api:` field of `tb --cloud info` and region-routes server-side.
gzip -c tinybird/fixtures/events_sample.ndjson > /tmp/events_sample.ndjson.gz

curl -X POST 'https://api.tinybird.co/v0/events?name=events' \
  -H "Authorization: Bearer $TB_APPEND_TOKEN" \
  -H 'Content-Encoding: gzip' \
  --data-binary @/tmp/events_sample.ndjson.gz
```

Per `SCOPE_v3.md` §3.2: rows-per-request don't count against the rate limit
(batching is the throughput lever); the Events API is **not** idempotent — the
app-side `event_id` dedup (§2.5) is the guard; `429` is retriable with backoff.

---

# Phase-9 app-path injector — populate BOTH stores natively (Option 1)

`phase9_app_path_injector.mjs` sends synthetic `phase9-fixtures-v1` events through
the **real app HTTP ingestion endpoints**, so the app's own **dual-write** fans
each event out to **PostHog (469905)** AND **Tinybird (ST_Staging)** in each
store's native shape — the exact path the Phase-9 harness validates. Contrast
`ingest_ndjson_to_tinybird.mjs`, which writes Tinybird-only and is **not**
reconciliation-faithful.

**Which store gets what:** you POST once per event; the app writes PostHog via
`ph.capture` and Tinybird via the flag-gated `dualWriteEvent` — one call, both
stores, natively. (Tinybird only actually receives rows when
`TINYBIRD_DUAL_WRITE` is enabled on the target API; otherwise only PostHog is
populated — confirm the staging flag with the founder.)

### Target endpoints (traced from `api/index.js` — CONFIRMED)

| flat `event_type` | endpoint | auth | drop guard |
|---|---|---|---|
| `$pageview` | `POST {ST_INJECT_BASE_URL}/api/track` (`api/index.js:383`) | `site_key` in **body** (`auth.js:26`) | bot UA (`bot-filter.js`) |
| `$conversion` | `POST {ST_INJECT_BASE_URL}/api/conversion` (`api/index.js:437`) | `site_key` in **body** | — |

The injector sends a realistic desktop-Chrome `User-Agent` that clears
`BOT_UA_PATTERN` (asserted at run start and in the test suite) — a bot UA would be
**silently dropped** by the routes.

### Env (founder-supplied — NEVER committed/logged in full; masked in all output)

| var | meaning |
|---|---|
| `ST_INJECT_BASE_URL` | staging API base, e.g. `https://…up.railway.app` |
| `ST_INJECT_SITE_KEY` | the test site's `site_key` (masked to a short prefix in logs) |

### Usage — DRY-RUN by default, `--confirm` is FOUNDER-ONLY

```
# 1. Generate the deterministic fixtures (disk-only):
node tinybird/tools/generate_events.js \
  --seed phase9-fixtures-v1 --visitors 400 --sites 3 --days 30 --conversion-rate 0.5 \
  --out /tmp/phase9-fixtures-v1.ndjson

# 2. DRY-RUN (default — reshapes + prints WOULD-POST summary, sends NOTHING):
node tinybird/tools/phase9_app_path_injector.mjs --in /tmp/phase9-fixtures-v1.ndjson

# 3. SEND (FOUNDER-ONLY — agents do not run --confirm):
ST_INJECT_BASE_URL=https://<staging-api> ST_INJECT_SITE_KEY=<test-site-key> \
  node tinybird/tools/phase9_app_path_injector.mjs --in /tmp/phase9-fixtures-v1.ndjson --confirm
```

Optional flags: `--only-site-id <id>` (filter generator sites), `--limit <N>`.

### Re-run safety (flagged)

`/api/track` pageviews have **no natural-id dedup** (the dual-write derives a
uuid), so **re-running DUPLICATES pageviews**. `/api/conversion` dedups on
`order_id`. → Run **once** against a **clean test site**, or purge the test site
between runs. The seed keeps event *content* identical across runs but does not
prevent pageview duplication.

### Notes

- `ai_source` is **app-derived from the referrer** (`detectAIPlatform` middleware),
  not from the generator's `ai_source` column — this does not affect the three
  target models (`first_touch`, `first_touch_non_direct`, `last_touch_non_direct`),
  which key off utm/referrer sources, and the harness compares store-vs-store.
- All three fixtures are single-identity (`distinct_id == visitor_id`) per
  `PHASE9_VALIDATION_HARNESS_SPEC.md §3`.
