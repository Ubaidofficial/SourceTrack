# Production Observability Readiness Audit
**Session:** 140Z-G3-D15
**Status:** PARTIAL PASS (Observability minimal but safe)
**Date:** 2026-06-20

## Goal
Audit production observability to ensure the platform is minimally monitorable without exposing secrets or making false claims.

## 1. Observability Audit Findings
The platform implements a lightweight, log-based observability strategy. It relies on standard stdout/stderr JSON logging for the backend, while frontend exception monitoring is currently absent. No heavy APM (Application Performance Monitoring) tools are integrated.

## 2. Existing Health Checks and Request Tracing
- **`/api/health`**: Implemented correctly. It returns a standard JSON payload with `status: 'ok'`, `service: 'api'`, a timestamp, and a `request_id`. It does not expose database connections, internal metrics, or secrets.
- **Request Tracing**: A `requestIdMiddleware` generates or sanitizes an `X-Request-Id` for every request. This ID is passed through to logs, ensuring that errors can be correlated to specific API calls.
- **API Logging**: `api/lib/safe-logger.js` handles all structured JSON logging. Requests are logged on completion (`duration_ms`, `status`, `path`), except for high-volume ingestion routes (`isIngestionPath`) which are intentionally skipped to prevent log bloat.

## 3. Existing Frontend/Runtime Monitoring
- **Absent.** The frontend SPA (`dashboard/src/main.jsx`) does not integrate Sentry, PostHog error capture, LogRocket, or any other client-side exception tracker.
- **Impact:** Console errors or React crash boundaries will fail silently from the operator's perspective. Customers must report UI bugs manually.

## 4. Existing API/Ingestion/Webhook/Billing Visibility
- **Webhooks & Billing**: Stripe webhooks and conversion logic use `logInfo` and `logError` to write to stdout. Failures are captured in the Railway logs but do not trigger explicit external alerts.
- **Global Error Handler**: A secure Express error handler intercepts crashes, logs the sanitized error (`logError`), and returns a generic 500 response to the client unless `err.publicMessage` is explicitly set.
- **Process Security**: `uncaughtException` and `unhandledRejection` handlers securely log the error message and stack trace before terminating the process (`process.exit(1)`), preventing zombie states or memory leaks without leaking environment variables.

## 5. Existing Operator/Customer-Support Visibility
- If a customer reports "tracking is not working", the operator has access to the **Event Logger** and **Setup Doctor** in the UI to visually trace incoming events.
- Backend errors must be manually investigated by searching Railway logs for the customer's `site_key` (sanitized) or `request_id`.

## 6. Missing Monitoring/Alerting Gaps
- **Alerting**: No active push alerts (e.g., Slack, PagerDuty, BetterUptime) exist for downtime or high error rates.
- **Frontend Errors**: No client-side exception tracking.
- **Incident Status Page**: No public status page is linked or maintained.
- **Verdict**: These gaps are acceptable for a minimum viable product, provided we do not claim to have "24/7 monitoring" or "automatic alerts" on the marketing site.

## 7. Log/PII/Secret Safety Findings
- **`safe-logger.js`**: Thoroughly redacts sensitive keys recursively (`cookie`, `authorization`, `password`, `token`, `secret`, `api_key`, `stripe`, `email`, etc.).
- **URL Sanitization**: Query strings are automatically stripped from log paths and Error messages to prevent leaking personal info embedded in URLs.
- **Path Sanitization**: `sanitizeLogPath` replaces sensitive tokens and long hex IDs with `:token` or `:id` (e.g., `/api/public/:token`).
- **Safety**: The standard logger path is designed to redact JWTs, cookies, and secrets before they reach Railway logs.

## 8. Final Verdict
**PARTIAL PASS.** Observability is minimal but sufficient for this partial observability audit. No PII or secrets were found in this audit/validation output. Alerting and frontend monitoring are completely absent, which means incident discovery will be manual or customer-reported. This is a documented baseline, but not enough to close the release gate as long as no false claims about "monitored everywhere" are made.

This session does not close the Production Observability release gate because frontend exception capture, proactive alerting, and log retention confirmation remain missing.
