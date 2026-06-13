# SourceTrack PostHog Retention & Purge Operator Runbook

**Document Version:** 1.1.0 (Session 140G-11)
**Readiness Status:** 🟢 **VISITOR ERASURE VERIFIED / ACCOUNT PURGE MANUAL ONLY**

This runbook defines the operational procedures for manual PostHog event retention management, visitor-level erasure workflows, and account-level/site-level data purge verification.

> [!WARNING]
> **OPERATIONAL SCOPE:** This is a manual operator runbook. No automated bulk PostHog deletion tooling currently exists in the SourceTrack codebase. All live event purges must be performed and verified manually by the system operator in the PostHog project console.

---

## 1. Current Deletion Truth

| Deletion Type | SourceTrack/Supabase Database Action | PostHog (External Backend) Action | Status / Verification |
| :--- | :--- | :--- | :--- |
| **Visitor Erasure** | Immediate **hard delete** of matching attribution records (`attributed_conversions`) and identity stitching links (`site_identity_links`). | **Best-Effort Deletion Request:** Sends an asynchronous DELETE request to `/api/projects/{project_id}/persons/{person_id}/?delete_events=true`. | **Best-Effort Only.** If the PostHog API fails, timeout occurs, or rate limits are hit, the request is silently dropped with no retry queue. Verification is pending. |
| **Account Deletion** | Purges workspace membership, company, and site settings tables via cascade SQL constraints. | **None.** Deleting an account does NOT trigger any bulk deletion or purge commands to PostHog. | **Orphaned Events.** Historical raw events from deleted accounts/sites remain in the shared PostHog project until they naturally expire. |
| **Site Deletion** | Database site row is removed when sole owner deletes account. | **None.** No event purges are automatically triggered in PostHog. | **Orphaned Events.** Raw telemetry events remain in PostHog. |

---

## 2. When to Use This Runbook

Operators must execute this runbook under the following circumstances:
1. **Customer Privacy / GDPR / CCPA Requests:** A customer or end-visitor requests that their personal data be permanently deleted.
2. **Account or Site Deletion Follow-Up:** A user closes their account or workspace, requiring the removal of associated raw events from the shared PostHog telemetry instance.
3. **Internal Test Data Cleanup:** Purging test traffic generated during staging drills, onboarding tests, or diagnostic runs.
4. **Ingestion Incident Response:** Remediating accidental ingestion of sensitive PII, passwords, or tokens in event payloads before they propagate.

---

## 3. Required Identifiers for Deletion

To safely locate and delete data without affecting other tenants in the shared PostHog project, the operator must obtain:
* `site_id` (SourceTrack local database UUID)
* `site_key` (SourceTrack public tracking token)
* `distinct_id` or `anonymous_id` (for visitor-level erasure)
* `company_id` or `owner_id` (for account-level validation)

> [!CAUTION]
> **CREDENTIAL SAFETY:** Never copy, paste, or log live API keys (`POSTHOG_PERSONAL_API_KEY`, `POSTHOG_API_KEY`, Supabase service role keys) into support tickets, public chat channels, or documentation files.

---

## 4. Manual Operator Deletion Checklist

Before executing any deletion actions, verify that you are connected to the correct environment and have proper authorization.

### Step 1: Validate Requester Authorization
- [ ] Confirm that the support or deletion request originates from the verified email address matching the workspace owner or the registered site administrator.
- [ ] For visitor erasure requests, ensure the requester has provided the exact `anonymous_id` / `distinct_id` and the corresponding `site_key`.

### Step 2: Execute SourceTrack Native Deletion (If Applicable)
- [ ] **For Visitor-level requests:** Trigger the visitor erasure route `/api/gdpr/visitor` via the admin panel or an authorized API client using the safe `site_key` and `anonymous_id`.
- [ ] **For Account-level requests:** If the user has requested account closure, trigger `/api/gdpr/account` (which deletes DB records in Supabase).

### Step 3: Locate Data in PostHog
- [ ] Log into the official PostHog Console matching the environment (`staging` vs `production`).
- [ ] Navigate to the target project dashboard.
- [ ] **For Visitor Deletion:** Go to **Persons**, search for the target `distinct_id` (`anonymous_id`). Check if the person profile still exists.
- [ ] **For Account/Site Deletion:** Go to **Product Analytics** -> **Live Events** and filter by `properties.site_key = '<target_site_key>'` or `properties.site_id = '<target_site_id>'`.

