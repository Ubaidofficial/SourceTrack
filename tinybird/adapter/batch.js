// SourceTrack — Tinybird ingest adapter: buffered NDJSON batcher (Phase 2a).
//
// Transport layer ONLY. Buffers normalized events, flushes at N events OR T ms,
// serializes to NDJSON, gzips, and hands the payload to a DEPENDENCY-INJECTED
// `transport(payload, meta)` function. It never hardcodes the Events API URL or
// any token — the real POST (and its 429-aware retry/backoff) is Phase 2d.
//
// Flush thresholds mirror the existing posthog-node config (api/lib/posthog.js:5-11
// on origin/main): POSTHOG_FLUSH_AT -> TINYBIRD_FLUSH_AT, POSTHOG_FLUSH_INTERVAL_MS
// -> TINYBIRD_FLUSH_INTERVAL_MS, same prod/staging-vs-dev defaults.
//
// ESM; only node:zlib + node:util; no api/ imports.

import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

const gzipAsync = promisify(gzip)

// Ingest observability (§ incident 2026-07-14: /api/track returned 200 and persisted NOTHING,
// with ZERO write-path log lines — a silent drop was INVISIBLE). Every event is traced through the
// batcher lifecycle so a 200-with-no-persisted-row is impossible to produce without a log line:
//   accepted  — buffered (one line per event, carries event_id + site_id)
//   delivered — the transport POST succeeded (one line per flushed batch)
//   dropped   — the transport POST failed after retries (batch NOT delivered; carries the reason)
//   draining  — a NON-empty buffer is being flushed on shutdown/stop; if no matching `delivered`
//               line follows, the container recycled before the flush drained → the tail is lost
// UNSAMPLED on purpose: the trail must be complete (a sampled accept/deliver line breaks the
// accepted-minus-delivered=dropped diff). event_ids are capped and site_ids deduped; never the body
// (PII). Overridable via opts.observe for tests. Never throws into the batcher.
function defaultObserve (stage, events, extra) {
  try {
    const ids = events.map((e) => e && e.event_id).filter(Boolean)
    const sites = [...new Set(events.map((e) => e && e.site_id).filter(Boolean))]
    const idStr = ids.length <= 10 ? ids.join(',') : ids.slice(0, 10).join(',') + `,+${ids.length - 10}`
    const reason = extra && extra.reason ? ` reason=${extra.reason}` : ''
    console.log(`[ingest-obs] ${stage} count=${events.length} sites=${sites.join(',')} event_ids=[${idStr}]${reason}`)
  } catch (_) { /* observability must never break ingest */ }
}

// Mirror api/lib/posthog.js: env override, else 20/10000 on prod|staging, else 1/0.
function envInt (name, prodDefault, devDefault) {
  if (process.env[name]) return parseInt(process.env[name], 10)
  const prod = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
  return prod ? prodDefault : devDefault
}

/**
 * Create a buffered batcher.
 *
 * @param {object}   opts
 * @param {(payload:Buffer|string, meta:{count:number,gzip:boolean})=>Promise<void>} opts.transport
 *        REQUIRED, dependency-injected. Receives the (gzipped) NDJSON payload.
 * @param {number}  [opts.flushAt]          override TINYBIRD_FLUSH_AT
 * @param {number}  [opts.flushInterval]    override TINYBIRD_FLUSH_INTERVAL_MS (ms; 0 disables the timer)
 * @param {boolean} [opts.gzipPayload=true] gzip the NDJSON before transport
 * @param {(err:Error, batch:object[])=>void} [opts.onError] called when transport throws
 * @returns {{enqueue, flush, stop, size, config}}
 */
export function createBatcher (opts = {}) {
  const { transport, flushAt, flushInterval, gzipPayload = true, onError, observe = defaultObserve } = opts
  if (typeof transport !== 'function') {
    throw new TypeError('createBatcher: `transport` must be an injected function')
  }
  const observeSafe = (stage, events, extra) => { try { observe(stage, events, extra) } catch (_) {} }

  const N = flushAt ?? envInt('TINYBIRD_FLUSH_AT', 20, 1)
  const T = flushInterval ?? envInt('TINYBIRD_FLUSH_INTERVAL_MS', 10000, 0)

  let buffer = []
  let timer = null
  // Serialize flushes so payloads transport in enqueue order and never overlap.
  let chain = Promise.resolve()

  function startTimer () {
    if (T > 0 && timer === null) {
      timer = setInterval(() => { flush().catch(() => {}) }, T)
      if (typeof timer.unref === 'function') timer.unref() // don't keep the event loop alive
    }
  }

  async function deliver (batch) {
    const ndjson = batch.map((e) => JSON.stringify(e)).join('\n') + '\n'
    const payload = gzipPayload ? await gzipAsync(ndjson) : ndjson
    try {
      await transport(payload, { count: batch.length, gzip: gzipPayload })
      observeSafe('delivered', batch) // the POST succeeded — these event_ids are persisted
    } catch (err) {
      // Phase 2d: 429/5xx retry+backoff lives in the INJECTED transport
      // (transport.js withRetry); this catch is the SURRENDER point after retries
      // are exhausted (or a permanent 4xx). We surface to onError and re-throw;
      // events are NOT silently re-queued (avoids unbounded growth / double-send).
      // The 'dropped' line makes the surrender VISIBLE per-event (onError is a sampled summary).
      observeSafe('dropped', batch, { reason: (err && err.message) ? err.message : String(err) })
      if (typeof onError === 'function') onError(err, batch)
      throw err
    }
  }

  function flush () {
    if (buffer.length === 0) return Promise.resolve()
    const batch = buffer
    buffer = []
    // `result` rejects for THIS caller if this batch fails. The ordering chain is
    // the SWALLOWED branch (`.catch(() => {})`), so one transport failure cannot
    // poison successors — the next batch still delivers (it is only dropped, with
    // onError fired, never silently bricking the batcher).
    const result = chain.then(() => deliver(batch))
    chain = result.catch(() => {})
    return result
  }

  function enqueue (event) {
    buffer.push(event)
    observeSafe('accepted', [event]) // event entered the buffer — the positive accept line
    startTimer()
    if (buffer.length >= N) return flush()
    // Buffered only — return a resolved promise, NOT the in-flight `chain`, so an
    // awaiting caller isn't coupled to an unrelated slow flush. The event drains
    // on the next threshold / timer / stop().
    return Promise.resolve()
  }

  function stop () {
    if (timer !== null) { clearInterval(timer); timer = null }
    process.removeListener('SIGTERM', onShutdown)
    process.removeListener('SIGINT', onShutdown)
    process.removeListener('beforeExit', onShutdown)
    // Make a partial batch at shutdown VISIBLE: emit 'draining' with the buffered event_ids BEFORE
    // the async flush starts. If the container is killed before the POST drains, there is no matching
    // 'delivered' line for these ids — so the tail loss is diagnosable instead of invisible.
    if (buffer.length > 0) observeSafe('draining', buffer.slice(), { reason: 'shutdown' })
    return flush()
  }

  // Flush-on-shutdown (best-effort). Mirrors posthog.js's exit-flush intent.
  function onShutdown () { stop().catch(() => {}) }
  process.once('SIGTERM', onShutdown)
  process.once('SIGINT', onShutdown)
  process.once('beforeExit', onShutdown)

  return {
    enqueue,
    flush,
    stop,
    size: () => buffer.length,
    config: { flushAt: N, flushInterval: T, gzip: gzipPayload }
  }
}
