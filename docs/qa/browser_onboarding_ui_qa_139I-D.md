# Browser Onboarding UI QA — Session 139I-D (Fix Verification)

> Date: 2026-06-12
> Session: 139I-D — Fix Browser Onboarding UI Blockers
> Branch: main (no commits, no pushes)
> Environment: **Staging only** — https://sourcetrack-dashboard-staging.up.railway.app + https://sourcetrack-api-staging.up.railway.app
> Method: E2E code analysis and programmatic simulation verification
> Verdict: **PARTIAL — code fixes implemented and programmatically verified; real browser QA still required**
>
> ⬇️ **UPDATE 2026-06-12 — real-browser verification completed. See the "Browser Verification Addendum" at the bottom. Browser verdict: PASS WITH LIMITS.**

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

---
---

# Browser Verification Addendum — Real Claude-in-Chrome run (2026-06-12)

> This section is the actual browser QA the prep report above said was required. Real navigation, clicks, form fills, screenshots, and live network capture against staging on deploy `c219db7`. No commits/pushes. No secrets/full site keys exposed.

## A1. Verdict

**🟡 PASS WITH LIMITS — browser onboarding works but minor issues remain**

Every 139I-D fix is verified in a real browser: onboarding completes end-to-end, persists, and reaches the authenticated dashboard. All 139I-C blockers (business-type `400`, localhost snippet, no copy feedback, Tracking Doctor 401/infinite-spinner, completion `400`, dashboard bounce) are resolved.

**Limit:** the onboarding gate resolves a user's site via the **oldest** site (`sites?...order=created_at.asc&limit=1`). On the test account (which already had a prior incomplete `qa-139ic` site), completing a *newer* `qa-139id` site did **not** unblock the dashboard — it bounced to `/onboarding` until the oldest site was also completed. Once the gate site itself was onboarded, completion + dashboard worked. Not verified on a pristine brand-new account (operator reused an existing account carrying prior-run sites).

## A2. Tool / Deploy

- Tool: **Claude in Chrome** extension, Chrome/macOS "Browser 1". Operator-authenticated (`imubaid93@gmail.com`); no password/token entered or printed.
- Deploy: `SourceTrack-Api` (4cd84fde) + `SourceTrack-Dashboard` (09b831ea) both **SUCCESS on `c219db7`**. CI green. Preflight passed.
- DB: no Supabase MCP; backend state read via app's authenticated `/api/onboarding/me` + `/status`.

## A3. Routes tested

`/onboarding` (Steps 1–6) ✅ · `/dashboard` (pre-gate-complete) ⚠️ bounced to onboarding · `/dashboard` (post) ✅ Performance Overview · `/billing` ✅ authenticated · API `/onboarding/site` 200, `/onboarding/update` ×5 200, `/install/doctor` 200, `/onboarding/me|status` 200.

## A4. Step-by-step (real browser)

| Step | Action | UI | API | Persist |
|---|---|---|---|---|
| 1 Connect Domain | `qa-139id-browser.example.com` + Confirm | ✅ → Step 2, no CORS/Failed-to-fetch | `site` **200** | site created |
| 2 Business Type | eCommerce | ✅ → Step 3 | `update` **200** (no install_method 400) | `business_type` ✅ |
| 3 Install Method | SourceTrack Pixel | ✅ → Step 4 | `update` **200** | ✅ |
| 4 Install Script | Copy Code + Continue | ✅ "Copied!"; → Step 5 | `update` **200** | ✅ |
| 5 Customize | Sign Up (+Purchase) + Continue | ✅ → Step 6 | `update` **200** | conversions ✅ |
| 6 Verification | Tracking Doctor "WAITING FOR FIRST EVENT"; Verify Later | ✅ completed | `doctor` **200**; complete **200** | `onboarding_completed=true` ✅ |
| Final | — | ✅ authenticated dashboard | — | `current_step=6`, `business_type=ecommerce` ✅ |

## A5. Console / Network

- App console clean (only `chrome-extension://` noise). No raw 401/403/500 shown to user.
- `/onboarding/update` ×5 → **200** (no `install_method must be one of…` regression). `/install/doctor` → **200** ×3 (was 401). Gate query `sites?...order=created_at.asc&limit=1` resolves the oldest site (root of A8 limit). No 5xx, no `Failed to fetch`.

## A6. Snippet URL — ✅ FIXED

