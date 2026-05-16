## Last completed: Railway production fix ✅
- All Supabase createClient calls now include { realtime: { transport: WebSocket } }
- Files fixed: track.js, proxy.js, webhook-incoming.js, analytics.js, campaigns.js,
  job-status.js, campaign-costs.js, dashboard.js, live.js, public-dashboard.js,
  nightly-attribution.js, data-quality-check.js, health-agent.js
- Missing webhookIncomingRouter import added to index.js
- Production should be green after commit 290d18e

## Remaining before launch:
1. T8 Pricing tier enforcement (free=1k, starter=10k, pro=50k/mo)
2. STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in Railway env vars
3. RESEND_API_KEY in Railway env vars

## To start T8:
  grep -n "app.post.*track\|app.post.*conversion\|app.post.*collect" ~/Desktop/trackiq/api/index.js | head -10
