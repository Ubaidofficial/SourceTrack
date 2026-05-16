## Last completed: T6.2 complete ✅
- api/routes/webhook-incoming.js: POST /api/webhooks/incoming/:api_key
- Duplicate route registration fixed
- Settings.jsx: shows webhook URL when api_key exists on site

## One thing to check:
Does the sites table have an api_key column?
Run in Supabase SQL:
  SELECT column_name FROM information_schema.columns WHERE table_name = 'sites' AND column_name = 'api_key';
If missing: ALTER TABLE sites ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE DEFAULT gen_random_uuid()::TEXT;

## Remaining before launch:
1. T8 Pricing tier enforcement — 2hrs
2. STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in .env
3. RESEND_API_KEY in .env

## Project status: ~99% complete
Everything core is built. Only pricing enforcement + env vars remain.
