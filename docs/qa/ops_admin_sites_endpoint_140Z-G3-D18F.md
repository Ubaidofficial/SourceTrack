# Ops Console Admin Sites Endpoint Fix (D18F)

## 1. Issue Overview
The `/api/admin/sites` endpoint was crashing in production because of the `companies (name)` embedded relation in the Supabase query. This caused `Promise.all` inside `Admin.jsx`'s `loadData` to throw an error, taking down the entire Ops Console (`/ops`) with a generic "Access Denied or Failed" message.

## 2. Requirements Met
- **Safe Query Execution:** Rewrote the Supabase query to only select primitive columns from the `sites` table. Removed the fragile foreign key embedding for `companies`.
- **Manual Enrichment:** Explicitly gathered unique `company_id`s, queried the `companies` table, and built an in-memory map to enrich the results without relying on potentially brittle foreign keys.
- **Resilient Identity Fetching:** Owner emails are mapped best-effort via `auth.admin.getUserById`. If it throws, the endpoint safely catches it and defaults to using `owner_id`.
- **Security Maintained:** Raw `site_key` is completely omitted from the payload. Only the first 8 characters (`site_key_redacted`) are sent over the wire.
- **Frontend Fallbacks:** Changed `Promise.all` to `Promise.allSettled` in `Admin.jsx`. This ensures that even if `/api/admin/sites` fails in the future, the Companies and Users tabs remain fully functional.
- **Granular Error State:** If `/api/admin/sites` fails, the frontend now renders a localized red error banner inside the Sites card rather than blowing up the entire page.

## 3. Validation
- **Static Analysis:** Backend syntax and frontend build tests pass cleanly.
- **Security Check:** No raw `site_key` or API keys exposed.
- **Auth Smoke Test:** Evaluates all frontend entry paths effectively.

## 4. Final Verdict
**PARTIAL PASS** — Ready for manual production retest. While static and smoke tests pass locally, the true resolution of this issue requires verifying that the actual production environment successfully resolves the `/api/admin/sites` endpoint inside the `/ops` console after deploy.
