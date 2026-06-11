# QA Report — Multi-Site Onboarding Gate Verification

**Session:** 139I-E — Fix Multi-Site Onboarding Gate Edge Case
**Date:** 2026-06-12
**Verdict:** **PARTIAL — code implemented; browser QA pending** (Core code fixes implemented and static/build validation passed; scenario-level API and browser QA remain pending).

---

## Scenarios Audited

### Scenario A — Clean single-site user
* **Objective:** Verify a new user with no prior sites completes onboarding and `/dashboard` loads successfully without bouncing back.
* **API Flow:**
  * `/api/onboarding/me` resolves no site (returns `has_site: false`).
  * User posts new domain via `/api/onboarding/site`.
  * Completes onboarding.
  * Subsequent calls to `/api/onboarding/me` use Dashboard policy: detects completed site, returns `onboarding_completed: true`.
  * `/dashboard` loads successfully.
* **Verification Status:**
  * **Code verified:** Yes, by diff/static inspection.
  * **API/Programmatic verified:** Not run in this session.
  * **Browser verified:** No, pending staging browser run.

### Scenario B — Older incomplete + newer complete
* **Objective:** Verify that a user with an older incomplete site and a newer completed site does not get bounced back to onboarding.
* **API Flow:**
  * User has two sites: `older-incomplete.com` and `newer-complete.com` (latest).
  * `resolveDashboardSite` scans the sites (latest first).
  * It detects `newer-complete.com` is completed and returns it, setting `onboarding_completed: true`.
  * `/dashboard` loads the completed site. No bounce.
* **Verification Status:**
  * **Code verified:** Yes, by diff/static inspection of the `resolveDashboardSite` helper.
  * **API/Programmatic verified:** Not run in this session.
  * **Browser verified:** No, pending staging browser run.

### Scenario C — Direct `/onboarding`
* **Objective:** Verify direct navigation to `/onboarding` resumes the correct incomplete site.
* **API Flow:**
  * User hits `/onboarding` directly.
  * Frontend calls `/api/onboarding/me?mode=onboarding`.
  * If the user has a completed site and no incomplete site, they are redirected to `/dashboard` (policy item 3).
  * If they have a latest incomplete site, it is resolved (policy item 2), and they resume onboarding at the correct step.
* **Verification Status:**
  * **Code verified:** Yes, by diff/static inspection of the `resolveOnboardingSite` helper and route gate.
  * **API/Programmatic verified:** Not run in this session.
  * **Browser verified:** No, pending staging browser run.

### Scenario D — Direct `/dashboard`
* **Objective:** Verify direct navigation to `/dashboard` resolves a completed site if at least one exists.
* **API Flow:**
  * `resolveDashboardSite` returns the active selected completed site, or the latest completed site.
  * `/dashboard` loads successfully.
* **Verification Status:**
  * **Code verified:** Yes, by diff/static inspection of the `App.jsx` gate and `SiteContext` filter checks.
  * **API/Programmatic verified:** Not run in this session.
  * **Browser verified:** No, pending staging browser run.

### Scenario E — Step 1 Same-domain Resume
* **Objective:** Verify that submitting a domain that already exists as an incomplete site resumes it instead of creating duplicates.
* **API Flow:**
  * `POST /api/onboarding/site` queries by domain and scopes by company/owner.
  * If an incomplete site exists, it returns it and resumes at the next step.
* **Verification Status:**
  * **Code verified:** Partially — existing route has domain lookup; full behavior still pending browser verification.
  * **API/Programmatic verified:** Not run in this session.
  * **Browser verified:** No, pending staging browser run.

### Scenario F — Tenant/security sanity
* **Objective:** Verify that foreign site IDs or site keys are ignored and do not leak.
* **Security Checks:**
  * All resolution queries use `getUserSitesSorted(user)` which forces scoping to the authenticated user's `company_id` or `owner_id`.
  * Hints (`site_key`, `site_id` passed in queries/headers) are only resolved if they exist in the user's scoped sites array.
  * Unauthorized/foreign site queries result in fallback to the user's own site, preventing cross-tenant leakage.
* **Verification Status:**
  * **Code verified:** Yes, by diff/static inspection of user-scoped query filters.
  * **API/Programmatic verified:** Not run in this session.
  * **Browser verified:** No, pending staging browser run.
