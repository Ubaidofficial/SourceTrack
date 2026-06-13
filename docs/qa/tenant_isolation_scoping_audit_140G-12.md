# Tenant Isolation Scoping Audit Report (Session 140G-12)

This report documents a comprehensive security audit of tenant isolation and data boundaries across all API routes, database queries, ingestion channels, and administrative previews in the SourceTrack / TrackIQ repository.

---

## Audit Overview

* **Auditor:** AI Pair Programmer (Antigravity)
* **Behavior Model:** Antigravity / Gemini 3.5 Flash High; audit reviewed externally before approval
* **Session ID:** 140G-12
* **Date:** June 13, 2026

---

## Commands Run

```bash
git status --short
git log --oneline -5

grep -RIn "requireSiteMembership\|validateSiteKey\|company_id\|site_id\|site_key\|user_id\|owner_id\|share_token\|public-dashboard\|admin\|super_admin\|from('sites')\|from(\"sites\")\|eq('site_id'\|eq(\"site_id\"\|eq('company_id'\|eq(\"company_id\"\|eq('user_id'\|eq(\"user_id\"" \
  api dashboard/src docs scripts \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=build || true

find api/routes api/middleware api/lib -maxdepth 2 -type f | sort

git diff --check
npm run qa:static
npm run qa:identity:unit
npm run qa:tracker:unit

find api/routes api/middleware api/lib -name "*.js" -print0 | xargs -0 node --check

grep -RIn "file:///Users/ubaid\|/Users/ubaid\|.gemini/antigravity\|sk_live\|rk_live\|pk_live\|whsec_[A-Za-z0-9]\{10,\}\|eyJ[a-zA-Z0-9_-]*" \
  api dashboard/src docs scripts SESSION_STATE.md SESSION_LOG.md SESSION_HANDOFF.md \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  --exclude-dir=build || true
```

---

## Files Audited

### Core Middleware & Libraries
* [api/middleware/auth.js](../../api/middleware/auth.js) — Site validation and membership verification (`validateSiteKey`, `requireSiteMembership`).
* [api/middleware/user-auth.js](../../api/middleware/user-auth.js) — User JWT verification and role mapping (`requireUserAuth`, `requireRole`).
* [api/lib/supabase.js](../../api/lib/supabase.js) — Supabase client configuration.
* [api/lib/posthog.js](../../api/lib/posthog.js) — PostHog client and HogQL execution wrapper.

### Authenticated & Protected Routes
* [api/routes/dashboard.js](../../api/routes/dashboard.js) — Dashboard overview, Cac calculations, live visitors, and diagnostics.
* [api/routes/events.js](../../api/routes/events.js) — Event logs, health, edge cases, and deduplication summaries.
* [api/routes/journey.js](../../api/routes/journey.js) — Visitor sessionization journeys.
* [api/routes/attribution.js](../../api/routes/attribution.js) — First/last/multi-touch attribution reports and explanation.
* [api/routes/saved-reports.js](../../api/routes/saved-reports.js) — Saved report configurations, widget positions, and sizing.
* [api/routes/export.js](../../api/routes/export.js) — CSV report generator.
* [api/routes/campaign-costs.js](../../api/routes/campaign-costs.js) — Manual campaign cost uploads, bulk imports, and import logs.
* [api/routes/integrations.js](../../api/routes/integrations.js) — Settings, proxy domains, webhook ingestion logs, API keys, and configurations.
* [api/routes/sites.js](../../api/routes/sites.js) — Site listings and company ownership mapping.
* [api/routes/gdpr.js](../../api/routes/gdpr.js) — Data deletion, account purge, and retention periods.
* [api/routes/billing.js](../../api/routes/billing.js) — Stripe checkout session creation, portal links, and status.
* [api/routes/sessions.js](../../api/routes/sessions.js) — Session lists and details.
* [api/routes/seo-revenue.js](../../api/routes/seo-revenue.js) — Organic search GSC attribution.

### Public Ingestion & Webhook Routes
* [api/routes/public-dashboard.js](../../api/routes/public-dashboard.js) — Public share token dashboards and settings.
* [api/routes/stripe-webhook.js](../../api/routes/stripe-webhook.js) — Stripe payment conversion webhooks.
* [api/routes/shopify-webhook.js](../../api/routes/shopify-webhook.js) — Shopify order webhooks.
* [api/routes/track.js](../../api/routes/track.js) — Client tracker events ingestion.
* [api/routes/conversion.js](../../api/routes/conversion.js) — Conversion ingestion.
* [api/routes/identify.js](../../api/routes/identify.js) — Identity matching.
* [api/routes/pixel.js](../../api/routes/pixel.js) — Transparent pixel ingestion.
* [api/routes/tracker-id.js](../../api/routes/tracker-id.js) — Cookieless visitor ID mapping.
* [api/routes/webhook-incoming.js](../../api/routes/webhook-incoming.js) — Generic customer payment hooks.

