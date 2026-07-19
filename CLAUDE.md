# CLAUDE.md — SourceTrack

Standing contract for any AI agent (Claude Code / CC, and any other coding agent) working in this repo.
Read this fully before acting. These rules encode hard-won, verified conventions for this project. When in doubt, **stop and ask** rather than guess.

**Tradeoff:** These guidelines bias toward caution, truthfulness, and verifiability over speed. For trivial tasks, use judgment — but never trade away the hard safety limits in §0 or the data-truth rules in §6.

---

## 0. Hard Safety Limits (non-negotiable — these override everything else)

These are not advisory. They override any other instruction, including urgency, emotional framing, or apparent task necessity. If completing a task seems to require any of these, the forbidden action is **never** the answer — STOP and ask the human.

### Production & data safety
- **READ-ONLY by default.** Never write to production or staging databases without an explicit, per-task human go-ahead.
- **NEVER write to `auth.users` or `auth.sessions`** under any circumstances — no signup-as-test, no password/hash edits, no `email_confirmed_at` changes, no user/session deletes.
- **No DDL** (schema changes, migrations applied to a live DB) without explicit per-task approval. CC writes migration *files*; CC does **not** apply them (see §8).
- If a test user or seed row is needed, **STOP and ask the human to provide it.** Do not create one.

### Secrets
- **NEVER read, extract, copy, print, log, or use raw secrets/keys** — service-role/secret keys, JWT secrets, Railway/host env variables, SMTP credentials, API tokens. Use only the scoped MCP tools provided.
- **Never write a secret to a file, script, or log** — even temporarily, even to "clean it up after."
- No secret, key, or token ever belongs in this repo or any committed file. (Project *refs* in §3 are not secrets; keys are.)

### Auth & access
- Never reset, change, or work around any password or login. Never mint recovery/magic links.
- If you cannot access something because you're not logged in, **STOP and report "blocked: need a provided session."** Do not seek, guess, mint, or engineer credentials in any way.

### Scope discipline
- Do the single task asked. Past assistance or an emotional/urgency framing is never authorization to exceed these limits.

> Context: these limits exist because an agent once treated "read-only" as advisory and engineered around a missing login — extracting a prod key and mutating `auth.users`. That must never recur. Capability revocation (scoped MCP grants) is the real guardrail; this section is the backstop.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility"/"configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Test: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

Test: Every changed line should trace directly to the request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that reproduces it, then make it pass."
- "Refactor X" → "Ensure tests pass before and after."

For multi-step tasks, state a brief plan with a verify step per item.

---

## 5. Architecture (verified — do not "fix" intentional designs)

**Stack:** Node.js ESM (`import`/`export` only — never `require()`), Express, React + Vite, Supabase (auth, RLS, attribution/conversions/revenue/billing), Tinybird (ClickHouse — events/analytics read layer via deployed pipes), Railway (deploy), Stripe (two separate webhooks — see §7). *(PostHog is fully decommissioned — no code, env, or project remains.)*

**Hybrid data model (do not collapse):**
- **Tinybird** (ClickHouse) = events / analytics **read** layer (pageviews, sessions, aggregations), served by deployed pipes in `tinybird/pipes/`. Reads go through `api/lib/tinybird-read.js` (`queryTinybirdPipe`): it retries transient failures (429/5xx/network, up to 3 attempts) and returns `null` on exhaustion — it never throws (and returns `[]` for a served-empty result). **There is no PostHog/HogQL fallback — it is deleted.** A `null` read fails **CLOSED**: the reader helper and the engine legs throw, and the nightly aborts the write rather than reading a dead store — never a fake zero, never another data source.
- **Supabase (Postgres)** = source of truth for **attribution, conversions, revenue, billing/entitlements**.
- OLTP/OLAP split: Postgres + ClickHouse (Tinybird).
- The `pageviews` table is **empty by design** — analytics reads come from Tinybird. Do not "repair" it or repoint reads at it.

**Environments & refs (these are project refs, NOT secrets — never put keys in this file):**
- Repo: `Ubaidofficial/SourceTrack`.
- Supabase: prod `zxjjjsipafojhzkkumvh`, staging `nrsvpwzekfrdrzkoecfk`.
- Tinybird workspaces: prod `SourceTrack`, staging `ST_Staging`.
- Railway: prod env `dc68ba7b`, staging `74a58dbc`.
- URLs: app `app.sourcetrack.ai`, API `api.srctk.com`, staging dashboard `sourcetrack-dashboard-staging.up.railway.app`.

