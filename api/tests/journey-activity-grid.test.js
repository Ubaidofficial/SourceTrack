// Journey activity grid + trend markers — the two surfaces added in this change that could
// silently assert absence.
//
// THE POINT OF THIS FILE: both features paint "nothing happened" over regions where the real
// answer is "we didn't look".
//
//   - The journey read is `ORDER BY timestamp ASC LIMIT 500` (api/routes/journey.js:68 and
//     tinybird/pipes/journey.pipe). ASC + LIMIT returns a visitor's OLDEST 500 events, so for
//     any visitor above the cap the MISSING part is their most recent activity. A contribution
//     grid painted straight from that response would render empty squares over days the visitor
//     was demonstrably active — and an empty square in a GitHub-style grid is read as a
//     confident zero, never as a gap in the query.
//
//   - Trend markers must come from the COMPLETE per-day buckets, not from
//     /analytics/recent-conversions, which is `.limit(20)` newest-first (api/routes/analytics.js:820).
//     Markers sourced from that list would leave older real conversions unmarked while the chart
//     implied it was showing them all.

import test from 'node:test'
import assert from 'node:assert/strict'

const { buildActivityGrid, intensity, JOURNEY_EVENT_CAP } =
  await import('../../dashboard/src/lib/activityGrid.js')
const { buildTrendMarkers, localDateString } =
  await import('../../dashboard/src/lib/trendMarkers.js')

// Fixed "today" so the grid is testable without a clock.
const NOW = new Date('2026-07-29T12:00:00Z')

const evAt = (iso) => ({ event: '$pageview', timestamp: iso })
const flatten = (grid) => grid.columns.flat()
const cellFor = (grid, date) => flatten(grid).find(c => c.date === date)

test('an untruncated journey marks every day as known', () => {
  const grid = buildActivityGrid([evAt('2026-07-20T10:00:00Z'), evAt('2026-07-21T10:00:00Z')], { now: NOW })
  assert.equal(grid.truncated, false)
  const past = flatten(grid).filter(c => !c.future)
  assert.ok(past.every(c => c.known), 'no day may be unknown when the response was not capped')
  assert.equal(grid.activeDays, 2)
})

test('a truncated journey marks days AFTER the last received event as unknown, not zero', () => {
  // 500 events all landing months ago: the cap is hit, so recent activity is missing.
  const events = Array.from({ length: JOURNEY_EVENT_CAP }, () => evAt('2026-04-10T10:00:00Z'))
  const grid = buildActivityGrid(events, { now: NOW })

  assert.equal(grid.truncated, true)
  assert.equal(grid.knownThrough, '2026-04-10')

  const afterCap = cellFor(grid, '2026-06-15')
  assert.ok(afterCap, 'expected a cell inside the 6-month window')
  assert.equal(afterCap.known, false, 'a day past the fetched window must be unknown')
  assert.equal(afterCap.count, 0)

  const measured = cellFor(grid, '2026-04-10')
  assert.equal(measured.known, true)
  assert.equal(measured.count, JOURNEY_EVENT_CAP)
})

test('days BEFORE the first event are genuine zeros, not unknown', () => {
  // ASC ordering proves nothing earlier exists, so these are measured absence.
  const grid = buildActivityGrid([evAt('2026-07-20T10:00:00Z')], { now: NOW })
  const before = cellFor(grid, '2026-05-01')
  assert.equal(before.known, true)
  assert.equal(before.count, 0)
})

test('future days are flagged and never counted', () => {
  const grid = buildActivityGrid([evAt('2026-07-20T10:00:00Z')], { now: NOW })
  const future = flatten(grid).filter(c => c.future)
  assert.ok(future.length > 0, 'the current week should contain future days for this fixture')
  assert.ok(future.every(c => c.count === 0 && !c.known))
})

test('truncation is detected from the RAW count, before heartbeats are filtered out', () => {
  // The 500 cap applies server-side to all events. Filtering heartbeats first and then testing
  // the length would under-count and miss the truncation entirely.
  const events = Array.from({ length: JOURNEY_EVENT_CAP }, (_, i) => (
    i % 2 === 0
      ? { event: '$heartbeat', timestamp: '2026-04-10T10:00:00Z' }
      : evAt('2026-04-10T10:00:00Z')
  ))
  const grid = buildActivityGrid(events, { now: NOW })
  assert.equal(grid.truncated, true, 'a capped response half-full of heartbeats is still capped')
  assert.equal(grid.totalEvents, JOURNEY_EVENT_CAP / 2, 'heartbeats must not be counted as activity')
})

test('$heartbeat never creates an active day', () => {
  const grid = buildActivityGrid([{ event: '$heartbeat', timestamp: '2026-07-20T10:00:00Z' }], { now: NOW })
  assert.equal(grid.activeDays, 0)
  assert.equal(cellFor(grid, '2026-07-20').count, 0)
})

test('grid handles empty and malformed input without throwing', () => {
  for (const input of [[], null, undefined, [{ event: '$pageview' }], [evAt('not-a-date')]]) {
    assert.doesNotThrow(() => buildActivityGrid(input, { now: NOW }))
  }
  assert.equal(buildActivityGrid([], { now: NOW }).activeDays, 0)
})

test('intensity never returns a non-zero bucket for a zero count', () => {
  assert.equal(intensity(0, 10), 0)
  assert.equal(intensity(1, 10), 1)
  assert.equal(intensity(10, 10), 4)
  assert.equal(intensity(5, 0), 4)      // guards the divide-by-zero path
})

// ── trend markers ────────────────────────────────────────────────────────────

