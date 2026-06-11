# SourceTrack Supabase Backup, PITR, and Restore Runbook

**Document Version:** 1.0.0 (Session 139H)
**Readiness Status:** 🚨 **RESTORE READINESS NOT PROVEN / PITR NOT ENABLED**

This runbook defines the operational procedures for managing backups, point-in-time recovery (PITR) review, and staging restore drills for SourceTrack. It serves as the authoritative protocol for the operator to ensure database readiness before paid-beta launch.

---

## 1. Current Status

* **Daily Scheduled Backups:** Daily physical backups have been verified by the operator to run on the production database. Visible physical backups were shown for June 3 through June 10, 2026.
* **Point-in-Time Recovery (PITR):** PITR is **NOT enabled** on the production project.
* **Restore Drill:** No restore drill has been performed. Restore readiness is **NOT proven**.
* **Risk Level:** **HIGH**. The absence of a restore drill and disabled PITR represent open risks. Daily backup visibility is only partial evidence of recoverability until a restore drill has been successfully rehearsed.

---

## 2. Known Supabase Projects

| Environment | Ref Project ID | URL | In-Memory Safety Guard |
|---|---|---|---|
| **Production** | `zxjjjsipafojhzkkumvh` | `https://zxjjjsipafojhzkkumvh.supabase.co` | Yes (API server refuses local boot) |
| **Staging** | `nrsvpwzekfrdrzkoecfk` | `https://nrsvpwzekfrdrzkoecfk.supabase.co` | N/A (Targets local/staging operations) |

---

## 3. What Is Verified

* **Daily Backups Visibility:** The operator has logged into the Supabase Console and verified the presence of daily physical backups for the dates June 3 to June 10, 2026.
* **Staging Infrastructure:** Staging project (`nrsvpwzekfrdrzkoecfk`) exists and is structurally distinct from production.

---

## 4. What Is Not Verified / Open Risks

* **Actual Data Integrity:** Backups have not been mounted, decrypted, or booted. Backups do **NOT** guarantee successful recovery until a restore is successfully completed.
* **Restore Execution Path:** The team has not performed a data restore from a backup file to either staging or production.
* **Recovery Time Objective (RTO):** The time required to restore the database to an operational state has not been measured.
* **Point-in-Time Recovery (PITR) Availability:** PITR is not enabled. In the event of a corrupt transaction or accidental bulk deletion, data can only be rolled back to the last daily physical backup, resulting in up to 24 hours of data loss. PITR remains an open risk unless explicitly accepted by the operator or enabled with separate cost approval.

---

## 5. PITR Approval Rules

1. **PITR Status:** PITR is currently disabled.
2. **Cost Approval Requirement:** PITR incurs additional infrastructure charges in Supabase. Do **not** enable PITR in the Supabase console without explicit written cost approval from the operator.
3. **Open Risk Acceptance:** If the operator chooses not to enable PITR due to costs, the operator must document explicit acceptance of the risk of up to 24 hours of data loss in `docs/release_checklist_gate.md`.

---

## 6. Daily Backup Evidence Requirements

To count as verified weekly, the operator must:
1. Log into the Supabase Console for `zxjjjsipafojhzkkumvh`.
2. Navigate to **Database** -> **Backups**.
3. Confirm that daily backups are created successfully for each of the last 7 days.
4. Log the date range and backup timestamps in the operator journal.

---

## 7. Production Data Safety Controls Before Any Staging Restore

To prevent production data exposure or accidental contact with real customers during a staging restore drill, the operator must verify and implement the following controls before restoring any production backup file to staging:

1. **Explicit Operator Approval:** Do not run the drill until the operator explicitly reviews and approves the use of production backup data in staging.
2. **Access Control:** Confirm staging is not publicly accessible except to approved operators.
3. **Email Sandboxing:** Disable or sandbox outbound email providers in staging (e.g., set Resend API key to sandbox mode or disable cron/sending processes).
4. **Webhook/Integration Sandboxing:** Disable or sandbox outbound webhooks/integrations in staging.
5. **No Customer Contact:** Confirm no staging background job, cron, webhook, report digest, billing sync, or notification path can contact real customers.
6. **Environment Variables:** Confirm staging environment variables point only to staging/test providers (e.g., Stripe test keys, Resend sandbox keys).
7. **Production Traffic Separation:** Confirm no production tracker/snippet/API endpoint points to staging during the drill.
8. **Sensitive Data Protection:** Treat restored data as production-sensitive data.
9. **Data Sharing Prohibition:** Do not share screenshots, exports, or row dumps containing customer/user data.
10. **Post-Drill Cleanup:** After the drill, immediately purge/reset staging data and record cleanup evidence.
11. **Secure Storage:** Store downloaded backup files only in a secure local/operator-controlled directory.
12. **No Synced Folders:** Do not place backup files in Desktop, Downloads, iCloud Drive, Dropbox, Google Drive, Slack, email, or any synced/shared folder.
13. **No Sharing:** Do not attach backup files to issues, chats, tickets, or commits.
14. **No Console Dumps:** Do not print row dumps or secrets from the backup.
15. **Immediate Deletion:** Delete the downloaded backup file immediately after the drill.
16. **Verify Purge:** Empty trash / verify deletion where applicable.
17. **Record Deletion:** Record backup file deletion in the evidence template.
18. **URL Confidentiality:** Treat backup download URLs as secrets; do not paste or log them.

