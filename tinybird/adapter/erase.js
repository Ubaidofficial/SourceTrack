// SourceTrack — GDPR erasure, Tinybird leg (SCOPE_v3 §10).
//
// Replaces the PostHog-Persons-REST erasure for Tinybird-resident event data.
// A delete on the `events` datasource does NOT propagate to the
// `events_by_visitor` projection — so a subject must be erased from BOTH
// (verified 2026-07-03: list_datasources returns exactly these two).
//
// IDENTITY: the erasure subject is the SAME key the existing gdpr.js /visitor
// flow uses — the `anonymous_id`, which that flow already treats as the
// PostHog distinct_id (deletePostHogPerson(anonymous_id, ...)). In Tinybird
// the normalizer resolves that value into BOTH `distinct_id` and `visitor_id`
// (normalize.js: visitor_id = visitor_id ?? anonymous_id ?? distinctId;
// distinct_id = distinct_id ?? anonymous_id ?? uuid). There is NO anonymous_id
// COLUMN in either datasource (verified against the committed schemas) — so the
// condition keys on distinct_id OR visitor_id only. Always scoped to site_id.
//
// DESTRUCTIVE + ADMIN-SCOPED: the Datasources delete API needs an ADMIN token
// (founder-held). This module NEVER hardcodes or fetches it — it is passed in.
// Unset → the delete is SKIPPED and reported skipped_no_admin_token (never a
// silent success). Default is DRY-RUN (count only); an explicit confirm===true
// is required to actually delete.
//
// This module is Supabase-free and token-free-testable: it returns a structured
// per-datasource result; the caller (gdpr.js) persists it to erasure_log.
//
// TWO scopes:
//   - eraseSubjectFromTinybird — one subject (GDPR /visitor).
//   - eraseSiteFromTinybird     — a WHOLE site (GDPR /account, when its sites are
//     being deleted). BROAD delete: `site_id = X` can match millions of rows.
// The Datasources delete API handles a broad condition the same way as a narrow
// one (it's just a WHERE): async job, returns rows_affected, suitable for up to
// a few million rows / ~1000 ops per week (Tinybird docs, 2026-07-06). CAVEAT:
// there is a limit of ACTIVE delete jobs per workspace (Free 1 / Developer 3 /
// Enterprise 6). This module fires deletes per-datasource sequentially but does
// NOT poll each job to completion, so under load a later delete can be rejected;
// that surfaces as a per-datasource error → status='failed' (retryable via
// erasure_log), never a silent drop.

import { esc } from '../../api/lib/utils.js'

export const TINYBIRD_ERASURE_DATASOURCES = ['events', 'events_by_visitor']

const DEFAULT_TIMEOUT_MS = 20_000

/**
 * Build the ClickHouse delete_condition for one subject on one site.
 * site_id is server-resolved (NOT user input); subjectId is user-supplied and
 * MUST be escaped (esc doubles quotes + escapes backslash) so it can only ever
 * be a string literal — never widen the delete via injection.
 */
export function buildDeleteCondition (siteId, subjectId) {
  if (!siteId || !subjectId) throw new Error('buildDeleteCondition: siteId and subjectId are required')
  return `site_id = '${esc(siteId)}' AND (distinct_id = '${esc(subjectId)}' OR visitor_id = '${esc(subjectId)}')`
}

async function countMatching ({ host, token, datasource, condition, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch
  const sql = `SELECT count() AS n FROM ${datasource} WHERE ${condition} FORMAT JSON`
  const url = `${String(host).replace(/\/$/, '')}/v0/sql?q=${encodeURIComponent(sql)}`
  const res = await doFetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`count query on ${datasource} responded ${res.status}`)
  const body = await res.json()
  return Number(body?.data?.[0]?.n) || 0
}

async function deleteByCondition ({ host, adminToken, datasource, condition, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch
  const url = `${String(host).replace(/\/$/, '')}/v0/datasources/${encodeURIComponent(datasource)}/delete`
  const res = await doFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `delete_condition=${encodeURIComponent(condition)}`,
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS)
  })
  if (!res.ok) throw new Error(`delete on ${datasource} responded ${res.status}`)
  // The delete API returns an async job descriptor; surface its id for audit.
  let jobId = null
  try {
    const body = await res.json()
    jobId = body?.job_id ?? body?.id ?? null
  } catch (_) { /* body optional — job id is best-effort audit metadata */ }
  return jobId
}

/**
 * Erase one subject from BOTH Tinybird datasources.
 *
 * @returns {Promise<object>} audit-ready result:
 *   { status, subjectId, siteId, datasources: [...], perDatasource: [
 *       { datasource, condition, matched, executed, jobId, error } ] }
 *   status ∈ 'skipped_not_configured' | 'skipped_no_admin_token' | 'dry_run'
 *            | 'executed' | 'failed'
 *   Never throws — failures are captured per-datasource and reflected in status
 *   so the caller can persist status='failed' for retry (never silent-swallow).
 */
