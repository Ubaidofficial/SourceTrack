// SourceTrack — conversion-quarantine alarm (SCOPE_v3 §11, Layer B).
//
// Tinybird auto-quarantines schema-invalid rows into `events_quarantine`
// (built-in; schema = c__error_column, c__error, c__import_id, <events cols>,
// insertion_date). A quarantined $conversion is SILENT REVENUE LOSS — the row
// never reaches the events datasource or any revenue aggregate, and (pre this
// module) nothing read the quarantine anywhere.
//
// This module is READ-ONLY: one SQL-API query over events_quarantine with the
// workspace READ token (verified 2026-07-03: the workspace-read token class
// reads events_quarantine; no admin scope needed). Consumed by
// api/jobs/health-agent.js as the 'tinybird_quarantine' check.
//
// No durable last_check: health-agent has no persistence layer and adding one
// is DDL (founder-gated, §8). Instead a LOOKBACK WINDOW (env
// QUARANTINE_LOOKBACK_HOURS, default 2 — the agent runs hourly per the
// runbook, so 2h covers a missed run). Consequence, intentional: rows keep
// alerting on every run inside the window — for conversion loss that is the
// desired behavior (alarm until someone drains/handles the quarantine).

const DEFAULT_TIMEOUT_MS = 15_000

export function buildQuarantineSql (lookbackHours) {
  const hours = Number.isFinite(Number(lookbackHours)) && Number(lookbackHours) > 0
    ? Math.floor(Number(lookbackHours))
    : 2
  // Numeric interpolation only (validated above) — no string interpolation.
  return `SELECT event_type, count() AS n, max(insertion_date) AS last_seen FROM events_quarantine WHERE insertion_date > now() - INTERVAL ${hours} HOUR GROUP BY event_type ORDER BY n DESC FORMAT JSON`
}

// Query the Tinybird SQL API for recent quarantine rows grouped by event_type.
// Returns [{ event_type, n, last_seen }]. Throws on any HTTP/network failure —
// the caller decides severity (health-agent maps it to a WARN, not CRITICAL:
// an unreachable Tinybird is not the same signal as a quarantined conversion).
export async function fetchQuarantineSummary ({ host, token, lookbackHours, fetchImpl } = {}) {
  if (!host || !token) throw new Error('fetchQuarantineSummary: host and token are required')
  const doFetch = fetchImpl || globalThis.fetch
  const url = `${String(host).replace(/\/$/, '')}/v0/sql?q=${encodeURIComponent(buildQuarantineSql(lookbackHours))}`
  const res = await doFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`Tinybird SQL API responded ${res.status}`)
  const body = await res.json()
  return Array.isArray(body.data) ? body.data : []
}

/**
 * Alert policy (SCOPE_v3 §11), pure + token-free-testable:
 *   any quarantined $conversion row  -> level 'critical'  (silent revenue loss)
 *   any other quarantined rows       -> level 'warn'
 *   nothing quarantined              -> level 'ok'
 */
export function classifyQuarantine (rows) {
  const list = Array.isArray(rows) ? rows : []
  const totalRows = list.reduce((s, r) => s + (Number(r?.n) || 0), 0)
  const conversionRows = list
    .filter((r) => r?.event_type === '$conversion')
    .reduce((s, r) => s + (Number(r?.n) || 0), 0)
  const types = list.map((r) => `${r?.event_type}=${Number(r?.n) || 0}`).join(', ')

  if (conversionRows > 0) {
    return {
      level: 'critical',
      conversionRows,
      totalRows,
      summary: `QUARANTINED CONVERSIONS: ${conversionRows} $conversion row(s) in events_quarantine (silent revenue loss) — total quarantined: ${totalRows} [${types}]`
    }
  }
  if (totalRows > 0) {
    return {
      level: 'warn',
      conversionRows: 0,
      totalRows,
      summary: `${totalRows} quarantined row(s) in events_quarantine (no conversions) [${types}]`
    }
  }
  return { level: 'ok', conversionRows: 0, totalRows: 0, summary: 'quarantine clean' }
}
