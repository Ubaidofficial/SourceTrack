# Session 140B — Staging/Production Shared PostHog Reverse Proxy Hotfix

## Verdict
PASS WITH LIMITS

*Why limits:* The PostHog Reverse Proxy hotfix was successfully applied and verified. Nginx DNS resolution has been fully restored and it successfully forwards queries to PostHog Cloud (verified via scratch query). However, the staging API endpoints still return `analytics_unavailable: true` (resilient catch block fallback) or 500 error because the configured `POSTHOG_PERSONAL_API_KEY` on the `SourceTrack-Api` service is invalid (`phx_wvj...`), causing PostHog Cloud to reject queries with a 403 Forbidden. Modifying the API service environment variables was out of scope for this session.

## Scope
Environment-only reverse proxy fix. No app code changes. No commit/push.

## Production Impact Notice
The reverse proxy is shared by staging and production. This was treated as a production-impacting infrastructure hotfix.

## Starting State
- **Latest green commit:** `a38167a Fix 140A QA report whitespace`
- **140A blocker:** PostHog Reverse Proxy returned 502 Gateway errors due to a malformed `POSTHOG_CLOUD_REGION` setting.
- **Direct PostHog MCP status:** Healthy. HogQL query executed directly on project `416017` returned correct counts for `$pageview` (1,701) and `$conversion` (525).
- **Reverse Proxy status before fix:** Returning 502 with Nginx DNS resolution error `posthog_cloud_region=us.i.posthog.com could not be resolved`.
- **Staging API behavior before fix:** Overview, attribution, and exports returned 500/502 errors or `analytics_unavailable: true` due to proxy 502.

## Services Inspected
- **Staging API service:** `SourceTrack-Api` (`4b946535-0895-4042-b45c-c0e3a5e12648`)
- **Production API service:** `SourceTrack-Api` (`4b946535-0895-4042-b45c-c0e3a5e12648`)
- **Reverse proxy service:** `PostHog Reverse Proxy` (`ceb0de57-b3a1-4565-b40c-8e4619e426e6`)
- **Reverse proxy environment:** `production` (`df954932-0f00-4d91-b660-4cd3c8cb690a` in project `beneficial-solace`)
- **PostHog project:** `416017`

## Root Cause
The `POSTHOG_CLOUD_REGION` environment variable on the reverse proxy service was set to `POSTHOG_CLOUD_REGION=us`. When the Nginx entrypoint templates performed env variable substitution at container startup, this malformed string caused the proxy's internal routing engine to construct the broken DNS target `posthog_cloud_region=us.i.posthog.com`, which could not be resolved.

## Change Made
Only the approved environment variable change was applied in Railway to the `PostHog Reverse Proxy` service:
- `POSTHOG_CLOUD_REGION`: `POSTHOG_CLOUD_REGION=us` -> `us`

## Rollback Plan
If a rollback is required:
1. Set `POSTHOG_CLOUD_REGION` back to the previous malformed value: `POSTHOG_CLOUD_REGION=us`
2. Redeploy/restart the `PostHog Reverse Proxy` service.

## Validation After Fix

### PostHog MCP
- **Direct Querying:** Succeeded. Project `416017` is fully queryable directly.
- **Seeded Data:** Intact. Event counts verified (1,701 pageviews, 525 conversions).

### Railway Deployment
- **Deployment Status:** Deployment `04308f0c-e500-4461-a1d0-ffd1c276fe2e` completed successfully with status `SUCCESS` on 2026-06-12.

### Reverse Proxy Logs
- **DNS Resolution:** Fully fixed. No `us.i.posthog.com could not be resolved` errors are logged.
- **Connection Forwarding:** Verified. A scratch query using a valid personal API key was forwarded successfully and returned `200 OK` (with the event taxonomy list). Staging API requests are successfully routed to PostHog and return `403 Forbidden` (instead of `502 Bad Gateway`).

### Staging API Endpoints
- **Staging API `/health`:** `200 OK` (`{"status":"ok"}`)
- **Staging API `/api/dashboard/overview`:** Returns `200 OK` with `analytics_unavailable: true` (resilient caught error fallback). Staging API logs show the underlying query failed with:
  `[dashboard/overview] query failed: HogQL dash_alerts failed (403): {"type":"authentication_error","code":"authentication_failed","detail":"Personal API key found in request Authorization header is invalid."}`
- **Staging API `/api/attribution`:** Returns `success: true` with `analytics_unavailable: true` when date and model parameters are supplied. Logs show it fails with a 403 Forbidden due to the invalid personal API key.
- **Staging API `/api/export/report`:** Returns `500 Internal Server Error` with `{"success": false, "error": "Export failed"}` when all required parameters are supplied. Logs show it fails with a 403 Forbidden due to the invalid personal API key.

## Remaining Blockers
The following blockers are separate from the proxy infrastructure and remain open:
1. **Invalid PostHog Personal API Key Env Var:** The `POSTHOG_PERSONAL_API_KEY` env var configured on `SourceTrack-Api` (`phx_wvj...`) is invalid and causes all backend analytics queries to return 403.
2. **Billing Status Select Bug:** The `/api/billing/status` endpoint fails to read Stripe subscriptions because the `validateSiteKey` middleware does not select `stripe_customer_id` from the database.
3. **Google Search Console Redirect URI:** `GOOGLE_GSC_REDIRECT_URI` is misconfigured to production (`api.srctk.com`) on the staging API environment.
4. **Full real-Chrome E2E Audit:** Direct browser-based verification is still pending.

## Secrets Redaction Confirmation
I confirm that no secrets, tokens, passwords, full site keys, API keys, or raw env secret values have been written to files, documentation, or chat logs. All sensitive values have been redacted as `[REDACTED]` or masked.
