# GATE-3 — Dual-Rail Reconciliation Contract

**Project:** SourceTrack · PostHog → Tinybird (Frankfurt EU) migration
**Date locked:** 2026-06-30 · **Status:** LOCKED — gates Phase 4 build and full cutover.
**Supersedes:** the open "Gate-3 reconciliation methodology" question flagged in `SESSION_HANDOFF.md` §1/§8.

This contract defines how SourceTrack proves the Tinybird event plane agrees with PostHog
**before** Tinybird is trusted as canonical. It is the spec Phase 8's harness implements, and
the target Phases 3–4 build toward. It is **not** a naive row diff.

---

## 0. Core finding that shapes everything

**Attribution credit is computed in SourceTrack JS (`calculateAttribution`, `api/lib/attribution-engine.js:2886`), never in PostHog/HogQL.** PostHog (and, post-migration, Tinybird) only *pull rows*; the same JS allocates credit over whatever touchpoint set it is handed.

**Consequence:** the migration swaps the **row-pull layer** (HogQL self-join → Tinybird pipe), not the allocation math. If a Tinybird pipe returns the same touchpoint set the HogQL self-join did, model output is **identical by construction**. All drift risk lives in the Phase-4 row-pull rewrites — nowhere else.

---

## 1. The reconcilable unit is (model × group_by) → store, not "9 models"

6 of 9 models silently fork between two stores depending on the requested grouping dimension (`api/routes/attribution.js:134-226`):

- **Simple group_by** (source/medium/campaign/channel/country/device/browser/landing_page) → **Supabase nightly rollup** (`attributed_conversions`, written by `nightly-attribution.js`).
- **Advanced dims** (keyword, referrer_domain, provider, attribution_status, stitching_method, custom_param:*) or no group_by → **live HogQL self-join**.

This fork is **pre-existing app behavior, NOT migration drift.** The contract does not try to make the two stores agree with each other — see §4.

The 9 models (canonical set, `ALLOWED_MODELS` `attribution.js:4`):
`first_touch, last_touch, first_touch_non_direct, last_touch_non_direct, ai_platforms, linear, u_shaped, time_decay, w_shaped`.
(No `position_based`/`data_driven`/`full_path` exist in code — "position-based" marketing copy = `u_shaped` + `w_shaped`.)

---

## 2. The five locked decisions

### Decision 1 — Reconcile the LIVE path, not the nightly rollup
Golden reference per cell = the **live self-join path** (true query-time journey reconstruction). Tinybird pipe output diffs against PostHog **live** output for the same model + window. The Supabase nightly rollup is a perf cache and stays as-is (OLTP); only the event source feeding it migrates.

### Decision 2 — Reconciliation dataset  [AMENDED 2026-06-30: gating = (b) live window; synthetic deferred]
- **GATING / ACCEPTANCE golden = the live dual-write overlap window.** Both rails see identical events going forward. Diff model outputs over this window, **scoped to the confirmed clean gating site (see below) only.** Excludes `site-00…site-04` load-test rows and future-dated `2026-07-21` rows (these fake `count()`/`max()` success).
- **CONFIRMED gating site (verified via Supabase MCP read of staging `sites` table, 2026-06-30):**
  - **site_id `de200000-babe-41d4-a716-446655441111`** / **site_key `de200000-babe-41d4-a716-446655440000`**
  - "SourceTrack Demo (SaaS)", domain `demo-saas-realistic.example.com`, plan **growth** (all 4 multi-touch models unlocked), `last_seen_at` = **today** (freshest-traffic site; the Phase-2d dual-write proof site).
  - NOTE: this id is a **DB row, not a repo artifact** — CC's recon flagged it "not in tree" because the working tree doesn't contain sites; the staging DB is ground truth and confirms it. Rejected alternatives: `de500000` (exists, ZERO traffic), `c0ffee11` (stale, onboarding incomplete), `de400000` (does not exist).
