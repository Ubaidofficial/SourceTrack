# CommandCode Runbook

Standard procedures for working on this repo.  
Follow these in order for every session.

## Session Start

```bash
cd "$HOME/Desktop/trackiq"
git status --short
git branch --show-current
```

Read:
1. `RULES.md`
2. `AGENT_BRIEF.md`
3. `PROJECT_CONTEXT_COMPACT.md`
4. `SESSION_STATE.md`
5. `SESSION_HANDOFF.md`
6. `KNOWN_ISSUES.md`
7. `AI_SESSION_PLAN.md`

## Local Servers

Terminal 1 — API:
```bash
cd "$HOME/Desktop/trackiq"
npm run dev
```

Terminal 2 — Dashboard:
```bash
cd "$HOME/Desktop/trackiq/dashboard"
npm run dev
```

Terminal 3 — Static test page:
```bash
cd "$HOME/Desktop/trackiq"
python3 -m http.server 8080
```

## Standard Checks

```bash
# Backend & scripts syntax
cd "$HOME/Desktop/trackiq"
node --check api/index.js api/routes/*.js api/lib/*.js scripts/*.js
node --check scripts/*.mjs

# Git diff/whitespace
git diff --check

# Static launch QA checks (verifies syntax, route mounts, security scoping, grep copy, and dashboard build)
npm run qa:static

# Manual dashboard build (explicitly checks dashboard compiler errors)
cd dashboard && npm run build

# Tracker build (only if tracker source changed)
cd "$HOME/Desktop/trackiq"
npm run build:tracker
```

## CI Regression Pipeline

A lightweight GitHub Actions CI pipeline is set up in `.github/workflows/ci.yml`.

### Boundaries & Constraints:
- **Static & Build-Only:** The CI regression pipeline runs static lint, syntax (`node --check`), git whitespace range checks, static QA audits (`npm run qa:static`), and the dashboard compilation build (`npm run build`).
- **No Live DB or API QA in CI:** Under no circumstances should live-service QA, database/PostHog/Stripe mutation scripts (e.g., `qa:smoke`, `qa:edge`, `qa:attribution`), or webhook QA run in CI. Live-service testing requires active secrets and connections.
- **No CI Secrets:** Do not add database keys, Stripe secrets, or PostHog personal API keys to GitHub repository secrets. If the dashboard or backend compilation requires config variables, use dummy environment variables in the workflow environment.
- **Staging Separation Remains P0:** This lightweight pipeline does not replace local/staging verification. Full environment separation (Staging vs Production) remains a mandatory P0 launch blocker before paid beta release. Live-service QA scripts must stay out of CI until a dedicated staging environment exists.


## Production Deployment Checklist

Use this checklist before and during every deployment to production.

### Phase 1: Pre-Deploy Verification (Local)
1. [ ] Run local checks to confirm syntax and build health:
   ```bash
   node --check api/index.js api/routes/*.js api/lib/*.js scripts/*.js
   node --check scripts/*.mjs
   git diff --check
   npm run qa:static
   cd dashboard && npm run build
   ```
2. [ ] If tracker scripts changed, compile and commit them before pushing:
   ```bash
   npm run build:tracker
   ```
3. [ ] Verify that the GitHub Actions CI pipeline passes successfully. **CI must pass before a deployment is considered healthy.** (Note: Railway deploys are independent and can happen even if CI fails).
4. [ ] Verify staging/prod environment variables (Staging vs Prod remains a P0 paid-beta blocker. This runbook only reduces manual mistakes).

### Phase 2: Database Migration Safety (Supabase)
1. [ ] Ensure the migration does not contain destructive SQL statements. Destructive production migrations are forbidden before paid beta unless they include backup, rollback SQL, and explicit approval.
2. [ ] Apply migrations manually to the production Supabase database.
3. [ ] Refresh database query planner statistics in the SQL Editor:
   ```sql
   ANALYZE attributed_conversions;
   ANALYZE pageviews;
   ```
4. [ ] Verify RLS remains active using:
   ```sql
   select table_name, rowsecurity from pg_tables where schemaname = 'public';
   ```

