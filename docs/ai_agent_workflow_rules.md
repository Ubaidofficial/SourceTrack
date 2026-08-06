# AI-Agent Workflow Rules

## Purpose
This document establishes a permanent, canonical system of operating rules for all AI agents (including Claude, Gemini, DeepSeek, and others) working on the SourceTrack / TrackIQ repository. The goal is to prevent accidental commits, unauthorized production mutations, reliance on summaries rather than raw evidence, scope creep, and untested deployments.

---

## Non-negotiable rules
1. **No-Commit-Before-Review**: AI agents must never commit or push code automatically. All changes must be reviewed and explicitly approved by the user first.
2. **No Summary-Only Approval**: AI agents must present raw `git status`, `git diff --stat`, and actual file diffs before asking for commit approval.
3. **Production Safety**: Never point a local development server at production, use production secrets, or run mutating commands/QA against the production database.
4. **Brutal Verification**: AI agents must never trust previous AI summaries. Verify all assumptions against actual code, migrations, package scripts, and database state.
5. **Scope Boundary**: AI agents must strictly focus on the active session's scope and never mix unrelated features or refactors.

---

## Session lifecycle
Every AI-agent session must strictly follow this sequence:
1. **Verify Repo State**: Run git and environment status checks to assert a clean baseline.
2. **Verify Latest Commit and CI State**: Confirm the latest commit matches the expected handoff and that the CI pipeline is green.
3. **Audit Before Modifying**: Inspect the raw files, code, and documentation relevant to the task before proposing changes.
4. **Scope Control**: Make only the minimal, surgical changes required by the active session.
5. **Run Validation**: Run all required local verification scripts, build steps, and syntax checks.
6. **Show Evidence**: Present the raw `git status`, `git diff --stat`, `git diff --check`, relevant raw diffs, and validation command outputs to the user.
7. **Request Approval**: Stop execution and ask for explicit user approval to commit.
8. **Commit and Push**: Only after receiving explicit approval, commit and push using the standard HEREDOC commit format.
9. **Wait for CI**: Ensure the CI run is green before initiating any subsequent sessions.

---

## No-commit-before-review protocol
AI agents are strictly prohibited from committing code automatically after implementation.
When the work is complete and validated, the agent must stop and output:
```txt
Please review. I will not commit until explicitly approved.
```
Committing is allowed ONLY after the user explicitly provides approval in the chat (e.g., "approved to commit", "commit and push", "yes commit", "go ahead and commit").

---

## Raw-diff-before-approval protocol
AI agents must not request approval based on a summary alone. Before requesting approval, the agent must display:
1. The output of `git status --short`.
2. The output of `git diff --stat`.
3. The output of `git diff --check` (ensuring no whitespace or syntax check issues).
4. The raw line-by-line diff of all changed code files:
   ```bash
   git diff -- <changed-files>
   ```

---

## Validation requirements
Before claiming a session is ready for review, the agent must successfully run and report the output of:
- Node syntax checks on all modified backend/script files:
  ```bash
  node --check api/bootstrap.js api/index.js api/routes/*.js api/lib/*.js scripts/*.js
  node --check scripts/*.mjs
  ```
- Static environment safety tests:
  ```bash
  npm run qa:env-safety
  ```
- Static quality checks:
  ```bash
  npm run qa:static
  ```
- Git diff checks:
  ```bash
  git diff --check
  ```
- Dashboard production compilation (if frontend files were modified):
  ```bash
  cd dashboard && npm run build && cd ..
  ```

### ⚠️ Install before baselining. A fresh worktree has no `node_modules`

`git worktree add` copies **tracked files only** — installs do not come with it. Run `npm ci` at the
root of the worktree (and in `dashboard/` or `marketing/` if you will touch them) **before** running
or baselining anything.

The failure mode is not a clear error. Mass import failures **reproduce on clean `main` too**, so
baselining "confirms" the failures are not yours and the whole run reads as pre-existing breakage in
the code. 147 unit-test failures were once recorded as hidden breakage surviving green CI on exactly
this basis. The cause was a worktree with no root `node_modules`.

### ⚠️ Baselining proves a failure is not yours. It says nothing about what it is

