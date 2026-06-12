# SourceTrack Release Checklist Gate — Session 139K

**Engineering Control Document**
**Readiness Status:** 🚨 **NOT READY FOR PAID-BETA RELEASE** (Blocked by open P0/P1 items)

This checklist serves as the canonical release gate. No paid-beta launch, paid-beta readiness claim, or production release approval may occur until all P0 conditions are explicitly closed with verified evidence.

---

## 1. Release Readiness Summary

| Milestone | Target / Ceiling | Required Gates | Status |
|---|---|---|---|
| **Staging / QA Testing** | Internal only | Staging Supabase provisioned, local boot guard active | ✅ **ACTIVE** |
| **Tiny Paid Beta** | 3–5 users / 10 max | All **P0** items Closed | 🚨 **BLOCKED** |
| **Public Launch / Scaling** | Self-serve public | All **P1** items Closed | 🚨 **BLOCKED** |
| **High-Volume / Enterprise** | Large shops / horizontal scaling | All **P2** items Closed | 🚨 **BLOCKED** |

---

## 2. Canonical Readiness Checklist

### Phase 0: Safe Engineering Foundation (Local & Process)
- [x] **Staging Environment Setup**: Separate Supabase staging project created (ref: `nrsvpwzekfrdrzkoecfk`). Local environment rewired to target staging instead of production.
- [x] **Local Boot Guard**: Reusable environment safety boot guard (`api/lib/environment-safety.js`) implemented and executed early via `api/bootstrap.js`. Server refuses to boot locally if `SUPABASE_URL` contains the production ref (`zxjjjsipafojhzkkumvh`).
- [x] **No-Commit-Before-Review Rule**: Codified in `docs/ai_agent_workflow_rules.md`. No commits/pushes can be run by AI agents before raw diff review and explicit operator approval.
- [x] **Setup Doctor Diagnostic Chain**: Unified `SetupDoctorCard` console, API reachability ping, snippet-only `st_verify` live pageview test checks, and copy truth audits completed.

