# SYSTEM.md — TrackIQ

## Product
TrackIQ is a marketing attribution SaaS. It tracks first-touch, last-touch, linear attribution, and AI platform attribution (which AI tools send traffic that converts: ChatGPT, Claude, Perplexity, Gemini, etc.).

## Stack
- Backend: Node.js v20 + Express → Railway
- Events: Self-hosted PostHog on Railway
- DB/Auth: Supabase — site metadata + user accounts ONLY. No raw events in Supabase.
- Frontend: React + Vite → Railway
- AI chat: provider-agnostic via `api/lib/ai-client.js` (Session 3 only)
- Billing: Stripe (Session 4 only)

## Global guardrails
- async/await only. No `.then()` chains, no callbacks.
- Every async function must use try/catch.
- Never use `console.log`. Use `console.error` only for caught errors.
- Never hardcode secrets. Always use `process.env.*`.
- Do not invent APIs, SDK options, env vars, table names, or PostHog properties not defined in this file or the session prompt.
- If unsure, leave `TODO: confirm` instead of guessing.
- Do not reorder middleware unless explicitly instructed.
- Do not add billing code before Session 4.
- Do not modify `ai-client.js` outside Session 3 unless explicitly instructed.

## API response format
All API responses must be:
`{ success: boolean, data: any, error: string | null }`

## HTTP codes
- 200 ok
- 400 bad input
- 401 invalid/missing site_key
- 402 trial expired or inactive subscription
- 429 rate limited
- 500 server error

## Client IP rule
Always use:
`req.headers['x-forwarded-for']?.split(',')[0]`
Never use `req.ip` because Railway proxies break geoip accuracy.

## UUID rule
Use:
`import { v4 as uuidv4 } from 'uuid'`

## PostHog ingestion
Package: `posthog-node`

```js
import { PostHog } from 'posthog-node'

export const ph = new PostHog(process.env.POSTHOG_API_KEY, {
  host: process.env.POSTHOG_HOST,
  flushAt: 1,
  flushInterval: 0
})

process.on('exit', () => ph.shutdown())
process.on('SIGTERM', async () => {
  await ph.shutdown()
  process.exit(0)
})
```

Capture pattern:
`ph.capture({ distinctId, event, properties })`

After every capture:
`await ph.shutdown()`
This is mandatory or events may silently drop.

## HogQL query API
Endpoint:
`POST ${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`

Important: the trailing slash is required.

Headers:
- `Authorization: Bearer ${POSTHOG_PERSONAL_API_KEY}`
- `Content-Type: application/json`

Body:
```json
{ "query": { "kind": "HogQLQuery", "query": "<sql>" } }
```

Response:
```json
{ "results": [["col1", "col2"]] }
```

Default row limit is 100. Use `LIMIT` up to 50000 in SQL if needed.

## HogQL rules
- Table: `events` only
- Built-in columns: `distinct_id`, `event`, `timestamp`
- Custom properties: `properties.my_property`
- Always filter by site:
  `WHERE properties.site_id = '{siteKey}'`
- Date format:
  `timestamp >= toDateTime('2024-01-01 00:00:00')`
- Date helper:
```js
function toHogDate(iso) {
  return iso.replace('T',' ').replace(/\.\d+Z?$/,'').replace('Z','')
}
```
- Numeric conversion:
  `toFloat64OrZero(toString(properties.conversion_value))`
- Null check for AI source:
  `properties.ai_source IS NOT NULL AND properties.ai_source != ''`

## Allowed PostHog properties
Use only these unless a session explicitly adds another one:
- `properties.site_id`
- `properties.utm_source`
- `properties.utm_medium`
- `properties.utm_campaign`
- `properties.utm_content`
- `properties.utm_term`
- `properties.first_touch_source`
- `properties.first_touch_medium`
- `properties.first_touch_campaign`
- `properties.ai_source`
- `properties.is_conversion`
- `properties.conversion_value`
- `properties.device_type`
- `properties.country`
- `properties.page_url`
- `properties.referrer`
- `properties.server_timestamp`

## Cookie spec (tracker.js)
All cookies must be:
`SameSite=None; Secure; path=/; max-age=31536000`

- Anonymous ID: `__ti_id_{siteKey}` — UUIDv4, create if missing, never overwrite
- First touch: `__ti_ft_{siteKey}` — write only if missing, never overwrite
- Last touch: `__ti_lt_{siteKey}` — write only when `utm_source` exists, always overwrite

## AI platform detection
Read `req.headers.referer`, parse with `new URL(...)` in try/catch.

Map hostnames:
- `chat.openai.com` or `chatgpt.com` → `ChatGPT`
- `claude.ai` → `Claude`
- `perplexity.ai` → `Perplexity`
- `gemini.google.com` → `Gemini`
- `grok.x.com` → `Grok`
- `copilot.microsoft.com` → `Copilot`
- `bing.com` with `/chat` path → `Copilot`
- `deepseek.com` → `DeepSeek`
- `you.com` → `You.com AI`
- `phind.com` → `Phind`
- `kagi.com` → `Kagi`
- no match → `null`

Always call `next()`. Never block requests.

## Stripe invariant (Session 4 only)
`/api/billing/webhook` MUST be registered before `express.json()` in `api/index.js`.
Use:
`express.raw({ type: 'application/json' })`
If `express.json()` runs first, Stripe webhook verification breaks.

## Supabase rule
- Server-side only: `SUPABASE_SERVICE_KEY`
- Frontend only: `SUPABASE_ANON_KEY`

## geoip-lite deploy rule
`package.json` must include:
```json
"postinstall": "node -e "require('geoip-lite').startWatchingDataUpdate()""
```
Without this, country lookups return null silently.