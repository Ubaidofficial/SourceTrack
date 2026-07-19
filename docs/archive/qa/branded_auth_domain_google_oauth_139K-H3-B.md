# QA Report & Rollout Status — Session 139K-H3-B — Implement Branded Supabase Auth Domain + Google OAuth Rollout

## Verdict
🔴 **BLOCKED** (Pending manual operator DNS mapping, Supabase Custom Domain activation, and Google Cloud Console OAuth redirect configuration).

---

## 1. Baseline Repo Status
- **Latest Commit**: `0da38ac Session 139K-H3 — Audit branded auth domain rollout`
- **Latest CI Status**: 🟢 `success` (Run ID: `27645168520`)
- **Working Tree**: Clean

---

## 2. Production Preflight Findings
- **Observed Google OAuth Redirect**: Verified using headless Chrome that clicking "Continue with Google" on `https://app.sourcetrack.ai/login` currently redirects to:
  `https://zxjjjsipafojhzkkumvh.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fapp.sourcetrack.ai%2Fauth%2Fcallback`
- **Sign-in / Sign-up Call-sites**: Audited `Login.jsx` and `Signup.jsx`. Both cleanly call `signInWithOAuth` and use the dynamic `import.meta.env.VITE_FRONTEND_URL || window.location.origin` as `redirectTo` pointing to `/auth/callback`.
- **Frontend Supabase URL Config**: Audited `dashboard/src/lib/supabase.js`. It utilizes the environment variable `import.meta.env.VITE_SUPABASE_URL` as expected.
- **Production Dashboard Config**: Production dashboard OAuth behavior currently uses the raw production Supabase URL, proven by browser redirect observation. Exact Railway production env value was not printed or directly documented to avoid exposing sensitive configuration.
- **Backend API URL Config**: Confirmed that `SourceTrack-Api` uses the raw production Supabase URL (`https://zxjjjsipafojhzkkumvh.supabase.co`) and will remain untouched.

---

## 3. Manual Operator Status

| Step | Owner | Action | Status | Notes |
|:---|:---|:---|:---|:---|
| **Google Console Redirect** | Operator | Add `https://auth.sourcetrack.ai/auth/v1/callback` to Authorized redirect URIs in Google Cloud Console. Keep raw callback `https://zxjjjsipafojhzkkumvh.supabase.co/auth/v1/callback` temporarily active. | 🟡 **PENDING** | Operator must perform this in the Google developer dashboard. |
| **Google Consent Screen** | Operator | Confirm `sourcetrack.ai` is listed in Authorized domains on Google consent screen settings. | 🟡 **PENDING** | Required for trust/branding validation. |
| **Supabase Custom Domain** | Operator | Add `auth.sourcetrack.ai` to Custom Domains under settings in Supabase project `zxjjjsipafojhzkkumvh`. | 🟡 **PENDING** | Generates the DNS values for CNAME/TXT. |
| **DNS Mapping** | Operator | Map CNAME `auth` pointing to the target provided by Supabase. Add verification TXT records. | 🟡 **PENDING** | Required for DNS resolution. |

---

## 4. DNS Verification Result
- **Command**: `nslookup auth.sourcetrack.ai`
- **Result**: DNS lookup did not resolve successfully; observed SERVFAIL in this environment. auth.sourcetrack.ai is not confirmed resolvable or active.
- **Status**: 🔴 **FAILED** (Custom domain does not resolve yet; DNS settings have not been published by the operator).

---

## 5. Railway Production Env Change Status
- **Variable**: `VITE_SUPABASE_URL` on `SourceTrack-Dashboard`
- **Target**: `https://auth.sourcetrack.ai`
- **Current Status**: 🔴 **NOT APPLIED** (Blocker: DNS does not resolve, custom domain is not active in Supabase, and Google OAuth callback is not registered. Applying this now would immediately break all login/signup functionality).
- **Backend API SUPABASE_URL**: Remains `https://zxjjjsipafojhzkkumvh.supabase.co` (untouched as planned).

---

## 6. Deployed Staging Safety Check
- **Staging Supabase Project ID**: `nrsvpwzekfrdrzkoecfk`
- **Staging URL configuration**: Staging services cleanly point to `nrsvpwzekfrdrzkoecfk.supabase.co` and do not reference production custom domain `auth.sourcetrack.ai`.
- **Staging OAuth target**: Config/env references indicate staging should continue using `https://nrsvpwzekfrdrzkoecfk.supabase.co/auth/v1/callback`; live staging OAuth browser verification was not completed in this session.
- **Verdict**: Staging isolation was checked from env/config references only. Live staging OAuth browser verification was not completed in this session and remains a required follow-up check before production rollout.

---

## 7. Rollback Plan
1. In the Railway console, revert the production dashboard environment variable `VITE_SUPABASE_URL` back to `https://zxjjjsipafojhzkkumvh.supabase.co`.
2. Redeploy the production dashboard service.
3. Login/signup will immediately fall back to the raw Supabase URL, resolving any custom domain outage.

---

## 8. Remaining Blockers
1. Operator must publish DNS CNAME/TXT records for `auth.sourcetrack.ai`.
2. Operator must verify and activate `auth.sourcetrack.ai` in the Supabase production dashboard.
3. Operator must add `https://auth.sourcetrack.ai/auth/v1/callback` to the Google OAuth Web Client settings.

---

## 9. Verification & QA Routes (Post-Activation)
Once the blockers are resolved, the following routes must be verified in production:
- **`https://app.sourcetrack.ai/login`**
  - Verify that the redirect target during Google OAuth starts with `redirect_uri=https://auth.sourcetrack.ai/auth/v1/callback`.
  - Verify the Google account chooser shows consent for **auth.sourcetrack.ai** (not raw Supabase).
  - Verify successful redirect to `https://app.sourcetrack.ai/auth/callback` and transition to `/dashboard`.
- **`https://app.sourcetrack.ai/signup`**
  - Same verification.
- **Console / Network**: Verify zero console errors and zero failed requests during authentication.

---

## 10. Validation Output & Git Status
- **`git diff --check`**: passed
- **`npm run qa:env-safety`**: passed
- **`npm run qa:static`**: passed
- **`git status --short --untracked-files=all`**: shows `docs/qa/branded_auth_domain_google_oauth_139K-H3-B.md`
- **Code modifications**: None (no code/logic files were changed during this session).
