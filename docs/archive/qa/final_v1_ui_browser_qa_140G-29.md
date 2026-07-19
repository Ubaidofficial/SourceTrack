# final_v1_ui_browser_qa_140G-29.md

## 1. Executive Verdict
*   **Overall Verdict:** 🔴 **FAIL — deployed staging /campaigns route crashed; local fix prepared and static-validated; deploy + browser re-test required.**
*   **Paid Beta Status:** 🔴 **NOT READY**
*   **Aesthetics & Usability Verdict:** 🟢 **PASS** (Where functional, the sidebar navigation, dashboard tabs, clean empty states, and theme toggling present a premium, unified V1 appearance)

---

## 2. Environment & Browser Configuration
*   **Browser Used:** Google Chrome Canary (via DevTools MCP automation)
*   **App URL:** `https://sourcetrack-dashboard-staging.up.railway.app`
*   **Auth State:** Logged in as `staging-test@sourcetrack.ai`
*   **Active Staging Site:** `staging-test.sourcetrack.ai` (Site Key: `29db6ab0-0e3a-4ef4-a155-7d8640c5cbbc`)
*   **Date Range:** Last 30 days (default)
*   **Telemetry Status:**
    *   **Test Data Exists:** Yes (Conversions = 14, Revenue = `$1,271.46` in database/overview)
    *   **PostHog Event Data:** None resolved (Leads page displays `0 visitors` from `/api/leads`)
    *   **Cost Integration:** None configured (No Google/Meta sync or CSV cost import)
    *   **GSC Connected:** No
    *   **AI Referral Data:** None detected

---

## 3. Git Commit Under Test
```text
60a286e Session 140G-28 — Implement final V1 UI first pass
```
*   **Working Tree Status:** Modifying files to fix campaigns crash and update navigation structure.

---

## 4. Route-by-Route QA Table

| Route / Tab | Expected Behavior | Actual Behavior | Status | Severity | Console Errors | Network Errors | Recommended Fix |
|---|---|---|---|---|---|---|---|
| **Global Shell** | Exact 9 sidebar items shown in order; no deprecated groups or bells/bubbles. Theme toggle and site switcher work cleanly. | Correct 9 items rendered in sidebar. Site switcher renders single site key card. Theme toggle switches successfully. | **PASS** | — | None | None | — |
| **/analytics** | Lightweight site telemetry and traffic overview (default landing tab). | Overview loads correctly. | **PASS** | — | None | None | — |
| `/analytics` (Overview tab) | Max 3 KPIs; respects real revenue; setup diagnostics visible. | Correctly displays real revenue (`$1,271.46`), 14 conversions, and `WRONG DOMAIN` diagnostic warning. | **PASS** | — | None | None | — |
| **/attribution** | Switches without crash; model selector and source table load; respects cost gates. | Switches successfully. Combobox offers 9 models. Correctly hides cost columns. | **PASS** | — | None | None | — |
| **/journeys** | Conversion feed loads or displays honest empty state; no fake metrics. | Displays chronological feed header and honest empty state: "No data". | **PASS** | — | None | None | — |
| **/ai-sources** | AI channel breakdown table or honest empty state. | Displays correct template empty state text. | **PASS** | — | None | None | — |
| **/leads** | Leads list loads; qualifications dropdown restricted; bulk bar triggers on selection. | Page loads and displays honest empty state ("No leads yet") and "Revenue tracking not connected" banner. | **PASS** | — | None | None | — |
| `└─ Journey Slide-Over` | Opens slide-over from row click; details show; status updates work. | No rows available to click. | **BLOCKED** | Low | None | None | Run a manual tracking conversion to test slide-over. |
| **/campaigns** | Loads read-only campaign table; status badges and costs respect gates. | Page is completely blank on deployed staging. | 🔴 **FAIL** | **BLOCKER** | `ReferenceError: hasRevenue is not defined` | None | Declare `hasRevenue` and `hasCost` in `Campaigns.jsx` (local fix prepared). |
| `└─ Campaign Slide-Over` | Opens on row click; displays campaign details. | Cannot click row due to route crash. | 🔴 **BLOCKED** | **BLOCKER** | Same as above | None | Fixed by campaigns route repair. |
| **/report-builder** | Route loads; no regression; templates configure and save cleanly. | Loads correctly. Templates and options render. | **PASS** (Smoke) | — | None | None | — |
| **/app/integrations**| Valid V1 integration cards render; no Zapier/Salesforce cards. | Loads cleanly. Active cards (Snippet, Stripe, Shopify, GSC, Proxy, Dev options) render. | **PASS** (Smoke) | — | None | None | — |
| **/settings** | Access to snippet; danger zones display correct disclaimer alerts. | Loads cleanly. Erase Visitor Data and Danger Zone show exact V1.1 disclaimers. | **PASS** (Smoke) | — | None | None | — |

