# SourceTrack Paid Beta Session Plan

## 1. Revised Session Order

* **Session 102.1:** Snippet Installation Verification Assistant
* **Session 102.2:** SourceTrack Doctor & Tracking Health Alerts
* **Session 102.3:** Conversion Deduplication UI Visibility
* **Session 102.4:** Agency Layout client/site Switcher Dropdown
* **Session 102.5:** Server-Side Plan Feature Gate Middleware
* **Session 102.6:** Export & Share Scope Security Hardening
* **Session 102.7:** Public Docs & Ingest Domain Cleanup

---

## 2. Why the Order Changed

The session order was re-prioritized to address the **Attribution and Tracking Trust Chain** first:
1. **Verify Ingestion:** If onboarding verification is broken or fails, a user cannot complete onboarding self-serve.
2. **Monitor Health:** Once the script is verified, users must be immediately alerted if it goes silent (SourceTrack Doctor).
3. **Establish Trust:** Showing deduplicated conversions verifies tracking accuracy and blocks double-counting.
4. **Scale Usability:** The site switcher, gates, export security, and doc cleanups follow once core pixel telemetry is verified and trusted.

---

## 3. Session-by-Session Specification

### Session 102.1 — Snippet Installation Verification Assistant
* **Goal:** Implement a direct checking endpoint that listens to custom client-routed verification events instead of relying on external third-party script detection during onboarding.
* **Files likely involved:**
  - `api/routes/install.js` (backend verifier router)
  - `dashboard/src/pages/Onboarding.jsx` (onboarding poll handler)
* **Validation commands:**
  - `node --check api/routes/install.js`
* **What not to touch:** Do not alter PostHog keys, auth middleware, or stepper navigation layout.
* **Paid beta blocker:** Yes.
* **Public launch blocker:** Yes.

---

### Session 102.2 — SourceTrack Doctor & Tracking Health Alerts
* **Goal:** Create a daily crontab script that scans active sites. If a site has seen zero events in the last 48 hours, it automatically logs a high-severity "Tracking Offline" alert to display on their dashboard.
* **Files likely involved:**
  - `api/jobs/health-agent.js` (new crontab file)
  - `api/routes/dashboard.js` (enrich dashboard alerts object)
* **Validation commands:**
  - `node --check api/routes/dashboard.js api/jobs/health-agent.js`
* **What not to touch:** Do not touch attribution engine SQL queries or manual spend inputs.
* **Paid beta blocker:** Yes.
* **Public launch blocker:** Yes.

---

### Session 102.3 — Conversion Deduplication UI Visibility
* **Goal:** Expose the count of duplicate/deduplicated conversion events blocked by the in-memory cache directly on the Event Debugger page.
* **Files likely involved:**
  - `dashboard/src/pages/EventDebugger.jsx` (frontend count pill)
  - `api/routes/events.js` (return deduplicate counter metadata)
* **Validation commands:**
  - `cd dashboard && npm run build`
  - `node --check api/routes/events.js`
* **What not to touch:** Do not change the standard conversion routing, CAPI sync queues, or webhook structures.
* **Paid beta blocker:** No.
* **Public launch blocker:** Yes.

---

### Session 102.4 — Agency Layout Client/Site Switcher Dropdown
* **Goal:** Replace the hardcoded single-site query in the Layout component with a dropdown site selector populated by the user's workspace sites.
* **Files likely involved:**
  - `dashboard/src/components/Layout.jsx` (fetch and select active site)
  - `dashboard/src/pages/Dashboard.jsx` (listen to switcher state change)
* **Validation commands:**
  - `cd dashboard && npm run build`
* **What not to touch:** Do not modify company member roles or Stripe user schemas.
* **Paid beta blocker:** Yes (Agencies cannot pay without client switching).
* **Public launch blocker:** Yes.

---

