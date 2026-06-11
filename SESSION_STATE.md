Session: 139K — Verify Production Env/Secrets, IP Resolver Mode, CORS, Tracker/API URLs
Last Completed: Audited production and staging environment variable requirements, IP resolution rules, CORS/allowed origin configuration, and tracker URL routing assumptions. Created docs/operations/production_env_verification.md detailing verification checklist. Production environment verification remains blocked pending operator console audit. Local safety guard is active.
Control Doc: docs/development_workflow_master_plan.md is the source of truth for session ordering and gates.
AI-Agent Workflow: AI-agent workflow rules are governed by docs/ai_agent_workflow_rules.md. No AI-agent may commit or push before raw diff review and explicit user approval.

Prior Session: 139I-B — Recover Base Schema Source of Truth
Last Completed (139I-B): Recovered base schema SQL snapshot for the 5 missing core tables from production database metadata and saved it to supabase/schema_base_recovered.sql. Audited file for secrets and data payloads (passed). Updated staging bootstrap plan. Staging bootstrap execution did not run.
Prior Session: 139I — Staging Schema Bootstrap / Safe Schema Setup
Last Completed (139I): Reviewed staging schema bootstrap prerequisites, audited SQL migration risk patterns, identified core database table definitions tracking gap, and created docs/operations/staging_schema_bootstrap_plan.md.
Prior Session: 139H — Production Supabase Backup/PITR Review + Staging Restore Drill Plan
Last Completed (139H): Created a safe, truthful, operator-facing backup/PITR and staging restore drill runbook (docs/operations/supabase_backup_restore_runbook.md), updated the release checklist gate to reference the runbook, and extended QA checks to verify runbook compliance.
Prior Session: 139G — Release Checklist Gate + Paid-Beta Operational Readiness Alignment
Last Completed (139G): Added a real release checklist gate (docs/release_checklist_gate.md) and wired scripts/qa-release-readiness.mjs to verify that all paid-beta and public launch blockers are documented and open. Updated control docs and roadmaps to align on the operational checklist.
Prior Session: 139F — Setup Doctor Docs + User Guidance Truth Audit
Last Completed (139F): Audited and updated setup docs and user-facing guidance to align with the new setup doctor architecture (Session 139C–139E), adding disclaimer callouts regarding verification scope, softening ad blocker statements, and documenting the browser connection check and st_verify token flow.
Prior Session: 139E — Setup Doctor Browser Diagnostics
Last Completed (139E): Added browser diagnostics panel (API reachability /install/ping check) and st_verify token test link builder. Restricted verification token flow and browser reachability diagnostics to snippet mode, and prevented onboarding success from triggering on unsafe domains.
Prior Session: 139D — Consolidate Setup Doctor UI
Last Completed (139D): Consolidated tracking status UI across Dashboard, Snippet, and Onboarding pages into a unified SetupDoctorCard component.
Prior Session: 139C — Add Setup Doctor backend API
Last Completed (139C): Implemented GET /api/install/doctor backend diagnostic endpoint using HogQL queries. Added verification token check, domain match checks, and click parameter detection.
Prior Session: 139A — Add paid attribution setup checklist
Last Completed (139A): Added paid attribution parameter coverage (utm_id, st_campaign_id, st_adgroup_id, st_ad_id, st_target_id, st_network, st_device, st_matchtype) to trackers, ingestion routes, event debugger, and added a Google Ads setup checklist and docs page.
P0-3 STATUS: Daily backups are now verified; PITR remains an optional but strongly recommended paid add-on / accepted risk if left disabled. PITR is not enabled / not accepted as enabled. Do not enable PITR without explicit cost approval.
🚩 HEADLINE FINDING F6 (P0 staging blocker): RESOLVED. Staging database exists (ref `nrsvpwzekfrdrzkoecfk`). Safety boot guard is active in local/dev API server.
Prior findings still open: 135 F1 stale test prices; 135 F3 pv_limit metadata; 135 F4 request-body redirect URLs.
Verdict (134): CONDITIONAL GO — safe for 3–5 hand-picked single-instance beta customers once remaining P0 conditions met.
Next Task: Session 139L — Confirm beta Terms/Privacy disclosure flow before payment. Staging Schema Bootstrap Execution (Session 139I-C) remains blocked pending staging DB connection credentials. Stripe E2E (Session 139J) remains blocked until 139I-C succeeds and is verified.
Roadmap Queue:
- Session 139I-C — Staging Schema Bootstrap Execution (Blocked).
- Session 139J — Stripe Test Catalog Correction + Stripe E2E on Staging Only (Blocked).
- Session 139L — Confirm beta Terms/Privacy disclosure flow before payment.
Build: ✅ passing (node --check, git diff --check, dashboard vite build, qa:static, required-grep clean)
Branch: main

## Top-Priority Blocked Test Backlog

