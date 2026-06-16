# QA Report & Implementation Plan — Branded Supabase Auth Domain + Google OAuth Polish

## 1. Current Problem Screenshot Description
During the Google OAuth login or signup flow, users are redirected from the SourceTrack login page to the Google Account Chooser. Currently, the chooser displays a consent banner stating:
> "To continue, Google will share your name, email address, language preference, and profile picture with **zxjjjsipafojhzkkumvh.supabase.co**."

This exposes the raw backend project subdomain of the Supabase infrastructure. For a premium, secure SaaS platform like SourceTrack, showing raw project infrastructure domains instead of the official branded domain (`auth.sourcetrack.ai`) reduces user trust, looks unpolished, and increases friction during signup.

## 2. Current Observed OAuth Domain
- **Raw Production Supabase Domain**: `zxjjjsipafojhzkkumvh.supabase.co`
- **Observed Google OAuth Redirect URI**: `https://zxjjjsipafojhzkkumvh.supabase.co/auth/v1/callback`

## 3. Target Branded Auth Domain
- **Preferred Custom Domain**: `auth.sourcetrack.ai`
- **Branded OAuth Redirect URI**: `https://auth.sourcetrack.ai/auth/v1/callback`

> [!NOTE]
> `app.sourcetrack.ai` is reserved for the React SPA client app. Supabase Auth custom domain must be mapped to `auth.sourcetrack.ai` to prevent collision with the app hosting.

## 4. Current Auth Config Audit
- **Production Supabase Project ID**: `zxjjjsipafojhzkkumvh`
- **Staging Supabase Project ID**: `nrsvpwzekfrdrzkoecfk`
- **Staging Environment Variables**:
  - `SUPABASE_URL=https://nrsvpwzekfrdrzkoecfk.supabase.co`
  - `VITE_SUPABASE_URL=https://nrsvpwzekfrdrzkoecfk.supabase.co`
- **Production Environment Variables (Current)**:
  - `SUPABASE_URL=https://zxjjjsipafojhzkkumvh.supabase.co`
  - `VITE_SUPABASE_URL=https://zxjjjsipafojhzkkumvh.supabase.co`
- **Staging / Production Separation**: Staging is cleanly isolated from production, pointing to `nrsvpwzekfrdrzkoecfk` with separate service role and anon keys.

- **Supabase Auth Site URL**: `OPERATOR-BLOCKED — not directly verified` (inferred from `VITE_FRONTEND_URL` and `window.location.origin` routing)
- **Allowed Redirect URLs**: `OPERATOR-BLOCKED — not directly verified` (inferred from code redirects to `/auth/callback`)
- **Google OAuth callback URL**: `OPERATOR-BLOCKED — not directly verified` (inferred from code settings)
- **Google OAuth app branding/domain verification status**: `OPERATOR-BLOCKED — not directly verified`

## 5. Verification limits
- Code-level OAuth call sites were audited.
- Local env files and documented production env notes were audited.
- Supabase Dashboard production Auth settings were not directly verified in this session.
- Google Cloud OAuth settings were not directly verified in this session.
- DNS provider settings were not directly verified in this session.
- These are manual operator verification steps before production mutation.

## 6. Frontend Auth Call-Site Audit
- File: `dashboard/src/pages/Login.jsx` (Lines 54-60)
  ```javascript
  const redirectUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${redirectUrl}/auth/callback`
    }
  })
  ```
- File: `dashboard/src/pages/Signup.jsx` (Lines 71-77)
  ```javascript
  const redirectUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${redirectUrl}/auth/callback`
    }
  })
  ```
- File: `dashboard/src/lib/supabase.js` (Lines 3-4, client initialization)
  ```javascript
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  ```

*Conclusion*: The frontend code is cleanly decoupled from raw domains, utilizing `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_FRONTEND_URL`. No changes are required in the codebase itself; the migration is purely configuration-driven.

---

## 7. Manual Operator Checklist

