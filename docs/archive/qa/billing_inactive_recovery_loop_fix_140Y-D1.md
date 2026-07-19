# QA Report: Billing Inactive Recovery Loop Fix — 140Y-D1

**Date:** 2026-06-18
**Session/Task:** 140Y-D1
**Status:** LOCAL ONLY — deployed staging not verified yet

---

## 1. Problem Diagnosis

During testing on the deployed staging environment, the `/billing` page became stuck in an infinite reload/refresh loop. This was diagnosed as follows:
- **Active Subscription Status:** The subscription plan for the test site was set to `inactive` in the database.
- **API Response:** When loading `/billing`, the layout container initiated calls to `/api/install/doctor` and the billing page initiated a call to `/api/billing/status`. Both routes are gated by the `validateSiteKey` auth middleware. Since the plan was `inactive`, the middleware returned `402 Payment Required` with the body `{"success":false,"data":null,"error":"Subscription inactive"}`.
- **Frontend Behavior:** The global frontend fetch handler (`fetchApi` in `dashboard/src/lib/api.js`) intercepts all `402` status codes and immediately executes `window.location.href = '/billing'` to redirect the user to the billing settings page.
- **Infinite Loop:** Since the browser was already on `/billing`, executing the redirect caused the page to reload, remount the components, and refetch the same gated API endpoints, resulting in a loop.

---

## 2. Exact Fix

To resolve this issue without introducing broad auth bypasses or security risks:

### Backend Fix (`api/middleware/auth.js`)
We introduced a narrow recovery route helper:
```js
function isInactiveBillingRecoveryRoute(req) {
  const path = req.originalUrl || ''
  return (
    path.includes('/api/billing/status') ||
    path.includes('/api/billing/create-checkout') ||
    path.includes('/api/billing/portal')
  )
}
```
This helper is applied only to the `inactive` plan verification branches in both the cache read and database query blocks:
- **Cache Hit:**
  ```js
  const allowInactiveBillingRecovery = isInactiveBillingRecoveryRoute(req)
  if (cached.plan === 'inactive' && !allowInactiveBillingRecovery) {
    return res.status(402).json({ success: false, data: null, error: 'Subscription inactive' })
  }
  ```
- **Database Query:**
  ```js
  const allowInactiveBillingRecovery = isInactiveBillingRecoveryRoute(req)
  if (data.plan === 'inactive' && !allowInactiveBillingRecovery) {
    return res.status(402).json({ success: false, data: null, error: 'Subscription inactive' })
  }
  ```

### Frontend Fix (`dashboard/src/lib/api.js`)
In the global `fetchApi` handler, the redirection logic is bypassed if the browser is already visiting the `/billing` path:
```js
if (res.status === 402) {
  const alreadyOnBilling = window.location.pathname === '/billing'
  if (!options.skipBillingRedirect && !alreadyOnBilling) {
    window.location.href = '/billing'
  }
  const err = new Error('Subscription required')
  err.status = 402
  throw err
}
```

---

## 3. Security Expectations

The fix establishes and enforces the following security boundaries:
- `inactive` plan + `/api/billing/status` → **ALLOWED** (allows page recovery)
- `inactive` plan + `/api/billing/create-checkout` → **ALLOWED** (allows upgrade/reactivation checkout)
- `inactive` plan + `/api/billing/portal` → **ALLOWED** (allows Stripe Customer Portal access if customer exists)
- `inactive` plan + `/api/install/doctor` → **BLOCKED (402)**
- `inactive` plan + all tracking/analytics/leads routes → **BLOCKED (402)**
- `archived` plan + all routes (including billing status/checkout) → **BLOCKED (402)** (retains strict archiving gate)

---

## 4. Validation Output

All required test suites were executed locally:
- `node --check api/middleware/auth.js` → **PASSED**
- `npm run qa:env-safety` → **PASSED** (No secrets, credentials, or untracked env files detected)
- `npm run qa:static` → **PASSED** (Static launch QA checklist clean, frontend compilation succeeded)
- `npm run qa:identity:unit` → **PASSED** (131 tests pass)
- `npm run qa:attribution:unit` && `npm run qa:tracker:unit` → **PASSED** (217 tests pass)
- `git diff --check` → **PASSED** (No trailing whitespaces or syntax checks issues)

---

## 5. Targeted Grep Output

Checking for any lingering broad `/api/billing` bypass checks:
```bash
$ grep -RIn "includes('/api/billing')" api/middleware/auth.js dashboard/src/lib/api.js || true
# (Empty output: broad bypass logic has been completely removed)
```

---

## 6. Browser Verification Status

- **Status:** `LOCAL ONLY — deployed staging not verified yet`
- **Verification Details:** Ran a local test script simulating requests against the staging database to confirm that the four defined security states behave exactly as specified. Deployed staging verification will occur after these changes are committed, pushed, and built on Railway.

---

## 7. Remaining 140Y-D Blocker

- **Staging webhook → DB update gap:** The webhook forwarding configuration on Stripe test-mode dashboard to staging (`/api/billing/webhook`) needs to be fully closed.
- **E2E Lifecycle Verification:** Until the webhook config is synchronized, the downstream E2E transitions (DB plan updates to starter/50,000 limits, billing UI reflecting Starter subscription, and portal access) remain blocked on staging.
