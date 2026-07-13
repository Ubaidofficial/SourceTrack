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
import { esc } from '../../api/lib/utils.js'
import { gzip } from 'node:zlib'
import { promisify } from 'node:util'

const gzipAsync = promisify(gzip)
const READ_CHECK_TIMEOUT_MS = 5000

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

// Idempotency read-check (READ token, NEVER the append/admin token). Returns the count
// of rows already in `events` for this (site_id, event_id). Throws on ANY read failure
// (missing config, non-2xx, network/timeout) — the caller MUST fail-open on a throw
// (POST anyway), never treat a failed read as "absent". site_id/event_id are esc()'d
// (event_id can be a merchant order_id) so a value can only ever be a string literal.
async function envReadEventCount (siteId, eventId, { fetchImpl } = {}) {
  const host = process.env.TINYBIRD_HOST
  const readToken = process.env.TINYBIRD_READ_TOKEN
  if (!host || !readToken) {
    throw new Error('conversion dedup read-check: TINYBIRD_HOST/TINYBIRD_READ_TOKEN not configured')
  }
  const doFetch = fetchImpl || globalThis.fetch
  const sql = `SELECT count() AS n FROM events WHERE site_id = '${esc(siteId)}' AND event_id = '${esc(eventId)}' FORMAT JSON`
  const url = `${String(host).replace(/\/$/, '')}/v0/sql?q=${encodeURIComponent(sql)}`
  const res = await doFetch(url, {
    headers: { Authorization: `Bearer ${readToken}` },
    signal: AbortSignal.timeout(READ_CHECK_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`conversion dedup read-check responded ${res.status}`)
  const body = await res.json()
  return Number(body?.data?.[0]?.n) || 0
}

// Test seam for the dedup read-check (tests inject present/absent/error). Production
// uses the env READ-token query above.
let _readEventCount = envReadEventCount
export function __setConversionReadCheck (fn) { _readEventCount = fn || envReadEventCount }
export function __resetConversionReadCheck () { _readEventCount = envReadEventCount }

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

  // IDEMPOTENCY read-check (READ token): if this event_id already exists for the site,
  // an earlier POST already committed — either a lost-ack retry inside withRetry, or a
  // Stripe redelivery after #204's rollback. SKIP the POST (return success, claim HOLDS)
  // so we don't append a duplicate row: `events` is append-only with NO dedup, and the
  // Stripe event_id is deterministic, so a re-POST would be a permanent revenue
  // double-count. FAIL-OPEN: if the read-check itself throws we do NOT skip and do NOT
  // assume absent — a possible double-count is better than a definite silent loss.
  // KNOWN LIMIT: this is check-then-act; two TRULY concurrent redeliveries could both
  // read 0 and both write. Stripe spaces redeliveries, so this is negligible, not zero.
  try {
    const existing = await _readEventCount(normalized.site_id, normalized.event_id)
    if (existing > 0) return { skipped: true, reason: 'already_present', eventId: normalized.event_id }
  } catch (readErr) {
    console.warn(`[tinybird] conversion dedup read-check failed (${readErr && readErr.message ? readErr.message : readErr}) — proceeding with the write (fail-open)`)
  }

  const payload = await gzipAsync(JSON.stringify(normalized) + '\n')
  await transport(payload, { count: 1, gzip: true }) // AWAITED; withRetry inside; throws on surrender after retries
  return { written: true, eventId: normalized.event_id }
}
