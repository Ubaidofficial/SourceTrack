# Phase 9 — Validation Harness + Golden Tests — SPEC (authoring only, DO NOT BUILD)

> **Status:** DRAFT for founder + orchestrator review. Uncommitted. No harness code, no app changes, no DDL written under this doc.
> **Source of truth:** `tinybird/SCOPE_v3.md` §13 (Phase 9 row) + §14 ("Validation ✅-aware"), `tinybird/GATE3_RECONCILIATION_CONTRACT.md` §65 + §96, and the Phase 4/5 sign-off record in `SESSION_HANDOFF.md`.
> **Authored against ref:** `origin/claude/tinybird-phase1-events-schema` @ HEAD `3ba25db`.
>
> **§13 Phase 9 row (verbatim):** `| 9 | Validation harness + golden tests (generator-driven, tolerance-based) | safety net |`
> **§14 (verbatim):** *Tolerance-based reconciliation (typed/default ≠ schemaless `COALESCE/NULLIF`; `uniq` ~0.5%). Golden tests per attribution model (all 9). MRR round-trip. Refund (signed) test. Cross-store idempotency during dual-write. Tenant-isolation test (site-A token never returns site-B rows).*
>
> Phase 9 = the six §14 checks, made concrete and runnable. Nothing here expands scope beyond §14. Items §14 does not name (null→DEFAULT DDL, browser_name write-side divergence) stay OUT — see §8.

---

## 0. Provenance of the tenant-isolation result (who witnessed what)

The original dispatch asked to mark tenant-isolation (check f) **CLOSED** as a "staging runtime pass done this session." **CC did not run that runtime test** — it was correctly refused mid-session (no rotated `st_endpoint_read` token; rotation precondition unconfirmed, `SESSION_HANDOFF.md:19`), rather than curl deployed endpoints with an absent/unrotated token (§0 secret limits).

**The founder subsequently ran the runtime test in their own shell this session** and reported a disjoint PASS (see §6). That result is **founder-verified, agent-unverified** — CC did not reproduce it and the orchestrator (PostHog MCP scoped to prod `416017`) cannot audit staging Tinybird runs. So (f) is recorded in §6 as a **three-state** status: static audit CLOSED, runtime test FOUNDER-VERIFIED (agent-unverified), token-scope Phase 10. It is neither blanket-CLOSED nor BLOCKED — CC will not label a result it did not witness as agent-verified.

---

## 1. Scope of Phase 9 (the six §14 checks)

| Check | §14 phrase | This doc |
|---|---|---|
| (a) Tolerance reconciliation | "typed/default ≠ schemaless COALESCE/NULLIF; uniq ~0.5%" | §2 |
| (b) Golden tests per model (all 9) | "Golden tests per attribution model (all 9)" | §3 + coverage table |
| (c) MRR round-trip | "MRR round-trip" | §4 |
| (d) Refund (signed) test | "Refund (signed) test" | §5 |
| (e) Cross-store idempotency | "Cross-store idempotency during dual-write" | §6 wrong — see §7 |
| (f) Tenant-isolation | "site-A token never returns site-B rows" | §6 |

---

## 2. (a) Tolerance reconciliation — exact rule per column class

The harness diffs Tinybird `ST_Staging` (Frankfurt) against PostHog `469905` (see §7) over an overlap window, per column class. "Pass" is defined numerically per class — no blanket epsilon.

