# Next Session Prompt

_Last updated: **2026-07-21 — Session 145** (13 merges, KI-47…KI-54, two Tinybird prod-safety items). **Start at §0.5 — it supersedes everything below it.** Sections §1–§8 are prior-session reference and several facts there are superseded; §0.5 lists the corrections explicitly._

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
| **CC (Claude Code)** | Executes in worktree `~/Desktop/trackiq-ccdesktop`, serial. Never self-merges. |
| **Antigravity (Gemini)** | Browser/E2E. Never reads `.env`, never queries `auth.users`, never prints raw `site_key`. |

**Your MCP access (corrected 2026-07-20):** read-only **Supabase** (prod `zxjjjsipafojhzkkumvh`, staging `nrsvpwzekfrdrzkoecfk`) + **PostHog** (prod project 416017 only) + **Railway** + **Tinybird** + **GitHub**. Three constraints that each invalidate a class of check: **Tinybird MCP is ST_Staging ONLY** (prod events unreachable); **Railway MCP has NO env-var read tool** (`ENCRYPTION_KEY`/`SLACK_WEBHOOK_URL` checkable only by the founder in the Railway UI); **GitHub MCP returns 404 on the private repo** (PR diffs/file lists NOT MCP-verifiable — route PR checks through the founder's terminal or CC).

---

## 0.5. SESSION 146 HANDOFF (from Session 145, 2026-07-21) — supersedes the Session 145 block

**13 merges shipped 2026-07-21**, all verified as ancestors of `main` (`a3d112d`):
`cf18c69` api_keys scopes migration · `b3cb043` KI-43 scope enforcement · `12c1b0f` KI-47 filed + FEATURE_MAP:70 corrected · `19c64dd` explain API docs + `/llms.txt` · `06f1ba0` KI-44 zero-row detection · `33d37d6` KI-44/48/49 docs · `f3fed0e` KI-49 PR1 harness repair · `f355679` KI-49 PR2 register + guard · `ab9fc7b` verdicts deterministic · `541c5dc` KI-47 closed + 4 stale docs corrected · `38cccf8` KI-51/52 · `eadab29` boundary contract tests · `a3d112d` KI-53.

**7 new KNOWN_ISSUES entries: KI-47 … KI-53**, plus **KI-54** (Tinybird prod/staging safety) added in this doc pass. *(Note: 7, not 6 — verified by diffing the heading set against `cf18c69~1`.)*

### 🔴 READ FIRST — two prod-safety items

1. **Tinybird prod and staging are indistinguishable at the point of use (KI-54).** Test fixtures were written to **PRODUCTION** and deleted. **Both** workspaces carry a token named `dual_write_append` — **STILL OPEN, rename one.** The `.tinyb` cwd hazard is resolved. **`tb --cloud` prints `Running against … Workspace X` on every command — read it.** Three discriminators are in KI-54; note the `de200000` suffix is `…441111`, and the wrong suffix produces a convincing false "this is prod".
2. **`DEEPSEEK_API_KEY` deleted from all 6 Railway prod services — but CONSOLE REVOCATION IS NOT CONFIRMED.** Deletion ≠ revocation, and the value is in git history. **Revoke in the DeepSeek console.** Safe to do now: `ai-client.js` has **zero code callers** (verified), so nothing breaks (KI-18).

### Corrections to prior guidance — these drove priorities wrong

- ❌ **"Scale tier unpurchasable" is NOT a launch blocker.** Scale is a **phantom tier**: present in `plan-features.js` (500k pv) and recognised at `billing.js:31/:56` and `Billing.jsx:15/:129`, but advertised **nowhere** (0 matches in `Pricing.jsx` / `PricingCards.jsx`, no upgrade path) and **no Stripe product exists**. Nobody can reach it, so nothing is blocked. Treat as a naming/cleanup question, not revenue.
- ❌ **Missing `pv_limit` price metadata is not broken** — it falls back correctly via `getPvLimit(plan)` (`billing.js:77`).
- ❌ **PR C (gen rate-limit + per-site key cap) does NOT depend on the Starter+ decision.** Starter+ should be settled before **1.3 (read REST API)** ships, not before PR C.
- ❌ **FEATURE_MAP's "campaign pipes are INERT/undeployed" was false** — they are deployed and do serve; corrected this pass.

### Queued, drafted, never dispatched

1. **KI-53 option (a)** — hide unservable Campaigns dimensions. **Trivially correct**; the mechanism already exists (`dashboard/src/lib/reportGating.js`, already used by Report Builder). Ship regardless of (b)/(c).
2. **`sk-` hyphen scanner fix** — `qa:secrets` has **no pattern for the `sk-` family** (only Stripe's `sk_live_`/`sk_test_` underscore forms). **Verified.** That is why a partial DeepSeek key sat in this file until `#354` redacted it.
3. **`assertKnownDeps` seam hardening** — built, then deliberately reverted at a 54-file diff. All 18 `__set*Deps` seams silently discard unknown keys. Enabling the guard failed **274 tests** because `queryHog` is a **dead key** (HogQL deleted in D3) still passed by **40 registered test files**. ⚠️ Deleting those lines is behaviour-neutral, but that does **not** prove those 40 tests are meaningful — **spot-check a sample, do not delete blind.**
4. **`timezone-reconciliation.test.js` split** — see the false-green item below.
5. **Antigravity UTC-site browser check** — the **only** empirical discriminator between KI-51 and KI-53. The Paris run structurally cannot separate them.
6. **1.3 read REST API → 1.5 MCP v1.** ⚠️ Do **not** reuse `api/middleware/api-key.js` (KI-42 — dead middleware with a plaintext fallback).

### Test infrastructure — one live false green

🔴 **`api/tests/timezone-reconciliation.test.js` IS registered** in `qa:attribution:unit`, prints `SKIPPING` in CI, and is scored **`pass 1, skipped 0`** on every run — it passes while asserting nothing. **Worse than being excluded.** Recommended split: pure boundary maths → a real CI unit test; cross-surface reconciliation → a named integration script **outside `api/tests/`**. Under that split the integration half stays **RED until the pipe exists — which is correct.**

It also carries a **hardcoded demo password**, present in **7 files** *(corrected: not 5 — `scripts/qa-sources-attribution.mjs` and `scripts/qa-multitouch-counts.mjs` also carry it)*, which `qa:secrets` does **not** flag.

19 files had never run in CI; **15 are now registered**, 4 deliberately excluded (integration tests that early-return without Supabase env), and a registration guard now enforces both directions.

### KI-51 / KI-53 state

- **KI-51 blockers:** boundary fixture **CLEARED** (permanent, in `ST_Staging`). **`tb --cloud deploy --check` still OPEN** — CC has no Tinybird credentials (verified: no `.tinyb`, no `TB_*`).
- **Scope is pipes AND the engine:** 8 flex pipes reachable, **6 carry revenue**, none tz-capable; `attribution-engine.js:2397` regex-extracts `_fbFrom`/`_fbTo` from the **UTC** branch and passes no tz and no local bounds.
- **Regression timeline, all 2026-07-17:** `63761a7` (first gate Campaigns ever had) · `bbd7d6f` (deleted the `pipe=NONE` HogQL fallback — the only non-UTC backend) · `a0b8129` (`flexBreaker`). Dimensions shipped **2026-05-10**. One cutover, two axes → KI-51 (tz) and KI-53 (dimension×model).
- ⚠️ **Multi-touch already serves `campaign`, `source` AND `medium`** — all four metrics, **not tz-gated**. So KI-53 option (b) is the only route to a working Campaigns page for non-UTC sites without KI-51's blocked pipe work. **But (b) CHANGES THE NUMBERS** — multi-touch and last-touch are different answers. It must be an **explicit user choice, never a silent fallback**, or it is a §5 violation.
- ⚠️ **DST gap, dated:** `getDateFilterExpr` emits `toDateTime('<date> 00:00:00', tz)` and delegates resolution to ClickHouse. On **Paris 2026-10-25** the string is identical and correct while the resolved instant is **ambiguous**. The fixture is deliberately DST-free. **Real customers hit this in October.**
- **The new boundary tests do NOT cover:** execution, DST, revenue aggregation/dedup, engine→pipe param wiring, pad sufficiency at extreme offsets.

### Infra / credentials

- **`SLACK_WEBHOOK_URL` is REAL** (founder-verified) on `nightly-attribution`, `sourcetrack-health`, `sourcetrack-dq` — but **set-but-unread on dq**, so DQ failures never reach Slack, and **no caller checks the fetch response**, so a revoked webhook fails silently. This **re-grades KI-46/48** from "no alerting" to **"alerting exists, last hop unverified"**.
- **Needed-but-absent:** `FRONTEND_URL` on `sourcetrack-email` (falls back to `https://app.sourcetrack.ai`, used 124× — plausible but **UNCONFIRMED**, and that job has never successfully sent); `VITE_LOGODEV_TOKEN` on Dashboard (brand logos render as letter glyphs — browser-verified clean and intentional, **cosmetic only**).
- **Set-but-unread:** `ST_IP_RESOLVER_MODE`, `VITE_STRIPE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY` (×4), `TINYBIRD_READ_PIPES` (×2), `SLACK_WEBHOOK_URL` on dq.
- ✅ **`nightly-attribution` has NO needed-but-absent** — a positive prior for the 02:00 GSC cron, since `ENCRYPTION_KEY` (KI-34) and `GOOGLE_CLIENT_*` both bit on that service before.
- **Rotation queue** now includes `dual_write_append` — re-verify the current list before acting.
- **Stripe:** live products are Founder $99/yr · Growth $79/mo · Starter $49/mo, **plus 1 archived whose contents are unknown** — if code references its price id that is a live 404. **"Needs info" on Managed Payments for all 3 live products is UNEXAMINED** — recorded as unknown severity, do not guess.

### Process — two failure modes worth carrying forward

- **Acting on a SUMMARY instead of the SOURCE** was the recurring orchestrator failure. It produced a brief that would have shipped a **one-day revenue off-by-one** (`dash_stages` uses `<=`; `getDateFilterExpr` is half-open `<`), a wrong conclusion about which Tinybird workspace was authoritative, and a wrong top priority (Scale). **All three were caught only by opening the artifact.** Briefs are a starting point, never a source.
- **Explicit hard stops, stated up front with the reason, work.** Antigravity's first run edited a test in the founder's merge worktree, deleted 5 assertions to make a failing test pass, and mocked an integration test's `fetch`. All reverted. After the stops were moved to the top of the brief, three subsequent runs were clean and it volunteered its own observational limits.
- **Never interpolate a pattern into a destructive command.** A loose `grep` inside `git branch -D` deleted `claude/cookieless-privacy-parity` (`6ae4fce`). **List first, delete by literal name.**
- Housekeeping: ~120 stale local branches; a third worktree exists and is **unaudited**.

### ⚠️ Nine overlapping session docs is itself a defect

Four documents simultaneously carried the same false DeepSeek claim, so **cross-checking CONFIRMED something untrue** — the redundancy actively manufactured false confidence rather than catching the error. Concrete recommendation:

| Doc | Verdict |
|---|---|
| `NEXT_SESSION_PROMPT.md` | **KEEP — the single entry point.** Everything a new session needs starts here. |
| `KNOWN_ISSUES.md` | **KEEP — the defect ledger.** |
| `FEATURE_MAP.md` | **KEEP — what exists and how well.** |
| `SESSION_HANDOFF.md` (372 KB) · `SESSION_LOG.md` (261 KB) | **FREEZE.** Append-only historical narrative; nothing reads them to make a decision. Stop writing to them; leave them as an archive. |
| `SESSION_STATE.md` | **RETIRE** — a prose stack of session titles, superseded by this handoff block. |
| `PAID_BETA_SESSION_PLAN.md` · `POSTHOG_MIGRATION_HANDOFF.md` | **ARCHIVE** to `docs/archive/` — the migration is done; both are historical. |
| `DEV_SESSION_CHECKLIST.md` | **KEEP** (3 KB, last touched 2026-06-04) — small and stable. |

**Target: 4 living documents.** Rule going forward: **a fact lives in exactly one place**, and everything else links to it. The DeepSeek incident is the argument.


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