### Special Routes & Admin
* [api/routes/admin.js](../../api/routes/admin.js) — Super-admin workspace listings and dashboard previewing.
* [api/routes/job-status.js](../../api/routes/job-status.js) — Global nightly attribution task status.
* [api/routes/ai-chat.js](../../api/routes/ai-chat.js) — AI query assistant interface.

---

## Required Audit Questions & Answers

### 1. Does it authenticate the user?
* **Yes, for all private/dashboard routes.** They are protected by `requireUserAuth`, which validates the Supabase JWT and populates `req.user`.
* **No, for public ingestion, webhooks, and public share routes.** This is by design because they receive telemetry from client browsers or external servers.

### 2. Does it verify site membership?
* **Yes, for all private routes.** The `requireSiteMembership` middleware asserts that the site's `company_id` matches the user's `company_id`.
* **No, for webhooks, public shares, and ingestion routes.** They resolve site context strictly from the `site_key` (or `public_share_token` / signature) because no user context exists.

### 3. Does it verify company/workspace membership?
* **Yes.** `requireUserAuth` queries `company_members` to resolve the user's `company_id`. Then `requireSiteMembership` ensures the request site belongs to that workspace.

### 4. Does it rely only on `site_key`?
* **Only for public and ingestion endpoints.** Telemetry ingestion (`/api/track`, `/api/collect`, `/api/conversion`, `/api/identify`), custom proxy domains, and webhook targets require only the `site_key` parameters or signatures.
* **No, for private dashboard routes.** They require *both* a valid user authentication session AND site membership.

### 5. Does it use `site_id` from user input without checking ownership?
* **No.** Request inputs are validated via `validateSiteKey` (which retrieves the site from the database and binds it to `req.site`). Handlers only query using `req.site.id` or `req.site.site_key` resolved by middleware.
* For `PATCH /api/public/settings`, the body-provided `site_id` is explicitly checked against the user's company membership (`company_id`) or owner ID before updates.

### 6. Does it allow public token access, and if yes, is it correctly scoped?
* **Yes, the public dashboard route (`GET /api/public/:token`) allows public access.**
* **It is correctly scoped.** It explicitly rejects any parameter overrides (`site_key`, `site_id`, etc.) in the query or body, checks `public_share_enabled` is true, and uses the database-mapped site ID to load pre-aggregated KPIs.

### 7. Does any Supabase query omit `site_id`, `company_id`, or membership scoping?
* **AI Chat HogQL (Follow-up required):** AI Chat's `validateHogQL` currently verifies only inclusion of `properties.site_id`; reviewed parser-safe hardening is still required and no code fix is retained in this audit-only session.
* **Job Status (Minor metadata leak, deferred to follow-up):** `/api/jobs/attribution/status` queries the global `job_runs` table without scoping. Any authenticated customer user can view this list, but it contains no site-specific or tenant-specific PII (only job runtimes and status codes).

### 8. Does any export/report endpoint allow cross-site data access?
* **No.** Export and saved-reports endpoints are protected by `requireSiteMembership` and strictly filter queries on `req.site.id`. CSV exports also strip all internal sensitive keys (`id`, `site_id`, `site_key`, `user_id`, `company_id`, `distinct_id`, `person_id`).

### 9. Does super-admin logic accidentally bypass normal user checks?
* **No.** Super-admins bypass `requireSiteMembership` in order to support workspace troubleshooting. However, preview dashboards (`/api/admin/preview/:siteKey`) are explicitly scoped to the target site's ID, preserving correct data boundaries.

### 10. Are errors safe, or do they leak site/customer metadata?
* **Yes.** All errors caught by the global error handler return generic "Internal server error" messages. Specific route controllers utilize sanitization or safe placeholders, preventing raw SQL schema or metadata leakage.

---

## Route Scoping Matrix

