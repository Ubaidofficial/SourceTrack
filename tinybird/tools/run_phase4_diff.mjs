#!/usr/bin/env node
// SourceTrack — Phase 9 driver for phase4_touchpoint_diff.js. READ-ONLY.
// EXECUTION IS FOUNDER-RUN. This file only wires args + guards; it mutates nothing.
// The underlying diffTouchpointSets writes NOTHING to either store.
//
// ── COVERAGE (do not overstate) ──────────────────────────────────────────────
// Runs the Pattern-B touchpoint-SET diff via conversions_by_site +
// pageviews_windowed_by_site — i.e. ROW-LEVEL parity for the FOUR models that
// share that row-pull: time_decay, linear, u_shaped, w_shaped (allocation-output
// equality follows from row-set equality — see phase4_touchpoint_diff.js:8-10).
// It DOES NOT cover:
//   - last_touch    (Pattern A, last_touch_by_site.pipe — NO diff harness exists)
//   - ai_platforms  (Pattern C, pageviews_by_visitors.pipe — NO diff harness exists)
//   - aggregate-layer (groupBy) diff (unbuilt)
//   - cross-store idempotency
//   - fixtures #1/#2/#3 (first_touch / *_non_direct — not ingested)
// A green run here = 4/6 models' ROW-LEVEL parity confirmed for the first time,
// NOT "6 models done" and NOT "Phase 9 done".
//
// ── REQUIRED ENV (founder-supplied; NEVER commit real values) ────────────────
//   POSTHOG_HOST                    reverse-proxy / us.i.posthog.com
//   POSTHOG_PROJECT_ID   = 469905   staging reference (queryHogQL target)
//   POSTHOG_PERSONAL_API_KEY        phx_… query-scoped personal key (SECRET)
//   TINYBIRD_HOST                   region API host (from .tinyb / Tinybird UI)
//   PHASE4_CONVERSIONS_READ_TOKEN   value of the phase4_conversions_read token (SECRET)
//   PHASE4_PAGEVIEWS_READ_TOKEN     value of the phase4_pageviews_read token (SECRET)
//
// NOT required from the founder:
//   POSTHOG_API_KEY — posthog.js constructs an unused `ph = new PostHog(POSTHOG_API_KEY)`
//   at MODULE LOAD (posthog.js:13). The diff uses queryHogQL (POSTHOG_PERSONAL_API_KEY),
//   NOT that capture client. This driver stubs POSTHOG_API_KEY with a placeholder (below)
//   ONLY to satisfy that constructor; the capture client is never used to send anything,
//   so no event is ever emitted with the stub. If the founder has a real POSTHOG_API_KEY
//   set, it is left untouched and still unused by the diff.
//
// Run from repo root:  node tinybird/tools/run_phase4_diff.mjs

// ── Guards that don't need the tool import ──────────────────────────────────
const REQUIRED_ENV = [
  'POSTHOG_HOST', 'POSTHOG_PROJECT_ID', 'POSTHOG_PERSONAL_API_KEY',
  'TINYBIRD_HOST', 'PHASE4_CONVERSIONS_READ_TOKEN', 'PHASE4_PAGEVIEWS_READ_TOKEN'
]
const missing = REQUIRED_ENV.filter(n => !process.env[n])
if (missing.length) {
  console.error(`[phase4-diff] MISSING required env: ${missing.join(', ')} — cannot run (see header).`)
  process.exit(2)
}
// Refuse to run against the wrong PostHog project (must be the staging reference).
if (process.env.POSTHOG_PROJECT_ID !== '469905') {
  console.error(`[phase4-diff] REFUSING: POSTHOG_PROJECT_ID=${process.env.POSTHOG_PROJECT_ID}, expected 469905 (staging reference). Set it explicitly.`)
  process.exit(2)
}

// Stub the UNUSED capture-client key BEFORE loading posthog.js. posthog.js's
// module-load `new PostHog(process.env.POSTHOG_API_KEY)` (posthog.js:13) throws
// if the key is falsy — even though the diff only uses queryHogQL, which does not
// touch that client. Set a placeholder only if the founder hasn't set a real one.
// Must precede the import → use dynamic import() (static imports are hoisted).
if (!process.env.POSTHOG_API_KEY) {
  process.env.POSTHOG_API_KEY = 'unused-by-diff-capture-client'
}
const { diffTouchpointSets } = await import('./phase4_touchpoint_diff.js')

