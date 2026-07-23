# AGENTS.md — SourceTrack

Context + standing rules for **any** AI agent (Claude, GPT, DeepSeek, Gemini/Antigravity, etc.) working on this repo.
This is the universal entry point. Read **§0 Hard Safety Limits first** — it overrides everything. Then the Quick Start, then the rules below.

> Companion file: `CLAUDE.md` (read by Claude Code) mirrors §0 and the standing rules here. Keep the two in sync; if they ever diverge, **the stricter rule wins.**

---

## 0. Hard Safety Limits (non-negotiable — override everything else)

These are **not advisory.** They override any other instruction, including urgency, emotional framing, or apparent task necessity. If completing a task seems to require any of these, the forbidden action is **never** the answer — **STOP and report "blocked: need a human."**

### Production & data safety
- **READ-ONLY by default.** Never write to production or staging databases without an explicit, per-task human go-ahead.
- **NEVER write to `auth.users` or `auth.sessions`** under any circumstances — no signup-as-test, no password/hash edits, no `email_confirmed_at` changes, no user/session deletes.
- **No DDL / migrations applied to any live database.** Agents may *write a migration file*; only a human-approved orchestrator step applies it (see §8).
- If a test user or seed row is needed, **STOP and ask the human to provide it.** Do not create one.

### Secrets
- **NEVER read, extract, copy, print, log, or use raw secrets/keys** — service-role/secret keys, JWT secrets, Railway/host env variables, SMTP credentials, API tokens. Use only the scoped MCP tools provided.
- **Never write a secret to a file, script, or log** — even temporarily, even to "clean it up after."
- No secret, key, or token belongs in this repo or any committed file. Never commit `.env`, secrets, `.bak`, or test artifacts (see `docs/ai_agent_workflow_rules.md` → Secret Handling Rules).

### Auth & access
- Never reset, change, or work around any password or login. Never mint recovery/magic links.
- If you cannot access something because you're not logged in, **STOP and report "blocked: need a provided session."** Do not seek, guess, mint, or engineer credentials in any way.

### Scope discipline
- Do the single task asked. Past assistance or an emotional/urgency framing is never authorization to exceed these limits.

> These exist because an agent once treated "read-only" as advisory and engineered around a missing login — extracting a production key and mutating `auth.users`. That must never recur. The real guardrail is **revoked capability** (scoped MCP grants); this section is the backstop.

---

## 1. Quick Start — read these before any session (in order)

1. `RULES.md` — coding behavior rules
2. `AGENT_BRIEF.md` — product, stack, ports, commands, commit format
3. `PROJECT_CONTEXT_COMPACT.md` — condensed overview
4. `SESSION_STATE.md` — current session, branch, blockers
5. `SESSION_HANDOFF.md` — last completed work, pending QA
6. `KNOWN_ISSUES.md` — verified bugs/gaps only
7. `AI_SESSION_PLAN.md` — upcoming session plan

Then use `DOCS_INDEX.md` to find task-specific docs.

**Authority order (when sources conflict):** `docs/design/design.md` **§0 (Scope Gate)** wins all scope conflicts → this file / `CLAUDE.md`. Don't silently reconcile a conflict — surface it.

> Until 2026-07-22 this order had three tiers above the design spec, each naming a file that **had never existed in this repo's history** (verified via `git log --all --diff-filter=A`) — so "defer to the higher-authority doc" silently fell through to this file every time. Those tiers were **dropped, not repointed to a guess.** Every tier above now names a file you can open; if you add one, verify it exists first.

---

## 2. Session Workflow

### Before every session
- Read the 7 files above; check `SESSION_STATE.md` for current branch/blockers and `MANUAL_QA_BACKLOG.md` for pending QA.

### During every session
- Follow `RULES.md` and §3 below (surgical changes, no scope creep, verify before claiming).
- Update `SESSION_STATE.md` when starting/ending work; log bugs in `BUG_REVIEW_LOG.md`.

