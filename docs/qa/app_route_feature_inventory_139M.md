# SourceTrack Application Route & Feature Inventory (Session 139M-0)

This document provides a comprehensive, ground-truth inventory of all public and authenticated routes, interactive components (buttons, CTAs, modals, dropdowns), forms, API-calling features, and operational limitations.

---

## 1. Browser-Preview & Side-Panel QA Testing Methods

To execute browser testing for sessions `139M-1` through `139M-8`, the following harness setup and methods will be used:

### 1.1 Local Server Infrastructure Setup
The application is split into two independent services and a static test page:
1.  **API Backend Server:**
    *   **Port/URL:** `http://localhost:3000`
    *   **Launch Command:** `npm run dev` (nodemon api/bootstrap.js)
    *   **Ingestion Endpoint:** `POST http://localhost:3000/api/track`
2.  **Dashboard Frontend:**
    *   **Port/URL:** `http://localhost:5173`
    *   **Launch Command:** `npm run dev` in `/dashboard` (Vite)
3.  **Static Pixel Test Page:**
    *   **Port/URL:** `http://localhost:8080/sourcetrack-test.html`
    *   **Launch Command:** `python3 -m http.server 8080` (serves the static file with embedded pixel script)

### 1.2 Browser Control & DevTools Integration
*   **DevTools Console Monitoring:** Open the developer tools (F12) to monitor client-side errors, rate limit triggers (429), or auth/redirect flags.
*   **Network Tab Audits:** Monitor outbound payloads fired to `http://localhost:3000/api/*` (`track`, `collect`, `conversion`, `identify`, `tracker/id`) to verify payload parameters, HTTP statuses, response timing, and CORS preflight headers.
*   **MCP DevTools Server:** Can be used to list active tabs, navigate pages, click buttons, inspect selectors, and automate verification checks.

---

## 2. Route Inventory

Discovered directly from router declarations in `dashboard/src/App.jsx`.

### 2.1 Public Routes (No Authentication Required)
These routes are accessible without logging in.

| Route Path | Page Component | Purpose |
| :--- | :--- | :--- |
| `/` | `Landing.jsx` | Marketing home page. |
| `/login` | `Login.jsx` | Sign-in form. Reroutes to `/dashboard` if user session exists. |
| `/signup` | `Signup.jsx` | Account creation. Reroutes to `/dashboard` if user session exists. |
| `/product` | `Product.jsx` | Public capabilities detail page. |
| `/attribution` | `Attribution.jsx` | Public explanations of attribution models. |
| `/ai-referral-tracking` | `AIReferralTracking.jsx` | Details on AI referrer detection capabilities. |
| `/pricing` | `Pricing.jsx` | Pricing tier grids and features comparison. |
| `/compare/ga4` | `CompareGA4.jsx` | Competitor comparison page against GA4. |
| `/use-cases/saas` | `SolutionSaaS.jsx` | SaaS attribution use case page. |
| `/use-cases/ecommerce` | `SolutionEcommerce.jsx` | eCommerce attribution use case page. |
| `/use-cases/lead-generation` | `SolutionLeadGen.jsx` | Lead Gen attribution use case page. |
| `/use-cases/agencies` | `SolutionAgency.jsx` | Agency/client use case page. |
| `/privacy` | `Privacy.jsx` | Privacy agreement page. |
| `/terms` | `Terms.jsx` | Terms of service page. |
| `/integrations` | `PublicIntegrations.jsx` | Public directory of integrations. |
| `/security` | `Security.jsx` | Public security compliance/data encryption notes. |
| `/demo` | `Demo.jsx` | Sandbox preview showing fake data dashboard. |
| `/share/:token` | `ShareDashboard.jsx` | Client dashboard sharing route. |
| `/auth/callback` | `AuthCallback.jsx` | Supabase auth callback router. |

#### Documentation & Help Center Pages:
*   `/docs` ➔ `DocsHome.jsx`
*   `/docs/quickstart` ➔ `DocsQuickstart.jsx`
*   `/docs/install` ➔ `DocsInstall.jsx`
*   `/docs/platforms/google-ads` ➔ `DocsGoogleAds.jsx`
*   `/docs/platforms/google-tag-manager` ➔ `DocsGTM.jsx`
*   `/docs/platforms/webflow` ➔ `DocsWebflow.jsx`
*   `/docs/platforms/wordpress` ➔ `DocsWordPress.jsx`
*   `/docs/platforms/framer` ➔ `DocsFramer.jsx`
*   `/docs/platforms/shopify` ➔ `DocsShopify.jsx`
*   `/docs/platforms/stripe` ➔ `DocsStripe.jsx`
*   `/docs/troubleshooting` ➔ `DocsTroubleshooting.jsx`
*   `/developers` ➔ `DevelopersHome.jsx`
*   `/developers/api` ➔ `DevelopersApi.jsx`
*   `/developers/tracker` ➔ `DevelopersTracker.jsx`
*   `/developers/conversions` ➔ `DevelopersConversions.jsx`
*   `/developers/offline-conversions` ➔ `DevelopersOfflineConversions.jsx`
*   `/developers/identify` ➔ `DevelopersIdentify.jsx`
*   `/developers/webhooks` ➔ `DevelopersWebhooks.jsx`
*   `/developers/campaign-costs` ➔ `DevelopersCampaignCosts.jsx`
*   `/developers/security` ➔ `DevelopersSecurity.jsx`

