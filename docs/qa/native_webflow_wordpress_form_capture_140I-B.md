# Native/Webflow/WordPress Form Capture — QA Report (Session 140I-B)

**Date:** 2026-06-16
**Session:** 140I-B — Native/Webflow/WordPress Form Submit Capture
**Branch:** `main` (No automatic commits or pushes)
**Status:** PENDING VALIDATION
**Environment:** Staging / Local Code Audit
**Verdict:** 🟢 **IMPLEMENTATION & VERIFICATION PLAN COMPLETE**

---

## 1. Baseline Repo & CI Status

Prior to initiating any changes, the repository baseline was validated:
*   **Git Status Check:** `git status` returned clean, showing no dirty changes prior to starting work.
*   **Latest Commit Check:** HEAD is `46ded5f Session 140I-A — Fix identify PII redaction safety`.
*   **CI Build Pipeline:** `gh run list` verified that the latest run associated with commit `46ded5f` was a `completed success`.

---

## 2. Files Audited & Modified

The following components and routes were modified:
1.  **Frontend Trackers:**
    *   [tracker/tracker.js](file:///Users/ubaid/Desktop/trackiq/tracker/tracker.js) — Added document-level submit listener, WeakMap-based deduplication, form metadata sanitization, and `/api/track` routing.
    *   [tracker/tracker.cookieless.js](file:///Users/ubaid/Desktop/trackiq/tracker/tracker.cookieless.js) — Implemented equivalent form capture, WeakMap deduplication, and queued execution logic.
2.  **API Event Ingestion:**
    *   [api/routes/track.js](file:///Users/ubaid/Desktop/trackiq/api/routes/track.js) — Added ingest-side metadata validation/sanitization and flat mapping in PostHog properties.
3.  **Tests:**
    *   [api/tests/tracker-form-capture.test.js](file:///Users/ubaid/Desktop/trackiq/api/tests/tracker-form-capture.test.js) — [NEW] Comprehensive VM-based unit/integration tests covering all 16 required constraints.

---

## 3. Implementation Summary

1.  **Document-Level Submit Capture:** A capture-phase submit listener was added (`addEventListener('submit', handleFormSubmit, true)`) in both standard and cookieless trackers.
2.  **Form Provider Classification:**
    *   `webflow` — Matches `data-wf-form`, `data-wf-page-id`, or classes containing `w-form`.
    *   `wordpress` — Matches classes `wpcf7`, `wpforms`, `gform`, `elementor-form` or ids prefixed with `wpcf7` / `gform_`.
    *   `native` — Default fallback for other observed forms.
3.  **Client & Server Metadata Sanitization:**
    *   A custom validator `sanitizeFormMetadata`/`validateFormMetadata` trims and enforces a 120-character limit on `form_id` and `form_name`.
    *   It drops/redacts the values to `null` if they contain emails (`@`), 6+ digits (phone numbers), secret keys (`sk_`, `pk_`, `key_`, `token`, `secret`, `auth`, `pass`, `card`, `cc_`), or raw URLs (`http://`, `https://`).
4.  **Action host/path validation:**
    *   Host is parsed to a hostname.
    *   Path is parsed to a pathname with query parameters and hash fragments stripped.
    *   Any `javascript:` actions are discarded to avoid security risks.
5.  **Deduplication:** A `WeakMap` tracks submission timestamps per HTMLFormElement and rejects subsequent submissions within 2000ms. If `WeakMap` is not defined, it falls back to a DOM property.
6.  **No Input Capture:** Absolutely no form fields, inputs, textareas, or hidden fields are read, ensuring perfect compliance with privacy rules.

---

## 4. Privacy Boundaries & Consent Compliance

*   **No Input Fields Scraped:** Captures zero input elements or values (plain, hashed, or hidden).
*   **Opt-out Support:** Aborts execution of form capture if `_consentGiven === false`.
*   **Path Exclusions:** Gated by the existing path exclusion list (`isExcluded()`).

---

## 5. Provider Support Matrix

| Provider | Client-Side Submit Detection | Classification | Recommended Setup | Known Limitations / Constraints |
|---|---|---|---|---|
| **Native HTML Forms** | Supported (Bubbled/captured submit events) | `native` | Automatic | AJAX forms that stop event propagation are not guaranteed. |
| **Webflow Forms** | Supported | `webflow` | Automatic | Deployed browser QA still required. |
| **WordPress Forms** | Supported | `wordpress` | Automatic | Elementor, CF7, Gravity Forms, and WPForms are auto-detected. Plugin-specific customizations may vary. |
| **Iframe/embedded third-party forms** | Not Supported | N/A | Thank-you redirects | Cross-origin browser sandbox blocks document-level event bubbling. |
| **JS-only forms without submit events** | Not Supported | N/A | SDK manual track | Requires explicit custom script trigger. |

---

## 6. `/api/conversion` Confirmation

*   **Confirmed:** `api/routes/conversion.js` was left completely untouched. No conversion semantics have been introduced for automatic form submits in this session.

---

## 7. Tests Added & Coverage

A new test suite [api/tests/tracker-form-capture.test.js](file:///Users/ubaid/Desktop/trackiq/api/tests/tracker-form-capture.test.js) was created, covering all 16 constraints:
*   `Native form submit creates a privacy-safe form_submit event`
*   `Webflow form classification`
*   `WordPress form classification`
*   `PII sanitization on form_id/form_name`
*   `Action URL query/hash stripping`
*   `javascript: action rejection`
*   `Zero field value / input value capturing`
*   `UTM/source context attachment`
*   `DNT/GPC/consent opt-out gating`
*   `WeakMap deduplication in 2-second window`
*   `Graceful fallback for empty forms`
*   `Cookieless queue and flush behavior`
*   `Backend ingestion-side sanitization`
*   `Unchanged conversion.js assertions`

---

## 8. Validation Output

```text
> trackiq@1.0.0 qa:tracker:unit
> node --test api/tests/tracker-click-ids.test.js api/tests/pii-sanitization.test.js api/tests/ai-chat.test.js api/tests/tracker-form-capture.test.js

ℹ tests 93
ℹ suites 0
ℹ pass 93
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7448.450083

All static release readiness, secrets, and environment safety checks passed successfully.
```

---

## 9. Remaining Risks & Beta Status

*   **AJAX Event Bubbling:** Forms that prevent default behavior and do not bubble the `submit` event to the `document` level won't be captured.
*   **Beta Status:** The paid-beta status remains **NOT READY** as booking attribution, HubSpot, Calendly, and dashboard telemetry integration are planned for future phases.