---

## 8. Staging Restore Drill Plan

To safely validate recoverability without mutating the production database, a restore drill must be performed targeting the staging project ref `nrsvpwzekfrdrzkoecfk` using the following steps:

1. **Prepare Staging Environment:**
   * Notify the team that staging will be down for restore testing.
   * Ensure local boot guards remain targeting staging, not production.
2. **Download Production Backup:**
   * In the Supabase Console for `zxjjjsipafojhzkkumvh`, select the latest successful physical backup.
   * Generate a secure download URL and download the `.sql` or compressed database backup file.
3. **Cleanse Staging Database:**
   * **WARNING:** Double check that you are connected to the staging database ref `nrsvpwzekfrdrzkoecfk`.
   * Drop all tables in the staging public schema.
4. **Restore Database schema & data to Staging:**
   * Execute the backup script against the staging database using `psql` or the Supabase CLI:
     ```bash
     psql -h db.nrsvpwzekfrdrzkoecfk.supabase.co -U postgres -d postgres -f <downloaded_backup_file>.sql
     ```
5. **Verify Restore Integrity:**
   * Run sanity queries against staging to confirm schema structure, row counts, and site definitions exist.
   * Boot the local API server in staging mode and confirm that non-mutating routes (e.g., fetching site list, Setup Doctor checks) load correctly.
6. **Purge/Tear Down Staging Data:**
   * After verification, drop/reset staging tables and seed staging test data back to default to ensure no production customer identifiers remain in staging.

---

## 9. Restore Drill Evidence Template

When a drill is executed, the operator must fill out the following template and append it to `docs/operations/supabase_backup_restore_runbook.md` (or a dedicated operations log):

```markdown
### Restore Drill Log - [DATE]
* **Executed By:** [Operator Name]
* **Backup File Date/Time:** [Timestamp of source backup]
* **Target Restore Project:** Staging (`nrsvpwzekfrdrzkoecfk`)
* **Restore Command Run:** [Command string]
* **Restore Status:** [SUCCESS / FAILED]
* **Integrity Validation queries run:**
  1. `SELECT count(*) FROM sites;` -> [Result]
  2. `SELECT count(*) FROM users;` -> [Result]
* **Outbound emails disabled:** [Yes/No]
* **Outbound webhooks disabled:** [Yes/No]
* **Staging access restricted:** [Yes/No]
* **Backup file stored outside synced/shared folders:** [Yes/No]
* **Backup download URL not logged/shared:** [Yes/No]
* **Downloaded backup file deleted after drill:** [Yes/No]
* **Production-sensitive data cleanup completed:** [Yes/No]
```

---

## 10. Actions That Require Explicit Approval

* Performing a restore drill using staging.
* Logging/documenting a completed staging restore drill.

---

## 11. Actions Strictly Forbidden Without Approval

* **Production Restores:** Never run a restore command or drop tables on the production database `zxjjjsipafojhzkkumvh`.
* **Paid Upgrades:** Do not upgrade the Supabase organization or projects to a paid tier.
* **PITR Activation:** Do not click "Enable PITR" or add paid add-ons in the Supabase console.

---

## 12. Paid-Beta Closure Criteria

Before the Supabase Backup & PITR gate can be closed, the operator must complete one of the following:

* **Option A (Enabling PITR):**
  1. Obtain cost approval.
  2. Enable PITR in the Supabase production console.
  3. Rehearse a restore of a PITR timestamp onto staging.
  4. Log the success evidence in the checklist gate.
* **Option B (Risk Accepted with Backups + Drill):**
  1. Document explicit operator risk acceptance of disabled PITR.
  2. Rehearse a daily physical backup restore onto staging.
  3. Log the success evidence in the checklist gate.