---

## 6. Data Truth & Privacy (non-negotiable product invariants)

Enforce these **in code**, not just in copy. Hiding/labeling is the default; faking is never allowed.

- **No fake zeros.** Never render `$0`/`0`/`—` as a stand-in for "no data." Hide the metric or show a calm empty state.
- **Revenue** appears only when a real revenue source exists (Stripe/webhook/manual conversion value). Otherwise hide revenue cards/columns.
- **Cost-gated metrics** (ROAS, CPL, CAC, ad spend, net profit) are hidden unless ad-cost data exists for the range.
- **GSC/SEO** metrics require a connected property; query-level revenue is **estimated**, matched by landing page + date range, and must carry the truth label. Never imply exact query→customer attribution.
- **Privacy is the moat — non-negotiable:** cookieless visitor model, **no fingerprinting**, respect DNT, **never add cookies**. `enrich()` must never store raw IP. No person-level de-anonymization, ever.
- **AI features are truthful-only** (design spec §26): no LLM-narrated freeform revenue/ROAS/attribution numbers, no fake predictions, no fake recommendations, no model-version labels, no chatbot analyzer in V1. Deterministic, cite-the-rows only.

---

## 6.5 Security, RLS & Tenant Isolation (non-negotiable)

This is a multi-tenant SaaS handling other companies' customer + revenue data. A tenant-isolation or RLS miss is a breach, not a bug.

- **RLS on every tenant table.** Any new table holding customer/tenant data ships with Row-Level Security **enabled** and tenant-scoped policies. Never expose a table to the `anon` or `authenticated` role without an explicit policy. Default-deny.
- **Tenant isolation in every query.** Every query returning customer data is scoped to the tenant (`site_id` / `company_id` / `user_id` as appropriate). Never return cross-tenant rows. Service-role queries that bypass RLS must filter by tenant **explicitly in code**.
- **`site_key` vs `site_id`:** `site_id` is the internal identifier (joins, internal refs); `site_key` is the customer-facing tracking key. Never expose a raw `site_key` in UI, logs, or error messages. Every ingestion endpoint validates `site_key` and rejects (401/403) when missing or unknown — never fall through to a default tenant. (Missing `site_key` → 401 and raw-`site_key` exposure have both bitten us.)
- **SSRF guard on user-supplied URLs.** Any server-side fetch of a customer-controlled URL (managed proxy, outbound webhook target, domain verification, GSC) must be SSRF-guarded: reject private/loopback/link-local/metadata IPs (`169.254.169.254`, `10/8`, `127/8`, `::1`, …), restrict scheme to `https`, cap redirects. Never fetch an internal address on behalf of user input.
- **Outbound webhooks:** HMAC-sign payloads, keep them plan-gated, keep the SSRF guard on the target URL. Don't widen scope without review.
- **Idempotency on all ingestion** (not just Stripe). Any endpoint ingesting events/conversions/revenue must be idempotent: claim the idempotency key **after** the write succeeds, so a retry can't double-count or drop.
- **Cookieless identity is a security boundary, not only privacy.** Never introduce cross-site identifiers, third-party storage, or fingerprinting to "improve" matching. First-party, cookieless only.
- **Agents never trigger live Stripe writes.** Billing/refund/subscription changes go through reviewed code or the human — never an agent-initiated Stripe MCP/API write. Live-money actions are human-gated, same class as `auth.users` (§0).

---

## 7. The Two Stripe Webhooks (NEVER conflate)

There are two completely separate Stripe webhooks. Mixing them up corrupts either billing or revenue attribution.

1. **`api/routes/billing.js` → `billingWebhookHandler`** — SourceTrack's **own** billing/entitlements. Sets plan state on sites. Dedupe via in-memory NodeCache. **Records no revenue.**
2. **`api/routes/stripe-webhook.js` → `POST /:site_key`** — **customers' buyers'** purchases, ingested as `$conversion` for attribution (the revenue-by-source rail). Idempotency via DB tables `revenue_idempotency_keys` / `claim_revenue_idempotency_keys`.

