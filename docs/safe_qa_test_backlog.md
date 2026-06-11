# Safe QA Test Backlog

This document classifies all repository QA scripts by safety, lists tests executed in the current environment, details blocked tests, outlines the top-priority test backlog, and concludes with launch gating criteria.

---

## Scripts Inspected & Safety Classifications

We inspected all **33** scripts under the `scripts/` directory and classified them based on their dependency on external services (Supabase, Stripe, PostHog, Resend) and local server boot behaviors.

| Script Name | Path | Classification | Rationale |
|---|---|---|---|
| **`qa-static-launch-check.mjs`** | `scripts/qa-static-launch-check.mjs` | **SAFE NOW** | Static syntax checks, whitespace scans, forbidden copy regex checks, and Vite dashboard compilation. No database or network requests. |
| **`qa-timezone.mjs`** | `scripts/qa-timezone.mjs` | **SAFE NOW** | Pure unit tests of timezone string validation and local date/week bucketing helper math in `api/lib/utils.js`. |
| **`qa-ai-journey-attribution.js`** | `scripts/qa-ai-journey-attribution.js` | **SAFE NOW** | Offline unit tests for AI platform selection logic and ID batch chunking. No live database connection. |
| **`qa-attribution-harness.mjs`** | `scripts/qa-attribution-harness.mjs` | **SAFE NOW** | Deterministic attribution math checks (Linear, U-Shaped, W-Shaped, Time-Decay) against mock touchpoints. |
| **`qa-billing-helper.mjs`** | `scripts/qa-billing-helper.mjs` | **SAFE NOW** | Pure unit tests of layout trial banners, countdown helpers, and plan maps in `dashboard/src/lib/billing.js`. |
| **`qa-path-exclusions.mjs`** | `scripts/qa-path-exclusions.mjs` | **SAFE NOW** | Offline unit tests for wildcard and exact path exclusion match rules on both client and server side. |
| **`qa-gsc-integration.mjs`** | `scripts/qa-gsc-integration.mjs` | **SAFE NOW** | Verification of OAuth state tokens, URL normalizations, weighted CTR/position math, and copy audit. *(Redirect file Docs.jsx removed from check list)*. |
| **`qa-guard.js`** | `scripts/qa-guard.js` | **SAFE NOW** | Safety guard utility library that blocks running mutating scripts on the production database. |
| **`README_QA.md`** | `scripts/README_QA.md` | **SAFE NOW** | Markdown documentation guide outlining test procedures. Not a runnable script. |
| **`qa-ad-cost-imports.mjs`** | `scripts/qa-ad-cost-imports.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to insert and delete mock campaign costs. Blocks on prod ref `zxjj…`. |
| **`qa-ad-platform-sync.mjs`** | `scripts/qa-ad-platform-sync.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to test ad platform connections and deletes cost rows. Blocks on prod ref `zxjj…`. |
| **`qa-attribution-integration.mjs`** | `scripts/qa-attribution-integration.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase, temporarily updates site trial and plans, inserts temp admin member, and triggers API tracking/conversions. Blocks on prod ref `zxjj…`. |
| **`qa-campaigns-drilldown.mjs`** | `scripts/qa-campaigns-drilldown.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to verify cost aggregation. Blocks on prod ref `zxjj…`. |
| **`qa-cross-domain.mjs`** | `scripts/qa-cross-domain.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to check cross-domain settings. Blocks on prod ref `zxjj…`. |
| **`qa-custom-params.mjs`** | `scripts/qa-custom-params.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to query pageview properties. Blocks on prod ref `zxjj…`. |
| **`qa-dashboard-widgets.mjs`** | `scripts/qa-dashboard-widgets.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to verify dashboard widget positions. Blocks on prod ref `zxjj…`. |
| **`qa-edge-cases.mjs`** | `scripts/qa-edge-cases.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Sends API track and conversion events via fetch. Writing conversions to an API server running on the production DB risks mutating live metrics. |
| **`qa-ip-resolver.mjs`** | `scripts/qa-ip-resolver.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Spawns a local Express API server instance. Because the local `.env` points to the production DB, the booted server is connected to production. |
| **`qa-keyword-reporting.mjs`** | `scripts/qa-keyword-reporting.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to query site details. Blocks on prod ref `zxjj…`. |
| **`qa-managed-proxy.mjs`** | `scripts/qa-managed-proxy.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to test managed proxy custom domains. Blocks on prod ref `zxjj…`. |
| **`qa-payments-api.mjs`** | `scripts/qa-payments-api.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase, spawns server, and sends offline conversions via fetch. Blocks on prod ref `zxjj…`. |
| **`qa-proxy-validation.mjs`** | `scripts/qa-proxy-validation.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Spawns local Express API server instance (connected to production DB) and proxies requests to it. |
| **`qa-rate-limits.mjs`** | `scripts/qa-rate-limits.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Spawns local Express API server instance (connected to production DB) and floods it to trigger limiters. |
| **`qa-referrer-domain-reporting.mjs`** | `scripts/qa-referrer-domain-reporting.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to query site details. Blocks on prod ref `zxjj…`. |
| **`qa-report-security.mjs`** | `scripts/qa-report-security.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to assert cross-site query isolation. Blocks on prod ref `zxjj…`. |
| **`qa-revenue-foundation.mjs`** | `scripts/qa-revenue-foundation.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to check revenue tables and idempotency. Blocks on prod ref `zxjj…`. |
| **`qa-revenue-load.mjs`** | `scripts/qa-revenue-load.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to simulate high-throughput conversion writes. Blocks on prod ref `zxjj…`. |
| **`qa-revenue-provider-reporting.mjs`** | `scripts/qa-revenue-provider-reporting.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to query conversions. Blocks on prod ref `zxjj…`. |
| **`qa-runtime-smoke.mjs`** | `scripts/qa-runtime-smoke.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Sends tracking and conversion events directly to a running API server, risking DB mutations. |
| **`qa-schema-readiness.mjs`** | `scripts/qa-schema-readiness.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase and queries table schemas. Blocks on prod ref `zxjj…`. |
| **`qa-shopify-webhook.mjs`** | `scripts/qa-shopify-webhook.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to temporarily modify Shopify secrets, spawns server, and sends webhooks. Blocks on prod ref `zxjj…`. |
| **`qa-stripe-webhook.mjs`** | `scripts/qa-stripe-webhook.mjs` | **UNSAFE NOW / SAFE ONLY AFTER STAGING DB** | Connects to Supabase to temporarily modify Stripe secrets, spawns server, and sends webhooks. Blocks on prod ref `zxjj…`. |

