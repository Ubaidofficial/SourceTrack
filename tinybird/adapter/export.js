// SourceTrack — GDPR SUBJECT ACCESS (Art. 15), Tinybird leg.
//
// The read-only counterpart to erase.js. Where erase.js DELETES one subject's
// event data (admin token), this READS it back for a Data Subject Access Request
// — and it may ONLY ever read:
//   - It takes a READ token (TINYBIRD_READ_TOKEN), never the admin token, so an
//     access path can never hold delete capability.
//   - It reuses buildDeleteCondition from erase.js VERBATIM (re-exported below),
//     so the rows a subject can SEE are exactly the rows the eraser would DELETE.
//     A second, hand-written predicate here could silently drift from the
//     eraser's `distinct_id OR visitor_id` scope — this must not happen.
//
// Bounded by design: a high-traffic visitor can have thousands of events, so each
// datasource is capped (SUBJECT_EVENT_CAP) and the result reports { matched,
// returned, capped } so a truncated bundle is never mistaken for a complete one.
//
// Never swallows: a failed count/rows query is captured per-datasource (error set,
// rows null) and reflected in status='failed' — never a silent empty result. An
// EMPTY subject (status='ok', matched 0) and a FAILED query (status='failed') are
// structurally distinct so the caller can fail loudly.

import { buildDeleteCondition, TINYBIRD_ERASURE_DATASOURCES } from './erase.js'

// Re-export the eraser's predicate so callers/tests bind to the SAME function
// (identity), never a copy that can drift.
export { buildDeleteCondition } from './erase.js'

const DEFAULT_TIMEOUT_MS = 20_000

// Per-datasource row cap for one subject's export. Reported as `capped` when the
// true matched count exceeds it, so truncation is explicit, never silent.
export const SUBJECT_EVENT_CAP = 1000

// Explicit column allowlist — never SELECT *. The raw `properties` JSON bag is
// deliberately EXCLUDED (it duplicates these typed columns and can carry arbitrary
// nested data); the bundle notes this so the omission is stated, not silent.
export const SUBJECT_EVENT_COLUMNS = [
  'event_type', 'event_id', 'distinct_id', 'visitor_id', 'timestamp',
  'conversion_value', 'currency', 'conversion_type', 'ingestion_method', 'provider',
  'attribution_status', 'first_touch_source', 'first_touch_medium', 'first_touch_campaign',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'ai_source', 'page_url', 'referrer', 'country', 'device_type', 'browser_name'
]

async function runSql ({ host, token, sql, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch
  const url = `${String(host).replace(/\/$/, '')}/v0/sql?q=${encodeURIComponent(sql)}`
  const res = await doFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`read query responded ${res.status}`)
  const body = await res.json()
  return body?.data ?? []
}

/**
 * Read one subject's event data from BOTH Tinybird datasources for a DSAR.
 *
 * @returns {Promise<object>} never throws:
 *   { status, store:'tinybird', cap, condition?, note?, reason?, perDatasource: [
 *       { datasource, matched, returned, capped, rows, error } ] }
 *   status ∈ 'skipped_not_configured' | 'failed' | 'ok'
 *   - 'ok'     : every datasource read succeeded (matched may be 0 → empty subject)
 *   - 'failed' : at least one read errored (that entry has error set, rows null)
 *   - 'skipped_not_configured' : no host/read token — the store is unavailable and
 *      is reported EXPLICITLY, never as an empty (matched-0) result.
 */
export async function fetchSubjectEventsFromTinybird ({
  host, readToken, siteId, subjectId, cap = SUBJECT_EVENT_CAP, fetchImpl,
  datasources = TINYBIRD_ERASURE_DATASOURCES
} = {}) {
  const store = 'tinybird'

  if (!host || !readToken) {
    return {
      status: 'skipped_not_configured',
      store,
      cap,
      reason: !host ? 'TINYBIRD_HOST not set — event data NOT read' : 'TINYBIRD_READ_TOKEN not set — event data NOT read',
      perDatasource: []
    }
  }

  let condition
  try {
    condition = buildDeleteCondition(siteId, subjectId)
  } catch (err) {
    return { status: 'failed', store, cap, reason: err.message, perDatasource: [] }
  }

  const cols = SUBJECT_EVENT_COLUMNS.join(', ')
  let anyError = false
  const perDatasource = []
  for (const ds of datasources) {
    try {
      const countRows = await runSql({ host, token: readToken, datasource: ds, sql: `SELECT count() AS n FROM ${ds} WHERE ${condition} FORMAT JSON`, fetchImpl })
      const matched = Number(countRows?.[0]?.n) || 0
      const rows = await runSql({ host, token: readToken, datasource: ds, sql: `SELECT ${cols} FROM ${ds} WHERE ${condition} ORDER BY timestamp ASC LIMIT ${cap} FORMAT JSON`, fetchImpl })
      perDatasource.push({ datasource: ds, matched, returned: rows.length, capped: matched > cap, rows, error: null })
    } catch (err) {
      anyError = true
      perDatasource.push({ datasource: ds, matched: null, returned: null, capped: null, rows: null, error: err.message })
    }
  }

  return {
    status: anyError ? 'failed' : 'ok',
    store,
    cap,
    condition,
    note: 'Typed columns only; raw properties JSON bag excluded.',
    perDatasource
  }
}
