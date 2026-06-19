# Staging Auth E2E Baseline Verification
## Session: 140Z-G3-D0-A5

**Date:** 2026-06-19
**Branch:** main
**Status:** PASS with recovery-token fixture; inbox email delivery not verified. Google OAuth BLOCKED (provider not enabled in staging Supabase)
**Staging Frontend:** `https://sourcetrack-dashboard-staging.up.railway.app`
**Staging API:** `https://sourcetrack-api-staging.up.railway.app`
**Staging Supabase Ref:** `nrsvpwzekfrdrzkoecfk`

---

## Executive Verdict

| Flow | Result |
|---|---|
| Auth route smoke (script) | 🟢 PASS |
| `/login` — DOM, form, console | 🟢 PASS |
| `/signup` — DOM, form, console | 🟢 PASS |
| `/forgot-password` — DOM, form, console | 🟢 PASS |
| `/reset-password` (no session) — guard message | 🟢 PASS |
| `/dashboard` (unauthenticated) → redirect to `/login` | 🟢 PASS |
| `/auth/callback` (no token) → redirect to `/login` | 🟢 PASS |
| Recovery request POST (`/recover`) → 200, canonical `redirect_to` | 🟢 PASS |
| Recovery token redirects to `/reset-password` | 🟢 PASS via Supabase MCP fixture (inbox not used) |
| Password update — "Password updated successfully" | 🟢 PASS |
| Login after reset → `/dashboard` loads authenticated | 🟢 PASS |
| Real email delivery / inbox link click | 🟡 NOT VERIFIED — token retrieved via MCP SQL, inbox not tested |
| Sign out → `/login` | 🟢 PASS |
| Google OAuth initiation | 🔴 BLOCKED — provider not enabled in staging Supabase |
| API health `/api/health` | 🟢 PASS |

---

## Task A — Auth Smoke Route Test (Script)

**Command run:**
```
AUTH_SMOKE_BASE_URL=https://sourcetrack-dashboard-staging.up.railway.app \
SOURCETRACK_API_URL=https://sourcetrack-api-staging.up.railway.app \
node scripts/qa-production-auth-smoke.mjs
```

**Result:**
```
✅ GET /login is reachable and SPA is loaded (Status: 200)
✅ GET /signup is reachable and SPA is loaded (Status: 200)
✅ GET /reset-password is reachable and SPA is loaded (Status: 200)
✅ GET /dashboard is reachable and SPA is loaded (Status: 200)
✅ GET /api/health is online: status=ok, request_id=291c8cf7-...
✅ PASS — All frontend routes and API health check passed.
```

---

## Task B — Browser Route Verification (DOM + Console + Network)

### B1 — `/login`
- **Title:** "Log in to SourceTrack | SourceTrack"
- **Domain:** stays on `sourcetrack-dashboard-staging.up.railway.app`
- **DOM:** `<h1>SourceTrack</h1>`, "Sign in to your account", email/password fields, "Continue with Google" button, "Forgot password?" link → `/forgot-password`, "Sign up" link → `/signup`
- **Console:** Only browser accessibility warnings (autocomplete attribute suggestion, form label issues). No JS errors. No CORS errors.
- **Network:** Supabase URL is `nrsvpwzekfrdrzkoecfk.supabase.co` (staging). All assets 200/304.
- **Result:** 🟢 PASS

### B2 — `/signup`
- **Title:** "Start free with SourceTrack | SourceTrack"
- **Domain:** stays on `sourcetrack-dashboard-staging.up.railway.app`
- **DOM:** `<h1>SourceTrack</h1>`, "Create your account", email/password fields, "Sign up with Google" button, "Sign in" link → `/login`
- **Console:** Only accessibility warnings. No JS errors.
- **Result:** 🟢 PASS

### B3 — `/forgot-password`
- **Title:** "Reset your password | SourceTrack"
- **DOM:** `<h1>SourceTrack</h1>`, "Reset your password", email field, "Send reset link" button, "Sign in" link → `/login`
- **Console:** Only accessibility warnings. No JS errors.
- **Result:** 🟢 PASS

