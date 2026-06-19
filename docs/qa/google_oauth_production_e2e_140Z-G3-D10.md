# QA Report: Production Google OAuth E2E (Session 140Z-G3-D10)

## Goal
Make production Google OAuth work end-to-end on `https://app.sourcetrack.ai`.

## Findings: PKCE Callback Race Condition (Code Bug)
During investigation of why Google OAuth continually returned users to `/login` despite correct provider configurations, a severe code bug was identified in `dashboard/src/pages/AuthCallback.jsx`.

**The exact failure point in the OAuth chain:**
1. User clicks "Continue with Google" -> Google Login -> Redirects to Supabase callback -> Redirects to `https://app.sourcetrack.ai/auth/callback` with an OAuth code query parameter present.
2. The `@supabase/supabase-js` library (configured with `detectSessionInUrl: true`) automatically intercepts the OAuth code query parameter and performs a background API request to exchange the PKCE code for a session.
3. Simultaneously, `AuthCallback.jsx` executed a `useEffect` hook that explicitly checked for the code, extracted it, and manually called `supabase.auth.exchangeCodeForSession(code)`.
4. Because PKCE OAuth codes can only be exchanged once, one of these two requests fails (usually the manual one in `AuthCallback.jsx`).
5. When the manual exchange failed, `AuthCallback.jsx` set an error state and scheduled a timeout `setTimeout(() => navigate('/login'), 3000)`.
6. Furthermore, `AuthCallback.jsx` used an early `return` inside the code check block. Because `supabase-js` does not strip the OAuth code query parameter from the browser URL automatically, every time `AuthContext` resolved the session and triggered a re-render, `AuthCallback` would re-read the dead code parameter, re-attempt the exchange, fail again, and repeatedly schedule the redirect to `/login`.

## Resolution
- **Removed Manual Exchange**: The `exchangeCodeForSession()` call was completely removed from `AuthCallback.jsx`. The application now fully relies on `supabase-js` to handle the URL token hydration, which happens automatically during the initial `AuthContext` `getSession()` call.
- **Bounded Session Wait**: Implemented a 5-second bounded wait. If an OAuth code or hash token is present in the URL, `AuthCallback.jsx` now explicitly waits up to 5 seconds for `supabase-js` to establish the session and update the `user` state. If the initial `AuthContext.loading` becomes false before the session is ready, the callback will safely hold until either the session appears or the timeout is reached. This prevents a race condition where a slightly delayed network hydration caused a premature redirect to `/login`.
- **Added Explicit Error Handling**: `AuthCallback.jsx` now correctly parses and surfaces URL errors (e.g. `?error=access_denied`) returned by Google or Supabase before falling back to `/login`.
- **Root Cause Classification**: **Callback code (PKCE race condition & premature timeout)**.

## Testing & Validation Executed
1. **Syntax & Whitespace**:
   - `git diff --check` passed cleanly.
2. **Static QA**:
   - `npm run qa:static` executed and passed cleanly.
3. **Auth Smoke Test**:
   - Executed `scripts/qa-production-auth-smoke.mjs` against `https://app.sourcetrack.ai`. All routes returned 200 OK.
4. **Browser E2E**:
   - Operator should re-verify on production after this code fix is deployed.

## Status
- **Code implementation**: PASS (PKCE race condition fixed)
- **Static & Build QA**: PASS
- **Production Smoke Test**: PASS
- **Operator E2E Verification**: PENDING (Deployed verification needed)
