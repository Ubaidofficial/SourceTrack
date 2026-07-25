// $heartbeat → sessionization wiring. TOKEN-FREE, no network, no DOM.
//
// THE GAP: tracker.js:432-436 fires ONE `$heartbeat` on page exit, explicitly so a single-page
// session gets "a later same-session event so the server-derived session endTs (and therefore
// duration) reflects real engaged time instead of 0s" — and "Deliberately NOT $pageview — that
// would consume pageview quota and inflate pageview_count". The mechanism was built correctly and
// then never wired on the READ path: every feeder pipe filtered `event_type = '$pageview'`, so the
// heartbeat never reached deriveSessions and single-page sessions still computed 0s.
//
// §6 DATA-TRUTH, not just a feature: `duration_seconds` is 0 for ANY single-event session
// (startSession sets started_at == ended_at; finalizeSession then subtracts them), and
// sessionAggregates averages those zeros in. So avg_session_duration is systematically
// UNDERSTATED today, not merely incomplete.
//
// WHY IT IS SAFE — verified in sessionization.js, not assumed:
//   - pageview_count is gated on `ev.event === '$pageview'` at BOTH :69 (continuing) and :93
//     (session start), while event_count counts everything. A heartbeat extends duration without
//     inflating pageview_count — which is what keeps BOUNCE RATE (pageviews-per-visitor) unmoved.
//   - acquisitionKey() returns null unless the event carries utm_source/medium/campaign or a click
//     ID. The heartbeat payload is exactly {site_key, event, anonymous_id, session_id, page_url} —
//     no UTM, no click IDs — so evAcqKey is null, `acquisitionChanged` is false, and it CANNOT
//     split a session (:60-63).
//   - finalizeSession(:117-123) takes endTs from the LAST event regardless of type. Its exit_page
//     line ALSO ends in `|| session.exit_page`, which reads like a safety net — but it is not one:
//     see the latent-regression test below. Heartbeats always send page_url, so this is unreachable
//     in practice; it is pinned rather than assumed.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { deriveSessions, sessionAggregates } from '../lib/sessionization.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pipeSrc = (p) => readFileSync(join(__dirname, `../../tinybird/pipes/${p}.pipe`), 'utf8')

// EXECUTABLE SQL ONLY — everything from `SQL >` with `--` comment lines stripped.
// Both halves matter, and both were learned the hard way: a first version of this file matched
// the whole pipe text, so the DESCRIPTION block satisfied a "must contain $heartbeat" assertion,
// and the explanatory `--` comment added next to each new filter satisfied it too. Reverting the
// actual filter then left every test green. An assertion that a COMMENT can satisfy proves nothing.
const sqlOf = (p) => {
  const s = pipeSrc(p)
  return s.slice(s.indexOf('SQL >')).split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
}
// The event_type predicate specifically — the thing that decides what the pipe returns.
const eventFilterOf = (p) => (sqlOf(p).match(/event_type[^\n]*/g) || []).join('\n')

const T0 = '2026-07-26T10:00:00.000Z'
const T45 = '2026-07-26T10:00:45.000Z'   // 45s later — inside the 30-min window

const pv = (ts, over = {}) => ({ event: '$pageview', timestamp: ts, page_url: 'https://x.test/a', ...over })
// The REAL heartbeat shape (tracker.js:435): no utm_*, no click IDs, page_url present.
const hb = (ts, over = {}) => ({ event: '$heartbeat', timestamp: ts, page_url: 'https://x.test/a', ...over })

// ── THE FIX, stated as the metric that was wrong ─────────────────────────────────────────────

test('🔴 a single-pageview session with a heartbeat yields NON-ZERO duration', () => {
  const before = deriveSessions([pv(T0)])
  assert.equal(before.length, 1)
  assert.equal(before[0].duration_seconds, 0, 'today: one pageview alone is a 0s session')

  const after = deriveSessions([pv(T0), hb(T45)])
  assert.equal(after.length, 1, 'the heartbeat must NOT open a second session')
  assert.equal(after[0].duration_seconds, 45, 'duration now reflects real engaged time')
})

