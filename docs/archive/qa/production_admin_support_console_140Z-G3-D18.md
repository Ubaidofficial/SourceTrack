# Production Admin Support Console Readiness Audit

**Session:** 140Z-G3-D18
**Date:** 2026-06-20
**Status:** 🚨 PARTIAL PASS / BLOCKED (Pending live operator verification)

## 1. Final verdict
PARTIAL PASS / BLOCKED. The Admin Support Console architecture is strictly verified to be safe (no JWT minting, no cookie swapping). Read-only scoping, dynamic install statuses, and minimal safe-repair actions (name/domain update, support notes) with strict audit logging are implemented securely. However, verification of a live production `super_admin` operator account remains completely blocked, so paid beta remains NOT READY.

## 2. What was audited first
- `api/routes/admin.js`
- `api/middleware/user-auth.js`
- `dashboard/src/pages/Admin.jsx`
- Support preview `sessionStorage` architecture (`dashboard/src/components/SupportModeBanner.jsx`, `Dashboard.jsx`)
- Existing audit logging implementation (`makeAuditLogger`)

## 3. Production super_admin account verification status
- **Exists in code/schema:** YES. `requireUserAuth` explicitly checks `raw_app_meta_data.role === 'super_admin'`.
- **APIs server-protected:** YES. `api/routes/admin.js` uses `router.use(requireRole('super_admin'))` globally.
- **Production operator account exists:** 🔴 BLOCKED / UNVERIFIED. The AI cannot query the production Supabase instance to confirm whether a real operator email has the `super_admin` flag in `raw_app_meta_data`.
- **Admin route works on production domain:** 🔴 BLOCKED. Cannot be confirmed without logging in.

## 4. Admin route security model
All endpoints within `api/routes/admin.js` are unconditionally guarded by `requireRole('super_admin')`. Customer JWTs and standard `admin`/`user` roles will be cleanly rejected (`403 Forbidden`).

## 5. Why support preview is not unsafe impersonation
- **Does it mint customer JWTs?** NO.
- **Does it swap cookies/sessions?** NO.
- **Does it preserve identity?** YES. Support preview operates solely by injecting a `sessionStorage` flag (`sourcetrack_admin_preview`). The API continues to receive the operator's native `super_admin` JWT. PostHog and Supabase data are fetched by overriding the queried `site_id`, while the backend request executor explicitly retains the operator's identity.

## 6. User/account visibility
The `/api/admin/users` and `/api/admin/companies` endpoints retrieve safe read-only metadata (emails, member counts, creation dates). No passwords or raw keys are exposed.

## 7. Site/setup/install visibility
The `/api/admin/sites` and `/api/admin/site-detail` endpoints evaluate installation by reading the latest event from PostHog directly. Plain-English statuses are calculated dynamically (`No site yet`, `Snippet not seen`, `Pageview seen`, `Setup looks healthy`).

## 8. Billing/plan/usage read-only visibility
Site lists accurately retrieve the internal `plan` label (e.g. `starter`, `growth`). Paid/usage modification endpoints were intentionally excluded from this iteration.

## 9. Support preview behavior
The frontend respects the `sourcetrack_admin_preview` flag by injecting a fixed persistent banner: *"Support preview — you are not logged in as this customer."* into the dashboard layout.

## 10. Safe repair actions implemented or deferred
**Implemented:**
- Update site display name
- Update site domain
- Add internal support note
**Deferred:**
- Rotate site key (Deferred: too risky without snippet invalidation controls and customer comms)
- Reset onboarding state (Deferred)
- Recheck install logic (Deferred: read-only live checks are already deterministic and sufficient)

## 11. Audit logging behavior
All mutating actions (`PUT /api/admin/site-detail`, support note creation) explicitly invoke `logAction` passing a `reason` and capturing the `admin_user_id` and the `target_id`.

## 12. UI/UX findings
Admin layout is minimal and functional. Raw site keys are successfully redacted (e.g., `12345678...`). Clear warning banners indicate when the operator enters a preview context.

## 13. Secrets/PII safety findings
No customer JWTs are generated. Passwords, Stripe webhook secrets, and full tracking keys are stripped prior to frontend transmission.

## 14. Production operator runbook
To manually unblock this gate, the operator must:
1. Log into the Production Supabase console.
2. Navigate to Authentication -> Users.
3. Select the target operator user (e.g. Ubaid's email).
4. Edit the user to append `{"role": "super_admin"}` to the `raw_app_meta_data` JSON blob.
5. Log into `https://app.sourcetrack.ai` with that account and verify the Admin route renders.
6. **Important:** Disable the account or remove the role when testing is concluded. Use MFA for this account if supported.

## 15. Exact code/docs changes made
- Created `docs/qa/production_admin_support_console_140Z-G3-D18.md`
- Created `supabase/migrations/20260620134500_add_site_support_notes.sql`.
  **Migration Safety Confirmation:**
  - RLS is enabled.
  - Non-service-role users cannot read/write support notes directly.
  - All access is through `super_admin` API routes.
  - Notes have a reasonable length limit (5000 chars enforced in API).
  - Notes UI copy explicitly warns not to paste passwords, tokens, site keys, webhook secrets, reset links, or private customer secrets.
  - Mutating endpoints require a reason and create an audit log.
- Modified `api/routes/admin.js` to add status calculation, redact keys, and add minimal repair endpoints.
- Modified `dashboard/src/pages/Admin.jsx` to consume the redacted keys and new repair APIs.

## 16. Validation output
(See execution trace)

## 17. Safety grep classifications
(See execution trace)

## 18. Git status
Clean aside from the new documentation, migration, and the updated `admin.js` / `Admin.jsx` implementations.

## 19. Remaining blockers before inviting beta testers
- Production Stripe limits/live endpoint configuration.
- Creation and verification of the `super_admin` production operator account.
- Resolution of the live dummy-website attribution visibility blocker.

## 20. Paid beta remains NOT READY
The system remains blocked pending physical operator tasks. Paid beta is NOT READY.