- **Phase-0 synthetic dataset = DEFERRED deterministic supplement** (Phase 8/9), NOT a Phase-4 gate. Reason: no PostHog ingest shim exists, and the NDJSON is Tinybird-schema-shaped, not PostHog `capture()`-shaped — building that shim is out of scope for the gate. Synthetic exists in Tinybird only (generator writes to disk; no PostHog ingest path — CC-verified in-repo). Use it later for byte-exact per-model unit goldens (refund signed-sum, dedup) once a shim is built.

### Decision 3 — Tolerance tiers
| Tier | Applies to | Band |
|---|---|---|
| **Exact / zero-tolerance** | allocation math on identical row sets (same JS fn — any delta is a wiring bug); event_id identity; dedup correctness; **tenant isolation (site_id leak NEVER within tolerance)**; **ALL 6 Phase-4 gated model-output endpoint pipes** (they are row-level `TYPE endpoint` pipes, NOT approximate-cardinality MVs — output is exact-or-bug) | 0 |
| **~0.5%** | `uniq()` / visitor-COUNT metrics ONLY (ClickHouse HLL is approximate; won't byte-match PostHog). Does NOT apply to the 6 model-output pipes. | ≤0.5% (pinned in `tinybird/SCOPE_v3.md:250`) |
| **Tight + named carve-outs** | revenue sums, conversion counts | see carve-outs ↓ |
| **Judgment (calibrate from run 1)** | multi-touch credit splits where equal-timestamp touch ordering can differ | TBD from observed drift — NOT pre-invented |

**Tinybird primitive note (CC, Phase-4 plan):** the live-path replacements are `TYPE endpoint` pipes (per-request dashboard reads), NOT Tinybird scheduled "Copy Pipes" — SCOPE_v3's "Copy Pipe" wording is loose. A Copy Pipe (scheduled materialization) is the nightly-path primitive, and the nightly path is OUT of this gate (Decision 1).

**Timestamp comparison rule (from 4a finding, 2026-06-30; REVISED after CC falsified the first approach):** Tinybird stores the literal client `timestamp` verbatim; PostHog applies an INGESTION-SIDE correction (NOT a posthog-node SDK mechanism — CC read the installed SDK source: it passes timestamp through unaltered with zero sentAt logic). For the 4a fixture (events BACKDATED 3 days to satisfy sanitizeClientTimestamp's future-bound), PostHog's ingestion shifted all timestamps by a UNIFORM +339ms, and the original client value is NOT recoverable from any queryable PostHog field ($sent_at, server_timestamp, created_at, $timestamp all checked — all hold real firing-day values, not the backdated original). Two consequences:
1. This +339ms is partly an artifact of the BACKDATING technique used to build the fixture; production events arrive near-real-time where the ingestion correction is negligible. Do NOT over-fit the harness to +339ms.
2. A 0ms absolute-timestamp match against PostHog is NOT achievable for backdated events and should not be required.
RULE — compare INTERVALS, not absolute timestamps: the harness compares the within-journey deltas `(touch[n].timestamp − touch[0].timestamp)` across both stores. Attribution math consumes timestamp DIFFERENCES (order for linear/u/w_shaped; anchor−touch gaps for time_decay), and a uniform per-store offset cancels out of every delta. Interval parity = EXACT-tier (0 epsilon) on the quantity allocation actually uses, while sidestepping the unrecoverable absolute-timestamp artifact. This is strictly better than (a) an absolute-timestamp epsilon (hides real drift) or (b) treating Tinybird as timestamp source-of-truth (abandons the cross-check). Allocation OUTPUT remains exact-tier regardless, since identity is exact and intervals are preserved.

**Pre-registered expected divergences (NOT flagged as failures):**
1. **5c conversions-count `+1`/sub-signup inflation** — subscription-mode checkout emits a $0 carrier; revenue+customers correct, conversions-count inflated by 1 per sub-signup. Read-side fix deferred to Phase 9.
2. **Provider-scoped old idempotency rail** — browser (`browser_conversion`) and offline (`staging_test`) claim under different `provider` values, so the same `order_id` does NOT cross-dedup at the claim layer **by design**. Tinybird cross-dedup is read-time via shared deterministic `event_id`. Different claim-layer behavior is expected, not drift.

### Decision 4 — Two highest-drift cells get dedicated golden coverage
- 🟠 **`time_decay`** — weights depend on conversion timing vs each touch; late-arriving conversions break any ingest-time materialization. Single most fragile port. Golden must include a late-arriving-conversion case.
- 🟡 **`first_touch` cookie-vs-recompute fork** — the live path reads an **ingest-stamped cookie value** (`properties.first_touch_*`), the nightly path **recomputes** from the journey. **RULE:** reconcile Tinybird's stamped-field read against PostHog's stamped-field read (should be exact). **Do NOT diff first_touch-live against first_touch-nightly** — that is the app's existing design choice, out of migration scope. Diffing them shows false drift.

### Decision 5 — Build gate vs cutover gate
- **Gate Phase 4** on the 6 row-pull rewrites (the self-joins `SCOPE_v3.md:168` says are NOT MV-able): `last_touch, linear, time_decay, u_shaped, w_shaped, ai_platforms`.
- **Gate full cutover** on the remaining 3 (lower-risk, one golden each): `first_touch` (cookie-stamped, MV-clean), `first_touch_non_direct`, `last_touch_non_direct`.
- All 9 are V1-surfaced (Report Builder picker). The 4 multi-touch (`linear/time_decay/u_shaped/w_shaped`) are paid-gated (`multi_touch_attribution`) but shipped — all 9 must reconcile before cutover.

---

## 3. Rewrite-risk map (drift concentration → Phase 4)

🔴 **Highest — journey-projection rewrites (Copy Pipe / windowed, NOT MV):** `last_touch, linear, time_decay, u_shaped, w_shaped` + `ai_platforms`. They need prior touchpoints the inserted block can't see; time_decay weights depend on a conversion that may arrive after the touchpoints (`SCOPE_v3.md:168`, `events_by_visitor_mv.pipe:7`).
🟡 **`first_touch`** — MV-clean (denormalized on conversion), but dual-truth (see Decision 4).
🟢 **Lower — no nightly MV, single live source:** `first_touch_non_direct, last_touch_non_direct, ai_platforms` — still self-joins (Phase 4), but no second store to fork against.

---

## 4. What this contract explicitly does NOT do
- Does not reconcile the nightly Supabase rollup against the live path (pre-existing app fork, not migration scope).
- Does not require byte-identical visitor counts (HLL approximation; 0.5% band).
- Does not flag the 5c count inflation or the provider-scoped claim behavior as failures (pre-registered).
- Does not pre-invent the multi-touch-split tolerance %; that calibrates from run 1.

---

## 5. Open dependency for the (b) harness (resolve at Phase-4/8 execution, NOT a blocker now)
**Which PostHog project holds the staging API's `ph.capture` output?** The (b) gate diffs Tinybird `ST_Staging` (Frankfurt) against PostHog over the overlap window — so the harness must read PostHog from whichever project the *staging* API writes to. Memory/handoff name prod `416017` (US) and the active MCP project is staging `469905`; a read of prod `416017` returned **403** for both CC and the orchestrator. Before the reconciliation harness runs, confirm: does staging API → PostHog `469905` (then orchestrator can read it) or → `416017` (then a prod-scoped read grant is needed)? Resolve as a read-only check at Phase-4 plan time.

## 6. Resolved (was open)
- ~~Does Phase-0 synthetic exist in PostHog?~~ → **Moot**: gating is (b) live window, not synthetic. (Answer was "no" anyway — Tinybird-only.)
- ~~Which is the clean gating site?~~ → **`de200000-…441111`**, confirmed via Supabase MCP (Decision 2).

---

## 6. Unverified-by-orchestrator note
All `SCOPE_v3.md` and `attribution-engine.js` citations originate from CC's read-only recon (file:line-cited, internally consistent). The orchestrator has no Tinybird MCP and did not independently confirm them. Treat as CC-verified intent until re-confirmed at execution.

**End of contract.**