export async function eraseSubjectFromTinybird ({
  host, adminToken, readToken, siteId, subjectId, confirm = false, fetchImpl,
  datasources = TINYBIRD_ERASURE_DATASOURCES
} = {}) {
  const base = { subjectId, siteId, datasources, perDatasource: [] }

  if (!host) {
    return { ...base, status: 'skipped_not_configured', reason: 'TINYBIRD_HOST not set — Tinybird erasure NOT performed' }
  }
  // Counting needs a read-capable token; deleting needs the admin token.
  const countToken = readToken || adminToken
  if (!countToken) {
    return { ...base, status: 'skipped_not_configured', reason: 'no Tinybird read/admin token — Tinybird erasure NOT performed' }
  }

  let condition
  try {
    condition = buildDeleteCondition(siteId, subjectId)
  } catch (err) {
    return { ...base, status: 'failed', reason: err.message }
  }

  const wantDelete = confirm === true
  // LOUD, audited admin-token gate: a confirmed erasure with no admin token
  // must be a visible skip, never a silent success.
  if (wantDelete && !adminToken) {
    return {
      ...base,
      status: 'skipped_no_admin_token',
      reason: 'TINYBIRD_ADMIN_TOKEN not configured — Tinybird erasure NOT performed (dry-run counts only below)',
      perDatasource: await Promise.all(datasources.map(async (ds) => {
        try {
          const matched = await countMatching({ host, token: countToken, datasource: ds, condition, fetchImpl })
          return { datasource: ds, condition, matched, executed: false, jobId: null, error: null }
        } catch (err) {
          return { datasource: ds, condition, matched: null, executed: false, jobId: null, error: err.message }
        }
      }))
    }
  }

  let anyError = false
  const perDatasource = []
  for (const ds of datasources) {
    try {
      const matched = await countMatching({ host, token: countToken, datasource: ds, condition, fetchImpl })
      if (!wantDelete) {
        perDatasource.push({ datasource: ds, condition, matched, executed: false, jobId: null, error: null })
        continue
      }
      const jobId = await deleteByCondition({ host, adminToken, datasource: ds, condition, fetchImpl })
      perDatasource.push({ datasource: ds, condition, matched, executed: true, jobId, error: null })
    } catch (err) {
      anyError = true
      perDatasource.push({ datasource: ds, condition, matched: null, executed: false, jobId: null, error: err.message })
    }
  }

  const status = anyError ? 'failed' : (wantDelete ? 'executed' : 'dry_run')
  return { ...base, status, perDatasource }
}

/**
 * Build the ClickHouse delete_condition for an ENTIRE site (all subjects on it).
 * site_id is server-resolved (NOT user input) but is still esc()'d for defence
 * in depth so it can only ever be a string literal. This is a BROAD delete
 * (potentially millions of rows) — see the module header on async job behaviour
 * + the per-workspace active-delete-job limit.
 */
export function buildSiteDeleteCondition (siteId) {
  if (!siteId) throw new Error('buildSiteDeleteCondition: siteId is required')
  return `site_id = '${esc(siteId)}'`
}

/**
 * Erase ALL data for one site from BOTH Tinybird datasources.
 *
 * Structural mirror of eraseSubjectFromTinybird — same safety posture (default
 * dry-run, confirm===true required to delete, LOUD admin-token gate, never
 * throws) — but the condition is the whole site (no subject).
 *
 * @returns {Promise<object>} audit-ready result:
 *   { status, siteId, datasources: [...], perDatasource: [
 *       { datasource, condition, matched, executed, jobId, error } ] }
 *   status ∈ 'skipped_not_configured' | 'skipped_no_admin_token' | 'dry_run'
 *            | 'executed' | 'failed'
 *   Never throws — failures are captured per-datasource and reflected in status
 *   so the caller can persist status='failed' for retry (never silent-swallow).
 */
export async function eraseSiteFromTinybird ({
  host, adminToken, readToken, siteId, confirm = false, fetchImpl,
  datasources = TINYBIRD_ERASURE_DATASOURCES
} = {}) {
  const base = { siteId, datasources, perDatasource: [] }

  if (!host) {
    return { ...base, status: 'skipped_not_configured', reason: 'TINYBIRD_HOST not set — Tinybird erasure NOT performed' }
  }
  // Counting needs a read-capable token; deleting needs the admin token.
  const countToken = readToken || adminToken
  if (!countToken) {
    return { ...base, status: 'skipped_not_configured', reason: 'no Tinybird read/admin token — Tinybird erasure NOT performed' }
  }

  let condition
  try {
    condition = buildSiteDeleteCondition(siteId)
  } catch (err) {
    return { ...base, status: 'failed', reason: err.message }
  }

  const wantDelete = confirm === true
  // LOUD, audited admin-token gate: a confirmed erasure with no admin token
  // must be a visible skip, never a silent success.
  if (wantDelete && !adminToken) {
    return {
      ...base,
      status: 'skipped_no_admin_token',
      reason: 'TINYBIRD_ADMIN_TOKEN not configured — Tinybird erasure NOT performed (dry-run counts only below)',
      perDatasource: await Promise.all(datasources.map(async (ds) => {
        try {
          const matched = await countMatching({ host, token: countToken, datasource: ds, condition, fetchImpl })
          return { datasource: ds, condition, matched, executed: false, jobId: null, error: null }
        } catch (err) {
          return { datasource: ds, condition, matched: null, executed: false, jobId: null, error: err.message }
        }
      }))
    }
  }

  let anyError = false
  const perDatasource = []
  for (const ds of datasources) {
    try {
      const matched = await countMatching({ host, token: countToken, datasource: ds, condition, fetchImpl })
      if (!wantDelete) {
        perDatasource.push({ datasource: ds, condition, matched, executed: false, jobId: null, error: null })
        continue
      }
      const jobId = await deleteByCondition({ host, adminToken, datasource: ds, condition, fetchImpl })
      perDatasource.push({ datasource: ds, condition, matched, executed: true, jobId, error: null })
    } catch (err) {
      anyError = true
      perDatasource.push({ datasource: ds, condition, matched: null, executed: false, jobId: null, error: err.message })
    }
  }

  const status = anyError ? 'failed' : (wantDelete ? 'executed' : 'dry_run')
  return { ...base, status, perDatasource }
}
