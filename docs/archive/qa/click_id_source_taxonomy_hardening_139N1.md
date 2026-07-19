# Click ID + Source Taxonomy Hardening — QA Report (Session 139N-1)

**Date:** 2026-06-12
**Branch:** `main`
**Status:** PENDING REVIEW — not committed

---

## 1. Objective

Harden tracker/input attribution quality by improving click ID capture and normalizing the source taxonomy. This session fixes the tracker/input gaps found in the Plurio Intake parity audit (139N-0) without making the UI heavier.

## 2. Click IDs Covered

All 12 click IDs are now captured, forwarded, normalized, classified, and debuggable:

| # | Click ID | Platform | Channel Classification | Status |
|---|---|---|---|---|
| 1 | `gclid` | Google Ads | Paid Search | ✅ Already existed |
| 2 | `gbraid` | Google Ads (app) | Paid Search | ✅ Already existed |
| 3 | `wbraid` | Google Ads (web) | Paid Search | ✅ Already existed |
| 4 | `fbclid` | Meta/Facebook | Paid Social | ✅ Already existed |
| 5 | `msclkid` | Microsoft Ads | Paid Search | ✅ Already existed |
| 6 | `ttclid` | TikTok Ads | Paid Social | ✅ Already existed |
| 7 | `li_fat_id` | LinkedIn Ads | Paid Social | ✅ Already existed |
| 8 | `li_fatid` | LinkedIn Ads (alias) | Paid Social | ✅ **Added in 139N-1** |
| 9 | `twclid` | X/Twitter Ads | Paid Social | ✅ Already captured, **classification added** |
| 10 | `dclid` | Google DV360 / Display | Display | ✅ **Added in 139N-1** |
| 11 | `snapclid` | Snapchat Ads | Paid Social | ✅ **Added in 139N-1** |
| 12 | `pclid` | Pinterest Ads | Paid Social | ✅ **Added in 139N-1** |

## 3. LinkedIn Alias Normalization

- Both `li_fat_id` (canonical) and `li_fatid` (alias) are accepted everywhere.
- Client-side: trackers normalize `li_fatid` → `li_fat_id` while preserving the raw alias.
- Server-side: `normalizeClickIds()` in `api/lib/utils.js` performs the same normalization.
- Channel classifier checks both `props.li_fat_id` and `props.li_fatid`.
- Raw `li_fatid` is preserved in PostHog properties for debugging.

## 4. Channel Classification Changes

| Click ID | Previous Classification | New Classification |
|---|---|---|
| `twclid` | Not classified (passed through) | **Paid Social** |
| `snapclid` | Not captured | **Paid Social** |
| `pclid` | Not captured | **Paid Social** |
| `dclid` | Not captured | **Display** |

Direct channel no longer silently overwrites meaningful paid parameters — UTMs and click IDs are checked before referrer-based classification.

## 5. Files Modified

### New Files
- `api/tests/tracker-click-ids.test.js` — 11 unit & consistency checks

### Modified Files (16)
- `api/lib/utils.js` — `normalizeClickIds` helper (42 lines added)
- `api/lib/channel-classifier.js` — 4 new click ID variables + classification rules
- `api/lib/attribution-engine.js` — HogQL SELECT + row mapping for 12 click IDs (2 query functions)
- `api/jobs/nightly-attribution.js` — HogQL SELECT + row mapping + channelFromEvent calls
- `api/lib/setup-doctor.js` — Extended click ID detection queries
- `api/routes/track.js` — Replaced 8 manual click ID reads with `...normalizeClickIds(req.body)`
- `api/routes/conversion.js` — Replaced 8 manual click ID reads with `...normalizeClickIds(req.body)`
- `api/routes/conversion-offline.js` — Extended whitelist + apply `normalizeClickIds`
- `api/routes/events.js` — Extended HogQL query + response mapping
- `dashboard/src/pages/EventDebugger.jsx` — Extended table cell + sidebar details
- `tracker/tracker.js` — Extended `_pk` array + LinkedIn normalization
- `tracker/tracker.cookieless.js` — Extended `_pk` array + LinkedIn normalization
- `tracker/tracker.min.js` — Rebuilt minified output
- `tracker/tracker.cookieless.min.js` — Rebuilt minified output
- `package.json` — Added `qa:tracker:unit` script
- `docs/release_checklist_gate.md` — Updated PARTIAL wording

## 6. Test Results

### `npm run qa:tracker:unit` — 11/11 PASS
```
▶ Click ID Normalization Helper Unit Tests
  ✔ returns all 12 click ID fields with null fallbacks when empty
  ✔ correctly maps and trims valid click IDs
  ✔ normalizes LinkedIn aliases preferring li_fat_id
  ✔ handles non-string types gracefully by falling back to null
✔ Click ID Normalization Helper Unit Tests

▶ Tracker Source Files Static Checks
  ✔ standard tracker.js has all parameters
  ✔ cookieless tracker.cookieless.js has all parameters
✔ Tracker Source Files Static Checks

▶ Setup Diagnostics & UI Consistency Checks
  ✔ setup-doctor.js clickIdTypes has all 12 click IDs
  ✔ EventDebugger.jsx contains references to all 12 click IDs
✔ Setup Diagnostics & UI Consistency Checks

tests 11 | pass 11 | fail 0
```

### `npm run qa:attribution:unit` — 9/9 PASS
### `npm run qa:env-safety` — ✅ PASS
### `npm run qa:static` — ✅ PASS
### `git diff --check` — ✅ CLEAN
### `grep -RIn` absolute local file URL pattern — ✅ NO HITS

## 7. What Is NOT Claimed

- Real end-to-end attribution accuracy is NOT verified.
- Paid beta is NOT ready.
- Staging schema, Stripe E2E, identity stitching, seeded journeys, and webhook/E2E revenue attribution remain blocked.
- Click ID ingestion was NOT tested with live paid ad traffic.
- This session covers tracker/client-side capture and server-side normalization/classification only.

## 8. Audit Notes

- `/api/collect` in `api/routes/analytics.js` was audited and confirmed as a legacy Postgres-only collector with no click ID columns in the `pageviews` schema. No changes required.
- The `qa:tracker:unit` tests use the real shared `normalizeClickIds` helper from `api/lib/utils.js`, not a test-only duplicate.
- No database migrations were run.
- No production credentials were used.
- No Stripe E2E testing was performed.
