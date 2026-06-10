# Staging Supabase Setup & Production Upgrade Verification

This document records the setup of the separate `sourcetrack-staging` project, the manual upgrade of the production database organization, and the resulting environment configuration.

---

## 1. Environment Details

### Production
* **Project Name:** SourceTrack
* **Project Ref:** `zxjjjsipafojhzkkumvh`
* **Region:** `eu-west-1`
* **Organization Plan:** `pro` (Verified manually/via MCP on 2026-06-10)
* **Backups:** Daily scheduled backups were manually verified in the Supabase dashboard by the operator. MCP did not independently expose/verify backup settings. Visible physical backups were shown for June 3 through June 10, with latest visible backup on June 10, 2026. No restore was run.
* **Point-in-Time Recovery (PITR):** PITR is not enabled / not accepted as enabled. Do not enable PITR without explicit cost approval. Daily backups are now verified; PITR remains an optional but strongly recommended paid add-on / accepted risk if left disabled.

### Staging
* **Project Name:** `sourcetrack-staging`
* **Project Ref:** `nrsvpwzekfrdrzkoecfk`
* **Region:** `eu-west-1` (same as production)
* **Creation Date:** 2026-06-10T23:44:26Z
* **Status:** `ACTIVE_HEALTHY` (Verified on 2026-06-10)
* **Plan:** Standard project inside the Pro organization ($10/month project fee, approved by user)

---

## 2. Safety Controls & Copy Verification
* **No Production Mutation:** Production data was not mutated.
* **No Data Copy/Clone:** No production data was cloned or imported into staging. Staging is a completely clean database.
* **No Key Leakage:** No database passwords, anon/publishable keys, service-role keys, or connection strings are printed or committed to git.
* **Isolation:** Staging environment variables do not use production Stripe, PostHog, Resend, or Google OAuth keys.

---

## 3. Environment Variable Wiring
Local `.env`, `.env.local`, and `.env.staging` now target the staging Supabase project ref for URL/publishable-key configuration, but `SUPABASE_SERVICE_KEY` remains a placeholder. Local backend mutation tests remain blocked until the real staging service-role key is manually added to gitignored local env files. No env files are tracked by git.

> [!IMPORTANT]
> Because the service-role key cannot be retrieved programmatically via the Supabase MCP, a placeholder `sb_secret_staging_placeholder_replace_me` has been placed in `SUPABASE_SERVICE_KEY`. You must copy the real service-role key for `sourcetrack-staging` from your Supabase Dashboard (Settings -> API) and paste it into your local `.env`, `.env.local`, and `.env.staging` files before running local/staging servers.

---

## 4. Current Blockers / Next Steps
Stripe E2E remains blocked until:
1. staging schema/bootstrap is completed safely
2. real staging service-role key is added locally/staging-only
3. local/dev production boot guard is added
4. Stripe test catalog is corrected
5. billing/webhook E2E runs only against staging
