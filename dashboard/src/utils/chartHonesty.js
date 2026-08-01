// design.md §9.2 — "A chart must never draw a shape that needs more data than it has."
//
// The tiers, verbatim from the spec:
//   fewer than 3 readings -> do not draw a chart, render the numbers
//   3 to 6 readings       -> straight segments only, a visible marker at every real
//                            reading, and a caption naming what the points are
//   7 or more readings    -> smoothing and area fill are permitted
//
// Every threshold below counts REAL READINGS, never axis slots. densifyDailySeries()
// deliberately inflates the slot count (that is the whole point of it), so a tier
// decided on `labels.length` would read a 2-reading series spread over 30 days as
// "30 points, smoothing permitted" — the exact shape §9.2 forbids.

export const MIN_CHART_POINTS = 3
export const SMOOTHING_MIN_POINTS = 7

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function addUtcDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// A reading is a slot that actually carries a number. `null` is a day we have no
// reading for; §9.2: "Days with no reading are not zero." Never count a null.
export function countReadings(values = []) {
  return values.filter(v => v != null).length
}

// Expand ascending 'YYYY-MM-DD' labels so every calendar day between the first and
// last label gets its own slot, with `null` in each series for the days that had no
// reading.
//
// This is what makes the x-axis honest. A Chart.js CATEGORY axis spaces slots by
// array index, so a sparse [Jul 2, Jul 14, Jul 27] draws three evenly-spaced points
// and fabricates a timeline — Jul 2->14 (12 days) and Jul 14->27 (13 days) render
// identically to Jul 2->3. One slot per calendar day makes horizontal distance
// proportional to real elapsed time again, using the data exactly as the API already
// shapes it: no new dependency, no backend change.
//
// A true `type: 'time'` scale is the other way to get this and is not available —
// Chart.js 4 bundles no date adapter, so a time scale throws without
// chartjs-adapter-date-fns, which this repo does not install.
//
// Non-date labels are returned untouched: on a categorical dimension (source,
// campaign) a slot is a named bucket, not a point in time, and index spacing is
// correct there.
export function densifyDailySeries(labels = [], seriesList = []) {
  const isDaily = labels.length > 1 && labels.every(l => ISO_DATE.test(String(l || '')))
  if (!isDaily) return { labels, series: seriesList, densified: false }

  const sorted = [...labels].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const indexOfLabel = new Map(labels.map((l, i) => [l, i]))

  const outLabels = []
  // 400 mirrors the same guard in api/routes/analytics.js — the longest range this
  // product offers is 90 days, so this only ever stops a malformed label pair.
  for (let day = first, i = 0; day <= last && i < 400; day = addUtcDays(day, 1), i++) {
    outLabels.push(day)
  }

  const series = seriesList.map(values =>
    outLabels.map(day => {
      const i = indexOfLabel.get(day)
      return i === undefined ? null : (values[i] ?? null)
    })
  )
  return { labels: outLabels, series, densified: true }
}

// Chart.js dataset overrides for the §9.2 tier the reading count falls into.
// `dense` carries the caller's EXISTING 7+ styling, so the smoothed tier keeps
// whatever tension/radius that chart already shipped and only the sparse tier is
// rewritten here.
//
// spanGaps is true in both tiers: a straight segment drawn between two real readings
// across a gap is a connector between two known values, which §9.2 allows ("straight
// segments only"). What it forbids is a CURVE through them, which tension: 0 removes.
export function honestLineStyle(readingCount, dense = {}) {
  if (readingCount >= SMOOTHING_MIN_POINTS) return { ...dense, spanGaps: true }
  return {
    ...dense,
    tension: 0,
    fill: false,
    pointRadius: 4,
    pointHoverRadius: 6,
    spanGaps: true
  }
}

export function hasEnoughPointsForChart(readingCount) {
  return readingCount >= MIN_CHART_POINTS
}

// §9.2 requires the 3-6 tier to carry "a caption naming what the points are".
// Names the real reading dates so the reader can see which slots on a densified
// axis are measurements and which are gaps.
export function readingsCaption(labels = [], values = []) {
  const dates = labels.filter((_l, i) => values[i] != null)
  if (dates.length === 0 || dates.length >= SMOOTHING_MIN_POINTS) return null
  const pretty = dates.map(formatShortDay).join(', ')
  return `${dates.length} ${dates.length === 1 ? 'reading' : 'readings'}: ${pretty}. Days without a reading are gaps, not zero.`
}

export function formatShortDay(iso) {
  if (!ISO_DATE.test(String(iso || ''))) return String(iso ?? '')
  const d = new Date(`${iso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
