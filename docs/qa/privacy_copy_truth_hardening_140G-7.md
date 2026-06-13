# QA Audit Report: Settings Danger Zone + Privacy Copy Truth Hardening (Session 140G-7)

- **Date:** 2026-06-13
- **Branch:** `main`
- **Session:** 140G-7
- **Status:** **PASS**

---

## 1. Audited Files & Documents

The following files and folders were audited during this session to assess data deletion completeness, retention configurations, and user-facing truthfulness:
* `dashboard/src/pages/Settings.jsx`
* `dashboard/src/pages/Billing.jsx`
* `dashboard/src/pages/Privacy.jsx`
* `docs/privacy_reality_map.md`
* `docs/release_checklist_gate.md`
* `SESSION_STATE.md`
* `SESSION_LOG.md`
* `SESSION_HANDOFF.md`

---

## 2. Inspected UI Routes & Components

* **UI Page:** Settings (`/settings`)
  * **Visitor Data Erasure Component:** Form & description block under "Privacy & Data" section.
  * **Account Deletion / Danger Zone Component:** Form & description block under "Danger Zone" section.
* **UI Page:** Billing (`/billing`)
  * Checked terms & privacy checkboxes and pricing limits overview.
* **UI Page:** Privacy Policy Overview (`/privacy`)
  * Checked notice & data handling copy.

---

## 3. Copy Changes & Claims Softened

### Visitor Data Erasure
* **Old Intro Copy:**
  ```jsx
  <p className="text-xs text-st-gray dark:text-gray-400">
    Enter a visitor's anonymous ID to permanently erase their data. This action is immediate and permanent.
  </p>
  ```
* **New Softened Intro Copy:**
  ```jsx
  <p className="text-xs text-st-gray dark:text-gray-400">
    Enter a visitor's anonymous ID to erase matching SourceTrack app database records. This action is immediate for app database records and cannot be undone.
  </p>
  ```
* **Old Box Copy:**
  ```jsx
  <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg p-3 text-[11px] text-amber-800 dark:text-amber-300 space-y-1 font-sans">
    <p>• Database attribution records and stitched identity mappings will be permanently deleted from our database.</p>
    <p>• Associated raw events and person profiles stored in PostHog will be queued for deletion (best-effort depending on external API availability).</p>
    <p>• Third-party Stripe customer and billing records are not affected or queried during visitor data deletion.</p>
  </div>
  ```
* **New Softened Box Copy:**
  ```jsx
  <div className="bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg p-3 text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5 font-sans">
    <p>• Database attribution records and stitched identity mappings will be permanently deleted from our app database.</p>
    <p>• <strong>PostHog Deletion Limitation:</strong> Visitor erasure sends a best-effort deletion request to our analytics backend where supported. However, this is not independently verified and full raw-event purge verification is still pending.</p>
    <p>• <strong>Sanitization Note:</strong> Ingestion-side PII sanitization is locally implemented to filter sensitive keys, but live staging/production verification remains pending.</p>
    <p>• Third-party Stripe customer and billing records are not affected or queried during visitor data deletion.</p>
  </div>
  ```

### Account Deletion / Danger Zone
* **Old Copy:**
  ```jsx
  <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg p-3 text-[11px] text-red-800 dark:text-red-300 space-y-1 font-sans">
    <p>• If you are the only workspace member, your workspace and sites will be permanently deleted.</p>
    <p>• If this is a shared workspace, your account and membership will be removed, leaving the shared sites active for other members.</p>
    <p>• If you are the only administrator of a shared workspace, you must transfer ownership or remove other members before deleting your account.</p>
  </div>
  ```
* **New Softened Copy:**
  ```jsx
  <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg p-3 text-[11px] text-red-800 dark:text-red-300 space-y-1.5 font-sans">
    <p>• Account/workspace deletion removes SourceTrack workspace and app database records according to current code paths.</p>
    <p>• <strong>PostHog Event Retention:</strong> Deleting your account does NOT delete historical raw analytics events already sent to our analytics backend (PostHog). These events may remain until separate retention or purge tooling is implemented.</p>
    <p>• <strong>Paid Beta Blocker:</strong> Paid beta remains blocked by PostHog retention/deletion handling and live verification.</p>
    <p>• If you are the only workspace member, your workspace and sites will be permanently deleted from our app database.</p>
    <p>• If this is a shared workspace, your account and membership will be removed, leaving the shared sites active for other members.</p>
    <p>• If you are the only administrator of a shared workspace, you must transfer ownership or remove other members before deleting your account.</p>
  </div>
  ```

