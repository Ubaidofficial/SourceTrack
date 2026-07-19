# Phase 4a — HogQL → Tinybird Field Mapping (Pattern B: linear / u_shaped / time_decay / w_shaped)

> Guardrail 5 deliverable, written **before** the pipes below. Verified column-by-column against [`tinybird/datasources/events.datasource`](datasources/events.datasource) (committed schema, source of truth per `SCOPE_v3.md` §2.6) and against the live HogQL queries in `getMultiTouchAttributionLive` ([attribution-engine.js:1382](../api/lib/attribution-engine.js#L1382)).
>
> Two sub-tables: §1 the conversion pull (`convSql`, [engine:1399](../api/lib/attribution-engine.js#L1399)), §2 the pageview pull (`pvSql`, [engine:1478](../api/lib/attribution-engine.js#L1478)). §3 derives the exact touchpoint diff tuple per guardrail 2. §4 pins the lookback window per guardrail 4.

---

## 1. Conversions pull — `convSql` → `conversions_by_site`

| HogQL expr (engine:1400-1417) | Tinybird column (events.datasource) | Type match | Notes |
|---|---|---|---|
| `uuid` | `event_id` | TB: `String` NOT NULL | **Not name-equivalent — semantically different field.** PostHog `uuid` is the engine's own row UUID; TB `event_id` is the canonical app-minted dedup key (§2.5). Selected for completeness/audit only — confirmed by grep ([attribution-engine.js](../api/lib/attribution-engine.js)) that `conv.uuid` is **never read** downstream in `getMultiTouchAttributionLive`'s aggregation loop (only used for joins in `lastTouchAttribution` and other Pattern-A functions, out of scope for this pipe). **Not part of the touchpoint diff tuple.** |
| `distinct_id` | `distinct_id` | `String` NOT NULL both sides | Exact passthrough. |
| `timestamp` | `timestamp` | `DateTime64(3,'UTC')` both sides | Exact passthrough — see §4 for precision requirement (guardrail 1). |
| `properties.conversion_type` | `conversion_type` | TB: `LowCardinality(String) DEFAULT 'untyped'` (insert-time default) vs HogQL: raw bag read, no COALESCE in `convSql` itself | ⚠️ **Defaulting-time mismatch, low live risk.** TB defaults to `'untyped'` at INSERT if the adapter omits the field; HogQL returns the raw stored value (could be `''`/`null` if PostHog's bag is missing it). Confirmed via [normalize.js:21](../tinybird/adapter/normalize.js#L21) that `conversion_type` is **not** in `REQUIRED_COLUMNS` ([normalize.js:34](../tinybird/adapter/normalize.js#L34)) — adapter doesn't force it either, so TB's column DEFAULT is the actual backstop. In practice every live `$conversion` producer route sets `conversion_type` explicitly (it's not bag-only), so this only bites a malformed/quarantined conversion — flagged, not blocking. |
| `toFloatOrZero(toString(properties.conversion_value))` | `conversion_value` | TB: `Float64 DEFAULT 0` (insert-time) vs HogQL: read-time `toFloatOrZero` coercion | Both converge to `0` for a missing/non-numeric value — equivalent in effect, different mechanism (insert-time vs read-time default). Not a parity risk in practice (same convergent value). |
| `properties.utm_source` | `utm_source` | `Nullable(String)` both | Exact passthrough. |
| `properties.utm_medium` | `utm_medium` | `Nullable(String)` both | Exact passthrough. |
| `properties.utm_campaign` | `utm_campaign` | `Nullable(String)` both | Exact passthrough. |
| `properties.referrer` | `referrer` | `Nullable(String)` both | Exact passthrough. |
| `properties.ai_source` | `ai_source` | `LowCardinality(Nullable(String))` both | Exact passthrough. |
| `properties.country` | `country` | `LowCardinality(Nullable(String))` both | Exact passthrough. |
| `properties.device_type` | `device_type` | `LowCardinality(Nullable(String))` both | Exact passthrough. |
| `properties.utm_term` | `utm_term` | `Nullable(String)` both | Exact passthrough. |
| `properties.provider` | `provider` | `LowCardinality(Nullable(String))` both | Exact passthrough. |
| `properties.attribution_status` | `attribution_status` | `LowCardinality(Nullable(String))` both | Exact passthrough. |
| `properties.stitching_method` | `stitching_method` | `LowCardinality(Nullable(String))` both | Exact passthrough. |
| `properties.ingestion_method` | `ingestion_method` | TB: `LowCardinality(String)` NOT NULL, no column DEFAULT, but adapter guarantees it via `REQUIRED_COLUMNS` ([normalize.js:34](../tinybird/adapter/normalize.js#L34), defaulted to `'unknown'` at [normalize.js:257](../tinybird/adapter/normalize.js#L257)) vs HogQL raw bag read | Adapter-level guarantee makes this equivalent to a NOT NULL+default in practice — confirmed, not just assumed. |
| — (filter, not a column) | `event_type = '$conversion'` vs HogQL `event = '$conversion'` | — | Confirmed equivalent: adapter sets `event_type = src.event_type ?? src.event` ([normalize.js:250](../tinybird/adapter/normalize.js#L250)) — i.e. TB's `event_type` carries the **same literal string** PostHog's `event` field had (`$conversion`, `$pageview`, …). No remapping. |
| — (filter, not a column) | `site_id = {{String(site_id)}}` vs HogQL `properties.site_id = '...'` | — | TB has `site_id` as a typed top-level column (not bag); same value, different storage location. Equivalent. |

## 2. Pageviews pull — `pvSql` → `pageviews_windowed_by_site`

All columns below are exact 1:1 passthroughs verified against the same schema (no defaulting-time mismatches on this side — none of these columns have a TB `DEFAULT` clause):

`distinct_id`, `timestamp`, `utm_source`, `utm_medium`, `utm_campaign`, `referrer`, `ai_source`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid`, `li_fat_id`, `li_fatid`, `twclid`, `dclid`, `snapclid`, `pclid`, `sccid`, `ko_click_id`, `page_url`, `utm_term`

Dynamic `custom_param:<key>` columns ([engine:1469-1476](../api/lib/attribution-engine.js#L1469)) map to `JSONExtractString(properties, '<key>')` in Tinybird, since these are JSON-bag fields (§2.6) — not typed columns — in `events.datasource`. Selected dynamically per request exactly as today (only the 1-2 keys the active `groupBy`/`groupBy2` actually need).

Filter: `event_type = '$pageview'` (same equivalence as above) + `site_id` scope + the windowed timestamp range (§4).

## 3. Touchpoint diff tuple (guardrail 2 — derived from `calculateAttribution`'s actual reads, not hand-picked)

Read directly from [`calculateAttribution`](../api/lib/attribution-engine.js#L2886), specifically `tpCh` ([engine:2901-2909](../api/lib/attribution-engine.js#L2901)) and `tpBase` ([engine:2910-2931](../api/lib/attribution-engine.js#L2910)) — the **complete** set of `tp.*` fields either function reads:

| Field | Read by | Populated by current Pattern-B pageview pull? |
|---|---|---|
| `utm_source` | tpCh, tpBase | yes |
| `utm_medium` | tpCh, tpBase | yes |
| `utm_campaign` | tpBase | yes |
| `utm_term` | tpBase | yes |
| `ai_source` | tpCh | yes |
| `gclid`,`gbraid`,`wbraid`,`fbclid`,`msclkid`,`ttclid`,`li_fat_id`,`li_fatid`,`twclid`,`dclid`,`snapclid`,`pclid`,`sccid`,`ko_click_id` | tpCh | yes (all 14) |
| `referrer` | tpCh, tpBase | yes |
| `page_url` | tpCh | yes |
| `timestamp` | tpBase | yes |
| `country` | tpBase | **no** — not in `pvSql`'s SELECT list ([engine:1478-1502](../api/lib/attribution-engine.js#L1478)); always `undefined` → tpBase defaults to `'unknown'`. Structural, not a parity bug — identical on both legs since neither pull populates it. |
| `device` | tpBase | **no** — same as `country`; note this reads `tp.device`, **not** `tp.device_type` (the column name on the conversion side) — pageview rows in this path never carry either key. |
| `browser` | tpBase | **no** — same as above. |
| `landing_page` | tpBase | **no** — same as above (note: distinct from `page_url`, which **is** read by `tpCh`/populated). |
| `custom_<key>` (dynamic) | tpBase (copies any `tp` key starting with `custom_`) | yes, only for the 1-2 keys the active request's `groupBy`/`groupBy2` selected |

**The diff tuple for the touchpoint-set comparison is therefore:** `(distinct_id, timestamp, utm_source, utm_medium, utm_campaign, utm_term, ai_source, gclid, gbraid, wbraid, fbclid, msclkid, ttclid, li_fat_id, li_fatid, twclid, dclid, snapclid, pclid, sccid, ko_click_id, referrer, page_url, custom_<active-key>?)` — `distinct_id` is included because it's the join key the harness uses to group touchpoints per conversion, not because `calculateAttribution` reads it directly. `country`/`device`/`browser`/`landing_page` are excluded from the diff tuple with the structural justification above (always absent/`'unknown'` on both legs today) rather than silently dropped.

## 4. Window pin (guardrail 4 — exact replication, not reimplementation)

Source of truth: [engine:1464-1467](../api/lib/attribution-engine.js#L1464):

```js
const windowDays = attributionWindow && attributionWindow !== 'ltv' && Number(attributionWindow) > 0
  ? Number(attributionWindow) : 30
const fromIso = fromDate.match(/'([^']+)'/)[1]   // start of the conversion date range, NOT date-shifted
const lookbackDate = new Date(new Date(fromIso).getTime() - windowDays * 24 * 60 * 60 * 1000)
const lookbackStr = serializeHogQLDateTime(lookbackDate)
```

`attributionWindow` itself resolves upstream at [api/routes/attribution.js:96-98](../api/routes/attribution.js#L96): `req.query.attribution_window || (ALLOWED_WINDOWS.has(siteWindowStr) ? siteWindowStr : '30')`, where `siteWindowStr` comes from the site's `attribution_window_days` column (Supabase), one of `'ltv','1','7','14','30','60','90'` ([report-config-validation.js:11](../api/lib/report-config-validation.js#L11)).

**Quirk, observed and replicated as-is (not "fixed"):** when `attributionWindow === 'ltv'`, the ternary above still falls through to `windowDays = 30` for this *pageview lookback* computation — `'ltv'` does not mean "unlimited lookback" here (a different code path, [engine:2157-2161](../api/lib/attribution-engine.js#L2157), handles true LTV semantics elsewhere). The Tinybird-side `lookback_from` parameter computation must reuse this **exact** ternary, not a "corrected" version, or window-boundary parity breaks silently for any site configured with `attribution_window_days = 'ltv'`.

**Implementation requirement:** the pipe-calling JS function computes `lookback_from`/`date_from`/`date_to` using the **same `serializeHogQLDateRange`/`serializeHogQLDateTime` helpers** ([hogql-date.js](../api/lib/hogql-date.js)) already imported by `attribution-engine.js`, then passes the resulting ISO-8601 `.SSSZ` strings as Tinybird `DateTime` params verbatim — not a parallel date-math implementation in SQL. This guarantees byte-identical boundary semantics (including the exclusive-end-date-only +1-day shift) because it is literally the same function call on both legs, not a reimplementation that could drift.