---

## 5. Critical Regression Breakdown

### `/campaigns` ReferenceError (White Screen of Death)
*   **Exact Route:** `/campaigns`
*   **User Action:** Clicked "Campaigns" in the sidebar navigation or navigated directly.
*   **Expected Behavior:** Renders the campaign performance table.
*   **Actual Behavior:** Entire page crashes to a blank screen.
*   **Console Error:**
    ```text
    ReferenceError: hasRevenue is not defined
        at Campaigns (Campaigns.jsx:653:49)
    ```
*   **Root Cause:** The V1 UI Refresh introduced plan and data-gate conditions (`hasRevenue` and `hasCost`) into the JSX return blocks of `Campaigns.jsx` but failed to declare these variables within the component scope.
*   **Severity:** **BLOCKER** (Completely blocks campaigns list verification on deployed staging).
*   **Applied Local Fix:** Declared `hasRevenue` and `hasCost` right after fetching overview KPIs in `dashboard/src/pages/Campaigns.jsx`:
    ```javascript
    const kpis = overview?.kpis
    const rows = overview?.rows || []
    const hasRevenue = (kpis?.total_revenue || 0) > 0
    const hasCost = (kpis?.total_spend || 0) > 0
    ```

---

## 6. Data Truth Gates Verification
*   **Revenue Gate:** Verified. Overview displays actual revenue (`$1,271.46`), while the empty Leads page displays the "Revenue tracking not connected" banner and hides event values instead of using fake `$0.00` placeholders.
*   **Cost Gate:** Verified. The Overview, Attribution, Journeys, and AI tabs correctly omit ad spend, CPC, CPA, ROAS, and CAC metrics since no cost records exist.
*   **GSC Gate:** Verified. GSC cards and SEO revenue estimates remain hidden or marked as "Not Connected".
*   **AI Gate:** Verified. AI empty states and contexts use honest disclaimers with no fake confidence or accuracy markers.

---

## 7. Navigation Refresh (Analytics-First Plan)
The product direction was updated to elevate Analytics to a first-class sidebar item before Attribution. The following routes are now configured to resolve to the unified `Dashboard` page with location-driven tab switching:
*   `/analytics` -> `overview` tab
*   `/attribution` -> `attribution` tab
*   `/journeys` -> `journeys` tab
*   `/ai-sources` -> `ai_sources` tab
*   `/dashboard` -> Legacy route, performs client-side redirect to `/analytics`

---

## 8. Blockers & Recommended Fixes
1.  **Blocker: `/campaigns` UI Crash on Staging**
    *   *Fix:* Build and deploy the local fix to `dashboard/src/pages/Campaigns.jsx` to resolve the `hasRevenue` ReferenceError.
2.  **Blocker: Leads List Empty on Staging**
    *   *Fix:* Seed or trigger a fresh E2E conversion event via pixel telemetry so that at least one active row appears in `/leads` to unblock the Journey slide-over verification.

---

## 9. Final Verdict
🔴 **FAIL — deployed staging /campaigns route crashed; local fix prepared and static-validated; deploy + browser re-test required.**
