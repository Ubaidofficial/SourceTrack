# Manual QA Backlog

This file tracks manual/browser QA that can be completed later.

Do not mark an item passed unless it was actually tested in the running app.

## Status labels

- Pending
- Passed
- Failed
- Blocked
- Not applicable

## Global setup for local QA

Run these in separate terminals:

    cd "$HOME/Desktop/trackiq"
    npm run dev

    cd "$HOME/Desktop/trackiq/dashboard"
    npm run dev

    cd "$HOME/Desktop/trackiq"
    python3 -m http.server 8080

Useful local URLs:

    API: http://localhost:3000
    Dashboard: http://localhost:5173
    Static test page: http://localhost:8080/sourcetrack-test.html
    Event Logger: http://localhost:5173/debugger
    Report Builder: http://localhost:5173/report-builder
    Settings: http://localhost:5173/settings
    Snippet: http://localhost:5173/snippet

---

## Session 75 / 76 - Saved reports

Status: Pending

Goal: verify saved reports are production-ready after backend persistence and fetchApi JSON body fix.

Checklist:

- Save a new report in Report Builder.
- Confirm Network tab shows 200, not 500.
- Refresh page.
- Confirm saved report still appears.
- Load saved report.
- Edit/update same report.
- Duplicate saved report.
- Delete duplicated report.
- Confirm no stale localStorage-only behavior.
- Confirm saved report request includes site_key.
- Confirm no invalid JSON body or [object Object] payload.

Files related:

- dashboard/src/pages/ReportBuilder.jsx
- dashboard/src/lib/api.js
- api/routes/saved-reports.js

Result notes:

- Pending.

---

## Session 77 - Channel taxonomy

Status: Pending

Goal: verify Channel reporting works in UI and API after channel taxonomy changes.

Checklist:

- Open Report Builder.
- Confirm presets exist:
  - Revenue by Channel
  - Conversions by Channel
- Run Revenue by Channel preview.
- Run Conversions by Channel preview.
- Confirm Network tab request uses group_by=channel.
- Confirm response is 200.
- Confirm no HogQL error.
- Confirm channel labels display as expected:
  - Direct
  - Organic Search
  - Paid Search
  - Organic Social
  - Paid Social
  - Email
  - AI Search
  - Referral
  - Other
- If no rows appear, confirm it is a valid no-data state and not a 500.

Files related:

- api/lib/attribution-engine.js
- api/routes/attribution.js
- dashboard/src/pages/ReportBuilder.jsx

Result notes:

- Presets were visually confirmed earlier.
- Full browser/API QA still pending.

---

## Session 78 - UTM/ref/source/via end-to-end

Status: Pending

Goal: verify URL params flow from test URL to tracker payload, API/PostHog, Event Logger, and reports.

Test URLs:

    http://localhost:8080/sourcetrack-test.html?utm_source=google&utm_medium=cpc&utm_campaign=session78
    http://localhost:8080/sourcetrack-test.html?ref=twitter
    http://localhost:8080/sourcetrack-test.html?source=newsletter&via=email

Checklist:

- Open each test URL.
- Confirm pageview events appear in Event Logger.
- Open Event Logger detail drawer.
- Confirm raw/detail fields include:
  - utm_source
  - utm_medium
  - utm_campaign
  - utm_content
  - utm_term
  - ref_param
  - source_param
  - via_param
  - first_touch_source
  - first_touch_medium
  - first_touch_campaign
- Confirm ?ref=twitter sets fallback source attribution.
- Confirm ?source=newsletter&via=email preserves both source_param and via_param.
- Trigger a conversion from the test page or browser console.
- Confirm conversion event carries:
  - utm_source
  - utm_medium
  - utm_campaign
  - ref_param
  - source_param
  - via_param
  - first_touch_source
  - first_touch_medium
  - first_touch_campaign
- Confirm Report Builder can preview source/channel reports after events arrive.

Files related:

- tracker/tracker.js
- api/routes/track.js
- api/routes/conversion.js
- api/routes/events.js
- dashboard/src/pages/EventDebugger.jsx
- dashboard/src/pages/Snippet.jsx

Result notes:

- Code/static checks passed.
- Manual runtime QA pending.

---

## Session 78 - Snippet/install copy

Status: Pending

Goal: verify docs copy renders correctly in the app.

Checklist:

- Open Snippet page.
- Confirm copy says UTMs are captured automatically by the pixel.
- Confirm copy mentions ref/source/via fallback support.
- Confirm copy does not imply users must manually enter UTM fields for tracking.
- Confirm conversion examples still render correctly.
- Confirm copy buttons still work.

Files related:

- dashboard/src/pages/Snippet.jsx

Result notes:

- Pending.

