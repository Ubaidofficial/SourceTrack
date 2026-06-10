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
2. [ ] Verify tracker delivery: `curl -I https://api.sourcetrack.ai/tracker.min.js` returns 200.
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

### Scenario A: Application Code Regression
If a release causes crashes or regressions:
1. Locate the last known stable commit SHA via `git log`.
2. Roll back immediately using the **Railway 1-Click Rollback** button for the target service (`api` or `dashboard`) in the Railway console (resolves in ~30 seconds).

### Scenario B: Database Schema Failure
- **Strict Database Rollback Policy:** Database rollback is migration-specific. Do not run schema rollback SQL unless the migration includes an explicit reviewed rollback section. For additive migrations, prefer forward-fix unless a safe rollback has been proven. Destructive production migrations are forbidden before paid beta unless they include backup, rollback SQL, and explicit approval.

### Scenario C: Webhook Decryption Failures
- If integrations fail to decrypt webhook secrets on the backend (e.g. Meta/Stripe integration errors):
  1. Confirm `ENCRYPTION_KEY` matches the previous deployment's key value.
  2. Restore the previous stable `ENCRYPTION_KEY` hex string in the Railway API service and restart the server.


## Health Checks (servers running)

```bash
curl -i http://localhost:3000/health
curl -I http://localhost:3000/tracker/tracker.min.js
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
