# AGENTS.md

Context file for AI agents (GPT, Claude, DeepSeek, etc.) working on this repo.

## Quick Start

Read these in order before any coding session:

1. `RULES.md` — 10 coding behavior rules
2. `AGENT_BRIEF.md` — Product, stack, ports, commands
3. `PROJECT_CONTEXT_COMPACT.md` — Condensed overview
4. `SESSION_STATE.md` — Current session, branch, blockers
5. `SESSION_HANDOFF.md` — Last completed work, pending QA
6. `KNOWN_ISSUES.md` — Verified bugs/gaps only
7. `AI_SESSION_PLAN.md` — Upcoming session plan

Then use `DOCS_INDEX.md` to find task-specific docs.

## How to Use This Repo

### Before every session
- Read the 7 files above
- Check `SESSION_STATE.md` for current branch and blockers
- Check `MANUAL_QA_BACKLOG.md` for pending QA

### During every session
- Follow `RULES.md` (surgical changes, no scope creep, verify before claiming)
- Update `SESSION_STATE.md` when starting/ending work
- Log bugs found in `BUG_REVIEW_LOG.md`

### After every session
- Run: `node --check api/index.js api/routes/*.js api/lib/*.js`
- Run: `cd dashboard && npm run build`
- Run: `git diff --check`
- Update `SESSION_HANDOFF.md` with what was done and what remains
- Update `SESSION_LOG.md` with session summary
- Update `AI_SESSION_PLAN.md` to mark session status
- If tracker changed: `npm run build:tracker`

### Before committing
- All checks above must pass
- Manual QA must be performed if applicable (mark in MANUAL_QA_BACKLOG.md)
- Never commit `.env`, secrets, `.bak` files, or test artifacts
- Commit message must use the HEREDOC format from AGENT_BRIEF.md

## Project Rules

- **Surgical changes only.** Touch only what you must. Match existing style.
- **No scope creep.** If something adjacent is broken, surface it in session report — don't fix silently.
- **Verify, don't assume.** Code inspection is not runtime verification.
- **Treat PROGRESS.md and DEEPSEEK.md as history, not proof.**
- **Figma docs are design specs, not implementation proof.**
- **Do not overclaim.** Never claim Cometly/DataFast/Usermaven parity, paid ad features, or business dashboards unless verified in code + QA.

## Key Files

| File | Purpose |
|---|---|
| `RULES.md` | Coding behavior contract |
| `AGENT_BRIEF.md` | Stack, ports, commands, core rules |
| `PROJECT_CONTEXT_COMPACT.md` | Product/stack/design at a glance |
| `AI_SESSION_PLAN.md` | Upcoming session roadmap |
| `SESSION_STATE.md` | Current branch, blockers, active work |
| `SESSION_LOG.md` | Session history log |
| `SESSION_HANDOFF.md` | Last completed work + pending QA |
| `KNOWN_ISSUES.md` | Verified bugs and risks |
| `IMPLEMENTATION_GAP_LIST.md` | What's built vs what's planned |
| `MANUAL_QA_BACKLOG.md` | Per-session manual QA items |
| `BUG_REVIEW_LOG.md` | Code review issues found |
| `COMMANDCODE_RUNBOOK.md` | Standard procedures |
| `DOCS_INDEX.md` | Full doc inventory with classifications |
| `PROGRESS.md` | Session-by-session history (archive) |
| `DEEPSEEK.md` | DeepSeek session history (archive) |
