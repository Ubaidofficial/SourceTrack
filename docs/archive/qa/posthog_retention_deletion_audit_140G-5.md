# QA Audit Report: PostHog Retention & Data Deletion Enforcement (Session 140G-5)

- **Date:** 2026-06-13
- **Branch:** `main`
- **Session:** 140G-5
- **Status:** **COMPLETE (Audit-Only / Not Implemented)**

---

## 1. Audited Files & Documents

The following files and documentation were audited during this session to assess data deletion completeness, retention configurations, and PII minimization:
* `api/routes/gdpr.js`
* `api/lib/posthog.js`
* `api/routes/track.js`
* `api/routes/proxy.js`
* `api/lib/utils.js`
* `dashboard/src/pages/Settings.jsx`
* `docs/privacy_reality_map.md`
* `docs/privacy_request_operational_drill.md`
* `docs/legal_policy_readiness.md`
* `docs/release_checklist_gate.md`
* `SESSION_STATE.md`
* `SESSION_LOG.md`
* `SESSION_HANDOFF.md`

---

## 2. Current Deletion Behavior

### Visitor Erasure (`DELETE /api/gdpr/visitor`)
* **What is deleted:** Scoped strictly to the site owner or authorized workspace member. Deletes all SQL rows matching the visitor's `anonymous_id` from the Supabase `attributed_conversions` table. Deletes mappings matching the `anonymous_id` and any resolved `user_id` values on that specific site from the `site_identity_links` table.
* **PostHog propagation:** Sends a best-effort, asynchronous `DELETE` request to the PostHog REST API:
  `/api/projects/{project_id}/persons/{person_id}/?delete_events=true`
  This is intended to request deletion of the PostHog person profile and associated raw events where the provider API supports it. Success is best-effort and is not currently retried or independently verified by SourceTrack.
* **Limitations:** If the PostHog API request fails (e.g. timeout, rate limit), the deletion is silently dropped with no retry queue.

### Account Deletion (`DELETE /api/gdpr/account`)
* **What is deleted:** Purges all SQL rows for the user's workspace, including sites, company memberships, company details, and the user's Supabase Auth record. Cascade constraints (`ON DELETE CASCADE`) remove associated saved reports, API keys, and webhook destinations.
* **What is NOT deleted:** Account deletion does **not** trigger any bulk deletion commands to PostHog. Historical raw telemetry events for the deleted account's sites remain in the shared PostHog project.
* **Stripe logs:** Decoupled. Stripe customer records, subscriptions, and invoice logs are retained indefinitely for tax and legal compliance.

### Site-Level Deletion
* **Site Deletion:** An individual "Delete Site" endpoint does **not** exist in the codebase. Sites can only be deleted in bulk when the sole owner deletes their entire account.

---

## 3. PostHog Deletion & Query Boundary

* **Visitor/Person Deletion:** Supported via the REST API.
* **Site Event Deletion:** Unsupported in code. SourceTrack has no verified, implemented, operator-safe mechanism for mass conditional event deletion by site/account. Any PostHog bulk deletion capability must be verified against the current provider API before tooling is built.
* **Account Event Deletion:** Unsupported in code. Deleting a company does not bulk-delete its events from PostHog.
* **Manual Console Actions:** Raw historical events must be managed via the PostHog console (e.g., global project retention settings or manual deletion tools).
* **Identity Collisions:** In a shared PostHog project, if two sites ingest events using the same non-unique `anonymous_id`, deleting the visitor/person on Site A may delete the events and person profile for Site B.

---

## 4. Data Retention Boundary

* **SourceTrack Code:** Retention of raw PostHog events is not managed or configured in the SourceTrack codebase.
* **Global Retention:** Event retention is global and configured in the PostHog project settings console.
* **Tenant-Specific Retention:** Does **not** exist. All customer sites share the same `POSTHOG_PROJECT_ID` and are bound by the same global project retention period.
* **Archived/Inactive Sites:** Do not trigger any PostHog cleanup. Their historical events persist in PostHog until they naturally age out.

---

## 5. PII Minimization & Sanitization

