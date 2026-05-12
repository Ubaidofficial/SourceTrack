# Known Issues

This file should stay short. Only include verified issues or high-confidence risks.

Do not use this file as a backlog for every idea. Use it to prevent repeated mistakes.

## Current verified/high-confidence issues

### 1. `schema.sql` is stale

The live database schema has been repaired through migrations, but `supabase/schema.sql` does not fully reflect the current tables/columns/policies.

Relevant files:

- `SUPABASE_SCHEMA.md`
- `supabase/migration_session_68_schema_alignment.sql`

Current rule:

- Treat migrations and live Supabase verification as source of truth.
- Do not rely on `schema.sql` alone.

### 2. Dashboard widgets policy not verified

RLS policies are verified for:

- `companies`
- `company_members`
- `sites`
- `saved_reports`
- `admin_audit_log`
- `qa_notes`

`dashboard_widgets` policy may be missing. This is not blocking until dashboard widget persistence becomes active work.

Relevant future session:

- Session 81 dashboard saved-report widgets

### 3. No paid ad click-ID capture yet

Do not claim Cometly/Usermaven paid attribution parity.

Missing or unverified:

- `gclid`
- `gbraid`
- `wbraid`
- `fbclid`
- `msclkid`
- `ttclid`
- `li_fat_id`
- `ad_id`
- `campaign_id`
- `adset_id`
- `creative_id`

These should be captured before claiming strong paid-ad attribution parity.

### 4. No ad spend ingestion yet

Do not claim:

- ad spend import
- ROAS
- ad account reporting
- ad set reporting
- ad ID reporting
- creative reporting

unless new code proves it.

### 5. AI referrer detection can undercount

AI source detection depends on referrer. Some AI tools strip referrers.

Safe claim:

    SourceTrack detects AI referrals when the platform sends a detectable referrer.

Unsafe claim:

    SourceTrack has universal AI traffic detection.

### 6. HogQL gotchas

Avoid:

- `toFloat64OrZero`
- `COUNT(CASE WHEN...)`
- ambiguous `distinct_id` in joins

Prefer:

- `toFloatOrZero`
- `countIf()`
- qualified aliases

### 7. Backup files can confuse audits

Old `.bak` files may exist from prior sessions.

Before production readiness or broad audits, check:

    find api dashboard/src tracker -name "*.bak*" -print

Do not commit unnecessary `.bak` files.

## Recently fixed

### Conversion ref/source/via parity (Session 78)

`api/routes/conversion.js` now persists `ref_param`, `source_param`, and `via_param` on conversion events, matching `api/routes/track.js`.

### Saved report request body bug

Fixed by centralizing JSON body normalization in:

- `dashboard/src/lib/api.js`

### Channel taxonomy

Fixed/added:

- `AI Search` channel label
- `Revenue by Channel` preset
- `Conversions by Channel` preset
- session report channel grouping bug

### Saved reports backend persistence

Saved reports now use the backend route and `saved_reports` table.

## Not bugs / expected behavior

### Vite chunk-size warning

Dashboard build may show chunk-size warning. This is not currently a build failure.

### Chrome devtools well-known 404

Chrome may request:

    /.well-known/appspecific/com.chrome.devtools.json

404 is harmless.

### Dashboard no-data state

A channel report can show no rows if the local site has no conversions in the selected date range.

### API 401 for curl without auth

Authenticated dashboard/report endpoints require a Bearer token. A curl request without Authorization can return:

    Missing or invalid Authorization header

This is expected for protected API routes.
