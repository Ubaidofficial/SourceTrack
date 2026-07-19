# Deployed Auth + Password Reset Browser E2E Verification — Session 139N-4C

> Date: 2026-06-12
> Method: real browser (Claude in Chrome extension)
> No commits. No pushes. No destructive/mutating actions. No reset submitted (no approved test inbox).

---

## 1. Executive Verdict

```
Production:
BLOCKED — Claude browser tools cannot inspect the production domain.

Staging:
PARTIAL — all reachable auth routes/UI verified PASS in a real browser on staging;
the reset email → link → password update → login E2E is BLOCKED (no test inbox),
and Supabase console settings are BLOCKED (no console access).
```

**Do not read this as production auth E2E passing.** Production was verified only as "deployed and SPA-booting"; its UI could not be inspected. Staging (same commit `3e41f58`) was fully browser-inspected for the static/route behavior of the 139N-4B reset flow, and it is healthy. The password reset **remains a paid-beta blocker** until a real reset email → link → password update → login is verified end-to-end (not achieved this session).

---

## 2. Production Blocked Finding

- Target: `https://sourcetrack-dashboard-production.up.railway.app/login` (manually opened by operator).
- The Claude in Chrome extension **denies every action on the production domain** — navigation AND in-page inspection (`screenshot`, `read_page`, `read_console_messages`, `read_network_requests`, `javascript_tool`, `get_page_text`, `find` all return `Permission denied … on this domain`).
- Only confirmable via tab metadata: open tab URL exactly `…/login`, title `Log in to SourceTrack | SourceTrack` → SPA booted to the login route (weak signal; **contents not inspected**).
- Production deploy is updated (Railway, read-only): Dashboard `5aff21ea` + API `445bbd3d`, both SUCCESS on commit `3e41f58` (139N-4B).
- **Verdict: BLOCKED** — needs the production origin allowlisted for the extension (or human DevTools verification).

---

## 3. Staging URL Tested

