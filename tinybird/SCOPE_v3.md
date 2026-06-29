# SourceTrack — Tinybird Migration & Optimization Scope (v3)

> **Purpose.** Build-ready scope for moving the event/attribution plane from PostHog (US) to **Tinybird Forward (Frankfurt / europe-west3)**, optimized for **cost, performance, and scale-when-needed**. Supabase stays as the OLTP system of record. This is the OLAP half only.
>
> **Honesty markers:** ✅ VERIFIED (Tinybird docs, 2026-06-29) · 🟦 RECOMMENDATION · ⚠️ VALIDATE before load-bearing.
>
> **v3 supersedes v2.** It bakes in the `$conversion` contract audit (CC, verified vs `origin/main @ 6223402`) and the six locked schema decisions.

---

## 0.1 What changed from v2

| # | Change | Why |
|---|---|---|
| A | **Schema is now concrete** (§2.6) — real typed-vs-bag column list from the audit, not assumptions. | Audit enumerated every `$conversion` key with file:line + read-side usage. |
| B | **Canonical `event_id` dedup column** (§2.5) replaces PostHog's random event-uuid mechanism. | Today nightly dedups on PostHog `uuid` (`nightly:715`) — PostHog coupling, and it wouldn't catch a true duplicate conversion. Deterministic `event_id` does both. |
| C | **Ingest adapter = normalization layer** (§3.1), not just a batcher. | Resolves 4 audit ambiguities at one choke point: `is_conversion` coverage, raw PII, `pixel.js` field divergence, scattered time fields. |
| D | **Person-merge confirmed irrelevant** (§9a) — green light for single-table. | Audit: all stitching is our JS on `distinct_id` + Supabase `site_identity_links`; zero reads of PostHog `person_id`/`person.`. |
| E | **Correction: last-touch is NOT a clean ingest MV** (§5). | It needs the visitor's prior touchpoints, which an ingest-time MV can't see. Only first-touch (denormalized) + present-field aggregations are clean MVs. |
| F | **Free tier is org-wide and shared** (§0.3). | `imubaid93` org Free: 1k req/day + 10GB + 0.25 vCPU **shared across `ST_Staging` + `SourceTrack`**, not per-workspace. |
| G | **"Scalable, not day-1 100M"** reframing (§0.4). | Typed columns + sorting keys now (expensive to change); MVs + custom-param optimization deferred until load demands (cheap to add). |

The v2 spine is unchanged and correct: single-table, sorting-key-first, compute-not-requests, app-side exactly-once money rail, JWT/param tenant isolation, MV-vs-Copy-Pipe split.

---

## 0.2 Locked context

- Greenfield, **no historical backfill** (zero real customers; `techrupt.pk` = test). ✅
- **Tinybird Forward**, **europe-west3 / Frankfurt** (both workspaces confirmed EU). ✅
- Workspaces: **`ST_Staging`** (staging) · **`SourceTrack`** (prod). One `events` table, 4 logical event types (`$pageview`, `$conversion`, `$identify`, dynamic/custom).
- Governance: file-based via CC; human hand-applies staging→prod; orchestrator read-only verify; no self-merge; staging-first.

## 0.3 Plan reality (org-wide Free) ⚠️

`imubaid93` org = **Free**, and the meters are **shared across all workspaces in the org**: ~**1,000 requests/day**, **10 GB** storage, **0.25 vCPU**, 1 thread/request.
- **Build/validate on Free: fine** — synthetic volume is controlled; ingest batches don't hit the read meter.
- **Staging caution:** golden-test sweeps fire many reads → can brush the shared 1k/day. Budget validation runs.
- **Prod cutover GATE:** `SourceTrack` must move to **Developer ($25/mo)** or Startup-Program credits before Phase 10. 10GB + 1k req/day won't hold production.
- **Load-test caveat:** on 0.25 vCPU, validate the **query plan / scan shape** (index scan vs full scan via `rows_read`), **not** absolute p95 — defer latency sign-off to a Developer-tier run.

