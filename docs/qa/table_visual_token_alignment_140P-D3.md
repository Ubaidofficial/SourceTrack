# Session 140P-D3 — Table Visual Token Alignment QA Report

## Overview & Goal
This session implements premium, desaturated, Tremor-inspired table primitives across the dashboard pages. It unifies table header typography, softens border tokens, aligns numeric values to tabular font alignments, and polishes hover states for both light and dark modes.

**Paid-Beta Release Status: NOT READY.** Overall release remains blocked by open operational, billing, production, privacy, support, and E2E readiness blockers.

---

## 1. Files Modified
1. `dashboard/src/pages/Leads.jsx` (Polished Leads data table, event badges, and qualification status chips)
2. `dashboard/src/pages/Campaigns.jsx` (Polished Campaigns overview table, preview batch table, sync history table, landing page tables, and recent conversion tables)
3. `dashboard/src/pages/ReportBuilder.jsx` (Polished Report Builder pivot table, total summaries, comparison delta badges, and borders)

---

## 2. Before/After Intent

### Table Headers & Typography
* **Before**: Table headers used inconsistent font weights (`font-medium` or `font-normal`) and had bright backgrounds/borders (`border-gray-100` or `border-gray-200`) without proper desaturated dark-mode alignment.
* **After**: Table headers consistently use `font-semibold text-xs text-st-gray dark:text-gray-400 uppercase tracking-wider` and render over a calm, desaturated background `bg-gray-50/50 dark:bg-[#181B1B]/40` bound by a subtle border `border-gray-100 dark:border-dark-border`.

### Row Hover States & Selections
* **Before**: Row hovers used bright or harsh colors (e.g. `hover:bg-lime-50/60` and `bg-lime-50/30` in Leads) which look jarring and lacked dark-mode equivalents.
* **After**: Row hovers are upgraded to a subtle desaturated gray `hover:bg-gray-50/50 dark:hover:bg-dark-hover/40`. Selected rows use a desaturated lime background (`bg-st-lime/5 dark:bg-st-lime/10`) to highlight records premiumly without visual noise.

### Border Softness
* **Before**: Raw/harsh borders (`border-gray-100` or `border-gray-200`) separated rows and tables.
* **After**: Borders are softened to desaturated variables (`border-gray-100/70 dark:border-dark-border/40` or `divide-gray-100 dark:divide-dark-border/40`).

### Tabular Numbers Alignment
* **Before**: Conversions, revenues, clicks, impressions, CTR, and CPC numbers used standard non-tabular layout fonts, causing visual alignment jitter across rows.
* **After**: Applied `tabular-nums` class to all numeric and count fields inside tables to align values cleanly and maximize scanning legibility.

### Status & Event Type Badges
* **Before**: Conversions and Lead status badges had bright full backgrounds (`bg-green-100`, `bg-blue-100`, etc.) with no dark-mode overrides, causing high contrast in dark mode.
* **After**: Upgraded to desaturated versions with fine border lines (e.g., `bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-200/30 dark:border-green-900/30`).

---

## 3. Dark Mode Alignment
* Table backgrounds and wrappers correctly use desaturated card backing (`dark:bg-dark-card` or `bg-white/60 dark:bg-[#181B1B]/10`).
* Divider borders use `#2A2E2E` or `dark:border-dark-border/40` to avoid glowing white line glitches in dark mode.
* Slide-over details panels and modal drawers preserve dark elements safely.

---

## 4. Accessibility + Interaction
* Checkbox inputs inside Leads and Campaigns headers now use matching dark-mode borders (`dark:border-gray-700`) and elevated focus rings.
* Maintained clean mouse pointer states and hover transitions across clickable row interactions.

---

## 5. Exact Behavior Preserved
* Column metrics calculations (revenue, CTR, CPC, CPA, ROAS, Net Profit) and formatters are untouched.
* Qualification patch APIs, bulk statuses, and drawer transitions operate identically.
* CSV downloads and export actions trigger without deviation.
* Zero changes to Supabase structures, API routes, or features.