test('🔴 pageview_count is UNCHANGED by the heartbeat (this is what keeps bounce rate still)', () => {
  const before = deriveSessions([pv(T0)])
  const after = deriveSessions([pv(T0), hb(T45)])
  assert.equal(before[0].pageview_count, 1)
  assert.equal(after[0].pageview_count, 1, 'a heartbeat must never count as a pageview')
  // event_count DOES rise — that is the intended distinction, not a leak.
  assert.equal(after[0].event_count, 2)
})

test('🔴 BOUNCE RATE is unmoved — it is pageviews-per-visitor, and pageviews did not change', () => {
  // A bounce = a visitor whose session has exactly ONE pageview. Adding a heartbeat must not
  // rescue a session out of "bounced", or the metric silently collapses toward zero.
  const bounced = (sessions) => sessions.filter(s => s.pageview_count <= 1).length
  const before = deriveSessions([pv(T0)])
  const after = deriveSessions([pv(T0), hb(T45)])
  assert.equal(bounced(before), 1)
  assert.equal(bounced(after), 1, 'the session is still a bounce — one pageview, heartbeat or not')
})

test('🔴 the heartbeat does NOT split the session (null acquisition key)', () => {
  // Two pageviews on one campaign, then a heartbeat. Three events, ONE session.
  const utm = { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'q3' }
  const s = deriveSessions([
    pv(T0, utm),
    pv('2026-07-26T10:00:20.000Z', { ...utm, page_url: 'https://x.test/b' }),
    hb(T45)
  ])
  assert.equal(s.length, 1, 'a heartbeat carries no UTM, so it can never open a new session')
  assert.equal(s[0].pageview_count, 2)
  assert.equal(s[0].duration_seconds, 45)
})

test('🔴 exit_page comes from the heartbeat and is NOT null', () => {
  const s = deriveSessions([pv(T0), hb(T45, { page_url: 'https://x.test/pricing' })])
  assert.equal(s[0].exit_page, 'https://x.test/pricing', 'the page they were on when they left')
})

// LATENT REGRESSION PATH, documented rather than fixed — sessionization.js is outside this
// change's scope (pipes + render layer). finalizeSession(:122) ends with `|| session.exit_page`,
// which READS like a safety net, but the loop at :74 has already overwritten exit_page to null
// for the last event (`ev.page_url || ev.properties?.page_url || null`) — so the net catches
// nothing. It is unreachable in practice because tracker.js:435 always sends
// `page_url: location.href`, but admitting a new event type into sessionization is exactly what
// makes "the last event has no page_url" newly possible. If a heartbeat ever arrives without
// page_url (PII redaction, path exclusion, a future sender), exit_page regresses to null where
// today it holds the pageview's URL. Pinned so the behaviour is a recorded decision, not a
// surprise. FIX (separate PR): give :74 the same `|| currentSession.exit_page` fallback :122
// already implies — but note that also changes sessions ending in a page_url-less $conversion.
test('exit_page CAN regress to null if a last event lacks page_url (latent, pinned not fixed)', () => {
  const s = deriveSessions([pv(T0), hb(T45, { page_url: null })])
  assert.equal(s[0].exit_page, null,
    'documents ACTUAL behaviour: :74 nulls it before :122\'s fallback can apply')
})

test('🔴 avg_session_duration stops averaging a 0 in for every single-page session (§6)', () => {
  // Two visitors, each a single pageview; one also sent a heartbeat.
  const a = deriveSessions([pv(T0)])
  const b = deriveSessions([pv(T0), hb(T45)])
  const beforeAgg = sessionAggregates([...deriveSessions([pv(T0)]), ...deriveSessions([pv(T0)])])
  const afterAgg = sessionAggregates([...a, ...b])
  assert.equal(beforeAgg.avg_duration_seconds, 0, 'today both sessions contribute 0')
  assert.ok(afterAgg.avg_duration_seconds > 0, 'the understatement is corrected, not merely reduced')
  assert.equal(afterAgg.avg_pageviews_per_session, 1, 'and pageviews-per-session is untouched')
})

