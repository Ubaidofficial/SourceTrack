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
# Backend syntax
cd "$HOME/Desktop/trackiq"
node --check api/index.js
node --check api/routes/track.js
node --check api/routes/conversion.js
node --check api/routes/attribution.js
node --check api/lib/attribution-engine.js

# Dashboard build
cd "$HOME/Desktop/trackiq/dashboard"
npm run build

# Tracker build (only if tracker source changed)
cd "$HOME/Desktop/trackiq"
npm run build:tracker
```

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