### 2.2 Authenticated / Protected Routes
These routes require a valid user session. Reroutes to `/onboarding` if onboarding is incomplete.

| Route Path | Page Component | Purpose |
| :--- | :--- | :--- |
| `/dashboard` | `Dashboard.jsx` | Central reporting UI showing overview cards and trend charts. |
| `/leads` | `Leads.jsx` | Identified users directory. |
| `/leads/:leadId` | `LeadDetail.jsx` | Multi-touch customer journey timeline for a lead. |
| `/campaigns` | `Campaigns.jsx` | Ad campaign statistics, GSC search query log. |
| `/app/integrations` | `Integrations.jsx` | Webhook hooks, proxy, ad account configurations. |
| `/report-builder` | `ReportBuilder.jsx` | 7-step customizable report builder (via `ReportBuilderGate`). |
| `/journey` | `Journey.jsx` | Interactive visitor journey directories. |
| `/seo-revenue` | `SEORevenue.jsx` | Organic search query ROI analysis. |
| `/analytics` | `Analytics.jsx` | Pageviews, entry/exit pages, country/device/browser lists, funnel builder. |
| `/ai-chat` | `AIChat.jsx` | Full-screen conversational LLM analytics interface. |
| `/ai-analytics` | `AIAnalytics.jsx` | Dedicated AI traffic dimensions reporting page. |
| `/snippet` | `Snippet.jsx` | Setup Doctor installation instructions. |
| `/debugger` | `EventDebugger.jsx` | Ingress event logger. |
| `/settings` | `Settings.jsx` | timezones, domains exclusion, workspace team invites. |
| `/billing` | `Billing.jsx` | Price tier plans selection. |
| `/data-quality` | `DataQuality.jsx` | Ingress telemetry validation checks. |
| `/onboarding` | `Onboarding.jsx` | Interactive domain connection and tracker snippet setup. |
| `/admin` | `Admin.jsx` | Super-admin control panel. |

---

## 3. Interactive Components & Forms

### 3.1 Buttons & Call-to-Actions (CTAs)

#### Top Header & Sidebar Layout (`Layout.jsx`):
*   **Site Switcher select dropdown:** Triggers active site switch.
*   **Sign out button:** Clears auth credentials and routes to `/login`.
*   **Theme Toggle button:** Swaps light/dark themes.
*   **Upgrade button:** Triggers checkout portal routing.
*   **AI Chat slide-in action button:** Reveals the sidebar assistant overlay.

#### Main Dashboard (`Dashboard.jsx`):
*   **Create Report button:** Routes to `/report-builder`.
*   **Date preset selector pills:** Toggles between `24h`, `7 days`, `30 days` ranges.
*   **Export report button:** Downloads active CSV format.
*   **Template quickstart selectors:** "Sources", "Totals", "Conversion Trend" setup buttons.
*   **AI Spark query search button:** Routes query parameter to `/ai-chat`.
*   **View Event Debugger link:** Routes to `/debugger`.
*   **Add Annotation button:** Renders annotation dialog form.

#### Analytics View (`Analytics.jsx`):
*   **Live refresh button:** Forces live visitors refetch.
*   **Days selection pills:** Toggles `24h`, `7d`, `30d`, `90d`.
*   **Metric toggle checkboxes:** Displays/hides visitors and revenue charts.
*   **Granularity buttons:** Swaps timeline resolution (daily, weekly, monthly).
*   **Sources tabs buttons:** Swaps between `channel`, `referrer`, `campaign`, `medium`, and `ai_source`.
*   **Copy tracking snippet button:** Copies tag code blocks.
*   **Funnel builder run button:** Renders drop-off charts based on comma-separated values input.
*   **Funnel step remove buttons:** Strips specific steps from funnel arrays.

#### Report Builder (`ReportBuilder.jsx`):
*   **Model selection dropdown:** Choice of 9 attribution models.
*   **Dimension selection dropdown:** Choice of 16 dimensions.
*   **Metric select tags:** Checkbox list of 15 metrics.
*   **Chart type select tags:** Bar, Line, Area, Pie, KPI, Table Only.
*   **Date range selector:** Renders Popover to toggle Rolling/Fixed date windows.
*   **Save Report button:** Persists configuration to database.
*   **Pin/Unpin toggle:** Updates saved report dashboard presence.
*   **CSV Export button:** Fetches CSV result.
*   **Run Query button:** Forces active query refetch.

