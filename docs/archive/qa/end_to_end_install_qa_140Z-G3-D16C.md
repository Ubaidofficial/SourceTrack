# End-to-End Install QA
**Session:** 140Z-G3-D16C
**Status:** PARTIAL PASS / BLOCKED
**Date:** 2026-06-20

## Goal
Execute the full install E2E flow using the deployed staging frontend and staging API, validating tracker ingestion, conversion tracking, and dashboard visibility.

## Context & Constraints
- Production data was NOT mutated.
- The test was performed entirely against the provided deployed staging environment (`https://sourcetrack-dashboard-staging.up.railway.app`).
- No hardcoded secrets, raw emails, passwords, or JWTs are exposed in this document.

## 1. Staging Frontend Result
**PASS** - The staging dashboard successfully loaded via `https://sourcetrack-dashboard-staging.up.railway.app/login`.

## 2. Staging API Base URL Detected
The frontend bundle executes requests against `https://sourcetrack-api-staging.up.railway.app`. This bypasses the previously failing `staging-api.sourcetrack.ai` DNS issue, successfully reaching the live backend.

## 3. Test Account & Site Status
**PARTIAL PASS** - The staging fixture provisioned in D16B was successfully accessed.
- **User ID:** `2e5c00c4-a373...`
- **Site Key:** `b1f4e5a8-8127...`
A programmatic password update was applied using the staging service key to enable dashboard verification.
**CRITICAL SECURITY NOTE:** The staging Supabase service key was present in the raw terminal logs during this test. Treat the staging service key as compromised. The operator must rotate the staging service key. The test password used must also be rotated or the user deleted.

## 4. Dummy Deployed Page Status
**PARTIAL PASS** - A temporary Express server was exposed to the public internet via `localtunnel`. While this successfully simulated an external non-localhost cross-origin integration, it is not a durable deployed dummy customer page. A durable page (e.g., Vercel, Netlify, Railway) is required for a full PASS.

## 5. Tracker Network Evidence
**PASS** - A Playwright browser session visited the `localtunnel` page with `utm_source=e2e_test&utm_campaign=staging_verify`.
- The cross-origin network request to `https://sourcetrack-api-staging.up.railway.app/api/track` returned HTTP 200.
- Note: A standard browser user-agent was used to represent a normal browser visit and ensure the tracker captured the payload.

## 6. First Event Evidence
**PASS** - The pageview event was successfully received. The staging Supabase `sites` table verified that `last_seen_at` and `onboarding_state.last_event_at` updated properly with the simulated page's URL.

## 7. Conversion Evidence
**PASS** - A simulated `sourcetrack('conversion', { event: 'purchase', value: 99.00 })` call was successfully triggered from the dummy page and transmitted to the staging API.

## 8. Attribution Visibility Evidence
**PARTIAL PASS** - A programmatic Playwright script successfully authenticated into the deployed staging dashboard and navigated to the Event Logger. The `"purchase"` event was confirmed to be visible in the UI. However, full source/UTM/referrer/attribution visibility has not yet been proven. Full PASS requires visible proof that the event/conversion preserved source context (e.g., `utm_source=e2e_test`) in the UI.

## 9. Console/Network Errors
- `CORS policy: Request header field bypass-tunnel-reminder is not allowed by Access-Control-Allow-Headers in preflight response.` (This was an artifact of the localtunnel strategy and did not impact the tracker itself).
- No tracker-specific console or network errors occurred during execution.

## 10. UX Findings
The snippet requires adding the `data-site-key` to the `script` tag rather than invoking a `sourcetrack("init", "key")` function call. The UI's "Install" tab properly provides this copy-paste snippet, making it accessible to non-technical users.

## 11. Exact Blockers
1. **Durable Dummy Hosting:** A stable, deployed test page (e.g., Vercel/Netlify) must be provisioned.
2. **Attribution Verification:** Evidence of source/UTM propagation in the dashboard is required, not just conversion receipt.
3. **Key Rotation:** The compromised staging Supabase service key must be rotated.

## Final Verdict
**PARTIAL PASS / BLOCKED**. The tracker correctly receives and persists events/conversions from a cross-origin staging environment, and conversions appear in the dashboard. However, a durable dummy site is missing, UTM/attribution visibility remains unverified, and the staging service key must be rotated.