## 0.4 Scalability principle

**Decide now what's expensive to change; defer what's cheap to add.**
- **Now (irreversible-if-wrong):** sorting keys (both projections), single-table schema, typed-vs-bag column choices, `event_id` dedup, app-side exactly-once money rail, tenant isolation on every read pipe.
- **Later (reactive to measured load):** materialized views (design now, build when a raw scan gets slow), endpoint cache, custom-param Map optimization, vCPU sizing / replicas, plan upgrade.

---

## 1. Target architecture

```
Producers (14) ─► Normalization+batch adapter ─► Events API ─► events  (single MergeTree, append-only, event_id-deduped)
                  (canonical contract, PII strip,                  │
                   default-fill, timestamp guarantee)              ├─► MVs (real-time, present-field aggregations)
                                                                   ├─► Copy Pipes / windowed (journey-shape: last-touch, linear, time-decay, nightly)
                                                                   └─► journey projection MV  (site_id, visitor_id, timestamp)
Dashboard/API ◄─ backend-mediated, site_id-scoped endpoint pipes ◄─┘
Nightly read-back ─► subscription_revenue, etc. ─► Supabase (OLTP)
```

Supabase stays for `sites`, plans, RLS, auth, `subscription_revenue`, idempotency keys, **`site_identity_links`** (the canonical identity graph). No hot-path Postgres joins in Tinybird (§3.3).

---

## 2. Data model (concrete, from the audit)

### 2.1 Single `events` table 🟦
`MergeTree`, append-only, `event_type LowCardinality(String)` discriminator. Faithful to PostHog; ~75 reads stay near-mechanical; stitching stays single-table.

### 2.2 Sorting keys — both projections ✅🟦
- **Base** (`events`): `ENGINE_SORTING_KEY "site_id, timestamp"` — time-ordered reads (dashboards, rollups).
- **Journey projection** (MV → `events_by_visitor`): `ENGINE_SORTING_KEY "site_id, visitor_id, timestamp"` — visitor-ordered reads (journeys, multitouch, time-to-convert). Full second copy of raw events re-sorted (≈2× raw storage; cheap at your volume). ⚠️ Tinybird Forward may expose native ClickHouse `PROJECTION` to avoid the copy — unverified; default to the second-datasource MV (documented path).
- ⚠️ **Load-test both keys** (scan shape on Free; latency later on Developer).

### 2.3 Partition / TTL ✅
`ENGINE_PARTITION_KEY "toYYYYMM(timestamp)"` (lifecycle only, one column). `ENGINE_TTL "timestamp + toIntervalDay(400)"` generous; **per-site retention enforced app-side** (scheduled delete-by-condition) to respect the `NULL = keep-forever` paid-site sentinel (§10).

### 2.4 Nullable policy ✅🟦
Prefer **non-nullable + `DEFAULT`** over `Nullable(...)`. The read side's pervasive `COALESCE(NULLIF(x,''), '<default>')` becomes the column default. Null→default mapping is defined per column in §2.6 and is a primary reconciliation source (§14).

### 2.5 Dedup — canonical `event_id` ✅🟦 (decision #1)
- One **`event_id String`** column, **deterministic per logical conversion**: natural id where it exists (Stripe invoice/subscription id, Shopify order id, offline `external_event_id`/`idempotency_key`), generated server-side for browser conversions.
- **Exactly-once = app-side:** Supabase `revenue_idempotency_keys` claim on `(site_id, event_id)` **before** emit → `events` stays clean append-only → revenue MVs safe (no AggregatingMergeTree-on-ReplacingMergeTree ✅).
- `event_id` is also the **query-time dedup key** for any surface needing exact counts. Replaces the PostHog-uuid mechanism (`nightly:715`) entirely.

### 2.6 Column plan (TYPED vs JSON-bag) — from the audit

