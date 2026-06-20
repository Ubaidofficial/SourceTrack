# Session 140Z-G3-D18H-D: Support Preview Read-Only Leaks QA

## Summary
Applied strictly enforced `!isPreview` guards to remaining mutation and setup controls in `Settings.jsx` and `Integrations.jsx` to ensure Support Preview is completely read-only at the UI level. Also verified that the `sourcetrack_admin_preview` token is automatically cleared upon navigation to the `/ops` console.

## Verification Checklist

1. **`/settings`**
   - [x] Site Settings (Save Changes) hidden or replaced with muted label.
   - [x] Public Dashboard toggle hidden.
   - [x] Cookieless Tracking toggle hidden.
   - [x] Proxy Settings (Set Domain, Check CNAME, Remove) hidden.
   - [x] Attribution Window Save hidden.
   - [x] Timezone / Site Settings Save hidden.
   - [x] Custom URL Parameters Add/Remove hidden.
   - [x] Cross-Domain Tracking Save hidden.
   - [x] Data Retention Save hidden.
   - [x] Account Deletion, API keys, and Visitor data erasure were previously confirmed hidden.

2. **`/integrations`**
   - [x] Over-reporting detection `Upgrade` button hidden.
   - [x] Email Campaign Attribution `Setup` button hidden.
   - [x] Google Search Console `Connect · Upgrade` button hidden.

3. **Ops Console Transition**
   - [x] Verified `sourcetrack_admin_preview` is cleared via `AdminRoute.jsx` upon navigating to `/ops`.

## Validation Outputs

- `npm run qa:static`: PASS
- `npm run qa:env-safety`: PASS
- `npm run qa:secrets`: PASS
- No uncommitted or untracked changes remain outside of the expected `dashboard/src/pages/Integrations.jsx`, `dashboard/src/pages/Settings.jsx`, and this QA document.

## Final Status
**PARTIAL PASS** — Local implementation and static tests have passed. Final visual approval requires screenshot review on deployed production after CI/deploy.

**Paid beta remains NOT READY.**
**D18H-D production retest remains PENDING.**