Stashing your change and re-running against `main` is the right method, and it answers **exactly
one** question: *did I cause this?*

**"Not caused by my change" and "pre-existing defect" are different claims, and only the first has
evidence behind it.** A failure that reproduces on clean `main` still needs a cause before it can be
reported as a finding — otherwise you file an environment as a defect.

### ⚠️ A grep that finds nothing has TWO explanations. "Absent" is only one of them

The other is that you searched for the wrong string. **Before reporting a citation as unresolvable,
a file as dead, or a claim as unsupported, search a second way** — different quoting, a different
character, a substring of the symbol, or the identifier's plain-text form.

Both of these were real, correctly cited, and nearly reported as missing:

| Searched | Returned zero because | Truth |
|---|---|---|
| `-0.03em` in `docs/design/design.md` | the doc uses a **Unicode minus `U+2212`**, not an ASCII hyphen | the spec is at `:312` |
| `pv_limit integer DEFAULT` in the baseline migration | the column is **quoted** in the DDL — `"pv_limit"` | it is at `:900`, exactly as cited |

Same class as reading a `getaddrinfo NXDOMAIN` as "the service is down". **Report the miss, not the
conclusion** — say which search you ran and that it returned nothing, rather than asserting absence.

(For the three *non-import* reference classes a usage grep cannot see at all — hardcoded file
manifests, Postgres triggers/functions, and path-string route/title maps — see `CLAUDE.md` §10.)

### Verify a branch base by CONTENT, not `merge-base`

After a squash-merge, `merge-base` no longer identifies the true base. Check for a marker the base
commit introduced (a class name, a constant, a file) and confirm it is present in the worktree.

---

## Production safety protocol
To prevent accidental mutation of the production environment, the following rules are strictly enforced:
- **Forbidden Environment Overrides**: AI agents must NEVER set or use:
  - `ALLOW_PRODUCTION_QA_MUTATION=true`
  - `ALLOW_PRODUCTION_LOAD_TEST=true`
  - `ALLOW_PRODUCTION_SUPABASE_IN_NON_PROD=true`
- **Secrets and Keys**:
  - Never use production secrets in local development or test runs.
  - Never print secrets, keys, or raw connection strings to standard output or log files.
  - Never commit `.env`, `.env.local`, `.env.staging`, or any other configuration files containing active secrets to version control.
- **Forbidden Actions**:
  - Do not run production mutations or database writes from local workstations.
  - Do not run load tests against production targets.
  - Do not run restore or Point-in-Time Recovery (PITR) rehearsals against production databases.
  - Do not run database migrations against production without staging rehearsal and explicit user approval.
  - Do not touch or modify Railway production environment variables.

---

## Secret Handling Rules
To ensure strict security hygiene and prevent any credentials leak in transcripts, code, or logs:
- **No pasting secrets**: Never paste secrets (API keys, service keys, tokens, etc.) into ChatGPT, Antigravity, Claude, Gemini, terminal transcripts, docs, or screenshots.
- **No inline env secret commands**: Never run inline env secret commands (e.g., `SUPABASE_SERVICE_KEY=sb_secret_... node ...`).
- **Use managed env injection**: Use Railway/Supabase dashboards or managed env injection (e.g., `railway run --service <service> <command>`).
- **Immediate rotation on exposure**: If a secret appears in any command output, log, or transcript, treat it as compromised immediately and rotate it.
- **Verify with managed variables**: After key rotation, verify database connectivity and health using managed environment variables only.
- **Value masking in reports**: Reports must state "rotated and verified" without showing any secret values, prefixes, or suffixes.
- **No reuse of exposed keys**: Old exposed keys must never be reused for testing.

---

## Provider/MCP protocol
For all cloud and service providers (Supabase, Stripe, Railway, PostHog, Resend, Google, GitHub, etc.):
1. **Read-Only by Default**: Read-only inspection of provider resources is allowed when necessary.
2. **Paid Actions Restricted**: Any action that incurs financial costs requires explicit user cost/risk display and approval.
3. **No Production Mutation**: Modifying production resources via MCP tools is strictly forbidden without explicit user approval for one specific operator action.
4. **Secrets Protection**: Do not retrieve or print service role keys or private secrets.
5. **No Data Copying**: Never copy production customer data to staging or local environments.
6. **No Casual Config Changes**: Provider configurations must not be altered casually.

