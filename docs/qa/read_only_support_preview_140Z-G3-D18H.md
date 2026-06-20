# QA Report: Read-Only Support Preview (140Z-G3-D18H)

## Final Verdict
**PARTIAL PASS**
The codebase successfully enforces read-only support preview at both the UI and backend levels. The production auth smoke test has now **PASSED** and `curl /api/health` has **PASSED**. A manual production browser retest after deploy is still pending. The paid beta release remains **NOT READY**.

## Routes Tested & UI Hardening

### `/dashboard`
- Support Mode Banner appears persistently at the top of the shell layout for all pages.
- Standard navigation operates normally.
- Attempting to load `/dashboard` normally as a bare `super_admin` without an active preview correctly redirects the operator to `/ops`.

### `/setup`
- In support preview, install snippet is hidden.
- Read-only banner displayed.
- Copy buttons disabled.

### `/settings`
- Read-only banner is prominent.
- UTM Builder is available but local-only (generates/copies URL, does not mutate backend).
- `Danger Zone`, `Visitor Data Erasure`, `API Tokens`, and `Billing` are entirely hidden.
- Input fields (Site Name, Domains, Cookieless Mode) and "Save Changes" buttons are disabled.

### `/integrations`
- "Live Events", "Copy script", "Show install steps", and specific integration "Setup", "Connect", and "Manage" buttons are hidden entirely.
- All credential input fields and mutation triggers (e.g. "Save integration", "Verify", "Remove", "Disconnect") are disabled or hidden.
- Documentation links remain accessible.

### `/campaigns`
- "Import Costs" and "Sync connected accounts" buttons are completely hidden.
- Read-only filters remain operable.

### `/report-builder`
- "Save", "Export CSV", "Pin", and billing upsells for these features are hidden.
- Saved Reports mutations ("Delete" and "Pin") in the drawer are hidden; only "Load" is available.

### `/ops`
- Operator-safe shell guard successfully limits access to the Ops Console for `super_admin` roles not in preview mode.
- Does not expose the customer navigation, "Add New Site", or "activeSite.site_key".

## Backend Preview Mutation Guard Behavior
The middleware in `api/index.js` explicitly blocks all mutation methods (anything other than `GET`, `HEAD`, `OPTIONS`) that carry the `X-Sourcetrack-Support-Preview: true` header, responding with `403 Forbidden: Support preview is read-only`. Administrative routes (`/api/admin/*`) bypass this block to ensure the operator can still function from the Ops Console. 

The frontend wrapper in `dashboard/src/lib/api.js` automatically injects `X-Sourcetrack-Support-Preview: true` on all backend API requests if `isSupportPreviewActive()` resolves to true.

## Session Storage Shape
The preview session state in `sourcetrack_admin_preview` stores only limited, safe context details:
- `site_id`
- `site_name`
- `site_domain`

It notably **does not** store the highly sensitive `site_key`.

## Validation Output
- `git diff --check`: Clean.
- `npm run qa:static`: Clean (`PASS — static launch QA passed`). No whitespace violations.
- `scripts/qa-production-auth-smoke.mjs`: `PASSED`.
- `curl /api/health`: `PASSED`.

## Git Status
```
 M api/index.js
 M dashboard/src/components/Layout.jsx
 M dashboard/src/lib/api.js
 M dashboard/src/pages/Campaigns.jsx
 M dashboard/src/pages/Dashboard.jsx
 M dashboard/src/pages/Integrations.jsx
 M dashboard/src/pages/ReportBuilder.jsx
 M dashboard/src/pages/Settings.jsx
 M dashboard/src/pages/Setup.jsx
 M dashboard/src/utils/supportPreview.js
 A docs/qa/read_only_support_preview_140Z-G3-D18H.md
?? docs/design/
```

**Note:** `docs/design/design.md` is intentionally excluded from the D18H commit. `docs/qa/read_only_support_preview_140Z-G3-D18H.md` is included in the D18H change set. Paid beta remains NOT READY.