// ── PIPE ADMISSION — the actual change ───────────────────────────────────────────────────────
// deriveSessions has always handled this correctly; the bug was that no pipe ever fed it a
// heartbeat. These bind the read path to the behaviour above.
const FEEDER_PIPES = ['sessions_pageviews', 'session_report_pageviews', 'visitor_sessions']

test('🔴 every pipe that feeds deriveSessions admits $heartbeat', () => {
  for (const p of FEEDER_PIPES) {
    assert.match(eventFilterOf(p), /\$heartbeat/,
      `${p} feeds deriveSessions but its event_type filter excludes heartbeats — ` +
      'single-page sessions stay 0s. (Asserted on the PREDICATE: a comment mentioning ' +
      '$heartbeat must never be able to satisfy this.)')
  }
})

// ── MUST-NOT-CHANGE — the over-gating guards ─────────────────────────────────────────────────
// Each of these would be actively WRONG with heartbeats admitted. They must keep passing both
// before and after this change.
const FORBIDDEN = {
  dashboard_bounce_rate: 'bounce is pageviews-per-visitor — heartbeats would collapse it toward zero',
  dashboard_live_visitors: 'a heartbeat fires as someone LEAVES — counting it reports departed visitors as live',
  live_visitors_bag: 'same as dashboard_live_visitors',
  multitouch_pageviews_live: 'attribution touchpoint — a heartbeat has NO UTM, so it could be selected as a touch with a null source',
  pageviews_windowed_by_site: 'attribution touchpoint — same null-source risk on the money rail',
  flexible_sessions_by_site: 'attribution/visitor counting — not a sessionization feeder'
}

test('🔴 the money-rail and liveness pipes must NEVER admit $heartbeat', () => {
  for (const [p, why] of Object.entries(FORBIDDEN)) {
    assert.doesNotMatch(eventFilterOf(p), /\$heartbeat/, `${p} must not admit heartbeats: ${why}`)
  }
})

test('🔴 first_touch / last_touch attribution pipes must NEVER admit $heartbeat', () => {
  for (const p of ['first_touch_by_site', 'last_touch_by_site', 'first_touch_non_direct_by_site', 'last_touch_non_direct_by_site']) {
    assert.doesNotMatch(eventFilterOf(p), /\$heartbeat/,
      `${p} selects attribution touchpoints — a heartbeat carries no UTM and would corrupt the money rail`)
  }
})

// journey.pipe deliberately keeps returning heartbeats: journey.js:109-122 feeds ONE events array
// to BOTH the timeline AND deriveSessions (:171) + sessionAggregates (:209). Filtering at the pipe
// would freeze journey's durations at 0 while every other surface rose — a visible cross-surface
// inconsistency. The data layer keeps the data; JourneyModal decides what to SHOW.
test('🔴 journey.pipe still returns heartbeats (its durations depend on them)', () => {
  assert.doesNotMatch(sqlOf('journey'), /event_type\s*=\s*'\$pageview'/,
    'journey must not be narrowed to pageviews — deriveSessions needs the heartbeat for duration')
  assert.doesNotMatch(sqlOf('journey'), /!=\s*'\$heartbeat'|NOT IN \('\$heartbeat'/,
    'heartbeats are filtered at the RENDER layer (JourneyModal), not in the pipe')
})

test('🔴 JourneyModal filters heartbeats out of the rendered timeline', () => {
  const modal = readFileSync(join(__dirname, '../../dashboard/src/components/JourneyModal.jsx'), 'utf8')
  // The precise expression — my explanatory comment above it also contains the word $heartbeat,
  // so a bare /\$heartbeat/ match would stay green with the filter deleted.
  assert.match(modal, /\.filter\(\s*e\s*=>\s*e\.event\s*!==\s*'\$heartbeat'\s*\)/,
    'the timeline must FILTER $heartbeat, or it renders as an unlabeled Clock row (the icon/label fallbacks)')
})