| Column class | Examples | Comparison rule | Pass condition |
|---|---|---|---|
| **Typed col w/ fixed DEFAULT** | `first_touch_source`→`'direct'`, `first_touch_medium`→`'none'`, `first_touch_campaign`→`''`, `conversion_type`→`'untyped'` | Coalesce BOTH sides through the SAME app read-layer COALESCE (`NULL→'direct'` etc.) before compare. The adapter maps `null`→DEFAULT at ingest (`SESSION_HANDOFF.md:7`), destroying genuine-NULL vs set-to-default — so raw compare is invalid. | **Exact equality after coalescing** on the converting-lead population. Bounded-divergence note: zero affected visitors on the gating site today. |
| **Typed numeric (revenue/value)** | `conversion_value` (Float64) | Direct numeric compare. | **Exact to the cent.** No tolerance. |
| **Bag / NULLIF-affected** | `anonymous_id` = `nullIf(JSONExtractString(properties,'anonymous_id'),'')` | Apply identical `NULLIF(x,'')` on both sides (JSONExtract returns `''` not NULL for a missing key — `live_visitors_bag.pipe` finding). | **Exact equality after NULLIF.** |
| **Approximate distinct** | `count(DISTINCT …)`, `uniq(…)` | ClickHouse `uniq` is HyperLogLog-approximate. | **`|tb − ph| / ph ≤ 0.005`** (±0.5% band, per §14). |
| **Timestamps** | `timestamp`, journey deltas | Compare within-journey INTERVALS (touch→touch, conversion→last-touch), never absolutes — PostHog applies a uniform ingestion offset (+339ms measured, `SESSION_HANDOFF.md:57`) that cancels out of every delta. | **Interval deltas match within ≤ a few ms**; absolute offset ignored. |

**Row-level vs aggregate-level (loud caveat):** Phase 4 proved *row-level* touchpoint-set / picked-touchpoint / credited-platform parity ONLY. The `groupBy`-aggregated API response has **never been diffed end-to-end** (`SESSION_HANDOFF.md` backlog item, carried unchanged). Phase 9's tolerance harness MUST add the aggregation-layer diff; until it runs, aggregate parity is UNPROVEN even for row-level-covered models.

---

## 3. (b) Golden tests per attribution model — all 9

Canonical model set = `ALLOWED_MODELS` (`api/lib/report-config-validation.js:1` == `api/routes/attribution.js:5`), 9 members. Coverage below reflects the Phase 4a–4d sign-off record; "covered" = a deterministic generator fixture exists that proved **row-pull parity** (NOT aggregate-layer — see §2 caveat).

### All-9 coverage table

