Session: 138B — Development Workflow Master Plan
Last Completed: Verified repo ground truth and created docs/development_workflow_master_plan.md — the authoritative engineering control document (verdict, readiness grade, P0/P1/P2 matrix, ordered roadmap 138B→144H, AI-agent rules, release checklists, strategy chapters, refactor backlog, production-ready acceptance criteria). Planning-only; no app/backend code changed. Awaiting review before commit.
Control Doc: docs/development_workflow_master_plan.md is now the source of truth for session ordering and gates.

Prior Session: 138A — Safe Non-Mutating QA + Top-Priority Test Backlog
Last Completed (138A): Ran all safe non-mutating QA unit and integration tests (attribution math, GSC token/CTR math, timezone date bucketing, path exclusions, billing helper checks) and verified they all pass. Classified all 33 repository scripts by safety. Created docs/safe_qa_test_backlog.md and documented the gating conclusion.
P0-3 STATUS: REMAINS OPEN — backups and PITR verified disabled in console due to Free tier plan limitation.
🚩 HEADLINE FINDING F6 (P0 staging blocker): No separate staging Supabase project exists. The local .env remains unsafe (wired to production DB zxjj…umvh). Session 135B remains BLOCKED until a staging database is created and wired.
Prior findings still open: 135 F1 stale test prices; 136 F5 local .env points at production DB; 135 F3 pv_limit metadata; 135 F4 request-body redirect URLs.
Verdict (134): CONDITIONAL GO — safe for 3–5 hand-picked single-instance beta customers once P0 conditions met.
Next Task: Operator must upgrade production Supabase to a paid plan and configure a separate staging project before Session 135B or P0-2/P0-3 can be closed.
Roadmap Queue:
- Operator: upgrade production Supabase project, enable backups & PITR, create separate staging Supabase project, and correct Stripe test prices.
- Session 135B — Full Stripe test-mode E2E checkout/webhook/portal run (P0-1 closure) [BLOCKED until staging project is confirmed]
- Billing hardening mini-session — server-side generate/allow-list checkout & portal return URLs (F4, P1)
- Session 138 — Lightweight exception monitoring / Sentry (P1)
- Session 139 — Onboarding validation hardening + email suppression (P1)
Build: ✅ passing (node --check, git diff --check, dashboard vite build, qa:static, required-grep clean)
Branch: main

## Top-Priority Blocked Test Backlog

| Priority | Item | Why Blocked | Unblock Condition | Risk Level | Session | Gating Milestone |
|---|---|---|---|---|---|---|
| **P0** | Create separate staging Supabase project and rewire local/staging env away from production. | Local `.env` currently points to live production Supabase (`zxjjjsipafojhzkkumvh`), making local development of mutating code highly dangerous. | Provision separate staging Supabase project and update local/staging environment variables. | **CRITICAL** | Session 138B | Pre-Paid-Beta |
| **P0** | Upgrade production Supabase to paid plan and enable backups/PITR. | Production Supabase is currently on the Free plan, which disables daily scheduled backups and PITR. | Operator upgrades the production database to a paid tier and enables backups and PITR. | **CRITICAL** | Session 138C | Pre-Paid-Beta |
| **P0** | Full Stripe test-mode E2E after staging DB exists and Stripe test prices are corrected. | Staging database does not exist to receive webhook writes, and Stripe test-mode price amounts ($49/$99/$199) are stale compared to public ones ($29/$79/$149+). | Staging database is provisioned and Stripe test prices are aligned with the new price schema. | **HIGH** | Session 138D | Pre-Paid-Beta |
| **P1** | Billing redirect hardening: generate/allow-list checkout success/cancel and portal return URLs server-side. | Currently checkout redirection parameters (`success_url`, `cancel_url`, `returnUrl`) are accepted raw from request bodies without server-side validation. | Implement server-side allow-list validation and URL generation for billing checkout and customer portal links. | **HIGH** | Session 139A | Pre-Paid-Beta |
| **P1** | Exception monitoring/Sentry test. | Staging environment must verify Sentry exception routing and capturing logic before public release. | Integrate Sentry SDK and run active error-triggering smoke tests on staging. | **MEDIUM** | Session 139B | Pre-10-Customers |
| **P1** | Add qa:attribution, qa:smoke, and qa:edge to CI or required pre-deploy gate. | Mutating tests cannot run in GitHub Actions due to lack of a test database, creating risk of unnoticed logic regressions. | Set up a staging database in the CI pipeline or require manual run gates prior to deploy. | **MEDIUM** | Session 139C | Pre-Paid-Beta |
| **P1** | Onboarding validation hardening test: invalid/PaaS/disposable domains return clean 400. | Onboarding domain validation logic needs to reject disposable or temporary email/PaaS hosts with clean 400 client errors. | Implement domain parsing validation rules and add regression tests. | **LOW** | Session 140A | Pre-10-Customers |
| **P1** | Report digest suppression/unsubscribe test. | Safe transactional emails are set up, but unsubscribe header logic and email suppression lists have not been verified. | Run end-to-end unsubscribe test using Resend mock sandbox. | **MEDIUM** | Session 140B | Pre-10-Customers |
| **P2** | Conversion-cap enforcement or pricing-copy decision. | Monthly conversion limits are displayed in the dashboard but not actively blocked at the ingestion layer. | Implement conversion ingestion count checks or decide on non-blocking soft limit notifications. | **LOW** | Session 141A | Pre-Public-Launch |
| **P2** | Redis/shared rate-limit test before horizontal scaling. | Current rate limiter is in-memory only, which is fine for single-instance paid beta but will fail under multiple instances. | Set up Redis/Upstash connection in staging and assert rate-limiting consistency. | **HIGH** | Session 141B | Pre-Public-Launch |
| **P2** | Staging load tests before high-volume ecommerce. | High-volume ecommerce traffic spikes have not been tested against the synchronous database write paths. | Run k6 load scripts against the staging API connected to a staging database. | **HIGH** | Session 142 | Pre-Public-Launch |

⚠️ WARNING: Before deploying to production, set ST_IP_RESOLVER_MODE=railway on the SourceTrack-Api Railway service. In-memory rate limits are acceptable only for the current single-instance paid-beta deployment (resets on deploy/restart), and a shared store (like Redis/Upstash) is strictly required before horizontally scaling to a multi-instance production environment.
