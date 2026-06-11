# SourceTrack Release Checklist Gate — Session 139I-C

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
- [ ] **Stripe Test-Mode E2E Verification**: Run the full Stripe test-mode flow on staging: checkout → webhook → DB write → `pv_limit` applied → usage enforcement → portal cancel → downgrade to inactive.<br />*Status:* **BLOCKED**. No E2E Stripe webhook write tests have been run or logged in the repository.
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

### Phase 2: Blocks the First ~10 Customers / Public Launch (P1)
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
