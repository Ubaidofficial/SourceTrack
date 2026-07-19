# App UI/UX + Analytics + Component System Audit (140P)

**Date:** 2026-06-21
**Status:** COMPLETE (Audit-only, no code changes applied)
**Applies to:** SourceTrack / TrackIQ Frontend Dashboard and API Integration

---

## 1. Routes & Pages Inspected

*   **`/analytics`** (`Analytics.jsx`): User traffic overview, live visitors, visitor trend line, pages, countries, browsers, operating systems, entry/exit pages, and AI referrers.
*   **`/dashboard`** (`Dashboard.jsx`): Main command center overview. Houses the primary KPI metrics (revenue vs. lead growth based on business type), performance trends, top sources, and recent conversion events.
*   **`/attribution`** (`Dashboard.jsx` with tab switcher & `Attribution.jsx` marketing page): Protected app route that shares `Dashboard.jsx` to render the "Attribution" tab, colliding with the public marketing route `/attribution` declaring `Attribution.jsx`.
*   **`/leads` & `/leads/:leadId`** (`Leads.jsx` & `LeadDetail.jsx`): Interactive lists of captured conversions and specific lead detail timelines.
*   **`/journey`** (`Journey.jsx`): Standalone timeline representation of a single visitor's touchpoints.
*   **`/campaigns`** (`Campaigns.jsx`): Ingestion panel for offline ad cost CSV uploads and campaigns tracking status.
*   **`/report-builder`** (`ReportBuilder.jsx` via `ReportBuilderGate.jsx`): Custom multi-step report query builder.
*   **`/app/integrations`** (`Integrations.jsx`): Integration hub featuring copy-paste script tags, Shopify webhook config, Stripe sync credentials, and active logs.
*   **`/settings`** (`Settings.jsx`): General workspace configurations (conversion attributes, timezone, paths, sharing permissions).
*   **`/billing`** (`Billing.jsx`): Pricing tiers, active limits, pageview usage telemetry, and Stripe upgrade buttons.
*   **`/onboarding`** (`Onboarding.jsx`): 6-step account provisioning flow (connect domain, select business type, select install method, inspect code script, customize conversions, test verification).
*   **`/setup`** (`Setup.jsx`): Detailed developer code installation and diagnostic checker.
*   **`/debugger`** (`EventDebugger.jsx`): Live event collection and metadata diagnostic stream.
*   **`/ops`** (`Admin.jsx`): Super admin control panel.

---

## 2. Components & Files Inspected

*   `dashboard/src/components/Layout.jsx`: Main sidebar shell, active site switcher, and setup diagnostic badge.
*   `dashboard/src/components/SourceIcon.jsx`: Reusable icons (`SourceIcon`) and badges (`SourceChip`) for UTM parameters, referrals, and AI platforms.
*   `dashboard/src/components/MetricTile.jsx`: Animated numerical metric boxes (`useCountUp` hook).
*   `dashboard/src/components/DashboardCard.jsx`: Standard card wrapper.
*   `dashboard/src/components/DashboardTable.jsx`: General table wrapper with empty states.
*   `dashboard/src/components/EmptyState.jsx`: Muted empty state helper.
*   `dashboard/src/components/SetupDoctorCard.jsx`: Technical setup debugger.
*   `dashboard/src/components/JourneyModal.jsx`: Modal popup showing single journey details.
*   `dashboard/src/index.css`: Global base layers and light/dark theme variables.
*   `dashboard/tailwind.config.js`: Tailwind tokens (Switzer/Inter fonts, `st-*` palette colors, dark mode config).
*   `dashboard/package.json`: Main web package dependencies.

---

## 3. Current Style & Component Stack

1.  **Tailwind CSS (v3)**: Fully integrated and configured. Colors are customized in `tailwind.config.js` under the `st` namespace:
    *   Lime: `#CCF03F` (e.g. `text-st-lime`, `bg-st-lime`)
    *   Dark Lime: `#C5E838` (softer contrast for dark mode)
    *   Black: `#1F2323` (base text/dark accent)
    *   Gray: `#7D8090` (base secondary text)
    *   Green: `#00A457` (positive indicators)
    *   Orange: `#FF8800` (warnings/alert indicators)
    *   Red: `#E54545` (negative indicators)
