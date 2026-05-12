# SourceTrack / TrackIQ Agent Brief

## Product

SourceTrack / TrackIQ is a lightweight attribution and analytics platform for:

- website pixel tracking
- UTM attribution
- ref/source/via attribution
- referrer and AI-source detection
- conversion tracking
- first-touch, last-touch, and non-direct attribution
- Report Builder
- Event Logger
- saved reports
- dashboard cards
- AI traffic analytics

Position honestly:

SourceTrack tracks traffic, UTMs, AI referrals, conversions, and attribution reports from your website pixel and server/offline conversion events.

Do not claim full Cometly/DataFast/Usermaven parity unless verified in code and QA.

## Stack

- Backend: Node/Express API in `/api`
- Frontend: Vite React dashboard in `/dashboard`
- Tracker: `/tracker/tracker.js`
- Minified tracker: `/tracker/tracker.min.js`
- Loader: `/tracker/loader.js`
- Minified loader: `/tracker/loader.min.js`
- User/site/saved report/auth store: Supabase
- Event analytics/query store: PostHog HogQL/events

## Local ports

- API: `http://localhost:3000`
- Dashboard: `http://localhost:5173`
- Static pixel test page: `http://localhost:8080/sourcetrack-test.html`

## Read first

At the start of every coding session, read:

1. `RULES.md`
2. `PROGRESS.md`
3. `AGENT_BRIEF.md`
4. Relevant feature docs:
   - `ATTRIBUTION.md`
   - `IDENTITY_DESIGN.md`
   - `DATA_CAPTURE_SPEC.md`
   - `SUPABASE_SCHEMA.md`
   - `QA_RUNBOOK.md`
   - `KNOWN_ISSUES.md`

Treat `PROGRESS.md` as history/navigation, not proof. Verify against code before claiming behavior.

## Current baseline

Recent committed work:

- `b600b74 Add channel taxonomy report presets`
- `787cbfa Stabilize saved report API requests`
- `572d295 Fix report saves and source tracking`

Session 77 added/verified:

- Channel taxonomy support in Report Builder
- `AI` channel renamed to `AI Search`
- `Revenue by Channel` preset
- `Conversions by Channel` preset
- Session channel grouping bug fixed

## Core rules

- Make surgical changes only.
- Do not refactor unrelated code.
- Verify before claiming fixed.
- Do not overclaim parity with Cometly/DataFast/Usermaven.
- If `tracker/tracker.js` changes, rebuild `tracker/tracker.min.js`.
- Commit only after checks/build pass.
- Never commit `.env`, secrets, local test artifacts, or unnecessary `.bak` files.
- Use `toFloatOrZero`, not `toFloat64OrZero`, in HogQL.
- Prefer `countIf()` over `COUNT(CASE WHEN...)` in HogQL.
- Avoid ambiguous `distinct_id` in joins.
- Run `node --check api/index.js` after touching `api/index.js`.

## Standard commands

API:

    cd "$HOME/Desktop/trackiq"
    npm run dev

Dashboard:

    cd "$HOME/Desktop/trackiq/dashboard"
    npm run dev

Static test page:

    cd "$HOME/Desktop/trackiq"
    python3 -m http.server 8080

Core checks:

    cd "$HOME/Desktop/trackiq"
    node --check api/index.js
    node --check api/routes/track.js
    node --check api/routes/conversion.js
    node --check api/routes/attribution.js
    node --check api/lib/attribution-engine.js

    cd dashboard
    npm run build

Tracker build:

    cd "$HOME/Desktop/trackiq"
    npm run build:tracker
