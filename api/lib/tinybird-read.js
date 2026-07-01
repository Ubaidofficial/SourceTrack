// SourceTrack — Tinybird read-side client (Phase 6, first read cutover).
//
// NO existing read pattern to mirror: every prior Tinybird batch (Phase 4/5)
// only authored .pipe files — none were ever wired into a live app read path.
// The only existing Tinybird wiring in this codebase is the WRITE side
// (tinybird/adapter/boot.js, gated by TINYBIRD_DUAL_WRITE). This module
// mirrors that flag-gated, fail-safe-to-off SHAPE for reads, since there is
// no read-specific precedent to copy instead.
//
// OFF by default (TINYBIRD_READ_ENABLED unset) — every call returns null
// immediately, and null MUST be treated by the caller as "fall back to the
// existing HogQL path," exactly like TINYBIRD_DUAL_WRITE's flag-off no-op.
// Never throws to the caller — a misconfigured or failing Tinybird read must
// never break a feature that already works via HogQL.
//
// WIRE-FORMAT NOTE (flagged, unverified — cannot deploy/test from here):
// Tinybird's public Pipes API convention is `GET {host}/v0/pipes/{name}.json`
// with query params matching the pipe's declared template params, and
// `{{ Array(...) }}` params passed as repeated same-name query keys
// (`?visitor_ids=a&visitor_ids=b`). That is what this client implements.
// This has NOT been verified against a live deployed pipe (none of this
// phase's pipes are pushed yet) — confirm against Tinybird's docs or a
// deployed test call before relying on it in production.

const DEFAULT_TIMEOUT_MS = 15_000

export function isTinybirdReadEnabled() {
  return String(process.env.TINYBIRD_READ_ENABLED || '').toLowerCase() === 'true'
}

/**
 * Query a deployed Tinybird pipe. Returns null on ANY failure (flag off,
 * missing config, network error, non-2xx response) — never throws.
 * Callers MUST fall back to the existing HogQL path on a null return.
 *
 * @param {string} pipeName - the pipe's file name without extension, e.g. 'pageviews_by_visitors'
 * @param {object} params - template params; array values are sent as repeated query keys
 * @returns {Promise<Array<object>|null>} rows as named objects (Tinybird's own shape), or null
 */
export async function queryTinybirdPipe(pipeName, params = {}) {
  if (!isTinybirdReadEnabled()) return null

  const host = process.env.TINYBIRD_HOST
  const token = process.env.TINYBIRD_READ_TOKEN
  if (!host || !token) {
    console.warn('[tinybird-read] TINYBIRD_READ_ENABLED is on but TINYBIRD_HOST/TINYBIRD_READ_TOKEN are not set — falling back to HogQL.')
    return null
  }

  const url = new URL(`${host.replace(/\/$/, '')}/v0/pipes/${pipeName}.json`)
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item))
    } else {
      url.searchParams.set(key, String(value))
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    })

    if (!res.ok) {
      const raw = await res.text()
      console.warn(`[tinybird-read] pipe '${pipeName}' failed (${res.status}) — falling back to HogQL: ${raw.slice(0, 200)}`)
      return null
    }

    const body = await res.json()
    return Array.isArray(body.data) ? body.data : null
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'timed out' : (err?.message || String(err))
    console.warn(`[tinybird-read] pipe '${pipeName}' threw (${msg}) — falling back to HogQL.`)
    return null
  } finally {
    clearTimeout(timeout)
  }
}
