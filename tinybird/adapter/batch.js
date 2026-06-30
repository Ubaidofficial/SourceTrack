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
import { tempDebug } from './temp-debug.js' // TEMP-DEBUG (revert)

const gzipAsync = promisify(gzip)

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
  const { transport, flushAt, flushInterval, gzipPayload = true, onError } = opts
  if (typeof transport !== 'function') {
    throw new TypeError('createBatcher: `transport` must be an injected function')
  }

  const N = flushAt ?? envInt('TINYBIRD_FLUSH_AT', 20, 1)
  const T = flushInterval ?? envInt('TINYBIRD_FLUSH_INTERVAL_MS', 10000, 0)

  let buffer = []
  let timer = null
  // Serialize flushes so payloads transport in enqueue order and never overlap.
  let chain = Promise.resolve()

  function startTimer () {
    if (T > 0 && timer === null) {
      timer = setInterval(() => { tempDebug('batch', `timer FIRED (T=${T}) -> flush; buffer=${buffer.length}`); flush().catch(() => {}) }, T) // TEMP-DEBUG (revert)
      if (typeof timer.unref === 'function') timer.unref() // don't keep the event loop alive
    }
  }

  async function deliver (batch) {
    tempDebug('batch', `deliver: gzip+POST attempt count=${batch.length}`) // TEMP-DEBUG (revert)
    const ndjson = batch.map((e) => JSON.stringify(e)).join('\n') + '\n'
    const payload = gzipPayload ? await gzipAsync(ndjson) : ndjson
    try {
      tempDebug('batch', 'deliver: calling transport (POST) now') // TEMP-DEBUG (revert)
      await transport(payload, { count: batch.length, gzip: gzipPayload })
      tempDebug('batch', 'deliver: transport returned OK (2xx)') // TEMP-DEBUG (revert)
    } catch (err) {
      // Phase 2d: 429/5xx retry+backoff lives in the INJECTED transport
      // (transport.js withRetry); this catch is the SURRENDER point after retries
      // are exhausted (or a permanent 4xx). We surface to onError and re-throw;
      // events are NOT silently re-queued (avoids unbounded growth / double-send).
      if (typeof onError === 'function') onError(err, batch)
      throw err
    }
  }

  function flush () {
    if (buffer.length === 0) { tempDebug('batch', 'flush called but buffer EMPTY -> noop'); return Promise.resolve() } // TEMP-DEBUG (revert)
    const batch = buffer
    buffer = []
    tempDebug('batch', `flush FIRING batchCount=${batch.length}`) // TEMP-DEBUG (revert)
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
    startTimer()
    tempDebug('batch', `enqueue buffer=${buffer.length} N=${N} T=${T} timerArmed=${timer !== null}`) // TEMP-DEBUG (revert)
    if (buffer.length >= N) { tempDebug('batch', 'enqueue: buffer>=N -> flush now'); return flush() } // TEMP-DEBUG (revert)
    tempDebug('batch', 'enqueue: below N -> buffered (awaiting timer/stop)') // TEMP-DEBUG (revert)
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
