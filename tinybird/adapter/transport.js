// SourceTrack — Tinybird Events API transport + 429/5xx-aware retry (Phase 2d).
//
// The REAL injected transport for the dual-write batcher. It is constructed at the
// (future) wire-point from env (host/token/datasource) and injected via
// setDualWriteTransport — it is NEVER constructed in committed code and NEVER carries
// a token literal (no secret in the repo, §0). The flag stays OFF; tests inject a
// MOCK fetch + MOCK sleep, so there is no real network, no token, no POST.
//
// Gate-3 (LOCKED): dual-write emits WITHOUT an idempotency claim (append-only,
// dedup-on-read). This module is transport only — no claim here.
//
// Events API (cited): POST {host}/v0/events?name={datasource}, NDJSON body,
// `Content-Encoding: gzip`, `Authorization: Bearer <DATASOURCE:APPEND token>`; 429 →
// retriable with backoff honoring Retry-After / X-RateLimit-Reset; rows-per-request
// don't count (batching is the lever); not idempotent (our event_id is the guard).

import { tempDebug } from './temp-debug.js' // TEMP-DEBUG (revert)

export class TinybirdTransportError extends Error {
  constructor (message, { status, retryable, retryAfterMs } = {}) {
    super(message)
    this.name = 'TinybirdTransportError'
    this.status = status                 // HTTP status (undefined for network/timeout)
    this.retryable = !!retryable         // 429 / 5xx / network → true; other 4xx → false
    this.retryAfterMs = retryAfterMs     // from Retry-After / X-RateLimit-Reset, else undefined
  }
}

// Parse retry timing from the ACTUAL response headers (no guessed per-plan rate).
// Retry-After: delta-seconds or HTTP-date. X-RateLimit-Reset: epoch-seconds (large)
// or seconds-from-now (small). Best-effort per docs. `now` injectable for tests.
export function parseRetryAfterMs (headers, now = Date.now()) {
  const get = (k) => (headers && typeof headers.get === 'function')
    ? headers.get(k)
    : (headers ? (headers[k] ?? headers[k.toLowerCase()]) : undefined)

  const ra = get('Retry-After')
  if (ra != null && ra !== '') {
    const secs = Number(ra)
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
    const dateMs = Date.parse(ra)
    if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - now)
  }
  const reset = get('X-RateLimit-Reset')
  if (reset != null && reset !== '') {
    const n = Number(reset)
    if (Number.isFinite(n)) {
      const ms = n > 1e9 ? (n * 1000 - now) : (n * 1000) // epoch vs seconds-from-now
      return Math.max(0, ms)
    }
  }
  return undefined
}

// POST the gzipped NDJSON payload to the Events API. Returns on 2xx; throws a typed
// TinybirdTransportError on non-2xx (retryable for 429/5xx, permanent for other 4xx)
// and on network/timeout (retryable). host/token/datasource are REQUIRED args injected
// from env. fetch + timeoutMs injectable so tests use a mock (no real network).
export function createTinybirdTransport ({ host, token, datasource, fetch: fetchImpl, timeoutMs } = {}) {
  if (!host || !token || !datasource) {
    throw new TypeError('createTinybirdTransport: host, token, datasource are required (inject from env)')
  }
  const doFetch = fetchImpl || globalThis.fetch
  if (typeof doFetch !== 'function') throw new TypeError('createTinybirdTransport: no fetch implementation available')
  const url = `${String(host).replace(/\/$/, '')}/v0/events?name=${encodeURIComponent(datasource)}`
  // Explicit arg wins; else TINYBIRD_TIMEOUT_MS (so a debug deploy can fail fast,
  // e.g. 3000); else 10000. Abort surfaces a hung connect as a visible error.
  const effectiveTimeoutMs = (typeof timeoutMs === 'number')
    ? timeoutMs
    : (parseInt(process.env.TINYBIRD_TIMEOUT_MS, 10) || 10000)

  return async function transport (payload /*, meta */) {
    const ctrl = (typeof AbortController === 'function') ? new AbortController() : null
    const timer = ctrl ? setTimeout(() => ctrl.abort(), effectiveTimeoutMs) : null
    let res
    try {
      tempDebug('transport', `before fetch url=${url} timeoutMs=${effectiveTimeoutMs}`) // TEMP-DEBUG (revert) — host+ds only, NO token
      res = await doFetch(url, {
        method: 'POST',
        headers: {
          'Content-Encoding': 'gzip',
          Authorization: `Bearer ${token}`
        },
        body: payload,
        signal: ctrl ? ctrl.signal : undefined
      })
      tempDebug('transport', `fetch returned status=${res.status}`) // TEMP-DEBUG (revert)
    } catch (err) {
      // network error or timeout (AbortError) — retryable, no header timing.
      tempDebug('transport', `fetch THREW: ${err && err.message ? err.message : err}`) // TEMP-DEBUG (revert) — message only, never token/body
      throw new TinybirdTransportError(`Tinybird transport network error: ${err && err.message ? err.message : err}`, { retryable: true })
    } finally {
      if (timer) clearTimeout(timer)
    }

    if (res.status >= 200 && res.status < 300) return
    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600)
    const retryAfterMs = res.status === 429 ? parseRetryAfterMs(res.headers) : undefined
    throw new TinybirdTransportError(`Tinybird Events API responded ${res.status}`, { status: res.status, retryable, retryAfterMs })
  }
}

// Wrap a transport with BOUNDED, header-driven retry. On a retryable error: wait
// retryAfterMs (from Retry-After / X-RateLimit-Reset) when present, else exponential
// backoff + jitter; cap at maxRetries, then SURRENDER (re-throw → the batcher's
// onError fires, chain-recovery keeps later batches alive). Non-retryable (4xx
// non-429) → throw immediately (no retry). sleep + random injectable for deterministic
// tests (no real waiting).
export function withRetry (transport, {
  maxRetries = 4, baseDelayMs = 200, maxDelayMs = 30000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  random = Math.random
} = {}) {
  if (typeof transport !== 'function') throw new TypeError('withRetry: transport must be a function')
  return async function retryingTransport (payload, meta) {
    let attempt = 0
    for (;;) {
      try {
        return await transport(payload, meta)
      } catch (err) {
        if (!(err && err.retryable === true) || attempt >= maxRetries) throw err // permanent OR cap → surrender
        const headerMs = err.retryAfterMs
        const backoff = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt))
        const waitMs = (typeof headerMs === 'number' && headerMs >= 0)
          // Honor the server's Retry-After / X-RateLimit-Reset, but CAP at maxDelayMs:
          // a malformed/hostile header (or a misparsed X-RateLimit-Reset epoch) cannot
          // stall a batch beyond maxDelayMs. Bounded in BOTH count and duration.
          ? Math.min(maxDelayMs, headerMs)
          : backoff + Math.floor(random() * backoff) // full jitter on top of backoff
        attempt++
        await sleep(waitMs)
      }
    }
  }
}

// Convenience wire-point factory: the retrying Events API transport, ready to inject
// via setDualWriteTransport(createRetryingTinybirdTransport({ host, token, datasource }))
// at cutover. Called ONLY from env-driven wire code (never committed with a token).
export function createRetryingTinybirdTransport ({ host, token, datasource, fetch: fetchImpl, timeoutMs, retry } = {}) {
  return withRetry(createTinybirdTransport({ host, token, datasource, fetch: fetchImpl, timeoutMs }), retry)
}