#### Integrations Settings (`Integrations.jsx`):
*   **Proxy check domain button:** Resolves CNAME DNS configuration status.
*   **Copy Ads URL template button:** Copies tracking template parameter string.
*   **Connect Google Ads button:** Authenticates access credentials.
*   **Sync Google Ads button:** Triggers spend retrieval.
*   **Save Stripe secret button:** Saves webhook credentials.
*   **Save Shopify secret button:** Saves webhook credentials.
*   **GSC auth button:** Authenticates GSC access.
*   **Sync GSC button:** Forces search query downloads.
*   **Test Webhook integration button:** Emits a mock payload.

### 3.2 Modals & Dialogs
*   **Conversion Explanation Modal (`ConversionExplanationModal.jsx`):** Renders conversion path, referrers, touchpoint timing, and confidence weight signals.
*   **AI Chat Sidebar Drawer (`Layout.jsx` inline panel):** Contextual data assistant.
*   **Annotation Form Dialog (`Dashboard.jsx` inline):** In-page dialog to create date-anchored notes.

### 3.3 Forms & User Inputs
*   **Login Form:** Email and password.
*   **Signup Form:** Email, password, and workspace/company name.
*   **Onboarding Wizard:**
    *   *Step 1:* Domain URL text field.
    *   *Step 2:* Business type select tags.
    *   *Step 3:* Install method select tags.
    *   *Step 5:* Conversion checkboxes grid.
*   **Report Builder Config:** Custom date ranges, attribution window days, filter values.
*   **Settings Forms:** Workspace name, domain name, timezone picker, custom parameters, exclusion paths list, workspace member invitations.

---

## 4. API Ingest & Dispatch Directory

*   `POST /api/track` - Core pageview capture.
*   `POST /api/conversion` - Client-side conversion.
*   `POST /api/conversion/offline` - Server-side conversions.
*   `POST /api/identify` - Link anonymous cookie identifiers to user profiles.
*   `GET /api/tracker/id` - Server-side client hash for cookieless mode.
*   `POST /api/webhooks/stripe/:site_key` - Stripe checkout/payment events.
*   `POST /api/webhooks/shopify/:site_key` - Shopify order creation webhook.
*   `POST /api/webhooks/incoming/:site_key` - Generic inbound webhook.

---

## 5. Operational Status & Blocked Verification Matrix

Due to missing staging connection credentials and incomplete staging database setup, several pages and telemetry configurations cannot be end-to-end verified at runtime.

| Capability / Area | Page Context | Testing Status | Reason Blocked |
| :--- | :--- | :--- | :--- |
| **User Authentication** | `/login`, `/signup` | **Verified (Frontend Only)** | Authenticators submit correctly, but DB user creation is mocked/not persistent on staging. |
| **Onboarding Pipeline** | `/onboarding` | **Verified (Frontend Only)** | Domain connections and site state transitions are verified, but DB updates are not written. |
| **Snippet Verification** | `/snippet` | `BLOCKED — not verified` | Telemetry verification checks require live ingestion writes which are blocked on staging database. |
| **Dashboard KPIs** | `/dashboard` | `BLOCKED — not verified` | Relies on seeded database views and active telemetry records. |
| **Report Builder Execution** | `/report-builder` | `BLOCKED — not verified` | Custom grouping queries require active database data to execute. |
| **Visitor Journeys** | `/journey`, `/leads` | `BLOCKED — not verified` | Requires linked identity records and event timelines in the database. |
| **Campaigns & Spend ROI** | `/campaigns` | `BLOCKED — not verified` | requires campaign_costs table writes and ad accounts tokens. |
| **Stripe Webhook Processing** | `/app/integrations` | `BLOCKED — not verified` | Stripe webhook handlers require staging database access to write and reconcile payments. |
| **Shopify Webhook Processing** | `/app/integrations` | `BLOCKED — not verified` | Shopify webhook handlers require staging database access to write. |
| **Payments / Conversion API** | `/app/integrations` | `BLOCKED — not verified` | Offline conversions require database updates. |
| **Google Search Console Sync** | `/seo-revenue` | `BLOCKED — not verified` | Token exchange and performance cache require database access. |
| **Billing Plan Gates** | `/billing` | `BLOCKED — not verified` | Pricing upgrades and gate checks require Stripe portal writes and database plan flag adjustments. |
| **Super Admin Masquerade** | `/admin` | `BLOCKED — not verified` | Super admin routes check membership and audit logs inside PostgreSQL. |

---

## 6. Known Weaknesses of This Inventory

1.  **Figma Spec Drift:** This inventory represents pages and features implemented in the code. It does not verify whether these features perfectly match the Figma design mocks, as Figma assets are not directly inspectable in the codebase.
2.  **No Staging Database Credentials:** Because database credentials (`SUPABASE_SERVICE_KEY` and staging database password) are placeholders in local `.env` files, any button click or API call that mutates database tables has not been run at runtime. Only syntax checks and production compilation have passed.
3.  **Mocked Third-Party Services:** Integrations with Stripe, Shopify, Google Ads, Meta Ads, and Resend are based on API routing structures and HMAC verification helpers in the source code; E2E communication with actual sandbox/test-mode environments for these services remains blocked.
