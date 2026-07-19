# Phase 6 Consolidation Plan (docs-only, no pipe merges)

Status: DEFERRED. Do NOT merge any endpoint until the app is wired to read Tinybird
(post step-5 app-path test). Merging endpoint names/params now = premature
app-coupling. This document records the plan for later; it changes no pipe files.

## Real duplicate clusters (2)

### (a) analytics.js 5→1: summary / sources_ai / sources_ref / browsers / os

- **Identical or differ?** Byte-identical SQL bodies (verified line-for-line
  against `tinybird/pipes/{summary,sources_ai,sources_ref,browsers,os}.pipe`).
  The only differences are the `NODE` name and the default `LIMIT`
  (`summary` = 10000; `sources_ai`/`sources_ref`/`browsers`/`os` = 50000).
- **Caller change to merge:** `api/routes/analytics.js` calls `queryHogQL`
  from 5 separate call sites (lines 187 / 423 / 515 / 804 / 835), each with
  its own `queryName` and its own default limit, feeding 9 optional
  drill-down filter params built by `parseFilters`/`buildPageviewFilterSql`.
  Merging means renaming all 5 call sites to hit one pipe (e.g.
  `analytics_pageviews`) and having every caller pass `limit_val` explicitly
  — the pipe can no longer default the limit correctly for all 5 callers.
- **Recommended merge approach (later):** one parameterized pipe,
  `limit_val` always passed by the caller (no reliance on the pipe's
  default), same 9 filter params already ported identically across all 5.
  Low risk — filter/param shape is already unified across the 5 files.

### (b) alerts.js ↔ integrations.js 4-shared (cross-file)

- **Identical or differ?** Byte-identical SQL for all 4 pairs:
  `alert_traffic`/`integ_traffic`, `alert_conversions`/`integ_conversions`,
  `alert_ai`/`integ_ai`, `alert_recent`/`integ_recent`. Only the `NODE`
  name differs per file.
- **Caller change to merge:** two different route files
  (`api/routes/alerts.js`, `api/routes/integrations.js`) each independently
  call `queryHogQL` with their own `queryName`. Merging requires both
  callers to call the same 4 shared pipe names — 8 call-site edits across
  2 files.
- **Recommended merge approach (later):** 4 shared pipes (e.g.
  `traffic_wow`, `conversions_dod`, `ai_source_7d`, `recent_activity_24h`),
  both callers repointed. No param/shape changes needed — bodies already
  match exactly.

## Non-clusters — do NOT re-audit these (2)

Both were named in the original dispatch as "N-fanout" duplicate candidates.
Checked against the actual pipe SQL: neither is a duplicate cluster. Each
"fanout" is a `Promise.all` batch of genuinely distinct queries that happen
to be dispatched together from one route handler — there is nothing to
consolidate.

- **setup-doctor.js 5-fanout** (`doctor_pageviews_30d`, `doctor_last_conversion`,
  `doctor_last_click_id`, `doctor_paid_params_count`, `doctor_token_verify`):
  5 genuinely distinct queries (different columns, filters; `doctor_token_verify`
  even takes a second required param, `st_verify`). No merge candidate.
- **integrations.js 10-fanout**: of the 10 `integ_*` pipes, only the 4 already
  covered by cluster (b) above are duplicates (of `alert_*`, not of each
  other). The remaining 6 (`integ_install`, `integ_missing_source`,
  `integ_campaigns`, `integ_referrers`, `integ_missing_conv`,
  `integ_low_activity`) are each distinct single-purpose queries with no
  duplicate anywhere in the codebase. No separate merge plan needed beyond
  cluster (b).

## Gate

Both real clusters are DEFERRED until the app is wired to read Tinybird
(post step-5 app-path test). No blind merge now — do not act on this plan
without a fresh, explicit dispatch.