### Phase 1: Blocks the First Paying Beta Customer (P0 - CRITICAL)
- [ ] **Staging Schema Bootstrap**: Complete database migrations and seeding on the staging project (`nrsvpwzekfrdrzkoecfk`). Refer to [staging_schema_bootstrap_plan.md](operations/staging_schema_bootstrap_plan.md) for details.<br />*Status:* **BLOCKED**. Schema setup is incomplete on staging.
- [ ] **Staging Service-Role Access**: Add the real staging service-role key to gitignored local/staging environment variables.<br />*Status:* **BLOCKED**. Only the placeholder exists.
- [ ] **Stripe Test Catalog Alignment**: Correct and align Stripe test-mode price IDs ($29/$79/$149+) to prevent stale pricing schema mismatch.<br />*Status:* **BLOCKED**. Test catalog is stale.
- [ ] **Stripe Test-Mode E2E Verification**: Run the full Stripe test-mode flow on staging: checkout → webhook → DB write → `pv_limit` applied → usage enforcement → portal cancel → downgrade to inactive.<br />*Status:* **PARTIAL (staging)**. Stripe API/webhook E2E verified on staging (139J). Billing status endpoint bug fixed locally (139J-B: `validateSiteKey` selects `stripe_customer_id`, restoring `/status` subscription lookup, `/portal` for paying customers, and `/create-checkout` customer reuse), but live-on-staging middleware verification is **PENDING** until this commit is pushed/deployed. Staging **Free-plan Billing UI browser-verified** (PASS on the currently deployed staging build). **Still pending:** browser verification of the **portal (paid-site)** flow (NOT VERIFIED), usage-enforcement/downgrade E2E, and **all production billing** (UNVERIFIED). Gate not closed; paid beta remains blocked. See `docs/qa/stripe_staging_e2e_139J.md` and `docs/qa/billing_status_fix_and_ui_139J-B.md`.
- [ ] **Supabase Backups & PITR Verification**: Confirm backup configuration in the Supabase console. PITR is NOT enabled on the production instance (`zxjjjsipafojhzkkumvh`). PITR is not enabled and remains an open risk unless explicitly accepted by the operator. Do not mark this gate closed without either enabling PITR with cost approval or documenting explicit operator acceptance. Daily backups are verified by the operator for June 3-10, 2026. A staging restore drill must be performed. Refer to [supabase_backup_restore_runbook.md](operations/supabase_backup_restore_runbook.md) for details.<br />*Status:* **BLOCKED**. Staging restore drill not completed.
- [ ] **Production Env/Secrets Verification**: Verify production environment variables (`NODE_ENV`, `ST_IP_RESOLVER_MODE=railway`, `ST_LOG_HASH_SECRET`, `TRACKER_SALT`, `ALLOWED_ORIGINS`) are set correctly in the Railway console.<br />*Status:* **BLOCKED**. Console secrets verification not performed.
- [ ] **Billing/Limits Enforcement Audit**: Audit all billing/limit checking middleware to ensure free and active-tier users cannot exceed their monthly thresholds without payment.<br />*Status:* **BLOCKED**.
- [ ] **Production Observability**: Confirm logging levels, dashboard alerts, and key telemetry paths are operational in production.<br />*Status:* **BLOCKED**.
- [ ] **Data Deletion & Privacy Basics**: Ensure manual and automated user deletion routines purge associated personal data correctly from the database.<br />*Status:* **BLOCKED**.
- [ ] **Backup/Recovery Drill**: Execute a dry-run database restore drill using staging to validate the recovery path and improve operational recoverability. Refer to [supabase_backup_restore_runbook.md](operations/supabase_backup_restore_runbook.md) for details.<br />*Status:* **BLOCKED**.
- [ ] **End-to-End Install QA**: Manually test snippet installation and end-to-end visitor telemetry routing from a live non-localhost environment.<br />*Status:* **BLOCKED**.
- [ ] **Full Docs Truth Audit**: Ensure all documentation, troubleshooting steps, and installation instructions accurately match the implemented API and UI features.<br />*Status:* **BLOCKED**.
- [ ] **Support Readiness**: Establish support routing pipelines and triage protocols for incoming customer queries.<br />*Status:* **BLOCKED**.
- [ ] **Legal/Policy Readiness**: Publish customer-facing terms of service, privacy policy, and GDPR data processing addenda matching beta terms.<br />*Status:* **BLOCKED**.
- [ ] **Admin/Operator Access**: Audit and verify operator security credentials, database direct access access rules, and control panels.<br />*Status:* **BLOCKED**.
- [ ] **Abuse/Rate-Limit Review**: Review and tune rate-limiting settings on high-volume ingress routes (/api/collect, login, registration) to mitigate automated abuse.<br />*Status:* **BLOCKED**.
- [ ] **Customer-Facing Status/Incident Plan**: Document customer-facing incident communications protocol, service status reporting, and contact options.<br />*Status:* **BLOCKED**.
- [ ] **Password Reset & Auth Flow Verification**: Implement and verify that forgot password, recovery link redirects, and password updates work correctly end-to-end. Configure and verify allowed redirect URLs and SMTP templates in the Supabase console.<br />*Status:* **PARTIAL — staging password reset E2E PASS after Supabase Auth URL config fix; production/canonical-domain auth still unverified.** Flow implemented & deployed (139N-4B, `3e41f58`); staging auth routes browser-verified PASS (139N-4C/4D). 139N-4D staging email E2E **initially FAILED** (real, documented): reset request submitted PASS and the Supabase recovery **email delivered PASS**, but the recovery link **redirected to `http://localhost:3000/`** (dead) instead of the deployed `/reset-password`. **Root cause = Supabase Auth URL config, not app code**: app already passes `redirectTo=${origin}/reset-password` and consumes the recovery hash, but the deployed URL was not in the **Auth Redirect URLs allowlist**, so Supabase fell back to **Site URL = `http://localhost:3000`** (dev default). **Fix applied (operator, Supabase console — staging & production are SEPARATE Supabase projects; do NOT mix their URLs):** on the staging project (`nrsvpwzekfrdrzkoecfk`) Site URL = `https://sourcetrack-dashboard-staging.up.railway.app` and Redirect URLs include `/reset-password`,`/auth/callback`,`/login` + staging wildcard + `http://localhost:3000/**`; production URLs (`https://www.sourcetrack.ai/**`) stay ONLY in the production Supabase project. **Operator then manually verified the full staging chain PASS**: fresh reset email → link landed on staging `/reset-password` → password update → login after reset → staging `/dashboard` loaded. Secondary follow-up (139N-4E — RESOLVED): `dashboard/src/lib/supabase.js` storageKey is now dynamically derived from `VITE_SUPABASE_URL` project ref to prevent cross-env session collision. **Production/canonical-domain reset remains UNVERIFIED.** Gate not closed until the same chain passes on production with the production Supabase project's Auth-URL config confirmed.


