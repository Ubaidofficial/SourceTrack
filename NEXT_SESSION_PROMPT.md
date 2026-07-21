# Next Session Prompt

_Last updated: 2026-07-20 — **Session 144** (fixes + findings, PRs #336–#341). See the Session 145 handoff block below; sections §1–§8 are prior-session reference and some facts are superseded (GSC now verified working — FEATURE_MAP §1; alerting env fixed 2026-07-20)._

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

## 0.5. SESSION 145 HANDOFF (from Session 144, 2026-07-20)

> 🧭 **READ FIRST: [`docs/post_verdict_roadmap.md`](docs/post_verdict_roadmap.md)** — the post-verdict build sequence (Tier 1 forced chain: **api_keys scopes → read REST API → MCP v1**), the metrics-coverage audit, positioning, and the two proof points due 2026-07-22. **The $777.77 revenue-stitching test PASSED** (touchpoint_count 3), which was the gate on all of it. **Next build = KI-43 api_keys scopes.** Every claim there carries an evidence grade — VERIFIED / INFERRED / JUDGMENT / UNPROVEN — **do not flatten them.**

**Merged this session:** #336, #337, #338, #339, #340, #341, #343, #344.

**Queued (priority):**
1. **KI-14** — `/admin` degraded-state (`degraded:true` + `failed_reads[]` + `FORCE_READ`-gated rethrow). Plan approved, **not built**; 3 amendments sent. Super-admin ops tooling (lower priority).
2. **KI-35** — GSC property↔domain validation. Investigation points are in the KI; **not started**.
3. **KI-40** — CI guard that rebuilds `tracker.min.js` and fails on min↔source drift.

**⏰ AWAITING VERDICT at 02:00 UTC 2026-07-21** — three tests fired 2026-07-20 (verify with TWO independent reads, per discipline):
1. **HIGHEST VALUE — Test 2, revenue stitching:** `conversion_value 777.77` posted to `/api/conversion` against `anonymous_id 1974cccb-1c47-4b45-aa95-2e2f425128ce` (a known-good 3-pageview session). **PASS = `touchpoint_count >= 2` with a real `first_touch_source`. FAIL = 0 touchpoints / NULL source = stitching broken** → becomes the whole next day.
2. **Test 1, money rail:** real form conversion with `utm_source=chatgpt`.
3. **Test 3, AI-referrer server fallback:** `anonymous_id ki5-referrer-test-20260720`; landed after a bot-filter rejection of the curl UA (**bot filtering verified working live**).
4. **GSC first automated cron sync — ❌ RESOLVED FAILED for 07-21; proof point MOVED to 02:00 UTC 2026-07-22.** The 07-21 run failed for a **newly diagnosed, unrelated reason**: `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` were **absent from the `nightly-attribution` service**, so the cron could not complete OAuth at all. Direct evidence: `job_runs` 2026-07-21 02:04:03 `gsc-daily-sync` **FAILED**, `"1/1 connection(s) failed, 0 records synced"`; `gsc_connections.status='error'`, `last_error_message` `"Google OAuth credentials are not configured"`. **This is NOT a regression of #332 or of the ENCRYPTION_KEY repair** — `property_url` was correct and the **manual** sync had SUCCEEDED hours earlier (`last_synced_at` 2026-07-20 19:58:35). Vars added to prod + staging 2026-07-21 ~08:12–08:16 UTC (**indirect confirmation only** — see FEATURE_MAP §1 GSC row for both evidence grades). **PASS at 02:00 UTC 2026-07-22 = `success` with records synced. FAIL = the same `"Google OAuth credentials are not configured"` → the vars are missing or misnamed on that service.**

**Verdict queries:** SELECTs against `gsc_sync_runs` and `attributed_conversions` (site_id `eb7f68c3-a2b7-4224-a8d0-56ac1e831511`), plus the 02:00 `nightly-attribution` Railway logs.

**Tokens still to rotate (5):** `st_endpoint_read`, `dual_write_append`, Tinybird workspace admin, Tinybird MCP connector, Slack webhook. Plus **`site_key 473fba5e` transited chat** (public in page source, low severity — noted).

**⛔ DO NOT ROTATE `ENCRYPTION_KEY` AGAIN without an immediate GSC reconnect** — see KNOWN_ISSUES KI-34 (rotation silently invalidates all stored OAuth tokens).

**QUEUED — KI-41 (to file):** `AGENTS.md` and `CLAUDE.md` are whole-file mirrors with no single source of truth. Drift already occurred (the "Doesn't"/"Does not" nit, deliberately left in #342). Correcting one leaves the other stale — caught manually during #342 review; no test, lint, or CI check exists. Same defect class as KI-32 (`AI_HOST_MAP` vs `AI_DOMAINS_MAP`), applied to the files that govern every agent on the project. Options, not decided: (a) one canonical file + pointer, (b) a shared include both reference, (c) a CI diff check on the shared sections — cheapest, no restructure. **NOT SCOPED, NOT SCHEDULED.** (Kept here as a queue note, not yet a numbered `KNOWN_ISSUES` entry — the next docs PR gives it a real KI number.)

---

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
