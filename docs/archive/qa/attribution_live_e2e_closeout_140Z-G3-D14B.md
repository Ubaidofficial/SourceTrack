# Attribution Live E2E Closeout Audit
**Session:** 140Z-G3-D14B
**Status:** PARTIAL PASS / BLOCKED
**Date:** 2026-06-20

## Goal
Close the D14 attribution gap by making the controlled attribution integration/E2E test executable and producing real evidence for tracker → ingestion → conversion → attribution behavior.

## 1. Root Cause of `site_key=1` Failure
The `scripts/qa-attribution-integration.mjs` test hardcoded `const siteKey = '1';`. This was a stale development artifact from when `site_key` columns used sequential integers, whereas the current production/staging schema uses UUIDs for `site_key`. Because `'1'` is not a valid UUID format for any seeded site on staging, the Supabase query returned no results, triggering the `Failed to find site for site_key=1` error.

Additionally, checking the staging database revealed that none of the currently seeded test sites have an associated `company_id`. The integration script requires a site linked to a company to properly verify user/company/role permissions during the test setup phase.

## 2. Changes Made
The integration test (`scripts/qa-attribution-integration.mjs`) has been updated to dynamically read the site key from the `SOURCETRACK_SITE_KEY` environment variable. It no longer relies on a hardcoded, stale value. If the environment variable is missing, it fails fast with an explicit error detailing the required operator action.

## 3. Execution Status
`npm run qa:attribution` still **FAILS**.
The script correctly halts early because the `SOURCETRACK_SITE_KEY` environment variable is not provided, explicitly outputting:
`❌ Integration test failed: SOURCETRACK_SITE_KEY environment variable is not set or is invalid.`
`Operator action required: Seed a safe test fixture site on the staging database, then provide its UUID via SOURCETRACK_SITE_KEY to execute live E2E tracking and attribution flows.`

## 4. Live E2E Validation
**Not Verified.**
The live/deployed E2E attribution was not verified because we lack a safe, seeded staging fixture with a valid `company_id` to execute against. We are adhering to the strict rule not to mutate production data or real customer sites for integration testing. Safety grep produced expected code-only token variable references in the integration script; no token values or usable secrets were exposed.

## 5. Release Gate Impact
The release checklist gate for Attribution Accuracy + Signal Reliability remains **PARTIAL / BLOCKED**. It correctly documents that deterministic math passes, but deployed E2E is pending operator action to seed a staging test fixture.

## Final Verdict
**PARTIAL / BLOCKED.** The root cause was identified as a stale hardcoded script expectation, which is now fixed to use a safe environment variable. However, actual E2E verification remains blocked pending operator provision of a dedicated staging test fixture.
