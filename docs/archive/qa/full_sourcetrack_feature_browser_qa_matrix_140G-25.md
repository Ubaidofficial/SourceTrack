# Full SourceTrack Feature Browser QA Matrix — Session 140G-25

## 1. Overview
This document records the visual layout, console logs, network request statuses, and screenshot evidence for all major pages inside the protected SourceTrack dashboard on the staging environment.

**QA Session ID:** 140G-25<br />
**Staging Host:** `https://sourcetrack-dashboard-staging.up.railway.app`<br />
**Test Account:** `staging-test@sourcetrack.ai`<br />
**Browser Used:** Chrome Canary (isolated QA profile)<br />
**Status:** 🟡 **PARTIAL** (Basic page load and API telemetry checks verified; full functional verification pending)

---

## 2. Verification Verdicts

### A. Browser Route QA Performed (Basic Page Loads)

| Route / Page | Verdict | Console Messages / Errors | Network Requests / API Status | Visual Verification & Description | Screenshot Evidence |
|---|---|---|---|---|---|
| **Login** (`/login`) | **PASS** | None | `/api/onboarding/me` (304) | Login form loads correctly with email/password inputs and recovery link. | Antigravity screenshot captured: `screenshot_login.png` (artifact not committed) |
| **Dashboard** (`/dashboard`) | **PARTIAL** | `Failed to load resource: 404` | `/api/recent-activity` (404) | Performance overview header loads, but the dashboard reports list shows template cues. Affected by the `/recent-activity` frontend path bug. | Antigravity screenshot captured: `screenshot_dashboard.png` (artifact not committed) |
| **Analytics** (`/analytics`) | **PASS** | None | `/api/analytics/summary` (304), `/api/live` (304) | Empty states load correctly, rendering charts, top landing pages, and browser distribution cards. | Antigravity screenshot captured: `screenshot_analytics.png` (artifact not committed) |
| **Campaigns** (`/campaigns`) | **PASS** | None | `/api/integrations/ad-platforms/status` (200) | Performance by marketing channel table loads successfully. Resolved the Supabase `ad_platform_connections` table database blocker. | Antigravity screenshot captured: `screenshot_campaigns.png` (artifact not committed) |
| **Leads** (`/leads`) | **PASS** | None | `/api/leads` (200) | Individual visitors table loads successfully, showing a list of leads (e.g., visitor `user_qa_123`). | Antigravity screenshot captured: `screenshot_leads.png` (artifact not committed) |
| **Journeys** (`/journey`) | **PASS** | None | `/api/journey/user_qa_123` (200) | Input field and search button allow searching for specific visitor IDs. Loads the visitor's detailed history view. | Antigravity screenshot captured: `screenshot_journey.png` (artifact not committed) |
| **Reports** (`/report-builder`) | **PASS** | None | `/api/attribution` (200), `/api/reports/saved` (200) | Answer builder configuration options render correctly. Clicked templates update metric selections in real-time. | Antigravity screenshot captured: `screenshot_reports.png` (artifact not committed) |
| **SEO Revenue** (`/seo-revenue`) | **PASS** | None | `/api/seo-revenue` (200) | SEO revenue allocation dashboard loads correctly with Search Console connection CTA. | Antigravity screenshot captured: `screenshot_seo.png` (artifact not committed) |
| **Integrations** (`/app/integrations`) | **PASS** | None | `/api/integrations/proxy-domain` (200) | Integration status page lists ad platforms, webhook configs, and proxy domain status. Resolved the missing `managed_proxy_domains` table blocker. | Antigravity screenshot captured: `screenshot_integrations.png` (artifact not committed) |
| **Live Events** (`/debugger`) | **PASS** | None | `/api/events/health` (200), `/api/events/dedupe-summary` (200) | Live event debugger table renders successfully. | Antigravity screenshot captured: `screenshot_debugger.png` (artifact not committed) |
| **Data Quality** (`/data-quality`) | **PASS** | None | `/api/analytics/data-quality/latest` (304), `/rest/v1/data_quality_alerts` (200) | Diagnostic score widgets and alerts list load correctly. Resolved the missing `data_quality_alerts` table blocker. | Antigravity screenshot captured: `screenshot_data_quality.png` (artifact not committed) |
| **Settings** (`/settings`) | **PASS** | None | `/rest/v1/sites?select=...` (200) | General and tracking settings configuration forms load correctly. Resolved the missing `sites.data_retention_days` database column blocker. | Antigravity screenshot captured: `screenshot_settings.png` (artifact not committed) |
| **Billing** (`/billing`) | **PASS** | None | `/rest/v1/pageviews?select=session_id...` (200) | Displays correct subscription plan (Growth), active state, and usage telemetry from DB metadata. | Antigravity screenshot captured: `screenshot_billing.png` (artifact not committed) |

