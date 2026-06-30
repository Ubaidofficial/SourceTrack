// SourceTrack — bounded, never-throwing log sampler for the Tinybird dual-write
// observability surface (Phase 2d-obs).
//
// Why: dual-write failures (a failing POST in batch.js deliver, or a normalize
// throw in dual-write.js) were 100% silent — no onError was wired, so "zero POST
// attempts" was invisible for an entire debug session. We want those failures
// VISIBLE, but a per-event log on a hot path would flood (and never the event body
// — PII). This emits at most once per interval, accumulating a suppressed count
// that rides on the next emitted line.
//
// Contract: emit() NEVER throws (a logging failure must not break failure
// isolation) and is bounded (no unbounded log growth under sustained failure).
//
// ESM; no external deps; no api/ imports (standalone, like the rest of the adapter).

/**
 * @param {object}   [opts]
 * @param {number}   [opts.intervalMs=60000] minimum gap between emitted lines
 * @param {()=>number} [opts.now=Date.now]   injectable clock (tests)
 * @param {(msg:string)=>void} [opts.sink]   injectable sink (tests). When omitted,
 *        console.warn is resolved at EMIT time (not bound at creation) so a swapped
 *        console.warn — e.g. a test capture or a logger replacement — is honored.
 * @returns {(message:string)=>void} emit — logs at most once per interval
 */
// Cap a producer-controlled label (event_type / event name) before it reaches a log
// line. These are canonical type strings by contract ('$conversion', '$pageview'),
// but un-allowlisted free text in principle — truncating bounds a misbehaving
// producer's ability to stuff PII or bulk data into a log. Defense-in-depth.
export function capLabel (value, max = 64) {
  if (value == null) return ''
  const s = String(value)
  return s.length > max ? s.slice(0, max) + '…' : s
}

export function createSampledLogger ({ intervalMs = 60000, now = Date.now, sink } = {}) {
  let lastEmit = -Infinity
  let suppressed = 0
  return function emit (message) {
    const t = now()
    if (t - lastEmit >= intervalMs) {
      const extra = suppressed > 0 ? ` [+${suppressed} similar suppressed since last]` : ''
      suppressed = 0
      lastEmit = t
      // Logging must NEVER throw into the caller's failure-isolated path.
      try { (sink || console.warn)(String(message) + extra) } catch (_) { /* swallow */ }
    } else {
      suppressed++
    }
  }
}
