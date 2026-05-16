## Last completed: T3.1 — Cookieless Tracking Mode ✅
- tracker.js: cookieless=true skips all cookies/localStorage
- Uses session-scoped UUID only — GDPR Art. 5 compliant
- Cross-domain __tq_id still works in cookieless mode
- Activate with: window.__trackiq_config = { cookieless: true, ... }

## Next: T7 — Analytics Product
Largest remaining work. New lightweight tracker + pageviews table + Analytics.jsx page.
Files to create:
  tracker/analytics.js (new lightweight tracker)
  api/routes/analytics.js (collect + summary endpoints)
  dashboard/src/pages/Analytics.jsx
Supabase: CREATE TABLE pageviews (...)

Start with:
  ls ~/Desktop/trackiq/tracker/
  grep -n "analytics" ~/Desktop/trackiq/api/index.js | head -5
