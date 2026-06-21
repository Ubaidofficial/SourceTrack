# Session 140P-D — Tremor-Inspired Primitive Polish Audit & Roadmap

## Executive Summary & Design Vision
SourceTrack promises non-technical marketers, CMOs, and agency founders: *"Know which sources actually make you money."*
To achieve this core promise, the dashboard must be ultra-clean, fast, and visually calm, presenting data truthfulness at a glance without clutter. This audit evaluates the platform's UI primitives using Tremor, DataFast, and Piqo as visual simplicity benchmarks.

**Session 140P-D is audit/report only. No source code implementation is allowed in this session.**

### Crucial Constraints:
* **No external installations**: Absolutely no installation of `@tremor/react`, `tremor`, `shadcn/ui`, or `Radix UI` dependencies. Standardizing Tailwind utilities and native HTML structures ensures a lightweight, premium, zero-added-weight implementation.
* **No feature additions**: This is a visual/UX primitive audit. Do not suggest adding cohorts, BI canvasses, custom SQL editors, formula inputs, or visual drag-and-drop builders.
* **Paid-Beta Verdict**: **NOT READY**. Visual improvements will not resolve open operational, billing, production, privacy, support, and E2E readiness blockers.

---

## 1. Current Primitive Inventory
We identify the primary global components serving as the design system foundations for the SourceTrack dashboard:
1. `DashboardCard.jsx`: Reusable container with header, subtitle, menu button actions, and body container.
2. `MetricTile.jsx`: Key metrics visualizer supporting count-up animations, currency/percentage formatters, and comparative trend labels.
3. `DashboardTable.jsx`: Structured data table containing configurable column builders, empty states, and custom row renderers.
4. `EmptyState.jsx`: Centered placeholder showing a Lucide icon, description, and action button.
5. `SourceIcon.jsx` & `SourceChip.jsx` (Centralized in 140P-C): Unified normalization layer translating referrer/UTM values to brand logos and styles.
6. `FilterBar.jsx`: Date selector buttons and tabular CSV export trigger.
7. `SetupDoctorCard.jsx`: Setup diagnostic helper displaying domain health, reachability checks, and install scripts.
8. `StatusBadge.jsx`: Lightweight badge mapping states (`success`, `warning`, `error`, `neutral`, `active`) to color-contrast styles.

---

## 2. Repeated UI Patterns & Inconsistencies
We audited where custom, non-standard styling has leaked across the pages, bypassing our primary primitives:
* **Metrics Inconsistency**:
  - `Analytics.jsx` defines a local `KPITile` with `text-[11px]` label and `text-xl` values.
  - `MetricTile.jsx` (global primitive) uses `text-xs uppercase tracking-wide` and `text-2xl` values.
  This duplicates metrics logic, creates visual variance, and divides maintenance overhead.
* **Custom Raw Tables**:
  - `Leads.jsx` (Line 243)
  - `ReportBuilder.jsx` (Line 2220)
  - `Campaigns.jsx` (Lines 754, 1244, 1298, 1396, 1435)
  None of these pages utilize `DashboardTable.jsx`. Instead, they render raw HTML tables with disparate header text configurations (some uppercase tracking-wider, others font-medium text-xs), different body cell paddings, and unique border-line variables.
* **Dynamic Usage and Progress Bars**:
  - `Analytics.jsx` defines a local `DataRow` containing an inline `h-1.5 bg-gray-100 rounded-full` progress bar.
  - `Billing.jsx` (Line 241) defines a local usage bar `h-2 bg-gray-100 dark:bg-gray-800 rounded-full`.
  These progress bars serve the same visual purpose but use different heights, rounded values, and background track color patterns.
* **Card Wrappers**:
  - Available plans grid in `Billing.jsx` and steps panels in `Onboarding.jsx` use custom `div` structures with manual padding, border-colors (`border-gray-150` vs standard `border-gray-200`/`dark:border-dark-border`), and backgrounds instead of referencing `DashboardCard.jsx`.
* **Action Button in EmptyState**:
  - `EmptyState.jsx` (Line 8) uses a hardcoded background styling: `bg-white dark:bg-[#1A1D1D] border border-gray-300 hover:bg-gray-50`. This bypasses standard dark-mode borders and hover highlights, making the button look flat or out of theme in dark mode.

---

