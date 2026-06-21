# Session 140P-D2 — Primitive Token Polish QA Report

## Overview & Goal
This session polish improves existing app primitives to make them feel more premium, Tremor-inspired, and visually desaturated in dark mode, without introducing new layout components, database logic, or dependencies.

**Overall Paid-Beta release status remains NOT READY.** Overall release remains blocked by open operational, billing, production, privacy, support, and E2E readiness blockers.

---

## 1. Files Changed
1. `dashboard/src/components/MetricTile.jsx` (Refactored global metrics primitive)
2. `dashboard/src/pages/Analytics.jsx` (Replaced local `KPITile` references with compact global `MetricTile`)
3. `dashboard/src/components/FilterBar.jsx` (Upgraded loose tag-pills date selector to unified segmented control)
4. `dashboard/src/components/EmptyState.jsx` (Replaced hardcoded action button bg/border classes with desaturated theme variables)

---

## 2. Before/After Intent

### MetricTile (Global) & KPITile (Analytics)
* **Before**: We had duplicate components (`KPITile` inside Analytics vs `MetricTile` globally). Metric trends were rendered as raw text, and padding was fixed to `p-5`. No prefers-reduced-motion check existed.
* **After**: Local `KPITile` is fully deleted. `MetricTile` is updated to support a `compact` prop (pads at `px-4 py-3` with `text-xl` font sizing) and a `delta` prop, satisfying both use cases. Trend indicators are now rendered inside desaturated green/red/gray pill borders, matching modern Tremor styles.

### FilterBar
* **Before**: Loose circular pills with bright `bg-st-lime/15` color for active elements, scattered across the header.
* **After**: Unified segmented control enclosed in a single gray wrapper (`bg-gray-100 dark:bg-[#181B1B]`) with a thin border. Active element slides cleanly with a white/dark-elevated background and a subtle shadow, desaturating the layout.

### EmptyState
* **Before**: The action button used hardcoded colors `dark:bg-[#1A1D1D] border-gray-300`, breaking theme alignment in dark mode.
* **After**: Button uses desaturated standard tokens `dark:bg-dark-card border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover`.

---

## 3. Dark Mode Changes
* Card borders desaturated from `border-gray-100` to standard `border-gray-150` (light) and `dark:border-dark-border`.
* Segmented control uses elevated dark backing `#181B1B` with the active button highlighted in `#252929` (rather than bright green overlays).
* Action buttons inside `EmptyState` correctly blend into `dark:bg-dark-card` and `dark:border-dark-border` with desaturated text.

---

## 4. Accessibility + Interaction Changes
* **Keyboard Focus States**: Added explicit visible focus indicators (`focus-visible:ring-1 focus-visible:ring-st-lime focus-visible:outline-none`) on `FilterBar` tabs and `EmptyState` action buttons.
* **Reduced Motion**: Added a media query listener inside `useCountUp` to check `(prefers-reduced-motion: reduce)`. If true, animations are immediately bypassed, rendering target numbers directly without layout shifts.
* **Desaturated Contrast**: Desaturated icon text in `EmptyState` (`dark:text-gray-600` instead of `#fff` elements) for desaturated viewing comfort.

---

## 5. Exact Behavior Preserved
* CSV Export trigger and callbacks inside `FilterBar` remain untouched.
* Metrics formatting (`currency`, `percent`, `number`, `text`) operates identically.
* Animation durations (`650ms`) and easing equations are fully preserved for normal motion paths.
* Zero changes to active database structures, API routes, or features.

---

## 6. Remaining Visual QA Needed
* Check source-icon rendering across Dashboard, Analytics, Leads, Journey, and Report Builder in light/dark/mobile views.
* Verify layout dimensions and text-wrapping of MetricTiles under extreme mobile screens (e.g. 320px).
* Verify GSC keyword and conversion lock screens inside Report Builder under free plans.

---

## 7. Static Launch Validation
Static validation passed; launch readiness remains blocked as expected.
