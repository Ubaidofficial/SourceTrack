# SourceTrack Production Observability & Incident Response

This document establishes the observability architecture, logging inventory, incident severity classifications, response checklists, and rollback runbooks for the SourceTrack platform.

---

## 1. Health Endpoint Status

SourceTrack mounts a process liveness check endpoint at:

- **Endpoint:** `GET /health`
- **Output:** `{ "status": "ok", "timestamp": "2026-06-10T21:02:15.000Z" }`
- **Status Code:** `200 OK`
- **Scope & Limitations:** The health endpoint validates that the Express application process is running and responding. It is a **liveness check only** and does not actively test database connectivity (Supabase) or external APIs (PostHog, Stripe) to prevent database resource exhaustion during high-frequency automated polling.

### Background Health Monitoring
System-wide dependency checks are handled asynchronously by the background health agent:
- **Script:** `api/jobs/health-agent.js`
- **Frequency:** Hourly cron
- **Checks:** Supabase connectivity, PostHog connectivity, API liveness via `/health`, nightly attribution job staleness, active sites count, data flow (24h pageview events), conversions (48h count), DeepSeek API balance, environment variables, and process memory.
- **Notification:** Some Slack-style alerting appears supported by health/job agents if the required webhook/config exists, but actual alert delivery and routing require provider/environment verification. Most incident detection still depends on manual log/provider-console inspection.

---

## 2. Log Inventory

SourceTrack utilizes standard console logging (`console.log`, `console.warn`, `console.error`) routed to stdout/stderr. Log outputs are categorized as follows:

| Log Type | Source File / Module | Purpose | Captured Details |
| :--- | :--- | :--- | :--- |
| **Global Errors** | `api/index.js` | Traps uncaught exceptions & rejections | Timestamps, fatal messages, stack traces |
| **Rate Limit Hits** | `api/middleware/rate-limit.js` | Monitors rate-limiting events | Anonymized IP hash, bucket type, path |
| **Job Runs** | `api/jobs/*` | Monitors cron job execution | Start times, success/failure status, processed item counts, errors |
| **Webhooks** | `api/routes/stripe-webhook.js`<br>`api/routes/shopify-webhook.js` | Webhook verification & ingestion | Signature checks, decryption status, idempotency hits, database write results |
| **Ingestion Errors**| `api/routes/track.js`<br>`api/routes/conversion.js` | Pixel telemetry checks | Invalid site keys, inactive plan rejections, payload validation errors |

---

## 3. Provider-Console Monitoring Checklist

When auditing or diagnosing system health, operators must inspect the following console layers:

### Railway Logs & Deploys
- [ ] Open the **Railway Project Console** and navigate to the `api` or `dashboard` service.
- [ ] Check the **Deployments** tab to verify that the active deploy is green and running.
- [ ] Inspect the **Logs** stream for startup exceptions, database connection timeouts, or uncaught rejections.

### Supabase DB & API Logs
- [ ] Log in to the **Supabase Console** for the active project.
- [ ] Navigate to **Database -> Logs -> Postgres Logs** to check for database connection pooling exhausted, deadlock statements, or failed query plan selections.
- [ ] Navigate to **API Gateway** logs to trace REST request latency or 5xx responses.

### PostHog Ingestion Health
- [ ] Log in to the **PostHog Console** for the environment's project.
- [ ] Navigate to **Product Analytics -> Live Events** to verify that client-side `$pageview` and `$custom` events are flowing from customer sites in real time.
- [ ] Navigate to **Product Analytics -> Query** and run a HogQL test query to verify ClickHouse API query latencies.

### Stripe Webhook Delivery Logs
- [ ] Log in to the **Stripe Dashboard** (Test Mode or Live Mode depending on environment).
- [ ] Navigate to **Developers -> Webhooks** and select the SourceTrack endpoint.
- [ ] Inspect the **Event history** to review webhook delivery statuses (HTTP 200, 4xx, or 5xx) and payload structures.

### Resend Delivery & Bounce Logs
- [ ] Log in to the **Resend Console**.
- [ ] Inspect the **Emails** tab to check sending status, successful deliveries, open rates, spam complaints, and bounces.
- [ ] Verify that DNS records (DKIM, SPF, DMARC) read "Verified" under the domains tab.

