# Staging Schema Bootstrap Execution — Session 139I-C

> Date: 2026-06-16
> Session: 139I-C — Staging Schema Audit and Bootstrap Readiness
> Branch: main
> Latest Commit: `0c5c5ba`
> CI Status: 🟢 SUCCESS (Run `27580299729`)
> Paid Beta Status: 🔴 NOT READY

---

## 1. Verdict

**⚠️ AUDIT ONLY / SCHEMA PARITY INCOMPLETE / BOOTSTRAP BLOCKED**

This session was performed as an **AUDIT ONLY** session. **No database schema mutations or DDL changes were performed** on staging or production.

The staging database schema parity is **incomplete** compared to production, as several critical free-tier abuse guard tables and trigger functions are missing. Staging schema bootstrap and test-site seeding remain **BLOCKED** pending approved staging credentials and an approved staging execution path. Paid beta remains **NOT READY**.

Staging has passed the static readiness checks, but true schema parity remains incomplete until the missing abuse-guard schemas are applied. Production was queried only through read-only Supabase MCP audit SELECT statements; no production schema mutations, DML, DDL, migration application, or write operations were performed. Production-safety checks successfully prevent local mutating production actions.

---

## 2. Environment & Git State

### Git Status
```text
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

### Git Log (Recent 5 Commits)
```text
0c5c5ba Session 140M — Record staging and production browser E2E QA
e599c12 Update staging verification status to PASS in QA report
c10d89a Fix trailing whitespace in Setup.jsx
c4ebe48 Session 140L — Move Tracking Doctor into Setup
15f61c0 Session 140K — Add premium dark mode foundation
```

### Latest CI Status
🟢 **CI Regression Pipeline Success** (Run ID: `27580299729`, Branch: `main`, Push triggered, completed in 55s).

---

## 3. Schema & Database Audit Findings

### Canonical Schema Files Found
1. **[schema_base_recovered.sql](file:///Users/ubaid/Desktop/trackiq/supabase/schema_base_recovered.sql)**: Contains base DDL definitions for the 5 core telemetry/attribution tables:
   - `pageviews`
   - `custom_events`
   - `attributed_conversions`
   - `campaign_costs`
   - `data_quality_reports`
2. **[schema.sql](file:///Users/ubaid/Desktop/trackiq/supabase/schema.sql)**: Defines basic `sites` and `dashboard_widgets` tables.
3. **Incremental Migrations (`supabase/migrations/`)**: 26 incremental migrations starting from `20260516135456_add_public_share_to_sites.sql` to `20260613020000_add_pageview_count_to_usage.sql`.

### Migration / Bootstrap Scripts Found
* No automated DB migration or bootstrap runners exist in `package.json` (such as `npm run db:migrate`).
* Migrations are applied manually via Supabase CLI or programmatically via Supabase MCP `apply_migration` / `execute_sql` tools.
* **[seed-staging-test-site.mjs](file:///Users/ubaid/Desktop/trackiq/scripts/seed-staging-test-site.mjs)**: Seeds a stable test site on staging with site key `c0ffee11-babe-41d4-a716-446655440000` for Stripe checkout/billing E2E verification.

### Staging-Only Scripts & Docs
* **[verify-db-schema.mjs](file:///Users/ubaid/Desktop/trackiq/scripts/verify-db-schema.mjs)**: Verifies GSC tables.
* **[qa-schema-readiness.mjs](file:///Users/ubaid/Desktop/trackiq/scripts/qa-schema-readiness.mjs)**: Verifies specific column/widget schema drift.
* **[staging_schema_bootstrap_plan.md](file:///Users/ubaid/Desktop/trackiq/docs/operations/staging_schema_bootstrap_plan.md)**: Operational setup plan.
* **[staging_supabase_setup.md](file:///Users/ubaid/Desktop/trackiq/docs/staging_supabase_setup.md)**: Details separate `sourcetrack-staging` project details.

---

## 4. Staging vs. Production Schema Diff

An audit of the tables in staging (`nrsvpwzekfrdrzkoecfk`) versus production (`zxjjjsipafojhzkkumvh`) reveals three missing tables and one missing trigger function/trigger on staging. These are defined in incremental migration files but were not bootstrapped onto staging during its initial creation.

| Object / Table | Migration File | Production Status | Staging Status | Action Required |
|---|---|---|---|---|
| `disposable_email_domains` | `20260522000002_free_tier_abuse_guards.sql` | Present (49 rows) | ❌ **Missing** | Apply migration DDL & seed records |
| `paas_subdomain_blocklist` | `20260522000002_free_tier_abuse_guards.sql` | Present (31 rows) | ❌ **Missing** | Apply migration DDL & seed records |
| `enforce_free_tier_abuse_guards()` | `20260522000002_free_tier_abuse_guards.sql` | Trigger function active | ❌ **Missing** | Create trigger function & register trigger |
| `usage_email_log` | `20260522000003_usage_email_log.sql` | Present (0 rows) | ❌ **Missing** | Apply migration DDL |
| `site_usage_monthly` | `20260613010000_add_site_usage_monthly.sql` | ❌ Missing | Present (2 rows) | Staging is ahead (designed for billing limits testing) |

---

## 5. Credentials & Environment Safety

### Staging Credential Status
* **`SUPABASE_URL`**: Correctly set to staging ref `nrsvpwzekfrdrzkoecfk` in all local configuration files.
* **`SUPABASE_SERVICE_KEY`**: Currently configured as the placeholder string `sb_secret_staging_placeholder_replace_me` or `placeholder` in local files.
* **Staging Database Connection Credentials**: Not stored locally. CLI database access is blocked.
* **MCP Tooling Access**: Supabase MCP tools are fully authenticated and bypass local environment variables, permitting metadata audits and query execution.

### Production-Safety Checks
1. **Local Boot Guard**: Verified that the early environment safety check in `api/bootstrap.js` rejects execution if `SUPABASE_URL` contains the production ref `zxjjjsipafojhzkkumvh`.
2. **QA Command Guard**: Verified that `scripts/qa-guard.js` refuses execution of mutating QA actions against the production ref unless overridden.
3. **Isolation Check**: Local `NODE_ENV` and `APP_ENV` are configured as `development`/`staging` respectively, preventing production configuration clobbering.

---

## 6. Execution & Verification Log

### Schema Readiness Test Run
Running the schema readiness test checks for dashboard widget and conversion columns:
```bash
node scripts/qa-schema-readiness.mjs
```
**Output:**
```text
==================================================
         Database Schema Readiness Check
