# Session 140Z-G3-D12: Minimum Production Operator Readiness

## Verdict: PASS

## Audit Findings
An audit of the codebase was conducted to evaluate the minimum operator readiness for the paid beta.

1. **Role Definition**: Operator access is securely defined by the `super_admin` role. The `super_admin` role is not assigned via standard API routes or user forms; it must be injected directly into the user's `raw_app_meta_data.role` via the Supabase Dashboard by the system owner. This provides an explicit, owner-controlled access path.
2. **Backend Enforcement**: `api/middleware/user-auth.js` enforces the role check. The `requireRole('super_admin')` middleware protects all routes under `/api/admin`. Additionally, `requireSiteMembership` explicitly permits `super_admin` accounts to access any site's reporting data without failing the tenancy gate.
3. **Impersonation Risk**: No customer JWT impersonation path was found; support/preview mode preserves `super_admin` identity. The support/preview mode (`POST /api/admin/preview`) does *not* mint customer JSON Web Tokens or downgrade the admin identity. The operator remains authenticated as `super_admin`, which simply bypasses the tenancy check to load the customer's dashboard cleanly.
4. **Admin UI Status**: A lightweight, minimal UI exists at `/admin` (protected by `AdminRoute.jsx`). It is audited as production-safe based on code review. It provides read-only views into Companies, Users, Sites, Feature Status, and Audit Logs. It also includes an internal QA notes tracker. This is strictly scoped as minimum operator readiness; no broad enterprise dashboards or multi-tenant agency tools exist.
5. **Secret Exposure**: The admin endpoints and UI do not expose raw passwords, JSON Web Tokens, Supabase service keys, or sensitive API tokens.

## Operator Checklist (Runbook)

### Granting Operator Access
1. Log into the Supabase Dashboard for the production project.
2. Navigate to **Authentication** \> **Users**.
3. Select the target operator account.
4. Edit the user's `raw_app_meta_data` JSON to include:
   ```json
   {
     "role": "super_admin"
   }
   ```
5. The operator must sign out and sign back in for the new role to take effect.

### Daily Operations via `/admin` UI
- **Finding a User/Site**: Navigate to `https://app.sourcetrack.ai/admin`. Use the **Users** or **Sites** tabs to look up accounts by domain, name, or non-sensitive identifiers.
- **Checking Account/Billing Status**: The **Sites** tab displays the `plan` (e.g., `free`, `starter`, `trial`) and creation timestamps.
- **Confirming Onboarding State**: The **Sites** tab and the Site Detail inspector (`GET /api/admin/site-detail?site_key=X`) show the `onboarding_completed` flag and `onboarding_state` JSON.
- **Support Mode (Preview)**: Click the "Preview" button on a site in the Admin UI to load the dashboard context for that site. This is safe, read-only, and does not perform identity substitution.

## Conclusion
The existing operator tooling is lightweight and satisfies the minimum production operator readiness requirements for this session. No code changes were required. D8 valid reset email-link verification and transactional email/custom SMTP remain separate readiness blockers.