---

## Safe Tests Run Now

We successfully ran all safe unit and deterministic test suites. No database writes or external network requests were made.

### Baseline Checks
- **Syntax Check:** Syntax verified successfully for all backend route handlers, middlewares, libraries, and `.mjs` script files.
- **Git Cleanliness:** Workspace checked and confirmed clean.
- **Static Suite (`npm run qa:static`):** Verified file mappings, route mounts, security policies, and copy overclaims.
- **Dashboard Compile:** The React dashboard Vite production build compiles successfully with zero warnings.

### Safe Scripts Executed
1. **`qa-attribution-harness.mjs`**: Verified First Touch, Last Touch, Linear, U-Shaped, Time-Decay, and W-Shaped attribution logic.
2. **`qa-timezone.mjs`**: Confirmed Date and timezone helpers function correctly across New York, Tokyo, London, and UTC.
3. **`qa-ai-journey-attribution.js`**: Asserted AI Platforms touchpoint prioritization logic across 10 journey variants and verified visitor ID chunking limits.
4. **`qa-billing-helper.mjs`**: Verified trial statuses and fallback limits.
5. **`qa-path-exclusions.mjs`**: Confirmed wildcard path matching rules behave identically on tracker and backend.
6. **`qa-gsc-integration.mjs`**: Passed OAuth state verification and URL normalizations after removing obsolete `Docs.jsx` redirect file from check boundaries.

*All safe scripts terminated with exit code 0.*

---

## Unsafe Tests Blocked & Intentionally Not Run

The following categories of tests were **intentionally not run** due to production database risks:

1. **Supabase Ingestion & Mutation Tests (`qa-attribution-integration`, `qa-ad-cost-imports`, `qa-schema-readiness`, etc.)**:
   - *Why Blocked:* They require active connection strings and service role credentials. Since the workstation's local `.env` is wired to the live production database (`zxjjjsipafojhzkkumvh`), executing them would write mock records to the live dashboard.
2. **Local Express API Server Boots (`qa-ip-resolver`, `qa-rate-limits`, `qa-proxy-validation`)**:
   - *Why Blocked:* Spawning the Express API server locally boots it with the local `.env` configuration. The local server immediately connects to the live production Supabase instance and begins executing queries or initializing processes against it.
3. **Webhook Ingestion Webhook Runs (`qa-stripe-webhook`, `qa-shopify-webhook`)**:
   - *Why Blocked:* These scripts temporarily update credentials and secrets in the database and then send mock HTTP payloads to local endpoints. This risks breaking webhook integrations in production.
4. **Runtime Smoke & Edge-Case Tests (`qa-runtime-smoke`, `qa-edge-cases`)**:
   - *Why Blocked:* They send track/conversion HTTP requests to the target API, which results in ClickHouse and Supabase writes.

---

## Top-Priority Blocked Test Backlog

These items are moved to the backlog as top priorities. They must be resolved in order before entering the Paid Beta or Public Launch milestones.

