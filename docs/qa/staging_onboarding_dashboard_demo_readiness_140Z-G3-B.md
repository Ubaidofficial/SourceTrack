# QA Report: Staging Onboarding, Dashboard Journey, & Demo Readiness (Session 140Z-G3-B)

**Date:** 2026-06-18  
**Tested URL:** [Onboarding Page](https://sourcetrack-dashboard-staging.up.railway.app/onboarding) & [Dashboard Page](https://sourcetrack-dashboard-staging.up.railway.app/dashboard)  
**Auth Account:** `local-e2e-16june-1904@sourcetrack.ai` (Staging Supabase password reverted to a secure random string)  
**Browser / Viewport:** Chrome 149.0 / Desktop (1280x800)  
**Overall Demo-Data Readiness Verdict:** **PARTIAL**  
**Paid Beta Verdict:** **NOT READY**

---

## 1. Part A: Onboarding Browser QA

### Findings & Steps Tested
- **Connected Domain Step:** Successfully connects domain and transitions.
- **Select Business Type Step:** Successfully registers type (e.g., SaaS, eCommerce, Lead Gen).
- **Install Method & Script Steps:** Displays standard `<script>` snippet or GTM instructions with copy button.
- **Verification State:** Setup Doctor runs and successfully reports status (healthy/unhealthy).
- **Skip/Verify Later Behavior:** Accessible, but routing redirection is unstable.

### Critical UX & Technical Issues Found
- **Client-Side Routing Loop Blocker:** Authenticated users navigating to `/onboarding` with incomplete setups frequently hit a client-side navigation loop that results in a blank screen or infinite loading spinner. Bypassed only via a manual browser reload (`window.location.reload()`), which forces localStorage and `/api/onboarding/me` state alignment.
- **Wording & Technical Tone:**
  - Wording is highly technical (GTM, script injection, site keys), which could intimidate non-technical founders.
  - The promised "Takes about 5 minutes" setup copy is missing from the onboarding wizard pages (only present on pricing/docs).
  - Install verification checks are functional but lack explicit step-by-step troubleshooting suggestions inside the wizard if verification fails.

---

## 2. Part B: Dashboard View Journey QA

### Verified Flows (Click-Through)
- **Recent Conversions Table:** Renders correctly. Event rows populate when data is available.
- **Network Validation:** Checked `/api/dashboard/recent-activity` response. Confirmed that event objects include the `visitor_id` field for conversions.
- **Journey Drawer (Modal):** Clicking **"View journey"** on a conversion row opens the `JourneyModal` drawer on the right side of the screen.
- **Navigation Safety:** Opening the drawer **does not** trigger router navigation to `/leads`. The user remains on `/dashboard`.
- **Timeline Integrity:** Modal shows the exact conversion path, visitor touchpoints (first/last touch), and attribution logs.
- **Security & Masking:** Raw visitor IDs are not displayed in the dashboard table or modal titles.
- **Empty State & Null Guard:** Rows without `visitor_id` correctly render `—` in the action column and are not clickable.
- **Close Action:** Closing the drawer returns focus to the dashboard page under `/dashboard` with no URL change.
- **Tenant Isolation:** No data leakage or cross-tenant exposure was observed.

---

## 3. Part C: Dashboard/Demo-Data Readiness Audit

### Dashboard Widgets Status
- **Visitors / Conversions:** Displays correctly when data exists in PostHog staging (`Project 469905`).
- **Revenue / Pipeline:** Renders dynamically when purchase/conversion value telemetry is active.
- **Conversion Rate & Revenue per Visitor:** Calculates and displays truthfully based on active events.
- **Active Visitors / Top Sources / Campaigns:** Renders correctly.
- **AI Referrals:** ChatGPT, Claude, Gemini, and Perplexity are tracked/displayed if source fixtures match.
- **Empty State Gate:** If `attributed_conversions` is empty in Supabase, the dashboard shows a global empty state, hiding all tables, charts, and metrics.

### Staging Demo Constraints
- Staging requires a deterministic background seed script to keep demo data fresh.
- Staging PostHog project ID (`469905`) is properly isolated from production.
- **Verdict:** **PARTIAL**. The dashboard is fully functional but relies heavily on active telemetry and the nightly attribution engine (`api/jobs/nightly-attribution.js`) running. Without pre-seeded database rows, the dashboard is empty and not "demo-ready" at first glance.

---

## 4. Part D: Performance & Server-Side Triage

We analyzed the API latency and server concerns raised in previous logs:

### 1. `/api/dashboard/overview` Latency
- **Claude Log Concern:** ~15 seconds.
- **QA Measurement:** **1502ms** (1.5 seconds) on staging API.
- **Verdict:** **Refuted**. The route runs fast on staging. However, latency may degrade on larger production datasets with unindexed Postgres queries.

### 2. `/api/install/doctor` Latency
- **Claude Log Concern:** ~13 seconds.
- **QA Measurement:** **2727ms** (2.7 seconds) on staging API.
- **Verdict:** **Refuted**. It runs in under 3 seconds on staging.

### 3. HogQL 503 & Slowness (PostHog)
- The setup doctor performs 4 HogQL queries in parallel (`doctor_pageviews_30d`, `doctor_last_conversion`, `doctor_last_click_id`, `doctor_paid_params_count`).
- **Explanation:** PostHog API queries are protected by a 15-second abort controller in `api/lib/posthog.js`. Under high PostHog load, queries will timeout or return 503. The backend catches these failures and resolves to `null` to prevent endpoint crashes, which degrades the UI diagnosis quality but keeps the app alive.

### 4. Rate Limiter trust proxy warning
- **Warning:** `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`
- **Verdict:** **Verified**. `api/index.js` does not execute `app.set('trust proxy', true)`. Since the app runs behind Railway's load balancer, the express-rate-limit middleware receives the proxy IP instead of the client IP, throwing console warnings and potentially blocking legitimate traffic.

---

## 5. Part E: Brutal Product Verdict

- **Does onboarding feel simple enough for a non-technical founder?**  
  **No.** The client-side routing loop is a hard blocker. Wording is too technical, and there is no guidance on where to copy-paste the snippet if they use popular platforms like Webflow or Shopify inside the onboarding wizard itself.
- **Does the dashboard explain "which sources actually make you money" within 5 seconds?**  
  **Yes**, provided there is data. The "Top Sources" and "Recent Conversions" tables make it instantly clear where conversions originate.
- **Does staging look demo-ready?**  
  **No.** Staging dashboard appears empty out-of-the-box until events are fired and the nightly attribution runner is triggered. It requires a permanent seed mode.
- **Does it feel lighter than PostHog/Usermaven/Cometly?**  
  **Yes.** It is clean, focused solely on revenue attribution, and has zero bloated configuration panels.
- **Does it feel more attribution-focused than DataFast?**  
  **Yes.** The visitor journey modal maps out full-funnel multi-touch pathways rather than just simple analytics cards.
- **Would a founder/CMO trust this enough to pay?**  
  **Not yet.** The routing bugs and empty staging states undermine the polished feel of the dashboard.
- **Single Biggest Blocker:** Onboarding client-side routing loop bug.

---

## 6. Staging Data / Account Mutations Performed

- **Staging-Only Test Account:** The staging-only test account `local-e2e-16june-1904@sourcetrack.ai` was used for browser QA and API diagnostics. Its password was temporarily rotated to facilitate access and has been successfully reverted/randomized to a secure random string after completion of the QA session.
- **Temporary Scripts:** All temporary measurement and maintenance scripts created in the workspace (including `scripts/measure_overview_time.js`, `scripts/measure_doctor_time.js`, `scripts/print_401_body.js`, `scripts/get_attributed_conversions_columns.js`, and `scripts/revert_password.js`) have been fully deleted and removed.
- **Mock Events Ingestion:** Mock pageview and conversion events were sent to the staging environment only.
- **Nightly Attribution Runner:** A manual nightly attribution job (`api/jobs/nightly-attribution.js`) execution was run against staging PostHog project `469905` to generate data for verification.
- **Production Safeguards:** No production data was touched, and no live Stripe actions were performed.
- **Cleanup Status:** Seeded/mock events and the test site created during onboarding remain in the staging database and staging PostHog project `469905` as they are useful for QA and demo-readiness verification. Staging is completely isolated from production.
- **Demo Readiness State:** This report does not make staging demo-ready; it proves that the demo readiness of the staging setup is **PARTIAL**.
- **Follow-up Requirement:** A follow-up session is required to automate deterministic staging seed routines.
- **Paid Beta Verdict:** Paid beta remains **NOT READY**.

---

## 7. Recommended Next Steps

1. **Fix Onboarding Redirection:** Resolve the React routing loop when retrieving incomplete onboarding site states.
2. **Enable Backend Trust Proxy:** Add `app.set('trust proxy', true)` in `api/index.js` to fix the rate limiter client IP identification issue.
3. **Staging Seeding Automation:** Write a routine staging seed job to keep demo data fresh and active.
