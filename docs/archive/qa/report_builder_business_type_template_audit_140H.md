# Report Builder Business-Type Template Audit (Session 140H)

## 1. Executive Summary & Verdict
*   **Overall Verdict:** 🟡 **PARTIAL — Usable report builder exists, but lacks business-type template grouping, data truth gating, and key SaaS/Ecommerce/LeadGen dimensions & metrics.**
*   **Paid Beta Readiness:** 🔴 **NOT READY** (The report builder works technically, but requires gating and templates to feel professional and protect users from empty/misleading states).
*   **Final Verdict Rationale:** The Report Builder successfully loads, queries the staging database, saves reports, and pins them. However, it requires a layout shift from "Configure from Blank" to a structured, "Template-First" flow grouped by business type, alongside data truth gates to prevent displaying uncollected metric variables (like ROAS or MRR without cost or Stripe metadata).

---

## 2. Audit Details

### 2.1 Route Inspected
*   **Route:** `/report-builder` (protected client route, requires login)
*   **Marketing Route:** `/report-builder` (unauthenticated public page rendering a static dashboard mock)
*   **Staging Verification URL:** `https://sourcetrack-dashboard-staging.up.railway.app/report-builder`

### 2.2 Files Inspected
*   [ReportBuilderGate.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/ReportBuilderGate.jsx) — Controls auth access and sidebar layout integration.
*   [ReportBuilder.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/ReportBuilder.jsx) — Core authenticated page rendering UI, React state, queries, and filters.
*   [ReportBuilderMarketing.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/pages/ReportBuilderMarketing.jsx) — Public marketing landing page.
*   [ReportBuilderMock.jsx](file:///Users/ubaid/Desktop/trackiq/dashboard/src/components/ReportBuilderMock.jsx) — Static SVG/div dashboard widget mockup used in marketing pages.

---

## 3. Current Implementation State

### 3.1 Existing Templates Found
Only 5 flat, uncategorized template presets exist in the client code:
*   `AI sources` (dim: `ai_source`, metric: `sessions`)
*   `AI revenue` (dim: `ai_source`, metric: `revenue`)
*   `AI landing pages` (dim: `landing_page`, metric: `conversions`)
*   `Campaign revenue` (dim: `campaign`, metric: `revenue`)
*   `Channel revenue` (dim: `channel`, metric: `revenue`)

### 3.2 Existing Dimensions Found
*   `date` (Time)
*   `channel` (Channel)
*   `source` (Source)
*   `medium` (Medium)
*   `campaign` (Campaign)
*   `keyword` (Keyword / Term)
*   `referrer_domain` (Referrer Domain)
*   `provider` (Revenue Provider)
*   `attribution_status` (Attribution Status)
*   `stitching_method` (Stitching Method)
*   `conversion_type` (Conversion Type)
*   `ai_source` (AI Source)
*   `landing_page` (Landing Page)
*   `country` (Country)
*   `device` (Device)
*   `browser` (Browser)
*   Custom parameters if configured (`custom_param:...` dynamically parsed)

### 3.3 Existing Metrics Found
*   `sessions` (Unique Visitors)
*   `conversions` (Conversions)
*   `revenue` (Revenue)
*   `leads` (Leads)
*   `conversion_rate` (Conversion Rate)
*   `avg_conversion_value` (Avg Conversion Value)
*   `ai_conversions` (AI Conversions)
*   `ai_revenue` (AI Revenue)
*   `ai_conversion_share` (AI Conversion Share)
*   `ai_revenue_share` (AI Revenue Share)
*   `ltv_revenue` (LTV Revenue v1)
*   `session_count` (Session Count)
*   `avg_session_duration` (Avg Session Duration)
*   `pages_per_session` (Pages per Session)
*   `conversion_sessions` (Conversion Sessions)

### 3.4 Existing Filters Found
*   Date Preset / Fixed Range / Rolling Days
*   `filter_channel`
*   `filter_source`
*   `filter_medium`
*   `filter_campaign`
*   `filter_ai_source`
*   `filter_country`
*   `filter_device_type`
*   `filter_is_conversion`
*   `filter_conversion_type`
*   `filter_has_ai_source`
*   `filter_min_conversions`
*   `filter_customer_type`

---

## 4. Gap Analysis

### 4.1 SaaS Gaps
None of the required SaaS reports exist. The following dimensions, metrics, and templates must be added:
*   **Missing SaaS Templates:** Trials by source, Demo bookings by source, Trial-to-paid conversion, MRR by source, Revenue by campaign, Signup landing pages, AI-assisted trials, Time to convert, Lead quality by source.
*   **Missing Metrics:** `MRR` (monthly recurring revenue), `trial_to_paid_rate` (Trial-to-Paid %).
*   **Missing Events/Metadata:** Actual integration with subscription/trial status events in the database schema.

### 4.2 Ecommerce Gaps
The existing builder lacks ecommerce metadata and cost integrations.
*   **Missing Ecommerce Templates:** Orders by source, Revenue by source, AOV by campaign, Product/order revenue if metadata exists, Shopify manual webhook orders, Returning vs new customers, AI-assisted purchases, Landing pages that drive orders, Campaign ROAS (only if cost exists).
*   **Missing Metrics:** `Orders`, `AOV` (Average Order Value - currently only represented generically by `avg_conversion_value`), `ROAS` (Return on Ad Spend - requires spend data).
*   **Missing Labels:** Shopify webhook orders must be labeled as "Manual Webhook" to prevent implying a native app integration exists.

### 4.3 Lead Gen / Agency Gaps
*   **Missing Lead Gen Templates:** Leads by source, Qualified leads by source, MQL/SQL rate by campaign, Form conversions by landing page, Pipeline by source, AI-assisted leads, Campaign lead quality, Client/site performance summary, Pages that generate qualified leads.
*   **Missing Metrics:** `MQL count`, `MQL %`, `SQL count`, `SQL %`, `qualified_leads`, `qualified_pct`.
*   **Missing Filters:** Lead qualification status (`qualification_status`), Multi-site client selector.

### 4.4 Data Truth Gate Gaps
Currently, the UI exposes all metrics and dimensions without verifying if data actually exists in the workspace.
*   **Revenue Gating:** The builder allows selecting `Revenue`, `Avg Conversion Value`, and `LTV Revenue` even when `hasRevenue` is false, displaying blank tables or `$0.00` rather than explaining the lack of integration.
*   **Cost Gating:** Metric selection does not contain Spend, ROAS, CPA, CPC, or CPL. If they are added in the future, they must be gated so they are hidden or marked unavailable unless real ad spend/cost data exists.
*   **GSC Gating:** Search terms and SEO queries do not exist as dimensions or metrics. GSC reports must only be visible when `isGscConnected` is true, and clearly labeled as aggregate Search Console query data.
*   **AI Gating:** AI platform reports are shown globally even if no AI referrers have been detected.

### 4.5 UX Simplicity Gaps
*   **Landing Experience:** The page immediately exposes the complex "Configure Report" sidebar form. It should instead open with a clean **Template Hub** showing the four business groups (SaaS, Ecommerce, Lead Gen, Universal) as primary tiles.
*   **Secondary "Start from Blank":** Creating a report from scratch is currently the only visible path. "Start from Blank" should be secondary, accessed via a distinct button at the bottom of the template selector.
*   **Explanation of Locks:** Gated plan features (like multi-touch models) are marked with `🔒`, but clicking them does not open a clear upgrade modal.

---

## 5. Security & API Concerns
*   **SQL Injection / Arbitrary Queries:** The client passes parameters (`model`, `group_by`, `metric`, `filters`) directly to `/api/attribution`. The backend must strictly validate these values against whitelisted fields to prevent database scanning.
*   **Site Scoping:** Site scoping must remain enforced backend-side for every Report Builder and export request. This audit did not perform a dedicated cross-tenant isolation test; tenant isolation should be verified separately before paid beta.
*   **Export Sanitization:** Report Builder export behavior must continue stripping database internal IDs (`id`, `site_id`, `site_key`) before outputting CSV data. This audit did not perform a dedicated export sanitization retest; export behavior should be reverified before paid beta.

---

## 6. Staging Browser QA Findings
*   **Verified URL:** `https://sourcetrack-dashboard-staging.up.railway.app/report-builder`
*   **Result:** Loaded report configs and queried `/api/attribution` successfully. Saved reports are written to PostgreSQL and rendered in the "Saved Reports" slide-over drawer.
*   **Console Errors:** None.
*   **Network Status:** All requests returned `200` or `304`.

---

## 7. Recommended Implementation Plan

### Phase 1: Database & Onboarding Data Scope
1.  Modify `ReportBuilder.jsx`'s Supabase query to include the `business_type` column:
    ```javascript
    const query = supabase.from('sites').select('site_key, name, plan, custom_url_params, business_type').limit(1)
    ```
2.  Use the resolved `site.business_type` value to prioritize the templates matching the user's business.

### Phase 2: Template-First UI Layout Restructure
1.  **Introduce Template Selection Hub:** When `reportName` is empty and no saved report is loaded, render a prominent **"Select a Template to Start"** screen instead of the preview chart.
2.  **Categorized Template Groups:** Organize all templates into four distinct tabs/cards in the hub:
    *   **Universal Templates**
    *   **SaaS Templates** (e.g., Trial MRR, Demo Conversions)
    *   **Ecommerce Templates** (e.g., AOV Campaign, Orders by Source)
    *   **Lead Gen / Agency Templates** (e.g., MQL/SQL Conversion, Pages that drive leads)
3.  **Secondary Blank Option:** Add a button labeled `"Start from Blank (Advanced)"` below the template hub.

### Phase 3: Add Missing Dimensions, Metrics, and Filters
1.  Update `DIMENSIONS` in `ReportBuilder.jsx` to support:
    *   `exit_page`
    *   `qualification_status` (Lead qualification state)
2.  Update `METRICS` list to add:
    *   `qualified_leads`, `qualified_pct`
    *   `mql_leads`, `mql_pct`
    *   `sql_leads`, `sql_pct`
    *   `mrr`, `trial_to_paid_rate`
3.  Add GSC metrics (`clicks`, `impressions`, `ctr`, `avg_position`) and gate them using `isGscConnected`.

### Phase 4: Implement Gating and Empty States
1.  **Revenue & Cost Gates:** Define `hasRevenue` and `hasCost` variables. Disable or hide revenue metrics (like MRR, AOV, Revenue) and show a help icon explaining that Stripe, Shopify, or Webhook tracking is required.
2.  **GSC Gates:** Render search term query options only if GSC is active.
3.  **Labeling:** Add "Manual Webhook" badge next to any Shopify-based template names.
