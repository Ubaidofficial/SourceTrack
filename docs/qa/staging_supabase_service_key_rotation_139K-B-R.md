# Staging Supabase Service Key Rotation & Secret Hygiene Verification — Session 139K-B-R

> Date: 2026-06-16
> Session: 139K-B-R — Rotate/Replace Staging Supabase Service Key + Secret Hygiene Verification
> Branch: main
> Latest Commit: `b16ee2a` (Session 139K-B)
> Staging Supabase Ref: `nrsvpwzekfrdrzkoecfk`
> Production Supabase Ref: `zxjjjsipafojhzkkumvh` (Strictly Excluded / Untouched)
> Paid Beta Status: 🔴 NOT READY
> Staging Billing Enforcement QA Status: 🔴 BLOCKED

---

## 1. Verdict & Status

⚠️ **OPERATOR BLOCKED**

*Key rotation is not possible programmatically via the available Supabase MCP tools or a global CLI command. Secret key rotation must be performed manually by an operator via the Supabase Dashboard. Staging billing enforcement QA and all sensitive staging mutation tests remain blocked until this manual secret rotation is completed.*

---

## 2. Security Hygiene & Audit Verification

We performed a workspace-wide credentials and repository configuration audit to ensure secret hygiene:

* **Checked Files**:
  * `.env`
  * `.env.local`
  * `.env.staging`
  * `.gitignore`
* **Gitignore & Tracked Files Verification**:
  * Checked ignore configuration:
    * `.gitignore:7:.env`
    * `.gitignore:8:.env.*`
  * Confirmed that `.env`, `.env.local`, and `.env.staging` are untracked (`git ls-files` returned no matches).
* **Targeted Secret Grep**:
  * Executed the following query to verify no raw secrets, keys, or active JWTs are stored in tracked repository code or committed reports:
    ```bash
    grep -RIn "sb_secret_[A-Za-z0-9_-]\{10,\}\|SUPABASE_SERVICE_KEY=.*sb_secret_\|AUTH_TOKEN=\|eyJhbGci" docs SESSION_STATE.md SESSION_LOG.md SESSION_HANDOFF.md api dashboard scripts supabase README.md SYSTEM.md PAID_BETA_SESSION_PLAN.md \
      --exclude-dir=node_modules \
      --exclude-dir=dist \
      --exclude-dir=.git || true
    ```
  * Verified that all output was clean and contained only mock/example configurations, markdown placeholders (`sb_secret_staging_placeholder_replace_me`), and documentation mentions.

---

## 3. Staging Supabase Service Key Exposure Details

* **Compromised Secret**: Local staging Supabase service key (fully configured in gitignored local `.env`, the value was not recorded in the report).
* **Exposure Type**: Local tool log/output from recovery grep during Session 139K-B.
* **Railway Staging API Status**: Railway staging API has `SUPABASE_SERVICE_KEY` configured. The value was not recorded in the report. Because the local staging service key was exposed in prior tool output, the Railway staging value must be treated as affected until an operator manually rotates the staging Supabase service-role key and updates Railway.
* **Production Status**: **UNTOUCHED**. Production database reference `zxjjjsipafojhzkkumvh` and production environment variables are fully isolated and remain secure.

---

## 4. Current Staging API Health Status

* **Staging API Health**: `GET https://sourcetrack-api-staging.up.railway.app/health` returned `HTTP/2 200 OK`.
* **Response Body**: `{"status":"ok", ...}`
* **Meaning**: Staging API is online, but sensitive staging mutation tests remain blocked until manual Supabase service-role key rotation is completed.

---

## 5. Manual Key Rotation Runbook for Operator

The operator must perform the following manual steps to resolve the block:

1. **Supabase Dashboard**:
   * Navigate to `https://supabase.com/dashboard`.
   * Open the project **sourcetrack-staging** (Reference: `nrsvpwzekfrdrzkoecfk`).
   * Go to **Project Settings** (gear icon) > **API**.
   * In the **API Keys** section, locate the `service_role` key.
   * Click **Rotate key** (or generate a new secret key and delete the old one).
2. **Local Environment Update**:
   * Update the gitignored `.env` and `.env.local` files:
     ```env
     SUPABASE_SERVICE_KEY=<new_rotated_service_role_key>
     ```
3. **Railway Environment Update**:
   * Prefer updating `SUPABASE_SERVICE_KEY` through the Railway Dashboard UI so the value is not typed into shell history or printed in tool output.
   * If CLI use is unavoidable, use a no-echo secret prompt pattern and do not print the value:
     ```bash
     read -rsp "New staging Supabase service role key: " NEW_STAGING_SUPABASE_SERVICE_KEY
     printf "%s" "$NEW_STAGING_SUPABASE_SERVICE_KEY" | npx @railway/cli variable set SUPABASE_SERVICE_KEY --stdin --service SourceTrack-Api
     unset NEW_STAGING_SUPABASE_SERVICE_KEY
     ```
4. **Verification**:
   * Verify that the staging API automatically redeploys/restarts.
   * Test API health: `GET https://sourcetrack-api-staging.up.railway.app/health` returns `200 OK`.
   * Run a harmless staging DB query to confirm database connectivity.
