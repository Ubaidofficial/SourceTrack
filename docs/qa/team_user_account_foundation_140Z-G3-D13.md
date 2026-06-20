# Session 140Z-G3-D13: Team/User Account Foundation Audit

## Verdict: PASS

## Audit Findings
An audit was conducted of the team, user account, and site ownership structures. The goal was to ensure the foundation safely isolates users without requiring a fully featured agency/multi-tenant UI before the paid beta launch.

1. **Existing Account/Team Model**:
   - A foundational team model exists in the schema (`migration_workspaces.sql`).
   - The `companies` table represents a workspace.
   - The `company_members` table maps `user_id` to `company_id` with basic roles (`admin`, `user`).
   - The `sites` table contains both a direct `owner_id` (legacy/single-user) and a `company_id` linking to the workspace.
   - **Limitation**: The current backend auth middleware (`api/middleware/user-auth.js`) retrieves a member's workspace via `.maybeSingle()`. This means the backend safely forces the user into a single active workspace context. There is no client-switching or multi-workspace UI, which is intentional and acceptable for the paid beta.

2. **Tenant Isolation Findings**:
   - **Database Level**: RLS policies exist on `companies`, `company_members`, and `sites` restricting `SELECT` to only those rows matching the `auth.uid()` membership.
   - **Backend Level**: The Express API enforces isolation in `requireSiteMembership` (`api/middleware/auth.js`). It explicitly checks that `req.site.company_id === req.user.company_id` (or falls back to `req.site.owner_id === req.user.id` for legacy sites). Access to other tenants is blocked with a 403.
   - **Support Bypass**: Only accounts flagged as `super_admin` in `raw_app_meta_data` can bypass this check to provide support. No customer users can access other tenants.

3. **Billing & Account Owner Assumptions**:
   - Billing is tracked primarily via `stripe_customer_id` stored directly on the `sites` table.
   - Operations in `api/routes/billing.js` fetch the target site and act upon its `stripe_customer_id`.
   - This per-site billing strategy avoids the complexity of account-level rollups or agency billing management, keeping the system minimal and safe.

4. **Missing Items / Blockers**:
   - There is no UI for multi-tenant agency switching, branded reporting, or broad enterprise RBAC. These are explicitly excluded from the current roadmap.
   - No code changes were needed to secure the backend; the single-workspace enforcement is audited as sufficient for the current single-workspace paid-beta scope.
   - **Overall Project Blockers**: D8 valid reset-link verification and transactional email/custom SMTP remain open readiness blockers.

## Conclusion
The single-workspace limitation, combined with RLS, the `requireSiteMembership` middleware, and the `super_admin` exception, isolates user accounts and site data. The team/user account foundation is sufficient for the current minimum paid-beta team/user account scope based on this audit. No code modifications were required.