---

## 6. Remaining Visual QA Needed
* Verify table scrolling behaviors on narrow mobile widths.
* Confirm that cell text truncation is clean under extreme column counts (e.g. when multiple metrics are active in Report Builder).

---

## 7. Design Rules & Guardrails

* **SourceTrack Token Rule**: Do not copy or extract any Tremor components, and do not introduce any new UI dependencies (e.g., Tremor, Radix, shadcn). Implement only Tremor-inspired layout, alignment, and sizing patterns using existing SourceTrack styling tokens.
* **Dark-Mode Rule**: Enforce calm surfaces, desaturated backgrounds, subtle borders, and a highly readable typographic hierarchy. Do not invent custom color classes or hardcode custom hex codes outside the verified design system tokens.

---

## 8. Target-File Invalid-Token Scan Result

The target D3 files were scanned using the following command to check for invalid/non-standard spacing, color, and design tokens:
```bash
grep -RIn "gray-150\|gray-305\|gray-350\|gray-355\|gray-404\|gray-505\|gray-550\|gray-655\|gray-750\|gray-850\|red-505\|red-705\|lime-505\|py-0\.2" \
  dashboard/src/pages/Leads.jsx \
  dashboard/src/pages/Campaigns.jsx \
  dashboard/src/pages/ReportBuilder.jsx || true
```
**Scan Result**: `(Empty Output - No invalid tokens found in D3 target files)`

---

## 9. Follow-Up Cleanup Blockers (Unrelated Files)

The following invalid Tailwind classes exist in files outside of the D3 scope and should be resolved in a dedicated cleanup session:

* **Setup & Installation Snippet**:
  * `dashboard/src/pages/Setup.jsx:259`: `bg-gray-750`
  * `dashboard/src/pages/Snippet.jsx:249`: `bg-gray-750`
* **Integrations Settings**:
  * `dashboard/src/pages/Integrations.jsx:2050`: `text-gray-655`
  * `dashboard/src/pages/Integrations.jsx:2384, 2868`: `text-gray-750`
* **Settings & Preferences**:
  * `dashboard/src/pages/Settings.jsx:1286`: `text-red-505`, `hover:text-red-705`
* **Developers Reference Docs & Subpages**:
  * `dashboard/src/pages/developers/DevelopersTracker.jsx:212`: `dark:text-gray-355`
  * `dashboard/src/pages/developers/DevelopersConversions.jsx:125`: `dark:text-gray-355`
  * `dashboard/src/pages/developers/DevelopersWebhooks.jsx:175`: `dark:text-gray-355`
  * `dashboard/src/pages/developers/DevelopersIdentify.jsx:118`: `dark:text-gray-355`
* **Documentation Pages**:
  * `dashboard/src/pages/docs/DocsInstall.jsx:130`: `dark:text-gray-355`
  * `dashboard/src/pages/docs/DocsFramer.jsx:108`: `dark:text-gray-355`
  * `dashboard/src/pages/docs/DocsShopify.jsx:69, 86, 110, 152`: `dark:text-gray-355`
  * `dashboard/src/pages/docs/DocsWebflow.jsx:101`: `dark:text-gray-355`
  * `dashboard/src/pages/docs/DocsStripe.jsx:104`: `bg-gray-550/10`
  * `dashboard/src/pages/docs/DocsStripe.jsx:140`: `dark:text-gray-355`
  * `dashboard/src/pages/docs/DocsWordPress.jsx:79`: `text-gray-750`
  * `dashboard/src/pages/docs/DocsWordPress.jsx:112`: `dark:text-gray-355`
  * `dashboard/src/pages/docs/DocsGTM.jsx:119`: `dark:text-gray-355`
  * `dashboard/src/pages/docs/DocsTroubleshooting.jsx:136`: `dark:text-gray-355`
  * `dashboard/src/pages/docs/DocsGoogleAds.jsx:66, 80`: `dark:text-gray-355`
  * `dashboard/src/pages/docs/DocsQuickstart.jsx:143`: `dark:text-gray-355`