## 3. Top 1% AI App Feel Checklist
To elevate SourceTrack to a premium, elite SaaS tool, the following visual benchmarks must be evaluated:
* **Enhanced dark-mode surface hierarchy**: Dark mode must avoid flat, solid-black backgrounds. Use existing dark tokens first; introduce new hex values only if token audit proves necessary.
* **Card elevation/borders/shadows**: Cards should use hairline borders (`border-gray-150` in light, `dark:border-dark-border` in dark mode) paired with extremely subtle, diffuse shadows (`shadow-sm`) instead of high-contrast solid outlines.
* **Premium icon/source-chip polish**: Source identity chips must feature clean padding, subtle border separation, and normalized, desaturated colors so they are readable without making the text look like rainbow confetti.
* **Chart/tooltips clarity**: Charts (built on Chart.js) require desaturated trend lines, light grid line contrasts (`rgba(0,0,0,0.04)` and `rgba(255,255,255,0.04)`), and custom tooltip shapes styled to match the dark-mode layout variables.
* **Empty/loading/skeleton states**: Avoid abrupt text jumps. Use soft pulsing skeletons (`animate-pulse bg-gray-100 dark:bg-[#222525]`) that mimic the shape of the elements they are loading (e.g. rounded table rows or square cards).
* **Hover/focus/active states**: All interactive items must respond instantly with subtle transitions (e.g., bg changes or ring outlines), reinforcing tactile control.
* **Spacing/radius consistency**: Standardize border radius to `rounded-xl` (12px) for cards, dialogs, and main page panels. Use `rounded-lg` (8px) for buttons and inputs, and `rounded-full` for chips and indicators.
* **Mobile density**: Scale down outer container paddings on small screens (e.g., `px-4 py-3` on mobile vs `px-6 py-5` on desktop) so that layout cards do not squish numerical figures.
* **“Clear within 5 seconds” check**: A marketer landing on any screen must immediately identify the primary metric (e.g., Total Revenue, Conversions) and the active filter state.
* **No generic template feel**: Replace standard default Tailwind borders and generic layouts with custom-styled segmented controls, clean margins, and desaturated fonts.

---

## 4. Enhanced Dark Mode Audit
Review of dark-mode styling variables and contrast rules across the platform:
* **Dashboard**: High visual fidelity. Uses `dark:bg-dark-card` and `dark:border-dark-border`. Minor issues in the onboarding alert banner (`dark:bg-amber-955/20`) which needs to remain readable against light text.
* **Analytics**: The chart gridlines and tooltips need visual desaturation in dark mode to prevent a "raw code-editor" look. `KPITile` lacks a global dark border rule.
* **`/app/attribution`** (Attribution Tab inside `Dashboard.jsx`): The static first-touch indicator has hardcoded light styles and lacks dedicated dark-mode support.
* **Report Builder**: The query selector toolbar uses nested white background grids that look harsh in dark mode. The query total row summary needs lighter borders.
* **Campaigns**: Preview batch modals use raw tables containing sticky table/header background classes such as `bg-gray-50` that clash with dark mode overlays. The cost-ingestion validation alerts require standardized desaturated amber/red blocks.
* **Leads/Journey**: Journey detail modal uses deep nested dark blocks. Focus elements in the search bar need explicit dark-outline overrides.
* **Billing**: The founding offer card uses a hardcoded lime background color. Downgrade section panels use raw border lines that look too bright against `#1A1C1C` (use existing dark tokens first; introduce new hex values only if token audit proves necessary).
* **Integrations status cards**: Integrations cards contain nested collapsible rows with hardcoded light borders (`border-gray-150`) that break the dark-mode theme lines.
* **Onboarding/Setup**: Input containers (`border-[#C9D1D1]`) and setup diagnostics alerts need desaturation to maintain premium contrast against the dark background.

---

## 5. Accessibility + Interaction QA
To guarantee professional UX and accessibility compliance, we audited the interactive primitives:
* **Keyboard focus states**: Native browser focus outlines are currently suppressed on multiple custom button implementations (such as FilterBar pills or leads table rows). Clickable elements must use visible focus rings (`focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-st-lime`).
* **Contrast risks**: Text values inside the desaturated source-chips (`normalizeSource`) must meet readable contrasts against their background colors. In dark mode, light-green or light-blue texts on low-contrast backgrounds require careful calibration.
* **Reduced motion risk**: The count-up animation helper `useCountUp` in `MetricTile.jsx` runs automatically on load. This must check the standard media query `(prefers-reduced-motion: reduce)` to disable animations for sensitive users.
* **Clickable target size**: Inline action links (e.g., "View details" in the attribution rows) have very narrow hitboxes. They should use a minimum target size of `32px` height or include padding to prevent mis-clicks.
* **Hover/active states**: Row hovers must transition smoothly (`transition-colors duration-150`) with desaturated backgrounds (`hover:bg-gray-50 dark:hover:bg-[#1C1F1F]`).
* **Mobile tap usability**: Data rows in Analytics and Leads page columns must expand cell padding on mobile to accommodate touch gestures safely.

---

## 6. Performance + Dependency Guardrails
* **Strict Package Restrictions**: Do not install `@tremor/react`, `@radix-ui/*`, `shadcn/ui`, or other UI kit helpers. We must preserve zero added weight.
* **Bundle-Size Monitoring**: The main dashboard JS bundle gzip size is verified under 500KB. However, the combined JS + CSS asset bundle is slightly above 500KB. Bundle-size monitoring remains crucial; any new CSS utility or library addition is highly restricted.
* **No Chart/Library Churn**: Retain `chart.js` and `react-chartjs-2`. Do not churn to Recharts or other visualization libraries.
* **Risk Mitigation**: No broad refactoring of the page routing, page context, or API data ingestion. Keep changes visual-only and token-based to eliminate regression risks before the paid beta launch.

---

## 7. Pre-Paid-Beta vs Post-Paid-Beta Split
To protect launch velocity, we divide the roadmap into two distinct phases:

