# Post-Verdict Roadmap

**Created 2026-07-21 (Session 145).** Build sequencing for the period *after* the 2026-07-20/21 test verdicts landed.

**Why this file exists:** every item below existed only in a long chat session. Twice in that session we hit the same failure — a finding that lived only in conversation was rediscovered later as a surprise (`FEATURE_MAP.md:161`'s materially false API-key claim, corrected in `1bc6932`; and the KI-45 fix plan). This doc is the durable copy. **If a decision here is superseded, edit this file — do not leave the correction in a chat.**

**Not a gate doc.** `docs/paid_beta_go_no_go_master_audit.md` decides *whether to launch*; this decides *what to build next and in what order*. They do not overlap.

## Evidence grades — do not flatten these

Every claim below carries one. They are not interchangeable, and collapsing them is how a roadmap turns into a wish list.

| Grade | Meaning |
|---|---|
| ✅ **VERIFIED** | Queried, grepped, or read from code/DB this session. The method is stated inline. |
| 🔎 **INFERRED** | Reasoned from evidence, or a point-in-time competitive scan. Plausible, not proven. Re-check before betting on it. |
| ⚖️ **JUDGMENT** | A call, not a fact. Argue with it freely. |
| ⏳ **UNPROVEN** | A fix is applied but its proof point has not yet occurred. Not done. |

---

## 0. Verification methods (learned the hard way — reuse these)

### `merge-base --is-ancestor` proves nothing about a squash-merged PR

✅ **VERIFIED.** `git merge-base --is-ancestor <branch-head> origin/main` returns **MISSING for every squash-merged PR — merged or not.** Squash creates a *new* commit; the branch head never becomes its ancestor. This repo squash-merges, so the test is **structurally incapable** of returning ON_MAIN and is not evidence in either direction.

This cost real time on PR #344: two founder runs returned MISSING (terminal collapsed a multi-line paste, so `cd … git fetch …` ran as one `cd` with seven arguments and printed the `||` branch) and one clean-shell run also returned MISSING. **None of the three were evidence.** The conclusion was carried entirely by `grep -c checkErrorReport api/jobs/data-quality-check.js` → `0`.

**Verify a merge one of two ways:**
1. **Grep a distinctive symbol** from the change against `origin/main` — `git show origin/main:<path> | grep -c <symbol>`. Tests the **code**, immune to squash, rebase, exit codes, and shell paste-mangling.
2. **Cite the squash SHA on `origin/main`** (e.g. PR #344 → `822a2fc`), never the branch head.

**Generalized:** prefer a check that inspects the *artifact* over one that inspects a *graph relationship the workflow destroys by design*.

### Merged ≠ exercised

⚖️ **JUDGMENT, earned twice this session.** A merged fix is not a working fix until a run exercises it. KI-45 stays open until the 00:00 UTC 2026-07-22 run; the GSC env fix stays open until 02:00 UTC 2026-07-22. Mark DONE on observation, not on merge.

### Verify by the column that is actually populated

✅ **VERIFIED.** `anonymous_id` is **NULL on every `attributed_conversions` row.** A verification query keyed on `anonymous_id` returns a **false FAIL**. Key on `distinct_id`. → see the open question in §1.

---

## 1. The gate that unblocked everything: $777.77 revenue stitching PASSED

✅ **VERIFIED 2026-07-21 02:04 UTC.** `conversion_value 777.77`, **`touchpoint_count 3`**, `first_touch_source 'test-consent'`, `confidence 70`, on `distinct_id 1974cccb-1c47-4b45-aa95-2e2f425128ce`.

**Revenue attribution stitches across touchpoints on a real conversion.** This was the gate on every item in Tiers 1–3. It is cleared.

### Correcting an earlier misread — the July 9 "failures" were not failures

✅ **VERIFIED.** The 2026-07-09 tests (`$444.44`, `$555.55`) returned `touchpoint_count 0` with NULL sources, which read as the same defect. **It was not.** Both carried **synthetic `distinct_id` prefixes (`wave1_`, `gate0_`) with no preceding pageviews** — so zero touchpoints was **arithmetically correct**, not a stitching bug. `$777.77` was the **first test with genuine preceding pageviews under the same identity**, which is why it is the first meaningful pass.

⚠️ **Do not re-open the July 9 results as evidence of breakage.** They are evidence of a test-data shape, and they are the same trap recorded in memory as "verify rows before diagnosing."

### Open question — flag, do not assume (separate concern)

`anonymous_id` is NULL on every `attributed_conversions` row. **Decide deliberately: populate it or drop it.** A permanently-NULL column on the attribution table is a live false-FAIL generator for anyone who reasonably keys a verification query on it — which is exactly what it did to us. **Not yet triaged; no fix implied.**

---

## 2. TIER 1 — the forced chain (keys → read REST API → MCP)

**Nothing agentic works without this chain, in this order.** Each link is a hard dependency of the next.

### 1.1 `api_keys` scopes — **THE NEXT BUILD**

⚖️ **Plan already LOCKED in `KNOWN_ISSUES.md` KI-43.** Buildable now, no unknowns.

- **One migration:** `scopes text[] NOT NULL DEFAULT '{}'` + `revoked_at timestamptz`. The `'{}'` default is a **deny** backstop (an unscoped key grants nothing).
- **PR A** — scopes enforcement + UI + tests.
- **PR B** — soft revoke.
- **PR C** — rate limit + per-site cap.

§8 applies: CC writes the migration file, the founder applies staging→prod before the dependent code merges.

### 1.2 Packaging decision — founder call, **not a build**

✅ **VERIFIED:** `api_keys` has **0 rows and 0 keys ever used in prod**, and `api_access` is gated to **Growth+** — so free/starter customers **cannot obtain a key at all**.

✅ **VERIFIED, and it corrects a materially false doc claim:** the key surface is **BUILT end-to-end** (`api/routes/integrations.js` — list/create/revoke, `st_live_<64hex>`, sha256 at rest, prefix display, raw token shown once). `FEATURE_MAP.md:161`'s "no UI / manual DB injection" was **false** and was corrected in `1bc6932`.

⚖️ **The blocker is packaging, not engineering.** Zero adoption is a plan-gating artifact. Deciding who can hold a key precedes shipping anything that consumes one.

### 1.3 Read-only REST API — key-auth as an alternative auth mode

✅ **VERIFIED — this is extraction work, not endpoint-building.** `api/routes/analytics.js` already exposes **11 GET endpoints**: `/summary` `/sources` `/recent-conversions` `/coverage` `/data-quality/latest` `/entry-exit` `/outbound` `/custom-events` `/browsers` `/os` `/funnel` — all currently `requireUserAuth` → `validateSiteKey` → `requireSiteMembership`. And `api/routes/server-events.js` **already implements** Bearer → sha256 → `api_keys` lookup.

**The work is extracting that into reusable middleware and adding it as an alternative auth mode.** The endpoints exist; the key-auth primitive exists. Depends on §1.1 (scopes) — shipping key-auth on read endpoints before scopes means every key reads everything.

### 1.4 `llms.txt` — roughly one hour

🔎 **INFERRED (competitive scan, point-in-time 2026-07):** 4 of 5 competitors ship one — Cometly, AttributionApp, Atribu, DataFast. ✅ **VERIFIED:** SourceTrack has none.

Lowest effort-to-visibility ratio on this page.

### 1.5 MCP v1 — **5 diagnostic tools, deliberately NOT attribution tools**

`get_site_health` · `get_data_quality` · `verify_events` · `debug_data_flow` · `get_workspace_context`

⚖️ **Rationale, and it is the load-bearing part of the decision:** diagnostics report **observable pipeline state**, so they **cannot be confidently wrong** the way unverified attribution numbers can. That keeps v1 inside design-spec **§26** (no LLM-narrated revenue/ROAS/attribution) by construction rather than by discipline.

🔎 **INFERRED:** it is also the *differentiated* half — Cometly already ships `query_attribution_models`, so attribution querying is **catch-up, not moat**.

---

## 3. TIER 2 — table stakes

### 2.1 6–8 install guides

✅ **VERIFIED:** `docs/guides/` contains **2 files, both about forms**. 🔎 **INFERRED (scan):** DataFast and PiQo ship **24 each**.

Suggested: Next.js · WordPress · Shopify · Webflow · Framer · GTM.

### 2.2 One non-Stripe payment provider

✅ **VERIFIED by grep — file counts:** Stripe **71**, Shopify **44**, WooCommerce **3**, and **LemonSqueezy / Polar / Paddle / Dodo / Creem all 0**.

Pick **one** — Polar or LemonSqueezy. ⚠️ Both Stripe webhooks stay separate (§7); a second provider must not be folded into either.

### 2.3 Document the existing explain/verdicts endpoints — **zero build cost**

✅ **VERIFIED:** `GET /api/attribution/explain` and `/verdicts` are **built, undocumented, and unmarketed.** 🔎 **INFERRED (scan):** **no competitor in the set exposes per-conversion attribution explanations.**

⚖️ **This is the actual moat, and it is already shipped.** Highest return in the entire document: the cost is documentation, not engineering.

---

## 4. TIER 3 — differentiation

### 3.1 Revenue types: cash / pipeline / gross

🔎 Borrowed from Atribu. ⚖️ **An honesty feature — a competitor cannot copy it without conceding their previous numbers were inflated.** Also reframes the Phase-7 refund work as a **feature** rather than a correctness chore. Fits the §6 data-truth invariants natively.

### 3.2 Health/diagnostic MCP tools beyond v1

`inspect_site` · `get_pixel_status`. Extends §1.5 along the same §26-safe axis.

### 3.3 AI crawler tracking + directory

⚖️ **The unoccupied seam:** SourceTrack tracks AI **referrals** (humans arriving from ChatGPT); DataFast tracks AI **crawlers** (bots). 🔎 **INFERRED:** **nobody owns both halves.** Plus 60+ programmatic SEO pages.

⚠️ Interacts with the bot-filter's JS-execution axis — crawler *tracking* must not become crawler *admission* into analytics traffic.

### 3.4 Import from Plausible / GA4 / DataFast

Removes switching cost. 🔎 **INFERRED:** PiQo already imports from DataFast specifically.

### 3.5 Conversion Sync quality gates

CAPI exists; add quality gating, real payment values, and skip-logging with replay.

---

## 5. TIER 4 — logged, explicitly NOT now

Warehouse exports (S3/Snowflake/BigQuery/Redshift) · CRM integrations · Segment bidirectional · company/account-level attribution · cohort and paths reports · currency conversion · TV/radio · mobile apps · CLI · team invites.

### REJECTED OUTRIGHT — with reasons, so they are not re-proposed

| Rejected | Reason |
|---|---|
| AI creative generation | **§26 violation.** |
| `analyze_report`-style LLM-narrated revenue summaries | **§26 violation. Differ LOUDLY — we diverge from Cometly here deliberately**, and the divergence is a selling point, not a gap. |
| Competitor ad spy | Off-thesis. |
| Demo-gated sales | Off-thesis for bootstrapped self-serve. |
| Any *executing* agent | Needs proven measurement and real customers first. |

---

## 6. Metrics coverage (audit run 2026-07-21 — previously chat-only)

### `/analytics/summary` returns four KPIs hardcoded `null`

`new_visitors` · `returning_visitors` · `bounce_rate` · `avg_duration_seconds`.

✅ **VERIFIED — DELIBERATE, not missing work.** `api/routes/analytics.js:337` documents that **session-window classification is unreliable on PostHog server-routed events**. Returning `null` is **correct** per §5.1 and per the §6 no-fake-zeros invariant. **Do not "fix" this by computing a plausible number.**

🔎 **INFERRED:** expected to unblock via the **Tinybird migration** — the `sessions_pageviews`, `sessions_conversions`, and `dashboard_bounce_rate` pipes are **already authored** — **not via new API code.**

### `business_type` is never read by the dashboard

✅ **VERIFIED:** `Dashboard.jsx` grep count for `business_type` = **0**. Design doc **§10.3** specifies per-business-type KPI slots; **every site currently sees identical KPIs.** Unimplemented — a genuine gap, not a deliberate choice.

### MRR and Trial-to-Paid % are computed nowhere

✅ **VERIFIED:** both appear in design doc §6.4 but exist in code **only** in `dashboard/src/pages/SolutionSaaS.jsx` — a **public marketing page**.

⚠️ **Flag for a pre-launch copy review against §1.6** — a marketing page presenting metrics the product does not compute is exactly the class of claim that invariant exists to stop. Consistent with the standing note that MRR-by-source and trial→paid are **not built** (§7).

- **Trial-to-Paid is buildable now** — a ratio over two conversion types.
- **MRR is a genuine build** — needs subscription-state modelling.

### Coverage by vertical

| Vertical | State | Evidence |
|---|---|---|
| **Lead Gen** | Strongest | qualification across 19–33 files |
| **eCommerce** | Adequate | AOV via `ecom_aov` template, `order_id` in 38 files, refunds in 12 |
| **SaaS** | **Weakest** | — |

⚖️ Note the tension: SaaS is the weakest vertical *and* the positioning target (§7). Either the positioning or the coverage has to move.

---

## 7. Positioning — competitor teardown conclusion

### MCP is table stakes, not differentiation

🔎 **INFERRED (competitive scan, point-in-time 2026-07):** Cometly ships **~50 MCP tools** including `query_attribution_models` with OAuth 2.1 + PKCE; AttributionApp names **"Agentic Marketing Analytics"** as a feature; Atribu ships `llms.txt` + `llms-full.txt` + OpenAPI 3.1 and a **30+ tool MCP**.

⚖️ **Build MCP because it unblocks customers, not because it is novel.** Any plan that treats MCP as the differentiator is mispriced.

### What remains unoccupied

⚖️ **Privacy-first + indie SaaS + PROVABLE attribution.** Every competitor sells *more* attribution; **none sells provable attribution** — which is precisely what the already-built explain/verdicts endpoints (§2.3) deliver.

**Working line:**

> "Privacy-first revenue attribution for bootstrapped SaaS founders. Nine models, per-conversion explanations, cash-versus-pipeline revenue — and your agent can query all of it."

⛔ **Do NOT use "SaaS 4.0" in customer-facing copy** — unverified vocabulary, no citable source. Same class as any unverifiable public claim (§5 GTM gate).

---

## 8. Carried forward

### Still HELD (approved or planned, deliberately not built)

| Item | State |
|---|---|
| **KI-14** | admin `degraded:true` + `failed_reads[]` + FORCE_READ-gated rethrow — **plan approved, not built** |
| **KI-35** | GSC property ↔ domain validation |
| **KI-40** | CI guard that rebuilds `tracker.min.js` |
| **Entitlement-sync P0 (KI-44)** | `.select()` affected rows · alert on zero-row · `stripe_subscription_id` fallback — one PR, four call sites |
| **KI-46 fix** | `data-quality-check` + `health-agent` adopt `writeJobRun` (`api/lib/job-runs.js:28`) |

### Founder console — not agent-actionable (no MCP surface)

✅ **VERIFIED by founder, console-only:**

- `STRIPE_PRICE_ID_SCALE` **absent from prod** → **Scale tier is unpurchasable.**
- **2 of 3 prod prices missing `pv_limit` metadata.**
- **N-1** leaked-password protection **disabled**.
- **N-2** billing meters (`count_monthly_pageviews`, `count_monthly_sessions`) have **mutable `search_path`**.
- **P0-3** PITR **unverified**.
- **P0-4** prod env secrets **unverified** *(structural — Railway MCP exposes no variable-read tool, orchestrator constraint #2)*.
- **5 tokens pending rotation.**

### ⏳ PROOF POINTS DUE 2026-07-22 — **neither is proven**

| When | Tests | Pass signature |
|---|---|---|
| **00:00 UTC** | PR A #343 + PR B #344 (KI-45) | `'skipped'` rows present; a thrown check leaves a visible `_error` row |
| **02:00 UTC** | `GOOGLE_CLIENT_*` env fix | `gsc-daily-sync` `success` **with records synced**. FAIL = `"Google OAuth credentials are not configured"` → vars missing or misnamed on that service |

**Both are the first runs that exercise their fixes.** Until observed, both remain merged-not-proven (§0).
