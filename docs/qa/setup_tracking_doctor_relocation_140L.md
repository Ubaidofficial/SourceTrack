# QA Report — Tracking Doctor Setup Relocation

Verification results and evidence for moving Tracking Doctor out of the Dashboard and into the dedicated `/setup` page flow.

## 1. Scope & Execution Info

* **Session**: Session 140L — Move Tracking Doctor into Dedicated Setup / Getting Started Flow
* **Tested URL**: `http://localhost:5173`
* **Test Environment**: Local Chrome Web Browser (Vite dev server + Node Express backend API)
* **Date**: 2026-06-15

## 2. Routes & Navigation Checks

* **`/setup` Page Route**: Tested and verified. The page mounts the new `Setup` component correctly with 4 checklist tabs on the left and detail pane on the right.
* **`/snippet` Redirect**: Accessing `http://localhost:5173/snippet` redirects cleanly to `http://localhost:5173/setup` via react-router `<Navigate to="/setup" replace />`.
* **Sidebar Navigation order**: Sidebar conforms strictly to:
  1. Setup
  2. Dashboard
  3. Analytics
  4. Attribution
  5. All Leads
  6. Campaigns
  7. Report Builder
  8. Integrations
  9. Settings
* **Setup Navigation Status Dot**:
  * Action needed (amber): Displays when the pixel has not received events, domain match is pending/wrong, or conversions are missing.
  * Healthy (green): Displays once all tracking checks pass.
  * Safety: No layout shift (uses `ml-auto shrink-0`), no polling, silent fallback if the diagnostics request fails.

## 3. Dashboard Changes

* **Removed Setup Doctor Card**: SetupDoctorCard is fully removed from `/dashboard` and `/attribution` views, ensuring the page functions as an analytics command center.
* **Compact Setup Banner**:
  * Displays only when tracking setup is incomplete:
    ```text
    Tracking setup incomplete
    No events received yet. Finish setup to start seeing analytics and attribution.
    [Open Setup]
    ```
  * Keeps the dashboard interface clean, eliminating duplicate states and massive warning blocks.
  * Displays zero setup banners when setup is complete (healthy status).

## 4. Setup Tabs Behavior

### Install Tab
* Registered domain information is queried and shown.
* Code snippet copy utility works correctly (generates code and triggers "Copied!" checkmark).
* "Paste before `</head>`" guidance is clear and visible.
* CMS platform guide links (GTM, Webflow, WordPress, Framer, Shopify Recipe) all resolve to existing documentation paths.

### Tracking Health Tab
* Embeds the `SetupDoctorCard` in snippet mode safely.
* Perform real-time verification / check now functions correctly.
* Send test conversion section sends `$0` `test_conversion` events successfully and triggers refetch update.

### Conversions Tab
* Explains client-side JS API (`window.sourcetrack?.track`).
* Explains server-side Conversion API and links to `/developers/conversions`.
* Displays Stripe Checkout integration guidelines (Beta label).
* Displays Shopify webhook instructions (Manual Webhook label).

### Learn Tab
* References existing documentation links:
  * Attribution UTM parameters guide (`/docs/quickstart`)
  * Report Builder instructions (`/report-builder`)
  * Google Ads GCLID ingestion guide (`/docs/platforms/google-ads`)
  * Troubleshooting guide (`/docs/troubleshooting`)

## 5. Console & Network Diagnostics

* **Console Findings**: Zero route-breaking console warnings or exceptions. React query hooks and context updates execute cleanly.
* **Network Findings**: Diagnostics endpoint `/api/install/doctor` is called safely only when `site_key` is available. Result payloads are cached using a `staleTime` of 30 seconds to prevent query flood.

## 6. Viewport Responsive Verifications

Verified zero layout breakages or horizontal overflows at standard viewports:
* **1440px (Desktop)**: Split panel layout fits perfectly, showing checklist on the left and tabs on the right.
* **1024px (Tablet Landscape)**: Clean margins and padding. Sidebar collapses/toggles cleanly.
* **768px (Tablet Portrait)**: Split panel stacks cleanly with checklist taking full width, followed by the active pane.
* **390px (Mobile)**: Compact buttons and layouts align cleanly. Code snippet blocks wrap correctly without overflowing.

---

### Staging Verification Status
STAGING 140L CHANGE VERIFICATION BLOCKED — changes are not deployed yet.

### Post-merge/deploy verification required:
- sourcetrack.ai public marketing site loads
- app.sourcetrack.ai app shell loads
- app.sourcetrack.ai/setup loads after auth
- app.sourcetrack.ai/snippet redirects to /setup
- app.sourcetrack.ai/dashboard does not show full Tracking Doctor
- Setup nav item appears first
- console/network clean

### Status: PASS (Local Browser QA)
Paid beta features remain **NOT READY**.
