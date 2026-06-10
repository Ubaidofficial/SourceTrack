# SourceTrack / TrackIQ Backup and Recovery Plan

This document maps the exact boundaries of data storage, backup capability, and recovery procedures across all services.

## 1. Provider-by-Provider Data Ownership Map

| Provider | Data Managed / Scope | Primary Storage | Backup Mechanism | Restore Path / Recovery Time Objective (RTO) |
| :--- | :--- | :--- | :--- | :--- |
| **Supabase** | Core relational data: users, companies, memberships, sites, API keys, connections, integrations, campaign costs, and local attributed conversions / job runs. | PostgreSQL | Daily database dumps & physical backups. **Supabase backup/PITR status is not verified from this repository. It must be checked in the Supabase project settings before paid beta.** | Database restore via Supabase Console. |
| **PostHog** | Raw telemetry events: pageviews, custom conversions, session properties, and user agents. | ClickHouse (managed by PostHog) | Managed by PostHog SaaS. | Re-querying/analyzing ingested events in PostHog. Ingestion is real-time. |
| **Stripe** | Subscription metadata, pricing maps, customer billing data, payment histories, and invoices. | Stripe SaaS | Managed by Stripe. | Webhook replay from Stripe developers panel / Stripe dashboard reconciliation. |
| **Railway** | Application containers (`api` & `dashboard`), environment configuration, secrets, and deployment history. | Container host & env config registry | Redeployments, version control (Git), and environment configuration history. | Redeployment of prior stable build container. |

---

## 2. Backup Verification Checklist

- [ ] **Supabase Backups:** Log in to the Supabase Console and verify that automatic daily backups are enabled and completing successfully.
- [ ] **PITR (Point-in-Time Recovery):** PITR: not verified. Verify in Supabase settings if PITR is active and under what retention limit (e.g. 7-day or 30-day).
- [ ] **Stripe Audit Log:** Confirm Stripe webhook event history shows a log retention of at least 15 days to allow manual webhook delivery replay.
- [ ] **PostHog Storage:** Verify PostHog retention settings to ensure event history aligns with company policies and paid-beta goals.
- [ ] **Secure Secret Storage:** Ensure all production env secrets, especially `ENCRYPTION_KEY`, are documented in a secure password manager (e.g., 1Password) separate from Railway and GitHub.

---

## 3. Disaster & Incident Recovery Playbooks

### Scenario A: Bad Deployment Recovery
If a release causes API crashes, route failures, or severe regressions in production:
1. Locate the last known stable commit SHA in the repository.
2. Roll back immediately using the Railway 1-Click Rollback button for the target service (`api` or `dashboard`) in the Railway console.
3. > [!IMPORTANT]
   > Railway rollback usually redeploys quickly, but completion must be verified from deployment status, logs, and health checks. Do not assume the rollback succeeded until `/health` returns 200 and logs are clean.

### Scenario B: Bad Database Migration Recovery
If a database migration fails or corrupts the schema:
1. **Strict Database Rollback Policy:** Schema rollbacks are highly migration-specific. Do not execute SQL statements manually on production unless they have been explicitly tested and reviewed.
2. For additive migrations, prefer forward-fix migrations to resolve minor schema errors.
3. If structural corruption occurs, restore the database from the last verified Supabase backup/snapshot. Note: Restoring from a backup will lose data written between the snapshot time and the restoration time.

### Scenario C: Accidental Data Deletion
If a site, workspace, or member is accidentally deleted:
1. If Point-in-Time Recovery (PITR) is active and verified, perform a point-in-time restore to a timestamp immediately preceding the deletion.
2. If PITR is not verified or unavailable, restore the database to the latest nightly backup. Any modifications, pageviews, or conversions recorded after the snapshot will be lost.
3. Telemetry events stored in PostHog are unaffected by Supabase database deletions and can be used to audit or manually reconstruct conversion event histories if necessary.

