# Combined Deployed Browser Visual + Functional E2E Verification Report (140P-D8)

## 1. Final Verdict
* **Combined Browser E2E Status:** **PARTIAL PASS**
  * Verification was successfully performed in the live deployed staging browser. However, billing gates and empty data states prevented complete validation of all visual fixes (namely, Leads selected row state and Campaigns table/filter UI).
* **Paid-Beta Status:** **NOT READY**
  * Paid-beta remains **NOT READY** due to pending transactional email setups, production Stripe environment variables, and live-mode checkout credentials.

---

## 2. Explicit D5/D6/D7 Closure Status
* **Session 140P-D5 — Designer-Grade Visual Fixes:** **PARTIAL PASS**
  * *Reason for Partial Pass:* `/leads` displayed an empty state (0 leads), so selected-row styling could not be verified with an active selected row.
  * *Reason for Partial Pass:* `/campaigns` redirected to `/billing` under the Starter test account, so Campaigns dark filter/search wrappers and responsive action buttons could not be directly verified.
* **Session 140P-D6 — App-Wide Designer Token Cleanup:** **PASS**
  * Token cleanups across index pages, developer guides, and help center files render correctly with correct desaturated contrasts.
* **Session 140P-D7 — Sweep Final UI Risk Tokens:** **PASS**
  * Borders on Setup cards, parameter green label tokens, and Troubleshooting symptom red tokens are verified as standardized.

---

## 3. Routes Tested & Exact Staging URLs
The following frontend routes were navigated, verified, and captured in the live staging environment:

| Requested Route | Mounted Route / Redirect | Actual Deployed URL | Status / Notes |
| :--- | :--- | :--- | :--- |
| `/dashboard` | `/dashboard` | `https://sourcetrack-dashboard-staging.up.railway.app/dashboard` | **PASS** - Main app dashboard overview loaded correctly. |
| `/analytics` | `/analytics` | `https://sourcetrack-dashboard-staging.up.railway.app/analytics` | **PASS** - Event logs & tracking container. |
| `/app/attribution` | `/app/attribution` | `https://sourcetrack-dashboard-staging.up.railway.app/app/attribution` | **PASS** - Multi-touch attribution model verified. |
| `/leads` | `/leads` | `https://sourcetrack-dashboard-staging.up.railway.app/leads` | **PARTIAL PASS** - Route loads, empty state verified; selected-row state not verified due to no lead rows. |
| `/campaigns` | Redirects to `/billing` | `https://sourcetrack-dashboard-staging.up.railway.app/billing` | **BLOCKED / NOT VERIFIED** - Billing-gated to /billing under Starter test account; Campaigns table/filter/action UI not directly verified. |
| `/report-builder` | `/report-builder` | `https://sourcetrack-dashboard-staging.up.railway.app/report-builder` | **PASS** - Template hub & metrics query panel verified. |
| `/app/integrations` | `/app/integrations` | `https://sourcetrack-dashboard-staging.up.railway.app/app/integrations` | **PASS** - Stripe/Shopify manual connection cards verified. |
| `/settings` | `/settings` | `https://sourcetrack-dashboard-staging.up.railway.app/settings` | **PASS** - Workspace & site configs verified. |
| `/app/snippet` | Redirects to `/` | `https://sourcetrack-dashboard-staging.up.railway.app/` | **NOT APPLICABLE / REDIRECTED** - Redirects to `/` as route is not defined in App.jsx. Snippet copy was verified through the `/setup` route instead. |
| `/app/setup` | `/setup` | `https://sourcetrack-dashboard-staging.up.railway.app/setup` | **PASS** - Setup doctor diagnostics page verified. |
| `/developers` | `/developers` | `https://sourcetrack-dashboard-staging.up.railway.app/developers` | **PASS** - Developer integration guide verified. |
| `/developers/api` | `/developers/api` | `https://sourcetrack-dashboard-staging.up.railway.app/developers/api` | **PASS** - REST API documentation verified. |
| `/developers/tracker` | `/developers/tracker` | `https://sourcetrack-dashboard-staging.up.railway.app/developers/tracker` | **PASS** - JavaScript tracking script parameters verified. |
| `/developers/conversions` | `/developers/conversions` | `https://sourcetrack-dashboard-staging.up.railway.app/developers/conversions` | **PASS** - Conversion API guides verified. |
| `/developers/webhooks` | `/developers/webhooks` | `https://sourcetrack-dashboard-staging.up.railway.app/developers/webhooks` | **PASS** - Outbound webhooks documentation verified. |
| `/docs` | `/docs` | `https://sourcetrack-dashboard-staging.up.railway.app/docs` | **PASS** - General documentation index verified. |
| `/docs/troubleshooting` | `/docs/troubleshooting` | `https://sourcetrack-dashboard-staging.up.railway.app/docs/troubleshooting` | **PASS** - Troubleshooting guide verified. |
| `/docs/stripe` | Redirects to `/` | `https://sourcetrack-dashboard-staging.up.railway.app/` | **NOT APPLICABLE / REDIRECTED** - Legacy redirect behavior. Actual platform doc verified at `/docs/platforms/stripe`. |
| `/docs/shopify` | Redirects to `/` | `https://sourcetrack-dashboard-staging.up.railway.app/` | **NOT APPLICABLE / REDIRECTED** - Legacy redirect behavior. Actual platform doc verified at `/docs/platforms/shopify`. |
| `/docs/wordpress` | Redirects to `/` | `https://sourcetrack-dashboard-staging.up.railway.app/` | **NOT APPLICABLE / REDIRECTED** - Legacy redirect behavior. Actual platform doc verified at `/docs/platforms/wordpress`. |

