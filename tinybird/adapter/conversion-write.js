// SourceTrack — DIRECT, AWAITED, RETRIED $conversion write to Tinybird /v0/events.
//
// THE MONEY PATH. Unlike dualWriteEvent (the fire-and-forget batcher, whose
// enqueue() resolves on ENQUEUE, not on the Tinybird ack — batch.js:90/94), this
// writer AWAITS a single-event POST wrapped in withRetry and THROWS on failure, so
// the caller rolls back the idempotency claim and returns 500 → Stripe redelivers
// (the free recovery path). Pageviews keep the batcher — this is $conversion-only.
//
// NO token/host literal (env only, §0). Flag-gated by TINYBIRD_DUAL_WRITE:
//   OFF → no-op skip (dev/test/pre-cutover; matches today's flag-off no-network).
//   ON  → must durably persist; missing config OR transport failure after retries
//         THROWS. On the money path a misconfig fails LOUD (500 + rollback), never a
//         silent drop — the opposite policy from the pageview batcher's fail-safe.

import { normalizeEvent } from './normalize.js'
import { createRetryingTinybirdTransport } from './transport.js'
import { isDualWriteEnabled } from './dual-write.js'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

const gzipAsync = promisify(gzip)

// Build the retrying Events API transport from env (prod path). Returns null when
// host/token are absent, so writeConversionDirect can throw a loud misconfig error.
function envTransportFactory () {
  const host = process.env.TINYBIRD_HOST
  const token = process.env.TINYBIRD_APPEND_TOKEN
  const datasource = process.env.TINYBIRD_DATASOURCE || 'events'
  if (!host || !token) return null
  return createRetryingTinybirdTransport({ host, token, datasource })
}

// Test seam: inject a transport factory (a stub, or a REAL retrying transport over a
// mock fetch — so withRetry is exercised end-to-end). Production uses the env factory.
// NEVER carries a token literal in committed code.
let _transportFactory = envTransportFactory
export function __setConversionWriteTransportFactory (fn) { _transportFactory = fn || envTransportFactory }
export function __resetConversionWriteTransportFactory () { _transportFactory = envTransportFactory }

/**
 * Durably write ONE $conversion event to Tinybird, awaited.
 *
 * @param {object} raw - a ph.capture-shaped event { distinctId, event, properties }
 * @returns {Promise<{written:true, eventId:string} | {skipped:true, reason:string}>}
 * @throws when TINYBIRD_DUAL_WRITE is ON and the write cannot be durably completed
 *         (missing config, or transport failure after withRetry surrenders).
 */
export async function writeConversionDirect (raw) {
  if (!isDualWriteEnabled()) return { skipped: true, reason: 'dual_write_off' }
  const transport = _transportFactory()
  if (!transport) {
    throw new Error('writeConversionDirect: TINYBIRD_HOST/TINYBIRD_APPEND_TOKEN not configured — refusing to silently drop a $conversion')
  }
  const normalized = normalizeEvent(raw) // deterministic event_id; drops PII/site_key; throws on missing site_id
  const payload = await gzipAsync(JSON.stringify(normalized) + '\n')
  await transport(payload, { count: 1, gzip: true }) // AWAITED; withRetry inside; throws on surrender after retries
  return { written: true, eventId: normalized.event_id }
}
