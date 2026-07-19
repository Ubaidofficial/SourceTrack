# QA Report: Production Observability Code Hooks (Session 140G-19)

## Audit Findings
- Prior state had listeners for `uncaughtException` and `unhandledRejection` printing plain errors to `console.error` and exiting, but lacked request-level tracing, structured log formats, central error normalization, or API health checks.
- Sensitive information, PII, and secrets were at risk of being logged under default handlers or stack traces.
- Raw path segments (e.g. sharing tokens, site keys) were at risk of leaking via `req.path` logging.

## Implemented Observability Hooks

### 1. Request ID Middleware (`api/middleware/request-id.js`)
- Sanitizes incoming `x-request-id` headers (string only, max 80 chars, allowing only alphanumeric and `_.-`).
- Generates a UUIDv4 fallback if missing or invalid.
- Propagates `req.requestId` to Downstream Request Context.
- Appends `X-Request-Id` to response headers.

### 2. Safe Logger Helper (`api/lib/safe-logger.js`)
- Formats logs as JSON containing `timestamp`, `level` (`info`, `warn`, `error`), and `event`.
- Redacts sensitive keys case-insensitively: `authorization`, `cookie`, `password`, `token`, `secret`, `api_key`, `apikey`, `stripe`, `supabase`, `posthog`, `email`, `phone`, `name`, `checkout_session_id`, `stripe_session_id`, `session_id`, `site_key`, `site_id`, `key`, `uid`, `user_id`, `anonymous_id`, `visitor_id`, `ip`, `x-forwarded-for`, `referer`, `referrer`, `origin`.
- Drops raw query parameters and request bodies by checking for substring `query` or `body` inside keys.
- Strips URL query strings from all logged string values (truncating at `?`).
- **Scrubs Error Messages**: Sanitizes `Error.message` properties to strip URL query parameters, redact email patterns (`[REDACTED_EMAIL]`), redact key/token patterns (`[REDACTED_KEY]`), and truncate to a maximum length of 300 characters.
- **Safe Path Normalizer (`sanitizeLogPath`)**: Converts paths to prevent token/identifier leaks. For example:
  - `/api/public/secret-dashboard-token-123` -> `/api/public/:token`
  - `/api/webhooks/shopify/sk_test_123` -> `/api/webhooks/shopify/:site_key`
  - Long identifiers or hex segments -> `:id`
- Constrains nesting depth to `2` to prevent deep serialization overhead.

### 3. Request Completion Logger (`api/index.js`)
- Intercepts requests early and hooks `res.on('finish')` to calculate total duration in milliseconds.
- Logs only for non-ingestion API routes (`/api/...`, `/sp/...`, `/track`) to prevent high-volume log spam.
- Ingestion routes explicitly skipped:
  - `/api/track`
  - `/api/collect`
  - `/track`
  - `/api/conversion`
  - `/api/conversion/offline`
  - `/api/identify`
  - `/api/tracker/id`
  - `/sp/e`
  - `/sp/c`
  - `/sp/pixel.gif`
  - `/api/pixel`

### 4. Health Check Endpoint (`api/index.js` - `GET /api/health`)
- Exposes a minimal liveness check returning a success flag, status description, timestamp, and request ID.
- Intentionally performs no database query, env var lookup, or credentials exposure.

### 5. Central Safe Error Handler (`api/index.js`)
- Catches unhandled Express errors, logs them using the safe logger (excluding stack traces, sanitizing path with `sanitizeLogPath`), and responds to the client with a generic response:
  ```json
  {
    "success": false,
    "data": null,
    "error": "Internal server error",
    "request_id": "<id>"
  }
  ```
- **Client Error Sanitization**: Non-500 errors do not leak arbitrary message contents to the client. Returns generic `'Request failed'` / `'Internal server error'` unless `err.publicMessage` is explicitly defined.

## Tests Added
Structured tests in `api/tests/observability.test.js`:
- Request ID generation, passthrough, and sanitization validation.
- Safe logger key redaction, nested field drop, array element cleaning, and error message scrubbing.
- Log path normalization (public dashboard tokens, shopify site keys, UUIDs/hex IDs).
- Health endpoint schema verification.
- Error handler client error message limits and log format assertions.

All tests executed via `npm run qa:identity:unit`.

## Remaining Observability Gaps
- **Uptime Monitoring**: External heartbeat / synthetics monitor (e.g. Better Uptime) is not configured.
- **Log Aggregator**: Logs are printed to stdout/stderr; third-party retention and parsing (e.g., Logtail / Axiom) is not selected.
- **Alerting Rules**: Uptime and log alert thresholds (e.g. 5xx rates) are not configured.
- **Staging / Production Smoke**: Live browser-based telemetry testing has not been run post-deployment.
- **Incident Workflow**: Live runbooks for post-incident analysis are pending.
- **Distributed Tracing**: APM monitoring (e.g., OpenTelemetry) is deferred.

## Verdict

```text
PARTIAL — code-level observability hooks added; production observability gate remains open pending alerting, retention, external monitoring decision, and staging/production verification.
```