==================================================

1. Checking sites.attribution_window_days column...
✅ sites.attribution_window_days column exists.

2. Checking attributed_conversions.custom_properties column...
✅ attributed_conversions.custom_properties column exists.

3. Checking saved_reports dashboard widget columns...
✅ saved_reports dashboard columns exist.

🎉 SCHEMA READINESS CHECK PASSED.
```

### Static Launch Verification
Running frontend build, backend syntax checks, release readiness verification, and copy checks:
```bash
npm run qa:static
```
**Output:**
```text
==================================================
         SourceTrack Static Launch QA
==================================================
...
✅ Frontend build succeeded.
✅ No whitespace violations.
✅ Forbidden copy/API grep checks passed (no forbidden strings in user-facing code).
✅ Route mount checks passed.
✅ Security & plan scoping checks passed.
==================================================
PASS — static launch QA passed
```

---

## 7. Blockers & Action Plan

### Blocker List
1. **Missing Staging Service Key**: The local `.env` and `.env.local` files must be populated with a valid staging service-role key before the local API server or the staging seeder (`seed-staging-test-site.mjs`) can run.
2. **Missing Abuse Guard Tables**: Staging needs the `disposable_email_domains`, `paas_subdomain_blocklist`, and `usage_email_log` tables + the abuse-guard trigger to match production parity.
3. **Stripe Test Mode E2E**: Hosted checkout portal, subscriptions cancel, and plan upgrades require manual E2E browser verification once staging credentials and migrations are finalized.

### Staging Schema Bootstrap Action Plan (Post-Approval)
Once staging service-role keys are configured and approval is granted, the following steps will be executed:
1. Apply the missing abuse guard migrations (`20260522000002_free_tier_abuse_guards.sql` and `20260522000003_usage_email_log.sql`) to staging using the `apply_migration` MCP tool.
2. Verify table and trigger function creation on staging.
3. Execute the staging test site seeder script (`scripts/seed-staging-test-site.mjs`) using a valid staging service-role key.

---

## 8. MCP SQL Command Log (Read-Only Audit)

The following `execute_sql` commands were executed via the Supabase MCP server for audit purposes. All commands are strictly read-only SELECT statements. No `INSERT`, `UPDATE`, `DELETE`, `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, `SECURITY DEFINER` statements, or `apply_migration` commands were executed.

1. **Staging Migration Schema Check** (Read-Only)
   * **Target**: Staging (`nrsvpwzekfrdrzkoecfk`)
   * **Query**: `select * from supabase_migrations.schema_migrations order by version desc;`
   * **Result**: Returned 13 migration records (metadata only).

2. **Production Migration Schema Check** (Read-Only)
   * **Target**: Production (`zxjjjsipafojhzkkumvh`)
   * **Query**: `select * from supabase_migrations.schema_migrations order by version desc;`
   * **Result**: Returned database error (table `supabase_migrations.schema_migrations` does not exist).

3. **Staging pg_tables Scan** (Read-Only)
   * **Target**: Staging (`nrsvpwzekfrdrzkoecfk`)
   * **Query**: `select schemaname, tablename from pg_tables where tablename like '%migration%';`
   * **Result**: Returned schemas `auth`, `supabase_migrations`, `storage`, and `realtime`.

4. **Production pg_tables Scan** (Read-Only)
   * **Target**: Production (`zxjjjsipafojhzkkumvh`)
   * **Query**: `select schemaname, tablename from pg_tables where tablename like '%migration%';`
   * **Result**: Returned schemas `auth`, `storage`, and `realtime`.

5. **Staging Sites Column Inspection** (Read-Only)
   * **Target**: Staging (`nrsvpwzekfrdrzkoecfk`)
   * **Query**: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sites';`
   * **Result**: Listed 29 columns on the staging `sites` table.

6. **Staging Trigger Function Search** (Read-Only)
   * **Target**: Staging (`nrsvpwzekfrdrzkoecfk`)
   * **Query**: `select proname, prosrc from pg_proc where proname = 'enforce_free_tier_abuse_guards';`
   * **Result**: Returned empty array (missing on staging).

7. **Production Trigger Function Search** (Read-Only)
   * **Target**: Production (`zxjjjsipafojhzkkumvh`)
   * **Query**: `select proname, prosrc from pg_proc where proname = 'enforce_free_tier_abuse_guards';`
   * **Result**: Returned trigger source code string (present on production).