2.  **No Pre-packaged UI System**: No Component System (like Radix UI, Headless UI, or shadcn/ui) is installed. Modals, cards, and tables are custom-coded wrappers using Tailwind utility classes.
3.  **Iconography**: Powered by `lucide-react`.
4.  **Charts**: Powered by `chart.js` and `react-chartjs-2` wrappers.
5.  **Date Selectors**: Simple button selectors (24h, 7d, 30d) and standard native HTML inputs (`type="date"`). No calendar picker libraries are installed.

---

## 4. Tailwind/Shadcn Compatibility Verdict

> [!IMPORTANT]
> **Verdict: Full shadcn/ui adoption is NOT recommended.**
> The current system has enough lightweight primitives (`DashboardCard`, `MetricTile`, `DashboardTable`, `EmptyState`, `SourceChip`) to operate efficiently. Migrating to shadcn/ui would create massive dependency churn, design pollution (conflicting CSS variables), and visual inconsistency.
>
> **Safer Alternative: Clean up existing custom primitives.**
> Refactor the existing primitives in `src/components` to expose standardized Tailwind API surfaces (via `tailwind-merge` and `clsx` which are already in `package.json`) rather than importing Radix-based external design structures.

---

## 5. Page-by-Page UX Verdicts

### 5.1 Analytics Page (`/analytics`)
*   **Verdict:** **PARTIAL PASS (Theme Defect)**
*   **The Good:** The page is focused on visitor behavior analytics (no revenue cards, no conversion lists).
*   **The Bad:**
    *   **Dark-Mode Hardcoding:** The widgets in `Analytics.jsx` hardcode dark background colors (`bg-[#1A1D1D]` and `border-[#2A2E2E]`) instead of using Tailwind's theme system. When toggling light mode, the page stays black and clashes with the sidebar.
    *   **Component Drift:** It does not use `SourceChip` for referrer names, rendering small manual `SourceIcon` instances alongside raw text instead of standard badges.

### 5.2 Dashboard Overview (`/dashboard`)
*   **Verdict:** **PASS WITH ISSUES**
*   **The Good:** Automatically aligns metrics based on business type (e.g. Total Leads for Lead Gen vs. Revenue for E-commerce). It preserves the "3 KPI limit" for focus.
*   **The Bad:**
    *   Recent Conversions list is useful, but the "View Journey" button duplicates functionality in `Leads` and Standalone `/journey`.
    *   Pinned reports widgets display at the bottom but can show empty states on plans that do not support widgets (Free plan), leading to clutter.

### 5.3 Attribution Views (`/attribution` vs. marketing `/attribution`)
*   **Verdict:** **CRITICAL ROUTE COLLISION**
*   **The Bad:**
    *   `App.jsx` declares `/attribution` twice: first as a protected app tab and second as a public marketing page.
    *   The protected route matches first, meaning public guests attempting to visit the marketing page `/attribution` are forced to `/login`. The public marketing page is completely unreachable in production.
    *   Attribution view is just the overview tab of `Dashboard.jsx` under `activeTab === 'attribution'`. It is locked to First-Touch attribution, with no interactive model switcher (only a text card labeling "First-touch attribution" is displayed).

### 5.4 Leads & Journey Details (`/leads`, `LeadDetail.jsx`, `Journey.jsx`)
*   **Verdict:** **PASS WITH MINOR DRIFT**
*   **The Good:** Badge colors for conversion types are visually pleasing (e.g. `lead` -> amber, `purchase` -> green). Journey timelines are readable.
*   **The Bad:**
    *   `JourneyModal.jsx` and `Journey.jsx` (standalone page) duplicate the rendering logic of visitor touchpoint streams. Standalone `/journey` is unlinked in the main navigation.

