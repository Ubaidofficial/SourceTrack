# QA Report — Multi-Site Onboarding Gate Verification

**Session:** 139I-E — Fix Multi-Site Onboarding Gate Edge Case
**Date:** 2026-06-12
**Verdict:** **PARTIAL — code implemented; browser QA pending** (Core code fixes implemented and static/build validation passed; scenario-level API and browser QA remain pending).

> ⬇️ **UPDATE 2026-06-12 — real-browser verification completed on staging (deploy `6629c5f`). See the "Browser Verification Addendum" at the bottom. Browser verdict: PASS WITH LIMITS.**

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

---
---

# Browser Verification Addendum — Real Claude-in-Chrome run (2026-06-12)

> The actual browser QA the prep report above said was pending. Real navigation, switcher interaction, screenshots, and live network capture on staging deploy `6629c5f`. Backend assertions read via the app's own authenticated API (no Supabase MCP). Operator-authenticated (`imubaid93@gmail.com`); no password/token/full-site-key exposed. No commits/pushes.

## B0. Verdict

**🟡 PASS WITH LIMITS — dashboard multi-site gate fixed; incomplete-site onboarding resume still needs follow-up**

The primary paid-beta trap (a user with a completed site bounced from `/dashboard` to `/onboarding` because the app picked the oldest/incomplete site) is **fixed and verified**. Dashboard now deterministically resolves to a completed site, same-domain submissions resume without duplicating, and foreign site keys/ids are not honored.

**However, one 139I-E requirement still failed in browser QA:** *"Direct `/onboarding` with an incomplete site present should resume the incomplete site."* It does not — direct `/onboarding` redirects to `/dashboard` whenever a completed site coexists. This is **not** a paid-beta blocker for clean first-time single-site users, but it is a real multi-site UX gap and is tracked as an explicit follow-up — **Session 139I-F — Add Explicit Resume/Add-Site Onboarding Entry** (see B10), not buried as a vague product decision.

## B1. Preflight / deploy

- `SourceTrack-Api` (8e08182a) + `SourceTrack-Dashboard` (47f7d202) both **SUCCESS on `6629c5f`**. CI green. Confirmed redeployed.
- Tool: Claude in Chrome, Chrome/macOS. Backend reads via app-authenticated `/api/onboarding/me`, `/api/onboarding/status`, `/api/sites` (token used transiently, never logged).

## B2. Test account state

Existing QA account had **2 completed sites** and **no UI "add site" path** (`/onboarding` redirects away when all sites complete), so an incomplete-site **fixture** was created via the app's authenticated `POST /api/onboarding/site` (the identical call Step 1 makes) — `qa-139ie-browser.example.com` (incomplete, step 2). Final inventory (sorted DESC, the new `/api/sites` order):

| pos | domain | completed | step | note |
|---|---|---|---|---|
| 0 | qa-139ie-browser.example.com | **false** | 2 | newest (fixture) |
| 1 | qa-139id-browser.example.com | true | 6 | |
| 2 | qa-139ic-browser.example.com | true | 6 | oldest |

This is the exact inverse-risk shape: **newest incomplete + older completed**.

## B3. Routes tested

`/dashboard` (multiple states) · `/onboarding` (only-completed, and with-incomplete-active) · site switcher selection · APIs `/onboarding/me` (±`mode=onboarding`, ±`site_key`), `/onboarding/site`, `/onboarding/status`, `/onboarding/update`, `/sites`.

## B4. Scenario results (real browser)

| Scenario | Result | Evidence |
|---|---|---|
| **A — Clean single-site user** | ⚠️ **Not run on a pristine fresh account** (account had 3 sites). Core behavior (single completed site → `/dashboard` loads, `onboarding_completed:true`) is a verified subset; the full first-time single-site flow was verified end-to-end in Session 139I-D. | — |
| **B — Older incomplete + newer complete (no explicit selection)** | ✅ **PASS** | Cleared active key → `/dashboard` stayed on `/dashboard` (no bounce); ACTIVE SITE resolved to **qa-139id (newest completed)**, **not** qa-139ie (newest incomplete). SiteContext persisted the completed key. `ss_7609nq9rr` |
| **C — Direct `/onboarding`, only completed sites** | ✅ **PASS** | `/onboarding` **redirected to `/dashboard`** — user not trapped. `ss_1026qe3ol` |
| **C — Direct `/onboarding`, incomplete site present (completed also exist)** | ⚠️ **LIMIT** — did **not** resume the incomplete site; redirected to `/dashboard`. SiteContext resets the active site to a completed one on load ([SiteContext.jsx:38-40](../../dashboard/src/contexts/SiteContext.jsx)) and the App gate uses the dashboard resolver, so the incomplete site cannot be resumed via the bare route while a completed site exists. Resuming works only when there is **no** completed site (the normal first-time flow, verified in 139I-D) or via same-domain resubmit (Scenario E). | `ss_26426l6zi` |
| **D — Direct `/dashboard`, mixed sites** | ✅ **PASS** | Loads dashboard; active = completed (qa-139id), never the incomplete qa-139ie. No onboarding bounce. `ss_7609nq9rr` |
| **E — Same-domain resume / duplicate prevention** | ✅ **PASS** | Resubmit incomplete domain → **same id**, `resumed:true`, step 2. Resubmit completed domain → same id, not reopened. Site count **3 → 3**; per-domain count unchanged. No duplicates. |
| **F — Tenant/security sanity** | ✅ **PASS** | `/me?site_key=<foreign>` ignored the foreign key and returned the user's **own** site (`is_own_domain:true`, no leak). `/status?site_id=<foreign>` and `/update` with foreign id both **404 "Site not found"**. No cross-tenant access. |

