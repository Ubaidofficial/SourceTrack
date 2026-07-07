// SourceTrack — Tinybird dual-write boot wiring (Phase 2d).
//
// Wires the REAL Events API transport at app startup, FROM ENV — matching the
// codebase's env-driven service-init pattern (api/lib/posthog.js reads
// process.env.POSTHOG_* at load; api/lib/supabase.js reads process.env.SUPABASE_*).
//
// Wires ONLY when TINYBIRD_DUAL_WRITE is truthy AND TINYBIRD_HOST + TINYBIRD_APPEND_TOKEN
// are present. Otherwise it is a NO-OP — the transport stays null, so dualWriteEvent
// is a no-op exactly as today (flag default OFF unchanged).
//
// Failure isolation extends to boot: a missing/misconfigured Tinybird env NEVER crashes
// the app and never breaks ph.capture — it logs a warning (NEVER the token) and stays
// unwired. NO token literal, NO host literal, NO default token — env only.
//
// Idempotent: a second call is a no-op (never double-registers a transport/batcher).

import { setDualWriteTransport, isDualWriteEnabled } from './dual-write.js'
import { createTinybirdTransport } from './transport.js'
import { createSampledLogger, capLabel } from './log-sampler.js'

let _wired = false

/**
 * @param {object} [opts]
 * @param {Function} [opts.fetch] - injected fetch for the transport (tests use a mock;
 *                                  production uses the global fetch). NEVER a token/host.
 * @returns {boolean} true if a transport was wired this call, false otherwise (no-op).
 */
export function initTinybirdDualWrite ({ fetch } = {}) {
  // TEMP DIAGNOSTIC ([tinybird-diag], remove after root-cause): console.log/warn
  // are NOT surfacing in this service's Railway log capture, so emit via
  // process.stdout.write to make the wiring decision visible. NEVER prints the token.
  const _rawFlag = process.env.TINYBIRD_DUAL_WRITE
  process.stdout.write(`[tinybird-diag] initTinybirdDualWrite CALLED | TINYBIRD_DUAL_WRITE=${JSON.stringify(_rawFlag)} type=${typeof _rawFlag} | isDualWriteEnabled=${isDualWriteEnabled()} | hasHost=${!!process.env.TINYBIRD_HOST} hasAppendToken=${!!process.env.TINYBIRD_APPEND_TOKEN} host=${process.env.TINYBIRD_HOST || ''}\n`)

  if (_wired) {                            // idempotent — never double-register
    process.stdout.write('[tinybird-diag] outcome=already-wired (idempotent no-op)\n')
    return false
  }
  if (!isDualWriteEnabled()) {             // flag OFF (default) → no-op, nothing constructed
    process.stdout.write('[tinybird-diag] outcome=early-return-flag-off\n')
    return false
  }

  const host = process.env.TINYBIRD_HOST
  const token = process.env.TINYBIRD_APPEND_TOKEN
  const datasource = process.env.TINYBIRD_DATASOURCE || 'events'

  if (!host || !token) {
    // Flag ON but misconfigured — fail-safe: warn (NO token value) and stay unwired.
    process.stdout.write('[tinybird-diag] outcome=early-return-missing-host-token\n')
    console.warn('[tinybird] TINYBIRD_DUAL_WRITE is on but TINYBIRD_HOST/TINYBIRD_APPEND_TOKEN are not set — dual-write stays OFF (no-op). Set both to enable.')
    return false
  }

  try {
    // §11 Layer A: surface quarantined rows inside 2xx responses (previously
    // 100% silent). SAMPLED warn, count only — never the row bodies (PII).
    const logQuarantine = createSampledLogger()
    const onResult = (body) => {
      const q = Number(body && body.quarantined_rows) || 0
      if (q > 0) logQuarantine(`[tinybird] Events API quarantined ${q} row(s) in an accepted batch (successful_rows=${Number(body.successful_rows) || 0}) — check events_quarantine; a quarantined $conversion is silent revenue loss`)
    }
    const transport = createTinybirdTransport({ host, token, datasource, fetch, onResult })
    // Observability: a failing POST (deliver throws after retries) was previously
    // 100% silent — no onError was wired, so "zero POST attempts" was invisible.
    // Wire a SAMPLED, never-throwing onError that logs ONLY err.message + batch
    // count + event_type(s). NEVER the batch/event body (PII + would flood).
    // Safety of `err.message` depends on transport.js NEVER embedding the token or
    // request URL in a thrown error (it doesn't — token is header-only); keep it so.
    const logTransportError = createSampledLogger()
    const onError = (err, batch) => {
      const msg = (err && err.message) ? err.message : String(err)
      const count = Array.isArray(batch) ? batch.length : 0
      let types = ''
      try {
        if (Array.isArray(batch)) {
          types = [...new Set(batch.map((e) => e && e.event_type).filter(Boolean))].map((t) => capLabel(t)).join(',')
        }
      } catch (_) { /* never let log-building throw */ }
      logTransportError(`[tinybird] dual-write POST failed (events NOT delivered): ${msg} | batch=${count} types=${types}`)
    }
    setDualWriteTransport(transport, { onError })
    _wired = true
    // host + datasource are not secrets; the token is NEVER logged.
    process.stdout.write(`[tinybird-diag] outcome=wired -> ${host} name=${datasource}\n`)
    console.log(`[tinybird] dual-write transport wired -> ${host} name=${datasource}`)
    return true
  } catch (err) {
    // A wiring error must never break boot — stay unwired.
    process.stdout.write(`[tinybird-diag] outcome=threw msg=${err && err.message ? err.message : String(err)}\n`)
    console.warn('[tinybird] failed to wire dual-write transport — dual-write stays OFF:', err && err.message ? err.message : err)
    return false
  }
}

// Test-only: reset the idempotency latch so a test can re-init under fresh env.
export function __resetTinybirdBoot () { _wired = false }