### Legal Policy Readiness Deletion Copy
* **Old Copy:**
  ```text
  - **Account Deletion:** If a user is the sole member of a company workspace, account deletion cascades to permanently delete all sites, member associations, and database attribution records.
  ```
* **New Softened Copy:**
  ```text
  - **Account Deletion:** If a user is the sole member of a company workspace, account deletion cascades through SourceTrack app database records for sites, member associations, and database attribution records. Historical raw analytics events already sent to PostHog are not bulk-erased by account deletion and require separate retention/purge handling. Stripe billing records are handled separately.
  ```

---

## 4. Deployed Browser & UI Verification Status

* **Status:** `BLOCKED — not browser verified`
* **Reason:** This is a copy-only truth hardening session. The dashboard has not been deployed to staging/production for this session, and real-browser verification of the updated UI copy is pending deployment.

---

## 5. Remaining Blockers

Paid beta remains blocked by the remaining open release gates, including:
1. **PostHog Retention/Deletion Handling:** Need a verified, implemented, operator-safe mechanism for bulk event deletion.
2. **Staging / Production Live Verification:** Verification of pageview limits, conversion caps, proxy route PII sanitization, and billing portals.
3. **Staging Schema Bootstrap:** Complete database migrations and seeding on staging.
4. **PITR Decision & Restore Drill:** Staging restore drill not completed.
5. **SMTP / SMTP Templates:** Production SMTP credentials and forgot password templates remain unverified.

---

## 6. Static QA & Validation Output

### Static QA Checks (`npm run qa:static`)
```text
✅ All backend files syntax passed.
✅ Frontend build succeeded.
✅ No whitespace violations.
✅ Forbidden copy/API grep checks passed (no forbidden strings in user-facing code).
✅ Route mount checks passed.
✅ Security & plan scoping checks passed.
PASS — static launch QA passed
```

### Git Diff Check (`git diff --check`)
* **Output:** Passed cleanly (no trailing whitespace).

### Forbidden Terms Check
The initial forbidden-claims grep surfaced an absolute account-deletion phrase in docs/legal_policy_readiness.md. This was softened in Session 140G-7 to clarify SourceTrack app database deletion boundaries and the unresolved PostHog raw-event retention gap.

Subsequent grep check returned no unsafe user-facing app/API claims. Remaining matches are historical documentation disclaimers, audit records, or examples that explicitly warn against certified/complete deletion claims:
```bash
grep -RIn "fully delete\|permanently delete all\|complete deletion\|GDPR compliant\|certified\|guaranteed deletion" dashboard/src docs api --exclude-dir=node_modules || true
```
All returned matches were historical documentation disclaimers in `docs/` and audit logs.

### Personal Paths & Token Leaks Check
Grep check for personal paths and token prefixes returned no leaks:
```bash
grep -RIn "file:///Users/ubaid\|/Users/ubaid/.gemini\|sk_live\|rk_live\|whsec_\|eyJ[a-zA-Z0-9_-]*" dashboard/src docs api SESSION_STATE.md SESSION_LOG.md SESSION_HANDOFF.md docs/release_checklist_gate.md --exclude-dir=node_modules || true
```
Only mock prefixes (`sk_live_abc123`) and code validations (checking for `whsec_`) were returned.

---

## 7. Git Status & Stat

### `git status --short`
```text
 M SESSION_HANDOFF.md
 M SESSION_LOG.md
 M SESSION_STATE.md
 M dashboard/src/pages/Settings.jsx
A  docs/qa/privacy_copy_truth_hardening_140G-7.md
 M docs/release_checklist_gate.md
```

### `git diff --cached --stat`
```text
 SESSION_HANDOFF.md                             |   7 +-
 SESSION_LOG.md                                 |   1 +
 SESSION_STATE.md                               |   5 +-
 dashboard/src/pages/Settings.jsx               |  14 +--
 docs/qa/privacy_copy_truth_hardening_140G-7.md | 150 +++++++++++++++++++++++++
 docs/release_checklist_gate.md                 |   4 +-
 6 files changed, 171 insertions(+), 10 deletions(-)
```
