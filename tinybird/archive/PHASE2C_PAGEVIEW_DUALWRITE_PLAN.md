# Pageview Dual-Write Completion Plan (Phase 2c gap-close)

> **Status: PLAN ONLY.** No code, no commits. Written for founder + orchestrator review per the dispatch gate. This is a prerequisite for Phase 4 (the row-pull pipes built in 4a stay parked/uncommitted until this lands and is deployed). Triggered by the confirmed finding: PostHog 469905 has 29 `$pageview` events for site `de200000-...441111`; Tinybird ST_Staging has 0, for any site, ever.

---

## 1. Every `$pageview` producer — enumerated, dual-write status confirmed per site

Grep-verified against every `ph.capture(` call site in `api/routes/*.js` and every existing `dualWriteEvent(` call site, cross-referenced one-to-one (not sampled):

| # | File:line | Route | Event value | Currently calls `dualWriteEvent`? |
|---|---|---|---|---|
| 1 | [track.js:332](../api/routes/track.js#L332) | `POST /api/track` | `req.body.event \|\| '$pageview'` (also carries custom events, `form_submit`, `booking_scheduled` through the same capture) | **No — gap.** |
| 2 | [proxy.js:103](../api/routes/proxy.js#L103) | `POST /sp/e` (proxied pageview/custom event) | `event` (from req.body, typically `$pageview`) | **No — gap.** |
| 3 | [proxy.js:226](../api/routes/proxy.js#L226) | `GET /sp/pixel.gif` (1×1 pixel, comment: "always a $pageview") | `'$pageview'` (literal) | **No — gap.** |
| 4 | [server-events.js:115](../api/routes/server-events.js#L115) | `POST /api/event` (server-side custom-event API) | `req.body.event \|\| '$pageview'` | **Already wired** — [server-events.js:124](../api/routes/server-events.js#L124) calls `dualWriteEvent({ distinctId, event: req.body.event \|\| '$pageview', timestamp: eventTimeStr, properties })` immediately after. No action needed. |
| 5 | [pixel.js:128](../api/routes/pixel.js#L128) | `GET /api/pixel` (general-purpose pixel; docstring covers email-open, server-to-server, no-JS use cases) | `q.event \|\| 'email_open'` — caller-controlled, could theoretically be `$pageview` though the documented use cases don't name it | **Already wired** — [pixel.js:136](../api/routes/pixel.js#L136) calls `dualWriteEvent({ distinctId: userId \|\| anonymousId, event: eventName, properties })` generically, no event-type branch, so any value (including a hypothetical `$pageview`) is already covered. No action needed. |

**Not a `$pageview` producer, confirmed out of scope for this plan, flagged only:**
- [identify.js:226](../api/routes/identify.js#L226) — `event: '$identify'`, no `dualWriteEvent` call exists. A real, separate dual-write gap, but the dispatch scoped this plan to `$pageview` specifically — not addressed here. Worth its own follow-up.
- All `$conversion` producers (`conversion.js`, `conversion-offline.js`, `shopify-webhook.js`, `stripe-webhook.js` ×2, `webhook-incoming.js`, `proxy.js`'s `/sp/c`, `track.js`'s form-conversion branch) — already correctly wired, confirmed by the same grep, not touched by this plan.

**Net: 3 call sites need a new `dualWriteEvent` call.** Items 4 and 5 prove the pattern already exists and works for `$pageview`-shaped events server-side — the gap is specifically in the two **browser-facing JS-tracker** ingestion paths (`/api/track`, `/sp/e`) and the **pixel fallback** (`/sp/pixel.gif`), i.e. exactly the routes real site-visitor traffic (not server-to-server API calls) flows through. That matches the live data exactly: PostHog has pageviews for the gating site, Tinybird has none.

---

## 2. The exact `dualWriteEvent` call to add, per site — mirroring the established pattern

The established pattern (seen identically at [conversion.js:405](../api/lib/../routes/conversion.js#L405), [proxy.js:186](../api/routes/proxy.js#L186), [track.js:482](../api/routes/track.js#L482), [server-events.js:124](../api/routes/server-events.js#L124)) is always:
1. Hoist the `properties` object passed to `ph.capture` into a **named const**, *before* the `ph.capture` call, with a comment noting it's "hoisted to a const (behavior-identical)" so the dual-write call reuses the exact same payload.
2. Call `ph.capture({...})` exactly as today (zero behavior change to the live path).
3. Immediately after, call `dualWriteEvent({ distinctId, event, timestamp?, properties })` using the same hoisted const — additive, never awaited, can't throw into the producer (per [dual-write.js:9-10](../tinybird/adapter/dual-write.js#L9), [dual-write.js:64-71](../tinybird/adapter/dual-write.js#L64)).

### 2.1 `track.js:332` — `POST /api/track`

**Mirrors:** [track.js:471-482](../api/routes/track.js#L471) (the file's own form-conversion branch — same file, same `properties`-construction style, just one event type over).

**Change:** the `properties: {...}` object currently constructed *inline* inside the `ph.capture({...})` call ([track.js:336-396](../api/routes/track.js#L336)) needs hoisting to a const (e.g. `pageviewProps`) first — it is the one gap-site where the object isn't already a separate const (every other site already hoists). Then:

```js
const pageviewProps = { /* exact same object literal currently inline at track.js:336-396 */ }

ph.capture({
  distinctId: req.body.anonymous_id || uuidv4(),
  event: req.body.event || '$pageview',
  timestamp: clientTimestamp ? new Date(clientTimestamp) : undefined,
  properties: pageviewProps
})

// Additive Tinybird dual-write (flag-gated OFF; no-op + no network when off).
// No natural id on this path -> deriveEventId falls to a uuid (see §4).
dualWriteEvent({ distinctId: req.body.anonymous_id || uuidv4(), event: req.body.event || '$pageview', timestamp: clientTimestamp, properties: pageviewProps })
```

**Watch-out (do not silently "fix"):** `distinctId: req.body.anonymous_id || uuidv4()` is currently computed **inline twice** if copied naively (once for `ph.capture`, once for `dualWriteEvent`) — two separate `uuidv4()` calls would produce **two different distinct_ids** for the same logical event when `anonymous_id` is absent, breaking visitor stitching between PostHog and Tinybird for that row. The hoist must extract `distinctId` to its own const too (`const distinctId = req.body.anonymous_id || uuidv4()`), reused in both calls — exactly the pattern already used at [proxy.js:163](../api/routes/proxy.js#L163) (`const distinctId = anonymous_id || uuidv4()`, reused at both 178 and 186). This is the single highest-risk mechanical detail in this whole plan; flagging it explicitly rather than leaving it implicit.

### 2.2 `proxy.js:103` — `POST /sp/e`

**Mirrors:** [proxy.js:158-186](../api/routes/proxy.js#L158) (the same file's `/sp/c` handler — same hoisting comment style already established two handlers down).

**Change:** hoist `distinctId` and the `properties` object (currently inline at [proxy.js:104-117](../api/routes/proxy.js#L104)) to consts:

```js
const distinctId = anonymous_id || uuidv4()
const pageviewProps = {
  ...sanitizedProperties,
  site_id: site.id,
  site_key,
  country: enriched.country,
  device_type: enriched.device_type,
  browser: enriched.browser,
  server_timestamp: enriched.server_timestamp,
  ai_source: getAiSource(sanitizedReferrer) || sanitizedProperties.ai_source || null,
  proxy: true,
}

await ph.capture({ distinctId, event, properties: pageviewProps })

// Additive Tinybird dual-write (flag-gated OFF; no-op + no network when off).
// No natural id on this path -> deriveEventId falls to a uuid. site_key is
// dropped by the adapter (FORBIDDEN_KEYS, §3).
dualWriteEvent({ distinctId, event, properties: pageviewProps })
```

Note `event` here is the raw `event` destructured from `req.body` at [proxy.js:70](../api/routes/proxy.js#L70) — this handler also carries non-pageview custom events through the same code path (same nuance as track.js item 2.1's `event` value). Wiring this one call site covers `$pageview` **and** any custom event sent via `/sp/e`, matching SCOPE_v3 §2.1's 4-event-type model — not scope creep, it's the same capture call either way.

### 2.3 `proxy.js:226` — `GET /sp/pixel.gif`

**Mirrors:** the same `/sp/c` pattern (2.2), simplest of the three since this handler's event is a hardcoded literal, not a variable.

**Change:** hoist `properties` (currently inline at [proxy.js:228-235](../api/routes/proxy.js#L228)) — note `distinctId` here is `uid || uuidv4()` computed **inline** at the `ph.capture` call site today; same double-`uuidv4()` risk as 2.1 applies and must be hoisted to one const:

```js
const distinctId = uid || uuidv4()
const pageviewProps = { site_id: site.id, site_key, event_type: 'pixel', country: enriched.country, device_type: enriched.device_type, server_timestamp: enriched.server_timestamp, proxy: true }

await ph.capture({ distinctId, event: '$pageview', properties: pageviewProps })

// Additive Tinybird dual-write (flag-gated OFF; no-op + no network when off).
// No natural id on the pixel path -> deriveEventId falls to a uuid. site_key is
// dropped by the adapter (FORBIDDEN_KEYS, §3).
dualWriteEvent({ distinctId, event: '$pageview', properties: pageviewProps })
```

All three sites: the flag-gating itself needs **zero** per-site code (`dualWriteEvent` already checks `isDualWriteEnabled()` internally at [dual-write.js:57](../tinybird/adapter/dual-write.js#L57) before doing any work) — the only required change at each site is the hoist + the one additive call.

---

## 3. PII / denylist confirmation — cross-referenced against the adapter's actual `FORBIDDEN_KEYS`, not assumed

Source of truth: [normalize.js:43-54](../tinybird/adapter/normalize.js#L43) (`PII_KEYS`, exact-match + email/phone-suffix rule) and [normalize.js:92](../tinybird/adapter/normalize.js#L92) (`FORBIDDEN_KEYS = new Set(['site_key', '_synthetic', 'refund_of', 'raw_payload', 'user_agent', 'webhook_source', 'city', 'fbp', 'fbc'])`).

Checked every key in all three gap sites' `properties` object literals against both sets:

| Site | Keys present that intersect a denylist | Outcome |
|---|---|---|
| 2.1 `track.js` pageview props | none (no `user_agent`, `city`, `site_key`, `fbp`/`fbc` are ever placed in this object — track.js never captures raw UA into properties) | Clean — nothing to strip, nothing missing from the denylist. |
| 2.2 `proxy.js /sp/e` | `site_key` (line: `site_key,`) | Already covered — `FORBIDDEN_KEYS` drops it at normalize time. No new denylist entry needed. |
| 2.3 `proxy.js /sp/pixel.gif` | `site_key` | Same — already covered. |

**utm_\*/referrer/channel fields survive**, confirmed by the same pass: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `referrer`, `ai_source`, click-id fields (`gclid` etc. via `normalizeClickIds`) appear in none of `PII_KEYS` or `FORBIDDEN_KEYS` — they pass through to typed columns or the JSON bag exactly as today's conversion producers' equivalent fields already do.

**No FORBIDDEN_KEYS/PII_KEYS update required** for this change — every key these 3 payloads carry is either already an allowed typed/bag field or already on the existing denylist (`site_key`). This was a real check (every key in all 3 object literals enumerated against both sets), not an assumption.

---

## 4. Gating / dedup parity — pageview `event_id` behavior, traced through `deriveEventId`

All three gap sites route through the same `normalizeEvent` → `deriveEventId` path every other producer uses ([normalize.js:124-157](../tinybird/adapter/normalize.js#L124)) — no special-casing needed or proposed.

Traced the precedence chain against what a pageview payload actually carries: `event_id`, `external_event_id`, `stripe_invoice_id`, `stripe_subscription_id`, `order_id`, `payment_id`, `idempotency_key`, `provider_event_id` — **none of these fields are ever present on a pageview payload** (confirmed: none of the three properties objects in §2 set any of them; pageviews have no natural transactional id by definition). Every pageview event_id therefore falls through all 8 named branches to **branch 9: `randomUUID()`** ([normalize.js:152-157](../tinybird/adapter/normalize.js#L152)) — confirmed by reading the precedence chain, matching the dispatch's expectation exactly, not assumed.

**Consequence, stated explicitly:** pageview rows are **append-only and never cross-producer-deduped** by `event_id` (same as the existing pixel/proxy/server-events `$conversion` rows that already hit this same uuid fallback per [normalize.js:152-153](../tinybird/adapter/normalize.js#L152)'s own comment). This is correct and intentional for pageviews — there is no legitimate "this is the same pageview, deduplicate it" concept the way there is for a Stripe invoice or merchant order id. No gating change needed; flagging it so the founder/orchestrator isn't surprised that pageview `event_id`s look random rather than natural.

`event_type` parity: all three sites set `event` to either `'$pageview'` literally or a value defaulting to `'$pageview'` — `normalize.js:250` (`out.event_type = (src.event_type ?? src.event) || 'custom'`) carries that string through unchanged, matching the existing confirmed equivalence from the Phase 4a field-mapping work (`event_type = '$pageview'` in Tinybird ≡ `event = '$pageview'` in HogQL).

---

## 5. Post-wiring verification — identifying rows, not `count()`

Per [CLAUDE.md §10](../CLAUDE.md) ("real-env only... pull identifying rows, not just aggregate counts — a count can look healthy while every underlying row is test/seed data"), the verification after the founder deploys behind `TINYBIRD_DUAL_WRITE` is a **row-level** check, not a count:

```bash
tb --cloud --output json sql "
  SELECT distinct_id, timestamp, utm_source, utm_medium, referrer, page_url, ingestion_method
  FROM events
  WHERE site_id = 'de200000-babe-41d4-a716-446655441111'
    AND event_type = '\$pageview'
  ORDER BY timestamp DESC
  LIMIT 20
"
```

Cross-checked against the equivalent PostHog rows for the **same `distinct_id`s** (via the PostHog MCP `execute-sql`, same site/window) — confirming specific visitor journeys appear in both stores, not just that *some* row count is non-zero in each. This mirrors exactly how Step 0 and checkpoint 4a's smoke tests were done in this conversation (real `tb --cloud sql` + PostHog MCP, read-only, row-level) — same method, just pointed at `$pageview` instead of `$conversion` after the fix lands.

If, after deploy, pageview rows still don't appear for the gating site, the next read-only check is whether `TINYBIRD_DUAL_WRITE` and a real transport (`TINYBIRD_HOST`/`TINYBIRD_APPEND_TOKEN`, [boot.js:33-39](../tinybird/adapter/boot.js#L33)) are actually set on the staging API service — that's a Railway env question for the founder/orchestrator, not something CC can check (no Railway access, [CLAUDE.md §13](../CLAUDE.md)).

---

## 6. What this plan does NOT do

- Does not touch `identify.js`'s `$identify` gap (§1, flagged separately, out of this plan's scope).
- Does not modify `FORBIDDEN_KEYS`/`PII_KEYS` (§3 found no gap requiring it).
- Does not write or push any `.pipe`/`.datasource` file, or any code.
- Does not flip `TINYBIRD_DUAL_WRITE` or touch any env var — that stays a founder/orchestrator action, same as every prior Phase 2c batch in the git history.
- Does not resume Phase 4 pipe work — that stays parked until this lands, is deployed, and the live row-level check in §5 passes.
