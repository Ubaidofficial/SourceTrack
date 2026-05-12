# Session Handoff

Update this file at the end of every session.

This file is intentionally short. It tells the next agent exactly where to continue.

## Current branch

`session-78-utm-param-verification`

## Current main baseline

Latest known main commits:

- `b600b74 Add channel taxonomy report presets`
- `787cbfa Stabilize saved report API requests`
- `572d295 Fix report saves and source tracking`

## Last completed product work

Session 78 (current):

- Code-inspected tracker.js sends all UTM/ref/source/via/first-touch fields correctly — no tracker changes needed.
- Fixed `/api/conversion` parity gap: added `ref_param`, `source_param`, `via_param` persistence.
- Added `utm_content`, `utm_term`, `ref_param`, `source_param`, `via_param` to events.js SQL SELECT and top-level mapping.
- Added 8 new detail cards to EventDebugger.jsx drawer: `utm_content`, `utm_term`, `ref_param`, `source_param`, `via_param`, `first_touch_source`, `first_touch_medium`, `first_touch_campaign`.
- Updated Snippet.jsx copy to mention ref/source/via fallback support.
- Updated DATA_CAPTURE_SPEC.md, KNOWN_ISSUES.md, SESSION_HANDOFF.md.

Session 77:

- Added/verified channel taxonomy v1.
- Renamed AI channel bucket to `AI Search`.
- Added `Revenue by Channel` Report Builder preset.
- Added `Conversions by Channel` Report Builder preset.
- Fixed session report channel grouping bug.

## Files changed in this session

- `api/routes/conversion.js` — added ref_param/source_param/via_param
- `api/routes/events.js` — added utm_content/utm_term/ref_param/source_param/via_param to SQL SELECT and mapping
- `dashboard/src/pages/EventDebugger.jsx` — added 8 new detail cards
- `dashboard/src/pages/Snippet.jsx` — added ref/source/via fallback mention
- `DATA_CAPTURE_SPEC.md` — updated conversion fields, removed known gap
- `KNOWN_ISSUES.md` — removed conversion parity issue, moved to recently fixed
- `SESSION_HANDOFF.md` — this file

## Still needs manual QA

- Verify conversion events carry ref_param/source_param/via_param in PostHog
- Verify Event Logger shows new detail card fields populated
- Verify Snippet.jsx copy renders correctly
- Run the Session 78 test URLs:
  - `http://localhost:8080/sourcetrack-test.html?utm_source=google&utm_medium=cpc&utm_campaign=session78`
  - `http://localhost:8080/sourcetrack-test.html?ref=twitter`
  - `http://localhost:8080/sourcetrack-test.html?source=newsletter&via=email`

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
