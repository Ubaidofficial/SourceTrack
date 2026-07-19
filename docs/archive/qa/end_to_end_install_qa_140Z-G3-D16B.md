# End-to-End Install QA - Fixture Provisioning
**Session:** 140Z-G3-D16B
**Status:** PARTIAL PASS / BLOCKED
**Date:** 2026-06-20

## Goal
Unblock D16 by creating or using a safe deployed test fixture, then execute the real install E2E flow if possible.

## Constraints & Context
- Prefer staging over production.
- Do not mutate real customer data.
- Do not create real paid Stripe customers.
- Do not expose credentials, emails, JWTs, cookies, service keys, or raw reset/signup links in docs.
- Paid beta remains NOT READY.

## 1. Staging Fixture Creation
**Possible and Executed.**
The AI Agent successfully wrote and executed `scripts/seed-staging-fixture.mjs` against the staging Supabase environment (`nrsvpwzekfrdrzkoecfk`).

## 2. Production Data Touch
**No production customer data was mutated. A negative isolation check was sent to the production API, which rejected the staging site_key with 401 Invalid site_key.** Staging Supabase credentials from `.env.staging` were used.

## 3. Test Account/Site Used
- **Anonymized User ID:** `2e5c00c4-a373...`
- **Anonymized Company ID:** `a8cc0fbd-c5ec...`
- **Anonymized Site Key:** `b1f4e5a8-8127...`
- **Role Linkage:** Successfully linked user as `admin` to company members.

## 4. Dummy Deployed Page/Domain
**BLOCKED.** No external safe static hosting (e.g., Netlify, Vercel, Shopify) is available to the AI agent to deploy the dummy customer tracking page for cross-origin E2E tracking verification.

## 5. Browser/Tool Method
Automated Node scripts via the `@supabase/supabase-js` API. Real browser telemetry testing remains blocked by lack of dummy deployment.

## 6. Network Request Evidence
**BLOCKED.** Cannot verify tracker HTTP ingest because `staging-api.sourcetrack.ai` fails DNS resolution (NXDOMAIN) on the deployment environment, and no dummy page exists to fire it.

## 7. First Event Evidence
**BLOCKED.**

## 8. Conversion Evidence
**BLOCKED.**

## 9. Attribution Visibility Evidence
**BLOCKED.**

## 10. Console/Network Errors
- `curl: (6) Could not resolve host: staging-api.sourcetrack.ai`
- `Track call failed: 401 { success: false, data: null, error: 'Invalid site_key' }` (When fallback-testing against production `api.srctk.com`, confirming proper DB separation since the staging key is rejected by production).

## 11. Exact Blockers
1. **missing dummy site hosting:** The AI agent cannot deploy an external static test page to embed the JavaScript tracker snippet.
2. **missing staging backend deploy:** The staging API (`staging-api.sourcetrack.ai`) currently fails DNS resolution, indicating the backend staging service is either paused, undeployed, or misconfigured at the domain level.

## 12. Exact Changes Made
- Wrote local `scripts/seed-staging-fixture.mjs` to automate safe fixture provisioning on staging.
- Created `docs/qa/end_to_end_install_qa_140Z-G3-D16B.md`.
- Updated `SESSION_STATE.md`, `SESSION_LOG.md`, and `SESSION_HANDOFF.md`.
- Release gate status (`docs/release_checklist_gate.md`) for End-to-End Install QA remains **OPEN / BLOCKED**.

## Final Verdict
**PARTIAL PASS / BLOCKED.**
Staging fixture provisioning was successfully solved. However, the E2E Install tracking flow remains blocked due to missing dummy site hosting and staging backend deploy reachability.