---

## 4. Viewport Sizes & Modes Tested
* **Viewports:**
  1. Desktop: `1440px` (Sidebar navigation fully expanded, table grids side-by-side)
  2. Laptop: `1280px` (Standard layout views, no card clippings)
  3. Tablet: `768px` (Sidebar collapsed to hamburger, header elements stack vertically)
  4. Mobile: `390px` (Card elements stack vertically, table containers use internal scroll bounds)
* **Modes:** Light mode and Dark mode.

---

## 5. Screenshots & Evidence List
All captured staging evidence is located in the persistent artifacts folder:

* **Staging Dashboard (Initial):** [staging_dashboard_initial.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_dashboard_initial.png)
* **Staging Dashboard (Theme Toggled):** [staging_dashboard_theme_toggled.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_dashboard_theme_toggled.png)
* **Staging Dashboard (Mobile):** [staging_dashboard_mobile.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_dashboard_mobile.png)
* **Staging Analytics:** [staging_analytics.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_analytics.png)
* **Staging Attribution:** [staging_attribution.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_attribution.png)
* **Staging Setup Doctor:** [staging_setup_doctor.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_setup_doctor.png)
* **Staging Integrations (Initial):** [staging_integrations_initial.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_integrations_initial.png)
* **Staging Integrations (Light):** [staging_integrations_light.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_integrations_light.png)
* **Staging Integrations (Dark):** [staging_integrations_dark.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_integrations_dark.png)
* **Staging Report Builder:** [staging_report_builder.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_report_builder.png)
* **Staging Report Builder (Trials by Source Filter):** [staging_report_builder_trials_by_source.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_report_builder_trials_by_source.png)
* **Staging Report Builder (Mobile):** [staging_report_builder_mobile.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_report_builder_mobile.png)
* **Staging Settings:** [staging_settings.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_settings.png)
* **Staging Developers Guide Index:** [staging_developers.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_developers.png)
* **Staging Developers API:** [staging_developers_api.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_developers_api.png)
* **Staging Developers Tracker:** [staging_developers_tracker.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_developers_tracker.png)
* **Staging Developers Conversions:** [staging_developers_conversions.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_developers_conversions.png)
* **Staging Developers Webhooks:** [staging_developers_webhooks.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_developers_webhooks.png)
* **Staging Docs Landing:** [staging_docs.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_docs.png)
* **Staging Docs Troubleshooting:** [staging_docs_troubleshooting.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_docs_troubleshooting.png)
* **Staging Docs Stripe Guide:** [staging_docs_stripe.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_docs_stripe.png)
* **Staging Docs Shopify Guide:** [staging_docs_shopify.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_docs_shopify.png)
* **Staging Docs WordPress Guide:** [staging_docs_wordpress.png](file:///Users/ubaid/.gemini/antigravity/brain/6a976327-e525-4238-9b49-7f3e20053a9a/staging_docs_wordpress.png)

---

## 6. Console & Network Findings
* **Console Errors:** None. Zero React runtime warnings, console exceptions, or hydration errors occurred on routes loaded.
* **Failed Network Requests:** None. All loaded XHR/fetch requests to API routes returned `200 OK`, `304 Not Modified`, or `204 No Content` cleanly.
* **Authentication Health:** The staging browser context correctly persisted user session cookies/tokens for the test user `stripe-e2e-139j@sourcetrack.ai`.

---

## 7. Visual Verification Details

### Leads Dark Selected Row
* **Verdict: NOT VERIFIED**
* Because `/leads` displayed an empty state (0 leads), selected-row highlight (`dark:bg-[#1E2318]`) could not be verified in the browser.

### Campaigns Dark Filter/Search Wrapper
* **Verdict: NOT VERIFIED**
* Because `/campaigns` was billing-gated and redirected to `/billing`, Campaigns filters and containers were not directly verified.

### Campaigns Responsive Actions
* **Verdict: NOT VERIFIED**
* Campaigns button wrapping and responsive layouts could not be verified due to the billing gate redirect.

### Report Builder
* **Verdict: PASS**
* Root layout padding-top (`pt-1.5`) provides clean vertical breathing room. Title headings wrap correctly, and configuration controls stack cleanly on smaller viewports.

### Integrations Next-Step Pill
* **Verdict: PASS**
* The light-mode pill contrast issue has been resolved by mapping pill text to `text-st-black`. Muted info remains readable. Integrations cards clearly describe Stripe checkout features and Shopify manual webhook processes without false claims.

### Dark Mode & Token Cleanup
* **Verdict: PASS**
* Universal dark colors render correctly across `/developers` and `/docs`. Standardized token usage eliminates low-contrast muted text. Green parameters show standard `text-green-600` tags, and troubleshooting symptom warnings utilize standard `text-red-600` colors.

---

## 8. Source Icon / SourceChip Verification
* **Verdict: PARTIAL PASS**
* Brand icons (Facebook, Google, LinkedIn, ChatGPT AI Search, and fallback globe icons) were successfully verified on the Dashboard, Analytics, Attribution, and Report Builder.
* However, because `/campaigns` and `/leads` had no rows / were inaccessible, source icons and chips were not fully verified on those routes.

---

## 9. Functional E2E Results
* **Global Shell:** Sidebar routing executes cleanly. Active states update instantly. The dark/light mode toggle switches classes correctly without rendering artifacts.
* **Report Builder Metrics:** Selecting *Trials by Source* refreshes query metrics to display corresponding channels, confirming metric queries run successfully.
* **Snippet & Token Copy Actions:** Copying credentials triggers toast confirmation alerts and successfully adds the expected strings to the system clipboard.

---

## 10. Open Blockers / Recommended Fixes
* **Visual Verification Gaps:** Future QA session needs to seed lead events to test Lead row selected states and bypass/mock campaigns billing gate to verify Campaigns filter containers in the browser.
* **Paid-Beta Readiness:** **NOT READY** (Blocked by adjacent transactional email setups, production Stripe keys config, and operator account validations).