### Phase 2: Blocks the First ~10 Customers / Public Launch (P1)
- [ ] **Attribution Model Deterministic Test Fixtures**: Add deterministic test scenarios for the core attribution models (first-touch, last-touch, linear, U-shaped, W-shaped, time-decay) to protect against regressions.<br />*Status:* **PARTIAL** — deterministic `calculateAttribution` model math is covered by unit tests (`qa:attribution:unit`). Click ID capture/classification hardened for all 12 click IDs with `qa:tracker:unit` tests. Webhook routes now attempt user_id-to-anonymous_id resolution where prior identity links exist (`qa:identity:unit`). Real Stripe/webhook revenue attribution still requires staging E2E with seeded identify + checkout + webhook events.
- [ ] **Exception Monitoring**: Integrate Sentry (or equivalent) exception monitoring on staging and verify alert routing to Slack.<br />*Status:* **BLOCKED**.
- [ ] **Mandatory CI/Pre-Deploy Test Gate**: Add `qa:attribution`, `qa:smoke`, and `qa:edge` to CI or enforce a mandatory local run gate prior to release.<br />*Status:* **BLOCKED**.
- [ ] **Branch Protection & PR Review**: Enforce branch protection on `main` requiring at least one approved code review before merging.<br />*Status:* **BLOCKED**.
- [ ] **HogQL Date Param Sanitization**: Harden date inputs in the attribution engine with proper serialization instead of route-level parsing alone.<br />*Status:* **BLOCKED**.
- [ ] **Tenant Isolation Scoping Audit**: Secure `/api/jobs/attribution/status` so global job runs cannot be read by standard tenants.<br />*Status:* **BLOCKED**.
- [ ] **Stripe Webhook Rate Limiting**: Enforce a rate limiter on the Stripe webhook endpoint to prevent signature-validation floods.<br />*Status:* **BLOCKED**.
- [ ] **Billing Redirect Hardening**: Ensure all billing redirect target URLs are allow-listed or server-derived.<br />*Status:* **BLOCKED**.
- [ ] **Account Deletion PostHog Erase**: Harden account deletion to bulk-erase related visitor events from PostHog.<br />*Status:* **BLOCKED**.
- [ ] **Onboarding Validation Hardening**: Hard subdomains or disposable email addresses return clean `400` errors instead of a `500` crash.<br />*Status:* **BLOCKED**.
- [ ] **Transactional Email Opt-Out**: Verify suppression list/unsubscribe handling for report digests.<br />*Status:* **BLOCKED**.

### Phase 3: Scaling & Architectural Pre-requisites (P2)
- [ ] **Shared State Store**: Move rate limits and webhook idempotency caches to Redis/Upstash before scaling to multiple server instances.<br />*Status:* **BLOCKED**.
- [ ] **Conversion Cap Enforcement**: Enforce conversion ingestion limits backend-side or adjust pricing terms.<br />*Status:* **BLOCKED**.
- [ ] **Synchronous Ingestion Bottleneck**: Re-architect `/api/collect` writes to be asynchronous.<br />*Status:* **BLOCKED**.

---

## 3. Operator Verification Playbook

Before marking this project as "paid-beta ready" or "production ready", the operator must execute the verification steps detailed below and document the results here.

### Checklist Verification Command
An automated, offline-safe checker is wired into the codebase. Run:
```bash
node scripts/qa-release-readiness.mjs
```
This script will check:
1. That `docs/release_checklist_gate.md` exists and declares the project is NOT ready.
2. That all blocked/open P0/P1 items in the release checklist are explicitly flagged as `[ ]` (unchecked) and `BLOCKED` or `PENDING`.
3. That the environment safety guards remain active.
