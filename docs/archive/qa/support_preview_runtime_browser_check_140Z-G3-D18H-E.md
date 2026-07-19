# QA Report: Support Preview Runtime Mismatch (D18H-E)

## The Bug: Why the Banner Showed but Controls Were Visible
During browser testing on production, the Support Preview banner was visible, yet mutation controls in `Settings.jsx` and `Integrations.jsx` were still rendered.

This occurred due to a React state mismatch caused by client-side navigation:
1. When entering preview from the Ops console, `Admin.jsx` set `sessionStorage` and pushed a soft client-side route (`navigate('/dashboard?preview=...')`).
2. Because it was a soft route change, the root `SiteProvider` did not unmount or re-execute its `loadSites` initialization. `activeSite` remained the operator's actual site (or null).
3. `Layout.jsx` evaluated `isSupportPreviewActive()` (which reads `sessionStorage` directly on every render) and correctly showed the banner.
4. However, deeply mounted components like `Settings` and `Integrations` relied on the stale `activeSite` to fetch data, and evaluating `isSupportPreviewActive()` within those components caused hydration mismatches or stale closures across the app state tree, leading to the mutation controls remaining active for the operator's actual site.

## The Fix: Single Canonical Source of Truth
1. **Hard Reload on Entry/Exit**: Changed `navigate` to `window.location.href` in `Admin.jsx` (entry) and `SupportModeBanner.jsx` (exit). This forces a clean app reload, ensuring `SiteContext` boots up and initializes `activeSite.support_preview = true` reliably.
2. **Unified React State**: Replaced `isSupportPreviewActive()` with `activeSite?.support_preview || false` across all UI components (`Settings.jsx`, `Integrations.jsx`, `Campaigns.jsx`, `ReportBuilder.jsx`, `Analytics.jsx`, `Setup.jsx`, and `Layout.jsx`).
3. **Strict Binding**: `activeSite.support_preview` is now the sole canonical source of truth for all components inside the application shell, guaranteeing that if the preview site data is loaded, the mutation guards are 100% active.

## Verification
- Code successfully builds and all static QA checks pass (`npm run qa:static`).
- Support Preview UI gates are now definitively bound to the exact same React state (`activeSite`) as the data being rendered.

## Status
**PARTIAL PASS / LOCAL ONLY**
Status must remain PARTIAL PASS / LOCAL ONLY until deployed production screenshots prove it. Do not mark paid beta ready.