### GitHub Actions CI
- [ ] Open the repository **Actions** tab on GitHub.
- [ ] Check the status of the **CI Regression Pipeline** workflow runs to verify linting, syntax compilation, and build sanity.

---

## 4. Incident Severity Classifications

| Severity | Definition | Examples | SLA / Alert Action |
| :--- | :--- | :--- | :--- |
| **P0** | Core platform offline, dashboard down, or event ingestion completely blocked. | - API server returns 5xx or fails to respond.<br>- DB connection pool exhausted.<br>- Stripe signature verification fails globally. | **Immediate Response:** Slack notification triggered by health agent. Operator must triage within 1 hour. |
| **P1** | Core tracking is active, but background tasks, email cron jobs, or integrations fail. | - Nightly attribution job fails.<br>- Weekly report emails fail to send.<br>- Ad platform cost sync fails. | **24h Triage:** Operator reviews logs and databases, run job manually in dev/staging to diagnose. |
| **P2** | Cosmetic UI bugs or minor usability gaps that do not affect tracking or billing. | - Dashboard widget alignment bug.<br>- Missing documentation link.<br>- Tooltip copy typo. | **Next-Deploy Fix:** Tracked in task backlog; resolved during next standard development sprint. |

---

## 5. Incident Response Checklist

During a P0/P1 incident, the operator must execute the following response checklist:

- [ ] **Triage & Scope:**
  - Check `/health` endpoint to see if the process is alive.
  - Review Railway API logs to determine if it is a startup crash, database connection outage, or credential failure.
  - Verify if the issue affects all sites or a single customer tenant.
- [ ] **Mitigate:**
  - If code regression, roll back immediately (see Rollback Checklist).
  - If database connection spike, restart the API container in Railway to release connections.
  - If Stripe webhook signature secret expired, rotate the secret in Stripe and update the environment variable in Railway.
- [ ] **Verify:**
  - Hit `/health` to verify server recovery.
  - Check PostHog Live Events to verify that ingestion is resumed.
  - Check Supabase Postgres logs to confirm query performance has normalized.
- [ ] **Notify (Optional):**
  - If outage exceeds 30 minutes, notify customers (see Customer Communication Plan).

---

## 6. Rollback Checklist

If a deployment triggers a P0 outage, roll back to the last stable release using this checklist:

- [ ] Identify the last stable commit SHA using `git log`.
- [ ] Navigate to the Railway Console, select the affected service (`api` or `dashboard`), click on the stable deploy container, and click **Rollback**.
- [ ] Monitor the deployment log to ensure the container builds and boots successfully.
- [ ] Run basic smoke test commands:
  ```bash
  curl -i https://api.srctk.com/health
  curl -I https://api.srctk.com/tracker.min.js
  ```
- [ ] Verify that startup logs show no new uncaught rejections or connection failures.

---

## 7. Customer Communication & Outage Plan

SourceTrack does not guarantee formal SLAs or 24/7 uptime during the paid beta. However, maintaining user trust is a priority:

- **30-Minute Boundary:** If a P0 outage persists for longer than 30 minutes, operators must draft a brief status email to active users.
- **Truthful Status Copy:** Keep communication simple and honest:
  - State clearly that the platform is experiencing a temporary service interruption.
  - Reassure users that historical database records are safe.
  - Clarify that any pixel pageviews missed during the downtime may be unattributed.
- **No SLAs:** Never promise monetary credits, uptime percentages, or guaranteed response times.

---

## 8. Key Observability Gaps

Operators must address these gaps before public launch:

- **Highest-risk gap:** No real-time exception monitoring/alerting such as Sentry or equivalent, no structured logs, no public status page, and no automated incident paging. Current readiness is acceptable only for small paid beta with manual operator monitoring.

### Status Page Gap
- **Description:** There is no public-facing status page (e.g. statuspage.io) showing live API uptime or historic outages.
- **Triage Impact:** Users cannot self-diagnose system downtime, increasing support tickets during outages.

### Real-time Exception Alerting Gap
- **Description:** Express process crashes log stack traces to Railway, but the team is only alerted if they manually check Railway logs or wait for the hourly Slack health agent to poll.
- **Triage Impact:** Outages occurring between hourly crons may go unnoticed for up to 59 minutes.
- **Mitigation:** Integrate Sentry or a real-time log monitoring notifier before migrating to public launch.
