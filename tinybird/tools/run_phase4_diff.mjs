#!/usr/bin/env node
// SourceTrack — Phase 9 driver for the Phase-4 parity diffs. READ-ONLY.
// EXECUTION IS FOUNDER-RUN. This file only wires args + guards; it mutates nothing.
// None of the underlying diffs write to either store.
//
// ── COVERAGE ─────────────────────────────────────────────────────────────────
// Runs up to THREE live cross-store diffs (select with RUN_MODELS, default all):
//   pattern_b    — touchpoint-SET diff via conversions_by_site +
//                  pageviews_windowed_by_site: ROW-LEVEL parity for the FOUR
//                  models sharing that row-pull (time_decay/linear/u_shaped/
//                  w_shaped; allocation-output equality follows from row-set
//                  equality — see phase4_touchpoint_diff.js header). cc-4a.
//   last_touch   — PICKED-VALUE diff (per-field: utm_source/medium/campaign/
//                  ai_source, each independently argMax'd — 4C §5) vs the
//                  last_touch_by_site pipe. cc-4c, incl. the visitorZ
//                  exact-timestamp tie row (reported separately per 4C §5).
//   ai_platforms — CREDITED-PLATFORM diff via the REAL exported
//                  selectAiTouchForConversion over both legs' row sets
//                  (4D §3), pageviews_by_visitors IN-list pull. cc-4d, incl.
//                  the no-credit negative case (visitorS presence-guarded).
// A green run here = 6/9 models' parity confirmed LIVE. It does NOT cover:
//   - first_touch / *_non_direct (fixtures recorded, not ingested — cutover gate)
//   - aggregate-layer (groupBy) diff (unbuilt)
//   - cross-store idempotency
// OFFLINE COUNTERPART: tinybird/qa/phase4_replay_verify.mjs replays committed
// snapshots through the same comparators with zero credentials.
//
// ── REQUIRED ENV (founder-supplied; NEVER commit real values) ────────────────
//   POSTHOG_HOST                    reverse-proxy / us.i.posthog.com
//   POSTHOG_PROJECT_ID   = 469905   staging reference (queryHogQL target)
//   POSTHOG_PERSONAL_API_KEY        phx_… query-scoped personal key (SECRET)
//   TINYBIRD_HOST                   region API host (from Tinybird UI)
// Per selected model (all default-selected):
//   pattern_b:    PHASE4_CONVERSIONS_READ_TOKEN, PHASE4_PAGEVIEWS_READ_TOKEN
//   last_touch:   PHASE4_LAST_TOUCH_READ_TOKEN
//   ai_platforms: PHASE4_CONVERSIONS_READ_TOKEN, PHASE4_PAGEVIEWS_BY_VISITORS_READ_TOKEN
//
// Run from repo root:  node tinybird/tools/run_phase4_diff.mjs
//   RUN_MODELS=last_touch,ai_platforms node tinybird/tools/run_phase4_diff.mjs

// ── Guards that don't need the tool import ──────────────────────────────────
const ALL_MODELS = ['pattern_b', 'last_touch', 'ai_platforms']
const RUN_MODELS = (process.env.RUN_MODELS ?? ALL_MODELS.join(','))
  .split(',').map(s => s.trim()).filter(Boolean)
const unknown = RUN_MODELS.filter(m => !ALL_MODELS.includes(m))
if (unknown.length) {
  console.error(`[phase4-diff] Unknown RUN_MODELS entries: ${unknown.join(', ')} (valid: ${ALL_MODELS.join(', ')})`)
  process.exit(2)
}

const TOKEN_ENV_BY_MODEL = {
  pattern_b: ['PHASE4_CONVERSIONS_READ_TOKEN', 'PHASE4_PAGEVIEWS_READ_TOKEN'],
  last_touch: ['PHASE4_LAST_TOUCH_READ_TOKEN'],
  ai_platforms: ['PHASE4_CONVERSIONS_READ_TOKEN', 'PHASE4_PAGEVIEWS_BY_VISITORS_READ_TOKEN']
}
const REQUIRED_ENV = [
  'POSTHOG_HOST', 'POSTHOG_PROJECT_ID', 'POSTHOG_PERSONAL_API_KEY', 'TINYBIRD_HOST',
  ...new Set(RUN_MODELS.flatMap(m => TOKEN_ENV_BY_MODEL[m]))
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
  process.env.POSTHOG_API_KEY = 'mock-unused-by-diff-capture-client'
}
const {
  diffTouchpointSets, fetchTinybirdRows, fetchHogqlLastTouchPicks,
  mapTinybirdLastTouchRow, compareLastTouchPicks, fetchHogqlAiPageviews,
  compareAiPlatformCredits
} = await import('./phase4_touchpoint_diff.js')
const { serializeHogQLDateRange, serializeHogQLDateTime } = await import('../../api/lib/hogql-date.js')