* **Standard Ingestion (`api/routes/track.js`):** Client payloads are sanitized via `redactPiiFromObject` on `req.body` and `req.body.properties`.
* **Proxy Ingestion (`api/routes/proxy.js` - `/sp/e` and `/sp/c`):** **Severe Gap.** The proxy route handlers do not sanitize client payloads or invoke `redactPiiFromObject`. All PII (including query string parameters and custom properties) is forwarded directly to PostHog.
* **URL Query Redaction:** `redactPiiFromUrl` parses URLs and replaces values of common PII keys in query strings with `'REDACTED'` (or `'[REDACTED]'` in subsequent phases).
* **Object-Level Redaction:** **Severe Gap.** Direct properties in the JSON payload (e.g., `properties.email` or `properties.phone`) are **not** redacted in standard or proxy routes. Only URL fields are scanned.
* **PII Keys Checked:**
  `email`, `e`, `user_email`, `customer_email`, `phone`, `tel`, `mobile`, `first_name`, `last_name`, `full_name`, `name`, `password`, `pass`, `token`, `access_token`, `refresh_token`, `auth`, `key`, `api_key`, `secret`, `checkout_id`, `session_id`, `invite`, `invite_code`, `auth_code`, `reset_code`, `verification_code`, `code_verifier`.

---

## 6. User-Facing Truthfulness & UI Mismatch

* **Visitor Erase Copy (Settings):** Truthful. Discloses that Supabase records are deleted immediately, PostHog is best-effort, and Stripe is unaffected.
* **Settings Page Account Deletion Copy:** **Severe Mismatch.** Danger Zone copy states that sites are permanently deleted, but fails to disclose that raw historical pageview/event logs are retained in PostHog.
* **Documentation vs UI:** The internal developer documentation (`docs/privacy_reality_map.md` and `docs/privacy_request_operational_drill.md`) is fully transparent. The user-facing dashboard UI lacks this transparency.

---

## 7. Audit Risks

* **PostHog Data Leakage (P1):** Account/site deletion leaves raw visitor event logs orphaned in the shared PostHog project.
* **Proxy PII Leakage (P1):** Raw query parameters and custom properties containing PII sent via proxy subdomains are stored in PostHog unredacted.
* **Custom Event PII Leakage (P1):** Object-level custom properties (e.g., `email`, `phone`) bypass URL-only redaction rules.
* **No Tenant-Level Retention (P1):** Data retention settings cannot be configured per-tenant.
* **Lack of Operator Purge Tooling (P2):** There is no operator script or safe runbook to purge PostHog events for deleted sites.

---

## 8. Proposed Implementation Phases

### Phase A: PII Sanitization Hardening
* Harden `api/lib/utils.js` by expanding `redactPiiFromObject` to recursively scan objects and redact direct properties (e.g., `email`, `phone`, `password`, `name`, `street`, `zip`, `api_key`).
* Protect proxy routes (`api/routes/proxy.js` - `/sp/e` and `/sp/c`) by sanitizing payloads before `ph.capture`.
* Add unit and integration tests covering the new redaction rules and proxy route sanitization.

### Phase B: UI/Docs Truth Hardening
* Update `dashboard/src/pages/Settings.jsx` Danger Zone copy to explicitly state that account deletion does not bulk-delete historical analytics events from the data provider.
* Update documentation files to maintain this realistic compliance posture.

### Phase C: Operator Runbook
* Create `docs/operations/posthog_data_deletion_runbook.md` detailing manual console step-by-step procedures for event purges, verification checklists, and tenant isolation safeguards.

### Phase D: PostHog API Verification & Optional Purge Tooling
* Verify PostHog API behavior for bulk event deletions.
* If confirmed safe and feasible, build a confirmed-only, site-specific CLI purge tool (`scripts/posthog-site-purge.js`) with dry-run protection and rate-limiting.

---

## 9. Remaining Blockers
* Paid beta remains blocked by the remaining open release gates, including PostHog retention/deletion handling, proxy/object-level PII sanitization, paid billing portal verification, production billing verification, production env/secrets verification, tenant isolation, privacy/deletion live verification, observability, backup/restore drill, install QA, docs truth audit, support readiness, legal/policy readiness, and final staging/production smoke verification.