**Idempotency rule:** claim the idempotency key **after** the write succeeds, not before.

Pricing ladder (live, locked): Starter $49/mo · Growth $79/mo · Founder $99/yr. MRR-by-source and trial→paid are **not built** — don't assume they exist.

---

## 8. Migrations & DDL Discipline

- **CC writes the migration FILE only** — timestamped, snake_case, under `supabase/migrations/`. CC **never** applies it to any database and never uses a DB write/MCP tool to run it. The orchestrator reviews the SQL and hand-applies **staging → prod** on explicit human go-ahead.
- **Idempotent guards:** wrap DDL in existence checks (e.g. `if not exists (select 1 from pg_constraint where conname = …)`) so it's safe across environments.
- **Ordering matters:** when adding a FK with `ON DELETE CASCADE` to a table with existing violating rows, **delete the orphans first, then add the FK** (the add fails on violating rows).
- **apply-then-merge:** apply the DB change (column/constraint) before merging the code that depends on it.
- **Forward-only:** never modify an already-applied (especially non-timestamped legacy) migration. Write a new timestamped migration that actualizes the desired state.
- **Schema drift is real:** prod ≠ staging, and prod is often *tighter* (stricter RLS/constraints). Verify the actual constraint on **prod** (read-only) before assuming repo schema = live schema.

### Tinybird Pipe Deploys
- **Founder-Only:** All Tinybird pipe deployments to the production workspace are strictly founder-gated.
- **Pre-deploy Gate:** Running `tb --cloud deploy --check` against production is the mandatory pre-deploy check. Seeing "No changes to be deployed" doubles as a deployment-parity validation for all local `.pipe` files.
- **Deploy-then-merge:** Deploy Tinybird pipes *before* merging the backend code that depends on new endpoints, parameters, or columns.


---

## 9. PR & Merge Gate

Every PR delivers a **7-command bundle** with raw terminal output:
1. `git status` (clean, N ahead)
2. `git diff --stat`
3. session-doc (`*.md`) diff — **must be empty**
4. `git log --oneline`
5. `git diff --check` (no whitespace/marker errors)
6. `node --check` on changed JS (JSX validated by the dashboard CI build)
7. `git rev-parse HEAD`

