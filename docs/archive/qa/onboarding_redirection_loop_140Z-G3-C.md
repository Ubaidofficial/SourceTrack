# QA Report — Onboarding Redirection Loop Fix
## Session: 140Z-G3-C

**Date:** 2026-06-18
**Branch:** (local, uncommitted — awaiting review)
**Changed files:** `dashboard/src/App.jsx`, `dashboard/src/pages/Onboarding.jsx`
**Scope:** Fix the client-side routing loop that sends authenticated users with completed onboarding to `/onboarding` Step 1 on any API error.

---

## Root Cause

### Primary bug — `ProtectedRoute` fail-closed catch block (App.jsx)

```js
// BEFORE (line 109-112, original)
} catch (_err) {
  // "fail open" — comment was wrong; this is fail-CLOSED for completed users
  if (alive) setOnboarding({ loading: false, completed: false, hasSite: false })
}
```

When `/api/onboarding/me` returns an error for **any reason** — 401 expired session,
network failure, Railway 5xx, rate limit — the catch sets `completed: false`. The gate
then unconditionally fires `<Navigate to="/onboarding" replace />`. Completed users are
silently bounced to Step 1 with no explanation and no recovery path.

### Secondary bug — `Onboarding.jsx` Step 1 flash

`step` initialises to `1`. `loadOnboardingStatus()` is async. Before it resolves, the
component renders Step 1 (Connect Domain) for every user regardless of their actual
progress. On slow networks or API errors, the flash becomes permanent.

### Tertiary bug — `Onboarding.jsx` Verify Later guard drops in-memory state

`businessType` and `installMethod` were only hydrated when `state.current_step > 1`.
If a user resumed onboarding from a fresh page load to Step 6, the in-memory fields
would be null even though the DB had the values, causing the Verify Later guard to
show an error message and block skip.

---

## Changes Made

### `dashboard/src/App.jsx`

**New imports:** `useNavigate` from react-router-dom; `useRef`, `useCallback` from React.

**ProtectedRoute rewritten with 4 explicit phases:**

1. **Phase 1** — AuthContext loading → spinner (unchanged)
2. **Phase 2** — `/onboarding/me` in-flight → spinner (unchanged)
3. **Phase 3 (NEW)** — API error → no redirect; show recoverable UI:
   - `errorKind: 'auth'` (401/403): shows "Your session may have expired." + **Sign in again** button. No auto-retry; session is invalid.
   - `errorKind: 'transient'` (network/5xx/other): auto-retries once after ~1 s. If retry also fails, shows **Try again** + **Sign in again** buttons. `autoRetriedRef` prevents infinite retry loops.
4. **Phase 4** — Known answer: redirect rules fire only here (logic unchanged).

**Error classification:**

```js
const status = err?.status
const isAuthError = status === 401 || status === 403
const errorKind = isAuthError ? 'auth' : 'transient'
```

**Copy (as specified):**
- Heading: "Having trouble checking your setup."
- Auth sub-copy: "Your session may have expired. Please sign in again."
- Transient sub-copy: "We'll try once more. If this keeps happening, sign in again or contact support."
- Buttons: "Try again" (always) + "Sign in again" (always)

**autoRetried guard:** `autoRetriedRef.current` resets to `false` on every `user?.id`
change. Prevents re-triggering auto-retry if user manually clicks "Try again" after
the auto-retry already ran.

### `dashboard/src/pages/Onboarding.jsx`

**`statusLoading` state (initial: `true`):** Guards the entire page render until
`loadOnboardingStatus()` resolves. Set to `false` in the `finally` block.

**Always-hydrate `businessType`/`installMethod`:** Moved `setBusinessType`,
`setInstallMethod`, `setSelectedConversions` out of the `if (state.current_step > 1)`
block so they are always populated from site data when the site is found.

**Removed redundant step guard:**
The `if ((site.business_type || state.business_type) && stepToSet < 3)` block was
removed — it was made redundant by the unconditional hydration above.

---

## Behaviour Matrix

| Scenario | Before | After |
|---|---|---|
| Completed user hits `/dashboard`, API OK | ✅ Dashboard | ✅ Dashboard |
| Completed user hits `/dashboard`, 401 expired | ❌ → `/onboarding` Step 1 loop | ✅ Error screen → Sign in again |
| Completed user hits `/dashboard`, network/5xx | ❌ → `/onboarding` Step 1 loop | ✅ Auto-retry once → success → Dashboard |
| Incomplete user hits `/dashboard` | ✅ → `/onboarding` | ✅ → `/onboarding` |
| Incomplete user hits `/onboarding`, API OK | ⚠️ Step 1 flash then correct step | ✅ Spinner until correct step loads |
| Incomplete user hits `/onboarding`, API fails | ❌ Stays on Step 1 permanently | ✅ Stays on Step 1 (safe fallback; no loop) |
| Completed user hits `/onboarding`, no intent params | ✅ → `/dashboard` | ✅ → `/dashboard` |
| Completed user hits `/onboarding?mode=onboarding` | ✅ Stays in flow | ✅ Stays in flow |
| Step 6 Verify Later, businessType null after reload | ❌ Error message blocks skip | ✅ businessType always hydrated; skip proceeds |
| Super admin | ✅ Bypass | ✅ Bypass |

---

## What Was NOT Changed

- `api/routes/onboarding.js` — untouched
- `AuthContext.jsx` — untouched
- `SiteContext.jsx` — untouched
- Billing, Stripe, attribution math — untouched
- Staging/production seed data — untouched
- Any other dashboard page — untouched
- Auth/tenant checks — untouched and not weakened

---

## Static Verification Results

```
git diff --check
  → PASS (no whitespace errors)

npm run qa:static
  → PASS (all checks passed; existing historical warnings in SESSION_LOG.md only)

cd dashboard && npm run build
  → PASS (✓ 2080 modules transformed, built in 3.06s)
  → Pre-existing chunk-size warning (not introduced by this session)

git status --short --untracked-files=all
  → M dashboard/src/App.jsx
  → M dashboard/src/pages/Onboarding.jsx
  → (exactly 2 files modified, no untracked artefacts)
```

---

## Known Limitations / Not Fixed In This Session

1. **Step 1 API-fail fallback** — When `loadOnboardingStatus()` fails, Onboarding.jsx
   still shows Step 1. Safe fallback; not a loop. Full fix (client-side cache) is out
   of scope per R2.

2. **`installMethod` defaults to `'standard'` when DB has null** — If a user
   previously had `install_method: null` in the DB state, the unconditional hydration
   will now set it to `'standard'`. This is the intended default everywhere else.
   Flagged as a behaviour change.

3. **Chunk size warning** — Pre-existing, not introduced by this session.

---

## Manual QA Checklist (For Deployer)

- [ ] Deploy to staging
- [ ] Login as completed user → visit `/dashboard` → confirm stays on `/dashboard`
- [ ] Visit `/onboarding` as completed user (no params) → confirm redirect to `/dashboard`
- [ ] Login as incomplete user → confirm redirect to `/onboarding`, correct step loads (no Step 1 flash)
- [ ] Simulate auth error (invalidate session) → confirm error screen, "Sign in again" works
- [ ] On Step 6, reload page → click "Verify Later" → confirm proceeds without "Go back to Business Type" error
- [ ] Confirm super admin bypass still works

---

*Report: Antigravity AI Agent*
*Session: 140Z-G3-C — Fix Onboarding Redirection Loop*
*Status: CODE COMPLETE — NOT COMMITTED — Awaiting review and manual QA*
