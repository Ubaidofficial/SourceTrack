// C4 — live events feed + cold-start helpers. PURE (no React), so the behaviour is unit-tested in
// api/tests/c4-setup-health.test.js (this repo has no React test runner; JSX wiring is CI-build-checked).

// Poll cadence: match the dual-write batcher's TINYBIRD_FLUSH_INTERVAL_MS (10s). A pageview rides that
// flush timer before it reaches Tinybird, so polling faster than the flush buys nothing.
export const LIVE_FEED_POLL_MS = 10000

// Pause polling when the tab is hidden — a backgrounded tab should not keep hitting the API.
export function shouldPoll (hidden) {
  return !hidden
}

// /events/latest exposes NO event_id column (the pipe SELECT has none), so we de-dupe on a composite
// natural key. This is what makes the polled feed stable: each poll returns the latest N rows, mostly
// overlapping what is already shown, and duplicates must collapse rather than stack.
export function eventKey (e) {
  return [e?.timestamp, e?.event, e?.distinct_id, e?.page_url].join('|')
}

// Merge (newest-first) and drop duplicates by composite key, capped. Pass [...incoming, ...existing]
// so genuinely-new events surface at the top and re-seen events are dropped.
export function dedupeEventsById (events, cap = 100) {
  const seen = new Set()
  const out = []
  for (const e of (events || [])) {
    const k = eventKey(e)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(e)
    if (out.length >= cap) break
  }
  return out
}

// Cold-start: the live feed appears on the Dashboard ONLY when there is no historical data to show,
// and disappears once real aggregates exist. Cheap — reads the dashboard payload already fetched
// (hasConversions / hasTraffic, or the underlying totals). No new pipe.
export function hasHistoricalData (d) {
  if (!d) return false
  if (d.hasConversions === true || d.hasTraffic === true) return true
  return Number(d.totalConversions || 0) > 0 ||
    (Array.isArray(d.trafficSources) && d.trafficSources.length > 0) ||
    (Array.isArray(d.trafficTopPages) && d.trafficTopPages.length > 0)
}
