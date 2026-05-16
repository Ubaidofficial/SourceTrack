## Last completed: Analytics sidebar nav ✅
- Activity icon + /analytics route added to Layout.jsx navItems
- PAGE_TITLES updated

## Next: A — Server-side pageview proxy (adblocker bypass)
Problem: uBlock, Brave, Firefox block SourceTrack domain — 20-40% data loss
Solution: proxy endpoint on user's own domain forwards to our API
Two parts:
1. api/routes/proxy.js — receives proxied events, strips identifying headers
2. Custom domain setup already done (T4.4) — proxy rides on same CNAME

Paste to start:
  cat ~/Desktop/trackiq/api/routes/track.js | head -20
  grep -n "proxy\|PROXY" ~/Desktop/trackiq/api/index.js | head -5
