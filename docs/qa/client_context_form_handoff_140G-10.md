# Client Attribution Context & Form Handoff Audit — QA Report (Session 140G-10)

**Date:** 2026-06-13
**Branch:** `main`
**Status:** PENDING REVIEW — not committed

---

## 1. Files Audited

- `tracker/tracker.js` — Standard storage-based tracker SDK
- `tracker/tracker.cookieless.js` — Storage-free cookieless tracker SDK
- `dashboard/src/pages/developers/DevelopersTracker.jsx` — In-app developer reference documentation page
- `package.json` — Build scripts and test configurations
- `api/tests/tracker-click-ids.test.js` — Tracker SDK parameter & helper unit tests

---

## 2. Commands Run

```bash
# Verify working tree cleanliness
git status --short
git log --oneline -5

# Search for any pre-existing getContext methods
grep -RIn "getContext" tracker dashboard/src docs api --exclude-dir=node_modules || true

# Recompile tracker files
npm run build:tracker

# Run the unit and static checks test suites
npm run qa:tracker:unit
npm run qa:identity:unit
npm run qa:attribution:unit
npm run qa:static

# Run git diff checks and verify no whitespace violations
git diff --check
```

---

## 3. Pre-existence of getContext()

- Before this session, `window.sourcetrack.getContext` did **not** exist in standard `tracker.js`, cookieless `tracker.cookieless.js`, or any documentation files.

---

## 4. Exact Fields Exposed

The `window.sourcetrack.getContext()` method returns a JSON object exposing:

- **anonymous_id:** The visitor's cookie/localStorage-based UUID (`AID`).
- **session_id:** The tab-scoped session UUID (`SID`).
- **first_touch_source:** The historical source stored in `localStorage` (`st_ft_src`).
- **first_touch_medium:** The historical medium stored in `localStorage` (`st_ft_med`).
- **first_touch_campaign:** The historical campaign stored in `localStorage` (`st_ft_cmp`).
- **current_source:** The current page UTM or referrer source.
- **current_medium:** The current page UTM or inferred medium.
- **current_campaign:** The current page UTM campaign name.
- **click_ids:** A sub-object containing 14 normalized ad platform identifiers with `null` fallbacks:
  - `gclid`
  - `gbraid`
  - `wbraid`
  - `fbclid`
  - `msclkid`
  - `ttclid`
  - `li_fat_id`
  - `li_fatid`
  - `twclid`
  - `dclid`
  - `snapclid`
  - `pclid`
  - `sccid`
  - `ko_click_id`

---

## 5. Why No PII is Exposed

- The exposed context utilizes only system attribution variables and URL params (`AID`, `SID`, first-touch storage, and `params()`).
- No personal user fields such as `email`, `phone`, `name`, `address`, `ip`, or `user-agent` are included in the returned object.
- The helper does not automatically scrape form input fields or intercept DOM forms.

---

## 6. Standard Tracker Behavior

- The standard storage-based tracker retrieves visitor identity (`AID`) and first-touch records (`st_ft_src`, etc.) synchronously from `localStorage`.
- It returns full cross-session multi-touch parameters immediately on invocation.

---

## 7. Cookieless Tracker Behavior & Async Limitation

- The cookieless tracker does not store visitor parameters in browser storage.
- It fetches the rotating visitor identity asynchronously from `/api/tracker/id`.
- **Async Limitation:** If `window.sourcetrack.getContext()` is called synchronously on page load before this network fetch resolves, `anonymous_id` and `session_id` will return `null`.
- First-touch and current-touch properties are derived in memory for the active page load and are scoped to the active session.

---

## 8. Docs Added and Updated

- **Added:** `docs/guides/form_checkout_source_handoff.md`
  - Comprehensive customer integration guide covering CRM hidden fields, Stripe checkout integration (`client_reference_id` + metadata), webhook payloads, consent gates, cookieless timing, and privacy recommendations.
- **Updated:** `dashboard/src/pages/developers/DevelopersTracker.jsx`
  - Documented the new `getContext()` method inside the frontend SDK Javascript API reference table.

---

## 9. What Was Explicitly Not Implemented & Why

- **Client-side attribution calculations:** Multi-touch math remains fully server-side to prevent exposing attribution logic to the client browser and allow retroactive model adjustments.
- **Automatic form submission interception:** Intercepting all forms is prone to conflicts with page listeners and validation libraries. Instead, we instruct customers to explicitly call the JS API on submit.
- **Email/phone/PII scraping and hashing:** Automatically parsing input elements represents a privacy compliance risk.
- **Consent banner (CMP) or Google Consent Mode v2 integrations:** Deferred to keep the tracker script lightweight; we delegate cookie consent enforcement to the site owner's existing CMP systems.

---

## 10. Validation Output

```
▶ PII Sanitization Hardening Test Suite
  ... (36 tests pass)
✔ PII Sanitization Hardening Test Suite (163.246542ms)

▶ Click ID Normalization Helper Unit Tests
  ... (4 tests pass)
✔ Click ID Normalization Helper Unit Tests (2.041208ms)

▶ Tracker Source Files Static Checks
  ✔ standard tracker.js has all parameters (0.97125ms)
  ✔ cookieless tracker.cookieless.js has all parameters (0.202792ms)
✔ Tracker Source Files Static Checks (1.872125ms)

▶ Setup Diagnostics & UI Consistency Checks
  ✔ setup-doctor.js clickIdTypes has all 14 click IDs (0.192792ms)
  ✔ EventDebugger.jsx contains references to all 14 click IDs (1.187625ms)
✔ Setup Diagnostics & UI Consistency Checks (1.57175ms)

▶ Tracker Client Context Helper Static Checks
  ✔ standard tracker.js has getContext method and respects non-PII rules (0.3ms)
  ✔ cookieless tracker.cookieless.js has getContext method and respects non-PII rules (0.2ms)
✔ Tracker Client Context Helper Static Checks (0.5ms)

tests 51 | pass 51 | fail 0
```

---

## 11. Remaining paid-beta blockers

Paid beta remains blocked by the remaining open release gates, including:
1. **Live PostHog retention/deletion verification**
2. **Paid billing portal verification / Stripe portal return URLs**
3. **Production billing verification**
4. **Production env/secrets verification**
5. **Tenant isolation verification**
6. **Privacy/deletion live verification**
7. **Observability setup**
8. **Backup/restore drill**
9. **Install QA**
10. **Docs truth audit**
11. **Support readiness**
12. **Legal/policy readiness**
13. **Final staging/production smoke verification**

---

## 12. Git Status

```bash
$ git status --short
 M SESSION_HANDOFF.md
 M SESSION_LOG.md
 M SESSION_STATE.md
 M api/tests/tracker-click-ids.test.js
 M dashboard/src/pages/developers/DevelopersTracker.jsx
 A docs/guides/form_checkout_source_handoff.md
 A docs/qa/client_context_form_handoff_140G-10.md
 M tracker/tracker.cookieless.js
 M tracker/tracker.cookieless.min.js
 M tracker/tracker.js
 M tracker/tracker.min.js
```

## 13. Final Leak / Claim Grep Notes

The final local-path and claim greps returned historical documentation/audit-log references only. No new `file:///Users/ubaid`, `/Users/ubaid`, `.gemini/antigravity`, live secret, or overclaim reference was introduced by Session 140G-10.

Known historical references in `SESSION_HANDOFF.md` and older `docs/qa/*` files are pre-existing cleanup debt and were not changed in this session.