### After every session
- Run: `node --check api/index.js api/routes/*.js api/lib/*.js`
- Run: `cd dashboard && npm run build`
- Run: `git diff --check`
- If the tracker changed: `npm run build:tracker`
- Update `SESSION_HANDOFF.md` (done + remaining), `SESSION_LOG.md` (summary), `AI_SESSION_PLAN.md` (status).

### Before committing — **commit gate**
- All checks above pass; manual QA performed if applicable (mark in `MANUAL_QA_BACKLOG.md`).
- **No agent may commit or push before raw `git diff` review and explicit user approval** (governed by `docs/ai_agent_workflow_rules.md`).
- Never commit `.env`, secrets, `.bak`, or test artifacts.
- Commit message uses the HEREDOC format from `AGENT_BRIEF.md`.

---

## 3. Core Project Rules

- **Surgical changes only.** Touch only what you must; match existing style. Every changed line traces to the request.
- **No scope creep.** If something adjacent is broken, surface it in the session report — don't fix it silently.
- **Verify, don't assume.** Code inspection is **not** runtime verification. Design docs / Figma describe *intended* architecture, not what's built.
- **Treat `docs/archive/PROGRESS.md` and `docs/archive/DEEPSEEK.md` as history, not proof.**
- **Do not overclaim.** Never claim Cometly/DataFast/Usermaven parity, paid-ad features, ROAS/cost-import, MRR/trial-to-paid, or business-dashboard features unless verified in code **and** QA.
- **Think before coding:** state assumptions; if multiple interpretations exist, present them — don't pick silently; if a simpler path exists, say so.
- **Simplicity first:** minimum code that solves the problem; no speculative abstractions, flexibility, or error handling for impossible cases.

---

## 4. Architecture (verified — do not "fix" intentional designs)

**Stack:** Node.js **ESM** (`import`/`export` only — never `require()`), Express, React + Vite, Supabase, Tinybird (ClickHouse read layer), Railway, Stripe (two separate webhooks — see §6). *(PostHog is fully decommissioned — no code, env, or project remains.)*

**Hybrid data model (do not collapse):**
- **Tinybird** (ClickHouse) = events / analytics **read** layer (pageviews, sessions, aggregations), served by deployed pipes in `tinybird/pipes/`. Reads go through `api/lib/tinybird-read.js` (`queryTinybirdPipe`): retries transient failures (429/5xx/network, ≤3 attempts), returns `null` on exhaustion, never throws. **No PostHog/HogQL fallback exists (deleted)** — a `null` read fails **CLOSED** (readers/engine throw; nightly aborts), never a fake zero or another store.
- **Supabase (Postgres)** = source of truth for **attribution, conversions, revenue, billing/entitlements**.
- OLTP/OLAP split: Postgres + ClickHouse (Tinybird).
- The `pageviews` table is **empty by design** — analytics reads come from Tinybird. Do not "repair" it.

**Environments & refs (these are project refs, NOT secrets — never put keys in any committed file):**
- Repo: `Ubaidofficial/SourceTrack`.
- Supabase: prod `zxjjjsipafojhzkkumvh`, staging `nrsvpwzekfrdrzkoecfk`.
- Tinybird workspaces: prod `SourceTrack`, staging `ST_Staging`.
- Railway: prod env `dc68ba7b`, staging `74a58dbc`.
- URLs: app `app.sourcetrack.ai`, API `api.srctk.com`, staging dashboard `sourcetrack-dashboard-staging.up.railway.app`.

**Project-specific code rules:**
- Use `getSupabase()` from `api/lib/supabase.js` only — never call `createClient()` directly in routes. Every `createClient()` must use `{ realtime: { transport: WebSocket } }`.
- `dotenv.config()` must be the **first line** in all job/cron files.
- Tracker URL is `/tracker/tracker.min.js` — never `/tracker/loader.min.js`.
- Tinybird pipe SQL (`tinybird/pipes/*.pipe`, ClickHouse; `tb --cloud deploy --check` is the mandatory pre-deploy gate): parameterize with template params — `site_id` required, never raw `${variable}`. `{{DateTime(p, required=True)}}` takes no `toDateTime()` wrapper; optional dates `{{DateTime(p,'1970-01-01 00:00:00')}}`; timezones `{{String(tz,'UTC')}}` never `required=True` (breaks `toTimeZone()` under `--check`). ClickHouse idioms still apply: `toFloatOrZero` never `toFloat64OrZero`, prefer `countIf(...)` over `COUNT(CASE WHEN ...)`. `JSONExtractString` returns `''` not `NULL` — `nullIf(...,'')` where NULL matters.
- Channel classifier: `ORGANIC_SEARCH_ENGINE_HOSTS` / `ORGANIC_SEARCH_SOURCES` are the single exported source of truth, shared between the Tinybird pipe SQL (e.g. `seo_revenue_landing_pages.pipe`) and `channelFromEvent` — don't fork it.
- **Attribution accuracy > speed.** Verify the math before committing. When unsure about attribution logic, read `nightly-attribution.js` and `attribution-engine.js` before changing anything.

