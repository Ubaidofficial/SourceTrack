# Session Handoff

Update this file at the end of every session.

This file is intentionally short. It tells the next agent exactly where to continue.

## Current branch

`session-78-agent-docs-context`

## Current main baseline

Latest known main commits:

- `b600b74 Add channel taxonomy report presets`
- `787cbfa Stabilize saved report API requests`
- `572d295 Fix report saves and source tracking`

## Last completed product work

Session 77:

- Added/verified channel taxonomy v1.
- Renamed AI channel bucket to `AI Search`.
- Added `Revenue by Channel` Report Builder preset.
- Added `Conversions by Channel` Report Builder preset.
- Fixed session report channel grouping bug.

## Current task

Create agent context docs so GPT, Claude, DeepSeek, and future agents can code faster with less repeated context gathering.

## Files created in this docs session

- `AGENT_BRIEF.md`
- `ARCHITECTURE.md`
- `DATA_CAPTURE_SPEC.md`
- `SUPABASE_SCHEMA.md`
- `QA_RUNBOOK.md`
- `KNOWN_ISSUES.md`
- `SESSION_HANDOFF.md`

## Existing docs to keep

- `RULES.md`
- `SYSTEM.md`
- `ATTRIBUTION.md`
- `IDENTITY_DESIGN.md`
- `PROGRESS.md`
- `DEEPSEEK.md`

## Important verified context

- Supabase core tables exist:
  - `sites`
  - `companies`
  - `company_members`
  - `saved_reports`
  - `dashboard_widgets`
  - `admin_audit_log`
  - `qa_notes`
- RLS/policies verified for:
  - `admin_audit_log`
  - `companies`
  - `company_members`
  - `qa_notes`
  - `saved_reports`
  - `sites`
- `dashboard_widgets` policy may still need work later.
- `schema.sql` is stale; use migrations/live Supabase verification as truth.

## Next product session

Session 78: UTM/ref/source/via end-to-end verification.

Goals:

- Verify URL params flow from test URL to tracker payload.
- Verify `/api/track` persists UTM/ref/source/via fields.
- Verify Event Logger exposes raw fields.
- Verify Report Builder can report on captured source/channel data.
- Confirm conversion events carry first-touch fields.
- Check/fix whether conversion events persist:
  - `ref_param`
  - `source_param`
  - `via_param`

## Session 78 test URLs

Open these with API, dashboard, and static server running:

    http://localhost:8080/sourcetrack-test.html?utm_source=google&utm_medium=cpc&utm_campaign=session78
    http://localhost:8080/sourcetrack-test.html?ref=twitter
    http://localhost:8080/sourcetrack-test.html?source=newsletter&via=email

Then check:

    http://localhost:5173/debugger
    http://localhost:5173/report-builder

## Standard checks

Backend:

    cd "$HOME/Desktop/trackiq"
    node --check api/index.js
    node --check api/routes/track.js
    node --check api/routes/conversion.js
    node --check api/routes/attribution.js
    node --check api/lib/attribution-engine.js

Dashboard:

    cd "$HOME/Desktop/trackiq/dashboard"
    npm run build

Tracker, only if tracker source changed:

    cd "$HOME/Desktop/trackiq"
    npm run build:tracker

## Rules reminder

- Read `RULES.md` and `PROGRESS.md` at the start of every coding session.
- Treat `PROGRESS.md` as history, not proof.
- Verify behavior in code and QA before claiming fixed.
- Make surgical changes only.
- Do not overclaim Cometly/DataFast/Usermaven parity.
- If `tracker/tracker.js` changes, rebuild `tracker/tracker.min.js`.
