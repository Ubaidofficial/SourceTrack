# Browser Onboarding UI QA — Session 139I-C (Re-run after CORS fix)

> Date: 2026-06-11
> Session: 139I-C — Browser UI Onboarding Verification (re-run, post CORS fix)
> Branch: main (no commits, no pushes)
> Environment: **Staging only** — https://sourcetrack-dashboard-staging.up.railway.app + https://sourcetrack-api-staging.up.railway.app
> Method: Claude in Chrome extension — real navigation, clicks, form fills, screenshots, live network/console capture

---

## 1. Verdict

**🔴 BLOCKED — onboarding UI failed**

The CORS fix is **verified working** — the dashboard origin is now allowed and the flow advances past Step 1 for the first time. Login works, and all six onboarding screens render and are navigable with real clicks. **However, onboarding cannot be completed in the browser**, and the **dashboard transition fails**:

- Selecting a business type fires a **silently-swallowed `400`** (`install_method must be one of: gtm, standard`), so the backend never advances past **step 2**.
- The UI nonetheless lets the user click through all 6 steps, then completion is rejected with **`400 "Invalid step transition from step 2 to step 6"`**.
- Navigating to `/dashboard` **bounces back to `/onboarding` at step 2 with all selections lost** (`onboarding_completed=false`, `business_type=null`).

A real founder would walk the whole flow, hit a dead end, and lose their progress. This is a hard blocker.

---

## 2. Browser / Tool Used

| Item | Detail |
|---|---|
| Tool | **Claude in Chrome** extension (real page interaction) |
| Browser | Chrome on macOS — "Browser 1" (connected, local) |
| Login | Operator's session from prior run was still active (Supabase session). Assistant never entered or printed any password/token. The Supabase access token was used **only transiently** in-page to read backend onboarding state and was never returned or logged. |
| DB access | **No Supabase MCP is connected in this session** — Phase 5 DB state was obtained via the app's own authenticated `/api/onboarding/me` call (authoritative backend view) plus observed browser behavior. |

---

## 3. Exact Routes Tested

| Route | State | Result |
|---|---|---|
| `/onboarding` | Authenticated | ✅ Renders 6-step flow; **Step 1 now succeeds** (CORS fixed) |
| `/dashboard` | Authenticated, onboarding incomplete | ⚠️ **Redirects back to `/onboarding` step 2** — transition fails |
| API `…/health` | cross-origin probe | ✅ 200 |
| API `…/api/onboarding/me` (no creds) | cross-origin probe | ✅ 401 (reaches server — CORS OK) |
| API `…/api/onboarding/me` (`credentials:include`) | cross-origin probe | ❌ Failed to fetch (cookie-mode; app does not use this — see §4) |
| API `…/api/install/doctor?site_key=…` | live UI poll | ❌ 401 (repeated) |
| API `…/api/onboarding/update` | live UI + replicated | ❌ 400 |

---

## 4. CORS Fix Verification

**✅ The CORS fix works for the real app.** Phase 1 probe matrix from the dashboard origin:

| Probe | Mode | Result | Interpretation |
|---|---|---|---|
| `GET /health` | default (no creds) | **200, ok:true** | dashboard origin now allowed ✅ |
| `GET /health` | `credentials:include` | Failed to fetch | cookie-mode rejected (see note) |
| `GET /api/onboarding/me` | default (no creds) | **401** (reached server) | CORS allowed ✅ |
| `GET /api/onboarding/me` | `credentials:include` | Failed to fetch | cookie-mode rejected |
| `GET /api/onboarding/me` | `Authorization` header | **401** (reached server) | CORS preflight + request allowed ✅ |

**Definitive proof:** with the operator logged in, the real UI **advanced from Step 1 → Step 2** (Confirm Domain succeeded and persisted `domain` to the backend). Before the fix this was impossible.

> Note on `credentials:include`: the `cors()` middleware ([api/index.js:309](../../api/index.js)) reflects the origin but does **not** set `Access-Control-Allow-Credentials: true`, so cookie-credentialed requests fail. This is **irrelevant** to the app, which authenticates with `Authorization: Bearer <jwt>` (not cookies) — confirmed by the live flow working. Not a blocker; noted for completeness.

The previous blocker (`BLOCKED — staging API CORS still failing`) is **resolved**.

---

## 5. Screens / States Observed