test('markers come from the complete buckets, not the capped recent-conversions list', () => {
  const labels = ['2026-07-01', '2026-07-02', '2026-07-03']
  const markers = buildTrendMarkers({
    labels,
    values: [10, 20, 30],
    // The server's complete count says day 1 had conversions...
    buckets: [{ dim_value: '2026-07-01', conversions: 4 }],
    // ...even though the capped detail list contains nothing for it.
    conversions: [],
    timezone: 'UTC'
  })
  assert.equal(markers.data[0], 10, 'the marker must exist and sit on the line')
  assert.equal(markers.meta[0].count, 4)
  assert.equal(markers.total, 4)
})

test('days with no conversions get null, never a zero plotted on the axis', () => {
  const markers = buildTrendMarkers({
    labels: ['2026-07-01', '2026-07-02'],
    values: [10, 20],
    buckets: [{ dim_value: '2026-07-01', conversions: 1 }],
    conversions: [],
    timezone: 'UTC'
  })
  assert.equal(markers.data[1], null, 'a quiet day must be a gap, not a point at y=0')
  assert.equal(markers.radii[1], 0)
  assert.equal(markers.meta[1], null)
})

test('zero available detail never renders as "Showing 0 of N"', () => {
  // Verified on staging, and NOT an edge case: /analytics/recent-conversions is .limit(20)
  // newest-first, so on site de200000-babe…1111 (53 conversions in 30 days) every day from
  // 2026-07-08 backwards has a correct bucket count and zero detail rows — including days whose
  // true count is exactly 1. "Showing 0 of 1" contradicted the marker sitting next to it.
  const markers = buildTrendMarkers({
    labels: ['2026-07-04'],
    values: [100],
    buckets: [{ dim_value: '2026-07-04', conversions: 1 }],
    conversions: [],                        // older than the newest 20 → no detail returned
    timezone: 'UTC'
  })
  assert.equal(markers.meta[0].count, 1, 'the count itself is correct and must still show')
  assert.equal(markers.meta[0].items.length, 0)
  assert.equal(markers.meta[0].detailNote, 'Conversion detail not loaded for this day')
  assert.doesNotMatch(markers.meta[0].detailNote, /showing 0/i)
})

test('detailNote is absent when the tooltip really does show every conversion', () => {
  const markers = buildTrendMarkers({
    labels: ['2026-07-04'],
    values: [100],
    buckets: [{ dim_value: '2026-07-04', conversions: 1 }],
    conversions: [{ conversion_timestamp: '2026-07-04T09:00:00Z', conversion_type: 'lead' }],
    timezone: 'UTC'
  })
  assert.equal(markers.meta[0].detailPartial, false)
  assert.equal(markers.meta[0].detailNote, null, 'a complete tooltip must not carry a caveat')
})

test('detailNote counts what is DISPLAYED, not what was received', () => {
  // items is capped at 3 for display. The caption must agree with the visible rows, or it
  // becomes its own small lie ("Showing 5 of 9" above three rows).
  const markers = buildTrendMarkers({
    labels: ['2026-07-04'],
    values: [100],
    buckets: [{ dim_value: '2026-07-04', conversions: 9 }],
    conversions: Array.from({ length: 5 }, () => ({ conversion_timestamp: '2026-07-04T09:00:00Z', conversion_type: 'lead' })),
    timezone: 'UTC'
  })
  assert.equal(markers.meta[0].items.length, 3)
  assert.equal(markers.meta[0].detailNote, 'Showing 3 of 9')
})

test('partial detail is flagged so the tooltip cannot imply it shows every conversion', () => {
  const markers = buildTrendMarkers({
    labels: ['2026-07-01'],
    values: [100],
    buckets: [{ dim_value: '2026-07-01', conversions: 12 }],
    conversions: [{ conversion_timestamp: '2026-07-01T09:00:00Z', conversion_type: 'purchase', conversion_value: 50 }],
    timezone: 'UTC'
  })
  assert.equal(markers.meta[0].count, 12)
  assert.equal(markers.meta[0].items.length, 1)
  assert.equal(markers.meta[0].detailPartial, true)
})

test('detail is bucketed in SITE timezone, matching how the server built the labels', () => {
  // 03:00 UTC on the 2nd is still the 1st in New York. The server keys its trend buckets with
  // getLocalDateString(ts, site.timezone), so a UTC-bucketed marker would land a day off.
  assert.equal(localDateString('2026-07-02T03:00:00Z', 'America/New_York'), '2026-07-01')
  assert.equal(localDateString('2026-07-02T03:00:00Z', 'UTC'), '2026-07-02')

  const markers = buildTrendMarkers({
    labels: ['2026-07-01'],
    values: [100],
    buckets: [{ dim_value: '2026-07-01', conversions: 1 }],
    conversions: [{ conversion_timestamp: '2026-07-02T03:00:00Z', conversion_type: 'purchase' }],
    timezone: 'America/New_York'
  })
  assert.equal(markers.meta[0].items.length, 1, 'detail must land in the same bucket the server used')
  assert.equal(markers.meta[0].detailPartial, false)
})

test('an invalid timezone falls back to UTC instead of throwing', () => {
  // Mirrors the server's isValidTimezone guard; a bad sites.timezone must not blank the chart.
  assert.doesNotThrow(() => localDateString('2026-07-02T03:00:00Z', 'Not/AZone'))
  assert.equal(localDateString('2026-07-02T03:00:00Z', 'Not/AZone'), '2026-07-02')
})

test('markers handle empty and malformed input without throwing', () => {
  assert.doesNotThrow(() => buildTrendMarkers())
  assert.doesNotThrow(() => buildTrendMarkers({ labels: null, buckets: null, conversions: null }))
  assert.equal(buildTrendMarkers({ labels: ['a'], values: [1], buckets: [], conversions: [] }).total, 0)
})
