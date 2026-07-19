# Staging Password Reset Email E2E — Session 139N-4D

> Date: 2026-06-12
> Scope: **STAGING ONLY** — https://sourcetrack-dashboard-staging.up.railway.app
> Method: real browser (Claude in Chrome extension) + operator inbox confirmation
> No commits. No pushes. No production. No reset link / password / token printed.

---

## 1. Executive Verdict

**🟢 PASS — staging password reset email E2E passed after Supabase Auth URL configuration fix.**

The flow initially **FAILED**: the request submitted and the Supabase recovery email arrived, but the recovery link redirected to `http://localhost:3000/` (the Supabase project's dev-default **Site URL**) instead of the deployed `/reset-password`, producing a dead "Cannot GET /" page. The root cause was **Supabase Auth URL configuration**, not app code (the app already passes the correct `redirectTo` — see §10).

After the operator applied the staging Supabase Auth URL config fix (Site URL + Redirect URLs allowlist, see §16) and ran a fresh reset, the **full chain passed**: fresh reset email → link landed on staging `/reset-password` → password update → login with the new password → staging `/dashboard` loaded. This **final successful verification was performed manually by the operator** (screenshot evidence: staging dashboard at `https://sourcetrack-dashboard-staging.up.railway.app/dashboard`).

**Scope:** staging only. **Production password reset remains UNVERIFIED.** Paid beta remains **blocked** until production/canonical-domain auth and the remaining P0 blockers are verified.

### Evidence Summary

```txt
Initial failure:
- Reset request submitted: PASS
- Reset email delivered: PASS
- Reset link initially redirected to localhost: FAIL
- Root cause: staging Supabase Auth Site URL / Redirect URLs misconfigured

Config fix:
- Staging Supabase Site URL set to https://sourcetrack-dashboard-staging.up.railway.app
- Staging redirect URLs include /reset-password, /auth/callback, /login, staging wildcard, and localhost dev wildcard
- Staging and production Supabase project redirect URLs are kept separate

Final operator manual verification:
- Fresh reset email after config change: PASS
- Fresh reset link landed on staging /reset-password: PASS
- Password update: PASS
- Login after reset: PASS
- Dashboard route loaded: PASS
```

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
**Initially 🔴 FAIL → 🟢 PASS after config fix.** Before the fix, the reset link opened **`http://localhost:3000/`** with a recovery URL-hash fragment (the hash carried recovery token values — redacted, not reproduced) → on localhost (no server running) it showed **"Cannot GET /"**, not the deployed `/reset-password`. **After** the operator applied the staging Supabase Auth URL config (§16) and generated a fresh reset, the link landed correctly on staging `/reset-password` (operator-verified).

**Root cause (config, not code):**
- The app **already passes the correct redirect**: `ForgotPassword.jsx` calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: \`${window.location.origin}/reset-password\` })` ([dashboard/src/pages/ForgotPassword.jsx:18-19]) — from staging that resolves to `https://sourcetrack-dashboard-staging.up.railway.app/reset-password`.
- Supabase **only honors `redirectTo` if it matches the Auth "Redirect URLs" allowlist.** The staging URL is **not** allowlisted, so Supabase **ignored it and fell back to the project Site URL**, which is set to the dev default **`http://localhost:3000`**.
- The recovery hash itself is well-formed (a recovery-type fragment carrying the token values), and the client has `detectSessionInUrl: true` with a recovery handler in `ResetPassword.jsx` — so once the redirect target is corrected and allowlisted, `/reset-password` will consume the hash and show the new-password form automatically. **No app-code change is required for the redirect.**

## 11. Password Update Result
**🟢 PASS (operator manual verification, post-fix).** With the fresh link landing on staging `/reset-password`, the new-password form accepted the update successfully.

## 12. Login-After-Reset Result
**🟢 PASS (operator manual verification, post-fix).** Login with the new password succeeded.

## 13. Dashboard / Onboarding Route Result
**🟢 PASS (operator manual verification, post-fix).** Post-login landed on staging `/dashboard` (screenshot evidence: `https://sourcetrack-dashboard-staging.up.railway.app/dashboard`).

## 14. Supabase Console / Auth URL / SMTP Verification
- **SMTP/email:** ✅ working (Supabase default sender delivered the email — §9).
- **Auth URL config:** ✅ **fixed (operator-applied).** Was misconfigured (Site URL = `http://localhost:3000`, deployed `/reset-password` missing from the Redirect URLs allowlist). The operator updated the **staging** Supabase project's Site URL + Redirect URLs per §16; the subsequent fresh reset link landed on staging `/reset-password`, confirming the config now honors the app's `redirectTo`. (The change was applied in the Supabase console by the operator — no console/MCP access from the assistant; verified by observed post-fix behavior.)

## 15. UI/UX Simplicity Findings
Auth pages remain clear/simple (login, forgot-password incl. success state, reset-password no-session). The failure is purely the post-email redirect target, which a non-technical user cannot recover from (dead localhost page, no guidance).

---

## 16. 🐛 Bug Found + Fix (RESOLVED on staging)

**Bug:** Password-reset (and any Supabase email-redirect) link pointed to `http://localhost:3000` instead of the deployed app, breaking the reset flow for all users.

**Severity:** P0 for auth. **Status: RESOLVED on staging** (operator applied the config below; full E2E re-verified — see §1/§10–§13). **Production remains unverified** until the same per-project config is confirmed on the production Supabase project.

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
1. **Reset link redirect** (this report): ✅ **RESOLVED** on staging via the Supabase Auth URL config fix; full chain re-verified by the operator (§10–§13).
2. **Production password reset**: still **UNVERIFIED** — browser inspection of the production domain remains denied, and the production Supabase project's Auth URL config has not been verified. The same per-project config (production URLs only in the production project) must be confirmed there.
3. **Secondary latent bug** (§16): `dashboard/src/lib/supabase.js` hardcodes the auth `storageKey` to the production project ref — separate follow-up, not addressed in this session.

## 18. Production Status
**Still NOT verified.** Staging-only result; do not infer production behavior. Paid beta remains blocked until production/canonical-domain auth and the remaining P0 blockers are verified.

## 19. Final Git Status
Docs-only. No app code change (the fix was Supabase Auth config, applied in-console by the operator; final E2E verified manually by the operator). No commit. No push. No reset link / password / token printed.