---

## Scope-control rules
AI agents must strictly control the scope of each session. Unrelated tasks must never be mixed.
- **Do not mix** database schema bootstraps or migrations into safety or workflow hardening sessions.
- **Do not mix** Stripe E2E testing into staging setup sessions.
- **Do not mix** product feature development into operational safety sessions.
- **Do not add** third-party PR-review tooling (like Kodus or GitHub apps) during workflow-rules sessions.
- If adjacent code or configuration is found to be broken or stale, document it as a finding or blocker in the session report. Do not attempt to fix it silently.

---

## Forbidden actions
The following actions are strictly prohibited in all circumstances:
- Committing code before user review.
- Pushing to `main` without explicit user review, approved commit, local validation, and then waiting for CI green after push.
- Setting overrides to run destructive/mutating operations on production.
- Printing active API keys, secrets, database passwords, or auth tokens.
- Adding new dependencies without a security and dependency review.
- Changing provider setup or keys without prior approval.
- Third-party review tools such as Kodus, GitHub apps, or AI PR reviewers may be evaluated later as optional review layers, but they cannot replace these workflow rules, raw-diff review, explicit user approval, or CI gates.

---

## Current SourceTrack session order
Every session maps back to the authoritative roadmap defined in `docs/development_workflow_master_plan.md`. The current ordering of Phase 0 and Phase 1 sessions is:
1. **138E** — Codify no-commit-before-review AI-agent workflow (Completed)
2. **139G** — Release Checklist Gate + Paid-Beta Operational Readiness Alignment (Completed)
3. **139H** — Production Supabase Backup/PITR Review + Staging Restore Drill Plan (Completed)
4. **139I** — Staging Schema Bootstrap / Safe Schema Setup (Completed planning/audit)
5. **139I-B** — Recover Base Schema Source of Truth (Completed)
6. **139I-C** — Staging Schema Bootstrap Execution (Open)
7. **139J** — Stripe Test Catalog Correction + Stripe E2E on Staging Only (Open)
8. **139K** — Verify Production Env/Secrets, IP Resolver Mode, CORS, Tracker/API URLs (Completed)
9. **139L** — Confirm beta Terms/Privacy disclosure flow before payment (Open)
10. **139M-0** — QA Inventory + Browser Test Harness (Completed)
11. **139M-1** — Public Site, Docs, Pricing, Signup Truthfulness QA (Completed)
12. **139M-2** — Core Analytics + Dashboard Feature QA (Open)
13. **139M-3** — Attribution + Revenue Attribution + AI Attribution QA (Open)
14. **139M-4** — Report Builder + Saved Reports + Export QA (Open)
15. **139M-5** — Campaigns, Paid Acquisition, Costs, GSC/SEO Revenue QA (Open)
16. **139M-6** — Journey, Sessions, Funnels QA (Open)
17. **139M-7** — Setup Doctor, Snippet, Integrations, Billing, Team/API Tokens QA (Open)
18. **139M-8** — Final Human-Like Marketer Regression + 2026 UI/UX Verdict (Open)
19. **139N-0** — Plurio Intake Tracker Parity Audit (Completed)
20. **139N-2** — Attribution Model Deterministic Test Fixtures (Completed)

*Note: Do not reorder or alter this roadmap without explicit user approval.*

---

## Final report requirements
At the end of every session, the agent must output a structured final report containing exactly the following sections:
1. **Files changed**: Clickable markdown links to modified files.
2. **Canonical workflow rules file**: References to this file.
3. **Where short pointers were added**: List of modified control files containing links to this document.
4. **Whether any app code changed**: Explicit confirmation (e.g., "No application code or behavior was modified").
5. **Validation results**: Summary of syntax, static QA, and build commands executed.
6. **Secret check results**: Evidence that no secrets were exposed or committed.
7. **Production safety confirmation**: Affirmation that no production resources were mutated.
8. **Remaining blockers**: Current unresolved roadmap or technical blockers.
9. **Recommended next session**: The next session from the roadmap.
