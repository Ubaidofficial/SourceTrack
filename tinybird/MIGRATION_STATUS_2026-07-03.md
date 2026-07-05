# Tinybird Migration — VERIFIED status vs SCOPE_v3 Phases 0–10

> **Verified at HEAD `9f7f3f3`** (`claude/tinybird-phase1-events-schema`, post-#91–#96), 2026-07-03. Uncommitted status doc; replaces the stale SESSION_HANDOFF.md narrative.
> **Evidence classes:** ✅ VERIFIED = I ran the grep/read/query in this session at this HEAD. 🔁 RELAYED = prior-session record (handoff/PR body), not re-executed now. ⚠️ INFERRED = derived from verified facts, not directly observed.

| Phase | Status | One-line evidence |
|---|---|---|
| 0–1 schema/ingest | ✅ COMPLETE | datasources committed + deployed (live MCP answers) |
| 2/2c dual-write | ✅ COMPLETE (flag-gated) | 13 `dualWriteEvent` call sites / 10 producer routes |
| 3 visitor projection | ✅ COMPLETE | `events_by_visitor` + MV pipe committed, consumed by 4c/4d pipes |
| 4 parity pipes+diffs | ✅ COMPLETE | 5 pipes deployed; 6/9-model harness committed (#95) |
| 5 endpoint ports | 🟡 PARTIAL (authored+deployed; coverage unproven) | 60 pipes; ≥2 read files have no matching pipe |
| 6 N+1/consolidation | 🟡 PARTIAL | aiplatform rewrite ✅; nightly N+1 still present ✅; consolidation not merged ✅ |
| 7 money-rail trio | 🔴 NOT-STARTED (except carrier COUNT fix) | 0 grep hits for all three items |
| 8 tenant isolation | ✅ param-level PASS (now independently run) | 59/59 fail-closed; token-level deferred to P10 |
| 9 validation harness | 🟡 6/9 committed; live-run gap; 3 models two-store-blocked | see §9 |
| 10 read cutover | 🔴 NOT-STARTED (1 of ~75 call sites cut over) | 77 `queryHogQL` hits / 16 files |

---

## Phases 0–5 (condensed)

- ✅ `tinybird/datasources/events.datasource`, `events_by_visitor.datasource`, `pipes/events_by_visitor_mv.pipe` committed; deployment VERIFIED live (the MCP's pipe tools answer; fixture rows returned this session).
- ✅ Dual-write producers: `grep -rn dualWriteEvent api/` → 13 call sites across track.js, proxy.js (×3), conversion.js, conversion-offline.js, server-events.js, stripe-webhook.js (×2), webhook-incoming.js, shopify-webhook.js, pixel.js — all flag-gated (`TINYBIRD_DUAL_WRITE`); wiring test committed (`api/tests/pageview-dualwrite-wiring.test.js`).
- 🟡 Phase 5: 60 `.pipe` files committed; 59 endpoint + 1 MV deployed (audit output below). ⚠️ INFERRED gap: mapping pipe names to the 16 PostHog-reading files leaves at least `hygiene.js` (5 call sites) and `ai-chat.js` (1) with no obviously matching pipe — port-completeness vs the full read surface was never proven 1:1.

## Phase 6 — N+1 rewrites + consolidation: PARTIAL

- ✅ **aiplatform:505 rewrite DONE**: [attribution-engine.js:473-482](../api/lib/attribution-engine.js) (`Phase 6 N+1 rewrite (aiplatform:505): raised from 100 -> 2500`, `AI_ATTRIBUTION_VISITOR_BATCH_SIZE = 2500`) + the ported keyset-cursor fallback (`_cursor_key`, :612-619, from main `e078e4a` via #91).
- ✅ **nightly N+1 STILL PRESENT**: [nightly-attribution.js:548-597](../api/jobs/nightly-attribution.js) — `processConversion` issues one `touchpointsQuery` per conversion, called in sequential per-conversion loops at :313 (backfill) and :436 (main run). Unchanged; `PHASE7_NIGHTLY_TOUCHPOINTS_NPLUS1_PROPOSAL.md` remains proposal-only.
- ✅ **Consolidation NOT merged**: both real dup clusters from `PHASE6_CONSOLIDATION_PLAN.md` (analytics 5→1; alerts↔integrations 4-shared) are still separate files — `summary/sources_ai/sources_ref/browsers/os.pipe` all exist individually. The plan itself marks the merges "later".

## Phase 7 — refunds / GDPR-Tinybird / quarantine: NOT-STARTED (scoped this session)

All three re-verified at this HEAD (fresh greps, 2026-07-03):
- **Refund producer**: `charge.refunded|refund.created` in `api/` → **0 hits**. Webhook gate 200-ignores non-checkout/non-subscription events. ✅ Groundwork exists: adapter tests lock the signed-negative + stamped-event_id contracts ([normalize.test.js:39](../tinybird/adapter/__tests__/normalize.test.js), [derive-event-id.test.js:80](../tinybird/adapter/__tests__/derive-event-id.test.js)).
- **GDPR Tinybird leg**: `tinybird|delete_condition` in gdpr.js → **0**. PostHog+Supabase erasure EXISTS ([gdpr.js](../api/routes/gdpr.js) `/visitor` + `/account`); app-side retention purge exists and is tenant-scoped.
- **Quarantine**: `quarantine` in code → **0 hits**. transport.js ignores `quarantined_rows` in Events-API responses; health-agent.js has zero Tinybird checks (it's Supabase-centric + a PostHog ping — SCOPE §11's "repoint off PostHog" framing is stale).
- The one landed P7 item: the $0-carrier COUNT exclusion (processSite + runBackfill via #94, byte-identical to main).
- Full implementation scoping with open founder questions: `tinybird/PHASE7_SCOPING.md` (uncommitted, this session).

## Phase 8 — tenant isolation: param-level PASS, now INDEPENDENTLY verified

- ✅ **I ran `tinybird/qa/tenant_isolation_static_audit.mjs` myself this session** (it is a read-only static analysis over the repo's pipe files): `Totals: 60 pipes = 59 endpoint PASS · 0 endpoint FAIL · 1 materialized (N/A)` — every endpoint pipe carries the exact fail-closed `site_id = {{ String(site_id, required=True) }}` predicate. I also read the script's criteria (:8-11, :26-39): exact-predicate match, FAIL on any site_id DEFAULT (scope-widening) and on predicates inside `{% if %}` blocks (bypassable) — sound, not a keyword grep. Cross-check: `grep -L "site_id" tinybird/pipes/*.pipe` → empty. **The prior "CC-self-reported, unread" caveat is now closed.**
- 🔁 Runtime isolation (2-tenant leak probes on `journey`/`doctor_pageviews_30d`/`events_latest`): founder-run PASS, orchestrator-witnessed (prior session record; not re-run).
- ⚠️ Token-scope isolation (per-tenant JWTs): correctly deferred to Phase 10; staging still uses one `WORKSPACE:READ_ALL` read token.

## Phase 9 — validation harness: 6/9 committed; live-run gap; 3 models blocked

- ✅ **Committed + reproducible (merged #95, at this HEAD)**: Pattern-B (time_decay/linear/u_shaped/w_shaped, cc-4a) + last_touch (cc-4c, per-field picked-value) + ai_platforms (cc-4d, credited-platform via the real selector). `tinybird/qa/phase4_replay_verify.mjs` reproduces all six from a clean checkout with zero credentials (re-run PASS this session).
- **LIVE vs replay, stated plainly:** Pattern-B has one founder-run LIVE token-path PASS (🔁 relayed record, pre-dating #95's extension). last_touch + ai_platforms are **replay-only** — their captures were live-pulled this session through the deployed pipes and live HogQL (✅ at capture time), but `run_phase4_diff.mjs`'s extended 3-model live path has **never executed end-to-end** (founder-held tokens). One founder command closes this.
- ✅ **Models 7–9 (first_touch, first_touch_non_direct, last_touch_non_direct) confirmed two-store-blocked** — verified BOTH store inventories this session: Tinybird ST_Staging holds ~1.10M synthetic rows for `site-00..site-04` (spans 2026-04-02 → **2026-07-21, i.e. future-dated**), while PostHog 469905's site inventory has **no** `site-0*` rows at all (top sites are the de*00000 demo sites + real UUIDs). The synthetic fixture set exists in ONE store only; no PostHog-shaped ingestion path exists (SCOPE/U5 still unresolved). No harness can run for these until the founder decides the two-store ingestion mechanism.
- ⚠️ Side-flag from that inventory: 1.1M future-dated synthetic rows sitting in the staging `events` datasource are the known aggregate-faking hazard and pollute any unwindowed staging query — cleanup/retention decision for the founder.

## Phase 10 — read cutover: NOT-STARTED (the real number is ~75, not "~11")

✅ `queryHogQL(` call sites at this HEAD: **77 raw hits in 16 files**; minus [posthog.js](../api/lib/posthog.js)'s own definition (:25) and internal wrapper call (:140) → **75 app call sites in 15 files**:

| File | call sites | Tinybird read path today? |
|---|---|---|
| api/lib/attribution-engine.js | 19 | PARTIAL — the ONLY live consumer: `queryTinybirdPipe('pageviews_by_visitors')` at :539 (ai_platforms rail, flag-gated); the other 18 sites are HogQL-only |
| api/routes/integrations.js | 11 | pipes exist (`integ_*` ×10) — not wired |
| api/routes/events.js | 7 | pipes exist (`events_health_*`, `events_latest`) — not wired |
| api/routes/dashboard.js | 7 | pipes exist (`dash_*`, `dashboard_*`) — not wired |
| api/routes/admin.js | 6 | pipes exist (`admin_*` ×5) — not wired |
| api/lib/setup-doctor.js | 5 | pipes exist (`doctor_*` ×5) — not wired |
| api/routes/hygiene.js | 5 | **no matching pipe found** (⚠️ inferred by name-mapping) |
| api/routes/alerts.js | 4 | pipes exist (`alert_*` ×4) — not wired |
| api/routes/leads-server.js | 3 | pipes exist (`leads_*`, `lead_detail`) — not wired |
| api/routes/sessions.js | 3 | pipes exist (`sessions_*`, `visitor_sessions`) — not wired |
| api/routes/cohorts.js | 2 | pipes exist (`cohorts_*`) — not wired |
| api/routes/ai-chat.js | 1 | **no matching pipe found** (⚠️ inferred) |
| api/routes/journey.js | 1 | pipe exists (`journey`) — not wired |
| api/routes/live.js | 1 | pipe exists (`live_visitors_bag`) — not wired |
| api/routes/seo-revenue.js | 1 | pipe exists (`seo_revenue_landing_pages`) — not wired |

Plus [nightly-attribution.js](../api/jobs/nightly-attribution.js)'s own `queryPostHog` helper (the money-rail read; its Tinybird story is coupled to the Phase-7 N+1 rewrite decision). Net: **pipes are authored+deployed for most of the surface, but exactly one call site reads Tinybird today.** Phase 10 = the wiring + per-tenant tokens + decommission gates, and it has not begun.

## Loose ends (✅ swept this session)

1. **57 of 60 pipe files carry a stale "NOT YET VALIDATED / NOT YET" marker** from pre-deploy authoring — all 59 endpoint pipes are in fact deployed and answering. Pure doc-rot, but it will mislead any future greps exactly the way this audit almost was misled; a one-commit header sweep fixes it.
2. Adapter/tools/qa TODO-sweep is otherwise clean — a single deliberate deferral note (`tenant_isolation_runtime_test.mjs:19`, per-tenant JWTs → Phase 10).
3. `SESSION_HANDOFF.md` (working tree) remains the stale artifact this doc replaces; `tinybird/fixtures/second_tenant.ndjson` still untracked.
4. 🔁 Token-rotation backlog (3+ exposed tokens from prior sessions) — recorded, not re-verified here, still open per the handoff.
5. ✅ `TINYBIRD_READ_ENABLED=true` on Railway staging / unset on prod (verified this session via flag-scoped env check) — the staging read rail is live, prod is dormant.