### Step 4: Perform Manual PostHog Console Deletion
*SourceTrack has not yet verified a safe self-serve or API-based conditional bulk event deletion workflow for PostHog events in the target environment. Perform manual console purging as follows:*

- [ ] **Visitor-level Wipe:**
  1. In the PostHog Console, open the target **Person** page.
  2. Click **Delete Person** and check the box **Delete all events associated with this person**.
  3. Click confirm.
- [ ] **Site/Account-level Event Wipe:**
  1. **BLOCKED:** Site/account-level event purge remains BLOCKED until a safe console/API workflow is verified or operator tooling is implemented and tested.
  2. Events must be left to expire naturally under the global PostHog project retention settings once those settings are verified by an operator, OR
  3. The operator must submit a manual deletion support request to PostHog Cloud specifying the project ID and the site key filter `properties.site_key = '<site_key>'` if immediate compliance is legally required.

### Step 5: Document Results and Evidence
- [ ] Record the date, request type, site identifier, and action taken in the operator journal.
- [ ] Do **not** store any PII (such as raw visitor email addresses or raw IP addresses) in the record.
- [ ] Mark the deletion state as:
  * `COMPLETED` (for Supabase records)
  * `PARTIAL / BEST-EFFORT` (for PostHog visitor-level erasures, subject to asynchronous API delays)
  * `BLOCKED / PENDING RETENTION` (for bulk site/account-level PostHog event purges)

---

## 5. Verification Evidence Requirements

Operators must gather evidence to confirm deletion boundaries while preserving visitor privacy.

### What is Acceptable to Document
* Console api logs showing `DELETE /api/projects/.../persons/...` returned `204 No Content` or `200 OK`.
* PostHog Person search results showing "No persons found matching distinct_id".
* Query results from the Supabase Database Editor confirming `count` is `0` for:
  ```sql
  SELECT count(*) FROM attributed_conversions WHERE site_id = 'site-uuid' AND anonymous_id = 'visitor-id';
  SELECT count(*) FROM site_identity_links WHERE site_id = 'site-uuid' AND anonymous_id = 'visitor-id';
  ```

### What MUST NOT Be Stored
* Never screenshot or copy query results containing raw email addresses, IP addresses, or un-redacted user IDs.
* Never save response JSON bodies that leak other visitors' metadata.

### Standard Phrasing for Disclosures
If a customer requests formal confirmation of deletion:
* **For Visitor deletion:** *"We have successfully deleted the visitor record from our primary database. An erasure command has been sent to our analytics processor, which handles event purges on a best-effort basis."*
* **For Account deletion:** *"Your account and associated site configurations have been permanently deleted from our primary database. Historical raw event logs sent to our analytics pipeline will naturally age out according to our global retention policy."*

---

## 6. Known Failure Modes

1. **Incorrect PostHog Project/Environment:** The operator runs the deletion API or searches the console using the staging token instead of the production token (or vice versa), leaving production data intact.
2. **Missing or Rotated API Keys:** The backend `POSTHOG_PERSONAL_API_KEY` is invalid or expired, causing `/visitor` delete requests to fail with a `401 Unauthorized` or `403 Forbidden` response from PostHog.
3. **No Person UUID Found:** The visitor's `anonymous_id` exists in the local database, but PostHog has not stitched it to a Person profile, or the person was already deleted, causing the deletion chain to skip event purges.
4. **PostHog Cloud Outage or Rate Limits:** High traffic causes PostHog API queries to time out (`AbortError` or `504 Gateway Timeout`), silently dropping the deletion request.
5. **PII Leaked in Deletion Log:** The operator inputs raw customer email addresses instead of anonymous IDs into public ticket logs or verification records.

---

## 7. Paid-Beta Readiness Gate

> [!IMPORTANT]
> **PAID-BETA BLOCKER:** This runbook details operator procedures to manage the current system limitations. It does **not** solve the architectural gaps. Paid beta remains explicitly **BLOCKED** until:
> 1. Live console or API-based verification of visitor erasure is successfully demonstrated on staging.
> 2. Clear instructions or tooling are created to verify how long PostHog takes to execute event deletes.
> 3. Production environment parameters are fully verified.
