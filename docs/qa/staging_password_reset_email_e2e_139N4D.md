# Staging Password Reset Email E2E — Session 139N-4D

> Date: 2026-06-12
> Scope: **STAGING ONLY** — https://sourcetrack-dashboard-staging.up.railway.app
> Method: real browser (Claude in Chrome extension) + operator inbox confirmation
> No commits. No pushes. No production. No reset link / password / token printed.

---

## 1. Executive Verdict

**🔴 FAIL — reset link redirects to a misconfigured Site URL (`http://localhost:3000`); Supabase Auth URL configuration must be fixed.**

The full chain works up to email delivery: the request submits, Supabase sends the recovery email, and it arrives. **But the recovery link redirects to `http://localhost:3000/` with a recovery URL-hash fragment** (token values redacted) — i.e. the Supabase project's dev-default **Site URL** — instead of the deployed `/reset-password`. On localhost (nothing running) the user gets **"Cannot GET /"**, so the reset cannot be completed. This is a **Supabase Auth configuration bug**, not an app-code bug (the app already passes the correct `redirectTo` — see §10). Password update / login-after-reset could not proceed.

**Production password reset remains UNVERIFIED.** Paid beta is **not** ready.

---

## 2. Commit / CI Preflight

- Local `HEAD`: `8858daf Session 139N-4C — Record deployed auth E2E blocker`. CI green. Staging on `3e41f58` (139N-4B).

## 3. Staging URL Tested

`https://sourcetrack-dashboard-staging.up.railway.app` — confirmed exact host before submit (`isStaging:true, isProduction:false`).

## 4. Test Account Handling

Approved staging test account: `imubaid93@gmail.com` (operator-approved, staging only). No password created/printed. The recovery email/link contained live tokens — **redacted, not reproduced, not used; self-expires ~1h.**

## 5. Route Matrix (staging, real browser)

| Route | Loaded | Console | Finding |
|---|---|---|---|
| `/login` | ✅ PASS | clean | "Forgot password?" → `/forgot-password` |
| `/forgot-password` | ✅ PASS | clean | Reset form; submit → success state |
| `/reset-password` (no session) | ✅ PASS | clean | "No active password reset session found…" + CTA |
| `/dashboard` (logged out) | ✅ PASS | no errors | → `/login` |

Screenshots: `ss_5408u0hfm`, `ss_81934nwr7`, `ss_1273enqft`, `ss_36910buqv` (forgot-password success).

## 6. Console Findings
Only `chrome-extension://` noise; zero app/Supabase/CORS errors, incl. after submit.

## 7. Network Findings
`/login` assets 200. Reset submit emitted a PostHog event (200); the cross-origin Supabase `/auth/v1/recover` XHR was not individually surfaced by the panel, but resolved to success with no CORS/console/env errors.

## 8. Reset Request Result
**✅ PASS.** Submit (via keystroke entry) produced "Check your inbox for a password reset link." No error state.

