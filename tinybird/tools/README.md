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
gzip -c tinybird/fixtures/events_sample.ndjson > /tmp/events_sample.ndjson.gz

curl -X POST 'https://api.europe-west3.gcp.tinybird.co/v0/events?name=events' \
  -H "Authorization: Bearer $TB_APPEND_TOKEN" \
  -H 'Content-Encoding: gzip' \
  --data-binary @/tmp/events_sample.ndjson.gz
```

Per `SCOPE_v3.md` §3.2: rows-per-request don't count against the rate limit
(batching is the throughput lever); the Events API is **not** idempotent — the
app-side `event_id` dedup (§2.5) is the guard; `429` is retriable with backoff.
