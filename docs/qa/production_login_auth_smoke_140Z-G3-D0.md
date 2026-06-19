# Production Auth Route and Redirect Smoke Verification QA Report
## Session: 140Z-G3-D0-A

**Date:** 2026-06-19
**Branch:** main
**Status:** BLOCKED (production auth route and redirect smoke verification Blocker Active)
**Target Domain:** `https://app.sourcetrack.ai`

---

## 1. Executive Verdict

- **Route Availability & Asset/API Health**: 🟢 **PASS**
  - All four authentication page routes serve their React SPA container and resolve compiled assets cleanly. The backend API health endpoint is online and reachable from the browser origin without CORS failures.
- **Supabase Redirect-Based Auth Flows**: 🚨 **BLOCKED / UNVERIFIED**
  - The following flows remain unverified and blocked due to domain migration mismatch:
    - password reset email recovery link
    - Google OAuth callback
    - `/auth/callback` token handling
    - valid user login on production, unless a dedicated production test user is safely available and approved

---

## 2. Route Diagnosis Matrix

| Route URL | Status | Final URL | SPA Loads | UI Description | Console Errors | Network/CORS Errors |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/login` | `200` | `/login` | ✅ Yes | Sign-in card with Google OAuth option, email/password fields, and sign-in button. | None | None |
| `/signup` | `200` | `/signup` | ✅ Yes | Signup card with Google OAuth option, email/password fields, and create-account button. | None | None |
| `/reset-password` | `200` | `/reset-password` | ✅ Yes | Renders the "Set new password" card with an error alert stating no active recovery session was found. | None | None |
| `/dashboard` | `200` | `/login` | ✅ Yes | Navigating unauthenticated correctly redirects client-side to `/login` via the `ProtectedRoute` guard. | None | None |

### Dummy Credential Test Finding
- **Input**: `test@example.com` / `password123`
- **Observed Behavior**: The client sends a `POST` request to `https://zxjjjsipafojhzkkumvh.supabase.co/auth/v1/token?grant_type=password` which returns `400 Bad Request` with `invalid_grant` error. The UI correctly renders the alert: *"Invalid email or password. Please verify your credentials and try again."*

---

## 3. Scope of Smoke Verification Script
The `scripts/qa-production-auth-smoke.mjs` script is non-mutating and serves only as a basic availability guard. **It does not imply or prove auth redirects.** It only proves:
- `/login`, `/signup`, `/reset-password`, `/dashboard` serve the SPA
- API health is reachable

---

## 4. Root Cause Analysis
* **Root Cause Confidence**: **LIKELY**
* **Detailed Explanation**:
  The frontend and API servers are correctly wired to production targets (`VITE_SUPABASE_URL=https://zxjjjsipafojhzkkumvh.supabase.co`, `VITE_API_URL=https://api.srctk.com`, `VITE_FRONTEND_URL=https://app.sourcetrack.ai`).
  However, because the production dashboard was recently migrated to the custom canonical domain (`app.sourcetrack.ai`), the production Supabase project's **Authentication URL Configuration** is highly likely still referencing the old Railway host (`sourcetrack-dashboard-production.up.railway.app`).
  As a result, Google OAuth redirects and password recovery links will fail by redirecting to the old domain instead of the canonical custom domain.

---

## 5. Required Operator Actions (Supabase Dashboard)

To resolve the domain redirect blockers, the operator must manually apply the following URL configuration changes in the **Supabase Dashboard** for the production project (`zxjjjsipafojhzkkumvh`):

1. **Authentication -> URL Configuration -> Site URL**:
   Set to: `https://app.sourcetrack.ai`
2. **Authentication -> URL Configuration -> Redirect URLs**:
   Add the following values:
   - `https://app.sourcetrack.ai/login`
   - `https://app.sourcetrack.ai/signup`
   - `https://app.sourcetrack.ai/reset-password`
   - `https://app.sourcetrack.ai/auth/callback`
   - `https://app.sourcetrack.ai/dashboard`
   - `https://app.sourcetrack.ai/**`
3. **Safety & Separation Isolation**:
   Verify that **NO staging** (`*staging.up.railway.app*`) or localhost URLs are allowlisted in the production project's redirect list. Staging and production configurations must remain strictly separate.

---

## 6. Post-Operator Verification Checklist

Once the operator has updated the Supabase settings:
- [ ] Submit a password reset request on `https://app.sourcetrack.ai/forgot-password` and verify that the delivered email link redirects to `https://app.sourcetrack.ai/reset-password`.
- [ ] Complete the password update flow and confirm that the user is correctly logged in on `https://app.sourcetrack.ai`.
- [ ] Test Google OAuth login by clicking "Continue with Google" on `https://app.sourcetrack.ai/login` and verify that it redirects back to `/auth/callback` and onto `/dashboard` on the canonical domain.

---

## 7. Operator Config Verification

- **MCP Write Available**: No (Supabase MCP server does not expose management endpoints or write actions for Authentication URL configuration).
- **Current Config Before Change**: Unretrievable via MCP (requires Supabase browser console access).
- **Config Applied**: None by MCP; manual operator configuration change is required.
- **Config After Change**: Site URL set to `https://app.sourcetrack.ai` and Redirect URLs configured to include canonical patterns (manually verified by operator).
- **Password Reset E2E Result**: 🚨 **BLOCKED / UNVERIFIED** (Requires manual Supabase Auth URL config updates and verification using a safe test account/email inbox).
- **Google OAuth E2E Result**: 🚨 **BLOCKED / UNVERIFIED** (Requires manual Supabase Auth URL config updates to correctly route callbacks to the canonical domain).
- **Final Verdict**: 🚨 **BLOCKED**

---

## 8. Production Auth Redirect E2E Verification

- **Supabase Auth URL Config Operator-Confirmed**: Yes (Operator manually updated settings in production Supabase project `zxjjjsipafojhzkkumvh` to target `https://app.sourcetrack.ai`).
- **Route Smoke After DNS Flush**: 🟢 **PASS** (Verified using the canonical domain `https://app.sourcetrack.ai` after local DNS cache flush resolved local environment DNS resolution issues).
- **Password Reset Request**: 🚨 **BLOCKED — inbox access required** (Reset submission successfully sends request, but E2E link retrieval is blocked by lack of mailbox access).
- **Reset Email Link Canonical Landing**: 🚨 **BLOCKED — inbox access required**
- **Password Update**: 🚨 **BLOCKED — inbox access required**
- **Login After Reset**: 🚨 **BLOCKED — inbox access required**
- **Google OAuth Callback Canonical Domain**: 🚨 **BLOCKED — Google account interaction required** (Client initiates request and correctly builds the target callback parameter `redirect_to=https://app.sourcetrack.ai/auth/callback` in the Google accounts landing page URL, but E2E login completion requires manual Google account interaction).
- **Final URL Domain**: 🚨 **BLOCKED — Google account interaction required**
- **Console/Network Findings**:
  - `/login`, `/signup`, `/reset-password` load assets and React DOM correctly with zero console/network/CORS errors when hit via the canonical domain.
  - Clicking "Continue with Google" redirects to Google's sign-in gateway with the correct callback redirect parameter pointing back to canonical `app.sourcetrack.ai/auth/callback` (no IP overrides or TLS-bypass methods used).
- **Final Verdict**: 🚨 **BLOCKED**
