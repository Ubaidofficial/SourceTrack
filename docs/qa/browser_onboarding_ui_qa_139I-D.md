# Browser Onboarding UI QA — Session 139I-D (Fix Verification)

> Date: 2026-06-12
> Session: 139I-D — Fix Browser Onboarding UI Blockers
> Branch: main (no commits, no pushes)
> Environment: **Staging only** — https://sourcetrack-dashboard-staging.up.railway.app + https://sourcetrack-api-staging.up.railway.app
> Method: E2E code analysis and programmatic simulation verification
> Verdict: **PARTIAL — code fixes implemented and programmatically verified; real browser QA still required**

---

## 1. Verdict

**PARTIAL — code fixes implemented and programmatically verified; real browser QA still required**

All backend and frontend changes to fix the onboarding blockers have been implemented and verified programmatically via simulated API integration tests. However, since there is no browser automation tool (such as Chrome DevTools MCP) configured or active in this agent environment, we are unable to perform real clicks, fill out forms, or observe real-time browser console logs on staging.

Therefore:
- **Real browser clicks were not performed.**
- **Final dashboard transition was not browser-verified.**
- **Onboarding cannot be marked PASS.**
- **A follow-up Claude browser QA is required** before this session can be fully closed.

---

## 2. Browser / Tool Used

| Item | Detail |
|---|---|
| Tool | None (Browser tooling not active in slim MCP environment) |
| Method | Programmatic validation via `test_doctor_e2e.cjs` running with staging credentials |

---

## 3. Files Changed

- `api/lib/setup-doctor.js`
- `api/middleware/auth.js`
- `api/routes/install.js`
- `api/routes/onboarding.js`
- `dashboard/src/components/SetupDoctorCard.jsx`
- `dashboard/src/lib/api.js`
- `dashboard/src/pages/Onboarding.jsx`
- `docs/qa/browser_onboarding_ui_qa_139I-D.md`
- `SESSION_STATE.md`
- `SESSION_LOG.md`
- `SESSION_HANDOFF.md`

---

## 4. Step-by-Step Onboarding Result (Programmatic Simulation)

| Step | UI Action / Payload | Expected UI Result | Backend Reality / Verification |
|---|---|---|---|
| 1. Connect Domain | `POST /onboarding/site` with `{ domain }` | UI advances to Step 2 | ✅ Site created, onboarding state initialized to `{ current_step: 2 }` in DB. |
| 2. Business Type | `POST /onboarding/update` with `{ business_type, selected_conversions }` | UI advances to Step 3 | ✅ Payload success. Optional fields like `install_method` omitted. State saved, `current_step` set to 3. |
| 3. Install Method | `POST /onboarding/update` with `{ install_method }` | UI advances to Step 4 | ✅ State saved, `current_step` set to 4. |
| 4. Install Script | `POST /onboarding/update` with `{ install_method }` | UI advances to Step 5 | ✅ State saved, `current_step` set to 5. Snippet URL contains staging base URL. |
| 5. Customize | `POST /onboarding/update` with `{ selected_conversions }` | UI advances to Step 6 | ✅ State saved, `current_step` set to 6. |
| 6. Run Verification | `POST /onboarding/complete` | Redirection to `/dashboard` | ✅ Onboarding completion successfully set in DB (`onboarding_completed: true`). |

---

## 5. Console / Network Findings

### Programmatic Simulated Runs
- `POST /api/onboarding/update` for step 2 (business type selection) returns `200 OK` (previously returned `400` because `install_method: null` failed enum validation).
- `GET /api/install/doctor` returns `200 OK` and correctly falls back to `status: "pending"` when PostHog returns a `502 Bad Gateway`.
- `POST /api/onboarding/complete` returns `200 OK` with `{ completed: true }`.

### Real Browser Verification Status
- **Real browser console logs and network payloads are unavailable** because browser automation tooling (DevTools MCP) is not active/configured in this slim environment.
- Real browser clicks and form inputs were not performed.
- The final visual transition and browser-level redirect to the dashboard were not browser-verified.
- Onboarding cannot be marked PASS at this stage; follow-up Claude browser QA is required.

---

## 6. Snippet URL Verification

- Staging environment variable `TRACKER_BASE_URL` is set to `https://sourcetrack-api-staging.up.railway.app`.
- The snippet route `api/routes/install.js` has been hardened to dynamically fall back to the request origin protocol and host if `TRACKER_BASE_URL` is missing, preventing any fallback to `localhost` in deployed environments.

---

## 7. Tracking Doctor Result

- **Investigation of 401 Root Cause**:
  - The E2E diagnostic simulation script (`test_doctor_e2e.cjs`) successfully verified that `/api/install/doctor` returns `200 OK` when authenticated with a valid Bearer token and site key.
  - The original 401 error reported on staging was **not reproduced programmatically**. However, the email verification check inside the `validateSiteKey` middleware (`supabase.auth.admin.getUserById`) was identified as a potential failure point. If the admin API fails or throws a transient error, the original code caught the exception and returned a `401 Invalid site_key` error.
  - **Hardening Fix**: Wrapped the admin check in `validateSiteKey` in a fail-safe try-catch block. For public tracking requests, it fails closed (returns a `503 Service Unavailable`). For authenticated dashboard and diagnostics requests, it bypasses the email check so users are not blocked by transient admin API issues.
  - Setup Doctor queries are now wrapped in individual catch handlers so PostHog/HogQL proxy errors (such as 502 Bad Gateway) are caught, returning a status of `pending` instead of causing the entire diagnostics check to throw a 500 error.
  - UI polling is disabled on auth errors (401/403) and displays a friendly pending message.

---

## 8. DB / Backend Verification

Direct DB inspection via `test_validate_site_key.cjs` confirms the staging database (`nrsvpwzekfrdrzkoecfk`):
- `sites.business_type` is correctly saved to the DB.
- `sites.onboarding_state.current_step` updates to 6.
- `sites.onboarding_completed` is successfully set to `true` on onboarding completion.

---

## 9. Remaining Blockers

1. **Staging Browser QA Required**: A real browser walkthrough using Claude or manual operator clicks is required to verify the visual transitions, button states, copy confirmation, and redirect.
2. **Billing Status Endpoint**: Hardening of `/api/billing/status` is still pending (Session 139J).

---

## 10. Raw Validation Output

```bash
$ npm run qa:env-safety       → ✅ All offline environment safety tests passed
$ npm run qa:static           → ✅ PASS — static launch QA passed
$ git diff --check            → clean (exit 0)
$ git status --short          → M api/lib/setup-doctor.js ...
```

---

## 11. Git Status

```
 M api/lib/setup-doctor.js
 M api/middleware/auth.js
 M api/routes/install.js
 M api/routes/onboarding.js
 M dashboard/src/components/SetupDoctorCard.jsx
 M dashboard/src/lib/api.js
 M dashboard/src/pages/Onboarding.jsx
 A docs/qa/browser_onboarding_ui_qa_139I-D.md
```
No secrets, tokens, JWTs, cookies, service keys, Stripe keys, or full site keys are exposed or saved in scratch files.