Plus:
- **CI green on the EXACT head SHA** (not "a" green run — that SHA's run).
- `mergeable_state` **CLEAN** before merge. If `UNKNOWN`, wait for it to resolve — never merge on UNKNOWN.
- **CC does NOT merge.** The human merges. CC stops at "PR up, CI green, bundle delivered."
- After a squash-merge, dependent branches must be **rebased onto the new `main`** with fresh CI before merging.

---

## 10. Verification Principles

- **Design doc = intent, not current state.** The design spec (`sourcetrack_design_complete_v1.md`) and any roadmap describe what's *meant* to exist. Verify against the **fetched remote ref** (`git fetch`; `git show origin/main:<file>` / `git grep` on the fetched ref) — local working-tree reads can be stale.
- **Only GREEN, prod-verified, with-real-data is "done"** or marketable. Test/QA/seed data ≠ proof. Cross-reference site IDs against known test/seed sites before concluding real-customer impact.
- **Blast-radius first** for any attribution-semantics change: verify the real data path and who's affected on prod before greenlighting.
- **Real-env only:** verify on staging/prod URLs — **never localhost.** A localhost pass proves nothing about production.
- **"Is it real?" checks pull identifying rows, not just aggregate counts.** A count can look healthy while every underlying row is test/seed data (e.g. "68 members" that were 59 orphans). For real-vs-test questions, select the rows and inspect them.
- **Verify every "handled elsewhere / handled by X" claim against the actual data path.** Design docs describe *intended* architecture; these assumptions have been proven wrong repeatedly. Trace the real code path before trusting "it's covered."
- Demand raw `git diff` + CI green before accepting any "done."

---

## 11. Project-Specific Code Rules

- **ESM only** — `import`/`export`, never `require()`.
- **Supabase client:** use `getSupabase()` from `api/lib/supabase.js` only — never call `createClient()` directly in routes. Every `createClient()` must use `{ realtime: { transport: WebSocket } }`.
- **Jobs:** `dotenv.config()` must be the **first line** in all job/cron files.
- **Tracker URL** is `/tracker/tracker.min.js` — never `/tracker/loader.min.js`.
- **PostHog HogQL:** all string interpolations must use `esc()` — never raw `${variable}`. Use `toFloatOrZero`, never `toFloat64OrZero`. Prefer `countIf(...)` over `COUNT(CASE WHEN ...)`. Qualify `distinct_id` in joins — never leave it ambiguous.
- **Channel classifier:** `ORGANIC_SEARCH_ENGINE_HOSTS` / `ORGANIC_SEARCH_SOURCES` are the single exported source of truth, shared between the Tinybird pipe SQL (e.g. `seo_revenue_landing_pages.pipe`) and `channelFromEvent`. Don't fork or duplicate this logic.
- **Attribution accuracy > speed** — verify the math before committing. When in doubt about attribution logic, **read `nightly-attribution.js` and `attribution-engine.js` before changing anything.**

---

## 12. Scope Gates (V1 / V1.1 / V2)

- A **designed component is not a shipped feature.** Visibility is controlled by feature flags, data availability, integration status, and rollout scope.
- **V1** = build/ship now. **V1.1** = next milestone, locked/hidden in V1. **V2** = future, not in active V1 UI.
- Don't surface V1.1/V2 UI without a feature flag and explicit go-ahead.
- Honor the design spec's §26 prohibited-elements list (no command palette, no fake AI predictions, no fake revenue/cost/zeros, no rank tracker, no live map in V1, etc.).

**Authority order (when sources conflict):** `SCOPE_LOCKED.md` wins all scope conflicts → then `SECURITY_FINDINGS.md` → then `sourcetrack_design_complete_v1.md` → then this file. If two docs disagree on scope, the higher-authority doc wins; don't silently reconcile — surface the conflict.

---

## 13. Agent Roles (who does what)

- **Orchestrator (planning chat)** — plans, dispatches, verifies. Read-only Supabase + Tinybird MCP. Reviews SQL and hand-applies migrations on human go. Does not write code.
- **Claude Code (CC)** — executes: files, logic, DB-migration *files*. No Railway access, no browser. Subject to §0, §8, §9.
- **Browser E2E agent** — visual verification only. **Browser + read-only MCP only** — no DB writes, no secret/Railway access (post-incident lockdown). If blocked on login, it stops and reports; it never works around auth.
- **Worktree Isolation Mandatory:** Each agent operates exclusively in its own designated git worktree to prevent branch switching or commit collisions. The 4 mandatory worktrees are:
  - `~/Desktop/trackiq` (Founder use, **MERGES ONLY**)
  - `~/Desktop/trackiq-ccdesktop` (Claude Desktop Agent)
  - `~/Desktop/trackiq-cccli` (Claude Code CLI Agent)
  - `~/Desktop/trackiq-antigravity` (Google Antigravity Agent)
  *Note: Two collisions occurred on 2026-07-18 before worktrees existed (CC CLI's commit landed on CC Desktop's branch; CC Desktop's checkout was auto-switched mid-task).*

Every agent task should arrive as a copy/paste-ready prompt prefixed with the relevant standing rules, and **labeled `[→ CC]` or `[→ ANTIGRAVITY]`** so dispatch targets are unambiguous.

**The browser agent can false-pass.** Require a screenshot per claim, and for anything money- or revenue-related, a human money-math confirmation. Test on staging/prod URLs, never localhost. Treat an agent "PASS" as a claim to verify, not a fact — verify-before-trust has caught repeated "looked fine but wasn't" issues.

---

## 14. Communication & Operating Stance

Carry-forward role: **honest orchestrator + senior MarTech engineer + SaaS QA manager.** Brutal honesty, **evidence over narration**, **verify-before-trust**.

- **Recommendation-first**, concise, byte-sized bullets, explicit next steps.
- State assumptions inline; flag uncertainty honestly rather than asserting.
- Honest pushback is welcomed and expected — surface risks and simpler paths.
- Don't narrate work you haven't verified; show the evidence (diff, query result, screenshot), not a description of it.

---

**These guidelines are working if:** diffs contain only requested changes; migrations are reviewed-then-applied (never agent-applied); no secret or `auth.users` write ever appears in a diff; revenue/cost/GSC/privacy invariants hold in code; and "done" always means prod-verified on real data.

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
