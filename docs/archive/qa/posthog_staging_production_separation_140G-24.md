# QA Report — Session 140G-24 — PostHog Staging / Production Separation

## Verdict
BLOCKED

## Environment Audit
Service | Environment | Variable | Safe Evidence | Shared With Other Env? | Status
--- | --- | --- | --- | --- | ---
SourceTrack-Api | Production | `POSTHOG_PROJECT_ID` | Present (Matches staging) | Yes | 🚨 BLOCKED
SourceTrack-Api | Production | `POSTHOG_API_KEY` | Present (phx_[REDACTED] personal key) | No | 🚨 BLOCKED
SourceTrack-Api | Production | `POSTHOG_PERSONAL_API_KEY` | Present (phx_[REDACTED] personal key) | No | 🚨 BLOCKED
SourceTrack-Api | Production | `POSTHOG_HOST` | Present (Reverse proxy URL) | Yes | 🚨 BLOCKED
SourceTrack-Api | Staging | `POSTHOG_PROJECT_ID` | Present (Matches production) | Yes | 🚨 BLOCKED
SourceTrack-Api | Staging | `POSTHOG_API_KEY` | Present (phc_[REDACTED] project key) | Yes (Shared on dashboard) | 🚨 BLOCKED
SourceTrack-Api | Staging | `POSTHOG_PERSONAL_API_KEY` | Present (phx_[REDACTED] personal key) | Yes (Shared on prod API keys) | 🚨 BLOCKED
SourceTrack-Api | Staging | `POSTHOG_HOST` | Present (Reverse proxy URL) | Yes | 🚨 BLOCKED
SourceTrack-Dashboard | Production | `VITE_POSTHOG_API_KEY` | Present (phc_[REDACTED] project key) | Yes | 🚨 BLOCKED
SourceTrack-Dashboard | Production | `VITE_POSTHOG_HOST` | Present (us.i.posthog.com) | Yes | 🚨 BLOCKED
SourceTrack-Dashboard | Staging | `VITE_POSTHOG_API_KEY` | Present (phc_[REDACTED] project key) | Yes | 🚨 BLOCKED
SourceTrack-Dashboard | Staging | `VITE_POSTHOG_HOST` | Present (us.i.posthog.com) | Yes | 🚨 BLOCKED
sourcetrack-health | Production | `POSTHOG_PROJECT_ID` | Present | Yes | 🚨 BLOCKED
sourcetrack-health | Production | `POSTHOG_API_KEY` | Present | Yes | 🚨 BLOCKED

### Redacted Fingerprint / Hash Comparison Evidence

No full key values are printed. Redacted fingerprint analysis details:

```text
POSTHOG_PROJECT_ID:
- staging: same-as-production (416017)
- production: same-as-staging (416017)
- verdict: shared project

POSTHOG_API_KEY (SourceTrack-Api):
- staging: phc_[REDACTED] hash: sha256:afbe702b
- production: phx_[REDACTED] hash: sha256:00b0ecb1
- verdict: different (staging uses write token; production uses query/personal token)

POSTHOG_PERSONAL_API_KEY (SourceTrack-Api):
- staging: phx_[REDACTED] hash: sha256:00b0ecb1
- production: phx_[REDACTED] hash: sha256:d6cb4ecf
- verdict: different (staging personal key matches production write key configuration)

VITE_POSTHOG_API_KEY (SourceTrack-Dashboard):
- staging: phc_[REDACTED] hash: sha256:afbe702b
- production: phc_[REDACTED] hash: sha256:afbe702b
- verdict: same (both environments use the same write key)

POSTHOG_HOST (SourceTrack-Api):
- staging: same-as-production (posthog-reverse-proxy-production-2b25.up.railway.app)
- production: same-as-staging (posthog-reverse-proxy-production-2b25.up.railway.app)
- verdict: shared proxy host
```

