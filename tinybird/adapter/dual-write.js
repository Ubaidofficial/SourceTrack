// SourceTrack — Tinybird dual-write integration (Phase 2c).
//
// The SINGLE, flag-gated point where a live producer mirrors its event onto the
// Tinybird events plane, IN PARALLEL to its existing ph.capture. Off by default.
//
// Hard guarantees (proven in dual-write.test.js):
//   - TINYBIRD_DUAL_WRITE off  -> dualWriteEvent() is a pure no-op: no normalize,
//     no batcher constructed, no transport, no network, input never mutated.
//   - Additive only: producers call this AFTER ph.capture; it NEVER throws into,
//     blocks, or alters the live capture path.
//   - Uses the EXISTING adapter (normalizeEvent derives event_id + drops PII/
//     site_key; createBatcher batches) — nothing re-implemented here.
//   - The transport is DEPENDENCY-INJECTED. Until one is injected (the real POST
//     lands in Phase 2d), even flag-on is a no-op. No token, no URL here.

import { normalizeEvent } from './normalize.js'
import { createBatcher } from './batch.js'
import { createSampledLogger, capLabel } from './log-sampler.js'
import { tempDebug } from './temp-debug.js' // TEMP-DEBUG (revert)

let _transport = null
let _batcher = null
let _batcherOpts
// Sampled, bounded logger for the normalize/enqueue swallow below — so a normalize
// throw is VISIBLE (once per interval, with a suppressed count) instead of silent.
let _dropLog = createSampledLogger()

// Test-only: reset the sampler so a test starts from a clean (un-emitted) state.
export function __resetDualWriteObservability () { _dropLog = createSampledLogger() }

export function isDualWriteEnabled () {
  const v = process.env.TINYBIRD_DUAL_WRITE
  return v === 'true' || v === '1'
}

// Inject the transport (Phase 2d real POST, or a test mock). Resets the batcher so
// the new transport takes effect. Passing null tears it down (tests / shutdown).
export function setDualWriteTransport (transport, batcherOpts) {
  _transport = transport || null
  if (_batcher) { _batcher.stop().catch(() => {}) }
  _batcher = null
  _batcherOpts = batcherOpts || undefined
}

function getBatcher () {
  if (!_transport) return null
  if (!_batcher) _batcher = createBatcher({ transport: _transport, ..._batcherOpts })
  return _batcher
}

// Additive, flag-gated, NEVER-throwing dual-write. Returns:
//   false — flag off, OR no transport wired yet (Phase 2c), OR normalize rejected
//           the event (e.g. missing site_id). In every false case nothing is
//           emitted and the producer's live path is wholly unaffected.
//   true  — event normalized (event_id derived) and enqueued to the injected
//           transport (fire-and-forget; the producer never awaits it).
export function dualWriteEvent (raw) {
  tempDebug('dw', `entry event=${capLabel(raw && raw.event)}`) // TEMP-DEBUG (revert)
  if (!isDualWriteEnabled()) { tempDebug('dw', 'isDualWriteEnabled=FALSE -> drop'); return false } // TEMP-DEBUG (revert)
  tempDebug('dw', 'isDualWriteEnabled=true') // TEMP-DEBUG (revert)
  const batcher = getBatcher()
  if (!batcher) { tempDebug('dw', 'getBatcher=NULL (no transport wired) -> drop'); return false } // TEMP-DEBUG (revert)
  tempDebug('dw', 'getBatcher=ok') // TEMP-DEBUG (revert)
  try {
    const normalized = normalizeEvent(raw) // pure: derives event_id, drops PII/site_key, never mutates `raw`
    tempDebug('dw', `normalize=ok event_id=${capLabel(normalized && normalized.event_id)} site_id_present=${!!(normalized && normalized.site_id)}`) // TEMP-DEBUG (revert)
    tempDebug('dw', 'enqueue: calling batcher.enqueue') // TEMP-DEBUG (revert)
    Promise.resolve(batcher.enqueue(normalized)).catch(() => {}) // never surface to producer
    tempDebug('dw', 'enqueue: returned (sync) -> returning true') // TEMP-DEBUG (revert)
    return true
  } catch (err) {
    tempDebug('dw', `normalize/enqueue THREW: ${err && err.message}`) // TEMP-DEBUG (revert)
    // A malformed event must NEVER break the live capture path — still return false.
    // But log it (SAMPLED, never the body): err.message + the wrapper event name
    // only. raw.event is the non-PII canonical type ('$conversion', '$pageview').
    const msg = (err && err.message) ? err.message : String(err)
    _dropLog(`[tinybird] dual-write normalize/enqueue failed (event dropped): ${msg} | event=${capLabel(raw && raw.event)}`)
    return false
  }
}

// Test-only accessor for deterministic flush/assertions.
export function __getDualWriteBatcher () { return _batcher }
