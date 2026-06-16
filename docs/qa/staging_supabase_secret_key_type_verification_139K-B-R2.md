# Staging Supabase Secret Key Type & Rotation Verification — Session 139K-B-R2

> Date: 2026-06-16
> Session: 139K-B-R2 — Verify Staging Supabase Secret Key Type + Rotation Requirement
> Branch: main
> Latest Commit: `41c7fa9` (Session 139K-B-R)
> Staging Supabase Ref: `nrsvpwzekfrdrzkoecfk`
> Production Supabase Ref: `zxjjjsipafojhzkkumvh` (Strictly Excluded / Untouched)
> Paid Beta Status: 🔴 NOT READY
> Staging Billing Enforcement QA Status: 🔴 BLOCKED

---

## 1. Verdict & Status

🟢 **PASS (Verification Complete)**

The compromised key type has been verified. The exposed key is a modern `sb_secret_...` Secret API key. Staging billing enforcement QA and all sensitive staging mutation tests remain **strictly blocked** until the manual key rotation is completed.

---

## 2. Key Classification Summary

We executed classification scripts to inspect the staging key format in both local and Railway environments without printing key values or partial fragments:

* **Local gitignored `SUPABASE_SERVICE_KEY`**:
  * **Classification**: `modern_supabase_secret_key` (starts with `sb_secret_`)
  * **Presence Status**: `true`
* **Railway Staging API `SUPABASE_SERVICE_KEY`**:
  * **Classification**: `modern_supabase_secret_key` (starts with `sb_secret_`)
  * **Presence Status**: `true`
* **Rotation/Replacement Requirement**:
  * Because the compromised key is a modern `sb_secret_...` Secret API key, the manual recovery path is a targeted **Secret API Key Rotation/Revocation** on the staging Supabase project.
  * **No global JWT secret reset** is needed, ensuring zero downtime for other auth tokens.
  * **No publishable key rotation** is required, as the publishable key remains secure and uncompromised.

---

## 3. Targeted Manual Rotation Runbook

An operator must execute the following manual steps:

1. **Dashboard Access**:
   * Navigate to `https://supabase.com/dashboard`.
   * Open the staging project **sourcetrack-staging** (ref: `nrsvpwzekfrdrzkoecfk`).
2. **Settings Navigation**:
   * Click **Project Settings** (gear icon) > **API**.
3. **Secret API Key Rotation**:
   * Locate the Secret Key (starts with `sb_secret_`).
   * Click **Rotate key** (or create a new secret key first to enable zero-downtime updates).
4. **Local Configuration**:
   * Update `SUPABASE_SERVICE_KEY` in gitignored local `.env` and `.env.local` files with the new key value.
5. **Railway Configuration**:
   * Set the new value in Railway using a no-echo secret prompt to avoid shell logging:
     ```bash
     read -rsp "New staging Supabase service role key: " NEW_STAGING_SUPABASE_SERVICE_KEY
     printf "%s" "$NEW_STAGING_SUPABASE_SERVICE_KEY" | npx @railway/cli variable set SUPABASE_SERVICE_KEY --stdin --service SourceTrack-Api
     unset NEW_STAGING_SUPABASE_SERVICE_KEY
     ```
6. **Old Key Revocation**:
   * Once the new key is active and staging health is verified, delete/revoke the compromised key in the Supabase Dashboard.
7. **Verification**:
   * Verify that the staging `/health` endpoint remains online and healthy.
