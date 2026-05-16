## Last completed: T5.2 — Scale/Pause/Kill Verdicts ✅
- attributionVerdicts() appended to api/routes/attribution.js
- GET /api/attribution/verdicts?site_key=X&date_from=X&date_to=X
- Uses callAI() → DeepSeek, returns [{campaign, verdict, reason, signal}]
- Registered in index.js

## Next: T5.3 — Weekly Digest Email
Create: api/jobs/weekly-digest.js
Uses: callAI() for 3-sentence summary, Resend for email delivery
Cron: 0 8 * * 1 (Monday 8 AM)

Paste to start:
  ls ~/Desktop/trackiq/api/jobs/
  grep "RESEND\|resend" ~/Desktop/trackiq/.env