| Priority | Item | Why Blocked | Unblock Condition | Risk Level | Session | Gating Milestone | Status |
|---|---|---|---|---|---|---|---|
| **P0** | Create separate staging Supabase project and rewire local/staging env away from production. | Local `.env` currently points to live production Supabase (`zxjjjsipafojhzkkumvh`), making local development of mutating code highly dangerous. | Provision separate staging Supabase project and update local/staging environment variables. | **CRITICAL** | Session 138C | Pre-Paid-Beta | **RESOLVED (Staging `nrsvpwzekfrdrzkoecfk` created. Local `.env`, `.env.local`, and `.env.staging` now target the staging Supabase project ref for URL/publishable-key configuration, but `SUPABASE_SERVICE_KEY` remains a placeholder. Local backend mutation tests remain blocked until the real staging service-role key is manually added to gitignored local env files. No env files are tracked by git.)** |
| **P0** | Upgrade production Supabase to paid plan and enable backups/PITR. | Production Supabase is currently on the Free plan, which disables daily scheduled backups and PITR. | Operator upgrades the production database to a paid tier and enables backups and PITR. | **CRITICAL** | Session 138C | Pre-Paid-Beta | **RESOLVED (Daily scheduled backups were manually verified in the Supabase dashboard by the operator. MCP did not independently expose/verify backup settings. Visible physical backups were shown for June 3 through June 10, with latest visible backup on June 10, 2026. No restore was run. PITR is not enabled / not accepted as enabled. Do not enable PITR without explicit cost approval. Daily backups are now verified; PITR remains an optional but strongly recommended paid add-on / accepted risk if left disabled.)** |
| **P0** | Full Stripe test-mode E2E after staging DB exists and Stripe test prices are corrected. | Staging database does not exist to receive webhook writes, and Stripe test-mode price amounts ($49/$99/$199) are stale compared to public ones ($29/$79/$149+). | Staging database is provisioned and Stripe test prices are aligned with the new price schema. | **HIGH** | Session 139C | Pre-Paid-Beta | **Stripe E2E remains blocked until: 1. staging schema/bootstrap is completed safely; 2. real staging service-role key is added locally/staging-only; 3. local/dev production boot guard is added (Completed in Session 138D via api/bootstrap.js); 4. Stripe test catalog is corrected; 5. billing/webhook E2E runs only against staging** |
| **P1** | Billing redirect hardening: generate/allow-list checkout success/cancel and portal return URLs server-side. | Currently checkout redirection parameters (`success_url`, `cancel_url`, `returnUrl`) are accepted raw from request bodies without server-side validation. | Implement server-side allow-list validation and URL generation for billing checkout and customer portal links. | **HIGH** | Session 139A | Pre-Paid-Beta | **BLOCKED** |
| **P1** | Exception monitoring/Sentry test. | Staging environment must verify Sentry exception routing and capturing logic before public release. | Integrate Sentry SDK and run active error-triggering smoke tests on staging. | **MEDIUM** | Session 139B | Pre-10-Customers | **BLOCKED** |
| **P1** | Add qa:attribution, qa:smoke, and qa:edge to CI or required pre-deploy gate. | Mutating tests cannot run in GitHub Actions due to lack of a test database, creating risk of unnoticed logic regressions. | Set up a staging database in the CI pipeline or require manual run gates prior to deploy. | **MEDIUM** | Session 139C | Pre-Paid-Beta | **BLOCKED** |
| **P1** | Onboarding validation hardening test: invalid/PaaS/disposable domains return clean 400. | Onboarding domain validation logic needs to reject disposable or temporary email/PaaS hosts with clean 400 client errors. | Implement domain parsing validation rules and add regression tests. | **LOW** | Session 140A | Pre-10-Customers | **BLOCKED** |
| **P1** | Report digest suppression/unsubscribe test. | Safe transactional emails are set up, but unsubscribe header logic and email suppression lists have not been verified. | Run end-to-end unsubscribe test using Resend mock sandbox. | **MEDIUM** | Session 140B | Pre-10-Customers | **BLOCKED** |
| **P2** | Conversion-cap enforcement or pricing-copy decision. | Monthly conversion limits are displayed in the dashboard but not actively blocked at the ingestion layer. | Implement conversion ingestion count checks or decide on non-blocking soft limit notifications. | **LOW** | Session 141A | Pre-Public-Launch | **BLOCKED** |
| **P2** | Redis/shared rate-limit test before horizontal scaling. | Current rate limiter is in-memory only, which is fine for single-instance paid beta but will fail under multiple instances. | Set up Redis/Upstash connection in staging and assert rate-limiting consistency. | **HIGH** | Session 141B | Pre-Public-Launch | **BLOCKED** |
| **P2** | Staging load tests before high-volume ecommerce. | High-volume ecommerce traffic spikes have not been tested against the synchronous database write paths. | Run k6 load scripts against the staging API connected to a staging database. | **HIGH** | Session 142 | Pre-Public-Launch | **BLOCKED** |

---

## Paid-Beta Gating Conclusion

> [!IMPORTANT]
> **Conclusion:**
> The staging Supabase project has been created, env files are rewired, and the local/dev API safety boot guard has been implemented via api/bootstrap.js (Session 138D). However, Stripe E2E testing remains blocked until the staging database schema bootstrap is executed, the real service-role key is added, and the Stripe test catalog is corrected.
