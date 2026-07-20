# Figma Token Implementation Plan (Session 83.2)

Generated from Session 83.1 repo audit against `FIGMA_DESIGN_SYSTEM.md`.  
Do not implement until Session 83.2 is explicitly started.

## Audit Summary

| Area | Current State | Figma Target | Gap |
|---|---|---|---|
| Font | Tailwind default system fonts | Switzer (Regular/Medium/SemiBold/Bold) | Missing |
| Colors | Tailwind defaults + scattered inline hex | `#1F2323`, `#7D8090`, `#CCF03F`, `#00AA57`, `#FF8800`, `#E54545` | Missing |
| Spacing | Default Tailwind (0.25rem = 1 unit) | 4px soft grid (4/8/12/16/20/24/32/40/48/72/96/124/160) | Partially compatible |
| Grid | Responsive Tailwind grids (2/3/5 cols) | 1320px max-width, 12-col (88px col, 24px gutter) | Missing |
| DashboardCard | ✅ Exists, used throughout | Close match | Color tokens only |
| StatusBadge | ✅ 9 variants, used | Close match | Color tokens only |
| MetricTile | ✅ Used for KPI row | Close match | Color tokens only |
| OnboardingCard | ⚠️ Has inline styles (#6F7070, fontWeight:600) | Figma card style | Needs cleanup |
| OnboardingProgress | ⚠️ Hardcoded #D7F550 | Figma lime #CCF03F | Color fix |
| DashboardTable | ❌ Raw <table> in pages | Figma table with gray headers, sort icons | New component |
| FilterBar | ❌ Not present | Date buttons + source/model/more filters | New component |
| EmptyState | ❌ Not consistent | Consistent no-data pattern | New component |
| Sidebar active | `bg-gray-100` | Lime background (Figma) | Color fix |
| Top bar | Page title only | Search, notifications, theme toggle, date buttons, Export | Missing |

## Phase 1: Font Decision

**Task:** Determine Switzer availability.

- Check if Switzer is already in `node_modules` or imported anywhere.
- If available/licensed: add `@font-face` or Google Fonts import to `index.css`, configure Tailwind `fontFamily`.
- If NOT available: use Inter as fallback (closest free alternative to Switzer). Document decision in `FIGMA_DESIGN_SYSTEM.md`.

**Files:**
- `dashboard/src/index.css`
- `dashboard/tailwind.config.js`

## Phase 2: Color Token Mapping

**Task:** Map Figma hex values to Tailwind `theme.extend.colors`.

Add to `tailwind.config.js`:
```js
theme: {
  extend: {
    colors: {
      st: {
        black: '#1F2323',
        gray: '#7D8090',
        lime: '#CCF03F',
        green: '#00AA57',
        orange: '#FF8800',
        red: '#E54545',
      }
    }
  }
}
```

Then audit existing code for color replacements (do NOT do this in 83.2 — just add tokens):
- `OnboardingProgress`: `#D7F550` → `st.lime`
- `OnboardingCard`: `#6F7070` → `st.gray`
- `Layout.jsx` sidebar active: `bg-gray-100` → `bg-st-lime/15 text-st-black`
- `StatusBadge`: `verified` style → `bg-st-lime/15 text-st-black border-st-lime/30`

**Files:**
- `dashboard/tailwind.config.js` (add tokens only)
- Do NOT restyle pages yet (that's Session 84)

## Phase 3: Grid & Spacing

**Task:** Add 1320px max-width wrapper and document 12-column grid utility.

Add to `index.css` or a new layout utility:
```css
.st-container {
  max-width: 1320px;
  margin: 0 auto;
  padding: 0 24px;
}
```

Document in `FIGMA_DESIGN_SYSTEM.md` that:
- 12-col grid: use Tailwind `grid-cols-12 gap-6` (24px = gap-6)
- Column width: 88px (handled by grid auto)
- 4px spacing: Tailwind's default 1=0.25rem=4px is compatible

**Files:**
- `dashboard/src/index.css`

## Phase 4: New Shared Components

### 4.1 DashboardTable

Props: `{ columns, rows, onRowClick, sortable, emptyMessage }`

Structure:
```jsx
<div className="overflow-x-auto">
  <table className="w-full text-sm">
    <thead>
      <tr className="border-b border-gray-100 bg-gray-50">
        {columns.map(col => (
          <th className="text-left py-2 px-4 text-gray-500 font-medium text-xs">
            {col.label}
            {sortable && <SortIcon />}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {rows.length === 0 ? (
        <tr><td colSpan={columns.length} className="py-8 text-center text-sm text-gray-400">{emptyMessage || 'No data'}</td></tr>
      ) : rows.map(...)}
    </tbody>
  </table>
</div>
```

**File:** `dashboard/src/components/DashboardTable.jsx` (new)

### 4.2 FilterBar

Props: `{ dateButtons, onDateChange, filters, onFilterChange, onExport }`

Structure: Horizontal bar with date pill buttons (24h/7d/30d), optional source/model dropdowns, Export button.

```jsx
<div className="flex items-center gap-3 flex-wrap">
  {dateButtons.map(d => (
    <button className={`px-3 py-1 text-xs rounded-full ${active ? 'bg-st-lime/15 text-st-black' : 'bg-gray-100 text-gray-600'}`}>
      {d.label}
    </button>
  ))}
  {/* filter dropdowns */}
  <button><Download /> Export</button>
</div>
```

**File:** `dashboard/src/components/FilterBar.jsx` (new)

### 4.3 EmptyState

Props: `{ icon, title, description, action }`

Structure:
```jsx
<div className="flex flex-col items-center justify-center py-12 text-center">
  {icon && <Icon className="w-10 h-10 text-gray-300 mb-4" />}
  <p className="text-gray-500 font-medium">{title}</p>
  {description && <p className="text-sm text-gray-400 mt-1">{description}</p>}
  {action && <button className="mt-4 ...">{action.label}</button>}
</div>
```

**File:** `dashboard/src/components/EmptyState.jsx` (new)

## Phase 5: Visual Test Page

**Task:** Create `/design-system` route showing all primitives.

Create `dashboard/src/pages/DesignSystem.jsx`:
- Section: Color tokens (swatches with hex labels)
- Section: Typography (all type scale levels)
- Section: Components (DashboardCard, DashboardTable, FilterBar, MetricTile, StatusBadge, EmptyState, OnboardingCard, OnboardingProgress)
- Section: Grid demo (12-column layout)

Add route in `dashboard/src/App.jsx` (development-only, no sidebar):
```jsx
<Route path="/design-system" element={<DesignSystem />} />
```

**Files:**
- `dashboard/src/pages/DesignSystem.jsx` (new)
- `dashboard/src/App.jsx` (add route)

## Explicitly Out of Scope for 83.2

- ❌ Restyling Dashboard.jsx (Session 84)
- ❌ Restyling ReportBuilder.jsx (Session 86)
- ❌ Restyling Layout.jsx sidebar/topbar (Session 84)
- ❌ Restyling Onboarding.jsx (Session 85)
- ❌ Business dashboard logic
- ❌ Any backend changes

## Implementation Order

1. Font decision + import (index.css)
2. Color tokens (tailwind.config.js)
3. Grid wrapper (index.css)
4. New components: DashboardTable, FilterBar, EmptyState
5. Visual test page at /design-system
6. `npm run build` + `node --check` verification
