# SourceTrack Staging Schema Bootstrap Plan

**Document Version:** 1.0.0 (Session 139I)
**Readiness Status:** 🚨 **BOOTSTRAP BLOCKED / NOT EXECUTED**

This document defines the planning, risk audit, and proposed bootstrap commands for setting up the Supabase database schema on the staging environment (`nrsvpwzekfrdrzkoecfk`).

---

## 1. Current Status

* **Execution Status:** Planning and audit are complete. No migration, seed, reset, or schema setup commands have been executed during Session 139I. Staging database remains unmutated. Staging schema bootstrap execution is currently **BLOCKED**.
* **Access Status:** **BLOCKED**. Database connection credentials (host, port, user, password) for staging, as well as the staging service-role API key, are not configured locally. Actual execution is blocked until staging connection credentials are provided.
* **Safety Verification:** Staging ref is confirmed in local env files. No production credentials or configurations are active in local development.
* **Next Task:** **Session 139I-C — Staging Schema Bootstrap Execution**. Session 139J (Stripe E2E) remains blocked until Session 139I-C succeeds and is verified.

---

## 2. Confirmed Supabase Project References

| Environment | Ref Project ID | URL Target |
|---|---|---|
| **Staging** | `nrsvpwzekfrdrzkoecfk` | `https://nrsvpwzekfrdrzkoecfk.supabase.co` |
| **Production** | `zxjjjsipafojhzkkumvh` | `https://zxjjjsipafojhzkkumvh.supabase.co` |

---

## 3. Environment Safety Audit Findings

* **Active Env Files:** `.env`, `.env.local`, and `.env.staging` exist and have been audited.
* **Target URLs:** `SUPABASE_URL` and `VITE_SUPABASE_URL` in all active local env files correctly point to the staging project ref (`nrsvpwzekfrdrzkoecfk`).
* **Production Protection:** The production project ref (`zxjjjsipafojhzkkumvh`) does **not** appear in any active env file (it only exists in `.env.example` as a comment).
* **Service-Role Key Status:** `SUPABASE_SERVICE_KEY` in `.env`, `.env.local`, and `.env.staging` is set to the text string `placeholder`.
* **Verdict:** Local configuration is safe. Local development cannot accidentally hit or mutate production.

---

## 4. Staging Connection & Credentials Requirements

To run `psql` schema setups or database migrations against staging:
* **App-Level Operations:** The API service-role key is required for app-level staging operations (like token verifications or backend sync tasks).
* **Database setups/CLI migrations:** `psql` or CLI database migration commands require **staging database connection credentials** (host, port, user, password) or an approved Supabase CLI database target.
* **Security Control:** Staging connection credentials are not stored in the repository. No database credentials or service-role keys should ever be printed or committed.

---

## 5. Migration & Schema File Inventory

* **Schema Snapshots:**
  * `supabase/schema.sql`: Stale. Defines only `sites` and `dashboard_widgets`. Does not define the core visitor, pageview, event, or attribution tables.
* **Legacy Migrations (`supabase/`):**
  * `migration_session_68_schema_alignment.sql`
  * `migration_workspaces.sql`
  * `migration_saved_reports.sql`
  * `migration_onboarding.sql`
  * `migration_admin_phase2.sql`
  * `migration_server_api_keys.sql`
  * `migration_lead_qualification.sql`
* **Active Migrations (`supabase/migrations/`):**
  * 23 incremental migrations starting from `20260516135456_add_public_share_to_sites.sql` to `20260610120000_align_scale_plan.sql`.
* **Schema Tracking Gap:**
  * **CRITICAL FINDING:** The repository lacks the base `CREATE TABLE` definitions for core telemetry and attribution tables, including `pageviews`, `custom_events`, `attributed_conversions`, `campaign_costs`, and `data_quality_reports`.
  * **Implication:** The schema cannot be bootstrapped from scratch purely using migration files in the repo.

---

## 6. Safe Schema Setup Path Hierarchy

To safely bootstrap staging without exposing customer data or violating safety policies, the bootstrap sequence must follow this hierarchy:

### Preferred Path: Schema-Only Recovery (No Customer Data)
1. **Schema Export:** The operator generates a **schema-only dump/export** from the production database with no customer or user data.
2. **Commit Snapshot:** Commit the recovered base schema as a reviewed migration or schema snapshot in the repository.
3. **Staging Schema Setup:** Apply the schema-only base to the staging database using connection credentials.
4. **Incremental Migrations:** Apply all incremental migrations on top of the base schema.