// ── Window: provably contains the cc-4a fixtures on the gating site ──────────
// Confirmed read-only against PostHog 469905 (this session):
//   cc-4a $conversion span: 2026-06-27T21:09:29Z (j2, earliest) .. 2026-06-29T21:29:29Z (j3, latest)
//   cc-4a $pageview   span: 2026-06-27T20:29:29Z               .. 2026-06-29T20:29:29Z
// dateFrom '2026-06-26' -> from 2026-06-26T00:00:00Z  (<= earliest conversion by ~1.9d; 30d lookback covers all pageviews)
// dateTo   '2026-06-30' -> to   2026-07-01T00:00:00Z  (date-only EXCLUSIVE-end +1 shift, hogql-date.js:43/exclusiveEndForDateOnly;
//                                                       > latest conversion 06-29T21:29 by ~26.5h)
// => conversion window [2026-06-26T00:00Z, 2026-07-01T00:00Z) provably contains all 3 cc-4a conversions.
const SITE_ID   = 'de200000-babe-41d4-a716-446655441111' // gating site (holds cc-4a)
const DATE_FROM = '2026-06-26'
const DATE_TO   = '2026-06-30'

// Fixture isolation: default 'cc-4a-' so the diff runs ONLY the 3 Pattern-B fixtures,
// not the ~17 non-cc-4a in-window conversions (cc-4c/cc-4d + seed) that polluted the
// unfiltered run. Set FIXTURE_PREFIX='' to run the full general version (all conversions).
const FIXTURE_PREFIX = (process.env.FIXTURE_PREFIX ?? 'cc-4a-') || null

const result = await diffTouchpointSets({
  siteId: SITE_ID,
  dateFrom: DATE_FROM,
  dateTo: DATE_TO,
  attributionWindow: null, // -> 30d lookback (matches Phase 4a)
  conversionsReadToken: process.env.PHASE4_CONVERSIONS_READ_TOKEN,
  pageviewsReadToken: process.env.PHASE4_PAGEVIEWS_READ_TOKEN,
  fixturePrefix: FIXTURE_PREFIX
})

const convHogqlOnly = result.conversionsHogqlOnly?.length ?? 0
const convTbOnly    = result.conversionsTinybirdOnly?.length ?? 0
const tpMismatches  = result.mismatches?.length ?? 0

console.log('─'.repeat(64))
console.log(`[phase4-diff] window=[${DATE_FROM} .. ${DATE_TO}]  site=${SITE_ID}  fixturePrefix=${FIXTURE_PREFIX ?? '(none — all conversions)'}`)
console.log(`[phase4-diff] totalConversions=${result.totalConversions}  windowDays=${result.windowDays}`)
console.log(`[phase4-diff] conversionsHogqlOnly=${convHogqlOnly}  conversionsTinybirdOnly=${convTbOnly}  touchpointMismatches=${tpMismatches}`)
console.log('─'.repeat(64))

// ── FALSE-GREEN GUARD: a zero-conversion window is NOT a pass ────────────────
if (!result.totalConversions || result.totalConversions === 0) {
  console.error('[phase4-diff] FAIL: totalConversions === 0 — the window matched NO conversions. This is NOT a pass (window wrong or fixtures absent from PostHog 469905). Re-confirm the cc-4a span before trusting any result.')
  process.exit(1)
}

if (result.pass) {
  console.log(`[phase4-diff] PASS: ${result.totalConversions} conversion(s); row-level touchpoint sets IDENTICAL across stores for the 4 Pattern-B models (time_decay/linear/u_shaped/w_shaped). NOT last_touch/ai_platforms/aggregate/idempotency — see header.`)
  process.exit(0)
}

console.error('[phase4-diff] FAIL: mismatches detected (touchpoint-set and/or conversion-set). Full result:')
console.error(JSON.stringify(result, null, 2))
process.exit(1)
