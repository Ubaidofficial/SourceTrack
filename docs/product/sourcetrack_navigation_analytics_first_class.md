# SourceTrack V1 Navigation & Layout Spec — Analytics First-Class

## 1. Product Context
The navigation structure is updated to place Analytics as a first-class, prominent sidebar item before Attribution. This represents a product shift away from the "Dashboard-only analytics" model to an "Analytics-first" model. Users are presented with lightweight site traffic analytics immediately upon landing, followed by deeper attribution, journey, and campaign cost breakdowns.

## 2. Updated Navigation Hierarchy
The app sidebar navigation groups and hierarchy are structured in the following order:

1.  **Analytics** (`/analytics`) — Lightweight site telemetry and traffic overview.
2.  **Attribution** (`/attribution`) — Touchpoint source attribution model comparisons.
3.  **Journeys** (`/journeys`) — Chronological visitor conversions and entry pages.
4.  **AI Sources** (`/ai-sources`) — Traffic and conversions from AI chat/search platforms.
5.  **All Leads** (`/leads`) — Individual visitor profiling and status qualification.
6.  **Campaigns** (`/campaigns`) — Read-only campaign performance tracking.
7.  **Report Builder** (`/report-builder`) — Guided custom report widget creator.
8.  **Integrations** (`/app/integrations`) — Tracking scripts, pixel health, and cost sync APIs.
9.  **Settings** (`/settings`) — Domain configurations, cross-domain, data retention, and erasure.

---

## 3. UI & UX Specifications

### 3.1 Analytics
*   **Purpose**: Answers "What happened on my site?"
*   **Character**: Lightweight, premium, fast-loading, and tabbed.
*   **Overview tab**:
    *   Core KPIs (max 3): Visitors/sessions, Pageviews, Conversions/leads, Conversion rate.
    *   Real-time / live visitors indicator.
    *   Top sources list (with source chips).
    *   Recent activity feed.
    *   Main trend chart (visitors + conversions).
*   **Other planned tabs**: Realtime, Pages, Audience, Technology (simple layout).

### 3.2 Attribution
*   **Purpose**: Answers "Which sources, campaigns, and touchpoints drove conversions/revenue?"
*   **Tabs**: Sources, Campaigns, SEO / GSC, Models, Recent conversions.
*   **Gating Rules**:
    *   No revenue columns or values unless real revenue exists.
    *   No cost/spend metrics unless cost data exists.
    *   No GSC metrics unless GSC is connected.
    *   No person-level keyword attribution.
    *   No fake AI confidence/accuracy scores.

---

## 4. Backwards Compatibility & Redirects
*   `/dashboard` is retained as a legacy route but performs an automatic redirect (HTTP 301/302 or client-side redirect) to the canonical `/analytics` route.
*   The underlying tabbed implementation of the Dashboard component is leveraged to serve `/analytics`, `/attribution`, `/journeys`, and `/ai-sources` dynamically, mapping the pathname to the correct initial tab. This ensures lightweight SPA loading and eliminates visual lag.
