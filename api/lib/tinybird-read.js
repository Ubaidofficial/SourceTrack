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
// PER-PIPE ALLOWLIST (TINYBIRD_READ_PIPES, optional — for incremental cutover):
// a narrowing filter layered on top of the master flag; master-OFF semantics are
// unchanged. When TINYBIRD_READ_ENABLED is on: if TINYBIRD_READ_PIPES is unset or
// empty/whitespace, ALL pipes serve (backward-compatible with today's behavior);
// if it is set (comma-separated), ONLY the listed pipes serve and every other
// pipeName returns null (→ HogQL fallback), so groups can be cut over one at a
// time. Entries are .pipe file names without extension (e.g. 'events_latest'),
// matched case-sensitively, tolerant of surrounding whitespace and empty entries.
//
// WIRE-FORMAT NOTE (VERIFIED against the live deployed pipe, 2026-07-03):
// Tinybird's public Pipes API convention is `GET {host}/v0/pipes/{name}.json`
// with query params matching the pipe's declared template params. An
// `{{ Array(...) }}` param takes a SINGLE comma-joined value
// (`?visitor_ids=a,b,c`). Repeated same-name keys (`?visitor_ids=a&visitor_ids=b`)
// are NOT an alternative: the pipe silently uses only the FIRST value — no
// error, just partial (single-visitor) results. Confirmed empirically against
// the deployed pageviews_by_visitors pipe and Tinybird Forward docs; this
// client originally shipped the repeated-key format (self-flagged unverified)
// and returned first-visitor-only data whenever a batch had >1 visitor.
// Same convention as tinybird/tools/phase4_touchpoint_diff.js's
// fetchTinybirdRows (comma-join, with the same empirical citation).
// ASSUMPTION: element values contain no literal comma — inherent to Tinybird's
// comma convention. distinct_ids here are UUIDs/generated ids (comma-free);
// a warning below fires if that ever changes.

const DEFAULT_TIMEOUT_MS = 15_000

// Normalize a Tinybird/ClickHouse timestamp to ISO-8601 UTC before it flows into
// any `new Date()` / `.split('T')` consumer. ClickHouse returns 'YYYY-MM-DD HH:MM:SS[.sss]'
// (space, no 'T', no 'Z'); PostHog/HogQL returns ISO '…T…Z'. Feeding the space form to
// `new Date()` parses as LOCAL time (duration/timezone skew), and `.split('T')[0]` returns
// the whole string (daily-bucket break). ClickHouse stores UTC, so a value with no timezone
// designator is assumed UTC (append 'Z'). Idempotent on already-ISO-UTC input, so it is
// safe to apply to the HogQL leg too. Null/undefined/''/non-string pass through unchanged
// (never throws — downstream guards handle absence).
//
// DATE-TIME-SHAPE GUARD: only values shaped like a date WITH a time component
// ('YYYY-MM-DD' + [space|T] + 'HH:MM'…) are transformed. A date-only string
// ('2026-07-01'), a label ('active'), an id, etc. pass through UNCHANGED — so the
// central row-walk (normalizePipeRowTimestamps) can never mangle a non-datetime value
// that happens to sit under a timestamp-named key (e.g. append a bogus 'Z').
export function normalizePipeTimestamp(ts) {
  if (typeof ts !== 'string' || ts === '') return ts
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(ts)) return ts // not a date-time -> passthrough
  // ClickHouse space form -> ISO 'T' separator (only when there is no 'T' already).
  const s = (ts.includes(' ') && !ts.includes('T')) ? ts.replace(' ', 'T') : ts
  // Already carries a timezone (trailing 'Z' or a ±HH:MM offset in the time portion)? Leave it.
  const tIdx = s.indexOf('T')
  const timePart = tIdx >= 0 ? s.slice(tIdx + 1) : s
  const hasTz = /[zZ]$/.test(timePart) || /[+-]\d{2}:?\d{2}$/.test(timePart)
  return hasTz ? s : s + 'Z'
}

// Recognized per-row TIMESTAMP column names emitted by wired pipes. Seeded from the
// audit + harness tsKeys and the pipe-alias scan (see the allowlist-completeness test in
// api/tests/tinybird-central-ts-normalize.test.js, which FAILS if a wired pipe emits a
// timestamp-shaped column under a name not listed here). The central row-walk normalizes
// ONLY these keys, so a novel timestamp column is a LOUD test failure — never a silent miss.
export const PIPE_TIMESTAMP_KEYS = new Set([
  'timestamp', 'server_timestamp', 'first_touch_timestamp', 'conversion_timestamp',
  'occurred_at', 'started_at',
  'last_ts', 'min_ts', 'max_ts',
  'first_seen', 'last_seen', 'last_paid_click_seen',
  'earliest', 'latest'
])

