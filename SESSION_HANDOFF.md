## Session 101.4A — Tracker Conversion Payload Parity

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Tracker Conversion Payload Parity** — Added `ref_param`, `source_param`, and `via_param` to the conversion payload in `tracker/tracker.js` so that they align with the fields sent by pageview events. Rebuilt `tracker/tracker.min.js`.

### Files changed
- `tracker/tracker.js` — Appended `ref_param`, `source_param`, and `via_param` properties to the conversion event payload.
- `tracker/tracker.min.js` — Rebuilt the minified tracker script.

### Next Session Plan
- **Session 102.1** — Pending future directives from developer.

---

## Session 101.3 — Tracker Build Pipeline and Documentation Domains

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Tracker Build Script Cleaned** — Removed `esbuild tracker/loader.js` step from `build:tracker` in `package.json` and successfully rebuilt `tracker/tracker.min.js`.
2. **Stale Domain References Replaced** — Replaced all instances of stale `https://api.sourcetrack.ai` domain with the correct ingestion and tracker domain `https://api.srctk.com` in:
   - `dashboard/src/pages/Docs.jsx`
   - `dashboard/src/pages/SolutionEcommerce.jsx`
   - `dashboard/src/pages/SolutionAgency.jsx`
   - `dashboard/src/pages/SolutionSaaS.jsx`
   - Comment in `api/routes/proxy.js`

### Files changed
- `package.json` — Cleaned `build:tracker` script by removing the missing `tracker/loader.js` reference.
- `tracker/tracker.min.js` — Rebuilt the minified tracker script.
- `dashboard/src/pages/Docs.jsx` — Updated code examples, URL base variables, and curl instructions to use the live domain.
- `dashboard/src/pages/SolutionEcommerce.jsx` — Fixed domain inside code block snippet.
- `dashboard/src/pages/SolutionAgency.jsx` — Fixed domain inside code block snippet.
- `dashboard/src/pages/SolutionSaaS.jsx` — Fixed domain inside code block snippet.
- `api/routes/proxy.js` — Updated domain reference in comments.


---

## Session 101.2 — Onboarding Back-Step Saving & Resume Snippet Stabilization

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Onboarding Back-Step saving fixed** — Adjusted step transition checks in backend `/api/onboarding/update` to permit saving previous steps (`targetStep <= currentStep`). Removed the deletion of user selections (`business_type`, `install_method`, `selected_conversions`) on back-steps to prevent onboarding data loss.
2. **Stepper progress preserved** — Configured database `current_step` tracking to store the maximum reached progress step, keeping completed steps clickable in the stepper even when users temporarily step backward to correct options.
3. **On-mount snippet resume fixed** — Updated the `loadOnboardingStatus()` mount logic in `Onboarding.jsx` to fetch the script snippet (or fallback to local template) when users resume onboarding at step 4 or later, eliminating the "Loading script..." freeze.

### Files changed
- `api/routes/onboarding.js` — Relaxed back-step saves, prevented data-loss deletion, and preserved maximum stepper progress.
- `dashboard/src/pages/Onboarding.jsx` — Added on-mount snippet fetching for resumed steps >= 4.


---

## Session 101.1 — Fix frontend API bypasses

**Date:** 2026-06-03 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **Stripe Billing / checkout bypasses fixed** — Modified `Billing.jsx` to use central `createCheckout` and `getBillingPortal` helpers from `lib/api.js` instead of raw fetches to relative `/api/billing/...` routes.
2. **GDPR / Settings bypasses fixed** — Replaced raw `fetch('/api/gdpr/...')` calls with `fetchApi` calls for retention policy updates, visitor erasure, and account deletion in `Settings.jsx`.
3. **Data Quality bypass fixed** — Replaced raw `/api/jobs/data-quality-check` POST with `fetchApi` in `DataQuality.jsx`.
4. **Stripe helpers alignment** — Standardized `createCheckout` and `getBillingPortal` in `lib/api.js` to execute correct POST requests with normalized body attributes (`plan` and `returnUrl`) matching the backend routes.

### Files changed
- `dashboard/src/lib/api.js` — Resolved body fields for Stripe helpers and enhanced `fetchApi` to handle flat JSON structures.
- `dashboard/src/pages/Billing.jsx` — Replaced raw checkout and portal calls with `createCheckout` and `getBillingPortal` helpers.
- `dashboard/src/pages/Settings.jsx` — Swapped raw GDPR endpoint calls with unified `fetchApi` helper.
- `dashboard/src/pages/DataQuality.jsx` — Configured manual check triggers via `fetchApi` helper.

### Next Session Plan
- **Session 101.2** — Stabilize Onboarding stepper progression (fix back-navigation 400 error and script snippet load on resuming).

---

## Session 98 — Beta QA: Auth → Onboarding → Tracker → Dashboard Flow

**Date:** 2026-05-23 | **Branch:** `main` | **Build:** ✅ passing

### Completed

1. **OAuth callback** — AuthCallback redirects instead of spinner forever.
2. **Onboarding UX** — Removed Watch Video, added Log out, verification non-blocking, Continue to Dashboard with state persistence.
3. **API domain** — Dashboard reads `VITE_API_URL`/`VITE_TRACKER_BASE_URL`/`VITE_FRONTEND_URL` env vars.
4. **Tracker QA** — Confirmed pageview + conversion ingest, UTM/click-id capture, first-touch attribution.
5. **Onboarding completion** — No longer requires PostHog script detection. Requires site + business_type + install_method. Stores verification_status in onboarding_state.
6. **CORS fix** — Global OPTIONS middleware before auth. Hardcoded dashboard origins. OPTIONS returns 204.
7. **Install verification hardening** — /install/status returns safe pending response on PostHog failure. validateSiteKey returns 401 not 500.

### Files changed
- `api/index.js` — CORS preflight middleware, hardcoded origins
- `api/middleware/auth.js` — OPTIONS guard, catch returns 401 not 500
- `api/middleware/user-auth.js` — OPTIONS guard
- `api/routes/install.js` — PostHog failure returns safe pending response
- `api/routes/onboarding.js` — Removed PostHog verification block, store verification_status
- `dashboard/src/pages/Onboarding.jsx` — Non-blocking verification, Continue to Dashboard with state persistence
- `dashboard/src/pages/AuthCallback.jsx` — Redirect fix

### Remaining QA (manual browser verification needed)
- Continue to Dashboard after failed verification → should complete and navigate
- `/dashboard` loads
- Refresh `/dashboard` stays on dashboard (no redirect to onboarding)
- `/api/onboarding/me` returns `onboarding_completed: true`

### Deployment note
- Railway Dashboard deploy may fail with `##NOT-AUTHORIZED##`. Fix: reconnect GitHub repo access.

### Verification commands
```bash
curl -i -X OPTIONS "https://api.srctk.com/api/onboarding/complete" -H "Origin: https://www.sourcetrack.ai" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"
curl -i https://api.srctk.com/health
curl -i https://api.srctk.com/tracker/tracker.min.js
```
