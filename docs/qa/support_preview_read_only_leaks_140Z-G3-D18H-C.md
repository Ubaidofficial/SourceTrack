# Support Preview Read-Only Leaks - 140Z-G3-D18H-C

## Overview
This document logs the fixes for the remaining read-only state leaks in the Support Preview feature discovered via production screenshots following the D18H-B runtime fix. 

**Current verdict:** PARTIAL PASS / LOCAL ONLY  
*Production retest after deploy is still pending. Paid beta remains NOT READY.*

## Issue Context
Production validation found that while the Support Preview runtime errors were resolved, several UI actions across customer-facing routes remained unguarded and mutable by operators. The D18H-C correction pass addressed the remaining edge cases.

### Reported Leaks
1. **/campaigns:** "Import Costs" modal could still be triggered via the `?import=true` query param.
2. **/integrations:** The raw webhook signing secret was still exposed. Several mutation buttons and forms (Manage Server API Tokens, Test Webhook, Save Configuration, Connect buttons) were still visible.
3. **/analytics:** The route showed an empty state claiming it was disabled "to prevent excessive database load" which was inaccurate without explicit evidence.
4. **/ops (Ops Console):** Clicking "Ops Console" from the sidebar left the operator in a leaked preview state.

## Root Causes & Fixes

### 1. Campaigns (`/campaigns`)
- **Root Cause:** The `?import=true` URL parameter automatically forced the `ImportModal` to open regardless of the preview state.
- **Fix:** Guarded the query-param effect so that in Support Preview, the `?import=true` parameter is stripped and `setImportModalOpen(true)` is completely bypassed. `executeImport` was also hard-guarded to immediately return if `isPreview` is true.

### 2. Integrations (`/app/integrations`)
- **Root Cause:** Webhook secrets were rendered directly in the DOM. Certain nested connection forms and API token links were not properly hidden.
- **Fix:** 
  - **Hidden:** Webhook signing secret (now displays `HIDDEN_IN_PREVIEW`), all "Save Configuration" / "Sync Now" / "Connect" forms and action buttons in Support Preview (Google Ads, Meta Ads, Search Console, Webhooks) are wrapped in `!isPreview` or replaced by read-only placeholders. The "Manage Server API Tokens" link is hidden.
  - **Allowed:** Docs links, status badges, read-only Details copy, and explanatory descriptions.

### 3. Analytics (`/analytics`)
- **Root Cause:** The empty state copy contained an unverified technical claim regarding database load.
- **Fix:** Changed the copy to a safer, neutral message: *"Analytics is not available in Support Preview. Use Dashboard and Attribution for read-only customer context."*

- **Fix:** Added a render-blocking check in `AdminRoute.jsx` that removes `sourcetrack_admin_preview` from `sessionStorage` and forces a hard reload via `window.location.href = '/ops'`, clears preview state before rendering /ops; deployed retest remains required.

## Route-by-Route Retest Matrix

| Route | Validation Target | Status |
|---|---|---|
| `/campaigns` | Query param `?import=true` stripped, modal blocked. | **READY FOR RETEST** |
| `/integrations`| Webhook secret hidden (`HIDDEN_IN_PREVIEW`), mutation actions stripped. | **READY FOR RETEST** |
| `/analytics` | Renders accurate, safe empty state copy. | **READY FOR RETEST** |
| `/ops` | Clicking "Ops Console" in sidebar clears preview. | **READY FOR RETEST** |

## Validation Output

### `git status`
```
 M dashboard/src/components/AdminRoute.jsx
 M dashboard/src/pages/Analytics.jsx
 M dashboard/src/pages/Campaigns.jsx
 M dashboard/src/pages/Integrations.jsx
?? docs/qa/support_preview_read_only_leaks_140Z-G3-D18H-C.md
```

### Static & Auth Smoke QA
- `npm run qa:static` — PASS (Release readiness verified, static build successful, no forbidden strings)
- `qa-production-auth-smoke.mjs` — PASS (All frontend routes and API health check passed)
- `git diff --check` — Clean

### Leak Grep Check
```
dashboard/src/pages/Integrations.jsx:1676:                    <Link to="/campaigns?import=true" className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-150 hover:bg-gray-200 text-gray-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100 border border-transparent dark:border-slate-700 transition-colors">
dashboard/src/pages/Integrations.jsx:1802:                          Connect Google Ads
dashboard/src/pages/Integrations.jsx:1814:                            {syncingGads ? 'Syncing...' : 'Sync Now'}
dashboard/src/pages/Integrations.jsx:1882:                        {gadsSaving ? 'Saving...' : 'Save Configuration'}
dashboard/src/pages/Integrations.jsx:1933:                          {syncingMeta ? 'Syncing...' : 'Sync Now'}
dashboard/src/pages/Integrations.jsx:2000:                        {metaConnecting ? 'Saving...' : 'Connect Meta Ads'}
dashboard/src/pages/Integrations.jsx:2324:                        Connect Google Search Console
dashboard/src/pages/Integrations.jsx:2365:                            {selectingProperty ? 'Saving...' : 'Confirm Property Selection'}
dashboard/src/pages/Integrations.jsx:2584:                              Manage Server API Tokens →
dashboard/src/pages/Integrations.jsx:2736:                                  <code className="text-xs font-mono text-gray-700 select-all">{isPreview ? 'HIDDEN_IN_PREVIEW' : webhookData.webhook.secret}</code>
dashboard/src/pages/Integrations.jsx:2801:                                {submitting ? 'Saving...' : 'Save Configuration'}
dashboard/src/pages/Integrations.jsx:2812:                                <Play className="w-3 h-3" /> {testing ? 'Testing...' : 'Test Webhook'}
docs/qa/support_preview_read_only_leaks_140Z-G3-D18H-C.md:14:2. **/integrations:** The raw webhook signing secret was still exposed. Several mutation buttons and forms (Manage Server API Tokens, Test Webhook, Save Configuration, Connect buttons) were still visible.
docs/qa/support_preview_read_only_leaks_140Z-G3-D18H-C.md:27:  - **Hidden:** Webhook signing secret (now displays `HIDDEN_IN_PREVIEW`), all "Save Configuration" / "Sync Now" / "Connect" forms and action buttons in Support Preview (Google Ads, Meta Ads, Search Console, Webhooks) are wrapped in `!isPreview` or replaced by read-only placeholders. The "Manage Server API Tokens" link is hidden.
docs/qa/support_preview_read_only_leaks_140Z-G3-D18H-C.md:42:| `/integrations`| Webhook secret hidden (`HIDDEN_IN_PREVIEW`), mutation actions stripped. | **READY FOR RETEST** |
```
*Note: The grep results above represent raw strings present in the code, but manual JSX auditing confirms all instances are successfully wrapped in `!isPreview` conditional rendering blocks (or explicitly render safe values like `HIDDEN_IN_PREVIEW`).*

## Next Steps
- Commit the changes locally and push to trigger CI/Deploy.
- Perform final production screenshot QA against the deployed branch.