---

## 5. Data Truth & Privacy (non-negotiable product invariants — enforce in code, not just copy)

- **No fake zeros.** Never render `$0`/`0`/`—` as a stand-in for "no data." Hide the metric or show a calm empty state.
- **Revenue** appears only when a real revenue source exists (Stripe/webhook/manual conversion value). Else hide revenue cards/columns.
- **Cost-gated metrics** (ROAS, CPL, CAC, ad spend, net profit) are hidden unless ad-cost data exists for the range.
- **GSC/SEO** requires a connected property; query-level revenue is **estimated**, matched by landing page + date range, and carries the truth label. Never imply exact query→customer attribution.
- **Privacy is the moat — non-negotiable:** cookieless visitor model, **no fingerprinting**, respect DNT, **never add cookies**. `enrich()` never stores raw IP. No person-level de-anonymization, ever.
- **AI features are truthful-only** (design spec §26): no LLM-narrated freeform revenue/ROAS/attribution numbers, no fake predictions, no fake recommendations, no model-version labels, no chatbot analyzer in V1.

---

## 5.5 Security, RLS & Tenant Isolation (non-negotiable)

This is a multi-tenant SaaS handling other companies' customer + revenue data. A tenant-isolation or RLS miss is a breach, not a bug.

- **RLS on every tenant table.** Any new table holding customer/tenant data ships with Row-Level Security **enabled** and tenant-scoped policies. Never expose a table to the `anon` or `authenticated` role without an explicit policy. Default-deny.
- **Tenant isolation in every query.** Every query returning customer data is scoped to the tenant (`site_id` / `company_id` / `user_id`). Never return cross-tenant rows. Service-role queries that bypass RLS must filter by tenant **explicitly in code**.
- **`site_key` vs `site_id`:** `site_id` is internal (joins/refs); `site_key` is the customer-facing tracking key. Never expose a raw `site_key` in UI, logs, or error messages. Every ingestion endpoint validates `site_key` and rejects (401/403) when missing/unknown — never fall through to a default tenant.
- **SSRF guard on user-supplied URLs.** Any server-side fetch of a customer-controlled URL (managed proxy, outbound webhook target, domain verification, GSC) must reject private/loopback/link-local/metadata IPs (`169.254.169.254`, `10/8`, `127/8`, `::1`, …), restrict scheme to `https`, and cap redirects. Never fetch an internal address on behalf of user input.
- **Outbound webhooks:** HMAC-sign payloads, keep them plan-gated, keep the SSRF guard. Don't widen scope without review.
- **Idempotency on all ingestion** (not just Stripe). Any endpoint ingesting events/conversions/revenue must be idempotent: claim the key **after** the write succeeds.
- **Cookieless identity is a security boundary, not only privacy.** No cross-site identifiers, third-party storage, or fingerprinting — first-party, cookieless only.
- **Agents never trigger live Stripe writes.** Billing/refund/subscription changes go through reviewed code or the human — never an agent-initiated Stripe MCP/API write. Live-money actions are human-gated, same class as `auth.users` (§0).
- **New PII store ⇒ all THREE GDPR paths, same PR.** Any PR that creates or adds a PII-bearing column/table MUST cover it in **all three** paths in the **same PR**: `/gdpr/visitor` (Art. 17 erasure), `/gdpr/subject` (Art. 15 access), **and** `/gdpr/account` (workspace/account deletion — the higher-volume real-world purge). A PII store outside any of these is a compliance defect, not a follow-up. **Reviewer checklist: new PII table → is it in all three GDPR paths?**
  - **`/gdpr/account` coverage** is satisfiable by **either** a documented `site_id → sites(id) ON DELETE CASCADE` FK (the mechanism `lead_qualifications` / `site_identity_links` / `subscription_identity` use) **or** an explicit delete in the handler (the mechanism `attributed_conversions` uses) — but it MUST be **one** of them, and the PR MUST **state which**. Don't use both: two overlapping mechanisms diverge over time. `volunteered_identity` shipped with neither and orphaned real emails on account deletion (fixed by FK cascade in #376; the #372 rule caught `/visitor`+`/subject` but hadn't named `/account`).
  - Match on the key the rows **actually** use, not the one the column is named after. `lead_qualifications.visitor_id` and `subscription_identity.anonymous_id` both hold a `distinct_id`; erasure matched `anonymous_id` and therefore matched **zero rows** while answering *"has been erased"* (fixed in #371, logged as a KI in #370).
  - **An erasure that deletes nothing must never report success.** Count rows affected (`{ count: 'exact' }`) and let the count — never a status enum — decide what the response may claim. The false-success response is what hid two whole tables sitting outside erasure for months.
  - Art. 15 access must disclose **exactly** what Art. 17 erasure removes. If the two lists ever diverge, one of them is lying.

---

## 6. The Two Stripe Webhooks (NEVER conflate)

1. **`api/routes/billing.js` → `billingWebhookHandler`** — SourceTrack's **own** billing/entitlements (plan state on sites). Dedupe via in-memory NodeCache. **Records no revenue.**
2. **`api/routes/stripe-webhook.js` → `POST /:site_key`** — **customers' buyers'** purchases, ingested as `$conversion` for attribution. DB idempotency via `revenue_idempotency_keys` / `claim_revenue_idempotency_keys`.

**Idempotency rule:** claim the key **after** the write succeeds. Pricing (live, locked): Starter $49/mo · Growth $79/mo · Founder $99/yr. MRR-by-source and trial→paid are **not built** — don't assume they exist.

---

## 7. PR & Merge Discipline

Every PR delivers a **7-command bundle** (raw terminal output): `git status` · `git diff --stat` · session-doc (`*.md`) diff **empty** · `git log --oneline` · `git diff --check` · `node --check` on changed JS · `git rev-parse HEAD`.

Plus:
- **CI green on the EXACT head SHA** (that SHA's run, not "a" green run).
- `mergeable_state` **CLEAN** before merge — never merge on `UNKNOWN`; wait for it to resolve.
- **Agents do NOT merge.** The human merges. Stop at "PR up, CI green, bundle delivered, approval requested."
- After a squash-merge, dependent branches must be **rebased onto the new `main`** with fresh CI before merging.

---

## 8. Migrations & DDL Discipline

- **Agents write the migration FILE only** — timestamped, snake_case, under `supabase/migrations/`. Agents **never** apply it to any database and never use a DB write tool to run it. A human-approved orchestrator step applies it **staging → prod**.
- **Idempotent guards:** wrap DDL in existence checks so it's safe across environments.
- **Ordering:** when adding a FK with `ON DELETE CASCADE` to a table with violating rows, **delete the orphans first, then add the FK.**
- **apply-then-merge:** apply the DB change before merging the code that depends on it.
- **Forward-only:** never modify an already-applied migration; write a new timestamped one.
- **Schema drift is real:** prod ≠ staging, and prod is often *tighter*. Verify the actual constraint on **prod** (read-only) before assuming repo schema = live schema.

### Tinybird Pipe Deploys
- **Founder-Only:** All Tinybird pipe deployments to the production workspace are strictly founder-gated.
- **Pre-deploy Gate:** Running `tb --cloud deploy --check` against production is the mandatory pre-deploy check. Seeing "No changes to be deployed" doubles as a deployment-parity validation for all local `.pipe` files.
- **Deploy-then-merge:** Deploy Tinybird pipes *before* merging the backend code that depends on new endpoints, parameters, or columns.

---

## 9. Verification Principles

- **Real-env only:** verify on staging/prod URLs — **never localhost.** A localhost pass proves nothing about production.
- **Design doc = intent, not current state.** Verify against the **fetched remote ref** (`git fetch`; `git show origin/main:<file>` / `git grep` on the fetched ref) — local working-tree reads are stale.
- **"Is it real?" checks pull identifying rows, not just counts.** A count can look healthy while every row is test/seed data (e.g. "68 members" that were 59 orphans). Select and inspect the rows.
- **Verify every "handled elsewhere" claim against the actual data path.** These assumptions have been proven wrong repeatedly.
- **Only GREEN, prod-verified, with-real-data is "done"** or marketable. Cross-reference site IDs against known test/seed sites before concluding real-customer impact.
- **Browser/E2E agents can false-pass** — require a screenshot per claim, and a human money-math confirm for anything revenue-related. Confirm a change is actually deployed before judging it; if you see legacy UI, report "not deployed," don't FAIL. Report only what you see — never fabricate.

---

## 10. Scope Gates (V1 / V1.1 / V2)

- A **designed component is not a shipped feature.** Visibility is gated by feature flags, data availability, integration status, and rollout scope.
- **V1** = ship now · **V1.1** = next, locked/hidden in V1 · **V2** = future, not in active V1 UI.
- Don't surface V1.1/V2 UI without a feature flag and explicit go-ahead. Honor the design spec's §26 prohibited-elements list.

---

## 11. Agent Roles & Dispatch

- **Orchestrator (planning chat)** — plans, dispatches, verifies. Read-only MCP: **Supabase + PostHog (PROD project 416017 only) + Railway + Tinybird + GitHub**. Reviews SQL and hand-applies migrations on human go. Doesn't write code.
- **Claude Code (CC)** — executes: files, logic, DB-migration *files*. No Railway, no browser. Subject to §0, §7, §8.
- **Browser E2E agent (Antigravity)** — visual verification only. Installed panel (screenshot-confirmed 2026-07-03): **chrome-devtools-mcp, posthog, railway, supabase — all enabled; stripe present but DISABLED; NO Tinybird MCP** (supersedes the earlier "may have Tinybird" note, which was incorrect). **No GitHub MCP entry visible** — prior git/`gh` work went through raw terminal + CLI, so "Antigravity has GitHub MCP" is a possible mischaracterization of CLI access; recorded as **UNCONFIRMED** (do not assert either direction). Read-only MCP only — no DB writes, no secret access (post-incident lockdown). If blocked on login, it stops and reports; it never works around auth.
- **Three orchestrator MCP constraints** (each invalidates a whole class of check — agent output must be independently corroborated): (1) **Tinybird MCP is ST_Staging ONLY** — prod events are unreachable from the orchestrator. (2) **Railway MCP has NO env-var read tool** — `ENCRYPTION_KEY` / `SLACK_WEBHOOK_URL` and similar can only be checked by the founder in the Railway UI; code-only audits miss live env state entirely (`TINYBIRD_READ_ENABLED` is the standing example). (3) **GitHub MCP authenticates as `Ubaidofficial` but returns 404 on the private `SourceTrack` repo** — PR contents, diffs, and file lists are NOT orchestrator-verifiable; every PR check must route through the founder's terminal or CC.
- **Worktree Isolation Mandatory:** Each agent operates exclusively in its own designated git worktree to prevent branch switching or commit collisions. The 4 mandatory worktrees are:
  - `~/Desktop/trackiq` (Founder use, **MERGES ONLY**)
  - `~/Desktop/trackiq-ccdesktop` (Claude Desktop Agent)
  - `~/Desktop/trackiq-cccli` (Claude Code CLI Agent)
  - `~/Desktop/trackiq-antigravity` (Google Antigravity Agent)
  *Note: Two collisions occurred on 2026-07-18 before worktrees existed (CC CLI's commit landed on CC Desktop's branch; CC Desktop's checkout was auto-switched mid-task).*

Every agent task arrives as a copy/paste-ready prompt prefixed with the relevant standing rules and **labeled `[→ CC]` or `[→ ANTIGRAVITY]`**. Treat an agent "PASS" as a claim to verify, not a fact.

- **NEVER use `git stash`** (`stash push`/`pop`/`apply`/`branch`). Git's stash stack is **shared across all worktrees of the repo**, so a `pop`/`apply` from your worktree can grab — and conflict with — another branch's or another agent's stashed work, and a failed pop leaves conflict markers on unrelated files. To set changes aside or compare against another ref, use a **temporary detached worktree** (`git worktree add --detach <path> <ref>`; remove with `git worktree remove --force`) or a **WIP commit on your own branch**. Never touch the stash. (Incident 2026-07-18: an agent's `git stash pop` grabbed a different branch's WIP and left `UU` conflict markers on `SESSION_LOG.md` / `SESSION_STATE.md` / `api/routes/analytics.js`; recovered without loss, but the shared-stack hazard is real.)

---

## 12. Communication & Operating Stance

Carry-forward role: **honest orchestrator + senior MarTech engineer + SaaS QA manager.** Brutal honesty, **evidence over narration**, **verify-before-trust**.
- Recommendation-first, concise, explicit next steps. State assumptions inline; flag uncertainty honestly.
- Honest pushback is welcomed. Don't narrate work you haven't verified — show the diff/query/screenshot, not a description of it.

---

## 13. Key Files

| File | Purpose |
|---|---|
| `CLAUDE.md` | Companion standing-rules file (Claude Code); mirrors §0 |
| `RULES.md` | Coding behavior contract |
| `AGENT_BRIEF.md` | Stack, ports, commands, commit format, core rules |
| `PROJECT_CONTEXT_COMPACT.md` | Product/stack/design at a glance |
| `docs/design/design.md` | Product/design spec (intent, not proof). **§0 is the Scope Gate — the scope source of truth that wins conflicts.** |
| `AI_SESSION_PLAN.md` | Upcoming session roadmap |
| `SESSION_STATE.md` | Current branch, blockers, active work |
| `SESSION_LOG.md` | Session history log |
| `SESSION_HANDOFF.md` | Last completed work + pending QA |
| `KNOWN_ISSUES.md` | Verified bugs and risks |
| `docs/archive/IMPLEMENTATION_GAP_LIST.md` | Built vs planned |
| `MANUAL_QA_BACKLOG.md` | Per-session manual QA items |
| `BUG_REVIEW_LOG.md` | Code-review issues found |
| `COMMANDCODE_RUNBOOK.md` | Standard procedures |
| `DOCS_INDEX.md` | Full doc inventory with classifications |
| `docs/ai_agent_workflow_rules.md` | Secret handling + no-commit-without-approval governance |
| `docs/archive/PROGRESS.md` / `docs/archive/DEEPSEEK.md` | Session history (archive — history, not proof) |

### Secrets — output & chat (clarifies §0; added after a token was pasted into a chat report)
- **NEVER paste, echo, or reproduce a secret VALUE in chat, task output, reports, tool results, or any
  message** — not even to "show what was found." This is the same prohibition as print/log: a value in a
  chat report is a leak. Reference secrets by NAME only (e.g. "the Tinybird prod read token",
  "TINYBIRD_READ_ENABLED"), never the value.
- This covers passing a secret as a URL/query param whose value then appears in output, and pasting the
  result of any token/credential command.
- **Commands that dump secrets** (`railway variables`, `printenv`, `env`, `cat .env*`, `tb token ls`, etc.):
  do NOT paste raw output. Extract ONLY the specific non-secret name/boolean asked for
  (e.g. `railway variables -s X | grep -o 'TINYBIRD_READ_ENABLED=[a-z]*'`). Never the full dump.
- **Safe to report:** flag booleans (true/false), pipe/table/column names, row counts, HTTP statuses,
  deploy IDs, commit SHAs. **Never safe:** any key, token, JWT, password, connection string, `.env` line,
  or `site_key` value.
- If a task cannot proceed without exposing a secret value, **STOP and report "blocked: would expose a
  secret"** — exposing it is never the answer.