| # | Model | Fixture today? | Phase-4 sign-off | Harness marker |
|---|---|---|---|---|
| 1 | `last_touch` | ✅ exists (cc-4c, Pattern A, visitor Y) | 4c SIGNED OFF | RUN (row-level); aggregate-diff pending |
| 2 | `ai_platforms` | ✅ exists (cc-4d, Pattern C IN-list) | 4d SIGNED OFF | RUN (row-level); aggregate-diff pending |
| 3 | `linear` | ✅ exists (cc-4a Pattern-B pair) | 4b SIGNED OFF | RUN (row-level); aggregate-diff pending |
| 4 | `u_shaped` | ✅ exists (cc-4a Pattern-B pair) | 4b SIGNED OFF | RUN (row-level); aggregate-diff pending |
| 5 | `w_shaped` | ✅ exists (cc-4a Pattern-B pair) | 4b SIGNED OFF | RUN (row-level); aggregate-diff pending |
| 6 | `time_decay` | ✅ exists (cc-4a Pattern-B pair) | 4a SIGNED OFF | RUN (row-level); aggregate-diff pending |
| 7 | `first_touch` | ✅ **RECORDED** (seed `phase9-fixtures-v1`, fixture #1) — disk-generated, ground truth captured; **ingest founder-run** | never in Phase-4 scope | RUN (row-level) once ingested — see **Recorded fixtures** below |
| 8 | `first_touch_non_direct` | ✅ **RECORDED** (seed `phase9-fixtures-v1`, fixture #2) — disk-generated, ground truth captured; **ingest founder-run** | never in Phase-4 scope | RUN (row-level) once ingested — see **Recorded fixtures** below |
| 9 | `last_touch_non_direct` | ✅ **RECORDED** (seed `phase9-fixtures-v1`, fixture #3) — disk-generated, ground truth captured; **ingest founder-run** | never in Phase-4 scope | RUN (row-level) once ingested — see **Recorded fixtures** below |

### KNOWN-UNCOVERED cross-cutting paths (orthogonal to the 9 — LOUD-FAIL / SKIP, never silent)

- **`flexible_report:2457` windowed path** — `getFlexibleReport`'s inline `windowJoin` (`attribution-engine.js:2236-2255`), fires only on `isTouchModel` AND numeric `hasAttributionWindow` (≠`ltv`) AND `groupBy ∈ {source,medium,campaign,keyword,referrer_domain}`. Phase 4 never diffed it; the reconstructed reference query OOM'd (unresolved whether tool-ceiling or engine). **Harness marker: HARD-SKIP with a visible "UNVERIFIED — founder investigation open" banner.** Never counts toward "all-9 pass." Founder action still open (prod-log check + real endpoint run).
- **Merged-identity (`visitor_id != distinct_id`) — RESOLVED as INERT for Phase 9 (was: HARD-SKIP / "MERGED-IDENTITY UNCOVERED" / must-seed fixture).** Traced from code, not assumed:
  - **(a) The server-side identity merge yields `visitor_id == distinct_id` by design.** Every one of the 13 `dualWriteEvent` producers was traced: none sends a top-level `visitor_id`, and every producer that sets `properties.anonymous_id` sets it equal to `distinctId` (or leaves it absent, so `normalize.js:253` `(src.visitor_id ?? src.anonymous_id) || distinctId` falls back to `distinctId`). Resolved/stitched-id producers (`stripe`/`shopify`/`webhook-incoming`/`conversion-offline`) set `distinctId` to a resolved id but carry a matching-or-absent `anonymous_id`. `server-events.js:69-85` collapses to equal in all branches. SCOPE §2.6 itself documents `visitor_id` as "alias/derive from distinct_id as used." Confidence: **HIGH.**
  - **(b) The read pipes key on `distinct_id`, so `visitor_id` divergence is inert for what Phase 9 tests.** `last_touch_by_site.pipe` (ASOF joins on `conv.distinct_id = src.distinct_id`) and `pageviews_by_visitors.pipe` (`distinct_id IN {{Array}}`) never join/filter on `visitor_id` — a divergent `visitor_id` would not change their output.
  - **(c) PostHog `person_id`-level merges are a SEPARATE mechanism, already cleared by SCOPE §9a** ("Read side never touches PostHog `person_id`/`person.` … Leaving PostHog person-merge behind breaks nothing"). Not the same as (a); not a Phase 9 concern.
  - **(d) RESIDUAL — open data-hygiene item, NOT a Phase 9 harness gap (unverified, LOW confidence):** `proxy.js` spreads client-supplied `...req.body.properties` into the dual-write bag (`proxy.js:126/195/255`), so a client that injects a top-level `visitor_id` key could theoretically surface `visitor_id != distinct_id` via `normalize.js:253`. This is a **data-hygiene / passthrough** question about arbitrary client data, **not** the server-side merge the HARD-SKIP targeted. It was **NOT verified** whether `normalize`/`proxy` strips such a key. Flag for a separate data-hygiene review; it does not gate Phase 9.
  - **Harness marker: NOT a hard-skip.** `last_touch` / `ai_platforms` are not gated on a merged-identity fixture; no merged-identity fixture needs to be seeded for Phase 9.

> **Anti-false-green rule:** the harness reports `PASS (6/9 row-level signed-off · 3/9 recorded-pending-ingest · 0/9 aggregate · 1 path hard-skipped: flexible_report:2457)` — it must NEVER print "all-9 green" while any recorded-pending-ingest / aggregate-pending / HARD-SKIP marker is active. (Models 7/8/9 are RECORDED to disk but NOT yet ingested/run — they count as "green" only after founder ingest + a passing row-level diff. Merged-identity is NO LONGER a hard-skip — resolved as inert, see above; only `flexible_report:2457` remains hard-skipped.)

### Recorded fixtures (#1/#2/#3/#5) — deterministic, ground truth from FILE readback

Generated deterministically (disk-only, no ingest) with **seed `phase9-fixtures-v1`**, reproducible byte-identical via:
`generate_events.js --seed phase9-fixtures-v1 --visitors 400 --sites 3 --days 30 --conversion-rate 0.5`.
Every fixture is single-identity (`distinct_id == visitor_id`). Ground truth was read back from the generated NDJSON file, **not** from staging. **Assert each model against ITS OWN input field** (see realism note below — do NOT expect `first_touch == earliest pageview`).

| # | Model | Journey / site / visitor | Expected value (from its own input field) |
|---|---|---|---|
| 1 | `first_touch` | `j_052179f7` · `site-00` · `52daadd9-98a2-4f9e-a488-513bf268f839` | `first_touch` (source) = **`tiktok`** (the `first_touch_source` column). Conversion value `384.16`, no refund. |
| 2 | `first_touch_non_direct` | `j_06abe464` · `site-01` · `806b4768-fec1-40dc-98cb-da5003a21e6a` | `first_touch_non_direct` = **`reddit`** (argMin over non-direct pageviews, `attribution-engine.js:2047`) **vs plain `first_touch` column = `facebook`** → divergent. Touch seq `[null, reddit]`. Value `429.43`. |
| 3 | `last_touch_non_direct` | `j_06f5bd7b` · `site-01` · `656de8f9-3ae4-4363-b965-77a96f7fa4f7` | `last_touch_non_direct` = **`reddit`** (argMax over non-direct, skips trailing `direct`) **vs live `last_touch` = `direct`** → divergent. Touch seq `[bing, reddit, direct, direct]`. Value `429.42`. |
| 5 | signed-refund | `j_03704157` · `site-02` · `e019d35f-cf1b-402e-9be1-3c4356eb6dbc` | orig `ord_7f229291c0` = **+230.03**; refund `ord_7f229291c0:refund` = **−230.03**; `conversion_type='refund'`, `refund_of=ord_7f229291c0`. **Signed sum nets to 0.00** (distinct `:refund` event_id family → not dedup-dropped). |

> **first_touch REALISM LIMITATION (load-bearing).** The generator sets `first_touch_source` as a fixed per-journey column (`generate_events.js:243,253`) **decoupled** from the per-pageview `utm_source` sequence it also emits (`:261`). Real ingestion **derives** `first_touch_source` from the opening pageview's own utm_source (client-captured then replayed — `tracker/tracker.cookieless.js:95-111`; stored verbatim by `track.js:353` / `identify.js:214` set-once). So the generator diverges from real event shape.
> - **Parity-safe as-is:** §14 golden tests are **store-vs-store parity-scoped** (Tinybird row-pull vs live HogQL, both reading the *same* stored rows), so the decoupling cannot break a parity diff. Fixtures #1/#2/#3/#5 are trustworthy for that purpose.
> - **Boundary condition:** if Phase 9 later asserts attribution **SEMANTIC correctness** (does `first_touch` reflect the true first touch), the decoupling makes #1 unrealistic and a generator fix becomes required.
> - **The one-line fix** (derive `first_touch_source` from the opening pageview's `utm_source`) is a **FOUNDER DECISION — NOT authorized** (see §11 OPEN).

---

## 4. (c) subscription_revenue WRITE-PARITY test — re-scoped from "MRR round-trip"

**Re-scope (founder-approved this session).** The §14 line reads "MRR round-trip," but an MRR-by-source round-trip validates a metric the migration does not produce: **no MRR aggregation exists anywhere in code** (broad search of `api/` + `dashboard/` returned only marketing copy in `SolutionSaaS.jsx` — HIGH confidence), and SCOPE §9:202 parks it (*"MRR Steps 4/5 after migration; trial-start trigger still parked"*). So the Phase 9 gate is re-scoped to what the architecture **does** produce.

- **What Phase 9 validates instead — `subscription_revenue` write-parity:** a subscription-lifecycle event (`checkout.session.completed` $0 carrier → `invoice.paid` → renewal/churn) flows through the EXISTING write path (`stripe-webhook.js` → `nightly-attribution.js` `processConversion` → `insertSubscriptionRevenue` `:825`) and writes a correct `subscription_revenue` row:
  1. **Value** — `amount = conversion_value` for the revenue event (`invoice.paid`), carrier itself carries no revenue.
  2. **Denormalized source** — `first_touch_source`/`first_touch_channel` denormalized from `subscription_identity` (`nightly-attribution.js:832`) when `attribution_status='resolved'`.
  3. **5c carrier-exclusion** — the $0 `checkout.session.completed` carrier is excluded from the `subscription_revenue` insert via `isSubscriptionCheckoutCarrier` (`nightly-attribution.js:819`); it must NOT write a `purchase` row.
- **MRR-by-source round-trip is DEFERRED post-migration** — SCOPE §9:202 "MRR Steps 4/5"; **NOT a Phase 9 gate.** Marker: **N/A this phase — feature not built.**
- **Governance / build status:** this test is **NOT built** — it needs a lifecycle-sequence fixture + a DB-side harness that runs the job against a test site and asserts Supabase rows (staging writes to `subscription_revenue`/`subscription_identity`, plus a `sites` seed). No read-only path exists. **See §11 OPEN (#4).**

---

## 5. (d) Refund (signed) test — given refund handler is a deferred no-op

- **Current state:** the refund handler is Phase 7 scope (`SCOPE_v3.md §13` row 7: "Money rail + refunds + GDPR erasure + conversion-quarantine alarm"), and **Phase 7 has not been built** (`SESSION_HANDOFF.md:34` — deliberately not started). There is no signed-refund reversal path today.
- **What the Phase 9 test asserts given that:** authored as **SKIP-LOUD (no-op contract assertion)** — a `charge.refunded`/signed-refund event currently produces **no revenue reversal and no negative conversion**; the test locks that today's behavior is a clean no-op (does not corrupt revenue, does not double-count), and is marked "PENDING Phase 7 refund handler."
- **Flip condition:** once the Phase 7 signed-refund handler ships, this test flips from no-op assertion to the real assertion — a signed refund reverses the matched `subscription_revenue`/conversion by the signed amount, idempotently, matched across both stores. Until then it must NOT report as a passing refund test — only as PENDING.

---

## 6. (f) Tenant-isolation — THREE states (not blanket-CLOSED, not BLOCKED)

| Layer | Status | Evidence |
|---|---|---|
| **Static param-prune audit** (every read pipe fail-closed on `site_id = {{ String(site_id, required=True) }}`) | ✅ **CLOSED** | Phase 8 audit this session: all 59 `TYPE endpoint` pipes carry it as the first predicate, `required=True`, no default, no `{% if %}` bypass; 4 ASOF-join subqueries in `last_touch_by_site` each bound; `events_by_visitor` readers bound. Verified by CC from pipe source (not runtime). `events_by_visitor_mv` is the projection (readers bind site_id). |
| **Runtime two-tenant DISJOINT negative-test** — 2 of 59 pipes: `doctor_pageviews_30d` (reads `events` directly) + `pageviews_by_visitors` (reads via `events_by_visitor`) | 🟡 **FOUNDER-VERIFIED, agent-unverified** | Founder ran the curls in their own shell this session: site_id=A → **32** rows vs site_id=B → **59,187** rows (disjoint result sets); cross-probe (A's token/param against B's identifier) returned `rows:0` / `data_len:0` both directions. **NOT reproduced by CC; NOT orchestrator-re-verifiable** (orchestrator PostHog MCP is prod `416017`, cannot audit staging Tinybird). Proves the `site_id` PARAM prunes on the 2 deployed pipes. |
| **Token-scope isolation** | ⏳ **Phase 10, untested** | `st_endpoint_read` = `WORKSPACE:READ_ALL` (reads any tenant). Per-tenant JWT deferred to Phase 10 (`SESSION_HANDOFF.md:11`). Out of Phase 9 scope. |

**Re-run guidance:** the runtime leg does **not** need re-running for the 2 tested pipes (`doctor_pageviews_30d`, `pageviews_by_visitors`) unless higher assurance is wanted. **Optional extension:** the same disjoint curls on 2–3 more representative pipes (e.g. one aggregate like `summary`, one JOIN pipe like `last_touch_by_site`) to widen runtime coverage beyond the `events`-direct + `events_by_visitor` pair already exercised. Any such run is founder-run and keyed on a tenant-identifying field / known per-site visitor — NEVER raw `count()`.

**Scope boundary (unchanged):** this leg proves the `site_id` PARAM prunes; it does NOT prove token-scope (a `WORKSPACE:READ_ALL` token can read any tenant — the Phase-10 per-tenant-JWT question).

---

## 7. (e) Cross-store idempotency + GATE3:96 PostHog-project resolution

### (e) Cross-store idempotency during dual-write
- **Assertion:** an event dual-written to PostHog + Tinybird under the same idempotency identity (`deriveEventId`: `stripe_invoice_id` / `stripe_subscription_id:type` / `order_id` per branch) must produce **exactly one row in each store**; a retry with the same key must remain **one row in each** (no double-count, no drop). Claim the idempotency key **after** the write succeeds (CLAUDE.md §6.5/§7), so a retry between write and claim cannot double-count.
- **Pass:** `rows(tb, key) == 1 AND rows(ph, key) == 1` before and after a forced retry; dedup-key collision is a verified no-op.

### GATE3:96 resolution — reconcile against PostHog `469905` (staging), NOT `416017` (prod)
- **Why 469905:** the harness's (b) gate diffs Tinybird `ST_Staging` against PostHog over the overlap window, so it must read PostHog from **wherever the *staging* API's `ph.capture` output lands**. Session 140G-24B verified staging API → PostHog **`469905`** (ingestion confirmed in 469905 only, not prod 416017) — so `469905` is the correct reconciliation target for staging fixtures.
- **Access routing (per dispatch + GATE3:96):** the orchestrator's PostHog MCP is scoped to **prod `416017`**, and a read of `416017` returned **403** for both CC and orchestrator (GATE3:96). Therefore **`469905` reconciliation runs route through CC / founder** (whoever holds a `469905`-scoped read), not through a prod-scoped grant. GATE3:96 flagged this as "resolve as a read-only check at Phase-4 plan time" — this doc resolves it to `469905` on the 140G-24B evidence. (Note: this session's active PostHog MCP happens to be `469905`; do not assume that holds for the orchestrator.)

---

## 8. 5c subscription conversions-count read-side fix (GATE3:65) — Phase 9 deliverable

- **GATE3:65 (verbatim):** *"5c conversions-count `+1`/sub-signup inflation — subscription-mode checkout emits a $0 carrier; revenue+customers correct, conversions-count inflated by 1 per sub-signup. Read-side fix deferred to Phase 9."*
- **Reconciliation note (must surface to founder):** the **live-HogQL** read-side fix has since LANDED on `main` (`3b6c92c`; branch twin `db55f4c`) — `isSubscriptionCheckoutCarrier` now excludes the carrier at both live read sites (`nightly-attribution.js:314/437`, `attribution-engine.js:1605`). So GATE3:65's text ("deferred to Phase 9") predates that fix for the live path.
- **What actually remains for Phase 9 (describe, do NOT implement):**
  1. **Tinybird-side parity:** any ported Tinybird conversion-COUNT read (e.g. `summary`, `dash_*`, `conversions_by_site` consumers) must apply the SAME carrier exclusion so Tinybird counts match the corrected live counts. Audit which pipes count conversions and confirm/add a `isSubscriptionCheckoutCarrier`-equivalent predicate — NOT done here.
  2. **Golden-test assertion:** a fixture with a subscription signup ($0 carrier + `invoice.paid`) asserts conversions-count is **not** inflated by the carrier in EITHER store, and that revenue + customers remain correct — locking the fix across the dual-write.
- **Fix-forward only:** no backfill of historical duplicated rows (count-only impact; the fields needed to retroactively identify carrier rows were never stored — per `db55f4c` commit body).

---

## 9. Fixtures the FOUNDER must seed before the harness can run all-9 (agents do NOT seed)

| Fixture | Needed for | Status / source |
|---|---|---|
| **`first_touch` deterministic fixture** | model #7 golden test | ✅ **RECORDED** (seed `phase9-fixtures-v1`, #1 — ground truth in §3); **ingest still founder-run** |
| **`first_touch_non_direct` fixture** (≥1 direct + ≥1 non-direct touch) | model #8 | ✅ **RECORDED** (#2, §3); ingest founder-run |
| **`last_touch_non_direct` fixture** | model #9 | ✅ **RECORDED** (#3, §3); ingest founder-run |
| **Signed-refund fixture** | (d) refund test — only meaningful once Phase 7 handler ships | ✅ **RECORDED** (#5, §3); ingest founder-run |
| **Organic-SEO fixture** (referrer=google, NO gclid, real conversion) | `seo_revenue_landing_pages` organic path — **zero coverage today**; every `utm_source=google` fixture on the gating site is paid/cpc | ❌ MUST SEED — `SESSION_HANDOFF.md:8, :22` |
| ~~Merged-identity fixture~~ | ~~un-gate merged-identity paths~~ | ✅ **NOT NEEDED — RESOLVED as inert** (§3): server-side merge yields `visitor_id == distinct_id`; read pipes key on `distinct_id`. No fixture to seed. |
| **Subscription lifecycle-sequence fixture** ($0 carrier → `invoice.paid` → renewal/churn) | (c) §4 subscription_revenue write-parity + (e) idempotency + §8 5c count assertion | ❌ NOT BUILT — §11 OPEN #4. (The deferred **MRR-by-source round-trip** — Growth $79/mo + annual Founder $99/yr, CLAUDE.md §7 ladder — is **post-migration, SCOPE §9:202; not a Phase 9 gate**.) |

> Per standing rule: **founder seeds/ingests these; agents do not create seed/test rows or ingest** (CLAUDE.md §0). RECORDED fixtures are disk-generated with ground truth captured, but the harness stays SKIP-LOUD / recorded-pending-ingest until the founder ingests them; MUST-SEED / NOT-BUILT fixtures stay SKIP-LOUD.

---

## 10. Explicitly OUT of Phase 9 (stays floating — do NOT fold in)

§14 does not name these, so Phase 9 does not own them:

| Item | Where it lives | Written-down deferral |
|---|---|---|
| **null→DEFAULT (Nullable-vs-DEFAULT) DDL decision** | `SESSION_HANDOFF.md:7, :23` | **Phase 7/8** data-model review — NOT Phase 9. (Phase 9's tolerance rule §2 *works around* it via app-coalesce compare; it does not *resolve* the DDL.) |
| **`browser_name` write-side divergence** (`cc-verify-proxye-20260630a`: `'webkit'` in TB vs `None` in PH) | `SESSION_HANDOFF.md:24` | **Unphased write-side reconciliation item** — a dual-write adapter value mismatch, not a read-pipe/harness bug. Flagging only. |

If a Phase 9 tolerance diff *surfaces* either (e.g. a browser_name mismatch trips §2), the harness REPORTS it as an out-of-scope write-side finding — it does not fix it and does not fail the model golden test on it.

---

## 11. Decisions + remaining open questions

**Confirmed by orchestrator (encoded as decided):**
- ✅ **§7 → reconcile against PostHog `469905` (staging).** Routes through CC/founder; orchestrator MCP is prod `416017` and cannot audit these runs.
- ✅ **§8 → Phase 9 5c work = Tinybird-side count parity + golden test ONLY** (live-path fix already on `main` `3b6c92c`).
- ✅ **§10 → null→DEFAULT = Phase 7/8; browser_name = unphased write-side.** Neither folded into Phase 9.
- ✅ **§6 runtime leg → founder-verified for the 2 tested pipes** (agent-unverified); no re-run needed unless higher assurance wanted.

**Still open (before build):**
1. `st_endpoint_read` rotation status — needed only if the optional §6 extension (2–3 more pipes) is pursued, or for Phase 10.
2. Approve the fixture seed/ingest order (§9) — which land first? (Founder seeds/ingests; agents do not.)

**OPEN — founder decisions (do NOT resolve; not answered here):**
- **#4 subscription_revenue write-parity — build timing.** OPEN: founder decision — build now vs schedule vs defer. Founder-gated (staging Supabase writes to `subscription_revenue`/`subscription_identity` + a `sites` seed; **no read-only path** — the write is what's under test). ~1 day build; see §4.
- **#6 merged-identity — RESOLVED (no longer open).** Traced (§3): the server-side merge yields `visitor_id == distinct_id` across all 13 `dualWriteEvent` producers, and the read pipes key on `distinct_id`, so the divergence is inert for Phase 9. No fixture is built or seeded. Residual data-hygiene item (proxy passthrough, §3(d)) is flagged for a separate review, not a Phase 9 gate.
- **#1 `first_touch` generator realism fix.** OPEN: founder decision, **NOT authorized** — derive `first_touch_source` from the opening pageview's `utm_source` (see §3 realism note). Not needed for parity-scoped §14 tests; only if Phase 9 later asserts attribution semantic correctness.
