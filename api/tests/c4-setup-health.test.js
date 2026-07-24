// C4 — Setup & Health live feed, cold-start affordance, 30-day count, truth copy.
// Behavioural tests for the pure helpers + structure/copy assertions on the JSX (no React runner in
// this repo; wiring is CI-build-validated, the substance is locked here).

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const { dedupeEventsById, shouldPoll, hasHistoricalData, LIVE_FEED_POLL_MS, eventKey } =
  await import('../../dashboard/src/lib/liveFeed.js')

// ── the feed polls + de-dupes ────────────────────────────────────────────────
test('dedupeEventsById collapses re-seen events (composite key) and keeps newest-first', () => {
  const a = { timestamp: 't1', event: '$pageview', distinct_id: 'v1', page_url: '/a' }
  const b = { timestamp: 't2', event: '$pageview', distinct_id: 'v1', page_url: '/b' }
  // a poll returns [b (new), a (already shown)]; existing list is [a]
  const merged = dedupeEventsById([b, a, a])
  assert.equal(merged.length, 2, 'the duplicate a is dropped')
  assert.equal(merged[0].page_url, '/b', 'newest stays on top')
  assert.equal(eventKey(a), 't1|$pageview|v1|/a')
})

test('dedupeEventsById caps the list', () => {
  const many = Array.from({ length: 250 }, (_, i) => ({ timestamp: 't' + i, event: '$pageview', distinct_id: 'v', page_url: '/' + i }))
  assert.equal(dedupeEventsById(many).length, 100)
  assert.equal(dedupeEventsById(many, 10).length, 10)
})

// ── polling stops when the tab is hidden ─────────────────────────────────────
test('shouldPoll pauses when hidden', () => {
  assert.equal(shouldPoll(true), false, 'hidden tab does not poll')
  assert.equal(shouldPoll(false), true, 'visible tab polls')
  assert.equal(LIVE_FEED_POLL_MS, 10000, 'matches TINYBIRD_FLUSH_INTERVAL_MS')
})

// ── cold-start feed shows only with NO historical data ───────────────────────
test('hasHistoricalData: false at cold start, true once anything real exists', () => {
  assert.equal(hasHistoricalData(null), false)
  assert.equal(hasHistoricalData({ hasConversions: false, hasTraffic: false, totalConversions: 0, trafficSources: [], trafficTopPages: [] }), false)
  assert.equal(hasHistoricalData({ hasConversions: true }), true)
  assert.equal(hasHistoricalData({ hasTraffic: true }), true)
  assert.equal(hasHistoricalData({ totalConversions: 3 }), true)
  assert.equal(hasHistoricalData({ trafficSources: [{ source: 'google' }] }), true)
  assert.equal(hasHistoricalData({ trafficTopPages: [{ path: '/' }] }), true)
})

// ── setup-doctor surfaces the 30-day count ───────────────────────────────────
test('getSetupDiagnostics returns pageviews_30d (was computed and discarded)', async () => {
  const mod = await import('../lib/setup-doctor.js')
  mod.__setSetupDoctorReadDeps({
    queryTinybird: async (pipe) => {
      if (pipe === 'doctor_pageviews_30d') return [{ pageviews_30d: 42 }]
      if (pipe === 'doctor_privacy_signals_30d') return [{ privacy_signals_30d: 0 }]
      return []
    }
  })
  try {
    const r = await mod.getSetupDiagnostics({ site: { id: 's1', last_seen_at: '2026-07-24T00:00:00Z', domain: 'example.com', onboarding_state: {} } })
    assert.equal(r.pageviews_30d, 42)
  } finally {
    mod.__resetSetupDoctorReadDeps()
  }
})

// ── structure/copy: the JSX actually wires the helpers + the truth copy ──────
test('EventDebugger wires the paused, de-duped poll', () => {
  const src = read('dashboard/src/pages/EventDebugger.jsx')
  assert.match(src, /LIVE_FEED_POLL_MS/, 'polls at the shared cadence')
  assert.match(src, /shouldPoll\([^)]*document\.hidden/, 'guards the poll on document.hidden')
  assert.match(src, /dedupeEventsById/, 'de-dupes on merge')
  assert.match(src, /setInterval\(/, 'has a polling interval')
})

test('SetupDoctorCard shows the 30-day count with a truthful window label, not "Events"', () => {
  const src = read('dashboard/src/components/SetupDoctorCard.jsx')
  assert.match(src, /Pageviews received \(last 30 days\)/, 'labelled Pageviews (pipe is $pageview-only), with window')
  assert.doesNotMatch(src, /Events received \(last 30 days\)/, 'must NOT over-claim "Events"')
  assert.match(src, /browser-days/, 'privacy signals labelled as a floor of browser-days')
  assert.match(src, /floor — not a guaranteed total/, 'truth footer: cannot imply completeness')
})

test('Dashboard gates the cold-start feed on hasHistoricalData and renders EventDebugger', () => {
  const src = read('dashboard/src/pages/Dashboard.jsx')
  assert.match(src, /!hasHistoricalData\(/, 'feed shows only when there is no historical data')
  assert.match(src, /<EventDebugger/, 'renders the live feed')
})

test('setup-doctor return + design doc name the pageviews-only boundary', () => {
  assert.match(read('api/lib/setup-doctor.js'), /pageviews_30d: pageviews30d/, 'count surfaced in the return')
  assert.match(read('docs/design/design.md'), /Setup & Health page/, 'design doc has the section')
  assert.match(read('docs/design/design.md'), /floor, not a guaranteed total/, 'design doc states the truth boundary')
})