## B5. API behavior observed (redacted)

- `/api/sites` → **sorted `created_at` DESC** (qa-139ie, qa-139id, qa-139ic). ✅
- `/api/onboarding/me` (dashboard policy, default) → newest **completed** site (`onboarding_completed:true`), skipping the newer incomplete. ✅
- `/api/onboarding/me?mode=onboarding` → onboarding policy (prefers incomplete) — used by `Onboarding.jsx` once mounted.
- `/api/onboarding/site` (same domain) → resumes existing site, `resumed:true`, no duplicate. ✅
- Foreign `site_key`/`site_id` → ignored / 404, fallback to own site. ✅

## B6. Console / network

App console clean (only `chrome-extension://` noise). No raw 401/403/500 surfaced to the user during navigation. The bare `/onboarding` gate call was `GET /onboarding/me?site_key=<active>` (200).

## B7. Remaining limits (non-blocking)

| # | Sev | Limit |
|---|---|---|
| 1 | **P3 (tracked → 139I-F)** | **Incomplete second-site onboarding cannot be resumed via the bare `/onboarding` route while a completed site exists.** Root cause: `ProtectedRoute` ([App.jsx:97-100,139-143](../../dashboard/src/App.jsx)) calls `/onboarding/me?site_key=<active>` **without** `mode=onboarding`, so it evaluates the **Dashboard** policy (finds a completed site → `completed=true`) and redirects `/onboarding` → `/dashboard` **before** `Onboarding.jsx` (which correctly calls `?mode=onboarding`, [Onboarding.jsx:91](../../dashboard/src/pages/Onboarding.jsx)) can mount. Compounded by `SiteContext` ([SiteContext.jsx:38-40](../../dashboard/src/contexts/SiteContext.jsx)) resetting the active site to a completed one on load. The incomplete site is selectable in the switcher (shows its empty dashboard) but cannot re-enter the onboarding flow except by resubmitting its domain (Scenario E) or when no completed site exists. **Not a vague product decision — tracked as Session 139I-F (B10).** |
| 2 | Coverage | **Scenario A not run on a pristine brand-new single-site account** (operator reused an existing 3-site account; incomplete site created via authenticated API fixture). The single-site first-time flow was verified in 139I-D. |

The dangerous original bug (completed user trapped on onboarding / wrong active site) is **fixed**. The remaining items do not block paid beta for clean first-time single-site users.

## B10. Next task — Session 139I-F (explicit resume/add-site entry)

Limit #1 is a real multi-site UX gap, not a product hand-wave. It is queued as a tiny, explicit follow-up — **not** Session 139L.

**Session 139I-F — Add Explicit Resume/Add-Site Onboarding Entry**

Goal: give multi-site users an explicit way to resume/set up an incomplete site **without weakening the dashboard gate**.

Preferred UX:
- Add a clear **"Resume setup" / "Continue setup"** action in the site switcher and/or the dashboard "Finish setting up" card.
- The action navigates to onboarding with an explicit site hint and forces onboarding mode (e.g. `/onboarding?site_id=<incomplete>`), bypassing the completed-site redirect for that explicit intent.

Expected behavior after 139I-F:
1. `/dashboard` still prefers completed sites (no change to the gate).
2. Selecting an incomplete site can show a setup prompt.
3. Clicking "Resume setup" opens `/onboarding` for that incomplete site and resumes at the correct step.
4. `/onboarding?site_id=<incomplete>` (or equivalent) uses the onboarding policy and is **not** intercepted by the completed-site redirect.
5. Completed-site users with no incomplete sites still go to the dashboard.
6. No duplicate sites.

> Note: a one-line `ProtectedRoute` patch (pass `mode=onboarding` when `pathname === '/onboarding'`) was scoped and reviewed during this session but **deliberately not applied** — the fix is folded into 139I-F so the explicit resume entry and the gate behavior are designed together. No code was changed in 139I-E browser QA.

## B8. Test artifact note

A QA fixture site `qa-139ie-browser.example.com` (incomplete) was created on the staging QA account and left in place (no destructive deletes performed). Active site auto-reset to a completed site (qa-139id) after the run.

## B9. Raw validation

```
Preflight: both staging services SUCCESS on 6629c5f; 139I-E CI green.
/api/sites order            → DESC [qa-139ie(incomplete), qa-139id(completed), qa-139ic(completed)]
/dashboard (cleared key)    → stays /dashboard, active = qa-139id (completed)  [Scenario B/D PASS]
/onboarding (only completed)→ redirect /dashboard                              [Scenario C PASS]
/onboarding (incomplete active + completed exist) → redirect /dashboard, active reset to completed  [Scenario C LIMIT]
/onboarding/site (same domain) → same id, resumed:true, count 3→3              [Scenario E PASS]
/me?site_key=<foreign>      → own site returned, no leak                       [Scenario F PASS]
/status,/update <foreign id>→ 404 Site not found                              [Scenario F PASS]
Screenshots: ss_59715b852, ss_1026qe3ol, ss_7609nq9rr, ss_9900uec71, ss_26426l6zi
```

No commits. No pushes. No secrets, tokens, JWTs, cookies, Supabase/Stripe/webhook/service keys, Railway variable values, or full site keys exposed (site keys/ids redacted to 8-char prefixes).
