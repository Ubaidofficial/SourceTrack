# QA Report — Session 140G-23 — Fix Staging Schema Gaps for Billing / Usage Proof

## Verdict
PASS

## Schema Audit
Object | Expected Source | Staging Before | Action Taken | Staging After | Status
--- | --- | --- | --- | --- | ---
`claim_site_conversion_usage` | `supabase/migrations/20260613010000_add_site_usage_monthly.sql` | Missing | Applied migration `add_site_usage_monthly` | Present | ✅ PASS
`webhook_destinations` | `supabase/migrations/20260605150600_add_outbound_webhooks.sql` | Missing | Applied migration `add_outbound_webhooks` | Present | ✅ PASS
`webhook_deliveries` | `supabase/migrations/20260605150600_add_outbound_webhooks.sql` | Missing | Applied migration `add_outbound_webhooks` | Present | ✅ PASS
`saved_reports` dashboard columns | `supabase/migrations/20260607133300_add_dashboard_fields_to_saved_reports.sql` | Missing | Applied migration `add_dashboard_fields_to_saved_reports` | Present | ✅ PASS
GSC tables (`gsc_connections`, `gsc_performance_daily`, `gsc_sync_runs`) | `supabase/migrations/20260607212000_add_google_search_console.sql` | Missing | Applied migration `add_google_search_console` | Present | ✅ PASS
`claim_site_pageview_usage` | `supabase/migrations/20260613020000_add_pageview_count_to_usage.sql` | Missing | Applied migration `add_pageview_count_to_usage` | Present | ✅ PASS
`site_usage_monthly` | `supabase/migrations/20260613010000_add_site_usage_monthly.sql` | Missing | Applied migration `add_site_usage_monthly` | Present | ✅ PASS

## Migration / Bootstrap Evidence
List of applied migration files via Supabase MCP `apply_migration` tool:
1. `supabase/migrations/20260605150600_add_outbound_webhooks.sql`
2. `supabase/migrations/20260607133300_add_dashboard_fields_to_saved_reports.sql`
3. `supabase/migrations/20260607212000_add_google_search_console.sql`
4. `supabase/migrations/20260613010000_add_site_usage_monthly.sql`
5. `supabase/migrations/20260613020000_add_pageview_count_to_usage.sql`

All executions were targeted strictly to staging project reference `nrsvpwzekfrdrzkoecfk`.

## Billing / Usage QA Evidence
Command | Key Output | Status | Notes
--- | --- | --- | ---
`node scripts/verify-db-schema.mjs` | `Table "gsc_connections" EXISTS`, `Table "gsc_performance_daily" EXISTS`, `Table "gsc_sync_runs" EXISTS` | ✅ PASS | All tables checked exist.
`node scripts/qa-payments-api.mjs` | `ALL QA PAYMENTS API CHECKS PASSED SUCCESSFULLY!` | ✅ PASS | No fail-open warnings or missing function errors.
`node scripts/qa-stripe-webhook.mjs` | `ALL QA CHECKS PASSED SUCCESSFULLY!` | ✅ PASS | No fail-open warnings or missing function errors.
`npm run qa:identity:unit` | `131 pass` | ✅ PASS | Regression tests green.
`npm run qa:static` | `PASS — static launch QA passed` | ✅ PASS | Static tests green.

## Fail-Open Check
None of the following warnings appear anymore:
* `Could not find the function public.claim_site_conversion_usage`
* `Could not find the table 'public.webhook_destinations'`
* `failing open` warnings are fully resolved.

## Remaining Blockers
1. **Production Stripe Credentials**: The main production `SourceTrack-Api` lacks `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` for active paid checkout.
2. **PostHog Sharing**: Staging and production continue to share PostHog Project ID 416017 and API keys, causing analytics data cross-pollution.
3. **Supabase Backups / Restore Drill**: Staging restore drill not completed; PITR configuration remains unapproved.
4. **Production Auth / Password Reset Verification**: Canonical domain password reset SMTP and redirection verification remain unrun in the production environment.
5. **Phase 1 Gates**: Data deletion/privacy basics, end-to-end install QA, docs truth audit, support readiness, legal/policy readiness, admin/operator access, customer-facing status/incident plan.

## Release Readiness Impact
* **Staging Schema Bootstrap**: moves to **PASS** (all incremental migrations are applied and verified on staging).
* **Stripe Test-Mode E2E**: remains **PARTIAL**. Schema blockers were fixed, but hosted checkout, portal, and cancel/downgrade still need fresh raw browser/API proof.
* **Billing/Limits Enforcement**: remains **PARTIAL** (staging schema/API usage paths improved). Staging schema now contains the atomic usage tables/functions and automated payments/webhook QA no longer fails open due to missing database objects.