---

## Session 79 — Report Builder filter UX polish

Status: Pending

Goal: verify channel filter is wired end-to-end, quick filter buttons work, and helper copy renders.

Checklist:

- Open Report Builder.
- Expand Filters section (Step 7).
- Confirm helper copy shows: "UTMs are captured automatically by the pixel." and "Filters only narrow this report; they are not required for tracking."
- Click each Quick Channel button (Organic, Paid, Social, Email, AI, Direct):
  - Organic → Channel dropdown shows Organic Search
  - Paid → Channel dropdown shows Paid Search
  - Social → Channel dropdown shows Organic Social
  - Email → Channel dropdown shows Email
  - AI → Channel dropdown shows AI Search, Has AI Source set to Yes
  - Direct → Channel dropdown shows Direct
- Run a report with a channel filter.
- Confirm Network tab request includes `filter_channel=<value>`.
- Confirm response is 200.
- Click a common source quick-select button (e.g. google).
- Confirm Source input fills with that value.
- Type a custom source manually — confirm it works.
- Export CSV with a channel filter — confirm filter_channel is in the URL.
- Confirm quick filter buttons and manual inputs coexist (can override each other).

Files related:

- dashboard/src/pages/ReportBuilder.jsx
- api/routes/attribution.js

Result notes:

- Pending.

---

## Session 80 — Saved report management UX

Status: Pending

Goal: verify saved reports are visible, editable, duplicable, deletable, and resettable from Report Builder.

Checklist:

- Open Report Builder.
- Save a new report.
- Confirm Saved Reports panel shows the report.
- Confirm saved report row shows name, metric, group-by, model, and date range.
- Load the saved report.
- Confirm fields populate correctly.
- Update the saved report.
- Confirm success message says "Report updated".
- Click New report.
- Confirm form resets to defaults and saved reports remain.
- Duplicate a saved report.
- Confirm duplicate appears.
- Delete duplicate.
- Refresh the page.
- Confirm remaining saved reports persist.
- Confirm Network tab has no 500s.

Files related:

- dashboard/src/pages/ReportBuilder.jsx
- api/routes/saved-reports.js

Result notes:

- Pending.

---

## Session 83 — Design system token layer & primitives

Status: Pending

Goal: verify design-system preview page renders correctly and existing app routes are not broken.

Checklist:

- Visit `/design-system`.
- Confirm color swatches render for all `st` tokens (black, gray, lime, green, orange, red).
- Confirm typography renders with Inter font family.
- Confirm `.st-container` preview respects 1320px max-width and 24px side padding.
- Confirm `DashboardTable` renders headers, rows, custom cells (StatusBadge), and empty state.
- Confirm `FilterBar` renders date buttons, active state (lime background), and export button.
- Confirm `EmptyState` renders icon, title, description, and optional action button.
- Confirm `MetricTile` renders with values, deltas, and icons.
- Confirm `StatusBadge` renders all 8 variants correctly.
- Confirm `OnboardingProgress` renders 5-step stepper.
- Confirm existing routes still load normally:
  - Dashboard
  - Report Builder
  - Event Logger
  - Onboarding
- Confirm `/design-system` is accessible without authentication.
- Confirm Google Fonts load and no console errors appear.
- Document any production concern about external font dependency.

Files related:

- dashboard/index.html
- dashboard/tailwind.config.js
- dashboard/src/index.css
- dashboard/src/components/DashboardTable.jsx
- dashboard/src/components/FilterBar.jsx
- dashboard/src/components/EmptyState.jsx
- dashboard/src/pages/DesignSystem.jsx
- dashboard/src/App.jsx

Result notes:

- Pending.

---

## Supabase schema/RLS verification

Status: Mostly passed

Goal: verify live Supabase schema matches app expectations.

Already verified:

- Tables exist:
  - sites
  - companies
  - company_members
  - saved_reports
  - dashboard_widgets
  - admin_audit_log
  - qa_notes
- Policies exist for:
  - admin_audit_log
  - companies
  - company_members
  - qa_notes
  - saved_reports
  - sites

Still pending:

- dashboard_widgets policy review before Session 81 dashboard widget persistence work.

Result notes:

- Good enough for Sessions 75-78.
- Revisit dashboard_widgets policy in Session 81.

---

## Future Session 81 - Dashboard saved-report widgets

Status: Pending future QA

Goal: verify saved reports can be added to dashboard once implemented.

Checklist:

- Save report.
- Add to Dashboard.
- Confirm dashboard card appears.
- Refresh page.
- Confirm dashboard card persists.
- Confirm fixed dashboard cards remain intact.
- Confirm dashboard_widgets table/RLS policy is correct if used.

Result notes:

- Future work.
