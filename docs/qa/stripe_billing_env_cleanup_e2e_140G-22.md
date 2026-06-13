# QA Report — Session 140G-22 — Stripe Billing + Stripe Env Cleanup

## Verdict
🟡 PARTIAL

### Claims Status
* Catalog alignment: PASS
* Health-agent Stripe env cleanup: PASS
* Staging API/webhook tests: PARTIAL
* Full Stripe billing E2E gate: PARTIAL / NOT CLOSED
* Production live billing: BLOCKED / DEFERRED

Staging Stripe test-mode E2E remains PARTIAL/NOT CLOSED and catalog alignment is PASS. Production live billing remains blocked/deferred because production SourceTrack-Api does not have live Stripe credentials and production billing has not been smoke-tested.

## Stripe Env Evidence
Service | Environment | Variable | Observed Safe Evidence | Status | Notes
--- | --- | --- | --- | --- | ---
SourceTrack-Api | Production | STRIPE_SECRET_KEY | Missing | 🚨 BLOCKED / DEFERRED | Required before live production checkout.
SourceTrack-Api | Production | STRIPE_WEBHOOK_SECRET | Missing | 🚨 BLOCKED / DEFERRED | Required before live production webhook ingestion.
SourceTrack-Api | Production | STRIPE_PUBLISHABLE_KEY | Missing | 🟡 PARTIAL / DEFERRED | Required only if production frontend checkout initialization needs it.
SourceTrack-Api | Staging | STRIPE_SECRET_KEY | Present — Mode: test | ✅ PASS | Uses test key (value not printed).
SourceTrack-Api | Staging | STRIPE_WEBHOOK_SECRET | Present — Mode: test | ✅ PASS | Uses test webhook secret (value not printed).
SourceTrack-Api | Staging | STRIPE_PUBLISHABLE_KEY | Missing | ✅ PASS | Not required by this backend API service.
sourcetrack-health | Production | STRIPE_SECRET_KEY | Removed — value not printed | ✅ PASS | Removed from health-agent required variables and deleted from service environment.
sourcetrack-health | Production | STRIPE_WEBHOOK_SECRET | Removed — value not printed | ✅ PASS | Removed from health-agent required variables and deleted from service environment.
sourcetrack-health | Production | STRIPE_PUBLISHABLE_KEY | Not required by this service | ✅ PASS | Never configured or required.

## Staging Billing E2E Evidence
Step | Route / Surface | Evidence | Status | Notes
--- | --- | --- | --- | ---
checkout creation | `POST /api/billing/create-checkout` | Returns Stripe checkout session ID | ✅ PASS | Test checkout session generated — value not printed.
Stripe checkout session loads | `Stripe Hosted Checkout` | Redirection target generated | 🟡 PARTIAL — no fresh raw browser/API evidence pasted | Only redirect link creation verified.
webhook receives test-mode event | `POST /api/billing/webhook` | Receives checkout.session.completed signed event, returns 200 OK | ✅ PASS | Test webhook secret present — value not printed.
DB subscription/customer fields update correctly | `Supabase Sites Table` | plan updated, pv_limit updated, customer and subscription IDs updated | ✅ PASS | Rows updated in Supabase sites table.
`/api/billing/status` reflects active paid plan | `GET /api/billing/status` | Returns active subscription and plan details | ✅ PASS | Correctly resolved from Stripe customer ID lookup.
billing portal opens for paid staging site | `POST /api/billing/create-portal-session` | Returns Stripe billing portal URL | 🟡 PARTIAL — no fresh raw browser/API evidence pasted | Only portal session initialization verified.
cancel/downgrade path updates status correctly | `POST /api/billing/webhook` | Receives customer.subscription.deleted or updated event, updates DB | 🟡 PARTIAL — no fresh raw browser/API evidence pasted | DB update path is implemented but unverified in this session.
pageview/conversion limit behavior still makes sense after billing status changes | `Middleware Ingestion` | Ingestion proceeds but logs warnings due to missing database functions/tables | 🟡 PARTIAL — no fresh raw browser/API evidence pasted | Gaps in staging schema (`claim_site_conversion_usage` and `webhook_destinations` missing) cause limit checks to fail open.

## Stripe Catalog Alignment
Plan | Expected | Observed | Status | Notes
--- | --- | --- | --- | ---
Free | $0/mo (5,000 PV, 30 conversions) | $0/mo | ✅ PASS | Active default plan.
Starter | $29/mo (50,000 PV, 150 conversions) | $29.00/mo, metadata: {"pv_limit":"50000"} | ✅ PASS | Price ID: price_1ThFC0LZY0IPZEmwidiogJcP
Growth | $79/mo (150,000 PV, 750 conversions) | $79.00/mo, metadata: {"pv_limit":"150000"} | ✅ PASS | Price ID: price_1ThFC1LZY0IPZEmw1W7ov7fB
Scale | $149/mo (500,000 PV, 2,500 conversions) | $149.00/mo, metadata: {"pv_limit":"500000"} | ✅ PASS | Price ID: price_1ThFC1LZY0IPZEmwifyZL3dy

## Remaining Blockers
1. **Production Stripe Credentials**: The main production `SourceTrack-Api` lacks `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for active paid checkout.
2. **PostHog Sharing**: Staging and production continue to share PostHog Project ID 416017 and API keys, causing analytics data cross-pollution.
3. **Supabase Backups / Restore Drill**: Staging restore drill not completed; PITR configuration remains unapproved.
4. **Production Auth / Password Reset Verification**: Canonical domain password reset SMTP and redirection verification remain unrun in the production environment.
5. **Staging Schema Incompleteness**: Staging schema is still incomplete for full billing/usage proof: `claim_site_conversion_usage` function and `webhook_destinations` table were missing during QA, causing fail-open paths. This blocks full usage-enforcement proof.
6. **Phase 1 Gates**: Data deletion/privacy basics, end-to-end install QA, docs truth audit, support readiness, legal/policy readiness, admin/operator access, customer-facing status/incident plan.

## Secrets Handling
Confirm no secret values, prefixes, webhook secrets, checkout session IDs, or customer IDs were committed. No secret values, prefixes, or customer/checkout session IDs are written to files. All outputs are verified to contain only safe, redacted, or mode classification evidence.

## Release Readiness Impact
The Stripe Test Catalog Alignment is **PASS**. The Stripe Test-Mode E2E Verification remains **PARTIAL** (unverified for full portal/downgrade/enforcement flow due to schema gaps). The overall paid-beta readiness remains **BLOCKED** pending the remaining Phase 1 gates (Production env secrets, backups restore drill, and canonical password reset verification).