### B4 — `/reset-password` (no active recovery session)
- **Title:** "Create a new password | SourceTrack"
- **DOM:** "Set new password", error message: "No active password reset session found. Please request a new link.", "Request a new reset link →" CTA → `/forgot-password`
- **Console:** No errors.
- **Result:** 🟢 PASS — Guard renders correctly, no crash.

### B5 — `/dashboard` (unauthenticated)
- **Navigate to:** `https://sourcetrack-dashboard-staging.up.railway.app/dashboard`
- **Final URL:** `https://sourcetrack-dashboard-staging.up.railway.app/login`
- **Result:** 🟢 PASS — Unauthenticated user correctly redirected to `/login` by `ProtectedRoute` guard.

### B6 — `/auth/callback` (no token)
- **Navigate to:** `https://sourcetrack-dashboard-staging.up.railway.app/auth/callback`
- **Final URL:** `https://sourcetrack-dashboard-staging.up.railway.app/login`
- **Console:** No JS errors.
- **Result:** 🟢 PASS — No-token callback correctly redirects to `/login` without crashing.

---

## Task C — Staging Password Reset Recovery Flow (Token Fixture)

> **Scope note:** The recovery token was retrieved via a read-only Supabase MCP SQL query on `auth.users`, not by receiving or clicking the actual recovery email in an inbox. The steps below verify that the app code correctly handles the Supabase verify redirect and the `/reset-password` session hash. Real inbox email delivery is **NOT VERIFIED** in this session.

### C1 — Reset Request
- **Action:** Navigated to `/forgot-password`, filled in `[operator-test-email]`, clicked "Send reset link".
- **Network:** `POST https://nrsvpwzekfrdrzkoecfk.supabase.co/auth/v1/recover?redirect_to=https%3A%2F%2Fsourcetrack-dashboard-staging.up.railway.app%2Freset-password` → **200 OK**
- **redirect_to param:** `https://sourcetrack-dashboard-staging.up.railway.app/reset-password` ✅ (staging canonical; no localhost/Railway placeholders)
- **UI:** Transitions to "Check your inbox for a password reset link." success state ✅
- **Result:** 🟢 PASS

### C2 — Recovery Token Retrieval and Verification
- **Method:** Recovery token retrieved via Supabase MCP SQL on staging `auth.users` (read-only query). No secret exposed in logs.
- **Recovery link navigated:** `https://nrsvpwzekfrdrzkoecfk.supabase.co/auth/v1/verify?token=[REDACTED]&type=recovery&redirect_to=https://sourcetrack-dashboard-staging.up.railway.app/reset-password`
- **Final URL:** `https://sourcetrack-dashboard-staging.up.railway.app/reset-password#access_token=[REDACTED JWT]&type=recovery`
- **Supabase verify redirected:** ✅ To staging `/reset-password` with `access_token` and `type=recovery` in the URL hash.
- **Result:** 🟢 PASS via Supabase MCP fixture — real inbox email delivery not verified

> **Note on token consumption:** A prior JS-injection attempt consumed the first recovery token. A fresh token was requested immediately after, and the final verification used that fresh token only once. The session data was cleared at sign-out.

### C3 — Password Update Form
- **DOM at `/reset-password` with active session hash:** Shows "Set new password" heading + "New Password" + "Confirm New Password" form fields + "Update password" button
- **Action:** Filled in new password, clicked "Update password".
- **UI response:** "Password updated successfully. You can now sign in with your new password." + "Go to Sign In" button
- **Result:** 🟢 PASS

### C4 — Login After Reset
- **Action:** Clicked "Go to Sign In" → landed on `/login`. Entered `[operator-test-email]` and new password, clicked "Sign in".
- **Final URL:** `https://sourcetrack-dashboard-staging.up.railway.app/dashboard`
- **DOM:** Full authenticated dashboard renders. Sidebar shows user email, site switcher (qa-139id-browser.example.com), nav links (Setup, Dashboard, Analytics, Attribution, All Leads, Campaigns, Report Builder, Integrations, Settings), "Sign out" button.
- **Result:** 🟢 PASS

