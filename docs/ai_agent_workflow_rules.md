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
1. **138E** — Codify no-commit-before-review AI-agent workflow (This Session)
2. **138F** — Add release/deploy checklist gate
3. **139A** — Staging schema bootstrap / safe schema setup
4. **139B** — Staging observability / exception monitoring
5. **139C** — Stripe test catalog correction + Stripe E2E on staging only

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