### Pre-Paid-Beta (Surgical and Low-Risk Visual Polish):
* **MetricTile/KPITile Consistency**: Merge the inline `KPITile` component from `Analytics.jsx` into the global `MetricTile.jsx` system to enforce unified typography.
* **FilterBar Segmented-Control Polish**: Re-style `FilterBar.jsx` pills into a unified, bordered segmented button group.
* **EmptyState Dark-Mode Token Fix**: Remove hardcoded gray button backgrounds on `EmptyState.jsx` and replace with standard dark-mode responsive classes.
* **Table Token Alignment**: Apply standard Tailwind row-hover, border-line, and cell-padding utility classes to all raw tables (Leads, Campaigns, Report Builder) without rewriting the table components or behavior.
* **Progress-Bar Utility**: Unify progress bar height and colors across `Analytics.jsx` and `Billing.jsx` via shared styles.
* **Report Builder Preview/Empty-State Polish**: Standardize locked empty states and loaders to match the rest of the application.
* **No New Features**: Strictly keep the scope to layout/style polish.

### Post-Paid-Beta (Deeper Component Infrastructure):
* **Full Table Component Extraction**: Extract raw tables into a single, fully typed and configurable global `DashboardTable` component with pagination.
* **Deeper Report Builder Redesign**: Improve report customization options and templates selector styling.
* **Advanced Skeleton System**: Build a unified skeleton loader system to replace default spinners.
* **Timeline UI Redesign**: Create a vertically-tracked, premium timeline component for visitor journeys.
* **Billing/Integrations Visual Refactor**: Complete rebuild of active integrations grids and subscription catalog cards.

---

## 8. Truthfulness Guardrails
UI refinements must never display speculative, estimated, or mock data that could mislead the user:
* **No fake revenue**: Do not display mock earnings figures if GSC/Stripe integrations are disconnected.
* **No fake Cost/ROAS/CAC/CPA**: Do not show placeholder costs if ad platform syncs are inactive.
* **No fake AI confidence**: Do not render artificial confidence scores for AI platform referrals.
* **No fake exact prompt attribution**: Do not promise or mock exact prompts behind AI searches unless captured in headers/referrers.
* **No fake keyword attribution**: Do not claim or mock search console query matches for specific user paths unless verified via GSC landing-page stitching.
* **No fake integration readiness**: Label all unbuilt platforms or sync options as "Manual upload only" or "Early Bird configuration pending."

---

## 9. Implementation Session Plan
We map the follow-up sessions sequentially:
1. **Session 140P-D1**: Commit this finalized audit report only.
2. **Session 140P-D2**: Primitive token polish only. Standardize `MetricTile`/`KPITile` consistency, refine `FilterBar` buttons layout, and update `EmptyState.jsx` dark-mode tokens.
3. **Session 140P-D3**: Table visual-token alignment only. Apply consistent styling to raw tables in `Leads.jsx`, `Campaigns.jsx`, and `ReportBuilder.jsx` without modifying data handlers.
4. **Session 140P-D4**: Browser visual QA verification. Manually trace light mode, dark mode, and mobile views to capture and verify visual polish.

---

## 10. Visual QA Requirements
Any future primitive polish pull request must be visually verified in a browser across:
* **Light Mode**: Contrast checks for text and brand logos.
* **Dark Mode**: Elevation layer contrast checks.
* **Mobile Width**: Text wrap, grid layout collapse, and metrics padding tests.
* **Long Source Names**: Truncation verification on source chips inside narrow table cells.
* **Empty States**: Color variables and center alignment.
* **Loading States**: Spinners and skeleton layouts.
* **Report Builder States**: Verify locked template visuals under free plans.
* **Source-chip Contrast**: Text readability verification against gray/lime/blue backgrounds.
* **Keyboard Focus States**: Verification of focus ring outlines on interactive elements.
* **Source-Icon Visual QA**: Verify `SourceIcon`/`SourceChip` rendering across Dashboard, Analytics, Leads, Journey, and Report Builder in light/dark/mobile.
* **D4 Screenshot & Evidence**: Session 140P-D4 must include screenshots or explicit browser notes for light mode, dark mode, mobile width, Report Builder locked/free-plan state, empty states, loading states, and long source names.

---

## 11. Final Audit Grades
* **Strategy**: **A** (Maintaining custom Tailwind components prevents dependency lock-in and protects performance).
* **UX Simplicity**: **B+** (Clear at a glance, but multiple date switcher components create slight visual clutter).
* **Visual Polish**: **B-** (Typography hierarchy is strong, but raw table structures lack a unified layout line).
* **Component Consistency**: **C+** (KPITile, MetricTile, and multiple raw tables duplicate core design elements).
* **Data Truthfulness**: **A** (Clear disclaimers exist on unverified channels and estimated data console views).
* **Paid-Beta Release Status**: **NOT READY**. Overall release remains blocked by open operational, billing, production, privacy, support, and E2E readiness blockers.
* **Audit-Only Change Risk**: **Low** (No active database changes or routing changes proposed).

---

## 12. Static Launch Validation
Static validation passed; launch readiness remains blocked as expected.