| Step | Screen | Render |
|---|---|---|
| 1 | **Connect Domain** — globe icon, domain input (`ex: google.com`), "Confirm Domain →" | ✅ Clean; submit now succeeds |
| 2 | **Business Type** — "Select business type": eCommerce / SaaS / Lead Gen-Other cards | ✅ Clean; click auto-advances |
| 3 | **Install Method** — SourceTrack Pixel (Recommended) / Google Tag Manager | ✅ Clean; click auto-advances |
| 4 | **Install Script** — "Install Tracking Script", 4-step instructions, snippet box, Copy Code, platform guides (GTM/Webflow/WordPress/Framer/Shopify), Continue | ⚠️ Renders; **snippet URL is wrong** (see §13 bug 4) |
| 5 | **Customize** — "Configure Conversions" checkboxes: Purchase (pre-checked), Free Trial, Lead Form, Sign Up, Schedule a Meeting, Custom (greyed) | ✅ Clean; checkboxes toggle |
| 6 | **Run Verification** — "Verify your script" / Tracking Doctor panel | 🔴 **Stuck on "Loading setup diagnostics…"** + completion error |

Stepper shows green ✓ as you advance (good visual feedback), but this reflects **client-side** state only — the backend disagrees.

---

## 6. Step-by-Step Onboarding Table

| Step | UI action | UI result | Backend reality |
|---|---|---|---|
| 1. Connect Domain | Entered `qa-139ic-browser.example.com`, clicked Confirm | ✅ Advanced to Step 2, step 1 ✓ | `domain` saved, `current_step=2` ✅ |
| 2. Business Type | Clicked **eCommerce** | ✅ Advanced to Step 3 | ❌ **400 swallowed** — `business_type` NOT saved, step stays 2 |
| 3. Install Method | Clicked **SourceTrack Pixel** | ✅ Advanced to Step 4 | ❌ not persisted (still step 2) |
| 4. Install Script | Reviewed snippet, **Copy Code** (works), Continue | ✅ Advanced to Step 5 | ❌ not persisted |
| 5. Customize | Toggled **Sign Up** (added to Purchase), Continue | ✅ Advanced to Step 6 | ❌ not persisted |
| 6. Run Verification | Diagnostics spin; clicked **Verify Later (Skip for now)** | 🔴 Red error: **"Invalid step transition from step 2 to step 6"** | `POST /onboarding/update` → 400 |
| Final | Navigated to `/dashboard` | 🔴 **Bounced to `/onboarding` step 2**, selections lost | `onboarding_completed=false`, `business_type=null` |

---

## 7. Buttons / Forms / Modals Tested

| Element | Tested? | Result |
|---|---|---|
| Domain input + Confirm Domain | ✅ | Works — site created, advances (CORS fixed) |
| Business Type cards (eCommerce) | ✅ | Selects + auto-advances UI; **backend save 400s silently** |
| Install Method cards (SourceTrack Pixel) | ✅ | Selects + auto-advances |
| Snippet display | ✅ | Renders; **points to `localhost:8080`** (bug) |
| **Copy snippet button** | ✅ | **Clipboard populated correctly** (119-char snippet) — but **no "Copied!" confirmation** shown |
| Conversion checkboxes (Purchase, Sign Up) | ✅ | Multi-select toggles correctly |
| Continue buttons (steps 4, 5) | ✅ | Advance UI |
| Back / Go Back links | 👁️ Present | Rendered on each step (not exhaustively exercised) |
| Verification / "Verify Later (Skip for now)" | ✅ | Triggers the completion 400 error |
| Final dashboard transition | ✅ | 🔴 **Fails** — bounced to onboarding |

---

## 8. Console Findings

| Source | Severity | Detail |
|---|---|---|
| App console | ✅ Clean | No app JS errors/warnings on any onboarding screen |
| Extension noise | ℹ️ Ignore | Only `Client disconnected` from a `chrome-extension://…` script |
| Silent failures | ⚠️ | The step-2 `400` and doctor `401`s do **not** surface as console errors or visible UI errors during the flow — they are swallowed (see §13) |

---

## 9. Network Findings

| Request | Status | Notes |
|---|---|---|
| `POST /api/onboarding/site` (Step 1) | ✅ 200 (inferred — UI advanced, domain persisted) | CORS fixed |
| `POST /api/onboarding/update` (Step 2 business type) | 🔴 **400** | `install_method must be one of: gtm, standard` — **swallowed** by frontend |
| `GET /api/install/doctor?site_key=…` (Step 6) | 🔴 **401** ×7 (polling, last "pending") | App-level auth/site-key rejection — **not CORS** |
| `POST /api/onboarding/update` (Verify Later) | 🔴 **400** | `Invalid step transition from step 2 to step 6` |
| `GET /api/onboarding/status` | ⚠️ **400** | Status endpoint errors |
| PostHog `us.i.posthog.com/i/v0/e/` | ✅ 200 | Analytics fine |

