# QA Runbook

This file defines how to verify SourceTrack changes before claiming fixed or committing.

Use this as the checklist for GPT, Claude, DeepSeek, or any agent making code changes.

## QA principles

- Verify before claiming fixed.
- Run the smallest relevant checks first.
- Run dashboard build before committing frontend changes.
- Run `node --check` for touched backend files.
- If tracker source changes, rebuild minified tracker files.
- Manual QA matters for tracking, attribution, saved reports, and UI state.

## Standard branch start

    cd "$HOME/Desktop/trackiq"
    git status --short
    git checkout main
    git pull origin main
    git checkout -b <branch-name>

## Standard local servers

Terminal 1: API

    cd "$HOME/Desktop/trackiq"
    npm run dev

Terminal 2: Dashboard

    cd "$HOME/Desktop/trackiq/dashboard"
    npm run dev

Terminal 3: Static test page

    cd "$HOME/Desktop/trackiq"
    python3 -m http.server 8080

## Core backend checks

Run from repo root:

    cd "$HOME/Desktop/trackiq"
    node --check api/index.js
    node --check api/routes/track.js
    node --check api/routes/conversion.js
    node --check api/routes/attribution.js
    node --check api/lib/attribution-engine.js

If you touch another backend file, run `node --check` on that file too.

Always run this after touching `api/index.js`:

    node --check api/index.js

## Dashboard build

Run after frontend changes:

    cd "$HOME/Desktop/trackiq/dashboard"
    npm run build

A Vite chunk-size warning is okay. A build failure is not okay.

## Tracker build

Run after changing `tracker/tracker.js` or `tracker/loader.js`:

    cd "$HOME/Desktop/trackiq"
    npm run build:tracker

Then confirm minified files changed as expected:

    git diff -- tracker/tracker.min.js tracker/loader.min.js

## Health checks

With servers running:

    curl -i http://localhost:3000/health
    curl -I http://localhost:3000/tracker/tracker.min.js
    curl -I http://localhost:8080/sourcetrack-test.html

Expected:

- API health responds.
- Tracker file returns 200.
- Static test page returns 200.

## Saved reports QA

Manual flow:

1. Open `http://localhost:5173/report-builder`
2. Build a report.
3. Save report.
4. Refresh page.
5. Confirm saved report still appears.
6. Load saved report.
7. Edit/update same report.
8. Duplicate report.
9. Delete duplicate.
10. Confirm no 500s in Network tab.

Important files:

- `dashboard/src/pages/ReportBuilder.jsx`
- `dashboard/src/lib/api.js`
- `api/routes/saved-reports.js`

Expected:

- Save sends valid JSON.
- Saved report URL includes `site_key`.
- Refresh does not lose backend-saved reports.
- Duplicate creates a new saved report.
- Delete removes the selected report.

## UTM/ref/source/via QA

Open these URLs:

    http://localhost:8080/sourcetrack-test.html?utm_source=google&utm_medium=cpc&utm_campaign=session78
    http://localhost:8080/sourcetrack-test.html?ref=twitter
    http://localhost:8080/sourcetrack-test.html?source=newsletter&via=email

Then open:

    http://localhost:5173/debugger

Verify raw event properties include:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `ref_param`
- `source_param`
- `via_param`
- `first_touch_source`
- `first_touch_medium`
- `first_touch_campaign`

Expected fallback behavior:

- `?ref=twitter` should set source attribution from `ref`.
- `?source=newsletter&via=email` should preserve both fallback params.
- `utm_source` should still win when present.

## Conversion QA

After loading a test page, trigger a conversion if available from the test page or browser console.

Expected conversion properties:

- `conversion_value`
- `conversion_type`
- `form_name` if supplied
- `utm_source`
- `utm_medium`
- `utm_campaign`
- `first_touch_source`
- `first_touch_medium`
- `first_touch_campaign`
- `ai_source` if referrer is detected

Known Session 78 check:

- Confirm whether conversions also persist `ref_param`, `source_param`, and `via_param`.
- If missing, fix `api/routes/conversion.js`.

## Event Logger QA

Open:

    http://localhost:5173/debugger

Check:

- Latest events load.
- Refresh does not blank existing rows unnecessarily.
- Detail drawer opens.
- Raw properties are visible.
- Copy JSON works if present.
- Filters can be cleared.

Important files:

- `dashboard/src/pages/EventDebugger.jsx`
- `api/routes/events.js`
- `api/routes/hygiene.js`

## Channel report QA

Open:

    http://localhost:5173/report-builder

Verify presets:

- Revenue by Channel
- Conversions by Channel

Expected channel labels:

- Direct
- Organic Search
- Paid Search
- Organic Social
- Paid Social
- Email
- AI Search
- Referral
- Other

Network tab request should include:

    /api/attribution?...group_by=channel&metric=revenue

Expected:

- Status 200
- No 500
- No HogQL error

No-data state is okay if local site has no conversions in range.

## Supabase schema checks

Run in Supabase SQL Editor.

Tables:

    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in (
        'sites',
        'companies',
        'company_members',
        'saved_reports',
        'dashboard_widgets',
        'admin_audit_log',
        'qa_notes'
      )
    order by table_name;

Expected tables:

- `admin_audit_log`
- `companies`
- `company_members`
- `dashboard_widgets`
- `qa_notes`
- `saved_reports`
- `sites`

Policies:

    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'companies',
        'company_members',
        'saved_reports',
        'admin_audit_log',
        'qa_notes',
        'dashboard_widgets',
        'sites'
      )
    order by tablename, policyname;

Expected currently:

- `admin_audit_log`: Service key access only
- `companies`: users can read their companies
- `company_members`: users can read own memberships
- `qa_notes`: Service key access only
- `saved_reports`: Owner access
- `sites`: users can read own sites

`dashboard_widgets` policy may be absent until dashboard widget persistence becomes active work.

## HogQL gotchas

Use:

- `toFloatOrZero`
- `countIf()`
- qualified aliases in joins

Avoid:

- `toFloat64OrZero`
- `COUNT(CASE WHEN...)`
- ambiguous `distinct_id` references

## Pre-commit checklist

Run:

    cd "$HOME/Desktop/trackiq"
    git status --short
    git diff --check

Then run relevant checks/builds.

Minimum for backend attribution/tracking changes:

    node --check api/index.js
    node --check api/routes/track.js
    node --check api/routes/conversion.js
    node --check api/routes/attribution.js
    node --check api/lib/attribution-engine.js

Minimum for dashboard changes:

    cd dashboard
    npm run build

Minimum for tracker changes:

    npm run build:tracker

Commit only after checks pass.
