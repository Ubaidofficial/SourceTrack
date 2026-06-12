# QA Report — Multi-Site Resume / Add-Site Onboarding Entry (139I-F)

**Session:** 139I-F — Add Explicit Resume/Add-Site Onboarding Entry
**Date:** 2026-06-12
**Branch:** `main` (no commits, no pushes)
**Verdict:** **✅ PASS — all browser scenarios (A–E) verified on staging** (deploy `9867714`).

> The implementation section below was written when the diff was still local (PARTIAL). The diff was subsequently committed (`9867714`) and deployed to both staging services, and all browser scenarios were then verified against the deployed UI — see the **Browser Verification Addendum** at the bottom.

---

## 1. Goal

Give multi-site users an explicit, lightweight way to **resume setup** of an incomplete site **without weakening the dashboard gate** (which 139I-E fixed so `/dashboard` prefers completed sites and never bounces). No change to dashboard site-preference; no heavier app.

## 2. Root cause being addressed (from 139I-E)

Direct `/onboarding` redirected to `/dashboard` whenever a completed site coexisted, because `ProtectedRoute` evaluated the **Dashboard** policy (no `mode=onboarding`) and redirected before `Onboarding.jsx` (which uses `?mode=onboarding`) could mount. There was also no explicit "Resume setup" affordance for an incomplete second site.

## 3. Changes implemented (frontend-only, minimal)

| File | Change |
|---|---|
| `dashboard/src/App.jsx` | `ProtectedRoute` now reads `useLocation().search` and computes `explicitOnboardingIntent` (true on `/onboarding` when the URL carries `mode=onboarding`, `site_id`, or `site_key`). The `/onboarding`→`/dashboard` redirect is **bypassed only for that explicit intent**, so a user who also owns a completed site is not bounced away from an intentional resume. **Bare `/onboarding` with no intent still redirects completed users to `/dashboard` — the dashboard gate is unchanged.** |
| `dashboard/src/pages/Onboarding.jsx` | `loadOnboardingStatus()` now reads `site_id`/`site_key` from the URL and includes the hint in its existing `/onboarding/me?mode=onboarding` call (`site_id` preferred, else `site_key`, else saved active key). The backend `resolveOnboardingSite` honors the hint only for the user's own **incomplete** site; a completed/foreign hint falls back safely (and a resolved-completed site still redirects to `/dashboard`). |
| `dashboard/src/pages/Dashboard.jsx` | The "Finish setting up" empty-state card now shows a **"Resume setup"** button when the active site is incomplete (`onboarding_completed === false`), navigating to `/onboarding?site_id=<activeSite.id>&mode=onboarding`. Copy adapts for the incomplete case. "Go to Install Guide" retained. |
| `dashboard/src/components/Layout.jsx` | The active-site area now shows a small **"Resume setup"** link beneath the site switcher when the active site is incomplete, navigating to `/onboarding?site_id=<activeSite.id>&mode=onboarding`. |

No backend (`api/`) changes — the backend already supports `mode=onboarding` + `site_id`/`site_key` hints (added in 139I-E). No duplicate-prevention logic touched (same-domain resume remains intact).

## 4. Build / static validation (run this session)

- `dashboard` Vite production build: **✅ built** (2078 modules; only the pre-existing >500 kB chunk-size advisory, unrelated to this change).
- `npm run qa:env-safety`: ✅ (see §7).
- `npm run qa:static`: ✅ PASS (see §7).
- `git diff --check`: clean.
- Only 4 source files modified; `dashboard/dist` is gitignored (no build artifacts staged).

## 5. Backend behavior relied upon — verified on staging in 139I-E

