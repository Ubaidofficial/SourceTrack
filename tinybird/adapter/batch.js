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

// DEAD-LETTER (incident 2026-07-14 B1). When a batch fails to POST after the transport's own retries,
// the event was previously destroyed by dual-write.js's `.catch(()=>{})` — 200 already returned, gone
// forever, no PostHog fallback. A failed batch must be CAPTURED, never silently discarded. The default
// sink is a LOUD, UNSAMPLED log line PER EVENT carrying event_id + site_id + event_type + reason +
// disposition — Railway retains logs durably, so which events were lost and why is recoverable and
// alert-able. NEVER the event body (PII — the adapter never logs bodies). A stronger replay sink
// (DB / object store) can be injected via opts.deadLetter without touching this module. Never throws.
function defaultDeadLetter (events, meta) {
  try {
    const reason = (meta && meta.reason) || 'unknown'
    const disposition = (meta && meta.disposition) || 'permanent'
    for (const e of events) {
      console.error(`[ingest-deadletter] event_id=${e && e.event_id} site_id=${e && e.site_id} event=${e && e.event_type} disposition=${disposition} reason=${reason}`)
    }
  } catch (_) { /* dead-letter must never break ingest */ }
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
  const { transport, flushAt, flushInterval, gzipPayload = true, onError, observe = defaultObserve, deadLetter = defaultDeadLetter, maxRequeue } = opts
  if (typeof transport !== 'function') {
    throw new TypeError('createBatcher: `transport` must be an injected function')
  }
  const observeSafe = (stage, events, extra) => { try { observe(stage, events, extra) } catch (_) {} }
  const deadLetterSafe = (events, meta) => { try { deadLetter(events, meta) } catch (_) {} }

  const N = flushAt ?? envInt('TINYBIRD_FLUSH_AT', 20, 1)
  const T = flushInterval ?? envInt('TINYBIRD_FLUSH_INTERVAL_MS', 10000, 0)
  // Bounded re-queue for RETRYABLE-exhausted batches (429/5xx that survived the transport's own
  // retries). Per-event count in a WeakMap so it survives re-buffering; at the cap the batch goes to
  // dead-letter instead of looping. Permanent 4xx never re-queues (batch.js has always said so).
  const MAX_REQUEUE = maxRequeue ?? envInt('TINYBIRD_MAX_REQUEUE', 2, 2)
  const requeues = new WeakMap() // event object -> times re-queued
  const inFlight = new Set() // batches currently awaiting transport — dead-lettered if a shutdown drain times out mid-POST
  // Bounded shutdown drain deadline (B2). MUST stay inside the platform's SIGTERM->SIGKILL grace
  // (index.js forces exit at 10s). Anything not delivered by the deadline is dead-lettered, not lost.
  const DRAIN_DEADLINE_MS = envInt('TINYBIRD_SHUTDOWN_DRAIN_MS', 8000, 8000)

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
    inFlight.add(batch)
    try {
      await transport(payload, { count: batch.length, gzip: gzipPayload })
      observeSafe('delivered', batch) // the POST succeeded — these event_ids are persisted
    } catch (err) {
      // SURRENDER point: the INJECTED transport (transport.js withRetry) already retried 429/5xx to
      // exhaustion, OR this is a permanent 4xx (auth / 413 / malformed) that is not retried at all.
      // An accepted event must NEVER be silently discarded here (dual-write.js:62 swallows the reject).
      const msg = (err && err.message) ? err.message : String(err)
      const retryable = !!(err && err.retryable === true)
      const attempts = Math.max(0, ...batch.map((e) => requeues.get(e) || 0))
      // Retryable-exhausted (a sustained 429/5xx burst) → bounded RE-QUEUE for a later flush. Permanent
      // 4xx, or the re-queue cap reached → DEAD-LETTER (durable capture + alert), NEVER loop.
      if (retryable && attempts < MAX_REQUEUE) {
        for (const e of batch) requeues.set(e, (requeues.get(e) || 0) + 1)
        observeSafe('requeued', batch, { reason: msg, attempt: attempts + 1 })
        buffer.unshift(...batch) // put back at the FRONT (preserve enqueue order); drains on the next timer/threshold
        startTimer()
        throw err // this deliver still rejects (caller swallows); the re-queued events retry via the buffer
      }
      observeSafe('dropped', batch, { reason: msg })
      observeSafe('dead-letter', batch, { reason: msg, disposition: retryable ? 'requeue-exhausted' : 'permanent' })
      deadLetterSafe(batch, { reason: msg, disposition: retryable ? 'requeue-exhausted' : 'permanent', permanent: !retryable })
      if (typeof onError === 'function') onError(err, batch)
      throw err
    } finally {
      inFlight.delete(batch) // resolved one way or another (delivered / re-queued / dead-lettered)
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

  // BLOCK-UNTIL-DRAIN (B2). Bounded, AWAITED drain for shutdown: flush the buffered tail and wait for
  // the in-flight chain to settle, but never past deadlineMs. Guarantee: on return, every accepted
  // event is either DELIVERED or DEAD-LETTERED — never silently lost. (The fire-and-forget
  // stop().catch(()=>{}) it replaces let a container recycle eat the buffer tail with no trace.)
  async function drain (deadlineMs = DRAIN_DEADLINE_MS) {
    if (timer !== null) { clearInterval(timer); timer = null }
    if (buffer.length > 0) observeSafe('draining', buffer.slice(), { reason: 'shutdown' })
    const flushed = flush().catch(() => {}) // failures are dead-lettered inside deliver(); don't reject the drain
    let timedOut = false
    let deadline
    await Promise.race([
      // NOT unref'd: during shutdown we deliberately keep the process alive UP TO the deadline so the
      // in-flight POST can finish. Cleared the moment the flush settles, so a fast drain never over-waits.
      Promise.allSettled([flushed, chain]).then(() => { clearTimeout(deadline) }),
      new Promise((r) => { deadline = setTimeout(() => { timedOut = true; r() }, deadlineMs) })
    ])
    // Capture everything not confirmed delivered so nothing is silently lost:
    //   • buffer residual — a retryable failure re-queued with no time left to retry
    //   • in-flight batches — a POST still awaiting transport when the deadline fired
    // The in-flight POST MIGHT still land after SIGKILL grace; dead-lettering it risks a duplicate, but
    // the events plane is append-only + dedup-on-read, so a possible dup is safe and a loss is not.
    const residual = [...buffer, ...[...inFlight].flat()]
    buffer = []; inFlight.clear()
    if (residual.length > 0) {
      observeSafe('dead-letter', residual, { reason: timedOut ? 'shutdown-drain-timeout' : 'shutdown-residual', disposition: 'shutdown' })
      deadLetterSafe(residual, { reason: `shutdown drain incomplete (deadline=${deadlineMs}ms, timedOut=${timedOut})`, disposition: 'shutdown' })
    }
    return { drained: !timedOut && residual.length === 0, remaining: residual.length }
  }

  // Flush-on-shutdown. AWAITED bounded drain (replaces the old fire-and-forget stop().catch()).
  // A signal handler cannot block another handler's process.exit(), so the batcher registers FIRST
  // (constructed before index.js's shutdown listener) and its drain is the belt; the hard guarantee is
  // index.js's ordered shutdown awaiting drainDualWrite() before process.exit() (see dual-write.js).
  async function onShutdown () { await drain() }
  process.once('SIGTERM', onShutdown)
  process.once('SIGINT', onShutdown)
  process.once('beforeExit', onShutdown)

  return {
    enqueue,
    flush,
    stop,
    drain,
    size: () => buffer.length,
    config: { flushAt: N, flushInterval: T, gzip: gzipPayload }
  }
}
