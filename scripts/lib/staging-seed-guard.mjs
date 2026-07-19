// scripts/lib/staging-seed-guard.mjs — the STAGING-ONLY write-target guard for the seed scripts.
//
// WHY THIS EXISTS: the old `assertStaging()` gated on POSTHOG_PROJECT_ID===469905 (DEAD post-D3) plus a
// hardcoded SITE_ID.startsWith('de200000') that is ALWAYS true. Neither looked at the ACTUAL write
// target: dualWriteEvent() sends to the Tinybird workspace the TINYBIRD_APPEND_TOKEN belongs to.
//
// WHAT DISTINGUISHES STAGING FROM PROD — decode the TOKEN, not the host. The `imubaid93` org has three
// workspaces: ST_Staging (STAGING, 3ad4c1a8-…), SourceTrack (PROD, 3c371bb9-…), imubaid93_workspace
// (neither). BOTH staging and prod are reachable at https://api.tinybird.co — Tinybird routes by TOKEN,
// not hostname — so a HOST string CANNOT tell them apart. (An earlier host-allowlist guard was both wrong
// on that premise AND allowlisted a malformed host, api.europe-west3.gcp.tinybird.co, that fails TLS and
// never worked — it has been deleted.) The token carries the workspace: a Tinybird token is
// `p.<base64url payload>` and the payload's "u" field is the workspace UUID. So the guard DECODES the
// append token's workspace and refuses unless it is exactly ST_Staging. Two layers, both fail-closed:
//   (1) assertStagingSeedTarget  — explicit --i-am-targeting-staging + de200000 site + the append token's
//       decoded workspace == ST_Staging. Fail-closed on an undecodable token, a missing "u", or any other
//       workspace (prod, imubaid93_workspace, …).
//   (2) assertStagingWorkspaceLive — LIVE: the target workspace must already HOLD the de200000 fixture
//       (prod SourceTrack has 0 — founder-validated). A belt on the read token.
// SECRET SAFETY: the token is NEVER printed, logged, or returned — only the decoded workspace UUID (not a
// secret) is surfaced.

import { esc } from '../../api/lib/utils.js'

// The ONLY staging workspace. A decoded append-token workspace must equal this or the guard refuses.
export const STAGING_WORKSPACE_ID = '3ad4c1a8-5605-4665-83dc-5b406a463032'

// Decode a Tinybird token → the workspace UUID in the payload's "u" field, or null if it cannot be
// decoded or carries no "u". Handles `p.<base64url payload>` and JWT-shaped tokens (scans each segment).
// Fail-closed: any error → null. NEVER logs or returns the token itself.
export function decodeTinybirdWorkspaceId (token) {
  const t = String(token || '')
  if (!t) return null
  for (const seg of t.split('.')) {
    if (!seg || seg.length < 8) continue // skip the 'p' prefix and other short segments
    try {
      const json = Buffer.from(seg, 'base64url').toString('utf8')
      if (!json.includes('"u"')) continue
      const payload = JSON.parse(json)
      if (payload && typeof payload.u === 'string' && payload.u) return payload.u
    } catch { /* not the payload segment — try the next */ }
  }
  return null
}

// PURE (no network). Decodes the append token's workspace and gates on it. Returns
// { ok:true, workspaceId } or { ok:false, reason }. NEVER returns or logs the token.
export function assertStagingSeedTarget ({ appendToken, siteId, targetingStaging }) {
  if (targetingStaging !== true) {
    return { ok: false, reason: 'REFUSING: pass --i-am-targeting-staging to confirm the write target is STAGING (explicit opt-in required — the seeder never assumes staging).' }
  }
  if (!String(siteId || '').startsWith('de200000')) {
    return { ok: false, reason: `REFUSING: SITE_ID ${siteId || '<unset>'} is not the de200000 staging fixture.` }
  }
  const workspaceId = decodeTinybirdWorkspaceId(appendToken)
  if (!workspaceId) {
    return { ok: false, reason: 'REFUSING (fail-closed): could not decode a workspace id from TINYBIRD_APPEND_TOKEN (missing, malformed, or no "u" field). Refusing to write without confirming the target workspace.' }
  }
  if (workspaceId !== STAGING_WORKSPACE_ID) {
    return { ok: false, reason: `REFUSING: TINYBIRD_APPEND_TOKEN targets workspace ${workspaceId}, not ST_Staging (${STAGING_WORKSPACE_ID}). A prod / other-workspace token is rejected here.` }
  }
  return { ok: true, workspaceId }
}

const normHost = (h) => String(h || '').trim().replace(/\/+$/, '').toLowerCase()

// LIVE probe — host (api.tinybird.co; routing is by token) + read token. Confirms the target workspace
// already HOLDS the de200000 fixture; prod SourceTrack has 0, so a prod token/workspace fails closed.
// Returns { ok, reason, count }.
export async function assertStagingWorkspaceLive ({ host, readToken, siteId, fetchImpl = fetch }) {
  if (!host || !readToken) {
    return { ok: false, reason: 'REFUSING (fail-closed): no TINYBIRD_HOST/TINYBIRD_READ_TOKEN — cannot confirm the target is the staging workspace.', count: null }
  }
  const q = `SELECT count() AS c FROM events WHERE site_id='${esc(siteId)}' FORMAT JSON`
  let count = null
  try {
    const res = await fetchImpl(`${normHost(host)}/v0/sql?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${readToken}` } })
    if (!res.ok) return { ok: false, reason: `REFUSING (fail-closed): staging-workspace probe returned HTTP ${res.status}.`, count }
    const body = await res.json()
    count = Number(body?.data?.[0]?.c) || 0
  } catch (e) {
    return { ok: false, reason: `REFUSING (fail-closed): staging-workspace probe errored (${e.message}).`, count }
  }
  if (count <= 0) {
    return { ok: false, reason: `REFUSING: target workspace has 0 events for the de200000 staging fixture — this is NOT ST_Staging (prod SourceTrack has no such site). Wrong workspace/token.`, count }
  }
  return { ok: true, count }
}
