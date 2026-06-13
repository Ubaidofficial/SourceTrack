# QA Report — Session 140G-17 — CI Regression Gate Hardening

## 1. Task Overview
- **Core Goal**: Make the GitHub CI regression pipeline enforce the critical local static and unit test suites that are run manually, ensuring that future readiness work cannot regress attribution, tracker, billing/identity, or static launch checks.
- **Wording Gate**: Mandatory CI regression gate is implemented for static, identity/billing, tracker, and attribution unit suites; GitHub Actions verification remains pending until push.

## 2. Implemented Modifications

### GitHub CI Workflow Configuration
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) `[MODIFY]`
  - Renamed step `Run static launch QA checks` to `Static launch QA` for clarity and consistency.
  - Added new mandatory steps running:
    - Identity and billing unit tests: `npm run qa:identity:unit`
    - Tracker unit tests: `npm run qa:tracker:unit`
    - Attribution unit tests: `npm run qa:attribution:unit`

## 3. Enforced CI Scripts
The following test suites are now run automatically on every push and pull request targeting the `main` branch:
1. **Static launch QA** (`npm run qa:static`):
   - Verifies environment variables and runs static release readiness/launch checks.
2. **Identity and billing unit tests** (`npm run qa:identity:unit`):
   - Verifies database-lookup logic, tier limits, customer mappings, and billing redirects.
3. **Tracker unit tests** (`npm run qa:tracker:unit`):
   - Verifies parameters for the standard and cookieless trackers, click ID normalization, AI HogQL validation, and PII sanitization.
4. **Attribution unit tests** (`npm run qa:attribution:unit`):
   - Verifies deterministic attribution model outcomes and HogQL date serialization logic.

## 4. Intentionally Excluded Scripts
The following scripts have been explicitly excluded from the CI regression gate:
* **Stripe Webhook E2E QA** (`node scripts/qa-stripe-webhook.mjs`):
  - **Reason**: Requires a live, seeded database, Stripe signatures, and active network connections. Cannot run reliably in a headless, uncredentialed CI runner.
* **Staging Test Site Seeder** (`npm run qa:seed:staging-test-site`):
  - **Reason**: Performs database mutations and requires valid staging Supabase service-role credentials. Putting mutating scripts in standard PR/push checks is unsafe.
* **Staging/Browser/Live E2E checks**:
  - **Reason**: Depend on external state, browser runtimes, and secrets, introducing high flakiness and security risks.

## 5. Verification Status
- **Syntax / Check Validation**: All files passed syntax checks (`node --check`) and local static checks.
- **Local Test Runs**: All four suites have been run locally and pass cleanly.
- **GitHub Actions Runner Status**: Workflow change locally reviewed; GitHub Actions verification pending after push.