### 5.5 Campaigns (`/campaigns`)
*   **Verdict:** **PASS (Functional Utility)**
*   **The Good:** High functional utility. Handles cost CSV uploads and tracking validation cleanly.
*   **The Bad:**
    *   Visually dense. The page features heavy data-table columns and CSV error displays that feel slightly intimidating for non-technical founders.

### 5.6 Report Builder (`/report-builder`)
*   **Verdict:** **PASS (Complex by Design)**
*   **The Good:** Visual multi-step configuration wizard.
*   **The Bad:**
    *   Layout density is high. Custom native date inputs can look slightly unaligned compared to the custom UI buttons.

### 5.7 Integrations (`/app/integrations`)
*   **Verdict:** **CLUTTERED**
*   **The Good:** Contains detailed, step-by-step documentation for all integration methods. Ingestion logs are excellent for self-serve troubleshooting.
*   **The Bad:**
    *   **Massive File Size:** At 2957 lines, this file embeds the entire copy documentation for GTM, Shopify, WordPress, Framer, and webhooks inline. It should be refactored into modular sub-components or docs assets.

### 5.8 Settings, Billing, & Onboarding
*   **Verdict:** **PASS (Standard Behavior)**
*   *   **Onboarding:** The 6-step flow is clean, but the domain matching validation checks can flash step 1 briefly before hydration.
*   *   **Billing:** Checkout buttons map correctly to price IDs. Usage trackers use clean, real count queries against pageviews.
*   *   **Setup Doctor:** Exposes clear metrics (Domain match, tracker seen, conversion detected) to give users confidence in their install.

---

## 6. Source Icons and Visual Source Identity

### 6.1 Current Implementation Verdict
There is a **major design disparity** between the public marketing pages and the active user dashboard shell:
*   `dashboard/src/lib/brandLogos.jsx` contains beautiful, custom SVG brand marks for major ad platforms, e-commerce stores, and AI engines (Meta, Google, TikTok, LinkedIn, Microsoft, Shopify, WooCommerce, OpenAI, Claude/Anthropic, Perplexity, Gemini, Grok, Copilot, DeepSeek).
*   However, `dashboard/src/components/SourceIcon.jsx` (which powers the active dashboard, reports, leads list, and event debugger) **completely ignores these SVG brand marks**.
*   Instead, `SourceIcon.jsx` falls back to generic Lucide shapes: all social media channels (Facebook, Instagram, LinkedIn, TikTok, Twitter, Reddit) use a generic Lucide `Globe` icon with different colored text classes. Similarly, AI tools are mapped to generic Lucide `Sparkles` icons with varying text colors.
*   This makes the main app look generic and less premium compared to competitors like Cometly or Piqo, which utilize recognizable brand marks for high scannability.

### 6.2 Source Coverage Matrix

