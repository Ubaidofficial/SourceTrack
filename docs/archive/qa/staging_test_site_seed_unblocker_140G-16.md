# QA Report — Session 140G-16 — Staging Test Site Seed Unblocker

## 1. Task Overview
- **Core Goal**: Create a safe, repeatable, staging-only seed script to create the minimum test site database record required to run the Stripe webhook E2E QA test script (`scripts/qa-stripe-webhook.mjs`).
- **Wording Gate**: Staging test-site seed tooling is implemented and locally dry-run/safety verified; actual staging seed execution and Stripe E2E remain blocked pending staging service-role credentials.

## 2. Implemented Tooling & Modifications

### Staging Seed Script
- [scripts/seed-staging-test-site.mjs](../../scripts/seed-staging-test-site.mjs) `[NEW]`
  - Safely checks environment:
    - **Refuses to run** unless `SUPABASE_URL` targets staging ref `nrsvpwzekfrdrzkoecfk`.
    - **Refuses to run** if `SUPABASE_URL` targets production ref `zxjjjsipafojhzkkumvh`.
    - **Requires** `SUPABASE_SERVICE_KEY` and rejects placeholder keys (like default values or strings under 50 chars).
  - Defaults to printing a **dry-run plan** detailing what it plans to query, insert, or update.
  - Requires the environment variable `ALLOW_STAGING_SEED_MUTATION=true` to execute any database write.
  - Ensures **idempotency** by querying if the stable site key `c0ffee11-babe-41d4-a716-446655440000` exists. If it does and fields are correct, it skips the write; if incorrect, it updates them. If not present, it inserts the test record.
  - Uses only safe deterministic mock data:
    - Site name: `SourceTrack Stripe QA Seed`
    - Site key: `c0ffee11-babe-41d4-a716-446655440000`
    - Domain: `qa-stripe-test.local`
    - Plan: `growth` (required to bypass free tier webhook limits in tests)
    - Webhook secret: `null` (Stripe QA script updates this dynamically)
  - Intercepts insert/update errors and fails with helpful error messages on schema mismatch.

### Stripe Webhook QA Script
- [scripts/qa-stripe-webhook.mjs](../../scripts/qa-stripe-webhook.mjs) `[MODIFY]`
  - Improved the missing site error message to guide the operator to run `npm run qa:seed:staging-test-site` when no test site is present in the database.

### Package Scripts
- [package.json](../../package.json) `[MODIFY]`
  - Exposed the script via `npm run qa:seed:staging-test-site`.

## 3. Verification Details

### Safety Guard Validations
1. **Production Target Guard**: Implemented a hard refusal when `SUPABASE_URL` targets the production database ref; runtime production-ref mutation was not attempted.
2. **Blocked Placeholder Key**: Running the script with the current local `.env` placeholder (`sb_secret_staging_placeholder_replace_me`) correctly blocks write execution, outputs the dry-run checklist, and prints the honest gating status.
3. **No Production Mutation**: Confirmed no writes were performed against any live client database.

### Command Execution Output (Dry Run)
```text
$ node scripts/seed-staging-test-site.mjs
--------------------------------------------------------------------------------
ℹ️ DRY RUN / BLOCKED STAGING SEED RUN
--------------------------------------------------------------------------------
Staging test-site seed tooling is implemented and locally dry-run/safety verified;
actual staging seed execution and Stripe E2E remain blocked pending staging service-role credentials.

To run the actual seed script, you must replace the placeholder key in your .env file with a valid staging service-role key.
--------------------------------------------------------------------------------
```

```text
$ node scripts/qa-stripe-webhook.mjs
==================================================
      Stripe Webhook Ingestion E2E QA Test
==================================================

🔑 Generated temporary ENCRYPTION_KEY for testing.
❌ Failed to retrieve a test site from database.
Please run the staging test site seed script to unblock this test:
  npm run qa:seed:staging-test-site
```

## 4. Required Environment Variables
* `SUPABASE_URL`: Must contain the staging ref `nrsvpwzekfrdrzkoecfk`
* `SUPABASE_SERVICE_KEY`: Must be a valid staging service role token (non-placeholder)
* `ALLOW_STAGING_SEED_MUTATION`: Must be set to `true` to execute writes

## 5. Security & Status Summary
The seed script has been locally syntax-checked and dry-run/safety verified against the current staging URL with a placeholder service key. Actual execution against the staging project remains blocked until the real staging service-role key is provided to replace the current placeholder. Production database remains untouched.