## Code Usage Audit
File / Route | Uses PostHog For | Env Vars Used | Risk | Status
--- | --- | --- | --- | ---
[api/lib/posthog.js](file:///Users/ubaid/Desktop/trackiq/api/lib/posthog.js) | Initializing posthog-node client & HogQL querying | `POSTHOG_API_KEY`, `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` | Central initialization; shared config allows staging events to poison production project if project ID is shared. | 🚨 BLOCKED
[api/routes/track.js](file:///Users/ubaid/Desktop/trackiq/api/routes/track.js) | Capturing core visitor pageviews | `POSTHOG_API_KEY`, `POSTHOG_HOST` | Pageview events will land in the shared project. | 🚨 BLOCKED
[api/routes/conversion.js](file:///Users/ubaid/Desktop/trackiq/api/routes/conversion.js) & [api/routes/conversion-offline.js](file:///Users/ubaid/Desktop/trackiq/api/routes/conversion-offline.js) | Capturing conversions | `POSTHOG_API_KEY`, `POSTHOG_HOST` | Conversion events will land in the shared project. | 🚨 BLOCKED
[api/routes/proxy.js](file:///Users/ubaid/Desktop/trackiq/api/routes/proxy.js) | Capturing browser events and pixel visits | `POSTHOG_API_KEY`, `POSTHOG_HOST` | Proxied events will land in the shared project. | 🚨 BLOCKED
[api/routes/identify.js](file:///Users/ubaid/Desktop/trackiq/api/routes/identify.js) & [api/routes/pixel.js](file:///Users/ubaid/Desktop/trackiq/api/routes/pixel.js) | Identifying users & capturing pixel pageviews | `POSTHOG_API_KEY`, `POSTHOG_HOST` | Identification & pixel events will land in the shared project. | 🚨 BLOCKED
[api/routes/shopify-webhook.js](file:///Users/ubaid/Desktop/trackiq/api/routes/shopify-webhook.js) & [api/routes/stripe-webhook.js](file:///Users/ubaid/Desktop/trackiq/api/routes/stripe-webhook.js) & [api/routes/webhook-incoming.js](file:///Users/ubaid/Desktop/trackiq/api/routes/webhook-incoming.js) | Ingesting third-party webhooks | `POSTHOG_API_KEY`, `POSTHOG_HOST` | Third-party events will land in the shared project. | 🚨 BLOCKED

### Configuration Bug Warning

> [!WARNING]
> **Potential BROKEN config**: Production API `POSTHOG_API_KEY` appears to be a personal/query key (`phx_[REDACTED]`), not a project write token (`phc_[REDACTED]`). This mismatch means production server captures may fail or encounter authorization problems. Needs runtime capture verification after staging/production separation is fully resolved.

## Action Taken
Marked as **BLOCKED**. Evaluated PostHog organization configuration via PostHog MCP `projects-get` and `organizations-list` tools, confirming that only one default project (`416017`) is present on the `SourceTrack` organization. Staging and production environment separation requires the operator to manually create a second project (e.g., "SourceTrack Staging") in the PostHog console and generate distinct project tokens and query keys.

The available PostHog MCP tools in this session did not expose a safe project-creation action, so operator console action is required.

## Runtime Verification
Test | Expected | Observed | Status
--- | --- | --- | ---
Discover separate project | Multiple projects found in PostHog account | Only 1 project (`416017`) returned by MCP `projects-get` | ❌ BLOCKED
Ingest test separation | Staging events isolated from production project | Staging and production share project `416017`, causing contamination | ❌ BLOCKED

```text
projects-get returned 1 project:
- Default project
- project_id: 416017
- api_token: [REDACTED_POSTHOG_PROJECT_TOKEN]
```

## Data Contamination Risk
**HIGH**. Since both staging and production API and dashboard services are configured with `POSTHOG_PROJECT_ID=416017`, any action, click, pageview, or conversion tracked in the staging dashboard or by staging webhooks is recorded in the production PostHog project. Although backend reports filter queries by `site_key`, raw event storage is mixed, leading to data contamination and reporting pollution.

## Remaining Blockers
1. **Operator PostHog Project Provisioning**: A separate staging project must be created in the PostHog console.
2. **PostHog Keys Assignment**: Staging Railway services must be updated with the staging-specific `POSTHOG_PROJECT_ID`, `POSTHOG_API_KEY` (write key), and `POSTHOG_PERSONAL_API_KEY` (query key).
3. **Session 140G-25 QA Matrix Block**: Session 140G-25 Full SourceTrack Feature Browser QA Matrix must not start until staging has a separate PostHog project/key set and a unique staging test event is proven present only in staging and absent from production.

## Release Readiness Impact
* **PostHog separation**: remains **BLOCKED** until separate staging credentials are created by the operator.
