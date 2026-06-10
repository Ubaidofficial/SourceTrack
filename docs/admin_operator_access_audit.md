# SourceTrack Admin & Operator Access Audit

This document details the internal admin/operator access controls, service-role usage, tenant boundaries, support verification procedures, and support control risks.

---

## 1. Route Inventory for Admin/Service-Role Actions

All administrator-specific operations are grouped under the `/api/admin` base route (defined in `api/routes/admin.js`), which is guarded globally by the `super_admin` role constraint (`router.use(requireRole('super_admin'))`).

### Admin-Only Route Inventory
- `GET /api/admin/companies` — Lists all companies with workspace member and site counts.
- `GET /api/admin/users` — Lists all registered workspace members and resolves their login emails from Supabase Auth.
- `GET /api/admin/sites` — Lists all active sites with owner emails and company names.
- `POST /api/admin/preview` — Resolves install statuses, event volumes, and report counts for a site to launch a support-mode dashboard preview.
- `GET /api/admin/preview/:siteKey` — Aggregates KPIs (revenue, conversions, pageviews, and leads) and top referrers from PostHog using HogQL.
- `GET /api/admin/site-detail` — Inspects detailed onboarding state, domain bindings, and recent telemetry events.
- `GET /api/admin/feature-status` — Queries the truth panel of system feature statuses.
- `POST /api/admin/feature-status/recheck` — Dispatches server-side filesystem probes to verify route module existence.
- `GET /api/admin/audit-log` — Lists the last 100 entries of super admin activities.
- `GET/POST/PUT/DELETE /api/admin/qa-notes` — CRUD endpoints for managing QA notices and compliance warnings.

---

## 2. Service-Role Usage Map

SourceTrack uses the Supabase **Service Role Key** (`SUPABASE_SERVICE_KEY`) to bypass Postgres Row Level Security (RLS) for all backend queries. The `auth.admin` client is used for identity resolution and account deletions:

| Component / File | Invoked Service-Role API | Reason |
| :--- | :--- | :--- |
| **`api/lib/supabase.js`** | `createClient(url, key)` | Instantiates the singleton Supabase client using the service-role key by default. |
| **`api/routes/gdpr.js`** | `auth.admin.deleteUser(userId)` | Wipes the user's login account from Supabase Auth during account purges. |
| **`api/middleware/auth.js`** | `auth.admin.getUserById(data.owner_id)` | Checks if a free-plan site owner has confirmed their email address. |
| **`api/jobs/usage-threshold-emails.js`** | `auth.admin.getUserById(site.owner_id)` | Resolves the site owner's email address to deliver threshold notifications. |
| **`api/routes/admin.js`** | `auth.admin.getUserById(...)` | Resolves login emails from UUIDs to display in admin dashboards and audit logs. |

---

## 3. Tenant Boundary & Impersonation Status

- **Application-Enforced Tenant Isolation:** Because RLS is bypassed by the service-role client, tenant boundaries are enforced entirely in the application layer. Standard routes validate permissions by comparing `req.user.company_id === req.site.company_id` (or verifying owners via `owner_id === req.user.id`).
- **Super Admin Bypass:** Super admins bypass workspace membership checks in `requireSiteMembership()` to allow support previewing.
- **Impersonation Status:** SourceTrack does **not** feature session impersonation (SUDO login). The dashboard preview (`POST /api/admin/preview`) queries PostHog and Supabase data directly as a super admin and does not mint a customer JWT token or alter cookies.

---

## 4. API Token & Secret Handling

- **Scoped API Tokens:** Server-side API keys are hashed via SHA-256 and scoped strictly to `site_id` contexts in the database.
- **Token Handling:** API key values appear to be returned only once on creation and stored as hashes server-side. No obvious frontend secret exposure was found in this audit. This must remain under continuous review because backend logs, support notes, and future route changes can still create leakage risk.

---

## 5. Support Operations Guidelines

### Support Request Verification Checklist
- [ ] **Verify Sender:** Ensure the incoming support request originates from the email address registered as the site's owner or member.
- [ ] **Look Up Workspace Context:** Use safe, read-only SQL queries to identify site relationships before taking action:
  ```sql
  SELECT id, site_key, owner_id, company_id, plan FROM sites WHERE site_key = 'SITE_KEY';
  ```
- [ ] **Audit Admin Actions:** Preview customer data only for active support tickets. All dashboard previews are recorded in the `admin_audit_log` table.

### What Operators May Do
- Launch dashboard previews to diagnose telemetry problems or installation issues.
- Retrieve site details, onboarding statuses, and recent event logs.
- Add or update QA notes for feature warnings.
- Manually trigger jobs only in staging/local environments with dummy data and non-production provider keys. Do not trigger jobs that send real emails, mutate production data, or touch live provider accounts.

### What Operators Must NOT Do
- **Never** share or post the `SUPABASE_SERVICE_KEY` or `ENCRYPTION_KEY`.
- **Never** execute raw `UPDATE` or `DELETE` SQL scripts on production tables without backup snapshots and approval.
- **Never** bypass email verification checks to manually activate a free-tier site.
- **Never** promise complete GDPR compliance or complete Stripe invoice data wipes.
- **Never** mutate a user's subscription state outside the Stripe merchant dashboard.

---

## 6. Support Control Risks