### Google Cloud Console Checklist
- [ ] Log in to the [Google Cloud Console](https://console.cloud.google.com/).
- [ ] Select the production **SourceTrack** project.
- [ ] Navigate to **APIs & Services** -> **OAuth consent screen**.
- [ ] Verify that `sourcetrack.ai` is listed in the **Authorized domains** list. If not, add `sourcetrack.ai` and submit for verification if required.
- [ ] Navigate to **APIs & Services** -> **Credentials**.
- [ ] Edit the **OAuth 2.0 Web Client ID** used by the production app.
- [ ] Under **Authorized redirect URIs**, add:
  `https://auth.sourcetrack.ai/auth/v1/callback`
- [ ] *DO NOT delete* `https://zxjjjsipafojhzkkumvh.supabase.co/auth/v1/callback` yet (keep both active during propagation/migration to avoid downtime).
- [ ] Click **Save**.

### Supabase Custom Domain Checklist
- [ ] Log in to the [Supabase Dashboard](https://supabase.com/dashboard).
- [ ] Select the production project `zxjjjsipafojhzkkumvh`.
- [ ] Go to **Settings** -> **General** -> **Custom Domains**.
- [ ] Enter custom domain: `auth.sourcetrack.ai`.
- [ ] Note the CNAME and verification TXT records generated by Supabase.
- [ ] Add these records to the DNS settings (see DNS Checklist).
- [ ] After DNS propagates, click **Verify** in the Custom Domains panel.
- [ ] Toggle Custom Domain to **Active**.

### DNS Settings Checklist
- [ ] Log in to the DNS provider for `sourcetrack.ai` (e.g. Cloudflare / Namecheap).
- [ ] Create a **CNAME** record:
  - **Name/Host**: `auth`
  - **Target/Value**: `zxjjjsipafojhzkkumvh.supabase.co` (or the specific custom hostname routing endpoint generated by Supabase)
  - **TTL**: Auto / 1 Hour
- [ ] Create **TXT** records for ownership and SSL verification as provided by the Supabase console.
- [ ] Confirm DNS records are active using `dig CNAME auth.sourcetrack.ai` or global lookup tools.

---

## 8. Rollout & Rollback Plan

### Rollout Plan
1. Add `https://auth.sourcetrack.ai/auth/v1/callback` to Google Cloud Console's authorized redirect URIs, keeping the existing raw Supabase callback temporarily.
2. Configure and activate `auth.sourcetrack.ai` in Supabase custom domains.
3. Update the production environment variables in Railway for `SourceTrack-Dashboard` only:
   - `VITE_SUPABASE_URL=https://auth.sourcetrack.ai`
   *Note*: Production `SourceTrack-Api` should keep the existing raw Supabase URL (`SUPABASE_URL=https://zxjjjsipafojhzkkumvh.supabase.co`) initially to isolate client-side OAuth branding from backend service-role operations.
4. Redeploy the production dashboard service only.
5. Verify Google login/signup on `https://app.sourcetrack.ai`.
6. Only after successful validation of browser authentication should the team decide whether backend `SUPABASE_URL` should ever move to the custom domain.
7. Once verified, clean up the legacy redirect URI in Google Console.

### Rollback Plan
1. In the Railway console, revert production dashboard environment variables:
   - `VITE_SUPABASE_URL=https://zxjjjsipafojhzkkumvh.supabase.co`
2. Redeploy production dashboard.
3. This will immediately fall back to the raw Supabase infrastructure URLs without interrupting user service.

---

## 9. Staging & Production Separation Risks
- **Key Isolation**: Staging and production credentials and domains must never mix. `auth.sourcetrack.ai` must only route to the production project `zxjjjsipafojhzkkumvh`.
- **Staging Domain**: Staging will continue using `https://nrsvpwzekfrdrzkoecfk.supabase.co` as its Auth domain. Staging does not require a custom domain since it is for developer/QA use only, but if needed, a distinct subdomain (e.g., `staging-auth.sourcetrack.ai`) must be configured separately on the staging Supabase project `nrsvpwzekfrdrzkoecfk`.
- **Environment Isolation Guard**: Never change staging variables on Railway (`VITE_SUPABASE_URL`) to point to `https://auth.sourcetrack.ai`, as this will connect the staging dashboard to production databases and leak customer data.

---

## 10. Verification & QA Routes

### Staging Verification Routes
Verify that staging auth works unaffected by production configurations:
- Staging App URL: `https://sourcetrack-dashboard-staging.up.railway.app/login`
- Verification Steps:
  1. Click "Continue with Google".
  2. Verify that the URL redirection query string contains `redirect_uri=https://nrsvpwzekfrdrzkoecfk.supabase.co/auth/v1/callback`.
  3. Verify Google account chooser shows sharing with `nrsvpwzekfrdrzkoecfk.supabase.co`.
  4. Perform login and ensure onboarding/dashboard load cleanly.

### Production Verification Routes
Verify production once custom domain settings are rolled out:
- Production App URL: `https://app.sourcetrack.ai/login`
- Verification Steps:
  1. Click "Continue with Google".
  2. Verify that the browser redirect URL redirects to Google OAuth and contains `redirect_uri=https://auth.sourcetrack.ai/auth/v1/callback`.
  3. Verify Google account chooser displays sharing permission consent for **auth.sourcetrack.ai** (rather than the raw project subdomain).
  4. Verify successful redirection back to `https://app.sourcetrack.ai/auth/callback` and transition into `/dashboard`.

## 11. Validation Output & Git Status
- **`git diff --check`**: passed
- **`npm run qa:env-safety`**: passed
- **`npm run qa:static`**: passed
- **`git status --short --untracked-files=all`**: shows only `docs/qa/branded_auth_domain_google_oauth_139K-H3.md`
- **Code modifications**: None (no code/logic files were changed during this session).