### Alternative Path: Full Production Backup Restore (Drill/Rehearsal Only)
* Only use a full production backup restore as a separate restore-drill path (to validate restore runbook operations).
* This alternative path must strictly enforce all **Production Data Safety Controls** (Section 7 of `docs/operations/supabase_backup_restore_runbook.md`).
* **WARNING:** Full production-data restore is **not** the default path for staging schema bootstrap. Full restore contains customer/user data, creates data leakage risk, and requires explicit written operator approval. Schema-only recovery is preferred for bootstrapping staging safely.

---

## 7. Exact Proposed Staging Bootstrap Sequence (Preferred Path)

### Step 1: Obtain Staging Database Credentials
* Obtain staging database connection host, port, user, and password (do not commit these).
* Verify staging target is `nrsvpwzekfrdrzkoecfk`.

### Step 2: Apply Schema-Only Base
* Execute the schema-only base dump SQL against staging:
  ```bash
  psql -h db.nrsvpwzekfrdrzkoecfk.supabase.co -U postgres -d postgres -f <schema_only_base>.sql
  ```

### Step 3: Run Incremental Migrations
* Apply any newer migration files in `supabase/migrations/` that were added after the base schema snapshot. Run them in chronological order using `psql`:
  ```bash
  psql -h db.nrsvpwzekfrdrzkoecfk.supabase.co -U postgres -d postgres -f supabase/migrations/<newer_migration>.sql
  ```

---

## 8. Commands Explicitly NOT Run in This Session

To maintain strict planning safety:
* **No pg_dump schema exports were executed.**
* **No psql schema setups or restore commands were executed.**
* **No Supabase CLI command (e.g., `db push`, `db reset`) was executed.**
* **No migrations were run or pushed to staging or production.**

---

## 9. Operator Approval Checklist Before Any Schema Command

Before executing any database setup command targeting staging:

- [ ] Confirm staging target is staging ref `nrsvpwzekfrdrzkoecfk`.
- [ ] Confirm the production ref `zxjjjsipafojhzkkumvh` is **not** target of the command.
- [ ] Staging environment safety controls (Section 7 of Backup Runbook) verified as fully active.
- [ ] Staging database connection credentials obtained.
- [ ] Explicit written operator approval granted.

---

## 10. Rollback/Stop Conditions

1. **Production Ref Check:** If the CLI target or connection target is detected as `zxjjjsipafojhzkkumvh` during setup, abort immediately.
2. **Migration Failure:** If any SQL script fails with an error during the bootstrap sequence, halt immediately, reset staging schema, and audit the logs.

---

## 11. Bootstrap Evidence Log (For Future Execution)

When the schema bootstrap is executed in a future session, the operator must complete the following log and append it to this document:

```markdown
### Schema Bootstrap Execution Log - [DATE]
* **Executed By:** [Operator Name]
* **Schema Source:** [Schema-Only Dump / Backup]
* **Staging Connection Verified:** [Yes/No]
* **Staging Env Safety Controls Verified:** [Yes/No]
* **Base Schema Restored to Staging:** [Yes/No]
* **Pending Migrations Applied:** [Yes/No - list migrations applied]
* **Verification Queries Run:**
  1. `SELECT count(*) FROM pageviews;` -> [Count]
  2. `SELECT count(*) FROM custom_events;` -> [Count]
  3. `SELECT count(*) FROM attributed_conversions;` -> [Count]
* **Bootstrap Status:** [SUCCESS / FAILED]
```

---

## 12. Session 139I-B Recovery Findings

* **Schema-Only Dump Created:** **Yes**. Reconstructed using production database schema metadata via the Supabase MCP metadata query tool.
* **Missing Tables Recovered:** **Yes**. Core table base schemas (`pageviews`, `custom_events`, `attributed_conversions`, `campaign_costs`, `data_quality_reports`) have been recovered and are defined in [schema_base_recovered.sql](../../supabase/schema_base_recovered.sql).
* **Data-Copy Patterns Absent:** **Yes**. Checked and verified that no `COPY` or `INSERT INTO` statements exist in the recovered schema file.
* **Secret Patterns Absent:** **Yes**. Checked and verified that no passwords, tokens, keys, service role keys, or connection URLs are present in the recovered schema file.
* **Staging DB Credentials Available:** **No**. Database connection credentials for staging are not configured locally.
* **Staging Bootstrap Setup Run:** **No**. Execution remains **BLOCKED** pending database connection credentials.
* **Exact Next Step:** The operator must provide database connection credentials (host, port, user, password) for the staging database (`nrsvpwzekfrdrzkoecfk`) to apply `supabase/schema_base_recovered.sql` and run newer migrations, or execute the bootstrap via the Supabase Console / CLI.
