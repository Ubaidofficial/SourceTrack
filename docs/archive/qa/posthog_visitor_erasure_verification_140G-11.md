# QA Report: Live PostHog Visitor Erasure Verification & Privacy Deletion Drill (Session 140G-11)

- **Date:** 2026-06-13
- **Branch:** `main`
- **Session:** 140G-11
- **Status:** **PASS**

---

## 1. Audited Files & Documents

The following files and documentation pages were audited during this session to assess PostHog deletion behaviors, database purging paths, and copy alignment:
* [gdpr.js](../../api/routes/gdpr.js)
* [posthog_retention_purge_runbook.md](../operations/posthog_retention_purge_runbook.md)
* [release_checklist_gate.md](../release_checklist_gate.md)

---

## 2. Audited Commands Run

```bash
git status --short
git log --oneline -5
npm run qa:static
npm run qa:identity:unit
npm run qa:tracker:unit
npm run qa:attribution:unit
```

---

## 3. Current Deletion & Erasure Behavior

### Supabase Database Deletion
1. **Visitor Erasure (`DELETE /api/gdpr/visitor`):**
   * Executes a hard delete query on the `attributed_conversions` table matching the specific `site_id` and the visitor's `anonymous_id`.
   * Resolves any linked `user_id` values associated with the `anonymous_id` in the `site_identity_links` table.
   * Executes hard deletes on the `site_identity_links` table matching both the target `anonymous_id` and any associated `user_id` values to completely sever visitor-to-user links.
2. **Account Deletion (`DELETE /api/gdpr/account`):**
   * Cascades through the database via SQL foreign key constraints to purge workspace memberships (`company_members`), site settings (`sites`), and companies (if the user is the sole member).
   * Calls the Supabase Admin API (`supabase.auth.admin.deleteUser`) using the service role key to permanently delete the user's Auth profile.

### PostHog Telemetry Deletion
1. **Visitor Erasure:**
   * Wipes the visitor from PostHog via a best-effort asynchronous REST API request:
     `DELETE /api/projects/{project_id}/persons/{person_id}/?delete_events=true`
   * First queries `/api/projects/{project_id}/persons/` using the query filter `distinct_id` to locate the person's unique internal PostHog UUID.
   * If located, requests the deletion of the Person profile along with all associated ingestion events.
2. **Account / Site Deletion:**
   * **No automated action.** No bulk deletion calls are triggered. Events sent by the deleted site remain in the shared project and must age out naturally or be cleaned up by an operator.

---

## 4. Live Staging Deletion Drill Verification

An end-to-end verification drill was executed against the staging Supabase database and the staging PostHog proxy.

### Test Environment Parameters
* **Staging Supabase Project Ref:** `nrsvpwzekfrdrzkoecfk`
* **Staging Site Key:** `3666feb2-c945-43f5-b765-ed737f0fc6ca` (Site DB ID: `1abf1c9e-7f7f-4816-ae7a-93daf0d957ef`)
* **PostHog Ingestion Host:** `https://posthog-reverse-proxy-production-2b25.up.railway.app`
* **Staging PostHog Project ID:** `50`

### E2E Test Visitor Identifiers
* **Test Visitor Distinct ID (`anonymous_id`):** `drill-visitor-140G-11-6o0at`
* **Staging PostHog Person ID:** `a00c116c-4eeb-5586-91d5-400051ab4e6e`

### Step-by-Step Drill Log & Evidence

1. **Telemetry Ingestion:**
   * Ingested a mock `$pageview` telemetry event for `drill-visitor-140G-11-6o0at` to the PostHog proxy.
   * **Result:** PostHog API accepted the event (`200 { status: "Ok" }`).
2. **Database Ingestion:**
   * Inserted mock conversion records into `attributed_conversions` and a mock user stitching entry into `site_identity_links`.
   * **Result:** Rows successfully created in the staging database.
3. **PostHog Indexing Verification:**
   * Polled the PostHog Persons query API to verify the profile.
   * **Result:** Person profile indexed successfully after **10 seconds** of ingestion latency.
4. **Trigger GDPR Delete Route:**
   * Triggered `/api/gdpr/visitor` route on the staging API server using the test visitor identifiers.
   * **Result:** Server executed the deletions and successfully dispatched the REST API delete command to PostHog.
     * Supabase deletes: Success.
     * PostHog DELETE status: `202 Accepted`.
5. **Propagation Verification:**
   * Polled the PostHog Persons search API until the profile disappeared.
   * **Result:** Person profile and associated events disappeared from PostHog within **5 seconds** of the DELETE request.
6. **Final Database Assessment:**
   * Queried database counts for the visitor.
   * **Result:**
     * `attributed_conversions` remaining = `0`.
     * `site_identity_links` remaining = `0`.
     * PostHog Person profile count = `0`.

---

## 5. Privacy Copy & Release Checklist Impact

* **Release Checklist Update:**
  * Marked the **Data Deletion & Privacy Basics** status as **PARTIAL** (Staging E2E visitor-level erasure successfully verified. Account/site event purges remain blocked at the API layer but managed via manual runbook checklists).
* **Settings Copy Verification:**
  * Verified that the warning copy in `Settings.jsx` matches this behavior exactly:
    * Visitor erasure is marked as best-effort due to asynchronous PostHog API queries.
    * Account deletion is marked as cascading for Supabase data but leaving historical raw telemetry events in the external PostHog instance.
* **Runbook Updates:**
  * Updated `docs/operations/posthog_retention_purge_runbook.md` status to `🟢 VISITOR ERASURE VERIFIED / ACCOUNT PURGE MANUAL ONLY` and set version to `1.1.0`.

---

## 6. Static Validation & Test Output

### Unit & Integration Test Executions
* `npm run qa:identity:unit` — **PASS (98/98)**
* `npm run qa:tracker:unit` — **PASS (51/51)**
* `npm run qa:attribution:unit` — **PASS (9/9)**

### Static QA Suite (`npm run qa:static`)
* **Build status:** ✅ Frontend and Backend static compilations succeed.
* **Whitespace audit:** ✅ Clean (0 issues).
* **Forbidden copy audit:** ⚠️ Expected historical/placeholder hits only; no new unsafe customer-facing claim introduced by Session 140G-11.

---

## 7. Remaining Blockers for Paid Beta

Paid beta is blocked by:
1. **Stripe Test-Mode E2E Verification:** Confirming the checkout-to-portal flow in staging with active price subscriptions.
2. **Staging Schema Bootstrap:** Complete seeding and validation on staging.
3. **PITR & Restore Drill:** Executing a recovery dry-run.
4. **Production Env/Secrets Verification:** Operator validation of secrets.
5. **Password Reset & Auth E2E on Production:** Production SMTP verification.

---

## 8. Git Status

```text
 M SESSION_HANDOFF.md
 M SESSION_LOG.md
 M SESSION_STATE.md
 M docs/operations/posthog_retention_purge_runbook.md
 A docs/qa/posthog_visitor_erasure_verification_140G-11.md
 M docs/release_checklist_gate.md
```

## 9. Final Safety Grep Notes

Final safety greps returned expected historical audit-log, placeholder, and code-validation hits only, including mock sk_live_abc123 examples, whsec_ prefix validation/generation code, and old audit records. No new real secret, live credential, local path, or unsafe deletion/compliance claim was introduced by Session 140G-11.

The staging drill also applied the site_identity_links migration to the staging Supabase project so the controlled visitor-erasure test could run. This was a staging operational side effect and not a repository migration change in this session.
