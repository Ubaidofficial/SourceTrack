// GitHub-style activity contribution grid for a single visitor's journey.
//
// THE TRUTH PROBLEM THIS MODULE EXISTS TO SOLVE (§6 — no fake zeros):
// The journey read is `ORDER BY timestamp ASC LIMIT 500` — identical in api/routes/journey.js
// and tinybird/pipes/journey.pipe. ASC + LIMIT means the response holds a visitor's OLDEST 500
// events, so for any visitor above that cap the MOST RECENT activity is the part that is
// missing. A grid painted naively from `data.events` would therefore render empty cells over
// days that visitor was demonstrably active — inventing absence, which is exactly the failure
// mode a contribution grid makes most convincing (an empty square reads as "nothing happened",
// never as "we didn't look").
//
// So a cell is one of three things, never two:
//   known: true,  count > 0  → measured activity
//   known: true,  count = 0  → measured absence. Honest ONLY inside the window we actually have.
//   known: false             → outside the fetched window. The UI must render this visibly
//                              differently from a zero; it is "unknown", not "none".
//
// The known window runs from the visitor's first event (ASC ordering guarantees events[0] IS
// their earliest retained event, so days before it inside the grid are genuine zeros) through
// `knownThrough`. When the response is truncated, knownThrough is the last event we received
// and everything after it is unknown. When it is not truncated, knownThrough is now and the
// whole grid is measured.
//
// Retention note: the nightly retention purge (api/jobs/nightly-attribution.js runRetentionPurge)
// deletes Supabase rows — attributed_conversions, the GSC cache tables, capi_deliveries,
// custom_events — and the free-tier purge deletes `pageviews`. Neither touches the Tinybird
// events store this journey reads, so events[0] is not silently clipped by retention today. If
// a TTL is ever added to that store, this module's "before first event = genuine zero"
// assumption is what breaks first.

import { safeNumber } from '../utils/numbers.js'

// Mirrors the hard cap in api/routes/journey.js:68 and the LIMIT in tinybird/pipes/journey.pipe.
// If either moves, this must move with it or truncation goes undetected.
export const JOURNEY_EVENT_CAP = 500

export const GRID_WEEKS = 26   // ~6 months

// $heartbeat is a page-exit beacon, not something the visitor did — JourneyModal already keeps
// it out of the timeline for the same reason. Counting it would inflate active days.
const isCountable = (e) => e && e.event !== '$heartbeat' && e.timestamp

// Local-midnight key. Bucketing by LOCAL date matches how every other timestamp in
// JourneyModal is rendered (toLocaleString), so a row in the grid lines up with the timeline
// entry the user clicks through to. A UTC bucket would disagree with the timeline by up to a
// day near midnight.
function dayKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function atMidnight(d) {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c
}

function addDays(d, n) {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

/**
 * Build the contribution grid.
 *
 * @param {Array} events   - journey events, oldest first (as the endpoint returns them).
 * @param {object} opts
 * @param {Date}   opts.now   - injectable "today" so this is testable without a clock.
 * @param {number} opts.weeks - columns to render.
 * @returns {{
 *   columns: Array<Array<{date:string, count:number, known:boolean, future:boolean}>>,
 *   truncated: boolean, knownThrough: string|null, firstEvent: string|null,
 *   totalEvents: number, activeDays: number, maxCount: number
 * }}
 */
export function buildActivityGrid(events, opts = {}) {
  const weeks = opts.weeks || GRID_WEEKS
  const now = opts.now ? new Date(opts.now) : new Date()
  const list = (Array.isArray(events) ? events : []).filter(isCountable)

  // Truncation is inferred from the RAW event count, not the countable one — the cap applies
  // before heartbeats are filtered out, so filtering first would mask a truncated response.
  const rawCount = Array.isArray(events) ? events.length : 0
  const truncated = rawCount >= JOURNEY_EVENT_CAP

  const counts = new Map()
  let firstTs = null
  let lastTs = null
  for (const e of list) {
    const d = new Date(e.timestamp)
    if (Number.isNaN(d.getTime())) continue
    const k = dayKey(d)
    counts.set(k, (counts.get(k) || 0) + 1)
    if (firstTs === null || d < firstTs) firstTs = d
    if (lastTs === null || d > lastTs) lastTs = d
  }

  const today = atMidnight(now)
  // Known through: the last event we actually received when the response was truncated,
  // otherwise today. Beyond this we have no evidence either way.
  const knownThroughDate = truncated && lastTs ? atMidnight(lastTs) : today
  const firstDate = firstTs ? atMidnight(firstTs) : null

  // Align the last column to the current week (Sunday-start, matching the reference layout).
  const lastColumnStart = addDays(today, -today.getDay())
  const firstColumnStart = addDays(lastColumnStart, -(weeks - 1) * 7)

  const columns = []
  let activeDays = 0
  let maxCount = 0

  for (let w = 0; w < weeks; w++) {
    const col = []
    for (let dow = 0; dow < 7; dow++) {
      const date = addDays(firstColumnStart, w * 7 + dow)
      const key = dayKey(date)
      const future = date > today
      const count = counts.get(key) || 0
      // A day is known when it falls inside the window we actually hold: at or before
      // knownThrough, and not before the visitor's first event... except that days before the
      // first event ARE known to be empty (ASC ordering proves nothing earlier exists), so the
      // only genuinely unknown region is after knownThrough.
      const known = !future && date <= knownThroughDate
      if (known && count > 0) {
        activeDays++
        if (count > maxCount) maxCount = count
      }
      col.push({ date: key, count: known ? count : 0, known, future })
    }
    columns.push(col)
  }

  return {
    columns,
    truncated,
    knownThrough: dayKey(knownThroughDate),
    firstEvent: firstDate ? dayKey(firstDate) : null,
    totalEvents: list.length,
    activeDays,
    maxCount
  }
}

/**
 * Intensity bucket 0-4 for a cell, GitHub-style. Relative to the visitor's own busiest day, so
 * a low-volume visitor still gets a readable spread instead of one faint shade.
 */
export function intensity(count, maxCount) {
  const c = safeNumber(count, 0)
  if (c <= 0) return 0
  const max = Math.max(1, safeNumber(maxCount, 1))
  const ratio = c / max
  if (ratio > 0.75) return 4
  if (ratio > 0.5) return 3
  if (ratio > 0.25) return 2
  return 1
}
