# QA Report: Railway Staging Deploy Triage (Session 139K-B4-D)

## Verdict

🟢 **PASS**

*The Railway staging deploy crash for `sourcetrack-health` has been triaged, resolved, and verified. The crash was caused by a configuration mismatch (a stale `SUPABASE_SERVICE_KEY` environment variable left on cron/job services after the manual rotation in Session 139K-B-R3). The remaining staging jobs were synchronized to the rotated Supabase Secret API key without recording or printing the key value, and `sourcetrack-health` is now online and running successfully. The deployed staging API and dashboard verification path under Session `139K-B4-R` is safe to proceed.*

---

## 1. Triage & Findings

### A. Triage Questions Answered
1. **Which service crashed?**
   * `sourcetrack-health` (a scheduled health-monitoring cron job running every 30 minutes).
2. **Did API staging deploy succeed?**
   * Yes. `SourceTrack-Api` is online (`● Online`) and returns `200 OK` on `/health`.
3. **Did dashboard staging deploy succeed?**
   * Yes. `SourceTrack-Dashboard` is online (`● Online`) and serving index payloads.
4. **Does the crash block `139K-B4-R`?**
   * No. The primary API and frontend flows were fully operational, as the API service possessed the correct rotated service key.
5. **Root cause from logs:**
   * When `sourcetrack-health` ran, it threw:
     ```text
     ❌ supabase — Unregistered API key
     ```
     During the manual Supabase service key rotation in Session 139K-B-R3, only the `SourceTrack-Api` service's variables were updated on Railway. The background job services (`sourcetrack-health`, `sourcetrack-dq`, `sourcetrack-email`, `nightly-attribution`) were left with the stale, revoked `SUPABASE_SERVICE_KEY` value.
6. **Whether fix is needed now or can be deferred:**
   * Resolved immediately. A mismatch of keys on the background attribution/health services would lead to downstream data failures during E2E verification.
7. **Whether deployed billing verification can safely continue:**
   * Yes. The environment is now healthy and aligned.

---

## 2. Resolution & Verification

### A. Environment Variables Synchronization
The staging cron/job services were synchronized to the rotated Supabase Secret API key without recording or printing the key value:
* `sourcetrack-health`
* `sourcetrack-dq`
* `sourcetrack-email`
* `nightly-attribution`

### B. Deployment Status & Logs Verification
* Verified that Railway initiated redeployment of the modified services automatically.
* `npx railway status` confirms `sourcetrack-health` has transitioned from `Crashed` to `Online`.
* Run logs from the subsequent cron execution show clean outputs:
  ```text
  🔍 SourceTrack health check starting...

  Starting Container

  ━━━ Overall: WARNING ━━━
  ✅ supabase (278ms) | rows=1
  ✅ posthog (521ms)
  ✅ api_health (145ms) | status_reported=ok
  ❌ nightly_job — No job runs found in job_runs table
  ✅ sites_count (234ms) | total_sites=0
  ...
  ```
  *(Note: `nightly_job` failure is a warning only because the staging `job_runs` table is currently empty prior to E2E run trials).*
* Staging Supabase database connection successfully validated (`✅ supabase (278ms)`).
