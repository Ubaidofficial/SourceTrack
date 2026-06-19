# QA Report: Fix Signup Confirmation Redirect (Session 140Z-G3-D9)

## Goal
Fix signup confirmation redirect so a new user confirmation link routes through the proper auth callback (`/auth/callback`) instead of landing on the public marketing homepage (`/#`). Ensures the confirmation process drops the user into an authenticated state and routes them correctly to `/onboarding`.

## Changes Made
1. **`dashboard/src/contexts/AuthContext.jsx`**: Updated the `signUp` method signature to accept `options`, specifically passing them to `supabase.auth.signUp()`.
2. **`dashboard/src/pages/Signup.jsx`**: Updated the `signUp` invocation to pass `options.emailRedirectTo` using `${import.meta.env.VITE_FRONTEND_URL || window.location.origin}/auth/callback`.

## Safety & Scope Constraints Verified
- ✅ **Google OAuth**: Untouched.
- ✅ **Reset Password**: `ResetPassword.jsx` and D8 fallback changes untouched.
- ✅ **Billing / Pricing**: Untouched.
- ✅ **Onboarding UI**: Untouched.
- ✅ **No Secret / PII Leakage**: Explicit grep checks confirm no exposure of real email addresses, auth token values, cookie values, or raw confirmation links.

## Testing & Validation Executed
1. **Syntax & Whitespace**:
   - `git diff --check` passed cleanly.
2. **Static QA**:
   - `npm run qa:static` executed and passed cleanly.
3. **Frontend Build**:
   - `npm run build` completed successfully.
4. **Auth Smoke Test**:
   - Executed `scripts/qa-production-auth-smoke.mjs` against `https://app.sourcetrack.ai`. All routes `/login`, `/signup`, `/reset-password`, `/dashboard`, and `/api/health` returned 200 OK.

## Blocked / Pending Validation
- ⚠️ **Deployed Browser E2E**: This change requires deployment to production for browser E2E verification by an operator using a fresh test email inbox to ensure that clicking the actual confirmation link opens through the deployed `/auth/callback`, establishing a valid session and routing to `/onboarding`.

## Status
- **Code implementation**: PASS
- **Static & Build QA**: PASS
- **Production Smoke Test**: PASS
- **Operator E2E Verification**: PENDING (Deployed-verification pending status)
