# Post-Migration Checklist Audit — Codebase Status (Sections A–N)

> **Audited at HEAD `4b89f1e`** (`claude/tinybird-phase1-events-schema`, post-#99 refund handler), 2026-07-03. Read-only. Uncommitted status doc.
> **Note:** `POST_MIGRATION_CHECKLIST.md` does **not exist** in the repo (not tracked, not in scratch/tmp). This audit is run against the section A–N enumeration in the task brief. Cross-referenced against `tinybird/MIGRATION_STATUS_2026-07-03.md` (prior session, HEAD `9f7f3f3`) but every figure below was **independently re-derived at `4b89f1e`**.
>
> **Evidence tags:** `VERIFIED` = I ran the grep / read the file / ran the script this session. `INFERRED` = derived by name-mapping or reasoning, not directly observed.
> **Status taxonomy:** ✅ DONE · 🟡 PARTIAL · 🔴 NOT-DONE · ⚙️ CODE-DONE/NOT-VERIFIED-LIVE · 🚫 CANNOT-VERIFY-FROM-CODE.

---

## (1) TOP SUMMARY — status counts

| Status | Count | Notes |
|---|---:|---|
| ✅ DONE | 14 | code present + wired at HEAD |
| 🟡 PARTIAL | 12 | built for part of surface / gaps remain |
| 🔴 NOT-DONE | 7 | grep-absent |
| ⚙️ CODE-DONE / NOT-VERIFIED-LIVE | 6 | #97 quarantine, #98 GDPR-TB, #99 refund, dual-write, read-rail, replay-only harness |
| 🚫 CANNOT-VERIFY-FROM-CODE | 11 | live Tinybird/Railway/legal/prod-workspace/token owners |

**The 3 cutover-gate items (headline):**
1. **A — parity harness:** 🟡 PARTIAL — replay harness for 6 of 9 targets committed & reproducible; **live parity path never executed end-to-end** (founder tokens) → live parity = 🚫.
2. **D — revenue rail:** 🟡 / ⚙️ — deriveEventId 9-level chain + DB idempotency + two-webhook separation all ✅ in code; **refund handler (#99) ⚙️ CODE-DONE/NOT-VERIFIED-LIVE** (no live Stripe refund proven).
3. **E/F — isolation + GDPR:** E isolation ✅ (I re-ran the static audit: 59/59 fail-closed); F GDPR Tinybird erasure leg (#98) ⚙️ wired for `/visitor` but **NOT wired for `/account`**, and never run live.

---

## (2) AUTHORITATIVE RESIDUAL POSTHOG-READ COUNT

**VERIFIED** (`grep -rn "queryHogQL(" api/`):
- **78 raw `queryHogQL(` hits across 16 files.**
- Minus `api/lib/posthog.js` — the definition (`posthog.js:25`) + its own internal wrapper call (`posthog.js:140`, `fetchPageviews`) = 2 non-call-site lines.
- **→ 76 live-PostHog app call sites across 15 files.**
- **Every one is a live PostHog read** — `queryHogQL` hits PostHog directly. The **only** Tinybird read path anywhere in app code is `attribution-engine.js:539` `queryTinybirdPipe('pageviews_by_visitors')` (the ai_platforms rail), **flag-gated behind `TINYBIRD_READ_ENABLED`** and additive — that file still has 19 `queryHogQL` sites.

> Reconciles the founder's "77" and the prior doc's "75": at `4b89f1e` the real number is **76 app call sites / 15 files**. (`queryTinybirdPipe` is a *separate* function in `api/lib/tinybird-read.js`; it is not in the 76.)

### Per-file table (live-PostHog vs Tinybird-port vs wrapper)

| File | `queryHogQL` sites | Tinybird read wired? | Pipe authored? |
|---|---:|---|---|
| `api/lib/attribution-engine.js` | 19 | 🟡 1 of 19 (`:539` ai_platforms rail, flag-gated) | `pageviews_by_visitors` |
| `api/routes/integrations.js` | 11 | 🔴 no | `integ_*` ×10 exist, unwired |
| `api/routes/events.js` | 7 | 🔴 no | `events_health_*`, `events_latest` exist |
| `api/routes/dashboard.js` | 7 | 🔴 no | `dash_*`, `dashboard_*` exist |
| `api/routes/admin.js` | 6 | 🔴 no | `admin_*` ×5 exist |
| `api/routes/hygiene.js` | 5 | 🔴 no | **no matching pipe** (INFERRED) |
| `api/lib/setup-doctor.js` | 5 | 🔴 no | `doctor_*` ×5 exist |
| `api/routes/alerts.js` | 4 | 🔴 no | `alert_*` ×4 exist |
| `api/routes/sessions.js` | 3 | 🔴 no | `sessions_*`, `visitor_sessions` exist |
| `api/routes/leads-server.js` | 3 | 🔴 no | `leads_*`, `lead_detail` exist |
| `api/routes/cohorts.js` | 2 | 🔴 no | `cohorts_*` exist |
| `api/routes/seo-revenue.js` | 1 | 🔴 no | `seo_revenue_landing_pages` exists |
| `api/routes/live.js` | 1 | 🔴 no | `live_visitors_bag` exists |
| `api/routes/journey.js` | 1 | 🔴 no | `journey` exists |
| `api/routes/ai-chat.js` | 1 | 🔴 no | **no matching pipe** (INFERRED) |
| `api/lib/posthog.js` | 2 | n/a (definition + wrapper) | — |
| **TOTAL app call sites** | **76** | **1 partial** | 59 endpoint pipes deployed |

Plus `nightly-attribution.js` uses its own `queryPostHog` helper (money-rail touchpoints read) — see H.

**Net:** pipes are authored + deployed for most of the surface, but **exactly one call site reads Tinybird today**, and only when `TINYBIRD_READ_ENABLED=true`. Read cutover (Phase 10) has effectively not begun. **VERIFIED.**

---

## (3) REAL ATTRIBUTION-MODEL SET

**VERIFIED** from the `switch(model)` blocks in `api/lib/attribution-engine.js` (`:800–818`, `:1204–1295`, `:1330–1387`):

**8 attribution (touchpoint-weighting) models:**
`first_touch` · `last_touch` · `first_touch_non_direct` · `last_touch_non_direct` · `linear` · `u_shaped` · `time_decay` · `w_shaped`

**+ 1 `ai_platforms` rail** (`:818`, `:1270`) — a *credited-platform* selector, not a touchpoint-weighting model.

→ **8 models + 1 ai_platforms rail = 9 harness targets** (reconciles the checklist's "9 models"). No `position_based` in code. **VERIFIED.**

---

# Section-by-section

## A — Parity harness
🟡 **PARTIAL.** **VERIFIED:** `tinybird/qa/phase4_replay_verify.mjs` + committed goldens (`phase4_expected/expected_results.json`, snapshots `cc4a_pattern_b.json`, `cc4c_last_touch.json`, `cc4d_ai_platforms.json`). Covers **6 of 9 targets**: Pattern-B (`time_decay/linear/u_shaped/w_shaped`), `last_touch` (per-field picked-value), `ai_platforms` (real selector). It is a **tolerance/intersection diff harness** over captured snapshots. Missing: `first_touch`, `first_touch_non_direct`, `last_touch_non_direct` (two-store-blocked, see C/§9). **Live parity = 🚫** — the extended 3-model live path in `run_phase4_diff.mjs` has never executed end-to-end (founder-held tokens). Replay reproduces from a clean checkout with zero creds.

## B1 — Residual PostHog reads (headline)
🟡 **PARTIAL / cutover barely started.** See section (2): **76 live PostHog app call sites / 15 files; 1 partial Tinybird read** (`attribution-engine.js:539`). **VERIFIED.**
- **Identity-key spot-check:** **VERIFIED** the ported read uses per-query identity handling — `attribution-engine.js:80–82` uses `COALESCE(NULLIF(properties.first_touch_source,''),'direct')` / `NULLIF(...,'')` guards. `api/tests/tinybird-read-wire-format.test.js` pins the Array-param serialization (comma-joined, not repeated keys — the #96 fix) for `pageviews_by_visitors`.

## B2–B15 — surface coverage
Uniform result **unless noted**: pipe authored + deployed, **read still on PostHog** (unwired). **VERIFIED** via per-file table above + `list_endpoints` pipe inventory.
- **B2 traffic / B3 attribution / B4 conversion:** PostHog (`dashboard.js`, `attribution.js`, `attribution-engine.js`). 🟡 pipes exist.
- **B5 MRR / trial→paid gating:** 🔴 **NOT-DONE.** `MRR`/`trial_to_paid` grep → only `dashboard/src/pages/SolutionSaaS.jsx` (marketing copy). Feature not built (matches CLAUDE.md §7). **VERIFIED.**
- **B6 lead / B7 AI:** PostHog (`leads-server.js`, `ai-analytics.js`, `ai-chat.js`). ai_platforms rail is the one partial Tinybird path.
- **B8 SEORevenue truth-gate:** ✅ **truth-gate intact.** `seo-revenue.js:279–317` emits `estimated_revenue`/`estimated_conversions` (explicitly labeled "estimated", click-share × page-revenue). Read still PostHog. **VERIFIED.**
- **B9 GSC / B12 device:** PostHog. Pipes `browsers`/`os`/`seo_revenue_landing_pages` exist, unwired.
- **B10 webkit-vs-None:** 🚫/🟡 not separately located this pass — device parsing lives in `normalize.js` + device pipes; no distinct "webkit vs None" harness found. **INFERRED gap.**
- **B11 campaign / B13 journey:** PostHog (`campaigns.js`, `journey.js`). Pipe `journey` exists, unwired.
- **B14 flexible_report parity:** 🟡 **no parity harness.** `flexible_report` referenced in `attribution-engine.js`, `attribution.js`, `ai-analytics.js`, `export.js`, `campaigns.js`, `ReportBuilder.jsx`; read path = `queryHogQL` via attribution-engine. No committed flexible-report parity fixture. (Checklist's `flexible_report:2457` — file is now **3276 lines**; located by content, line drifted.) **VERIFIED absent.**
- **B15 export:** `export.js` → PostHog via attribution-engine. Unwired. **VERIFIED.**

## C — Models
🟡 **PARTIAL.** Real set = **8 models + ai_platforms rail** (section 3). **VERIFIED.**
- Committed golden/harness: ✅ for 6 targets (Pattern-B 4 + last_touch + ai_platforms). **Replay-only** — live path unproven (A).
- **Gap:** `first_touch`, `first_touch_non_direct`, `last_touch_non_direct` = **no committed harness**, two-store-blocked (synthetic `site-0*` rows exist only in Tinybird ST_Staging, absent from PostHog 469905 — per prior-session inventory, **RELAYED not re-run**). Identity/organic fixtures cover Pattern-B/last_touch/ai_platforms only.

## D — Revenue rail
🟡 mostly ✅ in code; refund ⚙️.
- **deriveEventId 9-level chain:** ✅ **VERIFIED** `tinybird/adapter/normalize.js:124–172` — 9 branches: (1) `event_id` (2) `external_event_id` (3) `stripe_invoice_id` (4) `stripe_subscription_id:type` (5) `order_id` (6) `payment_id` (7) `idempotency_key` (8) `provider_event_id` (9) `randomUUID()`. Tested: `tinybird/adapter/__tests__/derive-event-id.test.js`.
- **Cross-dedup:** ✅ browser↔offline↔server key to same id (`conversion.js:404`, `conversion-offline.js:248` comments + branch-2 `external_event_id`). **VERIFIED.**
- **DB idempotency wired:** ✅ `conversion.js:13` imports `claimIdempotencyKeys`/`rollbackIdempotencyKeys` (`api/lib/idempotency.js`) → persistent `revenue_idempotency_keys` table, **claim-after-write** with rollback on limit-block (`:318`, `:358`). **VERIFIED.**
- **Two Stripe webhooks not conflated:** ✅ `billing.js` (own billing) uses in-memory `NodeCache` (`:18`), records no revenue; `stripe-webhook.js` (buyers') ingests `$conversion` with DB idempotency. Distinct files/mechanisms. **VERIFIED.**
- **Conversions-count +1 / $0-carrier fix:** ✅ `db55f4c fix(stripe): exclude $0 subscription-checkout carrier from conversion counts` present; enforced in `nightly-attribution.js:313–315/436–439`. **VERIFIED.**
- **Bad conversion_value quarantine:** 🟡/🚫 — the quarantine table is **Tinybird-managed** (`events_quarantine`, no repo `.datasource`); `transport.js:58–61` reads `quarantined_rows` from Events-API 2xx responses. No app-side value-quarantine in `normalize.js`. Live behavior = 🚫.
- **REFUND handler (#99):** ⚙️ **CODE-DONE / NOT-VERIFIED-LIVE.** **VERIFIED wired at HEAD:** `api/lib/stripe-refund.js` (`REFUND_EVENT_TYPE='refund.created'`, `buildRefundConversion`, `buildRefundIdempotencyKeys`) imported at `stripe-webhook.js:11`; **reachable branch** at `stripe-webhook.js:270–272` → `handleRefundEvent` (routed before the ignore-200 fall-through; `charge.refunded` intentionally ignored to avoid double-compensating). Compensating **signed-negative $conversion, Tinybird-only**; `event_id = re_…` wins deriveEventId branch-1. **No live Stripe refund proven.**

## E — Tenant isolation
✅ **DONE (param-level), independently verified.**
- **VERIFIED:** I re-ran `node tinybird/qa/tenant_isolation_static_audit.mjs` → `Totals: 60 pipes = 59 endpoint PASS · 0 endpoint FAIL · 1 materialized (N/A)`. Every endpoint pipe carries `site_id = {{ String(site_id, required=True) }}`. `grep -L "site_id" tinybird/pipes/*.pipe` → empty. The script FAILs on any `site_id` DEFAULT or predicate inside `{% if %}` (not a keyword grep). **The prior "self-reported/unread" caveat is closed** — I read the criteria (`:8–39`) and ran it.
- **FORBIDDEN_KEYS PII denylist:** ✅ `normalize.js:92` `FORBIDDEN_KEYS = {site_key, _synthetic, refund_of, raw_payload, user_agent, webhook_source, city, fbp, fbc}` + `PII_KEYS` set (`:43`) + recursive strip at every depth (`:191`). **site_key is dropped** before write — never in a Tinybird row. **VERIFIED.**
- Token-scope isolation (per-tenant JWTs) deferred to Phase 10; staging uses one `WORKSPACE:READ_ALL` token → 🚫 (owner: orchestrator-Tinybird-MCP).

## F — GDPR
- **Erasure Tinybird leg (#98):** ⚙️ **CODE-DONE / NOT-VERIFIED-LIVE, and PARTIAL.** **VERIFIED:** `gdpr.js:17` imports `eraseSubjectFromTinybird` (`tinybird/adapter/erase.js`); wired into **`DELETE /visitor`** (`:170–181`) with dry-run default (`confirm_tinybird_erase === true` to actually delete), audited to `erasure_log`, never-throws posture. **Gap:** the **`DELETE /account`** leg (`:195–292`) lists only Supabase tables — **no Tinybird erase call in the account path** (VERIFIED: grep of `:195–292` for tinybird/erase → 0 hits). Live erasure unproven = ⚙️.
- **Retention-purge task:** ✅ **VERIFIED** `api/lib/retention-purge.js` + `api/tests/retention-purge.test.js`, invoked from `nightly-attribution.js`; `PUT /gdpr/retention` sets `data_retention_days` (`gdpr.js:301`). Tenant-scoped.
- **Region = europe-west3:** 🚫 **CANNOT-VERIFY-FROM-CODE.** `tinybird.config.json` has no region; host is env-driven `TINYBIRD_HOST` (`tinybird-read.js:50`). Owner: orchestrator-Tinybird-MCP.
- DPA / decommission = 🚫 (owner: founder/legal).

## G — Write path
✅ dual-write functioning; transport retrying.
- **Dual-write wired:** ✅ **VERIFIED** `grep -rc dualWriteEvent api/` → producer routes: `proxy.js`(4), `track.js`(3), `stripe-webhook.js`(4, incl. refund), `conversion.js`(2), `conversion-offline.js`(2), `webhook-incoming.js`(2), `shopify-webhook.js`(2), `server-events.js`(2), `pixel.js`(2) — **~23 call sites across 9 producer routes**; flag-gated `TINYBIRD_DUAL_WRITE` (`api/index.js:595`, boot `tinybird/adapter/boot.js`). Wiring test `api/tests/pageview-dualwrite-wiring.test.js`. (Grown from prior doc's 13 — refund path added.)
- **Retry-transport-at-boot — bare or retrying?** ✅ **RETRYING, not bare.** `transport.js:1–27` = "429/5xx-aware retry with backoff honoring Retry-After / X-RateLimit-Reset"; `TinybirdTransportError.retryable` true on 429/5xx/network. Boot (`boot.js:11/76`) never crashes on misconfig. **429/5xx are NOT silently dropped.** **VERIFIED — refutes the "bare transport" concern.**
- **TEMP-DEBUG reverted:** ✅ `grep TEMP-DEBUG api/ tinybird/` → **0 hits.** **VERIFIED.**

## H — Perf (N+1)
🟡 **PARTIAL** (one done, one still present) — **VERIFIED**, located by content:
- **aiplatform N+1 rewrite:** ✅ **DONE.** `attribution-engine.js:473–482` (`Phase 6 N+1 rewrite (aiplatform:505): raised 100→2500`, `AI_ATTRIBUTION_VISITOR_BATCH_SIZE = 2500`, `chunkVisitorIds`). (Checklist's `aiplatform:505` → actual `:473–482`.)
- **nightly N+1:** 🔴 **STILL PRESENT.** `nightly-attribution.js:548 processConversion` issues one `touchpointsQuery` (`:559`) + `queryPostHog` (`:597`) **per conversion**, in sequential loops at `:313` (backfill) and `:436` (main). Unchanged; `PHASE7_NIGHTLY_TOUCHPOINTS_NPLUS1_PROPOSAL.md` is proposal-only. (Checklist's `nightly:565/551` → actual `:559/:597`.)

## I — Truth-gating
✅ **intact (unaffected by Tinybird cutover).** Hidden-when-empty logic lives in dashboard components (`AttributionCoverageCard.jsx`, `SetupDoctorCard.jsx`, fixture components) reading via the API layer; B8 SEORevenue "estimated" labels present. Since only 1 backend read is on Tinybird, truth-gating semantics are unchanged. **VERIFIED (component presence); INFERRED that Tinybird reads preserve it (only 1 wired).**

## J — Observability
- **Error logging at swallow points:** ✅ never-throw legs log (`gdpr.js:57` erasure_log-write failure, `nightly:599` touchpoint-fetch warn, transport guarded). **VERIFIED.**
- **Quarantine monitoring (#97):** ⚙️ **CODE-DONE / NOT-VERIFIED-LIVE.** **VERIFIED wired:** `health-agent.js:5` imports `fetchQuarantineSummary`/`classifyQuarantine` (`api/lib/quarantine-alarm.js`); check `tinybird_quarantine` registered (`:151`) and in `CRITICAL_CHECKS` (`:17`) → quarantined `$conversion` throws→CRITICAL, other rows→warning, unreachable→warning. **Off pre-cutover** (`:153–155` skips when no `TINYBIRD_READ_TOKEN`). Not live.

## K — Cleanup
🟡 **PARTIAL.**
- **posthog-node / posthog-js still present:** 🔴 **VERIFIED** `package.json:35 "posthog-node": "^4.3.0"`; imported `api/lib/posthog.js:1` (backend, still the read layer — expected pre-cutover) and `dashboard/src/lib/posthog.js:1` (`posthog-js`, dashboard product analytics — separate concern).
- **ai-chat.js HogQL cut:** 🔴 **NOT cut** — `ai-chat.js` still has 1 `queryHogQL`. **VERIFIED.**
- **README host fix:** ✅ README uses `tracker/tracker.min.js` (`:52/:86`), not `loader.min.js`. **VERIFIED.**
- **Exposed tokens still referenced (names only, no values):** 🟡 token *names* (`TINYBIRD_*_TOKEN`, `READ_ALL`, `APPEND` token) referenced in docs (`SCOPE_v3.md`, `PHASE*` plans, `MIGRATION_STATUS`) and `datasources/events.datasource`. **`tinybird/.env.local.save` exists on disk but is UNTRACKED / gitignored (`.env.*`)** — not committed; I did **not** read its contents. Token-rotation backlog (3+ exposed tokens from prior sessions) = 🚫 owner: founder/orchestrator.

## L — Known gaps (status of ~12 items)
| Item | Status | Evidence |
|---|---|---|
| Read cutover unstarted | 🔴 | 76 PostHog sites, 1 Tinybird read |
| nightly N+1 | 🔴 | `nightly:559/597` per-conversion |
| Consolidation (analytics 5→1; alerts↔integ) | 🔴 | pipes still separate (`summary/sources_ai/sources_ref/browsers/os`) |
| Models 7–9 no harness | 🟡 | two-store-blocked |
| Live parity path never run | 🚫 | founder tokens |
| GDPR `/account` Tinybird leg | 🟡 | not wired (F) |
| conversion_value live quarantine | 🚫 | Tinybird-managed |
| Refund live proof | ⚙️ | #99 code-only |
| 57/60 pipes carry stale "NOT VALIDATED" marker | 🟡 | doc-rot, all deployed |
| Per-tenant JWT tokens | 🚫 | Phase 10 |
| 1.1M future-dated synthetic staging rows | 🚫 | staging cleanup (founder) |
| Token rotation backlog | 🚫 | founder |

## M — Smoke test
🚫 **CANNOT-VERIFY-FROM-CODE** — requires prod/live run. Owner: Antigravity-Railway / founder.

## N — Series
- **N1 backfill:** ✅ **consistent with forward-only.** No backfill tooling for historical PostHog→Tinybird replay in repo (grep found none); decision is forward-only. **VERIFIED (absence).**
- **N2 prod workspace:** 🚫 owner: orchestrator-Tinybird-MCP.
- **N3 Ops / N4 Support / N5 billing-metering:** 🚫 / 🔴 — B5 MRR/metering not built (code) → 🔴; ops/support runbooks = 🚫.
- **N6 bot + IP:** 🟡 — `normalize.js` handles `user_agent` (dropped as FORBIDDEN_KEY, no raw IP stored per privacy invariant); bot-filtering logic not confirmed in adapter. **INFERRED partial.**
- **N7 timezone (PR#90 live?):** 🟡 code present (`ff5229c feat: per-site timezone`, `5f6be3c`, `50c9431`, `056c303` DateTime/tz param typing); **live = 🚫**.
- **N8 real-time:** 🚫 live (MV freshness / live pipes).
- **N9 Float64 precision:** ✅ `events.datasource:29 conversion_value Float64 DEFAULT 0`. **VERIFIED.**
- **N10 GSC join:** 🟡 `seo-revenue.js` landing-page+date join with estimated label (B8); Tinybird pipe unwired.
- **N11 sessionization:** 🟡 `session_id` handled in pipes (`summary.pipe`); no dedicated sessionization rebuild. **INFERRED.**
- **N12 properties bag:** ✅ `events.datasource:71 properties String json:$` — full JSON captured as String. **VERIFIED.**
- **N13 pagination:** 🚫 not separately verified this pass.
- **N14 MV freshness:** 🚫 live (owner: orchestrator-Tinybird-MCP). `events_by_visitor_mv` pipe committed.
- **N15 lead search:** 🟡 `leads_*`/`lead_detail` pipes exist, unwired (reads PostHog).
- **N16 dual-write-during-revert:** ✅ dual-write is flag-gated and additive (G) — safe during a read revert. **VERIFIED (design).**

---

### Method notes
- HEAD confirmed `4b89f1e59a4889ae1e1c291b78e0754413eed89d` via `git fetch origin && git log -1`.
- All line refs re-located by **content** (checklist's cited lines had drifted: `attribution-engine.js` 2457→file is 3276 lines; `aiplatform:505`→`:473`; `nightly:565/551`→`:559/597`).
- No `✅` assigned on a merged-PR basis alone — each verified present + wired at HEAD.
- Read-only throughout: no writes, no DDL, no PR, no secret values read/printed.
