# Operator-Safe Shell & Route Guard (D18E)

## 1. Final Verdict
**PARTIAL / BLOCKED** pending manual production verification retest. All automated checks and auth smoke tests have passed locally.

## 2. Manual Production Issue Observed
After D18D, the `super_admin` role was correctly scoped in `/api/sites`, but the frontend still permitted operators to browse the normal customer shell (Dashboard, Setup, Settings, etc.) outside of explicit support preview. Furthermore, the `/ops` console rendered an empty blank page due to a silent unhandled API error.

## 3. Root Cause
- The `ProtectedRoute` component lacked an explicit enforcement rule to isolate `super_admin` users.
- The `Layout.jsx` component rendered customer-centric elements (`NAV_GROUPS`, active site selector, and "Add New Site") unconditionally.
- `Admin.jsx` lacked an explicit error/empty state boundary, so when `loadData` threw an error fetching tenant-isolated data, it crashed silently and failed to toggle the loading state.

## 4. Changes Made
- Added `isSupportPreviewActive()` utility to deterministically parse `sessionStorage.sourcetrack_admin_preview`.
- Updated `ProtectedRoute` in `App.jsx`: `if (getAuthAppRole(user) === 'super_admin' && !isSupportPreviewActive() && pathname !== '/ops') return <Navigate to="/ops" replace />`
- Updated `Layout.jsx`: The site switcher and `NAV_GROUPS` are wrapped in `{role !== 'super_admin' || isSupportPreviewActive() ? (...) : null}`, completely stripping the customer UI for naked operator accounts.
- Updated `Admin.jsx`: Wrapped `loadData` with a robust `try/catch` and added a clean, visual `pageError` state.

## 5. What super_admin sees without support preview
When navigating to any URL, they are forced to `/ops`. The sidebar exclusively contains the "Ops Console" entry under an "Internal" header, plus their email and a "Sign out" button. The customer shell is completely inaccessible.

## 6. What super_admin sees with support preview
If a preview is initiated, `isSupportPreviewActive()` returns true. The operator gains access to the customer shell strictly locked to the previewed `site_id` (enforced by D18D). The Support Preview warning banner displays prominently, and normal customer routes open normally.

## 7. What normal customers see
Normal customers (`role !== 'super_admin'`) bypass the route guard completely and experience the standard application behavior with full site switching.

## 8. `/ops` loading/error/empty state behavior
`/ops` now handles failures gracefully. If an API request fails (e.g. 401/403 or network error), it surfaces an "Access Denied or Failed" error card with a retry button, avoiding silent white screens while keeping actual tokens secure.

## 9. Validation Output
*(Output from qa:static attached below)*
- Backend syntax: PASS
- Frontend build: PASS
- Forbidden copy: PASS
- Security scoping: PASS

## 10. Manual Production Retest Checklist
- [ ] Login as `imubaid93@gmail.com`.
- [ ] Attempt to manually visit `https://app.sourcetrack.ai/dashboard`. Confirm it instantly redirects to `/ops`.
- [ ] Confirm the sidebar only shows "Ops Console" and "Sign out". No active site dropdown.
- [ ] Attempt to load `/ops` and confirm data populates (or a red error card shows, but no blank white screen).
- [ ] Launch a Support Preview from the Ops Console and confirm the customer shell unlocks correctly for that specific site.

## 11. Paid Beta Readiness
Paid beta remains **NOT READY** until manual production validations for D18C, D18D, and D18E are complete.