`<script async src="https://sourcetrack-api-staging.up.railway.app/tracker.min.js" data-site-key="4d5889f5-…-5aedca4f346b"></script>` — `usesStagingApi:true, usesLocalhost:false` (was `localhost:8080`). Full site key redacted.

## A7. Copy button — ✅ FIXED

Copy Code shows visible **"Copied!"** confirmation; clipboard verified to hold the correct staging snippet.

## A8. Tracking Doctor — ✅ FIXED (graceful)

"WAITING FOR FIRST EVENT" badge, full diagnostics grid (tracker events / domain match / conversions / paid params all "none yet"), Recommended Action + Resolve Issue, Technical Diagnostics, Verify Now. No infinite spinner, no raw 401/403, `/install/doctor` 200, Verify Later available.

## A9. DB / backend (via app API)

`/onboarding/me` (gate site) → `{ current_step:6, business_type:"ecommerce", onboarding_completed:true, domain:"qa-139ic-browser.example.com" }`. `/onboarding/status`: gate `1abf1c9e…` completed:true; newer `ef2f0319…` (qa-139id) completed:true. All expected assertions met.

## A10. Dashboard transition — ✅ (after gate site complete)

`/dashboard` loads "Performance Overview" (Live), ACTIVE SITE qa-139ic-browser.example.com, "Recent visitors (5m):0", graceful "Finish setting up / Go to Install Guide" + "No reports yet". Full authenticated nav. No bounce once gate site complete.

## A11. UX / DataFast parity

Now genuinely usable for a non-technical founder: clear steps, correct snippet, copy confirmation, friendly verification, working dashboard with a clear "install snippet to see data" empty state. Gaps vs DataFast: manual verification (no auto-detect success path observed) and the multi-site gate edge case below.

## A12. Remaining bugs / blockers

| # | Sev | Issue |
|---|---|---|
| 1 | P2 (edge) | Multi-site gate uses **oldest** site (`order=created_at.asc&limit=1`); a user with a pre-existing incomplete site is bounced to onboarding after completing a newer one. Step 1 with a new domain creates a *new* site instead of resuming the existing incomplete one. |
| 2 | P3 | `/onboarding/me` returns the oldest site, which can disagree with the site the step flow edits (same root cause). |
| 3 | Coverage gap | Not verified on a pristine brand-new single-site account (operator reused an existing account). Single-site completion→dashboard was proven by completing the gate site. |

No hard blockers; core onboarding completes and reaches the dashboard.

## A13. Raw validation

```
npm run qa:env-safety → ✅ passed   ·   npm run qa:static → ✅ PASS
git diff --check → clean (exit 0)   ·   gh run list → 139I-D CI green
Screenshots: ss_63207ve3b Step1 · ss_3114lzv4z Step2 · ss_6594g93fr Step3 · ss_60557etdj Step4(staging snippet)
  · ss_0747ae9kr "Copied!" · ss_26802kgsy Step5 · ss_3094bzham Step6 Doctor · ss_6126mmr2u first VerifyLater→bounce
  · ss_0612iorg8 /dashboard→onboarding bounce · ss_9640gh8y6 /billing auth · ss_5161ggn10 /dashboard loaded
```

No commits. No pushes. No secrets, tokens, JWTs, cookies, service/Stripe/Supabase keys, webhook/encryption keys, Railway variable values, or full site keys exposed.

## A14. Next task — Session 139I-E (multi-site gate fix)

The remaining P2 multi-site gate bug is **not** a launch-killer for a clean first-time single-site user, but it **is a paid-beta support trap**. It is queued as an explicit next session (not a vague background task), and paid-beta onboarding must **not** be marked fully clean until it is fixed and re-verified.

**Session 139I-E — Fix Multi-Site Onboarding Gate Edge Case**

Scope:
1. Dashboard/onboarding gate must not blindly choose the oldest site (`sites?...order=created_at.asc&limit=1`).
2. `/api/onboarding/me` must return the correct **active/in-progress** site, not the oldest.
3. Step 1 should **resume an existing incomplete onboarding site** where appropriate instead of accidentally creating a second site.
4. Site resolution must be deterministic: **active selected site** if available → otherwise **latest incomplete onboarding site** → otherwise **latest site**; avoid the oldest-site trap.
5. Add browser QA for: clean single-site user; user with an older incomplete + newer complete site; direct `/dashboard`; direct `/onboarding`.

Do not start Session 139L until 139I-E is complete and re-verified.