### Scenario D: Stripe Missed Webhook Recovery
If webhooks fail to deliver due to an API outage, network error, or invalid signature configuration:
1. Log in to the Stripe Dashboard, navigate to **Developers -> Webhooks**, and select the target SourceTrack endpoint.
2. Locate the failed webhook events under the **Event history** tab.
3. Select the failed events and click **Resend** to replay the webhook payload.
4. SourceTrack's `/api/billing/webhook` and `/api/webhooks/stripe` endpoints are fully idempotent (matching against Stripe event IDs in `revenue_ingestion_events`). Replaying webhooks will not duplicate transactions or create duplicate subscription rows.

### Scenario E: PostHog Outage Recovery
If PostHog experiences an outage, or credentials expire, causing `/api/analytics/collect` or ingestion paths to drop pageviews:
1. SourceTrack's API layer runs in a fail-safe configuration; tracking requests return 200 even if the underlying PostHog post fails, preventing client-side scripts from blocking.
2. Direct attribution calculations will be degraded for the duration of the outage because ClickHouse lacks the raw event records.
3. **No Automatic Event Queue:** SourceTrack does not buffer or queue telemetry events during a PostHog outage. Telemetry events missed during the outage are permanently lost and cannot be replayed from the pixel side.

### Scenario F: Cron / Job Failures & Replay Rules
If background sync cron jobs (e.g. `nightly-attribution`, `data-quality-check`) fail to execute or throw alerts:
1. Check execution history in the `job_runs` table in the Supabase database.
2. Identify the failure reason via the job logs or Slack alert details.
3. > [!IMPORTANT]
   > **Rerun Policy:** Rerun only from an approved operator environment with the correct non-production/staging or explicitly approved production env vars. Do not run job scripts locally against production databases unless explicitly approved.
4. For nightly attribution, the script is designed to handle custom backfill ranges safely. If a job fails, the next successful run will cover the missing attribution windows as long as the lookback dates are configured.

---

## 4. Encryption Key (`ENCRYPTION_KEY`) Loss Procedure

> [!WARNING]
> The `ENCRYPTION_KEY` is a critical security parameter used to encrypt client integration credentials (e.g., Stripe webhook secrets, Shopify access tokens).

### What happens if `ENCRYPTION_KEY` is lost?
- If the `ENCRYPTION_KEY` is lost, reset, or changed, all previously encrypted credentials stored in the database become unreadable.
- A new key does **not** recover or decrypt old encrypted tokens; it will cause decryption functions to throw errors (e.g., `Decryption failed` or `bad decrypt`).
- Affected customers will experience integration failures (e.g., Shopify sync or Stripe signature checks failing) and **must reconnect their integrations** via the dashboard to write new encrypted secrets using the new key.
- The key must be backed up securely outside the repository and provider single point of failure (e.g., in a password manager vault) to prevent total integration lockouts.

### Recovery and Prevention Steps
1. **Secure Vaulting:** Store the active production `ENCRYPTION_KEY` in a secure password manager (e.g., 1Password) separate from the Railway project configuration and the Git repository.
2. **Never Commit:** Never commit the key to the codebase, example files, or any markdown documentation.
3. **Verify Configuration:** On server restarts, verify that the `ENCRYPTION_KEY` matches the exact value utilized in the prior active deployment.

---

## 5. Verified vs. Not Verified Recovery Capabilities

- **Railway Rollback:** **Verified.** The 1-click rollback function is verified to redeploy previous container builds.
- **Stripe Webhook Idempotency & Replay:** **Verified.** Webhook replay from the Stripe developers console has been verified to execute safely without duplicating records.
- **Supabase Backups & PITR:** **Not Verified.** Supabase backup/PITR status is not verified from this repository. It must be checked in the Supabase project settings before paid beta.
- **PITR:** Not verified.
- **PostHog Raw Event Replay:** **Not Verified.** Re-ingesting raw telemetry payloads from external backups is not supported by the pixel collectors.
