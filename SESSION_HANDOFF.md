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