### Session 102.5 — Server-Side Plan Feature Gate Middleware
* **Goal:** Build backend middleware to restrict access to W-shaped/U-shaped multi-touch attribution reports and CSV export streams if the site's database plan is `free`.
* **Files likely involved:**
  - `api/middleware/tier-check.js` (new check middleware)
  - `api/routes/attribution.js` (apply gate on routes)
  - `api/routes/export.js` (apply gate on CSV streams)
* **Validation commands:**
  - `node --check api/middleware/tier-check.js api/routes/attribution.js api/routes/export.js`
* **What not to touch:** Do not edit user billing signup flow or checkout redirections.
* **Paid beta blocker:** No.
* **Public launch blocker:** Yes.

---

### Session 102.6 — Export & Share Scope Security Hardening
* **Goal:** Audit and secure CSV downloads and public shared link tokens, verifying they cannot be utilized to leak cross-customer metrics.
* **Files likely involved:**
  - `api/routes/export.js` (scope site parameters)
  - `api/routes/public-dashboard.js` (validate token scope)
* **Validation commands:**
  - `node --check api/routes/export.js api/routes/public-dashboard.js`
* **What not to touch:** Do not edit public layout files or theme contexts.
* **Paid beta blocker:** Yes (security risk).
* **Public launch blocker:** Yes.

---

### Session 102.7 — Public Docs & Ingest Domain Cleanup
* **Goal:** Clean up remaining domain mismatches, ensuring all public docs and configuration copies refer cleanly to `api.srctk.com` and `app.sourcetrack.ai`.
* **Files likely involved:**
  - `dashboard/src/pages/Docs.jsx` (verification check)
  - `dashboard/src/pages/Snippet.jsx` (verification check)
* **Validation commands:**
  - `cd dashboard && npm run build`
* **What not to touch:** Do not touch the minified loader outputs or tracker scripts.
* **Paid beta blocker:** No.
* **Public launch blocker:** Yes.

---

## 4. Current Progress & Status

* **Session 119B — Launch Audit Fixes:** ✅ Complete. Added encryption key in example env, removed IP address logging from payments API PostHog properties, and softened CAPI marketing claims in README. Verified all checks pass.
* **Session 118E — Shopify Order Webhook Sync:** ✅ Complete. Built secure Shopify order webhook receiver with signature validation, database idempotency, normalization without PII, and storefront stitching. Added Integrations UI configurations and Help Docs.
* **Session 118D — Payments API Hardening + Docs:** ✅ Complete. Hardened offline conversion API routes, validated values and currency, supported unattributed conversions, sanitised PII, added UI settings card and developer docs, and built verification script.
* **Session 118C — Stripe Webhook Ingestion Sync:** ✅ Complete. Stripe raw-body webhook signature verification, decrypted secrets, claimed database idempotency keys, captured PostHog conversions, logged events, built Stripe integrations UI & docs.
* **Session 118B — Revenue Ingestion Foundation / Durable Idempotency + Secret Handling:** ✅ Complete. SQL migration for idempotency, ingestion events, and credential tables. Symmetric GCM encryption helpers. SHA-256 API key hashing. Fail-fast startup checks. Verification script.
* **Session 118A — Audit + Plan for Revenue Ingestion:** ✅ Complete. Audited conversion, webhook, and pixel endpoints. Created comprehensive roadmap and security analysis in revenue_ingestion_audit.md. Checked codebase with static launch check.
* **Session 116B — Path Exclusions:** ✅ Complete. Added database schema migration, server-side path matching logic, cached site context updates, settings patch route, standard and cookieless tracker dynamic exclusions, minification, and dashboard configurations. All static and runtime checks pass.
* **Session 128D-A — Core Report Builder & AI Sources Tab:** ✅ Complete. Removed AI Analytics from the sidebar; added a lightweight AI Sources tab to the Analytics page; fixed a ClickHouse column-name mismatch bug for the `browser` dimension mapping (`properties.browser_name`); fixed the `conversion_type` filter mapping bug in the attribution engine; and added four preset AI templates to the Report Builder quick presets selector. All static and build checks pass.
