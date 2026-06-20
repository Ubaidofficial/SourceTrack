# Production Ops Console Access Verification (D18C)

## 1. Final verdict
**BLOCKED** (Pending manual verification by Ubaid)

## 2. Production operator account verification status
- **Requirement:** Confirm a real production operator user exists in Supabase Auth with `raw_app_meta_data.role = "super_admin"`.
- **Status:** **PENDING MANUAL VERIFICATION**.

## 3. `/ops` access result for super admin
- **Requirement:** Confirm login at `https://app.sourcetrack.ai/login` as super admin redirects to `/ops` and successfully renders the Ops Console.
- **Status:** **PENDING MANUAL VERIFICATION**. (Previously failed due to role metadata shape mismatch and OAuth callback hardcoded dashboard redirect; fixed in D18C-Fix by using a `getAuthAppRole` helper and routing to `/ops`).

## 4. `/ops` denial result for normal user
- **Requirement:** Confirm a normal customer account cannot access `/ops`.
- **Status:** **PENDING MANUAL VERIFICATION**. (Expected behavior: Frontend should block access and redirect to dashboard or login; backend APIs will reject with 403 Forbidden).

## 5. `/admin` no-console result
- **Requirement:** Confirm `/admin` no longer renders the console.
- **Status:** **PENDING MANUAL VERIFICATION**. (Expected behavior: 404 Page Not Found or fallback layout).

## 6. Security notes
Route hiding (moving `/admin` to `/ops`) is strictly for noise reduction to prevent automated bots and opportunistic scanners from blindly hitting common paths. It is **not** the security boundary. True security remains strictly enforced on the server. No customer JWTs are minted for the console, no customer session impersonation is allowed, and all backend API endpoints (`/api/admin/*`) unconditionally require the `super_admin` role via server-side checks.

## 7. Evidence captured
- **Role metadata shape mismatch and OAuth callback hardcoded dashboard redirect fixed:** `getAuthAppRole` helper implemented across `AuthContext.jsx`, `App.jsx`, `Login.jsx`, `AuthCallback.jsx`, and `user-auth.js` defensively checks `user.app_metadata?.role || user.raw_app_meta_data?.role` and redirects to `/ops` for super admins.
- *Additional evidence will be captured after Ubaid performs the manual verification.*

## 8. Remaining blockers
- Manual completion of steps 1 through 7 in production.
- Finalization of the Stripe live billing readiness tests (D17).

## 9. Paid beta readiness
Paid beta remains **NOT READY** unless all release gates are closed and verified.
