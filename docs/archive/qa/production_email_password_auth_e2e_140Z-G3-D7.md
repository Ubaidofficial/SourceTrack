# Production Email/Password Auth E2E Verification (D7)

**Verdict:** `PARTIAL PASS`

## Preflight Checks
- **D6 Commit:** Confirmed and CI green.
- **Account:** Using the confirmed operator test account created during D6.
- **Domain:** `https://app.sourcetrack.ai`
- **Validation Note:** Production auth smoke PASS from operator local machine: /login, /signup, /reset-password, /dashboard returned 200 and https://api.srctk.com/api/health returned status=ok. Earlier Antigravity container fetch failed is treated as environment-specific and superseded by operator-local PASS.

## 1. Normal Login & Authenticated App Persistence
- **Navigated to `/login`:** ✅ Yes
- **Operator Logged In:** ✅ Yes
- **Final URL after login:** ✅ `/onboarding` (Expected behavior for a new, incomplete account)
- **Onboarding Loads Authenticated:** ✅ Reached `/onboarding` authenticated. Treat as PASS for new account.
- **Session Persists after Refresh:** ✅ Yes, verified by operator.
- **Sign Out & Redirect state:** ✅ PASS (Operator clicked Log out, verified logged-out state, and confirmed `/dashboard` and `/onboarding` correctly block access via auth guards).

## 2. Password Reset Flow
- **Navigated to `/forgot-password`:** ✅ PASS
- **Reset Request Submitted:** ✅ PASS
- **Reset Link Opened in Browser:** ✅ PASS
- **Landed on `/reset-password` w/ Session:** ✅ PASS (Functional)
- **Password Update Success:** ✅ PASS (Operator confirms update works)
- **Login-after-reset:** ✅ PASS (Operator confirms login works)
- **Authenticated App Loads after Reset:** ✅ PASS
- **Reset UI Warning (BUG):** ❌ FAIL. Page displays "This password reset link is invalid or has expired" even when the recovery session is usable.

## 3. Findings
- **Reset UI False Error Bug:** Inspected `ResetPassword.jsx`. If a hash-based recovery link is used, a 3000ms fallback timeout is set to display the invalid/expired error. However, the timeout is **never cleared** when `onAuthStateChange` successfully detects the session. Thus, exactly 3 seconds after page load, the error appears unconditionally while the form remains usable.
- **Signup Redirect Bug (D6):** Kept separate. `Signup.jsx` lacks `emailRedirectTo` and confirmation lands on public root.
- **Google OAuth:** Kept separate, not tested here.