### B. Remaining Untested Feature Matrix Items

| Feature / Matrix Item | Verdict | Visual / Functional Proof Needed |
|---|---|---|
| **Onboarding** | **BLOCKED — not verified** | Register new user E2E, check step transitions, company/site insertion. |
| **Install Snippet** | **BLOCKED — not verified** | Verify script loader domain mapping, snippet copy button copy/clipboard action. |
| **Setup Doctor** | **BLOCKED — not verified** | Active telemetry check, trigger simulated events and confirm doctor unblocks user. |
| **Pageview Tracking** | **BLOCKED — not verified** | Load snippet on a test site, fire pageview, check network headers and DB writes. |
| **Event Tracking** | **BLOCKED — not verified** | Fire custom client-side event, verify payload parsing and event properties in DB. |
| **Conversion Tracking** | **BLOCKED — not verified** | Trigger lead/purchase conversion on test site, verify attribution processing. |
| **Identify / User_id** | **BLOCKED — not verified** | Call `.identify(userId, traits)` and check stitched identity links table. |
| **UTM / Referrer Attribution**| **BLOCKED — not verified** | Click link with UTM params, verify landing page UTM extraction and storage. |
| **Attribution Math (First/Last/Multi)**| **BLOCKED — not verified** | Trigger multiple touchpoints, check credit distribution across reports. |
| **Visitor Journey Grouping**| **BLOCKED — not verified** | View step-by-step visitor journey with multiple distinct sessions in the UI. |
| **Session Grouping** | **BLOCKED — not verified** | Confirm visitor clicks within 30 mins are grouped into a single session. |
| **Campaign Drilldown** | **BLOCKED — not verified** | Drill down into campaigns to view group-by values and source stats. |
| **Funnels** | **BLOCKED — not verified** | Construct and verify funnel visual steps in the dashboard. |
| **Revenue / Payment Attribution**| **BLOCKED — not verified** | Trigger webhook from Stripe checkout success, verify conversion and source credit. |
| **Manual / Offline Conversions**| **BLOCKED — not verified** | Upload offline conversions CSV, check parsing and database row creation. |
| **Stripe / API Surfaces** | **BLOCKED — not verified** | Connect paid Stripe test customer, generate and copy API access tokens. |
| **Shopify Webhook Recipe** | **BLOCKED — not verified** | Fire Shopify webhook test payload, verify signature and ingestion. |
| **Docs Truth Audit** | **BLOCKED — not verified** | Audit help guides and docs pages to ensure all snippets and properties match code. |

---

## 3. Staging Schema Repairs Applied
During basic route inspections, several database schema gaps on staging (`nrsvpwzekfrdrzkoecfk`) were resolved to prevent 500/400 API failures:
1. Applied `supabase/migrations/20260608000000_add_ad_cost_imports.sql` to add `platform`, `clicks`, `impressions` to `campaign_costs` and create the `ad_sync_runs` table.
2. Applied `supabase/migrations/20260608010000_add_ad_platform_connections.sql` to create the `ad_platform_connections` table.
3. Applied `supabase/migrations/20260607184000_add_managed_proxy_domains.sql` to create `managed_proxy_domains` table.
4. Created `data_quality_alerts` table and `job_runs` table.
5. Added `data_retention_days` column to the `sites` table.

---

## 4. Known Bugs Identified
* **Dashboard `/recent-activity` 404**: The dashboard UI requests `/api/recent-activity` instead of `/api/dashboard/recent-activity`, causing a 404 console error.

---

## 5. Validation
The following validation scripts were executed to verify the repository safety and syntax health:

### Commands Run:
```bash
git diff --check
npm run qa:env-safety
npm run qa:static
```

### Raw Validation Output:
```
> trackiq@1.0.0 qa:env-safety
> node scripts/qa-env-safety.mjs

Running offline environment safety guard tests...
✅ All offline environment safety tests passed successfully.

==================================================
      SourceTrack Release Readiness Audit
==================================================
✅ Declared status: NOT READY (correctly blocked).
==================================================
PASS — Release readiness checklist verified (all blockers open).

==================================================
         SourceTrack Static Launch QA
==================================================
--- B. Backend Syntax Checks ---
✅ All backend files syntax passed.

--- C. Frontend Build ---
Running frontend production build...
✅ Frontend build succeeded.

--- D. Whitespace Check ---
✅ No whitespace violations.

--- E. Forbidden Copy/API Grep Checks ---
✅ Forbidden copy/API grep checks passed (no forbidden strings in user-facing code).

--- F. Route Mount Checks ---
✅ Route mount checks passed.

--- H. Security & Plan Scoping Checks ---
✅ Security & plan scoping checks passed.

==================================================
PASS — static launch QA passed
```
