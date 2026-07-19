# Transactional Email & Operator Account QA Report (140Z-G3-D3)

## 1. Final Verdict
🚨 **BLOCKED**

Production transactional email readiness, DNS records, and email/password auth flow remain unverified and blocked due to missing operator access and incomplete DNS configuration.

## 2. Production Domains Tested
- App: `https://app.sourcetrack.ai`
- API: `https://api.srctk.com`
- Auth Callback: `https://app.sourcetrack.ai/auth/callback`

## 3. Supabase Auth Config Findings
- **Result:** 🚨 **BLOCKED**
- **Reason:** Production Supabase Auth email configuration cannot be verified without operator/Supabase project access. Cannot confirm Auth Site URL, Redirect URL allowlist, or SMTP configuration.

## 4. Custom SMTP Status
- **Result:** 🚨 **BLOCKED**
- **Reason:** Cannot verify if custom SMTP (Postmark/Resend) is configured in Supabase.

## 5. Sender/From-Domain Status
- **Result:** 🚨 **BLOCKED**
- **Reason:** Sender domain and templates cannot be verified without Supabase config access.

## 6. SPF/DKIM/DMARC Status
- **Result:** 🔴 **BLOCKED / NOT CONFIGURED**
- **Findings:** A DNS audit (`dig TXT sourcetrack.ai` and `dig TXT _dmarc.sourcetrack.ai`) reveals:
  - **SPF:** Missing. No `v=spf1` record found.
  - **DMARC:** Missing. `NXDOMAIN` for `_dmarc.sourcetrack.ai`.
  - **DKIM:** Unknown. Requires specific provider hostnames (e.g., Postmark/Resend DKIM records) to verify.
- **Conclusion:** DNS readiness for transactional email is incomplete.

## 7. Operator Test Account Status
- **Result:** 🚨 **BLOCKED**
- **Reason:** Production password reset E2E requires a safe production operator account with a real operator-controlled inbox. None is currently available.

## 8. Password Reset Request Result
- **Result:** 🚨 **BLOCKED**

## 9. Email Delivery Result
- **Result:** 🚨 **BLOCKED**

## 10. Reset Link/Form Result
- **Result:** 🚨 **BLOCKED**

## 11. Password Update Result
- **Result:** 🚨 **BLOCKED**

## 12. Login Result
- **Result:** 🚨 **BLOCKED**

## 13. Google OAuth Status
- **Result:** 🚨 **BLOCKED** (Carried over from D2: valid Google OAuth config access is still required).

## 14. Console/Network Findings
- Non-mutating route smoke test (`qa-production-auth-smoke.mjs`) passed again, confirming `/login`, `/signup`, `/reset-password`, `/dashboard`, and `/api/health` load correctly and return 200 OK.

## 15. Raw Validation Output
```
==================================================
      SourceTrack Production Auth Smoke QA
==================================================

Target Frontend URL: https://app.sourcetrack.ai
Target API URL:      https://api.srctk.com

--- Checking Frontend Routes ---
✅ GET /login is reachable and SPA is loaded (Status: 200)
✅ GET /signup is reachable and SPA is loaded (Status: 200)
✅ GET /reset-password is reachable and SPA is loaded (Status: 200)
✅ GET /dashboard is reachable and SPA is loaded (Status: 200)

--- Checking Backend API Health ---
✅ GET /api/health is online: status=ok, request_id=33728ee1-1d96-4a5b-ad99-e535e5e548d4

==================================================
✅ PASS — All frontend routes and API health check passed.
```

## 16. Remaining Blockers
- **DNS Records:** Must configure SPF, DKIM, and DMARC for `sourcetrack.ai` via the domain registrar (Spaceship).
- **Supabase SMTP:** Must configure custom SMTP (Postmark/Resend) in the production Supabase Auth dashboard.
- **Supabase Auth Config:** Must verify Site URL and Redirect URLs in production Supabase.
- **Operator Inbox:** Must create a safe production test account with a real operator-controlled inbox to complete password reset E2E.
- **Google OAuth:** Must configure valid Google OAuth client secret in production Supabase.

## 17. Git Status
```text
 M SESSION_HANDOFF.md
 M SESSION_LOG.md
 M SESSION_STATE.md
 A docs/qa/transactional_email_operator_account_140Z-G3-D3.md
```
