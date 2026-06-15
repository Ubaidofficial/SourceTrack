# QA Report — Session 140G-29C — Deployed Staging Browser QA Re-test for Corrected Navigation

## 1. Executive Verdict
*   **Overall Verdict:** 🟢 **PASS for deployed navigation architecture (Journey slide-over remains blocked due to no lead rows; paid beta remains NOT READY; one minor accessibility warning remains).**
*   **Aesthetics & Usability Verdict:** 🟢 **PASS — sidebar conforms to the 8-item order; Dashboard remains the command center; Analytics and Attribution render as focused views; redirects work.**
*   **Paid Beta Status:** 🔴 **NOT READY** (core payment portal, Stripe test E2E subscriptions, and production SMTP reset config remain unverified or pending staging/production credentials)

---

## 2. Environment & Browser Configuration
*   **Browser Used:** Google Chrome (via DevTools MCP automation)
*   **Staging URL:** `https://sourcetrack-dashboard-staging.up.railway.app`
*   **Commit Tested:** `60a2c75cc8ddc8f1eda926ed8f78dab87be29290` (Session 140G-29B — Correct navigation architecture)
*   **Auth State:** Logged in as `staging-test@sourcetrack.ai`
*   **Active Staging Site:** `staging-test.sourcetrack.ai` (Site Key: `29db6ab0-0e3a-4ef4-a155-7d8640c5cbbc`)

---

## 3. Route-by-Route QA Table

| Route | Expected Behavior | Actual Behavior | Status | Console Errors | Network Errors | Notes |
|---|---|---|---|---|---|---|
| `/dashboard` | Loads Dashboard page directly. Overall summary, KPIs, and command center cards rendered. No redirect. | Loaded dashboard directly. Verified overall stats, Trend Chart, Top Sources, and setup doctor states. | **PASS** | None | None | Homepage restored as command center. Active sidebar state correct. |
| `/analytics` | Loads premium lightweight site analytics page (Overview, Realtime, Pages, Audience, Technology tabs). | Loaded Analytics page correctly. Renders tabbed navigation blocks and telemetry overview. | **PASS** | None | None | Lightweight site analytics page verified. Active sidebar state correct. |
| `/attribution` | Loads Attribution-focused view. Touchpoint model switcher and performance card rendered. | Loaded successfully, rendering model table and AI source performance cards. | **PASS** | None | None | AI Sources card embedded inside Attribution page. Active sidebar state correct. |
| `/leads` | Loads Leads page. Leads list and qualification options shown. | Loaded All Leads list with honest empty state. | **PASS** | None | None | Journeys live here. Active sidebar state correct. |
| Journey slide-over | Clicking a lead opens Journey slide-over panel. | Not verified because staging has no lead rows to click. | 🚫 **BLOCKED** | None | None | Pending real visitor ingestion. |
| `/campaigns` | Renders marketing campaigns table. No ReferenceError or blank-page crash. | Loaded campaign overview successfully with populated stats. No white-screen crash. | **PASS** | None | None | **FIX VERIFIED.** Campaigns page is stable. Active sidebar state correct. |
| `/report-builder` | Loads Report Builder page. Pre-made business templates list and custom parameters selector are displayed. | Loaded successfully. Renders report templates grid and mock dashboard builder blocks. | **PASS** | None (minor accessibility warnings only) | None | Sidebar highlight active. Correct active navigation state. |
| `/app/integrations` | Loads Integrations page. Stripe, Shopify, Google Ads, GSC cards, and webhooks options are shown. | Loaded successfully. Renders setup panels, key input forms, and sync history lists. | **PASS** | None | None | Sidebar highlight active. Correct active navigation state. |
| `/settings` | Loads Settings page. Account options, privacy deletion utility, and API keys are rendered. | Loaded successfully. Renders danger zone copy, data purge triggers, and project profiles. | **PASS** | None (minor accessibility warnings only) | None | Sidebar highlight active. Correct active navigation state. |
| `/journeys` | Backward compatibility: redirects to `/leads`. | Redirected to `/leads` instantly. | **PASS** | None | None | Removed from top-level sidebar. |
| `/ai-sources` | Backward compatibility: redirects to `/attribution`. | Redirected to `/attribution` instantly. | **PASS** | None | None | Removed from top-level sidebar. |

---

## 4. Console & Network Findings

### 4.1 Console Findings
*   **Console Status:** No route-breaking JavaScript runtime exceptions, React component mounting failures, or route errors.
*   **Remaining Issues:** Minor accessibility warnings are present in console (`No label associated with a form field`, `A form field element should have an id or name attribute`).

### 4.2 Network Findings
*   **API/Request Status:** All requests returned `200` or `304`.
*   **Verified API Endpoints:**
    *   `GET /api/dashboard/overview` -> `200/304`
    *   `GET /api/dashboard/recent-activity` -> `200/304`
    *   `GET /api/install/doctor` -> `200/304`
    *   `GET /api/reports/saved` -> `200/304`
    *   `GET /api/integrations/overview` -> `200/304`
    *   `GET /api/webhooks` -> `200/304`

---

## 5. Sidebar Verification
*   **Order Enforced:** Verified exactly 8 sidebar items:
    1.  **Dashboard** (`/dashboard`)
    2.  **Analytics** (`/analytics`)
    3.  **Attribution** (`/attribution`)
    4.  **All Leads** (`/leads`)
    5.  **Campaigns** (`/campaigns`)
    6.  **Report Builder** (`/report-builder`)
    7.  **Integrations** (`/app/integrations`)
    8.  **Settings** (`/settings`)
*   **Top-Level Exclusions:** Confirmed that **Journeys** and **AI Sources** are completely removed from the sidebar.

---

## 6. Visual Evidence & Screenshots
Staging screenshots captured in this session (local Antigravity-only evidence files, not repo-portable artifacts):
*   Staging Dashboard homepage: `staging_dashboard_v2.png`
*   Staging Analytics page: `staging_analytics_v2.png`
*   Staging Attribution page: `staging_attribution_v2.png`
*   Staging All Leads page: `staging_leads_v2.png`
*   Staging Campaigns page: `staging_campaigns_v2.png`
*   Staging Settings page: `staging_settings_v2.png`
*   Staging Report Builder page: `staging_report_builder_v2.png`
*   Staging Integrations page: `staging_integrations_v2.png`
