## Last completed: T5.1 — DeepSeek swap ✅
- ai-client.js already uses DeepSeek via OpenAI-compatible SDK
- AI_PROVIDER=deepseek is the default, Anthropic never wired
- ai-analytics.js has zero LLM calls — pure data aggregation
- No code changes needed

## Next: T5.2 — Scale/Pause/Kill Verdicts
Add to api/routes/attribution.js:
  GET /api/attribution/verdicts?site_key=X&date_from=X&date_to=X
  Uses callAI() from lib/ai-client.js
  Returns [{campaign, verdict: SCALE|PAUSE|KILL, reason, signal}]

Paste to start:
  tail -30 ~/Desktop/trackiq/api/routes/attribution.js
