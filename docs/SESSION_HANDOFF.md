## Last completed: T4.4 — Custom Tracking Domain ✅
- Supabase: custom_domain + custom_domain_verified columns on sites
- api/routes/custom-domain.js: GET, POST, POST /verify (DNS check)
- Settings.jsx: input + CNAME instructions + verify button + verified snippet
- index.js: /api/custom-domain registered

## Next: T5.1 — Swap all AI routes to DeepSeek
Files to check:
  grep -rn "anthropic\|Anthropic\|claude" ~/Desktop/trackiq/api/routes/ --include="*.js" -l
  cat ~/Desktop/trackiq/api/routes/ai-chat.js
  cat ~/Desktop/trackiq/api/routes/ai-analytics.js
