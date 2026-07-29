// Real event markers plotted ON the Performance Trend line, at the bucket where the event
// actually happened — replacing "read the chart, then read a separate table to find out when
// anything occurred".
//
// WHERE THE MARKERS COME FROM, and why it is not the obvious source (§6):
// The obvious source is `recentConversions`, the same rows the Recent Conversions card renders.
// It is the WRONG source for markers: /analytics/recent-conversions is `.limit(20)` ordered
// newest-first (api/routes/analytics.js:820-821), so on any site with more than 20 conversions
// in the range it silently omits the older ones. Markers drawn from it would say "these are the
// events" while leaving real events unmarked — the chart would be quietly lying about the past.
//
// So the marker SET comes from the trend buckets (`channel_trend`), which the server builds by
// counting every conversion in the range (api/routes/dashboard.js:259-261). That set is complete
// for the selected window. `recentConversions` is used only to ENRICH a marker's tooltip with
// specific detail where it happens to have rows for that day — never to decide whether a marker
// exists. A day with conversions always gets its marker, whether or not detail is available.
//
// Bucketing must agree with the server or markers land on the wrong day. The server keys both
// trend maps with getLocalDateString(conversion_timestamp, site.timezone) — a SITE-timezone
// local date, not UTC and not the browser's zone. localDateString below mirrors
// api/lib/utils.js:432 exactly (same Intl.DateTimeFormat + formatToParts approach) so the two
// cannot drift.

import { safeNumber } from '../utils/numbers.js'

/**
 * YYYY-MM-DD for a date in a given IANA timezone. Mirror of api/lib/utils.js getLocalDateString.
 * Falls back to UTC on an unusable zone, matching the server's isValidTimezone guard.
 */
export function localDateString(date, timeZone) {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  let parts
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d)
  } catch {
    // Invalid IANA zone — same fallback the server takes rather than throwing off a bad column.
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d)
  }
  let year = '', month = '', day = ''
  for (const p of parts) {
    if (p.type === 'year') year = p.value
    else if (p.type === 'month') month = p.value
    else if (p.type === 'day') day = p.value
  }
  return year && month && day ? `${year}-${month}-${day}` : ''
}

// Caption for a marker whose tooltip cannot show every conversion behind it.
//
// The zero case is NOT "Showing 0 of 1" — that reads as a bug or a contradiction (the marker is
// right there asserting one conversion). It is a real and COMMON state, not an edge case:
// /analytics/recent-conversions is `.limit(20)` newest-first, so on a busy site EVERY day older
// than the 20th most recent conversion has a correct count and zero detail rows. Verified on
// staging — site de200000-babe…1111 has 53 conversions in 30 days, and every day from
// 2026-07-08 backwards returns 0 detail rows, including days whose true count is exactly 1.
//
// A second, rarer path reaches the same state at the window edges: recent-conversions FILTERS on
// `conversion_date`, which is the UTC date (verified: 42/42 rows on the Europe/Paris staging
// site), while the trend buckets are keyed by the SITE-timezone local date. For a non-UTC site
// those disagree — 36 of 42 rows on that site — so a conversion just inside the tz-local window
// can fall outside the UTC-dated filter and arrive with no detail at all.
//
// Either way the COUNT is correct and the DETAIL is absent, so the caption says exactly that.
function detailNote(shown, count) {
  if (shown >= count) return null
  if (shown === 0) return 'Conversion detail not loaded for this day'
  return `Showing ${shown} of ${count}`
}

/**
 * Build the marker overlay for the trend chart.
 *
 * @param {object} input
 * @param {string[]} input.labels   - chart labels, the server's local-date bucket keys.
 * @param {number[]} input.values   - the line's y value per label; markers sit ON the line.
 * @param {Array}  input.buckets    - COMPLETE per-day counts: [{dim_value, conversions}].
 * @param {Array}  input.conversions- up to 20 recent rows, for tooltip detail only.
 * @param {string} input.timezone   - site timezone; must match the server's bucketing.
 * @returns {{ data: Array<number|null>, radii: number[], meta: Array<null|object>, total: number }}
 */
export function buildTrendMarkers(input = {}) {
  // Normalized rather than destructure-defaulted: a default only fires on `undefined`, and the
  // hook genuinely hands over null-ish arrays before the first payload lands. A throw here
  // blanks the whole chart card.
  const src = input || {}
  const labels = Array.isArray(src.labels) ? src.labels : []
  const values = Array.isArray(src.values) ? src.values : []
  const buckets = Array.isArray(src.buckets) ? src.buckets : []
  const conversions = Array.isArray(src.conversions) ? src.conversions : []
  const timezone = src.timezone || 'UTC'

  // Complete counts, keyed by bucket date.
  const countByDate = new Map()
  for (const b of buckets) {
    const key = b?.dim_value
    const n = safeNumber(b?.conversions, 0)
    if (key && n > 0) countByDate.set(key, (countByDate.get(key) || 0) + n)
  }

  // Detail rows, bucketed the SAME way (from the timestamp, in site tz) rather than trusting
  // conversion_date — that column is written independently and can sit a day off the tz-local
  // bucket the trend line uses.
  const detailByDate = new Map()
  for (const c of conversions) {
    const key = localDateString(c?.conversion_timestamp || c?.conversion_date, timezone)
    if (!key) continue
    if (!detailByDate.has(key)) detailByDate.set(key, [])
    detailByDate.get(key).push(c)
  }

  const data = []
  const radii = []
  const meta = []
  let total = 0

  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]
    const count = countByDate.get(label) || 0
    if (count <= 0) {
      // null creates a gap — no point drawn. Not 0, which would plant a marker on the axis.
      data.push(null)
      radii.push(0)
      meta.push(null)
      continue
    }
    total += count
    data.push(safeNumber(values[i], 0))
    // Gentle size ramp so a heavy day reads as heavier without the dot swallowing the line.
    radii.push(count >= 10 ? 7 : count >= 5 ? 6 : count >= 2 ? 5 : 4)
    const items = (detailByDate.get(label) || []).slice(0, 3)
    meta.push({
      date: label,
      count,
      // Detail is a SAMPLE, not the full set — recentConversions is capped at 20 overall. The
      // flag lets the tooltip say so instead of implying these are all of them.
      items,
      detailPartial: items.length < count,
      detailNote: detailNote(items.length, count)
    })
  }

  return { data, radii, meta, total }
}
