# QA Report: Production Google OAuth E2E (Session 140Z-G3-D10)

## Goal
Make production Google OAuth work end-to-end on `https://app.sourcetrack.ai`.

## Code Audit Findings
1. **Frontend Call Sites (`Login.jsx`, `Signup.jsx`)**: The frontend code correctly invokes `supabase.auth.signInWithOAuth()` and passes the option `redirectTo: ${redirectUrl}/auth/callback`.
2. **Auth Callback (`AuthCallback.jsx`)**: The callback code is sound and handles Google's URL parameters to complete the sign-in and redirect to `/onboarding` or `/dashboard`.

## Root Cause
The `invalid_client` error returned by Google during the OAuth flow points exclusively to a provider configuration issue in the Supabase production environment or the Google Cloud console. Specifically, Supabase is sending an invalid client ID or client secret to Google, or Google is rejecting the authorized redirect URI.

No speculative code changes were made because the frontend implementation is correctly routing the OAuth request.

## Required Operator Checklist (BLOCKED)
To resolve this issue, the operator must complete the following configuration steps manually in the production environments:

1. **Google Cloud Console**:
   - Verify that the OAuth app's **Authorized redirect URIs** includes the exact callback URL for the production Supabase project (e.g., `https://<YOUR_PROD_SUPABASE_ID>.supabase.co/auth/v1/callback`).

2. **Supabase Production Dashboard**:
   - Navigate to **Authentication > Providers > Google**.
   - Verify that the **Client ID** exactly matches the one generated in Google Cloud.
   - Verify that the **Client Secret** is valid and not expired.

3. **Supabase Production Dashboard (Redirect URL Allowlist)**:
   - Navigate to **Authentication > URL Configuration**.
   - Ensure the **Site URL** is set to `https://app.sourcetrack.ai`.
   - Ensure the **Redirect URLs** allowlist includes:
     - `https://app.sourcetrack.ai/auth/callback`
     - `https://app.sourcetrack.ai/*` (if wildcard routing is used)

## Testing & Validation Executed
1. **Syntax & Whitespace**:
   - `git diff --check` passed cleanly.
2. **Static QA**:
   - `npm run qa:static` executed and passed cleanly.
3. **Auth Smoke Test**:
   - Executed `scripts/qa-production-auth-smoke.mjs` against `https://app.sourcetrack.ai`. All routes `/login`, `/signup`, `/reset-password`, `/dashboard`, and `/api/health` returned 200 OK.
4. **Browser E2E**:
   - **BLOCKED**: Clicking "Continue with Google" results in `invalid_client`. The operator must resolve the configuration issues listed above to proceed with browser testing.

## Status
- **Code implementation**: PASS (No code changes required)
- **Static & Build QA**: PASS
- **Production Smoke Test**: PASS
- **Operator E2E Verification**: BLOCKED (Pending external configuration)