These were confirmed against the live staging API during 139I-E browser QA and are unchanged:
- `/api/onboarding/me?mode=onboarding` → resolves the latest **incomplete** site (Onboarding policy).
- `resolveOnboardingSite` honors a `site_id`/`site_key` hint **only** when it matches one of the **user's own incomplete** sites; otherwise falls back to the user's latest incomplete → latest completed.
- Foreign `site_id`/`site_key` is never resolved (returns the user's own site, or 404 on `/status`/`/update`) — no cross-tenant leak.
- `POST /onboarding/site` resumes an existing same-domain incomplete site (no duplicate).

> Note: a fresh staging re-probe was attempted this session but the operator's staging session token had expired (401). No new live assertions were added; the above stand from the 139I-E run documented in `docs/qa/multi_site_onboarding_gate_qa_139I-E.md`.

## 6. Staging browser scenarios — TO RUN after deploy (139I-F — Browser Verification)

Not yet executed (uncommitted UI). Expected results:

| Scenario | Expected |
|---|---|
| **A — Completed-site dashboard stable** | User with completed + incomplete site → `/dashboard` loads the **completed** site; no bounce to onboarding. (Dashboard gate unchanged — already verified in 139I-E.) |
| **B — Incomplete site explicit resume** | On the dashboard "Finish setting up" card (or switcher link) for an incomplete active site, click **"Resume setup"** → opens `/onboarding?site_id=<incomplete>&mode=onboarding`, resumes the correct incomplete site at the correct step. |
| **C — Direct explicit onboarding URL** | Open `/onboarding?site_id=<incomplete>&mode=onboarding` directly → **not** redirected to `/dashboard`; resumes the incomplete site. |
| **D — Completed-only user** | Bare `/onboarding` (no intent) → safely redirects to `/dashboard`; no trap. |
| **E — Security** | Foreign/invalid `site_id`/`site_key` does not resolve a foreign site (falls back to own / 404). No full site keys, cookies, JWTs, tokens, Supabase/Stripe/webhook keys, or Railway vars exposed in UI/logs/report. |

## 7. Raw validation output (this session)

```
$ (cd dashboard && npm run build)   → ✓ built in ~3.3s (pre-existing chunk-size advisory only)
$ npm run qa:env-safety             → ✅ All offline environment safety tests passed
$ npm run qa:static                 → ✅ PASS — static launch QA passed
$ git diff --check                  → clean (exit 0)
$ git status --short                →
   M dashboard/src/App.jsx
   M dashboard/src/components/Layout.jsx
   M dashboard/src/pages/Dashboard.jsx
   M dashboard/src/pages/Onboarding.jsx
   (+ docs/qa/multi_site_resume_setup_qa_139I-F.md, SESSION_*.md after this writeup)
```

## 8. Next step

Review the raw diff → commit + deploy → run **Session 139I-F — Browser Verification** (scenarios A–E above) on staging. Do not mark PASS until the real browser scenarios are verified against the deployed UI.

No commits. No pushes. No secrets, tokens, JWTs, cookies, Supabase/Stripe/webhook/service keys, Railway variable values, or full site keys exposed.

---
---

# Browser Verification Addendum — Real Claude-in-Chrome run (2026-06-12, deploy `9867714`)

> The staging browser QA the implementation section deferred. Real navigation, switcher interaction, "Resume setup" clicks, and live API probes against staging on deploy `9867714`. Operator-authenticated (`imubaid93@gmail.com`); no password/token/full-site-key exposed. No commits/pushes.

## C0. Verdict

**✅ PASS — all scenarios A–E browser-verified on staging.**

The explicit Resume/Add-Site onboarding entry works end-to-end: multi-site users can resume an incomplete site, the dashboard gate is unchanged (still prefers completed sites, no bounce), and foreign/bad hints fall back safely.

## C1. Preflight / deploy

Both staging services on **`9867714`**: `SourceTrack-Dashboard` (cac3c355, SUCCESS @ 00:26 UTC) and `SourceTrack-Api` (2d7c973b, SUCCESS @ 00:26 UTC). CI green. Account state: 3 sites — **qa-139ie (incomplete, step 2)**, qa-139id (completed), qa-139ic (completed).

## C2. Scenario results (real browser)

| Scenario | Result | Evidence |
|---|---|---|
| **A — Completed-site dashboard stability** | ✅ **PASS** | Cleared active key → `/dashboard` stays on dashboard (no bounce); active resolves to **qa-139id (completed)**, not the incomplete qa-139ie. Card shows generic "Go to Install Guide" (no Resume CTA for a completed active site). `ss_455116ysm` |
| **B — Incomplete site explicit resume from UI** | ✅ **PASS** | Selecting qa-139ie in the switcher surfaced **two** "Resume setup" actions — one under the Layout site switcher, one in the Dashboard "Finish setting up" card (which switched to the incomplete-variant copy). Clicking it navigated to `/onboarding?site_id=<redacted>&mode=onboarding` and the **Onboarding page loaded** (no dashboard redirect), resuming **qa-139ie at Step 2 (Business Type)**. `ss_19391n6qn`, `ss_3185caykk` |
| **C — Direct explicit onboarding URL (cold load)** | ✅ **PASS** | Direct navigation to `/onboarding?site_id=<incomplete>&mode=onboarding` stayed on `/onboarding` (not redirected) and resumed qa-139ie at Step 2. Route guard respects explicit intent on a fresh load. `ss_5568v8wg6` |
| **D — Completed-only / bare onboarding** | ✅ **PASS** | Bare `/onboarding` (no `site_id`/`site_key`/`mode`) with a completed site present → redirected to `/dashboard`. Completed users not trapped; dashboard gate unchanged. `ss_8313xle7g` |
| **E — Security / bad hints** | ✅ **PASS** | `mode=onboarding` with a **foreign `site_id`**, a **foreign `site_key`**, and a **completed-site `site_id`** all resolved to the user's **own incomplete** site (qa-139ie, `is_own_site:true`), never a foreign site, and never reopened a completed site. Safe fallback. |

## C3. Behavior confirmed

- `ProtectedRoute` bypasses the `/onboarding`→`/dashboard` redirect **only** for explicit intent (`mode=onboarding`/`site_id`/`site_key`); bare `/onboarding` still redirects completed users to the dashboard (gate unchanged).
- `Onboarding.jsx` passes the `site_id` hint into `/onboarding/me?mode=onboarding` and resumes the correct incomplete site at the correct step.
- Resume-setup CTA renders in both preferred locations (Dashboard card + Layout switcher) and only when the active site is incomplete.
- Same-domain duplicate prevention untouched (no `/onboarding/site` changes).

## C4. Console / network

App console clean (only `chrome-extension://` noise). No raw 4xx/5xx surfaced to the user during navigation. One in-page `eval` of `location.search` was harness-blocked (query-string guard) — the tab URL confirmed the `site_id`+`mode` params instead. Site identifiers shown are internal UUIDs (not site **keys**) and are redacted in this report.

## C5. Minor observation (non-blocking)

When the active site is a **completed** site and an incomplete site exists *elsewhere*, no proactive "finish your other site" nudge appears — the user must select the incomplete site in the switcher to surface "Resume setup". This matches the 139I-F spec ("if an incomplete site is selected or listed"; the switcher lists it) and the deliberate decision not to weaken the dashboard gate, so it is **by design**, not a defect. Noted only as a future discoverability consideration.

## C6. Screenshots

`ss_79468n4kh` (initial mixed-state dashboard) · `ss_455116ysm` (Scenario A) · `ss_19391n6qn` (Resume CTAs visible) · `ss_3185caykk` (Scenario B → onboarding resumed) · `ss_5568v8wg6` (Scenario C cold load) · `ss_8313xle7g` (Scenario D bare → dashboard).

No commits. No pushes. No secrets, tokens, JWTs, cookies, Supabase/Stripe/webhook/service keys, Railway variable values, or full site keys exposed.
