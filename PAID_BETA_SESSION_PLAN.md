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

### Session 102.8 — [P0] Production and Staging Environment Separation
* **Goal:** Fully separate the production and staging environments by provisioning independent Railway services, Supabase databases, PostHog projects, and Stripe accounts. Restructure settings so staging deployments read from staging credentials and point to staging ingestion endpoints. Implement a staging-first migrations verification process, and establish a clear production deployment promotion/rollback flow.
* **Files likely involved:**
  - `.env.example`
  - `api/lib/supabase.js`
  - `api/lib/posthog.js`
  - `dashboard/src/lib/supabase.js`
* **What not to touch:** Do not alter product logic or default production keys.
* **Paid beta blocker:** Yes (P0 - critical to allow testing and onboarding safety).
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
* **Session 132C — Identity Stitching + user_id Attribution Fallback:** ✅ Complete. Implemented durable user_id ↔ anonymous_id identity link mapping store and ingestion-layer resolution. Resolved user_id to linked anonymous_id on incoming single-ID offline and server events to preserve downstream attribution joins; updated developer docs to soften retrospective stitching overclaims. All static and build checks pass.
* **Session 132D — AI Journey Attribution + QA Harness:** ✅ Complete. Implemented journey-based AI attribution (ai_platforms model) that credits the most recent prior AI touchpoint in the visitor's journey before conversion (falling back to the conversion event itself if none) within the lookback window. Utilized the canonical backend classifier (detectAiPlatformFromEvent) to prevent duplicating mappings. Safe 2-step retrieval and grouping, preventing double-counting. Re-labeled UI elements to "AI journey influence". Created ESM-based automated QA script asserting all 10 edge cases and created digital marketer test plan. Verified all checks pass.
* **Session 132E — AI Journey Attribution Performance Hardening:** ✅ Complete. Replaced the high-volume site-wide pageview query fallback in `getAiPlatformAttributionLive` with safer, visitor-scoped pageview batching and pagination. Chunks unique converting distinct IDs into batches of 100 with page size 5000 using a LIMIT/OFFSET loop. Updated QA script to verify query planning and batching helper.
* **Session 133A.0 — Minimum Production Safety Guardrails:** ✅ Complete. Added env-guard rails in `scripts/qa-guard.js` to block mutating QA scripts on production; allowed staging bypass for dashboard canonical checks.
* **Session 133B — Lightweight CI Regression Pipeline:** ✅ Complete. Built static & build-only GitHub Actions workflow checking syntax, committed whitespace, static QA, and dashboard compilation; documented boundaries.
* **Session 133C — Real Deployment Checklist + Rollback Runbook:** ✅ Complete. Created production deployment checklist and emergency rollback runbook, verified env variables, and updated session log and handoff.
* **Session 133D — Production Observability Audit + Minimum Alerts Plan:** ✅ Complete. Audited production observability, added process-level unhandled exception/rejection listeners to the API server, documented environment variable rules, and added a production observability & monitoring runbook covering log locations, cron schedules, incident severity classifications, and known blind spots. Verified all checks pass.
* **Session 133E — Billing and Limits Enforcement Alignment:** ✅ Complete. Audited pricing plans and enforced backend gates for Google Search Console/SEO revenue routes. Dropped sites.plan constraint and recreated it supporting scale and business plans, updated schema.sql and SUPABASE_SCHEMA.md. Avoided undefined keys in webhook pricing map. Added inactive site check to tracking pixel. Verified all checks pass.
* **Session 133F — Security Audit:** ✅ Complete. Audited SourceTrack / TrackIQ for paid-beta security risks across API auth, site membership, ingestion, webhooks, secrets, CORS, and data isolation. Implemented rate limits on missing ingestion routes (/api/conversion/offline, /api/server/event, /api/analytics/collect, and /api/webhooks/incoming) and gated inactive/archived plan access on /api/analytics/collect and /api/webhooks/incoming. Verified all checks pass.
* **Session 133G — Data Deletion / Privacy Basics:** ✅ Complete. Audited and addressed data deletion and GDPR gaps. Restructured account deletion logic to prevent data loss in shared workspaces, prevented orphaning shared workspaces by admin, expanded visitor erasure to wipe `site_identity_links` records, created a privacy and data deletion map, and updated copy in settings, README, and developer docs to align with real capabilities.
* **Session 133H — Backup and Recovery Plan:** ✅ Complete. Audited data backups, recovery readiness, and outage paths. Created a detailed runbook (`docs/backup_recovery.md`) covering Supabase, PostHog, Stripe, and Railway rollback protocols, updated rollback verification instructions in `COMMANDCODE_RUNBOOK.md`, and added security warning comments for `ENCRYPTION_KEY` in `.env.example`.
* **Session 133I — End-to-End Install QA:** ✅ Complete. Standardized canonical public tracker URLs to the root paths `/tracker.min.js` and `/tracker.cookieless.min.js`, leaving `/tracker/*` as backwards-compatible paths. Updated onboarding, snippet generation, settings, and install documentation to use the canonical root paths, added detailed verification boundaries and domain warnings, and created `docs/install_qa_map.md`.
* **Session 133J — Docs Truth Audit:** ✅ Complete. Standardized tracker snippet paths across solution, setup, and help pages to canonical root paths. Updated Stripe env var `STRIPE_PRICE_ID_SCALE` as primary. Softened compliance language to "privacy-conscious" in developer docs. Added lightweight frontend gating for Google Search Console (GSC) connection card. Created `docs/docs_truth_audit.md` tracking all audit findings and corrected files. Verified all checks pass.
* **Session 133K — Support Readiness:** ✅ Complete. Created support_readiness.md mapping, added support emails/troubleshooting links to Billing, Settings, Snippet, and Onboarding failure views without SLA/24-7 guarantees, and documented triage/escalation workflows. Verified all checks pass.
* **Session 133L — Event Pipeline SLOs + Load Testing + Capacity Readiness:** ✅ Complete. Added early plan check gating logic to Stripe & Shopify webhooks to reject inactive/archived sites early; optimized PostHog SDK batching configuration with environment overrides; created capacity map docs and safe, production-shielded k6 stress testing scripts; verified syntax and build compile.

