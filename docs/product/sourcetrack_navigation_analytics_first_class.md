# SourceTrack V1 Navigation & Layout Spec

## 1. Product Context
The navigation structure is updated to place the Dashboard as the central command center / homepage, followed by focused pages for Analytics and Attribution. This keeps the layout structured and clean, avoiding excessive top-level sidebar items while ensuring a premium feel with dedicated, lightweight views.

## 2. Updated Navigation Hierarchy
The app sidebar navigation groups and hierarchy are structured in the following order:

1.  **Dashboard** (`/dashboard`) — Central command center summarizing KPIs, lightweight site stats, attribution overview, recent leads, campaigns/sources summary, and AI sources (only if data exists).
2.  **Analytics** (`/analytics`) — Lightweight site traffic, behavior, pages, audience, and technology views.
3.  **Attribution** (`/attribution`) — Touchpoint source attribution model comparisons and AI source performance.
4.  **All Leads** (`/leads`) — Individual visitor profiling, status qualification, and Lead Journey slide-over timelines.
5.  **Campaigns** (`/campaigns`) — Read-only campaign performance tracking.
6.  **Report Builder** (`/report-builder`) — Guided custom report widget creator.
7.  **Integrations** (`/app/integrations`) — Tracking scripts, pixel health, and cost sync APIs.
8.  **Settings** (`/settings`) — Domain configurations, cross-domain, data retention, and erasure.

---

## 3. UI & UX Specifications

### 3.1 Dashboard
*   **Purpose**: Command center for top-level performance.
*   **Aesthetics**: Premium, clean, and fast-loading.
*   **Content**:
    *   Overall summary / KPIs (max 3 KPIs: Revenue/Leads, Conversions, Conversion Rate).
    *   Setup / no-data states (Onboarding & Setup Doctor cards).
    *   Lightweight analytics summary.
    *   Attribution summary (Top Sources, Recent Conversions).
    *   AI source summary (rendered only if real AI referral data exists).
    *   Pinned reports widget grid (Growth/Scale plans).

### 3.2 Analytics
*   **Purpose**: Detailed traffic analysis ("What happened on my site?").
*   **Aesthetics**: premium, lightweight, and tabbed.
*   **Tabs**: Overview, Realtime, Pages, Audience, Technology.
*   **Filters**: Multi-filter query bar for deep segmenting.

### 3.3 Attribution
*   **Purpose**: Conversion credit analysis.
*   **Content**:
    *   Source Performance Trend chart.
    *   Source Attribution breakdown by model (First Touch, Last Touch, Linear, U-Shaped, W-Shaped, etc.).
    *   AI Source Performance card (shows table with ChatGPT, Claude, etc., or an empty state when no AI data exists).
    *   Landing Page Performance table.
    *   Search Terms / SEO Queries (only when GSC is connected).

### 3.4 All Leads & journeys
*   **Journeys Integration**: Journeys are no longer a top-level item. They are accessed directly from the **All Leads** list. Clicking any lead triggers the Lead Journey slide-over panel displaying the timeline of touchpoints and pages visited.

---

## 4. Backwards Compatibility & Redirects
*   `/journeys` redirects to `/leads`.
*   `/ai-sources` redirects to `/attribution`.