No 5xx. No cold-start stalls observed this run. Cross-origin API XHRs are not always individually listed by the extension's network panel, but the failing statuses above were captured directly.

---

## 10. Screenshots Captured

Extension capture IDs (described in §5–§6; no image files committed):

| ID | Screen |
|---|---|
| `ss_4506nf885` | Step 2 Business Type — **proves CORS fix** (Step 1 succeeded) |
| `ss_9695kuuc4` | Step 4 Install Script — snippet showing `http://localhost:8080/tracker.min.js` |
| `ss_1525uvk4w` | Copy Code clicked (no "Copied!" feedback) |
| `ss_159083rz1` | Step 5 conversions — Purchase + Sign Up checked |
| `ss_82463j31w` | Step 6 — stuck "Loading setup diagnostics…" |
| `ss_8201t2kl9` | Step 6 — red **"Invalid step transition from step 2 to step 6"** |
| `ss_6786kyifl` | `/dashboard` → **bounced to `/onboarding` step 2**, selections lost |

---

## 11. DB Verification

No Supabase MCP available this session. Authoritative backend state via the app's own authenticated `/api/onboarding/me` (token used transiently, never exposed):

```json
{
  "has_site": true,
  "current_step": 2,
  "onboarding_completed": false,
  "business_type": null,
  "domain": "qa-139ic-browser.example.com"
}
```

- `has_site: true`, `domain` saved → **Step 1 persisted** (CORS fix working).
- `current_step: 2`, `business_type: null` → **nothing after Step 1 persisted**, despite the UI reaching Step 6.
- `onboarding_completed: false` → onboarding incomplete; dashboard correctly gated.

Site key was visible in the Step 4 snippet; **redacted here per the rules** as `3666feb2-…-ed737f0fc6ca`. No service keys / Stripe keys / JWTs printed.

---

## 12. UX Simplicity Verdict vs DataFast

**Brutally honest:**

1. **Simple enough for a non-technical founder?** The *design* is — 6 clearly-named steps, click-to-advance, one primary CTA per screen. But it is **currently unusable**: the founder completes every visible step and still cannot finish or reach the dashboard. That is worse than DataFast, which gets a non-technical user to "installed" without dead ends.
2. **Copy clear?** Yes — plain-English step copy ("Register your domain (e.g., yourstore.com)", "Data should start flowing within the next few minutes").
3. **Each step necessary?** Reasonable. Business type → conversion defaults is a nice touch. Verification as its own step is fine.
4. **Failure state friendly?** **No.** "Invalid step transition from step 2 to step 6" is raw/technical and actionless. The verification step spins forever on "Loading setup diagnostics…" with no timeout or "couldn't verify — paste the snippet and retry" guidance.
5. **Snippet install clearer or weaker than DataFast?** Structurally comparable (one script tag, platform guides). **Weaker in practice** because the generated snippet points to `localhost:8080` — copy-pasting it does nothing on a real site.
6. **Verification automatic enough?** No — it 401s and never resolves; there is no auto-detect-first-pageview success path observed. DataFast's auto-detection is materially better.
7. **What would make it lighter/faster?** (a) Don't send `install_method:null` on the business-type step; (b) surface save failures instead of swallowing them; (c) give the Tracking Doctor a timeout + friendly "not detected yet" state; (d) fix the staging tracker URL; (e) add a "Copied!" confirmation.

**Not verified (blocked):** post-onboarding dashboard content, real first-pageview verification success path.

---

## 13. Bugs Found

