## Last completed: T4.2 — Public Share Link
- public_share_token + public_share_enabled already in sites table
- /api/routes/public-dashboard.js already exists (check it's wired in index.js)
- Settings.jsx toggle + copy link: fully built
- Build: passing (committed 4a97afb)

## Next: T4.3 — Live Visitors Counter
File to edit: api/routes/live.js (already exists — check if endpoint is complete)
Dashboard.jsx already polls /api/live every 30s and shows live count in header
Task: verify live.js queries PostHog for distinct anonymous_ids in last 5 min
