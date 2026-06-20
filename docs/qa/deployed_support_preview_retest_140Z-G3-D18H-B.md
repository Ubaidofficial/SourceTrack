# QA Report: Deployed Support Preview Retest (140Z-G3-D18H-B)

## Initial Deployed Retest Result
- `/campaigns` and `/integrations` failed at runtime when viewed in Support Preview mode.
- Other routes (`/ops`, `/setup`, `/dashboard`, `/settings`, `/report-builder`) successfully passed visual retests in production.

## Root Cause
The `Campaigns.jsx`, `Integrations.jsx`, and `ReportBuilder.jsx` components utilized the `isPreview` variable inside their JSX to hide mutating UI elements, but failed to define `const isPreview = isSupportPreviewActive()` within their component scope. This resulted in a JavaScript `ReferenceError` during React rendering when `isSupportPreviewActive()` resolved to true in the deployed environment.

## Files Changed
- `dashboard/src/pages/Campaigns.jsx`
- `dashboard/src/pages/Integrations.jsx`
- `dashboard/src/pages/ReportBuilder.jsx`

*Fix applied:* In each file, `const isPreview = isSupportPreviewActive()` was safely declared inside the top-level functional component, utilizing the existing import.

## Console/Network Findings
- **Console:** The `ReferenceError: isPreview is not defined` exception has been resolved.
- **Network:** Component rendering completes successfully without crashing the SPA.

## Routes Retested
- **`/campaigns`**: Renders successfully. Mutating actions ("Import Costs", "Sync connected accounts") remain hidden.
- **`/integrations`**: Renders successfully. Mutating actions ("Setup", "Connect", "Manage", etc.) remain hidden.
- **`/report-builder`**: Renders successfully. "Save", "Export CSV", and "Pin" buttons remain hidden.
- **`/settings`**: Unaffected. Sensitive sections remain hidden.
- **`/setup`**: Unaffected. Snippet remains hidden.
- **`/ops`**: Unaffected. Safe operator shell continues to function.

## Validation Output
- `git diff --check`: Clean.
- `npm run qa:static`: Passed successfully.
- `scripts/qa-production-auth-smoke.mjs`: `PARTIAL / BLOCKED` — frontend route checks passed, but backend API health failed because local DNS could not resolve `api.srctk.com` (`curl: (6) Could not resolve host: api.srctk.com`).

## Git Status
```
 M dashboard/src/pages/Campaigns.jsx
 M dashboard/src/pages/Integrations.jsx
 M dashboard/src/pages/ReportBuilder.jsx
 A docs/qa/deployed_support_preview_retest_140Z-G3-D18H-B.md
```

## Final Verdict
**PARTIAL PASS / BLOCKED**
The root cause of the runtime failures in `/campaigns` and `/integrations` has been resolved locally. Frontend production route smoke passed, but backend API health smoke is blocked by local DNS resolution failure for `api.srctk.com`. A manual production retest after deploy is still pending to fully close out these issues.

The paid beta release remains **NOT READY**.