### Phase 3: Environment Configuration (Railway)
Verify these environment variables are set in the Railway console:
- [ ] Backend `api` service:
  - `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`
  - `POSTHOG_HOST` / `POSTHOG_API_KEY` / `POSTHOG_PROJECT_ID` / `POSTHOG_PERSONAL_API_KEY`
  - `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_ID_STARTER` / `STRIPE_PRICE_ID_GROWTH` / `STRIPE_PRICE_ID_SCALE`
  - `ENCRYPTION_KEY` (must remain stable!)
  - `ST_IP_RESOLVER_MODE=railway`
  - `RESEND_API_KEY`
  - `ALLOWED_ORIGINS` (comma-separated domains)
- [ ] Frontend `dashboard` service:
  - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  - `VITE_API_URL` / `VITE_TRACKER_BASE_URL` / `VITE_FRONTEND_URL`
  - `VITE_POSTHOG_API_KEY` / `VITE_POSTHOG_HOST` / `VITE_POSTHOG_UI_HOST`

### Phase 4: Deploy & Git Promotion
1. [ ] Merge the stable branch to `main` and run:
   ```bash
   git push origin main
   ```
2. [ ] Monitor deployment in the Railway project dashboard for the `api` and `dashboard` services.

### Phase 5: Post-Deploy Smoke Checklist
1. [ ] Verify API health endpoint: `curl -i https://api.sourcetrack.ai/health` returns 200.
2. [ ] Verify tracker delivery:
   - Standard: `curl -I https://api.sourcetrack.ai/tracker.min.js` returns 200.
   - Cookieless: `curl -I https://api.sourcetrack.ai/tracker.cookieless.min.js` returns 200.
3. [ ] Open `https://app.sourcetrack.ai` and verify that the dashboard loads.
4. [ ] Verify that user login functions correctly.
5. [ ] Confirm that the sites list loads successfully without errors.
6. [ ] Verify at least one read-only report loads.
7. [ ] Load the billing page to confirm pricing tiers render correctly, without creating or triggering a Stripe Checkout Session.
8. [ ] Inspect Railway API container logs to confirm there are no startup, database connection, or runtime errors.
9. [ ] Confirm there are no redirection loops in the dashboard logs.
10. [ ] Verify that the Stripe webhook log shows no new delivery failures.
11. [ ] Confirm that the PostHog ingestion stream is not receiving synthetic QA events (QA scripts must bypass production).


## Production Emergency Rollback Runbook

