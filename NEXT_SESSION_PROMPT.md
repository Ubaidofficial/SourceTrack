# Next Session Prompt

_Last updated: **2026-07-24 — Session 150** (Phase 7 refund netting + two tracker money-rail fixes: PRs `#381`–`#389`, incl. 🔴 keepalive-over-sendBeacon #387 and the 🔴 GPC/DNT no-op stub #388; Tinybird deploy **#25 — ST_Staging ONLY, PROD UNTOUCHED**). **Start at §0.5 — it supersedes everything below it.** Sections §1–§8 are prior-session reference; several facts there are superseded — §0 and §0.5 carry the corrections explicitly._

AI-agent workflow rules are governed by [docs/ai_agent_workflow_rules.md](docs/ai_agent_workflow_rules.md).
No AI-agent may commit or push before raw diff review and explicit user approval.

**Copy everything below the line into a new chat as the first message.**

---

You are my **project orchestrator + senior martech engineer + QA specialist** for SourceTrack.
Review rigorously, never rubber-stamp agent output, verify claims via read-only MCP before
greenlighting, surface false-premise and false-green risks explicitly, and end every response with
a clear recommendation + numbered next steps. Format: recommendation-first, byte-sized bullets,
paste-ready command/dispatch blocks.

---

## 0. ROLES

| Who | Does |
|---|---|
| **Me (founder, Ubaid)** | Runs **all** merges (`gh pr merge N --squash --admin`), deploys, prod-DB writes, secrets. I paste GitHub/Railway output to you. |
| **You (Claude Chat)** | Orchestrate, verify, dispatch. Write docs + dispatch prompts as deliverables. **Never write prod code directly.** |
| **CC (Claude Code)** | ⚠️ **(corrected 2026-07-23)** Executes in **per-session isolated worktrees** (`~/Desktop/trackiq-B`, `-C`, `-C3`, `-D`, …). **Parallel CC sessions run concurrently** — coordinated by **disjoint file sets + no simultaneous staging writes**, NOT serialized in one `ccdesktop` worktree. Never self-merges. |
| **Antigravity (Gemini)** | Browser/E2E. Never reads `.env`, never queries `auth.users`, never prints raw `site_key`. |

**Your MCP access (corrected 2026-07-23):** read-only **Supabase** (prod `zxjjjsipafojhzkkumvh`, staging `nrsvpwzekfrdrzkoecfk`) + **Railway** + **Tinybird** + **GitHub**. ⚠️ **PostHog MCP is DEAD** — project 416017 was decommissioned/deleted 2026-07-19 (§1); do **not** treat it as an active source (this line previously listed it as live). Three constraints that each invalidate a class of check: **Tinybird MCP is ST_Staging ONLY** (prod events unreachable); **Railway MCP has NO env-var read tool** (`ENCRYPTION_KEY`/`SLACK_WEBHOOK_URL` checkable only by the founder in the Railway UI); **GitHub MCP returns 404 on the private repo** (PR diffs/file lists NOT MCP-verifiable — route PR checks through the founder's terminal or CC).

---

## 0.5. SESSION 151 HANDOFF (from Session 150, 2026-07-24) — supersedes everything below it

> **PROD TINYBIRD IS UNTOUCHED.** Every Tinybird change this session (deployment **#25**) is **ST_Staging only**. The prod cutover has **NOT** run.
> **KNOWN_ISSUES:1341 (refunds launch gate) remains OPEN** — code-complete (`#381`–`#384`), staging-verified (`#383`/`#389`, deploy #25), **prod pending**, and **no real refund payload has ever been processed on either provider** (every test is an in-process fixture). Refund netting is not marketable as accurate until a real refund is verified end-to-end on a connected merchant.

**Session 150 (2026-07-24) shipped Phase 7 (refund netting) + two tracker money-rail fixes, PRs `#381…#389`**, all merged to `main` (`067f4ec`, #389). The prior §0.5 (Session 150 handoff, from Session 149) is **fully superseded**; its still-open items are carried forward at the end of this block.

### SHIPPED (`#381`–`#389`)

- **#381** Stripe `refund.created` → original conversion resolution by `payment_intent`; inherits `distinct_id` **only** (the nightly re-derives Supabase attribution from touchpoints — never the event stamp); degraded path sets `attribution_status='refund_unresolved'`. **Boundary:** a subscription-mode refund with no `payment_intent` resolves unresolved.
- **#382** Supabase read paths refund-aware — conversion COUNTs exclude `conversion_type='refund'` (never the SUM); unresolved refunds bucket to an explicit "Unattributed refunds" line, never `direct`.
- **#383** 19 Tinybird pipes refund-filtered (`countIf(... != 'refund')`, **counts only — SUMs untouched**) + a **syntactic** guard test (`pipe-refund-guard.test.js`).
- **#384** Shopify `refunds/create` netting (mirrors #381). `$0` split: a restock-only refund acks **200**; a payload parse-failure returns **500** so Shopify retries (never a silent $0 ack).
- **#385** docs reconciliation — GDPR erasure KI closed (#371/#376), FEATURE_MAP corrected.
- **#386** ad-blocker verification logged.
- **🔴 #387** **MONEY RAIL** — keepalive `fetch` over `sendBeacon`. `sendBeacon` was the **default transport for every send**, incl. `conversion()` and `identify()`, and EasyPrivacy's blanket `$ping,third-party` **silently drops all cross-origin beacons** (uBlock/ABP/Brave). No code read the boolean return, so there was **no fallback attempt at all**.
- **🔴 #388** all-no-op `window.sourcetrack` stub under GPC/DNT. Previously the tracker `return`ed **before** defining the global, so a customer's `conversion()`/`identify()` call **threw `ReferenceError` for every GPC/DNT visitor** (Firefox Private Browsing sends GPC by default). `optIn` is a **deliberate** no-op (GPC is a legally recognised opt-out — do **not** "fix" it).
- **#389** threaded `conversion_type` through nested projections so 3 refund-filtered pipes (`last_touch_by_site_agg`, `first_touch_non_direct_by_site`, `last_touch_non_direct_by_site`) **compile** — PR2b (#383) added the filter to the outer aggregate without projecting the column through the subqueries; `tb --cloud deploy --check` caught it (the syntactic guard could not).

### VERIFIED STATE

- **Tinybird ST_Staging deployment #25 LIVE** (staging only). Both refund-count gates passed on site `ff8d5426-1713-48af-811b-5c12bd2257dd`:
  - `bench_conversions_by_site`: **85 → 68** conversions, `net_revenue 13346.39` **UNCHANGED**.
  - `last_touch_by_site_agg` (`2019-01-01` → `2027-01-01`): **85 → 68** total; all **ten** `(conversions=2, revenue=0)` purchase+refund pairs became `(1, 0)`; **every revenue figure byte-identical**, incl. the float artifacts `206.66000000000003` / `199.20999999999998` / `113.94999999999999`. **Any** revenue movement = a SUM was touched = ROLLBACK. (This pipe exercised the #389 nested-projection fix; `bench` did not.)
- **Ad-blocker (#387):** `tracker.min.js` and `/api/track` are **NOT** on any default filter list (`@ghostery/adblocker`, control passing) **AND** confirmed live in Chrome + uBlock: `/api/track` **200**, `Type=fetch`, initiator `tracker.min.js:1`.
- **privacy_signals WORKS in prod:** 15 `append-hfi` ops, latest `2026-07-24 09:59:32`. The earlier "0 rows" KI was a **staging-only** observation and was **WRONG** (corrected in #388).
- **PROD TINYBIRD UNTOUCHED** — deployment #25 is staging only.

### ⚠️ TRAPS — Tinybird (read before ANY `tb` command; see KI-58 / KI-59). **Full procedure: `docs/tinybird_cutover_runbook.md`.**

1. **The MAIN worktree's `tinybird/.tinyb` is authenticated to PROD**, `TB_TOKEN` unset — `tb --cloud deploy` from that directory hits **production with no prompt**. **ALWAYS read the `Running against Tinybird Cloud: Workspace <X>` line** every `tb --cloud` command prints. `tb --cloud workspace ls` lists only `imubaid93_workspace` and does **NOT** show the workspace you're actually pointed at — it is **not** a reliable check.
2. **Deploys need `st_staging_deploy` (`WORKSPACE:DEPLOY`).** The default token → `workspace requires scope WORKSPACE:DEPLOY`. Pass the token **inline, single-quoted**, for one command: `PD='<token>'; TB_TOKEN="$PD" tb --cloud deploy; unset PD`. **Do NOT use `pbpaste`** (it captures whatever was last copied — usually the command, not the token) and **NOT `read -rs`** (silently returned empty twice on 2026-07-24). Don't re-auth `.tinyb` to prod.
3. **`TB_TOKEN` persists in a shell** and silently overrides `.tinyb` for every later command. **Unset it explicitly** after use.
- (Still true from prior handoff) **Staging dashboard = `https://sourcetrack-dashboard-staging.up.railway.app/`** — the `-production` URL is PROD. **Browser cache masks fresh deploys** — hard-reload before concluding a change didn't ship.

### ORCHESTRATOR TOOLING NOTE — reason about PROD from ORG-LEVEL datasources, not staging data

The orchestrator's Tinybird MCP is bound to **ST_Staging**, and this caused **four** wrong conclusions in one session, all in the same direction — **reasoning about PROD from STAGING data**: the `de200000-refd` phantom refund row; the `'tiktok'` fixture that masked the real `first_touch_source='stripe'` behaviour; the `privacy_signals` "0 rows" KI, which was simply staging having no GPC traffic; and a claim that Railway MCP could not see the SourceTrack project, when it is there under the name **`determined-reverence`**.

What actually reaches prod are the **ORG-LEVEL service datasources**, readable from the staging-bound connection:

- `organization.workspaces` → all workspace ids incl. prod `SourceTrack` (`3c371bb9-2021-429c-b0d7-0758bff75f9d`)
- `organization.pipe_stats` → per-workspace pipe call/error counts
- `organization.datasources_ops_log` → append/create ops per workspace; this is what proved `privacy_signals` works in prod

**Reach for `organization.*` before concluding anything about prod.** They expose operational **metadata only**, not row-level event data.

### NEXT UP (in order)

1. **PROD Tinybird cutover.** Prereqs: **rename `dual_write_append` FIRST** (KI-54); run `tb --cloud deploy --check` and **read the datasource section** (`privacy_signals` has 15 live appends — do **not** disturb it); know the **rollback target** from `tb deployment ls` **before** promoting. **Prod's `--check` diff is LARGER than staging's** — it also carries pre-existing Phase-4 drift on `pageviews_by_visitors`, `conversions_by_site`, `pageviews_windowed_by_site`, `last_touch_by_site`, plus `multitouch_pageviews_live` running a **pre-rename** version in prod (params `lookback`/`to`; **40 of 59** calls 400'd). See **KI-58 / KI-59**.
2. **Refund exercise (end-to-end).** No staging site has a Shopify shared secret, so **PR4 (#384) is unexercisable end-to-end**; only `de200000-babe-…` and `cdf6d291-…` carry Stripe secrets, and they're **encrypted** — the plaintext must be reset to sign a synthetic payload.
3. **PR3 — `charge.refunded`** (not subscribed; Stripe emits it alongside `refund.created`).
4. **PR2c — `excludeRefunds()` helper.** The (A) predicate is inlined ~10× across `dashboard.js` / `analytics.js` / `leads-server.js`; extracting it also makes `analytics.js /summary` unit-testable and closes that logged coverage gap.
5. **`bookin.pk` as first beta tester — DECISION PENDING, not engineering.** Blocker is the **install surface**: the site runs **Google mod_pagespeed AND Cloudflare**, both of which rewrite/defer/combine JS, and the tracker is a `<script async data-site-key="...">` that reads its own `data-` attribute — **untested against an optimising proxy**. Also: payment rails are **JazzCash / Easypaisa / VISA** — **Stripe does not operate in Pakistan**, so none of Phase 7's refund netting applies and revenue would need the **manual conversion API**. Their site advertises **free cancellation**, so the overstatement problem this session fixed would be **live and uncovered** for them.

### Carried forward — still open from prior handoffs (tracked in KNOWN_ISSUES / git)

- **C4 UI/UX round 2** — Settings 4-tab split (§18; 12+ cards in one scroll); Setup & Health per-event status + an events-log stream (Cometly borrows); Attribution density pass; totals rows.
- **Tinybird pipe batch** — Leads Browser/Device **and** Campaigns source/medium (Campaigns needs a `campaign × source` read; the route currently **422s on `group_by2`**).
- **DeepSeek console revocation UNCONFIRMED** (deletion ≠ revocation; the value is in git history; `ai-client.js` has zero callers, so revoking breaks nothing).
- **KI-51 / KI-53** — Campaigns timezone + dimension×model gaps.
- **`api/tests/timezone-reconciliation.test.js`** scores `pass 1` while asserting nothing (a live false green).
- **Doc-consolidation target** (living documents). Full detail: KNOWN_ISSUES.md and prior handoffs in `git log`.


## 1. PRODUCT

Privacy-conscious multi-touch **revenue attribution** SaaS. Tinybird (ClickHouse) is the event
store; Supabase holds accounts + the money rail `attributed_conversions`. PostHog decommissioned
2026-07-19 (project 416017 deleted). Repo `Ubaidofficial/SourceTrack`.

**Positioning:** "Know which source actually drove the sale — not just the visit."
**Primary GTM moat:** GSC SEO-revenue attribution — **still unvalidated end-to-end.**

**Versioning:** there has never been a `v0.x` scheme. Scheme is **free beta → V1 → V1.1 → V2**.
We are **pre-V1, in beta**. `package.json` says `1.0.0` (scaffold default, meaningless).
CHANGELOG stopped at `[Unreleased] 2026-05-23`.

---

## 2. WHAT THE LAST SESSION FOUND — read this before anything else

One pattern appeared **seven times**: *success reported by something that never did the work.*

| Thing | Reported | Actual |
|---|---|---|
| `email-reports` | 255 successes | never sent a single email |
| `railway logs` empty | "nothing ran" | wrong flags — needs `--lines` / `--since` |
| `health-agent` | monitoring 48×/day | into an **unset** webhook |
| `anomaly-watcher` | scheduled | **never ran in prod** |
| `gsc-daily-sync` | 23 runs, 0 failures | **broken since 2026-06-29** |
| `nightly-attribution` | success nightly | `conversions_processed: 0` — write path unexercised |
| June readiness checklist | tracked | lost; same gap reopened a month later |

**Precedent (already fixed, 2026-07-15):** `TINYBIRD_DUAL_WRITE` was set to `ture`. The gate is
exact-match (`dual-write.js:32`), so it silently no-op'd and **no live pageview reached prod
Tinybird** after the Wave-2 cutover — while nothing reported an error. Same pattern, and the reason
to distrust silence as much as false success. Fixed and boot-confirmed.

**The reflex to apply everywhere:** for anything reporting success, ask what it would look like if
it were broken. **If the answer is "the same," it isn't monitoring.**

For an attribution product whose pitch is "the numbers are real," this is *the* failure mode.

---

## 3. VERIFIED PRODUCTION FACTS (do not re-derive; do re-verify before acting)

### Railway — 6 services, 4 crons

Correct jq path is `.deploy.cronSchedule` / `.deploy.startCommand` / `.build.buildCommand`.
(An earlier all-null read was a wrong jq path, not missing config.)

| Service ID | Name | cron | start | build |
|---|---|---|---|---|
| `4e064f4e-345b-4954-96f0-db7b4b0bd929` | nightly-attribution | `0 2 * * *` | `node api/jobs/nightly-attribution.js` | null |
| `9278c467-2ee2-4f81-bd1d-db00e0707bda` | sourcetrack-dq | `0 0 * * *` | `node api/jobs/data-quality-check.js` | null |
| `f15924b7-3e5f-4e76-9d5f-f01b9832fa83` | sourcetrack-health | `*/30 * * * *` | `node api/jobs/health-agent.js` | null |
| `5656176f-4e14-4d57-ae19-3dfc5da8fa64` | sourcetrack-email | `0 8 * * 1` | **null** | **`node api/jobs/email-reports.js`** ← INVERTED, this is the bug |
| `384ca0ac-eab3-4ad9-8c95-23d22a4c2eb6` | Dashboard | — | — | — |
| `4b946535-0895-4042-b45c-c0e3a5e12648` | API | — | — | — |

**Data residency** (verified in #330, needed before any compliance claim): Tinybird
`europe-west3` · Supabase Ireland · Railway `europe-west4`.

All crons `restartPolicyType: NEVER`, region `europe-west4-drams3a`, `configFile: null`
(config-as-code ruled out — no `railway.json` for cron services).

**Not scheduled anywhere:** `anomaly-watcher` (staging only, `0 3 * * *`),
`usage-threshold-emails`. `gsc-daily-sync` runs *inside* `nightly-attribution`.

### `ENCRYPTION_KEY` (the GSC root cause — FIXED 2026-07-20)

sha1 of the value per service: **`94b27297d571` = correct** (API + nightly now match).
`70ea0db8` was the wrong value nightly held. `ba680de0df68` = sha1 of the literal string
`"unset"` — the other four services show this, which is fine.

Verify with: `railway variables --json | jq -r '.ENCRYPTION_KEY' | shasum`

### Alerting gap (`KNOWN_ISSUES` 29 — high severity)

`health-agent.js:109 evaluateNightlyJob` detection is **built and correct**;
`CRITICAL_CHECKS = {supabase, nightly_job, conversions, tinybird_quarantine}`. The delivery
defect splits in two — **env fixed 2026-07-20, code not** (see below): `notify()` gates at `:283` on
`if (!SLACK || dx.severity === 'ok') return`, and `SLACK_WEBHOOK_URL` was **set to the literal
placeholder** `https://hooks.slack.com/services/YOUR/REAL/URL` (verified 2026-07-20) — a **truthy**
value. So `notify()` did **NOT** return early at `:283`; it POSTed every critical alert to a dead
Slack path at `:289`, where the `fetch` **still** has no `.ok` check and no `try/catch`, so the 404 was
swallowed and the run looked clean. (A network *throw* rather than a 404 would be worse: `notify()`
is unwrapped at `:320`, so it would reject `run()`, the top-level `.catch` at `:328` would log a
generic crash, and `process.exit(snap.overall === 'critical' ? 1 : 0)` at `:322` would never run —
masking the verdict.) Months of critical results discarded, including `evaluateConversions` firing
on three days of `conversions_processed: 0`.

The placeholder was introduced while trying to **unset** the variable (the installed CLI lacks
`--unset`), and it made the failure **less** visible, not more: a genuinely unset var would take the
`!SLACK` branch at `:283` and drop the alert — an honest, visible gate — whereas the truthy
placeholder turned that into a **silent false-delivery** to a dead endpoint. **Env fixed 2026-07-20:**
a real webhook is now set and read-back verified on all four services that carried the placeholder
(health, nightly, anomaly, dq); delivery is curl-verified (HTTP 200) — replaced with a real URL, not
re-unset. The **code** defect is untouched:
the unchecked `fetch` (`:289`) and unwrapped `notify()` (`:320`) mean delivery holds only while that
URL stays valid — a revoke, outage, or transient throw would fail silently again.

`health-agent` and `data-quality-check` write **no `job_runs` row at all** — only
`email-reports-weekly`, `nightly-attribution` and `gsc-daily-sync` do.

### GSC / SEO-revenue (the moat) — root-caused and fixed, **unverified**

Dead **2026-06-29 → 2026-07-20**, not merely unproven. Cascade:
`ENCRYPTION_KEY` missing → then malformed → each failure set `gsc_connections.status='error'` →
`gsc-daily-sync.js:152` filters `.eq('status','connected')` so **one bad night permanently
disqualifies a connection** (no retry, no backoff, no self-heal — live design flaw) →
subsequent nights `{eligible: 0}` → `nightly-attribution.js:332` wrote a hardcoded
`status:'success'` with null error.

State: `gsc_performance_daily` frozen at `2026-07-16`, 67 rows, 1 site (`techrupt.pk`,
site_key `473fba5e-f035-4f7c-83cf-1cb1d678ab7f`). Manual sync path works (2026-06-26, 2026-07-18).
Fixed: key corrected, connection reset to `connected`, #332 derives status instead of hardcoding.

**🔴 FIRST THING TO CHECK IN THE NEW CHAT** — the first real automated test:

```sql
select sync_start, sync_type, status, records_synced, error_message
from gsc_sync_runs order by sync_start desc limit 5;
```

`daily`/`success` with non-zero records + `gsc_performance_daily` past `2026-07-16` = the moat has
a working pipeline for the first time since June. `failed` = a second problem behind the
`ENCRYPTION_KEY` one.

### `anomaly-watcher` — why it never ran

June decision moved crons to GitHub Actions (PR #70, `0 2 * * *`, anomaly-watcher +
nightly-attribution). **That workflow no longer exists** — `.github/workflows/` has only `ci.yml`,
no schedule. `nightly-attribution` survived because it also had a Railway service;
`anomaly-watcher` didn't. The June checklist item *"Railway cron entries removed after first
successful GitHub Actions run"* was never checked — the migration reversed.

---

## 4. WHERE THE REPO IS

`origin/main` advanced `79d1c7c → 782b88a` and beyond. **PRs merged last session: #323–#334.**

- **#323** delete dead Share/public-dashboard (customer-facing 404)
- **#324** archive `docs/qa` → `docs/archive/qa` (172 files)
- **#325** archive 15 tinybird phase docs
- **#326** fix stranded citations to archived docs
- **#327** commit GTM doc → `docs/SourceTrack_GTM.md`
- **#328** 5 surgical edits (HogQL residue, FEATURE_MAP §21 receipts, cookieless claim, `.env.example`, dead `/debugger` title)
- **#329** rewrite `SYSTEM.md` + `ARCHITECTURE.md`
- **#330** rewrite `README.md` + `DOCS_INDEX.md`
- **#331** `KNOWN_ISSUES` — log 25–28, correct 20, add 29, queue DEEPSEEK in 18, close 20/22
- **#332** derive `gsc-daily-sync` status instead of hardcoding `'success'`
- **#333** archive **18** root docs → `docs/archive/` — **merged.** `COMMANDCODE_RUNBOOK.md` was pulled back to root as a live Maintained runbook (it is an incident-response doc: deploy checklist, emergency rollback, observability).
- **#334** remove unused `.commandcode/` + vestigial `IGNORED_DIRS` entry — **merged**

**`origin/main` head at handoff: `dc4b89d`.** Still at root and NOT archived:
`COMMANDCODE_RUNBOOK.md`, `SESSION_HANDOFF.md`, `SESSION_LOG.md`, `NEXT_SESSION_PROMPT.md`,
`KNOWN_ISSUES.md`, `FEATURE_MAP.md`, `README.md`, `ARCHITECTURE.md`, `SYSTEM.md`, `DOCS_INDEX.md`.

### `KNOWN_ISSUES` numbering in play
18 (DEEPSEEK rotation queued) · 21 (email-reports never sent) · 25–28 (Tier-3 backlog) ·
29 (no alert channel). 20 and 22 are closed.

### FEATURE_MAP legend
✅ live · 🔒 plan-gated · 🚧 gated (dead-store, 422 not zeros) · 🧪 unproven · ⚠️ half-built ·
🗺️ design-only · ⛔ cut · 📜 agent-reported · ❓ unconfirmed

---

## 5. DISPATCH DISCIPLINE — standing lesson, **7 occurrences**

My dispatches have shipped incomplete or wrong "verified" file lists **seven times**
(#323/#325/#326 counts · #330 regex bug `(js|jsx|mjs|md)` truncating `.json`, fixed to
longest-first `(jsx|mjs|json|sql|pipe|js|md)` · Funnels "sold" overstatement ·
`COMMANDCODE_RUNBOOK` misclassified as tooling config · a `KNOWN_ISSUES:703` citation CC found
that I'd missed).

**Adopted rules:**
- **No file lists in dispatches.** Give a grep PATTERN + acceptance criterion; CC produces the list.
- `git add <explicit paths>` — **never** `git add -A`.
- **"Ninth command"** — grep every moved/deleted file's bare name repo-wide before finishing.
- When a verifier is wrong, **fix the verifier** — don't degrade the artifact.
- CC's fresh grep beats my "verified" list. Treat its contradictions as signal.

---

## 6. PENDING QUEUE (priority order)

1. **⏰ Check `gsc_sync_runs`** — query in §3. The moat's first working automated test.
2. **🔴 Revoke `DEEPSEEK_API_KEY`** — was exposed in a previous chat (value redacted here; treat as compromised). **SAFE TO EXECUTE as of `ab9fc7b`:** verified repo-wide at that ref that `api/lib/ai-client.js` has **zero importers**, so no code reads the key — PR #353 rebuilt campaign verdicts deterministically and removed the only caller. **Revoke in the DeepSeek console + delete the variable from all services — do not replace.** *(The earlier "verified nothing live uses it" claim on this line was FALSE when written: `/api/attribution/verdicts` was consuming it via `attribution.js`. See KI-18 for why a documented negative decays.)*
3. **FEATURE_MAP + RUNBOOK §2 dispatch** — 6 defects, docs-only. *(If I already sent it, review CC's PR. If not, ask me — the file lived in the last chat's container and will need re-creating.)* Defects: (1) blanket `✅ Jobs:` wrong for 4/5; (2) health-agent "scheduling UNCONFIRMED / still monitors PostHog" both stale; (3) quarantine alarm already wired not "being wired"; (4) GSC was broken-3-weeks not merely unproven + auto-disable flaw; (5) `email_reports` / `usage-threshold` have no FEATURE_MAP entry despite `email_reports`
being `true` for trial/starter/growth/scale in `api/lib/plan-features.js` — but a dashboard grep
returned **nothing**, so no customer surface promises it: *entitlement exists, delivery never
functioned, nothing promises it* — **not** a false sale; (6) runbook §2 cron table wrong in six ways and the origin of README's fabricated `0 14 * * *`.
4. **Webhook chain** — real URL (Slack, or Discord + `/slack` suffix) → set on health + dq → dispatch CC to make health-agent and data-quality-check write `job_runs` rows and log undeliverable alerts → **then** schedule `anomaly-watcher` `0 3 * * *`.
5. **`sourcetrack-email` config fix** — service `5656176f`: clear Build Command, set Start Command `node api/jobs/email-reports.js`. (I couldn't verify jq persistence last time.)
6. **Rotate** Stripe secret + webhook secret, `TINYBIRD_ADMIN_TOKEN`, `RESEND_API_KEY`, staging `SUPABASE_SERVICE_KEY`.
7. **Decisions (no build yet):** Funnels build-or-pull-flag — you recommended *pull* (dormant entitlement + dead code reading an empty `pageviews` table; **not** a false sale, since `FEATURE_LABELS` is imported nowhere).
8. **Reconstruct the lost June docs** — see §7.
9. **GSC auto-disable design flaw** — #332 made it visible, didn't stop recurrence.
10. **Tier-3 CODE backlog** (`KNOWN_ISSUES` 27): delete `abuse-guards.js` · `rate-limit.js` `publicDashboardLimit` + orphaned tests · `hogql-date.js` **RENAME not delete** (8 importers) · url-normalization dupe · dangling migration `20260620134500` · 67 test files with `POSTHOG_*`/`ENCRYPTION_KEY` scaffolding.
11. **`DATA_CAPTURE_SPEC.md` rewrite** (`KNOWN_ISSUES` 28) — needs a field-by-field `tracker.js` ↔ `SCOPE_v3.md` §2.6 audit.
12. **`admin.js` ai-analytics probe** (`KNOWN_ISSUES` 25) — reports a deleted feature as "dormant" (`admin.js:686 routeExists('ai-analytics.js')`).
13. **CHANGELOG catch-up** #184 → #334 — derivable from PR titles.

---

## 7. LOST DOCUMENTS — decision needed

On **2026-06-29** five strategy docs existed. Only the GTM doc was recovered (committed in #327).

| Doc | Status |
|---|---|
| GTM Doc | ✅ recovered → `docs/SourceTrack_GTM.md` |
| **Production Readiness** — full checklist, pre-launch gates marked | ❌ lost |
| **Features & Roadmap** — shipped / in-flight / P1 / **V1.1 backlog** ← the versioning doc | ❌ lost |
| **Competitor Intelligence** — DataFast, Cometly, Pirsch, Tracklution, AnyTrack, Plausible, Usermaven, Growify, Stape | ❌ lost |
| Session Handoff (#61–#70) | superseded |

The Production Readiness checklist contained an **unchecked** item:
`[ ] GitHub secrets added for Actions (… SLACK_WEBHOOK_URL)`.
That is `KNOWN_ISSUES` 29 — identified ~2026-06-29, lost with the doc, rediscovered from scratch a
month later. **That is the cost of these living only in chat.**

**Open offer:** reconstruct **Features & Roadmap** and **Production Readiness** as committed repo
docs, verifying each readiness item against production rather than asserting it. Ask me whether to
proceed. Source material is recoverable via `conversation_search` on the June 20–29 chats
(notably chat `e0790aef-c585-4a0e-b938-1ee289a484ef`, "UTM CC output analysis").

---

## 8. HOW TO START

1. Run the `gsc_sync_runs` query in §3 and tell me what the moat's status actually is.
2. Confirm #333 merged and `origin/main`'s head.
3. Tell me whether the FEATURE_MAP dispatch was sent, and what's next.

**To recover detail from the last session** (full dispatch texts, SQL output, CC reports,
the `ENCRYPTION_KEY` diagnosis): use `conversation_search` — the transcript file itself does not
carry across chats.

Do **not** take any claim in this handoff as verified-today — re-check anything you're about to act
on. Flag contradictions rather than adapting silently.
