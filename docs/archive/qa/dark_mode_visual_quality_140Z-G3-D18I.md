# Dark Mode Visual Quality QA Report (140Z-G3-D18I)

## 1. Routes Inspected
- `/ops` (Ops Console / Admin dashboard)
- `/dashboard` (Support Preview / Overview)
- `/settings` (Settings / Configuration)
- Layout navigation (Sidebar and top banner)

## 2. Screens/Areas Reviewed
- Support Preview Top Banner (`SupportModeBanner.jsx`)
- Support Preview Sidebar Card (`Layout.jsx`)
- Ops Console Tabs, Tables, and Metrics (`Admin.jsx`)
- Settings Form Inputs, Disabled States, and Snippet Display (`Settings.jsx`)

## 3. Visual Issues Found
1. **AI-Slop & Muddy Colors**: The Ops console used hardcoded dark mode hex colors (`#1A1D1D`, `#252929`, `#CCF03F`) that clashed with the standard premium `dark-card` and `dark-border` theme tokens, causing a "muddy gray borders" and "random card surfaces" feel.
2. **Warning Spam**: The Support Preview banner and sidebar card used a harsh amber warning style that felt like error spam rather than a calm, trustworthy preview mode.
3. **Blocked Form Wall**: In Settings, form actions (buttons) were disabled during preview mode, but the inputs themselves were visually enabled, creating confusion.
4. **Leaky Site Key**: The settings snippet renderer printed the real `site_key` (or `undefined`/`YOUR_SITE_KEY`) even in support preview mode, rather than hiding it.

## 4. Exact Files Changed
- `dashboard/src/components/SupportModeBanner.jsx`
- `dashboard/src/components/Layout.jsx`
- `dashboard/src/pages/Admin.jsx`
- `dashboard/src/pages/Settings.jsx`

## 5. Before/After Notes
- **SupportModeBanner**: Before: Harsh amber background with warning style. After: Premium slate look with subtle emerald accents that feels trustworthy and intentional.
- **Preview Site Card (Layout)**: Before: Amber warning card. After: Slate card with subtle emerald accents to match the top banner.
- **Settings Form States**: Before: Inputs appeared enabled but buttons were disabled. After: All inputs properly use `disabled:opacity-60 disabled:cursor-not-allowed dark:disabled:bg-gray-800/50` for clear, non-frustrating disabled states.
- **Settings Snippet**: Before: Rendered `site?.site_key || 'YOUR_SITE_KEY'`. After: explicitly renders `HIDDEN_IN_PREVIEW` when in support preview mode.
- **Ops Console (Admin.jsx)**: Before: Tables and cards had hardcoded `#1A1D1D` borders and mismatched hovers. After: Standardized to `dark:bg-dark-card`, `dark:border-dark-border`, and `dark:hover:bg-dark-hover`, ensuring a calm, consistent surface scale.

## 6. What Was Intentionally Not Changed
- No product scope or logic changes.
- No new features, dashboards, or metrics.
- Did not restructure the navigation.
- Did not add animation-heavy polish.
- Retained the core logic of `Settings.jsx` forms, merely disabling the inputs instead of hiding them (to preserve the read-only audit capability).

## 7. Support-Preview Behavior Preservation Notes
- The `isSupportPreviewActive()` condition remains the single source of truth for disabling forms.
- Exit Preview behavior remains intact and uses the exact same `sessionStorage` removal logic.
- Sensitive values like `site_key` are now visually hidden (`HIDDEN_IN_PREVIEW`) in the snippet box without breaking the underlying context.

## 8. Validation Output
- `git diff --check`: Clean.
- `npm run qa:static`: PASS — All backend files syntax passed, frontend build succeeded, no whitespace violations, no forbidden copy/API greps.
- `auth-smoke`: PASS — All frontend routes and API health check passed (`app.sourcetrack.ai` and `api.srctk.com`).

## 9. Git Status
```
 M dashboard/src/components/Layout.jsx
 M dashboard/src/components/SupportModeBanner.jsx
 M dashboard/src/pages/Admin.jsx
 M dashboard/src/pages/Settings.jsx
```

## 10. Final Verdict
**PARTIAL PASS**. Targeted dark-mode polish was applied and validation passed, but final visual approval requires screenshot review on deployed production after CI/deploy.

## 11. Paid Beta Status
Paid beta remains **NOT READY**.

## 12. D18H-B Production Retest Status
D18H-B production retest remains **PENDING** as it was not performed in this session.
