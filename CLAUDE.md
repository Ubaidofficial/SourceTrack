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
- **New PII store ⇒ all THREE GDPR paths, same PR.** Any PR that creates or adds a PII-bearing column/table MUST cover it in **all three** paths in the **same PR**: `/gdpr/visitor` (Art. 17 erasure), `/gdpr/subject` (Art. 15 access), **and** `/gdpr/account` (workspace/account deletion — the higher-volume real-world purge). A PII store outside any of these is a compliance defect, not a follow-up. **Reviewer checklist: new PII table → is it in all three GDPR paths?**
  - **`/gdpr/account` coverage** is satisfiable by **either** a documented `site_id → sites(id) ON DELETE CASCADE` FK (the mechanism `lead_qualifications` / `site_identity_links` / `subscription_identity` use) **or** an explicit delete in the handler (the mechanism `attributed_conversions` uses) — but it MUST be **one** of them, and the PR MUST **state which**. Don't use both: two overlapping mechanisms diverge over time. `volunteered_identity` shipped with neither and orphaned real emails on account deletion (fixed by FK cascade in #376; the #372 rule caught `/visitor`+`/subject` but hadn't named `/account`).
  - Match on the key the rows **actually** use, not the one the column is named after. `lead_qualifications.visitor_id` and `subscription_identity.anonymous_id` both hold a `distinct_id`; erasure matched `anonymous_id` and therefore matched **zero rows** while answering *"has been erased"* (fixed in #371, logged as a KI in #370).
  - **An erasure that deletes nothing must never report success.** Count rows affected (`{ count: 'exact' }`) and let the count — never a status enum — decide what the response may claim. The false-success response is what hid two whole tables sitting outside erasure for months.
  - Art. 15 access must disclose **exactly** what Art. 17 erasure removes. If the two lists ever diverge, one of them is lying.

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
3. session-doc (`*.md`) diff — **must be empty**, with exactly ONE named exception: **`FEATURE_MAP.md`**, and only when the same PR changes `api/routes/**` or `dashboard/src/pages/**`. Every other `*.md` stays forbidden.

   > ⚠️ **PROPOSED, NOT YET RULED — this carve-out needs founder go-ahead (see §9's own "propose but do not unilaterally change behavioural rules").**
   >
   > **Why a carve-out and not a relaxation.** `FEATURE_MAP.md`'s freshness guard rule (2) says *"CC must update this file in the SAME PR"*. Rule 3 forbids exactly that, because `FEATURE_MAP.md` is a `*.md` file. It is a **direct contradiction, not a race**: a PR obeying one violates the other, so the map lost every time — **92 PRs (#466 → #664) against one update**, recorded in that file's own header. Re-baselining does not fix it; the header says so twice.
   >
   > **Why only this file.** The empty-session-doc rule exists to stop handoff/session prose riding along with code, where it is never reviewed as content. `FEATURE_MAP.md` is the one `*.md` whose *correctness depends on shipping in the same commit as the code it describes* — updating it later is precisely the failure being fixed. Widening the exception to `*.md` generally would restore the problem rule 3 was written for.
   >
   > **`KNOWN_ISSUES.md` is deliberately NOT included.** It has the same shape but not the same problem: it ships as the **sole** `.md` of its own `docs(known-issues)` PR — #678, #679, #683, #685 are all exactly that — so it is the PR's *deliverable*, which rule 3 already permits, rather than a side-effect riding a feature PR. It needs no exception, and granting one would weaken rule 3 for no gain. Revisit only if a KNOWN_ISSUES entry ever genuinely must land inside a code PR.
4. `git log --oneline`
5. `git diff --check` (no whitespace/marker errors)
6. `node --check` on changed JS (JSX validated by the dashboard CI build)
7. `git rev-parse HEAD`

Plus:
- **CI green on the EXACT head SHA** (not "a" green run — that SHA's run).
- `mergeable_state` **CLEAN** before merge. If `UNKNOWN`, wait for it to resolve — never merge on UNKNOWN.
- **CC does NOT merge.** The human merges. CC stops at "PR up, CI green, bundle delivered."
- After a squash-merge, dependent branches must be **rebased onto the new `main`** with fresh CI before merging.
- **Editing this file:** agents may correct **factual** statements in CLAUDE.md when they have evidence (e.g. a URL/route that no longer matches what ships). Agents **propose but do not unilaterally change behavioural rules** — a rule change needs explicit human go-ahead. The distinction is what keeps a factual fix safe.

---

## 10. Verification Principles

- **Design doc = intent, not current state.** The design spec (`docs/design/design.md`) and any roadmap describe what's *meant* to exist. Verify against the **fetched remote ref** (`git fetch`; `git show origin/main:<file>` / `git grep` on the fetched ref) — local working-tree reads can be stale.
- **Only GREEN, prod-verified, with-real-data is "done"** or marketable. Test/QA/seed data ≠ proof. Cross-reference site IDs against known test/seed sites before concluding real-customer impact.
- **Blast-radius first** for any attribution-semantics change: verify the real data path and who's affected on prod before greenlighting.
- **Real-env only:** verify on staging/prod URLs — **never localhost.** A localhost pass proves nothing about production.
- **"Is it real?" checks pull identifying rows, not just aggregate counts.** A count can look healthy while every underlying row is test/seed data (e.g. "68 members" that were 59 orphans). For real-vs-test questions, select the rows and inspect them.
- **Verify every "handled elsewhere / handled by X" claim against the actual data path.** Design docs describe *intended* architecture; these assumptions have been proven wrong repeatedly. Trace the real code path before trusting "it's covered."
- **Greps miss non-import references — before calling any file/table "dead" or "orphaned", check the three classes an import/usage grep cannot see:**
  1. **Hardcoded file manifests.** `scripts/qa-static-launch-check.mjs` lists backend files by path in its own arrays; deleting `ai-analytics.js` reddened CI (#315) because it was still named there. For any file deletion, grep the basename as a **plain STRING repo-wide** (manifests, configs, CI yml, Dockerfiles) — not just imports/routes.
  2. **Postgres triggers/functions.** `disposable_email_domains` + `paas_subdomain_blocklist` looked orphaned in JS but are read by the live trigger `enforce_free_tier_abuse_guards ON sites` — free-tier abuse prevention is **server-enforced at the DB layer** (the JS `abuse-guards.js` is vestigial). Before dropping a table, check `pg_trigger`/`pg_proc`, not just JS.
  3. **Title/route maps keyed by a path STRING.** `dashboard/src/components/Layout.jsx`'s `PAGE_TITLES` maps route paths to titles; a deleted page leaves a stale key an import grep never finds. Grep the path string too.
- Demand raw `git diff` + CI green before accepting any "done."

---

## 11. Project-Specific Code Rules

- **ESM only** — `import`/`export`, never `require()`.
- **Supabase client:** use `getSupabase()` from `api/lib/supabase.js` only — never call `createClient()` directly in routes. Every `createClient()` must use `{ realtime: { transport: WebSocket } }`.
- **Jobs:** `dotenv.config()` must be the **first line** in all job/cron files.
- **Tracker URL:** the shipped embed snippet (Onboarding + all Solution/Docs pages) is the **root alias** `/tracker.min.js` (and `/tracker.cookieless.min.js`) — that is the canonical customer-facing URL. `/tracker/tracker.min.js` also serves the same file (`express.static`), and both forms now count GPC/DNT suppression. Never `/tracker/loader.min.js`.
- **Tinybird pipe SQL** (`tinybird/pipes/*.pipe`, ClickHouse; founder-gated deploys, `tb --cloud deploy --check` is the mandatory pre-deploy gate): parameterize with pipe template params — `site_id` is a required param, never raw `${variable}` interpolation. `{{DateTime(p, required=True)}}` takes **no** `toDateTime()` wrapper; optional dates default `{{DateTime(p,'1970-01-01 00:00:00')}}`; timezones `{{String(tz,'UTC')}}` (never `required=True` — breaks `toTimeZone()` under `--check`); array params as repeated query keys. ClickHouse idioms still apply: `toFloatOrZero` never `toFloat64OrZero`, prefer `countIf(...)` over `COUNT(CASE WHEN ...)`. `JSONExtractString` returns `''` not `NULL` — wrap `nullIf(...,'')` where NULL semantics matter.
- **Channel classifier:** `ORGANIC_SEARCH_ENGINE_HOSTS` / `ORGANIC_SEARCH_SOURCES` are the single exported source of truth, shared between the Tinybird pipe SQL (e.g. `seo_revenue_landing_pages.pipe`) and `channelFromEvent`. Don't fork or duplicate this logic.
- **Attribution accuracy > speed** — verify the math before committing. When in doubt about attribution logic, **read `nightly-attribution.js` and `attribution-engine.js` before changing anything.**

---

## 12. Scope Gates (V1 / V1.1 / V2)

- A **designed component is not a shipped feature.** Visibility is controlled by feature flags, data availability, integration status, and rollout scope.
- **V1** = build/ship now. **V1.1** = next milestone, locked/hidden in V1. **V2** = future, not in active V1 UI.
- Don't surface V1.1/V2 UI without a feature flag and explicit go-ahead.
- Honor the design spec's §26 prohibited-elements list (no command palette, no fake AI predictions, no fake revenue/cost/zeros, no rank tracker, no live map in V1, etc.).

**Authority order (when sources conflict):** `docs/design/design.md` **§0 (Scope Gate)** wins all scope conflicts → then this file. If two docs disagree on scope, the higher-authority doc wins; don't silently reconcile — surface the conflict.

> Until 2026-07-22 this order had three tiers above the design spec, each naming a file that **had never existed in this repo's history** (verified via `git log --all --diff-filter=A`) — so "defer to the higher-authority doc" silently fell through to this file every time. Those tiers were **dropped, not repointed to a guess.** Every tier above now names a file you can open; if you add one, verify it exists first.

---

## 13. Agent Roles (who does what)

- **Orchestrator (planning chat)** — plans, dispatches, verifies. Read-only MCP: **Supabase + Railway + Tinybird + GitHub**. Reviews SQL and hand-applies migrations on human go. Does not write code.
  - **PostHog MCP removed from this grant 2026-07-31.** It previously read *"Supabase + PostHog (PROD project 416017 only) + Railway + Tinybird + GitHub"*. Project 416017 is deleted, and §5's decommission is confirmed complete — a repo-wide audit found **zero** live PostHog call sites (no imports, no `queryPostHog`, no `posthog.capture`, no API hosts, no `process.env.POSTHOG_*` read outside test scaffolding), **zero** posthog packages in any `package.json` or lockfile across both repos, and **zero** `POSTHOG_*` variables in the live production Railway environment. There is nothing left to grant access to, so the line described access that could not be exercised. Do not re-add it: a PostHog MCP connection appearing in a client's tool list is not evidence the grant should return — the tooling outlived the system, which is exactly the gap this note records.
- **Claude Code (CC)** — executes: files, logic, DB-migration *files*. No Railway access, no browser. Subject to §0, §8, §9.
- **Browser E2E agent (Antigravity)** — visual verification only. Installed panel (screenshot-confirmed 2026-07-03): **chrome-devtools-mcp, posthog, railway, supabase — all enabled; stripe present but DISABLED; NO Tinybird MCP** (supersedes the earlier "may have Tinybird" note, which was incorrect). **No GitHub MCP entry visible** — prior git/`gh` work went through raw terminal + CLI, so "Antigravity has GitHub MCP" is a possible mischaracterization of CLI access; recorded as **UNCONFIRMED** (do not assert either direction). Read-only MCP only — no DB writes, no secret access (post-incident lockdown). If blocked on login, it stops and reports; it never works around auth.
- **Two orchestrator MCP constraints** (each invalidates a whole class of check — agent output must be independently corroborated): (1) **Tinybird MCP is ST_Staging ONLY** — prod events are unreachable from the orchestrator. (2) **Railway MCP reads variable NAMES, never VALUES** — the orchestrator *can* list which variables exist in a live environment (that is how "zero `POSTHOG_*` variables in production" was confirmed), but the tool blocks value reads by design. So **presence/absence is orchestrator-verifiable; contents are not**: whether `TINYBIRD_READ_ENABLED` is *set* can be checked from the MCP, whether it is `true` or `false` cannot — that, and values like `ENCRYPTION_KEY` / `SLACK_WEBHOOK_URL`, still require the founder (Railway UI or CLI). A code-only audit still misses live env state; a name-level MCP check narrows that gap without closing it.
  - **Corrected 2026-07-31 — a former THIRD constraint was factually wrong and is deleted, not reworded.** It read: *"GitHub MCP authenticates as `Ubaidofficial` but returns 404 on the private `SourceTrack` repo — PR contents, diffs, and file lists are NOT orchestrator-verifiable."* The repo is **public**, not private (`gh api repos/Ubaidofficial/SourceTrack` → `visibility=public`, `private=false`; `Ubaidofficial/sourcetrack-shpfy-app` is public too), and GitHub access has worked throughout. PR contents, diffs and file lists **are** orchestrator-verifiable. Do not re-add the "route every PR check through the founder's terminal or CC" workaround for a 404 that does not occur — verifying a PR directly is now the cheaper and more reliable path.
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