## 9. Email Delivery Result
**✅ PASS.** Operator confirmed: a "Reset your password" email from **Supabase Auth `<noreply@mail.app.supabase.io>`** arrived within ~1 minute, with a "Reset password" link. (So Supabase's default email delivery works on staging.)

## 10. Reset Link Redirect Result
**🔴 FAIL.** The reset link opens **`http://localhost:3000/`** with a recovery URL-hash fragment (the hash carried recovery token values — redacted, not reproduced) → on localhost (no server running) it shows **"Cannot GET /"**. It does **not** land on the deployed `/reset-password`.

**Root cause (config, not code):**
- The app **already passes the correct redirect**: `ForgotPassword.jsx` calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/reset-password\` })` ([dashboard/src/pages/ForgotPassword.jsx:18-19]) — from staging that resolves to `https://sourcetrack-dashboard-staging.up.railway.app/reset-password`.
- Supabase **only honors `redirectTo` if it matches the Auth "Redirect URLs" allowlist.** The staging URL is **not** allowlisted, so Supabase **ignored it and fell back to the project Site URL**, which is set to the dev default **`http://localhost:3000`**.
- The recovery hash itself is well-formed (a recovery-type fragment carrying the token values), and the client has `detectSessionInUrl: true` with a recovery handler in `ResetPassword.jsx` — so once the redirect target is corrected and allowlisted, `/reset-password` will consume the hash and show the new-password form automatically. **No app-code change is required for the redirect.**

## 11. Password Update Result
**🔴 BLOCKED by §10** — never reached a valid `/reset-password` recovery session.

## 12. Login-After-Reset Result
**🔴 BLOCKED by §10** — no new password set.

## 13. Dashboard / Onboarding Route Result
**Not reached** (blocked by §10).

## 14. Supabase Console / Auth URL / SMTP Verification
- **SMTP/email:** ✅ working (Supabase default sender delivered the email — §9).
- **Auth URL config:** ❌ **misconfigured** — inferred from observed behavior: **Site URL = `http://localhost:3000`** and the deployed `/reset-password` URLs are **missing from the Redirect URLs allowlist**. (Direct console read remains BLOCKED — no Supabase console/MCP; this is inferred from the redirect target, not read from the dashboard.)

## 15. UI/UX Simplicity Findings
Auth pages remain clear/simple (login, forgot-password incl. success state, reset-password no-session). The failure is purely the post-email redirect target, which a non-technical user cannot recover from (dead localhost page, no guidance).

---

## 16. 🐛 Bug Found + Required Fix

**Bug:** Password-reset (and any Supabase email-redirect) link points to `http://localhost:3000` instead of the deployed app, breaking the reset flow for all users.

**Severity:** P0 for auth — password reset is unusable in any deployed environment until fixed. Paid-beta blocker.

**Fix — per Supabase project (operator action; no app deploy needed). Staging and production are SEPARATE Supabase projects; do NOT mix their redirect URLs.**

This failure is on the **staging** Supabase project (`nrsvpwzekfrdrzkoecfk`). In its Dashboard → Authentication → URL Configuration set **only staging URLs**:

- **Site URL:** `https://sourcetrack-dashboard-staging.up.railway.app`
- **Redirect URLs:**
  - `https://sourcetrack-dashboard-staging.up.railway.app/reset-password`
  - `https://sourcetrack-dashboard-staging.up.railway.app/auth/callback`
  - `https://sourcetrack-dashboard-staging.up.railway.app/login`
  - `https://sourcetrack-dashboard-staging.up.railway.app/**`
  - `http://localhost:3000/**` (local dev)
  - Later, after branded domains: `https://staging.sourcetrack.ai/**`

With these allowlisted, the app's existing `redirectTo` (`…/reset-password`) is honored and the link lands on the correct staging page.

**Production belongs ONLY in the production Supabase project** (a different project from staging): Site URL = the production dashboard URL, Redirect URLs = `https://www.sourcetrack.ai/**` (and the production Railway host if still used). **Do not add production URLs to the staging project, or staging URLs to the production project.**

**Affected app files:** none required for the redirect. (`ForgotPassword.jsx` already correct; `ResetPassword.jsx` + `supabase.js` `detectSessionInUrl:true` already consume the recovery hash.)

**Secondary latent bug (recommend separate fix, NOT changed this session):** `dashboard/src/lib/supabase.js` hardcodes `storageKey: 'sb-zxjjjsipafojhzkkumvh-auth-token'` — the **production** project ref — while staging connects to the **staging** project (`nrsvpwzekfrdrzkoecfk`, per the recovery token issuer). Same-browser staging+prod sessions share one storage key and can clobber each other. Recommend deriving the storageKey per `VITE_SUPABASE_URL` ref (or distinct keys per env). Out of scope for this redirect fix.

---

## 17. Remaining Blockers
1. **Reset link redirect** (this report): Supabase Site URL + Redirect allowlist must be fixed (operator/console). Then re-run §10–§13.
2. **Supabase console access**: still unavailable to the assistant (settings can't be changed here).
3. **Production**: browser inspection still denied → production reset unverified.

## 18. Production Status
**Still NOT verified.** Staging-only; do not infer production behavior.

## 19. Final Git Status
Docs-only. No code change (the fix is Supabase Auth config). No commit. No push. No reset link / password / token printed.