`https://sourcetrack-dashboard-staging.up.railway.app` — Dashboard deploy `29ec788b`, SUCCESS @ 2026-06-12 16:02:47 UTC, commit **`3e41f58`** (139N-4B). Same commit as production, so staging is a valid proxy for the deployed reset-flow **code/UX** (not for production's Supabase Auth-URL/SMTP config, which is environment-specific).

---

## 4. Route Matrix (staging, real browser)

| # | Exact URL | Loaded | Console | Network | Redirect | Finding |
|---|---|---|---|---|---|---|
| 1 | `/login` | ✅ PASS | clean (only `chrome-extension://` noise) | all app assets + PostHog 200; no CORS/4xx/5xx | none | Renders login card; **"Forgot password?" link present → `/forgot-password`** |
| 2 | clicked "Forgot password?" | ✅ PASS | clean | — | → `/forgot-password` | In-app link routes correctly |
| 3 | `/forgot-password` | ✅ PASS | clean | — | none | "Reset your password" form: email + "Send reset link" + "Sign in"→/login. Clear copy. |
| 4 | `/reset-password` (no session) | ✅ PASS | clean | — | none | Shows **"No active password reset session found. Please request a new link."** + CTA **"Request a new reset link →"** |
| 5 | `/auth/callback` (no token) | ✅ PASS | no errors/exceptions | — | → `/login` | Does **not** crash; gracefully redirects to login |
| 6 | `/dashboard` (logged out) | ✅ PASS | no errors | — | → `/login` | Correctly redirects unauthenticated users to login |

No React crashes, no broken JS chunks, no Supabase env/config errors, no CORS failures observed on any staging route.

Screenshots: `ss_76031vtb8` (/login), `ss_4363k3vmc` (/forgot-password), `ss_30931scpd` (/reset-password no-session), `ss_4767wv2ru` (/auth/callback → login).

## 5. Console Findings (staging)

Only `chrome-extension://hgdpdmom…/chunk-CoousN1-.js → "Client disconnected"` (browser-extension noise, not app code). **Zero** app errors/warnings, Supabase errors, or CORS errors across all routes. `/auth/callback` and `/dashboard` reported no errors/exceptions.

## 6. Network Findings (staging)

`/login` load: `index-Dy_J9DiE.js` 200, `index-BDAuHQq6.css` 200, `manifest.webmanifest` 200, PostHog `config.js`/`surveys.js` 200, PostHog event POST `us.i.posthog.com/e/` 200, fonts 200. No app 4xx/5xx, no broken chunks, no CORS failures.

## 7. Supabase Auth Request Findings

No reset request was submitted (no approved test inbox; not submitting on deployed email infra without explicit approval). The login page's Supabase client initialized without console/env errors. No `/auth/v1/*` recover/token requests were exercised.

## 8. Forgot-Password UI Finding

`/forgot-password` (title "Reset your password | SourceTrack"): single email field + "Send reset link" primary button + "Remember your password? Sign in" → `/login`. Copy: *"Enter your email address and we'll send you a recovery link to reset your password."* Clear, one obvious action, founder-friendly.

## 9. Reset-Password Route Finding

`/reset-password` with **no recovery session** (title "Create a new password | SourceTrack", heading "Set new password") correctly shows an error panel: *"No active password reset session found. Please request a new link."* with CTA *"Request a new reset link →"*. This matches the expected expired/no-session behavior — it does **not** expose a password field or falsely imply a valid session.

## 10. Reset Email Delivery Result

**BLOCKED — staging test inbox unavailable.** No accessible/approved staging test inbox; reset request not submitted.

## 11. Reset Link / Password Update / Login-After-Reset Result

**BLOCKED / not attempted** — dependent on §10. No password changed; no login performed.

## 12. Dashboard Redirect Result

`/dashboard` while logged out → **redirects to `/login`** (verified). No errors.

## 13. UI/UX Simplicity Findings (staging)

For each auth page — login, forgot-password, reset-password (no-session): **a non-technical founder can understand the page in under 10 seconds**; there is **one obvious next action**; error copy is helpful and non-technical (e.g., "No active password reset session found. Please request a new link."); layout is clean and centered (desktop verified at 1440px; narrow-width not separately tested); buttons/links are obvious; **no scary technical wording**; and the reset-password page **does not overclaim** a valid session before one exists.

## 14. Supabase Console Settings Verification

**BLOCKED — Supabase console verification unavailable.** No Supabase console or Supabase MCP tool is connected (only Railway MCP). Staging Site URL, redirect allowlist (`/reset-password`, `/auth/callback`, `/login`), SMTP/email provider, reset-email template redirect behavior, and email rate limits were **not** verified. (No production/staging secrets dumped.)

## 15. Remaining Blockers

1. **Production**: extension denies all actions on the production origin → production browser QA blocked. (Staging used as a code/UX proxy only.)
2. **Reset email E2E**: no approved staging test inbox → email delivery, reset link redirect, password update, and login-after-reset unverified.
3. **Supabase console**: no console/MCP access → Auth URL allowlist, SMTP, template, rate limits unverified (both envs).

## 16. Recommended Fixes / Next Steps (to unblock — not code changes)

1. Allowlist the **production** origin for the Claude in Chrome extension (or human-verify production with DevTools).
2. Provide a **safe staging test account + accessible inbox** and explicit approval to submit the reset and complete §10–§11.
3. Provide **Supabase console access** (or paste staging + production Auth → URL Configuration and email/SMTP settings, keys redacted) for §14.

No bug found in the inspected staging UI/routes (all expected behaviors held). No code fix proposed.

## 16b. Domain Strategy Note (forward-looking; not a this-session change)

Today both environments use Railway URLs (`…-production…`/`…-staging….up.railway.app`). Production canonical URLs should eventually be **branded**:

```
https://www.sourcetrack.ai/
https://www.sourcetrack.ai/login
https://www.sourcetrack.ai/signup
https://www.sourcetrack.ai/forgot-password
https://www.sourcetrack.ai/reset-password
https://www.sourcetrack.ai/auth/callback
```

Staging should eventually use a branded staging domain:

```
https://staging.sourcetrack.ai/
https://staging.sourcetrack.ai/login
https://staging.sourcetrack.ai/forgot-password
https://staging.sourcetrack.ai/reset-password
https://staging.sourcetrack.ai/auth/callback
```

**Security caveat — staging is NOT private just because the URL is less public.** Protect it with Cloudflare Access, HTTP basic auth, or an IP allowlist; at minimum add `noindex`/robots blocking plus an obscure preview URL. Staging must stay wired **only** to staging resources: staging Supabase, staging API, Stripe **test** mode, staging/dev PostHog project, and staging Auth redirect URLs. When the branded domains are adopted, the Supabase Auth **Site URL + redirect allowlist** (and any CORS/origin allowlists) must be updated to the new hostnames, and this auth/password-reset E2E should be re-run against the branded URLs.

## 17. Final Git Status

Docs-only: this report + a PARTIAL/BLOCKED 139N-4C entry in the control docs. No commit. No push. No passwords, reset links, tokens, OTPs, JWTs, or Supabase keys printed.
