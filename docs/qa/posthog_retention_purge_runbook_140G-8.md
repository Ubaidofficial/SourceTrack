# QA Report: PostHog Retention & Purge Operator Runbook (Session 140G-8)

- **Date:** 2026-06-13
- **Branch:** `main`
- **Session:** 140G-8
- **Status:** **COMPLETE**

---

## 1. Audited Files & Documents

The following files and documentation were audited during this session to assess PostHog retention configurations, deletion capabilities, and operator procedures:
* `api/routes/gdpr.js`
* `api/lib/posthog.js`
* `docs/qa/posthog_retention_deletion_audit_140G-5.md`
* `docs/privacy_request_operational_drill.md`
* `docs/privacy_reality_map.md`
* `docs/release_checklist_gate.md`
* `SESSION_STATE.md`
* `SESSION_LOG.md`
* `SESSION_HANDOFF.md`

---

## 2. Audited Commands Run

```bash
git status --short
git log --oneline -5
grep -RIn "PostHog\|posthog\|retention\|purge\|delete\|erase\|gdpr\|privacy" api dashboard/src docs SESSION_STATE.md SESSION_LOG.md SESSION_HANDOFF.md docs/release_checklist_gate.md --exclude-dir=node_modules
grep -RIn "POSTHOG\|posthog" api dashboard/src docs .github scripts --exclude-dir=node_modules || true
```

---

## 3. Summary of Current Code Behavior

* **Visitor Erasure (`DELETE /api/gdpr/visitor`):**
  Wipes attribution records (`attributed_conversions`) and identity links (`site_identity_links`) from the Supabase database. Dispatches a best-effort, asynchronous `DELETE` API request to PostHog's REST API `/api/projects/{project_id}/persons/{person_id}/?delete_events=true`. If the external API call fails or times out, it is silently dropped with no retry queue.
* **Account Deletion (`DELETE /api/gdpr/account`):**
  Cascades database rows in Supabase to delete workspace data, membership records, and sites. It does **not** trigger any bulk PostHog event purges, leaving raw historical events orphaned in the shared PostHog project database.
* **Tenant-Specific Retention:**
  Does not exist. All tenants share a single `POSTHOG_PROJECT_ID` and are bound by the global project retention settings configured inside the PostHog project console.

---

## 4. Runbook Created

Created the new operator runbook at `docs/operations/posthog_retention_purge_runbook.md` covering:
1. **Scope:** Manual operator procedures.
2. **Current Deletion Truth:** Matrix of actual database and external provider actions.
3. **When to Use:** Privacy requests, account closure follow-ups, internal test cleanups, and incident remediation.
4. **Required Identifiers:** Safe parameters (site IDs, anonymous IDs) to prevent cross-tenant errors.
5. **Operator Checklist:** Authorization checks, locating target events in the console, manual console wipes, and documenting results.
6. **Evidence Requirements:** Safe logs, screenshots, and standard customer disclosure wording.
7. **Known Failure Modes:** Credential failures, wrong environments, missing stitched person profiles, and rate-limits.
8. **Paid-Beta Gate:** Explicit reminder that this runbook handles operator readiness only, and paid beta remains blocked.

---

## 5. Release Checklist Updates

Updated status for **Data Deletion & Privacy Basics** in `docs/release_checklist_gate.md`:
```text
PostHog retention/purge operator runbook is documented in Session 140G-8, but live PostHog purge verification and automation/tooling remain BLOCKED.
```

---

## 6. Live Verification Status

* **Browser/UI Verification:** `N/A — docs/runbook only`
* **Live PostHog Console / API Purge Verification:** `BLOCKED — no live PostHog purge verification performed`
  * Testing event deletion latency and verifying that deleted events are completely purged from PostHog query results remains blocked until staging credentials and environment access are validated.

---

## 7. Remaining Blockers

Paid beta remains blocked by the remaining open release gates, including:
1. **Live PostHog Retention / Deletion Verification:** Rehearsing and verifying manual/API visitor and account purges.
2. **Staging Schema Bootstrap:** Complete database migrations and seeding on staging.
3. **PITR Decision & Restore Drill:** Staging restore drill not completed.
4. **SMTP / SMTP Templates:** Production SMTP credentials and forgot password templates remain unverified.
5. **Production Env/Secrets Verification:** Validating parameters in Railway and Supabase consoles.

---

## 8. Static QA & Validation Output

### Static QA Checks (`npm run qa:static`)
```text
==================================================
PASS — Release readiness checklist verified (all blockers open).
==================================================
         SourceTrack Static Launch QA
==================================================
--- B. Backend Syntax Checks ---
✅ All backend files syntax passed.

--- C. Frontend Build ---
Running frontend production build...
✅ Frontend build succeeded.

--- D. Whitespace Check ---
✅ No whitespace violations.

--- E. Forbidden Copy/API Grep Checks ---
✅ Forbidden copy/API grep checks passed (no forbidden strings in user-facing code).

--- F. Route Mount Checks ---
✅ Route mount checks passed.

--- G. Security & Plan Scoping Checks ---
✅ Security & plan scoping checks passed.

PASS — static launch QA passed
```

### Git Diff Whitespace Check (`git diff --check`)
Passed cleanly with no stdout/stderr output.

### Forbidden Claims Grep
```bash
grep -RIn "fully delete\|permanently delete all\|complete deletion\|GDPR compliant\|certified\|guaranteed deletion\|verified purge\|guaranteed purge" docs dashboard/src api --exclude-dir=node_modules || true
```
* **Output:** Checked and confirmed zero absolute deletion/compliance overclaims exist in `api/` or `dashboard/src/`. All occurrences are historical documentation disclaimers in `docs/`.

### Personal Paths & Token Leaks Grep
```bash
grep -RIn "file:///Users/ubaid\|/Users/ubaid/.gemini\|sk_live\|rk_live\|whsec_\|eyJ[a-zA-Z0-9_-]*" docs dashboard/src api SESSION_STATE.md SESSION_LOG.md SESSION_HANDOFF.md docs/release_checklist_gate.md --exclude-dir=node_modules || true
```
* **Output:** Checked and confirmed zero active keys or user paths leaked. Only mock prefixes, document warnings, and validation regex were returned.

---

## 9. Git Status & Stat

### `git status --short`
```text
M  SESSION_HANDOFF.md
M  SESSION_LOG.md
M  SESSION_STATE.md
A  docs/operations/posthog_retention_purge_runbook.md
A  docs/qa/posthog_retention_purge_runbook_140G-8.md
M  docs/release_checklist_gate.md
```

### `git diff --cached --stat`
```text
 SESSION_HANDOFF.md                                 |   7 +-
 SESSION_LOG.md                                     |   1 +
 SESSION_STATE.md                                   |   5 +-
 docs/operations/posthog_retention_purge_runbook.md | 126 ++++++++++++++++++
 docs/qa/posthog_retention_purge_runbook_140G-8.md  | 158 +++++++++++++++++++++
 docs/release_checklist_gate.md                     |   2 +-
 6 files changed, 295 insertions(+), 4 deletions(-)
```
