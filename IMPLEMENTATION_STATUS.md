# SourceTrack Implementation Status
Last updated: 2026-05-19

## Tasks Completed This Session
- Task 1: Minify tracker.js → tracker/tracker.min.js — COMPLETE
- Task 2: Remove duplicate imports in nightly-attribution.js — COMPLETE
- Task 3: Correct plan limits in tier-check.js — COMPLETE
- Task 4: Use RPC for accurate session counting — COMPLETE
- Task 5: Fetch click IDs in touchpoints query — COMPLETE
- Task 6: Add first_touch_channel and last_touch_channel — COMPLETE
- Task 7: Last-touch reads from last pageview not conversion event — COMPLETE
- Task 8: Move CAPI sync to conversion.js — COMPLETE
- Task 9: Define supabase before outbound_click handler — COMPLETE
- Task 10: Register savedReportsRouter — COMPLETE
- Task 11: Replace track loopback with direct call, remove duplicate CORS — COMPLETE
- Task 12: Add missing AI platforms and UTM fallback detection — COMPLETE
- Task 13: Add Stripe keys to health agent env check — COMPLETE
- Task 14: Add attribution confidence scoring — COMPLETE
- Task 15: Add conversion deduplication via external_event_id — COMPLETE
- Task 16: Add Billing page and route — COMPLETE
- Task 17: Real data quality system with 8 checks — COMPLETE
- Task 18: Shareable dashboard frontend — COMPLETE
- Task 19: Add revenue per visitor metric — COMPLETE
- Task 20: Add UTM builder to settings — COMPLETE
- Task 21: Weekly/monthly email reports via Resend — COMPLETE

## Verified Working
- tracker/tracker.min.js: 5113 bytes, gitignored line removed, committed and pushed
- All files pass `node --check` syntax validation
- duplicate imports removed from nightly-attribution.js (createClient, WebSocket, dotenv each appear once)
- plan limits: trial=200, starter=1000, pro=4000, agency=10000
- supabase defined at char 61, outbound_click block at char 1702 (supabase before outbound_click)
- savedReportsRouter: imported + app.use() registered at /api/saved-reports
- CAPI sync: 0 references in track.js, 2 in conversion.js
- AI platform map: 18 entries + UTM fallback via AI_UTM_SOURCES Set
- STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET added to health-agent env check
- data-quality-check.js: 8 CHECK implementations, writes to data_quality_reports + data_quality_alerts
- /share/:token route is public (not wrapped in ProtectedRoute)
- email-reports.js: Resend API via fetch(), job_runs logging, weekly + monthly modes

## SQL Migrations Applied
None in this session (all backend SQL handled via application code + existing tables).

## Git Commits Made
- fba8c35: feat: add attribution tracking script
- 3a2fc5f: fix: remove duplicate imports in nightly-attribution
- 769da34: fix: use RPC for accurate session counting
- b17d934: fix: fetch click IDs in touchpoints query
- 297c758: fix: add first_touch_channel and last_touch_channel
- 5b79d59: fix: last-touch reads from last pageview not conversion event
- 920b2b5: fix: move CAPI sync to conversion.js
- 5a5719d: fix: define supabase before outbound_click handler
- d645d66: fix: register savedReportsRouter
- cccd174: fix: replace track loopback with direct call, remove duplicate CORS
- a3edd0b: fix: add missing AI platforms and UTM fallback detection
- b93ad32: fix: add Stripe keys to health agent env check
- f5e5afb: feat: add attribution confidence scoring
- 7d06aee: feat: add conversion deduplication via external_event_id
- b4df183: feat: add Billing page and route
- bdca7be: feat: real data quality system with 8 checks
- 2a01177: feat: shareable dashboard frontend
- 6a6dce8: feat: add revenue per visitor metric
- 9d4941f: feat: add UTM builder to settings
- 5f4fbde: feat: weekly/monthly email reports via Resend
- 6a7e69a: feat: add TikTok CAPI conversion sync
- e402e85: docs: add implementation status log

## Still Requires Manual Action
- Set STRIPE_SECRET_KEY in Railway
- Set STRIPE_WEBHOOK_SECRET in Railway
- Set RESEND_API_KEY in Railway (for email reports)
- Schedule nightly-attribution.js as a cron job (daily at 2am)
- Schedule data-quality-check.js as a cron job (daily at 3am)
- Schedule email-reports.js as a cron job (Monday 8am weekly, 1st of month 8am monthly)

## Known Remaining Work (Post-Launch)
- First-party click ID persistence (st_click_id, CNAME setup)
- Visitor-based pricing migration
- Super admin panel (after customer 5)
- CAPI enrichment verification with real ad accounts (after customer 20)

## Feature 1: TikTok CAPI
Status: COMPLETE
File: api/lib/conversion-sync.js — sendTikTokConversion added
File: api/routes/conversion.js — wired into CAPI sync block
SQL: tiktok_pixel_id, tiktok_access_token columns added to sites table
Note: Requires customer to add TikTok Pixel ID and Access Token in Integrations page
Commit: 6a7e69a