| Source / Channel | Icon Exists in App Shell (`SourceIcon.jsx`) | Reusable SVG exists in `brandLogos.jsx` | Label / Normalization | Background Color Accessible (Light / Dark) | Consistency Across Pages |
| :--- | :---: | :---: | :--- | :--- | :--- |
| **Google** | ⚠️ Generic `Search` icon | ✅ `GoogleLogo` | Clean ("google") | Yes (gray or green-50) | Inconsistent (used manually in Analytics) |
| **Google Ads** | ⚠️ Generic `Megaphone` | ✅ `GoogleLogo` | Clean ("google ads") | Yes (sky-50 / sky-950) | Consistent |
| **Google Organic** | ⚠️ Generic `Search` | ✅ `GoogleLogo` | Clean ("google organic") | Yes (green-50 / green-950) | Consistent |
| **Search / SEO** | ⚠️ Generic `Search` | ✅ `OrganicSearchIcon` | Clean ("organic") | Yes (green-50 / green-950) | Consistent |
| **Bing** | ⚠️ Generic `Search` | ❌ Only `MicrosoftLogo` | Clean ("bing") | Yes (gray fallback) | Consistent |
| **Bing Ads** | ❌ None (fallback megaphone) | ❌ Only `MicrosoftLogo` | Clean ("bing ads") | Yes (gray fallback) | Consistent |
| **Meta / Facebook / Instagram** | ⚠️ Generic `Globe` | ✅ `MetaLogo` | Clean ("meta" / "facebook") | ❌ No distinct color (gray chip fallback) | Consistent |
| **LinkedIn** | ⚠️ Generic `Globe` | ✅ `LinkedInLogo` | Clean ("linkedin") | ❌ No distinct color (gray chip fallback) | Consistent |
| **X / Twitter** | ⚠️ Generic `Globe` | ✅ `XLogo` | Clean ("twitter" / "x.com") | ❌ No distinct color (gray chip fallback) | Consistent |
| **Reddit** | ⚠️ Generic `Globe` | ❌ None | Clean ("reddit") | ❌ No distinct color (gray chip fallback) | Consistent |
| **YouTube** | ⚠️ Generic `Video` | ❌ None | Clean ("youtube") | ❌ No distinct color (gray chip fallback) | Consistent |
| **TikTok** | ⚠️ Generic `Globe` | ✅ `TikTokLogo` | Clean ("tiktok") | ❌ No distinct color (gray chip fallback) | Consistent |
| **Email** | ✅ Generic `Mail` | ✅ `EmailIcon` | Clean ("email") | Yes (yellow-50 / yellow-950) | Consistent |
| **SMS** | ❌ None (fallback Globe) | ❌ None | Clean ("sms") | Yes (gray fallback) | Consistent |
| **Direct** | ✅ Generic `MousePointer` | ✅ `DirectIcon` | Clean ("direct") | Yes (gray fallback) | Consistent |
| **Referral** | ⚠️ Generic `Globe` | ✅ `ReferralIcon` | Clean ("referral") | Yes (gray fallback) | Consistent |
| **Newsletter** | ✅ Generic `Mail` | ✅ `EmailIcon` | Clean ("newsletter") | Yes (yellow-50 / yellow-950) | Consistent |
| **ChatGPT** | ⚠️ Generic `Sparkles` | ✅ `OpenAILogo` | Clean ("chatgpt") | Yes (emerald-50 / emerald-950) | Consistent |
| **Perplexity** | ⚠️ Generic `Sparkles` | ✅ `PerplexityLogo` | Clean ("perplexity") | Yes (purple-50 / purple-950) | Consistent |
| **Claude** | ⚠️ Generic `Sparkles` | ✅ `AnthropicLogo` | Clean ("claude") | Yes (orange-50 / orange-950) | Consistent |
| **Gemini** | ⚠️ Generic `Sparkles` | ✅ `GeminiLogo` | Clean ("gemini") | Yes (blue-50 / blue-950) | Consistent |
| **Copilot / Bing Chat** | ❌ None (fallback Sparkles) | ✅ `CopilotLogo` | Clean ("copilot") | Yes (gray fallback) | Consistent |
| **Grok** | ❌ None (fallback Sparkles) | ✅ `GrokLogo` | Clean ("grok") | Yes (gray fallback) | Consistent |
| **Unknown / Other** | ✅ Generic `Globe` | ❌ None | Clean ("unknown") | Yes (gray fallback) | Consistent |

### 6.3 Missing Source Mappings & Inconsistent Rendering
1.  **Dormant AI Engines:** Grok and Copilot are fully omitted from `SourceIcon.jsx` mapping lists. If they appear in traffic, they fall back to the generic gray `Globe` instead of matching AI categories.
2.  **Duplicate/Inconsistent Rendering:** `Analytics.jsx` manually queries and renders `SourceIcon` (without chip backgrounds), bypassing `SourceChip` entirely. This leads to visual drift: visitors see colored icons next to plain text in Analytics, but nice colored pills in Dashboard and Leads.
3.  **Missing Brand colors:** Popular social channels (Facebook, LinkedIn, Twitter, TikTok, Reddit) do not have custom background or border colors in `SourceChip`, rendering them as dull gray badges that do not aid visual scanning.

