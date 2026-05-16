## Last completed: T4.3 — Live Visitors Counter ✅
- live.js exists, registered at /api/live with requireUserAuth
- Dashboard.jsx polls every 30s, renders "X live now" in header
- No changes needed — already fully built

## Next: T4.4 — Custom Tracking Domain (Adblocker Bypass)
Files to create/edit:
- Supabase: ALTER TABLE sites ADD COLUMN custom_domain TEXT, custom_domain_verified BOOLEAN
- New route: api/routes/custom-domain.js
- Settings.jsx: add custom domain input + CNAME instructions + verify button
- tracker.js: use custom domain from site config if set

Paste to start:
  cat ~/Desktop/trackiq/dashboard/src/pages/Settings.jsx
  cat ~/Desktop/trackiq/api/routes/install.js
  head -80 ~/Desktop/trackiq/tracker/tracker.js
