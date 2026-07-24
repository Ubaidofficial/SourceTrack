# Archived root docs — 2026-07-24

Seven markdown files moved here from the repo root on 2026-07-24 (`git mv`, history preserved). They were read as *current* by agents and humans but describe completed work or a decommissioned stack — undated/stale currency was causing wrong decisions. **These are kept for the record; do not treat them as current.** The live successors are `CLAUDE.md` (standing contract), `NEXT_SESSION_PROMPT.md` (session handoff), and `KNOWN_ISSUES.md`.

| File | Orig. path | Lines | Internal date range | What it covered | Why archived |
|---|---|---:|---|---|---|
| `SESSION_HANDOFF.md` | `/SESSION_HANDOFF.md` | 3415 | 2026-05-23 → 2026-07-20 | Rolling per-session "done + remaining / pending QA" narrative | **Session narrative** — completed work; superseded by `NEXT_SESSION_PROMPT.md` §0.5 |
| `SESSION_LOG.md` | `/SESSION_LOG.md` | 2516 | 2026-05-13 → 2026-07-19 | Chronological session history log | **Session narrative** — history; superseded by `NEXT_SESSION_PROMPT.md` + git log |
| `IDENTITY_DESIGN.md` | `/IDENTITY_DESIGN.md` | 363 | (no internal date) | Identity/anonymous-id design built on the **PostHog** person model (`ph.alias()`, `$create_alias`, PostHog distinctId) | **PostHog-era, superseded** — PostHog was decommissioned 2026-07-19; that identity mechanism no longer exists in the runtime |
| `AGENT_BRIEF.md` | `/AGENT_BRIEF.md` | 125 | (no internal date) | Agent onboarding brief — product, stack, ports, commands, commit format; names **"PostHog HogQL/events"** as the live event store | **PostHog-era, superseded by `CLAUDE.md`** |
| `DEVELOPER_CONTEXT.md` | `/DEVELOPER_CONTEXT.md` | 86 | (no internal date) | Developer stack context; "event tracking queries use **PostHog HogQL API**" | **PostHog-era, superseded by `CLAUDE.md`** |
| `PROJECT_CONTEXT_COMPACT.md` | `/PROJECT_CONTEXT_COMPACT.md` | 112 | (no internal date) | Condensed project overview; "**PostHog/HogQL** for analytics" + points at `SESSION_HANDOFF.md` | **PostHog-era, superseded by `CLAUDE.md`** |
| `RULES.md` | `/RULES.md` | 76 | (no internal date) | Coding-behavior rules; instructs reading `system.md` / `progress.md` / `deepseek.md` (a dead/decommissioned doc set) | **Superseded by `CLAUDE.md`** (its reading list points at docs that no longer exist) |

## References updated so the archive sticks
- **`AGENTS.md`** (live contract) — repointed its "read before every session" list, the "During/After session" workflow lines, the commit-format note, and the doc-index table off these seven and onto `CLAUDE.md` / `NEXT_SESSION_PROMPT.md`.
- **`scripts/qa-static-launch-check.mjs`** — removed the two now-dead `pathsToSearch` entries (`SESSION_LOG.md`, `SESSION_HANDOFF.md`). (CI already skipped-if-missing, but dead entries are the drift this cleanup targets.)

## Benign soft references left in place (prose mentions, not live pointers)
`NEXT_SESSION_PROMPT.md:252`, `COMMANDCODE_RUNBOOK.md`, `DEV_SESSION_CHECKLIST.md`, `CHANGELOG.md:505`, and three `tinybird/archive/*` files mention these filenames in prose. They are historical narrative, not machine-read pointers — left as-is (several of those docs are themselves archive candidates). No import, build, or CI step depends on any of them.

## Not moved (pending a decision)
`PAID_BETA_SESSION_PLAN.md` (needs a read — beta plan of record?), `DEV_SESSION_CHECKLIST.md` (stale workflow, low-noise), `MANUAL_QA_BACKLOG.md` + `QA_RUNBOOK.md` (UNKNOWN — may hold live process). `SUPABASE_SCHEMA.md`, `ATTRIBUTION.md`, `DATA_CAPTURE_SPEC.md` stay at root (CURRENT — timestamped `_Last reviewed: 2026-07-24_`).