For a comprehensive runbook of all database backups, recovery playbooks, outage protocols, and encryption key loss scenarios, see [backup_recovery.md](file:///Users/ubaid/Desktop/trackiq/docs/backup_recovery.md).

### Scenario A: Application Code Regression
If a release causes crashes or regressions:
1. Locate the last known stable commit SHA via `git log`.
2. Roll back immediately using the **Railway 1-Click Rollback** button for the target service (`api` or `dashboard`) in the Railway console. Railway rollback usually redeploys quickly, but completion must be verified from deployment status, logs, and health checks.

### Scenario B: Database Schema Failure
- **Strict Database Rollback Policy:** Database rollback is migration-specific. Do not run schema rollback SQL unless the migration includes an explicit reviewed rollback section. For additive migrations, prefer forward-fix unless a safe rollback has been proven. Destructive production migrations are forbidden before paid beta unless they include backup, rollback SQL, and explicit approval.

### Scenario C: Webhook Decryption Failures
- If integrations fail to decrypt webhook secrets on the backend (e.g. Meta/Stripe integration errors):
1. Confirm `ENCRYPTION_KEY` matches the previous deployment's key value.
2. Restore the previous stable `ENCRYPTION_KEY` hex string in the Railway API service and restart the server.


## Production Observability & Monitoring Runbook

Use this guide to verify production health, investigate incidents, and monitor background sync jobs.

### 1. Log Locations & Inspection

#### Railway Server Logs (App & API)
- **Web Console:** Open the Railway Project Dashboard, click the target service (`api` or `dashboard`), and navigate to the **Deployments -> View Logs** tab for real-time logs.
- **Railway CLI:** Install the Railway CLI (`npm install -g @railway/cli`) and run:
  - `railway logs -s api` (for the backend API service)
  - `railway logs -s dashboard` (for the frontend dashboard service)

#### GitHub Actions CI Logs
- Navigate to the GitHub repository, click on the **Actions** tab, and select the latest run of the CI workflow to view build checks, whitespace validation, and static linting logs.

#### Stripe Webhook Logs
- Log in to the Stripe Dashboard, navigate to **Developers -> Webhooks**, select the SourceTrack endpoint (`https://api.sourcetrack.ai/api/webhooks/stripe` or `/api/billing/webhook`), and inspect the **Event history** list. Here you can view status codes, request bodies, and signature headers for every Stripe webhook event dispatched.

#### Supabase Database Logs
- Log in to the Supabase Console, select the project, and navigate to **Database -> Logs -> Postgres Logs** or **API Gateway** logs to debug query execution times, connection pools, and database error states.

#### PostHog Ingestion & Events
- Log in to your PostHog instance, navigate to the target project, and check the **Live Events** stream or use HogQL query tools under the **Product Analytics -> Query** tab to verify raw telemetry ingestion.

---

### 2. Cron & Job Monitoring Expectations

The background sync cron jobs run on the backend API container. Monitor their execution status by querying the `job_runs` table in the production Supabase database:

| Job Name | Schedule / Frequency | Expected Action | Error Visibility |
| --- | --- | --- | --- |
| `nightly-attribution` | Daily at ~01:00 UTC | Attributes visitor touchpoints to conversions for paid-plan sites | Slack alerts may be sent via `SLACK_WEBHOOK_URL` if configured/verified. Records status in `job_runs` table. |
| `health-agent` | Hourly | Runs system-wide checks (Supabase, PostHog, `/health`, data flow) | May post warning/critical alerts to Slack if `SLACK_WEBHOOK_URL` is configured/verified. |
| `email-reports-weekly` | Weekly | Sends HTML attribution performance reports to site owners | Records status in `job_runs` table. Check database for logs. |
| `email-reports-monthly` | Monthly | Sends monthly HTML attribution reports to site owners | Records status in `job_runs` table. Check database for logs. |
| `usage-threshold-emails`| Daily at ~14:00 UTC | Audits pageview caps vs plans; sends emails at 50%, 80%, and 100% caps | Records status in `job_runs` table and records logs in `usage_email_log`. |
| `data-quality-check` | Daily | Audits UTM coverage, duplicate conversion rates, and freshness | Records status in `job_runs`, `data_quality_reports`, and `data_quality_alerts` tables. |

---

### 3. Incident Severity Classifications

When diagnosing problems, classify them as follows:

#### P0 (Severe System Impact) — Immediate Alert & Action Required
- **Definition:** Core ingestion or conversion pipelines are failing, or the user dashboard is completely offline.
- **Examples:**
  - Express API server crashes on startup or goes unresponsive (`/health` returns non-200 or connection times out).
  - Stripe webhook signature verification fails globally (incoming payments ignored).
  - Supabase database writes fail (cannot store session identity links, attributed conversions, or api keys).
  - PostHog ingestion drops to zero or returns 401/403 credentials error.
- **Action:** Initiate emergency rollback to the last stable container deploy or restore the correct stable env vars (`ENCRYPTION_KEY`, etc.).

#### P1 (Operational Warning) — Investigate within 24 Hours
- **Definition:** Background tasks, email queues, or secondary checks fail, but core tracker ingestion remains active.
- **Examples:**
  - A scheduled job (e.g., `nightly-attribution`, `email-reports`) fails or runs stale.
  - A site's duplicate conversion rate warning is triggered (duplicate tracker pixel detected).
  - The Resend API fails to deliver threshold alerts or weekly reports.
- **Action:** Check `job_runs` and `data_quality_alerts` table details; run jobs manually in dev/staging environments to reproduce.

---

### 4. Known Monitoring Blind Spots

Before paid-beta launch, be aware of the following system blind spots:
1. **No Frontend Error Tracking:** There is currently no active Sentry or JS runtime tracking configured in the `dashboard` browser bundle. React/client-side failures will go unnoticed unless reported manually by a user.
2. **No External Uptime Monitoring:** There is no external pinging monitor checking DNS, SSL, or server latency. Process crashes must be manually identified via Slack alert silence, Railway container logs, or dashboard loads.
3. **Highest-Risk Observability Gap:** No real-time exception monitoring/alerting such as Sentry or equivalent, no structured logs, no public status page, and no automated incident paging. Current readiness is acceptable only for small paid beta with manual operator monitoring.


## Health Checks (servers running)

```bash
curl -i http://localhost:3000/health
curl -I http://localhost:3000/tracker.min.js
curl -I http://localhost:3000/tracker.cookieless.min.js
curl -I http://localhost:8080/sourcetrack-test.html
```

## Manual QA URLs

```
Dashboard:    http://localhost:5173
Event Logger: http://localhost:5173/debugger
Report Builder: http://localhost:5173/report-builder
Settings:     http://localhost:5173/settings
Snippet:      http://localhost:5173/snippet
```

## UTM Test URLs

```
http://localhost:8080/sourcetrack-test.html?utm_source=google&utm_medium=cpc&utm_campaign=session78
http://localhost:8080/sourcetrack-test.html?ref=twitter
http://localhost:8080/sourcetrack-test.html?source=newsletter&via=email
```

## Session End

1. Run standard checks
2. Update `SESSION_HANDOFF.md`
3. Update `SESSION_LOG.md`
4. Update `AI_SESSION_PLAN.md` (mark session status)
5. Update `SESSION_STATE.md`
6. Update `BUG_REVIEW_LOG.md` if bugs found
7. Update `MANUAL_QA_BACKLOG.md` if QA performed
8. Run `git diff --check`
9. Run `git status --short`

## Before Commit

- All checks pass
- Manual QA performed if applicable
- No `.env`, secrets, `.bak` files, or test artifacts in diff
- Commit message format (HEREDOC):
```bash
git commit -F - <<'EOF'
Commit message here.

Co-authored-by: CommandCodeBot <noreply@commandcode.ai>
EOF
```

## Emergency Procedures

### Port conflict
```bash
lsof -ti :3000 | xargs kill -9   # Kill API
lsof -ti :5173 | xargs kill -9   # Kill dashboard
lsof -ti :8080 | xargs kill -9   # Kill static server
```

### Reset uncommitted changes
```bash
cd "$HOME/Desktop/trackiq"
git checkout -- .
```

### Check what's changed since last commit
```bash
cd "$HOME/Desktop/trackiq"
git diff --stat
git status --short
```

## Supabase Verification

Run in Supabase SQL Editor:
```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('sites','companies','company_members','saved_reports','dashboard_widgets','admin_audit_log','qa_notes')
order by table_name;
```

## HogQL Rules

- Table: `events` only
- Use `toFloatOrZero`, not `toFloat64OrZero`
- Use `countIf()`, not `COUNT(CASE WHEN...)`
- Qualify `distinct_id` in joins
- Date format: `timestamp >= toDateTime('2024-01-01 00:00:00')`

---

## Resend & Transactional Email Operations

### 1. Domain & DNS Configuration (Resend Dashboard)
Before starting production mail operations, ensure the sending domain is fully verified:
1. Log into the Resend Console and add `sourcetrack.ai` as a sending domain.
2. Publish the generated **DKIM** CNAME records to the domain's DNS provider.
3. Publish a valid **SPF** TXT record authorizing Resend's sending IPs.
4. Publish a valid **DMARC** TXT record protecting the domain (e.g. `_dmarc.sourcetrack.ai`).

> [!WARNING]
> Resend domain verification and DNS records cannot be validated programmatically by the SourceTrack application. Operators must verify domain status directly within the Resend Dashboard.

### 2. Operational Monitoring (Database & Resend Logs)
- **Check Cron Job Runs:** Verify that `email-reports-weekly`, `email-reports-monthly`, and `usage-threshold-emails` jobs are executing successfully by inspecting the `job_runs` table:
  ```sql
  SELECT job_name, status, details, ran_at FROM job_runs ORDER BY ran_at DESC LIMIT 10;
  ```
- **Check Sent Usage Alerts:** Track monthly usage alerts sent to clients in the `usage_email_log` table:
  ```sql
  SELECT site_id, month, threshold, created_at FROM usage_email_log ORDER BY created_at DESC LIMIT 10;
  ```
- **Check Bounces and SMTP Errors:** Recipient-level bounces, spam complaints, and queue status must be reviewed directly in the **Resend Dashboard** logs under the emails section.

### 3. Stripe Billing Email Boundary
- All subscription-related emails (invoices, receipts, subscription confirmations, renewal successes, and payment failures) are **exclusively owned and delivered by Stripe**.
- Do not modify or write application-level templates or mail jobs for billing notifications; manage invoice email configurations directly inside the Stripe merchant dashboard.

---

## Stripe & Billing Operations

### 1. Stripe Mode Alignment (P0 Safety Requirement)
- **Stripe Mode Isolation:** There is no hardcoded live/test distinction in code; mode safety depends entirely on environment variables. Mode safety is critical: **never mix live Stripe credentials with test-mode configurations**.
  - If `STRIPE_SECRET_KEY` starts with `sk_test_`, all price variables (`STRIPE_PRICE_ID_*`) and webhook secrets (`STRIPE_WEBHOOK_SECRET`) **must** belong to Stripe test mode.
  - If `STRIPE_SECRET_KEY` starts with `sk_live_`, all price variables and webhook secrets **must** belong to Stripe production mode.
  - Mixing credentials and resources between modes will trigger API failures and crash client checkouts.

### 2. Webhook & Portal Path Verifications
- **Path Isolation:** Ensure webhook endpoints are routed correctly:
  - Platform subscription updates: Configure Stripe to forward events to `/api/billing/webhook`.
  - Customer site conversions: Configure client Stripe accounts to forward events to `/api/webhooks/stripe/:site_key`.
- **Secret Verification:** Confirm that the configured webhook secret in the Stripe Dashboard matches the exact endpoint environment variable (`STRIPE_WEBHOOK_SECRET` for platform billing).
- **Billing Portal Config:** In the Stripe test mode dashboard, ensure the **Customer Portal Settings** are enabled and configured with the allowed redirect domains to prevent portal redirect blocks.
- **No Real Payments:** Ensure that under no circumstances are production cards or live payments executed during test-mode QA or staging validation. Use Stripe test cards exclusively (e.g. `4242 4242 4242 4242`).

---

## Staging & Production Separation Guidelines

### 1. Environment Isolation Expectations
- **Supabase Isolation:** Staging database and production database (`zxjjjsipafojhzkkumvh`) must belong to separate projects.
- **PostHog Isolation:** Staging and production telemetry must be routed to separate PostHog project IDs.
- **Stripe Isolation:** Stripe Test Mode is strictly for local/staging, and Stripe Live Mode is strictly for production.
- **Resend Isolation:** Leave `RESEND_API_KEY` blank in local/staging to log emails to the console, or use a dedicated test api key.

### 2. Dashboard CORS Configuration
- In staging environments, operators **must** add the staging dashboard domain (e.g., `https://staging-app.sourcetrack.ai`) to the API server's `ALLOWED_ORIGINS` environment variable. If omitted, dashboard actions will fail due to CORS.

### 3. Database Migration Safety
- Never run database migration scripts automatically as part of build or deploy.
- All migrations must be copy-pasted manually into the Supabase project SQL Editor, eliminating accidental CLI migration runs on production.

---

## Incident Response & Observability Guidelines

### 1. Health Verification & Log Inspection
- **Process Health Check:** Verify the Express server is running and responding by sending a request to `/health`.
  ```bash
  curl -i https://api.sourcetrack.ai/health
  ```
- **Inspect Application Logs:** Use the Railway Console or CLI to view container stdout/stderr. Trace uncaught exceptions or unhandled rejections:
  ```bash
  railway logs -s api
  ```
- **Inspect Database Status:** Monitor Postgres logs in the Supabase console under Database -> Logs.
- **Check Cron Job Execution:** Query the `job_runs` table in the Supabase SQL editor to inspect recent run statuses and errors:
  ```sql
  SELECT job_name, status, details, ran_at FROM job_runs ORDER BY ran_at DESC LIMIT 10;
  ```

### 2. External Webhook & Email Inquiries
- **Verify Stripe Webhooks:** Tracing webhook delivery failures or signature problems must be checked directly under Developers -> Webhooks inside the Stripe dashboard.
- **Verify Resend Mail:** Review email delivery status, bounces, and domain DNS health inside the Resend console.

### 3. Incident Triage & Mitigation
- **P0 Outages:** If the dashboard or API is completely offline, verify credentials/env variables in Railway and restart the service. If it is a recent deploy bug, perform an immediate rollback.
- **Railway Rollback:** Select the affected service, click on the last known stable deploy container, and click the **Rollback** button.
- **Customer Notifications:** If a P0 outage exceeds 30 minutes, draft a simple status email to active users informing them of the downtime without making SLA or compensation promises.