### 6.4 Light/Dark Mode Issues
*   The generic Lucide icons define colors (e.g. `text-pink-600 dark:text-pink-400` or `text-emerald-600 dark:text-emerald-400`) which scale nicely across light/dark backgrounds.
*   However, because background chips use hardcoded tailwind colors (e.g., `bg-emerald-50 border-emerald-100` for OpenAI/ChatGPT in light mode, and `dark:bg-emerald-950/20 dark:border-emerald-900/30` in dark mode), these mappings must be tested for contrast accessibility.
*   The fallback class `bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-900/30 dark:border-gray-800 dark:text-gray-300` is clean and accessible.

### 6.5 Recommended Reusable Source Mapping
1.  Import the custom SVGs from `dashboard/src/lib/brandLogos.jsx` into `dashboard/src/components/SourceIcon.jsx`.
2.  Wire the `SourceIcon` return values to utilize these specific logos for branded referrers instead of falling back to the Lucide `Globe` or generic `Sparkles`.
3.  Expand `SourceChip` background mappings in `SourceIcon.jsx` to declare brand-specific badge styling:
    *   **Facebook / Instagram / Meta:** Pink/blue theme (`bg-pink-50 dark:bg-pink-950/20 border-pink-100 dark:border-pink-900/30 text-pink-700 dark:text-pink-400`)
    *   **LinkedIn:** Corporate blue theme (`bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/30 text-indigo-700 dark:text-indigo-400`)
    *   **Twitter / X / TikTok:** Minimalist dark theme (`bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-900/30 text-gray-800 dark:text-gray-200`)
    *   **Reddit:** Reddit orange theme (`bg-orange-50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/30 text-orange-700 dark:text-orange-400`)
    *   **Grok / Copilot / DeepSeek:** Dedicated AI themes matching their specific brand colors.

---

## 7. Theme, Mobile, and Responsive Audit

### 7.1 Dark Mode
*   **Verdict: Inconsistent implementation.**
*   While `Layout.jsx`, `MetricTile.jsx`, and `DashboardCard.jsx` use proper tailwind utility variables (`dark:bg-dark-card`, `dark:border-dark-border`), `Analytics.jsx` is hardcoded as dark `#1A1D1D`. If a user toggles to light mode, `Analytics.jsx` remains pitch black.

### 7.2 Mobile & Responsive Behavior
*   **Verdict: Good.**
*   *   The sidebar collapses into a drawer toggled by a hamburger menu.
*   *   Data grids wrap properly from 3-column rows to single columns on small viewports.
*   *   Tables are wrapped in horizontal scroll classes (`overflow-x-auto`) to prevent layout breaking.

---

## 8. Data Truthfulness Risks

1.  **GSC Revenue Estimates:** Google Search Console queries are matched by landing page and date range. The dashboard clearly states "Query revenue is estimated." This is a healthy truth gate.
2.  **AI Referrer Limits:** Explicitly documented in `KNOWN_ISSUES.md`. Referrers can be stripped by browser or AI clients. The app does not overclaim 100% universal accuracy.
3.  **Dormant AI Forecasts:** The forecasting and anomaly features inside `AIAnalytics.jsx` are not linked in the main sidebar. This is safe, since raw predictive models can often be wrong and mislead users.

---

## 9. Strategy & Simplicity Risks

1.  **Duplicate Routes:** Having `/attribution` serve both marketing copy and protected dashboard tab views is a major routing bug that blocks access to public marketing copy.
2.  **Duplicate Visitor Journey Views:** The modal implementation (`JourneyModal.jsx`) and standalone page (`Journey.jsx`) query different endpoints and render identical data in slightly different styles. Standalone `/journey` is unlinked in the sidebar.
3.  **Drift in Source Chips:** `Analytics.jsx` renders raw referrers with manual `SourceIcon` nodes, whereas `Dashboard.jsx`, `Leads.jsx`, and `LeadDetail.jsx` use `SourceChip` badges.
4.  **Integrations File Weight:** A 2900-line React component is a maintenance hazard and slows compile times.