### C5 — Sign Out
- **Action:** Clicked "Sign out" button in sidebar.
- **Final URL:** `https://sourcetrack-dashboard-staging.up.railway.app/login`
- **Result:** 🟢 PASS

---

## Task D — Staging Google OAuth E2E

- **Action:** On `/login`, clicked "Continue with Google" button.
- **Browser navigated to:** `https://nrsvpwzekfrdrzkoecfk.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fsourcetrack-dashboard-staging.up.railway.app%2Fauth%2Fcallback`
- **Response:** `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`
- **Root cause:** Google OAuth provider is **not configured / not enabled** in the staging Supabase project (`nrsvpwzekfrdrzkoecfk`). The "Continue with Google" button is rendered in the UI but the backend provider is not set up.
- **Result:** 🔴 BLOCKED — Google OAuth is not enabled in staging Supabase

**Operator action required:** Supabase Dashboard → staging project `nrsvpwzekfrdrzkoecfk` → Authentication → Providers → Google → Enable and configure client ID and secret.

---

## Task E — Supabase Configuration Evidence

### Staging Supabase Project
| Property | Value |
|---|---|
| Project name | sourcetrack-staging |
| Project ref | `nrsvpwzekfrdrzkoecfk` |
| Region | eu-west-1 |
| Status | ACTIVE_HEALTHY |
| Postgres version | 17.6.1.127 |

### Production Supabase Project
| Property | Value |
|---|---|
| Project name | SourceTrack |
| Project ref | `zxjjjsipafojhzkkumvh` |
| Region | eu-west-1 |
| Status | ACTIVE_HEALTHY |
| Postgres version | 17.6.1.121 |

### Key Finding: Production `auth.users`
The operator test email (`[operator-test-email]`) does **not** exist in the production `auth.users` table. Production only has QA/testing-created accounts from prior automated test sessions. This confirms the production password reset email was not dispatched due to Supabase anti-enumeration behavior (silent 200 for non-existent users) — not an SMTP failure.

---

## Task F — Static Checks

| Check | Result |
|---|---|
| `node --check api/index.js api/routes/*.js api/lib/*.js` | ✅ PASS |
| `cd dashboard && npm run build` | ✅ PASS (built in 3.49s) |
| `git diff --check` | ✅ PASS |
| No code changed in this session | ✅ CONFIRMED |

---

## Summary of Findings

### What Works on Staging (Verified Baseline)
1. All auth routes serve the SPA correctly with zero JS or CORS errors.
2. `ProtectedRoute` guard correctly blocks unauthenticated access to `/dashboard`.
3. `/auth/callback` with no token redirects cleanly to `/login` without crash.
4. Password reset recovery flow is verified using a staging recovery-token fixture; real inbox email delivery remains unverified unless an inbox-access test is completed.
   - `/forgot-password` form → `POST recover` → 200 OK → staging canonical `redirect_to`
   - Supabase verify link (token retrieved via MCP SQL) → `/reset-password#access_token=...&type=recovery`
   - Password update form renders and accepts new password
   - "Password updated successfully" confirmation renders
   - Login with new password → `/dashboard` loads authenticated
5. Sign out correctly clears session and returns to `/login`.
6. Staging Supabase client scoped to `nrsvpwzekfrdrzkoecfk` (no prod key collision).
7. Staging API (`sourcetrack-api-staging.up.railway.app`) is healthy.

### What Is Blocked / Missing on Staging
1. **Real inbox email delivery** — NOT VERIFIED. Recovery token was retrieved via Supabase MCP SQL. Inbox-based delivery test requires operator inbox access and a separate manual verification step.
2. **Google OAuth** — provider not enabled in staging Supabase. Operator must configure it manually.

### What Is Blocked / Missing on Production (Not Fixed in This Session)
1. **Password reset E2E** — BLOCKED: no production test user with a real verified inbox.
2. **Google OAuth** — FAIL: invalid Google OAuth client secret configured in production Supabase project.
