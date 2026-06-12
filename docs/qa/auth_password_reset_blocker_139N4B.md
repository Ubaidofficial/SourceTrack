# QA Audit — Auth Access & Password Reset Blocker

**Session:** 139N-4B
**Date:** 2026-06-12
**Status:** PARTIAL / BLOCKED
**Paid Beta Impact:** `BLOCKER`

---

## 1. Executive Verdict

The authentication access and password reset flows were audited. Previously, the forgot password and reset password flows were completely missing from the application UI and routes. We have successfully implemented `ForgotPassword.jsx`, `ResetPassword.jsx`, custom login error messaging, and AuthCallback route interception.

*   Login with real credentials: `BLOCKED — valid test login credentials not available`
*   Forgot password UI: `PASS — local route/build only`
*   Reset email delivery: `BLOCKED — Supabase email/SMTP and real inbox not verified`
*   Reset link redirect: `BLOCKED — real reset email link not verified`
*   Password update after recovery: `BLOCKED — real recovery session not verified`
*   Email update/change: `MISSING — not implemented`
*   Supabase user deletion/reset: `BLOCKED — production destructive action not allowed; staging cleanup docs only`
*   Paid beta impact: `BLOCKER`

---

## 2. Deployed Dashboard URL Tested

*   **Production target:** `https://sourcetrack-dashboard-production.up.railway.app/`
*   **Staging target:** `https://sourcetrack-dashboard-staging.up.railway.app/`

---

## 3. Environment/Project Wiring Findings

*   **Production Dashboard:** Connected to production Supabase project ref `zxjjjsipafojhzkkumvh`.
*   **Staging Dashboard:** Connected to staging Supabase project ref `nrsvpwzekfrdrzkoecfk`.
*   **Local `.env` and `.env.local` files:** Point to staging reference `nrsvpwzekfrdrzkoecfk` for development safety.

---

## 4. Detailed Audit Findings

### Login
*   **Error message copy:** Improved to distinguish invalid credentials vs unconfirmed email vs network/reachable errors.
*   **Redirect behavior:** Redirects to `/dashboard` upon successful login, and `ProtectedRoute` redirects to `/onboarding` if onboarding is incomplete.
*   **Verdict:** `BLOCKED — valid test login credentials not available`

### Forgot Password
*   **UI Page:** Added `/forgot-password` route rendering `ForgotPassword.jsx`.
*   **Logic:** Calls `supabase.auth.resetPasswordForEmail()` with `redirectTo` set to `${window.location.origin}/reset-password`.
*   **Verdict:** `PASS — local route/build only`

### Reset Link Redirect & Password Update
*   **UI Page:** Added `/reset-password` route rendering `ResetPassword.jsx`.
*   **Implicit Flow Support:** Listens to `onAuthStateChange` to verify access tokens in hash.
*   **PKCE Flow Support:** Exchanges query `code` for a session using `supabase.auth.exchangeCodeForSession(code)`.
*   **Error State:** Shows a clear message if recovery session is expired or invalid with a CTA to `/forgot-password` to request a new link.
*   **Password update logic:** Calls `supabase.auth.updateUser({ password })`.
*   **Verdicts:**
    *   Reset email delivery: `BLOCKED — Supabase email/SMTP and real inbox not verified`
    *   Reset link redirect: `BLOCKED — real reset email link not verified`
    *   Password update after recovery: `BLOCKED — real recovery session not verified`

### Email Update / Change
*   **Status:** `MISSING — not implemented`
*   **Details:** The settings panel renders user email as a static string. No update inputs exist, and `supabase.auth.updateUser({ email })` is not called anywhere in the codebase.

---

## 5. Supabase Console Setup Requirements

> [!WARNING]
> The following configurations must be verified or configured in the Supabase Project Dashboard under **Authentication -> URL Configuration** and **Authentication -> Providers -> Email** for recovery emails to deliver and redirect correctly:

### Expected Site URL & Redirect URLs
*   **Site URL:**
    `https://sourcetrack-dashboard-production.up.railway.app`
*   **Redirect URLs:**
    *   `https://sourcetrack-dashboard-production.up.railway.app/reset-password`
    *   `https://sourcetrack-dashboard-production.up.railway.app/auth/callback`
    *   `https://sourcetrack-dashboard-staging.up.railway.app/reset-password`
    *   `https://sourcetrack-dashboard-staging.up.railway.app/auth/callback`

---

## 6. Staging/Test-User Deletion & Cleanup Guide

Deleting a user in Supabase Auth directly fails if they own sites or widgets, due to foreign key constraints. Below is the manual SQL cleanup script to delete a user safely.

> [!CAUTION]
> - **STAGING ONLY**
> - **DO NOT RUN ON PRODUCTION**
> - **Requires exact test user email**
> - **Requires manual review before execution**

```sql
-- 1. Find User ID
SELECT id FROM auth.users WHERE email = 'testuser@example.com';

-- 2. Clear FK constraints references
DELETE FROM public.api_keys WHERE owner_id = '<user-id>';
DELETE FROM public.dashboard_widgets WHERE owner_id = '<user-id>';
DELETE FROM public.annotations WHERE created_by = '<user-id>';
UPDATE public.lead_qualifications SET qualified_by = NULL WHERE qualified_by = '<user-id>';
UPDATE public.qa_notes SET created_by = NULL WHERE created_by = '<user-id>';
UPDATE public.admin_audit_log SET admin_user_id = NULL WHERE admin_user_id = '<user-id>';

-- 3. Clear telemetry of owned sites to avoid orphaned data
DELETE FROM public.pageviews WHERE site_id IN (SELECT id FROM public.sites WHERE owner_id = '<user-id>');
DELETE FROM public.custom_events WHERE site_id IN (SELECT site_key FROM public.sites WHERE owner_id = '<user-id>');
DELETE FROM public.attributed_conversions WHERE site_id IN (SELECT id FROM public.sites WHERE owner_id = '<user-id>');
DELETE FROM public.campaign_costs WHERE site_id IN (SELECT id FROM public.sites WHERE owner_id = '<user-id>');
DELETE FROM public.data_quality_reports WHERE site_id IN (SELECT id FROM public.sites WHERE owner_id = '<user-id>');
DELETE FROM public.revenue_idempotency_keys WHERE site_key IN (SELECT site_key FROM public.sites WHERE owner_id = '<user-id>');
DELETE FROM public.revenue_ingestion_events WHERE site_key IN (SELECT site_key FROM public.sites WHERE owner_id = '<user-id>');
DELETE FROM public.managed_proxy_domains WHERE site_key IN (SELECT site_key FROM public.sites WHERE owner_id = '<user-id>');

-- 4. Delete sites owned by user
DELETE FROM public.sites WHERE owner_id = '<user-id>';

-- 5. Delete company membership
DELETE FROM public.company_members WHERE user_id = '<user-id>';

-- 6. Finally delete auth user
DELETE FROM auth.users WHERE id = '<user-id>';
```

---

## 7. Diffs & Validation

* Local build/static QA passed.
* Real deployed reset email delivery is still BLOCKED.
* Real reset link redirect is still BLOCKED.
* Real password update after recovery is still BLOCKED.
* Supabase redirect URL and SMTP/email settings are still BLOCKED pending console verification.
* Email update/change is still MISSING.
* Git Status: PENDING REVIEW — uncommitted changes present
