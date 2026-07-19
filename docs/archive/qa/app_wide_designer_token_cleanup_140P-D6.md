# Session 140P-D6 QA Report — App-Wide Designer Token Cleanup

**Final Verdict:** `PENDING BROWSER VERIFICATION`
**Paid-Beta Status:** `NOT READY` (requires browser verification of the overall layout/color fixes on staging first)

---

## Changed Files

A total of 31 files were modified as part of the token cleanup process:
1. `dashboard/src/components/MetricTile.jsx`
2. `dashboard/src/components/SetupDoctorCard.jsx`
3. `dashboard/src/components/StatusBadge.jsx`
4. `dashboard/src/components/docs/DocsSidebar.jsx`
5. `dashboard/src/pages/Billing.jsx`
6. `dashboard/src/pages/Dashboard.jsx`
7. `dashboard/src/pages/Integrations.jsx`
8. `dashboard/src/pages/Leads.jsx`
9. `dashboard/src/pages/ReportBuilder.jsx`
10. `dashboard/src/pages/Settings.jsx`
11. `dashboard/src/pages/Setup.jsx`
12. `dashboard/src/pages/Snippet.jsx`
13. `dashboard/src/pages/developers/DevelopersApi.jsx`
14. `dashboard/src/pages/developers/DevelopersCampaignCosts.jsx`
15. `dashboard/src/pages/developers/DevelopersConversions.jsx`
16. `dashboard/src/pages/developers/DevelopersHome.jsx`
17. `dashboard/src/pages/developers/DevelopersIdentify.jsx`
18. `dashboard/src/pages/developers/DevelopersOfflineConversions.jsx`
19. `dashboard/src/pages/developers/DevelopersTracker.jsx`
20. `dashboard/src/pages/developers/DevelopersWebhooks.jsx`
21. `dashboard/src/pages/docs/DocsFramer.jsx`
22. `dashboard/src/pages/docs/DocsGTM.jsx`
23. `dashboard/src/pages/docs/DocsGoogleAds.jsx`
24. `dashboard/src/pages/docs/DocsHome.jsx`
25. `dashboard/src/pages/docs/DocsInstall.jsx`
26. `dashboard/src/pages/docs/DocsQuickstart.jsx`
27. `dashboard/src/pages/docs/DocsShopify.jsx`
28. `dashboard/src/pages/docs/DocsStripe.jsx`
29. `dashboard/src/pages/docs/DocsTroubleshooting.jsx`
30. `dashboard/src/pages/docs/DocsWebflow.jsx`
31. `dashboard/src/pages/docs/DocsWordPress.jsx`

---

## Exact Class Replacement Categories

1. **Borders:**
   - Invalid `border-gray-150` replaced with standard `border-gray-200`.
   - Invalid `border-gray-250` replaced with standard `border-gray-200`.
   - Invalid `dark:border-gray-850` and `dark:border-gray-855` replaced with standard `dark:border-gray-800`.
   - Invalid disconnect button borders (`border-red-205` / `border-red-250`) replaced with standard `border-red-200`.
2. **Backgrounds & Hovers:**
   - Invalid `bg-gray-150` / `bg-gray-250` replaced with standard `bg-gray-200`.
   - Invalid `hover:bg-gray-150` replaced with standard `hover:bg-gray-200`.
   - Invalid `hover:bg-gray-750` replaced with standard `hover:bg-gray-700`.
   - Invalid `dark:bg-gray-850` replaced with standard `dark:bg-gray-800`.
   - Invalid `dark:bg-amber-955/10` and `dark:bg-amber-955/15` replaced with standard `dark:bg-amber-900/10` and `dark:bg-amber-900/15` respectively.
   - Invalid warning container background `bg-gray-550/10` replaced with standard `bg-gray-100`.
   - Invalid `hover:bg-red-55` replaced with standard `hover:bg-red-50`.
   - Invalid `dark:hover:bg-red-955/20` replaced with standard `dark:hover:bg-red-900/20`.
