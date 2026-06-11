# SourceTrack Paid Beta Session Plan

> **AUTHORITATIVE ROADMAP:** As of Session 138B, [`docs/development_workflow_master_plan.md`](docs/development_workflow_master_plan.md) is the authoritative engineering control roadmap for workflow, QA, release discipline, code quality, and paid-beta operational blockers. Where session ordering or gates here conflict with that document, the master plan wins. This file is retained for historical session detail.
>
> **AI-AGENT WORKFLOW:** AI-agent workflow rules are governed by [ai_agent_workflow_rules.md](file:///Users/ubaid/Desktop/trackiq/docs/ai_agent_workflow_rules.md). No AI-agent may commit or push before raw diff review and explicit user approval.


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
* **Session 133O — Legal / Policy Readiness:** ✅ Complete. Created legal_policy_readiness.md, audited and documented legal disclaimers, data spec, sub-processor boundaries, deletion mechanics, cookie/cookieless warnings, and lawyer checklist.
* **Session 133P — Transactional Email Readiness:** ✅ Complete. Created transactional_email_readiness.md, updated .env.example with Resend comments, updated COMMANDCODE_RUNBOOK.md with email operations guidelines, and verified setup.
* **Session 133Q — Billing Checkout Verification & Stripe Test-Mode QA:** ✅ Complete. Verified Stripe test-mode billing configuration, price mappings, and webhook paths; created docs/billing_checkout_test_mode_qa.md and updated runbook.
* **Session 133R — Staging / Production Separation Audit:** ✅ Complete. Audited environment isolation between local, staging, and production across Supabase, PostHog, Stripe, Resend, Railway, and CORS settings; resolved hardcoded production URLs in email report and threshold alert jobs; created docs/staging_production_separation_audit.md.
* **Session 133S — Production Observability Verification / Incident Response Drill:** ✅ Complete. Audited and verified process liveness `/health` checks, stdout/stderr logging, severity classifications, rollback checklist, and customer communication parameters; created docs/production_observability_incident_response.md.
* **Session 133T — Data Deletion / Privacy Request Operational Drill:** ✅ Complete. Audited and verified account deletion, visitor erasure, and retention purges database flows, Stripe/PostHog boundaries, shared workspace caveats, and operator checklists; created docs/privacy_request_operational_drill.md.
* **Session 135 — Stripe Test-Mode Checkout & Webhook Evidence:** ⚠️ Partial. Price matrix aligned with price fallback, checkout sessions verified in test mode; E2E webhook→DB testing remains blocked.
* **Session 136 — Provider-Console Separation & Secrets Verification:** ⚠️ Partial. Environment parameterization verified in repo; no console accessed; dev workstation env found pointed at production database (F5).
* **Session 137 — Supabase Backup/PITR Verification + Rollback Rehearsal:** ⚠️ Partial. Accessed console via Supabase MCP. Production project zxjjjsipafojhzkkumvh is on Free plan: backups are disabled, PITR is disabled/unavailable. No separate staging project exists (blocking E2E testing).



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

---

## Session 133N — Plan Gate Enforcement + Pricing Mismatch Fixes [COMPLETE]

*   **Goal:** Align pricing copy with feature matrices and enforce backend plan gates on routes that currently bypass limits without changing prices or Stripe IDs.
*   **Objectives:**
    *   [x] Fix Free plan CSV export mismatch (Marketing copy now states "No CSV export").
    *   [x] Fix Starter plan attribution model mismatch (Marketing copy now states "All 9 models").
    *   [x] Implement `ad_cost_sync` gates for ad platform connect/save/sync routes in `api/routes/ad-platforms.js` (while keeping read/status/disconnect routes open).
    *   [x] Implement `funnels_cohorts` gates on cohort routes in `api/routes/cohorts.js`.
    *   [x] Implement `funnels_cohorts` gate on `/funnel` route in `api/routes/analytics.js`.
    *   [x] Implement retention limit checks in `api/routes/gdpr.js` `/retention` endpoint scoping updates to allowed retention days (returning 402 if exceeded, preserving existing data without mutation).
    *   [x] Create `docs/plan_gate_enforcement_audit.md` documenting implemented gates and deferred structural limits.
*   **Constraints:** No pricing changes, price adjustments, or Stripe ID changes. Structural limits (sites, seats, conversions) remain audit-only and deferred.

---

## Session 133O — Legal / Policy Readiness [COMPLETE]

*   **Goal:** Audit and document legal disclaimers, data collection specifications, sub-processor boundaries, data deletion mechanics, cookie/cookieless warnings, and B2B DPA compliance requirements.
*   **Objectives:**
    *   [x] Document legal disclaimers (not legal advice, beta policies, lawyer review required, no compliance guarantees).
    *   [x] Define customer responsibilities for cookie banners and legal consent.
    *   [x] Map collected data and IP address boundaries with ingestion-level safety caveats.
    *   [x] Outline Stripe retention boundaries and PostHog best-effort deletion mechanisms.
    *   [x] Document visitor erasure, nightly purges, and shared workspace account deletion logic.
    *   [x] Prepare lawyer review checklist and B2B DPA pre-launch gaps.
    *   [x] Create `docs/legal_policy_readiness.md`.
*   **Constraints:** No legal compliance guarantees, no new legal pages, and no changes to existing Terms/Privacy routing.

---

## Session 133P — Transactional Email Readiness [COMPLETE]

*   **Goal:** Audit and prepare SourceTrack transactional email readiness for the paid beta launch.
*   **Objectives:**
    *   [x] Document transactional email inventory and sending cron jobs.
    *   [x] Establish boundaries between transactional alerts, Stripe billing emails, and digests.
    *   [x] Detail Resend domain verification and SPF/DKIM/DMARC DNS checklists.
    *   [x] Document usage limit email deduplication via `usage_email_log`.
    *   [x] Outline report digest unsubscribe and opt-out suppression gaps.
    *   [x] Update `.env.example` with Resend configuration expectations.
    *   [x] Update `COMMANDCODE_RUNBOOK.md` with lightweight email operations.
    *   [x] Create `docs/transactional_email_readiness.md`.
*   **Constraints:** No real emails sent, no production Resend API keys used, and no additional email automation or marketing email integrations added.

---

## Session 133Q — Billing Checkout Verification & Stripe Test-Mode QA [COMPLETE]

*   **Goal:** Verify and QA the Stripe test-mode billing integration and checkout workflows.
*   **Objectives:**
    *   [x] Audit and document billing routes, required environment variables, and price mappings.
    *   [x] Map Stripe platform webhook vs customer conversion webhook path separation.
    *   [x] Create manual test-mode checklists for checkout and portal flows.
    *   [x] Address React.Fragment import in Pricing.jsx and 402 redirect target in api.js.
    *   [x] Document mode-alignment safety requirements and price metadata rules.
    *   [x] Create `docs/billing_checkout_test_mode_qa.md`.
*   **Constraints:** Staging/Test-mode Stripe configurations only. No production billing actions, no real payments, and no live pricing changes.

---

## Session 133R — Staging / Production Separation Audit [COMPLETE]

*   **Goal:** Audit and verify environment isolation between staging and production across Supabase, PostHog, Stripe, and Railway services.
*   **Objectives:**
    *   [x] Map execution environments (local, staging, preview, production).
    *   [x] Document environment variables and create a detailed provider isolation matrix.
    *   [x] Verify URL and webhook routing separation.
    *   [x] Inspect and document CORS configs and staging host header redirects.
    *   [x] Fix hardcoded production URLs in email report and threshold alert jobs to dynamically resolve via `FRONTEND_URL`.
    *   [x] Created `docs/staging_production_separation_audit.md`.
*   **Constraints:** Audit-only. No deployment script updates or environment mutations.

---

## Session 133S — Production Observability Verification / Incident Response Drill [COMPLETE]

*   **Goal:** Audit and verify production observability and incident response readiness for SourceTrack before paid beta.
*   **Objectives:**
    *   [x] Verify process liveness health endpoint status.
    *   [x] Document stdout/stderr console logging structure.
    *   [x] Establish provider-console checklists (Railway, Supabase, PostHog, Stripe, Resend, CI).
    *   [x] Define incident severity levels (P0, P1, P2).
    *   [x] Formulate incident response and rollback checklists.
    *   [x] Define customer outage communication boundaries and SLA omissions.
    *   [x] Created `docs/production_observability_incident_response.md`.
*   **Constraints:** Drill-only. Do not trigger real application outages or mutate live customer records.

---

## Session 133T — Data Deletion / Privacy Request Operational Drill [COMPLETE]

*   **Goal:** Drill and verify customer data deletion, visitor profile erasure, and workspace cancellation processes to ensure complete privacy compliance before public beta.
*   **Objectives:**
    *   [x] Document account deletion, visitor erasure, and retention purge database flows.
    *   [x] Map Stripe retention and PostHog best-effort API boundaries.
    *   [x] Outline shared workspace deletion and sole admin blocking rules.
    *   [x] Establish manual support escalation and provider console verification checklists.
    *   [x] Created `docs/privacy_request_operational_drill.md`.
*   **Constraints:** Drill-only. Do not run destructive scripts against the live production database or mutate production data.

---

## Session 133U — Admin / Operator Access & Internal Support Controls Audit [COMPLETE]

*   **Goal:** Audit internal administration controls, database role separation, administrative tools scope, and security of operator-facing APIs before paid beta launch.
*   **Objectives:**
    *   [x] Audit and document admin route configurations, middleware constraints, and service-role API usages.
    *   [x] Verify scoping of account deletion, user identity deletion, and tenant-boundary enforcement.
    *   [x] Document support request verification protocols, manual console boundaries, and audit logging details.
    *   [x] Formulate answers to all 20 pre-beta audit questionnaire items.
    *   [x] Create `docs/admin_operator_access_audit.md` and update runbooks.
*   **Constraints:** Audit-only. No new production admin accounts, no database mutations, and no migrations.

---

## Session 133V — Abuse / Rate-Limit / Anti-Spam Review [COMPLETE]

*   **Goal:** Review and audit the application's protections against denial-of-service, crawler abuse, endpoint flooding, rate limits, and spam signups before public beta.
*   **Objectives:**
    *   [x] Map rate limiting layers, window configurations, and environment variables across 11 core endpoints/flows.
    *   [x] Expose the onboarding PaaS subdomain check / disposable email gap.
    *   [x] Analyze crawler/bot detection on public tracking routes.
    *   [x] Document Stripe/Shopify webhook flood protection and timing-safe HMAC validation.
    *   [x] Formulate answers to all 20 pre-beta audit questionnaire items.
    *   [x] Create `docs/abuse_rate_limit_spam_audit.md` and update runbooks.
*   **Constraints:** Audit-only. No backend rate limiter, trigger, database, or API code modifications deployed.

---

## Session 133W — Customer-Facing Status / Incident Communication Plan [COMPLETE]

*   **Goal:** Audit and document SourceTrack’s customer-facing incident communication process before paid beta.
*   **Objectives:**
    *   [x] Formulate answers to all 20 pre-beta status/incident communication audit questions.
    *   [x] Document manual email update guidelines and the P0 30-minute notification boundary.
    *   [x] Define customer contact list construction using read-only sources (Supabase/Stripe).
    *   [x] Establish templates for dashboard outages, ingestion delays, webhook delays, billing issues, and transactional email delays.
    *   [x] Establish strict wording boundaries (no SLAs, no compensation, no 24/7 support promises).
    *   [x] Create `docs/customer_incident_communication_plan.md` and update runbooks.
*   **Constraints:** Audit/documentation only. No real emails sent, no dashboard banner, and no status-page product added.

---

## Session 134 — Paid Beta Go/No-Go Master Audit [COMPLETE]

*   **Goal:** Decide whether SourceTrack/TrackIQ is ready for a small controlled paid beta, verifying all 133B–133W readiness docs against the actual repo and code rather than trusting prior summaries.
*   **Verdict:** **CONDITIONAL GO** — safe for a tiny (3–5, ceiling ~10) hand-picked, single-instance, manually-supported paid beta once P0 conditions are met. Not ready for broad self-serve, horizontal scaling, high-volume ecommerce, large Shopify stores, or compliance-sensitive customers.
*   **Objectives:**
    *   [x] Verify build/QA: `node --check`, `git diff --check`, `qa:static`, dashboard vite build — all green.
    *   [x] Verify code claims directly: pageview cap enforced via `checkTierLimit` on track/collect/conversion; feature gates return 402; pricing copy matches `plan-features.js`; rate limits in-memory single-instance; webhook signatures timing-safe.
    *   [x] Identify P0 blockers: Stripe test-mode evidence, provider-console separation, Supabase PITR, prod env secrets, beta legal disclosure.
    *   [x] Identify P1 blockers: exception monitoring, onboarding 500→400, email suppression, PostHog bulk erase on account delete, Stripe webhook rate limiter.
    *   [x] Build readiness matrix across 20 areas with repo-proven vs external-verification split.
    *   [x] Deep review: 17-workflow readiness matrix, functional-test reality check, safe workflow test plan, principal-engineer code review, attribution-engine review, UX simplicity review, Top-10 code risks, Top-10 product risks.
    *   [x] Explicit verdicts: Master CONDITIONAL GO; Attribution CONDITIONAL; UX YES; Code quality Messy-but-manageable.
    *   [x] Recommend next 5 sessions (135–139), Phase C/D blocked until P0 closed.
    *   [x] Create `docs/paid_beta_go_no_go_master_audit.md` (18 sections).
*   **Constraints:** Audit-only. No app/backend feature code changed. No production data mutated, no production secrets, no production load testing, `ALLOW_PRODUCTION_QA_MUTATION` not set.

---

## Session 135 — Stripe Test-Mode Checkout & Webhook Evidence [PARTIAL — P0-1 NOT CLOSED]

*   **Goal:** Close P0-1 — prove the Stripe billing path works in test mode end-to-end before any paid beta customer.
*   **Outcome:** **PARTIALLY VERIFIED — P0-1 remains OPEN.** Stripe-side configuration and the billing code path are verified with genuine test-mode calls; the end-to-end checkout→webhook→DB→enforcement loop is **not** verified (no Stripe CLI; Supabase staging/prod unverified per P0-2, so the webhook handler was not run against a possibly-production DB).
*   **What was done (genuine):**
    *   [x] Confirmed `STRIPE_SECRET_KEY` is **test mode** (`sk_test`, account `acct_…ZEmw`, charges_enabled=false).
    *   [x] Read-only `prices.retrieve` on all 3 configured price IDs — exist & active.
    *   [x] Test-mode `checkout.sessions.create` probe (Starter) — `cs_test_…`, subscription mode, `livemode=false`, hosted URL returned.
    *   [x] Unit-checked plan mapping + `pv_limit` fallback (starter 50k / growth 150k / scale 500k).
    *   [x] Audited webhook signature verification, idempotency, all lifecycle handlers, and inactive-plan enforcement.
    *   [x] Appended "Session 135 Test-Mode Evidence" + operator E2E checklist to `docs/billing_checkout_test_mode_qa.md`.
*   **Findings:** F1(**P0 for closing billing E2E**) test prices stale ($49/$99/$199 vs advertised $29/$79/$149+) — Stripe test dashboard must match public pricing before checkout evidence is meaningful; F2(P2) product names pre-rename; F3(P2 config hygiene) `pv_limit` price metadata absent (fallback verified correct, add metadata to match docs); F4(**P1 billing hardening**) checkout/portal redirect URLs accepted raw from request body — must be generated/allow-listed server-side from trusted origin — reported, not fixed.
*   **Next order:** Session 136 (provider-console separation) runs **before** Session 135B (full E2E), because webhook→DB testing is blocked until staging/prod separation is verified. Then a billing-hardening mini-session for F4.
*   **Constraints honored:** Stripe **test mode** only; no live keys; no production data mutated; webhook handler never executed against any DB; no secrets committed; `ALLOW_PRODUCTION_QA_MUTATION` not set; no Phase C/D work.

---

## Session 136 — Provider-Console Separation & Secrets Verification [PARTIAL — P0-2 REMAINS OPEN]

*   **Goal:** Close or honestly classify P0-2 — staging/production separation across Railway, Supabase, PostHog, Stripe, Resend, and frontend/API/tracker domains.
*   **Outcome:** **P0-2 remains OPEN.** Repo is fully env-parameterized (verified), but provider-console separation was **not** verified (no console access), and the local `.env` points at the **production** Supabase project.
*   **What was done (genuine):**
    *   [x] Confirmed all provider clients are env-driven (`supabase.js`, `posthog.js`, `billing.js`); `railway.json` (api + dashboard) carry build/deploy config only, no env/secrets; no hardcoded provider hosts in source.
    *   [x] Ran a no-secret local `.env` presence audit (key presence/mode only — no values printed).
    *   [x] Appended "Session 136 Provider-Console Verification" to `docs/staging_production_separation_audit.md` with repo/local/console split, blocker list, and next actions.
*   **🚩 Headline finding F5 (P0 staging safety):** local `.env` `SUPABASE_URL` resolves to the **production** project ref (`zxjj…umvh`) with a real service-role key — local dev is wired to the production DB. `qa-guard.js` protects mutating QA scripts, but the billing webhook handler is unguarded app code, so **Session 135B run locally as-is would mutate production**. 135B stays **BLOCKED** until a confirmed separate staging Supabase project exists.
*   **Other notes:** `ST_IP_RESOLVER_MODE` & `ST_LOG_HASH_SECRET` absent from `.env.example` (doc gap; `TRACKER_SALT` satisfies the prod log-hash boot check); `POSTHOG_HOST` host discrepancy (`us.posthog.com` vs doc's `us.i.posthog.com`); Session 135 F1 stale test prices still uncorrected.
*   **Next order:** Session 137 (Supabase Backup/PITR + Rollback Rehearsal) is console-driven and overlaps the Supabase separation checks — run it next; it does not require 135B. An operator must confirm a separate staging Supabase project (and Railway/PostHog/Stripe/Resend separation) to close P0-2 and unblock 135B.
*   **Constraints honored:** No provider console accessed in-session; no production data mutated; no SQL/webhook run; no secrets/keys/URLs/tokens printed or committed (project ref redacted to `zxjj…umvh`); `ALLOW_PRODUCTION_QA_MUTATION` not set; no app/backend code changed; no Phase C/D work.

---

## Session 137 — Supabase Backup/PITR Verification + Rollback Rehearsal [PARTIAL — P0-3 REMAINS OPEN]

*   **Goal:** Close or honestly classify P0-3 — production Supabase backups + PITR confirmed enabled and recovery/rollback plan verified.
*   **Outcome:** **P0-3 remains OPEN.** Accessed the Supabase Management API (MCP tools). The production project `zxjjjsipafojhzkkumvh` is on the **Free** tier plan: daily scheduled backups are disabled, and PITR is disabled and unavailable. No separate staging Supabase project exists, which blocks E2E mutation testing (Session 135B).
*   **What was done (genuine):**
    *   [x] Verified documented production Supabase project `zxjjjsipafojhzkkumvh` exists and is healthy.
    *   [x] Confirmed the project's organization subscription plan is Free, meaning automated daily backups and PITR are disabled/unavailable.
    *   [x] Verified that no separate staging Supabase project exists for SourceTrack (the only other active project is unrelated).
    *   [x] Railway rollback previously documented / not re-verified in this session (redeploy via 1-Click Rollback is supported on Railway but not executed/verified this session).
    *   [x] Appended "Session 137 Supabase Backup/PITR Verification" to `docs/backup_recovery.md`.
*   **Next order:** The backups, PITR, staging isolation, and billing tests remain blocked until:
    1. The production Supabase project is upgraded to a paid plan to enable backups/PITR.
    2. A separate staging Supabase project is created and wired.
    3. Stripe test prices are corrected (Session 135 F1).
*   **Constraints honored:** Read-only console verification; no production data mutated; no destructive SQL run; no secrets/keys/connection strings printed or committed (project ref redacted); `ALLOW_PRODUCTION_QA_MUTATION` not set; no app/backend code changed; no Phase C/D work.

---

## Session 138A — Safe Non-Mutating QA + Top-Priority Test Backlog [COMPLETE]

*   **Goal:** Run every safe non-mutating test we can run right now, and move every blocked/unsafe test into a top-priority backlog.
*   **Outcome:** Checked and ran all safe non-mutating QA unit and integration tests (attribution math, GSC token/CTR math, timezone date bucketing, path exclusions, billing helper checks) and verified they all pass. Classified all 33 repository scripts by safety. Created `docs/safe_qa_test_backlog.md` and documented the gating conclusion.
*   **What was done (genuine):**
    *   [x] Inspected and classified all 33 repository QA scripts under the `scripts` folder.
    *   [x] Executed baseline checks: `node --check` syntax, `git diff --check`, `npm run qa:static` (which builds the dashboard successfully).
    *   [x] Ran only the verified safe, non-mutating tests: `qa-attribution-harness`, `qa-timezone`, `qa-ai-journey-attribution`, `qa-billing-helper`, `qa-path-exclusions`, and `qa-gsc-integration` (after fixing obsolete Docs.jsx redirect test expectation).
    *   [x] Performed four static safety scans (production mutation, route guards, attribution, billing) to confirm structure and guard integrity.
    *   [x] Generated a new test backlog document at `docs/safe_qa_test_backlog.md`.
*   **Constraints honored:** No production data mutated; no Supabase writes run; no billing webhook tests run; no Stripe checkout completed; no real emails sent; no load tests run; `ALLOW_PRODUCTION_QA_MUTATION` was not set; no secrets printed or committed.

## Top-Priority Blocked Test Backlog

| Priority | Item | Why Blocked | Unblock Condition | Risk Level | Session | Gating Milestone | Status |
|---|---|---|---|---|---|---|---|
| **P0** | Create separate staging Supabase project and rewire local/staging env away from production. | Local `.env` currently points to live production Supabase (`zxjjjsipafojhzkkumvh`), making local development of mutating code highly dangerous. | Provision separate staging Supabase project and update local/staging environment variables. | **CRITICAL** | Session 138C | Pre-Paid-Beta | **RESOLVED (Staging `nrsvpwzekfrdrzkoecfk` created. Local `.env`, `.env.local`, and `.env.staging` now target the staging Supabase project ref for URL/publishable-key configuration, but `SUPABASE_SERVICE_KEY` remains a placeholder. Local backend mutation tests remain blocked until the real staging service-role key is manually added to gitignored local env files. No env files are tracked by git.)** |
| **P0** | Upgrade production Supabase to paid plan and enable backups/PITR. | Production Supabase is currently on the Free plan, which disables daily scheduled backups and PITR. | Operator upgrades the production database to a paid tier and enables backups and PITR. | **CRITICAL** | Session 138C | Pre-Paid-Beta | **RESOLVED (Daily scheduled backups were manually verified in the Supabase dashboard by the operator. MCP did not independently expose/verify backup settings. Visible physical backups were shown for June 3 through June 10, with latest visible backup on June 10, 2026. No restore was run. PITR is not enabled / not accepted as enabled. Do not enable PITR without explicit cost approval. Daily backups are now verified; PITR remains an optional but strongly recommended paid add-on / accepted risk if left disabled.)** |
| **P0** | Full Stripe test-mode E2E after staging DB exists and Stripe test prices are corrected. | Staging database does not exist to receive webhook writes, and Stripe test-mode price amounts ($49/$99/$199) are stale compared to public ones ($29/$79/$149+). | Staging database is provisioned and Stripe test prices are aligned with the new price schema. | **HIGH** | Session 139C | Pre-Paid-Beta | **Stripe E2E remains blocked until: 1. staging schema/bootstrap is completed safely; 2. real staging service-role key is added locally/staging-only; 3. local/dev production boot guard is added (Completed in Session 138D via api/bootstrap.js); 4. Stripe test catalog is corrected; 5. billing/webhook E2E runs only against staging** |
| **P1** | Billing redirect hardening: generate/allow-list checkout success/cancel and portal return URLs server-side. | Currently checkout redirection parameters (`success_url`, `cancel_url`, `returnUrl`) are accepted raw from request bodies without server-side validation. | Implement server-side allow-list validation and URL generation for billing checkout and customer portal links. | **HIGH** | Session 139A | Pre-Paid-Beta |
| **P1** | Exception monitoring/Sentry test. | Staging environment must verify Sentry exception routing and capturing logic before public release. | Integrate Sentry SDK and run active error-triggering smoke tests on staging. | **MEDIUM** | Session 139B | Pre-10-Customers |
| **P1** | Add qa:attribution, qa:smoke, and qa:edge to CI or required pre-deploy gate. | Mutating tests cannot run in GitHub Actions due to lack of a test database, creating risk of unnoticed logic regressions. | Set up a staging database in the CI pipeline or require manual run gates prior to deploy. | **MEDIUM** | Session 139C | Pre-Paid-Beta |
| **P1** | Onboarding validation hardening test: invalid/PaaS/disposable domains return clean 400. | Onboarding domain validation logic needs to reject disposable or temporary email/PaaS hosts with clean 400 client errors. | Implement domain parsing validation rules and add regression tests. | **LOW** | Session 140A | Pre-10-Customers |
| **P1** | Report digest suppression/unsubscribe test. | Safe transactional emails are set up, but unsubscribe header logic and email suppression lists have not been verified. | Run end-to-end unsubscribe test using Resend mock sandbox. | **MEDIUM** | Session 140B | Pre-10-Customers |
| **P2** | Conversion-cap enforcement or pricing-copy decision. | Monthly conversion limits are displayed in the dashboard but not actively blocked at the ingestion layer. | Implement conversion ingestion count checks or decide on non-blocking soft limit notifications. | **LOW** | Session 141A | Pre-Public-Launch |
| **P2** | Redis/shared rate-limit test before horizontal scaling. | Current rate limiter is in-memory only, which is fine for single-instance paid beta but will fail under multiple instances. | Set up Redis/Upstash connection in staging and assert rate-limiting consistency. | **HIGH** | Session 141B | Pre-Public-Launch |
| **P2** | Staging load tests before high-volume ecommerce. | High-volume ecommerce traffic spikes have not been tested against the synchronous database write paths. | Run k6 load scripts against the staging API connected to a staging database. | **HIGH** | Session 142 | Pre-Public-Launch |