- **P0 — Shared Service Client (RLS Bypass):** The singleton client uses the service-role key for all queries. Any coding error or missing `requireSiteMembership` middleware call on standard routes could leak customer data across tenants.
- **P1 — Manual Stripe Recovery:** Subscription updates and cancellations are Stripe-owned. If webhook delivery fails, operators must inspect Stripe webhook delivery logs and only replay or repair events using documented Stripe test-mode/provider-console procedures. Do not manually fake production billing state in the database.
- **P2 — No Admin Actions Log in UI:** While the `admin_audit_log` records actions, they are not exposed in a dashboard view for operators; logs must be audited via SQL or the `/api/admin/audit-log` JSON endpoint.

---

## 7. Audit Questionnaire & Responses

This section addresses the 20 pre-beta audit questions regarding internal admin/operator access and support controls.

1. **Are there any admin/operator-only routes today?**
   Yes. All administrative endpoints are grouped under `/api/admin` (defined in `api/routes/admin.js`) and are restricted globally by the `super_admin` role check (`router.use(requireRole('super_admin'))`).

2. **Are any service-role Supabase actions exposed to normal user routes?**
   Partially. Service-role access is not exposed directly to the frontend, but the backend uses a service-role Supabase client broadly across routes. Safety therefore depends on route authentication, tenant scoping, and membership checks rather than database RLS. This is acceptable for small paid beta only if middleware coverage remains strict.

3. **Which routes use Supabase service-role/admin client?**
   SourceTrack utilizes a backend-only singleton client (`getSupabase()`) initialized with `SUPABASE_SERVICE_KEY` across all route queries, meaning database-level RLS is bypassed. The explicit `auth.admin` APIs are used for user deletion in `DELETE /api/gdpr/account`, email confirmation verification in `requireUserAuth` middleware, site owner details retrieval in `usage-threshold-emails` job, and email resolution in `/api/admin/*` endpoints.

4. **Are account deletion and auth user deletion safely scoped?**
   Yes. Account deletion (`DELETE /api/gdpr/account`) is bound to the authenticated user ID (`req.user.id`). Deletion cascades safely and handles shared workspace memberships (sole admin blocks vs member removal).

5. **Are support workflows documented?**
   Yes. Support entry points, bug reporting schemas, and triage procedures are documented in `docs/support_readiness.md`.

6. **Is requester identity verification documented?**
   Yes. Operator guidelines require verifying that the requester's email matches the registered owner or member before performing any diagnostic actions or data deletion.

7. **Is tenant/site membership enforced consistently before reading customer data?**
   Mostly, based on audited routes. Tenant/site membership is enforced on the main customer data routes through `requireUserAuth`, `validateSiteKey`, and `requireSiteMembership`, but because backend DB access bypasses RLS, any future route missing middleware could become a cross-tenant data leak. This remains the highest-risk operator/access gap.

8. **Are API tokens scoped and documented?**
   Yes. Server API keys are hashed with SHA-256, bound to site IDs in the database, and documented in integrations setup guides.

9. **Are billing support actions app-handled or Stripe-console handled?**
   They are handled exclusively in the Stripe Merchant Dashboard. The API provides no endpoints for manually adjusting subscriptions, invoicing, or processing refunds.

10. **Are PostHog/Supabase/Stripe provider-console manual actions documented?**
    Yes. Manual verification steps are detailed in `docs/privacy_request_operational_drill.md` and `docs/staging_production_separation_audit.md`.

11. **Are operator actions logged anywhere?**
    Partially. Core `/api/admin` operations such as previewing a dashboard, retrieving site details, and rechecking feature status appear to be recorded in `admin_audit_log`. Manual provider-console actions and support decisions are not automatically logged and must be recorded in support notes until a stronger operator audit trail exists.

12. **Is there an audit log table or admin activity log?**
    Partially. `admin_audit_log` exists for selected app-level admin actions, but it is not a complete operator activity log across Stripe, Supabase, PostHog, Resend, Railway, or manual support decisions.

13. **Is there any impersonation feature?**
    No. No JWT swapping, SUDO login, or cookie manipulation is supported. The dashboard support preview reads data as a super admin but does not impersonate the user's session.

14. **Are secrets/tokens ever returned to frontend or logs?**
   No obvious frontend secret exposure was found in this audit. API tokens appear hashed/stored server-side, but this should remain under continuous review. Error logging avoids obvious secret dumping, but operators must still avoid pasting secrets into logs or support notes.

15. **Are customer support routes/UI lightweight and safe?**
    Yes. Support entry points are lightweight mailto links and contact instructions. No heavy external live chat or ticket widgets are embedded.

16. **Are there dangerous manual SQL recipes in docs?**
    No. Only read-only `SELECT` queries for support triage are documented; destructive queries are strictly prohibited in runbooks.

17. **Are internal support controls enough for paid beta?**
   Partially sufficient for a small controlled paid beta. Current controls are workable only with strict manual discipline, no broad operator access, no impersonation, no destructive SQL, and careful review of new routes. Longer term, SourceTrack needs stronger audit logging, least-privilege DB access, and possibly RLS-backed defense-in-depth.

18. **What provider-console checks are required outside the repo?**
    Verifying Railway variable configurations, Supabase database logs, PostHog project keys, Stripe payment modes, and Resend domain DNS verifications.

19. **What must never be done in production support handling?**
    Operators must never leak keys/secrets, run raw mutating SQL queries against production, manually bypass email confirmation for free plans, promise absolute compliance/erasure, or alter subscription state outside Stripe.

20. **Highest-risk admin/operator access gap before paid beta?**
    **RLS Bypass via Shared Service Client:** Because `getSupabase()` is globally instantiated with the service-role key, database queries bypass RLS. Any code-level middleware omission or routing error could cause cross-tenant data leakage.