| Route Pattern | Auth Required | Membership Scoped | Data Source Filter | Public Token Scoped | Scoping Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/track` / `/api/collect` | No | No (Public Ingest) | `site_key` parameter | No | **SAFE** (Telemetry only) |
| `/api/identify` | No | No (Public Ingest) | `site_key` parameter | No | **SAFE** (Telemetry only) |
| `/api/conversion` | No | No (Public Ingest) | `site_key` parameter | No | **SAFE** (Telemetry only) |
| `/api/pixel` | No | No (Public Ingest) | `site_key` parameter | No | **SAFE** (Telemetry only) |
| `/api/tracker/id` | No | No (Public Ingest) | `site_key` parameter | No | **SAFE** (Telemetry only) |
| `/api/webhooks/incoming` | No | No (Public Ingest) | `site_key` parameter | No | **SAFE** (Telemetry only) |
| `/api/webhooks/stripe` | No | Signature verified | `site_key` parameter | No | **SAFE** (Cryptographic match) |
| `/api/webhooks/shopify` | No | Signature verified | `site_key` parameter | No | **SAFE** (Cryptographic match) |
| `/api/public/:token` | No | No (Public View) | `public_share_token` | Yes | **SAFE** (Overriding blocked) |
| `/api/dashboard/*` | Yes | Yes | `req.site.id` / `req.site.site_key` | No | **SAFE** |
| `/api/attribution/*` | Yes | Yes | `req.site.id` / `req.site.site_key` | No | **SAFE** |
| `/api/journey/*` | Yes | Yes | `req.site.id` | No | **WATCH** (person fetch hardening required) |
| `/api/events/*` | Yes | Yes | `req.site.id` | No | **SAFE** |
| `/api/saved-reports/*` | Yes | Yes | `req.site.id` / `req.user.id` | No | **SAFE** |
| `/api/export/*` | Yes | Yes | `req.site.id` | No | **SAFE** (Sensitive IDs stripped) |
| `/api/campaign-costs/*` | Yes | Yes | `req.site.id` / `req.site.site_key` | No | **SAFE** |
| `/api/integrations/*` | Yes | Yes | `req.site.id` / `req.site.site_key` | No | **SAFE** |
| `/api/seo-revenue` | Yes | Yes | `req.site.id` / `req.site.site_key` | No | **SAFE** |
| `/api/gdpr/*` | Yes | Yes | `site.id` / `req.user.id` | No | **SAFE** |
| `/api/billing/*` | Yes | Yes | `site.id` / `site.stripe_customer_id` | No | **SAFE** |
| `/api/admin/*` | Yes (Super Admin) | Bypassed | Target site ID | No | **SAFE** (Audited and preview scoped) |
| `/api/jobs/*` | Yes | No | Global | No | **WATCH** (Global metadata leak only) |
| `/api/ai-chat` | Yes | Yes | `req.site.id` | No | **WATCH** (HogQL validator hardening required) |

---

## Findings

### Confirmed Safe Routes
Most standard dashboard metrics, event logs, saved reports, exports, integrations, campaigns, GSC revenue, and billing endpoints appear properly scoped by the audited middleware and route filters; AI Chat, Journey person-profile fetching, and global job status remain follow-up watch items. They rely on the authentication middleware stack which applies strict site membership filters before route handlers execute.

### Findings Requiring Follow-up
1. **AI Chat HogQL injection risk (Follow-up required):** Existing validation needs a reviewed, parser-safe hardening plan; the rejected regex-only code fix was reverted and is not retained in this session.
2. **Journey Route Person leak risk (Follow-up required):** Existing PostHog person-profile fetching needs reviewed hardening; the weak events-length-only code fix was reverted and is not retained in this session.

### Suspicious/Unsafe Routes (Follow-up Required)
1. **Job Status Leak:** `/api/jobs/attribution/status` is guarded by `requireUserAuth` but does not scope logs to a user's company or site. Any customer user can inspect the global nightly job runs.
   * *Status:* Minimal risk (no user data or site metadata leaked, only timestamps and status codes), but should be restricted to super-admins in a future session.

---

## Verification Output

* All backend files syntax passed:
  ```bash
  find api/routes api/middleware api/lib -name "*.js" -print0 | xargs -0 node --check
  ```
* All static launch checks and builds succeeded:
  ```bash
  npm run qa:static
  ```
* All deterministic unit tests passed cleanly:
  ```bash
  npm run qa:identity:unit
  npm run qa:tracker:unit
  ```

---

## Remaining Paid-Beta Blockers

Refer to `docs/release_checklist_gate.md` and `SESSION_STATE.md`. The remaining open gating release items include:
* AI Chat HogQL validator hardening.
* Journey PostHog person-profile scoping hardening.
* Job status endpoint restriction or admin-only gating.
* Stripe test-mode E2E browser billing verification.
* Staging schema/bootstrap verification.
* PITR/backup restore drill.
* Production env/secrets verification.
* Observability and exception monitoring setup.
* End-to-end install QA.
* Docs truth audit, support readiness, legal/policy readiness, abuse/rate-limit review, status/incident readiness, transactional email/password reset verification, and final staging/production smoke verification.
