# Ops Console Visual QA & Data Consistency Retest (140Z-G3-D18G)

## Final Verdict
**PARTIAL PASS** — The code fixes are ready and validate locally. However, manual production validation is still required for the final verdict. **Paid beta remains NOT READY.**

## Production Issues Observed
1. **Dark Mode Readability:** Table rows in dark mode were rendering with light backgrounds (`bg-gray-50`) causing unreadable text. Tab active states lacked contrast.
2. **Members Count Clarification:** The top metric card showed 0 members, while the Companies table showed 67 members.
3. **Sites & Preview Flow:** Necessary to verify raw key safety and strict `sessionStorage` hygiene.

## What Changed
1. **Users Endpoint Fix (`/api/admin/users`):**
   - **Root Cause:** The `users` endpoint had the exact same embedded Supabase relation bug as the `sites` endpoint (`companies (name)`). This caused it to silently fail (return 500). The recent `Promise.allSettled` addition caught the failure, but caused the array to be set to `[]`, hence `0` users displayed.
   - **Fix:** Rewrote `/api/admin/users` defensively. Removed the embedded foreign key and added manual `company_id` collection and mapping to safely append company names without crashing.
2. **Visual & Dark Mode Fixes (`Admin.jsx`):**
   - Replaced static light-mode hover and border classes with strict dark-mode overrides (`dark:hover:bg-[#1A1D1D]`, `dark:border-[#252929]`).
   - Ensured text contrast (`dark:text-white`, `dark:text-gray-300`).
   - Improved active tab contrast (`dark:border-white dark:text-white`).

## Manual Retest Requirements (Operator Checks)

### 1. Tab & Network State
- **Companies Tab:** Ensure table renders, contrast is correct in dark mode.
- **Members Tab:** Confirm `/api/admin/users` now returns status 200. Confirm the list populates and top metric card reflects the true member count, matching member aggregates.
- **Sites Tab:** Confirm safe response shape. Ensure `site_key` is redacted (`site_key_redacted`). No raw keys exposed in the browser payload.

### 2. Support Preview Flow
- Click Preview on a customer site.
- Confirm Support Preview Banner is visible.
- Sidebar must show a locked single-site label (no dropdown).
- `sessionStorage.sourcetrack_admin_preview` must contain only `site_id`, `site_name`, and `site_domain`.
- Exit preview and confirm clean redirect back to `/ops`.
- Manually visit `/dashboard` and verify you are redirected back to `/ops` (naked operator rule).

## Remaining Blockers
- **Manual Verification:** Need the user to execute the above browser checks in production post-deploy.
- **Paid Beta:** Still not ready until the production Ops console is fully cleared.
