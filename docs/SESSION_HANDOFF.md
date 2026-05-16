## Last completed: Adblocker bypass complete ✅
- api/routes/proxy.js: /sp/e (pageview), /sp/c (conversion), /sp/pixel.gif
- tracker.js: PROXY_URL var — if config.proxy_url set, sends to /sp/ instead of /api/
- Activation: window.__trackiq_config = { site_key: 'X', api_url: '...', proxy_url: 'https://analytics.theirdomain.com' }
- Requires custom domain (T4.4) to be verified first

## Remaining work (priority order):
1. T6.2 Generic webhook receiver — any CRM/tool → conversions via POST
2. T8 Pricing tier enforcement — free=1k, starter=10k, pro=50k/mo
3. Report Builder: real SVG source icons in table rows
4. Add STRIPE keys to .env to activate billing
5. Add RESEND_API_KEY for weekly digest

## Project status: ~97% complete
Core attribution ✅ | Cookieless ✅ | Analytics product ✅
Report builder ✅ | Adblocker bypass ✅ | Public share ✅
AI verdicts ✅ | Server-side CAPI ✅ | Journey modal ✅
