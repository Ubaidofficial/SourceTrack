# QA Report: Staging Nightly Job Health Repair (Session 139K-H2)

## Verdict

🟢 **PASS**

*The staging `nightly_job` health check warning (`nightly_job — No job runs found in job_runs table`) is resolved. The issue was operational/timing-related: the staging database was recently recreated/re-aligned (Session 139K-B4-D), starting with an empty `job_runs` table. Because `health-agent.js` throws when no job run history is found, the health agent flagged it. The nightly job cron executed successfully at `02:04 UTC` on June 15 and 16, populating the database and automatically restoring the health check to `Overall: OK`. A manual staging-only execution was triggered and completed successfully, verifying the environment's integrity.*

---

## 1. Baseline Repository Status

* **Latest Commit:** `5ea8511 Session 139K-H3-B — Record blocked auth domain rollout`
* **Latest CI Status:** 🟢 Green (Success)
* **Working Tree:** Clean (prior to creating this report)

---

## 2. Health-Agent Findings & Severity

* **Check Behavior:** `api/jobs/health-agent.js` queries the `job_runs` table for the latest `nightly-attribution` job run.
* **Observed Error:** If no row is returned, it throws: `No job runs found in job_runs table`.
* **Severity Classification:** Under `health-agent.js`, the `nightly_job` check is **not** in `CRITICAL_CHECKS` (only `supabase` and `posthog` are). Therefore, a failure here registers as a warning status for the check, setting the system overall state to `WARNING` and exiting the health process with `0`. It is treated as an operational warning rather than a system-down P0 crash.

---

## 3. Audited Components & Files

The following files and environments were inspected during the audit:
* **Files:**
  * [api/jobs/health-agent.js](file:///Users/ubaid/Desktop/trackiq/api/jobs/health-agent.js)
  * [api/jobs/nightly-attribution.js](file:///Users/ubaid/Desktop/trackiq/api/jobs/nightly-attribution.js)
  * [api/lib/supabase.js](file:///Users/ubaid/Desktop/trackiq/api/lib/supabase.js)
  * [api/routes/job-status.js](file:///Users/ubaid/Desktop/trackiq/api/routes/job-status.js)
  * [COMMANDCODE_RUNBOOK.md](file:///Users/ubaid/Desktop/trackiq/COMMANDCODE_RUNBOOK.md)
  * [KNOWN_ISSUES.md](file:///Users/ubaid/Desktop/trackiq/KNOWN_ISSUES.md)
* **Environments & Services:**
  * Railway Project: `determined-reverence` (Staging environment ID `74a58dbc-8a14-4c18-a9c8-2dda1a5b9ee9`)
  * Railway Staging Service `nightly-attribution` (id: `4e064f4e-345b-4954-96f0-db7b4b0bd929`)
  * Railway Staging Service `sourcetrack-health` (id: `f15924b7-3e5f-4e76-9d5f-f01b9832fa83`)
  * Staging Supabase Project ID: `nrsvpwzekfrdrzkoecfk` (staging database)

---

## 4. Railway Staging Service Status & Logs

* **Service Status:** All 6 staging services are verified `SUCCESS` and `Online` in Railway.
* **`nightly-attribution` Logs Summary:**
  * The nightly cron job ran successfully on `2026-06-16 02:04:27 UTC`.
  * Logs from deployment `ab65877a-777d-47cf-a17f-ec5e988e8369` show it identified 4 paid sites with recent activity, processed 1 conversion, completed successfully in 3.05 seconds, and fired a Slack alert before exiting.
* **`sourcetrack-health` Logs Summary:**
  * Logs from the latest cron run on `2026-06-16 21:01:40 UTC` show a clean sweep with `Overall: OK`.
  * The `nightly_job` check passed successfully:
    `✅ nightly_job (796ms) | last_run=2026-06-16T02:04:31.633+00:00 hours_ago=19 conversions=1 job_status=success`

---

## 5. Database & Schema Findings

* **`job_runs` Table Schema:**
  * Schema resides in `public` with RLS enabled.
  * Columns: `id` (uuid, PK), `job_name` (text), `status` (text), `conversions_processed` (int4), `error_message` (text), `duration_ms` (int4), `ran_at` (timestamptz).
* **Recent Job Runs in Database:**
  * Checked database directly via SQL query and confirmed the following run logs exist:
    * `2026-06-15 02:00:36.935+00` (status: `success`, conversions: 4)
    * `2026-06-16 02:04:31.633+00` (status: `success`, conversions: 1)
    * `2026-06-16 21:13:04.480+00` (status: `success`, conversions: 0 - manual verification run)

---

## 6. Root Cause Verdict

1. **Was the job scheduled?** Yes, it is scheduled on Railway cron.
2. **Was the job failing?** No, it completes successfully.
3. **Was it failing to write to `job_runs`?** No, it writes success logs correctly.
4. **Was the health agent querying the wrong table/env?** No, it was querying the correct staging database.
5. **Verdict:** The error was purely a timing/operational artifact of a fresh database setup. Because the database was re-aligned/re-seeded recently, the `job_runs` table was empty until the first nightly cron triggered at `02:00 UTC` on June 15.

---

## 7. Fix/Verification Actions

* **No Code Fix Required:** The health agent has returned to green (`Overall: OK`) since the nightly job executed on schedule.
* **Manual Run Verification:** The final health verification was run locally using Railway-managed staging variables to query the database and verify connectivity, without using inline secret values:
  `railway run --service sourcetrack-health node api/jobs/health-agent.js`
  The check completed successfully with `Overall: OK`.
* **Staging Isolation:** Verified that the staging configuration points to staging Supabase (`nrsvpwzekfrdrzkoecfk`) and has no crossover to production.
* **Security Note:** During staging manual verification, a staging service key was accidentally exposed in command output. The key was treated as compromised, rotated again in the staging Supabase project, re-applied manually to affected Railway staging services, and verified without printing the new value. The old exposed staging service key was confirmed revoked/disabled in the Supabase dashboard. Post-rotation verification used Railway-managed staging variables only, not inline secret values.

---

## 8. Validation Output

```bash
$ git status --short --untracked-files=all
 A docs/qa/staging_nightly_job_health_139K-H2.md

$ git diff --check
# (Passed cleanly with no output)

$ npm run qa:env-safety
==================================================
PASS — Release readiness checklist verified (all blockers open).
==================================================

$ npm run qa:static
==================================================
         SourceTrack Static Launch QA
==================================================
--- A. Git Cleanliness & Log ---
 A docs/qa/staging_nightly_job_health_139K-H2.md
...
--- B. Backend Syntax Checks ---
✅ All backend files syntax passed.
--- C. Frontend Build ---
Running frontend production build...
✅ Frontend build succeeded.
--- D. Whitespace Check ---
✅ No whitespace violations.
--- E. Forbidden Copy/API Grep Checks ---
✅ Forbidden copy/API grep checks passed (no forbidden strings in user-facing code).
--- F. Route Mount Checks ---
✅ Route mount checks passed.
--- H. Security & Plan Scoping Checks ---
✅ Security & plan scoping checks passed.
==================================================
PASS — static launch QA passed
```