| # | Severity | Bug | Evidence |
|---|---|---|---|
| 1 | **P0 / Blocker** | **Onboarding cannot complete.** Frontend `handleBusinessTypeSelect` sends `install_method: null` ([Onboarding.jsx:222-224](../../dashboard/src/pages/Onboarding.jsx)); backend `/onboarding/update` rejects it: `400 "install_method must be one of: gtm, standard"` ([onboarding.js:64](../../api/routes/onboarding.js)). Backend stays at `current_step=2`; completion then fails `400 "Invalid step transition from step 2 to step 6"` (guard at [onboarding.js:306](../../api/routes/onboarding.js)). | Replicated 400 + `/me` state + UI error |
| 2 | **P0 / Contributing** | **Silent error swallowing.** `saveOnboardingState` ([Onboarding.jsx:154](../../dashboard/src/pages/Onboarding.jsx)) try/catches and discards failures, so the UI advances through all 6 steps and shows green ✓ while the backend never progresses. The user only discovers the failure at the very end (or on reload, losing all progress). | Code + `business_type=null` after full walkthrough |
| 3 | **P1** | **Tracking Doctor 401 + infinite spinner.** `GET /api/install/doctor?site_key=…` returns 401 repeatedly; `SetupDoctorCard` polls forever showing "Loading setup diagnostics…" and never renders its own error state ([SetupDoctorCard.jsx:151,165](../../dashboard/src/components/SetupDoctorCard.jsx)). Route requires `requireUserAuth + validateSiteKey + requireSiteMembership` ([install.js:100](../../api/routes/install.js)); 401 originates from site-key validation, **not CORS**. | Live network (7× 401) |
| 4 | **P2** | **Snippet points to localhost.** Generated snippet `src="http://localhost:8080/tracker.min.js"` — backend falls back to `localhost:PORT` because `TRACKER_BASE_URL`/`FRONTEND_URL` are unset on staging API ([install.js:39-44](../../api/routes/install.js)). Copied snippet is non-functional on a real site. | Snippet display + clipboard |
| 5 | **P3** | **No copy confirmation.** Copy Code populates the clipboard correctly but shows no "Copied!" feedback. | Clipboard read + screenshot |
| 6 | **P3** | `GET /api/onboarding/status` returns 400. | Probe |
| 7 | (Process note) | The prior **API-only** QA passed onboarding end-to-end because its synthetic payloads sent `business_type` / `install_method` on separate steps and never replicated the frontend's `install_method:null` payload — masking bug #1. Browser QA is required to certify onboarding. | This report |

---

## 14. Blockers

| Blocker | Impact | Fix |
|---|---|---|
| Bug #1 (install_method:null rejected) | Onboarding cannot complete; dashboard unreachable | Frontend: omit `install_method` until chosen, OR backend: treat `null` as "not set". Re-run after fix. |
| Bug #2 (swallowed errors) | Failures invisible; progress lost | Surface save errors; don't auto-advance on failed persist |
| Bug #3 (doctor 401 + spinner) | Verification step unusable | Fix doctor auth/site-key handling; add timeout + error state |
| Bug #4 (localhost snippet) | Snippet non-functional on staging | Set `TRACKER_BASE_URL` on staging `SourceTrack-Api` |
| No Supabase MCP | DB checks done via app API instead | Connect Supabase MCP for direct row inspection if required |

---

## 15. Fixes Made, If Any

**None.** This was QA-only. No code, config, commits, or pushes. (One read-only Railway-side change was expected *before* this run — the `ALLOWED_ORIGINS` CORS fix — and is confirmed effective; it was not made by this session.)

---

## 16. Raw Validation Output

```
$ npm run qa:env-safety       → ✅ All offline environment safety tests passed
$ npm run qa:static           → ✅ PASS — static launch QA passed
$ git diff --check            → clean (exit 0)
$ git status --short          → ?? docs/qa/browser_onboarding_ui_qa_139I-C.md
$ gh run list --limit 5       → latest "Session 139I-C — Verify staging onboarding API" = success (green)
$ grep -RIn "<local-file-uri>" docs dashboard api tracker SESSION_*.md supabase → (no matches)
```

### Key in-page probe / API evidence (real Chrome, dashboard origin)

```
health (no creds)            → { ok: true, status: 200 }          # CORS fixed
onboarding/me (no creds)     → 401 (reached server)               # CORS fixed
onboarding/me (Bearer)       → backend state: current_step=2, business_type=null, onboarding_completed=false
onboarding/update (step 3)   → 400 "install_method must be one of: gtm, standard"
onboarding/update (complete) → 400 "Invalid step transition from step 2 to step 6"
install/doctor?site_key=…    → 401 (×7, polling)
snippet src                  → http://localhost:8080/tracker.min.js   # wrong for staging
```

---

## 17. Git Status

```
No commits. No pushes. No code/config changes.
Working tree: only docs/qa/browser_onboarding_ui_qa_139I-C.md is modified/untracked.
No secrets, tokens, JWTs, cookies, service keys, Stripe keys, or full site keys exposed.
(Supabase access token used transiently in-page for state read only — never returned or logged. Site key redacted.)
```
