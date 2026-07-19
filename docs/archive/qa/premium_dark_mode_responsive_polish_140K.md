# Local Browser QA Report — Session 140K — Premium Dark Mode Foundation + Responsive Polish QA

## 1. Executive Verdict
*   **Overall Verdict:** 🟢 **PASS** (Unified premium dark mode design tokens configured in tailwind.config.js and index.css; Layout shell sidebar active states adjusted to soft, premium dark-hover/lime styling; DashboardCard and MetricTile surfaces standard-aligned; DashboardTable header contrast bug resolved; CustomSelect dropdowns styled; JourneyModal drawer and ConversionExplanationModal styled; xl:flex-row responsive polish applied to Report Builder to stack cleanly on tablet landscape 1024px; verified zero horizontal layout overflow at 1440, 1024, 768, and 390; static validation and builds passed; paid beta remains NOT READY).
*   **Aesthetics & Accessibility:** 🟢 **PASS** — Standardized page (`#0F1212`), card (`#161919`), hover/subtle (`#1D2121`), and border (`#242929`) color variables. Hardcoded bright/clashing dark colors were eliminated, and active navigation items use a non-neon green, premium dark-hover background.
*   **Paid Beta Status:** 🔴 **NOT READY** (PostHog event purging, billing portal integrations, production SMTP verification, and end-to-end stripe checkout webhooks remain pending staging/production configuration).

---

## 2. Environment & Browser Configuration
*   **QA Level:** 🖥️ **Local Browser QA** (not staging QA)
*   **Theme State:** 🌙 **Dark Mode Active**
*   **Browser Used:** Google Chrome (via DevTools MCP automation)
*   **Tested Local URL:** `http://localhost:5173/` (and subpages)
*   **API Target:** Local API Server (`http://localhost:3000`)
*   **Data Verification Strategy:** 🧪 **Mocked Local Browser Requests** (Due to sandbox constraints, browser requests were served from local mocks).
*   **Auth State:** Logged in as `test-local@sourcetrack.ai`
*   **Active Site:** `test-local.sourcetrack.ai` (Site Key: `f6f4647e-c911-47b4-9300-2c72233ec9f0`, Plan: `growth`, Business Type: `saas`)

---

## 3. Dark Mode Core Elements Checklist

| Element | Component/Style File | Styling / Token Applied | Render Quality |
| :--- | :--- | :--- | :---: |
| **Page Background** | `index.css` & `tailwind.config.js` | `--bg-page: #0F1212` / `dark:bg-dark-bg` | 🟢 Excellent |
| **Card Surface** | `DashboardCard.jsx`, `MetricTile.jsx` | `dark:bg-dark-card` / `dark:border-dark-border` | 🟢 Excellent |
| **Table Headers** | `DashboardTable.jsx`, `ReportBuilder.jsx` | `dark:bg-dark-hover` / `dark:border-dark-border` | 🟢 Excellent (Resolved gray header bug) |
| **Site Switcher** | `Layout.jsx` | `dark:bg-dark-card` / `dark:border-dark-border` | 🟢 Excellent |
| **Sidebar Menu** | `Layout.jsx` | `dark:bg-dark-hover` / `dark:text-st-lime` (Active state) | 🟢 Excellent (Calmer active state) |
| **Form Inputs** | `CustomSelect`, inputs inside page files | `dark:bg-dark-card` / `dark:border-dark-border` | 🟢 Excellent |
| **Modals/Drawers** | `JourneyModal.jsx`, `ConversionExplanationModal.jsx` | `dark:bg-dark-card` / `dark:border-dark-border` | 🟢 Excellent |

---

## 4. Responsive Width Matrix & Layout Verification

The layout was verified across four different viewport widths:

| Width | Category | Column Behavior | Left Panel Visibility | Right Preview Readability |
| :--- | :--- | :--- | :--- | :--- |
| **1440px** | Desktop | Side-by-side flex | Persistent (360px) | Full canvas & Data View side-by-side |
| **1024px** | Tablet Landscape | Vertically stacked (xl: breakpoint) | Moves to top of layout | Full width layout, zero horizontal overflow |
| **768px** | Tablet Portrait | Vertically stacked | Moves to top of layout | Sidebar replaces by menu, layout fully readable |
| **390px** | Narrow Mobile | Vertically stacked | Compact top controls | Table scrollable horizontally, stack is clean |

*   **Responsive Polish at 1024px**: The `lg:flex-row` was upgraded to `xl:flex-row` in `ReportBuilder.jsx`. Previously, at 1024px landscape, the side-by-side view was cramped, leaving only ~352px for the live preview. Shifting the breakpoint to `xl:` forces vertical stacking at 1024px, ensuring full-width panels and zero horizontal scroll/layout overflow.
*   **Horizontal Scroll**: Confirmed **0px** overflow (`scrollWidth === innerWidth`) at all viewports (1440, 1024, 768, 390).

---

## 5. Visual Evidence

### Core Pages (1440px Viewport)

#### Dashboard
![Dashboard 1440px Viewport](/Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/dashboard_1440_after.png)

#### Analytics
![Analytics 1440px Viewport](/Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/analytics_1440_after.png)

#### Integrations
![Integrations 1440px Viewport](/Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/integrations_1440_after.png)

#### Settings
![Settings 1440px Viewport](/Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/settings_1440_after.png)


### Report Builder Stacking Breakpoint (Viewports Matrix)

#### Desktop: 1440px (Side-by-side View)
![Desktop 1440px Viewport](/Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/report_builder_desktop_1440_after.png)

#### Tablet Landscape: 1024px (Stacked View for Premium Polish)
![Tablet Landscape 1024px Viewport](/Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/report_builder_tablet_1024_after.png)

#### Tablet Portrait: 768px (Stacked View)
![Tablet Portrait 768px Viewport](/Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/report_builder_tablet_768_after.png)

#### Narrow Mobile: 390px (Stacked View)
![Mobile 390px Viewport](/Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/report_builder_mobile_390_after.png)

---

## 6. Console & Network Findings
*   **Console Errors**: None. Route navigation and theme changes resulted in clean console logs with no JavaScript errors or styling complaints.
*   **Network Request Statuses**:
    *   `GET /api/sites` ➜ `304` (Not Modified)
    *   `GET /api/reports/saved` ➜ `200`
    *   `GET /api/attribution` ➜ `304` / `200`
