# SourceTrack Campaigns V1 Design & Product Spec

## 1. Product Context
The Campaigns page in SourceTrack V1 is a read-only performance tracking dashboard. It does not perform active ad management (such as pausing/resuming campaigns, changing budgets, or bid management). It exists purely to report attribution metrics mapped to UTM parameters captured by the pixel.

## 2. Gating & Safety Rules (Data Truth Gates)
*   **Revenue Gating**: Do not display revenue columns, Orders, AOV, MRR, or event value unless real conversion value/revenue data exists for the selected date range and active site.
*   **Cost Gating**: Do not display spend, ROAS, CPL, CAC, CPA, CPC, budget, or Net Profit columns unless cost data has been imported/configured for that campaign.
*   **No Placeholders**: Never render fake `$0.00` placeholders or fake ROAS percentages by default. If cost/revenue data is missing, the corresponding columns must be hidden, or a compact "Cost data unavailable" or "Revenue not connected" helper must be shown.

## 3. UI Specifications

### 3.1 Page Header & Controls
*   **Title**: "Campaigns"
*   **Subtitle**: "Read-only performance tracking and attribution metrics"
*   **Filter Bar**: Date range selector, search input, and export CSV button.
*   **Tooltip**:
    > "Campaign status is a SourceTrack label. It does not pause or change ads in external platforms."

### 3.2 Allowed Campaign Status Labels
*   `Active`
*   `Paused`
*   `Archived`
*   `Draft` / `Tracking only`

### 3.3 Campaigns Performance Table Schema
Depending on data gates, the table columns dynamically adjust:

#### Default Mode (No Revenue, No Cost)
*   **Campaign**: Campaign name (`utm_campaign`)
*   **Source / Medium**: `utm_source` / `utm_medium`
*   **Status**: Label badge
*   **Visitors / Sessions**: Total traffic count
*   **Leads / Conversions**: Total conversions count
*   **CVR%**: Conversion rate percentage
*   **Qualified %**: Percentage of conversions marked as Qualified
*   **Top Landing Page**: Path of the top page visited
*   **Last Conversion**: Timestamp of the latest conversion
*   **View Details**: CTA link/button

#### Revenue Connected Mode (Add to Default)
*   **Revenue**: Total attributed revenue
*   **Orders**: Total order count
*   **AOV**: Average order value
*   **MRR**: Monthly Recurring Revenue (SaaS only)

#### Cost Data Connected Mode (Add to Default)
*   **Spend**: Total ad spend
*   **ROAS**: Return on ad spend
*   **CPL**: Cost per lead
*   **CAC**: Customer acquisition cost
*   **CPA**: Cost per acquisition
*   **Net Profit**: Revenue minus spend

### 3.4 Campaign Detail Panel (Slide-over)
Triggered when clicking a campaign row.
*   **Header**: Campaign Name, Source/Medium, and status label.
*   **KPI Strip**: Core metrics based on data presence.
*   **Performance Trend**: Sparkline or small line chart of conversions/revenue over time.
*   **Top Landing Pages**: Table of top URLs visited under this campaign.
*   **Conversion Events**: Breakdown of conversion types.
*   **Recent Leads/Conversions**: List of latest converted visitors (with links to Journeys).
*   **UTM Details**: Detailed listing of query parameters (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `utm_id`).

### 3.5 Allowed Actions
*   Export campaign metrics CSV
*   Copy UTM summary to clipboard
*   Render SourceTrack status label as read-only. Editable campaign status requires server persistence. If no server persistence exists, render status as read-only.
*   View related leads
*   View journeys