// CENTRAL timestamp normalization at the pipe-read boundary (kills the W1 format-trap
// class — docs/TIMESTAMP_TRAP_AUDIT.md). Walks pipe result rows (array of flat named
// objects; defends nested objects / arrays-of-rows too) and normalizes every recognized-
// timestamp-key string value to ISO-UTC IN PLACE, so no route/lib consumer ever sees a
// raw ClickHouse 'YYYY-MM-DD HH:MM:SS' timestamp again. Idempotent; the date-time-shape
// guard above means non-datetime values under a listed key are left untouched.
export function normalizePipeRowTimestamps(node) {
  if (Array.isArray(node)) {
    for (const item of node) normalizePipeRowTimestamps(item)
    return node
  }
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k]
      if (typeof v === 'string' && PIPE_TIMESTAMP_KEYS.has(k)) node[k] = normalizePipeTimestamp(v)
      else if (v && typeof v === 'object') normalizePipeRowTimestamps(v)
    }
  }
  return node
}

export function isTinybirdReadEnabled() {
  return String(process.env.TINYBIRD_READ_ENABLED || '').toLowerCase() === 'true'
}

export function isPipeReadAllowed(pipeName) {
  if (!isTinybirdReadEnabled()) return false
  const raw = process.env.TINYBIRD_READ_PIPES
  if (raw === undefined || raw.trim() === '') return true // no allowlist → master flag governs all (backward compat)
  const allow = raw.split(',').map(s => s.trim()).filter(Boolean)
  return allow.includes(pipeName)
}

/**
 * Query a deployed Tinybird pipe. Returns null on ANY failure (flag off,
 * missing config, network error, non-2xx response) — never throws.
 * Callers MUST fall back to the existing HogQL path on a null return.
 *
 * @param {string} pipeName - the pipe's file name without extension, e.g. 'pageviews_by_visitors'
 * @param {object} params - template params; array values are sent as ONE comma-joined value (see wire-format note)
 * @returns {Promise<Array<object>|null>} rows as named objects (Tinybird's own shape), or null
 */
export async function queryTinybirdPipe(pipeName, params = {}) {
  if (!isPipeReadAllowed(pipeName)) return null

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
      // ONE comma-joined value per the wire-format note above — repeated keys
      // silently truncate to the first element on Tinybird Array() params.
      if (value.some(item => String(item).includes(','))) {
        console.warn(`[tinybird-read] array param '${key}' contains a literal comma — Tinybird's comma-joined Array format cannot carry it; the pipe will mis-split this value.`)
      }
      url.searchParams.set(key, value.map(String).join(','))
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
    // CENTRAL timestamp normalization at the read boundary — no consumer sees a raw
    // ClickHouse 'YYYY-MM-DD HH:MM:SS' timestamp (see normalizePipeRowTimestamps).
    const rows = Array.isArray(body.data) ? normalizePipeRowTimestamps(body.data) : null
    // POSITIVE dispatch signal (W4 decommission prereq): a NON-NULL array is the genuine
    // pipe-served branch; a null result takes the HogQL fallback and MUST stay silent here.
    // Emitted via console.LOG (not console.debug): per the runtime finding, console.debug lines did
    // not surface in the prod log pipeline while console.log (request_completed) did — so an absent
    // served-log was wrongly read as "pipe never called". NOT logInfo either: its PII-sanitizer's
    // Stripe `st_`-prefix regex false-positives on first_touch/last_touch pipe names, mangling them
    // to [REDACTED_KEY]. Pipe name + ROW COUNT only — never row content/values (no PII).
    if (rows) console.log(`[tinybird-read] served pipe '${pipeName}' rows=${Array.isArray(rows) ? rows.length : 0}`)
    return rows
  } catch (err) {
    const msg = err?.name === 'AbortError' ? 'timed out' : (err?.message || String(err))
    console.warn(`[tinybird-read] pipe '${pipeName}' threw (${msg}) — falling back to HogQL.`)
    return null
  } finally {
    clearTimeout(timeout)
  }
}
