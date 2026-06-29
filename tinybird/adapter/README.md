# Tinybird ingest adapter (Phase 2a — transport layer)

Standalone normalization + batching for the Tinybird events plane. **Not wired
into producers, does not POST, does not claim idempotency.** It enforces the
canonical contract of [`../datasources/events.datasource`](../datasources/events.datasource)
at one choke point, then buffers and hands a gzipped NDJSON payload to an
**injected** transport.

| module | export | responsibility |
|---|---|---|
| `normalize.js` | `normalizeEvent(raw)` | pure raw→canonical mapping |
| `normalize.js` | `deriveEventId(raw)` | **stub** — natural id else uuid (real derivation = Phase 2b) |
| `normalize.js` | `TYPED_COLUMNS`, `REQUIRED_COLUMNS` | the schema contract, exported for tests/wiring |
| `batch.js` | `createBatcher({ transport, … })` | buffered NDJSON → gzip → injected transport |

## `normalizeEvent(raw)` — the contract

Pure (never mutates `raw`). Accepts a **flat** event (e.g. a generator fixture
line) **or** a `ph.capture`-shaped `{ distinctId, event, properties:{…} }` — a
nested `properties` object is flattened up (top-level keys win on collision), so
there is one input contract. Output is one **flat** object: typed columns extract
by name; everything else rides along in `properties` (the `json:$` catch-all).

Guarantees:

- **7 NOT NULL columns always present** — `site_id, event_type, event_id,
  distinct_id, visitor_id, timestamp, ingestion_method`.
  - `timestamp` missing/invalid → server-receive time, UTC ISO-ms.
  - `event_id` absent → `deriveEventId(raw)` (natural id: `stripe_invoice_id` →
    `stripe_subscription_id` → `order_id` → `external_event_id` →
    `idempotency_key`, else uuid).
  - `visitor_id` derived from `anonymous_id`/`distinct_id` when absent.
- **Tenant safety** — `site_id` is **never fabricated**; a missing/empty
  `site_id` **throws** (an ingestion path must never fall through to a default
  tenant, §6.5).
- **PII denylist (recursive)** — `email`/`name`/`phone`/… dropped (not redacted;
  the schema has no PII columns) at **every depth** of nested objects/arrays
  (depth-bounded at 5, mirroring `redactPiiFromObject` in `api/lib/utils.js`).
  Exact-key match + an `*_email`/`*_phone` suffix rule, so legitimate
  `order_name`/`form_name`/`browser_name`/`os_name` and the flag
  `webhook_email_present` survive. A top-level-only strip would miss
  `custom_properties:{email}` / `meta:{site_key}`, so the walk is recursive.
- **Forbidden keys dropped (recursive)** — `site_key` (customer secret,
  off-schema), `_synthetic` / `refund_of` (generator-only markers), at every depth.
- **Pixel normalization** — `value`→`conversion_value`, `browser`→`browser_name`,
  `os`→`os_name` (the `pixel.js` divergence the audit found). `city`,
  `tracking_method`, `x_*` pass through into the bag.
- **No fabrication** — absent Nullable columns are left absent; Tinybird maps the
  missing `json:$` path to NULL and the read side applies its `COALESCE`/`NULLIF`
  default.

## `createBatcher({ transport, flushAt, flushInterval, gzipPayload, onError })`

- `transport(payload, meta)` is **required and dependency-injected** — no Events
  API URL or token here. `meta = { count, gzip }`.
- Flushes at **N events** (`flushAt`) **or T ms** (`flushInterval`). Defaults
  mirror `api/lib/posthog.js`: env `TINYBIRD_FLUSH_AT` / `TINYBIRD_FLUSH_INTERVAL_MS`,
  else `20`/`10000` on prod|staging, else `1`/`0`.
- Serializes flushes (payloads transport in order, never overlap); NDJSON →
  gzip → transport. Flush-on-shutdown (`SIGTERM`/`SIGINT`/`beforeExit`).
- On transport error: `onError(err, batch)` fires and the flush **rejects** for
  the triggering caller; the failed batch is dropped (**not** silently re-queued)
  but does **not** poison the chain — subsequent batches still flush. **429-aware
  retry/backoff is Phase 2d.**

## Out of scope here (later phases)

Idempotency `(site_id, event_id)` claim (2b) · real Events API POST + token (2c) ·
429 retry/backoff (2d) · producer wiring. None of those live in this module.

### Known deferred (non-blocking, from the Phase-2a adversarial review)

- **`conversion_value` type coercion** — a non-numeric string would reach the
  `Float64` column. Left as-is: coercing to `0` would fabricate a §6 zero;
  malformed values are a Phase-2b conversion-quarantine concern, not a transport
  drop. (pixel.js already emits `parseFloat(...) || 0`.)
- **Fire-and-forget `enqueue()` rejection** — an un-awaited threshold-triggering
  `enqueue()` surfaces the transport error as an `unhandledRejection`. The
  await-the-flush contract (and the `onError` callback) is the supported path;
  revisited with producer wiring + retry (Phase 2d).
- **Per-batcher process listeners** — each `createBatcher()` registers 3 shutdown
  listeners (released on `stop()`). Fine for the single long-lived batcher this
  phase assumes; revisit if many short-lived batchers are created.

## Run the tests

```
node --test tinybird/adapter/__tests__/normalize.test.js tinybird/adapter/__tests__/batch.test.js
```
