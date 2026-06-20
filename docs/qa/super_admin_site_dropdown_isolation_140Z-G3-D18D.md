# Super Admin Site Dropdown Isolation (D18D)

## 1. Issue Found
During manual verification in production, it was discovered that `super_admin` users, upon bypassing the onboarding screen and entering the normal customer app shell (e.g. `/dashboard` or `/settings`), were presented with a global site dropdown containing every customer site in the database. Furthermore, normal customer app UI features (such as "Plan: Free" or other billing UI) incorrectly rendered as if the operator was a customer owner of those sites.

## 2. Root Cause
The `api/routes/sites.js` endpoint originally contained a global override `if (req.user.role === 'super_admin') { return all_sites }`. Because the frontend `SiteContext.jsx` unconditionally fetched `/api/sites` to populate the `sites` array, the frontend effectively loaded all customer sites into the global UI switcher anytime an operator navigated to the normal customer routes, entirely bypassing the intended Support Preview isolation.

## 3. Changed Behavior
- **Backend (/api/sites):** Removed the global `super_admin` override from `api/routes/sites.js`. The `/api/sites` endpoint now strictly respects standard tenancy rules (`company_id` or `owner_id`). For a `super_admin` (who typically owns no sites directly), it will correctly return an empty array, preventing the frontend from populating a global list.
- **Frontend (SiteContext.jsx):** Added defensive isolation for Support Preview mode. If `sessionStorage.sourcetrack_admin_preview` is active, `SiteContext` explicitly overrides the fetched sites array to contain *only* the single previewed site.
- **Result:** `super_admin` users can now only discover customer sites from the protected `/ops` console. When they launch a support preview, the normal app shell locks strictly to that single site and continues to display the Support Preview warning banner. The global site dropdown is suppressed.

## 4. What Remains Manually Blocked
Manual testing must confirm that:
1. Super admins natively land on `/ops`.
2. Super admins see zero customer domains in the standard UI (unless explicitly using support preview from `/ops`).
3. Support preview locks the app context to one site without allowing casual switching.

## 5. Paid Beta Readiness
Paid beta remains **NOT READY** until this manual verification passes and pending D17 Stripe tests are resolved.