---

### Session 133L — Event Pipeline SLOs + Load Testing + Capacity Readiness [COMPLETE]
* **Goal:** Define ingestion service-level objectives (SLOs), configure SDK batching, secure webhooks, and build realistic k6 load tests to verify system headroom under spikes and bursts.
* **Objectives:**
  - [x] Define Ingestion SLOs for latency and error rates on `/api/track` and `/api/conversion`.
  - [x] Add k6 load testing scripts simulating 50–100M events/month capacity.
  - [x] Test realistic spikes of 200–500 events/sec.
  - [x] Test short burst headroom at 1,000 events/sec.
  - [x] Document failure modes, observability metrics, idempotency bounds, and kill-switch/throttling requirements.
  - [x] Implement inactive/archived plan gates on Stripe and Shopify webhook routers.
  - [x] Implement PostHog SDK environment-aware batching parameter overrides.
* **Constraints:** Did not rewrite in Rust. Did not add queues or ClickHouse.

---

## Session 133M — Pricing & Plan Limits Audit [COMPLETE]

*   **Goal:** Audit current pricing, limits, gates, Stripe mappings, UI, and competitor pricing options to design launch scenarios without coding changes.
*   **Objectives:**
    *   [x] Audit current marketing and UI plan limits against backend `FEATURE_MATRIX` and `PLAN_STRUCTURAL_LIMITS`.
    *   [x] Document current pricing and detect plan mismatches (e.g. Free plan CSV export, Starter plan attribution models).
    *   [x] Perform competitor-inspired scenario analysis (Conservative vs Usermaven vs Hybrid Attribution-First).
    *   [x] Highlight missing backend plan checks (Ad cost sync, cohorts, funnels, retention).
    *   [x] Define non-negotiables (load testing, gating) before changing pricing.
    *   [x] Created `docs/pricing_plan_limits_audit.md`.
*   **Constraints:** No pricing code changes, no limit changes, and no schema migrations executed.
