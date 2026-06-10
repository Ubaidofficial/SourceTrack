# SourceTrack Privacy Request & Data Deletion Operational Drill

This document outlines the operational workflows, boundaries, validation checklists, and operator procedures for handling privacy requests, account deletions, and data retention settings.

> [!WARNING]
> **OPERATIONAL WARNING:** Under no circumstances should deletion scripts or SQL queries be tested directly against production customer data. All drills and test assertions must be performed exclusively in local or staging environments.

> [!IMPORTANT]
> **NO COMPLIANCE CLAIMS:** SourceTrack is built with privacy-conscious features (such as cookieless fallback options), but the platform does not claim or guarantee complete compliance with regional frameworks (GDPR, CCPA, ePrivacy, etc.). Customers are solely responsible for ensuring their usage complies with regional regulations.

---

## 1. Data Deletion & Retention Flows

### Account Deletion Flow (`DELETE /api/gdpr/account`)
Account deletion operates on the authenticated user's ID (`req.user.id`) and executes the following steps:
1. **Workspace Audit:** Resolves the user's membership and associated company workspace.
2. **Shared Workspace Check:**
   - If the workspace has multiple members and the user is a standard member, it deletes **only** the caller's membership row and their Supabase Auth record. Workspace site data is preserved for the other members.
   - If the user is the **sole admin** of a shared workspace, the deletion request is blocked (`409 Conflict`), prompting them to transfer ownership or contact support.
3. **Sole Member Purge:** If the user is the only member, it performs a complete purge:
   - Deletes all `attributed_conversions` records associated with the workspace's sites.
   - Deletes all sites associated with the workspace.
   - Deletes the company entry from the `companies` table.
   - Deletes the Supabase Auth user record via the service-role admin API.
   - Database cascade constraints (`ON DELETE CASCADE`) clean up dependent records (e.g. `saved_reports`, `api_keys`, `webhook_destinations`).

### Visitor Deletion Flow (`DELETE /api/gdpr/visitor`)
Visitor erasure requires a target `site_key` and the visitor's `anonymous_id`:
1. **Authorization:** Validates that the calling user has access to the specified site.
2. **Supabase Purge:**
   - Deletes all rows in `attributed_conversions` matching the `site_id` and `anonymous_id`.
   - Deletes `site_identity_links` records matching the `anonymous_id` scoped to the site.
   - Deletes `site_identity_links` matching any resolved `user_id` values associated with that `anonymous_id` on that specific site.
3. **PostHog Erasure (Best-Effort):**
   - Asynchronously queries PostHog's API to fetch the Person UUID matching the `distinct_id` (`anonymous_id`).
   - If resolved, dispatches a `DELETE` request to `/api/projects/{project_id}/persons/{person_id}/?delete_events=true` to wipe the person and their raw telemetry events.

### Retention Purge Flow
Enforced automatically each night via the `nightly-attribution` cron job:
- **Paid Tiers:** `runRetentionPurge()` scans the database for sites with `data_retention_days > 0`. It deletes rows from `attributed_conversions` where the `conversion_date` is older than the configured days.
- **Free Tier pageviews:** `runFreeTierPageviewPurge()` deletes rows from `pageviews` older than 30 days to limit database storage.
- **Free Tier auto-archive:** `runFreeTierAutoArchive()` sets `plan = 'archived'` for free sites with no pageview activity in 60+ days.

---

## 2. Third-Party Boundaries & Retained Data

### PostHog Best-Effort Boundary
- **Best-Effort API Calls:** Deleting a visitor's PostHog person and events is non-blocking. If the PostHog API is slow, rate-limited, or unreachable, the local database deletion still succeeds.
- **No Cascade on Account Deletion:** Deleting a site or account in SourceTrack does NOT bulk-delete raw events or person profiles inside PostHog. Raw event data remains in PostHog until it naturally expires under the PostHog project retention settings.

### Stripe Retention Boundary
- **Billing Records Decoupled:** SourceTrack does not propagate account or user deletion requests to the Stripe API. Stripe customer records, subscription history, payment methods, and invoices are kept indefinitely for tax, compliance, and auditing reasons.

---

## 3. Operator Support & Escalation Checklist

When a customer submits a deletion, export, or privacy support request:

- [ ] **Verify Identity:** Ensure the support request originates from the verified email address matching the site owner or account user.
- [ ] **Check Workspace Memberships:** Before performing manual DB interventions, verify if the user belongs to a shared workspace.
- [ ] **Handle Sole Admin Conflicts:** If a user is blocked from account deletion due to the sole admin check:
  - Assist the user in promoting another member to `admin` in the dashboard, or
  - Manually remove the other members from the workspace (if requested and verified), allowing the account deletion to complete.
- [ ] **PostHog Manual Wipes:** For sensitive GDPR/CCPA erasures where a customer demands verified deletion, log in to the PostHog Console to confirm that the person profile and associated raw events were successfully purged.
- [ ] **Stripe Cancellation Check:** Confirm that the user's active Stripe subscriptions are marked as cancelled to prevent future charges.
- [ ] **No Compliance Promises:** When replying to customer inquiries:
  - Do not promise complete deletion from Stripe billing logs.
  - Do not state that raw historical PostHog data is cascade-deleted upon account closure.
  - Explicitly describe erasures outside the database as best-effort.

---

## 4. Operational Checklists

### Staging Verification Checklist (Safe to Test)
- [ ] Trigger visitor deletion on a dummy site key and verify that rows are removed from `attributed_conversions` and `site_identity_links`.
- [ ] Test the sole admin block by creating a company with multiple members, setting the role of the deleting user to admin, and attempting `DELETE /api/gdpr/account`. Confirm the route returns a `409` conflict.
- [ ] Set `retention_days` to `0` (Keep Forever) on a free plan site and confirm it rejects with a `402` plan-gate response.
- [ ] Run the nightly cron tasks locally (`node api/jobs/nightly-attribution.js` pointing to staging) and verify that `runRetentionPurge`, `runFreeTierPageviewPurge`, and `runFreeTierAutoArchive` run correctly.

### Production Incident & Verification Checklist
- [ ] Audit PostHog's API response rates and project logs to verify that person deletions are processed.
- [ ] Monitor the `job_runs` table in the production Supabase editor to ensure that nightly attribution and purge tasks complete without throwing exceptions.

---

## 5. Remaining Risks (P0/P1/P2)

- **P1 — PostHog Data Leakage:** Because account/site deletion does not trigger bulk erasures in PostHog, raw visitor logs for deleted sites remain in the developer's PostHog project. This must be managed via PostHog project-level retention limits.
- **P1 — Non-Blocking Deletion Failures:** If the PostHog API fails during a visitor deletion request, there is no automatic retry queue. The deletion is silently dropped, leaving the PostHog event data behind.
- **P2 — No Export UI:** There is no self-serve "Export my personal data" button in the settings panel. Operators must manually query the database to generate data dumps if requested by users.
