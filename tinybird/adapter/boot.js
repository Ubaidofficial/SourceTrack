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

let _wired = false

/**
 * @param {object} [opts]
 * @param {Function} [opts.fetch] - injected fetch for the transport (tests use a mock;
 *                                  production uses the global fetch). NEVER a token/host.
 * @returns {boolean} true if a transport was wired this call, false otherwise (no-op).
 */
export function initTinybirdDualWrite ({ fetch } = {}) {
  if (_wired) return false                 // idempotent — never double-register
  if (!isDualWriteEnabled()) return false  // flag OFF (default) → no-op, nothing constructed

  const host = process.env.TINYBIRD_HOST
  const token = process.env.TINYBIRD_APPEND_TOKEN
  const datasource = process.env.TINYBIRD_DATASOURCE || 'events'

  if (!host || !token) {
    // Flag ON but misconfigured — fail-safe: warn (NO token value) and stay unwired.
    console.warn('[tinybird] TINYBIRD_DUAL_WRITE is on but TINYBIRD_HOST/TINYBIRD_APPEND_TOKEN are not set — dual-write stays OFF (no-op). Set both to enable.')
    return false
  }

  try {
    const transport = createTinybirdTransport({ host, token, datasource, fetch })
    setDualWriteTransport(transport)
    _wired = true
    // host + datasource are not secrets; the token is NEVER logged.
    console.log(`[tinybird] dual-write transport wired -> ${host} name=${datasource}`)
    return true
  } catch (err) {
    // A wiring error must never break boot — stay unwired.
    console.warn('[tinybird] failed to wire dual-write transport — dual-write stays OFF:', err && err.message ? err.message : err)
    return false
  }
}

// Test-only: reset the idempotency latch so a test can re-init under fresh env.
export function __resetTinybirdBoot () { _wired = false }