---

## 10. Final Performance Grades

*   **Strategy:** **A-** (Attribution positioning is clear, lightweight focus is maintained, no complex SQL/cohort UI bloat).
*   **UX Simplicity:** **B+** (Clear user flows, but cluttered integrations page and duplicate journey views).
*   **Visual Polish:** **B** (Good looking dark mode, but ruined by hardcoded dark colors on Analytics page when in light mode).
*   **Analytics Clarity:** **A-** (Clean traffic analysis without fake revenue variables).
*   **Attribution Fit:** **B** (Solid first-touch details, but `/attribution` route collision and lack of a live model switcher reduces utility).
*   **Component Consistency:** **B-** (Drafting `SourceChip` in some components but manually building icon nodes in others; `FeatureLock` goes unused).
*   **Data Truthfulness:** **A** (Clear disclosures on GSC estimations, AI referrers, and disabled empty metrics on free tier).
*   **Paid-Beta Readiness:** **B-** (Blocked primarily by the `/attribution` route collision and dark mode theme defects).

---

## 11. Action Plan: Safe Pre-Paid-Beta Fixes

Below are recommended **surgical fixes** that can be implemented without adding post-paid-beta scope or redesigning:

### 1. Resolve `/attribution` Route Collision
*   **Change App Path:** Move the protected attribution view in `App.jsx` from `/attribution` to `/app/attribution` or `/dashboard?tab=attribution` (and update the Layout sidebar link).
*   **Unlock Marketing Page:** This immediately frees up the `/attribution` path to serve the public `Attribution.jsx` marketing page to anonymous guests without forcing them to log in.

### 2. Fix `Analytics.jsx` Dark Mode Defect
*   **Theme Integration:** Replace hardcoded `#1A1D1D` background and `#2A2E2E` border classes in `Analytics.jsx` with standard Tailwind theme classes:
    *   Cards: `bg-[#1A1D1D] border-[#2A2E2E]` -> `bg-white dark:bg-dark-card border-gray-200 dark:border-dark-border`
    *   Metric Tiles: `bg-[#1A1D1D] border-[#2A2E2E]` -> `bg-white dark:bg-dark-card border-gray-200 dark:border-dark-border`
    *   Text inputs/buttons: Align colors to Tailwind dark variables.

### 3. Standardize Source Badges & Mappings
*   **Import brand SVGs:** Refactor `SourceIcon.jsx` to load and render the high-quality SVG marks defined in `brandLogos.jsx` instead of falling back to generic `Globe` and `Sparkles`.
*   **Color coding:** Expand `SourceChip` background classes to support Meta, LinkedIn, Twitter, Reddit, and additional AI engines (Grok, Copilot, DeepSeek).
*   **Refactor `Analytics.jsx`:** Replace manual `SourceIcon` + raw text nodes with the `SourceChip` badge component in `Analytics.jsx` tables for Referrers and AI Traffic to maintain design parity.

### 4. Deprecate Standalone `/journey` Route
*   **Verify and deprecate standalone `/journey` before removal:** Standalone `/journey` is unlinked and duplicates `JourneyModal`, but do not delete it until docs, tests, direct links, and support workflows are checked. If unused, redirect safely to `/leads` or the relevant lead detail flow.


### 5. De-clutter Integrations Page
*   **Code Separation:** Extract the large text setup instructions (Shopify, WordPress, Framer, GTM guides) from `Integrations.jsx` into separate static markdown files or modular sub-components to reduce file size.

---

## 12. Do-Not-Build List (Pre-Paid-Beta)

To protect the core promise of simplicity and avoid scope creep, the following items must **not** be built:

*   **No custom drag-and-drop dashboard builders** (stick to the seeded templates based on business type).
*   **No real-time click maps or heatmaps**.
*   **No custom cohort creation panels**.
*   **No raw SQL or formula input boxes for reports**.
*   **No enterprise role-based permissions interfaces**.
