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
* **Session 128D-B — Report Builder Two-Panel UI:** ✅ Complete. Restructured `/report-builder` into a modern two-panel layout, added compact business question presets row, unified configuration options on the left, collapsed advanced filters by default, implemented a right Preview card, and created a right-sliding Saved Reports drawer. All static and build checks pass.
* **Session 128D-B.1 — Report Builder UI Polish:** ✅ Complete. Replaced all native selects with custom styled dropdowns, supported custom N-days rolling date inputs, renamed AI Platforms to AI-assisted with helper text, and refined traffic source category filter presets grid. All static and build checks pass.
* **Session 128G — Beginner-Friendly Docs Polish & Public Consistency Audit:** ✅ Complete. Restructured user and developer docs templates, normalized endpoint terms to '/api/track', fixed blank docs page rendering, and softened public site overclaims.
* **Session 128H — Full Self-Serve Paid Beta Audit:** ✅ Complete. Audited the entire product codebase, routers, webhooks, and UI metrics. Logged all blocker/polishing issues and designed the prioritized launch plan in SELF_SERVE_PAID_BETA_AUDIT.md.
* **Session 129A — Self-Serve Server API Tokens:** ✅ Complete. Implemented secure backend integrations routes (GET, POST, DELETE /api-keys), added PostgreSQL server api_keys migrations, added plan gating with feature check, and built Settings API Tokens card with one-time copy modal and instant revocation, updating Developer API/Security documentation. All static and build checks pass.
* **Session 130 — Onboarding & Empty-State Polish:** ✅ Complete. Added a 6-step setup checklist, standalone Site Key card, platform docs links, and a precisely-worded "Send a test conversion" helper (explicitly disclaiming that it does not prove tracker install or attribution; warns about no test-data filter) to the Snippet page. Added a "Finish setting up" banner and conditional empty-state copy to the Dashboard. Added a guided no-events empty state with install steps and troubleshooting links to the Event Debugger. Added platform install guide links to the Onboarding install step. No backend changes. All static and build checks pass.
* **Session 131 — Integration Setup Hardening:** ✅ Complete. Hardened the Stripe and Shopify webhook recipe cards in Integrations.jsx with explicit event-type scope (`checkout.session.completed` only for Stripe; `orders/paid` + paid-only `orders/create` for Shopify) and stitching field guidance (`client_reference_id`/`metadata.anonymous_id` for Stripe, `note_attributes._st_aid` family for Shopify). Added an inline "Recent webhook activity" log (last 5 events, status badges, opt-in 15s polling) backed by a new read-only `GET /api/integrations/ingestion-events` endpoint. Expanded the CSV import row with a column-schema table, YYYY-MM-DD format, 1000-row cap, and inline sample CSV download. Added a public-Site-Key vs private-Server-Token auth callout and `/settings#api-tokens` deep-link from the Payments API row. Added an aggregate-data disclaimer inside the GSC card. Softened PublicIntegrations.jsx, DocsShopify, DocsGTM, and the misleading "Awaiting first automated sync" copy in Campaigns.jsx. All static and build checks pass.
* **Session 132 — Attribution Accuracy Audit:** ✅ Complete (audit-only, no code changes). Produced `SESSION_132_ATTRIBUTION_AUDIT.md` (402 lines): verdict "approved with fixes needed", overall trust score 78/100, three P0s (cookieless silent-fallback, marketing "8 models" vs engine "9" + multi-touch nightly-job surfacing, missing model badges on dashboard cards), nine P1s (direct tooltip, same-domain referrer stripping, distinct_id-only stitching, NodeCache restart loss, ai_platforms scope, sessionization UTM splits, `st_ft_ts` orphan, SPA pushState debounce, cookieless UI trade-off doc), seven P2 polish items, and a 22-row edge-case QA matrix.
* **Session 132A — Attribution Trust Surface Fixes:** ✅ Complete. Implemented the four highest-trust items from the audit. (P0-1) Cookieless tracker now logs `console.warn` on random-id fallback; Settings shows an amber trade-off callout; new `#cookieless` anchor in DocsTroubleshooting. (P0-2) Reconciled "8 attribution models" → "9" across 9 marketing pages; surfaced the API `_notice` field in Dashboard pinned report cards (ReportBuilder already did). (P0-3) Added attribution model badges to Dashboard pinned cards, ReportBuilder preview header, and Campaigns header (which is fixed to last_touch). (P1-1) New shared `DirectInfo` helper component renders a small "i" tooltip next to Direct / unknown rows in Dashboard, ReportBuilder, and Campaigns. No engine math changed. All static and build checks pass.
* **Session 132B — Attribution Accuracy Fixes:** ✅ Complete. Closed the remaining P1 accuracy items deferred from 132A. (P1-7) Same-domain referrers are now neutralized in `channel-classifier.js` before the Referral branch — `page_url` threaded through every call site (webhook, attribution-engine touchpoint helper, dashboard live aggregator, nightly job touchpoint query + first/last/30d channel calls). (P1-3) Sessionization splits on `utm_source`/`utm_medium`/`utm_campaign` or click-ID acquisition change in addition to the 30-min inactivity window — internal nav still inherits. (P1-9) Both trackers debounce auto-pageviews ~100ms; minified bundles rebuilt. (P1-8) `first_touch_timestamp` is now sent on every pageview + conversion, sanitized backend-side, captured into PostHog properties (not consumed by the engine yet — preserved as metadata). (P1-5) `/api/conversion` claims `revenue_idempotency_keys` whenever a stable `order_id` is provided — dedupe now survives process restart; NodeCache is the fast path; fail-open on DB outage. (P1-4) user_id person-level stitching verified unsafe to one-line (engine HogQL JOINs on raw `distinct_id`); deferred with honest doc wording. (P1-6) `ai_platforms` relabeled to "AI conversion source" across Dashboard + ConversionExplanationModal with copy that clearly bounds the model to the conversion event's own ai_source. All static and build checks pass.
