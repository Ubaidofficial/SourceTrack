# SourceTrack Developer Session Checklist

Use this checklist at the start, middle, and end of every development session to ensure surgical changes, prevent scope creep, and maintain high-quality commits.

---

## 1. Before Starting Work

- [ ] **Read Developer Context & Session State**:
  - Read [DEVELOPER_CONTEXT.md](DEVELOPER_CONTEXT.md) to understand current state and restrictions.
  - Read `SESSION_STATE.md` and `SESSION_HANDOFF.md` to check where the previous developer left off.
- [ ] **Verify Git Status**:
  - Run `git status` to verify if the working directory is clean. If there are uncommitted files from previous sessions, flag them before continuing.
- [ ] **Confirm Active Branch**:
  - Ensure you are working on the correct branch (normally `main`).
- [ ] **Identify Targets & Boundaries**:
  - Review the goal of the active Session (e.g., Session 102.2).
  - Explicitly identify the files that will be touched.
  - Read [RULES.md](RULES.md) (R1 - R10) to reinforce surgical constraints.

---

## 2. During Implementation

- [ ] **Keep Scope Surgical**:
  - Only make modifications directly relevant to the session goal.
  - Avoid cleanup, formatting, or refactoring of adjacent lines/files unless they are directly broken.
- [ ] **Continuous Syntax Verification**:
  - Run `node --check` on touched API files immediately after editing.
- [ ] **No Speculative Abstractions**:
  - Write simple, direct, copy-paste-friendly code. Avoid overcomplicating patterns.
- [ ] **Honest Claims Only**:
  - Do not implement placeholders or state that mock integrations are fully complete.

---

## 3. Before Committing (Local Verification Suite)

Run the full local verification pipeline:

- [ ] **Run Code Syntax Verification**:
  ```bash
  node --check api/index.js api/routes/*.js api/lib/*.js
  ```
- [ ] **Build Frontend Assets (if React files changed)**:
  ```bash
  cd dashboard && npm run build && cd ..
  ```
- [ ] **Rebuild Tracker Minified Scripts (if tracker files changed)**:
  ```bash
  npm run build:tracker
  ```
- [ ] **Validate Whitespace & Merge Conflict Markers**:
  ```bash
  git diff --check
  ```
- [ ] **Review Diff Statistics**:
  - Run `git diff --stat` to verify only expected files are modified.
- [ ] **Line-by-Line Code Review**:
  - Run `git diff` for all modified source files and review every added line. Look for:
    - Debugging logs left behind (`console.log`).
    - Unused imports (e.g. `esc`, `queryHogQL`).
    - Stale comments.
- [ ] **Update Session Documentation**:
  - Append the current session details to the top of `SESSION_HANDOFF.md`.
  - Update the active session status, last completed summary, and build status in `SESSION_STATE.md`.
  - Add a log line to `SESSION_LOG.md`.

---

## 4. Post-Commit / Handoff

- [ ] **Verify Commit Message**:
  - Ensure the commit message follows the HEREDOC style specified in `AGENT_BRIEF.md`.
- [ ] **Verify Head Commit**:
  - Run `git log --oneline -3` to verify the commits.
- [ ] **Note the Next Action**:
  - Ensure `SESSION_STATE.md` has the correct `Next Task` session ID defined.
