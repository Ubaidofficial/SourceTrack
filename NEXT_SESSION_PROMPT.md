# Next Session Prompt: Session 102.2

Copy and paste the prompt below into the chat to begin the next development session.

---

```markdown
We are starting **Session 102.2 — SourceTrack Doctor & Tracking Health Alerts**.

Please perform the work for this session following these requirements:

### Goal
Implement the SourceTrack Doctor: a tracking health monitor that alerts the user if active pixel tracking goes offline.

### Context & Baseline
- We recently completed Session 102.1. Pixel telemetry data (`last_seen_at` and `onboarding_state`) is now updated directly in the `sites` database table when events are ingested.
- PostHog-based scripts are bypassed for verification, meaning we can check site health directly using Supabase fields.
- The `data_quality_alerts` database table is referenced in `api/jobs/data-quality-check.js` to store site metrics warnings and errors.

### Files to Inspect
- `api/jobs/data-quality-check.js` — Reference file for writing job files, database inserts, and classifications.
- `api/routes/dashboard.js` — The backend router that serves the `/overview` stats and alerts payload.
- `dashboard/src/pages/Dashboard.jsx` — Renders the `overview.alerts` array in the dashboard view.
- `SUPABASE_SCHEMA.md` — Reference for Supabase tables.

### Requirements to Implement
1. **Analyze Existing Job & Alert Patterns**:
   - First, inspect existing job/alert patterns in the repo.
2. **Implement Health Logic**:
   - If `data_quality_alerts` and job conventions are safe and already established, implement a lightweight daily health agent script (`api/jobs/health-agent.js`):
     - Select active sites (plan !== 'inactive' or 'archived').
     - Check if `last_seen_at` is older than 48 hours.
     - If true, log/insert a critical severity alert ('Tracking Offline') into the `data_quality_alerts` table.
     - If the site becomes active again (`last_seen_at` is fresh), clean up/delete the 'Tracking Offline' alert from the table.
   - If job/alert conventions are not safe or fully established, instead implement only a lightweight dashboard tracking-health endpoint/card in `api/routes/dashboard.js` and `Dashboard.jsx`, and document proactive cron job alerts as deferred.
3. **Expose Health Alerts in Dashboard**:
   - In `/api/dashboard/overview`, retrieve any active tracking offline alerts and append/merge them into the returned `alerts` array.
4. **Important Limitations**:
   - Avoid any database schema changes.
   - Do not build email, SMS, or Slack alerts.
   - Do not overbuild monitoring. Keep it simple and lightweight.

### What NOT to Touch
- Do not edit the core attribution engine SQL queries.
- Do not change `/api/track` or `/api/conversion` ingestion routing.
- Do not modify Stripe billing webhooks or database schemas.
- Do not change the stepper layout in `Onboarding.jsx`.

### Validation
- Verify syntax check:
  `node --check api/routes/dashboard.js api/jobs/health-agent.js`
- Test run job script to verify there are no database or reference errors:
  `node api/jobs/health-agent.js`
- Verify dashboard build compiles cleanly:
  `cd dashboard && npm run build`

### Committing & Output
- Provide the exact terminal outputs of:
  - `git diff --stat`
  - `git diff -- api/jobs/health-agent.js api/routes/dashboard.js`
  - `git status --short`
- DO NOT commit until reviewed.
```
