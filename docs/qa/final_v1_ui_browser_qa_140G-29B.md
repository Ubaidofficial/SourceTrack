# QA Report — Session 140G-29B — Deployed Staging Browser QA Re-test & Navigation Correction

## 1. Executive Verdict
*   **Overall Verdict:** 🟡 **PARTIAL — campaigns crash fix verified on staging; new navigation layout implemented but requires fresh browser QA validation.**
*   **Paid Beta Status:** 🔴 **NOT READY** (core payment portal, Stripe test E2E subscriptions, and production SMTP reset config remain unverified or pending staging/production credentials)
*   **Aesthetics & Usability Verdict:** 🟡 **PARTIAL — local corrected navigation builds successfully; staging browser re-test required after deploy.**

---

## 2. Environment & Browser Configuration
*   **Browser Used:** Google Chrome (via DevTools MCP automation)
*   **App URL:** `https://sourcetrack-dashboard-staging.up.railway.app`
*   **Auth State:** Logged in as `staging-test@sourcetrack.ai`
*   **Active Staging Site:** `staging-test.sourcetrack.ai` (Site Key: `29db6ab0-0e3a-4ef4-a155-7d8640c5cbbc`)
*   **Date Range:** Last 30 days (default)
*   **Telemetry Status:**
    *   **Test Data Exists:** Yes (Overview attributes 14 conversions and `$1,271.46` revenue)
    *   **PostHog Event Data:** None resolved (Leads page displays `0 visitors` from `/api/leads`, representing an honest empty state)
    *   **Cost Integration:** None (No Google/Meta/CSV cost imports)
    *   **GSC Connected:** No
    *   **AI Referral Data:** None detected

---

## 3. Git Commit Under Test
```text
87e18bb Session 140G-29 — Fix campaigns crash and add analytics-first nav
```
*   **Working Tree Status**: Adjusted sidebar navigation to 8-item layout, restored `/dashboard` homepage, updated page titles, and added backward compatibility redirects.

---

## 4. Route-by-Route QA Table

| Route | Expected Behavior | Actual Behavior | Status | Console Errors | Network Errors | Notes |
|---|---|---|---|---|---|---|
| `/dashboard` | Loads the Dashboard page directly. Overall summary, KPIs, and card summaries shown. | Loaded dashboard stats successfully (prior to nav restructure). | **PASS** | None | None | Homepage restored. |
| `/analytics` | Loads premium lightweight site analytics page (Overview, Realtime, Pages, Audience, Technology tabs). | Loaded Dashboard tab view in the previous deploy (now updated to Analytics.jsx). | ⏳ **PENDING RE-TEST** | None | None | Requires staging deployment. |
| `/attribution` | Loads Attribution page. AI Source Performance table included. | Loaded successfully, rendering model table. | **PASS** | None | None | AI Sources card added. |
| `/leads` | Loads Leads page. Leads list and qualification options shown. | PASS — page loads with honest empty state. | **PASS** | None | None | Journeys are now integrated here. |
| Journey slide-over | Clicking a lead opens Journey slide-over panel. | BLOCKED — not verified because staging has no lead rows to click. | **BLOCKED** | None | None | Pending real visitor ingestion. |
| `/campaigns` | Renders marketing campaigns table. No ReferenceError or blank-page crash. | Loaded campaign overview successfully: `direct` channel with 2 conversions and `$125` revenue. | **PASS** | None | None | **FIX VERIFIED.** Crash is resolved. |
| `/journeys` | Backward compatibility: redirects to `/leads`. | Redirects to `/leads` (local logic, needs post-deploy test). | ⏳ **PENDING RE-TEST** | None | None | Removed from sidebar. |
| `/ai-sources` | Backward compatibility: redirects to `/attribution`. | Redirects to `/attribution` (local logic, needs post-deploy test). | ⏳ **PENDING RE-TEST** | None | None | Removed from sidebar. |

---

## 5. Verification Details & Evidence
*   **Campaigns Route Crash Resolution**: Verified. The `ReferenceError: hasRevenue is not defined` crash is resolved on staging.
*   **Sidebar Navigation Order**: Restructured to 8 items in the following order:
    1. Dashboard (`/dashboard`)
    2. Analytics (`/analytics`)
    3. Attribution (`/attribution`)
    4. All Leads (`/leads`)
    5. Campaigns (`/campaigns`)
    6. Report Builder (`/report-builder`)
    7. Integrations (`/app/integrations`)
    8. Settings (`/settings`)
*   **Journeys Integration**: Removed from top-level sidebar. Accessed directly via click interaction on leads in `/leads`. Journey slide-over panel status is BLOCKED (not verified because staging has no lead rows to click).
*   **AI Sources Integration**: Removed from top-level sidebar. Rendered as a section inside Dashboard (Overview) only if data exists, and always inside Attribution page.

---

## 6. Screenshots Captured (Prior Deployed Build)
*   Landing Login state: [staging_dashboard_v1.png](file:///Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/staging_dashboard_v1.png)
*   Analytics tab: [staging_analytics_v1.png](file:///Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/staging_analytics_v1.png)
*   Attribution tab: [staging_attribution_v1.png](file:///Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/staging_attribution_v1.png)
*   Journeys tab: [staging_journeys_v1.png](file:///Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/staging_journeys_v1.png)
*   AI Sources tab: [staging_ai_sources_v1.png](file:///Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/staging_ai_sources_v1.png)
*   Campaigns page: [staging_campaigns_v1.png](file:///Users/ubaid/.gemini/antigravity/brain/431f355a-36e3-4e90-b927-be98eea57937/staging_campaigns_v1.png)