**TYPED columns** (appear in WHERE/GROUP BY/JOIN/ORDER, or are durable identity/revenue keys):

| column | type | null/default | notes |
|---|---|---|---|
| `site_id` | String | NOT NULL | tenant key; every query WHERE |
| `event_type` | LowCardinality(String) | NOT NULL | discriminator; replaces trusting `is_conversion` (decision #2) |
| `event_id` | String | NOT NULL | canonical dedup key (§2.5) |
| `distinct_id` | String | NOT NULL | the stitching join key |
| `visitor_id` | String | NOT NULL | journey-projection sort key (alias/derive from distinct_id as used) |
| `timestamp` | DateTime64(3) UTC, CODEC(DoubleDelta,ZSTD(1)) | NOT NULL | authoritative time (decision #4); adapter guarantees it |
| `conversion_value` | Float64 | DEFAULT 0 | `SUM(toFloatOrZero())`; signed for refunds (§9) |
| `currency` | LowCardinality(String) | Nullable | stripe/shopify/offline |
| `conversion_type` | LowCardinality(String) | DEFAULT 'untyped' | WHERE+GROUP BY |
| `ingestion_method` | LowCardinality(String) | NOT NULL | drives PROVIDER/ATTRIBUTION/STITCHING SQL |
| `provider` | LowCardinality(String) | Nullable | COALESCE w/ ingestion_method |
| `stitching_method` | LowCardinality(String) | Nullable | ATTRIBUTION_STATUS/STITCHING SQL |
| `attribution_status` | LowCardinality(String) | Nullable | |
| `external_event_id` | String | Nullable | dedup/idempotency input |
| `first_touch_source` | LowCardinality(String) | DEFAULT 'direct' | GROUP BY + WHERE |
| `first_touch_medium` | LowCardinality(String) | DEFAULT 'none' | GROUP BY |
| `first_touch_campaign` | String | DEFAULT '' | GROUP BY |
| `first_touch_timestamp` | DateTime64(3) | Nullable | |
| `utm_source` | String | Nullable→'direct' on read | WHERE+GROUP+JOIN |
| `utm_medium` | String | Nullable→'none' on read | GROUP BY |
| `utm_campaign` | String | Nullable→'' on read | GROUP BY |
| `utm_content`, `utm_term` | String | Nullable | mostly SELECT |
| `gclid,gbraid,wbraid,fbclid,msclkid,ttclid,li_fat_id,li_fatid,twclid,dclid,snapclid,pclid,sccid,ko_click_id` | String (×14) | Nullable | JS-read for paid-channel classification (`nightly:548–561`) |
| `ai_source` | LowCardinality(String) | Nullable | JOIN/COALESCE in attribution |
| `page_url` | String | Nullable | JS landing-page derivation (may be redacted) |
| `referrer` | String | Nullable | REFERRER_DOMAIN_SQL |
| `country` | LowCardinality(String) | Nullable→'unknown' on read | WHERE+SELECT |
| `device_type` | LowCardinality(String) | Nullable→'unknown' on read | WHERE+GROUP |
| `browser_name` | LowCardinality(String) | Nullable→'unknown' on read | JS-read |
| `server_timestamp`, `occurred_at` | DateTime64(3) | Nullable | NOT sort keys |
| `webhook_customer_id` | String | Nullable | durable identity (subscription_revenue) |
| `stripe_subscription_id` | String | Nullable | durable |
| `stripe_invoice_id` | String | Nullable | durable |
| `site_key` | String | Nullable | ⚠️ customer secret — see note |

> **`site_key` note:** never read in HogQL and is a customer-facing secret (§6.5 of the design spec). 🟦 **Drop it from the analytics table** rather than store it. The adapter must not forward it.

**JSON-bag** (`properties String \`json:$\``) — never in WHERE/GROUP BY, or unbounded/dynamic, or CAPI-only:
`conversion_event_id` (dead on read), `order_id`, `payment_id`, `provider_event_id`, `ref_param`/`source_param`/`via_param`, `utm_id`, `st_campaign_id`/`st_adgroup_id`/`st_ad_id`/`st_target_id`/`st_network`/`st_device`/`st_matchtype`/`st_verify`, `browser_version`/`os_name`/`os_version`, `anonymous_id`, `user_id`, `has_resolved_anonymous_id`, `webhook_user_id`/`webhook_email_present`, `identity_resolution_source`/`identity_resolution_status`, `stripe_event_type`/`stripe_billing_reason`, `order_name`, `webhook_source`/`raw_payload`(truncated+redacted), `user_agent`, `idempotency_key`, `external_id`, `form_name`/`form_provider`/`form_action_host`/`form_action_path`/`page_path`, `fbp`/`fbc`(CAPI-only), `custom_properties` + dynamic `...customParams`, `proxy`, `tracking_method`.

**DROP entirely (PII denylist, decision #3):** raw `email`, `name` — adapter strips before POST; **no PII columns** in schema. Defense-in-depth over upstream redaction.

**Dynamic custom-params (decision #5):** JSON `properties` now; the `custom_param:<key>` GROUP BY paths read via `JSONExtract`. ⚠️ If hot later, add `Map(String,String)` or a long-format custom-params MV — derivable, no base-table migration. Confirm Forward's Map group-by support + perf before relying on that path.

---

## 3. Ingestion

### 3.1 Normalization + batch adapter 🟦 (upgraded — decisions #2/#3/#4/#6)
One choke point between the 14 producers and the Events API enforces the **canonical contract** before batching:
- **Default-fill** typed columns (e.g. `conversion_type='untyped'`, first-touch defaults).
- **Guarantee `timestamp`** — UTC; if a producer omitted it, stamp server-receive time (it's the sort/partition key, must be NOT NULL).
- **Strip PII** (`email`/`name` denylist) and **drop `site_key`** before POST.
- **Normalize `pixel.js` divergence** (`value`→`conversion_value`, `browser`→`browser_name`, `os`→`os_name`; fill missing `event_id`) so there's one contract — don't exclude (loses real conversions), don't leave divergent (quarantines/mis-maps).
- **Stamp canonical `event_id`** (§2.5) if not already set from a natural id.
- Then **buffer + batch** as NDJSON (reuse the `posthog-node` flush pattern: flush at N events or T ms; flush-on-shutdown).

### 3.2 Events API mechanics ✅
NDJSON batches (rows-per-request **don't count** against the rate limit → batching is the throughput lever); optional Gzip/Zstd; ⚠️ ~10MB/req (Developer) / 100MB (SaaS+); data queryable <4s; **not idempotent** (our app-side `event_id` dedup is the guard); 429 = retriable with backoff. `DATASOURCE:APPEND` token, per-env.

### 3.3 Supabase dimensions — no hot-path joins 🟦
Per field: **denormalize into the event at ingest** (stable-per-event config) **or pass as query param** (request-time values). Don't read-time-join Tinybird→Postgres. List the Supabase fields the ~82 queries reach for and route each.

---

## 4. Read design

~75 mechanical reads → site-scoped endpoint pipes (`WHERE site_id = {{String(site_id)}}` backend-injected). 5 HIGH self-joins → §5. 2 N+1 loops → single windowed queries. Consolidate dashboard fanout. Endpoint cache for hot reads (defer until measured). Backend-mediated reads mirror today's boundary.

---

## 5. MV vs Copy Pipe split ✅🟦 (corrected — change E)

**Clean ingest-time MVs** = aggregations over **fields present on each event**: traffic counts, revenue-by-(stored-)source, AI-source rollups, and **first-touch** (denormalized onto each conversion already).

**Journey-projection windowed reads / Copy Pipes** = anything reconstructing the journey from prior touchpoints: **last-touch, linear, time-decay, multi-touch** — i.e. your 5 HIGH self-joins. An ingest-time MV only sees the inserted block, not the visitor's history, and time-decay weights depend on a conversion that may arrive after the touchpoints.

> **Do not MV a last-touch/linear/time-decay model** — it will hit the MV deploy-time guardrail and/or be wrong.

**MV mechanics (verified):** `.pipe` `TYPE materialized` + `DATASOURCE` target (AggregatingMergeTree); `-State` in MV, `-Merge` at read; incremental per-block; deploy-time guardrail rejects too-slow MVs; no MV on UNION; populate failure auto-unlinks. **`uniq` is approximate (~0.5%)** → visitor counts won't byte-match PostHog; bake into reconciliation tolerance or use `uniqExact` where exactness matters.

**Per §0.4:** design the MV set now (sorting keys make them slot in cleanly), **build when a raw scan actually gets slow** — not day 1.

---

## 6. Tenant isolation ✅

Forward has **no `:sql_filter`** → row-level isolation via **fixed params** (backend-injected, recommended for the migration) or JWT `fixed_params:{site_id}` (browser-direct, later). JWTs: HS256 signed with workspace admin token, mandatory `exp`. **Every read pipe must be `site_id`-scoped.** Tokens: admin (CI/secrets only) · ingest `DATASOURCE:APPEND` · read `PIPES:READ` per env · per-tenant JWT (option B).

---

## 7. Cost model ✅

vCPU/compute, not requests: vCPU baseline + overage (⚠️ ~$0.0002/vCPU-s), storage (⚠️ ~$0.058/GB), egress (⚠️ ~$0.01–0.10/GB); queries/day unlimited (paid); ~600 QPS = reliability safeguard, not billed. Cost levers = perf levers: MVs → sorting keys → consolidation/cache → N+1 batching. At 100M/mo capacity is a non-issue; the bill is a function of how queries are written.

---

## 8. Heavy-load behavior ✅

Reads stay volume-independent IF queries hit MV/Copy summaries + the right sorting key + cache + consolidated fanout (earned, not automatic). Avoid heavy self-joins over raw events bursting past the 2–3× vCPU allowance → 429; prevented by §5. Sustained load → vertical scale; Enterprise → replicas. Ingest: batch, buffer, retry 429. ⚠️ Load-test at representative volume before key commitment + cutover.

---

## 9. Money rail ✅

- Append-only + exactly-once via `event_id` (§2.5); no RMT under revenue MVs.
- **Refunds/corrections = compensating signed events** (negative `conversion_value`); revenue MVs `sumState` over signed values → net correct.
- **Byte-match coupling:** money-rail keys typed + name-locked in one constants module; nightly read-back reads exact names it wrote.
- **Conversion-quarantine = revenue alarm** (§11) — a malformed conversion lands in quarantine uncounted.
- Nightly read-back → `subscription_identity`/`subscription_revenue` in Supabase (unchanged); orchestrator verifies both sides read-only.
- ⚠️ MRR Steps 4/5 after migration; trial-start trigger still parked.

### 9a. Person-merge — CONFIRMED safe ✅ (audit finding D)
All attribution stitching is our own JS on `distinct_id` + Supabase `site_identity_links`. Read side **never** touches PostHog `person_id`/`person.` (grep returns nothing). `$identify`/`ph.alias()` are fire-and-forget telemetry only; LTV explicitly excludes UUIDv4 distinct_ids (`engine:2373`) rather than relying on a server merge. **Leaving PostHog person-merge behind breaks nothing.**

---

## 10. GDPR / retention ✅⚠️

90d window persists as a Tinybird TTL/retention question. **Per-site retention ≠ table TTL** — keep purge app-side (scheduled delete-by-condition on `site_id`+`timestamp`), respect `NULL = keep-forever`. Erasure replaces PostHog Persons REST with Datasources delete API (`delete_condition`, ADMIN-scope, server-side, audited). Sign Tinybird DPA; add Tinybird + GCP europe-west3 sub-processors; remove PostHog after `posthog-node` + `posthog-js` gone. ⚠️ SOC 2 report Enterprise-gated.

---

## 11. Observability ✅🟦

Repoint `health-agent.js` off PostHog → service datasources `pipe_stats_rt` (30-day), `datasources_ops_log`, `jobs_log`. Alerts: **vCPU-overage spend** (highest), **conversion-quarantine** (= silent revenue loss), general quarantine spike, MV/Copy populate failure, ingest 429 rate.

---

## 12. Synthetic event generator (Phase 0 build item) 🟦

One generator feeds the Phase-1 load test (representative volume, realistic `site_id`/`visitor_id` cardinality, multi-touch journeys, full ~70-key conversions, refunds, null/empty + dup edge cases) **and** Phase-8 dual-write validation (deterministic, replayable into both stores to diff). Generate against the finalized §2.6 schema.

---

## 13. Phase plan (order, not time-boxed)

| # | Phase | Risk |
|---|---|---|
| 0 | Synthetic generator + dev loop (`tb local`, branches, `--check`) on `ST_Staging` | enabling |
| 1 | Single-table `.datasource` (§2.6) + both sorting keys + null→default mapping + load test (scan-shape on Free) | **highest design risk** |
| 2 | Normalization+batch adapter + dimension denormalization + dual-write | medium (money) |
| 3 | MVs (present-field rollups + journey projection) — **designed; build when load demands** | high |
| 4 | Copy Pipes / windowed (last-touch, linear, time-decay, nightly) | high |
| 5 | Mechanical endpoint ports (~75) | low |
| 6 | N+1 rewrites | medium |
| 7 | Money rail + refunds + GDPR erasure + conversion-quarantine alarm | **highest** |
| 8 | Tenant-isolation pass (every read pipe) | high |
| 9 | Validation harness + golden tests (generator-driven, tolerance-based) | safety net |
| 10 | Cutover + legal (+ **prod plan upgrade**, keep PostHog readable for revert window, drop `posthog-js`, decommission `posthog-node` after) | medium |

Phases 2 **and** 7 touch the money rail → orchestrator read-back on both.

---

## 14. Validation ✅-aware

Tolerance-based reconciliation (typed/default ≠ schemaless `COALESCE/NULLIF`; `uniq` ~0.5%). Golden tests per attribution model (all 9). MRR round-trip. Refund (signed) test. Cross-store idempotency during dual-write. Tenant-isolation test (site-A token never returns site-B rows).

---

## 15. Open items (founder / empirical)

- ⚠️ Apply to **Startup Program** for prod-plan pricing (Free won't survive cutover — §0.3).
- ⚠️ **Load-test both sorting keys** (scan shape now; latency on Developer later).
- ⚠️ Confirm Forward **Map group-by** support before relying on the custom-param optimization.
- ⚠️ Confirm Forward exposes native `PROJECTION` (else journey projection = second-datasource MV, the default).
- ⚠️ Confirm current **Events API req/sec** on your plan.
- 🟡 Carryover: **quota-before-persistence** billing-integrity question in `track.js` — confirm resolved.

---

## 16. Marketing site separation (separate workstream)

Splitting marketing out is a good call (pSEO velocity + deploy decoupling + CWV). Steer **away from WordPress** (contradicts no-ops + privacy brand). Best fit: **Astro + Git-based CMS** (reuses Tailwind tokens, near-zero ops, top SEO/CWV); Framer/Webflow for fastest ship; WordPress only for a WP-fluent marketer. Non-negotiables: marketing on apex/`www` (indexable), app stays noindex-except-login/signup (PR #86), one indexable docs home, 301s+sitemap+canonical preserve PR #86, dogfood cookieless tracking, EU hosting. **Don't run concurrently with the Tinybird migration** — finish one first.

---

**Status:** Build-ready. Schema concrete from the audit; six decisions locked; person-merge cleared. Open the build at Phase 0 (synthetic generator + dev loop) and Phase 1 (the `.datasource`).
