## Last completed: Server-side proxy ✅
- api/routes/proxy.js: POST /sp/e (pageview), POST /sp/c (conversion), GET /sp/pixel.gif
- Registered at /sp in index.js
- Users with custom domain (T4.4) can point tracker to their subdomain
- Bypasses uBlock, Brave, Firefox ETP

## To activate on tracker side:
In tracker.js, if config.proxy_url is set, send events to that URL instead of API_URL
Example: window.__trackiq_config = { site_key: 'X', api_url: 'https://api.sourcetrack.ai', proxy_url: 'https://analytics.theirdomain.com' }

## Next priority options:
A) Wire proxy_url into tracker.js (completes the adblocker bypass loop)
B) T6.2 Generic webhook receiver (any CRM → conversions)
C) Real SVG source icons in report builder table
D) T8 Pricing tier enforcement (pre-launch)

## Session summary — what got done today:
- T4.2 PublicDashboard.jsx + App.jsx route
- T4.4 Custom tracking domain (Settings UI + DNS verify)
- T5.2 Scale/Pause/Kill verdicts
- T3.1 Cookieless tracking mode
- T7 Analytics product (tracker + API + page)
- Report Builder: multi-metric, stacked charts, % change, grouped source picker, duplicate fix
- Analytics sidebar nav
- Server-side proxy /sp/*