| Priority | Item | Why Blocked | Unblock Condition | Risk Level | Session | Gating Milestone | Status |
|---|---|---|---|---|---|---|---|
| **P0** | Create separate staging Supabase project and rewire local/staging env away from production. | Local `.env` currently points to live production Supabase (`zxjjjsipafojhzkkumvh`), making local development of mutating code highly dangerous. | Provision separate staging Supabase project and update local/staging environment variables. | **CRITICAL** | Session 138C | Pre-Paid-Beta | **RESOLVED (Staging `nrsvpwzekfrdrzkoecfk` created. Local `.env`, `.env.local`, and `.env.staging` now target the staging Supabase project ref for URL/publishable-key configuration, but `SUPABASE_SERVICE_KEY` remains a placeholder. Local backend mutation tests remain blocked until the real staging service-role key is manually added to gitignored local env files. No env files are tracked by git.)** |
| **P0** | Review production Supabase backup/PITR status and document risk/path. | Production Supabase backups must be verified and risk documented. | Review production Supabase backup/PITR status, document current risk/cost requirements, and plan the staging restore drill. Do not upgrade production Supabase or enable PITR without explicit operator/cost approval. | **CRITICAL** | Session 138C | Pre-Paid-Beta | **PARTIAL (Daily backups were manually verified in the dashboard by the operator, but no restore drill has been run. PITR is not enabled and remains an open risk unless explicitly accepted by the operator or enabled with separate cost approval.)** |
| **P0** | Full Stripe test-mode E2E after staging DB exists and Stripe test prices are corrected. | Staging database does not exist to receive webhook writes, and Stripe test-mode price amounts ($49/$99/$199) are stale compared to public ones ($29/$79/$149+). | Staging database is provisioned and Stripe test prices are aligned with the new price schema. | **HIGH** | Session 139C | Pre-Paid-Beta | **Stripe E2E remains blocked until: 1. staging schema/bootstrap is completed safely; 2. real staging service-role key is added locally/staging-only; 3. local/dev production boot guard is added; 4. Stripe test catalog is corrected; 5. billing/webhook E2E runs only against staging** |
| **P1** | Billing redirect hardening: generate/allow-list checkout success/cancel and portal return URLs server-side. | Currently checkout redirection parameters (`success_url`, `cancel_url`, `returnUrl`) are accepted raw from request bodies without server-side validation. | Implement server-side allow-list validation and URL generation for billing checkout and customer portal links. | **HIGH** | Session 140F | Pre-Paid-Beta | **BLOCKED** |
| **P1** | Exception monitoring/Sentry test. | Staging environment must verify Sentry exception routing and capturing logic before public release. | Integrate Sentry SDK and run active error-triggering smoke tests on staging. | **MEDIUM** | Session 140A | Pre-10-Customers | **BLOCKED** |
| **P1** | Add qa:attribution, qa:smoke, and qa:edge to CI or required pre-deploy gate. | Mutating tests cannot run in GitHub Actions due to lack of a test database, creating risk of unnoticed logic regressions. | Set up a staging database in the CI pipeline or require manual run gates prior to deploy. | **MEDIUM** | Session 140C | Pre-Paid-Beta | **BLOCKED** |
| **P1** | Onboarding validation hardening test: invalid/PaaS/disposable domains return clean 400. | Onboarding domain validation logic needs to reject disposable or temporary email/PaaS hosts with clean 400 client errors. | Implement domain parsing validation rules and add regression tests. | **LOW** | Session 140A | Pre-10-Customers | **BLOCKED** |
| **P1** | Report digest suppression/unsubscribe test. | Safe transactional emails are set up, but unsubscribe header logic and email suppression lists have not been verified. | Run end-to-end unsubscribe test using Resend mock sandbox. | **MEDIUM** | Session 140B | Pre-10-Customers | **BLOCKED** |
| **P2** | Conversion-cap enforcement or pricing-copy decision. | Monthly conversion limits are displayed in the dashboard but not actively blocked at the ingestion layer. | Implement conversion ingestion count checks or decide on non-blocking soft limit notifications. | **LOW** | Session 141A | Pre-Public-Launch | **BLOCKED** |
| **P2** | Redis/shared rate-limit test before horizontal scaling. | Current rate limiter is in-memory only, which is fine for single-instance paid beta but will fail under multiple instances. | Set up Redis/Upstash connection in staging and assert rate-limiting consistency. | **HIGH** | Session 141B | Pre-Public-Launch | **BLOCKED** |
| **P2** | Staging load tests before high-volume ecommerce. | High-volume ecommerce traffic spikes have not been tested against the synchronous database write paths. | Run k6 load scripts against the staging API connected to a staging database. | **HIGH** | Session 142 | Pre-Public-Launch | **BLOCKED** |

⚠️ WARNING: Before deploying to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
