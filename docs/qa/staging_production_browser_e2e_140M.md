# QA Report — Staging & Production Browser E2E Deployment QA

Comprehensive post-deployment verification for Session 140M, verifying the relocated Tracking Doctor diagnostics under `/setup`, redirects, sidebar navigation, and marketing pages.

## 1. Scope & Execution Info

* **Session**: Session 140M — Staging + Production Browser E2E Deployment QA
* **Staging App tested URL**: `https://sourcetrack-dashboard-staging.up.railway.app`
* **Production Marketing tested URLs**: `https://sourcetrack.ai`, `https://www.sourcetrack.ai`
* **Production App tested URL**: `https://app.sourcetrack.ai`
* **Test Environment**: Chrome DevTools MCP attached Browser Viewport
* **Date**: 2026-06-16
* **Latest main branch commit checked**: `e599c12` ("Update staging verification status to PASS in QA report")
* **GitHub Actions CI Status**: `completed success` (Run `27579657068`)
* **Railway Deployment Status**: Staging and Production both success, latest deploys finalized.

---

## 2. Staging E2E QA Results (`https://sourcetrack-dashboard-staging.up.railway.app`)

* **Session Status**: Authenticated session active.
* **Sidebar Order**: Verified Setup is the first sidebar item.
* **Setup Navigation Dot**: Safety badge displays correctly (non-polling, cached `staleTime: 30000`).
* **Dashboard Warning Banner**: TrackingDoctorCard is successfully removed. Since the staging site has already completed onboarding, no banner renders.
* **`/setup` Page**: Renders the new split-panel checklist page layout.
* **Install Tab**: Displayed by default. Registered domain is visible, copy snippet works, platform guides resolve.
* **Tracking Health Tab**: Successfully clicks and loads the `SetupDoctorCard` and test conversions launcher.
* **Conversions Tab**: Successfully loads and lists the Stripe "Test Mode Beta" guidelines and Shopify "Manual Webhook" instructions. No unverified sync claims exist.
* **Learn Tab**: Links cleanly to UTM parameter guide, Report Builder, Google Ads, and troubleshooting pages.
* **`/snippet` Redirect**: Accessing `/snippet` redirects cleanly to `/setup`.
* **Console Health**: Zero route-breaking errors or exceptions.
* **Network Health**: Query `/api/install/doctor` is loaded exactly once and cached cleanly.
* **Responsive Verifications (1440, 1024, 768, 390)**:
  * **1440px**: Perfect side-by-side split grid.
  * **1024px**: Clean tablet landscape layouts.
  * **768px**: Checklist stacks on top of active tabs cleanly.
  * **390px**: Compact button lists, code blocks wrap correctly.

---

## 3. Production Public Site QA Results (`https://sourcetrack.ai` & `https://www.sourcetrack.ai`)

* **Page Loading**: Verified. Page loads successfully returning title:
  `SourceTrack — Revenue Attribution Analytics for SaaS, Lead Gen, and Agencies`
* **Console Health**: Verified clean console logs.
* **Network Health**: All public assets and scripts load cleanly, no network failures.
* **Isolation**: Production landing pages are fully isolated and unaffected by dashboard setup page routing changes.

---

## 4. Production App QA Results (`https://app.sourcetrack.ai`)

### Unauthenticated Checks
* **`/login` loads**: Verified. Loads cleanly returning title: `Log in to SourceTrack | SourceTrack`.
* **`/setup` redirect**: Accessing `/setup` cleanly redirects to `/login`.
* **`/snippet` redirect**: Accessing `/snippet` redirects to `/setup`, then safely routes to `/login`.
* **`/dashboard` redirect**: Accessing `/dashboard` cleanly redirects to `/login`.
* **Console findings**: Clean logs, no exceptions.

### Authenticated Checks
* **Status**: `AUTHENTICATED PRODUCTION APP QA BLOCKED — no production test session/credentials available.`

---

## 5. Visual Evidence & Screenshots
Staged screenshots saved locally:
- Staging Dashboard: [140M_staging_dashboard.png](file:///Users/ubaid/.gemini/antigravity/brain/be38c3b9-4ab2-4775-a634-b95a156b0d7e/140M_staging_dashboard.png)
- Setup Install Tab: [140M_staging_setup_install.png](file:///Users/ubaid/.gemini/antigravity/brain/be38c3b9-4ab2-4775-a634-b95a156b0d7e/140M_staging_setup_install.png)
- Setup Health Tab: [140M_staging_setup_health.png](file:///Users/ubaid/.gemini/antigravity/brain/be38c3b9-4ab2-4775-a634-b95a156b0d7e/140M_staging_setup_health.png)
- Setup Conversions Tab: [140M_staging_setup_conversions.png](file:///Users/ubaid/.gemini/antigravity/brain/be38c3b9-4ab2-4775-a634-b95a156b0d7e/140M_staging_setup_conversions.png)
- Setup Learn Tab: [140M_staging_setup_learn.png](file:///Users/ubaid/.gemini/antigravity/brain/be38c3b9-4ab2-4775-a634-b95a156b0d7e/140M_staging_setup_learn.png)
- Setup 1024px View: [140M_staging_setup_1024.png](file:///Users/ubaid/.gemini/antigravity/brain/be38c3b9-4ab2-4775-a634-b95a156b0d7e/140M_staging_setup_1024.png)
- Setup 768px View: [140M_staging_setup_768.png](file:///Users/ubaid/.gemini/antigravity/brain/be38c3b9-4ab2-4775-a634-b95a156b0d7e/140M_staging_setup_768.png)
- Setup 390px View: [140M_staging_setup_390.png](file:///Users/ubaid/.gemini/antigravity/brain/be38c3b9-4ab2-4775-a634-b95a156b0d7e/140M_staging_setup_390.png)
- Production Marketing Page: [140M_production_marketing.png](file:///Users/ubaid/.gemini/antigravity/brain/be38c3b9-4ab2-4775-a634-b95a156b0d7e/140M_production_marketing.png)

---

## 6. Bugs & Issues Found
* **None**. Staging + Production deployments are fully healthy and verify cleanly.

---

### Status: PASS
Paid beta features remain **NOT READY**.
