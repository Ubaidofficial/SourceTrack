# QA Report — Multi-Site Resume / Add-Site Onboarding Entry (139I-F)

**Session:** 139I-F — Add Explicit Resume/Add-Site Onboarding Entry
**Date:** 2026-06-12
**Branch:** `main` (no commits, no pushes)
**Verdict:** **PARTIAL — code implemented + dashboard build green; staging browser verification of the new UI pending deploy of this diff**

> Why PARTIAL: the change is frontend-only and is **not deployed** — staging currently runs `6629c5f` (139I-E). Uncommitted UI cannot be click-tested on the staging-deployed dashboard. The load-bearing **backend** behavior the new entry relies on (`/onboarding/me?mode=onboarding` resolving the latest incomplete site, and honoring an explicit `site_id`/`site_key` hint via `resolveOnboardingSite`) was already verified on the live staging API in **139I-E**. Full browser scenarios A–E should be run in a follow-up **139I-F — Browser Verification** session after this diff is reviewed, committed, and deployed. This mirrors the implement→verify split used for 139I-D and 139I-E.

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