3. **Typography & Icons Contrast:**
   - Invalid `dark:text-amber-450` replaced with standard `dark:text-amber-400`.
   - Invalid `text-amber-850` / `text-amber-655` / `text-amber-650` replaced with standard `text-amber-800` / `text-amber-600`.
   - Invalid `text-gray-850` / `text-gray-855` replaced with standard `text-gray-800`.
   - Invalid `dark:text-gray-250` replaced with standard `dark:text-gray-300`.
   - Invalid `text-gray-650` / `text-gray-655` replaced with standard `text-gray-600`.
   - Invalid `dark:text-gray-405` replaced with standard `dark:text-gray-400`.
   - Invalid `text-gray-750` replaced with standard `text-gray-700`.
   - Invalid `dark:text-gray-350` / `dark:text-gray-355` replaced with standard `dark:text-gray-300`.
   - Invalid warnings/highlights contrast `dark:text-blue-305/85` and `dark:text-amber-305/85` replaced with `dark:text-blue-400/85` and `dark:text-amber-400/85`.
   - Invalid `dark:text-blue-450` replaced with standard `dark:text-blue-400`.
   - Invalid badge colors: `text-red-750` -> `text-red-700`, `text-blue-755` -> `text-blue-700`, `dark:text-red-350` -> `dark:text-red-400`.
   - Invalid hover actions: `hover:text-red-650` / `text-red-655` / `text-red-650` -> `hover:text-red-600` / `text-red-600`, and `lime-650` -> `lime-600`.

---

## Invalid Token Audit Results

### Before Cleanup
Running the token check grep filters produced multiple matches across `SetupDoctorCard.jsx`, `Snippet.jsx`, `Settings.jsx`, `Integrations.jsx`, `Billing.jsx`, and all the `developers/` and `docs/` references containing invalid color shade suffixes (`-150`, `-250`, `-350`, `-450`, `-550`, `-650`, `-750`, `-850` etc.).

### After Cleanup
Running the expanded, broader audit grep checks:
```bash
git grep -En "\-(red|green|blue|orange|lime|gray|slate|zinc|neutral|stone|amber|purple|violet|fuchsia|pink|rose|emerald|teal|cyan|sky)-([0-9]{2}|[0-9]{3})" dashboard/src || true
grep -RIn "gray-150\|gray-305\|gray-350\|gray-355\|gray-404\|gray-505\|gray-550\|gray-655\|gray-750\|gray-850\|red-505\|red-705\|lime-505\|py-0\.2" dashboard/src --exclude-dir=node_modules || true
grep -RIn "bg-\[#d7f550\]\|hover:bg-\[#c4df45\]" dashboard/src --exclude-dir=node_modules || true
```
**Result:** `0` matches for any invalid custom color shades.
**Manual Shade Confirmation:** We grouped and verified all parsed shades for every Tailwind color category across `dashboard/src`. Only valid standard Tailwind shades (`50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950`) remain in the codebase.

---

## Logic / DOM / Route Confirmation

We explicitly confirm that:
- **No DOM restructuring** has been performed.
- **No layout redesign** was introduced.
- **No behavioral changes** were made.
- **No route/auth/API/billing/tracking changes** were touched.
- **No new dependencies** were added (no Tremor or shadcn copy-pasted or installed).

This is strictly a styling token cleanup matching Tailwind standard constraints.

---

## Build and Static QA Verification Output

### Whitespace & Styling Checks
- `git diff --check`: Clean (no trailing whitespace violations).

### Build Compilation
- Vite production build output (`npm run build` inside `dashboard/`):
```text
✅ Frontend build succeeded.
```

### Static Pipeline Regression Checks
- `npm run qa:static`:
```text
✅ All backend files syntax passed.
✅ Frontend build succeeded.
✅ No whitespace violations.
✅ Forbidden copy/API grep checks passed (no forbidden strings in user-facing code).
✅ Route mount checks passed.
✅ Security & plan scoping checks passed.
PASS — static launch QA passed
```
