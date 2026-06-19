# Deployed Production Auth E2E Verification (D6)

**Verdict:** `BLOCKED`

## Preflight Checks
- **D5 Commit:** Confirmed (`4a75012 Session 140Z-G3-D5 — Fix production auth redirect handling`)
- **D5 CI/Deploy:** Confirmed green and deployed.
- **Production Domains:** `https://app.sourcetrack.ai` and `https://api.srctk.com`

## Signup E2E
- **Account Existence:** PASS — the operator test account was created and is confirmed in the production Supabase Auth project (`confirmed_at` is populated).
- **Signup Confirmation Redirect:** ❌ Failed. The browser landed on `https://app.sourcetrack.ai/#` displaying the marketing homepage, instead of `/login`, `/auth/callback`, or `/dashboard`.
- **Signup Redirect URL Observed:** `https://app.sourcetrack.ai/#` showed the public marketing homepage after confirmation. Later browser state was `https://app.sourcetrack.ai/forgot-password` after operator navigation.
- **Auth Session Exists After Confirmation Redirect:** No. A localStorage check confirmed no Supabase auth token was present; token values were not printed.
- **Root Cause Audit:** `dashboard/src/pages/Signup.jsx` fails to pass the `emailRedirectTo: \`${redirectUrl}/auth/callback\`` option to `supabase.auth.signUp()`. This directs the confirmation link to the Supabase project's default Site URL (`/`) rather than `/auth/callback`. The SPA Router catches `/` and renders the public `Landing` page, failing to parse or establish the session.

## Password Reset E2E
- **Reset Request Submitted:** Yes, operator submitted a request via UI using the submitted operator email.
- **Account Existence:** Initially missing, but now a confirmed test account exists.
- **Email Delivery Result:** Pending rerun on known-existing account.
- **Reset Link Result:** Pending
- **Reset Form/Session Result:** Pending
- **Password Update Result:** Pending
- **Login-after-reset Result:** Pending

## Normal Login & Dashboard
- **Dashboard Authenticated Load:** Pending
- **Session Persistence After Refresh:** Pending
- **Sign-out Result:** Pending

## Google OAuth
- **Google OAuth Result:** Pending

## Logs and Diagnostics
- **Browser Console Findings:** Clean. No auth/callback or parsing errors logged in the console.
- **Network Findings:** The earlier `/recover` request returned `200`; signup request succeeded. No secrets, tokens, or private email contents were recorded.
- **Supabase Auth Findings:** The test account exists and `confirmed_at` is populated.

## Remaining Blockers
- **Blocker 1:** Signup Confirmation Redirect UX Bug — `Signup.jsx` must be fixed to pass `emailRedirectTo` so the callback parses the session. (This does not block testing the known-existing user login/reset flow).
- **Blocker 2:** Operator needs to test login with the confirmed email/password. If it succeeds, run forgot password to verify email delivery.
- **Blocker 3:** Google OAuth provider configuration may still be broken (`invalid_client`), which needs separate verification.

## Git Status
```text
 M SESSION_HANDOFF.md
 M SESSION_LOG.md
 M SESSION_STATE.md
 A docs/qa/deployed_production_auth_e2e_140Z-G3-D6.md
```