// ── Window: provably contains ALL THREE fixture sets on the gating site ──────
// Confirmed read-only against PostHog 469905 and Tinybird ST_Staging (2026-07-03):
//   cc-4a spans 2026-06-27T20:29Z .. 2026-06-29T21:29Z
//   cc-4c spans 2026-06-27T21:14Z .. 2026-06-27T21:29Z (tie pair intact both stores)
//   cc-4d spans 2026-06-27T21:35Z .. 2026-06-27T22:00Z
// dateFrom '2026-06-26' / dateTo '2026-06-30' (date-only EXCLUSIVE-end +1 shift,
// hogql-date.js exclusiveEndForDateOnly) => [2026-06-26T00:00Z, 2026-07-01T00:00Z).
const SITE_ID = 'de200000-babe-41d4-a716-446655441111' // gating site (holds cc-4a/4c/4d)
const DATE_FROM = '2026-06-26'
const DATE_TO = '2026-06-30'
const WINDOW_DAYS = 30 // matches live default (attributionWindow null -> 30)
const TIE_DISTINCT_IDS = ['cc-4c-visitorZ'] // 4C §4 exact-timestamp tie fixture

const { from: fromDate, to: toDate } = serializeHogQLDateRange(DATE_FROM, DATE_TO)
const lookbackDate = new Date(new Date(fromDate.match(/'([^']+)'/)[1]).getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
const lookbackStr = serializeHogQLDateTime(lookbackDate)
// Tinybird DateTime params want ClickHouse-native space-separated format (7cd3140).
const toTinybirdDateTime = (isoWithTZ) => isoWithTZ.replace('T', ' ').replace(/Z$/, '')
const fromIso = toTinybirdDateTime(fromDate.match(/'([^']+)'/)[1])
const toIso = toTinybirdDateTime(toDate.match(/'([^']+)'/)[1])
const lookbackIso = toTinybirdDateTime(lookbackStr.match(/'([^']+)'/)[1])

const results = {}
const hr = () => console.log('─'.repeat(64))

// ── pattern_b ────────────────────────────────────────────────────────────────
if (RUN_MODELS.includes('pattern_b')) {
  const FIXTURE_PREFIX = (process.env.FIXTURE_PREFIX ?? 'cc-4a-') || null
  const r = await diffTouchpointSets({
    siteId: SITE_ID, dateFrom: DATE_FROM, dateTo: DATE_TO,
    attributionWindow: null, // -> 30d lookback (matches Phase 4a)
    conversionsReadToken: process.env.PHASE4_CONVERSIONS_READ_TOKEN,
    pageviewsReadToken: process.env.PHASE4_PAGEVIEWS_READ_TOKEN,
    fixturePrefix: FIXTURE_PREFIX
  })
  hr()
  console.log(`[phase4-diff] pattern_b  window=[${DATE_FROM} .. ${DATE_TO}]  site=${SITE_ID}  fixturePrefix=${FIXTURE_PREFIX ?? '(none)'}`)
  console.log(`[phase4-diff] totalConversions=${r.totalConversions}  windowDays=${r.windowDays}`)
  console.log(`[phase4-diff] conversionsHogqlOnly=${r.conversionsHogqlOnly.length}  conversionsTinybirdOnly=${r.conversionsTinybirdOnly.length}  touchpointMismatches=${r.mismatches.length}`)
  // FALSE-GREEN GUARD: a zero-conversion window is NOT a pass.
  results.pattern_b = r.totalConversions > 0 && r.pass
  if (!results.pattern_b) console.error(`[phase4-diff] pattern_b FAIL detail: ${JSON.stringify(r, null, 2)}`)
}

// ── last_touch ───────────────────────────────────────────────────────────────
if (RUN_MODELS.includes('last_touch')) {
  const [hogqlPicksAll, tbRowsAll] = await Promise.all([
    fetchHogqlLastTouchPicks(SITE_ID, fromDate, toDate),
    fetchTinybirdRows('last_touch_by_site', process.env.PHASE4_LAST_TOUCH_READ_TOKEN,
      { site_id: SITE_ID, date_from: fromIso, date_to: toIso })
  ])
  const hogqlPicks = hogqlPicksAll.filter(p => p.distinct_id.startsWith('cc-4c-'))
  const tbPicks = tbRowsAll.map(mapTinybirdLastTouchRow).filter(p => p.distinct_id.startsWith('cc-4c-'))
  const r = compareLastTouchPicks(hogqlPicks, tbPicks, { tieDistinctIds: TIE_DISTINCT_IDS })
  hr()
  console.log(`[phase4-diff] last_touch  window=[${DATE_FROM} .. ${DATE_TO}]  fixturePrefix=cc-4c-`)
  console.log(`[phase4-diff] totalConversions=${r.totalConversions}  nonTieMismatches=${r.mismatches.length}  convHogqlOnly=${r.conversionsHogqlOnly.length}  convTinybirdOnly=${r.conversionsTinybirdOnly.length}`)
  for (const t of r.tieReport) console.log(`[phase4-diff] tie row ${t.distinct_id}: agreement=${t.agreement} — ${t.agreement ? 'bonus confirmation' : 'DOCUMENTED AMBIGUITY (4C §5), not counted as parity failure'}`)
  results.last_touch = r.totalConversions > 0 && r.pass
  if (!results.last_touch) console.error(`[phase4-diff] last_touch FAIL detail: ${JSON.stringify(r, null, 2)}`)
}

// ── ai_platforms ─────────────────────────────────────────────────────────────
if (RUN_MODELS.includes('ai_platforms')) {
  const { selectAiTouchForConversion } = await import('../../api/lib/attribution-engine.js')
  // Conversions pull, same shape as the tool's internal fetchHogqlConversions
  // (which is deliberately not exported).
  const { queryHogQL } = await import('../../api/lib/posthog.js')
  const { esc } = await import('../../api/lib/utils.js')
  const convRows = await queryHogQL(`
    SELECT uuid, distinct_id, timestamp
    FROM events
    WHERE properties.site_id = '${esc(SITE_ID)}'
      AND event = '$conversion'
      AND timestamp >= ${fromDate}
      AND timestamp < ${toDate}
    ORDER BY timestamp ASC
    LIMIT 10000
  `, 'phase4_diff_ai_conversions_hogql')
  const hogqlConversions = convRows
    .map(([uuid, distinctId, timestamp]) => ({ uuid, distinct_id: distinctId, timestamp }))
    .filter(c => c.distinct_id.startsWith('cc-4d-'))
  const ids = [...new Set(hogqlConversions.map(c => c.distinct_id))]
  const [hogqlPageviews, tbConversionsAll, tbPageviews] = await Promise.all([
    fetchHogqlAiPageviews(SITE_ID, ids, lookbackStr, toDate),
    fetchTinybirdRows('conversions_by_site', process.env.PHASE4_CONVERSIONS_READ_TOKEN,
      { site_id: SITE_ID, date_from: fromIso, date_to: toIso }),
    // visitor_ids as an ARRAY — fetchTinybirdRows serializes it as ONE
    // comma-separated value (repeated keys silently drop all but the first id;
    // verified 2026-07-03, see phase4_touchpoint_diff.js).
    fetchTinybirdRows('pageviews_by_visitors', process.env.PHASE4_PAGEVIEWS_BY_VISITORS_READ_TOKEN,
      { site_id: SITE_ID, visitor_ids: ids, lookback_from: lookbackIso, date_to: toIso, page_size: 5000, page_offset: 0 })
  ])
  const tbConversions = tbConversionsAll.filter(c => typeof c.distinct_id === 'string' && c.distinct_id.startsWith('cc-4d-'))
  const r = compareAiPlatformCredits({
    hogqlConversions, hogqlPageviews, tbConversions, tbPageviews,
    windowDays: WINDOW_DAYS, selectAiTouch: selectAiTouchForConversion
  })
  hr()
  console.log(`[phase4-diff] ai_platforms  window=[${DATE_FROM} .. ${DATE_TO}]  fixturePrefix=cc-4d-  visitors=${ids.length}`)
  console.log(`[phase4-diff] totalConversions=${r.totalConversions}  creditMismatches=${r.creditMismatches.length}  rowSetMismatches=${r.rowSetMismatches.length}  convHogqlOnly=${r.conversionsHogqlOnly.length}  convTinybirdOnly=${r.conversionsTinybirdOnly.length}`)
  for (const c of r.credits) console.log(`[phase4-diff] credit ${c.distinct_id}: hogql=${c.hogql} tinybird=${c.tinybird} match=${c.match}`)
  results.ai_platforms = r.totalConversions > 0 && r.pass
  if (!results.ai_platforms) console.error(`[phase4-diff] ai_platforms FAIL detail: ${JSON.stringify(r, null, 2)}`)
}

// ── Summary ──────────────────────────────────────────────────────────────────
hr()
let anyFail = false
for (const m of RUN_MODELS) {
  console.log(`[phase4-diff] ${m}: ${results[m] ? 'PASS' : 'FAIL'}`)
  if (!results[m]) anyFail = true
}
if (anyFail) {
  console.error('[phase4-diff] FAIL — at least one selected model failed (a zero-conversion window also counts as FAIL, never as a pass).')
  process.exit(1)
}
console.log(`[phase4-diff] PASS: ${RUN_MODELS.join(', ')} — ${RUN_MODELS.includes('pattern_b') ? '4 Pattern-B models + ' : ''}selected picked-value models parity-confirmed LIVE. NOT first_touch/*_non_direct/aggregate/idempotency — see header.`)
process.exit(0)
